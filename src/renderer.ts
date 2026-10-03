import type { CameraBasis } from './camera';
import { createProgram, createTarget, deleteTarget, type Program, type RenderTarget, type TargetFormat } from './gl';
import blurFrag from './shaders/blur.frag.glsl?raw';
import compositeFrag from './shaders/composite.frag.glsl?raw';
import downsampleFrag from './shaders/downsample.frag.glsl?raw';
import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import sceneFrag from './shaders/scene.frag.glsl?raw';

export class WebGL2UnavailableError extends Error {
  constructor() {
    super('WebGL 2 is not available');
    this.name = 'WebGL2UnavailableError';
  }
}

export interface FrameParams {
  time: number;
  camera: CameraBasis;
  disk: boolean;
  rel: number;
  temp: number;
  rout: number;
  exposure: number;
}

/** Inner disk edge: the innermost stable circular orbit, 3 r_s. */
const DISK_INNER_RADIUS = 3;
const BLOOM_LEVELS = 3;
const BLOOM_THRESHOLD = 1;
const BLOOM_STRENGTH = 0.55;
/** Without float render targets, radiance is stored divided by this in RGBA8. */
const LDR_HEADROOM = 6;
const MAX_DPR = 2;
const BASE_TAN_HALF_FOV = Math.tan(Math.PI / 6);

interface BloomLevel {
  main: RenderTarget;
  scratch: RenderTarget;
}

/** Scene pass (geodesic ray tracing) → three-level bloom → tone-mapped composite to the canvas. */
export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs: Record<'scene' | 'down' | 'blur' | 'composite', Program>;
  private readonly ldr: TargetFormat;
  private format: TargetFormat;
  private scene: RenderTarget | null = null;
  private bloom: BloomLevel[] = [];
  private tanHalfFov = BASE_TAN_HALF_FOV;
  private readonly canvas: HTMLCanvasElement;
  private scale: number;
  private readonly steps: number;

  constructor(canvas: HTMLCanvasElement, scale: number, steps: number) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new WebGL2UnavailableError();
    this.gl = gl;
    this.canvas = canvas;
    this.scale = scale;
    this.steps = steps;

    this.ldr = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    const floatTargets = gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float');
    this.format = floatTargets ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : this.ldr;

    this.programs = {
      scene: createProgram(gl, fullscreenVert, sceneFrag),
      down: createProgram(gl, fullscreenVert, downsampleFrag),
      blur: createProgram(gl, fullscreenVert, blurFrag),
      composite: createProgram(gl, fullscreenVert, compositeFrag),
    };
    gl.bindVertexArray(gl.createVertexArray());

    this.fitCanvas();
    this.buildTargets();
  }

  /** Factor between stored values and scene radiance. */
  private get hdr(): number {
    return this.format === this.ldr ? 1 / LDR_HEADROOM : 1;
  }

  resize(): void {
    if (this.fitCanvas()) this.buildTargets();
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.buildTargets();
  }

  render(p: FrameParams): void {
    const gl = this.gl;
    const scene = this.scene;
    if (!scene) return;
    const hdr = this.hdr;

    this.draw(this.programs.scene, scene, (u) => {
      gl.uniform2f(u('uRes'), scene.width, scene.height);
      gl.uniform1f(u('uTime'), p.time);
      gl.uniform3fv(u('uCamPos'), p.camera.position);
      gl.uniformMatrix3fv(u('uCamRot'), false, p.camera.rotation);
      gl.uniform1f(u('uTan'), this.tanHalfFov);
      gl.uniform1f(u('uDisk'), p.disk ? 1 : 0);
      gl.uniform1f(u('uRel'), p.rel);
      gl.uniform1f(u('uTemp'), p.temp);
      gl.uniform1f(u('uRin'), DISK_INNER_RADIUS);
      gl.uniform1f(u('uRout'), p.rout);
      gl.uniform1f(u('uHdr'), hdr);
      gl.uniform1i(u('uSteps'), this.steps);
    });

    // Each level downsamples the previous one (the first also thresholds), then blurs horizontally and vertically.
    let source = scene;
    for (const [i, { main, scratch }] of this.bloom.entries()) {
      const from = source;
      this.draw(this.programs.down, main, (u) => {
        this.bindTexture(u('uSrc'), 0, from.texture);
        gl.uniform2f(u('uTexel'), 1 / from.width, 1 / from.height);
        gl.uniform1f(u('uThresh'), i === 0 ? BLOOM_THRESHOLD : 0);
        gl.uniform1f(u('uHdrInv'), 1 / hdr);
      });
      this.draw(this.programs.blur, scratch, (u) => {
        this.bindTexture(u('uSrc'), 0, main.texture);
        gl.uniform2f(u('uDir'), 1 / main.width, 0);
      });
      this.draw(this.programs.blur, main, (u) => {
        this.bindTexture(u('uSrc'), 0, scratch.texture);
        gl.uniform2f(u('uDir'), 0, 1 / main.height);
      });
      source = main;
    }

    this.draw(this.programs.composite, null, (u) => {
      this.bindTexture(u('uScene'), 0, scene.texture);
      this.bloom.forEach(({ main }, i) => this.bindTexture(u(`uB${i + 1}`), i + 1, main.texture));
      gl.uniform1f(u('uHdrInv'), 1 / hdr);
      gl.uniform1f(u('uExposure'), p.exposure);
      gl.uniform1f(u('uBloom'), BLOOM_STRENGTH);
      gl.uniform1f(u('uTime'), p.time);
      gl.uniform2f(u('uRes'), this.canvas.width, this.canvas.height);
    });
  }

  /** Match the drawing buffer to the element; true when its size changed. */
  private fitCanvas(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    // portrait screens get a taller field of view so the disk still fits across
    this.tanHalfFov = BASE_TAN_HALF_FOV * Math.max(1, 0.85 / (w / h));
    if (w === this.canvas.width && h === this.canvas.height) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  private buildTargets(): void {
    const gl = this.gl;
    this.disposeTargets();

    const w = Math.max(2, Math.round(this.canvas.width * this.scale));
    const h = Math.max(2, Math.round(this.canvas.height * this.scale));
    let scene = createTarget(gl, w, h, this.format);
    if (!scene && this.format !== this.ldr) {
      this.format = this.ldr;
      scene = createTarget(gl, w, h, this.format);
    }
    if (!scene) throw new Error('Could not allocate the scene render target');
    this.scene = scene;

    let lw = w;
    let lh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      lw = Math.max(1, lw >> 1);
      lh = Math.max(1, lh >> 1);
      const main = createTarget(gl, lw, lh, this.format);
      const scratch = createTarget(gl, lw, lh, this.format);
      if (!main || !scratch) throw new Error('Could not allocate the bloom render targets');
      this.bloom.push({ main, scratch });
    }
  }

  private disposeTargets(): void {
    if (this.scene) deleteTarget(this.gl, this.scene);
    for (const { main, scratch } of this.bloom) {
      deleteTarget(this.gl, main);
      deleteTarget(this.gl, scratch);
    }
    this.scene = null;
    this.bloom = [];
  }

  private draw(program: Program, target: RenderTarget | null, setUniforms: (u: Program['uniform']) => void): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
    gl.useProgram(program.handle);
    setUniforms(program.uniform);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTexture(location: WebGLUniformLocation | null, unit: number, texture: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(location, unit);
  }
}

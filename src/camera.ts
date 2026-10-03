import type { View } from './presets';

const EL_MAX = 1.45; // stop short of the pole so the camera basis stays defined
const DIST_MIN = 3.5;
const DIST_MAX = 60;
const DRAG_RAD_PER_PX = 0.006;
const KEY_STEP_RAD = 0.08;
const KEY_ZOOM = 0.9;
const WHEEL_ZOOM = 0.0012;
const DAMPING_PER_S = 3.5;
const AUTO_ORBIT_RAD_PER_S = 0.035;
const AUTO_ORBIT_DELAY_MS = 2500;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface CameraBasis {
  /** Camera position, r_s. */
  readonly position: Float32Array;
  /** Column-major mat3: right, up, forward. */
  readonly rotation: Float32Array;
}

/** Orbits the hole at the origin; input moves a target view and the camera eases toward it. */
export class OrbitCamera {
  readonly current: View;
  private readonly target: View;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchSpan = 0;
  private lastInteraction = -Infinity;

  constructor(view: View) {
    this.current = { ...view };
    this.target = { ...view };
  }

  /** Glide to a view, taking the short way round in azimuth. */
  flyTo(view: View): void {
    this.target.az = this.current.az + wrapAngle(view.az - this.current.az);
    this.target.el = view.el;
    this.target.dist = view.dist;
  }

  jumpTo(view: View): void {
    Object.assign(this.current, view);
    Object.assign(this.target, view);
  }

  attach(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinchSpan = this.span();
      this.touch();
    });

    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.orbit(-dx * DRAG_RAD_PER_PX, dy * DRAG_RAD_PER_PX);
      } else if (this.pointers.size === 2) {
        const span = this.span();
        if (this.pinchSpan > 0) this.zoom(this.pinchSpan / span);
        this.pinchSpan = span;
      }
      this.touch();
    });

    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinchSpan = this.pointers.size === 2 ? this.span() : 0;
      this.touch();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * WHEEL_ZOOM));
      this.touch();
    }, { passive: false });

    el.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowLeft': this.orbit(KEY_STEP_RAD, 0); break;
        case 'ArrowRight': this.orbit(-KEY_STEP_RAD, 0); break;
        case 'ArrowUp': this.orbit(0, KEY_STEP_RAD); break;
        case 'ArrowDown': this.orbit(0, -KEY_STEP_RAD); break;
        case '+': case '=': this.zoom(KEY_ZOOM); break;
        case '-': case '_': this.zoom(1 / KEY_ZOOM); break;
        default: return;
      }
      e.preventDefault();
      this.touch();
    });
  }

  update(dt: number, now: number, autoOrbit: boolean): void {
    if (autoOrbit && this.pointers.size === 0 && now - this.lastInteraction > AUTO_ORBIT_DELAY_MS) {
      this.target.az += dt * AUTO_ORBIT_RAD_PER_S;
    }
    const k = 1 - Math.exp(-dt * DAMPING_PER_S);
    this.current.az += (this.target.az - this.current.az) * k;
    this.current.el += (this.target.el - this.current.el) * k;
    this.current.dist += (this.target.dist - this.current.dist) * k;
  }

  basis(): CameraBasis {
    const { az, el, dist } = this.current;
    const pos = [dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az)];
    const f = pos.map((c) => -c / dist);
    const rl = Math.hypot(f[0], f[2]) || 1;
    const r = [-f[2] / rl, 0, f[0] / rl]; // forward × world up
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { position: new Float32Array(pos), rotation: new Float32Array([...r, ...u, ...f]) };
  }

  private orbit(dAz: number, dEl: number): void {
    this.target.az += dAz;
    this.target.el = clamp(this.target.el + dEl, -EL_MAX, EL_MAX);
  }

  private zoom(factor: number): void {
    this.target.dist = clamp(this.target.dist * factor, DIST_MIN, DIST_MAX);
  }

  private span(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private touch(): void {
    this.lastInteraction = performance.now();
  }
}

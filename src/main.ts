import './styles.css';
import { OrbitCamera } from './camera';
import { DEFAULT_PRESET, PRESETS, type PresetName, type View } from './presets';
import { AdaptiveQuality } from './quality';
import { Renderer, WebGL2UnavailableError } from './renderer';
import type { SimState } from './state';
import { ControlPanel } from './ui';

/** State a claude.ai Artifact viewer carries across live updates of the page. */
interface Snapshot {
  state: SimState;
  view: View;
}

/** Live-update hook exposed by the claude.ai Artifact viewer; absent everywhere else. */
interface HotApi {
  ready?: (start: (data: Partial<Snapshot>) => void) => void;
  snapshot?: (capture: () => Snapshot) => void;
  data?: Partial<Snapshot>;
}

declare global {
  interface Window {
    claude?: { hot?: HotApi };
  }
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const initialScale = coarsePointer ? 0.45 : (window.devicePixelRatio || 1) > 1.5 ? 0.55 : 0.8;
const integrationSteps = coarsePointer ? 240 : 320;

const canvas = document.getElementById('sky') as HTMLCanvasElement;
const state: SimState = {
  temp: 8000,
  rel: 1,
  rout: 14,
  exposure: 1,
  disk: true,
  autorot: !reducedMotion,
  preset: DEFAULT_PRESET,
  fact: DEFAULT_PRESET,
};
const camera = new OrbitCamera(PRESETS[DEFAULT_PRESET].view);
const panel = new ControlPanel(state, applyPreset);
const hot = window.claude?.hot;

function applyPreset(name: PresetName): void {
  const { view, temp, rel, rout, exposure, disk } = PRESETS[name];
  Object.assign(state, { temp, rel, rout, exposure, disk, preset: name, fact: name });
  camera.flyTo(view);
  panel.sync();
}

function run(renderer: Renderer): void {
  const quality = new AdaptiveQuality(initialScale);
  let last = performance.now();
  let simTime = 0;
  let lastReadout = 0;

  const frame = (now: number) => {
    const ms = now - last;
    last = now;
    const dt = Math.min(ms, 100) / 1000;
    simTime += dt * (reducedMotion ? 0.35 : 1);

    camera.update(dt, now, state.autorot);
    if (quality.sample(ms, now)) renderer.setScale(quality.scale);
    renderer.resize();
    renderer.render({
      time: simTime,
      camera: camera.basis(),
      disk: state.disk,
      rel: state.rel,
      temp: state.temp,
      rout: state.rout,
      exposure: state.exposure,
    });

    if (now - lastReadout > 200) {
      panel.updateReadout({ view: camera.current, scale: quality.scale, fps: quality.fps });
      lastReadout = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function start(saved: Partial<Snapshot> = {}): void {
  if (saved.state && saved.view) {
    Object.assign(state, saved.state);
    camera.jumpTo(saved.view);
    panel.sync();
  } else {
    applyPreset(DEFAULT_PRESET);
    camera.jumpTo(PRESETS[DEFAULT_PRESET].view);
  }
  panel.updateReadout({ view: camera.current });
  hot?.snapshot?.(() => ({ state: { ...state }, view: { ...camera.current } }));
  camera.attach(canvas);

  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas, initialScale, integrationSteps);
  } catch (err) {
    console.error(err);
    panel.showFailure(err instanceof WebGL2UnavailableError ? 'no-webgl2' : 'shader');
    return;
  }
  run(renderer);
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});

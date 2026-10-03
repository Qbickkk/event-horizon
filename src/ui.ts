import { PRESETS, type PresetName, type View } from './presets';
import type { SimState } from './state';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

const fmt = (v: number, digits = 1) => v.toFixed(digits);

export type Failure = 'no-webgl2' | 'shader';

const FAILURE_COPY: Record<Failure, string> = {
  'no-webgl2': 'This browser lacks WebGL 2, so the simulation cannot start. Open the page in a recent version of Chrome, Safari or Firefox.',
  shader: 'The graphics card could not compile the simulation shader. Try another browser or device.',
};

export interface Readout {
  view: View;
  scale?: number;
  fps?: number;
}

/** Settings panel, title-plate fallback and the live readout in the corner. */
export class ControlPanel {
  private readonly inputs = {
    temp: byId<HTMLInputElement>('temp'),
    rel: byId<HTMLInputElement>('rel'),
    rout: byId<HTMLInputElement>('rout'),
    exposure: byId<HTMLInputElement>('exposure'),
    disk: byId<HTMLInputElement>('disk'),
    autorot: byId<HTMLInputElement>('autorot'),
  };
  private readonly outputs = {
    temp: byId<HTMLOutputElement>('temp-out'),
    rel: byId<HTMLOutputElement>('rel-out'),
    rout: byId<HTMLOutputElement>('rout-out'),
    exposure: byId<HTMLOutputElement>('exposure-out'),
  };
  private readonly readout = {
    box: byId<HTMLElement>('readout'),
    dist: byId<HTMLElement>('r-dist'),
    el: byId<HTMLElement>('r-el'),
    clock: byId<HTMLElement>('r-clock'),
    perf: byId<HTMLElement>('r-perf'),
  };
  private readonly fact = byId<HTMLElement>('fact');
  private readonly fallback = byId<HTMLElement>('fallback');
  private readonly panel = byId<HTMLElement>('panel');
  private readonly toggle = byId<HTMLButtonElement>('panel-toggle');
  private readonly presetButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  private readonly narrow = matchMedia('(max-width: 720px)');
  private readonly state: SimState;
  private panelOpen = false;

  constructor(state: SimState, onPreset: (name: PresetName) => void) {
    this.state = state;

    for (const button of this.presetButtons) {
      button.addEventListener('click', () => onPreset(button.dataset.preset as PresetName));
    }
    this.onInput(this.inputs.temp, (el) => { state.temp = Number(el.value); });
    this.onInput(this.inputs.rel, (el) => { state.rel = Number(el.value) / 100; });
    this.onInput(this.inputs.rout, (el) => { state.rout = Number(el.value); });
    this.onInput(this.inputs.exposure, (el) => { state.exposure = Number(el.value); });
    this.onInput(this.inputs.disk, (el) => { state.disk = el.checked; });
    this.inputs.autorot.addEventListener('change', () => { state.autorot = this.inputs.autorot.checked; });

    this.toggle.addEventListener('click', () => {
      this.panelOpen = !this.panelOpen;
      this.layout();
    });
    this.narrow.addEventListener('change', () => this.layout());
    this.layout();
  }

  /** Push state into the controls, their value labels and the preset explainer. */
  sync(): void {
    const s = this.state;
    const { temp, rel, rout, exposure, disk, autorot } = this.inputs;
    temp.value = String(s.temp);
    rel.value = String(Math.round(s.rel * 100));
    rout.value = String(s.rout);
    exposure.value = String(s.exposure);
    disk.checked = s.disk;
    autorot.checked = s.autorot;

    this.outputs.temp.textContent = `${Math.round(s.temp).toLocaleString('en-US')} K`;
    this.outputs.rel.textContent = `${Math.round(s.rel * 100)}%`;
    this.outputs.rout.innerHTML = `out to ${fmt(s.rout, s.rout % 1 ? 1 : 0)} r<sub>s</sub>`;
    this.outputs.exposure.textContent = fmt(s.exposure, 2);

    for (const button of this.presetButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.preset === s.preset));
    }
    this.fact.innerHTML = PRESETS[s.fact].fact;
  }

  updateReadout({ view, scale, fps }: Readout): void {
    this.readout.dist.textContent = fmt(view.dist);
    this.readout.el.textContent = `${fmt((view.el * 180) / Math.PI)}°`;
    // a static observer's clock runs slow by √(1 − r_s/r)
    this.readout.clock.textContent = `1 h = ${fmt(60 / Math.sqrt(1 - 1 / view.dist))} min far away`;
    this.readout.perf.textContent = scale === undefined || fps === undefined ? '—' : `${fmt(scale, 2)}× · ${Math.round(fps)} fps`;
  }

  showFailure(failure: Failure): void {
    this.fallback.textContent = FAILURE_COPY[failure];
    this.fallback.hidden = false;
    this.readout.box.hidden = true;
  }

  private onInput(el: HTMLInputElement, apply: (el: HTMLInputElement) => void): void {
    el.addEventListener('input', () => {
      apply(el);
      this.state.preset = null;
      this.sync();
    });
  }

  /** On phones the panel is a sheet behind the Settings button; on wider screens it is always open. */
  private layout(): void {
    this.panel.hidden = this.narrow.matches && !this.panelOpen;
    this.toggle.setAttribute('aria-expanded', String(!this.panel.hidden));
    this.toggle.textContent = this.panel.hidden ? 'Settings' : 'Hide';
  }
}

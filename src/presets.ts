export type PresetName = 'physical' | 'interstellar' | 'pole' | 'lens';

/** Orbit-camera position: azimuth and elevation in radians, distance in r_s. */
export interface View {
  az: number;
  el: number;
  dist: number;
}

export interface Preset {
  view: View;
  temp: number;
  rel: number;
  rout: number;
  exposure: number;
  disk: boolean;
  /** Explainer shown under the preset buttons; may contain <sub>. */
  fact: string;
}

export const DEFAULT_PRESET: PresetName = 'physical';

export const PRESETS: Record<PresetName, Preset> = {
  physical: {
    view: { az: 0.62, el: 0.12, dist: 19 },
    temp: 8000, rel: 1, rout: 14, exposure: 1, disk: true,
    fact: 'Gas at the inner edge of the disk moves at about half the speed of light. The side coming toward us looks brighter and bluer, while the receding side dims and reddens.',
  },
  interstellar: {
    view: { az: 0.62, el: 0.05, dist: 21 },
    temp: 5400, rel: 0, rout: 15, exposure: 0.9, disk: true,
    fact: 'As in Interstellar: Doppler shift and beaming are switched off, so the disk looks symmetric. The filmmakers left them out on purpose so the image would not confuse the audience.',
  },
  pole: {
    view: { az: 0.62, el: 1.38, dist: 20 },
    temp: 8000, rel: 1, rout: 14, exposure: 1, disk: true,
    fact: 'The shadow is 2.6 times wider than the horizon: any ray with an impact parameter below 2.6 r<sub>s</sub> falls in. The thin ring at the edge of the shadow is light that has wrapped around the hole.',
  },
  lens: {
    view: { az: 0.62, el: 0.2, dist: 12 },
    temp: 8000, rel: 1, rout: 14, exposure: 1.4, disk: false,
    fact: 'With the disk gone, pure gravitational lensing remains. Stars behind the hole stretch into arcs, and those directly behind it merge into an Einstein ring.',
  },
};

import type { PresetName } from './presets';

export interface SimState {
  /** Peak disk temperature, K. */
  temp: number;
  /** Mix of Doppler beaming and gravitational redshift, 0–1. */
  rel: number;
  /** Outer disk radius, r_s. */
  rout: number;
  exposure: number;
  disk: boolean;
  autorot: boolean;
  /** Preset whose button is lit; cleared once a parameter is tweaked by hand. */
  preset: PresetName | null;
  /** Preset whose explainer is showing; outlives `preset`. */
  fact: PresetName;
}

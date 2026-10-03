const MIN_SCALE = 0.3;
const SLOW_FRAME_MS = 24;
const FAST_FRAME_MS = 18;
const SETTLE_MS = 2000;
const ADJUST_INTERVAL_MS = 1200;
const PAUSE_MS = 250;
const NOMINAL_FRAME_MS = 16.7;

/** Trades render resolution for frame rate: steps down when frames run long, creeps back up while there is headroom. */
export class AdaptiveQuality {
  scale: number;
  private ema = NOMINAL_FRAME_MS;
  private maxScale = 1;
  private lastAdjust = 0;
  private readonly startedAt = performance.now();

  constructor(scale: number) {
    this.scale = scale;
  }

  get fps(): number {
    return 1000 / this.ema;
  }

  /** Feed one frame time; returns true when `scale` changed. */
  sample(frameMs: number, now: number): boolean {
    if (frameMs > PAUSE_MS) {
      // the tab was hidden; this gap says nothing about render cost
      this.ema = NOMINAL_FRAME_MS;
      this.lastAdjust = now;
      return false;
    }
    this.ema += (frameMs - this.ema) * 0.06;
    if (now - this.startedAt < SETTLE_MS || now - this.lastAdjust < ADJUST_INTERVAL_MS) return false;

    if (this.ema > SLOW_FRAME_MS && this.scale > MIN_SCALE) {
      this.maxScale = Math.max(MIN_SCALE, this.scale - 0.05);
      this.scale = Math.max(MIN_SCALE, this.scale - 0.1);
    } else if (this.ema < FAST_FRAME_MS && this.scale < this.maxScale - 1e-3) {
      this.scale = Math.min(this.maxScale, this.scale + 0.05);
    } else {
      return false;
    }
    this.lastAdjust = now;
    return true;
  }
}

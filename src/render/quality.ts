/**
 * How much to spend on a frame.
 *
 * A phone and a desktop are the same code and nowhere near the same budget,
 * and there is no reliable way to ask a browser how fast it is. So the tier
 * starts as a guess from what the device will admit to, and is then corrected
 * by what the frames actually cost.
 *
 * Corrections only ever go down. Stepping back up on a good second is how a
 * governor ends up oscillating between two tiers, which reads far worse than
 * simply staying at the lower one.
 */

export type Tier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: Tier;
  /** Capped separately from the device ratio: a 3x phone screen is not worth 3x the pixels. */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** How much geometry each player is built from. */
  detail: 'full' | 'low';
  /** Instanced specks per stand. */
  crowd: number;
}

const TIERS: Record<Tier, Omit<Quality, 'tier' | 'pixelRatio'>> = {
  high: { shadows: true, shadowMapSize: 2048, detail: 'full', crowd: 3400 },
  medium: { shadows: true, shadowMapSize: 1024, detail: 'full', crowd: 1600 },
  low: { shadows: false, shadowMapSize: 512, detail: 'low', crowd: 700 },
};

/** The most pixels worth drawing at each tier, whatever the screen claims. */
const MAX_PIXEL_RATIO: Record<Tier, number> = { high: 1.75, medium: 1.35, low: 1 };

export function settingsFor(tier: Tier, devicePixelRatio: number): Quality {
  return {
    tier,
    pixelRatio: Math.min(devicePixelRatio, MAX_PIXEL_RATIO[tier]),
    ...TIERS[tier],
  };
}

const ORDER: Tier[] = ['high', 'medium', 'low'];

export function lower(tier: Tier): Tier | null {
  const next = ORDER[ORDER.indexOf(tier) + 1];
  return next ?? null;
}

/**
 * The opening guess.
 *
 * Deliberately pessimistic about touch devices: a phone that turns out to have
 * headroom is corrected by nothing at all, whereas a phone started on 'high'
 * spends its first seconds stuttering before the governor catches it — and
 * those are the seconds someone decides whether the game is any good.
 */
export function guessTier(): Tier {
  if (typeof window === 'undefined') return 'medium';

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 820;

  if (coarse && small) return 'low';
  if (coarse || cores <= 4) return 'medium';
  return 'high';
}

/**
 * Watches frame times and asks for a step down when they stay bad.
 *
 * Judged on a median rather than a mean: one 300ms stall from a garbage
 * collection or a background tab is not a reason to drop everyone's quality,
 * and a mean lets a single frame like that decide.
 */
export class QualityGovernor {
  private readonly samples: number[] = [];
  private sinceChange = 0;
  private windowElapsed = 0;

  constructor(
    /** Frame times worse than this are the problem, in seconds. */
    private readonly budget = 1 / 45,
    /** How long a tier is left alone after a change, in seconds. */
    private readonly settle = 3,
    /** How long to watch before judging, in seconds. */
    private readonly window = 1.5,
    /** The fewest frames a median is worth taking from. */
    private readonly minimum = 6,
  ) {}

  /** Returns true when the frames have been bad for long enough to act. */
  sample(dt: number): boolean {
    this.sinceChange += dt;

    // The first frames of a match include shader compilation and texture
    // upload, which are one-off costs and not what the tier should be judged on.
    if (this.sinceChange < this.settle) return false;

    this.samples.push(dt);
    this.windowElapsed += dt;

    // The window is wall clock, not a frame count. Counting frames makes the
    // governor slowest to react on exactly the devices that need it soonest:
    // ninety frames is a second and a half at 60fps and three quarters of a
    // minute at two.
    if (this.windowElapsed < this.window || this.samples.length < this.minimum) return false;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.samples.length = 0;
    this.windowElapsed = 0;

    if (median <= this.budget) return false;

    this.sinceChange = 0;
    return true;
  }
}

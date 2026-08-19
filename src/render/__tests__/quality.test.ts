import { describe, expect, it } from 'vitest';
import { lower, QualityGovernor, settingsFor, type Tier } from '../quality';

describe('quality tiers', () => {
  it('spend less at each step down', () => {
    const high = settingsFor('high', 3);
    const medium = settingsFor('medium', 3);
    const low = settingsFor('low', 3);

    expect(medium.pixelRatio).toBeLessThan(high.pixelRatio);
    expect(low.pixelRatio).toBeLessThan(medium.pixelRatio);
    expect(medium.crowd).toBeLessThan(high.crowd);
    expect(low.crowd).toBeLessThan(medium.crowd);
    expect(low.shadows).toBe(false);
  });

  it('never draw more pixels than the screen has', () => {
    // A 1x screen on the high tier must not be scaled up to 1.75.
    for (const tier of ['high', 'medium', 'low'] as Tier[]) {
      expect(settingsFor(tier, 1).pixelRatio).toBe(1);
    }
  });

  it('cap a high-density screen rather than honouring it', () => {
    expect(settingsFor('high', 3).pixelRatio).toBeLessThan(3);
  });

  it('run out of steps at the bottom', () => {
    expect(lower('high')).toBe('medium');
    expect(lower('medium')).toBe('low');
    expect(lower('low')).toBeNull();
  });
});

describe('the governor', () => {
  /** Feeds n frames of a given cost and counts how often it asks to step down. */
  function run(governor: QualityGovernor, frameMs: number, frames: number): number {
    let asks = 0;
    for (let i = 0; i < frames; i += 1) if (governor.sample(frameMs / 1000)) asks += 1;
    return asks;
  }

  it('leaves a comfortable frame rate alone', () => {
    expect(run(new QualityGovernor(), 12, 1200)).toBe(0);
  });

  it('asks to step down when frames stay expensive', () => {
    expect(run(new QualityGovernor(), 40, 1200)).toBeGreaterThan(0);
  });

  it('ignores the first seconds, which are shader compilation', () => {
    // Two seconds of terrible frames at startup is a loading cost, not a tier.
    const governor = new QualityGovernor(1 / 45, 3);
    expect(run(governor, 200, 10)).toBe(0);
  });

  it('is not fooled by one stall', () => {
    // A single 400ms garbage collection should not drop everybody's quality;
    // a mean would let it, which is why this is judged on a median.
    const governor = new QualityGovernor();
    run(governor, 10, 200);
    let asks = 0;
    for (let i = 0; i < 200; i += 1) {
      const ms = i === 100 ? 400 : 10;
      if (governor.sample(ms / 1000)) asks += 1;
    }
    expect(asks).toBe(0);
  });

  it('reacts as quickly on a slow device as on a fast one', () => {
    // The window is wall clock, not a frame count: ninety frames is a second
    // and a half at 60fps and three quarters of a minute at two, which made
    // the governor slowest exactly where it was needed soonest.
    const secondsToFirstAsk = (frameMs: number) => {
      const governor = new QualityGovernor();
      let elapsed = 0;
      for (let i = 0; i < 20_000; i += 1) {
        elapsed += frameMs / 1000;
        if (governor.sample(frameMs / 1000)) return elapsed;
      }
      return Infinity;
    };

    const slow = secondsToFirstAsk(500); // two frames a second
    const fast = secondsToFirstAsk(40); // twenty-five
    expect(slow).toBeLessThan(8);
    expect(fast).toBeLessThan(8);
  });

  it('leaves a settling period between steps', () => {
    // Otherwise one bad patch takes high to low in three consecutive frames,
    // before the first step has had a chance to help.
    const governor = new QualityGovernor(1 / 45, 3);
    const gaps: number[] = [];
    let sinceLastAsk = 0;
    for (let i = 0; i < 600; i += 1) {
      sinceLastAsk += 0.06;
      if (governor.sample(0.06)) {
        gaps.push(sinceLastAsk);
        sinceLastAsk = 0;
      }
    }
    expect(gaps.length).toBeGreaterThan(1);
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThanOrEqual(3);
  });
});

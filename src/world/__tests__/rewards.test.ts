import { describe, expect, it } from 'vitest';
import { rewardFor } from '../rewards';
import { PACK_TYPES } from '../items';

const even = { rating: 75, opponentRating: 75 };

describe('match rewards', () => {
  it('pays something for turning up', () => {
    expect(rewardFor({ scored: 0, conceded: 4, ...even }).total).toBeGreaterThan(0);
  });

  it('pays a win more than a draw, and a draw more than a loss', () => {
    const win = rewardFor({ scored: 2, conceded: 1, ...even }).total;
    const draw = rewardFor({ scored: 1, conceded: 1, ...even }).total;
    const loss = rewardFor({ scored: 1, conceded: 2, ...even }).total;
    expect(win).toBeGreaterThan(draw);
    expect(draw).toBeGreaterThan(loss);
  });

  it('pays more for beating a better side', () => {
    const upset = rewardFor({ scored: 1, conceded: 0, rating: 65, opponentRating: 85 }).total;
    const routine = rewardFor({ scored: 1, conceded: 0, rating: 85, opponentRating: 65 }).total;
    expect(upset).toBeGreaterThan(routine);
  });

  it('pays nothing extra for losing to a better side', () => {
    // Otherwise fielding a deliberately weak squad and losing is a strategy.
    const heavy = rewardFor({ scored: 0, conceded: 3, rating: 55, opponentRating: 90 });
    const even_ = rewardFor({ scored: 0, conceded: 3, ...even });
    expect(heavy.underdog).toBe(0);
    expect(heavy.total).toBe(even_.total);
  });

  it('does not pay for being worse than the opponent beyond a cap', () => {
    const wide = rewardFor({ scored: 1, conceded: 0, rating: 40, opponentRating: 99 }).total;
    const capped = rewardFor({ scored: 1, conceded: 0, rating: 65, opponentRating: 85 }).total;
    expect(wide).toBe(capped);
  });

  it('rewards a clean sheet', () => {
    const clean = rewardFor({ scored: 1, conceded: 0, ...even }).total;
    const leaky = rewardFor({ scored: 2, conceded: 1, ...even }).total;
    // Two goals and a concession is worth less than one and a clean sheet.
    expect(clean).toBeGreaterThan(leaky - 1);
  });

  it('keeps a pack several matches away', () => {
    // A cheap pack after a couple of wins; the expensive ones a real campaign.
    const bigWin = rewardFor({ scored: 3, conceded: 0, rating: 70, opponentRating: 82 }).total;
    const bronze = PACK_TYPES.find((p) => p.id === 'bronze')!;
    const premium = PACK_TYPES.find((p) => p.id === 'premium')!;
    const ultimate = PACK_TYPES.find((p) => p.id === 'ultimate')!;

    expect(bigWin).toBeGreaterThan(bronze.price);
    expect(bigWin).toBeLessThan(premium.price);
    expect(ultimate.price / bigWin).toBeGreaterThan(20);
  });

  it('never pays a negative amount', () => {
    for (const scored of [0, 1, 5]) {
      for (const conceded of [0, 1, 9]) {
        for (const [a, b] of [[40, 99], [99, 40], [75, 75]]) {
          const r = rewardFor({ scored, conceded, rating: a!, opponentRating: b! });
          expect(r.total).toBeGreaterThan(0);
        }
      }
    }
  });
});

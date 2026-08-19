import { describe, expect, it } from 'vitest';
import { createMatch, step, NO_INTENT } from '../match';
import { generateWorld, matchSquad } from '@/world/generate';

/**
 * Balance regression.
 *
 * These are stochastic properties, so the bounds are deliberately wide — wide
 * enough not to flake, tight enough to catch the failure modes this actually
 * had: 0.3 goals a match when only one side attacked, and 27 when both did but
 * nobody kept goal.
 */

const world = generateWorld('balance');
const ids = world.leagues[0]!.clubIds;
const MATCHES = 24;

function season() {
  let goals = 0;
  let shots = 0;
  let saves = 0;
  let homeWins = 0;
  let awayWins = 0;
  let homeShots = 0;
  let awayShots = 0;
  let corners = 0;
  let fouls = 0;
  let restarts = 0;
  let offsides = 0;
  let subs = 0;

  for (let m = 0; m < MATCHES; m += 1) {
    const home = matchSquad(world.clubs[ids[m % ids.length]!]!);
    const away = matchSquad(world.clubs[ids[(m + 7) % ids.length]!]!);
    const state = createMatch(home, away, { halfLength: 6 });
    for (let i = 0; i < 60 * 60 * 14; i += 1) {
      step(state, NO_INTENT);
      if (state.phase === 'fulltime') break;
    }
    goals += state.score[0] + state.score[1];
    shots += state.shots[0] + state.shots[1];
    homeShots += state.shots[0];
    awayShots += state.shots[1];
    corners += state.corners[0] + state.corners[1];
    fouls += state.fouls[0] + state.fouls[1];
    offsides += state.offsides[0] + state.offsides[1];
    subs += state.subsUsed[0] + state.subsUsed[1];
    restarts += state.events.filter((e) =>
      ['throwIn', 'corner', 'goalKick', 'freeKick', 'penalty'].includes(e.type),
    ).length;
    saves += state.saves[0] + state.saves[1];
    if (state.score[0] > state.score[1]) homeWins += 1;
    if (state.score[1] > state.score[0]) awayWins += 1;
  }

  return {
    goalsPerMatch: goals / MATCHES,
    shotsPerMatch: shots / MATCHES,
    savesPerMatch: saves / MATCHES,
    conversion: goals / Math.max(1, shots),
    homeWins,
    awayWins,
    homeShots,
    awayShots,
    cornersPerMatch: corners / MATCHES,
    offsidesPerMatch: offsides / MATCHES,
    subsPerMatch: subs / MATCHES,
    foulsPerMatch: fouls / MATCHES,
    restartsPerMatch: restarts / MATCHES,
  };
}

describe('match balance', () => {
  const stats = season();

  it('scores a plausible number of goals', () => {
    // Real football sits near 2.7; football games run a little higher on
    // purpose. Anything outside this band is a broken simulation, not a style.
    expect(stats.goalsPerMatch).toBeGreaterThan(1.5);
    expect(stats.goalsPerMatch).toBeLessThan(7);
  });

  it('takes a plausible number of shots', () => {
    expect(stats.shotsPerMatch).toBeGreaterThan(12);
    expect(stats.shotsPerMatch).toBeLessThan(55);
  });

  it('converts at roughly the rate football does', () => {
    expect(stats.conversion).toBeGreaterThan(0.04);
    expect(stats.conversion).toBeLessThan(0.30);
  });

  it('stops play for the ball going out', () => {
    // Throw-ins, goal kicks and corners. A match with none of them means the
    // ball is bouncing off invisible walls, which is what this replaced.
    expect(stats.restartsPerMatch).toBeGreaterThan(8);
  });

  it('awards corners', () => {
    expect(stats.cornersPerMatch).toBeGreaterThan(0.2);
  });

  it('awards fouls', () => {
    expect(stats.foulsPerMatch).toBeGreaterThan(0.5);
  });

  it('calls offside', () => {
    // Zero here means the off-ball model has stopped making runs beyond the
    // last defender, which is what makes the law reachable at all.
    expect(stats.offsidesPerMatch).toBeGreaterThan(0.2);
    expect(stats.offsidesPerMatch).toBeLessThan(8);
  });

  it('makes substitutions', () => {
    expect(stats.subsPerMatch).toBeGreaterThan(0.5);
    expect(stats.subsPerMatch).toBeLessThanOrEqual(6);
  });

  it('makes the goalkeeper matter', () => {
    expect(stats.savesPerMatch).toBeGreaterThan(1);
  });

  it('lets both sides win', () => {
    // Neither end of the pitch should be systematically easier to score at.
    // This caught two real asymmetries: both keepers standing at the same end,
    // and the user's team freezing whenever it won the ball because the
    // controlled player had no input driving it.
    expect(stats.homeWins).toBeGreaterThan(0);
    expect(stats.awayWins).toBeGreaterThan(0);
  });

  it('splits shots evenly between the two ends', () => {
    const share = stats.homeShots / Math.max(1, stats.homeShots + stats.awayShots);
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
  });
});

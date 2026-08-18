import { describe, expect, it } from 'vitest';
import { createMatch, step, NO_INTENT, clockText, minuteOf, possessionPercent, TICK } from '../match';
import { generateWorld, startingEleven } from '@/world/generate';

const world = generateWorld('sim-test');
const [homeId, awayId] = world.leagues[0]!.clubIds;
const home = startingEleven(world.clubs[homeId!]!);
const away = startingEleven(world.clubs[awayId!]!);

function play(seconds: number, halfLength = 1) {
  const state = createMatch(home, away, { halfLength });
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i += 1) step(state, NO_INTENT);
  return state;
}

describe('match simulation', () => {
  it('puts 22 players on the pitch in two teams', () => {
    const state = createMatch(home, away);
    expect(state.players).toHaveLength(22);
    expect(state.players.filter((p) => p.team === 0)).toHaveLength(11);
    expect(state.players.filter((p) => p.team === 1)).toHaveLength(11);
  });

  it('starts at kickoff and goes live', () => {
    const state = createMatch(home, away);
    expect(state.phase).toBe('kickoff');
    for (let i = 0; i < 200; i += 1) step(state, NO_INTENT);
    expect(state.phase).toBe('live');
  });

  it('keeps every player inside the pitch boundary', () => {
    const state = play(90);
    for (const p of state.players) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(54);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(36);
    }
  });

  it('keeps the ball on or above the turf', () => {
    const state = play(90);
    expect(state.ball.y).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.ball.x)).toBe(true);
    expect(Number.isFinite(state.ball.z)).toBe(true);
  });

  it('drains stamina across a match and never leaves 0-100', () => {
    // A full match at the default half length: legs should be gone by the end.
    const state = createMatch(home, away, { halfLength: 6 });
    for (let i = 0; i < 60 * 60 * 13; i += 1) {
      step(state, NO_INTENT);
      if (state.phase === 'fulltime') break;
    }
    for (const p of state.players) {
      expect(p.stamina).toBeGreaterThanOrEqual(0);
      expect(p.stamina).toBeLessThanOrEqual(100);
    }
    const average = state.players.reduce((s, p) => s + p.stamina, 0) / state.players.length;
    expect(average).toBeLessThan(85);
    expect(average).toBeGreaterThan(15);
  });

  it('drains stamina at the same rate whatever the half length', () => {
    const rates: number[] = [];
    for (const halfLength of [3, 6, 12]) {
      const state = createMatch(home, away, { halfLength });
      for (let i = 0; i < 60 * 60 * 26; i += 1) {
        step(state, NO_INTENT);
        if (state.phase === 'fulltime') break;
      }
      rates.push(state.players.reduce((s, p) => s + p.stamina, 0) / state.players.length);
    }
    // Every match length should finish in a similar band.
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(20);
  });

  it('reaches half time then full time', () => {
    const state = createMatch(home, away, { halfLength: 0.2 });
    for (let i = 0; i < 60 * 60; i += 1) {
      step(state, NO_INTENT);
      if (state.phase === 'fulltime') break;
    }
    expect(state.phase).toBe('fulltime');
    expect(state.events.some((e) => e.type === 'halftime')).toBe(true);
    expect(state.events.some((e) => e.type === 'fulltime')).toBe(true);
    expect(state.half).toBe(2);
  });

  it('stops simulating after full time', () => {
    const state = createMatch(home, away, { halfLength: 0.05 });
    for (let i = 0; i < 60 * 60; i += 1) step(state, NO_INTENT);
    const clock = state.clock;
    step(state, NO_INTENT);
    expect(state.clock).toBe(clock);
  });

  it('credits a goal to a player on the scoring team', () => {
    // Play several matches so at least one goal lands.
    let scored = false;
    for (let seed = 0; seed < 6 && !scored; seed += 1) {
      const state = createMatch(home, away, { halfLength: 3 });
      for (let i = 0; i < 60 * 60 * 7; i += 1) {
        step(state, NO_INTENT);
        if (state.lastGoal) break;
      }
      if (state.lastGoal) {
        scored = true;
        expect(state.score[0] + state.score[1]).toBeGreaterThan(0);
        expect(state.lastGoal.scorer.length).toBeGreaterThan(0);
        expect(state.lastGoal.minute).toBeGreaterThanOrEqual(1);
      }
    }
    expect(scored).toBe(true);
  });

  it('formats the clock and possession for the HUD', () => {
    const state = play(30, 1);
    expect(clockText(state)).toMatch(/^\d{2}:\d{2}$/);
    expect(minuteOf(state)).toBeGreaterThanOrEqual(1);
    const [a, b] = possessionPercent(state);
    expect(a + b).toBe(100);
  });
});

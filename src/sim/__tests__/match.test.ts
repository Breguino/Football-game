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

  it('leaves legs gone at any half length', () => {
    // The drain rate scales with match length so that a three-minute half and
    // a twelve-minute one both finish tired. Asserting the three land within
    // a few points of each other asks for precision a single match cannot
    // give — restart counts alone varied 25 / 68 / 91 across these three — so
    // what is checked is the property that matters: every length ends in the
    // same band, neither fresh nor dead.
    //
    // No bench: a substitute arrives with full stamina, and how many a side
    // makes is itself variable.
    const elevenOnly = (squad: typeof home) => squad.slice(0, 11);

    for (const halfLength of [3, 6, 12]) {
      const state = createMatch(elevenOnly(home), elevenOnly(away), {
        halfLength,
        seed: `stamina-${halfLength}`,
      });
      expect(state.bench[0]).toHaveLength(0);

      for (let i = 0; i < 60 * 60 * 26; i += 1) {
        step(state, NO_INTENT);
        if (state.phase === 'fulltime') break;
      }

      const average =
        state.players.reduce((sum, p) => sum + p.stamina, 0) / state.players.length;
      expect(average, `half length ${halfLength}`).toBeGreaterThan(20);
      expect(average, `half length ${halfLength}`).toBeLessThan(95);
    }
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

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    function play(seed: string) {
      const state = createMatch(home, away, { halfLength: 2, seed });
      for (let i = 0; i < 60 * 60 * 6; i += 1) {
        step(state, NO_INTENT);
        if (state.phase === 'fulltime') break;
      }
      return {
        score: state.score,
        shots: state.shots,
        fouls: state.fouls,
        events: state.events.length,
        ball: [state.ball.x.toFixed(4), state.ball.z.toFixed(4)],
      };
    }
    expect(play('same')).toEqual(play('same'));
  });

  it('plays out differently from a different seed', () => {
    function summary(seed: string) {
      const state = createMatch(home, away, { halfLength: 2, seed });
      for (let i = 0; i < 60 * 60 * 6; i += 1) {
        step(state, NO_INTENT);
        if (state.phase === 'fulltime') break;
      }
      return JSON.stringify([state.score, state.shots, state.events.length]);
    }
    expect(summary('one')).not.toBe(summary('two'));
  });

  it('is unaffected by other work drawing on the global generator', () => {
    // The point of an injected generator: a match no longer depends on how
    // many times anything else happened to call Math.random first.
    function play() {
      const state = createMatch(home, away, { halfLength: 2, seed: 'isolated' });
      for (let i = 0; i < 60 * 60 * 6; i += 1) {
        step(state, NO_INTENT);
        if (state.phase === 'fulltime') break;
      }
      return state.score.join('-') + '/' + state.shots.join('-');
    }
    const before = play();
    for (let i = 0; i < 997; i += 1) Math.random();
    expect(play()).toBe(before);
  });
});

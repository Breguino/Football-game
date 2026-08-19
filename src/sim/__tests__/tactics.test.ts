import { describe, expect, it } from 'vitest';
import { createMatch, step, NO_INTENT } from '../match';
import { defensiveLine, MENTALITIES, MENTALITY_LABEL, shapeFor } from '../ai';
import { createBall } from '../ball';
import { generateWorld, matchSquad } from '@/world/generate';

const world = generateWorld('tactics-test');
const ids = world.leagues[0]!.clubIds;
const home = matchSquad(world.clubs[ids[0]!]!);
const away = matchSquad(world.clubs[ids[4]!]!);

function live(seed = 'tactics') {
  const state = createMatch(home, away, { halfLength: 6, seed });
  for (let i = 0; i < 4000 && state.phase !== 'live'; i += 1) step(state, NO_INTENT);
  return state;
}

describe('mentalities', () => {
  it('run from defensive to all-out, in order', () => {
    expect(MENTALITIES).toEqual(['defensive', 'balanced', 'attacking', 'allOut']);
    for (const m of MENTALITIES) expect(MENTALITY_LABEL[m]).toBeTruthy();
  });

  it('commit progressively more the further up the scale', () => {
    const shapes = MENTALITIES.map(shapeFor);
    for (let i = 1; i < shapes.length; i += 1) {
      expect(shapes[i]!.squeeze).toBeGreaterThan(shapes[i - 1]!.squeeze);
      expect(shapes[i]!.push).toBeGreaterThan(shapes[i - 1]!.push);
    }
  });

  it('hold a higher line the more attacking the setup', () => {
    const state = live();
    const ball = createBall();
    const lines = MENTALITIES.map((m) => defensiveLine(state.players, 0, ball, true, m));
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i]!).toBeGreaterThanOrEqual(lines[i - 1]!);
    }
    expect(lines[3]!).toBeGreaterThan(lines[0]!);
  });
});

describe('changing shape mid-match', () => {
  it('steps up when the player asks for it', () => {
    const state = live();
    expect(state.mentality[0]).toBe('balanced');
    step(state, { ...NO_INTENT, tacticShift: 1 });
    expect(state.mentality[0]).toBe('attacking');
    step(state, { ...NO_INTENT, tacticShift: 1 });
    expect(state.mentality[0]).toBe('allOut');
  });

  it('steps down, and clamps at each end', () => {
    const state = live();
    for (let i = 0; i < 5; i += 1) step(state, { ...NO_INTENT, tacticShift: -1 });
    expect(state.mentality[0]).toBe('defensive');
    for (let i = 0; i < 8; i += 1) step(state, { ...NO_INTENT, tacticShift: 1 });
    expect(state.mentality[0]).toBe('allOut');
  });

  it('tells the player what it changed to', () => {
    const state = live();
    step(state, { ...NO_INTENT, tacticShift: 1 });
    expect(state.decision?.text).toBe('Tactics');
    expect(state.decision?.detail).toBe(MENTALITY_LABEL.attacking);
  });

  it('does not touch the opponent', () => {
    const state = live();
    const before = state.mentality[1];
    step(state, { ...NO_INTENT, tacticShift: 1 });
    expect(state.mentality[1]).toBe(before);
  });
});

describe('the opposition manager', () => {
  it('chases the game when losing late', () => {
    const state = live();
    state.score = [3, 0];
    state.clock = state.halfLength * 2 * 0.85;
    step(state, NO_INTENT);
    expect(state.mentality[1]).toBe('allOut');
  });

  it('shuts up shop when winning late', () => {
    const state = live();
    state.score = [0, 2];
    state.clock = state.halfLength * 2 * 0.85;
    step(state, NO_INTENT);
    expect(state.mentality[1]).toBe('defensive');
  });

  it('stays balanced in a tight game', () => {
    const state = live();
    state.score = [1, 1];
    state.clock = state.halfLength * 2 * 0.5;
    step(state, NO_INTENT);
    expect(state.mentality[1]).toBe('balanced');
  });
});

describe('blocked shots', () => {
  it('happen, and give the ball to nobody', () => {
    const state = createMatch(home, away, { halfLength: 6, seed: 'blocks' });
    for (let i = 0; i < 60 * 60 * 14; i += 1) {
      step(state, NO_INTENT);
      if (state.phase === 'fulltime') break;
    }
    expect(state.blocks[0] + state.blocks[1]).toBeGreaterThan(0);
  });

  it('produce corners over the course of a match', () => {
    let corners = 0;
    for (let m = 0; m < 6; m += 1) {
      const state = createMatch(home, away, { halfLength: 6, seed: `corner-${m}` });
      for (let i = 0; i < 60 * 60 * 14; i += 1) {
        step(state, NO_INTENT);
        if (state.phase === 'fulltime') break;
      }
      corners += state.corners[0] + state.corners[1];
    }
    expect(corners).toBeGreaterThan(0);
  });
});

describe('changing shape while the ball is dead', () => {
  it('works during a stoppage, which is when a manager would do it', () => {
    const state = createMatch(home, away, { halfLength: 6, seed: 'stoppage' });
    // Kick-off is a stopped phase; the change must still land.
    expect(state.phase).not.toBe('live');
    step(state, { ...NO_INTENT, tacticShift: 1 });
    expect(state.mentality[0]).toBe('attacking');
  });

  it('works during a restart', () => {
    const state = createMatch(home, away, { halfLength: 6, seed: 'restart-tactics' });
    for (let i = 0; i < 60 * 60 * 12 && state.phase !== 'restart'; i += 1) step(state, NO_INTENT);
    expect(state.phase).toBe('restart');
    const before = state.mentality[0];
    step(state, { ...NO_INTENT, tacticShift: -1 });
    expect(state.mentality[0]).not.toBe(before);
  });
});

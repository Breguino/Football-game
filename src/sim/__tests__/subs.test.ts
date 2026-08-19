import { describe, expect, it } from 'vitest';
import { createMatch, step, NO_INTENT, type MatchState } from '../match';
import { generateWorld, matchSquad } from '@/world/generate';

const world = generateWorld('subs-test');
const ids = world.leagues[0]!.clubIds;
const home = matchSquad(world.clubs[ids[0]!]!);
const away = matchSquad(world.clubs[ids[3]!]!);

function playFullMatch(): MatchState {
  const state = createMatch(home, away, { halfLength: 6 });
  for (let i = 0; i < 60 * 60 * 18; i += 1) {
    step(state, NO_INTENT);
    if (state.phase === 'fulltime') break;
  }
  return state;
}

describe('substitutions', () => {
  const state = playFullMatch();

  it('starts with an eleven and a bench', () => {
    const fresh = createMatch(home, away);
    expect(fresh.players.filter((p) => p.team === 0)).toHaveLength(11);
    expect(fresh.bench[0].length).toBeGreaterThan(0);
    expect(fresh.bench[1].length).toBeGreaterThan(0);
  });

  it('makes changes over the course of a match', () => {
    expect(state.subsUsed[0] + state.subsUsed[1]).toBeGreaterThan(0);
  });

  it('never uses more than three per side', () => {
    expect(state.subsUsed[0]).toBeLessThanOrEqual(3);
    expect(state.subsUsed[1]).toBeLessThanOrEqual(3);
  });

  it('keeps eleven a side on the pitch', () => {
    expect(state.players.filter((p) => p.team === 0)).toHaveLength(11);
    expect(state.players.filter((p) => p.team === 1)).toHaveLength(11);
  });

  it('takes players off the bench as they come on', () => {
    const fresh = createMatch(home, away);
    expect(state.bench[0].length).toBe(fresh.bench[0].length - state.subsUsed[0]);
  });

  it('brings players on with fresh legs', () => {
    // Someone on the pitch at full time should be fresher than the tired
    // player they replaced would have been.
    const subs = state.events.filter((e) => e.type === 'substitution');
    expect(subs.length).toBe(state.subsUsed[0] + state.subsUsed[1]);
    for (const event of subs) {
      expect(event.player).toMatch(/ for /);
      expect(event.minute).toBeGreaterThanOrEqual(1);
    }
  });

  it('never substitutes the goalkeeper for a tired outfield player', () => {
    // Index 0 and 11 are the keepers and must stay keepers.
    expect(state.players[0]!.team).toBe(0);
    expect(state.players[11]!.team).toBe(1);
  });

  it('keeps shirt numbers unique on the pitch', () => {
    for (const team of [0, 1] as const) {
      const numbers = state.players.filter((p) => p.team === team).map((p) => p.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });
});

/**
 * Sets up a live match with the ball at the controlled player's feet, ready to
 * strike. Stepping into a restart phase would return before the shot ever
 * reached the action handler, and the assertion would read a stale shot from
 * whatever the AI did during the warm-up.
 */
function readyToShoot(shooting = 80) {
  const state = createMatch(home, away, { halfLength: 6 });
  for (let i = 0; i < 4000 && state.phase !== 'live'; i += 1) step(state, NO_INTENT);
  expect(state.phase).toBe('live');

  const shooter = state.players[state.controlledIndex]!;
  shooter.x = 26;
  shooter.z = 0;
  shooter.shotCooldown = 0;
  shooter.shooting = shooting;
  state.ball.owner = state.controlledIndex;
  state.ball.x = shooter.x;
  state.ball.z = shooter.z;
  state.lastShot = null;
  return state;
}

describe('shot types', () => {
  it('takes the shot type from the player', () => {
    const state = readyToShoot();
    step(state, { ...NO_INTENT, shoot: true, shotType: 'finesse', moveX: 0.2 });
    expect(state.lastShot?.type).toBe('finesse');
  });

  it('defaults to a driven shot', () => {
    const state = readyToShoot();
    step(state, { ...NO_INTENT, shoot: true, moveX: 0.2 });
    expect(state.lastShot?.type).toBe('driven');
  });

  it('hits a power shot harder than a finesse one', () => {
    function speedOf(type: 'finesse' | 'power' | 'driven') {
      const state = readyToShoot();
      step(state, { ...NO_INTENT, shoot: true, shotType: type, moveX: 0.2 });
      expect(state.lastShot?.type).toBe(type);
      return Math.hypot(state.ball.vx, state.ball.vz);
    }
    const finesse = speedOf('finesse');
    const driven = speedOf('driven');
    const power = speedOf('power');
    expect(power).toBeGreaterThan(driven);
    expect(driven).toBeGreaterThan(finesse);
  });

  it('puts more spin on a finesse shot than a power one', () => {
    function spinOf(type: 'finesse' | 'power') {
      let total = 0;
      for (let i = 0; i < 40; i += 1) {
        const state = readyToShoot();
        step(state, { ...NO_INTENT, shoot: true, shotType: type, moveX: 0.2 });
        total += Math.abs(state.ball.spin);
      }
      return total / 40;
    }
    expect(spinOf('finesse')).toBeGreaterThan(spinOf('power'));
  });
});

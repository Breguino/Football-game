import { describe, expect, it } from 'vitest';
import { attackDir, defensiveLine, lastDefenderX, offBallTarget, ROLES } from '../ai';
import { createBall } from '../ball';
import { createMatch, step, NO_INTENT, type SimPlayer } from '../match';
import { generateWorld, matchSquad } from '@/world/generate';
import { isOffside } from '../rules';

const world = generateWorld('ai-test');
const ids = world.leagues[0]!.clubIds;
const home = matchSquad(world.clubs[ids[0]!]!);
const away = matchSquad(world.clubs[ids[1]!]!);

function freshMatch() {
  return createMatch(home, away, { halfLength: 6 });
}

describe('attacking direction', () => {
  it('sends the two sides opposite ways', () => {
    expect(attackDir(0)).toBe(1);
    expect(attackDir(1)).toBe(-1);
  });
});

describe('the defensive line', () => {
  const state = freshMatch();

  it('steps up when the side has the ball', () => {
    const ball = createBall();
    ball.x = 0;
    const withBall = defensiveLine(state.players, 0, ball, true);
    const without = defensiveLine(state.players, 0, ball, false);
    expect(withBall).toBeGreaterThan(without);
  });

  it('never pushes beyond the ball', () => {
    const ball = createBall();
    ball.x = -30;
    const line = defensiveLine(state.players, 0, ball, true);
    expect(line).toBeLessThanOrEqual(ball.x + 8.001);
  });

  it('never drops inside its own six-yard box', () => {
    const ball = createBall();
    ball.x = -52;
    expect(defensiveLine(state.players, 0, ball, false)).toBeGreaterThan(-50);
  });

  it('mirrors for the other team', () => {
    const ball = createBall();
    const a = defensiveLine(state.players, 0, ball, true);
    const b = defensiveLine(state.players, 1, ball, true);
    expect(Math.sign(a)).toBe(-Math.sign(b));
  });
});

describe('the last defender reference', () => {
  it('is the second-deepest opponent, not the keeper', () => {
    const state = freshMatch();
    // Team 1's keeper is deepest at +x; the reference should be the defender.
    const reference = lastDefenderX(state.players, 0);
    const opponents = state.players.filter((p) => p.team === 1).map((p) => p.x);
    const deepest = Math.max(...opponents);
    expect(reference).toBeLessThan(deepest);
  });
});

describe('off-ball targets', () => {
  const state = freshMatch();
  const ball = createBall();

  function targetFor(player: SimPlayer, hasPossession: boolean) {
    return offBallTarget(player, {
      players: state.players,
      ball,
      owner: null,
      hasPossession,
      line: defensiveLine(state.players, player.team, ball, hasPossession),
      isPresser: false,
      settle: { x: ball.x, z: ball.z },
      mentality: 'balanced',
    });
  }

  it('sends the presser at the ball', () => {
    const player = state.players[5]!;
    const target = offBallTarget(player, {
      players: state.players,
      ball,
      owner: null,
      hasPossession: false,
      line: 0,
      isPresser: true,
      settle: { x: 12, z: -7 },
      mentality: 'balanced',
    });
    expect(target).toMatchObject({ x: 12, z: -7, urgency: 1 });
  });

  it('puts forwards ahead of defenders in possession', () => {
    const striker = state.players.find((p) => p.team === 0 && ROLES[p.slot] === 'striker')!;
    const centreBack = state.players.find((p) => p.team === 0 && ROLES[p.slot] === 'centreBack')!;
    expect(targetFor(striker, true).x).toBeGreaterThan(targetFor(centreBack, true).x);
  });

  it('drops the whole side deeper without the ball', () => {
    const midfielder = state.players.find((p) => p.team === 0 && ROLES[p.slot] === 'midfield')!;
    expect(targetFor(midfielder, false).x).toBeLessThan(targetFor(midfielder, true).x);
  });

  it('keeps every target on the pitch', () => {
    for (const player of state.players) {
      for (const possession of [true, false]) {
        const target = targetFor(player, possession);
        expect(Math.abs(target.x)).toBeLessThanOrEqual(52.5);
        expect(Math.abs(target.z)).toBeLessThanOrEqual(34);
      }
    }
  });
});

describe('runs in behind', () => {
  it('put attackers into offside positions, which the old static shape never did', () => {
    // The point of the off-ball model: it creates the situations the offside
    // law exists to police. With a shape that only slid sideways, no player
    // ever went beyond the last defender and the law never fired.
    const state = freshMatch();
    let seen = 0;
    for (let i = 0; i < 60 * 400; i += 1) {
      step(state, NO_INTENT);
      if (i % 30 !== 0) continue;
      for (const p of state.players) {
        const passer = state.players.find((q) => q.team === p.team && q !== p);
        if (passer && isOffside(p, passer, state.players, state.ball.x)) {
          seen += 1;
          break;
        }
      }
      if (seen > 3) break;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

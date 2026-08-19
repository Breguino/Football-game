import { describe, expect, it } from 'vitest';
import {
  checkOutOfPlay,
  isOffside,
  judgeTackle,
  restartForFoul,
  restartForOutOfPlay,
  HALF_L,
  HALF_W,
  type PlayerLike,
} from '../rules';
import { createBall } from '../ball';

function ball(x: number, z: number, y = 0) {
  return { ...createBall(), x, z, y };
}

function player(team: 0 | 1, x: number, z = 0): PlayerLike {
  return { team, x, z, defending: 70 };
}

describe('ball out of play', () => {
  it('is in play inside the lines', () => {
    expect(checkOutOfPlay(ball(0, 0)).kind).toBe('none');
    expect(checkOutOfPlay(ball(HALF_L - 0.1, HALF_W - 0.1)).kind).toBe('none');
  });

  it('detects each touchline', () => {
    expect(checkOutOfPlay(ball(0, HALF_W + 0.2))).toEqual({ kind: 'touchline', side: 1 });
    expect(checkOutOfPlay(ball(0, -HALF_W - 0.2))).toEqual({ kind: 'touchline', side: -1 });
  });

  it('detects each byline', () => {
    expect(checkOutOfPlay(ball(HALF_L + 0.2, 0))).toEqual({ kind: 'byline', end: 1 });
    expect(checkOutOfPlay(ball(-HALF_L - 0.2, 0))).toEqual({ kind: 'byline', end: -1 });
  });

  it('treats a corner of the pitch as a touchline first', () => {
    // Both lines crossed at once: the touchline is checked first, which keeps
    // a ball leaving at the corner flag a throw-in rather than a corner.
    expect(checkOutOfPlay(ball(HALF_L + 1, HALF_W + 1)).kind).toBe('touchline');
  });
});

describe('restarts after the ball goes out', () => {
  it('gives the throw-in to the other side', () => {
    const restart = restartForOutOfPlay({ kind: 'touchline', side: 1 }, ball(10, HALF_W + 1), 0);
    expect(restart.type).toBe('throwIn');
    expect(restart.team).toBe(1);
    expect(restart.z).toBeGreaterThan(HALF_W);
  });

  it('gives a goal kick when the attacking side puts it behind', () => {
    // Team 0 attacks +x, so team 0 putting it behind the +x byline is a goal
    // kick to team 1.
    const restart = restartForOutOfPlay({ kind: 'byline', end: 1 }, ball(HALF_L + 1, 4), 0);
    expect(restart.type).toBe('goalKick');
    expect(restart.team).toBe(1);
  });

  it('gives a corner when the defending side puts it behind', () => {
    // Team 1 defends the +x byline; team 1 putting it behind is a corner to 0.
    const restart = restartForOutOfPlay({ kind: 'byline', end: 1 }, ball(HALF_L + 1, 20), 1);
    expect(restart.type).toBe('corner');
    expect(restart.team).toBe(0);
    expect(Math.abs(restart.z)).toBeCloseTo(HALF_W - 0.4, 1);
  });

  it('takes the corner from the side the ball went out', () => {
    const left = restartForOutOfPlay({ kind: 'byline', end: 1 }, ball(HALF_L + 1, -20), 1);
    expect(left.z).toBeLessThan(0);
  });
});

describe('offside', () => {
  const passer0 = player(0, 10);

  it('is not offside in your own half', () => {
    const receiver = player(0, -5);
    const players = [passer0, receiver, player(1, 40), player(1, 45)];
    expect(isOffside(receiver, passer0, players, 10)).toBe(false);
  });

  it('is not offside behind the ball', () => {
    const receiver = player(0, 5);
    const players = [passer0, receiver, player(1, 2), player(1, 3)];
    expect(isOffside(receiver, passer0, players, 10)).toBe(false);
  });

  it('is offside beyond the second-last defender', () => {
    const receiver = player(0, 40);
    // Keeper at 50, last defender at 30: second-last is 30, receiver is past it.
    const players = [passer0, receiver, player(1, 50), player(1, 30)];
    expect(isOffside(receiver, passer0, players, 10)).toBe(true);
  });

  it('is onside level with the second-last defender', () => {
    const receiver = player(0, 30);
    const players = [passer0, receiver, player(1, 50), player(1, 30)];
    expect(isOffside(receiver, passer0, players, 10)).toBe(false);
  });

  it('applies mirrored for the team attacking the other way', () => {
    const passer1 = player(1, -10);
    const onside = player(1, -30);
    const offside = player(1, -40);
    const players = [passer1, onside, offside, player(0, -50), player(0, -30)];
    expect(isOffside(onside, passer1, players, -10)).toBe(false);
    expect(isOffside(offside, passer1, players, -10)).toBe(true);
  });

  it('never calls the passer offside', () => {
    const players = [passer0, player(1, 50), player(1, 30)];
    expect(isOffside(passer0, passer0, players, 10)).toBe(false);
  });
});

describe('tackles', () => {
  const never = () => 0.999;
  const always = () => 0;

  it('is never a foul when the ball is won cleanly', () => {
    expect(judgeTackle(true, 9, 40, always)).toEqual({ foul: false, card: 'none' });
  });

  it('can be a foul when the ball is missed', () => {
    expect(judgeTackle(false, 9, 40, always).foul).toBe(true);
  });

  it('is not a foul on an unlucky roll', () => {
    expect(judgeTackle(false, 9, 40, never).foul).toBe(false);
  });

  it('punishes a fast challenge harder than a slow one', () => {
    let fastCards = 0;
    let slowCards = 0;
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 4000; i += 1) {
      if (judgeTackle(false, 9, 50, rng).card !== 'none') fastCards += 1;
      if (judgeTackle(false, 1, 50, rng).card !== 'none') slowCards += 1;
    }
    expect(fastCards).toBeGreaterThan(slowCards);
  });
});

describe('fouls', () => {
  it('gives a free kick outside the area', () => {
    const restart = restartForFoul(0, 0, 0);
    expect(restart.type).toBe('freeKick');
    expect(restart.team).toBe(1);
  });

  it('gives a penalty inside the offending side own area', () => {
    // Team 0 defends -x, so a foul by team 0 near -x is a penalty to team 1.
    const restart = restartForFoul(-HALF_L + 8, 3, 0);
    expect(restart.type).toBe('penalty');
    expect(restart.team).toBe(1);
    expect(restart.z).toBe(0);
    expect(restart.x).toBeCloseTo(-HALF_L + 11, 1);
  });

  it('is only a penalty in the offenders own area, not the other one', () => {
    // Team 0 fouling deep in the opposition area is a free kick, not a penalty.
    expect(restartForFoul(HALF_L - 8, 3, 0).type).toBe('freeKick');
  });

  it('mirrors for the other team', () => {
    const restart = restartForFoul(HALF_L - 8, 0, 1);
    expect(restart.type).toBe('penalty');
    expect(restart.team).toBe(0);
    expect(restart.x).toBeCloseTo(HALF_L - 11, 1);
  });
});

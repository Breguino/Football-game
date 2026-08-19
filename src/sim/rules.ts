/**
 * The laws the simulation actually enforces: ball out of play, offside, and
 * fouls. Kept separate from the match loop because these are rules rather than
 * behaviour, and they are the part worth reading on their own.
 */

import { PITCH_LENGTH, PITCH_WIDTH, GOAL_WIDTH } from '@/render/pitch';
import type { Ball } from './ball';

export const HALF_L = PITCH_LENGTH / 2;
export const HALF_W = PITCH_WIDTH / 2;

export type RestartType =
  | 'throwIn'
  | 'corner'
  | 'goalKick'
  | 'freeKick'
  | 'penalty'
  | 'kickoff';

export interface Restart {
  type: RestartType;
  /** The team taking it. */
  team: 0 | 1;
  x: number;
  z: number;
  /** Index of the player taking it, once one has been chosen. */
  taker: number | null;
  /** Seconds before the taker plays the ball. */
  delay: number;
}

export interface PlayerLike {
  team: 0 | 1;
  x: number;
  z: number;
  defending: number;
  physical?: number;
}

/** Which line, if any, the ball has crossed. */
export type OutOfPlay =
  | { kind: 'none' }
  | { kind: 'touchline'; side: 1 | -1 }
  | { kind: 'byline'; end: 1 | -1 };

export function checkOutOfPlay(ball: Ball): OutOfPlay {
  if (Math.abs(ball.z) > HALF_W) {
    return { kind: 'touchline', side: ball.z > 0 ? 1 : -1 };
  }
  if (Math.abs(ball.x) > HALF_L) {
    // Inside the frame is a goal, handled before this is ever consulted.
    return { kind: 'byline', end: ball.x > 0 ? 1 : -1 };
  }
  return { kind: 'none' };
}

/**
 * The restart that follows a ball going out.
 *
 * `lastTouchTeam` is the side that last played it, so the award goes the other
 * way — the single rule that decides throw-ins, corners and goal kicks alike.
 */
export function restartForOutOfPlay(
  out: Exclude<OutOfPlay, { kind: 'none' }>,
  ball: Ball,
  lastTouchTeam: 0 | 1,
): Restart {
  const awardedTo: 0 | 1 = lastTouchTeam === 0 ? 1 : 0;

  if (out.kind === 'touchline') {
    return {
      type: 'throwIn',
      team: awardedTo,
      // Taken from where it crossed, a step outside the line.
      x: clamp(ball.x, -HALF_L + 1, HALF_L - 1),
      z: out.side * (HALF_W + 0.4),
      taker: null,
      delay: 1.1,
    };
  }

  // Behind the byline: whose goal it went behind decides corner or goal kick.
  // Team 0 attacks +x, so the +x byline is team 1's goal line.
  const defendingTeam: 0 | 1 = out.end === 1 ? 1 : 0;

  if (awardedTo === defendingTeam) {
    // The attacking side put it out: goal kick to the defenders.
    return {
      type: 'goalKick',
      team: defendingTeam,
      x: out.end * (HALF_L - 5.5),
      z: clamp(ball.z, -9, 9),
      taker: null,
      delay: 1.4,
    };
  }

  return {
    type: 'corner',
    team: awardedTo,
    x: out.end * (HALF_L - 0.4),
    z: Math.sign(ball.z || 1) * (HALF_W - 0.4),
    taker: null,
    delay: 1.6,
  };
}

/**
 * Offside.
 *
 * A player is offside if, at the moment the ball is played to them, they are
 * nearer the opponents' goal than both the ball and the second-last opponent —
 * and in their opponents' half. Being level is onside, which is why the
 * comparisons here are strict.
 */
export function isOffside(
  receiver: PlayerLike,
  passer: PlayerLike,
  players: readonly PlayerLike[],
  ballX: number,
): boolean {
  if (receiver === passer) return false;

  // Attacking direction: team 0 attacks +x.
  const dir = receiver.team === 0 ? 1 : -1;

  // Never offside in your own half.
  if (receiver.x * dir <= 0) return false;

  // Never offside if level with or behind the ball.
  if (receiver.x * dir <= ballX * dir) return false;

  // The second-last opponent, measured along the attacking direction.
  const opponents = players
    .filter((p) => p.team !== receiver.team)
    .map((p) => p.x * dir)
    .sort((a, b) => b - a);
  const secondLast = opponents[1];
  if (secondLast === undefined) return false;

  return receiver.x * dir > secondLast;
}

/** A free kick where the offence happened, to the defending side. */
export function restartForOffside(receiver: PlayerLike): Restart {
  return {
    type: 'freeKick',
    team: receiver.team === 0 ? 1 : 0,
    x: clamp(receiver.x, -HALF_L + 6, HALF_L - 6),
    z: clamp(receiver.z, -HALF_W + 2, HALF_W - 2),
    taker: null,
    delay: 1.6,
  };
}

/**
 * Whether a failed tackle is a foul, and how bad.
 *
 * A challenge that misses the ball and arrives late is a foul; how reckless it
 * was decides the card. Tackling from behind at speed is what referees
 * actually punish, so closing speed drives severity.
 */
export interface FoulOutcome {
  foul: boolean;
  card: 'none' | 'yellow' | 'red';
}

export function judgeTackle(
  cleanlyWon: boolean,
  closingSpeed: number,
  defenderRating: number,
  random: () => number,
): FoulOutcome {
  if (cleanlyWon) return { foul: false, card: 'none' };

  // A poor defender lunging fast is far likelier to catch the man.
  const clumsiness = 1 - defenderRating / 130;
  const recklessness = Math.min(1, closingSpeed / 9);
  const foulChance = clumsiness * (0.10 + recklessness * 0.30);
  if (random() > foulChance) return { foul: false, card: 'none' };

  // Most fouls are just fouls.
  const severity = random() * recklessness;
  if (severity > 0.86) return { foul: true, card: 'red' };
  if (severity > 0.52) return { foul: true, card: 'yellow' };
  return { foul: true, card: 'none' };
}

/** A free kick, or a penalty when the offence is inside the area. */
export function restartForFoul(
  x: number,
  z: number,
  offendingTeam: 0 | 1,
): Restart {
  const awardedTo: 0 | 1 = offendingTeam === 0 ? 1 : 0;
  const ownGoal = offendingTeam === 0 ? -HALF_L : HALF_L;
  const insideArea =
    Math.abs(x - ownGoal) < 16.5 && Math.abs(z) < 20.16 && Math.sign(x) === Math.sign(ownGoal);

  if (insideArea) {
    return {
      type: 'penalty',
      team: awardedTo,
      x: ownGoal + (offendingTeam === 0 ? 11 : -11),
      z: 0,
      taker: null,
      delay: 2.4,
    };
  }

  return {
    type: 'freeKick',
    team: awardedTo,
    x: clamp(x, -HALF_L + 2, HALF_L - 2),
    z: clamp(z, -HALF_W + 1, HALF_W - 1),
    taker: null,
    delay: 1.8,
  };
}

/** Whether a shot that crossed the byline was between the posts. */
export function isBetweenPosts(ball: Ball): boolean {
  return Math.abs(ball.z) <= GOAL_WIDTH / 2 && ball.y <= 2.44;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

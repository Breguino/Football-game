/**
 * Off-ball movement.
 *
 * The previous version had everyone hold a static shape that slid with the
 * ball. It looked like football from a distance and behaved nothing like it:
 * nobody ran beyond anybody, so the offside law never once fired in a match.
 *
 * What is modelled here is the small number of things that actually decide
 * where a footballer stands when they do not have the ball — their role, the
 * line their team is holding, whether their side has possession, and whether
 * there is space to run into.
 */

import type { SimPlayer } from './match';
import type { Ball } from './ball';
import { HALF_L, HALF_W } from './rules';

export type Role = 'keeper' | 'centreBack' | 'fullBack' | 'midfield' | 'winger' | 'striker';

/** How a side is set up, in the order a manager thinks about it. */
export type Mentality = 'defensive' | 'balanced' | 'attacking' | 'allOut';

export const MENTALITIES: Mentality[] = ['defensive', 'balanced', 'attacking', 'allOut'];

export const MENTALITY_LABEL: Record<Mentality, string> = {
  defensive: 'Defensive',
  balanced: 'Balanced',
  attacking: 'Attacking',
  allOut: 'All-out attack',
};

interface Shape {
  /** How far up the pitch the defensive line holds, 0-1 from own goal. */
  squeeze: number;
  /** How far ahead of the ball the front players support. */
  push: number;
  /** How many players beyond the midfield join the press. */
  pressers: number;
}

const SHAPES: Record<Mentality, Shape> = {
  defensive: { squeeze: 0.34, push: 0.6, pressers: 1 },
  balanced: { squeeze: 0.42, push: 1, pressers: 1 },
  attacking: { squeeze: 0.5, push: 1.35, pressers: 2 },
  allOut: { squeeze: 0.58, push: 1.7, pressers: 3 },
};

export function shapeFor(mentality: Mentality): Shape {
  return SHAPES[mentality] ?? SHAPES.balanced;
}

/** Role per slot in the 4-3-3 the formation is laid out in. */
export const ROLES: Role[] = [
  'keeper',
  'fullBack', 'centreBack', 'centreBack', 'fullBack',
  'midfield', 'midfield', 'midfield',
  'winger', 'striker', 'winger',
];

export interface Target {
  x: number;
  z: number;
  /** 0–1, how hard to run at it. */
  urgency: number;
}

/** The attacking direction for a team: +1 toward +x. */
export function attackDir(team: 0 | 1): 1 | -1 {
  return team === 0 ? 1 : -1;
}

/**
 * Where a team's defensive line is holding, in absolute x.
 *
 * A back line squeezes up toward halfway when its side has the ball and drops
 * toward its own box when it does not. This is what creates offside: an
 * attacker who keeps running while the line steps up ends up beyond it.
 */
export function defensiveLine(
  players: readonly SimPlayer[],
  team: 0 | 1,
  ball: Ball,
  hasPossession: boolean,
  mentality: Mentality = 'balanced',
): number {
  const dir = attackDir(team);

  // Base depth, measured from this team's own goal outward. A side set up to
  // attack holds a higher line, which is the whole trade: more territory, more
  // room in behind.
  const shape = shapeFor(mentality);
  const squeeze = hasPossession ? shape.squeeze + 0.1 : shape.squeeze - 0.12;
  let line = (-HALF_L + HALF_L * 2 * squeeze) * dir;

  // Never push up past the ball — a back line that steps beyond the ball is
  // simply out of the game.
  const ballLimit = ball.x * dir + 8;
  if (line * dir > ballLimit) line = ballLimit * dir;

  // And never drop inside the six-yard box.
  const floor = (-HALF_L + 8) * dir;
  if (line * dir < floor * dir) line = floor;

  void players;
  return line;
}

interface Context {
  players: readonly SimPlayer[];
  ball: Ball;
  /** Index of the ball's owner, or null. */
  owner: number | null;
  /** True when this player's side has the ball. */
  hasPossession: boolean;
  /** Absolute x of this team's defensive line. */
  line: number;
  /** Whether this player is the one closest to the ball on their side. */
  isPresser: boolean;
  /** Where a loose ball will come to rest. */
  settle: { x: number; z: number };
  /** How this side is set up. */
  mentality: Mentality;
}

/**
 * Where an off-ball player wants to be.
 *
 * Ordered the way a player decides: win the ball back first, hold the line
 * second, then look for space.
 */
export function offBallTarget(player: SimPlayer, context: Context): Target {
  const dir = attackDir(player.team);
  const role = roleOf(player);

  // ---- Pressing ----------------------------------------------------------
  if (context.isPresser && !context.hasPossession) {
    return { x: context.settle.x, z: context.settle.z, urgency: 1 };
  }

  // ---- Out of possession: hold the shape in front of the line ------------
  if (!context.hasPossession) {
    const depth = defensiveDepth(role);
    const x = context.line + depth * dir;

    // The block narrows toward the ball, but full-backs stay wider than the
    // centre of the defence so the flanks are not simply abandoned.
    const pull = role === 'fullBack' ? 0.32 : role === 'centreBack' ? 0.5 : 0.42;
    const z = player.homeZ + (context.ball.z - player.homeZ) * pull;

    return { x: clampX(x), z: clampZ(z), urgency: 0.85 };
  }

  // ---- In possession -----------------------------------------------------
  const ballAdvance = context.ball.x * dir;

  // Runs in behind. A forward whose side has the ball in the final third will
  // try to get beyond the last defender — which is exactly the movement the
  // offside law exists to police, and the reason it now fires at all.
  if ((role === 'striker' || role === 'winger') && ballAdvance > -6) {
    const lastDefender = lastDefenderX(context.players, player.team);
    const beyond = lastDefender + (2 + player.pace / 24) * dir;
    const width = role === 'winger' ? player.homeZ * 1.12 : player.homeZ + context.ball.z * 0.18;
    return { x: clampX(beyond), z: clampZ(width), urgency: 1 };
  }

  // Everyone else pushes up behind the ball, keeping their own shape. How far
  // they commit is the mentality.
  const support = attackingDepth(role) * shapeFor(context.mentality).push;
  const x = context.ball.x + support * dir;
  const z = player.homeZ + (context.ball.z - player.homeZ) * 0.2;
  return { x: clampX(x), z: clampZ(z), urgency: 0.8 };
}

/** How far in front of the defensive line a role sits when defending. */
function defensiveDepth(role: Role): number {
  switch (role) {
    case 'centreBack':
      return 0;
    case 'fullBack':
      return 1.5;
    case 'midfield':
      return 13;
    case 'winger':
      return 24;
    case 'striker':
      return 32;
    default:
      return 0;
  }
}

/** How far ahead of or behind the ball a role supports when attacking. */
function attackingDepth(role: Role): number {
  switch (role) {
    case 'centreBack':
      return -26;
    case 'fullBack':
      return -8;
    case 'midfield':
      return -3;
    default:
      return 8;
  }
}

/**
 * The last outfield defender's x, measured along the attacking direction —
 * the reference an attacker runs off.
 */
export function lastDefenderX(players: readonly SimPlayer[], attackingTeam: 0 | 1): number {
  const dir = attackDir(attackingTeam);
  let deepest = -Infinity;
  let secondDeepest = -Infinity;

  for (const p of players) {
    if (p.team === attackingTeam) continue;
    const along = p.x * dir;
    if (along > deepest) {
      secondDeepest = deepest;
      deepest = along;
    } else if (along > secondDeepest) {
      secondDeepest = along;
    }
  }

  // The keeper is normally the deepest, so the *second* deepest is the line an
  // attacker has to stay level with.
  const reference = secondDeepest === -Infinity ? deepest : secondDeepest;
  return reference * dir;
}

export function roleOf(player: SimPlayer): Role {
  return ROLES[player.slot] ?? 'midfield';
}

function clampX(x: number): number {
  return Math.max(-HALF_L + 2, Math.min(HALF_L - 2, x));
}

function clampZ(z: number): number {
  return Math.max(-HALF_W + 1.5, Math.min(HALF_W - 1.5, z));
}

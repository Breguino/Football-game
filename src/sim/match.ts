/**
 * Match simulation. Fixed timestep, no rendering, no DOM — so it is
 * deterministic, testable in node, and can be stepped faster than real time
 * for a season simulator later.
 *
 * Coordinates are metres, origin at the centre spot. +x is toward the away
 * goal, +z toward the near touchline. This matches the render layer exactly so
 * no conversion lives between them.
 */

import { PITCH_LENGTH, PITCH_WIDTH, GOAL_WIDTH } from '@/render/pitch';
import type { Player } from '@/world/generate';

export const TICK = 1 / 60;

const HALF_L = PITCH_LENGTH / 2;
const HALF_W = PITCH_WIDTH / 2;

export interface SimPlayer {
  id: string;
  team: 0 | 1;
  number: number;
  last: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Where this player wants to be when the ball is at the centre spot. */
  homeX: number;
  homeZ: number;
  stamina: number;
  pace: number;
  passing: number;
  shooting: number;
  defending: number;
  skillMoves: number;
  weakFoot: number;
  preferredFoot: 'L' | 'R';
  /** Seconds before this player can strike the ball again. */
  shotCooldown: number;
}

export interface Ball {
  x: number;
  z: number;
  /** Height above the turf, metres. */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** Index into players, or null when loose. */
  owner: number | null;
}

export type MatchPhase = 'kickoff' | 'live' | 'goal' | 'halftime' | 'fulltime';

export interface MatchEvent {
  type: 'goal' | 'halftime' | 'fulltime' | 'kickoff';
  team?: 0 | 1;
  scorer?: string;
  minute: number;
}

export interface MatchState {
  players: SimPlayer[];
  ball: Ball;
  score: [number, number];
  /** Seconds of match time elapsed. */
  clock: number;
  half: 1 | 2;
  halfLength: number;
  phase: MatchPhase;
  /** Seconds remaining in a non-live phase before play restarts. */
  phaseTimer: number;
  controlledIndex: number;
  /** Last player to touch the ball, so a goal is credited even once loose. */
  lastTouch: number | null;
  possession: [number, number];
  shots: [number, number];
  saves: [number, number];
  events: MatchEvent[];
  lastGoal: { team: 0 | 1; scorer: string; minute: number } | null;
}

export interface Intent {
  moveX: number;
  moveZ: number;
  pass: boolean;
  shoot: boolean;
  sprint: boolean;
  switchPlayer: boolean;
}

export const NO_INTENT: Intent = {
  moveX: 0,
  moveZ: 0,
  pass: false,
  shoot: false,
  sprint: false,
  switchPlayer: false,
};

/** 4-3-3, as fractions of half-length and half-width. */
const FORMATION: [number, number][] = [
  [-0.94, 0],
  [-0.62, 0.62], [-0.68, 0.22], [-0.68, -0.22], [-0.62, -0.62],
  [-0.28, 0], [-0.16, 0.42], [-0.16, -0.42],
  [0.32, 0.66], [0.42, 0], [0.32, -0.66],
];

function mirror(x: number, team: 0 | 1): number {
  return team === 0 ? x : -x;
}

export function createMatch(
  home: Player[],
  away: Player[],
  options: { halfLength?: number } = {},
): MatchState {
  const players: SimPlayer[] = [];

  for (const [team, squad] of [[0, home], [1, away]] as const) {
    squad.slice(0, 11).forEach((player, i) => {
      const slot = FORMATION[i] ?? [0, 0];
      const homeX = mirror(slot[0] * HALF_L * 0.92, team);
      const homeZ = slot[1] * HALF_W * 0.86;
      players.push({
        id: player.id,
        team,
        number: player.number,
        last: player.last,
        x: homeX,
        z: homeZ,
        vx: 0,
        vz: 0,
        homeX,
        homeZ,
        stamina: 100,
        pace: player.attributes.pace,
        passing: player.attributes.passing,
        shooting: player.attributes.shooting,
        defending: player.attributes.defending,
        skillMoves: player.skillMoves,
        weakFoot: player.weakFoot,
        preferredFoot: player.preferredFoot,
        shotCooldown: 0,
      });
    });
  }

  return {
    players,
    ball: { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, owner: null },
    score: [0, 0],
    clock: 0,
    half: 1,
    halfLength: (options.halfLength ?? 6) * 60,
    phase: 'kickoff',
    phaseTimer: 1.6,
    controlledIndex: 9, // the centre-forward
    lastTouch: null,
    possession: [0, 0],
    shots: [0, 0],
    saves: [0, 0],
    events: [],
    lastGoal: null,
  };
}

/** The goal this team is attacking. Team 0 attacks +x. */
function goalMouthX(team: 0 | 1): number {
  return team === 0 ? HALF_L : -HALF_L;
}

/** The goal this team is defending — the opposite end. */
function ownGoalX(team: 0 | 1): number {
  return team === 0 ? -HALF_L : HALF_L;
}

function resetPositions(state: MatchState, kickingTeam: 0 | 1) {
  for (const p of state.players) {
    p.x = p.homeX;
    p.z = p.homeZ;
    p.vx = 0;
    p.vz = 0;
  }
  state.ball.x = 0;
  state.ball.z = 0;
  state.ball.y = 0;
  state.ball.vx = 0;
  state.ball.vz = 0;
  state.ball.vy = 0;
  // The kicking team's forward starts on the ball.
  const index = state.players.findIndex((p, i) => p.team === kickingTeam && i % 11 === 9);
  state.ball.owner = index >= 0 ? index : null;
  state.lastTouch = state.ball.owner;
  state.controlledIndex = state.players.findIndex((p) => p.team === 0 && p.number !== 1);
}

/** Gives stamina back at a stoppage, as a break in play does. */
function recover(state: MatchState, amount: number) {
  for (const p of state.players) {
    p.stamina = Math.min(100, p.stamina + amount);
  }
}

/** The first player of each eleven is that team's goalkeeper. */
function isKeeper(state: MatchState, index: number): boolean {
  return index % 11 === 0 && index < state.players.length;
}

/** Distance from a player to the ball, ignoring height. */
function distanceToBall(p: SimPlayer, ball: Ball): number {
  return Math.hypot(p.x - ball.x, p.z - ball.z);
}

export function step(state: MatchState, intent: Intent, dt = TICK): MatchState {
  if (state.phase === 'fulltime') return state;

  // ---- Non-live phases ----------------------------------------------------
  if (state.phase !== 'live') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.phase === 'goal') {
        const conceding = state.lastGoal?.team === 0 ? 1 : 0;
        recover(state, 4 * (720 / (state.halfLength * 2)));
        resetPositions(state, conceding);
        state.phase = 'live';
      } else if (state.phase === 'halftime') {
        state.half = 2;
        recover(state, 22);
        resetPositions(state, 1);
        state.phase = 'live';
      } else if (state.phase === 'kickoff') {
        resetPositions(state, 0);
        state.phase = 'live';
      }
    }
    return state;
  }

  // ---- Clock --------------------------------------------------------------
  state.clock += dt;
  const halfEnd = state.halfLength * state.half;
  if (state.clock >= halfEnd) {
    if (state.half === 1) {
      state.phase = 'halftime';
      state.phaseTimer = 3;
      state.events.push({ type: 'halftime', minute: minuteOf(state) });
    } else {
      state.phase = 'fulltime';
      state.events.push({ type: 'fulltime', minute: minuteOf(state) });
    }
    return state;
  }

  const ball = state.ball;
  const owner = ball.owner === null ? null : state.players[ball.owner] ?? null;
  if (owner) state.possession[owner.team] += dt;

  // ---- Player intent ------------------------------------------------------
  const controlled = state.players[state.controlledIndex];

  // Whether the human is actually playing this tick. When they are not — an
  // untouched controller, an AI-vs-AI match, a test — the controlled player
  // must be driven by the same AI as everyone else. Otherwise winning the ball
  // *demotes* that player to standing still, and the user's team can never
  // advance it.
  const userActing =
    intent.shoot || intent.pass || Math.hypot(intent.moveX, intent.moveZ) > 0.05;

  if (intent.switchPlayer && controlled) {
    // Switch to the team-mate nearest the ball.
    let best = state.controlledIndex;
    let bestDistance = Infinity;
    state.players.forEach((p, i) => {
      if (p.team !== 0 || i === state.controlledIndex) return;
      const d = distanceToBall(p, ball);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    state.controlledIndex = best;
  }

  for (let i = 0; i < state.players.length; i += 1) {
    const p = state.players[i]!;
    const isControlled = i === state.controlledIndex;
    const hasBall = ball.owner === i;

    let ax = 0;
    let az = 0;

    if (isControlled && userActing) {
      ax = intent.moveX;
      az = intent.moveZ;
    } else if (hasBall) {
      // Carrying: drive at the opposing goal, drifting off the nearest
      // defender rather than running straight through them.
      const targetX = goalMouthX(p.team);
      let dx = targetX - p.x;
      let dz = -p.z * 0.35;
      let closest = Infinity;
      let evadeZ = 0;
      for (const o of state.players) {
        if (o.team === p.team) continue;
        const gap = Math.hypot(o.x - p.x, o.z - p.z);
        if (gap < closest) {
          closest = gap;
          evadeZ = p.z - o.z;
        }
      }
      if (closest < 6) dz += Math.sign(evadeZ || 1) * (6 - closest) * 1.4;
      const length = Math.hypot(dx, dz) || 1;
      ax = dx / length;
      az = dz / length;
    } else if (isKeeper(state, i)) {
      // The keeper holds the line and shuffles across with the ball, coming
      // a few metres off it as the ball nears. Everything about whether a
      // shot goes in follows from where they are standing.
      const line = ownGoalX(p.team) * 0.985;
      const advance = Math.max(0, 1 - Math.abs(ball.x - line) / 34) * 4.5;
      const targetX = line - Math.sign(line) * advance;
      const targetZ = Math.max(-GOAL_WIDTH, Math.min(GOAL_WIDTH, ball.z * 0.55));
      const dx = targetX - p.x;
      const dz = targetZ - p.z;
      const length = Math.hypot(dx, dz) || 1;
      const urgency = Math.min(1, length / 1.5);
      ax = (dx / length) * urgency;
      az = (dz / length) * urgency;
    } else {
      // Everyone else holds a shape that shifts with the ball, and the nearest
      // defender presses. This is not a tactics engine; it is enough structure
      // that the pitch never looks static.
      const attacking = owner?.team === p.team;
      // The whole team slides with the ball; when in possession the forwards
      // push on harder than the back line, so the shape stretches rather than
      // shuffling sideways as a block.
      const forwardness = (p.homeX * (p.team === 0 ? 1 : -1)) / (HALF_L * 0.92);
      const push = attacking ? 0.3 + Math.max(0, forwardness) * 0.5 : 0.24;
      const shift = ball.x * push;
      const targetX = p.homeX + shift;
      const targetZ = p.homeZ + (ball.z - p.homeZ) * 0.16;

      const nearest = nearestToBall(state, p.team);
      const shouldPress = !attacking && nearest === i;

      const tx = shouldPress ? ball.x : targetX;
      const tz = shouldPress ? ball.z : targetZ;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const length = Math.hypot(dx, dz) || 1;
      const urgency = shouldPress ? 1 : Math.min(1, length / 6);
      ax = (dx / length) * urgency;
      az = (dz / length) * urgency;
    }

    // Speed comes from pace and remaining stamina.
    const sprinting = isControlled && intent.sprint && p.stamina > 3;
    const base = 4.6 + (p.pace / 99) * 3.4;
    const speed = base * (sprinting ? 1.28 : 1) * (0.72 + (p.stamina / 100) * 0.28);

    p.vx += (ax * speed - p.vx) * Math.min(1, dt * 7);
    p.vz += (az * speed - p.vz) * Math.min(1, dt * 7);

    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // Keep everyone on the park.
    p.x = Math.max(-HALF_L - 1.5, Math.min(HALF_L + 1.5, p.x));
    p.z = Math.max(-HALF_W - 1.5, Math.min(HALF_W + 1.5, p.z));

    // Stamina. A player is never truly at rest while the ball is live, so the
    // baseline cost applies regardless of speed and recovery happens at
    // stoppages instead. Rates are scaled against the *simulated* half length,
    // so a 6-minute half and a 12-minute half both finish with legs gone
    // rather than one of them finishing fresh.
    const effort = Math.min(1, Math.hypot(p.vx, p.vz) / speed);
    const matchScale = 720 / (state.halfLength * 2);
    const drain = (0.042 + effort * effort * (sprinting ? 0.78 : 0.39)) * matchScale;
    p.stamina = Math.max(0, p.stamina - drain * dt);
    p.shotCooldown = Math.max(0, p.shotCooldown - dt);

    // Carry the ball at the feet.
    if (hasBall) {
      const heading = Math.hypot(p.vx, p.vz) || 1;
      ball.x = p.x + (p.vx / heading) * 0.55;
      ball.z = p.z + (p.vz / heading) * 0.55;
      ball.y = 0;
      ball.vx = p.vx;
      ball.vz = p.vz;
      ball.vy = 0;
    }
  }

  // ---- Actions ------------------------------------------------------------
  // Both sides share one decision path. The user overrides it only while they
  // are actually playing; an untouched controller hands the ball back to the
  // AI, which is what keeps an unattended match a match rather than a stalemate.
  if (owner && ball.owner !== null) {
    const userOnBall = ball.owner === state.controlledIndex && owner.team === 0;

    if (userOnBall && intent.shoot) shoot(state, ball.owner);
    else if (userOnBall && intent.pass) pass(state, ball.owner);
    else if (!userOnBall || !userActing) decideOnBall(state, ball.owner, dt);
  }

  // ---- Loose ball ---------------------------------------------------------
  if (ball.owner === null) {
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.y += ball.vy * dt;

    if (ball.y > 0) {
      ball.vy -= 9.81 * dt;
    } else {
      ball.y = 0;
      if (ball.vy < -0.5) ball.vy = -ball.vy * 0.42; // bounce
      else ball.vy = 0;
    }

    // Rolling resistance and air drag.
    const drag = ball.y > 0.05 ? 0.06 : 1.05;
    ball.vx -= ball.vx * drag * dt;
    ball.vz -= ball.vz * drag * dt;

    checkGoal(state);
    if (state.phase !== 'live') return state;
    keepInPlay(state);

    // First player within reach takes possession.
    for (let i = 0; i < state.players.length; i += 1) {
      const p = state.players[i]!;
      if (distanceToBall(p, ball) < 0.85 && ball.y < 1.4) {
        ball.owner = i;
        state.lastTouch = i;
        ball.vx = 0;
        ball.vz = 0;
        ball.vy = 0;
        if (p.team === 0) state.controlledIndex = i;
        break;
      }
    }
  } else {
    // A tackle: an opponent close enough, weighted by defending against pace.
    const carrier = state.players[ball.owner]!;
    for (let i = 0; i < state.players.length; i += 1) {
      const p = state.players[i]!;
      if (p.team === carrier.team) continue;
      const gap = Math.hypot(p.x - carrier.x, p.z - carrier.z);
      if (gap > 1.1) continue;
      const odds = (p.defending / (p.defending + carrier.pace)) * dt * 3.2;
      if (Math.random() < odds) {
        ball.owner = i;
        state.lastTouch = i;
        if (p.team === 0) state.controlledIndex = i;
        break;
      }
    }
    checkGoal(state);
  }

  return state;
}

/**
 * What a player on the ball does next.
 *
 * Not a tactics engine — three questions in the order a footballer asks them:
 * am I in a shooting position, am I under pressure, and is there a better
 * option ahead of me.
 */
function decideOnBall(state: MatchState, index: number, dt: number) {
  const carrier = state.players[index]!;
  const goalX = goalMouthX(carrier.team);
  const range = Math.hypot(goalX - carrier.x, -carrier.z);

  // How close the nearest opponent is, which drives urgency.
  let pressure = Infinity;
  for (const p of state.players) {
    if (p.team === carrier.team) continue;
    pressure = Math.min(pressure, Math.hypot(p.x - carrier.x, p.z - carrier.z));
  }

  // Shooting: near-certain inside the box, tailing off to nothing past 30m.
  // A player who has just struck the ball needs to reset before the next one;
  // without this, a save that drops in the six-yard box draws a burst of
  // point-blank shots from the same striker and the shot count runs away.
  if (range < 30 && carrier.shotCooldown <= 0) {
    // A flatter curve than pure proximity: real teams shoot from range too,
    // and a mix weighted almost entirely to six-yard chances puts every shot
    // on target and turns the keeper into a wall.
    const appetite = (1 - range / 30) ** 0.8;
    const confidence = 0.35 + (carrier.shooting / 99) * 0.65;
    const squeezed = pressure < 2.2 ? 1.5 : 1;
    if (Math.random() < appetite * confidence * squeezed * dt * 0.22) {
      shoot(state, index);
      return;
    }
  }

  // Passing: constantly under pressure, occasionally in space to keep it moving.
  const passUrge = pressure < 3 ? 2.6 : pressure < 7 ? 1.1 : 0.45;
  if (Math.random() < passUrge * dt) pass(state, index);
}

function nearestToBall(state: MatchState, team: 0 | 1): number {
  let best = -1;
  let bestDistance = Infinity;
  state.players.forEach((p, i) => {
    if (p.team !== team) return;
    const d = distanceToBall(p, state.ball);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

function pass(state: MatchState, from: number) {
  const passer = state.players[from]!;
  const goalX = goalMouthX(passer.team);

  // Prefer a team-mate ahead of the ball and in space.
  let target: SimPlayer | null = null;
  let bestScore = -Infinity;
  for (const p of state.players) {
    if (p.team !== passer.team || p === passer) continue;
    const distance = Math.hypot(p.x - passer.x, p.z - passer.z);
    if (distance < 3 || distance > 38) continue;
    const progress = (goalX > 0 ? p.x - passer.x : passer.x - p.x) / 10;
    const nearestOpponent = Math.min(
      ...state.players.filter((o) => o.team !== passer.team).map((o) => Math.hypot(o.x - p.x, o.z - p.z)),
    );
    const score = progress + nearestOpponent * 0.25 - distance * 0.04;
    if (score > bestScore) {
      bestScore = score;
      target = p;
    }
  }
  if (!target) return;

  const dx = target.x - passer.x;
  const dz = target.z - passer.z;
  const distance = Math.hypot(dx, dz) || 1;

  // Weight the pass to arrive, with error scaled off the passer's rating.
  const power = Math.min(26, 7 + distance * 0.95);
  const error = (1 - passer.passing / 120) * 0.26;
  const angle = Math.atan2(dz, dx) + (Math.random() - 0.5) * error;

  state.ball.owner = null;
  state.lastTouch = from;
  state.ball.vx = Math.cos(angle) * power;
  state.ball.vz = Math.sin(angle) * power;
  state.ball.vy = distance > 22 ? 3.4 : 0;
}

function shoot(state: MatchState, from: number) {
  const shooter = state.players[from]!;
  shooter.shotCooldown = 1.1;

  const goalX = goalMouthX(shooter.team);
  const dx = goalX - shooter.x;
  const dz = -shooter.z;
  const distance = Math.hypot(dx, dz) || 1;

  state.shots[shooter.team] += 1;

  const accuracy = shooter.shooting / 99;

  // Whether the shot is on target is decided outright rather than left to the
  // geometry. Around a third of real shots hit the frame, and leaving that to
  // emerge from an angular spread put 90% of them on target — which turned the
  // keeper into a wall making twenty saves a game.
  const onTargetChance = Math.max(
    0.12,
    Math.min(0.62, 0.26 + accuracy * 0.3 - Math.max(0, distance - 6) * 0.011),
  );
  const onTarget = Math.random() < onTargetChance;

  // On target: somewhere inside the frame, better players nearer the corners.
  // Off target: past a post or over the bar, by a plausible margin.
  const half = GOAL_WIDTH / 2;
  let aimZ: number;
  if (onTarget) {
    aimZ = (Math.random() - 0.5) * 2 * half * (0.55 + accuracy * 0.4);
  } else {
    const side = Math.random() < 0.5 ? -1 : 1;
    aimZ = side * (half + 0.6 + Math.random() * 4.5);
  }

  const angle = Math.atan2(aimZ - shooter.z, dx);
  const power = 24 + accuracy * 13;

  state.ball.owner = null;
  state.lastTouch = from;
  state.ball.vx = Math.cos(angle) * power;
  state.ball.vz = Math.sin(angle) * power;
  // A shot that is off target is as often lifted over as dragged wide.
  state.ball.vy = onTarget
    ? Math.min(2.2, distance * 0.03)
    : Math.random() < 0.4
      ? 5.5 + Math.random() * 3
      : Math.min(2.5, distance * 0.04);
}

function checkGoal(state: MatchState) {
  const ball = state.ball;
  if (Math.abs(ball.x) < HALF_L) return;
  if (Math.abs(ball.z) > GOAL_WIDTH / 2) return;
  if (ball.y > 2.44) return;

  // The keeper defending this goal gets a chance first. Reach falls off with
  // how far they have to move and how hard the ball is struck — which is what
  // turns a shot count into a realistic conversion rate.
  const defendingTeam: 0 | 1 = ball.x > 0 ? 1 : 0;
  const keeperIndex = defendingTeam === 0 ? 0 : 11;
  const keeper = state.players[keeperIndex];
  if (keeper) {
    const travel = Math.hypot(keeper.x - ball.x, keeper.z - ball.z);
    const power = Math.hypot(ball.vx, ball.vz);
    const reach = 1.9 + (keeper.defending / 99) * 3.2;
    const hurry = Math.max(0.25, 1 - power / 40);
    if (travel < reach * hurry * 2.6 && Math.random() < (1 - travel / (reach * 2.8)) * hurry * 2.4) {
      // Saved. A keeper pushes the ball away from goal and wide, or holds it;
      // either way the danger clears rather than sitting on the six-yard line.
      ball.x = Math.sign(ball.x) * (HALF_L - 3.5);
      ball.vx = -Math.sign(ball.x) * (6 + Math.random() * 10);
      ball.vz = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 11);
      ball.vy = 2.2;
      ball.owner = null;
      state.saves[defendingTeam] += 1;
      return;
    }
  }

  // The ball is nearly always loose when it crosses the line, so credit the
  // last touch rather than the (absent) owner.
  const team: 0 | 1 = ball.x > 0 ? 0 : 1;
  const scorerIndex = ball.owner ?? state.lastTouch ?? nearestToBall(state, team);
  const toucher = state.players[scorerIndex];
  const scorer = toucher && toucher.team === team ? toucher.last : 'Own goal';

  state.score[team] += 1;
  state.lastGoal = { team, scorer, minute: minuteOf(state) };
  state.events.push({ type: 'goal', team, scorer, minute: minuteOf(state) });
  state.phase = 'goal';
  state.phaseTimer = 4.2;
}

function keepInPlay(state: MatchState) {
  const ball = state.ball;
  // Simplified restarts: the ball is returned to play near where it left.
  if (Math.abs(ball.z) > HALF_W) {
    ball.z = Math.sign(ball.z) * (HALF_W - 0.4);
    ball.vz *= -0.32;
  }
  if (Math.abs(ball.x) > HALF_L) {
    ball.x = Math.sign(ball.x) * (HALF_L - 0.6);
    ball.vx *= -0.32;
  }
}

export function minuteOf(state: MatchState): number {
  const fraction = state.clock / (state.halfLength * 2);
  return Math.min(90, Math.floor(fraction * 90) + 1);
}

/** Match clock as mm:ss, scaled to a 90-minute presentation. */
export function clockText(state: MatchState): string {
  const scaled = (state.clock / (state.halfLength * 2)) * 90 * 60;
  const minutes = Math.floor(scaled / 60);
  const seconds = Math.floor(scaled % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function possessionPercent(state: MatchState): [number, number] {
  const total = state.possession[0] + state.possession[1];
  if (total < 1) return [50, 50];
  const home = Math.round((state.possession[0] / total) * 100);
  return [home, 100 - home];
}

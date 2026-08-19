/**
 * Match simulation. Fixed timestep, no rendering, no DOM — so it is
 * deterministic, testable in node, and can be stepped faster than real time
 * for a season simulator later.
 *
 * Coordinates are metres, origin at the centre spot. +x is toward the away
 * goal, +z toward the near touchline. This matches the render layer exactly so
 * no conversion lives between them.
 */

import { GOAL_WIDTH } from '@/render/pitch';
import type { Player } from '@/world/generate';
import {
  createBall,
  groundSpeed,
  integrate,
  restingPoint,
  strike,
  type Ball,
} from './ball';
import { defensiveLine, offBallTarget, ROLES, type Role } from './ai';
import { createRng, type Rng } from '@/world/rng';
import {
  checkOutOfPlay,
  HALF_L,
  HALF_W,
  isBetweenPosts,
  isOffside,
  judgeTackle,
  restartForFoul,
  restartForOffside,
  restartForOutOfPlay,
  type Restart,
  type RestartType,
} from './rules';

export const TICK = 1 / 60;

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
  cards: 'none' | 'yellow' | 'red';
  /** Index into the formation, which decides this player's role. */
  slot: number;
}

export type { Ball };

export type MatchPhase =
  | 'kickoff'
  | 'live'
  | 'restart'
  | 'goal'
  | 'halftime'
  | 'fulltime';

export interface MatchEvent {
  type:
    | 'goal'
    | 'halftime'
    | 'fulltime'
    | 'kickoff'
    | 'throwIn'
    | 'corner'
    | 'goalKick'
    | 'freeKick'
    | 'penalty'
    | 'offside'
    | 'foul'
    | 'yellow'
    | 'red'
    | 'save'
    | 'substitution';
  team?: 0 | 1;
  /** Surname, for goals, cards and fouls. */
  player?: string;
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
  corners: [number, number];
  fouls: [number, number];
  offsides: [number, number];
  events: MatchEvent[];
  lastGoal: { team: 0 | 1; scorer: string; minute: number } | null;
  /** The restart being taken, when the phase is 'restart'. */
  restart: Restart | null;
  /** The pass in flight, so offside is judged when it arrives. */
  passIntent: PassIntent | null;
  /** What the referee last gave, for the HUD banner. */
  decision: { text: string; detail: string; until: number } | null;
  /** The most recent strike, so the renderer can punch the camera on a power shot. */
  lastShot: { type: ShotType; at: number; team: 0 | 1 } | null;
  /**
   * The match's own generator. Everything random in a match draws from here
   * rather than Math.random, so a match is reproducible from its seed — which
   * is what makes the simulation deterministic in fact and not just in the
   * comment at the top of this file.
   */
  rng: Rng;
  /** Players available to come on, per team. */
  bench: [Player[], Player[]];
  /** Substitutions used, per team. Three each, as the laws allow. */
  subsUsed: [number, number];
}

export type ShotType = 'driven' | 'finesse' | 'power';

export interface Intent {
  moveX: number;
  moveZ: number;
  pass: boolean;
  shoot: boolean;
  /** Which kind of shot the modifiers are asking for. */
  shotType: ShotType;
  sprint: boolean;
  switchPlayer: boolean;
}

export const NO_INTENT: Intent = {
  moveX: 0,
  moveZ: 0,
  pass: false,
  shoot: false,
  shotType: 'driven',
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

/**
 * Builds a match from two squads. The first eleven of each start; the next
 * seven sit on the bench and can come on.
 */
export function createMatch(
  home: Player[],
  away: Player[],
  options: { halfLength?: number; seed?: string } = {},
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
        cards: 'none',
        slot: i,
      });
    });
  }

  return {
    players,
    ball: createBall(),
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
    corners: [0, 0],
    fouls: [0, 0],
    offsides: [0, 0],
    events: [],
    lastGoal: null,
    restart: null,
    passIntent: null,
    decision: null,
    rng: createRng(options.seed ?? 'kick-off'),
    lastShot: null,
    bench: [home.slice(11, 18), away.slice(11, 18)],
    subsUsed: [0, 0],
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

/** Records who the ball was played to, so offside can be judged on arrival. */
export interface PassIntent {
  from: number;
  target: number;
  team: 0 | 1;
  /** Where the ball was when it was played — the reference for offside. */
  ballX: number;
  /**
   * Everyone on the passing side who was in an offside position at that
   * moment. Offside is judged when the ball is played, not when it arrives,
   * and a deflection onto any of them is offside just the same.
   */
  offside: number[];
}

function takePossession(state: MatchState, index: number) {
  const p = state.players[index]!;
  state.ball.owner = index;
  state.lastTouch = index;
  state.ball.vx = 0;
  state.ball.vz = 0;
  state.ball.vy = 0;
  state.ball.spin = 0;
  state.passIntent = null;
  if (p.team === 0) state.controlledIndex = index;
}

/** A second yellow is a red. */
function nextCard(p: SimPlayer): 'none' | 'yellow' | 'red' {
  return p.cards === 'yellow' ? 'red' : 'yellow';
}

function restartLabel(type: RestartType): string {
  switch (type) {
    case 'throwIn':
      return 'Throw-in';
    case 'corner':
      return 'Corner';
    case 'goalKick':
      return 'Goal kick';
    case 'freeKick':
      return 'Free kick';
    case 'penalty':
      return 'Penalty';
    default:
      return 'Kick off';
  }
}

/**
 * Stops play and sets up a restart. The nearest team-mate walks to the ball
 * and plays it once the delay has run down, which is what gives a stoppage its
 * rhythm instead of teleporting the ball back into open play.
 */
function beginRestart(state: MatchState, restart: Restart, label: string, detail: string) {
  const ball = state.ball;
  ball.owner = null;
  ball.x = restart.x;
  ball.z = restart.z;
  ball.y = 0;
  ball.vx = 0;
  ball.vz = 0;
  ball.vy = 0;
  ball.spin = 0;

  // Whoever is closest takes it, except a penalty, which the best finisher does.
  let taker = -1;
  if (restart.type === 'penalty') {
    let best = -Infinity;
    state.players.forEach((p, i) => {
      if (p.team !== restart.team) return;
      if (p.shooting > best) {
        best = p.shooting;
        taker = i;
      }
    });
  } else {
    let nearest = Infinity;
    state.players.forEach((p, i) => {
      if (p.team !== restart.team) return;
      // Keepers take goal kicks and nothing else.
      const keeper = isKeeper(state, i);
      if (restart.type === 'goalKick' ? !keeper : keeper) return;
      const d = Math.hypot(p.x - restart.x, p.z - restart.z);
      if (d < nearest) {
        nearest = d;
        taker = i;
      }
    });
  }

  restart.taker = taker >= 0 ? taker : null;
  state.restart = restart;
  state.passIntent = null;
  state.phase = 'restart';
  state.decision = { text: label, detail, until: state.clock + 3.2 };
  state.events.push({
    type: restart.type === 'kickoff' ? 'kickoff' : restart.type,
    team: restart.team,
    minute: minuteOf(state),
  });
}

/** Advances a restart: the taker walks to the ball, then plays it. */
function stepRestart(state: MatchState, dt: number) {
  const restart = state.restart;
  if (!restart) {
    state.phase = 'live';
    return;
  }

  const taker = restart.taker === null ? null : state.players[restart.taker];

  // Everyone else resets toward their shape while the ball is dead.
  for (let i = 0; i < state.players.length; i += 1) {
    const p = state.players[i]!;
    if (i === restart.taker) continue;
    const tx = p.homeX + (restart.x - 0) * 0.34;
    const tz = p.homeZ + (restart.z - p.homeZ) * 0.2;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const length = Math.hypot(dx, dz) || 1;
    const speed = 3.2;
    p.vx += ((dx / length) * Math.min(1, length / 3) * speed - p.vx) * Math.min(1, dt * 6);
    p.vz += ((dz / length) * Math.min(1, length / 3) * speed - p.vz) * Math.min(1, dt * 6);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
  }

  if (taker) {
    // Walk to the ball.
    const dx = restart.x - taker.x;
    const dz = restart.z - taker.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.5) {
      const speed = 5.5;
      taker.vx = (dx / length) * speed;
      taker.vz = (dz / length) * speed;
      taker.x += taker.vx * dt;
      taker.z += taker.vz * dt;
      return;
    }
    taker.vx = 0;
    taker.vz = 0;
  }

  restart.delay -= dt;
  if (restart.delay > 0) return;

  // A stoppage is rest, credited once per restart rather than per tick. Ticked
  // recovery would depend on how long a restart happens to take, and a restart
  // takes the same wall-clock time whatever the half length — so short matches
  // would rest proportionally far more than long ones.
  recover(state, 1.1 * (720 / (state.halfLength * 2)));
  considerSubstitutions(state);

  // Play it.
  if (restart.taker !== null) {
    state.ball.owner = restart.taker;
    state.lastTouch = restart.taker;
    const p = state.players[restart.taker]!;
    if (p.team === 0) state.controlledIndex = restart.taker;
  }
  state.restart = null;
  state.phase = 'live';

  // A penalty is struck immediately; everything else is played out.
  if (restart.type === 'penalty' && restart.taker !== null) {
    shoot(state, restart.taker);
  } else if (restart.type === 'corner' && restart.taker !== null) {
    cross(state, restart.taker);
  } else if (restart.taker !== null) {
    pass(state, restart.taker);
  }
}

/**
 * Brings a fresh player on.
 *
 * The substitute takes over the outgoing player's array index rather than
 * being appended, so every index held elsewhere — the ball's owner, the
 * controlled player, a restart's taker — stays valid. Reindexing the squad
 * mid-match would invalidate all of them at once.
 */
function substitute(state: MatchState, index: number, replacement: Player): void {
  const out = state.players[index];
  if (!out) return;

  out.id = replacement.id;
  out.number = replacement.number;
  out.last = replacement.last;
  out.pace = replacement.attributes.pace;
  out.passing = replacement.attributes.passing;
  out.shooting = replacement.attributes.shooting;
  out.defending = replacement.attributes.defending;
  out.skillMoves = replacement.skillMoves;
  out.weakFoot = replacement.weakFoot;
  out.preferredFoot = replacement.preferredFoot;
  out.cards = 'none';
  out.shotCooldown = 0;
  // Fresh legs are the entire point.
  out.stamina = 100;
}

/**
 * Makes any substitutions a side wants at this stoppage.
 *
 * Managers change tired players, and only at a break in play — which is why
 * this runs from the restart handler rather than the main loop.
 */
function considerSubstitutions(state: MatchState): void {
  for (const team of [0, 1] as const) {
    if (state.subsUsed[team] >= 3) continue;
    const bench = state.bench[team];
    if (bench.length === 0) continue;

    // The most tired outfield player, if they are genuinely spent.
    let worst = -1;
    let worstStamina = 46;
    state.players.forEach((p, i) => {
      if (p.team !== team || isKeeper(state, i)) return;
      if (p.stamina < worstStamina) {
        worstStamina = p.stamina;
        worst = i;
      }
    });
    if (worst < 0) continue;

    // Bring on whoever best covers that role.
    const outgoing = state.players[worst]!;
    const position = ROLES[outgoing.slot] ?? 'midfield';
    let choice = 0;
    let bestFit = -Infinity;
    bench.forEach((candidate, i) => {
      const fit = candidate.overall + (positionSuits(candidate.position, position) ? 8 : 0);
      if (fit > bestFit) {
        bestFit = fit;
        choice = i;
      }
    });

    const [replacement] = bench.splice(choice, 1);
    if (!replacement) continue;

    const departing = outgoing.last;
    substitute(state, worst, replacement);
    state.subsUsed[team] += 1;
    state.events.push({
      type: 'substitution',
      team,
      player: `${replacement.last} for ${departing}`,
      minute: minuteOf(state),
    });
    state.decision = {
      text: 'Substitution',
      detail: `${replacement.last} on for ${departing}`,
      until: state.clock + 3.2,
    };
  }
}

/** Whether a squad position covers a formation role. */
function positionSuits(position: Player['position'], role: Role): boolean {
  switch (role) {
    case 'centreBack':
      return position === 'CB';
    case 'fullBack':
      return position === 'LB' || position === 'RB';
    case 'midfield':
      return position === 'CDM' || position === 'CM' || position === 'CAM';
    case 'winger':
      return position === 'LW' || position === 'RW';
    case 'striker':
      return position === 'ST';
    default:
      return position === 'GK';
  }
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

  // ---- Restarts -----------------------------------------------------------
  if (state.phase === 'restart') {
    state.clock += dt;
    stepRestart(state, dt);
    return state;
  }

  // ---- Non-live phases ----------------------------------------------------
  if (state.phase !== 'live') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.phase === 'goal') {
        const conceding = state.lastGoal?.team === 0 ? 1 : 0;
        // Flat, not scaled by match length. A celebration is a fixed rest,
        // and goals per match do not change with half length — scaling this
        // handed a three-minute half four times the recovery of a twelve.
        recover(state, 4);
        resetPositions(state, conceding);
        state.phase = 'live';
      } else if (state.phase === 'halftime') {
        state.half = 2;
        recover(state, 22);
        considerSubstitutions(state);
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

  // Each side's defensive line, computed once rather than per player.
  const lines: [number, number] = [
    defensiveLine(state.players, 0, ball, owner?.team === 0),
    defensiveLine(state.players, 1, ball, owner?.team === 1),
  ];

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
      // Off the line to narrow the angle, but only a little — and *less* the
      // closer the ball gets, because a keeper standing metres out when the
      // shot arrives cannot get back to cover the goal. The previous form had
      // this inverted and put them 5m off their line as the ball crossed it.
      const line = ownGoalX(p.team) * 0.985;
      const ballRange = Math.abs(ball.x - line);
      const advance = Math.min(1.6, Math.max(0, (ballRange - 8) / 14) * 1.6);
      const targetX = line - Math.sign(line) * advance;
      const targetZ = Math.max(-GOAL_WIDTH, Math.min(GOAL_WIDTH, ball.z * 0.55));
      const dx = targetX - p.x;
      const dz = targetZ - p.z;
      const length = Math.hypot(dx, dz) || 1;
      const urgency = Math.min(1, length / 1.5);
      ax = (dx / length) * urgency;
      az = (dz / length) * urgency;
    } else {
      // Everyone else takes their target from the off-ball model: role, the
      // line their team is holding, and whether their side has the ball.
      const hasPossession = owner?.team === p.team;
      const settle = ball.owner === null ? restingPoint(ball) : { x: ball.x, z: ball.z };
      const target = offBallTarget(p, {
        players: state.players,
        ball,
        owner: ball.owner,
        hasPossession,
        line: lines[p.team]!,
        isPresser: nearestToBall(state, p.team) === i,
        settle,
      });

      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const length = Math.hypot(dx, dz) || 1;
      // Ease off as the target is reached, so players settle rather than
      // jittering around a point.
      const urgency = target.urgency * Math.min(1, length / 3.5);
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
      ball.spin = 0;
    }
  }

  // ---- Actions ------------------------------------------------------------
  // Both sides share one decision path. The user overrides it only while they
  // are actually playing; an untouched controller hands the ball back to the
  // AI, which is what keeps an unattended match a match rather than a stalemate.
  if (owner && ball.owner !== null) {
    const userOnBall = ball.owner === state.controlledIndex && owner.team === 0;

    if (userOnBall && intent.shoot) shoot(state, ball.owner, intent.shotType);
    else if (userOnBall && intent.pass) pass(state, ball.owner);
    else if (!userOnBall || !userActing) decideOnBall(state, ball.owner, dt);
  }

  // ---- Loose ball ---------------------------------------------------------
  if (ball.owner === null) {
    integrate(ball, dt);

    checkGoal(state);
    if (state.phase !== 'live') return state;

    // Out of play, before anyone can pick it up beyond the line.
    const out = checkOutOfPlay(ball);
    if (out.kind !== 'none') {
      const toucher = state.lastTouch === null ? null : state.players[state.lastTouch];
      const restart = restartForOutOfPlay(out, ball, toucher?.team ?? 0);
      if (restart.type === 'corner') state.corners[restart.team] += 1;
      beginRestart(state, restart, restartLabel(restart.type), '');
      return state;
    }

    // First player within reach takes possession. Reach grows a little with
    // how fast the ball is travelling, so a driven pass is not simply walked
    // through by whoever happens to be standing near it.
    const pace = groundSpeed(ball);
    // Control shrinks as the ball speeds up: a driven shot is harder to take
    // than a rolling one, not easier. Growing reach with pace — as this did —
    // meant the harder a shot was struck the more likely it was intercepted,
    // and almost none survived the flight to the goal.
    const baseReach = Math.max(0.62, 0.95 - pace * 0.008);

    // Whoever is *nearest* takes it, not whoever comes first in the array.
    // Team 0 occupies indices 0-10 and team 1 occupies 11-21, so scanning in
    // index order and taking the first player in range handed team 0 every
    // fifty-fifty in the match — worth twice the shots and seven times the
    // saves before this was found.
    let claimant = -1;
    let claimDistance = Infinity;

    for (let i = 0; i < state.players.length; i += 1) {
      const p = state.players[i]!;

      // A keeper commands their area rather than waiting on the line. Without
      // this, every ball that trickles goalward reaches the frame and gets
      // counted as a shot on target — nearly twenty a match.
      const keeper = isKeeper(state, i);
      const inOwnArea =
        keeper && Math.abs(p.x - ownGoalX(p.team)) < 16.5 && Math.abs(p.z) < 20.16;
      // A keeper gathers a loose ball or a back-pass in their area, but they
      // cannot simply pick up a shot travelling at thirty metres a second —
      // that has to be saved, which is handled at the goal line.
      const canGather = inOwnArea && pace < 13;
      const reach = canGather ? 3.2 : baseReach;
      const ceiling = canGather ? 2.6 : 1.5;

      if (ball.y > ceiling) continue;
      const distance = distanceToBall(p, ball);
      if (distance > reach) continue;

      // A keeper in their own box beats an outfield player to it.
      const weighted = canGather ? distance * 0.5 : distance;
      if (weighted < claimDistance) {
        claimDistance = weighted;
        claimant = i;
      }
    }

    if (claimant >= 0) {
      const p = state.players[claimant]!;

      // A pass reaching anyone who was offside when it was played is called.
      const played = state.passIntent;
      if (played && p.team === played.team && played.offside.includes(claimant)) {
        state.offsides[p.team] += 1;
        state.passIntent = null;
        const restart = restartForOffside(p);
        beginRestart(state, restart, 'Offside', p.last);
        state.events.push({
          type: 'offside',
          team: p.team,
          player: p.last,
          minute: minuteOf(state),
        });
        return state;
      }

      takePossession(state, claimant);
    }
  } else {
    // ---- Tackling ---------------------------------------------------------
    const carrier = state.players[ball.owner]!;

    // Nearest challenger, not first by index — the same bias as above.
    let challenger = -1;
    let challengeGap = Infinity;
    for (let i = 0; i < state.players.length; i += 1) {
      const p = state.players[i]!;
      if (p.team === carrier.team) continue;
      const gap = Math.hypot(p.x - carrier.x, p.z - carrier.z);
      if (gap <= 1.2 && gap < challengeGap) {
        challengeGap = gap;
        challenger = i;
      }
    }

    const tackler = challenger >= 0 ? state.players[challenger]! : null;
    if (tackler) {
      const odds = (tackler.defending / (tackler.defending + carrier.pace)) * dt * 3.2;
      if (state.rng.next() < odds) {
        // Closing speed decides how the challenge is judged.
        const closing = Math.hypot(tackler.vx - carrier.vx, tackler.vz - carrier.vz);
        const cleanlyWon =
          state.rng.next() < tackler.defending / (tackler.defending + carrier.pace);
        const verdict = judgeTackle(cleanlyWon, closing, tackler.defending, () => state.rng.next());

        if (verdict.foul) {
          state.fouls[tackler.team] += 1;
          if (verdict.card === 'red') tackler.cards = 'red';
          else if (verdict.card === 'yellow') tackler.cards = nextCard(tackler);

          const restart = restartForFoul(carrier.x, carrier.z, tackler.team);
          const label =
            restart.type === 'penalty'
              ? 'Penalty'
              : verdict.card === 'red'
                ? 'Red card'
                : verdict.card === 'yellow'
                  ? 'Yellow card'
                  : 'Free kick';

          beginRestart(state, restart, label, tackler.last);
          state.events.push({
            type: 'foul',
            team: tackler.team,
            player: tackler.last,
            minute: minuteOf(state),
          });
          if (verdict.card !== 'none') {
            state.events.push({
              type: verdict.card,
              team: tackler.team,
              player: tackler.last,
              minute: minuteOf(state),
            });
          }
          return state;
        }

        if (cleanlyWon) takePossession(state, challenger);
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

  // A defender under pressure in their own third clears their lines rather
  // than trying to dribble out of trouble. This is most of what a back four
  // does with the ball, and it is where corners and throw-ins come from.
  const ownGoal = ownGoalX(carrier.team);
  const ownThird = Math.abs(carrier.x - ownGoal) < 30;
  const isDefender = carrier.slot >= 1 && carrier.slot <= 4;
  if (ownThird && (isDefender || pressure < 2.4) && state.rng.next() < dt * 1.4) {
    clear(state, index);
    return;
  }

  // Nobody shoots into a defender's shins from a metre away. Without this the
  // shot count runs away and almost none of them reach the goal, because they
  // are all blocked the instant they are struck.
  const laneBlocked = isShootingLaneBlocked(state, carrier, goalX);

  // Shooting: near-certain inside the box, tailing off to nothing past 30m.
  // A player who has just struck the ball needs to reset before the next one;
  // without this, a save that drops in the six-yard box draws a burst of
  // point-blank shots from the same striker and the shot count runs away.
  if (range < 30 && carrier.shotCooldown <= 0 && !laneBlocked) {
    // A flatter curve than pure proximity: real teams shoot from range too,
    // and a mix weighted almost entirely to six-yard chances puts every shot
    // on target and turns the keeper into a wall.
    const appetite = (1 - range / 30) ** 0.8;
    const confidence = 0.35 + (carrier.shooting / 99) * 0.65;
    const squeezed = pressure < 2.2 ? 1.5 : 1;
    if (state.rng.next() < appetite * confidence * squeezed * dt * 0.95) {
      // Close in, a player places it; from distance they hit it. Good
      // finishers curl more of them.
      const finesseChance = range < 14 ? 0.35 + (carrier.shooting / 99) * 0.3 : 0.12;
      const type: ShotType =
        state.rng.next() < finesseChance ? 'finesse' : range > 22 ? 'power' : 'driven';
      shoot(state, index, type);
      return;
    }
  }

  // Passing: constantly under pressure, occasionally in space to keep it moving.
  const passUrge = pressure < 3 ? 2.6 : pressure < 7 ? 1.1 : 0.45;
  if (state.rng.next() < passUrge * dt) pass(state, index);
}

/**
 * Whether an opponent is standing in the way of a shot at goal.
 *
 * Measured as perpendicular distance from the line to goal, only counting
 * opponents actually between the shooter and the target.
 */
function isShootingLaneBlocked(state: MatchState, shooter: SimPlayer, goalX: number): boolean {
  const dx = goalX - shooter.x;
  const dz = -shooter.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;

  for (const p of state.players) {
    if (p.team === shooter.team) continue;
    const rx = p.x - shooter.x;
    const rz = p.z - shooter.z;
    // How far along the line to goal they stand.
    const along = rx * ux + rz * uz;
    if (along < 0.4 || along > Math.min(length, 9)) continue;
    // How far off it.
    const across = Math.abs(rx * uz - rz * ux);
    if (across < 1.1) return true;
  }
  return false;
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

  // Prefer a team-mate ahead of the ball and in space — and, since offside is
  // now enforced, one who is actually onside when the ball is played.
  let target: SimPlayer | null = null;
  let targetIndex = -1;
  let bestScore = -Infinity;

  state.players.forEach((p, i) => {
    if (p.team !== passer.team || p === passer) return;
    const distance = Math.hypot(p.x - passer.x, p.z - passer.z);
    if (distance < 3 || distance > 38) return;
    // A good passer times the ball; a poor one plays team-mates offside. If
    // offside targets are filtered out entirely the law never fires, because
    // nothing in the simulation would ever break it.
    if (isOffside(p, passer, state.players, state.ball.x)) {
      if (state.rng.next() > (1 - passer.passing / 99) * 0.35) return;
    }

    const progress = (goalX > 0 ? p.x - passer.x : passer.x - p.x) / 10;
    let nearestOpponent = Infinity;
    for (const o of state.players) {
      if (o.team === passer.team) continue;
      nearestOpponent = Math.min(nearestOpponent, Math.hypot(o.x - p.x, o.z - p.z));
    }
    const score = progress + nearestOpponent * 0.25 - distance * 0.04;
    if (score > bestScore) {
      bestScore = score;
      target = p;
      targetIndex = i;
    }
  });

  const receiver = target as SimPlayer | null;
  if (!receiver) return;

  const dx = receiver.x - passer.x;
  const dz = receiver.z - passer.z;
  const distance = Math.hypot(dx, dz) || 1;

  // Weight the pass to arrive, with error scaled off the passer's rating.
  // Ball speed accounts for rolling resistance, so short passes are not
  // hammered and long ones do reach.
  const power = Math.min(30, 6 + distance * 1.05);
  const error = (1 - passer.passing / 120) * 0.26;
  const angle = Math.atan2(dz, dx) + (state.rng.next() - 0.5) * error;
  const loft = distance > 22 ? 3.6 : 0;
  const spin = (state.rng.next() - 0.5) * 14 * (1 - passer.passing / 140);

  strike(state.ball, angle, power, loft, spin);
  state.lastTouch = from;
  const offside: number[] = [];
  state.players.forEach((p, i) => {
    if (p.team !== passer.team || i === from) return;
    if (isOffside(p, passer, state.players, passer.x)) offside.push(i);
  });

  state.passIntent = {
    from,
    target: targetIndex,
    team: passer.team,
    ballX: passer.x,
    offside,
  };
}

/**
 * A clearance: distance and height over accuracy. Often finds a team-mate,
 * often finds touch — which is exactly what makes it a clearance.
 */
function clear(state: MatchState, from: number) {
  const player = state.players[from]!;
  const dir = player.team === 0 ? 1 : -1;
  const ownGoal = ownGoalX(player.team);

  state.lastTouch = from;
  state.passIntent = null;

  // Deep inside their own area with nowhere to go, a defender concedes the
  // corner on purpose rather than risk playing it across their own box.
  if (Math.abs(player.x - ownGoal) < 13 && state.rng.next() < 0.3) {
    const behind = Math.atan2(Math.sign(player.z || 1) * 12, -dir * 14);
    strike(state.ball, behind, 16 + state.rng.next() * 8, 4, 0);
    return;
  }

  // Otherwise upfield, angled toward the nearest touchline as often as not.
  const wide = state.rng.next() < 0.55;
  const towardZ = wide ? Math.sign(player.z || 1) * 34 : (state.rng.next() - 0.5) * 30;
  const angle = Math.atan2(towardZ - player.z, dir * 45);

  strike(state.ball, angle, 26 + state.rng.next() * 10, 7 + state.rng.next() * 3, 0);
}

/** A corner: hung into the box rather than played to feet. */
function cross(state: MatchState, from: number) {
  const crosser = state.players[from]!;
  const goalX = goalMouthX(crosser.team);
  // Aim at the penalty spot, give or take.
  const aimX = goalX - Math.sign(goalX) * (9 + state.rng.next() * 5);
  const aimZ = (state.rng.next() - 0.5) * 12;
  const dx = aimX - crosser.x;
  const dz = aimZ - crosser.z;
  const distance = Math.hypot(dx, dz) || 1;

  const angle = Math.atan2(dz, dx) + (state.rng.next() - 0.5) * 0.14;
  strike(
    state.ball,
    angle,
    distance * 0.92,
    6.5,
    // Corners are whipped; the spin is what bends them toward or away from goal.
    (crosser.z > 0 ? -1 : 1) * (18 + state.rng.next() * 14),
  );
  state.lastTouch = from;
  state.passIntent = null;
}

function shoot(state: MatchState, from: number, type: ShotType = 'driven') {
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
  // Finesse trades power for placement; power does the reverse. Driven sits
  // between them, which is why it is the default.
  const placementBonus = type === 'finesse' ? 0.14 : type === 'power' ? -0.09 : 0;
  const onTargetChance = Math.max(
    0.08,
    Math.min(
      0.7,
      0.26 + accuracy * 0.3 - Math.max(0, distance - 6) * 0.011 + placementBonus,
    ),
  );
  const onTarget = state.rng.next() < onTargetChance;

  // On target: somewhere inside the frame, better players nearer the corners.
  // Off target: past a post or over the bar, by a plausible margin.
  const half = GOAL_WIDTH / 2;
  let aimZ: number;
  if (onTarget) {
    aimZ = (state.rng.next() - 0.5) * 2 * half * (0.55 + accuracy * 0.4);
  } else {
    const side = state.rng.next() < 0.5 ? -1 : 1;
    aimZ = side * (half + 0.6 + state.rng.next() * 4.5);
  }

  const angle = Math.atan2(aimZ - shooter.z, dx);
  const powerScale = type === 'finesse' ? 0.8 : type === 'power' ? 1.3 : 1;
  const power = (24 + accuracy * 13) * powerScale;

  // A shot that is off target is as often lifted over as dragged wide.
  const loft = onTarget
    ? Math.min(2.2, distance * 0.03)
    : state.rng.next() < 0.4
      ? 5.5 + state.rng.next() * 3
      : Math.min(2.5, distance * 0.04);

  // Better finishers put more shape on it; the bend is what makes a struck
  // ball look struck rather than launched. A finesse shot is defined by it.
  const spinScale = type === 'finesse' ? 2.4 : type === 'power' ? 0.5 : 1;
  const spin = (state.rng.next() - 0.5) * 2 * (14 + accuracy * 30) * spinScale;

  strike(state.ball, angle, power, loft, spin);
  state.lastTouch = from;
  state.passIntent = null;
  state.lastShot = { type, at: state.clock, team: shooter.team };
}

function checkGoal(state: MatchState) {
  const ball = state.ball;
  if (Math.abs(ball.x) < HALF_L) return;
  if (!isBetweenPosts(ball)) return;

  // The keeper defending this goal gets a chance first.
  //
  // Expressed as an explicit probability rather than a threshold comparison:
  // the previous form saturated near 1 for most shots, so a small change to
  // one coefficient swung the match from 1.6 goals to 12.7.
  const defendingTeam: 0 | 1 = ball.x > 0 ? 1 : 0;
  const keeperIndex = defendingTeam === 0 ? 0 : 11;
  const keeper = state.players[keeperIndex];

  if (keeper) {
    const skill = keeper.defending / 99;
    // Keepers dive across the goal, so lateral distance is what they have to
    // cover; being a step off the line matters far less.
    const travel = Math.hypot((keeper.x - ball.x) * 0.45, keeper.z - ball.z);
    const power = Math.hypot(ball.vx, ball.vz);

    // How much of the goal they can reach, and how well placed they were.
    const reach = 2.2 + skill * 3.0;
    const coverage = Math.max(0, Math.min(1, 1 - travel / reach));

    // A ball struck hard gives them less time to get down to it.
    const speedPenalty = Math.max(0.3, Math.min(1, 1 - (power - 14) / 34));

    const saveChance = Math.min(0.93, coverage * speedPenalty * (0.55 + skill * 0.55));

    if (state.rng.next() < saveChance) {
      // Saved. Roughly a third are tipped behind for a corner — which is
      // where corners come from, since defenders in this simulation never
      // put the ball out themselves.
      const side = Math.sign(ball.x) || 1;
      ball.owner = null;
      ball.spin = 0;
      state.lastTouch = keeperIndex;
      state.saves[defendingTeam] += 1;

      if (state.rng.next() < 0.34) {
        ball.x = side * (HALF_L + 0.4);
        ball.vx = side * 3;
        ball.vz = (state.rng.next() < 0.5 ? -1 : 1) * (6 + state.rng.next() * 7);
        ball.vy = 1.4;
      } else {
        ball.x = side * (HALF_L - 3.5);
        ball.vx = -side * (6 + state.rng.next() * 10);
        ball.vz = (state.rng.next() < 0.5 ? -1 : 1) * (9 + state.rng.next() * 11);
        ball.vy = 2.2;
      }
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
  state.events.push({ type: 'goal', team, player: scorer, minute: minuteOf(state) });
  state.phase = 'goal';
  state.phaseTimer = 4.2;
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

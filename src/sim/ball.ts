/**
 * Ball physics.
 *
 * Modelled in SI units against a real match ball — 0.43kg, 0.11m radius — so
 * the constants are checkable against reality rather than dialled in by feel.
 * The three forces that matter are quadratic air drag, the Magnus force from
 * spin, and gravity; everything a player notices about how a ball travels
 * comes out of those.
 */

export interface Ball {
  x: number;
  z: number;
  /** Height above the turf, metres. */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** Spin about the vertical axis, rad/s. Positive curls toward +z. */
  spin: number;
  /** Index into players, or null when loose. */
  owner: number | null;
}

export const BALL_RADIUS = 0.11;
const MASS = 0.43;
const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;

/**
 * Quadratic drag: a = -(½ ρ Cd A / m) · v · |v|.
 * Cd ≈ 0.25 for a modern ball above the drag crisis, which is where a struck
 * ball spends nearly all its flight.
 */
const DRAG_K = (0.5 * AIR_DENSITY * 0.25 * Math.PI * BALL_RADIUS ** 2) / MASS;

/**
 * Magnus coefficient, in the rotational form used below: the lateral
 * acceleration is |v| · (K · spin · |v|).
 *
 * Calibrated against a real free kick — 30 m/s, ~63 rad/s of spin, bending
 * about 3m over 25m. That needs ~8.7 m/s² of lateral acceleration, so
 * K = 8.7 / (30 · 63 · 30).
 */
const MAGNUS_K = 0.000153;

/** Coefficient of restitution on turf, and how much a bounce scrubs off. */
const BOUNCE = 0.55;
const BOUNCE_FRICTION = 0.72;

/** Rolling resistance on grass, as a deceleration in m/s². */
const ROLL_DECEL = 3.4;

/** Spin decays on its own, and much faster once the ball is rolling. */
const SPIN_DECAY_AIR = 0.35;
const SPIN_DECAY_GROUND = 3.2;

export function createBall(): Ball {
  return { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, spin: 0, owner: null };
}

/** Speed across the ground, ignoring height. */
export function groundSpeed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vz);
}

export function isAirborne(ball: Ball): boolean {
  return ball.y > 0.02;
}

/**
 * Advances a loose ball by one tick. Returns true if it bounced this step,
 * which the caller uses for audio and for scuffing the turf.
 */
export function integrate(ball: Ball, dt: number): boolean {
  const airborne = isAirborne(ball);
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);

  if (speed > 0.01) {
    // ---- Air drag, opposing the velocity vector -------------------------
    const drag = DRAG_K * speed;
    ball.vx -= ball.vx * drag * dt;
    ball.vy -= ball.vy * drag * dt;
    ball.vz -= ball.vz * drag * dt;

    // ---- Magnus, perpendicular to travel in the horizontal plane --------
    // Spin about the vertical axis turns forward motion into sideways force,
    // which is the whole of a bending free kick.
    if (Math.abs(ball.spin) > 0.05) {
      // Cache before writing: using the updated vx to compute vz rotates the
      // vector by the wrong amount and quietly adds energy to the ball.
      const vx = ball.vx;
      const vz = ball.vz;
      const lift = MAGNUS_K * ball.spin * speed * dt;
      ball.vx += -vz * lift;
      ball.vz += vx * lift;
    }
  }

  if (airborne) {
    ball.vy -= GRAVITY * dt;
    ball.spin -= ball.spin * SPIN_DECAY_AIR * dt;
  } else {
    // ---- Rolling --------------------------------------------------------
    const rolling = groundSpeed(ball);
    if (rolling > 0.01) {
      const decel = Math.min(rolling, ROLL_DECEL * dt);
      ball.vx -= (ball.vx / rolling) * decel;
      ball.vz -= (ball.vz / rolling) * decel;
    } else {
      ball.vx = 0;
      ball.vz = 0;
    }
    ball.spin -= ball.spin * SPIN_DECAY_GROUND * dt;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  // ---- Ground contact ---------------------------------------------------
  let bounced = false;
  if (ball.y <= 0) {
    ball.y = 0;
    if (ball.vy < -0.6) {
      ball.vy = -ball.vy * BOUNCE;
      ball.vx *= BOUNCE_FRICTION;
      ball.vz *= BOUNCE_FRICTION;
      // A bouncing ball grips and sheds sideways spin into direction.
      ball.vz += ball.spin * 0.012;
      ball.spin *= 0.55;
      bounced = true;
    } else {
      ball.vy = 0;
    }
  }

  return bounced;
}

/** Strikes the ball from rest at the striker's feet. */
export function strike(
  ball: Ball,
  angle: number,
  power: number,
  loft: number,
  spin = 0,
): void {
  ball.owner = null;
  ball.vx = Math.cos(angle) * power;
  ball.vz = Math.sin(angle) * power;
  ball.vy = loft;
  ball.spin = spin;
}

/** Where a rolling ball will come to rest, used by AI to read a loose ball. */
export function restingPoint(ball: Ball): { x: number; z: number } {
  const speed = groundSpeed(ball);
  if (speed < 0.01 || isAirborne(ball)) return { x: ball.x, z: ball.z };
  // v² = 2·a·d under constant rolling deceleration.
  const distance = (speed * speed) / (2 * ROLL_DECEL);
  return {
    x: ball.x + (ball.vx / speed) * distance,
    z: ball.z + (ball.vz / speed) * distance,
  };
}

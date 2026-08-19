import { describe, expect, it } from 'vitest';
import { createBall, groundSpeed, integrate, restingPoint, strike } from '../ball';

const DT = 1 / 240; // fine steps, so integration error does not muddy the check

/** Runs the ball until it stops or `seconds` elapse. */
function simulate(ball = createBall(), seconds = 6) {
  let bounces = 0;
  for (let t = 0; t < seconds; t += DT) {
    if (integrate(ball, DT)) bounces += 1;
  }
  return { ball, bounces };
}

describe('ball physics', () => {
  it('a struck ball slows down', () => {
    const ball = createBall();
    strike(ball, 0, 30, 0);
    const before = groundSpeed(ball);
    simulate(ball, 1);
    expect(groundSpeed(ball)).toBeLessThan(before);
  });

  it('a rolling ball comes to rest and stays there', () => {
    const ball = createBall();
    strike(ball, 0, 8, 0);
    simulate(ball, 8);
    expect(groundSpeed(ball)).toBeLessThan(0.05);
    const x = ball.x;
    simulate(ball, 2);
    expect(ball.x).toBeCloseTo(x, 3);
  });

  it('predicts where a rolling ball will stop', () => {
    const ball = createBall();
    strike(ball, 0, 12, 0);
    const predicted = restingPoint(ball);
    simulate(ball, 10);
    // Drag makes the ball stop slightly short of the rolling-only prediction.
    expect(ball.x).toBeGreaterThan(predicted.x * 0.7);
    expect(ball.x).toBeLessThanOrEqual(predicted.x + 0.5);
  });

  it('a lofted ball comes back down and bounces', () => {
    const ball = createBall();
    strike(ball, 0, 18, 9);
    const { bounces } = simulate(ball, 6);
    expect(bounces).toBeGreaterThan(0);
    expect(ball.y).toBeLessThan(0.5);
  });

  it('each bounce is lower than the last', () => {
    const ball = createBall();
    strike(ball, 0, 0, 8);
    const peaks: number[] = [];
    let rising = true;
    let peak = 0;
    for (let t = 0; t < 8; t += DT) {
      const previous = ball.y;
      integrate(ball, DT);
      if (ball.y > previous) rising = true;
      else if (rising) {
        rising = false;
        peak = previous;
        if (peak > 0.05) peaks.push(peak);
      }
    }
    expect(peaks.length).toBeGreaterThan(2);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
    }
  });

  it('never falls through the turf', () => {
    const ball = createBall();
    strike(ball, 0.4, 24, 7);
    for (let t = 0; t < 8; t += DT) {
      integrate(ball, DT);
      expect(ball.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('bends a spinning ball, and the right way', () => {
    const straight = createBall();
    strike(straight, 0, 30, 2, 0);
    simulate(straight, 0.85);

    const curled = createBall();
    strike(curled, 0, 30, 2, 63);
    simulate(curled, 0.85);

    // Positive spin curls toward +z, per the field convention.
    expect(curled.z).toBeGreaterThan(straight.z);

    const opposite = createBall();
    strike(opposite, 0, 30, 2, -63);
    simulate(opposite, 0.85);
    expect(opposite.z).toBeLessThan(straight.z);
  });

  it('bends by roughly the amount a real free kick does', () => {
    // A 30 m/s strike with ~63 rad/s of spin bends about 3m over 25m.
    const ball = createBall();
    strike(ball, 0, 30, 2, 63);
    for (let t = 0; t < 3 && ball.x < 25; t += DT) integrate(ball, DT);
    expect(Math.abs(ball.z)).toBeGreaterThan(1.2);
    expect(Math.abs(ball.z)).toBeLessThan(6);
  });

  it('does not gain energy from spin', () => {
    // The Magnus term rotates the velocity; it must not lengthen it.
    const ball = createBall();
    strike(ball, 0, 30, 3, 90);
    const start = Math.hypot(ball.vx, ball.vy, ball.vz);
    for (let t = 0; t < 0.4; t += DT) integrate(ball, DT);
    expect(Math.hypot(ball.vx, ball.vy, ball.vz)).toBeLessThan(start);
  });

  it('spin decays, faster on the ground than in the air', () => {
    const air = createBall();
    strike(air, 0, 20, 12, 60);
    for (let t = 0; t < 0.5; t += DT) integrate(air, DT);

    const ground = createBall();
    strike(ground, 0, 20, 0, 60);
    for (let t = 0; t < 0.5; t += DT) integrate(ground, DT);

    expect(Math.abs(ground.spin)).toBeLessThan(Math.abs(air.spin));
  });

  it('travels a plausible distance for a hard pass', () => {
    // 25 m/s along the ground should carry a long way, but not the pitch.
    const ball = createBall();
    strike(ball, 0, 25, 0);
    simulate(ball, 10);
    expect(ball.x).toBeGreaterThan(30);
    expect(ball.x).toBeLessThan(105);
  });
});

import { describe, expect, it } from 'vitest';
import { ReplayBuffer, ReplayPlayer } from '../replay';
import { createMatch, step, NO_INTENT } from '../match';
import { generateWorld, startingEleven } from '@/world/generate';

const world = generateWorld('replay-test');
const [homeId, awayId] = world.leagues[0]!.clubIds;
const home = startingEleven(world.clubs[homeId!]!);
const away = startingEleven(world.clubs[awayId!]!);

/** Records `seconds` of play at 60fps into a fresh buffer. */
function recorded(seconds: number) {
  const state = createMatch(home, away, { halfLength: 4 });
  const buffer = new ReplayBuffer();
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i += 1) {
    step(state, NO_INTENT, dt);
    buffer.record(state, dt);
  }
  return { state, buffer };
}

describe('replay buffer', () => {
  it('records at a fixed rate regardless of frame rate', () => {
    const state = createMatch(home, away);
    const fast = new ReplayBuffer();
    const slow = new ReplayBuffer();
    for (let i = 0; i < 240; i += 1) {
      step(state, NO_INTENT, 1 / 60);
      fast.record(state, 1 / 60);
    }
    for (let i = 0; i < 80; i += 1) {
      step(state, NO_INTENT, 1 / 20);
      slow.record(state, 1 / 20);
    }
    // Both saw four seconds of play, so both hold four seconds of footage.
    expect(fast.seconds).toBeCloseTo(4, 0);
    expect(slow.seconds).toBeCloseTo(4, 0);
  });

  it('caps at the rolling window rather than growing without bound', () => {
    const { buffer } = recorded(30);
    expect(buffer.seconds).toBeLessThanOrEqual(8);
    expect(buffer.takeLast(60).length).toBeLessThanOrEqual(8 * 30);
  });

  it('returns the most recent footage, oldest first', () => {
    const { buffer } = recorded(6);
    const clip = buffer.takeLast(2);
    expect(clip.length).toBe(60);
    // The clip should end at the newest sample, so consecutive frames differ.
    const first = clip[0]!;
    const last = clip[clip.length - 1]!;
    expect(first.players).not.toEqual(last.players);
  });

  it('holds a full frame of positions for every player', () => {
    const { state, buffer } = recorded(3);
    const frame = buffer.takeLast(1)[0]!;
    expect(frame.players.length).toBe(state.players.length * 4);
    for (const value of frame.players) expect(Number.isFinite(value)).toBe(true);
  });

  it('empties on clear', () => {
    const { buffer } = recorded(4);
    buffer.clear();
    expect(buffer.seconds).toBe(0);
    expect(buffer.takeLast(4)).toHaveLength(0);
  });
});

describe('replay playback', () => {
  it('runs to completion at the chosen speed', () => {
    const { buffer } = recorded(6);
    const clip = buffer.takeLast(3); // 90 frames at 30Hz = 3s of footage
    const player = new ReplayPlayer(clip, 0.5);

    let wall = 0;
    while (!player.done && wall < 30) {
      player.advance(1 / 60);
      wall += 1 / 60;
    }
    expect(player.done).toBe(true);
    // At half speed, three seconds of footage takes about six to play.
    expect(wall).toBeGreaterThan(5);
    expect(wall).toBeLessThan(7);
  });

  it('reports progress from 0 to 1', () => {
    const { buffer } = recorded(4);
    const player = new ReplayPlayer(buffer.takeLast(2), 0.4);
    expect(player.progress).toBe(0);
    while (!player.done) player.advance(1 / 60);
    expect(player.progress).toBe(1);
  });

  it('interpolates between recorded samples', () => {
    const { buffer } = recorded(4);
    const clip = buffer.takeLast(2);
    const player = new ReplayPlayer(clip, 0.4);
    player.advance(1 / 120); // less than one recorded frame

    const frame = player.current()!;
    const a = clip[0]!;
    const b = clip[1]!;
    // The interpolated ball sits between the two samples it came from.
    const low = Math.min(a.ballX, b.ballX);
    const high = Math.max(a.ballX, b.ballX);
    expect(frame.ballX).toBeGreaterThanOrEqual(low - 1e-6);
    expect(frame.ballX).toBeLessThanOrEqual(high + 1e-6);
  });

  it('survives an empty clip', () => {
    const player = new ReplayPlayer([], 0.4);
    expect(player.current()).toBeNull();
    expect(player.done).toBe(true);
  });
});

import type { MatchState } from './match';

/**
 * Replay buffer.
 *
 * Records a rolling window of positions so a goal can be shown back. Only
 * positions are kept — not whole match states — because a replay needs to
 * *look* like the passage of play, not be able to resume from it. 22 players
 * plus a ball is 47 floats a frame, so eight seconds at 30Hz costs about 45KB.
 */

export interface ReplayFrame {
  /** Flat [x, z, vx, vz] per player, in squad order. */
  players: Float32Array;
  ballX: number;
  ballY: number;
  ballZ: number;
  ballVX: number;
  ballVZ: number;
}

const RECORD_HZ = 30;
const WINDOW_SECONDS = 8;
const CAPACITY = RECORD_HZ * WINDOW_SECONDS;

export class ReplayBuffer {
  private readonly frames: ReplayFrame[] = [];
  private write = 0;
  private filled = 0;
  private sinceRecord = 0;

  /** Call every rendered frame; records at a fixed rate regardless of fps. */
  record(state: MatchState, dt: number) {
    const interval = 1 / RECORD_HZ;
    this.sinceRecord += dt;
    if (this.sinceRecord < interval) return;

    // Subtract rather than reset: resetting throws away the overflow, so a
    // slow frame rate silently records short and the clip ends up briefer
    // than the passage of play it is supposed to show. Capped so a stalled
    // tab does not then write a burst of identical frames.
    const due = Math.min(3, Math.floor(this.sinceRecord / interval));
    this.sinceRecord -= due * interval;
    for (let n = 0; n < due; n += 1) this.writeFrame(state);
  }

  private writeFrame(state: MatchState) {
    let frame = this.frames[this.write];
    if (!frame) {
      frame = {
        players: new Float32Array(state.players.length * 4),
        ballX: 0,
        ballY: 0,
        ballZ: 0,
        ballVX: 0,
        ballVZ: 0,
      };
      this.frames[this.write] = frame;
    }

    state.players.forEach((p, i) => {
      frame.players[i * 4] = p.x;
      frame.players[i * 4 + 1] = p.z;
      frame.players[i * 4 + 2] = p.vx;
      frame.players[i * 4 + 3] = p.vz;
    });
    frame.ballX = state.ball.x;
    frame.ballY = state.ball.y;
    frame.ballZ = state.ball.z;
    frame.ballVX = state.ball.vx;
    frame.ballVZ = state.ball.vz;

    this.write = (this.write + 1) % CAPACITY;
    this.filled = Math.min(CAPACITY, this.filled + 1);
  }

  /** How many seconds of footage are available. */
  get seconds(): number {
    return this.filled / RECORD_HZ;
  }

  /**
   * Frames covering the last `seconds`, oldest first. Returned as a plain
   * array because a replay is played once and then thrown away.
   */
  takeLast(seconds: number): ReplayFrame[] {
    const wanted = Math.min(this.filled, Math.round(seconds * RECORD_HZ));
    const out: ReplayFrame[] = [];
    for (let i = wanted; i > 0; i -= 1) {
      const index = (this.write - i + CAPACITY * 2) % CAPACITY;
      const frame = this.frames[index];
      if (frame) out.push(frame);
    }
    return out;
  }

  clear() {
    this.write = 0;
    this.filled = 0;
    this.sinceRecord = 0;
  }
}

/** Playback cursor over a captured clip, at a chosen speed. */
export class ReplayPlayer {
  private elapsed = 0;

  constructor(
    private readonly frames: ReplayFrame[],
    /** 0.4 plays back at 40% speed. */
    private readonly speed = 0.4,
    private readonly hz = RECORD_HZ,
  ) {}

  advance(dt: number) {
    this.elapsed += dt * this.speed;
  }

  get done(): boolean {
    return this.elapsed * this.hz >= this.frames.length - 1;
  }

  get progress(): number {
    if (this.frames.length <= 1) return 1;
    return Math.min(1, (this.elapsed * this.hz) / (this.frames.length - 1));
  }

  /** The frame at the cursor, interpolated between recorded samples. */
  current(): ReplayFrame | null {
    if (this.frames.length === 0) return null;
    const position = this.elapsed * this.hz;
    const index = Math.min(this.frames.length - 1, Math.floor(position));
    const next = Math.min(this.frames.length - 1, index + 1);
    const a = this.frames[index];
    const b = this.frames[next];
    if (!a || !b) return null;
    if (a === b) return a;

    const t = position - index;
    const players = new Float32Array(a.players.length);
    for (let i = 0; i < players.length; i += 1) {
      players[i] = (a.players[i] ?? 0) + ((b.players[i] ?? 0) - (a.players[i] ?? 0)) * t;
    }
    return {
      players,
      ballX: a.ballX + (b.ballX - a.ballX) * t,
      ballY: a.ballY + (b.ballY - a.ballY) * t,
      ballZ: a.ballZ + (b.ballZ - a.ballZ) * t,
      ballVX: a.ballVX + (b.ballVX - a.ballVX) * t,
      ballVZ: a.ballVZ + (b.ballVZ - a.ballVZ) * t,
    };
  }
}

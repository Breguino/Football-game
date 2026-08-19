import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStick,
  isTouchDevice,
  pressTouch,
  resetTouch,
  setStick,
  touch,
} from '../touch';

describe('the thumbstick', () => {
  beforeEach(() => {
    resetTouch();
    touch.used = false;
  });

  it('passes through a vector inside the unit circle', () => {
    setStick(0.5, -0.25);
    expect(touch.moveX).toBeCloseTo(0.5);
    expect(touch.moveZ).toBeCloseTo(-0.25);
  });

  it('normalises anything past the edge', () => {
    // Otherwise a corner drag is 1.41 times faster than a straight one.
    setStick(1, 1);
    expect(Math.hypot(touch.moveX, touch.moveZ)).toBeCloseTo(1);
    setStick(3, 0);
    expect(touch.moveX).toBeCloseTo(1);
  });

  it('maps screen down to pitch forward', () => {
    // Screen y grows downward and so does pitch z, so pushing up the screen
    // has to come out negative or the player runs the wrong way.
    setStick(0, -1);
    expect(touch.moveZ).toBeLessThan(0);
  });

  it('returns to rest when released', () => {
    setStick(0.8, 0.6);
    clearStick();
    expect(touch.moveX).toBe(0);
    expect(touch.moveZ).toBe(0);
  });
});

describe('buttons', () => {
  beforeEach(() => resetTouch());

  it('queue a press for whoever reads next', () => {
    pressTouch('shoot');
    expect(touch.pressed.has('shoot')).toBe(true);
  });

  it('collapse a burst of taps into one press', () => {
    // The reader consumes the set once a frame; two taps inside one frame are
    // one shot, not two, which is the same rule the keyboard follows.
    pressTouch('pass');
    pressTouch('pass');
    expect(touch.pressed.size).toBe(1);
  });

  it('hold several at once', () => {
    pressTouch('pass');
    pressTouch('switch');
    expect(touch.pressed.size).toBe(2);
  });
});

describe('resetting', () => {
  it('clears everything a match could have left held', () => {
    // A button held as the match ends would otherwise still be held at the
    // next kickoff — the device outlives the screen that draws it.
    setStick(1, 1);
    pressTouch('shoot');
    touch.sprint = true;
    touch.finesse = true;
    touch.power = true;

    resetTouch();

    expect(touch.moveX).toBe(0);
    expect(touch.moveZ).toBe(0);
    expect(touch.sprint).toBe(false);
    expect(touch.finesse).toBe(false);
    expect(touch.power).toBe(false);
    expect(touch.pressed.size).toBe(0);
  });
});

describe('detection', () => {
  it('does not throw without a window', () => {
    expect(() => isTouchDevice()).not.toThrow();
  });
});

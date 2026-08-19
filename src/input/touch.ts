/**
 * The on-screen controls, as a device.
 *
 * Written as a plain mutable object rather than React state because the match
 * loop reads it sixty times a second: routing a thumbstick through React would
 * re-render the whole HUD on every pixel of drag.
 *
 * It reports the same three things a gamepad does — a stick vector, held
 * modifiers, and edge-triggered presses — so the match reads it exactly the
 * way it already reads a pad, and neither has to know about the other.
 */

export type TouchButton = 'pass' | 'shoot' | 'switch';

export interface TouchState {
  /** -1..1, already normalised to the unit circle. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  finesse: boolean;
  power: boolean;
  /** Presses since the last read. Cleared by whoever reads them. */
  pressed: Set<TouchButton>;
  /** True once a touch has actually happened, so the controls can stay hidden. */
  used: boolean;
}

export const touch: TouchState = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  finesse: false,
  power: false,
  pressed: new Set(),
  used: false,
};

export function setStick(x: number, z: number) {
  const length = Math.hypot(x, z);
  if (length > 1) {
    touch.moveX = x / length;
    touch.moveZ = z / length;
  } else {
    touch.moveX = x;
    touch.moveZ = z;
  }
  touch.used = true;
}

export function clearStick() {
  touch.moveX = 0;
  touch.moveZ = 0;
}

export function pressTouch(button: TouchButton) {
  touch.pressed.add(button);
  touch.used = true;
}

/** Puts the device back to rest — on leaving a match, or losing the window. */
export function resetTouch() {
  touch.moveX = 0;
  touch.moveZ = 0;
  touch.sprint = false;
  touch.finesse = false;
  touch.power = false;
  touch.pressed.clear();
}

/**
 * Whether to draw the controls at all.
 *
 * Coarse pointer rather than a user-agent string: what matters is whether the
 * person has a finger or a mouse, and every attempt to infer that from a UA
 * string is wrong within a year.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
    (navigator.maxTouchPoints ?? 0) > 0
  );
}

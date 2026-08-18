/**
 * Semantic input actions. Screens listen for these, never for raw keys or
 * button indices, so gamepad / keyboard parity is structural rather than
 * something each screen has to remember.
 */
export type NavAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'tabPrev'
  | 'tabNext'
  | 'altAction'
  | 'menu';

export type GlyphSet = 'playstation' | 'xbox' | 'keyboard';

/** Which physical control each action is bound to, per glyph set. */
export const GLYPHS: Record<GlyphSet, Record<NavAction, string>> = {
  playstation: {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    confirm: '✕',
    back: '○',
    tabPrev: 'L1',
    tabNext: 'R1',
    altAction: '△',
    menu: '☰',
  },
  xbox: {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    confirm: 'A',
    back: 'B',
    tabPrev: 'LB',
    tabNext: 'RB',
    altAction: 'Y',
    menu: '☰',
  },
  keyboard: {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    confirm: 'Enter',
    back: 'Esc',
    tabPrev: 'Q',
    tabNext: 'E',
    altAction: 'R',
    menu: 'Tab',
  },
};

/** Glyphs that render as a filled circular badge rather than a keycap. */
export const ROUND_GLYPHS = new Set(['✕', '○', '△', '□', 'A', 'B', 'X', 'Y']);

export const KEY_BINDINGS: Record<string, NavAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyQ: 'tabPrev',
  KeyE: 'tabNext',
  KeyR: 'altAction',
  Tab: 'menu',
};

/**
 * Standard Gamepad mapping. Index → action.
 * 0 ✕/A · 1 ○/B · 2 □/X · 3 △/Y · 4 L1/LB · 5 R1/RB · 12-15 d-pad.
 */
export const PAD_BINDINGS: Record<number, NavAction> = {
  0: 'confirm',
  1: 'back',
  3: 'altAction',
  4: 'tabPrev',
  5: 'tabNext',
  9: 'menu',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

/** Repeat behaviour for held directions, in milliseconds. */
export const REPEAT_DELAY = 380;
export const REPEAT_RATE = 90;

/** Stick deflection past which an axis counts as a direction press. */
export const STICK_DEADZONE = 0.55;

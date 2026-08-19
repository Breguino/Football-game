import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  KEY_BINDINGS,
  PAD_BINDINGS,
  REPEAT_DELAY,
  REPEAT_RATE,
  STICK_DEADZONE,
  type GlyphSet,
  type NavAction,
} from './actions';
import { useSettings } from '@/state/settings';

type Handler = (action: NavAction) => void;

interface InputContextValue {
  /** Subscribe to navigation actions. Later subscribers win — the topmost
   *  screen or modal receives the action and can stop it propagating. */
  subscribe: (handler: Handler) => () => void;
  glyphSet: GlyphSet;
  setGlyphSet: (set: GlyphSet) => void;
  /** True once a gamepad has been seen, so the UI can show pad glyphs. */
  padConnected: boolean;
}

const InputContext = createContext<InputContextValue | null>(null);

const DIRECTIONS = new Set<NavAction>(['up', 'down', 'left', 'right']);

/** The glyph set the saved settings ask for, or the keyboard. */
function savedGlyphSet(): GlyphSet {
  const chosen = useSettings.getState().value('glyphSet');
  if (chosen === 'PlayStation') return 'playstation';
  if (chosen === 'Xbox') return 'xbox';
  return 'keyboard';
}

export function InputProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<Handler[]>([]);
  // Starts from the saved choice rather than a fixed default, so a set picked
  // in settings survives a reload without having to be picked again.
  const [glyphSet, setGlyphSet] = useState<GlyphSet>(savedGlyphSet);
  const [padConnected, setPadConnected] = useState(false);

  const emit = useCallback((action: NavAction) => {
    const stack = handlers.current;
    const top = stack[stack.length - 1];
    if (top) top(action);
  }, []);

  const subscribe = useCallback((handler: Handler) => {
    handlers.current.push(handler);
    return () => {
      handlers.current = handlers.current.filter((h) => h !== handler);
    };
  }, []);

  /* ---- keyboard -------------------------------------------------------- */
  useEffect(() => {
    const held = new Map<NavAction, number>();

    function onKeyDown(e: KeyboardEvent) {
      const action = KEY_BINDINGS[e.code];
      if (!action) return;
      // Let the browser keep Tab for accessibility unless a screen claims it.
      if (e.code !== 'Tab') e.preventDefault();
      if (e.repeat) return;
      held.set(action, performance.now());
      emit(action);
    }

    function onKeyUp(e: KeyboardEvent) {
      const action = KEY_BINDINGS[e.code];
      if (action) held.delete(action);
    }

    // Key repeat is driven manually so pad and keyboard feel identical.
    const timer = window.setInterval(() => {
      const now = performance.now();
      for (const [action, since] of held) {
        if (!DIRECTIONS.has(action)) continue;
        if (now - since < REPEAT_DELAY) continue;
        emit(action);
        held.set(action, now - REPEAT_DELAY + REPEAT_RATE);
      }
    }, REPEAT_RATE);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.clearInterval(timer);
    };
  }, [emit]);

  /* ---- gamepad --------------------------------------------------------- */
  useEffect(() => {
    if (typeof navigator.getGamepads !== 'function') return;

    const pressedAt = new Map<NavAction, number>();
    let raf = 0;
    let sawPad = false;

    function poll() {
      const pads = navigator.getGamepads?.() ?? [];
      const now = performance.now();
      const active = new Set<NavAction>();

      for (const pad of pads) {
        if (!pad) continue;
        if (!sawPad) {
          sawPad = true;
          setPadConnected(true);
          // Infer the glyph set from the controller id where we can.
          const id = pad.id.toLowerCase();
          if (id.includes('xbox') || id.includes('xinput')) setGlyphSet('xbox');
          else if (id.includes('dualsense') || id.includes('dualshock') || id.includes('054c')) {
            setGlyphSet('playstation');
          }
        }

        pad.buttons.forEach((button, index) => {
          const action = PAD_BINDINGS[index];
          if (action && button.pressed) active.add(action);
        });

        const [ax = 0, ay = 0] = pad.axes;
        if (ay < -STICK_DEADZONE) active.add('up');
        if (ay > STICK_DEADZONE) active.add('down');
        if (ax < -STICK_DEADZONE) active.add('left');
        if (ax > STICK_DEADZONE) active.add('right');
      }

      for (const action of active) {
        const since = pressedAt.get(action);
        if (since === undefined) {
          pressedAt.set(action, now);
          emit(action);
        } else if (DIRECTIONS.has(action) && now - since >= REPEAT_DELAY) {
          emit(action);
          pressedAt.set(action, now - REPEAT_DELAY + REPEAT_RATE);
        }
      }
      for (const action of [...pressedAt.keys()]) {
        if (!active.has(action)) pressedAt.delete(action);
      }

      raf = requestAnimationFrame(poll);
    }

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [emit]);

  const value = useMemo<InputContextValue>(
    () => ({ subscribe, glyphSet, setGlyphSet, padConnected }),
    [subscribe, glyphSet, padConnected],
  );

  return <InputContext.Provider value={value}>{children}</InputContext.Provider>;
}

export function useInput(): InputContextValue {
  const ctx = useContext(InputContext);
  if (!ctx) throw new Error('useInput must be used inside <InputProvider>');
  return ctx;
}

/**
 * Claim navigation input while `active`. The most recently mounted active
 * listener receives actions, so opening a modal takes control automatically
 * and closing it hands control back.
 */
export function useNavigation(handler: Handler, active = true) {
  const { subscribe } = useInput();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!active) return;
    return subscribe((action) => ref.current(action));
  }, [subscribe, active]);
}

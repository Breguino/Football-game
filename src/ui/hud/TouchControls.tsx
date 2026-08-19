import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { clearStick, pressTouch, setStick, touch, type TouchButton } from '@/input/touch';
import './touch.css';

/**
 * Thumbstick and buttons, for playing without a keyboard.
 *
 * The stick is floating rather than fixed: it appears wherever the thumb lands
 * in the left half of the screen. A fixed stick means looking down to find it,
 * and on a phone held in two hands the thumb is never in the same place twice.
 */

const STICK_RADIUS = 56;

export function TouchControls() {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);

  const onStickDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerId.current = event.pointerId;
    setOrigin({ x: event.clientX, y: event.clientY });
    setKnob({ x: 0, y: 0 });
  }, []);

  const onStickMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== event.pointerId || !origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      const distance = Math.hypot(dx, dy);
      const clamped = Math.min(1, distance / STICK_RADIUS);
      const angle = Math.atan2(dy, dx);

      setKnob({ x: Math.cos(angle) * clamped * STICK_RADIUS, y: Math.sin(angle) * clamped * STICK_RADIUS });
      // Screen y grows downward and so does pitch z, so they agree.
      setStick(Math.cos(angle) * clamped, Math.sin(angle) * clamped);
    },
    [origin],
  );

  const onStickUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    clearStick();
  }, []);

  return (
    <div className="touch" aria-hidden="true">
      <div
        className="touch__stickzone"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        {origin && (
          <>
            <span
              className="touch__ring"
              style={{ left: `${origin.x}px`, top: `${origin.y}px` }}
            />
            <span
              className="touch__knob"
              style={{ left: `${origin.x + knob.x}px`, top: `${origin.y + knob.y}px` }}
            />
          </>
        )}
      </div>

      <div className="touch__buttons">
        <Hold label="Sprint" className="touch__sprint" onChange={(on) => (touch.sprint = on)} />
        <div className="touch__cluster">
          <Tap label="Switch" button="switch" className="touch__switch" />
          <Tap label="Pass" button="pass" className="touch__pass" />
          <Tap label="Shoot" button="shoot" className="touch__shoot" />
        </div>
      </div>
    </div>
  );
}

/** An edge-triggered button: one press, one action, however long it is held. */
function Tap({
  label,
  button,
  className,
}: {
  label: string;
  button: TouchButton;
  className: string;
}) {
  const [down, setDown] = useState(false);
  return (
    <button
      type="button"
      className={`touch__btn ${className}`}
      data-down={down}
      onPointerDown={(e) => {
        e.preventDefault();
        setDown(true);
        pressTouch(button);
      }}
      onPointerUp={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
    >
      {label}
    </button>
  );
}

/** A held modifier, like a trigger. */
function Hold({
  label,
  className,
  onChange,
}: {
  label: string;
  className: string;
  onChange: (on: boolean) => void;
}) {
  const [down, setDown] = useState(false);
  const set = (on: boolean) => {
    setDown(on);
    onChange(on);
  };
  return (
    <button
      type="button"
      className={`touch__btn ${className}`}
      data-down={down}
      onPointerDown={(e) => {
        e.preventDefault();
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onPointerLeave={() => set(false)}
    >
      {label}
    </button>
  );
}

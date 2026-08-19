import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The interface's atom (PROMPT.md §3.6).
 *
 * Sentence-case regular label on the left, BOLD UPPERCASE value on the right.
 * Focus is not a fill — it is a 1.5px teal ring plus an iridescent light leak
 * that sweeps once across the row's top and bottom edges, then rests.
 *
 * The leak is rendered as real elements keyed on a focus nonce so that every
 * fresh focus land remounts them and replays the sweep. Pseudo-elements cannot
 * be remounted, and restarting a CSS animation on them requires a reflow hack.
 */

export interface FocusRowProps {
  label: string;
  focused?: boolean;
  disabled?: boolean;
  /** Right-hand content: a plain value, a <Cycler>, or a <Slider>. */
  children?: ReactNode;
  onSelect?: () => void;
  onFocus?: () => void;
}

export function FocusRow({
  label,
  focused = false,
  disabled = false,
  children,
  onSelect,
  onFocus,
}: FocusRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [nonce, setNonce] = useState(0);
  const wasFocused = useRef(focused);

  // A rising edge is a focus *land*; that is what replays the sweep. Staying
  // focused while the value changes must not retrigger it.
  useEffect(() => {
    if (focused && !wasFocused.current) setNonce((n) => n + 1);
    wasFocused.current = focused;
  }, [focused]);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  return (
    <button
      ref={ref}
      type="button"
      className="fc-row"
      data-focused={focused}
      data-disabled={disabled}
      aria-current={focused || undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onFocus?.();
        onSelect?.();
      }}
      onMouseEnter={() => {
        if (!disabled) onFocus?.();
      }}
    >
      <span className="fc-row__rule" aria-hidden="true" />
      <span className="fc-row__label">{label}</span>
      {children !== undefined && <span className="fc-row__value">{children}</span>}

      {focused && (
        <>
          <span key={`leak-top-${nonce}`} className="fc-leak fc-leak--top" aria-hidden="true" />
          <span key={`leak-bot-${nonce}`} className="fc-leak fc-leak--bottom" aria-hidden="true" />
        </>
      )}
    </button>
  );
}

/** A value you page through with left/right. */
export function Cycler({
  value,
  nudge,
}: {
  value: string;
  /** Set briefly to 'left' | 'right' to flash the corresponding arrow. */
  nudge?: 'left' | 'right' | null;
}) {
  return (
    <span className="fc-cycler">
      <i className="fc-cycler__arrow" data-nudge={nudge === 'left'} aria-hidden="true">
        ◀
      </i>
      {value}
      <i className="fc-cycler__arrow" data-nudge={nudge === 'right'} aria-hidden="true">
        ▶
      </i>
    </span>
  );
}

/** A 0–max slider. Track filled off-white, rest grey, white round knob. */
export function Slider({
  value,
  min = 0,
  max = 20,
}: {
  value: number;
  min?: number;
  max?: number;
}) {
  // Measured from the floor, so a slider that starts at 1 shows empty at 1
  // rather than already part-filled.
  const span = max - min;
  const pct = span <= 0 ? 0 : Math.round(((value - min) / span) * 100);
  return (
    <span className="fc-slider">
      <span className="fc-slider__track">
        <span className="fc-slider__fill" style={{ width: `${pct}%` }} />
        <span className="fc-slider__knob" style={{ left: `${pct}%` }} />
      </span>
      <span className="fc-slider__num">{value}</span>
    </span>
  );
}

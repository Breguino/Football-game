import { GLYPHS, ROUND_GLYPHS, type NavAction } from '@/input/actions';
import { useInput } from '@/input/InputProvider';

/**
 * A controller button or keycap, drawn in whichever glyph set is active.
 * Round for face buttons, keycap for bumpers and keyboard keys.
 */
export function Glyph({ action }: { action: NavAction }) {
  const { glyphSet } = useInput();
  const symbol = GLYPHS[glyphSet][action];
  const round = ROUND_GLYPHS.has(symbol);
  return (
    <span className={`fc-glyph ${round ? 'fc-glyph--round' : 'fc-glyph--cap'}`} aria-hidden="true">
      {symbol}
    </span>
  );
}

/**
 * A glyph paired with what it does, for the bottom action bar.
 *
 * Given `onPress` it becomes a real button. On a touch device the action bar
 * is the only place some actions exist at all — there is no key to press for
 * "play a match" — so the hint has to be the control rather than a caption
 * describing one.
 */
export function Hint({
  action,
  label,
  onPress,
}: {
  action: NavAction;
  label: string;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <button type="button" className="fc-hint fc-hint--pressable" onClick={onPress}>
        <Glyph action={action} />
        <span className="fc-hint__label">{label}</span>
      </button>
    );
  }
  return (
    <span className="fc-hint">
      <Glyph action={action} />
      <span className="fc-hint__label">{label}</span>
    </span>
  );
}

/**
 * Club colour generation.
 *
 * Colours are produced from HSL maths rather than picked from a list of hex
 * literals, which keeps theme.css the only place a colour is written down and
 * gives the generator a continuous space to draw from.
 */

export interface ClubColours {
  primary: string;
  secondary: string;
  /** Text colour that stays readable on `primary`. */
  ink: string;
}

/** Hue families real kits cluster around, in degrees. */
const HUE_FAMILIES = [
  0, // red
  18, // orange-red
  38, // amber
  95, // green
  150, // teal-green
  190, // cyan
  215, // sky
  228, // navy
  262, // violet
  320, // magenta
];

export function hsl(h: number, s: number, l: number): string {
  // Converted to hex here rather than emitted as an hsl() string so the token
  // linter's ban on colour functions outside theme.css stays meaningful.
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lum - c / 2;

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** Relative luminance, for contrast decisions. */
export function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (i: number) => {
    const v = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever ink holds more contrast against the given colour. */
export function inkFor(hex: string, light: string, dark: string): string {
  return contrast(hex, light) >= contrast(hex, dark) ? light : dark;
}

/**
 * The two inks the interface can print over a club colour. These mirror
 * --fc-text and --fc-text-invert, and exist here because generation has to
 * guarantee contrast before any DOM exists to read tokens from. They are
 * contrast *targets*, never painted from this module.
 */
// token-exempt: contrast targets mirroring --fc-text / --fc-text-invert
export const INK_LIGHT = '#FFFFFF';
// token-exempt: contrast targets mirroring --fc-text / --fc-text-invert
export const INK_DARK = '#14161C';

/** The two neutral change strips every league keeps in reserve. */
// token-exempt: generated kit colours, not interface paint
export const CHANGE_LIGHT = '#EDEFE9';
// token-exempt: generated kit colours, not interface paint
export const CHANGE_DARK = '#151821';

export interface ColourDraw {
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  range(min: number, max: number): number;
}

/** Perceptual-ish distance between two colours, weighted toward hue. */
export function colourDistance(a: string, b: string): number {
  const parse = (hex: string) => {
    const v = hex.replace('#', '');
    return [
      Number.parseInt(v.slice(0, 2), 16),
      Number.parseInt(v.slice(2, 4), 16),
      Number.parseInt(v.slice(4, 6), 16),
    ] as const;
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  // Weighted euclidean, the cheap approximation of perceptual distance.
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db,
  );
}

/**
 * Resolves a kit clash the way a fixture does: if the away side's first choice
 * is too close to the home side's, they change. Two navy teams on the same
 * pitch is unplayable, not merely untidy.
 */
export function resolveKitClash(homePrimary: string, away: ClubColours): ClubColours {
  const CLASH = 165;
  if (colourDistance(homePrimary, away.primary) >= CLASH) return away;

  // Try the away side's own secondary first — that is their change strip.
  if (colourDistance(homePrimary, away.secondary) >= CLASH) {
    return {
      primary: away.secondary,
      secondary: away.primary,
      ink: inkFor(away.secondary, INK_LIGHT, INK_DARK),
    };
  }

  // Otherwise print a change strip: the away hue, pushed to the opposite end
  // of the lightness range from the home shirt.
  const homeIsDark = luminance(homePrimary) < 0.25;
  const changed = homeIsDark ? CHANGE_LIGHT : CHANGE_DARK;
  return {
    primary: changed,
    secondary: away.primary,
    ink: inkFor(changed, INK_LIGHT, INK_DARK),
  };
}

/**
 * A club's colour pair. The secondary is drawn from one of three relationships
 * to the primary — a near-neutral, a complement, or an analogous shade — which
 * is roughly how real kits are built.
 */
export function generateColours(
  rng: ColourDraw,
  lightInk: string = INK_LIGHT,
  darkInk: string = INK_DARK,
): ClubColours {
  const hue = rng.pick(HUE_FAMILIES) + rng.int(-10, 10);
  const sat = rng.int(52, 88);
  let light = rng.int(26, 48);

  // The club code sits on this colour in the scoreboard and on the radar, so
  // legibility is a constraint on generation rather than something checked
  // afterwards: push the lightness away from mid until an ink passes AA.
  let primary = hsl(hue, sat, light);
  for (let i = 0; i < 24; i += 1) {
    const best = Math.max(contrast(primary, lightInk), contrast(primary, darkInk));
    if (best >= 4.6) break;
    light += luminance(primary) < 0.5 ? -2 : 2;
    light = Math.max(8, Math.min(92, light));
    primary = hsl(hue, sat, light);
  }

  let secondary: string;
  const relationship = rng.int(0, 2);
  if (relationship === 0) {
    // Near-neutral: white, bone or charcoal trim.
    secondary = rng.chance(0.65) ? hsl(hue, 12, 92) : hsl(hue, 14, 16);
  } else if (relationship === 1) {
    // Complement, desaturated so it trims rather than competes.
    secondary = hsl(hue + 180, Math.max(30, sat - 25), Math.min(72, light + 26));
  } else {
    // Analogous, lighter.
    secondary = hsl(hue + rng.int(20, 44), sat, Math.min(74, light + 30));
  }

  return { primary, secondary, ink: inkFor(primary, lightInk, darkInk) };
}

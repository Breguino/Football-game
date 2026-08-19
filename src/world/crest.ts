/**
 * Crest generation.
 *
 * A crest is a shield silhouette, a division, a device, and optionally a
 * banner — composed as SVG path data so one crest scales from a 14px radar
 * marker to a full-screen team sheet without a second asset.
 */

import type { Rng } from './rng';

export type ShieldShape = 'classic' | 'pointed' | 'round' | 'flag' | 'hex' | 'spade';
export type Division = 'none' | 'perPale' | 'perFess' | 'perBend' | 'chief' | 'pile';
export type Device = 'star' | 'lion' | 'ship' | 'wheel' | 'tower' | 'chevron' | 'roundel' | 'bird' | 'anchor';

export interface Crest {
  shape: ShieldShape;
  division: Division;
  device: Device;
  banner: boolean;
  /** Two initials rendered in the banner, or on the shield if there is none. */
  initials: string;
  founded: number;
}

const SHAPES: ShieldShape[] = ['classic', 'pointed', 'round', 'flag', 'hex', 'spade'];
const DEVICES: Device[] = ['star', 'lion', 'ship', 'wheel', 'tower', 'chevron', 'roundel', 'bird', 'anchor'];

export function generateCrest(rng: Rng, name: string): Crest {
  const initials = name
    .replace(/^(AS|FC|SV|SC|CD|UD|CA|EC|CR|IF|IK|TSV|RC|1\. FC)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();

  return {
    shape: rng.pick(SHAPES),
    division: rng.weighted([
      ['none', 3],
      ['perPale', 2],
      ['perFess', 2],
      ['perBend', 1],
      ['chief', 2],
      ['pile', 1],
    ] as const satisfies readonly (readonly [Division, number])[]),
    device: rng.pick(DEVICES),
    banner: rng.chance(0.45),
    initials: initials || 'FC',
    founded: rng.int(1878, 1974),
  };
}

/** Shield outline on a 0–100 × 0–120 canvas. */
export function shieldPath(shape: ShieldShape): string {
  switch (shape) {
    case 'pointed':
      return 'M6 6 H94 V64 L50 114 L6 64 Z';
    case 'round':
      return 'M50 4 C86 4 96 22 96 46 C96 84 74 106 50 116 C26 106 4 84 4 46 C4 22 14 4 50 4 Z';
    case 'flag':
      return 'M8 8 H92 V102 Q50 118 8 102 Z';
    case 'hex':
      return 'M50 4 L94 28 V82 L50 116 L6 82 V28 Z';
    case 'spade':
      return 'M50 4 C78 4 96 20 96 44 C96 76 72 96 50 116 C28 96 4 76 4 44 C4 20 22 4 50 4 Z';
    case 'classic':
    default:
      return 'M6 8 H94 V58 C94 88 74 104 50 116 C26 104 6 88 6 58 Z';
  }
}

/** Secondary-colour division laid over the shield, clipped to it. */
export function divisionPath(division: Division): string | null {
  switch (division) {
    case 'perPale':
      return 'M50 0 H100 V120 H50 Z';
    case 'perFess':
      return 'M0 0 H100 V52 H0 Z';
    case 'perBend':
      return 'M0 0 H100 L0 120 Z';
    case 'chief':
      return 'M0 0 H100 V30 H0 Z';
    case 'pile':
      return 'M50 120 L100 0 H0 Z';
    case 'none':
    default:
      return null;
  }
}

/** Device mark, drawn centred on the shield. */
export function devicePath(device: Device): string {
  switch (device) {
    case 'lion':
      return 'M34 70 L38 46 L44 52 L50 38 L56 52 L62 46 L66 70 L58 76 H42 Z M44 58 a3 3 0 1 0 .1 0 M56 58 a3 3 0 1 0 .1 0';
    case 'ship':
      return 'M28 74 H72 L66 84 H34 Z M50 30 V72 M50 34 L68 44 L50 52 Z M50 34 L32 44 L50 52 Z';
    case 'wheel':
      return 'M50 32 a18 18 0 1 0 .1 0 Z M50 32 V68 M32 50 H68 M37 37 L63 63 M63 37 L37 63';
    case 'tower':
      return 'M36 82 V44 H40 V38 H44 V44 H48 V38 H52 V44 H56 V38 H60 V44 H64 V82 Z M46 62 h8 v20 h-8 Z';
    case 'chevron':
      return 'M50 36 L74 66 H64 L50 48 L36 66 H26 Z M50 58 L68 80 H58 L50 70 L42 80 H32 Z';
    case 'roundel':
      return 'M50 30 a20 20 0 1 0 .1 0 Z M50 42 a8 8 0 1 1 -.1 0 Z';
    case 'bird':
      return 'M22 58 Q42 40 50 52 Q58 40 78 58 Q60 56 50 76 Q40 56 22 58 Z';
    case 'anchor':
      return 'M50 32 a5 5 0 1 1 -.1 0 Z M50 42 V82 M36 58 H64 M28 68 Q34 86 50 86 Q66 86 72 68';
    case 'star':
    default:
      return 'M50 30 L58 50 L80 50 L62 62 L69 84 L50 70 L31 84 L38 62 L20 50 L42 50 Z';
  }
}

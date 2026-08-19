/**
 * World generation. One seed string produces the whole football pyramid:
 * leagues, clubs, crests, kits, stadiums and squads.
 *
 * Nothing here is licensed and nothing is a placeholder — a placeholder would
 * eventually ship, so the generator is the content.
 */

import { createRng, type Rng } from './rng';
import { generateColours, type ClubColours } from './colour';
import { generateCrest, type Crest } from './crest';
import {
  CLUB_GRAMMAR,
  DEFAULT_STADIUM_SUFFIXES,
  LEAGUES,
  NATIONS,
  PERSON_NAMES,
  STADIUM_PREFIXES,
  STADIUM_SUFFIXES,
} from './names';

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LW' | 'RW' | 'ST';

export interface Attributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface Player {
  id: string;
  first: string;
  last: string;
  nation: string;
  position: Position;
  number: number;
  age: number;
  overall: number;
  potential: number;
  attributes: Attributes;
  /** 1–5, as shown in the HUD stat pill. */
  skillMoves: number;
  weakFoot: number;
  preferredFoot: 'L' | 'R';
  stamina: number;
}

export interface Club {
  id: string;
  name: string;
  /** Three-letter code for the scoreboard. */
  code: string;
  leagueId: string;
  nation: string;
  colours: ClubColours;
  crest: Crest;
  stadium: { name: string; capacity: number };
  squad: Player[];
  overall: number;
}

export interface League {
  id: string;
  name: string;
  nation: string;
  tier: number;
  clubIds: string[];
}

export interface World {
  seed: string;
  leagues: League[];
  clubs: Record<string, Club>;
  clubOrder: string[];
}

/** Formation slots for a generated squad: a plausible 4-3-3 plus cover. */
const SQUAD_SHAPE: Position[] = [
  'GK', 'GK', 'GK',
  'RB', 'RB', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB',
  'CDM', 'CDM', 'CM', 'CM', 'CM', 'CAM', 'CAM',
  'RW', 'RW', 'LW', 'LW', 'ST', 'ST', 'ST',
];

/** Which attributes matter for a position, used to shape the roll. */
const POSITION_BIAS: Record<Position, Partial<Attributes>> = {
  GK: { defending: 14, physical: 6, pace: -18, shooting: -30, dribbling: -18 },
  CB: { defending: 14, physical: 10, pace: -6, shooting: -16, dribbling: -10 },
  LB: { pace: 8, defending: 6, passing: 4, shooting: -12 },
  RB: { pace: 8, defending: 6, passing: 4, shooting: -12 },
  CDM: { defending: 10, passing: 6, physical: 8, pace: -4 },
  CM: { passing: 12, dribbling: 6, physical: 2 },
  CAM: { passing: 10, dribbling: 12, shooting: 6, defending: -14 },
  LW: { pace: 14, dribbling: 12, defending: -18, physical: -6 },
  RW: { pace: 14, dribbling: 12, defending: -18, physical: -6 },
  ST: { shooting: 16, pace: 8, defending: -22, passing: -6 },
};

function clamp(value: number, min = 24, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function generatePlayer(
  rng: Rng,
  position: Position,
  base: number,
  nationId: string,
  number: number,
  index: number,
  usedSurnames: Set<string>,
): Player {
  const names = PERSON_NAMES[nationId] ?? PERSON_NAMES['albion']!;
  const age = clamp(rng.gaussian(25.5, 4.2), 16, 38);

  // Younger players sit below their ceiling; peak years sit at it.
  const peak = age >= 25 && age <= 30;
  const overall = clamp(rng.gaussian(base, 4.5) - (peak ? 0 : Math.abs(27 - age) * 0.9), 40, 94);
  const potential = clamp(overall + (age < 24 ? rng.int(3, 14) : rng.int(0, 3)), overall, 96);

  // Attributes cluster around the overall, but a bias cannot carry a player
  // more than 8 past their own rating — otherwise every 90-rated centre-back
  // ends up with three 99s and the stat grid stops meaning anything.
  const bias = POSITION_BIAS[position];
  const ceiling = Math.min(99, overall + 8);
  const roll = (key: keyof Attributes) =>
    clamp(rng.gaussian(overall + (bias[key] ?? 0), 6), 24, ceiling);

  // A squad with three players called Kettering reads as generated. Redraw the
  // surname a few times before accepting a repeat.
  let last = rng.pick(names.last);
  for (let attempt = 0; attempt < 8 && usedSurnames.has(last); attempt += 1) {
    last = rng.pick(names.last);
  }
  usedSurnames.add(last);

  return {
    id: `${nationId}-${number}-${index}-${Math.floor(rng.next() * 1e6).toString(36)}`,
    first: rng.pick(names.first),
    last,
    nation: nationId,
    position,
    number,
    age,
    overall,
    potential,
    attributes: {
      pace: roll('pace'),
      shooting: roll('shooting'),
      passing: roll('passing'),
      dribbling: roll('dribbling'),
      defending: roll('defending'),
      physical: roll('physical'),
    },
    skillMoves: position === 'GK' ? 1 : rng.weighted([[1, 1], [2, 4], [3, 5], [4, 3], [5, 1]]),
    weakFoot: rng.weighted([[2, 3], [3, 6], [4, 3], [5, 1]]),
    preferredFoot: rng.chance(0.76) ? 'R' : 'L',
    stamina: clamp(rng.gaussian(overall, 7)),
  };
}

function generateSquad(rng: Rng, base: number, nationId: string): Player[] {
  const nation = NATIONS.find((n) => n.id === nationId);
  const homeShare = nation?.home ?? 0.5;
  const foreign = NATIONS.filter((n) => n.id !== nationId);

  // Shirt numbers 1–25, shuffled so squads do not all number identically.
  // Keepers get 1, 12 and 13 by swapping rather than overwriting, so the set
  // stays a permutation and no two players share a number.
  const numbers = rng.shuffle(Array.from({ length: SQUAD_SHAPE.length }, (_, i) => i + 1));
  const keeperNumbers = [1, 12, 13];
  SQUAD_SHAPE.forEach((position, index) => {
    if (position !== 'GK') return;
    const wanted = keeperNumbers[index];
    if (wanted === undefined) return;
    const holder = numbers.indexOf(wanted);
    if (holder === -1 || holder === index) return;
    [numbers[index], numbers[holder]] = [numbers[holder]!, numbers[index]!];
  });

  const usedSurnames = new Set<string>();
  const seenAtPosition = new Map<Position, number>();

  const squad = SQUAD_SHAPE.map((position, index) => {
    const from = rng.chance(homeShare) ? nationId : rng.pick(foreign).id;

    // Depth is ranked within a position group, not across the squad, so the
    // first-choice keeper is the best keeper and wears 1 rather than 13.
    const depth = seenAtPosition.get(position) ?? 0;
    seenAtPosition.set(position, depth + 1);
    const depthPenalty = depth === 0 ? 3 : depth === 1 ? -3 : -7;
    return generatePlayer(
      rng,
      position,
      base + depthPenalty,
      from,
      numbers[index] ?? index + 1,
      index,
      usedSurnames,
    );
  });

  // The depth bonus makes the first keeper the best on average, but a roll can
  // still favour a backup. Clubs settle this the same way: the first-choice
  // keeper takes the number 1 shirt off whoever is wearing it.
  const keepers = squad.filter((p) => p.position === 'GK').sort((a, b) => b.overall - a.overall);
  const first = keepers[0];
  const wearingOne = squad.find((p) => p.number === 1);
  if (first && wearingOne && first !== wearingOne) {
    [first.number, wearingOne.number] = [wearingOne.number, first.number];
  }

  return squad.sort((a, b) => a.number - b.number);
}

/**
 * A club's name, and the place inside it.
 *
 * The core is kept because it is the part that means something. Everything
 * around it is club-type furniture — IF, 1. FC, United, 09 — and a stadium
 * named from the last word of the full name ends up as "BK Field" or
 * "09 Stadium".
 */
function generateClubName(
  rng: Rng,
  nationId: string,
  used: Set<string>,
): { name: string; core: string } {
  const grammar = CLUB_GRAMMAR[nationId] ?? CLUB_GRAMMAR['albion']!;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const core = rng.pick(grammar.cores);

    // A club carries at most one club-type token. Taking a prefix and a suffix
    // independently produced "IF Hallvarden IF" and "IK Storøya BK" — the same
    // kind of word at both ends, which no club is called.
    let prefix = rng.pick(grammar.prefixes);
    let suffix = rng.pick(grammar.suffixes);
    if (prefix !== '' && suffix !== '') {
      if (rng.next() < 0.5) prefix = '';
      else suffix = '';
    }

    const name = `${prefix}${core}${suffix}`.trim();
    if (!used.has(name)) {
      used.add(name);
      return { name, core };
    }
  }
  // Space exhausted for this nation; fall back to a numbered variant.
  const core = rng.pick(grammar.cores);
  const fallback = `${core} ${used.size + 1}`;
  used.add(fallback);
  return { name: fallback, core };
}

/** What the ground is called, in the language the club's name is already in. */
function stadiumName(rng: Rng, nation: string, core: string): string {
  const prefixes = STADIUM_PREFIXES[nation];
  if (prefixes) return `${rng.pick(prefixes)} ${core}`;
  return `${core} ${rng.pick(STADIUM_SUFFIXES[nation] ?? DEFAULT_STADIUM_SUFFIXES)}`;
}

/** Strips diacritics so codes stay in A-Z. */
function deburr(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateCode(name: string, used: Set<string>): string {
  const stripped = deburr(name).replace(/^(AS|FC|SV|SC|CD|UD|CA|EC|CR|IF|IK|TSV|RC|Real|Atlético|Racing|Olympique|Sporting|Stade|Grêmio|Club|1\. FC|Defensores de)\s+/i, '');
  const words = stripped.split(/[\s-]+/).filter(Boolean);

  const candidates: string[] = [];
  if (words.length >= 3) candidates.push(words.slice(0, 3).map((w) => w[0]!).join(''));
  if (words.length >= 2) candidates.push((words[0]!.slice(0, 2) + words[1]![0]!).toUpperCase());
  candidates.push(stripped.replace(/[^a-zA-Z]/g, '').slice(0, 3));
  for (let i = 0; i < 26; i += 1) {
    candidates.push(stripped.replace(/[^a-zA-Z]/g, '').slice(0, 2) + String.fromCharCode(65 + i));
  }

  for (const candidate of candidates) {
    const code = candidate
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .padEnd(3, 'X')
      .slice(0, 3);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  const fallback = `C${used.size.toString(36).toUpperCase().padStart(2, '0')}`.slice(0, 3);
  used.add(fallback);
  return fallback;
}

export function generateWorld(seed: string, options?: { clubsPerLeague?: number }): World {
  const clubsPerLeague = options?.clubsPerLeague ?? 18;
  const rng = createRng(seed);
  const clubs: Record<string, Club> = {};
  const clubOrder: string[] = [];
  const leagues: League[] = [];

  const usedNames = new Set<string>();
  const usedCodes = new Set<string>();

  for (const spec of LEAGUES) {
    const leagueRng = rng.fork(spec.id);
    const clubIds: string[] = [];

    for (let i = 0; i < clubsPerLeague; i += 1) {
      const clubRng = leagueRng.fork(`club-${i}`);
      const { name, core } = generateClubName(clubRng, spec.nation, usedNames);
      const code = generateCode(name, usedCodes);

      // Strength spreads across the league: a few contenders, a long midtable.
      // Calibrated so the strongest club's first eleven averages the low 80s
      // and a promoted side sits in the high 60s — the band real squads live in.
      const rank = i / Math.max(1, clubsPerLeague - 1);
      const base = 54 + spec.strength * 24 - rank * 13 + clubRng.range(-2.5, 2.5);

      const squad = generateSquad(clubRng, base, spec.nation);
      const starters = squad.slice().sort((a, b) => b.overall - a.overall).slice(0, 11);
      const overall = Math.round(starters.reduce((sum, p) => sum + p.overall, 0) / 11);

      const id = `${spec.id}-${i}`;
      clubs[id] = {
        id,
        name,
        code,
        leagueId: spec.id,
        nation: spec.nation,
        colours: generateColours(clubRng),
        crest: generateCrest(clubRng, name),
        stadium: {
          name: stadiumName(clubRng, spec.nation, core),
          capacity: Math.round((18000 + clubRng.range(0, 62000) * spec.strength) / 500) * 500,
        },
        squad,
        overall,
      };
      clubIds.push(id);
      clubOrder.push(id);
    }

    leagues.push({ id: spec.id, name: spec.name, nation: spec.nation, tier: spec.tier, clubIds });
  }

  return { seed, leagues, clubs, clubOrder };
}

/**
 * The squad as it is handed to a match: the starting eleven in formation
 * order, followed by the bench in descending quality.
 */
export function matchSquad(club: Club): Player[] {
  const eleven = startingEleven(club);
  const starting = new Set(eleven.map((p) => p.id));
  const bench = club.squad
    .filter((p) => !starting.has(p.id))
    .sort((a, b) => b.overall - a.overall);
  return [...eleven, ...bench];
}

/** The eleven a club would actually field, in formation order. */
export function startingEleven(club: Club): Player[] {
  const shape: Position[] = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'ST', 'LW'];
  const pool = [...club.squad].sort((a, b) => b.overall - a.overall);
  const taken = new Set<string>();

  return shape.map((position) => {
    const exact = pool.find((p) => p.position === position && !taken.has(p.id));
    const chosen = exact ?? pool.find((p) => !taken.has(p.id))!;
    taken.add(chosen.id);
    return chosen;
  });
}

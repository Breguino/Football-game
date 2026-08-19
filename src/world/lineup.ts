/**
 * Turning a collection into a team.
 *
 * A generated club has a squad picked for it; a collection does not. It is
 * whatever the packs happened to hand over, which means the interesting
 * question is not "who are the best eleven" but "who are the best eleven
 * *in these positions*" — an 86 striker at centre-back is worse than a 72
 * centre-back, and a side with no keeper is not a side.
 */

import { createRng } from './rng';
import { makeItem, type PlayerItem } from './items';
import type { Club, Player, Position, World } from './generate';

/** The shape a lineup is picked into, matching the sim's 4-3-3 slot order. */
export const FORMATION: Position[] = [
  'GK',
  'RB', 'CB', 'CB', 'LB',
  'CDM', 'CM', 'CAM',
  'RW', 'ST', 'LW',
];

/**
 * What playing out of position costs, in rating points.
 *
 * The numbers matter less than the ordering: a full-back can cover the other
 * flank almost for free, can fill in at centre-back, and has no business in
 * goal. Anyone in goal who is not a keeper is a disaster, which is why that
 * penalty is larger than the entire rating range.
 */
const OUT_OF_POSITION = 40;
const IN_GOAL = 200;

const NEIGHBOURS: Record<Position, Partial<Record<Position, number>>> = {
  GK: {},
  CB: { CDM: 4, LB: 6, RB: 6 },
  LB: { RB: 2, CB: 5, LW: 7 },
  RB: { LB: 2, CB: 5, RW: 7 },
  CDM: { CM: 2, CB: 5 },
  CM: { CDM: 2, CAM: 2 },
  CAM: { CM: 2, LW: 5, RW: 5, ST: 5 },
  LW: { RW: 2, LB: 7, CAM: 5, ST: 6 },
  RW: { LW: 2, RB: 7, CAM: 5, ST: 6 },
  ST: { CAM: 5, LW: 6, RW: 6 },
};

/** What it costs this player to fill this slot, in rating points. */
export function positionPenalty(playerPosition: Position, slot: Position): number {
  if (playerPosition === slot) return 0;
  if (slot === 'GK' || playerPosition === 'GK') return IN_GOAL;
  return NEIGHBOURS[slot]?.[playerPosition] ?? OUT_OF_POSITION;
}

/** A player as they would perform in the slot they have been given. */
export interface LineupSlot {
  slot: Position;
  item: PlayerItem;
  player: Player;
  /** The player's own rating, before the slot is taken into account. */
  rating: number;
  penalty: number;
  /** Rating as it counts toward the side. Never below 1. */
  effective: number;
  /** True when the player put them here rather than the automatic pick. */
  pinned: boolean;
}

export interface Lineup {
  eleven: LineupSlot[];
  bench: { item: PlayerItem; player: Player }[];
  /** Mean effective rating of the eleven, or 0 when the side is short. */
  rating: number;
  /** False when there are not eleven items to field. */
  complete: boolean;
  /** Slots filled by someone who does not play there. */
  outOfPosition: number;
}

function effectiveIn(rating: number, penalty: number): number {
  return Math.max(1, rating - penalty);
}

/**
 * Picks the best eleven out of a collection.
 *
 * Repeatedly takes the strongest remaining (slot, player) pairing rather than
 * filling slots in order: filling in order hands the first slot the best
 * player who can nearly play there, and leaves a specialist stranded on the
 * bench behind them.
 *
 * Greedy is not guaranteed to maximise the total — a proper assignment solve
 * would — but it is predictable, which matters more here: the player has to
 * be able to look at the side and understand why it picked what it picked.
 */
export function buildLineup(
  items: readonly PlayerItem[],
  resolve: (item: PlayerItem) => Player | null,
  formation: readonly Position[] = FORMATION,
  /** Slot index to item id, for shirts the player has chosen themselves. */
  pinned: Readonly<Record<number, string>> = {},
): Lineup {
  const pool = items
    .map((item) => ({ item, player: resolve(item) }))
    .filter((entry): entry is { item: PlayerItem; player: Player } => entry.player !== null);

  const remainingSlots = formation.map((slot, index) => ({ slot, index }));
  const used = new Set<string>();
  const filled: (LineupSlot | null)[] = formation.map(() => null);

  // A shirt the player chose is not up for negotiation, however badly it fits.
  // Their side, their call — the penalty is shown, not overruled.
  for (const [at, itemId] of Object.entries(pinned)) {
    const index = Number(at);
    const slot = formation[index];
    const entry = pool.find((e) => e.item.id === itemId);
    if (slot === undefined || entry === undefined || used.has(itemId)) continue;

    const penalty = positionPenalty(entry.player.position, slot);
    filled[index] = {
      slot,
      item: entry.item,
      player: entry.player,
      rating: entry.item.rating,
      penalty,
      effective: effectiveIn(entry.item.rating, penalty),
      pinned: true,
    };
    used.add(itemId);
    const at2 = remainingSlots.findIndex((r) => r.index === index);
    if (at2 >= 0) remainingSlots.splice(at2, 1);
  }

  while (remainingSlots.length > 0) {
    let best: { slotAt: number; entry: (typeof pool)[number]; penalty: number; score: number } | null =
      null;

    for (let s = 0; s < remainingSlots.length; s += 1) {
      const { slot } = remainingSlots[s]!;
      for (const entry of pool) {
        if (used.has(entry.item.id)) continue;
        const penalty = positionPenalty(entry.player.position, slot);
        const score = effectiveIn(entry.item.rating, penalty);
        if (best === null || score > best.score) {
          best = { slotAt: s, entry, penalty, score };
        }
      }
    }

    if (best === null) break; // Out of players before we ran out of slots.

    const { slot, index } = remainingSlots[best.slotAt]!;
    filled[index] = {
      slot,
      item: best.entry.item,
      player: best.entry.player,
      rating: best.entry.item.rating,
      penalty: best.penalty,
      effective: best.score,
      pinned: false,
    };
    used.add(best.entry.item.id);
    remainingSlots.splice(best.slotAt, 1);
  }

  const eleven = filled.filter((s): s is LineupSlot => s !== null);
  const bench = pool
    .filter((entry) => !used.has(entry.item.id))
    .sort((a, b) => b.item.rating - a.item.rating);

  const complete = eleven.length === formation.length;
  const rating = complete
    ? Math.round(eleven.reduce((sum, s) => sum + s.effective, 0) / eleven.length)
    : 0;

  return {
    eleven,
    bench,
    rating,
    complete,
    outOfPosition: eleven.filter((s) => s.penalty > 0).length,
  };
}

/**
 * The player as the item prints them.
 *
 * An item's attributes carry its edition upgrade, so a Hero has to walk onto
 * the pitch as the Hero and not as the ordinary player underneath — otherwise
 * the upgrade is decoration.
 */
export function playerFromItem(item: PlayerItem, player: Player, shirt: number): Player {
  return {
    ...player,
    number: shirt,
    overall: item.rating,
    attributes: item.attributes,
  };
}

/**
 * The squad you start with.
 *
 * A collection is not playable until it can field eleven, and the first pack
 * hands over seven. Rather than making the player buy their way to a team
 * before they can play at all, they begin with a modest one — every position
 * covered, nobody special. That also makes what a pack is *for* obvious: the
 * side you already have is the thing you are trying to beat.
 */
const STARTER_BAND = { min: 60, max: 71 };
const STARTER_BENCH = 5;

export function starterSquad(world: World, seed: string): PlayerItem[] {
  const rng = createRng(seed);

  const byPosition = new Map<Position, { player: Player; club: Club }[]>();
  for (const id of world.clubOrder) {
    const club = world.clubs[id]!;
    for (const player of club.squad) {
      if (player.overall < STARTER_BAND.min || player.overall > STARTER_BAND.max) continue;
      const bucket = byPosition.get(player.position);
      if (bucket) bucket.push({ player, club });
      else byPosition.set(player.position, [{ player, club }]);
    }
  }

  const used = new Set<string>();
  // Surnames repeat across a world of 2,700 players, which is realistic; two
  // of them in the same back four is not, and reads as a duplication bug even
  // when they are different people.
  const surnames = new Set<string>();
  const items: PlayerItem[] = [];

  const take = (position: Position): void => {
    const bucket = byPosition.get(position);
    if (!bucket || bucket.length === 0) return;

    // Two passes: the first insists on a fresh surname, the second settles for
    // anyone, so a thin bucket still fills the slot.
    for (const strict of [true, false]) {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const pick = bucket[Math.floor(rng.next() * bucket.length)]!;
        if (used.has(pick.player.id)) continue;
        if (strict && surnames.has(pick.player.last)) continue;
        used.add(pick.player.id);
        surnames.add(pick.player.last);
        items.push(makeItem(pick.player, pick.club.id, { suffix: `#starter${items.length}` }));
        return;
      }
    }
  };

  for (const slot of FORMATION) take(slot);

  // A bench, so a substitution is possible from the first match.
  const outfield: Position[] = ['CB', 'CM', 'CAM', 'ST', 'LB'];
  for (let i = 0; i < STARTER_BENCH; i += 1) take(outfield[i % outfield.length]!);

  return items;
}

/**
 * The collection as a club the match can kick off with.
 *
 * It borrows the player's own club for its identity — name, crest, kit — so
 * the side that walks out is recognisably theirs; only the eleven inside it
 * comes from the collection. Squad numbers are reassigned by slot because an
 * item carries whatever number the player wore at the club it was printed
 * from, and eleven strangers would otherwise field three number sevens.
 */
export function collectionClub(identity: Club, lineup: Lineup): Club {
  const squad = [
    ...lineup.eleven.map((slot, index) => playerFromItem(slot.item, slot.player, index + 1)),
    ...lineup.bench.map((entry, index) =>
      playerFromItem(entry.item, entry.player, FORMATION.length + index + 1),
    ),
  ];

  return {
    ...identity,
    squad,
    overall: lineup.rating,
  };
}

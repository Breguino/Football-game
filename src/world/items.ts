/**
 * Player items — the collectible version of a player.
 *
 * A player is a person with attributes; an item is one printing of them, with
 * a tier, a rarity and sometimes a special edition. The distinction matters
 * because the same player can exist as several different items, which is the
 * whole basis of a collection.
 */

import { createRng, type Rng } from './rng';
import type { Club, Player, World } from './generate';

export type ItemTier = 'bronze' | 'silver' | 'gold';

/**
 * Special editions. `standard` is the ordinary printing; the rest are the
 * ones worth pulling.
 */
export type ItemEdition = 'standard' | 'totw' | 'hero';

export interface PlayerItem {
  id: string;
  playerId: string;
  clubId: string;
  tier: ItemTier;
  /** Rare printings are scarcer and carry an upgrade on special editions. */
  rare: boolean;
  edition: ItemEdition;
  /** The item's own rating, which a special edition raises above the player's. */
  rating: number;
  /** Attributes as printed on the card, after any edition upgrade. */
  attributes: Player['attributes'];
}

/** Where the tiers divide. Packs are cut on the same boundaries. */
export const SILVER_AT = 65;
export const GOLD_AT = 75;

/** Tier follows quality, the way it does in every collection like this. */
export function tierFor(overall: number): ItemTier {
  if (overall >= GOLD_AT) return 'gold';
  if (overall >= SILVER_AT) return 'silver';
  return 'bronze';
}

/** How much a special edition lifts the printed rating. */
const EDITION_UPGRADE: Record<ItemEdition, number> = {
  standard: 0,
  totw: 2,
  hero: 4,
};

export const EDITION_LABEL: Record<ItemEdition, string> = {
  standard: '',
  totw: 'Team of the Week',
  hero: 'Hero',
};

/** Builds the item for a player at a given edition. */
export function makeItem(
  player: Player,
  clubId: string,
  options: { rare?: boolean; edition?: ItemEdition; suffix?: string } = {},
): PlayerItem {
  const edition = options.edition ?? 'standard';
  const upgrade = EDITION_UPGRADE[edition];
  const rating = Math.min(99, player.overall + upgrade);

  // A special edition lifts the attributes too, so the card reads as the
  // upgrade it is rather than the same player with a nicer background.
  const attributes = { ...player.attributes };
  if (upgrade > 0) {
    for (const key of Object.keys(attributes) as (keyof Player['attributes'])[]) {
      attributes[key] = Math.min(99, attributes[key] + upgrade);
    }
  }

  return {
    id: `${player.id}:${edition}${options.suffix ?? ''}`,
    playerId: player.id,
    clubId,
    tier: tierFor(rating),
    rare: options.rare ?? false,
    edition,
    rating,
    attributes,
  };
}

/** What a pack costs and what it promises. */
export interface PackType {
  id: string;
  name: string;
  description: string;
  price: number;
  size: number;
  /**
   * Minimum player rating for *every* item. This is what makes a gold pack a
   * gold pack: without it the cheap pack and the expensive one draw from the
   * same population and only differ by a single guaranteed card.
   */
  floor: number;
  /** Maximum player rating, where a pack is capped to its own tier. */
  ceiling: number;
  /** Minimum rating of at least one item, above the pack's own floor. */
  guarantees: number;
  /** Chance per item of a rare printing. */
  rareChance: number;
  /** Chance per item of a special edition. */
  specialChance: number;
}

/**
 * The four packs.
 *
 * The guarantees are set against what the world actually generates rather
 * than against round numbers: only a handful of players anywhere clear 86, so
 * a pack promising one would hand out the same few names forever.
 */
export const PACK_TYPES: PackType[] = [
  {
    id: 'bronze',
    name: 'Bronze Pack',
    description: 'Five bronze items. Somebody has to play in the lower divisions.',
    price: 400,
    size: 5,
    floor: 0,
    ceiling: SILVER_AT - 1,
    guarantees: 0,
    rareChance: 0.18,
    specialChance: 0,
  },
  {
    id: 'premium',
    name: 'Premium Gold',
    description: 'Seven items, silver or better, at least one rated 75 or above.',
    price: 5_000,
    size: 7,
    floor: SILVER_AT,
    ceiling: 99,
    guarantees: GOLD_AT,
    rareChance: 0.4,
    specialChance: 0.04,
  },
  {
    id: 'rare-players',
    name: 'Rare Players',
    description: 'Five rare items rated 70 or above, at least one rated 80 or better.',
    price: 25_000,
    size: 5,
    floor: 70,
    ceiling: 99,
    guarantees: 80,
    rareChance: 1,
    specialChance: 0.12,
  },
  {
    id: 'ultimate',
    name: 'Ultimate Pack',
    description: 'Three rare gold items, at least one rated 84 or better.',
    price: 75_000,
    size: 3,
    floor: GOLD_AT,
    ceiling: 99,
    guarantees: 84,
    rareChance: 1,
    specialChance: 0.3,
  },
];

/** Every player in the world, paired with the club they belong to. */
function pool(world: World): { player: Player; club: Club }[] {
  const out: { player: Player; club: Club }[] = [];
  for (const id of world.clubOrder) {
    const club = world.clubs[id]!;
    for (const player of club.squad) out.push({ player, club });
  }
  return out;
}

/**
 * Draws one item, weighted so that good players are rare.
 *
 * The weighting is the thing that makes a pack worth opening: without it every
 * pull is the same and the tier on the card means nothing.
 */
function draw(
  rng: Rng,
  candidates: { player: Club['squad'][number]; club: Club }[],
  pack: PackType,
  floor: number,
): PlayerItem {
  const eligible = candidates.filter(
    (c) => c.player.overall >= floor && c.player.overall <= pack.ceiling,
  );
  // A world small enough to empty a band still has to hand out something.
  const from = eligible.length > 0 ? eligible : candidates;

  // Weight falls off sharply with rating, so an 88 is genuinely uncommon.
  let total = 0;
  const weights = from.map(({ player }) => {
    const w = Math.max(0.02, (100 - player.overall) ** 2.6);
    total += w;
    return w;
  });

  let roll = rng.next() * total;
  let index = 0;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i]!;
    if (roll <= 0) {
      index = i;
      break;
    }
  }

  const chosen = from[index] ?? from[0]!;
  const rare = rng.next() < pack.rareChance;
  const edition: ItemEdition =
    rng.next() < pack.specialChance ? (rng.next() < 0.25 ? 'hero' : 'totw') : 'standard';

  return makeItem(chosen.player, chosen.club.id, {
    rare,
    edition,
    suffix: `#${Math.floor(rng.next() * 1e9).toString(36)}`,
  });
}

/**
 * Opens a pack.
 *
 * The guaranteed item is drawn first and placed last, so the reveal builds
 * rather than peaking on the first card.
 */
export function openPack(world: World, pack: PackType, seed: string): PlayerItem[] {
  const rng = createRng(seed);
  const candidates = pool(world);

  const items: PlayerItem[] = [];
  for (let i = 0; i < pack.size - 1; i += 1) {
    items.push(draw(rng, candidates, pack, pack.floor));
  }

  items.push(draw(rng, candidates, pack, Math.max(pack.floor, pack.guarantees)));

  return items;
}

/** The best item in a pull, for the summary line after a reveal. */
export function bestOf(items: readonly PlayerItem[]): PlayerItem | null {
  return items.reduce<PlayerItem | null>(
    (best, item) => (best === null || item.rating > best.rating ? item : best),
    null,
  );
}

/**
 * Coins returned for discarding an item.
 *
 * Value doubles every five rating points rather than rising in steps by tier:
 * tier is derived from rating, so charging for both double-counts it and puts
 * a cliff between a 74 and a 75 that nothing in the game justifies.
 *
 * The curve is calibrated against what the packs actually pull, so that every
 * pack loses money on average — discarding is a consolation, never a way to
 * farm credits. Rarity and edition multiply on top because those are genuinely
 * independent of how good the player is.
 */
const DISCARD_SCALE = 30;
const DISCARD_DOUBLING = 5;

export function discardValue(item: PlayerItem): number {
  const rarity = item.rare ? 2.2 : 1;
  const edition = item.edition === 'standard' ? 1 : item.edition === 'totw' ? 4 : 8;
  const quality = 2 ** ((item.rating - 60) / DISCARD_DOUBLING);
  return Math.max(1, Math.round(DISCARD_SCALE * quality * rarity * edition));
}

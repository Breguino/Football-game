import { create } from 'zustand';
import { openPack, type PackType, type PlayerItem } from '@/world/items';
import { buildLineup, starterSquad, type Lineup } from '@/world/lineup';
import { useWorld } from './world';
import { load, save } from './persist';
import type { Player, World } from '@/world/generate';

/**
 * What the player owns, and what it cost them.
 *
 * Kept out of the world store because a collection is progress, not content:
 * regenerating the world would rightly wipe it.
 */
/** What you have done with the side, which is the only progression there is. */
export interface MatchRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

const NO_RECORD: MatchRecord = {
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
};

interface CollectionState {
  coins: number;
  items: PlayerItem[];
  packsOpened: number;
  /** Items the player has pinned to a slot, overriding the automatic pick. */
  pinned: Record<number, string>;
  record: MatchRecord;
  canAfford: (pack: PackType) => boolean;
  buy: (pack: PackType) => PlayerItem[] | null;
  discard: (itemId: string, value: number) => void;
  earn: (amount: number) => void;
  recordResult: (scored: number, conceded: number) => void;
  pin: (slot: number, itemId: string | null) => void;
  /** The side these items would field. */
  lineup: () => Lineup;
}

const STARTING_COINS = 148_250;

/** Resolves an item back to the player it was printed from. */
function playerOf(item: PlayerItem): Player | null {
  const world = useWorld.getState().world;
  const club = world.clubs[item.clubId];
  return club?.squad.find((p) => p.id === item.playerId) ?? null;
}

const initialWorld = useWorld.getState().world;

/** The shape written to storage. Deliberately smaller than the store. */
interface Saved {
  coins: number;
  items: PlayerItem[];
  packsOpened: number;
  pinned: Record<number, string>;
  record: MatchRecord;
}

const SAVE_KEY = 'collection';

function fresh(world: World): Saved {
  return {
    coins: STARTING_COINS,
    // A collection that cannot field eleven cannot play, and the first pack
    // hands over seven. You start with a modest side instead of buying your
    // way to the point where the game begins.
    items: starterSquad(world, `${world.seed}:starter`),
    packsOpened: 0,
    pinned: {},
    record: { ...NO_RECORD },
  };
}

/**
 * A save is only loaded back into the world it came from: an item is a player
 * id and a club id, which point at nothing in a world built from another seed.
 */
function restore(world: World): Saved {
  const saved = load<Saved>(SAVE_KEY, world.seed);
  if (!saved) return fresh(world);

  // Storage is editable by hand and survives across versions of the game, so
  // what comes back is checked rather than trusted.
  const items = Array.isArray(saved.items)
    ? saved.items.filter((item) => {
        const club = world.clubs[item?.clubId ?? ''];
        return Boolean(club?.squad.some((p) => p.id === item.playerId));
      })
    : [];

  return {
    coins: Number.isFinite(saved.coins) ? Math.max(0, Math.floor(saved.coins)) : STARTING_COINS,
    items,
    packsOpened: Number.isFinite(saved.packsOpened) ? Math.max(0, saved.packsOpened) : 0,
    pinned: saved.pinned && typeof saved.pinned === 'object' ? saved.pinned : {},
    record: readRecord(saved.record),
  };
}

/** A record is six counters; anything that is not a number is a zero. */
function readRecord(saved: unknown): MatchRecord {
  const from = (saved ?? {}) as Partial<MatchRecord>;
  const count = (v: unknown) => (Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : 0);
  return {
    played: count(from.played),
    won: count(from.won),
    drawn: count(from.drawn),
    lost: count(from.lost),
    goalsFor: count(from.goalsFor),
    goalsAgainst: count(from.goalsAgainst),
  };
}

const restored = restore(initialWorld);

export const useCollection = create<CollectionState>((set, get) => ({
  coins: restored.coins,
  items: restored.items,
  packsOpened: restored.packsOpened,
  pinned: restored.pinned,
  record: restored.record,

  canAfford: (pack) => get().coins >= pack.price,

  buy: (pack) => {
    const { coins, packsOpened } = get();
    if (coins < pack.price) return null;

    const world = useWorld.getState().world;
    // Seeded on the world and the pack count, so a pull is reproducible and
    // the same pack does not hand out the same players twice.
    const pulled = openPack(world, pack, `${world.seed}:${pack.id}:${packsOpened}`);

    set({
      coins: coins - pack.price,
      items: [...get().items, ...pulled],
      packsOpened: packsOpened + 1,
    });
    return pulled;
  },

  discard: (itemId, value) =>
    set((state) => ({
      coins: state.coins + value,
      items: state.items.filter((item) => item.id !== itemId),
      // A discarded item cannot keep holding a shirt.
      pinned: Object.fromEntries(
        Object.entries(state.pinned).filter(([, id]) => id !== itemId),
      ),
    })),

  earn: (amount) => set((state) => ({ coins: state.coins + Math.max(0, Math.round(amount)) })),

  recordResult: (scored, conceded) =>
    set((state) => ({
      record: {
        played: state.record.played + 1,
        won: state.record.won + (scored > conceded ? 1 : 0),
        drawn: state.record.drawn + (scored === conceded ? 1 : 0),
        lost: state.record.lost + (scored < conceded ? 1 : 0),
        goalsFor: state.record.goalsFor + scored,
        goalsAgainst: state.record.goalsAgainst + conceded,
      },
    })),

  pin: (slot, itemId) =>
    set((state) => {
      const pinned = { ...state.pinned };
      if (itemId === null) delete pinned[slot];
      else {
        // One shirt each: pinning a player elsewhere releases their old slot.
        for (const [at, id] of Object.entries(pinned)) {
          if (id === itemId) delete pinned[Number(at)];
        }
        pinned[slot] = itemId;
      }
      return { pinned };
    }),

  lineup: () => buildLineup(get().items, playerOf, undefined, get().pinned),
}));

/**
 * Persist on change, rather than from inside each action.
 *
 * Saving from the actions means every new action has to remember to do it,
 * and the one that forgets loses the player's progress silently. Subscribing
 * makes it impossible to add a mutation that does not persist.
 */
useCollection.subscribe((state, previous) => {
  if (
    state.coins === previous.coins &&
    state.items === previous.items &&
    state.packsOpened === previous.packsOpened &&
    state.pinned === previous.pinned &&
    state.record === previous.record
  ) {
    return;
  }

  const seed = useWorld.getState().world.seed;
  save<Saved>(
    SAVE_KEY,
    {
      coins: state.coins,
      items: state.items,
      packsOpened: state.packsOpened,
      pinned: state.pinned,
      record: state.record,
    },
    seed,
  );
});

/**
 * A new world is a new collection: the items in the old one name players who
 * do not exist in it.
 */
useWorld.subscribe((state, previous) => {
  if (state.world.seed === previous.world.seed) return;
  const next = fresh(state.world);
  useCollection.setState({
    coins: next.coins,
    items: next.items,
    packsOpened: next.packsOpened,
    pinned: next.pinned,
    record: next.record,
  });
});

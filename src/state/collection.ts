import { create } from 'zustand';
import { openPack, type PackType, type PlayerItem } from '@/world/items';
import { buildLineup, starterSquad, type Lineup } from '@/world/lineup';
import { useWorld } from './world';
import type { Player } from '@/world/generate';

/**
 * What the player owns, and what it cost them.
 *
 * Kept out of the world store because a collection is progress, not content:
 * regenerating the world would rightly wipe it.
 */
interface CollectionState {
  coins: number;
  items: PlayerItem[];
  packsOpened: number;
  /** Items the player has pinned to a slot, overriding the automatic pick. */
  pinned: Record<number, string>;
  canAfford: (pack: PackType) => boolean;
  buy: (pack: PackType) => PlayerItem[] | null;
  discard: (itemId: string, value: number) => void;
  earn: (amount: number) => void;
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

export const useCollection = create<CollectionState>((set, get) => ({
  coins: STARTING_COINS,
  // A collection that cannot field eleven cannot play, and the first pack
  // hands over seven. You start with a modest side instead of buying your way
  // to the point where the game begins.
  items: starterSquad(initialWorld, `${initialWorld.seed}:starter`),
  packsOpened: 0,
  pinned: {},

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

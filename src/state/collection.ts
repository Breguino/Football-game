import { create } from 'zustand';
import { openPack, type PackType, type PlayerItem } from '@/world/items';
import { useWorld } from './world';

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
  canAfford: (pack: PackType) => boolean;
  buy: (pack: PackType) => PlayerItem[] | null;
  discard: (itemId: string, value: number) => void;
}

const STARTING_COINS = 148_250;

export const useCollection = create<CollectionState>((set, get) => ({
  coins: STARTING_COINS,
  items: [],
  packsOpened: 0,

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
    })),
}));

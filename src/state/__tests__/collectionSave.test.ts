import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION } from '../persist';

/**
 * The collection reads its save when the module first loads, so each of these
 * plants a save, then imports the store fresh.
 */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function plant(data: unknown, seed: string) {
  window.localStorage.setItem(
    'boot-room:collection',
    JSON.stringify({ version: SAVE_VERSION, seed, data }),
  );
}

async function loadStore() {
  vi.resetModules();
  const { useWorld } = await import('../world');
  const { useCollection } = await import('../collection');
  return { world: useWorld.getState().world, collection: useCollection.getState() };
}

describe('the collection save', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts a playable squad when there is nothing saved', async () => {
    const { collection } = await loadStore();
    expect(collection.items.length).toBeGreaterThanOrEqual(11);
    expect(collection.lineup().complete).toBe(true);
    expect(collection.coins).toBeGreaterThan(0);
  });

  it('comes back with what was saved', async () => {
    const first = await loadStore();
    const seed = first.world.seed;
    const kept = first.collection.items.slice(0, 12);
    plant({ coins: 999, items: kept, packsOpened: 4, pinned: { 3: kept[5]!.id } }, seed);

    const { collection } = await loadStore();
    expect(collection.coins).toBe(999);
    expect(collection.items).toHaveLength(12);
    expect(collection.packsOpened).toBe(4);
    expect(collection.pinned[3]).toBe(kept[5]!.id);
  });

  it('drops items naming players who do not exist', async () => {
    const first = await loadStore();
    const real = first.collection.items.slice(0, 3);
    plant(
      {
        coins: 100,
        items: [
          ...real,
          { id: 'x', playerId: 'nobody', clubId: 'nowhere', tier: 'gold', rating: 99 },
          { id: 'y', playerId: 'nobody', clubId: real[0]!.clubId, tier: 'gold', rating: 99 },
        ],
        packsOpened: 0,
        pinned: {},
      },
      first.world.seed,
    );

    const { collection } = await loadStore();
    expect(collection.items).toHaveLength(3);
  });

  it('refuses a whole save from another world rather than loading dangling items', async () => {
    const first = await loadStore();
    plant({ coins: 5, items: first.collection.items, packsOpened: 1, pinned: {} }, 'some-other-seed');

    const { collection } = await loadStore();
    // Back to a fresh, playable squad — not five credits and nobody to field.
    expect(collection.coins).not.toBe(5);
    expect(collection.lineup().complete).toBe(true);
  });

  it('repairs nonsense values instead of trusting them', async () => {
    const first = await loadStore();
    plant(
      { coins: -9000, items: 'not an array', packsOpened: NaN, pinned: null },
      first.world.seed,
    );

    const { collection } = await loadStore();
    expect(collection.coins).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(collection.items)).toBe(true);
    expect(collection.packsOpened).toBe(0);
    expect(collection.pinned).toEqual({});
  });

  it('writes on every change, without each action having to remember to', async () => {
    vi.resetModules();
    const { useCollection } = await import('../collection');
    const { discard } = useCollection.getState();
    const doomed = useCollection.getState().items[0]!;

    discard(doomed.id, 250);

    const raw = window.localStorage.getItem('boot-room:collection');
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!) as { data: { items: { id: string }[]; coins: number } };
    expect(saved.data.items.some((i) => i.id === doomed.id)).toBe(false);
  });
});

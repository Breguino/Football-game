import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clear, load, save, SAVE_VERSION } from '../persist';

/** A localStorage good enough to test against, and one that refuses to work. */
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

function useStorage(storage: Storage | (() => never)) {
  vi.stubGlobal('window', { localStorage: storage });
}

describe('saving', () => {
  beforeEach(() => useStorage(memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips a value', () => {
    save('thing', { a: 1, b: ['two'] });
    expect(load('thing')).toEqual({ a: 1, b: ['two'] });
  });

  it('returns null for a key that was never written', () => {
    expect(load('absent')).toBeNull();
  });

  it('clears', () => {
    save('thing', 1);
    clear('thing');
    expect(load('thing')).toBeNull();
  });

  it('refuses a save from a different world', () => {
    save('coll', { items: 3 }, 'seed-a');
    expect(load('coll', 'seed-a')).toEqual({ items: 3 });
    // An item is a player id and a club id; in another world they name nobody.
    expect(load('coll', 'seed-b')).toBeNull();
  });

  it('ignores the seed when the caller does not care about one', () => {
    save('settings', { volume: 3 });
    expect(load('settings')).toEqual({ volume: 3 });
  });

  it('refuses a save from an older version', () => {
    const raw = JSON.stringify({ version: SAVE_VERSION - 1, data: { old: true } });
    window.localStorage.setItem('boot-room:thing', raw);
    expect(load('thing')).toBeNull();
  });

  it('refuses malformed json rather than throwing', () => {
    window.localStorage.setItem('boot-room:thing', '{not json');
    expect(() => load('thing')).not.toThrow();
    expect(load('thing')).toBeNull();
  });

  it('refuses an envelope with no data', () => {
    window.localStorage.setItem(
      'boot-room:thing',
      JSON.stringify({ version: SAVE_VERSION }),
    );
    expect(load('thing')).toBeNull();
  });
});

describe('when storage is unavailable', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not throw, and reports nothing saved', () => {
    // Private browsing throws on access rather than returning null, and a game
    // that will not start because it cannot save is worse than one that does
    // not save.
    const hostile = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    useStorage(hostile);

    expect(() => save('thing', 1)).not.toThrow();
    expect(() => clear('thing')).not.toThrow();
    expect(load('thing')).toBeNull();
  });

  it('survives a full quota mid-save', () => {
    const map = new Map<string, string>();
    let writes = 0;
    const full = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        // The probe write succeeds; the real one does not.
        writes += 1;
        if (writes > 1) throw new Error('QuotaExceededError');
        map.set(k, v);
      },
      removeItem: (k: string) => void map.delete(k),
    } as unknown as Storage;
    useStorage(full);

    expect(() => save('thing', { big: 'x'.repeat(10) })).not.toThrow();
  });
});

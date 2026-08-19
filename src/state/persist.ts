/**
 * Saving progress.
 *
 * Only progress is saved — never the world. The world is 2,700 players and
 * 108 clubs regenerated from one seed string in a few milliseconds, so storing
 * it would be megabytes of something we can rebuild exactly. What is saved is
 * what the player did: their items, their credits, the shirts they picked.
 *
 * Every record carries the seed of the world it belongs to. An item is only a
 * player id and a club id, which mean nothing in a different world, so a save
 * from another seed has to be refused rather than loaded into dangling
 * references.
 */

const PREFIX = 'boot-room';

/**
 * Bumped whenever a saved shape changes in a way old data cannot satisfy —
 * and also when world generation changes, because the same seed then produces
 * different players and every saved item names somebody who is not there.
 */
export const SAVE_VERSION = 2;

interface Envelope<T> {
  version: number;
  /** The world this save belongs to, where it belongs to one. */
  seed?: string;
  data: T;
}

/**
 * Storage, if there is any.
 *
 * Private browsing and disabled storage both throw on access rather than
 * returning null, and a game that will not start because it cannot save is
 * worse than one that does not save.
 */
function storage(): Storage | null {
  try {
    const probe = `${PREFIX}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function save<T>(key: string, data: T, seed?: string): void {
  const store = storage();
  if (!store) return;
  const envelope: Envelope<T> = { version: SAVE_VERSION, data, ...(seed ? { seed } : {}) };
  try {
    store.setItem(`${PREFIX}:${key}`, JSON.stringify(envelope));
  } catch {
    // A full quota is not worth interrupting a match for.
  }
}

/**
 * Reads a save back, or null if there is nothing usable.
 *
 * Returns null rather than throwing on every failure mode there is — no
 * storage, absent key, malformed JSON, an older version, a different world.
 * The caller's fallback is always "start fresh", which is the right answer to
 * all of them.
 */
export function load<T>(key: string, seed?: string): T | null {
  const store = storage();
  if (!store) return null;

  const raw = store.getItem(`${PREFIX}:${key}`);
  if (raw === null) return null;

  try {
    const envelope = JSON.parse(raw) as Partial<Envelope<T>>;
    if (envelope.version !== SAVE_VERSION) return null;
    if (seed !== undefined && envelope.seed !== seed) return null;
    if (envelope.data === undefined) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

export function clear(key: string): void {
  storage()?.removeItem(`${PREFIX}:${key}`);
}

import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generate';
import {
  bestOf,
  discardValue,
  makeItem,
  openPack,
  PACK_TYPES,
  tierFor,
  type PackType,
} from '../items';

const world = generateWorld('kick-off');

/** Every player in the world, flattened, for the tests that need a pool. */
const everyone = world.clubOrder.flatMap((id) => {
  const club = world.clubs[id]!;
  return club.squad.map((player) => ({ player, club }));
});

function packById(id: string): PackType {
  const pack = PACK_TYPES.find((p) => p.id === id);
  if (!pack) throw new Error(`no pack ${id}`);
  return pack;
}

describe('tiers', () => {
  it('splits at 65 and 75', () => {
    expect(tierFor(64)).toBe('bronze');
    expect(tierFor(65)).toBe('silver');
    expect(tierFor(74)).toBe('silver');
    expect(tierFor(75)).toBe('gold');
  });
});

describe('items', () => {
  const player = everyone[0]!.player;

  it('prints a standard item at the player’s own rating', () => {
    const item = makeItem(player, 'club-x');
    expect(item.rating).toBe(player.overall);
    expect(item.attributes).toEqual(player.attributes);
    expect(item.edition).toBe('standard');
    expect(item.rare).toBe(false);
  });

  it('lifts rating and attributes together on a special edition', () => {
    const totw = makeItem(player, 'club-x', { edition: 'totw' });
    const hero = makeItem(player, 'club-x', { edition: 'hero' });

    expect(totw.rating).toBe(Math.min(99, player.overall + 2));
    expect(hero.rating).toBe(Math.min(99, player.overall + 4));

    // The card would read as a lie if the badge said upgrade and the stats
    // were unchanged.
    for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[]) {
      expect(hero.attributes[key]).toBe(Math.min(99, player.attributes[key] + 4));
    }
  });

  it('never prints past 99', () => {
    const ceiling = { ...player, overall: 98 };
    const item = makeItem(ceiling, 'club-x', { edition: 'hero' });
    expect(item.rating).toBe(99);
    for (const value of Object.values(item.attributes)) expect(value).toBeLessThanOrEqual(99);
  });

  it('can carry a player past their own tier', () => {
    const borderline = { ...player, overall: 73 };
    expect(makeItem(borderline, 'club-x').tier).toBe('silver');
    expect(makeItem(borderline, 'club-x', { edition: 'hero' }).tier).toBe('gold');
  });

  it('gives two printings of one player distinct ids', () => {
    const a = makeItem(player, 'club-x', { suffix: '#a' });
    const b = makeItem(player, 'club-x', { suffix: '#b' });
    expect(a.id).not.toBe(b.id);
    expect(a.playerId).toBe(b.playerId);
  });
});

describe('packs', () => {
  it('is deterministic for a seed', () => {
    const pack = packById('premium');
    const a = openPack(world, pack, 'seed:1');
    const b = openPack(world, pack, 'seed:1');
    expect(a).toEqual(b);
    expect(openPack(world, pack, 'seed:2')).not.toEqual(a);
  });

  it('pulls the advertised number of items', () => {
    for (const pack of PACK_TYPES) {
      expect(openPack(world, pack, `size:${pack.id}`)).toHaveLength(pack.size);
    }
  });

  it('honours the guarantee, and saves it for last', () => {
    for (const pack of PACK_TYPES.filter((p) => p.guarantees > 0)) {
      for (let i = 0; i < 40; i += 1) {
        const items = openPack(world, pack, `guarantee:${pack.id}:${i}`);
        const last = items[items.length - 1]!;
        expect(last.rating).toBeGreaterThanOrEqual(pack.guarantees);
      }
    }
  });

  it('keeps every item inside the pack’s own band', () => {
    // A bronze pack containing a gold is not a bronze pack — the band is what
    // the price buys, and a single guaranteed card is not enough to make an
    // expensive pack feel different from a cheap one.
    for (const pack of PACK_TYPES) {
      for (let i = 0; i < 30; i += 1) {
        for (const item of openPack(world, pack, `band:${pack.id}:${i}`)) {
          const player = world.clubs[item.clubId]!.squad.find((p) => p.id === item.playerId)!;
          expect(player.overall).toBeGreaterThanOrEqual(pack.floor);
          expect(player.overall).toBeLessThanOrEqual(pack.ceiling);
        }
      }
    }
  });

  it('sets every guarantee inside what the world actually generates', () => {
    // A promise of an 86 is worthless if only five players anywhere clear it:
    // the pack would hand out the same handful of names forever.
    for (const seed of ['kick-off', 'another', 'third']) {
      const w = generateWorld(seed);
      const squad = w.clubOrder.flatMap((id) => w.clubs[id]!.squad);
      for (const pack of PACK_TYPES.filter((p) => p.guarantees > 0)) {
        const pool = squad.filter((p) => p.overall >= pack.guarantees);
        expect(pool.length).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('climbs in quality with price', () => {
    const mean = (pack: PackType) => {
      const items = Array.from({ length: 60 }, (_, i) =>
        openPack(world, pack, `climb:${pack.id}:${i}`),
      ).flat();
      return items.reduce((sum, item) => sum + item.rating, 0) / items.length;
    };
    const byPrice = [...PACK_TYPES].sort((a, b) => a.price - b.price).map(mean);
    for (let i = 1; i < byPrice.length; i += 1) {
      expect(byPrice[i]!).toBeGreaterThan(byPrice[i - 1]!);
    }
  });

  it('honours the rare chance at its extremes', () => {
    const always = packById('ultimate');
    for (const item of openPack(world, always, 'rare:always')) expect(item.rare).toBe(true);

    const never = packById('bronze');
    for (let i = 0; i < 20; i += 1) {
      for (const item of openPack(world, never, `special:${i}`)) {
        expect(item.edition).toBe('standard');
      }
    }
  });

  it('resolves every item back to a real player at a real club', () => {
    const items = openPack(world, packById('premium'), 'resolve');
    for (const item of items) {
      const club = world.clubs[item.clubId];
      expect(club).toBeDefined();
      expect(club!.squad.some((p) => p.id === item.playerId)).toBe(true);
    }
  });

  it('makes good players rare', () => {
    // The weighting is the point of a pack: if pulls matched the population,
    // the tier on the card would mean nothing.
    const pack = packById('bronze');
    const pulled = Array.from({ length: 120 }, (_, i) =>
      openPack(world, pack, `weight:${i}`),
    ).flat();

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const population = mean(everyone.map((e) => e.player.overall));
    const pull = mean(pulled.map((item) => item.rating));

    expect(pull).toBeLessThan(population);
    expect(pulled.filter((i) => i.tier === 'gold').length / pulled.length).toBeLessThan(0.1);
  });

  it('finds the best item of a pull', () => {
    const items = openPack(world, packById('rare-players'), 'best');
    const best = bestOf(items)!;
    for (const item of items) expect(item.rating).toBeLessThanOrEqual(best.rating);
    expect(bestOf([])).toBeNull();
  });
});

describe('discard value', () => {
  const base = everyone[0]!.player;

  it('rises with tier, rarity, edition and rating', () => {
    const bronze = makeItem({ ...base, overall: 60 }, 'c');
    const gold = makeItem({ ...base, overall: 80 }, 'c');
    expect(discardValue(gold)).toBeGreaterThan(discardValue(bronze));

    const plain = makeItem({ ...base, overall: 80 }, 'c');
    const rare = makeItem({ ...base, overall: 80 }, 'c', { rare: true });
    const hero = makeItem({ ...base, overall: 80 }, 'c', { rare: true, edition: 'hero' });
    expect(discardValue(rare)).toBeGreaterThan(discardValue(plain));
    expect(discardValue(hero)).toBeGreaterThan(discardValue(rare));
  });

  it('is always worth something, even at the bottom', () => {
    const worst = makeItem({ ...base, overall: 40 }, 'c');
    expect(discardValue(worst)).toBeGreaterThan(0);
  });

  it('leaves every pack a loss on average, so credits cannot be farmed', () => {
    // Discarding is a consolation. The moment any pack pays back more than it
    // costs, the optimal way to play is to buy that pack forever.
    for (const pack of PACK_TYPES) {
      const perPack = Array.from({ length: 80 }, (_, i) =>
        openPack(world, pack, `econ:${pack.id}:${i}`).reduce(
          (sum, item) => sum + discardValue(item),
          0,
        ),
      );
      const average = perPack.reduce((a, b) => a + b, 0) / perPack.length;
      expect(average).toBeLessThan(pack.price * 0.7);
    }
  });

  it('rises smoothly across a tier boundary', () => {
    // Value follows rating, not tier, so nothing jumps at 65 or 75.
    const at = (overall: number) => discardValue(makeItem({ ...base, overall }, 'c'));
    expect(at(75) / at(74)).toBeLessThan(1.25);
    expect(at(65) / at(64)).toBeLessThan(1.25);
  });
});

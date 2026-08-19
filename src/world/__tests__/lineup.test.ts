import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generate';
import { makeItem, type PlayerItem } from '../items';
import {
  buildLineup,
  FORMATION,
  playerFromItem,
  positionPenalty,
  starterSquad,
} from '../lineup';
import type { Player, Position } from '../generate';

const world = generateWorld('kick-off');
const everyone = world.clubOrder.flatMap((id) =>
  world.clubs[id]!.squad.map((player) => ({ player, clubId: id })),
);

const byId = new Map(everyone.map((e) => [e.player.id, e.player]));
const resolve = (item: PlayerItem): Player | null => byId.get(item.playerId) ?? null;

/** A synthetic item at an exact position and rating, for the fitting tests. */
function fake(position: Position, overall: number, tag: string): PlayerItem {
  const base = everyone.find((e) => e.player.position === position)!;
  const player: Player = { ...base.player, id: `fake:${tag}`, position, overall };
  byId.set(player.id, player);
  return makeItem(player, base.clubId, { suffix: `#${tag}` });
}

describe('position penalty', () => {
  it('is free in your own position', () => {
    for (const p of FORMATION) expect(positionPenalty(p, p)).toBe(0);
  });

  it('is symmetric between related positions', () => {
    // A full-back covering the far flank and a winger dropping to full-back
    // are the same favour; an asymmetric table quietly prefers one direction.
    const pairs: [Position, Position][] = [
      ['LB', 'RB'],
      ['CDM', 'CM'],
      ['CM', 'CAM'],
      ['LW', 'RW'],
      ['LB', 'LW'],
      ['RB', 'RW'],
    ];
    for (const [a, b] of pairs) {
      expect(positionPenalty(a, b)).toBe(positionPenalty(b, a));
    }
  });

  it('rules out anyone but a keeper in goal, and a keeper anywhere else', () => {
    for (const p of FORMATION) {
      if (p === 'GK') continue;
      // Larger than the whole rating range, so no outfielder is ever worth it.
      expect(positionPenalty(p, 'GK')).toBeGreaterThan(99);
      expect(positionPenalty('GK', p)).toBeGreaterThan(99);
    }
  });

  it('costs less to shift along the spine than across the pitch', () => {
    expect(positionPenalty('CM', 'CDM')).toBeLessThan(positionPenalty('ST', 'CB'));
    expect(positionPenalty('CAM', 'ST')).toBeLessThan(positionPenalty('CB', 'ST'));
  });
});

describe('building a lineup', () => {
  it('fields every slot when there are enough players', () => {
    const items = starterSquad(world, 'lineup:full');
    const lineup = buildLineup(items, resolve);
    expect(lineup.complete).toBe(true);
    expect(lineup.eleven).toHaveLength(FORMATION.length);
    expect(lineup.eleven.map((s) => s.slot)).toEqual(FORMATION);
  });

  it('reports an incomplete side rather than inventing one', () => {
    const short = starterSquad(world, 'lineup:short').slice(0, 6);
    const lineup = buildLineup(short, resolve);
    expect(lineup.complete).toBe(false);
    expect(lineup.rating).toBe(0);
    expect(lineup.eleven.length).toBeLessThan(FORMATION.length);
  });

  it('puts nobody in goal but a keeper when one is available', () => {
    const items = [fake('GK', 62, 'gk'), ...FORMATION.slice(1).map((p, i) => fake(p, 88, `x${i}`))];
    const lineup = buildLineup(items, resolve);
    const keeper = lineup.eleven.find((s) => s.slot === 'GK')!;
    // A 62 keeper beats an 88 striker in goal by a mile, and should.
    expect(keeper.player.position).toBe('GK');
    expect(keeper.rating).toBe(62);
  });

  it('prefers a specialist to a better player out of position', () => {
    const items = [
      ...FORMATION.map((p, i) => fake(p, 70, `base${i}`)),
      fake('ST', 84, 'striker'),
    ];
    const lineup = buildLineup(items, resolve);
    const centreBacks = lineup.eleven.filter((s) => s.slot === 'CB');
    for (const cb of centreBacks) expect(cb.player.position).toBe('CB');
    // The 84 takes the striker's shirt, and the 70 striker drops to the bench.
    expect(lineup.eleven.find((s) => s.slot === 'ST')!.rating).toBe(84);
  });

  it('does not strand a specialist behind a near-fit taken earlier', () => {
    // Filling slots in order would give RB to the 80 centre-back (penalty 6,
    // effective 74) and leave the 75 right-back on the bench.
    const items = [
      ...FORMATION.map((p, i) => fake(p, 60, `f${i}`)),
      fake('CB', 80, 'cb80'),
      fake('RB', 75, 'rb75'),
    ];
    const lineup = buildLineup(items, resolve);
    expect(lineup.eleven.find((s) => s.slot === 'RB')!.player.position).toBe('RB');
    expect(lineup.eleven.find((s) => s.slot === 'CB')!.rating).toBe(80);
  });

  it('counts the eleven at their effective rating, not their printed one', () => {
    const items = FORMATION.map((p, i) => fake(p, 80, `e${i}`));
    expect(buildLineup(items, resolve).rating).toBe(80);

    // Swap the striker for an equally rated centre-back: same printed ratings,
    // weaker side.
    const shifted = [...items.slice(0, 9), fake('CB', 80, 'wrong'), items[10]!];
    const lineup = buildLineup(shifted, resolve);
    expect(lineup.rating).toBeLessThan(80);
    expect(lineup.outOfPosition).toBeGreaterThan(0);
  });

  it('benches whoever is left, best first', () => {
    const items = starterSquad(world, 'lineup:bench');
    const lineup = buildLineup(items, resolve);
    expect(lineup.bench.length).toBe(items.length - FORMATION.length);
    for (let i = 1; i < lineup.bench.length; i += 1) {
      expect(lineup.bench[i - 1]!.item.rating).toBeGreaterThanOrEqual(lineup.bench[i]!.item.rating);
    }
  });

  it('never fields the same item twice', () => {
    const lineup = buildLineup(starterSquad(world, 'lineup:dupes'), resolve);
    const ids = lineup.eleven.map((s) => s.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pinned shirts', () => {
  const items = FORMATION.map((p, i) => fake(p, 70, `p${i}`));
  const striker = items[9]!;

  it('put the chosen item in the chosen slot', () => {
    // Slot 2 is a centre-back. The striker has no business there, which is
    // the point: the player asked for it.
    const lineup = buildLineup(items, resolve, FORMATION, { 2: striker.id });
    const cb = lineup.eleven[2]!;
    expect(cb.item.id).toBe(striker.id);
    expect(cb.pinned).toBe(true);
    expect(cb.penalty).toBeGreaterThan(0);
  });

  it('do not let one item hold two shirts', () => {
    const lineup = buildLineup(items, resolve, FORMATION, { 2: striker.id, 3: striker.id });
    const held = lineup.eleven.filter((s) => s.item.id === striker.id);
    expect(held).toHaveLength(1);
    expect(lineup.complete).toBe(true);
  });

  it('still fill the rest of the side automatically', () => {
    const lineup = buildLineup(items, resolve, FORMATION, { 2: striker.id });
    expect(lineup.complete).toBe(true);
    expect(lineup.eleven.filter((s) => s.pinned)).toHaveLength(1);
  });

  it('ignore a pin naming an item that is no longer owned', () => {
    const lineup = buildLineup(items, resolve, FORMATION, { 2: 'sold-long-ago' });
    expect(lineup.complete).toBe(true);
    expect(lineup.eleven[2]!.pinned).toBe(false);
  });

  it('count against the side at the penalised rating', () => {
    const free = buildLineup(items, resolve);
    const forced = buildLineup(items, resolve, FORMATION, { 2: striker.id });
    expect(forced.rating).toBeLessThan(free.rating);
  });
});

describe('the starter squad', () => {
  it('is deterministic for a seed', () => {
    expect(starterSquad(world, 'same')).toEqual(starterSquad(world, 'same'));
    expect(starterSquad(world, 'other')).not.toEqual(starterSquad(world, 'same'));
  });

  it('covers every position in the formation', () => {
    for (const seed of ['a', 'b', 'c']) {
      const items = starterSquad(world, seed);
      const positions = items.map((i) => resolve(i)!.position);
      for (const slot of FORMATION) expect(positions).toContain(slot);
    }
  });

  it('fields a complete eleven with substitutes available', () => {
    const lineup = buildLineup(starterSquad(world, 'playable'), resolve);
    expect(lineup.complete).toBe(true);
    expect(lineup.bench.length).toBeGreaterThan(0);

    // Nobody is played somewhere unrelated to what they are. A specialist can
    // still lose their shirt to a better player from a neighbouring position —
    // across an eleven-point rating band that is often the stronger side, and
    // picking it is the builder working, not failing.
    const keeper = lineup.eleven[0]!;
    expect(keeper.slot).toBe('GK');
    expect(keeper.player.position).toBe('GK');
    for (const slot of lineup.eleven) expect(slot.penalty).toBeLessThan(10);
  });

  it('is modest — a starting point, not a finished team', () => {
    for (const seed of ['a', 'b', 'c']) {
      const lineup = buildLineup(starterSquad(world, seed), resolve);
      expect(lineup.rating).toBeGreaterThanOrEqual(58);
      expect(lineup.rating).toBeLessThanOrEqual(72);
    }
  });

  it('has no duplicate players', () => {
    const items = starterSquad(world, 'unique');
    const ids = items.map((i) => i.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no two players sharing a surname', () => {
    // They would be different people, but two Krebs in the same back four
    // reads as a duplication bug rather than a coincidence.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const names = starterSquad(world, seed).map((i) => resolve(i)!.last);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('items on the pitch', () => {
  it('play at their printed rating, upgrade included', () => {
    const base = everyone.find((e) => e.player.overall < 90)!;
    const hero = makeItem(base.player, base.clubId, { edition: 'hero' });
    const onPitch = playerFromItem(hero, base.player, 9);

    expect(onPitch.overall).toBe(hero.rating);
    expect(onPitch.overall).toBeGreaterThan(base.player.overall);
    expect(onPitch.attributes).toEqual(hero.attributes);
    expect(onPitch.number).toBe(9);
    expect(onPitch.last).toBe(base.player.last);
  });
});

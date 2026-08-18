import { describe, expect, it } from 'vitest';
import { generateWorld, startingEleven } from '../generate';
import { createRng } from '../rng';
import { luminance, inkFor, hsl } from '../colour';

describe('world generation', () => {
  const world = generateWorld('kick-off');

  it('is deterministic for a given seed', () => {
    const again = generateWorld('kick-off');
    expect(JSON.stringify(again)).toBe(JSON.stringify(world));
  });

  it('differs between seeds', () => {
    const other = generateWorld('different');
    expect(other.clubs[other.clubOrder[0]!]!.name).not.toBe(world.clubs[world.clubOrder[0]!]!.name);
  });

  it('fills every league', () => {
    expect(world.leagues).toHaveLength(6);
    for (const league of world.leagues) expect(league.clubIds).toHaveLength(18);
    expect(world.clubOrder).toHaveLength(108);
  });

  it('gives every club a unique name and three-letter code', () => {
    const names = new Set<string>();
    const codes = new Set<string>();
    for (const id of world.clubOrder) {
      const club = world.clubs[id]!;
      expect(club.code).toMatch(/^[A-Z0-9]{3}$/);
      expect(names.has(club.name)).toBe(false);
      expect(codes.has(club.code)).toBe(false);
      names.add(club.name);
      codes.add(club.code);
    }
  });

  it('produces readable scoreboard text on every club colour', () => {
    for (const id of world.clubOrder) {
      const { primary, ink } = world.clubs[id]!.colours;
      const contrast =
        (Math.max(luminance(primary), luminance(ink)) + 0.05) /
        (Math.min(luminance(primary), luminance(ink)) + 0.05);
      // 4.5:1 is the WCAG AA threshold for body text; the scoreboard code is
      // large and bold, but holding AA keeps it legible at radar scale too.
      expect(contrast).toBeGreaterThan(4.5);
    }
  });

  it('builds squads that can field an eleven', () => {
    for (const id of world.clubOrder) {
      const club = world.clubs[id]!;
      expect(club.squad.length).toBeGreaterThanOrEqual(23);
      const eleven = startingEleven(club);
      expect(eleven).toHaveLength(11);
      expect(new Set(eleven.map((p) => p.id)).size).toBe(11);
      expect(eleven[0]!.position).toBe('GK');
      expect(club.squad.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps attributes and shirt numbers in range', () => {
    for (const id of world.clubOrder) {
      for (const player of world.clubs[id]!.squad) {
        expect(player.overall).toBeGreaterThanOrEqual(40);
        expect(player.overall).toBeLessThanOrEqual(94);
        expect(player.potential).toBeGreaterThanOrEqual(player.overall);
        expect(player.number).toBeGreaterThanOrEqual(1);
        expect(player.number).toBeLessThanOrEqual(25);
        expect(player.skillMoves).toBeGreaterThanOrEqual(1);
        expect(player.skillMoves).toBeLessThanOrEqual(5);
        for (const value of Object.values(player.attributes)) {
          expect(value).toBeGreaterThanOrEqual(24);
          expect(value).toBeLessThanOrEqual(99);
        }
      }
    }
  });

  it('gives every player in a squad a distinct shirt number', () => {
    for (const id of world.clubOrder) {
      const club = world.clubs[id]!;
      const numbers = club.squad.map((p) => p.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it('gives the best keeper the number 1 shirt', () => {
    for (const id of world.clubOrder) {
      const club = world.clubs[id]!;
      const keepers = [...club.squad.filter((p) => p.position === 'GK')].sort(
        (a, b) => b.overall - a.overall,
      );
      expect(keepers[0]!.number).toBe(1);
      // And that keeper is the one who actually starts.
      expect(startingEleven(club)[0]!.number).toBe(1);
    }
  });

  it('avoids stacking one surname through a squad', () => {
    for (const id of world.clubOrder) {
      const club = world.clubs[id]!;
      const counts = new Map<string, number>();
      for (const p of club.squad) counts.set(p.last, (counts.get(p.last) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it('keeps club ratings in a believable band', () => {
    const overalls = world.clubOrder.map((id) => world.clubs[id]!.overall);
    // The best side in the world should be a strong but not absurd team, and
    // the weakest should still look like a professional squad.
    expect(Math.max(...overalls)).toBeLessThanOrEqual(86);
    expect(Math.max(...overalls)).toBeGreaterThanOrEqual(78);
    expect(Math.min(...overalls)).toBeGreaterThanOrEqual(58);
  });

  it('does not let a positional bias outrun a player rating', () => {
    for (const id of world.clubOrder) {
      for (const player of world.clubs[id]!.squad) {
        const best = Math.max(...Object.values(player.attributes));
        expect(best).toBeLessThanOrEqual(player.overall + 8);
      }
    }
  });

  it('spreads club strength across a league', () => {
    const top = world.leagues[0]!;
    const overalls = top.clubIds.map((id) => world.clubs[id]!.overall);
    expect(Math.max(...overalls) - Math.min(...overalls)).toBeGreaterThan(6);
  });
});

describe('colour', () => {
  it('converts hsl to hex', () => {
    expect(hsl(0, 100, 50)).toBe('#FF0000');
    expect(hsl(120, 100, 50)).toBe('#00FF00');
    expect(hsl(0, 0, 100)).toBe('#FFFFFF');
  });

  it('picks the readable ink', () => {
    expect(inkFor('#FFFFFF', '#FFFFFF', '#000000')).toBe('#000000');
    expect(inkFor('#101010', '#FFFFFF', '#000000')).toBe('#FFFFFF');
  });
});

describe('rng', () => {
  it('is reproducible and forks independently', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(createRng('seed').fork('x').next()).not.toBe(createRng('seed').fork('y').next());
  });

  it('respects bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 500; i += 1) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

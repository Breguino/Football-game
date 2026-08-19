import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generate';
import { DIFFICULTY_BONUS, opponentsFor } from '../opponents';

const world = generateWorld('kick-off');

describe('the fixture slate', () => {
  it('offers four rungs, easiest first', () => {
    const slate = opponentsFor(world, 70, 0);
    expect(slate).toHaveLength(4);
    expect(slate.map((o) => o.difficulty)).toEqual([
      'comfortable',
      'even',
      'testing',
      'formidable',
    ]);
  });

  it('climbs in strength', () => {
    for (const rating of [58, 66, 74, 82]) {
      const slate = opponentsFor(world, rating, 0);
      for (let i = 1; i < slate.length; i += 1) {
        expect(slate[i]!.club.overall).toBeGreaterThanOrEqual(slate[i - 1]!.club.overall);
      }
    }
  });

  it('scales to the squad, so improving changes who you face', () => {
    const weak = opponentsFor(world, 60, 0);
    const strong = opponentsFor(world, 82, 0);
    const mean = (s: typeof weak) => s.reduce((sum, o) => sum + o.club.overall, 0) / s.length;
    expect(mean(strong)).toBeGreaterThan(mean(weak));
  });

  it('puts the easiest rung below you and the hardest above', () => {
    const slate = opponentsFor(world, 70, 0);
    expect(slate[0]!.gap).toBeLessThan(0);
    expect(slate[3]!.gap).toBeGreaterThan(0);
  });

  it('never offers the same club twice, or your own', () => {
    const mine = world.clubOrder[0]!;
    for (let played = 0; played < 12; played += 1) {
      const slate = opponentsFor(world, 70, played, mine);
      const ids = slate.map((o) => o.club.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(mine);
    }
  });

  it('is deterministic for the same squad and record', () => {
    expect(opponentsFor(world, 70, 3)).toEqual(opponentsFor(world, 70, 3));
  });

  it('refreshes as you play, so the same four do not sit there forever', () => {
    const seen = new Set<string>();
    for (let played = 0; played < 10; played += 1) {
      for (const o of opponentsFor(world, 70, played)) seen.add(o.club.id);
    }
    // Ten slates of four would be four clubs if the slate never moved.
    expect(seen.size).toBeGreaterThan(6);
  });

  it('pays more the harder the rung', () => {
    const slate = opponentsFor(world, 70, 0);
    for (let i = 1; i < slate.length; i += 1) {
      expect(DIFFICULTY_BONUS[slate[i]!.difficulty]).toBeGreaterThan(
        DIFFICULTY_BONUS[slate[i - 1]!.difficulty],
      );
    }
  });

  it('still fills a slate for a squad at either extreme', () => {
    for (const rating of [1, 40, 99]) {
      expect(opponentsFor(world, rating, 0)).toHaveLength(4);
    }
  });
});

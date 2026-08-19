import { describe, expect, it } from 'vitest';
import { createMatch, step } from '@/sim/match';
import { NO_INTENT } from '@/sim/match';
import { generateWorld, matchSquad } from '@/world/generate';
import { buildLineup, collectionClub, starterSquad } from '@/world/lineup';
import { makeItem } from '@/world/items';
import { rewardFor } from '@/world/rewards';
import type { Player } from '@/world/generate';
import type { PlayerItem } from '@/world/items';

/**
 * The loop the collection exists for: field your items, play, get paid.
 *
 * Exercised without the DOM so it can run a whole match — the point is that
 * the pieces fit together, not that React renders them.
 */

const world = generateWorld('loop-test');
const identity = world.clubs[world.clubOrder[0]!]!;
const byId = new Map(
  world.clubOrder.flatMap((id) => world.clubs[id]!.squad).map((p) => [p.id, p]),
);
const resolve = (item: PlayerItem): Player | null => byId.get(item.playerId) ?? null;

function playToFullTime(home: Player[], away: Player[], seed: string) {
  const state = createMatch(home, away, { halfLength: 4, seed });
  for (let i = 0; i < 60 * 60 * 20; i += 1) {
    step(state, NO_INTENT);
    if (state.phase === 'fulltime') break;
  }
  return state;
}

describe('the collection loop', () => {
  const items = starterSquad(world, 'loop');
  const lineup = buildLineup(items, resolve);
  const club = collectionClub(identity, lineup);

  it('turns a collection into a club that can kick off', () => {
    expect(lineup.complete).toBe(true);
    expect(club.squad.length).toBe(items.length);
    expect(club.name).toBe(identity.name);
    expect(club.overall).toBe(lineup.rating);
  });

  it('gives every player a shirt of their own', () => {
    const numbers = club.squad.map((p) => p.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('fields the eleven in formation order, keeper first', () => {
    expect(club.squad[0]!.position).toBe('GK');
    for (let i = 0; i < lineup.eleven.length; i += 1) {
      expect(club.squad[i]!.last).toBe(lineup.eleven[i]!.player.last);
    }
  });

  it('plays a full match and produces a result', () => {
    const away = matchSquad(world.clubs[world.clubOrder[1]!]!);
    const state = playToFullTime(matchSquad(club), away, 'loop:match');
    expect(state.phase).toBe('fulltime');
    expect(state.score[0]).toBeGreaterThanOrEqual(0);
    expect(state.score[1]).toBeGreaterThanOrEqual(0);
  });

  it('pays out on the result, and the payout buys packs', () => {
    const away = matchSquad(world.clubs[world.clubOrder[1]!]!);
    const state = playToFullTime(matchSquad(club), away, 'loop:pay');

    const reward = rewardFor({
      scored: state.score[0],
      conceded: state.score[1],
      rating: club.overall,
      opponentRating: world.clubs[world.clubOrder[1]!]!.overall,
    });

    expect(reward.total).toBeGreaterThan(0);
    // The parts have to add up, or the breakdown shown at full time lies.
    expect(reward.base + reward.result + reward.goals + reward.cleanSheet + reward.underdog).toBe(
      reward.total,
    );
  });

  it('carries an upgraded item onto the pitch as the upgrade', () => {
    // A hero has to actually be better once the whistle goes, or the edition
    // is decoration on a card.
    // Upgrade someone who is actually in the side: a +4 on a substitute who
    // was already behind a better player changes nothing, and should not.
    const original = lineup.eleven.find((slot) => slot.slot === 'ST')!.item;
    const base = byId.get(original.playerId)!;
    const hero = makeItem(base, original.clubId, { edition: 'hero', suffix: '#h' });
    expect(hero.rating).toBeGreaterThan(original.rating);

    const swapped = items.map((item) => (item.id === original.id ? hero : item));
    const withHero = buildLineup(swapped, resolve);

    const upgraded = collectionClub(identity, withHero).squad.find((p) => p.last === base.last)!;
    expect(upgraded.overall).toBe(hero.rating);
    expect(upgraded.attributes.pace).toBe(hero.attributes.pace);

    // The side is stronger by exactly the upgrade. It does not show in the
    // squad rating, which is a mean of eleven rounded to a whole number — one
    // player gaining four points moves it by less than half a point.
    const total = (l: typeof withHero) => l.eleven.reduce((sum, x) => sum + x.effective, 0);
    expect(total(withHero) - total(lineup)).toBe(hero.rating - original.rating);
  });

  it('leaves the side alone when the upgrade is to someone already benched', () => {
    const benched = lineup.bench[lineup.bench.length - 1]!;
    const better = makeItem(benched.player, benched.item.clubId, {
      edition: 'totw',
      suffix: '#b',
    });
    const swapped = items.map((item) => (item.id === benched.item.id ? better : item));
    const after = buildLineup(swapped, resolve);

    const total = (l: typeof after) => l.eleven.reduce((sum, x) => sum + x.effective, 0);
    expect(total(after)).toBe(total(lineup));
  });

  it('makes a better collection a better side', () => {
    // The whole promise of the mode: the packs have to change the football.
    const strong = world.clubOrder
      .flatMap((id) => world.clubs[id]!.squad.map((p) => ({ p, id })))
      .filter((e) => e.p.overall >= 80)
      .slice(0, 20)
      .map((e, i) => makeItem(e.p, e.id, { suffix: `#s${i}` }));

    const strongLineup = buildLineup(strong, resolve);
    if (!strongLineup.complete) return; // Not enough top players in this world.
    expect(strongLineup.rating).toBeGreaterThan(lineup.rating);
  });
});

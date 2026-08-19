/**
 * Who you play next.
 *
 * A collection with one permanent opponent has no shape: your squad improves
 * and the fixture does not, so the football stops being the thing that
 * changes. A slate scaled to what you have built gives improving a point —
 * beat the ones above you, and the ones above you get harder.
 *
 * The slate is derived rather than stored: from your squad rating and how many
 * matches you have played, so it moves as you do and refreshes as you win.
 */

import { createRng } from './rng';
import type { Club, World } from './generate';

export interface Opponent {
  club: Club;
  /** Where they sit relative to you, in rating points. */
  gap: number;
  difficulty: Difficulty;
}

export type Difficulty = 'comfortable' | 'even' | 'testing' | 'formidable';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  comfortable: 'Comfortable',
  even: 'Even',
  testing: 'Testing',
  formidable: 'Formidable',
};

/**
 * How far above or below you each rung sits.
 *
 * The easiest is genuinely below you — a collection mode wants somewhere to
 * farm a few credits on a bad day — and the hardest is far enough above that
 * beating it needs either a much better squad or a much better match.
 */
const RUNGS: { difficulty: Difficulty; gap: number }[] = [
  { difficulty: 'comfortable', gap: -6 },
  { difficulty: 'even', gap: 0 },
  { difficulty: 'testing', gap: 6 },
  { difficulty: 'formidable', gap: 13 },
];

/** What a rung multiplies the match reward by. */
export const DIFFICULTY_BONUS: Record<Difficulty, number> = {
  comfortable: 0.7,
  even: 1,
  testing: 1.35,
  formidable: 1.9,
};

/**
 * Picks the slate.
 *
 * Each rung takes the club nearest its target rating, choosing between equally
 * close candidates with the seed so the slate varies between players and
 * between refreshes rather than always naming the same four clubs.
 *
 * Two things keep the ladder honest once a squad outgrows the world. The
 * hardest rung picks first, so it gets first claim on the strongest clubs
 * rather than whatever the rung below left behind. And the difficulty labels
 * are assigned last, by the strength actually found — otherwise a squad rated
 * above every club in the game gets a "formidable" fixture weaker than its
 * "testing" one, and is paid 1.9x for the easier match.
 */
export function opponentsFor(
  world: World,
  squadRating: number,
  refresh: number,
  exclude: string = '',
): Opponent[] {
  const rng = createRng(`${world.seed}:slate:${squadRating}:${refresh}`);
  const taken = new Set<string>([exclude]);
  const found: Club[] = [];

  for (const rung of [...RUNGS].reverse()) {
    const target = squadRating + rung.gap;

    let best: { club: Club; distance: number } | null = null;
    for (const id of world.clubOrder) {
      if (taken.has(id)) continue;
      const club = world.clubs[id]!;
      // A jittered distance, so "nearest" is not always the same club.
      const distance = Math.abs(club.overall - target) + rng.next() * 1.5;
      if (best === null || distance < best.distance) best = { club, distance };
    }

    if (!best) continue;
    taken.add(best.club.id);
    found.push(best.club);
  }

  found.sort((a, b) => a.overall - b.overall);

  return found.map((club, index) => ({
    club,
    gap: club.overall - squadRating,
    difficulty: RUNGS[index]!.difficulty,
  }));
}

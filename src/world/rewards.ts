/**
 * What a match pays.
 *
 * The point of paying at all is that packs should be earned by playing rather
 * than handed over: if credits only ever arrive from discarding, the game is a
 * shop with a football match attached. So the numbers are set against the pack
 * prices — a run of wins buys a Premium Gold, and the Ultimate Pack stays a
 * long way off.
 */

export interface MatchOutcome {
  scored: number;
  conceded: number;
  /** Your side's rating, and theirs. */
  rating: number;
  opponentRating: number;
  /** What the chosen rung multiplies the payout by. Defaults to 1. */
  bonus?: number;
}

export interface Reward {
  /** Appearance money: you get something for playing, win or lose. */
  base: number;
  result: number;
  goals: number;
  cleanSheet: number;
  /** Paid for beating a better side; never negative. */
  underdog: number;
  /** Extra from the rung you chose, over and above the parts above. */
  difficulty: number;
  total: number;
}

const APPEARANCE = 250;
const WIN = 1_000;
const DRAW = 400;
const PER_GOAL = 60;
const CLEAN_SHEET = 250;

/** Every rating point of the gap you overcame, capped so a mismatch is not a mine. */
const PER_RATING_POINT = 45;
const MAX_UNDERDOG_GAP = 20;

export function rewardFor(outcome: MatchOutcome): Reward {
  const won = outcome.scored > outcome.conceded;
  const drew = outcome.scored === outcome.conceded;

  const result = won ? WIN : drew ? DRAW : 0;
  const goals = outcome.scored * PER_GOAL;
  const cleanSheet = outcome.conceded === 0 ? CLEAN_SHEET : 0;

  // Only paid on a result: losing to a better side is not an achievement, and
  // paying for it would make deliberately fielding a bad squad worthwhile.
  const gap = Math.min(MAX_UNDERDOG_GAP, Math.max(0, outcome.opponentRating - outcome.rating));
  const underdog = won || drew ? Math.round(gap * PER_RATING_POINT * (won ? 1 : 0.5)) : 0;

  const parts = APPEARANCE + result + goals + cleanSheet + underdog;

  // Applied to the whole payout rather than to the win alone, so choosing a
  // harder rung is worth something even in a defeat — otherwise the only sane
  // play is the easiest fixture until your squad is overwhelming.
  const bonus = Math.max(0, outcome.bonus ?? 1);
  const difficulty = Math.round(parts * bonus) - parts;

  return {
    base: APPEARANCE,
    result,
    goals,
    cleanSheet,
    underdog,
    difficulty,
    total: parts + difficulty,
  };
}

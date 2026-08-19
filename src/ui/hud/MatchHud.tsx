import { useEffect, useRef, useState } from 'react';
import { Crest } from '@/ui/primitives/Crest';
import { Hint } from '@/ui/primitives/Glyph';
import type { Club } from '@/world/generate';
import type { Reward } from '@/world/rewards';
import { clockText, possessionPercent, type MatchState, type SimPlayer } from '@/sim/match';
import { MENTALITIES, MENTALITY_LABEL } from '@/sim/ai';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/render/pitch';
import './hud.css';

/**
 * The match HUD — PROMPT.md §4.1.
 *
 * Rendered as DOM over the WebGL canvas rather than in the scene, because the
 * typography, the chevron clip-paths and the blur are all things the browser
 * does better than a texture atlas would.
 */

export interface HudProps {
  state: MatchState;
  home: Club;
  away: Club;
  competition: string;
  showScoreClock: boolean;
  showDropdown: boolean;
  showRadar: boolean;
  showNameBars: boolean;
  indicatorFade: boolean;
  onFinish: () => void;
  /** What the match paid, when it was played with the collection. */
  reward?: Reward;
}

export function MatchHud({
  state,
  home,
  away,
  competition,
  showScoreClock,
  showDropdown,
  showRadar,
  showNameBars,
  indicatorFade,
  onFinish,
  reward,
}: HudProps) {
  const controlled = state.players[state.controlledIndex];
  const opponent = nearestOpponent(state);

  // Flash the scoreline when it changes.
  const [justScored, setJustScored] = useState(false);
  const previousScore = useRef(`${state.score[0]}-${state.score[1]}`);
  useEffect(() => {
    const current = `${state.score[0]}-${state.score[1]}`;
    if (current === previousScore.current) return;
    previousScore.current = current;
    setJustScored(true);
    const timer = window.setTimeout(() => setJustScored(false), 420);
    return () => window.clearTimeout(timer);
  }, [state.score]);

  const teamStyle = {
    ['--home-primary' as string]: home.colours.primary,
    ['--home-ink' as string]: home.colours.ink,
    ['--away-primary' as string]: away.colours.primary,
    ['--away-ink' as string]: away.colours.ink,
  };

  return (
    <div className="hud" style={teamStyle}>
      {showScoreClock && (
        <div className="bug">
          <div className="bug__strip">
            <div className="bug__seg bug__seg--home">
              <span className="bug__code">{home.code}</span>
            </div>
            <div className="bug__seg bug__seg--score">
              <span className="bug__score">
                <span className="bug__num" data-just-scored={justScored}>
                  {state.score[0]}
                </span>
                <span className="bug__crest">
                  <Crest club={home} size={18} />
                </span>
                <span className="bug__num" data-just-scored={justScored}>
                  {state.score[1]}
                </span>
              </span>
            </div>
            <div className="bug__seg bug__seg--away">
              <span className="bug__code">{away.code}</span>
            </div>
          </div>
          <div className="bug__clock">{clockText(state)}</div>
          {showDropdown && <div className="bug__drop">{shortCompetition(competition)}</div>}
        </div>
      )}

      <Tactics state={state} />

      <div className="hud__comp">
        <Crest club={home} size={34} />
        <span className="hud__compname">{competition}</span>
      </div>

      {showNameBars && controlled && (
        <PlayerBar side="left" club={home} player={controlled} indicatorFade={indicatorFade} />
      )}
      {showNameBars && opponent && (
        <PlayerBar side="right" club={away} player={opponent} indicatorFade={indicatorFade} />
      )}

      {showRadar && <Radar state={state} home={home} away={away} />}

      {state.decision && state.clock < state.decision.until && (
        <Decision
          key={`${state.decision.text}-${state.decision.until}`}
          text={state.decision.text}
          detail={state.decision.detail}
        />
      )}

      {state.phase === 'goal' && state.lastGoal && (
        <GoalOverlay
          colour={(state.lastGoal.team === 0 ? home : away).colours.primary}
          scorer={state.lastGoal.scorer}
          minute={state.lastGoal.minute}
        />
      )}

      {(state.phase === 'halftime' || state.phase === 'fulltime') && (
        <BreakOverlay
          reward={reward}
          state={state}
          home={home}
          away={away}
          title={state.phase === 'halftime' ? 'Half Time' : 'Full Time'}
          onFinish={onFinish}
        />
      )}
    </div>
  );
}

function PlayerBar({
  side,
  club,
  player,
  indicatorFade,
}: {
  side: 'left' | 'right';
  club: Club;
  player: SimPlayer;
  indicatorFade: boolean;
}) {
  const stamina = indicatorFade ? player.stamina : 100;
  return (
    <div className={`pbar pbar--${side}`}>
      <span className="pbar__crest">
        <Crest club={club} size={30} />
      </span>
      <span className="pbar__body">
        <span className="pbar__name">
          <span className="pbar__stamina" style={{ width: `${stamina}%` }} />
          <span className="pbar__number">{player.number}</span>
          <span className="pbar__surname">{player.last}</span>
        </span>
        <span className="pbar__pill">
          <span className="pbar__runner" />
          <span className="pbar__pips">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="pbar__pip" data-on={n <= player.skillMoves} />
            ))}
          </span>
          <span className="pbar__divider" />
          <span className="pbar__boot" data-weak={player.weakFoot < 4} />
          <span className="pbar__boot" />
        </span>
      </span>
    </div>
  );
}

function Radar({ state, home, away }: { state: MatchState; home: Club; away: Club }) {
  return (
    <div className="radar" aria-hidden="true">
      <span className="radar__tick radar__tick--tl" />
      <span className="radar__tick radar__tick--tr" />
      <span className="radar__tick radar__tick--bl" />
      <span className="radar__tick radar__tick--br" />

      {state.players.map((p, i) => {
        const x = ((p.x + PITCH_LENGTH / 2) / PITCH_LENGTH) * 100;
        const y = ((p.z + PITCH_WIDTH / 2) / PITCH_WIDTH) * 100;
        const isHome = p.team === 0;
        return (
          <span
            key={i}
            className={`radar__mark${isHome ? '' : ' radar__mark--tri'}`}
            style={
              isHome
                ? { left: `${x}%`, top: `${y}%`, background: home.colours.primary }
                : { left: `${x}%`, top: `${y}%`, borderTopColor: away.colours.primary }
            }
          />
        );
      })}

      <span
        className="radar__ball"
        style={{
          left: `${((state.ball.x + PITCH_LENGTH / 2) / PITCH_LENGTH) * 100}%`,
          top: `${((state.ball.z + PITCH_WIDTH / 2) / PITCH_WIDTH) * 100}%`,
        }}
      />
    </div>
  );
}

/** The side's shape, as a four-rung ladder. */
function Tactics({ state }: { state: MatchState }) {
  const level = MENTALITIES.indexOf(state.mentality[0]);
  return (
    <div className="tactics">
      <span className="tactics__ladder" aria-hidden="true">
        {MENTALITIES.map((m, i) => (
          <span
            key={m}
            className="tactics__rung"
            data-on={i <= level}
            style={{ height: `${40 + i * 20}%` }}
          />
        ))}
      </span>
      <span className="tactics__label">{MENTALITY_LABEL[state.mentality[0]]}</span>
    </div>
  );
}

/** The referee's last decision: corner, free kick, offside, a card. */
function Decision({ text, detail }: { text: string; detail: string }) {
  const card = text === 'Yellow card' ? 'yellow' : text === 'Red card' ? 'red' : 'none';
  return (
    <div className="decision">
      <span className="decision__mark" data-card={card}>
        {card === 'none' ? <RefWhistle /> : <span className="decision__glyph" />}
      </span>
      <span className="decision__body">
        <span className="decision__text">{text}</span>
        {detail && <span className="decision__detail">{detail}</span>}
      </span>
    </div>
  );
}

function RefWhistle() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9h9l6-3v12l-6-3H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoalOverlay({
  colour,
  scorer,
  minute,
}: {
  colour: string;
  scorer: string;
  minute: number;
}) {
  return (
    <div className="overlay" style={{ ['--goal-colour' as string]: colour }}>
      <span className="goalwipe" />
      <div className="goalcard">
        <span className="goalcard__word">Goal</span>
        <span className="goalcard__scorer">{scorer}</span>
        <span className="goalcard__minute">{minute}&rsquo;</span>
      </div>
    </div>
  );
}

function BreakOverlay({
  state,
  home,
  away,
  title,
  onFinish,
  reward,
}: {
  state: MatchState;
  home: Club;
  away: Club;
  title: string;
  onFinish: () => void;
  reward?: Reward | undefined;
}) {
  const [homePossession, awayPossession] = possessionPercent(state);
  const shotTotal = Math.max(1, state.shots[0] + state.shots[1]);

  return (
    <div className="overlay">
      <div className="breakcard">
        <h2 className="breakcard__title">{title}</h2>

        <div className="breakcard__score">
          <span className="breakcard__club">
            <Crest club={home} size={30} />
            {home.name}
          </span>
          <span className="breakcard__goals">{state.score[0]}</span>
          <span className="breakcard__goals">{state.score[1]}</span>
          <span className="breakcard__club breakcard__club--away">
            <Crest club={away} size={30} />
            {away.name}
          </span>
        </div>

        <div className="breakcard__stats">
          <StatLine
            label="Possession"
            left={`${homePossession}%`}
            right={`${awayPossession}%`}
            fill={homePossession}
          />
          <StatLine
            label="Shots"
            left={String(state.shots[0])}
            right={String(state.shots[1])}
            fill={(state.shots[0] / shotTotal) * 100}
          />
          <StatLine
            label="Corners"
            left={String(state.corners[0])}
            right={String(state.corners[1])}
            fill={share(state.corners)}
          />
          <StatLine
            label="Fouls"
            left={String(state.fouls[0])}
            right={String(state.fouls[1])}
            fill={share(state.fouls)}
          />
          <StatLine
            label="Saves"
            left={String(state.saves[0])}
            right={String(state.saves[1])}
            fill={share(state.saves)}
          />
        </div>

        {state.phase === 'fulltime' && reward && (
          <div className="payout">
            <h3 className="payout__head">Credits earned</h3>
            <ul className="payout__lines">
              <PayLine label="Appearance" value={reward.base} />
              {reward.result > 0 && <PayLine label="Result" value={reward.result} />}
              {reward.goals > 0 && <PayLine label="Goals" value={reward.goals} />}
              {reward.cleanSheet > 0 && <PayLine label="Clean sheet" value={reward.cleanSheet} />}
              {reward.underdog > 0 && <PayLine label="Beat a better side" value={reward.underdog} />}
              {reward.difficulty !== 0 && (
                <PayLine label="Fixture" value={reward.difficulty} />
              )}
            </ul>
            <p className="payout__total">
              <span>Total</span>
              <b>{reward.total.toLocaleString('en-GB')}</b>
            </p>
          </div>
        )}

        {state.phase === 'fulltime' && (
          <div className="breakcard__hint">
            <button type="button" onClick={onFinish} className="fc-hint">
              <Hint action="back" label="Back to hub" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PayLine({ label, value }: { label: string; value: number }) {
  return (
    <li className="payout__line">
      <span>{label}</span>
      <b>{value.toLocaleString('en-GB')}</b>
    </li>
  );
}

/** Home share of a two-team counter, for the split bar. */
function share([home, away]: [number, number]): number {
  const total = home + away;
  return total === 0 ? 50 : (home / total) * 100;
}

function StatLine({
  label,
  left,
  right,
  fill,
}: {
  label: string;
  left: string;
  right: string;
  fill: number;
}) {
  return (
    <div className="statline">
      <span>{left}</span>
      <span className="statline__label">{label}</span>
      <span className="statline__right">{right}</span>
      <span className="statline__bar">
        <span className="statline__fill" style={{ width: `${fill}%` }} />
      </span>
    </div>
  );
}

/** The chip under the clock is narrow; a full league name will not fit. */
function shortCompetition(name: string): string {
  const words = name.split(/\s+/);
  if (words.length <= 2) return name;
  return words
    .filter((w) => w.length > 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** The away player nearest the ball — who the right-hand bar tracks. */
function nearestOpponent(state: MatchState): SimPlayer | undefined {
  let best: SimPlayer | undefined;
  let bestDistance = Infinity;
  for (const p of state.players) {
    if (p.team !== 1) continue;
    const d = Math.hypot(p.x - state.ball.x, p.z - state.ball.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = p;
    }
  }
  return best;
}

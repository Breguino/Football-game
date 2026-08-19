import { Crest } from '@/ui/primitives/Crest';
import { DIFFICULTY_BONUS, DIFFICULTY_LABEL, type Opponent } from '@/world/opponents';
import type { MatchRecord } from '@/state/collection';

/**
 * The fixtures on offer, and what you have done so far.
 *
 * Four rungs from below your level to well above it. Choosing a harder one
 * pays more whatever the result, so the easiest fixture is a floor rather than
 * the obvious play.
 */

export function PlaySlate({
  opponents,
  record,
  squadRating,
  focused,
  onFocus,
  onSelect,
  canPlay,
}: {
  opponents: Opponent[];
  record: MatchRecord;
  squadRating: number;
  focused: number;
  onFocus: (index: number) => void;
  onSelect: (opponent: Opponent) => void;
  canPlay: boolean;
}) {
  return (
    <>
      <section className="slate">
        {opponents.map((opponent, index) => (
          <button
            key={opponent.club.id}
            type="button"
            className="fixture"
            data-focused={index === focused}
            data-difficulty={opponent.difficulty}
            disabled={!canPlay}
            onMouseEnter={() => onFocus(index)}
            onClick={() => {
              onFocus(index);
              if (canPlay) onSelect(opponent);
            }}
          >
            {index === focused && <span className="fixture__leak" aria-hidden="true" />}

            <span className="fixture__difficulty">{DIFFICULTY_LABEL[opponent.difficulty]}</span>

            <span className="fixture__club">
              <Crest club={opponent.club} size={44} />
              <span className="fixture__names">
                <span className="fixture__name">{opponent.club.name}</span>
                <span className="fixture__venue">{opponent.club.stadium.name}</span>
              </span>
            </span>

            <span className="fixture__numbers">
              <span className="fixture__rating">{opponent.club.overall}</span>
              <span className="fixture__gap" data-sign={opponent.gap >= 0 ? 'above' : 'below'}>
                {opponent.gap >= 0 ? `+${opponent.gap}` : opponent.gap} on you
              </span>
            </span>

            <span className="fixture__reward">
              ×{DIFFICULTY_BONUS[opponent.difficulty].toFixed(2).replace(/0$/, '')}
            </span>
          </button>
        ))}
      </section>

      <aside className="club__aside">
        <div className="club__ratingblock">
          <span className="club__ratingnum">{squadRating || '—'}</span>
          <span className="club__coinlabel">Your squad</span>
        </div>

        <dl className="club__facts">
          <div>
            <dt>Played</dt>
            <dd>{record.played}</dd>
          </div>
          <div>
            <dt>Won · Drawn · Lost</dt>
            <dd>
              {record.won} · {record.drawn} · {record.lost}
            </dd>
          </div>
          <div>
            <dt>Goals</dt>
            <dd>
              {record.goalsFor} : {record.goalsAgainst}
            </dd>
          </div>
        </dl>

        <p className="club__note">
          {canPlay
            ? 'A harder fixture pays more however it goes, so the easiest one is a floor rather than the obvious play.'
            : 'You need a full eleven before you can play. Open a pack.'}
        </p>
      </aside>
    </>
  );
}

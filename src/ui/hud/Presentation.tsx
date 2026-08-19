import { Crest } from '@/ui/primitives/Crest';
import { Glyph } from '@/ui/primitives/Glyph';
import type { Club, Player } from '@/world/generate';
import { NATIONS } from '@/world/names';
import './presentation.css';

/**
 * The beats before kickoff — PROMPT.md §4.4.
 *
 * These are not loading screens with decoration on them. The walkout and the
 * team sheet are the two moments a broadcast uses to tell you who is playing
 * and why it matters, and skipping them is what makes a match feel like it
 * started in the middle.
 */

export type PresentationBeat = 'walkout' | 'teamsheet' | 'none';

export function Walkout({
  home,
  away,
  competition,
  venue,
  onSkip,
}: {
  home: Club;
  away: Club;
  competition: string;
  venue: string;
  onSkip: () => void;
}) {
  return (
    <div className="pres pres--walkout">
      <div className="pres__scrim" />
      <div className="pres__body">
        <p className="pres__eyebrow">{competition}</p>

        <div className="walkout__fixture">
          <div className="walkout__side">
            <Crest club={home} size={96} />
            <span className="walkout__club">{home.name}</span>
          </div>

          <span className="walkout__versus">v</span>

          <div className="walkout__side walkout__side--away">
            <Crest club={away} size={96} />
            <span className="walkout__club">{away.name}</span>
          </div>
        </div>

        <p className="pres__venue">{venue}</p>
      </div>

      <button type="button" className="pres__skip" onClick={onSkip}>
        <Glyph action="confirm" />
        <span>Skip</span>
      </button>
    </div>
  );
}

export function TeamSheet({
  home,
  away,
  homeEleven,
  awayEleven,
  onSkip,
}: {
  home: Club;
  away: Club;
  homeEleven: Player[];
  awayEleven: Player[];
  onSkip: () => void;
}) {
  return (
    <div className="pres pres--teamsheet">
      <div className="pres__aurora" />
      <div className="pres__body pres__body--wide">
        <p className="pres__eyebrow">Team sheet</p>

        <div className="sheet">
          <SheetColumn club={home} eleven={homeEleven} align="left" />
          <div className="sheet__spine" aria-hidden="true" />
          <SheetColumn club={away} eleven={awayEleven} align="right" />
        </div>
      </div>

      <button type="button" className="pres__skip" onClick={onSkip}>
        <Glyph action="confirm" />
        <span>Kick off</span>
      </button>
    </div>
  );
}

function SheetColumn({
  club,
  eleven,
  align,
}: {
  club: Club;
  eleven: Player[];
  align: 'left' | 'right';
}) {
  return (
    <div className="sheet__col" data-align={align}>
      <div className="sheet__head">
        <Crest club={club} size={44} />
        <div className="sheet__title">
          <span className="sheet__club">{club.name}</span>
          <span className="sheet__formation">4-3-3 · {club.overall} overall</span>
        </div>
      </div>

      <ol className="sheet__list">
        {eleven.map((player) => (
          <li key={player.id} className="sheet__row">
            {/* The away side mirrors by reversing the cells, not by flipping
                text direction — `direction: rtl` reorders the glyphs inside
                each name and puts the ellipsis on the wrong end. */}
            {align === 'left' ? (
              <>
                <span className="sheet__number">{player.number}</span>
                <span className="sheet__name">{player.last}</span>
                <span className="sheet__nation">{nationCode(player.nation)}</span>
                <span className="sheet__rating">{player.overall}</span>
              </>
            ) : (
              <>
                <span className="sheet__rating sheet__rating--lead">{player.overall}</span>
                <span className="sheet__nation">{nationCode(player.nation)}</span>
                <span className="sheet__name">{player.last}</span>
                <span className="sheet__number">{player.number}</span>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function nationCode(id: string): string {
  return NATIONS.find((n) => n.id === id)?.code ?? '—';
}

/** Letterbox bars and the corner chip that mark footage as a replay. */
export function ReplayChrome({ label = 'Replay' }: { label?: string }) {
  return (
    <div className="replay">
      <span className="replay__bar replay__bar--top" />
      <span className="replay__bar replay__bar--bottom" />
      <span className="replay__chip">
        <span className="replay__dot" />
        {label}
      </span>
    </div>
  );
}

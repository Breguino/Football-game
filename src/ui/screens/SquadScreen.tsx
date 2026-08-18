import { useCallback, useMemo, useState } from 'react';
import { Hint } from '@/ui/primitives/Glyph';
import { Crest } from '@/ui/primitives/Crest';
import { FocusRow } from '@/ui/primitives/FocusRow';
import { useNavigation } from '@/input/InputProvider';
import { useWorld } from '@/state/world';
import { startingEleven, type Player } from '@/world/generate';
import { NATIONS } from '@/world/names';
import type { NavAction } from '@/input/actions';
import './squad.css';

const ATTRIBUTES = [
  ['PAC', 'pace'],
  ['SHO', 'shooting'],
  ['PAS', 'passing'],
  ['DRI', 'dribbling'],
  ['DEF', 'defending'],
  ['PHY', 'physical'],
] as const;

export function SquadScreen({ onExit }: { onExit: () => void }) {
  const world = useWorld((s) => s.world);
  const userClubId = useWorld((s) => s.userClubId);
  const club = world.clubs[userClubId]!;

  const eleven = useMemo(() => startingEleven(club), [club]);
  const bench = useMemo(
    () => club.squad.filter((p) => !eleven.some((e) => e.id === p.id)),
    [club, eleven],
  );
  const roster = useMemo(() => [...eleven, ...bench], [eleven, bench]);

  const [cursor, setCursor] = useState(0);
  const player = roster[cursor]!;

  const onAction = useCallback(
    (action: NavAction) => {
      if (action === 'up') setCursor((c) => Math.max(0, c - 1));
      else if (action === 'down') setCursor((c) => Math.min(roster.length - 1, c + 1));
      else if (action === 'back') onExit();
    },
    [roster.length, onExit],
  );

  useNavigation(onAction);

  return (
    <div className="squad">
      <header className="squad__top">
        <Crest club={club} size={54} />
        <div className="squad__identity">
          <h1 className="squad__name">{club.name}</h1>
          <p className="squad__meta">
            {club.stadium.name} · {club.stadium.capacity.toLocaleString('en-GB')} capacity ·
            founded {club.crest.founded}
          </p>
        </div>
        <div className="squad__rating">
          <span className="squad__ratingnum">{club.overall}</span>
          <span className="squad__ratinglabel">Overall</span>
        </div>
      </header>

      <div className="squad__body">
        <div className="squad__list">
          <h2 className="fc-section-head">Starting Eleven</h2>
          {roster.map((p, i) => (
            <div key={p.id}>
              {i === eleven.length && <h2 className="fc-section-head squad__benchhead">Substitutes</h2>}
              <FocusRow
                label={`${p.number}   ${p.last}`}
                focused={i === cursor}
                onFocus={() => setCursor(i)}
              >
                <span className="squad__rowmeta">
                  <span className="squad__pos" data-line={lineOf(p)}>
                    {p.position}
                  </span>
                  <span className="squad__ovr">{p.overall}</span>
                </span>
              </FocusRow>
            </div>
          ))}
        </div>

        <aside className="squad__detail" key={player.id}>
          <div className="squad__card">
            <div className="squad__cardhead">
              <span className="squad__cardovr">{player.overall}</span>
              <span className="squad__cardpos">{player.position}</span>
              <span className="squad__cardnat">{nationCode(player.nation)}</span>
            </div>

            <div className="squad__cardname">
              <span className="squad__cardfirst">{player.first}</span>
              <span className="squad__cardlast">{player.last}</span>
            </div>

            <dl className="squad__stats">
              {ATTRIBUTES.map(([label, key]) => (
                <div className="squad__stat" key={key}>
                  <dt>{label}</dt>
                  <dd>{player.attributes[key]}</dd>
                </div>
              ))}
            </dl>

            <div className="squad__traits">
              <Trait label="Age" value={String(player.age)} />
              <Trait label="Potential" value={String(player.potential)} />
              <Trait label="Skill" value={'★'.repeat(player.skillMoves).padEnd(5, '·')} />
              <Trait label="Weak foot" value={'★'.repeat(player.weakFoot).padEnd(5, '·')} />
              <Trait label="Foot" value={player.preferredFoot === 'R' ? 'Right' : 'Left'} />
            </div>
          </div>
        </aside>
      </div>

      <footer className="squad__actions">
        <Hint action="back" label="Back" />
        <Hint action="confirm" label="Swap" />
      </footer>
    </div>
  );
}

function Trait({ label, value }: { label: string; value: string }) {
  return (
    <div className="squad__trait">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function nationCode(id: string): string {
  return NATIONS.find((n) => n.id === id)?.code ?? '—';
}

/** Groups a position into a line, so the list colour-codes by role. */
function lineOf(player: Player): 'gk' | 'def' | 'mid' | 'att' {
  switch (player.position) {
    case 'GK':
      return 'gk';
    case 'CB':
    case 'LB':
    case 'RB':
      return 'def';
    case 'CDM':
    case 'CM':
    case 'CAM':
      return 'mid';
    default:
      return 'att';
  }
}

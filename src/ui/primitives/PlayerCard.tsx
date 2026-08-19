import { useRef, useState, type PointerEvent } from 'react';
import { Crest } from './Crest';
import { NATIONS } from '@/world/names';
import { EDITION_LABEL, type PlayerItem } from '@/world/items';
import type { Club, Player } from '@/world/generate';
import './card.css';

/**
 * The collectible item — PROMPT.md §4.5.
 *
 * There are no player photographs in a generated world, so the portrait is
 * the shirt: kit colours, squad number, crest. That reads as a deliberate
 * graphic rather than a missing photo, which a silhouette placeholder would
 * not.
 */

/** The six stats a card prints, in the two columns FC reads them in. */
const STATS = [
  ['PAC', 'pace'],
  ['DRI', 'dribbling'],
  ['SHO', 'shooting'],
  ['DEF', 'defending'],
  ['PAS', 'passing'],
  ['PHY', 'physical'],
] as const;

export interface PlayerCardProps {
  item: PlayerItem;
  player: Player;
  club: Club;
  focused?: boolean;
  /** Card width in px at scale 1. */
  width?: number;
  onSelect?: () => void;
  onFocus?: () => void;
}

export function PlayerCard({
  item,
  player,
  club,
  focused = false,
  width = 260,
  onSelect,
  onFocus,
}: PlayerCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function handleMove(event: PointerEvent<HTMLButtonElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    // 6–8° toward the pointer, per the spec.
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 14, y: px * 14 });
  }

  const style = {
    ['--card-w' as string]: `${width}px`,
    ['--tilt-x' as string]: `${tilt.x.toFixed(2)}deg`,
    ['--tilt-y' as string]: `${tilt.y.toFixed(2)}deg`,
    ['--name-len' as string]: player.last.length,
  };

  const special = item.edition !== 'standard';

  return (
    <button
      ref={ref}
      type="button"
      className="card"
      style={style}
      data-tier={item.tier}
      data-edition={item.edition}
      data-rare={item.rare}
      data-focused={focused}
      aria-label={`${player.last}, rated ${item.rating}`}
      onPointerMove={handleMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      onMouseEnter={onFocus}
      onClick={() => {
        onFocus?.();
        onSelect?.();
      }}
    >
      <span className="card__body">
        <span className="card__rays" aria-hidden="true" />
        <ShirtFigure club={club} number={player.number} />

        <span className="card__meta">
          <span className="card__rating">{item.rating}</span>
          <span className="card__position">{player.position}</span>
          <span className="card__glyphs">
            <span className="card__nation">{nationCode(player.nation)}</span>
            <span className="card__crest">
              <Crest club={club} size={width * 0.125} />
            </span>
          </span>
        </span>

        <span className="card__lower">
          <span className="card__name">{player.last}</span>

          <span className="card__stats">
            {STATS.map(([label, key]) => (
              <span className="card__stat" key={key}>
                <b>{item.attributes[key]}</b>
                <span>{label}</span>
              </span>
            ))}
          </span>
        </span>

        {special && <span className="card__trim" aria-hidden="true" />}
        {special && <span className="card__edition">{EDITION_LABEL[item.edition]}</span>}

        <span className="card__shine" aria-hidden="true" />
      </span>
    </button>
  );
}

/**
 * The shirt. Kit colours from the club, number on the back, crest at the
 * chest — an original graphic standing where a licensed photograph would be.
 */
function ShirtFigure({ club, number }: { club: Club; number: number }) {
  const { primary, secondary, ink } = club.colours;
  return (
    <svg className="card__figure" viewBox="0 0 100 116" role="img" aria-hidden="true">
      <defs>
        <clipPath id={`shirt-${club.id}`}>
          <path d="M50 8 L74 16 L92 26 L84 46 L74 41 V108 H26 V41 L16 46 L8 26 L26 16 Z" />
        </clipPath>
      </defs>

      {/* Head and shoulders behind the shirt. */}
      <circle cx="50" cy="12" r="12" fill={ink} opacity="0.28" />

      <g clipPath={`url(#shirt-${club.id})`}>
        <rect x="0" y="0" width="100" height="116" fill={primary} />
        {/* A single broad sash, so the two kit colours both read at card size. */}
        <path d="M8 0 L44 0 L96 116 L58 116 Z" fill={secondary} opacity="0.85" />
      </g>

      <path
        d="M50 8 L74 16 L92 26 L84 46 L74 41 V108 H26 V41 L16 46 L8 26 L26 16 Z"
        fill="none"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinejoin="round"
        opacity="0.55"
      />

      <text
        x="50"
        y="86"
        textAnchor="middle"
        fill={ink}
        fontFamily="var(--font-data)"
        fontWeight="800"
        fontSize="40"
        opacity="0.9"
      >
        {number}
      </text>
    </svg>
  );
}

function nationCode(id: string): string {
  return NATIONS.find((n) => n.id === id)?.code ?? '—';
}

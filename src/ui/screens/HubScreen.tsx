import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Glyph, Hint } from '@/ui/primitives/Glyph';
import { Crest } from '@/ui/primitives/Crest';
import { TileArt } from '@/ui/primitives/TileArt';
import { useNavigation } from '@/input/InputProvider';
import { useWorld } from '@/state/world';
import { useCollection } from '@/state/collection';
import type { NavAction } from '@/input/actions';
import type { Screen } from '@/App';
import './hub.css';

interface Tile {
  id: string;
  name: string;
  note: string;
  badge?: { text: string; tone?: 'live' | 'soon' };
  goes?: Screen;
  wide?: boolean;
}

interface Rail {
  id: string;
  title: string;
  note?: string;
  tiles: Tile[];
}

const TABS = ['For You', 'Online', 'vs. CPU', 'vs. Friend'] as const;

function railsFor(
  tab: number,
  clubName: string,
  opponentName: string,
  itemCount: number,
): Rail[] {
  if (tab === 1) {
    return [
      {
        id: 'online',
        title: 'Online',
        tiles: [
          { id: 'rivals', name: 'Rivals', note: 'Division 4 · 3 wins to promotion', badge: { text: 'Live', tone: 'live' } },
          { id: 'champs', name: 'Champions', note: 'Qualifiers open Friday', badge: { text: 'Soon', tone: 'soon' } },
          { id: 'rush', name: 'Rush', note: '5-a-side, 4 players, one net' },
          { id: 'draft', name: 'Online Draft', note: 'Build from five picks a slot' },
        ],
      },
    ];
  }
  if (tab === 2) {
    return [
      {
        id: 'cpu',
        title: 'Play vs. CPU',
        tiles: [
          { id: 'squad-battles', name: 'Squad Battles', note: 'Four opponents refresh at midnight' },
          { id: 'moments', name: 'Moments', note: 'Short scenarios, one objective each' },
          { id: 'kickoff-cpu', name: 'Kick Off', note: `${clubName} vs ${opponentName}`, goes: 'match' },
        ],
      },
    ];
  }
  if (tab === 3) {
    return [
      {
        id: 'friend',
        title: 'Play vs. Friend',
        tiles: [
          { id: 'couch', name: 'Couch Play', note: 'Two controllers, one screen', goes: 'match' },
          { id: 'invite', name: 'Play a Friend', note: 'Invite from your list' },
        ],
      },
    ];
  }
  return [
    {
      id: 'new',
      title: 'New',
      note: 'Fresh this week',
      tiles: [
        { id: 'kickoff', name: 'Kick Off', note: `${clubName} vs ${opponentName}`, badge: { text: 'Ready' }, goes: 'match', wide: true },
        { id: 'squad', name: 'Squad', note: 'Shape, roles and the starting eleven', goes: 'squad' },
        {
          id: 'club',
          name: 'Club',
          note: itemCount > 0 ? `${itemCount} items collected` : 'Open your first pack',
          // The badge is an invitation, so it goes away once you have taken it.
          ...(itemCount === 0 ? { badge: { text: 'New' } } : {}),
          goes: 'club',
        },
        { id: 'season', name: 'Season', note: 'Matchday 1 of 34' },
      ],
    },
    {
      id: 'continue',
      title: 'Continue Playing',
      tiles: [
        { id: 'career', name: 'Career', note: `Manager · ${clubName}` },
        { id: 'settings', name: 'Settings', note: 'Camera, visual, controls', goes: 'settings' },
        { id: 'tournament', name: 'Cup Run', note: 'Second round · away' },
      ],
    },
    {
      id: 'upcoming',
      title: 'Upcoming',
      note: 'Starts within the week',
      tiles: [
        { id: 'derby', name: 'Derby Week', note: 'Doubled rewards on local fixtures', badge: { text: 'Soon', tone: 'soon' } },
        { id: 'winter', name: 'Winter Series', note: 'Opens Thursday 18:00' },
      ],
    },
  ];
}

export function HubScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const world = useWorld((s) => s.world);
  const userClubId = useWorld((s) => s.userClubId);
  const opponentClubId = useWorld((s) => s.opponentClubId);

  const club = world.clubs[userClubId]!;
  const opponent = world.clubs[opponentClubId]!;
  const league = world.leagues.find((l) => l.id === club.leagueId);

  const coins = useCollection((s) => s.coins);
  const itemCount = useCollection((s) => s.items.length);

  const [tab, setTab] = useState(0);
  const [railIndex, setRailIndex] = useState(0);
  const [tileIndex, setTileIndex] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const rails = useMemo(
    () => railsFor(tab, club.name, opponent.name, itemCount),
    [tab, club.name, opponent.name, itemCount],
  );

  const rail = rails[railIndex];
  const tile = rail?.tiles[tileIndex];

  useEffect(() => {
    setRailIndex(0);
    setTileIndex(0);
  }, [tab]);

  // Keep the focused rail in view as the cursor moves down the page.
  useEffect(() => {
    const node = bodyRef.current?.querySelector<HTMLElement>(`[data-rail-index="${railIndex}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [railIndex]);

  const onAction = useCallback(
    (action: NavAction) => {
      switch (action) {
        case 'up':
          setRailIndex((r) => {
            const next = Math.max(0, r - 1);
            setTileIndex((t) => Math.min(t, (rails[next]?.tiles.length ?? 1) - 1));
            return next;
          });
          break;
        case 'down':
          setRailIndex((r) => {
            const next = Math.min(rails.length - 1, r + 1);
            setTileIndex((t) => Math.min(t, (rails[next]?.tiles.length ?? 1) - 1));
            return next;
          });
          break;
        case 'left':
          setTileIndex((t) => Math.max(0, t - 1));
          break;
        case 'right':
          setTileIndex((t) => Math.min((rail?.tiles.length ?? 1) - 1, t + 1));
          break;
        case 'tabPrev':
          setTab((t) => Math.max(0, t - 1));
          break;
        case 'tabNext':
          setTab((t) => Math.min(TABS.length - 1, t + 1));
          break;
        case 'confirm':
          if (tile?.goes) onNavigate(tile.goes);
          break;
        case 'menu':
          onNavigate('settings');
          break;
        default:
          break;
      }
    },
    [rails, rail, tile, onNavigate],
  );

  useNavigation(onAction);

  return (
    <div className="hub">
      <header className="hub__top">
        <div className="hub__brand">
          <span className="hub__wordmark">Boot Room</span>
          <Crest club={club} size={38} />
          <span className="hub__identity">
            <span className="hub__club">{club.name}</span>
            <span className="hub__league">{league?.name ?? 'Unaffiliated'}</span>
          </span>
        </div>
        <div className="hub__account">
          <span className="hub__coins">
            {coins.toLocaleString('en-GB')}
            <small>Credits</small>
          </span>
          <span className="hub__coins">
            {club.overall}
            <small>Overall</small>
          </span>
        </div>
      </header>

      <div style={{ display: 'contents' }}>
        <nav className="hub__tabs" aria-label="Hub sections">
          <span className="hub__bumpers">
            <Glyph action="tabPrev" />
            <Glyph action="tabNext" />
          </span>
          {TABS.map((label, i) => (
            <button
              key={label}
              type="button"
              className="hub__tab"
              data-active={i === tab}
              aria-current={i === tab || undefined}
              onClick={() => setTab(i)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="hub__body" ref={bodyRef}>
          {rails.map((r, ri) => (
            <section className="hub__rail" key={r.id} data-rail-index={ri}>
              <div className="hub__railhead">
                <h2 className="hub__railtitle">{r.title}</h2>
                {r.note && <span className="hub__railnote">{r.note}</span>}
              </div>
              <div className="hub__tiles">
                {r.tiles.map((t, ti) => {
                  const focused = ri === railIndex && ti === tileIndex;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="tile"
                      data-focused={focused}
                      style={t.wide ? { ['--tile-w' as string]: '470px' } : undefined}
                      onMouseEnter={() => {
                        setRailIndex(ri);
                        setTileIndex(ti);
                      }}
                      onClick={() => {
                        setRailIndex(ri);
                        setTileIndex(ti);
                        if (t.goes) onNavigate(t.goes);
                      }}
                    >
                      <span className="tile__art">
                        <TileArt seed={`${r.id}-${t.id}`} />
                      </span>
                      <span className="tile__scrim" />
                      {t.badge && (
                        <span className="tile__badge" data-tone={t.badge.tone}>
                          {t.badge.text}
                        </span>
                      )}
                      <span className="tile__copy">
                        <span className="tile__name">{t.name}</span>
                        <span className="tile__note">{t.note}</span>
                      </span>
                      {focused && <span key={`${r.id}-${t.id}-leak`} className="tile__leak" />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <footer className="hub__actions">
        <div className="hub__actions-left">
          <Hint action="confirm" label={tile?.goes ? `Enter ${tile.name}` : 'Select'} />
          <Hint action="menu" label="Settings" />
        </div>
        <div className="hub__actions-right">
          <Hint action="tabNext" label="Switch tab" />
        </div>
      </footer>
    </div>
  );
}

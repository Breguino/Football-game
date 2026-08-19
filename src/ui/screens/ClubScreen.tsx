import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerCard } from '@/ui/primitives/PlayerCard';
import { Hint, Glyph } from '@/ui/primitives/Glyph';
import { SquadPitch, BenchStrip } from './SquadPitch';
import { PlaySlate } from './PlaySlate';
import { useNavigation } from '@/input/InputProvider';
import { useWorld } from '@/state/world';
import { useCollection } from '@/state/collection';
import { bestOf, discardValue, PACK_TYPES, type PackType, type PlayerItem } from '@/world/items';
import { FORMATION } from '@/world/lineup';
import { opponentsFor, type Opponent } from '@/world/opponents';
import type { NavAction } from '@/input/actions';
import type { Club, Player } from '@/world/generate';
import './club.css';

/**
 * The collection, in three views: the side you field, the packs you can buy,
 * and everything you own.
 *
 * They are tabs rather than one screen because each wants the whole of the
 * d-pad — a formation grid, a price list and a card grid all read up and down
 * differently, and sharing them would mean one of the three navigating badly.
 */

const TABS = ['Squad', 'Play', 'Store', 'Items'] as const;
type Tab = (typeof TABS)[number];

/** Resolves an item back to the player and club it was printed from. */
type Lookup = (item: PlayerItem) => { player: Player; club: Club } | null;

type Mode =
  | { kind: 'browsing' }
  | { kind: 'swapping'; slot: number }
  | { kind: 'revealing'; items: PlayerItem[]; index: number; pack: PackType };

export function ClubScreen({
  onExit,
  onPlay,
}: {
  onExit: () => void;
  /** Kicks off against the chosen opponent, at the chosen reward multiplier. */
  onPlay: (opponent: Opponent) => void;
}) {
  const world = useWorld((s) => s.world);
  const userClubId = useWorld((s) => s.userClubId);
  const coins = useCollection((s) => s.coins);
  const items = useCollection((s) => s.items);
  const pinned = useCollection((s) => s.pinned);
  const buy = useCollection((s) => s.buy);
  const discard = useCollection((s) => s.discard);
  const pin = useCollection((s) => s.pin);
  const lineupOf = useCollection((s) => s.lineup);
  const record = useCollection((s) => s.record);

  const club = world.clubs[userClubId]!;

  // A card always wears the club the player was printed from, the way it does
  // in the items grid — a squad of one kit would hide that it is a collection.
  const clubOf = useCallback(
    (item: PlayerItem): Club => world.clubs[item.clubId] ?? club,
    [world, club],
  );
  // Recomputed whenever the collection or the picked shirts change.
  const lineup = useMemo(() => lineupOf(), [lineupOf, items, pinned]);

  const [tab, setTab] = useState<Tab>('Squad');
  const [mode, setMode] = useState<Mode>({ kind: 'browsing' });
  const [slotIndex, setSlotIndex] = useState(9);
  const [packIndex, setPackIndex] = useState(1);
  const [fixtureIndex, setFixtureIndex] = useState(1);
  const [cardIndex, setCardIndex] = useState(0);
  const [benchIndex, setBenchIndex] = useState(0);

  /** Items newest first, so a fresh pull is at the front. */
  const owned = useMemo(() => [...items].reverse(), [items]);

  // The slate moves with your squad and refreshes as you play, so improving
  // changes who you face rather than only what the number says.
  const opponents = useMemo(
    () => opponentsFor(world, lineup.rating, record.played, userClubId),
    [world, lineup.rating, record.played, userClubId],
  );

  const gridRef = useRef<HTMLDivElement>(null);

  const focusedItem = owned[cardIndex];
  const discardHint = focusedItem
    ? `Discard for ${discardValue(focusedItem).toLocaleString('en-GB')}`
    : 'Discard item';

  const lookup = useCallback<Lookup>(
    (item) => {
      const found = world.clubs[item.clubId];
      const player = found?.squad.find((p) => p.id === item.playerId);
      return found && player ? { player, club: found } : null;
    },
    [world],
  );

  // A collection outgrows the screen after two packs, so the grid has to
  // follow the cursor — otherwise everything past the second row is
  // unreachable on a pad.
  useEffect(() => {
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-card-index="${cardIndex}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cardIndex, tab]);

  // Discarding the last item in the grid would otherwise leave the cursor
  // pointing past the end.
  useEffect(() => {
    setCardIndex((i) => Math.max(0, Math.min(i, owned.length - 1)));
  }, [owned.length]);

  /**
   * How many cards sit in a row, read off the layout rather than assumed: the
   * grid auto-fills, so the count changes with the window.
   */
  const columns = useCallback(() => {
    const cells = gridRef.current?.children;
    if (!cells || cells.length === 0) return 1;
    const first = (cells[0] as HTMLElement).offsetTop;
    for (let i = 1; i < cells.length; i += 1) {
      if ((cells[i] as HTMLElement).offsetTop > first) return i;
    }
    return cells.length;
  }, []);

  const openSelected = useCallback(() => {
    const pack = PACK_TYPES[packIndex];
    if (!pack) return;
    const pulled = buy(pack);
    if (!pulled) return;
    setMode({ kind: 'revealing', items: pulled, index: 0, pack });
  }, [packIndex, buy]);

  /** Next card in the reveal, or back to browsing once the pack is spent. */
  const advance = useCallback(() => {
    setMode((current) => {
      if (current.kind !== 'revealing') return current;
      const next = current.index + 1;
      return next >= current.items.length ? { kind: 'browsing' } : { ...current, index: next };
    });
  }, []);

  /** Everyone eligible to take a shirt: the bench, and whoever holds it now. */
  const swapCandidates = useMemo(() => {
    if (mode.kind !== 'swapping') return [];
    const current = lineup.eleven[mode.slot];
    const held = current ? [{ item: current.item, player: current.player }] : [];
    return [...held, ...lineup.bench];
  }, [mode, lineup]);

  const onAction = useCallback(
    (action: NavAction) => {
      if (mode.kind === 'revealing') {
        if (action === 'confirm' || action === 'right') advance();
        else if (action === 'back') setMode({ kind: 'browsing' });
        return;
      }

      if (mode.kind === 'swapping') {
        switch (action) {
          case 'left':
            setBenchIndex((i) => Math.max(0, i - 1));
            break;
          case 'right':
            setBenchIndex((i) => Math.min(swapCandidates.length - 1, i + 1));
            break;
          case 'confirm': {
            const chosen = swapCandidates[benchIndex];
            if (chosen) pin(mode.slot, chosen.item.id);
            setMode({ kind: 'browsing' });
            break;
          }
          case 'altAction':
            // Hand the shirt back to the automatic pick.
            pin(mode.slot, null);
            setMode({ kind: 'browsing' });
            break;
          case 'back':
            setMode({ kind: 'browsing' });
            break;
          default:
            break;
        }
        return;
      }

      if (action === 'tabPrev' || action === 'tabNext') {
        const step = action === 'tabNext' ? 1 : -1;
        setTab((t) => TABS[Math.max(0, Math.min(TABS.length - 1, TABS.indexOf(t) + step))]!);
        return;
      }
      if (action === 'back') {
        onExit();
        return;
      }
      if (action === 'menu') {
        const fixture = opponents[fixtureIndex];
        if (lineup.complete && fixture) onPlay(fixture);
        return;
      }

      if (tab === 'Squad') {
        switch (action) {
          case 'left':
            setSlotIndex((i) => Math.max(0, i - 1));
            break;
          case 'right':
            setSlotIndex((i) => Math.min(FORMATION.length - 1, i + 1));
            break;
          case 'up':
            setSlotIndex((i) => Math.max(0, i - 3));
            break;
          case 'down':
            setSlotIndex((i) => Math.min(FORMATION.length - 1, i + 3));
            break;
          case 'confirm':
            setBenchIndex(0);
            setMode({ kind: 'swapping', slot: slotIndex });
            break;
          case 'altAction':
            pin(slotIndex, null);
            break;
          default:
            break;
        }
        return;
      }

      if (tab === 'Play') {
        switch (action) {
          case 'up':
            setFixtureIndex((i) => Math.max(0, i - 1));
            break;
          case 'down':
            setFixtureIndex((i) => Math.min(opponents.length - 1, i + 1));
            break;
          case 'confirm': {
            const fixture = opponents[fixtureIndex];
            if (lineup.complete && fixture) onPlay(fixture);
            break;
          }
          default:
            break;
        }
        return;
      }

      if (tab === 'Store') {
        switch (action) {
          case 'up':
            setPackIndex((i) => Math.max(0, i - 1));
            break;
          case 'down':
            setPackIndex((i) => Math.min(PACK_TYPES.length - 1, i + 1));
            break;
          case 'confirm':
            openSelected();
            break;
          default:
            break;
        }
        return;
      }

      switch (action) {
        case 'left':
          setCardIndex((i) => Math.max(0, i - 1));
          break;
        case 'right':
          setCardIndex((i) => Math.min(owned.length - 1, i + 1));
          break;
        case 'up':
          setCardIndex((i) => Math.max(0, i - columns()));
          break;
        case 'down':
          setCardIndex((i) => Math.min(owned.length - 1, i + columns()));
          break;
        case 'altAction': {
          const item = owned[cardIndex];
          if (item) discard(item.id, discardValue(item));
          break;
        }
        default:
          break;
      }
    },
    [
      mode, tab, owned, cardIndex, slotIndex, benchIndex, swapCandidates, lineup,
      opponents, fixtureIndex, openSelected, discard, advance, columns, pin, onExit, onPlay,
    ],
  );

  useNavigation(onAction);

  if (mode.kind === 'revealing') {
    return <Reveal mode={mode} lookup={lookup} onNext={advance} />;
  }

  return (
    <div className="club">
      <header className="club__top">
        <div>
          <p className="t-eyebrow">Football Ultimate Team</p>
          <h1 className="club__title">Club</h1>
        </div>
        <div className="club__wallet">
          <span className="club__coins">{coins.toLocaleString('en-GB')}</span>
          <span className="club__coinlabel">Credits</span>
        </div>
      </header>

      <nav className="club__tabs" aria-label="Club sections">
        <span className="club__bumpers">
          <Glyph action="tabPrev" />
          <Glyph action="tabNext" />
        </span>
        {TABS.map((label) => (
          <button
            key={label}
            type="button"
            className="club__tab"
            data-active={label === tab}
            aria-current={label === tab || undefined}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'Squad' && (
        <div className="club__body club__body--squad">
          <SquadPitch
            lineup={lineup}
            clubOf={clubOf}
            focusedSlot={slotIndex}
            onFocusSlot={setSlotIndex}
            onSelectSlot={(slot) => {
              setBenchIndex(0);
              setMode({ kind: 'swapping', slot });
            }}
          />

          <aside className="club__aside">
            <div className="club__ratingblock">
              <span className="club__ratingnum">{lineup.complete ? lineup.rating : '—'}</span>
              <span className="club__coinlabel">Squad rating</span>
            </div>

            <dl className="club__facts">
              <div>
                <dt>Fielded</dt>
                <dd>
                  {lineup.eleven.length} / {FORMATION.length}
                </dd>
              </div>
              <div>
                <dt>Out of position</dt>
                <dd data-warn={lineup.outOfPosition > 0}>{lineup.outOfPosition}</dd>
              </div>
              <div>
                <dt>Substitutes</dt>
                <dd>{lineup.bench.length}</dd>
              </div>
            </dl>

            <p className="club__note">
              {lineup.complete
                ? 'Ready to play. Better items win you better matches.'
                : `Short of a full side — you need ${
                    FORMATION.length - lineup.eleven.length
                  } more item${FORMATION.length - lineup.eleven.length === 1 ? '' : 's'}.`}
            </p>

            <h2 className="fc-section-head">Substitutes</h2>
            <BenchStrip
              bench={lineup.bench}
              clubOf={clubOf}
              focusedIndex={-1}
              onFocus={() => {}}
              onSelect={() => {}}
              emptyLabel="Nobody spare. Open a pack."
            />
          </aside>
        </div>
      )}

      {tab === 'Play' && (
        <div className="club__body club__body--play">
          <PlaySlate
            opponents={opponents}
            record={record}
            squadRating={lineup.rating}
            focused={fixtureIndex}
            onFocus={setFixtureIndex}
            onSelect={onPlay}
            canPlay={lineup.complete}
          />
        </div>
      )}

      {tab === 'Store' && (
        <div className="club__body club__body--store">
          <section className="club__store">
            {PACK_TYPES.map((pack, i) => (
              <PackRow
                key={pack.id}
                pack={pack}
                focused={i === packIndex}
                affordable={coins >= pack.price}
                onFocus={() => setPackIndex(i)}
                onSelect={openSelected}
              />
            ))}
          </section>
          <aside className="club__aside">
            <p className="club__note">
              Every pack costs more than the items in it are worth to sell. That is the point:
              you buy them for the card you want, not for the credits back.
            </p>
          </aside>
        </div>
      )}

      {tab === 'Items' && (
        <div className="club__body club__body--items">
          <section className="club__items">
            <div className="club__itemshead">
              <h2 className="fc-section-head">
                Your items <span className="club__count">{items.length}</span>
              </h2>
            </div>

            {owned.length === 0 ? (
              <p className="club__empty">Nothing yet. Open a pack.</p>
            ) : (
              <div className="club__grid" ref={gridRef}>
                {owned.map((item, i) => {
                  const found = lookup(item);
                  if (!found) return null;
                  return (
                    <div key={item.id} data-card-index={i}>
                      <PlayerCard
                        item={item}
                        player={found.player}
                        club={found.club}
                        width={186}
                        focused={i === cardIndex}
                        onFocus={() => setCardIndex(i)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {mode.kind === 'swapping' && (
        <SwapPicker
          slot={FORMATION[mode.slot] ?? '—'}
          candidates={swapCandidates}
          clubOf={clubOf}
          focusedIndex={benchIndex}
          onFocus={setBenchIndex}
          onChoose={(item) => {
            pin(mode.slot, item.id);
            setMode({ kind: 'browsing' });
          }}
          onAuto={() => {
            pin(mode.slot, null);
            setMode({ kind: 'browsing' });
          }}
          onCancel={() => setMode({ kind: 'browsing' })}
        />
      )}

      <footer className="club__actions">
        <ActionHints
          tab={tab}
          swapping={mode.kind === 'swapping'}
          discardHint={discardHint}
          canPlay={lineup.complete}
          press={onAction}
        />
      </footer>
    </div>
  );
}

function ActionHints({
  tab,
  swapping,
  discardHint,
  canPlay,
  press,
}: {
  tab: Tab;
  swapping: boolean;
  discardHint: string;
  canPlay: boolean;
  /** Makes each hint a real control, which is how these are reached by touch. */
  press: (action: NavAction) => void;
}) {
  const on = (action: NavAction) => () => press(action);
  if (swapping) {
    return (
      <>
        <Hint action="confirm" label="Give them the shirt" onPress={on('confirm')} />
        <Hint action="altAction" label="Pick automatically" onPress={on('altAction')} />
        <Hint action="back" label="Cancel" onPress={on('back')} />
      </>
    );
  }
  if (tab === 'Squad') {
    return (
      <>
        <Hint action="confirm" label="Change player" onPress={on('confirm')} />
        <Hint action="altAction" label="Pick automatically" onPress={on('altAction')} />
        {canPlay && <Hint action="menu" label="Play a match" onPress={on('menu')} />}
        <Hint action="back" label="Back" onPress={on('back')} />
      </>
    );
  }
  if (tab === 'Play') {
    return (
      <>
        {canPlay ? (
          <Hint action="confirm" label="Kick off" onPress={on('confirm')} />
        ) : (
          <Hint action="confirm" label="Need a full eleven" />
        )}
        <Hint action="back" label="Back" onPress={on('back')} />
      </>
    );
  }
  if (tab === 'Store') {
    return (
      <>
        <Hint action="confirm" label="Open pack" onPress={on('confirm')} />
        <Hint action="back" label="Back" onPress={on('back')} />
      </>
    );
  }
  return (
    <>
      <Hint action="altAction" label={discardHint} onPress={on('altAction')} />
      <Hint action="back" label="Back" onPress={on('back')} />
    </>
  );
}

function PackRow({
  pack,
  focused,
  affordable,
  onFocus,
  onSelect,
}: {
  pack: PackType;
  focused: boolean;
  affordable: boolean;
  onFocus: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="pack"
      data-focused={focused}
      data-affordable={affordable}
      onMouseEnter={onFocus}
      onClick={() => {
        onFocus();
        onSelect();
      }}
    >
      {focused && <span className="pack__leak" aria-hidden="true" />}
      <span className="pack__name">{pack.name}</span>
      <span className="pack__desc">{pack.description}</span>
      <span className="pack__price">{pack.price.toLocaleString('en-GB')}</span>
    </button>
  );
}

/** Choosing who wears a shirt. */
function SwapPicker({
  slot,
  candidates,
  clubOf,
  focusedIndex,
  onFocus,
  onChoose,
  onAuto,
  onCancel,
}: {
  slot: string;
  candidates: { item: PlayerItem; player: Player }[];
  clubOf: (item: PlayerItem) => Club;
  focusedIndex: number;
  onFocus: (index: number) => void;
  onChoose: (item: PlayerItem) => void;
  onAuto: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="swap" onClick={onCancel}>
      <div className="swap__panel" onClick={(e) => e.stopPropagation()}>
        <header className="swap__head">
          <p className="t-eyebrow">Who plays</p>
          <h2 className="swap__slot">{slot}</h2>
        </header>

        <BenchStrip
          bench={candidates}
          clubOf={clubOf}
          focusedIndex={focusedIndex}
          onFocus={onFocus}
          onSelect={onChoose}
          emptyLabel="Nobody else to pick. Open a pack."
        />

        <button type="button" className="swap__auto" onClick={onAuto}>
          <Glyph action="altAction" />
          <span>Pick automatically</span>
        </button>
      </div>
    </div>
  );
}

/** One item at a time, biggest last. */
function Reveal({
  mode,
  lookup,
  onNext,
}: {
  mode: Extract<Mode, { kind: 'revealing' }>;
  lookup: Lookup;
  onNext: () => void;
}) {
  const item = mode.items[mode.index];
  const found = item ? lookup(item) : null;
  const best = bestOf(mode.items);
  const remaining = mode.items.length - mode.index - 1;

  return (
    <div className="reveal" onClick={onNext}>
      <div className="reveal__aurora" aria-hidden="true" />
      <div className="reveal__body">
        <p className="t-eyebrow">{mode.pack.name}</p>

        {item && found && (
          <div className="reveal__card" key={item.id}>
            <PlayerCard item={item} player={found.player} club={found.club} width={330} focused />
          </div>
        )}

        <p className="reveal__count">
          {remaining > 0
            ? `${remaining} more`
            : best
              ? `Best of the pack: ${best.rating}`
              : 'Done'}
        </p>
      </div>

      <button type="button" className="reveal__next" onClick={onNext}>
        <Glyph action="confirm" />
        <span>{remaining > 0 ? 'Next' : 'Finish'}</span>
      </button>
    </div>
  );
}

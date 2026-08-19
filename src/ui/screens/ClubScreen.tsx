import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerCard } from '@/ui/primitives/PlayerCard';
import { Hint, Glyph } from '@/ui/primitives/Glyph';
import { useNavigation } from '@/input/InputProvider';
import { useWorld } from '@/state/world';
import { useCollection } from '@/state/collection';
import { bestOf, discardValue, PACK_TYPES, type PackType, type PlayerItem } from '@/world/items';
import type { NavAction } from '@/input/actions';
import type { Club, Player } from '@/world/generate';
import './club.css';

/**
 * The collection: packs to open on the left, what you own on the right.
 *
 * A pack reveal takes over the screen, one item at a time, because the reveal
 * *is* the mode — a list that simply grew by seven would not be worth opening.
 */

/** Resolves an item back to the player and club it was printed from. */
type Lookup = (item: PlayerItem) => { player: Player; club: Club } | null;

type Mode =
  | { kind: 'browsing' }
  | { kind: 'revealing'; items: PlayerItem[]; index: number; pack: PackType };

export function ClubScreen({ onExit }: { onExit: () => void }) {
  const world = useWorld((s) => s.world);
  const coins = useCollection((s) => s.coins);
  const items = useCollection((s) => s.items);
  const buy = useCollection((s) => s.buy);
  const discard = useCollection((s) => s.discard);

  const [mode, setMode] = useState<Mode>({ kind: 'browsing' });
  const [packIndex, setPackIndex] = useState(1);
  const [cardIndex, setCardIndex] = useState(0);

  /** Items newest first, so a fresh pull is at the front. */
  const owned = useMemo(() => [...items].reverse(), [items]);

  const gridRef = useRef<HTMLDivElement>(null);

  const focusedItem = owned[cardIndex];
  const discardHint = focusedItem
    ? `Discard for ${discardValue(focusedItem).toLocaleString('en-GB')}`
    : 'Discard item';

  // A collection outgrows the screen after two packs, so the grid has to
  // follow the cursor — otherwise everything past the second row is
  // unreachable on a pad.
  useEffect(() => {
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-card-index="${cardIndex}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cardIndex]);

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

  const lookup = useCallback<Lookup>(
    (item) => {
      const club = world.clubs[item.clubId];
      const player = club?.squad.find((p) => p.id === item.playerId);
      return club && player ? { player, club } : null;
    },
    [world],
  );

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

  const onAction = useCallback(
    (action: NavAction) => {
      if (mode.kind === 'revealing') {
        if (action === 'confirm' || action === 'right') advance();
        else if (action === 'back') setMode({ kind: 'browsing' });
        return;
      }

      switch (action) {
        case 'up':
          setPackIndex((i) => Math.max(0, i - 1));
          break;
        case 'down':
          setPackIndex((i) => Math.min(PACK_TYPES.length - 1, i + 1));
          break;
        case 'left':
          setCardIndex((i) => Math.max(0, i - 1));
          break;
        case 'right':
          setCardIndex((i) => Math.min(owned.length - 1, i + 1));
          break;
        case 'tabPrev':
          setCardIndex((i) => Math.max(0, i - columns()));
          break;
        case 'tabNext':
          setCardIndex((i) => Math.min(owned.length - 1, i + columns()));
          break;
        case 'confirm':
          openSelected();
          break;
        case 'altAction': {
          const item = owned[cardIndex];
          if (item) discard(item.id, discardValue(item));
          break;
        }
        case 'back':
          onExit();
          break;
        default:
          break;
      }
    },
    [mode, owned, cardIndex, openSelected, discard, advance, columns, onExit],
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

      <div className="club__body">
        <section className="club__store">
          <h2 className="fc-section-head">Store</h2>
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

      <footer className="club__actions">
        <Hint action="confirm" label="Open pack" />
        <Hint action="altAction" label={discardHint} />
        <Hint action="tabNext" label="Next row" />
        <Hint action="back" label="Back" />
      </footer>
    </div>
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

import { PlayerCard } from '@/ui/primitives/PlayerCard';
import type { Lineup, LineupSlot } from '@/world/lineup';
import type { Club, Player } from '@/world/generate';
import type { PlayerItem } from '@/world/items';

/**
 * The eleven, laid out as a shape rather than a list.
 *
 * A list sorted by rating tells you who is good; a shape tells you whether
 * you have a team. Since the whole question in a collection is what you are
 * missing, the shape is the useful view.
 */

/** Where each slot of the 4-3-3 sits, as percentages of the pitch panel. */
const SPOTS: { x: number; y: number }[] = [
  { x: 50, y: 86 }, // GK
  { x: 84, y: 70 }, // RB
  { x: 61, y: 74 }, // CB
  { x: 39, y: 74 }, // CB
  { x: 16, y: 70 }, // LB
  { x: 50, y: 55 }, // CDM
  { x: 29, y: 45 }, // CM
  { x: 71, y: 45 }, // CAM
  { x: 85, y: 25 }, // RW
  { x: 50, y: 17 }, // ST
  { x: 15, y: 25 }, // LW
];

export interface SquadPitchProps {
  lineup: Lineup;
  /** The club a given item was printed from — a collection is a mix of them. */
  clubOf: (item: PlayerItem) => Club;
  focusedSlot: number;
  onFocusSlot: (slot: number) => void;
  onSelectSlot: (slot: number) => void;
}

export function SquadPitch({
  lineup,
  clubOf,
  focusedSlot,
  onFocusSlot,
  onSelectSlot,
}: SquadPitchProps) {
  return (
    <div className="pitchview">
      <div className="pitchview__turf" aria-hidden="true">
        <span className="pitchview__halfway" />
        <span className="pitchview__circle" />
        <span className="pitchview__box pitchview__box--near" />
        <span className="pitchview__box pitchview__box--far" />
      </div>

      {SPOTS.map((spot, index) => {
        const slot = lineup.eleven[index];
        return (
          <div
            className="pitchview__spot"
            key={index}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            {slot ? (
              <SlotCard
                slot={slot}
                club={clubOf(slot.item)}
                focused={index === focusedSlot}
                onFocus={() => onFocusSlot(index)}
                onSelect={() => onSelectSlot(index)}
              />
            ) : (
              <button
                type="button"
                className="pitchview__empty"
                data-focused={index === focusedSlot}
                onMouseEnter={() => onFocusSlot(index)}
                onClick={() => onSelectSlot(index)}
              >
                <span>+</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SlotCard({
  slot,
  club,
  focused,
  onFocus,
  onSelect,
}: {
  slot: LineupSlot;
  club: Club;
  focused: boolean;
  onFocus: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="pitchview__card" data-penalty={slot.penalty > 0}>
      <PlayerCard
        item={slot.item}
        player={slot.player}
        club={club}
        width={112}
        focused={focused}
        onFocus={onFocus}
        onSelect={onSelect}
      />
      <span className="pitchview__slot">{slot.slot}</span>
      {slot.penalty > 0 && (
        <span className="pitchview__warn" title={`${slot.player.position} playing ${slot.slot}`}>
          −{slot.penalty}
        </span>
      )}
      {slot.pinned && <span className="pitchview__pin" aria-label="Picked by you" />}
    </div>
  );
}

/** The strip of everyone not in the eleven, for swapping a shirt. */
export function BenchStrip({
  bench,
  clubOf,
  focusedIndex,
  onFocus,
  onSelect,
  emptyLabel,
}: {
  bench: { item: PlayerItem; player: Player }[];
  clubOf: (item: PlayerItem) => Club;
  focusedIndex: number;
  onFocus: (index: number) => void;
  onSelect: (item: PlayerItem) => void;
  emptyLabel: string;
}) {
  if (bench.length === 0) return <p className="club__empty">{emptyLabel}</p>;

  return (
    <div className="bench">
      {bench.map((entry, index) => (
        <PlayerCard
          key={entry.item.id}
          item={entry.item}
          player={entry.player}
          club={clubOf(entry.item)}
          width={104}
          focused={index === focusedIndex}
          onFocus={() => onFocus(index)}
          onSelect={() => onSelect(entry.item)}
        />
      ))}
    </div>
  );
}

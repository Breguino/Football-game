import { useCallback, useEffect, useMemo, useState } from 'react';
import { FocusRow, Cycler, Slider } from '@/ui/primitives/FocusRow';
import { Panel } from '@/ui/primitives/Panel';
import { Glyph, Hint } from '@/ui/primitives/Glyph';
import { useNavigation, useInput } from '@/input/InputProvider';
import type { NavAction, GlyphSet } from '@/input/actions';
import { useSettings } from '@/state/settings';
import { rowValueText, type SettingRow } from './settingsConfig';
import './settings.css';

/** Flattened view of a tab: every row with the coordinates needed to adjust it. */
interface FlatRow {
  row: SettingRow;
  sectionIndex: number;
  rowIndex: number;
  sectionTitle: string;
  /** True for the first row of a section, so the header renders above it. */
  startsSection: boolean;
}

export function SettingsScreen({ onExit }: { onExit: () => void }) {
  const tabs = useSettings((s) => s.tabs);
  const adjust = useSettings((s) => s.adjust);
  const restoreDefaults = useSettings((s) => s.restoreDefaults);
  const { setGlyphSet } = useInput();

  const [tabIndex, setTabIndex] = useState(1); // Camera — the reference screen
  const [cursor, setCursor] = useState(0);
  const [nudge, setNudge] = useState<'left' | 'right' | null>(null);

  const tab = tabs[tabIndex];

  const flat = useMemo<FlatRow[]>(() => {
    if (!tab) return [];
    const out: FlatRow[] = [];
    tab.sections.forEach((section, sectionIndex) => {
      section.rows.forEach((row, rowIndex) => {
        out.push({
          row,
          sectionIndex,
          rowIndex,
          sectionTitle: section.title,
          startsSection: rowIndex === 0,
        });
      });
    });
    return out;
  }, [tab]);

  const active = flat[cursor];

  // Flash the cycler arrow that was pressed, then clear it.
  useEffect(() => {
    if (!nudge) return;
    const timer = window.setTimeout(() => setNudge(null), 160);
    return () => window.clearTimeout(timer);
  }, [nudge]);

  // Clamp the cursor when switching to a shorter tab.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const applyDelta = useCallback(
    (delta: number) => {
      const target = flat[cursor];
      if (!target || target.row.kind === 'action') return;
      adjust(tabIndex, target.sectionIndex, target.rowIndex, delta);
      setNudge(delta > 0 ? 'right' : 'left');

      // The glyph setting drives the whole interface, so apply it immediately.
      if (target.row.id === 'glyphSet' && target.row.kind === 'cycler') {
        const next = Math.min(
          Math.max(target.row.value + delta, 0),
          target.row.options.length - 1,
        );
        const map: Record<string, GlyphSet> = {
          PlayStation: 'playstation',
          Xbox: 'xbox',
          Keyboard: 'keyboard',
        };
        const chosen = map[target.row.options[next] ?? ''];
        if (chosen) setGlyphSet(chosen);
      }
    },
    [flat, cursor, tabIndex, adjust, setGlyphSet],
  );

  const onAction = useCallback(
    (action: NavAction) => {
      switch (action) {
        case 'up':
          setCursor((c) => Math.max(0, c - 1));
          break;
        case 'down':
          setCursor((c) => Math.min(flat.length - 1, c + 1));
          break;
        case 'left':
          applyDelta(-1);
          break;
        case 'right':
          applyDelta(1);
          break;
        case 'tabPrev':
          setTabIndex((t) => Math.max(0, t - 1));
          setCursor(0);
          break;
        case 'tabNext':
          setTabIndex((t) => Math.min(tabs.length - 1, t + 1));
          setCursor(0);
          break;
        case 'altAction':
          restoreDefaults();
          break;
        case 'back':
          onExit();
          break;
        default:
          break;
      }
    },
    [flat.length, applyDelta, tabs.length, restoreDefaults, onExit],
  );

  useNavigation(onAction);

  if (!tab || !active) return null;

  const sectionCount = tab.sections.length;
  const activeSection = active.sectionIndex;

  return (
    <div className="settings">
      {/* ---- Top bar ---------------------------------------------------- */}
      <header className="settings__top">
        <GearIcon />
        <span className="settings__rule" aria-hidden="true" />
        <div className="settings__tabwrap">
          <div className="settings__bumpers">
            <Glyph action="tabPrev" />
            <Glyph action="tabNext" />
          </div>
          <nav className="settings__tabs" aria-label="Settings sections">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className="settings__tab"
                data-active={i === tabIndex}
                aria-current={i === tabIndex || undefined}
                onClick={() => {
                  setTabIndex(i);
                  setCursor(0);
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ---- Body ------------------------------------------------------- */}
      <div className="settings__body">
        <div className="settings__list">
          {flat.map((entry, i) => (
            <div
              key={entry.row.id}
              className={entry.startsSection ? 'settings__section' : undefined}
            >
              {entry.startsSection && (
                <h2 className="fc-section-head">{entry.sectionTitle}</h2>
              )}
              <FocusRow
                label={entry.row.label}
                focused={i === cursor}
                onFocus={() => setCursor(i)}
                onSelect={() => applyDelta(1)}
              >
                <RowValue row={entry.row} focused={i === cursor} nudge={nudge} />
              </FocusRow>
            </div>
          ))}
        </div>

        {/* Keyed on the focused row so the panel re-enters on every move. */}
        <div className="settings__detail">
          <Panel key={active.row.id} title={active.row.label} body={active.row.body} />
        </div>

        <div className="settings__rail">
          <ScrollRail index={cursor} total={flat.length} />
          <div className="settings__railmeta">
            {tab.sections.map((section, i) => (
              <span
                key={section.id}
                className="settings__railitem"
                data-active={i === activeSection}
              >
                {section.title}
              </span>
            ))}
            {sectionCount > 1 && (
              <span className="settings__stick" aria-hidden="true">
                <span>▲</span>
                <span className="settings__stickring">R</span>
                <span>▼</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---- Bottom action bar ------------------------------------------ */}
      <footer className="settings__actions">
        <div className="settings__actions-left">
          <Hint action="back" label="Back" />
          <Hint action="altAction" label="Restore Defaults" />
        </div>
        <div className="settings__actions-right">
          <span className="settings__status">
            <Glyph action="menu" />
            <span className="settings__online">1</span>
            <span>online</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

function RowValue({
  row,
  focused,
  nudge,
}: {
  row: SettingRow;
  focused: boolean;
  nudge: 'left' | 'right' | null;
}) {
  if (row.kind === 'slider') {
    return <Slider value={row.value} min={row.min ?? 0} max={row.max} />;
  }
  if (row.kind === 'cycler' && focused) {
    return <Cycler value={rowValueText(row)} nudge={nudge} />;
  }
  return <>{rowValueText(row)}</>;
}

function ScrollRail({ index, total }: { index: number; total: number }) {
  const height = total <= 1 ? 100 : Math.max(12, (1 / total) * 100 * 3);
  const top = total <= 1 ? 0 : (index / (total - 1)) * (100 - height);
  return (
    <div className="fc-scrollrail" aria-hidden="true">
      <div className="fc-scrollrail__thumb" style={{ top: `${top}%`, height: `${height}%` }} />
    </div>
  );
}

function GearIcon() {
  return (
    <svg className="settings__gear" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13a7.7 7.7 0 0 0 .05-1 7.7 7.7 0 0 0-.05-1l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

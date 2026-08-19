import { create } from 'zustand';
import { SETTINGS_TABS, type SettingRow, type SettingsTab } from '@/ui/screens/settingsConfig';
import { load, save } from './persist';

/** Deep clone of the authored defaults, so "restore defaults" has a source. */
function seed(): SettingsTab[] {
  return SETTINGS_TABS.map((tab) => ({
    ...tab,
    sections: tab.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => ({ ...row })),
    })),
  }));
}

interface SettingsState {
  tabs: SettingsTab[];
  /** Flat id → current value, for the rest of the game to read cheaply. */
  get: (id: string) => SettingRow | undefined;
  value: (id: string) => string | number | undefined;
  adjust: (tabIndex: number, sectionIndex: number, rowIndex: number, delta: number) => void;
  restoreDefaults: () => void;
}

const SAVE_KEY = 'settings';

/**
 * Saves the values only, keyed by row id — never the rows themselves.
 *
 * The labels, ranges and help text are authored in the config and change with
 * the game; a save that carried them would pin an old build's wording onto a
 * new one, and a row that was removed would come back from the dead.
 */
function restore(): SettingsTab[] {
  const values = load<Record<string, number>>(SAVE_KEY);
  const tabs = seed();
  if (!values) return tabs;

  for (const tab of tabs) {
    for (const section of tab.sections) {
      for (const row of section.rows) {
        const saved = values[row.id];
        if (typeof saved !== 'number') continue;
        // Clamped against the current config, so a range that has since
        // narrowed cannot restore an out-of-bounds value.
        if (row.kind === 'slider') {
          row.value = Math.min(Math.max(saved, row.min ?? 0), row.max);
        } else if (row.kind === 'cycler') {
          row.value = Math.min(Math.max(saved, 0), row.options.length - 1);
        }
      }
    }
  }
  return tabs;
}

function valuesOf(tabs: SettingsTab[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tab of tabs) {
    for (const section of tab.sections) {
      for (const row of section.rows) {
        if (row.kind === 'slider' || row.kind === 'cycler') out[row.id] = row.value;
      }
    }
  }
  return out;
}

export const useSettings = create<SettingsState>((set, getState) => ({
  tabs: restore(),

  get: (id) => {
    for (const tab of getState().tabs) {
      for (const section of tab.sections) {
        const row = section.rows.find((r) => r.id === id);
        if (row) return row;
      }
    }
    return undefined;
  },

  value: (id) => {
    const row = getState().get(id);
    if (!row) return undefined;
    if (row.kind === 'cycler') return row.options[row.value];
    if (row.kind === 'slider') return row.value;
    return row.value;
  },

  adjust: (tabIndex, sectionIndex, rowIndex, delta) =>
    set((state) => {
      const tabs = state.tabs.map((tab, ti) => {
        if (ti !== tabIndex) return tab;
        return {
          ...tab,
          sections: tab.sections.map((section, si) => {
            if (si !== sectionIndex) return section;
            return {
              ...section,
              rows: section.rows.map((row, ri) => {
                if (ri !== rowIndex) return row;
                if (row.kind === 'cycler') {
                  const next = Math.min(Math.max(row.value + delta, 0), row.options.length - 1);
                  return { ...row, value: next };
                }
                if (row.kind === 'slider') {
                  const next = Math.min(Math.max(row.value + delta, row.min ?? 0), row.max);
                  return { ...row, value: next };
                }
                return row;
              }),
            };
          }),
        };
      });
      return { tabs };
    }),

  restoreDefaults: () => set({ tabs: seed() }),
}));

// Persist on change rather than from inside adjust(), so a future action that
// changes a setting cannot forget to save it.
useSettings.subscribe((state, previous) => {
  if (state.tabs === previous.tabs) return;
  save(SAVE_KEY, valuesOf(state.tabs));
});

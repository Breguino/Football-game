import { create } from 'zustand';
import { SETTINGS_TABS, type SettingRow, type SettingsTab } from '@/ui/screens/settingsConfig';

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

export const useSettings = create<SettingsState>((set, getState) => ({
  tabs: seed(),

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
                  const next = Math.min(Math.max(row.value + delta, 0), row.max);
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

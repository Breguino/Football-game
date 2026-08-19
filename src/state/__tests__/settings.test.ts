import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from '../settings';
import { SETTINGS_TABS } from '@/ui/screens/settingsConfig';

/** Walks the config for every slider, so a new one cannot skip these rules. */
function sliders() {
  return SETTINGS_TABS.flatMap((tab, ti) =>
    tab.sections.flatMap((section, si) =>
      section.rows.flatMap((row, ri) =>
        row.kind === 'slider' ? [{ row, at: { ti, si, ri } }] : [],
      ),
    ),
  );
}

describe('settings sliders', () => {
  beforeEach(() => useSettings.getState().restoreDefaults());

  it('start inside their own range', () => {
    for (const { row } of sliders()) {
      expect(row.value).toBeGreaterThanOrEqual(row.min ?? 0);
      expect(row.value).toBeLessThanOrEqual(row.max);
    }
  });

  it('cannot be pushed below their floor or above their ceiling', () => {
    const { adjust } = useSettings.getState();
    for (const { at } of sliders()) {
      for (let i = 0; i < 40; i += 1) adjust(at.ti, at.si, at.ri, -1);
      for (let i = 0; i < 40; i += 1) adjust(at.ti, at.si, at.ri, 1);
    }

    for (const tab of useSettings.getState().tabs) {
      for (const section of tab.sections) {
        for (const row of section.rows) {
          if (row.kind !== 'slider') continue;
          expect(row.value).toBeLessThanOrEqual(row.max);
          expect(row.value).toBeGreaterThanOrEqual(row.min ?? 0);
        }
      }
    }
  });

  it('never lets a half be zero minutes long', () => {
    // The clock reads progress as a fraction of the half, which at zero is a
    // division by zero — and a match that is over before kick-off.
    const { adjust, value } = useSettings.getState();
    const half = sliders().find((s) => s.row.id === 'halfLength')!;
    for (let i = 0; i < 40; i += 1) adjust(half.at.ti, half.at.si, half.at.ri, -1);
    expect(Number(useSettings.getState().value('halfLength'))).toBeGreaterThan(0);
    expect(typeof value).toBe('function');
  });
});

import { useEffect, useState } from 'react';
import { InputProvider } from '@/input/InputProvider';
import { StadiumBackdrop } from '@/ui/primitives/StadiumBackdrop';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { useSettings } from '@/state/settings';

export type Screen = 'hub' | 'settings' | 'squad' | 'match';

export function App() {
  return (
    <InputProvider>
      <UiScale />
      <StadiumBackdrop />
      <Router />
    </InputProvider>
  );
}

function Router() {
  const [screen, setScreen] = useState<Screen>('settings');

  switch (screen) {
    case 'settings':
      return <SettingsScreen onExit={() => setScreen('settings')} />;
    default:
      return <SettingsScreen onExit={() => setScreen('settings')} />;
  }
}

/**
 * The layout is authored at 1080p; everything scales linearly from there so a
 * 4K screen and a laptop get the same proportions, not the same pixel sizes.
 */
function UiScale() {
  const userScale = useSettings((s) => s.value('uiScale'));

  useEffect(() => {
    function apply() {
      const viewport = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      const user = typeof userScale === 'number' ? 0.8 + (userScale / 20) * 0.4 : 1;
      const scale = Math.max(0.62, Math.min(1.6, viewport * user));
      document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
    }
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [userScale]);

  return null;
}

import { Suspense, lazy, useEffect, useState } from 'react';
import { InputProvider } from '@/input/InputProvider';
import { StadiumBackdrop } from '@/ui/primitives/StadiumBackdrop';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { HubScreen } from '@/ui/screens/HubScreen';
import { SquadScreen } from '@/ui/screens/SquadScreen';
import { useSettings } from '@/state/settings';

// Three.js is most of the bundle and only the match needs it, so the menus
// are not made to wait for it.
const MatchScreen = lazy(() =>
  import('@/ui/screens/MatchScreen').then((m) => ({ default: m.MatchScreen })),
);

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
  const [screen, setScreen] = useState<Screen>('hub');
  const toHub = () => setScreen('hub');

  switch (screen) {
    case 'settings':
      return <SettingsScreen onExit={toHub} />;
    case 'squad':
      return <SquadScreen onExit={toHub} />;
    case 'match':
      return (
        <Suspense fallback={<div className="fc-booting">Walking out…</div>}>
          <MatchScreen onExit={toHub} />
        </Suspense>
      );
    case 'hub':
    default:
      return <HubScreen onNavigate={setScreen} />;
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

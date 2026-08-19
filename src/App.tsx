import { Suspense, lazy, useEffect, useState } from 'react';
import { InputProvider } from '@/input/InputProvider';
import { StadiumBackdrop } from '@/ui/primitives/StadiumBackdrop';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { HubScreen } from '@/ui/screens/HubScreen';
import { SquadScreen } from '@/ui/screens/SquadScreen';
import { ClubScreen } from '@/ui/screens/ClubScreen';
import { useSettings } from '@/state/settings';
import { useWorld } from '@/state/world';
import { DIFFICULTY_BONUS } from '@/world/opponents';

// Three.js is most of the bundle and only the match needs it, so the menus
// are not made to wait for it.
const MatchScreen = lazy(() =>
  import('@/ui/screens/MatchScreen').then((m) => ({ default: m.MatchScreen })),
);

export type Screen = 'hub' | 'settings' | 'squad' | 'club' | 'match';

/** Which side the player takes into a match. */
export type Lineup = 'club' | 'collection';

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
  // A match started from the Club screen fields the collection; one started
  // from the hub fields the generated club.
  const [lineup, setLineup] = useState<Lineup>('club');
  // How much the chosen fixture multiplies the payout by. Only a collection
  // match has one; a hub kick-off is an exhibition and pays nothing.
  const [bonus, setBonus] = useState(1);
  const setOpponent = useWorld((s) => s.setOpponent);
  const toHub = () => setScreen('hub');

  switch (screen) {
    case 'settings':
      return <SettingsScreen onExit={toHub} />;
    case 'squad':
      return <SquadScreen onExit={toHub} />;
    case 'club':
      return (
        <ClubScreen
          onExit={toHub}
          onPlay={(opponent) => {
            setOpponent(opponent.club.id);
            setBonus(DIFFICULTY_BONUS[opponent.difficulty]);
            setLineup('collection');
            setScreen('match');
          }}
        />
      );
    case 'match':
      return (
        <Suspense fallback={<div className="fc-booting">Walking out…</div>}>
          <MatchScreen onExit={toHub} lineup={lineup} bonus={bonus} />
        </Suspense>
      );
    case 'hub':
    default:
      return (
        <HubScreen
          onNavigate={(next) => {
            if (next === 'match') setLineup('club');
            setScreen(next);
          }}
        />
      );
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

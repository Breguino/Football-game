import { useEffect, useRef, useState } from 'react';
import { MatchScene, type SceneOptions, type TimeOfDay } from '@/render/scene';
import { MatchHud } from '@/ui/hud/MatchHud';
import { useWorld } from '@/state/world';
import { useSettings } from '@/state/settings';
import { useNavigation } from '@/input/InputProvider';
import { createMatch, step, TICK, type Intent, type MatchState } from '@/sim/match';
import { startingEleven } from '@/world/generate';
import { resolveKitClash } from '@/world/colour';
import type { CameraPreset } from '@/render/camera';
import type { NavAction } from '@/input/actions';
import './match.css';

/**
 * The match: a fixed-timestep simulation, a Three.js renderer reading it, and
 * the HUD on top. The loop is deliberately split — the simulation advances in
 * fixed 1/60s ticks regardless of frame rate, so physics stays identical on a
 * 144Hz monitor and a struggling laptop.
 */

export function MatchScreen({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useWorld((s) => s.world);
  const userClubId = useWorld((s) => s.userClubId);
  const opponentClubId = useWorld((s) => s.opponentClubId);
  const settingsValue = useSettings((s) => s.value);

  const home = world.clubs[userClubId]!;
  const awayClub = world.clubs[opponentClubId]!;
  // Fixtures resolve kit clashes before kickoff; so does this.
  const away = { ...awayClub, colours: resolveKitClash(home.colours.primary, awayClub.colours) };
  const competition = world.leagues.find((l) => l.id === home.leagueId)?.name ?? 'Friendly';

  // The simulation lives in a ref: it mutates 60 times a second and must not
  // drive React renders. A sampled snapshot feeds the HUD instead.
  const stateRef = useRef<MatchState | null>(null);
  const intentRef = useRef<Intent>({
    moveX: 0,
    moveZ: 0,
    pass: false,
    shoot: false,
    sprint: false,
    switchPlayer: false,
  });
  const [snapshot, setSnapshot] = useState<MatchState | null>(null);
  const [ready, setReady] = useState(false);

  // Settings are read once at kickoff; changing them mid-match is not a thing.
  const optionsRef = useRef<SceneOptions>({
    camera: {
      preset: (settingsValue('singleCam') as CameraPreset) ?? 'Tele Broadcast',
      height: Number(settingsValue('height') ?? 10),
      zoom: Number(settingsValue('zoom') ?? 10),
      swing: Number(settingsValue('swing') ?? 10),
    },
    timeOfDay: (settingsValue('timeOfDay') as TimeOfDay) ?? 'Night',
    grain: Number(settingsValue('grain') ?? 6),
    dof: Number(settingsValue('dof') ?? 13),
    homeColours: home.colours,
    awayColours: away.colours,
  });

  useNavigation((action: NavAction) => {
    if (action === 'back') onExit();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = createMatch(
      startingEleven(home),
      startingEleven(away),
      { halfLength: Number(settingsValue('halfLength') ?? 6) },
    );
    stateRef.current = state;

    let scene: MatchScene;
    try {
      scene = new MatchScene(canvas, optionsRef.current);
    } catch (error) {
      console.error('[match] WebGL unavailable', error);
      setReady(true);
      return;
    }
    setReady(true);

    // ---- Input --------------------------------------------------------
    const held = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      held.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function readIntent(): Intent {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find(Boolean) ?? null;

      let moveX = 0;
      let moveZ = 0;
      if (held.has('KeyD') || held.has('ArrowRight')) moveX += 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) moveX -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) moveZ += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) moveZ -= 1;

      if (pad) {
        const [ax = 0, ay = 0] = pad.axes;
        if (Math.abs(ax) > 0.18) moveX = ax;
        if (Math.abs(ay) > 0.18) moveZ = ay;
      }

      const length = Math.hypot(moveX, moveZ);
      if (length > 1) {
        moveX /= length;
        moveZ /= length;
      }

      return {
        moveX,
        moveZ,
        pass: held.has('KeyJ') || (pad?.buttons[2]?.pressed ?? false),
        shoot: held.has('KeyK') || (pad?.buttons[3]?.pressed ?? false),
        sprint: held.has('ShiftLeft') || ((pad?.buttons[7]?.value ?? 0) > 0.5),
        switchPlayer: held.has('Space') || (pad?.buttons[0]?.pressed ?? false),
      };
    }

    // ---- Loop ---------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let sinceSample = 0;
    let elapsed = 0;
    let previousGoals = state.score[0] + state.score[1];

    // Actions are edge-triggered: holding pass must not fire every tick.
    let passLatch = false;
    let shootLatch = false;
    let switchLatch = false;

    function frame(now: number) {
      const frameTime = Math.min(0.25, (now - last) / 1000);
      last = now;
      elapsed += frameTime;
      accumulator += frameTime;

      const raw = readIntent();
      intentRef.current = raw;

      while (accumulator >= TICK) {
        const intent: Intent = {
          ...raw,
          pass: raw.pass && !passLatch,
          shoot: raw.shoot && !shootLatch,
          switchPlayer: raw.switchPlayer && !switchLatch,
        };
        passLatch = raw.pass;
        shootLatch = raw.shoot;
        switchLatch = raw.switchPlayer;

        step(state, intent);
        accumulator -= TICK;
      }

      // Punch the camera when a goal goes in.
      const goals = state.score[0] + state.score[1];
      if (goals !== previousGoals) {
        previousGoals = goals;
        scene.shake(0.9, 0.5);
      }

      scene.render(state, frameTime, elapsed);

      // Sample for the HUD at 15Hz — the scoreline and stamina bar do not need
      // 60 React renders a second, and this keeps the main thread for the loop.
      sinceSample += frameTime;
      if (sinceSample > 1 / 15) {
        sinceSample = 0;
        setSnapshot({ ...state });
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      scene.dispose();
    };
    // The match is built once; settings changes take effect at the next kickoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const on = (id: string) => settingsValue(id) === 'On';

  return (
    <div className="match">
      <canvas ref={canvasRef} className="match__canvas" />
      {snapshot && (
        <MatchHud
          state={snapshot}
          home={home}
          away={away}
          competition={competition}
          showScoreClock={on('scoreClock')}
          showDropdown={on('scoreDropdown')}
          showRadar={settingsValue('radar') !== 'Off'}
          showNameBars={on('playerNames')}
          indicatorFade={on('indicatorFade')}
          onFinish={onExit}
        />
      )}
      {!ready && <div className="match__loading">Walking out…</div>}
    </div>
  );
}

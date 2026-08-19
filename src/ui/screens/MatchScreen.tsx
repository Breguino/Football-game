import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MatchScene, type SceneOptions, type TimeOfDay } from '@/render/scene';
import { MatchHud } from '@/ui/hud/MatchHud';
import { ReplayChrome, TeamSheet, Walkout } from '@/ui/hud/Presentation';
import { useWorld } from '@/state/world';
import { useSettings } from '@/state/settings';
import { useCollection } from '@/state/collection';
import { useNavigation } from '@/input/InputProvider';
import { createMatch, step, TICK, type Intent, type MatchState } from '@/sim/match';
import { ReplayBuffer, ReplayPlayer } from '@/sim/replay';
import { matchSquad, startingEleven } from '@/world/generate';
import { collectionClub } from '@/world/lineup';
import { rewardFor, type Reward } from '@/world/rewards';
import { resolveKitClash } from '@/world/colour';
import type { Lineup } from '@/App';
import type { CameraPreset } from '@/render/camera';
import type { NavAction } from '@/input/actions';
import './match.css';

/**
 * The match: a fixed-timestep simulation, a Three.js renderer reading it, and
 * the HUD on top. The loop is deliberately split — the simulation advances in
 * fixed 1/60s ticks regardless of frame rate, so physics stays identical on a
 * 144Hz monitor and a struggling laptop.
 *
 * A presentation layer sits over the simulation and can pause it: the walkout
 * and team sheet run before kickoff, and a goal cuts to a slow-motion replay
 * before play restarts.
 */

/** Where the presentation is, independently of what the simulation is doing. */
type Stage = 'walkout' | 'teamsheet' | 'playing' | 'replay';

const REPLAY_SECONDS = 4.5;
const REPLAY_SPEED = 0.4;

export function MatchScreen({
  onExit,
  lineup = 'club',
  bonus = 1,
}: {
  onExit: () => void;
  lineup?: Lineup;
  /** What the chosen fixture multiplies the payout by. */
  bonus?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useWorld((s) => s.world);
  const userClubId = useWorld((s) => s.userClubId);
  const opponentClubId = useWorld((s) => s.opponentClubId);
  const settingsValue = useSettings((s) => s.value);
  const collectionLineup = useCollection((s) => s.lineup);
  const earn = useCollection((s) => s.earn);
  const recordResult = useCollection((s) => s.recordResult);

  const clubIdentity = world.clubs[userClubId]!;
  // Playing from the Club screen fields the collection under the club's own
  // name and kit; playing from the hub fields the club as generated.
  const home = useMemo(
    () =>
      lineup === 'collection'
        ? collectionClub(clubIdentity, collectionLineup())
        : clubIdentity,
    [lineup, clubIdentity, collectionLineup],
  );
  const awayClub = world.clubs[opponentClubId]!;
  // Fixtures resolve kit clashes before kickoff; so does this.
  const away = useMemo(
    () => ({ ...awayClub, colours: resolveKitClash(home.colours.primary, awayClub.colours) }),
    [home.colours.primary, awayClub],
  );
  const competition = world.leagues.find((l) => l.id === home.leagueId)?.name ?? 'Friendly';

  const homeEleven = useMemo(() => startingEleven(home), [home]);
  const awayEleven = useMemo(() => startingEleven(away), [away]);
  // The match takes the whole squad; the bench is what makes subs possible.
  const homeSquad = useMemo(() => matchSquad(home), [home]);
  const awaySquad = useMemo(() => matchSquad(away), [away]);

  const [stage, setStage] = useState<Stage>('walkout');
  const stageRef = useRef<Stage>('walkout');
  stageRef.current = stage;

  const [snapshot, setSnapshot] = useState<MatchState | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const paidRef = useRef(false);

  // Paid once, at the whistle, and only when the collection was the side that
  // played — a hub kick-off is an exhibition and earns nothing.
  useEffect(() => {
    if (lineup !== 'collection' || paidRef.current) return;
    if (snapshot?.phase !== 'fulltime') return;
    paidRef.current = true;

    const earned = rewardFor({
      scored: snapshot.score[0],
      conceded: snapshot.score[1],
      rating: home.overall,
      opponentRating: away.overall,
      bonus,
    });
    setReward(earned);
    earn(earned.total);
    recordResult(snapshot.score[0], snapshot.score[1]);
    // Deps are primitives: the snapshot is a fresh object 15 times a second,
    // so depending on it (or on its score array) would re-run this all match.
  }, [
    snapshot?.phase,
    snapshot?.score[0],
    snapshot?.score[1],
    lineup,
    home.overall,
    away.overall,
    bonus,
    earn,
    recordResult,
  ]);

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

  const advance = useCallback(() => {
    setStage((current) => (current === 'walkout' ? 'teamsheet' : 'playing'));
  }, []);

  useNavigation(
    useCallback(
      (action: NavAction) => {
        if (action === 'back') onExit();
        else if (action === 'confirm' && stageRef.current !== 'playing') advance();
      },
      [onExit, advance],
    ),
  );

  // The walkout and team sheet run on a timer as well as on a button, so an
  // unattended match still reaches kickoff.
  useEffect(() => {
    if (stage === 'walkout') {
      const timer = window.setTimeout(advance, 5200);
      return () => window.clearTimeout(timer);
    }
    if (stage === 'teamsheet') {
      const timer = window.setTimeout(advance, 4600);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [stage, advance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = createMatch(homeSquad, awaySquad, {
      halfLength: Number(settingsValue('halfLength') ?? 6),
    });

    let scene: MatchScene;
    try {
      scene = new MatchScene(canvas, optionsRef.current);
    } catch (error) {
      console.error('[match] WebGL unavailable', error);
      return;
    }

    const buffer = new ReplayBuffer();
    let replay: ReplayPlayer | null = null;

    // ---- Input --------------------------------------------------------
    // Two sets, because keys are asked two different questions. Movement and
    // sprint want to know what is *held right now*; passing, shooting and
    // tactics want to know what was *pressed since the last frame*. Reading an
    // edge-triggered action off the held set drops any press shorter than one
    // frame — which at three frames a second is most of them.
    const held = new Set<string>();
    const pressed = new Set<string>();
    // Tactical shifts accumulate rather than joining the press set: two taps
    // inside one frame are two shifts, and a Set would collapse them to one.
    let pendingTactic = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.repeat) {
        pressed.add(e.code);
        if (e.code === 'BracketRight') pendingTactic += 1;
        if (e.code === 'BracketLeft') pendingTactic -= 1;
      }
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

      // Tactics on the d-pad. The pad has no event stream, so its buttons are
      // still latched; the keyboard uses the press set.
      const padUp = pad?.buttons[12]?.pressed ?? false;
      const padDown = pad?.buttons[13]?.pressed ?? false;
      if (padUp && !tacticLatch) pendingTactic += 1;
      if (padDown && !tacticLatch) pendingTactic -= 1;
      tacticLatch = padUp || padDown;

      // One step per frame, keeping the rest queued for the frames after.
      const tactic: -1 | 0 | 1 = pendingTactic > 0 ? 1 : pendingTactic < 0 ? -1 : 0;
      pendingTactic -= tactic;

      // Shot modifiers: a bumper held with the shoot button picks the type,
      // the way every football game does it. Modifiers are held, not pressed.
      const finesse = held.has('KeyU') || (pad?.buttons[5]?.pressed ?? false);
      const power = held.has('KeyO') || (pad?.buttons[4]?.pressed ?? false);

      const intent: Intent = {
        moveX,
        moveZ,
        pass: pressed.has('KeyJ') || (pad?.buttons[2]?.pressed ?? false),
        shoot: pressed.has('KeyK') || (pad?.buttons[3]?.pressed ?? false),
        shotType: finesse ? 'finesse' : power ? 'power' : 'driven',
        sprint: held.has('ShiftLeft') || ((pad?.buttons[7]?.value ?? 0) > 0.5),
        switchPlayer: pressed.has('Space') || (pad?.buttons[0]?.pressed ?? false),
        tacticShift: tactic,
      };

      pressed.clear();
      return intent;
    }

    // ---- Loop ---------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let sinceSample = 0;
    let primed = false;
    let elapsed = 0;
    let previousGoals = state.score[0] + state.score[1];
    let lastShotAt = -1;

    // Actions are edge-triggered: holding pass must not fire every tick.
    let passLatch = false;
    let shootLatch = false;
    let switchLatch = false;
    let tacticLatch = false;

    function frame(now: number) {
      const frameTime = Math.min(0.25, (now - last) / 1000);
      last = now;
      elapsed += frameTime;

      const stageNow = stageRef.current;

      // ---- Replay --------------------------------------------------
      if (stageNow === 'replay' && replay) {
        replay.advance(frameTime);
        const current = replay.current();
        if (current) scene.renderReplay(current, frameTime, elapsed, replay.progress);
        if (replay.done) {
          replay = null;
          scene.endReplay();
          buffer.clear();
          stageRef.current = 'playing';
          setStage('playing');
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      // ---- Pre-match beats -----------------------------------------
      // The walkout and team sheet cover the screen completely and nothing on
      // the pitch is moving, so the scene is drawn once to prime it and then
      // left alone. Redrawing behind an opaque card is pure waste, and it
      // starves the presentation's own animations of the main thread at
      // exactly the moment they need it.
      if (stageNow === 'walkout' || stageNow === 'teamsheet') {
        accumulator = 0;
        if (!primed) {
          primed = true;
          scene.render(state, frameTime, elapsed);
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      // The simulation is frozen until the walkout and team sheet are done.
      if (stageNow === 'playing') {
        accumulator += frameTime;
        const raw = readIntent();
        let tacticApplied = false;

        while (accumulator >= TICK) {
          // Every edge-triggered action is latched to the first tick of the
          // frame. More than one fixed tick runs per frame at any frame rate
          // below 60, so an unlatched action fires once per tick — a single
          // d-pad press ran the whole mentality scale in one frame.
          const intent: Intent = {
            ...raw,
            pass: raw.pass && !passLatch,
            shoot: raw.shoot && !shootLatch,
            switchPlayer: raw.switchPlayer && !switchLatch,
            tacticShift: tacticApplied ? 0 : raw.tacticShift,
          };
          passLatch = raw.pass;
          shootLatch = raw.shoot;
          switchLatch = raw.switchPlayer;
          if (raw.tacticShift !== 0) tacticApplied = true;

          step(state, intent);
          accumulator -= TICK;
        }

        buffer.record(state, frameTime);
      }

      // A power shot punches the camera, which is most of what makes one feel
      // different from a placed finish.
      const shot = state.lastShot;
      if (shot && shot.at !== lastShotAt) {
        lastShotAt = shot.at;
        if (shot.type === 'power') scene.shake(0.55, 0.28);
      }

      // A goal cuts to the replay, the way a broadcast does.
      const goals = state.score[0] + state.score[1];
      if (goals !== previousGoals) {
        previousGoals = goals;
        scene.shake(0.9, 0.5);
        if (buffer.seconds > 1.5) {
          replay = new ReplayPlayer(buffer.takeLast(REPLAY_SECONDS), REPLAY_SPEED);
          stageRef.current = 'replay';
          setStage('replay');
        }
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
  const showHud = stage === 'playing' && snapshot;

  return (
    <div className="match">
      <canvas ref={canvasRef} className="match__canvas" />

      {showHud && (
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
          {...(reward ? { reward } : {})}
        />
      )}

      {stage === 'replay' && <ReplayChrome />}

      {stage === 'walkout' && (
        <Walkout
          home={home}
          away={away}
          competition={competition}
          venue={`${home.stadium.name} · ${home.stadium.capacity.toLocaleString('en-GB')}`}
          onSkip={advance}
        />
      )}

      {stage === 'teamsheet' && (
        <TeamSheet
          home={home}
          away={away}
          homeEleven={homeEleven}
          awayEleven={awayEleven}
          onSkip={advance}
        />
      )}
    </div>
  );
}

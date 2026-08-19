import * as THREE from 'three';
import { buildPitch, buildStadium, PITCH_LENGTH, PITCH_WIDTH } from './pitch';
import { createGradePass } from './grade';
import { BroadcastCamera, type CameraSettings } from './camera';
import { tokenRGB } from '@/ui/tokens/read';
import type { MatchState } from '@/sim/match';
import type { ReplayFrame } from '@/sim/replay';
import type { ClubColours } from '@/world/colour';
import {
  guessTier,
  lower,
  QualityGovernor,
  settingsFor,
  type Quality,
} from './quality';
import { PlayerFigures, PLAYER_HEIGHT } from './player';

/**
 * Assembles the match renderer: pitch, stadium, floodlights, players, ball,
 * and the broadcast grade on top. Owns no game logic — it reads a MatchState
 * each frame and draws it.
 */

export type TimeOfDay = 'Day' | 'Dusk' | 'Night';

export interface SceneOptions {
  camera: CameraSettings;
  timeOfDay: TimeOfDay;
  grain: number;
  dof: number;
  homeColours: ClubColours;
  awayColours: ClubColours;
  /** Overrides the automatic tier. Left unset, the device decides. */
  tier?: Quality['tier'];
}

export class MatchScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly broadcast: BroadcastCamera;
  private readonly grade: ReturnType<typeof createGradePass>;

  private figures!: PlayerFigures;
  private quality: Quality;
  private readonly governor = new QualityGovernor();
  private key: THREE.DirectionalLight | null = null;
  private readonly indicators: THREE.Mesh[] = [];
  private ball!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly ballVelocity = new THREE.Vector3();
  private readonly ballPosition = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private options: SceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // the grade pass softens edges; MSAA is wasted cost
      powerPreference: 'high-performance',
    });
    this.quality = settingsFor(options.tier ?? guessTier(), window.devicePixelRatio);
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;

    this.broadcast = new BroadcastCamera(options.camera);
    this.grade = createGradePass(this.renderer, { near: 0.5, far: 400 });

    this.buildWorld();
    this.applyLighting(options.timeOfDay);
    this.applyGrade();
    this.resize();
  }

  private buildWorld() {
    const pitch = buildPitch();
    const stadium = buildStadium(3, this.quality.crowd);
    this.scene.add(pitch.group, stadium.group);
    this.disposables.push(pitch, stadium);

    const kits: [ClubColours, ClubColours] = [
      this.options.homeColours,
      this.options.awayColours,
    ];

    this.figures = new PlayerFigures(22, kits, this.quality.detail);
    for (const group of this.figures.groups) this.scene.add(group);
    this.disposables.push(this.figures);

    const indicatorGeo = new THREE.ConeGeometry(0.34, 0.5, 3);
    this.disposables.push(indicatorGeo);

    for (let i = 0; i < 22; i += 1) {
      const team = i < 11 ? 0 : 1;

      // The team-coloured triangle above the controlled player's head.
      const indicatorMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(kits[team]!.primary),
        transparent: true,
        depthTest: false,
      });
      this.disposables.push(indicatorMat);
      const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
      indicator.rotation.x = Math.PI; // point down at the player
      indicator.renderOrder = 4;
      indicator.visible = false;
      this.scene.add(indicator);
      this.indicators.push(indicator);
    }

    const ballGeo = new THREE.SphereGeometry(0.11, 18, 14);
    const ballMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...tokenRGB('--ball-base')),
      roughness: 0.35,
      metalness: 0.02,
    });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.disposables.push(ballGeo, ballMat);

    // A contact shadow under the ball, so a lofted ball reads as airborne.
    const shadowGeo = new THREE.CircleGeometry(0.16, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...tokenRGB('--fc-void')),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.02;
    this.scene.add(this.ballShadow);
    this.disposables.push(shadowGeo, shadowMat);
  }

  private applyLighting(time: TimeOfDay) {
    // Clear anything from a previous time of day.
    for (const child of [...this.scene.children]) {
      if (child instanceof THREE.Light) this.scene.remove(child);
    }

    const night = time === 'Night';
    const dusk = time === 'Dusk';

    const skyColour = night ? '--sky-night' : dusk ? '--sky-dusk' : '--sky-day';
    this.scene.background = new THREE.Color(...tokenRGB(skyColour));
    this.scene.fog = new THREE.FogExp2(
      new THREE.Color(...tokenRGB(skyColour)).getHex(),
      night ? 0.0035 : 0.0026,
    );

    const ambient = new THREE.HemisphereLight(
      new THREE.Color(...tokenRGB(night ? '--light-sky-night' : '--light-sky-day')),
      new THREE.Color(...tokenRGB('--light-ground')),
      night ? 1.5 : 2.4,
    );
    this.scene.add(ambient);

    // Key light. At night this is the floodlight bank: cool, high and hard.
    const key = new THREE.DirectionalLight(
      new THREE.Color(...tokenRGB(night ? '--light-key-night' : '--light-key-day')),
      night ? 4.6 : 5.2,
    );
    key.position.set(night ? -40 : 52, 62, night ? 44 : 34);
    key.castShadow = this.quality.shadows;
    key.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 190;
    const extent = PITCH_LENGTH * 0.62;
    key.shadow.camera.left = -extent;
    key.shadow.camera.right = extent;
    key.shadow.camera.top = PITCH_WIDTH * 0.85;
    key.shadow.camera.bottom = -PITCH_WIDTH * 0.85;
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    this.key = key;

    // Rim light from the opposite corner: the hard shoulder edge that makes
    // players read against the crowd.
    const rim = new THREE.DirectionalLight(
      new THREE.Color(...tokenRGB('--light-rim')),
      night ? 2.3 : 1.4,
    );
    rim.position.set(-46, 36, -40);
    this.scene.add(rim);

    // A real rig lights from both touchlines. Without the fill, everything
    // facing the far side falls into silhouette.
    const fill = new THREE.DirectionalLight(
      new THREE.Color(...tokenRGB(night ? '--light-key-night' : '--light-sky-day')),
      night ? 1.8 : 1.2,
    );
    fill.position.set(24, 48, -58);
    this.scene.add(fill);
  }

  private applyGrade() {
    const night = this.options.timeOfDay === 'Night';
    const u = this.grade.uniforms;
    u.uGrain.value = (this.options.grain / 20) * 0.075;
    u.uDofStrength.value = (this.options.dof / 20) * 1.15;
    u.uBloom.value = night ? 0.75 : 0.34;
    u.uVignette.value = 0.95;
    u.uSaturation.value = night ? 1.12 : 1.06;
    if (night) {
      u.uLift.value.set(0.014, 0.02, 0.036);
      u.uGain.value.set(1.02, 1.0, 0.985);
    } else {
      u.uLift.value.set(0.008, 0.012, 0.02);
      u.uGain.value.set(1.04, 1.01, 0.97);
    }
  }

  setOptions(options: SceneOptions) {
    const timeChanged = options.timeOfDay !== this.options.timeOfDay;
    this.options = options;
    this.broadcast.setSettings(options.camera);
    if (timeChanged) this.applyLighting(options.timeOfDay);
    this.applyGrade();
  }

  resize() {
    const width = this.canvas.clientWidth || 1920;
    const height = this.canvas.clientHeight || 1080;
    this.renderer.setSize(width, height, false);
    this.broadcast.setAspect(width / height);
    this.grade.setSize(width, height, this.renderer.getPixelRatio());
  }

  /** Screen-space position of a world point, in 0–1 viewport coordinates. */
  project(point: THREE.Vector3): { x: number; y: number } {
    const v = point.clone().project(this.broadcast.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  shake(amount: number, seconds: number) {
    this.broadcast.shake(amount, seconds);
  }

  /**
   * Draws a recorded frame instead of live state: same pitch, same players,
   * but a cinematic camera and no indicator. Used for goal replays.
   */
  renderReplay(frame: ReplayFrame, dt: number, elapsed: number, progress: number) {
    const count = Math.floor(frame.players.length / 4);
    for (let i = 0; i < count; i += 1) {
      this.figures.update(
        i,
        frame.players[i * 4] ?? 0,
        frame.players[i * 4 + 1] ?? 0,
        frame.players[i * 4 + 2] ?? 0,
        frame.players[i * 4 + 3] ?? 0,
        dt,
      );
    }
    // A replay is footage, not gameplay — the interface markers come off.
    for (const indicator of this.indicators) indicator.visible = false;

    this.ballPosition.set(frame.ballX, frame.ballY + 0.11, frame.ballZ);
    this.ballVelocity.set(frame.ballVX, 0, frame.ballVZ);
    this.ball.position.copy(this.ballPosition);
    this.ballShadow.position.set(frame.ballX, 0.02, frame.ballZ);
    this.ballShadow.scale.setScalar(1 + Math.max(0, frame.ballY) * 0.4);

    this.broadcast.updateCinematic(dt, this.ballPosition, progress);
    // A long lens wide open: replays sit shallower than live play.
    this.grade.uniforms.uFocusDistance.value = this.broadcast.focusDistance;
    this.grade.uniforms.uFocusRange.value = 7;
    this.grade.uniforms.uTime.value = elapsed;

    this.draw();
  }

  /** Restores the live-play depth of field after a replay. */
  endReplay() {
    this.grade.uniforms.uFocusRange.value = 14;
    this.broadcast.endCinematic();
  }

  private draw() {
    this.renderer.setRenderTarget(this.grade.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.broadcast.camera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.grade.scene, this.grade.camera);
  }

  /**
   * Steps the tier down when frames have been costing too much.
   *
   * Only the two levers that can change without rebuilding the scene are
   * touched: pixel count and shadows. Player geometry and crowd density are
   * decided once, because rebuilding them mid-match would cost a bigger hitch
   * than the frames it saves.
   */
  private adapt(dt: number) {
    if (!this.governor.sample(dt)) return;

    const next = lower(this.quality.tier);
    if (next === null) return;

    this.quality = settingsFor(next, window.devicePixelRatio);
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    if (this.key) {
      this.key.castShadow = this.quality.shadows;
      this.key.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
      // The old map is stale at the new size; dropping it forces a rebuild.
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.resize();
  }

  /** What the renderer settled on, for the settings screen to report. */
  get tier(): Quality['tier'] {
    return this.quality.tier;
  }

  render(state: MatchState, dt: number, elapsed: number) {
    this.adapt(dt);

    // ---- Sync the scene to the simulation -------------------------------
    state.players.forEach((p, i) => {
      this.figures.update(i, p.x, p.z, p.vx, p.vz, dt);

      const indicator = this.indicators[i];
      if (!indicator) return;
      const controlled = i === state.controlledIndex;
      indicator.visible = controlled;
      if (controlled) {
        indicator.position.set(p.x, PLAYER_HEIGHT + 0.62, p.z);
        // Player Indicator Fade: dims as stamina drains.
        const material = indicator.material as THREE.MeshBasicMaterial;
        material.opacity = 0.2 + (p.stamina / 100) * 0.8;
      }
    });

    this.ballPosition.set(state.ball.x, state.ball.y + 0.11, state.ball.z);
    this.ballVelocity.set(state.ball.vx, 0, state.ball.vz);
    this.ball.position.copy(this.ballPosition);
    this.ball.rotation.x += state.ball.vz * dt * 1.6;
    this.ball.rotation.z -= state.ball.vx * dt * 1.6;

    this.ballShadow.position.set(state.ball.x, 0.02, state.ball.z);
    const lift = Math.max(0, state.ball.y);
    this.ballShadow.scale.setScalar(1 + lift * 0.4);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.06, 0.34 - lift * 0.05);

    // ---- Camera ----------------------------------------------------------
    this.broadcast.update(dt, this.ballPosition, this.ballVelocity);
    this.grade.uniforms.uFocusDistance.value = this.broadcast.focusDistance;
    this.grade.uniforms.uTime.value = elapsed;

    // ---- Draw ------------------------------------------------------------
    this.draw();
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    this.grade.dispose();
    this.renderer.dispose();
  }
}

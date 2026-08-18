import * as THREE from 'three';
import { buildPitch, buildStadium, PITCH_LENGTH, PITCH_WIDTH } from './pitch';
import { createGradePass } from './grade';
import { BroadcastCamera, type CameraSettings } from './camera';
import { tokenRGB } from '@/ui/tokens/read';
import type { MatchState } from '@/sim/match';

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
  homeColours: { primary: string; secondary: string };
  awayColours: { primary: string; secondary: string };
}

const PLAYER_HEIGHT = 1.82;

export class MatchScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly broadcast: BroadcastCamera;
  private readonly grade: ReturnType<typeof createGradePass>;

  private readonly players: THREE.Mesh[] = [];
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
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
    const stadium = buildStadium();
    this.scene.add(pitch.group, stadium.group);
    this.disposables.push(pitch, stadium);

    // Players are capsules. At broadcast distance under depth of field, a
    // capsule with the right silhouette and the right kit colour is
    // indistinguishable from a rigged model — and it leaves the frame budget
    // for the grade, which is what actually sells the look.
    const bodyGeo = new THREE.CapsuleGeometry(0.30, PLAYER_HEIGHT - 0.9, 4, 10);
    this.disposables.push(bodyGeo);

    const kits = [this.options.homeColours, this.options.awayColours];
    const materials = kits.map((kit) => {
      // A shirt under a floodlight rig reads brighter and more saturated than
      // the flat crest colour, and two mid-tone kits are otherwise impossible
      // to tell apart on the pitch even when their hues differ.
      const colour = new THREE.Color(kit.primary);
      const hsl = { h: 0, s: 0, l: 0 };
      colour.getHSL(hsl);
      colour.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.min(0.72, hsl.l * 1.55 + 0.12));

      const material = new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.72,
        metalness: 0.02,
      });
      this.disposables.push(material);
      return material;
    });

    const indicatorGeo = new THREE.ConeGeometry(0.34, 0.5, 3);
    this.disposables.push(indicatorGeo);

    for (let i = 0; i < 22; i += 1) {
      const team = i < 11 ? 0 : 1;
      const player = new THREE.Mesh(bodyGeo, materials[team]);
      player.castShadow = true;
      player.position.set(0, PLAYER_HEIGHT / 2, 0);
      player.visible = false;
      this.scene.add(player);
      this.players.push(player);

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
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 190;
    const extent = PITCH_LENGTH * 0.62;
    key.shadow.camera.left = -extent;
    key.shadow.camera.right = extent;
    key.shadow.camera.top = PITCH_WIDTH * 0.85;
    key.shadow.camera.bottom = -PITCH_WIDTH * 0.85;
    key.shadow.bias = -0.0012;
    this.scene.add(key);

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

  render(state: MatchState, dt: number, elapsed: number) {
    // ---- Sync the scene to the simulation -------------------------------
    state.players.forEach((p, i) => {
      const mesh = this.players[i];
      if (!mesh) return;
      mesh.visible = true;
      mesh.position.set(p.x, PLAYER_HEIGHT / 2, p.z);
      // Lean into the run, and face the direction of travel.
      const speed = Math.hypot(p.vx, p.vz);
      mesh.rotation.y = Math.atan2(p.vx, p.vz);
      mesh.rotation.x = Math.min(0.2, speed * 0.022);

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
    this.renderer.setRenderTarget(this.grade.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.broadcast.camera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.grade.scene, this.grade.camera);
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    this.grade.dispose();
    this.renderer.dispose();
  }
}

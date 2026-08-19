import * as THREE from 'three';
import { PITCH_LENGTH, PITCH_WIDTH } from './pitch';

/**
 * Broadcast cameras — PROMPT.md §5.
 *
 * The defining behaviour is not the position, it is the *lag*: a real camera
 * operator leads the ball slightly on a break and trails it on a turn, and the
 * rig has a little unavoidable float. Both are modelled here, because a camera
 * that tracks the ball perfectly is the single clearest tell that you are
 * looking at a video game rather than a match.
 */

export type CameraPreset = 'Tele' | 'Tele Broadcast' | 'Co-op' | 'Tactical' | 'Pro';

interface PresetSpec {
  /** Metres above the pitch at Height 10. */
  height: number;
  /** Metres back from the touchline at Zoom 10. */
  distance: number;
  /** How far the camera slides laterally to follow the ball, 0–1. */
  follow: number;
  /** Look-at point raised off the turf, in metres. */
  aim: number;
  fov: number;
  /** Seconds of lag before the camera catches the ball. */
  damping: number;
  /** How far ahead of the ball's velocity the camera leads, in seconds. */
  lead: number;
}

const PRESETS: Record<CameraPreset, PresetSpec> = {
  Tele: { height: 21, distance: 46, follow: 0.62, aim: 0, fov: 26, damping: 0.42, lead: 0.5 },
  'Tele Broadcast': { height: 17, distance: 40, follow: 0.7, aim: 1.2, fov: 30, damping: 0.36, lead: 0.62 },
  'Co-op': { height: 31, distance: 52, follow: 0.5, aim: 0, fov: 30, damping: 0.5, lead: 0.4 },
  Tactical: { height: 38, distance: 44, follow: 0.42, aim: 0, fov: 34, damping: 0.55, lead: 0.32 },
  Pro: { height: 9, distance: 22, follow: 0.9, aim: 1.6, fov: 42, damping: 0.22, lead: 0.8 },
};

export interface CameraSettings {
  preset: CameraPreset;
  /** 0–20 sliders, matching the settings screen. */
  height: number;
  zoom: number;
  swing: number;
}

export class BroadcastCamera {
  readonly camera: THREE.PerspectiveCamera;

  private readonly target = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lead = new THREE.Vector3();
  private shakeUntil = 0;
  private shakeAmount = 0;
  private elapsed = 0;
  private cinematicStart: number | null = null;

  constructor(private settings: CameraSettings, aspect = 16 / 9) {
    const spec = PRESETS[settings.preset];
    this.camera = new THREE.PerspectiveCamera(spec.fov, aspect, 0.5, 400);
    this.position.set(0, spec.height, spec.distance);
    this.camera.position.copy(this.position);
  }

  setSettings(settings: CameraSettings) {
    this.settings = settings;
    this.camera.fov = PRESETS[settings.preset].fov;
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Punch the camera — used on power shots and goals. */
  shake(amount: number, seconds: number) {
    this.shakeAmount = amount;
    this.shakeUntil = this.elapsed + seconds;
  }

  /** Distance from the camera to whatever it is looking at, for the DOF pass. */
  get focusDistance(): number {
    return this.camera.position.distanceTo(this.lookAt);
  }

  /**
   * Replay camera: low, close, and slowly arcing around the ball. Broadcast
   * replays are shot from a different rig to the live feed, and matching that
   * change of viewpoint is most of what makes a replay read as a replay.
   */
  updateCinematic(dt: number, ball: THREE.Vector3, progress: number) {
    this.elapsed += dt;
    if (this.cinematicStart === null) {
      this.cinematicStart = Math.atan2(
        this.camera.position.z - ball.z,
        this.camera.position.x - ball.x,
      );
    }

    // A quarter turn across the clip, so the arc is felt rather than noticed.
    const angle = this.cinematicStart + progress * Math.PI * 0.5;
    const radius = 26 - progress * 8;
    const height = 6.5 - progress * 2.4;

    this.desired.set(ball.x + Math.cos(angle) * radius, height, ball.z + Math.sin(angle) * radius);
    const k = 1 - Math.exp(-dt / 0.18);
    this.position.lerp(this.desired, k);
    this.camera.position.copy(this.position);

    this.lookAt.lerp(new THREE.Vector3(ball.x, Math.max(0.6, ball.y), ball.z), k);
    this.camera.lookAt(this.lookAt);

    // A tighter lens than the live feed.
    if (this.camera.fov !== 34) {
      this.camera.fov = 34;
      this.camera.updateProjectionMatrix();
    }
  }

  endCinematic() {
    this.cinematicStart = null;
    this.camera.fov = PRESETS[this.settings.preset].fov;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, ball: THREE.Vector3, ballVelocity: THREE.Vector3) {
    this.elapsed += dt;
    const spec = PRESETS[this.settings.preset];

    // Sliders are 0–20 with 10 as the preset's own value.
    const heightScale = 0.55 + (this.settings.height / 20) * 0.9;
    const zoomScale = 1.35 - (this.settings.zoom / 20) * 0.7;
    const swing = spec.follow * (0.4 + (this.settings.swing / 20) * 1.2);

    // Lead the ball along its own velocity — the operator's anticipation.
    this.lead.copy(ballVelocity).multiplyScalar(spec.lead);
    this.target.set(ball.x + this.lead.x, 0, ball.z + this.lead.z);

    // The camera slides along the touchline rather than orbiting.
    const clampX = PITCH_LENGTH * 0.42;
    this.desired.set(
      THREE.MathUtils.clamp(this.target.x * swing, -clampX, clampX),
      spec.height * heightScale,
      spec.distance * zoomScale,
    );

    // Critically damped follow: fast enough to keep up, slow enough to lag.
    const k = 1 - Math.exp(-dt / Math.max(0.016, spec.damping));
    this.position.lerp(this.desired, k);

    // A few centimetres of handheld float. Small, but its absence is loud.
    const float = Math.sin(this.elapsed * 0.7) * 0.06 + Math.sin(this.elapsed * 1.9) * 0.03;

    let shakeX = 0;
    let shakeY = 0;
    if (this.elapsed < this.shakeUntil) {
      const remaining = (this.shakeUntil - this.elapsed) / 0.5;
      const strength = this.shakeAmount * Math.min(1, remaining);
      shakeX = (Math.random() - 0.5) * strength;
      shakeY = (Math.random() - 0.5) * strength;
    }

    this.camera.position.set(
      this.position.x + shakeX,
      this.position.y + float + shakeY,
      this.position.z,
    );

    // Look at a point between the ball and the pitch centre, so the far side
    // of the pitch stays in frame instead of swinging out of it.
    this.lookAt.lerp(
      new THREE.Vector3(
        THREE.MathUtils.clamp(this.target.x, -PITCH_LENGTH / 2, PITCH_LENGTH / 2) * 0.92,
        spec.aim,
        THREE.MathUtils.clamp(this.target.z, -PITCH_WIDTH / 2, PITCH_WIDTH / 2) * 0.3,
      ),
      k,
    );
    this.camera.lookAt(this.lookAt);
  }
}

import * as THREE from 'three';
import { tokenRGB } from '@/ui/tokens/read';
import type { ClubColours } from '@/world/colour';

/**
 * The players.
 *
 * These were capsules, on the argument that at broadcast distance under depth
 * of field a capsule with the right silhouette reads the same as a rigged
 * model. That holds for a still frame and falls apart in motion: a capsule
 * slides, and sliding is the single thing that most says "not football". A
 * figure with legs that swing reads as running even when it is eight pixels
 * tall.
 *
 * Everything is built from four shared geometries and three materials per
 * team, so twenty-two players cost twenty-two groups rather than twenty-two
 * copies of anything.
 */

export const PLAYER_HEIGHT = 1.82;

/** Proportions, in metres. A slightly large head reads better at distance. */
const LEG_LENGTH = 0.82;
const LEG_RADIUS = 0.085;
/** How much of the leg the sock covers, from the ankle up. */
const SOCK_LENGTH = 0.3;
const SHORTS_HEIGHT = 0.26;
const TORSO_HEIGHT = 0.56;
const TORSO_RADIUS = 0.19;
const ARM_LENGTH = 0.58;
const ARM_RADIUS = 0.058;
const HEAD_RADIUS = 0.125;

/** Skin tones, so a squad does not look like one person twenty-two times. */
const SKIN_TOKENS = ['--skin-1', '--skin-2', '--skin-3', '--skin-4', '--skin-5', '--skin-6'];

interface Limb {
  pivot: THREE.Group;
}

interface Figure {
  group: THREE.Group;
  lean: THREE.Group;
  legs: [Limb, Limb];
  arms: [Limb, Limb];
  /** Where in the run cycle this player is, in radians. */
  phase: number;
}

export class PlayerFigures {
  readonly groups: THREE.Group[] = [];
  private readonly figures: Figure[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(
    count: number,
    kits: [ClubColours, ClubColours],
    /** How much geometry to spend. Phones get the cheaper build. */
    detail: 'full' | 'low' = 'full',
  ) {
    const segments = detail === 'full' ? 8 : 4;
    const rings = detail === 'full' ? 6 : 3;

    const legGeo = new THREE.CapsuleGeometry(LEG_RADIUS, LEG_LENGTH - LEG_RADIUS * 2, 2, segments);
    const sockGeo = new THREE.CapsuleGeometry(
      LEG_RADIUS * 1.06,
      SOCK_LENGTH - LEG_RADIUS,
      2,
      segments,
    );
    const armGeo = new THREE.CapsuleGeometry(ARM_RADIUS, ARM_LENGTH - ARM_RADIUS * 2, 2, segments);
    const torsoGeo = new THREE.CapsuleGeometry(
      TORSO_RADIUS,
      TORSO_HEIGHT - TORSO_RADIUS,
      2,
      segments + 2,
    );
    const shortsGeo = new THREE.CapsuleGeometry(
      TORSO_RADIUS * 0.94,
      SHORTS_HEIGHT - TORSO_RADIUS * 0.6,
      2,
      segments + 2,
    );
    const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, segments + 2, rings);
    this.disposables.push(legGeo, sockGeo, armGeo, torsoGeo, shortsGeo, headGeo);

    // A limb hangs below its pivot, so rotating the pivot swings it from the
    // hip or the shoulder rather than around its own middle.
    legGeo.translate(0, -LEG_LENGTH / 2, 0);
    sockGeo.translate(0, -LEG_LENGTH + SOCK_LENGTH / 2, 0);
    armGeo.translate(0, -ARM_LENGTH / 2, 0);

    const kitMaterials = kits.map((kit) => this.materialsFor(kit));
    const skins = SKIN_TOKENS.map((name) => {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(...tokenRGB(name)),
        roughness: 0.85,
        metalness: 0,
      });
      this.disposables.push(material);
      return material;
    });

    for (let i = 0; i < count; i += 1) {
      const team = i < count / 2 ? 0 : 1;
      const kit = kitMaterials[team]!;
      const skin = skins[i % skins.length]!;

      const group = new THREE.Group();
      // Lean is applied to an inner group so it tips the whole body from the
      // feet, and does not fight the facing rotation on the outer one.
      const lean = new THREE.Group();
      group.add(lean);

      const legs = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.105, LEG_LENGTH, 0);

        const bare = new THREE.Mesh(legGeo, skin);
        bare.castShadow = true;
        pivot.add(bare);

        // The sock swings with the leg, which is why it is a child of the
        // pivot rather than a band painted on a static mesh.
        const sock = new THREE.Mesh(sockGeo, kit.socks);
        sock.castShadow = detail === 'full';
        pivot.add(sock);

        lean.add(pivot);
        return { pivot };
      }) as [Limb, Limb];

      const shorts = new THREE.Mesh(shortsGeo, kit.shorts);
      shorts.castShadow = true;
      shorts.position.y = LEG_LENGTH + SHORTS_HEIGHT * 0.28;
      lean.add(shorts);

      const torso = new THREE.Mesh(torsoGeo, kit.shirt);
      torso.castShadow = true;
      torso.position.y = LEG_LENGTH + SHORTS_HEIGHT * 0.5 + TORSO_HEIGHT / 2;
      lean.add(torso);

      const arms = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(
          side * (TORSO_RADIUS + ARM_RADIUS * 0.6),
          LEG_LENGTH + SHORTS_HEIGHT * 0.5 + TORSO_HEIGHT * 0.86,
          0,
        );
        const mesh = new THREE.Mesh(armGeo, skin);
        mesh.castShadow = detail === 'full';
        pivot.add(mesh);
        lean.add(pivot);
        return { pivot };
      }) as [Limb, Limb];

      const head = new THREE.Mesh(headGeo, skin);
      head.castShadow = true;
      head.position.y = LEG_LENGTH + SHORTS_HEIGHT * 0.5 + TORSO_HEIGHT + HEAD_RADIUS + 0.02;
      lean.add(head);

      group.visible = false;
      this.groups.push(group);
      this.figures.push({ group, lean, legs, arms, phase: (i * 1.37) % (Math.PI * 2) });
    }
  }

  /**
   * Shirt, shorts and socks from one kit.
   *
   * Lifted in saturation and lightness the way the capsules were: a shirt
   * under a floodlight rig reads brighter than the flat crest colour, and two
   * mid-tone kits are otherwise impossible to tell apart on the pitch even
   * when their hues differ.
   */
  private materialsFor(kit: ClubColours) {
    const lift = (hex: string, amount = 1) => {
      const colour = new THREE.Color(hex);
      const hsl = { h: 0, s: 0, l: 0 };
      colour.getHSL(hsl);
      // Only dark colours are lifted. Applying the same multiplier to a light
      // one drove it to the ceiling, so every second colour came out white and
      // both sides played in white shorts whatever their kit said.
      const lit = hsl.l < 0.55 ? hsl.l * 1.5 + 0.12 : hsl.l;
      colour.setHSL(
        hsl.h,
        Math.min(1, hsl.s * 1.25),
        Math.max(0.1, Math.min(0.88, lit * amount)),
      );
      const material = new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.72,
        metalness: 0.02,
      });
      this.disposables.push(material);
      return material;
    };

    return {
      shirt: lift(kit.primary),
      // Shorts in the second colour and socks back in the first: that split is
      // what makes a kit read as a kit rather than a shirt on bare legs.
      shorts: lift(kit.secondary, 0.95),
      socks: lift(kit.primary, 0.92),
    };
  }

  /**
   * Poses one player.
   *
   * The run cycle is driven by distance covered rather than by time, so a
   * walking player takes slow strides and a sprinting one takes fast ones
   * without either being animated at a fixed rate.
   */
  update(index: number, x: number, z: number, vx: number, vz: number, dt: number) {
    const figure = this.figures[index];
    if (!figure) return;

    const speed = Math.hypot(vx, vz);
    figure.group.visible = true;
    figure.group.position.set(x, 0, z);
    if (speed > 0.05) figure.group.rotation.y = Math.atan2(vx, vz);

    // Stride length grows with speed but not linearly — a sprint is a longer
    // stride *and* a faster one, and both together overshoot badly.
    figure.phase += speed * dt * 2.6;
    const swing = Math.min(0.95, speed * 0.14);
    const stride = Math.sin(figure.phase) * swing;

    figure.legs[0].pivot.rotation.x = stride;
    figure.legs[1].pivot.rotation.x = -stride;
    // Arms counter the legs, and swing less.
    figure.arms[0].pivot.rotation.x = -stride * 0.7;
    figure.arms[1].pivot.rotation.x = stride * 0.7;

    // Lean into the run, and bob once per stride — twice per cycle, because
    // both feet push off.
    figure.lean.rotation.x = Math.min(0.22, speed * 0.024);
    figure.lean.position.y = Math.abs(Math.cos(figure.phase)) * Math.min(0.05, speed * 0.008);
  }

  hide(index: number) {
    const figure = this.figures[index];
    if (figure) figure.group.visible = false;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
  }
}

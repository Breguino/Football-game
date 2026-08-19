import * as THREE from 'three';
import { token, tokenRGB } from '@/ui/tokens/read';

/**
 * The pitch: mow stripes, markings, and a stadium bowl.
 *
 * Dimensions are in metres and match a real pitch (105 × 68), so camera
 * heights, player speeds and pass weights are all expressible in units a
 * football person would recognise.
 */

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;

const STRIPE_COUNT = 14;

/** Grass texture: mow stripes with a little per-blade noise baked in. */
function grassTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const light = token('--pitch-stripe-light');
  const dark = token('--pitch-stripe-dark');

  const stripeWidth = size / STRIPE_COUNT;
  for (let i = 0; i < STRIPE_COUNT; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? light : dark;
    ctx.fillRect(i * stripeWidth, 0, stripeWidth + 1, size);
  }

  // Mow direction leaves fine banding within each stripe; without it the
  // grass reads as flat colour under the broadcast camera.
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = token('--fc-void');
  for (let y = 0; y < size; y += 3) {
    if ((y / 3) % 2 === 0) continue;
    ctx.fillRect(0, y, size, 1);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** White line markings, drawn once into a transparent overlay texture. */
function markingsTexture(): THREE.CanvasTexture {
  // 8 px per metre gives crisp lines without a huge texture.
  const scale = 8;
  const w = PITCH_LENGTH * scale;
  const h = PITCH_WIDTH * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.strokeStyle = token('--pitch-line');
  ctx.lineWidth = 0.12 * scale;

  const m = (x: number) => x * scale;
  const inset = m(0.5);

  // Touchlines and halfway.
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.beginPath();
  ctx.moveTo(w / 2, inset);
  ctx.lineTo(w / 2, h - inset);
  ctx.stroke();

  // Centre circle and spot.
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, m(9.15), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = token('--pitch-line');
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, m(0.2), 0, Math.PI * 2);
  ctx.fill();

  // Boxes, six-yard areas, penalty spots and the D, both ends.
  for (const side of [0, 1]) {
    const x0 = side === 0 ? inset : w - inset;
    const dir = side === 0 ? 1 : -1;

    ctx.strokeRect(
      Math.min(x0, x0 + dir * m(16.5)),
      h / 2 - m(20.16),
      m(16.5),
      m(40.32),
    );
    ctx.strokeRect(
      Math.min(x0, x0 + dir * m(5.5)),
      h / 2 - m(9.16),
      m(5.5),
      m(18.32),
    );

    const spot = x0 + dir * m(11);
    ctx.beginPath();
    ctx.arc(spot, h / 2, m(0.2), 0, Math.PI * 2);
    ctx.fill();

    // The arc outside the box.
    ctx.beginPath();
    ctx.arc(
      spot,
      h / 2,
      m(9.15),
      side === 0 ? -Math.PI * 0.29 : Math.PI * 0.71,
      side === 0 ? Math.PI * 0.29 : Math.PI * 1.29,
    );
    ctx.stroke();
  }

  // Corner arcs.
  for (const [cx, cy, start] of [
    [inset, inset, 0],
    [w - inset, inset, Math.PI * 0.5],
    [w - inset, h - inset, Math.PI],
    [inset, h - inset, Math.PI * 1.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, m(1), start, start + Math.PI * 0.5);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export interface PitchBuild {
  group: THREE.Group;
  dispose: () => void;
}

export function buildPitch(): PitchBuild {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const grass = grassTexture();
  const markings = markingsTexture();
  disposables.push(grass, markings);

  // Turf runs past the touchlines so the camera never sees an edge.
  const surfaceGeo = new THREE.PlaneGeometry(PITCH_LENGTH + 16, PITCH_WIDTH + 12);
  const surfaceMat = new THREE.MeshStandardMaterial({
    map: grass,
    roughness: 0.92,
    metalness: 0,
  });
  grass.wrapS = THREE.RepeatWrapping;
  grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(1, 1);

  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  group.add(surface);
  disposables.push(surfaceGeo, surfaceMat);

  const lineGeo = new THREE.PlaneGeometry(PITCH_LENGTH, PITCH_WIDTH);
  const lineMat = new THREE.MeshBasicMaterial({
    map: markings,
    transparent: true,
    depthWrite: false,
  });
  const lines = new THREE.Mesh(lineGeo, lineMat);
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.012;
  group.add(lines);
  disposables.push(lineGeo, lineMat);

  // Goals.
  const postMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...tokenRGB('--pitch-goal')),
    roughness: 0.4,
    metalness: 0.1,
  });
  disposables.push(postMat);

  for (const side of [-1, 1]) {
    const goal = new THREE.Group();
    const x = (side * PITCH_LENGTH) / 2;
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, GOAL_HEIGHT, 10);
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, GOAL_WIDTH, 10);
    disposables.push(postGeo, barGeo);

    for (const z of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, GOAL_HEIGHT / 2, z);
      post.castShadow = true;
      goal.add(post);
    }
    const bar = new THREE.Mesh(barGeo, postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, GOAL_HEIGHT, 0);
    bar.castShadow = true;
    goal.add(bar);

    // Net: a translucent panel rather than a mesh of strands. At broadcast
    // distance the difference is invisible and the cost is not.
    const netGeo = new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT);
    const netMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...tokenRGB('--pitch-net')),
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.rotation.y = Math.PI / 2;
    net.position.set(x + side * 1.6, GOAL_HEIGHT / 2, 0);
    goal.add(net);
    disposables.push(netGeo, netMat);

    group.add(goal);
  }

  return {
    group,
    dispose: () => {
      for (const item of disposables) item.dispose();
    },
  };
}

/** The stadium bowl: stands, a roof lip, and a crowd of instanced specks. */
export function buildStadium(seed = 3, crowdPerStand = 3400): PitchBuild {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const standMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...tokenRGB('--stadium-concrete')),
    roughness: 1,
    metalness: 0,
  });
  disposables.push(standMat);

  // The broadcast camera sits up to ~54m back on the near touchline, so the
  // stands have to start behind that or the camera renders from inside one.
  const halfL = PITCH_LENGTH / 2 + 20;
  const halfW = PITCH_WIDTH / 2 + 24;
  const standHeight = 16;
  const standDepth = 30;
  const rake = 0.42;

  // Four raked stands, each a box tilted back off the touchline.
  const sides: [number, number, number, number][] = [
    [0, halfW + standDepth / 2, PITCH_LENGTH + 24, 0],
    [0, -(halfW + standDepth / 2), PITCH_LENGTH + 24, Math.PI],
    [halfL + standDepth / 2, 0, PITCH_WIDTH + 20, -Math.PI / 2],
    [-(halfL + standDepth / 2), 0, PITCH_WIDTH + 20, Math.PI / 2],
  ];

  const crowdColours = [
    new THREE.Color(...tokenRGB('--crowd-a')),
    new THREE.Color(...tokenRGB('--crowd-b')),
    new THREE.Color(...tokenRGB('--crowd-c')),
  ];

  let rand = seed * 7919;
  const next = () => {
    rand = (rand * 1103515245 + 12345) % 2147483648;
    return rand / 2147483648;
  };

  for (const [x, z, span, rotation] of sides) {
    // A raked wedge rather than a box: the seating rises away from the pitch,
    // which is what puts the crowd behind the players instead of above them.
    const geo = new THREE.BoxGeometry(span, standHeight, standDepth);
    const stand = new THREE.Mesh(geo, standMat);
    stand.position.set(x, standHeight / 2 - 4, z);
    stand.rotation.y = rotation;
    stand.rotation.x = -rake * 0.16;
    group.add(stand);
    disposables.push(geo);

    // Crowd: instanced specks raked up the stand face. Cheap, and under the
    // depth of field it reads exactly like a filled stadium.
    const perStand = crowdPerStand;
    const specGeo = new THREE.PlaneGeometry(0.62, 1.05);
    const specMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true });
    const crowd = new THREE.InstancedMesh(specGeo, specMat, perStand);
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();

    for (let i = 0; i < perStand; i += 1) {
      const across = (next() - 0.5) * span * 0.94;
      const up = next();
      // Seats climb and recede together, so the bank reads as raked. The rows
      // sit just proud of the stand's pitch-facing face — inside the box they
      // are invisible, which is exactly what an empty-looking bowl looks like.
      const height = up * standHeight * 0.95 + 1.0;
      const depth = -standDepth / 2 - 0.6 + up * standDepth * rake * 1.9;

      dummy.position.set(across, height, depth);
      // Facing the pitch, tilted back with the rake.
      dummy.rotation.set(-0.34, Math.PI, (next() - 0.5) * 0.26);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);

      const base = crowdColours[Math.floor(next() * crowdColours.length)]!;
      colour.copy(base).multiplyScalar(0.7 + next() * 0.6);
      crowd.setColorAt(i, colour);
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;

    const holder = new THREE.Group();
    holder.position.set(x, -3, z);
    holder.rotation.y = rotation;
    holder.add(crowd);
    group.add(holder);
    disposables.push(specGeo, specMat, crowd);
  }

  return {
    group,
    dispose: () => {
      for (const item of disposables) item.dispose();
    },
  };
}

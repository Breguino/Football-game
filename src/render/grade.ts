import * as THREE from 'three';

/**
 * The broadcast grade — PROMPT.md §5.
 *
 * A single full-screen pass doing depth of field, bloom, colour grade,
 * vignette and grain. Written by hand rather than pulled from a post-
 * processing library so the whole chain stays one shader and one draw call,
 * which matters for the 60fps-on-integrated-graphics target.
 *
 * The depth of field is a cheap approximation: a blur whose radius grows with
 * distance from the focus plane, sampled from the colour buffer with the depth
 * buffer as its weight. It is not a physically correct bokeh, but at broadcast
 * framing what sells the look is *that* the foreground and crowd go soft, not
 * the exact shape of the highlights.
 */

export const GRADE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GRADE_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2  uResolution;
  uniform float uTime;

  uniform float uNear;
  uniform float uFar;
  uniform float uFocusDistance;   // metres
  uniform float uFocusRange;      // metres either side that stay sharp
  uniform float uDofStrength;     // 0 = off
  uniform float uBloom;
  uniform float uGrain;
  uniform float uVignette;
  uniform vec3  uLift;            // shadow tint
  uniform vec3  uGain;            // highlight tint
  uniform float uSaturation;

  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 texel = 1.0 / uResolution;

    // ---- Depth of field ---------------------------------------------------
    float depth = linearDepth(vUv);
    float defocus = abs(depth - uFocusDistance);
    float coc = clamp((defocus - uFocusRange) / uFocusRange, 0.0, 1.0);
    coc = pow(coc, 0.75) * uDofStrength;

    vec3 colour = texture2D(tDiffuse, vUv).rgb;

    if (coc > 0.003) {
      // Eight taps on a rotated ring, scaled by the circle of confusion.
      vec3 sum = colour;
      float radius = coc * 9.0;
      float angle = hash(vUv * uResolution) * 6.2831853;
      for (int i = 0; i < 8; i++) {
        float a = angle + float(i) * 0.7853981;
        vec2 offset = vec2(cos(a), sin(a)) * radius * texel;
        // Only blur with samples at least as far away, so a sharp subject does
        // not bleed into the soft background around its silhouette.
        float sampleDepth = linearDepth(vUv + offset);
        float weight = sampleDepth >= depth - 0.6 ? 1.0 : 0.25;
        sum += texture2D(tDiffuse, vUv + offset).rgb * weight;
      }
      colour = mix(colour, sum / 8.4, clamp(coc * 1.4, 0.0, 1.0));
    }

    // ---- Bloom ------------------------------------------------------------
    if (uBloom > 0.0) {
      vec3 bright = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0471975;
        vec2 offset = vec2(cos(a), sin(a)) * 7.0 * texel;
        vec3 s = texture2D(tDiffuse, vUv + offset).rgb;
        bright += max(s - 0.72, 0.0);
      }
      colour += (bright / 6.0) * uBloom * 2.4;
    }

    // ---- Grade ------------------------------------------------------------
    // Cool shadows, warm highlights, slightly crushed blacks.
    colour = colour * uGain + uLift * (1.0 - colour);
    colour = max(colour - 0.012, 0.0) * 1.012;

    float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    colour = mix(vec3(luma), colour, uSaturation);

    // ---- Vignette ---------------------------------------------------------
    vec2 centred = vUv - 0.5;
    float vig = 1.0 - dot(centred, centred) * uVignette;
    colour *= clamp(vig, 0.0, 1.0);

    // ---- Grain ------------------------------------------------------------
    if (uGrain > 0.0) {
      float n = hash(vUv * uResolution + fract(uTime) * 137.0) - 0.5;
      colour += n * uGrain;
    }

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface GradeOptions {
  near: number;
  far: number;
}

/**
 * Builds the full-screen grade pass plus the render target it reads from.
 * The caller renders the scene into `target`, then draws `quad` with `camera`.
 */
export function createGradePass(renderer: THREE.WebGLRenderer, options: GradeOptions) {
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();

  const target = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  target.depthTexture = new THREE.DepthTexture(size.x * dpr, size.y * dpr);
  target.depthTexture.type = THREE.UnsignedIntType;

  const uniforms = {
    tDiffuse: { value: target.texture },
    tDepth: { value: target.depthTexture },
    uResolution: { value: new THREE.Vector2(size.x * dpr, size.y * dpr) },
    uTime: { value: 0 },
    uNear: { value: options.near },
    uFar: { value: options.far },
    uFocusDistance: { value: 40 },
    uFocusRange: { value: 14 },
    uDofStrength: { value: 0.65 },
    uBloom: { value: 0.5 },
    uGrain: { value: 0.03 },
    uVignette: { value: 0.9 },
    uLift: { value: new THREE.Vector3(0.012, 0.017, 0.028) },
    uGain: { value: new THREE.Vector3(1.03, 1.005, 0.975) },
    uSaturation: { value: 1.08 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GRADE_VERTEX,
    fragmentShader: GRADE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  scene.add(quad);

  function setSize(width: number, height: number, pixelRatio: number) {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    target.setSize(w, h);
    uniforms.uResolution.value.set(w, h);
  }

  function dispose() {
    target.dispose();
    target.depthTexture?.dispose();
    material.dispose();
    quad.geometry.dispose();
  }

  return { target, uniforms, scene, camera, setSize, dispose };
}

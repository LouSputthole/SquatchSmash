/**
 * The sky, over one outdoor scene, driven by the campaign clock.
 *
 * Owner, cabin playtest: *"We need a sun and some clouds in the sky. Its a
 * bleak gray day make it nice out."*
 *
 * There was no sky. Every outdoor scene in this game paints
 * `scene.background` a flat colour and calls it done, and the cabin's was
 * `fogColour` mixed a third of the way toward 0x31453b — a desaturated slate
 * that at 09:20 on Day 2 came out 0x36423f. That is the bleak grey day, and
 * nothing about it was a lighting bug: there was simply nothing up there.
 *
 * `src/core/daynight.js` already owns the hour and every colour that follows
 * from it, and it applies NOTHING to a scene — it is a table. This is the
 * consumer that turns that table into a sky, so a scene gets a sun, a cloud
 * deck and a horizon for two lines of wiring instead of a fourth private
 * backdrop. Everything it draws is derived from the `DayNight` fields
 * (`sunPos`, `sunColour`, `hemiSky`, `fogColour`, `dayness`), which is what
 * keeps nightfall working: at 20:45 the clock hands it a 0.24-intensity blue
 * key and a 0x080b14 fog, the disc becomes a moon, the deck goes to slate,
 * and the dome goes dark on its own. No second idea of what time it is.
 *
 * ONE DRAW CALL. The gradient, the sun, its glow and the whole cloud deck are
 * a single back-faced sphere with a procedural fragment shader — no textures,
 * no billboards to sort, nothing to stream. This is a no-build browser game
 * and the forest already wants the budget.
 */
import * as THREE from 'three';

/**
 * Fog thickness at midday and at midnight, per metre (`FogExp2`).
 *
 * The cabin shipped at a flat 0.0072, which leaves the far treeline — the
 * chunk band ends at 190 m — at exp(-(0.0072*190)^2) = 0.16 of its own
 * colour: a grey wall where a ridge should be. 0.0040 by day puts that same
 * treeline at 0.56, so the far hills read as distance rather than as weather,
 * and it is still enough haze to seat them in the air. Night keeps the thick
 * end: 0.0082 is what stops a moonlit clearing from showing you the whole
 * property, and the dungeon chapter needs the dark to close in.
 */
export const FOG_DENSITY_DAY = 0.0040;
export const FOG_DENSITY_NIGHT = 0.0082;

/**
 * How far up the sky the cloud deck sits, and how fast it crosses.
 *
 * The deck is a plane the shader projects onto, so `DECK_SCALE` is really
 * "how big is a cloud": 0.30 gives puffs that take about eight seconds of
 * looking to cross the 68-degree field of view at `DECK_DRIFT`, which reads
 * as a light breeze rather than as a screensaver.
 */
const DECK_SCALE = 0.30;
const DECK_DRIFT = 0.0042;

const VERTEX = `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* Value noise + 4-octave fbm. Cheap, tileless enough at this scale, and it
 * costs no texture upload -- which matters because this project ships as
 * static files with no build step to bake one into. */
const FRAGMENT = `
precision highp float;

varying vec3 vDirection;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uDiscColour;
uniform vec3 uDiscDirection;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uDiscSize;
uniform float uDiscIntensity;
uniform float uGlow;
uniform float uCloudCover;
uniform float uCloudOpacity;
uniform float uTime;
uniform float uDeckScale;
uniform float uDeckDrift;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    total += valueNoise(p) * amplitude;
    p = p * 2.03 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec3 dir = normalize(vDirection);
  float up = clamp(dir.y, -1.0, 1.0);

  // Sky gradient. Below the horizon the dome fades to the ground haze so the
  // seam against terrain and fog is a colour match rather than an edge.
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.42));
  // NOT smoothstep(0.0, -0.16, up): GLSL leaves smoothstep undefined when
  // edge0 >= edge1, and a driver is free to return anything for it.
  sky = mix(sky, uGround, 1.0 - smoothstep(-0.16, 0.0, up));

  // Sun or moon: one disc with a soft limb, plus a wide forward-scatter glow
  // that is what actually sells warm air.
  float toDisc = dot(dir, uDiscDirection);
  float disc = smoothstep(uDiscSize, uDiscSize + 0.0022, toDisc);
  float glow = pow(max(toDisc, 0.0), 46.0) * 0.55 + pow(max(toDisc, 0.0), 8.0) * 0.16;
  sky += uDiscColour * glow * uGlow;

  // Cloud deck: the view direction projected onto a plane overhead. Clamping
  // the divisor keeps the horizon from stretching to infinity and turning
  // into stripes.
  float lift = max(up, 0.075);
  vec2 deck = dir.xz / lift * uDeckScale + vec2(uTime * uDeckDrift, uTime * uDeckDrift * 0.35);
  float shape = fbm(deck);
  float detail = fbm(deck * 2.7 + vec2(3.1, 8.7));
  float density = clamp((shape * 0.78 + detail * 0.22 - (1.0 - uCloudCover)) * 3.1, 0.0, 1.0);
  // Thin the deck out toward the horizon, where a real one is seen edge-on.
  density *= smoothstep(0.02, 0.30, up);

  // Sunward faces are lit, the underside is not. The detail octave doubles
  // as the shading term, so the lit edge follows the shape the puff has.
  // The epsilon is load-bearing: looking straight up makes both of these the
  // zero vector, and normalize(vec3(0)) is a division by zero.
  vec3 flatView = normalize(vec3(dir.x, 1e-4, dir.z));
  vec3 flatDisc = normalize(vec3(uDiscDirection.x, 1e-4, uDiscDirection.z));
  float toward = clamp(dot(flatView, flatDisc), -1.0, 1.0);
  vec3 cloud = mix(uCloudShade, uCloudLit, clamp(detail * 0.85 + toward * 0.30 + 0.18, 0.0, 1.0));

  vec3 colour = mix(sky, cloud, density * uCloudOpacity);
  colour += uDiscColour * disc * uDiscIntensity;
  gl_FragColor = vec4(colour, 1.0);
}
`;

const _sunDirection = new THREE.Vector3(0, 1, 0);
const _white = new THREE.Color(0xffffff);

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * A sky for one scene.
 *
 * `update(time, elapsed)` takes a `DayNight` (or anything publishing the same
 * fields) and repaints. It also publishes `fogColour` and `fogDensity` for the
 * scene to hand straight to its own `FogExp2`, because a sky and a fog that
 * disagree about the horizon is the seam this replaces.
 */
export class SkyDome {
  /**
   * @param {THREE.Scene} scene
   * @param {{ camera?: THREE.Camera, radius?: number, cloudCover?: number }} options
   *   `radius` must stay inside the scene's camera far plane. `cloudCover`
   *   is 0 (empty blue) to 1 (overcast); 0.5 is a good day with weather in it.
   */
  constructor(scene, { camera = null, radius = 180, cloudCover = 0.52 } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.cloudCover = cloudCover;

    this.fogColour = new THREE.Color(0x38414f);
    this.fogDensity = FOG_DENSITY_DAY;

    this.uniforms = {
      uZenith: { value: new THREE.Color(0x4d84c4) },
      uHorizon: { value: new THREE.Color(0xbdd2e2) },
      uGround: { value: new THREE.Color(0x3b4640) },
      uDiscColour: { value: new THREE.Color(0xfff3d8) },
      uDiscDirection: { value: new THREE.Vector3(0, 1, 0) },
      uCloudLit: { value: new THREE.Color(0xfdfbf5) },
      uCloudShade: { value: new THREE.Color(0x9fadc0) },
      // 0.99965 subtends about 1.5 degrees: a touch larger than the real sun,
      // which is what a 68-degree field of view needs before it reads as a
      // sun at all rather than as a stuck pixel.
      uDiscSize: { value: 0.99965 },
      uDiscIntensity: { value: 1 },
      uGlow: { value: 1 },
      uCloudCover: { value: cloudCover },
      uCloudOpacity: { value: 1 },
      uTime: { value: 0 },
      uDeckScale: { value: DECK_SCALE },
      uDeckDrift: { value: DECK_DRIFT },
    };

    this.geometry = new THREE.SphereGeometry(radius, 32, 20);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'sky-dome';
    this.mesh.frustumCulled = false;
    // Painted first and never written to the depth buffer, so nothing in the
    // world has to sort against it and the far treeline still draws over it.
    this.mesh.renderOrder = -1;
    this.mesh.userData.geometryGate = { overlap: false, checkSupport: false, checkWallEmbed: false };
    scene.add(this.mesh);
  }

  /**
   * @param {object} time a `DayNight`
   * @param {number} elapsed seconds since the scene started, for cloud drift
   */
  update(time, elapsed = 0) {
    if (!time) return;
    const u = this.uniforms;
    u.uTime.value = elapsed;

    const dayness = clamp01(Number(time.dayness ?? 0));
    const sunPos = time.sunPos ?? _sunDirection;
    u.uDiscDirection.value.copy(sunPos).normalize();

    /* The sky is DERIVED from the clock, never a second table of hours.
     * `hemiSky` is already the authored "colour of the air above you" at this
     * minute and `fogColour` the authored colour of distance, so the zenith
     * is the first lifted toward a real daylight blue by how much day it is,
     * and the horizon is the second lifted toward the sun's own colour —
     * which is why dawn and dusk come out warm at the rim and cold overhead
     * without a single extra keyframe. */
    u.uZenith.value.copy(time.hemiSky ?? u.uZenith.value)
      .lerp(_white.setHex(0x2f6dbe), 0.34 * dayness)
      .multiplyScalar(0.55 + 0.75 * dayness);
    u.uHorizon.value.copy(time.fogColour ?? u.uHorizon.value)
      .lerp(time.sunColour ?? _white.setHex(0xffffff), 0.30 + 0.34 * dayness)
      /* 1.24 at full day and not a decimal more: 1.67 drove the midday
       * horizon to a clipped 0xffffff, which is a white bar, not haze. This
       * lands it on 0xeceade — bright enough to read as sun on air, still
       * inside the gamut so the cloud deck has somewhere to be lighter. */
      .multiplyScalar(0.62 + 0.62 * dayness);
    u.uGround.value.copy(time.hemiGround ?? u.uGround.value)
      .lerp(u.uHorizon.value, 0.45);

    u.uDiscColour.value.copy(time.sunColour ?? u.uDiscColour.value);
    /* The same disc is the moon after dark: DayNight parks its key light in
     * the north-west and drops it to 0.22-0.26 intensity, so a smaller, dimmer
     * disc with almost no glow is the honest reading of the table rather than
     * a separate moon object. */
    const night = 1 - dayness;
    u.uDiscSize.value = 0.99965 + 0.00020 * night;
    u.uDiscIntensity.value = 0.55 + 1.85 * dayness;
    u.uGlow.value = 0.10 + 1.20 * dayness;

    /* Cloud lighting rides the sun too, so the deck goes from white-gold at
     * noon to a bare slate suggestion under the moon. At `dayness` 0 the deck
     * is 22% opaque against a near-black dome, which is enough to break the
     * flat black without lighting the night up. */
    u.uCloudLit.value.copy(time.sunColour ?? _white.setHex(0xffffff))
      .lerp(_white.setHex(0xffffff), 0.42)
      .multiplyScalar(0.30 + 0.78 * dayness);
    u.uCloudShade.value.copy(time.hemiSky ?? u.uCloudShade.value)
      .multiplyScalar(0.42 + 0.62 * dayness);
    u.uCloudOpacity.value = 0.22 + 0.78 * dayness;
    u.uCloudCover.value = this.cloudCover;

    /* One horizon, one fog. The scene's fog gets the dome's own horizon
     * colour so the treeline dissolves INTO the sky instead of into a
     * separate grey, and the density opens up by day and closes at night. */
    this.fogColour.copy(u.uHorizon.value).lerp(u.uZenith.value, 0.16);
    this.fogDensity = FOG_DENSITY_NIGHT + (FOG_DENSITY_DAY - FOG_DENSITY_NIGHT) * dayness;

    if (this.camera) this.mesh.position.copy(this.camera.position);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

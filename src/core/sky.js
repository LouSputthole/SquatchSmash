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
 * How big a cloud is, and how fast the deck crosses.
 *
 * The deck is a plane the shader projects the view direction onto, so
 * `DECK_SCALE` is how many noise cells fit across the sky — and at 0.30 the
 * answer was three. Straight up the projection collapses to the origin, and
 * at 6 degrees above the horizon (`lift` floors at 0.075) the radius reaches
 * only |dir.xz| / 0.075 * 0.30 = 4.0, so the entire visible hemisphere sat
 * inside about three cells of a noise whose first octave is unit-scale. That
 * is not a cloud deck, it is one smooth blob the width of the sky, which is
 * exactly what it looked like: haze, at any cover.
 *
 * 2.6 puts about 35 cells across the same hemisphere — puffs a few degrees
 * wide, which is what "some slight clouds" looks like from the ground.
 *
 * `DECK_DRIFT` is in deck units per second and therefore has to move with
 * the scale, or the same wind becomes eight times slower: 0.030 crosses one
 * cell in roughly half a minute, about 0.2 degrees a second at mid
 * elevations. A cloud takes minutes to cross the 68-degree field of view,
 * which is weather rather than a screensaver.
 */
const DECK_SCALE = 2.6;
const DECK_DRIFT = 0.030;

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
  /* 4.6, not 3.1. Owner: "maybe some slight clouds" -- which is a sky with
   * separate puffs in it, not a thin wash over the whole dome. The ramp is
   * what decides which: at 3.1 an fbm that averages 0.47 spends most of its
   * range inside the ramp and every cloud has a hundred metres of fade, so
   * against the corrected daylight blue the deck read as haze. A steeper
   * ramp spends the same noise on edges instead, and uCloudCover then means
   * what it says: how much of the sky has cloud ON it. */
  float density = clamp((shape * 0.78 + detail * 0.22 - (1.0 - uCloudCover)) * 4.6, 0.0, 1.0);
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
 * WHY THE DAY IS WRITTEN IN DISPLAY VALUES AND THE NIGHT IS NOT.
 *
 * Owner, cabin playtest: *"I want it day time and sunny out, maybe some
 * slight clouds."* The clock was already right — Day 2 at 09:20 is `dayness`
 * 1.000 — and the sky was still a dark navy gradient. It was a colour-space
 * seam, and it is measurable in one line: paint the whole dome 0.5 and read
 * the framebuffer back. It comes out 128, not 188. A `ShaderMaterial` with
 * its own fragment shader gets no `colorspace_fragment` chunk, so this dome
 * writes WORKING-space (linear) values straight into an sRGB target, while
 * every lit surface beside it goes through the renderer's encode.
 *
 * Every colour here is derived from a `DayNight` hex, and `Color.setHex`
 * decodes sRGB to linear. So the midday zenith left here as 0x4d7ad7 and the
 * horizon as 0xcfb792 — roughly a gamma darker than they read in source. The
 * comment on the horizon's own multiplier says it "lands on 0xeceade": that
 * is this colour ENCODED, which is what its author was picturing. The code
 * and its comment disagreed, and the comment was right about the intent.
 *
 * Encoding the output outright is the obvious fix and it is the wrong one:
 * it lifts the night out of the dark the dungeon chapter is authored around
 * (a 21:30 zenith of 0x04060e becomes 0x2a3355). So the transfer is applied
 * BY DAYNESS, through a threshold that is zero at both authored night
 * checkpoints — 0.146 at the Day 3 20:45 nightfall and 0.000 at 21:30 — and
 * full through the day. Dawn and dusk cross it on their own.
 */
const DISPLAY_LIFT_FROM = 0.35;
const DISPLAY_LIFT_TO = 0.92;

function displayLiftAt(dayness) {
  const t = clamp01((dayness - DISPLAY_LIFT_FROM) / (DISPLAY_LIFT_TO - DISPLAY_LIFT_FROM));
  return t * t * (3 - 2 * t);
}

/** The sRGB transfer function, per channel — what the renderer would apply. */
function encodeChannel(v) {
  if (v <= 0.0031308) return v * 12.92;
  return 1.055 * (v ** (1 / 2.4)) - 0.055;
}

function liftToDisplay(colour, amount) {
  if (amount <= 0) return colour;
  return colour.setRGB(
    colour.r + (encodeChannel(clamp01(colour.r)) - colour.r) * amount,
    colour.g + (encodeChannel(clamp01(colour.g)) - colour.g) * amount,
    colour.b + (encodeChannel(clamp01(colour.b)) - colour.b) * amount,
  );
}

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
   *   is 0 (empty blue) to 1 (overcast) and, since the density ramp was
   *   sharpened, it really is how much of the sky carries cloud: 0.42 is the
   *   cabin's scattered day, 0.6 and up starts closing the blue in.
   */
  constructor(scene, { camera = null, radius = 180, cloudCover = 0.52 } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.cloudCover = cloudCover;

    this.fogColour = new THREE.Color(0x38414f);
    this.fogDensity = FOG_DENSITY_DAY;
    /** 0 at night, 1 through the day. Published so a test can pin it. */
    this.displayLift = 0;

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
    /* 0.80 at full day rather than 1.04: a puff needs an underside darker
     * than the sky behind it or it is a bright patch, not a cloud. */
    u.uCloudShade.value.copy(time.hemiSky ?? u.uCloudShade.value)
      .multiplyScalar(0.42 + 0.38 * dayness);
    u.uCloudOpacity.value = 0.22 + 0.78 * dayness;
    u.uCloudCover.value = this.cloudCover;

    /* One horizon, one fog. The scene's fog gets the dome's own horizon
     * colour so the treeline dissolves INTO the sky instead of into a
     * separate grey, and the density opens up by day and closes at night.
     *
     * Taken BEFORE the display lift below, and that ordering is the whole
     * point: `fog.color` is consumed by lit materials, which the renderer
     * encodes on the way out. Handing them an already-encoded horizon
     * encodes it twice and turns the far treeline white. */
    this.fogColour.copy(u.uHorizon.value).lerp(u.uZenith.value, 0.16);
    this.fogDensity = FOG_DENSITY_NIGHT + (FOG_DENSITY_DAY - FOG_DENSITY_NIGHT) * dayness;

    /* The day, in the values the framebuffer actually shows. See
     * DISPLAY_LIFT_FROM: zero at both authored night checkpoints, so the
     * dungeon chapter's dark is untouched to the bit. */
    this.displayLift = displayLiftAt(dayness);
    for (const colour of [
      u.uZenith.value, u.uHorizon.value, u.uGround.value,
      u.uDiscColour.value, u.uCloudLit.value, u.uCloudShade.value,
    ]) liftToDisplay(colour, this.displayLift);

    if (this.camera) this.mesh.position.copy(this.camera.position);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

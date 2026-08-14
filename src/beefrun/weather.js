/**
 * WeatherSystem — sky, sun, cloud, rain, and the air itself.
 *
 * The important half is the last one. Turbulence here moves the aeroplane
 * rather than shaking the camera: it writes a wind vector and a gust vector
 * that AircraftPhysics subtracts from the velocity before it works out angle
 * of attack, so a mountain updraft lifts the wing, a valley thermal makes the
 * nose wander, and a crosswind on final has to be flown out rather than
 * watched.
 */
import * as THREE from 'three';
import { sphereGeo, clamp, lerp, smoothstep, damp, fbm, rng } from './util.js';
import { zonePalette, terrainHeight } from './terrain.js';

const CLOUD_COUNT = 44;
const RAIN_COUNT = 1400;

export class WeatherSystem {
  /**
   * `seed` pins the gust field. Left unset (the default) each page load flies
   * different air, which is what a player should get. A verifier measuring a
   * forty-five-second altitude hold, though, has to fly the SAME air every
   * run — unseeded weather was cause #1 of two sessions of "flaky" autopilot
   * checks (docs/ENGINE-TRAPS.md entry 7). Pass any finite number and two
   * systems built with it produce identical air for identical inputs.
   */
  constructor(scene, renderer, { seed = null } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.t = 0;

    // Conditions, driven by the mission.
    this.gustScale = 1;         // difficulty multiplier
    this.crosswind = 0;         // m/s, +X
    this.rain = 0;              // 0..1
    this.dusk = 0;              // 0..1, drives the whole palette at the end
    this.turbulence = 0.35;     // base roughness of the air
    this.cloudDensity = 0.5;

    /* ---- Added for src/enolasquatch (The Enola Squatch) ----
     * Beef Run's `dusk` only ever needed to reach a purple-ish evening —
     * nothing in that mission flies past sunset. A genuine night bombing run
     * wants actual black sky with moonlight, and occasional lightning near
     * the flak. Both are new, independently-zeroed fields that default to
     * exactly the behaviour above: `night` at 0 changes nothing in `update()`
     * below (its lerp factor is 0), and `lightning` at 0 never starts the
     * flash timer at all. Beef Run never sets either, so this is additive. */
    this.night = 0;             // 0..1, pushes the sky/fog further toward black than `dusk` alone does
    this.lightning = 0;         // 0..1, 0 = off; >0 = periodic brief flashes, roughly every (5 / lightning)s
    this._lightningT = 0;
    this.lightningFlash = 0;    // 0..1 read-only: how bright the current flash is, for anything that wants to react (tracer visibility, a camera shake hook, etc.)

    this.wind = new THREE.Vector3();
    this.gust = new THREE.Vector3();
    /* The phase offsets `sampleAir` feeds into its noise field. Seeded when a
     * seed is given, random otherwise — see the constructor comment. */
    const rand = Number.isFinite(seed) ? rng(seed) : Math.random;
    this._gustPhase = new THREE.Vector3(rand() * 100, rand() * 100, rand() * 100);

    this.sky = new THREE.Color(0x9fc4e8);
    this.fog = new THREE.Fog(0x9fc4e8, 300, 2600);
    scene.fog = this.fog;
    scene.background = this.sky;

    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a5a3a, 1.05);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.castShadow = true;
    // A 1024 map keeps the grounded aircraft legible without paying a full
    // 2048 soft-shadow pass every frame over a streamed outdoor level.
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -70; cam.right = 70; cam.top = 70; cam.bottom = -70;
    cam.near = 1; cam.far = 400;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.buildClouds();
    this.buildRain();
  }

  /* ---------------------------------------------------------------- */
  /* Cloud                                                             */
  /* ---------------------------------------------------------------- */

  buildClouds() {
    // Clouds are lumps of unlit spheres that follow the aeroplane in a slab.
    // They exist to hide the seams between zones, so they are placed in a ring
    // and recycled rather than streamed.
    const rand = rng(0xc10d);
    this.clouds = new THREE.Group();
    this.clouds.name = 'clouds';
    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false, fog: true,
    });
    this.cloudBits = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const puff = new THREE.Group();
      const n = 3 + Math.floor(rand() * 4);
      for (let j = 0; j < n; j++) {
        const s = 26 + rand() * 46;
        const m = new THREE.Mesh(sphereGeo(1, 8, 6), this.cloudMat);
        m.scale.set(s, s * (0.34 + rand() * 0.2), s * (0.7 + rand() * 0.5));
        m.position.set((rand() - 0.5) * 90, (rand() - 0.5) * 16, (rand() - 0.5) * 70);
        puff.add(m);
      }
      puff.userData.offset = new THREE.Vector3(
        (rand() - 0.5) * 3600,
        620 + rand() * 900,
        (rand() - 0.5) * 3600,
      );
      puff.userData.drift = rand() * 6;
      this.clouds.add(puff);
      this.cloudBits.push(puff);
    }
    this.scene.add(this.clouds);
  }

  /** True when the aeroplane is inside a cloud — the detection system cares. */
  inCloud(pos) {
    for (const c of this.cloudBits) {
      if (!c.visible) continue;
      const dy = Math.abs(pos.y - c.position.y);
      if (dy > 26) continue;
      const dx = pos.x - c.position.x;
      const dz = pos.z - c.position.z;
      if (dx * dx + dz * dz < 60 * 60) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Rain                                                              */
  /* ---------------------------------------------------------------- */

  buildRain() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 70;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: 0xbfd4e0, size: 0.5, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
    });
    this.rainPts = new THREE.Points(geo, this.rainMat);
    this.rainPts.frustumCulled = false;
    this.scene.add(this.rainPts);
  }

  /* ---------------------------------------------------------------- */
  /* Air                                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Work out the air at a point. Everything here is smooth noise in space and
   * time — no random per-frame kicks, because a gust the player cannot fly
   * into and back out of is just controller noise.
   */
  sampleAir(pos, agl, out = { wind: this.wind, gust: this.gust }) {
    const t = this.t;
    const s = 260;

    // Mountain effect: air is pushed up on the windward side of rising ground
    // and pulled down behind it. Sampled off the heightfield directly.
    const hHere = terrainHeight(pos.x, pos.z);
    const hAhead = terrainHeight(pos.x, pos.z - 90);
    const slope = (hAhead - hHere) / 90;
    const terrainInfluence = smoothstep(900, 120, Math.max(agl, 0));
    const orographic = clamp(slope, -0.6, 0.6) * 9 * terrainInfluence;

    // Valley thermals: warm air over low ground, mid-morning onward.
    const thermal = (fbm(pos.x / 900, pos.z / 900, 2) - 0.5) * 4 * smoothstep(1400, 300, hHere);

    // Rolling gust field, phase-shifted per system so the air is a different
    // function of time on every unseeded load and the SAME one under a seed.
    const p = this._gustPhase;
    const gx = (fbm(pos.x / s + t * 0.06 + p.x, pos.z / s, 3) - 0.5) * 2;
    const gy = (fbm(pos.x / s + 31 + p.y, pos.z / s + t * 0.05, 3) - 0.5) * 2;
    const gz = (fbm(pos.x / s - 17 + p.z, pos.z / s + 53 + t * 0.04, 3) - 0.5) * 2;
    const rough = this.turbulence * this.gustScale;

    out.wind.set(this.crosswind, 0, 0);
    out.gust.set(
      gx * 4.2 * rough,
      (gy * 3.4 * rough) + orographic + thermal,
      gz * 4.2 * rough,
    );
    return out;
  }

  /* ---------------------------------------------------------------- */

  update(dt, focus) {
    this.t += dt;

    // Palette follows the zone under the aeroplane, warmed toward sunset.
    const pal = zonePalette(focus.z);
    const duskSky = new THREE.Color(0x2a2440);
    const duskHorizon = new THREE.Color(0xd97a3a);
    let target = pal.sky.clone().lerp(duskHorizon, this.dusk * 0.55).lerp(duskSky, this.dusk * this.dusk * 0.5);
    let fogTarget = pal.fog.clone().lerp(duskHorizon, this.dusk * 0.4).lerp(duskSky, this.dusk * this.dusk * 0.6);

    /* ---- night (additive, see the field comment above) ----
     * Zero by default, so `target`/`fogTarget` above are untouched for Beef
     * Run. Pushed toward a genuine near-black rather than `duskSky` — which
     * is a purple *lighter* than most of the Enola Squatch's own night zone
     * palette (see ZONES_EAST in src/enolasquatch/config.js) and would have
     * brightened the sky at full dusk instead of darkening it. */
    if (this.night > 0) {
      const trueNight = new THREE.Color(0x040611);
      target = target.lerp(trueNight, this.night * 0.85);
      fogTarget = fogTarget.lerp(trueNight, this.night * 0.7);
    }
    this.sky.lerp(target, clamp(dt * 1.2, 0, 1));
    this.scene.background = this.sky;

    this.fog.color.lerp(fogTarget, clamp(dt * 1.2, 0, 1));
    this.fog.near = damp(this.fog.near, pal.fogNear * (1 - this.rain * 0.45), 0.8, dt);
    this.fog.far = damp(this.fog.far, pal.fogFar * (1 - this.rain * 0.55) * (1 - this.dusk * 0.3), 0.8, dt);

    /* ---- lightning (additive) ----
     * A periodic brief flash: the background and both lights kick up for a
     * couple of frames, then decay. `lightning` at 0 (Beef Run's permanent
     * value) skips this block entirely — no timer runs, `lightningFlash`
     * stays 0, nothing about the frame changes. */
    if (this.lightning > 0) {
      this._lightningT -= dt;
      if (this._lightningT <= 0 && this.lightningFlash <= 0.01) {
        this._lightningT = lerp(9, 2, clamp(this.lightning, 0, 1)) * (0.6 + Math.random() * 0.8);
        this.lightningFlash = 1;
      }
      if (this.lightningFlash > 0) {
        // Fast in (it's already happened by the time you see it), slower out.
        this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.2);
        const flashColor = new THREE.Color(0xdce8ff);
        this.scene.background = this.sky.clone().lerp(flashColor, this.lightningFlash * 0.85);
      }
    } else {
      this.lightningFlash = 0;
    }

    // Sun: high and hard at midday, low and orange by the time they get home.
    // 0.28 rad is about sixteen degrees: low enough to read as evening, high
    // enough that the ground still catches light instead of going to black.
    const sunAngle = lerp(1.15, 0.28, this.dusk);
    this.sun.position.set(
      focus.x + Math.cos(sunAngle) * 220,
      focus.y + Math.sin(sunAngle) * 260,
      focus.z + 140 - this.dusk * 420,
    );
    this.sun.target.position.copy(focus);
    this.sun.color.lerp(new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff9a4a), this.dusk), clamp(dt * 2, 0, 1));
    this.sun.intensity = damp(this.sun.intensity, lerp(2.4, 0.75, this.dusk) * (1 - this.rain * 0.45), 1.5, dt);
    this.hemi.intensity = damp(this.hemi.intensity, lerp(1.05, 0.8, this.dusk) * (1 - this.rain * 0.2), 1.5, dt);
    this.hemi.color.lerp(new THREE.Color(0xcfe4ff).lerp(new THREE.Color(0x8a6a9a), this.dusk), clamp(dt * 2, 0, 1));
    // Lightning bump, applied after the damp above so it is not immediately
    // overwritten by it — a flash that the very next line erases is not a
    // flash. Zero whenever `lightning` is off, per the block above.
    if (this.lightningFlash > 0) this.hemi.intensity += this.lightningFlash * 1.4;

    // Clouds ride with the aeroplane, wrapped into a slab around it.
    const span = 3600;
    let visible = 0;
    const wanted = Math.round(CLOUD_COUNT * clamp(this.cloudDensity, 0, 1));
    for (let i = 0; i < this.cloudBits.length; i++) {
      const c = this.cloudBits[i];
      const off = c.userData.offset;
      const x = focus.x + wrap(off.x + this.t * (2 + c.userData.drift), span);
      const z = focus.z + wrap(off.z, span);
      c.position.set(x, off.y, z);
      c.visible = visible < wanted;
      if (c.visible) visible++;
    }
    this.cloudMat.opacity = damp(this.cloudMat.opacity, lerp(0.68, 0.9, this.rain), 1, dt);
    this.cloudMat.color.lerp(
      new THREE.Color(0xffffff).lerp(new THREE.Color(0x6a6a7a), this.rain * 0.7).lerp(new THREE.Color(0xd98a5a), this.dusk * 0.5),
      clamp(dt * 1.5, 0, 1),
    );

    // Rain box follows the camera; drops fall and wrap.
    this.rainMat.opacity = damp(this.rainMat.opacity, this.rain * 0.55, 2, dt);
    this.rainPts.visible = this.rainMat.opacity > 0.01;
    if (this.rainPts.visible) {
      this.rainPts.position.copy(focus);
      const arr = this.rainPts.geometry.attributes.position.array;
      const fall = 42 * dt;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] -= fall;
        if (arr[i] < -35) arr[i] = 35;
      }
      this.rainPts.geometry.attributes.position.needsUpdate = true;
      // Streaks lean back with speed.
      this.rainMat.size = 0.4 + this.rain * 0.5;
    }
  }

  /** Preset conditions per mission phase. */
  setConditions({ turbulence, crosswind, rain, cloudDensity, dusk, night, lightning }) {
    if (turbulence !== undefined) this.turbulence = turbulence;
    if (crosswind !== undefined) this.crosswind = crosswind;
    if (rain !== undefined) this.rain = rain;
    if (cloudDensity !== undefined) this.cloudDensity = cloudDensity;
    if (dusk !== undefined) this.dusk = dusk;
    // Both additive — see the field comments in the constructor. Beef Run
    // never passes either key, so its calls to setConditions are unaffected.
    if (night !== undefined) this.night = clamp(night, 0, 1);
    if (lightning !== undefined) this.lightning = clamp(lightning, 0, 1);
  }
}

function wrap(v, span) {
  const half = span / 2;
  return ((((v + half) % span) + span) % span) - half;
}

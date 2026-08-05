/**
 * DetectionSystem — the Continental Agricultural Interdiction Bureau.
 *
 * This is a stylised stealth meter, not a simulation of anything. Attention is
 * a single number driven by where the aeroplane is relative to the terrain and
 * to the Bureau's aircraft: out in the open, high, near a marked mast or
 * inside a patrol's cone, it climbs. Down in a valley, behind a ridge, inside
 * cloud, or simply somewhere they are not looking, it falls.
 *
 * Nothing here describes how anything real works, and deliberately so: the
 * inputs are "am I visible from that aeroplane" and "how much sky am I
 * standing in", which is a hide-and-seek game with an eagle holding a fork
 * painted on the other team.
 */
import * as THREE from 'three';
import {
  solid, unlit, mat, boxGeo, cylGeo, coneGeo, sphereGeo,
  mesh, flatMesh, group, clamp, lerp, damp, smoothstep, rng,
} from './util.js';
import { terrainHeight } from './terrain.js';
import { caibBadgeTexture } from './landmarks.js';
import { LANDMARKS } from './config.js';

const SEARCHING_AT = 0.34;
const LOCATED_AT = 0.86;

/* How the Bureau lays a search across the valley. See `deploy()` — these used
 * to be three hard-coded pairs, which is why every run ended up located in the
 * same place. */
const LANE_FIRST = 1700;           // metres up the route to the first screen
const LANE_SPACING = 1650;         // metres between screens
const LANE_CLOSE_IN = 700;         // how much sooner they start if they know
const LANE_SPREAD_COLD = 900;      // metres either side of the track, guessing
const LANE_SPREAD_HOT = 320;       // metres either side when they are sure
/* No lane may sit this close along the route to a navigation landmark. 800 m
 * rather than 900: the tightest pair on the route is the volcano and the red
 * cliff at 1650 m apart, so anything above 825 leaves a stretch of the valley
 * that cannot satisfy the rule at all. */
const LANE_KEEPOUT = 800;

/** The Bureau's aeroplane: bigger, cleaner, and much better maintained. */
function makePatrolAircraft() {
  const g = group('caib-patrol');
  const skin = solid(0x4a5866, { roughness: 0.42, metalness: 0.55 });
  const dark = solid(0x22262c, { roughness: 0.6 });

  g.add(mesh(boxGeo(2.2, 2.2, 13), skin, 0, 0, 0));
  const nose = mesh(coneGeo(1.1, 2.6, 10), skin, 0, 0, 7.4);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  g.add(mesh(boxGeo(22, 0.4, 2.6), skin, 0, 0.6, -0.5));
  g.add(mesh(boxGeo(7, 0.3, 1.6), skin, 0, 1.2, -6.2));
  g.add(mesh(boxGeo(0.3, 3.4, 2.2), skin, 0, 2.4, -6.2));
  // Engines.
  for (const sx of [-4.2, 4.2]) {
    const nac = mesh(cylGeo(0.8, 0.8, 3.4, 10), dark, sx, 0.3, 1.2);
    nac.rotation.x = Math.PI / 2;
    g.add(nac);
  }
  // Sensor turret under the nose — the thing that makes it feel personal.
  const turret = mesh(sphereGeo(0.8, 10, 8), dark, 0, -1.3, 4.4);
  g.add(turret);
  // Badge on the tail.
  const badge = flatMesh(new THREE.PlaneGeometry(2.2, 2.2), mat({ map: caibBadgeTexture(), roughness: 0.7, transparent: true }), 0.18, 2.6, -6.2);
  badge.rotation.y = Math.PI / 2;
  g.add(badge);
  const badge2 = badge.clone();
  badge2.position.x = -0.18;
  badge2.rotation.y = -Math.PI / 2;
  g.add(badge2);

  // Strobes.
  const strobes = [];
  for (const sx of [-11, 11]) {
    const s = flatMesh(sphereGeo(0.26), unlit(0xffffff), sx, 0.6, -0.5);
    g.add(s);
    strobes.push(s);
  }

  // The spotlight: a cone of light plus an actual SpotLight, only switched on
  // once they think they have something.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff4d0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(26, 240, 16, 1, true), beamMat);
  beam.position.set(0, -120, 4);
  beam.frustumCulled = false;
  g.add(beam);
  const lamp = new THREE.SpotLight(0xfff4d0, 0, 500, 0.24, 0.5, 1);
  lamp.position.set(0, -1.3, 4.4);
  g.add(lamp);
  g.add(lamp.target);
  lamp.target.position.set(0, -120, 20);

  return { group: g, beam, beamMat, lamp, turret, strobes };
}

export class DetectionSystem {
  constructor(scene, { towers = [] } = {}) {
    this.scene = scene;
    this.towers = towers;
    this.attention = 0;
    this.rate = 1;                  // difficulty multiplier
    this.active = false;            // only armed on the way home
    this.locatedFor = 0;
    this.patrols = [];
    this.chaser = null;
    this.onState = null;            // (state) => void
    this.onRadio = null;            // (lineId) => void
    this.state = 'unnoticed';
    this.exposure = 0;              // last computed visibility, for the HUD
    this._radioCooldown = 0;
    this._lastState = 'unnoticed';
    this.root = group('caib');
    scene.add(this.root);
  }

  /**
   * Put the Bureau in the air. Called when the heavy departure begins.
   *
   * ## Why this used to be three numbers, and why it is not any more
   *
   * Owner's note: *"I am always located near the volcano no matter what how
   * does that work?"* This is how: the three lanes were literal constants —
   * `originZ + 1400`, `+2900`, `+4600` — off a constant origin (`EH.zHigh`),
   * with constant x. Measured over six deploys the lane homes came out at
   * (-700, -8840), (850, -7340) and (-260, -5640) every single time, and the
   * nearest one sat 468.7 m from the smoking volcano on every run, with zero
   * variance. The route is a corridor along -Z, so the player had to fly
   * through that one spot, and the meter tipped over in the same place every
   * time regardless of altitude, speed, weather or how the leg had gone.
   *
   * Now the deployment reflects the run:
   *
   *  - **Where you actually are.** `corridorX` is the aeroplane's own track off
   *    the strip. A search starts where the thing being searched for was last
   *    seen, so the lanes are laid across that, not across x = 0.
   *  - **How much they already knew.** `alert` is the attention the leg
   *    finished on and whether the Bureau got a look at El Hueso. High, and
   *    they come in close and tight; clean, and they are strung out and much
   *    further up the valley.
   *  - **Nothing on a landmark.** No lane home may sit within `LANE_KEEPOUT`
   *    of a navigation landmark. The volcano is the thing Sasole tells you to
   *    steer by — it must not also be the thing that always catches you.
   *  - **A different night each time.** Everything is jittered off a per-run
   *    seed, so a restart is a fresh search rather than a rerun of the same
   *    interception.
   *
   * @param {number} originZ where the departure begins
   * @param {object} [options]
   * @param {number} [options.seed] per-run seed; omit for a fresh one
   * @param {number} [options.alert] 0..1, how much they already knew
   * @param {number} [options.corridorX] the track the aeroplane actually left on
   */
  deploy(originZ, options = {}) {
    this.clear();
    this.active = true;
    const {
      seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
      alert = 0,
      corridorX = 0,
    } = options;
    const rand = rng(seed);
    const heat = clamp(alert, 0, 1);

    const lanes = [];
    for (let i = 0; i < 3; i++) {
      /* Along the route: the first screen is closer the more they know, and
       * every screen is jittered by up to a third of the gap between them. */
      const reach = LANE_FIRST - heat * LANE_CLOSE_IN + i * LANE_SPACING;
      let z = originZ + reach + (rand() - 0.5) * LANE_SPACING * 0.66;
      z = this.clearOfLandmarks(z, originZ + LANE_KEEPOUT);
      /* Across it: they sweep the track the aeroplane actually left on. The
       * more certain they are, the tighter they sit to it; a clean departure
       * has them guessing across a much wider band, alternating sides so the
       * three screens are not stacked on one wing. */
      const side = i % 2 ? 1 : -1;
      const spread = lerp(LANE_SPREAD_COLD, LANE_SPREAD_HOT, heat);
      const x = clamp(corridorX + side * spread * (0.55 + rand() * 0.9), -1400, 1400);
      // Heading: crossing the corridor, from whichever side they are on.
      const hdg = side > 0 ? 250 + rand() * 40 : 70 + rand() * 40;

      const p = makePatrolAircraft();
      const y = terrainHeight(x, z) + 420 + rand() * 260;
      p.group.position.set(x, y, z);
      p.group.rotation.y = THREE.MathUtils.degToRad(hdg);
      this.root.add(p.group);
      const lane = {
        ...p,
        home: new THREE.Vector3(x, y, z),
        heading: hdg,
        // They fly faster when they think they have something to catch.
        speed: 58 + heat * 14,
        sweep: rand() * Math.PI * 2,
        mode: 'patrol',
        t: 0,
      };
      this.patrols.push(lane);
      lanes.push({ x, z });
    }
    /* What this deployment was, so the end card and a verifier can both say
     * where the Bureau actually was rather than where it always is. */
    this.deployment = { seed, alert: heat, corridorX, lanes };
    return this.deployment;
  }

  /**
   * Nudge a lane along the route until it is clear of every navigation
   * landmark.
   *
   * Pushed off whichever side it was already nearer to, so the shove leaves a
   * spread rather than stacking every displaced lane on the same edge of the
   * same landmark — which would just be the old fixed interception with a
   * bigger radius. `floorZ` is the closest to the strip a lane may be pushed,
   * so a downhill shove can never park one on the runway the player just left.
   */
  clearOfLandmarks(z, floorZ) {
    const clearance = (v) => Math.min(...LANDMARKS.map((lm) => Math.abs(v - lm.z)));
    let out = z;
    let best = out;
    let bestGap = clearance(out);
    for (let guard = 0; guard < 12; guard++) {
      if (bestGap >= LANE_KEEPOUT) return best;
      const clash = LANDMARKS.find((lm) => Math.abs(out - lm.z) < LANE_KEEPOUT);
      if (!clash) return out;
      const below = clash.z - LANE_KEEPOUT - 40;
      const above = clash.z + LANE_KEEPOUT + 40;
      out = (out < clash.z && below >= floorZ) ? below : above;
      const gap = clearance(out);
      if (gap > bestGap) { bestGap = gap; best = out; }
    }
    /* Two landmarks closer together than twice the keepout leave a gap that
     * cannot satisfy it — the volcano and the red cliff are 1650 m apart. Take
     * the roomiest spot found rather than looping, so a lane in that stretch
     * sits as far from both as the valley allows instead of on one of them. */
    return best;
  }

  clear() {
    for (const p of this.patrols) this.root.remove(p.group);
    this.patrols.length = 0;
    this.chaser = null;
    this.attention = 0;
    this.locatedFor = 0;
    this.state = 'unnoticed';
    this.active = false;
  }

  /**
   * How much sky the aeroplane is standing in.
   *
   * Sampled by comparing its altitude with the highest ground within a couple
   * of kilometres: down among the ridges it is hidden, above them it is a
   * silhouette. Cheap, stable, and it makes valleys mean something.
   */
  exposureAt(pos) {
    let highest = -Infinity;
    const R = 1500;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = terrainHeight(pos.x + Math.cos(a) * R, pos.z + Math.sin(a) * R);
      if (h > highest) highest = h;
    }
    const ground = terrainHeight(pos.x, pos.z);
    const ridge = Math.max(highest, ground + 60);
    // Below the ridge line: hidden. Two hundred metres above it: fully exposed.
    return smoothstep(ridge - 40, ridge + 220, pos.y);
  }

  update(dt, { position, velocity, inCloud, stable = true, focusCam = null }) {
    for (const p of this.patrols) this.updatePatrol(p, dt, position);
    if (!this.active) return this.state;

    this._radioCooldown = Math.max(0, this._radioCooldown - dt);

    const exposure = this.exposureAt(position);
    this.exposure = exposure;

    // Base: how much of the sky they can see you against.
    let gain = (exposure - 0.42) * 0.11;

    // Their aeroplanes. A cone ahead of each one, plus plain proximity.
    for (const p of this.patrols) {
      const toMe = position.clone().sub(p.group.position);
      const dist = toMe.length();
      if (dist > 2600) continue;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(p.group.quaternion);
      const cos = toMe.normalize().dot(fwd);
      const inCone = cos > 0.72 && dist < 1900;
      const near = smoothstep(2400, 500, dist);
      if (inCone) gain += 0.22 * near;
      else gain += 0.05 * near * exposure;
      if (p.mode === 'chase') gain += 0.3;
    }

    // Their masts.
    for (const t of this.towers) {
      const d = position.distanceTo(t.position);
      if (d < 1500) gain += 0.16 * smoothstep(1500, 250, d) * (0.35 + exposure * 0.65);
    }

    // What helps: cloud, low flying, and not flinging the aeroplane about.
    if (inCloud) gain -= 0.34;
    if (exposure < 0.3) gain -= 0.14;
    if (!stable) gain += 0.05;

    // Nothing at all happening: it bleeds away.
    gain -= 0.055;

    this.attention = clamp(this.attention + gain * this.rate * dt, 0, 1);

    const prev = this.state;
    this.state = this.attention >= LOCATED_AT ? 'located'
      : this.attention >= SEARCHING_AT ? 'searching' : 'unnoticed';

    if (this.state === 'located') {
      this.locatedFor += dt;
      if (!this.chaser) this.beginChase(position);
    } else {
      this.locatedFor = Math.max(0, this.locatedFor - dt * 0.7);
      if (this.chaser && this.attention < SEARCHING_AT) this.endChase();
    }

    if (this.state !== prev) {
      this.onState?.(this.state, prev);
      if (this.state === 'searching' && this._radioCooldown <= 0) {
        this._radioCooldown = 14;
        this.onRadio?.('caib.sweep');
      }
      if (this.state === 'located' && this._radioCooldown <= 0) {
        this._radioCooldown = 10;
        this.onRadio?.('caib.hail');
      }
    }
    void focusCam; void velocity; void lerp;
    return this.state;
  }

  beginChase(playerPos) {
    // The nearest one peels off. The others keep sweeping their lanes.
    let best = null, bestD = Infinity;
    for (const p of this.patrols) {
      const d = p.group.position.distanceTo(playerPos);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) return;
    best.mode = 'chase';
    this.chaser = best;
    best.lamp.intensity = 60;
    this.onRadio?.('caib.chase');
  }

  endChase() {
    if (!this.chaser) return;
    this.chaser.mode = 'patrol';
    this.chaser.lamp.intensity = 0;
    this.chaser = null;
    this.onRadio?.('caib.lost');
  }

  updatePatrol(p, dt, playerPos) {
    p.t += dt;
    const g = p.group;

    if (p.mode === 'chase') {
      // Follow, a few hundred metres back and slightly above. It never closes
      // all the way and it never shoots — it is trying to make the player go
      // somewhere, not to stop them.
      const want = playerPos.clone();
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion).multiplyScalar(300);
      want.add(back);
      want.y = Math.max(want.y + 90, terrainHeight(want.x, want.z) + 140);
      const toward = want.sub(g.position);
      const dist = toward.length();
      g.position.addScaledVector(toward.normalize(), Math.min(dist, p.speed * 1.25) * dt);
      const look = playerPos.clone().sub(g.position);
      g.rotation.y = damp(g.rotation.y, Math.atan2(look.x, look.z), 1.6, dt);
      // Beam swings onto the target.
      p.beamMat.opacity = damp(p.beamMat.opacity, 0.2, 2, dt);
      const range = g.position.distanceTo(playerPos);
      p.lamp.intensity = damp(p.lamp.intensity, range < 700 ? 90 : 30, 2, dt);
      p.lamp.target.position.copy(g.worldToLocal(playerPos.clone()));
      p.beam.lookAt(playerPos);
      p.beam.rotateX(-Math.PI / 2);
    } else {
      // Lane patrol: back and forth with a slow sweep of the light.
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
      g.position.addScaledVector(dir, p.speed * dt);
      if (g.position.distanceTo(p.home) > 2600) {
        g.rotation.y += Math.PI;
      }
      g.position.y = damp(g.position.y, terrainHeight(g.position.x, g.position.z) + 500, 0.4, dt);
      p.sweep += dt * 0.5;
      p.beamMat.opacity = damp(p.beamMat.opacity, 0.07, 1.5, dt);
      p.beam.rotation.set(0, 0, Math.sin(p.sweep) * 0.4);
      p.beam.position.set(Math.sin(p.sweep) * 60, -120, 4);
      p.lamp.intensity = damp(p.lamp.intensity, 12, 1, dt);
    }

    const strobe = Math.sin(p.t * 7) > 0.85;
    for (const s of p.strobes) s.material = strobe ? unlit(0xffffff) : unlit(0x3a3a40);
  }

  /** 0..1 for the HUD meter. */
  get meter() { return this.attention; }
  get located() { return this.state === 'located'; }
}

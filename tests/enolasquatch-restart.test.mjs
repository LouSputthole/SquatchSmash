/**
 * The Enola Squatch, 2026-08-06 playtest pass — the three things the owner
 * reported, tested where they can be tested without a browser.
 *
 *   1. THE RESTART. "The enola restart from latest checkpoint bug still happens
 *      where everything is already blown up and I cant redrop the bomb."
 *      `TargetCity.destroy()` had no undo at all, so every restart after a drop
 *      was flown at an empty crater. The city is built, flattened (fireball AND
 *      shock front) and restored here, and the restore is held against a
 *      byte-for-byte copy of the standing city taken before the bomb went off —
 *      which is the only test that catches "half the town came back scaled to
 *      zero". Then it is destroyed a second time, because a restore that cannot
 *      be followed by another raid is not a restore.
 *
 *      `../src/enolasquatch/scenes/TargetCity.js` was previously called out as
 *      untestable here because it paints canvases; `tools/three-shim.mjs`'s
 *      `ensureDomShim()` (installed by `tests/run.mjs` before any module loads)
 *      now supplies the canvas, and the geometry this file looks at is real.
 *
 *   2. THE MARKERS. "I also want a diamond marker on the city where to drop the
 *      bomb and a diamond marker on the airport for the return." The phase
 *      table and the projection are both pure functions and are exercised as
 *      such — including the case that matters most, the target going behind the
 *      aeroplane, where a naive projection mirrors the arrow onto the wrong
 *      side of the screen.
 *
 *   3. FOR SHOW. "Lets just have all the flak and fighters for show." A real
 *      `Defense` is fired at a real position with `liveFire` off and on, and
 *      the assertion is that the SHOW is identical and only the damage differs.
 *
 * Two more things the restart turned out to be, both found while fixing the
 * first: the crew were silent through a replayed leg because every `once: true`
 * beat was already in `dialogue.played`, and `Defense.damage` — a second,
 * parallel record of what has been shot off — survived a restore that had just
 * rebuilt all four engines. Both are exercised below.
 *
 * The browser half — that the restored city really renders, that the diamond is
 * really on the glass, and that the second bomb really detonates — is
 * `tools/verify-enolasquatch.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { TargetCity, WINDOW_GLOW, DEAD_WINDOW_GLOW } = await import('../src/enolasquatch/scenes/TargetCity.js');
const { EnolaSquatch } = await import('../src/enolasquatch/scenes/EnolaSquatch.js');
const { PartKit } = await import('../src/enolasquatch/scenes/PartKit.js');
const { Defense, LETHAL_RADIUS, FLAK_PUFF_SECONDS } = await import('../src/enolasquatch/combat/Defense.js');
const { AC_ENOLA, LIVE_FIRE, CHECKPOINTS, CRATER } = await import('../src/enolasquatch/config.js');
const { AC } = await import('../src/beefrun/config.js');
const {
  MissionController, NAV_BY_PHASE, NAV_CITY, NAV_FIELD, evaluateClimbTurnProgress,
} = await import('../src/enolasquatch/mission/MissionController.js');

/* ------------------------------------------------------------------ */
/* 1. The city comes back                                              */
/* ------------------------------------------------------------------ */

const CITY_X = 9000;
const CITY_Z = -500;

function buildCity() {
  const scene = new THREE.Scene();
  const city = new TargetCity(scene, {
    x: CITY_X,
    z: CITY_Z,
    // Gently rolling, so nothing in the restore can accidentally pass by
    // assuming one flat elevation for the whole town.
    getHeight: (x, z) => 228 + Math.sin(x / 400) * 6 + Math.cos(z / 350) * 4,
  });
  return { scene, city };
}

/** Every instanced buffer in the city, copied. The thing a restore must equal. */
function photograph(city) {
  const shot = [];
  city.group.traverse((o) => {
    if (!o.isInstancedMesh) return;
    shot.push({
      name: o.name,
      count: o.count,
      matrix: Float32Array.from(o.instanceMatrix.array),
      colour: o.instanceColor ? Float32Array.from(o.instanceColor.array) : null,
    });
  });
  return shot;
}

function compare(city, shot) {
  const now = new Map();
  city.group.traverse((o) => { if (o.isInstancedMesh) now.set(o.name, o); });
  const differing = [];
  for (const s of shot) {
    const o = now.get(s.name);
    if (!o) { differing.push(`${s.name}: gone from the scene`); continue; }
    if (o.count !== s.count) { differing.push(`${s.name}: count ${o.count} != ${s.count}`); continue; }
    for (let i = 0; i < s.matrix.length; i++) {
      if (Math.abs(o.instanceMatrix.array[i] - s.matrix[i]) > 1e-4) {
        differing.push(`${s.name}: matrix element ${i}`);
        break;
      }
    }
    if (!s.colour || !o.instanceColor) continue;
    for (let i = 0; i < s.colour.length; i++) {
      if (Math.abs(o.instanceColor.array[i] - s.colour[i]) > 1e-4) {
        differing.push(`${s.name}: colour element ${i}`);
        break;
      }
    }
  }
  return differing;
}

test('the city that gets built is a real city with things to knock down', () => {
  const { city } = buildCity();
  const stats = city.stats();
  assert.ok(stats.buildings > 800, `only ${stats.buildings} lots`);
  assert.ok(stats.landmarks > 15, `only ${stats.landmarks} landmarks`);
  assert.equal(city.destroyed, false);
  assert.equal(city.lots.filter((l) => l.gone).length, 0);
  assert.equal(city.parts.streets.visible, true);
  assert.equal(city.parts.river.visible, true);
  assert.equal(city.parts.buildingWallMat.emissiveIntensity, WINDOW_GLOW);
});

test('the Fat Squatch takes the middle of it away and the shock front takes the rest', () => {
  const { scene, city } = buildCity();
  const total = city.lots.length;
  city.destroy(new THREE.Vector3(CITY_X, 230, CITY_Z));

  assert.equal(city.destroyed, true);
  /* The fireball takes the middle and leaves the outskirts, which is the whole
   * reason the city (1180 m) is wider than the crater (620 m): about a quarter
   * of the lots by area go at once and the rest are left standing for the front
   * to work through. Both bounds matter — take none and there is no flash, take
   * all and there is nothing to watch the blast wave do. */
  const flattenedByFireball = city.lots.filter((l) => l.gone).length;
  assert.ok(flattenedByFireball > total * 0.15, `fireball only took ${flattenedByFireball}/${total}`);
  assert.ok(flattenedByFireball < total * 0.5, `fireball took ${flattenedByFireball}/${total} — nothing left for the front`);
  assert.equal(city.parts.streets.visible, false);
  assert.equal(city.parts.river.visible, false);
  assert.equal(city.parts.buildingWallMat.emissiveIntensity, DEAD_WINDOW_GLOW);
  assert.ok(city.crater, 'no crater record');
  assert.ok(scene.children.includes(city.crater.mesh), 'the crater mesh is not in the scene');

  // And then the front, all the way out past the far edge of town.
  city.advanceShock(CRATER.radius + CRATER.rimWidth + city.cfg.radius * 2);
  assert.equal(city.lots.filter((l) => l.gone).length, total, 'the front missed some of the town');
  assert.equal(city.landmarks.filter((l) => l.alive).length, 0, 'a landmark survived the blast');
  assert.equal(city.shockComplete, true);
});

test('restoring the checkpoint puts Squatchbourg back, exactly, down to the last instance', () => {
  const { scene, city } = buildCity();
  const before = photograph(city);
  const standing = city.lots.length;
  const landmarks = city.landmarks.length;

  city.destroy(new THREE.Vector3(CITY_X + 90, 230, CITY_Z - 40));
  city.advanceShock(4000);
  const craterMesh = city.crater.mesh;
  const craterGlow = city.crater.glow;

  assert.equal(city.restore(), true);

  // The whole town, standing, in the place it was standing in.
  assert.deepEqual(compare(city, before), [], 'the restored city does not match the built one');
  assert.equal(city.lots.filter((l) => !l.gone).length, standing);
  assert.equal(city.landmarks.filter((l) => l.alive).length, landmarks);
  assert.equal(city.parts.streets.visible, true, 'the street plate is still hidden');
  assert.equal(city.parts.river.visible, true, 'the river is still hidden');
  assert.equal(city.parts.buildingWallMat.emissiveIntensity, WINDOW_GLOW, 'the lights are still out');
  assert.equal(city.destroyed, false);
  assert.equal(city.flattened, 0);
  assert.equal(city.shockRadius, 0);

  // And the hole is gone, off the scene and freed.
  assert.equal(city.crater, null);
  assert.equal(scene.children.includes(craterMesh), false, 'the crater mesh is still in the scene');
  assert.equal(scene.children.includes(craterGlow), false, 'the crater glow is still in the scene');
});

test('and it can be bombed all over again — a restore is not a one-way door either', () => {
  const { scene, city } = buildCity();
  city.destroy(new THREE.Vector3(CITY_X, 230, CITY_Z));
  city.advanceShock(4000);
  city.restore();

  const point = new THREE.Vector3(CITY_X - 60, 230, CITY_Z + 30);
  const crater = city.destroy(point);
  assert.ok(crater, 'the second raid produced no crater');
  assert.equal(city.destroyed, true);
  assert.ok(scene.children.includes(crater.mesh), 'the second crater is not in the scene');
  assert.ok(city.lots.filter((l) => l.gone).length > 0, 'the second bomb flattened nothing');
  assert.equal(city.parts.streets.visible, false);

  // The second shock front has a full queue to work through, not a spent one.
  const knocked = city.advanceShock(4000);
  assert.ok(knocked > 0, 'the second shock front had nothing left to knock over');
  assert.equal(city.lots.filter((l) => l.gone).length, city.lots.length);
});

test('restoring a city that was never bombed is a no-op, not a rebuild', () => {
  const { city } = buildCity();
  assert.equal(city.restore(), false);
  assert.equal(city.destroyed, false);
});

test('PartKit.show puts a hidden part back on the transform mount() gave it', () => {
  const kit = new PartKit('test-kit');
  const a = kit.box({ x: 4, y: 9, z: -2, w: 3, h: 12, d: 3, ry: 0.4, colour: 0x998877 });
  kit.cyl({ x: 0, y: 1, z: 0, r: 2, h: 4 });
  kit.mount(new THREE.Group());

  const mesh = kit.meshes.get(a.key);
  const built = new THREE.Matrix4();
  mesh.getMatrixAt(a.index, built);

  assert.equal(kit.hide(a), true);
  const hidden = new THREE.Matrix4();
  mesh.getMatrixAt(a.index, hidden);
  assert.notDeepEqual([...hidden.elements], [...built.elements]);

  assert.equal(kit.show(a), true);
  const back = new THREE.Matrix4();
  mesh.getMatrixAt(a.index, back);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(back.elements[i] - built.elements[i]) < 1e-6);
  assert.equal(kit.show(null), false);
});

/* ------------------------------------------------------------------ */
/* Which checkpoints get a city                                        */
/* ------------------------------------------------------------------ */

test('every checkpoint at or before the drop restores the city; the leg after it does not', () => {
  const restores = (name) => MissionController.prototype.restoresTheCity.call({}, name);
  assert.equal(restores('takeoff'), true);
  assert.equal(restores('turnOnCourse'), true);
  assert.equal(restores('preRelease'), true);
  // `return` is the leg AFTER the drop: the bomb has been delivered in that
  // timeline, so a player who crashes on the way home comes back to the crater
  // he made rather than to a city he has to bomb twice.
  assert.equal(restores('return'), false);
  assert.equal(restores('nonsense'), false);
  // And the rule is positional, so a checkpoint inserted later still answers.
  assert.deepEqual(CHECKPOINTS, ['takeoff', 'turnOnCourse', 'preRelease', 'return']);
});

test('turning east a little early cannot strand the mission in the climb instruction', () => {
  /* A player who starts the called turn before crossing the exact z=-2600
   * line stops travelling south. The old z-only gate then waited forever even
   * though the aeroplane was safely clear of the field and already on 090. */
  let onCourseSeconds = 0;
  let turnCalled = false;
  for (let i = 0; i < 4 * 60; i++) {
    const gate = evaluateClimbTurnProgress({
      x: 2200,
      z: -1600,
      agl: 340,
      headingDeg: 90,
      turnCalled,
      onCourseSeconds,
    }, 1 / 60);
    turnCalled ||= gate.callTurn;
    onCourseSeconds = gate.onCourseSeconds;
    if (gate.ready) {
      assert.equal(turnCalled, true);
      assert.ok(i / 60 < 3.2, 'an already-correct heading still waited too long');
      return;
    }
  }
  assert.fail('the early east turn never entered cruise');
});

test('a restart lets the crew say the beats belonging to the legs it replays, and only those', () => {
  const said = [
    'preflight.arrival', 'preflight.done', 'taxi.line', 'takeoff.rotate',
    'cruise.settle', 'detect.corridor', 'defense.opening', 'fighters.first',
    'bomb.cityInSight', 'bomb.packageAway', 'bomb.breakTurn',
    'explosion.flash', 'explosion.crater', 'escape.turn', 'emergency.overheat',
    'landing.line', 'arrival.lou',
  ];
  const run = (name) => {
    const played = new Set(said);
    const self = { dialogue: { played, forget: (...ids) => ids.forEach((id) => played.delete(id)) } };
    const n = MissionController.prototype.forgetReplayedBeats.call(self, name);
    return { n, left: [...played] };
  };

  /* Restarting at the target replays the bombing run, the blast, the escape and
   * the way home — and nothing before it. The walkaround banter, the taxi and
   * the takeoff calls are NOT forgotten: a player restarting over Squatchbourg
   * should not have to sit through Sasole introducing the aeroplane again. */
  const pre = run('preRelease');
  assert.equal(pre.n, 8);
  assert.deepEqual(pre.left, [
    'preflight.arrival', 'preflight.done', 'taxi.line', 'takeoff.rotate',
    'cruise.settle', 'detect.corridor', 'defense.opening', 'fighters.first',
    'arrival.lou',
  ]);

  // Further back replays more of it.
  assert.ok(run('turnOnCourse').n > pre.n);
  assert.ok(run('takeoff').n > run('turnOnCourse').n);
  assert.equal(run('takeoff').left.filter((id) => id.startsWith('preflight.')).length, 2);

  // And the leg home replays only the landing.
  assert.deepEqual(run('return').left.filter((id) => id.startsWith('landing.')), []);
  assert.equal(run('return').n, 1);

  assert.equal(MissionController.prototype.forgetReplayedBeats.call({}, 'preRelease'), 0);
});

/* ------------------------------------------------------------------ */
/* 2. The two diamonds                                                 */
/* ------------------------------------------------------------------ */

test('the city marker is up for the whole run in and the field marker for the way home', () => {
  for (const phase of ['cruise', 'detection', 'defense', 'bombApproach', 'bombMalfunction', 'release']) {
    assert.equal(NAV_BY_PHASE[phase], NAV_CITY, `${phase} should point at the city`);
  }
  for (const phase of ['return', 'landing']) {
    assert.equal(NAV_BY_PHASE[phase], NAV_FIELD, `${phase} should point at the field`);
  }
  /* And it is DOWN everywhere else. The explosion and the escape matter most:
   * a diamond captioned SQUATCHBOURG sitting on a crater is the screen telling
   * the player to bomb somewhere he has just finished bombing. */
  for (const phase of ['walkaround', 'nightfall', 'preflight', 'taxi', 'takeoff',
    'climbTurn', 'explosion', 'escape', 'emergency', 'epilogue', 'idle']) {
    assert.equal(NAV_BY_PHASE[phase], undefined, `${phase} should have no marker`);
  }
  assert.equal(NAV_CITY.label, 'SQUATCHBOURG');
  assert.equal(NAV_FIELD.label, 'WHISPERING PINES');
  // The city marker stands over the tallest thing in town rather than inside it.
  assert.ok(NAV_CITY.up > 132);
});

test('every resolved emergency can hand off to return even when its engine stops', () => {
  const makeMission = ({ running = true, hotScript = 70 } = {}) => {
    const engine = { running, dead: false, hotScript };
    const self = {
      phase: 'emergency',
      phaseTime: 2,
      _emergencyResolved: false,
      _emergencyEngineIndex: 0,
      _emergencyPushFailAt: null,
      engines: {
        engines: [engine],
        kill() { engine.running = false; },
      },
      dialogue: { play() {} },
      setPhase(name) { self.phase = name; },
    };
    return { self, engine };
  };

  const shutdown = makeMission();
  assert.equal(MissionController.prototype.chooseEmergencyResponse.call(shutdown.self, 'shutdown'), true);
  assert.equal(shutdown.engine.running, false, 'shutdown did not stop the selected engine');
  MissionController.prototype.updateEmergency.call(shutdown.self, 1 / 60);
  assert.equal(shutdown.self.phase, 'return', 'the shutdown choice stranded the mission in emergency');

  const starved = makeMission({ running: false, hotScript: 35 });
  assert.equal(MissionController.prototype.chooseEmergencyResponse.call(starved.self, 'baby'), true);
  MissionController.prototype.updateEmergency.call(starved.self, 1 / 60);
  assert.equal(starved.self.phase, 'return', 'a fuel-starved engine stranded the mission in emergency');
});

test('a running emergency engine still waits for its authored heat timer', () => {
  const engine = { running: true, hotScript: 0.5 };
  const self = {
    phase: 'emergency',
    phaseTime: 2,
    _emergencyResolved: true,
    _emergencyEngineIndex: 0,
    _emergencyPushFailAt: null,
    engines: { engines: [engine] },
    dialogue: { play() {} },
    setPhase(name) { self.phase = name; },
  };
  MissionController.prototype.updateEmergency.call(self, 1 / 60);
  assert.equal(self.phase, 'emergency');
  engine.hotScript = 0;
  MissionController.prototype.updateEmergency.call(self, 1 / 60);
  assert.equal(self.phase, 'return');
});

/** A camera at `from`, looking along `dir`, the way the projection expects. */
function lookingCamera(from, at) {
  const cam = new THREE.PerspectiveCamera(62, 960 / 600, 0.5, 20000);
  cam.position.set(from.x, from.y, from.z);
  cam.lookAt(at.x, at.y, at.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

test('the diamond sits on the place when the place is ahead, and pins to the frame when it is not', () => {
  const self = { groundAt: () => 230 };
  const target = { x: 9000, z: -500, up: 300, label: 'SQUATCHBOURG' };
  const eye = { x: 6000, y: 640, z: -500 };

  self.camera = lookingCamera(eye, { x: target.x, y: 530, z: target.z });
  const ahead = MissionController.prototype.projectNav.call(self, target, 1.6);
  assert.equal(ahead.onScreen, true);
  assert.ok(Math.abs(ahead.x - 50) < 6, `diamond at ${ahead.x}% across, expected the middle`);
  assert.ok(Math.abs(ahead.y - 50) < 8, `diamond at ${ahead.y}% down, expected the middle`);
  assert.equal(ahead.label, 'SQUATCHBOURG');
  assert.equal(ahead.nm, 1.6);

  // Turned away: the arrow pins to an edge and points BACK, not to a mirrored
  // position on the far side of the glass.
  self.camera = lookingCamera(eye, { x: 0, y: 530, z: -500 });
  const behind = MissionController.prototype.projectNav.call(self, target, 1.6);
  assert.equal(behind.onScreen, false);
  const onAnEdge = Math.abs(behind.x - 3) < 1 || Math.abs(behind.x - 97) < 1
    || Math.abs(behind.y - 5) < 1 || Math.abs(behind.y - 95) < 1;
  assert.ok(onAnEdge, `off-screen arrow at (${behind.x}, ${behind.y}) is not on a frame edge`);

  // Off to one side: on the correct side, still on the glass or on its edge.
  self.camera = lookingCamera(eye, { x: 6600, y: 640, z: -2400 });
  const right = MissionController.prototype.projectNav.call(self, target, 1.6);
  assert.ok(right.x > 50, `target is off to the left of the nose; got ${right.x}%`);
});

test('the HUD is told about exactly one target a frame, and told to hide it when there is none', () => {
  const shown = [];
  const flightHud = {
    setNav: (n) => shown.push(['nav', n && n.label]),
    setDirection: (d) => shown.push(['dir', d && d.label]),
  };
  const self = {
    flightHud,
    groundAt: () => 42,
    camera: lookingCamera({ x: 4000, y: 600, z: -500 }, { x: 0, y: 200, z: 0 }),
    physics: { position: new THREE.Vector3(4000, 600, -500), headingDeg: 270 },
    navTarget: MissionController.prototype.navTarget,
    projectNav: MissionController.prototype.projectNav,
  };

  self.phase = 'return';
  const home = MissionController.prototype.updateNavMarker.call(self);
  assert.equal(home, NAV_FIELD);
  assert.deepEqual(shown, [['nav', 'WHISPERING PINES'], ['dir', 'WHISPERING PINES']]);
  // 4 km out is a shade over two nautical miles, and the HUD prints that number.
  assert.ok(Math.abs(self.navRange - 2.18) < 0.05, `range came out at ${self.navRange} NM`);

  shown.length = 0;
  self.phase = 'escape';
  assert.equal(MissionController.prototype.updateNavMarker.call(self), null);
  assert.deepEqual(shown, [['nav', null], ['dir', null]]);
  assert.equal(self.navRange, null);
});

/* ------------------------------------------------------------------ */
/* 3. For show                                                         */
/* ------------------------------------------------------------------ */

/** Burst a shell right on top of the aeroplane, `n` times, and see what it cost. */
function bombardment(liveFire, n = 40) {
  const scene = new THREE.Scene();
  const defense = new Defense(scene, { getHeight: () => 240, liveFire });
  defense.deploy({ x: 9000, z: -500 }, { groundY: 240, radius: 460, patrolPlanes: 0 });
  const at = new THREE.Vector3(9000, 640, -500);
  const heard = [];
  const shrapnel = [];
  defense.onFlakBurst = (d, point, severity) => heard.push({ d, severity });
  defense.onShrapnel = (d) => shrapnel.push(d);
  for (let i = 0; i < n; i++) {
    // Dead on the aeroplane: inside LETHAL_RADIUS, so every one of these is a
    // burst that would have taken something off it.
    defense._burst(at.clone().add(new THREE.Vector3(0, LETHAL_RADIUS * 0.4, 0)), at);
  }
  return {
    heard: heard.length,
    shrapnel: shrapnel.length,
    hitCount: defense.hitCount,
    nearMisses: defense.nearMisses,
    enginesOut: defense.damage.engines.filter(Boolean).length,
    anyDamage: defense.hitCount > 0
      || defense.damage.rudder || defense.damage.electrical || defense.damage.fuel,
    flakInTheSky: defense._activeFlak.length,
  };
}

test('a battery firing blanks puts up exactly the same barrage and takes nothing off the aeroplane', () => {
  const show = bombardment(false);
  const real = bombardment(true);

  // The show is identical: every burst is drawn, heard, counted as a near miss
  // and reported to the mission with its real distance.
  assert.equal(show.heard, 40);
  assert.equal(show.heard, real.heard);
  assert.equal(show.flakInTheSky, real.flakInTheSky);
  assert.equal(show.nearMisses, real.nearMisses);

  // And the consequence is the only difference.
  assert.equal(show.anyDamage, false, 'a "for show" battery still damaged the aeroplane');
  assert.equal(show.enginesOut, 0);
  assert.equal(real.anyDamage, true, 'a live battery did not damage the aeroplane');
  assert.ok(real.hitCount > 0);
});

test('spent flak puffs recycle promptly instead of hanging as black circles in the sky', () => {
  const defense = new Defense(new THREE.Scene(), { getHeight: () => 240, liveFire: false });
  defense.deploy({ x: 9000, z: -500 }, { groundY: 240, radius: 460, patrolPlanes: 0 });
  const at = new THREE.Vector3(9000, 640, -500);
  defense._burst(at, at);
  assert.equal(defense._activeFlak.length, 1);
  defense._updateFlak(FLAK_PUFF_SECONDS + 0.1);
  assert.equal(defense._activeFlak.length, 0, 'the spent puff is still floating');
  assert.ok(FLAK_PUFF_SECONDS <= 6, `${FLAK_PUFF_SECONDS}s is still a persistent sky decal`);
});

test('the damage API still works when something else calls it — nothing was deleted', () => {
  const defense = new Defense(new THREE.Scene(), { getHeight: () => 240, liveFire: false });
  const hits = [];
  defense.onHit = (kind, detail) => hits.push([kind, detail]);
  // This is the path the blast wave and the mission's own scripted beats use,
  // and it is deliberately NOT gated: the bomb still costs you something.
  assert.equal(defense.damageEngine(2), true);
  assert.equal(defense.damageElectrical(), true);
  assert.deepEqual(defense.damage.engines, [false, false, true, false]);
  assert.equal(defense.hitCount, 2);
  assert.deepEqual(hits, [['engine', 2], ['electrical', undefined]]);
});

test('the for-show flags are both off, and both flippable', () => {
  assert.equal(LIVE_FIRE.flak, false);
  assert.equal(LIVE_FIRE.fighters, false);
  // Not frozen: the owner may want the beating back, and the campaign may.
  LIVE_FIRE.fighters = true;
  assert.equal(LIVE_FIRE.fighters, true);
  LIVE_FIRE.fighters = false;
  // And a Defense built with no opinion is live, because a class that shoots
  // blanks by default is a trap for the next mission that reuses it.
  assert.equal(new Defense(new THREE.Scene(), {}).liveFire, true);
});

/* ------------------------------------------------------------------ */
/* Ten per cent more power                                             */
/* ------------------------------------------------------------------ */

test('the Enola Squatch got ten per cent more thrust and the Brushrunner got none', () => {
  // 12430 N per engine was the 2026-08-04 figure; this is exactly ten per cent
  // over it, and the owner asked for "like 10%".
  assert.equal(AC_ENOLA.thrustMax, 13673);
  assert.ok(Math.abs(AC_ENOLA.thrustMax / 12430 - 1.1) < 1e-9);

  // Loaded thrust-to-weight is still worse than the Brushrunner's, so "difficult
  // to climb while loaded" is still true — it just stops sagging out of the
  // altitude the bombing run is flown at.
  const loaded = AC_ENOLA.emptyMass + AC_ENOLA.fuelMass + AC_ENOLA.payloadMass;
  const enolaTW = (AC_ENOLA.thrustMax * 4) / (loaded * 9.81);
  // The Brushrunner's own loaded figure, exactly as `AC_ENOLA`'s header note
  // computes it: 2350 + 380 kg is its loaded mass, two engines at 5200 N.
  const brushTW = (AC.thrustMax * 2) / ((AC.emptyMass + AC.fuelMass) * 9.81);
  assert.ok(enolaTW > 0.35 && enolaTW < 0.37, `T/W came out at ${enolaTW}`);
  assert.ok(enolaTW < brushTW, 'the heavy bomber now out-climbs the Brushrunner');

  // THE BEEF RUN'S FLIGHT MODEL IS CANONICAL. `thrustMax` is read through the
  // `ac` both `AircraftPhysics` and `EngineSystem` are constructed with, so this
  // change reaches this aeroplane and no other one.
  assert.equal(AC.thrustMax, 5200);
});

/* ------------------------------------------------------------------ */
/* Terrain-impact forgiveness and hard-crash presentation             */
/* ------------------------------------------------------------------ */

function enolaImpactHarness() {
  const events = [];
  const fake = {
    aircraft: {
      destroyed: false,
      explode() {
        this.destroyed = true;
        events.push('explode');
        return true;
      },
    },
    physics: {
      damage: { wing: 0 },
      controls: { throttleL: 0.7, throttleR: 0.7 },
      velocity: new THREE.Vector3(38, -6, 72),
      omega: new THREE.Vector3(0.3, 0.2, 0.4),
    },
    cameras: { addShake: (amount) => events.push(['shake', amount]) },
    audio: { explosion: () => events.push('explosion-sound') },
    engines: {
      engines: [{}, {}, {}, {}],
      kill: (index, reason) => events.push(['kill', index, reason]),
    },
    fail: (reason) => events.push(['fail', reason]),
  };
  return { fake, events };
}

test('Enola terrain contact is forgiving through the light-brush threshold', () => {
  const { fake, events } = enolaImpactHarness();

  MissionController.prototype.onImpact.call(fake, 2.4, 'terrain');

  assert.equal(fake.physics.damage.wing, 0);
  assert.equal(fake.aircraft.destroyed, false);
  assert.deepEqual(events, []);
});

test('Enola terrain impacts damage above 2.4 but do not fail through severity 6.5', () => {
  const { fake, events } = enolaImpactHarness();

  MissionController.prototype.onImpact.call(fake, 6.5, 'terrain');

  assert.ok(fake.physics.damage.wing > 0 && fake.physics.damage.wing < 1);
  assert.equal(fake.aircraft.destroyed, false);
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === 'shake'));
  assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'fail'), false);
  assert.equal(events.includes('explosion-sound'), false);
});

test('Enola terminal-impact failure starts above 6.5, while the fireball waits for 7.6', () => {
  const { fake, events } = enolaImpactHarness();

  MissionController.prototype.onImpact.call(fake, 6.51, 'terrain');

  assert.equal(fake.aircraft.destroyed, false);
  assert.equal(events.includes('explode'), false);
  assert.equal(events.includes('explosion-sound'), false);
  assert.ok(events.some((event) => Array.isArray(event)
    && event[0] === 'fail' && /ground/i.test(event[1])));
});

test('Enola hard terrain crashes create a fireball, sound the explosion, stop the wreck, and fail the run', () => {
  const { fake, events } = enolaImpactHarness();

  MissionController.prototype.onImpact.call(fake, 7.6, 'terrain');

  assert.equal(fake.aircraft.destroyed, true);
  assert.ok(events.includes('explode'));
  assert.ok(events.includes('explosion-sound'));
  assert.deepEqual(
    events.filter((event) => Array.isArray(event) && event[0] === 'kill'),
    [
      ['kill', 0, 'destroyed'],
      ['kill', 1, 'destroyed'],
      ['kill', 2, 'destroyed'],
      ['kill', 3, 'destroyed'],
    ],
  );
  assert.ok(events.some((event) => Array.isArray(event)
    && event[0] === 'fail' && /ground/i.test(event[1])));
  assert.equal(fake.physics.controls.throttleL, 0);
  assert.equal(fake.physics.controls.throttleR, 0);
  assert.ok(fake.physics.velocity.length() < 4, 'the wreck should shed nearly all forward speed');
  assert.equal(fake.physics.omega.length(), 0);
});

test('the real Enola airframe swaps intact geometry for visible crash VFX and restores losslessly', () => {
  const aircraft = new EnolaSquatch();
  const intactChildren = [...aircraft.group.children];

  assert.equal(aircraft.explode(), true);
  assert.equal(aircraft.destroyed, true);
  assert.ok(intactChildren.every((child) => child.visible === false));
  assert.equal(aircraft.explosion?.name, 'enola-squatch-explosion');
  assert.ok(aircraft.explosion.children.some((child) => child.userData.fireball));
  assert.ok(aircraft.explosion.children.some((child) => child.userData.smoke));
  assert.ok(aircraft.explosion.children.some((child) => child.userData.debris));

  aircraft.updateExplosion(0.2);
  assert.ok(aircraft.explosion.userData.age > 0);

  aircraft.resetDestruction();
  assert.equal(aircraft.destroyed, false);
  assert.equal(aircraft.explosion, null);
  assert.ok(intactChildren.every((child) => child.visible === true));
});

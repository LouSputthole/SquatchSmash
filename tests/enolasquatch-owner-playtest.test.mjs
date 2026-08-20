/**
 * The 2026-08-19 owner playtest of the Enola Squatch, as assertions.
 *
 * One test per complaint, phrased against the thing the owner actually said so
 * that a regression reads as the complaint coming back rather than as an
 * abstract number changing. The complaints, in the order he listed them:
 *
 *   Capt Lou "stares hard to the right"; his nose "reads as a giant sphere".
 *   The cockpit glass is missing from outside and culled from inside.
 *   The rear gun "looks detached".
 *   Passengers and loose props must stay parented to the moving aircraft.
 *   The bomb belongs outside on a trolley, and the old restraint interaction
 *     can trap the player.
 *   Shoobs must WALK aboard rather than appear.
 *   The navigation chain has a missing link.
 *   The engine problem leaves the player to consult the spirits.
 *   The tail gun does not track until you fire, and its arc is too narrow.
 *   The return leg needs scripted waves.
 *   The city reads as lava towers, and the world ends past it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { EnolaSquatch, REAR_GUN_ARC },
  { createCrew },
  { FatSquatch },
  { BombTrolley, LOAD_TIMING },
  { GunnerStation },
  {
    MissionController, CLIMB_TURN_GATE, RETURN_WAVES,
    evaluateClimbTurnProgress, headingLabel,
  },
  { WINDOW_GLOW, PER_BUILDING_LIT },
  { buildDistantHorizon, HORIZON_BOUNDS },
  { BEATS, OBJECTIVES },
] = await Promise.all([
  import('../src/enolasquatch/scenes/EnolaSquatch.js'),
  import('../src/enolasquatch/crew.js'),
  import('../src/enolasquatch/payload/FatSquatch.js'),
  import('../src/enolasquatch/payload/BombTrolley.js'),
  import('../src/enolasquatch/systems/GunnerStation.js'),
  import('../src/enolasquatch/mission/MissionController.js'),
  import('../src/enolasquatch/scenes/TargetCity.js'),
  import('../src/enolasquatch/distant-horizon.js'),
  import('../src/enolasquatch/dialogue/script.js'),
]);

/* ------------------------------------------------------------------ */
/* CAPTAIN LOU SASOLE                                                  */
/* ------------------------------------------------------------------ */

test('Capt Sasole engages the player instead of staring off to one side', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);

  const sasole = crew.sasole;
  assert.ok(sasole.gaze, 'a seated man has no gaze at all');

  /* The player's eye, from the aeroplane's own authored anchor. This is the
   * point he was measurably 23 degrees short of before. */
  const eye = aircraft.pilotEye.clone().applyMatrix4(aircraft.group.matrixWorld);
  // Force the "talking to you" state, which is what the owner was looking at:
  // a man mid-line looks at whoever he is talking to for the whole line.
  for (let i = 0; i < 180; i++) { sasole.talk = 4; crew.update(1 / 60, eye); }

  sasole.neck.updateWorldMatrix(true, false);
  const neckAt = sasole.neck.getWorldPosition(new THREE.Vector3());
  const facing = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(sasole.neck.getWorldQuaternion(new THREE.Quaternion()));
  const toPlayer = eye.clone().sub(neckAt).normalize();
  const offDegrees = (Math.acos(Math.max(-1, Math.min(1, facing.dot(toPlayer)))) * 180) / Math.PI;
  assert.ok(offDegrees < 22,
    `Sasole is looking ${offDegrees.toFixed(1)} degrees away from the man he is talking to`);
});

test('a seated man breaks eye contact instead of staring', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const eye = new THREE.Vector3(0.55, 1.42, 7.6);
  const sasole = crew.sasole;
  sasole.talk = 0;
  let brokeOff = false;
  let cameBack = false;
  for (let i = 0; i < 60 * 60; i++) {
    crew.update(1 / 60, eye);
    if (!sasole.gaze.onPlayer) brokeOff = true;
    if (brokeOff && sasole.gaze.onPlayer) cameBack = true;
  }
  assert.equal(brokeOff, true, 'he never once looks away — that is a stare, not a gaze');
  assert.equal(cameBack, true, 'having looked away he never looks back');
});

test('the Sasole face crop is square, so his nose is not stretched into a sphere', () => {
  /* `assets/faces/sasole.png` is 256 x 256 and `faceTexture()` writes the crop
   * straight into offset/repeat. The old [0.08, 0.28, 0.84, 0.35] asked for a
   * 2.17:1 letterbox strip and stretched it onto a nearly square face plate,
   * which is what made the nose a tall pale lobe. */
  const crew = createCrew();
  const material = crew.sasole.head.material;
  assert.ok(Array.isArray(material), 'the photographed head stopped being a six-slot box');
  const face = material[4];              // +Z, the face slot
  const { repeat } = face.map;
  const aspect = repeat.x / repeat.y;
  assert.ok(aspect > 0.8 && aspect < 1.25,
    `the face crop is ${aspect.toFixed(2)}:1 — anything far off square stretches his features`);
});

/* ------------------------------------------------------------------ */
/* AIRCRAFT                                                            */
/* ------------------------------------------------------------------ */

test('every pane of glass is drawn from both sides and never occludes another pane', () => {
  const aircraft = new EnolaSquatch();
  /* By NAME, not by "anything transparent": the spinning propeller discs are
   * transparent too, and a propeller disc is not a window. */
  const GLAZED = /glazing|windshield|window|quarter-light|overhead-panel|blister|astrodome/;
  const panes = [];
  aircraft.group.traverse((object) => {
    if (!object.isMesh || !GLAZED.test(object.name || '')) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (material?.transparent) panes.push({ object, material });
  });
  assert.ok(panes.length >= 8, `only ${panes.length} panes of glass on the whole aeroplane`);
  const single = panes.filter((p) => p.material.side !== THREE.DoubleSide).map((p) => p.object.name);
  assert.deepEqual(single, [], `glass culled from one side (invisible from inside): ${single.join(', ')}`);
  const writing = panes.filter((p) => p.material.depthWrite !== false).map((p) => p.object.name);
  assert.deepEqual(writing, [], `glass writing depth (panes vanish at some angles): ${writing.join(', ')}`);
});

test('the canopy has a windshield, quarter-lights, side windows and a frame round each', () => {
  const aircraft = new EnolaSquatch();
  const names = [];
  aircraft.group.traverse((object) => { if (object.name) names.push(object.name); });
  for (const wanted of [
    'cockpit-windshield',
    'cockpit-windshield-frame-header',
    'cockpit-windshield-frame-sill',
    'cockpit-windshield-frame-rail-port',
    'cockpit-windshield-frame-rail-starboard',
    'cockpit-quarter-light-port',
    'cockpit-quarter-light-starboard',
    'cockpit-side-window-port',
    'cockpit-side-window-starboard',
    'cockpit-side-window-frame-header-port',
    'cockpit-overhead-panel',
  ]) {
    assert.ok(names.includes(wanted), `the canopy is missing ${wanted}`);
  }
});

test('every occupied seat on the aeroplane has a restraint on it', () => {
  // Owner playtest, 2026-08-19, in the polish audit: "restraints on every
  // occupied seat". Four men fly this aeroplane; two of them had nothing.
  const aircraft = new EnolaSquatch();
  const names = [];
  aircraft.group.traverse((object) => { if (object.name) names.push(object.name); });
  assert.ok(names.filter((n) => n === 'cockpit-seat-lap-belt').length >= 3,
    'the flight-deck seats lost their belts');
  assert.ok(names.includes('rear-gun-seat-lap-belt'), 'the tail gunner has no lap belt');
  assert.ok(names.includes('rear-gun-seat-shoulder-strap-port'),
    'the tail gunner has no shoulder harness');
  assert.ok(names.includes('bombardier-seat-pan'), 'the bombardier has nothing to sit on');
  assert.ok(names.includes('bombardier-seat-strap'), 'the bombardier has no restraint');
});

test('the rear gun is bolted to the aeroplane rather than floating behind it', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  /* The gap the owner was seeing: the tail boom's aft face against the rear-gun
   * fairing's forward lip. Measure it through the actual world boxes rather
   * than through the constants, so moving either one is caught. */
  const box = (object) => {
    const b = new THREE.Box3().setFromObject(object);
    return b;
  };
  const mountStructure = aircraft.parts.rearGunStation.getObjectByName('rear-gun-mount-structure');
  assert.ok(mountStructure, 'there is no connecting structure between the tail and the gun');
  const cone = mountStructure.getObjectByName('rear-gun-mount-tailcone');
  assert.ok(cone, 'the tail-cone extension is missing');
  const coneBox = box(cone);
  const fairing = aircraft.parts.rearGunStation.getObjectByName('rear-gun-fairing');
  assert.ok(fairing, 'the rear-gun fairing is not resolvable');
  const fairingBox = box(fairing);

  // The boom is the 5.8 m tapered cylinder in the tail structure.
  let boomAft = null;
  aircraft.group.traverse((object) => {
    if (object.isMesh && object.geometry?.type === 'CylinderGeometry'
      && Math.abs(object.geometry.parameters.height - 5.8) <= 1e-6) {
      boomAft = box(object).min.z;
    }
  });
  assert.ok(boomAft !== null, 'the tail boom is not resolvable');

  // Forward lip of the extension must meet the boom, and its aft end the fairing.
  assert.ok(coneBox.max.z >= boomAft - 0.05,
    `the connecting structure stops ${(boomAft - coneBox.max.z).toFixed(2)} m short of the boom`);
  assert.ok(coneBox.min.z <= fairingBox.max.z + 0.05,
    `the connecting structure stops ${(coneBox.min.z - fairingBox.max.z).toFixed(2)} m short of the gun`);

  // And the hierarchy the owner asked for: airframe -> mount -> swivel -> weapon.
  assert.equal(aircraft.parts.rearGunMount, aircraft.parts.rearGunStation);
  assert.equal(aircraft.parts.rearGunTurret.parent, aircraft.parts.rearGunStation);
  assert.equal(aircraft.parts.rearGunYoke.parent, aircraft.parts.rearGunTurret);
  const brackets = ['rear-gun-mount-bracket-port', 'rear-gun-mount-bracket-starboard',
    'rear-gun-mount-keel-strut', 'rear-gun-mount-joint-collar'];
  for (const name of brackets) {
    assert.ok(mountStructure.getObjectByName(name), `the mount has no ${name}`);
  }
});

test('everybody and everything aboard rides the airframe when it moves', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  const payload = new FatSquatch();
  const scene = new THREE.Group();
  scene.add(aircraft.group);
  const trolley = new BombTrolley({
    scene, aircraft, payload, park: { x: 0, z: 0, heading: 90, elev: 0 },
  });
  trolley.forceSeat();
  crew.takeSeats(aircraft);

  /* THE SINGLE MOST IMPORTANT ITEM IN THE AIRCRAFT LIST (owner, 2026-08-19):
   * "verify passengers AND loose props stay parented to the moving aircraft.
   * Anything not properly parented starts flying independently the moment the
   * plane moves." So: move the aeroplane a long way and confirm everything
   * came with it, by world position rather than by inspecting parents. */
  const riders = [
    ...crew.all.map((f) => ({ name: f.name, object: f.group })),
    { name: 'fat-squatch', object: payload.group },
  ];
  aircraft.group.updateMatrixWorld(true);
  const before = riders.map((r) => ({
    ...r, at: r.object.getWorldPosition(new THREE.Vector3()),
  }));

  aircraft.group.position.set(4000, 900, -2600);
  aircraft.group.rotation.set(0.2, 1.1, -0.3);
  aircraft.group.updateMatrixWorld(true);

  const local = new THREE.Matrix4().copy(aircraft.group.matrixWorld);
  for (const rider of before) {
    const now = rider.object.getWorldPosition(new THREE.Vector3());
    const expected = rider.at.clone().applyMatrix4(local);
    assert.ok(now.distanceTo(expected) < 0.01,
      `${rider.name} did not ride the aeroplane — it is ${now.distanceTo(expected).toFixed(1)} m adrift`);
  }
});

/* ------------------------------------------------------------------ */
/* THE BOMB                                                            */
/* ------------------------------------------------------------------ */

test('the Fat Squatch starts outside on a trolley and LOAD puts it in the bay', () => {
  const aircraft = new EnolaSquatch();
  const payload = new FatSquatch();
  const scene = new THREE.Group();
  scene.add(aircraft.group);
  aircraft.group.position.set(-58, 3, 342);
  const trolley = new BombTrolley({
    scene, aircraft, payload, park: { x: -58, z: 342, heading: 90, elev: 0 },
  });

  // Outside, on the concrete, where a man on foot can walk round it.
  assert.notEqual(payload.group.parent, aircraft.anchors.payloadMount);
  scene.updateMatrixWorld(true);
  const onCart = payload.group.getWorldPosition(new THREE.Vector3());
  const belly = aircraft.group.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.hypot(onCart.x - belly.x, onCart.z - belly.z) > 4,
    'the bomb is still under the aeroplane rather than out on the apron');
  assert.ok(onCart.y < 2.6, 'the bomb is above head height — nobody can read it');

  // LOAD FAT SQUATCH, then run the whole sequence out.
  assert.equal(trolley.beginLoad(), true);
  const total = LOAD_TIMING.roll + LOAD_TIMING.lift + LOAD_TIMING.withdraw;
  assert.ok(total < 8, `the load animation runs for ${total}s — the owner asked for SIMPLE`);
  for (let t = 0; t < total + 1; t += 1 / 60) trolley.update(1 / 60);
  assert.equal(trolley.state, 'done');
  assert.equal(trolley.loaded, true);
  assert.equal(payload.group.parent, aircraft.anchors.payloadMount);
  assert.deepEqual(
    [payload.group.position.x, payload.group.position.y, payload.group.position.z], [0, 0, 0],
  );
  // And the cart is back out from under the aeroplane.
  scene.updateMatrixWorld(true);
  assert.ok(trolley.group.position.distanceTo(trolley.parked) < 0.05);
});

test('the mount has shackles, sway braces and a visible release', () => {
  const aircraft = new EnolaSquatch();
  const payload = new FatSquatch();
  const scene = new THREE.Group();
  scene.add(aircraft.group);
  const trolley = new BombTrolley({
    scene, aircraft, payload, park: { x: 0, z: 0, heading: 0, elev: 0 },
  });
  const names = [];
  aircraft.anchors.payloadMount.traverse((o) => { if (o.name) names.push(o.name); });
  for (const wanted of ['bomb-shackle-beam', 'bomb-shackle', 'bomb-sway-brace-port',
    'bomb-release-lever', 'bomb-release-linkage']) {
    assert.ok(names.includes(wanted), `the bomb bay has no ${wanted}`);
  }
  assert.ok(trolley.shackles.releaseLever, 'no release lever was built');
});

test('boarding cannot leave the bomb on the concrete', () => {
  const aircraft = new EnolaSquatch();
  const payload = new FatSquatch();
  const scene = new THREE.Group();
  scene.add(aircraft.group);
  const trolley = new BombTrolley({
    scene, aircraft, payload, park: { x: 0, z: 0, heading: 0, elev: 0 },
  });
  trolley.beginLoad();
  trolley.update(0.2);                        // barely started
  trolley.forceSeat();
  assert.equal(payload.group.parent, aircraft.anchors.payloadMount);
  assert.equal(trolley.state, 'done');
});

/* ------------------------------------------------------------------ */
/* SHOOBS                                                             */
/* ------------------------------------------------------------------ */

test('the Shubenator walks to the door and ends up in the turret', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  const scene = new THREE.Group();
  scene.add(aircraft.group);
  crew.standOnApron(scene, { x: 0, z: 0, heading: 90, elev: 0 });
  scene.add(crew.shubes.group);

  const start = crew.shubes.group.position.clone();
  let aboard = false;
  assert.equal(crew.sendShubesAboard(aircraft, () => { aboard = true; }), true);

  const seen = new Set();
  for (let i = 0; i < 90 * 60 && !aboard; i++) {
    crew.update(1 / 60, new THREE.Vector3(20, 1.7, 0));
    seen.add(`${crew.shubes.group.position.x.toFixed(0)},${crew.shubes.group.position.z.toFixed(0)}`);
  }
  assert.equal(aboard, true, 'he never made it to the door');
  // He WALKED: many distinct positions, not one teleport.
  assert.ok(seen.size > 12, `he moved through only ${seen.size} positions — that is a teleport`);
  assert.ok(crew.shubes.group.position.distanceTo(start) !== 0);
  // And he is in the tail turret, riding the aeroplane.
  assert.equal(crew.shubes.group.parent, aircraft.parts.rearGunSeatMount);
  assert.equal(crew.shubes.pose, 'sit');
  // The joke survives.
  assert.ok(BEATS['preflight.shubes.aboard'][0].text.startsWith('Hey guys'),
    'the Shubenator stopped saying the only thing he ever says');
});

/* ------------------------------------------------------------------ */
/* NAVIGATION                                                          */
/* ------------------------------------------------------------------ */

test('the heading is called on time alone, however badly the climb goes', () => {
  /* The owner's forgiving condition: "airborne ~10-15s, OR above a minimum
   * altitude, OR a short distance from the runway". The bomber that cannot
   * climb and never leaves the overhead still gets told where to go. */
  let called = false;
  let airborne = 0;
  for (let i = 0; i < 30 * 60 && !called; i++) {
    airborne += 1 / 60;
    const gate = evaluateClimbTurnProgress({
      x: 0, z: 0, agl: 40, headingDeg: 180, turnCalled: false, onCourseSeconds: 0,
      airborneSeconds: airborne,
    }, 1 / 60);
    called = gate.callTurn;
  }
  assert.equal(called, true, 'a low, slow, close-in climb-out is never given a heading');
  assert.ok(airborne <= CLIMB_TURN_GATE.seconds + 0.2,
    `it took ${airborne.toFixed(1)}s to name a heading`);
  assert.ok(CLIMB_TURN_GATE.seconds >= 10 && CLIMB_TURN_GATE.seconds <= 15,
    'the automatic heading call left the owner’s 10-15 second window');
});

test('the new heading reaches the banner, the objective and the compass', () => {
  let drained = false;
  const said = [];
  const shown = [];
  const self = Object.assign(Object.create(MissionController.prototype), {
    phase: 'climbTurn',
    flags: { turnCalled: false },
    physics: { position: new THREE.Vector3(0, 0, 0), headingDeg: 180 },
    dialogue: { play(id) { said.push(id); }, get busy() { return said.length > 0 && !drained; }, forget() {} },
    hud: { say(html) { shown.push(html); } },
    flightHud: { setObjective() {}, setNav() {}, setDirection() {} },
    objective: '',
    setObjective(text) { self.objective = text; },
    groundAt: () => 0,
    camera: null,
    navRange: null,
  });
  assert.equal(self.callNewHeading(90), true);
  assert.equal(self.flags.turnCalled, true);
  assert.ok(said.includes('climb.turn.east'), 'nobody said the heading out loud');
  /* QUEUED BEHIND THE RADIO, never over it (owner: "if another character is
   * talking when the nav trigger fires, QUEUE the heading instruction and play
   * it immediately afterwards rather than losing it"). While the crew are
   * talking the banner is held and NOT lost; the moment they stop it appears. */
  self._drainInstruction();
  assert.deepEqual(shown, [], 'the heading banner wiped a crew line off the screen');
  drained = true;
  self._drainInstruction();
  assert.ok(shown.some((html) => html.includes('NEW HEADING') && html.includes('090')),
    `NEW HEADING never went on the glass: ${shown.join(' | ')}`);
  assert.match(self.objective, /090/, 'the heading never reached the persistent objective');
  // And the compass has something to point at.
  const nav = self.navTarget();
  assert.ok(nav, 'the compass has no target during the climb-out');
  assert.match(nav.label, /090/);
  const bearing = ((Math.atan2(nav.x - 0, nav.z - 0) * 180) / Math.PI + 360) % 360;
  assert.ok(Math.abs(bearing - 90) < 0.5, `the compass points at ${bearing.toFixed(1)}, not 090`);
  // Queued, never urgent: a heading called over somebody else's line must wait,
  // not wipe the queue.
  assert.equal(headingLabel(90), '090');
});

test('a player who ignores the heading gets nagged, and only then', () => {
  const said = [];
  const self = Object.assign(Object.create(MissionController.prototype), {
    dialogue: { play(id) { said.push(id); }, busy: false, forget() {} },
    _headingNagT: CLIMB_TURN_GATE.nagAfter,
    _headingNagIndex: 0,
  });
  // Already turning: silence, however long you wait.
  for (let i = 0; i < 60 * 60; i++) self.nagHeading(1 / 60, 90, 10);
  assert.deepEqual(said, [], 'the crew nag a player who is already in the turn');
  // Wandering off: Sasole first, then somebody else.
  let t = 0;
  for (let i = 0; i < 60 * 60; i++) { self.nagHeading(1 / 60, 90, 170); t += 1 / 60; }
  void t;
  assert.ok(said.length >= 2, 'the crew never nag a player flying the wrong way');
  assert.equal(said[0], 'nav.nag.sasole', 'the captain does not speak first');
  assert.notEqual(said[1], said[0], 'the same line repeats instead of alternating');
  assert.ok(BEATS['nav.nag.sasole'][0].text.includes('sightseeing'),
    'the owner’s own nag line is gone');
});

/* ------------------------------------------------------------------ */
/* THE ENGINE PROBLEM                                                  */
/* ------------------------------------------------------------------ */

test('the engine problem names the fault, the engine and the control', () => {
  assert.match(OBJECTIVES.ENGINE_OVERHEAT, /OVERHEAT/);
  assert.match(OBJECTIVES.ENGINE_OVERHEAT, /THROTTLE BACK/);
  const lines = BEATS['emergency.overheat'].map((l) => l.text).join(' ');
  assert.match(lines, /throttle/i, 'nobody tells the player what to do about it');
  assert.match(BEATS['emergency.stabilised'][0].text, /Hold it there/,
    'the owner’s stabilised line is gone');
});

/* ------------------------------------------------------------------ */
/* THE TAIL GUN                                                        */
/* ------------------------------------------------------------------ */

test('the turret follows the aim before the trigger, not after it', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const eye = aircraft.rearGunEyeWorld(new THREE.Vector3());
  // Somewhere well off the neutral sweep, inside the arc.
  const aim = eye.clone().add(new THREE.Vector3(120, 30, -300));

  const phys = { time: 0, onGround: false, suspension: [0, 0, 0], groundSpeed: 0 };
  // Manned, trigger UP. This is the case that used to run the idle sweep.
  for (let i = 0; i < 120; i++) {
    aircraft.updateRearGun(1 / 60, phys, { gunTracking: true, gunFiring: false, gunAim: aim });
  }
  const tracked = aircraft.parts.rearGunTurret.rotation.y;

  // The same aim with neither flag: the idle sweep, which must NOT be pointing
  // at the target — otherwise this test proves nothing.
  const idle = new EnolaSquatch();
  for (let i = 0; i < 120; i++) idle.updateRearGun(1 / 60, phys, {});
  assert.notEqual(tracked.toFixed(3), idle.parts.rearGunTurret.rotation.y.toFixed(3));

  // And it really is aimed: read the barrels back against the reticle.
  const station = new GunnerStation({ aircraft, interceptors: { fighters: [] } });
  station.manned = true;
  station.pointAt(aim);
  assert.ok(Math.abs(tracked - station.yaw) < 0.02,
    `the barrels sit ${(tracked - station.yaw).toFixed(3)} rad off the reticle without firing`);
});

test('the turret arc is wide enough to follow something passing beside you', () => {
  // 1.02 rad (58 degrees) was the old stop and it is what the owner called too
  // narrow. "Substantially" wider means the barrels can reach past 75 degrees.
  assert.ok(REAR_GUN_ARC.traverse > 1.3,
    `traverse is still ${REAR_GUN_ARC.traverse} rad each side`);
  assert.ok(REAR_GUN_ARC.up > 0.7 && REAR_GUN_ARC.down < -0.5, 'the vertical arc did not widen');
  // The control limits and the model stops must be the same numbers.
  const aircraft = new EnolaSquatch();
  const station = new GunnerStation({ aircraft, interceptors: { fighters: [] } });
  station.manned = true;
  station.look(-100000, -100000);
  assert.equal(station.yaw, REAR_GUN_ARC.traverse);
  assert.equal(station.pitch, REAR_GUN_ARC.up);
});

test('the tail gun is the return leg’s toy and refuses on the way out', () => {
  const said = [];
  const base = {
    physics: { onGround: false },
    autopilot: { engaged: true, engage: () => true, disengage() {} },
    gunner: { manned: false, take() { this.manned = true; return true; } },
    crew: { setRearGunnerManned() {} },
    cameras: { setView() {} },
    dialogue: { play(id) { said.push(id); }, bark(id) { said.push(`bark:${id}`); } },
    hud: { say() {} },
  };
  const outbound = Object.assign(Object.create(MissionController.prototype), base, {
    gunOffered: false,
  });
  assert.equal(outbound.toggleGun(), false, 'the tail gun was available outbound');
  assert.equal(outbound.gunner.manned, false);

  const homeward = Object.assign(Object.create(MissionController.prototype), {
    ...base,
    gunner: { manned: false, take() { this.manned = true; return true; } },
    gunOffered: true,
  });
  assert.equal(homeward.toggleGun(), true, 'the tail gun refused on the way home');
});

test('Sasole hands the aeroplane over with the key on screen', () => {
  const said = [];
  const instructions = [];
  const self = Object.assign(Object.create(MissionController.prototype), {
    gunOffered: false,
    dialogue: { play(id) { said.push(id); } },
    autopilot: { engaged: false, engage() { this.engaged = true; return true; } },
    objective: '',
    setObjective(text) { self.objective = text; },
    armCombatInstruction(html) { instructions.push(html); },
  });
  assert.equal(self.offerTailGun(), true);
  assert.equal(self.offerTailGun(), false, 'the handover happens more than once');
  assert.ok(said.includes('fighters.sasoleTakesIt'));
  assert.match(BEATS['fighters.sasoleTakesIt'][0].text, /Plane.s mine/,
    'the owner’s own handover line is gone');
  assert.ok(instructions.some((html) => /T\b/.test(html) && /TAIL GUN/.test(html)),
    `the T prompt never appeared: ${instructions.join(' | ')}`);
  assert.equal(self.autopilot.engaged, true, 'nobody is flying the aeroplane');
  assert.match(self.objective, /tail gun/i);
});

/* ------------------------------------------------------------------ */
/* FIGHTER WAVES                                                       */
/* ------------------------------------------------------------------ */

test('the return leg is several distinct waves over one to two minutes', () => {
  assert.ok(RETURN_WAVES.length >= 4, `only ${RETURN_WAVES.length} waves on the way home`);
  const last = RETURN_WAVES[RETURN_WAVES.length - 1];
  assert.ok(last.at >= 60 && last.at <= 150,
    `the last wave arrives at ${last.at}s — the owner asked for one to two minutes of action`);
  // Timings strictly increase, counts build, and no two consecutive waves read
  // the same from the turret.
  for (let i = 1; i < RETURN_WAVES.length; i++) {
    assert.ok(RETURN_WAVES[i].at > RETURN_WAVES[i - 1].at, 'two waves arrive out of order');
    assert.ok(RETURN_WAVES[i].count >= RETURN_WAVES[i - 1].count, 'the fight stops building');
    assert.notDeepEqual(RETURN_WAVES[i].profiles, RETURN_WAVES[i - 1].profiles,
      `wave ${i} attacks exactly like wave ${i - 1}`);
  }
  assert.ok(RETURN_WAVES[RETURN_WAVES.length - 1].aggression > RETURN_WAVES[0].aggression,
    'the last wave is no more dangerous than the first');
});

/* ------------------------------------------------------------------ */
/* THE WORLD                                                           */
/* ------------------------------------------------------------------ */

test('the city is mostly dark, so its lights read as lights', () => {
  assert.ok(WINDOW_GLOW <= 0.25, `window glow is still ${WINDOW_GLOW} — that is a lava tower`);
  const { dark, partial, lit } = PER_BUILDING_LIT;
  assert.ok(dark >= 0.5, `only ${(dark * 100).toFixed(0)}% of buildings are unlit`);
  assert.ok(dark + partial + lit < 1, 'there are no "occasional bright ones" left over');
  assert.ok(dark > partial && partial > lit, 'the majority of the city is not the darkest case');
});

test('the world does not stop past the city', () => {
  const scene = new THREE.Group();
  const detailed = { boundsX: [-1400, 14500], boundsZ: [-4200, 1000] };
  const horizon = buildDistantHorizon(scene, {
    getHeight: () => 200,
    detailed,
  });
  // It reaches a long way past the route's own terrain in every direction.
  assert.ok(HORIZON_BOUNDS.x1 - detailed.boundsX[1] > 10000, 'nothing east of the city');
  assert.ok(detailed.boundsX[0] - HORIZON_BOUNDS.x0 > 10000, 'nothing west of the field');
  assert.ok(HORIZON_BOUNDS.z1 - detailed.boundsZ[1] > 10000, 'nothing south of the route');
  assert.ok(detailed.boundsZ[0] - HORIZON_BOUNDS.z0 > 10000, 'nothing north of the route');

  // It is cheap: one coarse field, one instanced treeline, one haze shell.
  const verts = horizon.ground.geometry.attributes.position.count;
  assert.ok(verts < 12000, `the backdrop is ${verts} vertices — that is not a low-detail mesh`);
  assert.ok(horizon.silhouettes.count > 50, 'there is no treeline on the distant hills');
  assert.ok(horizon.haze, 'there is no atmospheric backdrop');

  /* It must never poke through the terrain the aeroplane is actually flown
   * against. Inside the detailed bounds it is buried; check the vertices. */
  const positions = horizon.ground.geometry.attributes.position;
  const cx = horizon.ground.position.x;
  const cz = horizon.ground.position.z;
  let highestInside = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const x = cx + positions.getX(i);
    const z = cz + positions.getZ(i);
    if (x < detailed.boundsX[0] || x > detailed.boundsX[1]) continue;
    if (z < detailed.boundsZ[0] || z > detailed.boundsZ[1]) continue;
    highestInside = Math.max(highestInside, positions.getY(i));
  }
  assert.ok(highestInside < 200 - 40,
    `the backdrop reaches ${highestInside.toFixed(0)} m inside the route, under ground at 200 m`);
  horizon.dispose();
});

/**
 * THE REAL LAB HAS TO ANSWER TO THE CONTRACT IT PUBLISHES.
 *
 * `src/mansion/mission/contract-lab.js` calls itself "the written form of the
 * contract" and says: *"If the real lab and this file disagree, one of them is
 * wrong, and which one is a conversation rather than a mystery."* Nothing
 * checked. They disagreed on three names for eleven days, and it was a
 * mystery.
 *
 *   contract        real lab      what the mission does with it
 *   ---------       ----------    ------------------------------------------
 *   stepOut()       leaveLab()    Beat 7 — Aubbie walks out through the glass
 *   tryHandle()     tryDoor()     Beat 8 — Bezmenov's silent handle-try
 *   slam()          pound()       Beat 10 — fists on the glass
 *
 * `SilentSquatchMission` calls all three as `body?.method?.()`, which is
 * correct defensive style and is exactly what hid this: an optional call to a
 * method that does not exist is a no-op with no error, no warning and no
 * failing test — because `silent-squatch-mission.test.mjs` drives the DOUBLE,
 * and the double had all three.
 *
 * The consequence was not cosmetic. Aubbie never left the sealed lab, so
 * "Eliminate Aubbie" was an order to shoot a man twelve metres away behind
 * twelve centimetres of glass, and `mount.js`'s fallback aim is a five-degree
 * cone around `body.position` — which is a figure's ORIGIN, i.e. the floor
 * between his feet. That is the softlock the owner hit.
 *
 * So this file builds the REAL lab, headless, and asserts the surface. It is
 * docs/ENGINE-TRAPS.md #5 in a sentence: the double is not the thing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

/* The lab bakes canvas textures at module load — the monitors, the life-signs
 * readout, the radiation trefoils. One shared stub, installed before the
 * import, for the reason `ensureDomShim` gives: a per-file `??=` stub only
 * wins if this happens to be the first file in `tests/run.mjs` to declare one,
 * and it is not. */
ensureDomShim();

const {
  buildSilentSquatch, GLASS_WALL, SEALED_LAB, STAIRWELL,
} = await import('../src/mansion/scenes/SilentSquatch.js');
const { BLOOD_MARK_NAME, BLOOD_POOL_NAME } = await import('../src/world/blood.js');
const { createContractLab } = await import('../src/mansion/mission/contract-lab.js');
const {
  createSilentSquatchMission, COLLAPSE_ORDER,
} = await import('../src/mansion/mission/SilentSquatchMission.js');
const { mountSilentSquatch } = await import('../src/mansion/mission/mount.js');
const { S } = await import('../src/mansion/mission/SilentSquatchStateMachine.js');
const { SEQUENCES, SCIENTIST_INDEX, gainForVoice } = await import('../src/mansion/script.js');

/** Build it once — it is ~200 ms and ~15 MB, and nothing here mutates shared state. */
function realLab() {
  const built = buildSilentSquatch();
  return built.lab;
}

/** Every method the contract's own scientist publishes. */
function contractScientistMethods() {
  const one = createContractLab().scientists[0];
  return Object.keys(one).filter((k) => typeof one[k] === 'function').sort();
}

test('the real lab implements every method the contract publishes for a scientist', () => {
  const missing = [];
  const lab = realLab();
  for (const body of lab.scientists) {
    for (const method of contractScientistMethods()) {
      if (typeof body[method] !== 'function') missing.push(`scientists[${body.index}].${method}`);
    }
  }
  assert.deepEqual(missing, [],
    'the mission calls these through `?.()`, so a missing one is a silent no-op');
});

test('the real lab implements the contract at the top level too', () => {
  const contract = createContractLab();
  const lab = realLab();
  const missing = [];
  for (const key of ['openDoor', 'closeDoor', 'lockDoor']) {
    if (typeof lab[key] !== 'function') missing.push(`lab.${key}`);
  }
  for (const key of ['arm', 'enter']) {
    if (typeof lab.keypad?.[key] !== 'function') missing.push(`lab.keypad.${key}`);
  }
  if (typeof lab.transferDrawer?.send !== 'function') missing.push('lab.transferDrawer.send');
  for (const key of ['begin', 'complete']) {
    if (typeof lab.core?.[key] !== 'function') missing.push(`lab.core.${key}`);
  }
  if (typeof lab.monitors?.setPurple !== 'function') missing.push('lab.monitors.setPurple');
  if (typeof lab.gas?.start !== 'function') missing.push('lab.gas.start');
  for (const key of ['open', 'close']) {
    if (typeof lab.hiddenWall?.[key] !== 'function') missing.push(`lab.hiddenWall.${key}`);
  }
  assert.deepEqual(missing, []);
  /* And the same six people, so an index the mission uses by name (Aubbie is
   * 0, Bezmenov is 3) means the same man in both worlds. */
  assert.equal(lab.scientists.length, contract.scientists.length);
});

test('THE SOFTLOCK: stepOut walks Aubbie out of the sealed lab, not just a flag', () => {
  const built = buildSilentSquatch();
  const aubbie = built.lab.scientists[0];

  /* He starts at the core, well inside the sealed half. */
  assert.ok(aubbie.position.z < SEALED_LAB.z1, 'Aubbie does not start inside the lab');
  assert.equal(aubbie.inside, true);

  aubbie.stepOut();
  /* Fifteen seconds of simulated walking — generous, because the assertion is
   * "did he arrive", not "how fast". See docs/ENGINE-TRAPS.md #2 and #5. */
  for (let i = 0; i < 60 * 15; i++) built.update(1 / 60, { position: { x: 0, y: 0, z: 0 } });

  assert.equal(aubbie.inside, false, 'the lab still thinks he is behind the glass');
  assert.ok(
    aubbie.position.z > GLASS_WALL.z1,
    `Aubbie stopped at z ${aubbie.position.z.toFixed(2)}, still on the lab side of the glass`,
  );
  /* And he is out in the open in front of the pane, not wedged in the door
   * pocket — the brief wants his body to fall "in full view of the
   * scientists through the glass". */
  assert.ok(aubbie.position.z > GLASS_WALL.z1 + 1.0);
});

test('the execution has a body to aim at, so it never falls back to the cone', () => {
  const lab = realLab();
  /* `mission/mount.js` prefers `lab.aubbieTarget`, then `body.object`. With
   * neither it aims a five-degree cone at `body.position`, which is the floor
   * between his feet. Both are published now; this is the assertion that
   * stops them being quietly dropped. */
  assert.ok(lab.aubbieTarget, 'the lab publishes nothing for the shot to hit');
  assert.equal(lab.aubbieTarget, lab.scientists[0].object);
  assert.ok(typeof lab.aubbieTarget.traverse === 'function', 'that is not a scene object');
});

test('Aubbie keeps the real ray point on his body and uses the shared death pool', () => {
  const built = buildSilentSquatch();
  const aubbie = built.lab.scientists[0];
  let struck = null;
  built.lab.aubbieTarget.traverse((object) => { if (!struck && object.isMesh) struck = object; });
  assert.ok(struck, 'Aubbie published no mesh for the execution ray');
  built.root.updateMatrixWorld(true);
  const point = struck.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.03, 0.04, 0.02));
  const hit = {
    object: struck,
    point: point.clone(),
    normal: new THREE.Vector3(0, 0, 1),
    from: point.clone().add(new THREE.Vector3(0, 0.2, 3)),
  };

  aubbie.shot(hit);
  built.root.updateMatrixWorld(true);
  const wound = built.lab.blood.impacts.marksFor(aubbie)
    .find((mark) => mark.name === BLOOD_MARK_NAME);
  assert.ok(wound, 'the shared impact system left no Aubbie wound');
  assert.ok(wound.getWorldPosition(new THREE.Vector3()).distanceTo(point) <= 0.008,
    'Aubbie received a guessed chest wound instead of the ray point');
  assert.equal(wound.userData.reusableSystem, 'blood');
  assert.equal(aubbie.deathPool.name.startsWith(BLOOD_POOL_NAME), true);
  assert.ok(Math.abs(aubbie.deathPool.position.y - (built.lab.datums.LAB_FLOOR + 0.006)) < 1e-6,
    'Aubbie death pool was left at wound height');

  const before = wound.getWorldPosition(new THREE.Vector3());
  aubbie.collapse();
  for (let i = 0; i < 90; i++) built.update(1 / 60);
  built.root.updateMatrixWorld(true);
  const after = wound.getWorldPosition(new THREE.Vector3());
  assert.ok(after.distanceTo(before) > 0.2, 'the exact wound stayed behind when Aubbie fell');
  assert.equal(wound.parent?.isGroup, true, 'the wound was attached to a scaled mesh');
});

test('the production execution ray preserves point, world normal, object, and shooter origin', () => {
  const built = buildSilentSquatch();
  const scene = new THREE.Scene();
  scene.add(built.root);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const target = built.lab.aubbieTarget;
  built.root.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
  camera.position.copy(centre).add(new THREE.Vector3(0, 0.15, 4));
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const mounted = mountSilentSquatch({
    THREE,
    scene,
    camera,
    lab: built.lab,
    autoStart: false,
    missionHud: {
      setObjective() {}, setInstruction() {}, setCallout() {},
      showLine() {}, hideLine() {}, setKeypad() {}, setKeypadDigits() {},
      text: () => ({}),
    },
  });
  const hit = mounted.debug.resolveAubbieHit();

  assert.ok(hit?.point?.isVector3, 'the production ray collapsed its point to a boolean');
  assert.ok(hit?.object?.isObject3D, 'the struck body part was not preserved');
  assert.ok(hit?.normal?.isVector3, 'the face normal was not preserved');
  assert.ok(Math.abs(hit.normal.length() - 1) < 1e-6, 'the normal was not world-normalized');
  assert.ok(hit.from.distanceTo(camera.position) < 1e-6, 'the shooter origin was replaced');
  assert.equal(mounted.debug.aimResolved, 'mesh');

  const preview = mounted.debug.previewAubbieHit();
  assert.ok(preview?.point?.isVector3 && preview?.normal?.isVector3,
    'checkpoint staging still collapses the strict hit record');
  assert.ok(preview.object?.isObject3D && preview.from?.isVector3);
  assert.equal(preview.object, built.lab.scientists[0].fig.chest,
    'preview staging is not anchored to the real Aubbie body');
  assert.equal(mounted.debug.zones.corridor.y, built.lab.anchors.corridor.y,
    'the production mount dropped the lower corridor floor from its trigger');
  assert.ok(mounted.debug.zones.corridor.verticalTolerance > 0
    && mounted.debug.zones.corridor.verticalTolerance < 2,
  'the production corridor trigger has no bounded vertical tolerance');
});

test('the production mount compares floor anchors to a real Player foot position', () => {
  const built = buildSilentSquatch();
  const scene = new THREE.Scene();
  scene.add(built.root);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const anchor = built.lab.anchors.xxx;
  const player = {
    eyeHeight: 1.66,
    position: new THREE.Vector3(anchor.x, anchor.y + 7.8 + 1.66, anchor.z),
  };
  const mounted = mountSilentSquatch({
    THREE,
    scene,
    camera,
    player,
    lab: built.lab,
    missionHud: {
      setObjective() {}, setInstruction() {}, setCallout() {},
      showLine() {}, hideLine() {}, setKeypad() {}, setKeypadDigits() {},
      text: () => ({}),
    },
  });
  const xxxCue = SEQUENCES.xxxHanging[0].cue;

  for (let i = 0; i < 60 * 10; i++) mounted.update(1 / 60);
  assert.equal(mounted.debug.report().cues.includes(xxxCue), false,
    'the upstairs Player eye position consumed xXx\'s lower-level threshold');

  /* Player.position is camera/eye height. The authored anchor is a floor
   * datum, so the mount must compare the anchor to the Player's feet. */
  player.position.y = anchor.y + player.eyeHeight;
  for (let i = 0; i < 60 * 10; i++) mounted.update(1 / 60);
  assert.equal(mounted.debug.report().cues.includes(xxxCue), true,
    'the same-floor Player eye position missed xXx\'s threshold');
});

test('every fatal Mansion laboratory figure leaves exactly one shared floor pool', () => {
  const built = buildSilentSquatch();
  for (const scientist of built.lab.scientists) scientist.collapse();
  assert.equal(built.lab.inventory.bloodPools, 6,
    'the six fatal scientist transitions did not each spill a pool');

  assert.equal(built.lab.xxx.kill('whip'), true);
  assert.equal(built.lab.inventory.bloodPools, 7,
    'xXx death did not add the seventh Mansion fatal pool');
  const visible = built.lab.blood.deathPools.meshes.filter((mesh) => mesh.visible);
  assert.equal(visible.length, 7);
  assert.ok(visible.every((mesh) => mesh.name.startsWith(BLOOD_POOL_NAME)));
  assert.ok(visible.every((mesh) => Math.abs(mesh.position.y - (built.lab.datums.LAB_FLOOR + 0.006)) < 1e-6),
    'one shared death pool is floating at body height');
  assert.ok(built.lab.xxx.fatalMarks.every((mark) => mark.userData.reusableSystem === 'blood'));
});

test('collapsed laboratory scientists finish on the epoxy instead of below it', () => {
  const built = buildSilentSquatch();
  for (const scientist of built.lab.scientists) scientist.collapse();
  for (let i = 0; i < 120; i++) built.update(1 / 60);
  built.root.updateMatrixWorld(true);

  for (const scientist of built.lab.scientists) {
    const bounds = new THREE.Box3().setFromObject(scientist.fig.group);
    assert.ok(Math.abs(bounds.min.y - built.lab.datums.LAB_FLOOR) <= 1e-5,
      `scientist ${scientist.index} ends ${bounds.min.y - built.lab.datums.LAB_FLOOR} m off the epoxy`);
  }
});

test('panicking laboratory scientists take distinct glass lanes instead of converging', () => {
  const built = buildSilentSquatch();
  const trapped = built.lab.scientists.slice(1);
  for (const scientist of trapped) scientist.panic();
  for (let i = 0; i < 60 * 15; i++) built.update(1 / 60);
  built.root.updateMatrixWorld(true);

  for (const scientist of trapped) {
    assert.ok(Math.abs(scientist.position.x - scientist.lane) <= 0.02,
      `scientist ${scientist.index} missed his authored glass lane`);
  }
  const bounds = trapped.map((scientist) => new THREE.Box3().setFromObject(scientist.object));
  const faults = [];
  for (let a = 0; a < bounds.length; a++) {
    for (let b = a + 1; b < bounds.length; b++) {
      const depth = Math.min(
        Math.min(bounds[a].max.x, bounds[b].max.x) - Math.max(bounds[a].min.x, bounds[b].min.x),
        Math.min(bounds[a].max.y, bounds[b].max.y) - Math.max(bounds[a].min.y, bounds[b].min.y),
        Math.min(bounds[a].max.z, bounds[b].max.z) - Math.max(bounds[a].min.z, bounds[b].min.z),
      );
      if (depth > 0.03) faults.push(`${trapped[a].index}/${trapped[b].index}: ${depth.toFixed(3)} m`);
    }
  }
  assert.deepEqual(faults, [], `panic lanes interpenetrate: ${faults.join('; ')}`);
});

test('the Silent Night collapse order leaves separate bodies clear of glass-side fixtures', () => {
  const built = buildSilentSquatch();
  const trapped = built.lab.scientists.slice(1);
  for (const scientist of trapped) scientist.panic();
  for (let i = 0; i < 60 * 15; i++) built.update(1 / 60);
  built.lab.scientists[SCIENTIST_INDEX.SOKOLOV].chairStrike();
  for (let i = 0; i < 120; i++) built.update(1 / 60);
  for (const index of COLLAPSE_ORDER) {
    built.lab.scientists[index].collapse();
    for (let i = 0; i < 66; i++) built.update(1 / 60);
  }
  for (let i = 0; i < 90; i++) built.update(1 / 60);
  built.root.updateMatrixWorld(true);

  const meshesOf = (root) => {
    const meshes = [];
    root.traverse((object) => { if (object.isMesh && object.visible) meshes.push(object); });
    return meshes;
  };
  const bodyMeshes = trapped.map((scientist) => meshesOf(scientist.object));
  const fixtureMeshes = [];
  built.root.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    let cursor = object;
    let token = '';
    while (cursor && cursor !== built.root) {
      token += ` ${cursor.name ?? ''} ${cursor.userData.geometryGate?.assemblyId ?? ''}`;
      cursor = cursor.parent;
    }
    if (/(?:ss-glass-door|ss-door-lock|ss-reinforced-glass|ss-glass-plinth|silent-glass-light-|silent-cable-service-|squatchanium-container|ss-lab-chair)/.test(token)) {
      fixtureMeshes.push(object);
    }
  });

  const depth = (left, right) => {
    const a = new THREE.Box3().setFromObject(left);
    const b = new THREE.Box3().setFromObject(right);
    return Math.min(
      Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x),
      Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y),
      Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z),
    );
  };
  const faults = [];
  for (let a = 0; a < bodyMeshes.length; a++) {
    for (let b = a + 1; b < bodyMeshes.length; b++) {
      for (const left of bodyMeshes[a]) for (const right of bodyMeshes[b]) {
        const amount = depth(left, right);
        if (amount > 0.03) faults.push(`scientists ${trapped[a].index}/${trapped[b].index}: ${amount.toFixed(3)} m`);
      }
    }
    for (const body of bodyMeshes[a]) for (const fixture of fixtureMeshes) {
      const amount = depth(body, fixture);
      if (amount > 0.03) faults.push(`scientist ${trapped[a].index}/${fixture.name || 'fixture'}: ${amount.toFixed(3)} m`);
    }
  }
  assert.deepEqual(faults, [], faults.slice(0, 20).join('; '));
});

test('the glass-strike chair rebounds into the aisle without rotating through the lab floor', () => {
  const built = buildSilentSquatch();
  const chair = built.root.getObjectByName('ss-lab-chair');
  assert.ok(chair, 'the physical lab chair is missing');
  built.lab.scientists[SCIENTIST_INDEX.SOKOLOV].chairStrike();
  for (let i = 0; i < 120; i++) built.update(1 / 60);
  built.root.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(chair);
  assert.ok(built.lab.inventory.chairBent > 0.99, 'the scripted chair strike never reached its bent pose');
  assert.ok(Math.abs(bounds.min.y - built.lab.datums.LAB_FLOOR) < 0.001,
    `bent chair foot drifted ${(bounds.min.y - built.lab.datums.LAB_FLOOR).toFixed(4)} m from the lab floor`);
});

test('laboratory handprints sit on the lab-side face of the glass', () => {
  const built = buildSilentSquatch();
  const scientist = built.lab.scientists[0];
  scientist.handprint();
  built.root.updateMatrixWorld(true);
  const handprint = built.root.getObjectByName('ss-handprint');
  assert.ok(handprint, 'scientist handprint was not mounted');
  const paneLabFace = (GLASS_WALL.z0 + GLASS_WALL.z1) / 2 - 0.07;
  assert.ok(Math.abs(handprint.getWorldPosition(new THREE.Vector3()).z - (paneLabFace - 0.001)) <= 1e-6,
    'handprint is not one millimetre off the lab-side pane face');
  assert.deepEqual(handprint.userData.geometryGate, {
    assemblyId: 'silent-handprint-0',
    checkSupport: false,
    fixedSupportAnchor: true,
    checkWallEmbed: false,
  });
});

test('xXx proxy hits attach to his moving body and leave only one shared pool', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const point = built.lab.xxx.aim.getWorldPosition(new THREE.Vector3());
  assert.equal(built.lab.xxx.kill('firearm', {
    point,
    object: built.lab.xxx.aim,
    from: point.clone().add(new THREE.Vector3(0, 0, 4)),
  }), true);

  const wound = built.lab.xxx.fatalMarks.find((mark) => mark.userData.bloodEffect === 'impact');
  assert.ok(wound, 'the firearm hit left no shared impact mark');
  assert.notEqual(wound.parent, built.root, 'the aim proxy anchored the wound to the scene');
  const before = wound.getWorldPosition(new THREE.Vector3());
  built.lab.xxx.figure.torso.position.x += 0.35;
  built.root.updateMatrixWorld(true);
  const after = wound.getWorldPosition(new THREE.Vector3());
  assert.ok(after.distanceTo(before) > 0.34, 'the wound stayed behind when xXx moved');

  const legacy = [];
  built.root.traverse((object) => {
    if (/^xxx-blood-pool|^xxx-drip$|mansion\.whipBloodMark/.test(object.name)) legacy.push(object.name);
  });
  assert.deepEqual(legacy, [], 'legacy local blood is still rendering beside the shared pool');
  assert.equal(built.lab.inventory.bloodPools, 1);
  assert.equal(built.lab.xxx.fatalPool.name.startsWith(BLOOD_POOL_NAME), true);

  built.lab.blood.reset();
  assert.equal(built.lab.inventory.bloodPools, 0);
  assert.equal(built.lab.xxx.fatalMarks.length, 0);
  assert.equal(built.lab.xxx.fatalPool, null);
});

test('the top stair camera optical axis points down the flight in world space', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const cameras = [];
  built.root.traverse((object) => { if (object.name === 'ss-camera') cameras.push(object); });
  assert.ok(cameras.length >= 2);
  const stair = cameras.find((object) => object.position.z < STAIRWELL.z1 + 0.1
    && object.position.z > STAIRWELL.z1 - 1.2);
  const body = stair?.getObjectByName('ss-camera-body');
  assert.ok(body, 'the top stair camera body is missing');
  const at = body.getWorldPosition(new THREE.Vector3());
  const optical = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const wanted = new THREE.Vector3(
    (STAIRWELL.x0 + STAIRWELL.x1) / 2,
    built.lab.datums.LAB_Y + 1.2,
    STAIRWELL.z0,
  ).sub(at).normalize();
  assert.ok(optical.dot(wanted) > 0.995,
    `stair camera optical axis misses the flight (dot ${optical.dot(wanted).toFixed(3)})`);
});

test('the continuous stair service pipe clears the stepped soffit and stays connected', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const segments = [];
  const couplings = [];
  const hangers = [];
  const stairShell = [];
  built.root.traverse((object) => {
    if (/^ss-stair-pipe-\d+$/.test(object.name)) segments.push(object);
    if (/^ss-stair-pipe-coupling-\d+$/.test(object.name)) couplings.push(object);
    if (object.name === 'ss-stair-pipe-hanger') hangers.push(object);
    if (['ss-stair-soffit', 'ss-stair-soffit-riser'].includes(object.name)) stairShell.push(object);
  });
  assert.equal(segments.length, 5);
  assert.equal(couplings.length, 4);
  assert.equal(hangers.length, 5);
  for (const object of [...segments, ...couplings, ...hangers]) {
    assert.equal(object.userData.geometryGate?.assemblyId, 'silent-stair-service-pipe');
  }

  const byZ = (left, right) => new THREE.Box3().setFromObject(left).min.z
    - new THREE.Box3().setFromObject(right).min.z;
  segments.sort(byZ);
  couplings.sort(byZ);
  for (let i = 0; i < couplings.length; i++) {
    const joint = new THREE.Box3().setFromObject(couplings[i]);
    assert.equal(joint.intersectsBox(new THREE.Box3().setFromObject(segments[i])), true,
      `pipe coupling ${i} misses its lower segment`);
    assert.equal(joint.intersectsBox(new THREE.Box3().setFromObject(segments[i + 1])), true,
      `pipe coupling ${i} misses its upper segment`);
  }

  const faults = [];
  for (const pipe of [...segments, ...couplings]) {
    const a = new THREE.Box3().setFromObject(pipe);
    for (const shell of stairShell) {
      const b = new THREE.Box3().setFromObject(shell);
      const depth = Math.min(
        Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x),
        Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y),
        Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z),
      );
      if (depth > 0.03) faults.push(`${pipe.name} enters ${shell.name} by ${depth.toFixed(3)} m`);
    }
  }
  assert.deepEqual(faults, [], faults.join('; '));
});

test('cable bundles pass through framed plinth sleeves instead of solid glass', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const bundles = [];
  const drops = [];
  const looseRuns = [];
  const ducts = [];
  const glassLightMeshes = [];
  built.root.traverse((object) => {
    if (/^ss-cable-bundle-\d+$/.test(object.name)) bundles.push(object);
    if (/^ss-cable-drop-\d+$/.test(object.name)) drops.push(object);
    if (/^ss-cable-run-\d+-\d+$/.test(object.name)) looseRuns.push(object);
    if (/^ss-cable-duct-\d+$/.test(object.name)) ducts.push(object);
    if (object.isMesh
      && /^silent-glass-light-\d+$/.test(object.userData.geometryGate?.assemblyId ?? '')) {
      glassLightMeshes.push(object);
    }
  });
  assert.equal(bundles.length, 4);
  assert.equal(drops.length, 4);
  assert.equal(looseRuns.length, 20);
  assert.equal(ducts.length, 4);
  for (let i = 0; i < 4; i++) {
    const assemblyId = `silent-cable-service-${i}`;
    assert.equal(bundles.find((object) => object.name.endsWith(`-${i}`))
      ?.userData.geometryGate?.assemblyId, assemblyId);
    const duct = ducts.find((object) => object.name.endsWith(`-${i}`));
    assert.equal(duct?.userData.geometryGate?.assemblyId, assemblyId);
    assert.equal(duct?.userData.geometryGate?.fixedSupportAnchor, true);
    const bounds = new THREE.Box3().setFromObject(
      bundles.find((object) => object.name.endsWith(`-${i}`)),
    );
    assert.ok(bounds.min.z < GLASS_WALL.z0 - 0.1 && bounds.max.z > GLASS_WALL.z1 + 0.1,
      `cable bundle ${i} does not visibly pass through the wall sleeve`);
  }

  const faults = [];
  for (const cable of [...bundles, ...drops, ...looseRuns]) {
    const a = new THREE.Box3().setFromObject(cable);
    for (const glass of glassLightMeshes) {
      const b = new THREE.Box3().setFromObject(glass);
      const depth = Math.min(
        Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x),
        Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y),
        Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z),
      );
      if (depth > 0.03) faults.push(`${cable.name} enters glass/plinth by ${depth.toFixed(3)} m`);
    }
  }
  assert.deepEqual(faults, [], faults.join('; '));
});

test('the sealed lab has no unsupported robotic arms or floating yellow bases', () => {
  const built = buildSilentSquatch();
  const arms = [];
  built.root.traverse((object) => { if (object.name === 'ss-robot-arm') arms.push(object); });
  assert.equal(arms.length, 0);
  assert.equal(built.lab.inventory.roboticArms, 0);
});

test('the core containment rig clears every laboratory fluorescent at rest', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const core = built.root.getObjectByName('silent-squatch-core');
  assert.equal(core.userData.geometryGate?.assemblyId, 'silent-squatch-core');
  const ringMeshes = [];
  core.traverse((object) => {
    if (object.isMesh && object.parent?.name === 'core-ring') ringMeshes.push(object);
  });
  const tubes = [];
  built.root.traverse((object) => {
    if (object.name === 'ss-fluoro') tubes.push(object);
  });
  for (const ring of ringMeshes) {
    const ringBox = new THREE.Box3().setFromObject(ring);
    for (const tube of tubes) {
      assert.equal(ringBox.intersectsBox(new THREE.Box3().setFromObject(tube)), false,
        'a containment ring enters a fluorescent fitting in the built lab');
    }
  }
});

test('core floor cables are named, floor-seated, and no wider than 30 mm', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const cables = [];
  built.root.traverse((object) => {
    if (/^silent-squatch-core-cable-\d+$/.test(object.name)) cables.push(object);
  });
  assert.equal(cables.length, 6);
  for (const cable of cables) {
    const bounds = new THREE.Box3().setFromObject(cable);
    assert.ok(Math.abs(bounds.min.y - built.lab.datums.LAB_Y) <= 0.001,
      `${cable.name} misses the lab floor by ${(bounds.min.y - built.lab.datums.LAB_Y).toFixed(3)} m`);
    assert.ok(bounds.max.y - bounds.min.y <= 0.025,
      `${cable.name} is ${(bounds.max.y - bounds.min.y).toFixed(3)} m thick`);
    assert.equal(cable.userData.geometryGate?.assemblyId, 'silent-squatch-core');
  }
});

test('animated core arcs publish nonphysical VFX geometry semantics', () => {
  const built = buildSilentSquatch();
  const arcs = [];
  built.root.traverse((object) => {
    if (/^silent-squatch-core-arc-\d+$/.test(object.name)) arcs.push(object);
  });
  assert.equal(arcs.length, 8);
  for (const arc of arcs) {
    assert.deepEqual(arc.userData.geometryGate, {
      assemblyId: 'silent-squatch-core',
      overlap: false,
      checkSupport: false,
    });
  }
});

test('laboratory stools are parked beside their standing scientists', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const stoolSeats = [];
  const figureParts = [];
  built.root.traverse((object) => {
    if (/^ss-station-\d+-stool-seat$/.test(object.name)) stoolSeats.push(object);
  });
  for (const scientist of built.lab.scientists) {
    scientist.fig.group.traverse((object) => {
      if (object.isMesh) figureParts.push(object);
    });
  }
  assert.equal(stoolSeats.length, 6);
  const faults = [];
  for (const stool of stoolSeats) {
    const stoolBox = new THREE.Box3().setFromObject(stool);
    for (const part of figureParts) {
      const partBox = new THREE.Box3().setFromObject(part);
      const x = Math.min(stoolBox.max.x, partBox.max.x) - Math.max(stoolBox.min.x, partBox.min.x);
      const y = Math.min(stoolBox.max.y, partBox.max.y) - Math.max(stoolBox.min.y, partBox.min.y);
      const z = Math.min(stoolBox.max.z, partBox.max.z) - Math.max(stoolBox.min.z, partBox.min.z);
      if (x > 0.03 && y > 0.03 && z > 0.03) faults.push(`${stool.name} enters figure mesh`);
    }
  }
  assert.deepEqual(faults, [], faults.join('; '));
  const tanks = [];
  built.root.traverse((object) => {
    if (/^ss-chemical-tank-\d+$/.test(object.name)) tanks.push(object);
  });
  assert.equal(tanks.length, 4);
  for (const stool of stoolSeats) {
    const stoolBox = new THREE.Box3().setFromObject(stool);
    assert.ok(tanks.every((tank) => !stoolBox.intersectsBox(new THREE.Box3().setFromObject(tank))),
      `${stool.name} enters a chemical tank`);
  }
});

test('laboratory workstation colliders clear the west chemical-tank line', () => {
  const built = buildSilentSquatch();
  const stations = built.colliders.filter((box) => /^silent-station-\d+-collider$/.test(box.name));
  const tanks = built.colliders.filter((box) => /^silent-chemical-tank-\d+-collider$/.test(box.name));
  assert.equal(stations.length, 6);
  assert.equal(tanks.length, 4);
  assert.ok(stations.every((box, index) => box.userData.geometryGate?.assemblyId === `silent-station-${index}`));
  assert.ok(tanks.every((box, index) => box.userData.geometryGate?.assemblyId === `silent-chemical-tank-${index}`));
  for (const station of stations) {
    assert.ok(tanks.every((tank) => !station.intersectsBox(tank)),
      `${station.name} enters a chemical-tank collider`);
  }
});


test('ceiling-mounted laboratory assemblies opt out of floor support checks', () => {
  const built = buildSilentSquatch();
  const mounted = {
    'ss-camera': 4,
    'ss-fluoro': 18,
    'ss-vent': 6,
  };
  for (const [name, expected] of Object.entries(mounted)) {
    const nodes = [];
    built.root.traverse((object) => { if (object.name === name) nodes.push(object); });
    assert.equal(nodes.length, expected, `${name} count drifted`);
    assert.ok(nodes.every((object) => object.userData.geometryGate?.checkSupport === false),
      `${name} does not publish its architectural mounting`);
  }
  assert.equal(built.lab.xxx.group.userData.geometryGate?.checkSupport, false,
    'the xXx hanging rig is treated as a floor-supported prop');
});

test('Aubbie clears stale work gestures before walking out and his hand stays outside his chest', () => {
  const built = buildSilentSquatch();
  const aubbie = built.lab.scientists[0];
  aubbie.fig.playGesture('reach', 60);
  for (let i = 0; i < 90; i++) built.update(1 / 60);
  assert.ok(Math.abs(aubbie.fig.armR.shoulder.rotation.z) > 0.4,
    'fixture never put Aubbie into the clipping-prone work pose');
  aubbie.stepOut();
  built.update(1 / 60);
  built.root.updateMatrixWorld(true);
  const chest = new THREE.Box3().setFromObject(aubbie.fig.chest);
  const hand = new THREE.Box3().setFromObject(aubbie.fig.armR.hand);
  assert.equal(chest.intersectsBox(hand), false, 'Aubbie walked out with his hand through his torso');
  assert.ok(Math.abs(aubbie.fig.armR.shoulder.rotation.z) < 0.02,
    'the stale across-body shoulder rotation survived stepOut');
});

test('Aubbie is compensated through sealed glass at the real observation distance', () => {
  const built = buildSilentSquatch();
  const distance = built.lab.scientists[0].position.distanceTo(
    new THREE.Vector3(built.lab.anchors.observation.x, built.lab.datums.LAB_Y, built.lab.anchors.observation.z),
  );
  built.lab.glassAudio.setEngaged(true, 0);
  const aubbieInput = 0.9 * gainForVoice('aubbie', { sealed: true });
  const normalInput = 0.9 * gainForVoice('vetrov', { sealed: true });
  const heard = built.lab.glassAudio.audibleVoiceGain(aubbieInput, distance);
  const normal = built.lab.glassAudio.audibleVoiceGain(normalInput, distance);
  assert.ok(heard >= 0.24, `Aubbie still arrives at only ${heard.toFixed(3)} gain`);
  assert.ok(heard >= normal * 2.35,
    `sealed compensation is only ${(heard / normal).toFixed(2)}x a normal lab voice`);
});

test('real lower-level thresholds delay Irish until entry and Booski until the player is past xXx', () => {
  const built = buildSilentSquatch();
  const required = ['corridor', 'xxx', 'observation', 'stairs', 'cellarTop', 'cellar'];
  for (const id of required) {
    assert.ok(Number.isFinite(built.lab.anchors[id]?.x), `${id} has no real production anchor`);
    assert.ok(Number.isFinite(built.lab.anchors[id]?.z), `${id} has no real production anchor`);
  }

  const zones = Object.fromEntries(required.map((id) => [id, built.lab.anchors[id]]));
  const lines = [];
  const mission = createSilentSquatchMission({
    lab: built.lab,
    zones,
    onLine: (line) => lines.push(line),
  });
  mission.fsm.start(S.STAIRWELL);
  const step = (seconds, position) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) mission.update(1 / 30, { position });
  };

  /* The west wing is directly above these X/Z coordinates. Standing there
   * upstairs must neither play xXx through the floor nor consume the lower
   * corridor's one-shot threshold before the player descends. */
  const upstairsCorridor = {
    ...zones.corridor,
    y: zones.corridor.y + 7.8,
  };
  const upstairsXxx = {
    ...zones.xxx,
    y: zones.xxx.y + 7.8,
  };
  step(0.2, upstairsXxx);
  step(0.2, upstairsCorridor);
  assert.equal(mission.fsm.name, S.STAIRWELL,
    'an upstairs X/Z overlap consumed the lower corridor threshold');
  assert.equal(lines.some((line) => /xxx/i.test(line.speaker || '')), false,
    'xXx barked through the floor before the player entered the lab');

  step(1, built.lab.anchors.stairFoot);
  assert.equal(mission.fsm.name, S.STAIRWELL, 'Irish began before the lower doorway');
  assert.equal(lines.some((line) => line.speaker === 'IRISH'), false);

  step(0.2, zones.corridor);
  assert.equal(mission.fsm.name, S.INTERROGATION);
  assert.equal(lines.some((line) => line.speaker === 'IRISH'), true);
  step(16, zones.corridor);
  assert.equal(lines.some((line) => line.speaker === 'BOOSKI'), false,
    'Booski shouted while the player was still on the stair side of xXx');

  step(0.2, zones.xxx);
  step(6, zones.xxx);
  assert.equal(lines.some((line) => line.speaker === 'BOOSKI'), false,
    'Booski shouted beside xXx instead of after him');

  step(0.2, zones.observation);
  assert.equal(mission.fsm.name, S.OBSERVATION);
  assert.equal(lines.some((line) => line.speaker === 'BOOSKI'), true,
    'crossing past xXx did not begin Booski\'s corridor line');
});

test('Bezmenov tries the handle where the handle is, and does it silently', () => {
  const built = buildSilentSquatch();
  const bezmenov = built.lab.scientists[3];
  const before = bezmenov.position.clone();

  bezmenov.tryHandle();
  for (let i = 0; i < 60 * 12; i++) built.update(1 / 60, { position: { x: 0, y: 0, z: 0 } });

  assert.notDeepEqual(
    [bezmenov.position.x, bezmenov.position.z], [before.x, before.z],
    'he never left his bench',
  );
  /* At the door, on the inside. He does not get through it — that is the
   * point of the beat. */
  assert.ok(bezmenov.position.z < GLASS_WALL.z0, 'he walked through the glass');
  assert.ok(bezmenov.position.z > SEALED_LAB.z1 - 1.2, 'he did not reach the door');
  assert.equal(bezmenov.inside, true);

  /* Then he stops and stares, which is the other half of his part. */
  bezmenov.stare();
  assert.equal(bezmenov.stage, 'staring');
});

test('the six of them are doing something at their benches before the gas', () => {
  const built = buildSilentSquatch();
  const bodies = built.lab.scientists;
  for (const body of bodies) assert.equal(body.stage, 'work');

  /* Nobody is mid-gesture on frame one, and after a minute of the room
   * running, gestures have been played. Measured as "did an arm ever leave
   * its rest angle", because the work loop is deliberately mostly PAUSES —
   * asserting that everybody is gesturing at any one instant would be
   * asserting the bug this replaced. */
  const moved = new Set();
  for (let i = 0; i < 60 * 60; i++) {
    built.update(1 / 60, { position: { x: 0, y: 0, z: 0 } });
    for (const body of bodies) if (body.fig.gestureT > 0) moved.add(body.index);
  }
  assert.equal(moved.size, bodies.length,
    'somebody stood at a laboratory bench for a minute without moving');
});

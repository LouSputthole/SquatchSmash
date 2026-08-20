import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEAPON_IDS } from '../src/core/weapons/catalog.js';

import {
  CartelPalaceMission,
  EVIDENCE_IDS,
  PALACE_BEATS,
} from '../src/cartel-palace/mission.js';
import { buildCartelPalace, PALACE_ANCHORS } from '../src/cartel-palace/world.js';
import { buildPalaceCast, PALACE_GUARD_POSTS } from '../src/cartel-palace/cast.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';
import {
  PALACE_PREVIEW_CHECKPOINTS,
  previewPalaceCheckpointForLocation,
  previewSnapshotForCheckpoint,
} from '../src/cartel-palace/preview.js';

test('the palace begins as a rescue at the quiet estate approach', () => {
  const objectives = [];
  const mission = new CartelPalaceMission({
    onObjective: (objective) => objectives.push(objective),
  });

  assert.equal(mission.begin(), true);
  assert.equal(mission.beat, PALACE_BEATS.APPROACH);
  assert.equal(mission.snapshot().rescueCoverIntact, true);
  assert.match(objectives.at(-1).text, /reach the service gate/i);
});

test('Sauce is revealed by the complete environmental evidence trail, not at the gate', () => {
  const reveals = [];
  const mission = new CartelPalaceMission({ onReveal: (facts) => reveals.push(facts) });
  mission.begin();

  assert.equal(mission.collectEvidence(EVIDENCE_IDS.BELONGINGS), false,
    'evidence inside the estate cannot be collected from the approach');
  assert.equal(mission.enterPerimeter({ powerCut: true }), true);
  assert.equal(mission.enterEstate(), true);
  assert.equal(mission.snapshot().rescueCoverIntact, true);

  assert.equal(mission.collectEvidence(EVIDENCE_IDS.BELONGINGS), true);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.PAYMENT_LEDGER), true);
  assert.equal(mission.snapshot().rescueCoverIntact, true,
    'two suspicious facts do not announce the betrayal');
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.SECURITY_STILL), true);

  const state = mission.snapshot();
  assert.equal(state.beat, PALACE_BEATS.BETRAYAL);
  assert.equal(state.rescueCoverIntact, false);
  assert.equal(state.sauceBetrayalConfirmed, true);
  assert.deepEqual(state.evidenceFound, Object.values(EVIDENCE_IDS));
  assert.deepEqual(reveals, [{
    evidenceFound: Object.values(EVIDENCE_IDS),
    sauceBetrayalConfirmed: true,
  }]);
});

function reachDiningRoom(mission) {
  mission.begin();
  mission.enterPerimeter({ powerCut: true });
  mission.enterEstate();
  for (const id of Object.values(EVIDENCE_IDS)) mission.collectEvidence(id);
  assert.equal(mission.enterDiningRoom(), true);
}

test('the final room is a two-target boss encounter and cannot clear early', () => {
  const completions = [];
  const mission = new CartelPalaceMission({ onComplete: (report) => completions.push(report) });
  reachDiningRoom(mission);

  assert.equal(mission.registerTargetDown('mark'), true);
  assert.equal(mission.extract(), false, 'Mark alone is not mission completion');
  assert.equal(mission.registerTargetDown('sauce'), true);
  assert.equal(mission.beat, PALACE_BEATS.CLEAR);
  assert.equal(mission.extract(), true);
  assert.deepEqual(completions, [{
    evidenceFound: Object.values(EVIDENCE_IDS),
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
    outcome: 'clean',
  }]);
});

test('raising the alarm preserves completion but records the hard exit', () => {
  const mission = new CartelPalaceMission();
  mission.begin();
  assert.equal(mission.raiseAlarm('guard_contact'), true);
  mission.enterPerimeter();
  mission.enterEstate();
  for (const id of Object.values(EVIDENCE_IDS)) mission.collectEvidence(id);
  mission.enterDiningRoom();
  mission.registerTargetDown('mark');
  mission.registerTargetDown('sauce');

  assert.equal(mission.snapshot().outcome, 'hard_exit');
});

test('a campaign checkpoint resumes the evidence trail without duplicating facts', () => {
  const mission = new CartelPalaceMission();
  assert.equal(mission.restore({
    status: 'in_progress',
    checkpoint: 'estate',
    powerCut: true,
    evidenceFound: [EVIDENCE_IDS.BELONGINGS, EVIDENCE_IDS.BELONGINGS, 'not_evidence'],
  }), true);

  assert.equal(mission.beat, PALACE_BEATS.ESTATE);
  assert.equal(mission.snapshot().powerCut, true);
  assert.deepEqual(mission.snapshot().evidenceFound, [EVIDENCE_IDS.BELONGINGS]);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.BELONGINGS), false);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.PAYMENT_LEDGER), true);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.SECURITY_STILL), true);
  assert.equal(mission.beat, PALACE_BEATS.BETRAYAL);
});

test('partial evidence, alarm, and one-target progress emit durable checkpoint facts immediately', () => {
  const checkpoints = [];
  const mission = new CartelPalaceMission({
    onCheckpoint: (checkpoint, facts) => checkpoints.push({ checkpoint, facts }),
  });
  mission.begin();
  mission.enterPerimeter({ powerCut: true });
  mission.enterEstate();

  mission.collectEvidence(EVIDENCE_IDS.BELONGINGS);
  assert.deepEqual(checkpoints.at(-1), {
    checkpoint: PALACE_BEATS.ESTATE,
    facts: {
      evidenceFound: [EVIDENCE_IDS.BELONGINGS],
      sauceBetrayalConfirmed: false,
      alarmRaised: false,
      alarmReason: null,
      markEliminated: false,
      sauceEliminated: false,
      outcome: null,
    },
  });

  mission.raiseAlarm('guard_contact');
  assert.equal(checkpoints.at(-1).facts.alarmRaised, true);
  assert.equal(checkpoints.at(-1).facts.alarmReason, 'guard_contact');

  mission.collectEvidence(EVIDENCE_IDS.PAYMENT_LEDGER);
  mission.collectEvidence(EVIDENCE_IDS.SECURITY_STILL);
  mission.enterDiningRoom();
  mission.registerTargetDown('mark');
  assert.equal(checkpoints.at(-1).checkpoint, PALACE_BEATS.DINING_ROOM);
  assert.equal(checkpoints.at(-1).facts.markEliminated, true);
  assert.equal(checkpoints.at(-1).facts.sauceEliminated, false);
  assert.equal(checkpoints.at(-1).facts.alarmRaised, true);
});

test('hard-exit outcome remains hard after clear is restored and extracted', () => {
  let clear = null;
  const first = new CartelPalaceMission({
    onCheckpoint: (checkpoint, facts) => {
      if (checkpoint === PALACE_BEATS.CLEAR) clear = { checkpoint, ...facts };
    },
  });
  reachDiningRoom(first);
  first.raiseAlarm('gunshot');
  first.registerTargetDown('mark');
  first.registerTargetDown('sauce');
  assert.equal(clear.outcome, 'hard_exit');

  const completions = [];
  const reloaded = new CartelPalaceMission({
    onComplete: (report) => completions.push(report),
  });
  assert.equal(reloaded.restore({ status: 'in_progress', ...clear }), true);
  assert.equal(reloaded.beat, PALACE_BEATS.CLEAR);
  assert.equal(reloaded.snapshot().alarmRaised, true);
  assert.equal(reloaded.snapshot().outcome, 'hard_exit');
  assert.equal(reloaded.extract(), true);
  assert.equal(completions[0].outcome, 'hard_exit');
});

test('a legacy clear checkpoint with no outcome replays the unresolved dining room', () => {
  const mission = new CartelPalaceMission();
  assert.equal(mission.restore({
    status: 'in_progress',
    checkpoint: 'clear',
    evidenceFound: Object.values(EVIDENCE_IDS),
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
    outcome: null,
  }), true);
  assert.equal(mission.beat, PALACE_BEATS.DINING_ROOM);
  assert.equal(mission.snapshot().markEliminated, false);
  assert.equal(mission.snapshot().sauceEliminated, false);
  assert.equal(mission.snapshot().outcome, null);
});

test('the palace is its own traversable compound with every clue physically staged', () => {
  const scene = new THREE.Scene();
  const world = buildCartelPalace(scene);

  assert.equal(world.root.name, 'cartel-palace.compound');
  assert.ok(world.colliders.length >= 20, 'walls, gates, rooms, furniture, and cover are solid');
  assert.deepEqual(Object.keys(world.evidence).sort(), Object.values(EVIDENCE_IDS).sort());
  for (const [id, target] of Object.entries(world.evidence)) {
    assert.equal(target.userData.evidenceId, id);
    const at = target.getWorldPosition(new THREE.Vector3());
    assert.ok(at.distanceTo(PALACE_ANCHORS.estate) < 38, `${id} is inside the estate route`);
  }
  assert.ok(PALACE_ANCHORS.approach.z > PALACE_ANCHORS.perimeter.z);
  assert.ok(PALACE_ANCHORS.perimeter.z > PALACE_ANCHORS.diningRoom.z,
    'the route gets steadily deeper instead of reusing one room');
  assert.notEqual(world.materialLanguage, 'mansion', 'this is not Lou\'s house recolored');
  assert.ok(world.lights.length >= 8, 'each route section has an authored practical light');
  assert.ok(world.lights.every((light) => light.intensity >= 4),
    'night interiors remain readable instead of rendering as black geometry');
});

test('the service power cabinet has visible supports tangent to cabinet and land', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const cabinet = world.root.getObjectByName('power-cabinet');
  const land = world.root.getObjectByName('palace-surrounding-land');
  const supports = [];
  world.root.getObjectByName('service-power-box')?.traverse((object) => {
    if (object.name === 'power-cabinet-support') supports.push(object);
  });

  assert.ok(cabinet?.isMesh, 'the exterior power interaction lost its cabinet');
  assert.ok(land?.isMesh, 'the cabinet support datum lost the surrounding land');
  assert.equal(supports.length, 2, 'the freestanding cabinet does not have two visible supports');
  const cabinetBounds = new THREE.Box3().setFromObject(cabinet);
  const landBounds = new THREE.Box3().setFromObject(land);
  for (const [index, support] of supports.entries()) {
    assert.ok(support.isMesh && support.visible && support.material?.visible !== false,
      `power cabinet support ${index} is not rendered geometry`);
    const supportBounds = new THREE.Box3().setFromObject(support);
    const overlapX = Math.min(supportBounds.max.x, cabinetBounds.max.x)
      - Math.max(supportBounds.min.x, cabinetBounds.min.x);
    const overlapZ = Math.min(supportBounds.max.z, cabinetBounds.max.z)
      - Math.max(supportBounds.min.z, cabinetBounds.min.z);
    assert.ok(overlapX > 1e-4 && overlapZ > 1e-4,
      `power cabinet support ${index} misses the cabinet footprint`);
    assert.ok(Math.abs(supportBounds.max.y - cabinetBounds.min.y) <= 1e-4,
      `power cabinet support ${index} leaves a gap below the cabinet`);
    assert.ok(Math.abs(supportBounds.min.y - landBounds.max.y) <= 1e-4,
      `power cabinet support ${index} leaves a gap above the land`);
  }
});

test('every playable estate zone has a finished ceiling below the exterior roof', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const ceilingNames = [
    'estate-entry-ceiling',
    'mark-office-ceiling',
    'guest-suite-ceiling',
    'security-room-ceiling',
    'service-corridor-ceiling',
    'portrait-gallery-ceiling',
    'final-dining-ceiling',
  ];

  for (const name of ceilingNames) {
    const ceiling = world.root.getObjectByName(name);
    assert.ok(ceiling, `${name} is missing above a playable estate zone`);
    const bounds = new THREE.Box3().setFromObject(ceiling);
    assert.ok(bounds.min.y >= 4.3 && bounds.max.y < 5.1,
      `${name} sits outside the finished interior shell (${bounds.min.y}..${bounds.max.y})`);
  }

  const ceilingRoot = world.root.getObjectByName('estate-interior-ceilings');
  const coverage = ceilingRoot.children.map((ceiling) => new THREE.Box3().setFromObject(ceiling));
  const playableRects = [
    [-17.5, 10.2, -14.5, 1.0],
    [10.8, 17.5, -33.8, 11.5],
    [-17.5, 10.2, -33.8, -15.4],
    [-17.5, 17.5, -49.5, -34.5],
  ];
  for (const [x0, x1, z0, z1] of playableRects) {
    for (let x = x0; x <= x1; x += 0.55) {
      for (let z = z0; z <= z1; z += 0.55) {
        const covered = coverage.some((bounds) => (
          x >= bounds.min.x && x <= bounds.max.x && z >= bounds.min.z && z <= bounds.max.z
        ));
        assert.equal(covered, true,
          `exterior roof is visible above playable floor at x=${x.toFixed(2)}, z=${z.toFixed(2)}`);
      }
    }
  }
});

test('the final dining room is a furnished combat stage with two clear flanking lanes', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const stage = world.root.getObjectByName('final-dining-refinement');
  assert.ok(stage, 'the final room has no authored furnishing layer');

  const names = [];
  stage.traverse((object) => names.push(object.name));
  assert.ok(names.filter((name) => name.startsWith('dining-chair.')).length >= 6,
    'the palace table has no readable chair rhythm');
  assert.ok(names.filter((name) => name.startsWith('dining-place-setting.')).length >= 8,
    'the final table is not set for a cartel dinner');
  assert.ok(names.includes('dining-chandelier'), 'the final room has no overhead focal fixture');
  assert.ok(names.filter((name) => name === 'dining-coffer-beam').length >= 8,
    'the final room ceiling is still an empty slab');
  assert.ok(names.filter((name) => name === 'dining-wall-panel').length >= 6,
    'blank partition faces still dominate the boss room');

  for (const x of [-7.2, 7.2]) {
    for (let z = -35.2; z >= -49.2; z -= 0.4) {
      const point = new THREE.Vector3(x, 0.9, z);
      const blocker = world.colliders.find((collider) => collider.containsPoint(point));
      assert.equal(blocker, undefined,
        `dining combat lane x=${x} is blocked by ${blocker?.name ?? 'unknown'} at z=${z}`);
    }
  }
});

test('the dining chandelier is physically supported and the final-room light budget does not clip', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const stage = world.root.getObjectByName('final-dining-refinement');
  const names = [];
  stage.traverse((object) => names.push(object.name));
  assert.ok(names.filter((name) => name === 'dining-chandelier-arm').length >= 8,
    'the chandelier bulbs still float without visible arms');
  assert.ok(names.filter((name) => name === 'dining-rear-wall-panel').length >= 6,
    'the large rear wall faces are still blank');

  const finalLights = world.lights.filter((light) => light.position.z <= -40 && light.position.z >= -45);
  const intensity = finalLights.reduce((total, light) => total + light.intensity, 0);
  assert.ok(intensity >= 20 && intensity <= 36,
    `final-room practicals total ${intensity}, outside the readable non-clipping budget`);
  assert.ok(finalLights.every((light) => light.position.y >= 2.6),
    'a final-room practical is detached below its visible ceiling fixture');
});

test('each evidence clue sits in a distinct furnished room and remains reachable on foot', () => {
  const world = buildCartelPalace(new THREE.Scene());
  for (const [groupName, prefix] of [
    ['mark-office-refinement', 'office-detail.'],
    ['guest-suite-refinement', 'guest-suite-detail.'],
    ['security-room-refinement', 'security-detail.'],
  ]) {
    const room = world.root.getObjectByName(groupName);
    assert.ok(room, `${groupName} is missing`);
    const details = [];
    room.traverse((object) => {
      if (object.name.startsWith(prefix)) details.push(object.name);
    });
    assert.ok(new Set(details).size >= 6,
      `${groupName} has only ${new Set(details).size} distinct authored details`);
  }

  const standingPositions = {
    [EVIDENCE_IDS.BELONGINGS]: new THREE.Vector3(4.7, 0.9, -4.9),
    [EVIDENCE_IDS.PAYMENT_LEDGER]: new THREE.Vector3(-10.6, 0.9, -5.1),
    [EVIDENCE_IDS.SECURITY_STILL]: new THREE.Vector3(14.9, 0.9, -8.0),
  };
  for (const [id, target] of Object.entries(world.evidence)) {
    const standing = standingPositions[id];
    const blocker = world.colliders.find((collider) => collider.containsPoint(standing));
    assert.equal(blocker, undefined,
      `${id} standing position is blocked by ${blocker?.name ?? 'unknown'}`);
    assert.ok(standing.distanceTo(target.getWorldPosition(new THREE.Vector3()).setY(0.9)) <= 2.5,
      `${id} cannot be inspected from its clear standing position`);
  }
});

test('the Mark office desk chair is one visible assembly supported by its rug', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const chair = world.root.getObjectByName('office-detail.desk-chair');
  const rug = world.root.getObjectByName('office-detail.rug');
  assert.ok(chair, 'the Mark office lost its desk chair');
  assert.ok(rug?.isMesh, 'the Mark office lost its rug support surface');

  world.root.updateMatrixWorld(true);
  const parts = [];
  chair.traverse((object) => {
    if (object.isMesh) parts.push({ object, bounds: new THREE.Box3().setFromObject(object) });
  });
  const seatIndex = parts.findIndex(({ object }) => object.name === 'office-chair-seat');
  assert.notEqual(seatIndex, -1, 'the office chair lost its visible seat');

  const boxGap = (a, b) => Math.hypot(
    Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
    Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0),
    Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0),
  );
  const connected = new Set([seatIndex]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (let left = 0; left < parts.length; left++) {
      for (let right = left + 1; right < parts.length; right++) {
        if (boxGap(parts[left].bounds, parts[right].bounds) > 0.006) continue;
        if (connected.has(left) === connected.has(right)) continue;
        connected.add(left);
        connected.add(right);
        expanded = true;
      }
    }
  }

  const rugBounds = new THREE.Box3().setFromObject(rug);
  const supported = [...connected].some((index) => (
    parts[index].bounds.min.y <= rugBounds.max.y + 0.002
    && parts[index].bounds.max.y >= rugBounds.max.y - 0.002
  ));
  const lowestConnectedBottom = Math.min(...[...connected].map((index) => parts[index].bounds.min.y));
  assert.equal(supported, true,
    `the chair's connected visible assembly stops ${(lowestConnectedBottom - rugBounds.max.y).toFixed(4)} m above its rug`);
});

test('the courtyard reads as a palace and its solid waterworks do not seal the service route', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const courtyard = world.root.getObjectByName('courtyard-refinement');
  assert.ok(courtyard, 'the courtyard has no authored refinement layer');
  const names = [];
  courtyard.traverse((object) => names.push(object.name));
  assert.ok(names.filter((name) => name === 'courtyard-fountain-tier').length >= 2,
    'the fountain is still a single shallow cylinder');
  assert.ok(names.filter((name) => name === 'courtyard-water-jet').length >= 6,
    'the fountain has no visible moving-water silhouette');
  assert.ok(names.filter((name) => name === 'reflecting-pool-border').length >= 4,
    'the reflecting pool has no raised stone edge');
  assert.ok(names.filter((name) => name === 'estate-facade-bay').length >= 6,
    'the estate approach is still a blank stucco wall');
  assert.ok(names.filter((name) => name === 'courtyard-wall-lantern').length >= 4,
    'the powered-down courtyard has no readable practical-light rhythm');

  assert.ok(world.colliders.some((collider) => collider.name === 'courtyard-fountain-collider'));
  assert.ok(world.colliders.some((collider) => collider.name === 'reflecting-pool-collider'));

  world.doors.openServiceGate();
  world.doors.openEstateDoor();
  const route = [
    new THREE.Vector3(14, 0.9, 57.4),
    new THREE.Vector3(8.5, 0.9, 56.0),
    new THREE.Vector3(8.5, 0.9, 40.0),
    new THREE.Vector3(8.5, 0.9, 20.0),
    new THREE.Vector3(12.4, 0.9, 13.2),
    new THREE.Vector3(13.5, 0.9, 11.2),
  ];
  for (let index = 1; index < route.length; index++) {
    const from = route[index - 1];
    const to = route[index];
    const distance = from.distanceTo(to);
    for (let travelled = 0; travelled <= distance; travelled += 0.35) {
      const point = from.clone().lerp(to, travelled / distance);
      const blocker = world.colliders.find((collider) => collider.containsPoint(point));
      assert.equal(blocker, undefined,
        `opened service route is blocked by ${blocker?.name ?? 'unknown'} at ${point.x.toFixed(2)},${point.z.toFixed(2)}`);
    }
  }
});

test('cutting the exterior power actually blacks out the facade lanterns', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const facadeLights = world.lights.filter((light) => light.name === 'courtyard-wall-lantern-light');
  const facadeBulbs = [];
  world.root.traverse((object) => {
    if (object.name === 'courtyard-lantern-bulb') facadeBulbs.push(object);
  });
  assert.equal(facadeLights.length, 4);
  assert.equal(facadeBulbs.length, 4);
  assert.ok(facadeLights.every((light) => light.intensity >= 4),
    'the powered approach has no visible facade practicals');

  assert.equal(world.doors.openServiceGate(), true);
  assert.ok(facadeLights.every((light) => light.intensity === 0),
    'facade point lights remain bright after the power cut');
  assert.ok(facadeBulbs.every((bulb) => bulb.material.color.getHex() === 0x080909),
    'facade bulbs remain visibly emissive after the power cut');
});

test('the portrait gallery has architectural depth without narrowing the final approach', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const gallery = world.root.getObjectByName('portrait-gallery-refinement');
  assert.ok(gallery, 'the gallery has no authored refinement layer');
  const names = [];
  gallery.traverse((object) => names.push(object.name));
  assert.ok(names.filter((name) => name === 'gallery-wall-panel').length >= 8,
    'the portraits still float against blank or missing wall surfaces');
  assert.ok(names.filter((name) => name === 'gallery-picture-light').length >= 8,
    'the portrait sequence has no readable light rhythm');
  assert.ok(names.filter((name) => name === 'gallery-ceiling-beam').length >= 8,
    'the long gallery ceiling has no depth');
  assert.ok(names.filter((name) => name === 'gallery-bench').length >= 2,
    'the gallery has no furnishing silhouette');

  for (let z = -15.6; z >= -33.6; z -= 0.35) {
    const point = new THREE.Vector3(0, 0.9, z);
    const blocker = world.colliders.find((collider) => collider.containsPoint(point));
    assert.equal(blocker, undefined,
      `central gallery approach is blocked by ${blocker?.name ?? 'unknown'} at z=${z.toFixed(2)}`);
  }
});

test('the portrait-gallery practical lights the art without blowing out the finished ceiling', () => {
  const world = buildCartelPalace(new THREE.Scene());
  const galleryLights = world.lights.filter((light) => (
    light.position.z <= -23 && light.position.z >= -27 && Math.abs(light.position.x) <= 5
  ));
  assert.ok(galleryLights.length >= 1, 'the long gallery has no authored practical light');
  const intensity = galleryLights.reduce((total, light) => total + light.intensity, 0);
  assert.ok(intensity <= 14, `gallery practical intensity ${intensity} still clips the ceiling`);
  assert.ok(galleryLights.every((light) => light.position.y >= 3.2),
    'gallery practical hangs below the finished ceiling treatment');
});

test('the public environment inventory reports the real scene graph and every refined zone', () => {
  const world = buildCartelPalace(new THREE.Scene());
  assert.equal(typeof world.inspectEnvironment, 'function');
  const inventory = world.inspectEnvironment();

  let meshes = 0;
  let groups = 0;
  let namedMeshes = 0;
  world.root.traverse((object) => {
    if (object.isMesh) {
      meshes++;
      if (object.name) namedMeshes++;
    }
    if (object.isGroup) groups++;
  });
  assert.equal(inventory.meshes, meshes, 'mesh count is not derived from the live scene graph');
  assert.equal(inventory.groups, groups, 'group count is not derived from the live scene graph');
  assert.equal(inventory.namedMeshes, namedMeshes);
  assert.equal(inventory.colliders, world.colliders.length);
  assert.ok(inventory.namedMeshes / inventory.meshes >= 0.85,
    'too much palace geometry is anonymous to audit reliably');

  /* `entry` joined the list in the 2026-08-20 owner playtest pass: the foyer
   * was the one playable room with no refinement zone at all, which is
   * exactly why it read as a giant empty box. */
  assert.deepEqual(Object.keys(inventory.zones).sort(), [
    'ceilings', 'courtyard', 'dining', 'entry', 'gallery', 'guestSuite', 'office',
    'security', 'serviceCorridor',
  ]);
  for (const [name, zone] of Object.entries(inventory.zones)) {
    assert.ok(zone.meshes > 0, `${name} inventory is disconnected from its geometry`);
    assert.ok(zone.bounds.min.every(Number.isFinite) && zone.bounds.max.every(Number.isFinite),
      `${name} inventory has non-finite world bounds`);
    assert.ok(zone.names.length > 0, `${name} inventory has no semantic names`);
  }
  assert.deepEqual(inventory.solidWaterworks.sort(), [
    'courtyard-fountain-collider', 'reflecting-pool-collider',
  ]);
});

test('Mark is a real armored boss and Sauce waits armed at his table', () => {
  const root = new THREE.Group();
  const cast = buildPalaceCast(root);

  assert.equal(cast.guards.length, PALACE_GUARD_POSTS.length);
  assert.ok(cast.guards.length >= 7, 'the infiltration has a defended route');
  assert.ok(cast.mark.actor.maxHealth >= 400);
  assert.ok(cast.mark.actor.armor >= 140);
  assert.equal(cast.mark.role, 'boss');
  assert.equal(cast.sauce.role, 'traitor');
  assert.equal(cast.sauce.armed, true);
  assert.ok(cast.sauce.root.position.distanceTo(PALACE_ANCHORS.sauce) < 0.01);
  assert.ok(cast.mark.root.position.distanceTo(PALACE_ANCHORS.mark) < 0.01);
});

test('Mark has supported styled hair instead of silently rendering bald', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const hair = [];
  cast.mark.root.traverse((object) => {
    if (object.name.startsWith('person.hair.')) hair.push(object);
  });

  assert.ok(hair.length >= 3,
    `Mark's authored hair token produced only ${hair.length} shared hair pieces`);
  assert.ok(hair.every((piece) => piece.material?.color?.getHex() === 0x17110e),
    'Mark lost his authored dark hair colour when the style was normalized');
});

test('cutting power materially helps stealth and a silent takedown does not raise the alarm', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const alarms = [];
  const security = new PalaceSecurity({ cast, colliders: [], onAlarm: (reason) => alarms.push(reason) });
  const gateGuard = cast.guards[0];
  const player = new THREE.Vector3(gateGuard.root.position.x, 0, gateGuard.root.position.z - 8);

  assert.equal(security.canSee(gateGuard, player, { powerCut: false, crouching: false }), true);
  assert.equal(security.canSee(gateGuard, player, { powerCut: true, crouching: true }), false);
  assert.equal(security.silentTakedown(gateGuard.id, { distance: 1.7 }), true);
  assert.equal(gateGuard.down, true);
  assert.deepEqual(alarms, []);

  assert.equal(security.applyPlayerShot(cast.guards[1].root, WEAPON_IDS.PISTOL9).applied, true);
  assert.deepEqual(alarms, ['gunshot']);
});

test('palace preview checkpoints are bounded and cannot activate in a saved campaign', () => {
  assert.deepEqual(PALACE_PREVIEW_CHECKPOINTS, [
    'approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear',
  ]);
  assert.equal(previewPalaceCheckpointForLocation({
    pathname: '/cartel-palace.html', search: '?preview=1&checkpoint=dining_room',
  }), 'dining_room');
  assert.equal(previewPalaceCheckpointForLocation({
    pathname: '/cartel-palace.html', search: '?checkpoint=dining_room',
  }), null);
  assert.equal(previewPalaceCheckpointForLocation({
    pathname: '/cartel-palace.html', search: '?preview=1&checkpoint=wrong',
  }), 'approach');
  assert.equal(previewSnapshotForCheckpoint('betrayal').sauceBetrayalConfirmed, true);
});

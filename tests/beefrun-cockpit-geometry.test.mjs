import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { Brushrunner },
  { CameraManager },
  { makeLou, setPose, updateFigure },
  { InteractionSystem },
  { MissionController },
  { Player },
  { terrainHeight },
  { AC },
] = await Promise.all([
  import('../src/beefrun/aircraft.js'),
  import('../src/beefrun/cameras.js'),
  import('../src/beefrun/npc.js'),
  import('../src/core/interaction.js'),
  import('../src/beefrun/mission.js'),
  import('../src/core/player.js'),
  import('../src/beefrun/terrain.js'),
  import('../src/beefrun/config.js'),
]);

function meshesMatching(root, pattern) {
  const matches = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh && pattern.test(object.name)) matches.push(object);
  });
  return matches;
}

function objectsMatching(root, pattern) {
  const matches = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (pattern.test(object.name)) matches.push(object);
  });
  return matches;
}

function boundsOf(object) {
  return new THREE.Box3().setFromObject(object);
}

function geometryBoundsOf(object) {
  object.geometry.computeBoundingBox();
  return object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
}

function positiveFootprintOverlap(a, b, epsilon = 1e-4) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > epsilon
    && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > epsilon;
}

function positiveVolumeOverlap(a, b, epsilon = 1e-4) {
  return positiveFootprintOverlap(a, b, epsilon)
    && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > epsilon;
}

function shown(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

function ownerMatching(object, pattern, stopAt) {
  for (let node = object; node && node !== stopAt; node = node.parent) {
    if (pattern.test(node.name)) return node;
  }
  return null;
}

function pointBoxDistance(point, box) {
  return Math.hypot(
    Math.max(box.min.x - point.x, 0, point.x - box.max.x),
    Math.max(box.min.y - point.y, 0, point.y - box.max.y),
    Math.max(box.min.z - point.z, 0, point.z - box.max.z),
  );
}

function pointSegmentDistanceXZ(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq,
  ));
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}

function geometryBoundsInRoot(mesh, root) {
  mesh.geometry.computeBoundingBox();
  const local = mesh.geometry.boundingBox;
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const x of [local.min.x, local.max.x]) {
    for (const y of [local.min.y, local.max.y]) {
      for (const z of [local.min.z, local.max.z]) {
        point.set(x, y, z).applyMatrix4(mesh.matrixWorld);
        root.worldToLocal(point);
        box.expandByPoint(point);
      }
    }
  }
  return box;
}

test('every Brushrunner cockpit seat is visibly carried from the real floor into its cushion and back', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);

  const floorBoards = meshesMatching(aircraft.group, /^cargo-floor-board-/).map(boundsOf);
  assert.equal(floorBoards.length, 7, 'the real cabin floor board count drifted');

  for (const role of ['pilot', 'copilot']) {
    const cushions = meshesMatching(aircraft.group, new RegExp(`^${role}-seat-cushion$`));
    const backs = meshesMatching(aircraft.group, new RegExp(`^${role}-seat-back$`));
    const legs = meshesMatching(aircraft.group, new RegExp(`^${role}-seat-leg-`));
    assert.equal(cushions.length, 1, `${role} cushion is missing or duplicated`);
    assert.equal(backs.length, 1, `${role} back is missing or duplicated`);
    assert.equal(legs.length, 4, `${role} seat needs four visible floor-standing legs`);

    const cushion = boundsOf(cushions[0]);
    const back = boundsOf(backs[0]);
    assert.ok(positiveVolumeOverlap(cushion, back), `${role} seat back is not joined to its cushion`);

    for (const [index, legObject] of legs.entries()) {
      const leg = boundsOf(legObject);
      assert.equal(legObject.visible, true, `${role} leg ${index} is hidden`);
      assert.ok((legObject.material?.opacity ?? 1) > 0, `${role} leg ${index} is transparent`);
      assert.ok(positiveFootprintOverlap(leg, cushion), `${role} leg ${index} left the cushion footprint`);
      assert.ok(
        Math.abs(leg.max.y - cushion.min.y) <= 1e-4,
        `${role} leg ${index} has a ${(cushion.min.y - leg.max.y).toFixed(3)} m gap below the cushion`,
      );
      assert.ok(
        floorBoards.some((floor) => positiveFootprintOverlap(leg, floor)
          && Math.abs(leg.min.y - floor.max.y) <= 1e-4),
        `${role} leg ${index} does not meet the real cabin floor`,
      );
    }
  }
});

test('the real seated Captain is carried by the copilot pan and the pilot eye is at seated scale', () => {
  const aircraft = new Brushrunner();
  const lou = makeLou();
  lou.cup.visible = false;
  setPose(lou, 'sit');
  aircraft.group.add(lou.group);
  lou.group.position.copy(aircraft.copilotSeat);
  lou.group.rotation.set(0, 0, 0);
  aircraft.group.updateMatrixWorld(true);

  const cushion = meshesMatching(aircraft.group, /^copilot-seat-cushion$/)[0];
  const thighs = meshesMatching(lou.group, /^captain_lou_sasole-leg-(?:left|right)-thigh$/);
  assert.ok(cushion && thighs.length === 2, 'the Captain/seat support geometry is incomplete');
  const cushionBox = boundsOf(cushion);
  const supportedThighs = thighs.map(boundsOf).filter((box) => positiveFootprintOverlap(box, cushionBox));
  assert.equal(supportedThighs.length, 2, 'both of the Captain\'s thighs must overlap the copilot pan');
  const supportGap = Math.min(...supportedThighs.map((box) => box.min.y)) - cushionBox.max.y;
  assert.ok(
    Math.abs(supportGap) <= 0.005,
    `Captain Sasole is ${(supportGap * 1000).toFixed(1)} mm above the copilot pan`,
  );

  const pilotCushion = boundsOf(meshesMatching(aircraft.group, /^pilot-seat-cushion$/)[0]);
  const eyeAbovePan = aircraft.pilotEye.y - pilotCushion.max.y;
  assert.ok(
    eyeAbovePan >= 0.9 && eyeAbovePan <= 1.2,
    `pilot eye is ${eyeAbovePan.toFixed(3)} m above its pan instead of seated scale`,
  );
});

test('both of Captain Sasole\'s boot soles stay planted on a visibly supported cockpit footwell', () => {
  const aircraft = new Brushrunner();
  const lou = makeLou();
  lou.cup.visible = false;
  setPose(lou, 'sit');
  aircraft.group.add(lou.group);
  lou.group.position.copy(aircraft.copilotSeat);
  lou.group.rotation.set(0, 0, 0);

  const boots = meshesMatching(lou.group, /^captain_lou_sasole-leg-(?:left|right)-boot$/);
  const deckMeshes = meshesMatching(
    aircraft.group,
    /^(?:cargo-floor-board-\d+|cockpit-floor|cockpit-footwell)$/,
  );
  assert.equal(boots.length, 2, 'the seated Captain needs two auditable boot soles');

  const soleGap = (boot) => {
    aircraft.group.updateMatrixWorld(true);
    const bootBox = boundsOf(boot);
    const supports = deckMeshes.map(boundsOf)
      .filter((surface) => positiveFootprintOverlap(bootBox, surface));
    assert.ok(supports.length > 0, `${boot.name} has no rendered deck under its footprint`);
    return bootBox.min.y - Math.max(...supports.map((surface) => surface.max.y));
  };

  const neutralGaps = boots.map(soleGap);
  let minimumGap = Math.min(...neutralGaps);
  let maximumGap = Math.max(...neutralGaps);
  for (let frame = 0; frame < 1200; frame += 1) {
    lou.sick = (frame % 300) / 299;
    const angle = (frame / 1200) * Math.PI * 2;
    const target = aircraft.group.localToWorld(new THREE.Vector3(
      Math.cos(angle) * 4,
      1,
      2.22 + Math.sin(angle) * 4,
    ));
    updateFigure(lou, 1 / 60, target);
    for (const boot of boots) {
      const gap = soleGap(boot);
      minimumGap = Math.min(minimumGap, gap);
      maximumGap = Math.max(maximumGap, gap);
    }
  }

  assert.ok(
    minimumGap >= -0.005,
    `a Captain Sasole boot penetrates its rendered footwell by ${(-minimumGap * 1000).toFixed(1)} mm`,
  );
  assert.ok(
    maximumGap <= 0.03,
    `a Captain Sasole boot floats ${(maximumGap * 1000).toFixed(1)} mm above its rendered footwell`,
  );

  const footwells = meshesMatching(aircraft.group, /^cockpit-footwell$/);
  const legs = meshesMatching(aircraft.group, /^cockpit-footwell-leg-\d+$/);
  assert.equal(footwells.length, 1, 'the raised cockpit footwell is missing or duplicated');
  assert.equal(legs.length, 4, `the cockpit footwell has ${legs.length}/4 deck supports`);
  const footwell = boundsOf(footwells[0]);
  const mainDeck = meshesMatching(
    aircraft.group,
    /^(?:cargo-floor-board-\d+|cockpit-floor)$/,
  ).map(boundsOf);
  for (const [index, legObject] of legs.entries()) {
    const leg = boundsOf(legObject);
    assert.ok(positiveFootprintOverlap(leg, footwell), `footwell leg ${index} left the raised deck`);
    assert.ok(Math.abs(leg.max.y - footwell.min.y) <= 1e-4,
      `footwell leg ${index} is ${(footwell.min.y - leg.max.y).toFixed(4)} m below the raised deck`);
    assert.ok(mainDeck.some((deck) => positiveFootprintOverlap(leg, deck)
      && Math.abs(leg.min.y - deck.max.y) <= 1e-4),
    `footwell leg ${index} does not terminate on the main cabin deck`);
  }

  /* The platform belongs in the forward cockpit, not across the cargo-door
   * transfer route. The actual egress/boarding tests below exercise the real
   * mission endpoints; this hard envelope prevents a future platform resize
   * from reaching that route in the first place. */
  assert.ok(footwell.min.z >= 1.95, `cockpit footwell reaches aft to z=${footwell.min.z.toFixed(3)}`);
  for (const pedal of aircraft.parts.pedal) {
    const pedalBox = boundsOf(pedal);
    assert.ok(pedalBox.max.y - footwell.max.y >= 0.08,
      `${pedal.name} has only ${((pedalBox.max.y - footwell.max.y) * 1000).toFixed(1)} mm visible above the footwell`);
  }
});

test('the Brushrunner instrument panel has a visible load path into a forward cockpit floor', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);

  const floors = meshesMatching(aircraft.group, /^cockpit-floor$/);
  const panels = meshesMatching(aircraft.group, /^instrument-panel$/);
  const supports = meshesMatching(aircraft.group, /^instrument-panel-support-/);
  assert.equal(floors.length, 1, 'the forward cockpit floor is missing or duplicated');
  assert.equal(panels.length, 1, 'the instrument panel is missing or duplicated');
  assert.equal(supports.length, 2, 'the panel needs two visible floor-standing supports');

  const floor = boundsOf(floors[0]);
  const panel = boundsOf(panels[0]);
  for (const [index, supportObject] of supports.entries()) {
    const support = boundsOf(supportObject);
    assert.ok(positiveFootprintOverlap(support, floor), `panel support ${index} left the cockpit floor`);
    assert.ok(
      Math.abs(support.min.y - floor.max.y) <= 1e-4,
      `panel support ${index} has a ${(support.min.y - floor.max.y).toFixed(3)} m floor gap`,
    );
    assert.ok(positiveVolumeOverlap(support, panel), `panel support ${index} is not joined to the panel`);
  }
});

test('both animated rudder pedals stay visibly mounted to the cockpit floor at full travel', () => {
  const aircraft = new Brushrunner();
  const physics = {
    controls: {
      pitch: 0, roll: 0, yaw: 0, flaps: 0,
      airBrake: 0, throttleL: 0, throttleR: 0,
    },
    suspension: [0, 0, 0], groundSpeed: 0, onGround: true, agl: 0,
    time: 0, gLoad: 1, stallT: 0, stalled: false,
    ias: 0, position: new THREE.Vector3(), vspeed: 0,
    pitchDeg: 0, rollDeg: 0, headingDeg: 0,
  };
  const engines = {
    fuel: 1, anyRunning: false,
    engines: [{ rpm: 0, temp: 40, running: false }, { rpm: 0, temp: 40, running: false }],
  };

  const pedalPositions = [];
  for (const yaw of [-1, 0, 1]) {
    physics.controls.yaw = yaw;
    aircraft.update(0, physics, engines);
    aircraft.group.updateMatrixWorld(true);

    const floor = boundsOf(meshesMatching(aircraft.group, /^cockpit-floor$/)[0]);
    for (const side of ['left', 'right']) {
      const pads = meshesMatching(aircraft.group, new RegExp(`^rudder-pedal-${side}$`));
      const mounts = meshesMatching(aircraft.group, new RegExp(`^rudder-pedal-${side}-mount$`));
      assert.equal(pads.length, 1, `${side} pedal is missing or duplicated at yaw ${yaw}`);
      assert.equal(mounts.length, 1, `${side} pedal needs one visible floor mount at yaw ${yaw}`);
      const pad = boundsOf(pads[0]);
      const mount = boundsOf(mounts[0]);
      assert.ok(positiveVolumeOverlap(pad, mount), `${side} pedal detached from its mount at yaw ${yaw}`);
      assert.ok(positiveFootprintOverlap(mount, floor), `${side} pedal mount left the cockpit floor at yaw ${yaw}`);
      assert.ok(
        Math.abs(mount.min.y - floor.max.y) <= 1e-4,
        `${side} pedal mount has a ${(mount.min.y - floor.max.y).toFixed(3)} m floor gap at yaw ${yaw}`,
      );
    }
    pedalPositions.push(aircraft.parts.pedal.map((pedal) => pedal.position.z));
  }
  for (const index of [0, 1]) assert.ok(
    Math.abs(pedalPositions[2][index] - pedalPositions[0][index]) >= 0.099,
    `rudder pedal ${index + 1} only animates ${Math.abs(pedalPositions[2][index] - pedalPositions[0][index]).toFixed(3)} m across full yaw`,
  );
});

test('the cockpit camera head envelope stays clear of the former box roof datum and real turtledeck under full shake and g', () => {
  const aircraft = new Brushrunner();
  const body = aircraft.group;
  const fuselage = meshesMatching(body, /^fuselage-body$/)[0];
  const turtledeck = meshesMatching(body, /^fuselage-turtledeck$/)[0];
  assert.ok(fuselage && turtledeck, 'the cockpit shell is incomplete');
  fuselage.geometry.computeBoundingBox();
  const bodyTop = fuselage.position.y + fuselage.geometry.boundingBox.max.y;
  const roofRadius = turtledeck.geometry.parameters.radiusTop;
  const roofCentreY = turtledeck.position.y;

  const cases = [
    { phase: (Math.PI * 1.5) / 3.1, random: 0, gLoad: 3.5 },
    { phase: (Math.PI * 0.5) / 3.1, random: 1, gLoad: -1 },
  ];
  const attitudes = [
    new THREE.Euler(0, 0, 0, 'YXZ'),
    new THREE.Euler(0.28, 0.17, 0.65, 'YXZ'),
  ];
  const previousRandom = Math.random;
  try {
    for (const attitude of attitudes) {
      body.quaternion.setFromEuler(attitude);
      body.updateMatrixWorld(true);
      for (const state of cases) {
        Math.random = () => state.random;
        const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 9000);
        const manager = new CameraManager(camera);
        manager.shake = 1.6;
        manager._bob = state.phase;
        manager.update(0, { groundSpeed: 80, tas: 90, rollDeg: 0 }, body, aircraft.pilotEye, {
          roughness: 1,
          gLoad: state.gLoad,
        });
        const local = body.worldToLocal(camera.position.clone());
        const lowerClearance = local.y - bodyTop;
        const roofRise = roofRadius * turtledeck.scale.z;
        const horizontalFraction = local.x / roofRadius;
        const roofY = roofCentreY + roofRise * Math.sqrt(Math.max(0, 1 - horizontalFraction ** 2));
        const roofClearance = roofY - local.y;
        assert.ok(
          lowerClearance >= 0.08,
          `camera enters the fuselage top by ${(-lowerClearance).toFixed(3)} m at g ${state.gLoad}`,
        );
        assert.ok(
          roofClearance >= 0.05,
          `camera enters the elliptical turtledeck by ${(-roofClearance).toFixed(3)} m at g ${state.gLoad}`,
        );
      }
    }
  } finally {
    Math.random = previousRandom;
  }
});

test('pilot camera and Captain Sasole clear every cockpit fixture through the flight-control envelope', () => {
  const aircraft = new Brushrunner();
  const lou = makeLou();
  lou.cup.visible = false;
  setPose(lou, 'sit');
  aircraft.group.add(lou.group);
  lou.group.position.copy(aircraft.copilotSeat);
  lou.group.rotation.set(0, 0, 0);

  const physics = {
    controls: {
      pitch: 0, roll: 0, yaw: 0, flaps: 0,
      airBrake: 0, throttleL: 0, throttleR: 0,
    },
    suspension: [0, 0, 0], groundSpeed: 80, onGround: false, agl: 100,
    time: 0, gLoad: 1, stallT: 0, stalled: false,
    ias: 80, tas: 85, position: new THREE.Vector3(), vspeed: 0,
    pitchDeg: 0, rollDeg: 0, headingDeg: 0,
  };
  const engines = {
    fuel: 1, anyRunning: true,
    engines: [{ rpm: 1200, temp: 150, running: true }, { rpm: 1200, temp: 150, running: true }],
  };
  const fixturePattern = /^(?:instrument-panel(?:-support-\d+)?|glare-shield-coaming|cockpit-radio-stack|cockpit-footwell(?:-leg-\d+)?|yoke-(?:pilot|copilot)|engine-control-quadrant|lever-(?:throttle|prop|mixture)-(?:left|right)|flap-(?:control-quadrant|lever)|compass-housing|rudder-pedal-(?:left|right)(?:-mount)?|pilot-seat-(?:cushion|back|leg-\d+)|bobblehead|tammy-golden-ak-sticker|placard-.+|concern-light|nav-map(?:-tape-\d+)?|cigarette-lighter)$/;
  const controls = [
    [-1, -1, -1, 0, 0, 0],
    [-1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0.5, 0.5, 0.5],
    [1, -1, 1, 1, 0, 1],
    [1, 1, -1, 0, 1, 0],
  ];
  const lookTargets = [
    aircraft.pilotEye.clone(),
    new THREE.Vector3(0.8, 1.1, 3.4),
    new THREE.Vector3(0.8, 0.55, 1.1),
  ];
  const defects = [];
  let minimumCameraClearance = Infinity;
  const previousRandom = Math.random;
  try {
    for (const [pitch, roll, yaw, flaps, throttleL, throttleR] of controls) {
      Object.assign(physics.controls, { pitch, roll, yaw, flaps, throttleL, throttleR });
      for (let frame = 0; frame < 90; frame += 1) aircraft.update(1 / 60, physics, engines);

      for (const [targetIndex, target] of lookTargets.entries()) {
        lou.sick = targetIndex / (lookTargets.length - 1);
        for (let frame = 0; frame < 90; frame += 1) updateFigure(lou, 1 / 60, target);
        aircraft.group.updateMatrixWorld(true);

        const bodyParts = [];
        lou.group.traverse((object) => {
          if (object.isMesh && object.geometry && shown(object)) bodyParts.push(object);
        });
        aircraft.group.traverse((fixture) => {
          if (!fixture.isMesh || !fixture.geometry || !shown(fixture)) return;
          for (let node = fixture; node; node = node.parent) if (node === lou.group) return;
          const owner = ownerMatching(fixture, fixturePattern, aircraft.group.parent);
          if (!owner) return;
          const fixtureBox = geometryBoundsInRoot(fixture, aircraft.group);
          for (const body of bodyParts) {
            const overlap = geometryBoundsInRoot(body, aircraft.group).intersect(fixtureBox)
              .getSize(new THREE.Vector3());
            if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
              defects.push({
                pitch, roll, yaw, targetIndex,
                fixture: owner.name,
                mesh: fixture.name || '(unnamed fixture mesh)',
                body: body.name,
                overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
              });
            }
          }
        });
      }

      for (const random of [0, 1]) {
        Math.random = () => random;
        const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 9000);
        const manager = new CameraManager(camera);
        manager.shake = 1.6;
        manager._bob = random ? Math.PI / 2 : Math.PI * 1.5;
        manager.update(0, physics, aircraft.group, aircraft.pilotEye, { roughness: 1, gLoad: random ? -1 : 3.5 });
        aircraft.group.traverse((fixture) => {
          if (!fixture.isMesh || !fixture.geometry || !shown(fixture)) return;
          for (let node = fixture; node; node = node.parent) if (node === lou.group) return;
          if (!ownerMatching(fixture, fixturePattern, aircraft.group.parent)) return;
          minimumCameraClearance = Math.min(
            minimumCameraClearance,
            pointBoxDistance(camera.position, geometryBoundsInRoot(fixture, aircraft.group)),
          );
        });
      }
    }
  } finally {
    Math.random = previousRandom;
  }

  assert.deepEqual(defects, [], `Captain/control contacts:\n${JSON.stringify(defects, null, 2)}`);
  assert.ok(
    minimumCameraClearance >= 0.35,
    `a cockpit fixture comes within ${minimumCameraClearance.toFixed(3)} m of the pilot camera`,
  );

  /* The turtledeck is an elliptical half-cylinder: 0.89 m across and half
   * that vertically. Check the real rendered crew vertices, not the shell's
   * enclosing Box3, whose empty cabin volume would be a false collision. */
  let maximumRoofFraction = 0;
  let maximumSideFraction = 0;
  let minimumFloorClearance = Infinity;
  lou.group.traverse((body) => {
    if (!body.isMesh || !body.geometry || !shown(body)) return;
    const positions = body.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(body.matrixWorld);
      aircraft.group.worldToLocal(point);
      maximumSideFraction = Math.max(maximumSideFraction, Math.abs(point.x) / 0.89);
      minimumFloorClearance = Math.min(minimumFloorClearance, point.y - (-0.86));
      if (point.y <= 0.89) continue;
      maximumRoofFraction = Math.max(
        maximumRoofFraction,
        Math.hypot(point.x / 0.89, (point.y - 0.89) / 0.445),
      );
    }
  });
  assert.ok(
    maximumRoofFraction <= 0.95,
    `Captain Sasole reaches ${(maximumRoofFraction * 100).toFixed(1)}% of the turtledeck radius`,
  );
  assert.ok(
    maximumSideFraction <= 0.98,
    `Captain Sasole reaches ${(maximumSideFraction * 100).toFixed(1)}% of the cabin half-width`,
  );
  assert.ok(
    minimumFloorClearance >= 0,
    `Captain Sasole extends ${(-minimumFloorClearance).toFixed(3)} m through the cockpit floor`,
  );
});

test('the pilot forward sight line reaches the windshield before any opaque cabin structure', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(
    aircraft.pilotEye.clone(),
    new THREE.Vector3(0, 0, 1),
    0.1,
    3,
  );
  const hits = raycaster.intersectObject(aircraft.group, true).filter((hit) => {
    for (let object = hit.object; object; object = object.parent) {
      if (object.visible === false) return false;
    }
    return true;
  });
  assert.ok(hits.length > 0, 'the forward sight line crosses no rendered cockpit surface');
  const first = hits[0].object;
  assert.equal(
    first.name,
    'windshield',
    `the ${first.name || '(unnamed surface)'} blocks the pilot before the windshield`,
  );
  assert.equal(first.material.transparent, true, 'the windshield is not using a transparent material');
  assert.ok(first.material.opacity > 0.2 && first.material.opacity < 0.7,
    `windshield opacity ${first.material.opacity} is not readable glazing`);
});

test('the complete radio stack stays inside the real neutral pilot scan and remains visibly supported', () => {
  const aircraft = new Brushrunner();
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 9000);
  const manager = new CameraManager(camera);
  manager.update(0, { groundSpeed: 0, tas: 0, rollDeg: 0 }, aircraft.group, aircraft.pilotEye);
  aircraft.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const radio = objectsMatching(aircraft.group, /^cockpit-radio-stack$/);
  const housing = meshesMatching(aircraft.group, /^radio-stack-housing$/);
  const units = meshesMatching(aircraft.group, /^radio-unit-/);
  const displays = meshesMatching(aircraft.group, /^radio-display-/);
  const knobs = meshesMatching(aircraft.group, /^radio-knob-/);
  const coaming = meshesMatching(aircraft.group, /^glare-shield-coaming$/);
  assert.equal(radio.length, 1, 'the cockpit radio stack is missing or duplicated');
  assert.equal(housing.length, 1, 'the radio housing is missing or duplicated');
  assert.equal(units.length, 3, 'the radio needs three separate units');
  assert.equal(displays.length, 3, 'the radio needs three readable displays');
  assert.equal(knobs.length, 6, 'the radio needs two knobs per unit');
  assert.equal(coaming.length, 1, 'the radio support coaming is missing or duplicated');
  assert.ok(
    positiveVolumeOverlap(boundsOf(housing[0]), boundsOf(coaming[0])),
    'the radio housing is not visibly carried by the glare-shield coaming',
  );

  for (const display of displays) {
    const projected = display.getWorldPosition(new THREE.Vector3()).project(camera);
    assert.ok(
      Math.abs(projected.x) <= 0.92 && Math.abs(projected.y) <= 0.92
        && projected.z >= -1 && projected.z <= 1,
      `${display.name} leaves the padded pilot viewport at `
        + `[${projected.x.toFixed(3)}, ${projected.y.toFixed(3)}, ${projected.z.toFixed(3)}]`,
    );
  }
});

test('all side glazing is a real exterior-to-interior opening rather than glass over opaque skin', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  for (const { side, x, y, z, pane } of [
    { side: 'port cockpit', x: 3, y: 0.55, z: 2.5, pane: 'cabin-glass-side-left' },
    { side: 'starboard cockpit', x: -3, y: 0.55, z: 2.5, pane: 'cabin-glass-side-right' },
    /* Quarter-window centres carry a deliberate 50 mm skin seam, and the
     * port view also has the real lift strut in front of it. Sample the clear
     * part of each pane so this proves the aperture without declaring those
     * visible exterior members to be holes in the shell. */
    { side: 'port quarter', x: 3, y: 0.6, z: 0.82, pane: 'cabin-glass-quarter-left' },
    { side: 'starboard quarter', x: -3, y: 0.6, z: 0.82, pane: 'cabin-glass-quarter-right' },
  ]) {
    const origin = new THREE.Vector3(x, y, z);
    const cabinPoint = new THREE.Vector3(0, y, z);
    const direction = cabinPoint.clone().sub(origin);
    const distance = direction.length();
    const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, distance);
    const hits = raycaster.intersectObject(aircraft.group, true).filter((hit) => shown(hit.object));
    assert.ok(hits.some((hit) => hit.object.name === pane), `${side} glass is missing from its opening`);
    const blockers = hits.filter((hit) => {
      const material = Array.isArray(hit.object.material)
        ? hit.object.material[hit.face?.materialIndex ?? 0]
        : hit.object.material;
      return material && material.visible !== false && !material.transparent && material.opacity !== 0;
    });
    assert.deepEqual(
      blockers.map((hit) => ({
        name: hit.object.name || '(unnamed surface)',
        parent: hit.object.parent?.name || '(unnamed parent)',
        distance: Number(hit.distance.toFixed(4)),
        geometry: hit.object.geometry?.type,
        size: hit.object.geometry?.parameters,
      })),
      [],
      `opaque fuselage geometry closes the ${side} opening`,
    );
  }
});

test('the pilot instrument scan reaches the live gauge face without crossing fuselage skin', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const panel = meshesMatching(aircraft.group, /^instrument-panel$/)[0];
  const gauges = panel?.children.find((child) => child.material?.map === aircraft.parts.panelTex);
  assert.ok(gauges, 'the live instrument face is missing from the panel');
  /* The airspeed dial is the upper-left primary instrument on the canvas.
   * Aim at its real position rather than the canvas centre, where the
   * separately modelled radio stack legitimately sits in front of the panel. */
  const target = gauges.localToWorld(new THREE.Vector3(
    (150 / 1024 - 0.5) * 1.5,
    (0.5 - 150 / 512) * 0.64,
    0,
  ));
  const direction = target.clone().sub(aircraft.pilotEye);
  const distance = direction.length();
  const raycaster = new THREE.Raycaster(aircraft.pilotEye.clone(), direction.normalize(), 0.1, distance + 0.01);
  const hits = raycaster.intersectObject(aircraft.group, true).filter((hit) => {
    for (let object = hit.object; object; object = object.parent) {
      if (object.visible === false) return false;
    }
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face?.materialIndex ?? 0]
      : hit.object.material;
    return material?.visible !== false && material?.opacity !== 0;
  });
  assert.ok(hits.length > 0, 'the instrument scan crosses no rendered surface');
  assert.ok(
    hits[0].object === gauges,
    `${hits[0].object.name || '(unnamed surface)'} occludes the live gauges from the pilot eye`,
  );
});

test('the mismatched fuselage patches are exterior sheets and never solid blocks through the cockpit', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const patches = meshesMatching(aircraft.group, /^fuselage-patch-(?:aft|fwd)$/);
  assert.equal(patches.length, 2, 'the two replacement skin patches are missing');
  const fixtures = meshesMatching(
    aircraft.group,
    /^(?:pilot|copilot)-seat-(?:cushion|back|leg-\d+)$|^rudder-pedal-(?:left|right)(?:-mount)?$/,
  );
  assert.ok(fixtures.length >= 14, 'the cockpit fixture set is incomplete');

  for (const patchObject of patches) {
    const patch = boundsOf(patchObject);
    const size = patch.getSize(new THREE.Vector3());
    assert.ok(
      Math.min(size.x, size.y, size.z) <= 0.06,
      `${patchObject.name} is a ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m solid block`,
    );
    for (const fixtureObject of fixtures) {
      assert.ok(
        !positiveVolumeOverlap(patch, boundsOf(fixtureObject)),
        `${patchObject.name} penetrates ${fixtureObject.name}`,
      );
    }
  }
});

test('every fuselage frame station is a joined perimeter frame rather than a solid cabin slab', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const frames = objectsMatching(aircraft.group, /^fuselage-frame-\d+$/);
  assert.equal(frames.length, 6, 'the six fuselage frame stations are incomplete');
  const seatFixtures = meshesMatching(
    aircraft.group,
    /^(?:pilot|copilot)-seat-(?:cushion|back|leg-\d+)$/,
  ).map((object) => ({ name: object.name, box: boundsOf(object) }));
  const doorHead = boundsOf(meshesMatching(aircraft.group, /^cargo-door-frame-head$/)[0]);
  const doorSill = boundsOf(meshesMatching(aircraft.group, /^cargo-door-frame-sill$/)[0]);

  for (const frame of frames) {
    assert.equal(frame.isMesh, undefined, `${frame.name} is still a solid cross-cabin slab`);
    const members = frame.children.filter((child) => child.isMesh);
    const crossesDoor = /fuselage-frame-[34]$/.test(frame.name);
    const expectedParts = crossesDoor
      ? ['bottom', 'port', 'starboard-lower', 'starboard-upper', 'top']
      : ['bottom', 'port', 'starboard', 'top'];
    assert.deepEqual(
      members.map((member) => member.name).sort(),
      expectedParts.map((part) => `${frame.name}-${part}`).sort(),
      `${frame.name} does not have the expected named perimeter members`,
    );
    for (const member of members) {
      const memberBox = boundsOf(member);
      for (const fixture of seatFixtures) {
        assert.ok(
          !positiveVolumeOverlap(memberBox, fixture.box),
          `${member.name} penetrates ${fixture.name}`,
        );
      }
    }
    const top = boundsOf(members.find((member) => member.name.endsWith('-top')));
    const bottom = boundsOf(members.find((member) => member.name.endsWith('-bottom')));
    const port = boundsOf(members.find((member) => member.name.endsWith('-port')));
    assert.ok(positiveVolumeOverlap(top, port), `${frame.name} port rail is detached from its top rail`);
    assert.ok(positiveVolumeOverlap(bottom, port), `${frame.name} port rail is detached from its bottom rail`);
    if (crossesDoor) {
      const lower = boundsOf(members.find((member) => member.name.endsWith('-starboard-lower')));
      const upper = boundsOf(members.find((member) => member.name.endsWith('-starboard-upper')));
      assert.ok(positiveVolumeOverlap(bottom, lower), `${frame.name} lower door transfer leaves its bottom rail`);
      assert.ok(positiveVolumeOverlap(lower, doorSill), `${frame.name} lower door transfer leaves the sill`);
      assert.ok(positiveVolumeOverlap(upper, doorHead), `${frame.name} upper door transfer leaves the header`);
      assert.ok(positiveVolumeOverlap(top, upper), `${frame.name} upper door transfer leaves its top rail`);
    } else {
      const starboard = boundsOf(members.find((member) => member.name.endsWith('-starboard')));
      assert.ok(positiveVolumeOverlap(top, starboard), `${frame.name} starboard rail is detached from its top rail`);
      assert.ok(positiveVolumeOverlap(bottom, starboard), `${frame.name} starboard rail is detached from its bottom rail`);
    }
  }
});

test('the animated engine and flap levers stay seated in panel-mounted quadrants through full travel', () => {
  const aircraft = new Brushrunner();
  const physics = {
    controls: {
      pitch: 0, roll: 0, yaw: 0, flaps: 0,
      airBrake: 0, throttleL: 0, throttleR: 0,
    },
    suspension: [0, 0, 0], groundSpeed: 0, onGround: true, agl: 0,
    time: 0, gLoad: 1, stallT: 0, stalled: false,
    ias: 0, position: new THREE.Vector3(), vspeed: 0,
    pitchDeg: 0, rollDeg: 0, headingDeg: 0,
  };
  const engines = {
    fuel: 1, anyRunning: false,
    engines: [{ rpm: 0, temp: 40, running: false }, { rpm: 0, temp: 40, running: false }],
  };

  const leverRotations = [];
  const flapRotations = [];
  for (const travel of [0, 0.5, 1]) {
    physics.controls.throttleL = travel;
    physics.controls.throttleR = travel;
    physics.controls.flaps = travel;
    for (let frame = 0; frame < 120; frame++) aircraft.update(1 / 60, physics, engines);
    aircraft.group.updateMatrixWorld(true);

    const panels = meshesMatching(aircraft.group, /^instrument-panel$/);
    const quadrants = meshesMatching(aircraft.group, /^engine-control-quadrant$/);
    const flapMounts = meshesMatching(aircraft.group, /^flap-control-quadrant$/);
    assert.equal(quadrants.length, 1, `the six engine levers have no visible quadrant at travel ${travel}`);
    assert.equal(flapMounts.length, 1, `the flap lever has no visible quadrant at travel ${travel}`);
    const panel = boundsOf(panels[0]);
    const quadrant = boundsOf(quadrants[0]);
    const flapMount = boundsOf(flapMounts[0]);
    assert.ok(positiveVolumeOverlap(quadrant, panel), 'the engine-control quadrant is detached from the panel');
    assert.ok(positiveVolumeOverlap(flapMount, panel), 'the flap-control quadrant is detached from the panel');

    for (const [index, lever] of aircraft.parts.lever.entries()) {
      assert.ok(
        positiveVolumeOverlap(boundsOf(lever.children[0]), quadrant),
        `engine lever ${index + 1} leaves its quadrant at travel ${travel}`,
      );
    }
    assert.ok(
      positiveVolumeOverlap(boundsOf(aircraft.parts.flapLever.children[0]), flapMount),
      `flap lever leaves its quadrant at travel ${travel}`,
    );
    leverRotations.push(aircraft.parts.lever.map((lever) => lever.rotation.x));
    flapRotations.push(aircraft.parts.flapLever.rotation.x);
  }
  for (const [index, minimum] of [0.89, 0.89, 0.49, 0.49].entries()) assert.ok(
    Math.abs(leverRotations[2][index] - leverRotations[0][index]) >= minimum,
    `engine lever ${index + 1} animates only ${Math.abs(leverRotations[2][index] - leverRotations[0][index]).toFixed(3)} rad`,
  );
  assert.ok(
    Math.abs(flapRotations[2] - flapRotations[0]) >= 0.49,
    `flap lever animates only ${Math.abs(flapRotations[2] - flapRotations[0]).toFixed(3)} rad`,
  );
});

test('the windshield has four opaque joined frame members tied into the side shell', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const windshields = meshesMatching(aircraft.group, /^windshield$/);
  const frames = meshesMatching(aircraft.group, /^windshield-frame-(?:header|sill|port|starboard)$/);
  assert.equal(windshields.length, 1, 'the windshield is missing or duplicated');
  assert.deepEqual(
    frames.map((frame) => frame.name).sort(),
    ['header', 'sill', 'port', 'starboard'].map((part) => `windshield-frame-${part}`).sort(),
    'the windshield needs a named four-member frame',
  );
  const glass = geometryBoundsOf(windshields[0]);
  for (const frameObject of frames) {
    const frame = boundsOf(frameObject);
    assert.ok(positiveVolumeOverlap(frame, glass), `${frameObject.name} is detached from the glass`);
    assert.equal(frameObject.material.transparent, false, `${frameObject.name} is transparent`);
    assert.equal(frameObject.visible, true, `${frameObject.name} is hidden`);
  }
  const header = boundsOf(frames.find((frame) => frame.name.endsWith('-header')));
  const sill = boundsOf(frames.find((frame) => frame.name.endsWith('-sill')));
  for (const side of ['port', 'starboard']) {
    const post = boundsOf(frames.find((frame) => frame.name.endsWith(`-${side}`)));
    assert.ok(positiveVolumeOverlap(post, header), `${side} windshield post is detached from the header`);
    assert.ok(positiveVolumeOverlap(post, sill), `${side} windshield post is detached from the sill`);
    const shellPanels = meshesMatching(aircraft.group, new RegExp(`^fuselage-side-${side}-`));
    assert.ok(
      shellPanels.some((panel) => positiveVolumeOverlap(post, boundsOf(panel))),
      `${side} windshield post is detached from the fuselage side shell`,
    );
  }
});

test('both yokes remain joined from panel column through bar and hand grips at control extremes', () => {
  const aircraft = new Brushrunner();
  const physics = {
    controls: {
      pitch: 0, roll: 0, yaw: 0, flaps: 0,
      airBrake: 0, throttleL: 0, throttleR: 0,
    },
    suspension: [0, 0, 0], groundSpeed: 0, onGround: true, agl: 0,
    time: 0, gLoad: 1, stallT: 0, stalled: false,
    ias: 0, position: new THREE.Vector3(), vspeed: 0,
    pitchDeg: 0, rollDeg: 0, headingDeg: 0,
  };
  const engines = {
    fuel: 1, anyRunning: false,
    engines: [{ rpm: 0, temp: 40, running: false }, { rpm: 0, temp: 40, running: false }],
  };

  for (const [pitch, roll] of [[-1, -1], [0, 0], [1, 1], [-1, 1], [1, -1]]) {
    physics.controls.pitch = pitch;
    physics.controls.roll = roll;
    aircraft.update(0, physics, engines);
    aircraft.group.updateMatrixWorld(true);
    const panel = geometryBoundsOf(meshesMatching(aircraft.group, /^instrument-panel$/)[0]);

    for (const yoke of aircraft.parts.yoke) {
      const column = yoke.children.find((child) => child.geometry?.type === 'CylinderGeometry');
      const bar = yoke.children.find((child) => child.geometry?.parameters?.width === 0.44);
      const grips = yoke.children.filter((child) => child.geometry?.parameters?.height === 0.16);
      assert.ok(column && bar, `${yoke.name} lost its column or bar`);
      assert.equal(grips.length, 2, `${yoke.name} needs two hand grips`);
      assert.ok(
        positiveVolumeOverlap(boundsOf(column), panel),
        `${yoke.name} column leaves the panel at pitch ${pitch}, roll ${roll}`,
      );
      assert.ok(
        positiveVolumeOverlap(boundsOf(column), boundsOf(bar)),
        `${yoke.name} bar leaves its column at pitch ${pitch}, roll ${roll}`,
      );
      for (const grip of grips) {
        assert.ok(
          positiveVolumeOverlap(boundsOf(grip), boundsOf(bar)),
          `${yoke.name} grip leaves its bar at pitch ${pitch}, roll ${roll}`,
        );
      }
    }
  }
});

test('the cargo door swings outward from its fixed top hinge instead of rotating through its centre', () => {
  const aircraft = new Brushrunner();
  const hinge = aircraft.parts.cargoDoor;
  const leaf = hinge.getObjectByName('cargo-door-leaf');
  assert.ok(leaf, 'the cargo-door leaf is missing');

  hinge.rotation.z = 0;
  aircraft.group.updateMatrixWorld(true);
  const closed = geometryBoundsOf(leaf);
  const hingePoint = hinge.getWorldPosition(new THREE.Vector3());
  assert.ok(
    Math.abs(hingePoint.y - closed.max.y) <= 1e-4,
    `cargo-door pivot is ${(closed.max.y - hingePoint.y).toFixed(3)} m below its top edge`,
  );

  hinge.rotation.z = -1.25;
  aircraft.group.updateMatrixWorld(true);
  const open = geometryBoundsOf(leaf);
  const closedSize = closed.getSize(new THREE.Vector3());
  const openSize = open.getSize(new THREE.Vector3());
  assert.ok(open.min.x < closed.min.x - 0.6, 'the cargo door does not swing outward from the starboard skin');
  assert.ok(openSize.y < closedSize.y * 0.5, 'the open door still spans most of the doorway height');
  assert.ok(open.min.y > closed.min.y + 0.5, 'the open door still blocks the lower egress route');
  const afterHingePoint = hinge.getWorldPosition(new THREE.Vector3());
  assert.ok(afterHingePoint.distanceTo(hingePoint) <= 1e-6, 'the cargo-door hinge moves while opening');
});

test('the actually animated cargo door lifts clear of a real crouched egress envelope', () => {
  const aircraft = new Brushrunner();
  const physics = {
    controls: {
      pitch: 0, roll: 0, yaw: 0, flaps: 0,
      airBrake: 0, throttleL: 0, throttleR: 0,
    },
    suspension: [0, 0, 0], groundSpeed: 0, onGround: true, agl: 0,
    time: 0, gLoad: 1, stallT: 0, stalled: false,
    ias: 0, position: new THREE.Vector3(), vspeed: 0,
    pitchDeg: 0, rollDeg: 0, headingDeg: 0,
  };
  const engines = {
    fuel: 1, anyRunning: false,
    engines: [{ rpm: 0, temp: 40, running: false }, { rpm: 0, temp: 40, running: false }],
  };

  for (let frame = 0; frame < 240; frame++) {
    aircraft.update(1 / 60, physics, engines, { cargoDoorOpen: true });
  }
  aircraft.group.updateMatrixWorld(true);
  const leaves = meshesMatching(aircraft.group, /^cargo-door-leaf$/);
  assert.equal(leaves.length, 1, 'the animated cargo door leaf is missing or duplicated');
  const leaf = boundsOf(leaves[0]);
  const crouchedTop = -0.86 + 1.02 + 0.05;
  assert.ok(
    leaf.min.y >= crouchedTop,
    `the open cargo leaf hangs ${((crouchedTop - leaf.min.y) * 1000).toFixed(1)} mm into the crouched player envelope`,
  );
});

test('the real mission exit points put both occupants clear of opaque airframe geometry', () => {
  const aircraft = new Brushrunner();
  const lou = makeLou();
  lou.cup.visible = false;
  setPose(lou, 'sit');
  aircraft.group.add(lou.group);
  lou.group.position.copy(aircraft.copilotSeat);
  const ground = terrainHeight(0, 0);
  const position = new THREE.Vector3(0, ground + AC.gearY, 0);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.73);
  aircraft.group.position.copy(position);
  aircraft.group.quaternion.copy(quat);
  const player = {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    ground: 0, yaw: 0, pitch: 0, mode: 'frozen', enabled: false,
  };
  const mission = {
    flags: { inCockpit: true, louAboard: true },
    flightHud: { showControls() {}, setDirection() {}, setWarnings() {} },
    interaction: { setPaused() {} },
    audio: { setHeadset() {}, setStallHorn() {}, setAirspeed() {} },
    dialogue: { setHeadset() {} },
    input: { rudderKeys: true, clear() {} },
    physics: { position, quat },
    player,
    lou,
    aircraft,
    scene: new THREE.Scene(),
  };
  MissionController.prototype.exitCockpit.call(mission);
  MissionController.prototype.disembarkLou.call(mission);
  aircraft.group.updateMatrixWorld(true);
  lou.group.updateMatrixWorld(true);

  /* Compare in the rigid body's frame. World-axis boxes around a yawed 7.4 m
   * fuselage contain metres of empty air and would report both people inside
   * it even when they are standing three metres outboard. */
  const playerLocal = aircraft.group.worldToLocal(player.position.clone());
  const playerGroundLocal = aircraft.group.worldToLocal(
    new THREE.Vector3(player.position.x, player.ground, player.position.z),
  );
  const playerBox = new THREE.Box3(
    new THREE.Vector3(playerLocal.x - 0.3, playerGroundLocal.y, playerLocal.z - 0.3),
    new THREE.Vector3(playerLocal.x + 0.3, playerLocal.y + 0.05, playerLocal.z + 0.3),
  );
  const louMeshes = [];
  lou.group.traverse((object) => {
    if (object.isMesh && object.geometry && shown(object)) louMeshes.push(object);
  });
  const contacts = [];
  aircraft.group.traverse((airframe) => {
    if (!airframe.isMesh || !airframe.geometry || !shown(airframe)) return;
    const materials = Array.isArray(airframe.material) ? airframe.material : [airframe.material];
    if (!materials.some((material) => material?.visible !== false
      && (material.transparent !== true || (material.opacity ?? 1) >= 0.95))) return;
    const airframeBox = geometryBoundsInRoot(airframe, aircraft.group);
    const playerOverlap = playerBox.clone().intersect(airframeBox).getSize(new THREE.Vector3());
    if (playerOverlap.x > 0.002 && playerOverlap.y > 0.002 && playerOverlap.z > 0.002) {
      contacts.push({ occupant: 'player', airframe: airframe.name || '(unnamed)', overlap: playerOverlap.toArray() });
    }
    for (const body of louMeshes) {
      const bodyOverlap = geometryBoundsInRoot(body, aircraft.group).intersect(airframeBox)
        .getSize(new THREE.Vector3());
      if (bodyOverlap.x > 0.002 && bodyOverlap.y > 0.002 && bodyOverlap.z > 0.002) {
        contacts.push({ occupant: 'Captain Sasole', body: body.name,
          airframe: airframe.name || '(unnamed)', overlap: bodyOverlap.toArray() });
      }
    }
  });
  assert.deepEqual(contacts, [], `mission egress contacts:\n${JSON.stringify(contacts, null, 2)}`);
});

test('the real boarding target is crosshair-reachable from the mission exit point inside 2.7 metres', () => {
  const aircraft = new Brushrunner();
  const ground = terrainHeight(0, 0);
  aircraft.group.position.set(0, ground + AC.gearY, 0);
  aircraft.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.41);
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 1000);
  const exitLocal = new THREE.Vector3(3.2, 1.66 - AC.gearY, 0.5);
  camera.position.copy(aircraft.group.localToWorld(exitLocal));
  const hudState = { prompt: null };
  const interaction = new InteractionSystem(camera, {
    showPrompt(label, key) { hudState.prompt = { label, key }; },
    hidePrompt() { hudState.prompt = null; },
    setHold() {},
  });
  let boarded = 0;
  const mission = { aircraft, interaction, boardTarget: null, enterCockpit() { boarded += 1; } };
  MissionController.prototype.armBoardingTarget.call(mission);
  aircraft.group.updateMatrixWorld(true);
  const targetWorld = mission.boardTarget.getWorldPosition(new THREE.Vector3());
  camera.lookAt(targetWorld);
  camera.updateMatrixWorld(true);
  interaction.update(1 / 60);
  assert.equal(interaction.current, mission.boardTarget, 'the crosshair cannot acquire the boarding target');
  assert.deepEqual(hudState.prompt, {
    label: 'Get into the <b>left seat</b> — the aeroplane’s left, not yours',
    key: 'E',
  });
  assert.ok(
    camera.position.distanceTo(targetWorld) <= 2.7,
    `boarding target centre is ${camera.position.distanceTo(targetWorld).toFixed(3)} m from the exit point`,
  );
  interaction.press();
  assert.equal(boarded, 1, 'pressing E on the acquired target does not enter the cockpit');
});

test('the open cargo doorway is a clear rendered route from outside into the hold', () => {
  const aircraft = new Brushrunner();
  aircraft.parts.cargoDoor.rotation.z = -1.25;
  aircraft.group.updateMatrixWorld(true);
  const origin = new THREE.Vector3(-3, -0.1, -1.05);
  const holdPoint = new THREE.Vector3(0, -0.1, -1.05);
  const direction = holdPoint.clone().sub(origin);
  const distance = direction.length();
  const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, distance);
  const blockers = raycaster.intersectObject(aircraft.group, true).filter((hit) => {
    for (let object = hit.object; object; object = object.parent) {
      if (object.visible === false) return false;
    }
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face?.materialIndex ?? 0]
      : hit.object.material;
    return material?.visible !== false && !material?.transparent && material?.opacity !== 0;
  });
  assert.deepEqual(
    blockers.map((hit) => hit.object.name || '(unnamed surface)'),
    [],
    'opaque shell geometry still closes the open cargo doorway',
  );
});

test('the full rendered cargo aperture is not crossed by decorative frames or stringers', () => {
  const aircraft = new Brushrunner();
  aircraft.parts.cargoDoor.rotation.z = -Math.PI / 2;
  aircraft.group.updateMatrixWorld(true);
  const blockers = [];

  for (const y of [-0.76, -0.36, 0.05, 0.44, 0.56]) {
    for (const z of [-1.8, -1.7, -1.42, -1.05, -0.68, -0.5, -0.3]) {
      /* This is a shell-aperture gate: cross the side skin and its attached
       * detail, but stop before unrelated internal tail fairing or outboard
       * landing-gear structure can turn it into a cabin-layout test. */
      const origin = new THREE.Vector3(-1.25, y, z);
      const holdPoint = new THREE.Vector3(-0.7, y, z);
      const direction = holdPoint.clone().sub(origin);
      const distance = direction.length();
      const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, distance);
      for (const hit of raycaster.intersectObject(aircraft.group, true)) {
        if (!shown(hit.object)) continue;
        const material = Array.isArray(hit.object.material)
          ? hit.object.material[hit.face?.materialIndex ?? 0]
          : hit.object.material;
        if (material?.visible === false || material?.transparent || material?.opacity === 0) continue;
        blockers.push({ y, z, object: hit.object.name || '(unnamed surface)' });
      }
    }
  }

  assert.deepEqual(
    blockers,
    [],
    `opaque details cross the cargo opening: ${[...new Set(blockers.map((hit) => hit.object))].join(', ')}`,
  );
});

test('a visible threshold bridges the hold floor, door sill, and deployed ramp hinge', () => {
  const aircraft = new Brushrunner();
  aircraft.rampT = 1;
  aircraft.applyRampPose();
  aircraft.group.updateMatrixWorld(true);
  const thresholds = meshesMatching(aircraft.group, /^cargo-door-threshold$/);
  const sills = meshesMatching(aircraft.group, /^cargo-door-frame-sill$/);
  const innerLeaves = meshesMatching(aircraft.group, /^cargo-ramp-leaf-inner$/);
  const floorBoards = meshesMatching(aircraft.group, /^cargo-floor-board-/);
  assert.equal(thresholds.length, 1, 'the floor-to-ramp threshold is missing or duplicated');
  assert.equal(sills.length, 1, 'the cargo-door sill is missing or duplicated');
  assert.equal(innerLeaves.length, 1, 'the inner ramp leaf is missing or duplicated');
  const threshold = boundsOf(thresholds[0]);
  assert.ok(
    floorBoards.some((floor) => positiveVolumeOverlap(threshold, boundsOf(floor))),
    'the threshold is detached from the hold floor',
  );
  assert.ok(positiveVolumeOverlap(threshold, boundsOf(sills[0])), 'the threshold is detached from the door sill');
  assert.ok(
    positiveVolumeOverlap(threshold, boundsOf(innerLeaves[0])),
    'the threshold is detached from the deployed inner ramp leaf',
  );
});

test('the ramp ground and hold collider stay in the aircraft frame on a pitched parked aeroplane', () => {
  const aircraft = new Brushrunner();
  aircraft.rampT = 1;
  aircraft.applyRampPose();
  for (const attitude of [
    new THREE.Euler(0.14, 0.63, -0.08, 'YXZ'),
    new THREE.Euler(-0.09, -1.1, 0.12, 'YXZ'),
  ]) {
    aircraft.group.position.set(31, 80, -47);
    aircraft.group.quaternion.setFromEuler(attitude);
    aircraft.group.updateMatrixWorld(true);

    const localSurfaces = [];
    for (const x of [-0.75, 0, 0.75]) {
      for (const z of [-2.5, 0, 2.2]) localSurfaces.push({ kind: 'hold', point: new THREE.Vector3(x, -0.86, z) });
    }
    for (const along of [0.08, 0.5, 0.92]) {
      for (const z of [-1.55, -1.05, -0.55]) {
        localSurfaces.push({
          kind: 'ramp',
          point: new THREE.Vector3(-0.9 - 2.16 * along, -0.86 - 0.76 * along, z),
        });
      }
    }
    for (const { kind, point } of localSurfaces) {
      const world = aircraft.group.localToWorld(point.clone());
      const queriedY = aircraft.deckHeightAt(world.x, world.z);
      assert.ok(
        queriedY !== null && Math.abs(queriedY - world.y) <= 0.005,
        `${kind} ground query is ${queriedY === null ? 'null' : `${(queriedY - world.y).toFixed(4)} m`}
          from rendered point ${point.toArray().map((value) => value.toFixed(2)).join(',')}`,
      );
    }

    const deckWorld = aircraft.group.localToWorld(new THREE.Vector3(0.82, -0.86, 0));
    const player = {
      position: new THREE.Vector3(deckWorld.x, deckWorld.y + 1.66, deckWorld.z),
      velocity: new THREE.Vector3(3, 0, 0),
      eyeHeight: 1.66,
      jumpHeight: 0,
    };
    aircraft.resolveOnDeck(player, 'x', 0.3);
    const resolved = aircraft.group.worldToLocal(new THREE.Vector3(
      player.position.x,
      player.position.y - player.eyeHeight,
      player.position.z,
    ));
    assert.ok(
      Math.abs(resolved.x - 0.56) <= 0.005,
      `hold collider resolves to local x ${resolved.x.toFixed(3)} instead of the 0.56 m wall`,
    );
  }
});

test('a ground-level player cannot be pulled through either solid fuselage side when the ramp is down', () => {
  const ground = 42;
  const aircraft = new Brushrunner();
  aircraft.group.position.set(0, ground + AC.gearY, 0);
  aircraft.rampT = 1;
  aircraft.applyRampPose();
  aircraft.group.updateMatrixWorld(true);

  for (const side of [-1, 1]) {
    const world = {
      colliders: [],
      floorZones: [],
      groundAt: (x, z) => aircraft.deckHeightAt(x, z) ?? ground,
      resolvePlayer: (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius),
    };
    const player = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
    player.mode = 'walk';
    player.enabled = true;
    player.ground = ground;
    player.position.copy(aircraft.group.localToWorld(new THREE.Vector3(
      side * 1.5,
      1.66 - AC.gearY,
      0,
    )));
    player.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    player.keys.add('KeyW');

    let closest = Infinity;
    let largestStep = 0;
    let previous = side * aircraft.group.worldToLocal(player.position.clone()).x;
    for (let frame = 0; frame < 180; frame += 1) {
      player.update(1 / 60);
      const local = aircraft.group.worldToLocal(player.position.clone());
      const outsideDistance = side * local.x;
      closest = Math.min(closest, outsideDistance);
      largestStep = Math.max(largestStep, Math.abs(outsideDistance - previous));
      previous = outsideDistance;
    }

    assert.ok(closest >= 1.21,
      `${side < 0 ? 'starboard' : 'port'} approach crossed the rendered side to local ${closest.toFixed(3)}`);
    assert.ok(largestStep <= 0.08,
      `${side < 0 ? 'starboard' : 'port'} approach teleported ${largestStep.toFixed(3)} m through the skin`);
    assert.ok(Math.abs(player.ground - ground) <= 0.02,
      `${side < 0 ? 'starboard' : 'port'} exterior player was raised ${(player.ground - ground).toFixed(3)} m onto the deck`);
  }
});

test('both open and closed Brushrunner shells stop a real ground player at both sides, nose, and tail', () => {
  const ground = 42;
  const approaches = [
    { name: 'port side', start: [1.55, 0], yaw: Math.PI / 2, outside: (p) => p.x, limit: 1.23 },
    { name: 'starboard side', start: [-1.55, 0], yaw: -Math.PI / 2, outside: (p) => -p.x, limit: 1.23 },
    { name: 'nose', start: [0, 6.1], yaw: 0, outside: (p) => p.z, limit: 5.65 },
    { name: 'tail', start: [0, -7.8], yaw: Math.PI, outside: (p) => -p.z, limit: 7.35 },
  ];

  for (const rampT of [0, 1]) {
    const aircraft = new Brushrunner();
    aircraft.group.position.set(0, ground + AC.gearY, 0);
    aircraft.rampT = rampT;
    aircraft.applyRampPose();
    aircraft.group.updateMatrixWorld(true);
    for (const approach of approaches) {
      const world = {
        colliders: [],
        floorZones: [],
        groundAt: () => ground,
        resolvePlayer: (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius),
      };
      const player = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
      player.mode = 'walk';
      player.enabled = true;
      player.ground = ground;
      player.position.copy(aircraft.group.localToWorld(new THREE.Vector3(
        approach.start[0],
        1.66 - AC.gearY,
        approach.start[1],
      )));
      player.yaw = approach.yaw;
      player.keys.add('KeyW');

      let closest = Infinity;
      for (let frame = 0; frame < 240; frame++) {
        player.update(1 / 60);
        const local = aircraft.group.worldToLocal(player.position.clone());
        closest = Math.min(closest, approach.outside(local));
      }
      assert.ok(
        closest >= approach.limit - 0.005,
        `${rampT ? 'open' : 'closed'} ${approach.name} let the real player reach ${closest.toFixed(3)} m; the capsule boundary is ${approach.limit.toFixed(3)} m`,
      );
    }
  }
});

test('both open and closed Brushrunner shells stop a real player approaching at deck height', () => {
  const ground = 42;
  const approaches = [
    { name: 'port side', start: [1.55, 0], yaw: Math.PI / 2, outside: (p) => p.x, limit: 1.23 },
    { name: 'starboard side', start: [-1.55, 0], yaw: -Math.PI / 2, outside: (p) => -p.x, limit: 1.23 },
    { name: 'nose', start: [0, 6.1], yaw: 0, outside: (p) => p.z, limit: 5.65 },
    { name: 'tail', start: [0, -7.8], yaw: Math.PI, outside: (p) => -p.z, limit: 7.35 },
  ];

  for (const rampT of [0, 1]) {
    const aircraft = new Brushrunner();
    aircraft.group.position.set(0, ground + AC.gearY, 0);
    aircraft.rampT = rampT;
    aircraft.applyRampPose();
    aircraft.group.updateMatrixWorld(true);
    const deckLevel = aircraft.group.localToWorld(new THREE.Vector3(0, -0.86, 0)).y;

    for (const approach of approaches) {
      const world = {
        colliders: [],
        floorZones: [],
        groundAt: () => deckLevel,
        resolvePlayer: (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius),
      };
      const player = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
      player.mode = 'walk';
      player.enabled = true;
      player.ground = deckLevel;
      player.position.copy(aircraft.group.localToWorld(new THREE.Vector3(
        approach.start[0],
        -0.86 + 1.66,
        approach.start[1],
      )));
      player.yaw = approach.yaw;
      player.keys.add('KeyW');

      let closest = Infinity;
      for (let frame = 0; frame < 240; frame++) {
        player.update(1 / 60);
        const local = aircraft.group.worldToLocal(player.position.clone());
        closest = Math.min(closest, approach.outside(local));
      }
      assert.ok(
        closest >= approach.limit - 0.005,
        `${rampT ? 'open' : 'closed'} ${approach.name} let a deck-height player reach ${closest.toFixed(3)} m`,
      );
    }
  }
});

test('open and closed Brushrunner nose taper stops a real lateral ground crossing at its rendered midsection', () => {
  const ground = 42;
  const crossingZ = 4.6;
  const playerRadius = 0.3;

  for (const rampT of [0, 1]) {
    const aircraft = new Brushrunner();
    aircraft.group.position.set(0, ground + AC.gearY, 0);
    aircraft.rampT = rampT;
    aircraft.applyRampPose();
    aircraft.group.updateMatrixWorld(true);

    const nose = aircraft.group.getObjectByName('nose-cone');
    assert.ok(nose?.isMesh, 'the lateral collision gate cannot find the rendered nose cone');
    const rayY = 1.66 - AC.gearY;
    const surfaceHits = [];
    for (const side of [-1, 1]) {
      const origin = aircraft.group.localToWorld(new THREE.Vector3(side * 3, rayY, crossingZ));
      const direction = new THREE.Vector3(-side, 0, 0).transformDirection(aircraft.group.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 6).intersectObject(nose, false)[0];
      assert.ok(hit, `the ${side < 0 ? 'starboard' : 'port'} ray missed the rendered nose at z=${crossingZ}`);
      surfaceHits.push(Math.abs(aircraft.group.worldToLocal(hit.point.clone()).x));
    }
    const renderedRadius = Math.max(...surfaceHits);
    const renderedSide = [3.86, 5.34].map((z) => {
      const origin = aircraft.group.localToWorld(new THREE.Vector3(3, rayY, z));
      const direction = new THREE.Vector3(-1, 0, 0).transformDirection(aircraft.group.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 6).intersectObject(nose, false)[0];
      assert.ok(hit, `the capsule-clearance ray missed the rendered nose at z=${z}`);
      return aircraft.group.worldToLocal(hit.point.clone());
    });

    const world = {
      colliders: [],
      floorZones: [],
      groundAt: () => ground,
      resolvePlayer: (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius),
    };
    const player = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
    player.mode = 'walk';
    player.enabled = true;
    player.ground = ground;
    player.position.copy(aircraft.group.localToWorld(new THREE.Vector3(
      1.5,
      rayY,
      crossingZ,
    )));
    player.yaw = Math.PI / 2;
    player.keys.add('KeyW');

    let closestClearance = Infinity;
    let crossedThroughTaper = false;
    for (let frame = 0; frame < 240; frame++) {
      player.update(1 / 60);
      const local = aircraft.group.worldToLocal(player.position.clone());
      closestClearance = Math.min(
        closestClearance,
        pointSegmentDistanceXZ(local, renderedSide[0], renderedSide[1]),
      );
      if (local.x < 0 && local.z >= 3.85 && local.z <= 5.35) crossedThroughTaper = true;
    }
    assert.equal(
      crossedThroughTaper,
      false,
      `${rampT ? 'open' : 'closed'} nose let the real player cross through the rendered taper`,
    );
    assert.ok(
      closestClearance >= playerRadius - 0.01,
      `${rampT ? 'open' : 'closed'} nose left only ${(closestClearance * 1000).toFixed(1)} mm from the real rendered side for a ${(playerRadius * 1000).toFixed(0)} mm capsule (midsection radius ${(renderedRadius * 1000).toFixed(1)} mm)`,
    );
  }
});

test('open and closed Brushrunner tail boom stops a real lateral ground crossing at its rendered midsection', () => {
  const ground = 42;
  const crossingZ = -4.65;
  const playerRadius = 0.3;

  for (const rampT of [0, 1]) {
    const aircraft = new Brushrunner();
    aircraft.group.position.set(0, ground + AC.gearY, 0);
    aircraft.rampT = rampT;
    aircraft.applyRampPose();
    aircraft.group.updateMatrixWorld(true);

    const boom = aircraft.group.getObjectByName('tail-boom');
    assert.ok(boom?.isMesh, 'the lateral collision gate cannot find the rendered tail boom');
    const rayY = 1.66 - AC.gearY;
    const surfaceHits = [];
    for (const side of [-1, 1]) {
      const origin = aircraft.group.localToWorld(new THREE.Vector3(side * 3, rayY, crossingZ));
      const direction = new THREE.Vector3(-side, 0, 0).transformDirection(aircraft.group.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 6).intersectObject(boom, false)[0];
      assert.ok(hit, `the ${side < 0 ? 'starboard' : 'port'} ray missed the rendered boom at z=${crossingZ}`);
      surfaceHits.push(Math.abs(aircraft.group.worldToLocal(hit.point.clone()).x));
    }
    const renderedRadius = Math.max(...surfaceHits);
    const renderedSide = [-7.04, -2.26].map((z) => {
      const origin = aircraft.group.localToWorld(new THREE.Vector3(3, rayY, z));
      const direction = new THREE.Vector3(-1, 0, 0).transformDirection(aircraft.group.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 6).intersectObject(boom, false)[0];
      assert.ok(hit, `the capsule-clearance ray missed the rendered boom at z=${z}`);
      return aircraft.group.worldToLocal(hit.point.clone());
    });

    const world = {
      colliders: [],
      floorZones: [],
      groundAt: () => ground,
      resolvePlayer: (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius),
    };
    const player = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
    player.mode = 'walk';
    player.enabled = true;
    player.ground = ground;
    player.position.copy(aircraft.group.localToWorld(new THREE.Vector3(
      1.5,
      rayY,
      crossingZ,
    )));
    player.yaw = Math.PI / 2;
    player.keys.add('KeyW');

    let closestClearance = Infinity;
    let crossedThroughTaper = false;
    for (let frame = 0; frame < 240; frame++) {
      player.update(1 / 60);
      const local = aircraft.group.worldToLocal(player.position.clone());
      closestClearance = Math.min(
        closestClearance,
        pointSegmentDistanceXZ(local, renderedSide[0], renderedSide[1]),
      );
      if (local.x < 0 && local.z >= -7.05 && local.z <= -2.25) crossedThroughTaper = true;
    }
    assert.equal(
      crossedThroughTaper,
      false,
      `${rampT ? 'open' : 'closed'} tail let the real player cross through the rendered boom`,
    );
    assert.ok(
      closestClearance >= playerRadius - 0.01,
      `${rampT ? 'open' : 'closed'} tail left only ${(closestClearance * 1000).toFixed(1)} mm from the real rendered side for a ${(playerRadius * 1000).toFixed(0)} mm capsule (midsection radius ${(renderedRadius * 1000).toFixed(1)} mm)`,
    );
  }
});

test('a real crouched player can traverse the deployed ramp while the clear under-wing lane stays exterior', () => {
  const ground = 42;
  const aircraft = new Brushrunner();
  aircraft.group.position.set(0, ground + AC.gearY, 0);
  aircraft.rampT = 1;
  aircraft.applyRampPose();
  aircraft.parts.cargoDoor.rotation.z = -Math.PI / 2;
  aircraft.group.updateMatrixWorld(true);
  const world = {
    colliders: [],
    floorZones: [],
    groundAt: (x, z) => aircraft.deckHeightAt(x, z) ?? ground,
    resolvePlayer: (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius),
  };
  const player = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
  player.mode = 'walk';
  player.enabled = true;
  player.ground = ground;
  player.position.copy(aircraft.group.localToWorld(new THREE.Vector3(-3.3, 1.66 - AC.gearY, -1.05)));
  player.yaw = -Math.PI / 2;
  player.keys.add('KeyW');
  player.keys.add('KeyC');
  let deepest = Infinity;
  let greatestHorizontalStep = 0;
  let previous = aircraft.group.worldToLocal(player.position.clone());
  for (let frame = 0; frame < 220; frame++) {
    player.update(1 / 60);
    const local = aircraft.group.worldToLocal(player.position.clone());
    deepest = Math.min(deepest, local.x);
    greatestHorizontalStep = Math.max(
      greatestHorizontalStep,
      Math.hypot(local.x - previous.x, local.z - previous.z),
    );
    previous = local;
  }
  const reached = aircraft.group.worldToLocal(player.position.clone());
  assert.ok(reached.x >= 0, `the real crouched player stopped at local x=${reached.x.toFixed(3)} before entering the hold`);
  assert.ok(deepest <= -3.29, 'the ramp test did not begin outside the airframe');
  assert.ok(greatestHorizontalStep <= 0.03,
    `the ramp route teleported the player ${(greatestHorizontalStep * 1000).toFixed(1)} mm in one horizontal frame`);

  /* A second real player walks longitudinally below the high wing, well
   * outside the fuselage footprint. Shell collision must not turn the entire
   * wing or its x/z projection into an invisible underbody wall. */
  const underWing = new Player(new THREE.PerspectiveCamera(66, 1, 0.1, 100), world);
  underWing.mode = 'walk';
  underWing.enabled = true;
  underWing.ground = ground;
  underWing.position.copy(aircraft.group.localToWorld(new THREE.Vector3(3.0, 1.66 - AC.gearY, 5.8)));
  underWing.yaw = 0;
  underWing.keys.add('KeyW');
  for (let frame = 0; frame < 360; frame++) underWing.update(1 / 60);
  const underWingEnd = aircraft.group.worldToLocal(underWing.position.clone());
  assert.ok(underWingEnd.z < -3.5,
    `the clear under-wing lane stopped the real player at local z=${underWingEnd.z.toFixed(3)}`);
  assert.ok(Math.abs(underWing.ground - ground) <= 0.002,
    `the clear under-wing lane raised the player ${(underWing.ground - ground).toFixed(3)} m`);
});

test('every modeled transparent cockpit surface has finite geometry and visible winding from both sides', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const glazing = meshesMatching(aircraft.group, /^(?:windshield|cabin-glass-(?:side|quarter)-(?:left|right))$/);
  assert.equal(glazing.length, 5, 'the cockpit glazing set is incomplete');

  for (const pane of glazing) {
    assert.ok(pane.geometry.attributes.position.count >= 8, `${pane.name} has no closed glass volume`);
    const paneBox = geometryBoundsOf(pane);
    const size = paneBox.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every(Number.isFinite), `${pane.name} has non-finite bounds`);
    assert.ok(Math.min(size.x, size.y, size.z) >= 0.05, `${pane.name} has a zero-thickness axis`);
    assert.equal(pane.material.transparent, true, `${pane.name} is opaque`);
    assert.ok(pane.material.opacity >= 0.3 && pane.material.opacity <= 0.6,
      `${pane.name} opacity ${pane.material.opacity} is not readable glazing`);
    const normal = pane.localToWorld(new THREE.Vector3(0, 0, 1))
      .sub(pane.getWorldPosition(new THREE.Vector3())).normalize();
    const centre = pane.getWorldPosition(new THREE.Vector3());
    for (const sign of [-1, 1]) {
      const origin = centre.clone().addScaledVector(normal, sign * 2);
      const hits = new THREE.Raycaster(
        origin,
        centre.clone().sub(origin).normalize(),
        0,
        2.1,
      ).intersectObject(pane, false);
      assert.ok(hits.length > 0, `${pane.name} has no rendered face from side ${sign}`);
    }
  }
});

test('the pilot eye has a clear forward sight cone through the framed windshield', () => {
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);
  const windshield = meshesMatching(aircraft.group, /^windshield$/)[0];
  const glassBox = geometryBoundsOf(windshield);
  const targetZ = glassBox.getCenter(new THREE.Vector3()).z;
  const samples = [];
  for (const dx of [-0.22, 0, 0.22]) {
    for (const dy of [-0.08, -0.04, 0]) samples.push(new THREE.Vector3(aircraft.pilotEye.x + dx, aircraft.pilotEye.y + dy, targetZ));
  }
  for (const target of samples) {
    const direction = target.clone().sub(aircraft.pilotEye);
    const distance = direction.length();
    const hits = new THREE.Raycaster(aircraft.pilotEye.clone(), direction.normalize(), 0.1, distance + 0.05)
      .intersectObject(aircraft.group, true)
      .filter((hit) => {
        for (let object = hit.object; object; object = object.parent) if (object.visible === false) return false;
        const material = Array.isArray(hit.object.material)
          ? hit.object.material[hit.face?.materialIndex ?? 0]
          : hit.object.material;
        return material?.visible !== false && material?.opacity !== 0;
      });
    assert.ok(hits.length > 0, `sight-cone sample ${target.toArray().join(',')} crosses no rendered surface`);
    assert.equal(
      hits[0].object.name,
      'windshield',
      `${hits[0].object.name || '(unnamed surface)'} blocks sight-cone sample ${target.toArray().join(',')}`,
    );
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { EnolaSquatch }, { AircraftPhysics }, { AC_ENOLA }, { createCrew },
  { CameraManager }, { InteractionSystem }, { MissionController }, { GunnerStation }, { Player },
] = await Promise.all([
  import('../src/enolasquatch/scenes/EnolaSquatch.js'),
  import('../src/beefrun/physics.js'),
  import('../src/enolasquatch/config.js'),
  import('../src/enolasquatch/crew.js'),
  import('../src/beefrun/cameras.js'),
  import('../src/core/interaction.js'),
  import('../src/enolasquatch/mission/MissionController.js'),
  import('../src/enolasquatch/systems/GunnerStation.js'),
  import('../src/core/player.js'),
]);

const FUSE_LEN_TEST = 15.5;
const CABIN_FLOOR_TOP_TEST = -0.09;

function shown(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

function opaque(object) {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => material?.visible !== false
    && (material.transparent !== true || (material.opacity ?? 1) >= 0.95));
}

function opaqueHit(hit) {
  const material = Array.isArray(hit.object.material)
    ? hit.object.material[hit.face?.materialIndex ?? 0]
    : hit.object.material;
  return material?.visible !== false
    && (material?.transparent !== true || (material?.opacity ?? 1) >= 0.95);
}

function ownerIn(object, owner) {
  for (let node = object; node; node = node.parent) if (node === owner) return true;
  return false;
}

function ownBounds(mesh) {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}

function boundsInFrame(mesh, frame) {
  mesh.geometry.computeBoundingBox();
  frame.updateWorldMatrix(true, false);
  mesh.updateWorldMatrix(true, false);
  const intoFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert()
    .multiply(mesh.matrixWorld);
  return mesh.geometry.boundingBox.clone().applyMatrix4(intoFrame);
}

function boxGap(a, b) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

test('the cockpit windshield, frame, and side panes expose one exact semantic identity each', () => {
  const aircraft = new EnolaSquatch();
  const expectedNames = [
    'cockpit-windshield',
    'cockpit-windshield-frame-post-starboard',
    'cockpit-windshield-frame-post-centre',
    'cockpit-windshield-frame-post-port',
    'cockpit-windshield-frame-header',
    'cockpit-side-window-starboard',
    'cockpit-side-window-port',
  ];
  const counts = new Map(expectedNames.map((name) => [name, 0]));
  aircraft.parts.cockpit.traverse((object) => {
    if (counts.has(object.name)) counts.set(object.name, counts.get(object.name) + 1);
  });

  assert.deepEqual(
    Object.fromEntries(counts),
    Object.fromEntries(expectedNames.map((name) => [name, 1])),
    'cockpit evidence cannot own every glazing/frame member by one stable name',
  );
  assert.equal(aircraft.parts.windshield.name, 'cockpit-windshield');
  assert.deepEqual(
    aircraft.parts.sideWindows.map((window) => window.name).sort(),
    ['cockpit-side-window-port', 'cockpit-side-window-starboard'],
  );
});

test('the pilot sees the real windshield before any opaque airframe surface', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);

  const eye = aircraft.group.localToWorld(aircraft.pilotEye.clone());
  // Aim through the pilot-side pane, not through the authored centre mullion.
  const target = aircraft.parts.windshield.localToWorld(new THREE.Vector3(0.45, 0.25, 0));
  const direction = target.clone().sub(eye);
  const windshieldDistance = direction.length();
  const ray = new THREE.Raycaster(eye, direction.normalize(), 0, windshieldDistance + 0.2);
  const meshes = [];
  aircraft.group.traverse((object) => {
    if (object.isMesh && shown(object)) meshes.push(object);
  });
  const hits = ray.intersectObjects(meshes, false);
  const glassHit = hits.find((hit) => hit.object === aircraft.parts.windshield);
  assert.ok(glassHit, 'the authored pilot eye cannot raycast its windshield');

  const blockers = hits.filter((hit) => hit.distance < glassHit.distance - 1e-4 && opaque(hit.object));
  assert.deepEqual(
    blockers.map((hit) => ({
      name: hit.object.name || '(unnamed mesh)',
      parent: hit.object.parent?.name || '(unnamed parent)',
      distance: Number(hit.distance.toFixed(4)),
    })),
    [],
    `opaque cockpit blockers precede the windshield at ${glassHit.distance.toFixed(4)} m`,
  );
});

test('the pilot can see the instrument face and both side windows from inside', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const eye = aircraft.group.localToWorld(aircraft.pilotEye.clone());
  const meshes = [];
  aircraft.group.traverse((object) => {
    if (object.isMesh && shown(object)) meshes.push(object);
  });
  const firstHitTo = (object) => {
    const target = object.getWorldPosition(new THREE.Vector3());
    const delta = target.clone().sub(eye);
    const distance = delta.length();
    return new THREE.Raycaster(eye, delta.normalize(), 0, distance + 0.1)
      .intersectObjects(meshes, false)[0];
  };

  const panelFace = aircraft.group.getObjectByName('cockpit-instrument-face');
  assert.ok(panelFace?.isMesh, 'the real instrument face is not named/resolvable');
  const panelHit = firstHitTo(panelFace);
  assert.ok(panelHit?.object === panelFace,
    `instrument face is hidden behind ${panelHit?.object?.name || '(no hit)'}`);

  const windows = [];
  aircraft.parts.cockpit.traverse((object) => {
    if (/^cockpit-side-window-(?:starboard|port)$/.test(object.name)) windows.push(object);
  });
  assert.equal(windows.length, 2, 'the flight deck needs two auditable side windows');
  for (const window of windows) {
    assert.equal(window.material.transparent, true, 'a side window is opaque');
    assert.ok(window.material.opacity > 0 && window.material.opacity < 0.95,
      `side-window opacity ${window.material.opacity} is not glazing`);
    const hit = firstHitTo(window);
    assert.ok(hit?.object === window,
      `${window.position.x < 0 ? 'copilot' : 'pilot'} side window is hidden behind ${hit?.object?.name || '(no hit)'}`);
  }
});

test('the windshield and both side panes are real exterior-to-interior openings', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const probes = [];
  const windshield = aircraft.parts.windshield;
  const windshieldNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
    windshield.getWorldQuaternion(new THREE.Quaternion()),
  );
  for (const x of [-0.55, 0.55]) {
    for (const y of [-0.2, 0, 0.2]) {
      const surface = windshield.localToWorld(new THREE.Vector3(x, y, 0.05));
      probes.push({
        label: `windshield ${x}/${y}`, glass: windshield,
        origin: surface.clone().addScaledVector(windshieldNormal, 2),
        target: surface.clone().addScaledVector(windshieldNormal, -1),
      });
    }
  }
  for (const glass of aircraft.parts.sideWindows) {
    const outward = new THREE.Vector3(Math.sign(glass.position.x), 0, 0);
    for (const y of [-0.2, 0, 0.2]) {
      for (const z of [-0.45, 0, 0.45]) {
        const surface = glass.localToWorld(new THREE.Vector3(
          Math.sign(glass.position.x) * 0.03, y, z,
        ));
        probes.push({
          label: `${glass.position.x < 0 ? 'starboard' : 'port'} side window ${y}/${z}`,
          glass,
          origin: surface.clone().addScaledVector(outward, 1.5),
          target: surface.clone().addScaledVector(outward, -1.5),
        });
      }
    }
  }
  for (const { label, glass, origin, target } of probes) {
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    const hits = new THREE.Raycaster(origin, direction.normalize(), 0, distance + 0.01)
      .intersectObject(aircraft.group, true).filter((hit) => shown(hit.object));
    const glassHit = hits.find((hit) => hit.object === glass);
    assert.ok(glassHit, `${label} cannot be raycast from outside`);
    const blockers = hits.filter((hit) => {
      if (hit.distance >= distance - 1e-4 || !opaqueHit(hit)) return false;
      if (/^(?:nose-cone|fuselage-spine-|fuselage-skin-)/.test(hit.object.name)) return true;
      for (let node = hit.object; node; node = node.parent) {
        if (node === aircraft.parts.fuselage) return true;
      }
      return false;
    });
    assert.deepEqual(blockers.map((hit) => ({
      name: hit.object.name || hit.object.parent?.name || '(unnamed airframe mesh)',
      geometry: hit.object.geometry?.type,
      distance: Number(hit.distance.toFixed(4)),
    })), [], `${label} is transparent trim over an opaque, uncut airframe shell`);
  }
});

test('both side panes stay shell-clear on a dense near-edge exterior grid', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const blocked = [];
  let probes = 0;

  for (const glass of aircraft.parts.sideWindows) {
    const outward = new THREE.Vector3(Math.sign(glass.position.x), 0, 0);
    /* Stay off triangle/box edges while covering the exact lower-forward
     * region the exterior review falsified (y -0.30..-0.10, z +0.51..+0.68).
     * Every point is on this authored BoxGeometry pane, rather than in a
     * generic world-space bounding-box corner. */
    for (const y of [-0.30, -0.20, -0.10, 0, 0.10, 0.20, 0.30]) {
      for (const z of [-0.68, -0.51, -0.34, -0.17, 0, 0.17, 0.34, 0.51, 0.68]) {
        probes += 1;
        const surface = glass.localToWorld(new THREE.Vector3(
          Math.sign(glass.position.x) * 0.03, y, z,
        ));
        /* Begin 1 mm outside the pane and look inward. The coarser test above
         * proves the real exterior ray intersects the glazing itself; this
         * dense pass measures what is physically behind each known pane
         * surface without asking Three's raycaster to hit a coplanar box edge. */
        const origin = surface.clone().addScaledVector(outward, 0.001);
        const target = surface.clone().addScaledVector(outward, -1.5);
        const direction = target.clone().sub(origin);
        const hits = new THREE.Raycaster(origin, direction.normalize(), 0, direction.length() + 0.01)
          .intersectObject(aircraft.group, true).filter((hit) => shown(hit.object));
        const shellHit = hits.find((hit) => hit.object !== glass && opaqueHit(hit)
          && (/^(?:nose-cone|fuselage-spine-|fuselage-skin-)/.test(hit.object.name)
            || ownerIn(hit.object, aircraft.parts.fuselage)));
        if (shellHit) blocked.push({
          side: glass.position.x < 0 ? 'starboard' : 'port',
          y,
          z: Number(z.toFixed(4)),
          name: shellHit.object.name || '(unnamed airframe mesh)',
          behindGlass: Number(shellHit.distance.toFixed(4)),
        });
      }
    }
  }

  assert.equal(probes, 126, 'the near-edge pane audit lost samples');
  assert.deepEqual(blocked, [],
    `opaque shell backs the side-pane edge:\n${JSON.stringify(blocked, null, 2)}`);
});

test('the roof domes and waist blisters are glazing over actual shell apertures', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const probes = [
    { name: 'navigator-astrodome', origin: new THREE.Vector3(0, 3, 3.1), target: new THREE.Vector3(0, 1.3, 3.1) },
    { name: 'dorsal-turret-glazing', origin: new THREE.Vector3(0, 3.2, -2.75), target: new THREE.Vector3(0, 1.3, -2.75) },
    { name: 'waist-blister-starboard', origin: new THREE.Vector3(-3, -0.2, -5.4), target: new THREE.Vector3(0, -0.2, -5.4) },
    { name: 'waist-blister-port', origin: new THREE.Vector3(3, -0.2, -5.4), target: new THREE.Vector3(0, -0.2, -5.4) },
  ];
  for (const { name, origin, target } of probes) {
    const glazing = aircraft.group.getObjectByName(name);
    assert.ok(glazing?.isMesh, `${name} is missing or not auditable by name`);
    assert.equal(glazing.material.transparent, true, `${name} is opaque`);
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    const hits = new THREE.Raycaster(origin, direction.normalize(), 0, distance)
      .intersectObject(aircraft.group, true).filter((hit) => shown(hit.object));
    assert.ok(hits.some((hit) => hit.object === glazing), `${name} cannot be raycast from outside`);
    const blockers = hits.filter((hit) => {
      if (!opaqueHit(hit)) return false;
      if (/^(?:main-wing|cabin-roof|fuselage-spine-)/.test(hit.object.name)) return true;
      for (let node = hit.object; node; node = node.parent) {
        if (node === aircraft.parts.fuselage) return true;
      }
      return false;
    });
    assert.deepEqual(blockers.map((hit) => ({
      name: hit.object.name || hit.object.parent?.name || '(unnamed airframe mesh)',
      geometry: hit.object.geometry?.type,
      distance: Number(hit.distance.toFixed(4)),
    })), [], `${name} is backed by opaque shell geometry`);
  }
});

test('curved roof and waist glazing footprints have no naked rectangular-cut corners', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const defects = [];
  const definitions = [
    { name: 'navigator-astrodome', axis: 'y', centreA: 0, centreB: 3.1,
      extentA: 0.38, extentB: 0.38, outside: 3.2, inside: 1.3 },
    { name: 'dorsal-turret-glazing', axis: 'y', centreA: 0, centreB: -2.75,
      extentA: 0.7, extentB: 0.75, outside: 3.2, inside: 1.3 },
    { name: 'waist-blister-starboard', axis: 'x', centreA: -0.2, centreB: -5.4,
      extentA: 0.6, extentB: 0.65, outside: -3, inside: 0 },
    { name: 'waist-blister-port', axis: 'x', centreA: -0.2, centreB: -5.4,
      extentA: 0.6, extentB: 0.65, outside: 3, inside: 0 },
  ];
  for (const definition of definitions) {
    const glazing = aircraft.group.getObjectByName(definition.name);
    assert.ok(glazing?.isMesh, `${definition.name} is missing`);
    for (let ai = 0; ai < 15; ai += 1) {
      for (let bi = 0; bi < 15; bi += 1) {
        const a = -definition.extentA + (2 * definition.extentA * ai) / 14;
        const b = -definition.extentB + (2 * definition.extentB * bi) / 14;
        const origin = definition.axis === 'y'
          ? new THREE.Vector3(definition.centreA + a, definition.outside, definition.centreB + b)
          : new THREE.Vector3(definition.outside, definition.centreA + a, definition.centreB + b);
        const inside = definition.axis === 'y'
          ? new THREE.Vector3(definition.centreA + a, definition.inside, definition.centreB + b)
          : new THREE.Vector3(definition.inside, definition.centreA + a, definition.centreB + b);
        const direction = inside.clone().sub(origin);
        const distance = direction.length();
        const hits = new THREE.Raycaster(origin, direction.normalize(), 0, distance)
          .intersectObject(aircraft.group, true).filter((hit) => shown(hit.object));
        const glazingHit = hits.some((hit) => hit.object === glazing);
        const shellHit = hits.some((hit) => opaqueHit(hit)
          && (/^fuselage-(?:roof|skin|spine)-/.test(hit.object.name)
            || ownerIn(hit.object, aircraft.parts.fuselage)));
        if (!glazingHit && !shellHit) defects.push({
          name: definition.name, a: Number(a.toFixed(3)), b: Number(b.toFixed(3)), reason: 'naked hole',
        });
      }
    }
  }
  const counts = Object.fromEntries(definitions.map(({ name }) => [
    name, defects.filter((defect) => defect.name === name).length,
  ]));
  assert.equal(defects.length, 0,
    `glazing apertures leave naked rectangular corners ${JSON.stringify(counts)}:\n${JSON.stringify(defects.slice(0, 30), null, 2)}`);
});

test('the real bomb-bay command swings both leaves below their hinge lines', () => {
  const aircraft = new EnolaSquatch();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  for (let frame = 0; frame < 300; frame += 1) {
    physics.time += 1 / 60;
    aircraft.update(1 / 60, physics, undefined, { bombBayOpen: true });
  }
  aircraft.group.updateMatrixWorld(true);
  for (const door of aircraft.parts.bombBayDoors) {
    const leaf = door.children.find((object) => object.isMesh);
    const hinge = door.getWorldPosition(new THREE.Vector3());
    const centre = leaf.getWorldPosition(new THREE.Vector3());
    assert.ok(centre.y <= hinge.y - 0.65,
      `${door.name} swings ${(centre.y - hinge.y).toFixed(3)} m above its belly hinge instead of down`);
  }
});

test('maximum cockpit head travel remains inside the finished flight deck', () => {
  const aircraft = new EnolaSquatch();
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 1000);
  const cameras = new CameraManager(camera);
  const physics = { groundSpeed: 70, tas: 80, rollDeg: 0 };
  const originalRandom = Math.random;
  try {
    for (let frame = 0; frame < 180; frame += 1) {
      // Exercise both extremes of the manager's final positional shake while
      // keeping its internal head bob and g-load shift on the real path.
      Math.random = () => (frame % 2 ? 1 : 0);
      cameras.shake = 1.6;
      cameras.update(1 / 60, physics, aircraft.group, aircraft.pilotEye, {
        roughness: 1,
        gLoad: frame % 2 ? 3 : -1,
      });
      const local = aircraft.group.worldToLocal(camera.position.clone());
      assert.ok(Math.abs(local.x) <= 1.43,
        `cockpit shake put the pilot within 0.10 m of a side wall (x=${local.x.toFixed(4)})`);
      assert.ok(local.y >= 0.01 && local.y <= 1.535,
        `cockpit shake left less than 0.10 m floor/roof clearance (y=${local.y.toFixed(4)})`);
      assert.ok(local.z >= -4.5 && local.z <= 8.15,
        `cockpit shake left less than 0.10 m fore/aft liner clearance (z=${local.z.toFixed(4)})`);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('the bombardier and all of his equipment stay inside the nose glazing', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);
  const glazing = aircraft.group.getObjectByName('bombardier-glazing');
  assert.ok(glazing?.isMesh && glazing.geometry?.type === 'SphereGeometry',
    'the bombardier station lost its real spherical glazing');
  const centre = glazing.getWorldPosition(new THREE.Vector3());
  const radius = glazing.geometry.parameters.radius;
  let worst = { excess: -Infinity, name: '', point: null };
  crew.numbskull.group.traverse((object) => {
    if (!object.isMesh || !shown(object)) return;
    object.updateWorldMatrix(true, false);
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index)
        .applyMatrix4(object.matrixWorld);
      const excess = point.distanceTo(centre) - radius;
      if (excess > worst.excess) worst = { excess, name: object.name, point };
    }
  });
  assert.ok(worst.excess <= 1e-4,
    `${worst.name} protrudes ${(worst.excess * 1000).toFixed(1)} mm through the nose glazing at ${worst.point.toArray().map((value) => value.toFixed(3)).join(', ')}`);
});

test('the bombardier glazing uses surface-hugging frames and an open collar', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);

  const glazing = aircraft.group.getObjectByName('bombardier-glazing');
  const collar = aircraft.group.getObjectByName('nose-glazing-collar');
  const ribs = [];
  aircraft.group.traverse((object) => {
    if (object.name === 'nose-glazing-rib') ribs.push(object);
  });
  assert.ok(glazing?.isMesh && collar?.isMesh, 'the nose glazing lost its auditable shell or collar');
  assert.equal(ribs.length, 3, `the nose glazing has ${ribs.length}/3 structural ribs`);
  assert.equal(collar.geometry?.type, 'TorusGeometry',
    'the nose collar is a capped disc sealing the bombardier away from the cabin');
  for (const rib of ribs) {
    assert.equal(rib.geometry?.type, 'TorusGeometry',
      'a straight glazing rib passes through the bombardier instead of following the shell');
  }

  const centre = glazing.getWorldPosition(new THREE.Vector3());
  let rigRadius = 0;
  crew.numbskull.group.traverse((object) => {
    if (!object.isMesh || !shown(object)) return;
    object.updateWorldMatrix(true, false);
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index)
        .applyMatrix4(object.matrixWorld);
      rigRadius = Math.max(rigRadius, point.distanceTo(centre));
    }
  });
  const innerFrameRadius = Math.min(...ribs.map((rib) => (
    rib.geometry.parameters.radius - rib.geometry.parameters.tube
  )));
  assert.ok(innerFrameRadius - rigRadius >= 0.05,
    `bombardier rig has only ${((innerFrameRadius - rigRadius) * 1000).toFixed(1)} mm clearance from its glazing frames`);
});

test('both front seats have one connected, deck-mounted control yoke', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const floor = aircraft.group.getObjectByName('cabin-floor');
  assert.ok(floor?.isMesh, 'the cockpit lost its real cabin floor');
  const floorBox = new THREE.Box3().setFromObject(floor);

  for (const role of ['pilot', 'copilot']) {
    const yoke = aircraft.group.getObjectByName(`${role}-control-yoke`);
    assert.ok(yoke, `${role} seat has no control yoke`);
    const base = yoke.getObjectByName('control-yoke-base');
    const column = yoke.getObjectByName('control-yoke-column');
    const wheel = yoke.getObjectByName('control-yoke-wheel');
    const grips = [];
    yoke.traverse((object) => {
      if (object.name === 'control-yoke-grip') grips.push(object);
    });
    assert.ok(base?.isMesh && column?.isMesh && wheel, `${role} yoke is not a complete mounted assembly`);
    assert.equal(grips.length, 2, `${role} yoke needs two visible hand grips`);

    const baseBox = new THREE.Box3().setFromObject(base);
    assert.ok(Math.abs(baseBox.min.y - floorBox.max.y) <= 1e-4,
      `${role} yoke base is ${(baseBox.min.y - floorBox.max.y).toFixed(4)} m from the deck`);

    const parts = [];
    yoke.traverse((object) => {
      if (object.isMesh) parts.push(new THREE.Box3().setFromObject(object));
    });
    const boxGap = (a, b) => Math.hypot(
      Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
      Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0),
      Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0),
    );
    const connected = new Set([parts.indexOf(parts.find((box) => box.equals(baseBox)))]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let left = 0; left < parts.length; left += 1) {
        for (let right = left + 1; right < parts.length; right += 1) {
          if (boxGap(parts[left], parts[right]) > 0.003) continue;
          if (connected.has(left) === connected.has(right)) continue;
          connected.add(left);
          connected.add(right);
          expanded = true;
        }
      }
    }
    assert.equal(connected.size, parts.length,
      `${role} yoke has only ${connected.size}/${parts.length} connected visible parts`);
  }
});

test('every occupied cabin seat has deck legs, attached armour, and a belt on its cushion', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const floor = aircraft.group.getObjectByName('cabin-floor');
  assert.ok(floor?.isMesh, 'the cabin lost its floor support datum');
  const floorTop = ownBounds(floor).max.y;

  for (const [role, seat] of Object.entries(aircraft.anchors.seats)) {
    const pan = seat.getObjectByName('cockpit-seat-pan');
    const back = seat.getObjectByName('cockpit-seat-back');
    const legs = [];
    seat.traverse((object) => {
      if (object.name === 'cockpit-seat-leg') legs.push(object);
    });
    const belt = seat.children.find((object) => object.isMesh
      && object.geometry?.parameters?.width === 0.5
      && object.geometry?.parameters?.height === 0.05
      && object.geometry?.parameters?.depth === 0.08);
    const armour = seat.children.find((object) => object.isMesh
      && object.geometry?.parameters?.width === 0.4
      && object.geometry?.parameters?.height === 0.3
      && object.geometry?.parameters?.depth === 0.06);
    assert.ok(pan && back && belt && armour, `${role} seat is missing a safety fixture`);
    assert.equal(legs.length, 4, `${role} seat has ${legs.length}/4 deck legs`);
    for (const [index, leg] of legs.entries()) {
      assert.ok(Math.abs(ownBounds(leg).min.y - floorTop) <= 1e-4,
        `${role} seat leg ${index} is ${(ownBounds(leg).min.y - floorTop).toFixed(4)} m from the deck`);
    }
    const beltGap = ownBounds(belt).min.y - ownBounds(pan).max.y;
    assert.ok(Math.abs(beltGap) <= 0.003,
      `${role} lap belt floats ${(beltGap * 1000).toFixed(1)} mm above its cushion`);
    assert.equal(belt.name, 'cockpit-seat-lap-belt', `${role} lap belt is not auditable by name`);
    assert.equal(armour.name, 'cockpit-seat-head-armour', `${role} head armour is not auditable by name`);
    const armourBackOverlap = new THREE.Box3().copy(ownBounds(armour))
      .intersect(ownBounds(back)).getSize(new THREE.Vector3());
    assert.ok(armourBackOverlap.x > 0.002 && armourBackOverlap.y > 0.002
      && armourBackOverlap.z > 0.002, `${role} head armour is detached from its seat back`);
  }
});

test('the real pitch and roll controls move both visible cockpit yokes', () => {
  const aircraft = new EnolaSquatch();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  physics.controls.pitch = 0.75;
  physics.controls.roll = -0.6;

  const before = aircraft.parts.controlYokes.map(({ pitchPivot, wheel }) => ({
    pitch: pitchPivot.rotation.x,
    roll: wheel.rotation.z,
  }));
  aircraft.update(1 / 60, physics);

  for (const [index, { pitchPivot, wheel }] of aircraft.parts.controlYokes.entries()) {
    assert.ok(pitchPivot.rotation.x < before[index].pitch - 0.01,
      `yoke ${index} did not pull aft with positive pitch input`);
    assert.ok(wheel.rotation.z < before[index].roll - 0.01,
      `yoke ${index} did not turn with negative roll input`);
  }
  assert.equal(aircraft.parts.controlYokes[0].pitchPivot.rotation.x,
    aircraft.parts.controlYokes[1].pitchPivot.rotation.x, 'front control columns disagree on pitch');
  assert.equal(aircraft.parts.controlYokes[0].wheel.rotation.z,
    aircraft.parts.controlYokes[1].wheel.rotation.z, 'front yokes disagree on roll');
});

test('Captain Sasole is seated on the copilot pan instead of hovering above it', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);

  const pan = aircraft.anchors.seats.copilot.getObjectByName('cockpit-seat-pan');
  const torso = crew.sasole.group.getObjectByName('captain_lou_sasole-torso');
  assert.ok(pan?.isMesh && torso?.isMesh, 'the copilot support surfaces are missing');
  const panBox = new THREE.Box3().setFromObject(pan);
  const torsoBox = new THREE.Box3().setFromObject(torso);
  const supportGap = torsoBox.min.y - panBox.max.y;
  assert.ok(Math.abs(supportGap) <= 0.005,
    `Captain Sasole's visible body is ${(supportGap * 1000).toFixed(1)} mm from the copilot pan`);
});

test('the copilot and navigator keep their boots on the cabin deck instead of through it', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);
  const floor = aircraft.group.getObjectByName('cabin-floor');
  assert.ok(floor?.isMesh, 'the seated-crew contact audit lost the cabin floor');
  const floorTop = ownBounds(floor).max.y;
  for (const member of [crew.sasole, crew.irish]) {
    const boots = [];
    member.group.traverse((object) => {
      if (object.isMesh && object.name.endsWith('-boot')) boots.push(object);
    });
    assert.equal(boots.length, 2, `${member.group.name} does not have two boot contact surfaces`);
    for (const boot of boots) {
      const contactGap = ownBounds(boot).min.y - floorTop;
      assert.ok(Math.abs(contactGap) <= 0.003,
        `${boot.name} is ${(contactGap * 1000).toFixed(1)} mm from the cabin deck`);
    }
  }
});

test('the copilot and navigator remain fully inside the finished cabin volume', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);
  const intoAircraft = new THREE.Matrix4().copy(aircraft.group.matrixWorld).invert();
  const defects = [];
  for (const member of [crew.sasole, crew.irish]) {
    member.group.traverse((object) => {
      if (!object.isMesh || !shown(object)) return;
      object.updateWorldMatrix(true, false);
      const positions = object.geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index)
          .applyMatrix4(object.matrixWorld).applyMatrix4(intoAircraft);
        if (point.x < -1.53 - 1e-4 || point.x > 1.53 + 1e-4
            || point.y < -0.09 - 0.001 || point.y > 1.635 + 1e-4
            || point.z < -4.6 - 1e-4 || point.z > 8.25 + 1e-4) {
          defects.push({ member: member.group.name, part: object.name, point: point.toArray() });
        }
      }
    });
  }
  assert.deepEqual(defects, [], `seated crew outside cabin liner:\n${JSON.stringify(defects.slice(0, 20), null, 2)}`);
});

test('Irish clears the navigator table instead of intersecting it', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);

  const table = aircraft.group.getObjectByName('nav-table');
  assert.ok(table?.isMesh, 'the navigator station lost its chart table');
  const tableParts = [];
  table.traverse((object) => {
    if (object.isMesh) tableParts.push(object);
  });
  const bodyParts = [];
  crew.irish.group.traverse((object) => {
    if (object.isMesh && shown(object) && object.name !== 'irish-chart') bodyParts.push(object);
  });
  const contacts = [];
  for (const body of bodyParts) {
    const bodyBox = ownBounds(body);
    for (const fixture of tableParts) {
      const fixtureBox = ownBounds(fixture);
      const overlap = new THREE.Box3().copy(bodyBox).intersect(fixtureBox)
        .getSize(new THREE.Vector3());
      if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
        contacts.push({
          body: body.name,
          fixture: fixture.name || 'nav-table-part',
          fixtureSize: [fixture.geometry.parameters?.width, fixture.geometry.parameters?.height,
            fixture.geometry.parameters?.depth],
          fixturePosition: fixture.position.toArray().map((value) => Number(value.toFixed(4))),
          overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
        });
      }
    }
  }
  assert.deepEqual(contacts, [], `navigator/table contacts:\n${JSON.stringify(contacts, null, 2)}`);
});

test('the copilot clears his moving yoke through the full control envelope', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  const copilotYoke = aircraft.parts.controlYokes[1].assembly;
  const defects = [];

  for (const [pitch, roll] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    physics.controls.pitch = pitch;
    physics.controls.roll = roll;
    for (let frame = 0; frame < 90; frame += 1) aircraft.update(1 / 60, physics);
    aircraft.group.updateMatrixWorld(true);

    const yokeParts = [];
    copilotYoke.traverse((object) => {
      if (object.isMesh) yokeParts.push(object);
    });
    const bodyParts = [];
    crew.sasole.group.traverse((object) => {
      if (object.isMesh && shown(object) && !object.name.endsWith('-hand')) bodyParts.push(object);
    });
    for (const body of bodyParts) {
      const bodyBox = ownBounds(body);
      for (const fixture of yokeParts) {
        const overlap = new THREE.Box3().copy(bodyBox).intersect(ownBounds(fixture))
          .getSize(new THREE.Vector3());
        if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
          defects.push({
            pitch, roll, body: body.name, fixture: fixture.name,
            overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
          });
        }
      }
    }
  }
  assert.deepEqual(defects, [], `copilot/yoke contacts:\n${JSON.stringify(defects, null, 2)}`);
});

test('Captain Sasole clears the complete throttle quadrant', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);

  const pedestal = aircraft.parts.throttleQuadrant || aircraft.parts.cockpit.children.find((object) => (
    object.isMesh
    && object.geometry?.parameters?.width === 0.44
    && object.geometry?.parameters?.height === 0.34
    && object.geometry?.parameters?.depth === 0.9
  ));
  assert.ok(pedestal?.isMesh, 'the throttle quadrant pedestal is missing');
  const fixtures = [pedestal];
  for (const lever of aircraft.parts.throttleLevers) {
    lever.traverse((object) => {
      if (object.isMesh) fixtures.push(object);
    });
  }
  const contacts = [];
  crew.sasole.group.traverse((body) => {
    if (!body.isMesh || !shown(body)) return;
    for (const fixture of fixtures) {
      const overlap = new THREE.Box3().copy(ownBounds(body)).intersect(ownBounds(fixture))
        .getSize(new THREE.Vector3());
      if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
        contacts.push({
          body: body.name,
          fixture: fixture.name || '(unnamed throttle fixture)',
          overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
        });
      }
    }
  });
  assert.deepEqual(contacts, [], `copilot/throttle contacts:\n${JSON.stringify(contacts, null, 2)}`);
});

test('the instrument panel and four-engine throttle quadrant have visible load paths', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const floor = ownBounds(aircraft.group.getObjectByName('cabin-floor'));
  for (const { fixture, pattern, count } of [
    { fixture: aircraft.parts.instrumentPanel, pattern: /^cockpit-instrument-panel-support-/, count: 2 },
    { fixture: aircraft.parts.throttleQuadrant, pattern: /^cockpit-throttle-quadrant-support-/, count: 2 },
  ]) {
    const supports = [];
    aircraft.parts.cockpit.traverse((object) => {
      if (object.isMesh && pattern.test(object.name)) supports.push(object);
    });
    assert.equal(supports.length, count, `${fixture.name} has ${supports.length}/${count} supports`);
    const fixtureBox = ownBounds(fixture);
    for (const support of supports) {
      const box = ownBounds(support);
      assert.ok(Math.abs(box.min.y - floor.max.y) <= 1e-4,
        `${support.name} is ${((box.min.y - floor.max.y) * 1000).toFixed(1)} mm from the deck`);
      assert.ok(box.intersectsBox(fixtureBox), `${support.name} does not meet ${fixture.name}`);
    }
  }
});

test('both front stations have deck-mounted rudder pedals that animate with real yaw input', () => {
  const aircraft = new EnolaSquatch();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  aircraft.group.updateMatrixWorld(true);
  const pedals = [];
  const mounts = [];
  aircraft.parts.cockpit.traverse((object) => {
    if (/^(?:pilot|copilot)-rudder-pedal-(?:left|right)$/.test(object.name)) pedals.push(object);
    if (/^(?:pilot|copilot)-rudder-pedal-(?:left|right)-mount$/.test(object.name)) mounts.push(object);
  });
  assert.equal(pedals.length, 4, 'the two front stations need four visible rudder pedals');
  assert.equal(mounts.length, 4, 'every rudder pedal needs a deck mount');
  const floor = ownBounds(aircraft.group.getObjectByName('cabin-floor'));
  for (const mount of mounts) {
    const box = ownBounds(mount);
    assert.ok(Math.abs(box.min.y - floor.max.y) <= 1e-4,
      `${mount.name} is not carried by the deck`);
  }
  const samples = new Map(pedals.map((pedal) => [pedal.name, []]));
  for (const yaw of [-1, 0, 1]) {
    physics.controls.yaw = yaw;
    for (let frame = 0; frame < 90; frame += 1) aircraft.update(1 / 60, physics);
    aircraft.group.updateMatrixWorld(true);
    for (const pedal of pedals) samples.get(pedal.name).push(pedal.getWorldPosition(new THREE.Vector3()).z);
  }
  for (const [name, positions] of samples) {
    assert.ok(Math.max(...positions) - Math.min(...positions) >= 0.07,
      `${name} moves only ${((Math.max(...positions) - Math.min(...positions)) * 1000).toFixed(1)} mm at full rudder`);
  }
});

test('all four throttle levers follow the real two-bank throttle controls', () => {
  const aircraft = new EnolaSquatch();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  const rotations = aircraft.parts.throttleLevers.map(() => []);
  for (const [left, right] of [[0, 0], [1, 0.15], [0.2, 1]]) {
    physics.controls.throttleL = left;
    physics.controls.throttleR = right;
    for (let frame = 0; frame < 200; frame += 1) aircraft.update(1 / 60, physics);
    aircraft.parts.throttleLevers.forEach((lever, index) => rotations[index].push(lever.rotation.x));
  }
  for (const [index, values] of rotations.entries()) {
    assert.ok(Math.max(...values) - Math.min(...values) >= 0.45,
      `cockpit-throttle-lever-${index + 1} stays fixed through real throttle changes`);
  }
  assert.ok(Math.abs(rotations[0][1] - rotations[1][1]) <= 1e-5, 'left-bank levers disagree');
  assert.ok(Math.abs(rotations[2][1] - rotations[3][1]) <= 1e-5, 'right-bank levers disagree');
});

test('both yokes clear the instrument panel through the full pitch-and-roll envelope', () => {
  const aircraft = new EnolaSquatch();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  const defects = [];
  for (const [pitch, roll] of [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]]) {
    physics.controls.pitch = pitch;
    physics.controls.roll = roll;
    for (let frame = 0; frame < 120; frame += 1) aircraft.update(1 / 60, physics);
    aircraft.group.updateMatrixWorld(true);
    const panel = ownBounds(aircraft.parts.instrumentPanel);
    for (const { assembly } of aircraft.parts.controlYokes) {
      assembly.traverse((object) => {
        if (!object.isMesh) return;
        const overlap = ownBounds(object).intersect(panel.clone()).getSize(new THREE.Vector3());
        if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) defects.push({
          pitch, roll, yoke: assembly.name, part: object.name,
          overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
        });
      });
    }
  }
  assert.deepEqual(defects, [], `yoke/panel penetrations:\n${JSON.stringify(defects, null, 2)}`);
});

test('Captain Sasole keeps both boots clear of the complete rudder-pedal sweep', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  crew.takeSeats(aircraft);
  const fixtures = [];
  aircraft.parts.cockpit.traverse((object) => {
    if (object.isMesh && /^copilot-rudder-pedal-/.test(object.name)) fixtures.push(object);
  });
  assert.equal(fixtures.length, 4, 'the copilot rudder station is incomplete');
  const boots = [];
  crew.sasole.group.traverse((object) => {
    if (object.isMesh && object.name.endsWith('-boot')) boots.push(object);
  });
  const contacts = [];
  for (const yaw of [-1, 0, 1]) {
    physics.controls.yaw = yaw;
    for (let frame = 0; frame < 120; frame += 1) aircraft.update(1 / 60, physics);
    aircraft.group.updateMatrixWorld(true);
    for (const boot of boots) {
      for (const fixture of fixtures) {
        const overlap = ownBounds(boot).intersect(ownBounds(fixture).clone()).getSize(new THREE.Vector3());
        if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) contacts.push({
          yaw, boot: boot.name, fixture: fixture.name,
          overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
        });
      }
    }
  }
  assert.deepEqual(contacts, [], `copilot boot/pedal contacts:\n${JSON.stringify(contacts, null, 2)}`);
});

test('the real on-foot Player is stopped by solid airframe but not the open bomb bay', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.position.y = AC_ENOLA.gearY;
  aircraft.group.updateMatrixWorld(true);
  let bombBayOpen = true;
  const world = {
    colliders: [], floorZones: [], groundAt: () => 0,
    resolvePlayer(walker, axis, radius) {
      aircraft.resolveWalkaroundPlayer?.(walker, axis, radius, {
        bombBayOpen,
        crewDoorOpen: aircraft.crewDoorOpen,
      });
    },
  };
  const makePlayerAt = (local) => {
    const player = new Player(new THREE.PerspectiveCamera(), world);
    player.mode = 'walk';
    player.enabled = true;
    player.eyeHeight = 1.66;
    player.position.copy(aircraft.group.localToWorld(local.clone()));
    return player;
  };

  for (const side of [-1, 1]) {
    const player = makePlayerAt(new THREE.Vector3(side * 2.2, -1.34, 4));
    let deepest = Infinity;
    for (let frame = 0; frame < 120; frame += 1) {
      player.position.x -= side * 0.04;
      player._resolve('x');
      const local = aircraft.group.worldToLocal(player.position.clone());
      deepest = Math.min(deepest, Math.abs(local.x));
    }
    assert.ok(deepest >= 1.9 - 1e-4,
      `${side < 0 ? 'starboard' : 'port'} walk crossed solid fuselage to local |x|=${deepest.toFixed(4)}`);
  }

  const underBay = makePlayerAt(new THREE.Vector3(0, -1.34, 0));
  underBay._resolve('x');
  underBay._resolve('z');
  let local = aircraft.group.worldToLocal(underBay.position.clone());
  assert.ok(Math.hypot(local.x, local.z) <= 1e-4,
    `the open bomb bay ejects a person standing under it to ${local.x.toFixed(3)}/${local.z.toFixed(3)}`);

  bombBayOpen = false;
  const underClosedBay = makePlayerAt(new THREE.Vector3(0, -1.34, 0));
  underClosedBay._resolve('x');
  underClosedBay._resolve('z');
  local = aircraft.group.worldToLocal(underClosedBay.position.clone());
  assert.ok(Math.hypot(local.x, local.z) >= 1.9 - 1e-4,
    'the closed belly does not stop a standing player from occupying the payload bay');
  assert.equal(typeof aircraft.resolveWalkaroundPlayer, 'function',
    'the Enola airframe has no public local-frame walkaround resolver');
});

test('the cabin doorway is a full-height opening from the exterior sill to the rear aisle', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const cabin = aircraft.parts.cabin;
  const blockers = [];
  cabin.traverse((object) => {
    if (!object.isMesh || !shown(object) || !opaque(object)) return;
    const box = ownBounds(object);
    // The person-sized transfer volume directly inboard of the crew door.
    const transfer = new THREE.Box3(
      new THREE.Vector3(-1.48, -0.05, -3.8),
      new THREE.Vector3(-0.54, 1.48, -3.0),
    );
    const overlap = new THREE.Box3().copy(box).intersect(transfer).getSize(new THREE.Vector3());
    if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
      blockers.push({
        name: object.name || '(unnamed cabin mesh)',
        overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
      });
    }
  });
  assert.deepEqual(blockers, [], `crew-door transfer blockers:\n${JSON.stringify(blockers, null, 2)}`);
});

test('the exterior crew door and boarding ladder meet the real cabin finish and tarmac', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const floor = aircraft.group.getObjectByName('cabin-floor');
  const door = aircraft.parts.crewDoor;
  const ladder = aircraft.parts.ladder;
  assert.ok(floor?.isMesh && door?.isMesh && ladder, 'door-to-deck geometry is incomplete');
  const floorTop = ownBounds(floor).max.y;
  const doorBox = ownBounds(door);
  assert.ok(Math.abs(doorBox.min.y - floorTop) <= 1e-4,
    `crew door sill is ${(doorBox.min.y - floorTop).toFixed(4)} m from the cabin finish`);

  const rails = [];
  ladder.traverse((object) => {
    if (object.name === 'boarding-ladder-rail') rails.push(object);
  });
  assert.equal(rails.length, 2, 'boarding ladder lost one of its rails');
  for (const [index, rail] of rails.entries()) {
    rail.geometry.computeBoundingBox();
    const local = rail.geometry.boundingBox;
    const top = new THREE.Vector3(0, local.max.y, 0).applyMatrix4(rail.matrixWorld);
    const bottom = new THREE.Vector3(0, local.min.y, 0).applyMatrix4(rail.matrixWorld);
    assert.ok(Math.abs(top.y - floorTop) <= 1e-4,
      `ladder rail ${index} top is ${(top.y - floorTop).toFixed(4)} m from the cabin sill`);
    assert.ok(Math.abs(bottom.y + AC_ENOLA.gearY) <= 1e-4,
      `ladder rail ${index} foot is ${(bottom.y + AC_ENOLA.gearY).toFixed(4)} m from the tarmac`);
  }
});

test('the real boarding flow opens a clear crew-door route and closes it once aboard', () => {
  const aircraft = new EnolaSquatch();
  const interaction = {
    register() {}, unregister() {}, setPaused() {},
  };
  const mission = Object.assign(Object.create(MissionController.prototype), {
    aircraft,
    interaction,
    phase: 'walkaround',
    preflight: { pointAtBoarding() {}, disarm() {} },
    dialogue: { play() {}, setHeadset() {} },
    player: { enabled: true, mode: 'walk' },
    crew: { takeSeats() {} },
    cameras: { setView() {}, lookYaw: 0, lookPitch: 0 },
    audio: { setHeadset() {} },
    input: {},
    flightHud: { show() {} },
    boardTarget: null,
  });

  assert.equal(aircraft.crewDoorOpen, false, 'the parked crew door does not start closed');
  aircraft.group.updateMatrixWorld(true);
  for (const y of [0.15, 0.65, 1.15]) {
    for (const z of [-3.65, -3.4, -3.15]) {
      const origin = new THREE.Vector3(-4, y, z);
      const target = new THREE.Vector3(0, y, z);
      const direction = target.clone().sub(origin);
      const hits = new THREE.Raycaster(origin, direction.normalize(), 0, direction.length())
        .intersectObject(aircraft.group, true);
      let firstOpaque = null;
      for (const hit of hits) {
        if (!shown(hit.object) || !opaqueHit(hit)) continue;
        firstOpaque = hit;
        break;
      }
      /* Three's vendored raycaster can miss a 50 mm BoxGeometry nearly
       * edge-on. The exact closed-leaf plane must still cover every sample. */
      const leafBox = ownBounds(aircraft.parts.crewDoor);
      const leafCovers = y >= leafBox.min.y - 1e-4 && y <= leafBox.max.y + 1e-4
        && z >= leafBox.min.z - 1e-4 && z <= leafBox.max.z + 1e-4;
      assert.ok(firstOpaque || leafCovers, `closed crew door has an exterior hole at y=${y}, z=${z}`);
      let belongsToDoor = firstOpaque ? firstOpaque.object === aircraft.parts.crewDoor : leafCovers;
      for (let node = firstOpaque?.object; node && !belongsToDoor; node = node.parent) {
        belongsToDoor = node === aircraft.parts.crewDoorHinge;
      }
      assert.ok(belongsToDoor,
        `${firstOpaque?.object?.name || '(unnamed shell)'} seals the doorway behind its closed leaf at y=${y}, z=${z}`);
    }
  }

  mission.armBoardingTarget();
  assert.equal(aircraft.crewDoorOpen, true, 'arming the real boarding route does not open its door');
  assert.ok(Math.abs(aircraft.parts.crewDoorHinge?.rotation.y ?? 0) >= 1.2,
    'the crew-door leaf does not swing out of its opening');

  aircraft.group.updateMatrixWorld(true);
  const blockedSamples = [];
  for (const y of [0.15, 0.65, 1.15]) {
    for (const z of [-3.65, -3.4, -3.15]) {
      const origin = new THREE.Vector3(-4, y, z);
      const target = new THREE.Vector3(0, y, z);
      const direction = target.clone().sub(origin);
      const first = new THREE.Raycaster(origin, direction.normalize(), 0, direction.length())
        .intersectObject(aircraft.group, true)
        .find((hit) => shown(hit.object) && opaqueHit(hit));
      if (first) blockedSamples.push({
        y, z,
        name: first.object.name || first.object.parent?.name || '(unnamed airframe mesh)',
        geometry: first.object.geometry?.type,
        distance: Number(first.distance.toFixed(4)),
      });
    }
  }
  assert.deepEqual(blockedSamples, [],
    'the open crew door still leads into sealed metal instead of the cabin');

  mission.enterCockpit({ advance: false });
  assert.equal(aircraft.crewDoorOpen, false, 'the real boarding transition leaves the crew door open in flight');
  assert.ok(Math.abs(aircraft.parts.crewDoorHinge?.rotation.y ?? 0) <= 1e-6,
    'the crew-door leaf does not return to its frame after boarding');
  assert.equal(aircraft.parts.ladder.visible, false, 'the boarding ladder remains attached after boarding');
});

test('the real boarding target is ray-reachable from the ladder approach', () => {
  const aircraft = new EnolaSquatch();
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 100);
  const hud = { hidePrompt() {}, showPrompt() {}, setHold() {} };
  const interaction = new InteractionSystem(camera, hud);
  let boarded = false;
  const mission = Object.assign(Object.create(MissionController.prototype), {
    aircraft,
    interaction,
    dialogue: { play() {} },
    preflight: { pointAtBoarding() {} },
    enterCockpit() { boarded = true; },
    boardTarget: null,
  });
  mission.armBoardingTarget();
  assert.ok(mission.boardTarget?.userData?.interact, 'the real crew-door interaction did not arm');
  aircraft.group.updateMatrixWorld(true);
  const centre = mission.boardTarget.getWorldPosition(new THREE.Vector3());
  const approach = aircraft.group.localToWorld(new THREE.Vector3(
    mission.boardTarget.position.x - 3.5,
    mission.boardTarget.position.y,
    mission.boardTarget.position.z,
  ));
  camera.position.copy(approach);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  interaction.update(1 / 60);
  assert.ok(interaction.current === mission.boardTarget,
    `crew-door boarding target is not reachable from ${(approach.distanceTo(centre) - 1.7).toFixed(2)} m stand-off`);
  interaction.press();
  assert.equal(boarded, true, 'using the reachable real boarding target did not enter the cockpit');
});

test('a real Player can walk from the final control-surface check to the crew-door prompt at the parked heading', () => {
  const aircraft = new EnolaSquatch();
  const ground = 42;
  aircraft.group.position.set(-58, ground + AC_ENOLA.gearY, 342);
  aircraft.group.rotation.y = Math.PI / 2;
  aircraft.setCrewDoorOpen(true);
  aircraft.group.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 1000);
  const world = {
    colliders: [], floorZones: [], groundAt: () => ground,
    resolvePlayer(walker, axis, radius) {
      aircraft.resolveWalkaroundPlayer(walker, axis, radius, {
        crewDoorOpen: aircraft.crewDoorOpen,
        bombBayOpen: true,
      });
    },
  };
  const player = new Player(camera, world);
  player.mode = 'walk';
  player.enabled = true;
  player.ground = ground;

  const interaction = new InteractionSystem(camera, {
    hidePrompt() {}, showPrompt() {}, setHold() {},
  });
  const target = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 3, 3.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  const anchor = aircraft.anchors.crewDoor;
  target.position.set(anchor.x - 0.7, anchor.y - 0.35, anchor.z);
  target.name = 'enola-board';
  aircraft.group.add(target);
  interaction.register(target, { label: () => 'Climb aboard', key: 'E', onUse() {} });

  const elevatorWorld = aircraft.parts.elevator.getWorldPosition(new THREE.Vector3());
  const aircraftWorld = aircraft.group.getWorldPosition(new THREE.Vector3());
  const away = elevatorWorld.clone().sub(aircraftWorld).setY(0);
  if (away.lengthSq() < 4) away.set(-1, 0, 0).applyQuaternion(aircraft.group.quaternion).setY(0);
  away.normalize();
  player.position.copy(elevatorWorld).addScaledVector(away, 2);
  player.position.y = ground + player.eyeHeight;
  const targetWorld = target.getWorldPosition(new THREE.Vector3());
  const dx = targetWorld.x - player.position.x;
  const dz = targetWorld.z - player.position.z;
  const startDistance = Math.hypot(dx, dz);
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = 0;
  player.keys.add('KeyW');

  let prompted = false;
  let closestPromptDistance = startDistance;
  const routeSamples = [];
  for (let frame = 0; frame < 900; frame += 1) {
    player.update(1 / 60);
    aircraft.group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    interaction.update(1 / 60);
    const distance = Math.hypot(
      player.position.x - targetWorld.x,
      player.position.z - targetWorld.z,
    );
    closestPromptDistance = Math.min(closestPromptDistance, distance);
    if (frame % 120 === 0) routeSamples.push({
      frame,
      local: aircraft.group.worldToLocal(player.position.clone()).toArray()
        .map((value) => Number(value.toFixed(3))),
      distance: Number(distance.toFixed(3)),
    });
    if (interaction.current === target) { prompted = true; break; }
  }
  player.keys.delete('KeyW');
  const promptDistance = Math.hypot(
    player.position.x - targetWorld.x,
    player.position.z - targetWorld.z,
  );
  assert.ok(startDistance > 8, `the final-check route starts only ${startDistance.toFixed(2)} m away`);
  assert.equal(prompted, true,
    `the real rotated-airframe route stops ${promptDistance.toFixed(2)} m from the crew-door prompt `
      + `(closest ${closestPromptDistance.toFixed(2)}; ${JSON.stringify(routeSamples)})`);
  assert.ok(promptDistance > 2.5,
    `the prompt appears only after the player is already ${promptDistance.toFixed(2)} m from its centre`);
});

test('the rear gunner is seated on the turret pan instead of penetrating it', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);
  const pan = aircraft.parts.rearGunStation.getObjectByName('rear-gun-seat-pan');
  const torso = crew.shubes.group.getObjectByName('shubes-torso');
  assert.ok(pan && torso?.isMesh, 'the rear-gunner support geometry is incomplete');
  const panBox = ownBounds(pan);
  const torsoBox = ownBounds(torso);
  const supportGap = torsoBox.min.y - panBox.max.y;
  assert.ok(Math.abs(supportGap) <= 0.005,
    `the rear gunner's visible body is ${(supportGap * 1000).toFixed(1)} mm from the turret pan`);
});

test('all seated crew keep their authored supports through 1,200 real breathing frames', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const floor = aircraft.group.getObjectByName('cabin-floor');
  const samples = {
    sasoleBoot: [], irishBoot: [], sasolePan: [], shubesPan: [],
  };
  const bootsOf = (member) => {
    const boots = [];
    member.group.traverse((object) => {
      if (object.isMesh && object.name.endsWith('-boot')) boots.push(object);
    });
    return boots;
  };
  const sasoleBoots = bootsOf(crew.sasole);
  const irishBoots = bootsOf(crew.irish);
  const sasolePan = crew.sasole.group.parent.getObjectByName('cockpit-seat-pan');
  const shubesPan = aircraft.parts.rearGunStation.getObjectByName('rear-gun-seat-pan');
  for (let frame = 0; frame < 1200; frame += 1) {
    crew.update(1 / 60);
    aircraft.group.updateMatrixWorld(true);
    const floorTop = ownBounds(floor).max.y;
    for (const boot of sasoleBoots) samples.sasoleBoot.push(ownBounds(boot).min.y - floorTop);
    for (const boot of irishBoots) samples.irishBoot.push(ownBounds(boot).min.y - floorTop);
    samples.sasolePan.push(ownBounds(crew.sasole.group.getObjectByName('captain_lou_sasole-torso')).min.y
      - ownBounds(sasolePan).max.y);
    samples.shubesPan.push(ownBounds(crew.shubes.group.getObjectByName('shubes-torso')).min.y
      - ownBounds(shubesPan).max.y);
  }
  const defects = [];
  for (const [name, values] of Object.entries(samples)) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (Math.abs(min) > 0.005 || Math.abs(max) > 0.005) defects.push({
      name, minMm: Number((min * 1000).toFixed(2)), maxMm: Number((max * 1000).toFixed(2)),
    });
  }
  assert.deepEqual(defects, [],
    `breathing breaks seated support contacts:\n${JSON.stringify(defects, null, 2)}`);
});

test('the rear gunner and his seat traverse with the turret as one assembly', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const turret = aircraft.parts.rearGunTurret;
  const pan = aircraft.parts.rearGunStation.getObjectByName('rear-gun-seat-pan');
  const torso = crew.shubes.group.getObjectByName('shubes-torso');
  assert.ok(pan && torso, 'the traversing gunner assembly is incomplete');

  const centre = () => turret.getWorldPosition(new THREE.Vector3());
  const offset = (object) => object.getWorldPosition(new THREE.Vector3()).sub(centre());
  aircraft.group.updateMatrixWorld(true);
  const panBefore = offset(pan);
  const torsoBefore = offset(torso);
  const yaw = 0.82;
  turret.rotation.y = yaw;
  aircraft.group.updateMatrixWorld(true);
  const expectedPan = panBefore.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const expectedTorso = torsoBefore.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  assert.ok(offset(pan).distanceTo(expectedPan) <= 1e-4,
    `the rear seat stayed fixed while its turret traversed (${offset(pan).distanceTo(expectedPan).toFixed(4)} m drift)`);
  assert.ok(offset(torso).distanceTo(expectedTorso) <= 1e-4,
    `the rear gunner stayed fixed while his turret traversed (${offset(torso).distanceTo(expectedTorso).toFixed(4)} m drift)`);
});

test('the complete visible rear gunner stays inside the traversing turret glazing', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const turret = aircraft.parts.rearGunTurret;
  const dome = turret.children.find((object) => object.isMesh
    && object.geometry?.type === 'SphereGeometry');
  assert.ok(dome, 'the rear-gunner containment audit lost the turret glazing');
  for (const yaw of [-1.02, 0, 1.02]) {
    turret.rotation.y = yaw;
    aircraft.group.updateMatrixWorld(true);
    const centre = dome.getWorldPosition(new THREE.Vector3());
    const radius = dome.geometry.parameters.radius;
    let worst = { excess: -Infinity, name: '' };
    crew.shubes.group.traverse((object) => {
      if (!object.isMesh || !shown(object)) return;
      object.updateWorldMatrix(true, false);
      const positions = object.geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index)
          .applyMatrix4(object.matrixWorld);
        const excess = point.distanceTo(centre) - radius;
        if (excess > worst.excess) worst = { excess, name: object.name };
      }
    });
    assert.ok(worst.excess <= 1e-4,
      `${worst.name} protrudes ${(worst.excess * 1000).toFixed(1)} mm through turret glazing at yaw ${yaw}`);
  }
});

test('the rear gunner clears the complete weapon through its control envelope and can hold both grips', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const turret = aircraft.parts.rearGunTurret;
  const yoke = aircraft.parts.rearGunYoke;
  const hardware = [];
  yoke.traverse((object) => {
    if (object.isMesh && shown(object) && object.material?.opacity !== 0) hardware.push(object);
  });
  const body = [];
  crew.shubes.group.traverse((object) => {
    if (object.isMesh && shown(object) && !object.name.endsWith('-hand')) body.push(object);
  });
  const contacts = [];

  for (const pitch of [-0.38, 0, 0.58]) {
    yoke.rotation.x = pitch;
    aircraft.group.updateMatrixWorld(true);
    for (const bodyPart of body) {
      for (const fixture of hardware) {
        const overlap = new THREE.Box3().copy(boundsInFrame(bodyPart, turret))
          .intersect(boundsInFrame(fixture, turret)).getSize(new THREE.Vector3());
        if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
          contacts.push({
            pitch,
            body: bodyPart.name,
            fixture: fixture.name || '(unnamed gun part)',
            geometry: fixture.geometry?.type,
            overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
          });
        }
      }
    }
  }
  assert.deepEqual(contacts, [], `rear-gunner/weapon contacts:\n${JSON.stringify(contacts, null, 2)}`);

  yoke.rotation.x = 0;
  crew.update(0);
  aircraft.group.updateMatrixWorld(true);
  const grips = hardware.filter((object) => object.name === 'rear-gun-spade-grip');
  assert.equal(grips.length, 2, 'the rear gun needs two named spade grips');
  const hands = crew.shubes.arms.map((arm) => arm.hand);
  for (const grip of grips) {
    const hand = hands.find((candidate) => Math.sign(
      boundsInFrame(candidate, turret).getCenter(new THREE.Vector3()).x,
    ) === Math.sign(boundsInFrame(grip, turret).getCenter(new THREE.Vector3()).x));
    assert.ok(hand, 'a rear-gun grip has no same-side hand');
    const overlap = new THREE.Box3().copy(boundsInFrame(hand, turret))
      .intersect(boundsInFrame(grip, turret)).getSize(new THREE.Vector3());
    assert.ok(overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002,
      `rear-gun ${grip.position.x < 0 ? 'left' : 'right'} grip is not in its hand`);
  }
});

test('Shubes follows both spade grips through the full elevation envelope', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const turret = aircraft.parts.rearGunTurret;
  const yoke = aircraft.parts.rearGunYoke;
  const grips = [];
  yoke.traverse((object) => {
    if (object.name === 'rear-gun-spade-grip') grips.push(object);
  });
  assert.equal(grips.length, 2, 'the rear gun lost a spade grip');
  const defects = [];
  for (const pitch of [-0.38, 0, 0.58]) {
    /* Positive local X rotation is the shipping GunnerStation convention. */
    yoke.rotation.x = pitch;
    crew.update(0);
    aircraft.group.updateMatrixWorld(true);
    for (const grip of grips) {
      const gripBox = boundsInFrame(grip, turret);
      const gripX = gripBox.getCenter(new THREE.Vector3()).x;
      const hand = crew.shubes.arms.map((arm) => arm.hand).find((candidate) => Math.sign(
        boundsInFrame(candidate, turret).getCenter(new THREE.Vector3()).x,
      ) === Math.sign(gripX));
      const gap = boxGap(boundsInFrame(hand, turret), gripBox);
      if (gap > 0.005) defects.push({
        pitch, side: gripX < 0 ? 'left' : 'right', gapMm: Number((gap * 1000).toFixed(1)),
      });
    }
  }
  assert.deepEqual(defects, [], `rear-gunner hand/grip gaps:\n${JSON.stringify(defects, null, 2)}`);
});

test('the tail turret glazing clears every fin and tailplane control surface', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const dome = aircraft.parts.rearGunTurret.children.find((object) => object.isMesh
    && object.geometry?.type === 'SphereGeometry');
  assert.ok(dome, 'the tail turret lost its glazing');
  const tailSurfaces = [aircraft.parts.rudder, aircraft.parts.elevator];
  aircraft.group.traverse((object) => {
    if (!object.isMesh || object.geometry?.type !== 'BoxGeometry') return;
    const { width, height, depth } = object.geometry.parameters;
    if ((width === 0.28 && height === 5 && depth === 3.9)
        || (width === 11.6 && height === 0.32 && depth === 2.6)) tailSurfaces.push(object);
  });
  assert.equal(tailSurfaces.length, 4, 'the tail-clearance audit did not resolve all four fixed/moving surfaces');
  const domeBox = ownBounds(dome);
  const contacts = [];
  for (const surface of tailSurfaces) {
    const overlap = new THREE.Box3().copy(domeBox)
      .intersect(new THREE.Box3().setFromObject(surface)).getSize(new THREE.Vector3());
    if (overlap.x > 0.002 && overlap.y > 0.002 && overlap.z > 0.002) {
      contacts.push({
        surface: surface.name || surface.parent?.name || '(unnamed tail surface)',
        overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
      });
    }
  }
  assert.deepEqual(contacts, [], `tail-control/turret contacts:\n${JSON.stringify(contacts, null, 2)}`);
});

test('the complete rear-gun fairing clears the moving rudder and elevator at every limit', () => {
  const aircraft = new EnolaSquatch();
  const fairing = aircraft.parts.rearGunStation.children.find((object) => object.isMesh
    && object.geometry?.type === 'CylinderGeometry'
    && Math.abs(object.geometry.parameters.height - 1.6) <= 1e-6);
  assert.ok(fairing, 'the rear-gun fairing is not resolvable');
  const surfaces = [
    ...aircraft.parts.rudder.children.filter((object) => object.isMesh),
    ...aircraft.parts.elevator.children.filter((object) => object.isMesh),
  ];
  assert.equal(surfaces.length, 2, 'the moving tail-surface audit lost a mesh');
  const defects = [];
  const positions = fairing.geometry.attributes.position;
  for (const yaw of [-1, 0, 1]) {
    for (const pitch of [-1, 0, 1]) {
      aircraft.parts.rudder.rotation.y = -yaw * 0.3;
      aircraft.parts.elevator.rotation.x = -pitch * 0.3;
      aircraft.group.updateMatrixWorld(true);
      for (const [surfaceIndex, surface] of surfaces.entries()) {
        surface.geometry.computeBoundingBox();
        for (let index = 0; index < positions.count; index += 1) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, index)
            .applyMatrix4(fairing.matrixWorld);
          surface.worldToLocal(point);
          if (surface.geometry.boundingBox.containsPoint(point)) {
            defects.push({ yaw, pitch, surface: surfaceIndex ? 'elevator' : 'rudder' });
            break;
          }
        }
      }
    }
  }
  assert.deepEqual(defects, [],
    `rear fairing enters moving tail surfaces:\n${JSON.stringify(defects, null, 2)}`);
});

test('the real gunner reticle, modeled barrels, and tracer origin agree at every limit', () => {
  const aircraft = new EnolaSquatch();
  let tracer = null;
  const gunner = new GunnerStation({
    aircraft,
    interceptors: { fighters: [], damage() { return 'nothing'; } },
    tracers: { fire(round) { tracer = { from: round.from.clone(), to: round.to.clone() }; } },
  });
  gunner.take();
  const defects = [];
  for (const [yaw, pitch] of [[0, 0], [-1.02, -0.38], [-1.02, 0.58], [1.02, -0.38], [1.02, 0.58]]) {
    gunner.yaw = yaw;
    gunner.pitch = pitch;
    for (let frame = 0; frame < 300; frame += 1) {
      aircraft.updateRearGun(1 / 60, {}, { gunFiring: true, gunAim: gunner.aimPoint(new THREE.Vector3()) });
    }
    aircraft.group.updateMatrixWorld(true);
    const desired = gunner.aimWorld(new THREE.Vector3());
    const pivot = aircraft.parts.rearGunYoke.getWorldPosition(new THREE.Vector3());
    const flashMid = aircraft.parts.gunFlash.reduce(
      (sum, flash) => sum.add(flash.getWorldPosition(new THREE.Vector3())), new THREE.Vector3(),
    ).multiplyScalar(0.5);
    const modeled = flashMid.clone().sub(pivot).normalize();
    const angleDeg = THREE.MathUtils.radToDeg(desired.angleTo(modeled));
    tracer = null;
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.5;
      gunner._fireRound();
    } finally {
      Math.random = originalRandom;
    }
    const originGap = tracer?.from.distanceTo(flashMid) ?? Infinity;
    if (angleDeg > 0.5 || originGap > 0.02) defects.push({
      yaw, pitch,
      axisErrorDeg: Number(angleDeg.toFixed(2)),
      tracerOriginGapM: Number(originGap.toFixed(3)),
    });
  }
  assert.deepEqual(defects, [],
    `reticle/model/tracer divergence:\n${JSON.stringify(defects, null, 2)}`);
});

test('taking the real rear-gun station gives an unoccluded camera and restores Shubes on leave', () => {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  const gunner = new GunnerStation({ aircraft, interceptors: { fighters: [] } });
  const mission = Object.assign(Object.create(MissionController.prototype), {
    aircraft, crew, gunner,
    physics: { onGround: false },
    autopilot: { engaged: true, engage() { return true; }, disengage() { this.engaged = false; } },
    gunFiring: false,
    dialogue: { play() {}, bark() {} },
    cameras: { setView() {} },
  });
  assert.equal(mission.toggleGun(), true, 'the real airborne gun transition refused');
  const camera = new THREE.PerspectiveCamera();
  assert.equal(gunner.applyCamera(camera), true, 'the manned station did not place its camera');
  aircraft.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const inside = [];
  crew.shubes.group.traverse((object) => {
    if (!object.isMesh || !shown(object)) return;
    object.geometry.computeBoundingBox();
    const localEye = object.worldToLocal(camera.position.clone());
    if (object.geometry.boundingBox.containsPoint(localEye)) inside.push(object.name);
  });
  const torsoVisible = shown(crew.shubes.group.getObjectByName('shubes-torso'));
  const headVisibleDuring = shown(crew.shubes.head);
  assert.equal(mission.leaveGun(), true, 'the real rear-gun leave transition refused');
  const restored = shown(crew.shubes.head)
    && shown(crew.shubes.group.getObjectByName('shubes-flight-helmet'));
  assert.equal(torsoVisible, true, 'taking first-person gun view hides the entire rear gunner');
  assert.equal(headVisibleDuring, false, 'Shubes keeps his head inside the manned first-person camera');
  assert.deepEqual(inside, [], `manned rear-gun camera is inside visible Shubes meshes: ${inside.join(', ')}`);
  assert.equal(restored, true, 'leaving the gun does not restore Shubes head and helmet');
});

test('the gunner camera has an opaque-free firing sightline at every control limit', () => {
  const aircraft = new EnolaSquatch();
  const meshes = [];
  aircraft.group.traverse((object) => {
    if (object.isMesh && shown(object)) meshes.push(object);
  });
  const blocked = [];
  for (const [yaw, pitch] of [[0, 0], [-1.02, -0.38], [-1.02, 0.58], [1.02, -0.38], [1.02, 0.58]]) {
    aircraft.parts.rearGunTurret.rotation.y = yaw;
    aircraft.parts.rearGunYoke.rotation.x = pitch;
    aircraft.group.updateMatrixWorld(true);
    const eye = aircraft.rearGunEyeWorld(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
    );
    const first = new THREE.Raycaster(eye, direction, 0, 3)
      .intersectObjects(meshes, false).find((hit) => opaque(hit.object));
    if (first) blocked.push({
      yaw,
      pitch,
      name: first.object.name || '(unnamed tail mesh)',
      parent: first.object.parent?.name || '(unnamed parent)',
      geometry: first.object.geometry?.type,
      distance: Number(first.distance.toFixed(4)),
    });
  }
  assert.deepEqual(blocked, [], `blocked tail-gun sightlines:\n${JSON.stringify(blocked, null, 2)}`);
});

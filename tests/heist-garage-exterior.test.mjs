import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildHeistLevel } from '../src/heist/level.js';

/**
 * THE MERCER GARAGE, FROM THE STREET.
 *
 * Owner, playtest item #58: *"the garage exterior is a gray dev block."* It
 * was one 7 x 4.5 x 0.2 concrete slab with an amber bar over it, standing at
 * the end of the street the player looks down for the entire withdrawal.
 *
 * These are the two things that can silently go wrong with what replaced it,
 * and one of them has already cost this repository a shipped bug:
 *
 *  1. THE ROUTE. The escape leaves through that mouth. A building put across
 *     the end of a street is one careless box away from closing the lane it is
 *     supposed to open, so the corridor is MEASURED here — from the meshes and
 *     from the colliders separately, because they are authored separately.
 *
 *  2. THE CROSSHAIR. `window.__heistDebug.use('garage-entry')` calls the
 *     handler by name and casts no ray, which is exactly the check that
 *     certified the bank exit as working while it was walled into a marble
 *     slab (see tests/heist-bank-exit-reachable.test.mjs). So the ray a player
 *     actually casts is cast here, from every position the street's clamp
 *     allows, against the whole phase — because `main.js` makes the entire
 *     phase group an interaction occluder, so anything new in front of the
 *     mouth would eat the prompt.
 *
 * The rest holds the features themselves in place, so a refactor cannot
 * quietly return the scene to a grey rectangle.
 */

/** `PHASE_PLAYER_BOUNDS.street` in src/heist/main.js. */
const STREET_CLAMP = Object.freeze({ minX: -8.8, maxX: 8.8, minZ: -35.2, maxZ: 35.2 });
/** `MAX_DISTANCE` in src/core/interaction.js. */
const REACH = 2.7;
/** The escape sedan's own collider is [4.1, 1.9, 2.2]. Half a metre of air. */
const VEHICLE_HEIGHT = 2.4;
/** The garage's north elevation: where the road, both pavements and both
 *  kerbs stop. Nothing may cross it except over the road. */
const FACE_Z = -36.0;
/** The road's own half width — outside this the pavement slabs begin. */
const ROAD_EDGE_X = 8.55;

/**
 * One build for the whole file. `buildHeistLevel` also builds the escape city,
 * which is fourteen hundred pieces of geometry; twelve of those is ten seconds
 * of a suite that runs on every push. Nothing below mutates the level.
 */
let built = null;
function heistLevel() {
  if (built) return built;
  built = buildHeistLevel(new THREE.Scene());
  /* Nothing renders here, and `Object3D.raycast` reads `matrixWorld` rather
   * than recomputing it, so without this every ray below is cast against
   * stale matrices and answers confidently with garbage. */
  built.phases.street.group.updateMatrixWorld(true);
  built.phases.garage.group.updateMatrixWorld(true);
  return built;
}

function streetPhase() {
  return heistLevel().phases.street;
}

function exteriorOf(street) {
  const root = street.group.getObjectByName('mercer-garage');
  assert.ok(root, 'the street has no mercer-garage exterior');
  return root;
}

function worldBox(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

/**
 * Every mesh under `root` that is actually drawn. Visibility is walked only as
 * far as `root`: `buildHeistLevel` leaves every phase group hidden until it is
 * activated, so a walk to the scene would find nothing anywhere.
 */
function drawnMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (let node = object; node && node !== root.parent; node = node.parent) {
      if (node.visible === false) return;
    }
    meshes.push(object);
  });
  return meshes;
}

/* ------------------------------------------------------------------ */
/* It is a garage, and it has the things a garage has                  */
/* ------------------------------------------------------------------ */

test('the exterior carries every feature the dev block did not', () => {
  const root = exteriorOf(streetPhase());
  const required = [
    // Open decks, and the frame that makes them read as decks.
    'mercer-deck-2-plate', 'mercer-deck-3-plate', 'mercer-roof-plate',
    'mercer-spandrel-2', 'mercer-spandrel-3', 'mercer-parapet', 'mercer-coping',
    'mercer-interior',
    // The ramp entrance.
    'mercer-mouth-head', 'mercer-throat-ramp', 'mercer-throat-soffit',
    'mercer-clearance-bar', 'mercer-clearance-plate',
    // Stair and lift core.
    'mercer-core-shaft', 'mercer-core-slot', 'mercer-core-door',
    'mercer-core-exit-sign', 'mercer-lift-overrun',
    // Signage.
    'garage-sign', 'mercer-fascia-board', 'mercer-vacancy-lamp',
    'mercer-pylon-post', 'mercer-pylon-board',
    // Kerbs, booth, gate arm.
    'mercer-apron', 'mercer-island-west', 'mercer-island-east',
    'mercer-booth', 'mercer-booth-glass', 'mercer-booth-lamp',
    'mercer-gate-cabinet', 'mercer-gate-arm',
    // Lighting.
    'mercer-deck-light-2', 'mercer-deck-light-3', 'mercer-deck-light-throat',
    'mercer-mouth-light',
  ];
  const missing = required.filter((name) => !root.getObjectByName(name));
  assert.deepEqual(missing, [], `the exterior lost ${missing.join(', ')}`);
});

test('it is four levels tall and wider than the street it closes', () => {
  const root = exteriorOf(streetPhase());
  const box = worldBox(root);
  assert.ok(box.max.y >= 11.7,
    `a multi-storey garage has to stand up: top is ${box.max.y.toFixed(2)} m`);
  assert.ok(box.max.x - box.min.x >= 30,
    `frontage is ${(box.max.x - box.min.x).toFixed(2)} m; the road it caps is 18 m wide`);

  // Ground storey plus decks 2, 3 and the roof: four floor levels, numbered.
  const floors = ['mercer-deck-2-plate', 'mercer-deck-3-plate', 'mercer-roof-plate']
    .map((name) => worldBox(root.getObjectByName(name)).max.y);
  assert.deepEqual(floors.map((y) => +y.toFixed(2)), [5, 7.9, 10.8]);
});

test('the level numbers are lit, and there is one per deck above the ground', () => {
  const root = exteriorOf(streetPhase());
  /* The numerals are seven-segment glyphs in boxes — this scene has no
   * textures anywhere in it. Each sits on its own deck's band, stacked. */
  const bands = [5.47, 8.37, 11.25];
  const emissive = drawnMeshes(root).filter((mesh) => (
    mesh.material?.isMeshBasicMaterial && mesh.material.toneMapped === false
  ));
  for (const y of bands) {
    const glyphSegments = emissive.filter((mesh) => {
      const box = worldBox(mesh);
      return box.min.x > -7 && box.max.x < -6
        && box.min.y > y - 0.45 && box.max.y < y + 0.45;
    });
    assert.ok(glyphSegments.length >= 4,
      `deck at y ${y} has ${glyphSegments.length} numeral segments, not a numeral`);
  }
});

test('you can see cars behind the spandrel bands, on the decks', () => {
  const root = exteriorOf(streetPhase());
  const parked = root.getObjectByName('mercer-parked');
  assert.ok(parked, 'the decks are empty');
  const bodies = parked.children.filter((mesh) => mesh.name.startsWith('mercer-parked-'));
  assert.ok(bodies.length >= 6, `only ${bodies.length} cars are parked on the decks`);

  const plates = {
    5: worldBox(root.getObjectByName('mercer-deck-2-plate')),
    7.9: worldBox(root.getObjectByName('mercer-deck-3-plate')),
  };
  const spandrels = {
    5: worldBox(root.getObjectByName('mercer-spandrel-2')),
    7.9: worldBox(root.getObjectByName('mercer-spandrel-3')),
  };
  for (const body of bodies) {
    const box = worldBox(body);
    const deck = +box.min.y.toFixed(2);
    assert.ok(plates[deck], `a car is parked at y ${deck}, which is not a deck`);
    assert.equal(+plates[deck].max.y.toFixed(2), deck,
      'a car on a deck rests on the deck plate rather than floating over it');
    // Inside the front band, clear of the elevation and clear of the mass behind.
    assert.ok(box.min.z > plates[deck].min.z && box.max.z < spandrels[deck].min.z,
      `${body.name} is not inside the visible deck band`);
  }

  /* The point of the exercise: the glasshouse clears the upstand. A band with
   * nothing showing over it is a concrete stripe, not a car park. */
  const roof = Math.max(...drawnMeshes(parked).map((mesh) => worldBox(mesh).max.y)
    .filter((y) => y < 7.5));
  assert.ok(roof - spandrels[5].max.y > 0.4,
    `deck 2 shows ${(roof - spandrels[5].max.y).toFixed(2)} m of car over a `
    + `${spandrels[5].max.y.toFixed(2)} m upstand`);
});

test('the entrance ramp is the interior ramp, seen from the top', () => {
  const level = heistLevel();
  const root = exteriorOf(level.phases.street);
  const throat = root.getObjectByName('mercer-throat-ramp');
  const inside = level.phases.garage.group.getObjectByName('garage-ramp');
  assert.ok(inside, 'buildGarage no longer has a ramp slab to agree with');
  /* One ramp, two ends. The owner had this rotated the wrong way once already
   * (*"the on-ramp that you came in on is inverted the wrong way"*), and the
   * street side of it silently disagreeing would be the same bug from the
   * other direction. */
  assert.equal(+throat.rotation.x.toFixed(3), +inside.rotation.x.toFixed(3));
  assert.equal(+throat.rotation.x.toFixed(3), -0.22);

  const box = worldBox(throat);
  assert.ok(Math.abs(box.max.y) < 0.02,
    `the throat meets the road at grade: it starts at ${box.max.y.toFixed(3)} m`);
  assert.ok(box.min.y < -0.8,
    `and it goes down: the far end is at ${box.min.y.toFixed(3)} m`);
});

test('the clearance bar hangs at the interior lintel\'s own soffit height', () => {
  const root = exteriorOf(streetPhase());
  const bar = worldBox(root.getObjectByName('mercer-clearance-bar'));
  /* `buildGarage`'s ramp portal lintel is [7.6, 1.2, 0.25] centred at y 3.8,
   * so its soffit is 3.20 m. A clearance bar that says anything else is a
   * clearance bar that lies about the building behind it. */
  assert.equal(+bar.min.y.toFixed(2), 3.20);
  assert.ok(bar.max.x - bar.min.x >= 7, 'the bar spans the whole mouth');

  const plate = worldBox(root.getObjectByName('mercer-clearance-plate'));
  assert.ok(plate.max.z > bar.max.z, 'the height plate faces the driver, not the garage');
  assert.ok(plate.min.y < bar.max.y && plate.max.y > bar.min.y,
    'the height plate is bolted to the bar');
});

test('the elevation is in frame from the spawn, not behind the shops', () => {
  const street = streetPhase();
  /* `buildStreet` spawns the player here and `player.yaw = 0` looks down -Z,
   * so this is the frame he sees for the whole withdrawal. */
  const eye = street.spawn.clone();
  assert.deepEqual(eye.toArray(), [0, 1.66, 31]);

  /*
   * The storefront row runs x 10.4 to 16.4 over z -34.5 to -27.5 either side,
   * and it is what decides how much of a 31 m frontage is ever on screen: the
   * cone it leaves reaches only x +/-10.69 by the time it gets to z -36. Every
   * headline feature has to be inside that, and this is the check that says
   * so — the stair core sat at x -13.5 until it was measured, and from there
   * it was behind the shops until the player was three metres from the door.
   */
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const root = exteriorOf(street);
  const inGarage = (object) => {
    for (let node = object; node; node = node.parent) if (node === root) return true;
    return false;
  };
  for (const name of [
    'garage-sign', 'mercer-parapet', 'mercer-spandrel-3', 'mercer-core-slot',
    'mercer-lift-overrun', 'mercer-pylon-board',
    /* Not the booth: it is 2.7 m tall behind a parked saloon at (5.5, -25),
     * and a cashier's kiosk you only see when you are near it is a cashier's
     * kiosk behaving correctly. */
  ]) {
    const object = root.getObjectByName(name);
    const box = worldBox(object);
    // The middle of the face that is turned toward the street.
    const aim = new THREE.Vector3(
      (box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z,
    );
    raycaster.set(eye, aim.clone().sub(eye).normalize());
    const hit = raycaster.intersectObject(street.group, true)
      .find((candidate) => candidate.object.isMesh && candidate.object.visible);
    assert.ok(hit && inGarage(hit.object),
      `the sightline to ${name} is closed: the ray stopped on `
      + `${hit?.object.name || '(anonymous street geometry)'} at `
      + `${hit?.distance.toFixed(1)} m`);
  }
});

/* ------------------------------------------------------------------ */
/* The route through                                                   */
/* ------------------------------------------------------------------ */

/**
 * The lane, measured. Everything the exterior adds that stands in the
 * approach — z -36.05 to -28 — between road level and the roof of a saloon.
 */
function laneClearance(street) {
  const root = exteriorOf(street);
  let west = -Infinity;
  let east = Infinity;
  let westName = null;
  let eastName = null;
  for (const mesh of drawnMeshes(root)) {
    const box = worldBox(mesh);
    if (box.max.z < -36.05 || box.min.z > -28) continue;
    if (box.max.y <= 0.06 || box.min.y >= VEHICLE_HEIGHT) continue;   // paint; overhead
    if (box.max.x <= 0 && box.max.x > west) { west = box.max.x; westName = mesh.name; }
    if (box.min.x >= 0 && box.min.x < east) { east = box.min.x; eastName = mesh.name; }
  }
  return { west, east, westName, eastName, width: east - west };
}

test('the drivable corridor into the mouth is 7.0 m of clear lane', () => {
  const street = streetPhase();
  const lane = laneClearance(street);
  /* 7.0 m is not a round number chosen here: `buildGarage`'s ramp slab is
   * [7, 0.3, 8]. The mouth is the same width as the ramp behind it, and the
   * kerbed islands, the booth, the pylon and the barrier all stand outside
   * it — the nearest of them, the west island, by 0.5 m. */
  assert.equal(+lane.width.toFixed(3), 7,
    `the lane pinches to ${lane.width.toFixed(3)} m between `
    + `${lane.westName} and ${lane.eastName}`);
  assert.equal(+lane.west.toFixed(2), -3.5);
  assert.equal(+lane.east.toFixed(2), 3.5);

  // And the same question of the colliders, which are authored separately.
  let cWest = -Infinity;
  let cEast = Infinity;
  for (const box of street.colliders) {
    if (box.max.z < -36.6 || box.min.z > -28) continue;
    if (box.min.y >= VEHICLE_HEIGHT) continue;
    if (box.max.x <= 0) cWest = Math.max(cWest, box.max.x);
    if (box.min.x >= 0) cEast = Math.min(cEast, box.min.x);
  }
  assert.equal(+(cEast - cWest).toFixed(3), 7,
    `the collider lane is ${(cEast - cWest).toFixed(3)} m, not 7.0`);
});

test('nothing new stands on the pavement, which is what keeps the gate clean', () => {
  const root = exteriorOf(streetPhase());
  /* The street ground, both 35 cm pavement slabs and both kerbs run to
   * z -36.0 and stop. A building face at z -35 puts its ground storey 0.9 m
   * into a pavement, which is a 35 cm interpenetration on the thin axis and
   * a geometry-gate finding for every panel. The rule that keeps this build
   * at zero findings is: cross z -36.0 only over the road. */
  const offenders = drawnMeshes(root)
    .map((mesh) => ({ name: mesh.name || '(anon)', box: worldBox(mesh) }))
    .filter(({ box }) => box.max.z > FACE_Z + 1e-6
      && (box.min.x < -ROAD_EDGE_X - 1e-6 || box.max.x > ROAD_EDGE_X + 1e-6))
    .map(({ name }) => name);
  assert.deepEqual(offenders, [],
    `these reach past the elevation over a pavement: ${offenders.join(', ')}`);
});

/* ------------------------------------------------------------------ */
/* The crosshair                                                       */
/* ------------------------------------------------------------------ */

test('the way in is an invisible proxy standing clear of where the player can be', () => {
  const street = streetPhase();
  const entry = street.interactables.garage;
  assert.equal(entry.name, 'garage-entry', 'the scene addresses the mouth by this name');
  assert.equal(entry.visible, false, 'the proxy must not be drawn — the mouth is');
  assert.equal(entry.castShadow, false);
  assert.equal(entry.receiveShadow, false);

  const box = worldBox(entry);
  assert.ok(box.max.z < STREET_CLAMP.minZ,
    `the clamp reaches z ${STREET_CLAMP.minZ} and the proxy starts at `
    + `${box.max.z.toFixed(3)} — a box a ray starts inside is a box the ray misses`);
  assert.ok(STREET_CLAMP.minZ - box.max.z < REACH,
    'the proxy is out of reach from the closest legal position');
});

test('the crosshair finds the mouth from anywhere in the entry lane', () => {
  const street = streetPhase();
  const entry = street.interactables.garage;
  const target = worldBox(entry).getCenter(new THREE.Vector3());

  const raycaster = new THREE.Raycaster();
  raycaster.far = REACH;

  let acquired = 0;
  let attempted = 0;
  const missed = [];
  for (let x = -3; x <= 3.0001; x += 0.5) {
    for (let z = STREET_CLAMP.minZ; z <= -32.6; z += 0.2) {
      for (const eye of [1.55, 1.66, 1.75]) {
        const origin = new THREE.Vector3(x, eye, z);
        if (origin.distanceTo(target) > REACH) continue;
        attempted += 1;
        raycaster.set(origin, target.clone().sub(origin).normalize());
        /* Against the WHOLE phase, not against the proxy: `main.js` gives
         * `InteractionSystem` the phase group as an occluder, and it takes
         * the first hit and breaks. Anything new standing in the mouth would
         * therefore silently kill the prompt. */
        const hits = raycaster.intersectObject(street.group, true)
          .filter((hit) => hit.object.isMesh);
        if (hits.length && hits[0].object === entry) acquired += 1;
        else missed.push([x.toFixed(1), z.toFixed(1), eye, hits[0]?.object.name ?? 'nothing']);
      }
    }
  }
  assert.ok(attempted > 200, `only ${attempted} viewpoints were in range`);
  assert.equal(acquired, attempted,
    `the mouth was first on the ray in ${acquired} of ${attempted} viewpoints; `
    + `first misses: ${JSON.stringify(missed.slice(0, 4))}`);
});

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

test('the exterior is one shared box, no shadows, and one real light', () => {
  const street = streetPhase();
  const root = exteriorOf(street);
  const meshes = drawnMeshes(root);
  assert.ok(meshes.length > 90, 'this is meant to be a built building');
  assert.ok(meshes.length < 200,
    `${meshes.length} meshes in a phase that also runs a firefight`);

  const geometries = new Set(meshes.map((mesh) => mesh.geometry.uuid));
  assert.equal(geometries.size, 1,
    `the exterior allocates ${geometries.size} geometries; src/heist/city.js `
    + 'settled this — one shared unit box, size in the scale');

  const casters = meshes.filter((mesh) => mesh.castShadow).map((mesh) => mesh.name);
  assert.deepEqual(casters, [],
    'the key light has one 1536 shadow map for the whole scene and a 31 m '
    + `building would eat it: ${casters.join(', ')}`);

  /* The street's twelve lamp posts are emissive heads with no lights behind
   * them. This adds exactly one real light, in the mouth, because the way in
   * is the one thing that has to pool light on the asphalt. */
  const lights = [];
  street.group.traverse((object) => { if (object.isLight) lights.push(object.name); });
  assert.deepEqual(lights, ['mercer-mouth-light']);
});

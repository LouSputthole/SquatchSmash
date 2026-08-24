/**
 * THE SPECIAL MEETING — the end of the road.
 *
 * SM-330: the car slows, turns off the track onto a flat spur of dirt, and
 * stops. Seff kills the engine. The headlights stay on for three or four
 * seconds, on nothing — just trunks, and dark between them — and then he turns
 * those off too.
 *
 * WHAT IS OUT THERE, AND IN WHAT ORDER THE PLAYER GETS IT
 *
 *   1. THE OTHER CARS. They come out of the dark as the Lincoln makes the last
 *      bend, which is why the spur is on the INSIDE of that bend: the beams
 *      sweep across four parked vehicles before the car has finished turning.
 *      Four is the number. One is a mistake; two is a meeting; four is
 *      everybody already being here, which is the fact that lands.
 *
 *   2. THE TRAIL. Not lit, not signed, not wide. It leaves the far side of the
 *      spur and bends out of sight inside twenty metres, and there is nothing
 *      at the end of it that can be seen from here.
 *
 *   3. THE THING THROUGH THE TREES. Orange, a long way off, and moving. It is
 *      the first evidence in the entire scene that this place has a purpose,
 *      and it arrives with no explanation whatsoever.
 *
 * Nothing here is signposted and nothing here is dressed to be understood.
 * Everything the player works out, he works out from four cars.
 */

import * as THREE from 'three';
import { makeCar, makeVehicleCollider } from '../../bing/vehicles.js';
import { CLEARING, heightAt, TRAIL } from './field.js';
import { softCardTexture } from './textures.js';

/**
 * Who is already here.
 *
 * Parked the way people park in a clearing in the dark: nose-in, roughly, at
 * whatever angle got them off the track. Not one of them is straight and no
 * two are parallel — a tidy row would read as a car park, and this is four men
 * arriving separately over half an hour.
 */
const PARKED = Object.freeze([
  Object.freeze({ id: 'specialmeeting.forest.parked-01', kind: 'suv', colour: 0x14171b, offset: [-8.5, -5.0], yaw: 0.44 }),
  Object.freeze({ id: 'specialmeeting.forest.parked-02', kind: 'sedan', colour: 0x1d1a1e, offset: [-7.0, 1.0], yaw: 0.12 }),
  Object.freeze({ id: 'specialmeeting.forest.parked-03', kind: 'lincoln', colour: 0x101216, offset: [-3.5, 6.5], yaw: -0.22 }),
  Object.freeze({ id: 'specialmeeting.forest.parked-04', kind: 'van', colour: 0x2b2a26, offset: [2.5, 8.0], yaw: -0.58, dented: true }),
]);

/**
 * Where the Lincoln itself ends up, so nothing is parked in it.
 *
 * The rail puts the car on the last knot of the road, which is inside the
 * spur — so the four above are laid out in an ARC on the far side of it, all
 * of them at least thirteen metres away and all of them across the beams as
 * the car makes the final bend. The first pass measured their offsets from
 * the middle of the spur instead and parked a van two metres off the
 * Lincoln's wing.
 */
const LINCOLN_PARKS_NEAR = Object.freeze({ x: 141.5, z: -110 });

/* ------------------------------------------------------------------ */
/* The trail                                                           */
/* ------------------------------------------------------------------ */

/**
 * Two metres of worn ground going into the trees.
 *
 * Built as a ribbon off the same polyline the tree scatter uses to keep the
 * canopy open (`TRAIL` in `field.js`), so the corridor and the path cannot
 * disagree — a path with a fir standing in it is the kind of thing that only
 * shows up when somebody walks it.
 */
function buildTrail(group, materials) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  materials.push(material);

  const ACROSS = 5;
  const STEP = 1.1;
  const rows = [];
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i];
    const b = TRAIL[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(length / STEP));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      rows.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        dx: (b.x - a.x) / length,
        dz: (b.z - a.z) / length,
      });
    }
  }
  const last = TRAIL[TRAIL.length - 1];
  const prev = TRAIL[TRAIL.length - 2];
  const lastLen = Math.hypot(last.x - prev.x, last.z - prev.z);
  rows.push({
    x: last.x, z: last.z, dx: (last.x - prev.x) / lastLen, dz: (last.z - prev.z) / lastLen,
  });

  const count = rows.length * ACROSS;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const colour = new THREE.Color();

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    // Left of travel, in the ground plane.
    const nx = -row.dz;
    const nz = row.dx;
    for (let c = 0; c < ACROSS; c++) {
      const t = (c / (ACROSS - 1)) * 2 - 1;
      const off = t * 1.35;
      const x = row.x + nx * off;
      const z = row.z + nz * off;
      const i = r * ACROSS + c;
      /* Worn a few centimetres into the duff in the middle and level with it
       * at the edges, which is what a path IS — there is no path here, only
       * ground that a lot of boots have been over. */
      const wear = (1 - Math.abs(t)) * 0.06;
      positions[i * 3] = x;
      positions[i * 3 + 1] = heightAt(x, z) - wear + 0.015;
      positions[i * 3 + 2] = z;
      colour.setHex(0x1d1811).multiplyScalar(0.72 + (1 - Math.abs(t)) * 0.5);
      colours[i * 3] = colour.r;
      colours[i * 3 + 1] = colour.g;
      colours[i * 3 + 2] = colour.b;
    }
  }

  const indices = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < ACROSS - 1; c++) {
      const a = r * ACROSS + c;
      const b = a + 1;
      const d = a + ACROSS;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'forest.trail';
  /* The trail is worn GROUND, not a thing lying on it: a ribbon of vertices
   * following the terrain a few centimetres proud of it so the duff reads
   * as beaten down. It holds things up and the trees the clearing was cut
   * around come straight up through its edges, which is why it is structural
   * and out of the overlap test rather than a hundred waivers against the
   * trunk batch. */
  mesh.userData.geometryGate = {
    structural: true,
    fixedSupportAnchor: true,
    overlap: false,
  };
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  group.add(mesh);
  return { mesh, geometry, rows };
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {THREE.Object3D} parent
 * @param {object} [options]
 * @param {THREE.Box3[]} [options.colliders] the walking player's world. The
 *        parked cars go in it; the trees around the spur are already in it
 *        from the terrain streamer.
 */
export function buildClearing(parent, { colliders = null } = {}) {
  const group = new THREE.Group();
  group.name = 'forest.clearing';
  parent.add(group);

  const materials = [];
  const wheelGeometries = [];
  const cars = [];

  for (const spec of PARKED) {
    const car = makeCar(spec.kind, spec.colour, { dented: !!spec.dented, spatialId: spec.id });
    const x = CLEARING.x + spec.offset[0];
    const z = CLEARING.z + spec.offset[1];
    /* Checked here rather than trusted: an offset nudged by a metre to make a
     * shot read is exactly how a parked van ends up inside the car the player
     * is sitting in, and that mistake is invisible until the very last second
     * of the drive. */
    const clearance = Math.hypot(x - LINCOLN_PARKS_NEAR.x, z - LINCOLN_PARKS_NEAR.z);
    if (clearance < 9) {
      throw new Error(
        `Special Meeting: parked ${spec.kind} is ${clearance.toFixed(1)}m from where the `
        + 'Lincoln stops — it would be inside it',
      );
    }
    car.group.position.set(x, heightAt(x, z), z);
    /* Nose roughly into the trees, plus whatever angle they came off the track
     * at. `makeCar` builds long on +X, so the yaw that points a car at the
     * treeline is measured from there. */
    car.group.rotation.y = -1.15 + spec.yaw;
    car.group.name = `forest.parked.${spec.kind}`;
    /* Set on the clearing floor at `heightAt(x, z)` two lines up. That floor
     * is the streamed heightfield, which the gate models as one box per 48 m
     * chunk, so it can never see a wheel resting on it and reports the car as
     * fifteen metres in the air over the road it came in on. See the trunk
     * note in ./foliage.js. */
    car.group.userData.geometryGate = { fixedSupportAnchor: true };
    /* Dark and cold. Nothing here has its lights on, nothing has anybody in
     * it, and the only reason the player can see them at all is that the
     * Lincoln's beams are still pointing this way for another three seconds. */
    for (const lamp of car.heads) lamp.material = car.paint;
    group.add(car.group);
    cars.push(car);
    if (car.group.children.some((child) => child.geometry?.type === 'CylinderGeometry')) {
      const wheel = car.group.children.find(
        (child) => child.geometry?.type === 'CylinderGeometry',
      );
      if (wheel) wheelGeometries.push(wheel.geometry);
    }
    if (colliders) colliders.push(makeVehicleCollider(car, 0.12));
  }

  const trail = buildTrail(group, materials);

  /* ---------------------------------------------------------------- */
  /* The thing through the trees                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Orange, a long way off, and moving.
   *
   * `fog: false`, which is the whole trick. The scene's fog is thick enough to
   * take a lit surface at eighty metres down to nothing, and it should — but a
   * FIRE is not a lit surface, it is a source, and a source at eighty metres
   * on a clear line is still a source. Letting the fog have it would delete
   * the only thing in the scene that suggests any of this has a purpose.
   *
   * Additive, small, and deliberately never resolved into anything. Nobody
   * looks at it. Nobody mentions it.
   */
  const glowMat = new THREE.MeshBasicMaterial({
    map: softCardTexture(),
    color: 0xff7a24,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  materials.push(glowMat);
  const glowGeo = new THREE.PlaneGeometry(5.5, 4.2);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.name = 'forest.distant-fire';
  /* An additive card hung two and a half metres up on a sightline. It is a
   * glow in the air, so nothing holds it up and nothing is meant to. */
  glow.userData.geometryGate = { fixedSupportAnchor: true, overlap: false };
  /* Up the trail and well past the end of it, on the sightline the corridor
   * opens. Two and a half metres up, because the trees between here and there
   * take the bottom of it. */
  glow.position.set(64, heightAt(64, -60) + 2.6, -60);
  glow.renderOrder = 6;
  group.add(glow);

  const state = { time: 0 };

  return {
    group,
    cars,
    trail,
    glow,
    /** Where the walk starts. SM-500. */
    trailhead: new THREE.Vector3(
      CLEARING.trailhead.x,
      heightAt(CLEARING.trailhead.x, CLEARING.trailhead.z),
      CLEARING.trailhead.z,
    ),
    /** The trail itself, so whatever walks it does not re-survey it. */
    path: TRAIL.map((node) => new THREE.Vector3(node.x, heightAt(node.x, node.z), node.z)),
    centre: new THREE.Vector3(CLEARING.x, heightAt(CLEARING.x, CLEARING.z), CLEARING.z),

    update(dt, camera = null) {
      state.time += dt;
      /* A fire's flicker is two frequencies and a slow drift, not a random
       * number per frame — random reads as a fault in the display. The drift
       * is the "moving" in the stage direction, and it is somebody walking in
       * front of it. */
      const flicker = 0.72
        + Math.sin(state.time * 2.1) * 0.13
        + Math.sin(state.time * 5.7 + 1.3) * 0.07;
      const walkBy = Math.max(0, Math.sin(state.time * 0.31)) ** 6;
      glowMat.opacity = 0.42 * flicker * (1 - walkBy * 0.75);
      /* Faced at the viewer, once anybody is close enough to see it. It is one
       * quad; billboarding it is four numbers a frame and the alternative is a
       * card that goes edge-on and disappears as the player walks the spur. */
      if (camera) glow.quaternion.copy(camera.quaternion);
    },

    dispose() {
      /* Only what this file made. The parked shells are `box()` meshes from
       * `src/world/build.js` sharing ONE unit geometry across the whole game,
       * and their paint comes from the shared `mat()` cache — disposing either
       * would empty every box in every scene. Their wheels are the exception:
       * `makeCar` mints one cylinder per car. */
      for (const geometry of wheelGeometries) geometry.dispose();
      trail.geometry.dispose();
      glowGeo.dispose();
      for (const material of materials) material.dispose();
      parent.remove(group);
    },
  };
}

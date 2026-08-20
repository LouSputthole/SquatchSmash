/**
 * INITIATION NIGHT — the woods, and the way through them.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THE PLAYER IS SUPPOSED TO FEEL WALKING IN
 *
 * That he is a long way from a road. The whole approach is one idea: the
 * ground underfoot is the only thing that knows where it is going. There is a
 * track, it is wet, it has been driven on, and on both sides of it there is
 * nothing but trunks going back until the fog eats them. No signs, no lights,
 * no landmark. The first thing in the entire level that is man-made and lit is
 * a pair of headlights pointing at some mud.
 *
 * Then, much later, the trail — which is narrower, unlit, and bends twice, so
 * the clearing is out of sight behind him before the porch light is in front
 * of him. There is about eight seconds of that walk where he can see neither.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS OWNS
 *
 * The ground plane, the forest floor, the track in, the trail up, and every
 * tree, fern, rock, stump and fallen log on the site. It owns the KEEP-OUTS
 * too, by asking site.js, so the trail cannot grow a fir in the middle of it
 * and the clearing cannot close over.
 *
 * IT REPLACES main.js's own forest. That scatter is 150 trees of
 * `Math.random()` at import time, with its own hand-written keep-outs for a
 * bonfire and a stage; run both and the site has two forests interleaved, half
 * of it different on every reload, and a geometry gate that can never scan the
 * same scene twice. See the integration note at the bottom of index.js.
 */

import * as THREE from 'three';
import { lambert } from '../../../game/src/world.js';

import {
  assembly, bakedTexture, between, casts, conePart, cylinderPart,
  namedGroup, part, pickOne, rng, speckle, structural,
} from './kit.js';
import { TRACK, TRACK_HALF_WIDTH, TRAIL, TRAIL_HALF_WIDTH, siteFits } from './site.js';

/** How far out the ground plane and the far treeline go. */
const GROUND_SIZE = 400;
const GROUND_THICKNESS = 0.4;
const TREELINE_RADIUS = 118;

const NEEDLE_GREENS = [0x1b3122, 0x203a27, 0x16291c, 0x24402b];
const BARK_COLOURS = [0x2b2016, 0x241a11, 0x33261a];
const DEADWOOD = 0x3a3026;

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

function forestFloorTexture() {
  return bakedTexture(512, (context, size) => {
    speckle(context, size, '#14221a', ['#101d15', '#182a1e', '#0d1811', '#1d3123', '#241f14'], 2800);
  }, { repeat: 12 });
}

function dirtTexture() {
  return bakedTexture(256, (context, size) => {
    speckle(context, size, '#2a2118', ['#1e170f', '#33291d', '#171109', '#3b3024'], 1400, { grain: [1, 5] });
  }, { repeat: 6 });
}

/**
 * The floor of the world.
 *
 * Structural, which is the gate's word for "things are allowed to stand on
 * this". Everything else on the site — every tree, every car, the cabin, the
 * mud — is float-checked against it, so if this is ever moved off y = 0 the
 * whole site reports as hovering, which is the correct and loud outcome.
 *
 * IT IS A SLAB, NOT A PLANE, and that is not a detail. A support has to sit
 * strictly BELOW the thing it holds up, and a zero-thickness plane at y = 0
 * has its own underside at y = 0 too. Every cone and cylinder in this file
 * whose world AABB dips a hundredth of a micron below zero — which is most of
 * them, because that is what a rotation matrix does to a bounding box — then
 * has no support at all and reports as FLOATING. Twenty-eight of them did.
 * Forty centimetres of dirt under the surface fixes the whole class.
 */
export function buildGroundSlab() {
  const geometry = new THREE.BoxGeometry(GROUND_SIZE, GROUND_THICKNESS, GROUND_SIZE);
  const mesh = part(
    geometry, new THREE.MeshLambertMaterial({ map: forestFloorTexture() }),
    0, -GROUND_THICKNESS / 2, 0, 'forest.ground.floor',
  );
  mesh.receiveShadow = true;
  return structural(mesh);
}

/**
 * A worn strip of ground along a polyline.
 *
 * Built as one mesh with vertex colours rather than as a row of quads, so a
 * track that bends does not show a seam at every bend, and so the whole
 * approach costs one draw call. `y` lifts it clear of the ground plane by
 * less than the gate's 4 cm float tolerance, which is what makes a surface
 * decal legal: any higher and it is a floating object, any lower and it
 * z-fights with the floor it is drawn on.
 */
function ribbon(name, path, halfWidth, y, random, { step = 1.2, tint = 0x2a2118, wear = 0.35 } = {}) {
  const positions = [];
  const colours = [];
  const indices = [];
  const base = new THREE.Color(tint);
  const rows = [];

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.round(length / step));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      rows.push({
        x: from.x + (to.x - from.x) * t,
        z: from.z + (to.z - from.z) * t,
        nx: -(to.z - from.z) / length,
        nz: (to.x - from.x) / length,
      });
    }
  }
  const last = path[path.length - 1];
  const previous = path[path.length - 2];
  const finalLength = Math.hypot(last.x - previous.x, last.z - previous.z);
  rows.push({
    x: last.x, z: last.z,
    nx: -(last.z - previous.z) / finalLength,
    nz: (last.x - previous.x) / finalLength,
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    /* The edge wanders. A path with two parallel sides is a pavement. */
    const leftWidth = halfWidth * between(random, 0.82, 1.18);
    const rightWidth = halfWidth * between(random, 0.82, 1.18);
    positions.push(
      row.x + row.nx * leftWidth, y, row.z + row.nz * leftWidth,
      row.x - row.nx * rightWidth, y, row.z - row.nz * rightWidth,
    );
    for (let side = 0; side < 2; side++) {
      const shade = base.clone().multiplyScalar(between(random, 1 - wear, 1 + wear));
      colours.push(shade.r, shade.g, shade.b);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = part(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }), 0, 0, 0, name);
  mesh.receiveShadow = true;
  return mesh;
}

/** Two tyre ruts down the track, with water standing in them. */
function buildRuts(random) {
  const group = assembly('track.ruts', 'initiation.track.ruts');
  const material = lambert(0x181209);
  for (const side of [-0.62, 0.62]) {
    for (let i = 0; i < TRACK.length - 1; i++) {
      const from = TRACK[i];
      const to = TRACK[i + 1];
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const segments = Math.max(1, Math.round(length / 5.5));
      for (let k = 0; k < segments; k++) {
        const t = (k + 0.5) / segments;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        const angle = Math.atan2(to.x - from.x, to.z - from.z);
        const rut = part(
          new THREE.BoxGeometry(0.34, 0.014, length / segments * between(random, 0.7, 0.95)),
          material, x + Math.cos(angle) * side, 0.028, z - Math.sin(angle) * side, 'track.rut',
        );
        rut.rotation.y = angle;
        group.add(rut);
      }
    }
  }
  return group;
}

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

/**
 * A fir.
 *
 * Four meshes: a trunk that reaches the ground, and three crowns. The crowns
 * carry `overlap: false` because a forest is a forest — canopies interlock,
 * that is what a canopy is, and the gate would otherwise report every pair of
 * neighbours as two objects inside each other. Trunks keep their overlap check
 * ON: two trunks in the same hole is a real fault and the scatter's spacing is
 * what prevents it.
 */
function buildFir(random, index) {
  const scale = between(random, 0.85, 1.5);
  const tree = assembly(`fir.${index}`, `initiation.fir.${index}`);
  const bark = pickOne(random, BARK_COLOURS);
  const needle = pickOne(random, NEEDLE_GREENS);
  const trunkHeight = 2.6 * scale;
  tree.add(casts(cylinderPart('fir.trunk', 0.16 * scale, 0.28 * scale, trunkHeight, 7, bark,
    [0, trunkHeight / 2, 0])));
  const tiers = 3;
  for (let tier = 0; tier < tiers; tier++) {
    const radius = (2.0 - tier * 0.52) * scale;
    const height = (2.9 - tier * 0.35) * scale;
    const crown = conePart(`fir.crown.${tier}`, radius, height, 8, needle,
      [between(random, -0.1, 0.1) * scale, (1.9 + tier * 1.15) * scale, between(random, -0.1, 0.1) * scale]);
    crown.userData.geometryGate = { overlap: false };
    if (tier === 0) casts(crown);
    tree.add(crown);
  }
  return { tree, scale, radius: 0.5 * scale };
}

/**
 * A bare hardwood, for the ones that are just black shapes.
 *
 * Every third or fourth tree, because a wood of nothing but conifers reads as
 * a Christmas-tree farm, and the branches are what make a silhouette against
 * headlights look like a wood at all.
 */
function buildHardwood(random, index) {
  const scale = between(random, 0.9, 1.45);
  const tree = assembly(`hardwood.${index}`, `initiation.hardwood.${index}`);
  const bark = pickOne(random, BARK_COLOURS);
  const trunkHeight = 5.2 * scale;
  tree.add(casts(cylinderPart('hardwood.trunk', 0.13 * scale, 0.24 * scale, trunkHeight, 6, bark,
    [0, trunkHeight / 2, 0])));
  const branches = 3 + Math.floor(random() * 3);
  for (let i = 0; i < branches; i++) {
    const angle = (i / branches) * Math.PI * 2 + between(random, -0.4, 0.4);
    const lift = between(random, 0.55, 0.86) * trunkHeight;
    const length = between(random, 1.1, 2.2) * scale;
    const branch = cylinderPart('hardwood.branch', 0.045 * scale, 0.09 * scale, length, 5, bark, [
      Math.sin(angle) * length * 0.38,
      lift + length * 0.24,
      Math.cos(angle) * length * 0.38,
    ]);
    branch.rotation.z = -Math.cos(angle) * 0.95;
    branch.rotation.x = Math.sin(angle) * 0.95;
    branch.userData.geometryGate = { overlap: false };
    tree.add(branch);
  }
  return { tree, scale, radius: 0.42 * scale };
}

/** Ferns and scrub: three blades, no collider, nothing walks into them. */
function buildFern(random, index) {
  const clump = assembly(`fern.${index}`, `initiation.fern.${index}`);
  const green = pickOne(random, NEEDLE_GREENS);
  for (let i = 0; i < 3; i++) {
    const height = between(random, 0.5, 0.95);
    const blade = conePart('fern.blade', between(random, 0.28, 0.5), height, 5, green, [
      between(random, -0.35, 0.35), height / 2, between(random, -0.35, 0.35),
    ]);
    blade.userData.geometryGate = { overlap: false };
    clump.add(blade);
  }
  return clump;
}

function buildStump(random, index) {
  const scale = between(random, 0.8, 1.3);
  const stump = assembly(`stump.${index}`, `initiation.stump.${index}`);
  const height = 0.55 * scale;
  stump.add(casts(cylinderPart('stump.body', 0.34 * scale, 0.44 * scale, height, 8, DEADWOOD,
    [0, height / 2, 0])));
  return stump;
}

function buildFallenLog(random, index) {
  const scale = between(random, 0.9, 1.5);
  const log = assembly(`deadfall.${index}`, `initiation.deadfall.${index}`);
  const length = 3.4 * scale;
  const radius = 0.26 * scale;
  /* Both ends the same width. A tapered cylinder laid on its side rests on
   * the WIDE end and hangs the narrow one, which put 5 cm of every fallen log
   * on this site underground. */
  const trunk = casts(cylinderPart('deadfall.trunk', radius, radius, length, 7, DEADWOOD,
    [0, radius, 0]));
  trunk.rotation.z = Math.PI / 2;
  log.add(trunk);
  const stub = cylinderPart('deadfall.stub', 0.06 * scale, 0.09 * scale, 0.8 * scale, 5, DEADWOOD,
    [length * 0.22, radius + 0.28 * scale, 0]);
  stub.rotation.x = between(random, -0.5, 0.5);
  stub.userData.geometryGate = { overlap: false };
  log.add(stub);
  return { log, radius, length };
}

/**
 * A boulder, bedded rather than buried.
 *
 * The obvious way to stop a rock looking dropped on the grass is to sink it a
 * third of the way in, and that is what the first pass did — and a rock whose
 * underside is 38 cm below the only surface on the site is a rock resting on
 * nothing, which is a FLOATING finding, correctly. So it sits ON the ground,
 * squashed flat enough to read as half-buried, with a collar of disturbed
 * earth around the base doing the job the burial was doing.
 */
function buildRock(random, index) {
  const size = between(random, 0.6, 1.5);
  const rock = assembly(`rock.${index}`, `initiation.rock.${index}`);
  const squash = between(random, 0.4, 0.52);
  const mesh = casts(part(
    new THREE.DodecahedronGeometry(size, 0), lambert(0x2e3238, { flatShading: true }),
    0, size * squash, 0, 'rock.body',
  ));
  mesh.scale.set(1, squash, between(random, 0.85, 1.2));
  mesh.rotation.y = random() * Math.PI;
  rock.add(mesh);
  const collar = part(
    new THREE.CylinderGeometry(size * 1.15, size * 1.25, 0.016, 9),
    lambert(0x22201a), 0, 0.014, 0, 'rock.collar',
  );
  rock.add(collar);
  return { rock, radius: size * 0.8 };
}

/* ------------------------------------------------------------------ */
/* The scatter                                                         */
/* ------------------------------------------------------------------ */

/**
 * Put `count` things down without any of them being in the way of each other,
 * the clearing, the track, the trail or the cabin.
 *
 * `placed` is shared across every pass, so ferns respect trunks and rocks
 * respect ferns. Trees are spaced on their TRUNK radius plus a metre, not on
 * their canopy: crowns are supposed to touch.
 */
function scatter(random, { count, minRadius, maxRadius, keepOutRadius, placed, tries = 40 }, make) {
  let made = 0;
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < tries; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(between(random, (minRadius / maxRadius) ** 2, 1)) * maxRadius;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      if (!siteFits(x, z, keepOutRadius)) continue;
      let clash = false;
      for (const other of placed) {
        if (Math.hypot(x - other.x, z - other.z) < other.radius + keepOutRadius + 0.9) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      const radius = make(x, z, random, made);
      placed.push({ x, z, radius: radius ?? keepOutRadius });
      made += 1;
      break;
    }
  }
  return made;
}

/**
 * Build the woods.
 *
 * Returns the group to add to the scene, plus the circular colliders the
 * scene's own movement code uses — `{ x, z, r }`, which is the shape
 * main.js's `colliders` array already holds.
 */
export function buildWoods({ seed = 0x1a17ed, trees = 148, ferns = 56, ground = true } = {}) {
  const random = rng(seed);
  const group = namedGroup('initiation.woods');
  const colliders = [];
  const placed = [];

  /* The ground is not part of the forest, it is part of the site — every
   * other module rests things on it. `ground: false` is for a caller that has
   * already built it; a site built without it reports as five things
   * hovering in a void, which is exactly what it would be. */
  if (ground) group.add(buildGroundSlab());

  /* The track in, then the trail up. The trail is narrower and paler: it is
   * walked, not driven, and nothing has ever churned it. */
  const trackSurface = ribbon('track.dirt.surface', TRACK, TRACK_HALF_WIDTH, 0.02, random, { tint: 0x2b2119 });
  trackSurface.material.map = dirtTexture();
  group.add(assembly('track', 'initiation.track', trackSurface));
  group.add(buildRuts(random));
  group.add(assembly('trail', 'initiation.trail',
    ribbon('trail.dirt.surface', TRAIL, TRAIL_HALF_WIDTH, 0.02, random, { tint: 0x2f2820, wear: 0.28, step: 0.9 })));

  /* Trees. Two in three are firs; the rest are bare and read as silhouettes. */
  scatter(random, { count: trees, minRadius: 9, maxRadius: 96, keepOutRadius: 1.1, placed }, (x, z, r, index) => {
    const { tree, radius } = index % 3 === 2 ? buildHardwood(r, index) : buildFir(r, index);
    tree.position.set(x, 0, z);
    tree.rotation.y = r() * Math.PI * 2;
    group.add(tree);
    colliders.push({ x, z, r: radius + 0.35 });
    return radius;
  });

  scatter(random, { count: ferns, minRadius: 7, maxRadius: 68, keepOutRadius: 0.6, placed }, (x, z, r, index) => {
    const clump = buildFern(r, index);
    clump.position.set(x, 0, z);
    clump.rotation.y = r() * Math.PI * 2;
    group.add(clump);
    return 0.5;
  });

  scatter(random, { count: 14, minRadius: 12, maxRadius: 78, keepOutRadius: 1.4, placed }, (x, z, r, index) => {
    const { rock, radius } = buildRock(r, index);
    rock.position.set(x, 0, z);
    group.add(rock);
    colliders.push({ x, z, r: radius });
    return radius;
  });

  scatter(random, { count: 9, minRadius: 14, maxRadius: 74, keepOutRadius: 2.0, placed }, (x, z, r, index) => {
    const { log, length } = buildFallenLog(r, index);
    log.position.set(x, 0, z);
    log.rotation.y = r() * Math.PI * 2;
    group.add(log);
    colliders.push({ x, z, r: length * 0.3 });
    return length * 0.5;
  });

  scatter(random, { count: 8, minRadius: 11, maxRadius: 70, keepOutRadius: 1.0, placed }, (x, z, r, index) => {
    const stump = buildStump(r, index);
    stump.position.set(x, 0, z);
    group.add(stump);
    colliders.push({ x, z, r: 0.5 });
    return 0.6;
  });

  /**
   * The far treeline.
   *
   * A ring of low-detail firs out past anywhere the player can walk, at a
   * distance the fog is already eating. It exists so the ground plane never
   * ends in mid-air on the horizon, and it is deliberately two meshes a tree —
   * nobody is ever close enough to count the branches.
   */
  const treeline = assembly('treeline', 'initiation.treeline');
  for (let i = 0; i < 84; i++) {
    const angle = (i / 84) * Math.PI * 2 + between(random, -0.02, 0.02);
    const distance = TREELINE_RADIUS + between(random, -14, 16);
    const scale = between(random, 1.3, 2.4);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const trunkHeight = 2.4 * scale;
    treeline.add(cylinderPart('treeline.trunk', 0.2 * scale, 0.32 * scale, trunkHeight, 5, 0x1a1409,
      [x, trunkHeight / 2, z]));
    const crown = conePart('treeline.crown', 2.1 * scale, 5.4 * scale, 6, 0x0f1c14,
      [x, 3.4 * scale, z]);
    crown.userData.geometryGate = { overlap: false };
    treeline.add(crown);
  }
  group.add(treeline);

  return { group, colliders, placed: placed.length };
}

/** Every stem, blade and boulder disposed of, for a scene teardown. */
export function disposeWoods(built) {
  built?.group?.traverse((object) => {
    if (object.isMesh) object.geometry?.dispose?.();
  });
}

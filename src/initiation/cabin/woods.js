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
  assembly, bakedTexture, between, namedGroup, part, pickOne, rng, speckle, structural,
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
/* Trees, and why they are instanced                                   */
/* ------------------------------------------------------------------ */

/**
 * WHY THIS FOREST IS ONE DOZEN DRAW CALLS AND NOT ELEVEN HUNDRED.
 *
 * The first pass built every tree as its own little group of four or five
 * meshes: 148 trees, 84 more on the horizon, ferns, and a thousand-odd meshes
 * on top of everything main.js already draws — with a bloom chain and shadow
 * maps on the same frame. That is the kind of cost that never shows up in a
 * screenshot and always shows up on somebody's laptop.
 *
 * It is also expensive in a second, less obvious way. Canopies INTERLOCK —
 * that is what a canopy is — so every crown has to tell the geometry gate not
 * to check it against its neighbours, and the gate ledgers every one of those
 * as a named suppression. Per-tree meshes meant 764 separate suppression
 * sources; batched, the identical forest is FOUR, one per batch, which is
 * exactly how the golf course, the airstrip and the Special Meeting's road
 * carry their own trees.
 *
 * Ownership survives the batching: `instanceAssemblyIds` gives every instance
 * an explicit assembly, so a fir's trunk and its three crowns are still ONE
 * object to the gate — they just live in two arrays instead of one group.
 */

const UNIT = {
  /** Height 1, radius 1 at the base, tapering to 0.55. Scale to taste. */
  trunk: new THREE.CylinderGeometry(0.55, 1, 1, 7),
  crown: new THREE.ConeGeometry(1, 1, 8),
  blade: new THREE.ConeGeometry(1, 1, 5),
  limb: new THREE.CylinderGeometry(0.5, 1, 1, 5),
  log: new THREE.CylinderGeometry(1, 1, 1, 7),
  rock: new THREE.DodecahedronGeometry(1, 0),
  collar: new THREE.CylinderGeometry(1, 1.1, 1, 9),
};

/**
 * The unit geometries are SHARED and must outlive any one build.
 *
 * A scene teardown that walks the graph disposing every geometry it finds
 * would take these with it, and the next build would hand the GPU seven
 * disposed buffers — a black forest, or nothing at all. The flag is what tells
 * `dispose()` to leave them alone.
 */
for (const geometry of Object.values(UNIT)) geometry.userData.shared = true;

const _dummy = new THREE.Object3D();
const _colour = new THREE.Color();

/**
 * One batch.
 *
 * `ids` is the per-instance assembly list — the thing that keeps a tree a
 * tree. `overlap: false` is set on batches whose instances are MEANT to
 * intersect their neighbours (crowns, branches, fronds) and never on trunks:
 * two trunks in one hole is a real fault and the scatter's spacing is what
 * prevents it.
 */
function batch(name, geometry, material, ids, { overlap = true, cast = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, ids.length);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = false;
  mesh.userData.geometryGate = overlap
    ? { instanceAssemblyIds: ids }
    : { instanceAssemblyIds: ids, overlap: false };
  return mesh;
}

function place(mesh, index, { x, y, z, sx, sy, sz, yaw = 0, pitch = 0, roll = 0 }) {
  _dummy.rotation.order = 'YXZ';
  _dummy.position.set(x, y, z);
  _dummy.rotation.set(pitch, yaw, roll);
  _dummy.scale.set(sx, sy, sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index, _dummy.matrix);
}

function tint(mesh, index, hex, scale = 1) {
  _colour.setHex(hex).multiplyScalar(scale);
  mesh.setColorAt(index, _colour);
}

function seal(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
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
      const radius = make(x, z, made);
      placed.push({ x, z, radius: radius ?? keepOutRadius });
      made += 1;
      break;
    }
  }
  return made;
}

/**
 * Where every tree, fern, rock, log and stump goes.
 *
 * Planned FIRST, as plain numbers, and built second. Separating the two is
 * what makes the batching possible at all — a batch has to know how many
 * instances it holds before it can be made — and it also means the layout can
 * be reasoned about, and tested, without a renderer anywhere near it.
 */
function planWoods(random, { trees, ferns }) {
  const placed = [];
  const plan = { firs: [], hardwoods: [], ferns: [], rocks: [], logs: [], stumps: [] };
  const colliders = [];

  scatter(random, { count: trees, minRadius: 9, maxRadius: 96, keepOutRadius: 1.1, placed }, (x, z, index) => {
    const scale = between(random, 0.85, 1.5);
    const yaw = random() * Math.PI * 2;
    if (index % 3 === 2) {
      const radius = 0.42 * scale;
      const limbs = [];
      const trunkHeight = 5.2 * scale;
      const count = 3 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        limbs.push({
          angle: (i / count) * Math.PI * 2 + between(random, -0.4, 0.4),
          lift: between(random, 0.55, 0.86) * trunkHeight,
          length: between(random, 1.1, 2.2) * scale,
        });
      }
      plan.hardwoods.push({ x, z, scale, yaw, trunkHeight, limbs, bark: pickOne(random, BARK_COLOURS) });
      colliders.push({ x, z, r: radius + 0.35 });
      return radius;
    }
    const radius = 0.5 * scale;
    plan.firs.push({
      x, z, scale, yaw,
      trunkHeight: 2.6 * scale,
      bark: pickOne(random, BARK_COLOURS),
      needle: pickOne(random, NEEDLE_GREENS),
      lean: [between(random, -0.1, 0.1), between(random, -0.1, 0.1)],
      shade: between(random, 0.8, 1.15),
    });
    colliders.push({ x, z, r: radius + 0.35 });
    return radius;
  });

  scatter(random, { count: ferns, minRadius: 7, maxRadius: 68, keepOutRadius: 0.6, placed }, (x, z) => {
    const blades = [];
    for (let i = 0; i < 3; i++) {
      blades.push({
        dx: between(random, -0.35, 0.35),
        dz: between(random, -0.35, 0.35),
        radius: between(random, 0.28, 0.5),
        height: between(random, 0.5, 0.95),
      });
    }
    plan.ferns.push({ x, z, blades, green: pickOne(random, NEEDLE_GREENS), yaw: random() * Math.PI });
    return 0.5;
  });

  scatter(random, { count: 14, minRadius: 12, maxRadius: 78, keepOutRadius: 1.4, placed }, (x, z) => {
    const size = between(random, 0.6, 1.5);
    const squash = between(random, 0.4, 0.52);
    plan.rocks.push({ x, z, size, squash, stretch: between(random, 0.85, 1.2), yaw: random() * Math.PI });
    colliders.push({ x, z, r: size * 0.8 });
    return size * 0.8;
  });

  scatter(random, { count: 9, minRadius: 14, maxRadius: 74, keepOutRadius: 2.0, placed }, (x, z) => {
    const scale = between(random, 0.9, 1.5);
    plan.logs.push({
      x, z, scale, yaw: random() * Math.PI * 2,
      length: 3.4 * scale, radius: 0.26 * scale,
      stub: { pitch: between(random, -0.5, 0.5), length: 0.8 * scale },
    });
    colliders.push({ x, z, r: 3.4 * scale * 0.3 });
    return 3.4 * scale * 0.5;
  });

  scatter(random, { count: 8, minRadius: 11, maxRadius: 70, keepOutRadius: 1.0, placed }, (x, z) => {
    const scale = between(random, 0.8, 1.3);
    plan.stumps.push({ x, z, scale, yaw: random() * Math.PI });
    colliders.push({ x, z, r: 0.5 });
    return 0.6;
  });

  return { plan, colliders, placed };
}

/** Build every batch the plan asks for and add them to `group`. */
function buildBatches(group, plan, random) {
  const bark = lambert(0xffffff);
  const foliage = lambert(0xffffff);
  const stone = lambert(0xffffff, { flatShading: true });

  /* ---- firs: one trunk and three crowns each ---- */
  if (plan.firs.length) {
    const trunkIds = plan.firs.map((_, index) => `initiation.fir.${index}`);
    const crownIds = plan.firs.flatMap((_, index) => [
      `initiation.fir.${index}`, `initiation.fir.${index}`, `initiation.fir.${index}`,
    ]);
    const trunks = batch('forest.fir.trunk', UNIT.trunk, bark, trunkIds, { cast: true });
    const crowns = batch('forest.fir.crown', UNIT.crown, foliage, crownIds, { overlap: false, cast: true });
    plan.firs.forEach((fir, index) => {
      place(trunks, index, {
        x: fir.x, y: fir.trunkHeight / 2, z: fir.z,
        sx: 0.28 * fir.scale, sy: fir.trunkHeight, sz: 0.28 * fir.scale, yaw: fir.yaw,
      });
      tint(trunks, index, fir.bark);
      for (let tier = 0; tier < 3; tier++) {
        const at = index * 3 + tier;
        place(crowns, at, {
          x: fir.x + fir.lean[0] * fir.scale,
          y: (1.9 + tier * 1.15) * fir.scale,
          z: fir.z + fir.lean[1] * fir.scale,
          sx: (2.0 - tier * 0.52) * fir.scale,
          sy: (2.9 - tier * 0.35) * fir.scale,
          sz: (2.0 - tier * 0.52) * fir.scale,
          yaw: fir.yaw,
        });
        tint(crowns, at, fir.needle, fir.shade * (1 - tier * 0.06));
      }
    });
    group.add(seal(trunks), seal(crowns));
  }

  /* ---- bare hardwoods: the silhouettes ---- */
  if (plan.hardwoods.length) {
    const trunkIds = plan.hardwoods.map((_, index) => `initiation.hardwood.${index}`);
    const limbIds = plan.hardwoods.flatMap((tree, index) => (
      tree.limbs.map(() => `initiation.hardwood.${index}`)
    ));
    const trunks = batch('forest.hardwood.trunk', UNIT.trunk, bark, trunkIds, { cast: true });
    const limbs = batch('forest.hardwood.limb', UNIT.limb, bark, limbIds, { overlap: false });
    let limbIndex = 0;
    plan.hardwoods.forEach((tree, index) => {
      place(trunks, index, {
        x: tree.x, y: tree.trunkHeight / 2, z: tree.z,
        sx: 0.24 * tree.scale, sy: tree.trunkHeight, sz: 0.24 * tree.scale, yaw: tree.yaw,
      });
      tint(trunks, index, tree.bark);
      for (const limb of tree.limbs) {
        place(limbs, limbIndex, {
          x: tree.x + Math.sin(limb.angle) * limb.length * 0.38,
          y: limb.lift + limb.length * 0.24,
          z: tree.z + Math.cos(limb.angle) * limb.length * 0.38,
          sx: 0.09 * tree.scale, sy: limb.length, sz: 0.09 * tree.scale,
          yaw: limb.angle, pitch: 0.95,
        });
        tint(limbs, limbIndex, tree.bark, 0.9);
        limbIndex += 1;
      }
    });
    group.add(seal(trunks), seal(limbs));
  }

  /* ---- ferns and scrub ---- */
  if (plan.ferns.length) {
    const ids = plan.ferns.flatMap((clump, index) => clump.blades.map(() => `initiation.fern.${index}`));
    const blades = batch('forest.fern.blade', UNIT.blade, foliage, ids, { overlap: false });
    let index = 0;
    for (const clump of plan.ferns) {
      for (const blade of clump.blades) {
        place(blades, index, {
          x: clump.x + blade.dx, y: blade.height / 2, z: clump.z + blade.dz,
          sx: blade.radius, sy: blade.height, sz: blade.radius, yaw: clump.yaw,
        });
        tint(blades, index, clump.green, 0.95);
        index += 1;
      }
    }
    group.add(seal(blades));
  }

  /* ---- boulders, bedded rather than buried ----
   * A rock sunk a third of the way into the ground is a rock resting on
   * nothing, which the gate calls floating and is right about. So it sits ON
   * the surface, squashed flat, with a collar of disturbed earth doing the job
   * the burial was doing. */
  if (plan.rocks.length) {
    const ids = plan.rocks.map((_, index) => `initiation.rock.${index}`);
    const bodies = batch('forest.rock.body', UNIT.rock, stone, ids, { cast: true });
    const collars = batch('forest.rock.collar', UNIT.collar, lambert(0xffffff), [...ids]);
    plan.rocks.forEach((rock, index) => {
      place(bodies, index, {
        x: rock.x, y: rock.size * rock.squash, z: rock.z,
        sx: rock.size, sy: rock.size * rock.squash, sz: rock.size * rock.stretch, yaw: rock.yaw,
      });
      tint(bodies, index, 0x2e3238, between(random, 0.8, 1.2));
      place(collars, index, {
        x: rock.x, y: 0.008, z: rock.z,
        sx: rock.size * 1.15, sy: 0.016, sz: rock.size * 1.15 * rock.stretch,
      });
      tint(collars, index, 0x22201a);
    });
    group.add(seal(bodies), seal(collars));
  }

  /* ---- deadfall ---- */
  if (plan.logs.length) {
    const ids = plan.logs.map((_, index) => `initiation.deadfall.${index}`);
    const trunks = batch('forest.deadfall.trunk', UNIT.log, bark, ids, { cast: true });
    const stubs = batch('forest.deadfall.stub', UNIT.log, bark, [...ids], { overlap: false });
    plan.logs.forEach((log, index) => {
      /* Laid on its side: the unit cylinder stands up the Y axis, so it is
       * rolled a quarter turn and then swung to the yaw it fell at. */
      place(trunks, index, {
        x: log.x, y: log.radius, z: log.z,
        sx: log.radius, sy: log.length, sz: log.radius,
        yaw: log.yaw, roll: Math.PI / 2,
      });
      tint(trunks, index, DEADWOOD);
      place(stubs, index, {
        x: log.x + Math.sin(log.yaw) * log.length * 0.22,
        y: log.radius + 0.28 * log.scale,
        z: log.z + Math.cos(log.yaw) * log.length * 0.22,
        sx: 0.09 * log.scale, sy: log.stub.length, sz: 0.09 * log.scale,
        yaw: log.yaw, pitch: log.stub.pitch,
      });
      tint(stubs, index, DEADWOOD, 0.9);
    });
    group.add(seal(trunks), seal(stubs));
  }

  /* ---- stumps ---- */
  if (plan.stumps.length) {
    const ids = plan.stumps.map((_, index) => `initiation.stump.${index}`);
    const stumps = batch('forest.stump', UNIT.trunk, bark, ids, { cast: true });
    plan.stumps.forEach((stump, index) => {
      place(stumps, index, {
        x: stump.x, y: 0.275 * stump.scale, z: stump.z,
        sx: 0.44 * stump.scale, sy: 0.55 * stump.scale, sz: 0.44 * stump.scale, yaw: stump.yaw,
      });
      tint(stumps, index, DEADWOOD, 0.85);
    });
    group.add(seal(stumps));
  }
}

/**
 * The far treeline.
 *
 * A ring of low-detail firs out past anywhere the player can walk, at a
 * distance the fog is already eating. It exists so the ground never ends in
 * mid-air on the horizon, and it is two batches for the whole ring — nobody is
 * ever close enough to count the branches.
 */
function buildTreeline(group, random) {
  const count = 84;
  const trunkIds = [];
  const crownIds = [];
  for (let i = 0; i < count; i++) {
    trunkIds.push(`initiation.treeline.${i}`);
    crownIds.push(`initiation.treeline.${i}`);
  }
  const trunks = batch('treeline.trunk', UNIT.trunk, lambert(0xffffff), trunkIds);
  const crowns = batch('treeline.crown', UNIT.crown, lambert(0xffffff), crownIds, { overlap: false });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + between(random, -0.02, 0.02);
    const distance = TREELINE_RADIUS + between(random, -14, 16);
    const scale = between(random, 1.3, 2.4);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    place(trunks, i, {
      x, y: 1.2 * scale, z, sx: 0.32 * scale, sy: 2.4 * scale, sz: 0.32 * scale, yaw: angle,
    });
    tint(trunks, i, 0x1a1409);
    place(crowns, i, {
      x, y: 3.4 * scale, z, sx: 2.1 * scale, sy: 5.4 * scale, sz: 2.1 * scale, yaw: angle,
    });
    tint(crowns, i, 0x0f1c14);
  }
  group.add(seal(trunks), seal(crowns));
}

/* ------------------------------------------------------------------ */
/* The woods                                                           */
/* ------------------------------------------------------------------ */

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

  const { plan, colliders, placed } = planWoods(random, { trees, ferns });
  buildBatches(group, plan, random);
  buildTreeline(group, random);

  return { group, colliders, plan, placed: placed.length };
}

/** Every stem, blade and boulder disposed of, for a scene teardown. */
export function disposeWoods(built) {
  built?.group?.traverse((object) => {
    if (object.isMesh && object.geometry?.userData?.shared !== true) object.geometry?.dispose?.();
  });
}

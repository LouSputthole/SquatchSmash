/**
 * THE SPECIAL MEETING — what grows, what fell over, and what is lying in it.
 *
 * Two halves. The top of the file decides WHERE things are, in plain numbers,
 * deterministically, with no THREE anywhere near it. The bottom turns a list
 * of positions into a handful of `InstancedMesh`es. Keeping them apart is what
 * lets a test count the trees in a chunk without a renderer, and what lets the
 * streamer throw the meshes away and rebuild them from the same seed.
 *
 * HOW IT IS SCATTERED, AND WHY NOT THE WAY GOLF DOES IT
 *
 * Golf's `buildTrees` picks a random point in a band, tests it against every
 * tree already accepted, and tries again up to eighty times — then throws if
 * it could not place the lot. That is O(n²) with a hard failure mode, and it
 * is fine for four hundred trees in a treeline. This forest wants two hundred
 * per chunk with trunks a metre apart, which is exactly the regime where that
 * loop stops terminating.
 *
 * So: a JITTERED GRID. One candidate per cell, offset inside it, accepted with
 * a probability equal to the local density. That is a Poisson-disc scatter for
 * free — the grid guarantees the spacing, the jitter destroys the grid, and
 * the acceptance probability carries the density field. It is O(cells), it
 * cannot fail to terminate, and it is exactly reproducible from the chunk's
 * own coordinates, which is what makes a streamed chunk that comes back the
 * same chunk.
 *
 * WHAT IT LOOKS LIKE AT NIGHT
 *
 * Almost none of the crown is ever lit. Headlights are a metre off the ground
 * pointing along a road, so what the player sees for two minutes is TRUNKS —
 * hundreds of vertical lines going past at nine metres a second — with the
 * canopy above the beam as a black lid. That is why the trunks carry the
 * detail and the variation here, and why there are birches in the mix at all:
 * a pale trunk in a headlight beam is the brightest thing in the scene.
 */

import * as THREE from 'three';
import {
  clamp01, clearGroundAt, heightAt, hollowAt, landSlopeAt, roadFrame,
  surfaceAt, SURFACE, treeDensityAt, undergrowthAt,
} from './field.js';
import { roadLength } from './road.js';
import { frondTexture } from './textures.js';

/* ------------------------------------------------------------------ */
/* Where things are                                                    */
/* ------------------------------------------------------------------ */

/** Densest the forest ever gets, per square metre. Sets the scatter grid. */
export const PEAK_DENSITY = 0.105;
/** Cell size that can just hold the peak density at one tree per cell. */
const TREE_CELL = 1 / Math.sqrt(PEAK_DENSITY);      // ≈ 3.09 m
/** How far inside its cell a tree may be pushed. Below 0.5, or it is a grid. */
const TREE_JITTER = 0.36;

/* One deterministic value per (cell, salt). Chunks are built and thrown away
 * and built again as the car drives; a chunk that came back different would be
 * a forest that rearranged itself behind you. */
function cellHash(ix, iz, salt) {
  let h = Math.imul(ix + 0x9e37, 0x85ebca6b) ^ Math.imul(iz - 0x1f83, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d) ^ Math.imul(salt + 1, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * The height to STAND something at, which is not quite the ground height.
 *
 * Trees are placed on `heightAt`; the ground beside them is drawn by a mesh on
 * a three-metre grid, and on a steep bank the chord between two of its
 * vertices sits below the true surface by a few tens of centimetres. A tree at
 * its true height on that bank therefore floats — measured at forty-two
 * centimetres on the steepest ground in the scene, which is exactly the sort
 * of thing a headlight finds.
 *
 * So anything standing on the ground is bedded in by an amount that follows
 * the local steepness. It is an approximation of the mesh's own error rather
 * than a computation of it — the exact answer needs the chunk's resolution,
 * which the scatter deliberately does not know — but it is the right shape and
 * it costs one lookup. A trunk sunk twenty centimetres into a bank reads as a
 * tree; one hanging twenty centimetres over it reads as a bug.
 */
function seatedHeight(x, z, frame) {
  return heightAt(x, z, frame) - Math.min(2, landSlopeAt(x, z)) * 0.22;
}

/**
 * Ground solid enough to stand something on.
 *
 * The clearing's rim drops two metres over five and the terrain mesh nearest
 * the car is on a three-metre grid, so the drawn ground on that rim can be
 * three quarters of a metre below the true surface. Anything placed there at
 * its true height hangs in the air — which is how a fallen log ended up
 * levitating over the edge of the car park where four men are standing.
 *
 * The density field already fades over the rim; this is the hard edge under
 * it, and it applies to everything that stands on the ground rather than only
 * to the trees.
 */
function canStandAt(x, z) {
  return clearGroundAt(x, z) > 0.85;
}

/** Three trees and a dead one. Which grows where is the drive's progression. */
export const TREE_KINDS = Object.freeze(['fir', 'pine', 'birch', 'dead']);

function pickKind(roll, progress) {
  /* Out by the town it is scrubby birch and second growth. By the deep woods
   * it is nearly all conifer, which is what closes the canopy over the track
   * and takes the sky away. */
  const fir = 0.24 + 0.46 * progress;
  const pine = fir + 0.20 + 0.06 * progress;
  const birch = pine + 0.30 * (1 - progress) + 0.04;
  if (roll < fir) return 'fir';
  if (roll < pine) return 'pine';
  if (roll < birch) return 'birch';
  return 'dead';
}

/**
 * Everything standing, lying or sticking out of the ground in one chunk.
 *
 * @param {object} bounds `{ minX, minZ, size }` of the chunk.
 * @returns {{trees: object[], rocks: object[], logs: object[], stumps: object[]}}
 */
export function scatterChunk({ minX, minZ, size }) {
  const trees = [];
  const rocks = [];
  const logs = [];
  const stumps = [];

  /* --- trees --- */
  const i0 = Math.floor(minX / TREE_CELL);
  const i1 = Math.ceil((minX + size) / TREE_CELL);
  const j0 = Math.floor(minZ / TREE_CELL);
  const j1 = Math.ceil((minZ + size) / TREE_CELL);
  /* Accepted trees keyed by cell, so the overlap test is eight lookups rather
   * than a scan of everything placed so far. */
  const placed = new Map();
  for (let ix = i0; ix < i1; ix++) {
    for (let iz = j0; iz < j1; iz++) {
      const rx = cellHash(ix, iz, 1);
      const rz = cellHash(ix, iz, 2);
      const x = (ix + 0.5 + (rx - 0.5) * 2 * TREE_JITTER) * TREE_CELL;
      const z = (iz + 0.5 + (rz - 0.5) * 2 * TREE_JITTER) * TREE_CELL;
      if (x < minX || x >= minX + size || z < minZ || z >= minZ + size) continue;

      const frame = roadFrame(x, z);
      const density = treeDensityAt(x, z, frame);
      if (density <= 0 || !canStandAt(x, z)) continue;
      if (cellHash(ix, iz, 3) > density / PEAK_DENSITY) continue;

      const progress = clamp01(frame.s / roadLength());
      const kind = pickKind(cellHash(ix, iz, 4), progress);
      const grade = cellHash(ix, iz, 5);
      /* Big trees near the road on the last stretch: the ones the beam picks
       * out have to be worth picking out. */
      const scale = 0.72 + grade * 0.85 + progress * 0.28;
      const radius = trunkRadius(kind, scale);

      // Trunk-to-trunk clearance, against the eight cells around this one.
      let clash = false;
      for (let ox = -1; ox <= 1 && !clash; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          if (!ox && !oz) continue;
          const other = placed.get(`${ix + ox},${iz + oz}`);
          if (!other) continue;
          if (Math.hypot(other.x - x, other.z - z) < radius + other.radius + 0.22) {
            clash = true;
            break;
          }
        }
      }
      if (clash) continue;

      const tree = {
        x,
        z,
        y: seatedHeight(x, z, frame),
        kind,
        scale,
        radius,
        /* A lean, and more of one on the steep ground and in the wet. Nothing
         * in a real wood is plumb and a forest of verticals looks planted. */
        lean: (cellHash(ix, iz, 6) - 0.5) * (0.06 + landSlopeAt(x, z) * 0.09 + hollowAt(x, z) * 0.05),
        leanYaw: cellHash(ix, iz, 7) * Math.PI * 2,
        spin: cellHash(ix, iz, 8) * Math.PI * 2,
        tint: cellHash(ix, iz, 9),
      };
      trees.push(tree);
      placed.set(`${ix},${iz}`, tree);
    }
  }

  /* --- rocks: on the steep ground, in the cut banks, and in the beds of the
   * hollows where water has moved them. --- */
  const ROCK_CELL = 5.4;
  for (let ix = Math.floor(minX / ROCK_CELL); ix < Math.ceil((minX + size) / ROCK_CELL); ix++) {
    for (let iz = Math.floor(minZ / ROCK_CELL); iz < Math.ceil((minZ + size) / ROCK_CELL); iz++) {
      const x = (ix + 0.15 + cellHash(ix, iz, 11) * 0.7) * ROCK_CELL;
      const z = (iz + 0.15 + cellHash(ix, iz, 12) * 0.7) * ROCK_CELL;
      if (x < minX || x >= minX + size || z < minZ || z >= minZ + size) continue;
      const frame = roadFrame(x, z);
      // Not on the road, and not in the mud beside it where a wheel would find it.
      if (frame.distance < frame.halfWidth * 2.1 || !canStandAt(x, z)) continue;
      const surface = surfaceAt(x, z, frame);
      const chance = (surface === SURFACE.ROCK ? 0.72
        : landSlopeAt(x, z) > 0.4 ? 0.24
          : hollowAt(x, z) > 0.6 ? 0.16 : 0.055)
        /* Off the spur and off the trail, same as everything else that stands
         * on the ground — and faded rather than cut, so the last rock before
         * the clearing is not a line of them. */
        * clearGroundAt(x, z);
      if (cellHash(ix, iz, 13) > chance) continue;
      const grade = cellHash(ix, iz, 14);
      rocks.push({
        x,
        z,
        y: seatedHeight(x, z, frame),
        /* Boulders are rare and worth having: most of these are a foot across
         * and every so often one is the size of the car. */
        size: 0.24 + grade * grade * grade * 2.4,
        squash: 0.55 + cellHash(ix, iz, 15) * 0.5,
        spinX: cellHash(ix, iz, 16) * Math.PI,
        spinY: cellHash(ix, iz, 17) * Math.PI * 2,
        tint: cellHash(ix, iz, 18),
      });
    }
  }

  /* --- deadfall: whole trunks down across the slope, and the stumps of the
   * ones that were taken out rather than blown over. --- */
  const LOG_CELL = 13;
  for (let ix = Math.floor(minX / LOG_CELL); ix < Math.ceil((minX + size) / LOG_CELL); ix++) {
    for (let iz = Math.floor(minZ / LOG_CELL); iz < Math.ceil((minZ + size) / LOG_CELL); iz++) {
      const x = (ix + 0.2 + cellHash(ix, iz, 21) * 0.6) * LOG_CELL;
      const z = (iz + 0.2 + cellHash(ix, iz, 22) * 0.6) * LOG_CELL;
      if (x < minX || x >= minX + size || z < minZ || z >= minZ + size) continue;
      const frame = roadFrame(x, z);
      if (treeDensityAt(x, z, frame) <= 0 || !canStandAt(x, z)) continue;
      const progress = clamp01(frame.s / roadLength());

      if (cellHash(ix, iz, 23) < 0.30 + progress * 0.34) {
        const yaw = cellHash(ix, iz, 24) * Math.PI * 2;
        const length = 3.6 + cellHash(ix, iz, 25) * 5.4;
        const radius = 0.17 + cellHash(ix, iz, 26) * 0.20;
        /* Rest it on the ground at both ends and let the middle be wherever
         * that puts it. A log lying flat on a slope is the giveaway that the
         * ground under it was never consulted. */
        const ax = x - Math.sin(yaw) * length * 0.5;
        const az = z - Math.cos(yaw) * length * 0.5;
        const bx = x + Math.sin(yaw) * length * 0.5;
        const bz = z + Math.cos(yaw) * length * 0.5;
        const ay = seatedHeight(ax, az, roadFrame(ax, az)) + radius;
        const by = seatedHeight(bx, bz, roadFrame(bx, bz)) + radius;
        logs.push({
          x, z, yaw, length, radius,
          y: (ay + by) * 0.5,
          pitch: Math.atan2(by - ay, length),
          tint: cellHash(ix, iz, 27),
        });
      }
      if (cellHash(ix, iz, 28) < 0.16 + progress * 0.12) {
        const sx = x + 4.2;
        const sz = z - 3.1;
        if (sx >= minX && sx < minX + size && sz >= minZ && sz < minZ + size
          && treeDensityAt(sx, sz) > 0 && canStandAt(sx, sz)) {
          stumps.push({
            x: sx,
            z: sz,
            y: seatedHeight(sx, sz, roadFrame(sx, sz)),
            radius: 0.26 + cellHash(ix, iz, 29) * 0.30,
            height: 0.32 + cellHash(ix, iz, 30) * 0.55,
            spin: cellHash(ix, iz, 31) * Math.PI * 2,
          });
        }
      }
    }
  }

  return { trees, rocks, logs, stumps };
}

/** Trunk radius at the base, by kind and scale. Shared by scatter and mesher. */
export function trunkRadius(kind, scale) {
  const base = kind === 'fir' ? 0.22 : kind === 'pine' ? 0.25 : kind === 'birch' ? 0.15 : 0.20;
  return base * scale;
}

/** How tall a trunk stands, by kind and scale. */
export function trunkHeight(kind, scale) {
  const base = kind === 'fir' ? 9.5 : kind === 'pine' ? 12.5 : kind === 'birch' ? 8.0 : 7.0;
  return base * scale;
}

/* ------------------------------------------------------------------ */
/* What things are made of                                             */
/* ------------------------------------------------------------------ */

/* Lambert, not Standard, and it is not a shortcut.
 *
 * There are three real lights in this forest and two of them are headlamps.
 * A physical BRDF buys a specular response nothing here can show — wet bark at
 * forty lux returns almost nothing — and costs a full PBR shader on every one
 * of the two thousand instances in the near field. `src/heist/city.js` settled
 * the same argument for the same reason and its note is the precedent. */
function lambert(colour, extra = {}) {
  return new THREE.MeshLambertMaterial({ color: colour, ...extra });
}

/* One unit trunk and one unit crown, scaled per instance. Seven sides: a
 * trunk seen for a fifth of a second in a moving beam does not need twelve,
 * and this is multiplied by every tree in the near field.
 *
 * Built on demand and rebuildable. They are shared by every chunk in the
 * forest, so a chunk teardown must never dispose them — but the SCENE going
 * away must, and a scene can be entered twice in one page. A module-level
 * `const` disposed at teardown is a forest that comes back blank the second
 * time, which is the shared-material trap in `src/world/build.js` wearing a
 * different hat. */
let UNITS = null;
function units() {
  if (UNITS) return UNITS;
  const trunk = new THREE.CylinderGeometry(0.74, 1, 1, 7, 1, true);
  trunk.translate(0, 0.5, 0);
  const crown = new THREE.ConeGeometry(1, 1, 7);
  crown.translate(0, 0.5, 0);
  const stump = new THREE.CylinderGeometry(0.82, 1, 1, 7);
  stump.translate(0, 0.5, 0);
  UNITS = Object.freeze({
    trunk,
    crown,
    stump,
    rock: new THREE.IcosahedronGeometry(1, 0),
    log: new THREE.CylinderGeometry(0.9, 1, 1, 6),
  });
  return UNITS;
}

/** Bark, by kind. Birch is the one that matters: it is what the beam catches. */
const BARK = Object.freeze({
  fir: 0x2a2119,
  pine: 0x3a2c1e,
  birch: 0x8e8a7c,
  dead: 0x4a4237,
});
const NEEDLE = Object.freeze([0x16220f, 0x1b2a13, 0x121d0d, 0x203218]);
const LEAF = Object.freeze([0x242e14, 0x2c3618, 0x1d2711]);

const _dummy = new THREE.Object3D();
const _colour = new THREE.Color();

function instanced(geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = true;
  mesh.receiveShadow = false;
  /* The instances never move. Saying so takes the whole batch out of the
   * per-frame matrix update the renderer would otherwise do on every one. */
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/**
 * Hand a batch its bounding sphere instead of making it work one out.
 *
 * `InstancedMesh.computeBoundingSphere()` walks every instance, and measured
 * at a hundred and fifty trees it is one and a quarter MILLISECONDS. Five
 * batches a chunk and it was the entire cost of dressing one — seven
 * milliseconds of a sixteen-millisecond frame, spent deriving a number that is
 * already known: the chunk is a forty-eight-metre square and nothing in it is
 * taller than a tree.
 *
 * A conservative sphere culls very slightly less, which for one chunk of a
 * forest is nothing, and it is O(1).
 */
function boundBatch(mesh, bounds) {
  if (!bounds) {
    mesh.computeBoundingSphere();
    return mesh;
  }
  const half = bounds.size / 2;
  mesh.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(bounds.minX + half, bounds.midY + 12, bounds.minZ + half),
    Math.hypot(half, half) + 30,
  );
  return mesh;
}

/**
 * Turn one chunk's scatter into meshes.
 *
 * @param {object} scatter the result of `scatterChunk`.
 * @param {object} options
 * @param {'near'|'far'} [options.detail] `far` builds one crown tier instead
 *        of three. The chunk the car is in is `near`; everything else is not.
 * @param {boolean} options.shadows whether trunks cast into the headlight map.
 *        Only the near ring does: a shadow map that has to hold the whole
 *        streamed radius has no resolution left where the beam actually is.
 * @param {THREE.Box3[]} [options.colliders] filled with trunk, boulder and log
 *        boxes for the walk at the far end. Omitted during the drive, when
 *        nothing walks and the array would just be churn.
 * @returns {{group: THREE.Group, materials: THREE.Material[], trees: number}}
 */
export function buildFoliage(
  scatter,
  { shadows = false, colliders = null, bounds = null, detail = 'near' } = {},
) {
  const UNIT = units();
  const group = new THREE.Group();
  group.name = 'forest.foliage';
  const materials = [];

  const add = (mesh) => {
    group.add(mesh);
    if (!materials.includes(mesh.material)) materials.push(mesh.material);
    return mesh;
  };

  const { trees, rocks, logs, stumps } = scatter;

  if (trees.length) {
    /* ---- trunks: one batch for every kind, tinted per instance ----
     * Four batches (one per bark colour) would be four draw calls and four
     * shadow draws for what is one shape. `setColorAt` does it in one. */
    const trunks = instanced(UNIT.trunk, lambert(0xffffff), trees.length, 'forest.trunks');
    trunks.castShadow = shadows;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const radius = t.radius;
      const height = trunkHeight(t.kind, t.scale);
      _dummy.position.set(t.x, t.y, t.z);
      _dummy.rotation.set(0, 0, 0);
      /* Lean, applied as a tilt about an axis in the ground plane. Rotating
       * about Y first and then X leans it in a chosen compass direction
       * instead of always toward +X. */
      _dummy.rotation.order = 'YXZ';
      _dummy.rotation.y = t.leanYaw;
      _dummy.rotation.x = t.lean;
      _dummy.scale.set(radius, height, radius);
      _dummy.updateMatrix();
      trunks.setMatrixAt(i, _dummy.matrix);
      const bark = BARK[t.kind];
      _colour.setHex(bark);
      // A little value spread so a stand of the same species is not one wall.
      _colour.multiplyScalar(0.78 + t.tint * 0.44);
      trunks.setColorAt(i, _colour);
    }
    trunks.instanceMatrix.needsUpdate = true;
    if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
    boundBatch(trunks, bounds);
    /* The gate identifies an instanced batch by its own tag rather than by
     * guessing from geometry parameters. Trunks are solid and audited; the
     * crowns below are a porous silhouette that legitimately interpenetrates
     * and is excluded from the overlap test, the same exemption the
     * graveyard's pines carry. */
    /* `instanceAssemblyPrefix`, not `assemblyPrefix`. The gate validates its
     * own metadata keys and rejects an unknown one outright — a typo here
     * takes the whole scene's collection down with
     * "userData.geometryGate has unknown key(s)", which is a scene that
     * cannot be checked at all rather than a scene that fails a check. */
    trunks.userData.geometryGate = { instanceAssemblyPrefix: 'specialmeeting-forest-tree' };
    add(trunks);

    /* ---- crowns ----
     * Conifers get three tiers, birch one broad one, and the dead get nothing,
     * which is what makes them read as dead from a hundred metres.
     * Everything is a cone; only the proportions change.
     *
     * AND THIS IS WHERE THE LEVEL OF DETAIL IS. The chunk the car is actually
     * in gets all three tiers; the eight around it get one, because a conifer
     * at sixty metres through this fog is a dark shape and a dark shape is one
     * cone. It is worth about two draw calls and a millisecond and a half per
     * chunk, which is the difference between the streamer dropping a frame
     * when it crosses a chunk line and not. */
    const tiers = detail === 'near' ? 3 : 1;
    const crowned = trees.filter((t) => t.kind !== 'dead');
    for (let tier = 0; tier < tiers; tier++) {
      const list = crowned.filter((t) => (t.kind === 'birch' ? tier === 0 : true));
      if (!list.length) continue;
      const crowns = instanced(
        UNIT.crown,
        lambert(0xffffff),
        list.length,
        `forest.crowns.${tier + 1}`,
      );
      // Never: a canopy shadow map is a lace curtain and costs the same as a wall.
      crowns.castShadow = false;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const height = trunkHeight(t.kind, t.scale);
        const broad = t.kind === 'birch';
        /* With one tier standing in for three, it has to cover what the three
         * did: wider at the bottom and tall enough to reach where the top one
         * finished, or the far chunks read as a shorter species than the near
         * ones and the treeline steps down at the chunk line. */
        const lone = tiers === 1 && !broad;
        const spread = (broad ? 2.6 : lone ? 2.3 : 1.9 - tier * 0.42)
          * t.scale * (0.85 + t.tint * 0.3);
        const tall = (broad ? 4.0 : lone ? 7.2 : 4.4 - tier * 0.5) * t.scale;
        /* Crowns start well up the trunk. A conifer skirted to the ground
         * would hide the one thing the headlights are for. */
        const base = height * (broad ? 0.52 : lone ? 0.36 : 0.34 + tier * 0.21);
        _dummy.rotation.order = 'YXZ';
        _dummy.rotation.y = t.leanYaw;
        _dummy.rotation.x = t.lean;
        _dummy.position.set(
          t.x + Math.sin(t.lean) * Math.sin(t.leanYaw) * base,
          t.y + base,
          t.z + Math.sin(t.lean) * Math.cos(t.leanYaw) * base,
        );
        _dummy.scale.set(spread, tall, spread);
        _dummy.updateMatrix();
        crowns.setMatrixAt(i, _dummy.matrix);
        const palette = broad ? LEAF : NEEDLE;
        _colour.setHex(palette[(tier + Math.floor(t.tint * 4)) % palette.length]);
        _colour.multiplyScalar(0.8 + t.tint * 0.4);
        crowns.setColorAt(i, _colour);
      }
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      boundBatch(crowns, bounds);
      crowns.userData.geometryGate = {
        instanceAssemblyPrefix: 'specialmeeting-forest-tree',
        overlap: false,
        checkSupport: false,
      };
      add(crowns);
    }

    if (colliders) {
      for (const t of trees) {
        const half = t.radius * 1.25;
        colliders.push(new THREE.Box3(
          new THREE.Vector3(t.x - half, t.y, t.z - half),
          new THREE.Vector3(t.x + half, t.y + trunkHeight(t.kind, t.scale), t.z + half),
        ));
      }
    }
  }

  if (rocks.length) {
    const mesh = instanced(UNIT.rock, lambert(0xffffff, { flatShading: true }), rocks.length, 'forest.rocks');
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      _dummy.rotation.order = 'XYZ';
      _dummy.rotation.set(r.spinX, r.spinY, r.spinX * 0.6);
      /* Sunk to about a third, because a rock sitting exactly on the surface
       * looks dropped there and a forest is full of half-buried ones. */
      _dummy.position.set(r.x, r.y + r.size * r.squash * 0.34, r.z);
      _dummy.scale.set(r.size, r.size * r.squash, r.size * (0.8 + r.tint * 0.5));
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(0x4a4a4d).multiplyScalar(0.62 + r.tint * 0.5);
      mesh.setColorAt(i, _colour);
      if (colliders && r.size > 0.75) {
        colliders.push(new THREE.Box3(
          new THREE.Vector3(r.x - r.size * 0.8, r.y, r.z - r.size * 0.8),
          new THREE.Vector3(r.x + r.size * 0.8, r.y + r.size * r.squash, r.z + r.size * 0.8),
        ));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    boundBatch(mesh, bounds);
    add(mesh);
  }

  if (logs.length) {
    const mesh = instanced(UNIT.log, lambert(0xffffff), logs.length, 'forest.deadfall');
    mesh.castShadow = shadows;
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      /* The unit cylinder stands on Y. Lay it down (x = −PI/2), point it along
       * its yaw, then pitch it to match the ground under its two ends. YXZ so
       * the pitch lands in the frame the yaw made. */
      _dummy.rotation.order = 'YXZ';
      _dummy.rotation.set(-Math.PI / 2 + l.pitch, l.yaw, 0);
      _dummy.position.set(l.x, l.y, l.z);
      _dummy.scale.set(l.radius, l.length, l.radius);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(0x3d3325).multiplyScalar(0.7 + l.tint * 0.5);
      mesh.setColorAt(i, _colour);
      if (colliders) {
        const hx = Math.abs(Math.sin(l.yaw)) * l.length * 0.5 + l.radius;
        const hz = Math.abs(Math.cos(l.yaw)) * l.length * 0.5 + l.radius;
        colliders.push(new THREE.Box3(
          new THREE.Vector3(l.x - hx, l.y - l.radius, l.z - hz),
          new THREE.Vector3(l.x + hx, l.y + l.radius, l.z + hz),
        ));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    boundBatch(mesh, bounds);
    add(mesh);
  }

  if (stumps.length) {
    const mesh = instanced(UNIT.stump, lambert(0x453a2a), stumps.length, 'forest.stumps');
    mesh.castShadow = shadows;
    for (let i = 0; i < stumps.length; i++) {
      const s = stumps[i];
      _dummy.rotation.set(0, s.spin, 0);
      _dummy.position.set(s.x, s.y - 0.05, s.z);
      _dummy.scale.set(s.radius, s.height, s.radius);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    boundBatch(mesh, bounds);
    add(mesh);
  }

  return { group, materials, trees: trees.length };
}

/* ------------------------------------------------------------------ */
/* The undergrowth that follows you                                    */
/* ------------------------------------------------------------------ */

/**
 * Bracken, in a ring around whatever the camera is riding in.
 *
 * The same mechanism as golf's `GrassDetail` and for the same reason: there is
 * no budget for undergrowth over a square kilometre and no need for it, since
 * a fern is only a fern within about fifteen metres. One instanced batch,
 * re-scattered when the focus has moved far enough to need it, and instances
 * that fail the surface test simply are not counted rather than being hidden
 * somewhere.
 *
 * What is different: golf re-scatters every six metres because a walking man
 * covers six metres in three seconds. This ring is following a car at nine
 * metres a second, so the threshold is bigger, the radius is bigger, and the
 * scatter is anchored to a GRID rather than to the focus — a spiral anchored
 * on a moving car swims, and a fern that slides sideways as you pass it is
 * worse than no fern.
 */
export class Undergrowth {
  constructor(parent, { count = 900, radius = 17 } = {}) {
    const frond = new THREE.PlaneGeometry(1, 1);
    frond.translate(0, 0.5, 0);
    this.material = new THREE.MeshLambertMaterial({
      map: frondTexture(),
      transparent: false,
      /* Cut, not blended. Several hundred overlapping alpha quads in a
       * headlight beam is a sorting problem; an alpha test is not. */
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
    this.mesh = new THREE.InstancedMesh(frond, this.material, count);
    this.mesh.name = 'forest.undergrowth';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.count = count;
    this.radius = radius;
    /* Grid the scatter is anchored to. Half a metre: fine enough that the ring
     * looks continuous, coarse enough that a re-scatter is not a whole new
     * forest. */
    this.cell = 0.62;
    this._at = new THREE.Vector3(1e9, 0, 1e9);
    parent.add(this.mesh);
  }

  /** Re-scatter if the focus has moved. Cheap and idempotent otherwise. */
  update(focus) {
    if (this._at.distanceToSquared(focus) < 30) return;
    this._at.copy(focus);
    const cells = Math.ceil(this.radius / this.cell);
    const bx = Math.round(focus.x / this.cell);
    const bz = Math.round(focus.z / this.cell);
    let n = 0;
    /* Walked in rings out from the focus so that when the batch fills up, what
     * is dropped is the far stuff — which is the stuff in the fog. */
    for (let ring = 0; ring <= cells && n < this.count; ring++) {
      for (let ox = -ring; ox <= ring && n < this.count; ox++) {
        for (let oz = -ring; oz <= ring; oz++) {
          if (ring > 0 && Math.abs(ox) !== ring && Math.abs(oz) !== ring) continue;
          if (n >= this.count) break;
          const ix = bx + ox;
          const iz = bz + oz;
          const jx = cellHash(ix, iz, 41);
          const jz = cellHash(ix, iz, 42);
          const x = (ix + (jx - 0.5) * 0.9) * this.cell;
          const z = (iz + (jz - 0.5) * 0.9) * this.cell;
          if (Math.hypot(x - focus.x, z - focus.z) > this.radius) continue;

          const frame = roadFrame(x, z);
          const surface = surfaceAt(x, z, frame);
          if (surface !== SURFACE.DUFF && surface !== SURFACE.FERN
            && surface !== SURFACE.VERGE && surface !== SURFACE.BOG) continue;
          const density = undergrowthAt(x, z, frame);
          if (cellHash(ix, iz, 43) > density) continue;

          const size = (surface === SURFACE.FERN ? 0.78 : 0.46)
            * (0.6 + cellHash(ix, iz, 44) * 0.85);
          _dummy.position.set(x, heightAt(x, z, frame) - 0.04, z);
          _dummy.rotation.set(
            (cellHash(ix, iz, 45) - 0.5) * 0.3,
            cellHash(ix, iz, 46) * Math.PI * 2,
            (cellHash(ix, iz, 47) - 0.5) * 0.35,
          );
          _dummy.scale.set(size * 1.25, size, size);
          _dummy.updateMatrix();
          this.mesh.setMatrixAt(n, _dummy.matrix);
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Give back the shared unit geometries.
 *
 * Only the scene going away calls this — never a chunk teardown, which shares
 * them with every chunk still standing. The set is dropped rather than only
 * disposed, so entering the forest a second time builds a fresh one instead of
 * drawing with five disposed buffers.
 */
export function disposeFoliageGeometry() {
  if (!UNITS) return;
  for (const geometry of Object.values(UNITS)) geometry.dispose();
  UNITS = null;
}

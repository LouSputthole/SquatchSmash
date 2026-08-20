/**
 * THE SPECIAL MEETING — the ground, built in chunks around whoever is looking.
 *
 * A kilometre of road folded into three hundred metres of forest is about
 * ninety thousand square metres of ground. Meshed in one go at a resolution
 * the headlights deserve that is a quarter of a million vertices standing in
 * memory so that forty of them can be lit at a time, which is the mistake
 * `src/beefrun/terrain.js` already worked out and solved: build the ground in
 * chunks around the thing that is moving, at a resolution that falls off with
 * distance, a fixed number of chunks per frame, and give back the ones nobody
 * can see any more.
 *
 * THE NUMBERS, AND WHY THEY ARE THESE NUMBERS
 *
 *   CHUNK 48 m, RADIUS 2 — a 240-metre square around the car. The fog is
 *   exponential and thick; at a hundred metres it has already taken 99% of
 *   everything. The far ring exists so that a machine that turns the fog down
 *   does not see the edge of the world, not because anybody will look at it.
 *
 *   DETAIL [16, 12, 7] — three metres a triangle where the beam is, seven
 *   where it is not. The road corridor is NOT meshed at this resolution: it is
 *   drawn separately by `roadmesh.js` at a fine cross-section, and the ground
 *   under it is sunk so a three-metre triangle can never come up through a
 *   ten-centimetre camber.
 *
 *   TREE_RINGS 1 — trees only in the nine chunks nearest the car. A tree at a
 *   hundred and twenty metres is one part in a hundred of a pixel of fog.
 *
 * SEAMS
 *
 *   Neighbouring chunks at different resolutions do not share vertices, so
 *   their edges disagree by a few centimetres and the gap between them is a
 *   crack straight through to the sky. Every chunk therefore carries a SKIRT:
 *   a band of geometry hanging down off all four edges, which is invisible
 *   from anywhere except through the crack it fills.
 */

import * as THREE from 'three';
import {
  clamp01, corridorHalfWidth, heightAt, hollowAt, landSlopeAt, roadFrame,
  smootherstep, surfaceAt, surfaceProps,
} from './field.js';
import { buildFoliage, scatterChunk, Undergrowth } from './foliage.js';
import { groundDetailTexture, softCardTexture, tiled } from './textures.js';

const CHUNK = 48;
const RADIUS = 2;
const DETAIL = [16, 12, 7];
const TREE_RINGS = 1;
/** How far a chunk's skirt hangs below its edge. Deeper than any LOD gap. */
const SKIRT = 2.2;
/** Metres of ground per tile of the detail texture. */
const DETAIL_TILE = 5.5;
/** How far the ground is dropped under the road's own mesh. */
const CORRIDOR_SINK = 0.16;

const _colour = new THREE.Color();
const _scratchRock = new THREE.Color();

/* Same deterministic hash the scatter uses, and for the same reason: a fog
 * bank that is somewhere else when the chunk comes back is a fog bank that
 * moved while you were not looking at it. */
function cellHash(ix, iz, salt) {
  let h = Math.imul(ix + 0x9e37, 0x85ebca6b) ^ Math.imul(iz - 0x1f83, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d) ^ Math.imul(salt + 1, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* One chunk of ground                                                 */
/* ------------------------------------------------------------------ */

/**
 * The colour a patch of ground comes back at.
 *
 * The surface model gives the base — mud is not duff is not rock — and three
 * things move it off that: the steeper it is the more of the mineral soil is
 * showing through the litter, the wetter it is the darker it goes, and a slow
 * blotch keeps a hundred square metres of forest floor from being one value.
 * All of it is baked into vertex colour rather than sampled, because the
 * ground is Lambert and the only texture on it is a grey grain.
 */
function groundColour(x, z, frame, out) {
  const surface = surfaceAt(x, z, frame);
  out.setHex(surfaceProps(surface).colour);
  const steep = clamp01((landSlopeAt(x, z) - 0.25) / 0.8);
  if (steep > 0) out.lerp(_scratchRock.setHex(0x4a443c), steep * 0.55);
  const wet = hollowAt(x, z);
  if (wet > 0) out.multiplyScalar(1 - wet * 0.3);
  const blotch = Math.sin(x * 0.07) * 0.5 + Math.sin(z * 0.053 + x * 0.021) * 0.5;
  out.multiplyScalar(1 + blotch * 0.10);
  return out;
}

/**
 * Displaced grid plus a skirt, as one BufferGeometry.
 *
 * Written out by hand rather than displacing a `PlaneGeometry` the way golf
 * does, for exactly one reason: the skirt. A plane has no way to grow a rim,
 * and the rim is the difference between three levels of detail and three
 * levels of detail with daylight between them.
 */
function buildChunkGeometry(minX, minZ, size, seg) {
  const step = size / seg;
  const across = seg + 1;
  const gridCount = across * across;
  const skirtCount = across * 4;
  const total = gridCount + skirtCount;

  const positions = new Float32Array(total * 3);
  const colours = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);

  for (let j = 0; j < across; j++) {
    for (let k = 0; k < across; k++) {
      const i = j * across + k;
      const x = minX + k * step;
      const z = minZ + j * step;
      const frame = roadFrame(x, z);
      let y = heightAt(x, z, frame);

      /* Sink the ground under the road's own mesh. The ribbon is drawn at the
       * true road surface with a cross-section this grid cannot express, so
       * without this a triangle spanning the camber comes up through the
       * tarmac in the middle of the lane. Faded to nothing at the corridor
       * edge, where the two meshes have to meet exactly. */
      const corridor = corridorHalfWidth(frame);
      if (frame.distance < corridor) {
        y -= CORRIDOR_SINK
          * (1 - smootherstep(clamp01((frame.distance - corridor * 0.72) / (corridor * 0.28))));
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      groundColour(x, z, frame, _colour);
      colours[i * 3] = _colour.r;
      colours[i * 3 + 1] = _colour.g;
      colours[i * 3 + 2] = _colour.b;
      // World-space UV, so the grain runs continuously across every chunk seam.
      uvs[i * 2] = x / DETAIL_TILE;
      uvs[i * 2 + 1] = z / DETAIL_TILE;
    }
  }

  /* The skirt: four bands of vertices, each a copy of one edge dropped
   * straight down. Their colour is the edge's, darkened, because the only
   * time one is visible it should read as the underside of a bank. */
  const edges = [
    { from: 0, stride: 1 },                          // z = minZ
    { from: (across - 1) * across, stride: 1 },      // z = maxZ
    { from: 0, stride: across },                     // x = minX
    { from: across - 1, stride: across },            // x = maxX
  ];
  let w = gridCount;
  for (const edge of edges) {
    for (let n = 0; n < across; n++) {
      const src = edge.from + n * edge.stride;
      positions[w * 3] = positions[src * 3];
      positions[w * 3 + 1] = positions[src * 3 + 1] - SKIRT;
      positions[w * 3 + 2] = positions[src * 3 + 2];
      colours[w * 3] = colours[src * 3] * 0.55;
      colours[w * 3 + 1] = colours[src * 3 + 1] * 0.55;
      colours[w * 3 + 2] = colours[src * 3 + 2] * 0.55;
      uvs[w * 2] = uvs[src * 2];
      uvs[w * 2 + 1] = uvs[src * 2 + 1];
      w++;
    }
  }

  const indices = [];
  for (let j = 0; j < seg; j++) {
    for (let k = 0; k < seg; k++) {
      const a = j * across + k;
      const b = a + 1;
      const c = a + across;
      const d = c + 1;
      /* (a, c, b) faces +Y: (c−a) × (b−a) is (0,0,+dz) × (+dx,0,0) = (0,+,0).
       * Worth the line of proof — a terrain built inside out is invisible from
       * above and perfect from underneath, which is a confusing hour. */
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    const base = gridCount + e * across;
    for (let n = 0; n < seg; n++) {
      const top0 = edge.from + n * edge.stride;
      const top1 = edge.from + (n + 1) * edge.stride;
      const low0 = base + n;
      const low1 = base + n + 1;
      indices.push(top0, low0, top1, top1, low0, low1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Fog in the hollows                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fog pockets: three crossed cards a piece, lying in the low ground.
 *
 * Distance fog is a property of the whole scene and cannot be a place. What
 * makes a wood at night feel like a wood is that the fog is somewhere — a bank
 * of it lying in a dip that the headlights go into and come out of. So these
 * are geometry, in the hollows the height function already dug, and they are
 * LAMBERT rather than basic on purpose: an unlit card is a grey smear, and a
 * lit one flares white when the beam swings into it and goes back to nothing
 * when it swings off. That one behaviour is most of the atmosphere in the
 * scene, and it costs three quads.
 *
 * Crossed at fixed angles rather than billboarded: a billboard has to be
 * updated every frame per card and a card that turns to face you as you pass
 * it reads as a sprite. Three fixed planes read as a volume from any angle a
 * car on a road can reach.
 */
function buildFogPockets(minX, minZ, size, material) {
  const CELL = 22;
  const pockets = [];
  for (let ix = Math.floor(minX / CELL); ix < Math.ceil((minX + size) / CELL); ix++) {
    for (let iz = Math.floor(minZ / CELL); iz < Math.ceil((minZ + size) / CELL); iz++) {
      const x = (ix + 0.2 + cellHash(ix, iz, 61) * 0.6) * CELL;
      const z = (iz + 0.2 + cellHash(ix, iz, 62) * 0.6) * CELL;
      if (x < minX || x >= minX + size || z < minZ || z >= minZ + size) continue;
      const damp = hollowAt(x, z);
      if (damp < 0.34) continue;
      if (cellHash(ix, iz, 63) > 0.30 + damp * 0.55) continue;
      pockets.push({
        x,
        z,
        y: heightAt(x, z) + 0.5 + cellHash(ix, iz, 64) * 0.7,
        width: 9 + cellHash(ix, iz, 65) * 11,
        height: 2.0 + cellHash(ix, iz, 66) * 2.2,
        phase: cellHash(ix, iz, 67) * Math.PI * 2,
      });
    }
  }
  if (!pockets.length) return null;

  const plane = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(plane, material, pockets.length * 3);
  mesh.name = 'forest.fog-pocket';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  const dummy = new THREE.Object3D();
  let n = 0;
  for (const pocket of pockets) {
    for (let card = 0; card < 3; card++) {
      dummy.position.set(pocket.x, pocket.y, pocket.z);
      dummy.rotation.set(0, pocket.phase + (card * Math.PI) / 3, 0);
      dummy.scale.set(pocket.width, pocket.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, geometry: plane };
}

/* ------------------------------------------------------------------ */
/* The streamer                                                        */
/* ------------------------------------------------------------------ */

/**
 * The forest floor and everything standing in it, around a moving focus.
 *
 * @param {THREE.Object3D} parent the scene, or a group the whole forest hangs
 *        off so that one `remove` takes it all away.
 * @param {object} options
 * @param {THREE.Box3[]} [options.colliders] a live array the walking player's
 *        world reads. Kept in place — emptied and refilled rather than
 *        replaced — because `ColliderGrid` follows the array it was given.
 * @param {number} [options.budget] chunks built per `update`. One is a frame
 *        of work; two is a stutter you can see from the passenger seat.
 */
export class ForestTerrain {
  constructor(parent, { colliders = null, budget = 1, radius = RADIUS } = {}) {
    this.parent = parent;
    this.colliders = colliders;
    this.budget = budget;
    this.radius = radius;
    this.chunks = new Map();
    this.wanted = [];
    this.treeCount = 0;
    this._at = null;
    this._time = 0;

    this.group = new THREE.Group();
    this.group.name = 'forest.terrain';
    parent.add(this.group);

    this.detail = tiled(groundDetailTexture(), 1, 1);
    this.groundMaterial = new THREE.MeshLambertMaterial({
      map: this.detail,
      vertexColors: true,
      /* Double sided so a skirt cannot be built inside out. The alternative is
       * four winding orders got right by hand for a band of geometry nobody
       * will ever knowingly look at, and a terrain that is invisible from
       * above and flawless from below is a confusing hour to spend. */
      side: THREE.DoubleSide,
    });
    this.fogMaterial = new THREE.MeshLambertMaterial({
      map: softCardTexture(),
      color: 0x8d9aa6,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.undergrowth = new Undergrowth(this.group);
  }

  /** Chunk indices the focus wants, nearest ring first. */
  #wantedFor(x, z) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const out = [];
    for (let ox = -this.radius; ox <= this.radius; ox++) {
      for (let oz = -this.radius; oz <= this.radius; oz++) {
        out.push({ cx: cx + ox, cz: cz + oz, ring: Math.max(Math.abs(ox), Math.abs(oz)) });
      }
    }
    out.sort((a, b) => a.ring - b.ring);
    return out;
  }

  #build({ cx, cz, ring }) {
    const minX = cx * CHUNK;
    const minZ = cz * CHUNK;
    const seg = DETAIL[Math.min(ring, DETAIL.length - 1)];
    const group = new THREE.Group();
    group.name = `forest.chunk.${cx}.${cz}`;

    const geometry = buildChunkGeometry(minX, minZ, CHUNK, seg);
    const ground = new THREE.Mesh(geometry, this.groundMaterial);
    ground.name = `forest.ground.${cx}.${cz}`;
    ground.castShadow = false;
    ground.receiveShadow = ring <= TREE_RINGS;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    ground.userData.geometryGate = { structural: true, fixedSupportAnchor: true };
    group.add(ground);

    const record = {
      cx, cz, ring, group, geometry, foliage: null, fog: null, trees: 0, colliders: [],
    };

    if (ring <= TREE_RINGS) {
      const scatter = scatterChunk({ minX, minZ, size: CHUNK });
      const built = buildFoliage(scatter, {
        shadows: ring === 0,
        colliders: this.colliders ? record.colliders : null,
      });
      group.add(built.group);
      record.foliage = built;
      record.trees = built.trees;
      this.treeCount += built.trees;

      const fog = buildFogPockets(minX, minZ, CHUNK, this.fogMaterial);
      if (fog) {
        group.add(fog.mesh);
        record.fog = fog;
      }
    }

    this.group.add(group);
    this.chunks.set(`${cx},${cz}`, record);
    if (this.colliders && record.colliders.length) this.#syncColliders();
    return record;
  }

  #drop(record) {
    this.group.remove(record.group);
    record.geometry.dispose();
    if (record.foliage) {
      for (const child of record.foliage.group.children) child.geometry?.dispose?.();
      /* Only the materials this chunk minted. The unit geometries are shared
       * with every other chunk and are released once, by `dispose()`. */
      for (const material of record.foliage.materials) material.dispose();
      this.treeCount -= record.trees;
    }
    if (record.fog) record.fog.geometry.dispose();
    this.chunks.delete(`${record.cx},${record.cz}`);
  }

  /** Refill the shared collider array in place. */
  #syncColliders() {
    const out = this.colliders;
    out.length = 0;
    for (const record of this.chunks.values()) {
      for (const box of record.colliders) out.push(box);
    }
  }

  /**
   * Build every wanted chunk right now.
   *
   * Called once behind the loading bar. About a tenth of a second of work, and
   * the alternative is a car pulling away into a void that fills in over the
   * next four seconds while somebody is talking to you.
   */
  prime(focus) {
    this._at = { x: focus.x, z: focus.z };
    for (const want of this.#wantedFor(focus.x, focus.z)) {
      if (!this.chunks.has(`${want.cx},${want.cz}`)) this.#build(want);
    }
    this.undergrowth.update(focus);
    return this;
  }

  /**
   * Stream. Cheap on the frames where nothing has changed, which is most.
   *
   * @param {number} dt seconds.
   * @param {THREE.Vector3} focus the car, or the player once he is out of it.
   */
  update(dt, focus) {
    this._time += dt;
    if (!focus) return;

    const moved = !this._at
      || Math.abs(focus.x - this._at.x) > CHUNK * 0.34
      || Math.abs(focus.z - this._at.z) > CHUNK * 0.34;
    if (moved) {
      this._at = { x: focus.x, z: focus.z };
      this.wanted = this.#wantedFor(focus.x, focus.z);

      // Give back anything outside the new set, immediately: it is free.
      const keep = new Set(this.wanted.map((w) => `${w.cx},${w.cz}`));
      let dropped = false;
      for (const [key, record] of [...this.chunks]) {
        if (keep.has(key)) continue;
        this.#drop(record);
        dropped = true;
      }
      if (dropped && this.colliders) this.#syncColliders();
    }

    // Build, up to the budget, nearest ring first.
    let built = 0;
    while (built < this.budget && this.wanted.length) {
      const want = this.wanted[0];
      const key = `${want.cx},${want.cz}`;
      if (this.chunks.has(key)) {
        const existing = this.chunks.get(key);
        /* A chunk that has come closer wants more detail and its trees. Drop
         * and rebuild rather than patch: the geometry is a hundred vertices
         * and rebuilding it is honest about what changed. */
        if (existing.ring === want.ring) {
          this.wanted.shift();
          continue;
        }
        this.#drop(existing);
      }
      this.#build(want);
      this.wanted.shift();
      built++;
    }

    this.undergrowth.update(focus);

    /* The fog breathes. One sine on the whole chunk rather than per card:
     * the point is that it is not static, not that it is simulated. */
    if (this.chunks.size) {
      for (const record of this.chunks.values()) {
        if (!record.fog) continue;
        record.fog.mesh.position.y = Math.sin(this._time * 0.14 + record.cx * 1.7) * 0.22;
      }
    }
  }

  /** How many chunks are still owed. Zero means the world is complete. */
  get pending() {
    return this.wanted.filter((w) => {
      const record = this.chunks.get(`${w.cx},${w.cz}`);
      return !record || record.ring !== w.ring;
    }).length;
  }

  dispose() {
    for (const record of [...this.chunks.values()]) this.#drop(record);
    this.undergrowth.dispose();
    this.groundMaterial.dispose();
    this.fogMaterial.dispose();
    this.detail.dispose();
    this.parent.remove(this.group);
    if (this.colliders) this.colliders.length = 0;
  }
}

export { CHUNK, DETAIL, RADIUS, TREE_RINGS };

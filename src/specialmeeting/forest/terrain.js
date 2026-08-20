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
import { roadSamples } from './road.js';
import { groundDetailTexture, softCardTexture, tiled } from './textures.js';

const CHUNK = 48;
const RADIUS = 2;
const DETAIL = [16, 12, 7];
const TREE_RINGS = 1;
/** How far a chunk's skirt hangs below its edge. Deeper than any LOD gap. */
const SKIRT = 2.2;
/** Metres of ground per tile of the detail texture. */
const DETAIL_TILE = 5.5;
/**
 * How far the ground is dropped under the road's own mesh.
 *
 * Not a fudge factor — a measured one, and the measurement is the reason it is
 * this big. The road corridor is four to eight metres wide with structure at
 * the one-metre scale, and the terrain grid nearest the car is three metres:
 * a chord between two terrain vertices spanning a cut bank sits over a metre
 * above the road it is spanning. At sixteen centimetres of sink the forest
 * floor came up through the carriageway; at a metre and a quarter it does not.
 *
 * All of it is under the ribbon and none of it is visible. Where the sink is
 * released — the outermost fifth of the corridor — the ribbon carries a skirt
 * for the same reason the chunks do, so the seam is covered rather than
 * negotiated.
 */
const CORRIDOR_SINK = 0.9;

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
      if (frame.distance < corridor * 1.05) {
        /* Full depth across three quarters of the corridor, gone by the time
         * the trees start.
         *
         * That last clause is the constraint, and it is not obvious. Trees
         * stand on `heightAt`, not on this — so any tree inside the sink band
         * would be planted on ground the mesh has moved out from under it and
         * would float. The taper therefore has to finish OUTSIDE the corridor
         * and INSIDE the tree clearance, which is what these two numbers are.
         * Making the sink deeper to buy more headroom is not free: it buys a
         * row of levitating firs. */
        y -= CORRIDOR_SINK
          * (1 - smootherstep(clamp01(
            (frame.distance - corridor * 0.75) / (corridor * 0.30),
          )));
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
 * Fog pockets: three crossed cards a piece, lying across the road.
 *
 * Distance fog is a property of the whole scene and cannot be a PLACE. What
 * makes a wood at night feel like a wood is that the fog is somewhere — a bank
 * of it lying in a dip that the headlights go into and come out of.
 *
 * They are LAMBERT rather than basic on purpose: an unlit card is a grey
 * smear, and a lit one flares white when the beam swings into it and goes back
 * to nothing when it swings off. That one behaviour is most of the atmosphere
 * in the scene, and it costs three quads.
 *
 * Crossed at fixed angles rather than billboarded: a billboard has to be
 * updated every frame per card and a card that turns to face you as you pass
 * it reads as a sprite. Three fixed planes read as a volume from any angle a
 * car on a road can reach.
 *
 * PLACED FROM THE ROAD, NOT FROM A GRID. The first version scattered them over
 * the map wherever the ground was low and left the whole thing to chance —
 * which produced ninety-odd pockets, six of them within sight of the road and
 * none at all in the deep woods, where the car is slowest and the fog matters
 * most. So they are laid along the road at an authored spacing instead, biased
 * toward the dips rather than confined to them. The player drives through
 * them, which is the entire point of building fog out of geometry.
 */
function buildFogPockets(minX, minZ, size, material, bounds = null) {
  const pockets = [];
  const samples = roadSamples();
  /* Every twentieth sample is about twenty-eight metres of road, and roughly
   * half of those pass the roll: a bank every fifty or sixty metres, more of
   * them in the low ground. */
  for (let i = 0; i < samples.length; i += 20) {
    const sample = samples[i];
    if (sample.x < minX || sample.x >= minX + size) continue;
    if (sample.z < minZ || sample.z >= minZ + size) continue;
    const damp = hollowAt(sample.x, sample.z);
    if (cellHash(i, 0, 71) > 0.44 + damp * 0.45) continue;

    // Off to one side, far enough that the bank has an edge the beam finds.
    const side = cellHash(i, 0, 72) < 0.5 ? -1 : 1;
    const off = side * (2 + cellHash(i, 0, 73) * 7);
    const x = sample.x - Math.cos(sample.yaw) * off;
    const z = sample.z + Math.sin(sample.yaw) * off;
    pockets.push({
      x,
      z,
      y: heightAt(x, z) + 0.9 + cellHash(i, 0, 74) * 0.8,
      width: 12 + cellHash(i, 0, 75) * 11,
      height: 2.4 + cellHash(i, 0, 76) * 2.1,
      phase: cellHash(i, 0, 77) * Math.PI * 2,
    });
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
  if (bounds) {
    const half = size / 2;
    mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(minX + half, bounds.midY + 3, minZ + half),
      Math.hypot(half, half) + 18,
    );
  } else {
    mesh.computeBoundingSphere();
  }
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

  /**
   * Ground now, trees next frame.
   *
   * Both halves of a near chunk in one frame is eleven milliseconds — a
   * dropped frame, and the streamer builds one every few seconds all the way
   * down the road. Split, neither half is over six, and the only cost is that
   * a chunk stands bare for one frame at the edge of a fog that has already
   * taken it.
   */
  #build({ cx, cz, ring }, phase = 'all') {
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
      /* A far chunk has nothing to dress, so it is born finished. */
      dressed: ring > TREE_RINGS,
    };

    this.group.add(group);
    this.chunks.set(`${cx},${cz}`, record);
    if (phase === 'all') this.#dress(record);
    return record;
  }

  /** The other half: the trees, the deadfall and the fog that lies in it. */
  #dress(record) {
    if (record.dressed) return record;
    record.dressed = true;
    const minX = record.cx * CHUNK;
    const minZ = record.cz * CHUNK;

    const scatter = scatterChunk({ minX, minZ, size: CHUNK });
    /* The chunk's own extent, handed to the batch builder so it does not have
     * to walk two hundred instances to rediscover it. `midY` is taken off the
     * ground the chunk was meshed on. */
    const bounds = {
      minX, minZ, size: CHUNK, midY: heightAt(minX + CHUNK / 2, minZ + CHUNK / 2),
    };
    const built = buildFoliage(scatter, {
      shadows: record.ring === 0,
      detail: record.ring === 0 ? 'near' : 'far',
      colliders: this.colliders ? record.colliders : null,
      bounds,
    });
    record.group.add(built.group);
    record.foliage = built;
    record.trees = built.trees;
    this.treeCount += built.trees;

    const fog = buildFogPockets(minX, minZ, CHUNK, this.fogMaterial, bounds);
    if (fog) {
      record.group.add(fog.mesh);
      record.fog = fog;
    }
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
    /* Take its colliders out with it. A dropped chunk whose boxes are still in
     * the shared array is a wall in the dark where a tree used to be, and the
     * only place anybody walks in this scene is the one place it would show. */
    if (this.colliders && record.colliders.length) this.#syncColliders();
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
      if (!this.chunks.has(`${want.cx},${want.cz}`)) this.#build(want, 'all');
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

    /* Build, up to the budget, nearest ring first. A chunk costs two units of
     * budget — ground, then trees — and each is charged separately, so a
     * budget of one is one HALF-chunk a frame and never a whole one. */
    let built = 0;
    while (built < this.budget && this.wanted.length) {
      const want = this.wanted[0];
      const existing = this.chunks.get(`${want.cx},${want.cz}`);
      if (existing) {
        if (existing.ring !== want.ring) {
          /* A chunk that has come closer wants more detail and its trees. Drop
           * and rebuild rather than patch: the geometry is a hundred vertices
           * and rebuilding it is honest about what changed. */
          this.#drop(existing);
          this.#build(want, 'ground');
          built++;
          continue;
        }
        if (!existing.dressed) {
          this.#dress(existing);
          built++;
          continue;
        }
        this.wanted.shift();
        continue;
      }
      this.#build(want, 'ground');
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
      return !record || record.ring !== w.ring || !record.dressed;
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

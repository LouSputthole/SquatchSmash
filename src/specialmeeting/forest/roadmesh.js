/**
 * THE SPECIAL MEETING — the road, drawn, and the four things standing beside it.
 *
 * The ground is meshed in coarse chunks around the car (`terrain.js`). The
 * road cannot be: it is three metres wide with a camber, two wheel ruts and a
 * gutter, and a triangle spanning three metres of that is a flat plank. So the
 * corridor is drawn once, at load, as one long ribbon at a fine cross-section
 * — five hundred sections of fifteen vertices, about ten thousand triangles
 * for a kilometre, in two draw calls — and the chunked ground is sunk under it.
 *
 * Crucially the ribbon is not a second opinion about where the road is. It is
 * `heightAt` from `field.js`, sampled across instead of along. There is one
 * road and one height for it.
 *
 * WHAT ELSE IS OUT HERE
 *
 * Almost nothing, which is the brief. Five sodium lamps in the first hundred
 * metres and then no artificial light of any kind for eight hundred more; the
 * marker posts on the rural bends, because a white post coming back out of the
 * dark at fifteen metres a second is the cheapest speed cue in the medium; a
 * cattle grid where the tarmac stops, which is the moment the scene changes;
 * and a chain across the track, which is SM-260 and is the only prop in this
 * file that anybody in the car acknowledges.
 */

import * as THREE from 'three';
import {
  CHAIN_S, roadAt, roadLength, roadSamples, stageStartS, TURN_OFF_S,
} from './road.js';
import {
  corridorHalfWidth, heightAt, roadFrame, surfaceAt, surfaceProps,
} from './field.js';
import { dirtTexture, softCardTexture, tarmacTexture, tiled } from './textures.js';

/** Vertices across the corridor. Odd, so one of them is the crown. */
const ACROSS = 15;
/** Metres of road per tile of the surface texture, along and across. */
const TILE_ALONG = 4.5;
const TILE_ACROSS = 3.0;

const _colour = new THREE.Color();

/* ------------------------------------------------------------------ */
/* The ribbon                                                          */
/* ------------------------------------------------------------------ */

/**
 * One stretch of road as a strip of triangles.
 *
 * Built between two arclengths so the tarmac and the dirt can be different
 * materials without a per-vertex blend nobody would see at night. Everything
 * else about them is identical.
 */
function buildRibbon(fromS, toS, material, name) {
  const samples = roadSamples().filter((s) => s.s >= fromS - 2 && s.s <= toS + 2);
  if (samples.length < 2) return null;

  const rows = samples.length;
  const count = rows * ACROSS;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);

  for (let r = 0; r < rows; r++) {
    const sample = samples[r];
    /* Right of travel: forward is (sin yaw, cos yaw), so right is
     * (-cos yaw, sin yaw). Same derivation as `roadFrame`, and the two must
     * agree or the ribbon is drawn down the mirror image of the corridor the
     * ground was graded for. */
    const rx = -Math.cos(sample.yaw);
    const rz = Math.sin(sample.yaw);
    const frameAtCentre = roadFrame(sample.x, sample.z);
    const half = corridorHalfWidth(frameAtCentre);

    for (let c = 0; c < ACROSS; c++) {
      const t = (c / (ACROSS - 1)) * 2 - 1;             // −1 … +1 across
      /* Bunched toward the middle: the camber, the ruts and the edge of the
       * carriageway are where the shape is, and the outer verge is a slope
       * that four vertices can carry. */
      const bias = Math.sign(t) * Math.pow(Math.abs(t), 1.35);
      const off = bias * half;
      const x = sample.x + rx * off;
      const z = sample.z + rz * off;
      const frame = roadFrame(x, z);
      const i = r * ACROSS + c;
      positions[i * 3] = x;
      positions[i * 3 + 1] = heightAt(x, z, frame);
      positions[i * 3 + 2] = z;

      const surface = surfaceAt(x, z, frame);
      _colour.setHex(surfaceProps(surface).colour);
      /* Wear. The wheel tracks are polished and damp, the middle of a paved
       * road is bleached by everything that has driven down it, and the edges
       * are where the leaf litter blows to. */
      const grime = Math.sin(sample.s * 0.31) * 0.5 + Math.sin(sample.s * 0.083 + off) * 0.5;
      _colour.multiplyScalar(1 + grime * 0.13 - Math.abs(bias) * 0.16);
      colours[i * 3] = _colour.r;
      colours[i * 3 + 1] = _colour.g;
      colours[i * 3 + 2] = _colour.b;
      uvs[i * 2] = off / TILE_ACROSS;
      uvs[i * 2 + 1] = sample.s / TILE_ALONG;
    }
  }

  const indices = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < ACROSS - 1; c++) {
      const a = r * ACROSS + c;
      const b = a + 1;
      const d = a + ACROSS;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  /* Skirts down both long edges.
   *
   * The chunked ground beside the road is meshed at three metres and this is
   * meshed at half of one, so at the seam between them the coarse mesh cuts
   * the corner of every bank and stands a little above the fine one. A skirt
   * turns that from a hole into an overlap: the verge simply meets the edge of
   * the road slightly high, which is what a verge does. Same fix, same reason
   * and same shape as the one in `terrain.js`.
   */
  const skirtBase = rows * ACROSS;
  const skirt = new Float32Array(rows * 2 * 3);
  const skirtColour = new Float32Array(rows * 2 * 3);
  const skirtUv = new Float32Array(rows * 2 * 2);
  for (let r = 0; r < rows; r++) {
    for (let side = 0; side < 2; side++) {
      const src = r * ACROSS + (side === 0 ? 0 : ACROSS - 1);
      const w = r * 2 + side;
      skirt[w * 3] = positions[src * 3];
      skirt[w * 3 + 1] = positions[src * 3 + 1] - 1.6;
      skirt[w * 3 + 2] = positions[src * 3 + 2];
      skirtColour[w * 3] = colours[src * 3] * 0.6;
      skirtColour[w * 3 + 1] = colours[src * 3 + 1] * 0.6;
      skirtColour[w * 3 + 2] = colours[src * 3 + 2] * 0.6;
      skirtUv[w * 2] = uvs[src * 2];
      skirtUv[w * 2 + 1] = uvs[src * 2 + 1];
    }
  }
  const allPositions = new Float32Array(positions.length + skirt.length);
  allPositions.set(positions);
  allPositions.set(skirt, positions.length);
  const allColours = new Float32Array(colours.length + skirtColour.length);
  allColours.set(colours);
  allColours.set(skirtColour, colours.length);
  const allUvs = new Float32Array(uvs.length + skirtUv.length);
  allUvs.set(uvs);
  allUvs.set(skirtUv, uvs.length);
  for (let r = 0; r < rows - 1; r++) {
    for (let side = 0; side < 2; side++) {
      const top0 = r * ACROSS + (side === 0 ? 0 : ACROSS - 1);
      const top1 = (r + 1) * ACROSS + (side === 0 ? 0 : ACROSS - 1);
      const low0 = skirtBase + r * 2 + side;
      const low1 = skirtBase + (r + 1) * 2 + side;
      indices.push(top0, low0, top1, top1, low0, low1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(allColours, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(allUvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.userData.geometryGate = { structural: true, fixedSupportAnchor: true };
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Standing water                                                      */
/* ------------------------------------------------------------------ */

/**
 * Puddles in the ruts.
 *
 * Flat discs, smooth and dark, sunk a centimetre into the wheel track. In
 * daylight they would be nothing; in headlights a smooth surface at a glancing
 * angle is a mirror, and a road that flashes back at you twice a minute is a
 * road that has been rained on. Standard rather than Lambert for these alone —
 * the whole point of them is the specular.
 */
function buildPuddles(group, materials) {
  const disc = new THREE.CircleGeometry(1, 12);
  disc.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x0b0e10, roughness: 0.06, metalness: 0.55,
  });
  materials.push(material);

  const spots = [];
  const start = stageStartS('dirt');
  for (let s = start + 8; s < roadLength() - 20; s += 11) {
    const jitter = Math.sin(s * 1.37) * 0.5 + 0.5;
    if (jitter < 0.52) continue;
    const road = roadAt(s);
    const rx = -Math.cos(road.yaw);
    const rz = Math.sin(road.yaw);
    // In a rut, one side or the other, never in the middle.
    const side = Math.sin(s * 0.71) > 0 ? 1 : -1;
    const off = side * road.halfWidth * (0.44 + jitter * 0.2);
    spots.push({
      x: road.x + rx * off,
      z: road.z + rz * off,
      radius: 0.5 + jitter * 1.5,
      squash: 0.35 + jitter * 0.35,
      yaw: road.yaw,
    });
  }
  if (!spots.length) {
    disc.dispose();
    return;
  }

  const mesh = new THREE.InstancedMesh(disc, material, spots.length);
  mesh.name = 'forest.road.puddles';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i];
    dummy.position.set(p.x, heightAt(p.x, p.z) + 0.012, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    // Elongated along the rut, because that is the shape a rut holds water in.
    dummy.scale.set(p.radius * p.squash, 1, p.radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

/* ------------------------------------------------------------------ */
/* Marker posts                                                        */
/* ------------------------------------------------------------------ */

/**
 * Delineators down the rural bends: a dark post with a white top.
 *
 * The cheapest speed cue there is. On an unlit road at fifteen metres a second
 * the only things that tell you how fast you are going are the posts coming
 * back out of the dark one after another, and they stop dead at the turn-off,
 * which is how the player feels the road get worse before anybody says so.
 */
function buildMarkerPosts(group, materials) {
  const postGeo = new THREE.BoxGeometry(1, 1, 1);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2c2e });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xd6d2c4 });
  materials.push(postMat, capMat);

  const spots = [];
  const from = stageStartS('rural');
  for (let s = from; s < TURN_OFF_S - 12; s += 26) {
    const road = roadAt(s);
    const rx = -Math.cos(road.yaw);
    const rz = Math.sin(road.yaw);
    // Alternate sides, and always on the outside of a bend where it matters.
    const side = road.curvature > 0.004 ? -1 : road.curvature < -0.004 ? 1
      : (Math.floor(s / 26) % 2 ? 1 : -1);
    const off = side * (road.halfWidth + 1.15);
    spots.push({ x: road.x + rx * off, z: road.z + rz * off, yaw: road.yaw });
  }
  if (!spots.length) {
    postGeo.dispose();
    return;
  }

  const posts = new THREE.InstancedMesh(postGeo, postMat, spots.length);
  const caps = new THREE.InstancedMesh(postGeo, capMat, spots.length);
  posts.name = 'forest.road.markers';
  caps.name = 'forest.road.markers.caps';
  /* Two batches, one delineator: instance i of `caps` is the white top of
   * instance i of `posts`, seated ten centimetres down over it so the join
   * survives the lean applied to both. Pairing the ids says that -- the gate
   * then reads a post and its cap as one object and stops reporting thirteen
   * delineators for having tops. The posts are also driven into the verge at
   * `heightAt`, which is ground the gate cannot measure; see the trunk note in
   * forest/foliage.js. */
  posts.userData.geometryGate = {
    instanceAssemblyPrefix: 'specialmeeting-road-marker',
    fixedSupportAnchor: true,
  };
  caps.userData.geometryGate = {
    instanceAssemblyPrefix: 'specialmeeting-road-marker',
    fixedSupportAnchor: true,
  };
  posts.castShadow = false;
  caps.castShadow = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i];
    const y = heightAt(p.x, p.z);
    const lean = Math.sin(p.x * 3.1 + p.z) * 0.07;
    dummy.rotation.set(lean, p.yaw, 0);
    dummy.position.set(p.x, y + 0.45, p.z);
    dummy.scale.set(0.09, 0.9, 0.05);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, y + 0.80, p.z);
    dummy.scale.set(0.10, 0.19, 0.055);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  caps.computeBoundingSphere();
  group.add(posts, caps);
}

/* ------------------------------------------------------------------ */
/* The last streetlights in the game                                   */
/* ------------------------------------------------------------------ */

/**
 * Five sodium lamps, and then eight hundred metres of nothing.
 *
 * TWO of them carry a real light. The other three are an emissive head and a
 * halo card, which at forty metres through fog is indistinguishable and costs
 * nothing — the Bing's car park settled this argument with seven posts and
 * three lights (`src/bing/club.js`) and the block outside the flat repeats it
 * (`../layout.js`). Here it matters more than usual: every real light in this
 * scene is competing with the headlights, which are the only ones that count.
 */
function buildStreetlights(group, materials, lights) {
  const columnMat = new THREE.MeshLambertMaterial({ color: 0x23252a });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  const haloMat = new THREE.MeshBasicMaterial({
    map: softCardTexture(),
    color: 0xffbe72,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  materials.push(columnMat, headMat, haloMat);

  const column = new THREE.CylinderGeometry(0.10, 0.14, 7.4, 6);
  const arm = new THREE.BoxGeometry(1.5, 0.11, 0.11);
  const head = new THREE.BoxGeometry(0.62, 0.16, 0.30);
  const halo = new THREE.PlaneGeometry(6.5, 6.5);

  /* Thinning out, not evenly spaced: the gaps get longer as the town gives up.
   * The last one is at 118 m and there is not another for the rest of the
   * night. */
  const LAMPS = [
    { s: 14, live: true, side: 1 },
    { s: 44, live: false, side: -1 },
    { s: 74, live: true, side: 1 },
    { s: 100, live: false, side: -1 },
    { s: 118, live: false, side: 1 },
  ];

  for (const lamp of LAMPS) {
    const road = roadAt(lamp.s);
    const rx = -Math.cos(road.yaw);
    const rz = Math.sin(road.yaw);
    const off = lamp.side * (road.halfWidth + 1.0);
    const x = road.x + rx * off;
    const z = road.z + rz * off;
    const base = heightAt(x, z);

    const post = new THREE.Group();
    post.name = `forest.streetlight.${lamp.s}`;
    /* Concreted into the verge at `heightAt(x, z)`, which is the displaced
     * terrain -- ground the gate models as one box per 48 m chunk and can
     * therefore never see a lamp standing on. Same reasoning as the trunks in
     * forest/foliage.js, and the same remedy. */
    post.userData.geometryGate = { fixedSupportAnchor: true };
    post.position.set(x, base, z);
    post.rotation.y = road.yaw;

    const mast = new THREE.Mesh(column, columnMat);
    mast.position.y = 3.7;
    mast.castShadow = false;
    post.add(mast);

    /* Owner, 2026-08-31: "driving out to the meeting, all the street lights
     * are facing the wrong direction ... rotated a hundred eighty degrees in
     * that first part of it." The receipt: the post stands at
     * road + (rx,rz)·side·(halfWidth+1), and after rotation.y = yaw the
     * post's local +X is (cos yaw, −sin yaw) = −(rx,rz) — i.e. local
     * +X·side points back AT the road. The arm was hung on −side·X, which
     * is the verge, so every head lit the forest and turned its back on the
     * tarmac. Positive side offsets swing the whole head assembly the 180°
     * the owner asked for. */
    const bracket = new THREE.Mesh(arm, columnMat);
    bracket.position.set(lamp.side * 0.75, 7.3, 0);
    post.add(bracket);

    const lantern = new THREE.Mesh(head, headMat);
    lantern.position.set(lamp.side * 1.45, 7.18, 0);
    post.add(lantern);

    const glow = new THREE.Mesh(halo, haloMat);
    glow.position.set(lamp.side * 1.45, 6.9, 0);
    glow.rotation.x = -Math.PI / 2;
    post.add(glow);

    if (lamp.live) {
      /* Short range and a hard falloff. A sodium lamp lights a circle of road
       * and the underside of a tree, and that is all it is allowed to do — a
       * generous one would light the forest and give away that there is
       * nothing in it. */
      /* Fifty-five candela with a square-law falloff puts about a quarter of a
       * unit on the road seven metres under the lamp, which reads as a sodium
       * light. Under ten — the number you write if you think of intensity as a
       * brightness dial rather than as the top of a curve — the lamp is lit and
       * the road under it is not. */
      const light = new THREE.PointLight(0xffb765, 55, 26, 2.1);
      /* Under the lantern, which now hangs over the road — see above. */
      light.position.set(lamp.side * 1.45, 7.0, 0);
      light.castShadow = false;
      post.add(light);
      lights.push(light);
    }
    group.add(post);
  }
  return [column, arm, head, halo];
}

/* ------------------------------------------------------------------ */
/* Where the tarmac stops                                              */
/* ------------------------------------------------------------------ */

/**
 * The cattle grid. SM-220, and the loudest thing in the scene.
 *
 * Steel bars over a pit, with a concrete kerb at each end. It is worth
 * building properly for one reason: the car goes over it, the suspension finds
 * every bar, and that noise and that shake are what tell the player the road
 * has changed — before Seff puts the full beams on and forty seconds before
 * anybody speaks again.
 */
function buildCattleGrid(group, materials) {
  const road = roadAt(TURN_OFF_S);
  const rx = -Math.cos(road.yaw);
  const rz = Math.sin(road.yaw);
  const half = road.halfWidth + 0.5;

  const pit = new THREE.Group();
  pit.name = 'forest.cattle-grid';
  pit.position.set(road.x, heightAt(road.x, road.z), road.z);
  pit.rotation.y = road.yaw;

  const dark = new THREE.MeshLambertMaterial({ color: 0x0a0b0c });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x6a6f76, roughness: 0.42, metalness: 0.85,
  });
  const concrete = new THREE.MeshLambertMaterial({ color: 0x54524c });
  materials.push(dark, steel, concrete);

  // The hole under it, so the gaps between the bars are black and not ground.
  const holeGeo = new THREE.BoxGeometry(half * 2, 0.7, 2.6);
  const hole = new THREE.Mesh(holeGeo, dark);
  hole.position.y = -0.36;
  hole.receiveShadow = false;
  pit.add(hole);

  const barGeo = new THREE.BoxGeometry(half * 2 - 0.3, 0.09, 0.075);
  const bars = new THREE.InstancedMesh(barGeo, steel, 15);
  bars.name = 'forest.cattle-grid.bars';
  /* Fifteen bars laid ACROSS an open pit, which is the entire idea of a cattle
   * grid: there is deliberately nothing underneath them. They are carried at
   * their two ends by the concrete kerbs the pit is cut into, and the gate
   * measures downwards. */
  bars.userData.geometryGate = { fixedSupportAnchor: true };
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 15; i++) {
    dummy.position.set(0, 0.03, -1.15 + (i / 14) * 2.3);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bars.setMatrixAt(i, dummy.matrix);
  }
  bars.instanceMatrix.needsUpdate = true;
  bars.computeBoundingSphere();
  pit.add(bars);

  const kerbGeo = new THREE.BoxGeometry(0.42, 0.30, 2.9);
  for (const side of [-1, 1]) {
    const kerb = new THREE.Mesh(kerbGeo, concrete);
    kerb.position.set(side * (half - 0.1), 0.02, 0);
    kerb.castShadow = true;
    pit.add(kerb);
  }

  group.add(pit);
  return {
    geometry: [holeGeo, barGeo, kerbGeo],
    /** Where the wheels cross it, so the drive can time the bang. */
    s: TURN_OFF_S,
    position: new THREE.Vector3(road.x, heightAt(road.x, road.z), road.z),
    // Kept so a caller can measure the crossing rather than guess at it.
    width: 2.6,
    right: new THREE.Vector3(rx, 0, rz),
  };
}

/* ------------------------------------------------------------------ */
/* The chain                                                           */
/* ------------------------------------------------------------------ */

/**
 * A rusted chain across the track between two posts. SM-260.
 *
 * Lag gets out, unhooks it, drops it in the dirt, gets back in; the car goes
 * through; Lag gets out again and hooks it back up behind them. Nobody says
 * one word about any of it. The prop therefore has to do two things and no
 * more: hang, and lie in the dirt.
 *
 * The hang is a catenary in eleven straight links. Approximating it with a
 * shallow arc was tried and read as a rope; a chain has weight, and the
 * difference is entirely in how fast it falls away from the post.
 */
function buildChainGate(group, materials) {
  const road = roadAt(CHAIN_S);
  const rx = -Math.cos(road.yaw);
  const rz = Math.sin(road.yaw);
  const reach = road.halfWidth + 0.55;

  const gate = new THREE.Group();
  gate.name = 'forest.chain-gate';

  const postMat = new THREE.MeshLambertMaterial({ color: 0x342a1e });
  const chainMat = new THREE.MeshStandardMaterial({
    color: 0x4e3a2a, roughness: 0.82, metalness: 0.6,
  });
  materials.push(postMat, chainMat);

  const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.5, 7);
  const anchors = [];
  for (const side of [-1, 1]) {
    const x = road.x + rx * side * reach;
    const z = road.z + rz * side * reach;
    const y = heightAt(x, z);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, y + 0.72, z);
    post.rotation.z = side * 0.045;
    post.castShadow = true;
    gate.add(post);
    anchors.push(new THREE.Vector3(x, y + 1.02, z));
  }

  const LINKS = 11;
  const linkGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  const chain = new THREE.InstancedMesh(linkGeo, chainMat, LINKS);
  chain.name = 'forest.chain-gate.chain';
  /* Eleven links slung between two posts in a catenary. It hangs -- that is
   * what a chain across a track does -- and when it is dropped it lies in the
   * dirt of the trail. Nothing is under it in either state. */
  chain.userData.geometryGate = { fixedSupportAnchor: true };
  chain.castShadow = true;
  gate.add(chain);

  const dummy = new THREE.Object3D();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();

  /** Point on the chain at `t`, either strung between the posts or on the floor. */
  function pointAt(t, open) {
    const x = anchors[0].x + (anchors[1].x - anchors[0].x) * t;
    const z = anchors[0].z + (anchors[1].z - anchors[0].z) * t;
    if (open) {
      /* Dropped: it lies where it fell, in a loose S beside the near post
       * rather than in a neat line across the road. */
      const slack = Math.sin(t * Math.PI) * 0.9;
      const ox = rx * slack * 0.4;
      const oz = rz * slack * 0.4;
      const px = x * 0.62 + anchors[0].x * 0.38 + ox;
      const pz = z * 0.62 + anchors[0].z * 0.38 + oz;
      return new THREE.Vector3(px, heightAt(px, pz) + 0.035, pz);
    }
    const y = anchors[0].y + (anchors[1].y - anchors[0].y) * t;
    // cosh, normalised to zero at both posts: a real chain, not an arc.
    const u = (t - 0.5) * 2;
    const sag = (Math.cosh(u * 1.6) - Math.cosh(1.6)) / (1 - Math.cosh(1.6));
    return new THREE.Vector3(x, y - (1 - sag) * 0.42, z);
  }

  function lay(open) {
    for (let i = 0; i < LINKS; i++) {
      a.copy(pointAt(i / LINKS, open));
      b.copy(pointAt((i + 1) / LINKS, open));
      mid.addVectors(a, b).multiplyScalar(0.5);
      const length = a.distanceTo(b);
      dummy.position.copy(mid);
      /* Point the link's own +Y down its segment. `lookAt` aims −Z, so the
       * extra quarter turn about X is what stands the cylinder up along it. */
      dummy.lookAt(b);
      dummy.rotateX(Math.PI / 2);
      dummy.scale.set(1, length, 1);
      dummy.updateMatrix();
      chain.setMatrixAt(i, dummy.matrix);
    }
    chain.instanceMatrix.needsUpdate = true;
    chain.computeBoundingSphere();
  }
  lay(false);

  group.add(gate);

  return {
    group: gate,
    geometry: [postGeo, linkGeo],
    open: false,
    /** Where Lag stands when he gets out to do it. */
    standing: new THREE.Vector3(
      road.x + rx * (reach + 0.6),
      heightAt(road.x + rx * (reach + 0.6), road.z + rz * (reach + 0.6)),
      road.z + rz * (reach + 0.6),
    ),
    position: new THREE.Vector3(road.x, heightAt(road.x, road.z), road.z),
    s: CHAIN_S,
    setOpen(open) {
      if (this.open === open) return this;
      this.open = open;
      lay(open);
      return this;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

/**
 * Everything that is the road rather than the forest.
 *
 * @param {THREE.Object3D} parent
 * @returns {{group, chain, cattleGrid, lights, dispose}}
 */
export function buildRoadMesh(parent) {
  const group = new THREE.Group();
  group.name = 'forest.road';
  parent.add(group);

  const materials = [];
  const geometries = [];
  const lights = [];

  const tarmacMap = tiled(tarmacTexture(), 1, 1);
  const dirtMap = tiled(dirtTexture(), 1, 1);
  /* Double sided for the skirt's sake, exactly as the ground chunks are: the
   * band hanging off each edge is only ever seen through the seam it exists to
   * fill, and getting four winding orders right by hand for geometry nobody
   * will knowingly look at is not a good use of an afternoon. */
  const tarmacMat = new THREE.MeshLambertMaterial({
    map: tarmacMap, vertexColors: true, side: THREE.DoubleSide,
  });
  const dirtMat = new THREE.MeshLambertMaterial({
    map: dirtMap, vertexColors: true, side: THREE.DoubleSide,
  });
  materials.push(tarmacMat, dirtMat);

  const dirtStart = stageStartS('dirt');
  const paved = buildRibbon(0, dirtStart, tarmacMat, 'forest.road.tarmac');
  const track = buildRibbon(dirtStart, roadLength(), dirtMat, 'forest.road.dirt');
  if (paved) group.add(paved);
  if (track) group.add(track);

  buildMarkerPosts(group, materials);
  buildPuddles(group, materials);
  geometries.push(...buildStreetlights(group, materials, lights));
  const cattleGrid = buildCattleGrid(group, materials);
  geometries.push(...cattleGrid.geometry);
  const chain = buildChainGate(group, materials);
  geometries.push(...chain.geometry);

  return {
    group,
    chain,
    cattleGrid,
    lights,
    dispose() {
      group.traverse((object) => {
        if (object.isMesh || object.isInstancedMesh) object.geometry?.dispose?.();
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      tarmacMap.dispose();
      dirtMap.dispose();
      parent.remove(group);
    },
  };
}

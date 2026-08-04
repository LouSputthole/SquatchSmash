/**
 * Whispering Pines, dressed.
 *
 * Owner playtest, 2026-08-04: "Missing all the grass and stuff at whispering
 * pines airport."
 *
 * He is right, and this is why. The Beef Run flies from the same field and
 * gets its greenery from `TerrainStreamingSystem` (`src/beefrun/terrain.js`),
 * which builds every 500 m chunk of ground WITH a forest scatter on it. This
 * mission does not use that system at all: it flies a one-way eastbound
 * corridor, so `main.js` builds one static heightfield for the whole route
 * (`buildEastGround`) instead of streaming chunks around the aircraft. That
 * mesh is 50 m per segment and carries no scatter of any kind — so the ground
 * under the aeroplane was a bare, flat, unlit slab while the identical
 * aerodrome next door in the Beef Run is a pine forest with a grass field in
 * the middle of it.
 *
 * The fix is NOT to instantiate `TerrainStreamingSystem` here. Two ground
 * systems over one patch of world is a z-fighting seam and a second copy of
 * the same 500 m chunks the static mesh already covers. What is actually
 * missing is the DRESSING, so that is what this builds, once, around the
 * aerodrome only, out of the same pieces and the same rules the Beef Run's own
 * scatter uses:
 *
 *   - a fine grass apron-field, at the airfield's own elevation, over the
 *     coarse route mesh, in the `pines` zone's real ground colour;
 *   - an instanced pine forest, using `ZONES[0]`'s tree colour, scale and
 *     density and — importantly — the SAME keep-out rectangles Beef Run's
 *     scatter uses, so nothing sprouts on the runway, on the taxiway, or
 *     inside the apron everyone walks around;
 *   - instanced grass tufts and scrub across the field, thickening towards
 *     the treeline.
 *
 * Four extra draw calls (one ground mesh, two instanced tree meshes, one
 * instanced tuft mesh) and no per-frame cost: nothing here animates.
 *
 * `src/beefrun/airfield.js` is untouched. Beef Run builds this scene's
 * airfield exactly as it did before and never calls anything in this file.
 */
import * as THREE from 'three';
import { ZONES, WP } from '../beefrun/config.js';
import { terrainHeight } from '../beefrun/terrain.js';
import { clamp, rng, solid, mat, group } from '../beefrun/util.js';

const PINES = ZONES.find((z) => z.id === 'pines');

/* The field this dresses, in world metres. Wide enough that the treeline is
 * beyond the far end of the runway from the apron, and no wider — everything
 * past it is the route mesh's job. */
const FIELD = { x0: -900, x1: 900, z0: -700, z1: 1000 };

/* Nothing may grow inside these. The first three are lifted verbatim from
 * `TerrainStreamingSystem.build()`'s own scatter (see its comments — a pine
 * once grew hard against the hangar wall because the runway margin stopped
 * too early); the fourth is this mission's own, because the Enola Squatch
 * parks 33.5 m of wing on the south apron rather than the Brushrunner's 17.2 m
 * and needs the room for the walkaround. */
function inKeepOut(x, z) {
  if (Math.abs(x - WP.x) < 46 && Math.abs(z - WP.z) < WP.rwyHalf + 70) return true;  // runway
  if (x > -130 && x < -12 && z > 320 && z < 450) return true;                        // west apron
  if (x > -46 && x < 0 && z > 380 && z < 424) return true;                           // taxiway/hold
  if (x > -92 && x < -18 && z > 316 && z < 372) return true;                         // the Enola's spot
  return false;
}

/* Everything `airfield.js` lays down is a flat mesh a few centimetres above
 * `ELEV`: apron and taxiway at +0.035, runway at +0.04, threshold bars at
 * +0.05, taxi stripes at +0.065. Anything added here has to stay inside that
 * 3.5 cm window or it buries the aerodrome. */

/* The south hardstand. `ENOLA_PARKING` calls itself "the open south apron",
 * but `airfield.js`'s apron is the 34 x 52 slab at (-52, 396) and this
 * aeroplane parks at (-58, 342) — 28 m clear of it, on what turned out to be
 * bare ground the moment the field had grass on it. A sixty-ton bomber does
 * not stand on turf, so the field gets the hardstand its own config comment
 * already assumes, plus the lane joining it to the apron. Built here rather
 * than in `airfield.js` because the Beef Run has no reason to pave it. */
const HARDSTAND = { x: -58, z: 342, halfX: 22, halfZ: 21 };
const HARDSTAND_LANE = { x0: -64, x1: -44, z0: 360, z1: 392 };

/** True over anything paved — `airfield.js`'s surfaces plus the hardstand. */
function isPaved(x, z) {
  if (Math.abs(x - WP.x) < WP.rwyWidth + 3 && Math.abs(z - WP.z) < WP.rwyHalf + 26) return true;
  if (x > -71 && x < -33 && z > 368 && z < 424) return true;   // apron
  if (x > -55 && x < -13 && z > 388 && z < 404) return true;   // taxiway
  if (Math.abs(x - HARDSTAND.x) < HARDSTAND.halfX && Math.abs(z - HARDSTAND.z) < HARDSTAND.halfZ) return true;
  if (x > HARDSTAND_LANE.x0 && x < HARDSTAND_LANE.x1
    && z > HARDSTAND_LANE.z0 && z < HARDSTAND_LANE.z1) return true;
  return false;
}

/**
 * One grass tuft: three crossed, tapered blades.
 *
 * A single upright quad reads as a floating dark square from anything but
 * dead-on, which is exactly what the first cut of this looked like from the
 * cockpit — a field of litter. Tapering the top edge and crossing three of
 * them gives something that reads as a clump from every angle for six
 * triangles, and they are all in one InstancedMesh regardless.
 */
function tuftGeometry() {
  const blades = 3;
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const base = b * 4;
    // Wide at the ground, narrow at the tip, leaning slightly with the blade.
    verts.push(-cx, 0, -cz, cx, 0, cz, cx * 0.32, 1, cz * 0.32, -cx * 0.32, 1, -cz * 0.32);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const _obj = new THREE.Object3D();

/**
 * @param {THREE.Scene} scene
 * @param {object} [opts]
 * @param {(x:number,z:number)=>number} [opts.getHeight] the mission's own
 *   ground function. Defaults to Beef Run's `terrainHeight`, which is what
 *   `groundHeightCombined` blends into within ~1400 m of the field anyway —
 *   passing the real one keeps every tree root on the ground the aeroplane
 *   collides with even if that blend is ever retuned.
 * @returns {{root: THREE.Group, trees: number, tufts: number}}
 */
export function buildAirfieldScenery(scene, { getHeight = terrainHeight } = {}) {
  const root = group('whispering-pines-scenery');
  scene.add(root);
  const rand = rng(0x5eef17);

  /* ---- No second ground mesh ----
   * The first cut of this file laid a fine grass heightfield over the route
   * mesh. Do not do that again: two co-planar heightfields at different vertex
   * densities z-fight into speckled confetti across the entire aerodrome, and
   * a 6 cm lift to escape it buried the runway, the taxiway and the apron
   * (which `airfield.js` puts at ELEV + 0.035..0.065) under turf, with a
   * sixty-ton bomber parked on a lawn.
   *
   * The green comes from the route mesh itself instead — `buildEastGround()`
   * in `./main.js` now blends Beef Run's own `pines` palette over the same
   * `x` window its heights already blend over. One ground, correctly
   * coloured, and everything below is dressing that stands on it. */

  /* ---- The south hardstand ----
   * At ELEV + 0.03: above the grass (+0.012), below `airfield.js`'s own apron
   * (+0.035) so the two never fight where they meet. Cracked-concrete grey
   * rather than the apron's asphalt, because it is the older pad. */
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(HARDSTAND.halfX * 2, HARDSTAND.halfZ * 2),
    solid(0x585a5c, { roughness: 0.95 }),
  );
  pad.name = 'enola-hardstand';
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(HARDSTAND.x, getHeight(HARDSTAND.x, HARDSTAND.z) + 0.03, HARDSTAND.z);
  pad.receiveShadow = true;
  root.add(pad);
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(HARDSTAND_LANE.x1 - HARDSTAND_LANE.x0, HARDSTAND_LANE.z1 - HARDSTAND_LANE.z0),
    solid(0x525456, { roughness: 0.95 }),
  );
  lane.name = 'enola-hardstand-lane';
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(
    (HARDSTAND_LANE.x0 + HARDSTAND_LANE.x1) / 2,
    getHeight(HARDSTAND.x, 376) + 0.028,
    (HARDSTAND_LANE.z0 + HARDSTAND_LANE.z1) / 2,
  );
  lane.receiveShadow = true;
  root.add(lane);
  // Expansion joints, so the pad is not one flat grey rectangle.
  const joint = solid(0x3d3f42, { roughness: 1 });
  for (let k = -2; k <= 2; k++) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(HARDSTAND.halfX * 2, 0.18), joint);
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(HARDSTAND.x, pad.position.y + 0.006, HARDSTAND.z + k * 8.4);
    root.add(seam);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.18, HARDSTAND.halfZ * 2), joint);
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(HARDSTAND.x + k * 8.8, pad.position.y + 0.006, HARDSTAND.z);
    root.add(cross);
  }

  /* ---- The pines ----
   * Same two geometries and the same colour as Beef Run's own scatter, so the
   * treeline round this aerodrome matches the one the Beef Run takes off
   * through. Density falls off towards the middle of the field: a working
   * strip is mown, and the forest closes in at the edges. */
  const MAX_TREES = 900;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 5);
  trunkGeo.translate(0, 3, 0);
  const canopyGeo = new THREE.ConeGeometry(4.2, 13, 6);
  canopyGeo.translate(0, 11, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, solid(0x5a4126, { roughness: 1 }), MAX_TREES);
  const canopies = new THREE.InstancedMesh(canopyGeo, solid(PINES.tree, { roughness: 1 }), MAX_TREES);
  trunks.name = 'whispering-pines-trunks';
  canopies.name = 'whispering-pines-canopies';
  trunks.castShadow = canopies.castShadow = false;
  let trees = 0;
  for (let i = 0; i < MAX_TREES * 4 && trees < MAX_TREES; i++) {
    const x = FIELD.x0 + rand() * (FIELD.x1 - FIELD.x0);
    const z = FIELD.z0 + rand() * (FIELD.z1 - FIELD.z0);
    if (inKeepOut(x, z)) continue;
    /* Thin towards the strip. `edge` is 0 on the centreline of the aerodrome
     * and 1 out at the treeline, and a tree needs to beat it to stand. */
    const edge = clamp(Math.max(Math.abs(x - WP.x) / 520, Math.abs(z - WP.z) / 620), 0, 1);
    if (rand() > edge * edge * 1.25) continue;
    const h = getHeight(x, z);
    const hx = getHeight(x + 8, z) - getHeight(x - 8, z);
    const hz = getHeight(x, z + 8) - getHeight(x, z - 8);
    if (Math.hypot(hx, hz) > 16) continue;    // too steep to root, same as Beef Run
    const s = PINES.treeScale * (0.66 + rand() * 0.8);
    _obj.position.set(x, h, z);
    _obj.rotation.set(0, rand() * Math.PI * 2, 0);
    _obj.scale.set(s, s * (0.8 + rand() * 0.5), s);
    _obj.updateMatrix();
    trunks.setMatrixAt(trees, _obj.matrix);
    canopies.setMatrixAt(trees, _obj.matrix);
    trees++;
  }
  trunks.count = canopies.count = trees;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  root.add(trunks, canopies);

  /* ---- Grass tufts and scrub ----
   * `airfield.js` scatters its own tufts through the runway cracks and along
   * the edges; these are the rest of the field, including the ground the
   * walkaround actually happens on, which had nothing on it at all. One
   * crossed pair of quads per tuft, instanced. */
  const MAX_TUFTS = 2200;
  const tufts = new THREE.InstancedMesh(
    tuftGeometry(),
    mat({ color: 0x6d8c45, roughness: 1, side: THREE.DoubleSide }),
    MAX_TUFTS,
  );
  tufts.name = 'whispering-pines-tufts';
  tufts.castShadow = false;
  tufts.receiveShadow = false;
  let tuftCount = 0;
  for (let i = 0; i < MAX_TUFTS * 3 && tuftCount < MAX_TUFTS; i++) {
    // Concentrated round the apron and along the strip, where a person on
    // foot can actually see them; the far field reads as forest, not lawn.
    const x = WP.x - 240 + rand() * 400;
    const z = WP.z + 40 + rand() * 640;
    if (inKeepOut(x, z) || isPaved(x, z)) continue;
    // Ankle height, not knee height — this is a mown strip gone shaggy.
    const s = 0.26 + rand() * 0.3;
    _obj.position.set(x, getHeight(x, z) + 0.02, z);
    _obj.rotation.set(0, rand() * Math.PI, 0);
    _obj.scale.set(s * (0.8 + rand() * 0.5), s, s * (0.8 + rand() * 0.5));
    _obj.updateMatrix();
    tufts.setMatrixAt(tuftCount++, _obj.matrix);
  }
  tufts.count = tuftCount;
  tufts.instanceMatrix.needsUpdate = true;
  root.add(tufts);

  return { root, trees, tufts: tuftCount };
}

/**
 * Pure, reusable geometry composition for the Enola Squatch route.
 *
 * The browser runtime and the headless geometry gate both use this module, so
 * the visible terrain, scatter and crater deformation cannot drift apart.
 * Runtime systems receive `groundHeightCombined` by reference; `setCrater`
 * updates the closed-over crater record without replacing that function.
 */
import * as THREE from 'three';

import { WP, ZONES } from '../beefrun/config.js';
import { terrainHeight } from '../beefrun/terrain.js';
import {
  clamp, lerp, smoothstep, fbm, ridged, rng, coneGeo,
} from '../beefrun/util.js';
import {
  CRATER, LANDMARKS_EAST, TARGET_CITY, TARGET_X, ZONES_EAST,
} from './config.js';
import { craterOffset, riverCarve } from './scenes/TargetCity.js';
import { WHISPERING_PINES_SCENERY_BOUNDS } from './airfield-scenery.js';

const COMPOUND = LANDMARKS_EAST.find((landmark) => landmark.id === 'compound');
const PINES_ZONE = ZONES.find((zone) => zone.id === 'pines');

function zoneIndexForX(x) {
  for (let index = 0; index < ZONES_EAST.length; index += 1) {
    if (x < ZONES_EAST[index].to) return index;
  }
  return ZONES_EAST.length - 1;
}

export function zoneMixX(x) {
  const i = zoneIndexForX(x);
  const edge = ZONES_EAST[i].to;
  const band = 420;
  if (i < ZONES_EAST.length - 1 && x > edge - band) {
    return { i, j: i + 1, t: smoothstep(edge - band, edge, x) };
  }
  return { i, j: i, t: 0 };
}

function zoneHeightEast(zone, x, z) {
  const scale = zone.scale;
  const soft = fbm(x / scale, z / scale, 4);
  const sharp = ridged(x / scale, z / scale, 4);
  return zone.base + lerp(soft, sharp, clamp(zone.ridge, 0, 1)) * zone.relief;
}

/** Build the route heightfield/scatter and its reversible crater seam. */
export function createEnolaWorldGeometry(scene) {
  let activeCrater = null;
  let craterGroundEdits = null;

  function rawEastHeight(x, z) {
    const { i, j, t } = zoneMixX(x);
    let height = t > 0
      ? lerp(zoneHeightEast(ZONES_EAST[i], x, z), zoneHeightEast(ZONES_EAST[j], x, z), t)
      : zoneHeightEast(ZONES_EAST[i], x, z);
    const distanceToPad = Math.hypot(x - TARGET_X, (z - COMPOUND.z) * 1.3);
    height = lerp(
      height,
      ZONES_EAST[ZONES_EAST.length - 1].base - 12,
      smoothstep(640, 260, distanceToPad),
    );
    height += riverCarve(x - TARGET_X, z - COMPOUND.z, TARGET_CITY);
    return height;
  }

  function groundHeightCombined(x, z) {
    const blend = smoothstep(500, 1400, x);
    let height;
    if (blend <= 0) height = terrainHeight(x, z);
    else if (blend >= 1) height = rawEastHeight(x, z);
    else height = lerp(terrainHeight(x, z), rawEastHeight(x, z), blend);
    if (activeCrater) {
      const distance = Math.hypot(x - activeCrater.x, z - activeCrater.z);
      if (distance < CRATER.radius + CRATER.rimWidth) height += craterOffset(distance, CRATER);
    }
    return height;
  }

  const boundsX = [-1400, 14500];
  const boundsZ = [-4200, 1000];
  const segX = 318;
  const segZ = 104;
  const width = boundsX[1] - boundsX[0];
  const depth = boundsZ[1] - boundsZ[0];
  const centerX = (boundsX[0] + boundsX[1]) / 2;
  const centerZ = (boundsZ[0] + boundsZ[1]) / 2;

  const geometry = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const worldX = centerX + positions.getX(index);
    const worldZ = centerZ + positions.getZ(index);
    const height = groundHeightCombined(worldX, worldZ);
    positions.setY(index, height);
    const zone = ZONES_EAST[zoneIndexForX(worldX)];
    const groundColor = new THREE.Color(zone.ground);
    const rockColor = new THREE.Color(zone.rock);
    const gradientX = groundHeightCombined(worldX + 10, worldZ) - groundHeightCombined(worldX - 10, worldZ);
    const gradientZ = groundHeightCombined(worldX, worldZ + 10) - groundHeightCombined(worldX, worldZ - 10);
    const steep = clamp(Math.hypot(gradientX, gradientZ) / 26, 0, 1);
    color.copy(groundColor).lerp(rockColor, steep * 0.85);
    const west = 1 - smoothstep(400, 1500, Math.hypot(worldX - WP.x, 0));
    if (west > 0) {
      color.lerp(
        new THREE.Color(PINES_ZONE.ground)
          .lerp(new THREE.Color(PINES_ZONE.rock), steep * 0.85),
        west,
      );
    }
    color.multiplyScalar(0.86 + fbm(worldX / 110, worldZ / 110, 2) * 0.28);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }),
  );
  ground.name = 'eastbound terrain ground';
  ground.userData.boundsX = [...boundsX];
  ground.userData.boundsZ = [...boundsZ];
  ground.position.set(centerX, 0, centerZ);
  ground.receiveShadow = true;
  scene.add(ground);

  const instanceBudget = 620;
  const scatter = new THREE.InstancedMesh(
    coneGeo(3, 9, 6),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    instanceBudget,
  );
  scatter.name = 'eastbound terrain scatter';
  // Each decorative tree is planted from groundHeightCombined().  The exact
  // batch retains overlap auditing while recording that local support fact.
  scatter.userData.geometryGate = { checkSupport: false };
  const random = rng(0xE57A11);
  const dummy = new THREE.Object3D();
  const scatterFootprints = [];
  let used = 0;
  for (let attempts = 0; attempts < instanceBudget * 8 && used < instanceBudget; attempts += 1) {
    const worldX = boundsX[0] + random() * width;
    const worldZ = boundsZ[0] + random() * depth;
    const zone = ZONES_EAST[zoneIndexForX(worldX)];
    if (zone.trees <= 0 || random() > zone.trees / 60) continue;
    if (Math.abs(worldX - WP.x) < 60 && Math.abs(worldZ) < WP.rwyHalf + 90) continue;
    if (worldX > -160 && worldX < 40 && worldZ > 300 && worldZ < 460) continue;
    const airfield = WHISPERING_PINES_SCENERY_BOUNDS;
    if (worldX > airfield.x0 && worldX < airfield.x1
      && worldZ > airfield.z0 && worldZ < airfield.z1) continue;
    if (Math.hypot(worldX - TARGET_X, worldZ - COMPOUND.z) < TARGET_CITY.radius + 140) continue;
    const yaw = random() * Math.PI * 2;
    const scale = 0.7 + random() * 0.8;
    const depthScale = scale * (0.8 + random() * 0.6);
    // The gate audits the rotated cone through its transformed AABB. Reserve
    // that worst-case crown footprint before accepting another route tree.
    const crownRadius = Math.SQRT2 * 3 * Math.max(scale, depthScale);
    if (scatterFootprints.some((tree) => (
      Math.hypot(worldX - tree.x, worldZ - tree.z) < crownRadius + tree.radius + 0.05
    ))) continue;
    const height = groundHeightCombined(worldX, worldZ);
    dummy.position.set(worldX, height + 4.2, worldZ);
    dummy.rotation.y = yaw;
    dummy.scale.set(scale, scale, depthScale);
    dummy.updateMatrix();
    scatter.setMatrixAt(used, dummy.matrix);
    scatter.setColorAt(used, new THREE.Color(zone.tree));
    scatterFootprints.push({ x: worldX, z: worldZ, radius: crownRadius });
    used += 1;
  }
  scatter.count = used;
  scatter.instanceMatrix.needsUpdate = true;
  if (scatter.instanceColor) scatter.instanceColor.needsUpdate = true;
  scatter.castShadow = false;
  scene.add(scatter);

  function depressGroundForCrater(craterRecord) {
    const position = ground.geometry.attributes.position;
    const colour = ground.geometry.attributes.color;
    const originX = ground.position.x;
    const originZ = ground.position.z;
    const outer = CRATER.radius + CRATER.rimWidth;
    const scorch = new THREE.Color(0x241d18);
    const sample = new THREE.Color();
    const edits = [];
    for (let index = 0; index < position.count; index += 1) {
      const worldX = originX + position.getX(index);
      const worldZ = originZ + position.getZ(index);
      const distance = Math.hypot(worldX - craterRecord.x, worldZ - craterRecord.z);
      if (distance >= outer) continue;
      edits.push({
        i: index,
        y: position.getY(index),
        r: colour ? colour.getX(index) : 0,
        g: colour ? colour.getY(index) : 0,
        b: colour ? colour.getZ(index) : 0,
      });
      const clearance = 8 * smoothstep(outer, outer - 140, distance);
      position.setY(index, position.getY(index) + craterOffset(distance, CRATER) - clearance);
      if (colour) {
        sample.setRGB(colour.getX(index), colour.getY(index), colour.getZ(index))
          .lerp(scorch, clamp(1.15 - distance / outer, 0, 1));
        colour.setXYZ(index, sample.r, sample.g, sample.b);
      }
    }
    craterGroundEdits = edits;
    position.needsUpdate = true;
    if (colour) colour.needsUpdate = true;
    ground.geometry.computeVertexNormals();
    return edits.length;
  }

  function raiseGroundAfterCrater() {
    const edits = craterGroundEdits;
    craterGroundEdits = null;
    if (!edits?.length) return 0;
    const position = ground.geometry.attributes.position;
    const colour = ground.geometry.attributes.color;
    for (const edit of edits) {
      position.setY(edit.i, edit.y);
      if (colour) colour.setXYZ(edit.i, edit.r, edit.g, edit.b);
    }
    position.needsUpdate = true;
    if (colour) colour.needsUpdate = true;
    ground.geometry.computeVertexNormals();
    return edits.length;
  }

  function setCrater(crater) {
    if (crater) {
      if (activeCrater && craterGroundEdits?.length) raiseGroundAfterCrater();
      activeCrater = crater;
      return depressGroundForCrater(crater);
    }
    activeCrater = null;
    return raiseGroundAfterCrater();
  }

  return {
    ground,
    scatter,
    groundHeightCombined,
    rawEastHeight,
    setCrater,
    get activeCrater() { return activeCrater; },
  };
}

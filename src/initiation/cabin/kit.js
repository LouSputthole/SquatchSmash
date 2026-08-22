/**
 * INITIATION NIGHT — the small tools everything in this subtree is built with.
 *
 * Two jobs, and they are both about things that have gone wrong here before.
 *
 * DETERMINISM. Every scatter in this subtree runs off `rng()`, never
 * `Math.random()`. The forest in main.js is randomised at import time, which
 * means the same build is a different forest every reload, no screenshot can
 * be compared with the last one, and the geometry gate would be scanning a
 * scene nobody can reproduce. A seed makes the woods a PLACE instead of a roll.
 *
 * GATE METADATA. The geometry gate reads `userData.geometryGate` to work out
 * what owns what. Get it wrong and a cabin reports its own four walls as
 * interpenetrating each other; leave it off a scene-scale structure and the
 * gate refuses to guess, because an implicit owner is capped at 64 parts and
 * 8 m. So: `assembly()` for anything that is one object, `structural()` for
 * ground you can stand on, `wallPart()` for walls, `effect()` for fire and
 * smoke, which are not objects at all.
 */

import * as THREE from 'three';
import { lambert } from '../../world/build.js';

/* ------------------------------------------------------------------ */
/* Determinism                                                         */
/* ------------------------------------------------------------------ */

/** Small, fast, stable PRNG. Same seed, same woods, every time, forever. */
export function rng(seed = 0x1a17ed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
}

/** `random` in a range. */
export const between = (random, low, high) => low + random() * (high - low);
/** Pick one. */
export const pickOne = (random, list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/* ------------------------------------------------------------------ */
/* Meshes                                                              */
/* ------------------------------------------------------------------ */

export function part(geometry, material, x = 0, y = 0, z = 0, name = '') {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  if (name) object.name = name;
  object.castShadow = false;
  object.receiveShadow = true;
  return object;
}

/** A box, positioned by its CENTRE. */
export function boxPart(name, size, position, colour, options = null) {
  return part(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    options ? lambert(colour, options) : lambert(colour),
    position[0], position[1], position[2], name,
  );
}

/**
 * A box, positioned by its extents.
 *
 * Most of this site is authored as "from here to there" rather than as a
 * centre and a size, because every clearance the gate checks is an extent —
 * and a wall written as a centre is a wall whose face nobody can find.
 */
export function slab(name, minimum, maximum, colour, options = null) {
  const size = [maximum[0] - minimum[0], maximum[1] - minimum[1], maximum[2] - minimum[2]];
  return boxPart(name, size, [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ], colour, options);
}

export function cylinderPart(name, radiusTop, radiusBottom, height, radialSegments, colour, position) {
  return part(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    lambert(colour),
    position[0], position[1], position[2], name,
  );
}

export function conePart(name, radius, height, radialSegments, colour, position) {
  return part(
    new THREE.ConeGeometry(radius, height, radialSegments),
    lambert(colour),
    position[0], position[1], position[2], name,
  );
}

/** Something that emits its own light and is meant to bloom. Never lambert. */
export function glowMaterial(colour, boost = 1, extra = null) {
  const material = new THREE.MeshBasicMaterial({ color: colour, ...(extra || {}) });
  material.color.multiplyScalar(boost);
  return material;
}

/* ------------------------------------------------------------------ */
/* Gate metadata                                                       */
/* ------------------------------------------------------------------ */

/**
 * One object, made of many meshes.
 *
 * An explicit `assemblyId` is the only ownership the gate accepts for
 * something bigger than 8 m or heavier than 64 parts, which covers the cabin,
 * the mud and the track. It is also what stops a chair's four legs being
 * reported as four objects standing inside one seat.
 */
export function assembly(name, assemblyId, ...children) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.geometryGate = { assemblyId };
  for (const child of children) if (child) group.add(child);
  return group;
}

/** A plain named group. Bounded ownership only — keep it under 8 m. */
export function namedGroup(name, ...children) {
  const group = new THREE.Group();
  group.name = name;
  for (const child of children) if (child) group.add(child);
  return group;
}

/** Ground, floors, decks: things other things are allowed to rest on. */
export function structural(object) {
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    structural: true,
    fixedSupportAnchor: true,
  };
  return object;
}

/** A wall. `axis` is the thin one. Anything sunk >2 cm into it is a finding. */
export function wallPart(object, axis) {
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    wall: true,
    wallAxis: axis,
  };
  return object;
}

/**
 * Fire, smoke, beams of light in fog.
 *
 * None of these are objects: they have no mass, they rest on nothing, and
 * asking whether a flame interpenetrates a log is a category error. The gate
 * already excludes them by name — `flame`, `smoke … plume`, `fog … volume` —
 * and the explicit flag says so without depending on spelling.
 */
export function effect(object) {
  object.userData.sceneAuditIgnore = true;
  object.castShadow = false;
  object.receiveShadow = false;
  return object;
}

/** Everything on this site that throws a shadow says so here, once. */
export function casts(object) {
  object.castShadow = true;
  return object;
}

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */

/**
 * Bake a texture. Headless-safe: the DOM shim hands back a canvas whose 2D
 * context swallows every call, so the texture comes out blank in tests and
 * the geometry — which is all the tests look at — is identical either way.
 */
export function bakedTexture(size, paint, { repeat = 1, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  paint(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Speckle a flat colour with darker and lighter grain. Used by every surface. */
export function speckle(context, size, base, shades, count, { alpha = [0.2, 0.7], grain = [2, 9] } = {}) {
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  const random = rng(0x5eed1e);
  for (let i = 0; i < count; i++) {
    context.fillStyle = shades[Math.floor(random() * shades.length)];
    context.globalAlpha = between(random, alpha[0], alpha[1]);
    const s = between(random, grain[0], grain[1]);
    context.fillRect(random() * size, random() * size, s, s);
  }
  context.globalAlpha = 1;
}

/**
 * THE SPECIAL MEETING — every texture in the forest, drawn in code.
 *
 * No image files. The rest of the game bakes its surfaces onto canvases
 * (`src/bing/kit.js`, `src/world/textures.js`) and there is no reason for one
 * night in a wood to open an art pipeline.
 *
 * WHAT NIGHT CHANGES ABOUT TEXTURE WORK
 *
 * Almost everything here is seen for a fraction of a second, moving, in a
 * headlight beam, and then never again. So these are tuned for the two things
 * that survive that: VALUE — how bright a surface comes back when a beam hits
 * it — and BREAKUP — whether the beam lands on something with structure in it
 * or on flat paint. Hue barely registers. The dirt is not brown because dirt
 * is brown; it is that value because at forty lux it is the difference between
 * a road and a hole.
 *
 * Everything is tileable, everything is cached by key, and everything is
 * released by `disposeForestTextures()` when the scene goes.
 */

import * as THREE from 'three';

const CACHE = new Map();

function canvas(size) {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  return el;
}

/* A tiny deterministic generator. Textures must be identical run to run: the
 * geometry gate hashes the scene and a road that is speckled differently every
 * load is a road nobody can diff. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(key, build) {
  const hit = CACHE.get(key);
  if (hit) return hit;
  const texture = build();
  texture.name = `specialmeeting.forest.${key}`;
  CACHE.set(key, texture);
  return texture;
}

/**
 * Grainy ground, drawn straight into pixels.
 *
 * `putImageData` rather than a few thousand `fillRect` calls: this is the same
 * work either way on a real canvas and it is the only form the headless DOM
 * stub can carry out at all, which is what lets the whole forest be built in
 * Node for a test or the geometry gate.
 */
function grain(size, seed, base, spread, speckle) {
  const el = canvas(size);
  const ctx = el.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = rng(seed);
  const [br, bg, bb] = base;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      /* Two scales of noise: a coarse blotch that survives being seen from
       * thirty metres, and a per-pixel grit that only reads under the beam. */
      const blotch = Math.sin(x * 0.09 + y * 0.05) * 0.5 + Math.sin(x * 0.031 - y * 0.043) * 0.5;
      const grit = rand() - 0.5;
      const k = 1 + blotch * spread + grit * speckle;
      data[i] = Math.max(0, Math.min(255, br * k));
      data[i + 1] = Math.max(0, Math.min(255, bg * k));
      data[i + 2] = Math.max(0, Math.min(255, bb * k));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The grain on the ground, and only the grain.
 *
 * Near white on purpose: the terrain carries its own colour in vertex colour —
 * mud is not duff is not rock, and that changes every metre — so this texture
 * has to multiply into it without tinting it. A brown detail map over a brown
 * vertex colour is brown twice, which at forty lux is black.
 */
export function groundDetailTexture() {
  return make('ground-detail', () => grain(128, 0x51f0a3, [214, 212, 206], 0.085, 0.26));
}

/** The dirt track: dry grit in the middle, and it takes the ruts' vertex tint. */
export function dirtTexture() {
  return make('dirt', () => grain(128, 0x2c19bb, [104, 88, 66], 0.13, 0.30));
}

/** Tarmac, for the ninety seconds of it there are. */
export function tarmacTexture() {
  return make('tarmac', () => grain(128, 0x77a41d, [40, 41, 44], 0.07, 0.20));
}

/**
 * A soft round card, white on transparent.
 *
 * Used for the fog banks, for the halo round the last streetlights and for the
 * orange thing a long way off through the trees. One texture, three jobs, and
 * the only difference between them is the material it is put on.
 */
export function softCardTexture() {
  return make('softcard', () => {
    const size = 128;
    const el = canvas(size);
    const ctx = el.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const r = Math.hypot(x - half + 0.5, y - half + 0.5) / half;
        /* Squared falloff with a smooth shoulder. A linear one has a visible
         * rim where the card ends, which on a fog bank reads as a saucer. */
        const a = Math.max(0, 1 - r);
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
      }
    }
    ctx.putImageData(img, 0, 0);
    const texture = new THREE.CanvasTexture(el);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

/**
 * One frond, as an alpha cutout.
 *
 * The undergrowth is instanced quads and every quad is this: a spray of
 * leaflets off a central rib, opaque where it is drawn and gone where it is
 * not. Cut with `alphaTest` rather than blended, so several hundred of them
 * can overlap in the headlights without a sort.
 */
export function frondTexture() {
  return make('frond', () => {
    const size = 64;
    const el = canvas(size);
    const ctx = el.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = (x + 0.5) / size - 0.5;      // −0.5 … 0.5 across
        const v = (y + 0.5) / size;            // 0 at the tip, 1 at the base
        /* A tapered blade: wide at the base, nothing at the tip, with the
         * leaflets cut into it by a hard sine across the rib. */
        const taper = Math.pow(v, 0.72) * 0.46;
        const rib = Math.abs(u) < 0.035;
        const leaflet = Math.abs(Math.sin((v * 26) + (u > 0 ? 0.9 : 0))) > 0.34;
        const inside = Math.abs(u) < taper && (rib || leaflet);
        const shade = 0.62 + v * 0.38;
        data[i] = Math.round(46 * shade);
        data[i + 1] = Math.round(74 * shade);
        data[i + 2] = Math.round(38 * shade);
        data[i + 3] = inside ? 255 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    const texture = new THREE.CanvasTexture(el);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

/** Give a texture its own tiling without touching the cached original. */
export function tiled(texture, repeatX, repeatY = repeatX) {
  const copy = texture.clone();
  copy.needsUpdate = true;
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
  copy.repeat.set(repeatX, repeatY);
  return copy;
}

/**
 * Release every texture this module has handed out.
 *
 * Canvas textures live on the GPU until something disposes them, and the
 * forest is loaded and torn down as one scene, so the whole cache goes at
 * once. Clones handed out by `tiled()` belong to whoever asked for them and
 * are disposed with the material they are on.
 */
export function disposeForestTextures() {
  for (const texture of CACHE.values()) texture.dispose?.();
  CACHE.clear();
}

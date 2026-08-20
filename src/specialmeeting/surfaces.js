/**
 * The four or five textures this block needs and nowhere else has.
 *
 * Everything with WORDS on it goes through the Bing's kit — `printed()` and
 * `neonText()` are already the way a sign is made in this game and a second
 * way to letter a shopfront would be a second way for it to look wrong. Brick
 * and asphalt come from there too. What is left is the handful of surfaces a
 * night street has that a nightclub does not: pavement slabs, a rolled
 * shutter, a papered-over window, and a curtained window seen from the street.
 *
 * Same rules as src/bing/kit.js and src/world/textures.js: drawn into a canvas
 * at load, never shipped as a file, cached by key so a facade with twenty-four
 * windows in it costs two.
 */
import * as THREE from 'three';

const _cache = new Map();

function canvas(w, h) {
  const element = document.createElement('canvas');
  element.width = w;
  element.height = h;
  return element;
}

function finish(element, { repeat = [1, 1], aniso = 8 } = {}) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = aniso;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cached(key, build) {
  if (!_cache.has(key)) _cache.set(key, build());
  return _cache.get(key);
}

/**
 * Deterministic noise.
 *
 * Every scatter in this block is seeded. A pavement that re-stains itself on
 * reload is a pavement nobody can learn, and the geometry gate cannot compare
 * two runs of a scene that shuffles.
 */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
}

/** Poured slabs, jointed every metre or so, patched and stained. */
export function pavement() {
  return cached('sm.pavement', () => {
    const S = 512;
    const element = canvas(S, S);
    const ctx = element.getContext('2d');
    const rnd = seeded(0x51d3a7);
    ctx.fillStyle = '#41424a';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const shade = ['#4a4b53', '#3a3b43', '#4f5058', '#35363d'][(rnd() * 4) | 0];
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.25 + rnd() * 0.4;
      ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 7, 2 + rnd() * 7);
    }
    ctx.globalAlpha = 1;
    // Slab joints: four across, four down, deliberately not quite square.
    ctx.strokeStyle = '#26272c';
    ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (S / 4), 0);
      ctx.lineTo(i * (S / 4) + (rnd() - 0.5) * 4, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * (S / 4));
      ctx.lineTo(S, i * (S / 4) + (rnd() - 0.5) * 4);
      ctx.stroke();
    }
    // Old chewing gum and a tar patch, because a clean pavement is a car park.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = 'rgba(20,20,24,0.5)';
      ctx.beginPath();
      ctx.arc(rnd() * S, rnd() * S, 2 + rnd() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(element, { repeat: [1, 1] });
  });
}

/** A rolled steel shutter, pulled down and staying down. */
export function shutter(hex = '#3c3f45') {
  return cached(`sm.shutter.${hex}`, () => {
    const S = 256;
    const element = canvas(S, S);
    const ctx = element.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(0, y, S, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y + 4, S, 2);
    }
    const rnd = seeded(0x2f77b1);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = 'rgba(90,60,40,0.28)';
      ctx.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 14, 2 + rnd() * 5);
    }
    return finish(element, { repeat: [1, 1] });
  });
}

/** Shop glass papered over from the inside, with the tape showing. */
export function paperedGlass() {
  return cached('sm.papered-glass', () => {
    const element = canvas(256, 256);
    const ctx = element.getContext('2d');
    ctx.fillStyle = '#6a5a44';
    ctx.fillRect(0, 0, 256, 256);
    const rnd = seeded(0x7a1c04);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(rnd() * 256, rnd() * 256, 6 + rnd() * 22, 4 + rnd() * 12);
    }
    // Sheets, and the tape holding them up.
    ctx.strokeStyle = 'rgba(30,26,20,0.55)';
    ctx.lineWidth = 2;
    for (const x of [86, 170]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(220,214,196,0.5)';
    for (const [x, y] of [[80, 24], [164, 24], [80, 226], [164, 226]]) {
      ctx.fillRect(x, y, 14, 8);
    }
    return finish(element, { repeat: [1, 1] });
  });
}

/**
 * A window from the street: dark glass, a frame, and either a curtain with a
 * light behind it or nothing at all.
 *
 * Returned as `{ map, emissive }` so the same drawing can be the colour and
 * the glow — the trick the Silver Room's skyline uses, and the reason
 * twenty-four windows cost one material instead of twenty-four lights.
 */
export function curtainedWindow(alight = false) {
  return cached(`sm.window.${alight ? 'lit' : 'dark'}`, () => {
    const W = 64;
    const H = 96;
    const face = canvas(W, H);
    const glow = canvas(W, H);
    const fg = face.getContext('2d');
    const gg = glow.getContext('2d');
    fg.fillStyle = '#0d0f14';
    fg.fillRect(0, 0, W, H);
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, W, H);
    if (alight) {
      // A drawn curtain, warm, with the gap down the middle that always exists.
      fg.fillStyle = '#b98f52';
      fg.fillRect(4, 4, W - 8, H - 8);
      gg.fillStyle = '#c69453';
      gg.fillRect(4, 4, W - 8, H - 8);
      fg.fillStyle = '#e8c07a';
      fg.fillRect(W / 2 - 3, 4, 6, H - 8);
      gg.fillStyle = '#ffd79a';
      gg.fillRect(W / 2 - 3, 4, 6, H - 8);
    }
    // Frame and glazing bars, on both, so the lit ones keep their divisions.
    for (const ctx of [fg, gg]) {
      ctx.fillStyle = ctx === fg ? '#23252c' : '#000';
      ctx.fillRect(0, 0, W, 5);
      ctx.fillRect(0, H - 5, W, 5);
      ctx.fillRect(0, 0, 5, H);
      ctx.fillRect(W - 5, 0, 5, H);
      ctx.fillRect(0, H / 2 - 2, W, 4);
    }
    return {
      map: finish(face, { repeat: [1, 1] }),
      emissive: finish(glow, { repeat: [1, 1] }),
    };
  });
}

/** Drop everything this module is holding. For a scene teardown. */
export function disposeSurfaceCache() {
  for (const entry of _cache.values()) {
    if (entry?.isTexture) entry.dispose();
    else if (entry?.map) {
      entry.map.dispose();
      entry.emissive?.dispose();
    }
  }
  _cache.clear();
}

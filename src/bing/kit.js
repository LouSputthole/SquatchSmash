/**
 * Textures and small builders that only the Bing needs.
 *
 * Same rules as src/world/textures.js -- everything is drawn into a canvas at
 * load time, nothing ships as a file, and every texture is cached by key so a
 * room full of the same wall costs one.
 */
import * as THREE from 'three';
import { mat, box } from '../world/build.js';

const _cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { repeat = [1, 1], aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cached(key, build) {
  if (!_cache.has(key)) _cache.set(key, build());
  return _cache.get(key);
}

export function rand(a, b) { return a + Math.random() * (b - a); }
export function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** Black and burgundy patterned carpet, worn along the lines people walk. */
export function clubCarpet() {
  return cached('bing.carpet', () => {
    const S = 512;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#241019';
    g.fillRect(0, 0, S, S);
    // The pattern: interlocking burgundy scrollwork, badly registered
    g.strokeStyle = '#5c1d2e';
    g.lineWidth = 9;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cx = x * 128 + 64;
        const cy = y * 128 + 64;
        g.beginPath();
        g.arc(cx, cy, 40, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(cx, cy, 17, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = (x + y) % 2 ? '#3d1320' : '#5c1d2e';
      }
    }
    g.globalAlpha = 0.5;
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = pick(['#1a0b12', '#2e1420', '#3a1826', '#150910']);
      g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 9, 3 + Math.random() * 7);
    }
    g.globalAlpha = 1;
    return finish(c, { repeat: [1, 1] });
  });
}

/** Wet asphalt: patched, cracked, and holding half the neon in town. */
export function asphalt() {
  return cached('bing.asphalt', () => {
    const S = 512;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#17171c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = pick(['#202027', '#12121a', '#26262f', '#1a1a20']);
      g.globalAlpha = 0.3 + Math.random() * 0.5;
      g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    g.globalAlpha = 1;
    // Tar seams where the lot has been patched over the years
    g.strokeStyle = '#0d0d12';
    g.lineWidth = 5;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      let x = Math.random() * S;
      let y = 0;
      g.moveTo(x, y);
      while (y < S) {
        y += 30;
        x += (Math.random() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Aging brick, painted over once and regretted. */
export function brick(hex = '#4a2a26') {
  return cached(`bing.brick${hex}`, () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#2a1a18';
    g.fillRect(0, 0, S, S);
    const base = new THREE.Color(hex);
    for (let row = 0; row < 16; row++) {
      for (let col = -1; col < 9; col++) {
        const shade = 0.75 + Math.random() * 0.5;
        const cc = base.clone().multiplyScalar(shade);
        g.fillStyle = `#${cc.getHexString()}`;
        const off = row % 2 ? 16 : 0;
        g.fillRect(col * 32 + off + 1, row * 16 + 1, 30, 14);
      }
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Scuffed wood panelling for the back of house. */
export function panelling(hex = '#4a3122') {
  return cached(`bing.panel${hex}`, () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.12})`;
      g.fillRect(i * 32, 0, 3, S);
      g.fillStyle = `rgba(255,220,180,${0.03 + Math.random() * 0.04})`;
      g.fillRect(i * 32 + 4, 0, 24, S);
    }
    // Cart scuffs along the bottom, where the crates go past
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let i = 0; i < 40; i++) {
      g.fillRect(Math.random() * S, 200 + Math.random() * 50, 10 + Math.random() * 40, 2);
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Cheap chequer tile for the hallway, the bathroom and the store room. */
export function backTile() {
  return cached('bing.tile', () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 4; col++) {
        g.fillStyle = (r + col) % 2 ? '#26262e' : '#1b1b22';
        g.fillRect(col * 64, r * 64, 64, 64);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(col * 64, r * 64, 64, 2);
        g.fillRect(col * 64, r * 64, 2, 64);
      }
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${180 + Math.random() * 60},${170 + Math.random() * 60},${160 + Math.random() * 60},.05)`;
      g.fillRect(Math.random() * S, Math.random() * S, 4, 4);
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Green felt for the blackjack table, with the house rules printed on it. */
export function felt() {
  return cached('bing.felt', () => {
    const S = 512;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#14512e';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    g.strokeStyle = '#d9c37a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S * 0.86, S * 0.42, Math.PI, 0);
    g.stroke();
    g.fillStyle = '#d9c37a';
    g.font = '600 30px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('BLACKJACK PAYS 3 TO 2', S / 2, S * 0.44);
    g.font = '600 20px Georgia, serif';
    g.fillText('dealer must draw to 16 and stand on all 17s', S / 2, S * 0.52);
    return finish(c);
  });
}

/* ------------------------------------------------------------------ */
/* Printed things                                                      */
/* ------------------------------------------------------------------ */

/**
 * Anything with words on it: signs, plates, permits, the newspaper.
 * @param {string} key cache key
 * @param {string[]} lines
 */
export function printed(key, lines, opts = {}) {
  const {
    w = 512, h = 256, bg = '#160c1e', fg = '#ffd75e',
    font = '900 64px "Trebuchet MS", sans-serif', border = null, rotate = 0,
    align = 'center', lineHeight = null,
  } = opts;
  return cached(`bing.print.${key}`, () => {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    } else {
      g.clearRect(0, 0, w, h);
    }
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 8;
      g.strokeRect(5, 5, w - 10, h - 10);
    }
    g.save();
    if (rotate) {
      g.translate(w / 2, h / 2);
      g.rotate(rotate);
      g.translate(-w / 2, -h / 2);
    }
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = align;
    g.textBaseline = 'middle';
    const x = align === 'center' ? w / 2 : 22;
    const step = lineHeight ?? h / (lines.length + 1);
    const top = lineHeight ? (h - step * (lines.length - 1)) / 2 : step;
    lines.forEach((line, i) => g.fillText(line, x, top + step * i));
    g.restore();
    return finish(c);
  });
}

/** A texture with an alpha hole around the letters, for neon on a dark board. */
export function neonText(key, text, colour = '#ff3d8b', opts = {}) {
  const { w = 1024, h = 256, font = '900 150px "Trebuchet MS", sans-serif' } = opts;
  return cached(`bing.neon.${key}`, () => {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = colour;
    g.shadowBlur = 34;
    g.fillStyle = colour;
    g.fillText(text, w / 2, h / 2);
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 0;
    g.fillStyle = '#fff6fb';
    g.font = font.replace(/^900/, '700');
    g.fillText(text, w / 2, h / 2);
    return finish(c);
  });
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

/** An unlit, glowing panel -- neon, screens, exit signs, light strips. */
export function lit(colour, intensity = 2.2) {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(colour),
    emissiveIntensity: intensity,
    roughness: 1,
    toneMapped: true,
  });
}

/** A flat quad with a texture on it, hung on a wall. */
export function sign(texture, w, h, { x, y, z, rotY = 0, emissive = null, intensity = 1.6 }) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    emissive
      ? new THREE.MeshStandardMaterial({
        map: texture, emissiveMap: texture, emissive: new THREE.Color(emissive),
        emissiveIntensity: intensity, transparent: true, roughness: 1,
      })
      : mat({ map: texture, roughness: 0.9 }),
  );
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  return m;
}

/** Box with a texture map, for walls and floors that want one. */
export function texBox(texture, size, pos, opts = {}) {
  return box({
    size, pos, mat: mat({ map: texture, roughness: opts.roughness ?? 0.94, ...(opts.matOpts || {}) }), ...opts,
  });
}

/** Repeat helper: textures are cached and shared, so clone before retiling. */
export function tiled(texture, rx, ry) {
  const t = texture.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

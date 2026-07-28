/**
 * Procedural textures.
 *
 * Everything the apartment is made of is drawn at runtime into 2D canvases, so
 * the game ships with zero binary art dependencies. Player-supplied images
 * (squatch gear photos) are loaded separately -- see world/gear.js.
 */
import * as THREE from 'three';

const _cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Deterministic value noise so textures look the same across reloads. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(canvas, { repeat = [1, 1], aniso = 8, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Sprinkle fine grain over whatever is already on the context. */
function grain(ctx, w, h, amount, seed = 1) {
  const rnd = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function cached(key, build) {
  if (!_cache.has(key)) _cache.set(key, build());
  return _cache.get(key);
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** Scuffed hardwood planks. One tile = 1m x 1m of floor. */
export function woodFloor() {
  return cached('woodFloor', () => {
    const S = 512;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    const rnd = mulberry32(7);

    g.fillStyle = '#6b4a2f';
    g.fillRect(0, 0, S, S);

    const plankH = S / 6;
    for (let row = 0; row < 6; row++) {
      const y = row * plankH;
      // Stagger the seams row to row.
      const offset = (row % 2 ? S * 0.5 : 0) + rnd() * 40;
      for (let seg = -1; seg < 3; seg++) {
        const x = offset + seg * (S * 0.75);
        const w = S * 0.75 - 2;
        const shade = 0.78 + rnd() * 0.42;
        const r = Math.round(122 * shade);
        const gg = Math.round(84 * shade);
        const b = Math.round(52 * shade);
        g.fillStyle = `rgb(${r},${gg},${b})`;
        g.fillRect(x, y + 1, w, plankH - 2);

        // Grain lines.
        g.strokeStyle = `rgba(50,32,18,${0.10 + rnd() * 0.16})`;
        g.lineWidth = 1;
        for (let k = 0; k < 9; k++) {
          const ly = y + 3 + rnd() * (plankH - 6);
          g.beginPath();
          g.moveTo(x, ly);
          for (let px = 0; px <= w; px += 16) {
            g.lineTo(x + px, ly + Math.sin((px + row * 30) * 0.05) * 1.6);
          }
          g.stroke();
        }
      }
      // Seam shadow.
      g.fillStyle = 'rgba(28,16,8,.55)';
      g.fillRect(0, y, S, 2);
    }
    grain(g, S, S, 22, 3);
    return finish(c, { repeat: [1, 1] });
  });
}

/** Rented-apartment eggshell paint with roller texture. */
export function wallPaint(hex = '#cbbfa8') {
  return cached('wall' + hex, () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(21);
    // Faint roller stipple.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    grain(g, S, S, 9, 5);
    return finish(c, { repeat: [1, 1] });
  });
}

/** Popcorn-ish ceiling. */
export function ceilingTex() {
  return cached('ceiling', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#ddd6c6';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(33);
    for (let i = 0; i < 5000; i++) {
      const a = rnd();
      g.fillStyle = a > 0.5 ? `rgba(255,255,255,${a * 0.35})` : `rgba(150,142,128,${a * 0.3})`;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, rnd() * 2.2, 0, 7);
      g.fill();
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Kitchen splashback / bathroom tile. */
export function tileTex(size = 8, grout = '#8d8577', face = '#e2ded2') {
  return cached(`tile${size}${grout}${face}`, () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = grout;
    g.fillRect(0, 0, S, S);
    const step = S / size;
    const rnd = mulberry32(11);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = 0.92 + rnd() * 0.14;
        g.fillStyle = shade(face, v);
        g.fillRect(x * step + 1.5, y * step + 1.5, step - 3, step - 3);
      }
    }
    grain(g, S, S, 8, 9);
    return finish(c, { repeat: [1, 1] });
  });
}

/** Woven upholstery for the couch / bed. */
export function fabricTex(hex = '#4a5a52') {
  return cached('fabric' + hex, () => {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.07;
    for (let i = 0; i < S; i += 2) {
      g.fillStyle = '#000';
      g.fillRect(i, 0, 1, S);
      g.fillStyle = '#fff';
      g.fillRect(0, i, S, 1);
    }
    g.globalAlpha = 1;
    grain(g, S, S, 10, 13);
    // Repeated hard so the weave stays fine-grained on large upholstery.
    return finish(c, { repeat: [6, 6] });
  });
}

/** Shaggy area rug with a woven border. */
export function rugTex() {
  return cached('rug', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#8a4d42';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#c99a63';
    g.lineWidth = 8;
    g.strokeRect(14, 14, S - 28, S - 28);
    g.strokeStyle = '#59403a';
    g.lineWidth = 3;
    g.strokeRect(26, 26, S - 52, S - 52);
    // Diamond motif.
    g.strokeStyle = 'rgba(226,192,140,.6)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const cx = 64 + (i % 2) * 128;
      const cy = 64 + Math.floor(i / 2) * 128;
      g.beginPath();
      g.moveTo(cx, cy - 22);
      g.lineTo(cx + 22, cy);
      g.lineTo(cx, cy + 22);
      g.lineTo(cx - 22, cy);
      g.closePath();
      g.stroke();
    }
    grain(g, S, S, 18, 17);
    return finish(c, { repeat: [1, 1] });
  });
}

/** Brushed stainless for the fridge and appliances. */
export function brushedMetal(hex = '#b9bcc0') {
  return cached('metal' + hex, () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(41);
    for (let i = 0; i < 1800; i++) {
      const y = rnd() * S;
      g.strokeStyle = `rgba(255,255,255,${rnd() * 0.12})`;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y + (rnd() - 0.5) * 2);
      g.stroke();
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Laminate counter / desk top. */
export function laminate(hex = '#2b2622') {
  return cached('lam' + hex, () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = hex;
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(53);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.07})`;
      g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 14, 1);
    }
    grain(g, S, S, 10, 19);
    return finish(c, { repeat: [1, 1] });
  });
}

/** Pre-dawn city seen through the window. */
export function citySkyline() {
  return cached('skyline', () => {
    const W = 1024;
    const H = 512;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#16213c');
    sky.addColorStop(0.45, '#3c3352');
    sky.addColorStop(0.72, '#9a5f4c');
    sky.addColorStop(1, '#e2a25e');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const rnd = mulberry32(1337);
    // Stars, fading out toward the horizon.
    for (let i = 0; i < 200; i++) {
      const y = rnd() * H * 0.45;
      g.fillStyle = `rgba(255,255,255,${(1 - y / (H * 0.45)) * rnd() * 0.8})`;
      g.fillRect(rnd() * W, y, 1.5, 1.5);
    }

    // Distant haze layer, then near buildings.
    const layers = [
      { base: H * 0.80, hMin: 40, hMax: 130, w: 70, col: '#2a2740', lit: 0.10 },
      { base: H * 0.90, hMin: 70, hMax: 220, w: 90, col: '#1b1a2c', lit: 0.30 },
      { base: H * 1.02, hMin: 110, hMax: 300, w: 120, col: '#0e0e19', lit: 0.55 },
    ];
    for (const L of layers) {
      let x = -40;
      while (x < W + 40) {
        const bw = L.w * (0.5 + rnd());
        const bh = L.hMin + rnd() * (L.hMax - L.hMin);
        g.fillStyle = L.col;
        g.fillRect(x, L.base - bh, bw, bh + 40);
        // Lit windows.
        for (let wy = L.base - bh + 8; wy < L.base - 8; wy += 12) {
          for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
            if (rnd() < L.lit) {
              g.fillStyle = rnd() < 0.75 ? 'rgba(255,206,120,.85)' : 'rgba(150,200,255,.6)';
              g.fillRect(wx, wy, 5, 6);
            }
          }
        }
        x += bw + 4 + rnd() * 16;
      }
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Framed poster stand-in used until the player drops real art in assets/art/. */
export function posterPlaceholder(title, subtitle, hue = 28) {
  return cached(`poster${title}${hue}`, () => {
    const W = 512;
    const H = 640;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${hue},32%,22%)`);
    bg.addColorStop(1, `hsl(${hue + 18},40%,10%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Big moon behind the subject.
    g.fillStyle = `hsla(${hue + 30},70%,72%,.22)`;
    g.beginPath();
    g.arc(W / 2, H * 0.40, 150, 0, 7);
    g.fill();

    drawSquatchSilhouette(g, W / 2, H * 0.60, 250, 'rgba(12,10,9,.92)');

    // Treeline.
    g.fillStyle = 'rgba(8,10,8,.9)';
    const rnd = mulberry32(title.length * 91 + hue);
    for (let x = -20; x < W + 20; x += 26) {
      const th = 70 + rnd() * 110;
      g.beginPath();
      g.moveTo(x, H * 0.72);
      g.lineTo(x + 13, H * 0.72 - th);
      g.lineTo(x + 26, H * 0.72);
      g.closePath();
      g.fill();
    }
    g.fillRect(0, H * 0.71, W, H);

    g.textAlign = 'center';
    g.fillStyle = '#f3e7cd';
    g.font = 'bold 54px "Courier New", monospace';
    g.fillText(title.toUpperCase(), W / 2, H * 0.855);
    g.font = '22px "Courier New", monospace';
    g.fillStyle = `hsl(${hue + 20},60%,66%)`;
    g.fillText(subtitle, W / 2, H * 0.905);

    g.strokeStyle = 'rgba(243,231,205,.28)';
    g.lineWidth = 4;
    g.strokeRect(16, 16, W - 32, H - 32);

    grain(g, W, H, 16, 23);
    return finish(c, { repeat: [1, 1] });
  });
}

/** Shared silhouette used by posters, the arcade game and the PC wallpaper. */
export function drawSquatchSilhouette(g, cx, baseY, height, fill) {
  const u = height / 100;
  g.fillStyle = fill;
  g.beginPath();
  // Legs.
  g.moveTo(cx - 22 * u * 0.5, baseY);
  g.lineTo(cx - 20 * u * 0.5, baseY - 34 * u * 0.5);
  g.lineTo(cx + 20 * u * 0.5, baseY - 34 * u * 0.5);
  g.lineTo(cx + 22 * u * 0.5, baseY);
  g.closePath();
  g.fill();
  // Torso.
  g.beginPath();
  g.ellipse(cx, baseY - 52 * u * 0.5, 30 * u * 0.5, 40 * u * 0.5, 0, 0, 7);
  g.fill();
  // Shoulders + arms.
  g.beginPath();
  g.ellipse(cx - 34 * u * 0.5, baseY - 60 * u * 0.5, 11 * u * 0.5, 32 * u * 0.5, 0.24, 0, 7);
  g.fill();
  g.beginPath();
  g.ellipse(cx + 34 * u * 0.5, baseY - 60 * u * 0.5, 11 * u * 0.5, 32 * u * 0.5, -0.24, 0, 7);
  g.fill();
  // Head, sitting low on the shoulders.
  g.beginPath();
  g.ellipse(cx, baseY - 96 * u * 0.5, 17 * u * 0.5, 19 * u * 0.5, 0, 0, 7);
  g.fill();
  // Brow ridge.
  g.beginPath();
  g.ellipse(cx, baseY - 104 * u * 0.5, 18 * u * 0.5, 7 * u * 0.5, 0, 0, 7);
  g.fill();
}

/**
 * A small equirectangular environment for the metals to reflect.
 *
 * Without this every `metalness: 1` surface samples nothing and renders
 * black -- which is why chrome taps and handles looked like charcoal. This is
 * a cheap stand-in for a real room capture: bright ceiling, mid walls, dark
 * floor, plus a warm patch where the window is.
 */
export function roomEnvironment() {
  return cached('env', () => {
    const W = 512;
    const H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');

    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#e8eaf0');   // ceiling
    grad.addColorStop(0.42, '#a9a89f');
    grad.addColorStop(0.55, '#7a7871');
    grad.addColorStop(1.00, '#2b2621');   // floor
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Warm window, and a cool one opposite, so reflections have some shape.
    const warm = g.createRadialGradient(W * 0.72, H * 0.44, 0, W * 0.72, H * 0.44, W * 0.16);
    warm.addColorStop(0, 'rgba(255,214,160,0.95)');
    warm.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = warm;
    g.fillRect(0, 0, W, H);

    const cool = g.createRadialGradient(W * 0.22, H * 0.38, 0, W * 0.22, H * 0.38, W * 0.13);
    cool.addColorStop(0, 'rgba(190,215,255,0.55)');
    cool.addColorStop(1, 'rgba(190,215,255,0)');
    g.fillStyle = cool;
    g.fillRect(0, 0, W, H);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Multiply a hex colour by a scalar, clamped. */
export function shade(hex, mul) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * mul));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * mul));
  const b = Math.min(255, Math.round((n & 255) * mul));
  return `rgb(${r},${g},${b})`;
}

export function disposeTextureCache() {
  for (const tex of _cache.values()) tex.dispose?.();
  _cache.clear();
}

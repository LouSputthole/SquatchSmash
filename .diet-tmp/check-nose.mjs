/* Validate a decoded nose-art raw RGBA buffer against livery.js runtime
 * expectations: border must read cleared (borderIsOpaque false), and for the
 * name, no cleared pixel may carry a yellow cast the runtime recoverGlow
 * would lift above its alpha>8 solid line. Also reports the alpha>24 ink
 * bbox so pre/post trim geometry can be compared. */
import fs from 'node:fs';

const [file, w, h] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const px = fs.readFileSync(file);
if (px.length !== W * H * 4) throw new Error(`raw size ${px.length} != ${W * H * 4}`);

let opaque = 0, nprobe = 0;
const look = (x, y) => { nprobe++; if (px[(y * W + x) * 4 + 3] > 200) opaque++; };
const step = Math.max(1, Math.floor(Math.min(W, H) / 64));
for (let x = 0; x < W; x += step) { look(x, 0); look(x, H - 1); }
for (let y = 0; y < H; y += step) { look(0, y); look(W - 1, y); }

let spurious = 0, spuriousMax = 0, cleared = 0;
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    const a = px[p + 3];
    if (a > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (a > 8) continue;
    cleared++;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const warm = Math.min(r, g);
    if (warm <= b) continue;
    const cast = (warm - b) / Math.max(1, warm);
    const t = Math.min(1, Math.max(0, (cast - 0.08) / 0.42));
    const alpha = Math.round(150 * t * t);
    if (alpha > 8) { spurious++; if (alpha > spuriousMax) spuriousMax = alpha; }
  }
}
console.log(JSON.stringify({
  borderOpaqueFraction: +(opaque / nprobe).toFixed(3),
  clearedPx: cleared,
  spuriousGlowPx: spurious,
  spuriousGlowMaxAlpha: spuriousMax,
  inkBBox: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
}));

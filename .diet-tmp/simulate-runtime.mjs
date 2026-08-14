/* Simulate livery.js prepareArt's recoverGlow on a decoded raw RGBA buffer,
 * then composite the result over a flat aluminium grey so the halo the
 * player would actually see can be compared between encodings. */
import fs from 'node:fs';

const [inFile, outFile, w, h] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const px = fs.readFileSync(inFile);
const n = W * H;

// recoverGlow, verbatim from livery.js.
for (let i = 0; i < n; i++) {
  const p = i * 4;
  if (px[p + 3] > 8) continue;
  const r = px[p], g = px[p + 1], b = px[p + 2];
  const warm = Math.min(r, g);
  if (warm <= b) continue;
  const cast = (warm - b) / Math.max(1, warm);
  const t = Math.min(1, Math.max(0, (cast - 0.08) / 0.42));
  if (t <= 0) continue;
  px[p + 3] = Math.round(150 * t * t);
  const lift = 0.55 + 0.45 * t;
  px[p] = Math.min(255, Math.round(248 * lift));
  px[p + 1] = Math.min(255, Math.round(198 * lift));
  px[p + 2] = Math.min(255, Math.round(60 * lift));
}

// Composite over aluminium.
const out = Buffer.alloc(n * 4);
const [br, bg, bb] = [136, 140, 148];
for (let i = 0; i < n; i++) {
  const p = i * 4;
  const a = px[p + 3] / 255;
  out[p] = Math.round(px[p] * a + br * (1 - a));
  out[p + 1] = Math.round(px[p + 1] * a + bg * (1 - a));
  out[p + 2] = Math.round(px[p + 2] * a + bb * (1 - a));
  out[p + 3] = 255;
}
fs.writeFileSync(outFile, out);

/* Bake recoverGlow with quantized output so PNG can actually compress it.
 * Input: raw RGBA that ALREADY went through bake+flatten (so cleared px are
 * flat field, glow px carry recoverGlow's own alpha/RGB). This pass:
 *   - quantizes glow alpha (9..150) to steps of Q,
 *   - recomputes the repaint RGB from the quantized alpha's implied t so the
 *     colour ladder matches the alpha ladder (fewer distinct RGBA tuples),
 *   - leaves alpha 0 field and alpha>150 source ink untouched
 *     (opaque lettering keeps its full grain).
 */
import fs from 'node:fs';

const [file, w, h, qArg] = process.argv.slice(2);
const W = Number(w), H = Number(h), Q = Number(qArg) || 6;
const px = fs.readFileSync(file);
if (px.length !== W * H * 4) throw new Error(`raw size ${px.length} != ${W * H * 4}`);
const n = W * H;
let quantized = 0;
for (let i = 0; i < n; i++) {
  const p = i * 4;
  const a = px[p + 3];
  if (a <= 8 || a > 150) continue; // field or real ink
  const qa = Math.min(150, Math.round(a / Q) * Q);
  if (qa <= 8) { px[p] = 88; px[p + 1] = 88; px[p + 2] = 102; px[p + 3] = 0; quantized++; continue; }
  const t = Math.sqrt(qa / 150);
  const lift = 0.55 + 0.45 * t;
  px[p] = Math.min(255, Math.round(248 * lift));
  px[p + 1] = Math.min(255, Math.round(198 * lift));
  px[p + 2] = Math.min(255, Math.round(60 * lift));
  px[p + 3] = qa;
  quantized++;
}
console.log(`quantized ${quantized} glow px to alpha step ${Q}`);
fs.writeFileSync(file, px);

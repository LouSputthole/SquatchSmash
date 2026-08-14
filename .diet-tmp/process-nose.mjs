/* Pre-bake enola nose-art PNGs for the asset diet.
 *
 * Mirrors src/enolasquatch/livery.js prepareArt() semantics:
 *  - pinup: RGB under alpha<=8 is never read at runtime (no glow recovery;
 *    bleedEdges overwrites the 6px ring from opaque neighbours), so flatten
 *    it to the field's own average colour -> the PNG stops paying for noise
 *    nobody can ever see.
 *  - name: recoverGlow() reads cleared pixels' RGB looking for a yellow cast.
 *    Bake that exact formula here (same thresholds, same repaint, maxAlpha
 *    150) for every cleared pixel whose recovered alpha lands above the
 *    runtime's own alpha>8 "solid" line, leave borderline pixels untouched,
 *    and flatten the provably-neutral remainder to flat grey (warm<=b, so the
 *    runtime pass keeps skipping them).
 */
import fs from 'node:fs';

const [mode, file, w, h] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const px = fs.readFileSync(file);
if (px.length !== W * H * 4) throw new Error(`raw size ${px.length} != ${W * H * 4}`);
const n = W * H;

if (mode === 'pinup') {
  // Average colour of the cleared field, so distant mips keep their tint.
  let r = 0, g = 0, b = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (px[p + 3] <= 8) { r += px[p]; g += px[p + 1]; b += px[p + 2]; cnt++; }
  }
  const fr = cnt ? Math.round(r / cnt) : 0;
  const fg = cnt ? Math.round(g / cnt) : 0;
  const fb = cnt ? Math.round(b / cnt) : 0;
  console.log(`pinup field average rgb(${fr},${fg},${fb}) over ${cnt} px`);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (px[p + 3] <= 8) { px[p] = fr; px[p + 1] = fg; px[p + 2] = fb; px[p + 3] = 0; }
  }
} else if (mode === 'name') {
  let baked = 0, left = 0, flattened = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (px[p + 3] > 8) continue;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const warm = Math.min(r, g);
    let alpha = 0;
    if (warm > b) {
      const cast = (warm - b) / Math.max(1, warm);
      const t = Math.min(1, Math.max(0, (cast - 0.08) / 0.42));
      alpha = Math.round(150 * t * t);
      if (alpha > 8) {
        // recoverGlow's own repaint, verbatim.
        const lift = 0.55 + 0.45 * t;
        px[p] = Math.min(255, Math.round(248 * lift));
        px[p + 1] = Math.min(255, Math.round(198 * lift));
        px[p + 2] = Math.min(255, Math.round(60 * lift));
        px[p + 3] = alpha;
        baked++;
        continue;
      }
      /* Fringe pixels (recovered alpha 1..8, i.e. at most 3% opacity) fall
       * below the runtime's own solid line; flattening them costs nothing
       * visible and leaves the stored file with a perfectly neutral field. */
      if (alpha > 0) left++;
    }
    // Neutral or cool: provably field. Flat grey keeps warm<=b, so the
    // runtime recoverGlow still skips it.
    px[p] = 88; px[p + 1] = 88; px[p + 2] = 102; px[p + 3] = 0;
    flattened++;
  }
  console.log(`name: baked ${baked}, left-for-runtime ${left}, flattened ${flattened}`);
} else {
  throw new Error(`unknown mode ${mode}`);
}
fs.writeFileSync(file, px);

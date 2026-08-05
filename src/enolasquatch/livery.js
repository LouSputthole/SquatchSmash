/**
 * The Enola Squatch's markings: the Silver Sasquatches crest, and the owner's
 * own nose art.
 *
 * Owner playtest, 2026-08-04: "Aircraft is nice. Needs Squatch logo." and
 * "Squatch logo on the bomb too."
 *
 * The club's artwork already exists and is already wired into the game:
 * `assets/art/logo-crest.png`, reached through `src/world/gear.js`'s
 * `crest.round` slot — the same file that hangs in the apartment and in Big
 * Uncle Lou's office at the Bing. Nothing here mints a new art slot or a new
 * manifest entry; the composition root (`./main.js`) resolves that existing
 * slot once and hands the texture to `applyCrest()`.
 *
 * Two pieces, because the aeroplane and the payload are both built
 * synchronously at boot while `resolveGear` is a promise:
 *
 *   `crestPlaceholderTexture()` — a drawn crest, on the badge from frame one,
 *      so no surface is ever blank while the file loads (and so the scene
 *      still reads correctly if the file is missing entirely, which is the
 *      same contract `gear.js`'s own FALLBACKS keep).
 *   `applyCrest(meshes, texture)` — swap the drawn one for the real one when
 *      it arrives, preserving each badge's own material settings.
 */
import * as THREE from 'three';
import { drawSquatchSilhouette } from '../world/textures.js';

const PURPLE = '#4a2f8f';
const PURPLE_DEEP = '#2a1a55';
const SILVER = '#c9ccd4';

/**
 * A round club crest: purple field, silver ring, the Squatch Family
 * silhouette, and the club's name curved round the top.
 *
 * @returns {THREE.CanvasTexture}
 */
export function crestPlaceholderTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);

  // Field.
  const field = g.createRadialGradient(256, 210, 40, 256, 256, 250);
  field.addColorStop(0, PURPLE);
  field.addColorStop(1, PURPLE_DEEP);
  g.fillStyle = field;
  g.beginPath();
  g.arc(256, 256, 236, 0, Math.PI * 2);
  g.fill();

  // Two silver rings.
  g.strokeStyle = SILVER;
  g.lineWidth = 14;
  g.beginPath();
  g.arc(256, 256, 232, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(256, 256, 206, 0, Math.PI * 2);
  g.stroke();

  // The family silhouette, mid-field.
  drawSquatchSilhouette(g, 256, 372, 232, SILVER);

  // Curved club name across the top of the ring.
  g.save();
  g.translate(256, 256);
  g.fillStyle = SILVER;
  g.font = '600 40px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const name = 'SILVER SASQUATCHES';
  const step = 0.116;
  let angle = -((name.length - 1) * step) / 2;
  for (const ch of name) {
    g.save();
    g.rotate(angle);
    g.translate(0, -172);
    g.fillText(ch, 0, 0);
    g.restore();
    angle += step;
  }
  g.restore();

  // Motto bar along the bottom.
  g.fillStyle = SILVER;
  g.font = '600 30px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EST. 2021', 256, 424);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Put the real crest on badges that are currently wearing the drawn one.
 *
 * @param {THREE.Mesh[]} meshes badge planes built with their own material
 * @param {?THREE.Texture} texture from `resolveGear('crest.round')`
 * @returns {number} how many badges were repainted
 */
export function applyCrest(meshes, texture) {
  if (!texture || !meshes?.length) return 0;
  let n = 0;
  for (const m of meshes) {
    if (!m?.material) continue;
    /* The equality guard makes this idempotent, which `applyNoseArt()` promises
     * and the old code could not keep: without it, a second call with the SAME
     * texture disposes that texture and then assigns the disposed one back. The
     * badges never hit it because the composition root calls once, but the nose
     * art is reachable from the console helper too. */
    if (m.material.map !== texture) {
      // The drawn crest is this badge's own canvas — dispose it, or a scene
      // that reloads the aeroplane leaks one 512x512 texture per badge.
      m.material.map?.dispose?.();
      m.material.map = texture;
      m.material.needsUpdate = true;
    }
    n++;
  }
  return n;
}

/* ================================================================== */
/* The owner's nose art.                                              */
/* ================================================================== */

/**
 * Owner, 2026-08-05: "I want both of these on the Enola Squatch. They should
 * be close together but not touching."
 *
 * Two paintings, delivered as 1024x1536 portrait PNGs:
 *
 *   enola-squatch-nose-art.png    the pin-up — olive halter and shorts, red
 *                                 heels, dog tags, a stein in one hand and a
 *                                 lit joint in the other, ENOLA SQUATCH on the
 *                                 garrison cap. Painted on a warm brown
 *                                 vignette.
 *   enola-squatch-nose-name.png   ENOLA SQUATCH in arched yellow block capitals
 *                                 with a dark outline and a glow, on grey.
 *
 * WHAT THE PIXELS ACTUALLY SAY (measured, not assumed — see
 * `docs/validation/2026-08-05/nose-art/`). Both files were briefed as having
 * opaque backgrounds needing a chroma key. They do not: both are colour type 6
 * RGBA and both already carry a clean matte. Sampled on a 2-px grid the pin-up
 * is 40.0% fully opaque / 58.7% fully clear with 1.3% in the antialiased edge,
 * and the lettering 14.9% / 84.8% / 0.3%. Every one of the eight border probes
 * on both files reads alpha 0.
 *
 * That matters, because a chroma key on the pin-up would have destroyed it.
 * The vignette it is painted on is the same warm brown as the model's skin —
 * the glow behind her head samples rgb(250,171,79) and her thigh samples
 * rgb(247,172,82). There is no threshold that separates those. The delivered
 * matte is the only thing that does, and the job here is to respect it, repair
 * it, and trim it — not to re-derive it.
 *
 * So `prepareArt()` does four things at load, once, cached:
 *
 *   1. KEY, but only if it has to, and only where it is safe. `borderIsOpaque()`
 *      looks at the frame. If a re-export ever arrives flattened, the lettering
 *      is keyed off its grey field — that one is safe, and proven so — and the
 *      pin-up is REFUSED rather than mangled. See `keyGreyField()` for the
 *      evidence behind that split.
 *   2. RECOVER THE GLOW (the lettering only). The matte cut the halo away with
 *      the grey, but the RGB under alpha 0 still holds it, and the halo is
 *      what lifts yellow lettering off bare aluminium. Where a cleared pixel's
 *      stored colour is yellow rather than neutral grey, its alpha comes back
 *      in proportion to how yellow it is.
 *   3. BLEED. Cleared pixels keep the background they were painted on — dark
 *      brown at the pin-up's corners, grey at the lettering's. Mipmapping and
 *      anisotropic filtering average RGB across the matte edge regardless of
 *      alpha, so those colours crawl inward and ring the artwork in dirt at
 *      any distance. Pushing the nearest opaque colour outward kills it.
 *   4. TRIM. Both paintings are 2:3 portrait sheets and neither fills its own
 *      sheet. The pin-up's ink is 916x1253 (0.73:1) and the lettering's is
 *      838x413 (2.03:1) — the name is barely a quarter of its file's height,
 *      so mapping the sheet rather than the ink would have hung it on the
 *      aeroplane four times too small inside an empty margin.
 *
 * The result is a `CanvasTexture` plus the trimmed ink's real aspect ratio, so
 * the caller can size a plane that neither stretches nor letterboxes it.
 */

const ART_DIR = 'assets/art/';

/** The two files, by the name the caller asks for. */
const NOSE_ART_FILES = {
  pinup: 'enola-squatch-nose-art.png',
  name: 'enola-squatch-nose-name.png',
};

/* Long edge of the finished texture. The pin-up is 1.5 m tall on the fuselage
 * and the closest a player can stand on the walkaround is about a metre and a
 * half, so 768 is around 500 px per metre of paint — comfortably past what the
 * screen can show, and an eighth of the memory of the 1024x1536 source. */
const ART_MAX_EDGE = 768;

/** One prepared texture per file, however many planes ask for it. */
const _artCache = new Map();

/**
 * The owner's nose art, matted, trimmed and cached.
 *
 * @param {'pinup'|'name'} which
 * @returns {Promise<?{texture: THREE.CanvasTexture, aspect: number, keyed: boolean}>}
 *   null when the file is missing, so the caller keeps whatever it was built
 *   with rather than showing a hole.
 */
export function noseArtTexture(which) {
  const file = NOSE_ART_FILES[which];
  if (!file) return Promise.resolve(null);
  if (!_artCache.has(file)) _artCache.set(file, loadArt(file, which));
  return _artCache.get(file);
}

async function loadArt(file, which) {
  const image = await loadImage(ART_DIR + file);
  if (!image) return null;
  try {
    return prepareArt(image, which);
  } catch {
    /* A tainted canvas is the only realistic failure here, and it can only
     * happen if the art is ever served cross-origin. Nothing on the aeroplane
     * should break over it. */
    return null;
  }
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (typeof Image !== 'function') { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Canvas → matte → glow → bleed → trim → texture.
 *
 * Exported for `tests/enolasquatch-nose-art.test.mjs`, which drives it over a
 * real pixel buffer: a delivered-style matte to prove the ink is trimmed to,
 * a flattened lettering to prove the key still works, and a flattened pin-up
 * to prove it is refused rather than mangled.
 *
 * @param {CanvasImageSource & {width:number, height:number}} image
 * @param {'pinup'|'name'} which
 * @returns {?{texture: THREE.CanvasTexture, aspect: number, keyed: boolean}}
 */
export function prepareArt(image, which) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sg = src.getContext('2d', { willReadFrequently: true });
  sg.clearRect(0, 0, w, h);
  sg.drawImage(image, 0, 0);
  const frame = sg.getImageData(0, 0, w, h);
  const px = frame.data;

  const keyed = borderIsOpaque(px, w, h);
  if (keyed) {
    /* Flattened artwork. The lettering can be recovered; the pin-up cannot —
     * see `keyGreyField()`. Refusing is deliberate: the failure the owner asked
     * us to avoid is a painted rectangle stuck on the fuselage, and a key that
     * eats the model is not an improvement on one. */
    if (which !== 'name') {
      console.warn('[livery] nose art arrived with an opaque background and cannot be keyed safely; '
        + 'export enola-squatch-nose-art.png with its alpha channel.');
      return null;
    }
    keyGreyField(px, w, h);
  }
  if (which === 'name') recoverGlow(px, w, h);
  bleedEdges(px, w, h, 6);

  const box = inkBounds(px, w, h);
  if (!box) return null;
  sg.putImageData(frame, 0, 0);

  // Trim to the ink, then down to something the screen can actually use.
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const scale = Math.min(1, ART_MAX_EDGE / Math.max(bw, bh));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(bw * scale));
  out.height = Math.max(1, Math.round(bh * scale));
  const og = out.getContext('2d');
  og.clearRect(0, 0, out.width, out.height);
  og.drawImage(src, box.x0, box.y0, bw, bh, 0, 0, out.width, out.height);

  const texture = new THREE.CanvasTexture(out);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: bw / bh, keyed };
}

/**
 * Did this painting arrive flattened?
 *
 * The two delivered files answer no on every probe. Nothing below runs on
 * them; it is here so that a re-export that loses its alpha does not paste a
 * brown rectangle onto the fuselage, which is the failure the owner's brief
 * was written against.
 */
function borderIsOpaque(px, w, h) {
  let opaque = 0, n = 0;
  const look = (x, y) => { n++; if (px[(y * w + x) * 4 + 3] > 200) opaque++; };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) { look(x, 0); look(x, h - 1); }
  for (let y = 0; y < h; y += step) { look(0, y); look(w - 1, y); }
  return n > 0 && opaque / n > 0.6;
}

/**
 * Key the lettering off its flat grey field.
 *
 * WHY ONLY THE LETTERING. A flood fill from the border, following the gradient
 * so it can walk a vignette, was written first and tried on both. On the
 * lettering it is exact — the grey field is flat, the dark outline round each
 * letter is a large step, and the flood stops dead on it. On the pin-up it is a
 * catastrophe: it goes straight through her, because the flattened vignette and
 * her skin are genuinely the same colour, and what comes back is a few floating
 * limbs and the beer. The rendered proof of both is in
 * `docs/validation/2026-08-05/nose-art/`. So the flood is gone and this is what
 * replaced it, and `prepareArt()` refuses a flattened pin-up outright.
 *
 * The test is saturation, not hue distance. The field is neutral — sampled at
 * the four corners it is rgb(91,90,91), rgb(93,92,92), rgb(86,86,85),
 * rgb(87,86,86), which is grey to within two counts. The ink is either strongly
 * yellow (r and g high, b low) or near-black outline. Both are a long way from
 * neutral mid-grey on one axis or the other, and neither is anywhere near it on
 * both. The two thresholds are ramps rather than steps, so the antialiased rim
 * of every letter comes through as partial alpha instead of a jagged edge.
 *
 * @param {Uint8ClampedArray} px RGBA, modified in place
 */
function keyGreyField(px, w, h) {
  const n = w * h;
  /* The field's own brightness, taken from the frame rather than assumed —
   * a re-export at a different exposure keys just as well. */
  let sum = 0, cnt = 0;
  const sample = (x, y) => { sum += px[(y * w + x) * 4 + 1]; cnt++; };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += step) { sample(0, y); sample(w - 1, y); }
  const field = cnt ? sum / cnt : 90;

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // How far off neutral, 0..1.
    const chroma = mx > 0 ? (mx - mn) / mx : 0;
    // How much darker than the field, 0..1 — this is what keeps the outline.
    const dark = Math.max(0, (field - 26 - mn) / Math.max(1, field - 26));
    const ink = Math.max(
      Math.min(1, Math.max(0, (chroma - 0.14) / 0.26)),
      Math.min(1, Math.max(0, dark * 1.6)),
    );
    px[p + 3] = Math.round(255 * ink);
  }
}

/**
 * Give the lettering its glow back.
 *
 * The delivered matte hugs the letters and their dark outline, so the yellow
 * halo went out with the grey field — the ink's alpha>24 and alpha>200 bounding
 * boxes are the same 838x413 box, which is what "no soft edge survived" looks
 * like in numbers. The colour is still there under alpha 0: the grey field
 * reads neutral at the corners (91,90,91) and picks up a strong yellow cast
 * near the letters (78,71,34 — blue falling away while red and green hold).
 * That cast is the halo, and it is exactly what "key the grey, keep the yellow"
 * means. Alpha comes back in proportion to it, capped well short of opaque so
 * it reads as a glow on the aluminium rather than a second rectangle.
 */
function recoverGlow(px, w, h, maxAlpha = 150) {
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (px[p + 3] > 8) continue;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const warm = Math.min(r, g);
    if (warm <= b) continue;                 // neutral or cool: this is field
    /* How far from grey, as a fraction of the pixel's own brightness. The bare
     * field sits near 0.02; deep in the halo it passes 0.5. */
    const cast = (warm - b) / Math.max(1, warm);
    const t = Math.min(1, Math.max(0, (cast - 0.08) / 0.42));
    if (t <= 0) continue;
    px[p + 3] = Math.round(maxAlpha * t * t);
    /* Repaint it as the glow's own colour rather than tinted grey, or the
     * halo brings the grey field back in with it at low alpha. */
    const lift = 0.55 + 0.45 * t;
    px[p] = Math.min(255, Math.round(248 * lift));
    px[p + 1] = Math.min(255, Math.round(198 * lift));
    px[p + 2] = Math.min(255, Math.round(60 * lift));
  }
}

/**
 * Push opaque colour outward into the cleared region.
 *
 * A cleared pixel still carries whatever it was painted on, and the GPU does
 * not consult alpha when it builds a mip level or takes an anisotropic tap —
 * it averages RGB across the matte edge and hands back a colour that is part
 * artwork and part background. On the pin-up that background is near-black
 * brown, so every mip below the top one draws a dirty outline round the
 * figure, and it gets worse the further away the player stands. Filling the
 * transparent side with the artwork's own edge colour makes the average
 * harmless whichever texels the sampler happens to touch.
 */
function bleedEdges(px, w, h, passes = 6) {
  const n = w * h;
  const solidPx = new Uint8Array(n);
  for (let i = 0; i < n; i++) solidPx[i] = px[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const grown = solidPx.slice();
    let touched = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solidPx[i]) continue;
        let r = 0, g = 0, b = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w || (!dx && !dy)) continue;
            const j = yy * w + xx;
            if (!solidPx[j]) continue;
            const q = j * 4;
            r += px[q]; g += px[q + 1]; b += px[q + 2]; cnt++;
          }
        }
        if (!cnt) continue;
        const p = i * 4;
        px[p] = Math.round(r / cnt);
        px[p + 1] = Math.round(g / cnt);
        px[p + 2] = Math.round(b / cnt);
        grown[i] = 1;                        // colour only — alpha stays put
        touched++;
      }
    }
    if (!touched) break;
    solidPx.set(grown);
  }
}

/**
 * The ink's bounding box.
 *
 * A row or column has to carry a few visible pixels before it counts, so one
 * stray sample in a corner cannot drag the box back out to the full sheet —
 * which on the lettering would be the difference between a name 2.03:1 and a
 * name floating in a 0.67:1 field of nothing.
 */
function inkBounds(px, w, h, alphaFloor = 24) {
  const minRun = Math.max(2, Math.round(Math.min(w, h) * 0.004));
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < alphaFloor) continue;
      row++; cols[x]++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    if (row >= minRun) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0 || y1 < 0) return null;
  // Re-tighten x with the same run rule now that the column counts are in.
  x0 = w; x1 = -1;
  for (let x = 0; x < w; x++) {
    if (cols[x] < minRun) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  if (x1 < 0) return null;
  // One pixel of clear margin, so the trim never clips the feathered edge.
  return {
    x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1),
    x1: Math.min(w - 1, x1 + 1), y1: Math.min(h - 1, y1 + 1),
  };
}

/**
 * The drawn stand-in for the name plate.
 *
 * The same contract `crestPlaceholderTexture()` keeps for the club badges: the
 * aeroplane is never anonymous, not even for the frame and a half before the
 * painting decodes, and it is still named if the file goes missing altogether.
 * Arched yellow capitals with a dark outline, because that is what it is
 * standing in for.
 */
export function noseNamePlaceholderTexture() {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 394;                 // the delivered ink's 2.03:1
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  /* Advance by each glyph's MEASURED width, not by a fixed angular step. A
   * fixed step spaces every letter identically however wide it is, which on
   * "SQUATCH" walked the Q straight through the U. */
  const arc = (text, size, cy, radius) => {
    g.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
    const tracking = size * 0.06;
    const widths = [...text].map((ch) => g.measureText(ch).width + tracking);
    const total = widths.reduce((s, v) => s + v, 0);
    let travelled = -total / 2;
    text.split('').forEach((ch, i) => {
      const angle = (travelled + widths[i] / 2) / radius;
      g.save();
      g.translate(c.width / 2, cy + radius);
      g.rotate(angle);
      g.translate(0, -radius);
      g.lineWidth = size * 0.18;
      g.strokeStyle = '#241d0c';
      g.lineJoin = 'round';
      g.strokeText(ch, 0, 0);
      g.fillStyle = '#f5c63a';
      g.fillText(ch, 0, 0);
      g.restore();
      travelled += widths[i];
    });
  };
  arc('ENOLA', 104, 108, 940);
  arc('SQUATCH', 114, 268, 980);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The nose-art image pipeline in `src/enolasquatch/livery.js`.
 *
 * These are the four things that decide whether the owner's paintings land on
 * the aeroplane as artwork or as rectangles, and each one is a real defect that
 * was found or avoided on 2026-08-05 rather than a hypothetical:
 *
 *   1. an already-matted painting keeps its matte and is TRIMMED TO ITS INK.
 *      Both delivered files are 2:3 portrait sheets that neither fills; the
 *      lettering's ink is barely a quarter of its file's height, so a pipeline
 *      that maps the sheet hangs the name on the fuselage four times too small
 *      inside an empty margin.
 *   2. a flattened LETTERING re-export is keyed off its grey field.
 *   3. a flattened PIN-UP is refused rather than keyed. The vignette and the
 *      model's skin are the same colour in the delivered file — her thigh
 *      samples rgb(247,172,82) and the glow behind her head rgb(250,171,79) —
 *      so a key eats her. Refusing is the behaviour; if somebody ever "fixes"
 *      it into a key, this test is what should stop them.
 *   4. cleared pixels are bled with the artwork's own edge colour, not left
 *      carrying the background. The GPU ignores alpha when it builds a mip or
 *      takes an anisotropic tap, so an unbled matte rings the artwork in dirt
 *      at every distance but nose-to-the-paint.
 *
 * The canvas stub below is the whole reason this can run under `node --test`:
 * it is a real pixel buffer with a real (nearest-neighbour) blit, so the code
 * under test is the shipping code and not a re-implementation of it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

/* ------------------------------------------------------------------ */
/* A canvas that is genuinely a pixel buffer.                          */
/* ------------------------------------------------------------------ */

function makeCanvas() {
  const canvas = { width: 0, height: 0 };
  let buf = null;
  const ensure = () => {
    if (!buf || buf.length !== canvas.width * canvas.height * 4) {
      buf = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    }
    return buf;
  };
  /* A canvas is also a legal `drawImage` SOURCE, which is how `prepareArt()`
   * crops: it draws the full-size working canvas into the trimmed one. */
  Object.defineProperty(canvas, 'data', { get: ensure });
  canvas.getContext = () => ({
    clearRect() { ensure().fill(0); },
    drawImage(src, ...a) {
      const d = ensure();
      const sw = src.width, sh = src.height, sd = src.data;
      let sx = 0, sy = 0, sW = sw, sH = sh, dx = 0, dy = 0, dW = sw, dH = sh;
      if (a.length === 2) { [dx, dy] = a; }
      else if (a.length === 8) { [sx, sy, sW, sH, dx, dy, dW, dH] = a; }
      for (let y = 0; y < dH; y++) {
        for (let x = 0; x < dW; x++) {
          const ux = sx + Math.floor((x * sW) / dW);
          const uy = sy + Math.floor((y * sH) / dH);
          if (ux < 0 || uy < 0 || ux >= sw || uy >= sh) continue;
          const tx = dx + x, ty = dy + y;
          if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
          const s = (uy * sw + ux) * 4, t = (ty * canvas.width + tx) * 4;
          d[t] = sd[s]; d[t + 1] = sd[s + 1]; d[t + 2] = sd[s + 2]; d[t + 3] = sd[s + 3];
        }
      }
    },
    getImageData(x, y, w, h) { return { data: ensure(), width: w, height: h }; },
    putImageData(img) { buf = img.data; },
    // Only the placeholder uses these; harmless no-ops here.
    save() {}, restore() {}, translate() {}, rotate() {},
    fillText() {}, strokeText() {}, measureText: () => ({ width: 10 }),
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  });
  return canvas;
}

/**
 * Install the pixel-buffer canvas for the length of one test and put back
 * whatever was there before.
 *
 * `tests/run.mjs` imports every suite into ONE process, and several of them
 * install their own `document` stub whose `createElement` returns an object
 * with an empty context. A `??=` here inherits that stub instead of winning,
 * which is exactly how these five tests passed alone and failed in the suite.
 * Swapping per test, and restoring after, means neither direction can break
 * the other whatever order the runner ends up loading them in.
 */
function withCanvas(fn) {
  const prev = globalThis.document;
  globalThis.document = {
    ...(prev || {}),
    createElement: (tag) => (!tag || tag === 'canvas' ? makeCanvas() : prev?.createElement?.(tag)),
  };
  try { return fn(); } finally { globalThis.document = prev; }
}

const { prepareArt } = await import('../src/enolasquatch/livery.js');

/* ------------------------------------------------------------------ */
/* Synthetic paintings.                                                */
/* ------------------------------------------------------------------ */

/**
 * A sheet with a block of "ink" somewhere in it, mimicking the shape of the
 * real deliveries: portrait sheet, ink that does not fill it.
 *
 * @param {object} o
 *   w,h            sheet size
 *   ink            {x, y, w, h} the block of artwork
 *   inkColour      [r,g,b] the artwork
 *   field          [r,g,b] the background
 *   opaqueField    true to flatten (no matte) — the case the brief expected
 */
function sheet({ w, h, ink, inkColour, field, opaqueField }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= ink.x && x < ink.x + ink.w && y >= ink.y && y < ink.y + ink.h;
      const c = inside ? inkColour : field;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
      data[i + 3] = inside || opaqueField ? 255 : 0;
    }
  }
  return { width: w, height: h, data };
}

const pixelsOf = (art) => {
  const c = art.texture.image;
  const g = c.getContext('2d');
  return { c, px: g.getImageData(0, 0, c.width, c.height).data };
};
const at = (c, px, x, y) => {
  const i = (y * c.width + x) * 4;
  return [px[i], px[i + 1], px[i + 2], px[i + 3]];
};

/* ------------------------------------------------------------------ */

test('a delivered matte survives, and the sheet is trimmed to its ink', () => withCanvas(() => {
  /* The real proportions: a 2:3 portrait sheet whose ink is a wide band a
   * quarter of the way down it, which is the lettering's actual shape. */
  const img = sheet({
    w: 200, h: 300,
    ink: { x: 20, y: 120, w: 160, h: 80 },
    inkColour: [248, 198, 60], field: [90, 89, 88], opaqueField: false,
  });
  const art = prepareArt(img, 'pinup');   // 'pinup' so no glow recovery widens it
  assert.ok(art, 'a matted painting must not be refused');
  assert.equal(art.keyed, false, 'nothing to key: the matte was delivered');

  const { c } = pixelsOf(art);
  /* Trimmed to the ink plus the one-pixel margin `inkBounds` leaves, NOT to
   * the 200x300 sheet. Mapping the sheet is what makes the name read tiny. */
  assert.ok(c.width >= 160 && c.width <= 164, `width ${c.width} should be the ink's 160`);
  assert.ok(c.height >= 80 && c.height <= 84, `height ${c.height} should be the ink's 80`);
  assert.ok(Math.abs(art.aspect - 2.0) < 0.06, `aspect ${art.aspect} should be the ink's 2:1, not the sheet's 0.67`);
}));

test('a flattened lettering re-export is keyed off its grey field', () => withCanvas(() => {
  const img = sheet({
    w: 200, h: 300,
    ink: { x: 20, y: 120, w: 160, h: 80 },
    inkColour: [248, 198, 60], field: [90, 89, 88], opaqueField: true,
  });
  const art = prepareArt(img, 'name');
  assert.ok(art, 'flattened lettering is recoverable and must not be refused');
  assert.equal(art.keyed, true, 'the opaque border must have been detected');

  const { c, px } = pixelsOf(art);
  // The yellow survives...
  const mid = at(c, px, c.width >> 1, c.height >> 1);
  assert.ok(mid[3] > 200, `the lettering must stay opaque, got alpha ${mid[3]}`);
  assert.ok(mid[0] > 180 && mid[2] < 140, `the lettering must stay yellow, got ${mid.slice(0, 3)}`);
  // ...and the grey does not: the trim already threw most of it away, and what
  // is left at the very corner of the crop is clear.
  assert.ok(at(c, px, 0, 0)[3] < 80, 'the grey field must not survive as opaque pixels');
}));

test('a flattened pin-up is refused, not keyed', () => withCanvas(() => {
  /* The delivered pin-up's killer property, reproduced: the field and the
   * artwork are the same colour. Nothing can separate them, so the pipeline
   * must decline rather than hand back a mangled model. */
  const img = sheet({
    w: 200, h: 300,
    ink: { x: 40, y: 60, w: 120, h: 180 },
    inkColour: [247, 172, 82], field: [250, 171, 79], opaqueField: true,
  });
  assert.equal(prepareArt(img, 'pinup'), null, 'an unkeyable flattened pin-up must be refused');
}));

test('cleared pixels are bled with the artwork, not the background', () => withCanvas(() => {
  /* An unbled matte hands the mip chain the background colour. Here the field
   * is near-black brown, as the real pin-up's corners are (rgb(25,13,0)), and
   * a texel just outside the ink must have taken the ink's colour instead. */
  const img = sheet({
    w: 120, h: 160,
    ink: { x: 40, y: 50, w: 40, h: 60 },
    inkColour: [240, 200, 120], field: [25, 13, 0], opaqueField: false,
  });
  const art = prepareArt(img, 'pinup');
  assert.ok(art);
  const { c, px } = pixelsOf(art);
  // Top-left of the crop is one pixel of margin outside the ink: cleared...
  const corner = at(c, px, 0, 0);
  assert.equal(corner[3], 0, 'the margin must still be transparent');
  // ...but carrying the artwork's colour, not the brown it was painted on.
  assert.ok(corner[0] > 150, `bled RGB should be the artwork's, got ${corner.slice(0, 3)}`);
  assert.ok(corner[0] > corner[2], 'bled RGB should not be the near-black field');
}));

test('the ink aspect is what sizes the plate, for either painting', () => withCanvas(() => {
  /* The contract `EnolaSquatch.applyNoseArt()` depends on: height is held and
   * width follows this number, so a wrong aspect stretches the paint. */
  const tall = prepareArt(sheet({
    w: 300, h: 300, ink: { x: 100, y: 30, w: 80, h: 240 },
    inkColour: [200, 120, 60], field: [40, 20, 5], opaqueField: false,
  }), 'pinup');
  assert.ok(Math.abs(tall.aspect - 80 / 240) < 0.05, `portrait ink, got ${tall.aspect}`);
}));

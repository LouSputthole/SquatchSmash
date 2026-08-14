import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function topLevelMp4Boxes(buffer) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > buffer.length) break;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = buffer.length - offset;
    }
    if (size < headerSize || offset + size > buffer.length) break;
    boxes.push({ type, offset, size });
    offset += size;
  }
  return boxes;
}

/* Every shipped video must stream, not stall: a trailing moov box makes the
 * browser download the whole file before the first frame can play.
 * docs/WEB-PERFORMANCE-AND-PWA.md item 4 landed this for hog-mamas-show.mp4;
 * until the 2026-08-14 checks-that-lie pass this test then asserted ONE of
 * the six shipped MP4s, so a new slow-start video would have sailed through.
 * All six are fast-start today; there is deliberately no allowlist. */
test('every shipped MP4 keeps its playback metadata ahead of media bytes', () => {
  const dir = path.join(ROOT, 'assets/video');
  const videos = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
  assert.ok(videos.length >= 6, `expected the shipped video set, found ${videos.length}`);
  for (const name of videos) {
    const buffer = fs.readFileSync(path.join(dir, name));
    const boxes = topLevelMp4Boxes(buffer);
    const moov = boxes.find((box) => box.type === 'moov');
    const mdat = boxes.find((box) => box.type === 'mdat');
    assert.ok(moov, `${name}: missing MP4 moov metadata box`);
    assert.ok(mdat, `${name}: missing MP4 mdat media box`);
    assert.ok(moov.offset < mdat.offset,
      `${name}: moov starts at ${moov.offset}, after mdat at ${mdat.offset}; `
      + 'run the lossless fast-start rewrite (ffmpeg -c copy -movflags +faststart)');
  }
});

test('Hog Mamas video keeps its playback metadata ahead of media bytes', () => {
  const file = path.join(ROOT, 'assets/video/hog-mamas-show.mp4');
  const buffer = fs.readFileSync(file);
  const boxes = topLevelMp4Boxes(buffer);
  const moov = boxes.find((box) => box.type === 'moov');
  const mdat = boxes.find((box) => box.type === 'mdat');

  assert.ok(moov, 'missing MP4 moov metadata box');
  assert.ok(mdat, 'missing MP4 mdat media box');
  assert.ok(moov.offset < mdat.offset,
    `moov starts at ${moov.offset}, after mdat at ${mdat.offset}; run the lossless fast-start rewrite`);
  assert.equal(buffer.length, 7_621_825, 'the lossless fast-start file size changed');
  assert.equal(mdat.size, 7_364_181, 'the encoded media payload size changed');
  const mediaHash = crypto.createHash('sha256')
    .update(buffer.subarray(mdat.offset + 8, mdat.offset + mdat.size))
    .digest('hex');
  assert.equal(mediaHash, 'b00e9d2cade6e67c699765bba4240cefca27896f4d0c38ae43a7f326a26746b8',
    'the encoded Hog Mamas audio/video payload changed; fast-start must be a stream copy');
});

/* ------------------------------------------------------------------ */
/* Runtime art budgets.                                               */
/* ------------------------------------------------------------------ */

/* Header-only decoders: enough to read width/height without an image
 * library. The PNG/JPEG halves mirror tools/check.mjs's `dim()`. */
function imageDim(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2;
    while (i < b.length - 8) {
      if (b[i] !== 0xFF) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = b.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (fmt === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3FFF) + 1, h: ((bits >> 14) & 0x3FFF) + 1 };
    }
    if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3FFF, h: b.readUInt16LE(28) & 0x3FFF };
    return null;
  }
  return null;
}

/* The budget a NEW image has to meet. 400 KiB is comfortably above every
 * right-sized texture in the game (the optimized DeathMegatron family
 * portrait is 240 KiB at 1122x1402) and comfortably below the offenders;
 * 2048 px is the largest edge any surface in the game can show. */
const IMAGE_BYTE_BUDGET = 400 * 1024;
const IMAGE_EDGE_BUDGET = 2048;

/* Every image over budget on 2026-08-14, pinned at its CURRENT size so it
 * can shrink but never grow. docs/WEB-PERFORMANCE-AND-PWA.md item 5 is the
 * asset-diet wave that re-renders these and empties this list; this test's
 * job today is only to stop NEW oversized art from landing. Do not add an
 * entry to silence a failure — resize the image. */
const OVERSIZED_BYTES = new Map(Object.entries({
  'art/lou-office-hog-mama.png': 7_575_362,
  'art/squatchfather-coast-squatch.png': 3_477_298,
  'art/mansion-campfire-banjo.png': 3_467_919,
  'arcade/counter-squatch-teamplay.png': 2_795_618,
  'arcade/counter-squatch-baiters-brain.png': 2_738_030,
  'art/enola-squatch-nose-art.png': 2_622_896,
  'art/bing-office-noir.png': 2_536_573,
  'art/lou-office-squatches-bing.png': 2_518_120,
  'art/bing-hallway-booskibro.png': 2_256_926,
  'art/enola-squatch-nose-name.png': 2_237_259,
  'art/bing-hallway-uncle-lou.png': 2_174_223,
  'art/bing-hallway-rippinflow.png': 2_165_510,
  'art/bing-hallway-shubenator.png': 2_120_697,
  'faces/silver-waiter.png': 2_047_043,
  'art/family-portrait-lag.webp': 1_554_350,
  'art/family-portrait-sauce.webp': 1_526_792,
  'art/family-portrait-hogmama.webp': 1_502_328,
  'art/family-portrait-ape.webp': 1_500_114,
  'art/family-portrait-seff.webp': 1_497_488,
  'faces/sasole.png': 1_493_346,
  'art/family-portrait-irish.webp': 1_454_044,
  'art/family-portrait-eric.webp': 1_434_848,
  'art/sticker-austin-2025.png': 757_132,
  'art/sticker-pinup-silver.png': 717_157,
  'art/squatch-almighty.jpg': 501_616,
  'arcade/counter-squatch-match-result.jpg': 466_232,
  'art/austin-major-2025-roster.jpg': 464_494,
}));

/* Same idea for dimensions. */
const OVERSIZED_EDGES = new Map(Object.entries({
  'art/lou-office-hog-mama.png': 3000,
  'art/austin-major-2025-roster.jpg': 2600,
  'art/closet-cowboy.jpg': 2116,
}));

function shippedImages() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, 'assets', dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) out.push(rel);
    }
  })('');
  return out;
}

test('no NEW runtime image exceeds the asset budget', () => {
  const problems = [];
  const seen = new Set();
  for (const rel of shippedImages()) {
    seen.add(rel);
    const buffer = fs.readFileSync(path.join(ROOT, 'assets', rel));
    const ceiling = OVERSIZED_BYTES.get(rel) ?? IMAGE_BYTE_BUDGET;
    if (buffer.length > ceiling) {
      problems.push(`assets/${rel} is ${buffer.length} bytes `
        + (OVERSIZED_BYTES.has(rel)
          ? `(allowlisted at ${ceiling} — it grew; it is only allowed to shrink)`
          : `(budget ${IMAGE_BYTE_BUDGET}); render it right-sized instead`));
    }
    const dim = imageDim(buffer);
    if (!dim) {
      problems.push(`assets/${rel}: could not read image dimensions — unsupported or corrupt header`);
      continue;
    }
    const edge = Math.max(dim.w, dim.h);
    const edgeCeiling = OVERSIZED_EDGES.get(rel) ?? IMAGE_EDGE_BUDGET;
    if (edge > edgeCeiling) {
      problems.push(`assets/${rel} is ${dim.w}x${dim.h} `
        + (OVERSIZED_EDGES.has(rel)
          ? `(allowlisted at ${edgeCeiling} px — it grew)`
          : `(budget ${IMAGE_EDGE_BUDGET} px on the long edge)`));
    }
  }
  assert.deepEqual(problems, [], `${problems.length} image(s) over budget:\n${problems.join('\n')}`);

  /* Allowlist rows whose file left or shrank under budget are finished work,
   * not failures — the diet wave deletes them as it lands. Surface them so
   * the list cannot quietly outlive its excuse. */
  for (const [rel, ceiling] of OVERSIZED_BYTES) {
    if (!seen.has(rel)) {
      console.warn(`  note  budget allowlist names assets/${rel}, which no longer exists — drop the row`);
    } else if (fs.statSync(path.join(ROOT, 'assets', rel)).size <= IMAGE_BYTE_BUDGET) {
      console.warn(`  note  assets/${rel} now fits the ${IMAGE_BYTE_BUDGET}-byte budget (was pinned ${ceiling}) — drop the row`);
    }
  }
});

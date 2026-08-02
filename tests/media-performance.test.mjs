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

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

import { bindScreenshotArtifact } from './screenshot-artifact-contract.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const estimate = a + b - c;
  const da = Math.abs(estimate - a);
  const db = Math.abs(estimate - b);
  const dc = Math.abs(estimate - c);
  if (da <= db && da <= dc) return a;
  return db <= dc ? b : c;
}

export function decodeCockpitPng(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Invalid PNG signature');
  }
  let offset = 8;
  let header = null;
  let ended = false;
  const imageChunks = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('Truncated PNG chunk');
    const type = bytes.subarray(typeStart, dataStart).toString('ascii');
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = pngCrc32(bytes.subarray(typeStart, dataEnd));
    if (expectedCrc !== actualCrc) throw new Error(`Invalid PNG ${type} CRC`);
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (header || data.length !== 13) throw new Error('Invalid PNG IHDR');
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      imageChunks.push(data);
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || !ended || !imageChunks.length) throw new Error('Incomplete PNG image data');
  if (!Number.isSafeInteger(header.width) || !Number.isSafeInteger(header.height)
      || header.width < 1 || header.height < 1 || header.width > 16384 || header.height > 16384
      || header.bitDepth !== 8 || ![2, 6].includes(header.colorType)
      || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error(`Unsupported PNG format ${JSON.stringify(header)}`);
  }
  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const stride = header.width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(imageChunks));
  if (inflated.length !== header.height * (stride + 1)) {
    throw new Error('PNG scanline length does not match IHDR dimensions');
  }
  const decoded = Buffer.alloc(header.height * stride);
  for (let row = 0; row < header.height; row += 1) {
    const source = row * (stride + 1);
    const filter = inflated[source];
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
    const target = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[source + 1 + column];
      const left = column >= bytesPerPixel ? decoded[target + column - bytesPerPixel] : 0;
      const above = row > 0 ? decoded[target + column - stride] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? decoded[target + column - stride - bytesPerPixel] : 0;
      const prediction = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      decoded[target + column] = (raw + prediction) & 0xff;
    }
  }
  let rgba = decoded;
  if (header.colorType === 2) {
    rgba = Buffer.alloc(header.width * header.height * 4);
    for (let from = 0, to = 0; from < decoded.length; from += 3, to += 4) {
      rgba[to] = decoded[from];
      rgba[to + 1] = decoded[from + 1];
      rgba[to + 2] = decoded[from + 2];
      rgba[to + 3] = 255;
    }
  }
  return Object.freeze({ ...header, rgba });
}

export function bindCockpitScreenshotArtifact(capturedInput, diskInput, relativeFile) {
  const captured = Buffer.isBuffer(capturedInput) ? capturedInput : Buffer.from(capturedInput ?? []);
  const disk = Buffer.isBuffer(diskInput) ? diskInput : Buffer.from(diskInput ?? []);
  const artifact = bindScreenshotArtifact(captured, disk);
  const decoded = decodeCockpitPng(disk);
  return Object.freeze({
    file: relativeFile,
    width: decoded.width,
    height: decoded.height,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    decoded: Object.freeze({
      bitDepth: decoded.bitDepth,
      colorType: decoded.colorType,
      interlace: decoded.interlace,
      rgbaBytes: decoded.rgba.length,
      rgbaSha256: sha256(decoded.rgba),
    }),
  });
}

function rgbFromHex(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) throw new Error(`Invalid owner-mask color ${color}`);
  return [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
}

function rounded(value, digits = 8) {
  return Number(value.toFixed(digits));
}

function classifyPaletteOverBlack(sample, colors) {
  let best = null;
  let secondError = Number.POSITIVE_INFINITY;
  for (let index = 0; index < colors.length; index += 1) {
    const rgb = colors[index].rgb;
    const magnitude = rgb.reduce((sum, channel) => sum + channel ** 2, 0);
    const mixture = Math.max(0, Math.min(1,
      sample.reduce((sum, channel, at) => sum + channel * rgb[at], 0) / magnitude,
    ));
    const error = rgb.reduce(
      (sum, channel, at) => sum + (sample[at] - channel * mixture) ** 2,
      0,
    );
    if (!best || error < best.error) {
      secondError = best?.error ?? secondError;
      best = { index, mixture, error };
    } else if (error < secondError) {
      secondError = error;
    }
  }
  /* WebGL antialiasing resolves an ID edge as ID*coverage over the forced
   * black clear colour. Classifying along that colour ray accepts the exact
   * MSAA result without allowing arbitrary screenshot colour to become an ID.
   * A margin rejects pixels mixed between two differently coloured owners. */
  if (!best || best.mixture < 0.08 || best.error > 20 ** 2 * 3
      || secondError - best.error < 8 ** 2 * 3) return -1;
  return best.index;
}

/**
 * Measure visible target pixels in an occlusion-aware material ID render.
 * The normal screenshot supplies the colours used for a local contrast gate;
 * the mask supplies identity only. No semantic claim comes from a bounding
 * box or projected centre alone.
 */
export function measureCockpitIdMask(imageInput, maskInput, palette) {
  const imageBytes = Buffer.isBuffer(imageInput) ? imageInput : Buffer.from(imageInput ?? []);
  const maskBytes = Buffer.isBuffer(maskInput) ? maskInput : Buffer.from(maskInput ?? []);
  const image = decodeCockpitPng(imageBytes);
  const mask = decodeCockpitPng(maskBytes);
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error('Screenshot and owner mask dimensions differ');
  }
  if (!Array.isArray(palette) || !palette.length
      || new Set(palette.map(({ id }) => id)).size !== palette.length
      || new Set(palette.map(({ color }) => color?.toLowerCase())).size !== palette.length) {
    throw new Error('Owner-mask palette must have distinct IDs and colors');
  }
  const rootMetadataCount = palette.filter(({ ownerId, rootUuid }) => ownerId && rootUuid).length;
  if (rootMetadataCount !== 0 && rootMetadataCount !== palette.length) {
    throw new Error('Owner-mask root metadata must be complete or absent');
  }
  if (rootMetadataCount && new Set(palette.map(({ rootUuid }) => rootUuid)).size !== palette.length) {
    throw new Error('Owner-mask palette must have distinct semantic root UUIDs');
  }
  const colors = palette.map(({ id, color, ownerId, ownerColor, rootUuid, rootName }) => ({
    id,
    color: color.toLowerCase(),
    rgb: rgbFromHex(color),
    ownerId: ownerId ?? id,
    ownerColor: (ownerColor ?? color).toLowerCase(),
    rootUuid: rootUuid ?? id,
    rootName: rootName ?? id,
  }));
  const pixelCount = image.width * image.height;
  const labels = new Int16Array(pixelCount);
  labels.fill(-1);
  const roots = colors.map(({ id, color, ownerId, ownerColor, rootUuid, rootName }) => ({
    id,
    color,
    ownerId,
    ownerColor,
    rootUuid,
    rootName,
    visiblePixels: 0,
    sum: [0, 0, 0],
    ringPixels: 0,
    ringSum: [0, 0, 0],
  }));
  let classifiedPixels = 0;
  let unclassifiedColoredPixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const at = pixel * 4;
    if (mask.rgba[at + 3] < 128) continue;
    const sample = [mask.rgba[at], mask.rgba[at + 1], mask.rgba[at + 2]];
    const best = classifyPaletteOverBlack(sample, colors);
    if (best < 0) {
      if (Math.max(...sample) > 24) unclassifiedColoredPixels += 1;
      continue;
    }
    labels[pixel] = best;
    classifiedPixels += 1;
    const proof = roots[best];
    proof.visiblePixels += 1;
    proof.sum[0] += image.rgba[at];
    proof.sum[1] += image.rgba[at + 1];
    proof.sum[2] += image.rgba[at + 2];
  }
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const ownerIndex = labels[pixel];
    if (ownerIndex < 0) continue;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
      const neighbor = ny * image.width + nx;
      if (labels[neighbor] === ownerIndex) continue;
      const at = neighbor * 4;
      const proof = roots[ownerIndex];
      proof.ringPixels += 1;
      proof.ringSum[0] += image.rgba[at];
      proof.ringSum[1] += image.rgba[at + 1];
      proof.ringSum[2] += image.rgba[at + 2];
    }
  }
  const visited = new Uint8Array(pixelCount);
  for (let start = 0; start < pixelCount; start += 1) {
    const ownerIndex = labels[start];
    if (ownerIndex < 0 || visited[start]) continue;
    visited[start] = 1;
    const queue = [start];
    let componentPixels = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor];
      componentPixels += 1;
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
        const neighbor = ny * image.width + nx;
        if (visited[neighbor] || labels[neighbor] !== ownerIndex) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    const proof = roots[ownerIndex];
    proof.componentCount = (proof.componentCount ?? 0) + 1;
    proof.largestComponentPixels = Math.max(proof.largestComponentPixels ?? 0, componentPixels);
  }
  const finalize = (entry, fields) => {
    const mean = entry.sum.map((value) => value / Math.max(entry.visiblePixels, 1));
    const ringMean = entry.ringSum.map((value) => value / Math.max(entry.ringPixels, 1));
    const contrast = Math.hypot(...mean.map((value, index) => value - ringMean[index]))
      / Math.sqrt(3 * 255 ** 2);
    return Object.freeze({
      ...fields,
      visiblePixels: entry.visiblePixels,
      coverageRatio: rounded(entry.visiblePixels / pixelCount),
      componentCount: entry.componentCount ?? 0,
      largestComponentPixels: entry.largestComponentPixels ?? 0,
      largestComponentRatio: rounded(
        (entry.largestComponentPixels ?? 0) / Math.max(entry.visiblePixels, 1),
      ),
      ringPixels: entry.ringPixels,
      contrast: rounded(contrast, 6),
    });
  };
  const rootProofs = roots.map((entry) => finalize(entry, {
    id: entry.id,
    ownerId: entry.ownerId,
    rootUuid: entry.rootUuid,
    rootName: entry.rootName,
    color: entry.color,
  }));
  const ownerAccumulators = new Map();
  for (const root of roots) {
    if (!ownerAccumulators.has(root.ownerId)) {
      ownerAccumulators.set(root.ownerId, {
        id: root.ownerId,
        color: root.ownerColor,
        visiblePixels: 0,
        sum: [0, 0, 0],
        ringPixels: 0,
        ringSum: [0, 0, 0],
        componentCount: 0,
        largestComponentPixels: 0,
      });
    }
    const owner = ownerAccumulators.get(root.ownerId);
    owner.visiblePixels += root.visiblePixels;
    owner.ringPixels += root.ringPixels;
    owner.componentCount += root.componentCount ?? 0;
    owner.largestComponentPixels = Math.max(
      owner.largestComponentPixels, root.largestComponentPixels ?? 0,
    );
    for (let channelIndex = 0; channelIndex < 3; channelIndex += 1) {
      owner.sum[channelIndex] += root.sum[channelIndex];
      owner.ringSum[channelIndex] += root.ringSum[channelIndex];
    }
  }
  const ownerProofs = [...ownerAccumulators.values()].map((entry) => finalize(entry, {
    id: entry.id,
    color: entry.color,
  }));
  const result = {
    width: image.width,
    height: image.height,
    imagePngBytes: imageBytes.length,
    imagePngSha256: sha256(imageBytes),
    maskPngBytes: maskBytes.length,
    maskPngSha256: sha256(maskBytes),
    imageRgbaSha256: sha256(image.rgba),
    maskRgbaSha256: sha256(mask.rgba),
    classifiedPixels,
    unclassifiedColoredPixels,
    unclassifiedColoredRatio: rounded(unclassifiedColoredPixels / pixelCount),
    owners: Object.freeze(ownerProofs),
    roots: Object.freeze(rootProofs),
  };
  return Object.freeze({
    ...result,
    proofSha256: sha256(Buffer.from(JSON.stringify(result))),
  });
}

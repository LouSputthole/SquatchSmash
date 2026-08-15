import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import { bindScreenshotArtifact } from './screenshot-artifact-contract.mjs';
import { beginEvidenceDirectoryTransaction } from './evidence-directory-transaction.mjs';
import { resolveEvidenceOutputRoot } from './evidence-directory-transaction.mjs';

import {
  GLOBAL_GEOMETRY_EVIDENCE_SCHEMA,
  GLOBAL_GEOMETRY_EVIDENCE_SHOTS,
  assertGlobalGeometryEvidenceSourcesUnchanged,
  canonicalGlobalGeometryServedManifest,
  currentGlobalGeometryEvidenceSourceIdentities,
  evaluateGlobalGeometryCaptureState,
  evaluateGlobalGeometryEvidenceRun,
  evaluateGlobalGeometryShot,
  globalGeometryServedDiskManifest,
  hashStableEvidence,
  parseGlobalGeometryEvidenceRun,
  servedEvidenceFingerprint,
  snapshotGlobalGeometryServedDiskUniverse,
  snapshotGlobalGeometryServedSourceBytes,
} from './global-geometry-evidence-contract.mjs';

const VIEWPORT = Object.freeze({ width: 1280, height: 720, deviceScaleFactor: 1 });
const GLOBAL_GEOMETRY_IMMUTABLE_WORKER = process.env.GLOBAL_GEOMETRY_EVIDENCE_IMMUTABLE_WORKER === '1';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const GLOBAL_GEOMETRY_MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

export function createGlobalGeometryImmutableServer({ baseUrl, immutableSourceBytes }) {
  const origin = new URL(baseUrl).origin;
  if (!(immutableSourceBytes instanceof Map) || immutableSourceBytes.size < 1) {
    throw new Error('Global geometry immutable server requires capture-start source bytes');
  }
  return http.createServer((request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method || '')) {
        response.writeHead(405).end();
        return;
      }
      const url = new URL(request.url || '/', origin);
      const relativeFile = decodeURIComponent(url.pathname).replace(/^\/+/, '').replaceAll('\\', '/');
      if (!relativeFile || relativeFile.split('/').some((segment) => segment === '..' || segment === '.')) {
        response.writeHead(404).end();
        return;
      }
      const bytes = immutableSourceBytes.get(relativeFile);
      if (!bytes) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': bytes.length,
        'content-type': GLOBAL_GEOMETRY_MIME_TYPES[path.extname(relativeFile).toLowerCase()]
          || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(400).end();
    }
  });
}

export function listenGlobalGeometryImmutableServer(server, baseUrl) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(Number(url.port), url.hostname, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

export function closeGlobalGeometryImmutableServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
}

export function createGlobalGeometryIdMaterial(THREE, sourceMaterial, color) {
  const source = sourceMaterial ?? {};
  const common = {
    color,
    transparent: source.transparent === true,
    opacity: Number.isFinite(source.opacity) ? source.opacity : 1,
    alphaTest: Number.isFinite(source.alphaTest) ? source.alphaTest : 0,
    depthTest: source.depthTest !== false,
    depthWrite: source.depthWrite !== false,
    colorWrite: source.colorWrite !== false,
    side: source.side,
    blending: source.blending,
    blendSrc: source.blendSrc,
    blendDst: source.blendDst,
    blendEquation: source.blendEquation,
    premultipliedAlpha: source.premultipliedAlpha === true,
    dithering: source.dithering === true,
    polygonOffset: source.polygonOffset === true,
    polygonOffsetFactor: source.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: source.polygonOffsetUnits ?? 0,
    clippingPlanes: source.clippingPlanes ?? null,
    clipIntersection: source.clipIntersection === true,
    clipShadows: source.clipShadows === true,
    toneMapped: false,
    fog: false,
  };
  const textured = { ...common, map: source.map ?? null, alphaMap: source.alphaMap ?? null };
  let material;
  if (source.isSpriteMaterial) {
    material = new THREE.SpriteMaterial({
      ...textured,
      rotation: source.rotation ?? 0,
      sizeAttenuation: source.sizeAttenuation !== false,
    });
  } else if (source.isPointsMaterial) {
    material = new THREE.PointsMaterial({
      ...textured,
      size: source.size ?? 1,
      sizeAttenuation: source.sizeAttenuation !== false,
    });
  } else if (source.isLineBasicMaterial || source.isLineDashedMaterial) {
    const Constructor = source.isLineDashedMaterial
      ? THREE.LineDashedMaterial : THREE.LineBasicMaterial;
    const lineOptions = { ...common, linewidth: source.linewidth ?? 1 };
    if (source.linecap !== undefined) lineOptions.linecap = source.linecap;
    if (source.linejoin !== undefined) lineOptions.linejoin = source.linejoin;
    if (source.isLineDashedMaterial) Object.assign(lineOptions, {
      dashSize: source.dashSize,
      gapSize: source.gapSize,
      scale: source.scale,
    });
    material = new Constructor(lineOptions);
  } else {
    material = new THREE.MeshBasicMaterial(textured);
  }
  material.visible = source.visible !== false;
  material.name = `global-geometry-id:${source.name || source.uuid || 'material'}`;
  material.stencilWrite = source.stencilWrite === true;
  material.stencilWriteMask = source.stencilWriteMask;
  material.stencilFunc = source.stencilFunc;
  material.stencilRef = source.stencilRef;
  material.stencilFuncMask = source.stencilFuncMask;
  material.stencilFail = source.stencilFail;
  material.stencilZFail = source.stencilZFail;
  material.stencilZPass = source.stencilZPass;
  const palette = new THREE.Color(color);
  if (palette.r !== 0 || palette.g !== 0 || palette.b !== 0) {
    material.onBeforeCompile = (shader) => {
      const marker = '#include <alphatest_fragment>';
      if (!shader.fragmentShader.includes(marker)) {
        throw new Error('Global geometry ID shader has no alpha-test boundary');
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        marker, `${marker}\ndiffuseColor.rgb = diffuse;`,
      );
    };
    material.customProgramCacheKey = () => `global-geometry-id-${palette.getHexString()}`;
  }
  material.needsUpdate = true;
  return material;
}

export function globalGeometryRenderStateSnapshot(THREE, scene, camera, renderer, postfx) {
  const number = (value) => (Number.isFinite(value) ? Number(value.toFixed(9)) : String(value));
  const numbers = (values) => Array.from(values ?? [], number);
  const texture = (value) => {
    if (!value?.isTexture) return null;
    const image = value.image ?? value.source?.data ?? null;
    return {
      uuid: value.uuid,
      version: value.version,
      sourceVersion: value.source?.version ?? null,
      name: value.name || '',
      mapping: value.mapping,
      channel: value.channel ?? 0,
      wrapS: value.wrapS,
      wrapT: value.wrapT,
      minFilter: value.minFilter,
      magFilter: value.magFilter,
      anisotropy: value.anisotropy,
      format: value.format,
      type: value.type,
      colorSpace: value.colorSpace,
      flipY: value.flipY,
      premultiplyAlpha: value.premultiplyAlpha,
      matrix: numbers(value.matrix?.elements),
      image: image ? {
        width: image.videoWidth ?? image.naturalWidth ?? image.width ?? null,
        height: image.videoHeight ?? image.naturalHeight ?? image.height ?? null,
        src: image.currentSrc || image.src || null,
        complete: image.complete ?? null,
        readyState: image.readyState ?? null,
        dataBytes: image.data?.byteLength ?? null,
      } : null,
    };
  };
  const material = (value) => {
    if (!value?.isMaterial) return null;
    return {
      uuid: value.uuid,
      version: value.version,
      type: value.type,
      name: value.name || '',
      visible: value.visible,
      transparent: value.transparent,
      opacity: number(value.opacity),
      alphaTest: number(value.alphaTest),
      depthTest: value.depthTest,
      depthWrite: value.depthWrite,
      colorWrite: value.colorWrite,
      side: value.side,
      blending: value.blending,
      blendSrc: value.blendSrc,
      blendDst: value.blendDst,
      blendEquation: value.blendEquation,
      premultipliedAlpha: value.premultipliedAlpha,
      polygonOffset: value.polygonOffset,
      polygonOffsetFactor: number(value.polygonOffsetFactor),
      polygonOffsetUnits: number(value.polygonOffsetUnits),
      toneMapped: value.toneMapped,
      fog: value.fog,
      vertexColors: value.vertexColors,
      color: value.color?.getHexString?.() ?? null,
      emissive: value.emissive?.getHexString?.() ?? null,
      map: texture(value.map),
      alphaMap: texture(value.alphaMap),
      displacementMap: texture(value.displacementMap),
      customProgramKey: value.customProgramCacheKey?.() ?? null,
    };
  };
  const attribute = (value) => (value ? {
    itemSize: value.itemSize,
    count: value.count,
    normalized: value.normalized,
    usage: value.usage,
    version: value.version,
    arrayType: value.array?.constructor?.name ?? null,
    arrayBytes: value.array?.byteLength ?? null,
  } : null);
  const geometry = (value) => (value?.isBufferGeometry ? {
    uuid: value.uuid,
    type: value.type,
    drawRange: { start: value.drawRange.start, count: String(value.drawRange.count) },
    groups: value.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
    index: attribute(value.index),
    attributes: Object.fromEntries(Object.entries(value.attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, attribute(item)])),
    morphAttributes: Object.fromEntries(Object.entries(value.morphAttributes ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => [key, items.map(attribute)])),
  } : null);
  scene?.updateMatrixWorld?.(true);
  camera?.updateMatrixWorld?.(true);
  const renderables = [];
  scene?.traverse?.((object) => {
    if (!(object.isMesh || object.isSprite || object.isPoints || object.isLine)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    renderables.push({
      uuid: object.uuid,
      parentUuid: object.parent?.uuid ?? null,
      type: object.type,
      name: object.name || '',
      visible: object.visible,
      layers: object.layers?.mask ?? null,
      renderOrder: object.renderOrder,
      frustumCulled: object.frustumCulled,
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow,
      matrixWorld: numbers(object.matrixWorld?.elements),
      geometry: geometry(object.geometry),
      materials: materials.map(material),
      count: Number.isInteger(object.count) ? object.count : null,
      instanceMatrix: object.isInstancedMesh ? numbers(object.instanceMatrix?.array) : null,
      instanceColor: object.isInstancedMesh ? numbers(object.instanceColor?.array) : null,
      morphTargetInfluences: numbers(object.morphTargetInfluences),
      skeletonBoneMatrices: object.isSkinnedMesh ? numbers(object.skeleton?.boneMatrices) : null,
    });
  });
  renderables.sort((left, right) => left.uuid.localeCompare(right.uuid));
  const vector = (factory, getter) => {
    try {
      return numbers(getter(factory()).toArray());
    } catch {
      return null;
    }
  };
  return {
    camera: {
      uuid: camera?.uuid ?? null,
      matrixWorld: numbers(camera?.matrixWorld?.elements),
      projectionMatrix: numbers(camera?.projectionMatrix?.elements),
      layers: camera?.layers?.mask ?? null,
    },
    scene: {
      uuid: scene?.uuid ?? null,
      background: scene?.background?.isColor
        ? { color: scene.background.getHexString() } : texture(scene?.background),
      environment: texture(scene?.environment),
      fog: scene?.fog ? {
        type: scene.fog.isFogExp2 ? 'FogExp2' : 'Fog',
        color: scene.fog.color?.getHexString?.() ?? null,
        near: number(scene.fog.near),
        far: number(scene.fog.far),
        density: number(scene.fog.density),
      } : null,
    },
    renderer: {
      pixelRatio: renderer?.getPixelRatio?.() ?? null,
      size: vector(() => new THREE.Vector2(), (target) => renderer.getSize(target)),
      viewport: vector(() => new THREE.Vector4(), (target) => renderer.getViewport(target)),
      scissor: vector(() => new THREE.Vector4(), (target) => renderer.getScissor(target)),
      scissorTest: renderer?.getScissorTest?.() ?? null,
      clearColor: (() => {
        try { return renderer.getClearColor(new THREE.Color()).getHexString(); } catch { return null; }
      })(),
      clearAlpha: renderer?.getClearAlpha?.() ?? null,
      toneMapping: renderer?.toneMapping ?? null,
      toneMappingExposure: number(renderer?.toneMappingExposure),
      outputColorSpace: renderer?.outputColorSpace ?? null,
      shadowEnabled: renderer?.shadowMap?.enabled ?? null,
      shadowType: renderer?.shadowMap?.type ?? null,
    },
    postfx: postfx ? {
      enabled: postfx.enabled === true,
      composer: Boolean(postfx.composer),
      bloomThreshold: number(postfx.bloom?.threshold),
      bloomStrength: number(postfx.bloom?.strength),
      bloomRadius: number(postfx.bloom?.radius),
    } : null,
    renderables,
  };
}

export function createGlobalGeometryControlledRenderer(renderer, postfx, scene, camera) {
  const nativeRender = renderer.render.bind(renderer);
  let controlled = false;
  let disposed = false;
  const width = renderer.domElement?.width ?? 1280;
  const height = renderer.domElement?.height ?? 720;
  renderer.render = (renderScene, renderCamera) => (
    controlled ? nativeRender(renderScene, renderCamera) : undefined
  );
  const fullCanvas = () => {
    renderer.setRenderTarget?.(null);
    renderer.setViewport?.(0, 0, width, height);
    renderer.setScissor?.(0, 0, width, height);
    renderer.setScissorTest?.(false);
  };
  const withControl = (work) => {
    if (disposed) throw new Error('Controlled evidence renderer was disposed');
    fullCanvas();
    controlled = true;
    try {
      return work();
    } finally {
      controlled = false;
    }
  };
  const renderProduction = () => {
    if (!postfx?.render) return withControl(() => nativeRender(scene, camera));
    const oldScene = postfx.scene;
    const oldCamera = postfx.camera;
    const passes = (postfx.composer?.passes ?? [])
      .filter((pass) => pass && ('scene' in pass || 'camera' in pass))
      .map((pass) => ({ pass, scene: pass.scene, camera: pass.camera }));
    postfx.scene = scene;
    postfx.camera = camera;
    for (const state of passes) {
      if ('scene' in state.pass && state.pass.scene) state.pass.scene = scene;
      if ('camera' in state.pass && state.pass.camera) state.pass.camera = camera;
    }
    try {
      return withControl(() => postfx.render());
    } finally {
      postfx.scene = oldScene;
      postfx.camera = oldCamera;
      for (const state of passes) {
        state.pass.scene = state.scene;
        state.pass.camera = state.camera;
      }
    }
  };
  return {
    nativeRender,
    renderProduction,
    renderRaw: () => withControl(() => nativeRender(scene, camera)),
    fullCanvas,
    dispose() {
      if (disposed) return;
      renderer.render = nativeRender;
      disposed = true;
    },
  };
}

function paethPredictor(a, b, c) {
  const estimate = a + b - c;
  const da = Math.abs(estimate - a);
  const db = Math.abs(estimate - b);
  const dc = Math.abs(estimate - c);
  if (da <= db && da <= dc) return a;
  if (db <= dc) return b;
  return c;
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

export function decodeGlobalGeometryPng(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Invalid PNG signature');
  }
  let offset = 8;
  let header = null;
  const imageData = [];
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error(`Truncated PNG ${type} chunk`);
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = pngCrc32(bytes.subarray(offset + 4, dataEnd));
    if (actualCrc !== expectedCrc) throw new Error(`Invalid PNG ${type} CRC`);
    if (type === 'IHDR') {
      if (header || length !== 13) throw new Error('Invalid PNG IHDR');
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
      imageData.push(data);
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || !ended || !imageData.length) throw new Error('Incomplete PNG image data');
  if (!Number.isInteger(header.width) || !Number.isInteger(header.height)
      || header.width < 1 || header.height < 1 || header.width > 16384 || header.height > 16384
      || header.bitDepth !== 8 || ![2, 6].includes(header.colorType)
      || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error(`Unsupported PNG format ${JSON.stringify(header)}`);
  }
  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const stride = header.width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(imageData));
  const expectedBytes = header.height * (stride + 1);
  if (inflated.length !== expectedBytes) {
    throw new Error(`PNG scanline bytes ${inflated.length} != ${expectedBytes}`);
  }
  const decoded = Buffer.alloc(header.height * stride);
  for (let row = 0; row < header.height; row += 1) {
    const sourceOffset = row * (stride + 1);
    const filter = inflated[sourceOffset];
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
    const rowOffset = row * stride;
    const priorOffset = rowOffset - stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset + 1 + column];
      const left = column >= bytesPerPixel ? decoded[rowOffset + column - bytesPerPixel] : 0;
      const above = row > 0 ? decoded[priorOffset + column] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? decoded[priorOffset + column - bytesPerPixel] : 0;
      const prediction = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paethPredictor(left, above, upperLeft);
      decoded[rowOffset + column] = (raw + prediction) & 0xff;
    }
  }
  const rgba = header.colorType === 6 ? decoded : Buffer.alloc(header.width * header.height * 4);
  if (header.colorType === 2) {
    for (let source = 0, target = 0; source < decoded.length; source += 3, target += 4) {
      rgba[target] = decoded[source];
      rgba[target + 1] = decoded[source + 1];
      rgba[target + 2] = decoded[source + 2];
      rgba[target + 3] = 255;
    }
  }
  return { ...header, rgba };
}

function rounded(value, digits = 8) {
  return Number(value.toFixed(digits));
}

export function captureGlobalGeometryCanvasFrame({ render, canvas, snapshot }) {
  if (typeof render !== 'function' || typeof snapshot !== 'function'
      || typeof canvas?.toDataURL !== 'function') {
    throw new Error('Controlled canvas capture requires render, snapshot, and canvas callbacks');
  }
  const before = snapshot();
  const beforeJson = JSON.stringify(before);
  const renderResult = render();
  if (renderResult && typeof renderResult.then === 'function') {
    throw new Error('Controlled canvas render must complete synchronously');
  }
  const dataUrl = canvas.toDataURL('image/png');
  const after = snapshot();
  const afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    throw new Error('Global geometry render state changed while acquiring PNG bytes');
  }
  const match = String(dataUrl).match(/^data:image\/png;base64,([a-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error('Controlled canvas capture did not return PNG bytes');
  return { pngBase64: match[1], renderState: after, renderStateJson: afterJson };
}

function paletteRgb(color) {
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error(`Invalid owner-mask color ${color}`);
  return [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
}

function classifyPaletteCoverage(rgb, colors) {
  let bestIndex = -1;
  let bestResidual = Number.POSITIVE_INFINITY;
  let bestCoverage = 0;
  for (let index = 0; index < colors.length; index += 1) {
    const palette = colors[index].rgb;
    const magnitudeSquared = palette.reduce((sum, channel) => sum + channel ** 2, 0);
    const dot = rgb.reduce((sum, channel, channelIndex) => (
      sum + channel * palette[channelIndex]
    ), 0);
    const coverage = Math.max(0, Math.min(1, dot / magnitudeSquared));
    const residual = rgb.reduce((sum, channel, channelIndex) => (
      sum + (channel - coverage * palette[channelIndex]) ** 2
    ), 0);
    if (residual < bestResidual || (residual === bestResidual && coverage > bestCoverage)) {
      bestResidual = residual;
      bestCoverage = coverage;
      bestIndex = index;
    }
  }
  // The multisampled WebGL canvas resolves silhouette edges as a mixture of
  // the owner's flat ID colour and the black mask background.  Compare that
  // colour direction instead of distance from only the fully covered colour.
  // Reject near-black coverage and colours that do not lie close to the ray.
  return bestCoverage >= 0.08 && bestResidual <= 12 ** 2 ? bestIndex : -1;
}

export function measureGlobalGeometryPixelProof(imageInput, maskInput, ownerPalette) {
  const imageBytes = Buffer.isBuffer(imageInput) ? imageInput : Buffer.from(imageInput);
  const maskBytes = Buffer.isBuffer(maskInput) ? maskInput : Buffer.from(maskInput);
  const image = decodeGlobalGeometryPng(imageBytes);
  const mask = decodeGlobalGeometryPng(maskBytes);
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error('Screenshot and owner mask dimensions differ');
  }
  if (!Array.isArray(ownerPalette) || !ownerPalette.length
      || new Set(ownerPalette.map(({ id }) => id)).size !== ownerPalette.length
      || new Set(ownerPalette.map(({ color }) => color.toLowerCase())).size !== ownerPalette.length) {
    throw new Error('Owner-mask palette must have distinct IDs and colors');
  }
  const colors = ownerPalette.map(({ id, color }) => ({ id, color: color.toLowerCase(), rgb: paletteRgb(color) }));
  const pixelCount = image.width * image.height;
  const labels = new Int16Array(pixelCount);
  labels.fill(-1);
  const owners = colors.map(({ id, color }) => ({
    id, color, visiblePixels: 0, sum: [0, 0, 0], ringPixels: 0, ringSum: [0, 0, 0],
  }));
  let classifiedPixels = 0;
  let unclassifiedColoredPixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const at = pixel * 4;
    if (mask.rgba[at + 3] < 128) continue;
    const mr = mask.rgba[at];
    const mg = mask.rgba[at + 1];
    const mb = mask.rgba[at + 2];
    const bestIndex = classifyPaletteCoverage([mr, mg, mb], colors);
    if (bestIndex < 0) {
      if (Math.max(mr, mg, mb) > 24) unclassifiedColoredPixels += 1;
      continue;
    }
    labels[pixel] = bestIndex;
    classifiedPixels += 1;
    const owner = owners[bestIndex];
    owner.visiblePixels += 1;
    owner.sum[0] += image.rgba[at];
    owner.sum[1] += image.rgba[at + 1];
    owner.sum[2] += image.rgba[at + 2];
  }
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const ownerIndex = labels[pixel];
    if (ownerIndex < 0) continue;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    const owner = owners[ownerIndex];
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
      const neighbor = ny * image.width + nx;
      if (labels[neighbor] === ownerIndex) continue;
      const at = neighbor * 4;
      owner.ringPixels += 1;
      owner.ringSum[0] += image.rgba[at];
      owner.ringSum[1] += image.rgba[at + 1];
      owner.ringSum[2] += image.rgba[at + 2];
    }
  }
  const visited = new Uint8Array(pixelCount);
  for (let ownerIndex = 0; ownerIndex < owners.length; ownerIndex += 1) {
    let componentCount = 0;
    let largestComponentPixels = 0;
    for (let start = 0; start < pixelCount; start += 1) {
      if (labels[start] !== ownerIndex || visited[start]) continue;
      componentCount += 1;
      let componentPixels = 0;
      const queue = [start];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const pixel = queue[cursor];
        componentPixels += 1;
        const x = pixel % image.width;
        const y = Math.floor(pixel / image.width);
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
          const adjacent = ny * image.width + nx;
          if (labels[adjacent] !== ownerIndex || visited[adjacent]) continue;
          visited[adjacent] = 1;
          queue.push(adjacent);
        }
      }
      largestComponentPixels = Math.max(largestComponentPixels, componentPixels);
    }
    owners[ownerIndex].componentCount = componentCount;
    owners[ownerIndex].largestComponentPixels = largestComponentPixels;
  }
  const ownerProofs = owners.map(({
    id, color, visiblePixels, sum, ringPixels, ringSum,
    componentCount, largestComponentPixels,
  }) => {
    const mean = sum.map((value) => value / Math.max(1, visiblePixels));
    const ringMean = ringSum.map((value) => value / Math.max(1, ringPixels));
    const contrast = Math.hypot(...mean.map((value, index) => value - ringMean[index]))
      / Math.sqrt(3 * 255 ** 2);
    return {
      id,
      color,
      visiblePixels,
      coverageRatio: rounded(visiblePixels / pixelCount),
      componentCount,
      largestComponentPixels,
      largestComponentRatio: rounded(largestComponentPixels / Math.max(1, visiblePixels)),
      ringPixels,
      contrast: rounded(contrast, 6),
    };
  });
  const proof = {
    imagePngBytes: imageBytes.length,
    imagePngSha256: sha256(imageBytes),
    maskPngBytes: maskBytes.length,
    maskPngSha256: sha256(maskBytes),
    imageRgbaSha256: sha256(image.rgba),
    maskRgbaSha256: sha256(mask.rgba),
    classifiedPixels,
    unclassifiedColoredPixels,
    owners: ownerProofs,
  };
  return { ...proof, proofSha256: hashStableEvidence(proof) };
}

export function bindGlobalGeometryPngArtifact(capturedInput, diskInput, relativeFile) {
  const capturedBytes = Buffer.isBuffer(capturedInput) ? capturedInput : Buffer.from(capturedInput);
  const diskBytes = Buffer.isBuffer(diskInput) ? diskInput : Buffer.from(diskInput);
  const artifact = bindScreenshotArtifact(capturedBytes, diskBytes);
  const decoded = decodeGlobalGeometryPng(diskBytes);
  return {
    file: relativeFile,
    width: decoded.width,
    height: decoded.height,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    decoded: {
      bitDepth: decoded.bitDepth,
      colorType: decoded.colorType,
      interlace: decoded.interlace,
      rgbaBytes: decoded.rgba.length,
      rgbaSha256: sha256(decoded.rgba),
    },
  };
}

function runtimeDiagnostics(page) {
  const runtime = {
    pageErrors: [], consoleErrors: [], httpErrors: [], requestFailures: [],
  };
  page.on('pageerror', (error) => runtime.pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') runtime.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    runtime.requestFailures.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) runtime.httpErrors.push(`${response.status()} ${response.url()}`);
  });
  return runtime;
}

export function servedResponseTracker(page, origin, runtime, options = {}) {
  const entries = [];
  const tracked = new Map();
  const quietMs = Number.isFinite(options.quietMs) ? options.quietMs : 150;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10000;
  let lastActivity = Date.now();
  const wait = (milliseconds) => (typeof page.waitForTimeout === 'function'
    ? page.waitForTimeout(milliseconds)
    : new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const trackRequest = (request) => {
    if (tracked.has(request)) return tracked.get(request);
    const resourceType = request.resourceType();
    if (![
      'document', 'stylesheet', 'image', 'media', 'font', 'script', 'xhr', 'fetch',
      'manifest', 'other',
    ].includes(resourceType)) return null;
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return null;
    }
    if (url.origin !== origin) return null;
    const state = {
      request,
      url: request.url(),
      resourceType,
      responseSeen: false,
      bodySettled: false,
      finished: false,
      failed: false,
      bodyPromise: null,
    };
    tracked.set(request, state);
    lastActivity = Date.now();
    return state;
  };
  page.on('request', trackRequest);
  page.on('response', (response) => {
    const state = trackRequest(response.request());
    if (!state) return;
    state.responseSeen = true;
    lastActivity = Date.now();
    const work = (async () => {
      const body = await response.body();
      entries.push({
        url: response.url(),
        status: response.status(),
        resourceType: state.resourceType,
        bytes: body.length,
        sha256: sha256(body),
      });
    })().catch((error) => {
      runtime.requestFailures.push(`served-byte capture ${response.url()} :: ${error.message}`);
    }).finally(() => {
      state.bodySettled = true;
      lastActivity = Date.now();
    });
    state.bodyPromise = work;
  });
  page.on('requestfinished', (request) => {
    const state = trackRequest(request);
    if (!state) return;
    state.finished = true;
    lastActivity = Date.now();
  });
  page.on('requestfailed', (request) => {
    const state = trackRequest(request);
    if (!state) return;
    state.failed = true;
    state.finished = true;
    lastActivity = Date.now();
  });
  return async (launchDocument) => {
    const startedAt = Date.now();
    while (true) {
      const bodyPromises = [...tracked.values()]
        .map(({ bodyPromise }) => bodyPromise).filter(Boolean);
      await Promise.allSettled(bodyPromises);
      const active = [...tracked.values()].some((state) => (
        !state.finished || (state.responseSeen && !state.bodySettled)
      ));
      if (!active && Date.now() - lastActivity >= quietMs) break;
      if (Date.now() - startedAt > timeoutMs) {
        runtime.requestFailures.push('served-byte capture did not reach request quiescence');
        break;
      }
      await wait(Math.min(25, Math.max(1, quietMs)));
    }
    for (const state of tracked.values()) {
      if (!state.failed && (!state.responseSeen || !state.bodySettled)) {
        runtime.requestFailures.push(`served-byte capture incomplete ${state.resourceType} ${state.url}`);
      }
    }
    const normalized = [...entries].sort((left, right) => (
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    ));
    const identities = new Map();
    for (const entry of normalized) {
      const key = `${entry.resourceType}\0${entry.url}`;
      const identity = JSON.stringify({
        status: entry.status, bytes: entry.bytes, sha256: entry.sha256,
      });
      if (identities.has(key) && identities.get(key) !== identity) {
        runtime.requestFailures.push(`served-byte drift ${entry.resourceType} ${entry.url}`);
      }
      identities.set(key, identity);
    }
    return {
      launchDocument,
      entries: normalized,
      fingerprint: servedEvidenceFingerprint(normalized),
    };
  };
}

export function resolveGlobalGeometryRuntimeSurface(runtime) {
  const topAncestor = (object) => {
    let current = object;
    while (current?.parent) current = current.parent;
    return current;
  };
  let scene = runtime?.scene?.isScene ? runtime.scene : null;
  if (!scene) {
    const candidate = runtime?.palace?.root || runtime?.world?.root || runtime?.club?.root;
    const top = topAncestor(candidate);
    if (top?.isScene) scene = top;
  }
  let camera = runtime?.camera?.isCamera ? runtime.camera : null;
  if (!camera && runtime?.player?.camera?.isCamera) camera = runtime.player.camera;
  if (!camera && scene?.traverse) {
    scene.traverse((object) => {
      if (!camera && object.isPerspectiveCamera) camera = object;
    });
  }
  return {
    scene,
    camera,
    renderer: runtime?.renderer || runtime?.postfx?.renderer || null,
    postfx: runtime?.postfx || null,
    three: runtime?.THREE || runtime?.three || null,
  };
}

/* This function is serialized into each real scene page. It deliberately uses
 * only the page's public debug handle and the same THREE module as production.
 * Nothing below creates substitute geometry. */
function installGlobalGeometryEvidenceApi(
  resolveRuntimeSurface, createIdMaterial, renderStateSnapshot, createControlledRenderer,
  captureCanvasFrame,
) {
  let THREE = null;
  let active = null;

  const round = (value, digits = 8) => (
    Number.isFinite(value) ? Number(value.toFixed(digits)) : null
  );
  const maxAbs = (values) => round(values.length ? Math.max(...values.map(Math.abs)) : Number.NaN);
  const minFinite = (values) => round(values.length ? Math.min(...values) : Number.NaN);

  function runtimeFor(scene) {
    const runtimes = {
      silver: window.__silver,
      'cartel-palace': window.CARTEL_PALACE,
      mansion: window.mansion,
      'no-wake': window.NO_WAKE,
      motel: window.MOTEL,
      beefrun: window.__beefrun,
      enola: window.__enolaSquatch,
      bing: window.__bing,
    };
    return runtimes[scene] ?? null;
  }

  function objectsNamed(root, name) {
    const objects = [];
    root?.traverse((object) => { if (object.isMesh && object.name === name) objects.push(object); });
    return objects;
  }

  function allMeshes(root) {
    const meshes = [];
    root?.traverse((object) => { if (object.isMesh) meshes.push(object); });
    return meshes;
  }

  function uniqueObjects(objects) {
    return [...new Map(objects.filter(Boolean).map((object) => [object.uuid, object])).values()];
  }

  function boundsOf(object) {
    object.updateWorldMatrix(true, false);
    return new THREE.Box3().setFromObject(object);
  }

  function centreOf(object) {
    return boundsOf(object).getCenter(new THREE.Vector3());
  }

  function overlapAxis(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  function footprintArea(a, b) {
    return overlapAxis(a.min.x, a.max.x, b.min.x, b.max.x)
      * overlapAxis(a.min.z, a.max.z, b.min.z, b.max.z);
  }

  function positiveFootprint(a, b, epsilon = 1e-4) {
    return overlapAxis(a.min.x, a.max.x, b.min.x, b.max.x) > epsilon
      && overlapAxis(a.min.z, a.max.z, b.min.z, b.max.z) > epsilon;
  }

  function overlapVolume(a, b) {
    return footprintArea(a, b) * overlapAxis(a.min.y, a.max.y, b.min.y, b.max.y);
  }

  function positiveVolume(a, b, epsilon = 1e-4) {
    return positiveFootprint(a, b, epsilon)
      && overlapAxis(a.min.y, a.max.y, b.min.y, b.max.y) > epsilon;
  }

  function containedInFootprint(inner, outer, epsilon = 1e-4) {
    return inner.min.x >= outer.min.x - epsilon && inner.max.x <= outer.max.x + epsilon
      && inner.min.z >= outer.min.z - epsilon && inner.max.z <= outer.max.z + epsilon;
  }

  function boxGap(a, b) {
    return Math.hypot(
      Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
      Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0),
      Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0),
    );
  }

  function effectivelyVisible(object) {
    for (let current = object; current; current = current.parent) {
      if (current.visible === false) return false;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.every((material) => material?.visible !== false && (material?.opacity ?? 1) > 0.01);
  }

  function horizontalPlaneBoxes(scene, wantedY = null) {
    return horizontalPlaneEntries(scene, wantedY).map(({ box }) => box);
  }

  function horizontalPlaneEntries(scene, wantedY = null) {
    const floors = [];
    scene.traverse((object) => {
      if (!object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
      const box = boundsOf(object);
      if (Math.abs(box.max.y - box.min.y) > 1e-4) return;
      if (wantedY !== null && (Math.abs(box.min.y - wantedY) > 1e-4
          || Math.abs(box.max.y - wantedY) > 1e-4)) return;
      floors.push({ object, box });
    });
    return floors;
  }

  function boxMatchesRect(box, rect, y, epsilon = 1e-4) {
    return rect
      && Math.abs(box.min.x - rect.x0) <= epsilon
      && Math.abs(box.max.x - rect.x1) <= epsilon
      && Math.abs(box.min.z - rect.z0) <= epsilon
      && Math.abs(box.max.z - rect.z1) <= epsilon
      && Math.abs(box.min.y - y) <= epsilon
      && Math.abs(box.max.y - y) <= epsilon;
  }

  function supportProofBox(bodyBox, supportBox, margin = 0.12) {
    return new THREE.Box3(
      new THREE.Vector3(
        Math.max(supportBox.min.x, bodyBox.min.x - margin),
        supportBox.max.y - 0.002,
        Math.max(supportBox.min.z, bodyBox.min.z - margin),
      ),
      new THREE.Vector3(
        Math.min(supportBox.max.x, bodyBox.max.x + margin),
        supportBox.max.y + 0.002,
        Math.min(supportBox.max.z, bodyBox.max.z + margin),
      ),
    );
  }

  function evidencePart(object, id, proofBox = null) {
    return { object, id, proofBox };
  }

  function normalizedEvidencePart(value, id) {
    if (!value) return null;
    if (value.object) {
      return {
        object: value.object,
        id: value.id || id,
        proofBox: value.proofBox || null,
      };
    }
    return evidencePart(value, id);
  }

  function normalizedEvidenceParts(values, prefix) {
    const seen = new Set();
    return (values ?? []).map((value, index) => normalizedEvidencePart(value, `${prefix}.${index}`))
      .filter((part) => {
        if (!part?.object || !effectivelyVisible(part.object)) return false;
        const key = `${part.id}\0${part.object.uuid}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function partBounds(part) {
    return part.proofBox?.clone?.() || boundsOf(part.object);
  }

  function ownershipProof(ownerIds, dependentIds, edges) {
    const distribution = Object.fromEntries(ownerIds.map((id) => [id, 0]));
    const edgeCounts = Object.fromEntries(dependentIds.map((id) => [id, 0]));
    for (const edge of edges) {
      distribution[edge.owner] = (distribution[edge.owner] ?? 0) + 1;
      edgeCounts[edge.dependent] = (edgeCounts[edge.dependent] ?? 0) + 1;
    }
    return {
      ownerIds: [...ownerIds],
      dependentIds: [...dependentIds],
      edges: edges.map(({ dependent, owner, gapM, overlapM2 }) => ({
        dependent, owner, gapM: round(gapM), overlapM2: round(overlapM2),
      })),
      distribution,
      unowned: dependentIds.filter((id) => edgeCounts[id] === 0).length,
      multiplyOwned: dependentIds.filter((id) => edgeCounts[id] > 1).length,
    };
  }

  function tangentSupportStats(items, supportsFor, tolerance) {
    const gaps = [];
    const overlaps = [];
    let supported = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const candidates = supportsFor(index).filter((support) => positiveFootprint(item, support));
      const ranked = candidates.map((support) => ({
        gap: item.min.y - support.max.y,
        overlap: footprintArea(item, support),
      })).sort((left, right) => Math.abs(left.gap) - Math.abs(right.gap));
      if (!ranked.length) {
        gaps.push(Number.NaN);
        overlaps.push(Number.NaN);
        continue;
      }
      gaps.push(ranked[0].gap);
      overlaps.push(ranked[0].overlap);
      if (Math.abs(ranked[0].gap) <= tolerance) supported += 1;
    }
    return {
      supported,
      maxAbsGap: maxAbs(gaps),
      minOverlap: minFinite(overlaps),
    };
  }

  function nearestPair(objects) {
    if (objects.length <= 2) return objects;
    let best = [objects[0], objects[1]];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let left = 0; left < objects.length; left += 1) {
      const a = centreOf(objects[left]);
      for (let right = left + 1; right < objects.length; right += 1) {
        const distance = a.distanceToSquared(centreOf(objects[right]));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [objects[left], objects[right]];
        }
      }
    }
    return best;
  }

  function buildSilverCrates(scene, runtime) {
    const crates = objectsNamed(scene, 'produce-crate');
    const boxes = crates.map(boundsOf);
    const prep = runtime.ROOMS?.prep;
    const prepFloorRects = prep ? [
      { id: 'prep-floor.east:[20,24]x[-2,8]@0', x0: 20, x1: prep.x1, z0: prep.z0, z1: prep.z1 },
      { id: 'prep-floor.west-south:[15,20]x[-2,-0.6]@0', x0: prep.x0, x1: 20, z0: prep.z0, z1: -0.6 },
      { id: 'prep-floor.west-north:[15,20]x[2.6,8]@0', x0: prep.x0, x1: 20, z0: 2.6, z1: prep.z1 },
    ] : [];
    const prepFloor = horizontalPlaneEntries(scene, 0).flatMap((entry) => {
      if (!effectivelyVisible(entry.object)) return [];
      const rect = prepFloorRects.find((candidate) => boxMatchesRect(entry.box, candidate, 0));
      return rect ? [{ ...entry, ownerId: rect.id }] : [];
    });
    const links = [];
    const dependents = crates.map((crate, index) => {
      const centre = centreOf(crate);
      const id = `produce-crate@${round(centre.x, 1)},${round(centre.z, 1)}`;
      const candidates = prepFloor.filter(({ box }) => positiveFootprint(boxes[index], box))
        .map((floor) => ({
          ...floor,
          gap: boxes[index].min.y - floor.box.max.y,
          overlap: footprintArea(boxes[index], floor.box),
        }))
        .sort((left, right) => Math.abs(left.gap) - Math.abs(right.gap));
      const selected = candidates[0];
      if (selected && Math.abs(selected.gap) <= 1e-4) {
        links.push({
          dependent: id, owner: selected.ownerId, gapM: selected.gap,
          overlapM2: selected.overlap, bodyObject: crate, bodyBox: boxes[index],
          supportObject: selected.object, supportBox: selected.box, type: 'floor',
        });
      }
      return id;
    });
    const focusCrates = nearestPair(crates);
    const focusLinks = focusCrates.map((crate) => links.find(({ bodyObject }) => bodyObject === crate)).filter(Boolean);
    const bodyParts = focusLinks.map((link) => evidencePart(
      link.bodyObject, `${link.dependent}.body`, link.bodyBox,
    ));
    const supportParts = focusLinks.map((link) => evidencePart(
      link.supportObject, `${link.dependent}.support`, supportProofBox(link.bodyBox, link.supportBox),
    ));
    return {
      ledger: {
        'crates.count': crates.length,
        'crates.supported': links.length,
        'crates.floorSupportLinks': links.filter(({ type }) => type === 'floor').length,
        'crates.lowerCrateSupportLinks': links.filter(({ type }) => type === 'crate').length,
        'crates.selfSupportLinks': links.filter(({ bodyObject, supportObject }) => bodyObject === supportObject).length,
        'crates.maxAbsSupportGapM': maxAbs(links.map(({ gapM }) => gapM)),
        'crates.minSupportOverlapM2': minFinite(links.map(({ overlapM2 }) => overlapM2)),
      },
      ownership: ownershipProof(prepFloor.map(({ ownerId }) => ownerId), dependents, links),
      focusGroups: { body: bodyParts, support: supportParts },
      visualOwners: focusLinks.map((link, index) => ({
        id: link.dependent,
        body: [bodyParts[index]], support: [supportParts[index]], connected: true,
      })),
    };
  }

  function buildSilverBanquettes(scene, runtime) {
    const orderedNamed = (name) => objectsNamed(scene, name).toSorted(
      (left, right) => centreOf(left).z - centreOf(right).z,
    );
    const bases = orderedNamed('east-banquette-seat-base');
    const backs = orderedNamed('east-banquette-back');
    const plinths = orderedNamed('east-banquette-plinth');
    const baseBoxes = bases.map(boundsOf);
    const backBoxes = backs.map(boundsOf);
    const plinthBoxes = plinths.map(boundsOf);
    const diningRect = runtime.ROOMS?.floor;
    const diningFloor = horizontalPlaneEntries(scene, 0).find(({ object, box }) => (
      effectivelyVisible(object) && boxMatchesRect(box, diningRect, 0)
    ));
    const floorBox = diningFloor?.box;
    const floorId = 'dining-floor:[-30,10]x[-8,26]@0';
    const ids = [-3, 2.2, 7.4, 12.6, 17.8].map((z) => ({
      z,
      plinth: `silver-east-banquette@${z}.plinth`,
      base: `silver-east-banquette@${z}.base`,
      back: `silver-east-banquette@${z}.back`,
    }));
    const ownerIds = [floorId, ...ids.map(({ plinth }) => plinth), ...ids.map(({ base }) => base)];
    const dependentIds = ids.flatMap(({ plinth, base, back }) => [plinth, base, back]);
    const edges = [];
    const seatGaps = [];
    const overlaps = [];
    const floorGaps = [];
    const visualOwners = [];
    let joined = 0;
    let grounded = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const baseObject = bases[index];
      const backObject = backs[index];
      const plinthObject = plinths[index];
      const base = baseBoxes[index];
      const back = backBoxes[index];
      const plinth = plinthBoxes[index];
      const floorGap = floorBox && plinth ? plinth.min.y - floorBox.max.y : Number.NaN;
      const gap = base && plinth ? base.min.y - plinth.max.y : Number.NaN;
      const overlap = base && plinth ? footprintArea(base, plinth) : Number.NaN;
      floorGaps.push(floorGap);
      seatGaps.push(gap);
      overlaps.push(overlap);
      const onFloor = Boolean(floorBox && plinth && positiveFootprint(plinth, floorBox)
        && Math.abs(floorGap) <= 1e-4);
      const onPlinth = Boolean(base && plinth && positiveFootprint(base, plinth)
        && Math.abs(gap) <= 1e-4);
      const onBase = Boolean(base && back && positiveVolume(base, back));
      if (onFloor) {
        grounded += 1;
        edges.push({
          dependent: id.plinth, owner: floorId, gapM: floorGap,
          overlapM2: footprintArea(plinth, floorBox),
        });
      }
      if (onPlinth) {
        joined += 1;
        edges.push({
          dependent: id.base, owner: id.plinth, gapM: gap,
          overlapM2: overlap,
        });
      }
      if (onBase) {
        edges.push({
          dependent: id.back, owner: id.base, gapM: boxGap(back, base),
          overlapM2: footprintArea(back, base),
        });
      }
      const floorProof = onFloor ? evidencePart(
        diningFloor.object, `${id.plinth}.dining-floor-contact`, supportProofBox(plinth, floorBox),
      ) : null;
      visualOwners.push({
        id: `silver-east-banquette@${id.z}`,
        body: [baseObject, backObject].filter(Boolean),
        support: [plinthObject, floorProof].filter(Boolean),
        connected: onFloor && onPlinth && onBase
          && [baseObject, backObject, plinthObject, diningFloor?.object]
            .filter(Boolean).length === 4
          && [baseObject, backObject, plinthObject, diningFloor?.object]
            .filter(Boolean).every(effectivelyVisible),
      });
    }
    return {
      ledger: {
        'banquettes.bases': bases.length,
        'banquettes.plinths': plinths.length,
        'banquettes.groundedPlinths': grounded,
        'banquettes.joinedBases': joined,
        'banquettes.maxAbsFloorGapM': maxAbs(floorGaps),
        'banquettes.maxAbsSeatGapM': maxAbs(seatGaps),
        'banquettes.minSeatOverlapM2': minFinite(overlaps),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: {
        body: [...bases, ...backs],
        support: visualOwners.flatMap(({ support }) => support),
      },
      visualOwners,
    };
  }

  function buildSilverShelves(scene, runtime) {
    const racks = [];
    scene.traverse((object) => { if (object.name === 'shelving') racks.push(object); });
    racks.sort((left, right) => (
      left.getWorldPosition(new THREE.Vector3()).z - right.getWorldPosition(new THREE.Vector3()).z
    ));
    const rackZs = [-13, -11, -8];
    const floorId = 'dry-store-floor:[15,21]x[-14,-6]@-2.9';
    const dryStoreRect = runtime.ROOMS?.drystore;
    const dryStoreFloor = horizontalPlaneEntries(scene, -2.9).find(({ object, box }) => (
      effectivelyVisible(object) && boxMatchesRect(box, dryStoreRect, -2.9)
    ));
    const floorBox = dryStoreFloor?.box;
    const uprightIds = rackZs.flatMap((z) => Array.from(
      { length: 4 }, (_, upright) => `silver-dry-store-shelving@${z}.upright${upright}`,
    ));
    const ownerIds = [floorId, ...uprightIds];
    const dependentIds = [
      ...uprightIds,
      ...rackZs.flatMap((z) => Array.from(
        { length: 5 },
        (_, board) => Array.from({ length: 4 }, (_, upright) => (
          `silver-dry-store-shelving@${z}.board${board}.upright${upright}.board-upright-joint`
        )),
      ).flat()),
    ];
    const edges = [];
    let boards = 0;
    let uprights = 0;
    let grounded = 0;
    let joins = 0;
    const floorGaps = [];
    const jointVolumes = [];
    const visualOwners = [];
    for (let rackIndex = 0; rackIndex < rackZs.length; rackIndex += 1) {
      const rack = racks[rackIndex];
      const z = rackZs[rackIndex];
      const rackBoards = (rack?.children.filter(
        (child) => child.name === 'dry-store-shelf-board',
      ) ?? []).toSorted((left, right) => centreOf(left).y - centreOf(right).y);
      const rackUprights = (rack?.children.filter(
        (child) => child.name === 'dry-store-shelf-upright',
      ) ?? []).toSorted((left, right) => {
        const a = centreOf(left);
        const b = centreOf(right);
        return a.x - b.x || a.z - b.z;
      });
      boards += rackBoards.length;
      uprights += rackUprights.length;
      const uprightBoxes = rackUprights.map(boundsOf);
      const floorProofs = [];
      let rackGrounded = 0;
      let rackJoins = 0;
      for (let uprightIndex = 0; uprightIndex < uprightBoxes.length; uprightIndex += 1) {
        const upright = uprightBoxes[uprightIndex];
        const uprightId = `silver-dry-store-shelving@${z}.upright${uprightIndex}`;
        const gap = floorBox && positiveFootprint(upright, floorBox)
          ? upright.min.y - floorBox.max.y : Number.NaN;
        floorGaps.push(gap);
        if (Math.abs(gap) <= 1e-4) {
          grounded += 1;
          rackGrounded += 1;
          edges.push({
            dependent: uprightId, owner: floorId, gapM: gap,
            overlapM2: footprintArea(upright, floorBox),
          });
          floorProofs.push(evidencePart(
            dryStoreFloor.object, `${uprightId}.dry-store-floor-contact`,
            supportProofBox(upright, floorBox, 0.08),
          ));
        }
      }
      for (let boardIndex = 0; boardIndex < rackBoards.length; boardIndex += 1) {
        const board = boundsOf(rackBoards[boardIndex]);
        for (let uprightIndex = 0; uprightIndex < uprightBoxes.length; uprightIndex += 1) {
          const upright = uprightBoxes[uprightIndex];
          if (!positiveVolume(board, upright)) continue;
          joins += 1;
          rackJoins += 1;
          jointVolumes.push(overlapVolume(board, upright));
          edges.push({
            dependent: `silver-dry-store-shelving@${z}.board${boardIndex}.upright${uprightIndex}.board-upright-joint`,
            owner: `silver-dry-store-shelving@${z}.upright${uprightIndex}`,
            gapM: boxGap(board, upright), overlapM2: footprintArea(board, upright),
          });
        }
      }
      visualOwners.push({
        id: `silver-dry-store-shelving@${z}`,
        body: rackBoards,
        support: [...rackUprights, ...floorProofs],
        connected: rackBoards.length === 5 && rackUprights.length === 4
          && rackGrounded === 4 && rackJoins === 20
          && [...rackBoards, ...rackUprights, dryStoreFloor?.object]
            .filter(Boolean).length === 10
          && [...rackBoards, ...rackUprights, dryStoreFloor?.object]
            .filter(Boolean).every(effectivelyVisible),
      });
    }
    return {
      ledger: {
        'shelves.racks': racks.length,
        'shelves.boards': boards,
        'shelves.uprights': uprights,
        'shelves.groundedUprights': grounded,
        'shelves.boardUprightJoins': joins,
        'shelves.maxAbsFloorGapM': maxAbs(floorGaps),
        'shelves.minJointVolumeM3': minFinite(jointVolumes),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: {
        body: visualOwners.flatMap(({ body }) => body),
        support: visualOwners.flatMap(({ support }) => support),
      },
      visualOwners,
    };
  }

  function buildCartelTable(scene) {
    const top = objectsNamed(scene, 'mark-dining-table.top');
    const runner = objectsNamed(scene, 'dining-table-runner');
    const candles = objectsNamed(scene, 'dining-candle').toSorted(
      (left, right) => centreOf(left).x - centreOf(right).x,
    );
    const settingGroups = [];
    scene.traverse((object) => {
      if (/^dining-place-setting\.\d+$/.test(object.name)) settingGroups.push(object);
    });
    settingGroups.sort((left, right) => (
      Number(left.name.split('.').at(-1)) - Number(right.name.split('.').at(-1))
    ));
    const settingsByOwner = settingGroups.map((setting, settingIndex) => ({
      setting,
      settingIndex,
      plate: setting.children.find((child) => child.name === 'dining-plate'),
      glass: setting.children.find((child) => child.name === 'dining-glass'),
      napkin: setting.children.find((child) => child.name === 'dining-napkin'),
      rim: setting.children.find((child) => child.name === 'dining-plate-rim'),
      stackId: `dining-place-setting.${settingIndex}.place-setting-stack`,
    }));
    const plates = settingsByOwner.map(({ plate }) => plate).filter(Boolean);
    const glasses = settingsByOwner.map(({ glass }) => glass).filter(Boolean);
    const napkins = settingsByOwner.map(({ napkin }) => napkin).filter(Boolean);
    const rims = settingsByOwner.map(({ rim }) => rim).filter(Boolean);
    const gaps = [];
    let supported = 0;
    const topBox = top.length === 1 ? boundsOf(top[0]) : null;
    const supportY = topBox?.max.y ?? Number.NaN;
    const runnerBox = runner.length === 1 ? boundsOf(runner[0]) : null;
    const topId = 'mark-dining-table.top';
    const runnerId = 'dining-table-runner';
    const ownerIds = [
      topId, runnerId,
      ...Array.from({ length: 8 }, (_, setting) => `dining-place-setting.${setting}.plate`),
    ];
    const dependentIds = [
      runnerId,
      ...Array.from({ length: 7 }, (_, candle) => `dining-candle.${candle}`),
      ...Array.from({ length: 8 }, (_, setting) => [
        `dining-place-setting.${setting}.plate`,
        `dining-place-setting.${setting}.glass`,
        `dining-place-setting.${setting}.napkin`,
        `dining-place-setting.${setting}.rim`,
      ]).flat(),
    ];
    const edges = [];
    const note = (object, dependent, supportBox, owner, gap) => {
      gaps.push(gap);
      if (object && supportBox && positiveFootprint(boundsOf(object), supportBox)
          && Math.abs(gap) <= 1e-4) {
        supported += 1;
        edges.push({
          dependent, owner, gapM: gap,
          overlapM2: footprintArea(boundsOf(object), supportBox),
        });
      }
    };
    if (runnerBox) {
      note(runner[0], runnerId, topBox, topId, runnerBox.min.y - supportY);
    }
    for (const [candleIndex, object] of candles.entries()) {
      note(
        object, `dining-candle.${candleIndex}`, runnerBox, runnerId,
        boundsOf(object).min.y - (runnerBox?.max.y ?? Number.NaN),
      );
    }
    for (const { settingIndex, plate, glass, napkin, rim } of settingsByOwner) {
      const plateId = `dining-place-setting.${settingIndex}.plate`;
      const plateBox = plate ? boundsOf(plate) : null;
      for (const [part, partName] of [[plate, 'plate'], [glass, 'glass'], [napkin, 'napkin']]) {
        if (!part) continue;
        note(
          part, `dining-place-setting.${settingIndex}.${partName}`, topBox, topId,
          boundsOf(part).min.y - supportY,
        );
      }
      if (rim) {
        note(
          rim, `dining-place-setting.${settingIndex}.rim`, plateBox, plateId,
          boundsOf(rim).min.y - (plateBox?.max.y ?? Number.NaN),
        );
      }
    }
    const settings = [...candles, ...plates, ...glasses, ...napkins, ...rims];
    const exactParts = top.length === 1 && runner.length === 1 && candles.length === 7
      && settingsByOwner.length === 8
      && settingsByOwner.every(({ setting, settingIndex, plate, glass, napkin, rim }) => (
        setting.name === `dining-place-setting.${settingIndex}`
        && [plate, glass, napkin, rim].filter(Boolean).length === 4
      ));
    const exactEdge = (dependent, owner) => edges.some((edge) => (
      edge.dependent === dependent && edge.owner === owner
    ));
    const runnerSupport = runnerBox && topBox && exactEdge(runnerId, topId)
      ? evidencePart(
        top[0], 'dining-table-runner.table-top-contact',
        supportProofBox(runnerBox, topBox, 0.08),
      ) : null;
    const visualOwners = [{
      id: 'dining-table-runner-and-candles',
      body: [...runner, ...candles],
      support: [runnerSupport].filter(Boolean),
      connected: exactParts && exactEdge(runnerId, topId)
        && candles.every((_, candle) => exactEdge(`dining-candle.${candle}`, runnerId))
        && [...runner, ...candles, top[0]].filter(Boolean).length === 9
        && [...runner, ...candles, top[0]].filter(Boolean).every(effectivelyVisible),
    }, ...settingsByOwner.map(({ settingIndex, plate, glass, napkin, rim }) => {
      const plateId = `dining-place-setting.${settingIndex}.plate`;
      const plateBox = plate ? boundsOf(plate) : null;
      const tableSupport = plateBox && topBox && exactEdge(plateId, topId)
        ? evidencePart(
          top[0], `dining-place-setting.${settingIndex}.table-top-contact`,
          supportProofBox(plateBox, topBox, 0.08),
        ) : null;
      const bodyParts = [plate, glass, napkin, rim].filter(Boolean);
      return {
        id: `dining-place-setting.${settingIndex}`,
        body: bodyParts,
        support: [tableSupport].filter(Boolean),
        connected: bodyParts.length === 4 && Boolean(tableSupport)
          && exactEdge(plateId, topId)
          && exactEdge(`dining-place-setting.${settingIndex}.glass`, topId)
          && exactEdge(`dining-place-setting.${settingIndex}.napkin`, topId)
          && exactEdge(`dining-place-setting.${settingIndex}.rim`, plateId)
          && [...bodyParts, top[0]].filter(Boolean).every(effectivelyVisible),
      };
    })];
    return {
      ledger: {
        'table.tops': top.length,
        'table.runners': runner.length,
        'table.candles': candles.length,
        'table.plates': plates.length,
        'table.glasses': glasses.length,
        'table.napkins': napkins.length,
        'table.rims': rims.length,
        'table.supportedPieces': supported,
        'table.maxAbsSupportGapM': maxAbs(gaps),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: {
        body: runner,
        support: top,
        settings,
      },
      visualOwners,
    };
  }

  function buildCartelChair(scene) {
    const chair = scene.getObjectByName('office-detail.desk-chair');
    const rug = scene.getObjectByName('office-detail.rug');
    const parts = allMeshes(chair);
    const exact = (name) => parts.filter((object) => object.name === name);
    const seats = exact('office-chair-seat');
    const backs = exact('office-chair-back');
    const cushions = exact('office-chair-cushion');
    const legs = exact('office-chair-leg');
    const seat = seats[0];
    const back = backs[0];
    const cushion = cushions[0];
    const seatBox = seat ? boundsOf(seat) : null;
    const backBox = back ? boundsOf(back) : null;
    const cushionBox = cushion ? boundsOf(cushion) : null;
    const legBoxes = legs.map(boundsOf);
    const rugBox = rug && effectivelyVisible(rug) ? boundsOf(rug) : null;
    const legIds = legs.map((leg, index) => `office-detail.desk-chair.leg${index}`);
    const rugId = 'office-detail.rug';
    const edges = [];
    const rugProofs = [];
    let rugTouching = 0;
    let connectedParts = seat ? 1 : 0;
    if (seatBox && backBox && positiveVolume(seatBox, backBox)) connectedParts += 1;
    if (seatBox && cushionBox && positiveVolume(seatBox, cushionBox)) connectedParts += 1;
    for (const [index, legBox] of legBoxes.entries()) {
      const joined = seatBox && positiveFootprint(seatBox, legBox)
        && overlapAxis(seatBox.min.y, seatBox.max.y, legBox.min.y, legBox.max.y) > 1e-4;
      if (joined) connectedParts += 1;
      const signedGap = rugBox ? legBox.min.y - rugBox.max.y : Number.NaN;
      const touchesRug = rugBox && positiveFootprint(legBox, rugBox)
        && signedGap >= -0.003 && signedGap <= 0.002;
      if (touchesRug) {
        rugTouching += 1;
        edges.push({
          dependent: legIds[index], owner: rugId,
          gapM: boxGap(legBox, rugBox), overlapM2: footprintArea(legBox, rugBox),
        });
        rugProofs.push(evidencePart(
          rug, `${legIds[index]}.rug-contact`, supportProofBox(legBox, rugBox),
        ));
      }
    }
    const exactStructure = seats.length === 1 && backs.length === 1
      && cushions.length === 1 && legs.length === 4 && parts.length === 7;
    const connected = exactStructure && connectedParts === 7 && rugTouching === 4;
    return {
      ledger: {
        'chair.roots': chair ? 1 : 0,
        'chair.visibleParts': parts.filter(effectivelyVisible).length,
        'chair.namedLegs': legs.length,
        'chair.connectedParts': connectedParts,
        'chair.rugTouchingParts': rugTouching,
        'chair.maxRugContactGapM': maxAbs(edges.map(({ gapM }) => gapM)),
      },
      ownership: ownershipProof([rugId], legIds, edges),
      focusGroups: {
        body: [seat, back, cushion, ...legs].filter(Boolean),
        support: rugProofs,
      },
      visualOwners: [{
        id: 'office-detail.desk-chair',
        body: [seat, back, cushion, ...legs].filter(Boolean),
        support: rugProofs,
        connected,
      }],
    };
  }

  function buildMansionCouches(scene) {
    const bases = objectsNamed(scene, 'couch-base').toSorted(
      (left, right) => centreOf(left).x - centreOf(right).x,
    );
    const feet = objectsNamed(scene, 'couch-foot');
    const floor = objectsNamed(scene, 'living-floor');
    const candidateFloorBox = floor.length === 1 ? boundsOf(floor[0]) : null;
    const livingFloor = candidateFloorBox
      && Math.abs(candidateFloorBox.min.x + 16) <= 1e-4
      && Math.abs(candidateFloorBox.max.x + 9.15) <= 1e-4
      && Math.abs(candidateFloorBox.min.z - 36) <= 1e-4
      && Math.abs(candidateFloorBox.max.z - 57.85) <= 1e-4
      && Math.abs(candidateFloorBox.min.y - 1.2) <= 1e-4
      && Math.abs(candidateFloorBox.max.y - 1.22) <= 1e-4
      && effectivelyVisible(floor[0]) ? floor[0] : null;
    const floorBox = livingFloor ? candidateFloorBox : null;
    const floorId = 'living-floor:[-16,-9.15]x[36,57.85]@1.22';
    const floorY = floorBox?.max.y ?? Number.NaN;
    const footBoxes = feet.map(boundsOf);
    const floorGaps = footBoxes.map((foot) => foot.min.y - floorY);
    const grounded = footBoxes.filter((foot, index) => (
      floorBox && positiveFootprint(foot, floorBox) && Math.abs(floorGaps[index]) <= 1e-4
    )).length;
    let joined = 0;
    const baseGaps = [];
    for (const base of bases.map(boundsOf)) {
      for (const foot of footBoxes) {
        if (!positiveFootprint(base, foot)) continue;
        const gap = base.min.y - foot.max.y;
        if (Math.abs(gap) <= 1e-4) {
          joined += 1;
          baseGaps.push(gap);
        }
      }
    }
    const couchIds = [
      'mansion-living-couch@-15.1,47.8',
      'mansion-living-couch@-12.5,45.3',
      'mansion-living-couch@-9.9,47.8',
    ];
    const footIds = couchIds.flatMap((couch) => (
      Array.from({ length: 4 }, (_, foot) => `${couch}.foot${foot}`)
    ));
    const ownerIds = [floorId, ...footIds, ...couchIds.map((couch) => `${couch}.base`)];
    const dependentIds = couchIds.flatMap((couch) => [
      ...Array.from({ length: 4 }, (_, foot) => `${couch}.foot${foot}`),
      ...Array.from({ length: 4 }, (_, foot) => `${couch}.base-foot${foot}.joint`),
      ...['back', 'arm-left', 'arm-right', 'cushion-left', 'cushion-right'].map(
        (part) => `${couch}.${part}.couch-body-part`,
      ),
    ]);
    const edges = [];
    const visualOwners = [];
    for (let couchIndex = 0; couchIndex < couchIds.length; couchIndex += 1) {
      const couchId = couchIds[couchIndex];
      const base = bases[couchIndex];
      const couchRoot = base?.parent;
      const couchMeshes = allMeshes(couchRoot);
      const couchFeet = couchMeshes.filter((object) => object.name === 'couch-foot').toSorted(
        (left, right) => {
          const a = centreOf(left);
          const b = centreOf(right);
          return a.x - b.x || a.z - b.z;
        },
      );
      const back = couchMeshes.find((object) => object.name === 'couch-back');
      const unnamed = couchRoot?.children.filter((object) => object.isMesh && !object.name) ?? [];
      const arms = unnamed.filter((object) => (
        Math.abs(object.geometry?.parameters?.height - 0.38) <= 1e-4
      )).toSorted((left, right) => left.position.x - right.position.x);
      const cushions = unnamed.filter((object) => (
        Math.abs(object.geometry?.parameters?.height - 0.14) <= 1e-4
      )).toSorted((left, right) => left.position.x - right.position.x);
      const bodyParts = [base, back, ...arms, ...cushions].filter(Boolean);
      const baseBox = base ? boundsOf(base) : null;
      const floorProofs = [];
      let couchGrounded = 0;
      let couchJoined = 0;
      let bodyJoined = 0;
      for (let footIndex = 0; footIndex < couchFeet.length; footIndex += 1) {
        const foot = couchFeet[footIndex];
        const footBox = boundsOf(foot);
        const footId = `${couchId}.foot${footIndex}`;
        const floorGap = floorBox && positiveFootprint(footBox, floorBox)
          ? footBox.min.y - floorBox.max.y : Number.NaN;
        const baseGap = baseBox && positiveFootprint(footBox, baseBox)
          ? baseBox.min.y - footBox.max.y : Number.NaN;
        if (Math.abs(floorGap) <= 1e-4) {
          couchGrounded += 1;
          edges.push({
            dependent: footId, owner: floorId, gapM: floorGap,
            overlapM2: footprintArea(footBox, floorBox),
          });
          floorProofs.push(evidencePart(
            livingFloor, `${footId}.living-floor-contact`,
            supportProofBox(footBox, floorBox, 0.08),
          ));
        }
        if (Math.abs(baseGap) <= 1e-4) {
          couchJoined += 1;
          edges.push({
            dependent: `${couchId}.base-foot${footIndex}.joint`, owner: footId,
            gapM: baseGap, overlapM2: footprintArea(baseBox, footBox),
          });
        }
      }
      for (const [partIndex, [partName, part]] of [
        ['back', back], ['arm-left', arms[0]], ['arm-right', arms[1]],
        ['cushion-left', cushions[0]], ['cushion-right', cushions[1]],
      ].entries()) {
        if (!part || !baseBox) continue;
        const partBox = boundsOf(part);
        if (!positiveVolume(partBox, baseBox)) continue;
        bodyJoined += 1;
        edges.push({
          dependent: `${couchId}.${partName}.couch-body-part`, owner: `${couchId}.base`,
          gapM: boxGap(partBox, baseBox), overlapM2: footprintArea(partBox, baseBox),
        });
      }
      visualOwners.push({
        id: couchId,
        body: bodyParts,
        support: [...couchFeet, ...floorProofs],
        connected: couchMeshes.length === 10 && bodyParts.length === 6 && couchFeet.length === 4
          && couchGrounded === 4 && couchJoined === 4 && bodyJoined === 5
          && [...couchMeshes, livingFloor].filter(Boolean).length === 11
          && [...couchMeshes, livingFloor].filter(Boolean).every(effectivelyVisible),
      });
    }
    return {
      ledger: {
        'couches.bases': bases.length,
        'couches.feet': feet.length,
        'couches.groundedFeet': grounded,
        'couches.joinedFeet': joined,
        'couches.maxAbsFloorGapM': maxAbs(floorGaps),
        'couches.maxAbsBaseGapM': maxAbs(baseGaps),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: {
        body: visualOwners.flatMap(({ body }) => body),
        support: visualOwners.flatMap(({ support }) => support),
      },
      visualOwners,
    };
  }

  function buildNoWakeCleats(scene) {
    const cleats = [];
    scene.traverse((object) => {
      if (object.isMesh && /^neighbor cleat (?:port|starboard) [12]$/.test(object.name)) cleats.push(object);
    });
    const boats = uniqueObjects(cleats.map(({ parent }) => parent)).sort((left, right) => (
      String(left.name).localeCompare(String(right.name))
    ));
    const deckForBoat = new Map(boats.map((boat) => [
      boat, boat.children.find((child) => child.name === 'neighbor deck sole'),
    ]));
    const exactDeck = (boat, deck) => deck?.parent === boat
      && effectivelyVisible(deck)
      && deck.geometry?.type === 'BoxGeometry'
      && Math.abs(deck.geometry.parameters.width - 3.12) <= 1e-6
      && Math.abs(deck.geometry.parameters.height - 0.12) <= 1e-6
      && Math.abs(deck.geometry.parameters.depth - 7.65) <= 1e-6
      && Math.abs(deck.position.x) <= 1e-6
      && Math.abs(deck.position.y - 0.61) <= 1e-6
      && Math.abs(deck.position.z - 0.2) <= 1e-6;
    const exactCleat = (cleat) => cleat.geometry?.type === 'BoxGeometry'
      && effectivelyVisible(cleat)
      && Math.abs(cleat.geometry.parameters.width - 0.34) <= 1e-6
      && Math.abs(cleat.geometry.parameters.height - 0.055) <= 1e-6
      && Math.abs(cleat.geometry.parameters.depth - 0.10) <= 1e-6;
    const decks = boats.map((boat) => deckForBoat.get(boat)).filter(Boolean);
    const gaps = [];
    const overlaps = [];
    let supported = 0;
    const ownerIds = boats.map((boat) => `${boat.name}.neighbor deck sole`);
    const dependentIds = [];
    const edges = [];
    const links = [];
    for (const cleat of cleats) {
      const boatIndex = boats.indexOf(cleat.parent);
      const deck = deckForBoat.get(cleat.parent);
      const cleatBox = boundsOf(cleat);
      const deckBox = deck ? boundsOf(deck) : null;
      const gap = deckBox ? cleatBox.min.y - deckBox.max.y : Number.NaN;
      const overlap = deckBox ? footprintArea(cleatBox, deckBox) : Number.NaN;
      const dependent = `${cleat.parent?.name}.${cleat.name}`;
      dependentIds.push(dependent);
      gaps.push(gap);
      overlaps.push(overlap);
      if (exactDeck(cleat.parent, deck) && exactCleat(cleat)
          && deckBox && positiveFootprint(cleatBox, deckBox) && Math.abs(gap) <= 1e-4) {
        supported += 1;
        const edge = {
          dependent, owner: ownerIds[boatIndex], gapM: gap, overlapM2: overlap,
        };
        edges.push(edge);
        links.push({ ...edge, cleat, cleatBox, deck, deckBox });
      }
    }
    const boat = boats[0];
    const focusLinks = links.filter(({ cleat }) => cleat.parent === boat);
    const focusCleats = focusLinks.map(({ cleat }) => cleat);
    const deckProofs = focusLinks.map((link) => evidencePart(
      link.deck, `${link.dependent}.deck-contact`, supportProofBox(link.cleatBox, link.deckBox, 0.18),
    ));
    return {
      ledger: {
        'cleats.count': cleats.length,
        'cleats.decks': decks.length,
        'cleats.supported': supported,
        'cleats.maxAbsDeckGapM': maxAbs(gaps),
        'cleats.minDeckOverlapM2': minFinite(overlaps),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: { body: focusCleats, support: deckProofs },
      visualOwners: focusLinks.map((link, index) => {
        const cleat = link.cleat;
        const deck = deckProofs[index];
        return {
          id: link.dependent,
          body: [cleat],
          support: [deck],
          connected: true,
        };
      }),
    };
  }

  function buildMotelChairs(runtime, scene) {
    const chairs = runtime.refs?.chairs ?? [];
    const room12 = runtime.level?.rects?.ROOM12;
    const roomTwelveFloor = horizontalPlaneEntries(scene, 0.02)
      .find(({ object, box }) => effectivelyVisible(object) && boxMatchesRect(box, room12, 0.02));
    let feetCount = 0;
    let grounded = 0;
    let joined = 0;
    const floorGaps = [];
    const seatGaps = [];
    const body = [];
    const support = [];
    const ownerFeet = [];
    const edges = [];
    const dependents = [];
    const visualOwners = [];
    for (const [chairIndex, chair] of chairs.entries()) {
      const seat = chair.children.find((child) => child.name === 'motel-dining-chair-seat');
      const back = chair.children.find((child) => child.name === 'motel-dining-chair-back');
      const feet = chair.children.filter((child) => child.name === 'motel-dining-chair-foot');
      body.push(...[seat, back].filter(Boolean));
      ownerFeet.push(feet.length);
      feetCount += feet.length;
      const seatBox = seat ? boundsOf(seat) : null;
      const backBox = back ? boundsOf(back) : null;
      let ownerConnected = Boolean(seat && back && feet.length === 4
        && seatBox && backBox && seatBox.intersectsBox(backBox));
      const floorProofs = [];
      for (const [footIndex, foot] of feet.entries()) {
        const footBox = boundsOf(foot);
        const floorGap = roomTwelveFloor && positiveFootprint(footBox, roomTwelveFloor.box)
          ? footBox.min.y - roomTwelveFloor.box.max.y : Number.NaN;
        const seatGap = seatBox ? seatBox.min.y - footBox.max.y : Number.NaN;
        const dependent = `${chair.name || `motel-room12-dining-chair.${chairIndex}`}.foot${footIndex}`;
        dependents.push(dependent);
        floorGaps.push(floorGap);
        seatGaps.push(seatGap);
        const onFloor = Math.abs(floorGap) <= 1e-4;
        const onSeat = seatBox && positiveFootprint(seatBox, footBox) && Math.abs(seatGap) <= 1e-4;
        if (onFloor) {
          grounded += 1;
          edges.push({
            dependent, owner: 'room12-carpet:[-5,5]x[-15.5,-4.5]@0.02', gapM: floorGap,
            overlapM2: footprintArea(footBox, roomTwelveFloor.box),
          });
          floorProofs.push(evidencePart(
            roomTwelveFloor.object, `${dependent}.room12-carpet-contact`,
            supportProofBox(footBox, roomTwelveFloor.box),
          ));
        }
        if (onSeat) joined += 1;
        ownerConnected &&= Boolean(onFloor && onSeat);
      }
      support.push(...feet, ...floorProofs);
      visualOwners.push({
        id: chair.name || `motel-room12-dining-chair.${chairIndex}`,
        body: [seat, back].filter(Boolean), support: [...feet, ...floorProofs],
        connected: ownerConnected && floorProofs.length === 4,
      });
    }
    return {
      ledger: {
        'chairs.count': chairs.length,
        'chairs.feet': feetCount,
        'chairs.owner0Feet': ownerFeet[0] ?? 0,
        'chairs.owner1Feet': ownerFeet[1] ?? 0,
        'chairs.groundedFeet': grounded,
        'chairs.joinedFeet': joined,
        'chairs.maxAbsFloorGapM': maxAbs(floorGaps),
        'chairs.maxAbsSeatGapM': maxAbs(seatGaps),
      },
      ownership: ownershipProof(
        ['room12-carpet:[-5,5]x[-15.5,-4.5]@0.02'], dependents, edges,
      ),
      focusGroups: { body, support },
      visualOwners,
    };
  }

  function buildMotelLoungers(runtime) {
    const loungers = (runtime.refs?.poolFurniture ?? []).filter((item) => item.deck);
    const deckObjects = runtime.refs?.poolDeck ?? [];
    const decks = deckObjects.map(boundsOf);
    const deckRects = [
      { x0: 11.5, x1: 14, z0: 4.5, z1: 22 },
      { x0: 30, x1: 32.5, z0: 4.5, z1: 22 },
      { x0: 14, x1: 30, z0: 4.5, z1: 6 },
      { x0: 14, x1: 30, z0: 20, z1: 22 },
    ];
    const exactDeck = (index) => deckObjects[index]?.geometry?.type === 'BoxGeometry'
      && effectivelyVisible(deckObjects[index])
      && Math.abs(decks[index]?.min.x - deckRects[index].x0) <= 1e-4
      && Math.abs(decks[index]?.max.x - deckRects[index].x1) <= 1e-4
      && Math.abs(decks[index]?.min.z - deckRects[index].z0) <= 1e-4
      && Math.abs(decks[index]?.max.z - deckRects[index].z1) <= 1e-4
      && Math.abs(decks[index]?.min.y - (-0.02)) <= 1e-4
      && Math.abs(decks[index]?.max.y - 0.06) <= 1e-4;
    const deckIds = [
      'pool-deck.0-west:[11.5,14]x[4.5,22]',
      'pool-deck.1-east:[30,32.5]x[4.5,22]',
      'pool-deck.2-south:[14,30]x[4.5,6]',
      'pool-deck.3-north:[14,30]x[20,22]',
    ];
    let feetCount = 0;
    let grounded = 0;
    let joined = 0;
    let joinedBacks = 0;
    const deckGaps = [];
    const seatGaps = [];
    const ownerFeet = [];
    const dependents = [];
    const edges = [];
    const body = [];
    const support = [];
    const visualOwners = [];
    for (const [loungeIndex, item] of loungers.entries()) {
      const seat = item.group.getObjectByName('motel-pool-lounge-seat');
      const back = item.group.getObjectByName('motel-pool-lounge-back');
      const feet = item.group.children.filter((child) => child.name === 'motel-pool-lounge-foot');
      body.push(...[seat, back].filter(Boolean));
      ownerFeet.push(feet.length);
      feetCount += feet.length;
      const seatBox = seat ? boundsOf(seat) : null;
      const backBox = back ? boundsOf(back) : null;
      const backJoined = Boolean(seatBox && backBox && seatBox.intersectsBox(backBox));
      if (backJoined) joinedBacks += 1;
      let ownerConnected = Boolean(seat && back && feet.length === 4 && backJoined);
      const floorProofs = [];
      for (const [footIndex, foot] of feet.entries()) {
        const footBox = boundsOf(foot);
        const wantedDeckIndex = loungeIndex;
        const wantedDeck = decks[wantedDeckIndex];
        const deckGap = exactDeck(wantedDeckIndex) && positiveFootprint(footBox, wantedDeck)
          ? footBox.min.y - wantedDeck.max.y : Number.NaN;
        const seatGap = seatBox ? seatBox.min.y - footBox.max.y : Number.NaN;
        const dependent = `${item.id}.foot${footIndex}`;
        dependents.push(dependent);
        deckGaps.push(deckGap);
        seatGaps.push(seatGap);
        const onDeck = Math.abs(deckGap) <= 1e-4;
        const onSeat = seatBox && positiveFootprint(seatBox, footBox) && Math.abs(seatGap) <= 1e-4;
        if (onDeck) {
          grounded += 1;
          edges.push({
            dependent, owner: deckIds[wantedDeckIndex], gapM: deckGap,
            overlapM2: footprintArea(footBox, wantedDeck),
          });
          floorProofs.push(evidencePart(
            deckObjects[wantedDeckIndex], `${dependent}.deck-contact`,
            supportProofBox(footBox, wantedDeck),
          ));
        }
        if (onSeat) joined += 1;
        ownerConnected &&= Boolean(onDeck && onSeat);
      }
      support.push(...feet, ...floorProofs);
      visualOwners.push({
        id: item.id,
        body: [seat, back].filter(Boolean),
        support: [...feet, ...floorProofs],
        connected: ownerConnected && floorProofs.length === 4,
      });
    }
    return {
      ledger: {
        'loungers.count': loungers.length,
        'loungers.feet': feetCount,
        'loungers.owner0Feet': ownerFeet[0] ?? 0,
        'loungers.owner1Feet': ownerFeet[1] ?? 0,
        'loungers.groundedFeet': grounded,
        'loungers.joinedFeet': joined,
        'loungers.joinedBacks': joinedBacks,
        'loungers.maxAbsDeckGapM': maxAbs(deckGaps),
        'loungers.maxAbsSeatGapM': maxAbs(seatGaps),
      },
      ownership: ownershipProof(
        deckIds.filter((_, index) => exactDeck(index)), dependents, edges,
      ),
      focusGroups: { body, support },
      visualOwners,
    };
  }

  function buildMotelCrates(runtime, scene) {
    const crates = (runtime.refs?.crates?.group?.children ?? []).filter((object) => object.isMesh);
    const boxes = crates.map(boundsOf);
    const room11 = runtime.level?.rects?.ROOM11;
    const roomElevenFloor = horizontalPlaneEntries(scene, 0.02)
      .find(({ object, box }) => effectivelyVisible(object) && boxMatchesRect(box, room11, 0.02));
    const floorId = 'room11-floor:[-17,-7]x[-15.5,-4.5]@0.02';
    const crateIds = crates.map((_, index) => `motel-shipment-crate.${index}`);
    const expectedOwner = [floorId, floorId, crateIds[0], crateIds[1], crateIds[2]];
    const edges = [];
    const links = [];
    const gaps = [];
    const overlaps = [];
    for (const [index, crate] of crates.entries()) {
      const supportObject = index < 2 ? roomElevenFloor?.object : crates[index - 2];
      const supportBox = index < 2 ? roomElevenFloor?.box : boxes[index - 2];
      const bodyBox = boxes[index];
      const gap = supportBox && positiveFootprint(bodyBox, supportBox)
        ? bodyBox.min.y - supportBox.max.y : Number.NaN;
      const overlap = supportBox ? footprintArea(bodyBox, supportBox) : Number.NaN;
      gaps.push(gap);
      overlaps.push(overlap);
      if (supportObject && supportBox && Math.abs(gap) <= 1e-4) {
        const edge = {
          dependent: crateIds[index], owner: expectedOwner[index],
          gapM: gap, overlapM2: overlap,
        };
        edges.push(edge);
        links.push({ ...edge, bodyObject: crate, bodyBox, supportObject, supportBox });
      }
    }
    const floorProofs = links.filter(({ owner }) => owner === floorId).map((link) => evidencePart(
      link.supportObject, `${link.dependent}.room11-floor-contact`,
      supportProofBox(link.bodyBox, link.supportBox),
    ));
    const floorProofByDependent = new Map(floorProofs.map((part) => [
      part.id.replace('.room11-floor-contact', ''), part,
    ]));
    return {
      ledger: {
        'crates.count': crates.length,
        'crates.supported': links.length,
        'crates.floorSupportLinks': links.filter(({ owner }) => owner === floorId).length,
        'crates.lowerCrateSupportLinks': links.filter(({ owner }) => owner !== floorId).length,
        'crates.selfSupportLinks': links.filter(({ dependent, owner }) => dependent === owner).length,
        'crates.maxAbsSupportGapM': maxAbs(gaps),
        'crates.minSupportOverlapM2': minFinite(overlaps),
      },
      ownership: ownershipProof([floorId, ...crateIds], crateIds, edges),
      focusGroups: {
        body: crates,
        support: [...floorProofs, ...crates.slice(0, 3)],
      },
      visualOwners: links.map((link) => ({
        id: link.dependent,
        body: [link.bodyObject],
        support: link.owner === floorId
          ? [floorProofByDependent.get(link.dependent)] : [link.supportObject],
        connected: true,
      })),
    };
  }

  function buildBeefrunShelter(runtime) {
    const airstrip = runtime.mission?.airstrip;
    const shelter = airstrip?.root?.getObjectByName('shelter');
    const meshes = allMeshes(shelter);
    const furniture = [
      ['shelter-bench', 'shelter-bench-seat', 'shelter-bench-leg', 2],
      ['shelter-table', 'shelter-table-top', 'shelter-table-leg', 4],
    ];
    const terrainId = 'airstrip.groundAt:terrainHeight';
    const legIds = [
      ...Array.from({ length: 2 }, (_, leg) => `shelter-bench.leg${leg}`),
      ...Array.from({ length: 4 }, (_, leg) => `shelter-table.leg${leg}`),
    ];
    const ownerIds = [terrainId, ...legIds];
    const dependentIds = [
      ...legIds,
      ...Array.from({ length: 2 }, (_, leg) => (
        `shelter-bench.surface-leg${leg}.surface-leg-joint`
      )),
      ...Array.from({ length: 4 }, (_, leg) => (
        `shelter-table.surface-leg${leg}.surface-leg-joint`
      )),
    ];
    const edges = [];
    let grounded = 0;
    let joined = 0;
    let contained = 0;
    const terrainDeltas = [];
    const topGaps = [];
    const surfaces = [];
    const legs = [];
    const visualOwners = [];
    for (const [ownerId, surfaceName, legName, expectedLegs] of furniture) {
      const surface = shelter?.getObjectByName(surfaceName);
      const supports = meshes.filter((object) => object.name === legName).toSorted(
        (left, right) => left.position.x - right.position.x || left.position.z - right.position.z,
      );
      if (surface) surfaces.push(surface);
      legs.push(...supports);
      const surfaceBox = surface ? boundsOf(surface) : null;
      let ownerConnected = Boolean(surface && supports.length === expectedLegs);
      for (let legIndex = 0; legIndex < supports.length; legIndex += 1) {
        const leg = supports[legIndex];
        const legId = `${ownerId}.leg${legIndex}`;
        const legBox = boundsOf(leg);
        const foot = leg.getWorldPosition(new THREE.Vector3());
        const terrainY = airstrip?.groundAt?.(foot.x, foot.z);
        const footDelta = legBox.min.y - terrainY;
        const topGap = surfaceBox ? surfaceBox.min.y - legBox.max.y : Number.NaN;
        terrainDeltas.push(footDelta);
        topGaps.push(topGap);
        if (Math.abs(footDelta) <= 0.001) {
          grounded += 1;
          edges.push({
            dependent: legId, owner: terrainId, gapM: footDelta,
            overlapM2: leg.geometry.parameters.width * leg.geometry.parameters.depth,
          });
        }
        if (Math.abs(topGap) <= 0.001 && surfaceBox && positiveFootprint(legBox, surfaceBox)) {
          joined += 1;
          edges.push({
            dependent: `${ownerId}.surface-leg${legIndex}.surface-leg-joint`, owner: legId,
            gapM: topGap, overlapM2: footprintArea(legBox, surfaceBox),
          });
        }
        let legContained = false;
        if (surface) {
          const localFoot = surface.worldToLocal(foot.clone());
          const halfWidth = leg.geometry.parameters.width / 2;
          const halfDepth = leg.geometry.parameters.depth / 2;
          if (Math.abs(localFoot.x) + halfWidth <= surface.geometry.parameters.width / 2 + 0.001
              && Math.abs(localFoot.z) + halfDepth <= surface.geometry.parameters.depth / 2 + 0.001) {
            contained += 1;
            legContained = true;
          }
        }
        ownerConnected &&= Math.abs(footDelta) <= 0.001
          && Math.abs(topGap) <= 0.001 && legContained
          && effectivelyVisible(leg);
      }
      visualOwners.push({
        id: ownerId,
        body: [surface].filter(Boolean), support: supports,
        connected: ownerConnected && effectivelyVisible(surface),
      });
    }
    return {
      ledger: {
        'shelter.benchSeats': surfaces.filter(({ name }) => name === 'shelter-bench-seat').length,
        'shelter.benchLegs': legs.filter(({ name }) => name === 'shelter-bench-leg').length,
        'shelter.tableTops': surfaces.filter(({ name }) => name === 'shelter-table-top').length,
        'shelter.tableLegs': legs.filter(({ name }) => name === 'shelter-table-leg').length,
        'shelter.groundedLegs': grounded,
        'shelter.joinedLegs': joined,
        'shelter.containedLegs': contained,
        'shelter.maxAbsTerrainDeltaM': maxAbs(terrainDeltas),
        'shelter.maxAbsTopGapM': maxAbs(topGaps),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: { body: surfaces, support: legs },
      visualOwners,
    };
  }

  function buildEnolaSeats(runtime) {
    const roles = ['pilot', 'copilot', 'navigator'];
    const seats = roles.map((role) => ({
      role, seat: runtime.aircraft?.anchors?.seats?.[role],
    }));
    const floorObjects = objectsNamed(runtime.aircraft?.group, 'cabin-floor');
    const walkwayObjects = objectsNamed(runtime.aircraft?.group, 'cabin-walkway');
    const floor = floorObjects.length === 1 && effectivelyVisible(floorObjects[0])
      ? floorObjects[0] : null;
    const walkway = walkwayObjects.length === 1 && effectivelyVisible(walkwayObjects[0])
      ? walkwayObjects[0] : null;
    const floorBox = floor ? boundsOf(floor) : null;
    const walkwayBox = walkway ? boundsOf(walkway) : null;
    const floorId = 'enola-aircraft.cabin-floor';
    const walkwayId = 'enola-aircraft.cabin-walkway';
    let pans = 0;
    let legsCount = 0;
    let grounded = 0;
    let joined = 0;
    let contained = 0;
    let walkwayPenetrations = 0;
    const floorGaps = [];
    const panGaps = [];
    const body = [];
    const support = [];
    const roleLegs = {};
    const dependents = [];
    const edges = [];
    const visualOwners = [];
    for (const { role, seat } of seats) {
      const pan = seat?.children.find((child) => child.name === 'cockpit-seat-pan');
      const back = seat?.children.find((child) => child.name === 'cockpit-seat-back');
      const legs = seat?.children.filter((child) => child.name === 'cockpit-seat-leg') ?? [];
      roleLegs[role] = legs.length;
      if (pan) { pans += 1; body.push(pan); }
      if (back) body.push(back);
      legsCount += legs.length;
      const panBox = pan ? boundsOf(pan) : null;
      const backBox = back ? boundsOf(back) : null;
      let ownerConnected = Boolean(pan && back && legs.length === 4
        && panBox && backBox && panBox.intersectsBox(backBox));
      const floorProofs = [];
      for (const [legIndex, leg] of legs.entries()) {
        const legBox = boundsOf(leg);
        const floorGap = floorBox && positiveFootprint(legBox, floorBox)
          ? legBox.min.y - floorBox.max.y : Number.NaN;
        const panGap = panBox ? panBox.min.y - legBox.max.y : Number.NaN;
        const dependent = `${role}.cockpit-seat-leg.${legIndex}`;
        dependents.push(dependent);
        floorGaps.push(floorGap);
        panGaps.push(panGap);
        const onFloor = Math.abs(floorGap) <= 1e-4;
        const onPan = panBox && positiveFootprint(legBox, panBox) && Math.abs(panGap) <= 1e-4;
        if (onFloor) {
          grounded += 1;
          edges.push({
            dependent, owner: floorId, gapM: floorGap,
            overlapM2: footprintArea(legBox, floorBox),
          });
          floorProofs.push(evidencePart(
            floor, `${dependent}.cabin-floor-contact`, supportProofBox(legBox, floorBox),
          ));
        }
        if (onPan) joined += 1;
        if (panBox && positiveFootprint(legBox, panBox)) contained += 1;
        if (walkwayBox && positiveVolume(legBox, walkwayBox)) walkwayPenetrations += 1;
        ownerConnected &&= Boolean(onFloor && onPan);
      }
      support.push(...legs, ...floorProofs);
      visualOwners.push({
        id: role,
        body: [pan, back].filter(Boolean),
        support: [...legs, ...floorProofs],
        connected: ownerConnected && floorProofs.length === 4,
      });
    }
    return {
      ledger: {
        'seats.count': seats.filter(({ seat }) => seat).length,
        'seats.pans': pans,
        'seats.legs': legsCount,
        'seats.pilotLegs': roleLegs.pilot ?? 0,
        'seats.copilotLegs': roleLegs.copilot ?? 0,
        'seats.navigatorLegs': roleLegs.navigator ?? 0,
        'seats.groundedLegs': grounded,
        'seats.joinedLegs': joined,
        'seats.containedLegs': contained,
        'seats.walkwayPenetrations': walkwayPenetrations,
        'seats.maxAbsFloorGapM': maxAbs(floorGaps),
        'seats.maxAbsPanGapM': maxAbs(panGaps),
      },
      ownership: ownershipProof([
        ...(floor ? [floorId] : []),
        ...(walkway ? [walkwayId] : []),
      ], dependents, edges),
      focusGroups: { body, support },
      visualOwners,
    };
  }

  function radialErrors(objects, hub, expectedRadius) {
    const centre = hub.getWorldPosition(new THREE.Vector3());
    const points = objects.map((object) => object.getWorldPosition(new THREE.Vector3()));
    const radiusErrors = points.map((point) => Math.abs(Math.hypot(
      point.x - centre.x, point.z - centre.z,
    ) - expectedRadius));
    const angles = points.map((point) => (
      Math.atan2(point.z - centre.z, point.x - centre.x) + Math.PI * 2
    ) % (Math.PI * 2)).sort((left, right) => left - right);
    const expectedGap = angles.length ? Math.PI * 2 / angles.length : Number.NaN;
    const angularErrors = angles.map((angle, index) => {
      const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
      return Math.abs((next - angle) - expectedGap);
    });
    return { radiusErrors, angularErrors };
  }

  function buildBingChair(runtime, scene) {
    const chair = scene.getObjectByName('lou-chair');
    const meshes = allMeshes(chair);
    const named = (name) => meshes.filter((object) => object.name === name);
    const seat = named('lou-chair-seat')[0];
    const back = named('lou-chair-back')[0];
    const column = named('lou-chair-column')[0];
    const hub = named('lou-chair-base-hub')[0];
    const hubCentre = hub?.getWorldPosition(new THREE.Vector3());
    const radialOrder = (objects) => objects.toSorted((left, right) => {
      const angle = (object) => {
        const point = object.getWorldPosition(new THREE.Vector3());
        return (Math.atan2(point.z - hubCentre.z, point.x - hubCentre.x) + Math.PI * 2)
          % (Math.PI * 2);
      };
      return angle(left) - angle(right);
    });
    const arms = hubCentre ? radialOrder(named('lou-chair-base-arm')) : [];
    const feet = hubCentre ? radialOrder(named('lou-chair-foot')) : [];
    const armBoxes = arms.map(boundsOf);
    const footBoxes = feet.map(boundsOf);
    const seatBox = seat ? boundsOf(seat) : null;
    const backBox = back ? boundsOf(back) : null;
    const columnBox = column ? boundsOf(column) : null;
    const hubBox = hub ? boundsOf(hub) : null;
    const carpet = (() => {
      const office = runtime.club?.rooms?.office;
      let match = null;
      scene.traverse((object) => {
        if (match || !object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
        const box = boundsOf(object);
        if (office
            && Math.abs(box.min.x - office.x0) <= 1e-4
            && Math.abs(box.max.x - office.x1) <= 1e-4
            && Math.abs(box.min.z - office.z0) <= 1e-4
            && Math.abs(box.max.z - office.z1) <= 1e-4
            && Math.abs(box.max.y - 0.004) <= 1e-4
            && footBoxes.every((foot) => containedInFootprint(foot, box))
            && effectivelyVisible(object)) match = object;
      });
      return match;
    })();
    const carpetBox = carpet ? boundsOf(carpet) : null;
    const carpetId = 'bing-office-carpet:[7.9,13.9]x[-9.5,-4.5]@0.004';
    const footIds = Array.from({ length: 5 }, (_, foot) => `lou-chair.foot${foot}`);
    const armIds = Array.from({ length: 5 }, (_, arm) => `lou-chair.arm${arm}`);
    const ownerIds = [
      carpetId, ...footIds, ...armIds, 'lou-chair.hub', 'lou-chair.column', 'lou-chair.seat',
    ];
    const dependentIds = [
      ...footIds,
      ...armIds,
      ...Array.from({ length: 5 }, (_, arm) => `lou-chair.hub-arm${arm}.joint`),
      'lou-chair.column', 'lou-chair.seat', 'lou-chair.back',
    ];
    const edges = [];
    const carpetProofs = [];
    const armLinks = armBoxes.map((arm) => footBoxes.flatMap((foot, index) => (
      positiveVolume(arm, foot) ? [index] : []
    )));
    const footLinks = footBoxes.map((foot) => armBoxes.flatMap((arm, index) => (
      positiveVolume(foot, arm) ? [index] : []
    )));
    const bijections = armLinks.filter((links, index) => (
      links.length === 1 && footLinks[links[0]]?.length === 1 && footLinks[links[0]][0] === index
    )).length;
    let loadPathJoins = 0;
    if (seatBox && backBox && positiveVolume(seatBox, backBox)) loadPathJoins += 1;
    if (seatBox && columnBox && positiveVolume(seatBox, columnBox)) loadPathJoins += 1;
    if (hubBox && columnBox && positiveVolume(hubBox, columnBox)) loadPathJoins += 1;
    if (hubBox) loadPathJoins += armBoxes.filter((arm) => positiveVolume(arm, hubBox)).length;
    const carpetGaps = carpetBox ? footBoxes.map((foot) => foot.min.y - carpetBox.max.y) : [];
    const armRadial = hub ? radialErrors(arms, hub, 0.12) : { radiusErrors: [], angularErrors: [] };
    const footRadial = hub ? radialErrors(feet, hub, 0.25) : { radiusErrors: [], angularErrors: [] };
    const loadPath = [seat, back, column, hub, ...arms, ...feet].filter(Boolean);
    if (carpetBox) {
      for (let footIndex = 0; footIndex < footBoxes.length; footIndex += 1) {
        const footBox = footBoxes[footIndex];
        const gap = footBox.min.y - carpetBox.max.y;
        if (!containedInFootprint(footBox, carpetBox) || Math.abs(gap) > 1e-4) continue;
        edges.push({
          dependent: footIds[footIndex], owner: carpetId, gapM: gap,
          overlapM2: footprintArea(footBox, carpetBox),
        });
        carpetProofs.push(evidencePart(
          carpet, `${footIds[footIndex]}.bing-office-carpet-contact`,
          supportProofBox(footBox, carpetBox, 0.08),
        ));
      }
    }
    for (let armIndex = 0; armIndex < armBoxes.length; armIndex += 1) {
      const footIndex = armLinks[armIndex]?.length === 1 ? armLinks[armIndex][0] : -1;
      if (footIndex >= 0 && footLinks[footIndex]?.length === 1
          && footLinks[footIndex][0] === armIndex) {
        edges.push({
          dependent: armIds[armIndex], owner: footIds[footIndex],
          gapM: boxGap(armBoxes[armIndex], footBoxes[footIndex]),
          overlapM2: footprintArea(armBoxes[armIndex], footBoxes[footIndex]),
        });
      }
      if (hubBox && positiveVolume(armBoxes[armIndex], hubBox)) {
        edges.push({
          dependent: `lou-chair.hub-arm${armIndex}.joint`, owner: armIds[armIndex],
          gapM: boxGap(hubBox, armBoxes[armIndex]),
          overlapM2: footprintArea(hubBox, armBoxes[armIndex]),
        });
      }
    }
    for (const [dependent, owner, dependentBox, ownerBox] of [
      ['lou-chair.column', 'lou-chair.hub', columnBox, hubBox],
      ['lou-chair.seat', 'lou-chair.column', seatBox, columnBox],
      ['lou-chair.back', 'lou-chair.seat', backBox, seatBox],
    ]) {
      if (!dependentBox || !ownerBox || !positiveVolume(dependentBox, ownerBox)) continue;
      edges.push({
        dependent, owner, gapM: boxGap(dependentBox, ownerBox),
        overlapM2: footprintArea(dependentBox, ownerBox),
      });
    }
    const connected = Boolean(seat && back && column && hub
      && arms.length === 5 && feet.length === 5
      && loadPathJoins === 8 && bijections === 5
      && carpetBox && carpetGaps.every((gap) => Math.abs(gap) <= 1e-4)
      && edges.length === 18 && [...loadPath, carpet].every(effectivelyVisible));
    return {
      ledger: {
        'chair.roots': chair ? 1 : 0,
        'chair.arms': arms.length,
        'chair.feet': feet.length,
        'chair.visibleLoadPathParts': loadPath.filter(effectivelyVisible).length,
        'chair.loadPathJoins': loadPathJoins,
        'chair.armFootBijections': bijections,
        'chair.distinctFootTargets': new Set(armLinks.flat()).size,
        'chair.groundedFeet': carpetBox ? carpetGaps.filter((gap) => Math.abs(gap) <= 1e-4).length : 0,
        'chair.carpetContainedFeet': carpetBox
          ? footBoxes.filter((foot) => containedInFootprint(foot, carpetBox)).length : 0,
        'chair.seatContainedBaseParts': seatBox
          ? [...armBoxes, ...footBoxes, hubBox].filter((box) => box && containedInFootprint(box, seatBox)).length : 0,
        'chair.colliders': runtime.club?.colliders?.length ?? null,
        'chair.maxAbsCarpetGapM': maxAbs(carpetGaps),
        'chair.maxRadiusErrorM': maxAbs([...armRadial.radiusErrors, ...footRadial.radiusErrors]),
        'chair.maxAngularGapErrorRad': maxAbs([...armRadial.angularErrors, ...footRadial.angularErrors]),
      },
      ownership: ownershipProof(ownerIds, dependentIds, edges),
      focusGroups: {
        body: [seat, back, column, hub].filter(Boolean),
        support: [...arms, ...feet, ...carpetProofs],
      },
      visualOwners: [{
        id: 'lou-chair',
        body: [seat, back, column, hub].filter(Boolean),
        support: [...arms, ...feet, ...carpetProofs],
        connected,
      }],
    };
  }

  function buildShot(spec, runtime, scene) {
    scene.updateMatrixWorld(true);
    const builders = {
      'silver-produce-crates': () => buildSilverCrates(scene, runtime),
      'silver-east-banquettes': () => buildSilverBanquettes(scene, runtime),
      'silver-dry-store-shelves': () => buildSilverShelves(scene, runtime),
      'cartel-dining-table': () => buildCartelTable(scene),
      'cartel-office-chair': () => buildCartelChair(scene),
      'mansion-living-couches': () => buildMansionCouches(scene),
      'no-wake-neighbor-cleats': () => buildNoWakeCleats(scene),
      'motel-dining-chairs': () => buildMotelChairs(runtime, scene),
      'motel-pool-loungers': () => buildMotelLoungers(runtime),
      'motel-shipment-crates': () => buildMotelCrates(runtime, scene),
      'beefrun-shelter-furniture': () => buildBeefrunShelter(runtime),
      'enola-cockpit-seats': () => buildEnolaSeats(runtime),
      'bing-lou-chair': () => buildBingChair(runtime, scene),
    };
    const built = builders[spec.id]?.();
    if (!built) throw new Error(`No evidence builder for ${spec.id}`);
    built.focusGroups = Object.fromEntries(Object.entries(built.focusGroups).map(
      ([key, objects]) => [key, normalizedEvidenceParts(objects, `${spec.id}.${key}`)],
    ));
    built.visualOwners = (built.visualOwners ?? []).map((owner, ownerIndex) => ({
      id: owner.id || `${spec.id}.owner${ownerIndex}`,
      connected: owner.connected === true,
      body: normalizedEvidenceParts(owner.body, `${spec.id}.owner${ownerIndex}.body`),
      support: normalizedEvidenceParts(owner.support, `${spec.id}.owner${ownerIndex}.support`),
    }));
    return built;
  }

  function materialForIntersection(intersection) {
    const material = intersection.object?.material;
    if (!Array.isArray(material)) return material;
    const index = intersection.face?.materialIndex;
    return Number.isInteger(index) ? material[index] : material.find(Boolean);
  }

  function opaqueIntersection(intersection) {
    if (!effectivelyVisible(intersection.object)) return false;
    const material = materialForIntersection(intersection);
    return material?.visible !== false
      && (material?.transparent !== true || (material?.opacity ?? 1) >= 0.5);
  }

  function firstOpaque(raycaster, scene) {
    return raycaster.intersectObject(scene, true).find(opaqueIntersection) ?? null;
  }

  function focusBounds(focusParts) {
    const box = new THREE.Box3();
    for (const part of focusParts) box.union(partBounds(part));
    return box;
  }

  function projectedBounds(box, camera) {
    const points = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          points.push(new THREE.Vector3(x, y, z).project(camera));
        }
      }
    }
    const ndc = {
      minX: Math.min(...points.map(({ x }) => x)),
      maxX: Math.max(...points.map(({ x }) => x)),
      minY: Math.min(...points.map(({ y }) => y)),
      maxY: Math.max(...points.map(({ y }) => y)),
    };
    const fullyInside = points.every((point) => (
      point.x >= -0.95 && point.x <= 0.95 && point.y >= -0.95 && point.y <= 0.95
        && point.z >= -1 && point.z <= 1
    ));
    return { fullyInside, ndc };
  }

  function partVisibility(part, scene, camera, raycaster) {
    const projection = projectedBounds(partBounds(part), camera);
    if (!projection.fullyInside) return { sampleCount: 9, targetHits: 0, visible: false };
    let targetHits = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const x = projection.ndc.minX + (column + 0.5) / 3
          * (projection.ndc.maxX - projection.ndc.minX);
        const y = projection.ndc.minY + (row + 0.5) / 3
          * (projection.ndc.maxY - projection.ndc.minY);
        raycaster.setFromCamera({ x, y }, camera);
        if (firstOpaque(raycaster, scene)?.object === part.object) targetHits += 1;
      }
    }
    return { sampleCount: 9, targetHits, visible: targetHits >= 1 };
  }

  function silhouetteProof(parts, scene, camera, raycaster) {
    const partObjects = new Set(parts.map(({ object }) => object));
    const projection = projectedBounds(focusBounds(parts), camera);
    let targetHits = 0;
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const x = projection.ndc.minX + (column + 0.5) / 5
          * (projection.ndc.maxX - projection.ndc.minX);
        const y = projection.ndc.minY + (row + 0.5) / 5
          * (projection.ndc.maxY - projection.ndc.minY);
        raycaster.setFromCamera({ x, y }, camera);
        const hit = firstOpaque(raycaster, scene);
        if (hit && partObjects.has(hit.object)) targetHits += 1;
      }
    }
    return {
      sampleCount: 25,
      targetHits,
      hitRatio: round(targetHits / 25, 6),
    };
  }

  function compositionProof(spec, scene, camera, focusGroups, visualOwners) {
    const focusParts = Object.values(focusGroups).flat();
    const focusSet = new Set(focusParts.map(({ object }) => object));
    const box = focusBounds(focusParts);
    const projection = projectedBounds(box, camera);
    const raycaster = new THREE.Raycaster();
    const visibilityByPart = new Map(focusParts.map((part) => [
      part.id, partVisibility(part, scene, camera, raycaster),
    ]));
    const visibleGroups = {};
    for (const [key, parts] of Object.entries(focusGroups)) {
      visibleGroups[key] = parts.filter((part) => visibilityByPart.get(part.id)?.visible).length;
    }
    let targetHits = 0;
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const x = projection.ndc.minX + (column + 0.5) / 5
          * (projection.ndc.maxX - projection.ndc.minX);
        const y = projection.ndc.minY + (row + 0.5) / 5
          * (projection.ndc.maxY - projection.ndc.minY);
        raycaster.setFromCamera({ x, y }, camera);
        const hit = firstOpaque(raycaster, scene);
        if (hit && focusSet.has(hit.object)) targetHits += 1;
      }
    }
    return {
      fullyInside: projection.fullyInside,
      focusObjectCount: focusParts.length,
      ndc: Object.fromEntries(Object.entries(projection.ndc).map(([key, value]) => [key, round(value, 6)])),
      visibility: {
        sampleCount: 25,
        targetHits,
        hitRatio: round(targetHits / 25, 6),
        visibleGroups,
      },
      owners: visualOwners.map((owner) => {
        const ownerParts = [...owner.body, ...owner.support];
        const bodyIds = new Set(owner.body.map(({ object }) => object.uuid));
        const supportIds = new Set(owner.support.map(({ object }) => object.uuid));
        const visibleBodyParts = owner.body.filter(
          (part) => partVisibility(part, scene, camera, raycaster).visible,
        ).length;
        const visibleSupportParts = owner.support.filter(
          (part) => partVisibility(part, scene, camera, raycaster).visible,
        ).length;
        const totalParts = ownerParts.length;
        return {
          id: owner.id,
          connected: owner.connected,
          distinctSupport: [...supportIds].every((id) => !bodyIds.has(id)),
          bodyParts: owner.body.length,
          supportParts: owner.support.length,
          visibleBodyParts,
          visibleSupportParts,
          partCoverage: round(totalParts ? (visibleBodyParts + visibleSupportParts) / totalParts : 0, 6),
          silhouette: silhouetteProof(ownerParts, scene, camera, raycaster),
        };
      }),
    };
  }

  function compositionMeetsPolicy(spec, proof) {
    const width = proof.ndc.maxX - proof.ndc.minX;
    const height = proof.ndc.maxY - proof.ndc.minY;
    return proof.fullyInside
      && proof.focusObjectCount >= spec.composition.minFocusObjects
      && width >= spec.composition.minWidth && height >= spec.composition.minHeight
      && proof.visibility.targetHits >= spec.composition.minTargetHits
      && proof.visibility.hitRatio >= spec.composition.minTargetRatio
      && Object.entries(spec.composition.requiredVisibleGroups).every(
        ([key, minimum]) => proof.visibility.visibleGroups[key] >= minimum,
      )
      && proof.owners.length === spec.composition.minOwners
      && JSON.stringify(proof.owners.map(({ id }) => id).toSorted())
        === JSON.stringify([...spec.composition.ownerIds].toSorted())
      && proof.owners.every((owner) => (
        owner.connected && owner.distinctSupport
        && owner.visibleBodyParts >= spec.composition.minVisibleBodyParts
        && owner.visibleSupportParts >= spec.composition.minVisibleSupportParts
        && owner.partCoverage >= spec.composition.minOwnerPartCoverage
        && owner.silhouette.hitRatio >= spec.composition.minOwnerSilhouetteRatio
      ));
  }

  function setCameraPose(camera, target, position) {
    camera.matrixAutoUpdate = true;
    camera.position.copy(position);
    camera.lookAt(target);
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    camera.matrixAutoUpdate = false;
  }

  function pointInsideFocusedMesh(point, part) {
    const object = part.object;
    if (!object?.isMesh || !effectivelyVisible(object) || !object.geometry) return false;
    object.geometry.computeBoundingBox?.();
    if (!object.geometry.boundingBox) return false;
    const localPoint = object.worldToLocal(point.clone());
    return object.geometry.boundingBox.containsPoint(localPoint);
  }

  function colliderPolicy(spec, runtime, point) {
    const entries = [];
    let colliderCoverage = null;
    let source = 'player.world.box3';
    let coverage = 'world-colliders+focused-visible-meshes';
    if (spec.scene === 'motel') {
      source = 'motel.level.aabb.all-enabled-solid-policy';
      coverage = 'all-enabled-motel-level-aabbs+focused-visible-meshes';
      colliderCoverage = { enabled: 0, bed: 0, table: 0, bounds: 0, other: 0 };
      for (const [index, collider] of (runtime.level?.colliders ?? []).entries()) {
        if (collider?.enabled === false) continue;
        if (![collider?.x0, collider?.x1, collider?.y0, collider?.y1,
          collider?.z0, collider?.z1].every(Number.isFinite)) continue;
        colliderCoverage.enabled += 1;
        if (['bed', 'table', 'bounds'].includes(collider.tag)) {
          colliderCoverage[collider.tag] += 1;
        } else {
          colliderCoverage.other += 1;
        }
        entries.push({
          id: collider.tag || `motel-collider.${index}`,
          box: new THREE.Box3(
            new THREE.Vector3(collider.x0, collider.y0, collider.z0),
            new THREE.Vector3(collider.x1, collider.y1, collider.z1),
          ),
          point,
        });
      }
    } else {
      const worldColliders = runtime.player?.world?.colliders ?? runtime.world?.colliders ?? [];
      for (const [index, box] of worldColliders.entries()) {
        if (!box?.min || !box?.max) continue;
        entries.push({ id: box.name || `world-collider.${index}`, box, point });
      }
      if (spec.scene === 'no-wake') {
        source = 'nowake.world+active-boat-local';
        coverage = 'world+active-boat-colliders+focused-visible-meshes;neighbor-boats-are-visual-only';
        const localPoint = runtime.world?.toBoatLocal?.(point.clone(), new THREE.Vector3());
        const localColliders = runtime.world?.below
          ? runtime.boat?.cabinColliders : runtime.boat?.localColliders;
        if (localPoint) {
          for (const [index, box] of (localColliders ?? []).entries()) {
            if (!box?.min || !box?.max) continue;
            entries.push({ id: box.name || `active-boat-collider.${index}`, box, point: localPoint });
          }
        }
      } else if (spec.scene === 'enola') {
        coverage = 'static-world-colliders+focused-visible-meshes;aircraft-interior-has-no-solid-model';
      }
    }
    const colliderBlockers = entries.filter(({ box, point: testedPoint }) => (
      box.containsPoint(testedPoint)
    )).map(({ id }) => id);
    const clearances = entries.map(({ box, point: testedPoint }) => box.distanceToPoint(testedPoint));
    return {
      source,
      coverage,
      blockerCount: entries.length,
      colliderCoverage,
      colliderBlockers,
      minClearanceM: round(clearances.length ? Math.min(...clearances) : 0, 6),
    };
  }

  function cameraLegality(spec, runtime, position, focusGroups) {
    const focusParts = Object.values(focusGroups).flat();
    const collider = colliderPolicy(spec, runtime, position);
    const solidBlockers = focusParts.filter((part) => pointInsideFocusedMesh(position, part))
      .map((part) => part.id);
    return {
      source: collider.source,
      coverage: collider.coverage,
      blockerCount: collider.blockerCount,
      colliderCoverage: collider.colliderCoverage,
      focusMeshCount: focusParts.length,
      testedPosition: position.toArray().map((value) => round(value, 8)),
      minClearanceM: collider.minClearanceM,
      colliderClear: collider.colliderBlockers.length === 0,
      insideSolidClear: solidBlockers.length === 0,
      colliderBlockers: collider.colliderBlockers,
      solidBlockers,
    };
  }

  function freezeCameraBinding(camera, liveCamera, cameraChildren, snapshot = null, snapshotJson = null) {
    camera.updateMatrixWorld(true);
    const worldPosition = camera.getWorldPosition(new THREE.Vector3());
    const frozenSnapshot = snapshot ?? renderStateSnapshot(
      THREE, active.scene, camera, active.renderer, active.postfx,
    );
    const frozenSnapshotJson = snapshotJson ?? JSON.stringify(frozenSnapshot);
    return {
      binding: {
        dedicated: camera !== liveCamera,
        liveCameraUuid: liveCamera.uuid,
        evidenceCameraUuid: camera.uuid,
        worldPosition: worldPosition.toArray().map((value) => round(value, 8)),
        matrixWorld: camera.matrixWorld.elements.map((value) => round(value, 8)),
        renderStateRenderableCount: frozenSnapshot.renderables.length,
        simulationPaused: window.__scenePause?.isPaused?.() === true,
        pauseApi: 'window.__scenePause',
        cameraChildren,
      },
      renderStateJson: frozenSnapshotJson,
    };
  }

  async function resolveCameraBinding(frozen) {
    const encoded = new TextEncoder().encode(frozen.renderStateJson);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const renderStateSha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      ...frozen.binding,
      renderStateSha256,
    };
  }

  async function cameraBinding(camera, liveCamera, cameraChildren) {
    return resolveCameraBinding(freezeCameraBinding(camera, liveCamera, cameraChildren));
  }

  function reapplyEvidenceCamera() {
    if (!active) throw new Error('No active evidence camera');
    active.camera.matrixAutoUpdate = true;
    active.camera.position.copy(active.lockedPosition);
    active.camera.quaternion.copy(active.lockedQuaternion);
    active.camera.updateProjectionMatrix();
    active.camera.updateMatrix();
    active.camera.updateMatrixWorld(true);
    active.camera.matrixAutoUpdate = false;
    active.scene.updateMatrixWorld(true);
  }

  async function bind(spec) {
    if (!active || active.id !== spec.id) throw new Error(`${spec.id} was not prepared`);
    reapplyEvidenceCamera();
    active.controlledRenderer.renderProduction();
    return cameraBinding(active.camera, active.liveCamera, active.cameraChildren);
  }

  async function captureProductionPng(spec) {
    if (!active || active.id !== spec.id || active.maskState) {
      throw new Error(`${spec.id} production PNG cannot be captured in the current state`);
    }
    reapplyEvidenceCamera();
    const frame = captureCanvasFrame({
      render: () => active.controlledRenderer.renderProduction(),
      canvas: active.renderer.domElement,
      snapshot: () => renderStateSnapshot(
        THREE, active.scene, active.camera, active.renderer, active.postfx,
      ),
    });
    const frozenBinding = freezeCameraBinding(
      active.camera, active.liveCamera, active.cameraChildren,
      frame.renderState, frame.renderStateJson,
    );
    return {
      pngBase64: frame.pngBase64,
      binding: await resolveCameraBinding(frozenBinding),
    };
  }

  function isKnownEvidenceViewmodel(spec, child) {
    if (child.isLight) return false;
    const name = String(child.name || '').toLowerCase();
    if (/(?:held|viewmodel|player[ ._-]?gun|tony revolver|booski-shot|weapon|cord)/.test(name)) {
      return true;
    }
    // Motel's closure-private first-person group is the one deliberately
    // unnamed camera child. It contains meshes and is exposed only as stats,
    // so bind this narrow scene/type/shape identity rather than hiding every
    // camera child (Cartel's playerFill light is a legitimate counterexample).
    return spec.scene === 'motel' && child.isGroup && name === '' && allMeshes(child).length > 0;
  }

  async function prepare(spec, viewport) {
    const runtime = runtimeFor(spec.scene);
    if (!runtime) throw new Error(`Missing public runtime for ${spec.scene}`);
    const surface = resolveRuntimeSurface(runtime);
    THREE = surface.three || await import('three');
    const { scene, camera: liveCamera, renderer, postfx } = surface;
    if (!scene?.isScene || !liveCamera?.isPerspectiveCamera || !renderer?.domElement) {
      throw new Error(`${spec.scene} did not expose a real scene, perspective camera, and renderer`);
    }
    const pauseApi = window.__scenePause;
    if (!pauseApi?.isPaused?.()) pauseApi?.pause?.();
    if (pauseApi?.isPaused?.() !== true) {
      throw new Error(`${spec.scene} did not enter the real paused simulation state`);
    }
    const camera = liveCamera.clone(true);
    camera.name = `global-geometry-evidence-camera:${spec.id}`;
    scene.add(camera);
    const cameraChildren = {
      hiddenViewmodels: [], preservedCameraLights: [], hiddenUnknown: 0,
    };
    for (const child of camera.children) {
      const identity = `${child.type || child.constructor?.name || 'Object3D'}:${child.name || child.uuid}`;
      if (child.isLight) {
        cameraChildren.preservedCameraLights.push(identity);
      } else if (isKnownEvidenceViewmodel(spec, child)) {
        child.visible = false;
        cameraChildren.hiddenViewmodels.push(identity);
      }
    }
    renderer.setPixelRatio(1);
    renderer.setSize(viewport.width, viewport.height, false);
    camera.aspect = viewport.width / viewport.height;
    camera.fov = 50;
    camera.near = Math.min(camera.near, 0.05);
    camera.far = Math.max(camera.far, 1000);
    const nativeProjectionUpdate = camera.updateProjectionMatrix.bind(camera);
    camera.updateProjectionMatrix = () => {
      camera.fov = 50;
      camera.aspect = viewport.width / viewport.height;
      nativeProjectionUpdate();
    };
    camera.updateProjectionMatrix();

    const built = buildShot(spec, runtime, scene);
    const focusParts = Object.values(built.focusGroups).flat();
    if (!focusParts.length) throw new Error(`${spec.id} resolved no visible focus objects`);
    if (!built.visualOwners.length) throw new Error(`${spec.id} resolved no exact visual owners`);
    const box = focusBounds(focusParts);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const distance = Math.max(1.1, sphere.radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.16);
    const candidates = [];
    for (const elevation of [0.14, 0.28, 0.46]) {
      for (let step = 0; step < 16; step += 1) {
        const heading = step / 16 * Math.PI * 2;
        candidates.push(new THREE.Vector3(Math.cos(heading), elevation, Math.sin(heading)).normalize());
      }
    }
    let best = null;
    for (const [index, direction] of candidates.entries()) {
      setCameraPose(camera, sphere.center, sphere.center.clone().addScaledVector(direction, distance));
      scene.updateMatrixWorld(true);
      const legality = cameraLegality(
        spec, runtime, camera.getWorldPosition(new THREE.Vector3()), built.focusGroups,
      );
      const proof = compositionProof(spec, scene, camera, built.focusGroups, built.visualOwners);
      const required = Object.entries(spec.composition.requiredVisibleGroups).reduce(
        (sum, [key, minimum]) => sum + Math.min(1, (proof.visibility.visibleGroups[key] ?? 0) / minimum), 0,
      );
      const legal = legality.colliderClear && legality.insideSolidClear;
      const score = (legal && compositionMeetsPolicy(spec, proof) ? 10000 : 0)
        + required * 100 + proof.visibility.targetHits;
      if (!best || score > best.score) best = {
        index, score, proof, legality,
        position: camera.position.clone(), quaternion: camera.quaternion.clone(),
      };
    }
    if (!best || !best.legality.colliderClear || !best.legality.insideSolidClear
        || !compositionMeetsPolicy(spec, best.proof)) {
      throw new Error(`${spec.id} has no readable unobscured camera candidate: ${JSON.stringify(best?.proof)}`);
    }
    camera.position.copy(best.position);
    camera.quaternion.copy(best.quaternion);
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    camera.matrixAutoUpdate = false;
    active = {
      id: spec.id, runtime, scene, camera, liveCamera, renderer,
      cameraChildren, postfx,
      lockedPosition: best.position.clone(), lockedQuaternion: best.quaternion.clone(),
    };
    active.controlledRenderer = createControlledRenderer(renderer, postfx, scene, camera);
    const binding = await bind(spec);
    return {
      candidate: best.index,
      scene: spec.scene,
      fov: round(camera.fov, 6),
      aspect: round(camera.aspect, 8),
      near: round(camera.near, 8),
      far: round(camera.far, 6),
      position: camera.position.toArray().map((value) => round(value, 5)),
      target: sphere.center.toArray().map((value) => round(value, 5)),
      distanceM: round(camera.position.distanceTo(sphere.center), 6),
      legality: best.legality,
      binding,
      proof: best.proof,
    };
  }

  async function capture(spec) {
    if (!active || active.id !== spec.id) throw new Error(`${spec.id} was not prepared`);
    const boundCamera = await bind(spec);
    const built = buildShot(spec, active.runtime, active.scene);
    return {
      ledger: built.ledger,
      ownership: built.ownership ?? null,
      cameraBinding: boundCamera,
      cameraClearance: cameraLegality(
        spec, active.runtime, active.camera.getWorldPosition(new THREE.Vector3()), built.focusGroups,
      ),
      composition: compositionProof(
        spec, active.scene, active.camera, built.focusGroups, built.visualOwners,
      ),
    };
  }

  const OWNER_MASK_COLORS = [
    '#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#bf5af2', '#ff9f0a',
    '#64d2ff', '#ff375f', '#30d158', '#5e5ce6', '#ac8e68', '#ffffff',
  ];

  function startOwnerMask(spec) {
    if (!active || active.id !== spec.id || active.maskState) {
      throw new Error(`${spec.id} owner mask cannot begin in the current state`);
    }
    reapplyEvidenceCamera();
    const productionSnapshot = renderStateSnapshot(
      THREE, active.scene, active.camera, active.renderer, active.postfx,
    );
    const productionSnapshotJson = JSON.stringify(productionSnapshot);
    const frozenBinding = freezeCameraBinding(
      active.camera, active.liveCamera, active.cameraChildren,
      productionSnapshot, productionSnapshotJson,
    );
    const built = buildShot(spec, active.runtime, active.scene);
    if (built.visualOwners.length > OWNER_MASK_COLORS.length) {
      throw new Error(`${spec.id} has too many ID-mask owners`);
    }
    const ownerPalette = built.visualOwners.map((owner, index) => ({
      id: owner.id, color: OWNER_MASK_COLORS[index],
    }));
    const assigned = new Map();
    // A mesh that is another owner's support (stacked crates) belongs to its
    // own body ID first. Cropped floor proof boxes never color an entire shared
    // room plane; each owner still has its authored visible leg/plinth/body.
    for (const kind of ['body', 'support']) {
      for (let ownerIndex = 0; ownerIndex < built.visualOwners.length; ownerIndex += 1) {
        for (const part of built.visualOwners[ownerIndex][kind]) {
          if (part.proofBox || assigned.has(part.object.uuid)) continue;
          assigned.set(part.object.uuid, ownerIndex);
        }
      }
    }
    const drawableMaterials = [];
    const disposableMaterials = [];
    active.scene.traverse((object) => {
      if (!(object.isMesh || object.isSprite || object.isPoints || object.isLine)) return;
      const original = object.material;
      const ownerIndex = assigned.get(object.uuid);
      const color = Number.isInteger(ownerIndex) ? ownerPalette[ownerIndex].color : '#000000';
      const sourceSlots = Array.isArray(original) ? original : [original];
      const replacements = sourceSlots.map((source) => {
        const material = createIdMaterial(THREE, source, color);
        disposableMaterials.push(material);
        return material;
      });
      drawableMaterials.push([object, original]);
      object.material = Array.isArray(original) ? replacements : replacements[0];
    });
    active.maskState = {
      drawableMaterials,
      disposableMaterials,
      background: active.scene.background,
      fog: active.scene.fog,
      toneMapping: active.renderer.toneMapping,
      toneMappingExposure: active.renderer.toneMappingExposure,
    };
    active.scene.background = new THREE.Color(0x000000);
    active.scene.fog = null;
    active.renderer.toneMapping = THREE.NoToneMapping;
    active.renderer.toneMappingExposure = 1;
    reapplyEvidenceCamera();
    return { frozenBinding, ownerPalette };
  }

  function restoreOwnerMask(spec) {
    if (!active || active.id !== spec.id || !active.maskState) {
      throw new Error(`${spec.id} owner mask is not active`);
    }
    const state = active.maskState;
    for (const [object, material] of state.drawableMaterials) object.material = material;
    active.scene.background = state.background;
    active.scene.fog = state.fog;
    active.renderer.toneMapping = state.toneMapping;
    active.renderer.toneMappingExposure = state.toneMappingExposure;
    for (const material of state.disposableMaterials) material.dispose();
    active.maskState = null;
    reapplyEvidenceCamera();
    return captureCanvasFrame({
      render: () => active.controlledRenderer.renderProduction(),
      canvas: active.renderer.domElement,
      snapshot: () => renderStateSnapshot(
        THREE, active.scene, active.camera, active.renderer, active.postfx,
      ),
    });
  }

  async function captureOwnerMaskPng(spec) {
    const started = startOwnerMask(spec);
    let maskFrame = null;
    let restoredFrame = null;
    let maskFailure = null;
    try {
      maskFrame = captureCanvasFrame({
        render: () => active.controlledRenderer.renderRaw(),
        canvas: active.renderer.domElement,
        snapshot: () => renderStateSnapshot(
          THREE, active.scene, active.camera, active.renderer, active.postfx,
        ),
      });
    } catch (error) {
      maskFailure = error;
    } finally {
      try {
        restoredFrame = restoreOwnerMask(spec);
      } catch (restoreError) {
        if (maskFailure) {
          throw new AggregateError([maskFailure, restoreError], `${spec.id} mask capture and restore failed`);
        }
        throw restoreError;
      }
    }
    if (maskFailure) throw maskFailure;
    if (started.frozenBinding.renderStateJson !== restoredFrame.renderStateJson) {
      throw new Error(`${spec.id} production render state was not restored after the owner mask`);
    }
    const restoredFrozenBinding = freezeCameraBinding(
      active.camera, active.liveCamera, active.cameraChildren,
      restoredFrame.renderState, restoredFrame.renderStateJson,
    );
    const [binding, restoredBinding] = await Promise.all([
      resolveCameraBinding(started.frozenBinding),
      resolveCameraBinding(restoredFrozenBinding),
    ]);
    return {
      pngBase64: maskFrame.pngBase64,
      ownerPalette: started.ownerPalette,
      binding,
      restoredBinding,
    };
  }

  return { prepare, bind, capture, captureProductionPng, captureOwnerMaskPng };
}

async function waitForRuntime(page, scene) {
  await page.waitForFunction((wanted) => {
    const handles = {
      silver: window.__silver,
      'cartel-palace': window.CARTEL_PALACE,
      mansion: window.mansion,
      'no-wake': window.NO_WAKE,
      motel: window.MOTEL,
      beefrun: window.__beefrun,
      enola: window.__enolaSquatch,
      bing: window.__bing,
    };
    return Boolean(handles[wanted]);
  }, scene, { timeout: 30000 });
}

async function captureShot(browser, options, runDirectory, spec) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const runtime = runtimeDiagnostics(page);
  const launchDocument = new URL(spec.page, `${options.baseUrl}/`).href;
  const finishServedProof = servedResponseTracker(page, new URL(options.baseUrl).origin, runtime);
  const screenshotPath = path.join(runDirectory, spec.file);
  const ownerMaskFile = `owner-masks/${spec.id}.png`;
  const ownerMaskPath = path.join(runDirectory, ...ownerMaskFile.split('/'));
  const screenshotAbsentBefore = !fs.existsSync(screenshotPath);
  const ownerMaskAbsentBefore = !fs.existsSync(ownerMaskPath);
  if (!screenshotAbsentBefore || !ownerMaskAbsentBefore) {
    throw new Error(`Refusing retained screenshot or owner mask for ${spec.id}`);
  }
  try {
    await page.goto(launchDocument, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForRuntime(page, spec.scene);
    await page.addStyleTag({
      content: 'html,body{margin:0!important;overflow:hidden!important;background:#000!important}'
        + 'body>*:not(canvas){display:none!important}canvas{display:block!important;width:100vw!important;height:100vh!important}',
    });
    await page.addScriptTag({
      content: `window.__globalGeometryEvidenceApi = (${installGlobalGeometryEvidenceApi.toString()})(${resolveGlobalGeometryRuntimeSurface.toString()}, ${createGlobalGeometryIdMaterial.toString()}, ${globalGeometryRenderStateSnapshot.toString()}, ${createGlobalGeometryControlledRenderer.toString()}, ${captureGlobalGeometryCanvasFrame.toString()});`,
    });
    const camera = await page.evaluate(async ({ shotSpec, viewport }) => (
      window.__globalGeometryEvidenceApi.prepare(shotSpec, viewport)
    ), { shotSpec: spec, viewport: VIEWPORT });
    const before = await page.evaluate((spec) => (
      window.__globalGeometryEvidenceApi.capture(spec)
    ), spec);
    const beforeGate = evaluateGlobalGeometryCaptureState(spec, before);
    if (!beforeGate.ok) throw new Error(`${spec.id} pre-PNG proof failed: ${beforeGate.errors.join(', ')}`);
    const productionFrame = await page.evaluate((spec) => (
      window.__globalGeometryEvidenceApi.captureProductionPng(spec)
    ), spec);
    const pngBinding = productionFrame.binding;
    const screenshotBytes = Buffer.from(productionFrame.pngBase64, 'base64');
    fs.writeFileSync(screenshotPath, screenshotBytes);
    fs.mkdirSync(path.dirname(ownerMaskPath), { recursive: true });
    const ownerMaskFrame = await page.evaluate((spec) => (
      window.__globalGeometryEvidenceApi.captureOwnerMaskPng(spec)
    ), spec);
    const ownerMaskBytes = Buffer.from(ownerMaskFrame.pngBase64, 'base64');
    fs.writeFileSync(ownerMaskPath, ownerMaskBytes);
    const after = await page.evaluate((spec) => (
      window.__globalGeometryEvidenceApi.capture(spec)
    ), spec);
    const served = await finishServedProof(launchDocument);
    const screenshotDiskBytes = fs.readFileSync(screenshotPath);
    const ownerMaskDiskBytes = fs.readFileSync(ownerMaskPath);
    const screenshotIdentity = bindGlobalGeometryPngArtifact(
      screenshotBytes, screenshotDiskBytes, spec.file,
    );
    const ownerMaskIdentity = bindGlobalGeometryPngArtifact(
      ownerMaskBytes, ownerMaskDiskBytes, ownerMaskFile,
    );
    const pixelProof = measureGlobalGeometryPixelProof(
      screenshotDiskBytes, ownerMaskDiskBytes, ownerMaskFrame.ownerPalette,
    );
    const capture = {
      id: spec.id,
      scene: spec.scene,
      page: spec.page,
      file: spec.file,
      baseUrl: options.baseUrl,
      camera,
      fresh: { screenshotAbsentBefore, ownerMaskAbsentBefore },
      runtime,
      before,
      pngBinding,
      after,
      screenshot: {
        ...screenshotIdentity,
        ownerMask: ownerMaskIdentity,
        pixelProof: {
          ...pixelProof,
          maskBinding: ownerMaskFrame.binding,
          restoredBinding: ownerMaskFrame.restoredBinding,
        },
      },
      served,
    };
    const gate = evaluateGlobalGeometryShot(spec, capture, options.baseUrl);
    if (!gate.ok) throw new Error(`${spec.id} evidence failed: ${gate.errors.join(', ')}`);
    return capture;
  } finally {
    await context.close();
  }
}

export async function captureGlobalGeometryEvidence(
  args = process.argv.slice(2), env = process.env, dependencies = {},
) {
  const options = parseGlobalGeometryEvidenceRun(args, env);
  const outputRoot = resolveEvidenceOutputRoot(options.out);
  const sourceSnapshot = currentGlobalGeometryEvidenceSourceIdentities();
  const servedSourceStart = snapshotGlobalGeometryServedSourceBytes();
  const servedDiskUniverseStart = servedSourceStart.identities;
  /* playwright is a devDependency and the Pages deploy runs `npm test` with no
   * node_modules at all -- a top-level `import { chromium } from 'playwright'`
   * here made this module unimportable there, which failed the suite and reds
   * the deploy on every push. Load it where it is actually used instead; the
   * tests inject launchBrowser and never reach this line. */
  const launchBrowser = dependencies.launchBrowser
    ?? (async () => (await import('playwright')).chromium.launch({ headless: true }));
  const createServer = dependencies.createServer ?? createGlobalGeometryImmutableServer;
  const listenServer = dependencies.listenServer ?? listenGlobalGeometryImmutableServer;
  const closeServer = dependencies.closeServer ?? closeGlobalGeometryImmutableServer;
  const captureOne = dependencies.captureShot ?? captureShot;
  const beginDirectoryTransaction = dependencies.beginDirectoryTransaction
    ?? beginEvidenceDirectoryTransaction;
  const finalRunDirectory = path.join(outputRoot, options.label);
  const runDirectoryExistedBefore = fs.existsSync(finalRunDirectory);
  const transaction = beginDirectoryTransaction({ outputRoot, label: options.label });
  const runDirectory = transaction.stagingDirectory;
  const expectedSourceSha256 = env.GLOBAL_GEOMETRY_EVIDENCE_EXPECTED_SOURCE_SHA256;
  const bootstrapProof = GLOBAL_GEOMETRY_IMMUTABLE_WORKER ? {
    mode: 'content-addressed-worker',
    verified: /^[a-f0-9]{64}$/.test(expectedSourceSha256 ?? '')
      && expectedSourceSha256 === sourceSnapshot.sourceSnapshotSha256,
    expectedSourceSha256,
    executedSourceSha256: sourceSnapshot.sourceSnapshotSha256,
  } : dependencies.bootstrapProof === 'test-injected' ? {
    mode: 'test-injected',
    verified: true,
    expectedSourceSha256: sourceSnapshot.sourceSnapshotSha256,
    executedSourceSha256: sourceSnapshot.sourceSnapshotSha256,
  } : null;
  if (bootstrapProof?.verified !== true) {
    transaction.abort();
    throw new Error('Global geometry evidence must execute from its capture-start immutable source closure');
  }
  let server = null;
  let browser = null;
  let failure = null;
  let result = null;
  try {
    server = createServer({
      baseUrl: options.baseUrl,
      immutableSourceBytes: servedSourceStart.immutableSourceBytes,
    });
    await listenServer(server, options.baseUrl);
    browser = await launchBrowser();
    const shots = [];
    for (const spec of GLOBAL_GEOMETRY_EVIDENCE_SHOTS) {
      shots.push(await captureOne(browser, options, runDirectory, spec));
    }
    assertGlobalGeometryEvidenceSourcesUnchanged(sourceSnapshot);
    const sourceManifestEnd = currentGlobalGeometryEvidenceSourceIdentities();
    const servedManifest = canonicalGlobalGeometryServedManifest(shots);
    const servedDiskManifestStart = globalGeometryServedDiskManifest(
      servedManifest, servedDiskUniverseStart,
    );
    const servedDiskManifestEnd = globalGeometryServedDiskManifest(
      servedManifest, snapshotGlobalGeometryServedDiskUniverse(),
    );
    const report = {
      schema: GLOBAL_GEOMETRY_EVIDENCE_SCHEMA,
      label: options.label,
      baseUrl: options.baseUrl,
      generatedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      fresh: { runDirectoryExistedBefore },
      provenance: {
        ...sourceSnapshot,
        immutableBootstrap: bootstrapProof,
        sourceManifestStart: sourceSnapshot,
        sourceManifestEnd,
        servedDiskManifestStart,
        servedDiskManifestEnd,
        shotManifestSha256: hashStableEvidence(GLOBAL_GEOMETRY_EVIDENCE_SHOTS),
      },
      servedManifest,
      shots,
    };
    const gate = evaluateGlobalGeometryEvidenceRun(report);
    if (!gate.ok) throw new Error(`Global geometry evidence failed: ${gate.errors.join(', ')}`);
    report.ok = true;
    const reportFile = path.join(runDirectory, 'evidence.json');
    const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(reportFile, reportBytes);
    assertGlobalGeometryEvidenceSourcesUnchanged(sourceSnapshot);
    result = { reportBytes, shots: shots.length };
  } catch (error) {
    failure = error;
  }
  try {
    await browser?.close?.();
  } catch (error) {
    failure ??= error;
  }
  try {
    await closeServer(server);
  } catch (error) {
    failure ??= error;
  }
  if (failure) {
    try {
      transaction.abort();
    } catch (cleanupError) {
      throw new AggregateError([failure, cleanupError], 'Evidence capture and transaction cleanup both failed.');
    }
    throw failure;
  }
  const publication = transaction.commit({
    ledgerRelativePath: 'evidence.json',
    ledgerBytes: result.reportBytes,
  });
  return { reportFile: publication.ledgerFile, runDirectory: publication.runDirectory, shots: result.shots };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  captureGlobalGeometryEvidence().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}

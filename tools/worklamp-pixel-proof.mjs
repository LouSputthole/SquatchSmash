import {
  isEvidenceBodyMesh,
  isEvidenceOpaqueMaterial,
} from './mansion-siege-evidence-contract.mjs';

export function evidenceDrawableKind(object) {
  if (object?.isSprite === true) return 'sprite';
  if (object?.isPoints === true) return 'points';
  if (object?.isLine === true) return 'line';
  if (object?.isMesh === true) return 'mesh';
  return null;
}

function evidenceObjectDescription(object) {
  const ancestry = [];
  for (let current = object; current && ancestry.length < 8; current = current.parent) {
    ancestry.push(current.name || current.uuid || current.type || '(unnamed)');
  }
  return {
    uuid: object?.uuid ?? null,
    name: object?.name ?? '',
    kind: evidenceDrawableKind(object),
    ancestry,
  };
}

/** A repeated pixel island can come from one object accidentally owned by two
 * subjects, or from unrelated renderer state. Keep those diagnoses separate
 * and serialisable in a rejected browser transaction. */
export function auditEvidenceSubjectSets(namedSets = {}) {
  const entries = Object.entries(namedSets);
  const counts = Object.fromEntries(entries.map(([name, set]) => [name, set?.size ?? 0]));
  const overlaps = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const [left, leftSet] = entries[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [right, rightSet] = entries[rightIndex];
      const shared = [...(leftSet ?? [])].filter((object) => rightSet?.has(object));
      if (!shared.length) continue;
      overlaps.push({
        left,
        right,
        objects: shared.map(evidenceObjectDescription),
      });
    }
  }
  return { counts, disjoint: overlaps.length === 0, overlaps };
}

function descendants(root, predicate = (object) => object?.isMesh === true) {
  const selected = new Set();
  root?.traverse?.((object) => {
    if (predicate(object)) selected.add(object);
  });
  return selected;
}

/** Preserve a mesh's material-array indices exactly. Three chooses the drawn
 * slot from each geometry group's materialIndex, so an opaque material that is
 * present in the array but unused by that group must never rescue a transparent
 * target slot. */
export function mapEvidenceTargetMaterialSlots(original, makeVisible, invisible) {
  const materials = Array.isArray(original) ? original : [original];
  const mapped = materials.map((material) => (
    isEvidenceOpaqueMaterial(material) ? makeVisible(material) : invisible
  ));
  return Array.isArray(original) ? mapped : mapped[0];
}

/** Three still draws and depth-writes `opacity: 0` when blending is disabled.
 * Only a transparent zero-alpha material disappears from the screenshot. */
export function isEvidenceMaskMaterialVisible(material) {
  return material?.visible !== false
    && (material?.transparent !== true || (material?.opacity ?? 1) > 0.001);
}

/** Match production cutout semantics. Opaque alpha-tested foliage keeps its
 * authored threshold; genuinely transparent material needs majority coverage
 * before this binary evidence mask may call the pixel an occluder. */
export function evidenceMaskAlphaCutoff(material) {
  return Math.max(material?.transparent === true ? 0.5 : 0, material?.alphaTest ?? 0);
}

function countMask(mask) {
  let count = 0;
  for (const value of mask) count += value === 1 ? 1 : 0;
  return count;
}

function largestConnectedPixels(mask, width, height, radius = 2) {
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const row = yy * width;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) dilated[row + xx] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let largest = 0;
  for (let start = 0; start < dilated.length; start += 1) {
    if (!dilated[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let originalPixels = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      originalPixels += mask[index] ? 1 : 0;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbours) {
        if (next >= 0 && dilated[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    largest = Math.max(largest, originalPixels);
  }
  return largest;
}

function maskBounds(mask, width, height) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX >= minX ? { minX, maxX, minY, maxY } : null;
}

function boundsGap(left, right) {
  if (!left || !right) return 0;
  const dx = Math.max(left.minX - right.maxX - 1, right.minX - left.maxX - 1, 0);
  const dy = Math.max(left.minY - right.maxY - 1, right.minY - left.maxY - 1, 0);
  return Math.hypot(dx, dy);
}

function screenshotLuminance(bytes, width, height) {
  const luminance = new Float32Array(width * height);
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    luminance[index] = (
      bytes[offset] * 0.2126 + bytes[offset + 1] * 0.7152 + bytes[offset + 2] * 0.0722
    ) / 255;
  }
  return luminance;
}

function boundaryContrast(mask, luminance, width, height, contrastFloor = 0.09) {
  let boundaryPixels = 0;
  let contrastSum = 0;
  let contrastedBoundaryPixels = 0;
  const radius = 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const boundary = x === 0 || x + 1 === width || y === 0 || y + 1 === height
        || !mask[index - 1] || !mask[index + 1]
        || !mask[index - width] || !mask[index + width];
      if (!boundary) continue;
      let surround = 0;
      let surroundPixels = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const neighbour = yy * width + xx;
          if (mask[neighbour]) continue;
          surround += luminance[neighbour];
          surroundPixels += 1;
        }
      }
      if (!surroundPixels) continue;
      const contrast = Math.abs(luminance[index] - surround / surroundPixels);
      boundaryPixels += 1;
      contrastSum += contrast;
      if (contrast >= contrastFloor) contrastedBoundaryPixels += 1;
    }
  }
  return {
    boundaryPixels,
    boundaryContrast: boundaryPixels
      ? Number((contrastSum / boundaryPixels).toFixed(4)) : 0,
    contrastedBoundaryPixels,
    contrastedBoundaryRatio: boundaryPixels
      ? Number((contrastedBoundaryPixels / boundaryPixels).toFixed(4)) : 0,
  };
}

function summarize(mask, unoccludedMask, luminance, width, height) {
  const visiblePixels = countMask(mask);
  const unoccludedPixels = countMask(unoccludedMask);
  const largestComponentPixels = largestConnectedPixels(mask, width, height);
  return {
    visiblePixels,
    unoccludedPixels,
    bounds: maskBounds(mask, width, height),
    visibleFraction: unoccludedPixels
      ? Number((visiblePixels / unoccludedPixels).toFixed(4)) : 0,
    largestComponentPixels,
    largestComponentRatio: visiblePixels
      ? Number((largestComponentPixels / visiblePixels).toFixed(4)) : 0,
    ...boundaryContrast(mask, luminance, width, height),
  };
}

function summarizePart(mask, luminance, width, height) {
  const visiblePixels = countMask(mask);
  const largestComponentPixels = largestConnectedPixels(mask, width, height);
  return {
    visiblePixels,
    bounds: maskBounds(mask, width, height),
    largestComponentPixels,
    largestComponentRatio: visiblePixels
      ? Number((largestComponentPixels / visiblePixels).toFixed(4)) : 0,
    ...boundaryContrast(mask, luminance, width, height, 0.07),
  };
}

function summarizeBlood(mask, screenshot, luminance, width, height) {
  const visiblePixels = countMask(mask);
  let redReadablePixels = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    const red = screenshot[offset];
    const green = screenshot[offset + 1];
    const blue = screenshot[offset + 2];
    if (red >= 45 && red >= green * 1.35 && red >= blue * 1.15) {
      redReadablePixels += 1;
    }
  }
  return {
    visiblePixels,
    bounds: maskBounds(mask, width, height),
    redReadablePixels,
    redReadableRatio: visiblePixels
      ? Number((redReadablePixels / visiblePixels).toFixed(4)) : 0,
    ...boundaryContrast(mask, luminance, width, height, 0.08),
  };
}

/**
 * Render occlusion-aware ID masks against the frozen Siege scene, then
 * intersect those masks with the exact PNG bytes Playwright just wrote.
 * Geometry/rays say whose mesh was hit; this says whether the owned pixels
 * form a connected, contrasting, human-readable silhouette in that image.
 */
export async function captureWorklampPixelProof({
  siege, screenshotBase64, width = 1920, height = 1080,
} = {}) {
  if (!siege?.renderer || !siege?.scene || !siege?.camera) {
    throw new Error('worklamp pixel proof requires the live Siege renderer');
  }
  const THREE = siege.THREE;
  const image = new Image();
  image.src = `data:image/png;base64,${screenshotBase64}`;
  if (typeof image.decode === 'function') await image.decode();
  else await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  if (image.naturalWidth !== width || image.naturalHeight !== height) {
    throw new Error(`worklamp screenshot is ${image.naturalWidth}x${image.naturalHeight}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const screenshot = context.getImageData(0, 0, width, height).data;
  const luminance = screenshotLuminance(screenshot, width, height);

  const eric = siege.ensemble.members.get('eric');
  const guard = siege.ensemble.members.get('guard_1');
  const blood = eric?.bloodPool ?? null;
  const lamp = siege.dressing.props.firingStep.group
    .getObjectByName('siege.step.worklamp');
  if (!eric || !guard || !blood || !lamp) {
    throw new Error('worklamp pixel proof could not resolve its four subjects');
  }
  siege.scene.updateMatrixWorld(true);
  siege.camera.updateMatrixWorld(true);
  siege.camera.updateProjectionMatrix();

  const effectivelyVisible = (object) => {
    for (let current = object; current; current = current.parent) {
      if (current.visible === false) return false;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some(isEvidenceMaskMaterialVisible);
  };
  const drawableStates = [];
  siege.scene.traverse((object) => {
    const kind = evidenceDrawableKind(object);
    if (!kind || !object.geometry || !object.material) return;
    drawableStates.push({
      object,
      kind,
      material: object.material,
      visible: object.visible,
      effective: effectivelyVisible(object),
    });
  });

  const renderer = siege.renderer;
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const oldTarget = renderer.getRenderTarget();
  const oldClear = renderer.getClearColor(new THREE.Color()).clone();
  const oldClearAlpha = renderer.getClearAlpha();
  const oldViewport = renderer.getViewport(new THREE.Vector4()).clone();
  const oldScissor = renderer.getScissor(new THREE.Vector4()).clone();
  const oldScissorTest = renderer.getScissorTest();
  const oldBackground = siege.scene.background;
  const oldFog = siege.scene.fog;
  const blackCache = new WeakMap();
  const whiteCache = new WeakMap();
  const targetAlphaCache = new WeakMap();
  const allocated = [];
  const invisibleByKind = new Map();
  const invisibleFor = (object) => {
    const kind = evidenceDrawableKind(object) ?? 'mesh';
    if (invisibleByKind.has(kind)) return invisibleByKind.get(kind);
    const material = kind === 'sprite'
      ? new THREE.SpriteMaterial({ visible: false })
      : kind === 'points'
        ? new THREE.PointsMaterial({ visible: false })
        : kind === 'line'
          ? new THREE.LineBasicMaterial({ visible: false })
          : new THREE.MeshBasicMaterial({ visible: false });
    invisibleByKind.set(kind, material);
    allocated.push(material);
    return material;
  };

  const plainMaskMaterial = (original, white, object) => {
    const cache = white ? whiteCache : blackCache;
    const kind = evidenceDrawableKind(object) ?? 'mesh';
    let byKind = cache.get(original);
    if (!byKind) {
      byKind = new Map();
      cache.set(original, byKind);
    }
    if (byKind.has(kind)) return byKind.get(kind);
    let material;
    if (!white && (original?.transparent === true || (original?.alphaTest ?? 0) > 0)
        && (original?.map || original?.alphaMap)) {
      const options = {
        color: 0x000000,
        map: original.map ?? null,
        alphaMap: original.alphaMap ?? null,
        opacity: Number.isFinite(original.opacity) ? original.opacity : 1,
        alphaTest: evidenceMaskAlphaCutoff(original),
        transparent: false,
        side: original.side,
        depthTest: original.depthTest,
        depthWrite: true,
        polygonOffset: original.polygonOffset === true,
        polygonOffsetFactor: original.polygonOffsetFactor ?? 0,
        polygonOffsetUnits: original.polygonOffsetUnits ?? 0,
        toneMapped: false,
        fog: false,
      };
      material = kind === 'sprite'
        ? new THREE.SpriteMaterial({ ...options, rotation: original.rotation ?? 0 })
        : kind === 'points'
          ? new THREE.PointsMaterial({
            ...options,
            size: original.size ?? 1,
            sizeAttenuation: original.sizeAttenuation !== false,
          })
          : kind === 'line'
            ? new THREE.LineBasicMaterial({ ...options, linewidth: original.linewidth ?? 1 })
            : new THREE.MeshBasicMaterial(options);
    } else {
      const options = {
        color: white ? 0xffffff : 0x000000,
        side: original?.side,
        depthTest: original?.depthTest,
        depthWrite: true,
        polygonOffset: original?.polygonOffset === true,
        polygonOffsetFactor: original?.polygonOffsetFactor ?? 0,
        polygonOffsetUnits: original?.polygonOffsetUnits ?? 0,
        toneMapped: false,
        fog: false,
      };
      material = kind === 'sprite'
        ? new THREE.SpriteMaterial({ ...options, rotation: original?.rotation ?? 0 })
        : kind === 'points'
          ? new THREE.PointsMaterial({
            ...options,
            size: original?.size ?? 1,
            sizeAttenuation: original?.sizeAttenuation !== false,
          })
          : kind === 'line'
            ? new THREE.LineBasicMaterial({ ...options, linewidth: original?.linewidth ?? 1 })
            : new THREE.MeshBasicMaterial(options);
    }
    byKind.set(kind, material);
    allocated.push(material);
    return material;
  };
  const targetMaskMaterial = (original, object) => {
    const needsAlphaCoverage = Boolean(
      (original?.transparent === true || (original?.alphaTest ?? 0) > 0)
      && (original?.map || original?.alphaMap),
    );
    if (!needsAlphaCoverage) return plainMaskMaterial(original, true, object);
    if (targetAlphaCache.has(original)) return targetAlphaCache.get(original);
    original.map?.updateMatrix?.();
    original.alphaMap?.updateMatrix?.();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        mapTexture: { value: original.map ?? null },
        alphaMapTexture: { value: original.alphaMap ?? null },
        mapTransform: { value: original.map?.matrix ?? new THREE.Matrix3() },
        alphaMapTransform: { value: original.alphaMap?.matrix ?? new THREE.Matrix3() },
        useMap: { value: original.map ? 1 : 0 },
        useAlphaMap: { value: original.alphaMap ? 1 : 0 },
        opacity: { value: Number.isFinite(original.opacity) ? original.opacity : 1 },
        alphaCutoff: {
          value: evidenceMaskAlphaCutoff(original),
        },
      },
      vertexShader: `
        varying vec2 vMapUv;
        varying vec2 vAlphaMapUv;
        uniform mat3 mapTransform;
        uniform mat3 alphaMapTransform;
        void main() {
          vMapUv = (mapTransform * vec3(uv, 1.0)).xy;
          vAlphaMapUv = (alphaMapTransform * vec3(uv, 1.0)).xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D mapTexture;
        uniform sampler2D alphaMapTexture;
        uniform float useMap;
        uniform float useAlphaMap;
        uniform float opacity;
        uniform float alphaCutoff;
        varying vec2 vMapUv;
        varying vec2 vAlphaMapUv;
        void main() {
          float effectiveAlpha = opacity;
          if (useMap > 0.5) effectiveAlpha *= texture2D(mapTexture, vMapUv).a;
          if (useAlphaMap > 0.5) {
            effectiveAlpha *= texture2D(alphaMapTexture, vAlphaMapUv).g;
          }
          if (effectiveAlpha < alphaCutoff) discard;
          gl_FragColor = vec4(1.0);
        }
      `,
      side: original.side,
      depthTest: original.depthTest,
      depthWrite: true,
      polygonOffset: original.polygonOffset === true,
      polygonOffsetFactor: original.polygonOffsetFactor ?? 0,
      polygonOffsetUnits: original.polygonOffsetUnits ?? 0,
      toneMapped: false,
      fog: false,
    });
    targetAlphaCache.set(original, material);
    allocated.push(material);
    return material;
  };
  blood.material.map?.updateMatrix?.();
  const bloodMaskMaterial = new THREE.ShaderMaterial({
    uniforms: {
      stain: { value: blood.material.map },
      stainTransform: { value: blood.material.map?.matrix ?? new THREE.Matrix3() },
      opacity: { value: blood.material.opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform mat3 stainTransform;
      void main() {
        vUv = (stainTransform * vec3(uv, 1.0)).xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D stain;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        if (texture2D(stain, vUv).a * opacity < 0.5) discard;
        gl_FragColor = vec4(1.0);
      }
    `,
    side: blood.material.side,
    depthTest: blood.material.depthTest,
    depthWrite: blood.material.depthWrite,
    polygonOffset: blood.material.polygonOffset === true,
    polygonOffsetFactor: blood.material.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: blood.material.polygonOffsetUnits ?? 0,
    toneMapped: false,
    fog: false,
  });
  allocated.push(bloodMaskMaterial);

  const materialFor = (original, isTarget, alphaTarget, object) => {
    if (isTarget && alphaTarget) {
      return Array.isArray(original)
        ? original.map(() => bloodMaskMaterial) : bloodMaskMaterial;
    }
    if (isTarget) {
      return mapEvidenceTargetMaterialSlots(
        original,
        (material) => targetMaskMaterial(material, object),
        invisibleFor(object),
      );
    }
    const materials = Array.isArray(original) ? original : [original];
    const mapped = materials.map((material) => {
      if (!isEvidenceOpaqueMaterial(material)) return invisibleFor(object);
      return plainMaskMaterial(material, false, object);
    });
    return Array.isArray(original) ? mapped : mapped[0];
  };
  const readBuffer = new Uint8Array(width * height * 4);
  const renderMask = (subjects, { occluders = true, alphaTarget = false } = {}) => {
    try {
      for (const state of drawableStates) {
        const selected = subjects.has(state.object);
        state.object.visible = state.effective && (occluders || selected);
        if (state.object.visible) {
          state.object.material = materialFor(
            state.material, selected, alphaTarget && selected, state.object,
          );
        }
      }
      siege.scene.background = new THREE.Color(0x000000);
      siege.scene.fog = null;
      renderer.setRenderTarget(target);
      /* PostFX legitimately leaves a narrow scissor/viewport active while it
       * composites. The reused ID target must own all of its pixels before
       * clear(), otherwise Eric's first white head patch survives every later
       * mask and falsely joins unrelated people, gun and lamp silhouettes. */
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, true);
      renderer.render(siege.scene, siege.camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, readBuffer);
      const mask = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) {
        const sourceRow = height - 1 - y;
        for (let x = 0; x < width; x += 1) {
          const source = (sourceRow * width + x) * 4;
          mask[y * width + x] = readBuffer[source] >= 128 ? 1 : 0;
        }
      }
      return mask;
    } finally {
      for (const state of drawableStates) {
        state.object.material = state.material;
        state.object.visible = state.visible;
      }
      siege.scene.background = oldBackground;
      siege.scene.fog = oldFog;
      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(oldViewport);
      renderer.setScissor(oldScissor);
      renderer.setScissorTest(oldScissorTest);
      renderer.setClearColor(oldClear, oldClearAlpha);
    }
  };

  const bodyMeshes = (member) => descendants(
    member.root,
    (object) => isEvidenceBodyMesh(object, member.root, member.gun),
  );
  const partMeshes = (member, part) => descendants(
    part,
    (object) => isEvidenceBodyMesh(object, member.root, member.gun),
  );
  const ericBodySet = bodyMeshes(eric);
  const guardBodySet = bodyMeshes(guard);
  const bloodSet = descendants(blood);
  const gunSet = descendants(guard.gun);
  const lampSet = descendants(lamp);
  const subjectSets = auditEvidenceSubjectSets({
    ericBody: ericBodySet,
    ericBlood: bloodSet,
    guardBody: guardBodySet,
    guardGun: gunSet,
    worklamp: lampSet,
  });
  const effectiveNonMesh = drawableStates
    .filter((state) => state.kind !== 'mesh' && state.effective)
    .map((state) => evidenceObjectDescription(state.object));

  try {
    const ericBodyMask = renderMask(ericBodySet);
    const ericBodyUnoccluded = renderMask(ericBodySet, { occluders: false });
    const bloodMask = renderMask(bloodSet, { alphaTarget: true });
    const guardBodyMask = renderMask(guardBodySet);
    const guardBodyUnoccluded = renderMask(guardBodySet, { occluders: false });
    const gunMask = renderMask(gunSet);
    const gunUnoccluded = renderMask(gunSet, { occluders: false });
    const lampMask = renderMask(lampSet);
    const lampUnoccluded = renderMask(lampSet, { occluders: false });
    const partProofs = (member) => ({
      head: summarizePart(
        renderMask(partMeshes(member, member.figure.parts.head)),
        luminance, width, height,
      ),
      torso: summarizePart(
        renderMask(partMeshes(member, member.figure.parts.torso)),
        luminance, width, height,
      ),
      armLeft: summarizePart(
        renderMask(partMeshes(member, member.figure.parts.armL)),
        luminance, width, height,
      ),
      armRight: summarizePart(
        renderMask(partMeshes(member, member.figure.parts.armR)),
        luminance, width, height,
      ),
      legLeft: summarizePart(
        renderMask(partMeshes(member, member.figure.parts.legL)),
        luminance, width, height,
      ),
      legRight: summarizePart(
        renderMask(partMeshes(member, member.figure.parts.legR)),
        luminance, width, height,
      ),
    });
    const ericBody = summarize(ericBodyMask, ericBodyUnoccluded, luminance, width, height);
    ericBody.parts = partProofs(eric);
    const guardBody = summarize(
      guardBodyMask, guardBodyUnoccluded, luminance, width, height,
    );
    guardBody.parts = partProofs(guard);
    const bloodProof = summarizeBlood(
      bloodMask, screenshot, luminance, width, height,
    );
    return {
      viewport: { width, height },
      targetSelection: subjectSets,
      drawableAudit: {
        counts: Object.fromEntries(['mesh', 'sprite', 'points', 'line'].map((kind) => [
          kind, drawableStates.filter((state) => state.kind === kind).length,
        ])),
        effectiveNonMeshCount: effectiveNonMesh.length,
        effectiveNonMesh: effectiveNonMesh.slice(0, 24),
      },
      eric: {
        body: ericBody,
        blood: bloodProof,
        bloodToBodyRatio: ericBody.visiblePixels
          ? Number((bloodProof.visiblePixels / ericBody.visiblePixels).toFixed(4)) : null,
      },
      guard: {
        body: guardBody,
        gun: summarize(gunMask, gunUnoccluded, luminance, width, height),
      },
      worklamp: summarize(lampMask, lampUnoccluded, luminance, width, height),
      separation: {
        ericGuardPixels: Number(boundsGap(
          maskBounds(ericBodyMask, width, height),
          maskBounds(guardBodyMask, width, height),
        ).toFixed(3)),
        gunLampPixels: Number(boundsGap(
          maskBounds(gunMask, width, height),
          maskBounds(lampMask, width, height),
        ).toFixed(3)),
      },
    };
  } finally {
    target.dispose();
    for (const material of allocated) material.dispose?.();
  }
}

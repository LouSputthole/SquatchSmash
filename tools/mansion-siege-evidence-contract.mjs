/** Pure semantic gates shared by the Mansion/Siege screenshot verifier. */

export function isEvidenceOpaqueMaterial(material) {
  return material != null
    && material.visible !== false
    && (!material.transparent || (material.opacity ?? 1) >= 0.5);
}

export function isEvidenceOpaqueIntersection(intersection) {
  const material = intersection?.object?.material;
  if (!Array.isArray(material)) return isEvidenceOpaqueMaterial(material);

  const materialIndex = intersection?.face?.materialIndex;
  if (Number.isInteger(materialIndex) && materialIndex >= 0 && materialIndex < material.length) {
    return isEvidenceOpaqueMaterial(material[materialIndex]);
  }

  /* Three supplies materialIndex for grouped multi-material geometry. If an
   * unusual geometry does not, keep the ray conservative rather than silently
   * declaring a possible blocker transparent. */
  return material.some(isEvidenceOpaqueMaterial);
}

function intersectionMaterials(intersection) {
  const material = intersection?.object?.material;
  if (!Array.isArray(material)) return [material];
  const materialIndex = intersection?.face?.materialIndex;
  if (Number.isInteger(materialIndex) && materialIndex >= 0 && materialIndex < material.length) {
    return [material[materialIndex]];
  }
  return material;
}

function sampledChannel(sampleTextureChannel, texture, uv, channel) {
  if (!texture) return 1;
  const sample = Number(sampleTextureChannel?.(texture, uv, channel));
  return Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
}

/** Pixel-aware counterpart to the coarse geometry ray gate. Transparent
 * CanvasTexture stains contain genuinely clear texels, so their material
 * opacity alone cannot prove a blood pixel reached the screenshot. */
export function isEvidenceOpaquePixelIntersection(
  intersection, sampleTextureChannel = () => 1,
) {
  return intersectionMaterials(intersection).some((material) => {
    if (material == null || material.visible === false) return false;
    const opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
    const mapAlpha = sampledChannel(
      sampleTextureChannel, material.map, intersection?.uv, 'alpha',
    );
    const alphaMap = sampledChannel(
      sampleTextureChannel, material.alphaMap, intersection?.uv, 'green',
    );
    const effectiveAlpha = Math.max(0, Math.min(1, opacity * mapAlpha * alphaMap));
    const alphaTest = Number.isFinite(material.alphaTest) ? material.alphaTest : 0;
    if (effectiveAlpha < alphaTest) return false;
    return material.transparent !== true || effectiveAlpha >= 0.5;
  });
}

/** Choose a deterministic, spatially spread set of real painted texels.
 * The caller has already rejected clear/effectively-transparent candidates;
 * this function only prevents a dense patch near the texture centre from
 * standing in for the whole irregular stain. An incomplete candidate set is
 * an evidence failure, never a reason to duplicate rays. */
export function selectEvidenceTextureSamples(candidates, sampleCount = 25) {
  const count = Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount : 0;
  const valid = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => Number.isFinite(candidate?.u) && Number.isFinite(candidate?.v)
      && Number.isFinite(candidate?.x) && Number.isFinite(candidate?.y))
    .filter((candidate, index, all) => all.findIndex((other) => (
      Math.abs(other.u - candidate.u) <= 1e-9
      && Math.abs(other.v - candidate.v) <= 1e-9
    )) === index);
  if (!count || valid.length < count) return [];

  const chosen = [];
  const remaining = [...valid];
  const squaredDistance = (left, right) => (
    (left.u - right.u) ** 2 + (left.v - right.v) ** 2
  );
  while (chosen.length < count) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const score = chosen.length
        ? Math.min(...chosen.map((sample) => squaredDistance(candidate, sample)))
        : -squaredDistance(candidate, { u: 0.5, v: 0.5 });
      if (score > bestScore + 1e-12) {
        bestIndex = index;
        bestScore = score;
      }
    }
    chosen.push(remaining.splice(bestIndex, 1)[0]);
  }
  return chosen;
}

function isDescendantOrSelf(object, root) {
  if (!object || !root) return false;
  for (let current = object; current; current = current.parent) {
    if (current === root) return true;
  }
  return false;
}

/** Select only rendered body meshes for screenshot-space bounds. Siege guns
 * are parented under their figures, so a root Box3 would make the weapon
 * appear to protrude beyond a body box which already contains that weapon. */
export function isEvidenceBodyMesh(object, bodyRoot, weaponRoot = null) {
  return object?.isMesh === true
    && isDescendantOrSelf(object, bodyRoot)
    && !isDescendantOrSelf(object, weaponRoot);
}

export function evaluateEricReviveCapture(capture) {
  const eyeHeight = capture?.player?.eyeHeight;
  return capture?.prompt?.visible === true
    && capture.prompt.name === 'Eric'
    && capture.prompt.text === 'Hold E — get Eric off the floor'
    && capture.prompt.nearest?.id === 'eric'
    && capture.player?.crouching === true
    && capture.player.crouchKeyHeld === true
    && capture.player.simulationPaused === true
    && capture.player.equipped === null
    && capture.player.viewmodelWeaponVisible === false
    && Number.isFinite(eyeHeight)
    && Math.abs(eyeHeight - 1.02) <= 0.001;
}

export function evaluateEricReviveCaptureWindow(captureWindow) {
  const before = captureWindow?.before;
  const after = captureWindow?.after;
  return evaluateEricReviveCapture(before)
    && evaluateEricReviveCapture(after)
    && JSON.stringify(before) === JSON.stringify(after);
}

function ndcMetrics(proof) {
  const ndc = proof?.ndc;
  const values = [ndc?.minX, ndc?.maxX, ndc?.minY, ndc?.maxY];
  if (!values.every(Number.isFinite)) return null;
  return {
    ...ndc,
    width: ndc.maxX - ndc.minX,
    height: ndc.maxY - ndc.minY,
  };
}

function paddedScreenProof(proof, { minWidth, minHeight }) {
  const bounds = ndcMetrics(proof);
  return proof?.fullyInside === true
    && bounds !== null
    && bounds.minX >= -0.95 && bounds.maxX <= 0.95
    && bounds.minY >= -0.95 && bounds.maxY <= 0.95
    && bounds.width >= minWidth && bounds.height >= minHeight;
}

function overlapArea(left, right) {
  const a = ndcMetrics(left);
  const b = ndcMetrics(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const width = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const height = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return width * height;
}

function visibleSampleProof(proof, { minHits, minRatio }) {
  const visibility = proof?.visibility;
  return Number.isInteger(visibility?.sampleCount)
    && visibility.sampleCount === 25
    && Number.isInteger(visibility.targetHits)
    && visibility.targetHits >= minHits
    && Number.isFinite(visibility.hitRatio)
    && Math.abs(visibility.hitRatio
      - visibility.targetHits / visibility.sampleCount) <= 0.001
    && visibility.hitRatio >= minRatio;
}

function paintedTextureSampleProof(proof, minimums) {
  const visibility = proof?.visibility;
  return visibility?.sampleMode === 'painted-texture'
    && Number.isInteger(visibility.paintedCandidateCount)
    && visibility.paintedCandidateCount >= 25
    && visibleSampleProof(proof, minimums);
}

/** Pixel-composition contract for the one frame that must prove all three:
 * Eric fallen in his blood, a visibly armed non-surrender guard, and the
 * supported worklamp. This deliberately asks more than "inside the frustum". */
export function diagnoseWorklampComposition(composition) {
  const body = ndcMetrics(composition?.eric?.body);
  const blood = ndcMetrics(composition?.eric?.blood);
  const guardBody = ndcMetrics(composition?.guard?.body);
  const guardGun = ndcMetrics(composition?.guard?.gun);
  const lamp = ndcMetrics(composition?.worklamp);
  if (!body || !blood || !guardBody || !guardGun || !lamp) {
    return {
      pass: false,
      failures: ['projection-metrics'],
      measurements: { body, blood, guardBody, guardGun, lamp },
    };
  }

  const bloodExtensions = [
    body.minX - blood.minX,
    blood.maxX - body.maxX,
    body.minY - blood.minY,
    blood.maxY - body.maxY,
  ];
  const gunExtensions = [
    guardBody.minX - guardGun.minX,
    guardGun.maxX - guardBody.maxX,
    guardBody.minY - guardGun.minY,
    guardGun.maxY - guardBody.maxY,
  ];
  const peopleGap = Math.max(
    body.minX - guardBody.maxX,
    guardBody.minX - body.maxX,
  );
  const gunArea = guardGun.width * guardGun.height;
  const lampGunOverlapRatio = overlapArea(composition.guard.gun, composition.worklamp)
    / Math.max(1e-6, gunArea);

  const clauses = {
    'eric.body.frame': paddedScreenProof(
      composition.eric.body, { minWidth: 0.55, minHeight: 0.5 },
    ),
    'eric.body.first-hit': visibleSampleProof(
      composition.eric.body, { minHits: 5, minRatio: 0.2 },
    ),
    'eric.blood.frame': paddedScreenProof(
      composition.eric.blood, { minWidth: 0.35, minHeight: 0.08 },
    ),
    'eric.blood.painted-first-hit': paintedTextureSampleProof(
      composition.eric.blood, { minHits: 5, minRatio: 0.2 },
    ),
    'eric.blood.owner': composition.eric.bloodOwner === 'eric',
    'eric.blood.opacity': composition.eric.bloodOpacity >= 0.7,
    'eric.blood.emissive-red': composition.eric.bloodEmissiveRed >= 0.55,
    'eric.blood.extends-body': bloodExtensions.filter((amount) => amount >= 0.08).length >= 2,
    'guard.body.frame': paddedScreenProof(
      composition.guard.body, { minWidth: 0.3, minHeight: 0.5 },
    ),
    'guard.body.first-hit': visibleSampleProof(
      composition.guard.body, { minHits: 5, minRatio: 0.2 },
    ),
    'guard.gun.frame': paddedScreenProof(
      composition.guard.gun, { minWidth: 0.12, minHeight: 0.05 },
    ),
    'guard.gun.first-hit': visibleSampleProof(
      composition.guard.gun, { minHits: 3, minRatio: 0.12 },
    ),
    'guard.gun.extends-body': Math.max(...gunExtensions) >= 0.02,
    'people.separation': peopleGap >= 0.025,
    'worklamp.intersects': composition.worklamp?.intersects === true,
    'worklamp.frame': lamp.width >= 0.03 && lamp.height >= 0.1,
    'worklamp.first-hit': visibleSampleProof(
      composition.worklamp, { minHits: 3, minRatio: 0.12 },
    ),
    'guard-gun.worklamp-overlap': lampGunOverlapRatio <= 0.35,
  };
  const failures = Object.entries(clauses)
    .filter(([, passed]) => passed !== true).map(([name]) => name);
  return {
    pass: failures.length === 0,
    failures,
    measurements: {
      body,
      blood,
      guardBody,
      guardGun,
      lamp,
      bloodExtensions,
      gunExtensions,
      peopleGap,
      lampGunOverlapRatio,
      visibility: {
        ericBody: composition?.eric?.body?.visibility ?? null,
        ericBlood: composition?.eric?.blood?.visibility ?? null,
        guardBody: composition?.guard?.body?.visibility ?? null,
        guardGun: composition?.guard?.gun?.visibility ?? null,
        worklamp: composition?.worklamp?.visibility ?? null,
      },
    },
  };
}

export function evaluateWorklampComposition(composition) {
  return diagnoseWorklampComposition(composition).pass;
}

function evaluateEricFallen(capture) {
  const eric = capture?.eric;
  return eric?.id === 'eric' && eric.staged === true
    && eric.health === 1 && eric.downed === true
    && eric.incapacitated === false && eric.pose === 'fallen'
    && eric.weaponId === 'ak47' && eric.gunVisible === false
    && eric.bloodVisible === true;
}

function evaluateGuardFlinch(capture) {
  const guard = capture?.liveGuard;
  return guard?.id === 'guard_1' && guard.staged === true
    && guard.downed === false && guard.incapacitated === false
    && guard.pose === 'flinch' && guard.businessKey === 'flinch'
    && guard.weaponId === 'carbine' && guard.gunVisible === true
    && guard.firingGripContact === true
    && Number.isFinite(guard.supportHandGap) && guard.supportHandGap <= 0.04
    && guard.bothHandsAboveHead === false;
}

function evaluateWorklampLight(capture) {
  const light = capture?.worklampLight;
  return light?.candidate === true && light.visible === true
    && Number.isFinite(light.intensity) && light.intensity >= 24
    && Number.isFinite(light.distance) && light.distance >= 15
    && Number.isInteger(light.activeLimit) && light.activeLimit === 10
    && Number.isInteger(light.candidateCount) && light.candidateCount >= light.activeLimit
    && Number.isInteger(light.rank) && light.rank >= 1 && light.rank <= light.activeLimit
    && light.rank <= light.candidateCount;
}

/** The worklamp PNG is authoritative only when one unchanged, fully valid
 * semantic + projected-pixel state brackets page.screenshot(). */
export function evaluateWorklampCaptureWindow(captureWindow) {
  return diagnoseWorklampCaptureWindow(captureWindow).pass;
}

export function diagnoseWorklampCaptureWindow(captureWindow) {
  const before = captureWindow?.before;
  const after = captureWindow?.after;
  const beforeComposition = diagnoseWorklampComposition(before?.composition);
  const afterComposition = diagnoseWorklampComposition(after?.composition);
  const clauses = {
    'capture.revive-window': evaluateEricReviveCaptureWindow(captureWindow),
    'capture.before-composition': beforeComposition.pass,
    'capture.after-composition': afterComposition.pass,
    'capture.before-eric-fallen': evaluateEricFallen(before),
    'capture.after-eric-fallen': evaluateEricFallen(after),
    'capture.before-guard-flinch': evaluateGuardFlinch(before),
    'capture.after-guard-flinch': evaluateGuardFlinch(after),
    'capture.before-worklamp-light': evaluateWorklampLight(before),
    'capture.after-worklamp-light': evaluateWorklampLight(after),
  };
  const failures = Object.entries(clauses)
    .filter(([, passed]) => passed !== true).map(([name]) => name);
  return {
    pass: failures.length === 0,
    failures,
    beforeComposition,
    afterComposition,
    semantic: {
      beforeEric: before?.eric ?? null,
      afterEric: after?.eric ?? null,
      beforeGuard: before?.liveGuard ?? null,
      afterGuard: after?.liveGuard ?? null,
      beforePrompt: before?.prompt ?? null,
      afterPrompt: after?.prompt ?? null,
      beforePlayer: before?.player ?? null,
      afterPlayer: after?.player ?? null,
      beforeWorklampLight: before?.worklampLight ?? null,
      afterWorklampLight: after?.worklampLight ?? null,
    },
  };
}

function exactDerivedRatio(numerator, denominator, reported) {
  return Number.isInteger(numerator) && numerator >= 0
    && Number.isInteger(denominator) && denominator > 0
    && Number.isFinite(reported)
    && Math.abs(reported - numerator / denominator) <= 0.001;
}

function readablePixelSilhouette(proof, {
  minPixels, minVisibleFraction, minConnectedRatio,
  minBoundaryPixels, minBoundaryContrast, minContrastedBoundaryRatio,
} = {}) {
  return Number.isInteger(proof?.visiblePixels) && proof.visiblePixels >= minPixels
    && Number.isInteger(proof?.unoccludedPixels)
    && proof.unoccludedPixels >= proof.visiblePixels
    && exactDerivedRatio(
      proof.visiblePixels, proof.unoccludedPixels, proof.visibleFraction,
    )
    && proof.visibleFraction >= minVisibleFraction
    && Number.isInteger(proof?.largestComponentPixels)
    && proof.largestComponentPixels <= proof.visiblePixels
    && exactDerivedRatio(
      proof.largestComponentPixels, proof.visiblePixels, proof.largestComponentRatio,
    )
    && proof.largestComponentRatio >= minConnectedRatio
    && Number.isInteger(proof?.boundaryPixels) && proof.boundaryPixels >= minBoundaryPixels
    && Number.isFinite(proof?.boundaryContrast)
    && proof.boundaryContrast >= minBoundaryContrast
    && Number.isInteger(proof?.contrastedBoundaryPixels)
    && proof.contrastedBoundaryPixels <= proof.boundaryPixels
    && exactDerivedRatio(
      proof.contrastedBoundaryPixels, proof.boundaryPixels,
      proof.contrastedBoundaryRatio,
    )
    && proof.contrastedBoundaryRatio >= minContrastedBoundaryRatio;
}

function readablePart(part, { minPixels, minBoundaryPixels } = {}) {
  return Number.isInteger(part?.visiblePixels) && part.visiblePixels >= minPixels
    && Number.isInteger(part?.largestComponentPixels)
    && part.largestComponentPixels <= part.visiblePixels
    && exactDerivedRatio(
      part.largestComponentPixels, part.visiblePixels, part.largestComponentRatio,
    )
    && part.largestComponentRatio >= 0.65
    && Number.isInteger(part?.boundaryPixels) && part.boundaryPixels >= minBoundaryPixels
    && Number.isFinite(part?.boundaryContrast) && part.boundaryContrast >= 0.07
    && Number.isInteger(part?.contrastedBoundaryPixels)
    && part.contrastedBoundaryPixels <= part.boundaryPixels
    && exactDerivedRatio(
      part.contrastedBoundaryPixels, part.boundaryPixels,
      part.contrastedBoundaryRatio,
    )
    && part.contrastedBoundaryRatio >= 0.4;
}

function readablePersonParts(parts) {
  return readablePart(parts?.head, { minPixels: 120, minBoundaryPixels: 50 })
    && readablePart(parts?.torso, { minPixels: 600, minBoundaryPixels: 100 })
    && readablePart(parts?.armLeft, { minPixels: 100, minBoundaryPixels: 40 })
    && readablePart(parts?.armRight, { minPixels: 100, minBoundaryPixels: 40 })
    && readablePart(parts?.legLeft, { minPixels: 100, minBoundaryPixels: 40 })
    && readablePart(parts?.legRight, { minPixels: 100, minBoundaryPixels: 40 });
}

function readableBloodPixels(blood) {
  return Number.isInteger(blood?.visiblePixels) && blood.visiblePixels >= 1200
    && Number.isInteger(blood?.redReadablePixels) && blood.redReadablePixels >= 900
    && blood.redReadablePixels <= blood.visiblePixels
    && exactDerivedRatio(
      blood.redReadablePixels, blood.visiblePixels, blood.redReadableRatio,
    )
    && blood.redReadableRatio >= 0.55
    && Number.isInteger(blood?.boundaryPixels) && blood.boundaryPixels >= 120
    && Number.isFinite(blood?.boundaryContrast) && blood.boundaryContrast >= 0.08
    && Number.isInteger(blood?.contrastedBoundaryPixels)
    && blood.contrastedBoundaryPixels <= blood.boundaryPixels
    && exactDerivedRatio(
      blood.contrastedBoundaryPixels, blood.boundaryPixels,
      blood.contrastedBoundaryRatio,
    )
    && blood.contrastedBoundaryRatio >= 0.45;
}

/** Screenshot-byte contract for the worklamp frame. Geometry and first-hit
 * ownership remain necessary, but 54980 proved they can still describe dark,
 * fragmented blocks merged into the rail. These metrics come from exact PNG
 * bytes intersected with occlusion-aware, frozen-state subject ID masks. */
export function evaluateWorklampPixelProof(
  proof, expectedImageSha256 = proof?.imageSha256,
) {
  return diagnoseWorklampPixelProof(proof, expectedImageSha256).pass;
}

function pixelSilhouetteSummary(proof) {
  if (!proof) return null;
  return {
    visiblePixels: proof.visiblePixels,
    unoccludedPixels: proof.unoccludedPixels,
    bounds: proof.bounds ?? null,
    visibleFraction: proof.visibleFraction,
    largestComponentPixels: proof.largestComponentPixels,
    largestComponentRatio: proof.largestComponentRatio,
    boundaryPixels: proof.boundaryPixels,
    boundaryContrast: proof.boundaryContrast,
    contrastedBoundaryPixels: proof.contrastedBoundaryPixels,
    contrastedBoundaryRatio: proof.contrastedBoundaryRatio,
  };
}

export function diagnoseWorklampPixelProof(
  proof, expectedImageSha256 = proof?.imageSha256,
) {
  const ericBody = proof?.eric?.body;
  const blood = proof?.eric?.blood;
  const guardBody = proof?.guard?.body;
  const gun = proof?.guard?.gun;
  const lamp = proof?.worklamp;
  const bloodToBodyRatio = proof?.eric?.bloodToBodyRatio;
  const ericSilhouette = readablePixelSilhouette(ericBody, {
      minPixels: 2500, minVisibleFraction: 0.7, minConnectedRatio: 0.72,
      minBoundaryPixels: 180, minBoundaryContrast: 0.09,
      minContrastedBoundaryRatio: 0.55,
    });
  const guardSilhouette = readablePixelSilhouette(guardBody, {
      minPixels: 2500, minVisibleFraction: 0.7, minConnectedRatio: 0.72,
      minBoundaryPixels: 180, minBoundaryContrast: 0.09,
      minContrastedBoundaryRatio: 0.55,
    });
  const gunSilhouette = readablePixelSilhouette(gun, {
      minPixels: 220, minVisibleFraction: 0.72, minConnectedRatio: 0.62,
      minBoundaryPixels: 60, minBoundaryContrast: 0.09,
      minContrastedBoundaryRatio: 0.55,
    });
  const lampSilhouette = readablePixelSilhouette(lamp, {
      minPixels: 260, minVisibleFraction: 0.72, minConnectedRatio: 0.62,
      minBoundaryPixels: 70, minBoundaryContrast: 0.09,
      minContrastedBoundaryRatio: 0.55,
    });
  const partClauses = {};
  for (const [owner, parts] of [
    ['eric', ericBody?.parts], ['guard', guardBody?.parts],
  ]) {
    for (const [name, minimums] of [
      ['head', { minPixels: 120, minBoundaryPixels: 50 }],
      ['torso', { minPixels: 600, minBoundaryPixels: 100 }],
      ['armLeft', { minPixels: 100, minBoundaryPixels: 40 }],
      ['armRight', { minPixels: 100, minBoundaryPixels: 40 }],
      ['legLeft', { minPixels: 100, minBoundaryPixels: 40 }],
      ['legRight', { minPixels: 100, minBoundaryPixels: 40 }],
    ]) partClauses[`${owner}.part.${name}`] = readablePart(parts?.[name], minimums);
  }
  const clauses = {
    'image.hash-format': /^[a-f0-9]{64}$/.test(expectedImageSha256 ?? ''),
    'image.hash-match': proof?.imageSha256 === expectedImageSha256,
    'image.viewport': proof?.viewport?.width === 1920 && proof?.viewport?.height === 1080,
    'target-selection.disjoint': proof?.targetSelection?.disjoint === true
      && Array.isArray(proof.targetSelection.overlaps)
      && proof.targetSelection.overlaps.length === 0,
    'eric.body': ericSilhouette,
    ...partClauses,
    'eric.parts': readablePersonParts(ericBody?.parts),
    'eric.blood': readableBloodPixels(blood),
    'eric.blood-body-ratio-exact': exactDerivedRatio(
      blood?.visiblePixels, ericBody?.visiblePixels, bloodToBodyRatio,
    ),
    'eric.blood-body-ratio-range': bloodToBodyRatio >= 0.25 && bloodToBodyRatio <= 3,
    'guard.body': guardSilhouette,
    'guard.parts': readablePersonParts(guardBody?.parts),
    'guard.gun': gunSilhouette,
    'worklamp': lampSilhouette,
    'people.separation': Number.isFinite(proof?.separation?.ericGuardPixels)
      && proof.separation.ericGuardPixels >= 20,
    'guard-gun.worklamp-separation': Number.isFinite(proof?.separation?.gunLampPixels)
      && proof.separation.gunLampPixels >= 12,
  };
  const failures = Object.entries(clauses)
    .filter(([, passed]) => passed !== true).map(([name]) => name);
  const summarizeParts = (parts) => Object.fromEntries(
    ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight']
      .map((name) => [name, pixelSilhouetteSummary(parts?.[name])]),
  );
  return {
    pass: failures.length === 0,
    failures,
    measurements: {
      expectedImageSha256,
      actualImageSha256: proof?.imageSha256 ?? null,
      viewport: proof?.viewport ?? null,
      targetSelection: proof?.targetSelection ?? null,
      drawableAudit: proof?.drawableAudit ?? null,
      eric: {
        body: pixelSilhouetteSummary(ericBody),
        parts: summarizeParts(ericBody?.parts),
        blood: blood ?? null,
        bloodToBodyRatio,
      },
      guard: {
        body: pixelSilhouetteSummary(guardBody),
        parts: summarizeParts(guardBody?.parts),
        gun: pixelSilhouetteSummary(gun),
      },
      worklamp: pixelSilhouetteSummary(lamp),
      separation: proof?.separation ?? null,
    },
  };
}

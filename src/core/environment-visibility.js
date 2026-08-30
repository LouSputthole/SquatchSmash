/**
 * Shared visibility budgets for the three environment archetypes that exposed
 * floating backdrops, foliage-before-terrain, and road pop-in in this pass.
 *
 * These are minimum presentation contracts, not a universal quality knob.
 * Scenes may exceed them, but they should not independently guess lower
 * values. Terrain coverage is intentionally paired with foliage coverage so a
 * tree can never outlive the ground that supports it.
 */
export const ENVIRONMENT_VISIBILITY = Object.freeze({
  indoorSkyline: Object.freeze({
    cameraFar: 320,
    groundedBackdropExtent: 120,
  }),
  wildernessHub: Object.freeze({
    cameraFar: 220,
    nearFoliage: 66,
    undergrowth: 52,
    farFoliage: 158,
    chunkSize: 32,
  }),
  forestDrive: Object.freeze({
    cameraFar: 320,
    terrainChunkSize: 48,
    terrainChunkRadius: 2,
    treeChunkRadius: 1,
    fogReadableDistance: 100,
  }),
});

/** Project-wide invariant used by architecture tests and scene boot checks. */
export function validateEnvironmentVisibility(kind, policy = ENVIRONMENT_VISIBILITY[kind]) {
  if (!policy) return [`Unknown environment visibility archetype: ${kind}`];
  const failures = [];
  if (!(policy.cameraFar > 0)) failures.push(`${kind}: cameraFar must be positive`);
  if (kind === 'indoorSkyline'
    && policy.cameraFar < policy.groundedBackdropExtent * 2) {
    failures.push(`${kind}: camera far plane cannot certify the grounded skyline`);
  }
  if (kind === 'wildernessHub') {
    if (policy.undergrowth > policy.nearFoliage) {
      failures.push(`${kind}: undergrowth outlives its near terrain/foliage band`);
    }
    if (policy.nearFoliage >= policy.farFoliage) {
      failures.push(`${kind}: far foliage must overlap the near-to-far handoff`);
    }
    if (policy.cameraFar < policy.farFoliage + policy.chunkSize) {
      failures.push(`${kind}: camera clips the far foliage before its final chunk`);
    }
  }
  if (kind === 'forestDrive') {
    const terrainHalfWidth = (policy.terrainChunkRadius + 0.5) * policy.terrainChunkSize;
    const treeHalfWidth = (policy.treeChunkRadius + 0.5) * policy.terrainChunkSize;
    if (terrainHalfWidth < policy.fogReadableDistance) {
      failures.push(`${kind}: readable fog distance extends past streamed terrain`);
    }
    if (treeHalfWidth > terrainHalfWidth) {
      failures.push(`${kind}: trees can stream beyond their supporting terrain`);
    }
    if (policy.cameraFar < terrainHalfWidth) {
      failures.push(`${kind}: camera clips streamed terrain`);
    }
  }
  return failures;
}

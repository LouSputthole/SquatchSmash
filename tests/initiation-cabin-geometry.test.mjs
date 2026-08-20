/**
 * INITIATION NIGHT — the site, through the geometry gate.
 *
 * `src/initiation/main.js` is waived from the blocking gate
 * (`GEOMETRY_FROZEN_WAIVERS`) because it is a top-level WebGL boot script with
 * no builder to call. The cabin subtree is not: it is a pure headless builder,
 * so it can be put through the REAL gate pipeline — the same collector, the
 * same scene policy, the same scanner and the same thresholds that
 * `tools/verify-geometry.mjs` runs — and it is, here, on every `npm test`.
 *
 * What that buys, in the gate's own words: nothing on this site interpenetrates
 * anything else, nothing floats, and nothing is buried in a wall. Which in this
 * scene's terms means no tree through the cabin roof, no car parked inside
 * another car, no lamp hanging off nothing, no picture frame inside the timber,
 * and no whiskey glass sunk three millimetres into the table it is standing on.
 *
 * IF THE RECORD COUNT MOVES: check the FINDINGS first. A count that changes
 * with zero findings is new geometry and the number is updated. A count that
 * changes WITH findings is a defect wearing a new number.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { collectGeometrySnapshot } = await import('../tools/geometry-collect.mjs');
const { applyScenePolicy } = await import('../tools/verify-geometry-worker.mjs');
const gate = await import('../tools/geometry-gate.mjs');
const { buildInitiationCabinSite } = await import('../src/initiation/cabin/index.js');

/** The floor under the record count: a build that quietly collapses fails. */
const MINIMUM_RECORDS = 1200;

function scan(state, built) {
  const snapshot = collectGeometrySnapshot({
    roots: [{ label: 'initiation-site', root: built.root }],
    THREE,
  });
  assert.deepEqual(snapshot.collectionErrors, [], 'the collector could not read the site');
  assert.ok(snapshot.counted > 0, 'the site produced no audited geometry at all');
  const policy = applyScenePolicy(snapshot);
  const records = gate.geometryRecordsFromSnapshot(policy);
  return { snapshot, policy, scan: gate.scanGeometry({ scene: 'initiation', state, records }) };
}

test('the whole site passes the geometry gate', () => {
  const built = buildInitiationCabinSite();
  const result = scan('cabin-night', built);

  assert.deepEqual(
    result.scan.findings.map((finding) => `${finding.kind} ${finding.left ?? finding.object}`),
    [],
    'the geometry gate found faults on the initiation site',
  );
  assert.ok(
    result.scan.recordCount > MINIMUM_RECORDS,
    `only ${result.scan.recordCount} records — the site did not build`,
  );
});

test('each part of the night stands up on its own', () => {
  for (const [state, options] of [
    ['woods', { clearing: false, cabin: false }],
    ['execution-ground', { woods: false, cabin: false }],
    ['cabin', { woods: false, clearing: false }],
  ]) {
    const built = buildInitiationCabinSite(options);
    const result = scan(state, built);
    assert.deepEqual(
      result.scan.findings.map((finding) => `${finding.kind} ${finding.left ?? finding.object}`),
      [],
      `${state} has geometry faults of its own`,
    );
  }
});

test('the site is the same site every time it is built', () => {
  const first = scan('cabin-night', buildInitiationCabinSite());
  const second = scan('cabin-night', buildInitiationCabinSite());
  assert.deepEqual(
    [...second.scan.recordIds],
    [...first.scan.recordIds],
    'the build is not deterministic — the gate can never scan the same scene twice',
  );

  /* And a different seed really is a different forest, so the seed is doing
   * something rather than being decoration. */
  const other = scan('cabin-night', buildInitiationCabinSite({ seed: 0x2b2b2b }));
  assert.notDeepEqual([...other.scan.recordIds], [...first.scan.recordIds]);
  assert.deepEqual(other.scan.findings, [], 'another seed grows a broken forest');
});

test('fire, smoke and headlight beams are effects, not objects', () => {
  const built = buildInitiationCabinSite();
  const { snapshot } = scan('cabin-night', built);
  const ids = snapshot.items.map((item) => item.id);
  for (const token of ['flame', 'smoke', 'fog.volume', 'beam.fog']) {
    assert.equal(
      ids.filter((id) => id.includes(token)).length,
      0,
      `something named "${token}" is being measured as though it were a solid`,
    );
  }
  /* …but the things that ARE solid are all still there. */
  for (const token of ['cabin.shell', 'clearing.mud', 'trail.dirt.surface', 'table.top', 'forest.ground.floor']) {
    assert.ok(ids.some((id) => id.includes(token)), `the site is missing ${token}`);
  }
});

test('every tree stands in its own hole', () => {
  const built = buildInitiationCabinSite({ clearing: false, cabin: false });
  const trees = built.colliders;
  for (let i = 0; i < trees.length; i++) {
    for (let j = i + 1; j < trees.length; j++) {
      const gap = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z)
        - trees[i].r - trees[j].r;
      assert.ok(gap > 0, `two trunks share a hole at ${trees[i].x.toFixed(1)}, ${trees[i].z.toFixed(1)}`);
    }
  }
});

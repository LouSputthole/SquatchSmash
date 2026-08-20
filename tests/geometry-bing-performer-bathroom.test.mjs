import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [{ buildGeometrySceneState, GEOMETRY_SCENE_STATES }, { BING_PERFORMER_BATHROOM_ACTOR_MARKER }] =
  await Promise.all([
    import('../tools/geometry-scenes.mjs'),
    import('../src/bing/performer-bathroom.js'),
  ]);

test('Bing registers and scans the optional performer bathroom pose', async () => {
  const descriptor = GEOMETRY_SCENE_STATES.find(({ id }) => id === 'bing:performer-bathroom');
  assert.deepEqual(descriptor, {
    id: 'bing:performer-bathroom',
    scene: 'bing',
    state: 'performer-bathroom',
    adapter: 'bing',
    launcherIds: [],
    geometryStage: 'performer-bathroom',
  });

  const built = await buildGeometrySceneState(descriptor.id);
  assert.equal(built.metadata.geometryStage, 'performer-bathroom');
  assert.equal(built.metadata.polePerformerCount, 3);
  const performers = [];
  built.roots[0].root.traverse((object) => {
    if (object.userData?.npc?.role === 'performer') performers.push(object);
  });
  assert.equal(performers.length, 4);
  const staged = performers.find(({ position }) => (
    Math.abs(position.x - BING_PERFORMER_BATHROOM_ACTOR_MARKER.x) < 1e-9
    && Math.abs(position.z - BING_PERFORMER_BATHROOM_ACTOR_MARKER.z) < 1e-9
  ));
  assert.ok(staged, 'the runway performer must be staged in the men’s room');
  assert.equal(staged.position.y, BING_PERFORMER_BATHROOM_ACTOR_MARKER.y);
  assert.equal(staged.rotation.y, BING_PERFORMER_BATHROOM_ACTOR_MARKER.yaw);
});

test('Bing performer bathroom policy is exact and state-local', async () => {
  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/bing.json', import.meta.url),
    'utf8',
  ));
  const entries = allowlist.entries.filter(({ state }) => state === 'performer-bathroom');
  assert.equal(entries.length, 20);
  assert.equal(entries.every(({ id, left, right }) => (
    id.startsWith('bing-performer-bathroom-')
    && left.startsWith('root:bing-one-performer-bathroom/')
    && right.startsWith('root:bing-one-performer-bathroom/')
  )), true);
  const policy = allowlist.suppressionPolicy.find(({ state }) => state === 'performer-bathroom');
  assert.equal(policy.overlap, 17);
  assert.equal(policy.checkSupport, 0);
  assert.equal(policy.sources.length, 17);
  assert.equal(policy.sources.every(({ scope, sourceId }) => (
    scope === 'direct' && sourceId.startsWith('root:bing-one-performer-bathroom/')
  )), true);
});

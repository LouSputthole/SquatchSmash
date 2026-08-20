import assert from 'node:assert/strict';
import test from 'node:test';

import { applyScenePolicy } from '../tools/verify-geometry-worker.mjs';

function item(ownerId, name, x, checkSupport) {
  const id = `${ownerId}/name=${name}#0`;
  return {
    id,
    semanticPath: id,
    ownerId: id,
    assemblyId: null,
    nearestNamedGroupId: ownerId,
    name,
    rootLabel: 'policy-test',
    min: { x, y: 1, z: 0 },
    max: { x: x + 1, y: 2, z: 1 },
    structural: false,
    wall: false,
    ...(checkSupport === undefined ? {} : { checkSupport }),
  };
}

test('mounted names still prove attachment and only explicit support policy can opt out', () => {
  const banner = 'root:test/name=hotdog.banner#0';
  const portrait = 'root:test/name=mark-family-portrait#0';
  const pipe = 'root:test/name=coolant-pipe-run#0';
  const boat = 'root:test/name=channel-buoy#0';
  const forcedFrame = 'root:test/name=frame#0';
  const adapted = applyScenePolicy({
    counted: 5,
    collectionErrors: [],
    colliders: [],
    items: [
      item(banner, 'banner-cloth', 0),
      item(portrait, 'portrait-field', 3),
      item(pipe, 'coolant-pipe', 6),
      item(boat, 'buoy-body', 9, false),
      item(forcedFrame, 'frame-panel', 12, true),
    ],
  });

  const envelopeOwners = new Set(
    adapted.items
      .filter(({ kind }) => kind === 'assembly-envelope')
      .map(({ supportOwnerId }) => supportOwnerId),
  );
  assert.equal(envelopeOwners.has(banner), true, 'a banner name is not proof of wall attachment');
  assert.equal(envelopeOwners.has(portrait), true, 'a portrait name is not proof of wall attachment');
  assert.equal(envelopeOwners.has(boat), false, 'scene-authored support opt-out was discarded');
  assert.equal(envelopeOwners.has(pipe), true, 'services must still prove their support');
  assert.equal(envelopeOwners.has(forcedFrame), true, 'explicit support opt-in must override mounted semantics');
});

test('conflicting explicit support policy inside one assembly fails closed', () => {
  const owner = 'root:test/name=fixture#0';
  assert.throws(
    () => applyScenePolicy({
      counted: 2,
      collectionErrors: [],
      colliders: [],
      items: [item(owner, 'part-a', 0, true), item(owner, 'part-b', 0, false)],
    }),
    /Conflicting explicit support policy/,
  );
});

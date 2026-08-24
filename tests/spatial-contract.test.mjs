import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  defineSpatialPrimitive,
  markSpatialPrimitive,
  readSpatialPrimitive,
  spatialBlocks,
  spatialMetadata,
} from '../src/core/spatial-contract.js';
import { stagingFindings } from '../tools/staging-gate.mjs';
import { framingFindings } from '../tools/framing-gate.mjs';
import { geometryRecordsFromSnapshot, scanGeometry } from '../tools/geometry-gate.mjs';
import { normalizeSceneColliders } from '../tools/verify-geometry-worker.mjs';
import { makeVehicleCollider } from '../src/bing/vehicles.js';

const actor = (id, x = 0, z = 0) => ({
  id,
  role: 'civilian',
  posture: 'stand',
  position: [x, 0, z],
  forward: [0, 0, 1],
  yaw: 0,
  eye: [x, 1.7, z],
  hip: [x, 1.05, z],
  actor: { id, role: 'civilian', posture: 'stand' },
});

const box = (name, min, max, extra = {}) => ({ name, min, max, ...extra });

test('spatial primitives are typed, immutable, and have channel defaults', () => {
  const body = defineSpatialPrimitive({ id: 'cast.lag', kind: 'actor-body', ownerActorId: 'lag' });
  assert.equal(body.kind, 'actor-body');
  assert.equal(body.ownerActorId, 'lag');
  assert.deepEqual(body.blocks, {
    collision: true, vision: true, navigation: true, ballistics: true,
  });
  assert.throws(() => { body.blocks.vision = true; }, TypeError);
  assert.throws(
    () => defineSpatialPrimitive({ id: 'cast.unknown', kind: 'actor-body' }),
    /requires ownerActorId/,
  );
  assert.throws(
    () => defineSpatialPrimitive({ id: 'thing', kind: 'mystery' }),
    /unknown kind/,
  );
  assert.throws(
    () => defineSpatialPrimitive({ id: 'bad-block', kind: 'world', blocks: { collision: null } }),
    /blocks\.collision must be boolean/,
  );
  assert.throws(
    () => defineSpatialPrimitive({ id: 'typo', kind: 'world', blockz: {} }),
    /Unknown spatial primitive field/,
  );
});

test('geometry scan honors typed collision channels across the complete Adapter seam', () => {
  const records = geometryRecordsFromSnapshot({
    items: [],
    colliders: [
      {
        id: 'world', ownerId: 'world', min: [-1, 0, -1], max: [1, 2, 1],
        spatial: { typed: true }, blocks: { collision: true }, checkSupport: false,
      },
      {
        id: 'trigger', ownerId: 'trigger', min: [-1, 0, -1], max: [1, 2, 1],
        spatial: { typed: true }, blocks: { collision: false }, checkSupport: false,
      },
    ],
  });
  const scan = scanGeometry({ scene: 'fixture', records });
  assert.deepEqual(scan.findings.filter(({ kind }) => kind === 'INTERPENETRATION'), []);
});

test('a nonphysical typed volume cannot support a floating prop', () => {
  const records = geometryRecordsFromSnapshot({
    items: [{
      id: 'lamp', ownerId: 'lamp', min: [-0.1, 1.02, -0.1], max: [0.1, 1.22, 0.1],
      checkSupport: true,
    }],
    colliders: [{
      id: 'trigger', ownerId: 'trigger', min: [-1, 0, -1], max: [1, 1, 1],
      spatial: { typed: true }, blocks: { collision: false },
      supports: true, fixedSupportAnchor: true, checkSupport: false,
    }],
  });
  const scan = scanGeometry({ scene: 'fixture', records });
  assert.ok(scan.findings.some(({ kind, object }) => kind === 'FLOATING' && object === 'lamp'));
});

test('markSpatialPrimitive is the authoring Interface and untyped stays UNKNOWN', () => {
  const collider = { userData: {} };
  markSpatialPrimitive(collider, { id: 'front-door', kind: 'door' });
  assert.equal(readSpatialPrimitive(collider).kind, 'door');
  assert.equal(spatialBlocks(collider, 'vision'), true);
  assert.deepEqual(spatialMetadata({}), { typed: false });
  assert.throws(() => spatialBlocks(collider, 'smell'), /Unknown spatial block channel/);
});

test('geometry Adapter preserves authored spatial meaning without guessing legacy meaning', () => {
  const typed = box('cast.lag', { x: -0.2, y: 0, z: -0.2 }, { x: 0.2, y: 1.8, z: 0.2 });
  markSpatialPrimitive(typed, { id: 'cast.lag', kind: 'actor-body', ownerActorId: 'lag' });
  const legacy = box('legacy-chair', { x: 2, y: 0, z: 2 }, { x: 3, y: 1, z: 3 });
  const root = { traverse() {} };
  const records = normalizeSceneColliders({
    scene: 'fixture', roots: [{ label: 'fixture', root }], colliders: [typed, legacy],
  });
  assert.equal(records[0].spatialKind, 'actor-body');
  assert.equal(records[0].ownerActorId, 'lag');
  assert.equal(records[0].blocks.vision, true);
  assert.deepEqual(records[1].spatial, { typed: false });
  assert.equal(records[1].spatialKind, undefined);
});

test('the shared Bing vehicle collider publishes vehicle meaning at its source', () => {
  const group = new THREE.Group();
  group.name = 'car.audit';
  group.userData.spatialId = 'audit.vehicle';
  group.position.set(4, 0, -8);
  group.rotation.y = Math.PI / 2;
  const volume = makeVehicleCollider({ group, length: 4.8, width: 1.9, height: 1.7 });
  assert.equal(readSpatialPrimitive(volume).kind, 'vehicle');
  assert.equal(spatialBlocks(volume, 'collision'), true);
  assert.equal(spatialBlocks(volume, 'vision'), true);
});

test('vehicle colliders fail closed when an instance has no authored spatial identity', () => {
  const group = new THREE.Group();
  group.name = 'car.sedan';
  assert.throws(
    () => makeVehicleCollider({ group, length: 4.8, width: 1.9, height: 1.7 }),
    /authored .*spatialId/i,
  );
});

test('typed actor ownership detects two bodies in the exact same position', () => {
  const bodies = [
    box('cast.one', [-0.25, 0, -0.25], [0.25, 1.8, 0.25], {
      typed: true,
      spatialKind: 'actor-body',
      ownerActorId: 'one',
      blocks: { collision: true, vision: false, navigation: true, ballistics: true },
    }),
    box('cast.two', [-0.25, 0, -0.25], [0.25, 1.8, 0.25], {
      typed: true,
      spatialKind: 'actor-body',
      ownerActorId: 'two',
      blocks: { collision: true, vision: false, navigation: true, ballistics: true },
    }),
  ];
  const { findings } = stagingFindings({
    id: 'fixture', actors: [actor('one'), actor('two')], boxes: bodies,
  });
  assert.equal(findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID').length, 2);
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID'), []);
});

test('typed furniture is never mistaken for a body from its dimensions', () => {
  const chair = box('chair', [-0.4, 0, -0.4], [0.4, 1.8, 0.4], {
    typed: true,
    spatialKind: 'seat',
    blocks: { collision: true, vision: true, navigation: true, ballistics: true },
  });
  const { findings } = stagingFindings({ id: 'fixture', actors: [actor('sitter')], boxes: [chair] });
  assert.equal(findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID').length, 1);
});

test('legacy spatial coverage is UNKNOWN instead of a silent green', () => {
  const chair = box('legacy-chair', [-0.4, 0, -0.4], [0.4, 1.8, 0.4]);
  const result = stagingFindings({ id: 'fixture', actors: [actor('sitter')], boxes: [chair] });
  assert.deepEqual(result.spatialCoverage, {
    status: 'UNKNOWN', total: 1, typed: 0, untyped: 1,
  });
});

test('an actor state with no spatial inventory is UNKNOWN rather than not applicable', () => {
  const result = stagingFindings({ id: 'fixture', actors: [actor('live')], boxes: [] });
  assert.equal(result.spatialCoverage.status, 'UNKNOWN');
});

test('typed actor bodies must own a live actor and spatial ids must be unique', () => {
  const bodies = [
    box('ghost-body', [2, 0, 2], [2.5, 1.8, 2.5], {
      typed: true, spatialId: 'cast.shared', spatialKind: 'actor-body', ownerActorId: 'ghost',
      blocks: { collision: true, vision: true, navigation: true, ballistics: true },
    }),
    box('live-body', [4, 0, 4], [4.5, 1.8, 4.5], {
      typed: true, spatialId: 'cast.shared', spatialKind: 'actor-body', ownerActorId: 'live',
      blocks: { collision: true, vision: true, navigation: true, ballistics: true },
    }),
  ];
  const { findings, spatialCoverage } = stagingFindings({
    id: 'fixture', actors: [actor('live')], boxes: bodies,
  });
  assert.equal(spatialCoverage.status, 'PASS');
  assert.ok(findings.some(({ kind }) => kind === 'SPATIAL_OWNER_MISSING'));
  assert.ok(findings.some(({ kind }) => kind === 'SPATIAL_ID_DUPLICATE'));
});

test('typed non-occluding and non-colliding volumes do not become walls', () => {
  const volume = box('interaction-zone', [-1, 0, 0.2], [1, 3, 0.5], {
    typed: true,
    spatialKind: 'interaction',
    blocks: { collision: false, vision: false, navigation: false, ballistics: false },
  });
  const { findings } = stagingFindings({ id: 'fixture', actors: [actor('player')], boxes: [volume] });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID'), []);
  assert.deepEqual(findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID'), []);
});

test('framing uses vision, not collision, for camera containment and occlusion', () => {
  const volume = box('dialogue-trigger', [-1, 0, -3.2], [1, 3, -2.8], {
    typed: true,
    spatialKind: 'trigger',
    blocks: { collision: false, vision: false, navigation: false, ballistics: false },
  });
  const result = framingFindings({
    id: 'fixture',
    beats: [{
      id: 'line', speaker: 'speaker',
      camera: {
        position: [0, 1.7, -6], lookAt: [0, 1.7, 0],
        fovDeg: 60, aspect: 16 / 9, near: 0.05, far: 220,
      },
    }],
    actors: [actor('speaker')],
    boxes: [volume],
  });
  assert.deepEqual(result.findings, []);

  const visibleNoncollider = {
    ...volume,
    name: 'visible-trigger',
    min: [-1, 0, -6.2],
    max: [1, 3, -5.8],
    blocks: { collision: false, vision: true, navigation: false, ballistics: false },
  };
  const visible = framingFindings({
    id: 'fixture',
    beats: [{
      id: 'inside-visible', speaker: 'speaker',
      camera: { position: [0, 1.7, -6], lookAt: [0, 1.7, 0], fovDeg: 60, aspect: 16 / 9 },
    }],
    actors: [actor('speaker')],
    boxes: [visibleNoncollider],
  });
  assert.ok(visible.findings.some(({ kind }) => kind === 'CAMERA_INSIDE_SOLID'));

  const invisibleCollider = {
    ...visibleNoncollider,
    name: 'invisible-barrier',
    blocks: { collision: true, vision: false, navigation: true, ballistics: true },
  };
  const invisible = framingFindings({
    id: 'fixture',
    beats: [{
      id: 'inside-invisible', speaker: 'speaker',
      camera: { position: [0, 1.7, -6], lookAt: [0, 1.7, 0], fovDeg: 60, aspect: 16 / 9 },
    }],
    actors: [actor('speaker')],
    boxes: [invisibleCollider],
  });
  assert.ok(invisible.findings.every(({ kind }) => kind !== 'CAMERA_INSIDE_SOLID'));
});

test('a typed actor body can occlude another speaker but never its own owner', () => {
  const speakerBody = box('speaker-body', [-0.3, 0, -0.3], [0.3, 1.9, 0.3], {
    typed: true,
    spatialKind: 'actor-body',
    ownerActorId: 'speaker',
    blocks: { collision: true, vision: true, navigation: true, ballistics: true },
  });
  const blockerBody = box('blocker-body', [-0.3, 0, -2.3], [0.3, 1.9, -1.7], {
    typed: true,
    spatialKind: 'actor-body',
    ownerActorId: 'blocker',
    blocks: { collision: true, vision: true, navigation: true, ballistics: true },
  });
  const beat = {
    id: 'line', speaker: 'speaker',
    camera: { position: [0, 1.7, -4], lookAt: [0, 1.7, 0], fovDeg: 60, aspect: 16 / 9 },
  };
  const clear = framingFindings({ id: 'fixture', beats: [beat], actors: [actor('speaker')], boxes: [speakerBody] });
  assert.ok(clear.findings.every(({ kind }) => kind !== 'SPEAKER_OCCLUDED'));
  const blocked = framingFindings({
    id: 'fixture', beats: [beat], actors: [actor('speaker'), actor('blocker', 0, -2)],
    boxes: [speakerBody, blockerBody],
  });
  assert.ok(blocked.findings.some(({ kind }) => kind === 'SPEAKER_OCCLUDED'));
});

test('a malformed typed Adapter record refuses to become silent evidence', () => {
  const invalid = box('bad', [-1, 0, -1], [1, 2, 1], { typed: true, spatialKind: 'world' });
  const { findings } = stagingFindings({ id: 'fixture', actors: [actor('a')], boxes: [invalid] });
  assert.equal(findings.filter(({ kind }) => kind === 'SPATIAL_SEMANTICS_UNKNOWN').length, 1);
});

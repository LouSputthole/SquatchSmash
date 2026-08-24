import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { mountMansionCast } = await import('../src/mansion/cast.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');

function mountHouseCast() {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  scene.add(grounds.root, interior.root);
  const cast = mountMansionCast(scene, {
    colliders: [...grounds.colliders, ...interior.colliders],
  }, {
    player: { position: new THREE.Vector3(999, 999, 999), eyeHeight: 1.66 },
    anchors: { ...grounds.anchors, ...interior.anchors },
    pool: grounds.props.poolPatio,
    suite: interior.props.masterSuite,
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, setTiming() {}, text: () => ({}) },
  });
  return { cast, grounds };
}

function hasAncestor(node, ancestor) {
  for (let at = node; at; at = at.parent) if (at === ancestor) return true;
  return false;
}

function limbMeshes(npc) {
  const meshes = [];
  for (const [leg, shin] of [
    [npc.parts.legL, npc.parts.shinL],
    [npc.parts.legR, npc.parts.shinR],
  ]) {
    leg.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible) return;
      const foot = mesh.name.startsWith('shoe.') || mesh.name === 'foot.bare';
      meshes.push({
        mesh,
        part: foot ? 'foot' : hasAncestor(mesh, shin) ? 'shin' : 'thigh',
      });
    });
  }
  return meshes;
}

function chairMeshes(chair) {
  const meshes = [];
  chair.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    let inBack = false;
    for (let at = mesh.parent; at && at !== chair; at = at.parent) {
      if (at.name === 'pool-lounger-back') inBack = true;
    }
    /* The ten visible deck slats share this measured local height. Everything
     * else at the root is chrome frame/arm hardware. */
    const fixture = inBack ? 'back'
      : Math.abs(mesh.position.y - 0.465) < 0.012 ? 'cushion' : 'frame';
    meshes.push({ mesh, fixture });
  });
  return meshes;
}

function measuredPenetrations(npc, chair) {
  npc.group.updateMatrixWorld(true);
  chair.updateMatrixWorld(true);
  const hits = [];
  for (const limb of limbMeshes(npc)) {
    const limbBox = new THREE.Box3().setFromObject(limb.mesh);
    for (const fixture of chairMeshes(chair)) {
      const fixtureBox = new THREE.Box3().setFromObject(fixture.mesh);
      const overlap = limbBox.clone().intersect(fixtureBox);
      if (overlap.isEmpty()) continue;
      const size = overlap.getSize(new THREE.Vector3());
      const penetration = Math.min(size.x, size.y, size.z);
      if (penetration <= 1e-6) continue;
      hits.push({
        part: limb.part,
        fixture: fixture.fixture,
        mesh: limb.mesh.name,
        penetration: +penetration.toFixed(4),
        overlap: { x: +size.x.toFixed(4), y: +size.y.toFixed(4), z: +size.z.toFixed(4) },
      });
    }
  }
  return hits.sort((a, b) => b.penetration - a.penetration);
}

const BODY_RAY = new THREE.Raycaster();
const BODY_RAY_DIRECTION = new THREE.Vector3(1, 0.371, 0.217).normalize();

function dressedBodyPenetration(parts) {
  parts.group.updateMatrixWorld(true);
  const excluded = new Set();
  for (const subtree of [parts.armL, parts.armR, parts.head]) {
    subtree.traverse((node) => excluded.add(node));
  }
  const colliders = [];
  parts.body.traverse((mesh) => {
    if (!mesh.isMesh || excluded.has(mesh) || !mesh.visible) return;
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    if (Math.min(size.x, size.y, size.z) <= 1e-6) return;
    colliders.push({ mesh, bounds: new THREE.Box3().setFromObject(mesh) });
  });
  const materialSides = new Map();
  for (const { mesh } of colliders) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!materialSides.has(material)) materialSides.set(material, material.side);
      material.side = THREE.DoubleSide;
    }
  }
  const inside = (point, collider) => {
    if (!collider.bounds.containsPoint(point)) return false;
    BODY_RAY.set(point, BODY_RAY_DIRECTION);
    const hits = BODY_RAY.intersectObject(collider.mesh, false)
      .filter((hit) => hit.distance > 1e-6);
    let crossings = 0;
    let previous = -Infinity;
    for (const hit of hits) {
      if (hit.distance - previous > 1e-5) {
        crossings++;
        previous = hit.distance;
      }
    }
    return crossings % 2 === 1;
  };
  const counts = {};
  try {
    for (const [side, fore] of [['left', parts.foreL], ['right', parts.foreR]]) {
      for (const kind of ['forearm', 'hand']) {
        const mesh = fore.children.find((node) => node.isMesh && node.name.endsWith(`.${kind}`));
        assert.ok(mesh, `${side} ${kind} mesh is not reusable by semantic name`);
        const positions = mesh.geometry.getAttribute('position');
        let count = 0;
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i)
            .applyMatrix4(mesh.matrixWorld);
          if (colliders.some((collider) => inside(point, collider))) count++;
        }
        counts[`${side}.${kind}`] = count;
      }
    }
  } finally {
    for (const [material, side] of materialSides) material.side = side;
  }
  return counts;
}

test('the in-water performer visibly treads and drifts without leaving the pool', () => {
  const { cast, grounds } = mountHouseCast();
  const swimmer = cast.people.poolPerformer2;
  const water = grounds.props.poolPatio.pool;
  const samples = [];

  for (let frame = 0; frame < 60 * 12; frame++) {
    cast.update(1 / 60);
    if (frame % 15 === 0) {
      samples.push({
        x: swimmer.group.position.x,
        y: swimmer.group.position.y,
        z: swimmer.group.position.z,
        arm: swimmer.parts.armL.rotation.z,
        footMinY: Math.min(...limbMeshes(swimmer)
          .filter(({ part }) => part === 'foot')
          .map(({ mesh }) => new THREE.Box3().setFromObject(mesh).min.y)),
      });
    }
  }

  const xs = samples.map(({ x }) => x);
  const ys = samples.map(({ y }) => y);
  const zs = samples.map(({ z }) => z);
  const arms = samples.map(({ arm }) => arm);
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 0.045, 'the swimmer never bobs at the waterline');
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 0.15
    || Math.max(...zs) - Math.min(...zs) >= 0.15, 'the swimmer is a planted standing rig');
  assert.ok(Math.max(...arms) - Math.min(...arms) >= 0.12, 'her arms never scull the water');
  assert.ok(Math.min(...xs) > water.x0 + 0.35 && Math.max(...xs) < water.x1 - 0.35);
  assert.ok(Math.min(...zs) > water.z0 + 0.35 && Math.max(...zs) < water.z1 - 0.35);
  assert.ok(Math.min(...samples.map(({ footMinY }) => footMinY)) > grounds.props.poolPatio.waterY - 1.1,
    'the swimmer bobs through the finished pool floor');
  assert.equal(cast.debug.evening.poolComposition.find(({ id }) => id === 'poolPerformer2')?.motion,
    'treading');
});

test('seated performers have bounded authored social motion without losing their seats', () => {
  const { cast } = mountHouseCast();
  const tub = cast.people.suitePerformer0;
  const recliner = cast.people.poolPerformer1;
  const tubY = tub.group.position.y;
  const reclinerY = recliner.group.position.y;
  const reclinerIndices = [0, 1, 3, 4];
  const poolHeads = reclinerIndices.map((index) => cast.poolPerformerRig(index).head);
  assert.ok(poolHeads.every(Boolean));
  const poolHeadIds = poolHeads.map(({ uuid }) => uuid);
  assert.ok(poolHeadIds.every(Boolean));
  assert.equal(new Set(poolHeadIds).size, poolHeadIds.length,
    'the pool recliners publish duplicate head identities');
  assert.equal(new Set(poolHeads).size, poolHeads.length,
    'the pool recliners share a head object');
  const tubBody = [];
  const reclinerHead = [];

  for (let frame = 0; frame < 60 * 8; frame++) {
    cast.update(1 / 60);
    if (frame % 10 === 0) {
      tubBody.push(tub.parts.body.rotation.z);
      reclinerHead.push(recliner.parts.head.rotation.x);
    }
  }

  assert.ok(Math.max(...tubBody) - Math.min(...tubBody) >= 0.045,
    'the hot-tub dancer is a generic static seated pose');
  assert.ok(Math.max(...reclinerHead) - Math.min(...reclinerHead) >= 0.025,
    'the pool recliner has no living rest animation');
  assert.ok(Math.min(...reclinerHead) >= 0.178 - 1e-9
      && Math.max(...reclinerHead) <= 0.222 + 1e-9,
  'the pool recliner head escaped its authored bounded motion');
  assert.deepEqual(reclinerIndices.map((index) => cast.poolPerformerRig(index).head), poolHeads);
  assert.deepEqual(reclinerIndices.map((index) => cast.poolPerformerRig(index).head.uuid), poolHeadIds,
    'pool performer head identities changed while their authored pose animated');
  assert.ok(Math.abs(tub.group.position.y - tubY) < 1e-6, 'tub motion lifted her off the measured seat');
  assert.ok(Math.abs(recliner.group.position.y - reclinerY) < 1e-6,
    'recliner motion lifted her off the lounger');
  assert.equal(cast.debug.evening.suiteComposition[0].motion, 'seated-social');
});

test('all four pool recliners keep visible legs out of the real lounger geometry', () => {
  const { cast, grounds } = mountHouseCast();
  cast.update(1 / 60);
  for (const [index, chairIndex] of [[0, 4], [1, 6], [3, 1], [4, 3]]) {
    const rig = cast.poolPerformerRig(index);
    assert.equal(rig.chair, grounds.props.poolPatio.chairs[chairIndex],
      `pool performer ${index} did not publish her actual occupied chair`);
    for (const side of ['left', 'right']) {
      for (const part of ['thigh', 'shin', 'foot']) {
        assert.ok(rig.legs[side][part].length > 0,
          `pool performer ${index} exposes no real ${side} ${part} meshes`);
      }
    }
  }
  const samples = [
    ['poolPerformer0', grounds.props.poolPatio.chairs[4]],
    ['poolPerformer1', grounds.props.poolPatio.chairs[6]],
    ['poolPerformer3', grounds.props.poolPatio.chairs[1]],
    ['poolPerformer4', grounds.props.poolPatio.chairs[3]],
  ].map(([id, chair]) => ({ id, hits: measuredPenetrations(cast.people[id], chair) }));

  const failures = samples.map((sample) => ({
    id: sample.id,
    hits: sample.hits.filter(({ penetration }) => penetration > 0.012),
  })).filter(({ hits }) => hits.length > 0);
  assert.deepEqual(failures, [], 'pool performers have visible leg geometry through their loungers:\n'
    + JSON.stringify(samples.map(({ id, hits }) => ({ id, hits: hits.slice(0, 12) })), null, 2));
});

test('all seven fuller Mansion performer motions keep hands and forearms outside their dressed bodies', () => {
  const { cast } = mountHouseCast();
  const ids = [
    'suitePerformer0', 'suitePerformer1',
    'poolPerformer0', 'poolPerformer1', 'poolPerformer2',
    'poolPerformer3', 'poolPerformer4',
  ];
  const maxima = Object.fromEntries(ids.map((id) => [id, {
    'left.forearm': 0,
    'left.hand': 0,
    'right.forearm': 0,
    'right.hand': 0,
  }]));
  for (let frame = 0; frame < 60 * 8; frame++) {
    cast.update(1 / 60);
    if (frame % 12 !== 0) continue;
    for (const id of ids) {
      const counts = dressedBodyPenetration(cast.people[id].parts);
      for (const key of Object.keys(counts)) {
        maxima[id][key] = Math.max(maxima[id][key], counts[key]);
      }
    }
  }
  assert.deepEqual(maxima, Object.fromEntries(ids.map((id) => [id, {
    'left.forearm': 0,
    'left.hand': 0,
    'right.forearm': 0,
    'right.hand': 0,
  }])), 'a Mansion fixture motion cuts through its fuller resort outfit');
});

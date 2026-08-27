import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  applyConnectedDeathPivot,
  auditDeathTransition,
  beginDeathTransition,
  restoreDeathTransition,
} from '../src/core/death-transition.js';
import { markActor, setActorPosture } from '../src/core/staging.js';

function connectedBody(y = 0) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3));
  torso.name = 'torso';
  torso.position.y = 0.4;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.25));
  legs.name = 'connected-legs';
  legs.position.y = 0.4;
  root.position.y = y;
  root.add(pelvis);
  pelvis.add(torso, legs);
  markActor(root, { id: 'death-contract-fixture', role: 'enemy', posture: 'stand' });
  return { root, pelvis, torso, legs };
}

test('one death transition disables live systems and preserves a connected seated hierarchy', () => {
  const { root, pelvis, torso } = connectedBody(0);
  const controller = { enabled: true };
  const animation = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const rootMotion = { active: true, pathReset: false, resetPath() { this.pathReset = true; } };
  const navigator = { active: true, stopped: false, stop() { this.stopped = true; } };
  const receipt = beginDeathTransition(root, {
    mode: 'seated',
    disable: [controller, animation, rootMotion, navigator],
  });
  assert.equal(receipt.actorState.posture, 'stand');
  assert.equal(receipt.actorState.postureWasOverridden, false);
  pelvis.rotation.z = 0.5;
  assert.equal(root.userData.actorPosture, 'sit');
  assert.equal(controller.enabled, false);
  assert.equal(animation.enabled, false);
  assert.equal(animation.stopped, true);
  assert.equal(rootMotion.active, false);
  assert.equal(rootMotion.pathReset, true);
  assert.equal(navigator.active, false);
  assert.equal(navigator.stopped, true);
  assert.deepEqual(auditDeathTransition(receipt), []);

  torso.removeFromParent();
  assert.match(auditDeathTransition(receipt).join('\n'), /left the body hierarchy/);
  assert.equal(restoreDeathTransition(receipt), true);
  assert.equal(controller.enabled, true);
  assert.equal(animation.enabled, true);
  assert.equal(rootMotion.active, true);
  assert.equal(navigator.active, true);
  assert.equal(root.userData.actorPosture, undefined,
    'restore retained a death-only posture override');
  assert.equal(root.userData.actor.posture, 'stand');
});

test('a connected death pivot moves split makePerson branches around one held pelvis', () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(2, 0.45, -3);
  root.rotation.y = 0.4;
  const body = new THREE.Group();
  body.name = 'body-branch';
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = 1;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3));
  torso.position.y = 0.4;
  hips.add(torso);
  body.add(hips);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2));
  const legR = legL.clone();
  legL.name = 'leg-left-sibling';
  legR.name = 'leg-right-sibling';
  legL.position.set(-0.14, 0.6, 0);
  legR.position.set(0.14, 0.6, 0);
  root.add(body, legL, legR);
  scene.add(root);
  markActor(root, { id: 'connected-pivot-fixture', role: 'enemy', posture: 'sit' });
  scene.updateMatrixWorld(true);
  const hipBefore = hips.getWorldPosition(new THREE.Vector3());
  const parents = new Map();
  root.traverse((node) => parents.set(node, node.parent));

  const receipt = beginDeathTransition(root, { mode: 'seated', pivot: hips });
  assert.equal(applyConnectedDeathPivot(receipt, {
    rotationDelta: { x: 0.08, z: -0.18 },
    pivotOffset: { y: -0.02 },
  }), true);
  scene.updateMatrixWorld(true);
  const hipAfter = hips.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(hipAfter.x - hipBefore.x) < 1e-9);
  assert.ok(Math.abs(hipAfter.y - (hipBefore.y - 0.02)) < 1e-9);
  assert.ok(Math.abs(hipAfter.z - hipBefore.z) < 1e-9);
  assert.ok(Math.abs(root.rotation.z) > 0.1, 'complete root never took the death tilt');
  for (const [node, parent] of parents) assert.equal(node.parent, parent, `${node.name} changed parent`);
  assert.deepEqual(auditDeathTransition(receipt), []);
});

test('death restore preserves a live seated posture and seat override exactly', () => {
  const { root } = connectedBody();
  setActorPosture(root, 'sit');
  root.userData.actorSeat = 'lounge-chair';
  const receipt = beginDeathTransition(root, { mode: 'standing' });
  assert.equal(root.userData.actorPosture, 'lie');
  assert.equal(root.userData.actorSeat, undefined);

  assert.equal(restoreDeathTransition(receipt), true);
  assert.equal(root.userData.actorPosture, 'sit');
  assert.equal(root.userData.actorSeat, 'lounge-chair');
});

test('contact audit catches both floating and penetrating standing bodies', () => {
  const floating = connectedBody(0.2);
  const floatingReceipt = beginDeathTransition(floating.root, { mode: 'standing' });
  assert.match(auditDeathTransition(floatingReceipt, { surfaceY: 0 }).join('\n'), /floats/);

  const penetrating = connectedBody(-0.2);
  const penetratingReceipt = beginDeathTransition(penetrating.root, { mode: 'scripted_execution' });
  assert.match(auditDeathTransition(penetratingReceipt, { surfaceY: 0 }).join('\n'), /penetrates/);
});

test('one contact contract certifies standing, seated, wall, furniture, stair, and scripted deaths', () => {
  const cases = [
    {
      name: 'standing',
      mode: 'standing',
      root: [0, 0, 0],
      contacts: [{ axis: 'y', side: 'min', value: 0, label: 'floor' }],
    },
    {
      name: 'seated',
      mode: 'seated',
      root: [0, 0.45, 0],
      contacts: [{ axis: 'y', side: 'min', value: 0.45, label: 'seat cushion' }],
    },
    {
      name: 'against wall',
      mode: 'standing',
      root: [0.75, 0, 0],
      contacts: [
        { axis: 'y', side: 'min', value: 0, label: 'floor' },
        { axis: 'x', side: 'max', value: 1, label: 'wall' },
      ],
    },
    {
      name: 'near furniture',
      mode: 'standing',
      root: [0, 0, 0.85],
      contacts: [
        { axis: 'y', side: 'min', value: 0, label: 'floor' },
        { axis: 'z', side: 'max', value: 1, label: 'furniture' },
      ],
    },
    {
      name: 'on stairs',
      mode: 'standing',
      root: [0, 0.28, 0],
      contacts: [{ axis: 'y', side: 'min', value: 0.28, label: 'stair tread' }],
    },
    {
      name: 'scripted execution',
      mode: 'scripted_execution',
      root: [0, 0, 0],
      contacts: [{ axis: 'y', side: 'min', value: 0, label: 'execution floor' }],
    },
  ];

  for (const scenario of cases) {
    const body = connectedBody();
    body.root.position.set(...scenario.root);
    const receipt = beginDeathTransition(body.root, { mode: scenario.mode });
    assert.deepEqual(
      auditDeathTransition(receipt, { contacts: scenario.contacts }),
      [],
      `${scenario.name} death violates its authored contacts`,
    );
  }
});

test('wall and furniture contact checks reject both separation and penetration', () => {
  const body = connectedBody();
  body.root.position.x = 0.6;
  const receipt = beginDeathTransition(body.root, { mode: 'standing' });
  const wall = [{ axis: 'x', side: 'max', value: 1, label: 'wall' }];
  assert.match(auditDeathTransition(receipt, { contacts: wall }).join('\n'), /leaves wall/);

  body.root.position.x = 0.9;
  assert.match(auditDeathTransition(receipt, { contacts: wall }).join('\n'), /penetrates wall/);
});

test('the scene-specific death rigs use the shared lifecycle contract', () => {
  for (const relative of [
    '../src/silvercase/cast/Actor.js',
    '../src/motel/actors.js',
    '../src/initiation/ceremony-figure.js',
    '../src/squatchfather/characters/SalController.js',
    '../src/squatchfather/characters/McClawskyController.js',
    '../src/bing/license-to-grill-runtime.js',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /core\/death-transition\.js/);
    assert.match(source, /beginDeathTransition\(/);
  }
});

test('Squatchfather seated deaths start and restore one connected shared transition', async () => {
  const { SalController } = await import('../src/squatchfather/characters/SalController.js');
  const { McClawskyController } = await import('../src/squatchfather/characters/McClawskyController.js');
  for (const Controller of [SalController, McClawskyController]) {
    const scene = new THREE.Scene();
    const actor = new Controller(scene);
    const before = new Set();
    actor.group.traverse((node) => before.add(node));

    actor.kill();
    const receipt = actor.group.userData.deathTransitionReceipt;
    assert.equal(receipt?.mode, 'seated');
    assert.equal(receipt?.active, true);
    assert.equal(receipt?.hierarchy.length, before.size);
    assert.deepEqual(auditDeathTransition(receipt), []);
    assert.equal(actor.fig.talkT, 0);
    if (actor instanceof McClawskyController) {
      assert.equal(actor.drawT, -1);
      assert.equal(actor.onDrawComplete, null);
    }

    actor.revive();
    assert.equal(receipt.active, false);
    assert.equal(actor.group.userData.deathTransitionReceipt, undefined);
    assert.equal(actor.dead, false);
    const after = new Set();
    actor.group.traverse((node) => after.add(node));
    assert.deepEqual(after, before);
  }
});

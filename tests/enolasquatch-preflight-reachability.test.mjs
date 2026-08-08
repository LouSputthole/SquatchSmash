/**
 * The Enola Squatch walkaround targets are registered on aircraft-part groups
 * while their generous hit proxies are child meshes. A headless simulation
 * tick does not render the scene, so Three.js will not refresh those child
 * `matrixWorld` values for us before `Raycaster.intersectObjects()`.
 *
 * This recreates that exact seam: move the carrier after a render-like matrix
 * update, ask the registered parent for its new world position (the marker's
 * path), then raycast its still-stale child (the interaction's path).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { InteractionSystem } from '../src/core/interaction.js';
import { syncInteractionTargetMatrices } from '../src/enolasquatch/preflight.js';

const hud = {
  hidePrompt() {},
  showPrompt() {},
  setHold() {},
};

test('walkaround raycasts refresh nested hit proxies after the aircraft moves without a render', () => {
  const scene = new THREE.Scene();
  const carrier = new THREE.Group();
  const target = new THREE.Group();
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  target.position.x = 5;
  target.add(proxy);
  carrier.add(target);
  scene.add(carrier);

  // The last renderer update happened at the old aircraft pose.
  scene.updateMatrixWorld(true);
  assert.deepEqual(proxy.getWorldPosition(new THREE.Vector3()).toArray(), [5, 0, 0]);

  // Mission start stages the aircraft on the apron before the next render.
  carrier.position.set(40, 10, 100);
  const marker = target.getWorldPosition(new THREE.Vector3());
  assert.deepEqual(marker.toArray(), [45, 10, 100]);
  // getWorldPosition refreshed the registered parent, not its proxy child.
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(proxy.matrixWorld).toArray(), [5, 0, 0]);

  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 100);
  camera.position.set(45, 10, 102);
  camera.lookAt(marker);
  camera.updateMatrixWorld(true);
  const interaction = new InteractionSystem(camera, hud);
  interaction.register(target, { label: 'check', enabled: () => true });

  interaction.update(1 / 60);
  assert.equal(interaction.current, null, 'the stale child reproduces the shipped missed prompt');

  syncInteractionTargetMatrices(interaction);
  interaction.update(1 / 60);
  assert.equal(interaction.current, target, 'the real nested proxy is reachable at its authored world pose');
});

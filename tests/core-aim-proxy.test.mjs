/**
 * A ROUND THAT HITS THE BOX HAS TO LAND ON THE MAN.
 *
 * Every scene with somebody you can shoot puts a generous invisible box around
 * him, because aiming at a body built out of thirty limb meshes is threading a
 * crosshair between a forearm and a rope. The box is what makes him aimable
 * and it is also a lie about where his surface is, so a decal placed at the
 * ray's contact with it lands somewhere he isn't.
 *
 * The owner found it on Triple X, who hangs upside down on a chain and SWINGS:
 * his hit volume was parented to the room rather than to the rig, so the box
 * and the man drifted apart and back together on a sine, and the blood went on
 * the box. Both halves are fixed — the box hangs off the rig now, and the
 * contact is resolved onto the body — and this holds the second half.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import {
  contactNormal,
  hiddenOrIgnored,
  isAimProxy,
  markAimProxy,
  resolveProxyContact,
} from '../src/core/combat/aim-proxy.js';

/** A man: a rig with a torso in it, and a generous box around the lot. */
function figure({ y = 0 } = {}) {
  const rig = new THREE.Group();
  rig.name = 'rig';
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4));
  torso.name = 'torso';
  torso.position.set(0, y + 1.2, 0);
  rig.add(torso);
  const proxy = markAimProxy(new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.5, 1.1)));
  proxy.name = 'aim';
  proxy.position.set(0, y + 1.25, 0);
  rig.add(proxy);
  rig.updateMatrixWorld(true);
  return { rig, torso, proxy };
}

const hit = (object, point, face = null) => ({
  object,
  point: point.clone(),
  face,
  distance: point.length(),
});

test('a proxy declares itself and an ordinary mesh does not', () => {
  const { proxy, torso } = figure();
  assert.equal(isAimProxy(proxy), true);
  assert.equal(isAimProxy(torso), false);
  assert.equal(isAimProxy(null), false);
});

test('a round through the box onto a limb uses the limb', () => {
  const { rig, torso, proxy } = figure();
  const onBox = hit(proxy, new THREE.Vector3(0.55, 1.3, 0));
  const onTorso = hit(torso, new THREE.Vector3(0.3, 1.3, 0));
  const resolved = resolveProxyContact(onBox, [onBox, onTorso], null, { body: rig });
  assert.equal(resolved, onTorso, 'the wound went on the box rather than on him');
});

test('a round that only clips the box is still a hit, on the nearest part of him', () => {
  const { rig, proxy } = figure();
  /* Half a metre out from his shoulder: inside the generous volume, outside
   * the man. A graze IS a hit -- refusing it would make the box a lie in the
   * other direction -- but the contact belongs on him. */
  const onBox = hit(proxy, new THREE.Vector3(0.54, 1.3, 0), { normal: new THREE.Vector3(1, 0, 0) });
  const resolved = resolveProxyContact(onBox, [onBox], null, { body: rig });
  assert.notEqual(resolved.point.x, 0.54, 'the contact stayed out in the air');
  assert.ok(resolved.point.x <= 0.31, `the contact is still ${resolved.point.x} from his centre`);
  assert.equal(resolved.face, null, 'the box face normal survived and would tilt the decal');
  assert.equal(resolved.normal, null);
});

test('a hidden limb cannot take the round', () => {
  const { rig, torso, proxy } = figure();
  torso.visible = false;
  const onBox = hit(proxy, new THREE.Vector3(0.55, 1.3, 0));
  const onTorso = hit(torso, new THREE.Vector3(0.3, 1.3, 0));
  const resolved = resolveProxyContact(onBox, [onBox, onTorso], null, { body: rig });
  assert.notEqual(resolved, onTorso, 'a hidden mesh stopped a round');
});

test('a shooter cannot shoot himself', () => {
  const { rig, torso, proxy } = figure();
  const onBox = hit(proxy, new THREE.Vector3(0.55, 1.3, 0));
  const onTorso = hit(torso, new THREE.Vector3(0.3, 1.3, 0));
  const resolved = resolveProxyContact(onBox, [onBox, onTorso], rig, { body: rig });
  assert.notEqual(resolved, onTorso);
});

test('another proxy in the ray is never mistaken for a body', () => {
  const { rig, torso, proxy } = figure();
  const other = markAimProxy(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  rig.add(other);
  rig.updateMatrixWorld(true);
  const onBox = hit(proxy, new THREE.Vector3(0.55, 1.3, 0));
  const onOther = hit(other, new THREE.Vector3(0.4, 1.3, 0));
  const onTorso = hit(torso, new THREE.Vector3(0.3, 1.3, 0));
  const resolved = resolveProxyContact(onBox, [onBox, onOther, onTorso], null, { body: rig });
  assert.equal(resolved, onTorso);
});

test('a body the proxy is a CHILD of is found without being named', () => {
  /* The heist parents its proxies to the figure root, so the parent test is
   * enough there. Silent Squatch parents Triple X's beside the rig, which is
   * why `body` is an option and not an assumption. */
  const { torso, proxy } = figure();
  const onBox = hit(proxy, new THREE.Vector3(0.55, 1.3, 0));
  const onTorso = hit(torso, new THREE.Vector3(0.3, 1.3, 0));
  const resolved = resolveProxyContact(onBox, [onBox, onTorso]);
  assert.equal(resolved, onTorso);
});

test('the man moving takes his hit box with him', () => {
  /* The Triple X bug in one assertion. The rig swings; because the proxy is a
   * child of it, the clamp still puts the contact on the body wherever the
   * body has got to. Parented to the room instead, the clamped point would
   * stay where the room is. */
  const { rig, proxy } = figure();
  rig.position.set(4, 0, -3);
  rig.rotation.y = 0.6;
  rig.updateMatrixWorld(true);
  const boxAt = proxy.getWorldPosition(new THREE.Vector3());
  const grazing = hit(proxy, boxAt.clone().add(new THREE.Vector3(0.5, 0, 0)));
  const resolved = resolveProxyContact(grazing, [grazing], null, { body: rig });
  const bodyAt = new THREE.Box3().setFromObject(rig);
  assert.ok(bodyAt.containsPoint(resolved.point), 'the contact is not on the man');
});

test('an unhelpful call is returned unchanged rather than throwing', () => {
  const stray = hit(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), new THREE.Vector3(1, 1, 1));
  assert.equal(resolveProxyContact(stray, []), stray);
  assert.equal(resolveProxyContact(stray, [], null, { body: null }), stray);
});

/* ---------------- normals ---------------- */

test('a face normal comes back in world space, not the limb\'s own', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.rotation.z = Math.PI / 2; // on its side
  mesh.updateMatrixWorld(true);
  const normal = contactNormal({
    object: mesh,
    point: new THREE.Vector3(0, 0.5, 0),
    face: { normal: new THREE.Vector3(1, 0, 0) },
  });
  /* Local +X, rotated a quarter turn about Z, is world +Y. Unrotated it would
   * still read +X and the decal would sit sideways on him -- which upside
   * down is every limb. */
  assert.ok(Math.abs(normal.y - 1) < 1e-6, `normal came back as ${normal.toArray()}`);
});

test('with no face at all, the round came from somewhere and that is the answer', () => {
  const normal = contactNormal(
    { point: new THREE.Vector3(0, 0, 0), face: null },
    new THREE.Vector3(0, 0, 5),
  );
  assert.ok(Math.abs(normal.z - 1) < 1e-6);
});

test('no face and no shooter is honestly nothing', () => {
  assert.equal(contactNormal({ point: new THREE.Vector3(), face: null }), null);
  assert.equal(contactNormal(null), null);
});

/* ---------------- visibility ---------------- */

test('visibility is inherited, so the test walks up', () => {
  const parent = new THREE.Group();
  const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  parent.add(child);
  parent.visible = false;
  assert.equal(child.visible, true, 'three keeps the child flag set');
  assert.equal(hiddenOrIgnored(child), true, 'a limb inside a hidden rig stopped a round');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildMotel } from '../src/motel/level.js';

function installCanvasDocument() {
  const previous = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 0,
            font: '',
            textAlign: '',
            textBaseline: '',
            fillRect() {},
            strokeRect() {},
            fillText() {},
          };
        },
      };
    },
  };
  return () => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  };
}

function buildLevel() {
  const restoreDocument = installCanvasDocument();
  try {
    return buildMotel(new THREE.Scene());
  } finally {
    restoreDocument();
  }
}

test('the clerk office entrance looks open whenever its doorway has no blocker', () => {
  const { refs } = buildLevel();
  const door = refs.officeDoor;

  assert.equal(door.open, true, 'the office is intentionally available from the lot');
  assert.equal(door.collider.enabled, false, 'an open doorway must not block the player');
  assert.ok(Math.abs(door.pivot.rotation.y) > 1.5,
    'the open doorway still presents a closed-looking door leaf');
  assert.equal(door.angle, door.pivot.rotation.y,
    'the animated door state disagrees with its visible hinge');
  assert.equal(door.targetAngle, door.pivot.rotation.y,
    'the next update would pull the visible door back across the opening');
});

test('the rear windows of rooms eleven and twelve reveal the rooms behind them', () => {
  const { refs } = buildLevel();
  const rearWindows = [
    ['room eleven', refs.window11.mesh],
    ['room twelve bathroom', refs.bathWindow.mesh],
  ];

  for (const [name, pane] of rearWindows) {
    assert.equal(pane.material.transparent, true, `${name} rear pane is opaque`);
    assert.ok(pane.material.opacity > 0 && pane.material.opacity < 0.7,
      `${name} rear pane does not read as glass`);
    assert.equal(pane.material.depthWrite, false,
      `${name} rear pane hides the room while writing its transparent depth`);
  }
});

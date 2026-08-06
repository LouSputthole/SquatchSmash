import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCecilioFace, hush, makeFigure, speak, updateFigure,
} from '../src/beefrun/npc.js';

function cecilioTestFigure() {
  const figure = makeFigure({
    name: 'cecilio-test',
    skin: 0xb07a4e,
    hair: 0x211814,
    build: 0.82,
  });
  figure.t = 0;
  return buildCecilioFace(figure);
}

test('Don Cecilio has a complete authored face without borrowing a photo identity', () => {
  const cecilio = cecilioTestFigure();
  const names = new Set();
  cecilio.group.traverse((node) => { if (node.name) names.add(node.name); });

  for (const part of [
    'cecilio-face',
    'cecilio-face-brow-right', 'cecilio-face-brow-left',
    'cecilio-face-eye-right', 'cecilio-face-eye-left',
    'cecilio-face-iris-right', 'cecilio-face-iris-left',
    'cecilio-nose-bridge', 'cecilio-nose',
    'cecilio-moustache',
    'cecilio-face-mouth', 'cecilio-face-jaw', 'cecilio-face-chin',
  ]) {
    assert.equal(names.has(part), true, `${part} is missing`);
  }
  assert.equal(cecilio.faceRig.eyes.length, 2);
  assert.equal(cecilio.faceRig.lids.length, 2);
  assert.equal(cecilio.faceRig.brows.length, 2);
});

test('Cecilio opens his mouth and jaw for his own voice turn, then settles', () => {
  const cecilio = cecilioTestFigure();
  const { mouth, jaw } = cecilio.faceRig;

  /* A TIMER ALONE NO LONGER OPENS HIS MOUTH. `talk` is the head bob; the mouth
   * is driven by the voice through the shared driver (src/core/mouth.js), and
   * `speak()` is what starts both. If this ever starts passing, somebody has
   * reconnected a jaw to a clock. */
  cecilio.talk = 1;
  for (let i = 0; i < 6; i += 1) updateFigure(cecilio, 0.05);
  assert.ok(
    Math.abs(mouth.scale.y - cecilio.faceRig.mouthRest) < 0.001,
    'a bare talk timer must not drive the mouth',
  );

  /* Said properly. Several frames and the peak, because the envelope has
   * syllables in it -- a mouth open on every frame is a hinge, not speech. */
  speak(cecilio, 1);
  let peak = 0;
  let jawLow = jaw.userData.baseY;
  for (let i = 0; i < 12; i += 1) {
    updateFigure(cecilio, 0.05);
    peak = Math.max(peak, mouth.scale.y);
    jawLow = Math.min(jawLow, jaw.position.y);
  }
  assert.ok(peak > cecilio.faceRig.mouthRest, 'speech did not open Cecilio’s mouth');
  assert.ok(jawLow < jaw.userData.baseY, 'speech did not lower Cecilio’s jaw');

  hush(cecilio);
  for (let i = 0; i < 20; i += 1) updateFigure(cecilio, 0.05);
  assert.ok(Math.abs(mouth.scale.y - cecilio.faceRig.mouthRest) < 0.001);
  assert.ok(Math.abs(jaw.position.y - jaw.userData.baseY) < 0.001);
});

test('Cecilio blinks at idle while ordinary Beef Run figures remain untouched', () => {
  const cecilio = cecilioTestFigure();
  const ordinary = makeFigure({ name: 'guard-test' });
  const lid = cecilio.faceRig.lids[0];

  cecilio.faceRig.nextBlink = 0.01;
  updateFigure(cecilio, 0.05);
  assert.ok(lid.scale.y > cecilio.faceRig.lidRest, 'idle blink did not close the eyelid');

  for (let i = 0; i < 24; i += 1) updateFigure(cecilio, 0.05);
  assert.ok(Math.abs(lid.scale.y - cecilio.faceRig.lidRest) < 0.001, 'eyelid did not reopen');
  assert.equal(ordinary.faceRig, null);
  assert.equal(ordinary.group.getObjectByName('cecilio-face'), undefined);
});

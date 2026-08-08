import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { Actor, CAST, buildWeaponMesh } from '../src/motel/actors.js';

test('the normal Motel start cannot escape to the apartment', () => {
  const html = fs.readFileSync(new URL('../motel.html', import.meta.url), 'utf8');
  const start = html.match(/<div id="menu"[\s\S]*?(?=<div id="pause")/)?.[0] ?? '';
  const bootFailure = html.match(/<div id="bootFailure"[\s\S]*?(?=<script src="\.\/src\/core\/boot-guard)/)?.[0] ?? '';

  assert.match(start, /id="startBtn"[^>]*>START THE DEAL/);
  assert.doesNotMatch(start, /href="\.\/index\.html"/,
    'normal flow exposes an apartment escape before the mission starts');
  assert.match(html, /id="continueBtn"[^>]*>RETURN TO APARTMENT/,
    'mission completion lost its campaign return');
  assert.match(bootFailure, /href="\.\/index\.html"[^>]*>APARTMENT/,
    'boot failure lost its recovery route');
});

test('Rico has a stable face identity and an animated speaking mouth', () => {
  const scene = new THREE.Scene();
  const rico = new Actor(scene, { ...CAST.rico(), x: 0, z: 0, state: 'deal' });
  assert.equal(rico.identity, 'rico');
  assert.equal(rico.rig.faceMesh?.name, 'actor.face.rico');
  assert.equal(rico.rig.mouth?.name, 'actor.mouth');

  const ctx = { player: { x: 0, z: 4 }, floorAt: () => 0, blocked: () => false };

  /* A TIMER ALONE NO LONGER OPENS HIS MOUTH, and that is the point of the
   * shared mouth system: `talkT` is the head/hand beat, and the mouth is a
   * separate thing driven by the voice (src/core/mouth.js). Setting the timer
   * by hand used to flap the jaw; if this ever starts passing, the mouth has
   * been reconnected to a clock. */
  rico.talkT = 1;
  for (let i = 0; i < 8; i += 1) rico.update(0.05, ctx);
  assert.equal(rico.rig.mouth.scale.y, 1, 'a bare talk timer must not drive the mouth');

  /* Said properly, through the API a scene uses. Several frames, because the
   * envelope has syllables in it -- a mouth that is open on every single frame
   * is a hinge, not speech -- so the assertion is on the peak. */
  rico.say(1.2);
  let peak = 0;
  for (let i = 0; i < 12; i += 1) {
    rico.update(0.05, ctx);
    peak = Math.max(peak, rico.rig.mouth.scale.y);
  }
  assert.ok(peak > 1, 'mouth opens while Rico owns a voice turn');

  // And it shuts again when the line is over, without anybody asking it to.
  for (let i = 0; i < 30; i += 1) rico.update(0.05, ctx);
  assert.ok(Math.abs(rico.rig.mouth.scale.y - 1) < 0.001, 'mouth did not settle');
});

test('the first-person revolver reads as a complete gun, not two boxes', () => {
  const revolver = buildWeaponMesh('revolver');
  const parts = new Set();
  revolver.traverse((node) => {
    if (node.name) parts.add(node.name);
  });
  for (const part of ['revolver.barrel', 'revolver.cylinder', 'revolver.grip', 'revolver.muzzle']) {
    assert.equal(parts.has(part), true, `${part} is visible in the held model`);
  }
});

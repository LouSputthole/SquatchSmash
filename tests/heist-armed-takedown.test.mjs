import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { makeBankGuardFigure, makePoliceFigure } from '../src/heist/people.js';

const MAIN_SOURCE = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');
const FALLEN_X = Math.PI / 2 - 0.12;

function floorY(figure) {
  figure.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(figure.root).min.y;
}

test('an aiming officer falls through a grounded intermediate pose and keeps the authored roll', () => {
  const figure = makePoliceFigure({ name: 'armed-police-probe', x: 0, z: 0, yaw: 0, index: 0 });
  assert.equal(figure.pose, 'aiming');
  const aimingArm = figure.parts.armR.rotation.x;

  figure.setState('down', { roll: 0.6 });
  assert.equal(figure.pose, 'fallen');
  assert.ok(Math.abs(figure.tilt.rotation.x) < 1e-9,
    'the officer snapped to the final floor rotation on the fatal frame');
  assert.ok(Math.abs(figure.parts.armR.rotation.x - aimingArm) < 1e-9,
    'the aiming silhouette disappeared before the transition began');

  figure.update(0.16, { fear: 0 });
  assert.ok(figure.tilt.rotation.x > 0.1 && figure.tilt.rotation.x < FALLEN_X - 0.1,
    `the halfway frame was not intermediate (${figure.tilt.rotation.x})`);
  assert.ok(Math.abs(floorY(figure)) <= 0.012,
    `the halfway frame lost floor contact (${floorY(figure)})`);

  figure.update(0.16, { fear: 0 });
  assert.ok(Math.abs(figure.tilt.rotation.x - FALLEN_X) < 1e-9);
  assert.ok(Math.abs(figure.tilt.rotation.z - 0.6) < 1e-9,
    `the authored right-side fall ended at ${figure.tilt.rotation.z}`);
  assert.ok(Math.abs(floorY(figure)) <= 0.012,
    `the completed officer fall lost floor contact (${floorY(figure)})`);
});

test('a drawing bank guard blends down while an explicit checkpoint restore may still snap', () => {
  const guard = makeBankGuardFigure({ name: 'drawing-guard-probe', x: 0, z: 0, yaw: 0 });
  guard.root.userData.setThreatProgress(0.8);
  const drawingArm = guard.parts.armR.rotation.x;
  guard.root.userData.setNeutralized();

  assert.equal(guard.pose, 'fallen');
  assert.ok(Math.abs(guard.tilt.rotation.x) < 1e-9,
    'the drawing guard hard-snapped to the floor');
  assert.ok(Math.abs(guard.parts.armR.rotation.x - drawingArm) < 1e-9,
    'the draw pose was not used as the transition start');
  guard.update(0.16, { fear: 0 });
  assert.ok(guard.tilt.rotation.x > 0.1 && guard.tilt.rotation.x < FALLEN_X - 0.1,
    'the drawing-to-down transition has no readable middle frame');
  assert.ok(Math.abs(floorY(guard)) <= 0.012,
    `the guard transition lost floor contact (${floorY(guard)})`);
  guard.update(0.16, { fear: 0 });
  assert.ok(Math.abs(guard.tilt.rotation.z + 0.42) < 1e-9,
    `the bank guard lost his authored fall direction (${guard.tilt.rotation.z})`);

  const restored = makeBankGuardFigure({ name: 'restored-guard-probe', x: 0, z: 0, yaw: 0 });
  restored.root.userData.setThreatProgress(1);
  restored.root.userData.setNeutralized({ blend: false });
  assert.ok(Math.abs(restored.tilt.rotation.x - FALLEN_X) < 1e-9,
    'an explicit checkpoint restore animated instead of snapping to its saved pose');
  assert.ok(Math.abs(restored.tilt.rotation.z + 0.42) < 1e-9);
});

test('the live police fatality and recycle paths use the shared animated poses', () => {
  const fatalBranch = MAIN_SOURCE.slice(
    MAIN_SOURCE.indexOf("if (actor.faction === FACTIONS.POLICE && result.fatal)"),
    MAIN_SOURCE.indexOf('function updatePoliceCombat'),
  );
  assert.match(fatalBranch, /entry\.figure\.setState\('down', \{ roll:/,
    'the live police fatality bypasses the shared down transition');
  assert.doesNotMatch(fatalBranch, /entry\.figure\.fallen\(/,
    'the live police fatality still hard-snaps to fallen');

  const recycleBranch = MAIN_SOURCE.slice(
    MAIN_SOURCE.indexOf('if (spare) {'),
    MAIN_SOURCE.indexOf('const index = policeFigures.length'),
  );
  assert.match(recycleBranch, /spare\.figure\.aiming\??\.\(\)/,
    'a recycled officer is not returned to the armed aiming pose');
  assert.doesNotMatch(recycleBranch, /spare\.figure\.braced/,
    'the recycle path still calls the nonexistent braced pose');

  const recycled = makePoliceFigure({ name: 'recycled-police-probe', x: 0, z: 0, yaw: 0, index: 1 });
  recycled.setState('down', { blend: false, roll: -0.6 });
  assert.equal(recycled.pose, 'fallen');
  recycled.aiming();
  assert.equal(recycled.pose, 'aiming');
  assert.ok(Math.abs(recycled.tilt.rotation.x) < 1e-9
    && Math.abs(recycled.tilt.rotation.z) < 1e-9
    && Math.abs(recycled.tilt.position.y) < 1e-9,
    'the recycled officer kept the fallen root transform after returning to full health');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  HEIST_CREW_PRESENTATION,
  crewHeadingForPhase,
} from '../src/heist/cast.js';
import { makeBalaclava } from '../src/heist/weapons.js';

test('safehouse crew face the briefing instead of presenting their backs to the player', () => {
  const table = { x: 0, z: 0.2 };
  for (const position of [
    { x: -3.4, z: -1.2 },
    { x: -1.7, z: -2.4 },
    { x: 0, z: -2.6 },
    { x: 1.8, z: -2.3 },
    { x: 3.5, z: -1.1 },
  ]) {
    const heading = crewHeadingForPhase('safehouse', position);
    const facing = { x: Math.sin(heading), z: Math.cos(heading) };
    const toward = { x: table.x - position.x, z: table.z - position.z };
    const length = Math.hypot(toward.x, toward.z);
    const dot = facing.x * toward.x / length + facing.z * toward.z / length;
    assert.ok(dot > 0.99, `safehouse facing dot was ${dot}`);
  }
});

test('Numbskull has an explicit named procedural face treatment', () => {
  assert.deepEqual(HEIST_CREW_PRESENTATION[CHARACTER_IDS.NUMBSKULL].proceduralFace, {
    treatment: 'round_glasses',
    brows: true,
    nose: true,
  });
});

/* The shell the worn balaclava's face is built on: a 0.118 sphere stretched
 * 1.13 tall and 1.05 deep. Anything at or inside this surface is not drawn. */
const SHELL = { x: 0.118, y: 0.118 * 1.13, z: 0.118 * 1.05 };
const insideShell = (p) => (p.x / SHELL.x) ** 2 + (p.y / SHELL.y) ** 2 + (p.z / SHELL.z) ** 2 < 1;

test('every feature of the worn balaclava is on the outside of it', () => {
  /* Owner: "balaclava model is bad", twice. The second answer added fourteen
   * meshes to a plain dark egg -- two eye ports, a bridge, two lids, a vent, a
   * brow seam and two eyes -- and then placed all of them with flat z values
   * around 0.10, when the shell's own surface at the middle of the face is at
   * 0.1239. The eyes and the bridge were entirely INSIDE the sphere and the
   * ports had six of twenty-four corners out, so the mask still rendered as a
   * featureless egg with two dark nubs on it. The complaint came back because
   * the fix was invisible.
   *
   * Every marking is a patch of the mask's own ellipsoid now. This walks the
   * real vertices, because that is the only thing that would have caught it. */
  const mask = makeBalaclava({ rolled: false });
  mask.updateWorldMatrix(true, true);
  const buried = [];
  for (const name of ['balaclava-brow-hem', 'balaclava-eye-port-left',
    'balaclava-eye-port-right', 'balaclava-bridge', 'balaclava-cheek-hem',
    'balaclava-mouth-vent', 'balaclava-seam-left', 'balaclava-seam-right']) {
    const part = mask.getObjectByName(name);
    assert.ok(part, `${name} is missing from the mask`);
    const position = part.geometry.attributes.position;
    const vertex = new THREE.Vector3();
    let out = 0;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld);
      if (!insideShell(vertex)) out++;
    }
    if (out < position.count) buried.push(`${name} (${position.count - out}/${position.count} in)`);
  }
  assert.deepEqual(buried, [], `features sunk inside the shell: ${buried.join(', ')}`);
});

test('the balaclava has eyes looking out of its holes, and the holes stay on the face', () => {
  const mask = makeBalaclava({ rolled: false });
  mask.updateWorldMatrix(true, true);
  /* Where the eye-port patch's surface is directly in front of a point. The
   * patch curves, so its bounding box maximum is at the bridge end of it and
   * not over the eye — comparing boxes measures the wrong millimetres. */
  const portFront = (x, y, lift = 0.0026) => {
    const r = { x: SHELL.x + lift, y: (0.118 + lift) * 1.13, z: (0.118 + lift) * 1.05 };
    return r.z * Math.sqrt(Math.max(0, 1 - (x / r.x) ** 2 - (y / r.y) ** 2));
  };
  for (const side of ['left', 'right']) {
    const port = new THREE.Box3().setFromObject(mask.getObjectByName(`balaclava-eye-port-${side}`));
    const eyeMesh = mask.getObjectByName(`balaclava-eye-${side}`);
    const eye = new THREE.Box3().setFromObject(eyeMesh);
    // The eye stands proud of the shadow it sits in — a few millimetres, so it
    // catches the light without becoming a golf ball on a face.
    const proud = eye.max.z - portFront(eyeMesh.position.x, eyeMesh.position.y);
    assert.ok(proud > 0.0005 && proud < 0.006, `${side} eye stands ${(proud * 1000).toFixed(1)} mm out`);
    assert.ok(eye.min.x > port.min.x && eye.max.x < port.max.x, `${side} eye is outside its hole`);
    /* The mask is worn at 0.92 on a head whose skull is 0.081 half-wide. An
     * opening wider than that runs off the side of the head and shows the
     * room through the man. */
    assert.ok(Math.max(-port.min.x, port.max.x) * 0.92 < 0.079,
      `${side} eye port reaches past the edge of the skull`);
  }
});

test('the rolled balaclava shows the fold that says it is a mask', () => {
  /* The same fault as the worn one: the port was at z 0.088 inside a roll
   * whose front surface is at 0.111, so the one detail separating this from a
   * beanie was not drawn. */
  const mask = makeBalaclava({ rolled: true });
  mask.updateWorldMatrix(true, true);
  const port = new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-rolled-port'));
  assert.ok(port.max.z > 0.111, `rolled eye port ends at z ${port.max.z.toFixed(3)}, inside the roll`);
});

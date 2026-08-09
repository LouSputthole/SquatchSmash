import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  HEIST_CREW_PRESENTATION,
  crewHeadingForPhase,
} from '../src/heist/cast.js';
import { HeistFigure } from '../src/heist/people.js';
import { makeBalaclava } from '../src/heist/weapons.js';

test('a pleading hostage bends both elbows and keeps their hands near their head', () => {
  const figure = new HeistFigure({ name: 'pleading-silhouette' });
  figure.setState('pleading', { blend: false });
  figure.root.updateMatrixWorld(true);
  const head = figure.parts.head.getWorldPosition(new THREE.Vector3());
  const hands = [];

  for (const side of ['L', 'R']) {
    const arm = figure.parts[`arm${side}`];
    const forearm = figure.parts[`fore${side}`];
    const hand = forearm.children.find((child) => child.name === 'hand');
    assert.ok(hand, `${side} pleading hand is missing from the public rig`);
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const elbow = forearm.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const upper = elbow.clone().sub(shoulder).normalize();
    const lower = wrist.clone().sub(elbow).normalize();
    const elbowTurn = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(upper.dot(lower), -1, 1)));
    const handToHead = wrist.distanceTo(head);
    assert.ok(elbowTurn >= 75 && elbowTurn <= 120,
      `${side} elbow turns only ${elbowTurn.toFixed(1)} degrees`);
    assert.ok(handToHead >= 0.25 && handToHead <= 0.48,
      `${side} hand is ${handToHead.toFixed(3)} m from the head`);
    hands.push(wrist);
  }
  const heightDifference = Math.abs(hands[0].y - hands[1].y);
  assert.ok(heightDifference >= 0.02 && heightDifference <= 0.08,
    `the mirrored hands differ in height by only ${(heightDifference * 100).toFixed(1)} cm`);
});

test('repeating a hostage state preserves the live pose transition', () => {
  const figure = new HeistFigure({ name: 'transition-probe' });
  figure.phase = 0;
  figure.setState('prone');
  figure.update(0.2, { fear: 0 });

  const before = {
    rotation: figure.tilt.rotation.x,
    height: figure.tilt.position.y,
  };
  figure.setState('prone');

  assert.ok(Math.abs(figure.tilt.rotation.x - before.rotation) < 1e-9,
    'a duplicate state snapped the figure rotation to the final pose');
  assert.ok(Math.abs(figure.tilt.position.y - before.height) < 1e-9,
    'a duplicate state snapped the figure height to the final pose');

  figure.update(0.1, { fear: 0 });
  assert.ok(figure.tilt.rotation.x > before.rotation,
    'the original transition stopped after the duplicate state sync');

  figure.setState('prone', { blend: false });
  assert.ok(Math.abs(figure.tilt.rotation.x - Math.PI / 2) < 1e-9,
    'an explicit checkpoint restore must still snap to the authored pose');
});

test('hostage takedown transitions keep the body on the bank floor', () => {
  const floorY = (figure) => {
    figure.root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(figure.root).min.y;
  };

  for (const state of ['kneeling', 'prone', 'restrained', 'down']) {
    const figure = new HeistFigure({ name: `floor-${state}` });
    figure.phase = 0;
    figure.setState(state);
    const contact = [];
    for (let frame = 0; frame < 60; frame++) {
      figure.update(1 / 60, { fear: 0 });
      contact.push(floorY(figure));
    }
    const lowest = Math.min(...contact);
    const highest = Math.max(...contact);
    assert.ok(lowest >= -0.012,
      `${state} passed ${(Math.abs(lowest) * 100).toFixed(1)} cm through the floor`);
    assert.ok(highest <= 0.012,
      `${state} floated ${(highest * 100).toFixed(1)} cm above the floor`);
    assert.ok(Math.abs(contact.at(-1)) <= 0.008,
      `${state} did not finish grounded (${contact.at(-1).toFixed(3)} m)`);
  }
});

test('fear reads as controlled acting instead of high-frequency vibration', () => {
  const sampleFear = (state) => {
    const figure = new HeistFigure({ name: `fear-${state}` });
    figure.phase = 0;
    figure.setState(state, { blend: false });
    figure.tremble = 1;
    const angles = [];
    for (let frame = 0; frame < 120; frame++) {
      figure.update(1 / 120, { fear: 1 });
      angles.push(figure.parts.body.rotation.z);
    }
    let crossings = 0;
    for (let frame = 1; frame < angles.length; frame++) {
      if ((angles[frame - 1] < 0 && angles[frame] >= 0)
        || (angles[frame - 1] > 0 && angles[frame] <= 0)) crossings++;
    }
    return { crossings, amplitude: Math.max(...angles.map(Math.abs)) };
  };

  const standing = sampleFear('stand');
  const prone = sampleFear('prone');
  const restrained = sampleFear('restrained');
  const down = sampleFear('down');
  for (const [state, motion] of Object.entries({ standing, prone, restrained })) {
    assert.ok(motion.crossings >= 2 && motion.crossings <= 4,
      `${state} fear reversed direction ${motion.crossings} times in one second`);
  }
  assert.ok(standing.amplitude > 0.008 && standing.amplitude <= 0.02,
    `standing fear amplitude was ${standing.amplitude.toFixed(4)} rad`);
  assert.ok(prone.amplitude < standing.amplitude * 0.35,
    'a prone hostage shakes almost as hard as a standing hostage');
  assert.ok(restrained.amplitude < prone.amplitude * 0.5,
    'a restrained hostage still visibly fights the floor pose');
  assert.equal(down.amplitude, 0, 'a fallen body continued the fear animation');
});

test('a bolting hostage has a grounded run cycle instead of a frozen crouch', () => {
  const figure = new HeistFigure({ name: 'bolting-probe' });
  figure.phase = 0;
  figure.setState('bolting', { blend: false });
  const frames = [];
  const floor = [];
  for (let frame = 0; frame < 60; frame++) {
    figure.update(1 / 60, { fear: 0.8 });
    frames.push([
      figure.parts.armL.rotation.x,
      figure.parts.armR.rotation.x,
      figure.parts.legL.rotation.x,
      figure.parts.legR.rotation.x,
    ]);
    figure.root.updateMatrixWorld(true);
    floor.push(new THREE.Box3().setFromObject(figure.root).min.y);
  }
  const uniqueFrames = new Set(frames.map((pose) => pose.map((value) => value.toFixed(4)).join(',')));
  const travel = (index) => {
    const values = frames.map((pose) => pose[index]);
    return Math.max(...values) - Math.min(...values);
  };

  assert.ok(uniqueFrames.size >= 30,
    `bolting produced only ${uniqueFrames.size} distinct limb frames`);
  assert.ok(travel(0) > 0.8 && travel(1) > 0.8,
    'the arms do not counter-swing through a readable stride');
  assert.ok(travel(2) > 0.7 && travel(3) > 0.7,
    'the legs do not alternate through a readable stride');
  assert.ok(Math.min(...floor) >= -0.012 && Math.max(...floor) <= 0.012,
    'the run cycle leaves the floor or cuts through it');
});

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

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  HEIST_CREW_PRESENTATION,
  buildHeistCrew,
  crewHeadingForPhase,
  setCrewMasked,
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

/**
 * THE HOOD IS CUT FOR THE HEAD IT GOES ON.
 *
 * Owner, third time: *"The masks still look like shit over the square block
 * heads"*. The mask was an ellipsoid and `makePerson`'s skull is a slab, so
 * the box's eight corners came out through the sphere — 43% beyond its
 * surface, measured. Every previous pass added detail to the egg, which could
 * not help, because a detail on the wrong shape is a detail on the wrong
 * shape.
 *
 * These two tests pin the two halves of the answer: the wool is a slab a
 * centimetre bigger than the widest skull the builder makes, and every
 * marking is on its FLAT FRONT rather than sunk inside it.
 */

/** The widest skull `makePerson` builds, in its own head-local metres. */
const SKULL = { x: 0.186 / 2, y: 0.216 / 2, z: 0.20 / 2 };

function maskHull(mask) {
  const hull = new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-shell'));
  hull.union(new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-crown')));
  return hull;
}

test('the worn balaclava covers the whole slab skull it is worn over', () => {
  const mask = makeBalaclava({ rolled: false });
  mask.updateWorldMatrix(true, true);
  const hull = maskHull(mask);
  // Every corner of the skull, and every corner is where the old egg failed.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = new THREE.Vector3(sx * SKULL.x, sy * SKULL.y, sz * SKULL.z);
        assert.ok(hull.containsPoint(corner),
          `skull corner ${corner.toArray().join(',')} is outside the wool`);
      }
    }
  }
  // And it is wool, not a helmet: a centimetre of it, not five.
  assert.ok(hull.max.x - SKULL.x < 0.02 && hull.max.z - SKULL.z < 0.02,
    'the mask is thicker than a knit hood');
  assert.ok(mask.getObjectByName('balaclava-skirt'), 'the neck skirt is missing');
});

test('every marking on the worn balaclava is on the outside of it', () => {
  /* The old fault this replaces: fourteen meshes placed with flat z values
   * around 0.10 on a shell whose own front surface was at 0.1239, so the eyes
   * and the bridge were entirely INSIDE the mask and it still rendered as a
   * featureless egg. The front is a plane now, which is the whole reason a
   * flat feature can sit on it — but that only helps if somebody checks, so
   * this walks the real vertices the way the old one did. */
  const mask = makeBalaclava({ rolled: false });
  mask.updateWorldMatrix(true, true);
  const front = maskHull(mask).max.z;
  const buried = [];
  for (const name of ['balaclava-brow-hem', 'balaclava-eye-port-left',
    'balaclava-eye-port-right', 'balaclava-bridge', 'balaclava-cheek-hem',
    'balaclava-mouth-vent', 'balaclava-nose',
    'balaclava-eye-left', 'balaclava-eye-right']) {
    const part = mask.getObjectByName(name);
    assert.ok(part, `${name} is missing from the mask`);
    const box = new THREE.Box3().setFromObject(part);
    if (box.max.z <= front) buried.push(`${name} ends at z ${box.max.z.toFixed(4)}`);
  }
  assert.deepEqual(buried, [],
    `markings sunk inside the wool (front is z ${front.toFixed(4)}): ${buried.join(', ')}`);

  // The seams are on the SIDES, so they are measured against the side.
  const side = maskHull(mask).max.x;
  for (const name of ['balaclava-seam-left', 'balaclava-seam-right']) {
    const box = new THREE.Box3().setFromObject(mask.getObjectByName(name));
    assert.ok(Math.max(-box.min.x, box.max.x) > side,
      `${name} is inside the wool`);
  }
});

test('the balaclava has eyes looking out of its holes, and the holes stay on the face', () => {
  const mask = makeBalaclava({ rolled: false });
  mask.updateWorldMatrix(true, true);
  for (const label of ['left', 'right']) {
    const port = new THREE.Box3().setFromObject(mask.getObjectByName(`balaclava-eye-port-${label}`));
    const eye = new THREE.Box3().setFromObject(mask.getObjectByName(`balaclava-eye-${label}`));
    // Proud of the shadow it sits in, without becoming a golf ball on a face.
    const proud = eye.max.z - port.max.z;
    assert.ok(proud > 0.0005 && proud < 0.006,
      `${label} eye stands ${(proud * 1000).toFixed(1)} mm out of its hole`);
    assert.ok(eye.min.x > port.min.x - 1e-6 && eye.max.x < port.max.x + 1e-6,
      `${label} eye is wider than its hole`);
    /* An opening wider than the skull runs off the side of the head and shows
     * the room through the man. */
    assert.ok(Math.max(-port.min.x, port.max.x) < SKULL.x,
      `${label} eye port reaches past the edge of the skull`);
  }
});

test('the rolled balaclava shows the fold that says it is a mask, and fits the head', () => {
  /* The rolled one had the same disease from the other direction: a torus of
   * radius 0.075 perched on a skull 0.093 half-wide, so the head came out
   * through the sides of the hat. It is a band round the same slab now. */
  const mask = makeBalaclava({ rolled: true });
  mask.updateWorldMatrix(true, true);
  const roll = new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-roll'));
  assert.ok(roll.max.x > SKULL.x && roll.max.z > SKULL.z,
    'the rolled cap is narrower than the head it sits on');
  const port = new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-rolled-port'));
  assert.ok(port.max.z > roll.max.z,
    `rolled eye port ends at z ${port.max.z.toFixed(3)}, inside the roll`);
});

test('a masked crew member has nothing of his own head sticking out of the wool', () => {
  /* The other half of *"masks still look like shit over the square block
   * heads"*: a hood COVERS a head, and this one did not. Hair, ears, brows,
   * a nose and a photographed face all carried on underneath it — the ears
   * alone stand 0.111 out from centre against wool at 0.101, so two
   * skin-coloured tabs poked out of the side of every mask in the van.
   *
   * Vertex-exact, in world space, on the real crew: anything on the head that
   * is not the mask and not the throat has to be inside the wool or invisible.
   * And it has to come BACK when the mask goes up, or the safehouse is five
   * bald men with no faces. */
  const crew = buildHeistCrew(new THREE.Group());
  setCrewMasked(crew, true);
  const vertex = new THREE.Vector3();
  for (const actor of crew.values()) {
    actor.group.updateMatrixWorld(true);
    const head = actor.figure.parts.head;
    const mask = head.getObjectByName('heist-mask');
    assert.ok(mask?.visible, `${actor.id} has no mask on`);
    const hull = new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-shell'));
    hull.union(new THREE.Box3().setFromObject(mask.getObjectByName('balaclava-crown')));
    const outside = [];
    head.traverse((object) => {
      if (!object.isMesh || !object.visible || object.name === 'person.neck') return;
      for (let node = object; node && node !== head; node = node.parent) {
        if (node === mask) return;
        if (!node.visible) return;
      }
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        if (!hull.containsPoint(vertex)) { outside.push(object.name); return; }
      }
    });
    assert.deepEqual(outside, [], `${actor.id} has ${outside.join(', ')} out through the mask`);
  }

  setCrewMasked(crew, false);
  for (const actor of crew.values()) {
    const head = actor.figure.parts.head;
    assert.equal(head.getObjectByName('heist-mask').visible, false);
    const hidden = [];
    for (const child of head.children) {
      if (child.name === 'heist-mask') continue;
      if (!child.visible) hidden.push(child.name || child.type);
    }
    assert.deepEqual(hidden, [], `${actor.id} took the mask off and left ${hidden.join(', ')} hidden`);
  }
});

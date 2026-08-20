/**
 * INITIATION NIGHT — the staging, held still.
 *
 * The owner's brief for this scene is a piece of blocking: every remaining
 * prospect is put on their knees and shot in the back of the head, ONE AT A
 * TIME, IN FRONT OF THE PLAYER. Almost everything that can go wrong with that
 * is invisible in a screenshot of a dark clearing and obvious in world-space
 * vectors, so this file checks it in world-space vectors:
 *
 *   - the executioner is BEHIND the man he is shooting, at arm's length;
 *   - he is FURTHER FROM THE PLAYER than his victim, so he can never be
 *     standing in front of the thing the player is meant to be watching;
 *   - nobody else is either;
 *   - the bodies fall across ground nobody has to stand on afterwards;
 *   - a kneeling figure's knees are ON the mud and its head is where the
 *     muzzle is put, on the real rig, after `Person.update()` has had a go
 *     at it;
 *   - and the player can walk from the line, up the trail, through the door,
 *     to the middle of the room, without meeting a collider.
 *
 * That last one is not decoration. A beat that can be entered and not left is
 * the exact bug that left a player standing in the siege armoury, armed, with
 * the objective frozen; the cabin version of it is a doorway with a collider
 * across it and a ceremony nobody can reach.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const site = await import('../src/initiation/cabin/site.js');
const staging = await import('../src/initiation/cabin/staging.js');
const ambience = await import('../src/initiation/cabin/ambience.js');
const { Person } = await import('../src/core/person.js');
const { STOOL_SIT } = await import('../src/bing/cast.js');
const { buildInitiationCabinSite } = await import('../src/initiation/cabin/index.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = fs.readFileSync(path.join(HERE, '..', 'src', 'initiation', 'main.js'), 'utf8');

const ZERO = new THREE.Vector3();
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Distance from `point` to the segment a→b, in the ground plane. */
function segmentDistance(a, b, point) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const lengthSquared = vx * vx + vz * vz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.z - a.z) * vz) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (a.x + vx * t), point.z - (a.z + vz * t));
}

/**
 * Does a standing figure at `stance` block the player's view of `target`?
 *
 * Only if it is close to the line of sight AND in front of the target. A man
 * standing directly behind the thing you are looking at is in the shot, not in
 * the way, and conflating the two is how a staging test starts failing for
 * correct blocking.
 */
function occludes(eye, target, stance, halfWidth = site.SHOULDER_HALF_WIDTH) {
  const lateral = site.lateralOffsetFromLine(eye, target, stance);
  if (lateral >= halfWidth) return false;
  return distance(eye, stance) < distance(eye, target) - 0.25;
}

/* ------------------------------------------------------------------ */
/* The line-up this scene inherits                                     */
/* ------------------------------------------------------------------ */

test('the site is measured against the line main.js actually stands', () => {
  const lineZ = Number(MAIN.match(/const LINE_Z = (-?[\d.]+);/)[1]);
  const slot = MAIN.match(/const PLAYER_SLOT = \{ x: (-?[\d.]+), z: LINE_Z \};/);
  const xs = MAIN.match(/const PROSPECT_XS = \[([^\]]+)\];/)[1]
    .split(',').map((value) => Number(value.trim()));

  assert.equal(site.LINE_Z, lineZ, 'the prospect line moved in main.js');
  assert.equal(site.PLAYER_SLOT.x, Number(slot[1]), 'the player slot moved in main.js');
  assert.deepEqual([...site.PROSPECT_XS], xs, 'the prospect line-up changed in main.js');
});

/* ------------------------------------------------------------------ */
/* Four executions                                                     */
/* ------------------------------------------------------------------ */

test('every kneel mark has its executioner behind it, at arm\'s length', () => {
  assert.equal(site.KNEEL_MARKS.length, 4, 'four people are executed kneeling');
  for (const mark of site.KNEEL_MARKS) {
    const facing = site.facingOf(mark.heading);
    const toShooter = { x: mark.shooter.x - mark.x, z: mark.shooter.z - mark.z };
    const reach = Math.hypot(toShooter.x, toShooter.z);
    const behind = (facing.x * toShooter.x + facing.z * toShooter.z) / reach;

    assert.ok(behind < -0.9, `${mark.id}: the shooter is not behind the head (${behind.toFixed(3)})`);
    assert.ok(reach > 0.85 && reach < 1.3, `${mark.id}: reach is ${reach.toFixed(2)} m`);

    /* And he is facing the man, not past him. */
    const aim = site.facingOf(mark.shooter.heading);
    const toMark = { x: mark.x - mark.shooter.x, z: mark.z - mark.shooter.z };
    const dot = (aim.x * toMark.x + aim.z * toMark.z) / Math.hypot(toMark.x, toMark.z);
    assert.ok(dot > 0.99, `${mark.id}: the shooter is not looking at the man`);
  }
});

test('the muzzle is at the back of the head, and the player can see the flash', () => {
  for (const mark of site.KNEEL_MARKS) {
    const facing = site.facingOf(mark.heading);
    const toMuzzle = { x: mark.muzzle.x - mark.x, z: mark.muzzle.z - mark.z };
    const gap = Math.hypot(toMuzzle.x, toMuzzle.z);
    const behind = (facing.x * toMuzzle.x + facing.z * toMuzzle.z) / gap;

    assert.ok(gap < 0.35, `${mark.id}: the muzzle is ${gap.toFixed(2)} m off the head`);
    assert.ok(behind < -0.4, `${mark.id}: the muzzle is not behind the head`);
    assert.ok(
      Math.abs(mark.muzzle.y - mark.head.y) < 0.1,
      `${mark.id}: the muzzle is not at head height`,
    );
    /* Off the sightline far enough that the head does not hide the flash. */
    const lateral = site.lateralOffsetFromLine(site.PLAYER_EYE, mark, mark.muzzle);
    assert.ok(lateral > 0.15, `${mark.id}: the flash is behind the skull (${lateral.toFixed(3)} m)`);
  }
});

test('nobody stands between the player and the man being shot', () => {
  for (const mark of site.KNEEL_MARKS) {
    const standing = [
      { id: 'shooter', at: mark.shooter },
      { id: 'escort', at: mark.escort },
      ...site.KNEEL_MARKS.filter((other) => other !== mark)
        .flatMap((other) => [
          { id: `${other.id}-shooter`, at: other.shooter },
          { id: `${other.id}-escort`, at: other.escort },
        ]),
    ];
    for (const figure of standing) {
      assert.ok(
        !occludes(site.PLAYER_EYE, mark, figure.at),
        `${figure.id} is standing in front of ${mark.id}`,
      );
    }
    /* The executioner is specifically FURTHER AWAY than his victim. */
    assert.ok(
      distance(site.PLAYER_EYE, mark.shooter) > distance(site.PLAYER_EYE, mark) + 0.3,
      `${mark.id}: the shooter is nearer the player than the man he is shooting`,
    );
  }
});

test('the marks walk toward the player, and Kittenboss is the last of them', () => {
  const distances = site.KNEEL_MARKS.map((mark) => distance(site.PLAYER_EYE, mark));
  for (let i = 1; i < distances.length; i++) {
    assert.ok(distances[i] < distances[i - 1], 'the executions must close on the player');
  }
  assert.equal(site.KNEEL_MARKS.at(-1).victim, 'KITTENBOSS');
  assert.ok(distances.at(-1) < 3.2, 'the last one is put down within reach of the line');
});

test('nothing is put down, stood on, or dropped where a body already is', () => {
  const clearance = 0.32 + 0.4; // body half-width + a kneeling figure's radius
  for (let i = 0; i < site.KNEEL_MARKS.length; i++) {
    const body = site.KNEEL_MARKS[i];
    for (let j = i + 1; j < site.KNEEL_MARKS.length; j++) {
      const later = site.KNEEL_MARKS[j];
      for (const [what, at] of [['mark', later], ['shooter', later.shooter], ['escort', later.escort]]) {
        const gap = segmentDistance(body, body.fall, at);
        assert.ok(gap > clearance, `${later.id} ${what} is on ${body.id}'s body (${gap.toFixed(2)} m)`);
      }
    }
    /* Prospect One is shot standing, and topples backward toward the line. */
    assert.ok(
      distance(site.STAND_MARK, body) > 3,
      `${body.id} is on top of where Prospect One goes down`,
    );
  }
});

test('every body falls forward, onto the mud, and not onto the player', () => {
  for (const mark of site.KNEEL_MARKS) {
    const facing = site.facingOf(mark.heading);
    const fall = { x: mark.fall.x - mark.x, z: mark.fall.z - mark.z };
    const along = (facing.x * fall.x + facing.z * fall.z) / Math.hypot(fall.x, fall.z);
    assert.ok(along > 0.99, `${mark.id} falls sideways or backward`);
    assert.equal(
      Math.round(Math.hypot(fall.x, fall.z) * 100) / 100,
      site.FALL_REACH,
      `${mark.id}'s body is not measured at its full length`,
    );
    assert.ok(
      distance(mark.fall, site.PLAYER_SLOT) > 0.6,
      `${mark.id}'s body lands on the player`,
    );
    for (const point of [mark, mark.fall, mark.shooter, mark.escort]) {
      assert.ok(
        point.x > site.MUD.minX && point.x < site.MUD.maxX
        && point.z > site.MUD.minZ && point.z < site.MUD.maxZ,
        `${mark.id} puts somebody off the mud at ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* The pose, on the rig that will actually wear it                     */
/* ------------------------------------------------------------------ */

function worldBox(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

test('a kneeling man is on the ground, not in it or over it', () => {
  for (const mark of site.KNEEL_MARKS) {
    const victim = new Person();
    staging.poseKneeling(victim, mark);
    const box = worldBox(victim.group);

    assert.ok(box.min.y > -0.06, `${mark.id}: the figure is sunk into the mud (${box.min.y.toFixed(3)})`);
    assert.ok(box.min.y < 0.04, `${mark.id}: the figure is hovering (${box.min.y.toFixed(3)})`);

    const head = new THREE.Vector3();
    victim.head.getWorldPosition(head);
    assert.ok(
      Math.abs(head.y - site.KNEEL_HEAD_Y) < 0.12,
      `${mark.id}: the head is at ${head.y.toFixed(2)}, not ${site.KNEEL_HEAD_Y}`,
    );
    assert.ok(distance(head, mark) < 0.3, `${mark.id}: the head is not over the mark`);

    /* World-space facing, from the rig's own transform, not from the number
     * that was handed to it. */
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(victim.group.quaternion);
    const toShooter = new THREE.Vector3(mark.shooter.x - mark.x, 0, mark.shooter.z - mark.z).normalize();
    assert.ok(
      facing.dot(toShooter) < -0.88,
      `${mark.id}: the kneeling figure is not facing away from its executioner`,
    );
    /* …and it is facing the line the player is standing in. */
    const toPlayer = new THREE.Vector3(
      site.PLAYER_SLOT.x - mark.x, 0, site.PLAYER_SLOT.z - mark.z,
    ).normalize();
    assert.ok(facing.dot(toPlayer) > 0.55, `${mark.id}: the player cannot see the face`);
  }
});

test('Person.update() cannot stand a kneeling man back up', () => {
  const mark = site.KNEEL_MARKS[0];
  const victim = new Person();
  const headY = () => {
    victim.group.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    victim.head.getWorldPosition(head);
    return head.y;
  };

  staging.poseKneeling(victim, mark);
  const posed = headY();
  assert.ok(Math.abs(posed - site.KNEEL_HEAD_Y) < 0.12, 'he is kneeling to begin with');

  /* One frame of the shared rig's own update, exactly as a scene loop would
   * run it. It rewrites both legs and the root height every frame — the head
   * goes back up to standing, which is the whole hazard this pose lives with. */
  victim.update(1 / 60, ZERO, 0);
  assert.ok(staging.isPosed(victim), 'the pose flag survives a tick, so a loop can skip it');
  assert.ok(headY() > posed + 0.8, 'this test is only meaningful if update() does break the pose');

  staging.poseKneeling(victim, mark);
  assert.ok(Math.abs(headY() - posed) < 1e-9, 're-posing after the tick must put him back exactly');
});

test('a shot man goes down forward, and stays on his mark', () => {
  for (const mark of site.KNEEL_MARKS) {
    const victim = new Person();
    staging.poseKneeling(victim, mark);
    const before = new THREE.Vector3();
    victim.head.getWorldPosition(before);

    staging.poseFallen(victim, mark, 1);
    const box = worldBox(victim.group);
    const head = new THREE.Vector3();
    victim.head.getWorldPosition(head);

    assert.ok(box.min.y > -0.06, `${mark.id}: the body is buried (${box.min.y.toFixed(3)})`);
    assert.ok(box.min.y < 0.1, `${mark.id}: the body is lying above the mud (${box.min.y.toFixed(3)})`);
    assert.ok(head.y < 0.75, `${mark.id}: the body did not go down (head at ${head.y.toFixed(2)})`);
    assert.ok(head.y > 0.05, `${mark.id}: the head is through the ground`);

    /* It fell TOWARD the fall point, and the knees did not slide. */
    const travelled = distance(head, mark);
    assert.ok(travelled > 1.2, `${mark.id}: the body barely moved (${travelled.toFixed(2)} m)`);
    assert.ok(
      distance(head, mark.fall) < 0.6,
      `${mark.id}: the head is ${distance(head, mark.fall).toFixed(2)} m off where the body was measured`,
    );
    const knees = new THREE.Vector3();
    victim.legL.getWorldPosition(knees);
    assert.ok(distance(knees, mark) < 0.25, `${mark.id}: the knees slid off the mark`);
  }
});

/* ------------------------------------------------------------------ */
/* Hands and seats                                                     */
/* ------------------------------------------------------------------ */

test('a prop goes in the HAND, and never on the forearm', () => {
  const figure = new Person();
  figure.group.position.set(0, 0, 0);
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1));
  const socket = staging.attachToHand(figure, 'R', pistol);

  assert.ok(socket, 'there is a hand to hang it on');
  assert.equal(pistol.parent, socket, 'the prop is parented to the socket itself');

  /* The core rig hangs a sleeve at -0.24, a forearm at -0.66 and a hand at
   * -0.95 off a shoulder pivot at 2.02. Landing on the forearm is the beer-can
   * bug, and the numbers are 29 cm apart, so this cannot pass by accident. */
  figure.group.updateMatrixWorld(true);
  const held = new THREE.Vector3();
  pistol.getWorldPosition(held);
  assert.ok(Math.abs(held.y - (2.02 - 0.95)) < 0.02, `held at ${held.y.toFixed(3)}, not at the hand`);
  assert.ok(Math.abs(held.y - (2.02 - 0.66)) > 0.2, 'the prop is on the forearm');

  /* And it moves WITH the arm, which is the entire point of a socket. */
  figure.armR.rotation.x = -1.2;
  figure.group.updateMatrixWorld(true);
  const raised = new THREE.Vector3();
  pistol.getWorldPosition(raised);
  assert.ok(raised.distanceTo(held) > 0.5, 'the prop did not follow the arm');
});

test('this cabin\'s seats are built to the pose, so no base correction is needed', () => {
  assert.equal(site.POSE_CUSHION, 0.53);
  assert.equal(site.CUSHION.chair, site.POSE_CUSHION);
  assert.equal(site.CUSHION.bench, site.POSE_CUSHION);
  assert.equal(site.seatBaseY(site.CUSHION.chair), 0, 'a chair here needs no lift at all');

  /* A bar stool is a different number, and using it here would sit a man 31 cm
   * above the seat — which is the same fault as STOOL_SIT, upside down. */
  assert.ok(Math.abs(site.seatBaseY(0.845) - STOOL_SIT) < 0.02);
  assert.notEqual(site.seatBaseY(0.845), site.seatBaseY(site.CUSHION.chair));
});

/* ------------------------------------------------------------------ */
/* The room                                                           */
/* ------------------------------------------------------------------ */

test('everybody in the cabin is in the room, clear of the furniture, facing the middle', () => {
  for (const slot of site.BLOCKING) {
    assert.ok(
      slot.x > site.ROOM.minX + site.BODY_RADIUS && slot.x < site.ROOM.maxX - site.BODY_RADIUS
      && slot.z > site.ROOM.minZ + site.BODY_RADIUS && slot.z < site.ROOM.maxZ - site.BODY_RADIUS,
      `${slot.id} is standing in a wall`,
    );
    for (const box of site.FURNITURE) {
      const dx = Math.max(box.minX - slot.x, 0, slot.x - box.maxX);
      const dz = Math.max(box.minZ - slot.z, 0, slot.z - box.maxZ);
      assert.ok(
        Math.hypot(dx, dz) > site.BODY_RADIUS,
        `${slot.id} is standing in the ${box.id}`,
      );
    }
    const facing = site.facingOf(slot.heading);
    const toCentre = {
      x: site.CEREMONY_CENTRE.x - slot.x,
      z: site.CEREMONY_CENTRE.z - slot.z,
    };
    const length = Math.hypot(toCentre.x, toCentre.z);
    assert.ok(
      (facing.x * toCentre.x + facing.z * toCentre.z) / length > 0.999,
      `${slot.id} is not watching`,
    );
    assert.ok(length > 1.2 && length < 5, `${slot.id} is ${length.toFixed(1)} m from the middle`);
  }
});

test('the man being made stands clear of everything, and can reach the table', () => {
  const centre = site.CEREMONY_CENTRE;
  for (const box of site.FURNITURE) {
    const dx = Math.max(box.minX - centre.x, 0, centre.x - box.maxX);
    const dz = Math.max(box.minZ - centre.z, 0, centre.z - box.maxZ);
    assert.ok(Math.hypot(dx, dz) > site.BODY_RADIUS, `the ceremony centre is inside the ${box.id}`);
  }
  for (const [name, socket] of Object.entries(site.TABLE_SOCKETS)) {
    const reach = Math.hypot(socket.x - centre.x, socket.z - centre.z);
    assert.ok(reach < 3.4, `the ${name} is ${reach.toFixed(1)} m from the man who has to use it`);
    assert.ok(
      socket.x > site.TABLE.x - site.TABLE.width / 2 && socket.x < site.TABLE.x + site.TABLE.width / 2,
      `the ${name} is off the end of the table`,
    );
  }
  /* Lou is behind the table, on the other side of it from the player. */
  const lou = site.blockingSlot('lou');
  assert.ok(lou.z > site.TABLE.z, 'Lou is on the wrong side of his own table');
  assert.ok(centre.z < site.TABLE.z, 'the player is on the wrong side of the table');
});

/* ------------------------------------------------------------------ */
/* Getting there                                                       */
/* ------------------------------------------------------------------ */

test('the trail is one continuous walk from the clearing to the cabin door', () => {
  assert.ok(site.TRAIL_LENGTH > 20 && site.TRAIL_LENGTH < 60, 'the walk is a walk, not a hike');
  for (let i = 1; i < site.TRAIL.length; i++) {
    const step = distance(site.TRAIL[i - 1], site.TRAIL[i]);
    assert.ok(step > 0.5 && step < 12, `the trail jumps ${step.toFixed(1)} m at node ${i}`);
  }
  const start = site.pointAlongPath(site.TRAIL, 0);
  const end = site.pointAlongPath(site.TRAIL, 1);
  assert.ok(distance(start, site.CLEARING) < 16, 'the trail does not start at the clearing');
  assert.ok(distance(end, site.CABIN_DOOR) < 6, 'the trail does not arrive at the cabin');
  /* It stops in the yard rather than inside the front wall. */
  assert.ok(end.z < site.PORCH.minZ - 0.5, 'the trail runs into the porch');
});

test('a man can walk the whole night through without meeting a collider', () => {
  const built = buildInitiationCabinSite();
  const PLAYER_RADIUS = 0.3;

  const walk = [];
  const push = (from, to, steps) => {
    for (let i = 0; i <= steps; i++) {
      walk.push({
        x: from.x + (to.x - from.x) * (i / steps),
        z: from.z + (to.z - from.z) * (i / steps),
      });
    }
  };
  /* The line, to the head of the trail, up the trail, in at the door, to the
   * middle of the room. This is the whole route the scene asks for. */
  push(site.PLAYER_SLOT, site.TRAIL[0], 12);
  for (let i = 1; i < site.TRAIL.length; i++) push(site.TRAIL[i - 1], site.TRAIL[i], 14);
  push(site.TRAIL.at(-1), site.CABIN_DOOR.outside, 6);
  push(site.CABIN_DOOR.outside, site.CABIN_DOOR.inside, 8);
  push(site.CABIN_DOOR.inside, site.CEREMONY_CENTRE, 8);

  for (const step of walk) {
    for (const collider of built.colliders) {
      const gap = Math.hypot(step.x - collider.x, step.z - collider.z) - collider.r - PLAYER_RADIUS;
      assert.ok(
        gap > -0.02,
        `the route is blocked at ${step.x.toFixed(1)}, ${step.z.toFixed(1)} `
        + `by a collider at ${collider.x.toFixed(1)}, ${collider.z.toFixed(1)} (${gap.toFixed(2)} m)`,
      );
    }
  }
});

test('the woods keep out of the clearing, the paths and the yard', () => {
  const built = buildInitiationCabinSite({ cabin: false, clearing: false });
  assert.ok(built.colliders.length > 100, 'there is a forest');
  for (const tree of built.colliders) {
    assert.ok(
      site.distanceToPath(site.TRAIL, tree) > site.TRAIL_HALF_WIDTH + tree.r,
      `a tree is standing in the trail at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`,
    );
    assert.ok(
      site.distanceToPath(site.TRACK, tree) > site.TRACK_HALF_WIDTH + tree.r,
      `a tree is standing in the track at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`,
    );
    assert.ok(
      Math.hypot(tree.x - site.CLEARING.x, tree.z - site.CLEARING.z) > site.CLEARING.radius,
      'a tree is standing in the clearing',
    );
    assert.ok(
      Math.hypot(tree.x - site.CABIN.x, tree.z - site.CABIN.z) > 6,
      'a tree is growing through the cabin',
    );
  }
});

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

test('a line from a man who is walking follows him, and carries across the clearing', () => {
  const played = [];
  const audio = { play: (name, options) => played.push({ name, options }) };
  const speaker = new THREE.Object3D();
  speaker.position.set(6, 1.6, 4);

  ambience.sayFrom(audio, 'vo.initiation.ceremony.test.1', speaker);
  assert.equal(played.length, 1);
  assert.equal(played[0].options.follow, speaker, 'the line is pinned where he started talking');
  assert.equal(played[0].options.rolloff, 0.7, 'dialogue uses the gentle rolloff, not the 1.4 default');
  assert.ok(played[0].options.maxDist >= 26, 'the far end of the clearing is out of range');

  assert.equal(ambience.sayFrom(audio, 'cue', null), false, 'a line with no speaker is refused');
  assert.equal(played.length, 1);
});

test('boots know what they are standing on', () => {
  assert.equal(ambience.footingAt(0, -60), 'dirt', 'the track in');
  assert.equal(ambience.footingAt(0, -5), 'gravel', 'the clearing');
  assert.equal(ambience.footingAt(site.PLAYER_SLOT.x, site.PLAYER_SLOT.z), 'gravel', 'the line');
  assert.equal(ambience.footingAt(site.CABIN_DOOR.x, site.PORCH.minZ + 1), 'wood', 'the porch');
  assert.equal(ambience.footingAt(site.CEREMONY_CENTRE.x, site.CEREMONY_CENTRE.z), 'wood', 'the room');
  assert.equal(ambience.footingAt(-52, -40), 'leaves', 'the woods');

  const played = [];
  const audio = { play: (name, options) => played.push({ name, options }) };
  ambience.playFootstep(audio, -52, -40);
  assert.equal(played[0].name, 'footstep.leaves');
  assert.ok(played[0].options.position, 'a footstep is positional or it is a slideshow');
});

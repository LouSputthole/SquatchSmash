/**
 * The Cartel Palace owner playtest pass, 2026-08-20.
 *
 * One test per thing the owner actually reported, asserted against the live
 * scene graph rather than against a comment:
 *
 *   - the front door no longer occupies the arch, and the hole above it is
 *     a wall;
 *   - the foyer is a room somebody worked in, with a watch desk, a guard
 *     seated at it and a cleaner who cowers instead of fighting;
 *   - the surveillance monitor hangs off a real ceiling mount, and its
 *     screen materials are its own so collecting it cannot dim the estate;
 *   - the bed is against the wall, the television faces it, and evidence #2
 *     reads as a chef's uniform;
 *   - evidence #3 is a composed desk with the corn on it;
 *   - no hallway art overlaps the gallery doorway and nothing floats off
 *     its wall;
 *   - dining chair cushions sit inside their frames and the chandelier
 *     chain misses the coffer grid;
 *   - the suppressor fits, moves the muzzle, mutes without silencing, and
 *     shrinks the radius a guard hears a shot at;
 *   - every authored line has a manifest row that says the same words.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { PALACE_GUARD_POSTS, buildPalaceCast } from '../src/cartel-palace/cast.js';
import { PalaceBystanders } from '../src/cartel-palace/bystanders.js';
import { EVIDENCE_IDS } from '../src/cartel-palace/mission.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';
import {
  GUNSHOT_HEARING,
  PalaceSuppressor,
  SUPPRESSED_ACTION_CUE,
  SUPPRESSED_WEAPON_IDS,
  fitSuppressor,
  suppressedFireCue,
} from '../src/cartel-palace/suppressor.js';
import { PALACE_VOICE_LINES, PalaceVoice, allPalaceVoiceLines } from '../src/cartel-palace/voice.js';
import { buildCartelPalace } from '../src/cartel-palace/world.js';
import { WEAPON_IDS, weaponCue } from '../src/core/weapons/catalog.js';
import { buildWeaponModel } from '../src/core/weapons/models.js';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);

let cachedWorld = null;
/** One built palace, reused: the builder is the expensive part of this file. */
function world() {
  if (!cachedWorld) {
    cachedWorld = buildCartelPalace(new THREE.Scene());
    cachedWorld.root.updateMatrixWorld(true);
  }
  return cachedWorld;
}

function boundsOf(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function named(root, name) {
  const found = [];
  root.traverse((object) => { if (object.name === name) found.push(object); });
  return found;
}

/** Do two world-space boxes actually share volume, past a tolerance? */
function overlaps(a, b, slack = 0.004) {
  return a.min.x < b.max.x - slack && a.max.x > b.min.x + slack
    && a.min.y < b.max.y - slack && a.max.y > b.min.y + slack
    && a.min.z < b.max.z - slack && a.max.z > b.min.z + slack;
}

/* ---------------- Entrance ---------------- */

test('the front door sits inside its portal instead of through the arch', () => {
  const built = world();
  const door = built.targets.estateDoor;
  assert.ok(door, 'the estate lost its service door');
  const leaf = boundsOf(door);

  for (const name of ['estate-entry-arch-ring', 'estate-entry-jamb', 'estate-entry-impost', 'estate-entry-keystone']) {
    const parts = named(built.root, name);
    assert.ok(parts.length > 0, `the entrance portal has no ${name}`);
    for (const part of parts) {
      assert.equal(overlaps(leaf, boundsOf(part)), false,
        `the door leaf still occupies the ${name}`);
    }
  }

  /* The arch crowns under the facade cornice rather than through the wall,
   * and springs from the imposts rather than hanging in the opening.
   *
   * Measured off the real vertices: `Box3.setFromObject` expands a ROTATED
   * torus arc's box into an axis-aligned one, which over-reports its top by
   * more than a metre and would fail a perfectly good arch. */
  const ringMesh = named(built.root, 'estate-entry-arch-ring')[0];
  ringMesh.updateWorldMatrix(true, false);
  const vertex = new THREE.Vector3();
  const position = ringMesh.geometry.getAttribute('position');
  let ringTop = -Infinity;
  let ringBottom = Infinity;
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index).applyMatrix4(ringMesh.matrixWorld);
    ringTop = Math.max(ringTop, vertex.y);
    ringBottom = Math.min(ringBottom, vertex.y);
  }
  assert.ok(ringTop < 4.48, `the arch ring crowns at ${ringTop.toFixed(2)} — through the cornice`);
  assert.ok(ringBottom > 2.6, 'the arch ring hangs down into the doorway');

  /* The hole above the door is now a wall: the opening is 4.8 m tall and the
   * leaf is 2.6, and the header is what filled the missing 2.2 m. */
  const header = named(built.root, 'estate-entry-header')[0];
  assert.ok(header, 'nothing closes the wall above the front door');
  const headerBounds = boundsOf(header);
  assert.ok(headerBounds.min.y <= leaf.max.y + 0.02 && headerBounds.max.y >= 4.79,
    'the header does not reach from the door head to the top of the wall');
  assert.ok(headerBounds.min.x <= 11.51 && headerBounds.max.x >= 15.49,
    'the header does not span the whole opening');
});

test('the opened front door swings out of the foyer and clear of the portal', () => {
  const built = buildCartelPalace(new THREE.Scene());
  const door = built.targets.estateDoor;
  assert.equal(built.doors.openEstateDoor(), true);
  built.root.updateMatrixWorld(true);
  const leaf = boundsOf(door);

  // Out over the step, not across the hall the player is about to walk into.
  assert.ok(leaf.min.z >= 11.9, `the opened leaf reaches back to z ${leaf.min.z}, inside the foyer`);
  for (const name of ['estate-entry-jamb', 'estate-entry-impost', 'estate-entry-header']) {
    for (const part of named(built.root, name)) {
      assert.equal(overlaps(leaf, boundsOf(part)), false, `the opened door clips ${name}`);
    }
  }
  // And the doorway is walkable once it is open.
  for (let x = 12.1; x <= 14.9; x += 0.35) {
    const point = new THREE.Vector3(x, 0.9, 12);
    const blocker = built.colliders.find((collider) => collider.containsPoint(point));
    assert.equal(blocker, undefined, `the open doorway is blocked at x=${x} by ${blocker?.name}`);
  }
});

/* ---------------- Foyer ---------------- */

test('the entry hall is a room people worked in, not an empty box', () => {
  const built = world();
  const entry = built.root.getObjectByName('estate-entry-refinement');
  assert.ok(entry, 'the foyer has no authored refinement layer');
  const names = new Set();
  entry.traverse((object) => { if (object.name) names.add(object.name); });

  for (const wanted of [
    'entry-watch-desk.top',
    'entry-watch-computer.monitor-screen',
    'entry-watch-clutter.mug',
    'estate-cleaning-cart',
    'entry-detail.trash-can',
    'entry-detail.console-table',
    'entry-detail.bench',
    'palace-potted-plant',
    'palace-wall-art',
    'entry-pendant',
  ]) {
    assert.ok(names.has(wanted), `the foyer is missing ${wanted}`);
  }
  let hungArt = 0;
  entry.traverse((object) => { if (object.name === 'palace-wall-art') hungArt++; });
  assert.ok(hungArt >= 5, `the foyer walls carry only ${hungArt} pictures`);

  /* Nothing added here may block the lane from the door to the corridor. */
  for (let z = 11.4; z >= -7.4; z -= 0.35) {
    const point = new THREE.Vector3(13.2, 0.9, z);
    const blocker = built.colliders.find((collider) => collider.containsPoint(point));
    assert.equal(blocker, undefined, `the entry lane is blocked at z=${z} by ${blocker?.name}`);
  }
});

test('a guard sits at the watch desk and stands up when he has a reason to', () => {
  const post = PALACE_GUARD_POSTS.find((entry) => entry.id === 'entry-watch');
  assert.ok(post, 'the foyer has no watch-desk post');
  assert.equal(post.seated, true);
  assert.equal(post.patrol, null, 'a man at a keyboard does not walk a beat');

  const cast = buildPalaceCast(new THREE.Group());
  const watch = cast.guards.find((guard) => guard.id === 'entry-watch');
  assert.equal(watch.seated, true);
  assert.equal(watch.figure.pose, 'seated');
  assert.ok(watch.figure.tilt.position.y < -0.2, 'a seated man is not standing height');
  assert.equal(watch.weaponModel?.visible, false, 'his sidearm is on the desk, not in his hand');

  // He faces the front door, which is +Z of him.
  assert.ok(Math.abs(watch.root.rotation.y) < 0.3, 'the watch guard is not facing the entrance');

  assert.equal(cast.standUp(watch), true);
  assert.equal(watch.seated, false);
  assert.equal(watch.figure.pose, 'aiming');
  assert.equal(watch.figure.tilt.position.y, 0);
  assert.equal(watch.weaponModel?.visible, true);
  assert.equal(cast.standUp(watch), false, 'standing up twice is not a thing');
});

test('the alarm gets the watch guard out of his chair through the security layer', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const security = new PalaceSecurity({ cast, colliders: [] });
  const watch = cast.guards.find((guard) => guard.id === 'entry-watch');
  assert.equal(watch.seated, true);
  security.raiseAlarm('gunshot');
  security.update(1 / 60, { playerPosition: new THREE.Vector3(13.5, 0, 9) });
  assert.equal(watch.seated, false, 'the alarm left a man typing');
});

test('the cleaner is an unarmed bystander who cowers and never fights', () => {
  const cast = buildPalaceCast(new THREE.Group());
  assert.equal(cast.civilians.length, 3, 'the dining trio must stay exactly three');
  assert.equal(cast.bystanders.length, 1);
  const cleaner = cast.bystanders[0];
  assert.equal(cleaner.id, 'cleaner');
  assert.equal(cleaner.role, 'civilian');
  assert.equal(cast.all.includes(cleaner), false, 'a cleaner is not in the combat cast');
  assert.equal(cleaner.actor, undefined, 'a cleaner has no CombatActor');
  assert.equal(cast.hitTargets.includes(cleaner.root), true, 'she must still be shootable');
  assert.ok(cleaner.cowerAt?.isVector3, 'she has nowhere to go when the shooting starts');
  /* And the corner she runs to is real floor, not the inside of the bench. */
  const built = world();
  const landing = new THREE.Vector3(cleaner.cowerAt.x, 0.6, cleaner.cowerAt.z);
  const blocked = built.colliders.find((collider) => (
    landing.x > collider.min.x - 0.35 && landing.x < collider.max.x + 0.35
    && landing.z > collider.min.z - 0.35 && landing.z < collider.max.z + 0.35
    && collider.max.y > 0.2
  ));
  assert.equal(blocked, undefined, `she cowers inside ${blocked?.name}`);

  const spoken = [];
  const voice = { say: (id) => { spoken.push(id); return true; } };
  const people = new PalaceBystanders({ cast, voice });
  assert.equal(people.notice(cleaner), true);
  assert.equal(cleaner.figure.pose, 'startled');
  assert.equal(people.panic(), true);
  for (let index = 0; index < 90; index++) people.update(1 / 60);
  assert.equal(cleaner.figure.pose, 'prone');
  assert.ok(cleaner.root.position.distanceTo(cleaner.cowerAt) < 0.02,
    'she never reached the corner she runs to');
  assert.ok(spoken.includes('cleaner.spotted') && spoken.includes('cleaner.panic.one'),
    `she said nothing about it (${spoken.join(', ')})`);
  assert.equal(people.panic(), false, 'panicking twice is not a thing');
});

/* ---------------- Intelligence desk ---------------- */

test('the surveillance monitor hangs off a ceiling mount and carries a readable file', () => {
  const built = world();
  const target = built.evidence[EVIDENCE_IDS.SECURITY_STILL];
  const panel = boundsOf(target);
  const plate = boundsOf(named(built.root, 'monitor-arm-ceiling-plate')[0]);
  assert.ok(plate.max.y >= 4.4, 'the monitor arm is not fixed to the ceiling');

  /* Every link from the ceiling plate down to the panel touches the next. */
  const chain = [
    'monitor-arm-ceiling-plate', 'monitor-arm-drop-pole', 'monitor-arm-shoulder',
    'monitor-arm-upper', 'monitor-arm-elbow', 'monitor-arm-forearm',
    'monitor-arm-wrist', 'monitor-arm-vesa-plate',
  ].map((name) => {
    const part = named(built.root, name)[0];
    assert.ok(part, `the monitor arm has no ${name}`);
    return boundsOf(part);
  });
  const gap = (a, b) => Math.hypot(
    Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
    Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0),
    Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0),
  );
  for (let index = 1; index < chain.length; index++) {
    assert.ok(gap(chain[index - 1], chain[index]) <= 0.06,
      `the monitor arm is broken between link ${index - 1} and ${index}`);
  }
  assert.ok(gap(chain.at(-1), panel) <= 0.08, 'the panel is not on the end of the arm');
  assert.ok(named(built.root, 'monitor-arm-cable').length >= 2, 'the mount has no visible cabling');

  // The evidence looks like a file, and there is a printed copy under a lamp.
  const parts = new Set();
  target.traverse((object) => { if (object.name) parts.add(object.name); });
  for (const wanted of ['dossier-header', 'dossier-gate-still', 'dossier-mugshot', 'dossier-highlighted-row']) {
    assert.ok(parts.has(wanted), `the dossier has no ${wanted}`);
  }
  assert.ok(named(built.root, 'dossier-photograph').length > 0, 'no printed file beside the screen');
  assert.ok(named(built.root, 'task-lamp-shade').length > 0, 'nothing aims light at the clue');
});

test('collecting an evidence screen cannot dim every other screen in the estate', () => {
  const built = world();
  /* The clue used to share the palette's single `M.screen` instance with the
   * monitor bank, the SUV windshields and the power-box indicator, and
   * collection zeroes emissiveIntensity across the target's subtree. */
  const clueMaterials = new Set();
  built.evidence[EVIDENCE_IDS.SECURITY_STILL].traverse((object) => {
    /* Only materials that actually GLOW matter: collection zeroes
     * emissiveIntensity, which is a no-op on a material whose emissive is
     * black (the bezel's steel) and a visible change on one that is not. */
    if (object.isMesh && object.material?.emissive?.getHex()) {
      clueMaterials.add(object.material);
    }
  });
  assert.ok(clueMaterials.size > 0);
  let shared = 0;
  built.root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    if (object.name.startsWith('evidence.') || object.name.startsWith('dossier-')) return;
    if (clueMaterials.has(object.material)) shared++;
  });
  assert.equal(shared, 0, `${shared} unrelated meshes share the clue's emissive materials`);
});

/* ---------------- Bedroom and the chef uniform ---------------- */

test('the guest suite bed is against the wall with a television across from it', () => {
  const built = world();
  const headboard = boundsOf(built.root.getObjectByName('guest-suite-refinement')
    .children.find((child) => child.name === 'guest-suite-detail.headboard'));
  // South partition inner face is z -14.825.
  assert.ok(headboard.min.z <= -14.8 && headboard.min.z >= -14.9,
    `the headboard sits at z ${headboard.min.z} instead of on the wall`);

  const bed = named(built.root, 'guest-suite-bed')[0];
  const bedBounds = boundsOf(bed);
  assert.ok(bedBounds.min.z <= -14.5, 'the bed is still parked out in the room');

  const television = built.root.getObjectByName('guest-suite-detail.television');
  assert.ok(television, 'the suite has no television');
  const tv = boundsOf(television.getObjectByName('television-shell'));
  assert.ok(tv.min.z > bedBounds.max.z, 'the television is not across from the bed');
  assert.ok(tv.min.z - bedBounds.max.z < 6.5, 'the television is halfway down the estate');
  assert.ok(tv.min.y > 1.2, 'the television is not wall-mounted');

  const names = new Set();
  built.root.getObjectByName('guest-suite-refinement').traverse((object) => {
    if (object.name) names.add(object.name);
  });
  for (const wanted of [
    'guest-suite-detail.dresser', 'guest-suite-detail.nightstands',
    'guest-suite-detail.bedside-lamps', 'guest-suite-detail.rug',
    'guest-suite-shoe', 'guest-suite-laundry-basket', 'guest-suite-detail.media-wall',
  ]) {
    assert.ok(names.has(wanted), `the suite is missing ${wanted}`);
  }
});

test('evidence #2 reads as a chef uniform, and the corn is not in the bedroom', () => {
  const built = world();
  const target = built.evidence[EVIDENCE_IDS.BELONGINGS];
  const parts = new Set();
  target.traverse((object) => { if (object.name) parts.add(object.name); });
  for (const wanted of ['chef-jacket-body', 'chef-jacket-mandarin-collar', 'chef-jacket-button', 'chef-jacket-sleeve']) {
    assert.ok(parts.has(wanted), `the clue has no ${wanted}`);
  }
  assert.match(target.userData.evidenceTitle, /chef/i, 'the clue is not named as chef whites');
  assert.ok(named(built.root, 'chef-toque').length > 0, 'no chef hat sells the outfit');
  assert.ok(named(built.root, 'chef-apron').length > 0, 'no apron sells the outfit');

  // The corn belongs to evidence #3. Nothing corn-shaped may be in the suite.
  const suite = built.root.getObjectByName('guest-suite-refinement');
  const strays = [];
  // `corn-`, `.corn` or `corn` on its own — never `cornice`.
  suite.traverse((object) => {
    if (/(^|[.\-])corn([.\-]|$)/i.test(object.name)) strays.push(object.name);
  });
  assert.deepEqual(strays, [], 'the corn is in the bedroom again');
});

test('evidence #3 is a composed desk with the corn on it', () => {
  const built = world();
  const target = built.evidence[EVIDENCE_IDS.PAYMENT_LEDGER];
  const desk = built.root.getObjectByName('mark-office-desk');
  assert.ok(desk, 'the office lost its desk');
  const names = new Set();
  desk.traverse((object) => { if (object.name) names.add(object.name); });
  for (const wanted of [
    'mark-office-desk.corn', 'corn-cob', 'corn-husk-leaf',
    'mark-office-desk.recipe-card', 'recipe-handwriting',
    'mark-office-desk.paperwork', 'desk-polaroid',
    'mark-office-desk.clue-lamp', 'clue-lamp-shade',
  ]) {
    assert.ok(names.has(wanted), `the clue desk is missing ${wanted}`);
  }
  assert.match(target.userData.evidenceDetail, /corn/i,
    'the clue does not mention what is holding the recipe down');

  // The corn is ON the desk top, not floating over it or sunk into it.
  const cob = boundsOf(built.root.getObjectByName('mark-office-desk.corn'));
  assert.ok(cob.min.y > 0.86 && cob.min.y < 0.95,
    `the corn sits at y ${cob.min.y} — the desk top is 0.88`);
  // And the lamp aims at it from close by.
  const lamp = boundsOf(built.root.getObjectByName('mark-office-desk.clue-lamp'));
  assert.ok(lamp.distanceToPoint(cob.getCenter(new THREE.Vector3())) < 1.2,
    'the desk lamp is nowhere near the clue it is meant to light');
});

test('the service corridor is stocked without blocking the evidence route', () => {
  const built = world();
  const corridor = built.root.getObjectByName('service-corridor-refinement');
  assert.ok(corridor, 'the service corridor has no authored dressing');
  const names = new Set();
  corridor.traverse((object) => { if (object.name) names.add(object.name); });
  for (const wanted of [
    'service-shelf', 'service-supply-crate', 'service-liquor-case',
    'mop-sink-basin', 'service-corridor-detail.fuse-board', 'palace-wall-sconce',
  ]) {
    assert.ok(names.has(wanted), `the service corridor is missing ${wanted}`);
  }

  // The run south to the gallery door.
  for (let z = -16.5; z >= -33; z -= 0.35) {
    const point = new THREE.Vector3(14.2, 0.9, z);
    const blocker = built.colliders.find((collider) => collider.containsPoint(point));
    assert.equal(blocker, undefined, `the corridor is blocked at z=${z.toFixed(1)} by ${blocker?.name}`);
  }
  // And west through the gallery service doorway, which nothing may occupy.
  for (let x = 10.9; x <= 16.0; x += 0.3) {
    const point = new THREE.Vector3(x, 0.9, -24.2);
    const blocker = built.colliders.find((collider) => collider.containsPoint(point));
    assert.equal(blocker, undefined, `the gallery doorway is blocked at x=${x.toFixed(1)} by ${blocker?.name}`);
  }
});

/* ---------------- Hallway art ---------------- */

test('no gallery art overlaps the service doorway and nothing floats off its wall', () => {
  const built = world();
  const gallery = built.root.getObjectByName('portrait-gallery-refinement');
  assert.ok(gallery);

  /* The doorway is the gap in the east service partitions, z -26.5..-22 at
   * x 10.5. Nothing hung on that wall may enter it. */
  const doorway = new THREE.Box3(
    new THREE.Vector3(9.0, 0, -26.5),
    new THREE.Vector3(11.0, 4.2, -22.0),
  );
  const hung = [];
  gallery.traverse((object) => {
    if (['gallery-wall-panel', 'palace-wall-art', 'mark-family-portrait'].includes(object.name)) {
      hung.push(object);
    }
  });
  assert.ok(hung.length >= 12, 'the gallery lost its art');
  for (const art of hung) {
    assert.equal(overlaps(boundsOf(art), doorway), false,
      `${art.name} still hangs across the gallery doorway`);
  }

  /* Depth: every piece is within 12 cm of the wall face it hangs on. The
   * frames used to sit 46 cm out in the aisle. */
  for (const art of hung) {
    const bounds = boundsOf(art);
    const face = bounds.max.x > 0 ? 10.325 : -10.34;
    const back = face > 0 ? bounds.max.x : bounds.min.x;
    assert.ok(Math.abs(back - face) <= 0.12,
      `${art.name} hangs ${Math.abs(back - face).toFixed(2)} m off its wall`);
  }
});

/* ---------------- Dining room ---------------- */

test('dining chair cushions sit inside their frames', () => {
  const built = world();
  const seat = named(built.root, 'dining-chair-seat')[0];
  const cushion = named(built.root, 'dining-chair-upholstery')[0];
  assert.ok(seat?.isInstancedMesh && cushion?.isInstancedMesh);
  const seatBounds = boundsOf(seat);
  const cushionBounds = boundsOf(cushion);
  assert.ok(cushionBounds.min.y >= seatBounds.max.y - 0.005,
    `upholstery hangs ${(seatBounds.max.y - cushionBounds.min.y).toFixed(3)} m below the seat`);
  assert.ok(cushionBounds.max.y - seatBounds.max.y <= 0.2,
    'the upholstery still balloons above the seat');
  assert.ok(cushionBounds.min.x >= seatBounds.min.x - 0.005
    && cushionBounds.max.x <= seatBounds.max.x + 0.005,
    'the upholstery is wider than the chair frame');
});

test('the chandelier chain no longer runs through the ceiling coffers', () => {
  const built = world();
  const chain = boundsOf(named(built.root, 'dining-chandelier-chain')[0]);
  for (const beam of named(built.root, 'dining-coffer-beam')) {
    assert.equal(overlaps(chain, boundsOf(beam)), false,
      'the chandelier chain still passes through a ceiling beam');
  }
  assert.ok(named(built.root, 'dining-ceiling-rose').length > 0,
    'the chandelier hangs from nothing where the beam used to be');
});

test('the dining room is dressed without becoming a furniture showroom', () => {
  const built = world();
  const dressing = built.root.getObjectByName('dining-detail.dressing');
  assert.ok(dressing, 'the dining room has no dressing layer');
  const names = new Set();
  dressing.traverse((object) => { if (object.name) names.add(object.name); });
  for (const wanted of [
    'dining-sideboard-top', 'dining-bar-bottle', 'dining-bar-tumbler',
    'dining-plate-stack', 'dining-service-paperwork', 'dining-drape',
    'dining-wall-mirror', 'dining-detail.bar-cart', 'dining-detail.serving-credenza',
    'credenza-fruit-bowl', 'palace-potted-plant', 'dining-door-runner',
  ]) {
    assert.ok(names.has(wanted), `the dining room is missing ${wanted}`);
  }
  // The flanking lanes stay exactly as clear as they were.
  for (const x of [-7.2, 7.2]) {
    for (let z = -35.2; z >= -49.2; z -= 0.4) {
      const point = new THREE.Vector3(x, 0.9, z);
      const blocker = built.colliders.find((collider) => collider.containsPoint(point));
      assert.equal(blocker, undefined, `dressing blocked the lane at (${x}, ${z}): ${blocker?.name}`);
    }
  }
});

/* ---------------- Characters ---------------- */

test('the two short men are plain-clothed, clean-shaven and told apart by build and hair', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const shorts = cast.civilians.filter((entry) => entry.id.startsWith('short-'));
  assert.equal(shorts.length, 2);
  for (const entry of shorts) {
    const beards = [];
    entry.root.traverse((object) => { if (/beard/i.test(object.name)) beards.push(object.name); });
    assert.deepEqual(beards, [], `${entry.id} still has facial hair`);
  }
  // Distinct silhouettes rather than distinct faces.
  const heights = shorts.map((entry) => entry.figure.height ?? entry.root.userData.height);
  assert.notEqual(heights[0], heights[1], 'the double act lost its two centimetres');
  const bounds = shorts.map((entry) => boundsOf(entry.root));
  assert.notEqual(
    (bounds[0].max.x - bounds[0].min.x).toFixed(3),
    (bounds[1].max.x - bounds[1].min.x).toFixed(3),
    'both short men are the same build',
  );
});

test('nobody in the estate holds a gun upside down, aiming or not', () => {
  const cast = buildPalaceCast(new THREE.Group());
  cast.root.updateMatrixWorld(true);
  const rotation = new THREE.Quaternion();
  for (const entry of cast.all) {
    assert.ok(entry.weaponModel, `${entry.id} has no weapon model`);
    entry.weaponModel.getWorldQuaternion(rotation);
    /* The gun's own up -- rib, sights, ejection port -- against world up.
     * Every weapon in the palace used to measure -0.99 here: sights down,
     * grip up, on everybody. Only Mark was ever SEEN like that, because he
     * is the one combatant who spends a whole scene not aiming. */
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    assert.ok(up.y > 0.8, `${entry.id} holds his ${entry.weapon} upside down (up.y ${up.y.toFixed(2)})`);
    // And the bore still runs down the forearm, which is what aiming assumes.
    const bore = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    assert.ok(Math.abs(bore.y) < 0.3, `${entry.id}'s muzzle points at the floor or the ceiling`);
  }
});

test('Mark still aims correctly once his encounter activates', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const security = new PalaceSecurity({ cast, colliders: [] });
  const target = new THREE.Vector3(
    cast.mark.root.position.x, 0, cast.mark.root.position.z + 6,
  );
  assert.equal(cast.mark.active, false, 'Mark must stay passive until the finale');
  assert.equal(cast.mark.phase, 'armored');
  security.activateFinalEncounter();
  assert.equal(cast.mark.active, true);
  for (let index = 0; index < 240; index++) {
    security.update(1 / 60, { playerPosition: target, finalEncounter: true });
  }
  assert.ok(cast.mark.boreError < 0.14,
    `Mark never aligned his bore (${cast.mark.boreError})`);
  cast.root.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(cast.mark.weaponModel.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(up.y > 0.5, `Mark aims his rifle upside down (up.y ${up.y.toFixed(2)})`);
});

/* ---------------- The suppressor ---------------- */

test('a suppressor fits the threaded guns and moves the muzzle to the end of the can', () => {
  for (const id of SUPPRESSED_WEAPON_IDS) {
    const model = buildWeaponModel(id);
    const before = model.userData.muzzle.clone();
    assert.equal(fitSuppressor(model, id), true, `${id} refused a suppressor`);
    assert.equal(fitSuppressor(model, id), false, 'fitting twice is not a thing');
    assert.equal(model.userData.suppressed, true);
    assert.ok(model.userData.muzzle.z < before.z - 0.1,
      `${id}'s muzzle did not move forward onto the can`);
    assert.ok(model.getObjectByName(`${id}-suppressor-tube`), `${id} has no visible can`);
    assert.ok(model.getObjectByName(`${id}-suppressor-cap`), `${id}'s can has no end cap`);
    // The can reaches the barrel rather than floating off the end of it.
    const tube = boundsOf(model.getObjectByName(`${id}-suppressor-tube`));
    assert.ok(tube.max.z >= before.z - 0.02, `${id}'s can does not meet its muzzle`);
  }
  // A revolver has a cylinder gap; it does not take one.
  const revolver = buildWeaponModel(WEAPON_IDS.REVOLVER);
  assert.equal(fitSuppressor(revolver, WEAPON_IDS.REVOLVER), false);
});

test('a suppressed shot is muted and layered, never silenced, and never a pfft', () => {
  const played = [];
  const audio = {
    hasSample: (name) => name === weaponCue(WEAPON_IDS.PISTOL9, 'fire')
      || name === SUPPRESSED_ACTION_CUE,
    play: (name, options) => { played.push({ name, ...options }); return { name }; },
  };
  const suppressor = new PalaceSuppressor({ audio });
  suppressor.equipped = WEAPON_IDS.PISTOL9;
  const playback = suppressor.playback();

  /* No suppressed take has landed yet, so the unsuppressed recording plays
   * MUTED -- substantially quieter and darker, and still a crack. */
  assert.equal(playback.hasSample(weaponCue(WEAPON_IDS.PISTOL9, 'fire')), true);
  playback.play(weaponCue(WEAPON_IDS.PISTOL9, 'fire'), { volume: 0.75 });
  const report = played.find((row) => row.name === weaponCue(WEAPON_IDS.PISTOL9, 'fire'));
  assert.ok(report, 'a suppressed shot made no sound at all');
  assert.ok(report.volume > 0.1 && report.volume <= 0.75 * 0.5,
    `suppressed report at ${report.volume} is either unmuted or a pfft`);
  const action = played.find((row) => row.name === SUPPRESSED_ACTION_CUE);
  assert.ok(action, 'the mechanical action was not layered on top');
  assert.ok(action.volume > report.volume,
    'the action must be the loudest part of a suppressed shot');

  // With a real suppressed take on disk, that take is what plays.
  played.length = 0;
  audio.hasSample = (name) => name === suppressedFireCue(WEAPON_IDS.PISTOL9)
    || name === SUPPRESSED_ACTION_CUE;
  assert.equal(playback.hasSample(weaponCue(WEAPON_IDS.PISTOL9, 'fire')), true);
  playback.play(weaponCue(WEAPON_IDS.PISTOL9, 'fire'), { volume: 0.75 });
  assert.ok(played.some((row) => row.name === suppressedFireCue(WEAPON_IDS.PISTOL9)),
    'the dedicated suppressed recording was ignored');

  // A weapon that takes no can is completely untouched.
  played.length = 0;
  suppressor.equipped = WEAPON_IDS.REVOLVER;
  audio.hasSample = () => true;
  playback.play(weaponCue(WEAPON_IDS.REVOLVER, 'fire'), { volume: 0.75 });
  assert.deepEqual(played, [{ name: weaponCue(WEAPON_IDS.REVOLVER, 'fire'), volume: 0.75 }]);
});

test('a suppressed shot is heard across a room, an unsuppressed one across the estate', () => {
  const suppressor = new PalaceSuppressor({ audio: null });
  suppressor.equipped = WEAPON_IDS.CARBINE;
  assert.equal(suppressor.hearingRadius, GUNSHOT_HEARING.suppressed);
  assert.equal(suppressor.hearingRadiusFor(WEAPON_IDS.SHOTGUN), GUNSHOT_HEARING.unsuppressed);
  assert.ok(GUNSHOT_HEARING.suppressed < 15, 'a suppressed shot still carries across the compound');

  const cast = buildPalaceCast(new THREE.Group());
  const alarms = [];
  const security = new PalaceSecurity({
    cast, colliders: [], onAlarm: (reason) => alarms.push(reason),
  });
  /* A corner of the west courtyard: the nearest posted guard is 22 m away,
   * which is well outside a suppressed report. */
  const far = new THREE.Vector3(-18, 0, -10);
  for (const guard of cast.guards) {
    assert.ok(guard.root.position.distanceTo(far) > GUNSHOT_HEARING.suppressed,
      `${guard.id} is standing on the "nobody near" test point`);
  }
  assert.equal(security.noteGunshot(far, { radius: GUNSHOT_HEARING.suppressed }), false,
    'a suppressed shot nobody was near raised the alarm');
  assert.deepEqual(alarms, []);

  // Somebody close enough still hears it.
  const near = cast.guards[0].root.position.clone().add(new THREE.Vector3(0, 0, 3));
  assert.equal(security.noteGunshot(near, { radius: GUNSHOT_HEARING.suppressed }), true);
  assert.deepEqual(alarms, ['gunshot']);

  // And the default is unchanged: no radius means the whole estate hears it.
  const plain = buildPalaceCast(new THREE.Group());
  const loudAlarms = [];
  const loud = new PalaceSecurity({
    cast: plain, colliders: [], onAlarm: (reason) => loudAlarms.push(reason),
  });
  loud.playerPoint = new THREE.Vector3(0, 0, 400);
  assert.equal(loud.noteGunshot(new THREE.Vector3(0, 0, 400)), true);
  assert.deepEqual(loudAlarms, ['gunshot']);
});

test('a suppressed shot out of earshot still sends the nearest men to look', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const security = new PalaceSecurity({ cast, colliders: [] });
  const guard = cast.guards.find((entry) => entry.id === 'gallery-west');
  // Twelve metres up the gallery: past the alarm radius, inside the ring in
  // which a man goes and looks.
  const shot = new THREE.Vector3(-6.4, 0, -17);
  assert.ok(guard.root.position.distanceTo(shot) > GUNSHOT_HEARING.suppressed);
  assert.ok(guard.root.position.distanceTo(shot)
    < GUNSHOT_HEARING.suppressed * 2.1);
  assert.equal(security.noteGunshot(shot, { radius: GUNSHOT_HEARING.suppressed }), false);
  assert.ok(guard.perception.hasMemory, 'nobody was told where the shot came from');
  assert.ok(guard.awareness > 0.3, 'a shot in the next room bought no suspicion at all');
});

/* ---------------- The voice layer ---------------- */

test('palace lines are gated on radius and on line of sight to the speaker', () => {
  const player = { position: new THREE.Vector3(0, 1.66, 0) };
  const spoken = [];
  const hud = { say: (text) => spoken.push(text) };
  const voice = new PalaceVoice({
    hud, player, vector: (x, y, z) => new THREE.Vector3(x, y, z), gap: 0,
  });

  // Out of radius: nothing.
  assert.equal(voice.say('guard.contact.one', {
    position: new THREE.Vector3(0, 0, 40), radius: 12,
  }), false);
  // In radius, no tracer: delivered.
  assert.equal(voice.say('guard.contact.one', {
    position: new THREE.Vector3(0, 0, 6), radius: 12,
  }), true);
  assert.equal(spoken.length, 1);
  // Once-only, so a room does not repeat itself on re-entry.
  assert.equal(voice.say('guard.contact.one', {
    position: new THREE.Vector3(0, 0, 6), radius: 12,
  }), false);

  // Through a wall: refused.
  const walled = new PalaceVoice({
    hud, player, gap: 0, vector: (x, y, z) => new THREE.Vector3(x, y, z), trace: () => ({ hit: true }),
  });
  assert.equal(walled.say('guard.contact.two', {
    position: new THREE.Vector3(0, 0, 6), radius: 12,
  }), false);

  // One voice at a time: a second line inside the hold is refused.
  const floored = new PalaceVoice({ hud, player, gap: 1 });
  assert.equal(floored.say('tony.cleared.entry'), true);
  assert.equal(floored.say('tony.cleared.halls'), false);
  // `update` clamps a step the way a frame loop does, so run a real clock.
  for (let index = 0; index < 400; index++) floored.update(1 / 60);
  assert.equal(floored.say('tony.cleared.halls'), true);
});

test('every Sauce-evidence line is a different sentence, and one exists per clue', () => {
  const ids = [
    'tony.evidence.still.spot', 'tony.evidence.still.log',
    'tony.evidence.uniform.spot', 'tony.evidence.uniform.log',
    'tony.evidence.ledger.spot', 'tony.evidence.ledger.log',
  ];
  const texts = ids.map((id) => {
    const line = PALACE_VOICE_LINES[id];
    assert.ok(line, `${id} is not authored`);
    assert.equal(line.voice, 'player', `${id} is not the Prospect's line`);
    return line.text;
  });
  assert.equal(new Set(texts).size, texts.length,
    'two evidence pieces share a recognition line');
  for (const text of texts) {
    assert.ok(text.length < 110, `"${text}" is exposition, not recognition`);
  }
});

test('every authored palace line has a manifest row with the same words and casting', () => {
  const lines = allPalaceVoiceLines();
  assert.ok(lines.length >= 20, 'the situational bank has lost lines rather than gained them');
  const rows = new Map(manifest.sfx.map((row) => [row.name, row]));
  for (const line of lines) {
    const row = rows.get(line.name);
    assert.ok(row, `manifest is missing ${line.name}`);
    assert.equal(row.voice, line.voice, `${line.cue} casting drifted`);
    assert.equal(row.say, line.say, `${line.cue} words drifted from the catalog`);
    if (line.direction) assert.equal(row.direction, line.direction, `${line.cue} delivery note drifted`);
    assert.ok(manifest.voices[line.voice], `voice profile ${line.voice} is not declared`);
  }
  // And no stale rows left behind by a renamed line.
  const live = new Set(lines.map((line) => line.name));
  const stale = manifest.sfx
    .map((row) => row.name)
    .filter((name) => /^vo\.palace\.(tony|cleaner|guard)\./.test(name) && !live.has(name));
  assert.deepEqual(stale, [], 'the manifest carries palace lines nobody says any more');
});

test('the suppressed weapon cues are declared so they can actually be recorded', () => {
  const names = new Set(manifest.sfx.map((row) => row.name));
  for (const id of SUPPRESSED_WEAPON_IDS) {
    assert.ok(names.has(suppressedFireCue(id)), `${suppressedFireCue(id)} is not in the manifest`);
  }
  assert.ok(names.has(SUPPRESSED_ACTION_CUE), 'the mechanical layer has no manifest row');
});

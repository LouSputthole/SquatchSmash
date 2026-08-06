import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { LOBBY_ANCHORS, buildHeistLevel } from '../src/heist/level.js';

test('safehouse reads as a planned job with physical gear instead of appliance placeholders', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const safehouse = level.phases.safehouse.group;

  const lockers = [];
  safehouse.traverse((object) => { if (object.userData.kind === 'prep-locker') lockers.push(object); });
  assert.equal(lockers.length, 3);
  assert.ok(safehouse.getObjectByName('evidence-board'));
  assert.ok(safehouse.getObjectByName('blueprint-route'));
  assert.ok(safehouse.getObjectByName('armor-vest-body'));
  assert.ok(safehouse.getObjectByName('loadout-carbine'));
  assert.ok(safehouse.getObjectByName('loadout-magazines'));
  assert.ok(safehouse.getObjectByName('loadout-duffel'));
});

test('bank actors have articulated silhouettes and a full lobby of hostages', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const { bank } = level.phases;

  assert.ok(bank.interactables.guard.getObjectByName('bank-guard-head'));
  assert.ok(bank.interactables.guard.getObjectByName('bank-guard-gun'));
  assert.ok(bank.interactables.guard.getObjectByName('bank-guard-holster'));
  assert.ok(bank.interactables.manager.getObjectByName('bank-manager-briefcase'));
  assert.equal(bank.civilians.length, 22);
  assert.ok(bank.civilians.every((actor) => actor.userData.hostageId));
  assert.ok(bank.civilians.every((actor) => actor.userData.figure));
});

test('every hostage state produces its own distinct pose', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const civilian = level.phases.bank.civilians[0];
  const poses = ['startled', 'pleading', 'kneeling', 'prone', 'restrained', 'bolting', 'alarm', 'down']
    .map((state) => civilian.userData.setState(state, { blend: false }));
  assert.equal(new Set(poses).size, poses.length, `poses collapsed: ${poses.join(',')}`);
  // Prone lies down; restrained lies down with the arms behind the back.
  civilian.userData.setState('prone', { blend: false });
  const proneArm = civilian.userData.figure.parts.armL.rotation.x;
  civilian.userData.setState('restrained', { blend: false });
  assert.notEqual(civilian.userData.figure.parts.armL.rotation.x, proneArm);
});

test('a takedown is blended across time rather than applied in one frame', () => {
  /* Owner: "takedown animations are shaky." They were applied whole between
   * two frames — a 90 degree rotation of the entire figure with nothing in
   * between, twenty-two at a time when the crowd order lands. */
  const level = buildHeistLevel(new THREE.Scene());
  const civilian = level.phases.bank.civilians[1];
  const figure = civilian.userData.figure;

  civilian.userData.setState('stand', { blend: false });
  const standing = figure.tilt.rotation.x;
  civilian.userData.setState('prone');

  // The state is true immediately: everything that ASKS about this person
  // gets the answer now, whatever the tween is doing.
  assert.equal(civilian.userData.visualState, 'prone');
  // The BODY has not moved yet.
  assert.equal(figure.tilt.rotation.x, standing);

  // A single frame gets it partway, not all the way.
  figure.update(1 / 60, { fear: 0 });
  const afterOneFrame = figure.tilt.rotation.x;
  assert.ok(afterOneFrame > standing, 'the blend did not start');
  assert.ok(afterOneFrame < Math.PI / 2 * 0.5,
    `one frame carried the whole takedown: ${afterOneFrame}`);

  // And it arrives.
  for (let i = 0; i < 90; i++) figure.update(1 / 60, { fear: 0 });
  assert.ok(Math.abs(figure.tilt.rotation.x - Math.PI / 2) < 1e-6,
    `the blend never landed: ${figure.tilt.rotation.x}`);
});

test('a shut vault door is a wall, and opening it takes the wall away', () => {
  /* Owner: "the vault can be walked into before it opens." The bank's
   * collider list had the vault corridor's walls and nothing at all across
   * the 8.4 m doorway they meet at. */
  const level = buildHeistLevel(new THREE.Scene());
  const vault = level.phases.bank.interactables.vault;
  const door = vault.userData.doorCollider;
  assert.ok(door, 'the vault door has no collider');

  level.activate('bank');
  assert.ok(level.world.colliders.includes(door), 'the shut vault door is walk-through');
  // It spans the whole opening between the two rear-wall panels, not just
  // the round disc hanging in it.
  assert.ok(door.max.x - door.min.x >= 8.4, 'the doorway is wider than the door collider');

  vault.userData.setOpen(true);
  assert.ok(!level.world.colliders.includes(door), 'the open vault is still walled off');
  // Re-entering the phase must not put the wall back on an opened vault.
  level.activate('street');
  level.activate('bank');
  assert.ok(!level.world.colliders.includes(door), 'a phase change re-shut the open vault');

  vault.userData.setOpen(false);
  assert.ok(level.world.colliders.includes(door), 'shutting the vault left it walk-through');
});

test('tellers stand clear enough of the counter to lie down behind it', () => {
  /* Owner: "bank teller NPCs clip through the counter." They stood 27 cm
   * behind a solid 85 cm box and lay down ALONG THEIR FACING when ordered,
   * which put 1.7 m of person through the counter, the tills and the glass. */
  const COUNTER_BACK_Z = -2.825;
  const PRONE_LENGTH = 1.7;
  const tellers = LOBBY_ANCHORS.filter((anchor) => anchor.role === 'teller');
  assert.equal(tellers.length, 4);
  for (const teller of tellers) {
    assert.ok(teller.z < COUNTER_BACK_Z, `teller stands inside the counter: z ${teller.z}`);
    // Where the head ends up once they are face down.
    const headZ = teller.z + Math.cos(teller.yaw) * PRONE_LENGTH;
    assert.ok(headZ < COUNTER_BACK_Z,
      `a prone teller reaches through the counter: head at z ${headZ.toFixed(2)}`);
  }
});

test('bank keeps a readable central play lane between the architectural columns', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const columns = [];
  level.phases.bank.group.traverse((object) => {
    if (object.userData.kind === 'bank-column') columns.push(object);
  });

  assert.equal(columns.length, 4);
  assert.ok(columns.every((column) => Math.abs(column.position.x) >= 4),
    `columns choke the center lane: ${columns.map((column) => column.position.x).join(', ')}`);
});

test('escape route has practical lights, readable facades, and a physical pursuit lightbar', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const driving = level.phases.driving.group;
  const practicals = [];
  const windows = [];
  driving.traverse((object) => {
    if (object.userData.kind === 'route-practical') practicals.push(object);
    if (object.userData.kind === 'driving-window-strip') windows.push(object);
  });

  assert.ok(practicals.length >= 12, `only ${practicals.length} route practicals`);
  assert.ok(windows.length >= 20, `only ${windows.length} facade strips`);
  assert.ok(level.phases.driving.pursuit.getObjectByName('pursuit-lightbar-red'));
  assert.ok(level.phases.driving.pursuit.getObjectByName('pursuit-lightbar-blue'));
});

test('the briefing table is a plan before the job and the count after it', () => {
  /* Owner: "debrief: tabletop rework + clear objective." The debrief happens
   * at the briefing table and the table was still showing the plan — a route
   * to a bank the crew had already robbed, with the money nowhere on it. */
  const level = buildHeistLevel(new THREE.Scene());
  const briefing = level.phases.safehouse.interactables.briefing;
  const named = (name) => briefing.getObjectByName(name);

  // Before: the plan is up, the take is not.
  assert.equal(briefing.userData.debriefShowing, false);
  assert.equal(named('briefing-bank-model').visible, true);
  assert.equal(named('blueprint-route').visible, true);
  assert.equal(named('briefing-take').visible, false);

  // After: the plan comes off — route, site pads and all four card models —
  // and one bag per bag that came home goes on, with its cash out in front.
  briefing.userData.setDebrief(6, true);
  for (const name of ['briefing-bank-model', 'briefing-street-model',
    'briefing-garage-model', 'briefing-swap-model', 'blueprint-route',
    'briefing-site-bank', 'briefing-site-swap']) {
    assert.equal(named(name).visible, false, `${name} is still on the table`);
  }
  assert.equal(named('briefing-take').visible, true);
  assert.equal(named('debrief-ledger').visible, true);
  for (let i = 1; i <= 8; i++) {
    const home = i <= 6;
    assert.equal(named(`debrief-bag-${i}`).visible, home, `bag ${i}`);
    assert.equal(named(`debrief-stack-${i}`).visible, home, `stack ${i}`);
  }
  assert.equal(briefing.userData.debriefBags, 6);

  // And it goes back, because a checkpoint can land before the count.
  briefing.userData.setDebrief(0, false);
  assert.equal(named('briefing-bank-model').visible, true);
  assert.equal(named('briefing-take').visible, false);
});

test('nothing on the briefing table hovers over the paper it is drawn on', () => {
  /* Every model on this plan was authored at a hand-picked y between 1.02 and
   * 1.035 while the sheet's top face is at 1.0075, so the whole plan floated
   * one to two and a half centimetres above it. `scene-audit` cannot see this
   * — its FLOATING rule allows 12 cm of support gap on purpose — so it is
   * measured here instead, against the surface itself. */
  const level = buildHeistLevel(new THREE.Scene());
  const briefing = level.phases.safehouse.interactables.briefing;
  briefing.updateWorldMatrix(true, true);
  const sheet = briefing.getObjectByName('briefing-plan-sheet');
  const paper = new THREE.Box3().setFromObject(sheet).max.y;

  const seated = (object) => {
    const bottom = new THREE.Box3().setFromObject(object).min.y;
    assert.ok(bottom >= paper - 0.004 && bottom <= paper + 0.004,
      `${object.name} sits ${((bottom - paper) * 1000).toFixed(1)} mm off the plan sheet`);
  };
  for (const name of ['briefing-bank-model', 'briefing-street-model',
    'briefing-garage-model', 'briefing-swap-model', 'blueprint-route',
    'briefing-site-bank', 'briefing-site-street', 'briefing-site-garage',
    'briefing-site-swap']) {
    seated(briefing.getObjectByName(name));
  }

  briefing.userData.setDebrief(8, true);
  briefing.updateWorldMatrix(true, true);
  for (let i = 1; i <= 8; i++) {
    seated(briefing.getObjectByName(`debrief-bag-${i}`));
    seated(briefing.getObjectByName(`debrief-stack-${i}`));
  }
  seated(briefing.getObjectByName('debrief-ledger'));
});

test('the debrief bags do not swallow the mugs the crew is still drinking from', () => {
  /* A first pass laid the eight bags out in two rows and put a coffee mug
   * inside bag seven. People are still sitting at this table. */
  const level = buildHeistLevel(new THREE.Scene());
  const briefing = level.phases.safehouse.interactables.briefing;
  briefing.userData.setDebrief(8, true);
  briefing.updateWorldMatrix(true, true);

  /* The ashtray, the two mugs and the cigarette pack: unnamed meshes standing
   * ON the plan with real height. Deliberately not the printed border, the
   * survey grid or the photographs — those are 4-to-6 mm of ink lying flat on
   * the paper, and a bag resting on the paper is meant to touch them. */
  const paper = new THREE.Box3()
    .setFromObject(briefing.getObjectByName('briefing-plan-sheet')).max.y;
  const clutter = [];
  for (const child of briefing.children) {
    if (child.name || !child.isMesh) continue;
    const box = new THREE.Box3().setFromObject(child);
    if (box.max.y - box.min.y < 0.02 || box.max.y < paper) continue;
    clutter.push(box);
  }
  assert.ok(clutter.length >= 4, `expected the table's props, saw ${clutter.length}`);
  for (let i = 1; i <= 8; i++) {
    for (const name of [`debrief-bag-${i}`, `debrief-stack-${i}`]) {
      const item = new THREE.Box3().setFromObject(briefing.getObjectByName(name));
      for (const prop of clutter) {
        assert.equal(item.intersectsBox(prop), false,
          `${name} is standing on top of something that was already on the table`);
      }
    }
  }
});

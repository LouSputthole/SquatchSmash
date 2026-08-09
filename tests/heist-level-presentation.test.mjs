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

test('the garage puts the player on clear floor looking at the car, not inside the ramp', () => {
  /* Owner: "garage spawn faces/intersects a big wall." The spawn was
   * (0, 1.66, 12) and the entry ramp is a slab running z 9 to 17 a metre off
   * the floor, so the player arrived standing inside it three metres off the
   * back wall with a face full of concrete. The ramp was not a collider
   * either, so it was a wall you could walk through.
   *
   * Both halves are asserted here, because "it is fixed" is a claim about two
   * numbers that anybody can move again: nothing solid within reach of where
   * the player is put down, and nothing solid between him and the car the
   * objective is about. */
  const level = buildHeistLevel(new THREE.Scene());
  const garage = level.phases.garage;
  const { spawn } = garage;
  const RADIUS = 0.3;   // the player capsule `_resolve` pushes out of a box

  const touching = [];
  for (const box of garage.colliders) {
    if (box.min.y > 1.8 || box.max.y < 0.1) continue;
    const dx = Math.max(box.min.x - spawn.x, 0, spawn.x - box.max.x);
    const dz = Math.max(box.min.z - spawn.z, 0, spawn.z - box.max.z);
    const gap = Math.hypot(dx, dz);
    if (gap < RADIUS) touching.push(`[${box.min.x},${box.min.z}]..[${box.max.x},${box.max.z}] at ${gap.toFixed(2)} m`);
  }
  assert.deepEqual(touching, [], `the garage spawn is inside something: ${touching.join('; ')}`);

  /* Facing. `player.yaw = 0` looks down −Z, so the first solid the player sees
   * is whatever this ray meets — and it has to be the sedan, far enough off
   * that the frame opens on a room rather than on a surface. */
  let nearest = Infinity;
  for (const box of garage.colliders) {
    if (box.min.y > 1.8 || box.max.y < 0.1) continue;
    if (box.min.x > spawn.x || box.max.x < spawn.x) continue;
    if (box.max.z >= spawn.z) continue;
    nearest = Math.min(nearest, spawn.z - box.max.z);
  }
  assert.ok(nearest > 8, `the first thing straight ahead of the garage spawn is ${nearest.toFixed(1)} m away`);
  const sedan = new THREE.Box3().setFromObject(garage.sedan);
  assert.ok(sedan.max.z < spawn.z, 'the escape car is behind the player');
  assert.ok(Math.abs(spawn.z - sedan.max.z - nearest) < 1.5,
    'the first thing straight ahead of the garage spawn is not the car');
});

test('safehouse boarding uses the rear of a cargo van backed into a physical loading bay', () => {
  /* Owner: "Getting in the van is still a car and its the wrong side. It
   * should just be like a big van backed up to the area." This assertion uses
   * the level's public geometry, because names or a prompt that says "van"
   * cannot make a sedan-shaped mesh read as one. */
  const level = buildHeistLevel(new THREE.Scene());
  const safehouse = level.phases.safehouse;
  safehouse.group.updateMatrixWorld(true);

  const van = safehouse.group.getObjectByName('primary-van');
  const rearDoorTarget = safehouse.interactables.van;
  const loadingBay = safehouse.group.getObjectByName('safehouse-loading-bay');
  assert.ok(van && rearDoorTarget && loadingBay, 'the backed-in van staging is incomplete');

  const vanBounds = new THREE.Box3().setFromObject(van);
  const vanSize = vanBounds.getSize(new THREE.Vector3());
  assert.ok(vanSize.z >= 5.8 && vanSize.z > vanSize.x * 1.65,
    `primary van still has car proportions: ${vanSize.x.toFixed(2)}w x ${vanSize.z.toFixed(2)}l`);
  assert.ok(vanSize.y >= 2.55, `primary van is only ${vanSize.y.toFixed(2)} m tall`);
  for (const part of ['primary-van-cargo-box', 'primary-van-cab',
    'primary-van-rear-door-left', 'primary-van-rear-door-right']) {
    assert.ok(van.getObjectByName(part), `${part} is missing from the van silhouette`);
  }

  const doorBounds = new THREE.Box3().setFromObject(rearDoorTarget);
  const doorCenter = doorBounds.getCenter(new THREE.Vector3());
  const vanCenter = vanBounds.getCenter(new THREE.Vector3());
  assert.ok(doorCenter.z < vanCenter.z,
    `boarding target is not on the room-facing rear: door z ${doorCenter.z}, van z ${vanCenter.z}`);
  assert.ok(vanBounds.min.z < loadingBay.position.z && vanBounds.max.z > loadingBay.position.z,
    'the van is parked in the room instead of backed through the loading bay');

  const bodyPoint = new THREE.Vector3(safehouse.spawn.x, 1, safehouse.spawn.z);
  assert.equal(vanBounds.containsPoint(bodyPoint), false, 'safehouse spawn starts inside the van');
  assert.equal(safehouse.colliders.some((solid) => solid.containsPoint(bodyPoint)), false,
    'safehouse spawn starts inside a collider');
  assert.ok(Math.hypot(safehouse.spawn.x - doorCenter.x, safehouse.spawn.z - doorCenter.z) <= 2.7,
    'the rear doors are outside the interaction reach from the loading apron');

  assert.ok(loadingBay.getObjectByName('loading-bay-header'));
  assert.ok(loadingBay.getObjectByName('loading-bay-jamb-left'));
  assert.ok(loadingBay.getObjectByName('loading-bay-jamb-right'));
  assert.ok(safehouse.group.getObjectByName('loading-apron-stripe-left'));
  assert.ok(safehouse.group.getObjectByName('loading-apron-stripe-right'));
});

test('safehouse lighting has a bounded hierarchy from room fill to van task lights', () => {
  const safehouse = buildHeistLevel(new THREE.Scene()).phases.safehouse;
  const points = [];
  safehouse.group.traverse((object) => { if (object.isPointLight) points.push(object); });

  // Six measured pools are enough for this 18 x 14 m room. Adding one point
  // light per prop would turn the visual fix into a render-cost regression.
  assert.equal(points.length, 6, `safehouse has ${points.length} point lights`);
  const overheads = points.filter((light) => light.name.startsWith('safehouse-overhead-'));
  const loading = points.filter((light) => light.name.startsWith('loading-bay-task-light-'));
  assert.equal(overheads.length, 2, 'the room key lights are anonymous or missing');
  assert.equal(loading.length, 2, 'the rear doors have no deliberate task-light pair');
  assert.ok(overheads.every((light) => light.intensity === 2.8 && light.distance === 11));
  assert.ok(loading.every((light) => light.intensity === 2.5 && light.distance === 8));
  assert.ok(safehouse.group.getObjectByName('safehouse-camera-fill'));
  assert.ok(safehouse.group.getObjectByName('safehouse-crew-fill'));
  assert.ok(Math.max(...loading.map((light) => light.distance))
    < Math.min(...overheads.map((light) => light.distance)),
  'loading lights spill farther than the room keys');
});

test('Mercer garage gives the transfer car a lit work zone and a clear approach', () => {
  const garage = buildHeistLevel(new THREE.Scene()).phases.garage;
  garage.group.updateMatrixWorld(true);

  const pointLights = [];
  const spotLights = [];
  garage.group.traverse((object) => {
    if (object.isPointLight) pointLights.push(object);
    if (object.isSpotLight) spotLights.push(object);
  });
  assert.equal(pointLights.length, 5, 'garage TLC inflated the existing point-light budget');
  assert.equal(pointLights.filter((light) => light.name.startsWith('garage-overhead-')).length, 5,
    'the garage ceiling pools are not a measurable hierarchy');
  assert.equal(spotLights.filter((light) => light.name === 'garage-sedan-task-light').length, 1,
    'the cash-transfer surface has no directed task light');

  const transfer = garage.group.getObjectByName('garage-transfer-zone');
  const cart = garage.group.getObjectByName('garage-tool-cart');
  assert.ok(transfer && cart, 'the escape car is still sitting in an undressed void');
  for (const part of ['garage-transfer-stripe-left', 'garage-transfer-stripe-right',
    'garage-transfer-stop-line', 'garage-wheel-stop-left', 'garage-wheel-stop-right',
    'garage-work-lamp']) {
    assert.ok(garage.group.getObjectByName(part), `${part} is missing`);
  }

  const cartCenter = new THREE.Box3().setFromObject(cart).getCenter(new THREE.Vector3());
  assert.ok(garage.colliders.some((solid) => solid.containsPoint(cartCenter)),
    'the tool cart can be walked through');

  // The center-line route from the arrival spawn to the trunk interaction
  // remains player-width clear. The route stops just before the sedan body.
  const approach = new THREE.Box3(
    new THREE.Vector3(-0.32, 0.1, -6.65),
    new THREE.Vector3(0.32, 1.8, garage.spawn.z),
  );
  const blockers = garage.colliders.filter((solid) => solid.intersectsBox(approach));
  assert.deepEqual(blockers, [], `garage transfer approach is blocked by ${blockers.length} collider(s)`);
});

test('swap yard is a lit physical evidence-transfer station with every action reachable', () => {
  const driving = buildHeistLevel(new THREE.Scene()).phases.driving;
  driving.group.updateMatrixWorld(true);

  const points = [];
  const spots = [];
  driving.group.traverse((object) => {
    if (object.isPointLight) points.push(object);
    if (object.isSpotLight) spots.push(object);
  });
  assert.equal(points.length, 13, 'swap-yard polish inflated the driving point-light budget');
  assert.equal(points.filter((light) => light.name === 'swap-yard-fill').length, 1,
    'the swap fill is anonymous or missing');
  assert.deepEqual(spots.filter((light) => light.name.startsWith('swap-task-light-'))
    .map((light) => light.name).sort(), ['swap-task-light-car', 'swap-task-light-workbench']);

  for (const name of ['swap-workbench', 'swap-sorting-tarp', 'swap-clean-car-bay',
    'swap-yard-light-pole', 'swap-bollard-left', 'swap-bollard-right']) {
    assert.ok(driving.group.getObjectByName(name), `${name} is missing`);
  }
  assert.ok(driving.colliders.length >= 4, 'the swap-yard obstacles are all walk-through');

  const benchTop = new THREE.Box3()
    .setFromObject(driving.group.getObjectByName('swap-workbench-top')).max.y;
  for (const key of ['aid', 'masks', 'wipe']) {
    const bottom = new THREE.Box3().setFromObject(driving.interactables[key]).min.y;
    assert.ok(Math.abs(bottom - benchTop) <= 0.025,
      `${key} floats ${Math.abs(bottom - benchTop).toFixed(3)} m off the workbench`);
  }

  /* Grid the public walking bounds at half-metre resolution. A target passes
   * only if the player can walk from the authored swap spawn to within normal
   * interaction reach without entering any collider. */
  const STEP = 0.5;
  const RADIUS = 0.3;
  const limits = { minX: 14, maxX: 26, minZ: -659, maxZ: -645 };
  const blocked = (x, z) => driving.colliders.some((solid) => (
    x >= solid.min.x - RADIUS && x <= solid.max.x + RADIUS
    && z >= solid.min.z - RADIUS && z <= solid.max.z + RADIUS
    && solid.max.y >= 0.1
  ));
  const key = (x, z) => `${x.toFixed(1)},${z.toFixed(1)}`;
  const start = [20, -650];
  const queue = [start];
  const visited = new Set([key(...start)]);
  while (queue.length) {
    const [x, z] = queue.shift();
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = x + dx;
      const nz = z + dz;
      const id = key(nx, nz);
      if (nx < limits.minX || nx > limits.maxX || nz < limits.minZ || nz > limits.maxZ
        || visited.has(id) || blocked(nx, nz)) continue;
      visited.add(id);
      queue.push([nx, nz]);
    }
  }
  for (const [name, target] of Object.entries(driving.interactables)) {
    if (name === 'swap') continue;
    const center = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
    const inReach = [...visited].some((cell) => {
      const [x, z] = cell.split(',').map(Number);
      return Math.hypot(x - center.x, z - center.z) <= 2.35;
    });
    assert.equal(inReach, true, `${name} has no collider-clear interaction approach`);
  }
});

test('van interior uses two bounded light pools to reveal its benches and rear doors', () => {
  const van = buildHeistLevel(new THREE.Scene()).phases.van;
  van.group.updateMatrixWorld(true);

  // This scene is a transition, not another outdoor level. Two local pools
  // are the budget: one for the occupied cabin and one for the exit beat.
  const pointLights = [];
  const otherLights = [];
  van.group.traverse((object) => {
    if (object.isPointLight) pointLights.push(object);
    else if (object.isLight) otherLights.push(object);
  });
  assert.deepEqual(pointLights.map((light) => light.name).sort(),
    ['van-dome-task-light', 'van-rear-task-light']);
  assert.equal(otherLights.length, 0, 'van adds another unbudgeted light type');
  assert.ok(pointLights.every((light) => light.distance <= 7));
  assert.ok(pointLights.reduce((sum, light) => sum + light.intensity, 0) <= 5,
    'van local light intensity exceeds its two-pool budget');
  for (const fixture of ['van-dome-fixture', 'van-dome-lens',
    'van-rear-task-fixture', 'van-rear-task-lens']) {
    assert.ok(van.group.getObjectByName(fixture), `${fixture} is missing`);
  }

  const srgbLuma = (mesh) => {
    const hex = mesh.material.color.getHex();
    const r = (hex >> 16 & 0xff) / 255;
    const g = (hex >> 8 & 0xff) / 255;
    const b = (hex & 0xff) / 255;
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  for (const panel of ['van-wall-left', 'van-wall-right', 'van-interior-door']) {
    const mesh = van.group.getObjectByName(panel);
    assert.ok(mesh, `${panel} has no authored readable surface`);
    assert.ok(srgbLuma(mesh) >= 0.28, `${panel} albedo is still effectively black`);
  }
  for (const side of ['left', 'right']) {
    assert.ok(van.group.getObjectByName(`van-bench-${side}`));
    assert.ok(van.group.getObjectByName(`van-bench-cushion-${side}`));
    assert.ok(van.group.getObjectByName(`van-bench-back-${side}`));
  }
  for (const part of ['van-rear-door-panel-left', 'van-rear-door-panel-right',
    'van-rear-door-reflector-left', 'van-rear-door-reflector-right', 'van-aisle-runner']) {
    assert.ok(van.group.getObjectByName(part), `${part} is missing`);
  }

  // Presentation changes cannot move the player, the collision shell, or the
  // soft interaction volumes that make the mask/door sequence reachable.
  assert.deepEqual(van.spawn.toArray(), [0, 1.66, 1.9]);
  assert.deepEqual(Object.fromEntries(Object.entries(van.interactables)
    .map(([key, object]) => [key, object.name])), {
    van: 'van-interior-door', cabin: 'van-cabin', kit: 'van-equipment-case',
  });
  const colliderSignature = van.colliders.map((solid) => (
    `${solid.min.toArray().map((n) => n.toFixed(2)).join(',')}|${solid.max.toArray().map((n) => n.toFixed(2)).join(',')}`
  ));
  assert.deepEqual(colliderSignature, [
    '-1.80,0.00,3.06|1.80,2.80,3.20',
    '-1.80,0.00,-3.20|-1.66,2.80,3.20',
    '1.66,0.00,-3.20|1.80,2.80,3.20',
    '-1.63,0.23,-2.30|-1.01,0.85,2.50',
    '1.01,0.23,-2.30|1.63,0.85,2.50',
  ]);
});

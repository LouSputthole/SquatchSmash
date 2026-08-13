import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import * as combat from '../src/core/combat/index.js';

function collider(id, z0, z1, material = undefined) {
  const box = new THREE.Box3(
    new THREE.Vector3(-1, 0, z0),
    new THREE.Vector3(1, 3, z1),
  );
  box.combatId = id;
  box.name = material === undefined ? 'glass-looking-decoration' : id;
  box.userData = {};
  if (material !== undefined) box.userData.combatMaterial = material;
  return box;
}

function contact(id, distance, exitDistance, material) {
  return {
    id,
    box: { combatId: id },
    distance,
    exitDistance,
    thickness: exitDistance - distance,
    point: new THREE.Vector3(0, 1.5, distance),
    exitPoint: new THREE.Vector3(0, 1.5, exitDistance),
    material,
  };
}

function target(id, point) {
  return {
    id,
    point: point.clone(),
    suppression: new combat.SuppressionModel(),
  };
}

test('AabbCombatSpace returns every contact in travel order with only explicit materials', () => {
  const glass = collider('glass-pane', 2, 2.1, 'glass');
  const wood = collider('wood-panel', 4, 4.25, 'wood_thin');
  const untagged = collider('untagged-decoration', 6, 6.15);
  const space = new combat.AabbCombatSpace({ boxes: [untagged, wood, glass] });

  assert.equal(typeof space.traceAll, 'function',
    'AabbCombatSpace needs a public ordered-contact query');
  const contacts = space.traceAll(
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(0, 1.5, 10),
  );

  assert.deepEqual(contacts.map(({ id }) => id), [
    'glass-pane', 'wood-panel', 'untagged-decoration',
  ]);
  assert.deepEqual(contacts.map(({ material }) => material), [
    'glass', 'wood_thin', null,
  ], 'a collider name must not silently become a penetrable material tag');
  assert.deepEqual(contacts[0].point.toArray(), [0, 1.5, 2]);
  assert.deepEqual(contacts[0].exitPoint.toArray(), [0, 1.5, 2.1]);
  assert.ok(Math.abs(contacts[0].distance - 2) < 1e-12);
  assert.ok(Math.abs(contacts[0].exitDistance - 2.1) < 1e-12);
  assert.ok(Math.abs(contacts[0].thickness - 0.1) < 1e-12);
});

test('resolveMaterialPath spends penetration and energy only on declared penetrable contacts', () => {
  assert.equal(typeof combat.resolveMaterialPath, 'function',
    'the canonical combat barrel needs the material-path resolver');
  const glass = contact('glass-pane', 2, 2.1, 'glass');
  const wood = contact('wood-panel', 4, 4.25, 'wood_thin');

  const glassOnly = combat.resolveMaterialPath([glass], {
    penetration: 1,
    energy: 100,
  });
  const clear = combat.resolveMaterialPath([wood, glass], {
    penetration: 1,
    energy: 100,
  });

  assert.equal(clear.blocked, false);
  assert.equal(clear.blocker, null);
  assert.deepEqual(clear.contacts.map(({ id, penetrated }) => [id, penetrated]), [
    ['glass-pane', true],
    ['wood-panel', true],
  ]);
  assert.ok(clear.remainingPenetration >= 0 && clear.remainingPenetration < 1);
  assert.ok(clear.remainingEnergy > 0 && clear.remainingEnergy < glassOnly.remainingEnergy);
  assert.ok(glassOnly.remainingEnergy < 100,
    'passing through glass did not reduce the round energy');

  const untagged = contact('untagged-decoration', 6, 6.15, null);
  const stopped = combat.resolveMaterialPath([wood, untagged, glass], {
    penetration: 1,
    energy: 100,
  });
  assert.equal(stopped.blocked, true);
  assert.equal(stopped.blocker.id, 'untagged-decoration');
  assert.equal(stopped.contacts.at(-1).penetrated, false);
  assert.deepEqual(stopped.end.toArray(), [0, 1.5, 6]);
});

test('CombatFireControl penetrates a declared contact and scales damage by remaining energy', () => {
  const glass = collider('declared-glass', 3, 3.1, 'glass');
  const actor = new combat.CombatActor({
    id: 'guard-through-glass', faction: combat.FACTIONS.CARTEL, maxHealth: 200,
  });
  const fire = new combat.CombatFireControl({
    random: () => 0,
    space: new combat.AabbCombatSpace({ boxes: [glass] }),
  });
  const aimPoint = new THREE.Vector3(0, 1.5, 10);
  const shot = fire.resolveShot({
    origin: new THREE.Vector3(0, 1.5, 0),
    boreDirection: new THREE.Vector3(0, 0, 1),
    aimPoint,
    target: {
      id: actor.id,
      actor,
      point: aimPoint,
      visible: true,
    },
    attacker: { faction: combat.FACTIONS.CREW },
    playerShot: true,
    accuracy: 1,
    damage: 80,
    penetration: 1,
  });

  assert.equal(shot.fired, true);
  assert.equal(shot.blocked, false);
  assert.equal(shot.hit, true);
  assert.equal(shot.applied, true);
  assert.deepEqual(shot.contacts.map(({ id, material, penetrated }) => (
    [id, material, penetrated]
  )), [['declared-glass', 'glass', true]]);
  assert.deepEqual(shot.end.toArray(), aimPoint.toArray(),
    'a penetrating hit did not finish at the actor');
  assert.ok(shot.damage > 0 && shot.damage < 80,
    'the actor did not receive the round\'s reduced post-penetration energy');
  assert.equal(actor.health, 200 - shot.damage);
});

test('CombatFireControl stops at the first undeclared or nonpenetrable contact', () => {
  const origin = new THREE.Vector3(0, 1.5, 0);
  const aimPoint = new THREE.Vector3(0, 1.5, 10);
  const attacker = { faction: combat.FACTIONS.CREW };
  const resolve = (boxes, id) => {
    const actor = new combat.CombatActor({
      id, faction: combat.FACTIONS.CARTEL, maxHealth: 200,
    });
    const fire = new combat.CombatFireControl({
      random: () => 0,
      space: new combat.AabbCombatSpace({ boxes }),
    });
    return {
      actor,
      shot: fire.resolveShot({
        origin,
        boreDirection: new THREE.Vector3(0, 0, 1),
        aimPoint,
        target: { id, actor, point: aimPoint, visible: true },
        attacker,
        playerShot: true,
        accuracy: 1,
        damage: 80,
        penetration: 1,
      }),
    };
  };

  const untagged = resolve([
    collider('looks-like-glass', 3, 3.1),
  ], 'guard-behind-untagged');
  assert.equal(untagged.shot.blocked, true);
  assert.equal(untagged.shot.blocker.id, 'looks-like-glass');
  assert.deepEqual(untagged.shot.end.toArray(), [0, 1.5, 3]);
  assert.equal(untagged.shot.hit, false);
  assert.equal(untagged.actor.health, 200);

  const concrete = resolve([
    collider('declared-glass', 3, 3.1, 'glass'),
    collider('concrete-wall', 6, 6.4, 'concrete'),
  ], 'guard-behind-concrete');
  assert.equal(concrete.shot.blocked, true);
  assert.equal(concrete.shot.blocker.id, 'concrete-wall');
  assert.deepEqual(concrete.shot.end.toArray(), [0, 1.5, 6],
    'the stopped round did not end at the actual blocker');
  assert.deepEqual(concrete.shot.contacts.map(({ id }) => id), [
    'declared-glass', 'concrete-wall',
  ]);
  assert.equal(concrete.shot.hit, false);
  assert.equal(concrete.actor.health, 200);
});

test('CombatSuppressionField affects only clear close misses on the finite player-shot segment', () => {
  assert.equal(typeof combat.CombatSuppressionField, 'function',
    'the canonical combat barrel needs the player-shot suppression field');
  const field = new combat.CombatSuppressionField({ radius: 1.25, energy: 1 });
  const close = target('close', new THREE.Vector3(0.6, 1.5, 5));
  const wide = target('wide', new THREE.Vector3(1.5, 1.5, 5));
  const beyond = target('beyond', new THREE.Vector3(0.2, 1.5, 12));
  const result = field.applyPlayerShot({
    shot: {
      fired: true,
      hit: false,
      blocked: false,
      origin: new THREE.Vector3(0, 1.5, 0),
      end: new THREE.Vector3(0, 1.5, 10),
    },
    combatants: [wide, beyond, close],
  });

  assert.deepEqual(result.suppressed.map(({ id }) => id), ['close']);
  assert.ok(close.suppression.value > 0);
  assert.equal(wide.suppression.value, 0);
  assert.equal(beyond.suppression.value, 0,
    'the infinite ray, rather than the finite shot segment, suppressed a target');
});

test('CombatSuppressionField never reaches through a blocker or side cover', () => {
  assert.equal(typeof combat.CombatSuppressionField, 'function',
    'the canonical combat barrel needs the player-shot suppression field');
  const sideCover = new THREE.Box3(
    new THREE.Vector3(0.2, 0, 4.7),
    new THREE.Vector3(0.8, 3, 5.3),
  );
  sideCover.combatId = 'side-cover';
  const field = new combat.CombatSuppressionField({
    radius: 1.25,
    energy: 1,
    space: new combat.AabbCombatSpace({ boxes: [sideCover] }),
  });
  const beforeWall = target('before-wall', new THREE.Vector3(0.5, 1.5, 3));
  const beyondWall = target('beyond-wall', new THREE.Vector3(0.3, 1.5, 6));
  const behindSideCover = target('behind-side-cover', new THREE.Vector3(1, 1.5, 5));

  const blocked = field.applyPlayerShot({
    shot: {
      fired: true,
      hit: false,
      blocked: true,
      origin: new THREE.Vector3(0, 1.5, 0),
      end: new THREE.Vector3(0, 1.5, 4),
      blocker: { id: 'front-wall', point: new THREE.Vector3(0, 1.5, 4) },
    },
    combatants: [beyondWall, beforeWall],
  });
  assert.deepEqual(blocked.suppressed.map(({ id }) => id), ['before-wall']);
  assert.equal(beyondWall.suppression.value, 0);

  const clearTrajectory = field.applyPlayerShot({
    shot: {
      fired: true,
      hit: false,
      blocked: false,
      origin: new THREE.Vector3(0, 1.5, 0),
      end: new THREE.Vector3(0, 1.5, 10),
    },
    combatants: [behindSideCover],
  });
  assert.deepEqual(clearTrajectory.suppressed, [],
    'lateral cover did not shield a combatant from near-miss suppression');
  assert.equal(behindSideCover.suppression.value, 0);
});

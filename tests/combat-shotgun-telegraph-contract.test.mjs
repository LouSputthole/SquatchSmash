import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const groundCombat = await import('../src/core/combat/index.js');
const {
  Firearm, WEAPON_CATALOG, WEAPON_IDS, weaponDef,
} = await import('../src/core/weapons/index.js');
const { MansionDamageState } = await import('../src/mansion/siege/state.js');
const { FACTIONS, FactionMatrix } = await import('../src/core/combat/factions.js');
const { ROLES, STAGING } = await import('../src/mansion/siege/waves.js');
const {
  createAttackerPool, ROLE_PLAN,
} = await import('../src/mansion/siege/attackers.js');

function seededRandom(seed = 0x51a7c4) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function runFirearm(firearm, seconds, step = 1 / 60) {
  const events = [];
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    events.push(...firearm.update(step));
  }
  return events;
}

function attackerHarness() {
  const scene = new THREE.Scene();
  const colliders = [];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const matrix = new FactionMatrix();
  const pool = createAttackerPool({ scene, damage, matrix });
  return { scene, colliders, pool };
}

test('CombatProjectilePattern emits seven deterministic normalized pellet rays inside its cone', () => {
  assert.equal(
    typeof groundCombat.CombatProjectilePattern,
    'function',
    'core/combat/index.js must export CombatProjectilePattern',
  );
  const make = () => new groundCombat.CombatProjectilePattern({ random: seededRandom() });
  const input = {
    origin: new THREE.Vector3(2, 1.4, 3),
    direction: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    count: 7,
    spread: 0.11,
    range: 32,
  };
  const first = make().sample(input);
  const second = make().sample(input);

  assert.equal(first.length, 7);
  assert.deepEqual(
    first.map((ray) => ray.direction.toArray()),
    second.map((ray) => ray.direction.toArray()),
    'an injected random source must make the pattern reproducible',
  );
  assert.ok(new Set(first.map((ray) => ray.direction.toArray().join(','))).size > 3,
    'seven pellets collapsed into one ray');
  for (const [index, ray] of first.entries()) {
    assert.equal(ray.index, index);
    assert.notEqual(ray.origin, input.origin, 'the caller lost ownership of its origin');
    assert.ok(ray.origin.distanceTo(input.origin) < 1e-12);
    assert.ok(Math.abs(ray.direction.length() - 1) < 1e-12);
    assert.ok(ray.direction.angleTo(input.direction) <= input.spread + 1e-12,
      `pellet ${index} left the catalog cone`);
    assert.ok(Math.abs(ray.end.distanceTo(ray.origin) - input.range) < 1e-9);
  }
});

test('the canonical shotgun catalog fires seven pellets from one shell', () => {
  assert.equal(WEAPON_IDS.SHOTGUN, 'shotgun');
  assert.equal(WEAPON_CATALOG.shotgun, weaponDef('shotgun'));
  assert.equal(WEAPON_CATALOG.shotgun.kind, 'shotgun');
  assert.equal(WEAPON_CATALOG.shotgun.auto, false);
  assert.equal(WEAPON_CATALOG.shotgun.projectiles, 7);
  assert.ok(WEAPON_CATALOG.shotgun.cycleSeconds > 0);

  const firearm = new Firearm('shotgun');
  const before = firearm.rounds;
  firearm.setTrigger(true);
  const shot = firearm.fire();
  firearm.setTrigger(false);

  assert.equal(shot.fired, true);
  assert.equal(shot.projectiles, 7);
  assert.equal(firearm.rounds, before - 1, 'one trigger consumed more than one shell');
  const cycleEvents = runFirearm(firearm, WEAPON_CATALOG.shotgun.cycleSeconds + 0.5)
    .filter((event) => event.type === 'cycle');
  assert.equal(cycleEvents.length, 1, 'one shell did not produce exactly one pump cycle');
});

test('the Mansion shotgun rusher equips the canonical shotgun', () => {
  assert.equal(ROLE_PLAN.shotgun.weapon, 'shotgun');
});

test('fatal impacts from opposite sides produce mirrored Mansion falls', () => {
  const fatalRoll = (id, originX) => {
    const { scene, pool } = attackerHarness();
    const entry = pool.spawn({ id, role: ROLES.rifle, staging: STAGING.front_steps });
    entry.root.position.set(0, 0, 28);
    entry.root.rotation.y = 0;
    scene.updateMatrixWorld(true);
    const anchor = entry.figure.parts.head;
    const point = anchor.localToWorld(new THREE.Vector3(0, 0.05, 0));
    const origin = new THREE.Vector3(originX, point.y, point.z);
    const direction = point.clone().sub(origin).normalize();
    const [hit] = pool.registerHit({
      object: anchor,
      point,
      normal: direction.clone().negate(),
      origin,
      direction,
      distance: origin.distanceTo(point),
      weapon: 'pistol9',
      damage: 28,
      penetration: 0.16,
    });
    assert.equal(hit.result.fatal, true);
    /* A fatal hit starts a 0.4 s crumple blend now (src/mansion/siege/
     * fallen.js); walk the rig to its rest before reading which way it went. */
    for (let i = 0; i < 36; i++) entry.figure.update(1 / 60);
    return entry.figure.tilt.rotation.z;
  };

  const originalRandom = Math.random;
  Math.random = () => 0.75;
  try {
    const fromLeft = fatalRoll('fall-from-left', -5);
    const fromRight = fatalRoll('fall-from-right', 5);
    assert.ok(fromLeft * fromRight < 0,
      `opposite hit directions produced the same fall (${fromLeft}, ${fromRight})`);
    assert.ok(Math.abs(Math.abs(fromLeft) - Math.abs(fromRight)) < 0.2,
      'the mirrored fall lost its authored weight');
  } finally {
    Math.random = originalRandom;
  }
});

test('Mansion attackers surface shot and reload telegraphs alongside authored barks', () => {
  const { colliders, pool } = attackerHarness();
  const entry = pool.spawn({
    id: 'telegraph-rifle', role: ROLES.rifle, staging: STAGING.front_steps,
  });
  entry.root.position.set(0, 1.2, 40);
  entry.floorY = 1.2;
  entry.path.length = 0;
  entry.root.rotation.y = 0;
  if ('rounds' in entry.weapon) entry.weapon.rounds = 1;
  if ('magazine' in entry.weapon) entry.weapon.magazine = 1;

  const player = {
    position: new THREE.Vector3(0, 1.2, 47),
    actor: new groundCombat.CombatActor({
      id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100,
    }),
  };
  const weaponEvents = [];
  const barks = [];
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    for (let frame = 0; frame < 60 * 10; frame++) {
      entry.root.position.set(0, 1.2, 40);
      entry.path.length = 0;
      pool.update(1 / 60, {
        player,
        colliders,
        alive: [],
        playerDamageScale: 0,
        onWeaponEvent: (event) => weaponEvents.push(event),
        onBark: (event) => barks.push(event),
      });
    }
  } finally {
    Math.random = originalRandom;
  }

  const reloadBark = barks.find((event) => event.key === 'reload');
  assert.ok(reloadBark, 'the existing authored reload bark callback disappeared');
  assert.equal(reloadBark.id, entry.id);
  assert.equal(reloadBark.role, entry.role.id);
  assert.ok(typeof reloadBark.line === 'string' && reloadBark.line.length > 0,
    'the authored reload callback lost its line');

  const shot = weaponEvents.find((event) => event.type === 'shot');
  assert.ok(shot, 'a fired round did not surface an onWeaponEvent shot telegraph');
  assert.equal(shot.id, entry.id);
  assert.equal(shot.weapon, entry.plan.weapon);
  const reload = weaponEvents.find((event) => event.type === 'reload-start');
  assert.ok(reload, 'an empty weapon did not surface an onWeaponEvent reload telegraph');
  assert.equal(reload.id, entry.id);
  assert.equal(reload.weapon, entry.plan.weapon);
});

test('one hostile shotgun trigger resolves seven truthful pellets as one capped hit', () => {
  const { colliders, pool } = attackerHarness();
  const entry = pool.spawn({
    id: 'seven-pellet-rusher', role: ROLES.shotgun, staging: STAGING.front_steps,
  });
  entry.root.position.set(0, 1.2, 40);
  entry.floorY = 1.2;
  entry.path.length = 0;
  entry.root.rotation.y = 0;
  entry.awareness = 1;
  entry.sinceThink = 1;
  entry.plan = { ...entry.plan, accuracy: 1 };

  const player = {
    position: new THREE.Vector3(0, 1.2, 46),
    actor: new groundCombat.CombatActor({
      id: 'shotgun-player', faction: FACTIONS.CREW, maxHealth: 500, armor: 45,
    }),
    suppression: {
      value: 0,
      misses: 0,
      noteNearMiss() { this.misses++; return this.value; },
    },
  };
  const weaponEvents = [];
  const playerHits = [];
  const whizzes = [];
  const fireCues = [];
  const audio = {
    hasSample: () => true,
    play(cue) {
      if (cue === 'heist.bullet.whiz') whizzes.push(cue);
      if (cue === 'weapon.shotgun.fire') fireCues.push(cue);
      return true;
    },
  };
  const beforeRounds = entry.weapon.rounds;
  const originalRandom = Math.random;
  Math.random = seededRandom(0x77aa11);
  try {
    for (let frame = 0; frame < 600 && !weaponEvents.some((event) => event.type === 'shot'); frame++) {
      pool.update(1 / 60, {
        player, colliders, alive: [], audio,
        onPlayerHit: (event) => playerHits.push(event),
        onWeaponEvent: (event) => weaponEvents.push(event),
      });
    }
  } finally {
    Math.random = originalRandom;
  }

  const shot = weaponEvents.find((event) => event.type === 'shot');
  assert.ok(shot, 'the deterministic shotgun never fired');
  assert.equal(entry.weapon.rounds, beforeRounds - 1, 'one trigger spent more than one shell');
  assert.equal(shot.projectiles, 7);
  assert.equal(shot.pellets.length, 7, 'the trigger collapsed seven pellets into one ray');
  assert.deepEqual(shot.pellets.map((pellet) => pellet.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(shot.pellets.every((pellet) => pellet.origin?.isVector3
    && pellet.direction?.isVector3 && pellet.end?.isVector3),
  'a pellet lost its immutable trajectory truth');
  assert.equal(Object.isFrozen(shot.pellets), true);
  assert.ok(shot.pellets.every((pellet) => Object.isFrozen(pellet)
    && Object.isFrozen(pellet.origin) && Object.isFrozen(pellet.direction)
    && Object.isFrozen(pellet.end)),
  'shot event pellet truth is mutable after dispatch');
  assert.equal(playerHits.length, 1, 'pellets emitted more than one aggregate combatant callback');
  assert.ok(playerHits[0].damage + playerHits[0].absorbed
    <= WEAPON_CATALOG.shotgun.triggerDamageCap + 1e-9,
  'one shotgun trigger exceeded the actor damage cap');
  assert.ok(whizzes.length <= 1, 'one shotgun trigger emitted multiple whiz cues');
  assert.equal(fireCues.length, 1, 'one shotgun trigger emitted more than one fire cue');
});

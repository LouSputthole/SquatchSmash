import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { COMBAT_HIT_ZONE_DAMAGE, resolveHitZone } from '../src/core/combat/impact.js';
import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { MuzzleFlashPool } from '../src/core/combat/muzzle-flash.js';
import { TracerPool } from '../src/core/combat/tracers.js';
import { WEAPON_CATALOG, weaponCue } from '../src/core/weapons/catalog.js';
import { WEAPON_SFX, WEAPON_SFX_STANDINS } from '../src/core/weapons/audio.js';
import {
  HEIST_HOSTILE_BURST, HEIST_HOSTILE_WEAPON_ID, HeistCombatAdapter,
} from '../src/heist/combat.js';
import { makePoliceFigure } from '../src/heist/people.js';

/**
 * THE FIREFIGHT HAD NO PRESENTATION.
 *
 * Owner, playtest 2026-08-26, on THE TAKE's street and garage: the police
 * *"die standing up and never really appear to be shooting back."*
 *
 * Falling down was fixed separately (`updatePoliceFigures` in
 * `src/heist/main.js`) and so was the backwards suppression term
 * (`tests/heist-police-suppression.test.mjs`). What was left is everything
 * that makes a gunfight read as a gunfight, and this file holds it:
 *
 *   - a round leaves a MUZZLE and something visible crosses the gap;
 *   - the report is the shared weapon catalog's, not a scene-local sound;
 *   - the trigger is a BURST with a pause, not a metronome;
 *   - a hit MOVES the man it lands on, and
 *   - a headshot is not a leg hit.
 *
 * Every one of those is a shared Module the game already owned. What is tested
 * here is that THE TAKE actually consumes them, that the numbers survive, and
 * that the wiring in `main.js` is the wiring — a shared pool nothing calls is
 * the same bug wearing a nicer coat.
 */

const MAIN_SOURCE = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');
/**
 * The same file with every comment removed.
 *
 * The wiring test below reads source, and this file is full of prose that
 * quotes the very calls it is asserting on — including the ones a regression
 * would most likely COMMENT OUT. Matching the live code only is the whole
 * point: a `// policeMuzzleFlashes.flash(...)` must read as a missing call,
 * not as a passing one.
 */
const MAIN_CODE = MAIN_SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const MANIFEST = JSON.parse(await readFile(
  new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8',
));
/** Every cue name the generated bank actually contains. */
const MANIFEST_CUES = new Set(MANIFEST.sfx.map((entry) => entry.name));

const PISTOL = WEAPON_CATALOG[HEIST_HOSTILE_WEAPON_ID];

/* ------------------------------------------------------------------ *
 * A range: one officer, one player point, and a floor to stand on.
 * ------------------------------------------------------------------ */

function buildRange({ officerZ = 12 } = {}) {
  const world = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 120));
  floor.name = 'range-floor';
  floor.position.y = -0.1;
  world.add(floor);

  const root = new THREE.Group();
  root.name = 'officer-probe';
  root.position.set(0, 0, officerZ);
  const arm = new THREE.Group();
  arm.position.set(0.2, 1.3, 0);
  root.add(arm);
  const gun = new THREE.Group();
  gun.position.set(0, 0, -0.1);
  gun.rotation.x = -Math.PI / 2;
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.12);
  arm.add(gun);
  root.userData.weapon = gun;
  const actor = new CombatActor({
    id: 'officer_probe', faction: FACTIONS.POLICE, maxHealth: 80, armor: 0,
  });
  root.userData.combatActor = actor;
  world.add(root);
  world.updateMatrixWorld(true);
  return { world, officer: { root, actor }, gun };
}

/** A deterministic stream, so a burst measurement is a measurement. */
function seededRandom(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Run one officer against a static player for `seconds`, exactly the way
 * `updatePoliceCombat` does, and report every round he got away.
 */
function holdContact(seconds, { seed = 7, dt = 1 / 60, onShot = null } = {}) {
  const { world, officer } = buildRange();
  const combat = new HeistCombatAdapter({ matrix: new FactionMatrix(), random: seededRandom(seed) });
  combat.setOccluders([world]);
  const playerActor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 0,
  });
  const targetPoint = new THREE.Vector3(0, 1.2, 0);
  const shots = [];
  const frames = Math.round(seconds / dt);
  for (let frame = 0; frame < frames; frame++) {
    combat.update(dt);
    const update = combat.updateHostile(officer, dt, {
      targetPoint,
      targetActor: playerActor,
      accuracy: 0.34,
      damage: 11,
      range: 48,
      cadence: [7.2, 9.9],
      burst: HEIST_HOSTILE_BURST,
    });
    world.updateMatrixWorld(true);
    if (update.shot?.fired) {
      shots.push({ time: frame * dt, shot: update.shot });
      onShot?.(update.shot);
    }
    /* The player is a backstop, not a casualty: this measures the trigger. */
    playerActor.health = playerActor.maxHealth;
    playerActor.incapacitated = false;
  }
  return { combat, officer, shots, world };
}

/** Split a shot list into bursts: anything more than a second apart is a pause. */
function bursts(shots) {
  const out = [];
  for (const record of shots) {
    const last = out.at(-1);
    if (last && record.time - last.at(-1).time < 1) last.push(record);
    else out.push([record]);
  }
  return out;
}

/* ================================================================== */
/* 1. THE TRIGGER                                                      */
/* ================================================================== */

test('police fire in bursts at the gun’s own rate, not on a metronome', () => {
  const { shots } = holdContact(120, { seed: 7 });
  const groups = bursts(shots);
  assert.ok(groups.length >= 6, `only ${groups.length} bursts in two minutes of contact`);

  /* THE REGRESSION. The old trigger drew a new 2.6-4.6 s shot clock after
   * EVERY round, so every burst was exactly one round long. If this ever goes
   * back to that, `lengths` becomes all 1s. */
  const lengths = groups.map((group) => group.length);
  assert.ok(lengths.some((length) => length >= 2),
    `no burst was longer than one round: ${lengths.join(',')}`);
  assert.ok(lengths.every((length) => length <= HEIST_HOSTILE_BURST.max),
    `a burst ran past the authored maximum: ${lengths.join(',')}`);
  /* BurstController alternates deterministically, so both authored lengths
   * really appear — a controller stuck on its minimum is not a burst policy. */
  assert.ok(lengths.includes(HEIST_HOSTILE_BURST.min), `never fired a ${HEIST_HOSTILE_BURST.min}: ${lengths.join(',')}`);
  assert.ok(lengths.includes(HEIST_HOSTILE_BURST.max), `never fired a ${HEIST_HOSTILE_BURST.max}: ${lengths.join(',')}`);

  /* INSIDE a burst the rate is the gun's, not a scene number: 1 / 5.5 rps.
   * A frame of quantisation at 60 Hz is 0.0167 s, so allow two. */
  const cyclic = 1 / PISTOL.rps;
  for (const group of groups) {
    for (let i = 1; i < group.length; i++) {
      const gap = group[i].time - group[i - 1].time;
      assert.ok(Math.abs(gap - cyclic) <= 0.034,
        `a burst round arrived ${gap.toFixed(3)} s after the last, not ${cyclic.toFixed(3)}`);
    }
  }

  /* BETWEEN bursts there is a real silence — the thing a metronome has none
   * of. The authored floor is 7.2 s; the reload can only make one longer. */
  for (let i = 1; i < groups.length; i++) {
    const pause = groups[i][0].time - groups[i - 1].at(-1).time;
    assert.ok(pause >= 7.2 - 0.05, `only ${pause.toFixed(2)} s between bursts`);
  }
});

test('bursting did not quietly make the street twice as lethal', () => {
  /* THE OLD MODEL: one round per shot clock drawn from [2.6, 4.6], mean 3.6 s,
   * = 0.2778 rounds a second per officer. This is a presentation fix, so that
   * number is what the burst trigger has to land on. Four seeds, 300 s of held
   * contact each, magazine reloads included. */
  const measured = [3, 7, 11, 29].map((seed) => holdContact(300, { seed }).shots.length / 300);
  const mean = measured.reduce((sum, rate) => sum + rate, 0) / measured.length;
  assert.ok(Math.abs(mean - 0.2778) <= 0.03,
    `bursts changed the volume of fire: ${mean.toFixed(4)} rounds/s against 0.2778`);
  for (const rate of measured) {
    assert.ok(rate > 0.2 && rate < 0.36, `one seed produced ${rate.toFixed(4)} rounds/s`);
  }
});

/* ================================================================== */
/* 2. WHERE THE ROUND LANDS ON A MAN                                   */
/* ================================================================== */

test('a built officer is tagged head, chest and limb — nothing is anonymous', () => {
  const figure = makePoliceFigure({ name: 'zones', x: 0, z: 0, yaw: 0, index: 0 });
  const parts = figure.parts;
  assert.equal(resolveHitZone(parts.head).zone, 'head');
  assert.equal(resolveHitZone(parts.body).zone, 'chest');
  assert.equal(resolveHitZone(parts.armR).zone, 'limb');
  assert.equal(resolveHitZone(parts.legL).zone, 'limb');
  /* The forearm hangs off the upper arm and the shin off the thigh, so the
   * tag has to be found by walking UP. This is the half a per-mesh tagging
   * pass would have missed. */
  assert.equal(resolveHitZone(parts.foreR).part, 'arm');
  assert.equal(resolveHitZone(parts.shinL).part, 'leg');
  /* The regression that shipped: nothing tagged at all, so every contact on
   * every body in the mission answered `chest`. */
  assert.notEqual(resolveHitZone(parts.head).zone, resolveHitZone(parts.legL).zone);
});

test('a headshot is not a leg hit: the resolved damage differs by the shared table', () => {
  const damageFor = (zone) => {
    const root = new THREE.Group();
    root.name = `zone-${zone}`;
    const part = new THREE.Group();
    part.userData.hitZone = zone;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4));
    part.add(mesh);
    root.add(part);
    root.updateMatrixWorld(true);
    const actor = new CombatActor({
      id: `zone_${zone}`, faction: FACTIONS.POLICE, maxHealth: 400, armor: 0,
    });
    root.userData.combatActor = actor;
    const combat = new HeistCombatAdapter({ matrix: new FactionMatrix(), random: () => 0.5 });
    combat.register(root, { actor: () => actor });
    combat.setOccluders([root]);
    const origin = new THREE.Vector3(0, 0, 4);
    const located = combat.resolvePlayerShot({
      origin,
      direction: new THREE.Vector3(0, 0, -1),
      weapon: 'carbine',
      damage: 42,
      penetration: 0.38,
    }).located;
    return { located, actor };
  };

  const head = damageFor('head');
  const chest = damageFor('chest');
  const limb = damageFor('limb');
  for (const [name, record] of Object.entries({ head, chest, limb })) {
    assert.equal(record.located.applied, true, `the ${name} round never landed`);
    assert.equal(record.located.zone, name === 'limb' ? 'limb' : name);
  }
  /* A head hit is `lethalHeadshots`, so it takes the whole man rather than
   * 2.6 rounds' worth; that is the shared actor's rule and it must survive
   * the zone multiplier being introduced underneath it. */
  assert.equal(head.located.lethal, true, 'a resolved headshot must be lethal');
  assert.equal(head.actor.incapacitated, true);
  assert.equal(chest.located.lethal, false);

  const chestDamage = chest.located.result.damage;
  const limbDamage = limb.located.result.damage;
  assert.ok(limbDamage < chestDamage,
    `a limb hit (${limbDamage}) must be worth less than a chest hit (${chestDamage})`);
  assert.equal(
    Number((limbDamage / chestDamage).toFixed(4)),
    Number(COMBAT_HIT_ZONE_DAMAGE.limb.toFixed(4)),
    'the limb multiplier is not the shared table’s',
  );
});

test('the hit-zone table is one table, shared with the Mansion Siege', async () => {
  const { HIT_ZONES } = await import('../src/mansion/siege/attackers.js');
  assert.equal(HIT_ZONES, COMBAT_HIT_ZONE_DAMAGE,
    'the siege forked the table again instead of importing it');
});

/* ================================================================== */
/* 3. HIT REACTIONS                                                    */
/* ================================================================== */

test('a hit knocks an officer off his weapon for the shared stagger window', () => {
  const { world, officer } = buildRange();
  const combat = new HeistCombatAdapter({ matrix: new FactionMatrix(), random: seededRandom(5) });
  combat.setOccluders([world]);
  const playerActor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 0,
  });
  const targetPoint = new THREE.Vector3(0, 1.2, 0);
  const step = () => combat.updateHostile(officer, 1 / 60, {
    targetPoint, targetActor: playerActor, accuracy: 0.34, damage: 11, range: 48,
    cadence: [7.2, 9.9], burst: HEIST_HOSTILE_BURST,
  });

  /* Settle him onto the target first, so `interrupted` below is the hit and
   * not a man still turning around. */
  for (let frame = 0; frame < 120; frame++) { step(); world.updateMatrixWorld(true); }
  assert.equal(combat.hostileImpairments(officer.actor.id).interrupted, false);
  assert.equal(combat.hostileImpairments(officer.actor.id).reaction, 0);

  /* One chest round from the player. `noteHostileHit` takes the SAME Located
   * record `resolvePlayerShot` produced — nothing here invents a reaction. */
  const applied = combat.noteHostileHit(officer, {
    applied: true, zone: 'chest', part: 'chest', result: { applied: true, damage: 42 },
  });
  assert.equal(applied, true);
  const impairments = combat.hostileImpairments(officer.actor.id);
  assert.equal(impairments.interrupted, true, 'a hit must interrupt him');
  assert.equal(impairments.reaction, 1, 'the knock must start at full size');
  /* CombatImpairments' own authored window; a chest hit is 0.58 s. */
  assert.ok(Math.abs(impairments.stagger - 0.58) < 1e-9);

  /* And he does not shoot back through it. */
  let firedWhileStaggered = 0;
  for (let frame = 0; frame < Math.round(0.58 * 60); frame++) {
    if (step().shot?.fired) firedWhileStaggered++;
    world.updateMatrixWorld(true);
  }
  assert.equal(firedWhileStaggered, 0, 'a staggered officer kept firing');
  assert.equal(combat.hostileImpairments(officer.actor.id).interrupted, false,
    'the stagger must release, or one hit ends the fight');
});

test('a leg hit slows him and an arm hit spoils his aim; a chest hit does neither', () => {
  const wound = (part) => {
    const { world, officer } = buildRange();
    const combat = new HeistCombatAdapter({ matrix: new FactionMatrix(), random: () => 0.5 });
    combat.setOccluders([world]);
    /* One frame builds the runtime. */
    combat.updateHostile(officer, 1 / 60, {
      targetPoint: new THREE.Vector3(0, 1.2, 0),
      targetActor: new CombatActor({ id: 'prospect', faction: FACTIONS.CREW }),
      accuracy: 0.34, damage: 11, range: 48,
    });
    combat.noteHostileHit(officer, {
      applied: true, zone: 'limb', part, result: { applied: true, damage: 42 },
    });
    return combat.hostileImpairments(officer.actor.id);
  };
  const leg = wound('leg');
  const arm = wound('arm');
  assert.ok(leg.speedScale < 1, 'a leg wound must cost him speed');
  assert.equal(leg.accuracyScale, 1, 'a leg wound is not an aim penalty');
  assert.ok(arm.accuracyScale < 1, 'an arm wound must cost him accuracy');
  assert.ok(arm.aimSettleScale < 1, 'an arm wound must slow his settle');
  assert.equal(arm.speedScale, 1, 'an arm wound is not a limp');
});

test('the knock is visible on the rig, and releases exactly back to the pose', () => {
  const figure = makePoliceFigure({ name: 'flinch', x: 0, z: 0, yaw: 0, index: 0 });
  const authored = {
    armR: figure.parts.armR.rotation.clone(),
    armL: figure.parts.armL.rotation.clone(),
    head: figure.parts.head.rotation.clone(),
  };
  const deviation = (live, base) => Math.hypot(
    live.x - base.x, live.y - base.y, live.z - base.z,
  );

  figure.flinch(1);
  const weaponArm = deviation(figure.parts.armR.rotation, authored.armR);
  assert.ok(weaponArm > 0.2, `the knock is invisible: ${weaponArm.toFixed(4)} rad`);
  /* The Mansion Siege's corkscrew guard caps a braced weapon arm at 0.37 rad
   * of total deviation. This rig is posed by the same shared aim Module, so
   * the same ceiling applies — see `tests/mansion-siege-people`. */
  assert.ok(weaponArm <= 0.37, `the knock exceeds the shared arm cap: ${weaponArm.toFixed(4)} rad`);
  assert.ok(deviation(figure.parts.armL.rotation, authored.armL) <= 0.37);
  assert.ok(deviation(figure.parts.head.rotation, authored.head) > 0, 'his head must move too');

  /* IDEMPOTENT. This writes an offset onto an authored pose nothing re-writes
   * per frame, so a second call at the same size must not double it — that is
   * a corkscrewing officer within a couple of seconds of sustained fire. */
  figure.flinch(1);
  assert.ok(Math.abs(deviation(figure.parts.armR.rotation, authored.armR) - weaponArm) < 1e-9,
    'the flinch accumulated instead of tracking');

  /* And it comes all the way back. A knock that leaks leaves an officer
   * permanently out of his aiming pose. */
  figure.flinch(0);
  assert.ok(deviation(figure.parts.armR.rotation, authored.armR) < 1e-9);
  assert.ok(deviation(figure.parts.armL.rotation, authored.armL) < 1e-9);
  assert.ok(deviation(figure.parts.head.rotation, authored.head) < 1e-9);

  /* An authored pose rewrites the joints the offset was riding on, so the
   * tracked amount has to go with them. */
  figure.flinch(1);
  figure.aiming();
  assert.ok(Math.abs(deviation(figure.parts.armR.rotation, authored.armR)) < 1e-9,
    'aiming() did not clear the applied knock');
  figure.flinch(0);
  assert.ok(deviation(figure.parts.armR.rotation, authored.armR) < 1e-9,
    'releasing a cleared knock drove the arm the other way');
});

/* ================================================================== */
/* 4. MUZZLE FLASH AND TRACERS                                         */
/* ================================================================== */

test('a fired round puts a flash on the muzzle and a tracer in the air', () => {
  const scene = new THREE.Group();
  const flashes = new MuzzleFlashPool(scene, { capacity: 6, name: 'probe-flash' });
  const tracers = new TracerPool(scene, 48, { minLength: 1.6 });
  assert.equal(flashes.flashes, 0);
  assert.equal(tracers.fired, 0);

  const emitted = [];
  const { shots } = holdContact(30, {
    seed: 7,
    onShot: (shot) => {
      emitted.push(shot);
      flashes.flash(shot.origin);
      if (shot.tracer) {
        tracers.fire({
          from: shot.origin,
          to: shot.end,
          speed: PISTOL.tracer.speed,
          colour: PISTOL.tracer.colour,
          width: PISTOL.tracer.width * 2.4,
        });
      }
    },
  });
  assert.ok(shots.length >= 3, 'the range produced nothing to present');

  /* THE SHOT CARRIES ITS OWN PRESENTATION TRUTH. Without `weaponId` the scene
   * has to keep a second table of who carries what, and without `tracer` it
   * has to re-derive the catalog's belt interval. */
  for (const shot of emitted) {
    assert.equal(shot.weaponId, HEIST_HOSTILE_WEAPON_ID);
    assert.equal(typeof shot.tracer, 'boolean');
    assert.ok(shot.origin?.isVector3 && shot.end?.isVector3);
  }
  /* The 9 mm is `every: 1` in the catalog, so every round is visible. */
  assert.equal(PISTOL.tracer.every, 1);
  assert.equal(emitted.filter((shot) => shot.tracer).length, emitted.length);

  assert.equal(flashes.flashes, shots.length, 'a round fired with no flash');
  assert.equal(tracers.fired, shots.length, 'a round fired with nothing in the air');

  /* THE FLASH IS ON THE BARREL. `shot.origin` is the bore CombatWeaponAim
   * sampled off the modelled gun, so the flare must land there and not in the
   * middle of the man. */
  const last = emitted.at(-1);
  const slot = flashes.pool.find((entry) => entry.root.visible);
  assert.ok(slot, 'nothing was lit');
  assert.ok(slot.root.position.distanceTo(last.origin) < 1e-6);
  assert.ok(slot.light.intensity > 0);

  /* And it goes out. A flash that never decays is six point lights burning
   * over a street. */
  flashes.update(0.2);
  assert.equal(flashes.pool.every((entry) => entry.root.visible === false), true);
  assert.equal(flashes.pool.every((entry) => entry.light.intensity === 0), true);

  /* Both pools clear at a checkpoint restore, or the retry starts mid-burst. */
  tracers.clear();
  flashes.reset();
  assert.equal(tracers.live, 0);
  assert.equal(flashes.report().active, 0);
});

test('a tracer crosses the gap it was given rather than teleporting', () => {
  const scene = new THREE.Group();
  const tracers = new TracerPool(scene, 8, { minLength: 1.6 });
  const from = new THREE.Vector3(0, 1.35, 24);
  const to = new THREE.Vector3(0, 1.2, 0);
  let arrived = false;
  tracers.fire({
    from, to, speed: PISTOL.tracer.speed, colour: PISTOL.tracer.colour,
    onArrive: () => { arrived = true; },
  });
  assert.equal(tracers.live, 1);
  /* 24 m at the catalog's 520 m/s is 0.046 s: a couple of frames of visible
   * travel at 60 Hz, which is exactly the point — the player can see WHERE it
   * came from. One frame in, it must still be in the air. */
  tracers.update(1 / 60);
  assert.equal(arrived, false, 'the round arrived inside a single frame');
  assert.equal(tracers.live, 1);
  tracers.update(1 / 60);
  tracers.update(1 / 60);
  assert.equal(arrived, true, 'the round never landed');
  assert.equal(tracers.live, 0);
});

/* ================================================================== */
/* 5. THE SOUND IS THE CATALOG'S                                       */
/* ================================================================== */

test('every police weapon cue resolves in the shared bank with a real stand-in', () => {
  for (const slot of ['fire', 'reload.out', 'reload.in', 'empty']) {
    const key = `${HEIST_HOSTILE_WEAPON_ID}.${slot}`;
    const wanted = WEAPON_SFX[key];
    assert.equal(wanted, weaponCue(HEIST_HOSTILE_WEAPON_ID, slot),
      `${key} is not the catalog's own cue name`);
    const standIn = WEAPON_SFX_STANDINS[key];
    assert.ok(standIn, `${key} has no stand-in, so it falls through to the synthesiser`);
    /* A stand-in with no recording is not a stand-in. `tools/check.mjs` makes
     * the same demand of the literal play calls; this makes it of the police
     * specifically, because they are the guns pointed at the player. */
    assert.ok(MANIFEST_CUES.has(standIn),
      `${key}'s stand-in "${standIn}" is not in assets/sfx/manifest.json`);
  }
});

/* ================================================================== */
/* 6. THE WIRING                                                       */
/* ================================================================== */

test('THE TAKE actually consumes the shared pools rather than merely importing them', () => {
  /* A shared Module nothing calls is the same bug in a nicer coat, and
   * `src/heist/main.js` is the only place this wiring exists. */
  assert.match(MAIN_CODE, /import \{ MuzzleFlashPool \} from '\.\.\/core\/combat\/muzzle-flash\.js'/);
  assert.match(MAIN_CODE, /import \{ TracerPool \} from '\.\.\/core\/combat\/tracers\.js'/);
  assert.match(MAIN_CODE, /const tracers = new TracerPool\(scene,/);
  assert.match(MAIN_CODE, /const policeMuzzleFlashes = new MuzzleFlashPool\(scene,/);

  /* Fired, ticked and cleared. All three, or the pool is decoration. */
  assert.match(MAIN_CODE, /policeMuzzleFlashes\.flash\(shot\.origin\)/);
  assert.match(MAIN_CODE, /tracers\.fire\(\{/);
  assert.match(MAIN_CODE, /tracers\.update\(dt\)/);
  assert.match(MAIN_CODE, /policeMuzzleFlashes\.update\(dt\)/);
  assert.match(MAIN_CODE, /tracers\.clear\(\)/);
  assert.match(MAIN_CODE, /policeMuzzleFlashes\.reset\(\)/);

  /* The report comes off the shared gun layer. The old line played
   * `heist.police.gunshot` directly, which made the men shooting at the player
   * the only guns in the game outside the catalog. */
  assert.match(MAIN_CODE, /playWeaponCue\(audio, shot\.weaponId \?\? HEIST_HOSTILE_WEAPON_ID, 'fire'/);
  assert.doesNotMatch(MAIN_CODE, /audio\.play\('heist\.police\.gunshot'/,
    'the police gunshot is being played outside the shared weapon bank again');

  /* The knock reaches the rig, and a hit reaches the shared impairments. */
  assert.match(MAIN_CODE, /combat\.noteHostileHit\(struck, located\)/);
  assert.match(MAIN_CODE, /entry\.figure\.flinch\(/);

  /* And the player's own round is visible for its whole flight. */
  assert.match(MAIN_CODE, /viewModel\.muzzleWorld\?\.\(\)/);
});

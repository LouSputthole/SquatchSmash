import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  WEAPON_CATALOG, WEAPON_CUE_SLOTS, WEAPON_ORDER,
  allWeaponCueNames, weaponCue, weaponDef,
} from '../src/core/weapons/catalog.js';
import { WEAPON_SFX, WEAPON_SFX_STANDINS, playWeaponCue, weaponStandInCueNames } from '../src/core/weapons/audio.js';
import { Firearm, READY, RELOAD_IN, RELOAD_OUT } from '../src/core/weapons/Firearm.js';
import { EjectaPool } from '../src/core/weapons/Ejecta.js';
import { WeaponSystem } from '../src/core/weapons/WeaponSystem.js';
import { TracerPool } from '../src/core/combat/tracers.js';
import { buildWeaponModel } from '../src/core/weapons/models.js';
import { makeHeistCarbine } from '../src/heist/weapons.js';

/* ------------------------------------------------------------------ */
/* The catalog                                                         */
/* ------------------------------------------------------------------ */

test('all six weapons the owner asked for are in the catalog, and they differ', () => {
  assert.deepEqual(
    [...WEAPON_ORDER].sort(),
    ['ak47', 'barrett', 'carbine', 'pistol9', 'revolver', 'saw'],
  );
  for (const id of WEAPON_ORDER) assert.ok(WEAPON_CATALOG[id], `${id} missing`);
  // Six magazine sizes, six rates of fire — not one gun with six models on it.
  const caps = WEAPON_ORDER.map((id) => WEAPON_CATALOG[id].capacity);
  assert.equal(new Set(caps).size, 5, `capacities collapsed: ${caps}`);
  assert.equal(WEAPON_CATALOG.revolver.capacity, 6);
  assert.equal(WEAPON_CATALOG.saw.capacity, 100);
  assert.equal(WEAPON_CATALOG.barrett.capacity, 10);
  // The three the owner called out as automatic weapons are automatic.
  assert.ok(WEAPON_CATALOG.saw.auto && WEAPON_CATALOG.carbine.auto && WEAPON_CATALOG.ak47.auto);
  assert.ok(!WEAPON_CATALOG.revolver.auto && !WEAPON_CATALOG.barrett.auto);
});

test('the revolver keeps its live rounds on a reload and the box guns do not', () => {
  assert.equal(WEAPON_CATALOG.revolver.partialLoss, false);
  assert.equal(WEAPON_CATALOG.revolver.eject, 'cases');
  assert.equal(WEAPON_CATALOG.saw.eject, 'ammobox');
  for (const id of ['pistol9', 'carbine', 'ak47', 'barrett']) {
    assert.equal(WEAPON_CATALOG[id].eject, 'magazine', id);
    assert.equal(WEAPON_CATALOG[id].partialLoss, true, id);
  }
});

/* ------------------------------------------------------------------ */
/* Ammunition and the two-phase reload                                 */
/* ------------------------------------------------------------------ */

/** Run a firearm forward, collecting everything it reports. */
function run(firearm, seconds, step = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += step) events.push(...firearm.update(step));
  return events;
}

test('firing counts rounds down and stops at zero', () => {
  const f = new Firearm('pistol9');
  assert.equal(f.rounds, 15);
  assert.equal(f.reserve, 75);
  for (let i = 0; i < 15; i++) {
    f.setTrigger(true);
    const shot = f.fire();
    assert.equal(shot.fired, true, `shot ${i + 1} refused: ${shot.reason}`);
    f.setTrigger(false);
    run(f, 0.5);
  }
  assert.equal(f.rounds, 0);
  f.setTrigger(true);
  assert.deepEqual(f.fire(), { fired: false, reason: 'empty' });
});

test('an empty gun clicks ONCE per trigger pull, not every frame', () => {
  // The carbine is AUTOMATIC on purpose: the semi-automatic guard would have
  // hidden this on its own, and a SAW that clicks thirteen times a second is
  // exactly the case that has to be held.
  const f = new Firearm('carbine', { rounds: 0 });
  f.setTrigger(true);
  assert.equal(f.fire().reason, 'empty', 'first pull on an empty gun must report empty');
  // Still held: this is the same pull, and it must not click again.
  assert.equal(f.fire().reason, 'clicked');
  assert.equal(f.fire().reason, 'clicked');
  f.setTrigger(false);
  f.setTrigger(true);
  assert.equal(f.fire().reason, 'empty', 'a fresh pull clicks again');
});

test('a semi-automatic will not run away while the trigger is held', () => {
  const f = new Firearm('revolver');
  f.setTrigger(true);
  assert.equal(f.fire().fired, true);
  run(f, 3);
  assert.equal(f.fire().reason, 'semi', 'held trigger fired a second round');
  f.setTrigger(false);
  f.setTrigger(true);
  assert.equal(f.fire().fired, true);
});

test('reloading ejects at the END of the first phase and loads at the end of the second', () => {
  const f = new Firearm('ak47');
  const def = weaponDef('ak47');
  for (let i = 0; i < 4; i++) { f.setTrigger(true); f.fire(); f.setTrigger(false); run(f, 0.2); }
  assert.equal(f.rounds, 26);

  assert.equal(f.reload(), true);
  assert.equal(f.state, RELOAD_OUT);

  // Nothing has left the gun yet, halfway through the first phase.
  let events = run(f, def.reloadOut * 0.5);
  assert.deepEqual(events, []);
  assert.equal(f.rounds, 26, 'rounds vanished before the magazine came out');

  events = run(f, def.reloadOut);
  const eject = events.find((e) => e.type === 'eject');
  assert.ok(eject, 'the magazine never came out');
  assert.equal(eject.rounds, 26, 'the discarded magazine forgot what was in it');
  assert.equal(eject.kind, 'magazine');
  assert.equal(f.state, RELOAD_IN);
  assert.equal(f.rounds, 0, 'the gun is not empty between the two halves of a reload');

  events = run(f, def.reloadIn + 0.1);
  const loaded = events.find((e) => e.type === 'loaded');
  assert.ok(loaded, 'the fresh magazine never went in');
  assert.equal(f.state, READY);
  assert.equal(f.rounds, 30);
  assert.equal(f.reserve, 150 - 30, 'a full magazine cost the wrong number of rounds');
});

test('a revolver dumps its spent cases and keeps its live ones', () => {
  const f = new Firearm('revolver');
  for (let i = 0; i < 2; i++) { f.setTrigger(true); f.fire(); f.setTrigger(false); run(f, 0.6); }
  assert.equal(f.rounds, 4);
  assert.equal(f.reload(), true);
  const events = run(f, 4);
  const eject = events.find((e) => e.type === 'eject');
  assert.equal(eject.kind, 'cases');
  assert.equal(eject.rounds, 2, 'two rounds fired should be two cases on the floor');
  assert.equal(f.rounds, 6);
  assert.equal(f.reserve, 36 - 2, 'the loader took more than the two rounds it replaced');
});

test('a reload refuses when the gun is full or the pockets are empty', () => {
  const full = new Firearm('carbine');
  assert.equal(full.reload(), false, 'reloaded a full magazine');
  const dry = new Firearm('carbine', { rounds: 0, reserve: 0 });
  assert.equal(dry.reload(), false, 'reloaded with nothing to reload from');
  assert.equal(dry.dead, true);
});

test('the last reload takes whatever the reserve has left, not a whole magazine', () => {
  const f = new Firearm('barrett', { rounds: 0, reserve: 3 });
  assert.equal(f.reload(), true);
  run(f, 6);
  assert.equal(f.rounds, 3);
  assert.equal(f.reserve, 0);
});

test('tracer spacing follows the catalog, so a belt is not solid tracer', () => {
  const saw = new Firearm('saw');
  const seen = [];
  for (let i = 0; i < 8; i++) {
    saw.setTrigger(false); saw.setTrigger(true);
    seen.push(saw.fire().tracer);
    run(saw, 0.2);
  }
  assert.deepEqual(seen, [true, false, false, false, true, false, false, false]);
  const revolver = new Firearm('revolver');
  revolver.setTrigger(true);
  assert.equal(revolver.fire().tracer, true, 'every .45 round is a tracer round');
});

test('every shared weapon impact carries its catalog damage through click and held fire', () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 100);
  camera.updateMatrixWorld(true);
  const world = new THREE.Group();
  const target = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  target.position.set(0, 0, -5);
  world.add(target);
  world.updateMatrixWorld(true);

  const impacts = [];
  const weapons = new WeaponSystem({
    camera,
    world,
    hitTargets: [target],
    onImpact: (impact) => impacts.push(impact),
  });
  weapons.equip('saw');

  weapons.triggerPress();
  for (let i = 0; i < 10; i++) weapons.update(1 / 60);
  assert.ok(impacts.length >= 1, 'a deliberate click never reached its target');

  weapons.setTrigger(true);
  for (let i = 0; i < 30; i++) weapons.update(1 / 60);
  weapons.setTrigger(false);
  for (let i = 0; i < 10; i++) weapons.update(1 / 60);
  assert.ok(impacts.length >= 3, `held automatic fire produced only ${impacts.length} impacts`);
  for (const impact of impacts) {
    assert.equal(impact.damage, WEAPON_CATALOG.saw.damage);
    assert.equal(impact.penetration, WEAPON_CATALOG.saw.penetration);
  }
});

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

test('every weapon asks for all five of its cues, and every one has a stand-in', () => {
  const names = allWeaponCueNames();
  assert.equal(names.length, 30, 'six weapons times five slots');
  assert.equal(new Set(names).size, 30);
  for (const id of WEAPON_ORDER) {
    for (const slot of WEAPON_CUE_SLOTS) {
      assert.ok(names.includes(weaponCue(id, slot)), `${id} is missing ${slot}`);
      assert.ok(WEAPON_SFX_STANDINS[`${id}.${slot}`], `${id}.${slot} has no stand-in`);
    }
  }
  assert.equal(Object.keys(WEAPON_SFX).length, 30);
});

test('every stand-in is a cue that is really in the sfx manifest and really has a file', async () => {
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
  const index = JSON.parse(readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
  const declared = new Set(manifest.sfx.map((c) => c.name));
  const files = new Set(index.files);
  for (const cue of weaponStandInCueNames()) {
    assert.ok(declared.has(cue), `stand-in ${cue} is not in assets/sfx/manifest.json`);
    assert.ok(files.has(`${cue}.mp3`), `stand-in ${cue} has no delivered file — it is not a stand-in`);
  }
});

test('all thirty canonical weapon recordings are declared, indexed, hashed, and non-trivial on disk', async () => {
  const { readFileSync, statSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
  const index = JSON.parse(readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
  const declared = new Set(manifest.sfx.map((c) => c.name));
  const files = new Set(index.files);
  const wanted = allWeaponCueNames();
  assert.equal(wanted.length, 30);

  /* Being in the manifest is what puts a cue on the recording sheet, so all
   * thirty belong there from the moment they are authored — that is how they
   * get recorded at all.
   *
   * What marks one as still owed is the FILE, not the manifest row. This test
   * originally asserted manifest-absence and started failing the moment the
   * cues were generated centrally, which would have been read as "drop the
   * stand-in" — and dropping it while no recording exists makes the guns
   * silent, because these names have no procedural fallback in core/audio.js.
   * `playWeaponCue` already gates on `hasSample`, so a delivered file is
   * preferred automatically and nothing has to change when they arrive. */
  for (const cue of wanted) {
    const file = `${cue}.mp3`;
    assert.ok(files.has(file), `${cue} is not indexed`);
    assert.match(index.versions?.[file] ?? '', /^[a-f0-9]{10}$/,
      `${cue} has no content hash in assets/sfx/index.json`);
    assert.ok(statSync(new URL(`../assets/sfx/${file}`, import.meta.url)).size > 1024,
      `${cue} is a trivial or empty recording`);
    assert.ok(declared.has(cue), `${cue} is not in assets/sfx/manifest.json — it will never be recorded`);
  }
  const delivered = wanted.filter((cue) => files.has(`${cue}.mp3`));
  assert.equal(delivered.length, 30, `only ${delivered.length}/30 canonical weapon recordings delivered`);
});

test('playWeaponCue prefers a delivered recording and otherwise plays the stand-in', () => {
  const played = [];
  const fake = {
    delivered: new Set(),
    hasSample(name) { return this.delivered.has(name); },
    play(name, opts) { played.push([name, opts?.rate ?? 1]); },
  };
  playWeaponCue(fake, 'saw', 'fire', { volume: 0.7 });
  assert.equal(played[0][0], 'heist.police.gunshot');

  fake.delivered.add('weapon.saw.fire');
  playWeaponCue(fake, 'saw', 'fire', { volume: 0.7 });
  assert.equal(played[1][0], 'weapon.saw.fire', 'the real recording was ignored once it landed');

  // Once AudioEngine reports the delivered bank decoded, every slot must use
  // its canonical recording rather than silently routing to a legacy cue.
  fake.delivered = new Set(allWeaponCueNames());
  for (const id of WEAPON_ORDER) {
    for (const slot of WEAPON_CUE_SLOTS) {
      const before = played.length;
      assert.equal(playWeaponCue(fake, id, slot), true, `${id}.${slot} played nothing`);
      assert.equal(played.length, before + 1, `${id}.${slot} emitted the wrong number of cues`);
      assert.equal(played.at(-1)[0], weaponCue(id, slot), `${id}.${slot} used its legacy stand-in`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

test('all six models build, point down -Z, and carry the shared userData', () => {
  for (const id of WEAPON_ORDER) {
    const gun = buildWeaponModel(id);
    let meshes = 0;
    gun.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes >= 24, `${id} is only ${meshes} meshes`);
    assert.ok(gun.userData.muzzle instanceof THREE.Vector3, `${id} has no muzzle`);
    assert.ok(gun.userData.muzzle.z < 0, `${id}'s muzzle is not down -Z`);
    assert.ok(gun.userData.ejectPort instanceof THREE.Vector3, `${id} has no ejection port`);
    assert.equal(typeof gun.userData.makeCase, 'function', `${id} cannot make a case`);
    assert.ok(gun.userData.length > 0.1, `${id} has no length for rack spacing`);
  }
});

test('every magazine-fed weapon has a REAL magazine object fitted, and can build another', () => {
  for (const id of ['pistol9', 'carbine', 'ak47', 'saw', 'barrett']) {
    const gun = buildWeaponModel(id);
    const mag = gun.userData.magazine;
    assert.ok(mag, `${id} has no fitted magazine`);
    assert.equal(mag.parent, gun, `${id}'s magazine is not on the gun`);
    let magMeshes = 0;
    mag.traverse((o) => { if (o.isMesh) magMeshes++; });
    assert.ok(magMeshes >= 3, `${id}'s magazine is ${magMeshes} meshes — that is a slab, not a magazine`);
    assert.ok(gun.userData.magazineRest, `${id} cannot seat a fresh magazine`);
    const fresh = gun.userData.makeMagazine();
    assert.ok(fresh && fresh !== mag, `${id} cannot build a replacement magazine`);
  }
  // And the revolver deliberately has none.
  const revolver = buildWeaponModel('revolver');
  assert.equal(revolver.userData.magazine, null);
  assert.equal(revolver.userData.makeMagazine(), null);
});

test('lifting the carbine into core did not change THE TAKE’s carbine', () => {
  const lifted = buildWeaponModel('carbine');
  const heist = makeHeistCarbine({ sling: true });
  const names = (o) => { const out = []; o.traverse((c) => { if (c.name) out.push(c.name); }); return out.sort(); };
  assert.deepEqual(names(heist), names(lifted));
  for (const part of [
    'carbine-barrel', 'carbine-flash-hider', 'carbine-magazine', 'carbine-grip',
    'carbine-stock', 'carbine-buffer-tube', 'carbine-sling',
  ]) {
    assert.ok(heist.getObjectByName(part), `THE TAKE lost ${part} in the lift`);
  }
  assert.ok(heist.userData.muzzle.equals(new THREE.Vector3(0, 0.028, -0.43)));
});

test('the new three are recognisably what they are', () => {
  const saw = buildWeaponModel('saw');
  assert.ok(saw.getObjectByName('saw-bipod'), 'the SAW has no bipod');
  assert.ok(saw.getObjectByName('saw-ammo-box'), 'the SAW has no box magazine');
  assert.ok(saw.getObjectByName('saw-belt') || saw.getObjectByName('saw-feed-cover'), 'the SAW is not belt fed');

  const barrett = buildWeaponModel('barrett');
  assert.ok(barrett.getObjectByName('barrett-brake'), 'no muzzle brake');
  assert.ok(barrett.getObjectByName('barrett-scope-tube'), 'no scope');
  assert.ok(barrett.getObjectByName('barrett-bolt-handle'), 'no bolt');
  assert.ok(barrett.userData.length > 1.2, 'the Barrett is not long');

  const ak = buildWeaponModel('ak47');
  assert.ok(ak.getObjectByName('ak-gas-tube'), 'no gas tube');
  assert.ok(ak.getObjectByName('ak-safety-lever'), 'no safety lever');
  const mag = ak.getObjectByName('ak-magazine');
  const box3 = new THREE.Box3().setFromObject(mag);
  assert.ok(box3.max.z - box3.min.z > 0.07, 'the AK magazine is not curved');
});

/* ------------------------------------------------------------------ */
/* Ejecta and tracers                                                  */
/* ------------------------------------------------------------------ */

test('a dropped magazine really falls, lands where the floor is, and settles', () => {
  const root = new THREE.Group();
  const pool = new EjectaPool(root, { groundAt: () => -2.8 });
  const gun = buildWeaponModel('carbine');
  const mag = gun.userData.magazine;
  let landedAt = null;
  pool.drop(mag, {
    position: new THREE.Vector3(0, -1.4, 55),
    velocity: new THREE.Vector3(0, -0.4, 0.2),
    onLand: () => { landedAt = mag.position.y; },
  });
  assert.equal(mag.parent, root, 'the magazine never left the gun');
  assert.equal(pool.dropped, 1);
  const startY = mag.position.y;
  for (let i = 0; i < 240; i++) pool.update(1 / 60);
  assert.ok(mag.position.y < startY, 'the magazine did not fall');
  assert.ok(landedAt !== null, 'the magazine never landed');
  assert.equal(pool.landed, 1);
  assert.equal(pool.resting, 1);
  assert.ok(Math.abs(mag.position.y - (-2.8)) < 0.12, `settled at ${mag.position.y}, not the floor`);
});

test('the ejecta pool is capped, so a hundred reloads do not carpet the room', () => {
  const root = new THREE.Group();
  const pool = new EjectaPool(root, { capacity: 6 });
  for (let i = 0; i < 40; i++) {
    pool.drop(new THREE.Group(), {
      position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(0, 0, 0),
    });
  }
  assert.equal(pool.pieces.length, 6);
  assert.equal(root.children.length, 6);
  assert.equal(pool.dropped, 40);
});

test('every round in the air is one draw call, whichever scene it is fired in', () => {
  const root = new THREE.Group();
  const pool = new TracerPool(root, 32);
  assert.equal(root.children.length, 1);
  assert.equal(pool.mesh.isInstancedMesh, true);
  let arrived = 0;
  for (let i = 0; i < 20; i++) {
    pool.fire({
      from: new THREE.Vector3(0, 1, 0),
      to: new THREE.Vector3(0, 1, 20),
      speed: 600,
      onArrive: () => { arrived++; },
    });
  }
  assert.equal(pool.live, 20);
  assert.equal(pool.fired, 20);
  assert.equal(root.children.length, 1, 'a tracer minted a mesh of its own');
  for (let i = 0; i < 30; i++) pool.update(1 / 60);
  assert.equal(pool.live, 0);
  assert.equal(arrived, 20);
});

test('the Enola Squatch still imports the same TracerPool it always did', async () => {
  const raid = await import('../src/enolasquatch/combat/Tracers.js');
  assert.equal(raid.TracerPool, TracerPool);
});

/* ------------------------------------------------------------------ */
/* The standing rule                                                   */
/* ------------------------------------------------------------------ */

test('the shared weapon system knows nothing about people, so nobody can be targeted by it', async () => {
  /* Standing rule, carried in docs/CONTINUATION-2026-08-03.md: Snow never
   * enters player-hostile targeting or damage logic. The only way a SHARED
   * module can keep that promise for every scene that mounts it — including
   * scenes not written yet — is by having no roster at all. A round produces
   * a tracer, a noise and an impact point on world geometry; whether it hurts
   * anybody is decided by the scene, with its own cast in front of it.
   *
   * So this asserts the absence, and it will fail the day somebody imports a
   * character list or applies damage in here. That failure is the point. */
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../src/core/weapons/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 8, `only ${files.length} weapon modules found`);
  for (const file of files) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(
        !/characters|actors|factions|person|npc|roster|cast/i.test(spec),
        `${file} imports ${spec} — the weapon system must not know who anybody is`,
      );
    }
    // No health arithmetic anywhere in the module either.
    assert.ok(!/\.(hp|health)\s*(-|\+)?=/.test(src), `${file} applies damage to something`);
    assert.ok(!/\bkill\(|\bwound\(|\bapplyDamage\(/.test(src), `${file} resolves a hit on an actor`);
  }
});

test('a weapon definition carries damage as data for a scene to use, not to apply', () => {
  // The numbers exist — THE TAKE will want them — but nothing in this module
  // subtracts them from anybody.
  for (const id of WEAPON_ORDER) {
    assert.equal(typeof WEAPON_CATALOG[id].damage, 'number');
    assert.equal(typeof WEAPON_CATALOG[id].penetration, 'number');
  }
});

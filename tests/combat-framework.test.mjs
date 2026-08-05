/**
 * The combat framework's foundation: damage, vitals, armor, materials,
 * weapons-as-data, the shotgun's shell-by-shell reload, and the exploits
 * the owner listed by name — none of which may work.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPON_CATALOG, COMBAT_WEAPON_ORDER, WEAPON_ORDER } from '../src/core/weapons/catalog.js';
import { Firearm, SHELL_LOAD, SHELL_START } from '../src/core/weapons/Firearm.js';
import { resolveHit, falloffScale } from '../src/core/combat/damage.js';
import { Vitals } from '../src/core/combat/vitals.js';
import { penetrate, MATERIAL_PROFILES } from '../src/core/combat/materials.js';
import { HIT_REGIONS, REGION_NAMES } from '../src/core/combat/hit-regions.js';
import { NPC_ARCHETYPES, customArchetype } from '../src/core/combat/archetypes.js';
import { RecoilController, stanceSpreadScale } from '../src/core/combat/recoil.js';
import { DIFFICULTY_PROFILES } from '../src/core/combat/config.js';
import { CombatLog } from '../src/core/combat/log.js';

const flat = () => 0.5;

function run(firearm, seconds, step = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += step) events.push(...firearm.update(step));
  return events;
}

/* ------------------------------------------------------------------ */
/* The catalog carries the combat data                                  */
/* ------------------------------------------------------------------ */

test('every combat weapon carries a full combat block, and the rack six are untouched', () => {
  assert.equal(COMBAT_WEAPON_ORDER.length, 9);
  assert.deepEqual(COMBAT_WEAPON_ORDER.slice(0, 6), [...WEAPON_ORDER]);
  for (const id of COMBAT_WEAPON_ORDER) {
    const def = WEAPON_CATALOG[id];
    assert.ok(def, `${id} missing from catalog`);
    const c = def.combat;
    assert.ok(c.headshot >= 1.5, `${id} has no meaningful headshot multiplier`);
    assert.ok(c.falloff.end > c.falloff.start, `${id} falloff is inside out`);
    assert.ok(c.falloff.floor > 0 && c.falloff.floor <= 1, `${id} falloff floor`);
    assert.ok(c.recoil.pitch > 0, `${id} has no recoil profile`);
    assert.ok(c.recoil.recovery > 0, `${id} recoil never recovers`);
    assert.ok(c.ads.zoom >= 1, `${id} ads zoom`);
    assert.ok(c.noise > 0, `${id} makes no noise`);
    assert.ok(c.npc.burst.min >= 1, `${id} NPC burst`);
  }
  // The categories the owner asked for, at minimum one each.
  const kinds = new Set(COMBAT_WEAPON_ORDER.map((id) => WEAPON_CATALOG[id].kind));
  for (const kind of ['revolver', 'pistol', 'rifle', 'smg', 'shotgun', 'lmg', 'sniper']) {
    assert.ok(kinds.has(kind), `no ${kind} in the combat catalog`);
  }
  // The shotgun is a shotgun.
  assert.equal(WEAPON_CATALOG.pump12.combat.pellets, 8);
  assert.equal(WEAPON_CATALOG.pump12.loadStyle, 'shells');
});

test('recoil profiles differ by class the way the spec reads', () => {
  const c = (id) => WEAPON_CATALOG[id].combat.recoil;
  // Pistols: sharp kick, quick recovery.
  assert.ok(c('revolver').pitch > c('smg9').pitch * 3);
  assert.ok(c('pistol9').recovery > c('saw').recovery);
  // SMG: mild kick but growing spread (climb over 1.2).
  assert.ok(c('smg9').pitch < 0.01 && c('smg9').climb > 1.2);
  // The SAW settles during sustained fire: climb under 1.
  assert.ok(c('saw').climb < 1);
  // Shotgun: heavy impulse, slower recovery than the pistols.
  assert.ok(c('pump12').pitch > 0.04 && c('pump12').recovery < c('pistol9').recovery);
});

/* ------------------------------------------------------------------ */
/* Damage resolution                                                    */
/* ------------------------------------------------------------------ */

test('falloff leaves full damage inside start, the floor past end, a slope between', () => {
  const f = { start: 20, end: 60, floor: 0.5 };
  assert.equal(falloffScale(f, 5), 1);
  assert.equal(falloffScale(f, 20), 1);
  assert.equal(falloffScale(f, 60), 0.5);
  assert.equal(falloffScale(f, 200), 0.5);
  const mid = falloffScale(f, 40);
  assert.ok(mid > 0.5 && mid < 1);
});

test('every hit region resolves, and limbs hurt less than the chest', () => {
  for (const region of REGION_NAMES) {
    const r = resolveHit({ weapon: WEAPON_CATALOG.ak47, distance: 10, region, rng: flat });
    assert.ok(r.damage > 0, `${region} did no damage`);
  }
  const chest = resolveHit({ weapon: WEAPON_CATALOG.ak47, distance: 10, region: 'upperTorso', rng: flat });
  const arm = resolveHit({ weapon: WEAPON_CATALOG.ak47, distance: 10, region: 'armL', rng: flat });
  const head = resolveHit({ weapon: WEAPON_CATALOG.ak47, distance: 10, region: 'head', rng: flat });
  assert.ok(arm.damage < chest.damage);
  assert.ok(head.damage > chest.damage * 2, 'a headshot must be decisive');
});

test('an unarmored ordinary NPC dies to one rifle headshot; helmets change the story', () => {
  const goon = new Vitals({ maxHealth: NPC_ARCHETYPES.rifleman.health, rng: flat });
  const hit = goon.applyHit({ weapon: WEAPON_CATALOG.ak47, distance: 8, region: 'head' });
  assert.equal(hit.fatal, true);
  assert.equal(hit.headshotDamage, true);
  assert.equal(goon.dead, true);

  // The armored heavy's helmet SAVES the first pistol headshot…
  const heavy = new Vitals({
    maxHealth: NPC_ARCHETYPES.armored.health,
    vest: NPC_ARCHETYPES.armored.vest,
    helmet: NPC_ARCHETYPES.armored.helmet,
    rng: flat,
  });
  const first = heavy.applyHit({ weapon: WEAPON_CATALOG.pistol9, distance: 6, region: 'head' });
  assert.equal(first.headHit, true, 'the head hitbox was struck');
  assert.equal(first.headshotDamage, false, 'but headshot damage was NOT applied');
  assert.equal(first.helmetSaved, true, 'the helmet absorbed the round');
  assert.equal(first.fatal, false);
  assert.equal(first.helmetKnockedOff, true, 'and it came off doing it');
  // …and the follow-up is a real headshot: the four facts stay distinct.
  const second = heavy.applyHit({ weapon: WEAPON_CATALOG.pistol9, distance: 6, region: 'head' });
  assert.equal(second.helmetSaved, false);
  assert.equal(second.headshotDamage, true);
  assert.ok(second.damage > first.damage * 4);
});

test('a vest absorbs chest hits, is spent doing it, and covers no limbs', () => {
  const v = new Vitals({ maxHealth: 100, vest: 60, rng: flat });
  const chest = v.applyHit({ weapon: WEAPON_CATALOG.pistol9, distance: 5, region: 'upperTorso' });
  assert.ok(chest.vestSpent > 0);
  assert.ok(v.vest < 60);
  const before = v.vest;
  const leg = v.applyHit({ weapon: WEAPON_CATALOG.pistol9, distance: 5, region: 'legL' });
  assert.equal(leg.vestSpent, 0, 'a leg hit must not touch the vest');
  assert.equal(v.vest, before);
});

test('vitals: invulnerability, god mode, healing, regen ceiling, protected core', () => {
  const v = new Vitals({ maxHealth: 100, spawnInvuln: 2, rng: flat });
  assert.equal(v.applyHit({ weapon: WEAPON_CATALOG.ak47, distance: 5 }).applied, false);
  v.update(2.1);
  assert.equal(v.applyHit({ weapon: WEAPON_CATALOG.ak47, distance: 5 }).applied, true);

  v.godMode = true;
  const hp = v.health;
  assert.equal(v.applyHit({ weapon: WEAPON_CATALOG.barrett, distance: 5 }).applied, false);
  assert.equal(v.health, hp);
  v.godMode = false;

  const partial = new Vitals({
    maxHealth: 100, rng: flat,
    regen: { mode: 'partial', ceiling: 0.4, delay: 1, rate: 50 },
  });
  partial.applyRaw(90);
  for (let i = 0; i < 300; i++) partial.update(1 / 30);
  assert.ok(Math.abs(partial.health - 40) < 1, `partial regen stopped at ${partial.health}, not 40`);
  assert.equal(partial.heal(100), 60, 'a pickup heals past the regen ceiling');

  const core = new Vitals({ maxHealth: 50, protectedCore: true, rng: flat });
  const wouldKill = core.applyHit({ weapon: WEAPON_CATALOG.barrett, distance: 5, region: 'head' });
  assert.equal(wouldKill.fatal, true);
  assert.equal(core.dead, false, 'a protected core never quietly dies');
  assert.equal(core.health, 1);
});

test('checkpoint snapshot restores health, armor and death honestly', () => {
  const v = new Vitals({ maxHealth: 100, vest: 40, rng: flat });
  v.applyHit({ weapon: WEAPON_CATALOG.ak47, distance: 10, region: 'upperTorso' });
  const snap = v.snapshot();
  v.applyRaw(500);
  assert.equal(v.dead, true);
  v.restore(snap, { invuln: 1.5 });
  assert.equal(v.dead, false);
  assert.equal(v.health, snap.health);
  assert.ok(v.invuln > 0, 'a restore grants spawn protection');
});

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

test('rounds pass drywall and glass, never brick or concrete, and lose damage doing it', () => {
  assert.equal(penetrate('drywall', 0.02, 0.4).through, true);
  assert.equal(penetrate('glass', 0.01, 0.2).through, true);
  assert.equal(penetrate('brick', 0.2, 1).through, false);
  assert.equal(penetrate('concrete', 0.3, 1).through, false);
  const wall = penetrate('drywall', 0.02, 0.4);
  assert.ok(wall.keep < 1 && wall.keep > 0);
  // A budget already spent stops even paper.
  assert.equal(penetrate('drywall', 0.1, 0.1).through, false);
  // Every profile names its effects so sound and dust can never disagree.
  for (const [name, p] of Object.entries(MATERIAL_PROFILES)) {
    assert.ok(p.cue, `${name} has no impact cue`);
    assert.ok(p.particle, `${name} has no particle`);
  }
});

/* ------------------------------------------------------------------ */
/* The shotgun's reload, and the exploits                               */
/* ------------------------------------------------------------------ */

test('the pump gun loads one shell at a time and an interruption keeps every shell', () => {
  const f = new Firearm('pump12', { rounds: 0 });
  assert.equal(f.reload(), true);
  assert.equal(f.state, SHELL_START);
  let events = run(f, 0.5);
  assert.equal(f.state, SHELL_LOAD);
  events = run(f, 0.65);
  assert.equal(events.filter((e) => e.type === 'shell').length, 1);
  assert.equal(f.rounds, 1);
  events = run(f, 1.25);
  assert.equal(f.rounds, 3);
  // Interrupt between shells: everything seated stays seated.
  f.cancelReload();
  assert.equal(f.state, 'ready');
  assert.equal(f.rounds, 3);
  assert.equal(f.reserve, 42 - 3);
  // Firing works immediately after the interruption.
  f.setTrigger(true);
  assert.equal(f.fire().fired, true);
});

test('a full shell reload announces completion and never overfills', () => {
  const f = new Firearm('pump12', { rounds: 5 });
  f.reload();
  const events = run(f, 6);
  const loaded = events.find((e) => e.type === 'loaded');
  assert.ok(loaded);
  assert.equal(loaded.loaded, 2);
  assert.equal(f.rounds, 7);
});

test('an empty reload costs more than a tactical one, per the catalog', () => {
  const def = WEAPON_CATALOG.pistol9;
  const tactical = new Firearm('pistol9', { rounds: 5 });
  tactical.reload();
  const tacticalEvents = run(tactical, def.reloadOut + def.reloadIn + 0.05);
  assert.ok(tacticalEvents.find((e) => e.type === 'loaded'), 'tactical reload finished on time');

  const empty = new Firearm('pistol9', { rounds: 0 });
  empty.reload();
  const atTacticalTime = run(empty, def.reloadOut + def.reloadIn + 0.05);
  assert.ok(!atTacticalTime.find((e) => e.type === 'loaded'),
    'an empty reload must still be chambering when the tactical one is done');
  const later = run(empty, def.combat.emptyExtra + 0.1);
  assert.ok(later.find((e) => e.type === 'loaded'));
});

test('the owner\'s exploit list stays dead: no negative ammo, no reload-while-firing, no double dip', () => {
  const f = new Firearm('smg9', { rounds: 1, reserve: 0 });
  f.setTrigger(true);
  f.fire();
  run(f, 0.2);
  assert.equal(f.fire().reason, 'empty');
  assert.equal(f.rounds, 0);
  assert.ok(f.rounds >= 0 && f.reserve >= 0, 'ammo went negative');
  assert.equal(f.reload(), false, 'reloaded from an empty reserve');

  const g = new Firearm('smg9', { rounds: 10 });
  g.reload();
  assert.equal(g.reload(), false, 'started a second reload inside the first');
  assert.equal(g.fire().reason, 'reloading', 'fired mid-reload');
  // Cancelling after the magazine has gone leaves a genuinely empty gun.
  run(g, WEAPON_CATALOG.smg9.reloadOut + 0.05);
  g.cancelReload();
  assert.equal(g.rounds, 0, 'cancelling a reload after ejection refunded a magazine');
});

/* ------------------------------------------------------------------ */
/* Recoil and stance accuracy                                           */
/* ------------------------------------------------------------------ */

test('recoil climbs through a burst, recovers when the trigger rests, and is learnable', () => {
  const r = new RecoilController({ rng: flat });
  const profile = WEAPON_CATALOG.ak47.combat.recoil;
  const first = r.kick(profile);
  const kicks = [first.pitch];
  for (let i = 0; i < 5; i++) { r.update(0.08, profile); kicks.push(r.kick(profile).pitch); }
  assert.ok(kicks[0] > kicks[1], 'first shot kicks hardest (firstShot multiplier)');
  assert.ok(kicks[5] > kicks[1], 'sustained fire climbs');
  const owed = r.pendingPitch;
  for (let i = 0; i < 60; i++) r.update(1 / 30, profile);
  assert.ok(r.pendingPitch < owed * 0.05, 'recovery returns the camera');
  // Horizontal drift alternates rather than yanking one way.
  const r2 = new RecoilController({ rng: flat });
  const y1 = r2.kick(profile).yaw;
  const y2 = r2.kick(profile).yaw;
  assert.ok(Math.sign(y1) !== Math.sign(y2), 'yaw variation must alternate');
});

test('stance changes the one spread number both player and NPC use', () => {
  const w = WEAPON_CATALOG.carbine;
  const standing = stanceSpreadScale({ weapon: w });
  const crouched = stanceSpreadScale({ weapon: w, crouched: true });
  const moving = stanceSpreadScale({ weapon: w, moving: true });
  const airborne = stanceSpreadScale({ weapon: w, airborne: true });
  const suppressed = stanceSpreadScale({ weapon: w, suppression: 1 });
  assert.ok(crouched < standing);
  assert.ok(moving > standing);
  assert.ok(airborne > moving);
  assert.ok(suppressed > standing);
});

/* ------------------------------------------------------------------ */
/* Difficulty and archetypes                                            */
/* ------------------------------------------------------------------ */

test('difficulty never touches NPC health — it touches everything else', () => {
  for (const [name, p] of Object.entries(DIFFICULTY_PROFILES)) {
    assert.equal(p.npcHealthScale, undefined, `${name} scales NPC health`);
  }
  assert.ok(DIFFICULTY_PROFILES.hard.npcReactionScale < 1);
  assert.ok(DIFFICULTY_PROFILES.easy.npcAccuracyScale > 1);
  assert.ok(DIFFICULTY_PROFILES.hard.ammoScale < 1);
});

test('no archetype is a bullet sponge, and the heavy is hard because of plate', () => {
  for (const [name, a] of Object.entries(NPC_ARCHETYPES)) {
    assert.ok(a.health <= 120, `${name} has ${a.health} health — that is a sponge`);
  }
  const heavy = NPC_ARCHETYPES.armored;
  assert.ok(heavy.vest >= 100 && heavy.helmet >= 40);
  assert.ok(heavy.morale.fightToDeath);
  const custom = customArchetype('rifleman', { weapon: 'pump12', skill: { reaction: 0.3 } });
  assert.equal(custom.weapon, 'pump12');
  assert.equal(custom.skill.reaction, 0.3);
  assert.equal(custom.skill.spread, NPC_ARCHETYPES.rifleman.skill.spread, 'unset skill fields survive');
});

/* ------------------------------------------------------------------ */
/* The log                                                              */
/* ------------------------------------------------------------------ */

test('the combat log reads like a sentence and counts what matters', () => {
  const log = new CombatLog({ enabled: true });
  log.hit({
    shooter: 'player', weapon: 'ak47', target: 'goon-1', region: 'head',
    raw: 110.4, damage: 110.4, armorSpent: 0, distance: 12.3,
    fatal: true, headshot: true,
  });
  const line = log.tail(1)[0];
  for (const want of ['player', 'goon-1', 'ak47', 'head', 'HEADSHOT', 'FATAL', '12.3m']) {
    assert.ok(line.includes(want), `log line missing ${want}: ${line}`);
  }
  assert.equal(log.counts.kills, 1);
  assert.equal(log.counts.headshots, 1);
});

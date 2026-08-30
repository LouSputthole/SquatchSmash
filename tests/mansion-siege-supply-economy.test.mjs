/**
 * MANSION UNDER SIEGE -- the supply economy, pinned to the fight it has to pay for.
 *
 * WHY THIS FILE EXISTS. On 2026-08-24 the owner reported the siege running dry
 * upstairs: "In the siege we should have backup ammo up top plus more health."
 * What he was hitting was one `CombatSupplyState` with two triage and two
 * resupply charges shared by every visible supply surface in the house, so the
 * two ammunition caches on the gallery were two doors onto one two-use pool,
 * and the whole ground-floor leg from the basement armory to the balcony had
 * nothing on it at all.
 *
 * The numbers that fixed it live in `src/mansion/siege/main.js` as
 * `SIEGE_SUPPLY_CACHES` and `SIEGE_SUPPLY_FLOORS`. That file is a browser
 * composition root -- it touches `document` at module scope -- so it cannot be
 * imported here, and reading the two literals out of its source is the same
 * thing a dozen other tests in this directory already do to it. Everything the
 * literals are then measured AGAINST is imported for real: the roles and the
 * wave tables from ./waves.js, the damage model from src/core/combat/actors.js,
 * the weapon numbers from the catalog, and the station model from
 * src/core/combat/supplies.js. So a change to how armour absorbs, or to what an
 * AK does, or to how many men come up the drive, moves this test's demand side
 * on its own, and a quiet halving of the supply side fails against it.
 *
 * THE ONE THING THIS FILE IS FOR: the supply must stay sized to the fight. Not
 * "the numbers are still 3 and 2 and 4" -- that is a change detector and it
 * teaches nobody anything. Every assertion below is supply-versus-demand, so
 * adding six more men to wave two fails it just as loudly as taking two
 * charges off the firing step.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { CombatSupplyState } from '../src/core/combat/supplies.js';
import { WEAPON_CATALOG, WEAPON_IDS } from '../src/core/weapons/catalog.js';
import { Firearm } from '../src/core/weapons/Firearm.js';
import {
  ENCOUNTERS, ROLES, WAVES, totalAttackers,
} from '../src/mansion/siege/waves.js';
import { B, CHECKPOINTS, CHECKPOINT_FIELDS } from '../src/mansion/siege/mission.js';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const SIEGE_MAIN = read('../src/mansion/siege/main.js');
const SIEGE_ATTACKERS = read('../src/mansion/siege/attackers.js');
const COMBAT_ACTORS = read('../src/core/combat/actors.js');

/** One number, lifted out of a module that does not export it. */
function numberFromSource(source, pattern, label) {
  const found = source.match(pattern)?.[1];
  assert.ok(found !== undefined, `${label} is no longer where this test reads it`);
  const value = Number(found);
  assert.ok(Number.isFinite(value), `${label} did not parse as a number`);
  return value;
}

/**
 * Lift one `const NAME = Object.freeze({ ... })` literal out of the scene and
 * evaluate it.
 *
 * Brace-balanced rather than regexed to a closing line, because the tables it
 * reads are this project's usual prose-heavy shape -- paragraphs of comment
 * between the entries -- and any pattern that stopped at the first `});` would
 * stop inside the first nested `Object.freeze`. Evaluating the real literal
 * also means the test reads what the scene reads, comments and all, rather
 * than a second copy of the numbers maintained by hand next to it.
 *
 * The scan skips comment bodies, and that is not fussiness: the tables it
 * reads are surrounded by paragraphs explaining them, and the first time
 * somebody writes `max(saved, floor)` in one of those paragraphs a counter
 * that trusted every brace in the file would cut the table off mid-entry and
 * report a table that never existed. Both tables are numbers and identifiers
 * only, so comments are the whole of the hazard.
 */
function tableFromScene(name) {
  const start = SIEGE_MAIN.indexOf(`const ${name} = Object.freeze({`);
  assert.ok(start >= 0, `${name} is no longer declared in src/mansion/siege/main.js`);
  const open = SIEGE_MAIN.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < SIEGE_MAIN.length; i++) {
    const two = SIEGE_MAIN.slice(i, i + 2);
    if (two === '/*') { i = SIEGE_MAIN.indexOf('*/', i + 2) + 1; continue; }
    if (two === '//') { i = SIEGE_MAIN.indexOf('\n', i + 2); continue; }
    if (SIEGE_MAIN[i] === '{') depth++;
    else if (SIEGE_MAIN[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.ok(end > open, `${name} has unbalanced braces`);
  return new Function(`return (${SIEGE_MAIN.slice(open, end)});`)();
}

const CACHES = tableFromScene('SIEGE_SUPPLY_CACHES');
const FLOORS = tableFromScene('SIEGE_SUPPLY_FLOORS');

/* Which caches the player can reach while he is holding the staircase. The
 * foyer crate is on the ground floor with the cartel coming through the front
 * door, so it pays for the climb and nothing after it. */
const UPSTAIRS = Object.freeze(['firingStep', 'flankCache', 'triageCase']);

/**
 * The planning hit rate the scene's own comment sizes the caches against.
 *
 * Not a measurement of the aim system -- it is the honest admission that
 * nobody puts every round into a chest at twenty metres, at night, off a rail,
 * under suppression, at men who are moving. Two fifths. Lower it and every
 * demand below rises, which is the point: this is the one number to argue
 * with, and it is written down once.
 */
const HIT_RATE = 0.4;

const MATRIX = new FactionMatrix();
const AK = WEAPON_CATALOG[WEAPON_IDS.AK47];

/** How many chest hits of `damage` it takes to put one authored role down. */
function roundsToKill(roleId, damage) {
  const role = ROLES[roleId];
  const actor = new CombatActor({
    id: `roundsToKill:${roleId}`,
    faction: FACTIONS.CARTEL,
    maxHealth: role.health,
    armor: role.armor,
    maxArmor: role.armor,
  });
  let rounds = 0;
  while (!actor.incapacitated && rounds < 500) {
    actor.applyHit({
      amount: damage, attacker: { faction: FACTIONS.CREW }, playerShot: true, matrix: MATRIX,
    });
    rounds++;
  }
  assert.ok(actor.incapacitated, `${roleId} survived 500 rounds; the damage model changed`);
  return rounds;
}

const GROUND_ROLES = Object.values(ENCOUNTERS).flatMap((e) => e.members.map((m) => m.role));
const WAVE_ROLES = Object.fromEntries(WAVES.map((wave) => [
  wave.id, wave.groups.flatMap((group) => [...group.roles]),
]));
const UPSTAIRS_ROLES = [...WAVE_ROLES.one, ...WAVE_ROLES.two];

/** Perfect-shooting rounds for a roster: the floor under every estimate here. */
const perfectRounds = (roles) => roles.reduce((sum, id) => sum + roundsToKill(id, AK.damage), 0);
/** What that roster really costs at `HIT_RATE`. */
const realRounds = (roles) => Math.ceil(perfectRounds(roles) / HIT_RATE);

const chargesFor = (ids, kind) => ids.reduce((sum, id) => sum + (CACHES[id]?.[kind] ?? 0), 0);
const floorFor = (checkpoint, id, kind) => FLOORS[checkpoint]?.[id]?.[kind] ?? 0;

/* ================================================================== */
/* THE ROSTER THE ECONOMY IS SIZED AGAINST                              */
/* ================================================================== */

test('the mission still sends twenty-seven men, five of them before the stairs', () => {
  /* Pinned because everything below divides by it. Change the roster and the
   * demand assertions move with it; this one says the change was deliberate. */
  const roll = totalAttackers();
  assert.deepEqual(roll, { encounters: 5, waves: 22, total: 27 });
  assert.equal(GROUND_ROLES.length, 5);
  assert.equal(UPSTAIRS_ROLES.length, 22);
  assert.equal(WAVE_ROLES.two.length, 14, 'wave two is the retry case the floor has to cover');
});

test('the demand side is computed from the live damage model, not from memory', () => {
  /* An AK is 46 a chest hit and a rifleman is 90 with no plate, so two rounds.
   * The armoured man in 2C is 120 behind 45 points of plate and takes four.
   * If either of those stops being true this test wants to know, because every
   * cache size in the scene was derived from exactly this arithmetic. */
  assert.equal(AK.damage, 46);
  assert.equal(roundsToKill('rifle', AK.damage), 2);
  assert.equal(roundsToKill('armored', AK.damage), 4);
  assert.equal(perfectRounds(GROUND_ROLES), 10);
  assert.equal(perfectRounds(UPSTAIRS_ROLES), 50);
  assert.equal(perfectRounds(WAVE_ROLES.two), 34);

  /* And the pool those rounds have to chew through, as effective hit points:
   * armour is spent one-for-one against what it absorbs, so health + armour
   * IS the number. 2529 across the mission, 2109 of it above the stairs. */
  const effective = (roles) => roles
    .reduce((sum, id) => sum + ROLES[id].health + ROLES[id].armor, 0);
  assert.equal(effective([...GROUND_ROLES, ...UPSTAIRS_ROLES]), 2529);
  assert.equal(effective(UPSTAIRS_ROLES), 2109);
});

/* ================================================================== */
/* AMMUNITION                                                           */
/* ================================================================== */

test('one resupply charge is worth two magazines, and the catalog caps it', () => {
  /* The unit every ammunition assertion below is counted in. `Firearm.resupply`
   * refuses to push the reserve past the catalog's own carry limit, so a charge
   * is worth its two magazines only to a player with room for them -- which is
   * the player this economy is for. */
  const plan = CACHES.firingStep;
  const dry = new Firearm(WEAPON_IDS.AK47, { rounds: 0, reserve: 0 });
  assert.equal(dry.resupply(AK.capacity * plan.magazinesPerWeapon), 60);

  const full = new Firearm(WEAPON_IDS.AK47);
  assert.equal(full.reserve, AK.reserve);
  assert.equal(full.resupply(AK.capacity * plan.magazinesPerWeapon), 0,
    'a charge spent at a full reserve buys nothing; that is why the foyer crate is small');
});

test('the upstairs caches can finish the staircase defence from a dry rifle', () => {
  /* THE ASSERTION THE OLD ECONOMY FAILED. A player reaches the gallery having
   * fought a corridor and a foyer; the honest worst case is that he arrives
   * with nothing in reserve and everything left to kill. Twenty-two men cost
   * 50 perfect rounds, which is 125 real ones, and the two shared charges the
   * scene used to own were worth 120. It was 5 rounds short of arithmetic that
   * assumes he never wastes a magazine, never switches weapons and never
   * spends a charge on the armour it also dispenses. */
  const rounds = chargesFor(UPSTAIRS, 'resupplyCharges') * AK.capacity
    * CACHES.firingStep.magazinesPerWeapon;
  const demand = realRounds(UPSTAIRS_ROLES);
  assert.ok(rounds >= demand,
    `the gallery holds ${rounds} rounds of resupply against ${demand} rounds of fight`);
  /* And with real headroom, because armour comes out of the same charges. */
  assert.ok(rounds >= demand * 2,
    `${rounds} rounds is not twice the ${demand} the fight needs, and armour shares the charge`);
});

test('the ground-floor leg is no longer a dry run', () => {
  /* The corridor and the foyer cost 10 perfect rounds, 25 real ones, and there
   * used to be nothing between the armory and the balcony bay to replace them.
   * One charge on the leg covers that spend twice over -- deliberately one, so
   * it is a top-up taken under fire rather than a depot. */
  const leg = CACHES.foyerLine;
  assert.ok(leg.resupplyCharges >= 1, 'the ground floor must carry ammunition');
  assert.ok(leg.triageCharges >= 1, 'and a dressing; the climb is where the damage is');
  const rounds = leg.resupplyCharges * AK.capacity * leg.magazinesPerWeapon;
  assert.ok(rounds >= realRounds(GROUND_ROLES),
    `${rounds} rounds on the leg against ${realRounds(GROUND_ROLES)} spent reaching it`);
});

/* ================================================================== */
/* HEALING                                                              */
/* ================================================================== */

test('the health ceiling covers the incoming fire the mission actually delivers', () => {
  /* There is no regeneration anywhere in src/core/combat/actors.js, so the
   * player's 100 plus every dressing in the house IS the health ceiling, and
   * every resupply charge's armour is the only other thing standing between
   * him and the floor.
   *
   * Incoming: an attacker's AK is scaled to 20.7 raw a round by the siege's
   * own PLAYER_DAMAGE_SCALE, armour absorbs 55% of a raw hit and pays for it
   * one-for-one, and health takes the rest. Spend the armour first and the
   * whole budget is `armour / 0.55` raw, minus what that costs in health,
   * plus whatever health is left over.
   *
   * Every one of those four numbers is read out of the module that owns it,
   * so this measures the game rather than a memory of it. `PLAYER_DAMAGE_SCALE`
   * and the 0.55 armour share are module-private constants with no export to
   * import, which is why they come off the source text rather than an import. */
  const prospect = SIEGE_MAIN.match(
    /id: 'prospect'[^}]*maxHealth: (\d+), armor: \d+, maxArmor: (\d+)/,
  );
  assert.ok(prospect, 'the player actor is no longer declared where this test reads it');
  const PLAYER_MAX_HEALTH = Number(prospect[1]);
  const PLAYER_MAX_ARMOR = Number(prospect[2]);
  const DAMAGE_SCALE = numberFromSource(
    SIEGE_ATTACKERS, /const PLAYER_DAMAGE_SCALE = ([\d.]+);/, 'PLAYER_DAMAGE_SCALE',
  );
  const ARMOR_SHARE = numberFromSource(
    COMBAT_ACTORS, /Math\.min\(this\.armor, raw \* ([\d.]+)\)/, "armour's share of a raw hit",
  );
  const INCOMING_RAW = AK.damage * DAMAGE_SCALE;
  assert.equal(PLAYER_MAX_HEALTH, 100);
  assert.equal(PLAYER_MAX_ARMOR, 75);
  assert.equal(+INCOMING_RAW.toFixed(2), 20.7);

  const budget = (health, armor) => {
    const armoredRaw = armor / ARMOR_SHARE;
    const healthSpent = armoredRaw * (1 - ARMOR_SHARE);
    return armoredRaw + Math.max(0, health - healthSpent);
  };

  const upstairsHealth = PLAYER_MAX_HEALTH
    + chargesFor(UPSTAIRS, 'triageCharges') * CACHES.triageCase.triageHeal;
  const upstairsArmor = PLAYER_MAX_ARMOR
    + chargesFor(UPSTAIRS, 'resupplyCharges') * CACHES.firingStep.armorPerUse;
  const upstairsHits = budget(upstairsHealth, upstairsArmor) / INCOMING_RAW;

  /* The two figures `SIEGE_SUPPLY_CACHES`'s own docblock quotes. Pinned so a
   * re-tune has to correct the prose it invalidates, which is the one kind of
   * change detector worth having in a file written like this one. */
  assert.equal(upstairsHealth, 280);
  assert.equal(upstairsArmor, 300);

  /* The old economy -- 190 health, 165 armour -- bought seventeen hits against
   * twenty-seven attackers. Anything at or below that is the bug coming back. */
  const oldHits = budget(190, 165) / INCOMING_RAW;
  assert.ok(oldHits < 18 && upstairsHits > oldHits * 1.5,
    `${upstairsHits.toFixed(1)} hits of budget against the old ${oldHits.toFixed(1)}`);

  /* But it is still a fight. One hit of budget per attacker, near enough --
   * a ceiling that let him stand in the open through the whole staircase
   * defence would be the owner's "survivable" turned into "free". */
  assert.ok(upstairsHits < totalAttackers().total * 1.5,
    `${upstairsHits.toFixed(1)} hits is a stroll, not a siege`);

  /* And the healing is where the fight is: the gallery case carries it, not
   * the crate two floors down. */
  assert.ok(CACHES.triageCase.triageCharges >= 4);
  assert.ok(CACHES.triageCase.triageCharges > CACHES.foyerLine.triageCharges);
});

/* ================================================================== */
/* TWO CACHES YOU CAN SEE ARE TWO CACHES YOU CAN USE                    */
/* ================================================================== */

test('every supply surface in the house names its own cache', () => {
  /* The shape of the original bug, asserted directly: the firing-step crate
   * and the west flank cans are two objects the player walks between, and they
   * used to spend one pool. `SIEGE_SUPPLY_SURFACES` is the table that maps
   * surfaces to caches, and the two gallery ammunition points must not name
   * the same one. */
  const table = SIEGE_MAIN.slice(
    SIEGE_MAIN.indexOf('const SIEGE_SUPPLY_SURFACES = ['),
    SIEGE_MAIN.indexOf('].filter((entry) => entry.surface)'),
  );
  assert.ok(table.length > 0, 'SIEGE_SUPPLY_SURFACES is no longer a table in the scene');

  const rows = [...table.matchAll(
    /\{\s*cache:\s*'([A-Za-z]+)',\s*kind:\s*'(triage|resupply)',\s*surface:\s*([^,}]+)/g,
  )].map(([, cache, kind, surface]) => ({ cache, kind, surface: surface.trim() }));
  assert.ok(rows.length >= 5, `only found ${rows.length} supply surfaces`);

  for (const row of rows) {
    assert.ok(CACHES[row.cache], `surface ${row.surface} names an unknown cache "${row.cache}"`);
    assert.ok(CACHES[row.cache][`${row.kind}Charges`] > 0,
      `${row.surface} offers ${row.kind} from a cache that has none of it`);
  }

  const step = rows.find((r) => r.surface.includes('firingStep.ammo'));
  const flank = rows.find((r) => r.surface.includes('zones.resupply'));
  const triage = rows.find((r) => r.surface.includes('zones.triage'));
  assert.ok(step && flank && triage, 'the three gallery surfaces are all still registered');
  assert.notEqual(step.cache, flank.cache,
    'the balcony crate and the west flank cans are back on one shared pool');

  /* And the ground floor is on the table at all, which it never used to be. */
  assert.ok(rows.some((r) => r.surface.includes('foyerCache')),
    'nothing on the ground-floor leg draws supplies');
});

test('draining one gallery cache leaves the other one full', () => {
  /* The behaviour, through the real `CombatSupplyState` rather than through a
   * description of it: same class, same plans the scene builds from. */
  const step = new CombatSupplyState(CACHES.firingStep);
  const flank = new CombatSupplyState(CACHES.flankCache);
  const rifle = new Firearm(WEAPON_IDS.AK47, { rounds: 0, reserve: 0 });
  const actor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 0, maxArmor: 75,
  });

  let spent = 0;
  while (step.resupplyRemaining > 0) {
    actor.armor = 0;
    rifle.reserve = 0;
    assert.equal(step.useResupply({ actor, firearms: [rifle] }).used, true);
    spent++;
  }
  assert.equal(spent, CACHES.firingStep.resupplyCharges);
  assert.equal(step.resupplyRemaining, 0);
  assert.equal(flank.resupplyRemaining, CACHES.flankCache.resupplyCharges,
    'the west flank cans emptied themselves when the firing step was used');

  /* An exhausted cache refuses; the other one still pays out. */
  actor.armor = 0;
  rifle.reserve = 0;
  assert.equal(step.useResupply({ actor, firearms: [rifle] }).used, false);
  actor.armor = 0;
  rifle.reserve = 0;
  const fromFlank = flank.useResupply({ actor, firearms: [rifle] });
  assert.equal(fromFlank.used, true);
  assert.equal(fromFlank.ammunition, AK.capacity * CACHES.flankCache.magazinesPerWeapon);
});

/* ================================================================== */
/* THE RETRY TRAP                                                       */
/* ================================================================== */

test('the checkpoint that created the trap is still shaped the way it was', () => {
  /* The whole trap in three facts: supplies are checkpointed, the wave-one
   * checkpoint is written when wave one ENDS, and it resumes at the lull with
   * wave two still to fight. Spend everything holding wave one and the
   * checkpoint records zero -- so every retry of wave two started at zero,
   * forever. If any of these three stops being true the floor below is
   * solving a problem that no longer exists and should be re-read. */
  assert.ok(CHECKPOINT_FIELDS.includes('supplies'));
  assert.equal(CHECKPOINTS.wave_one.beat, B.LULL);
  assert.equal(CHECKPOINTS.briefed.beat, B.LITTLE_FRIEND);
});

test('a checkpoint restore tops each cache up to its floor and never takes anything', () => {
  /* The rule the scene implements, stated once here and exercised against the
   * real class: `max(saved, floor)`, clamped to the cache's own maximum. */
  const restore = (saved, checkpoint) => Object.fromEntries(
    Object.entries(CACHES).map(([id, plan]) => {
      const state = new CombatSupplyState(plan);
      state.restore(saved[id] ?? { triageCharges: 0, resupplyCharges: 0 });
      state.triageCharges = Math.max(state.triageCharges, Math.min(
        state.maxTriageCharges, floorFor(checkpoint, id, 'triage'),
      ));
      state.resupplyCharges = Math.max(state.resupplyCharges, Math.min(
        state.maxResupplyCharges, floorFor(checkpoint, id, 'resupply'),
      ));
      return [id, state.snapshot()];
    }),
  );

  const empty = Object.fromEntries(Object.keys(CACHES)
    .map((id) => [id, { triageCharges: 0, resupplyCharges: 0 }]));

  /* A player who spent everything holding wave one gets the floor back, and
   * gets exactly the same floor back on the tenth retry as on the first. */
  const first = restore(empty, 'wave_one');
  const tenth = restore(empty, 'wave_one');
  assert.deepEqual(first, tenth, 'retries are not cumulative any more');
  for (const id of UPSTAIRS) {
    const kind = CACHES[id].resupplyCharges > 0 ? 'resupplyCharges' : 'triageCharges';
    assert.ok(first[id][kind] > 0,
      `${id} restores empty at the lull, which is the trap the owner walked into`);
  }

  /* Conserving still pays: a surplus above the floor survives the rewind. */
  const husbanded = restore({
    ...empty,
    firingStep: { triageCharges: 0, resupplyCharges: CACHES.firingStep.resupplyCharges },
  }, 'wave_one');
  assert.equal(husbanded.firingStep.resupplyCharges, CACHES.firingStep.resupplyCharges,
    'the floor confiscated charges a careful player had left');

  /* And it is a floor, not a refill -- dying still costs something. */
  for (const id of UPSTAIRS) {
    assert.ok(floorFor('wave_one', id, 'resupply') < CACHES[id].resupplyCharges
      || CACHES[id].resupplyCharges === 0);
    assert.ok(floorFor('wave_one', id, 'triage') < CACHES[id].triageCharges
      || CACHES[id].triageCharges === 0);
  }

  /* A cache behind the checkpoint is not refilled: the foyer crate stands on
   * the ground floor with the cartel coming through the front door, and a
   * guarantee about a crate he cannot safely reach would be a lie. */
  assert.equal(floorFor('wave_one', 'foyerLine', 'resupply'), 0);
  assert.equal(floorFor('briefed', 'foyerLine', 'triage'), 0);
});

test('every checkpoint floor is enough for the fight in front of it', () => {
  /* This is the assertion that makes the floors numbers rather than taste. */
  const ammunition = (checkpoint) => UPSTAIRS
    .reduce((sum, id) => sum + floorFor(checkpoint, id, 'resupply'), 0)
    * AK.capacity * CACHES.firingStep.magazinesPerWeapon;

  /* From the lull, fourteen men: 34 perfect rounds, 85 real ones. */
  assert.ok(ammunition('wave_one') >= realRounds(WAVE_ROLES.two),
    `the lull guarantees ${ammunition('wave_one')} rounds against ${realRounds(WAVE_ROLES.two)}`);
  /* From the briefing, all twenty-two. */
  assert.ok(ammunition('briefed') >= realRounds(UPSTAIRS_ROLES),
    `the briefing guarantees ${ammunition('briefed')} rounds against ${realRounds(UPSTAIRS_ROLES)}`);
  /* And the earlier two hand the whole mission back, because nothing has been
   * spent yet that a fair restart should remember. */
  for (const checkpoint of ['wake', 'armory', 'armed']) {
    for (const [id, plan] of Object.entries(CACHES)) {
      assert.equal(floorFor(checkpoint, id, 'triage'), plan.triageCharges, `${checkpoint}/${id}`);
      assert.equal(floorFor(checkpoint, id, 'resupply'), plan.resupplyCharges, `${checkpoint}/${id}`);
    }
  }

  /* No floor may promise more than the cache can hold -- `restore()` clamps,
   * so an over-large floor would be a number that silently does nothing. */
  for (const [checkpoint, table] of Object.entries(FLOORS)) {
    for (const [id, guarantee] of Object.entries(table)) {
      assert.ok(CACHES[id], `${checkpoint} floors an unknown cache "${id}"`);
      assert.ok((guarantee.triage ?? 0) <= CACHES[id].triageCharges, `${checkpoint}/${id} triage`);
      assert.ok((guarantee.resupply ?? 0) <= CACHES[id].resupplyCharges, `${checkpoint}/${id} resupply`);
    }
  }
  assert.deepEqual(Object.keys(FLOORS).sort(), Object.keys(CHECKPOINTS).sort(),
    'every checkpoint needs a floor, or a retry from it is a guess');
});

test('the scene restores through max(), not through assignment', () => {
  /* The floor only works if the restore raises a shortfall instead of writing
   * over what was saved. Pinned in the source because the behaviour above is a
   * model of the rule and this is the rule itself. */
  const restore = SIEGE_MAIN.slice(
    SIEGE_MAIN.indexOf('function restoreSiegeSupplies('),
    SIEGE_MAIN.indexOf('const combatAudio = new CombatAudio('),
  );
  assert.ok(restore.length > 0, 'restoreSiegeSupplies is gone');
  assert.match(restore, /state\.restore\(/, 'the saved charges must be applied first');
  assert.match(restore, /state\.triageCharges = Math\.max\(state\.triageCharges,/);
  assert.match(restore, /state\.resupplyCharges = Math\.max\(state\.resupplyCharges,/);
  assert.match(restore, /Math\.min\(\s*state\.maxTriageCharges/,
    'a floor above the cache maximum must be clamped, not stored');
});

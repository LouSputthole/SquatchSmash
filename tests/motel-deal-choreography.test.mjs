/**
 * Room twelve, staged in the order the beat reads.
 *
 *   enter -> put your case down -> inspect their sample -> the deal talk ->
 *   the inspection sequence -> tension -> the deal goes bad -> the weapon
 *   becomes active -> combat
 *
 * Three things the scene kept getting wrong, and all three are structural
 * rather than cosmetic, so they are checked here rather than looked at:
 *
 *   1. WHAT TONY IS HOLDING was left to the player and to whichever prompt he
 *      pressed last, so he could arrive at a cutscene about two suitcases
 *      holding a revolver and nothing else. The car now draws the .45, puts it
 *      away, and hands him his own case, in that order, before he can walk.
 *
 *   2. WHERE THE CASES ARE. Their case sat on a bed while every line, label
 *      and objective in the scene talked about a table. Both cases are on the
 *      table now -- theirs when the room is built, yours when you walk in --
 *      and the room event that moves theirs to the far bed is the first thing
 *      that goes wrong rather than the state it starts in.
 *
 *   3. THE GUN. Before the deal turns, a trigger pull is refused in character
 *      and NOTHING is discharged: no round spent, no cue played, no damage
 *      dealt. `releaseWeapon()` is the single hinge, called by `maybeBetray`,
 *      and it is loud about itself.
 *
 * `src/motel/main.js` imports Three.js at module scope, so — exactly as the
 * neighbouring Motel suites do — the runtime is read as authored text and the
 * pure pieces are lifted out and run for real.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  MOTEL_TABLE,
  MOTEL_THEIR_CASE,
  MOTEL_YOUR_CASE,
  MOTEL_YOUR_CASE_PAID,
} from '../src/motel/level.js';
import { allMotelVoiceLines } from '../src/motel/voice-catalog.js';

const main = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
const level = fs.readFileSync(new URL('../src/motel/level.js', import.meta.url), 'utf8');

/** The body of a top-level `function name() { ... }` in main.js. */
function fn(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() has been renamed -- this suite needs updating`);
  /* The first `) {` after the name is the end of the parameter list, not a
   * destructured default inside it -- `maybeBetray(trigger, { fastDraw })`
   * has a brace in its signature and closed one character into its own body. */
  const open = main.indexOf('{', main.indexOf(') {', start));
  let depth = 0;
  for (let i = open; i < main.length; i++) {
    if (main[i] === '{') depth += 1;
    else if (main[i] === '}') {
      depth -= 1;
      if (depth === 0) return main.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

/** Half-extents of the dining table top, which is 1.6 x 1.6 in level.js. */
const TABLE_HALF = 0.8;
const onTable = (pose) => Math.abs(pose.x - MOTEL_TABLE.x) <= TABLE_HALF
  && Math.abs(pose.z - MOTEL_TABLE.z) <= TABLE_HALF;

// ---------------------------------------------------------------------------
// 1. Arrival: draw, put away, take the case, walk in carrying it.
// ---------------------------------------------------------------------------

test('the car arms Tony and fills his hands before he can walk anywhere', () => {
  const arrival = fn('runArrivalInventory');

  // It happens on the first playable frame, not on a prompt the player may miss.
  assert.match(fn('finishArrival'), /runArrivalInventory\(\);/,
    'the sequence must run at the playable handoff, not be left to the glovebox');

  // (a) he receives the revolver, (b) it goes away, (c) the case goes in his hands.
  const draw = arrival.indexOf("equipWeapon('revolver')");
  const away = arrival.indexOf('holsterWeapon()');
  const take = arrival.indexOf('takeOwnCase()');
  assert.ok(draw >= 0 && away > draw && take > away,
    'the order is draw, put away, then take the case -- in that order');

  // (d) and the state that carries him into the room.
  assert.match(fn('holsterWeapon'), /S\.holstered = true;/);
  assert.match(fn('takeOwnCase'), /S\.caseHeld = true;/);
  assert.match(main, /armedUp: false,/, 'the sequence has a once-only guard');
  assert.match(arrival, /if \(S\.armedUp\) return;/);
});

test('a holstered gun is carried, not held, everywhere that asks', () => {
  /* One answer for the lens, the HUD and the trigger. If `heldKind()` did not
   * read the holster, the shared rack would still mount the .45 on the camera
   * and the whole "he walks in with a case" staging would show a gun. */
  assert.match(fn('heldKind'), /if \(S\.holstered\) return null;/);
  assert.match(fn('updateGear'), /S\.holstered/, 'the gear box says the gun is put away');
});

// ---------------------------------------------------------------------------
// 2. Two cases, one table.
// ---------------------------------------------------------------------------

test('both cases sit on the dining table, not on a bed', () => {
  assert.ok(onTable(MOTEL_THEIR_CASE), 'their case must start on the table');
  assert.ok(onTable(MOTEL_YOUR_CASE), 'your case comes down on the table');
  assert.ok(onTable(MOTEL_YOUR_CASE_PAID), 'and stays on it once it is pushed across');

  // Both rest on the top slab rather than floating over it or sinking into it.
  for (const pose of [MOTEL_THEIR_CASE, MOTEL_YOUR_CASE, MOTEL_YOUR_CASE_PAID]) {
    assert.ok(pose.y >= MOTEL_TABLE.top - 0.02 && pose.y <= MOTEL_TABLE.top + 0.1,
      `a case at y=${pose.y} is not resting on a table top at ${MOTEL_TABLE.top}`);
  }

  // They are two objects, not one object drawn twice.
  const apart = Math.hypot(
    MOTEL_THEIR_CASE.x - MOTEL_YOUR_CASE.x,
    MOTEL_THEIR_CASE.z - MOTEL_YOUR_CASE.z,
  );
  assert.ok(apart > 0.6, `the two cases are only ${apart.toFixed(2)}m apart`);

  // Theirs is on Rico's side of the table and yours is on yours. Rico stands
  // at z = -8.3, behind the table; Tony walks in from z = -5.4, in front of it.
  assert.ok(MOTEL_THEIR_CASE.z < MOTEL_TABLE.z, 'their case faces you from their side');
  assert.ok(MOTEL_YOUR_CASE.z > MOTEL_TABLE.z, 'your case lands on your side');

  // And the level places theirs from the shared constant rather than typing a
  // bed coordinate again.
  assert.match(level, /refs\.jerkyCase\.group\.position\.set\(MOTEL_THEIR_CASE\.x/);
  assert.doesNotMatch(level, /refs\.jerkyCase\.group\.position\.set\(-3\.1/,
    'the reserve case is back on the bed');
});

test('walking in puts your case down before a word of the deal is said', () => {
  const enter = fn('enterRoom');
  const down = enter.indexOf('putOwnCaseDown()');
  const beats = enter.indexOf('speakAuthoredBeats(CASE_DOWN_BEATS');
  assert.ok(down >= 0, 'entering room twelve must set the case down');
  assert.ok(beats > down, 'the case lands, and then the room talks about it');

  const place = fn('putOwnCaseDown');
  assert.match(place, /S\.caseDown = true;/);
  assert.match(place, /S\.caseHeld = false;/);
  assert.match(place, /placeMoneyCase\(MOTEL_YOUR_CASE\)/,
    'the model has to move with the flag, or the HUD and the room disagree');
  /* Setting it down is NOT paying. The transaction is unchanged: `moneyOnTable`
   * is still its own decision, behind Rico's two push-backs. */
  assert.doesNotMatch(place, /S\.moneyOnTable/,
    'putting the case down must not pay for anything');
  assert.doesNotMatch(place, /S\.carryingMoney = false/,
    'the money is still his until he pushes it across');
});

test('the three things on the table each have their own prompt point', () => {
  /* They used to be stacked: `sample` and `placeMoney` shared one coordinate
   * and one radius, and because `sample` is declared first it won every tie --
   * so "put your case on the table" could not be selected at all. */
  const points = new Map();
  for (const [, id, x, , z] of main.matchAll(
    /id: '(sample|placeMoney)', x: ([-\d.A-Z_]+(?:\.[a-z]+)?), y: ([-\d.]+), z: ([-\w.]+)/g,
  )) {
    points.set(id, `${x}|${z}`);
  }
  assert.equal(points.size, 2, 'both table prompts should still be declared inline');
  assert.notEqual(points.get('sample'), points.get('placeMoney'),
    'the sample and your case must not share one authored point');

  // And the tie-break is the deal, not the order of the array.
  assert.match(main, /priority: stepPriority\('sample'\)/);
  assert.match(main, /priority: stepPriority\('count'\)/);
  assert.match(main, /priority: stepPriority\('pay', 'open'\)/);
  assert.match(fn('updateInteract'),
    /priority: typeof it\.priority === 'function' \? it\.priority\(\) : it\.priority/,
    'a computed priority has to actually be computed');
});

// ---------------------------------------------------------------------------
// 3. Nothing fires until the deal goes bad.
// ---------------------------------------------------------------------------

/** `dealSealed()` closes over `phase` and `S`, so run it for real. */
function liftDealSealed() {
  const body = fn('dealSealed');
  const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
  const run = new Function('S', 'phase', inner);
  return (phase, S = {}) => run({ betrayed: false, ...S }, phase);
}

test('the protected portion is every phase of the deal, and ends when it turns', () => {
  const sealed = liftDealSealed();
  for (const phase of ['arrival', 'car', 'lot', 'door', 'room']) {
    assert.equal(sealed(phase), true, `${phase} is part of the deal and must be protected`);
    assert.equal(sealed(phase, { betrayed: true }), false,
      `${phase} must be live the moment the room turns`);
  }
  for (const phase of ['fight', 'recover', 'escape', 'drive', 'end']) {
    assert.equal(sealed(phase), false, `${phase} is combat and must not be protected`);
  }
});

test('a trigger pull during the deal is refused, and no round leaves the gun', () => {
  const ranged = fn('onRanged');
  const gate = ranged.slice(0, ranged.indexOf('const st ='));
  assert.match(gate, /if \(dealSealed\(\)\) \{ refuseWeapon\(\); return; \}/,
    'the refusal must come before anything is spent');

  /* The point of putting it first: everything that makes a shot happen is
   * BELOW it, so there is no discharge to undo afterwards. */
  const after = ranged.slice(ranged.indexOf('dealSealed()'));
  for (const spend of ['S.ammo--', 'spendRangedShot()', 'sfx.gunshot()', 'resolveRangedHit(', 'fireSharedWeapon(']) {
    assert.ok(after.includes(spend), `${spend} must sit behind the gate, not in front of it`);
  }

  // And a fist is not a loophole: a swing at a person is pulled too.
  const melee = fn('resolvePlayerHit');
  assert.match(melee, /const sealed = dealSealed\(\);/);
  assert.match(melee, /if \(sealed\) \{ refuseWeapon\(\); return; \}/);
});

test('the refusal is three real lines in Tony\'s voice, all of them recorded', () => {
  const block = main.slice(main.indexOf('const WEAPON_REFUSALS = ['), main.indexOf('/** The room\'s answer'));
  const lines = [...block.matchAll(/'((?:\\.|[^'\\])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(lines.length >= 3, `only ${lines.length} refusal line(s) were authored`);

  const authored = new Set(allMotelVoiceLines().map((line) => line.text));
  for (const text of lines) {
    assert.ok(authored.has(text), `"${text}" has no recorded take -- run npm run vo:motel`);
  }
  // The owner's two, verbatim.
  assert.ok(lines.includes('I should work the deal before resorting to that.'));
  assert.ok(lines.includes('Not yet. Let us see how this plays out.'));

  // Throttled, so leaning on the trigger is a man with an opinion, not a loop.
  assert.match(fn('refuseWeapon'), /sayThrottled\('weapon\.sealed'/);
});

test('the deal going bad is the one place the weapon comes live, and it is loud about it', () => {
  const betray = fn('maybeBetray');
  assert.match(betray, /releaseWeapon\(\);/,
    'the betrayal is the only hinge that arms him');

  const release = fn('releaseWeapon');
  assert.match(release, /S\.holstered = false;/);
  assert.match(release, /WEAPON LIVE/, 'the transition has to be unmissable');
  assert.match(release, /shake = Math\.max/, 'and felt, not only read');
  assert.match(release, /updateGear\(\);/, 'the gun appears at the lens on the same frame');
  assert.match(release, /if \(!S\.holstered\) return;/, 'it fires once');

  // Nothing else in the scene may quietly un-holster him.
  const releases = [...main.matchAll(/S\.holstered = false;/g)];
  assert.equal(releases.length, 2,
    'only `releaseWeapon` and the scene reset may clear the holster');
});

test('the Commander still opens the fast gunfight, and still cannot be drawn in the lot', () => {
  const draw = fn('drawSilverback');
  /* Drawing across the table is an authored decision that TURNS the deal, so
   * it is allowed and immediately unseals the gun through `maybeBetray`.
   * Drawing at the ice machine is not a decision, it is a way to end the scene
   * before it starts. */
  assert.match(draw, /if \(dealSealed\(\) && phase !== 'room'\)/);
  assert.match(draw, /maybeBetray\('you drew the Commander', \{ fastDraw: true \}\)/);
});

// ---------------------------------------------------------------------------
// 4. The whole beat, in order.
// ---------------------------------------------------------------------------

test('the room plays its beats in the authored order', () => {
  const enter = fn('enterRoom');
  const order = ['putOwnCaseDown()', 'CASE_DOWN_BEATS', 'S.sampleOut = true', 'scheduleRoomEvents()'];
  let at = -1;
  for (const step of order) {
    const next = enter.indexOf(step);
    assert.ok(next > at, `${step} is out of order in enterRoom()`);
    at = next;
  }

  /* Tension, and only then the offer that turns it. The suspicion beats run on
   * a clock inside `roomEvents`, and the betrayal offer is the last of them. */
  const events = main.slice(main.indexOf('const roomEvents = ['), main.indexOf('let roomT = 0;'));
  const times = [...events.matchAll(/\bt: (\d+),/g)].map((m) => Number(m[1]));
  assert.deepEqual([...times].sort((a, b) => a - b), times, 'the room beats must climb');
  assert.match(events.slice(events.lastIndexOf('t:')), /offerBetrayal\(\)/,
    'the last beat of the rising tension is the one that offers the betrayal');
});

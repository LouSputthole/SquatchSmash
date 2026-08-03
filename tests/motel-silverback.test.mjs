/**
 * The Silverback Commander, and the fast way out of room twelve.
 *
 * The Motel's transaction is the tense part and it stays that way: the deal
 * can be talked, inspected, argued and brawled through without a gun ever
 * leaving Tony's coat. The Commander is Snow's, and the Family's — silver
 * slide, crest on the frame, seven rounds — and drawing it inside the room
 * before the sellers move is the one thing in the scene that resolves it in
 * seconds. That has to stay optional, and it has to stay expensive.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { WEAPON_STATS, buildWeaponMesh } from '../src/motel/actors.js';
import { allMotelVoiceLines } from '../src/motel/voice-catalog.js';

const main = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');

test('the Commander is a real entry in the Motel weapon table', () => {
  const gun = WEAPON_STATS.silverback;
  assert.ok(gun, 'silverback is missing from WEAPON_STATS');
  assert.equal(gun.name, 'Silverback Commander');
  assert.equal(gun.ranged, true);
  assert.equal(gun.lethal, true);
  assert.equal(gun.ammo, 7);
  assert.equal(gun.loud, true);
  assert.equal(gun.family, true);
});

test('it hits harder and comes up faster than the anonymous revolver', () => {
  /* If it were not better than the glovebox revolver there would be no reason
   * to accept a traceable gun, and the choice would not be a choice. */
  assert.ok(WEAPON_STATS.silverback.dmg > WEAPON_STATS.revolver.dmg);
  assert.ok(WEAPON_STATS.silverback.rate > WEAPON_STATS.revolver.rate);
  // And it is still not the trunk's hand cannon.
  assert.ok(WEAPON_STATS.silverback.dmg < WEAPON_STATS.handcannon.dmg);
});

test('it is the only gun in the scene that belongs to the Family', () => {
  const family = Object.entries(WEAPON_STATS)
    .filter(([, stats]) => stats.family)
    .map(([id]) => id);
  assert.deepEqual(family, ['silverback']);
});

test('it builds as a distinct weapon, crest and all', () => {
  const mesh = buildWeaponMesh('silverback');
  const names = new Set();
  mesh.traverse((node) => { if (node.name) names.add(node.name); });
  for (const part of [
    'silverback-commander', 'silverback.frame', 'silverback.slide',
    'silverback.barrel', 'silverback.muzzle', 'silverback.grip',
    'silverback.crest', 'silverback.hammer',
  ]) {
    assert.equal(names.has(part), true, `${part} is missing from the Commander`);
  }
  // An unknown kind must not silently fall through to it.
  const fallback = buildWeaponMesh('not-a-weapon');
  assert.equal(fallback.name, '');
});

test('Snow offers it in the car and it rides concealed', () => {
  assert.match(main, /id: 'silverback'/, 'no glovebox-side offer exists');
  assert.match(main, /S\.silverbackTaken = true/);
  /* Taking it must not arm him. If the offer set S.weapon the whole
   * transaction would be played with a gun visibly in hand, which is the one
   * thing the scene is not about. */
  const offer = main.slice(main.indexOf("id: 'silverback'"), main.indexOf("id: 'exitCar'"));
  assert.ok(!/S\.weapon\s*=/.test(offer), 'taking the Commander must not equip it');
});

test('X draws it, and drawing in the room is what opens the fast gunfight', () => {
  assert.match(main, /case 'KeyX': drawSilverback\(\);/);
  assert.match(main, /function drawSilverback\(\)/);
  const draw = main.slice(main.indexOf('function drawSilverback()'), main.indexOf('function snowJoins('));
  assert.match(draw, /S\.silverbackTaken/, 'drawing must require having been given it');
  assert.match(draw, /maybeBetray\([^)]*\{ fastDraw: true \}\)/);
  assert.match(draw, /S\.policeHeat \+=/, 'a loud gun in a motel must cost police attention');
  assert.match(draw, /snowJoins\(/, 'Snow has to hear it');
});

test('drawing first denies the third man his free swing, and nothing else', () => {
  const betray = main.slice(main.indexOf('function maybeBetray('), main.indexOf('function drawSilverback('));
  assert.match(betray, /fastDraw = false/, 'maybeBetray must default to the authored betrayal');
  assert.match(betray, /!S\.slicerKnown && !fastDraw/,
    'the surprise hit must be skipped only for a player already covering the room');
  // The slicer still comes out of the bathroom either way.
  assert.match(betray, /slicer\.hostile = true/);
});

test('abandoning it is worse than abandoning anything else', () => {
  /* An anonymous revolver in an ice machine is a shrug. A gun with the crest
   * on it is evidence against the Family, not just against Tony. */
  assert.match(main, /WEAPON_STATS\[dropped\]\?\.family/);
  assert.match(main, /THE CREST IS ON IT/);
});

test('every line the Commander adds is in the generated voice catalog', () => {
  const said = new Set(allMotelVoiceLines().map((line) => `${line.speaker}: ${line.text}`));
  for (const line of [
    'Snow: Under the coat. Seven in it. Do not let them see the crest and do not make me explain a Family gun to a night clerk.',
    'Prospect: It is under my coat. It stays under my coat.',
    'Prospect: Hands. Both of them. On the case.',
    'Rico: Whoa — WHOA—',
    'Prospect: Third man. Of course there is a third man.',
  ]) {
    assert.equal(said.has(line), true, `${line} is not cataloged — run npm run vo:motel`);
  }
});

test('the players who never touch it are unaffected', () => {
  /* Every one of these is reachable without the Commander: it is offered, not
   * issued, and the authored betrayal still fires on seller suspicion. */
  assert.match(main, /maybeBetray\('heat'\)|maybeBetray\(/);
  assert.doesNotMatch(main, /S\.silverbackTaken = true;\s*\n\s*exitCar/,
    'leaving the car must not force the gun on the player');
});

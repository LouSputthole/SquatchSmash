/**
 * The 2026-08-05 Beef Run playtest notes, kept fixed.
 *
 * Each test below is one thing the owner reported. They are here rather than in
 * the browser verifier where the rule can be stated without a renderer — the
 * measured, in-page evidence for each is in the commit message.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { MissionController } from '../src/beefrun/mission.js';
import { BIG_UNCLE_LOU, CAPTAIN_LOU_SASOLE } from '../src/core/wardrobe.js';
import { AIRSTRIP_UNLOCKS, LANDING_QUALITIES } from '../src/core/campaign.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const beefMain = read('../src/beefrun/main.js');
const beefNpc = read('../src/beefrun/npc.js');
const beefPreflight = read('../src/beefrun/preflight.js');
const beefAircraft = read('../src/beefrun/aircraft.js');
const beefMission = read('../src/beefrun/mission.js');
const beefDetection = read('../src/beefrun/detection.js');

/* ---------------- 1. "why does it not take my pointer?" ---------------- */

test('the pointer is requested inside the click, before the sample bank loads', () => {
  /* Measured cause: the Start handler awaited `audio.init()` and
   * `audio.loadManifest()` — 269 recorded cues, 17.3 seconds on the test
   * machine — and only then called `requestLock()`. Chrome's transient
   * activation is gone after five, so the request came back "A user gesture is
   * required to request Pointer Lock" and the scene fell into drag-look. The
   * ORDER is the fix, so the order is what is asserted. */
  /* Anchored to whole statements rather than substrings: the comment that
   * explains this fix quotes all three calls, and an `indexOf` finds the
   * explanation before the code. */
  const handler = beefMain.slice(beefMain.indexOf("startBtn.addEventListener('click'"));
  const lock = handler.search(/^\s*requestLock\(\);/m);
  const initAudio = handler.search(/^\s*await audio\.init\(\);/m);
  const loadBank = handler.search(/^\s*const sfx = await audio\.loadManifest\(\);/m);
  assert.ok(lock > 0 && initAudio > 0 && loadBank > 0, 'the start handler still does all three');
  assert.ok(lock < initAudio, 'pointer lock must be asked for before the audio context is opened');
  assert.ok(lock < loadBank, 'pointer lock must be asked for before the sample bank is fetched');
});

test('a refused lock is retryable rather than a life sentence', () => {
  /* `fallBackToDragLook` used to latch a flag that BOTH it and the
   * pointerlockchange listener early-returned on, and nothing else ever asked
   * again — so one refusal meant no pointer for the rest of the session. */
  assert.match(beefMain, /canvas\.addEventListener\('click'/,
    'a canvas click has to be able to retry the real thing');
  const change = beefMain.slice(beefMain.indexOf("document.addEventListener('pointerlockchange'"));
  assert.match(change.slice(0, 400), /if \(locked\) dragLook = false;/,
    'winning the real lock must retire the fallback');
  const fallback = beefMain.slice(beefMain.indexOf('function fallBackToDragLook'));
  assert.doesNotMatch(fallback.slice(0, 200), /^\s*if \(dragLook\) return;/m,
    'the fallback must not latch itself permanently');
});

test('nothing takes the pointer back over the report card', () => {
  // The card has buttons; a locked pointer cannot reach one.
  const fn = beefMain.slice(beefMain.indexOf('function requestLock()'));
  assert.match(fn.slice(0, 700), /if \(mission\.finished \|\| flightHud\.completeUp\) return;/);
});

/* ---------------- 2. "Sasole in his old clothes" ---------------- */

test('Captain Sasole is dressed out of the canonical wardrobe', () => {
  assert.match(beefNpc, /import \{ CAPTAIN_LOU_SASOLE \} from '\.\.\/core\/wardrobe\.js'/);
  const makeLou = beefNpc.slice(beefNpc.indexOf('export function makeLou()'));
  assert.match(makeLou.slice(0, 600), /\.\.\.fromWardrobe\(CAPTAIN_LOU_SASOLE\)/,
    'the scene spreads the canonical record rather than restating it');
  /* Nothing local may restate a garment. The old inline literal named a
   * jacket, trousers, boots, a shirt, hair and a build; only scene-local
   * things — the headset, his photograph, its crop — are allowed now. */
  const body = makeLou.slice(0, makeLou.indexOf('setPose('));
  for (const key of ['jacket:', 'trousers:', 'boots:', 'shirt:', 'hair:', 'build:', 'skin:']) {
    assert.doesNotMatch(body, new RegExp(`\\s${key}`), `makeLou must not restate ${key}`);
  }
});

test('the two Lous are different men and this file only knows one of them', () => {
  /* HARD RULE. `captain_lou_sasole` / `lou2` is the pilot; `lou` / `lou1` is
   * Big Uncle Lou Sputthole. Merging them is a character error. */
  assert.doesNotMatch(beefNpc, /^import .*BIG_UNCLE_LOU/m,
    'the airfield must never import Big Uncle Lou');
  assert.doesNotMatch(beefNpc, /\.\.\.fromWardrobe\(BIG_UNCLE_LOU\)/,
    'and must never dress anybody here in his clothes');
  assert.notEqual(CAPTAIN_LOU_SASOLE.height, BIG_UNCLE_LOU.height);
  assert.notEqual(CAPTAIN_LOU_SASOLE.build, BIG_UNCLE_LOU.build);
  assert.notEqual(CAPTAIN_LOU_SASOLE.dress, BIG_UNCLE_LOU.dress);
  assert.notEqual(CAPTAIN_LOU_SASOLE.shirt, BIG_UNCLE_LOU.shirt);
  assert.match(beefNpc, /nameTag\('CAPT\. LOU SASOLE'/);
});

/* ---------------- 5. "wheel cholks come with the plane" ---------------- */

test('the chocks are left on the ground, not flown to El Hueso', () => {
  /* They are built as children of `aircraft.group` on purpose — that is how
   * they park correctly on any heading — so the fix is re-parenting them to
   * the scene the moment the aeroplane is handed to a pilot. Measured before:
   * both wedges at world y 1498.38 with the aeroplane at 1500 m. */
  assert.match(beefPreflight, /stowGroundKit\(\) \{/);
  assert.match(beefPreflight, /this\.scene\.attach\(chock\)/,
    'attach() preserves the world transform through the reparent');
  // Called from every place that hands the aeroplane over, not from a phase
  // update that stops being called.
  const enter = beefMission.slice(beefMission.indexOf('enterCockpit() {'));
  assert.match(enter.slice(0, 900), /this\.preflight\.stowGroundKit\(\);/,
    'getting into the seat leaves the ground kit behind');
  assert.match(beefMission, /this\.preflight\.disarm\(\);\s*\n\s*this\.preflight\.stowGroundKit\(\);/,
    'and so does a checkpoint restore, which teleports the aeroplane');
});

/* ---------------- 7. "the only way to get to the crates is by clipping in" ---- */

test('the hold has a floor and a ramp, and the player’s ground knows about them', () => {
  assert.match(beefAircraft, /buildCargoRamp\(/);
  assert.match(beefAircraft, /deckHeightAt\(x, z\)/);
  assert.match(beefAircraft, /resolveOnDeck\(player, axis, radius\)/);
  /* `floorZones` only choose a footstep sound; `groundAt` is the only thing
   * that decides how high a walking man stands, so the deck has to come from
   * there or it does not exist. */
  assert.match(beefMain, /world\.groundAt = \(x, z\) => \{/);
  assert.match(beefMain, /aircraft\.deckHeightAt\(x, z\)/);
  assert.match(beefMain, /world\.resolvePlayer = /);
  // The door and the ramp are one fact.
  const loading = read('../src/beefrun/loading.js');
  assert.match(loading, /setDoor\(open\) \{/);
  assert.match(loading, /this\.aircraft\.setCargoRamp\?\.\(open\)/);
  assert.doesNotMatch(loading, /this\.doorOpen = !this\.doorOpen/,
    'every door change must go through setDoor so the ramp cannot disagree');
});

/* ---------------- 9. "while flying hes looking away from you" ---------------- */

test('a seated figure turns to look at whoever is talking to him', () => {
  /* Determined in the live scene: NOT a texture failure. `assets/faces/sasole.png`
   * was on material index 4 at 715x1462 the whole time. He sat at rotation zero
   * in a right seat of an aeroplane whose nose is +Z, so his face pointed at
   * the windshield — measured 146.2 degrees off the pilot's eye. The look-at
   * was gated `f.pose !== 'sit'`. */
  assert.doesNotMatch(beefNpc, /if \(target && f\.pose !== 'sit'\)/,
    'the seated gate is what stopped him ever turning his head');
  assert.match(beefNpc, /const SEATED_NECK_SWEEP/);
  assert.match(beefNpc, /const SEATED_TORSO_TWIST/);
  /* Once he is parented to the aeroplane his own position is in aircraft space
   * while the camera is in world space, so the bearing is meaningless without
   * converting one into the other. */
  assert.match(beefNpc, /_lookMat\.copy\(parent\.matrixWorld\)\.invert\(\)/);
});

/* ---------------- 8. "Sasole should get out of the plane with you" ---------- */

test('the Captain disembarks at El Hueso and at the ending', () => {
  assert.match(beefMission, /disembarkLou\(\) \{/);
  // Both landings, and not from exitCockpit(), which also runs on a restore.
  assert.equal(beefMission.split('this.disembarkLou()').length - 1, 2);
  const exit = beefMission.slice(beefMission.indexOf('exitCockpit() {'));
  assert.doesNotMatch(exit.slice(0, 1200), /disembarkLou/);
});

/* ---------------- 13. "always located near the volcano" ---------------- */

test('the Bureau’s search is built from the run, not from three constants', () => {
  /* Measured before: the three lane homes came out at (-700,-8840),
   * (850,-7340) and (-260,-5640) on every deploy, and the nearest sat 468.7 m
   * from the volcano every single time with zero variance. */
  assert.doesNotMatch(beefDetection, /x: -700, z: originZ/);
  assert.doesNotMatch(beefDetection, /x: 850, z: originZ/);
  assert.doesNotMatch(beefDetection, /x: -260, z: originZ/);
  assert.match(beefDetection, /deploy\(originZ, options = \{\}\)/);
  assert.match(beefDetection, /clearOfLandmarks\(z, floorZ\)/,
    'no lane may sit on a navigation landmark');
  assert.match(beefMission, /deployBureau\(\) \{/);
  assert.match(beefMission, /corridorX: this\.physics\.position\.x/,
    'they search where the aeroplane actually went');
});

/* ---------------- 4. "I crashed plane behind runway" ---------------- */

test('both ends of the runway are recoverable, and so is the rest of the field', () => {
  assert.match(beefMission, /const offNorth = p\.position\.z > WP\.z \+ WP\.rwyHalf - 20;/);
  assert.match(beefMission, /updateGroundRecovery\(dt\) \{/);
  assert.match(beefMission, /const HOME_GROUND_PHASES/);
  // And the failure copy must name the button that actually exists.
  const fail = beefMission.slice(beefMission.indexOf('fail(reason) {'));
  assert.match(fail.slice(0, 1400), /Restart scene/,
    'before the first checkpoint the menu says Restart scene, so the copy must too');
});

/* ---------------- 10. the campaign seam ---------------- */

test('the landing quality and the rank are two different fields', () => {
  const proto = MissionController.prototype;
  const fake = {
    score: { finalLanding: 0.95, damage: 0.1 },
    physics: { damage: { tireBurst: false } },
  };
  assert.equal(proto.landingQualityToken.call(fake), 'perfect');
  fake.score.finalLanding = 0.8;
  assert.equal(proto.landingQualityToken.call(fake), 'greased');
  fake.score.finalLanding = 0.6;
  assert.equal(proto.landingQualityToken.call(fake), 'clean');
  fake.score.finalLanding = null;
  assert.equal(proto.landingQualityToken.call(fake), 'unknown');
  // A bent aeroplane is never a greaser however softly it arrived.
  fake.score.finalLanding = 0.95;
  fake.score.damage = 0.5;
  assert.equal(proto.landingQualityToken.call(fake), 'rough');
  // Everything it can say is a token the readers understand.
  for (const q of ['perfect', 'greased', 'clean', 'rough', 'hard', 'unknown']) {
    assert.ok(LANDING_QUALITIES.includes(q));
  }
});

test('the end card lists what was earned, and only ids the save accepts', () => {
  const proto = MissionController.prototype;
  const bare = {
    score: { gunsDelivered: 0, cargoDamage: 1, mountainLanding: null },
    cargo: { packagesDelivered: 0 },
  };
  const everything = {
    score: { gunsDelivered: 3, cargoDamage: 0.05, mountainLanding: 0.9 },
    cargo: { packagesDelivered: 27 },
  };
  const few = proto.earnedUnlocks.call(bare);
  const all = proto.earnedUnlocks.call(everything);
  assert.deepEqual(few, ['prospectFlightJacket', 'brushrunnerAccess', 'tammyDashboardMug']);
  assert.equal(all.length, AIRSTRIP_UNLOCKS.length);
  for (const id of all) assert.ok(AIRSTRIP_UNLOCKS.includes(id), `${id} is not a campaign reward id`);
  assert.ok(all.length > few.length, 'a better run has to be worth more than a worse one');
  // And the words on the card come from the ids, not from a parallel list.
  assert.match(beefMission, /const unlockIds = this\.earnedUnlocks\(\);/);
  assert.match(beefMission, /unlocks: card\.unlockIds/);
});

/* ---------------- 12. "ending scene could be a bit better" ---------------- */

test('the ending gets everybody out and empties the aeroplane', () => {
  const ending = beefMission.slice(beefMission.indexOf('runEnding() {'));
  assert.match(ending.slice(0, 2600), /this\.exitCockpit\(\)/, 'the player watches it from the ground');
  assert.match(ending.slice(0, 2600), /this\.disembarkLou\(\)/);
  assert.match(ending.slice(0, 2600), /setCargoRamp\(true\)/, 'the crew needs a way in');
  assert.match(beefMission, /takeCrateToHangar\(i\) \{/, 'the crates actually move');
  assert.match(beefMission, /updateEnding\(dt\) \{/);
  // The card waits for the yard rather than a fixed timer.
  assert.doesNotMatch(ending.slice(0, 2600), /setTimeout\([\s\S]{0,120}showComplete/);
});

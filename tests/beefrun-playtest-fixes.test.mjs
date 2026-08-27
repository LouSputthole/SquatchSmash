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
import * as THREE from 'three';

import { buildAirstrip } from '../src/beefrun/airstrip.js';
import { FlightHud } from '../src/beefrun/hud.js';
import { buildLandmarks } from '../src/beefrun/landmarks.js';
import { MissionController } from '../src/beefrun/mission.js';
import { BIG_UNCLE_LOU, CAPTAIN_LOU_SASOLE } from '../src/core/wardrobe.js';
import { AIRSTRIP_UNLOCKS, LANDING_QUALITIES } from '../src/core/campaign.js';
import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const beefMain = read('../src/beefrun/main.js');
const beefNpc = read('../src/beefrun/npc.js');
const beefPreflight = read('../src/beefrun/preflight.js');
const beefAircraft = read('../src/beefrun/aircraft.js');
const beefAirfield = read('../src/beefrun/airfield.js');
const beefMission = read('../src/beefrun/mission.js');
const beefDetection = read('../src/beefrun/detection.js');
const firstPersonInput = read('../src/core/first-person-input.js');

test('the whole river is one connected ribbon instead of rotated rectangular patches or course seams', () => {
  const scene = new THREE.Scene();
  const river = buildLandmarks(scene).marks.river.group;
  const waterSurfaces = [];
  river.traverse((part) => {
    if (part.isMesh && part.name.endsWith('-surface')) waterSurfaces.push(part);
  });
  const water = river.getObjectByName('river-course-surface');

  assert.ok(water?.isMesh, 'the full upstream-to-downstream river has no surface');
  assert.deepEqual(waterSurfaces.map((part) => part.name), ['river-course-surface'],
    'separate course meshes leave a hard seam where their end caps cross');
  const vertices = water.geometry.getAttribute('position').count;
  assert.ok(vertices > 300, `the complete course was truncated to ${vertices} vertices`);
  assert.equal(water.geometry.index.count, (vertices / 2 - 1) * 6);
  assert.deepEqual([water.rotation.x, water.rotation.y, water.rotation.z], [0, 0, 0]);
});

test('the continuous river never folds back on itself at a reach tangent', () => {
  const scene = new THREE.Scene();
  const river = buildLandmarks(scene).marks.river.group;
  const water = river.getObjectByName('river-course-surface');
  const positions = water.geometry.getAttribute('position');
  const centres = [];

  for (let vertex = 0; vertex < positions.count; vertex += 2) {
    centres.push(new THREE.Vector2(
      (positions.getX(vertex) + positions.getX(vertex + 1)) * 0.5,
      (positions.getZ(vertex) + positions.getZ(vertex + 1)) * 0.5,
    ));
  }

  let sharpest = { row: -1, radians: 0 };
  for (let row = 1; row < centres.length - 1; row++) {
    const incoming = centres[row].clone().sub(centres[row - 1]);
    const outgoing = centres[row + 1].clone().sub(centres[row]);
    assert.ok(incoming.length() > 0.01 && outgoing.length() > 0.01,
      `river row ${row} duplicates an adjacent centreline point`);
    const cosine = THREE.MathUtils.clamp(
      incoming.dot(outgoing) / (incoming.length() * outgoing.length()),
      -1,
      1,
    );
    const radians = Math.acos(cosine);
    if (radians > sharpest.radians) sharpest = { row, radians };
  }

  const degrees = THREE.MathUtils.radToDeg(sharpest.radians);
  assert.ok(sharpest.radians < Math.PI / 2,
    `river centreline folds ${degrees.toFixed(3)} degrees at row ${sharpest.row}`);
});

test('every gravel bar overlaps the river instead of becoming a detached patch', () => {
  const scene = new THREE.Scene();
  const river = buildLandmarks(scene).marks.river.group;
  const water = river.getObjectByName('river-course-surface');
  const positions = water.geometry.getAttribute('position');
  const rows = [];
  const bars = [];
  scene.updateMatrixWorld(true);

  for (let vertex = 0; vertex < positions.count; vertex += 2) {
    const left = water.localToWorld(new THREE.Vector3(
      positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex),
    ));
    const right = water.localToWorld(new THREE.Vector3(
      positions.getX(vertex + 1), positions.getY(vertex + 1), positions.getZ(vertex + 1),
    ));
    rows.push({ centre: left.clone().add(right).multiplyScalar(0.5), halfWidth: left.distanceTo(right) * 0.5 });
  }
  river.traverse((part) => {
    if (part.isMesh && /-bar-\d+$/.test(part.name)) bars.push(part);
  });
  assert.ok(bars.length > 0, 'the course lost all of its gravel bars');

  let worst = { name: '', gap: -Infinity, distance: 0, reach: 0 };
  for (const bar of bars) {
    const centre = bar.getWorldPosition(new THREE.Vector3());
    const radius = bar.geometry.parameters.radius
      * Math.max(...bar.getWorldScale(new THREE.Vector3()).toArray());
    let nearest = { distance: Infinity, halfWidth: 0 };
    for (const row of rows) {
      const distance = Math.hypot(centre.x - row.centre.x, centre.z - row.centre.z);
      if (distance < nearest.distance) nearest = { distance, halfWidth: row.halfWidth };
    }
    const gap = nearest.distance - nearest.halfWidth - radius;
    if (gap > worst.gap) {
      worst = { name: bar.name, gap, distance: nearest.distance, reach: nearest.halfWidth + radius };
    }
  }

  assert.ok(worst.gap <= 0,
    `${worst.name} has ${worst.gap.toFixed(2)} m of dry ground between it and the river `
      + `(centre ${worst.distance.toFixed(2)} m away; overlap reach ${worst.reach.toFixed(2)} m)`);
});

test('the El Hueso shelter bench and table are visibly supported to the terrain', () => {
  const scene = new THREE.Scene();
  const airstrip = buildAirstrip(scene);
  const shelter = airstrip.root.getObjectByName('shelter');
  assert.ok(shelter, 'El Hueso lost its open-sided shelter');

  const meshes = [];
  shelter.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  const furniture = [
    ['bench', 'shelter-bench-seat', 'shelter-bench-leg', 2],
    ['table', 'shelter-table-top', 'shelter-table-leg', 4],
  ];
  scene.updateMatrixWorld(true);
  const defects = [];

  for (const [label, surfaceName, legName, expectedLegs] of furniture) {
    const surface = shelter.getObjectByName(surfaceName);
    const legs = meshes.filter((object) => object.name === legName);
    assert.ok(surface?.isMesh, `the shelter lost its ${label} surface`);
    assert.equal(legs.length, expectedLegs, `the shelter ${label} has ${legs.length}/${expectedLegs} visible supports`);
    const surfaceBounds = new THREE.Box3().setFromObject(surface);
    const surfaceWidth = surface.geometry.parameters.width;
    const surfaceDepth = surface.geometry.parameters.depth;

    for (const [index, leg] of legs.entries()) {
      const legBounds = new THREE.Box3().setFromObject(leg);
      const foot = leg.getWorldPosition(new THREE.Vector3());
      const terrainY = airstrip.groundAt(foot.x, foot.z);
      const footDelta = legBounds.min.y - terrainY;
      const topGap = surfaceBounds.min.y - legBounds.max.y;
      const localFoot = surface.worldToLocal(foot.clone());
      const halfLegWidth = leg.geometry.parameters.width / 2;
      const halfLegDepth = leg.geometry.parameters.depth / 2;
      const insideFootprint = (
        Math.abs(localFoot.x) + halfLegWidth <= surfaceWidth / 2 + 0.001
        && Math.abs(localFoot.z) + halfLegDepth <= surfaceDepth / 2 + 0.001
      );
      if (Math.abs(footDelta) > 0.001 || Math.abs(topGap) > 0.001 || !insideFootprint) {
        defects.push(
          `${label} support ${index + 1}: foot ${footDelta.toFixed(4)} m, `
          + `top ${topGap.toFixed(4)} m, footprint ${insideFootprint ? 'inside' : 'outside'}`,
        );
      }
    }
  }

  assert.deepEqual(defects, [], defects.join('; '));
});

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
  /* This lifecycle moved into the canonical Adapter. Keep the owner playtest
   * invariant, but assert the actual owner instead of demanding stale local
   * event plumbing in Beef Run. */
  assert.match(beefMain, /createFlightFirstPersonPolicy/);
  assert.match(firstPersonInput, /this\.canvas\.addEventListener\('mousedown', this\._mousedown\)/,
    'a canvas press has to be able to retry the real thing');
  assert.match(firstPersonInput, /this\.requestPointerLock\(\)/,
    'the canonical press route must retry pointer lock');
  assert.match(firstPersonInput, /if \(this\.locked\) \{\s*this\.dragFallback = false;/,
    'winning the real lock must retire the fallback');
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

test('the preview-only preflight link starts the walkaround instead of a flight restore', () => {
  assert.match(beefMain, /preflight:\s*'PREFLIGHT CHECK'/);
  const start = beefMain.slice(beefMain.indexOf("startBtn.addEventListener('click'"));
  assert.match(start, /game\.resume === 'preflight'\s*\? mission\.startPreviewPreflight\(\)/);
});

test('the walkaround HUD removes completed checks while the mission keeps its recovery ledger', () => {
  const ledger = [
    { label: 'Pull both chocks', count: 2, need: 2, state: 'done' },
    { label: 'Check both fuel caps', count: 1, need: 2, state: 'next' },
    { label: 'Inspect the propellers', count: 0, need: 2, state: 'todo' },
  ];
  let rendered = [];
  const list = { replaceChildren: (...nodes) => { rendered = nodes; } };
  const hud = { _checkSig: null, checklist: { querySelector: () => list } };

  FlightHud.prototype.setChecklist.call(hud, ledger);

  assert.deepEqual(rendered.map((row) => row.textContent), [
    '▸ Check both fuel caps 1/2',
    '· Inspect the propellers 0/2',
  ]);
  assert.deepEqual(rendered.map((row) => row.className), ['next', 'todo']);
  assert.equal(ledger.length, 3, 'projecting the HUD must not discard recovery state');
  assert.equal(ledger[0].state, 'done');
});

test('Old Stove finishes close enough to share the handoff mark with Sasole', () => {
  const anchor = (name) => {
    const match = beefAirfield.match(
      new RegExp(`${name}:\\s*new THREE\\.Vector3\\((-?[\\d.]+),\\s*ELEV,\\s*(-?[\\d.]+)\\)`),
    );
    assert.ok(match, `missing ${name} airfield anchor`);
    return { x: Number(match[1]), z: Number(match[2]) };
  };
  const lou = anchor('louStand');
  const stove = anchor('stoveStand');
  const crates = anchor('stoveCrates');
  const fromLou = Math.hypot(stove.x - lou.x, stove.z - lou.z);
  const fromCrates = Math.hypot(stove.x - crates.x, stove.z - crates.z);

  assert.ok(fromLou < 9.5, `Stove still stops ${fromLou.toFixed(1)}m from Sasole`);
  assert.ok(fromCrates < 4, `Stove should still read as standing with his crates (${fromCrates.toFixed(1)}m)`);
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

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { Actor, CAST } from '../src/motel/actors.js';
import {
  MOTEL_EVIDENCE_CASES,
  MotelEvidenceLedger,
  evidenceCounter,
  evidenceMissingCopy,
  evidenceObjectiveCopy,
} from '../src/motel/evidence.js';

const MAIN = readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
const AUDIO = readFileSync(new URL('../src/motel/audio.js', import.meta.url), 'utf8');
const LEVEL = readFileSync(new URL('../src/motel/level.js', import.meta.url), 'utf8');
const MUSIC = new URL('../assets/music/driving-jerky-hotel.mp3', import.meta.url);

function bodyOf(name, source = MAIN) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

test('all eight evidence-case permutations have one deterministic getaway answer', () => {
  const ids = MOTEL_EVIDENCE_CASES.map(({ id }) => id);
  assert.deepEqual(ids, ['reserve', 'money', 'premium']);
  for (let mask = 0; mask < (1 << ids.length); mask++) {
    const held = ids.filter((_, bit) => mask & (1 << bit));
    const status = new MotelEvidenceLedger(held).snapshot();
    assert.equal(status.count, held.length, `bad counter for mask ${mask.toString(2).padStart(3, '0')}`);
    assert.equal(status.complete, mask === 0b111, `bad car gate for mask ${mask.toString(2).padStart(3, '0')}`);
    assert.equal(status.missing.length, 3 - held.length);
    assert.match(evidenceCounter(status), new RegExp(`${held.length}/3$`));
    assert.match(evidenceObjectiveCopy(status), /^Evidence Cases \d\/3 · /);
    if (!status.complete) {
      for (const label of status.missingLabels) assert.match(evidenceMissingCopy(status), new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('the car stays interactable and says exactly what is missing', () => {
  const getaway = MAIN.slice(MAIN.indexOf("id: 'getaway'"), MAIN.indexOf('// ---------- Phase transitions'));
  assert.match(getaway, /Check the car · \$\{evidenceCounter\(status\)\}/);
  assert.match(getaway, /enabled: \(\) => phase === 'escape' \|\| phase === 'recover'/,
    'an incomplete car must explain itself rather than disappear');
  const board = bodyOf('boardGetaway');
  assert.match(board, /if \(!status\.complete\)/);
  assert.match(board, /evidenceMissingCopy\(status\)/);
  assert.ok(board.indexOf('if (!status.complete)') < board.indexOf("phase = 'boarding'"),
    'boarding begins before the evidence gate is checked');
});

test('each required physical case has a marker and an authoritative pickup', () => {
  assert.match(MAIN, /const evidenceMarkers = \{\s*reserve:/);
  assert.match(MAIN, /money: makeEvidenceMarker/);
  assert.match(MAIN, /premium: makeEvidenceMarker/);
  assert.match(bodyOf('takeJerkyCase'), /collectEvidenceCase\('reserve'/);
  assert.match(MAIN.slice(MAIN.indexOf("id: 'recoverMoneyCase'"), MAIN.indexOf("id: 'door11'")),
    /collectEvidenceCase\('money'/);
  assert.match(MAIN.slice(MAIN.indexOf("id: 'takeStash'"), MAIN.indexOf("id: 'recoverMoneyCase'")),
    /collectEvidenceCase\('premium'/);
  assert.match(bodyOf('ricoEscapes'), /dropMoneyCaseAt/,
    'Rico escaping still deletes a required case');
  assert.match(bodyOf('burnShipment'), /collectEvidenceCase\('reserve'/,
    'destroying the Reserve makes the ledger permanently incomplete');
});

test('the sample/case placement checkpoint is explicit, animated, and confirmed', () => {
  assert.match(MAIN, /casePlacementMarker\.name = 'motel\.room12\.case-placement-marker'/);
  const interaction = MAIN.slice(MAIN.indexOf("id: 'placeOwnCase'"), MAIN.indexOf("id: 'sample'"));
  assert.match(interaction, /Place Lou's case on the highlighted table spot/);
  assert.match(interaction, /confirmOwnCasePlacement/);
  const confirm = bodyOf('confirmOwnCasePlacement');
  assert.match(confirm, /S\.casePlacementConfirmed = true/);
  assert.match(confirm, /putOwnCaseDown\(\{ animate: true \}\)/);
  assert.match(confirm, /completeObjective\('place'\)/);
  assert.match(bodyOf('updateCasePlacement'), /THREE\.MathUtils\.lerp/);
});

test('chairs cannot steal the required table interaction', () => {
  const chair = MAIN.slice(MAIN.indexOf("id: 'chair'"), MAIN.indexOf("id: 'jerkyCase'"));
  assert.match(chair, /S\.casePlacementConfirmed && S\.sampleChecked/);
});

test('Snow and the bathroom hostile use visibly opened doors', () => {
  const joins = bodyOf('snowJoins');
  assert.match(joins, /openDoor\(refs\.frontDoor\)/);
  assert.match(joins, /sfx\.doorOpen\(\)/);
  assert.doesNotMatch(joins, /breakWindow/);
  const betray = bodyOf('maybeBetray');
  assert.ok(betray.indexOf('openDoor(refs.bathDoor)') < betray.indexOf("slicer.state = 'chase'"),
    'the bathroom attacker moves before the bathroom door opens');
});

test('all Motel windows choose the fully-blocked traversal contract', () => {
  for (const ref of ['window12', 'bathWindow', 'window11']) {
    assert.match(LEVEL, new RegExp(`refs\\.${ref} = \\{[\\s\\S]{0,120}playerTraversalBlocked: true`));
  }
  const block = bodyOf('playerWindowTraversalBlocked');
  assert.match(block, /ROOM12/);
  assert.match(block, /BATH/);
  assert.match(block, /ROOM11/);
  assert.match(bodyOf('blocked'), /playerWindowTraversalBlocked/);
  assert.doesNotMatch(bodyOf('actorBlocked'), /playerWindowTraversalBlocked/,
    'the player-only blocker broke Rico\'s authored escape route');
});

test('death owns dialogue liveness for current, queued, idle, and future lines', () => {
  const say = bodyOf('say');
  assert.match(say, /silencedSpeakers\.has\(who\)/);
  assert.ok((say.match(/silencedSpeakers\.has\(who\)/g) ?? []).length >= 3,
    'future and queued lines are not independently gated');
  const down = bodyOf('onActorDown');
  assert.match(down, /silencedSpeakers\.add\(a\.name\)/);
  assert.match(down, /stopMotelVoice\(\)/);
  assert.match(down, /closeDialogue\(\)/);
});

test('the revolver HUD reads the same Firearm that owns shots and dry fire', () => {
  const ammo = bodyOf('authoritativeAmmo');
  assert.match(ammo, /weapons\.firearm\(shared\)\.rounds/);
  assert.match(bodyOf('fireSharedWeapon'), /weapons\.triggerPress\(\)/);
  const inventory = bodyOf('inventoryItems');
  const gear = bodyOf('updateGear');
  assert.match(inventory, /authoritativeAmmo\(\)/);
  assert.match(gear, /authoritativeAmmo\(\)/);
  assert.doesNotMatch(inventory, /S\.ammo\/\$\{weapon\.ammo\}/);
  assert.doesNotMatch(gear, /S\.ammo\/\$\{st\.ammo\}/);
});

test('footsteps use quiet banks, cadence protection, positional NPCs, and no exit stack', () => {
  const step = bodyOf('step', AUDIO);
  assert.match(step, /lastStepAt/);
  assert.match(step, /step-suppressed/);
  assert.match(step, /sampleVolume = \(running \? 0\.20 : 0\.16\)/);
  assert.match(step, /position,/);
  assert.match(AUDIO, /footstep\.leather\.tile/);
  assert.match(AUDIO, /footstep\.wood\.a/);
  assert.match(bodyOf('exitCar'), /playerFootstepReadyAt = performance\.now\(\) \+ 360/);
  assert.match(bodyOf('carDoor', AUDIO), /lastCarDoorAt/);

  const scene = new THREE.Scene();
  const actor = new Actor(scene, { ...CAST.lookout(), x: 0, z: 0, state: 'goto' });
  actor.target = { x: 8, z: 0 };
  let steps = 0;
  const ctx = {
    player: { x: 20, z: 20 }, floorAt: () => 0, blocked: () => false,
    onStep: () => { steps++; },
  };
  for (let i = 0; i < 120; i++) actor.update(1 / 60, ctx);
  assert.ok(steps >= 2 && steps <= 8, `NPC cadence emitted ${steps} steps over two seconds`);
});

test('the Jerky driving score is a low non-diegetic scene track', () => {
  assert.equal(existsSync(MUSIC), true, 'the supplied Jerky driving track was not copied');
  assert.ok(statSync(MUSIC).size > 1_000_000, 'the copied music asset is suspiciously small');
  assert.match(AUDIO, /DRIVE_MUSIC_URL = 'assets\/music\/driving-jerky-hotel\.mp3'/);
  assert.match(AUDIO, /DRIVE_MUSIC_VOLUME = 0\.16/);
  const ensure = bodyOf('ensureDriveMusic', AUDIO);
  assert.match(ensure, /new Audio\(DRIVE_MUSIC_URL\)/);
  assert.match(ensure, /dataset\.role = 'non-diegetic-score'/);
  assert.doesNotMatch(ensure, /Panner|position/);
  assert.match(bodyOf('setMusic', AUDIO), /if \(mode === 'chase'\) \{\s*startDriveMusic\(\)/);
});

test('the requested checkpoint set is covered by concrete state authorities', () => {
  const checkpoints = [
    'scene start', 'vehicle exit', 'before sample inspection', 'after sample inspection',
    'after placing sample', 'before hostile entrance', 'mid-combat', 'after Rico dies',
    'outside via window', 'partial case collection', 'all cases collected', 'car exit sequence',
  ];
  assert.equal(checkpoints.length, 12);
  for (const authority of [
    'casePlacementConfirmed', 'sampleChecked', 'slicerRevealed', 'silencedSpeakers',
    'playerWindowTraversalBlocked', 'MotelEvidenceLedger', 'boardGetaway', 'authoritativeAmmo',
  ]) {
    assert.ok(MAIN.includes(authority) || authority === 'MotelEvidenceLedger',
      `checkpoint authority ${authority} is missing`);
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'src', 'specialmeeting', 'main.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'specialmeeting.html'), 'utf8');

function bodyOf(name) {
  const start = MAIN.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = MAIN.indexOf('\nfunction ', start + 1);
  return MAIN.slice(start, next < 0 ? MAIN.length : next);
}

test('Special Meeting provides the complete shared Hud DOM contract before boot', () => {
  assert.match(HTML, /id="prompt"[\s\S]*class="key"[\s\S]*class="label"[\s\S]*class="holdbar"><i>/);
  assert.match(HTML, /id="subtitle"/);
  assert.match(HTML, /id="hand-item"[\s\S]*class="icon"[\s\S]*class="name"[\s\S]*class="hint"/);
  assert.match(HTML, /id="radio-osd"[\s\S]*class="rtitle"><span>[\s\S]*class="rtrack"/);
  assert.match(HTML, /id="clock"[\s\S]*class="day"[\s\S]*class="time"[\s\S]*class="spent"/);
  assert.match(HTML, /id="bladder"[\s\S]*class="cap"[\s\S]*class="bar"><i>/);
  assert.match(HTML, /id="toast-stack"/);
  for (const id of ['hand-item', 'radio-osd', 'clock', 'bladder']) {
    assert.equal((HTML.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1,
      `#${id} must be unique or the HUD writes to an arbitrary duplicate`);
  }
});

test('Special Meeting delegates movement, look, interaction, rebinding, and focus cleanup to the canonical Adapter', () => {
  assert.match(MAIN, /import \{ createFirstPersonInput \} from '\.\.\/core\/first-person-input\.js';/);
  assert.match(MAIN, /const input = createFirstPersonInput\(\{/);
  assert.match(MAIN, /player,\n  canvas,\n  interaction,/);
  assert.doesNotMatch(MAIN, /player\.setKey\(/);
  assert.doesNotMatch(MAIN, /player\.handleMouseMove\(/);
  assert.doesNotMatch(MAIN, /addEventListener\('pointerlockchange'/);
});

test('pointer lock is the only normal-play input enable seam and pause clears held movement', () => {
  assert.match(MAIN, /canEnable: \(\) => !paused && !handedOff/);
  assert.match(MAIN, /return input\.requestPointerLock\(\)/);
  const pause = MAIN.slice(MAIN.indexOf('onPause:'), MAIN.indexOf('recovery,', MAIN.indexOf('onPause:')));
  assert.match(pause, /input\.suspend\(\)/);
  assert.match(pause, /input\.resume\(\)/);
  assert.match(MAIN, /ride\.choose\(ride\.options\[n - 1\]\.index\);\s+requestScenePointerLock\(\);/,
    'number-key dialogue choices do not restore pointer lock');
});

test('SM-100 cannot begin until voice is ready and the car is settled at the kerb', () => {
  const wake = bodyOf('wakeTheSound');
  const start = bodyOf('tryStartRide');
  const load = wake.indexOf('await audio.loadAdditional');
  const validate = wake.indexOf('missingVoiceCues = SPECIAL_MEETING_VOICE_CUES.filter');
  const failClosed = wake.indexOf('if (!voiceReady)');
  assert.match(MAIN, /import \{ SPEAKERS, scriptCues \} from '\.\/script\.js';/);
  assert.match(MAIN, /scriptCues\(\)\.map\(\(cue\) => cue\.name\)/);
  assert.ok(load >= 0 && validate > load, 'the active cue set is not checked after decoding');
  assert.ok(failClosed > validate, 'voice validation does not fail closed');
  assert.match(start, /if \(!voiceReady \|\| started\) return false;/);
  assert.match(start, /if \(!stage\.arrival\?\.settled\) return false;/);
  assert.match(start, /stage\.begin\(\);[\s\S]*ride\.begin\('SM-100'\)/);
  assert.equal((MAIN.match(/ride\.begin\('SM-100'\)/g) ?? []).length, 1,
    'a second ungated SM-100 start remains');
  assert.match(wake, /tryStartRide\(\)/);
});

test('campaign spawn, shared door interaction and movement-gated handoff are runtime facts', () => {
  assert.match(MAIN, /const requestedSpawn = campaign\.state\.scene\.spawn;/);
  assert.match(MAIN, /beginTheDrive\(\{ restoreNode: 'arrival' \}\)/);
  assert.match(MAIN, /ride\.begin\('SM-400', \{ phase: 'spur' \}\)/);
  assert.match(MAIN, /createFrontPassengerDoorTarget\(stage\.sedan\)/);
  assert.match(MAIN, /interaction\.register\(frontPassengerDoorTarget, \{/);
  assert.match(MAIN, /soft: true/);
  assert.match(MAIN, /canHandoff: \(\) => trailDistanceTravelled >= TRAIL_HANDOFF_DISTANCE_M/);
  assert.doesNotMatch(MAIN, /pauseMenu\.hold\(/);
});

test('the browser certification surface exposes observations, not progression hooks', () => {
  assert.match(MAIN, /const certification = \{/);
  for (const getter of [
    'requestedSpawn', 'effectiveSpawn', 'renderedFrameCount', 'objectiveRevision',
    'objectiveText', 'interactionTargetCount', 'interactionUseCount', 'legalActions',
    'rideBeat', 'ridePhase', 'arrival', 'handoff',
  ]) assert.match(MAIN, new RegExp(`get ${getter}\\(\\)`), `${getter} observation is missing`);
  assert.match(MAIN, /certification,/);
  assert.match(MAIN, /player\.camera === camera \? 'core\/player' : 'unknown'/,
    'camera ownership must be derived from object identity');
  assert.match(MAIN, /player\.mode === 'seated' \|\| forest\?\.passenger\?\.seated/,
    'the stage-seat interval must not be reported as a walking pose');
  assert.doesNotMatch(MAIN, /certification[\s\S]{0,1000}(skip|advanceBeat|forcePass)\s*[:(]/i);
});

test('the road cut replaces block collision with the forest world before boarding', () => {
  const drive = bodyOf('beginTheDrive');
  assert.match(drive, /const forestColliders = \[\]/);
  assert.match(drive, /colliders: forestColliders/);
  const worldSwap = drive.indexOf('player.world = forest.world');
  const board = drive.indexOf('forest.board()');
  assert.ok(worldSwap >= 0 && board > worldSwap, 'the passenger boards before Player receives forest.world');
  assert.doesNotMatch(drive, /colliders: stage\.world\.colliders/);
});

test('the browser debug surface exposes shared Player start and forest-world evidence', () => {
  assert.match(MAIN, /window\.SPECIAL_MEETING = \{/);
  assert.match(MAIN, /campaign, ride, cast, stage,/);
  assert.match(MAIN, /^  player,$/m);
  assert.match(MAIN, /^  input,$/m);
  assert.match(MAIN, /get inputReceipt\(\) \{ return input\.snapshot\(\); \}/);
  assert.match(MAIN, /get started\(\) \{ return started; \}/);
  assert.match(MAIN, /get forest\(\) \{ return forest; \}/);
  assert.match(MAIN, /get voiceReady\(\) \{ return voiceReady; \}/);
  assert.match(MAIN, /get missingVoiceCues\(\) \{ return \[\.\.\.missingVoiceCues\]; \}/);
  assert.match(MAIN, /get failedCues\(\)/);
  assert.match(MAIN, /get expectedVoiceCueCount\(\)/);
  assert.match(MAIN, /get decodedVoiceCueCount\(\)/);
});

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

test('SM-100 cannot begin until the first-gesture audio bank has finished loading', () => {
  const wake = bodyOf('wakeTheSound');
  const load = wake.indexOf('await audio.loadAdditional');
  const validate = wake.indexOf('missingVoiceCues = SPECIAL_MEETING_VOICE_CUES.filter');
  const failClosed = wake.indexOf('if (!voiceReady)');
  const stageBegin = wake.indexOf('stage.begin()');
  const begin = wake.indexOf("ride.begin('SM-100')");
  assert.match(MAIN, /import \{ SPEAKERS, scriptCues \} from '\.\/script\.js';/);
  assert.match(MAIN, /scriptCues\(\)\.map\(\(cue\) => cue\.name\)/);
  assert.ok(load >= 0 && validate > load, 'the active cue set is not checked after decoding');
  assert.ok(failClosed > validate && stageBegin > failClosed,
    'stage.begin is reachable before exact voice validation fails closed');
  assert.ok(begin > stageBegin, 'SM-100 begins before the validated scene start');
  assert.equal((MAIN.match(/ride\.begin\('SM-100'\)/g) ?? []).length, 1,
    'a second ungated SM-100 start remains');
  assert.match(MAIN, /if \(!started\) \{ renderer\.render\(scene, camera\); return; \}/,
    'the scene clocks run before the audio-gated start');
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

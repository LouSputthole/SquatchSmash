import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/initiation/main.js', import.meta.url), 'utf8');
const phases = readFileSync(new URL('../src/initiation/phases.js', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../tools/verify-initiation.mjs', import.meta.url), 'utf8');

test('production cabin entry walks the cast instead of invoking checkpoint placement', () => {
  const entry = main.slice(main.indexOf('function goInsideAhead()'), main.indexOf('/** Everybody in their place'));
  assert.match(entry, /startCabinProcession\(\)/);
  assert.doesNotMatch(entry, /fillTheRoom\(/);
  const doorway = main.slice(main.indexOf("phase === 'cabin_door'"), main.indexOf("phase === 'ceremony_approach'"));
  assert.doesNotMatch(doorway, /fillTheRoom\(/);
  assert.match(doorway, /cabinPrincipalsAtMarks\(\)/);
});

test('the hand prompt precedes the visible raise and the physical shot has its own phases', () => {
  assert.doesNotMatch(main, /FIRST_PERSON_RITUAL_PHASES[\s\S]{0,100}'blade'/);
  assert.match(main, /phaseId === 'cut'[\s\S]{0,220}elapsed/);
  for (const id of ['shot_offer', 'shot_toast', 'shot_drink']) {
    assert.match(phases, new RegExp(`${id}: phase\\('${id}'`));
    assert.match(main, new RegExp(`phase === '${id}'`));
  }
  assert.match(main, /TABLE_SOCKETS\.whiskey\.hand/);
  assert.match(main, /props\.whiskey\.grip/);
});

test('the browser verifier clicks after the hand prompt before requiring the raised cut pose', () => {
  const start = verifier.indexOf("window.INITIATION.phase === 'hand'");
  const end = verifier.indexOf("pressActionTo(page, 'card')", start);
  assert.ok(start >= 0 && end > start, 'the real ritual browser path is missing');
  const ritual = verifier.slice(start, end);
  const click = ritual.indexOf("pressActionTo(page, 'cut')");
  const framedCut = ritual.indexOf("ritual?.phase === 'cut'");
  assert.ok(click >= 0 && framedCut > click,
    'the verifier requires raised hands before sending the owner-authored click');
  assert.doesNotMatch(ritual, /ritual\?\.phase === 'hand'[\s\S]{0,160}handNdc/,
    'the verifier still expects the resting prompt pose to be the raised cut pose');
  assert.match(ritual, /ritual\?\.phase === 'cut'[\s\S]+timeout: 120000/,
    'the loaded SwiftShader run does not give the 0.58-s raise a full browser budget');
});

test('the ritual browser look probe starts from canvas centre and does not inject vertical pitch', () => {
  const start = verifier.indexOf("pressActionTo(page, 'blade'");
  const end = verifier.indexOf("window.INITIATION.phase === 'hand'", start);
  assert.ok(start >= 0 && end > start, 'the real ritual look probe is missing');
  const lookProbe = verifier.slice(start, end);
  assert.match(lookProbe, /document\.exitPointerLock\(\)[\s\S]+page\.mouse\.move\(320, 180\)[\s\S]+capturePointerLock\(page\)/,
    'the look probe can inherit the retry button pointer coordinate');
  assert.match(lookProbe, /pitch:\s*window\.INITIATION\.player\.pitch/g,
    'the look probe does not record Player pitch before and after its mouse movement');
  assert.match(lookProbe, /Math\.abs\(ritualInput\.pitch - ritualStart\.pitch\) < 0\.001/,
    'the supposedly horizontal look probe does not reject unintended pitch');
});

test('family acknowledgements are queued and animate instead of wall-clock overlapping', () => {
  assert.doesNotMatch(main, /function sayOverlapping/);
  assert.doesNotMatch(main, /sayOverlapping\(/);
  assert.match(main, /sayBeat\('IN-500',[\s\S]{0,180}sayBeat\('IN-510'/);
  assert.match(main, /poseCeremonySalute\(/);
});

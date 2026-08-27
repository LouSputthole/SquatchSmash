import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/initiation/main.js', import.meta.url), 'utf8');
const phases = readFileSync(new URL('../src/initiation/phases.js', import.meta.url), 'utf8');

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

test('family acknowledgements are queued and animate instead of wall-clock overlapping', () => {
  assert.doesNotMatch(main, /function sayOverlapping/);
  assert.doesNotMatch(main, /sayOverlapping\(/);
  assert.match(main, /sayBeat\('IN-500',[\s\S]{0,180}sayBeat\('IN-510'/);
  assert.match(main, /poseCeremonySalute\(/);
});

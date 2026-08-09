import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST } from '../src/bing/license-to-grill.js';

const bingMain = readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');
const optionalStart = bingMain.indexOf('function optionalObjectives()');
const optionalEnd = bingMain.indexOf('function repaintObjectives()', optionalStart);
const optionalObjectivesSource = bingMain.slice(optionalStart, optionalEnd);

test('Bada Bing One shows Help Au Gratin in the back room as a real objective', () => {
  assert.equal(QUEST.objective, 'Help Au Gratin in the back room');
  assert.ok(optionalStart >= 0 && optionalEnd > optionalStart,
    'the public optional-objective builder is not present');
  assert.match(optionalObjectivesSource,
    /if \(!isSecondVisit\)[\s\S]*?id: 'grill',[\s\S]*?text: LICENSE_TO_GRILL_QUEST\.objective,[\s\S]*?optional: false/,
    'the first-visit HUD does not expose the requested Gratin objective');
  assert.match(bingMain,
    /window\.__bing = \{[\s\S]*?optionalObjectives/,
    'the browser verification seam no longer exposes optionalObjectives()');
  assert.match(bingMain,
    /function loadLicenseToGrillProgress\(\)[\s\S]*?getItem\(LICENSE_TO_GRILL_KEY\)/,
    'a reload never reads the required objective completion back');
  assert.match(bingMain,
    /initialPersisted: loadLicenseToGrillProgress\(\)/,
    'the stored completion is not supplied to the room runtime');
});

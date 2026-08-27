import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST } from '../src/bing/license-to-grill.js';
import { Mission } from '../src/bing/mission.js';

const bingMain = readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');
const hotdogMain = readFileSync(new URL('../src/bing/hotdog-main.js', import.meta.url), 'utf8');
const optionalStart = bingMain.indexOf('function optionalObjectives()');
const optionalEnd = bingMain.indexOf('function repaintObjectives()', optionalStart);
const optionalObjectivesSource = bingMain.slice(optionalStart, optionalEnd);

test('Bada Bing One shows Help Au Gratin as featured soft work, not an exit gate', () => {
  assert.equal(QUEST.objective, 'Help Au Gratin in the back room');
  assert.ok(optionalStart >= 0 && optionalEnd > optionalStart,
    'the public optional-objective builder is not present');
  assert.match(optionalObjectivesSource,
    /if \(!isSecondVisit\)[\s\S]*?id: 'grill',[\s\S]*?text: LICENSE_TO_GRILL_QUEST\.objective,[\s\S]*?optional: true,[\s\S]*?featured: true/,
    'the first-visit HUD does not expose the requested Gratin objective');
  assert.match(bingMain,
    /items: conciseObjectiveItems\(items, \{ optionalLimit: 1 \}\)/,
    'the first visit still sends its full mission and club ledgers to the HUD');
  assert.match(bingMain,
    /window\.__bing = \{[\s\S]*?optionalObjectives/,
    'the browser verification seam no longer exposes optionalObjectives()');
  assert.match(bingMain,
    /function loadLicenseToGrillProgress\(\)[\s\S]*?getItem\(LICENSE_TO_GRILL_KEY\)/,
    'a reload never reads the side-objective completion back');
  assert.match(bingMain,
    /initialPersisted: loadLicenseToGrillProgress\(\)/,
    'the stored completion is not supplied to the room runtime');
});

test('Bada Bing One exit and live objective share Lou’s completed briefing state', () => {
  const mission = new Mission();
  assert.equal(mission.objectives.find(({ id }) => id === 'margo').optional, true);
  assert.equal(mission.objectives.find(({ id }) => id === 'shot').optional, true);

  mission.reachedHallway();
  mission.enteredOffice();
  mission.parcelOut();
  mission.tookPackage();
  assert.equal(mission.flags.gotPackage, true);
  assert.equal(mission.readyToLeave, false,
    'the exit opened while the objective still said to let Lou finish');
  assert.equal(mission.objectives.find(({ id }) => id === 'listen').done, false);

  mission.louDone();
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.objectives.find(({ id }) => id === 'listen').done, true);
  assert.equal(mission.objectives.find(({ id }) => id === 'leave').done, false);
});

test('the HotDog Incident projects its durable ledger through the shared live objective panel', () => {
  assert.match(hotdogMain,
    /import \{ conciseObjectiveItems, createObjectivePanel \} from '\.\.\/core\/objective-panel\.js';/);
  assert.match(hotdogMain,
    /objectivePanel\.set\(\{[\s\S]*?items: conciseObjectiveItems\(mission\.objectives\.map/,
    'the second-visit ledger bypasses the shared active-objective projection');
  assert.doesNotMatch(hotdogMain, /li\.className\s*=\s*objective\.done/,
    'completed HotDog work is still rendered into the live list');
});

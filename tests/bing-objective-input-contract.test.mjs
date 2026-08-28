import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST } from '../src/bing/license-to-grill.js';
import { Mission } from '../src/bing/mission.js';
import { buildScripts, plainWords } from '../src/bing/script.js';

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
  assert.equal(mission.objectives.some(({ id }) => id === 'margo'), false,
    'the first objective card spoiled Margo before the player met her');
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
  assert.equal(mission.readyToLeave, false,
    'the cabin call cannot follow from a number Tony never received');
  assert.equal(mission.objectives.find(({ id }) => id === 'listen').done, true);
  assert.deepEqual(mission.objectives.find(({ id }) => id === 'margo'), {
    id: 'margo',
    text: 'Get Margo’s number before you go',
    done: false,
  });
  assert.equal(mission.objectives.some(({ id }) => id === 'leave'), false);

  assert.equal(mission.receivedMargoNumber(), true);
  assert.equal(mission.receivedMargoNumber(), false, 'the story beat is exact once');
  assert.equal(mission.flags.hasMargoNumber, true);
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.objectives.find(({ id }) => id === 'margo').done, true);
  assert.equal(mission.objectives.find(({ id }) => id === 'leave').done, false);
});

test('getting Margo’s number before Lou finishes preserves the player’s ordering', () => {
  const mission = new Mission();
  mission.reachedHallway();
  mission.enteredOffice();
  mission.parcelOut();
  mission.tookPackage();

  assert.equal(mission.receivedMargoNumber(), true);
  assert.equal(mission.objectives.some(({ id }) => id === 'margo'), false,
    'finishing the soft beat early should not add a completed spoiler objective');
  assert.equal(mission.readyToLeave, false, 'Lou still has to finish the briefing');

  mission.louDone();
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.objectives.some(({ id }) => id === 'margo'), false);
  assert.equal(mission.objectives.find(({ id }) => id === 'leave').done, false);
});

test('Margo gives Tony her number while the original tone choices remain available', () => {
  const mission = new Mission();
  const scripts = buildScripts({
    mission,
    flags: mission.flags,
    money: () => 100,
    drunkLevel: () => 0,
    spins: () => 0,
    hands: () => 0,
    asked: new Set(),
    order() {},
    request() {},
    sitAtTable() {},
    showParcel() {},
    showEnvelope() {},
    secondVisit: () => false,
  });

  assert.deepEqual(scripts.margo.open.options.map(({ tone }) => tone), [
    'Deny it', 'Ask', 'Leave it',
  ]);
  assert.deepEqual(scripts.margo.why.options.map(({ tone }) => tone), [
    'Ask', 'Offer', 'Leave it',
  ]);
  const number = scripts.margo.dinner.options.find(({ tone }) => tone === 'Number');
  assert.match(number.text, /Give me your number/);
  assert.match(number.cue(), /^vo\.bing\.full\.margo\.dinner\.tony\./);
  number.effect();
  assert.equal(mission.flags.hasMargoNumber, true);
  assert.match(plainWords(scripts.margo.number.line), /^That is my number\./);
  assert.match(scripts.margo.number.cue(), /^vo\.bing\.full\.margo\.number\.line\./);
  assert.notEqual(scripts.margo.number.cue(), 'vo.bing.margo.6');
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

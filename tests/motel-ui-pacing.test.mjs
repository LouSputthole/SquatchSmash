import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Inspection, rollShipment } from '../src/motel/jerky.js';

const html = fs.readFileSync(new URL('../motel.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('the Motel inventory sits bottom-centre instead of covering the bottom-right gear description', () => {
  const inventory = cssRule('body #scene-inventory-hands');
  const hotbar = cssRule('body #scene-inventory-hands #hotbar');
  const gear = cssRule('#gearBox');

  assert.match(inventory, /left:\s*0/);
  assert.match(inventory, /right:\s*0/);
  assert.match(inventory, /display:\s*flex/);
  assert.match(inventory, /justify-content:\s*center/);
  assert.match(hotbar, /width:\s*234px/,
    'five 40px content boxes, ten 1px borders and four 6px gaps need a non-collapsing width');
  assert.match(gear, /right:\s*18px/,
    'the gear description should retain its authored bottom-right home');
});

test('the inspection choices use the same centred decision space as mandatory dialogue', () => {
  const inspection = cssRule('#inspect');
  const list = cssRule('#inspectList');

  assert.match(inspection, /left:\s*50%/);
  assert.match(inspection, /right:\s*auto/);
  assert.match(inspection, /transform:\s*translate\(-50%,\s*-50%\)/);
  assert.match(inspection, /width:\s*min\(640px,\s*calc\(100vw\s*-\s*40px\)\)/);
  assert.match(list, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('starting the Motel raises the requested large survey-or-meeting brief', () => {
  const message = html.match(/<div id="surveyBrief"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    .replace(/\s+/g, ' ')
    .trim();
  const banner = cssRule('#surveyBrief');
  const shown = cssRule('#hud.visible.control-ready #surveyBrief');

  assert.equal(message,
    'Survey the Motel before going into your meeting or go right into it');
  assert.match(banner, /font-size:\s*clamp\(22px,\s*3vw,\s*36px\)/);
  assert.match(banner, /left:\s*50%/);
  assert.match(shown, /animation:\s*surveyBriefIn\s+10s/,
    'the banner should get a fresh readable hold when playable control begins');
  assert.doesNotMatch(html, /#hud\.visible #surveyBrief\s*\{/,
    'the ten-second banner still starts during the non-playable pull-in');
  assert.match(main, /function finishArrival\(\)[\s\S]*?classList\.add\('control-ready'\)/,
    'the survey banner is not started at the playable passenger-seat handoff');
});

test('the meeting primer distinguishes the player package from every supplier package before play', () => {
  const primer = html.match(/<div class="panel" id="dealPrimer">([\s\S]*?)<\/div>\s*<\/div>/)?.[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  assert.match(primer, /YOUR PACKAGE Lou's \$40,000 money case\. Keep it shut\./);
  assert.match(primer, /THEIR SAMPLE One Reserve strip for inspection\./);
  assert.match(primer, /THEIR PACKAGES Eight sealed packages in their case\. Count them\./);
  assert.match(primer,
    /THE ORDER Inspect their sample\. Count their packages\. Put your money down last\./);
});

test('inspection choices retain their authored positions and expose selected state', () => {
  const inspection = new Inspection(rollShipment(() => 0));
  const initial = inspection.choices();

  assert.deepEqual(initial.map(({ key }) => key), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.equal(initial[2].id, 'grain');
  assert.equal(initial[2].label, 'Inspect the grain');
  assert.equal(initial[2].selected, false);
  assert.equal(initial[2].disabled, false);

  inspection.run('grain');
  const after = inspection.choices();

  assert.equal(after.length, 8, 'a selected inspection should stay in its authored row');
  assert.deepEqual(after.map(({ key }) => key), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(after[2], {
    id: 'grain',
    key: '3',
    label: 'Inspect the grain',
    selected: true,
    disabled: true,
  });
});

test('authored inspection number keys do not retarget after an earlier choice is selected', () => {
  const inspection = new Inspection(rollShipment(() => 0));

  assert.ok(inspection.runKey('1'));
  assert.equal(inspection.runKey('1'), null, 'selected keys should be disabled');
  assert.ok(inspection.runKey('3'), 'key 3 should still mean Inspect the grain after key 1');
  assert.deepEqual([...inspection.done], ['smell', 'grain']);
  assert.equal(inspection.runKey('99'), null);
});

test('selected inspection rows visibly grey out', () => {
  const selected = cssRule('.insp.done');

  assert.match(selected, /opacity:\s*\.(?:3|4)\d?/);
  assert.match(selected, /color:\s*#8e99ad/);
  assert.match(selected, /filter:\s*grayscale\(1\)/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { mansionReturnObjective } from '../src/mansion/campaign.js';
import { SCENE_AUDIT_SCENES } from '../tools/scene-audit-scenes.mjs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Mansion Return has a focused real-input browser verifier', () => {
  const packageJson = JSON.parse(read('../package.json'));
  assert.equal(
    packageJson.scripts?.['verify:mansion-return'],
    'node tools/verify-mansion-return.mjs',
    'the focused verifier is not registered as an explicit package command',
  );

  const source = read('../tools/verify-mansion-return.mjs');
  assert.match(source, /['"]--use-gl=angle['"]/,
    'the verifier bypasses the established ANGLE SwiftShader path');
  assert.match(source, /['"]--use-angle=swiftshader['"]/,
    'the verifier does not select deterministic software rendering through ANGLE');
  assert.match(source, /mansion\.html\?visit=return(?![^'"`]*preview=1)/,
    'the verifier does not enter the canonical saved return visit');
  assert.match(source, /locator\(['"]#startBtn['"]\)\.click\(\)/,
    'the verifier bypasses the player-facing Start button');
  assert.match(source, /page\.keyboard\.down\(['"]w['"]\)/);
  assert.match(source, /page\.keyboard\.up\(['"]w['"]\)/);
  assert.ok((source.match(/page\.keyboard\.press\(['"]KeyE['"]\)/g) ?? []).length >= 2,
    'both Lou interactions must travel through real DOM KeyE input');
  assert.match(source, /interaction\.current/,
    'the verifier never proves Lou is the InteractionSystem crosshair target');
  assert.match(source, /userData\.npc\?\.name\s*===\s*['"]Big Uncle Lou['"]/,
    'the verifier identifies the briefing target by label alone rather than Lou\'s real NPC identity');
  assert.match(source, /Receive Lou's briefing/);
  assert.match(source, /M\.prompt\.key/,
    'the verifier does not prove the player-facing E affordance');
  assert.match(source, /wrongCityConfirmed/);
  assert.match(source, /sauceMissingConfirmed/);
  assert.match(source, /palaceLocationKnown/);
  assert.match(source, /briefingStarted\.mission\.status\s*===\s*['"]in_progress['"]/,
    'the verifier does not prove E starts the scene before the report commits');
  assert.match(source, /vo\.silentsquatch\.return\.briefing\.lou\.instrument/,
    'the verifier never observes Lou actually delivering the reveal');
  assert.match(source, /window\.mansion\.tick\(30, 1\)/,
    'the verifier never drains the real cast dialogue controller');
  assert.match(source, /completed\.captions\.length\s*===\s*6/,
    'the verifier can pass without the complete repaired-mansion scene');
  assert.match(source, /BRIEFING COMPLETE/);
  assert.match(source, /returnCount\s*===\s*1/);
  assert.match(source, /completeCount\s*===\s*1/);
  assert.match(source, /userData\?\.actor\?\.id\s*===\s*['"]snow['"]/,
    'the verifier never locates Snow through the real staged actor marker');
  assert.match(source, /getObjectByName\(['"]repairs-screed['"]\)/,
    'the verifier does not frame Snow with the damaged foyer geometry');
  assert.match(source, /getObjectByName\(['"]snow-repair-hammer['"]\)/,
    'the verifier never proves the real hand-socket hammer is present');
  assert.match(source, /window\.mansion\.framesRendered\s*>\s*previous/,
    'the repair motion is sampled without proving a rendered frame presented it');
  assert.match(source, /hammerTravel\s*>\s*0\.08/,
    'the verifier can pass without a readable hammer stroke');
  assert.match(source, /rootTravel\s*<\s*0\.002/,
    'the verifier does not reject Snow skating through the repair site');
  assert.match(source, /qa-snow-active-repair\.png/,
    'the verifier does not retain active-play visual evidence of the repair loop');
  assert.match(source, /cartel-palace\.html/);
  assert.match(source, /localStorage\.getItem\(key\)\s*===\s*null/,
    'the navigation init script would overwrite the completed briefing on Cartel load');
  assert.doesNotMatch(source, /campaign\.brief\s*\(/,
    'the verifier completes the briefing through the debug shortcut');
  assert.doesNotMatch(source, /\.onUse\s*\(/,
    'the verifier invokes Lou\'s private interaction handler directly');
  assert.doesNotMatch(source, /interaction\.press\s*\(/,
    'the verifier bypasses the scene\'s DOM input router');
});

test('the generic scene audit inventories every distinct post-heist runtime', () => {
  const scenes = Object.fromEntries(SCENE_AUDIT_SCENES.map((entry) => [entry.id, entry]));
  assert.equal(scenes['bing-two']?.url, 'bing.html?visit=2&preview=1',
    'the HotDog visit is still hidden behind the ordinary Bing audit');
  assert.equal(scenes['mansion-return']?.url, 'mansion.html?visit=return&preview=1',
    'the repaired-house briefing is absent from the generic scene inventory');
  assert.equal(scenes['cartel-palace']?.url, 'cartel-palace.html?preview=1',
    'the final palace is absent from the generic scene inventory');
  assert.equal(scenes.nowake?.url, 'nowake.html?preview=1',
    'hardening the inventory weakened the established NO WAKE preview isolation');
});

test('the canonical return pause objective follows Lou briefing progress', () => {
  assert.equal(mansionReturnObjective('in_progress'), "Receive Lou's briefing");
  assert.equal(mansionReturnObjective('complete'), 'Leave for the Cartel Palace');

  const source = read('../src/mansion/main.js');
  assert.match(source,
    /mansionVisit === 'return' && !mansionPreview\s*\? \(returnBriefingPlaying\s*\? 'Listen to Lou'\s*:\s*mansionReturnObjective\(mansionCampaign\.story\?\.mission\?\.status\)\)/,
    'the return-only pause objective does not distinguish receiving, listening, and leaving');
  assert.doesNotMatch(source,
    /status !== 'in_progress'[^;]+cast\?\.dialogue\?\.busy/,
    'an unrelated ambient bark can make Lou\'s visible briefing prompt refuse E');
});

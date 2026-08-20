/**
 * What NO WAKE says, and what it refuses to say.
 *
 * `docs/NO-WAKE-REDESIGN.md` is not mostly a list of lines — it is mostly a
 * list of things that must not happen. "Nobody delivers punchlines, nobody
 * flails around, and the body does not bounce off three railings like a haunted
 * pool noodle." Those are the contracts this file holds, because they are the
 * ones a later pass would quietly undo while adding something reasonable.
 *
 * The four it cares most about:
 *
 *  1. **The Negev is the blade, and it is set up once, elsewhere.** The line on
 *     the boat only works if the player has heard Willy tell that story before,
 *     and that foreshadow lives in the Bada Bing party — a different scene,
 *     a different generator, and therefore exactly the kind of link that gets
 *     lost.
 *  2. **Restraint.** No confession monologue, no thirty seconds of begging,
 *     nobody celebrating, and no joke after the shot.
 *  3. **Irish never abandons his lookout and never fires.** He is the reason
 *     this is a proceeding somebody can account for afterwards.
 *  4. **Every line has a manifest cue**, or it can never be recorded and
 *     nobody ever finds out — engine trap #3.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  NO_WAKE_BODY_LINES,
  NO_WAKE_CABIN_SCRIPT,
  NO_WAKE_DOCK_LINES,
  NO_WAKE_INLET_LINES,
  allNoWakeVoiceLines,
  buildNoWakeCruise,
} from '../src/nowake/dialogue.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { FAMILY } from '../src/bing/family.js';
import { HOTDOG_PARTY_CHATTER } from '../src/bing/hotdog-room-voices.js';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);
const cueNames = new Set((manifest.sfx || []).map((cue) => cue.name));
const main = fs.readFileSync(new URL('../src/nowake/main.js', import.meta.url), 'utf8');

test('every authored line carries a manifest cue and a cast voice', () => {
  const lines = allNoWakeVoiceLines();
  assert.ok(lines.length >= 35, `expected the full redesigned script, got ${lines.length} lines`);
  const voices = new Set(['lou', 'booski', 'willy', 'irish', 'player']);
  for (const line of lines) {
    assert.ok(voices.has(line.voice), `${line.cue} is cast to "${line.voice}", who is not on this boat`);
    assert.ok(
      cueNames.has(`vo.nowake.${line.cue}.1`),
      `vo.nowake.${line.cue}.1 is missing from the manifest — run npm run vo:nowake`,
    );
  }
  const ids = lines.map((line) => line.cue);
  assert.equal(new Set(ids).size, ids.length, 'two lines share a cue id');
});

test('the Negev question is the blade, and it is the only turn in the room', () => {
  const negev = NO_WAKE_CABIN_SCRIPT.find((line) => line.cue === 'cabin.lou.negev');
  assert.ok(negev, 'Lou never asks the question');
  assert.equal(negev.voice, 'lou');
  assert.match(negev.text, /Negev on B/);
  /* It has to be preceded by Willy telling the story, or the question is about
   * nothing, and by a pause long enough to be uncomfortable. */
  const before = NO_WAKE_CABIN_SCRIPT.slice(0, NO_WAKE_CABIN_SCRIPT.indexOf(negev));
  assert.ok(before.some((line) => /Negev/.test(line.text) && line.voice === 'willy'),
    'Willy never tells the story the question is about');
  assert.equal(negev.beat, 'stall', 'Lou has to wait first; the pause is the point');
});

test('Willy set the story up earlier in the campaign, at the Bing', () => {
  /* "The Negev lands harder if it has been heard once before." The foreshadow
   * is disposable chatter in a different scene with a different generator,
   * which makes it exactly the kind of link a later pass deletes without
   * noticing what it was for. */
  const spoken = HOTDOG_PARTY_CHATTER
    .flatMap((exchange) => exchange.lines)
    .filter((line) => line.who === 'Willy');
  const mirage = spoken.find((line) => /Mirage/.test(line.line) && /Negev/.test(line.line));
  assert.ok(mirage, 'Willy never mentions Mirage or the Negev at the party');
  assert.ok(cueNames.has(mirage.cue),
    `${mirage.cue} is missing from the manifest — run npm run vo:hotdog`);
});

test('nobody makes a speech, and nobody jokes after the shot', () => {
  /* "No confession monologue. No thirty seconds of begging. The restraint is
   * what makes it ugly." Willy's longest line after the question is nine
   * words; everything Lou says in the cabin is under six. */
  const negevIndex = NO_WAKE_CABIN_SCRIPT.findIndex((line) => line.cue === 'cabin.lou.negev');
  for (const line of NO_WAKE_CABIN_SCRIPT.slice(negevIndex)) {
    const words = line.text.split(/\s+/).length;
    assert.ok(words <= 9,
      `${line.cue} runs to ${words} words after the question; the scene is meant to close, not open`);
  }
  for (const line of Object.values(NO_WAKE_BODY_LINES)) {
    const words = line.text.split(/\s+/).length;
    assert.ok(words <= 11, `${line.cue} is a speech after the execution (${words} words)`);
    assert.ok(!/[!?]/.test(line.text), `${line.cue} is punctuated like a joke or a shout`);
  }
  // Lou never gets sentimental about it either.
  assert.ok(!Object.values(NO_WAKE_BODY_LINES).some((line) => /sorry|brother|love|had to/i.test(line.text)),
    'somebody has been given a eulogy');
});

test('the ride out always carries exactly one campaign-derived line', () => {
  const seen = new Set();
  for (const beefDetected of [false, true]) {
    for (const motelPoliceHeat of [0, 90]) {
      const cruise = buildNoWakeCruise({ beefDetected, motelPoliceHeat });
      assert.equal(cruise.length, 5, 'the ride out is five lines whatever the campaign did');
      const variant = cruise.filter((line) => (
        ['cruise.willy.strip', 'cruise.willy.sideways', 'cruise.willy.clean'].includes(line.cue)
      ));
      assert.equal(variant.length, 1,
        `beefDetected=${beefDetected} heat=${motelPoliceHeat} produced ${variant.length} variants`);
      seen.add(variant[0].cue);
      // And it is always Willy testing the water and getting nothing back.
      assert.equal(variant[0].voice, 'willy');
    }
  }
  assert.equal(seen.size, 3, 'one of the three campaign variants is unreachable');
});

test('the cue reworded from the old script did not keep the old cue id', () => {
  /* `vo.nowake.cruise.willy.motel.1.mp3` is on disk from the previous build and
   * carries different words. A reworded line takes a new cue id, or a delivered
   * recording plays under a subtitle nobody wrote. */
  const index = JSON.parse(
    fs.readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'),
  );
  const files = new Set(index.files || []);
  for (const line of allNoWakeVoiceLines()) {
    const file = `vo.nowake.${line.cue}.1.mp3`;
    if (!files.has(file)) continue;
    const cue = (manifest.sfx || []).find((entry) => entry.name === `vo.nowake.${line.cue}.1`);
    assert.equal(cue?.say, line.text,
      `${file} exists on disk but the script has rewritten ${line.cue}`);
  }
});

test('Irish keeps the lookout, keeps his hands empty, and stays out of the room', () => {
  const irish = allNoWakeVoiceLines().filter((line) => line.voice === 'irish');
  assert.equal(irish.length, 3, `Irish has ${irish.length} lines; he reports and nothing else`);
  for (const line of irish) {
    assert.ok(/clear|behind us/i.test(line.text),
      `${line.cue} is Irish saying something other than what is behind them`);
  }
  // He is never in the cabin script, because he never leaves the bow.
  assert.ok(!NO_WAKE_CABIN_SCRIPT.some((line) => line.voice === 'irish'),
    'Irish came below deck; he never abandons his lookout');
  // And no third gun goes out on this boat.
  assert.ok(!/irishGun/.test(main), 'Irish has been given a gun');
  assert.ok(!/npcShot\(boat\.cast\.irish/.test(main), 'Irish has been wired into the execution volley');
});

test('the man on the boat is the man from the Bing floor, not a second Irish', () => {
  const world = fs.readFileSync(new URL('../src/nowake/world.js', import.meta.url), 'utf8');
  const onTheFloor = FAMILY.find((member) => member.id === CHARACTER_IDS.IRISH);
  assert.ok(onTheFloor, 'Irish is not in the Bing Family roster');
  assert.equal(onTheFloor.photo, 'irish.png');
  assert.match(world, /irish: new Npc\(/);
  assert.match(world, /source\[CHARACTER_IDS\.IRISH\]\.model/);
  assert.match(world, /cast\.irish\.group\.userData\.characterId = CHARACTER_IDS\.IRISH/);
});

test('all three shooters fire, several rounds each, on the same beat', () => {
  /* The owner's complaint about the old scene: Lou and Booski were not visibly
   * firing. Every volley now drives the player, Lou and Booski within a tenth
   * of a second of each other, and there are four of them. */
  const volley = main.match(/const volleys = \[([^\]]*)\]/);
  assert.ok(volley, 'the execution no longer runs off an authored volley table');
  const beats = volley[1].split(',').map((n) => Number(n.trim()));
  assert.ok(beats.length >= 3 && beats.length <= 4,
    `three or four rounds each, not ${beats.length}`);
  assert.match(main, /npcShot\(boat\.cast\.lou/);
  assert.match(main, /npcShot\(boat\.cast\.booski/);
  assert.match(main, /playerShot\(\)/);
});

test('no comedy machinery survived into the redesign', () => {
  /* The scene may not wink, and the mission may not carry the old build's
   * failure reactions or its objective arrow over the man about to be shot. */
  const dialogue = fs.readFileSync(new URL('../src/nowake/dialogue.js', import.meta.url), 'utf8');
  for (const forbidden of [/haunted/i, /pool noodle/i]) {
    assert.ok(!forbidden.test(dialogue));
  }
  // The marker is used for the wrapping stages, never over a living man.
  assert.ok(!/bodyMarker\.visible = true/.test(main.split('function beginWrap')[0]),
    'the objective marker is switched on before the body is one');
  // Nothing plays music in this mission except a radio somebody turns off.
  assert.ok(!/startMusicLoop/.test(main), 'the mission has grown a musical cue');
});

test('the mission still honours the campaign contract at both ends', () => {
  assert.match(main, /createNoWakeStory/);
  assert.match(main, /story\.begin\(\)/);
  assert.match(main, /story\.complete\(\{/);
  assert.match(main, /navigateCampaign\(campaign, SCENE_IDS\.APARTMENT/);
  for (const checkpoint of ['dock', 'underway', 'open_water', 'execution', 'weighted']) {
    assert.ok(main.includes(`checkpointNoWake('${checkpoint}'`),
      `the ${checkpoint} checkpoint never reaches the durable checkpoint wrapper`);
  }
});

test('the spoken beats are reachable in the order the mission plays them', () => {
  const order = [
    ...NO_WAKE_DOCK_LINES,
    ...buildNoWakeCruise({}),
    ...Object.values(NO_WAKE_INLET_LINES),
    ...NO_WAKE_CABIN_SCRIPT,
    ...Object.values(NO_WAKE_BODY_LINES),
  ];
  // Every one of them is either played by name in main.js or comes out of a
  // list main.js walks, so nothing is authored and then orphaned.
  const referenced = new Set([
    ...[...main.matchAll(/NO_WAKE_BODY_LINES\.(\w+)/g)].map((m) => m[1]),
    ...[...main.matchAll(/NO_WAKE_INLET_LINES\.(\w+)/g)].map((m) => m[1]),
  ]);
  for (const key of Object.keys(NO_WAKE_BODY_LINES)) {
    assert.ok(referenced.has(key), `NO_WAKE_BODY_LINES.${key} is never spoken`);
  }
  for (const key of Object.keys(NO_WAKE_INLET_LINES)) {
    assert.ok(referenced.has(key), `NO_WAKE_INLET_LINES.${key} is never spoken`);
  }
  assert.match(main, /NO_WAKE_CABIN_SCRIPT/);
  assert.match(main, /state\.cruiseLines/);
  assert.ok(order.length >= 35);
});

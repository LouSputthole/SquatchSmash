/**
 * Irish is on the boat.
 *
 * NO WAKE was three men and a prospect: Lou, Booski, Willy. The Family's
 * procedure voice rides out with them so that the killing is a proceeding
 * somebody can account for afterwards — he counts the four people who knew,
 * he confirms Willy was asked, he keeps his hands empty, and he clears the
 * rail. He never fires; that is the whole point of him.
 *
 * These are the contracts that keep him from quietly falling out of the scene
 * again: the words, the manifest cue behind each of them, and the fact that
 * he is one identity with the man at the Bing rather than a second Irish.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  NO_WAKE_AFTERMATH_LINES,
  NO_WAKE_AMBIENT_LINES,
  NO_WAKE_BELOW_LINES,
  allNoWakeVoiceLines,
  buildNoWakeConfrontation,
} from '../src/nowake/dialogue.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { FAMILY } from '../src/bing/family.js';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);
const cueNames = new Set((manifest.sfx || []).map((cue) => cue.name));

function irishLines() {
  return allNoWakeVoiceLines().filter((line) => line.voice === 'irish');
}

test('Irish speaks on the ride out, in the confrontation, below decks, and on the way home', () => {
  const confrontation = buildNoWakeConfrontation({ beefDetected: false, motelPoliceHeat: 0 });

  assert.ok(
    NO_WAKE_AMBIENT_LINES.some((line) => line.voice === 'irish'),
    'Irish has nothing to say on the ride out',
  );
  assert.equal(
    confrontation.filter((line) => line.voice === 'irish').length, 2,
    'Irish must both count the four and confirm Willy was asked',
  );
  assert.ok(
    NO_WAKE_BELOW_LINES.some((line) => line.voice === 'irish'),
    'Irish never explains why his hands stay empty',
  );
  assert.equal(NO_WAKE_AFTERMATH_LINES.irishRail.voice, 'irish');
  assert.equal(NO_WAKE_AFTERMATH_LINES.irishNoBackHalf.voice, 'irish');
});

test('Irish says the same things whether or not the Beef Run and Motel went loud', () => {
  /* His two confrontation lines sit either side of the campaign-dependent
   * variants, so a hot Motel or a detected Beef Run must not lose him. */
  for (const beefDetected of [false, true]) {
    for (const motelPoliceHeat of [0, 90]) {
      const said = buildNoWakeConfrontation({ beefDetected, motelPoliceHeat })
        .filter((line) => line.voice === 'irish')
        .map((line) => line.cue);
      assert.deepEqual(
        said, ['reveal.irish.counted', 'reveal.irish.asked'],
        `Irish dropped out at beefDetected=${beefDetected} heat=${motelPoliceHeat}`,
      );
    }
  }
});

test('he is framed on camera when it is his turn to speak', () => {
  const director = fs.readFileSync(
    new URL('../src/nowake/camera-director.js', import.meta.url), 'utf8',
  );
  /* A `focus` with no shot behind it silently leaves the camera on whoever
   * spoke last, which reads as Lou saying Irish's lines. */
  for (const line of buildNoWakeConfrontation({ beefDetected: false, motelPoliceHeat: 0 })) {
    if (!line.focus) continue;
    assert.match(
      director, new RegExp(`\\b${line.focus}:\\s*\\{`),
      `no camera shot authored for the "${line.focus}" speaker`,
    );
  }
});

test('every line Irish has on the water carries a manifest cue', () => {
  const lines = irishLines();
  assert.ok(lines.length >= 6, `expected Irish's full pass, got ${lines.length} lines`);
  for (const line of lines) {
    assert.ok(
      cueNames.has(`vo.nowake.${line.cue}.1`),
      `vo.nowake.${line.cue}.1 is missing from the manifest — run npm run vo:nowake`,
    );
  }
});

test('the man on the boat is the man from the Bing floor, not a second Irish', () => {
  const world = fs.readFileSync(new URL('../src/nowake/world.js', import.meta.url), 'utf8');
  const onTheFloor = FAMILY.find((member) => member.id === CHARACTER_IDS.IRISH);

  assert.ok(onTheFloor, 'Irish is not in the Bing Family roster');
  assert.equal(onTheFloor.photo, 'irish.png');
  // The boat borrows the roster's own model and the same authoritative photo.
  assert.match(world, /irish: new Npc\(/);
  assert.match(world, /source\[CHARACTER_IDS\.IRISH\]\.model/);
  assert.match(world, /cast\.irish\.group\.userData\.characterId = CHARACTER_IDS\.IRISH/);
});

test('Irish never picks up a revolver', () => {
  /* Two guns go out on this boat and they belong to Lou and Booski. If a
   * third is ever handed to Irish, his account of the afternoon is worth
   * nothing and the scene loses the reason he came. */
  const main = fs.readFileSync(new URL('../src/nowake/main.js', import.meta.url), 'utf8');
  assert.ok(!/irishGun/.test(main), 'Irish has been given a gun');
  assert.ok(
    !/npcShot\(boat\.cast\.irish/.test(main),
    'Irish has been wired into the execution volley',
  );
});

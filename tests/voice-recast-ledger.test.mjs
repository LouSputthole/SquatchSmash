/**
 * A RECAST NOBODY CAN SEE.
 *
 * Owner, 2026-08-24, on the Jerky Motel: *"Does Rico use the same voice as
 * Capt Lou Sasole? I thought I heard his voice from one of the mansion gaurds
 * as well. Is that intentional? Can we double check that?"*
 *
 * The audit found no shared ElevenLabs id -- Rico's casting was provisional,
 * from the owner's Boston side-character pool, and simply read as the wrong
 * man. He supplied a replacement id, and that is where the interesting part
 * starts.
 *
 * CHANGING AN ID IN THE MANIFEST DOES NOT TOUCH THE MP3s. The id is an
 * instruction to the generator; the takes on disk keep the old performer until
 * somebody re-renders them. `assets/sfx/takes.json` exists to catch exactly
 * that -- it stamps the `voiceId` a take was rendered with -- but only on takes
 * IT rendered. Everything older is stamped `"assumed"` and carries no voice, on
 * purpose, because guessing from today's manifest would be false confidence in
 * a different column.
 *
 * All thirty-nine of Rico's takes are `assumed`. So the one character the owner
 * asked about is the one the drift check is blind to: recast him and the game
 * keeps shipping the voice he complained about, with every gate green.
 *
 * This file is the gate for that hole. A profile that has been recast has to be
 * declared in `assets/sfx/rerecord.json` under `recast`, and its entry has to
 * agree with the manifest -- so the fact survives in the same place every other
 * stale recording is tracked, and a human reading the queue finds it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

test('every declared recast names a real profile and matches the manifest', () => {
  const manifest = read('assets/sfx/manifest.json');
  const queue = read('assets/sfx/rerecord.json');
  const recasts = queue.recast ?? [];
  for (const entry of recasts) {
    const profile = manifest.voices?.[entry.profile];
    assert.ok(profile, `rerecord.json declares a recast of "${entry.profile}", which is not a voice profile`);
    assert.equal(profile.id, entry.to,
      `${entry.profile} is cast as ${profile.id} in the manifest and the recast `
      + `entry says it should be ${entry.to}: one of the two has moved on without the other`);
    assert.notEqual(entry.from, entry.to, `${entry.profile}'s recast records no change`);
    assert.ok(entry.reason?.length > 40, `${entry.profile}'s recast records no reason`);
    assert.match(entry.regenerate ?? '', /npm run sfx/,
      `${entry.profile}'s recast does not say how to re-render the takes it invalidates`);
  }
});

test('a recast profile whose takes are unstamped stays in the queue until they are re-rendered', () => {
  /* The load-bearing one. `check:takes` compares a take's stamped voiceId
   * against the manifest, so it catches a recast on anything it rendered. On
   * `assumed` takes there is nothing to compare, and the entry in the queue is
   * the only record that the mp3s are stale. It may only be removed once the
   * takes carry a stamp, and that stamp has to be the NEW id. */
  const manifest = read('assets/sfx/manifest.json');
  const takes = read('assets/sfx/takes.json').takes ?? {};
  for (const entry of read('assets/sfx/rerecord.json').recast ?? []) {
    const owned = Object.entries(takes)
      .filter(([cue]) => cue.startsWith(entry.cuePrefix));
    assert.ok(owned.length > 0,
      `${entry.profile}'s recast names the prefix "${entry.cuePrefix}", which no take uses`);
    const stale = owned.filter(([, take]) => (
      take.source !== 'rendered' || take.voiceId !== entry.to
    ));
    assert.ok(stale.length > 0,
      `every ${entry.profile} take is now rendered on ${entry.to}, so the recast has `
      + 'landed and its entry should come out of assets/sfx/rerecord.json');
  }
});

test('Rico is the recast the owner asked for, and his takes are still the old voice', () => {
  /* Named rather than generic, because the point of the whole exercise is that
   * this specific character sounded like two other people. */
  const rico = (read('assets/sfx/rerecord.json').recast ?? [])
    .find((entry) => entry.profile === 'motel-rico');
  assert.ok(rico, 'the Motel Rico recast has been dropped from the queue');
  assert.equal(rico.to, '5sPGxVw5vqj7a08c5Xbw', 'Rico is not on the id the owner supplied');
  const manifest = read('assets/sfx/manifest.json');
  assert.equal(manifest.voices['motel-rico'].id, '5sPGxVw5vqj7a08c5Xbw');
  assert.match(manifest.voices['motel-rico']._note ?? '', /STILL THE OLD PERFORMER/,
    'the manifest no longer warns that Rico\'s recordings have not caught up with his casting');

  /* And nobody else has quietly been given his new id. */
  const sharing = Object.entries(manifest.voices)
    .filter(([name, profile]) => (
      name !== '_comment' && profile?.id === '5sPGxVw5vqj7a08c5Xbw'
    ))
    .map(([name]) => name);
  assert.deepEqual(sharing, ['motel-rico'],
    `Rico's new id is cast on ${sharing.join(', ')}: the fix for a shared voice is `
    + 'not a differently shared voice');
});

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
 * All thirty-nine of Rico's takes were `assumed`. So the one character the owner
 * asked about was the one the drift check was blind to: recast him and the game
 * keeps shipping the voice he complained about, with every gate green.
 *
 * This file is the gate for that hole. A profile that has been recast has to be
 * declared in `assets/sfx/rerecord.json` under `recast`, and its entry has to
 * agree with the manifest -- so the fact survives in the same place every other
 * stale recording is tracked, and a human reading the queue finds it.
 *
 * RESOLVED 2026-08-25. The thirty-nine takes were re-rendered on the new id, so
 * Rico's queue entry came out and the third test below now gates the landed
 * state instead of the pending one. The hole itself is only closed for HIM: the
 * ledger stamps a performer on takes it renders, and the great majority of this
 * game's takes predate it and are still `assumed`. The next recast of a
 * pre-ledger profile is invisible in exactly the same way, and the queue entry
 * these tests enforce is still the only thing that will catch it.
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

test('Rico is on the id the owner supplied, and his takes are that performer', () => {
  /* Named rather than generic, because the point of the whole exercise is that
   * this specific character sounded like two other people.
   *
   * This test used to assert the opposite: that the recast was still pending
   * and the mp3s were still the old man. That was the correct gate right up
   * until 2026-08-25, when the thirty-nine takes were re-rendered on the new
   * id. Flipping it rather than deleting it keeps the question the owner asked
   * -- "is this the same voice as somebody else?" -- being asked of every
   * future change to this profile. */
  const manifest = read('assets/sfx/manifest.json');
  assert.equal(manifest.voices['motel-rico'].id, '5sPGxVw5vqj7a08c5Xbw',
    'Rico is not on the id the owner supplied');

  /* The queue entry is gone because the work it tracked is done. If a take is
   * ever stale again, `check:takes` catches it directly now -- all thirty-nine
   * carry a stamp, so nothing has to be written down by hand. */
  const pending = (read('assets/sfx/rerecord.json').recast ?? [])
    .find((entry) => entry.profile === 'motel-rico');
  assert.equal(pending, undefined,
    'Rico is queued as a pending recast again: either his takes went stale, or '
    + 'the entry outlived the re-render that retired it');

  const takes = read('assets/sfx/takes.json').takes ?? {};
  const owned = Object.entries(takes).filter(([cue]) => cue.startsWith('vo.motel.rico.'));
  assert.ok(owned.length > 0, 'no vo.motel.rico.* take is in the ledger at all');
  const stale = owned.filter(([, take]) => (
    take.source !== 'rendered' || take.voiceId !== '5sPGxVw5vqj7a08c5Xbw'
  ));
  assert.deepEqual(stale.map(([cue]) => cue), [],
    'these Rico takes are not the performer the manifest casts him as');

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

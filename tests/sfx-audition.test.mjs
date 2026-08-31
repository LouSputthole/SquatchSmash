/**
 * The footstep/record sections of the sound audition page are only useful if
 * every file they offer to play actually exists and the airing rule they
 * display is the radio's real one. Both are pinned here so the page cannot
 * quietly drift into listing sounds that 404 or lying about what airs where.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  FOOTSTEP_AUDITION_GROUPS,
  FOOTSTEP_AUDITION_STORAGE_KEY,
  SONG_PICK_STORAGE_KEY,
  footstepAuditionFavorite,
  footstepWalkOffsets,
  songAuditionRows,
  songPicks,
} from '../src/core/sfx-audition.js';

test('every footstep candidate points at real audio and names where it plays', () => {
  assert.ok(FOOTSTEP_AUDITION_GROUPS.length >= 6);
  const seen = new Set();
  for (const group of FOOTSTEP_AUDITION_GROUPS) {
    assert.ok(group.candidates.length >= 2, group.id);
    for (const candidate of group.candidates) {
      assert.ok(candidate.where.length >= 1, candidate.id);
      assert.equal(candidate.files.length, candidate.filenames.length, candidate.id);
      for (const filename of candidate.filenames) {
        assert.ok(!seen.has(filename), `${filename} listed twice`);
        seen.add(filename);
        const file = new URL(`../assets/sfx/${filename}`, import.meta.url);
        assert.equal(fs.existsSync(file), true, `${candidate.id}: ${filename} is missing`);
        assert.ok(fs.readFileSync(file).length > 512, `${filename} is not usable audio`);
      }
    }
  }
  /* The full production footstep families are all on the card: nothing on
   * disk under footstep.* / motel.footstep.* escapes review. */
  const onDisk = fs.readdirSync(new URL('../assets/sfx/', import.meta.url))
    .filter((name) => /^(motel\.)?footstep\./.test(name));
  for (const name of onDisk) assert.ok(seen.has(name), `${name} is on disk but not auditionable`);
});

test('walk offsets are a real stride, favorites validate per group', () => {
  const offsets = footstepWalkOffsets();
  assert.ok(offsets.length >= 6);
  assert.equal(offsets[0], 0);
  const stride = offsets[1] - offsets[0];
  assert.ok(stride >= 0.3 && stride <= 0.7, `stride ${stride}s is not a walk`);
  assert.match(FOOTSTEP_AUDITION_STORAGE_KEY, /^squatchsmash\./);
  const group = FOOTSTEP_AUDITION_GROUPS[0];
  assert.equal(footstepAuditionFavorite({ [group.id]: group.candidates[0].id }, group.id), group.candidates[0].id);
  assert.equal(footstepAuditionFavorite({ [group.id]: 'not-a-take' }, group.id), null);
});

test('the record rows mirror Radio.playlist and read the real manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/music/manifest.json', import.meta.url), 'utf8'));
  const rows = songAuditionRows(manifest, { venue: 'countryside_cabin' });
  assert.equal(rows.length, manifest.tracks.length);
  for (const row of rows) {
    const file = new URL(`../assets/music/${row.file}`, import.meta.url);
    assert.equal(fs.existsSync(file), true, `${row.file} is missing`);
    /* The one rule, exactly as `Radio.playlist` filters: no cue, and no
     * venue or this venue. */
    const track = manifest.tracks.find((entry) => entry.file === row.file);
    const airs = track.cue !== true && (!track.venue || track.venue === 'countryside_cabin');
    assert.equal(row.airsHere, airs, row.file);
    assert.equal(row.cue, track.cue === true, row.file);
  }
  /* Scripted cues never read as programming. */
  assert.ok(rows.some((row) => row.cue && /scripted cue/.test(row.scopeLabel)));
  assert.match(SONG_PICK_STORAGE_KEY, /^squatchsmash\./);
  const [first, second] = rows.filter((row) => row.airsHere);
  assert.deepEqual(songPicks({ [first.file]: true, [second.file]: false, 'ghost.mp3': true }, rows), [first.file]);
});

test('the audition page hosts the footstep and record sections', () => {
  const page = fs.readFileSync(new URL('../weapon-sound-audition.html', import.meta.url), 'utf8');
  for (const needle of ['footsteps-head', 'records-head', 'WHERE IT PLAYS', 'Cabin pick', 'footstepWalkOffsets', 'songAuditionRows']) {
    assert.match(page, new RegExp(needle));
  }
  assert.match(page, /localStorage\.setItem\(FOOTSTEP_AUDITION_STORAGE_KEY/);
  assert.match(page, /localStorage\.setItem\(SONG_PICK_STORAGE_KEY/);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const EXPECTED = Object.freeze({
  'driving-jerky-hotel.mp3': '2D87A303768D67F2B0809AFFAC3663A4AE339CA2873D681604202999B647CD7F',
  'driving-the-take.mp3': 'C3E6744FAE7A85878A74876B429B23FB75160B1B88203F10B5D9BBAD66DE7192',
  'enola-pre-bomb-drop-approach.mp3': 'B72B9435426D9E54788D20B84B5A70A2EA564B4C592ADBBDDA99D8ACD0A6A6F4',
  'enola-escape-after-drop.mp3': 'D4A1876955339690DC733BABF56AE20A1B425F7CE985FED6CA6D15FB4BD62B02',
  'front-and-center-background-35c043f1.mp3': '35C043F1834D73A693BBE019F4D170ABF988A08EBEBD53F631C45E8BB0A8BD2A',
  'front-and-center-opening-b3b9d1cc.mp3': 'B3B9D1CCA44488EE43723A44A36C5B860A04EE7C0C2787922CE6436852B00E30',
});

test('all six delivered music masters are preserved byte-for-byte and registered as cues', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/music/manifest.json', ROOT), 'utf8'));
  const tracks = new Map(manifest.tracks.map((track) => [track.file, track]));
  for (const [file, expectedHash] of Object.entries(EXPECTED)) {
    const bytes = await readFile(new URL(`assets/music/${file}`, ROOT));
    assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), expectedHash, file);
    const track = tracks.get(file);
    assert.ok(track, `${file} is missing from the music manifest`);
    assert.equal(track.cue, true, `${file} was accidentally added to radio programming`);
    assert.equal(track.station, undefined, `${file} has a radio station despite being non-diegetic`);
    assert.equal(track.venue, undefined, `${file} has a world-space venue despite being non-diegetic`);
  }
});

test('the authored Silver and Enola edit points are explicit in data', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/music/manifest.json', ROOT), 'utf8'));
  const tracks = new Map(manifest.tracks.map((track) => [track.file, track]));
  assert.equal(tracks.get('front-and-center-opening-b3b9d1cc.mp3').start, 0);
  assert.equal(tracks.get('front-and-center-opening-b3b9d1cc.mp3').cutAt, 27);
  assert.equal(tracks.get('enola-pre-bomb-drop-approach.mp3').duration, 37.704);
  assert.equal(tracks.get('enola-escape-after-drop.mp3').duration, 148.2);
});

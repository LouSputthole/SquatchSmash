import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import { SHUBENATOR_SIGNATURE_TAKES } from '../src/core/shubenator-signature.js';
import { Mail } from '../src/arcade/mail.js';
import {
  getCharacter,
  resolveCharacterId,
  voiceProfileFor,
} from '../src/core/characters.js';
import {
  allHotDogVoiceLines,
  graveyardVoiceLines,
  hotDogPartyVoiceLines,
} from '../src/core/hotdog-voice-catalog.js';

/**
 * Closed-party lines authored since the last voice run.
 *
 * Recordings are produced centrally by the owner, not by whoever writes the
 * dialogue, so between an authoring session and the next run the script
 * legitimately runs ahead of the delivered takes. This list is how that stays
 * a fact somebody wrote down rather than a hole: the ledger assertion at the
 * bottom of this file allows exactly these cues to be unrecorded and nothing
 * else, so a line that was delivered and has since gone missing still fails,
 * and a NEW line nobody declared still fails.
 *
 * WHEN THE TAKES ARE DELIVERED, EMPTY THIS ARRAY. It should be `[]` in a
 * released state.
 */
const HOTDOG_CUES_AWAITING_RECORDING = [
  /* Authored 2026-08-19 with the closed-party pass: Sauce given a voice on
   * this floor at all (he had a body and no lines), the four people working
   * the room, Booski's second offer of a shot, and the three lines the
   * reordered ending needed -- Lou handing out the sweep once Billy is out of
   * the building, Lou sending the Prospect out the back, and Snow telling him
   * to pick the body up. Every one of them is also queued for the booth in
   * docs/audio/pending-bing-cues.json. */
  'vo.bing2.attack.sauce',
  'vo.bing2.booski.shot_offer',
  'vo.bing2.cleanup.the-van.sauce',
  'vo.bing2.lou.leave_now',
  'vo.bing2.lou.sweep_order',
  'vo.bing2.party.eleven-years.irish',
  'vo.bing2.party.eleven-years.sauce.1',
  'vo.bing2.party.eleven-years.sauce.2',
  'vo.bing2.party.fixed-it.gratin',
  'vo.bing2.party.fixed-it.sauce.1',
  'vo.bing2.party.fixed-it.sauce.2',
  'vo.bing2.party.the-corn.numbskull',
  'vo.bing2.party.the-corn.sauce.1',
  'vo.bing2.party.the-corn.sauce.2',
  'vo.bing2.party.warm-not-hot.sauce',
  'vo.bing2.sauce.plate',
  'vo.bing2.snow.carry',
  'vo.bing2.walkup.cleanup.bartender',
  'vo.bing2.walkup.cleanup.dealer',
  'vo.bing2.walkup.cleanup.sauce',
  'vo.bing2.walkup.cleanup.security',
  'vo.bing2.walkup.party.bartender',
  'vo.bing2.walkup.party.dealer',
  'vo.bing2.walkup.party.sauce.1',
  'vo.bing2.walkup.party.sauce.2',
  'vo.bing2.walkup.party.security.1',
  'vo.bing2.walkup.party.security.2',
];

test('Billy HotDog and Aubbie are stable characters without splitting Eric and Erican', () => {
  assert.deepEqual(
    {
      id: getCharacter(CHARACTER_IDS.BILLY_HOTDOG).id,
      name: getCharacter(CHARACTER_IDS.BILLY_HOTDOG).canonicalName,
      subtitle: getCharacter(CHARACTER_IDS.BILLY_HOTDOG).subtitleName,
      voice: voiceProfileFor(CHARACTER_IDS.BILLY_HOTDOG),
    },
    {
      id: 'billy_hotdog',
      name: 'Billy HotDog',
      subtitle: 'Billy HotDog',
      voice: 'hotdog',
    },
  );
  assert.deepEqual(
    {
      id: getCharacter(CHARACTER_IDS.AUBBIE).id,
      name: getCharacter(CHARACTER_IDS.AUBBIE).canonicalName,
      voice: voiceProfileFor(CHARACTER_IDS.AUBBIE),
    },
    { id: 'aubbie', name: 'Aubbie', voice: 'aubbie' },
  );
  assert.equal(resolveCharacterId('hotdog'), CHARACTER_IDS.BILLY_HOTDOG);
  assert.equal(resolveCharacterId('billy_hotdog'), CHARACTER_IDS.BILLY_HOTDOG);
  assert.equal(resolveCharacterId('erican'), CHARACTER_IDS.ERIC);
  assert.equal(resolveCharacterId('ericran'), CHARACTER_IDS.ERIC);
});

test('Aubbie is mentioned in the original apartment inbox before his party appearance', () => {
  const mail = new Mail();
  const reference = mail.messages.find((message) => message.body.join('\n').includes('Aubbie'));
  assert.ok(reference, 'the initial apartment inbox should establish Aubbie');
  assert.match(`${reference.subject}\n${reference.body.join('\n')}`, /buzzer/i);
});

test('the runtime party and graveyard scripts are the authoritative voice catalogs', () => {
  const party = hotDogPartyVoiceLines();
  const graveyard = graveyardVoiceLines();
  const all = allHotDogVoiceLines();

  assert.ok(party.length >= 20, 'party should preserve the full authored performance and attack');
  assert.ok(graveyard.length >= 15, 'graveyard should include memorials and the burial');
  assert.equal(all.length, party.length + graveyard.length);
  assert.equal(new Set(all.map((line) => line.cue)).size, all.length);
  assert.ok(party.every((line) => line.cue.startsWith('vo.bing2.')));
  assert.ok(graveyard.every((line) => line.cue.startsWith('vo.graveyard.')));
  assert.ok(all.every((line) => line.text && line.voice && line.speaker));

  assert.deepEqual(
    graveyard.filter((line) => line.cue.startsWith('vo.graveyard.arrival.')).map((line) => line.cue),
    [
      'vo.graveyard.arrival.snow.1',
      'vo.graveyard.arrival.prospect.1',
      'vo.graveyard.arrival.snow.2',
    ],
  );
  assert.deepEqual(
    graveyard.filter((line) => line.cue.startsWith('vo.graveyard.snow.bark.')).map((line) => ({
      cue: line.cue,
      text: line.text,
      voice: line.voice,
    })),
    [
      {
        cue: 'vo.graveyard.snow.bark.car',
        text: 'Car. Now. Room twelve is not getting cleaner while we stand here.',
        voice: 'snow',
      },
      {
        cue: 'vo.graveyard.snow.bark.plot',
        text: 'Fresh plot is past GeeWiz. Sauce\'s hole stays open.',
        voice: 'snow',
      },
    ],
  );

  assert.equal(party.find((line) => line.cue === 'vo.bing2.hotdog.last')?.voice, 'hotdog');
  assert.equal(party.find((line) => line.cue === 'vo.bing2.aubbie.bar')?.voice, 'aubbie');
  assert.equal(party.find((line) => line.cue === 'vo.bing2.lawnmower.heckle')?.voice, 'snow');
  assert.equal(
    party.find((line) => line.cue === SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath.cue)?.direction,
    SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath.direction,
  );
  assert.equal(graveyard.find((line) => line.cue === 'vo.graveyard.echo.alive')?.voice, 'echo');
});

test('the sound manifest mirrors every HotDog incident and graveyard line exactly', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
  const catalog = allHotDogVoiceLines();
  const byCue = new Map(manifest.sfx.map((cue) => [cue.name, cue]));

  for (const line of catalog) {
    assert.ok(manifest.voices[line.voice], `${line.cue} needs voice profile ${line.voice}`);
    assert.deepEqual(
      {
        say: byCue.get(line.cue)?.say,
        voice: byCue.get(line.cue)?.voice,
        direction: byCue.get(line.cue)?.direction ?? '',
      },
      { say: line.text, voice: line.voice, direction: line.direction ?? '' },
      line.cue,
    );
  }

  const authoredPrefixes = manifest.sfx.filter((cue) => (
    cue.name.startsWith('vo.bing2.') || cue.name.startsWith('vo.graveyard.')
  ));
  assert.equal(authoredPrefixes.length, catalog.length, 'stale renamed cues must be removed');
  for (const profile of ['hotdog', 'aubbie', 'snow', 'echo']) {
    assert.equal(typeof manifest.voices[profile].id, 'string', `${profile} needs a casting slot`);
  }
});

test('the generated recording handoff keeps a complete authored ledger after delivery', () => {
  const sheet = fs.readFileSync(new URL('../VOICE-LINES-TODO.md', import.meta.url), 'utf8');
  const catalog = allHotDogVoiceLines();
  const index = JSON.parse(fs.readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
  const recordedFiles = new Set(index.files);
  const recorded = catalog.filter((line) => recordedFiles.has(`${line.cue}.mp3`)).length;
  const outstandingCount = catalog.length - recorded;

  assert.match(sheet, /Complete authored ledger . The HotDog Incident and Squatch Graveyard/);
  assert.match(
    sheet,
    new RegExp(
      `${catalog.length} authored cue\\(s\\): ${recorded} \\*\\*RECORDED\\*\\*, `
      + `${outstandingCount} \\*\\*NEEDS RECORDING\\*\\*`,
    ),
  );
  for (const line of catalog) {
    assert.match(sheet, new RegExp(line.cue.replaceAll('.', '\\.') + '\\.mp3'));
    assert.ok(sheet.includes(JSON.stringify(line.text)), line.cue);
  }

  assert.match(sheet, /\*\*RECORDED\*\*.*vo\.bing2\.hotdog\.last\.mp3/);
  assert.match(sheet, /\*\*RECORDED\*\*.*vo\.graveyard\.inspect\.colton\.mp3/);
  assert.match(sheet, /"Colton\. His grave smells like Asian feet\. That is all I have\."/);

  assert.deepEqual(
    catalog.filter((line) => !recordedFiles.has(`${line.cue}.mp3`)).map((line) => line.cue).sort(),
    HOTDOG_CUES_AWAITING_RECORDING.slice().sort(),
    'authored lines with no delivered take must be declared in '
    + 'HOTDOG_CUES_AWAITING_RECORDING (and the list emptied once they are recorded)',
  );
});

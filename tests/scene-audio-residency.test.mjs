import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { graveyardVoiceLines, hotDogPartyVoiceLines } from '../src/core/hotdog-voice-catalog.js';
import {
  HOTDOG_AUDIO_CUE_NAMES,
  HOTDOG_AUDIO_PREFIXES,
  hotDogAudioLoadOptions,
  isHotDogAudioPreloadCue,
} from '../src/bing/hotdog-audio.js';
import {
  GRAVEYARD_AUDIO_CUE_NAMES,
  GRAVEYARD_AUDIO_PREFIXES,
  graveyardAudioLoadOptions,
  isGraveyardAudioPreloadCue,
} from '../src/graveyard/audio.js';
import { Radio } from '../src/core/radio.js';
import { allNoWakeVoiceLines } from '../src/nowake/dialogue.js';
import {
  NO_WAKE_AUDIO_CUE_NAMES,
  NO_WAKE_AUDIO_PREFIXES,
  isNoWakeAudioPreloadCue,
  noWakeAudioLoadOptions,
} from '../src/nowake/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Recorded cue names requested with literal play/startLoop calls in a scene.
 * Dynamic dialogue calls are covered separately from the authored catalog.
 */
function staticAudioCueNames(relativeFile) {
  const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
  const names = new Set();
  const call = /audio\.(play|startLoop)\(([^;]*?)\);/gs;
  for (const match of source.matchAll(call)) {
    const [, method, args] = match;
    if (method === 'startLoop') {
      const namedCue = args.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
      if (namedCue) {
        names.add(namedCue[1]);
        continue;
      }
    }
    const firstArgument = args.split(',')[0];
    for (const literal of firstArgument.matchAll(/['"]([^'"]+)['"]/g)) {
      names.add(literal[1]);
    }
  }
  return [...names];
}

test('HotDog preload covers every authored line and static scene sound without global audio', () => {
  const options = hotDogAudioLoadOptions();
  assert.deepEqual(options, {
    names: [...HOTDOG_AUDIO_CUE_NAMES],
    prefixes: [...HOTDOG_AUDIO_PREFIXES],
  });

  for (const line of hotDogPartyVoiceLines()) {
    assert.equal(isHotDogAudioPreloadCue(line.cue), true, line.cue);
  }
  for (const cue of staticAudioCueNames('src/bing/hotdog-main.js')) {
    assert.equal(isHotDogAudioPreloadCue(cue), true, cue);
  }

  assert.equal(isHotDogAudioPreloadCue('vo.graveyard.snow.done'), false);
  assert.equal(isHotDogAudioPreloadCue('vo.initiation.ceremony.open'), false);
});

test('Graveyard preload covers every memorial line and static scene sound without global audio', () => {
  const options = graveyardAudioLoadOptions();
  assert.deepEqual(options, {
    names: [...GRAVEYARD_AUDIO_CUE_NAMES],
    prefixes: [...GRAVEYARD_AUDIO_PREFIXES],
  });

  for (const line of graveyardVoiceLines()) {
    assert.equal(isGraveyardAudioPreloadCue(line.cue), true, line.cue);
  }
  for (const cue of staticAudioCueNames('src/graveyard/main.js')) {
    assert.equal(isGraveyardAudioPreloadCue(cue), true, cue);
  }

  assert.equal(isGraveyardAudioPreloadCue('vo.bing2.hogmama.set.1'), false);
  assert.equal(isGraveyardAudioPreloadCue('vo.motel.snow.open.1'), false);
});

test('NO WAKE preload covers its whole script, static sounds, and exact persistent-radio bank', () => {
  const radio = new Radio(
    { ready: false },
    { setRadio() {}, toast() {} },
    { hour: 12.75 },
    { canPlayNotice: () => false },
  );
  const radioCueNames = radio.preloadCueNames({ hours: [12.75, 15, 17] });
  const options = noWakeAudioLoadOptions(radioCueNames);

  assert.deepEqual(options, {
    names: [...new Set([...radioCueNames, ...NO_WAKE_AUDIO_CUE_NAMES])],
    prefixes: [...NO_WAKE_AUDIO_PREFIXES],
  });
  for (const cue of radioCueNames) {
    assert.equal(isNoWakeAudioPreloadCue(cue, radioCueNames), true, cue);
  }
  for (const line of allNoWakeVoiceLines()) {
    const cue = `vo.nowake.${line.cue}`;
    assert.equal(isNoWakeAudioPreloadCue(cue, radioCueNames), true, cue);
  }
  for (const cue of staticAudioCueNames('src/nowake/main.js')) {
    assert.equal(isNoWakeAudioPreloadCue(cue, radioCueNames), true, cue);
  }

  assert.equal(isNoWakeAudioPreloadCue('vo.bing2.hogmama.set.1', radioCueNames), false);
  assert.equal(isNoWakeAudioPreloadCue('vo.graveyard.snow.done', radioCueNames), false);
});

/* ================================================================== */
/* Late-scene residency banks (mansion / enolasquatch / cartel-palace)  */
/*                                                                       */
/* The three late scenes split their preload into start / nextBeat /     */
/* background banks (src/core/residency-banks.js). The hard rule the     */
/* checks below hold them to: no first line of any beat may ever play    */
/* before its recording is resident — every cue a beat needs is in that  */
/* beat's bank or an earlier one, and every beat boundary awaits (or     */
/* sync-gates on) the bank it speaks from.                               */
/* ================================================================== */

ensureThreeShim();
ensureDomShim();

const { createResidencyBanks } = await import('../src/core/residency-banks.js');
const {
  MANSION_BACKGROUND_SCOPES,
  MANSION_NEXT_BEAT_SCOPES,
  MANSION_NEXT_BEAT_ZONES,
  MANSION_START_SCOPES,
  mansionAudioBanks,
} = await import('../src/mansion/audio-banks.js');
const { enolaBankOfCue, isEnolaPreloadCue } = await import('../src/enolasquatch/audio.js');
const {
  allEnolaSquatchLines, BARKS: ENOLA_BARKS, barkCueOf,
} = await import('../src/enolasquatch/dialogue/script.js');
const { DialogueSystem } = await import('../src/enolasquatch/dialogue/DialogueSystem.js');
const {
  PALACE_BACKGROUND_BANK, PALACE_NEXT_BEAT_BANK, PALACE_START_BANK,
} = await import('../src/cartel-palace/audio-banks.js');
const {
  PALACE_ROOMS, createPalaceAcoustics, palaceRoomAt,
} = await import('../src/cartel-palace/acoustics.js');

const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));

function coveredBy(name, { names = [], prefixes = [] }) {
  return names.includes(name) || prefixes.some((prefix) => name.startsWith(prefix));
}

/* ---------------- the shared helper's contract ---------------- */

test('residency banks: start blocks, nextBeat settles behind it, boundaries observe the order', async () => {
  const order = [];
  const banks = createResidencyBanks({
    start: async () => { order.push('start'); return 'S'; },
    nextBeat: async () => { order.push('nextBeat'); return 'N'; },
    background: async () => { order.push('background'); return 'B'; },
  });
  assert.equal(banks.settled('start'), false);
  const startLoad = banks.loadStart();
  assert.equal(banks.pending('start'), true, 'pending must flip synchronously at the call');
  await startLoad;
  assert.equal(banks.settled('start'), true);
  assert.equal(banks.settled('nextBeat'), false, 'later banks never load at boot on their own');
  await banks.kickoff();
  assert.deepEqual(order, ['start', 'nextBeat', 'background'], 'sooner beats get the pipe first');
  assert.equal(banks.settled('nextBeat'), true);
  assert.equal(banks.settled('background'), true);
});

test('residency banks: a failed bank still settles, so a beat boundary can never deadlock', async () => {
  const banks = createResidencyBanks({
    start: async () => { throw new Error('network died'); },
    nextBeat: async () => { throw new Error('decode died'); },
  });
  await banks.whenNextBeat();
  assert.equal(banks.settled('start'), true);
  assert.equal(banks.settled('nextBeat'), true);
  /* An undefined bank settles too — the return visit has no basement run. */
  await banks.whenAllSettled();
  assert.equal(banks.settled('background'), true);
});

/* ---------------- the Mansion ---------------- */

test('Mansion: every script scope is banked, and no scope is banked twice', () => {
  const scriptSource = fs.readFileSync(path.join(ROOT, 'src/mansion/script.js'), 'utf8');
  const minted = new Set([...scriptSource.matchAll(/cue\('([a-z]+)'/g)].map((match) => match[1]));
  assert.ok(minted.size >= 20, `expected the whole script, saw ${minted.size} scopes`);
  const banked = [...MANSION_START_SCOPES, ...MANSION_NEXT_BEAT_SCOPES, ...MANSION_BACKGROUND_SCOPES];
  assert.equal(new Set(banked).size, banked.length, 'a scope in two banks decodes twice');
  for (const scope of minted) {
    assert.ok(banked.includes(scope), `scope "${scope}" fell out of every bank`);
  }
});

test('Mansion: the opening walk is start-bank, the basement is nextBeat, the evening is background', () => {
  for (const scope of ['arrival', 'gate', 'office', 'house', 'guards', 'bar']) {
    assert.ok(MANSION_START_SCOPES.includes(scope), scope);
  }
  for (const scope of ['cellar', 'corridor', 'delivery', 'execution', 'exit', 'completion']) {
    assert.ok(MANSION_NEXT_BEAT_SCOPES.includes(scope), scope);
  }
  assert.deepEqual([...MANSION_BACKGROUND_SCOPES], ['evening']);

  const banks = mansionAudioBanks('first');
  /* The first beat's own sounds: the case hum, the cast's cord cues and the
   * furniture foley all ride the start bank. */
  for (const name of ['silent.case.hum', 'bing.grill.cord.handoff', 'chair.sit']) {
    assert.ok(coveredBy(name, banks.start), name);
  }
  assert.ok(coveredBy('vo.silentsquatch.arrival.prospect.humming', banks.start));
  assert.ok(coveredBy('vo.silentsquatch.delivery.booski.deliveryboy', banks.nextBeat));
  assert.ok(!coveredBy('vo.silentsquatch.delivery.booski.deliveryboy', banks.start),
    'the basement must not block the start button');
  assert.ok(coveredBy('vo.silentsquatch.evening.stove.godfather', banks.background));

  /* Every recorded mansion take lands in exactly one bank. */
  for (const cue of soundManifest.sfx) {
    if (!cue.name.startsWith('vo.silentsquatch.')) continue;
    const homes = [banks.start, banks.nextBeat, banks.background]
      .filter((bank) => coveredBy(cue.name, bank)).length;
    assert.equal(homes, 1, `${cue.name} is in ${homes} banks`);
  }

  /* The return briefing folds the mission scopes into its start bank. */
  const returnBanks = mansionAudioBanks('return');
  assert.equal(returnBanks.nextBeat, null);
  assert.ok(returnBanks.start.prefixes.includes('vo.silentsquatch.aftermath.'));
  assert.ok(returnBanks.start.prefixes.includes('vo.silentsquatch.evening.'));
});

test('Mansion: the cellar boundary awaits by construction — zones held, resume paths awaited', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/mansion/main.js'), 'utf8');
  const mountSource = fs.readFileSync(path.join(ROOT, 'src/mansion/mission/mount.js'), 'utf8');

  /* Every zone that begins a basement beat is in the held set. */
  for (const id of ['cellar', 'bust', 'corridor', 'xxx', 'observation', 'stairs', 'cellarTop', 'officeReturn']) {
    assert.ok(MANSION_NEXT_BEAT_ZONES.has(id), id);
  }
  /* The mount consults residency BEFORE consuming a zone's one-shot id. */
  const gateAt = mountSource.indexOf('zoneAudioResident?.(id) === false');
  const consumeAt = mountSource.indexOf('speechGate.canSpeak(id,');
  assert.ok(gateAt > 0 && gateAt < consumeAt, 'residency gate must run first in canEnterZone');
  assert.match(mainSource, /zoneAudioResident: \(id\) => !MANSION_NEXT_BEAT_ZONES\.has\(id\)\n\s+\|\| mansionBanks\.settled\('nextBeat'\)/);

  /* The start bank blocks the click; the mission starts only after it. */
  const loadStartAt = mainSource.indexOf('await mansionBanks.loadStart()');
  const missionStartAt = mainSource.indexOf('silentSquatch?.mission.start()');
  assert.ok(loadStartAt > 0 && loadStartAt < missionStartAt);
  /* Both checkpoint-resume paths await the basement bank at the boundary. */
  assert.match(mainSource, /await mansionBanks\.whenNextBeat\(\);\n\s+jumpToCheckpoint\(mansionCampaignEntry\.checkpoint\)/);
  assert.match(mainSource, /\.then\(\(\) => mansionBanks\.whenNextBeat\(\)\)\n\s+\.then\(\(\) => jumpToCheckpoint\(wanted\)\)/);
});

/* ---------------- the Enola Squatch ---------------- */

test('Enola Squatch: every authored line maps to the bank its beat needs, and nothing leaves the scope', () => {
  for (const line of allEnolaSquatchLines()) {
    const bank = enolaBankOfCue(line.cue);
    if (line.bark) {
      assert.equal(bank, line.bark === 'walkaroundIdle' ? 'start' : 'nextBeat',
        `${line.cue} (bark ${line.bark})`);
      continue;
    }
    if (line.release) {
      /* The bomb-release picks speak at the drop — the far end of the night. */
      assert.equal(bank, 'background', `${line.cue} (release)`);
      continue;
    }
    const group = line.beat.split('.')[0];
    if (['call', 'hangar', 'preflight', 'nightfall', 'taxi'].includes(group)) {
      assert.equal(bank, 'start', `${line.cue} (${line.beat})`);
    } else if (['takeoff', 'climb', 'cruise', 'nav', 'detect', 'defense', 'fighters', 'auto', 'gun'].includes(group)) {
      assert.equal(bank, 'nextBeat', `${line.cue} (${line.beat})`);
    } else {
      assert.equal(bank, 'background', `${line.cue} (${line.beat})`);
    }
  }
  /* Barks: the apron pool loads with the apron; the flight pools follow. */
  assert.equal(enolaBankOfCue(barkCueOf('walkaroundIdle', 0, ENOLA_BARKS.walkaroundIdle[0].who)), 'start');
  assert.equal(enolaBankOfCue(barkCueOf('flakClose', 0, 'SASOLE')), 'nextBeat');
  /* Effects: the walkaround's shared one-offs are start; the wind bed and
   * rear gun are flight; the owner's blast clips are the far end. */
  assert.equal(enolaBankOfCue('switch.click'), 'start');
  assert.equal(enolaBankOfCue('footstep.grass'), 'start');
  assert.equal(enolaBankOfCue('enola.wind.high'), 'nextBeat');
  assert.equal(enolaBankOfCue('enolasquatch.gun.rear'), 'nextBeat');
  assert.equal(enolaBankOfCue('enola.blast.a'), 'background');
  assert.equal(enolaBankOfCue('enola.bomb.falling'), 'background');
  /* The banks partition the page's own scope: every manifest cue this page
   * may decode lands in one of the three. */
  for (const cue of soundManifest.sfx) {
    if (!isEnolaPreloadCue(cue)) continue;
    assert.ok(['start', 'nextBeat', 'background'].includes(enolaBankOfCue(cue.name)), cue.name);
  }
});

test('Enola Squatch: the dispatch gate holds a beat\'s first line until its bank settles', () => {
  const said = [];
  const hud = { say: (text) => said.push(text) };
  let banksPending = true;
  const dialogue = new DialogueSystem(hud, {
    audio: { line: () => 0 },
    canSpeak: () => !banksPending,
  });
  dialogue.play('hangar.reveal');
  /* Simulated clock; the bank is still decoding, so nothing dispatches. */
  for (let tick = 0; tick < 20; tick++) dialogue.update(0.5);
  assert.equal(dialogue.current, null);
  assert.equal(said.length, 0, 'a held line must not even subtitle');
  assert.ok(dialogue.busy, 'the queue holds the line rather than dropping it');
  banksPending = false;
  dialogue.update(0.5);
  assert.ok(dialogue.current, 'the beat begins on the first tick after the bank settles');
  assert.equal(said.length, 1);
  /* And the wiring in main.js actually is this gate. */
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/enolasquatch/main.js'), 'utf8');
  assert.match(mainSource, /canSpeak: \(line\) => !audioBanks\.pending\(enolaBankOfCue\(line\.cue\)\)/);
  assert.match(mainSource, /audioBanks\.kickoff\(\)/);
});

/* ---------------- the Cartel Palace ---------------- */

test('Palace: every static scene sound is start-bank; the finale speech is the dining door\'s bank', () => {
  for (const name of staticAudioCueNames('src/cartel-palace/main.js')) {
    assert.ok(coveredBy(name, PALACE_START_BANK), `${name} must not wait on a later bank`);
  }
  for (const cue of soundManifest.sfx) {
    if (!cue.name.startsWith('vo.palace.')) continue;
    assert.ok(coveredBy(cue.name, PALACE_NEXT_BEAT_BANK), cue.name);
    assert.ok(!coveredBy(cue.name, PALACE_START_BANK),
      'the confrontation must not block the start button');
  }
  /* The three room loops all decode before their startLoop picks a buffer. */
  for (const name of ['ambience.rain', 'ambience.palace.interior', 'ambience.palace.dining']) {
    assert.ok(coveredBy(name, PALACE_START_BANK), name);
  }
  assert.ok(coveredBy('ambience.city.night', PALACE_BACKGROUND_BANK));

  const mainSource = fs.readFileSync(path.join(ROOT, 'src/cartel-palace/main.js'), 'utf8');
  /* Await-at-the-boundary: the dining door owes the finale bank its await
   * BEFORE the door swings and the beat begins. */
  const awaitAt = mainSource.indexOf('await audioBanks.whenNextBeat();');
  const doorAt = mainSource.indexOf('palace.doors.openDiningRoom()');
  assert.ok(awaitAt > 0 && awaitAt < doorAt);
  /* The click blocks on the start bank only, then kicks the rest. */
  assert.match(mainSource, /await audioBanks\.loadStart\(\);\n\s+audioBanks\.kickoff\(\);/);
});

test('Palace acoustics: the room-at test reads the estate', () => {
  assert.equal(palaceRoomAt({ x: 14, z: 76 }), PALACE_ROOMS.exterior); // approach
  assert.equal(palaceRoomAt({ x: 8.6, z: 51 }), PALACE_ROOMS.exterior); // courtyard
  assert.equal(palaceRoomAt({ x: 14.3, z: 5.5 }), PALACE_ROOMS.foyer); // service wing entry
  assert.equal(palaceRoomAt({ x: -10.6, z: -6.8 }), PALACE_ROOMS.halls); // payment ledger
  assert.equal(palaceRoomAt({ x: 0, z: -25 }), PALACE_ROOMS.gallery);
  assert.equal(palaceRoomAt({ x: 0, z: -42 }), PALACE_ROOMS.dining);
  assert.equal(palaceRoomAt({ x: 0, z: -55 }), PALACE_ROOMS.exterior); // rear terrace
  /* Identity-stable singletons: the per-frame check allocates nothing. */
  assert.equal(palaceRoomAt({ x: 1, z: -25 }), palaceRoomAt({ x: -1, z: -30 }));
});

function loopAudioSpy() {
  const loops = new Map();
  const log = [];
  return {
    loops,
    log,
    startLoop(key, opts = {}) {
      if (loops.has(key)) return loops.get(key); // the engine's own idempotence
      const handle = { key, name: opts.name, volume: opts.volume };
      loops.set(key, handle);
      log.push({ op: 'startLoop', key, name: opts.name, volume: opts.volume });
      return handle;
    },
    stopLoop(key) {
      log.push({ op: 'stopLoop', key });
      loops.delete(key);
    },
    setLoopVolume(key, volume, ramp) {
      const handle = loops.get(key);
      if (handle) handle.volume = volume;
      log.push({ op: 'setLoopVolume', key, volume, ramp });
    },
    setLoopCutoff(key, hz, ramp) {
      log.push({ op: 'setLoopCutoff', key, hz, ramp });
    },
  };
}

test('Palace acoustics: room transitions crossfade gains monotonically and never restart a loop', () => {
  const audio = loopAudioSpy();
  const acoustics = createPalaceAcoustics(audio);

  acoustics.start({ x: 14, z: 76 });
  assert.deepEqual([...audio.loops.keys()], ['palace-night', 'palace-interior', 'palace-dining']);
  assert.equal(audio.loops.get('palace-night').volume, 0.052, 'full rain outdoors');
  assert.equal(audio.loops.get('palace-interior').volume, 0, 'no bed under the sky');

  /* Frames inside one room cost nothing. */
  const settledLength = audio.log.length;
  for (let frame = 0; frame < 240; frame++) acoustics.update({ x: 14, z: 70 - frame * 0.05 });
  assert.equal(audio.log.length, settledLength, 'no per-frame automation churn');

  /* Walk the dining axis: rain only ever ducks, the bed rises inward, and
   * the dining tone appears only at the deep end. */
  const rainAt = [];
  const bedAt = [];
  const toneAt = [];
  for (const at of [{ x: 14.3, z: 5.5 }, { x: 0, z: -6.8 }, { x: 0, z: -25 }, { x: 0, z: -42 }]) {
    acoustics.update(at);
    rainAt.push(audio.loops.get('palace-night').volume);
    bedAt.push(audio.loops.get('palace-interior').volume);
    toneAt.push(audio.loops.get('palace-dining').volume);
  }
  for (let step = 1; step < rainAt.length; step++) {
    assert.ok(rainAt[step] < rainAt[step - 1], `rain must duck with depth (${rainAt.join(' > ')})`);
  }
  assert.ok(bedAt[0] > 0 && bedAt[1] > bedAt[0], 'the foyer hears the bed rise inward');
  assert.ok(toneAt[0] === 0 && toneAt[3] > toneAt[2], 'the dining tone belongs to the deep rooms');
  /* Every change is a ramped crossfade, and nothing ever stops or restarts. */
  for (const entry of audio.log) {
    assert.notEqual(entry.op, 'stopLoop', 'a stopped loop is a click on the next room change');
    if (entry.op === 'setLoopVolume' || entry.op === 'setLoopCutoff') {
      assert.ok(entry.ramp > 0, `${entry.op} must ramp, not step`);
    }
  }
  assert.equal(audio.log.filter((entry) => entry.op === 'startLoop').length, 3);

  /* The in-memory death retry: start() again is a no-op on the loops, and
   * refresh() re-asserts the restored room's gains with a short ramp. */
  acoustics.start({ x: 0, z: -42 });
  assert.equal(audio.log.filter((entry) => entry.op === 'startLoop').length, 3,
    'startLoop stays idempotent per key');
  acoustics.refresh({ x: 14, z: 76 });
  assert.equal(acoustics.room, PALACE_ROOMS.exterior);
  assert.equal(audio.loops.get('palace-night').volume, 0.052);
  assert.equal(audio.loops.get('palace-dining').volume, 0);
  const volumeOps = audio.log.filter((entry) => entry.op === 'setLoopVolume');
  assert.ok(volumeOps[volumeOps.length - 1].ramp <= 0.1,
    'a restore re-asserts, it does not replay a doorway crossfade');
  /* And the retry path in main.js actually calls it after the restore. */
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/cartel-palace/main.js'), 'utf8');
  assert.match(mainSource, /restoreCombatCheckpoint\(snapshot\);\n\s+\/\* Gains re-asserted[^]*?acoustics\.refresh\(player\.position\);/);
});

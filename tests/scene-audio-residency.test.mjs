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

function readSource(relativeFile) {
  return fs.readFileSync(path.join(ROOT, relativeFile), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Recorded cue names requested with literal play/startLoop calls in a scene.
 * Dynamic dialogue calls are covered separately from the authored catalog.
 */
function staticAudioCueNames(relativeFile) {
  const source = readSource(relativeFile);
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
  MANSION_RETURN_SCOPES,
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
  const scriptSource = readSource('src/mansion/script.js');
  const minted = new Set([...scriptSource.matchAll(/cue\('([a-z]+)'/g)].map((match) => match[1]));
  assert.ok(minted.size >= 20, `expected the whole script, saw ${minted.size} scopes`);
  const banked = [
    ...MANSION_START_SCOPES, ...MANSION_NEXT_BEAT_SCOPES,
    ...MANSION_BACKGROUND_SCOPES, ...MANSION_RETURN_SCOPES,
  ];
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
  const returnBanks = mansionAudioBanks('return');
  for (const cue of soundManifest.sfx) {
    if (!cue.name.startsWith('vo.silentsquatch.')) continue;
    const homes = [banks.start, banks.nextBeat, banks.background]
      .filter((bank) => coveredBy(cue.name, bank)).length;
    /* THE ONE SCOPE THE MISSION VISIT MUST NOT CARRY. `return` is the morning
     * after -- the guards acknowledging the siege, Snow quoting six weeks for
     * the foyer -- and none of it is reachable on the night of the mission, so
     * a take of it in the mission's start bank is a decode in front of the
     * start button for a line nobody can hear. It belongs to the return visit
     * and to nothing else. */
    if (cue.name.startsWith('vo.silentsquatch.return.')) {
      assert.equal(homes, 0, `${cue.name} is a return-visit line, banked on the mission night`);
      assert.ok(coveredBy(cue.name, returnBanks.start), `${cue.name} is in no return bank`);
      continue;
    }
    assert.equal(homes, 1, `${cue.name} is in ${homes} banks`);
  }

  /* The return briefing folds the mission scopes into its start bank. */
  assert.equal(returnBanks.nextBeat, null);
  assert.ok(returnBanks.start.prefixes.includes('vo.silentsquatch.aftermath.'));
  assert.ok(returnBanks.start.prefixes.includes('vo.silentsquatch.evening.'));
  assert.ok(returnBanks.start.prefixes.includes('vo.silentsquatch.return.'));
});

test('Mansion: the cellar boundary awaits by construction — zones held, resume paths awaited', () => {
  const mainSource = readSource('src/mansion/main.js');
  const mountSource = readSource('src/mansion/mission/mount.js');

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
  const mainSource = readSource('src/enolasquatch/main.js');
  assert.match(mainSource, /canSpeak: \(line\) => !audioBanks\.pending\(enolaBankOfCue\(line\.cue\)\)/);
  assert.match(mainSource, /audioBanks\.kickoff\(\)/);
});

/* ---------------- the Cartel Palace ---------------- */

test('Palace: every static scene sound is start-bank; the finale speech is the dining door\'s bank', () => {
  for (const name of staticAudioCueNames('src/cartel-palace/main.js')) {
    assert.ok(coveredBy(name, PALACE_START_BANK), `${name} must not wait on a later bank`);
  }
  /* THE SPLIT IS THE CONFRONTATION, NOT THE `vo.palace.` PREFIX.
   *
   * This used to say that NO `vo.palace.` cue may be in the start bank,
   * which was true on the day it was written: the whole namespace was the
   * dining-room confrontation, twenty minutes past the service gate. The
   * scene pass in 3dbe16d gave the estate a speaking cast that is heard long
   * before that door -- Tony's recognition on each piece of evidence, the
   * cleaner who panics in the foyer, the payroll's combat barks, and the
   * idle guard conversations the whole stealth affordance depends on finding
   * BY EAR from the first frame of the approach. Those four namespaces were
   * moved into the start bank on purpose (see the comment on
   * PALACE_START_BANK), and this assertion has been failing ever since on a
   * scene that got its banking right.
   *
   * Both directions are pinned now, which is more than the old form asked:
   * the confrontation must not block the start button, AND every line that
   * can be heard before the dining door must. A line dispatched before its
   * bank settles is a subtitle with nothing behind it -- nothing retries a
   * line's audio -- so "not in the finale bank" is not a free pass, it is the
   * other half of the same rule. A new pre-door namespace lands here as a
   * failure until it is banked, which is the point. */
  for (const cue of soundManifest.sfx) {
    if (!cue.name.startsWith('vo.palace.')) continue;
    assert.ok(coveredBy(cue.name, PALACE_NEXT_BEAT_BANK), cue.name);
    if (cue.name.startsWith('vo.palace.finale.')) {
      assert.ok(!coveredBy(cue.name, PALACE_START_BANK),
        'the confrontation must not block the start button');
    } else {
      assert.ok(coveredBy(cue.name, PALACE_START_BANK),
        `${cue.name} can be heard before the dining door, so it cannot ride the next-beat bank`);
    }
  }
  /* The three room loops all decode before their startLoop picks a buffer. */
  for (const name of ['ambience.rain', 'ambience.palace.interior', 'ambience.palace.dining']) {
    assert.ok(coveredBy(name, PALACE_START_BANK), name);
  }
  assert.ok(coveredBy('ambience.city.night', PALACE_BACKGROUND_BANK));

  const mainSource = readSource('src/cartel-palace/main.js');
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
  const mainSource = readSource('src/cartel-palace/main.js');
  assert.match(mainSource, /restoreCombatCheckpoint\(snapshot\);\n\s+\/\* Gains re-asserted[^]*?acoustics\.refresh\(player\.position\);/);
});

/* ================================================================== */
/* THE DELIVERED-BUT-NEVER-DECODED TRAP                                 */
/*                                                                       */
/* A recording is on disk, in assets/sfx/manifest.json AND in            */
/* assets/sfx/index.json, and the scene that plays it never decodes it   */
/* because the scene's own preload scope does not name it. Every static  */
/* gate stays green and the game plays a synth stand-in for good.        */
/*                                                                       */
/* It has now happened four times: `enola.blast.*` (one dot -- see       */
/* isEnolaPreloadCue), the mansion's entire recorded voice bank (see the */
/* loadManifest comment in src/mansion/main.js), the Silver Room's two   */
/* crowd reactions, and the mansion suite's own four takes. The checks   */
/* below are the standing guard for the last two plus THE SPECIAL        */
/* MEETING's street: for each, prove the take is really delivered, then  */
/* prove the page that plays it really asks for it.                      */
/* ================================================================== */

const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/index.json'), 'utf8'));
const deliveredFiles = new Set(soundIndex.files || []);
const manifestByName = new Map(soundManifest.sfx.map((cue) => [cue.name, cue]));

/** A take somebody actually recorded: named in the manifest and in the index. */
function delivered(name) {
  const cue = manifestByName.get(name);
  return !!cue && deliveredFiles.has(cue.file || `${name}.mp3`);
}

const { isSilverPreloadCue } = await import('../src/silver/audio.js');
const {
  MANSION_HOUSE_SET_CUE_NAMES, MANSION_SUITE_CUE_NAMES,
} = await import('../src/mansion/audio-banks.js');
const { AMBIENCE_CUES: SPECIAL_MEETING_AMBIENCE_CUES } = await import('../src/specialmeeting/ambience.js');
const { isBingPreloadCue } = await import('../src/bing/audio.js');
const rerecordQueue = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/rerecord.json'), 'utf8'));

test('Silver: every crowd reaction the violinist\'s set plays is one this page decodes', () => {
  const performSource = fs.readFileSync(path.join(ROOT, 'src/silver/perform.js'), 'utf8');
  const reactions = new Set();
  for (const match of performSource.matchAll(/sfx:\s*\[([^\]]+)\]/g)) {
    for (const literal of match[1].matchAll(/'([^']+)'/g)) reactions.add(literal[1]);
  }
  assert.ok(reactions.size >= 4, `expected the bits table, saw ${reactions.size} cues`);
  for (const cue of reactions) {
    assert.ok(delivered(cue), `${cue} is not a delivered recording any more`);
    assert.equal(isSilverPreloadCue(cue), true,
      `${cue} is recorded and indexed but outside this page's residency filter, `
      + 'so the room reacts on the synth stand-in in core/audio.js');
  }
});

test('Mansion: the suite\'s four own takes are delivered, banked, and their beds wait for the bank', () => {
  for (const cue of MANSION_SUITE_CUE_NAMES) assert.ok(delivered(cue), cue);
  for (const visit of ['first', 'return']) {
    const banks = mansionAudioBanks(visit);
    for (const cue of MANSION_SUITE_CUE_NAMES) {
      assert.ok(coveredBy(cue, banks.start), `${cue} missing from the ${visit} start bank`);
    }
  }
  /* startLoop picks its buffer once, at the moment it starts. The suite's two
   * beds therefore cannot come up with the house's deliberately-synth beds. */
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/mansion/main.js'), 'utf8');
  const ambienceAt = mainSource.indexOf('function startAmbience()');
  const suiteAt = mainSource.indexOf('function startSuiteBeds()');
  assert.ok(ambienceAt > 0 && suiteAt > ambienceAt);
  const ambienceBody = mainSource.slice(ambienceAt, mainSource.indexOf('\n}\n', ambienceAt));
  assert.doesNotMatch(ambienceBody, /mansion\.suite\./,
    'the suite beds must not start before a single cue has decoded');
  assert.match(mainSource, /await mansionBanks\.loadStart\(\);[^]*?startSuiteBeds\(\);/);
});

test('THE SPECIAL MEETING: the block asks for its whole cue catalogue by name', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/specialmeeting/main.js'), 'utf8');
  const call = mainSource.match(/loadAdditional\(\{([^]*?)\}\);/);
  assert.ok(call, 'the page still preloads through loadAdditional');
  /* Keep this semantic rather than pinning the array's old one-line formatting.
   * The forest drive now owns two continuous travel beds in addition to the
   * block catalogue; all three sources must be passed to the same residency
   * request so the fade can carry real engine/road audio through black. */
  assert.match(call[1], /\.\.\.SPECIAL_MEETING_VOICE_CUES/);
  assert.match(call[1], /\.\.\.AMBIENCE_CUES/);
  assert.match(call[1], /\.\.\.Object\.values\(FOREST_TRAVEL_AUDIO\)\.map\(\(\{ cue \}\) => cue\)/);
  assert.match(mainSource, /cue: 'car\.engine\.idle'/);
  assert.match(mainSource, /cue: 'heist\.vehicle\.tires\.road'/);
  const prefixes = [...call[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  /* Why the names list is not redundant: two of the nine cues share no prefix
   * with the other seven, and both are recorded. `ambience.alley` is the
   * worse of the two -- it is a loop, so a miss lasts the whole scene. */
  const missedByPrefixAlone = SPECIAL_MEETING_AMBIENCE_CUES
    .filter((cue) => !prefixes.some((prefix) => cue.startsWith(prefix)));
  assert.deepEqual(missedByPrefixAlone.sort(), ['ambience.alley', 'traffic.pass']);
  for (const cue of missedByPrefixAlone) assert.ok(delivered(cue), cue);
});

test('Mansion: the one persistent house receiver decodes in the background bank', () => {
  /* THE SIXTH RADIO-HOSTING PAGE, AND THE ONLY ONE THAT NEVER ASKED.
   *
   * The flat, the Bing, Silver Pines' cart, the Beef Run cockpit and NO WAKE
   * all feed `Radio.preloadCueNames()` into their own loader. Lou's house ran
   * a real `core/radio.js` receiver on two physical sets and six `core/tv.js`
   * sets and fed it into nothing, so the four handling cues, the jingle, the
   * cut, `tv.click` and 97.8 THE SQUATCH's whole recorded DJ and advert bank
   * played out of `synth()` on a page where every one of them is on disk and
   * in index.json. Same trap as `enola.blast.*`, at sixty-seven takes.
   *
   * The receiver below is built exactly as ./main.js builds it -- one fixed
   * hour, the mansion venue, no campaign news adapter -- because the bank is
   * only exact if the arguments are. */
  const houseRadio = new Radio(
    { ready: false },
    { setRadio() {}, toast() {} },
    { hour: 21 },
    { venue: 'mansion' },
  );
  const radioCueNames = houseRadio.preloadCueNames({ hours: [21] });
  assert.ok(radioCueNames.length > 40, `expected the station's bank, saw ${radioCueNames.length}`);

  for (const visit of ['first', 'return']) {
    const banks = mansionAudioBanks(visit, radioCueNames);
    for (const cue of [...radioCueNames, ...MANSION_HOUSE_SET_CUE_NAMES]) {
      if (!delivered(cue)) continue;   // an unrecorded name costs nothing to bank
      assert.ok(coveredBy(cue, banks.background),
        `${cue} is a delivered recording this house plays and the ${visit} background bank does not name it`);
      /* And it must be in THAT bank, not in front of the start click. The
       * whole reason ninety-odd decodes are affordable here is that the
       * receiver is built switched off and a set only ever speaks from an E
       * press, so nothing about the walk to Lou's office waits on any of it. */
      assert.ok(!coveredBy(cue, banks.start), `${cue} must not block the start button`);
      if (banks.nextBeat) {
        assert.ok(!coveredBy(cue, banks.nextBeat), `${cue} must not sit in the basement bank`);
      }
    }
  }

  /* The wiring, not just the shape: the page has to hand its own receiver's
   * bank to the bank builder, or the default empty argument silently restores
   * the bug with every assertion above still green. */
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/mansion/main.js'), 'utf8');
  assert.match(mainSource, /mansionAudioBanks\(\n\s+mansionVisit,\n\s+houseRadio\.preloadCueNames\(\{ hours: \[HOUSE_RADIO_HOUR\] \}\),\n\)/);
  /* One hour, read twice from one constant -- the receiver's clock and the
   * preload window cannot drift apart into a bank that decodes the wrong show. */
  assert.match(mainSource, /\{ hour: HOUSE_RADIO_HOUR \}, \{\n\s+venue: 'mansion'/);
  /* One physical tuner across both campaign visits, default-off on a new
   * save. A saved-on tuner is restored only inside beginTour, after the real
   * start gesture initializes the AudioContext, and that restoration cannot
   * create a second radio.talk owner because there is only one Radio. */
  assert.match(mainSource,
    /state: createCampaignRadioAdapter\(mansionRecoveryCampaign, \{[\s\S]*?receiverId: 'mansion_house',[\s\S]*?defaultPower: false,/);
  assert.match(mainSource,
    /if \(houseRadio\.preferredOn\) \{[\s\S]*?houseRadio\.turnOn\(\{ remember: false \}\);[\s\S]*?syncHouseRadioSets\(\);/);
  assert.equal((mainSource.match(/\bnew Radio\(/g) ?? []).length, 1);
});

test('Luxury and Mansion persist separate default-off physical receivers after audio unlock', () => {
  const luxurySource = readSource('src/luxury-apartment/main.js');
  const mansionSource = readSource('src/mansion/main.js');

  assert.match(luxurySource,
    /state: createCampaignRadioAdapter\(campaign, \{[\s\S]*?receiverId: 'luxury_apartment',[\s\S]*?defaultPower: false,/);
  assert.match(luxurySource,
    /await audio\.loadManifest\([\s\S]*?if \(radio\.preferredOn\) radio\.turnOn\(\{ remember: false \}\);\n\s+home\.state\.radioOn = radio\.on;/);
  assert.match(mansionSource,
    /state: createCampaignRadioAdapter\(mansionRecoveryCampaign, \{[\s\S]*?receiverId: 'mansion_house',[\s\S]*?defaultPower: false,/);
  assert.doesNotMatch(luxurySource, /receiverId: 'mansion_house'/);
  assert.doesNotMatch(mansionSource, /receiverId: 'luxury_apartment'/);
});

test('Mansion: every recorded mansion.* take is one the house actually plays', () => {
  /* THE MIRROR IMAGE OF THE TRAP ABOVE: a delivered batch nothing plays.
   *
   * `mansion.bookcase.latch`, `.swing` and `.seat` were three takes for the
   * office bookcase that no source file in the repo ever named -- a door with
   * one E press and two states, whose wired pair carries the latch inside the
   * open take. They were retired on 2026-08-22 (manifest rows dropped, files
   * deleted, index regenerated, provenance in rerecord.json) rather than
   * wired, because wiring them plays one event three times over.
   *
   * This assertion is the standing half. `mansion.*` is a small, hand-authored
   * corner of the manifest that belongs entirely to this one scene, so the
   * invariant can be exact: a recorded `mansion.*` cue is either one of the
   * suite's four or it is a recording nobody asked for. */
  const recorded = soundManifest.sfx
    .filter((cue) => cue.name.startsWith('mansion.') && delivered(cue.name))
    .map((cue) => cue.name);
  assert.deepEqual(recorded.sort(), [...MANSION_SUITE_CUE_NAMES].sort());

  /* The retirement itself: gone from the manifest, gone from the index, and
   * on the ledger. All three halves, because any one alone is either a red
   * CHECK_SFX_ORPHANS=1 or a silent re-delivery. */
  const retiredCues = rerecordQueue.retired.map((entry) => entry.cue);
  for (const cue of ['mansion.bookcase.latch', 'mansion.bookcase.swing', 'mansion.bookcase.seat']) {
    assert.ok(retiredCues.includes(cue), `${cue} is not on the retired ledger`);
    assert.equal(manifestByName.has(cue), false, `${cue} is back in the manifest`);
    assert.equal(deliveredFiles.has(`${cue}.mp3`), false, `${cue}.mp3 is back in the index`);
  }
});

test('Bada Bing: the first-visit page decodes the second visit\'s lines, because it can still play them', () => {
  /* ONE DOT, THE ENOLA BOMB AGAIN.
   *
   * `isBingPreloadCue` opened with `vo.bing.` and that prefix stops at its own
   * dot, so nothing under `vo.bing2.` was ever selected by it. That was
   * harmless only as long as src/bing/main.js could not run as the second
   * visit -- and it can: `isSecondVisit` is true whenever the SAVE says
   * BADA_BING_TWO, with or without `?visit=2`, and the second-visit Lou script
   * then plays `vo.bing2.lou.lockdown` off a bank this page never decoded.
   * The campaign always routes visit two through `bing.html?visit=2`, which
   * src/bing/router.js hands to hotdog-main.js, but the apartment's own
   * next-scene link is bare `bing.html` and a bookmark carries no query.
   *
   * Both halves are pinned, because the bug needs both to come back: the
   * filter must cover the prefix, AND the branch that reaches it is still
   * there. If somebody genuinely removes the second-visit mode from this
   * page, this test should be deleted with it -- not weakened. */
  const secondVisitSource = fs.readFileSync(path.join(ROOT, 'src/bing/second-visit.js'), 'utf8');
  const louScript = secondVisitSource.slice(secondVisitSource.indexOf('export function buildSecondVisitLouScript'));
  const louCues = [...louScript.matchAll(/cue: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(louCues.includes('vo.bing2.lou.lockdown'), 'the lockdown line moved; re-point this test');
  for (const cue of louCues) {
    assert.ok(delivered(cue), `${cue} is not a delivered recording any more`);
    assert.equal(isBingPreloadCue(cue), true,
      `${cue} is recorded and indexed and outside this page's residency filter, `
      + 'so Lou locks the room down on a synthesised noise');
  }

  /* The whole namespace, not just the one line that was noticed: every
   * delivered `vo.bing2.` take is reachable from the same mode. */
  for (const cue of soundManifest.sfx) {
    if (!cue.name.startsWith('vo.bing2.') || !delivered(cue.name)) continue;
    assert.equal(isBingPreloadCue(cue.name), true, cue.name);
  }
  /* Widening `vo.bing.` to a bare `vo.bing` would swallow neighbours; it did
   * not, and must not. */
  assert.equal(isBingPreloadCue('vo.bingo.caller.1'), false);
  assert.equal(isBingPreloadCue('vo.graveyard.snow.done'), false);

  const bingSource = fs.readFileSync(path.join(ROOT, 'src/bing/main.js'), 'utf8');
  assert.match(bingSource, /const isSecondVisit = requestedVisit === '2'\n\s+\|\| campaign\.state\.scene\.id === SCENE_IDS\.BADA_BING_TWO;/);
  assert.match(bingSource, /if \(isSecondVisit\) scripts\.lou = buildSecondVisitLouScript\(/);
});

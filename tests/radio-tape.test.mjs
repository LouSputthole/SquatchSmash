/**
 * The tape segment: a recording somebody sent in, aired whole.
 *
 * Two things can go wrong with it and neither shows up as an error. The file
 * can be missing from the sfx index, in which case the station holds thirty
 * seconds of silence and calls it a segment. Or the block can take its dwell
 * from the written line rather than the recording, in which case the announcer
 * starts talking eight seconds into a thirty-four second tape.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEETING_NOTICE,
  MEETING_NOTICE_ID,
  STATIONS,
  showAt,
  showIntroLine,
  voiceOf,
  voiceCues,
} from '../src/core/stations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAPES = STATIONS.flatMap((st) => st.tapes ?? []);

test('every tape names a cue file that is actually on disk', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/index.json'), 'utf8'));
  const files = new Set(index.files || []);
  assert.ok(TAPES.length, 'no tapes to check');
  for (const tape of TAPES) {
    assert.ok(files.has(`${tape.cue}.mp3`), `${tape.cue}.mp3 is not in assets/sfx/index.json`);
  }
});

test('a tape airs intro, recording and outro, and holds for the recording', async () => {
  const { Radio } = await import('../src/core/radio.js');

  const played = [];
  // Every cue is a 34.4s buffer here; only the tape's dwell should reflect that,
  // and only because the block asked for the clip by name.
  const audio = {
    ready: true,
    play: (cue) => { played.push(cue); return { buffer: { duration: 34.4 }, stop() {} }; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 });

  // Walk the running order until the tape block comes round.
  const station = radio.station;
  const tape = station.tapes[0];
  let seen = null;
  for (let i = 0; i < 40 && !seen; i++) {
    radio._queue.length = 0;
    radio._refill();
    if (radio._queue.some((s) => s.clip)) seen = radio._queue.slice();
  }
  assert.ok(seen, 'the running order never reached a tape block');

  assert.deepEqual(seen.map((s) => s.line), [tape.intro, tape.title, tape.outro]);
  assert.equal(seen[1].clip, tape.cue);

  // The recording itself is what plays, and the block runs as long as it does.
  radio._queue = seen.slice();
  radio._pump();                       // intro
  radio._pump();                       // the tape
  assert.equal(played.at(-1), tape.cue);
  assert.ok(radio._dwell > 34, `tape dwell was ${radio._dwell}s, shorter than the recording`);
});

test('preparing a bulletin cannot pump ordinary radio before it starts', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const audio = {
    ready: false,
    play() { return null; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 7 });
  let tuned = 0;
  radio._tuneIn = () => { tuned++; };

  radio.prepareBroadcast();
  assert.equal(radio.on, true);
  assert.equal(tuned, 0);
  assert.equal(radio._broadcastT, Number.POSITIVE_INFINITY);

  radio.update(10);
  assert.equal(tuned, 0);
  assert.equal(radio._broadcastT, Number.POSITIVE_INFINITY);

  radio.broadcast({ cue: 'vo.news.radio.day_two.1', line: 'Breaking news.' });
  assert.ok(Number.isFinite(radio._broadcastT));
  assert.equal(tuned, 0);
});

test('a receiver scopes its station HUD to the scene supplied physical range', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const states = [];
  let nearby = true;
  const radio = new Radio(
    { ready: false, play() { return null; }, startLoop() {}, stopLoop() {}, setLoopVolume() {} },
    { setRadio: (state) => states.push(state), toast() {} },
    { hour: 9 },
    { hudVisible: () => nearby },
  );
  radio.on = true;
  radio._show = showAt(radio.station, 9);

  radio._showOsd();
  assert.equal(states.at(-1)?.station.includes(radio.station.dial), true);

  nearby = false;
  radio.update(0);
  assert.equal(states.at(-1), null, 'leaving the receiver range must clear its HUD');

  nearby = true;
  radio.update(0);
  assert.equal(states.at(-1)?.station.includes(radio.station.dial), true,
    're-entering range restores the current programme without retuning');
});

test('the shared radio range matches its panner boundary and rejects invalid positions', async () => {
  const {
    RADIO_HUD_AUDIBLE_DISTANCE,
    radioHudWithinRange,
  } = await import('../src/core/radio.js');
  const receiver = { x: 10, y: 2, z: -5 };
  assert.equal(RADIO_HUD_AUDIBLE_DISTANCE, 20);
  assert.equal(radioHudWithinRange({ x: 30, y: 2, z: -5 }, receiver), true);
  assert.equal(radioHudWithinRange({ x: 30.01, y: 2, z: -5 }, receiver), false);
  const source = fs.readFileSync(path.join(ROOT, 'src/core/radio.js'), 'utf8');
  assert.match(source, /panner\.maxDistance\s*=\s*RADIO_HUD_AUDIBLE_DISTANCE/);
  assert.equal([...source.matchAll(/maxDist:\s*RADIO_HUD_AUDIBLE_DISTANCE/g)].length, 5,
    'songs, talk beds, segments, and bulletins must share the HUD boundary');
  assert.equal(radioHudWithinRange(null, receiver), false);
  assert.equal(radioHudWithinRange({ x: Number.NaN, y: 2, z: -5 }, receiver), false);
  assert.equal(radioHudWithinRange(receiver, receiver, -1), false);
});

test('every roaming positional-radio scene gives the station card a physical range', () => {
  for (const file of [
    'src/main.js',
    'src/luxury-apartment/main.js',
    'src/beefrun/main.js',
    'src/nowake/main.js',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /hudVisible:\s*\(\)\s*=>[\s\S]{0,220}radioHudWithinRange\(/,
      `${file} leaves its positional radio station card global`);
  }
});

test('the meeting notice is one Day One bulletin and never repeats once heard', async () => {
  assert.equal(MEETING_NOTICE.length, 1);
  assert.match(MEETING_NOTICE[0].line, /Wednesday.*Seven/i);

  const { Radio } = await import('../src/core/radio.js');
  const audio = {
    ready: false,
    play() { return null; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const heard = new Set();
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, {
    canPlayNotice: () => true,
    state: {
      load: () => ({}),
      save() {},
      hasHeardBulletin: (id) => heard.has(id),
      markBulletinHeard: (id) => { heard.add(id); return true; },
    },
  });
  radio.on = true;
  radio._show = showAt(radio.station, 9);
  radio._cycle = 19;
  radio._blocks = 20;
  radio._refill();
  radio._pump();
  assert.equal(heard.has(MEETING_NOTICE_ID), true);

  radio._queue = [];
  radio._cycle = 19;
  radio._refill();
  assert.equal(radio._queue.some((segment) => segment.notice), false);

  const later = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, {
    canPlayNotice: () => false,
  });
  later._show = showAt(later.station, 9);
  later._cycle = 19;
  later._blocks = 20;
  later._refill();
  assert.equal(later._queue.some((segment) => segment.notice), false);
});

test('campaign news is derived from the receiver manifest policy and campaign state', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const completedMotel = { missions: { jerky_motel: { status: 'complete' } } };
  const audio = { ready: false };
  const hud = { setRadio() {}, toast() {} };

  const disabled = new Radio(audio, hud, { hour: 9 }, {
    news: () => [{ id: 'scene-local-bypass', lines: ['must not air'] }],
    state: {
      load: () => ({}),
      context: () => ({ receiverId: 'silver_pines_lead_cart', campaignNews: 'disabled' }),
      campaignState: () => completedMotel,
    },
  });
  disabled._programContext = disabled.state.context();
  assert.deepEqual(disabled._eligibleNews(), []);

  const enabled = new Radio(audio, hud, { hour: 9 }, {
    news: () => [],
    state: {
      load: () => ({}),
      context: () => ({ receiverId: 'apartment', campaignNews: 'enabled' }),
      campaignState: () => completedMotel,
    },
  });
  enabled._programContext = enabled.state.context();
  assert.deepEqual(enabled._eligibleNews().map(({ id }) => id), ['news.segment.motel']);
});

test('the first music block starts the first manifest track and saves the next cursor', async () => {
  const { Radio } = await import('../src/core/radio.js');
  let saved = {
    volume: 0.7, cursor: 0, cycle: 0, selections: {},
    songReactionCursor: 0, adReactionCursor: 0, power: true,
  };
  const state = {
    load: () => structuredClone(saved),
    save: (next) => { saved = structuredClone(next); },
  };
  const audio = {
    ready: true,
    ctx: { currentTime: 0 },
    play() { return null; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, { state });
  radio.tracks = [
    { file: 'first.mp3', title: 'First' },
    { file: 'second.mp3', title: 'Second' },
  ];
  radio.el = {
    readyState: 1,
    duration: 180,
    currentTime: 0,
    addEventListener() {},
    play() { return Promise.resolve(); },
    pause() {},
  };
  radio._ensureGraph = () => {};
  radio._fadeTo = () => {};

  radio._startSong();

  assert.equal(radio._line, 'First');
  assert.equal(saved.cursor, 1);
  assert.equal(radio._track.title, 'First');
});

test('playlist cursors persist the next stable song id independently per physical venue', async () => {
  const { Radio } = await import('../src/core/radio.js');
  let saved = {
    volume: 0.7, cursor: 0, cycle: 0, selections: {}, songCursors: {},
    programProgress: {}, songReactionCursor: 0, adReactionCursor: 0, power: true,
  };
  const state = {
    load: () => structuredClone(saved),
    save: (next) => { saved = structuredClone(next); },
  };
  const audio = {
    ready: true, ctx: { currentTime: 0 }, play() { return null; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const installElement = (radio) => {
    radio.el = {
      readyState: 1, duration: 180, currentTime: 0,
      addEventListener() {}, play() { return Promise.resolve(); }, pause() {},
    };
    radio._ensureGraph = () => {};
    radio._fadeTo = () => {};
  };

  const apartment = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, {
    venue: 'apartment', state,
  });
  apartment.tracks = [
    { id: 'first', file: 'first.mp3', title: 'First' },
    { id: 'second', file: 'second.mp3', title: 'Second' },
  ];
  installElement(apartment);
  apartment._startSong();
  assert.equal(saved.songCursors['squatch:apartment'], 'second');

  const reordered = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, {
    venue: 'apartment', state,
  });
  reordered.tracks = [
    { id: 'second', file: 'second.mp3', title: 'Second' },
    { id: 'new', file: 'new.mp3', title: 'New' },
    { id: 'first', file: 'first.mp3', title: 'First' },
  ];
  installElement(reordered);
  reordered._startSong();
  assert.equal(reordered._track.id, 'second', 'reordering the manifest cannot change the saved next record');

  const golf = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, {
    venue: 'silver_pines', state,
  });
  golf.tracks = [
    { id: 'first', file: 'first.mp3', title: 'First' },
    { id: 'second', file: 'second.mp3', title: 'Second' },
  ];
  installElement(golf);
  golf._startSong();
  assert.equal(golf._track.id, 'first', 'a different physical venue owns a separate playlist cursor');
  assert.equal(saved.songCursors['squatch:silver_pines'], 'second');
});

test('the Silver Pines full-song receiver does not apply the apartment excerpt timer', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const radio = new Radio({ ready: false }, { setRadio() {}, toast() {} }, { hour: 9 }, {
    venue: 'silver_pines',
    fullSongs: true,
    canPlayNotice: () => false,
  });
  radio.on = true;
  radio._songT = 0;
  radio._track = { file: 'whole-song.mp3', title: 'Whole Song' };
  radio.el = { currentTime: 31, duration: 180 };

  radio.update(31);

  assert.equal(radio.songPlaying, true,
    'a cart song continues past the shared thirty-second radio excerpt');
});

test('Nehoo always hard-cuts at 15 seconds to its authored ad, even on the Golf receiver', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/manifest.json'), 'utf8'));
  const nehoo = manifest.tracks.find((track) => track.id === 'nehoo-with-a-guu');
  assert.deepEqual(nehoo.afterCut, { type: 'ad', id: 'jerky' });

  const played = [];
  const audio = {
    ready: true,
    ctx: { currentTime: 0 },
    play(cue) { played.push(cue); return { buffer: { duration: 2 }, stop() {} }; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 8 }, {
    venue: 'silver_pines', fullSongs: true, canPlayNotice: () => false,
  });
  radio.tracks = manifest.tracks;
  radio.el = {
    readyState: 1, duration: 180, currentTime: 0,
    addEventListener() {}, removeEventListener() {},
    play() { return Promise.resolve(); }, pause() {},
  };
  radio._ensureGraph = () => {};
  radio._fadeTo = () => {};
  radio.on = true;

  radio._startSong({ songId: 'nehoo-with-a-guu' });
  radio.el.currentTime = 15;
  radio.update(0.1);

  assert.equal(radio.songPlaying, false);
  assert.equal(played.includes('radio.cut'), true);
  assert.equal(radio._activeSegment.line, '…');
  assert.equal(radio._queue.some((segment) => /LOU’S ORIGINAL JERKY/.test(segment.line ?? '')), true);
  assert.equal(radio._queue.some((segment) => segment.notice), false,
    'the Nehoo edit owns its ad target and cannot depend on campaign notices');
});

test('spoken timing has one explicit gap rather than counting it twice', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const audio = {
    ready: true,
    play: () => ({ buffer: { duration: 4 }, stop() {} }),
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 });
  radio.on = true;
  radio._queue = [
    { line: 'LOU: Timing test.', clip: 'test.first' },
    { line: 'LOU: Next line.', clip: 'test.next' },
  ];
  radio._pump();
  assert.equal(radio._phase, 'air');
  radio.update(4);
  assert.equal(radio._phase, 'gap');
  radio.update(1.39);
  assert.equal(radio._line, null);
  radio.update(0.02);
  assert.equal(radio._line, 'LOU: Next line.');
});

test('pause and scripted shutdown preserve the receiver power preference', async () => {
  const { Radio } = await import('../src/core/radio.js');
  let saved = {
    volume: 0.7, cursor: 0, cycle: 0, selections: {},
    songReactionCursor: 0, adReactionCursor: 0, power: true,
  };
  let stopped = 0;
  const audio = {
    ready: false,
    play() { return { stop() { stopped++; }, buffer: { duration: 2 } }; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, {
    state: {
      load: () => structuredClone(saved),
      save: (next) => { saved = structuredClone(next); },
    },
  });
  radio.turnOn({ remember: false });
  radio.pause();
  assert.equal(radio._paused, true);
  radio.resume();
  assert.equal(radio._paused, false);
  radio.turnOff({ remember: false });
  assert.equal(saved.power, true);
  assert.ok(stopped >= 1);
});

test('scoped preload names cover the current show without loading every radio voice', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const radio = new Radio({ ready: false }, { setRadio() {}, toast() {} }, { hour: 23.7 }, {
    canPlayNotice: () => false,
  });
  const names = new Set(radio.preloadCueNames());
  const show = showAt(radio.station, 23.7);
  const intro = voiceOf(showIntroLine(show));
  const firstLine = voiceOf(show.exchanges[0][0]);
  const notice = voiceOf(MEETING_NOTICE[0].line);

  assert.ok(names.has(intro.cue));
  assert.ok(names.has(firstLine.cue));
  assert.equal(names.has(notice.cue), false);
  assert.ok(names.size < voiceCues().length, `${names.size} was not a scoped preload`);
});

test('the Apartment start gate can warm only the first audible radio beat', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const radio = new Radio({ ready: false }, { setRadio() {}, toast() {} }, { hour: 23.7 }, {
    canPlayNotice: () => false,
  });
  const full = new Set(radio.preloadCueNames());
  const startup = new Set(radio.preloadCueNames({ startupOnly: true }));
  const show = showAt(radio.station, 23.7);
  const intro = voiceOf(showIntroLine(show));
  const firstExchange = voiceOf(show.exchanges[0][0]);

  assert.ok(startup.has('radio.talk'));
  assert.ok(startup.has('radio.jingle'));
  assert.ok(startup.has(radio.station.ident));
  assert.ok(startup.has(intro.cue));
  assert.equal(startup.has(firstExchange.cue), false,
    'later talk belongs in the background resident load, not the Start gate');
  assert.ok(startup.size <= 12, `startup radio bank unexpectedly grew to ${startup.size} cues`);
  assert.ok(startup.size < full.size / 3,
    `startup ${startup.size} cues did not materially reduce full window ${full.size}`);
});

test('venue-scoped records stay in their intended in-world music system', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const audio = { ready: false };
  const hud = { setRadio() {}, toast() {} };
  const tracks = [
    { file: 'legacy.mp3', title: 'Legacy rotation' },
    { file: 'cosmic-drift.mp3', title: 'Cosmic Drift', venue: 'apartment' },
    { file: 'club-only.mp3', title: 'Club only', venue: 'bada_bing' },
  ];

  const apartment = new Radio(audio, hud, { hour: 9 });
  apartment.tracks = tracks;
  assert.deepEqual(apartment.playlist.map((track) => track.file), [
    'legacy.mp3', 'cosmic-drift.mp3',
  ]);

  const club = new Radio(audio, hud, { hour: 9 }, { venue: 'bada_bing' });
  club.tracks = tracks;
  assert.deepEqual(club.playlist.map((track) => track.file), [
    'legacy.mp3', 'club-only.mp3',
  ]);
});

test('a connected phone call ducks the radio by 66 percent without changing its knob', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const loopVolumes = [];
  const voiceVolumes = [];
  const voice = {};
  const audio = {
    ready: false,
    setLoopVolume: (key, volume, ramp) => loopVolumes.push({ key, volume, ramp }),
    setPlaybackVolume: (source, volume, ramp) => voiceVolumes.push({ source, volume, ramp }),
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 });
  radio.on = true;
  radio._voice = voice;

  const knob = radio.volume;
  assert.equal(radio.setPhoneDucked(true), 0.34);
  assert.equal(radio.phoneDucked, true);
  assert.equal(radio.volume, knob);
  assert.ok(Math.abs(loopVolumes.at(-1).volume - 0.055 * knob * 0.34) < 1e-9);
  assert.ok(Math.abs(voiceVolumes.at(-1).volume - knob * 0.34) < 1e-9);

  assert.equal(radio.setPhoneDucked(false), 1);
  assert.equal(radio.phoneDucked, false);
  assert.equal(radio.volume, knob);
  assert.ok(Math.abs(loopVolumes.at(-1).volume - 0.055 * knob) < 1e-9);
  assert.ok(Math.abs(voiceVolumes.at(-1).volume - knob) < 1e-9);
});

test('a hub tune-in receipts the ident before the show intro reaches playback', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const { radioProgramFor } = await import('../src/core/radio-program.js');
  const calls = [];
  let receiptId = 0;
  let saved = {
    volume: 0.7, cursor: 0, cycle: 0, selections: {}, songCursors: {},
    programProgress: {}, songReactionCursor: 0, adReactionCursor: 0, power: true,
  };
  const audio = {
    ready: false,
    play(cue) { calls.push(cue); return { buffer: { duration: cue === 'radio.ident.squatch' ? 3.631 : 2 }, stop() {} }; },
    playWithReceipt(cue, opts) {
      const source = this.play(cue, opts);
      return {
        source,
        receipt: { id: ++receiptId, requested: cue, actual: cue, source: 'buffer', started: true },
      };
    },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const program = radioProgramFor({ beatId: 'first_apartment', receiverId: 'apartment' });
  const state = {
    load: () => structuredClone(saved),
    save: (next) => { saved = structuredClone(next); },
    context: () => ({
      receiverId: 'apartment', beatId: 'first_apartment', campaignNews: 'enabled',
      programId: program.id, program,
    }),
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, { state });

  radio.turnOn();

  assert.equal(radio.playbackReceipts[0].programId, 'H-APT-01');
  assert.equal(radio.playbackReceipts[0].blockId, 'ident');
  assert.equal(radio.playbackReceipts[0].requested, 'radio.ident.squatch');
  assert.equal(radio.playbackReceipts[0].started, true);
  assert.equal(calls.filter((cue) => cue !== 'radio.click')[0], 'radio.ident.squatch');
  assert.equal(calls.some((cue) => cue === voiceOf(showIntroLine(showAt(radio.station, 9))).cue), false);
  assert.equal(saved.programProgress['H-APT-01'], undefined,
    'starting the ident is not the same as finishing it');
});

test('a completed entry-packet block resumes at the next block on another receiver instance', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const { radioProgramFor } = await import('../src/core/radio-program.js');
  const program = radioProgramFor({ beatId: 'first_apartment', receiverId: 'apartment' });
  let saved = {
    volume: 0.7, cursor: 0, cycle: 0, selections: {}, songCursors: {},
    programProgress: {}, songReactionCursor: 0, adReactionCursor: 0, power: true,
  };
  const state = {
    load: () => structuredClone(saved),
    save: (next) => { saved = structuredClone(next); },
    context: () => ({
      receiverId: 'apartment', beatId: 'first_apartment', campaignNews: 'enabled',
      programId: program.id, program,
    }),
  };
  const audio = {
    ready: false,
    play(cue) { return { buffer: { duration: cue === 'radio.ident.squatch' ? 3.631 : 2 }, stop() {} }; },
    playWithReceipt(cue, opts) {
      const source = this.play(cue, opts);
      return { source, receipt: { requested: cue, actual: cue, source: 'buffer', started: true } };
    },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };

  const first = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, { state });
  first.turnOn();
  first.update(3.631);

  assert.deepEqual(saved.programProgress['H-APT-01'], {
    nextBlock: 1,
    completedBlockIds: ['ident'],
  });
  assert.equal(first.playbackReceipts[0].completed, true);

  const resumed = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 }, { state });
  resumed.turnOn();
  assert.equal(resumed.playbackReceipts[0].blockId, 'show-intro');
  assert.equal(resumed.playbackReceipts[0].kind, 'voice');
  /* The packet pins its own show hour (17:00 since the five-PM Day One),
   * and _playProgramme airs showAt(station, program.showHour) regardless of
   * the receiver's wall clock -- so the pin follows the declaration rather
   * than hardcoding either an hour or a cue id. */
  assert.equal(resumed.playbackReceipts[0].requested,
    voiceOf(showIntroLine(showAt(resumed.station, program.showHour))).cue);
});

test('an entry-packet song with no media playback path skips once instead of recursing', async () => {
  const { Radio } = await import('../src/core/radio.js');
  let saved = {
    volume: 0.7, cursor: 0, cycle: 0, selections: {}, songCursors: {},
    programProgress: {}, songReactionCursor: 0, adReactionCursor: 0, power: true,
  };
  const program = {
    id: 'H-DAMAGED-01',
    blocks: [{ id: 'song-1', type: 'song', songId: 'known-song' }],
  };
  const radio = new Radio(
    {
      ready: false,
      play() { return null; },
      startLoop() {}, stopLoop() {}, setLoopVolume() {},
    },
    { setRadio() {}, toast() {} },
    { hour: 9 },
    {
      state: {
        load: () => structuredClone(saved),
        save: (next) => { saved = structuredClone(next); },
        context: () => ({ program, programId: program.id, campaignNews: 'disabled' }),
      },
    },
  );
  radio.tracks = [{ id: 'known-song', file: 'known.mp3', title: 'Known' }];

  radio.turnOn();

  assert.deepEqual(saved.programProgress['H-DAMAGED-01'], {
    nextBlock: 1,
    completedBlockIds: ['song-1'],
  });
  assert.deepEqual(radio.playbackReceipts.map((receipt) => ({
    blockId: receipt.blockId,
    source: receipt.source,
    started: receipt.started,
    completed: receipt.completed,
    skipped: receipt.skipped,
  })), [{
    blockId: 'song-1',
    source: 'unavailable',
    started: false,
    completed: true,
    skipped: true,
  }]);
});

/* ------------------------------------------------------------------ */
/* The news desk: heard once, in the next hub, never again             */
/* ------------------------------------------------------------------ */

async function newsDeskFixture(campaign, receiverId, heard) {
  const { Radio } = await import('../src/core/radio.js');
  const { campaignRadioContext } = await import('../src/core/radio-program.js');
  const audio = {
    ready: true, ctx: { currentTime: 0 }, play() { return null; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {},
  };
  const state = {
    load: () => ({
      volume: 0.7, cursor: 0, cycle: 0, selections: {}, songCursors: {},
      programProgress: {}, songReactionCursor: 0, adReactionCursor: 0, power: true,
    }),
    save() {},
    context: () => campaignRadioContext(campaign, receiverId),
    campaignState: () => campaign,
    hasHeardBulletin: (id) => heard.has(id),
    markBulletinHeard: (id) => { heard.add(id); return true; },
  };
  return new Radio(audio, { setRadio() {}, toast() {} }, { hour: 12 }, { state });
}

/** Air one packet block: refill it, pump every segment, complete it. */
function airBlock(radio) {
  assert.equal(radio._refillProgram(), true, 'the packet has nothing left');
  const aired = [];
  while (radio._queue.length) {
    aired.push(radio._queue[0]);
    radio._pump();
  }
  radio._completeProgramBlock(aired.at(-1)._program);
  return aired;
}

test('the news desk reads every unheard report once, third in the packet, oldest first', async () => {
  const heard = new Set();
  const campaign = {
    scene: { id: 'apartment', spawn: 'front_door' }, story: {}, events: {},
    missions: {
      squatchfather: { status: 'complete' },
      bada_bing_two: { status: 'complete' }, jerky_motel: { status: 'complete' },
      bank_heist: { status: 'locked' }, silver_pines: { status: 'locked' },
    },
  };
  const radio = await newsDeskFixture(campaign, 'apartment', heard);
  radio._programContext = radio.state.context();
  assert.equal(radio._programContext.programId, 'H-APT-02');

  assert.equal(airBlock(radio).at(-1)._program.blockId, 'ident');
  assert.equal(airBlock(radio).at(-1)._program.blockId, 'show-intro');
  assert.equal(radio._refillProgram(), true);
  /* Three events have happened and none has been heard: the restaurant
   * (Day 1), the Bing night (Day 4) and the motel (Day 5). All three, oldest
   * first, and nothing else, before the hosts get going. */
  assert.deepEqual(radio._queue.filter((segment) => segment.newsId).map((segment) => segment.newsId),
    ['news.segment.squatchfather', 'news.segment.bing_night', 'news.segment.motel']);
  assert.equal(radio._queue.every((segment) => segment.news), true);
  assert.equal(radio._queue[0]._program.blockId, 'news-desk');
  /* The restaurant report is the flat's own recorded wire line, named as a
   * clip rather than minted as a new radio cue -- the owner's "don't
   * duplicate". */
  assert.equal(radio._queue[0].clip, 'vo.news.radio.day_two.1');
  assert.equal(radio._queue.filter((segment) => segment.clip).length, 1);
  const desk = [];
  while (radio._queue.length) { desk.push(radio._queue[0]); radio._pump(); }
  radio._completeProgramBlock(desk.at(-1)._program);
  assert.deepEqual([...heard].sort(),
    ['news.segment.bing_night', 'news.segment.motel', 'news.segment.squatchfather']);

  /* The rest of the packet carries no news, and the generic rotation after
   * it never brings either report back. */
  const rest = [];
  while (radio._programContext.program) {
    if (!radio._refillProgram()) break;
    while (radio._queue.length) { rest.push(radio._queue[0]); radio._pump(); }
    radio._completeProgramBlock(rest.at(-1)._program);
  }
  assert.equal(rest.some((segment) => segment.news), false);
  radio._lastNewsBlock = -10;
  for (let i = 0; i < 24; i++) {
    radio._refill();
    assert.equal(radio._queue.some((segment) => segment.news), false, `block ${i} re-aired a report`);
    while (radio._queue.length) radio._pump();
  }
});

test('a later hub skips the desk when there is nothing new, and reads only what has happened since', async () => {
  const heard = new Set(['news.segment.squatchfather', 'news.segment.bing_night', 'news.segment.motel']);
  const campaign = {
    scene: { id: 'luxury_apartment', spawn: 'arrival' }, story: {}, events: {},
    missions: {
      squatchfather: { status: 'complete' },
      bada_bing_two: { status: 'complete' }, jerky_motel: { status: 'complete' },
      bank_heist: { status: 'locked' }, silver_room: { status: 'locked' },
      no_wake: { status: 'locked' }, cartel_palace: { status: 'locked' },
    },
  };
  const radio = await newsDeskFixture(campaign, 'luxury_apartment', heard);
  radio._programContext = radio.state.context();
  assert.equal(radio._programContext.programId, 'H-LUX-01');
  airBlock(radio);
  airBlock(radio);
  /* Nothing new: the desk block is completed as skipped and the packet
   * moves straight on to the hosts. */
  assert.equal(radio._refillProgram(), true);
  assert.equal(radio._queue.some((segment) => segment.news), false);
  assert.equal(radio._queue[0]._program.blockId, 'talk-01');
  const progress = radio._programProgress['H-LUX-01'];
  assert.deepEqual(progress.completedBlockIds, ['ident', 'show-intro', 'news-desk']);
  const deskReceipt = radio.playbackReceipts.find((receipt) => receipt.blockId === 'news-desk');
  assert.equal(deskReceipt.skipped, true);
  assert.equal(deskReceipt.reason, 'nothing-new');
  while (radio._queue.length) radio._pump();

  /* THE TAKE happens while he is out. Back on this receiver, the report is
   * the next thing on, once. */
  campaign.missions.bank_heist.status = 'complete';
  radio._programContext = { ...radio._programContext, program: null, programId: null };
  radio._blocks = 6;
  radio._lastNewsBlock = -10;
  radio._refill();
  assert.deepEqual(radio._queue.filter((segment) => segment.newsId).map((segment) => segment.newsId),
    ['news.segment.heist']);
  while (radio._queue.length) radio._pump();
  assert.equal(heard.has('news.segment.heist'), true);
  for (let i = 0; i < 12; i++) {
    radio._refill();
    assert.equal(radio._queue.some((segment) => segment.news), false, `block ${i} re-aired THE TAKE`);
    while (radio._queue.length) radio._pump();
  }
});

test('the restaurant report is the flat\'s recorded wire line, owned by the desk and read nowhere else', async () => {
  const { NEWS_SEGMENTS, voiceCues } = await import('../src/core/stations.js');
  const { CHAPTER_NEWS } = await import('../src/core/apartment-story.js');
  const report = NEWS_SEGMENTS.find(({ id }) => id === 'news.segment.squatchfather');
  assert.deepEqual(report.clips, ['vo.news.radio.day_two.1']);
  assert.equal(report.lines[0], CHAPTER_NEWS.day_two.radio.line,
    'the desk must read the exact words the take on disk says');
  assert.equal(voiceCues().some((cue) => cue.say === report.lines[0]), false,
    'a clip-backed line must not mint a second cue for the same words');
  /* The flat hands both desk-owned stories to 97.8 and reads neither. */
  assert.equal(CHAPTER_NEWS.day_two.desk, 'news.segment.squatchfather');
  assert.equal(CHAPTER_NEWS.post_heist.desk, 'news.segment.heist');
  for (const [chapter, entry] of Object.entries(CHAPTER_NEWS)) {
    if (!entry.desk) continue;
    assert.ok(NEWS_SEGMENTS.some(({ id }) => id === entry.desk), `${chapter} names a desk report that does not exist`);
  }
});

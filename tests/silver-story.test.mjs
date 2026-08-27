import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EVENT_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createSilverStory } from '../src/core/silver-story.js';
import { Mission } from '../src/silver/mission.js';
import { SILVER_ROOM_MUSIC, SupperClubScore } from '../src/silver/music.js';
import { Performance, SET, Sway } from '../src/silver/perform.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function completedDate(outcome) {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    /* The round, not the harbour job. Beats 12-19 put Front & Center on the
     * night Lou hands over the keys and NO WAKE the morning after it, so what
     * stands behind a man walking into the Silver Room is Silver Pines. */
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
    state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'available';
  });

  const silver = createSilverStory({ campaign });
  assert.deepEqual(silver.begin(), { ok: true, resumed: false });
  assert.equal(silver.complete({ outcome, woo: 20 }), true);
  return createCampaign({ storage }).state.missions[MISSION_IDS.SILVER_ROOM];
}

test('every ending authored by the Silver Room mission survives the campaign handoff', () => {
  assert.equal(completedDate('polite').outcome, 'polite');
  assert.equal(completedDate('from-a-distance').outcome, 'from-a-distance');
});

test('Woo changes Margo\'s affirmative delivery but never gates the next scene', () => {
  for (const [score, band] of [[0, 'disaster'], [20, 'bad'], [45, 'awkward'], [70, 'good'], [84, 'strong']]) {
    const mission = new Mission();
    mission.flags.invitation = 'plain';
    assert.equal(mission.resolve(score, band), 'strong', `${score}/${band} must still be yes`);
  }
  const perfect = new Mission();
  Object.assign(perfect.flags, { invitation: 'callback', drinkOrdered: 'rye', funnyHow: true });
  assert.equal(perfect.resolve(98, 'perfect'), 'perfect');

  const saved = perfect.persist({
    snapshot: () => ({ score: 98, band: 'perfect', streak: true, tips: [] }),
  });
  assert.equal(saved.cameHome, true);
  assert.equal(saved.seeingHerAgain, true);
  assert.equal(saved.date.available, true);
});

test('the supper-club dance has forgiving default and assist windows while two of four still succeeds', () => {
  const sway = new Sway();
  sway.start(false);
  const defaultWindowMs = sway.beatLength * sway.window * 1000;
  assert.ok(defaultWindowMs >= 300, `default timing window was only ${defaultWindowMs.toFixed(0)}ms`);

  sway.start(true);
  const assistWindowMs = sway.beatLength * sway.window * 1000;
  assert.ok(assistWindowMs >= 420, `assist timing window was only ${assistWindowMs.toFixed(0)}ms`);
  assert.ok(assistWindowMs > defaultWindowMs);

  sway.start(false);
  const beat = sway.beatLength;
  sway.update(beat * 0.5);
  assert.equal(sway.press(), true);
  sway.update(beat);
  assert.equal(sway.press(), true);
  sway.update(beat * 0.5);
  assert.equal(sway.press(), false);
  sway.update(beat);
  assert.equal(sway.press(), false);
  assert.equal(sway.hits, 2);
  assert.equal(sway.result, 'good');
});

test('Bananaphone is the streamed, non-looping featured Front and Center performance', () => {
  const third = SET.find((number) => number.id === 'third');
  assert.equal(third?.title, 'Bananaphone');
  assert.equal(third?.track, 'assets/music/front-and-center-bananaphone-e786d7fe.mp3');
  assert.ok(third?.dur >= 192 && third?.dur <= 193,
    `featured performance fallback was ${third?.dur}s`);

  const file = path.join(ROOT, third.track);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, 4_666_221, 'the supplied Bananaphone master changed');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    'e786d7fe7a7f311d0c45ee6748aa9fc16639991ae1a3ab45c1c3d8238547d2bb');

  const calls = [];
  const audio = {
    ready: true,
    startLoop: (key, options) => calls.push(['startLoop', key, options]),
    startMusicLoop: (key, url, options) => {
      calls.push(['startMusicLoop', key, url, options]);
      return { element: { currentTime: 0, paused: false }, volume: options.volume };
    },
    setLoopVolume: (key, volume) => calls.push(['setLoopVolume', key, volume]),
    stopLoop: (key) => calls.push(['stopLoop', key]),
    play: () => null,
    busy: () => false,
  };
  const performance = new Performance({ audio, band: { members: [] } });
  performance.begin();
  assert.equal(calls.some((call) => call[0] === 'startMusicLoop'), false,
    'the full song must not load with the opening number');

  performance._next(SET.indexOf(third));
  const start = calls.find((call) => call[0] === 'startMusicLoop');
  assert.deepEqual(start?.slice(0, 3), ['startMusicLoop', 'band.feature', third.track]);
  assert.equal(start?.[3]?.loop, false);
  assert.equal(typeof start?.[3]?.onEnded, 'function');
});

test('a failed featured recording falls back to the live band and still completes the number', () => {
  const third = SET.find((number) => number.id === 'third');
  const calls = [];
  const featureHandle = { element: { currentTime: 0, paused: true }, released: false };
  const audio = {
    ready: true,
    startLoop: (key, options) => calls.push(['startLoop', key, options]),
    startMusicLoop: (key, url, options) => {
      calls.push(['startMusicLoop', key, url, options]);
      return featureHandle;
    },
    setLoopVolume: (key, volume) => calls.push(['setLoopVolume', key, volume]),
    setLoopCutoff: () => null,
    stopLoop: (key) => calls.push(['stopLoop', key]),
    play: () => null,
    busy: () => false,
  };
  const errors = [];
  const completed = [];
  const performance = new Performance({
    audio,
    band: { members: [] },
    onNumberError: (number, error) => errors.push([number.id, error.message]),
    onNumberEnd: (number) => completed.push(number.id),
  });
  performance.begin();
  performance._next(SET.indexOf(third));
  const start = calls.find((call) => call[0] === 'startMusicLoop');
  const afterStart = calls.length;

  start[3].onError(featureHandle, new Error('the master could not be decoded'));
  performance.update(third.dur + 0.1);

  assert.deepEqual(errors, [['third', 'the master could not be decoded']]);
  assert.equal(calls.slice(afterStart).some(
    (call) => call[0] === 'setLoopVolume' && call[1] === 'band.rhythm' && call[2] > 0,
  ), true, 'the procedural house band should carry a failed master');
  assert.deepEqual(completed, ['third'], 'the invitation gate must remain reachable');
});

test('a featured recording rejected on resume is released before the live-band fallback', async () => {
  const third = SET.find((number) => number.id === 'third');
  const calls = [];
  const loops = new Map();
  const element = {
    currentTime: 0,
    paused: false,
    pause() { this.paused = true; },
    play() { return Promise.reject(new Error('resume was rejected')); },
  };
  const featureHandle = { element, released: false };
  const audio = {
    ready: true,
    loops,
    startLoop: (key, options) => calls.push(['startLoop', key, options]),
    startMusicLoop: (key, url, options) => {
      calls.push(['startMusicLoop', key, url, options]);
      loops.set(key, featureHandle);
      return featureHandle;
    },
    setLoopVolume: (key, volume) => calls.push(['setLoopVolume', key, volume]),
    setLoopCutoff: () => null,
    stopLoop: (key) => {
      calls.push(['stopLoop', key]);
      loops.delete(key);
      featureHandle.released = true;
    },
    play: () => null,
    busy: () => false,
  };
  const errors = [];
  const completed = [];
  const performance = new Performance({
    audio,
    band: { members: [] },
    onNumberError: (number, error) => errors.push([number.id, error.message]),
    onNumberEnd: (number) => completed.push(number.id),
  });

  performance.begin();
  performance._next(SET.indexOf(third));
  performance.pause();
  performance.resume();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(errors, [['third', 'resume was rejected']]);
  assert.equal(loops.has('band.feature'), false, 'the rejected media graph must not leak');
  assert.equal(performance._featureHandle, null);
  assert.equal(performance._featureFallback, true);
  assert.equal(calls.some((call) => call[0] === 'stopLoop' && call[1] === 'band.feature'), true);

  performance.update(third.dur + 0.1);
  assert.deepEqual(completed, ['third'], 'resume fallback must preserve the invitation gate');
});

test('pausing freezes the inter-number applause gap before the next number starts', () => {
  const audio = {
    startLoop: () => null,
    setLoopVolume: () => null,
    stopLoop: () => null,
    play: () => null,
    busy: () => false,
  };
  const performance = new Performance({ audio, band: { members: [] } });
  performance.begin();
  performance.update(SET[0].dur + 0.1);
  assert.equal(performance.current, null, 'the band should be inside its applause gap');

  performance.pause();
  performance.update(10);
  assert.equal(performance.current, null, 'paused time cannot consume the applause gap');

  performance.resume();
  performance.update(2.39);
  assert.equal(performance.current, null);
  performance.update(0.02);
  assert.equal(performance.current?.id, 'second');
  performance.finish();
});

test('pausing also freezes performance-owned dialogue callbacks', () => {
  const audio = {
    startLoop: () => null,
    setLoopVolume: () => null,
    stopLoop: () => null,
    play: () => null,
    busy: () => false,
  };
  const performance = new Performance({ audio, band: { members: [] } });
  let callbacks = 0;
  performance.begin();
  performance.defer(4, () => { callbacks++; });

  performance.pause();
  performance.update(20);
  assert.equal(callbacks, 0);
  performance.resume();
  performance.update(3.99);
  assert.equal(callbacks, 0);
  performance.update(0.02);
  assert.equal(callbacks, 1);
  performance.finish();
});

test('finishing the show cancels an inter-number transition', () => {
  const audio = {
    startLoop: () => null,
    setLoopVolume: () => null,
    stopLoop: () => null,
    play: () => null,
    busy: () => false,
  };
  const performance = new Performance({ audio, band: { members: [] } });
  performance.begin();
  performance.update(SET[0].dur + 0.1);
  performance.finish();
  performance.update(10);

  assert.equal(performance.playing, false);
  assert.equal(performance.current, null);
  assert.deepEqual(performance.numbersPlayed, ['opener']);
});

test('a post-feature restore returns to an honest quiet between-set room', () => {
  const calls = [];
  const band = { members: [{ group: { visible: false } }] };
  const room = { openStageCurtain: (amount) => calls.push(['curtain', amount]) };
  const audio = {
    startLoop: (key) => calls.push(['startLoop', key]),
    setLoopVolume: () => null,
    stopLoop: (key) => calls.push(['stopLoop', key]),
    play: () => null,
    busy: () => false,
  };
  const performance = new Performance({ audio, band, room });
  performance.begin();
  performance.restoreBetweenSets();

  assert.equal(performance.playing, false);
  assert.equal(performance.setEnded, true);
  assert.equal(performance.current, null);
  assert.equal(band.members[0].group.visible, true);
  assert.equal(calls.some(([kind, amount]) => kind === 'curtain' && amount === 1), true);
  /* Three stems, not four: `band.vocal` — the "ohhh la la" scat loop — was
   * retired from playback entirely on the owner's note ("the singing sound
   * has got to go"), so a restore has nothing of it to stop. */
  for (const stem of ['rhythm', 'horns', 'piano']) {
    assert.equal(calls.some(([kind, key]) => kind === 'stopLoop' && key === `band.${stem}`), true);
  }
  assert.equal(calls.some(([kind, key]) => key === 'band.vocal'), false,
    'the retired vocal stem is never even addressed');
});

test('the date cannot end before the featured third number completes across a mission checkpoint', () => {
  const mission = new Mission();
  mission.state = 'performance';
  mission.inState = 999;
  mission.flags.showStarted = true;
  mission.roundsDone = new Set(['entrance', 'drinks', 'family', 'personal']);
  assert.equal(mission.invitationReady, false);
  assert.equal(mission.offerInvitation(), false);

  mission.flags.mainPerformanceStarted = true;
  mission.flags.mainPerformanceComplete = true;
  assert.equal(mission.invitationReady, true);

  const restored = new Mission();
  restored.restore(mission.checkpoint());
  assert.equal(restored.flags.mainPerformanceComplete, true);
  assert.equal(restored.invitationReady, true);
});

/* ------------------------------------------------------------------ *
 * The owner's audio notes, asserted rather than listened to.
 * ------------------------------------------------------------------ */

/**
 * "Then cut the other sounds — I still hear this ohhh ohh singing sound in the
 * background during banana phone."
 *
 * The "ohhh ohh" is `band.vocal`: two bandpassed noise voices with nothing
 * intelligible in them, which is right underneath a synthesised house band and
 * wrong underneath a real recording of a real one. It used to be ramped to
 * zero and left running, so every later caller that touched the mix — the
 * dialogue duck, the room crossfade, a checkpoint restore — got another go at
 * deciding what "zero" meant. Stopped is a state; quiet is an opinion.
 *
 * The stem roster here is the CURRENT one: `band.vocal` has since been
 * retired from playback altogether ("the 'ohhh la la la' singing sound has
 * got to go"), so the strongest version of this test's own complaint now
 * holds — the vocal cannot bleed under Bananaphone because nothing ever
 * starts it. The tail of the test pins exactly that.
 */
test('the featured number stops the house band stems instead of ducking them', () => {
  const third = SET.find((number) => number.id === 'third');
  const STEMS = ['rhythm', 'horns', 'piano'];
  const calls = [];
  const featureHandle = { element: { currentTime: 0, paused: true }, released: false };
  const audio = {
    ready: true,
    startLoop: (key) => calls.push(['startLoop', key]),
    startMusicLoop: (key, url, options) => {
      calls.push(['startMusicLoop', key, url, options]);
      return featureHandle;
    },
    setLoopVolume: (key, volume) => calls.push(['setLoopVolume', key, volume]),
    setLoopCutoff: () => null,
    stopLoop: (key) => calls.push(['stopLoop', key]),
    play: () => null,
    busy: () => false,
  };
  const performance = new Performance({ audio, band: { members: [] } });
  performance.begin();
  for (const stem of STEMS) {
    assert.equal(calls.some(([kind, key]) => kind === 'startLoop' && key === `band.${stem}`), true,
      `the house band opens on ${stem}`);
  }

  performance._next(SET.indexOf(third));
  for (const stem of STEMS) {
    assert.equal(calls.some(([kind, key]) => kind === 'stopLoop' && key === `band.${stem}`), true,
      `${stem} is stopped for the featured number, not turned down`);
  }

  /* And nothing puts them back while the record is playing — including the
   * duck, which is the caller that used to. */
  const afterStop = calls.length;
  performance.setDucked(true);
  performance.update(0.5);
  performance.setDucked(false);
  performance.update(0.5);
  const revived = calls.slice(afterStop).filter(
    ([kind, key]) => kind === 'startLoop' && STEMS.some((s) => key === `band.${s}`),
  );
  assert.deepEqual(revived, [], 'nothing may restart a stem underneath the record');
  const raised = calls.slice(afterStop).filter(
    ([kind, key, volume]) => kind === 'setLoopVolume'
      && STEMS.some((s) => key === `band.${s}`) && volume > 0,
  );
  assert.deepEqual(raised, [], 'and nothing may raise one either');

  /* The retired stem, held out by name: no start, no volume, no stop —
   * `band.vocal` is not in this band's vocabulary any more. */
  assert.deepEqual(calls.filter(([, key]) => key === 'band.vocal'), [],
    'the retired vocal stem is never addressed at all');
});

test('the delivered opening plays for exactly 27 seconds after the joke, then hands straight to Bananaphone', () => {
  assert.deepEqual(SET.map((number) => number.id), ['opener', 'second', 'third', 'slow'],
    'the featured number is the third one anybody hears');
  const [opener, second, third] = SET;
  assert.equal(third.id, 'third');
  assert.ok(third.dur > 190, 'the featured master is not cut');
  assert.ok(opener.dur >= 8 && opener.dur <= 12);
  assert.equal(second.tail.track, SILVER_ROOM_MUSIC.opening.file);
  assert.equal(second.tail.at, 12, 'the delivered master starts after the patter and rimshot');
  assert.equal(second.tail.start, 0);
  assert.equal(second.tail.cutAt, 27);
  assert.equal(second.dur - second.tail.at, 27);
  assert.equal(second.seamlessNext, true);
  assert.ok(second.transition <= 0.2, 'there is no applause-sized dead gap before Bananaphone');

  const file = path.join(ROOT, second.tail.track);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, 7_388_632, 'the supplied opening master changed');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    'b3b9d1cca44488ee43723a44a36c5b860a04ee7c0c2787922ce6436852b00e30');

  const calls = [];
  const audio = {
    ready: true,
    startLoop: (key) => calls.push(['startLoop', key]),
    startMusicLoop: (key, url, options) => {
      calls.push(['startMusicLoop', key, url, options]);
      return { element: { currentTime: 0, paused: false }, volume: options.volume };
    },
    setLoopVolume: (key, volume) => calls.push(['setLoopVolume', key, volume]),
    setLoopCutoff: () => null,
    stopLoop: (key) => calls.push(['stopLoop', key]),
    play: (key) => calls.push(['play', key]),
    busy: () => false,
  };
  const performance = new Performance({ audio, band: { members: [] } });
  performance.begin();
  performance._next(SET.indexOf(second));
  performance.update(second.tail.at);
  const opening = calls.find((call) => call[0] === 'startMusicLoop');
  assert.deepEqual(opening?.slice(0, 3), ['startMusicLoop', 'band.feature', second.tail.track]);
  assert.equal(opening?.[3]?.start, 0);
  assert.equal(opening?.[3]?.cutAt, 27);
  assert.equal(opening?.[3]?.loop, false);
  assert.equal(opening?.[3]?.ambience, false);
  assert.equal('position' in opening[3], false, 'the supplied opening is non-diegetic game music');
  const beforeEnd = calls.length;
  opening[3].onEnded();
  assert.equal(calls.slice(beforeEnd).some(([kind, key]) => kind === 'play' && key === 'applause'), false,
    'the out-point does not insert another applause beat');
  performance.update(0.16);
  assert.equal(performance.current?.id, 'third');
  assert.equal(calls.filter(([kind]) => kind === 'startMusicLoop').at(-1)?.[2], third.track);
});

test('the delivered room score is non-positional, corridor-muffled, and dialogue-ducked', () => {
  const calls = [];
  const handle = { streamed: true };
  const audio = {
    startMusicLoop: (key, file, options) => {
      calls.push(['start', key, file, options]);
      return handle;
    },
    setLoopVolume: (key, value) => calls.push(['volume', key, value]),
    setLoopCutoff: (key, value) => calls.push(['cutoff', key, value]),
    stopLoop: (key) => calls.push(['stop', key]),
  };
  const score = new SupperClubScore(audio);
  assert.equal(score.start(), true);
  const start = calls.find(([kind]) => kind === 'start');
  assert.equal(start[2], SILVER_ROOM_MUSIC.background.file);
  assert.equal('position' in start[3], false, 'game score must not pretend to come from a speaker');
  assert.equal(start[3].loop, true);

  score.setZone('corridor', 0);
  const corridorVolume = calls.filter(([kind]) => kind === 'volume').at(-1)[2];
  const corridorCutoff = calls.filter(([kind]) => kind === 'cutoff').at(-1)[2];
  score.setZone('club', 0);
  const clubVolume = calls.filter(([kind]) => kind === 'volume').at(-1)[2];
  const clubCutoff = calls.filter(([kind]) => kind === 'cutoff').at(-1)[2];
  score.setDialogueDucked(true, 0);
  const ducked = calls.filter(([kind]) => kind === 'volume').at(-1)[2];
  assert.ok(corridorVolume > 0 && corridorVolume < clubVolume);
  assert.ok(corridorCutoff < clubCutoff);
  assert.ok(ducked < clubVolume);

  const bytes = fs.readFileSync(path.join(ROOT, SILVER_ROOM_MUSIC.background.file));
  assert.equal(bytes.length, 2_588_181, 'the supplied supper-club background master changed');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    '35c043f1834d73a693bbe019f4d170abf988a08ebebd53f631c45e8bb0a8bd2a');
});

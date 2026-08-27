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

/**
 * "Let's basically [play] all the sounds once for about a quarter of a number
 * and then just go right into banana phone."
 *
 * Both warm-ups still happen, in order, so the third number is still the third
 * number — which the Ape, the bandleader and the board all promise it will be.
 * They are simply about a quarter of the length they were.
 */
test('the warm-ups are about a quarter of a number and Bananaphone still lands third', () => {
  assert.deepEqual(SET.map((number) => number.id), ['opener', 'second', 'third', 'slow'],
    'the featured number is the third one anybody hears');
  const [opener, second, third] = SET;
  assert.equal(third.id, 'third');
  assert.ok(third.dur > 190, 'the featured master is not cut');
  for (const warmUp of [opener, second]) {
    assert.ok(warmUp.dur <= 12, `${warmUp.id} is a quarter of a number, not a number`);
    assert.ok(warmUp.dur >= 8, `${warmUp.id} still has room for its line and its applause`);
  }
  /* The gate the owner was waiting through: curtain to Bananaphone, including
   * the two applause gaps between numbers. It was 84 seconds. */
  const toBanana = opener.dur + 2.4 + second.dur + 2.4;
  assert.ok(toBanana < 30, `Bananaphone starts ${toBanana.toFixed(1)}s after the curtain`);
});

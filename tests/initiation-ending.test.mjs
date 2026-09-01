import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function fakeElement() {
  const classes = new Set(['hidden-hard']);
  const listeners = new Map();
  return {
    textContent: '',
    focused: false,
    attributes: new Map([['aria-hidden', 'true']]),
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    click() { listeners.get('click')?.({ currentTarget: this }); },
    focus() { this.focused = true; },
  };
}

test('Initiation finale reveals a replay portal whose one action opens preview.html', async () => {
  const { createInitiationFinale, INITIATION_REPLAY_TARGET } = await import(
    '../src/initiation/finale.js'
  );
  const portal = fakeElement();
  const button = fakeElement();
  button.textContent = 'Click here to replay anything';
  const elements = new Map([
    ['replay-anything', portal],
    ['replay-anything-button', button],
  ]);
  const assigned = [];
  const finale = createInitiationFinale({
    documentRef: {
      getElementById: (id) => elements.get(id) ?? null,
      exitPointerLock() {},
    },
    locationRef: { assign: (target) => assigned.push(target) },
  });

  finale.showReplayPortal();
  assert.equal(portal.classList.contains('hidden-hard'), false);
  assert.equal(portal.getAttribute('aria-hidden'), 'false');
  assert.equal(button.focused, true);
  assert.equal(button.textContent, 'Click here to replay anything');

  button.click();
  assert.deepEqual(assigned, ['./preview.html']);
  assert.equal(INITIATION_REPLAY_TARGET, './preview.html');
});

test('cabin stereo starts muffled, opens with the door, and is retired before the oath', async () => {
  const {
    createCabinAmbience,
    INITIATION_CABIN_MUSIC_KEY,
    INITIATION_CABIN_MUSIC_SRC,
  } = await import('../src/initiation/cabin/ambience.js');
  const { SPEAKERS } = await import('../src/initiation/cabin/site.js');
  const calls = [];
  const audio = {
    startLoop(key, options) { calls.push(['startLoop', key, options]); },
    startMusicLoop(key, source, options) {
      calls.push(['startMusicLoop', key, source, options]);
      return { key, source };
    },
    setLoopCutoff(key, hz, ramp) { calls.push(['setLoopCutoff', key, hz, ramp]); },
    setLoopVolume(key, volume, ramp) { calls.push(['setLoopVolume', key, volume, ramp]); },
    stopLoop(key, fade) { calls.push(['stopLoop', key, fade]); },
    play(name, options) { calls.push(['play', name, options]); },
  };
  const ambience = createCabinAmbience({ audio });

  ambience.start();
  const start = calls.find(([kind]) => kind === 'startMusicLoop');
  assert.deepEqual(start?.slice(0, 3), [
    'startMusicLoop',
    'initiation.cabin.music',
    'assets/music/initiation-cabin-stereo.mp3',
  ]);
  assert.equal(start?.[3]?.bus, 'music');
  assert.deepEqual(start?.[3]?.position, SPEAKERS.cabinMusic);
  assert.equal(ambience.music.state, 'muffled');
  assert.equal(INITIATION_CABIN_MUSIC_KEY, 'initiation.cabin.music');
  assert.equal(INITIATION_CABIN_MUSIC_SRC, 'assets/music/initiation-cabin-stereo.mp3');

  ambience.openDoor();
  assert.equal(ambience.music.state, 'open');
  assert.ok(calls.some(([kind, key, hz]) => kind === 'setLoopCutoff'
    && key === INITIATION_CABIN_MUSIC_KEY && hz >= 12_000));

  ambience.fadeForOath();
  const oathStop = calls.find(([kind, key]) => kind === 'stopLoop'
    && key === INITIATION_CABIN_MUSIC_KEY);
  assert.equal(typeof oathStop?.[2], 'number', 'AudioEngine.stopLoop requires numeric fade seconds');
  assert.ok(oathStop[2] >= 3, 'the cabin stereo should make a deliberate fade, not a hard cut');
  assert.equal(ambience.music.silenceCommitted, true);

  const startsBefore = calls.filter(([kind]) => kind === 'startMusicLoop').length;
  ambience.openDoor();
  ambience.start();
  assert.equal(calls.filter(([kind]) => kind === 'startMusicLoop').length, startsBefore,
    'nothing may restart the cabin stereo during the oath or ending');
});

test('Initiation ends by fading directly into the shared full credit roll', async () => {
  const [html, main] = await Promise.all([
    read('initiation.html'),
    read('src/initiation/main.js'),
  ]);

  assert.doesNotMatch(html, /Exit to Campground|TO THE CAMPGROUND/i);
  assert.doesNotMatch(html, /id=["']goHomeBtn["']/);
  for (const id of ['credits', 'credits-track', 'credits-skip']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing`);
  }
  assert.match(main, /createCampaignCreditsView/);
  assert.match(main, /prospectRecordCreditEntries\(campaign\.state\.statistics\)/);
  assert.match(main, /campaignCreditsView\.roll\(\{/);
  assert.match(main, /recordInitiationComplete\(\)[\s\S]{0,700}campaignCreditsView\.roll\(\{/,
    'completion must be saved before the credits take over');
});

test('the shared credits view owns a deterministic natural ending', async () => {
  const source = await read('src/core/campaign-credits-view.js');
  assert.match(source, /setTimeout/);
  assert.match(source, /CREDITS_FADE_S/);
  assert.match(source, /CREDITS_MUSIC_SRC = null/,
    'the undelivered owner music slot must stay silent instead of requesting a missing asset');
  assert.doesNotMatch(source, /assets\/music\/credits\.mp3/,
    'the default credits path points at a file that does not exist');
  assert.match(source, /onDone\?\.\(\)/);
  assert.match(source, /duration \* 1000/,
    'the crawl must end even when the player never presses Skip');
});

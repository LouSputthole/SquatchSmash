import test from 'node:test';
import assert from 'node:assert/strict';
import { BingAudioEngine, isBingPreloadCue } from '../src/bing/audio.js';

test('the Bing preload owns every Bing-authored voice surface', () => {
  for (const cue of [
    'vo.bing.full.lou.enter.lou.abc123',
    'vo.bing.hang.booski.1',
    'vo.bing.blackjack.dealer.win',
    'vo.bing.lou.brief2.1',
  ]) {
    assert.equal(isBingPreloadCue(cue), true, cue);
  }
});

test('the Bing preload retains shared table, slots, phone-call and footstep banks', () => {
  for (const cue of [
    'vo.bj.dealer.minimum.1',
    'vo.slots.dead.1',
    'vo.call.booski.airstrip.1',
    'footstep.carpet.a',
  ]) {
    assert.equal(isBingPreloadCue(cue), true, cue);
  }
});

test('the Bing preload retains every recorded runtime effect and rejects other scenes', () => {
  const runtimeEffects = [
    'phone.ring', 'phone.hangup',
    'radio.talk', 'radio.tune',
    'slot.pull', 'slot.reel', 'slot.stop', 'slot.win', 'slot.jackpot',
    'card.deal', 'card.flip', 'chips.place', 'chip.stack',
    'gun.pickup', 'glass.set', 'can.crack', 'can.sip', 'can.crush',
    'till.ring', 'bing.money.flutter', 'bing.line.snort',
    'door.locked', 'door.knob', 'door.creak', 'alarm.chirp',
    'chair.sit', 'rope.clip', 'duck.quack',
    'car.door', 'car.engine.start', 'car.engine.idle', 'neighbours.thump',
    'whiskey.swig', 'whiskey.cap', 'whiskey.pour',
    'ambience.rain', 'ambience.bing.rain.muffled',
    'ambience.club', 'ambience.crowd',
  ];
  for (const cue of runtimeEffects) {
    assert.equal(isBingPreloadCue(cue), true, cue);
  }

  for (const cue of [
    'vo.beefrun.sasole.cruise.1',
    'vo.silver.margo.welcome.1',
    'vo.sf.lou.entry.1',
    'vo.wake.1',
    'radio.vo.lou1.0d4c90q',
    'ambience.kitchen',
  ]) {
    assert.equal(isBingPreloadCue(cue), false, cue);
  }
});

test('BingAudioEngine makes only owned available cues resident', async () => {
  const priorInline = globalThis.__SQUATCH_INLINE;
  const dataFile = 'data:audio/mpeg;base64,AAAA';
  globalThis.__SQUATCH_INLINE = {
    'assets/sfx/manifest.json': {
      sfx: [
        { name: 'vo.bing.hang.booski.1', file: dataFile },
        { name: 'phone.ring', file: dataFile },
        { name: 'radio.talk', file: dataFile },
        { name: 'vo.beefrun.sasole.cruise.1', file: dataFile },
        { name: 'radio.vo.lou1.0d4c90q', file: dataFile },
      ],
    },
  };

  class ProbeBingAudioEngine extends BingAudioEngine {
    async _loadWanted(wanted) {
      this.wanted = wanted;
      this.loadedCount = wanted.length;
    }
  }

  try {
    const audio = new ProbeBingAudioEngine();
    const result = await audio.loadManifest({ names: ['radio.vo.lou1.0d4c90q'] });
    assert.deepEqual(audio.wanted.map((cue) => cue.name), [
      'vo.bing.hang.booski.1',
      'phone.ring',
      'radio.talk',
      'radio.vo.lou1.0d4c90q',
    ]);
    assert.deepEqual(audio.preloadStats, { manifestTotal: 5, selected: 4 });
    assert.deepEqual(result, { total: 4, loaded: 4 });
  } finally {
    if (priorInline === undefined) delete globalThis.__SQUATCH_INLINE;
    else globalThis.__SQUATCH_INLINE = priorInline;
  }
});

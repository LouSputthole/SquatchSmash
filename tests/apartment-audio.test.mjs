import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ApartmentAudioEngine,
  isApartmentPreloadCue,
  isApartmentStartupCue,
  planApartmentAudioPreload,
} from '../src/core/apartment-audio.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
const index = JSON.parse(fs.readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
const available = new Set(index.files || []);
const recorded = (manifest.sfx || [])
  .filter((cue) => available.has(cue.file || `${cue.name}.mp3`));
/**
 * Scene voice banks that legitimately have nothing recorded yet.
 *
 * The whole of NO WAKE's script was rewritten for the redesign
 * (`docs/NO-WAKE-REDESIGN.md`), so its 37 lines are all new cues awaiting
 * takes. The assertions below still have to hold -- an unrecorded bank must
 * not leak into the Apartment either -- but "this bank has at least one
 * delivered take" is a statement about delivery, not about isolation, and it
 * is false for this scene until the voice run happens.
 *
 * EMPTY THIS ONCE THE TAKES LAND.
 */
const SCENE_BANKS_AWAITING_RECORDING = new Set(['vo.nowake.']);

const golfOnlyEffectNames = new Set([
  'ambience.course',
  'bird',
  'cart.motor',
  'mower.distant',
  'sprinkler',
  'sprinkler.tick',
]);

const apartmentRuntimeFiles = [
  '../src/main.js',
  '../src/world/apartment.js',
  '../src/core/apartment-story.js',
  '../src/core/chat.js',
  '../src/core/narrator.js',
  '../src/core/phone.js',
  '../src/core/phone-content.js',
  '../src/core/radio.js',
  '../src/core/spooky.js',
  '../src/core/tv.js',
  ...fs.readdirSync(new URL('../src/arcade/', import.meta.url))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `../src/arcade/${name}`),
];
const apartmentRuntimeSource = apartmentRuntimeFiles
  .map((name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8'))
  .join('\n');

test('the apartment keeps every recorded cue except proven scene-only banks', () => {
  const excluded = [
    'vo.beefrun.', 'vo.silver.', 'vo.bing.', 'vo.sf.',
    'vo.motel.', 'vo.initiation.', 'vo.bj.', 'vo.bing2.', 'vo.graveyard.', 'vo.nowake.',
    'vo.golf.', 'golf.',
    'heist.',
  ];
  const expected = recorded.filter((cue) => cue.name.startsWith('heist.apartment.')
    || (!golfOnlyEffectNames.has(cue.name)
      && !excluded.some((prefix) => cue.name.startsWith(prefix))));
  const selected = recorded.filter(isApartmentPreloadCue);

  assert.deepEqual(selected.map((cue) => cue.name), expected.map((cue) => cue.name));
  assert.ok(selected.length < recorded.length, 'the Apartment must not decode the global library');
});

test('the apartment preload plan reports the full manifest and selected recording counts', () => {
  const plan = planApartmentAudioPreload(manifest.sfx || [], available);
  const expectedSelected = recorded.filter(isApartmentPreloadCue).length;

  assert.equal(plan.manifestTotal, manifest.sfx.length);
  assert.equal(plan.selected, expectedSelected);
  assert.equal(plan.wanted.length, plan.selected);
});

test('the Apartment audio engine exposes its scoped preload plan at runtime', async () => {
  const dataFile = 'data:audio/mpeg;base64,ZmFrZQ==';
  globalThis.__SQUATCH_INLINE = {
    'assets/sfx/manifest.json': {
      sfx: [
        { name: 'radio.click', file: dataFile },
        { name: 'vo.call.lou.1', file: dataFile },
        { name: 'vo.beefrun.sasole.arrival.1', file: dataFile },
      ],
    },
  };
  try {
    const audio = new ApartmentAudioEngine();
    let wanted = [];
    audio._loadWanted = async (cues) => {
      wanted = cues;
      audio.loadedCount = cues.length;
    };

    const loaded = await audio.loadManifest();
    assert.deepEqual(wanted.map((cue) => cue.name), ['radio.click', 'vo.call.lou.1']);
    assert.deepEqual(audio.preloadStats, { manifestTotal: 3, selected: 2 });
    assert.deepEqual(loaded, { total: 2, loaded: 2 });
  } finally {
    delete globalThis.__SQUATCH_INLINE;
  }
});

test('Apartment runtime literals and connected voice banks all remain resident', () => {
  const selected = new Set(recorded.filter(isApartmentPreloadCue).map((cue) => cue.name));
  const quotedRuntimeCues = recorded
    .map((cue) => cue.name)
    .filter((name) => apartmentRuntimeSource.includes(`'${name}'`)
      || apartmentRuntimeSource.includes(`"${name}"`)
      || apartmentRuntimeSource.includes(`\`${name}\``));
  const saidGroups = new Set([...apartmentRuntimeSource.matchAll(
    /\.say(?:\?\.)?\s*\(\s*['"]([^'"]+)['"]/g,
  )].map((match) => match[1]));
  const saidBankCues = recorded
    .map((cue) => cue.name)
    .filter((name) => [...saidGroups].some((group) => name.startsWith(`vo.${group}.`)));
  const connectedBankPrefixes = [
    'vo.call.',
    'vo.machine.',
    'vo.news.',
    'vo.radio.',
    'vo.mail.',
    'vo.margo.wake.',
  ];
  const connectedBankCues = recorded
    .map((cue) => cue.name)
    .filter((name) => connectedBankPrefixes.some((prefix) => name.startsWith(prefix)));

  const required = new Set([...quotedRuntimeCues, ...saidBankCues, ...connectedBankCues]);
  const missing = [...required].filter((name) => !selected.has(name));
  assert.ok(required.size > 150, `expected broad Apartment cue coverage, found ${required.size}`);
  assert.deepEqual(missing, []);
});

test('Apartment startup loads automatic cues and the exact radio window before the optional bank', async () => {
  const dataFile = 'data:audio/mpeg;base64,ZmFrZQ==';
  globalThis.__SQUATCH_INLINE = {
    'assets/sfx/manifest.json': {
      sfx: [
        { name: 'bed.rustle', file: dataFile },
        { name: 'vo.wake.1', file: dataFile },
        { name: 'radio.vo.lou.hour', file: dataFile },
        { name: 'vo.beer.good.1', file: dataFile },
        { name: 'vo.motel.rico.scene-only', file: dataFile },
      ],
    },
  };
  try {
    const audio = new ApartmentAudioEngine();
    const batches = [];
    audio._loadWanted = async (cues) => {
      batches.push(cues.map((cue) => cue.name));
      audio.loadedCount += cues.length;
    };

    const startup = await audio.loadStartup({ names: ['radio.vo.lou.hour'] });
    const resident = await audio.loadManifest();

    assert.deepEqual(batches[0], ['bed.rustle', 'vo.wake.1', 'radio.vo.lou.hour']);
    assert.deepEqual(batches[1], ['vo.beer.good.1']);
    assert.deepEqual(startup, { total: 3, loaded: 3 });
    assert.deepEqual(resident, { total: 4, loaded: 4 });
    assert.deepEqual(audio.startupStats, { selected: 3 });
  } finally {
    delete globalThis.__SQUATCH_INLINE;
  }
});

test('Apartment startup predicate keeps calls, wake scene, cleanup, and requested radio cues', () => {
  const opening = new Set([
    'radio.vo.lou.hour', 'ambience.room', 'vo.call.lou.heist.1',
    'vo.news.radio.day_two.1', 'vo.margo.wake.1', 'cloth.snap',
  ]);
  for (const cue of [
    'ambience.room', 'bed.rustle', 'phone.ring', 'vo.wake.1',
    'vo.getup.1', 'vo.call.lou.heist.1', 'vo.news.radio.day_two.1',
    'vo.margo.wake.1', 'heist.apartment.washed', 'radio.vo.lou.hour',
  ]) assert.equal(isApartmentStartupCue(cue, opening), true, cue);
  assert.equal(isApartmentStartupCue('ambience.city.rain', opening), false);
  assert.equal(isApartmentStartupCue('vo.call.booski.other.1', opening), false);
  assert.equal(isApartmentStartupCue('vo.beer.good.1', opening), false);
  assert.equal(isApartmentStartupCue('vo.motel.rico.scene-only', opening), false);
});

test('standalone mission banks stay out while apartment heist cleanup remains resident', () => {
  const missionVoicePrefixes = [
    'vo.motel.',
    'vo.initiation.',
    'vo.bj.',
    'vo.bing2.',
    'vo.graveyard.',
    'vo.nowake.',
    'vo.golf.',
  ];

  for (const prefix of missionVoicePrefixes) {
    const bank = recorded.filter((cue) => cue.name.startsWith(prefix));
    if (!SCENE_BANKS_AWAITING_RECORDING.has(prefix)) {
      assert.ok(bank.length > 0, `${prefix} must name a recorded standalone-scene bank`);
    }
    assert.ok(!apartmentRuntimeSource.includes(prefix), `${prefix} is referenced by Apartment runtime source`);
    assert.ok(bank.every((cue) => !isApartmentPreloadCue(cue)), `${prefix} leaked into Apartment`);
  }

  const missionHeist = recorded.filter((cue) => cue.name.startsWith('heist.')
    && !cue.name.startsWith('heist.apartment.'));
  const apartmentHeist = recorded.filter((cue) => cue.name.startsWith('heist.apartment.'));
  const golfEffects = recorded.filter((cue) => cue.name.startsWith('golf.')
    || golfOnlyEffectNames.has(cue.name));
  assert.ok(missionHeist.length > 0, 'THE TAKE must have a recorded standalone-scene bank');
  assert.ok(missionHeist.every((cue) => !isApartmentPreloadCue(cue)),
    'THE TAKE mission bank leaked into Apartment');
  assert.ok(apartmentHeist.length > 0, 'Apartment cleanup must have recorded heist cues');
  assert.ok(apartmentHeist.every(isApartmentPreloadCue),
    'Apartment cleanup cues must remain resident');
  assert.equal(golfEffects.length, 21, 'Silver Pines must retain its complete effect bank');
  assert.ok(golfEffects.every((cue) => !isApartmentPreloadCue(cue)),
    'Silver Pines effects leaked into Apartment');
});

test('shared non-voice recordings stay available while scene-only banks stay out', () => {
  const nonVoice = recorded.filter((cue) => !cue.name.startsWith('vo.')
    && (!cue.name.startsWith('heist.') || cue.name.startsWith('heist.apartment.'))
    && !cue.name.startsWith('golf.')
    && !golfOnlyEffectNames.has(cue.name));
  const excludedPrefixes = [
    'vo.beefrun.', 'vo.silver.', 'vo.bing.', 'vo.sf.',
    'vo.motel.', 'vo.initiation.', 'vo.bj.', 'vo.bing2.', 'vo.graveyard.', 'vo.nowake.',
    'vo.golf.',
  ];

  assert.ok(nonVoice.length > 100);
  assert.ok(nonVoice.every(isApartmentPreloadCue));
  for (const prefix of excludedPrefixes) {
    const bank = recorded.filter((cue) => cue.name.startsWith(prefix));
    if (!SCENE_BANKS_AWAITING_RECORDING.has(prefix)) {
      assert.ok(bank.length > 0, `${prefix} must name a real recorded scene bank`);
    }
    assert.ok(!apartmentRuntimeSource.includes(prefix), `${prefix} is referenced by Apartment runtime source`);
    assert.ok(bank.every((cue) => !isApartmentPreloadCue(cue)), `${prefix} leaked into Apartment`);
  }
});

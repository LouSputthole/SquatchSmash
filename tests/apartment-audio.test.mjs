import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ApartmentAudioEngine,
  isApartmentPreloadCue,
  planApartmentAudioPreload,
} from '../src/core/apartment-audio.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
const index = JSON.parse(fs.readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
const available = new Set(index.files || []);
const recorded = (manifest.sfx || [])
  .filter((cue) => available.has(cue.file || `${cue.name}.mp3`));

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

test('the apartment keeps every recorded cue except proven scene-only voice banks', () => {
  const excluded = ['vo.beefrun.', 'vo.silver.', 'vo.bing.', 'vo.sf.'];
  const expected = recorded.filter((cue) => !excluded.some((prefix) => cue.name.startsWith(prefix)));
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

test('all non-voice recordings stay available while mission-only voice stays out', () => {
  const nonVoice = recorded.filter((cue) => !cue.name.startsWith('vo.'));
  const excludedPrefixes = ['vo.beefrun.', 'vo.silver.', 'vo.bing.', 'vo.sf.'];

  assert.ok(nonVoice.length > 100);
  assert.ok(nonVoice.every(isApartmentPreloadCue));
  for (const prefix of excludedPrefixes) {
    const bank = recorded.filter((cue) => cue.name.startsWith(prefix));
    assert.ok(bank.length > 0, `${prefix} must name a real recorded scene bank`);
    assert.ok(!apartmentRuntimeSource.includes(prefix), `${prefix} is referenced by Apartment runtime source`);
    assert.ok(bank.every((cue) => !isApartmentPreloadCue(cue)), `${prefix} leaked into Apartment`);
  }
});

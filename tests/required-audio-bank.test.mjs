import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { inspectRequiredAudioBank } from '../tools/required-audio-bank.mjs';

const verifierSource = readFileSync(new URL('../tools/verify-mansion-siege.mjs', import.meta.url), 'utf8');
const siegeSource = readFileSync(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');

test('a required authored cue cannot disappear by being absent from the manifest', () => {
  const report = inspectRequiredAudioBank({
    requiredNames: ['siege.alarm.tone', 'siege.glass.shatter'],
    manifest: { sfx: [{ name: 'siege.alarm.tone' }] },
    index: { files: ['siege.alarm.tone.mp3'] },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.missingManifest, ['siege.glass.shatter']);
  assert.deepEqual(report.missingFiles, []);
  assert.deepEqual(report.residentNames, ['siege.alarm.tone']);
});

test('a manifest entry without its indexed recording is still missing authored audio', () => {
  const report = inspectRequiredAudioBank({
    requiredNames: ['siege.fire.crackle'],
    manifest: { sfx: [{ name: 'siege.fire.crackle', file: 'custom-fire.mp3' }] },
    index: { files: [] },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.missingManifest, []);
  assert.deepEqual(report.missingFiles, [{ name: 'siege.fire.crackle', file: 'custom-fire.mp3' }]);
  assert.deepEqual(report.residentNames, []);
});

test('the authored bank is green only when every required cue has an indexed file', () => {
  const report = inspectRequiredAudioBank({
    requiredNames: ['siege.checkpoint', 'siege.friendly.revived'],
    manifest: {
      sfx: [
        { name: 'siege.checkpoint' },
        { name: 'siege.friendly.revived', file: 'revived-authored.mp3' },
      ],
    },
    index: { files: ['siege.checkpoint.mp3', 'revived-authored.mp3'] },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.missingManifest, []);
  assert.deepEqual(report.missingFiles, []);
  assert.deepEqual(report.residentNames, ['siege.checkpoint', 'siege.friendly.revived']);
});

test('the Siege verifier checks the unfiltered required effect list before residency', () => {
  for (const name of [
    'siege.alarm.tone',
    'siege.glass.shatter',
    'siege.fire.crackle',
    'siege.wave.incoming',
    'siege.checkpoint',
    'siege.friendly.revived',
  ]) assert.match(siegeSource, new RegExp(`'${name.replaceAll('.', '\\.')}'`));

  assert.match(siegeSource, /export function siegeEffectCueNames\(\)/);
  assert.match(verifierSource, /inspectRequiredAudioBank\(\{/);
  assert.match(verifierSource, /requiredNames: siegeCueLists\.siegeEffectCueNames/);
  assert.match(verifierSource, /every required Siege effect has authored manifest metadata/);
  assert.ok(
    verifierSource.indexOf('inspectRequiredAudioBank({')
      < verifierSource.indexOf('const expectedSiegeResident'),
    'the verifier filtered residency before checking required authorship',
  );
});

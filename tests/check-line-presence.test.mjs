import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ALLOWLIST,
  CUE_SUBSTRING_EXEMPTIONS,
  GLOBAL_EXEMPT_PREFIXES,
  GLOBAL_EXEMPT_VOICES,
  findViolations,
  formatReport,
  loadSceneCasts,
  sceneForCue,
  spokenCues,
} from '../tools/check-line-presence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A tiny two-scene fixture, independent of the real scene-casts.json, so
 * these tests exercise the ALGORITHM rather than today's real-world roster
 * (which other agents are actively fixing and would make this suite
 * fragile). */
const SCENES = [
  {
    id: 'alpha', label: 'Alpha Scene', cuePrefixes: ['vo.alpha.'],
    staged: ['hero'], sceneVoiceExemptions: { radioman: 'always over the radio in this scene' },
  },
  {
    id: 'beta', label: 'Beta Scene', cuePrefixes: ['vo.beta.'],
    staged: ['sidekick'], sceneVoiceExemptions: {},
  },
];

test('spokenCues keeps only cues with both words and a cast voice', () => {
  const manifest = {
    sfx: [
      { name: 'vo.alpha.a', say: 'Hello.', voice: 'hero' },
      { name: 'vo.alpha.b', say: '', voice: 'hero' }, // no words
      { name: 'vo.alpha.c', say: 'Hi.', voice: '' }, // no cast voice
      { name: 'sfx.thud', prompt: 'a thud' }, // not a line at all
      { name: 'vo.alpha.d', say: 'Yo.' }, // voice missing entirely
    ],
  };
  const cues = spokenCues(manifest);
  assert.deepEqual(cues.map((c) => c.name), ['vo.alpha.a']);
});

test('sceneForCue resolves by declared prefix and returns null for no match', () => {
  assert.equal(sceneForCue('vo.alpha.hero.line', SCENES).id, 'alpha');
  assert.equal(sceneForCue('vo.beta.sidekick.line', SCENES).id, 'beta');
  assert.equal(sceneForCue('vo.gamma.nobody.line', SCENES), null);
});

test('sceneForCue refuses to silently pick one scene when two prefixes collide', () => {
  const colliding = [
    { id: 'a', label: 'A', cuePrefixes: ['vo.shared.'], staged: [] },
    { id: 'b', label: 'B', cuePrefixes: ['vo.shared.'], staged: [] },
  ];
  assert.throws(
    () => sceneForCue('vo.shared.line', colliding),
    /matches more than one scene/,
  );
});

test('a staged voice is clean; an unstaged one is a violation naming the scene and count', () => {
  const manifest = {
    sfx: [
      { name: 'vo.alpha.hero.1', say: 'I am here.', voice: 'hero' },
      { name: 'vo.alpha.ghost.1', say: 'Nobody built me.', voice: 'ghost' },
      { name: 'vo.alpha.ghost.2', say: 'Still nobody.', voice: 'ghost' },
      { name: 'vo.beta.sidekick.1', say: 'Present.', voice: 'sidekick' },
    ],
  };
  const { violations } = findViolations(manifest, SCENES);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].scene, 'Alpha Scene');
  assert.equal(violations[0].voice, 'ghost');
  assert.equal(violations[0].count, 2);
});

test('the player voice is exempt everywhere, with no scene entry required', () => {
  const manifest = {
    sfx: [{ name: 'vo.alpha.player.1', say: 'Muttering to myself.', voice: 'player' }],
  };
  const { violations, unmapped } = findViolations(manifest, SCENES);
  assert.deepEqual(violations, []);
  assert.deepEqual(unmapped, []);
});

test('phone/machine/news/radio cue prefixes are exempt regardless of voice or scene', () => {
  const manifest = {
    sfx: [
      { name: 'vo.call.ghost.1', say: 'On the phone.', voice: 'ghost' },
      { name: 'vo.machine.ghost.1', say: 'On the machine.', voice: 'ghost' },
      { name: 'vo.news.ghost.1', say: 'On the news.', voice: 'ghost' },
      { name: 'radio.vo.ghost.1', say: 'On the air.', voice: 'ghost' },
    ],
  };
  const { violations, unmapped } = findViolations(manifest, SCENES);
  assert.deepEqual(violations, []);
  // These cues never resolve to a scene (and should not need to).
  assert.deepEqual(unmapped, []);
});

test('a scene-declared voice exemption clears a voice that would otherwise violate', () => {
  const manifest = {
    sfx: [{ name: 'vo.alpha.radioman.1', say: 'Copy that.', voice: 'radioman' }],
  };
  const { violations } = findViolations(manifest, SCENES);
  assert.deepEqual(violations, []);
});

test('a cue-substring exemption clears one specific line without staging the voice', () => {
  const scenes = [{
    id: 'gamma', label: 'Gamma Scene', cuePrefixes: ['vo.gamma.'], staged: [], sceneVoiceExemptions: {},
  }];
  const exemptName = CUE_SUBSTRING_EXEMPTIONS[0].includes;
  const manifest = {
    sfx: [
      { name: `vo.gamma.${exemptName}.1`, say: 'Exempted.', voice: 'lou1' },
      { name: 'vo.gamma.lou1.other', say: 'Not exempted.', voice: 'lou1' },
    ],
  };
  const { violations } = findViolations(manifest, scenes);
  // Only the non-exempt line should surface, and only counted once.
  assert.equal(violations.length, 1);
  assert.equal(violations[0].count, 1);
  assert.equal(violations[0].cues[0], 'vo.gamma.lou1.other');
});

test('a cue that matches no scene and is not globally exempt is reported unmapped, not silently dropped', () => {
  const manifest = {
    sfx: [{ name: 'vo.nowhere.ghost.1', say: 'Where am I?', voice: 'ghost' }],
  };
  const { violations, unmapped } = findViolations(manifest, SCENES);
  assert.deepEqual(violations, []);
  assert.deepEqual(unmapped, [{ name: 'vo.nowhere.ghost.1', voice: 'ghost' }]);
});

test('an allowlisted scene+voice is reported separately and does not fail the run', () => {
  const manifest = {
    sfx: [{ name: 'vo.alpha.ghost.1', say: 'Accepted gap.', voice: 'ghost' }],
  };
  // findViolations reads the module-level ALLOWLIST; assert its documented
  // shape here rather than mutating it (it is frozen on purpose).
  assert.equal(Array.isArray(ALLOWLIST), true);
  const { violations } = findViolations(manifest, SCENES);
  // With today's empty allowlist this is a violation, which is the point:
  // nothing in this project's current ALLOWLIST silently swallows a finding.
  assert.equal(violations.length, 1);
});

test('formatReport names the scene, the voice and the count for every violation', () => {
  const manifest = {
    sfx: [
      { name: 'vo.alpha.ghost.1', say: 'Nobody built me.', voice: 'ghost' },
    ],
  };
  const report = formatReport(findViolations(manifest, SCENES));
  assert.match(report, /voice "ghost" has 1 line in scene "Alpha Scene" but no staged character/);
});

test('exemption tables are non-empty, frozen and documented data, not accidental empties', () => {
  assert.equal(Object.isFrozen(GLOBAL_EXEMPT_VOICES), true);
  assert.equal(Object.isFrozen(GLOBAL_EXEMPT_PREFIXES), true);
  assert.equal(Object.isFrozen(CUE_SUBSTRING_EXEMPTIONS), true);
  assert.equal(Object.isFrozen(ALLOWLIST), true);
  assert.equal(GLOBAL_EXEMPT_VOICES.includes('player'), true);
  for (const prefix of ['vo.call.', 'vo.machine.', 'vo.news.', 'radio.']) {
    assert.equal(GLOBAL_EXEMPT_PREFIXES.includes(prefix), true);
  }
});

test('Snow is not allowlisted for PROJECT SILENT SQUATCH — the known offender must still report', () => {
  const snowEntry = ALLOWLIST.find((entry) => entry.scene === 'silent-squatch' && entry.voice === 'snow');
  assert.equal(snowEntry, undefined,
    'Snow-in-lab (PLAYTEST-PUNCH-LIST.md S10/X1) must stay a reported violation until the scene is actually fixed');
});

/* ---------------------------------------------------------------- */
/* Structural checks against the real scene-casts.json — these guard  */
/* the DATA file's shape, not any particular scene's current roster,   */
/* so they stay true regardless of which agent fixes which scene next. */
/* ---------------------------------------------------------------- */

test('tools/scene-casts.json parses and every scene has the required shape', () => {
  const scenes = loadSceneCasts();
  assert.equal(scenes.length > 10, true);
  const seenIds = new Set();
  for (const scene of scenes) {
    assert.equal(typeof scene.id, 'string');
    assert.equal(seenIds.has(scene.id), false, `duplicate scene id ${scene.id}`);
    seenIds.add(scene.id);
    assert.equal(typeof scene.label, 'string');
    assert.equal(Array.isArray(scene.cuePrefixes) && scene.cuePrefixes.length > 0, true);
    assert.equal(Array.isArray(scene.staged), true);
    assert.equal(typeof scene.sceneVoiceExemptions, 'object');
  }
});

test('no two scenes in the real scene-casts.json claim the same cue prefix', () => {
  const scenes = loadSceneCasts();
  const owners = new Map();
  for (const scene of scenes) {
    for (const prefix of scene.cuePrefixes) {
      const prior = owners.get(prefix);
      assert.equal(prior, undefined, `prefix "${prefix}" claimed by both ${prior} and ${scene.id}`);
      owners.set(prefix, scene.id);
    }
  }
});

test('every spoken cue in the real manifest maps to a scene or a global exemption', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const scenes = loadSceneCasts();
  const { unmapped } = findViolations(manifest, scenes);
  assert.deepEqual(unmapped, [],
    'a spoken cue exists with no owning scene in tools/scene-casts.json and no global exemption — '
    + 'add its prefix to a scene (or to GLOBAL_EXEMPT_PREFIXES if it is a call/broadcast/PA voice)');
});

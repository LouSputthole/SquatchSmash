import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAudioTodo, normalizeAudioTodo } from '../tools/audio-todo-lib.mjs';
import { isFutureInitiationCue } from '../tools/audio-scope.mjs';
import { voiceProfileFor } from '../src/core/characters.js';
import { ALL_HEIST_DIALOGUE } from '../src/heist/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the legacy production-queue check runs on Windows and is current', () => {
  const result = spawnSync(process.execPath, ['tools/sound-queue.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /ERR_UNSUPPORTED_ESM_URL_SCHEME/);
  assert.match(result.stdout, /production queue: up to date/);
  assert.match(result.stdout, /coverage: every cue played by the code has a queue entry/);
});

test('the recording handoff groups manifest pickups and quarantines legacy briefs', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {
        lou2: { id: 'lou-voice', _note: 'Captain Sasole direction.' },
      },
      sfx: [
        { name: 'vo.beefrun.sasole.test.1', voice: 'lou2', say: 'Keep the nose down.' },
        { name: 'vo.beefrun.sasole.test-alias.1', voice: 'lou2', say: 'Keep the nose down.' },
        { name: 'vo.bing.recorded.1', voice: 'lou2', say: 'Already delivered.' },
        { name: 'vo.initiation.party.future.1', voice: 'lou2', say: 'Future party line.' },
        { name: 'water.splash', prompt: 'A heavy splash.', duration: 2.2 },
      ],
    },
    index: { files: ['vo.bing.recorded.1.mp3'], versions: {} },
    legacyQueue: {
      sfx: [
        { id: 'motel.doors.knock', scene: 'motel', category: 'doors', call: 'knock', file: 'audio/motel/knock.wav', description: 'Three knocks.', seconds: 1, variations: 2, status: 'todo' },
        { id: 'motel.design.unwired', scene: 'motel', category: 'design', call: null, file: 'audio/motel/unwired.wav', description: 'A future idea.', seconds: 1, variations: 1, status: 'todo' },
      ],
      ambience: [
        { id: 'motel.ambience.room', scene: 'motel', file: 'audio/motel/room.wav', description: 'Room tone.', seconds: 20, loop: true, status: 'todo' },
      ],
      music: [
        { id: 'campground.music.run', scene: 'campground', file: 'audio/campground/run.wav', description: 'Original score.', seconds: 90, loop: true, status: 'todo' },
      ],
    },
  });

  assert.match(markdown, /2 voice cue files representing 1 unique profile\/text performance, plus 1 manifest effect/);
  assert.match(markdown, /1 duplicate group avoids 1 redundant recording/);
  assert.equal((markdown.match(/PERFORMANCE REUSE GROUP 1/g) || []).length, 2);
  assert.match(markdown, /Future authored Initiation party dialogue: 1 total; 0 indexed and 1 missing/);
  assert.match(markdown, /not instantiated by the playable Initiation scene/i);
  assert.match(markdown, /Voice pickups — The Beef Run/);
  assert.match(markdown, /Voice profile: `lou2`/);
  assert.match(markdown, /vo\.beefrun\.sasole\.test\.1\.mp3/);
  assert.doesNotMatch(markdown, /Already delivered/);
  assert.match(markdown, /Manifest effect pickups — NO WAKE/);
  assert.match(markdown, /Legacy production review backlog — 4 briefs/);
  assert.match(markdown, /not drop-in runtime filenames/i);
  assert.match(markdown, /wired local hook `knock`/);
  assert.match(markdown, /UNWIRED DESIGN BRIEF/);
});

test('indexed takes with retired wording stay in the voice pickup handoff', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {},
      sfx: [{
        name: 'vo.call.lou.changed.1',
        voice: 'lou1',
        say: 'The current playable words.',
        needsRerecord: true,
      }],
    },
    index: { files: ['vo.call.lou.changed.1.mp3'] },
    legacyQueue: {},
  });

  assert.match(markdown, /Replacement takes: 1 indexed take explicitly marked for re-recording/);
  assert.match(markdown, /vo\.call\.lou\.changed\.1\.mp3/);
  assert.match(markdown, /RE-RECORD: the indexed take contains retired wording/);
});

test('a performance-only rerecord keeps its specific actor direction in the handoff', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {},
      sfx: [{
        name: 'vo.bing.booski.shot.yell',
        voice: 'booski',
        say: 'AY! I want that shot in thirty FUCKING seconds!',
        direction: 'Low, calm, and unhurried. The pressure comes from certainty, not volume.',
        needsRerecord: true,
        rerecordReason: 'The indexed take is too high-pitched. Replace it with this low, chill delivery, then remove `needsRerecord` from the manifest.',
      }],
    },
    index: { files: ['vo.bing.booski.shot.yell.mp3'] },
    legacyQueue: {},
  });

  assert.match(markdown, /Performance:\*\* Low, calm, and unhurried/);
  assert.match(markdown, /RE-RECORD: The indexed take is too high-pitched/);
});

test('same-word lines with different acting directions remain separate performances', () => {
  const directions = [
    'Cheerful.',
    'Gleeful.',
    'Innocently oblivious.',
    'Pleasantly deadpan.',
  ];
  const markdown = buildAudioTodo({
    manifest: {
      voices: {},
      sfx: directions.map((direction, index) => ({
        name: `vo.bing2.shubenator.signature.${index + 1}`,
        voice: 'shubenator',
        say: 'Hey guys, what’s going on?',
        direction,
      })),
    },
    index: { files: [] },
    legacyQueue: {},
  });

  assert.match(markdown, /4 voice cue files representing 4 unique profile\/text performances/);
  assert.match(markdown, /0 duplicate groups avoids 0 redundant recordings/);
  assert.doesNotMatch(markdown, /PERFORMANCE REUSE GROUP/);
  for (const direction of directions) {
    assert.match(markdown, new RegExp(`Performance:\\*\\* ${direction.replace('.', '\\.')}`));
  }
});

test('the standard voice generation command excludes unreachable party dialogue', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const generator = fs.readFileSync(path.join(ROOT, 'tools/generate-sfx.mjs'), 'utf8');
  assert.match(packageJson.scripts['sfx:vo'], /--voice-only --live-only/);
  assert.match(generator, /const LIVE_ONLY = has\('--live-only'\)/);
  assert.match(generator, /if \(LIVE_ONLY \|\| !INCLUDE_FUTURE\) cues = cues\.filter\(\(cue\) => !isFutureInitiationCue\(cue\)\)/);
});

test('every production sheet shares the same future Initiation exclusion', () => {
  assert.equal(isFutureInitiationCue({ name: 'vo.initiation.party.future.1' }), true);
  assert.equal(isFutureInitiationCue({ name: 'vo.initiation.ambient.future.1' }), true);
  assert.equal(isFutureInitiationCue({ name: 'vo.initiation.live.1' }), false);

  for (const file of ['generate-sfx.mjs', 'audio-todo-lib.mjs', 'voice-needed.mjs']) {
    const source = fs.readFileSync(path.join(ROOT, 'tools', file), 'utf8');
    assert.match(source, /import \{ isFutureInitiationCue \} from '\.\/audio-scope\.mjs';/,
      `${file} does not use the shared future-dialogue predicate`);
  }
});

test('delivered provisional takes stay visible as casting review work', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {
        'motel-rico': { id: 'audition-id', _note: 'PROVISIONAL casting; approve this voice.' },
      },
      sfx: [
        { name: 'vo.motel.rico.test.1', voice: 'motel-rico', say: 'You came alone.' },
      ],
    },
    index: { files: ['vo.motel.rico.test.1.mp3'] },
    legacyQueue: {},
  });
  assert.match(markdown, /Provisional casting review — 1 voice profile/);
  assert.match(markdown, /MOTEL RICO — 1 indexed, 0 missing/);
  assert.match(markdown, /playable demo takes, not automatic approval/);
});

test('THE TAKE voice and effect pickups have their own production section and direction', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {},
      sfx: [
        {
          name: 'heist.rippin.test',
          voice: 'rippinflow',
          say: 'The route changed. Keep up.',
        },
        {
          name: 'heist.guard.draw',
          prompt: 'a bank guard drawing a handgun from a leather holster',
        },
      ],
    },
    index: { files: [] },
    legacyQueue: {},
  });

  assert.match(markdown, /^## Voice pickups .* THE TAKE \(1\)$/m);
  assert.match(markdown, /RIPPINFLOW \(1\)/);
  assert.match(markdown, /Retired freestyler turned getaway driver/);
  assert.match(markdown, /^## Manifest effect pickups .* THE TAKE \(1\)$/m);
  assert.doesNotMatch(markdown, /^## Voice pickups .* Apartment and shared hub/m);
  assert.doesNotMatch(markdown, /^## Manifest effect pickups .* Shared \/ other/m);
});

test('NO WAKE and THE TAKE production briefs have delivered indexed recordings', () => {
  const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const manifest = readJson('assets/sfx/manifest.json');
  const index = readJson('assets/sfx/index.json');
  const handoff = buildAudioTodo({ manifest, index, legacyQueue: {} });
  const indexed = new Set(index.files);
  const cues = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
  const expected = {
    'NO WAKE': [
      'ambience.harbor',
      'seagull.distant',
      'boat.hull.creak',
      'boat.board.step',
      'boat.engine.start',
      'boat.engine.underway',
      'boat.engine.shutdown',
      'boat.hull.wake',
      'boat.rope.release',
      'boat.body.drag',
      'boat.body.rail',
      'boat.gunshot.deck',
    ],
    'THE TAKE': [
      'heist.ambience.safehouse.prep',
      'heist.ambience.van',
      'heist.map.paper',
      'heist.gear.armor.pickup',
      'heist.gear.carbine.pickup',
      'heist.van.door',
      'heist.bank.entry',
      'heist.guard.draw',
      'heist.guard.weapon.drop',
      'heist.weapon.carbine.indoor',
      'heist.crowd.react',
      'heist.body.marble',
      'heist.bank.alarm',
      'heist.cash.lift',
      'heist.cash.drop',
      'heist.police.gunshot',
      'heist.bullet.whiz',
      'heist.bullet.impact',
      'heist.vehicle.engine.load',
      'heist.vehicle.tires.road',
    ],
  };

  /* All known NO WAKE and THE TAKE effects are delivered. Add a cue here only
   * while it genuinely awaits a recording; the assertions below require it to
   * be removed as soon as the indexed file lands. */
  const awaitingDelivery = {
    'NO WAKE': [],
    'THE TAKE': [],
  };

  for (const [scene, names] of Object.entries(expected)) {
    const pending = awaitingDelivery[scene] ?? [];
    if (!pending.length) {
      assert.doesNotMatch(handoff, new RegExp(`^## Manifest effect pickups .* ${scene}`, 'm'));
    } else {
      assert.match(handoff, new RegExp(`^## Manifest effect pickups .* ${scene} \\(${pending.length}\\)$`, 'm'),
        `${scene} has effects awaiting delivery that the handoff does not list`);
      for (const name of pending) {
        const cue = cues.get(name);
        assert.ok(cue, `${name} must have a manifest production brief`);
        assert.ok((cue.prompt ?? '').length >= 40, `${name} prompt must be production-ready`);
        assert.equal(indexed.has(`${name}.mp3`), false,
          `${name} has been delivered — take it out of awaitingDelivery`);
      }
    }
    for (const name of names) {
      const cue = cues.get(name);
      assert.ok(cue, `${name} must have a manifest production brief`);
      assert.equal(typeof cue.prompt, 'string', `${name} must have a generation prompt`);
      assert.ok(cue.prompt.length >= 40, `${name} prompt must be production-ready`);
      assert.ok(Number.isFinite(cue.duration) && cue.duration > 0,
        `${name} must have an authored duration`);
      assert.equal(indexed.has(`${name}.mp3`), true,
        `${name} must keep its delivered recording in the runtime index`);
      assert.ok(fs.statSync(path.join(ROOT, 'assets/sfx', `${name}.mp3`)).size > 512,
        `${name} must have a non-placeholder delivered recording`);
      assert.doesNotMatch(handoff, new RegExp(name.replaceAll('.', '\\.') + '\\.mp3'),
        `${name} must leave the pickup list after delivery`);
    }
  }
});

test('every THE TAKE spoken line has exact text and role-specific casting in the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const authored = manifest.sfx.filter((cue) => cue.name.startsWith('heist.')
    && typeof cue.say === 'string');
  const byName = new Map(authored.map((cue) => [cue.name, cue]));
  const sceneSpecificVoices = {
    'Security Guard': 'heist-guard',
    'Bank Customer': 'heist-customer',
    'Bank Manager': 'heist-manager',
    'Big Uncle Lou': 'lou',
    /* She has one line and there is no `heist-teller` profile to give her, so
     * she shares the customer voice. Casting her properly needs a voice id and
     * is the owner's call; this table is deliberately spelled out rather than
     * imported from tools/heist-vo.mjs so the tool cannot certify itself. */
    Teller: 'heist-customer',
  };

  /* Both banks. The scene keeps its lines in two -- recorded, and authored but
   * not yet recorded -- and for a long time only the first had manifest cues
   * at all, which is precisely how 55 written lines stayed invisible to the
   * recording sheet. Asserting against the recorded bank alone would restore
   * that blind spot. */
  assert.equal(byName.size, Object.keys(ALL_HEIST_DIALOGUE).length,
    'THE TAKE manifest must not contain missing, duplicate, or retired spoken cues');
  for (const line of Object.values(ALL_HEIST_DIALOGUE)) {
    const cue = byName.get(line.cue);
    assert.ok(cue, `${line.cue} must be recordable from the shared manifest`);
    assert.equal(cue.say, line.text, `${line.cue} text must match the playable subtitle exactly`);
    assert.equal(cue.voice, sceneSpecificVoices[line.subtitleName] ?? voiceProfileFor(line.speakerId),
      `${line.cue} must use the canonical speaker voice`);
    assert.equal(cue.direction ?? '', line.direction ?? '',
      `${line.cue} must preserve its authored performance direction`);
  }
});

test('the committed recording handoff matches the current production sources', () => {
  const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const expected = buildAudioTodo({
    manifest: readJson('assets/sfx/manifest.json'),
    index: readJson('assets/sfx/index.json'),
    legacyQueue: readJson('assets/audio/sound-queue.json'),
  });
  const committed = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');

  assert.equal(normalizeAudioTodo(committed), normalizeAudioTodo(expected),
    'VOICE-LINES-TODO.md drifted; run `npm run audio:todo` after cue or recording changes');
});

test('the recording handoff check treats Windows and Unix line endings equally', () => {
  const unix = '# Voice Lines\n\n- One cue\n';
  const windows = unix.replace(/\n/g, '\r\n');

  assert.equal(normalizeAudioTodo(windows), normalizeAudioTodo(unix));
});

#!/usr/bin/env node
/**
 * Synchronize every NO WAKE spoken line into the global sound manifest.
 *
 *   npm run vo:nowake        -> updates assets/sfx/manifest.json
 *   npm run check:nowake-vo  -> reports scene/call drift without writing
 *   npm run audio:todo       -> writes the recording handoff markdown
 *
 * The scene's dialogue catalog and the canonical apartment call definition
 * are authoritative. Rebuilding removes stale owned cues before adding the
 * current scripts, so renamed or deleted lines cannot remain by accident.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_WAKE_LOU_CALL } from '../src/core/apartment-story.js';
import { callScript } from '../src/core/phone.js';
import { allNoWakeVoiceLines } from '../src/nowake/dialogue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

/** Every scene and apartment-phone line owned by the NO WAKE chapter. */
export function collectNoWakeVoiceCues() {
  const scene = allNoWakeVoiceLines().map((line) => ({
    name: `vo.nowake.${line.cue}.1`,
    voice: line.voice,
    say: line.text,
  }));
  const phoneCall = callScript(NO_WAKE_LOU_CALL).map((turn) => ({
    name: turn.cue,
    voice: turn.who === 'me' ? 'player' : NO_WAKE_LOU_CALL.voiceProfile,
    say: turn.text,
  }));
  return [...scene, ...phoneCall];
}

/** Return an updated manifest without mutating or writing the input. */
export function syncNoWakeVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => (
    !cue.name.startsWith('vo.nowake.')
    && !cue.name.startsWith(`vo.${NO_WAKE_LOU_CALL.vo}.`)
  ));
  return { ...manifest, sfx: [...kept, ...collectNoWakeVoiceCues()] };
}

/** Report scene/call cue drift without changing the manifest. */
export function checkNoWakeVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map(collectNoWakeVoiceCues().map((cue) => [cue.name, cue]));
  const owned = (manifest.sfx || []).filter((cue) => (
    cue.name.startsWith('vo.nowake.')
    || cue.name.startsWith(`vo.${NO_WAKE_LOU_CALL.vo}.`)
  ));
  const declared = new Map();
  for (const cue of owned) {
    if (declared.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) failures.push(`missing cue ${name}`);
    else if (actual.voice !== cue.voice || actual.say !== cue.say) {
      failures.push(`drifted cue ${name}`);
    }
  }
  for (const name of declared.keys()) {
    if (!expected.has(name)) failures.push(`stale cue ${name}`);
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkNoWakeVoiceManifest(manifest);
    if (failures.length) {
      for (const failure of failures) console.error(`FAIL ${failure}`);
      console.error(`${failures.length} NO WAKE voice manifest problem(s). Run \`npm run vo:nowake\`.`);
      process.exitCode = 1;
    } else {
      console.log(`NO WAKE voice manifest matches ${collectNoWakeVoiceCues().length} cue(s).`);
    }
    return;
  }
  const before = manifest.sfx?.length ?? 0;
  const synced = syncNoWakeVoiceManifest(manifest);
  const cues = collectNoWakeVoiceCues();
  const dropped = before - (synced.sfx.length - cues.length);
  fs.writeFileSync(MANIFEST, `${JSON.stringify(synced, null, 2)}\n`);

  const byVoice = {};
  for (const cue of cues) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${cues.length} NO WAKE voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  for (const [voice, count] of Object.entries(byVoice).sort()) {
    console.log(`  ${voice.padEnd(10)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();

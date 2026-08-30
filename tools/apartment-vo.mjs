#!/usr/bin/env node
/**
 * Synchronize the apartment's generated dialogue with the sound manifest.
 *
 *   npm run vo:apartment        -> synchronize the exact cue block
 *   npm run check:apartment-vo  -> report missing/stale/text/cast drift
 *
 * The apartment's calls, machine messages and news are already in the
 * manifest as authored rows. Its DOOR REFUSALS were not, and could not be:
 * they were seventeen string literals returned from seventeen branches of
 * `ApartmentStory.tryLeave()`, so the only way to enumerate them was to
 * execute every chapter of the campaign.
 *
 * What made that worth fixing is what the player got instead. `main.js` puts
 * the refusal on screen and plays a bank underneath it, and for every
 * `call`/`stay` refusal that bank was `vo.door.wait.*` -- three generic lines
 * about not guessing. So the screen said one thing, the voice said another,
 * and the seventeen specific lines somebody wrote were never offered to
 * anybody to record.
 *
 * `DEPARTURE_REFUSALS` in src/core/apartment-story.js is now the single copy
 * of that writing, and this walks it. The physical Margo stayover definitions
 * live beside it and are owned here for the same reason: a line added to the
 * two-floor scene must enter the booth sheet without a hand-edited manifest.
 * Nothing here restates a line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIG_NIGHT_MARGO_DRESS_ASK,
  BIG_NIGHT_MARGO_WAKE,
  SILVER_ROOM_COME_HOME,
  SILVER_ROOM_DRESS_ASK,
  SILVER_ROOM_NEW_PLACE,
  departureRefusalCues,
} from '../src/core/apartment-story.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const OWNED_PREFIXES = Object.freeze([
  'vo.door.refusal.',
  'vo.margo.comehome.',
  'vo.margo.wake.',
  /* Retired when the cabin became the sole date-scheduling conversation. */
  'vo.call.margo.date.',
]);

function owned(name) {
  return OWNED_PREFIXES.some((prefix) => String(name).startsWith(prefix));
}

function definitionCues(definition) {
  const cues = [];
  definition.lines.forEach((line, index) => {
    cues.push({
      name: `vo.${definition.vo}.${index + 1}`,
      voice: definition.voiceProfile,
      say: line,
    });
    const reply = definition.replies?.[index];
    if (reply) {
      cues.push({
        name: `vo.${definition.vo}.tony.${index + 1}`,
        voice: 'player',
        say: reply,
      });
    }
  });
  return cues;
}

export function collectApartmentVoiceCues() {
  return [
    ...departureRefusalCues(),
    ...definitionCues(SILVER_ROOM_NEW_PLACE),
    ...definitionCues(SILVER_ROOM_COME_HOME),
    ...definitionCues(SILVER_ROOM_DRESS_ASK),
    ...definitionCues(BIG_NIGHT_MARGO_WAKE),
    ...definitionCues(BIG_NIGHT_MARGO_DRESS_ASK),
  ];
}

/** Return an updated manifest without mutating or writing the input. */
export function syncApartmentVoiceManifest(manifest) {
  const expected = new Map(collectApartmentVoiceCues().map((cue) => [cue.name, cue]));
  const emitted = new Set();
  const sfx = [];
  for (const cue of manifest.sfx || []) {
    if (!owned(cue.name)) {
      sfx.push(cue);
      continue;
    }
    const replacement = expected.get(cue.name);
    if (!replacement || emitted.has(cue.name)) continue;
    sfx.push(replacement);
    emitted.add(cue.name);
  }
  for (const cue of expected.values()) {
    if (!emitted.has(cue.name)) sfx.push(cue);
  }
  return { ...manifest, sfx };
}

/** Report cue drift without changing the manifest. */
export function checkApartmentVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map();
  for (const cue of collectApartmentVoiceCues()) {
    if (expected.has(cue.name)) failures.push(`conflicting cue ${cue.name}`);
    expected.set(cue.name, cue);
  }
  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => owned(entry.name))) {
    if (declared.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) failures.push(`missing cue ${name}`);
    else if (actual.voice !== cue.voice || actual.say !== cue.say) failures.push(`drifted cue ${name}`);
  }
  for (const name of declared.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkApartmentVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} apartment voice-manifest problem(s). Run \`npm run vo:apartment\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Apartment voice manifest matches ${collectApartmentVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => owned(cue.name)).length;
  const cues = collectApartmentVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncApartmentVoiceManifest(manifest), null, 2)}\n`);
  console.log(`${cues.length} apartment voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();

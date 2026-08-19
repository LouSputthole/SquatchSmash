#!/usr/bin/env node
/**
 * Keep Silver Pines dialogue, its invitation call, and its authored effects in
 * the shared sound manifest. The scene script is the voice source of truth;
 * this file owns only the production metadata for non-spoken effects.
 *
 *   npm run vo:golf          -> synchronize the generated manifest block
 *   npm run check:golf-vo    -> report drift without writing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutRerecord } from './rerecord-queue.mjs';
import { CUES } from '../src/golf/script.js';
import {
  CHAPTER_MESSAGES,
  DAY_FOUR_LOU_GOLF_CALL,
} from '../src/core/apartment-story.js';
import { voiceProfileFor } from '../src/core/characters.js';
import { callScript } from '../src/core/phone.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

export const GOLF_EFFECT_MANIFEST = Object.freeze([
  { name: 'ambience.course', duration: 20, prompt: 'quiet late-morning private golf course after rain, light wind through pine needles, distant birds, very sparse, no voices, seamless loop' },
  { name: 'mower.distant', duration: 12, prompt: 'small petrol greens mower working two fairways away, faint steady engine through open air and trees, no close machinery, seamless loop' },
  { name: 'sprinkler', duration: 12, prompt: 'distant golf course impact sprinkler, soft water hiss and periodic mechanism, outdoors after rain, seamless loop' },
  { name: 'cart.motor', duration: 10, prompt: 'older electric golf cart moving at low speed, restrained motor whine and soft tyres on a paved cart path, seamless loop' },
  { name: 'bird', duration: 1.4, prompt: 'one small woodland bird giving a natural two-note call from a pine tree, isolated outdoor sound, no ambience bed' },
  { name: 'sprinkler.tick', duration: 0.6, prompt: 'golf course impact sprinkler head ratcheting three quick clicks with a short spray hiss, medium distance outdoors' },
  { name: 'golf.hit.driver', duration: 0.8, prompt: 'clean modern driver striking a golf ball from a tee, sharp explosive crack with a short open-course tail, no crowd' },
  { name: 'golf.hit.iron', duration: 0.7, prompt: 'clean iron striking a golf ball from short grass, dense metallic click and brief turf contact, open golf course, no crowd' },
  { name: 'golf.hit.putt', duration: 0.5, prompt: 'putter face contacting a golf ball on a quiet green, small firm click, very close and dry, no voices' },
  { name: 'golf.hit.sand', duration: 1, prompt: 'sand wedge blasting through a golf bunker, heavy thump followed by a short spray of sand, no clean ball click' },
  { name: 'golf.hit.rough', duration: 0.9, prompt: 'golf iron cutting through wet heavy rough and striking the ball, dense grass swish with a muted click' },
  { name: 'golf.land.green', duration: 0.5, prompt: 'golf ball landing once on a soft damp putting green, compact low thud, close outdoor recording' },
  { name: 'golf.land.sand', duration: 0.7, prompt: 'golf ball dropping into a soft bunker and throwing a small puff of sand, muted dry impact' },
  { name: 'golf.land.path', duration: 0.7, prompt: 'golf ball bouncing hard once on an asphalt cart path, sharp stone click with a short outdoor echo' },
  { name: 'golf.land.grass', duration: 0.6, prompt: 'golf ball landing on damp fairway grass, soft compact thud and a tiny brush of turf' },
  { name: 'golf.splash', duration: 1.2, prompt: 'golf ball dropping into a still course pond, small sharp splash with short ripples, quiet outdoors' },
  { name: 'golf.cup', duration: 0.9, prompt: 'golf ball dropping into a regulation cup, two satisfying liner knocks and a short rattle at the bottom, very close' },
  { name: 'golf.flag', duration: 0.8, prompt: 'metal golf flagstick lightly touched and settling in its cup, restrained hollow ring, close outdoors' },
  { name: 'golf.tee', duration: 0.5, prompt: 'small wooden golf tee pressed into damp turf, brief soil and grass movement, extremely close' },
  { name: 'golf.pickup', duration: 0.5, prompt: 'a golf ball picked up from closely mown grass by hand, tiny grass brush and fingertip contact, close' },
  { name: 'golf.bag', duration: 0.9, prompt: 'three golf clubs settling against each other in a carry bag, restrained metal shaft and clubhead clinks, close outdoors' },
]);

function isOwned(name) {
  return name?.startsWith('vo.golf.')
    || name?.startsWith('vo.call.lou.golf.')
    || name?.startsWith('vo.machine.lou.golf_morning.')
    || name?.startsWith('vo.machine.lou.heist_day.')
    || GOLF_EFFECT_MANIFEST.some((cue) => cue.name === name);
}

function collectDayFourMessageCues() {
  const cues = [];
  for (const chapter of ['golf_morning', 'heist_day']) {
    for (const message of CHAPTER_MESSAGES[chapter] || []) {
      cues.push({
        name: `vo.${message.vo}.0`,
        voice: 'announcer',
        say: `Message. ${message.at.replace(',', '.')}.`,
      });
      message.lines.forEach((line, index) => cues.push({
        name: `vo.${message.vo}.${index + 1}`,
        voice: voiceProfileFor(message.characterId),
        say: line,
      }));
    }
  }
  return cues;
}

export function collectGolfVoiceCues() {
  const course = Object.values(CUES).map((cue) => {
    const voice = voiceProfileFor(cue.speaker);
    if (!voice) throw new Error(`No voice profile for Golf speaker ${cue.speaker}`);
    if (!cue.direction) throw new Error(`Golf cue ${cue.id} has no recording direction`);
    return {
      name: `vo.${cue.id}`,
      voice,
      say: cue.text,
      direction: cue.direction,
      ...(cue.hold > 0 ? { postLineHold: cue.hold } : {}),
    };
  });
  const call = callScript(DAY_FOUR_LOU_GOLF_CALL).map((turn) => ({
    name: turn.cue,
    voice: turn.who === 'me' ? 'player' : DAY_FOUR_LOU_GOLF_CALL.voiceProfile,
    say: turn.text,
  }));
  return [...course, ...call, ...collectDayFourMessageCues()]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collectGolfManifestCues() {
  return [...collectGolfVoiceCues(), ...GOLF_EFFECT_MANIFEST]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function syncGolfManifest(manifest) {
  return {
    ...manifest,
    sfx: [
      ...(manifest.sfx || []).filter((cue) => !isOwned(cue.name)),
      ...collectGolfManifestCues(),
    ],
  };
}

export function checkGolfManifest(manifest) {
  const failures = [];
  const expected = new Map(collectGolfManifestCues().map((cue) => [cue.name, cue]));
  const actual = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => isOwned(entry.name))) {
    if (actual.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else actual.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    if (!actual.has(name)) failures.push(`missing cue ${name}`);
    else if (JSON.stringify(withoutRerecord(actual.get(name))) !== JSON.stringify(cue)) {
      /* Re-record metadata is stamped on after generation; it is not drift. */
      failures.push(`drifted cue ${name}`);
    }
  }
  for (const name of actual.keys()) {
    if (!expected.has(name)) failures.push(`stale cue ${name}`);
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkGolfManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} Golf manifest problem(s). Run \`npm run vo:golf\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Golf manifest matches ${collectGolfManifestCues().length} authored cue(s).`);
    }
    return;
  }

  const next = syncGolfManifest(manifest);
  fs.writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
  const voices = collectGolfVoiceCues();
  const byVoice = {};
  for (const cue of voices) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${voices.length} Golf voice cue(s) and ${GOLF_EFFECT_MANIFEST.length} effect cue(s) written.`);
  for (const [voice, count] of Object.entries(byVoice).sort()) {
    console.log(`  ${voice.padEnd(14)} ${count}`);
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();

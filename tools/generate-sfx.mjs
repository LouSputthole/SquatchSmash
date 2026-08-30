#!/usr/bin/env node
/**
 * Generate the apartment's audio with ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=sk_... node tools/generate-sfx.mjs
 *
 * Two kinds of cue live in assets/sfx/manifest.json, and they go to different
 * endpoints, because they are genuinely different things:
 *
 *   { "prompt": "..." }   a sound effect, described in words
 *                         -> /v1/sound-generation
 *   { "say": "..." }      a line of dialogue, spoken
 *                         -> /v1/text-to-speech/{voice_id}
 *
 * Every spoken cue names a voice from the `voices` block at the top of the
 * manifest, and that block is the only place a voice id appears. One id, one
 * voice, every line the character says -- change it there and the whole
 * performance changes together. Sound-generation has no notion of a voice at
 * all, which is why the split exists.
 *
 * Flags:
 *   --force            regenerate cues even if the file already exists
 *
 * Cues carrying `needsRerecord` (see assets/sfx/rerecord.json) are regenerated
 * without --force: their words changed after they were recorded, so the take
 * on disk is stale rather than done.
 *   --only <name,...>  generate just these cues; the flag may be repeated
 *   --cast <voice,...> just these voice profiles; the flag may be repeated
 *   --voice-only       just the spoken lines
 *   --live-only        exclude authored dialogue that is not reachable yet
 *   --include-future   explicitly allow unreachable future dialogue
 *   --sfx-only         just the sound effects
 *   --dry-run          list what would be generated and exit
 *   --voices           list the voices on the account and exit
 *
 * Nothing here is required to progress the game: missing sound effects keep a
 * procedural WebAudio fallback, while missing dialogue remains subtitled but
 * silent. Recordings make the authored performance audible.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFutureInitiationCue } from './audio-scope.mjs';
import { writeIndex } from './sfx-index-json.mjs';
import { recordTake } from './take-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SFX_DIR = path.join(ROOT, 'assets', 'sfx');
const TAKE_LEDGER = path.join(SFX_DIR, 'takes.json');
const MANIFEST = path.join(SFX_DIR, 'manifest.json');
const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';
const TTS = (voiceId) => `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
const VOICES = 'https://api.elevenlabs.io/v1/voices';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valuesOf = (f) => {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== f) continue;
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      console.error(`${f} requires a comma-separated value after every occurrence.`);
      process.exit(1);
    }
    values.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
  }
  return values.length ? [...new Set(values)] : null;
};

/* A flag this build does not know is a stop, not a shrug.
 *
 * Every filter here NARROWS the run, so an ignored one widens it. `--force
 * --cast lou1` on a checkout whose generator predates --cast does not
 * regenerate one man's lines: it regenerates all nine hundred cues, spends
 * the account, and reports success. Nothing downstream can tell that apart
 * from the run you meant. */
const TAKES_VALUE = new Set(['--only', '--cast']);
const KNOWN = new Set([...TAKES_VALUE, '--force', '--dry-run', '--voices', '--voice-only', '--sfx-only', '--live-only', '--include-future']);
const unknown = args.filter((a, i) => a.startsWith('--')
  && !KNOWN.has(a)
  && !TAKES_VALUE.has(args[i - 1]));
if (unknown.length) {
  console.error(`Unknown flag(s): ${unknown.join(', ')}\n\n`
    + `This build understands: ${[...KNOWN].join(', ')}\n\n`
    + 'If you are following a doc that uses a flag listed nowhere here, you are\n'
    + 'on an older checkout than the doc. Switch branches rather than dropping\n'
    + 'the flag — with --force, a missing filter regenerates everything.');
  process.exit(1);
}

const FORCE = has('--force');
const DRY = has('--dry-run');
const LIST_VOICES = has('--voices');
const VOICE_ONLY = has('--voice-only');
const SFX_ONLY = has('--sfx-only');
const LIVE_ONLY = has('--live-only');
const INCLUDE_FUTURE = has('--include-future');
/* Both comma lists and repeated flags are accepted. Silently reading only the
 * first --only is dangerous in production: a two-cue handoff can report a
 * clean dry run while omitting the second missing recording. */
const ONLY = valuesOf('--only');
const CAST = valuesOf('--cast');

const isSpoken = (cue) => typeof cue.say === 'string';

/* Which profile speaks a cue, in ONE place.
 *
 * `player` is the default because Tony carries every unattributed line, and
 * that default used to be written out at each of the four sites that needed
 * it -- the --cast filter, the unset-id check, `speak()`, and now the take
 * ledger's voice stamp. Four copies of a default is three chances for the
 * ledger to record a different answer than the request actually used, which
 * would make the provenance stamp worse than no stamp at all. */
const voiceOf = (cue) => cue.voice || 'player';

const API_KEY = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  const voices = manifest.voices || {};

  const manifestCues = manifest.sfx || [];
  if (ONLY) {
    const manifestNames = new Set(manifestCues.map((cue) => cue.name));
    const missingSelectors = ONLY.filter((name) => !manifestNames.has(name));
    if (missingSelectors.length) {
      console.error(
        `Unknown --only cue selector(s): ${missingSelectors.join(', ')}\n\n`
        + 'Every --only value must exactly match a cue name in assets/sfx/manifest.json.\n'
        + 'Nothing was generated.',
      );
      process.exitCode = 1;
      return;
    }
  }

  if (LIST_VOICES) return listVoices();

  let cues = manifestCues;
  if (ONLY) cues = cues.filter((c) => ONLY.includes(c.name));
  if (CAST) cues = cues.filter((c) => isSpoken(c) && CAST.includes(voiceOf(c)));
  if (VOICE_ONLY) cues = cues.filter(isSpoken);
  if (SFX_ONLY) cues = cues.filter((c) => !isSpoken(c));
  /* Future dialogue is opt-in even for a hand-built --only list. This guards
   * automation that reads every missing manifest voice and would otherwise
   * spend a production run on the party catalog before its scene exists. */
  if (LIVE_ONLY || !INCLUDE_FUTURE) cues = cues.filter((cue) => !isFutureInitiationCue(cue));

  // A spoken cue is useless until somebody has pasted a voice id in. Say so
  // once, clearly, instead of failing forty times against the API.
  const unset = new Set();
  for (const cue of cues) {
    if (!isSpoken(cue)) continue;
    const v = voices[voiceOf(cue)];
    if (!v?.id || /^<.*>$/.test(v.id)) unset.add(voiceOf(cue));
  }
  if (unset.size) {
    console.error(
      `\nCasting is required before these spoken cues can be generated.\n`
      + `No ElevenLabs voice id set for: ${[...unset].join(', ')}\n\n`
      + 'Pick a voice, then put its id in the "voices" block of\n'
      + 'assets/sfx/manifest.json. To see what is on your account:\n'
      + '  npm run sfx -- --voices\n\n'
      + 'Every spoken line uses that one id, so the character sounds like one\n'
      + 'person. Sound effects are unaffected -- run with --sfx-only for those.',
    );
    process.exitCode = 1;
    return;
  }

  const pending = [];
  let synthOnly = 0;
  for (const cue of cues) {
    // A cue with neither `prompt` nor `say` is one the WebAudio synth owns
    // outright -- footsteps, grunts, anything a generator would do worse.
    // Nothing to send, so do not send it: the API's complaint about a missing
    // `text` field is a long way from "this cue was never yours to generate".
    if (!isSpoken(cue) && typeof cue.prompt !== 'string') { synthOnly++; continue; }
    const file = cue.file || `${cue.name}.mp3`;
    const dest = path.join(SFX_DIR, file);
    /* A cue marked for re-recording has a take on disk that says the retired
     * wording, so "the file exists" is exactly the wrong reason to skip it. */
    if (!FORCE && cue.needsRerecord !== true && (await exists(dest))) continue;
    pending.push({ cue, dest, file });
  }
  if (synthOnly) console.log(`${synthOnly} synth-only cue(s) skipped.\n`);

  if (!pending.length) {
    console.log(`Nothing to do — all ${cues.length} cues already exist. Use --force to regenerate.`);
    return;
  }

  const spoken = pending.filter((p) => isSpoken(p.cue)).length;
  console.log(`${pending.length} cue(s) to generate `
    + `(${pending.length - spoken} sound, ${spoken} spoken):`);
  for (const p of pending) {
    console.log(isSpoken(p.cue)
      ? `  ${p.cue.name.padEnd(24)} "${p.cue.say}"`
      : `  ${p.cue.name.padEnd(24)} ${p.cue.duration ?? 'auto'}s`);
  }

  if (DRY) return;

  if (!API_KEY) {
    console.error(
      '\nELEVENLABS_API_KEY is not set.\n' +
      'Get a key at https://elevenlabs.io, then:\n' +
      '  export ELEVENLABS_API_KEY=sk_...\n' +
      '  npm run sfx\n\n' +
      'The game runs without this: effects use procedural fallbacks and dialogue remains subtitled.',
    );
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(SFX_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;
  // Sequential on purpose: friendlier to rate limits, and the log stays readable.
  for (const { cue, dest, file } of pending) {
    process.stdout.write(`  ${cue.name.padEnd(24)} … `);
    try {
      const bytes = isSpoken(cue) ? await speak(cue, voices) : await generate(cue);
      await fs.writeFile(dest, bytes);
      /* Stamp the WORDS and the PERFORMER this file was made from, here, where
       * all three are known to agree. A rewritten line keeps its cue id and
       * its filename, so without this record nothing on disk ever changes when
       * the script does and the game ships the retired wording under the new
       * subtitle -- exactly the "old lines are still playing" the owner
       * reported on the Silent Squatch.
       *
       * The voice half is the same failure one column over, and it went
       * unrecorded until 2026-08-24: recasting a profile in the manifest
       * changes nothing on disk, so every mp3 rendered before the recast keeps
       * playing in the old performer's voice and no gate can tell. The id was
       * always right here -- `voices[voiceOf(cue)].id` is what `speak()` just
       * posted to -- and it was being thrown away four lines later. Stamping
       * it is what lets `npm run check:takes` say STALE VOICE.
       * See tools/take-ledger.mjs. */
      if (isSpoken(cue)) {
        const profile = voiceOf(cue);
        recordTake(TAKE_LEDGER, cue.name, cue.say, { name: profile, id: voices[profile]?.id });
      }
      console.log(`ok  (${(bytes.length / 1024).toFixed(0)} KB → assets/sfx/${file})`);
      ok++;
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      failed++;
    }
  }

  const indexed = await writeIndex(SFX_DIR);
  console.log(`\nWrote assets/sfx/index.json (${indexed.length} file(s)).`);

  console.log(`\nDone. ${ok} generated, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

/**
 * Speak a line. Voice settings come from the manifest so the whole cast is
 * tuned in one place rather than per line.
 */
async function speak(cue, voices) {
  const v = voices[voiceOf(cue)];
  if (!v?.id) throw new Error(`no voice id for "${voiceOf(cue)}"`);

  const res = await fetchWithRetry(TTS(v.id) + '?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: cue.say,
      model_id: v.model || 'eleven_multilingual_v2',
      voice_settings: {
        stability: cue.stability ?? v.stability ?? 0.42,
        similarity_boost: v.similarity ?? 0.80,
        style: cue.style ?? v.style ?? 0.35,
        use_speaker_boost: true,
      },
    }),
  });
  return Buffer.from(await res.arrayBuffer());
}

/** What voices does this account have? Handy for filling in the manifest. */
async function listVoices() {
  if (!API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set.');
    process.exitCode = 1;
    return;
  }
  const res = await fetchWithRetry(VOICES, { headers: { 'xi-api-key': API_KEY } });
  const { voices = [] } = await res.json();
  console.log(`${voices.length} voice(s) on this account:\n`);
  for (const v of voices) {
    const labels = Object.values(v.labels || {}).join(', ');
    console.log(`  ${v.voice_id}  ${(v.name || '').padEnd(22)} ${labels}`);
  }
  console.log('\nPut one of those ids into the "voices" block of assets/sfx/manifest.json.');
}

async function generate(cue) {
  const body = {
    text: cue.prompt,
    model_id: 'eleven_text_to_sound_v2',
    output_format: 'mp3_44100_128',
  };
  if (cue.duration) body.duration_seconds = clamp(cue.duration, 0.5, 30);
  if (cue.loop) body.loop = true;
  if (typeof cue.promptInfluence === 'number') body.prompt_influence = cue.promptInfluence;

  const res = await fetchWithRetry(ENDPOINT, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 512) throw new Error('response too small to be audio');
  return buf;
}

async function fetchWithRetry(url, options, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const text = await res.text().catch(() => '');
      // Rate limited or transient server error: back off and try again.
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
        await sleep(1000 * 2 ** i);
        continue;
      }
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

async function exists(p) {
  try {
    const st = await fs.stat(p);
    return st.size > 512;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

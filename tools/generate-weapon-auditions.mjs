#!/usr/bin/env node
/**
 * Render the five optional audition reports for every shared weapon.
 *
 * The files deliberately remain outside assets/sfx/manifest.json: they are
 * review candidates, not production routing. The HTML audition page can play
 * them immediately, while choosing a favorite still requires an intentional
 * promotion into the canonical weapon profile.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node tools/generate-weapon-auditions.mjs
 *   node tools/generate-weapon-auditions.mjs --dry-run
 *   node tools/generate-weapon-auditions.mjs --only carbine,saw
 *   node tools/generate-weapon-auditions.mjs --force --only pistol9
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WEAPON_AUDITION_DIRECTIONS,
  WEAPON_AUDITION_WEAPONS,
} from '../src/core/weapons/audition.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'assets', 'audio', 'auditions');
const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';
const MODEL = 'eleven_text_to_sound_v2';
const API_KEY = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;

const argv = process.argv.slice(2);
const known = new Set(['--force', '--dry-run', '--only']);
const unknown = argv.filter((arg, index) => arg.startsWith('--')
  && !known.has(arg) && argv[index - 1] !== '--only');
if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(', ')}`);

const FORCE = argv.includes('--force');
const DRY = argv.includes('--dry-run');
const onlyAt = argv.indexOf('--only');
const ONLY = onlyAt >= 0
  ? new Set((argv[onlyAt + 1] || '').split(',').map((id) => id.trim()).filter(Boolean))
  : null;
if (onlyAt >= 0 && !ONLY.size) throw new Error('--only requires comma-separated weapon ids');

const WEAPON_SOURCE = Object.freeze({
  revolver: 'large-frame .45 caliber handgun',
  shotgun: '12-gauge pump shotgun',
  pistol9: '9mm semi-automatic pistol',
  carbine: 'unsuppressed short-barreled 5.56 carbine',
  ak47: 'unsuppressed AK-47 7.62 rifle',
  saw: 'unsuppressed belt-fed 5.56 light machine gun',
  barrett: '.50 caliber anti-materiel rifle with a massive muzzle brake',
});

const DIRECTION = Object.freeze({
  'deep-cinematic': 'deep cinematic low-end body, huge controlled impact, a hard readable transient, and a compact tail',
  'sharp-aggressive': 'razor-sharp aggressive crack, immediate violent attack, bright pressure, and a tight dry tail',
  'mechanical-realistic': 'physically grounded report with convincing weapon mass, action mechanism, and realistic pressure',
  'indoor-concussion': 'brutal indoor concussion, early concrete-room reflections, chest pressure, and a controlled game-ready decay',
  'powerful-arcade': 'oversized powerful arcade-realism impact, punchy bass, clean gameplay readability, and an exciting polished finish',
});

function durationFor(weaponId, directionId) {
  if (weaponId === 'barrett') return directionId === 'indoor-concussion' ? 2.2 : 1.8;
  if (weaponId === 'shotgun' || weaponId === 'saw') return directionId === 'indoor-concussion' ? 1.8 : 1.45;
  return directionId === 'indoor-concussion' ? 1.55 : 1.2;
}

function promptFor(weaponId, directionId) {
  return `Exactly one isolated ${WEAPON_SOURCE[weaponId]} gunshot for a mature first-person action game. `
    + `${DIRECTION[directionId]}. One shot only: no burst, no repeated shots, no voices, no music, `
    + 'no ambience before the transient, no reload, no long silence. Close, powerful, fun, and mix-ready.';
}

async function exists(filename) {
  try { return (await fs.stat(filename)).size > 512; } catch { return false; }
}

async function requestAudio(prompt, duration, attempts = 4) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: prompt,
          model_id: MODEL,
          output_format: 'mp3_44100_128',
          duration_seconds: duration,
          prompt_influence: 0.62,
          loop: false,
        }),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 512) throw new Error('response too small to be audio');
        return bytes;
      }
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`HTTP ${response.status} ${detail}`);
      }
      last = new Error(`HTTP ${response.status} ${detail}`);
    } catch (error) {
      last = error;
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
  }
  throw last;
}

async function main() {
  const knownIds = new Set(WEAPON_AUDITION_WEAPONS.map(({ id }) => id));
  const unknownIds = ONLY ? [...ONLY].filter((id) => !knownIds.has(id)) : [];
  if (unknownIds.length) throw new Error(`Unknown weapon id(s): ${unknownIds.join(', ')}`);

  const jobs = [];
  for (const weapon of WEAPON_AUDITION_WEAPONS) {
    if (ONLY && !ONLY.has(weapon.id)) continue;
    for (const direction of WEAPON_AUDITION_DIRECTIONS) {
      const candidate = weapon.candidates.find(({ id }) => id === direction.id);
      const dest = path.join(DEST, candidate.filename);
      jobs.push({
        weapon: weapon.id,
        direction: direction.id,
        filename: candidate.filename,
        dest,
        duration: durationFor(weapon.id, direction.id),
        prompt: promptFor(weapon.id, direction.id),
      });
    }
  }

  console.log(`${jobs.length} weapon audition candidate(s).`);
  for (const job of jobs) console.log(`  ${job.weapon.padEnd(9)} ${job.direction}`);
  if (DRY) return;
  if (!API_KEY) throw new Error('ELEVENLABS_API_KEY is not set');

  await fs.mkdir(DEST, { recursive: true });
  const receipts = [];
  let generated = 0;
  for (const job of jobs) {
    const present = !FORCE && await exists(job.dest);
    process.stdout.write(`  ${job.weapon.padEnd(9)} ${job.direction.padEnd(22)} `);
    if (!present) {
      const bytes = await requestAudio(job.prompt, job.duration);
      await fs.writeFile(job.dest, bytes);
      generated++;
      process.stdout.write(`generated ${(bytes.length / 1024).toFixed(0)} KB`);
    } else {
      process.stdout.write('kept');
    }
    const bytes = await fs.readFile(job.dest);
    receipts.push({
      weapon: job.weapon,
      direction: job.direction,
      filename: job.filename,
      model: MODEL,
      durationSeconds: job.duration,
      promptInfluence: 0.62,
      prompt: job.prompt,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    console.log(` · ${receipts.at(-1).sha256.slice(0, 12)}`);
  }

  const manifest = {
    schema: 'squatchsmash.weapon-auditions.v1',
    generatedWith: 'ElevenLabs text-to-sound-effects v2',
    productionRouting: false,
    candidates: receipts,
  };
  await fs.writeFile(path.join(DEST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Done. ${generated} generated, ${jobs.length - generated} kept; manifest records ${receipts.length}.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

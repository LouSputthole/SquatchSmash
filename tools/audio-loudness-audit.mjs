#!/usr/bin/env node
/**
 * Development-only loudness evidence for the committed long-form music masters.
 *
 * Chromium is already the repository's browser verifier. Its native MP3 decoder
 * lets this no-build project measure the delivered files without shipping an
 * audio codec, ffmpeg, or a runtime dependency to GitHub Pages.
 *
 *   node tools/audio-loudness-audit.mjs
 *   node tools/audio-loudness-audit.mjs --check
 *
 * `--check` is intentionally fast: it verifies every committed receipt against
 * the current manifest and file hash. Run without `--check` to perform the real
 * decode and rewrite the evidence after an audio master changes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TOOL_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(TOOL_FILE), '..');
const MUSIC_DIR = path.join(ROOT, 'assets', 'music');
const MANIFEST_FILE = path.join(MUSIC_DIR, 'manifest.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'docs', 'audits', 'radio', 'loudness-measurements.json');
const SCHEMA = 'squatchsmash.audio-loudness.v1';
const ALGORITHM = Object.freeze({
  integrated: 'BS.1770-style K-weighting; 400 ms blocks; 75% overlap; -70 LUFS absolute and -10 LU relative gates',
  truePeak: '4x cubic intersample estimate (development comparison evidence, not a certified meter)',
  version: 1,
});

function parseArgs(argv) {
  const result = { check: false, headed: false, only: null, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') result.check = true;
    else if (arg === '--headed') result.headed = true;
    else if (arg === '--only') result.only = argv[++index];
    else if (arg === '--output') result.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function manifestTracks(only = null) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
  const tracks = manifest.tracks ?? [];
  const filtered = only ? tracks.filter((track) => track.file === only) : tracks;
  if (only && filtered.length !== 1) throw new Error(`No music manifest row for --only ${only}`);
  const duplicate = filtered.map((track) => track.file)
    .find((file, index, files) => files.indexOf(file) !== index);
  if (duplicate) throw new Error(`Duplicate music manifest file: ${duplicate}`);
  return filtered;
}

function serverForMusic() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>SquatchSmash loudness audit</title>');
        return;
      }
      const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const file = path.resolve(MUSIC_DIR, name);
      const relative = path.relative(MUSIC_DIR, file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
        response.writeHead(404).end();
        return;
      }
      const bytes = await fs.readFile(file);
      response.writeHead(200, {
        'content-type': file.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream',
        'cache-control': 'no-store',
        'content-length': bytes.length,
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function measureInPage(page, url) {
  return page.evaluate(async (assetUrl) => {
    const response = await fetch(assetUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`audio fetch ${response.status}: ${assetUrl}`);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext({ latencyHint: 'playback' });
    let buffer;
    try {
      buffer = await context.decodeAudioData(bytes.slice(0));
    } finally {
      await context.close();
    }

    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const blockSamples = Math.max(1, Math.round(sampleRate * 0.4));
    const stepSamples = Math.max(1, Math.round(sampleRate * 0.1));
    const energyRing = new Float64Array(blockSamples);
    const channelWeights = channels.map((_, index) => (index === 3 || index === 4 ? 1.41 : 1));

    function normalize({ b0, b1, b2, a0, a1, a2 }) {
      return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
    }

    function highPass(frequency, q) {
      const omega = 2 * Math.PI * frequency / sampleRate;
      const cosine = Math.cos(omega);
      const alpha = Math.sin(omega) / (2 * q);
      return normalize({
        b0: (1 + cosine) / 2,
        b1: -(1 + cosine),
        b2: (1 + cosine) / 2,
        a0: 1 + alpha,
        a1: -2 * cosine,
        a2: 1 - alpha,
      });
    }

    function highShelf(frequency, gainDb) {
      const amplitude = 10 ** (gainDb / 40);
      const omega = 2 * Math.PI * frequency / sampleRate;
      const cosine = Math.cos(omega);
      const sine = Math.sin(omega);
      const alpha = sine / 2 * Math.sqrt(2);
      const root = Math.sqrt(amplitude);
      return normalize({
        b0: amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + 2 * root * alpha),
        b1: -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine),
        b2: amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - 2 * root * alpha),
        a0: (amplitude + 1) - (amplitude - 1) * cosine + 2 * root * alpha,
        a1: 2 * ((amplitude - 1) - (amplitude + 1) * cosine),
        a2: (amplitude + 1) - (amplitude - 1) * cosine - 2 * root * alpha,
      });
    }

    function state(coefficients) {
      return { ...coefficients, z1: 0, z2: 0 };
    }

    function filter(sample, filterState) {
      const output = filterState.b0 * sample + filterState.z1;
      filterState.z1 = filterState.b1 * sample - filterState.a1 * output + filterState.z2;
      filterState.z2 = filterState.b2 * sample - filterState.a2 * output;
      return output;
    }

    const shelf = highShelf(1681.974450955533, 3.999843853973347);
    const rolloff = highPass(38.13547087602444, 0.5003270373238773);
    const shelves = channels.map(() => state(shelf));
    const rolloffs = channels.map(() => state(rolloff));
    const blockEnergies = [];
    let rollingEnergy = 0;
    let samplePeak = 0;
    let truePeak = 0;

    function cubic(p0, p1, p2, p3, t) {
      const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
      const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
      const c = -0.5 * p0 + 0.5 * p2;
      return ((a * t + b) * t + c) * t + p1;
    }

    for (let index = 0; index < length; index += 1) {
      let combined = 0;
      for (let channel = 0; channel < channels.length; channel += 1) {
        const samples = channels[channel];
        const raw = samples[index];
        const absolute = Math.abs(raw);
        if (absolute > samplePeak) samplePeak = absolute;
        if (absolute > truePeak) truePeak = absolute;
        if (index + 2 < length) {
          const p0 = samples[index > 0 ? index - 1 : index];
          const p1 = raw;
          const p2 = samples[index + 1];
          const p3 = samples[index + 2];
          const local = Math.max(Math.abs(p0), absolute, Math.abs(p2), Math.abs(p3));
          if (local >= truePeak * 0.55) {
            truePeak = Math.max(truePeak,
              Math.abs(cubic(p0, p1, p2, p3, 0.25)),
              Math.abs(cubic(p0, p1, p2, p3, 0.5)),
              Math.abs(cubic(p0, p1, p2, p3, 0.75)));
          }
        }
        const weighted = filter(filter(raw, shelves[channel]), rolloffs[channel]);
        combined += channelWeights[channel] * weighted * weighted;
      }
      const slot = index % blockSamples;
      rollingEnergy += combined - energyRing[slot];
      energyRing[slot] = combined;
      if (index + 1 >= blockSamples && ((index + 1 - blockSamples) % stepSamples) === 0) {
        blockEnergies.push(Math.max(Number.MIN_VALUE, rollingEnergy / blockSamples));
      }
    }

    const loudness = (energy) => -0.691 + 10 * Math.log10(Math.max(Number.MIN_VALUE, energy));
    const absoluteGated = blockEnergies.filter((energy) => loudness(energy) > -70);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const preliminary = loudness(mean(absoluteGated));
    const relativeGate = preliminary - 10;
    const gated = absoluteGated.filter((energy) => loudness(energy) > relativeGate);
    const integratedLufs = loudness(mean(gated));
    const db = (value) => 20 * Math.log10(Math.max(Number.MIN_VALUE, value));

    return {
      decodedDurationSeconds: length / sampleRate,
      sampleRate,
      channels: channels.length,
      integratedLufs,
      samplePeakDbfs: db(samplePeak),
      truePeakEstimateDbtp: db(truePeak),
      blocks: blockEnergies.length,
      gatedBlocks: gated.length,
    };
  }, url);
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

async function performMeasurements(tracks, { headed = false } = {}) {
  /* Receipt validation is part of the dependency-free Node suite. Only the
   * explicit development measurement path needs the optional browser package. */
  const { chromium } = await import('playwright');
  const server = serverForMusic();
  let browser;
  try {
    const baseUrl = await listen(server);
    /* The same executable resolution every browser gate uses, so a pinned
     * Playwright whose headless shell is not installed still measures with
     * the Chromium that is. */
    browser = await chromium.launch({
      headless: !headed,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM
        || (process.env.PLAYWRIGHT_BROWSERS_PATH
          ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
    });
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const measurements = [];
    for (const [index, track] of tracks.entries()) {
      const file = path.join(MUSIC_DIR, track.file);
      const stat = await fs.stat(file);
      process.stdout.write(`[${index + 1}/${tracks.length}] ${track.file} ... `);
      const measured = await measureInPage(page, `${baseUrl}/${encodeURIComponent(track.file)}`);
      const receipt = {
        file: `assets/music/${track.file}`,
        sha256: await sha256(file),
        bytes: stat.size,
        decodedDurationSeconds: round(measured.decodedDurationSeconds, 3),
        sampleRate: measured.sampleRate,
        channels: measured.channels,
        integratedLufs: round(measured.integratedLufs),
        samplePeakDbfs: round(measured.samplePeakDbfs),
        truePeakEstimateDbtp: round(measured.truePeakEstimateDbtp),
        blocks: measured.blocks,
        gatedBlocks: measured.gatedBlocks,
      };
      measurements.push(receipt);
      process.stdout.write(`${receipt.integratedLufs} LUFS; ${receipt.truePeakEstimateDbtp} dBTP est.\n`);
    }
    return measurements;
  } finally {
    await browser?.close();
    if (server.listening) await closeServer(server);
  }
}

async function validateEvidence(tracks, evidence) {
  if (evidence.schema !== SCHEMA) throw new Error(`Unexpected loudness schema: ${evidence.schema}`);
  if (JSON.stringify(evidence.algorithm) !== JSON.stringify(ALGORITHM)) {
    throw new Error('Loudness algorithm metadata drifted; remeasure the masters');
  }
  const expected = new Set(tracks.map((track) => `assets/music/${track.file}`));
  const rows = new Map((evidence.measurements ?? []).map((row) => [row.file, row]));
  const missing = [...expected].filter((file) => !rows.has(file));
  const stale = [...rows.keys()].filter((file) => !expected.has(file));
  if (missing.length || stale.length) {
    throw new Error(`Loudness receipt coverage drift: missing=${missing.join(',') || 'none'} stale=${stale.join(',') || 'none'}`);
  }
  for (const track of tracks) {
    const relative = `assets/music/${track.file}`;
    const row = rows.get(relative);
    const file = path.join(ROOT, relative);
    const stat = await fs.stat(file);
    if (row.sha256 !== await sha256(file) || row.bytes !== stat.size) {
      throw new Error(`Loudness receipt hash drift: ${relative}`);
    }
    for (const field of ['decodedDurationSeconds', 'sampleRate', 'channels', 'integratedLufs', 'samplePeakDbfs', 'truePeakEstimateDbtp']) {
      if (!Number.isFinite(row[field])) throw new Error(`${relative} has no numeric ${field}`);
    }
    if (row.integratedLufs < -80 || row.integratedLufs > 6) throw new Error(`${relative} has implausible LUFS`);
    if (row.truePeakEstimateDbtp < -80 || row.truePeakEstimateDbtp > 6) throw new Error(`${relative} has implausible true-peak estimate`);
  }
  return rows.size;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tracks = await manifestTracks(options.only);
  if (options.check) {
    const evidence = JSON.parse(await fs.readFile(options.output, 'utf8'));
    const count = await validateEvidence(tracks, evidence);
    console.log(`Loudness evidence is current: ${count}/${tracks.length} manifest masters, all hashes valid.`);
    return;
  }
  const measurements = await performMeasurements(tracks, options);
  const evidence = { schema: SCHEMA, algorithm: ALGORITHM, measurements };
  await validateEvidence(tracks, evidence);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Wrote ${measurements.length} hash-bound loudness receipts to ${path.relative(ROOT, options.output)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === TOOL_FILE) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

export { ALGORITHM, SCHEMA, manifestTracks, validateEvidence };

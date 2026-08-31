#!/usr/bin/env node
/**
 * Browser-decode every voice take whose text and performer were stamped at
 * render time. This is development evidence only; nothing is shipped into the
 * no-build runtime.
 *
 *   node tools/verify-rendered-voices.mjs
 *   node tools/verify-rendered-voices.mjs --check
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { textHash } from './take-ledger.mjs';

const TOOL_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(TOOL_FILE), '..');
const SFX_DIR = path.join(ROOT, 'assets', 'sfx');
const MANIFEST_FILE = path.join(SFX_DIR, 'manifest.json');
const LEDGER_FILE = path.join(SFX_DIR, 'takes.json');
const INDEX_FILE = path.join(SFX_DIR, 'index.json');
const REWORD_QUEUE_FILE = path.join(SFX_DIR, 'rerecord.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'docs', 'audits', 'voice', 'rendered-voice-receipts.json');
const SCHEMA = 'squatchsmash.rendered-voice-receipts.v1';

function parseArgs(argv) {
  const options = { check: false, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--output') options.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function digest(algorithm, bytes, length = null) {
  const value = crypto.createHash(algorithm).update(bytes).digest('hex');
  return length ? value.slice(0, length) : value;
}

function fileOf(cue) {
  return cue.file || `${cue.name}.mp3`;
}

async function currentRenderedTakes() {
  const [manifest, ledger, index, queue] = await Promise.all([
    readJson(MANIFEST_FILE), readJson(LEDGER_FILE), readJson(INDEX_FILE),
    readJson(REWORD_QUEUE_FILE),
  ]);
  const cues = new Map((manifest.sfx ?? []).map((cue) => [cue.name, cue]));
  const indexed = new Set(index.files ?? []);
  /* The re-record queue (assets/sfx/rerecord.json) is the one documented
   * shape of drift: a rewritten line whose old wording is on the record and
   * whose cue is stamped `needsRerecord`. Such a take is no longer evidence
   * of the CURRENT script -- it leaves this audit's rows until the new
   * render lands -- but it is not the silent rewrite this gate exists to
   * refuse: the queue names it, the stamp marks it, and the stamped text
   * hash must still match the documented retired wording exactly. Any drift
   * outside that triangle throws, same as ever. */
  const retiredHash = new Map((queue.lines ?? [])
    .map((entry) => [entry.cue, textHash(entry.retiredText ?? '')]));
  const rows = [];

  for (const [cueName, take] of Object.entries(ledger.takes ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (take?.source !== 'rendered') continue;
    const cue = cues.get(cueName);
    if (!cue || typeof cue.say !== 'string' || !cue.say.trim()) {
      throw new Error(`Rendered ledger entry has no spoken manifest cue: ${cueName}`);
    }
    if (take.text !== textHash(cue.say)) {
      if (cue.needsRerecord === true && take.text === retiredHash.get(cueName)) continue;
      throw new Error(`Rendered text stamp drift: ${cueName}`);
    }
    const voice = cue.voice || 'player';
    const voiceId = manifest.voices?.[voice]?.id ?? null;
    if (!voiceId || take.voice !== voice || take.voiceId !== voiceId) {
      throw new Error(`Rendered performer stamp drift: ${cueName}`);
    }
    const file = fileOf(cue);
    if (!indexed.has(file)) throw new Error(`Rendered take is not browser-indexed: ${cueName} -> ${file}`);
    const bytes = await fs.readFile(path.join(SFX_DIR, file));
    if (bytes.length <= 512) throw new Error(`Rendered take is truncated: ${cueName}`);
    const indexVersion = digest('md5', bytes, 10);
    if (index.versions?.[file] !== indexVersion) throw new Error(`Index cache hash drift: ${file}`);
    rows.push({
      cue: cueName,
      file,
      sha256: digest('sha256', bytes),
      bytes: bytes.length,
      indexVersion,
      textHash: take.text,
      voice,
      voiceId,
    });
  }
  return rows;
}

function serverForSfx() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>SquatchSmash rendered voice verifier</title>');
        return;
      }
      const name = decodeURIComponent(url.pathname.slice(1));
      if (!name || path.basename(name) !== name) throw new Error('invalid voice file path');
      const bytes = await fs.readFile(path.join(SFX_DIR, name));
      response.writeHead(200, {
        'content-type': 'audio/mpeg',
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
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function decodeRows(rows) {
  /* `--check` is imported by the dependency-free Node suite and never opens a
   * browser. Keep Playwright behind the development-only decode path so the
   * Pages workflow can still run `npm test` without installing packages. */
  const { chromium } = await import('playwright');
  const server = serverForSfx();
  let browser;
  try {
    const baseUrl = await listen(server);
    /* Same resolution as the scene verifiers: a runner with a pre-installed
     * browser names it via PLAYWRIGHT_BROWSERS_PATH, and forcing that build
     * avoids the headless-shell download the default launch would demand. */
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM
        || (process.env.PLAYWRIGHT_BROWSERS_PATH
          ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
    });
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.__renderedVoiceAuditContext = new AudioContext({ latencyHint: 'playback' });
    });
    for (const [index, row] of rows.entries()) {
      const decoded = await page.evaluate(async (assetUrl) => {
        const response = await fetch(assetUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`voice fetch ${response.status}: ${assetUrl}`);
        const bytes = await response.arrayBuffer();
        const buffer = await window.__renderedVoiceAuditContext.decodeAudioData(bytes.slice(0));
        return { durationSeconds: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels };
      }, `${baseUrl}/${encodeURIComponent(row.file)}`);
      if (!(decoded.durationSeconds > 0.1) || decoded.sampleRate < 8000 || decoded.channels < 1) {
        throw new Error(`Browser could not decode a usable rendered take: ${row.cue}`);
      }
      Object.assign(row, {
        durationSeconds: Number(decoded.durationSeconds.toFixed(3)),
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
      });
      if ((index + 1) % 50 === 0 || index + 1 === rows.length) {
        console.log(`[rendered-voices] browser decoded ${index + 1}/${rows.length}`);
      }
    }
    await page.evaluate(() => window.__renderedVoiceAuditContext.close());
    return rows;
  } finally {
    await browser?.close();
    if (server.listening) await closeServer(server);
  }
}

async function validateEvidence(current, evidence) {
  if (evidence.schema !== SCHEMA) throw new Error(`Unexpected rendered-voice schema: ${evidence.schema}`);
  const receipts = new Map((evidence.receipts ?? []).map((row) => [row.cue, row]));
  if (receipts.size !== current.length) {
    throw new Error(`Rendered-voice coverage drift: receipt=${receipts.size} current=${current.length}`);
  }
  for (const row of current) {
    const receipt = receipts.get(row.cue);
    if (!receipt) throw new Error(`Missing rendered-voice receipt: ${row.cue}`);
    for (const field of ['file', 'sha256', 'bytes', 'indexVersion', 'textHash', 'voice', 'voiceId']) {
      if (receipt[field] !== row[field]) throw new Error(`Rendered-voice ${field} drift: ${row.cue}`);
    }
    if (!(receipt.durationSeconds > 0.1) || receipt.sampleRate < 8000 || receipt.channels < 1) {
      throw new Error(`Rendered-voice decode receipt is invalid: ${row.cue}`);
    }
  }
  return receipts.size;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const current = await currentRenderedTakes();
  if (options.check) {
    const evidence = await readJson(options.output);
    const count = await validateEvidence(current, evidence);
    console.log(`[rendered-voices] ${count}/${current.length} exact rendered takes have current hash, text, performer, index, and browser-decode receipts.`);
    return;
  }
  const receipts = await decodeRows(current);
  const evidence = { schema: SCHEMA, receipts };
  await validateEvidence(current, evidence);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[rendered-voices] wrote ${receipts.length} receipts to ${path.relative(ROOT, options.output)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === TOOL_FILE) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

export { SCHEMA, currentRenderedTakes, validateEvidence };

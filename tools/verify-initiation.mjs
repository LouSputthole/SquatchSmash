#!/usr/bin/env node
/**
 * Verify the preserved Initiation branch as an isolated legacy/reference
 * scene. This intentionally does not assert that its prologue story,
 * transformation, aliases, or character roles are campaign canon.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5205;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Initiation scene.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const problems = [];
const missing = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});
page.on('response', (response) => {
  if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  await page.goto(`http://localhost:${PORT}/initiation.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.phase, null, { timeout: 60000 });

  const initial = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    members: window.INITIATION.members.length,
    prospects: window.INITIATION.prospects.length,
    hasHumanPlayer: window.INITIATION.player?.constructor?.name === 'Person',
    objective: document.querySelector('#objective')?.textContent,
    canvasCount: document.querySelectorAll('canvas').length,
  }));

  check('the namespaced Initiation scene reaches its interactive approach phase',
    initial.phase === 'approach' && initial.canvasCount >= 1,
    JSON.stringify(initial));
  check('the original ceremony cast and prospect line are preserved',
    initial.members === 13 && initial.prospects === 4,
    `${initial.members} members, ${initial.prospects} NPC prospects`);
  check('the preserved scene still starts with its legacy human-player premise',
    initial.hasHumanPlayer,
    'reference behavior only; campaign canon remains undecided');
  check('the scene gives a visible movement objective',
    initial.objective?.includes('WASD'),
    initial.objective || 'no objective');
  check('all scene modules and face textures load', missing.length === 0, missing.join(' | '));

  await page.evaluate(() => window.INITIATION.skipToGauntlet());
  await page.waitForFunction(() => window.INITIATION.phase === 'gauntlet_in');
  check('the preserved debug route can enter the interactive Gauntlet',
    await page.evaluate(() => window.INITIATION.phase === 'gauntlet_in'));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Initiation checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Initiation checks passed.`);

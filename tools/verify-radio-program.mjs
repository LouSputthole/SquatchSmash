#!/usr/bin/env node
/** Focused browser proof for the campaign RadioProgram and the Nehoo edit. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5298;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify campaign radio.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
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
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const watch = (page) => {
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
};

try {
  console.log('\nCampaign RadioProgram — focused browser proof\n');

  const apartment = await browser.newPage({ viewport: { width: 640, height: 360 } });
  watch(apartment);
  await apartment.goto(
    `http://localhost:${PORT}/index.html?preview=1&beat=first_apartment`,
    { waitUntil: 'load' },
  );
  await apartment.waitForFunction(() => window.__squatch?.radio, null, { timeout: 60000 });
  await apartment.locator('#start-btn').click({ timeout: 10000 });
  await apartment.waitForFunction(() => window.__squatch?.game?.started === true
    && window.__squatch?.radio?.on === true, null, { timeout: 60000 });
  /* SwiftShader can render the Apartment below one frame per second under
   * CI load. Step the real radio clock exactly as the scene loop does; audio
   * still travels through the live browser AudioEngine and its receipts. */
  await apartment.evaluate(() => {
    const radio = window.__squatch.radio;
    for (let second = 0; second < 12; second += 1) radio.update(1);
  });
  await apartment.waitForFunction(() => {
    const receipts = window.__squatch.radio.playbackReceipts;
    return receipts.some((receipt) => receipt.blockId === 'show-intro' && receipt.started);
  }, null, { timeout: 20000 });
  const hub = await apartment.evaluate(() => {
    const radio = window.__squatch.radio;
    const receipts = radio.playbackReceipts.filter((receipt) => receipt.programId === 'H-APT-01');
    return {
      order: receipts.map((receipt) => receipt.blockId),
      first: receipts[0] ?? null,
      second: receipts.find((receipt) => receipt.blockId === 'show-intro') ?? null,
      progress: radio.state.load().programProgress['H-APT-01'] ?? null,
    };
  });
  check('hub packet reaches real playback in ident → show-intro order',
    hub.order[0] === 'ident'
      && hub.order[1] === 'show-intro'
      && hub.first?.started === true
      && hub.first?.completed === true
      && hub.first?.source === 'buffer'
      && hub.second?.started === true
      && hub.second?.source === 'buffer'
      && hub.progress?.completedBlockIds?.includes('ident'),
    JSON.stringify(hub));
  await apartment.close();

  const golf = await browser.newPage({ viewport: { width: 640, height: 360 } });
  watch(golf);
  await golf.goto(`http://localhost:${PORT}/golf.html?preview=1`, { waitUntil: 'load' });
  await golf.waitForFunction(() => window.__golfReady === true, null, { timeout: 60000 });
  await golf.locator('#start-btn').click({ timeout: 10000 });
  await golf.waitForFunction(() => document.getElementById('overlay')?.classList.contains('hidden'),
    null, { timeout: 30000 });
  const nehoo = await golf.evaluate(async () => {
    const game = window.__golf;
    await game.waitForCartRadioAudio();
    game.audio.clearPlaybackLog();
    game.cartRadio.turnOn({ tuneIn: false, remember: false });
    game.cartRadio._startSong({ songId: 'nehoo-with-a-guu' });
    const media = game.cartRadio.el;
    if (media?.readyState < 1) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 10000);
        media.addEventListener('loadedmetadata', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
    /* Let the real media clock cross the edit, accelerated only to keep the
     * focused gate short. This exercises the timeupdate watcher as well as the
     * frame-loop backstop; assigning currentTime before an MP3 is seekable can
     * be silently clamped to zero by Chromium. */
    media.playbackRate = 16;
    const deadline = performance.now() + 5000;
    while (game.cartRadio.songPlaying && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      game.cartRadio.update(0.05);
    }
    return {
      venue: game.cartRadio.venue,
      fullSongs: game.cartRadio.fullSongs,
      songPlaying: game.cartRadio.songPlaying,
      mediaTime: media.currentTime,
      trackId: game.cartRadio._track?.id ?? null,
      cutAt: game.cartRadio._track?.cutAt ?? null,
      activeLine: game.cartRadio._activeSegment?.line ?? null,
      queuedLines: game.cartRadio._queue.map((segment) => segment.line).filter(Boolean),
      cutReceipt: [...game.audio.playbackReceipts].reverse()
        .find((receipt) => receipt.requested === 'radio.cut') ?? null,
    };
  });
  check('Golf plays the unconditional 15-second Nehoo → jerky edit',
    nehoo.venue === 'silver_pines'
      && nehoo.fullSongs === true
      && nehoo.songPlaying === false
      && nehoo.activeLine === '…'
      && nehoo.queuedLines.some((line) => /LOU’S ORIGINAL JERKY/.test(line))
      && nehoo.cutReceipt?.started === true,
    JSON.stringify(nehoo));
  await golf.close();

  check('browser run has no runtime errors', problems.length === 0,
    problems.length ? problems.join(' | ') : 'clean');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (results.some((result) => !result.ok)) process.exitCode = 1;

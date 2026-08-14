#!/usr/bin/env node
/* Reproduce the verifier's horseshoe-climb walk with per-second telemetry. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 5737;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg',
};
const { chromium } = await import('playwright');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
try {
  await page.goto(`http://localhost:${PORT}/mansion-siege.html?preview=1`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 240000 });
  await page.waitForFunction(() => window.mansionSiege.framesRendered > 3, null, { timeout: 240000 });
  await page.evaluate(() => window.mansionSiege.start());
  await page.evaluate(() => window.mansionSiege.jumpToCheckpoint('armed'));
  await page.evaluate(() => window.mansionSiege.teleport(7, 1.2, 41, 180));
  await page.evaluate(() => window.mansionSiege.tick(0.4));
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.mansionSiege.tick(1));
    const s = await page.evaluate(() => {
      const S = window.mansionSiege;
      return {
        x: +S.player.position.x.toFixed(2), y: +S.player.position.y.toFixed(2),
        z: +S.player.position.z.toFixed(2), ground: +S.player.ground.toFixed(2),
        health: +S.playerHealth.toFixed(1), armor: +S.playerArmor.toFixed(0),
        down: S.playerDown, beat: S.beat, hits: S.playerDamageEvents,
      };
    });
    console.log(i, JSON.stringify(s));
  }
  await page.keyboard.up('KeyW');
} finally {
  await browser.close();
  server.close();
}

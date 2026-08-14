#!/usr/bin/env node
/**
 * Probe the Motel's collision envelope by WALKING it.
 *
 * Not a verifier — a measuring instrument. It drives the real page with real
 * key presses and reports where the player ends up, so a claim about a wall
 * being solid is a claim somebody walked into.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5399;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const { chromium } = await import('playwright');

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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/motel.html?preview=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.MOTEL);
await page.evaluate(() => window.MOTEL.start());
await page.waitForFunction(() => window.MOTEL.phase === 'arrival');
await page.evaluate(() => window.MOTEL.completeArrival());
await page.waitForFunction(() => window.MOTEL.phase === 'car', null, { timeout: 30000 });
await page.evaluate(() => window.MOTEL.forceInteract('exitCar'));
await page.waitForFunction(() => window.MOTEL.phase === 'lot', null, { timeout: 30000 });

const doors = await page.evaluate(() => {
  const m = window.MOTEL;
  const report = {};
  for (const name of ['frontDoor', 'bathDoor', 'door11', 'officeDoor', 'officeRearDoor']) {
    const d = m.refs[name];
    report[name] = d
      ? { open: d.open, collider: d.collider ? d.collider.enabled : null, angle: Number((d.angle ?? 0).toFixed(2)) }
      : null;
  }
  const line = [];
  for (let z = -3.0; z >= -8.0; z -= 0.5) {
    line.push({ z: Number(z.toFixed(1)), blocked: m.isBlocked(0, z, 0, m.playerRadius) });
  }
  return { doors: report, doorwayLine: line };
});
console.log('DOORS', JSON.stringify(doors, null, 1));

async function walkFrom(x, z, towardX, towardZ, ms = 6000) {
  await page.evaluate(({ sx, sz, tx, tz }) => {
    window.MOTEL.teleport(sx, sz);
    window.MOTEL.face(tx, tz);
  }, { sx: x, sz: z, tx: towardX, tz: towardZ });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const m = window.MOTEL;
    return {
      pos: [Number(m.pos.x.toFixed(2)), Number(m.pos.z.toFixed(2))],
      inRoom12: m.level.insideRoom12(m.pos.x, m.pos.z),
      phase: m.phase,
      knocked: m.S.knocked,
      enteredRoom: m.S.enteredRoom,
    };
  });
}

const walks = [
  ['room twelve doorway, from the lot', 0, 2.0, 0, -12],
  ['room twelve front window', 3.0, 2.0, 3.0, -12],
  ['room eleven doorway', -12, 2.0, -12, -12],
  ['the front wall, west of the door', -3.0, 2.0, -3.0, -12],
  ['the front wall, east pier', 1.6, 2.0, 1.6, -12],
  ['room twelve bathroom window, from the alley', 3.3, -19.5, 3.3, -10],
  ['room eleven rear window, from the alley', -12, -19.5, -12, -10],
  ['the office rear door, locked, from the alley', -44, -19.0, -44, -8],
  ['the motel filler wall, east wing', 20, 2.0, 20, -12],
  ['the office front doorway (meant to be open)', -44, 2.0, -44, -8],
];
for (const [label, x, z, tx, tz] of walks) {
  // eslint-disable-next-line no-await-in-loop
  const r = await walkFrom(x, z, tx, tz);
  console.log(`WALK  ${label.padEnd(34)} ${JSON.stringify(r)}`);
}

await browser.close();
server.close();

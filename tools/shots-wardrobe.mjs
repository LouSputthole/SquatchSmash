#!/usr/bin/env node
/**
 * Wardrobe contact sheets — the visual gate for what the Family wears.
 *
 *   node tools/shots-wardrobe.mjs [names...]
 *
 * Opens the fitting room (`wardrobe.html`), drives it directly rather than
 * through its own UI, and writes one PNG per shot. The point is that a note
 * about a cuff can be made against a picture of the cuff: `verify:*` can
 * assert that `bomber.collar.knit` exists, and it does, but only a human can
 * say whether it looks like a flight jacket.
 *
 * Software rendering, so every frame is expensive: one page, reused, with the
 * room driven between captures instead of a reload per shot.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5342;
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-05', 'wardrobe');
const ONLY = process.argv.slice(2);
const want = (name) => ONLY.length === 0 || ONLY.includes(name);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
};

/* One row per capture. `who` is a wardrobe key or null for the whole rail;
 * `mark` is a detail camera from src/wardrobe/preview.js.
 *
 * `spin` turns the FIGURE on the turntable -- the three-quarter view a full
 * length wants. `yaw` walks the CAMERA round instead, which is what a detail
 * wants: the mark is already aimed at the watch, and the only remaining
 * question is which side of the arm you are standing on.
 *
 * `scene` and `character` are the workshop's two ledger views. They keep the
 * page chrome -- the panel beside them IS the shot, because what they are for
 * is the comparison table and the flags, not the geometry. */
const SHOTS = [
  /* THE WORKSHOP. A scene apiece for the rooms with the most people in them,
   * and the four people the appearance ledger found something wrong with. */
  { name: 'scene-bada-bing', scene: 'bada_bing' },
  { name: 'scene-mansion-house', scene: 'mansion_house' },
  { name: 'scene-mansion-siege', scene: 'mansion_siege' },
  { name: 'scene-no-wake', scene: 'no_wake' },
  { name: 'scene-golf', scene: 'golf' },
  { name: 'scene-bank-heist', scene: 'bank_heist' },
  { name: 'character-lou', character: 'lou' },
  { name: 'character-sasole', character: 'captain_lou_sasole' },
  { name: 'character-numbskull', character: 'numbskull' },
  { name: 'character-deathmegatron', character: 'deathmegatron' },
  { name: 'character-snow', character: 'snow' },
  { name: 'character-shubenator', character: 'shubenator' },

  { name: 'rail-a-studio', who: null, rig: 'studio', from: 0, count: 8 },
  { name: 'rail-b-studio', who: null, rig: 'studio', from: 8, count: 8 },
  { name: 'rail-a-bing', who: null, rig: 'bing', from: 0, count: 8 },
  { name: 'rail-b-bing', who: null, rig: 'bing', from: 8, count: 8 },

  { name: 'lou-full', who: 'lou', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'lou-bing', who: 'lou', rig: 'bing', mark: 'full', spin: 0.5 },
  { name: 'lou-chest', who: 'lou', rig: 'studio', mark: 'chest', yaw: 0.16 },
  { name: 'lou-watch', who: 'lou', rig: 'studio', mark: 'wrist', yaw: 0.75 },
  { name: 'lou-waist', who: 'lou', rig: 'studio', mark: 'waist', yaw: 0.2 },
  { name: 'lou-feet', who: 'lou', rig: 'studio', mark: 'feet', yaw: 0.3 },

  { name: 'sasole-full', who: 'captain_lou_sasole', rig: 'day', mark: 'full', spin: 0.5 },
  { name: 'sasole-front', who: 'captain_lou_sasole', rig: 'studio', mark: 'full', spin: 0 },
  { name: 'sasole-chest', who: 'captain_lou_sasole', rig: 'studio', mark: 'chest', yaw: 0.2 },
  { name: 'sasole-back', who: 'captain_lou_sasole', rig: 'studio', mark: 'full', spin: Math.PI },
  { name: 'sasole-cuff', who: 'captain_lou_sasole', rig: 'studio', mark: 'wrist', yaw: 0.75 },

  { name: 'booski-full', who: 'booski', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'booski-chain', who: 'booski', rig: 'studio', mark: 'chest', yaw: 0.12 },
  { name: 'booski-watch', who: 'booski', rig: 'studio', mark: 'wrist', yaw: 0.75 },

  { name: 'deathmegatron-full', who: 'deathmegatron', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'deathmegatron-chest', who: 'deathmegatron', rig: 'studio', mark: 'chest', yaw: 0.12 },
  { name: 'ape-full', who: 'ape', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'snow-full', who: 'snow', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'rippinflow-chain', who: 'rippinflow', rig: 'studio', mark: 'chest', yaw: 0.12 },
  { name: 'numbskull-full', who: 'numbskull', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'hogmama-full', who: 'hogmama', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'hogmama-wrist', who: 'hogmama', rig: 'studio', mark: 'wrist', yaw: 0.75 },
  { name: 'billy-full', who: 'billy', rig: 'studio', mark: 'full', spin: 0.5 },

  { name: 'blond-full', who: 'james_blond', rig: 'bing', mark: 'full', spin: 0.5 },
  { name: 'blond-front', who: 'james_blond', rig: 'bing', mark: 'full', spin: 0 },
  { name: 'blond-chest', who: 'james_blond', rig: 'bing', mark: 'chest', yaw: 0 },
];

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
await fsp.mkdir(OUT, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

/* Wide enough for the workshop's comparison panel to be READ in the shot:
 * seven scenes of Big Uncle Lou beside a 360px table is the whole point of
 * the by-character view, and at 1280 that table is columns of one character. */
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on('pageerror', (e) => { problems.push(e.message); console.error(`  [page] ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') console.error(`  [console] ${m.text()}`); });

await page.goto(`http://localhost:${PORT}/wardrobe.html`, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(globalThis.fittingRoom), null, { timeout: 60_000 });
/* The chrome is for the human at the keyboard; a contact sheet wants the
 * figure and the caption and nothing else. */
await page.addStyleTag({ content: '.hud { display: none !important; }' });

let wrote = 0;
for (const shot of SHOTS) {
  if (!want(shot.name)) continue;
  await page.evaluate(({ who, rig, mark, spin, yaw, from, count, scene, character }) => {
    const room = globalThis.fittingRoom;
    /* The rail needs the full width of the window: shot into the 750px column
     * between the two panels it loses the people at both ends. The workshop
     * views want the opposite -- their panel is half the point. */
    document.body.classList.toggle('bare', who === null && !scene && !character);
    globalThis.fittingRoomFit();
    if (scene || character) {
      if (scene) room.showScene(scene);
      else room.showCharacter(character);
      room.state.turntable = false;
      globalThis.fittingRoomPaint();
      return;
    }
    room.applyRig(rig);
    if (who === null) room.showLineup(from ?? 0, count ?? undefined);
    else {
      const index = room.keys().indexOf(who);
      if (index < 0) throw new Error(`no such wardrobe key: ${who}`);
      room.showSolo(index);
      room.applyMark(mark ?? 'full');
    }
    room.state.turntable = false;
    room.state.spin = spin ?? 0;
    room.state.yaw = yaw ?? 0;
    /* The mark aims at where the part is BEFORE the turntable moves; re-aim
     * once the spin is set so the stand-space target is read off the pose the
     * shot is actually taken in. */
    if (who !== null) room.applyMark(mark ?? 'full');
    globalThis.fittingRoomPaint();
  }, shot);

  /* Software rendering warms up slowly and the first frames after a rebuild
   * come back empty, so wait on real frames rather than on a timer. */
  await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    (function spin() {
      if (++n >= 8) return resolve();
      return requestAnimationFrame(spin);
    }());
  }));
  await page.waitForTimeout(320);
  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  const { size } = await fsp.stat(file);
  console.log(`  wrote ${shot.name}.png (${(size / 1024).toFixed(1)} kB)`);
  wrote += 1;
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`\n${problems.length} page error(s) -- the shots above may be wrong.`);
  process.exit(1);
}
console.log(`\n${wrote} shot(s) in ${path.relative(ROOT, OUT)}`);

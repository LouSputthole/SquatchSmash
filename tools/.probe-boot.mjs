import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = '/home/user/SquatchSmash';
const PORT = Number(process.env.PORT) || 5993;
const PAGE = process.env.PAGE || 'bing.html';
const TYPES = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.webp': 'image/webp',
};
const { chromium } = await import('playwright');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nf'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH
    ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.goto(`http://localhost:${PORT}/${PAGE}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const probe = await page.evaluate(() => ({
  handles: Object.keys(window).filter((k) => /^__|bing|silvercase|GAME|golf|motel/i.test(k)).slice(0, 20),
  started: window.__bing?.game?.started ?? null,
}));
console.log(JSON.stringify(probe));
try {
  await page.click('#start-btn', { timeout: 5000 });
  await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 180000 });
  console.log('STARTED OK');
} catch (e) {
  console.log('START FAILED', e.message.slice(0, 120));
  console.log(JSON.stringify(await page.evaluate(() => ({
    started: window.__bing?.game?.started ?? null,
    loaded: window.__bing?.audio?.loadedCount ?? null,
  }))));
}
await browser.close();
server.close();

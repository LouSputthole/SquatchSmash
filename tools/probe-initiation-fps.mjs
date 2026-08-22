/**
 * How fast does Initiation Night actually render, act by act?
 *
 * NO NEW INSTRUMENTATION. `main.js` clamps its frame delta to 0.05 s, so a
 * phase timer advances at exactly (fps / 20) of real time and never faster.
 * `window.INITIATION.phaseT` is already on the debug surface, so sampling how
 * far it moves over a known wall-clock window gives the frame rate for free:
 *
 *     fps = 20 * (delta phaseT / delta wall clock)
 *
 * Measured at the pullback stall it came out at about half a frame a second,
 * and this is here to answer whether that is the whole scene or one act.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/initiation.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.INITIATION?.phase, null, { timeout: 60000 });
await page.click('#start-btn').catch(() => {});

/** Frame rate over `seconds`, read off the phase clock. */
async function fps(seconds = 12) {
  const read = () => page.evaluate(() => ({ t: window.INITIATION.phaseT, phase: window.INITIATION.phase }));
  const a = await read();
  const wall0 = Date.now();
  await page.waitForTimeout(seconds * 1000);
  const b = await read();
  const wall = (Date.now() - wall0) / 1000;
  /* A phase change resets phaseT, so a sample that straddles one is void. */
  if (b.phase !== a.phase || b.t < a.t) return { phase: `${a.phase}->${b.phase}`, fps: null };
  return { phase: a.phase, fps: 20 * ((b.t - a.t) / wall) };
}

const say = (label, r) => console.log(
  `${label.padEnd(22)} phase=${String(r.phase).padEnd(18)} ${r.fps === null ? 'sample straddled a phase change' : `${r.fps.toFixed(1)} fps`}`,
);

say('act one (clearing)', await fps());
await page.evaluate(() => window.INITIATION.skipToRitual());
await page.waitForFunction(() => window.INITIATION.phase === 'blade', null, { timeout: 60000 });
say('act five (cabin)', await fps());

/* Drive to the last act and sample the pull-back itself. */
const deadline = Date.now() + 420000;
while (Date.now() < deadline) {
  const phase = await page.evaluate(() => window.INITIATION.phase);
  if (phase === 'pullback' || phase === 'complete') break;
  await page.evaluate(() => window.INITIATION.smashAction());
  await page.waitForTimeout(400);
}
say('act six (pull-back)', await fps());

await browser.close();
server.close();

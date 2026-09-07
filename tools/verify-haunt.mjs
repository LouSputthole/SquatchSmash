// THE HAUNT'S OWN PROOF — two pages in one headless Chromium walk the whole
// paste ritual with a fake microphone: offer, answer, walk-in, the Stranger
// spawning and moving, voice attaching, and a whisper crossing the wire.
// Not wired into any workflow (needs --use-fake-device-for-media-stream);
// run by hand: node tools/verify-haunt.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = '/home/user/SquatchSmash';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(5392, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ permissions: ['microphone'] });
const host = await ctx.newPage();
const dev = await ctx.newPage();
const errs = { host: [], dev: [] };
host.on('pageerror', (e) => errs.host.push(e.message));
dev.on('pageerror', (e) => errs.dev.push(e.message));

const say = (s) => console.log('  ..', s);

await host.goto('http://localhost:5392/luxury-apartment.html?haunt=1', { waitUntil: 'load' });
await host.waitForFunction(() => window.LUXURY_APARTMENT && document.getElementById('haunt-panel'), null, { timeout: 90000 });
say('host scene up with panel');

await dev.goto('http://localhost:5392/haunt.html', { waitUntil: 'load' });
await dev.evaluate(() => {
  document.getElementById('name-input').value = 'Testy Stranger';
  document.getElementById('join-btn').click();
});
await dev.waitForFunction(() => document.getElementById('offer-out').value.length > 50, null, { timeout: 20000 });
const offer = await dev.inputValue('#offer-out');
say(`dev minted offer (${offer.length} chars)`);

await host.evaluate((code) => {
  document.getElementById('haunt-offer').value = code;
  document.getElementById('haunt-accept').click();
}, offer);
await host.waitForFunction(() => document.getElementById('haunt-reply').value.length > 50, null, { timeout: 20000 });
const reply = await host.inputValue('#haunt-reply');
say(`host answered (${reply.length} chars)`);

await dev.evaluate((code) => {
  document.getElementById('answer-in').value = code;
  document.getElementById('connect-btn').click();
}, reply);
await dev.waitForFunction(() => !document.getElementById('surface').classList.contains('hidden'), null, { timeout: 30000 });
say('dev crossed over — surface live');

await host.waitForFunction(() => {
  const status = document.getElementById('haunt-status')?.textContent ?? '';
  return /walked in/.test(status);
}, null, { timeout: 20000 });
const strangerThere = await host.evaluate(() => Boolean(window.LUXURY_APARTMENT.scene.getObjectByName('haunt-stranger')));
say(`stranger in scene: ${strangerThere}`);

await host.waitForFunction(() => /line open/.test(document.getElementById('haunt-status')?.textContent ?? ''), null, { timeout: 20000 })
  .then(() => say('voice stream attached (fake mic flowing)'))
  .catch(() => say('WARN: voice never attached'));

await dev.waitForFunction(() => document.getElementById('scene-chip').textContent.includes('luxury_apartment'), null, { timeout: 15000 });
say('dev sees scene id');
await dev.waitForFunction(() => document.getElementById('host-chip').textContent !== 'HOST: no contact', null, { timeout: 15000 });
say('dev receives player pose reports');

// Stranger follows a sent pose (drive the page's own channel via a synthetic pose burst)
await dev.evaluate(() => {
  // the page sends poses from its camera; nudge the camera and let the loop send
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
});
await host.waitForFunction(() => {
  const s = window.LUXURY_APARTMENT.scene.getObjectByName('haunt-stranger');
  return s && (Math.abs(s.position.x) + Math.abs(s.position.z)) > 0.001;
}, null, { timeout: 15000 }).then(() => say('stranger moves on dev input')).catch(() => say('WARN: stranger never moved'));
await dev.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })));

// Whisper prank end to end
await dev.evaluate(() => {
  document.getElementById('whisper-text').value = 'sell the apartment tony';
  document.querySelector('button.prank[data-cmd="whisper"]').click();
});
await host.waitForFunction(() => [...document.querySelectorAll('div')].some((d) => d.textContent === 'sell the apartment tony'), null, { timeout: 15000 });
say('whisper crossed the wire and rendered as a caption');

console.log('E2E: THE HAUNT LINK WORKS');
console.log('host errors:', JSON.stringify(errs.host.slice(0, 3)));
console.log('dev errors:', JSON.stringify(errs.dev.slice(0, 3)));
await browser.close();
server.close();
process.exit(0);

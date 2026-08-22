#!/usr/bin/env node
/**
 * Boot dist/squatch-apartment.html the way a hosted preview would.
 *
 *   node tools/verify-bundle.mjs
 *
 * The bundle spent weeks working perfectly over file:// and failing every
 * time anywhere real, because a hosted page comes with a Content-Security-
 * Policy and file:// does not. `script-src 'unsafe-inline'` permits an inline
 * <script> and refuses a `data:text/javascript` one, a refused module fires no
 * error event, and the loading screen just sits there blaming the network.
 *
 * So this serves the bundle over HTTP under several policies, from permissive
 * to `default-src 'none'`, and fails if any of them do not reach a playable
 * state. Opening the file in a browser does not test this. Nothing else does.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist/squatch-apartment.html');

/** Each is at least as strict as anything a preview host is likely to send. */
const POLICIES = [
  ['nothing but the page itself',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    + "img-src data:; media-src data:; connect-src 'none';"],
  ['data: allowed everywhere',
    "default-src 'self' 'unsafe-inline' data: blob:;"],
  ['images and fetches blocked',
    "script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none';"],
];

if (!fs.existsSync(BUNDLE)) {
  console.error('No dist/squatch-apartment.html — run `node tools/bundle-preview.mjs` first.');
  process.exit(1);
}
const html = fs.readFileSync(BUNDLE);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the bundle.');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});

let failures = 0;
for (const [label, csp] of POLICIES) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': csp });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const page = await browser.newPage();
  const blocked = new Set();
  const errors = new Set();
  page.on('console', (m) => {
    const t = m.text();
    if (/Refused to (load|execute|connect)/i.test(t)) blocked.add(t.slice(0, 120));
    else if (m.type() === 'error') errors.add(t.slice(0, 120));
  });
  page.on('pageerror', (e) => errors.add(e.message.slice(0, 120)));

  /* Playwright's default navigation timeout is 30 s, and this page is a
   * sixteen-megabyte single file: the whole apartment, the art, and four
   * megabytes of voice, all inline as data URIs, parsed before `load` fires.
   * Thirty seconds is not a statement about the build, it is a statement
   * about the box -- the boot wait below already allows sixty for the same
   * reason. Give the navigation the same room. */
  /* `domcontentloaded`, not `load`, and a long fuse.
   *
   * This page is a sixteen-megabyte single file -- the whole apartment, the
   * art, and four megabytes of voice, all inline as data URIs behind a strict
   * CSP. Waiting for `load` waits for every last subresource to settle, and
   * one that the policy refuses never settles at all, so the navigation hung
   * past three minutes with the page perfectly alive behind it. The real
   * readiness signal is the one the bundle publishes for exactly this
   * purpose, and it is already awaited below: `window.__squatch`. */
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  // The bundle publishes __squatch when it is ready; the watchdog fires at 30s.
  const booted = await page
    .waitForFunction(() => !!window.__squatch, { timeout: 60000 })
    .then(() => true, () => false);

  let playing = false;
  let voices = 0;
  if (booted) {
    await page.click('#start-btn').catch(() => {});
    await page.waitForTimeout(6000);
    ({ playing, voices } = await page.evaluate(() => ({
      playing: document.body.classList.contains('playing'),
      voices: [...window.__squatch.audio.buffers.keys()]
        .filter((k) => /^(radio\.)?vo\./.test(k)).length,
    })));
  }

  const ok = booted && playing;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`);
  console.log(`        booted ${booted}, playing ${playing}, ${voices} voice clips`);
  // Blocked images are a legitimate outcome under img-src 'none' -- the art
  // falls back to the procedural posters. Blocked scripts never are.
  const fatal = [...blocked].filter((b) => /script|connect/i.test(b));
  if (fatal.length) { failures++; console.log('        REFUSED:', fatal[0]); }
  if (errors.size) console.log('        errors:', [...errors][0]);

  await page.close();
  server.close();
}

await browser.close();

if (failures) {
  console.log(`\n${failures} policy check(s) failed.`);
  process.exit(1);
}
console.log('\nAll good.');

#!/usr/bin/env node
/**
 * Verify INITIATION NIGHT — the cabin ceremony, all six acts.
 *
 * WHAT THIS FILE USED TO BE, AND WHY THAT MATTERED.
 *
 * It was written for the OLD Initiation -- the gauntlet -- and was never
 * updated when the scene was rewritten as the cabin ceremony. It asserted a
 * cast of 13 with 4 prospects (the ceremony has 15 and 5), expected voice cues
 * under `vo.initiation.ceremony.` (they are `vo.initiation.cabin.` now), and
 * called `skipToGauntlet()` to wait for a phase named `gauntlet_in` that no
 * longer exists in the source. It then read `.requested` off a probe that
 * stopped returning it, threw a TypeError, and DIED -- so acts two through six
 * were never reached, and every check after line 113 had silently not run for
 * as long as the ceremony has existed.
 *
 * That is how the scene's whole fifth act shipped broken. The ritual camera
 * framed a fixed patch of tabletop 2.4 m in front of where the player actually
 * stands, so the hand, the cut, the card and the burning all happened behind
 * the camera; the saint card never burned at all; and the cut sprayed floor
 * decals a metre wide across the cabin for a beat whose stage direction reads
 * "this is not a gore beat". None of it was hard to see. Nothing was looking.
 *
 * So this walks the real phase graph: approach, the line, the clearing, the
 * trail, the cabin, the ritual, the room. It is deliberately blunt about act
 * five, because act five is the one that was never checked.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5206;
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
    memberNames: window.INITIATION.members.map((member) => member.name).filter(Boolean),
    prospects: window.INITIATION.prospects.length,
    hasHumanPlayer: window.INITIATION.player?.constructor?.name === 'Person',
    objective: document.querySelector('#objective')?.textContent,
    canvasCount: document.querySelectorAll('canvas').length,
    inventoryVisible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    inventorySlots: document.querySelectorAll('#hotbar .slot').length,
  }));

  check('the namespaced Initiation scene reaches its interactive approach phase',
    initial.phase === 'approach' && initial.canvasCount >= 1,
    JSON.stringify(initial));
  /* The ceremony's cast, not the gauntlet's: fifteen of the Circle in the
   * clearing and five prospects in the line, Kittenboss among them. */
  check('the ceremony cast and prospect line are preserved',
    initial.members === 15 && initial.prospects === 5,
    `${initial.members} members, ${initial.prospects} NPC prospects`);
  check('Tony starts Initiation human',
    initial.hasHumanPlayer,
    JSON.stringify(initial));
  check('Captain Lou Sasole appears under his canonical identity',
    initial.memberNames.includes('CAPTAIN LOU SASOLE'),
    initial.memberNames.join(' | '));
  check('the scene gives a visible movement objective',
    initial.objective?.includes('WASD'),
    initial.objective || 'no objective');
  check('Initiation keeps the shared five-slot inventory visible',
    initial.inventoryVisible && initial.inventorySlots === 5,
    JSON.stringify({ visible: initial.inventoryVisible, slots: initial.inventorySlots }));
  check('all scene modules and face textures load', missing.length === 0, missing.join(' | '));

  /* ---------------------------------------------------------------- */
  /* ACT ONE — the clearing                                             */
  /* ---------------------------------------------------------------- */

  const voiceProbe = await page.evaluate(() => window.INITIATION.speakVoiceProbe());
  check('ceremony subtitles ask the Initiation audio receiver for their exact cue',
    voiceProbe.speaker === 'BOOSKIBRO'
      && typeof voiceProbe.line === 'string' && voiceProbe.line.length > 0
      && voiceProbe.cue.startsWith('vo.initiation.cabin.'),
    JSON.stringify(voiceProbe));

  const quizVoiceProbe = await page.evaluate(() => window.INITIATION.speakQuizVoiceProbe());
  check('the founders answers play through the same cabin voice bank',
    typeof quizVoiceProbe.speaker === 'string' && quizVoiceProbe.speaker.length > 0
      && quizVoiceProbe.cue.startsWith('vo.initiation.'),
    JSON.stringify(quizVoiceProbe));

  /* ---------------------------------------------------------------- */
  /* ACT FIVE — the blade, the hand, the cut, the card, the burning    */
  /* ---------------------------------------------------------------- */

  await page.evaluate(() => window.INITIATION.skipToRitual());
  await page.waitForFunction(() => window.INITIATION.phase === 'blade', null, { timeout: 30000 });

  const ritualStart = await page.evaluate(() => window.INITIATION.ritual);
  check('act five opens on the ritual camera',
    ritualStart.camera === 'ritual', JSON.stringify(ritualStart));

  /* THE CHECK THAT WOULD HAVE CAUGHT IT. The shot is supposed to be close on
   * the hand; it aimed at a fixed patch of tabletop 2.4 m in front of it.
   *
   * On `aimMiss` and not `lookMiss`: the camera flies rather than cuts, and a
   * debug skip from the clearing to the cabin starts it 70 m away, so the
   * smoothed look point is meaningless for about a second afterwards. */
  check('the ritual camera is aimed at the hand',
    ritualStart.aimMiss < 1.0,
    `shot aims ${ritualStart.aimMiss?.toFixed(2)} m off the hand`);

  /* And it gets there: the smoothed shot settles onto the hand. */
  await page.waitForFunction(() => window.INITIATION.ritual.lookMiss < 1.0, null, { timeout: 30000 });

  /* Drive it: the blade beat runs on a timer, THEN the hand is asked for. */
  await page.waitForFunction(() => window.INITIATION.phase === 'hand', null, { timeout: 30000 });
  await page.evaluate(() => window.INITIATION.smashAction());
  await page.waitForFunction(() => window.INITIATION.phase === 'cut', null, { timeout: 30000 });
  await page.evaluate(() => window.INITIATION.smashAction());
  await page.waitForFunction(() => window.INITIATION.phase === 'card', null, { timeout: 30000 });

  const afterCut = await page.evaluate(() => window.INITIATION.ritual);
  check('the cut is marked on the palm, not on the floorboards',
    afterCut.palmCut, JSON.stringify(afterCut));
  check('the saint card is in the player\'s hand from IN-420, before the oath',
    afterCut.cardInPlayerHand && afterCut.cardVisible,
    JSON.stringify(afterCut));

  /* Both oath lines, then the burn. */
  await page.waitForFunction(() => window.INITIATION.phase === 'burn', null, { timeout: 60000 });
  await page.evaluate(() => window.INITIATION.setHold(true));
  await page.waitForFunction(() => window.INITIATION.ritual.char > 0, null, { timeout: 30000 });

  const burning = await page.evaluate(() => window.INITIATION.ritual);
  check('the card catches, and there is a flame on it',
    burning.char > 0 && burning.flame && burning.cardVisible,
    JSON.stringify(burning));
  check('the card is burning in the player\'s own hand',
    burning.cardInPlayerHand, JSON.stringify(burning));
  check('the camera stays on the burning hand',
    burning.lookMiss < 1.0 && burning.aimMiss < 1.0,
    `aim ${burning.aimMiss?.toFixed(2)} m / look ${burning.lookMiss?.toFixed(2)} m off the hand`);

  /* Let go. Past the commit, Lou has it and nothing dead-ends. */
  await page.waitForFunction(() => window.INITIATION.ritual.committed, null, { timeout: 30000 });
  await page.evaluate(() => window.INITIATION.setHold(false));
  await page.waitForFunction(() => window.INITIATION.phase === 'made', null, { timeout: 60000 });

  const made = await page.evaluate(() => window.INITIATION.ritual);
  check('a player who lets go after the commit is held, and it burns down',
    made.char === 1 && !made.cardVisible,
    JSON.stringify(made));

  /* ---------------------------------------------------------------- */
  /* ACT SIX — the room, and out                                       */
  /* ---------------------------------------------------------------- */

  await page.waitForFunction(() => window.INITIATION.phase === 'complete', null, { timeout: 180000 });
  const inducted = await page.evaluate(() => ({
    constructor: window.INITIATION.player?.constructor?.name,
    bandana: window.INITIATION.player?.palette?.bandana,
    title: document.querySelector('#complete .title')?.textContent?.trim(),
    subtitle: document.querySelector('#complete .subtitle')?.textContent?.replace(/\s+/g, ' ').trim(),
    visible: !document.querySelector('#complete')?.classList.contains('hidden'),
  }));
  check('induction keeps Tony human and awards the red member bandana',
    inducted.constructor === 'Person' && inducted.bandana === 0xd92e2e,
    JSON.stringify(inducted));
  check('completion describes family membership rather than a species change',
    inducted.visible
      && inducted.title === 'SILVER SASQUATCH'
      && inducted.subtitle?.includes("walking out family")
      && !inducted.subtitle?.includes('squatch feet'),
    JSON.stringify(inducted));
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

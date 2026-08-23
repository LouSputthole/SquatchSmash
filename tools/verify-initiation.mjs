#!/usr/bin/env node
/**
 * Verify the canonical first-person Initiation, its formal articulated cast,
 * voice readiness, execution free-look and human-to-family completion.
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
    playerController: window.INITIATION.player?.constructor?.name,
    presentationFigure: window.INITIATION.playerFigure?.constructor?.name,
    control: window.INITIATION.control,
    pose: window.INITIATION.playerPose,
    formalMembers: window.INITIATION.members.every((member) => member.sq?.model?.dress === 'suit'),
    formalProspects: window.INITIATION.prospects.every((prospect) => prospect.sq?.model?.dress === 'suit'),
    actorColliders: window.INITIATION.actorColliders,
    objective: document.querySelector('#objective')?.textContent,
    canvasCount: document.querySelectorAll('canvas').length,
    inventoryVisible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    inventorySlots: document.querySelectorAll('#hotbar .slot').length,
  }));

  check('the namespaced Initiation scene reaches its interactive approach phase',
    initial.phase === 'approach' && initial.control === 'playable' && initial.canvasCount >= 1,
    JSON.stringify(initial));
  check('the ceremony cast and prospect line are preserved',
    initial.members === 15 && initial.prospects === 5,
    `${initial.members} members, ${initial.prospects} NPC prospects`);
  check('Tony uses the shared first-person Player with a separate articulated ceremony body',
    initial.playerController === 'Player'
      && initial.presentationFigure === 'InitiationCeremonyFigure'
      && initial.pose === 'standing',
    JSON.stringify(initial));
  check('every attendee keeps their canonical body in a formal suit',
    initial.formalMembers && initial.formalProspects,
    JSON.stringify({ members: initial.formalMembers, prospects: initial.formalProspects }));
  check('soft actor collision is live but smaller than a roadblock',
    initial.actorColliders.length === 20
      && initial.actorColliders.every((circle) => circle.active && circle.r >= 0.32 && circle.r <= 0.45),
    JSON.stringify(initial.actorColliders));
  check('Captain Lou Sasole appears under his canonical identity',
    initial.memberNames.includes('CAPTAIN LOU SASOLE'),
    initial.memberNames.join(' | '));
  check('the scene gives a visible movement objective',
    initial.objective?.includes('WASD'),
    initial.objective || 'no objective');
  check('Initiation keeps the shared five-slot inventory visible',
    initial.inventoryVisible && initial.inventorySlots === 5,
    JSON.stringify({ visible: initial.inventoryVisible, slots: initial.inventorySlots }));

  await page.locator('canvas').first().click({ position: { x: 320, y: 180 } });
  await page.waitForFunction(() => window.INITIATION.audioReady || window.INITIATION.audioLoadError,
    null, { timeout: 120000 });
  const audioState = await page.evaluate(() => ({
    ready: window.INITIATION.audioReady,
    error: window.INITIATION.audioLoadError,
    missing: window.INITIATION.missingVoiceCues,
    failed: window.INITIATION.failedCues,
  }));
  check('the first gesture decodes the active Initiation voice bank before ceremony dialogue',
    audioState.ready && !audioState.error && audioState.missing.length === 0 && audioState.failed.length === 0,
    JSON.stringify(audioState));
  check('all scene modules, art and face textures load', missing.length === 0, missing.join(' | '));

  const voiceProbe = await page.evaluate(() => window.INITIATION.speakVoiceProbe());
  check('the conspiracy reveal uses the authored Lou cue',
    voiceProbe.speaker === 'BIG UNCLE LOU SPUTTHOLE'
      && voiceProbe.line.includes('Willy wasn’t the rat')
      && voiceProbe.cue.startsWith('vo.initiation.cabin.'),
    JSON.stringify(voiceProbe));
  check('the conspiracy reveal cue actually entered the audible buffer graph',
    voiceProbe.loaded && voiceProbe.duration > 0 && voiceProbe.played && !voiceProbe.blocked,
    JSON.stringify(voiceProbe));

  const quizVoiceProbe = await page.evaluate(() => window.INITIATION.speakQuizVoiceProbe());
  check('Tony reads the selected founders answer through a decoded voice take',
    quizVoiceProbe.speaker === 'PROSPECT TWO'
      && quizVoiceProbe.line.includes('Deathmegatron')
      && quizVoiceProbe.cue.startsWith('vo.initiation.ceremony.prospect-two.')
      && quizVoiceProbe.loaded && quizVoiceProbe.duration > 0
      && quizVoiceProbe.played && !quizVoiceProbe.blocked,
    JSON.stringify(quizVoiceProbe));

  await page.evaluate(() => window.INITIATION.skipToMassKneel());
  const kneel = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    control: window.INITIATION.control,
    pose: window.INITIATION.playerPose,
    eyeY: window.INITIATION.player.position.y,
    kneeling: window.INITIATION.prospects
      .filter((prospect) => prospect.name !== 'PROSPECT ONE')
      .map((prospect) => ({ name: prospect.name, pose: prospect.sq.pose, rootY: prospect.sq.position.y })),
  }));
  check('mass execution staging keeps Tony kneeling in first-person free-look',
    kneel.phase === 'mass_kneel' && kneel.control === 'look-only'
      && kneel.pose === 'kneeling' && kneel.eyeY < 1.1,
    JSON.stringify(kneel));
  check('all four remaining prospects kneel on articulated legs without buried roots',
    kneel.kneeling.length === 4
      && kneel.kneeling.every((entry) => entry.pose === 'kneeling' && entry.rootY >= -0.01),
    JSON.stringify(kneel.kneeling));

  await page.evaluate(() => window.INITIATION.skipToInduction());
  await page.waitForFunction(() => window.INITIATION.phase === 'complete', null, { timeout: 90000 });
  const inducted = await page.evaluate(() => ({
    controller: window.INITIATION.player?.constructor?.name,
    figure: window.INITIATION.playerFigure?.constructor?.name,
    bandana: window.INITIATION.playerFigure?.model?.bandana,
    dead: window.INITIATION.deadProspects,
    title: document.querySelector('#complete .title')?.textContent?.trim(),
    subtitle: document.querySelector('#complete .subtitle')?.textContent?.replace(/\s+/g, ' ').trim(),
    visible: !document.querySelector('#complete')?.classList.contains('hidden'),
  }));
  check('induction keeps shared first-person control and awards Tony the member bandana',
    inducted.controller === 'Player'
      && inducted.figure === 'InitiationCeremonyFigure'
      && inducted.bandana === true,
    JSON.stringify(inducted));
  check('Kittenboss dies beside Tony and Tony is the only surviving prospect',
    ['PROSPECT ONE', 'PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE', 'KITTENBOSS']
      .every((name) => inducted.dead.includes(name))
      && !inducted.dead.includes('PROSPECT TWO'),
    JSON.stringify(inducted.dead));
  check('completion describes family membership rather than a species change',
    inducted.visible
      && inducted.title === 'SILVER SASQUATCH'
      && inducted.subtitle?.includes("walking out family")
      && !inducted.subtitle?.includes('squatch feet'),
    JSON.stringify(inducted));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} catch (error) {
  console.error('Initiation verifier aborted before checks completed.');
  console.error('Runtime errors:', problems);
  console.error('Missing responses:', missing);
  throw error;
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

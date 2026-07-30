#!/usr/bin/env node
/**
 * Verify the Beef Run's campaign integration in a real browser: the preview
 * boots save-isolated, the mission begins through the airstrip story, every
 * checkpoint persists, completion is durable, the ending routes home, and a
 * saved mid-mission campaign resumes in the cockpit rather than starting over.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5211;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const SENTINEL = '{"version":999,"canonical":"beefrun verifier must not touch this"}';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Beef Run.');
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
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  /* ---- pass one: the save-isolated preview, played through ---- */

  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.addInitScript((sentinel) => {
    if (localStorage.getItem('squatchlife.campaign') === null) {
      localStorage.setItem('squatchlife.campaign', sentinel);
    }
  }, SENTINEL);
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
  const storageSnapshot = () => page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  const unchanged = (snapshot) => JSON.stringify(snapshot)
    === JSON.stringify({ 'squatchlife.campaign': SENTINEL });

  await page.goto(`http://localhost:${PORT}/beefrun.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });

  const booted = await page.evaluate(() => ({
    scene: window.__beefrun.campaignState.scene.id,
    mission: window.__beefrun.campaignState.missions.airstrip_smuggling,
    squatchfather: window.__beefrun.campaignState.missions.squatchfather.status,
    booski: window.__beefrun.campaignState.events.booski_day_two_call.status,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the preview boots with the airstrip available and its prerequisites seeded',
    booted.scene === 'airstrip_smuggling'
      && booted.mission.status === 'available'
      && booted.squatchfather === 'complete'
      && booted.booski === 'answered'
      && booted.previewNotice,
    JSON.stringify(booted));

  await page.click('#start-btn');
  await page.waitForFunction(() => window.__beefrun.mission.phase === 'arrival', null, { timeout: 60000 });
  const started = await page.evaluate(() => ({
    phase: window.__beefrun.mission.phase,
    status: window.__beefrun.campaignState.missions.airstrip_smuggling.status,
    checkpoint: window.__beefrun.campaignState.missions.airstrip_smuggling.checkpoint,
  }));
  check('starting the mission records in_progress at the airstrip checkpoint',
    started.phase === 'arrival'
      && started.status === 'in_progress'
      && started.checkpoint === 'airstrip',
    JSON.stringify(started));

  const eye = await page.evaluate(() => {
    const p = window.__beefrun.player;
    return { y: p.position.y, ground: p.ground, eye: p.position.y - p.ground };
  });
  check('the on-foot camera rides the terrain at human eye height',
    eye.eye > 1.0 && eye.eye < 2.2 && Number.isFinite(eye.ground),
    JSON.stringify(eye));

  /* The wave-2 scene notes: the walkaround must be guided (a named next item,
   * six checklist rows, a marker that lives in the scene), the parked wing
   * must not stand inside the hangar's front wall at z=396, and Old Stove
   * starts inside the hangar (z past the door plane) so he has somewhere to
   * walk out from. */
  const scenePass = await page.evaluate(() => {
    const m = window.__beefrun.mission;
    const rows = m.preflight.checklist;
    return {
      next: m.preflight.next?.name,
      rows: rows.length,
      states: rows.map((r) => r.state).join(','),
      markerInScene: !!m.preflight.marker?.parent,
      wingtipClear: m.airfield.anchors.parking.z + 17.2 / 2 < 396,
      stoveInHangar: m.stove.group.position.z > 396,
    };
  });
  check('the walkaround is guided and the parked aeroplane fits the field',
    scenePass.next === 'chocks'
      && scenePass.rows === 6
      && scenePass.states === 'next,todo,todo,todo,todo,todo'
      && scenePass.markerInScene
      && scenePass.wingtipClear
      && scenePass.stoveInHangar,
    JSON.stringify(scenePass));

  const chain = await page.evaluate(() => {
    const m = window.__beefrun.mission;
    const out = [];
    const record = () => {
      const mission = window.__beefrun.campaignState.missions.airstrip_smuggling;
      out.push({ checkpoint: mission.checkpoint, cargoLoaded: mission.cargoLoaded });
    };
    m.saveCheckpoint('takeoff'); record();
    m.saveCheckpoint('approach'); record();
    m.saveCheckpoint('departure'); record();
    m.saveCheckpoint('return'); record();
    return out;
  });
  check('every mission checkpoint persists through the campaign save',
    chain[0].checkpoint === 'airstrip'
      && chain[1].checkpoint === 'remote_strip'
      && chain[2].checkpoint === 'returning' && chain[2].cargoLoaded
      && chain[3].checkpoint === 'landed_home',
    JSON.stringify(chain));

  const detected = await page.evaluate(() => {
    window.__beefrun.mission.onDetectionState('located');
    return window.__beefrun.campaignState.missions.airstrip_smuggling.detected;
  });
  check('being located by the patrol persists on the mission record', detected === true);

  const completed = await page.evaluate(() => {
    window.__beefrun.mission.runEnding();
    const state = window.__beefrun.campaignState;
    return {
      status: state.missions.airstrip_smuggling.status,
      landingQuality: state.missions.airstrip_smuggling.landingQuality,
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      timeEvents: state.story.timeEvents,
    };
  });
  check('the ending records durable completion with a landing quality',
    completed.status === 'complete'
      && typeof completed.landingQuality === 'string'
      && completed.landingQuality.length > 0,
    JSON.stringify({ status: completed.status, landingQuality: completed.landingQuality }));
  check('completion lands the authored clock at Day 2, 8:30 PM',
    completed.day === 2
      && completed.timeMinutes === 20 * 60 + 30
      && completed.timeEvents.includes('mission.airstrip'),
    JSON.stringify({ day: completed.day, timeMinutes: completed.timeMinutes }));

  await page.evaluate(() => {
    // The real end-card path: releases pointer lock and shows the buttons.
    window.__beefrun.flightHud.showComplete(window.__beefrun.mission.report());
  });
  const frozen = await page.evaluate(async () => {
    // Give the aeroplane a shove; a live simulation would integrate it.
    const b = window.__beefrun;
    b.physics.velocity.set(0, 0, 5);
    const before = { x: b.physics.position.x, z: b.physics.position.z };
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      completeUp: b.flightHud.completeUp,
      moved: Math.abs(b.physics.position.x - before.x)
        + Math.abs(b.physics.position.z - before.z),
    };
  });
  check('the simulation freezes under the report card',
    frozen.completeUp === true && frozen.moved < 0.01, JSON.stringify(frozen));
  await page.click('#br-home');
  await page.waitForFunction(
    () => /index\.html/.test(location.pathname) || location.pathname.endsWith('/'),
    null,
    { timeout: 20000 },
  );
  check('the end card returns to the apartment in preview mode',
    await page.evaluate(() => new URLSearchParams(location.search).get('preview') === '1'));
  check('the whole playthrough leaves the canonical save untouched',
    unchanged(await storageSnapshot()));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
  await page.close();

  /* ---- pass two: a saved mid-mission campaign resumes in the cockpit ---- */

  const resumePage = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const resumeProblems = [];
  resumePage.on('pageerror', (error) => resumeProblems.push(error.message));
  resumePage.on('console', (message) => {
    if (message.type() === 'error') resumeProblems.push(message.text().slice(0, 240));
  });
  await resumePage.addInitScript(() => {
    // A campaign parked mid-mission on the loaded return leg.
    const save = {
      version: 2,
      revision: 1,
      scene: { id: 'airstrip_smuggling', spawn: 'hangar' },
      story: {
        chapter: 'day_two',
        day: 2,
        timeMinutes: 9 * 60 + 10,
        meetingKnown: false,
        meetingLearnedFrom: null,
        timeEvents: ['travel.airstrip'],
      },
      activities: {},
      inventory: { held: [], concealed: [] },
      events: {
        lou_first_call: { status: 'answered' },
        booski_day_two_call: { status: 'answered' },
        lou_second_call: { status: 'pending' },
      },
      missions: {
        bada_bing_one: { status: 'complete', packageReceived: true },
        squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
        airstrip_smuggling: {
          status: 'in_progress', checkpoint: 'returning', cargoLoaded: true,
          detected: false, landingQuality: null,
        },
        bada_bing_two: { status: 'locked' },
        jerky_motel: { status: 'locked' },
      },
    };
    localStorage.setItem('squatchlife.campaign', JSON.stringify(save));
  });
  await resumePage.goto(`http://localhost:${PORT}/beefrun.html`, { waitUntil: 'load' });
  await resumePage.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });
  await resumePage.click('#start-btn');
  await resumePage.waitForFunction(
    () => window.__beefrun.mission.flags.inCockpit,
    null,
    { timeout: 60000 },
  );
  const resumed = await resumePage.evaluate(() => ({
    phase: window.__beefrun.mission.phase,
    inCockpit: window.__beefrun.mission.flags.inCockpit,
    checkpoint: window.__beefrun.campaignState.missions.airstrip_smuggling.checkpoint,
    cargoLoaded: window.__beefrun.campaignState.missions.airstrip_smuggling.cargoLoaded,
  }));
  check('a saved returning checkpoint resumes loaded in the cockpit at departure',
    resumed.inCockpit
      && resumed.phase === 'heavyTakeoff'
      && resumed.checkpoint === 'returning'
      && resumed.cargoLoaded,
    JSON.stringify(resumed));
  check('no console errors during the resume', resumeProblems.length === 0,
    resumeProblems.join(' | '));
  await resumePage.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Beef Run checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Beef Run checks passed.`);

#!/usr/bin/env node
/**
 * Browser-level production verification for the Squatch Graveyard — the
 * disposal scene that closes THE HOTDOG INCIDENT and unlocks the Jerky Motel.
 * This was gap G10: a staged, routed scene with a story module and campaign
 * registration, covered by two unit tests and no scene gate at all.
 *
 * What it asserts, in the order the mission plays it:
 *   - the audio contract: every line the mission can speak has a manifest cue
 *     with the exact text, a cast voice, and an indexed recording, and the
 *     page's preload filter claims every cue the runtime plays;
 *   - the entry gates: a direct URL with a fresh save cannot start the scene,
 *     and a save where HotDog is already buried is offered the Motel instead;
 *   - the mission itself, walked: trunk to plot with the body in both arms,
 *     Echo's plot heard on the way past, the placement, the tributes (paid
 *     and... otherwise), the burial, Snow's bark, and the drive to the Motel;
 *   - the geometry: headstones, the open Sauce pit, Babs's bench, and the
 *     forest boundary all stop a walking player, and nobody falls into a pit.
 *
 * Two rules from `docs/ENGINE-TRAPS.md` govern how it is written:
 *   #2  Never sleep for a duration and assume progress. Every wait is on a
 *       predicate the game publishes, with a generous budget, because the
 *       scene clock advances per drawn frame and swiftshader draws slowly.
 *   #5  Walk it. The player character walks to the trunk, carries the body
 *       down the headlight path, and earns every hold with a held key.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  GRAVES,
  GRAVEYARD_ARRIVAL_LINES,
  GRAVEYARD_SNOW_BARKS,
  GraveyardMission,
} from '../src/graveyard/mission.js';
import {
  GRAVEYARD_AUDIO_CUE_NAMES,
  isGraveyardAudioPreloadCue,
} from '../src/graveyard/audio.js';
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5252;
const SCREENSHOT_DIR = process.env.GRAVEYARD_SCREENSHOT_DIR
  ? path.resolve(process.env.GRAVEYARD_SCREENSHOT_DIR)
  : null;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}
const fmt = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v));

/* ------------------------------------------------------------------ *
 * Off-page contract: every line the mission can speak is recorded
 * ------------------------------------------------------------------ */

/* Drive a scratch mission through every line-producing path it owns and
 * capture what it says. This is the authoritative script — a new line added
 * to mission.js turns up here without the verifier being told. */
function authoredGraveyardLines() {
  const lines = [];
  const mission = new GraveyardMission({
    onLine: (text, meta = {}) => lines.push({ text, cue: meta.cue, who: meta.who }),
  });
  for (const line of GRAVEYARD_ARRIVAL_LINES) lines.push({ text: line.text, cue: line.cue, who: line.who });
  for (const bark of Object.values(GRAVEYARD_SNOW_BARKS)) lines.push({ text: bark.text, cue: bark.cue, who: bark.who });
  for (const id of Object.keys(GRAVES)) mission.inspectGrave(id);
  mission.suggestSaucePlot();
  mission.urinateOn('brawny');
  mission.urinateOn('whiplash');
  mission.pickUpBody();
  mission.placeBody();
  mission.finishBurial();
  return lines.filter((line) => line.cue);
}

const VOICE_FOR_SPEAKER = { Snow: 'snow', Prospect: 'player', Echo: 'echo' };
const authored = authoredGraveyardLines();
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const manifestByName = new Map(soundManifest.sfx.map((cue) => [cue.name, cue]));

check(`every authored graveyard line (${authored.length}) has a manifest cue with exact text and a cast voice`,
  authored.length >= 20 && authored.every((line) => {
    const cue = manifestByName.get(line.cue);
    return cue && cue.say === line.text && cue.voice === VOICE_FOR_SPEAKER[line.who];
  }),
  fmt(authored.filter((line) => {
    const cue = manifestByName.get(line.cue);
    return !cue || cue.say !== line.text || cue.voice !== VOICE_FOR_SPEAKER[line.who];
  }).map((line) => line.cue)));

const authoredCues = new Set(authored.map((line) => line.cue));
const manifestGraveyardCues = soundManifest.sfx
  .map((cue) => cue.name)
  .filter((name) => name.startsWith('vo.graveyard.'));
check('no orphan vo.graveyard.* cues: the manifest and the mission agree line for line',
  manifestGraveyardCues.length === authoredCues.size
    && manifestGraveyardCues.every((name) => authoredCues.has(name)),
  fmt({ manifest: manifestGraveyardCues.length, authored: authoredCues.size }));

check('every graveyard voice cue has an indexed recording',
  [...authoredCues].every((cue) => indexedFiles.has(`${cue}.mp3`)),
  fmt([...authoredCues].filter((cue) => !indexedFiles.has(`${cue}.mp3`))));

const runtimePlayedCues = [
  ...GRAVEYARD_AUDIO_CUE_NAMES,
  ...authoredCues,
  'footstep.dirt',
  'footstep.grass',
];
check('the page preload filter claims every cue the runtime plays',
  runtimePlayedCues.every((cue) => isGraveyardAudioPreloadCue(cue)),
  fmt(runtimePlayedCues.filter((cue) => !isGraveyardAudioPreloadCue(cue))));

/* ------------------------------------------------------------------ *
 * Campaign seeds, built with the campaign's own API
 * ------------------------------------------------------------------ */

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function dayTwoBase(campaign) {
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.story.timeMinutes = 23 * 60;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponDropped = true;
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].checkpoint = 'landed_home';
  });
}

/** Straight off the Bing cleanup: body in the trunk, grave not yet claimed. */
function bodyLoadedSeed(extra) {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  dayTwoBase(campaign);
  campaign.update((state) => {
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    incident.status = 'in_progress';
    incident.checkpoint = 'body_loaded';
    incident.assignment = 'reserve_pickup';
    incident.attackResolved = true;
    incident.cleanupTasks = ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep'];
    incident.bodyWrapped = true;
    incident.bodyLoaded = true;
    if (extra) extra(state);
  });
  campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD);
  return JSON.stringify(campaign.state);
}

/** HotDog already under the mound, in a save that has moved on. */
function buriedSeed() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  dayTwoBase(campaign);
  campaign.update((state) => {
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    incident.status = 'complete';
    incident.checkpoint = 'buried';
    incident.assignment = 'reserve_pickup';
    incident.attackResolved = true;
    incident.bodyWrapped = true;
    incident.bodyLoaded = true;
    incident.burialComplete = true;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'available';
  });
  campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  return JSON.stringify(campaign.state);
}

/* ------------------------------------------------------------------ *
 * Server + browser
 * ------------------------------------------------------------------ */

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

const browser = await launchChromium({
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function newSeededPage(seed) {
  const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
  if (seed) {
    /* Guarded like verify-motel's seed: the init script re-runs on every
     * navigation in the context, and an unguarded write would stamp the
     * original seed back over the save the scene just transitioned. */
    await context.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { key: CAMPAIGN_STORAGE_KEY, value: seed });
  }
  const page = await context.newPage();
  const problems = [];
  const notFound = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
  page.on('response', (response) => {
    if (response.status() === 404) notFound.push(response.url());
  });
  /* Every wait is wall clock waiting on SIMULATED time (see the header). */
  page.setDefaultTimeout(600000);
  return { context, page, problems, notFound };
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

try {
  /* ---------------------------------------------------------------- *
   * Gate 1: a fresh save cannot start the disposal
   * ---------------------------------------------------------------- */
  {
    const { context, page, problems } = await newSeededPage(null);
    await page.goto(`http://localhost:${PORT}/graveyard.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.GRAVEYARD);
    await page.click('#start-btn');
    await page.waitForFunction(() => document.getElementById('start-btn')?.disabled === true);
    const gate = await page.evaluate(() => ({
      button: document.getElementById('start-btn')?.textContent,
      tag: document.querySelector('#overlay .tag')?.textContent,
      phase: window.GRAVEYARD.phase,
    }));
    check('a fresh save is refused: SCENE UNAVAILABLE, still on the menu',
      gate.button === 'SCENE UNAVAILABLE' && gate.phase === 'menu'
        && /Bada Bing/.test(gate.tag || ''),
      fmt(gate));
    check('the refused page reports no runtime errors', problems.length === 0, problems.join(' | '));
    await context.close();
  }

  /* ---------------------------------------------------------------- *
   * Gate 2: an already-buried save is offered the Motel
   * ---------------------------------------------------------------- */
  {
    const { context, page, problems } = await newSeededPage(buriedSeed());
    await page.goto(`http://localhost:${PORT}/graveyard.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.GRAVEYARD);
    await page.click('#start-btn');
    await page.waitForFunction(() => document.getElementById('start-btn')?.textContent === 'GO TO MOTEL');
    check('an already-complete save is offered GO TO MOTEL instead of the scene',
      true);
    await Promise.all([
      page.waitForURL('**/motel.html*'),
      page.click('#start-btn'),
    ]);
    const savedScene = await page.evaluate((key) => {
      try { return JSON.parse(localStorage.getItem(key))?.scene; } catch { return null; }
    }, CAMPAIGN_STORAGE_KEY);
    check('GO TO MOTEL drives the campaign to the Motel in the passenger seat',
      savedScene?.id === 'jerky_motel' && savedScene?.spawn === 'passenger_seat',
      fmt(savedScene));
    check('the complete-save gate reports no runtime errors', problems.length === 0, problems.join(' | '));
    await context.close();
  }

  /* ---------------------------------------------------------------- *
   * Resume: mid-scene progress restores into the objective card
   * ---------------------------------------------------------------- */
  {
    const resumeSeed = bodyLoadedSeed((state) => {
      const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
      /* A save that already banked graves is a save that already claimed the
       * scene: begin() resumes it rather than re-entering. */
      incident.checkpoint = 'graveyard';
      incident.echoHeard = true;
      incident.inspectedGraves = ['babs', 'echo'];
      incident.respectedGraves = ['babs'];
      incident.urinatedOn = ['brawny'];
    });
    const { context, page, problems } = await newSeededPage(resumeSeed);
    await page.goto(`http://localhost:${PORT}/graveyard.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.GRAVEYARD);
    await page.click('#start-btn');
    await page.waitForFunction(() => window.GRAVEYARD.phase === 'active');
    const resumed = await page.evaluate(() => ({
      echoHeard: window.GRAVEYARD.mission.echoHeard,
      inspected: [...window.GRAVEYARD.mission.inspected].sort(),
      tributes: [...window.GRAVEYARD.mission.tributes.keys()].sort(),
      objectives: [...document.querySelectorAll('#objectives .olist li')].map((li) => li.textContent),
      bodyPhase: window.GRAVEYARD.bodyPresentation().phase,
    }));
    check('mid-scene progress restores: markers, tributes and Echo survive a reload',
      resumed.echoHeard === true
        && resumed.inspected.join(',') === 'babs,brawny,echo'
        && resumed.tributes.join(',') === 'babs,brawny'
        && resumed.objectives.some((text) => text.includes('3/8'))
        && resumed.objectives.some((text) => text.includes('2/8'))
        && resumed.bodyPhase === 'trunk',
      fmt(resumed));
    check('the resume page reports no runtime errors', problems.length === 0, problems.join(' | '));
    await context.close();
  }

  /* ---------------------------------------------------------------- *
   * The mission, walked end to end
   * ---------------------------------------------------------------- */
  const { context, page, problems, notFound } = await newSeededPage(bodyLoadedSeed());
  await page.goto(`http://localhost:${PORT}/graveyard.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.GRAVEYARD);
  await page.click('#start-btn');
  await page.waitForFunction(() => window.GRAVEYARD.phase === 'active');
  check('the scene starts from the body-loaded save and goes active', true);

  /* Helpers: aim the head, steer the feet, and hold the one button. */
  const aim = (x, y, z) => page.evaluate(([tx, ty, tz]) => {
    const player = window.GRAVEYARD.player;
    const eye = player.camera.position;
    const dx = tx - eye.x;
    const dy = ty - eye.y;
    const dz = tz - eye.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    player._lookYaw = 0;
    player._lookPitch = 0;
  }, [x, y, z]);

  /* Steer toward the waypoint with the held key, and when a collider face
   * square to the aim stops all progress, sidestep the way a player would.
   * The predicate stays the game's own position, never wall-clock progress. */
  const walkTo = async (x, z, radius = 0.6, budgetMs = 240000) => {
    const started = Date.now();
    await page.keyboard.down('KeyW');
    try {
      let last = null;
      let stalled = 0;
      let nudges = 0;
      for (;;) {
        const now = await page.evaluate(([tx, tz]) => {
          const player = window.GRAVEYARD.player;
          const dx = tx - player.position.x;
          const dz = tz - player.position.z;
          player.yaw = Math.atan2(-dx, -dz);
          player.pitch = 0;
          return { x: player.position.x, z: player.position.z, d: Math.hypot(dx, dz) };
        }, [x, z]);
        if (now.d <= radius) return now;
        if (Date.now() - started > budgetMs) {
          throw new Error(`walkTo(${x}, ${z}) never arrived: ${fmt(now)}`);
        }
        if (last && Math.hypot(now.x - last.x, now.z - last.z) < 0.04) {
          stalled += 1;
          if (stalled >= 2) {
            const side = (nudges++ % 2) ? 'KeyA' : 'KeyD';
            await page.keyboard.down(side);
            await page.waitForTimeout(700);
            await page.keyboard.up(side);
            stalled = 0;
          }
        } else {
          stalled = 0;
        }
        last = now;
        await page.waitForTimeout(250);
      }
    } finally {
      await page.keyboard.up('KeyW');
    }
  };

  /* Walk into a wall on purpose: hold W toward `yaw` until he stops moving.
   * The predicate is non-progress, which is still a predicate: "held the key,
   * travelled under 2 cm across two samples". */
  const walkBlocked = async (yaw, budgetMs = 45000) => {
    await page.evaluate((y) => {
      const player = window.GRAVEYARD.player;
      player.yaw = y;
      player.pitch = 0;
      player._lookYaw = 0;
      player._lookPitch = 0;
    }, yaw);
    await page.keyboard.down('KeyW');
    const started = Date.now();
    let previous = null;
    try {
      for (;;) {
        await page.waitForTimeout(400);
        const now = await page.evaluate(() => {
          const player = window.GRAVEYARD.player;
          return { x: player.position.x, z: player.position.z, ground: player.ground, time: player.time };
        });
        if (previous && now.time > previous.time
          && Math.hypot(now.x - previous.x, now.z - previous.z) < 0.02) return now;
        if (Date.now() - started > budgetMs) return now;
        previous = now;
      }
    } finally {
      await page.keyboard.up('KeyW');
    }
  };

  const holdEUntil = async (predicate, arg) => {
    await page.keyboard.down('KeyE');
    try {
      await page.waitForFunction(predicate, arg, { polling: 100 });
    } finally {
      await page.keyboard.up('KeyE');
    }
  };

  const playerState = () => page.evaluate(() => {
    const player = window.GRAVEYARD.player;
    return { x: player.position.x, z: player.position.z, ground: player.ground };
  });

  /* -- the arrival composition ------------------------------------- */
  const spawn = await playerState();
  check('the player spawns off the rear quarter, clear of the trunk geometry',
    Math.abs(spawn.x - 4.5) < 0.01 && Math.abs(spawn.z - 21.5) < 0.01 && spawn.ground === 0,
    fmt(spawn));
  const arrivalSpeaker = await page.waitForFunction(() => {
    const speaker = document.getElementById('speaker');
    if (speaker?.classList.contains('hidden')) return null;
    return { who: speaker.querySelector('small')?.textContent, text: speaker.querySelector('span')?.textContent };
  });
  const firstLine = await arrivalSpeaker.jsonValue();
  check('Snow opens the arrival script on the speaker card',
    firstLine?.who === 'Snow' && firstLine?.text === GRAVEYARD_ARRIVAL_LINES[0].text,
    fmt(firstLine));
  await capture(page, 'arrival');

  /* -- geometry: the world stops a walking player -------------------- */
  const teleport = (x, z) => page.evaluate(([tx, tz]) => {
    const player = window.GRAVEYARD.player;
    player.position.set(tx, player.position.y, tz);
    player.velocity.set(0, 0, 0);
    player.clearKeys();
  }, [x, z]);

  await teleport(5.8, -6.4);
  const pitStop = await walkBlocked(0); // yaw 0: forward is -Z, into the open Sauce pit
  check('the open Sauce pit is blocked: he stops at its lip and never stands on air',
    pitStop.z <= -6.9 && pitStop.z >= -7.12 && pitStop.ground === 0,
    fmt(pitStop));

  await teleport(-8, -0.5);
  const forestStop = await walkBlocked(Math.PI / 2); // forward is -X, into the tree line
  check('the invisible forest boundary holds the west edge of the clearing',
    forestStop.x <= -14.3 && forestStop.x >= -14.78 && forestStop.ground === 0,
    fmt(forestStop));

  await teleport(-7.6, -2.25);
  const benchStop = await walkBlocked(Math.PI / 2); // forward is -X, into Babs's bench
  check("Babs's bench collides where it stands in the tree line",
    benchStop.x <= -8.45 && benchStop.x >= -8.75 && benchStop.ground === 0,
    fmt(benchStop));

  /* -- the body comes out of the trunk ------------------------------ */
  await teleport(4.5, 21.5);
  await walkTo(0.6, 19.1);
  await aim(0, 0.87, 17.46);
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt');
    return !prompt?.classList.contains('hidden') && /lift Billy HotDog/.test(prompt.textContent || '');
  });
  check('walking to the trunk offers the lift prompt', true);
  await holdEUntil(() => window.GRAVEYARD.mission.state === 'carried');
  const carried = await page.evaluate(() => window.GRAVEYARD.bodyPresentation());
  check('the held lift puts Billy in both arms: body phase carrying, parented to the camera',
    carried.phase === 'carrying' && carried.parent === 'graveyard.camera' && carried.visible,
    fmt({ phase: carried.phase, parent: carried.parent }));

  /* Jump and sprint are refused while he is carried. */
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  const jumpRefused = await page.evaluate(() => ({
    spaceHeld: window.GRAVEYARD.player.keys.has('Space'),
    jump: window.GRAVEYARD.player.jumpHeight,
  }));
  await page.keyboard.up('Space');
  check('Space is refused with HotDog in both arms',
    jumpRefused.spaceHeld === false && jumpRefused.jump === 0,
    fmt(jumpRefused));

  /* -- the carry: down the headlight path, past Echo ----------------- */
  await walkTo(2.4, 11.5, 0.8); // around the parked car, not through it
  await walkTo(0, 8, 0.8);
  await walkTo(0, -8.9, 0.8);
  const echo = await page.evaluate(() => ({
    heard: window.GRAVEYARD.mission.echoHeard,
    campaign: window.GRAVEYARD.campaignState.missions.bada_bing_two.echoHeard,
  }));
  check('walking the aisle past Echo auto-triggers his plot and banks it in the save',
    echo.heard === true && echo.campaign === true,
    fmt(echo));
  await walkTo(0, -15.1, 0.5);
  const carryArrived = await playerState();
  check('the carry route from trunk to fresh plot is walkable and stops at the pit collider',
    carryArrived.z <= -14.5 && carryArrived.z >= -15.75 && Math.abs(carryArrived.x) < 0.9,
    fmt(carryArrived));

  /* -- placement ----------------------------------------------------- */
  await aim(0, 0.09, -15.74);
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt');
    return !prompt?.classList.contains('hidden') && /place HotDog/.test(prompt.textContent || '');
  });
  await holdEUntil(() => window.GRAVEYARD.mission.state === 'placed'
    && window.GRAVEYARD.bodyPresentation().phase === 'placed');
  const placed = await page.evaluate(() => window.GRAVEYARD.bodyPresentation());
  check('the placement tween lands Billy centred in the fresh grave',
    Math.abs(placed.position[0]) < 0.06
      && Math.abs(placed.position[1] - 0.07) < 0.06
      && Math.abs(placed.position[2] + 17) < 0.06,
    fmt(placed.position));
  check('head toward the marker, feet toward the road',
    placed.head[2] < placed.feet[2],
    fmt({ head: placed.head, feet: placed.feet }));
  await capture(page, 'placed');

  /* -- tributes: the optional round, done before the shovel ---------- */
  for (const id of ['sheep', 'colton', 'geewiz', 'echo']) {
    await page.evaluate((graveId) => window.GRAVEYARD.respect(graveId), id);
  }
  const sauceKind = await page.evaluate(() => {
    const result = window.GRAVEYARD.inspect('sauce');
    window.GRAVEYARD.respect('sauce');
    return result?.kind ?? null;
  });
  check("Sauce's reserved plot reads as reserved and can still be respected",
    sauceKind === 'reserved', fmt({ sauceKind }));

  /* Babs, walked and held. Walking into her stone doubles as the headstone
   * collision check. The route takes the centre aisle north and the lane in
   * front of the first row, the way a player reads the yard, instead of a
   * straight line through two headstones. */
  await walkTo(0, -6.8, 0.8);
  await walkTo(-6, -2.6, 0.5);
  const babsStop = await walkBlocked(0);
  check("Babs's monument stops him at its face",
    babsStop.z <= -2.85 && babsStop.z >= -3.1, fmt(babsStop));
  await aim(-6, 0.9, -3.5);
  await page.waitForFunction(() => window.GRAVEYARD.interactionTarget === 'babs');
  await holdEUntil(() => window.GRAVEYARD.mission.tributeFor?.('babs') === 'respect'
    || window.GRAVEYARD.mission.tributes.get('babs') === 'respect');
  check('a held E at the monument pays respects', true);

  /* The traitors, walked and held: E is automatically the other thing. */
  for (const traitor of ['brawny', 'whiplash']) {
    const home = traitor === 'brawny' ? { x: -2.3, z: -2.7 } : { x: 2.0, z: -2.6 };
    const slab = traitor === 'brawny' ? { x: -2.3, z: -4.2 } : { x: 2.0, z: -4.1 };
    await walkTo(home.x, home.z, 0.5);
    await walkBlocked(Math.atan2(-(slab.x - home.x), -(slab.z - home.z)));
    await aim(slab.x, 0.7, slab.z);
    await page.waitForFunction(
      (id) => window.GRAVEYARD.interactionTarget === id,
      traitor,
    );
    await page.keyboard.down('KeyE');
    try {
      await page.waitForFunction(() => window.GRAVEYARD.disrespecting === true);
      await page.waitForFunction(() => window.GRAVEYARD.disrespectEarned === true);
    } finally {
      await page.keyboard.up('KeyE');
    }
    await page.waitForFunction(
      (id) => window.GRAVEYARD.campaignState.missions.bada_bing_two.urinatedOn.includes(id),
      traitor,
    );
    check(`${GRAVES[traitor].name} is properly disrespected, earned in simulated time and landed impacts`, true);
  }

  const tributeBoard = await page.evaluate(() => ({
    objectives: [...document.querySelectorAll('#objectives .olist li')].map((li) => ({
      text: li.textContent,
      done: li.classList.contains('done'),
    })),
  }));
  check('both optional objectives complete at 8/8',
    tributeBoard.objectives.filter((o) => o.text.includes('8/8') && o.done).length === 2,
    fmt(tributeBoard));

  /* -- the burial ---------------------------------------------------- */
  await walkTo(0, -6.9, 0.8);
  await walkTo(0.9, -13.6, 0.7);
  await walkTo(1.7, -15.4, 0.5);
  /* The shovel leans (rotation.z −0.18), so its 3.5 cm handle is not where
   * upright arithmetic puts it. Aim at the blade the scene actually placed. */
  const shovelBlade = await page.evaluate(() => {
    const scene = window.GRAVEYARD.player.camera.parent;
    const shovel = scene.getObjectByName('burial.shovel');
    shovel.updateMatrixWorld(true);
    const blade = shovel.children[1];
    const point = blade.getWorldPosition(blade.position.clone());
    return [point.x, point.y, point.z];
  });
  await aim(...shovelBlade);
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt');
    return !prompt?.classList.contains('hidden') && /fill HotDog/.test(prompt.textContent || '');
  });
  await holdEUntil(() => window.GRAVEYARD.mission.bodyBuried === true);
  const buried = await page.evaluate(() => {
    const scene = window.GRAVEYARD.player.camera.parent;
    const mound = scene.getObjectByName('grave.hotdog.fresh.mound');
    const marker = scene.getObjectByName('hotdog.temporary-marker');
    const incident = window.GRAVEYARD.campaignState.missions.bada_bing_two;
    return {
      body: window.GRAVEYARD.bodyPresentation(),
      mound: mound?.visible ?? null,
      marker: marker?.visible ?? null,
      incident: {
        status: incident.status,
        checkpoint: incident.checkpoint,
        burialComplete: incident.burialComplete,
        inspected: incident.inspectedGraves.length,
        respected: incident.respectedGraves.length,
        urinated: [...incident.urinatedOn].sort(),
      },
      motel: window.GRAVEYARD.campaignState.missions.jerky_motel.status,
      story: window.GRAVEYARD.campaignState.story,
      /* The shared panel from src/core/objective-panel.js, which this scene
         now drives instead of its own `#mission-card`. A gate still reading
         the deleted widget would go green on an empty string -- ENGINE-TRAPS
         section 5, the gate that lies. */
      headline: [...document.querySelectorAll('#objectives .olist li')]
        .map((li) => li.textContent).join(' · '),
    };
  });
  check('the burial hides the body and raises the mound and the temporary marker',
    buried.body.visible === false && buried.body.phase === 'buried'
      && buried.mound === true && buried.marker === true,
    fmt({ visible: buried.body.visible, phase: buried.body.phase, mound: buried.mound, marker: buried.marker }));
  check('the burial completes THE HOTDOG INCIDENT and unlocks the Jerky Motel',
    buried.incident.status === 'complete'
      && buried.incident.checkpoint === 'buried'
      && buried.incident.burialComplete === true
      && buried.motel === 'available',
    fmt(buried.incident));
  check('all eight markers and all eight tributes reached the durable save',
    buried.incident.inspected === 8
      && buried.incident.respected === 6
      && buried.incident.urinated.join(',') === 'brawny,whiplash',
    fmt(buried.incident));
  check('closing the incident advances the campaign clock past midnight',
    buried.story.day === 3 && buried.story.timeMinutes >= 45,
    fmt({ day: buried.story.day, timeMinutes: buried.story.timeMinutes }));
  check('the objective card sends him back to the car',
    /Return to Snow/.test(buried.headline || ''), fmt({ headline: buried.headline }));
  check('no runtime errors through the whole disposal',
    problems.length === 0, problems.join(' | '));
  await capture(page, 'buried');

  /* -- Snow's bark, then the car ------------------------------------- */
  await walkTo(-2.1, -14.2, 0.6);
  await aim(-2.1, 1.2, -15.7);
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt');
    return !prompt?.classList.contains('hidden') && /Talk to/.test(prompt.textContent || '');
  });
  await page.keyboard.press('KeyE');
  const bark = await page.waitForFunction((expected) => {
    const speaker = document.getElementById('speaker');
    if (speaker?.classList.contains('hidden')) return null;
    const text = speaker.querySelector('span')?.textContent;
    return text === expected ? text : null;
  }, GRAVEYARD_SNOW_BARKS.car.text);
  check('after the burial Snow barks him to the car',
    Boolean(await bark.jsonValue()));

  await walkTo(0, -6.8, 0.8);
  await walkTo(2.4, 11.5, 0.8); // around the parked car again
  await walkTo(2.4, 18.4, 0.7);
  await walkTo(0.5, 19.0, 0.7);
  await aim(0, 1.0, 17.4);
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt');
    return !prompt?.classList.contains('hidden') && /leave for the Jerky Motel/.test(prompt.textContent || '');
  });
  await holdEUntil(() => window.GRAVEYARD.phase === 'complete');
  await page.waitForFunction(() => !document.getElementById('ending')?.classList.contains('hidden'));
  check('holding at the car completes the scene and shows the ending card', true);
  check('no 404s anywhere in the mission', notFound.length === 0, notFound.join(' | '));
  await capture(page, 'ending');

  check('the graveyard session raised no errors before the handoff',
    problems.length === 0, problems.join(' | '));
  await Promise.all([
    page.waitForURL('**/motel.html*'),
    page.click('#motel-btn'),
  ]);
  const departed = await page.evaluate((key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }, CAMPAIGN_STORAGE_KEY);
  check('Continue to the Motel departs the campaign to the passenger seat',
    departed?.scene?.id === 'jerky_motel' && departed?.scene?.spawn === 'passenger_seat',
    fmt(departed?.scene));
  check('the drive out spends the travel marker',
    departed?.story?.day === 3 && departed?.story?.timeMinutes >= 90,
    fmt({ day: departed?.story?.day, timeMinutes: departed?.story?.timeMinutes }));
  await context.close();
} catch (err) {
  check('verifier ran to completion', false, err?.stack || String(err));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length
  ? `\n${failed.length} of ${results.length} checks failed.`
  : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);

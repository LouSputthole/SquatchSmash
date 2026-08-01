#!/usr/bin/env node
/**
 * Verify the dedicated Bada Bing Scene Two runtime: the closed HotDog party,
 * the compact cleanup, the body-loaded campaign checkpoint, and the routed
 * graveyard burial that finally unlocks the Jerky Motel.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5205;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};
const CLEANUP_TASKS = ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep'];

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function sceneTwoSeed() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.story.timeMinutes = 20 * 60 + 15;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponDropped = true;
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].checkpoint = 'landed_home';
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
  });
  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'driver_seat' });
  return JSON.stringify(campaign.state);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the HotDog incident.');
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

function watchProblems(page) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    // Both scenes request pointer lock after awaiting audio initialization.
    // Chromium's headless user-activation window is shorter than a real click;
    // the rejected lock is a harness limitation and the scene keeps running.
    if (message.type() === 'error' && !/user gesture.*pointer lock/i.test(text)) {
      problems.push(text.slice(0, 260));
    }
  });
  return problems;
}

async function incidentState(page) {
  return page.evaluate(() => {
    const incident = window.HOTDOG_INCIDENT;
    const phases = [...new Set(incident.sequence.map((beat) => beat.phase))];
    return {
      routerAlias: incident === window.__bing,
      isSecondVisit: incident.isSecondVisit,
      phase: incident.game.phase,
      started: incident.game.started,
      missionState: incident.mission.state,
      readyToLeave: incident.mission.readyToLeave,
      assignment: incident.mission.assignment,
      flags: { ...incident.mission.flags },
      cleanup: [...incident.mission.cleanup],
      castCount: incident.cast.all.length,
      collision: {
        count: incident.party.collision?.all.length ?? 0,
        castCount: incident.party.collision?.cast.length ?? 0,
        propIds: incident.party.collision?.props.map((entry) => entry.id) ?? [],
        nonblocking: incident.party.collision?.nonblocking.map((entry) => entry.id) ?? [],
      },
      cakePedestalParts: incident.party.food.cakePedestal?.children.length ?? 0,
      hasPartySet: Boolean(
        incident.party.extra.hotdog
        && incident.party.extra.aubbie
        && incident.party.stage.controls
        && incident.party.cleanup.gun
        && incident.party.cleanup.wrap
        && incident.party.cleanup.loadPad
      ),
      dedicated: !('blackjack' in incident) && !('slots' in incident),
      phases,
      campaign: incident.campaignState.missions.bada_bing_two,
      motel: incident.campaignState.missions.jerky_motel,
      scene: incident.campaignState.scene,
      story: incident.campaignState.story,
      exitLabel: document.getElementById('start-btn')?.textContent ?? '',
    };
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await context.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: CAMPAIGN_STORAGE_KEY, value: sceneTwoSeed() });
  const page = await context.newPage();
  const problems = watchProblems(page);

  await page.goto(`http://localhost:${PORT}/bing.html?visit=2`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HOTDOG_INCIDENT?.story, null, { timeout: 90000 });
  await page.evaluate(() => window.HOTDOG_INCIDENT.postfx.disable?.());

  let current = await incidentState(page);
  check('the Bing router selects the dedicated HotDog runtime for visit two',
    current.routerAlias
      && current.isSecondVisit
      && current.dedicated
      && current.castCount >= 20
      && current.hasPartySet,
    JSON.stringify({
      alias: current.routerAlias,
      cast: current.castCount,
      dedicated: current.dedicated,
      party: current.hasPartySet,
    }));
  check('the authored party covers performance, tension, attack, aftermath, and handoff',
    ['performance', 'tension', 'attack', 'aftermath', 'handoff']
      .every((phase) => current.phases.includes(phase)),
    current.phases.join(', '));
  check('the party set has solid furniture, a supported cake, live cast bodies, and nonblocking evidence',
    current.collision.castCount === current.castCount
      && [
        'prop.buffet',
        'prop.cake-table',
        'prop.stage-controls',
        'prop.cleanup-kit',
        'prop.broken-stool',
        'prop.wrapped-body',
      ].every((id) => current.collision.propIds.includes(id))
      && [
        'evidence.cufflink',
        'evidence.lapel-pin',
        'evidence.revolver',
        'trigger.service-load',
      ].every((id) => current.collision.nonblocking.includes(id))
      && current.cakePedestalParts >= 4,
    JSON.stringify({ collision: current.collision, cake: current.cakePedestalParts }));
  check('loading Scene Two is read-only and leaves the Motel locked',
    current.campaign.status === 'available'
      && current.motel.status === 'locked'
      && current.scene.id === SCENE_IDS.BADA_BING_TWO
      && current.story.day === 2
      && current.story.timeMinutes === 20 * 60 + 15,
    JSON.stringify({
      incident: current.campaign,
      motel: current.motel,
      scene: current.scene,
      story: current.story,
    }));

  await page.click('#start-btn');
  await page.waitForFunction(() => window.HOTDOG_INCIDENT.game.started, null, { timeout: 90000 });
  current = await incidentState(page);
  check('Start claims only the party checkpoint',
    current.phase === 'active'
      && current.missionState === 'party'
      && current.campaign.status === 'in_progress'
      && current.campaign.checkpoint === 'party'
      && current.motel.status === 'locked',
    JSON.stringify(current));

  const movementBefore = await page.evaluate(() => ({
    mode: window.HOTDOG_INCIDENT.player.mode,
    position: window.HOTDOG_INCIDENT.player.position.toArray(),
  }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(650);
  await page.keyboard.up('KeyW');
  const movementAfter = await page.evaluate(() => ({
    mode: window.HOTDOG_INCIDENT.player.mode,
    position: window.HOTDOG_INCIDENT.player.position.toArray(),
  }));
  const spawnMoveDelta = Math.hypot(
    movementAfter.position[0] - movementBefore.position[0],
    movementAfter.position[2] - movementBefore.position[2],
  );
  check('the party spawn enters walk mode and accepts movement input',
    movementBefore.mode === 'walk'
      && movementAfter.mode === 'walk'
      && spawnMoveDelta > 0.08,
    JSON.stringify({ movementBefore, movementAfter, spawnMoveDelta }));

  const physical = await page.evaluate(() => {
    const incident = window.HOTDOG_INCIDENT;
    const { party, club } = incident;
    for (const key of ['mens', 'ladies', 'storage', 'service']) {
      const door = club.doors[key];
      door.locked = false;
      if (!door.open) door.toggle();
    }

    const eric = party.byId.eric;
    const ericCollision = party.collision.byId['cast.eric'];
    const ericX = eric.group.position.x;
    const ericVisible = eric.group.visible;
    const ericBefore = ericCollision.snapshot();
    eric.group.position.x += 0.7;
    const ericMoved = ericCollision.snapshot();
    eric.group.visible = false;
    const ericHidden = ericCollision.snapshot();
    eric.group.position.x = ericX;
    eric.group.visible = ericVisible;

    const kitCollision = party.collision.byId['prop.cleanup-kit'];
    const kitBefore = kitCollision.active;
    party.cleanup.kit.visible = false;
    const kitHidden = kitCollision.active;
    party.cleanup.kit.visible = true;

    const hotdog = party.extra.hotdog;
    const hotdogCollision = hotdog.partyCollider;
    const oldPosition = hotdog.group.position.clone();
    const oldRotation = hotdog.group.rotation.clone();
    hotdog.group.position.set(-15.8, 0.25, -0.45);
    hotdog.group.rotation.set(0, 1.3, -1.34);
    party.cleanup.brokenStool.visible = true;
    const fallen = hotdogCollision.snapshot();

    const bounds = { x0: -20.5, x1: 13.5, z0: -14.65, z1: 10.5 };
    const step = 0.25;
    const radius = 0.29;
    const nx = Math.floor((bounds.x1 - bounds.x0) / step) + 1;
    const nz = Math.floor((bounds.z1 - bounds.z0) / step) + 1;
    const clear = (x, z) => {
      for (const collision of club.colliders) {
        const min = collision.min;
        const max = collision.max;
        if (1.66 < min.y || 0 > max.y) continue;
        const cx = Math.max(min.x, Math.min(max.x, x));
        const cz = Math.max(min.z, Math.min(max.z, z));
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz < radius * radius) return false;
      }
      return true;
    };
    const reachable = (target, range = 1.25) => {
      const visited = new Uint8Array(nx * nz);
      const queue = new Int32Array(nx * nz);
      const toIndex = (ix, iz) => iz * nx + ix;
      const sx = Math.round((incident.player.position.x - bounds.x0) / step);
      const sz = Math.round((incident.player.position.z - bounds.z0) / step);
      const start = toIndex(sx, sz);
      if (!clear(bounds.x0 + sx * step, bounds.z0 + sz * step)) return false;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        const ix = index % nx;
        const iz = Math.floor(index / nx);
        const x = bounds.x0 + ix * step;
        const z = bounds.z0 + iz * step;
        const dx = x - target.x;
        const dz = z - target.z;
        if (dx * dx + dz * dz <= range * range) return true;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nextX = ix + ox;
          const nextZ = iz + oz;
          if (nextX < 0 || nextX >= nx || nextZ < 0 || nextZ >= nz) continue;
          const next = toIndex(nextX, nextZ);
          if (visited[next]) continue;
          const worldX = bounds.x0 + nextX * step;
          const worldZ = bounds.z0 + nextZ * step;
          if (!clear(worldX, worldZ)) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      return false;
    };
    const worldPosition = (object) => object.getWorldPosition(object.position.clone());
    const targets = {
      controls: worldPosition(party.stage.controls),
      mens: worldPosition(party.cleanup.bathroomPads.mens),
      ladies: worldPosition(party.cleanup.bathroomPads.ladies),
      storageKit: worldPosition(party.cleanup.kit),
      lou: worldPosition(party.extra.lou.group),
      fallenBody: worldPosition(hotdog.group),
      serviceExit: worldPosition(party.cleanup.loadPad),
    };
    const paths = Object.fromEntries(Object.entries(targets)
      .map(([id, target]) => [id, reachable(target)]));

    hotdog.group.visible = false;
    party.cleanup.wrap.visible = true;
    const wrapped = party.collision.byId['prop.wrapped-body'].snapshot();
    paths.wrappedBody = reachable(worldPosition(party.cleanup.wrap));
    hotdog.group.visible = true;
    party.cleanup.wrap.visible = false;
    party.cleanup.brokenStool.visible = false;
    hotdog.group.position.copy(oldPosition);
    hotdog.group.rotation.copy(oldRotation);

    const solidIds = club.colliders
      .map((collision) => collision.userData?.partyCollisionId)
      .filter(Boolean);
    return {
      castMoved: ericMoved.min[0] - ericBefore.min[0],
      castHidden: ericHidden.active,
      kitBefore,
      kitHidden,
      fallenWidth: fallen.max[0] - fallen.min[0],
      wrappedActive: wrapped.active,
      paths,
      tinyEvidenceIsSolid: [
        'evidence.cufflink', 'evidence.lapel-pin', 'evidence.revolver',
        'trigger.service-load',
      ].some((id) => solidIds.includes(id)),
    };
  });
  check('party collision follows staging, clears with visibility, and leaves every objective lane reachable',
    Math.abs(physical.castMoved - 0.7) < 0.001
      && physical.castHidden === false
      && physical.kitBefore
      && physical.kitHidden === false
      && physical.fallenWidth >= 1.5
      && physical.wrappedActive
      && Object.values(physical.paths).every(Boolean)
      && !physical.tinyEvidenceIsSolid,
    JSON.stringify(physical));

  const attack = await page.evaluate(() => {
    const incident = window.HOTDOG_INCIDENT;
    incident.mission.enteredClub();
    const performance = incident.mission.startPerformance();
    const setFinished = incident.mission.finishPerformance();
    const attacked = incident.mission.startAttack();
    incident.state.director.waitingForGun = true;
    const kicked = incident.kickGun();
    incident.state.director.running = false;
    return {
      performance,
      setFinished,
      attacked,
      kicked: Boolean(kicked || incident.mission.flags.gunKicked),
      missionState: incident.mission.state,
      checkpoint: incident.campaignState.missions.bada_bing_two.checkpoint,
      campaignGunKicked: incident.campaignState.missions.bada_bing_two.gunKicked,
    };
  });
  check('the Prospect must kick HotDog’s gun before cleanup starts',
    attack.performance
      && attack.setFinished
      && attack.attacked
      && attack.kicked
      && attack.missionState === 'cleanup'
      && attack.checkpoint === 'attack'
      && attack.campaignGunKicked,
    JSON.stringify(attack));

  const cleanup = await page.evaluate((tasks) => {
    const incident = window.HOTDOG_INCIDENT;
    const completed = tasks.map((task) => [task, incident.completeCleanupTask(task)]);
    const wrapped = incident.mission.wrapBody();
    const assigned = incident.mission.assign('reserve_pickup');
    const banked = incident.story.completeClub({
      assignment: incident.mission.assignment,
      bodyWrapped: incident.mission.flags.bodyWrapped,
      bodyLoaded: incident.mission.flags.bodyLoaded,
    });

    // The authored handoff remains the thing that exposes the route button.
    const handoffAt = incident.sequence.findIndex((beat) => beat.phase === 'handoff');
    incident.state.director.index = handoffAt;
    incident.state.director.current = null;
    incident.state.director.remaining = 0;
    incident.state.director.handoffReady = true;
    incident.state.director.running = true;
    window.__fastHotDogHandoff = setInterval(() => {
      incident.state.director.remaining = 0;
      if (incident.game.phase === 'complete') clearInterval(window.__fastHotDogHandoff);
    }, 12);
    return { completed, wrapped, assigned, banked };
  }, CLEANUP_TASKS);
  check('the compact cleanup banks all four jobs, wrapping, and loading',
    cleanup.completed.every(([, ok]) => ok)
      && cleanup.wrapped
      && cleanup.assigned
      && cleanup.banked,
    JSON.stringify(cleanup));

  await page.waitForFunction(
    () => window.HOTDOG_INCIDENT.game.phase === 'complete'
      && /graveyard/i.test(document.getElementById('start-btn')?.textContent || ''),
    null,
    { timeout: 90000 },
  );
  current = await incidentState(page);
  check('loading the body creates a durable graveyard handoff, not a Motel unlock',
    current.readyToLeave
      && current.assignment === 'reserve_pickup'
      && CLEANUP_TASKS.every((task) => current.cleanup.includes(task))
      && current.campaign.status === 'in_progress'
      && current.campaign.checkpoint === 'body_loaded'
      && current.campaign.bodyWrapped
      && current.campaign.bodyLoaded
      && current.motel.status === 'locked'
      && /graveyard/i.test(current.exitLabel),
    JSON.stringify(current));

  await page.click('#start-btn');
  await page.waitForURL(`http://localhost:${PORT}/graveyard.html`, { timeout: 60000 });
  await page.waitForFunction(() => window.GRAVEYARD?.story, null, { timeout: 90000 });
  let graveyard = await page.evaluate(() => ({
    phase: window.GRAVEYARD.phase,
    scene: window.GRAVEYARD.campaignState.scene,
    incident: window.GRAVEYARD.campaignState.missions.bada_bing_two,
    motel: window.GRAVEYARD.campaignState.missions.jerky_motel,
  }));
  check('the router handoff enters the graveyard under the headlights',
    graveyard.phase === 'menu'
      && graveyard.scene.id === SCENE_IDS.SQUATCH_GRAVEYARD
      && graveyard.scene.spawn === 'headlights'
      && graveyard.incident.checkpoint === 'body_loaded'
      && graveyard.motel.status === 'locked',
    JSON.stringify(graveyard));

  await page.click('#start-btn');
  await page.waitForFunction(() => window.GRAVEYARD.phase === 'active', null, { timeout: 90000 });
  const bodyMove = await page.evaluate(() => {
    const graveyardRuntime = window.GRAVEYARD;
    const initial = graveyardRuntime.bodyPresentation();
    const pickedUp = graveyardRuntime.pickupBody();
    const carried = graveyardRuntime.bodyPresentation();
    const placementStarted = graveyardRuntime.placeBody();
    return { initial, pickedUp, carried, placementStarted };
  });
  check('the actual HotDog figure is lifted from the trunk and carried as the same object',
    bodyMove.initial.phase === 'trunk'
      && bodyMove.initial.characterId === 'billy_hotdog'
      && bodyMove.initial.presentation === 'character'
      && bodyMove.pickedUp
      && bodyMove.carried.phase === 'carrying'
      && bodyMove.carried.parent === 'graveyard.camera'
      && bodyMove.carried.uuid === bodyMove.initial.uuid
      && bodyMove.placementStarted,
    JSON.stringify(bodyMove));

  await page.waitForFunction(() => window.GRAVEYARD.mission.bodyPlaced, null, { timeout: 10000 });
  const placement = await page.evaluate(() => window.GRAVEYARD.bodyPresentation());
  check('placing HotDog turns him lengthwise with his head toward the marker',
    placement.phase === 'placed'
      && placement.head[2] < placement.feet[2]
      && Math.abs(placement.position[0]) < 0.05
      && placement.position[1] < 0.12
      && Math.abs(placement.position[2] + 17) < 0.05,
    JSON.stringify(placement));

  const burial = await page.evaluate(() => {
    const graveyardRuntime = window.GRAVEYARD;
    const completed = graveyardRuntime.bury();
    return {
      completed,
      body: graveyardRuntime.bodyPresentation(),
      clock: graveyardRuntime.displayClock,
      incident: graveyardRuntime.campaignState.missions.bada_bing_two,
      motel: graveyardRuntime.campaignState.missions.jerky_motel,
    };
  });
  check('burial completes the HotDog incident and only then unlocks the Motel',
    burial.completed
      && burial.body.phase === 'buried'
      && !burial.body.visible
      && burial.clock.day === 3
      && burial.clock.timeMinutes === 45
      && burial.incident.status === 'complete'
      && burial.incident.checkpoint === 'buried'
      && burial.incident.burialComplete
      && burial.motel.status === 'available',
    JSON.stringify(burial));

  await page.evaluate(() => document.getElementById('motel-btn').click());
  await page.waitForURL(`http://localhost:${PORT}/motel.html`, { timeout: 60000 });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 90000 });
  const motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    scene: window.MOTEL.campaignState.scene,
    mission: window.MOTEL.campaignState.missions.jerky_motel,
  }));
  check('the completed disposal reaches the existing Motel passenger-seat entry',
    motel.phase === 'menu'
      && motel.scene.id === SCENE_IDS.JERKY_MOTEL
      && motel.scene.spawn === 'passenger_seat'
      && motel.mission.status === 'available',
    JSON.stringify(motel));
  check('the authorized HotDog-to-Motel flow reports no runtime errors',
    problems.length === 0, problems.join(' | '));
  await context.close();

  const blockedContext = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const blockedPage = await blockedContext.newPage();
  const blockedProblems = watchProblems(blockedPage);
  await blockedPage.goto(`http://localhost:${PORT}/bing.html?visit=2`, { waitUntil: 'load' });
  await blockedPage.waitForFunction(() => window.HOTDOG_INCIDENT?.story, null, { timeout: 90000 });
  const beforeBlockedStart = await blockedPage.evaluate(() => ({
    scene: window.HOTDOG_INCIDENT.campaignState.scene,
    story: window.HOTDOG_INCIDENT.campaignState.story,
    mission: window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two,
  }));
  await blockedPage.evaluate(() => document.getElementById('start-btn').click());
  await blockedPage.waitForFunction(() => document.getElementById('start-btn').disabled, null, { timeout: 10000 });
  const afterBlockedStart = await blockedPage.evaluate(() => ({
    scene: window.HOTDOG_INCIDENT.campaignState.scene,
    story: window.HOTDOG_INCIDENT.campaignState.story,
    mission: window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two,
  }));
  check('an unauthorized visit-two URL cannot alter a fresh campaign',
    JSON.stringify(afterBlockedStart) === JSON.stringify(beforeBlockedStart)
      && afterBlockedStart.scene.id === SCENE_IDS.APARTMENT
      && afterBlockedStart.mission.status === 'locked',
    JSON.stringify(afterBlockedStart));
  check('the rejected router entry reports no runtime errors',
    blockedProblems.length === 0, blockedProblems.join(' | '));
  await blockedContext.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} HotDog incident checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} HotDog incident checks passed.`);

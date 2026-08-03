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
        && incident.party.apeKnife
        && !incident.party.cleanup.gun
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

async function inventoryBarState(page) {
  return page.evaluate(() => {
    const bar = document.getElementById('hotbar');
    return {
      present: !!bar,
      visible: !!bar && !bar.classList.contains('hidden'),
      slots: bar?.children.length ?? 0,
      declared: bar?.dataset.slotCount ?? null,
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
  const signatureBeat = await page.evaluate(() => {
    const sequence = window.HOTDOG_INCIDENT.sequence;
    const matches = sequence
      .map((beat, index) => ({ ...beat, index }))
      .filter((beat) => beat.line === 'Hey guys, what’s going on?');
    const music = sequence.findIndex((beat) => beat.cue === 'vo.bing2.shubenator.music');
    return { matches, music };
  });
  check('the HotDog aftermath has one gleeful Shubenator signature immediately after the music cut',
    signatureBeat.matches.length === 1
      && signatureBeat.matches[0].who === 'Shubenator'
      && signatureBeat.matches[0].cue === 'vo.bing2.shubenator.signature.gleeful'
      && signatureBeat.matches[0].reaction === 'shubenator-aftermath'
      && /gleeful/i.test(signatureBeat.matches[0].direction)
      && signatureBeat.matches[0].index === signatureBeat.music + 1,
    JSON.stringify(signatureBeat));
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
  const partyInventory = await inventoryBarState(page);
  check('the HotDog party uses the shared visible five-slot inventory bar',
    partyInventory.present
      && partyInventory.visible
      && partyInventory.slots === 5
      && partyInventory.declared === '5',
    JSON.stringify(partyInventory));
  await page.waitForFunction(() => {
    const handle = window.HOTDOG_INCIDENT.audio.loops.get('party.record');
    return handle?.streamed && handle.element?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }, null, { timeout: 30000 });
  const partyRecord = await page.evaluate(() => {
    const handle = window.HOTDOG_INCIDENT.audio.loops.get('party.record');
    return {
      streamed: handle?.streamed === true,
      sourceOwnsElement: handle?.node?.mediaElement === handle?.element,
      hasDecodedBuffer: !!handle?.node?.buffer,
      paused: handle?.element?.paused ?? true,
      duration: handle?.element?.duration ?? 0,
    };
  });
  check('the HotDog party record streams through the shared mix without a retained AudioBuffer',
    partyRecord.streamed && partyRecord.sourceOwnsElement && !partyRecord.hasDecodedBuffer
      && !partyRecord.paused && partyRecord.duration > 0,
    JSON.stringify(partyRecord));
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

  const partyPresentation = await page.evaluate(() => {
    const { party } = window.HOTDOG_INCIDENT;
    const photoFaces = ['ape', 'hogmama', 'shubenator', 'snow'].map((id) => {
      const npc = party.byId[id];
      let mapped = 0;
      npc?.parts.head.traverse((node) => {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        mapped += materials.filter((material) => material?.map).length;
      });
      return { id, mapped };
    });
    const wrapBody = party.cleanup.wrap.getObjectByName('hotdog.wrap-body');
    return {
      lawnmowerIsSnow: party.extra.lawnmower === party.byId.snow,
      castUnique: new Set(party.all).size === party.all.length,
      aliases: party.byId.snow.aliases,
      photoFaces,
      hogMamaZ: party.byId.hogmama.position.z,
      micZ: party.stage.mic.getWorldPosition(new window.HOTDOG_INCIDENT.three.Vector3()).z,
      spotlight: {
        name: party.stage.spotlight.name,
        intensity: party.stage.spotlight.intensity,
      },
      bloodPresentation: party.cleanup.blood.userData.presentation,
      bloodGeometry: party.cleanup.blood.children.map((child) => child.geometry?.type),
      apeKnife: {
        name: party.apeKnife?.name ?? '',
        hiddenBeforeAttack: party.apeKnife?.visible === false,
      },
      wrapGeometry: wrapBody?.geometry?.type,
      wrapRadius: wrapBody?.geometry?.parameters?.radius,
      evidenceMarkers: Object.keys(party.cleanup.evidenceMarkers),
      serviceGuide: {
        visible: party.cleanup.serviceGuide.visible,
        text: party.cleanup.serviceGuide.userData.guidanceText,
        parts: party.cleanup.serviceGuide.children.length,
      },
    };
  });
  check('the closed party uses canonical faces, one Snow/Lawnmower identity, and readable cleanup presentation',
    partyPresentation.lawnmowerIsSnow
      && partyPresentation.castUnique
      && partyPresentation.aliases.includes('Lawnmower')
      && partyPresentation.photoFaces.every(({ mapped }) => mapped >= 1)
      && partyPresentation.hogMamaZ > -4
      && partyPresentation.micZ > -4
      && partyPresentation.spotlight.name === 'hogmama.spotlight'
      && partyPresentation.spotlight.intensity === 0
       && partyPresentation.bloodPresentation === 'irregular-floor-splatter'
       && !partyPresentation.bloodGeometry.includes('CircleGeometry')
       && partyPresentation.apeKnife.name === 'ape.fur-brush-knife'
       && partyPresentation.apeKnife.hiddenBeforeAttack
       && partyPresentation.wrapGeometry === 'CapsuleGeometry'
      && partyPresentation.wrapRadius >= 0.4
      && partyPresentation.evidenceMarkers.length === 2
      && !partyPresentation.serviceGuide.visible
      && partyPresentation.serviceGuide.parts >= 4,
    JSON.stringify(partyPresentation));

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
        'evidence.cufflink', 'evidence.lapel-pin',
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

  const apeRoute = await page.evaluate(() => {
    const incident = window.HOTDOG_INCIDENT;
    const ape = incident.party.byId.ape;
    incident.startApeExit();
    const start = [ape.group.position.x, ape.group.position.z];
    const route = ape.route?.map(({ x, z }) => ({ x, z })) ?? [];
    const positions = [];
    for (let i = 0; i < 70; i += 1) {
      ape.update(0.05, incident.player.position);
      positions.push([ape.group.position.x, ape.group.position.z]);
    }
    const crossedTwoTopLane = positions.some(([x, z]) => (
      x >= -14.15 && x <= -12.65 && z >= 0.45 && z <= 1.65
    ));
    return {
      positions,
      crossedTwoTopLane,
      maxDistanceFromStart: Math.max(...positions.map(([x, z]) => Math.hypot(x - start[0], z - start[1]))),
      route,
    };
  });
  check('Ape uses the west-side route instead of walking into the two-top before the confrontation',
    apeRoute.maxDistanceFromStart > 1
      && !apeRoute.crossedTwoTopLane
      && apeRoute.route.length >= 3,
    JSON.stringify({
      maxDistanceFromStart: apeRoute.maxDistanceFromStart,
      crossedTwoTopLane: apeRoute.crossedTwoTopLane,
      route: apeRoute.route,
    }));

  await page.evaluate(() => window.HOTDOG_INCIDENT.beginSequence());
  await page.waitForFunction(
    () => window.HOTDOG_INCIDENT.state.director.current?.who === 'Shubenator',
    null,
    { timeout: 5000 },
  );
  const directedOpening = await page.evaluate(() => {
    const incident = window.HOTDOG_INCIDENT;
    return {
      missionState: incident.mission.state,
      current: incident.state.director.current?.who,
      cinematic: incident.state.cinematic.active,
      shot: incident.state.cinematic.shot,
      spotlight: incident.party.stage.spotlight.intensity,
      camera: incident.camera?.position?.toArray?.() || null,
      gapAfter: incident.state.director.current?.gapAfter,
    };
  });
  check('Shubenator finishes the pre-set introduction under an authored stage camera and dedicated spotlight',
    directedOpening.missionState === 'performance'
      && directedOpening.current === 'Shubenator'
      && directedOpening.cinematic
      && directedOpening.shot === 'hogmama-stage-edge'
      && directedOpening.spotlight > 0
      && directedOpening.gapAfter > 0,
    JSON.stringify(directedOpening));

  const attack = await page.evaluate(() => {
    const incident = window.HOTDOG_INCIDENT;
    incident.mission.enteredClub();
    incident.state.director.running = false;
    const performance = incident.mission.state === 'performance' || incident.mission.startPerformance();
    const setFinished = incident.mission.finishPerformance();
    const attacked = incident.startAttackCinematic();
    const hits = [];
    let landed = incident.attack.landed;
    for (let i = 0; i < 200 && incident.attack.active; i += 1) {
      incident.attack.update(0.02);
      if (incident.attack.landed > landed) {
        landed = incident.attack.landed;
        hits.push(landed);
      }
    }
    incident.state.director.running = false;
    return {
      performance,
      setFinished,
      attacked,
      hits,
      attackFinished: !incident.attack.active,
      missionState: incident.mission.state,
      checkpoint: incident.campaignState.missions.bada_bing_two.checkpoint,
      campaignAttackResolved: incident.campaignState.missions.bada_bing_two.attackResolved,
      missionAttackResolved: incident.mission.flags.attackResolved,
      bloodVisible: incident.party.cleanup.blood.visible,
      brokenStoolVisible: incident.party.cleanup.brokenStool.visible,
      knifeVisible: incident.party.apeKnife?.visible === true,
      noGunProp: !incident.party.cleanup.gun,
      noGunInteraction: !('kickGun' in incident),
    };
  });
  check('Ape lands four brutal beats and his final blow starts cleanup without a gun interaction',
    attack.performance
      && attack.setFinished
      && attack.attacked
      && attack.attackFinished
      && JSON.stringify(attack.hits) === JSON.stringify([1, 2, 3, 4])
      && attack.missionState === 'cleanup'
      && attack.checkpoint === 'attack'
      && attack.campaignAttackResolved
      && attack.missionAttackResolved
      && attack.bloodVisible
      && attack.brokenStoolVisible
      && attack.knifeVisible
      && attack.noGunProp
      && attack.noGunInteraction,
    JSON.stringify(attack));

  const cleanup = await page.evaluate((tasks) => {
    const incident = window.HOTDOG_INCIDENT;
    const completed = tasks.map((task) => [task, incident.completeCleanupTask(task)]);
    incident.party.extra.hotdog.group.userData.interact.onUse();
    const wrapped = incident.mission.flags.bodyWrapped && incident.state.wrapped;
    const guideAfterWrap = incident.party.cleanup.serviceGuide.visible;
    const loadObjective = incident.mission.objectives.find((objective) => objective.id === 'load')?.text;
    incident.party.cleanup.loadPad.userData.interact.onUse();
    const assigned = incident.mission.assignment === 'reserve_pickup';
    const guideAfterLoad = incident.party.cleanup.serviceGuide.visible;
    const banked = incident.campaignState.missions.bada_bing_two.checkpoint === 'body_loaded';

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
    return { completed, wrapped, assigned, banked, guideAfterWrap, guideAfterLoad, loadObjective };
  }, CLEANUP_TASKS);
  check('the compact cleanup banks all four jobs, wrapping, and loading',
    cleanup.completed.every(([, ok]) => ok)
      && cleanup.wrapped
      && cleanup.assigned
      && cleanup.banked
      && cleanup.guideAfterWrap
      && !cleanup.guideAfterLoad
      && /service-exit arrows/i.test(cleanup.loadObjective),
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
  const graveyardInventory = await inventoryBarState(page);
  check('the Graveyard uses the shared visible five-slot inventory bar',
    graveyardInventory.present
      && graveyardInventory.visible
      && graveyardInventory.slots === 5
      && graveyardInventory.declared === '5',
    JSON.stringify(graveyardInventory));
  await page.evaluate(() => {
    const runtime = window.GRAVEYARD;
    const originalOnLine = runtime.mission.hooks.onLine;
    window.__graveyardEmittedLines = [];
    runtime.mission.hooks.onLine = (text, meta = {}) => {
      window.__graveyardEmittedLines.push({ text, ...meta });
      originalOnLine?.(text, meta);
    };
    // Echo is west of the graves. This point is the far/east edge of the
    // central path, so the encounter must not require aiming at his marker.
    runtime.player.position.set(0.9, 1.66, -7);
  });
  await page.waitForFunction(
    () => window.GRAVEYARD.mission.echoHeard
      && window.GRAVEYARD.campaignState.missions.bada_bing_two.echoHeard,
    null,
    { timeout: 10000 },
  );
  const memorialInteractions = await page.evaluate(() => {
    const runtime = window.GRAVEYARD;
    runtime.inspect('echo');
    runtime.inspect('echo');
    runtime.inspect('babs');
    const firstRespect = runtime.respect('babs');
    runtime.inspect('babs');
    const duplicateRespect = runtime.respect('babs');
    const emitted = window.__graveyardEmittedLines;
    const cueCount = (cue) => emitted.filter((line) => line.cue === cue).length;
    const incident = runtime.campaignState.missions.bada_bing_two;
    return {
      firstRespect,
      duplicateRespect,
      tribute: runtime.mission.tributeFor('babs'),
      echoHeard: runtime.mission.echoHeard,
      persistedEcho: incident.echoHeard,
      inspectedEchoCount: incident.inspectedGraves.filter((id) => id === 'echo').length,
      respectedBabsCount: incident.respectedGraves.filter((id) => id === 'babs').length,
      cues: {
        echoInspect: cueCount('vo.graveyard.inspect.echo'),
        echoAlive: cueCount('vo.graveyard.echo.alive'),
        echoWind: cueCount('vo.graveyard.prospect.wind'),
        snowWind: cueCount('vo.graveyard.snow.wind'),
        babsInspect: cueCount('vo.graveyard.inspect.babs'),
      },
    };
  });
  check('the path auto-triggers Echo once and duplicate grave events cannot replay speech or respect',
    memorialInteractions.echoHeard
      && memorialInteractions.persistedEcho
      && memorialInteractions.inspectedEchoCount === 1
      && memorialInteractions.firstRespect
      && !memorialInteractions.duplicateRespect
      && memorialInteractions.tribute === 'respect'
      && memorialInteractions.respectedBabsCount === 1
      && Object.values(memorialInteractions.cues).every((count) => count === 1),
    JSON.stringify(memorialInteractions));

  await page.evaluate(() => {
    const runtime = window.GRAVEYARD;
    // Stand within interaction range on Brawny's approach and look at the
    // centre of the ruined marker. This uses the actual document key handlers
    // below rather than calling the mission's urination method directly.
    runtime.player.position.set(-2.3, 1.66, -1.75);
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.yaw = 0;
    runtime.player.pitch = -0.38;
  });
  await page.waitForFunction(
    () => window.GRAVEYARD.interactionTarget === 'brawny',
    null,
    { timeout: 10000 },
  );
  await page.keyboard.press('p');
  await page.waitForTimeout(120);
  const legacyPWasInert = await page.evaluate(() => !window.GRAVEYARD.disrespecting);
  await page.keyboard.down('e');
  await page.waitForFunction(() => window.GRAVEYARD.disrespecting, null, { timeout: 3000 });
  await page.waitForTimeout(1650);
  await page.keyboard.up('e');
  await page.waitForFunction(
    () => !window.GRAVEYARD.disrespecting
      && window.GRAVEYARD.mission.tributeFor('brawny') === 'disrespect',
    null,
    { timeout: 5000 },
  );
  await page.keyboard.press('e');
  await page.waitForTimeout(160);
  const primaryDisrespect = await page.evaluate((pWasInert) => {
    const runtime = window.GRAVEYARD;
    const incident = runtime.campaignState.missions.bada_bing_two;
    const peeCues = window.__graveyardEmittedLines
      .filter((line) => line.cue === 'vo.graveyard.prospect.pee.brawny').length;
    return {
      pWasInert,
      tribute: runtime.mission.tributeFor('brawny'),
      urinatedCount: incident.urinatedOn.filter((id) => id === 'brawny').length,
      respectedCount: incident.respectedGraves.filter((id) => id === 'brawny').length,
      peeCues,
      stillDisrespecting: runtime.disrespecting,
    };
  }, legacyPWasInert);
  check('E automatically performs a traitor disrespect once while the removed P shortcut is inert',
    primaryDisrespect.pWasInert
      && primaryDisrespect.tribute === 'disrespect'
      && primaryDisrespect.urinatedCount === 1
      && primaryDisrespect.respectedCount === 0
      && primaryDisrespect.peeCues === 1
      && !primaryDisrespect.stillDisrespecting,
    JSON.stringify(primaryDisrespect));

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

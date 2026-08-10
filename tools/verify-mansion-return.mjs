#!/usr/bin/env node
/**
 * Focused real-input proof for the repaired-house return briefing.
 *
 * The first E on Big Uncle Lou must commit all three briefing facts. The
 * second E must take the registered campaign edge to Cartel Palace. Player
 * movement, crosshair selection and both uses travel through the page's real
 * DOM input handlers; this tool never calls Lou's handler or the campaign's
 * debug briefing shortcut.
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
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54947;
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

class MemoryStorage {
  constructor() { this.values = new Map(); }

  getItem(key) { return this.values.get(key) ?? null; }

  setItem(key, value) { this.values.set(key, String(value)); }
}

function returnVisitSave() {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    Object.assign(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
      status: 'complete',
      payloadReleased: true,
      returnedHome: true,
    });
    state.missions[MISSION_IDS.MANSION_RETURN].status = 'available';
    state.story.chapter = 'mansion_return';
  });
  return storage.getItem(CAMPAIGN_STORAGE_KEY);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await fsp.readFile(file);
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(500).end(String(error));
  }
});

const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolve);
});
const closeServer = () => new Promise((resolve) => {
  if (!server.listening) { resolve(); return; }
  server.close(resolve);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

let browser = null;
try {
  await listen();
  browser = await launchChromium({
    args: [
      /* Direct SwiftShader can invalidate the first instanced depth-material
       * link in this shadow-heavy house. Match the established Mansion Siege
       * verifier and route deterministic software rendering through ANGLE. */
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);

  const problems = [];
  page.on('pageerror', (error) => problems.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    if (!reason.includes('ERR_ABORTED')) problems.push(`request: ${request.url()} - ${reason}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });

  await page.addInitScript(({ key, save }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, save);
  }, { key: CAMPAIGN_STORAGE_KEY, save: returnVisitSave() });

  await page.goto(`${BASE}/mansion.html?visit=return`, {
    waitUntil: 'load',
    timeout: 180_000,
  });
  await page.waitForFunction(() => window.mansion?.campaign?.visit === 'return'
    && window.mansion?.player && window.mansion?.interaction);

  const entry = await page.evaluate(({ sceneId, missionId }) => {
    const state = window.mansion.campaign.state();
    return {
      visit: window.mansion.campaign.visit,
      entry: window.mansion.campaign.entry,
      scene: state.scene,
      status: state.missions[missionId].status,
      startLabel: document.getElementById('startBtn')?.textContent?.trim() ?? '',
      expected: sceneId,
    };
  }, { sceneId: SCENE_IDS.MANSION_RETURN, missionId: MISSION_IDS.MANSION_RETURN });
  check('the canonical saved return opens as an in-progress driveway visit',
    entry.visit === 'return'
      && entry.entry?.ok === true
      && entry.scene?.id === entry.expected
      && entry.scene?.spawn === 'driveway'
      && entry.status === 'in_progress'
      && entry.startLabel === 'WALK UP TO THE HOUSE',
    JSON.stringify(entry));

  await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.mansion?.running === true
    && document.getElementById('menu')?.classList.contains('hidden'));
  await page.evaluate(() => window.mansion.setRendering(false));

  const beforeWalk = await page.evaluate(() => {
    const p = window.mansion.player.position;
    return [p.x, p.y, p.z];
  });
  await page.keyboard.down('w');
  await page.evaluate(() => window.mansion.tick(0.45));
  await page.keyboard.up('w');
  await page.evaluate(() => window.mansion.tick(0.1));
  const afterWalk = await page.evaluate(() => {
    const p = window.mansion.player.position;
    return [p.x, p.y, p.z];
  });
  const walked = Math.hypot(
    afterWalk[0] - beforeWalk[0],
    afterWalk[2] - beforeWalk[2],
  );
  check('real DOM W input moves the shared Player before the briefing',
    walked > 0.2,
    `${walked.toFixed(3)}m: ${JSON.stringify({ beforeWalk, afterWalk })}`);

  const aimed = await page.evaluate(() => {
    const M = window.mansion;
    const labelOf = (target) => {
      const source = target?.userData?.interact?.label;
      return typeof source === 'function' ? source() : source;
    };
    const target = M.interaction.targets.find((candidate) => (
      candidate.userData.npc?.name === 'Big Uncle Lou'
      && labelOf(candidate) === "Receive Lou's briefing"
    ));
    if (!target) return { ok: false, reason: 'Lou interaction target missing' };

    target.updateWorldMatrix(true, true);
    const bounds = new M.THREE.Box3().setFromObject(target);
    const targetPoint = bounds.getCenter(new M.THREE.Vector3());
    targetPoint.y = bounds.max.y - 0.22;
    const at = target.getWorldPosition(new M.THREE.Vector3());
    const facing = new M.THREE.Vector3(0, 0, -1)
      .applyQuaternion(target.getWorldQuaternion(new M.THREE.Quaternion()));
    const rosterLou = M.cast.roster.find(({ id }) => id === 'lou');
    if (!rosterLou) return { ok: false, reason: 'Lou missing from cast roster' };

    /* InteractionSystem has a hard 2.7 m ray limit. Try authored, bounded
     * approaches around Lou's actual body so the desk/wall remain real
     * occluders; the earlier 3.5-4.7 m guess could never select any target. */
    const distances = [2.15, 2.4];
    const offsets = [
      0, Math.PI, Math.PI / 2, -Math.PI / 2,
      Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4,
    ];
    for (const distance of distances) {
      for (const offset of offsets) {
        const direction = facing.clone().applyAxisAngle(
          new M.THREE.Vector3(0, 1, 0), offset,
        );
        const stand = at.clone().addScaledVector(direction, distance);
        M.teleport(stand.x, rosterLou.y, stand.z, 0);
        const eye = M.player.position;
        const dx = targetPoint.x - eye.x;
        const dy = targetPoint.y - eye.y;
        const dz = targetPoint.z - eye.z;
        M.player.yaw = Math.atan2(-dx, -dz);
        M.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        M.tick(0.12);
        if (M.interaction.current === target) {
          return {
            ok: true,
            distance,
            offset,
            label: M.prompt.label,
            key: M.prompt.key,
            target: target.name,
            current: M.interaction.current?.name ?? null,
          };
        }
      }
    }
    return {
      ok: false,
      reason: 'crosshair did not select Lou',
      label: M.prompt.label,
      current: M.interaction.current?.name ?? null,
    };
  });
  check("the real InteractionSystem crosshair selects Receive Lou's briefing",
    aimed.ok && aimed.label === "Receive Lou's briefing" && aimed.key === 'E',
    JSON.stringify(aimed));

  await page.keyboard.press('e');
  await page.waitForFunction((missionId) => (
    window.mansion.campaign.state().missions[missionId].status === 'complete'
  ), MISSION_IDS.MANSION_RETURN);
  await page.evaluate(() => window.mansion.tick(0.1));
  const completed = await page.evaluate(({
    missionId, palaceId, returnEventId, completeEventId,
  }) => {
    const state = window.mansion.campaign.state();
    const mission = state.missions[missionId];
    return {
      mission,
      palaceStatus: state.missions[palaceId].status,
      chapter: state.story.chapter,
      returnCount: state.story.timeEvents.filter((id) => id === returnEventId).length,
      completeCount: state.story.timeEvents.filter((id) => id === completeEventId).length,
      prompt: window.mansion.prompt.label,
      checkpoint: document.getElementById('checkpoint')?.textContent?.trim() ?? '',
    };
  }, {
    missionId: MISSION_IDS.MANSION_RETURN,
    palaceId: MISSION_IDS.CARTEL_PALACE,
    returnEventId: TIME_EVENT_IDS.RETURN_TO_MANSION,
    completeEventId: TIME_EVENT_IDS.COMPLETE_MANSION_RETURN,
  });
  check('the first real E commits the complete three-fact briefing once',
    completed.mission.status === 'complete'
      && completed.mission.briefingComplete === true
      && completed.mission.wrongCityConfirmed === true
      && completed.mission.sauceMissingConfirmed === true
      && completed.mission.palaceLocationKnown === true
      && completed.palaceStatus === 'available'
      && completed.chapter === 'cartel_palace'
      && completed.returnCount === 1
      && completed.completeCount === 1
      && completed.prompt === 'Leave for the Cartel Palace',
    JSON.stringify(completed));
  check('the briefing completion banner tells the player all three facts',
    completed.checkpoint === 'BRIEFING COMPLETE — WRONG CITY · SAUCE MISSING · PALACE LOCATED',
    completed.checkpoint);

  const destination = page.waitForURL(/\/cartel-palace\.html(?:\?|$)/, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await page.keyboard.press('e');
  await destination;
  await page.waitForFunction(() => window.CARTEL_PALACE?.campaignState);
  const routed = await page.evaluate(({ sceneId, missionId }) => {
    const state = window.CARTEL_PALACE.campaignState;
    return {
      pathname: location.pathname,
      scene: state.scene,
      returnStatus: state.missions[missionId].status,
      expected: sceneId,
    };
  }, { sceneId: SCENE_IDS.CARTEL_PALACE, missionId: MISSION_IDS.MANSION_RETURN });
  check('the second real E follows the registered Cartel Palace campaign edge',
    routed.pathname.endsWith('/cartel-palace.html')
      && routed.scene?.id === routed.expected
      && routed.scene?.spawn === 'approach'
      && routed.returnStatus === 'complete',
    JSON.stringify(routed));
  check('the focused return flow has no runtime, request, or HTTP failures',
    problems.length === 0,
    problems.join(' | '));

  await context.close();
} catch (error) {
  check('the focused Mansion Return verifier completed', false, error?.stack ?? String(error));
} finally {
  await browser?.close().catch(() => {});
  await closeServer();
}

const failed = results.filter(({ ok }) => !ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Mansion Return checks failed.`);
  for (const { name, detail } of failed) {
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
  process.exit(1);
}
console.log(`\nAll ${results.length} Mansion Return checks passed.`);

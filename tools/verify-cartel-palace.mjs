#!/usr/bin/env node
/**
 * Focused browser proof for CARTEL PALACE.
 *
 * Every authored preview checkpoint boots in a fresh document, starts through
 * the real scene button, and is inspected through the runtime's public debug
 * surface. The canonical campaign namespace is seeded with a sentinel first:
 * Cartel Palace must use PreviewMemoryStorage and leave that byte untouched.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5244;
const SENTINEL = '{"canonical":"cartel palace preview must not touch this"}';
const CHECKPOINTS = Object.freeze([
  'approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear',
]);
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Cartel Palace.');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
  });
  response.end(await fsp.readFile(file));
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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.addInitScript((sentinel) => {
  localStorage.setItem('squatchlife.campaign', sentinel);
}, SENTINEL);

const problems = [];
const notFound = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 260));
});
page.on('response', (response) => {
  if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  for (const checkpoint of CHECKPOINTS) {
    const href = `http://localhost:${PORT}/cartel-palace.html?preview=1&checkpoint=${checkpoint}`;
    await page.goto(href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'menu', null, {
      timeout: 180000,
    });
    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'active', null, {
      timeout: 180000,
    });
    await page.waitForTimeout(180);

    const state = await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      const snapshot = runtime.snapshot();
      const environment = runtime.geometry();
      return {
        checkpoint: runtime.checkpoint,
        snapshot,
        campaignScene: runtime.campaignState.scene.id,
        campaignMission: runtime.campaignState.missions.cartel_palace,
        materialLanguage: runtime.palace.materialLanguage,
        evidence: runtime.evidence(),
        loadout: runtime.loadout.items,
        selected: runtime.loadout.selected,
        guards: runtime.cast.guards.length,
        mark: {
          role: runtime.cast.mark.role,
          maxHealth: runtime.cast.mark.actor.maxHealth,
          armor: runtime.cast.mark.actor.armor,
          down: runtime.cast.mark.actor.incapacitated,
        },
        sauce: {
          role: runtime.cast.sauce.role,
          down: runtime.cast.sauce.actor.incapacitated,
        },
        doors: runtime.palace.state(),
        extractionVisible: runtime.palace.targets.extractionGate.visible,
        geometry: {
          meshes: environment.meshes,
          groups: environment.groups,
          namedMeshes: environment.namedMeshes,
          colliders: environment.colliders,
          solidWaterworks: environment.solidWaterworks,
          zones: Object.fromEntries(Object.entries(environment.zones)
            .map(([name, zone]) => [name, { meshes: zone.meshes, bounds: zone.bounds }])),
        },
        previewNotice: Boolean(document.getElementById('squatch-preview-notice')),
        canonical: localStorage.getItem('squatchlife.campaign'),
        bootFailed: !document.getElementById('bootFailure')?.hidden,
      };
    });

    const evidenceExpected = ['betrayal', 'dining_room', 'clear'].includes(checkpoint) ? 3 : 0;
    check(`${checkpoint}: boots the bounded mission checkpoint`,
      state.checkpoint === checkpoint
        && state.snapshot.beat === checkpoint
        && state.campaignScene === 'cartel_palace'
        && state.campaignMission.status === 'in_progress',
      JSON.stringify({ checkpoint: state.checkpoint, mission: state.campaignMission }));
    check(`${checkpoint}: keeps the evidence trail and world state coherent`,
      state.snapshot.evidenceFound.length === evidenceExpected
        && Object.values(state.evidence).filter(Boolean).length === evidenceExpected
        && state.materialLanguage === 'stucco-stone-clay-tile-courtyard'
        && state.geometry.colliders >= 20,
      JSON.stringify({ evidence: state.snapshot.evidenceFound, geometry: state.geometry }));
    check(`${checkpoint}: exposes the real refined environment inventory`,
      state.geometry.meshes >= 750
        && state.geometry.groups >= 90
        && state.geometry.namedMeshes / state.geometry.meshes >= 0.85
        && Object.keys(state.geometry.zones).sort().join(',')
          === 'ceilings,courtyard,dining,gallery,guestSuite,office,security'
        && Object.values(state.geometry.zones).every((zone) => zone.meshes > 0)
        && state.geometry.solidWaterworks.sort().join(',')
          === 'courtyard-fountain-collider,reflecting-pool-collider',
      JSON.stringify({
        meshes: state.geometry.meshes,
        groups: state.geometry.groups,
        namedMeshes: state.geometry.namedMeshes,
        zones: Object.fromEntries(Object.entries(state.geometry.zones).map(([name, zone]) => [name, zone.meshes])),
        solidWaterworks: state.geometry.solidWaterworks,
      }));
    check(`${checkpoint}: uses the shared final-raid combat contract`,
      state.loadout.length === 5
        && state.loadout.filter(Boolean).length >= 3
        && state.selected >= 0 && state.selected < 5
        && state.guards >= 8
        && state.mark.role === 'boss'
        && state.mark.maxHealth >= 400
        && state.sauce.role === 'traitor',
      JSON.stringify({ loadout: state.loadout, guards: state.guards, mark: state.mark }));
    check(`${checkpoint}: remains an isolated developer preview`,
      state.previewNotice && state.canonical === SENTINEL && !state.bootFailed,
      JSON.stringify({ previewNotice: state.previewNotice, bootFailed: state.bootFailed }));

    if (checkpoint === 'approach') {
      await page.evaluate(() => {
        const runtime = window.CARTEL_PALACE;
        runtime.player.position.set(19.2, 1.66, 63.1);
        runtime.player.yaw = 0;
        runtime.player.pitch = -0.27;
        runtime.player.update(0);
      });
      await page.waitForFunction(() => {
        const runtime = window.CARTEL_PALACE;
        return runtime.interaction.current === runtime.palace.targets.powerBox;
      });
      await page.keyboard.down('e');
      await page.waitForFunction(() => window.CARTEL_PALACE.snapshot().beat === 'perimeter');
      await page.keyboard.up('e');
      const route = await page.evaluate(() => ({
        mission: window.CARTEL_PALACE.snapshot(),
        doors: window.CARTEL_PALACE.palace.state(),
        facadeLightIntensity: window.CARTEL_PALACE.palace.lights
          .filter((light) => light.name === 'courtyard-wall-lantern-light')
          .map((light) => light.intensity),
        facadeBulbColors: (() => {
          const colors = [];
          window.CARTEL_PALACE.palace.root.traverse((object) => {
            if (object.name === 'courtyard-lantern-bulb') colors.push(object.material.color.getHex());
          });
          return colors;
        })(),
      }));
      check('approach: the real E-hold target cuts power and opens the route',
        route.mission.beat === 'perimeter'
          && route.mission.powerCut
          && route.doors.serviceGateOpen
          && route.facadeLightIntensity.length === 4
          && route.facadeLightIntensity.every((intensity) => intensity === 0)
          && route.facadeBulbColors.length === 4
          && route.facadeBulbColors.every((color) => color === 0x080909),
        JSON.stringify(route));
    }

    if (checkpoint === 'clear') {
      check('clear: both targets are down and the player still activates extraction',
        state.mark.down && state.sauce.down
          && state.snapshot.markEliminated && state.snapshot.sauceEliminated
          && state.extractionVisible && !state.doors.extractionOpen,
        JSON.stringify({ mark: state.mark, sauce: state.sauce, doors: state.doors }));
      await page.evaluate(() => {
        const runtime = window.CARTEL_PALACE;
        runtime.player.position.set(0, 1.66, -50.25);
        runtime.player.yaw = 0;
        runtime.player.pitch = 0;
        runtime.player.update(0);
      });
      await page.waitForFunction(() => {
        const runtime = window.CARTEL_PALACE;
        return runtime.interaction.current === runtime.palace.targets.extractionGate;
      });
      await page.keyboard.down('e');
      await page.waitForFunction(() => window.CARTEL_PALACE.phase === 'complete');
      await page.keyboard.up('e');
      const departure = await page.evaluate(() => ({
        palace: window.CARTEL_PALACE.campaignState.missions.cartel_palace.status,
        initiation: window.CARTEL_PALACE.campaignState.missions.initiation.status,
        chapter: window.CARTEL_PALACE.campaignState.story.chapter,
      }));
      check('clear: the real E-hold extraction completes Palace and unlocks Initiation',
        departure.palace === 'complete'
          && departure.initiation === 'available'
          && departure.chapter === 'big_night',
        JSON.stringify(departure));
    }
  }

  check('all Palace resources load without browser errors',
    problems.length === 0 && notFound.length === 0,
    JSON.stringify({ problems, notFound }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\nCARTEL PALACE ${results.length - failed}/${results.length} checks passed.`);
process.exitCode = failed ? 1 : 0;

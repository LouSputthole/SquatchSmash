#!/usr/bin/env node
/**
 * Deterministic visual review of the real Mansion Siege page.
 *
 * Usage:
 *   node tools/shots-mansion-siege.mjs before
 *   node tools/shots-mansion-siege.mjs after
 *
 * The six views are public mission positions, staged through the page's
 * verifier handle. The script never reaches into builder-private geometry.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54931;
const PASS = (process.argv[2] || 'review').replace(/[^a-z0-9_-]/gi, '-');
const SHOT_ID = String(process.env.SHOT_ID || '').trim();
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-09', 'siege-refinement');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = requestPath === '/' ? 'mansion-siege.html' : requestPath.replace(/^\/+/, '');
    const absolute = path.resolve(ROOT, relative);
    if (!absolute.startsWith(ROOT)) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    const bytes = await fsp.readFile(absolute);
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(absolute)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

fs.mkdirSync(OUT, { recursive: true });
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const notFound = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() === 404) notFound.push(response.url());
});

async function shot({ id, x, y, z, yaw, pitch }) {
  await page.evaluate((view) => {
    const siege = window.mansionSiege;
    siege.teleport(view.x, view.y, view.z, view.yaw);
    siege.player.pitch = view.pitch;
    siege.tick(0.65);
    siege.setRendering(true);
  }, { x, y, z, yaw, pitch });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(OUT, `${PASS}-${id}.png`),
    animations: 'disabled',
    timeout: 180000,
  });
  await page.evaluate(() => window.mansionSiege.setRendering(false));
}

try {
  await page.goto(
    `http://127.0.0.1:${PORT}/mansion-siege.html?preview=1&checkpoint=briefed`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 120000 });
  await page.click('#startBtn', { timeout: 120000 });
  await page.waitForFunction(() => window.mansionSiege?.running, null, { timeout: 120000 });
  await page.evaluate(() => {
    const siege = window.mansionSiege;
    siege.setState('under_attack');
    siege.setInvulnerable(true);
    siege.tick(1.2);
  });

  const views = [
    /* Off-axis so the fountain remains a foreground landmark instead of
     * hiding the facade battle line it is meant to frame. */
    { id: 'forecourt', x: -12, y: 0, z: 14, yaw: 209, pitch: -0.02 },
    { id: 'foyer', x: 0, y: 1.2, z: 37.7, yaw: 180, pitch: -0.03 },
    /* The owner's exact blocker views: the body in the foyer's west pocket,
     * then the east flight looking toward the Flamingo-Mega gallery roster
     * and firing-step lamp, and the same bay from the stair head. */
    /* Inside the foyer glazing, close enough to judge silhouette, limb-floor
     * contact and whether the shared pool escapes the dark gown. */
    { id: 'dead-performer', x: -5.6, y: 1.2, z: 36.9, yaw: 119, pitch: -0.48 },
    { id: 'east-stair-ascent', x: 7.15, y: 3.0, z: 44.25, yaw: 0, pitch: 0.04 },
    /* Actual player ascent: north up the flight toward the two live security
     * posts at the landing, rather than the reverse view down into the foyer. */
    { id: 'east-stair-defenders', x: 7.15, y: 4.0, z: 45.5, yaw: 180, pitch: 0.12 },
    { id: 'east-stair-head', x: 7.15, y: 6.0, z: 48.55, yaw: 0, pitch: -0.02 },
    { id: 'foyer-fire', x: 2, y: 1.2, z: 42, yaw: 315, pitch: -0.05 },
    { id: 'gallery', x: 0, y: 6, z: 51.2, yaw: 0, pitch: -0.25 },
    { id: 'gallery-operations', x: 0, y: 6, z: 48.7, yaw: 180, pitch: -0.05 },
    { id: 'office', x: 0, y: 6, z: 64.4, yaw: 180, pitch: -0.06 },
  ];
  const selectedViews = SHOT_ID ? views.filter((view) => view.id === SHOT_ID) : views;
  if (!selectedViews.length) throw new Error(`Unknown Mansion Siege SHOT_ID: ${SHOT_ID}`);
  for (const view of selectedViews) await shot(view);

  const inventory = await page.evaluate(() => {
    const siege = window.mansionSiege;
    const THREE = siege.THREE;
    siege.scene.updateMatrixWorld(true);
    const boundsOf = (object) => {
      if (!object) return null;
      object.updateMatrixWorld?.(true);
      const box = new THREE.Box3().setFromObject(object);
      const xyz = (v) => v.toArray().map((n) => Number(n.toFixed(4)));
      return { min: xyz(box.min), max: xyz(box.max) };
    };
    const eastPartition = siege.interior.root.getObjectByName('east-partition-front-solid');
    const performer = siege.dressing.props.bodies.performer;
    const blood = performer.blood?.pool
      || performer.group.getObjectByName('siege.body.performer.blood');
    const groups = {};
    for (const name of siege.addedNames()) {
      const entry = siege.damage.entry(name);
      let meshes = 0;
      entry?.object?.traverse?.((object) => { if (object.isMesh) meshes += 1; });
      groups[name] = meshes;
    }
    return {
      state: siege.state,
      groups,
      visibleLights: siege.perf.visibleLights,
      framesRendered: siege.framesRendered,
      contextLost: siege.renderer.getContext().isContextLost(),
      geometry: {
        eastPartition: boundsOf(eastPartition),
        galleryRoster: boundsOf(siege.interior.props.gallery.roster),
        austinMajor: boundsOf(siege.interior.props.lounge.cowboy.group),
        worklamp: boundsOf(siege.dressing.props.firingStep.group
          .getObjectByName('siege.step.worklamp')),
        performer: boundsOf(performer.figure.root),
        performerBlood: boundsOf(blood),
      },
      ensemble: [...siege.ensemble.members.values()].map((member) => ({
        id: member.id,
        visible: member.root.visible,
        x: Number(member.root.position.x.toFixed(3)),
        y: Number(member.root.position.y.toFixed(3)),
        z: Number(member.root.position.z.toFixed(3)),
      })),
      landingDefenders: [...siege.ensemble.members.values()]
        .filter((member) => member.root.visible
          && Math.abs(member.root.position.y - 6) < 0.25
          && member.root.position.z >= 48.4
          && member.root.position.z <= 52)
        .map((member) => member.id),
    };
  });
  const evidence = {
    pass: PASS,
    views: selectedViews.map(({ id }) => `${PASS}-${id}.png`),
    inventory,
    notFound: [...new Set(notFound)],
    pageErrors,
  };
  fs.writeFileSync(
    path.join(OUT, `${PASS}-evidence.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (evidence.notFound.length || evidence.pageErrors.length || evidence.inventory.contextLost) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

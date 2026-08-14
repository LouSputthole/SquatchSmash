#!/usr/bin/env node
/**
 * CARTEL PALACE endurance soak.
 *
 * The playtest report was "the mission crashes after about thirty seconds".
 * A scene whose checks all boot, assert and exit inside two seconds can be
 * completely green while the thing a player actually does -- stand in the
 * courtyard with the alarm up and shoot -- takes the page down. This drives
 * the real page with real input for a real duration and watches the three
 * things that kill a Three.js scene: an uncaught error, a frame loop that
 * stops advancing, and unbounded allocation.
 *
 *   node tools/soak-cartel-palace.mjs [--seconds=120] [--checkpoint=estate]
 *
 * Exits non-zero on any uncaught error, a stalled frame counter, or growth
 * past the object/geometry/material budgets below.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5246;
const args = new Map(process.argv.slice(2)
  .filter((value) => value.startsWith('--'))
  .map((value) => {
    const [name, ...rest] = value.slice(2).split('=');
    return [name, rest.join('=') || 'true'];
  }));
const SECONDS = Number(args.get('seconds') || 120);
const CHECKPOINT = String(args.get('checkpoint') || 'estate');
const SAMPLE_MS = 2000;

/* Budgets. Every one of these is a pooled system with a declared capacity, so
 * a soak that ends inside them proves the pools are actually being reused. */
const BUDGET = Object.freeze({
  objectGrowth: 260,
  geometryGrowth: 96,
  materialGrowth: 96,
  textureGrowth: 24,
  heapGrowthMb: 190,
});

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
  console.error('playwright is not installed; cannot soak Cartel Palace.');
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
    '--js-flags=--expose-gc',
  ],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });

const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
});
page.on('crash', () => problems.push('the page process crashed'));

let failed = false;
function check(name, ok, detail = '') {
  if (!ok) failed = true;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const sample = () => page.evaluate(() => {
  const runtime = window.CARTEL_PALACE;
  const info = runtime.renderer.info;
  let objects = 0;
  runtime.renderer.domElement.ownerDocument; // keep the traversal honest about the live tree
  const root = runtime.palace.root.parent;
  root.traverse(() => { objects++; });
  return {
    frame: info.render.frame,
    calls: info.render.calls,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    objects,
    phase: runtime.phase,
    beat: runtime.snapshot().beat,
    alarm: runtime.security.alarm,
    rounds: runtime.security.stats.roundsFired,
    heapMb: performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    listeners: runtime.combatAudio.audio._activeSources?.size ?? null,
  };
});

try {
  const href = `http://localhost:${PORT}/cartel-palace.html?preview=1&checkpoint=${CHECKPOINT}`;
  console.log(`soaking ${CHECKPOINT} for ${SECONDS}s at ${href}`);
  await page.goto(href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'menu', null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'active', null, { timeout: 180000 });

  await page.mouse.click(320, 200);
  await page.waitForFunction(() => (
    document.pointerLockElement === document.getElementById('scene')
  ), null, { timeout: 15000 }).catch(() => {});

  /* Put the fight on immediately: the reported crash is combat-shaped, and a
   * soak that spends two minutes on a quiet patrol proves nothing about it. */
  await page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    runtime.security.raiseAlarm('gunshot');
    for (const entry of runtime.cast.all) entry.active = !entry.down;
  });

  const first = await sample();
  const samples = [first];
  const started = Date.now();
  let tick = 0;
  await page.keyboard.down('w');
  while (Date.now() - started < SECONDS * 1000) {
    tick++;
    /* Real held input, real mouse motion, real trigger. */
    await page.mouse.move(320 + Math.sin(tick) * 40, 200 + Math.cos(tick) * 12);
    if (tick % 4 === 0) {
      await page.keyboard.up('w');
      await page.keyboard.down('s');
    } else if (tick % 4 === 2) {
      await page.keyboard.up('s');
      await page.keyboard.down('w');
    }
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(320);
    await page.mouse.up({ button: 'left' });
    await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      runtime.weapons.reload();
      /* Keep the driver alive. This player walks a fixed W/S line into nine
       * hostiles for two minutes without ever taking cover, and the security
       * detail now actually converges and shoots -- the first honest run of
       * this soak ended at t+72s with phase "dead" and the last 48 seconds
       * soaking a quiet corpse scene. The soak measures the ENGINE, and a
       * dead player stops the firefight that is the load, so the driver is
       * stage-managed immortal: topped up while still alive, never revived,
       * so a genuine death path would still fail the playable check. */
      if (!runtime.playerActor.incapacitated) {
        runtime.playerActor.health = runtime.playerActor.maxHealth;
        runtime.playerActor.armor = runtime.playerActor.maxArmor;
      }
    });
    await page.waitForTimeout(Math.max(0, SAMPLE_MS - 320));
    const next = await sample().catch((error) => {
      problems.push(`sample failed: ${error.message}`);
      return null;
    });
    if (!next) break;
    samples.push(next);
    process.stdout.write(
      `    t+${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s  `
      + `frame ${next.frame}  obj ${next.objects}  geo ${next.geometries}  `
      + `tex ${next.textures}  prog ${next.programs}  `
      + `heap ${next.heapMb ?? '?'}MB  rounds ${next.rounds}\n`,
    );
  }
  await page.keyboard.up('w').catch(() => {});
  await page.keyboard.up('s').catch(() => {});
  await page.mouse.up({ button: 'left' }).catch(() => {});

  const last = samples.at(-1);
  const frames = samples.map((entry) => entry.frame);
  const stalled = frames.some((value, index) => index > 0 && value <= frames[index - 1]);

  check('the scene survives the soak with no uncaught error',
    problems.length === 0, problems.slice(0, 6).join(' | '));
  check('the frame loop advances across every sample',
    !stalled && last.frame > first.frame,
    JSON.stringify({ first: first.frame, last: last.frame, frames }));
  check('the scene graph stays bounded',
    last.objects - first.objects <= BUDGET.objectGrowth,
    JSON.stringify({ first: first.objects, last: last.objects }));
  check('geometry, material programs and textures stay bounded',
    last.geometries - first.geometries <= BUDGET.geometryGrowth
      && last.textures - first.textures <= BUDGET.textureGrowth
      && last.programs - first.programs <= BUDGET.materialGrowth,
    JSON.stringify({
      geometries: [first.geometries, last.geometries],
      textures: [first.textures, last.textures],
      programs: [first.programs, last.programs],
    }));
  if (first.heapMb != null && last.heapMb != null) {
    check('the JS heap stays bounded',
      last.heapMb - first.heapMb <= BUDGET.heapGrowthMb,
      JSON.stringify({ first: first.heapMb, last: last.heapMb }));
  }
  check('the mission is still playable at the end of the soak',
    last.phase === 'active', JSON.stringify({ phase: last.phase, beat: last.beat }));
  /* The reported "crash after about thirty seconds" was boot-guard.js
   * dropping its opaque did-not-finish-loading panel over a healthy scene:
   * pure DOM, no thrown error, frame loop still advancing -- invisible to
   * every other check here. The watchdog fires at t+30s, and this soak runs
   * well past it, so the panel still being hidden at the end proves the guard
   * found the scene's published global. */
  const bootPanel = await page.evaluate(() => {
    const panel = document.getElementById('bootFailure');
    return {
      present: Boolean(panel),
      hidden: panel?.hidden === true,
      title: panel?.querySelector('[data-boot-title]')?.textContent ?? '',
    };
  }).catch(() => ({ present: false, hidden: false, title: 'evaluate failed' }));
  const elapsedSeconds = Math.round((Date.now() - started) / 1000);
  check('the thirty-second boot guard never covered the running scene',
    bootPanel.present && bootPanel.hidden && elapsedSeconds > 31,
    JSON.stringify({ ...bootPanel, elapsedSeconds }));
  /* The alarm is staged before the loop starts, so a soak in which nobody
   * fired a round soaked a mission where combat never ran -- the exact shape
   * of the "guards stand at their posts forever" defect. Endurance proven on
   * a quiet scene is not endurance. */
  check('the staged firefight actually happened during the soak',
    last.alarm === true && last.rounds > 0,
    JSON.stringify({ alarm: last.alarm, roundsFired: last.rounds }));
} catch (error) {
  failed = true;
  console.error(`  FAIL  soak threw: ${error.message}`);
  if (problems.length) console.error(`        page problems: ${problems.slice(0, 6).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

process.exit(failed ? 1 : 0);

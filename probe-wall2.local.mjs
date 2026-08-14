#!/usr/bin/env node
/* Reproduce the verifier's wall-perception check on the live page, instrumented. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 5743;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const { chromium } = await import('playwright');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('nf'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
try {
  await page.goto(`http://localhost:${PORT}/mansion-siege.html?preview=1`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 240000 });
  await page.waitForFunction(() => window.mansionSiege.framesRendered > 3, null, { timeout: 240000 });
  await page.evaluate(() => window.mansionSiege.start());
  await page.waitForFunction(() => window.mansionSiege.running === true, null, { timeout: 120000 });
  await page.evaluate(() => {
    const s = window.mansionSiege;
    s.setInvulnerable(true);
    s.setRendering(false);
    s.jumpToCheckpoint('briefed');
    s.skipDialogue();
    s.teleport(0, 6, 46.4, 180);
    s.equip('carbine');
    const fired = s.beats.line();
    s.tick(3);
    window.__lineFired = fired;
  });
  const diag = await page.evaluate(() => {
    const s = window.mansionSiege;
    return { fired: window.__lineFired, beat: s.beat,
      standing: [...s.mission.waves.one.standing],
      poolIds: s.attackers.all().filter((e) => e.active).map((e) => e.id) };
  });
  console.log('diag', JSON.stringify(diag));
  const out = await page.evaluate(() => {
    const s = window.mansionSiege;
    const THREE = s.THREE;
    const ids = s.attackers.all().filter((e) => e.active && e.order?.wave).map((e) => e.id);
    const shooter = s.attackers.entry(ids[1]) ?? s.attackers.entry(ids[0]);
    const wall = new THREE.Box3(new THREE.Vector3(8, 0, 30.6), new THREE.Vector3(12, 3.4, 31.4));
    const snapshot = s.attackers.snapshot();
    const originalRandom = Math.random;
    try {
      for (const entry of s.attackers.all()) {
        entry.active = entry === shooter;
        entry.root.visible = entry === shooter;
      }
      s.teleport(10, 0, 29, 180);
      shooter.root.position.set(10, 0, 33);
      shooter.floorY = 0;
      shooter.figure.baseY = 0;
      shooter.path.length = 0;
      shooter.goal.copy(shooter.root.position);
      shooter.root.rotation.y = Math.PI * 0.6;
      shooter.target = null;
      shooter.targetVisible = false;
      shooter.lastSeen.set(0, 0, 0);
      shooter.memory = 0;
      shooter.areaTarget = null;
      shooter.awareness = 0;
      shooter.sinceThink = 1;
      shooter.lastShot = null;
      shooter.roundsFired = 0;
      shooter.weapon.cooldown = 0;
      shooter.weapon.reloading = 0;
      shooter.weapon.magazine = shooter.weapon.definition.magazineSize;
      shooter.root.updateMatrixWorld(true);
      const context = {
        player: { position: s.player.position, actor: s.playerActor },
        colliders: [wall],
        alive: [],
        playerDamageScale: 0,
      };
      Math.random = () => 0;
      const trace = [];
      for (let i = 0; i < 150; i++) {
        s.attackers.update(1 / 60, context);
        if (false) {
          trace.push({
            i,
            visible: shooter.targetVisible,
            target: shooter.target?.actor?.id ?? null,
            rounds: shooter.roundsFired,
            aware: +Number(shooter.awareness).toFixed(2),
            pos: [+shooter.root.position.x.toFixed(2), +shooter.root.position.y.toFixed(2), +shooter.root.position.z.toFixed(2)],
            playerPos: [+s.player.position.x.toFixed(2), +s.player.position.y.toFixed(2), +s.player.position.z.toFixed(2)],
            muzzleH: +Number(shooter.muzzleHeight).toFixed(2),
          });
        }
      }
      context.colliders.length = 0;
      shooter.root.rotation.y = Math.PI * 0.6;
      shooter.sinceThink = 1;
      const clearTrace = [];
      for (let i = 0; i < 360 && !shooter.lastShot; i++) {
        s.attackers.update(1 / 60, context);
        if (i % 60 === 0) {
          clearTrace.push({
            i,
            visible: shooter.targetVisible,
            target: shooter.target?.actor?.id ?? null,
            aware: +Number(shooter.awareness).toFixed(3),
            rounds: shooter.roundsFired,
            yaw: +Number(shooter.root.rotation.y).toFixed(2),
            playerPos: [+s.player.position.x.toFixed(2), +s.player.position.y.toFixed(2), +s.player.position.z.toFixed(2)],
            shooterPos: [+shooter.root.position.x.toFixed(2), +shooter.root.position.y.toFixed(2), +shooter.root.position.z.toFixed(2)],
            suppression: +Number(shooter.suppression?.value ?? 0).toFixed(2),
          });
        }
      }
      return { id: shooter.id, role: shooter.role?.id, order: shooter.order?.wave ?? null,
        clearTrace, lastShot: shooter.lastShot ? { blocked: shooter.lastShot.blocked } : null,
        beat: s.beat, standing: ids.length, hunt: s.mission.huntActive };
    } finally {
      Math.random = originalRandom;
      s.attackers.restore(snapshot);
    }
  });
  const fired = await page.evaluate(() => window.__lineFired);
  console.log('line fired:', fired);
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); server.close(); }

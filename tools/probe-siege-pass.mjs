#!/usr/bin/env node
/**
 * Measuring probe for the 2026-08-13 siege playtest pass.
 *
 * Not a verifier -- it asserts nothing. It boots the real scene and reports the
 * numbers behind four of the owner's playtest notes, so a fix can be argued
 * from a measurement rather than from a reading of the source:
 *
 *   guns     the world up-vector and bore of every armed figure's weapon
 *   corpses  where a dead attacker's lowest rendered point sits against the
 *            floor he died on
 *   downed   what a protected friendly's rig is doing after he goes down
 *   shots    optional screenshots of the foyer centrepiece and the gallery
 *
 * Usage:  node tools/probe-siege-pass.mjs [guns|corpses|downed|shots|all]
 *         PORT=nnnn to move the server.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* `PROBE_ROOT` lets a before/after pass serve an archived checkout of the
 * repo while the probe itself (and playwright) stay in the live worktree. */
const ROOT = process.env.PROBE_ROOT
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5297;
const WHAT = new Set((process.argv[2] ?? 'all').split(','));
const SHOT_DIR = process.env.SHOT_DIR
  || path.join(ROOT, 'docs', 'validation', '2026-08-13-siege-pass');
const SHOT_TAG = process.env.SHOT_TAG || 'after';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

const { chromium } = await import('playwright');

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
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (error) => console.error('  PAGE ERROR', error.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  CONSOLE', m.text().slice(0, 200)); });

const evaluate = (fn, arg) => page.evaluate(fn, arg);

async function shot(name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${SHOT_TAG}-${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled', timeout: 300000 });
  console.log(`  shot ${file}`);
  return file;
}

try {
  await page.goto(`http://localhost:${PORT}/mansion-siege.html?preview=1`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansionSiege.framesRendered > 3, null, { timeout: 240000 });
  await evaluate(() => window.mansionSiege.start());
  await evaluate(() => window.mansionSiege.setInvulnerable(true));
  /* `briefed` + the line, not the `wave_one` checkpoint: that checkpoint is
   * THE LULL, when everybody wave one owns is already down -- a corpse probe
   * there measures an empty room. The line starts wave 1A walking in. */
  await evaluate(() => window.mansionSiege.jumpToCheckpoint('briefed'));
  await evaluate(() => window.mansionSiege.skipDialogue());
  await evaluate(() => window.mansionSiege.beats.line());
  await evaluate(() => window.mansionSiege.tick(2));

  if (WHAT.has('guns') || WHAT.has('all')) {
    const guns = await evaluate(() => {
      const S = window.mansionSiege;
      const T = S.THREE;
      const out = [];
      const up = new T.Vector3();
      const bore = new T.Vector3();
      const q = new T.Quaternion();
      const read = (label, id, gun) => {
        if (!gun) return;
        gun.updateWorldMatrix(true, false);
        gun.getWorldQuaternion(q);
        up.set(0, 1, 0).applyQuaternion(q);
        bore.set(0, 0, -1).applyQuaternion(q);
        out.push({
          side: label,
          id,
          weapon: gun.userData.siegeWeaponId ?? gun.name,
          upY: +up.y.toFixed(3),
          boreY: +bore.y.toFixed(3),
          visible: gun.visible,
        });
      };
      for (const [id, member] of S.ensemble.members) read('friendly', id, member.gun);
      for (const entry of S.attackers.living()) read('hostile', entry.id, entry.gun);
      return out;
    });
    console.log('\nGUNS  (upY should be POSITIVE: sights up. boreY ~0: pointing along the floor)');
    for (const g of guns) {
      console.log(`  ${g.upY > 0 ? 'up  ' : 'DOWN'}  ${g.side.padEnd(8)} ${String(g.id).padEnd(22)} ${String(g.weapon).padEnd(9)} upY=${String(g.upY).padStart(7)} boreY=${String(g.boreY).padStart(7)} visible=${g.visible}`);
    }
    const inverted = guns.filter((g) => g.upY < 0);
    console.log(`  ${inverted.length} of ${guns.length} weapons are upside down.`);
  }

  if (WHAT.has('corpses') || WHAT.has('all')) {
    const corpses = await evaluate(async () => {
      const S = window.mansionSiege;
      const T = S.THREE;
      S.tick(6);
      const living = S.attackers.all()
        .filter((entry) => entry.active && !entry.actor.incapacitated)
        .slice(0, 6);
      for (const entry of living) {
        S.attackers.registerHit?.({
          object: entry.figure.parts.body,
          point: entry.root.position.clone().setY(entry.root.position.y + 1.2),
          normal: new T.Vector3(0, 0, 1),
          damage: 9999,
        }, { playerShot: true });
        if (!entry.actor.incapacitated) {
          entry.actor.applyHit({ amount: 9999, attacker: { faction: 'crew' }, playerShot: true });
          entry.root.userData.onDown?.({ fatal: true });
        }
      }
      S.tick(2);
      const out = [];
      const lowest = (object, visibleOnly) => {
        let winner = null;
        const walk = (node, shown) => {
          const visible = shown && node.visible !== false;
          if (visibleOnly && !visible) return;
          if (node.isMesh) {
            const box = new T.Box3().setFromObject(node);
            if (Number.isFinite(box.min.y) && (!winner || box.min.y < winner.y)) {
              winner = { y: box.min.y, name: node.name || node.type };
            }
          }
          for (const child of node.children) walk(child, visible);
        };
        walk(object, true);
        return winner;
      };
      for (const entry of living) {
        entry.root.updateWorldMatrix(true, true);
        const all = lowest(entry.root, false);
        const shown = lowest(entry.root, true);
        const parts = {};
        for (const key of ['body', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR']) {
          const part = entry.figure?.parts?.[key];
          if (!part) continue;
          const box = new T.Box3().setFromObject(part);
          if (Number.isFinite(box.min.y)) parts[key] = +box.min.y.toFixed(3);
        }
        out.push({
          id: entry.id,
          allMinY: all ? +all.y.toFixed(3) : null,
          allName: all?.name ?? null,
          shownMinY: shown ? +shown.y.toFixed(3) : null,
          shownName: shown?.name ?? null,
          rootY: +entry.root.position.y.toFixed(3),
          baseY: +(entry.figure?.baseY ?? NaN).toFixed(3),
          down: entry.root.userData.down === true,
          parts,
        });
      }
      return out;
    });
    console.log('\nCORPSES  (shownMinY should equal baseY: the lowest RENDERED point on the floor)');
    for (const c of corpses) {
      const gap = c.shownMinY - c.baseY;
      console.log(`  ${Math.abs(gap) > 0.05 ? 'FLOAT' : 'ok   '}  ${c.id.padEnd(16)} shown=${String(c.shownMinY).padStart(7)} (${c.shownName}) all=${String(c.allMinY).padStart(7)} (${c.allName}) baseY=${String(c.baseY).padStart(7)} gap=${gap.toFixed(3)} down=${c.down}`);
      const clearances = Object.entries(c.parts)
        .map(([part, y]) => `${part}=${(y - c.baseY).toFixed(3)}`).join(' ');
      console.log(`         clearance above floor: ${clearances}`);
    }
  }

  if (WHAT.has('downed') || WHAT.has('all')) {
    const downed = await evaluate(async () => {
      const S = window.mansionSiege;
      const member = S.ensemble.members.get('booski');
      member.actor.applyHit({ amount: 9999, attacker: { faction: 'cartel' }, matrix: null });
      const samples = [];
      const grab = () => {
        const p = member.figure.parts;
        return {
          pose: member.figure.pose,
          tiltX: +member.figure.tilt.rotation.x.toFixed(3),
          bodyY: +p.body.position.y.toFixed(4),
          armR: +p.armR.rotation.x.toFixed(3),
          head: +p.head.rotation.x.toFixed(3),
          x: +member.root.position.x.toFixed(3),
          z: +member.root.position.z.toFixed(3),
        };
      };
      for (let i = 0; i < 10; i++) { S.tick(0.1); samples.push(grab()); }
      for (let i = 0; i < 8; i++) { S.tick(1); samples.push(grab()); }
      return samples;
    });
    console.log('\nDOWNED  (does anything move after he lands?)');
    for (const [i, s] of downed.entries()) {
      console.log(`  ${String(i).padStart(2)}  pose=${s.pose.padEnd(7)} tiltX=${String(s.tiltX).padStart(6)} bodyY=${String(s.bodyY).padStart(8)} armR=${String(s.armR).padStart(6)} head=${String(s.head).padStart(6)} at ${s.x},${s.z}`);
    }
  }

  if (WHAT.has('shots') || WHAT.has('all')) {
    /* The foyer centrepiece, from the front door looking north at it. */
    await evaluate(() => window.mansionSiege.teleport(0, 1.2, 38.4, 180));
    await evaluate(() => window.mansionSiege.tick(0.4));
    await shot('foyer-centrepiece');
    /* The gallery: guns in hands, at the rail. */
    await evaluate(() => window.mansionSiege.teleport(2.2, 6.0, 52.5, 180));
    await evaluate(() => window.mansionSiege.tick(0.4));
    await shot('gallery-hands');
    /* The triage station prompt. */
    await evaluate(() => window.mansionSiege.teleport(3.85, 6.0, 52.0, 180));
    await evaluate(() => window.mansionSiege.tick(0.4));
    await shot('triage-prompt');
  }
} finally {
  await browser.close();
  server.close();
}

#!/usr/bin/env node
/**
 * STAND ON THE BALCONY AND SEE WHETHER THE FIGHT COMES TO YOU.
 *
 * Not a verifier -- a playtest, driven. It puts the Prospect on the firing
 * step, says the line, runs both waves in real ticks and reports where the
 * cartel actually ends up: which room, how near the rail, how many reach the
 * landing, how many never get inside, and how far the player would have to
 * walk to reach the nearest man.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = '/home/user/SquatchSmash/.claude/worktrees/agent-a325b4c6ab07f4978';
const PORT = Number(process.env.PORT) || 5931;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });

try {
  await page.goto(`http://localhost:${PORT}/mansion-siege.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 90000 });
  await page.evaluate(() => window.mansionSiege.setRendering(false));
  await page.click('#startBtn');
  await page.waitForFunction(() => window.mansionSiege.running, null, { timeout: 20000 });
  await page.evaluate(() => window.mansionSiege.tick(2.4));

  const CADENCE = Number(process.env.KILL_EVERY) || 2.5;
  const report = await page.evaluate(async (cadence) => {
    const s = window.mansionSiege;
    const nav = await import('/src/mansion/siege/nav.js');
    s.setInvulnerable(true);
    /* Straight to the top of the stairs: armed, briefed, on the step. The
     * route up is verify-mansion-siege.mjs's job; this is about the fight. */
    s.beats.armory();
    s.beats.arm();
    s.beats.office();
    s.beats.briefed();
    const post = s.route.defencePost;
    const px = (post.x0 + post.x1) / 2;
    const pz = (post.z0 + post.z1) / 2 - 0.4;
    s.teleport(px, 6.0, pz, 180);
    s.tick(0.3);
    s.equip('saw');
    const said = s.beats.line();

    const samples = [];
    const nearest = [];
    const roomsSeen = new Map();
    let peakOnLanding = 0;
    let everOnLanding = new Set();
    let everInside = new Set();

    const player = s.player.position;
    function sample(label) {
      const rows = s.attackers.all()
        .filter((e) => e.active && !e.actor.incapacitated)
        .map((e) => {
          const p = e.root.position;
          const room = nav.roomAt(p) ?? 'nowhere';
          roomsSeen.set(room, (roomsSeen.get(room) ?? 0) + 1);
          if (room === 'gallery' || room === 'balcony') everOnLanding.add(e.id);
          if (room !== 'forecourt' && room !== 'steps' && room !== 'lawn_east' && room !== 'lawn_west') everInside.add(e.id);
          return {
            id: e.id, role: e.role.id, room,
            d: +Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z).toFixed(1),
            path: e.path.length, dest: e.destination, replans: e.replans, rec: e.recovered,
          };
        });
      const onLanding = rows.filter((r) => r.room === 'gallery' || r.room === 'balcony').length;
      peakOnLanding = Math.max(peakOnLanding, onLanding);
      const near = rows.length ? Math.min(...rows.map((r) => r.d)) : null;
      if (near != null) nearest.push(near);
      samples.push({
        label,
        alive: rows.length,
        onLanding,
        nearest: near,
        rooms: rows.reduce((acc, r) => { acc[r.room] = (acc[r.room] ?? 0) + 1; return acc; }, {}),
      });
      return rows;
    }

    /* A COMPETENT PLAYER, NOT A STATUE. Every 2.5 s of clock the nearest man
     * he can actually see takes a burst -- the real `registerHit`, the real
     * hit zones, the real armour -- so the waves clear the way they clear in
     * play and the probe measures a fight rather than a traffic jam. */
    let shotClock = 0;
    const kills = [];
    const eye = { x: player.x, y: player.y, z: player.z };
    function shoot() {
      const live = s.attackers.all().filter((e) => e.active && !e.actor.incapacitated);
      if (!live.length) return;
      live.sort((a, b) => (
        Math.hypot(a.root.position.x - eye.x, a.root.position.y - eye.y, a.root.position.z - eye.z)
        - Math.hypot(b.root.position.x - eye.x, b.root.position.y - eye.y, b.root.position.z - eye.z)
      ));
      const mark = live[0];
      const d = Math.hypot(
        mark.root.position.x - eye.x, mark.root.position.y - eye.y, mark.root.position.z - eye.z,
      );
      /* He does not shoot through the house at somebody in the trophy hall. */
      if (d > 26) return;
      for (let i = 0; i < 4; i++) s.attackers.registerHit(mark.figure.parts.body, 42, 0.35);
      if (mark.actor.incapacitated) kills.push({ id: mark.id, at: +elapsed.toFixed(1), d: +d.toFixed(1) });
    }

    let elapsed = 0;
    const beats = [];
    let lastBeat = s.beat;
    for (let i = 0; i < 120; i++) {
      s.tick(2.5);
      elapsed += 2.5;
      shotClock += 2.5;
      if (shotClock >= cadence) { shoot(); shotClock = 0; }
      if (s.beat !== lastBeat) { beats.push({ beat: s.beat, at: elapsed }); lastBeat = s.beat; }
      if (i % 2 === 0) sample(`${elapsed}s ${s.beat}`);
      if (s.beat === 'AFTERMATH' || s.beat === 'TO_SASOLE') break;
    }
    const finalRows = sample('final');
    samples.beats = beats;
    samples.kills = kills;
    samples.elapsed = elapsed;

    return {
      said,
      beat: s.beat,
      samples,
      finalRows,
      peakOnLanding,
      everOnLanding: [...everOnLanding],
      everInside: [...everInside],
      spawnedTotal: s.attackers.all().length,
      breaches: s.attackers.breaches(),
      occupancy: s.attackers.navigator.graph.capture(),
      cadence,
      playerAt: { x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2) },
      beats: samples.beats,
      kills: samples.kills,
      elapsed: samples.elapsed,
      /* Where each man was killed, and by extension where the fight was. */
      killRooms: s.attackers.all()
        .filter((e) => e.actor.incapacitated)
        .reduce((acc, e) => {
          const r = nav.roomAt(e.root.position) ?? 'nowhere';
          acc[r] = (acc[r] ?? 0) + 1; return acc;
        }, {}),
    };
  }, CADENCE);

  console.log('kill cadence: one man every', report.cadence, 's');
  console.log('player at', report.playerAt, 'line said:', report.said, 'beat', report.beat);
  console.log('\n-- where they are, every five seconds --');
  for (const s of report.samples) {
    console.log(`${s.label.padEnd(9)} alive ${String(s.alive).padStart(2)}  landing ${String(s.onLanding).padStart(2)}  nearest ${String(s.nearest ?? '-').padStart(5)}m  ${JSON.stringify(s.rooms)}`);
  }
  console.log('\nbeats:', report.beats.map((b) => `${b.beat}@${b.at}s`).join(' > '));
  console.log('total clock:', report.elapsed, 's; kills:', report.kills.length);
  console.log('where they died:', JSON.stringify(report.killRooms));
  console.log('kill ranges (m):', report.kills.map((k) => k.d).join(', '));
  console.log('\npeak on the landing at once:', report.peakOnLanding);
  console.log('men who ever reached the landing:', report.everOnLanding.length, 'of', report.spawnedTotal);
  console.log('men who ever got inside:', report.everInside.length);
  console.log('breaches:', report.breaches.map((b) => `${b.staging}/${b.opening}`).join(', ') || 'none');
  console.log('\n-- final standing --');
  for (const r of report.finalRows) {
    console.log(`  ${r.id.padEnd(12)} ${r.role.padEnd(10)} ${r.room.padEnd(11)} ${String(r.d).padStart(5)}m  path ${r.path}  dest ${r.dest}  replans ${r.replans} rec ${r.rec}`);
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

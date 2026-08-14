#!/usr/bin/env node
/**
 * Decode-probe: Silver Pines' recorded dialogue, measured rather than assumed.
 *
 *   node tools/probe-golf-dialogue-audio.mjs      (PORT=nnnn to override)
 *
 * Two questions, both answered on the real page with the real engine:
 *
 *   1. Do the 353 recorded golf cues DECODE? All three hole prefixes are
 *      loaded and counted against the manifest × index, and
 *      `AudioEngine.failedCues` must stay empty (a 404, a truncated file or a
 *      decode failure lands there by name, with a reason).
 *
 *   2. Do the conversation trees PLAY? The arrival tree and the first-tee
 *      tree are driven the way a player answers them, and every playback the
 *      engine schedules on a decoded buffer is logged. The trees' spoken
 *      beats route through CueQueue.say → playRecordedGolfCue and the
 *      replies through onChoice → playRecordedGolfChoice; a line that only
 *      subtitles would show up here as said-but-never-played
 *      (ENGINE-TRAPS.md 3).
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5361;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg',
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/golf.html?preview=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
await page.locator('#start-btn').click({ timeout: 5000 }).catch(() => page.evaluate('window.__golf.boot()'));
await page.waitForFunction('window.__golf.round.beat !== undefined', null, { timeout: 30000 });

// Wait for the start manifest slice, then pull in all three hole banks and
// measure decode coverage against what the manifest and file index promise.
const residency = await page.evaluate(async () => {
  const g = window.__golf;
  await g.audio._manifestLoadPromise;
  for (const prefix of ['vo.golf.h1.', 'vo.golf.h2.', 'vo.golf.h3.']) {
    await g.audio.loadAdditional({ prefixes: [prefix] }).catch(() => {});
  }
  const manifest = await (await fetch('/assets/sfx/manifest.json')).json();
  const index = await (await fetch('/assets/sfx/index.json')).json();
  const available = new Set(index.files || []);
  const recorded = (manifest.sfx || [])
    .filter((cue) => cue.name.startsWith('vo.golf.')
      && available.has(cue.file || `${cue.name}.mp3`))
    .map((cue) => cue.name);
  const missing = recorded.filter((name) => (g.audio.buffers.get(name)?.length ?? 0) === 0);
  return {
    ready: g.audio.ready,
    recorded: recorded.length,
    decoded: recorded.length - missing.length,
    missing: missing.slice(0, 10),
    failedCues: g.audio.failedCues,
  };
});
console.log(`decode coverage: ${residency.decoded}/${residency.recorded} recorded golf cues decoded`);
if (residency.missing.length) console.log('  missing:', residency.missing.join(', '));
if (residency.failedCues.length) console.log('  failedCues:', JSON.stringify(residency.failedCues));

const out = await page.evaluate(async () => {
  const g = window.__golf;
  const trace = { voPlayed: [], choiceLog: [], nodeLog: [], sayLog: [] };

  /* One continuous tap on the engine itself, so a playback can never fall
   * between two snapshots of the bounded diagnostics log. */
  const origPlay = g.audio.play.bind(g.audio);
  g.audio.play = (name, opts) => {
    const src = origPlay(name, opts);
    if (String(name).startsWith('vo.golf.') && src) trace.voPlayed.push(name);
    return src;
  };
  // Tap dialogue traversal
  const origGo = g.dialogue.go.bind(g.dialogue);
  g.dialogue.go = (id) => { trace.nodeLog.push(id); return origGo(id); };
  const origChoose = g.dialogue.choose.bind(g.dialogue);
  g.dialogue.choose = (i) => {
    const opt = g.dialogue.options[i];
    const ok = origChoose(i);
    if (ok) trace.choiceLog.push(opt?.cue ?? opt?.text ?? null);
    return ok;
  };
  const origSay = g.cues.hooks.say;
  g.cues.hooks.say = (cue, secs) => { trace.sayLog.push(cue.id); return origSay(cue, secs); };

  const nearLou = () => {
    const lou = g.golfers.lou.position;
    g.teleport(lou.x + 1.5, lou.z + 1.5);
    g.dialogue.update(0, g.player.position);
  };

  // ARRIVAL conversation, restarted cleanly: answer every reply as a player would.
  nearLou();
  g.round.cues.suppressBanter(true);
  g.dialogue.start(g.round.scripts.arrival, 'open', g.golfers.lou.npc ?? null);
  for (let i = 0; i < 600 && g.dialogue.active; i++) {
    if (g.dialogue.options.length) { nearLou(); g.dialogue.choose(0); }
    g.step(0.1);
    nearLou();
  }
  for (let i = 0; i < 400 && g.cues.busy; i++) g.step(0.1);
  trace.arrivalEndReason = g.dialogue.lastEndReason;

  // Take the bag, walk to the tee, sit through the first-tee conversation.
  g.round.takeBag();
  const t = g.LAYOUT.teeMarks.ball;
  for (let i = 0; i < 200 && g.cues.busy; i++) g.step(0.1);
  g.teleport(t.x, t.z + 4);
  for (let i = 0; i < 3000; i++) {
    g.step(0.1);
    if (g.round.beat === 'npc_tee' || g.round.beat === 'player_tee') break;
    if (g.dialogue.active && g.dialogue.options.length) {
      nearLou();
      g.dialogue.choose(0);
    }
  }
  g.audio.play = origPlay;
  g.dialogue.go = origGo;
  g.dialogue.choose = origChoose;
  g.cues.hooks.say = origSay;
  trace.beat = g.round.beat;
  trace.heardInvitation = g.round.heardInvitation;
  return trace;
});
console.log('arrival end reason:', out.arrivalEndReason);
console.log('cue-queue say():', JSON.stringify(out.sayLog));
console.log('nodes:', JSON.stringify(out.nodeLog));
console.log('choices:', JSON.stringify(out.choiceLog));
console.log('beat:', out.beat, 'heardInvitation:', out.heardInvitation);
console.log('vo playbacks:', out.voPlayed.join(', ') || 'NONE');

const playedVo = new Set(out.voPlayed);
const silent = [
  ...out.sayLog.filter((id) => !playedVo.has(`vo.${id}`)),
  ...out.choiceLog.filter((id) => id && id !== '…' && !playedVo.has(`vo.${id}`)),
];
const ok = residency.recorded > 0
  && residency.decoded === residency.recorded
  && residency.failedCues.length === 0
  && out.heardInvitation === true
  && playedVo.size > 0
  && silent.length === 0;
console.log(silent.length ? `SILENT lines: ${silent.join(', ')}` : 'every driven line played its take');
console.log(ok ? 'PROBE PASS' : 'PROBE FAIL');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);

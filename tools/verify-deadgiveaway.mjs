#!/usr/bin/env node
/**
 * verify:deadgiveaway — one whole round of Dead Giveaway, three real browsers.
 *
 * docs/DEAD-GIVEAWAY.md § Verification. Starts the authoritative server from
 * ../Squatch-Bunker/dead-giveaway-server (or DG_SERVER_DIR) on a free port,
 * serving THIS checkout as its static root, opens three browsers (one context
 * each) with fake camera and microphone, and plays to RESOLVE through the real UI:
 *
 *   A opens a table from the lobby card; B and C join it by typing the code.
 *   All three turn on mic and camera. A deals.
 *   Every clue is typed into the clue box and sent with Enter, by whichever
 *   page the server says has the turn. Everybody presses Ready to vote.
 *   One Family member votes by CLICKING THE RAT IN 3D (the seat rig pick, in
 *   whatever capture mode headless Chromium lands in); the other picks him
 *   from the list; the Rat votes for somebody. The Rat is caught, picks a
 *   word on the big board, and confirms.
 *
 * and asserts:
 *   - the same 16 words, in the same order, on all three 3D boards;
 *   - exactly one Rat; the Family's boards light the target and the Rat's
 *     lights nothing (3D board state AND the B overlay);
 *   - clues land in seat order from startSeat, on the felt card at each seat
 *     and in the clue list;
 *   - every page passes through VOTE_RESULT and ROLE_REVEAL before
 *     LAST_WORD, and the reveal panel names the Rat;
 *   - the chip stacks match every player's lives on every page, and the one
 *     that changed is the loser's seat;
 *   - the media mesh connects and remote faces wear live video;
 *   - no page error on any page.
 *
 * The server is a separate package (Squatch-Bunker/dead-giveaway-server).
 * Resolution order: DG_SERVER_DIR, then ../Squatch-Bunker/dead-giveaway-server
 * beside this checkout, else a shallow sparse clone of DG_SERVER_GIT (the
 * public Squatch-Bunker repo) into the OS temp dir, reused across runs, with
 * `npm ci --omit=dev` run there once. A runner that can reach neither FAILS
 * the gate: a verifier that passes without booting the scene proves nothing.
 * DG_SKIP_IF_NO_SERVER=1 restores the old skip for an offline developer box.
 *
 *   node tools/verify-deadgiveaway.mjs
 *   DG_SHOT_DIR=/tmp/shots node tools/verify-deadgiveaway.mjs     (phase screenshots)
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_GIT = process.env.DG_SERVER_GIT || 'https://github.com/LouSputthole/Squatch-Bunker.git';
const SERVER_REF = process.env.DG_SERVER_REF || 'main';
const SERVER_DIR = resolveServerDir();
const SHOT_DIR = process.env.DG_SHOT_DIR || path.join(os.tmpdir(), 'deadgiveaway-verify');
const BOOT_TIMEOUT = Number(process.env.DG_BOOT_TIMEOUT_MS) || 180000;
const STEP_TIMEOUT = Number(process.env.DG_STEP_TIMEOUT_MS) || 180000;

function giveUp(why) {
  if (process.env.DG_SKIP_IF_NO_SERVER === '1') {
    console.log(`verify:deadgiveaway SKIPPED (DG_SKIP_IF_NO_SERVER=1) — ${why}`);
    process.exit(0);
  }
  console.error(`verify:deadgiveaway FAILED before boot — ${why}`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

function hasServer(dir) {
  return fs.existsSync(path.join(dir, 'src', 'server.js'));
}

/** DG_SERVER_DIR, the sibling checkout, or a cached shallow clone of the public repo. */
function resolveServerDir() {
  const explicit = process.env.DG_SERVER_DIR && path.resolve(process.env.DG_SERVER_DIR);
  if (explicit) {
    if (!hasServer(explicit)) giveUp(`DG_SERVER_DIR=${explicit} has no src/server.js`);
    return explicit;
  }
  const sibling = path.join(ROOT, '..', 'Squatch-Bunker', 'dead-giveaway-server');
  if (hasServer(sibling)) return sibling;

  const cache = path.join(os.tmpdir(), 'squatchsmash-dead-giveaway-server');
  const pkg = path.join(cache, 'dead-giveaway-server');
  if (!hasServer(pkg)) {
    fs.rmSync(cache, { recursive: true, force: true });
    console.log(`verify:deadgiveaway: no server beside this checkout; cloning ${SERVER_GIT} (${SERVER_REF}) into ${cache}`);
    const clone = run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', SERVER_REF, SERVER_GIT, cache]);
    if (!clone.ok) giveUp(`git clone failed: ${clone.out.split('\n').slice(-3).join(' | ')}`);
    const sparse = run('git', ['sparse-checkout', 'set', 'dead-giveaway-server'], cache);
    if (!sparse.ok || !hasServer(pkg)) giveUp(`sparse checkout of dead-giveaway-server failed: ${sparse.out.split('\n').slice(-3).join(' | ')}`);
  }
  return pkg;
}

function ensureServerDeps(dir) {
  if (fs.existsSync(path.join(dir, 'node_modules', 'socket.io'))) return;
  console.log(`verify:deadgiveaway: installing server dependencies in ${dir}`);
  const lock = fs.existsSync(path.join(dir, 'package-lock.json'));
  const r = run('npm', [lock ? 'ci' : 'install', '--omit=dev', '--no-audit', '--no-fund'], dir);
  if (!r.ok || !fs.existsSync(path.join(dir, 'node_modules', 'socket.io'))) giveUp(`npm install in ${dir} failed: ${r.out.split('\n').slice(-5).join(' | ')}`);
}

ensureServerDeps(SERVER_DIR);
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  return Boolean(ok);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function health(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/dg/health', timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(res.statusCode === 200 && /"ok":\s*true/.test(body)));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const port = Number(process.env.DG_PORT) || await freePort();
const serverLog = [];
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: SERVER_DIR,
  env: { ...process.env, DG_STATIC_DIR: ROOT, DG_PORT: String(port), DG_HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));
let serverExited = false;
server.on('exit', () => { serverExited = true; });

async function stopServer() {
  if (serverExited) return;
  server.kill('SIGTERM');
  await new Promise((r) => { const t = setTimeout(r, 3000); server.once('exit', () => { clearTimeout(t); r(); }); });
}

for (let i = 0; i < 100 && !(await health(port)); i++) {
  if (serverExited) break;
  await new Promise((r) => setTimeout(r, 150));
}
if (!(await health(port))) {
  console.error('The Dead Giveaway server did not come up:\n' + serverLog.join(''));
  await stopServer();
  process.exit(1);
}
console.log(`server up on :${port}, serving ${ROOT}`);

/* A fake microphone that TALKS. Chromium's default fake capture is a beep
 * that its noise suppression flattens to silence, so the voice detector
 * never fires. This is a 140 Hz voice with ten harmonics in 1.2 s phrases
 * 0.9 s apart -- enough to read as speech to the engine's AnalyserNode. */
function writeTalkWav(file) {
  const rate = 48000;
  const seconds = 6;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f0 = 140 + 30 * Math.sin(t * 2.3);
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    /* 1.2 s phrases, 0.9 s apart, eased in and out, with a syllable wobble. */
    const k = (t % 2.1) / 1.2;
    const phrase = k < 1 ? Math.sin(Math.PI * k) ** 0.3 : 0;
    const syllable = 0.7 + 0.3 * Math.sin(2 * Math.PI * 5 * t);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * 0.55 * phrase * syllable)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}
const TALK_WAV = path.join(SHOT_DIR, 'talk.wav');
writeTalkWav(TALK_WAV);

/* One BROWSER per player, not one browser with three contexts: on a
 * software rasteriser the three pages would otherwise share one GPU process
 * and render strictly in turn. Three processes is also closer to the truth --
 * three people on three machines. */
const LAUNCH = {
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${TALK_WAV}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
};
const browsers = [];

const URL_BASE = `http://127.0.0.1:${port}/deadgiveaway.html`;
const pageErrors = [];
const people = [
  { tag: 'A', name: 'Lou', character: 'lou' },
  { tag: 'B', name: 'Booski', character: 'booski' },
  { tag: 'C', name: 'Sauce', character: 'sauce' },
];

let exitCode = 0;
const shots = [];
async function shot(page, label) {
  const file = path.join(SHOT_DIR, `${label}.png`);
  try {
    await page.screenshot({ path: file, timeout: 240000 });
    shots.push(file);
  } catch (error) {
    console.log(`  note  screenshot ${label} failed: ${error.message.split('\n')[0]}`);
  }
}

/**
 * A real mouse click on a selector. The action panel is rebuilt when the
 * snapshot changes (somebody else votes), and on a software rasteriser a
 * frame can take seconds, so Playwright's "stable for two frames" check can
 * lose the element under it. Retry on a fresh lookup, then click where it is.
 */
async function tap(page, selector) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.click(selector, { timeout: 30000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

const state = (p) => p.page.evaluate(() => {
  const s = window.DEAD_GIVEAWAY?.state;
  return s ? JSON.parse(JSON.stringify(s)) : null;
});
async function waitPhase(p, phases, timeout = STEP_TIMEOUT) {
  const want = [].concat(phases);
  await p.page.waitForFunction((w) => w.includes(window.DEAD_GIVEAWAY?.state?.phase), want, { timeout, polling: 100 });
  return state(p);
}

try {
  /* ---------------- boot three pages ---------------- */
  for (const p of people) {
    const browser = await launchChromium(LAUNCH);
    browsers.push(browser);
    p.context = await browser.newContext({ viewport: { width: 1100, height: 620 }, permissions: ['microphone', 'camera'] });
    p.page = await p.context.newPage();
    p.page.setDefaultTimeout(STEP_TIMEOUT);
    p.page.on('pageerror', (e) => pageErrors.push(`${p.tag}: ${e.message}`));
    p.page.on('console', (m) => { if (m.type() === 'error') console.log(`  ${p.tag} console.error: ${m.text().slice(0, 200)}`); });
    await p.page.goto(URL_BASE, { waitUntil: 'commit' });
  }
  for (const p of people) {
    await p.page.waitForFunction(() => window.DEAD_GIVEAWAY?.client, null, { timeout: BOOT_TIMEOUT });
    const failed = await p.page.evaluate(() => !document.getElementById('bootFailure').hidden);
    check(`${p.tag} boots deadgiveaway.html (DEAD_GIVEAWAY published, no boot failure)`, !failed);
  }
  await shot(people[0].page, '01-lobby-empty');

  /* ---------------- lobby: create, join ---------------- */
  async function enter(p, { code = null } = {}) {
    await p.page.fill('[data-dg="name"]', p.name);
    await tap(p.page, `.dg-character[data-character="${p.character}"]`);
    if (code) {
      await p.page.fill('[data-dg="code"]', code);
      await tap(p.page, '[data-dg="join"]');
    } else {
      await tap(p.page, '[data-dg="create"]');
    }
    await p.page.waitForFunction(() => window.DEAD_GIVEAWAY?.state?.code, null, { timeout: STEP_TIMEOUT });
  }
  const [A, B, C] = people;
  await enter(A);
  const code = (await state(A)).code;
  check('A opened a table and got a five-character code', /^[A-HJ-NP-Z2-9]{5}$/.test(code), code);
  await enter(B, { code });
  await enter(C, { code });
  await A.page.waitForFunction(() => window.DEAD_GIVEAWAY.state.players.filter((q) => q.connected).length === 3, null, { timeout: STEP_TIMEOUT });
  /* Spread round the table by picking chairs on the lobby's seat ring, so
   * the screenshots look across the felt at faces instead of at a
   * neighbour's shoulder -- and so the seat pick itself is exercised. */
  for (const [p, seat] of [[B, 3], [C, 5]]) {
    await tap(p.page, `.dg-seat[data-seat="${seat}"]`);
    const moved = await p.page.waitForFunction((s) => {
      const st = window.DEAD_GIVEAWAY.state;
      return st.players.find((q) => q.id === st.me.playerId)?.seat === s;
    }, seat, { timeout: STEP_TIMEOUT }).then(() => true, () => false);
    check(`${p.tag} moved to chair ${seat + 1} from the lobby's seat ring`, moved);
  }
  for (const p of people) {
    const s = await state(p);
    p.id = s.me.playerId;
    p.seat = s.players.find((q) => q.id === p.id).seat;
  }
  check('three players at three different seats', new Set(people.map((p) => p.seat)).size === 3, people.map((p) => `${p.tag}@${p.seat}`).join(' '));

  /* ---------------- media ---------------- */
  for (const p of people) {
    await tap(p.page, '[data-dg="media-start"]');
  }
  for (const p of people) {
    const started = await p.page.waitForFunction(() => window.DEAD_GIVEAWAY.media?.debug?.().started === true, null, { timeout: STEP_TIMEOUT })
      .then(() => true, () => false);
    check(`${p.tag} mic and camera started from the media panel`, started);
  }
  await A.page.waitForFunction(() => window.DEAD_GIVEAWAY.state.players.every((q) => q.mic && q.cam), null, { timeout: STEP_TIMEOUT })
    .then(() => check('the roster shows mic and camera on for all three', true), () => check('the roster shows mic and camera on for all three', false));
  const mesh = await A.page.waitForFunction(() => {
    const peers = window.DEAD_GIVEAWAY.media?.peers?.() ?? [];
    return peers.length === 2 && peers.every((q) => q.state === 'connected');
  }, null, { timeout: STEP_TIMEOUT }).then(() => true, () => false);
  check('A has a connected peer connection to B and to C', mesh,
    JSON.stringify(await A.page.evaluate(() => window.DEAD_GIVEAWAY.media?.peers?.() ?? [])));
  const faces = await A.page.waitForFunction(() => window.DEAD_GIVEAWAY.faces.size === 2, null, { timeout: STEP_TIMEOUT }).then(() => true, () => false);
  check('A sees live camera video on both remote heads', faces, `${await A.page.evaluate(() => window.DEAD_GIVEAWAY.faces.size)} attached`);
  const speaking = await A.page.waitForFunction((ids) => ids.some((id) => window.DEAD_GIVEAWAY.seats.entryOf(id)?.speaking),
    [B.id, C.id], { timeout: STEP_TIMEOUT }).then(() => true, () => false);
  check("A sees a remote player's speaking cue (voice detection relayed to the seat)", speaking);
  await A.page.evaluate(() => window.DEAD_GIVEAWAY.lobby.collapse(true));
  await A.page.waitForTimeout(1500);
  await shot(A.page, '02-lobby-seated');

  /* ---------------- deal ---------------- */
  for (const p of people) {
    await p.page.evaluate(() => {
      window.__dgPhases = [];
      window.DEAD_GIVEAWAY.client.on('state', (s) => {
        if (window.__dgPhases.at(-1) !== s.phase) window.__dgPhases.push(s.phase);
      });
    });
  }
  await A.page.evaluate(() => window.DEAD_GIVEAWAY.lobby.collapse(false));
  /* The lobby re-renders on the next `state` after the third join; read the
   * button once it has settled rather than on the first paint. */
  const startEnabled = await A.page.waitForSelector('[data-dg="start"]:not([disabled])', { timeout: 8000 })
    .then(() => true, () => false);
  check("the host's Deal button is live at three players", startEnabled);
  await tap(A.page, '[data-dg="start"]');
  for (const p of people) await waitPhase(p, 'CLUES');
  const dealt = await Promise.all(people.map(async (p) => ({
    s: await state(p),
    board: await p.page.evaluate(() => window.DEAD_GIVEAWAY.boardState()),
  })));
  const words0 = JSON.stringify(dealt[0].s.card.words);
  check('16 words, identical and in the same order, on all three', dealt.every((d) => d.s.card.words.length === 16 && JSON.stringify(d.s.card.words) === words0
    && JSON.stringify(d.board.words) === words0), dealt[0].s.card.category);
  const rats = people.filter((p, i) => dealt[i].s.me.role === 'rat');
  check('exactly one Rat', rats.length === 1, rats.map((r) => r.tag).join(','));
  const rat = rats[0];
  const family = people.filter((p) => p !== rat);
  const blur = (p) => p.page.evaluate(() => document.activeElement?.blur?.());
  for (const [i, p] of people.entries()) {
    const d = dealt[i];
    /* The clue box takes focus on your turn; B is a table key, not a letter. */
    await blur(p);
    await p.page.keyboard.press('KeyB');
    const overlay = await p.page.evaluate(() => ({
      hl: [...document.querySelectorAll('#dg-board .dg-word.hl')].map((c) => Number(c.dataset.index)),
      visible: !document.getElementById('dg-board').classList.contains('hidden'),
    }));
    if (p === rat) {
      check(`the Rat (${p.tag}) sees no highlight — 3D board and overlay`, d.board.highlightIndex === null && overlay.visible && overlay.hl.length === 0,
        JSON.stringify({ board: d.board.highlightIndex, overlay }));
    } else {
      check(`Family ${p.tag} sees the target lit — 3D board and overlay`, Number.isInteger(d.s.me.targetIndex)
        && d.board.highlightIndex === d.s.me.targetIndex && overlay.hl.length === 1 && overlay.hl[0] === d.s.me.targetIndex,
      JSON.stringify({ target: d.s.me.targetIndex, board: d.board.highlightIndex, overlay }));
    }
  }
  const targets = new Set(family.map((p) => dealt[people.indexOf(p)].s.me.targetIndex));
  check('both Family members have the same target', targets.size === 1);
  await shot(family[0].page, '03-clues-family-board');
  await shot(rat.page, '03-clues-rat-board');
  for (const p of people) { await blur(p); await p.page.keyboard.press('KeyB'); }

  /* ---------------- clues ---------------- */
  const given = [];
  for (let n = 0; n < 3; n++) {
    const s = await state(A);
    if (s.phase !== 'CLUES') break;
    const turn = people.find((p) => p.seat === s.turnSeat);
    const others = people.filter((p) => p !== turn);
    const writing = await others[0].page.waitForFunction((name) => document.querySelector('[data-dg="turn"]')?.textContent.includes(`${name} is writing`), turn.name, { timeout: 15000 })
      .then(() => true, () => false);
    check(`while ${turn.tag} has the turn the others read "${turn.name} is writing…"`, writing);
    const text = ['On the rocks', 'Top shelf', 'Neat'][n];
    await turn.page.waitForSelector('[data-dg="clue-input"]', { timeout: STEP_TIMEOUT });
    await tap(turn.page, '[data-dg="clue-input"]');
    await turn.page.fill('[data-dg="clue-input"]', '');
    await turn.page.keyboard.type(text);
    if (n === 1) await shot(turn.page, '04-clue-entry');
    await turn.page.keyboard.press('Enter');
    given.push({ seat: turn.seat, text, tag: turn.tag });
    await A.page.waitForFunction((k) => (window.DEAD_GIVEAWAY.state.clues ?? []).length >= k || window.DEAD_GIVEAWAY.state.phase !== 'CLUES', n + 1, { timeout: STEP_TIMEOUT });
  }
  for (const p of people) await waitPhase(p, 'DISCUSS');
  const sDiscuss = await state(A);
  const seatsSorted = people.map((p) => p.seat).sort((a, b) => a - b);
  const startIdx = seatsSorted.indexOf(sDiscuss.startSeat);
  const expectedOrder = [...seatsSorted.slice(startIdx), ...seatsSorted.slice(0, startIdx)];
  check('clues were given in seat order from startSeat', JSON.stringify(given.map((g) => g.seat)) === JSON.stringify(expectedOrder),
    `${given.map((g) => g.seat).join(',')} vs ${expectedOrder.join(',')}`);
  for (const p of people) {
    const cards = await p.page.evaluate((seatsList) => seatsList.map((s) => window.DEAD_GIVEAWAY.clueAt(s)), given.map((g) => g.seat));
    const listed = await p.page.evaluate(() => [...document.querySelectorAll('[data-dg="clues"] li span')].map((n) => n.textContent));
    check(`${p.tag}: every clue is on the felt card at its seat and in the list, in order`,
      JSON.stringify(cards) === JSON.stringify(given.map((g) => g.text)) && JSON.stringify(listed) === JSON.stringify(given.map((g) => g.text)),
      JSON.stringify({ cards, listed }));
  }
  /* Gestures: B drinks and C smokes from the number row; A sees both play
   * on their figures (relayed as `act`). */
  for (const [p, key, kind] of [[B, 'Digit1', 'drink'], [C, 'Digit2', 'smoke']]) {
    await blur(p);
    await p.page.keyboard.press(key);
    const local = await p.page.evaluate((k) => window.DEAD_GIVEAWAY.actions.playing(k), kind);
    const seen = await A.page.waitForFunction(([k, id]) => window.DEAD_GIVEAWAY.actions.playing(k, id), [kind, p.id], { timeout: 30000, polling: 50 })
      .then(() => true, () => false);
    check(`${p.tag} pressed ${key.slice(-1)} (${kind}): it plays for him and A sees it on his figure`, local && seen);
  }
  await shot(A.page, '05-discuss');

  /* ---------------- discuss -> vote ---------------- */
  for (const p of people) await tap(p.page, '[data-dg="ready"]');
  for (const p of people) await waitPhase(p, 'VOTE');

  /* One Family member clicks the Rat in the 3D view. */
  const clicker = family[0];
  await clicker.page.evaluate((id) => window.DEAD_GIVEAWAY.lookAt(id), rat.id);
  await clicker.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const where = await clicker.page.evaluate((id) => window.DEAD_GIVEAWAY.screenOf(id), rat.id);
  const locked = await clicker.page.evaluate(() => document.pointerLockElement === window.DEAD_GIVEAWAY.renderer.domElement);
  if (locked) await clicker.page.mouse.click(640, 360);
  else await clicker.page.mouse.click(where.x, where.y);
  const picked = await clicker.page.evaluate(() => window.DEAD_GIVEAWAY.ui.selected);
  const capture = await clicker.page.evaluate(() => window.DEAD_GIVEAWAY.input.snapshot());
  check(`${clicker.tag} picked the Rat by clicking him in 3D (${capture.locked ? 'pointer lock' : capture.dragFallback ? 'drag-look' : 'free cursor'})`, picked === rat.id,
    JSON.stringify({ picked, rat: rat.id, where }));
  await shot(clicker.page, '06-vote-3d-pick');
  await tap(clicker.page, '[data-dg="confirm-vote"]');

  const lister = family[1];
  await tap(lister.page, `.dg-person[data-player="${rat.id}"]`);
  await tap(lister.page, '[data-dg="confirm-vote"]');
  await tap(rat.page, `.dg-person[data-player="${family[0].id}"]`);
  await tap(rat.page, '[data-dg="confirm-vote"]');

  const voteResult = await waitPhase(A, 'VOTE_RESULT');
  check('the count names the Rat as accused', voteResult.result?.accusedId === rat.id);
  check('the count does not name the Rat early (no ratId / roles yet)', !voteResult.result?.ratId && !voteResult.result?.roles);
  await shot(A.page, '07-vote-result');

  const reveal = await waitPhase(A, 'ROLE_REVEAL', 30000);
  check('the server reveals the Rat', reveal.result?.ratId === rat.id);
  for (const p of people) {
    await waitPhase(p, ['ROLE_REVEAL', 'LAST_WORD']);
    const rows = await p.page.evaluate(() => [...document.querySelectorAll('[data-dg="reveal"] .dg-reveal-row')]
      .map((r) => ({ id: r.dataset.player, role: r.dataset.role, text: r.textContent })));
    const ratRows = rows.filter((r) => r.role === 'rat');
    check(`${p.tag}'s reveal names every player and the Rat`, rows.length === 3 && ratRows.length === 1 && ratRows[0].id === rat.id && ratRows[0].text.includes(rat.name),
      JSON.stringify(rows));
  }
  await shot(family[1].page, '08-role-reveal');

  /* ---------------- Your Last Word ---------------- */
  await waitPhase(rat, 'LAST_WORD', 30000);
  for (const p of people) {
    const phases = await p.page.evaluate(() => window.__dgPhases);
    const iResult = phases.indexOf('VOTE_RESULT');
    const iReveal = phases.indexOf('ROLE_REVEAL');
    const iLast = phases.indexOf('LAST_WORD');
    check(`${p.tag} saw the count, then the reveal, then the Last Word`, iResult >= 0 && iReveal > iResult && iLast > iReveal, phases.join(' > '));
  }
  const boardOpen = await rat.page.evaluate(() => !document.getElementById('dg-board').classList.contains('hidden'));
  check('the big board opens for the Rat to name his word', boardOpen);
  const livesBefore = Object.fromEntries((await state(A)).players.map((q) => [q.id, q.lives]));
  await tap(rat.page, '#dg-board .dg-word[data-index="0"]');
  await shot(rat.page, '09-last-word');
  await tap(rat.page, '[data-dg="confirm-last-word"]');

  /* ---------------- resolve ---------------- */
  const resolved = [];
  for (const p of people) resolved.push(await waitPhase(p, 'RESOLVE', 30000));
  const r = resolved[0].result;
  check('the Last Word is recorded', r?.lastWord?.index === 0, JSON.stringify(r?.lastWord));
  const target = r?.targetIndex;
  for (const [i, p] of people.entries()) {
    const b = await p.page.evaluate(() => window.DEAD_GIVEAWAY.boardState());
    if (!(await p.page.evaluate(() => window.DEAD_GIVEAWAY.ui.boardOpen))) { await blur(p); await p.page.keyboard.press('KeyB'); }
    const gold = await p.page.evaluate(() => [...document.querySelectorAll('#dg-board .dg-word.reveal')].map((c) => Number(c.dataset.index)));
    check(`${p.tag}: the target word goes gold on both boards`, Number.isInteger(target) && b.revealIndex === target && gold.length === 1 && gold[0] === target,
      JSON.stringify({ target, board: b.revealIndex, gold }));
    const s = resolved[i];
    const chips = await p.page.evaluate((list) => list.map((q) => window.DEAD_GIVEAWAY.chipsAt(q.seat)), s.players);
    check(`${p.tag}: every chip stack matches that player's lives`, s.players.every((q, k) => chips[k] === q.lives),
      JSON.stringify(s.players.map((q, k) => [q.seat, q.lives, chips[k]])));
  }
  const after = resolved[0].players;
  const changed = after.filter((q) => q.lives !== livesBefore[q.id]);
  if (r?.lastWord?.correct) {
    check('the Rat named the word: nobody lost a chip', changed.length === 0 && !r.lifeLoss);
  } else {
    check("the Rat named the wrong word: his seat's stack is the only one that dropped",
      changed.length === 1 && changed[0].id === rat.id && changed[0].lives === livesBefore[rat.id] - 1 && r.lifeLoss?.playerId === rat.id,
      JSON.stringify(changed));
  }
  const resolveText = await A.page.evaluate(() => document.querySelector('[data-dg="resolve"]')?.textContent ?? '');
  check('the resolution is on screen', resolveText.length > 10, resolveText);
  await shot(A.page, '10-resolve');
  const deal = await A.page.isVisible('[data-dg="next"]');
  check("the host has Deal again", deal);
} catch (error) {
  console.error(`verify:deadgiveaway threw: ${error.stack || error}`);
  for (const p of people) if (p.page) await shot(p.page, `zz-failure-${p.tag}`);
  exitCode = 1;
} finally {
  check('no page errors on any page', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  for (const b of browsers) await b.close().catch(() => {});
  await stopServer();
}

if (shots.length) console.log(`\nscreenshots in ${SHOT_DIR}`);
const failed = results.filter((x) => !x.ok);
if (failed.length || exitCode) {
  console.error(`\n${failed.length}/${results.length} Dead Giveaway checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Dead Giveaway checks passed.`);

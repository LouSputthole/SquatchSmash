#!/usr/bin/env node
/**
 * The owner's bomb audio, measured rather than listened to.
 *
 *   npm run verify:enola-bomb-audio
 *
 * Four clips were delivered on 2026-08-06 — one falling bomb and three
 * separate blasts — with three requirements attached: the falling sound lines
 * up with the fall, the three booms hit at the same time, and the full clips
 * play. A headless browser cannot hear any of that, so nothing here asks
 * whether a sound "played". What it does instead:
 *
 *   MEASURES THE FILES. Each clip is decoded in the page through an
 *     `OfflineAudioContext`, summed to mono, and cut into 10 ms RMS windows;
 *     the onset is the first window within 6 dB of the clip's peak window.
 *     Those numbers are compared with the `BLAST_LAYERS` constants the game
 *     schedules from, so a re-delivered clip with a different lead-in fails
 *     here instead of silently smearing the boom.
 *
 *   RUNS THE MISSION ON THE AUDIO CLOCK. Everything being checked is a
 *     relationship between a SIMULATED event (a bomb arriving) and a REAL-TIME
 *     one (a buffer reaching its end), and under swiftshader this page renders
 *     at about a third of a frame a second — so the two clocks diverge by two
 *     orders of magnitude and every measurement would be a measurement of the
 *     rasteriser (ENGINE-TRAPS.md 2). The mission is therefore stepped from a
 *     driver that advances simulated time to match `AudioContext.currentTime`,
 *     which is the clock the audio scheduling actually uses, and the achieved
 *     ratio is reported. Nothing is faked: the real release, the real ballistic
 *     fall, the real `onPayloadImpact`, the real `updateDetonation`.
 *
 *   READS THE SCHEDULE AND THE OUTCOME. `EnolaMissionAudio` records how each
 *     source was scheduled (start time, how far into the buffer, expected end)
 *     and stamps what happened (when the whistle was cut, when each layer
 *     ended). An `AnalyserNode` is tapped onto each blast layer so "still
 *     audible past thirty seconds" is a measured level and not an inference.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5989;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

/** Onsets must not have drifted from what the game schedules from, in seconds. */
const ONSET_TOLERANCE = 0.03;
/** How close the end of the falling clip must be to the impact, in seconds. */
const FALL_TOLERANCE = 0.3;
/** How close the three transients must be to each other, in seconds. */
const BOOM_TOLERANCE = 0.05;
/** Seconds after the boom that the long clip must still be making sound. */
const AUDIBLE_AT = 30;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the bomb audio.');
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
    // The page starts its AudioContext from the Start click, but the click is
    // synthetic; without this the context stays suspended and its clock never
    // moves, which would make every number below zero.
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.setDefaultTimeout(180000);
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });

  await page.goto(`http://localhost:${PORT}/enolasquatch.html`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__squatch?.enolaSquatch === true, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('start-btn').click());

  /* ---- 1. the delivered clips are decoded on this page ---- */
  await page.waitForFunction(() => {
    const b = window.__enolaSquatch?.audio?.engine?.buffers;
    return !!b && ['enola.bomb.falling', 'enola.blast.a', 'enola.blast.b', 'enola.blast.c']
      .every((n) => (b.get(n)?.length ?? 0) > 0);
  }, null, { timeout: 180000 });
  const decoded = await page.evaluate(() => {
    const b = window.__enolaSquatch.audio.engine.buffers;
    return ['enola.bomb.falling', 'enola.blast.a', 'enola.blast.b', 'enola.blast.c']
      .map((n) => ({ name: n, duration: Number(b.get(n)[0].duration.toFixed(3)) }));
  });
  check('the four owner-delivered clips reach this page\'s decoder',
    decoded.length === 4 && decoded.every((d) => d.duration > 1),
    decoded.map((d) => `${d.name} ${d.duration}s`).join(', '));

  /* ---- 2. where the boom is, measured from the files themselves ---- */
  const measured = await page.evaluate(async () => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const out = [];
    for (const name of ['enola.blast.a', 'enola.blast.b', 'enola.blast.c']) {
      const bytes = await (await fetch(`/assets/sfx/${name}.mp3`)).arrayBuffer();
      const buf = await new OAC(1, 1024, 44100).decodeAudioData(bytes);
      const n = buf.length;
      const mix = new Float32Array(n);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) mix[i] += d[i] / buf.numberOfChannels;
      }
      const win = Math.round(buf.sampleRate * 0.01);
      const windows = Math.floor(n / win);
      const rms = new Float32Array(windows);
      for (let w = 0; w < windows; w++) {
        let sum = 0;
        for (let i = w * win; i < (w + 1) * win; i++) sum += mix[i] * mix[i];
        rms[w] = Math.sqrt(sum / win);
      }
      let peak = 0; let peakAt = 0;
      for (let w = 0; w < windows; w++) if (rms[w] > peak) { peak = rms[w]; peakAt = w; }
      const firstWithin = (db) => {
        const thr = peak * Math.pow(10, -db / 20);
        for (let w = 0; w < windows; w++) if (rms[w] >= thr) return w * 0.01;
        return null;
      };
      out.push({
        name,
        duration: buf.duration,
        onset: firstWithin(6),
        onset3: firstWithin(3),
        onset10: firstWithin(10),
        loudestWindow: peakAt * 0.01,
      });
    }
    return out;
  });
  const layers = await page.evaluate(async () => {
    const m = await import('/src/enolasquatch/audio.js');
    return { layers: m.BLAST_LAYERS.map((l) => ({ name: l.name, onset: l.onset })), lead: m.BOOM_LEAD };
  });
  const onsetDrift = measured.map((m) => ({
    name: m.name,
    measured: m.onset,
    scheduled: layers.layers.find((l) => l.name === m.name)?.onset ?? null,
    loudestWindow: m.loudestWindow,
    onset3: m.onset3,
    onset10: m.onset10,
  }));
  check('the boom in each clip is where the game thinks it is',
    onsetDrift.every((d) => d.scheduled !== null && Math.abs(d.measured - d.scheduled) <= ONSET_TOLERANCE),
    onsetDrift.map((d) => `${d.name}: measured ${d.measured}s (3dB ${d.onset3}, 10dB ${d.onset10}, `
      + `loudest window ${d.loudestWindow}s) vs scheduled ${d.scheduled}s`).join('\n          '));

  /* ---- 3. drive the mission on the audio clock and drop the bomb ---- */
  await page.evaluate(() => {
    const E = window.__enolaSquatch;
    /* STOP RASTERISING.
     *
     * Not an optimisation and not a shortcut past anything being checked: on
     * this box one swiftshader frame of this scene takes about 2.8 SECONDS of
     * main thread, and the main thread is where both the simulation and the
     * WebAudio scheduling live. Left alone, the page steps 0.32 simulated
     * seconds per real second and every measurement below becomes a
     * measurement of the software rasteriser (ENGINE-TRAPS.md 2). A player's
     * machine draws this in a few milliseconds; nothing about the drop, the
     * fall, the impact or the audio graph is drawn at all. The clock-ratio
     * check immediately after the drop is what proves this substitution was
     * legitimate — if simulated time and real time have parted company, the
     * run fails there rather than quietly reporting a good number.
     */
    E.renderer.render = () => {};
    E.go('release');
    const ctx = E.audio.engine.ctx;
    const audio0 = ctx.currentTime;
    const sim0 = E.mission.score.flightTime;
    window.__bombDrive = { audio0, sim0, ratio: 1 };
    /* Simulated seconds, chased to real seconds. `tick()` does not render, so
     * this is the same mission stepping at the same rate a player's machine
     * would step it, without the rasteriser deciding how fast time goes. */
    window.__bombDrive.id = setInterval(() => {
      const wall = ctx.currentTime - audio0;
      const sim = E.mission.score.flightTime - sim0;
      window.__bombDrive.ratio = wall > 1 ? sim / wall : 1;
      const owed = wall - sim;
      if (owed > 0.004) E.tick(Math.min(owed, 0.4));
    }, 30);
  });

  // The release beat is a player choice; make it, then let the real timers run.
  await page.evaluate(() => window.__enolaSquatch.mission.chooseReleaseLine('1'));
  await page.waitForFunction(() => window.__enolaSquatch.payload.released, null, { timeout: 120000 });
  const atRelease = await page.evaluate(() => {
    const E = window.__enolaSquatch;
    return {
      fall: E.mission._fallSeconds,
      lastFall: JSON.parse(JSON.stringify(E.audio.lastFall ?? null)),
      agl: E.physics.position.y - E.groundHeight(E.physics.position.x, E.physics.position.z),
      ratio: window.__bombDrive.ratio,
      // Simulated seconds at the release, so the fall can be measured in the
      // clock the PHYSICS uses as well as the one the audio uses. A gap
      // between the two is a clock problem; a gap between the prediction and
      // the simulated fall is a prediction problem, and they need telling
      // apart.
      simAt: E.mission.score.flightTime,
      // The bomb is let go five hundred metres short of where it lands, and
      // the ground is not the same height in both places. This is the pair of
      // numbers that says so.
      at: { x: E.physics.position.x, y: E.physics.position.y, z: E.physics.position.z },
      groundHere: E.groundHeight(E.physics.position.x, E.physics.position.z),
    };
  });

  await page.waitForFunction(() => window.__enolaSquatch.payload.impacted
    && window.__enolaSquatch.mission.explosionPoint, null, { timeout: 120000 });
  const atImpact = await page.evaluate(() => {
    const E = window.__enolaSquatch;
    return {
      lastFall: JSON.parse(JSON.stringify(E.audio.lastFall)),
      ratio: window.__bombDrive.ratio,
      simFall: E.mission.score.flightTime,
      /* The impact point's own y — which is the ground the bomb MET. Asking
       * the height function now would answer with the crater in it, because
       * `onPayloadImpact` digs the hole before anything else happens. */
      point: { ...E.mission.explosionPoint },
    };
  });

  check('the simulation really ran at real time (otherwise nothing below means anything)',
    atImpact.ratio > 0.97 && atImpact.ratio < 1.03,
    `simulated seconds per real second: ${atImpact.ratio.toFixed(4)}`);

  const remaining = atImpact.lastFall?.remainingAtCut ?? null;
  check(`the falling clip ends on the impact (within ${FALL_TOLERANCE}s)`,
    atImpact.lastFall?.sampled === true && remaining !== null
      && Math.abs(remaining) <= FALL_TOLERANCE,
    `predicted fall ${atRelease.fall?.toFixed(3)}s from ${atRelease.agl?.toFixed(0)}m AGL; `
    + `simulated fall ${(atImpact.simFall - atRelease.simAt).toFixed(3)}s; `
    + `clip ${atImpact.lastFall?.duration?.toFixed(3)}s started ${(atImpact.lastFall?.startAt - atImpact.lastFall?.scheduledAt).toFixed(3)}s after release, `
    + `ended ${(atImpact.lastFall?.endsAt - atImpact.lastFall?.scheduledAt).toFixed(3)}s after it; `
    + `impact came ${(atImpact.lastFall?.cutAt - atImpact.lastFall?.scheduledAt).toFixed(3)}s after it; `
    + `still to run at impact: ${remaining?.toFixed(3)}s\n          `
    + `let go at ${atRelease.at.y.toFixed(0)}m over ground at ${atRelease.groundHere?.toFixed(1)}m, `
    + `landed ${Math.hypot(atImpact.point.x - atRelease.at.x, atImpact.point.z - atRelease.at.z).toFixed(0)}m downrange `
    + `on ground at ${atImpact.point.y.toFixed(1)}m `
    + `(${(atImpact.point.y - atRelease.groundHere).toFixed(1)}m above the ground it was let go over)`);

  /* ---- 4. the three booms ---- */
  await page.waitForFunction(() => window.__enolaSquatch.audio.lastBlast?.sampled === true,
    null, { timeout: 120000 });
  // Tap each layer the instant it exists — the transient is 0.15 s away.
  await page.evaluate(() => {
    const E = window.__enolaSquatch;
    const ctx = E.audio.engine.ctx;
    window.__blastTaps = E.audio._blast.layers.map((layer) => {
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      layer.gain.connect(an);
      return { name: layer.name, an, buf: new Float32Array(an.fftSize), samples: [] };
    });
    window.__blastBoomAt = E.audio.lastBlast.boomAt;
    window.__blastSampler = setInterval(() => {
      const t = ctx.currentTime - window.__blastBoomAt;
      for (const tap of window.__blastTaps) {
        tap.an.getFloatTimeDomainData(tap.buf);
        let sum = 0;
        for (let i = 0; i < tap.buf.length; i++) sum += tap.buf[i] * tap.buf[i];
        tap.samples.push([Number(t.toFixed(2)), Math.sqrt(sum / tap.buf.length)]);
      }
    }, 200);
  });

  const schedule = await page.evaluate(() => JSON.parse(JSON.stringify(window.__enolaSquatch.audio.lastBlast)));
  const booms = schedule.layers.map((l) => {
    const m = measured.find((x) => x.name === l.name);
    // Where the transient really lands: the moment the source starts, plus how
    // far the measured onset is beyond the point the source was skipped to.
    return { name: l.name, boomAt: l.startAt + (m.onset - l.offset), offset: l.offset, startAt: l.startAt };
  });
  const spread = Math.max(...booms.map((b) => b.boomAt)) - Math.min(...booms.map((b) => b.boomAt));
  check(`the three booms land together (within ${BOOM_TOLERANCE * 1000} ms)`,
    spread <= BOOM_TOLERANCE,
    `spread ${(spread * 1000).toFixed(1)} ms — `
    + booms.map((b) => `${b.name} starts +${(b.startAt - schedule.startAt).toFixed(3)}s at buffer offset `
      + `${b.offset.toFixed(3)}s, boom at ${(b.boomAt - schedule.boomAt).toFixed(3)}s`).join('; '));

  /* ---- 5. nothing cuts them short ---- */
  const longest = Math.max(...schedule.layers.map((l) => l.endsAt - l.startAt));
  console.log(`  ..    waiting out the longest clip (${longest.toFixed(1)}s of real time)`);
  await page.waitForFunction((deadline) => {
    const E = window.__enolaSquatch;
    return E.audio.engine.ctx.currentTime > deadline;
  }, schedule.startAt + longest + 1.5, { timeout: 180000, polling: 500 });

  const ended = await page.evaluate(() => {
    clearInterval(window.__blastSampler);
    const E = window.__enolaSquatch;
    return {
      layers: JSON.parse(JSON.stringify(E.audio.lastBlast.layers)),
      taps: window.__blastTaps.map((t) => ({ name: t.name, samples: t.samples })),
      stillHeld: !!E.audio._blast,
      phase: E.mission.phase,
      failed: E.mission.failed,
    };
  });

  check('every layer plays to its natural end — nothing truncates the clips',
    ended.layers.every((l) => l.naturalEnd && l.endedAt !== null),
    ended.layers.map((l) => `${l.name}: ran ${(l.endedAt - l.startAt).toFixed(2)}s of `
      + `${(l.duration - l.offset).toFixed(2)}s available${l.naturalEnd ? '' : ' (CUT SHORT)'}`).join('\n          '));

  const audible = ended.taps.map((tap) => {
    const late = tap.samples.filter(([t]) => t >= AUDIBLE_AT && t <= AUDIBLE_AT + 5);
    const peakLate = late.length ? Math.max(...late.map(([, v]) => v)) : 0;
    const peakEarly = Math.max(0, ...tap.samples.filter(([t]) => t >= 0 && t < 4).map(([, v]) => v));
    return { name: tap.name, peakLate, peakEarly, windows: late.length };
  });
  const longClip = audible.find((a) => a.name === 'enola.blast.a');
  check(`the long clip is still making sound past ${AUDIBLE_AT}s — the 30s timeline does not end it`,
    !!longClip && longClip.windows > 0 && longClip.peakLate > 0.01,
    audible.map((a) => `${a.name}: RMS ${a.peakLate.toExponential(2)} at ${AUDIBLE_AT}-${AUDIBLE_AT + 5}s `
      + `(${a.peakEarly.toExponential(2)} at the boom, ${a.windows} windows sampled)`).join('\n          '));

  check('the mission survived the whole event',
    ended.phase !== 'idle',
    `phase ${ended.phase}${ended.failed ? `, failed: ${ended.failed}` : ''}`);

  check('no page or console errors across the run', problems.length === 0,
    problems.slice(0, 3).join(' | '));

  await page.evaluate(() => clearInterval(window.__bombDrive.id));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);

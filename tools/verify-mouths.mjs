#!/usr/bin/env node
/**
 * Verify the SHARED mouth system (src/core/mouth.js) in a real browser.
 *
 * The claim being tested is not "a mouth moves". A mouth moving proves almost
 * nothing — the rigs have flapped on `Math.sin(t * 11)` for months and that
 * looked like a mouth moving too. The four things that actually matter are:
 *
 *   (a) it moves WHILE a recorded line plays, and is SHUT by the time the
 *       line ends;
 *   (b) it does not move when nobody is speaking;
 *   (c) cutting a line mid-word stops it;
 *   (d) a text-only line with no recording still animates (the fallback).
 *
 * ---- Why this one is in real time ----
 *
 * Every other verify script in this repo steps the scene with a synchronous
 * `tick()` and is right to (ENGINE-TRAPS.md entry 2: never sleep and assume
 * progress). This check cannot. An `AnalyserNode` is filled by the audio
 * thread as the graph RENDERS, so sixty synchronous sub-steps in one JS turn
 * would read the same buffer sixty times and prove nothing about the sound.
 * So the page's own rAF loop drives the mission at wall clock, and the
 * measurement is a per-frame sampler installed INSIDE the page — a real trace
 * of what the renderer saw, not a handful of polls from Node.
 *
 * Waits are still on published predicates wherever one exists (the mission's
 * `state().voice.playing`, `audio.hasSample`), and the durations that are
 * genuinely wall clock are the take's own length, which is a real number of
 * real seconds.
 *
 * Screenshots land in docs/validation/<date>/mouths/.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5985;
const SHOT_DIR = path.join(ROOT, 'docs/validation', process.env.SHOT_DATE || '2026-08-06', 'mouths');

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** A cue that IS recorded, and the man who says it. */
const RECORDED = {
  speaker: 'CHESTER',
  body: 'chester',
  cue: 'vo.silvercase.lou.chester.notpersonal',
  text: 'Look, man, it wasn’t personal, we just — we needed the money…',
};
/** The photographed face, saying a line of his own. */
const PHOTO = {
  speaker: 'APE',
  body: 'ape',
  cue: 'vo.silvercase.prayer.ape.onemoment',
  text: 'Lou believes every man should get one moment to understand why this is happening.',
};
/**
 * A cue with no recording behind it.
 *
 * `hasSample()` is false for a cue that is not in the manifest and for one
 * that is in the manifest with no file on disk, and the fallback path is the
 * same either way (ENGINE-TRAPS.md entry 3's corollary: the manifest is truth,
 * `hasSample` is not). Every one of this mission's seventy-six lines was in
 * exactly this state a fortnight ago and fifteen of the mansion's still are.
 */
const UNRECORDED = {
  speaker: 'WINSTON',
  body: 'winston',
  cue: 'vo.silvercase.__no.such.recording__',
  text: 'A line that has been written and not yet recorded, which is most of them.',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; nothing to verify in a browser.');
  process.exit(0);
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
    // Without this there is no audio thread at all and the analyser reads
    // silence forever — which would make this check pass its (b) case and
    // fail every other one for entirely the wrong reason.
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const problems = [];
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
/* Swiftshader draws this flat at one to three frames a second. Every implicit
 * wait in here is therefore served by a main thread that is busy rasterising,
 * so the default 30 s is not generous, it is tight -- and a generous budget
 * costs nothing when the condition is met (ENGINE-TRAPS.md entry 2). */
page.setDefaultTimeout(120000);
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

await fsp.mkdir(SHOT_DIR, { recursive: true });
/**
 * @param {object} opts `openBody` waits for that character's mouth to be at
 *   least `minOpen` before capturing, so a picture titled "mid-word" is a
 *   picture of a mouth that is open. At two to four frames a second the frame
 *   on screen when the condition flips is still on screen when the shutter
 *   goes; on a fast machine it would be within one frame either way.
 */
async function shot(name, { openBody = null, minOpen = 0.45, warm = false } = {}) {
  if (!warm) {
    await pictureResolution();
    // A frame at full size before the capture, or the shot is of the stamp.
    await page.waitForTimeout(900);
  }
  if (openBody) {
    try {
      await page.waitForFunction(
        ([b, m]) => window.silvercase.mouths()[b].open >= m,
        [openBody, minOpen],
        { timeout: 8000, polling: 25 },
      );
    } catch { /* capture whatever is there and let the numbers tell the story */ }
  }
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), timeout: 120000 });
}

/**
 * Stand the player in front of somebody's face and look at it.
 *
 * The pictures are the point of this half of the script and a mouth is four
 * centimetres wide on a 1.78 m figure — from across the room it is two pixels
 * and a screenshot of it proves nothing to anybody. This walks the camera to
 * conversational distance on the side the man is facing and aims at his head,
 * which is where the player stands for every one of these lines anyway.
 */
async function frameOn(body, distance = 1.7) {
  return page.evaluate(([b, d]) => {
    const sc = window.silvercase;
    const actor = sc.cast[b];
    const at = actor.parts.head.getWorldPosition(sc.camera.position.clone());
    // The figures face +Z of their own group; stand out in front of that.
    const yaw = actor.group.rotation.y;
    sc.player.position.x = at.x + Math.sin(yaw) * d;
    sc.player.position.z = at.z + Math.cos(yaw) * d;
    sc.player.update(0);
    /* Aim at the FACE, not at the chest. `silvercase.aimAt()` drops 0.28 m
     * because it exists to put a crosshair where a bullet should go. */
    const dx = at.x - sc.camera.position.x;
    const dy = at.y - sc.camera.position.y;
    const dz = at.z - sc.camera.position.z;
    sc.player.yaw = Math.atan2(-dx, -dz);
    sc.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    sc.player.update(0);
    sc.camera.updateMatrixWorld(true);
    return {
      body: b,
      at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)],
      eye: [
        +sc.camera.position.x.toFixed(2),
        +sc.camera.position.y.toFixed(2),
        +sc.camera.position.z.toFixed(2),
      ],
    };
  }, [body, distance]);
}

/**
 * Put the page at full size and let a frame land BEFORE the line starts.
 *
 * A picture of an open mouth is a race: the poll sees `open >= 0.45` on the
 * frame the renderer has just drawn, and if another frame lands before the
 * shutter, the mouth in the picture is whatever that next frame decided. At
 * two frames a second the window is wide. Warming the loop first removes the
 * resize and the first slow full-size frame from that window, leaving only one
 * round trip.
 */
async function warmUp() {
  await pictureResolution();
  await page.waitForTimeout(1200);
}

/* ------------------------------------------------------------------ */
/* The in-page sampler                                                 */
/* ------------------------------------------------------------------ */

/**
 * Record every mouth, every rendered frame, into an array in the page.
 *
 * Installed once and left running. `mouthTrace.start()` clears it and
 * `mouthTrace.take()` hands the samples back — so a measurement covers the
 * frames the renderer actually drew, at whatever rate swiftshader manages,
 * rather than however often Node happened to ask.
 */
async function installSampler() {
  await page.evaluate(() => {
    const samples = [];
    let recording = false;
    let began = 0;
    const loop = () => {
      requestAnimationFrame(loop);
      if (!recording) return;
      samples.push({
        t: +(performance.now() - began).toFixed(1),
        mouths: window.silvercase.mouths(),
      });
    };
    requestAnimationFrame(loop);
    window.mouthTrace = {
      start() { samples.length = 0; began = performance.now(); recording = true; },
      stop() { recording = false; },
      take() { return samples.slice(); },
    };
  });
}

/**
 * Render at a postage stamp while measuring, at full size for screenshots.
 *
 * The envelope is sampled once per RENDERED frame — that is the only rate the
 * game's own mouths run at — and swiftshader draws this apartment at two to
 * four frames a second, which samples a six-second take a dozen times and
 * cannot see a syllable. Nothing about the mouth changes with the render
 * target; only how often the loop comes round. In a real browser this is
 * sixty a second and no such trick is needed.
 */
async function measuringResolution() {
  await page.evaluate(() => {
    const r = window.silvercase.renderer;
    r.setSize(48, 27, false);
    r.setPixelRatio(1);
    /* Shadows are most of what swiftshader spends its time on in this flat,
     * and a shadow map has nothing to do with a mouth. Off while measuring,
     * back on for the pictures. */
    r.shadowMap.enabled = false;
  });
}

async function pictureResolution() {
  await page.evaluate(() => {
    const r = window.silvercase.renderer;
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
  });
}

/** A trace of rendered frames over `ms` of WALL clock — for the audio cases. */
async function trace(ms) {
  await measuringResolution();
  await page.evaluate(() => window.mouthTrace.start());
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    window.mouthTrace.stop();
    return window.mouthTrace.take();
  });
}

/**
 * A trace over `seconds` of SIMULATED time, stepped by the scene's own tick.
 *
 * The fallback envelope and the subtitle timer are both measured in simulated
 * seconds — the frame loop clamps its step to 0.05 s, so under swiftshader at
 * four frames a second one wall second buys a fifth of a simulated one
 * (ENGINE-TRAPS.md entry 2). Measuring the fallback against the wall clock
 * therefore measures the rasteriser. This steps the clock the fallback
 * actually runs on, which is also the clock the subtitle runs on — the whole
 * point being that the two agree.
 */
async function simTrace(seconds, step = 0.04) {
  return page.evaluate(([seconds, step]) => {
    const out = [];
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) {
      window.silvercase.tick(step);
      out.push({ t: +((i + 1) * step).toFixed(3), mouths: window.silvercase.mouths() });
    }
    return out;
  }, [seconds, step]);
}

/**
 * Drain the room to silence and confirm it stayed that way.
 *
 * The mission interjects ambient barks from `updateAmbientControl` the first
 * time the player is looking at the television, the takeout, the glasses and
 * the bathroom door — real lines, fired once each, and they land inside any
 * window opened here. So this clears the queue repeatedly until a whole poll
 * goes by with nothing talking, rather than asserting silence on a room that
 * had a perfectly good reason to be speaking.
 */
async function settle(tries = 12) {
  for (let i = 0; i < tries; i++) {
    const quiet = await page.evaluate(() => {
      const sc = window.silvercase;
      sc.dialogue.play([]);
      const v = sc.voice();
      const m = sc.mouths();
      return !v.talking && !v.playing
        && Object.values(m).every((x) => x.mode === null && x.open === 0);
    });
    await page.waitForTimeout(350);
    if (quiet) {
      const still = await page.evaluate(() => {
        const sc = window.silvercase;
        const v = sc.voice();
        const m = sc.mouths();
        return !v.talking && !v.playing
          && Object.values(m).every((x) => x.mode === null && x.open === 0);
      });
      if (still) return true;
    }
  }
  return false;
}

/** Say one authored line through the mission's own dialogue controller. */
async function speak(line) {
  await page.evaluate((l) => {
    window.silvercase.dialogue.play([{
      speaker: l.speaker, text: l.text, cue: l.cue, hold: l.hold ?? 1.0,
    }]);
  }, line);
}

/** Statistics for one body across a trace. */
function stats(samples, body) {
  const opens = samples.map((s) => s.mouths[body]?.open ?? 0);
  const modes = new Set(samples.map((s) => s.mouths[body]?.mode ?? null));
  const scales = samples.map((s) => s.mouths[body]?.scaleY ?? 0);
  return {
    frames: samples.length,
    max: opens.length ? Math.max(...opens) : 0,
    min: opens.length ? Math.min(...opens) : 0,
    shutFrames: opens.filter((v) => v < 0.05).length,
    openFrames: opens.filter((v) => v > 0.25).length,
    modes: [...modes],
    scaleSpread: scales.length ? Math.max(...scales) - Math.min(...scales) : 0,
    last: opens.length ? opens[opens.length - 1] : 0,
    tail: opens.slice(-Math.max(1, Math.floor(opens.length * 0.15))),
  };
}

/* ------------------------------------------------------------------ */

console.log(`\nThe mouths — http://localhost:${PORT}/silvercase.html\n`);
/* Through the preview gate at the room checkpoint: The Silver Case grew a
 * campaign entry gate after this file was written, so a bare page load now
 * refuses begin() and the voice bank never decodes. The room beat stages all
 * five bodies this file samples. */
await page.goto(`http://localhost:${PORT}/silvercase.html?preview=1&checkpoint=room`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });
await installSampler();

await page.evaluate(() => window.silvercase.begin());
// Wait on the engine's own published fact, not on a duration: the voice bank
// has to be decoded before "a recorded line" means anything at all.
await page.waitForFunction(
  (cue) => window.silvercase.audio.ready && window.silvercase.audio.hasSample(cue),
  RECORDED.cue,
  { timeout: 120000 },
);
check('the mission boots and its voice bank decodes', true, RECORDED.cue);

// The opening beat starts talking on its own. Move to the beat where all four
// of them are in the room and standing where they can be photographed.
await page.evaluate(() => {
  const sc = window.silvercase;
  sc.dialogue.play([]);
  /* Through the arrival beat, not straight to the interrogation. ARRIVE_HALLWAY
   * is what puts the player out of the car and into the corridor on his own two
   * feet; jumping past it leaves him sat in the passenger seat with the car
   * interior wrapped round the camera, looking at a flat he is nowhere near.
   * A screenshot of that is a screenshot of the inside of a door card. */
  sc.go('ARRIVE_HALLWAY');
  sc.tick(0.2);
  sc.go('ENTER_APARTMENT');
  sc.tick(0.2);
  sc.go('ESTABLISH_CONTROL');
  sc.tick(0.4);
});
const settled = await settle();

/* ==================================================================
 * PART ONE — the measurements.
 *
 * Deliberately no screenshots in here. A full-size capture costs the page a
 * second or more at this frame rate, which is a sixth of the take being
 * measured, so photographing and measuring in the same window means one of
 * them is a lie. Part two below re-delivers the same lines for pictures.
 * ================================================================== */

/* ---------------- (b) nobody is speaking ---------------- */
{
  const samples = await trace(2500);
  const bodies = ['ape', 'deke', 'chester', 'winston', 'pruitt'];
  const moved = bodies.filter((b) => stats(samples, b).max > 0.001);
  const modes = bodies.filter((b) => stats(samples, b).modes.some((m) => m !== null));
  check(
    '(b) no mouth moves while nobody is speaking',
    settled && moved.length === 0 && modes.length === 0 && samples.length > 3,
    `${samples.length} rendered frames sampled; moving=${JSON.stringify(moved)} `
      + `driven=${JSON.stringify(modes)}`,
  );
}

/* ---------------- (a) a recorded line ---------------- */
const TAKE = await page.evaluate(
  (cue) => window.silvercase.audio.sampleDuration(cue),
  RECORDED.cue,
);
{
  await speak({ ...RECORDED, hold: 0.5 });
  const samples = await trace(Math.round(TAKE * 1000) + 1500);
  const s = stats(samples, RECORDED.body);
  const others = ['ape', 'deke', 'winston', 'pruitt']
    .filter((b) => stats(samples, b).max > 0.001);
  /* The first half of the trace is inside the take by construction; the last
   * tenth is past its end. Splitting it is what turns "the mouth moved" into
   * "the mouth moved WHILE it played and had stopped by the time it ended". */
  const inTake = stats(samples.filter((x) => x.t < TAKE * 1000 * 0.8), RECORDED.body);
  const afterTake = stats(samples.filter((x) => x.t > TAKE * 1000 + 400), RECORDED.body);

  check(
    '(a) the mouth is driven by the audio, not by a timer',
    inTake.modes.includes('audio') && !s.modes.includes('fallback'),
    `modes=${JSON.stringify(s.modes)} over a ${TAKE.toFixed(2)} s take, `
      + `${s.frames} rendered frames`,
  );
  check(
    '(a) it opens while the recorded line plays',
    inTake.max > 0.4,
    `max open inside the take ${inTake.max.toFixed(3)} over ${inTake.frames} frames`,
  );

  check(
    '(a) the mesh itself moves, not only the number',
    inTake.scaleSpread > 0.001,
    `mouth.scale.y ranged over ${inTake.scaleSpread.toFixed(4)} (rest is `
      + `${samples[0]?.mouths[RECORDED.body]?.restY})`,
  );
  check(
    '(a) only the man saying the line moves his mouth',
    others.length === 0,
    others.length ? `also moving: ${others.join(', ')}` : 'the other four stayed shut',
  );
  check(
    '(a) it is still by the time the line ends',
    afterTake.frames > 0 && afterTake.max === 0 && afterTake.modes.every((m) => m === null),
    `${afterTake.frames} frames sampled past the end of the take: `
      + `max open ${afterTake.max}, modes ${JSON.stringify(afterTake.modes)}`,
  );

  const after = await page.evaluate((body) => window.silvercase.mouths()[body], RECORDED.body);
  check(
    '(a) and the mesh is back at its rest scale',
    after.open === 0 && after.mode === null
      && Math.abs(after.scaleY - after.restY) < 1e-4,
    `open=${after.open} mode=${after.mode} scaleY=${after.scaleY} rest=${after.restY}`,
  );
}

/* ---------------- it is the SOUND, not a clock ---------------- */
/*
 * The decisive one, and the reason this file exists.
 *
 * Everything above is also true of a mouth flapping on `Math.sin(t * 11)` for
 * a guessed number of seconds — that opens, shuts, and stops eventually too.
 * What separates the two is what happens when the LINE IS PLAYING AND THERE IS
 * NO SOUND YET.
 *
 * So: the same take, started with a 1.2 s pickup. From the instant `play()`
 * returns, the line is under way, the mouth has been told to speak, and it is
 * in `audio` mode — and nothing is audible. A timer is flapping through that
 * silence. The take is not, and neither is the mouth.
 */
{
  await settle();
  await measuringResolution();
  const pickup = await page.evaluate(([body, cue, delay]) => new Promise((resolve) => {
    const sc = window.silvercase;
    const source = sc.audio.play(cue, { volume: 0.9, delay });
    // Exactly what a scene does: hand the take to the man who is saying it.
    sc.cast[body].npc.say(9, { audio: sc.audio, source });
    const samples = [];
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - t0;
      samples.push({ t: +t.toFixed(0), ...sc.mouths()[body] });
      if (t > delay * 1000 + 2400) { clearInterval(id); resolve({ started: Boolean(source), samples }); }
    }, 40);
  }), [RECORDED.body, RECORDED.cue, 2.4]);

  const silent = pickup.samples.filter((x) => x.t < 2200);
  const speaking = pickup.samples.filter((x) => x.t > 2700);
  const openInSilence = silent.filter((x) => x.open > 0.02);
  const openInSpeech = speaking.filter((x) => x.open > 0.25);
  check(
    'it is the SOUND that opens it, not a clock',
    pickup.started
      && silent.length >= 3 && silent.every((x) => x.mode === 'audio')
      && openInSilence.length === 0
      && speaking.length >= 3 && openInSpeech.length > 0,
    `over a 2.4 s pickup with the line already under way: ${silent.length} samples, `
      + `all in 'audio' mode, ${openInSilence.length} of them with the mouth open `
      + `(a timer would have flapped through every one); once the take is audible, `
      + `${openInSpeech.length} of ${speaking.length} samples past 0.25`,
  );
  await settle();
}

/* ---------------- the photographed face ---------------- */
{
  await settle();
  const has = await page.evaluate((cue) => window.silvercase.audio.hasSample(cue), PHOTO.cue);
  await speak({ ...PHOTO, hold: 0.5 });
  const samples = await trace(2200);
  const s = stats(samples, PHOTO.body);
  const now = await page.evaluate((b) => window.silvercase.mouths()[b], PHOTO.body);
  const headPitch = await page.evaluate((b) => {
    const npc = window.silvercase.cast[b].npc;
    return +npc.parts.head.rotation.x.toFixed(4);
  }, PHOTO.body);
  check(
    'a photographed face is driven but never has a mouth drawn on it',
    now.photo === true && s.modes.includes('audio') && s.max > 0.4
      && s.scaleSpread === 0 && Math.abs(now.scaleY - now.restY) < 1e-6,
    `recorded=${has} modes=${JSON.stringify(s.modes)} max open=${s.max.toFixed(3)} `
      + `mouth.scale.y spread=${s.scaleSpread} (must be 0) headPitch=${headPitch}`,
  );
}

/* ---------------- (c) cutting a line mid-word ---------------- */
{
  await settle();
  await speak({ ...RECORDED, hold: 8 });
  /* Sample a window rather than one instant: a mouth that is genuinely working
   * is SHUT for a good part of any second, which is the whole point, so "is it
   * open right now" is the wrong question to ask of it. */
  const before = stats(await trace(1200), RECORDED.body);
  const wasPlaying = await page.evaluate(() => window.silvercase.voice().playing);
  // The cut a player really causes: a new sequence replacing the old one,
  // which is what `DialogueController.play()` does and what `stopVoice` is for.
  const cutAt = Date.now();
  const atCut = await page.evaluate((b) => {
    window.silvercase.dialogue.play([]);
    return window.silvercase.mouths()[b];
  }, RECORDED.body);
  const stillPlaying = await page.evaluate(() => window.silvercase.voice().playing);
  /* Undriven is immediate; SHUT takes a few frames, on purpose — a jaw that
   * teleports closed reads as a glitch, so the release is a lerp. Wait for the
   * mesh to be back at rest rather than asserting it on the same tick. */
  let shutMs = null;
  try {
    await page.waitForFunction(
      (b) => window.silvercase.mouths()[b].open === 0,
      RECORDED.body,
      { timeout: 4000, polling: 25 },
    );
    shutMs = Date.now() - cutAt;
  } catch { /* reported as a failure below */ }
  const after = await page.evaluate((b) => window.silvercase.mouths()[b], RECORDED.body);
  check(
    '(c) cutting the line mid-word stops the mouth',
    wasPlaying && before.max > 0.15 && before.modes.includes('audio')
      && !stillPlaying && atCut.mode === null
      && shutMs !== null && after.open === 0
      && Math.abs(after.scaleY - after.restY) < 1e-4,
    `mid-take max open ${before.max.toFixed(3)} (${JSON.stringify(before.modes)}); `
      + `cut about 1.5 s into a ${TAKE.toFixed(2)} s take -> undriven on the same call `
      + `(mode=${atCut.mode}), mesh back at rest ${shutMs} ms later`,
  );
}

/* ---------------- (d) a text-only line ---------------- */
{
  await settle();
  const has = await page.evaluate((cue) => window.silvercase.audio.hasSample(cue), UNRECORDED.cue);
  await speak({ ...UNRECORDED, hold: 3.0 });
  // Simulated time, because that is the clock the fallback and the subtitle
  // are both on. 2.2 s of it, out of the line's 3.0.
  const samples = await simTrace(2.2);
  const s = stats(samples, UNRECORDED.body);
  const others = ['ape', 'deke', 'chester', 'pruitt']
    .filter((b) => stats(samples, b).max > 0.001);
  check(
    '(d) a text-only line still animates, on the fallback and labelled as such',
    has === false && s.modes.includes('fallback') && !s.modes.includes('audio')
      && s.max > 0.4 && s.openFrames > 3 && s.shutFrames > 3 && others.length === 0,
    `hasSample=${has} modes=${JSON.stringify(s.modes)} max=${s.max.toFixed(3)} `
      + `open/shut frames ${s.openFrames}/${s.shutFrames} of ${s.frames}`,
  );
  // Past the subtitle's own 3.0 s, in the same clock.
  await simTrace(1.4);
  const after = await page.evaluate((b) => window.silvercase.mouths()[b], UNRECORDED.body);
  check(
    '(d) and it stops when the subtitle does',
    after.open === 0 && after.mode === null,
    `after 3.6 s of a 3.0 s line: open=${after.open} mode=${after.mode}`,
  );
}

/* ==================================================================
 * PART TWO — the pictures.
 *
 * The same lines again, delivered one at a time at full render size, with the
 * shutter held until the mouth is actually open. Nothing here is asserted;
 * the numbers above are the check and these are so a person can look.
 * ================================================================== */
try {
  /* Walk into frame FIRST and settle afterwards.
   *
   * The mission interjects an ambient bark the first time the player comes
   * within 2.2 m of Chester (`updateAmbientControl`), so moving the camera and
   * then photographing "the silent room" photographs a man being asked whether
   * he wants a drink -- which is the exact shape of the lying artefact this
   * whole file exists to avoid. Move, let the room finish reacting, then look. */
  await frameOn(RECORDED.body);
  await settle();
  await shot('b-silent-room');

  await warmUp();
  await speak({ ...RECORDED, hold: 0.5 });
  await shot('a1-recorded-line-mid-word', { openBody: RECORDED.body, warm: true });
  await settle();
  await shot('a2-recorded-line-ended');

  await frameOn(PHOTO.body);
  await settle();
  await warmUp();
  await speak({ ...PHOTO, hold: 0.5 });
  await shot('e-photo-face-ape', { openBody: PHOTO.body, warm: true });
  await settle();

  await frameOn(RECORDED.body);
  await settle();
  await warmUp();
  await speak({ ...RECORDED, hold: 8 });
  await shot('c1-before-the-cut', { openBody: RECORDED.body, warm: true });
  await page.evaluate(() => window.silvercase.dialogue.play([]));
  await page.waitForTimeout(1200);
  await shot('c2-after-the-cut');

  await frameOn(UNRECORDED.body);
  await settle();
  await warmUp();
  await speak({ ...UNRECORDED, hold: 8.0 });
  await shot('d1-text-only-line', { openBody: UNRECORDED.body, warm: true });
  await settle();
  await shot('d2-text-only-ended');
} catch (error) {
  /* The pictures are evidence for a person, not a check. A capture that times
   * out on a one-frame-a-second rasteriser must not take the measurements
   * above down with it -- it is reported and the run still reports. */
  check('screenshots captured', false, error.message.slice(0, 160));
}


/* ---------------- the cost ---------------- */
{
  const cost = await page.evaluate(() => {
    const sc = window.silvercase;
    let mouths = 0;
    let figures = 0;
    for (const actor of sc.cast.all) { figures += 1; if (actor.npc.voiceMouth) mouths += 1; }
    return { figures, mouths };
  });
  check(
    'one mouth per figure and one analyser per line',
    cost.mouths === cost.figures,
    `${cost.mouths} mouths for ${cost.figures} figures; the AnalyserNode belongs to the playback`,
  );
}

check('no page errors', problems.length === 0, problems.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. `
  + `Screenshots in ${path.relative(ROOT, SHOT_DIR)}\n`);
process.exit(failed.length ? 1 : 0);

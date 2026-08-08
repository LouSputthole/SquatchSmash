#!/usr/bin/env node
/**
 * Verify The Silver Case through a seeded canonical campaign entry. Separate
 * checkpoint pages use save-free preview URLs.
 *
 * Drives the mission's own state machine end to end using the
 * window.silvercase debug handle (go()/tick()/state()/pressFire()/
 * pressDraw()/chooseKey()/retry()), plus real keyboard input for the two
 * places a human actually touches a key: WASD movement and the hold-E
 * prayer-finish choice. Mirrors the skeleton in tools/verify-squatchfather.mjs
 * and tools/verify-initiation.mjs — a local static server, a real headless
 * Chromium via Playwright, a check(name, ok, detail) accumulator, and a
 * process.exit(1) on any failure.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APE_FAMILY_MEMBER } from '../src/bing/family-ape.js';
import {
  CAMPAIGN_STORAGE_KEY,
  CHARACTER_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { isSilverCasePreloadCue } from '../src/silvercase/audio.js';

// ApartmentScene.js's own ROOMS.apartment box (x 6…12, z -2.5…2.5) — not
// imported: that module transitively pulls in src/world/props.js, which
// calls a `document.createElement('canvas')` texture builder at MODULE TOP
// LEVEL (brushedMetal(), eagerly evaluated), so importing it here in plain
// Node (this file runs outside the browser, unlike everything under page.
// evaluate) throws `ReferenceError: document is not defined` before a single
// check runs. Same reason the hallway-spawn check just above hardcodes `6` as
// the wall between the corridor and the flat instead of importing it.
const APARTMENT_ROOM = Object.freeze({ x0: 6, x1: 12, z0: -2.5, z1: 2.5 });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5223;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
const campaignSeed = createCampaign({ storage: new MemoryStorage() });
campaignSeed.update((state) => {
  state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
});
const SILVER_CASE_CAMPAIGN_SEED = campaignSeed.state;

// The residency contract this mission is held to — see src/silvercase/audio.js.
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const selectedSilverCaseCues = soundManifest.sfx.filter((cue) => isSilverCasePreloadCue(cue));
const expectedSilverCaseResidentNames = selectedSilverCaseCues
  .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
  .map((cue) => cue.name)
  .sort();

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; running node --check on the new files instead.');
  const { execFileSync } = await import('node:child_process');
  for (const file of ['silvercase.html', 'tools/verify-silvercase.mjs']) {
    if (file.endsWith('.html')) continue; // node --check only understands JS
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'inherit' });
  }
  console.log('node --check passed for tools/verify-silvercase.mjs (playwright unavailable).');
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
    /* Current Chromium's direct SwiftShader GL backend can lose the WebGL
     * context at boot and leave a 0x0 drawing buffer. Route SwiftShader
     * through ANGLE instead: same software renderer, stable WebGL lifecycle. */
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const problems = [];
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Force a beat transition and step the mission clock by `secs` of simulated
 * time (60 fixed sub-steps, per window.silvercase.tick's own contract). */
async function go(beat, secs = 0.1) {
  return page.evaluate(([beat, secs]) => {
    const sc = window.silvercase;
    sc.go(beat);
    sc.tick(secs);
    return sc.state();
  }, [beat, secs]);
}

async function tick(secs) {
  return page.evaluate((secs) => {
    window.silvercase.tick(secs);
    return window.silvercase.state();
  }, secs);
}

/**
 * Advance the mission in small fixed steps, stopping the instant `condition`
 * is met (or after `maxSteps` steps, whichever comes first) — entirely
 * inside one page.evaluate() call, so there is no Node<->browser round trip
 * between steps for real time to sneak in.
 *
 * This exists because main.js's own requestAnimationFrame loop keeps running
 * in real time in the background (whenever the mission is `running`),
 * independently of every explicit tick() call this script makes. A
 * fixed-duration `tick(N)` picked to land just past a dialogue sequence
 * finishing (so a choice has just opened) is at the mercy of however much
 * real wall-clock time also elapsed between Node round trips — which is
 * fine when the margin against the *next* thing's own timeout is generous,
 * but not for e.g. the prayer-finish choice's tight window. Polling in
 * lockstep like this is immune to that drift: it can only stop exactly when
 * `condition` first becomes true, never overshoot past it.
 *
 * `condition` is `"beat:NAME"` (fsm.name === NAME), `"choice:ID"`
 * (dialogue.choice?.id === ID), `"choiceOpen"` (any choice is open), or
 * `"instruction"` (the on-screen instruction is up).
 *
 * `instruction` exists because the HUD deliberately does NOT appear on the
 * frame the beat is entered. The owner's rule is that the character speaks
 * first and the screen clarifies afterwards, so `sayThenInstruct` raises it in
 * the sequence's `onDone` — see docs/TONE-AND-PARODY.md. Reading the element
 * straight after entering the beat therefore reads the empty string, which is
 * correct behaviour and used to be a failing check.
 */
async function tickUntil(condition, { stepSecs = 0.1, maxSteps = 400 } = {}) {
  return page.evaluate(([condition, stepSecs, maxSteps]) => {
    const sc = window.silvercase;
    const [kind, value] = condition.split(':');
    const met = () => {
      if (kind === 'beat') return sc.fsm.name === value;
      if (kind === 'choice') return sc.dialogue.choice?.id === value;
      if (kind === 'choiceOpen') return Boolean(sc.dialogue.choice);
      if (kind === 'instruction') {
        const el = document.getElementById('instruction');
        return Boolean(el && el.classList.contains('show') && el.textContent.trim());
      }
      return false;
    };
    let steps = 0;
    while (!met() && steps < maxSteps) {
      sc.tick(stepSecs);
      steps += 1;
    }
    return { met: met(), steps, state: sc.state() };
  }, [condition, stepSecs, maxSteps]);
}

async function domOverlay(id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    return { present: !!el, hidden: el?.classList.contains('hidden') ?? null };
  }, id);
}

/**
 * Mean luminance of what is actually on screen, 0..1.
 *
 * The car ride shipped rendering as a black rectangle — the rig built no
 * lights of its own and main.js's stand-in was about one candela, so the beat
 * that opens the mission showed nothing at all. No amount of state
 * introspection catches that, so this reads the framebuffer: render, then
 * scale the WebGL canvas into a 2D one and average it, synchronously in the
 * same task so the drawing buffer has not been cleared for compositing yet.
 */
async function screenLuminance() {
  return page.evaluate(() => {
    const sc = window.silvercase;
    const gl = sc.renderer.getContext();
    sc.renderer.render(sc.scene, sc.camera);
    const src = sc.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 45;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, c.width, c.height);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += l;
      if (l > 0.06) lit += 1;
    }
    const pixels = data.length / 4;
    return {
      mean: +(sum / pixels).toFixed(4),
      litFraction: +(lit / pixels).toFixed(3),
      contextLost: gl.isContextLost(),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
}

/**
 * World-space bounding box of a cast member's FIGURE.
 *
 * Decals stuck to a man (`silvercase.mark`) are excluded deliberately: a 31 cm
 * blood quad on a body that then topples reaches well outside its silhouette,
 * and every measurement taken here — real heights, the 2.6 m ceiling, "the
 * body is still exactly where it fell" — is about the man rather than about
 * what was done to him.
 */
async function actorBounds(name) {
  return page.evaluate(async (name) => {
    const THREE = await import('/vendor/three.module.min.js');
    const group = window.silvercase.cast[name].group;
    const wasVisible = group.visible;
    group.visible = true;
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    group.traverse((node) => {
      if (!node.isMesh || node.name === 'silvercase.mark') return;
      box.expandByObject(node);
    });
    group.visible = wasVisible;
    return {
      min: box.min.toArray().map((n) => +n.toFixed(3)),
      max: box.max.toArray().map((n) => +n.toFixed(3)),
    };
  }, name);
}

async function hotbar() {
  return page.evaluate(() => {
    const el = document.getElementById('hotbar');
    if (!el) return { present: false };
    return {
      present: true,
      hidden: el.classList.contains('hidden'),
      slots: el.children.length,
      labels: [...el.children].map((slot) => slot.title),
    };
  });
}

try {
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: CAMPAIGN_STORAGE_KEY, state: SILVER_CASE_CAMPAIGN_SEED });
  await page.goto(`http://localhost:${PORT}/silvercase.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });

  // ---- MENU -----------------------------------------------------------
  let state = await page.evaluate(() => window.silvercase.state());
  check('the mission boots straight into MENU with nobody dead yet',
    state.beat === 'MENU'
      && state.actors.ape.alive && state.actors.deke.alive
      && state.actors.chester.alive && state.actors.winston.alive
      && state.actors.pruitt.alive,
    JSON.stringify(state));

  // ---- Bloom mounts at its unmodified, subtle defaults with the
  // self-measuring frame-time fallback armed — same contract every other
  // PostFX-mounted scene is held to (see src/core/postfx.js). ---------------
  const postfxBoot = await page.evaluate(() => {
    const fx = window.silvercase.postfx;
    return {
      present: Boolean(fx),
      enabled: fx?.enabled,
      hasComposer: Boolean(fx?.composer),
      hasBloom: Boolean(fx?.bloom),
      strength: fx?.bloom?.strength ?? null,
      radius: fx?.bloom?.radius ?? null,
      threshold: fx?.bloom?.threshold ?? null,
      manual: fx?._manual,
    };
  });
  check('PostFX mounts enabled, unmodified (subtle default bloom) with the auto-fallback still armed',
    postfxBoot.present && postfxBoot.enabled && postfxBoot.hasComposer && postfxBoot.hasBloom
      && postfxBoot.strength === 0.42 && postfxBoot.radius === 0.34 && postfxBoot.threshold === 0.82
      && postfxBoot.manual === false,
    JSON.stringify(postfxBoot));

  // ---- MENU -> CAR_RIDE (begin(), the same call the Begin button makes) -
  //
  // `begin()` now AWAITS `audio.loadManifest(...)` before it ever calls
  // `fsm.go(S.CAR_RIDE)` (see main.js's own comment on the bug this fixes),
  // so `window.silvercase.begin()` returns a promise that only resolves once
  // the mission is genuinely sitting in CAR_RIDE with its manifest resident —
  // awaiting it here, rather than firing it and ticking a fixed 0.1s like the
  // old synchronous `begin()` allowed, is what actually exercises that fix
  // instead of racing it a second time from the test side.
  let carRide = await page.evaluate(async () => {
    const sc = window.silvercase;
    await sc.begin();
    sc.tick(0.1);
    const subs = document.getElementById('subs');
    return {
      state: sc.state(),
      mode: sc.player.mode,
      cueLog: sc.dialogue.cueLog.slice(),
      voiceLog: sc.dialogue.voiceLog.slice(),
      subtitle: {
        shown: subs?.classList.contains('show') ?? false,
        who: document.getElementById('subsWho')?.textContent ?? '',
        line: document.getElementById('subsLine')?.textContent ?? '',
      },
    };
  });
  check('beginning the scene seats the player in the car and starts the drive-over dialogue',
    carRide.state.beat === 'CAR_RIDE'
      && carRide.mode === 'seated'
      && carRide.cueLog[0] === 'vo.silvercase.car.ape.pitch',
    JSON.stringify(carRide));
  const campaignEntry = await page.evaluate(() => ({
    preview: window.silvercase.campaign.preview,
    state: window.silvercase.campaign.state(),
  }));
  check('beginning the ordinary URL claims the canonical Silver Case campaign scene',
    campaignEntry.preview === false
      && campaignEntry.state?.scene?.id === SCENE_IDS.SILVER_CASE
      && campaignEntry.state?.missions?.[MISSION_IDS.SILVER_CASE]?.status === 'in_progress',
    JSON.stringify({
      preview: campaignEntry.preview,
      scene: campaignEntry.state?.scene,
      status: campaignEntry.state?.missions?.[MISSION_IDS.SILVER_CASE]?.status,
    }));

  // ---- V1 (2026-08-06 playtest): "Ape's first line still doesn't play."
  //
  // Root cause was a race, not a missing cue or a missing recording: begin()
  // used to fire `audio.loadManifest(...)` and, in the SAME tick, transition
  // into CAR_RIDE — whose enter() plays the mission's very first line
  // synchronously, before the fetch/decode had a single tick to run. Every
  // later line was fine because its own multi-second `hold` gave that same
  // in-flight load time no earlier line ever got, which is why only the
  // FIRST line ever went quiet. Pinned two ways: the DOM subtitle (which
  // never depended on audio and would have papered over a "just no sound"
  // read of this bug) really is showing Ape's line, AND — the actual
  // regression target — `voiceLog[0]`, populated from `playCue`'s own
  // real-time return value rather than a retroactive `hasSample()` re-check
  // (which by now, after the manifest has long since finished loading, could
  // no longer see the race at all), reports that the take actually played. -
  const firstLine = carRide.voiceLog[0];
  check('the first Ape cue/subtitle registered in the event log during a fresh playthrough is his opening pitch',
    firstLine?.speaker === 'APE'
      && firstLine?.cue === 'vo.silvercase.car.ape.pitch'
      && carRide.subtitle.shown === true
      && carRide.subtitle.who === 'Ape'
      && carRide.subtitle.line === firstLine?.text,
    JSON.stringify({ firstLine, subtitle: carRide.subtitle }));
  check('the first Ape line of a fresh playthrough actually plays its recorded audio, not a silent subtitle',
    firstLine?.playedAudio === true,
    JSON.stringify(firstLine));

  // ---- Audio residency: begin() now genuinely awaits audio.loadManifest(...)
  // before returning (see above), so by this point in the script the promise
  // is already settled — this re-await is just a defensive no-op guard
  // against a future regression reintroducing the old fire-and-forget shape. -
  await page.evaluate(async () => {
    const audio = window.silvercase.audio;
    if (audio._manifestLoadPromise) await audio._manifestLoadPromise;
  });
  const silverCaseAudioResidency = await page.evaluate(() => {
    const audio = window.silvercase.audio;
    return {
      plan: audio.preloadStats ?? null,
      loaded: audio.loadedCount,
      resident: [...audio.buffers.keys()].sort(),
    };
  });
  const missingSilverCaseNames = expectedSilverCaseResidentNames
    .filter((name) => !silverCaseAudioResidency.resident.includes(name));
  const unexpectedSilverCaseNames = silverCaseAudioResidency.resident
    .filter((name) => !expectedSilverCaseResidentNames.includes(name));
  check('The Silver Case decodes exactly its own vo.silvercase.* dialogue plus its named effect cues',
    silverCaseAudioResidency.plan?.manifestTotal === soundManifest.sfx.length
      && silverCaseAudioResidency.plan?.selected === expectedSilverCaseResidentNames.length
      && silverCaseAudioResidency.loaded === expectedSilverCaseResidentNames.length
      && silverCaseAudioResidency.resident.length === expectedSilverCaseResidentNames.length
      && missingSilverCaseNames.length === 0
      && unexpectedSilverCaseNames.length === 0,
    JSON.stringify({
      plan: silverCaseAudioResidency.plan,
      loaded: silverCaseAudioResidency.loaded,
      expected: expectedSilverCaseResidentNames.length,
      missing: missingSilverCaseNames.slice(0, 5),
      unexpected: unexpectedSilverCaseNames.slice(0, 5),
    }));
  check('the resident bank is a small slice of the shared manifest, not the whole bank',
    expectedSilverCaseResidentNames.length < soundManifest.sfx.length * 0.05,
    JSON.stringify({ resident: expectedSilverCaseResidentNames.length, manifest: soundManifest.sfx.length }));

  // ---- The car ride is a picture, not a black screen. ------------------
  /* `sc.tick()` advances mission state but intentionally does not render.
   * Give the real frame loop one full painted frame after the async Begin
   * seam resolves; otherwise a faster Begin can sample the menu's cleared
   * backbuffer before CAR_RIDE has ever reached WebGL. */
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const carLight = await screenLuminance();
  check('the car ride actually renders a lit cabin rather than a black screen',
    carLight.contextLost === false
      && carLight.drawingBuffer[0] > 0 && carLight.drawingBuffer[1] > 0
      && carLight.mean > 0.02 && carLight.litFraction > 0.3,
    JSON.stringify(carLight));

  const carRig = await page.evaluate(() => {
    const car = window.silvercase.car;
    const lights = [];
    car.root.traverse((o) => { if (o.isLight) lights.push(o.type); });
    return {
      lights,
      apeId: car.ape.characterId,
      apeHeight: +(car.ape.parts.heightScale * 1.78).toFixed(3),
      visible: car.root.visible,
    };
  });
  check('the car rig owns its own lighting and the same Ape who is in the apartment',
    carRig.visible && carRig.lights.length >= 3
      && carRig.apeId === 'ape' && Math.abs(carRig.apeHeight - 1.88) < 0.01,
    JSON.stringify(carRig));

  const pulpSuits = await page.evaluate(async () => {
    const sc = window.silvercase;
    const { SILVERCASE_PROSPECT_PRESENTATION } = await import('/src/silvercase/cast/prospect.js');
    const colour = (root, name) => root.getObjectByName(name)?.material?.color?.getHex() ?? null;
    const apeSuit = (npc) => ({
      id: npc.characterId,
      outfit: npc.group.userData.npc?.outfit ?? null,
      jacket: colour(npc.group, 'suit.lapel.left'),
      shirt: colour(npc.group, 'suit.collar.point'),
      tie: colour(npc.group, 'suit.tie'),
      knot: colour(npc.group, 'suit.tie.knot'),
      pocketSquare: Boolean(npc.group.getObjectByName('suit.pocket-square')),
    });
    const arm = sc.viewModel.viewArm;
    return {
      face: sc.state().ape.face,
      carApe: apeSuit(sc.car.ape),
      apartmentApe: apeSuit(sc.cast.ape.npc),
      prospect: {
        id: arm.userData.characterPresentation?.id ?? null,
        face: SILVERCASE_PROSPECT_PRESENTATION.face,
        jacket: colour(arm, 'silvercase.viewmodel.suit-sleeve'),
        shirt: colour(arm, 'silvercase.viewmodel.shirt-cuff'),
        tie: SILVERCASE_PROSPECT_PRESENTATION.model.tieColour,
      },
    };
  });
  const suitedApe = (ape) => ape.id === CHARACTER_IDS.APE
    && ape.outfit === 'suit'
    && ape.jacket === 0x111116
    && ape.shirt === 0xf2efe7
    && ape.tie === 0x09090c
    && ape.knot === 0x09090c
    && ape.pocketSquare === false;
  check('both canonical Ape instances and Tony wear the live Pulp Fiction black/white suit contract',
    pulpSuits.face === 'assets/faces/ape.png'
      && suitedApe(pulpSuits.carApe)
      && suitedApe(pulpSuits.apartmentApe)
      && pulpSuits.prospect.id === CHARACTER_IDS.PROSPECT
      && pulpSuits.prospect.face === null
      && pulpSuits.prospect.jacket === 0x111116
      && pulpSuits.prospect.shirt === 0xf2efe7
      && pulpSuits.prospect.tie === 0x09090c,
    JSON.stringify(pulpSuits));

  // ---- The steering wheel is a steering wheel. ---------------------------
  // "Apes steering wheel is sideways." A TorusGeometry's axis is +Z, which in
  // this cabin is already "facing the driver"; the old `rotation.x = PI/2.4`
  // (75°) laid it almost flat, so its axis pointed at the floor. A car wheel
  // rakes the other way and by a quarter as much, so the axis stays mostly
  // horizontal. Measured off the world matrix rather than off the authored
  // number, so a re-parent or a rebuilt rig is still held to the same thing.
  const wheelRig = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const car = window.silvercase.car;
    const rig = car.root.getObjectByName('steeringWheel');
    if (!rig) return { present: false };
    car.root.updateWorldMatrix(true, true);
    const axis = new THREE.Vector3(0, 0, 1)
      .transformDirection(rig.matrixWorld).normalize();
    let parts = 0;
    rig.traverse((o) => { if (o.isMesh) parts += 1; });
    return {
      present: true,
      axis: axis.toArray().map((n) => +n.toFixed(3)),
      rake: +rig.rotation.x.toFixed(3),
      parts,
    };
  });
  check('the steering wheel faces the driver instead of lying flat like a table',
    wheelRig.present
      && wheelRig.axis[2] > 0.8 && Math.abs(wheelRig.axis[1]) < 0.5
      && wheelRig.rake < 0 && wheelRig.rake > -0.8
      && wheelRig.parts >= 6,
    JSON.stringify(wheelRig));

  // ---- …and the cabin around it has something in it. --------------------
  const carDressing = await page.evaluate(() => {
    let meshes = 0;
    window.silvercase.car.root.traverse((o) => { if (o.isMesh) meshes += 1; });
    return { meshes };
  });
  check('the car interior is dressed rather than a dashboard in a void',
    carDressing.meshes >= 60, JSON.stringify(carDressing));

  // ---- Ape's identity is the campaign's, not a local lookalike. His suit
  // is deliberately scene-local, so compare the body/head facts that define
  // the man rather than demanding the Bing's casual tee on this job. --------
  const canonicalApeFields = ['height', 'build', 'hair', 'hairColour', 'beard', 'skin'];
  check('Ape is the canonical campaign character and body beneath the mission suit',
    carRide.state.ape.characterId === APE_FAMILY_MEMBER.id
      && carRide.state.ape.characterId === CHARACTER_IDS.APE
      && carRide.state.ape.family === true
      && carRide.state.ape.face === 'assets/faces/ape.png'
      && canonicalApeFields.every(
        (field) => carRide.state.ape.model[field] === APE_FAMILY_MEMBER.model[field],
      ),
    JSON.stringify(carRide.state.ape));

  // ---- Everybody is a person-sized person. -----------------------------
  const CEILING = 2.6;
  const scaleReport = {};
  let scaleOk = true;
  for (const [name, actor] of Object.entries(carRide.state.actors)) {
    const bounds = await actorBounds(name);
    const tall = actor.height >= 1.6 && actor.height <= 1.95;
    const fits = bounds.max[1] < CEILING - 0.4;
    const grounded = bounds.min[1] > -0.15;
    scaleReport[name] = { height: actor.height, top: bounds.max[1], bottom: bounds.min[1] };
    if (!tall || !fits || !grounded) scaleOk = false;
  }
  check('every figure is a real human height and clears the 2.6 m ceiling',
    scaleOk, JSON.stringify(scaleReport));

  // ---- The inventory bar is the shared one every other scene mounts. ----
  const barAtStart = await hotbar();
  check('the shared five-slot inventory bar is mounted and visible',
    barAtStart.present && barAtStart.hidden === false && barAtStart.slots === 5,
    JSON.stringify(barAtStart));

  // ---- CAR_RIDE -> ARRIVE_HALLWAY (debug go(), same as every jump below) -
  let arrive = await go('ARRIVE_HALLWAY');
  let arrivePose = await page.evaluate(() => {
    const p = window.silvercase.player;
    return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, mode: p.mode };
  });
  check('ARRIVE_HALLWAY drops the player at the authored hallway spawn, walking',
    arrive.beat === 'ARRIVE_HALLWAY'
      && Math.abs(arrivePose.x - 0.8) < 0.01 && Math.abs(arrivePose.z) < 0.01
      && Math.abs(arrivePose.y - 1.66) < 0.01 && arrivePose.mode === 'walk',
    JSON.stringify({ arrive, arrivePose }));

  // ---- "Ape is not in the hallway - he should be in the hallway with you
  // when you spawn in." The hallway runs x 0…6; the flat starts at x 6. He
  // used to be built at x 7.1, i.e. already inside, before the player had
  // knocked. Being in the corridor is the check — and being close enough to
  // the spawn to be in frame, not at the far end of it. -------------------
  const apeAtSpawn = await page.evaluate(() => {
    const sc = window.silvercase;
    const ape = sc.cast.ape.group.position;
    const player = sc.player.position;
    return {
      x: +ape.x.toFixed(3),
      z: +ape.z.toFixed(3),
      distance: +Math.hypot(ape.x - player.x, ape.z - player.z).toFixed(3),
      visible: sc.cast.ape.group.visible,
    };
  });
  check('Ape is standing in the hallway with the player at spawn, not already inside',
    apeAtSpawn.visible && apeAtSpawn.x > 0.8 && apeAtSpawn.x < 6
      && apeAtSpawn.distance < 3.5,
    JSON.stringify(apeAtSpawn));

  // ---- KNOCK / ENTER_APARTMENT (brief dwell, just enough to confirm entry,
  // never long enough for either beat's own dialogue chain to auto-advance
  // before the next go() overwrites it — see the mission's DialogueController,
  // whose play() unconditionally replaces the active queue and its onDone). -
  let knock = await go('KNOCK');
  check('KNOCK is reachable', knock.beat === 'KNOCK', knock.beat);
  let enterApt = await go('ENTER_APARTMENT');
  check('ENTER_APARTMENT is reachable', enterApt.beat === 'ENTER_APARTMENT', enterApt.beat);

  // ---- V2 (2026-08-06 playtest): "After the player opens the door, the
  // Ape should step INTO the apartment (currently stays outside)." --------
  // The front door is already open by this point — its own creak-and-swing
  // tween runs on a fixed 0.5s+0.8s timer inside KNOCK, well before this
  // beat is ever reached — so this dwells inside ENTER_APARTMENT itself,
  // simulating a player who takes a few seconds to walk through the open
  // doorway before shutting it, and reads Ape's position WHILE that beat is
  // still current. That is the actual regression: he used to sit at
  // APE_SPOTS.door (hallway side, x 5.25) for this entire beat and only ever
  // walked in once ESTABLISH_CONTROL began, i.e. once the player closed the
  // door behind themselves — so checking his position only after that beat
  // (as the mission always has) would pass on the old, buggy staging too.
  // APARTMENT_ROOM starts at x=6; the 0.5 margin below clears the doorway/
  // threshold itself, not just the room's nominal edge.
  const apeDuringEntry = await tick(2.5);
  check('ENTER_APARTMENT dialogue/timing is unaffected by the walk-in',
    apeDuringEntry.beat === 'ENTER_APARTMENT', apeDuringEntry.beat);
  check("Ape steps into the apartment volume while the door stands open, not left waiting in the hallway",
    apeDuringEntry.ape.at.x > APARTMENT_ROOM.x0 + 0.5
      && apeDuringEntry.ape.at.x < APARTMENT_ROOM.x1
      && apeDuringEntry.ape.at.z > APARTMENT_ROOM.z0
      && apeDuringEntry.ape.at.z < APARTMENT_ROOM.z1,
    JSON.stringify({ at: apeDuringEntry.ape.at, apartment: APARTMENT_ROOM }));

  // ---- "Coffee table is in the couch need to move it." -------------------
  // Measured, not asserted against a literal position: the two props' own
  // world bounding boxes must not intersect, and the gap in front of the couch
  // has to be walkable (the player's capsule is 0.30 m — core/player.js).
  const furniture = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const props = window.silvercase.apartment.props;
    const boxOf = (obj) => {
      obj.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(obj);
    };
    const couch = boxOf(props.couch.group);
    const table = boxOf(props.coffeeTable.group);
    return {
      couch: { min: couch.min.toArray(), max: couch.max.toArray() },
      table: { min: table.min.toArray(), max: table.max.toArray() },
      intersects: couch.intersectsBox(table),
      gap: +(couch.min.z - table.max.z).toFixed(3),
    };
  });
  check('the coffee table sits in front of the couch instead of inside it',
    furniture.intersects === false && furniture.gap > 0.25,
    JSON.stringify(furniture));

  // ---- "The bathroom door also doesn't look like a door." ---------------
  // It is a door now: a leaf with panels, hardware and a lined casing rather
  // than one slab of laminate — and it starts genuinely off the latch, which
  // is what the mission's own clue line claims about it.
  const bathDoorAtRest = await page.evaluate(() => {
    const door = window.silvercase.apartment.doors.bathroomDoor;
    let parts = 0;
    door.group.traverse((o) => { if (o.isMesh) parts += 1; });
    return {
      parts,
      rotation: +door.group.rotation.y.toFixed(3),
      ajar: door.isAjar(),
      open: door.isOpen(),
      casing: Boolean(window.silvercase.apartment.root.getObjectByName('bathroomCasing')),
    };
  });
  check('the bathroom door is a built door, hanging ajar before anybody kicks it',
    bathDoorAtRest.parts >= 8 && bathDoorAtRest.casing
      && bathDoorAtRest.ajar === true && bathDoorAtRest.open === false,
    JSON.stringify(bathDoorAtRest));

  // ---- ESTABLISH_CONTROL -------------------------------------------------
  let establish = await go('ESTABLISH_CONTROL');
  let caseOcclusionVisible = await page.evaluate(
    () => window.silvercase.apartment.props.caseOcclusion.visible,
  );
  check('ESTABLISH_CONTROL opens with the case still hidden behind the duffel',
    establish.beat === 'ESTABLISH_CONTROL' && caseOcclusionVisible === true,
    JSON.stringify({ establish, caseOcclusionVisible }));

  // ---- Movement during ESTABLISH_CONTROL: real WASD, driven the same way
  // every other core/player.js scene's verify script proves it (heist,
  // squatchfather) — `player.enabled` is normally flipped by a real
  // pointerlockchange event, which headless automation cannot reliably hold,
  // so it is set directly here exactly like tools/verify-heist.mjs does.
  const beforeMove = await page.evaluate(() => {
    const p = window.silvercase.player;
    p.enabled = true;
    return { x: p.position.x, z: p.position.z };
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.silvercase.tick(0.6));
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(60);
  const afterMove = await page.evaluate(() => {
    const p = window.silvercase.player;
    return { x: p.position.x, z: p.position.z, beat: window.silvercase.state().beat };
  });
  const moved = Math.hypot(afterMove.x - beforeMove.x, afterMove.z - beforeMove.z);
  check('WASD moves the player forward during ESTABLISH_CONTROL',
    afterMove.beat === 'ESTABLISH_CONTROL' && moved > 0.2 && Number.isFinite(afterMove.x),
    JSON.stringify({ beforeMove, afterMove, moved: +moved.toFixed(3) }));

  // ---- Early weapon draw (right-click reach), gated to arm only during the
  // three states the mission cares about — pressDraw() stands in for that
  // right-click exactly like pressFire() stands in for the left one.
  let earlyDraw = await page.evaluate(() => {
    window.silvercase.pressDraw();
    window.silvercase.tick(0.2);
    return window.silvercase.state();
  });
  check('an early weapon reach during ESTABLISH_CONTROL is tallied and barked at',
    earlyDraw.mission.earlyDrawCount === 1, JSON.stringify(earlyDraw.mission));

  // ---- CASE_REVEAL (brief dwell again, same reasoning as KNOCK above) ----
  let caseReveal = await go('CASE_REVEAL');
  let caseOcclusionAfter = await page.evaluate(
    () => window.silvercase.apartment.props.caseOcclusion.visible,
  );
  check('CASE_REVEAL clears the duffel out of the way the instant it starts',
    caseReveal.beat === 'CASE_REVEAL' && caseOcclusionAfter === false,
    JSON.stringify({ caseReveal, caseOcclusionAfter }));

  // ---- The case is open for exactly one beat — the one that confirms what
  // is in it — and is shut and latched for the rest of the mission.
  //
  // Played out in full rather than jumped, because the point of the check is
  // the SHAPE of the beat: the lid comes up, the contents are confirmed, and
  // the lid goes back down before the mission moves on. Peak openness is
  // sampled every step so an open that never happened and an open that never
  // closed are both caught. ------------------------------------------------
  const caseArc = await page.evaluate(() => {
    const sc = window.silvercase;
    let peak = 0;
    let steps = 0;
    while (sc.fsm.name === 'CASE_REVEAL' && steps < 600) {
      sc.tick(0.05);
      peak = Math.max(peak, sc.state().case.openness);
      steps += 1;
    }
    for (let i = 0; i < 60; i++) sc.tick(0.05); // let the lid ease home
    return { peak: +peak.toFixed(3), steps, state: sc.state() };
  });
  check('the case opens for the confirmation beat and is shut again afterwards',
    caseArc.peak > 0.7
      && caseArc.state.beat === 'COUCH_SHOOTING'
      && caseArc.state.case.shut === true
      && caseArc.state.case.openness === 0,
    JSON.stringify({ peak: caseArc.peak, beat: caseArc.state.beat, case: caseArc.state.case }));

  // ---- COUCH_SHOOTING: no countdown, the player's own left click decides. -
  let couch = await go('COUCH_SHOOTING');
  check('COUCH_SHOOTING starts with Deke still alive', couch.beat === 'COUCH_SHOOTING' && couch.actors.deke.alive,
    JSON.stringify(couch.actors.deke));

  // Ape has just said "go ahead", so Tony has the gun in his hands — the
  // same big revolver the man in the bathroom is holding.
  const armed = await page.evaluate(() => {
    window.silvercase.tick(0.5);
    const sc = window.silvercase;
    return {
      state: sc.state(),
      viewModelInCamera: sc.camera.children.includes(sc.viewModel.group),
      gunParts: (() => {
        const names = [];
        sc.viewModel.gun.traverse((o) => { if (o.name) names.push(o.name); });
        return names;
      })(),
    };
  });
  const barArmed = await hotbar();
  check('Ape’s order puts the big revolver in Tony’s hands and on the inventory bar',
    armed.state.weapon.drawn && armed.state.weapon.visible && armed.viewModelInCamera
      && armed.gunParts.includes('big-revolver')
      && barArmed.labels[0] === 'Big revolver · drawn',
    JSON.stringify({ weapon: armed.state.weapon, gun: armed.gunParts[0], bar: barArmed.labels[0] }));

  // ---- Ape is holding a gun of his own. ----------------------------------
  // "Ape needs a gun … Ape should be holding his gun." Mounted in his right
  // hand from build (the same `mountHandRevolver` the bathroom man's uses) and
  // shown the moment he gives the order. Arming him must not make him a
  // threat: Actor's locked `hostile` setter is what guarantees that, so it is
  // checked here rather than assumed.
  const apeArmed = await page.evaluate(() => window.silvercase.state().ape);
  check('Ape draws his own big revolver, in his own hand, and is still not hostile',
    apeArmed.armed && apeArmed.gun === 'big-revolver' && apeArmed.gunInHand
      && apeArmed.weaponDrawn === true && apeArmed.weaponVisible === true
      && apeArmed.hostile === false,
    JSON.stringify(apeArmed));

  // ---- The on-screen instruction. ----------------------------------------
  // "There should be a pop up to kill the guy on the couch. Its unclear who to
  // shoot. So the screen should say it like in the hub as a game instruction
  // (not another character or anything)." So: no speaker, no cue, on screen
  // for as long as the order stands.
  /* Wait for Ape to finish naming the man before reading the screen. */
  await tickUntil('instruction');
  const couchInstruction = await page.evaluate(() => {
    const el = document.getElementById('instruction');
    return { text: el.textContent, shown: el.classList.contains('show') };
  });
  check('the couch order puts a speakerless on-screen instruction up and leaves it up',
    couchInstruction.shown && /couch/i.test(couchInstruction.text)
      && /left click/i.test(couchInstruction.text),
    JSON.stringify(couchInstruction));

  // ---- Stand somewhere a person can see the room from. -------------------
  // The WASD check above left the player partway down the corridor, and the
  // shot is a real ray now: from the hallway every one of these checks would
  // be measuring the wall. Put him on the floor of the flat, facing in.
  await page.evaluate(() => {
    const p = window.silvercase.player;
    p.position.set(9.2, 1.66, 0.3);
    p.pitch = 0;
    p.velocity.set(0, 0, 0);
  });
  await page.evaluate(() => window.silvercase.tick(0.05));

  // ---- THE ONE. ----------------------------------------------------------
  //
  //   "you should also actually have to shoot where you are aiming. I just
  //    clicked on the guy in the chair and it killed the bathroom guy."
  //
  // This is that bug, reproduced deliberately: put the crosshair on the man in
  // the chair during the beat that ordered the man on the COUCH shot, and pull
  // the trigger. Nobody may die, the bathroom man least of all — he is still
  // hidden in the alcove and two beats away from existing.
  const wrongMan = await page.evaluate(() => {
    const sc = window.silvercase;
    const aim = sc.shootAt('chester');
    sc.tick(0.2);
    return { aim, state: sc.state() };
  });
  check('aiming at the man in the chair and firing does not kill the man on the couch',
    wrongMan.aim.resolvesTo === 'chester'
      && wrongMan.state.actors.deke.alive === true
      && wrongMan.state.actors.pruitt.alive === true
      && wrongMan.state.beat === 'COUCH_SHOOTING'
      && wrongMan.state.mission.lastShot.actor === 'Chester'
      && wrongMan.state.mission.lastShot.intended === 'Deke'
      && wrongMan.state.mission.lastShot.onTarget === false,
    JSON.stringify({ aim: wrongMan.aim, shot: wrongMan.state.mission.lastShot }));

  check('the man the stray round found is hit but never killed by it',
    wrongMan.state.actors.chester.alive === true
      && wrongMan.state.actors.chester.hp < 60
      && wrongMan.state.marks.onBodies.chester >= 1,
    JSON.stringify({ chester: wrongMan.state.actors.chester, marks: wrongMan.state.marks }));

  // ---- A round that finds nobody still goes somewhere. -------------------
  const strayRound = await page.evaluate(() => {
    const sc = window.silvercase;
    const before = sc.state().marks.holes;
    // Square at the south wall, past the east end of the couch — a shot with
    // nobody anywhere along it.
    sc.player.yaw = Math.PI;
    sc.player.pitch = 0;
    sc.player.update(0);
    sc.pressFire();
    sc.tick(0.2);
    const state = sc.state();
    return { before, after: state.marks.holes, state };
  });
  check('a shot that finds nobody marks the room instead of killing somebody',
    strayRound.after > strayRound.before
      && strayRound.state.mission.lastShot.actor === null
      && strayRound.state.mission.lastShot.surface === true
      && strayRound.state.actors.deke.alive === true
      && strayRound.state.beat === 'COUCH_SHOOTING',
    JSON.stringify({ holes: [strayRound.before, strayRound.after], shot: strayRound.state.mission.lastShot }));

  // ---- Now shoot the man you were told to. -------------------------------
  const dekeSeated = await actorBounds('deke');
  const onTargetCouch = await page.evaluate(() => {
    const sc = window.silvercase;
    const aim = sc.aimAt('deke');
    sc.tick(0.05);
    const hud = {
      tag: document.getElementById('targetTag').classList.contains('show'),
      reticleHot: document.getElementById('reticle').classList.contains('hot'),
      name: document.getElementById('targetTag').textContent,
    };
    return { aim, hud, aimState: sc.state().aim };
  });
  check('putting the crosshair on the ordered man lights the reticle and names him',
    onTargetCouch.aim.resolvesTo === 'deke'
      && onTargetCouch.aimState.onTarget === true
      && onTargetCouch.aimState.ordered === 'Deke'
      && onTargetCouch.hud.tag && onTargetCouch.hud.reticleHot
      && /DEKE/.test(onTargetCouch.hud.name),
    JSON.stringify(onTargetCouch));

  await page.evaluate(() => window.silvercase.pressFire());
  let afterCouchShot = await tickUntil('beat:LOU_QUESTION');
  check('firing on the couch kills Deke and the aftermath line advances to LOU_QUESTION',
    afterCouchShot.met && !afterCouchShot.state.actors.deke.alive
      && afterCouchShot.state.mission.lastShot.onTarget === true,
    JSON.stringify(afterCouchShot));

  // ---- "There also needs to be a bullet impact and blood on the guy." ----
  // The wound is parented to his own trunk, so it travels with the slump
  // rather than hanging in the air where he used to be.
  const dekeBlood = await page.evaluate(() => {
    const sc = window.silvercase;
    const marks = sc.impacts.marksFor(sc.cast.deke);
    return {
      count: sc.state().marks.onBodies.deke,
      attachedToFigure: marks.length > 0 && marks.every((m) => {
        let node = m.parent;
        while (node) { if (node === sc.cast.deke.group) return true; node = node.parent; }
        return false;
      }),
    };
  });
  check('the man shot on the couch wears the wound, and it goes down with him',
    dekeBlood.count >= 2 && dekeBlood.attachedToFigure,
    JSON.stringify(dekeBlood));

  // ---- The body stays on the couch. ------------------------------------
  // The couch's own footprint, straight out of ApartmentScene (x 6.925…9.075,
  // z 1.76…2.64, seat top 0.54). A corpse that sinks through to the floor or
  // slides off the front fails this; whether it STAYS there is checked again
  // at the far end of the mission, once several minutes of story have run.
  // (Nothing long is ticked here on purpose: the Lou question's own choice
  // timeout is six seconds and burning the clock would skip the beat.)
  const COUCH_BOX = { x0: 6.9, x1: 9.1, z0: 1.7, z1: 2.7 };
  const dekeSettled = await actorBounds('deke');
  const dekeSettledAt = (await page.evaluate(() => window.silvercase.state())).actors.deke;
  const onTheCouch = dekeSettled.min[0] > COUCH_BOX.x0 && dekeSettled.max[0] < COUCH_BOX.x1
    && dekeSettled.min[2] > COUCH_BOX.z0 - 0.5 && dekeSettled.max[2] < COUCH_BOX.z1
    && dekeSettled.max[1] > 0.6 && dekeSettled.min[1] > -0.15;
  check('the man shot on the couch slumps onto the couch instead of the floor',
    onTheCouch && dekeSettledAt.seated === true && dekeSettledAt.alive === false,
    JSON.stringify({ before: dekeSeated, settled: dekeSettled }));

  // ---- LOU_QUESTION: let the setup lines drain, then pick the option that
  // irritates Ape ("Depends on the lighting.") via the real 1-4 key path.
  // Polled rather than ticked a fixed duration — see tickUntil's own comment:
  // the mission's requestAnimationFrame loop keeps advancing in real time
  // between every one of this script's await calls, so a fixed-duration
  // tick(N) picked to land just past a dialogue sequence risks landing past
  // the choice's own timeout instead, on a slow enough run. -----------------
  let louSetup = await tickUntil('choice:louQuestion');
  check('the Lou question opens its 1-4 choice once the setup lines finish',
    louSetup.met, JSON.stringify(louSetup));
  await page.keyboard.press('Digit4');
  let afterLou = await tickUntil('beat:SQUATCH_PRAYER');
  check('answering "depends on the lighting" irritates Ape and moves on to the prayer',
    afterLou.met && afterLou.state.mission.flags.irritatedApe === true,
    JSON.stringify(afterLou));

  // ---- SQUATCH_PRAYER: drain Ape's lines, then hold E to finish it. -------
  let prayerLines = await tickUntil('choice:prayerFinish');
  check('the prayer opens its hold-E finish prompt once Ape is done reciting',
    prayerLines.met, JSON.stringify(prayerLines));
  await page.keyboard.down('KeyE');
  let afterPrayer = await tickUntil('beat:CHAIR_SHOOTING');
  /* Ape sets the chair up before the screen names the button. */
  await tickUntil('instruction');
  afterPrayer = { ...afterPrayer, state: await page.evaluate(() => window.silvercase.state()) };
  await page.keyboard.up('KeyE');
  check('finishing the ritual hands over to the chair beat with Chester still alive',
    afterPrayer.met
      && afterPrayer.state.actors.chester.alive === true
      && afterPrayer.state.aim.ordered === 'Chester'
      && /chair/i.test(afterPrayer.state.aim.instruction)
      && afterPrayer.state.aim.instructionShown === true,
    JSON.stringify(afterPrayer));

  // ---- "Ape needs a gun. There should also be a prompt to shoot the guy in
  // the chair with Ape." Both guns are up, the prompt is on screen, and the
  // shot has to land on the man in the chair like every other shot now. ----
  const chairShot = await page.evaluate(() => {
    const sc = window.silvercase;
    const apeBefore = sc.state().ape;
    const aim = sc.shootAt('chester');
    sc.tick(0.05);
    const immediately = sc.state();
    sc.tick(0.8); // Ape's own round follows two tenths behind Tony's
    return {
      apeBefore, aim, immediately, state: sc.state(),
    };
  });
  check('Ape has his gun levelled at the chair while the prompt is up',
    chairShot.apeBefore.weaponDrawn === true && chairShot.apeBefore.weaponVisible === true
      && Math.abs(chairShot.apeBefore.at.x - 8) < 0.6,
    JSON.stringify(chairShot.apeBefore));
  check('shooting the man in the chair kills him, and Ape fires with you',
    chairShot.aim.resolvesTo === 'chester'
      && chairShot.immediately.mission.lastShot.onTarget === true
      && chairShot.state.actors.chester.alive === false
      && chairShot.state.mission.flags.apeFinishedChester === false
      // Tony's wound plus its spatter, plus the round Ape put in him.
      && chairShot.state.marks.onBodies.chester >= 3,
    JSON.stringify({ aim: chairShot.aim, marks: chairShot.state.marks.onBodies }));

  let afterPrayerChain = await tickUntil('beat:BATHROOM_AMBUSH');
  check('the chair beat hands on to the bathroom ambush, armed',
    afterPrayerChain.met
      && afterPrayerChain.state.reactionWindow.state === 'armed'
      && afterPrayerChain.state.reactionWindow.windowSeconds >= 3.2,
    JSON.stringify(afterPrayerChain.state.reactionWindow));

  // ---- The bathroom man is holding the big revolver, and the door he came
  // through is off the latch rather than still standing in his way. The swing
  // is a 0.22 s tween started in the beat's own enter(), so it is given a
  // moment before being measured — "the door opens properly" is a claim about
  // where it ends up, not about the frame the beat began on. ---------------
  await tick(0.5);
  const ambushStaging = await page.evaluate(() => {
    const sc = window.silvercase;
    const gun = sc.cast.pruitt.weapon;
    const parents = [];
    let node = gun.parent;
    while (node && parents.length < 6) { parents.push(node.name || node.type); node = node.parent; }
    return {
      armed: Boolean(gun),
      gunName: gun?.name,
      inHand: parents.includes('forearm'),
      revealed: sc.cast.pruitt.group.visible,
      bathDoorOpen: sc.apartment.doors.bathroomDoor.isOpen(),
      bathDoorRotation: +sc.apartment.doors.bathroomDoor.group.rotation.y.toFixed(3),
    };
  });
  check('the bathroom man comes through an open door with the big revolver in hand',
    ambushStaging.armed && ambushStaging.gunName === 'big-revolver'
      && ambushStaging.inHand && ambushStaging.revealed && ambushStaging.bathDoorOpen,
    JSON.stringify(ambushStaging));

  // ---- BATHROOM_AMBUSH, slow/no-fire path: let Pruitt's reaction window
  // expire untouched. Ape's death here is a direct, scripted kill() call from
  // the state machine, never routed through any player-hit-resolution path. -
  let failedRun = await tickUntil('beat:FAILED');
  await tick(1.5); // let FAILED's own after(1.2) reveal the death overlay
  const deathOverlayAfterFail = await domOverlay('deathOverlay');
  check('missing the bathroom window fails the scene with Ape scripted dead',
    failedRun.met
      && !failedRun.state.actors.ape.alive
      && deathOverlayAfterFail.present && deathOverlayAfterFail.hidden === false,
    JSON.stringify({ failedRun, deathOverlayAfterFail }));

  // ---- Retry from the checkpoint (SQUATCH_PRAYER) restores Ape and Chester,
  // and Pruitt goes back into hiding. -------------------------------------
  let retried = await page.evaluate(() => {
    window.silvercase.retry();
    window.silvercase.tick(0.1);
    return window.silvercase.state();
  });
  const deathOverlayAfterRetry = await domOverlay('deathOverlay');
  check('retrying restores the checkpoint with Ape and Chester alive again',
    retried.beat === 'SQUATCH_PRAYER'
      && retried.actors.ape.alive && retried.actors.chester.alive
      && retried.reactionWindow.state === 'idle'
      && deathOverlayAfterRetry.hidden === true,
    JSON.stringify({ retried, deathOverlayAfterRetry }));

  // ---- Replay the prayer, this time resolving BATHROOM_AMBUSH fast, so the
  // reaction window is neutralized instead of expiring. -------------------
  const prayerAgain = await tickUntil('choice:prayerFinish');
  check('the prayer choice opens again after retrying', prayerAgain.met, JSON.stringify(prayerAgain));
  await page.keyboard.down('KeyE');
  // Second time through the chair beat, nobody pulls the trigger: the stall
  // path has Ape finish it himself after twelve seconds rather than leaving
  // the mission parked on a prompt forever, so this also proves that fallback.
  let afterPrayerAgain = await tickUntil('beat:BATHROOM_AMBUSH');
  await page.keyboard.up('KeyE');
  check('a player who will not take the chair shot has Ape take it, and the scene goes on',
    afterPrayerAgain.met
      && afterPrayerAgain.state.mission.flags.apeFinishedChester === true
      && afterPrayerAgain.state.actors.chester.alive === false
      && afterPrayerAgain.state.reactionWindow.state === 'armed',
    JSON.stringify({
      flags: afterPrayerAgain.state.mission.flags,
      window: afterPrayerAgain.state.reactionWindow,
    }));

  // ---- The owner's bug, in the beat it actually happened in. -------------
  // Both shots go inside ONE page.evaluate: the reaction window is running in
  // real time as well as ticked time, and a Node round trip between them would
  // be measuring the harness rather than the mission.
  const ambushAim = await page.evaluate(() => {
    const sc = window.silvercase;
    // Point at the man in the CHAIR — dead, in the wrong direction entirely —
    // and fire. This must not touch the man in the bathroom doorway.
    const wrongAim = sc.shootAt('chester');
    sc.tick(0.05);
    const afterWrong = sc.state();
    // Now point at the man who is actually pointing a gun at you.
    const rightAim = sc.shootAt('pruitt');
    sc.tick(0.05);
    return {
      wrongAim, afterWrong, rightAim, state: sc.state(),
    };
  });
  // The assertion is "the round did not find Pruitt", not "the round found
  // Chester": Ape is stood a pace off the chair by this point, so a shot aimed
  // past him at the slumped man behind him hits APE — which is the system
  // working, not failing. Whoever the ray finds, it is not the man in the
  // bathroom doorway, and the window does not close.
  check('firing at the chair during the ambush does NOT kill the bathroom man',
    ambushAim.wrongAim.resolvesTo !== 'pruitt'
      && ambushAim.afterWrong.actors.pruitt.alive === true
      && ambushAim.afterWrong.reactionWindow.state === 'armed'
      && ambushAim.afterWrong.mission.lastShot.intended === 'Pruitt'
      && ambushAim.afterWrong.mission.lastShot.actor !== 'Pruitt'
      && ambushAim.afterWrong.mission.lastShot.onTarget === false,
    JSON.stringify({ aim: ambushAim.wrongAim, shot: ambushAim.afterWrong.mission.lastShot }));
  check('firing at the bathroom man neutralizes him, with blood on him',
    ambushAim.rightAim.resolvesTo === 'pruitt'
      && ambushAim.state.reactionWindow.state === 'neutralized'
      && ambushAim.state.actors.pruitt.alive === false
      && ambushAim.state.marks.onBodies.pruitt >= 2,
    JSON.stringify({ aim: ambushAim.rightAim, marks: ambushAim.state.marks.onBodies }));
  let afterAmbush = await tickUntil('beat:AFTERMATH');
  check('a fast, successful shot advances the mission to AFTERMATH', afterAmbush.met, JSON.stringify(afterAmbush));

  // ---- AFTERMATH: spare Winston via the real 1-4 choice path. ------------
  let aftermathIntro = await tickUntil('choice:aftermath');
  check('the aftermath choice opens once Ape’s opening line finishes',
    aftermathIntro.met, JSON.stringify(aftermathIntro));
  await page.keyboard.press('Digit1');
  let afterAftermath = await tickUntil('beat:PICK_UP_CASE');
  check('sparing Winston keeps him alive and moves the mission to PICK_UP_CASE',
    afterAftermath.met && afterAftermath.state.actors.winston.alive,
    JSON.stringify(afterAftermath));

  // ---- Every body from every earlier beat is still exactly where it died.
  // Minutes of mission time have passed since the couch — the Lou question,
  // the prayer, a failed run, a retry, the ambush and the aftermath — so if
  // anything were still creeping, this is where it would show. --------------
  const chesterRest = await actorBounds('chester');
  const pruittRest = await actorBounds('pruitt');
  const dekeMuchLater = await actorBounds('deke');
  const bodiesNow = (await page.evaluate(() => window.silvercase.state())).actors;
  check('every body is still exactly where it fell, minutes later',
    JSON.stringify(dekeMuchLater) === JSON.stringify(dekeSettled)
      && bodiesNow.chester.alive === false && chesterRest.max[1] > 0.6 && chesterRest.min[1] > -0.2
      && Math.abs(bodiesNow.chester.at.x - 8) < 0.35
      && bodiesNow.pruitt.alive === false && pruittRest.max[1] < 0.9 && pruittRest.min[1] > -0.2,
    JSON.stringify({ deke: dekeMuchLater, chester: chesterRest, pruitt: pruittRest }));

  // ---- The other half of the aftermath choice. --------------------------
  //
  //   "if you are going to not spare the last guy then you should get a prompt
  //    to shoot him. Again blood and impact."
  //
  // The linear run above spares him — the canonical route, and the check
  // directly before this one. The kill branch cannot be reached from here
  // without replaying the entire mission, so it is entered with the same
  // `go()` this script uses to reach every other beat. The contract being
  // checked is precisely the owner's: picking "kill him" must NOT kill him on
  // the keypress; it must hand the player a prompt and a trigger.
  let execute = await go('EXECUTE_WINSTON', 0.3);
  /* Ape gives the order, then the screen names the button. */
  await tickUntil('instruction');
  execute = await page.evaluate(() => window.silvercase.state());
  check('choosing to kill the last man prompts for it rather than killing him on the keypress',
    execute.beat === 'EXECUTE_WINSTON'
      && execute.actors.winston.alive === true
      && execute.aim.ordered === 'Winston'
      && /winston/i.test(execute.aim.instruction)
      && execute.aim.instructionShown === true
      && execute.weapon.drawn === true,
    JSON.stringify({ beat: execute.beat, aim: execute.aim, winston: execute.actors.winston }));

  const winstonShot = await page.evaluate(() => {
    const sc = window.silvercase;
    const aim = sc.shootAt('winston');
    sc.tick(0.2);
    return { aim, state: sc.state() };
  });
  check('shooting the last man puts him down where he stood, with blood and an impact',
    winstonShot.aim.resolvesTo === 'winston'
      && winstonShot.state.actors.winston.alive === false
      && winstonShot.state.mission.lastShot.onTarget === true
      && winstonShot.state.marks.onBodies.winston >= 2,
    JSON.stringify({ aim: winstonShot.aim, marks: winstonShot.state.marks.onBodies }));

  let afterExecution = await tickUntil('beat:PICK_UP_CASE');
  check('the execution hands back to the case pickup with both guns away',
    afterExecution.met && afterExecution.state.weapon.drawn === false
      && afterExecution.state.ape.weaponDrawn === false,
    JSON.stringify({ beat: afterExecution.state.beat, weapon: afterExecution.state.weapon }));

  // ---- Picking the case up: the real E interaction, aimed at the real hit
  // box. The look-at raycast reads the camera's world matrix from the last
  // rendered frame, so the pose has to be set, a frame allowed to happen, and
  // only then the key pressed — exactly the order a player does it in. ------
  await page.evaluate(() => {
    const p = window.silvercase.player;
    p.position.set(9.6, 1.66, 2.5);
    p.yaw = 0;
    p.pitch = -Math.atan2(1.46, 0.85);
  });
  // A wall-clock sleep is not a rendered-frame guarantee in headless Chromium:
  // under load, 150 ms can elapse before requestAnimationFrame paints even
  // once. The interaction ray reads camera.matrixWorld from the last render,
  // so wait for the frame loop itself (twice, to clear callback ordering)
  // instead of hoping a timer happened to contain one.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const promptOnCase = await page.evaluate(() => {
    window.silvercase.tick(0.1);
    return document.getElementById('promptText').textContent;
  });
  await page.evaluate(() => {
    window.silvercase.interactions.press();
    window.silvercase.interactions.release();
    window.silvercase.tick(1.2);
  });
  const carried = await page.evaluate(() => window.silvercase.state());
  const barCarrying = await hotbar();
  check('taking the case moves it into Tony’s hands, shut, and onto the inventory bar',
    promptOnCase === 'Take the case'
      && carried.beat === 'EXIT'
      && carried.case.carried === true && carried.case.inWorld === false
      && carried.case.shut === true && carried.case.openness === 0
      && carried.weapon.drawn === false
      && barCarrying.labels[1] === 'Lou’s case · closed',
    JSON.stringify({ promptOnCase, case: carried.case, bar: barCarrying.labels.slice(0, 2) }));

  // ---- PICK_UP_CASE -> EXIT -> SCENE_COMPLETE ----------------------------
  let exitBeat = await go('EXIT');
  check('EXIT is reachable once the case is in hand', exitBeat.beat === 'EXIT', exitBeat.beat);
  await page.evaluate(() => { window.silvercase.player.position.x = 1.0; });
  let complete = await tickUntil('beat:SCENE_COMPLETE');
  await tick(1.5); // let SCENE_COMPLETE's own after(1.0) reveal the end card
  const sceneCompleteOverlay = await domOverlay('sceneCompleteOverlay');
  const hudVisible = await page.evaluate(
    () => document.getElementById('hud').classList.contains('visible'),
  );
  check('walking back near the hallway spawn completes the scene',
    complete.met
      && sceneCompleteOverlay.present && sceneCompleteOverlay.hidden === false
      && hudVisible === false,
    JSON.stringify({ complete, sceneCompleteOverlay, hudVisible }));

  // ---- Preview checkpoint links (?checkpoint=...) ------------------------
  // Standalone scene, no `?preview=1` gate needed (see the doc comment above
  // `jumpToPreviewCheckpoint` in src/silvercase/main.js). Each of the six
  // owner-facing waypoints gets its own fresh page so `previewCheckpoint` is
  // parsed from that page's own URL at load time, exactly the way an owner
  // clicking a preview.html link would load it.
  for (const [id, expectBeat] of [
    ['car', 'CAR_RIDE'],
    ['hallway', 'ARRIVE_HALLWAY'],
    ['room', 'ESTABLISH_CONTROL'],
    ['prayer', 'SQUATCH_PRAYER'],
    ['bathroom', 'BATHROOM_AMBUSH'],
    ['aftermath', 'AFTERMATH'],
  ]) {
    const cpPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const cpProblems = [];
    cpPage.on('pageerror', (error) => cpProblems.push(error.message));
    cpPage.on('console', (message) => {
      if (message.type() === 'error') cpProblems.push(message.text().slice(0, 240));
    });
    await cpPage.goto(`http://localhost:${PORT}/silvercase.html?preview=1&checkpoint=${id}`, { waitUntil: 'load' });
    await cpPage.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });
    const chip = await cpPage.evaluate(() => document.querySelector('#menu .subtitle')?.textContent ?? '');
    const result = await cpPage.evaluate(async () => {
      // begin() awaits audio.loadManifest(...) before it transitions the FSM
      // at all (see the CAR_RIDE/V1 check above) — await it here too, or
      // every one of these six preview checkpoints would still be reading
      // MENU rather than its own waypoint.
      await window.silvercase.begin();
      window.silvercase.tick(0.2);
      return window.silvercase.state();
    });
    check(`?checkpoint=${id} loads staged and lands on ${expectBeat}`,
      result.beat === expectBeat
        && chip.startsWith('Preview checkpoint:')
        && cpProblems.length === 0,
      JSON.stringify({ beat: result.beat, chip, problems: cpProblems }));
    await cpPage.close();
  }

  check('no runtime console errors or page errors occurred', problems.length === 0,
    problems.join(' | ').slice(0, 800));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Silver Case checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Silver Case checks passed.`);

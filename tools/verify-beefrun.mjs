#!/usr/bin/env node
/**
 * Verify the Beef Run's campaign integration in a real browser: the preview
 * boots save-isolated, the mission begins through the airstrip story, every
 * checkpoint persists, completion is durable, the ending routes home, and a
 * saved mid-mission campaign resumes in the cockpit rather than starting over.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCues, BARKS } from '../src/beefrun/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5211;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const SENTINEL = '{"version":999,"canonical":"beefrun verifier must not touch this"}';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Beef Run.');
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
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

/* Script is the authority for spoken words. This closes the silent failure
 * where a subtitle exists but no exact cue reaches the manifest/audio bank. */
const authoredCues = allCues();
const authoredNames = authoredCues.map((line) => `vo.${line.cue}.1`);
const authoredNameSet = new Set(authoredNames);
const authoredFileSet = new Set(authoredNames.map((name) => `${name}.mp3`));
const voiceManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const beefManifest = voiceManifest.sfx.filter((cue) => cue.name.startsWith('vo.beefrun.'));
const manifestByName = new Map(beefManifest.map((cue) => [cue.name, cue]));
const cueMismatches = authoredCues.filter((line) => {
  const manifestCue = manifestByName.get(`vo.${line.cue}.1`);
  return !manifestCue || manifestCue.say !== line.text;
});
const recordedFiles = fs.readdirSync(path.join(ROOT, 'assets', 'sfx'))
  .filter((name) => name.startsWith('vo.beefrun.') && name.endsWith('.mp3'));
const orphanedRecordings = recordedFiles.filter((name) => !authoredFileSet.has(name));
const audioIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(audioIndex.files || []);
const unindexedRecordings = recordedFiles.filter((name) => !indexedFiles.has(name));
const runtimeSharedCues = new Set([
  'gun.dry',
  'neighbours.thump',
  'switch.click',
  'gun.impact',
  'can.set',
  'pc.boot',
  'can.crack',
  'gun.shot',
  'can.crush',
  'glue.slip',
  'ui.select',
  'frame.adjust',
  'door.knob',
  'closet.slide',
]);
const expectedResidentCues = voiceManifest.sfx
  .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
  .filter((cue) => cue.name.startsWith('vo.beefrun.')
    || cue.name.startsWith('beefrun.')
    || cue.name.startsWith('footstep.')
    || cue.name.startsWith('ambience.')
    || runtimeSharedCues.has(cue.name))
  .map((cue) => cue.name);
check('every spoken line has one unique exact cue in the voice manifest',
  authoredNameSet.size === authoredNames.length
    && beefManifest.length === authoredNames.length
    && cueMismatches.length === 0,
  JSON.stringify({ authored: authoredNames.length, manifest: beefManifest.length, mismatches: cueMismatches.length }));
check('every Beef Run recording still maps to an authored line',
  orphanedRecordings.length === 0 && unindexedRecordings.length === 0,
  JSON.stringify({ recorded: recordedFiles.length, orphaned: orphanedRecordings,
    unindexed: unindexedRecordings }));
check('Sasole has a full stable-flight rotation and contextual final-approach pools',
  BARKS.cruise.length >= 6
    && ['finalLine', 'finalFast', 'finalHigh', 'finalFlare'].every((pool) => BARKS[pool]?.length >= 3),
  JSON.stringify({ cruise: BARKS.cruise.length,
    final: Object.fromEntries(['finalLine', 'finalFast', 'finalHigh', 'finalFlare'].map((pool) => [pool, BARKS[pool]?.length])) }));

try {
  /* ---- pass one: the save-isolated preview, played through ---- */

  const page = await browser.newPage({
    viewport: { width: 960, height: 600 },
    // Exercise the renderer cap on the high-DPI display it is meant to tame.
    deviceScaleFactor: 2,
  });
  await page.addInitScript((sentinel) => {
    if (localStorage.getItem('squatchlife.campaign') === null) {
      localStorage.setItem('squatchlife.campaign', sentinel);
    }
  }, SENTINEL);
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
  const storageSnapshot = () => page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  const unchanged = (snapshot) => JSON.stringify(snapshot)
    === JSON.stringify({ 'squatchlife.campaign': SENTINEL });

  await page.goto(`http://localhost:${PORT}/beefrun.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });

  const booted = await page.evaluate(() => {
    const b = window.__beefrun;
    const terrainBefore = { chunks: b.terrain.chunks.size, queued: b.terrain.queue.length };
    const parking = b.mission.airfield.anchors.parking;
    b.terrain.update(parking.x, parking.z, 0);
    const builtInOneUpdate = b.terrain.chunks.size;
    b.terrain.clear();
    return {
      scene: b.campaignState.scene.id,
      mission: b.campaignState.missions.airstrip_smuggling,
      squatchfather: b.campaignState.missions.squatchfather.status,
      booski: b.campaignState.events.booski_day_two_call.status,
      previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
      watchdogReady: window.__squatch?.beefrun === true,
      pixelRatio: b.mission.renderer.getPixelRatio(),
      shadowType: b.mission.renderer.shadowMap.type,
      shadowMap: [b.weather.sun.shadow.mapSize.x, b.weather.sun.shadow.mapSize.y],
      terrainBefore,
      builtInOneUpdate,
    };
  });
  check('the preview boots with the airstrip available and its prerequisites seeded',
    booted.scene === 'airstrip_smuggling'
      && booted.mission.status === 'available'
      && booted.squatchfather === 'complete'
      && booted.booski === 'answered'
      && booted.previewNotice,
    JSON.stringify(booted));
  check('the preview defers terrain and caps high-DPI shadow work before Start',
    booted.watchdogReady
      && booted.pixelRatio === 1.25
      && booted.shadowType === 1
      && booted.shadowMap[0] === 1024
      && booted.shadowMap[1] === 1024
      && booted.terrainBefore.chunks === 0
      && booted.terrainBefore.queued === 0
      && booted.builtInOneUpdate === 1,
    JSON.stringify({
      watchdogReady: booted.watchdogReady,
      pixelRatio: booted.pixelRatio,
      shadowType: booted.shadowType,
      shadowMap: booted.shadowMap,
      terrainBefore: booted.terrainBefore,
      builtInOneUpdate: booted.builtInOneUpdate,
    }));

  /* Pressing start decodes the whole sample bank before the mission begins,
   * and that bank is now over a thousand recordings. On a software renderer
   * that is minutes, not seconds — so this wait is budgeted for the load, not
   * for the frame. */
  /* Dispatched rather than clicked: Playwright's actionability check waits for
   * the page to go quiet, and a page rendering a mountain range on a software
   * rasteriser never does. The listener only wants the event. */
  const audioLoadStartedAt = Date.now();
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__beefrun.mission.phase === 'arrival', null, { timeout: 300000 });
  const audioLoadMs = Date.now() - audioLoadStartedAt;
  const started = await page.evaluate((expectedCues) => {
    const b = window.__beefrun;
    const audioEngine = b.audio.engine;
    const residentNames = [...audioEngine.buffers.keys()];
    const cx = Math.round(b.player.position.x / 500);
    const cz = Math.round(b.player.position.z / 500);
    return {
      phase: b.mission.phase,
      status: b.campaignState.missions.airstrip_smuggling.status,
      checkpoint: b.campaignState.missions.airstrip_smuggling.checkpoint,
      terrainChunks: b.terrain.chunks.size,
      centreChunkReady: b.terrain.chunks.has(`${cx},${cz}`),
      inventorySlots: document.querySelectorAll('#hotbar .slot').length,
      inventoryVisible: !!document.getElementById('hotbar')
        && !document.getElementById('hotbar').classList.contains('hidden'),
      inventorySlotCount: document.getElementById('hotbar')?.dataset.slotCount ?? null,
      audio: {
        manifestTotal: audioEngine.preloadStats?.manifestTotal ?? null,
        selected: audioEngine.preloadStats?.selected ?? null,
        loaded: audioEngine.loadedCount,
        residentNames: residentNames.length,
        missingExpected: expectedCues.filter((name) => !audioEngine.buffers.has(name)),
        unrelatedCampaignVo: residentNames.filter((name) => name.startsWith('vo.')
          && !name.startsWith('vo.beefrun.')),
      },
    };
  }, expectedResidentCues);
  check('starting the mission records in_progress at the airstrip checkpoint',
    started.phase === 'arrival'
      && started.status === 'in_progress'
      && started.checkpoint === 'airstrip'
      && started.terrainChunks >= 1
      && started.centreChunkReady,
    JSON.stringify(started));
  check('Beef Run keeps the shared five-box inventory visible during gameplay',
    started.inventoryVisible && started.inventorySlots === 5 && started.inventorySlotCount === '5',
    JSON.stringify({ visible: started.inventoryVisible, slots: started.inventorySlots,
      slotCount: started.inventorySlotCount }));
  check('Beef Run decodes only its complete recorded audio set',
    started.audio.manifestTotal === voiceManifest.sfx.length
      && started.audio.selected === expectedResidentCues.length
      && started.audio.loaded === expectedResidentCues.length
      && started.audio.missingExpected.length === 0
      && started.audio.unrelatedCampaignVo.length === 0,
    JSON.stringify({ ...started.audio, expected: expectedResidentCues.length, loadMs: audioLoadMs }));

  const eye = await page.evaluate(() => {
    const p = window.__beefrun.player;
    return { y: p.position.y, ground: p.ground, eye: p.position.y - p.ground };
  });
  check('the on-foot camera rides the terrain at human eye height',
    eye.eye > 1.0 && eye.eye < 2.2 && Number.isFinite(eye.ground),
    JSON.stringify(eye));

  /* The wave-2 scene notes: the walkaround must be guided (a named next item,
   * six checklist rows, a marker that lives in the scene), the parked wing
   * must not stand inside the hangar's front wall at z=396, and Old Stove
   * starts inside the hangar (z past the door plane) so he has somewhere to
   * walk out from. */
  const scenePass = await page.evaluate(() => {
    const m = window.__beefrun.mission;
    const rows = m.preflight.checklist;
    const dx = m.player.position.x - m.lou.group.position.x;
    const dz = m.player.position.z - m.lou.group.position.z;
    const facing = Math.abs(Math.atan2(Math.sin(m.lou.group.rotation.y - Math.atan2(dx, dz)), Math.cos(m.lou.group.rotation.y - Math.atan2(dx, dz))));
    return {
      next: m.preflight.next?.name,
      rows: rows.length,
      states: rows.map((r) => r.state).join(','),
      markerInScene: !!m.preflight.marker?.parent,
      wingtipClear: m.airfield.anchors.parking.z + 17.2 / 2 < 396,
      stoveInHangar: m.stove.group.position.z > 396,
      louFaceToward: typeof m.lou.faceToward === 'function',
      louFacingPlayer: +facing.toFixed(3),
    };
  });
  check('the walkaround is guided, Lou faces Tony, and the parked aeroplane fits the field',
    scenePass.next === 'chocks'
      && scenePass.rows === 6
      && scenePass.states === 'next,todo,todo,todo,todo,todo'
      && scenePass.markerInScene
      && scenePass.wingtipClear
      && scenePass.stoveInHangar
      && scenePass.louFaceToward
      && scenePass.louFacingPlayer < 0.01,
    JSON.stringify(scenePass));

  /* The two men on the apron are named, and the names ride with them. */
  const tags = await page.evaluate(async () => {
    const m = window.__beefrun.mission;
    const V = window.__beefrun.physics.position.constructor;
    const read = (f) => {
      const p = new V();
      f.tag?.getWorldPosition(p);
      return {
        text: f.tag?.userData.text ?? null,
        sprite: f.tag?.type === 'Sprite',
        onFigure: f.tag?.parent === f.group,
        world: p.clone(),
      };
    };
    const lou = read(m.lou);
    const stoveBefore = read(m.stove);
    // Walk him a few metres and see whether the name goes with him.
    const npc = await import('/src/beefrun/npc.js');
    const from = m.stove.group.position.clone();
    npc.walkTo(m.stove, from.x + 6, from.z - 6, { speed: 40 });
    for (let i = 0; i < 30; i++) npc.updateFigure(m.stove, 0.05, null);
    const stoveAfter = read(m.stove);
    return {
      lou: { text: lou.text, sprite: lou.sprite, onFigure: lou.onFigure },
      stove: { text: stoveBefore.text, sprite: stoveBefore.sprite, onFigure: stoveBefore.onFigure },
      figureMoved: +m.stove.group.position.distanceTo(from).toFixed(2),
      tagMoved: +stoveAfter.world.distanceTo(stoveBefore.world).toFixed(2),
    };
  });
  check('both airfield NPCs carry a name tag that tracks them',
    tags.lou.text === 'CAPT. LOU SASOLE' && tags.lou.sprite && tags.lou.onFigure
      && tags.stove.text === 'OLD STOVE' && tags.stove.sprite && tags.stove.onFigure
      && tags.figureMoved > 1 && Math.abs(tags.tagMoved - tags.figureMoved) < 0.5,
    JSON.stringify(tags));

  /* Captain Sasole wears his own face, and does not stand perfectly still. */
  const sasole = await page.evaluate(async () => {
    const m = window.__beefrun.mission;
    const npc = await import('/src/beefrun/npc.js');
    const skull = m.lou.neck.children.find((c) => Array.isArray(c.material));
    const faceMat = skull?.material[4];
    const img = faceMat?.map?.image;
    // Twenty seconds of standing about, sampled.
    const seen = { hipX: [], hipZ: [], arm: [] };
    for (let i = 0; i < 400; i++) {
      npc.updateFigure(m.lou, 0.05, null);
      seen.hipX.push(m.lou.hips.position.x);
      seen.hipZ.push(m.lou.hips.rotation.z);
      seen.arm.push(m.lou.arms[0].shoulder.rotation.x);
    }
    const span = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(4);
    return {
      photoSkull: !!skull,
      faceOnFront: !!faceMat?.map,
      textureLoaded: !!(img && img.width > 0),
      src: faceMat?.map?.image?.currentSrc?.split('/').slice(-2).join('/') ?? null,
      sway: span(seen.hipX),
      lean: span(seen.hipZ),
      gesture: span(seen.arm),
    };
  });
  check("Captain Sasole wears his own photograph and does not stand like a post",
    sasole.photoSkull && sasole.faceOnFront && sasole.textureLoaded
      && sasole.src === 'faces/sasole.png'
      && sasole.sway > 0.01 && sasole.lean > 0.01 && sasole.gesture > 0.3,
    JSON.stringify(sasole));

  /* The walkaround marker stands on the part, not on the grass behind it. */
  const marks = await page.evaluate(() => {
    const b = window.__beefrun;
    // The marker only exists once the walkaround is armed.
    b.mission.setPhase('preflight');
    const pf = b.mission.preflight;
    const V = b.physics.position.constructor;
    const names = ['chocks', 'caps', 'props', 'sample', 'door', 'surfaces'];
    const rows = [];
    for (const name of names) {
      for (const n of names) pf.tasks[n].done = names.indexOf(n) < names.indexOf(name);
      pf.update(0.016, b.physics, b.mission.camera);
      const target = pf.markerTarget();
      const tw = new V(); target.getWorldPosition(tw);
      const mw = new V(); pf.marker.getWorldPosition(mw);
      rows.push({ name, off: +mw.distanceTo(tw).toFixed(2), up: +(mw.y - tw.y).toFixed(2) });
    }
    for (const n of names) pf.tasks[n].done = false;
    pf.update(0.016, b.physics, b.mission.camera);
    return {
      rows,
      // The highlight has to be readable through the aeroplane it is on.
      throughMetal: pf.markerRing.material.depthTest === false,
    };
  });
  check('every walkaround marker sits on its own part, drawn through the airframe',
    marks.rows.every((r) => r.off < 0.6) && marks.throughMetal,
    JSON.stringify(marks));

  /* The fuel sample: stand where the marker is, press E, get a cup. Twice. */
  const sample = await page.evaluate(() => {
    const b = window.__beefrun;
    const pf = b.mission.preflight;
    for (const n of ['chocks', 'caps', 'props']) pf.tasks[n].done = true;
    const standAtMarker = () => {
      pf.update(0.016, b.physics, b.mission.camera);
      /* The scoped audio bank makes Start fast enough that this synthetic
       * teleport can run before the renderer's first post-begin matrix pass.
       * A player cannot interact before a displayed frame; mirror that frame
       * boundary so the drain's child hit proxy has its current world matrix. */
      b.mission.scene.updateMatrixWorld(true);
      const target = pf.markerTarget();
      const V = b.physics.position.constructor;
      const wp = new V(); target.getWorldPosition(wp);
      /* The bright marker stays on the actual valve; its footprint is the
       * player-facing stand point. The fuel drains deliberately put that
       * footprint outboard of the wing root so the player can see and reach
       * the valve rather than standing directly underneath it. */
      const mk = new V();
      pf.markerFoot.getWorldPosition(mk);
      b.player.position.x = mk.x;
      b.player.position.z = mk.z;
      b.player.ground = b.player.position.y - b.player.eyeHeight;
      const dx = wp.x - b.player.position.x;
      const dz = wp.z - b.player.position.z;
      const dy = wp.y - b.player.position.y;
      const h = Math.hypot(dx, dz);
      b.player.yaw = Math.atan2(-dx, -dz);
      b.player.pitch = Math.max(b.player.pitchMin, Math.min(b.player.pitchMax, Math.atan2(dy, h)));
      b.player.update(0.001);
      b.player.camera.updateMatrixWorld(true);
      b.interaction.update(0.016);
      return b.interaction.current === target;
    };
    const found = [];
    const tap = () => { b.interaction.press(); b.interaction.release(); };
    found.push(standAtMarker());
    const promptShown = !document.getElementById('prompt').classList.contains('hidden');
    tap();
    const afterOne = pf.tasks.sample.count;
    found.push(standAtMarker());
    tap();
    return {
      crosshairFoundBoth: found.every(Boolean),
      promptShown,
      afterOne,
      done: pf.tasks.sample.done,
      count: pf.tasks.sample.count,
      need: pf.tasks.sample.need,
      drawn: pf.sampleDrawn.slice(),
      puddles: pf.puddles.size,
    };
  });
  check('a fuel sample can be drawn by pressing E where the marker stands',
    sample.crosshairFoundBoth && sample.promptShown
      && sample.afterOne === 1 && sample.done && sample.count === 2
      && sample.drawn.every(Boolean) && sample.puddles === 2,
    JSON.stringify(sample));

  /* Old Stove's crates say what they are on the lid and what they are not on
   * both sides. */
  const crates = await page.evaluate(async () => {
    const cargo = await import('/src/beefrun/cargo.js');
    const crate = cargo.makeGunCrate(0);
    const decals = crate.group.children.filter((c) => c.material?.map);
    const lid = decals.find((d) => Math.abs(d.rotation.x + Math.PI / 2) < 0.01);
    const sides = decals.filter((d) => d !== lid);
    return {
      lid: !!lid,
      lidPainted: !!(lid?.material.map.image?.width),
      sides: sides.length,
      bothFaces: sides.length === 2
        && sides.some((s) => s.position.z > 0) && sides.some((s) => s.position.z < 0),
      sharedSideArt: sides.length === 2 && sides[0].material.map === sides[1].material.map,
    };
  });
check("the gun crates carry a rifle on the lid and Stove's story on both sides",
  crates.lid && crates.lidPainted && crates.bothFaces && crates.sharedSideArt,
  JSON.stringify(crates));

/* Loading used to be a cart-routing minigame: lift, park, push, choose a bay,
 * strap, then close the door. The authored route is now deliberately direct:
 * each E on a crate secures the next bay and the third closes the door. */
const directLoading = await page.evaluate(async () => {
  const b = window.__beefrun;
  const { Loading } = await import('/src/beefrun/loading.js');
  const { CargoWeightSystem } = await import('/src/beefrun/cargo.js');
  const Group = b.aircraft.group.constructor;
  const stage = new Group();
  const hold = new Group();
  b.mission.scene.add(stage);
  const cargo = new CargoWeightSystem(hold);
  const loading = new Loading({
    scene: stage,
    interaction: b.interaction,
    aircraft: { group: new Group() },
    cargo,
    dialogue: { play() {} },
    audio: { play() {} },
    groundAt: () => 0,
    stackAt: { x: 9000, z: 9000 },
    kind: 'jerky',
    count: 3,
  });
  let completed = false;
  loading.onComplete = () => { completed = true; };
  loading.arm();
  const openedForCrates = loading.doorOpen && !loading.doorLatched;
  const targets = loading.registered.length;
  const labels = loading.crates.map((crate) => loading.loadCrate(crate));
  const result = {
    noCart: !loading.cart,
    openedForCrates,
    targets,
    labels,
    aboard: cargo.crateCount,
    strapped: cargo.allStrapped,
    doorClosed: !loading.doorOpen && loading.doorLatched,
    completed,
  };
  loading.dispose();
  stage.parent?.remove(stage);
  return result;
});
check('each crate loads directly with E, without a cart or hold-bay steps',
  directLoading.noCart && directLoading.openedForCrates
    && directLoading.targets === 3 && directLoading.labels.every(Boolean)
    && directLoading.aboard === 3 && directLoading.strapped
    && directLoading.doorClosed && directLoading.completed,
  JSON.stringify(directLoading));

const runwayStart = await page.evaluate(() => {
  const b = window.__beefrun;
  const m = b.mission;
  m.disarmBoardingTarget();
  m.flags.louAboard = false;
  m.flags.inCockpit = false;
  m.setPhase('boarding');
  const hiddenUntilLouSeats = !m.boardTarget;

  // A direct or stale interaction cannot cut away while Lou is still climbing.
  m.enterCockpit();
  const earlyBoardBlocked = m.phase === 'boarding' && !m.flags.inCockpit;
  m.updateBoarding(3.5);
  const offeredAfterLouSeats = m.flags.louAboard && !!m.boardTarget;
  m.enterCockpit();

  const target = m.airfield.anchors.lineUp;
  const staged = {
    phase: m.phase,
    flagged: m.flags.runwayStaged,
    x: b.physics.position.x,
    z: b.physics.position.z,
    targetX: target.x,
    targetZ: target.z,
    heading: b.physics.headingDeg,
    targetHeading: m.airfield.anchors.departHeading,
    speed: b.physics.velocity.length(),
    inputBrake: b.input.parkingBrake,
    physicsBrake: b.physics.controls.parkingBrake,
  };

  // Complete the checklist state and release the brake: the next phase must be
  // takeoff on this same centreline, never the removed player-taxi leg.
  b.engines.forceRunning();
  b.input.throttle = 0.1;
  b.input.parkingBrake = false;
  b.physics.controls.parkingBrake = false;
  m.updateStartup(0.016);

  return {
    hiddenUntilLouSeats,
    earlyBoardBlocked,
    offeredAfterLouSeats,
    staged,
    takeoffPhase: m.phase,
    lineupReady: m.flags.lineupReady,
    objective: m.objective,
  };
});
check('Lou seats first, then boarding cuts the stopped aircraft to runway 18',
  runwayStart.hiddenUntilLouSeats
    && runwayStart.earlyBoardBlocked
    && runwayStart.offeredAfterLouSeats
    && runwayStart.staged.phase === 'startup'
    && runwayStart.staged.flagged
    && Math.abs(runwayStart.staged.x - runwayStart.staged.targetX) < 0.01
    && Math.abs(runwayStart.staged.z - runwayStart.staged.targetZ) < 0.01
    && Math.abs(runwayStart.staged.heading - runwayStart.staged.targetHeading) < 0.01
    && runwayStart.staged.speed < 0.01
    && runwayStart.staged.inputBrake
    && runwayStart.staged.physicsBrake,
  JSON.stringify(runwayStart));
check('finishing the runway startup goes directly to takeoff, not taxi',
  runwayStart.takeoffPhase === 'lineup'
    && runwayStart.lineupReady
    && /take off/i.test(runwayStart.objective),
  JSON.stringify({
    phase: runwayStart.takeoffPhase,
    lineupReady: runwayStart.lineupReady,
    objective: runwayStart.objective,
  }));

const chain = await page.evaluate(() => {
    const m = window.__beefrun.mission;
    const out = [];
    const record = () => {
      const mission = window.__beefrun.campaignState.missions.airstrip_smuggling;
      out.push({ checkpoint: mission.checkpoint, cargoLoaded: mission.cargoLoaded });
    };
    m.saveCheckpoint('takeoff'); record();
    m.saveCheckpoint('approach'); record();
    m.saveCheckpoint('departure'); record();
    m.saveCheckpoint('return'); record();
    return out;
  });
  check('every mission checkpoint persists through the campaign save',
    chain[0].checkpoint === 'airstrip'
      && chain[1].checkpoint === 'remote_strip'
      && chain[2].checkpoint === 'returning' && chain[2].cargoLoaded
      && chain[3].checkpoint === 'landed_home',
    JSON.stringify(chain));

  const detected = await page.evaluate(() => {
    window.__beefrun.mission.onDetectionState('located');
    return window.__beefrun.campaignState.missions.airstrip_smuggling.detected;
  });
  check('being located by the patrol persists on the mission record', detected === true);

  const completed = await page.evaluate(() => {
    window.__beefrun.mission.runEnding();
    const state = window.__beefrun.campaignState;
    return {
      status: state.missions.airstrip_smuggling.status,
      landingQuality: state.missions.airstrip_smuggling.landingQuality,
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      timeEvents: state.story.timeEvents,
    };
  });
  check('the ending records durable completion with a landing quality',
    completed.status === 'complete'
      && typeof completed.landingQuality === 'string'
      && completed.landingQuality.length > 0,
    JSON.stringify({ status: completed.status, landingQuality: completed.landingQuality }));
  check('completion lands the authored clock at Day 2, 8:30 PM',
    completed.day === 2
      && completed.timeMinutes === 20 * 60 + 30
      && completed.timeEvents.includes('mission.airstrip'),
    JSON.stringify({ day: completed.day, timeMinutes: completed.timeMinutes }));

  await page.evaluate(() => {
    // The real end-card path: releases pointer lock and shows the buttons.
    window.__beefrun.flightHud.showComplete(window.__beefrun.mission.report());
  });
  const frozen = await page.evaluate(async () => {
    // Give the aeroplane a shove; a live simulation would integrate it.
    const b = window.__beefrun;
    b.physics.velocity.set(0, 0, 5);
    const before = { x: b.physics.position.x, z: b.physics.position.z };
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      completeUp: b.flightHud.completeUp,
      moved: Math.abs(b.physics.position.x - before.x)
        + Math.abs(b.physics.position.z - before.z),
    };
  });
  check('the simulation freezes under the report card',
    frozen.completeUp === true && frozen.moved < 0.01, JSON.stringify(frozen));
  await page.click('#br-home');
  await page.waitForFunction(
    () => /index\.html/.test(location.pathname) || location.pathname.endsWith('/'),
    null,
    { timeout: 20000 },
  );
  check('the end card returns to the apartment in preview mode',
    await page.evaluate(() => new URLSearchParams(location.search).get('preview') === '1'));
  check('the whole playthrough leaves the canonical save untouched',
    unchanged(await storageSnapshot()));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
  await page.close();

  /* ---- pass two: a saved mid-mission campaign resumes in the cockpit ---- */

  const resumePage = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const resumeProblems = [];
  resumePage.on('pageerror', (error) => resumeProblems.push(error.message));
  resumePage.on('console', (message) => {
    if (message.type() === 'error') resumeProblems.push(message.text().slice(0, 240));
  });
  await resumePage.addInitScript(() => {
    // A campaign parked mid-mission on the loaded return leg.
    const save = {
      version: 2,
      revision: 1,
      scene: { id: 'airstrip_smuggling', spawn: 'hangar' },
      story: {
        chapter: 'day_two',
        day: 2,
        timeMinutes: 9 * 60 + 10,
        meetingKnown: false,
        meetingLearnedFrom: null,
        timeEvents: ['travel.airstrip'],
      },
      activities: {},
      inventory: { held: [], concealed: [] },
      events: {
        lou_first_call: { status: 'answered' },
        booski_day_two_call: { status: 'answered' },
        lou_second_call: { status: 'pending' },
      },
      missions: {
        bada_bing_one: { status: 'complete', packageReceived: true },
        squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
        airstrip_smuggling: {
          status: 'in_progress', checkpoint: 'returning', cargoLoaded: true,
          detected: false, landingQuality: null,
        },
        bada_bing_two: { status: 'locked' },
        jerky_motel: { status: 'locked' },
      },
    };
    localStorage.setItem('squatchlife.campaign', JSON.stringify(save));
  });
  await resumePage.goto(`http://localhost:${PORT}/beefrun.html`, { waitUntil: 'load' });
  await resumePage.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });
  await resumePage.evaluate(() => document.getElementById('start-btn').click());
  await resumePage.waitForFunction(
    () => window.__beefrun.mission.flags.inCockpit,
    null,
    { timeout: 300000 },
  );
  const resumed = await resumePage.evaluate(() => ({
    phase: window.__beefrun.mission.phase,
    inCockpit: window.__beefrun.mission.flags.inCockpit,
    checkpoint: window.__beefrun.campaignState.missions.airstrip_smuggling.checkpoint,
    cargoLoaded: window.__beefrun.campaignState.missions.airstrip_smuggling.cargoLoaded,
  }));
  check('a saved returning checkpoint resumes loaded in the cockpit at departure',
    resumed.inCockpit
      && resumed.phase === 'heavyTakeoff'
      && resumed.checkpoint === 'returning'
      && resumed.cargoLoaded,
    JSON.stringify(resumed));

  /* The seat looks where the aeroplane is going, over the top of its own
   * panel, and the gauges face the man who has to read them. */
  const seat = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const cam = b.player.camera;
    const ac = b.aircraft;
    const V = b.physics.position.constructor;
    const camFwd = new V(0, 0, -1).applyQuaternion(cam.quaternion);
    const noseFwd = new V(0, 0, 1).applyQuaternion(ac.group.quaternion);
    // The tallest thing between the eye and the windshield.
    const coaming = ac.parts.cockpit.children.find(
      (c) => c.geometry?.parameters?.width === 1.7 && c.geometry.parameters.height === 0.1,
    );
    const panel = ac.parts.cockpit.children.find(
      (c) => c.geometry?.parameters?.width === 1.62,
    );
    const gauges = panel?.children.find((c) => c.material?.map === ac.parts.panelTex);
    return {
      facesNose: +camFwd.dot(noseFwd).toFixed(3),
      eyeY: ac.pilotEye.y,
      coamingTopY: coaming ? +(coaming.position.y + 0.05).toFixed(3) : null,
      panelTopY: panel ? +(panel.position.y + panel.geometry.parameters.height / 2).toFixed(3) : null,
      gaugesFacePilot: !!gauges && Math.abs(gauges.rotation.y - Math.PI) < 0.01,
      hudUp: !document.getElementById('br-hud').classList.contains('hidden'),
      controlsUp: !document.getElementById('br-controls').classList.contains('hidden'),
      controlKeys: document.querySelectorAll('#br-controls kbd').length,
      controlsText: document.getElementById('br-controls').textContent,
    };
  });
  check('the left seat looks over the panel at where the nose is pointing',
    seat.facesNose > 0.99
      && seat.eyeY >= 0.96
      && seat.eyeY > seat.coamingTopY && seat.eyeY > seat.panelTopY
      && seat.gaugesFacePilot,
    JSON.stringify(seat));
  check('the flight HUD and the controls legend are up for the flight',
    seat.hudUp && seat.controlsUp && seat.controlKeys >= 16,
    JSON.stringify({ hudUp: seat.hudUp, controlsUp: seat.controlsUp, keys: seat.controlKeys }));
  check('keyboard bank labels match conventional flight controls',
    /A\s*bank left/i.test(seat.controlsText) && /D\s*bank right/i.test(seat.controlsText),
    seat.controlsText.replace(/\s+/g, ' ').trim());

  const groundGuidance = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const phase = b.mission.phase;
    b.mission.phase = 'taxi';
    const taxi = b.mission.navTarget();
    b.mission.phase = 'lineup';
    const lineup = b.mission.navTarget();
    b.mission.phase = 'south';
    const outbound = b.mission.navTarget();
    b.mission.phase = 'return';
    const returning = b.mission.navTarget();
    b.mission.phase = 'home';
    const home = b.mission.navTarget();
    b.mission.phase = 'final';
    const final = b.mission.navTarget();
    b.mission.phase = phase;
    return { taxi, lineup, outbound, returning, home, final };
  });
  check('taxi and runway lineup have named physical guidance targets',
    /HOLD SHORT/.test(groundGuidance.taxi?.label || '')
      && /RUNWAY 18/.test(groundGuidance.lineup?.label || ''),
    JSON.stringify(groundGuidance));
  check('both flights progress through named approach, threshold, and touchdown targets',
    /EL HUESO RUNWAY/.test(groundGuidance.outbound?.label || '')
      && /WHISPERING PINES APPROACH/.test(groundGuidance.returning?.label || '')
      && /RWY 36 THRESHOLD/.test(groundGuidance.home?.label || '')
      && /RWY 36 TOUCHDOWN/.test(groundGuidance.final?.label || '')
      && groundGuidance.home.z < groundGuidance.final.z,
    JSON.stringify({ outbound: groundGuidance.outbound, returning: groundGuidance.returning,
      home: groundGuidance.home, final: groundGuidance.final }));

  const taxiRoute = await resumePage.evaluate(() => {
    const root = window.__beefrun.mission.airfield.root;
    return [
      'taxi-route-parking', 'taxi-route-turn', 'taxi-route-apron',
      'taxi-route-hold-short-a', 'taxi-route-hold-short-b',
    ].map((name) => ({ name, found: !!root.getObjectByName(name) }));
  });
  check('the parking stand has a continuous painted taxi route and hold-short bars',
    taxiRoute.every((part) => part.found),
    JSON.stringify(taxiRoute));

  const rollKeys = await resumePage.evaluate(() => {
    const input = window.__beefrun.input;
    const axis = (code) => {
      input.clear();
      input.usingGamepad = false;
      input.keys.add(code);
      input.update(0.2);
      return input.axes.roll;
    };
    const a = axis('KeyA');
    const d = axis('KeyD');
    input.clear();
    return { a, d };
  });
  check('A rolls left and D rolls right like the gamepad',
    rollKeys.a < 0 && rollKeys.d > 0,
    JSON.stringify(rollKeys));

  const skippedLineup = await resumePage.evaluate(async () => {
    const { MissionController } = await import('/src/beefrun/mission.js');
    const fake = {
      physics: {
        position: { x: 1000, z: 1000 },
        headingDeg: 90,
        groundSpeed: 30,
        ias: 65 / 1.943844,
        onGround: false,
        agl: 20,
      },
      airfield: { anchors: { lineUp: { x: 0, z: 0 }, departHeading: 180 } },
      flags: { lineupReady: false, rotateCalled: false, grassOffs: 0 },
      score: { patience: 1 },
      dialogue: { play() {} },
      setObjective(text) { this.objective = text; },
      gradeTakeoff() { this.graded = true; },
      setPhase(phase) { this.phase = phase; },
      restoreCheckpoint() {},
    };
    MissionController.prototype.updateLineup.call(fake, 0.016);
    return {
      lineupReady: fake.flags.lineupReady,
      graded: fake.graded === true,
      phase: fake.phase,
    };
  });
  check('taking off without stopping on the lineup target cannot softlock the mission',
    skippedLineup.lineupReady && skippedLineup.graded && skippedLineup.phase === 'climbout',
    JSON.stringify(skippedLineup));

  /* Where the mission wants the nose: on the glass, both on and off screen. */
  const pointing = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const el = document.getElementById('br-dir');
    const nav = b.mission.navTarget();
    const dx = nav.x - b.physics.position.x;
    const dz = nav.z - b.physics.position.z;
    const bearing = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    const read = () => ({
      shown: !el.classList.contains('hidden'),
      edge: el.classList.contains('edge'),
      x: parseFloat(el.style.getPropertyValue('--x')),
      y: parseFloat(el.style.getPropertyValue('--y')),
      tag: el.querySelector('.tag').textContent,
    });
    // Drive the readout directly off the projection, so this does not depend
    // on how many frames the software renderer has managed since the turn.
    const at = (hdg) => {
      b.physics.setPose(b.physics.position.clone(), hdg, 60);
      b.aircraft.syncTo(b.physics);
      b.cameras.lookYaw = 0;
      b.cameras.lookPitch = 0;
      b.cameras.update(0.016, b.physics, b.aircraft.group, b.aircraft.pilotEye, {});
      b.flightHud.setDirection(b.mission.projectNav(nav, 5));
      return read();
    };
    return { ahead: at(bearing), behind: at((bearing + 180) % 360) };
  });
  check('the objective is drawn on the glass ahead and pinned to the edge behind',
    pointing.ahead.shown && !pointing.ahead.edge
      && Math.abs(pointing.ahead.x - 50) < 12 && Math.abs(pointing.ahead.y - 50) < 25
      && pointing.behind.shown && pointing.behind.edge
      && pointing.behind.y > 90
      && /WHISPERING PINES/.test(pointing.ahead.tag),
    JSON.stringify(pointing));

  const barkRotation = await resumePage.evaluate(async () => {
    const { DialogueSystem } = await import('/src/beefrun/dialogue.js');
    const heard = [];
    const d = new DialogueSystem({ say() {} }, { audio: { line: (line) => heard.push(line) } });
    const queued = [];
    for (let i = 0; i < 7; i++) {
      d.bark('cruise', { force: true });
      const line = d.queue[d.queue.length - 1];
      queued.push({ text: line.text, cue: line.cue });
      d.clear();
    }
    return queued;
  });
  check('Sasole exhausts the stable-flight pool before any line repeats and every bark is cued',
    new Set(barkRotation.slice(0, 6).map((line) => line.text)).size === 6
      && barkRotation[6].text === barkRotation[0].text
      && barkRotation.every((line) => /^beefrun\.sasole\.bark-cruise-\d+$/.test(line.cue)),
    JSON.stringify(barkRotation));

  const homeSetup = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const { HOME_APPROACH } = await import('/src/beefrun/config.js');
    const { TerrainStreamingSystem } = await import('/src/beefrun/terrain.js');
    const Scene = b.mission.scene.constructor;
    const isolated = new TerrainStreamingSystem(new Scene());
    isolated.prime(HOME_APPROACH.entry.x, HOME_APPROACH.entry.z);
    const terrain = { chunks: isolated.chunks.size, queued: isolated.queue.length };
    isolated.clear();

    b.mission.restoreCheckpoint('return');
    const nav = b.mission.navTarget();
    const gates = b.mission.approachGates;
    const runwayLights = b.mission.airfield.root.getObjectByName('runway-36-edge-lights');
    return {
      phase: b.mission.phase,
      position: {
        x: +b.physics.position.x.toFixed(1),
        y: +b.physics.position.y.toFixed(1),
        z: +b.physics.position.z.toFixed(1),
      },
      entry: HOME_APPROACH.entry,
      nav,
      gates: {
        name: gates?.name,
        count: gates?.children.length,
        faceFlightPath: gates?.children.every((gate) => Math.abs(gate.rotation.x) < 0.01),
      },
      runwayLights: { visible: runwayLights?.visible, count: runwayLights?.count },
      guide: document.getElementById('br-guide').textContent,
      terrain,
    };
  });
  check('the saved return begins on the authored runway profile, not a dive over the threshold',
    homeSetup.phase === 'home'
      && homeSetup.position.x === homeSetup.entry.x
      && homeSetup.position.y === +homeSetup.entry.y.toFixed(1)
      && homeSetup.position.z === homeSetup.entry.z,
    JSON.stringify({ phase: homeSetup.phase, position: homeSetup.position, entry: homeSetup.entry }));
  check('the return identifies RWY 36 and lights a ten-gate path plus both runway edges',
    /RWY 36 THRESHOLD/.test(homeSetup.nav?.label || '')
      && homeSetup.gates.name === 'home-approach-gates'
      && homeSetup.gates.count === 10
      && homeSetup.gates.faceFlightPath
      && homeSetup.runwayLights.visible
      && homeSetup.runwayLights.count === 24
      && /RWY 36/.test(homeSetup.guide),
    JSON.stringify({ nav: homeSetup.nav, gates: homeSetup.gates,
      runwayLights: homeSetup.runwayLights, guide: homeSetup.guide }));
  check('checkpoint restart warms only nearby terrain and streams the far rings',
    homeSetup.terrain.chunks >= 1 && homeSetup.terrain.chunks <= 9 && homeSetup.terrain.queued >= 100,
    JSON.stringify(homeSetup.terrain));

  const touchdownCoaching = await resumePage.evaluate(async () => {
    const { MissionController } = await import('/src/beefrun/mission.js');
    const called = [];
    const fake = {
      phase: 'final', missionTime: 1, _touchdowns: [],
      audio: { play() {} }, cameras: { addShake() {} },
      score: { patience: 1 },
      dialogue: { bark() {}, play: (id) => called.push(id) },
      setObjective(text) { this.objective = text; },
    };
    MissionController.prototype.onTouchdown.call(fake, 1.2, 1, 'both');
    return { objective: fake.objective, called };
  });
  check('touchdown immediately cues braking and its matching Sasole line',
    /hold B/i.test(touchdownCoaching.objective || '')
      && touchdownCoaching.called.includes('home.brake'),
    JSON.stringify(touchdownCoaching));
  check('no console errors during the resume', resumeProblems.length === 0,
    resumeProblems.join(' | '));
  await resumePage.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Beef Run checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Beef Run checks passed.`);

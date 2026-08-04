#!/usr/bin/env node
/** Browser-level production verification for NO WAKE. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allNoWakeVoiceLines, NO_WAKE_AFTERMATH_LINES } from '../src/nowake/dialogue.js';
import { isNoWakeAudioPreloadCue } from '../src/nowake/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5215;
const WRITE_SCREENSHOTS = !process.argv.includes('--no-screenshots');
const SENTINEL = '{"version":999,"canonical":"NO WAKE preview must not touch this"}';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg',
};

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('playwright is not installed; cannot verify NO WAKE.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.addInitScript((sentinel) => localStorage.setItem('squatchlife.campaign', sentinel), SENTINEL);
const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 300));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const authoredVoice = allNoWakeVoiceLines();
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const manifestVoice = soundManifest.sfx.filter((cue) => cue.name.startsWith('vo.nowake.'));
const manifestByName = new Map(manifestVoice.map((cue) => [cue.name, cue]));
/* Irish joined the boat and brought six lines with him: the egg story on the
 * way out, the count and the confirmation inside the confrontation, his hands
 * below decks, the rail after the shot, and the back half he will not tell on
 * the way in. */
const AUTHORED_LINE_COUNT = 30;
check(`all ${AUTHORED_LINE_COUNT} NO WAKE lines have stable cue ids, cast voices and exact manifest text`,
  authoredVoice.length === AUTHORED_LINE_COUNT
    && manifestVoice.length === authoredVoice.length
    && authoredVoice.every((line) => {
      const cue = manifestByName.get(`vo.nowake.${line.cue}.1`);
      return cue?.voice === line.voice && cue?.say === line.text;
    }),
  JSON.stringify({ authored: authoredVoice.length, manifest: manifestVoice.length }));

const recordingSheet = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');
/* The seven lines that used to be listed here have since been recorded and
 * indexed, which quietly broke this check: it demands that the pickup list and
 * the recording sheet match exactly, and the sheet had moved on. What is
 * outstanding now is Irish's pass, and nothing else. */
const expectedNoWakePickups = [
  'vo.nowake.below.irish.hands.1.mp3',
  'vo.nowake.cruise.irish.egg.1.mp3',
  'vo.nowake.execution.irish.rail.1.mp3',
  'vo.nowake.return.irish.no-back-half.1.mp3',
  'vo.nowake.reveal.irish.asked.1.mp3',
  'vo.nowake.reveal.irish.counted.1.mp3',
];
const noWakePickupFiles = authoredVoice
  .map((line) => `vo.nowake.${line.cue}.1.mp3`)
  .filter((file) => recordingSheet.includes(`\`${file}\``));
check('every NO WAKE delivery is indexed or an explicitly approved production pickup',
  authoredVoice.every((line) => {
    const file = `vo.nowake.${line.cue}.1.mp3`;
    return indexedFiles.has(file) || expectedNoWakePickups.includes(file);
  })
    && JSON.stringify(noWakePickupFiles.sort()) === JSON.stringify(expectedNoWakePickups.sort()),
  JSON.stringify({ noWakePickupFiles }));

const shots = path.join(ROOT, 'docs', 'validation', '2026-07-31');
if (WRITE_SCREENSHOTS) await fsp.mkdir(shots, { recursive: true });
const capture = (name) => (WRITE_SCREENSHOTS
  ? page.screenshot({ path: path.join(shots, name) })
  : Promise.resolve());

try {
  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  const radioCueNames = await page.evaluate(() => window.NO_WAKE.radio.preloadCueNames({
    hours: [12.75, 15, 17],
  }));
  const selectedNoWakeCues = soundManifest.sfx
    .filter((cue) => isNoWakeAudioPreloadCue(cue, radioCueNames));
  const expectedResidentNames = selectedNoWakeCues
    .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
    .map((cue) => cue.name).sort();
  const pendingNoWakeNames = selectedNoWakeCues
    .filter((cue) => !indexedFiles.has(cue.file || `${cue.name}.mp3`))
    .map((cue) => cue.name).sort();
  const expectedPendingNoWakeNames = [
    'ambience.harbor',
    'boat.board.step', 'boat.body.drag', 'boat.body.rail', 'boat.engine.shutdown',
    'boat.engine.start', 'boat.engine.underway', 'boat.gunshot.deck', 'boat.hull.creak', 'boat.hull.wake',
    /* The harbour and boat effects listed here have all been recorded and
     * indexed since; the only thing still outstanding on this boat is Irish,
     * who is wired, subtitled and timed but not yet performed. */
    'vo.nowake.below.irish.hands.1', 'vo.nowake.cruise.irish.egg.1',
    'vo.nowake.execution.irish.rail.1', 'vo.nowake.return.irish.no-back-half.1',
    'vo.nowake.reveal.irish.asked.1', 'vo.nowake.reveal.irish.counted.1',
  ].sort();
  await page.evaluate(() => window.NO_WAKE.postfx?.disable?.());
  /* Use a trusted browser gesture so the same click that starts the mission
   * can legally acquire pointer lock, as it does for a player -- but aim it
   * with coordinates (like the execution shot's click further down this same
   * file) instead of a locator. A locator click waits for the target's own
   * bounding box to render two identical animation frames in a row before it
   * will act, and this scene's continuous WebGL redraw on a software
   * rasteriser can make that wait run past any reasonable ceiling. That is a
   * property of the wait, not of the button: the coordinates do not move. */
  const startBox = await page.evaluate(() => {
    const r = document.getElementById('start-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(startBox.x, startBox.y);
  /* Start decodes the harbour bank and three authored radio shows before it
   * takes the title card down. On a software rasteriser that is comfortably
   * over half a minute, so the old 30 s ceiling failed this contract on
   * machine speed rather than on anything the scene did. */
  await page.waitForFunction(() => !document.getElementById('overlay'), null, { timeout: 180000 });
  await page.waitForTimeout(250);

  const initialPointerLock = await page.evaluate(() => (
    document.pointerLockElement === document.querySelector('canvas')
  ));
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => (
    document.pointerLockElement === document.querySelector('canvas')
  ));
  check('the canvas reacquires mouse control after the player clicks out and back in',
    initialPointerLock && await page.evaluate(() => (
      document.pointerLockElement === document.querySelector('canvas')
    )));

  const noWakeAudioResidency = await page.evaluate((expected) => {
    const audio = window.NO_WAKE.audio;
    const resident = audio ? [...audio.buffers.keys()].sort() : [];
    const wanted = new Set(expected);
    return {
      exposed: Boolean(audio),
      plan: audio?.preloadStats ?? null,
      loaded: audio?.loadedCount ?? null,
      resident: resident.length,
      missing: expected.filter((name) => !audio?.buffers.has(name)),
      unexpected: resident.filter((name) => !wanted.has(name)),
    };
  }, expectedResidentNames);
  check('NO WAKE decodes exactly its mission and bounded persistent-radio bank',
    noWakeAudioResidency.exposed
      && noWakeAudioResidency.plan?.manifestTotal === soundManifest.sfx.length
      && noWakeAudioResidency.plan?.selected === selectedNoWakeCues.length
      && noWakeAudioResidency.loaded === expectedResidentNames.length
      && noWakeAudioResidency.resident === expectedResidentNames.length
      && noWakeAudioResidency.missing.length === 0
      && noWakeAudioResidency.unexpected.length === 0,
    JSON.stringify({
      ...noWakeAudioResidency,
      selected: selectedNoWakeCues.length,
      expected: expectedResidentNames.length,
      pending: pendingNoWakeNames,
      missing: noWakeAudioResidency.missing.slice(0, 5),
      unexpected: noWakeAudioResidency.unexpected.slice(0, 5),
    }));
  check('only the approved NO WAKE production SFX and aftermath lines remain pending',
    JSON.stringify(pendingNoWakeNames) === JSON.stringify(expectedPendingNoWakeNames),
    JSON.stringify(pendingNoWakeNames));

  const noWakeInventory = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    slots: document.querySelectorAll('#hotbar .slot').length,
  }));
  check('NO WAKE keeps the shared five-slot inventory visible',
    noWakeInventory.visible && noWakeInventory.slots === 5,
    JSON.stringify(noWakeInventory));

  const boot = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    scene: window.NO_WAKE.campaignState.scene,
    cast: Object.fromEntries(Object.entries(window.NO_WAKE.boat.cast).map(([id, npc]) => [id, {
      characterId: npc.group.userData.characterId,
      gut: npc.parts.profile.gut ?? 0,
    }])),
    boatName: window.NO_WAKE.boat.root.name,
    dimensions: window.NO_WAKE.boat.root.userData.dimensions,
    waterline: window.NO_WAKE.boat.root.userData.waterline,
    detailMeshes: window.NO_WAKE.boat.root.userData.detailMeshes,
    controls: Object.fromEntries(Object.entries(window.NO_WAKE.boat.controls)
      .filter(([, value]) => value?.root)
      .map(([id, value]) => [id, value.root.name])),
    lines: {
      bow: window.NO_WAKE.boat.targets.bowLine.userData,
      stern: window.NO_WAKE.boat.targets.sternLine.userData,
    },
    boarding: {
      bridgeName: window.NO_WAKE.boat.boardingBridge?.name ?? null,
      bridgeVisible: window.NO_WAKE.boat.boardingBridge?.visible ?? false,
      bridgeMeshes: (() => {
        let count = 0;
        window.NO_WAKE.boat.boardingBridge?.traverse((object) => { if (object.isMesh) count++ });
        return count;
      })(),
      targetName: window.NO_WAKE.boat.targets.board?.name ?? null,
    },
    helmTarget: (() => {
      const target = window.NO_WAKE.boat.targets.helm;
      const Box3 = window.NO_WAKE.boat.localColliders[0].constructor;
      const size = new Box3().setFromObject(target).getSize(target.position.clone());
      return { name: target.name, size: size.toArray() };
    })(),
    localColliders: window.NO_WAKE.boat.localColliders.length,
    waterVertices: window.NO_WAKE.world.water.mesh.geometry.attributes.position.count,
    buoyCount: window.NO_WAKE.world.buoys.length,
    preview: Boolean(document.getElementById('squatch-preview-notice')),
  }));
  check('preview boots NO WAKE in progress at Gate C',
    boot.phase === 'dock' && boot.mission.status === 'in_progress'
      && boot.scene.id === 'no_wake' && boot.scene.spawn === 'gate_c' && boot.preview,
    JSON.stringify(boot));
  check('the production world contains the larger detailed cruiser and marked channel',
    /42-foot cabin cruiser/.test(boot.boatName)
      && boot.dimensions.length >= 13 && boot.dimensions.beam >= 4.8
      && boot.detailMeshes >= 150 && boot.buoyCount >= 10,
    JSON.stringify({ boat: boot.boatName, dimensions: boot.dimensions, details: boot.detailMeshes, buoys: boot.buoyCount }));
  check('startup controls are modeled objects and both physical dock ropes begin attached',
    /battery rocker/.test(boot.controls.battery)
      && /blower push/.test(boot.controls.blower)
      && /ignition key/.test(boot.controls.ignition)
      && boot.lines.bow.attached === true && boot.lines.stern.attached === true,
    JSON.stringify({ controls: boot.controls, lines: boot.lines }));
  check('a visible physical boarding bridge and forgiving named target connect Gate C to the cruiser',
    /boarding bridge/.test(boot.boarding.bridgeName ?? '')
      && boot.boarding.bridgeVisible && boot.boarding.bridgeMeshes >= 4
      && /boarding bridge/.test(boot.boarding.targetName ?? ''),
    JSON.stringify(boot.boarding));
  check('a broad named helm proxy makes the driving position legible from the open port route',
    /helm interaction proxy/.test(boot.helmTarget.name)
      && boot.helmTarget.size[0] >= 1.4 && boot.helmTarget.size[1] >= 1.1
      && boot.helmTarget.size[2] >= .65,
    JSON.stringify(boot.helmTarget));
  check('the cruiser sits at a measured displacement waterline instead of riding on its chine',
    boot.waterline.restingY < -.1
      && boot.waterline.draft > .85 && boot.waterline.draft < 1.05
      && boot.waterline.sideFreeboard > .70 && boot.waterline.sideFreeboard < .95
      && boot.waterline.deckFreeboard > .95 && boot.waterline.deckFreeboard < 1.15,
    JSON.stringify(boot.waterline));
  await capture('no-wake-gate-c.png');
  const boatRadio = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    await game.radioReady;
    const boardedBefore = game.state.boarded;
    game.state.boarded = true;
    const desc = game.boat.targets.radio.userData.interact;
    const V = game.player.position.constructor;
    game.player.mode = 'frozen';
    game.player.position.copy(game.world.fromBoatLocal(new V(.62, 2.42, .28)));
    game.player.update(.016);
    const target = new V();
    game.boat.targets.radio.getWorldPosition(target);
    const delta = target.sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(.016);
    game.player.camera.updateMatrixWorld(true);
    game.interaction.update(.016);
    const targeted = game.interaction.current === game.boat.targets.radio;
    desc.onTap();
    game.radio.update(.1);
    const on = {
      powered: game.radio.on,
      stationCount: game.radio.stations.length,
      station: game.radio.station.name,
      dial: game.radio.station.dial,
      tracks: game.radio.tracks.length,
      osdVisible: !document.getElementById('radio-osd').classList.contains('hidden'),
      model: game.boat.targets.radio.name,
      modelMeshes: (() => {
        let n = 0;
        game.boat.targets.radio.traverse((object) => { if (object.isMesh) n++ });
        return n;
      })(),
      hold: desc.hold,
      targeted,
    };
    desc.onTap();
    game.state.boarded = boardedBefore;
    return { ...on, poweredOff: !game.radio.on };
  });
  check('the modeled boat stereo runs the shared station schedule, music manifest and radio OSD',
    /marine stereo radio/.test(boatRadio.model)
      && boatRadio.modelMeshes >= 4 && boatRadio.hold > 0 && boatRadio.targeted
      && boatRadio.powered && boatRadio.poweredOff
      && boatRadio.stationCount >= 1 && /97\.8/.test(boatRadio.dial)
      && boatRadio.tracks >= 1 && boatRadio.osdVisible,
    JSON.stringify(boatRadio));
  const marinaRefinement = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const Box3 = game.boat.localColliders[0].constructor;
    const exteriorFaces = (hull) => {
      const p = hull.geometry.attributes.position;
      const V = hull.position.constructor;
      let outward = 0;
      let sideFaces = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = new V().fromBufferAttribute(p, i);
        const b = new V().fromBufferAttribute(p, i + 1);
        const c = new V().fromBufferAttribute(p, i + 2);
        if (Math.max(a.z, b.z, c.z) - Math.min(a.z, b.z, c.z) < .01) continue;
        const centerX = (a.x + b.x + c.x) / 3;
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        sideFaces++;
        if (normal.x * centerX > 0) outward++;
      }
      return { outward, sideFaces };
    };
    const controlBoxes = ['battery', 'blower', 'ignition'].map((id) => ({
      id,
      box: new Box3().setFromObject(game.boat.controls[id].root),
    }));
    const overlaps = [];
    for (let i = 0; i < controlBoxes.length; i++) {
      for (let j = i + 1; j < controlBoxes.length; j++) {
        if (controlBoxes[i].box.intersectsBox(controlBoxes[j].box)) {
          overlaps.push(`${controlBoxes[i].id}:${controlBoxes[j].id}`);
        }
      }
    }
    const minX = Math.min(...controlBoxes.map((entry) => entry.box.min.x));
    const maxX = Math.max(...controlBoxes.map((entry) => entry.box.max.x));
    const portRail = game.boat.localColliders.find((box) => box.min.x < -2.5 && box.max.x < -2);
    const routeObstacles = game.boat.localColliders.filter((box) => box !== portRail
      && box.max.z > -2.05 && box.min.z < 2.80
      && box.min.x > portRail.max.x && box.min.x < 1.9);
    const portRouteClearance = Math.min(...routeObstacles.map((box) => (
      box.min.x - portRail.max.x - .60
    )));
    const neighbors = game.world.marina.neighborBoats.map((boat) => {
      const hull = boat.getObjectByName('tapered neighboring hull');
      return {
        name: boat.name,
        details: boat.userData.detailMeshes,
        hullVertices: hull.geometry.attributes.position.count,
        exterior: exteriorFaces(hull),
      };
    });
    const cruiserHull = game.boat.root.getObjectByName('deep-v hull');
    return {
      controlSpan: maxX - minX,
      overlaps,
      portRouteClearance,
      neighbors,
      cruiserExterior: exteriorFaces(cruiserHull),
    };
  });
  check('the compact startup cluster keeps three distinct non-overlapping controls',
    marinaRefinement.controlSpan < 1.05 && marinaRefinement.overlaps.length === 0,
    JSON.stringify({ span: marinaRefinement.controlSpan, overlaps: marinaRefinement.overlaps }));
  check('the port boarding-to-helm route preserves at least 0.9 metres of usable capsule clearance',
    marinaRefinement.portRouteClearance >= .9,
    JSON.stringify({ usableMetres: marinaRefinement.portRouteClearance }));
  check('the nearby floating shapes are three detailed boats with tapered hulls',
    marinaRefinement.neighbors.length === 3
      && marinaRefinement.neighbors.every((boat) => boat.details >= 25 && boat.hullVertices >= 30
        && boat.exterior.outward === boat.exterior.sideFaces)
      && marinaRefinement.cruiserExterior.outward === marinaRefinement.cruiserExterior.sideFaces,
    JSON.stringify(marinaRefinement.neighbors));
  check('railings and deck furniture have local collision while the water has a dense displaced surface',
    boot.localColliders >= 10 && boot.waterVertices >= 40000,
    JSON.stringify({ colliders: boot.localColliders, waterVertices: boot.waterVertices }));
  check('stable character identities drive the cast and Willy keeps his permanent belly',
    boot.cast.lou.characterId === 'lou' && boot.cast.booski.characterId === 'booski'
      && boot.cast.willy.characterId === 'willy' && boot.cast.willy.gut >= 1,
    JSON.stringify(boot.cast));
  const seating = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const willyWorld = game.boat.cast.willy.group.getWorldPosition(new V());
    const willyLocal = game.world.toBoatLocal(willyWorld).toArray();
    const bench = game.boat.localColliders.find((box) => (
      box.max.x - box.min.x > 3 && box.min.z > 4.5 && box.max.z < 6
    ));
    return {
      willyLocal,
      benchFound: Boolean(bench),
      onBench: Boolean(bench) && willyLocal[0] > bench.min.x && willyLocal[0] < bench.max.x
        && willyLocal[2] > bench.min.z && willyLocal[2] < bench.max.z,
    };
  });
  check('Willy is seated on the aft bench, not floating in open deck in front of it',
    seating.benchFound && seating.onBench,
    JSON.stringify(seating));
  const canopyContact = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const Box3 = game.boat.localColliders[0].constructor;
    const deckY = game.boat.deck.height;
    const posts = [];
    game.boat.root.traverse((object) => {
      if (/^canopy support post/.test(object.name || '')) {
        const box = new Box3().setFromObject(object);
        posts.push({ name: object.name, localMinY: game.world.toBoatLocal(box.min.clone()).y });
      }
    });
    const roof = game.boat.root.getObjectByName('wheelhouse roof');
    const roofLocalMinY = game.world.toBoatLocal(
      new Box3().setFromObject(roof).min.clone(),
    ).y;
    return {
      count: posts.length,
      // The side run bears on the open deck (1.02); the front run, tucked
      // behind the dash, bears on the cabin trunk's own roof line (1.53).
      // "Touching" means within a couple of centimetres of one of those, not
      // the ~0.5 m gap the playtest called "floating".
      gaps: posts.map((post) => ({
        name: post.name,
        gap: post.name.includes('side') ? post.localMinY - deckY : post.localMinY - 1.53,
      })),
      roofLocalMinY,
    };
  });
  check('every canopy support post reaches the deck or the cabin trunk roof instead of floating clear of it',
    canopyContact.count === 12 && canopyContact.gaps.every((post) => Math.abs(post.gap) < .03),
    JSON.stringify(canopyContact));
  const boardingAim = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.state.boarded = false;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.position.set(-4.28, 1.86, 3.75);
    game.player.ground = .2;
    game.player.update(.016);
    const target = game.boat.targets.board.getWorldPosition(new V());
    const delta = target.sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(.016);
    game.player.camera.updateMatrixWorld(true);
    game.interaction.update(.016);
    return {
      targeted: game.interaction.current === game.boat.targets.board,
      target: game.interaction.current?.name ?? null,
    };
  });
  await capture('no-wake-boarding-bridge.png');
  await page.keyboard.press('e');
  await page.waitForTimeout(100);
  const crossingPlatform = await page.evaluate(() => ({
    boarding: window.NO_WAKE.state.boarding,
    boarded: window.NO_WAKE.state.boarded,
    bridgeStillDown: window.NO_WAKE.boat.boardingBridge.visible,
    mode: window.NO_WAKE.player.mode,
  }));
  await page.waitForFunction(() => window.NO_WAKE.state.boarded === true);
  const boardedByPlayer = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      boarded: game.state.boarded,
      bridgeStowed: !game.boat.boardingBridge.visible,
      playerLocal: game.world.toBoatLocal(game.player.position.clone()).toArray(),
    };
  });
  check('the player boards through the bridge target with real crosshair and E input',
    boardingAim.targeted
      && crossingPlatform.boarding && !crossingPlatform.boarded
      && crossingPlatform.bridgeStillDown && crossingPlatform.mode === 'frozen'
      && boardedByPlayer.boarded && boardedByPlayer.bridgeStowed
      && boardedByPlayer.playerLocal[2] > 3.2 && boardedByPlayer.playerLocal[2] < 4.2,
    JSON.stringify({ ...boardingAim, crossingPlatform, ...boardedByPlayer }));
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'frozen';
    game.player.position.set(7.0, 1.34, -6.2);
    game.player.update(.016);
    const aim = game.world.fromBoatLocal(new V(0, .30, -.4));
    const delta = aim.clone().sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(.016);
  });
  await page.waitForTimeout(80);
  await capture('no-wake-waterline.png');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.mode = 'frozen';
    game.player.position.copy(game.world.fromBoatLocal(
      new game.player.position.constructor(.62, 2.42, .28),
    ));
    game.player.yaw = 0;
    game.player.pitch = -.18;
    game.player.update(.016);
  });
  await page.waitForTimeout(100);
  await capture('no-wake-startup-panel.png');

  const deckAccess = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.position.copy(game.world.fromBoatLocal(new V(-1.68, 2.68, 3.72)));
    game.player.yaw = 0;
    game.player.clearKeys();
    game.player.setKey('KeyW', true);
    for (let i = 0; i < 300; i++) game.player.update(1 / 60);
    game.player.setKey('KeyW', false);
    const reached = game.world.toBoatLocal(game.player.position).clone();
    const Box3 = game.boat.localColliders[0].constructor;
    const lineDistance = new Box3().setFromObject(game.boat.targets.bowLine)
      .distanceToPoint(game.player.position);

    game.player.position.copy(game.world.fromBoatLocal(new V(-1.68, 2.68, -4.75)));
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.jumpHeight = 0;
    game.player.grounded = true;
    game.player.velocity.set(0, 0, 0);
    game.player.setKey('Space', true);
    let maxJump = 0;
    for (let i = 0; i < 24; i++) {
      game.player.update(1 / 60);
      maxJump = Math.max(maxJump, game.player.jumpHeight);
      if (i === 0) game.player.setKey('Space', false);
    }
    for (let i = 0; i < 80; i++) game.player.update(1 / 60);
    return {
      reached: { x: reached.x, z: reached.z },
      lineDistance,
      maxJump,
      landed: game.player.grounded && game.player.jumpHeight === 0,
    };
  });
  check('the port side deck is wide enough to walk from boarding gap to the bow line',
    deckAccess.reached.z < -4.7
      && deckAccess.reached.x > -1.82 && deckAccess.reached.x < -1.52
      && deckAccess.lineDistance < 2.7,
    JSON.stringify(deckAccess));
  check('Space performs a grounded jump and lands back on the moving-deck frame',
    deckAccess.maxJump > .45 && deckAccess.landed,
    JSON.stringify({ maxJump: deckAccess.maxJump, landed: deckAccess.landed }));
  const bowTargeted = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.state.battery = true;
    game.state.blower = true;
    game.state.engine = true;
      game.player.position.copy(game.world.fromBoatLocal(new V(-1.68, 2.68, -5.12)));
      game.player.ground = game.boat.root.position.y + game.boat.deck.height;
      game.player.update(1 / 60);
      const aim = game.world.fromBoatLocal(new V(-2.22, 1.37, -5.35));
      const delta = aim.clone().sub(game.player.camera.position);
      game.player.yaw = Math.atan2(-delta.x, -delta.z);
      game.player.pitch = Math.asin(delta.y / delta.length());
      game.player.update(1 / 60);
      game.player.camera.updateMatrixWorld(true);
      game.interaction.update(1 / 60);
      return {
        matched: game.interaction.current === game.boat.targets.bowLine,
        current: game.interaction.current?.name ?? null,
      };
    });
  check('the bow line enters the crosshair interaction from the reachable side deck',
    bowTargeted.matched, JSON.stringify(bowTargeted));
  await page.waitForTimeout(80);
  await capture('no-wake-bow-line-access.png');

  const moored = await page.evaluate(() => {
    const b = window.NO_WAKE.physics;
    b.running = true; b.throttle = 1;
    for (let i = 0; i < 240; i++) b.advance(1 / 120);
    return { distance: b.distance, speed: b.speed };
  });
  check('fixed-step boat thrust cannot move against attached mooring lines',
    moored.distance === 0 && moored.speed === 0, JSON.stringify(moored));

  const helmAim = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    Object.assign(game.state, {
      boarded: true, battery: true, blower: true, engine: true, bowLine: true, sternLine: true,
    });
    game.physics.running = true;
    game.physics.mooringReleased = true;
    game.boat.targets.bowLine.visible = false;
    game.boat.targets.sternLine.visible = false;
    game.player.mode = 'walk';
    game.player.position.copy(game.world.fromBoatLocal(new V(-1.55, 2.68, .92)));
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.update(.016);
    const target = game.boat.targets.helm.getWorldPosition(new V());
    const delta = target.sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(.016);
    game.player.camera.updateMatrixWorld(true);
    game.interaction.update(.016);
    return {
      targeted: game.interaction.current === game.boat.targets.helm,
      target: game.interaction.current?.name ?? null,
    };
  });
  await page.keyboard.press('e');
  await page.waitForTimeout(100);
  const helmEntered = await page.evaluate(() => ({
    atHelm: window.NO_WAKE.state.atHelm,
    phase: window.NO_WAKE.phase,
  }));
  check('the player takes the broad helm proxy with real crosshair and E input',
    helmAim.targeted && helmEntered.atHelm && helmEntered.phase === 'drive',
    JSON.stringify({ ...helmAim, ...helmEntered }));
  await page.evaluate(() => {
    window.NO_WAKE.physics.throttle = .82;
    for (let i = 0; i < 360; i++) window.NO_WAKE.physics.advance(1 / 120);
  });
  const underway = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    distance: window.NO_WAKE.physics.distance,
    speed: window.NO_WAKE.physics.speed,
    checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
  }));
  check('released cruiser accelerates and records the underway checkpoint',
    underway.phase === 'drive' && underway.distance > 8 && underway.speed > 1
      && underway.checkpoint === 'underway', JSON.stringify(underway));

  const deckRide = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    game.physics.speed = .2;
    game.leaveHelm({ force: true });
    const before = game.world.toBoatLocal(game.player.position).clone();
    const startDistance = game.physics.distance;
    game.physics.speed = 2.2;
    game.physics.throttle = 1;
    await new Promise((resolve) => setTimeout(resolve, 650));
    const after = game.world.toBoatLocal(game.player.position).clone();
    return {
      atHelm: game.state.atHelm,
      throttle: game.physics.throttle,
      coasted: game.physics.distance - startDistance,
      localDelta: before.distanceTo(after),
    };
  });
  check('leaving the helm neutralizes propulsion while a coasting deck carries the player with it',
    deckRide.atHelm === false
      && Math.abs(deckRide.throttle) < .02
      && deckRide.coasted > .2
      && deckRide.localDelta < .08,
    JSON.stringify(deckRide));

  const railCollision = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const insideRail = new game.world.water.mesh.position.constructor(2.28, 2.68, 2.0);
    game.player.position.copy(game.world.fromBoatLocal(insideRail));
    game.world.resolvePlayer(game.player, 'x', .30);
    return game.world.toBoatLocal(game.player.position).x;
  });
  check('the moving-frame collision pass ejects the player from a side railing',
    railCollision < 2.08 || railCollision > 2.60,
    JSON.stringify({ resolvedLocalX: railCollision }));

  const benchTrap = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    /* The old aft bench collider fell 0.13 m short of the rail's inner edge
     * on each side -- a gap narrower than the player's own 0.6 m diameter.
     * (-2.0, 5.2) sits exactly in that former dead zone: outside the old
     * bench box (to 1.95) and outside the old rail box (from 2.08) alike, so
     * neither collider's own bounds contain it, yet a capsule centred there
     * overlapped both. Ejecting off one used to shove the player inside the
     * other, forever, with velocity zeroed on every push -- "I got stuck in
     * the bench on the back, I just couldn't move". A fixed geometry has to
     * settle here, not oscillate. */
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.clearKeys();
    game.player.velocity.set(0, 0, 0);
    game.player.position.copy(game.world.fromBoatLocal(new V(-2.0, 2.68, 5.2)));
    const track = [];
    for (let i = 0; i < 60; i++) {
      game.player.update(1 / 60);
      track.push(game.world.toBoatLocal(game.player.position.clone()).toArray());
    }
    const last = track.at(-1);
    const settleDelta = Math.hypot(last[0] - track.at(-2)[0], last[2] - track.at(-2)[2]);
    const stillOverlapping = game.boat.localColliders.some((box) => {
      const cx = Math.max(box.min.x, Math.min(box.max.x, last[0]));
      const cz = Math.max(box.min.z, Math.min(box.max.z, last[2]));
      return Math.hypot(last[0] - cx, last[2] - cz) < 0.29;
    });
    return { start: [-2.0, 5.2], last, settleDelta, stillOverlapping };
  });
  check('a player wedged between the aft bench and the rail settles into a clear spot instead of oscillating in place forever',
    benchTrap.settleDelta < .01 && !benchTrap.stillOverlapping,
    JSON.stringify(benchTrap));

  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.physics.speed = 0;
    game.player.update(.016);
    const target = game.boat.targets.helm.getWorldPosition(new V());
    const delta = target.sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(.016);
    game.player.camera.updateMatrixWorld(true);
    game.interaction.update(.016);
  });
  await page.keyboard.press('e');
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    window.NO_WAKE.skipDrive();
    window.NO_WAKE.physics.speed = 2;
  });
  await page.waitForTimeout(350);
  const offshore = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    distance: window.NO_WAKE.physics.distance,
    checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
    wakeVisible: window.NO_WAKE.world.wake.pool.some((p) => p.visible),
  }));
  check('the authored 90-second run gate resolves only into the open-water checkpoint',
    offshore.phase === 'coast' && offshore.distance >= 360
      && offshore.checkpoint === 'open_water', JSON.stringify(offshore));
  await capture('no-wake-open-water.png');

  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.clearKeys();
    game.physics.throttle = 0;
    game.physics.speed = 0;
  });
  await page.waitForFunction(() => window.NO_WAKE.phase === 'confrontation');
  await page.waitForTimeout(900);
  const revealFraming = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const speaker = game.boat.cast[game.state.focus];
    const target = speaker.group.localToWorld(new V(0, 1.48, 0));
    const forward = new V();
    game.player.camera.getWorldDirection(forward);
    const toSpeaker = target.sub(game.player.camera.position);
    const wheel = game.boat.wheel.getWorldPosition(new V());
    const speakerLocal = game.world.toBoatLocal(speaker.group.getWorldPosition(new V())).toArray();
    return {
      focus: game.state.focus,
      angle: Math.acos(Math.max(-1, Math.min(1, forward.dot(toSpeaker.normalize())))) * 180 / Math.PI,
      distanceFromWheel: wheel.distanceTo(game.player.camera.position),
      cameraLocal: game.world.toBoatLocal(game.player.camera.position.clone()).toArray(),
      speakerLocal,
    };
  });
  check('the confrontation automatically leaves the helm and frames its current speaker',
    revealFraming.focus === 'lou' && revealFraming.angle <= 6
      && revealFraming.distanceFromWheel >= 1.8
      && revealFraming.cameraLocal[2] > 1.3
      && revealFraming.cameraLocal[2] < revealFraming.speakerLocal[2],
    JSON.stringify(revealFraming));
  await capture('no-wake-reveal-lou.png');
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.NO_WAKE.skipDialogue());
    await page.waitForTimeout(90);
  }
  const reveal = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    lines: window.NO_WAKE.dialogueLog.map((line) => line.text),
  }));
  check('the reveal cites established Beef Run and Motel campaign history',
    reveal.lines.some((line) => /Beef Run/.test(line))
      && reveal.lines.some((line) => /Motel|Bureau/.test(line))
      && reveal.lines.some((line) => /know you did/.test(line)),
    JSON.stringify(reveal.lines));

  await page.evaluate(() => window.NO_WAKE.prepareExecution());
  await page.waitForTimeout(250);
  const armed = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    playerGun: window.NO_WAKE.state.playerGun?.visible,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
    weapons: Object.fromEntries(['playerGun', 'louGun', 'booskiGun'].map((key) => {
      const gun = window.NO_WAKE.state[key];
      let meshes = 0;
      gun?.traverse((object) => { if (object.isMesh) meshes++ });
      return [key, { name: gun?.name, model: gun?.userData.weaponModel, meshes }];
    })),
  }));
  check('Willy returns to three armed men and waits for the player-authored shot',
    armed.phase === 'ready_to_fire' && armed.playerGun && armed.willyVisible,
    JSON.stringify(armed));
  check('Tony carries the shared revolver while Lou and Booski carry detailed reusable 9mm pistols',
    armed.weapons.playerGun.model === 'six-shot revolver'
      && armed.weapons.playerGun.meshes >= 15
      && armed.weapons.louGun.model === '9mm semi-automatic'
      && armed.weapons.booskiGun.model === '9mm semi-automatic'
      && armed.weapons.louGun.meshes >= 20 && armed.weapons.booskiGun.meshes >= 20,
    JSON.stringify(armed.weapons));
  const executionFrame = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.camera.updateMatrixWorld(true);
    return {
      shot: game.cameraDirector.shot?.id ?? null,
      cameraLocal: game.world.toBoatLocal(game.player.camera.position.clone()).toArray(),
      cast: Object.fromEntries(Object.entries(game.boat.cast).map(([id, npc]) => {
        const ndc = npc.group.localToWorld(new V(0, 1.42, 0)).project(game.player.camera);
        return [id, ndc.toArray()];
      })),
    };
  });
  check('the execution uses an over-shoulder composition with Willy, Lou and Booski readable',
    executionFrame.shot === 'execution-over-shoulder'
      && executionFrame.cameraLocal[1] > 2.5
      && Object.values(executionFrame.cast).every(([x, y, z]) => (
        Math.abs(x) <= .88 && Math.abs(y) <= .92 && z >= -1 && z <= 1
      )),
    JSON.stringify(executionFrame));
  await capture('no-wake-execution-ready.png');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.state.focus = null;
    game.player.position.copy(game.world.fromBoatLocal(
      new game.player.position.constructor(-1.90, 2.44, 3.82),
    ));
    game.player.yaw = -1.82;
    game.player.pitch = -.10;
    game.player.update(.016);
  });
  await page.waitForTimeout(80);
  await capture('no-wake-willy-profile.png');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.position.copy(game.world.fromBoatLocal(
      new game.player.position.constructor(0, 2.68, 1.72),
    ));
    game.player.yaw = game.physics.heading + Math.PI;
    game.player.pitch = -.08;
    game.state.focus = 'willy';
    game.player.update(.016);
  });

  await page.mouse.click(640, 360);
  // CPU-constrained screenshot runs can delay the authored setTimeouts; wait
  // for the actual collapse phase instead of sampling a wall-clock guess.
  await page.waitForFunction(() => window.NO_WAKE.phase === 'body');
  await page.waitForTimeout(80);
  const collapseFrame = await page.evaluate(() => ({
    shot: window.NO_WAKE.cameraDirector.shot?.id ?? null,
    cameraLocal: window.NO_WAKE.world.toBoatLocal(
      window.NO_WAKE.player.camera.position.clone(),
    ).toArray(),
  }));
  check('the collapse cuts to a low side profile instead of staring down at deck fragments',
    collapseFrame.shot === 'execution-collapse-profile'
      && collapseFrame.cameraLocal[1] < 2.65 && collapseFrame.cameraLocal[0] < -1.5,
    JSON.stringify(collapseFrame));
  await capture('no-wake-execution-collapse.png');
  await page.waitForTimeout(3000);
  const body = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    shots: window.NO_WAKE.state.executionShots,
    fell: Math.abs(window.NO_WAKE.boat.cast.willy.group.rotation.z) > 1,
    mode: window.NO_WAKE.player.mode,
    fullPitch: window.NO_WAKE.player.pitchMin < -1.2 && window.NO_WAKE.player.pitchMax > 1.2,
    /* Either surface starts the lift: the broad proxy carries the hold so it
     * cannot slip off a man lying on a moving deck, and his own figure stays
     * registered so looking straight at him still names him. */
    targeted: window.NO_WAKE.interaction.current === window.NO_WAKE.boat.cast.willy.group
      || window.NO_WAKE.interaction.current === window.NO_WAKE.boat.targets.body,
    promptVisible: !document.getElementById('prompt').classList.contains('hidden'),
    cinematicReleased: !window.NO_WAKE.cameraDirector.active,
    bodyOriginY: window.NO_WAKE.boat.cast.willy.group.position.y,
    deckY: window.NO_WAKE.boat.deck.height,
  }));
  check('the real click fires first, shows Willy fall, then restores a playable body interaction',
    body.phase === 'body' && body.shots >= 4 && body.fell
      && body.mode === 'walk' && body.fullPitch && body.targeted
      && body.promptVisible && body.cinematicReleased
      && body.bodyOriginY >= body.deckY,
    JSON.stringify(body));
  await capture('no-wake-body-interaction.png');

  /* The 0.85 s hold accumulates in the scene's own clamped step, not in wall
   * clock: `animate` caps dt at 0.05, so on a software rasteriser running at a
   * handful of frames a second the simulated hold advances at a fraction of
   * real time. Six and a half seconds of held key used to land just under the
   * threshold and read as a broken disposal. Hold it long enough that this
   * contract measures the interaction rather than the rasteriser. */
  await page.keyboard.down('e');
  await page.waitForTimeout(14000);
  await page.keyboard.up('e');
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 0; });
  await page.waitForTimeout(100);
  const disposalStart = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    position: window.NO_WAKE.boat.cast.willy.group.position.toArray(),
    rotation: window.NO_WAKE.boat.cast.willy.group.rotation.toArray(),
    shot: window.NO_WAKE.cameraDirector.shot?.id ?? null,
  }));
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = .82; });
  await page.waitForTimeout(120);
  const disposalDrag = await page.evaluate(() => ({
    position: window.NO_WAKE.boat.cast.willy.group.position.toArray(),
    rotation: window.NO_WAKE.boat.cast.willy.group.rotation.toArray(),
    shot: window.NO_WAKE.cameraDirector.shot?.id ?? null,
  }));
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 1.68; });
  await page.waitForTimeout(120);
  const disposalLift = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const center = game.boat.cast.willy.group.localToWorld(
      new game.player.position.constructor(0, .92, 0),
    ).project(game.player.camera);
    return {
      position: game.boat.cast.willy.group.position.toArray(),
      rotation: game.boat.cast.willy.group.rotation.toArray(),
      booski: game.boat.cast.booski.group.position.toArray(),
      screen: center.toArray(),
    };
  });
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 1.95; });
  await page.waitForTimeout(120);
  await capture('no-wake-body-overboard.png');
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 2.48; });
  await page.waitForTimeout(120);
  const disposalOverboard = await page.evaluate(() => ({
    position: window.NO_WAKE.boat.cast.willy.group.position.toArray(),
    rotation: window.NO_WAKE.boat.cast.willy.group.rotation.toArray(),
    visible: window.NO_WAKE.boat.cast.willy.group.visible,
    halfBeam: window.NO_WAKE.boat.deck.halfBeam,
  }));
  check('the disposal shot visibly drags, lifts and rolls Willy beyond the side rail',
    disposalStart.phase === 'dispose'
      && disposalStart.shot === 'disposal-transom-side'
      && disposalDrag.shot === 'disposal-transom-side'
      && disposalDrag.position[0] > disposalStart.position[0] + .45
      && disposalLift.position[0] > disposalDrag.position[0] + .45
      && disposalLift.position[1] > disposalDrag.position[1] + .3
      && Math.abs(disposalLift.rotation[2] - disposalDrag.rotation[2]) > .3
      && Math.abs(disposalLift.screen[0]) < .82 && Math.abs(disposalLift.screen[1]) < .82
      && disposalOverboard.position[0] > disposalOverboard.halfBeam
      && disposalOverboard.position[1] < disposalLift.position[1] - .45
      && disposalOverboard.visible,
    JSON.stringify({ disposalStart, disposalDrag, disposalLift, disposalOverboard }));

  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 3.18; });
  await page.waitForTimeout(450);
  const disposal = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    disposed: window.NO_WAKE.state.bodyDisposed,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
    splashCount: window.NO_WAKE.state.disposal?.splashCount ?? 0,
    returnCount: window.NO_WAKE.state.disposal?.returnCount ?? 0,
    activeAftermath: (window.NO_WAKE.state.aftermathCueLog ?? [])
      .filter((entry) => entry.status !== 'complete').length,
  }));
  check('body disposal enters the silent return with Willy removed from the boat',
    disposal.phase === 'return' && disposal.disposed && !disposal.willyVisible
      && disposal.splashCount === 1 && disposal.returnCount === 1
      && disposal.activeAftermath > 0,
    JSON.stringify(disposal));

  await capture('no-wake-return-wake-wide.png');
  await page.evaluate(() => {
    window.NO_WAKE.state.phaseTime = 5.55;
    // Screenshot capture can be slower than the authored clock in headless
    // mode. Force a fresh cut after the deliberate time jump so this samples
    // the shot itself, not a stale transition from the preceding wide.
    window.NO_WAKE.cameraDirector.shot = null;
  });
  await page.waitForTimeout(450);
  await capture('no-wake-return-silent-deck.png');
  const silentDeckFrame = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const booski = game.boat.cast.booski.group.localToWorld(new V(0, 1.42, 0))
      .project(game.player.camera).toArray();
    const from = game.state.returnFrom;
    const to = game.state.returnTo;
    const control = game.state.returnControl;
    const position = game.boat.root.position;
    const chordX = to.x - from.x;
    const chordZ = to.z - from.z;
    const chordLength = Math.max(.001, Math.hypot(chordX, chordZ));
    const crossTrack = (point) => Math.abs(
      chordX * (from.z - point.z) - (from.x - point.x) * chordZ
    ) / chordLength;
    return {
      shot: game.cameraDirector.shot?.id ?? null,
      authoredPosition: game.cameraDirector.shot?.position ?? null,
      cameraLocal: game.world.toBoatLocal(game.player.camera.position.clone()).toArray(),
      booski,
      louAtHelm: game.boat.cast.lou.group.position.z < .2,
      emptyStern: !game.boat.cast.willy.group.visible,
      route: {
        from: from.toArray(),
        control: control.toArray(),
        to: to.toArray(),
        position: position.toArray(),
        controlCrossTrack: crossTrack(control),
        boatCrossTrack: crossTrack(position),
      },
    };
  });
  check('the return middle shot clears the wheelhouse and holds on Booski beside the empty stern',
    silentDeckFrame.shot === 'return-silent-deck'
      && silentDeckFrame.cameraLocal[0] < -3.5 && silentDeckFrame.authoredPosition?.[2] > 6
      && Math.abs(silentDeckFrame.booski[0]) < .82 && Math.abs(silentDeckFrame.booski[1]) < .82
      && silentDeckFrame.louAtHelm && silentDeckFrame.emptyStern,
    JSON.stringify(silentDeckFrame));
  check('the ride home follows a broad turning arc instead of sliding straight to the dock',
    silentDeckFrame.route.controlCrossTrack >= 50
      && silentDeckFrame.route.boatCrossTrack >= 20,
    JSON.stringify(silentDeckFrame.route));
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 10.85; });
  await page.waitForTimeout(450);
  await capture('no-wake-return-harbor-ahead.png');
  const montage = await page.evaluate(() => ({
    shots: [...window.NO_WAKE.cameraDirector.seenShots]
      .filter((id) => id.startsWith('return-')),
    active: window.NO_WAKE.cameraDirector.shot?.id ?? null,
  }));
  check('the silent ride home uses three authored return montage shots',
    ['return-wake-wide', 'return-silent-deck', 'return-harbor-ahead']
      .every((id) => montage.shots.includes(id))
      && montage.active === 'return-harbor-ahead',
    JSON.stringify(montage));

  /* Six now: Irish clears the rail after the shot and refuses the back half of
   * the egg story on the way in. Counted off the authored list rather than
   * hard-coded, so adding a line to the aftermath cannot silently hang this
   * wait again. */
  const aftermathExpected = Object.values(NO_WAKE_AFTERMATH_LINES);
  await page.waitForFunction((expected) => {
    const log = window.NO_WAKE.state.aftermathCueLog ?? [];
    return log.length === expected && log.every((entry) => entry.status !== 'queued');
  }, aftermathExpected.length, { timeout: 60000 });
  const aftermathSequence = await page.evaluate((expectedTexts) => {
    const entries = window.NO_WAKE.state.aftermathCueLog ?? [];
    const subtitles = window.NO_WAKE.dialogueLog
      .filter((line) => expectedTexts.includes(line.text))
      .map((line) => line.text);
    return {
      cues: entries.map((entry) => entry.cue),
      statuses: entries.map((entry) => entry.status),
      windows: entries.map((entry) => [entry.startAt, entry.endAt]),
      subtitles,
    };
  }, aftermathExpected.map((line) => line.text));
  check(`all ${aftermathExpected.length} aftermath cues and subtitles are requested in order without overlapping voice windows`,
    JSON.stringify(aftermathSequence.cues) === JSON.stringify(aftermathExpected.map((line) => line.cue))
      && aftermathSequence.statuses.every((status) => ['started', 'complete'].includes(status))
      && aftermathSequence.windows.every((window, index, windows) => (
        index === 0 || window[0] >= windows[index - 1][1] - .001
      ))
      && JSON.stringify(aftermathSequence.subtitles) === JSON.stringify(aftermathExpected.map((line) => line.text)),
    JSON.stringify(aftermathSequence));

  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 15.98; });
  await page.waitForFunction(() => window.NO_WAKE.campaignState.missions.no_wake.status === 'complete');
  const completed = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    chapter: window.NO_WAKE.campaignState.story.chapter,
    canonical: localStorage.getItem('squatchlife.campaign'),
  }));
  check('completion records every irreversible beat and opens Front and Center',
    completed.mission.status === 'complete' && completed.mission.betrayalConfirmed
      && completed.mission.playerFired && completed.mission.bodyDisposed
      && completed.chapter === 'date', JSON.stringify(completed));
  check('the complete browser playthrough leaves canonical storage byte-for-byte untouched',
    completed.canonical === SENTINEL);
  check('the browser emitted no uncaught errors', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} NO WAKE checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} NO WAKE checks passed.`);

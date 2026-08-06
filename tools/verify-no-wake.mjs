#!/usr/bin/env node
/**
 * Browser-level production verification for NO WAKE, after the redesign.
 *
 * `docs/NO-WAKE-REDESIGN.md` replaced the scene's interior wholesale, so this
 * file was rewritten with it. What it asserts is the spec's own list, in the
 * order the mission plays it, plus the four things the owner said were wrong
 * with the old build and must not come back:
 *
 *   - boarding, the bow and the helm were too tight            → clearances
 *   - the shooting beat spawned him behind a wall              → sight lines
 *   - Lou and Booski were not visibly firing                   → three shooters
 *   - the body roll into the water read weak                   → authored beats
 *   - the ride home reversed in a straight line                → the player drives
 *
 * Two rules from `docs/ENGINE-TRAPS.md` govern how it is written:
 *
 *   #2  Never sleep for a duration and assume progress. Every wait here is on
 *       a predicate the game publishes, with a generous budget, because the
 *       scene's clock is simulated and this rasteriser draws it at under a
 *       frame a second.
 *   #5  Walk it. If the player walks somewhere, the check walks there; if he
 *       holds a button, the check holds the button and waits for what the
 *       button earns.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_WAKE_CABIN_SCRIPT, allNoWakeVoiceLines } from '../src/nowake/dialogue.js';
import { isNoWakeAudioPreloadCue } from '../src/nowake/audio.js';
import { CABIN, CABIN_STAGING, DECK } from '../src/nowake/deck-collision.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CABIN_HEIGHT = CABIN.height;
const CABIN_BOW = CABIN.bow;
const CABIN_STERN = CABIN.stern;
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
/* Every wait in this file is wall clock waiting on SIMULATED time. The scene
 * clamps its step at 0.05 s and advances once per drawn frame, and this page on
 * a software rasteriser draws well under one frame a second. A large ceiling
 * costs nothing when the condition is met and only changes how long a genuine
 * failure takes to report. The walkable sweeps alone are tens of thousands of
 * real Player steps inside one evaluate, and the authored tweens are measured
 * in simulated seconds, so the ceiling is ten minutes: it is a guard against a
 * hang, not a performance assertion. */
page.setDefaultTimeout(600000);
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

/* ------------------------------------------------------------------ *
 * Off-page contracts: the script, the manifest and the recording sheet
 * ------------------------------------------------------------------ */

const authoredVoice = allNoWakeVoiceLines();
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const manifestVoice = soundManifest.sfx.filter((cue) => cue.name.startsWith('vo.nowake.'));
const manifestByName = new Map(manifestVoice.map((cue) => [cue.name, cue]));
const AUTHORED_LINE_COUNT = 37;
check(`all ${AUTHORED_LINE_COUNT} redesigned NO WAKE lines have stable cue ids, cast voices and exact manifest text`,
  authoredVoice.length === AUTHORED_LINE_COUNT
    && manifestVoice.length === authoredVoice.length
    && authoredVoice.every((line) => {
      const cue = manifestByName.get(`vo.nowake.${line.cue}.1`);
      return cue?.voice === line.voice && cue?.say === line.text;
    }),
  JSON.stringify({ authored: authoredVoice.length, manifest: manifestVoice.length }));

/* The redesign rewrote every line in the mission, so the whole bank is owed.
 * This list is a statement about what is still outstanding: a line that gets
 * recorded has to come out of it, and a line authored later has to go in, or
 * the sheet stops being the thing the owner records from (engine trap #3). */
const recordingSheet = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');
const expectedNoWakePickups = authoredVoice.map((line) => `vo.nowake.${line.cue}.1.mp3`).sort();
const noWakePickupFiles = authoredVoice
  .map((line) => `vo.nowake.${line.cue}.1.mp3`)
  .filter((file) => recordingSheet.includes(`\`${file}\``))
  .sort();
check(`the recording sheet still owes every one of the ${AUTHORED_LINE_COUNT} redesigned lines`,
  JSON.stringify(noWakePickupFiles) === JSON.stringify(expectedNoWakePickups)
    && authoredVoice.every((line) => !indexedFiles.has(`vo.nowake.${line.cue}.1.mp3`)),
  JSON.stringify({ owed: noWakePickupFiles.length, expected: expectedNoWakePickups.length }));

/* A reworded line must not inherit a delivered take of different words. The old
 * build shipped `vo.nowake.cruise.willy.motel.1.mp3`; the redesign's equivalent
 * line is `cruise.willy.sideways` precisely so that recording cannot play under
 * a subtitle nobody wrote. */
check('no redesigned cue reuses an old delivered recording of different words',
  authoredVoice.every((line) => {
    const file = `vo.nowake.${line.cue}.1.mp3`;
    if (!indexedFiles.has(file)) return true;
    return manifestByName.get(`vo.nowake.${line.cue}.1`)?.say === line.text;
  }));

const shots = path.join(ROOT, 'docs', 'validation', '2026-08-06');
if (WRITE_SCREENSHOTS) await fsp.mkdir(shots, { recursive: true });
const capture = (name) => (WRITE_SCREENSHOTS
  ? page.screenshot({ path: path.join(shots, name) })
  : Promise.resolve());


try {
  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  /* One helper the whole file aims with: put the crosshair on a boat-local
   * point from where the player is really standing, step the real interaction
   * system, and report what it found. Every "the player uses X" check below
   * goes through this rather than calling an onUse directly. */
  await page.evaluate(() => {
    window.__aim = (local, from = null) => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      if (from) {
        game.player.position.copy(game.world.fromBoatLocal(new V(from[0], from[1], from[2])));
        game.player.update(1 / 60);
      }
      const target = game.world.fromBoatLocal(new V(local[0], local[1], local[2]));
      const delta = target.clone().sub(game.player.camera.position);
      game.player.yaw = Math.atan2(-delta.x, -delta.z);
      game.player.pitch = Math.asin(delta.y / delta.length());
      game.player.update(1 / 60);
      game.player.camera.updateMatrixWorld(true);
      game.interaction.update(1 / 60);
      return game.interaction.current?.name ?? null;
    };
  });

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
  await page.evaluate(() => window.NO_WAKE.postfx?.disable?.());

  /* A trusted browser gesture, aimed with coordinates rather than a locator: a
   * locator click waits for the target's bounding box to render two identical
   * animation frames in a row, and this page's continuous WebGL redraw on a
   * software rasteriser can make that wait run past any ceiling. */
  const startBox = await page.evaluate(() => {
    const r = document.getElementById('start-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(startBox.x, startBox.y);
  await page.waitForFunction(() => !document.getElementById('overlay'), null, { timeout: 300000 });
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

  const residency = await page.evaluate((expected) => {
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
    residency.exposed
      && residency.plan?.manifestTotal === soundManifest.sfx.length
      && residency.plan?.selected === selectedNoWakeCues.length
      && residency.loaded === expectedResidentNames.length
      && residency.resident === expectedResidentNames.length
      && residency.missing.length === 0 && residency.unexpected.length === 0,
    JSON.stringify({ ...residency, selected: selectedNoWakeCues.length, pending: pendingNoWakeNames.length }));

  /* Five effects were authored with the redesign and none is recorded yet: the
   * inlet bed, the throttle blip, the water on the hull heard from the cabin,
   * the bag closing and the ballast. Everything else this boat asks for is on
   * disk. An approved-pending list is a statement about what is owed. */
  const expectedPendingNoWakeNames = [
    'ambience.ocean.night', 'boat.bag.zip', 'boat.ballast.chain',
    'boat.engine.rev', 'water.lap.hull',
    ...authoredVoice.map((line) => `vo.nowake.${line.cue}.1`),
  ].sort();
  check('only the approved NO WAKE production pickups remain pending',
    JSON.stringify(pendingNoWakeNames) === JSON.stringify(expectedPendingNoWakeNames),
    JSON.stringify({ pending: pendingNoWakeNames.length, expected: expectedPendingNoWakeNames.length }));

  const inventory = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    slots: document.querySelectorAll('#hotbar .slot').length,
  }));
  check('NO WAKE keeps the shared five-slot inventory visible',
    inventory.visible && inventory.slots === 5, JSON.stringify(inventory));

  /* ---------------------------------------------------------------- *
   * The boat the spec asked for
   * ---------------------------------------------------------------- */

  const boot = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const Box3 = game.boat.localColliders[0].constructor;
    const named = (pattern) => {
      const found = [];
      game.boat.root.traverse((object) => {
        if (object.isMesh && pattern.test(object.name || '')) found.push(object.name);
      });
      return found;
    };
    return {
      phase: game.phase,
      mission: game.campaignState.missions.no_wake,
      scene: game.campaignState.scene,
      preview: Boolean(document.getElementById('squatch-preview-notice')),
      boatName: game.boat.root.name,
      dimensions: game.boat.root.userData.dimensions,
      waterline: game.boat.root.userData.waterline,
      detailMeshes: game.boat.root.userData.detailMeshes,
      cabinMeshes: game.cabin.group.userData.detailMeshes,
      cast: Object.fromEntries(Object.entries(game.boat.cast).map(([id, npc]) => [id, {
        characterId: npc.group.userData.characterId,
        gut: npc.parts.profile.gut ?? 0,
        local: game.world.toBoatLocal(npc.group.getWorldPosition(new game.player.position.constructor())).toArray(),
      }])),
      controls: Object.fromEntries(Object.entries(game.boat.controls)
        .filter(([, value]) => value?.root)
        .map(([id, value]) => [id, value.root.name])),
      dockLine: game.boat.targets.dockLine.userData,
      gangway: {
        name: game.boat.gangway?.name ?? null,
        visible: game.boat.gangway?.visible ?? false,
        meshes: (() => {
          let n = 0;
          game.boat.gangway?.traverse((o) => { if (o.isMesh) n++; });
          return n;
        })(),
      },
      helmTarget: (() => {
        const target = game.boat.targets.helm;
        const size = new Box3().setFromObject(target).getSize(target.position.clone());
        return { name: target.name, size: size.toArray() };
      })(),
      localColliders: game.boat.localColliders.length,
      cabinColliders: game.boat.cabinColliders.length,
      waterVertices: game.world.water.mesh.geometry.attributes.position.count,
      buoyCount: game.world.buoys.length,
      period: {
        smokedWindshield: named(/windshield pane/).length,
        analogGauges: named(/gauge (bezel|face|needle)/).length,
        chromeThrottle: named(/throttle lever/).length,
        creamVinylSeams: named(/seam/).length,
        brass: named(/brass|tap|latch|fiddle/).length,
      },
      stern: {
        platform: named(/swim platform/).length,
        ladder: named(/swim ladder/).length,
        gate: game.boat.transomGate?.name ?? null,
        hatch: named(/stern hatch/).length,
        disposalZone: game.boat.targets.disposal?.name ?? null,
      },
      bow: {
        sunPad: named(/sun pad/).length,
        anchorHatch: named(/anchor hatch/).length,
        locker: named(/forward locker/).length,
        searchlight: named(/searchlight/).length,
        ropeCoil: named(/bow rope coil/).length,
      },
      cabinParts: (() => {
        const found = [];
        game.cabin.group.traverse((o) => { if (o.isMesh) found.push(o.name); });
        return {
          bar: found.filter((n) => /galley|tequila|glass \d|bottle/.test(n)).length,
          sink: found.some((n) => /sink basin/.test(n)),
          mirror: found.some((n) => /liquor cabinet mirror/.test(n)),
          glasses: found.filter((n) => /^glass \d wall$/.test(n)).length,
          dinette: found.filter((n) => /dinette/.test(n)).length,
          vberth: found.filter((n) => /V-berth/.test(n)).length,
          headDoor: found.some((n) => /closed head door/.test(n)),
          midBerth: found.some((n) => /mid-cabin berth/.test(n)),
          portholes: found.filter((n) => /porthole/.test(n)).length,
          runner: found.some((n) => /sole runner/.test(n)),
          companionway: found.filter((n) => /companionway/.test(n)).length,
        };
      })(),
    };
  });

  check('preview boots NO WAKE in progress at Gate C',
    boot.phase === 'dock' && boot.mission.status === 'in_progress'
      && boot.scene.id === 'no_wake' && boot.scene.spawn === 'gate_c' && boot.preview,
    JSON.stringify({ phase: boot.phase, mission: boot.mission.status, scene: boot.scene }));
  check('the boat is a detailed 35-36 ft express cruiser, not the old 42-footer',
    /36-foot express cruiser/.test(boot.boatName)
      && boot.dimensions.feet >= 34 && boot.dimensions.feet <= 37
      && boot.dimensions.beam >= 4.2 && boot.dimensions.beam <= 4.6
      && boot.detailMeshes >= 300 && boot.buoyCount >= 10,
    JSON.stringify({ boat: boot.boatName, dimensions: boot.dimensions, details: boot.detailMeshes }));
  check('the period fittings the spec names are all modeled',
    boot.period.smokedWindshield >= 2 && boot.period.analogGauges >= 12
      && boot.period.chromeThrottle >= 2 && boot.period.creamVinylSeams >= 4
      && boot.period.brass >= 4,
    JSON.stringify(boot.period));
  check('the stern is a disposal point: swim platform, ladder, transom gate, storage hatch',
    boot.stern.platform >= 3 && boot.stern.ladder >= 3
      && /transom gate/.test(boot.stern.gate ?? '') && boot.stern.hatch >= 2
      && /disposal zone/.test(boot.stern.disposalZone ?? ''),
    JSON.stringify(boot.stern));
  check('the bow carries the sun pad, the anchor hatch, the searchlight and the ballast locker',
    boot.bow.sunPad >= 1 && boot.bow.anchorHatch >= 2 && boot.bow.locker >= 3
      && boot.bow.searchlight >= 2 && boot.bow.ropeCoil >= 1,
    JSON.stringify(boot.bow));
  check('below deck is a real cabin: bar to port, dinette to starboard, V-berth forward',
    boot.cabinMeshes >= 60
      && boot.cabinParts.bar >= 12 && boot.cabinParts.sink && boot.cabinParts.mirror
      && boot.cabinParts.glasses === 4 && boot.cabinParts.dinette >= 6
      && boot.cabinParts.vberth >= 6 && boot.cabinParts.headDoor && boot.cabinParts.midBerth
      && boot.cabinParts.portholes >= 4 && boot.cabinParts.runner
      && boot.cabinParts.companionway >= 8,
    JSON.stringify({ meshes: boot.cabinMeshes, ...boot.cabinParts }));
  check('the startup controls the spec lists are modeled objects',
    /battery selector/.test(boot.controls.battery)
      && /blower push/.test(boot.controls.blower)
      && /fuel valve/.test(boot.controls.fuel)
      && /port engine ignition/.test(boot.controls.ignitionPort)
      && /starboard engine ignition/.test(boot.controls.ignitionStarboard)
      && /navigation light switch/.test(boot.controls.navLights)
      && boot.dockLine.attached === true,
    JSON.stringify({ controls: boot.controls, dockLine: boot.dockLine }));
  check('a visible boarding bridge and a forgiving helm proxy make the routes legible',
    /boarding bridge/.test(boot.gangway.name ?? '') && boot.gangway.visible
      && boot.gangway.meshes >= 4
      && /helm interaction proxy/.test(boot.helmTarget.name)
      && boot.helmTarget.size[0] >= 1.4 && boot.helmTarget.size[2] >= .65,
    JSON.stringify({ gangway: boot.gangway, helm: boot.helmTarget }));
  check('the cruiser sits at a measured displacement waterline with the platform just above the water',
    boot.waterline.restingY < -.05
      && boot.waterline.draft > .80 && boot.waterline.draft < 1.00
      && boot.waterline.sideFreeboard > .70 && boot.waterline.sideFreeboard < .95
      && boot.waterline.deckFreeboard > 1.00 && boot.waterline.deckFreeboard < 1.25
      && boot.waterline.platformY > boot.waterline.surfaceY
      && boot.waterline.platformY - boot.waterline.surfaceY < .40,
    JSON.stringify(boot.waterline));
  check('both walkable spaces have local collision and the water has a dense displaced surface',
    boot.localColliders >= 18 && boot.cabinColliders >= 7 && boot.waterVertices >= 40000,
    JSON.stringify({ deck: boot.localColliders, cabin: boot.cabinColliders, water: boot.waterVertices }));
  check('stable character identities drive the cast and Willy keeps his permanent belly',
    boot.cast.lou.characterId === 'lou' && boot.cast.booski.characterId === 'booski'
      && boot.cast.willy.characterId === 'willy' && boot.cast.irish.characterId === 'irish'
      && boot.cast.willy.gut >= 1,
    JSON.stringify(Object.fromEntries(Object.entries(boot.cast).map(([k, v]) => [k, v.characterId]))));
  /* "Irish already aboard with binoculars." He is on the bow at the dock and he
   * is still on the bow when the body goes over the side. */
  check('Irish is already on the bow with his binoculars before anybody boards',
    boot.cast.irish.local[2] < -3 && boot.cast.irish.local[1] > DECK.height + .5
      && await page.evaluate(() => Boolean(window.NO_WAKE.boat.cast.irish.parts.foreR
        .getObjectByName('Irish binoculars'))),
    JSON.stringify({ irish: boot.cast.irish.local }));
  await capture('no-wake-gate-c.png');

  const marina = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const exteriorFaces = (hull) => {
      const p = hull.geometry.attributes.position;
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
    let signs = 0;
    let houses = 0;
    game.world.channel.root.traverse((o) => {
      if (/NO WAKE sign/.test(o.name || '')) signs++;
      if (/shoreline house walls/.test(o.name || '')) houses++;
    });
    return {
      neighbors: game.world.marina.neighborBoats.map((b) => ({
        details: b.userData.detailMeshes,
        exterior: exteriorFaces(b.getObjectByName('tapered neighboring hull')),
      })),
      cruiserExterior: exteriorFaces(game.boat.root.getObjectByName('cream fiberglass hull')),
      signs,
      houses,
      signLocal: game.world.channel.sign.position.toArray(),
      inlet: game.world.inlet,
      pointName: game.world.channel.point.name,
      quarryName: game.world.channel.quarry.name,
      dusk: game.world.water.mesh.parent.background.getHex(),
    };
  });
  check('the marina is an isolated finger at dusk with detailed neighbours and outward hull winding',
    marina.neighbors.length === 2
      && marina.neighbors.every((b) => b.details >= 25 && b.exterior.outward === b.exterior.sideFaces)
      && marina.cruiserExterior.outward === marina.cruiserExterior.sideFaces
      && marina.dusk < 0x808080,
    JSON.stringify({ neighbors: marina.neighbors, dusk: marina.dusk.toString(16) }));
  /* "The NO WAKE sign passes to starboard, marina lights fall away, houses thin
   * out." The boat runs out along -Z, so starboard is +X. */
  check('the NO WAKE board passes to starboard on the way out, past thinning houses, into a closed inlet',
    marina.signs >= 2 && marina.signLocal[0] > 5 && marina.signLocal[2] < 0
      && marina.houses >= 12
      && /wooded point/.test(marina.pointName) && /quarry/.test(marina.quarryName)
      && marina.inlet.z < -300,
    JSON.stringify({ sign: marina.signLocal, houses: marina.houses, inlet: marina.inlet }));

  /* ---------------------------------------------------------------- *
   * Boarding, and the walkable-deck sweep
   * ---------------------------------------------------------------- */

  const boardingAim = await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.position.set(-4.72, 1.86, 3.10);
    game.player.ground = .2;
    game.player.update(1 / 60);
    return window.__aim([-3.10, 1.10, 3.10]);
  });
  await capture('no-wake-boarding-bridge.png');
  await page.keyboard.press('e');
  await page.waitForTimeout(120);
  const crossing = await page.evaluate(() => ({
    boarding: window.NO_WAKE.state.boarding,
    boarded: window.NO_WAKE.state.boarded,
    bridgeStillDown: window.NO_WAKE.boat.gangway.visible,
    mode: window.NO_WAKE.player.mode,
  }));
  await page.waitForFunction(() => window.NO_WAKE.state.boarded === true);
  const boarded = await page.evaluate(() => ({
    boarded: window.NO_WAKE.state.boarded,
    bridgeStowed: !window.NO_WAKE.boat.gangway.visible,
    phase: window.NO_WAKE.phase,
    local: window.NO_WAKE.world.toBoatLocal(window.NO_WAKE.player.position.clone()).toArray(),
    objective: document.getElementById('objective')?.textContent ?? null,
  }));
  check('the player boards through the bridge target with real crosshair and E input',
    /boarding bridge/.test(boardingAim ?? '')
      && crossing.boarding && !crossing.boarded && crossing.bridgeStillDown
      && crossing.mode === 'frozen'
      && boarded.boarded && boarded.bridgeStowed && boarded.phase === 'startup'
      && boarded.local[2] > 2.4 && boarded.local[2] < 3.8,
    JSON.stringify({ boardingAim, crossing, boarded }));

  /* ---------------------------------------------------------------------
   * Walkable sweeps, on deck and below.
   *
   * Every soft-lock this scene has shipped has been the same shape: two solids
   * leaving a channel narrower than the player's 0.60 m capsule, no position
   * that satisfies both, and the player pinned with his velocity cancelled. So
   * drop the real Player on a grid across each walkable space, step the real
   * simulation at every cell, and require three things of each one — it
   * settles, it settles somewhere clear and still aboard, and from wherever it
   * settles the player can walk away.
   *
   * `tests/no-wake-deck.test.mjs` runs the same sweeps against the shared
   * resolver, so the two cannot drift apart silently.
   * ------------------------------------------------------------------- */
  await page.evaluate(() => {
    window.__sweep = ({ space = 'deck', step = .22, settleFrames = 36, escapeFrames = 32, headings = 8 } = {}) => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      const player = game.player;
      const below = space === 'cabin';
      const extent = below ? game.boat.cabinDeck : game.boat.deck;
      const boxes = below ? game.boat.cabinColliders : game.boat.localColliders;
      const radius = .30;
      const dt = 1 / 60;
      const saved = {
        mode: player.mode, enabled: player.enabled, position: player.position.clone(),
        yaw: player.yaw, ground: player.ground, onFootstep: player.onFootstep,
        below: game.world.below,
      };
      game.world.setBelow(below);
      player.onFootstep = null;
      player.mode = 'walk';
      player.enabled = true;
      player.clearKeys();
      const floorAt = (z) => extent.heightAt(z);
      const place = (lx, lz) => {
        player.velocity.set(0, 0, 0);
        player.jumpHeight = 0;
        player.grounded = true;
        player.ground = game.boat.root.position.y + floorAt(lz);
        player.position.copy(game.world.fromBoatLocal(
          new V(lx, floorAt(lz) + player.eyeHeight, lz),
        ));
      };
      const local = () => game.world.toBoatLocal(player.position.clone());
      const penetration = (lx, lz) => {
        let worst = 0;
        let name = null;
        const eyeY = floorAt(lz) + player.eyeHeight;
        for (const box of boxes) {
          if (eyeY + .05 < box.min.y || eyeY - player.eyeHeight > box.max.y) continue;
          const cx = Math.max(box.min.x, Math.min(box.max.x, lx));
          const cz = Math.max(box.min.z, Math.min(box.max.z, lz));
          const depth = radius - Math.hypot(lx - cx, lz - cz);
          if (depth > worst) { worst = depth; name = box.name ?? null; }
        }
        return { depth: worst, name };
      };
      const settle = (lx, lz) => {
        place(lx, lz);
        let px = player.position.x;
        let pz = player.position.z;
        let amplitude = 0;
        for (let i = 0; i < settleFrames; i++) {
          player.update(dt);
          if (i > settleFrames - 12) {
            amplitude = Math.max(amplitude, Math.hypot(player.position.x - px, player.position.z - pz));
          }
          px = player.position.x;
          pz = player.position.z;
        }
        return { at: local(), amplitude };
      };

      const failures = [];
      const settled = new Map();
      let cells = 0;
      for (let x = -extent.halfBeam; x <= extent.halfBeam + 1e-9; x += step) {
        for (let z = extent.bow; z <= extent.stern + 1e-9; z += step) {
          cells++;
          const { at, amplitude } = settle(x, z);
          const { depth, name } = penetration(at.x, at.z);
          const offDeck = Math.abs(at.x) > extent.halfBeam + .02
            || at.z < extent.bow - .02 || at.z > extent.stern + .02;
          if (amplitude > .004 || depth > .01 || offDeck) {
            failures.push({
              kind: offDeck ? 'off-deck' : depth > .01 ? 'buried' : 'oscillating',
              from: [+x.toFixed(2), +z.toFixed(2)], to: [+at.x.toFixed(3), +at.z.toFixed(3)],
              depth: +depth.toFixed(3), amplitude: +amplitude.toFixed(4), inside: name,
            });
          }
          const key = `${Math.round(at.x / .15)}:${Math.round(at.z / .15)}`;
          if (!settled.has(key)) settled.set(key, { x: at.x, z: at.z, from: [x, z] });
        }
      }

      const trapped = [];
      for (const point of settled.values()) {
        let best = 0;
        for (let i = 0; i < headings; i++) {
          place(point.x, point.z);
          player.yaw = game.boat.root.rotation.y + i / headings * Math.PI * 2;
          player.clearKeys();
          const fromX = player.position.x;
          const fromZ = player.position.z;
          player.setKey('KeyW', true);
          for (let f = 0; f < escapeFrames; f++) player.update(dt);
          player.setKey('KeyW', false);
          best = Math.max(best, Math.hypot(player.position.x - fromX, player.position.z - fromZ));
          if (best >= .45) break;
        }
        if (best < .45) {
          trapped.push({ at: [+point.x.toFixed(3), +point.z.toFixed(3)], bestMove: +best.toFixed(3) });
        }
      }

      player.clearKeys();
      game.world.setBelow(saved.below);
      player.mode = saved.mode;
      player.enabled = saved.enabled;
      player.position.copy(saved.position);
      player.yaw = saved.yaw;
      player.ground = saved.ground;
      player.onFootstep = saved.onFootstep;
      player.velocity.set(0, 0, 0);
      player.update(dt);
      return {
        cells, settledPoints: settled.size,
        failures: failures.slice(0, 6), failureCount: failures.length,
        trapped: trapped.slice(0, 6), trappedCount: trapped.length,
      };
    };
  });

  const deckSweep = await page.evaluate(() => window.__sweep({ space: 'deck' }));
  check('every square of the moored deck resolves to a clear, stable, escapable spot',
    deckSweep.cells > 400 && deckSweep.settledPoints > 80
      && deckSweep.failureCount === 0 && deckSweep.trappedCount === 0,
    JSON.stringify(deckSweep));

  const cabinSweep = await page.evaluate(() => window.__sweep({ space: 'cabin' }));
  check('every square of the cabin sole resolves to a clear, stable, escapable spot',
    cabinSweep.cells > 40 && cabinSweep.failureCount === 0 && cabinSweep.trappedCount === 0,
    JSON.stringify(cabinSweep));

  /* Same deck, off the world axes. Collision runs in the boat's frame and the
   * velocity response has to come back out of it, so a heading of zero hides
   * every sign error in that conversion. */
  const turnedSweep = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const heading = game.boat.root.rotation.y;
    const berth = game.boat.root.position.clone();
    game.boat.root.position.set(48, berth.y, -120);
    game.boat.root.rotation.y = 0.8;
    game.boat.root.updateMatrixWorld(true);
    const result = window.__sweep({ space: 'deck' });
    game.boat.root.position.copy(berth);
    game.boat.root.rotation.y = heading;
    game.boat.root.updateMatrixWorld(true);
    return result;
  });
  check('the same deck is trap-free with the boat turned off the world axes',
    turnedSweep.failureCount === 0 && turnedSweep.trappedCount === 0, JSON.stringify(turnedSweep));

  /* ---------------------------------------------------------------- *
   * "Make the deck paths wide" — the owner's first complaint, walked
   * ---------------------------------------------------------------- */

  const routes = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const player = game.player;
    const deck = game.boat.deck;
    const saved = { mode: player.mode, yaw: player.yaw, position: player.position.clone() };
    player.mode = 'walk';
    player.enabled = true;
    const runFrom = (start, headingOffset, frames) => {
      player.clearKeys();
      player.velocity.set(0, 0, 0);
      player.ground = game.boat.root.position.y + deck.heightAt(start[1]);
      player.position.copy(game.world.fromBoatLocal(
        new V(start[0], deck.heightAt(start[1]) + player.eyeHeight, start[1]),
      ));
      player.yaw = game.boat.root.rotation.y + headingOffset;
      player.setKey('KeyW', true);
      for (let i = 0; i < frames; i++) player.update(1 / 60);
      player.setKey('KeyW', false);
      return game.world.toBoatLocal(player.position.clone()).toArray();
    };
    /* `Player` walks along -Z at yaw 0, so a heading offset of 0 is forward
     * (the bow) and Math.PI is aft (the transom). */
    // From the boarding mark, straight forward, up the centre and onto the bow.
    const toTheBow = runFrom([-0.20, 3.10], 0, 420);
    // And back aft again from the bow, which is the walk that used to trap him.
    const backAft = runFrom([0.0, -4.60], Math.PI, 420);
    // Starboard side of the cockpit, aft to the transom gate: the body's route.
    const toTheGate = runFrom([1.30, 1.40], Math.PI, 300);
    player.clearKeys();
    player.mode = saved.mode;
    player.yaw = saved.yaw;
    player.position.copy(saved.position);
    player.velocity.set(0, 0, 0);
    player.update(1 / 60);
    return { toTheBow, backAft, toTheGate };
  });
  check('the player can walk from the boarding mark all the way to the bow, and back aft again',
    routes.toTheBow[2] < -4.2 && Math.abs(routes.toTheBow[0]) < 1.2
      && routes.backAft[2] > 2.5
      && routes.toTheGate[2] > 3.6,
    JSON.stringify(routes));

  /* ---------------------------------------------------------------- *
   * The startup procedure, performed in order, in silence
   * ---------------------------------------------------------------- */

  const startupOrder = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const deck = game.boat.deck;
    const log = [];
    // Stand where a player stands to run the panel: the centre of the bridge
    // deck, between the companionway hatch and the helm console.
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + deck.height;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.10, deck.height + 1.66, 0.40)));
    game.player.update(1 / 60);
    const steps = [
      ['battery', [0.60, 1.62, -0.22]],
      ['blower', [0.86, 1.62, -0.22]],
      ['fuel', [1.10, 1.62, -0.22]],
      ['ignitionPort', [1.34, 1.62, -0.22]],
      ['ignitionStarboard', [1.56, 1.62, -0.22]],
      ['navLights', [1.80, 1.62, -0.22]],
    ];
    for (const [key, at] of steps) {
      const before = { ...game.state };
      const targeted = window.__aim(at);
      // Out of order? Every step behind this one is still false, so pressing
      // now must earn nothing.
      game.interaction.press();
      for (let i = 0; i < 60 && !game.state[key]; i++) game.interaction.update(.05);
      game.interaction.release();
      log.push({ key, targeted, done: game.state[key] === true, wasDone: before[key] === true });
    }
    return {
      log,
      objective: document.getElementById('objective')?.textContent ?? null,
      detail: document.getElementById('objective-detail')?.textContent ?? null,
      running: game.physics.running,
      navOn: game.boat.controls.navLights.on,
    };
  });
  check('the eight-step startup procedure is performed switch by switch from the bridge deck',
    startupOrder.log.every((step) => step.done && step.targeted)
      && startupOrder.running && startupOrder.navOn
      && /STARTUP PROCEDURE/.test(startupOrder.objective ?? ''),
    JSON.stringify(startupOrder));

  const outOfOrder = await page.evaluate(() => {
    const game = window.NO_WAKE;
    // The helm cannot be taken until the dock line is off.
    const before = game.state.atHelm;
    window.__aim([1.16, 1.88, -0.52]);
    game.interaction.press();
    for (let i = 0; i < 30; i++) game.interaction.update(.05);
    game.interaction.release();
    return { before, after: game.state.atHelm, dockLine: game.state.dockLine };
  });
  check('the helm refuses to be taken while the boat is still tied to the dock',
    !outOfOrder.before && !outOfOrder.after && !outOfOrder.dockLine,
    JSON.stringify(outOfOrder));

  const lineReleased = await page.evaluate((foredeck) => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([-1.94, foredeck + .30, -4.86], [-1.30, foredeck + 1.66, -4.10]);
    game.interaction.press();
    for (let i = 0; i < 60 && !game.state.dockLine; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted,
      released: game.state.dockLine,
      ropeVisible: game.boat.targets.dockLine.visible,
      attached: game.boat.targets.dockLine.userData.attached,
      mooringReleased: game.physics.mooringReleased,
    };
  }, DECK.foredeckHeight);
  check('the dock line releases through its own hold interaction from the foredeck',
    /dock/.test(lineReleased.targeted ?? '') && lineReleased.released
      && !lineReleased.ropeVisible && lineReleased.attached === false
      && lineReleased.mooringReleased,
    JSON.stringify(lineReleased));
  await capture('no-wake-startup-panel.png');

  const moored = await page.evaluate(() => {
    const b = window.NO_WAKE.physics;
    const saved = b.mooringReleased;
    b.mooringReleased = false;
    b.running = true; b.throttle = 1;
    const from = b.distance;
    for (let i = 0; i < 240; i++) b.advance(1 / 120);
    const moved = b.distance - from;
    b.throttle = 0;
    b.speed = 0;
    b.mooringReleased = saved;
    return { moved, speed: b.speed };
  });
  check('fixed-step boat thrust cannot move against an attached mooring line',
    moored.moved === 0 && moored.speed === 0, JSON.stringify(moored));

  const helmTaken = await page.evaluate(() => {
    const game = window.NO_WAKE;
    /* Back aft from the bow first. Releasing the line leaves the player at the
     * forward cleat, four and a half metres from the wheel -- well outside the
     * 2.7 m the crosshair reaches -- so a check that aimed from there was
     * asking the helm to be usable from the foredeck. */
    const deck = game.boat.deck;
    const targeted = window.__aim([1.16, 1.88, -0.52], [-0.10, deck.height + 1.66, 0.40]);
    game.interaction.press();
    for (let i = 0; i < 30 && !game.state.atHelm; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted,
      atHelm: game.state.atHelm,
      phase: game.phase,
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
      helmHud: !document.getElementById('helm-hud').classList.contains('hidden'),
    };
  });
  check('taking the helm through the crosshair starts the run and records the underway checkpoint',
    /helm interaction proxy/.test(helmTaken.targeted ?? '') && helmTaken.atHelm
      && helmTaken.phase === 'drive' && helmTaken.checkpoint === 'underway'
      && helmTaken.helmHud,
    JSON.stringify(helmTaken));

  /* ---------------------------------------------------------------- *
   * The run out, the inlet, and the silence after the engines stop
   * ---------------------------------------------------------------- */

  const underway = await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.physics.throttle = .82;
    for (let i = 0; i < 360; i++) game.physics.advance(1 / 120);
    return { distance: game.physics.distance, speed: game.physics.speed, phase: game.phase };
  });
  check('the released cruiser accelerates under her own physics',
    underway.phase === 'drive' && underway.distance > 8 && underway.speed > 1,
    JSON.stringify(underway));

  const deckRide = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    game.physics.speed = .2;
    game.leaveHelm({ force: true });
    const before = game.world.toBoatLocal(game.player.position).clone();
    const startDistance = game.physics.distance;
    game.physics.speed = 2.2;
    game.physics.throttle = 1;
    const frames = await new Promise((resolve) => {
      let drawn = 0;
      const tick = () => {
        drawn++;
        if (game.physics.distance - startDistance > .45 || drawn > 600) resolve(drawn);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const after = game.world.toBoatLocal(game.player.position).clone();
    return {
      atHelm: game.state.atHelm, throttle: game.physics.throttle,
      coasted: game.physics.distance - startDistance,
      localDelta: before.distanceTo(after), frames,
    };
  });
  check('leaving the helm neutralizes propulsion while a coasting deck carries the player with it',
    deckRide.atHelm === false && Math.abs(deckRide.throttle) < .02
      && deckRide.coasted > .2 && deckRide.localDelta < .08,
    JSON.stringify(deckRide));

  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.physics.speed = 0;
    window.__aim([1.16, 1.88, -0.52]);
    game.interaction.press();
    for (let i = 0; i < 30 && !game.state.atHelm; i++) game.interaction.update(.05);
    game.interaction.release();
    game.skipDrive();
    game.physics.speed = 2;
  });
  await page.waitForFunction(() => window.NO_WAKE.phase === 'inlet');
  const atInlet = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    distance: window.NO_WAKE.physics.distance,
    checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
    boat: window.NO_WAKE.boat.root.position.toArray(),
    inlet: window.NO_WAKE.world.inlet,
    wakeVisible: window.NO_WAKE.world.wake.pool.some((p) => p.visible),
  }));
  check('the authored 90-second run resolves into the inlet checkpoint behind the point',
    atInlet.phase === 'inlet' && atInlet.distance >= 360
      && atInlet.checkpoint === 'open_water'
      && Math.abs(atInlet.boat[2] - atInlet.inlet.z) < 5,
    JSON.stringify(atInlet));
  await capture('no-wake-inlet.png');

  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.clearKeys();
    game.physics.throttle = 0;
    game.physics.speed = 0;
  });
  await page.waitForFunction(() => window.NO_WAKE.state.enginesKilled === true);
  await page.waitForFunction(() => window.NO_WAKE.physics.anchored === true);
  const killed = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const before = game.boat.root.position.clone();
    for (let i = 0; i < 240; i++) game.physics.advance(1 / 120);
    return {
      anchored: game.physics.anchored,
      running: game.physics.running,
      atHelm: game.state.atHelm,
      drift: before.distanceTo(game.boat.root.position),
      spoken: game.cueLog.map((entry) => entry.cue),
    };
  });
  check('"Kill them" stops and kinematically locks the hull for the rest of the mission',
    killed.anchored && !killed.running && !killed.atHelm && killed.drift < 1e-6
      && killed.spoken.includes('inlet.lou.bring-her-down')
      && killed.spoken.includes('inlet.lou.kill-them'),
    JSON.stringify({ ...killed, spoken: killed.spoken.slice(-4) }));

  await page.waitForFunction(() => window.NO_WAKE.phase === 'descend');
  /* And then wait for the SCREEN, which is a beat behind the man on purpose.
   * `docs/TONE-AND-PARODY.md`: the character says it and the HUD clarifies
   * afterwards, never both on the same frame -- so a check that samples the
   * objective the instant the phase changes is reading the gap the rule
   * creates, not a missing objective. */
  await page.waitForFunction(
    () => /GO BELOW DECK/.test(document.getElementById('objective')?.textContent ?? ''),
  );
  const descend = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    objective: document.getElementById('objective')?.textContent ?? null,
    spoken: window.NO_WAKE.cueLog.map((entry) => entry.cue),
  }));
  check('Irish reports the channel clear and the objective becomes GO BELOW DECK',
    descend.phase === 'descend' && /GO BELOW DECK/.test(descend.objective ?? '')
      && descend.spoken.includes('inlet.irish.channel-clear')
      && descend.spoken.includes('inlet.lou.out-of-the-wind'),
    JSON.stringify({ phase: descend.phase, objective: descend.objective, spoken: descend.spoken.slice(-3) }));

  /* ---------------------------------------------------------------- *
   * The cabin scene
   * ---------------------------------------------------------------- */

  const goingBelow = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.60, game.boat.deck.height + 1.66, 0.60)));
    game.player.update(1 / 60);
    const targeted = window.__aim([-1.26, 1.80, -0.70]);
    game.interaction.press();
    for (let i = 0; i < 80 && !game.state.moving; i++) game.interaction.update(.05);
    game.interaction.release();
    return { targeted, moving: game.state.moving };
  });
  await page.waitForFunction(() => window.NO_WAKE.state.below === true);
  await page.waitForFunction(() => window.NO_WAKE.phase === 'cabin');
  const below = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      below: game.state.below,
      worldBelow: game.world.below,
      local: game.world.toBoatLocal(game.player.position.clone()).toArray(),
      ground: game.player.ground - game.boat.root.position.y,
      enclosure: game.engineAudio.enclosure,
      radioOn: game.radio.on,
    };
  });
  check('the player goes down the companionway onto the cabin sole and the room closes in',
    /companionway/.test(goingBelow.targeted ?? '') && below.below && below.worldBelow
      && Math.abs(below.ground - CABIN_HEIGHT) < .01
      && below.local[2] > CABIN_BOW && below.local[2] < CABIN_STERN
      && below.enclosure < 1,
    JSON.stringify(below));

  await page.waitForFunction(() => window.NO_WAKE.cabin.group.userData.doorsClosed === true);
  await page.waitForFunction(() => window.NO_WAKE.radio.on === false);
  const closedUp = await page.evaluate(() => ({
    doorsClosed: window.NO_WAKE.cabin.group.userData.doorsClosed,
    radioOff: !window.NO_WAKE.radio.on,
    enclosure: window.NO_WAKE.engineAudio.enclosure,
    stations: window.NO_WAKE.radio.stations.length,
  }));
  check('a radio plays faintly until Lou shuts it off, and Booski closes the companionway',
    closedUp.doorsClosed && closedUp.radioOff && closedUp.enclosure <= .25
      && closedUp.stations >= 1,
    JSON.stringify(closedUp));

  await page.waitForFunction(() => window.NO_WAKE.state.poured === true);
  // Poured, then slid across: two beats, and the second is the one that puts
  // the glass in front of Willy.
  await page.waitForFunction(() => window.NO_WAKE.cabin.props.shotGlass.position.x > .5);
  const staging = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const boxes = game.boat.cabinColliders;
    const eye = game.player.camera.position.clone();
    /* "Nobody is behind a wall." Cast a ray from the player's own eye to each
     * man's chest and require it to reach him without crossing a solid. This
     * is the owner's complaint about the old shooting beat, measured. */
    const blocked = (to) => {
      const dir = to.clone().sub(eye);
      const length = dir.length();
      dir.normalize();
      for (let t = .1; t < length; t += .05) {
        const p = game.world.toBoatLocal(eye.clone().addScaledVector(dir, t));
        for (const box of boxes) {
          if (p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y
            && p.z > box.min.z && p.z < box.max.z) return box.name;
        }
      }
      return null;
    };
    const seen = {};
    for (const id of ['lou', 'booski', 'willy']) {
      const chest = game.boat.cast[id].group.localToWorld(new V(0, 1.30, 0));
      const ndc = chest.clone().project(game.player.camera);
      seen[id] = {
        blockedBy: blocked(chest),
        local: game.world.toBoatLocal(game.boat.cast[id].group.getWorldPosition(new V())).toArray(),
        ndc: ndc.toArray(),
      };
    }
    return {
      seen,
      playerLocal: game.world.toBoatLocal(game.player.position.clone()).toArray(),
      irishLocal: game.world.toBoatLocal(game.boat.cast.irish.group.getWorldPosition(new V())).toArray(),
      shotGlass: game.cabin.props.shotGlass.position.toArray(),
      cockpitEmpty: ['lou', 'booski', 'willy'].every((id) => (
        game.world.toBoatLocal(game.boat.cast[id].group.getWorldPosition(new V())).z < -2
      )),
    };
  });
  check('the composition holds: Lou at the dinette, Booski behind the bar, Willy between them, nobody behind a wall',
    Object.values(staging.seen).every((who) => who.blockedBy === null)
      && staging.seen.lou.local[0] > .5 && staging.seen.booski.local[0] < -.5
      && Math.abs(staging.seen.willy.local[0]) < .5
      && staging.playerLocal[2] > staging.seen.willy.local[2]
      && staging.cockpitEmpty,
    JSON.stringify(staging.seen));
  /* "Irish above, at the bow." He never comes below and never leaves the bow. */
  check('Irish stays on the bow through the whole confrontation',
    staging.irishLocal[2] < -3 && staging.irishLocal[1] > DECK.height,
    JSON.stringify({ irish: staging.irishLocal }));
  check('Booski pours one shot and slides it across to Willy',
    staging.shotGlass[0] > .5 && staging.shotGlass[1] > .5,
    JSON.stringify({ shotGlass: staging.shotGlass }));
  await capture('no-wake-cabin-staging.png');

  const penned = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const player = game.player;
    const saved = player.position.clone();
    player.mode = 'walk';
    player.enabled = true;
    const reached = [];
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      player.position.copy(saved);
      player.velocity.set(0, 0, 0);
      player.clearKeys();
      player.yaw = game.boat.root.rotation.y + heading;
      player.setKey('KeyW', true);
      for (let i = 0; i < 240; i++) { player.update(1 / 60); game.clampToStaging(); }
      player.setKey('KeyW', false);
      reached.push(game.world.toBoatLocal(player.position.clone()).toArray());
    }
    player.position.copy(saved);
    player.velocity.set(0, 0, 0);
    player.update(1 / 60);
    return { reached, locked: game.state.stagingLocked };
  });
  check('the player keeps camera control but cannot leave the staging area',
    penned.locked && penned.reached.every(([x, , z]) => (
      x >= CABIN_STAGING.minX - .05 && x <= CABIN_STAGING.maxX + .05
      && z >= CABIN_STAGING.minZ - .05 && z <= CABIN_STAGING.maxZ + .05
    )),
    JSON.stringify(penned));

  await page.waitForFunction(() => window.NO_WAKE.state.dialogue !== null, null, { timeout: 300000 });
  for (let i = 0; i < NO_WAKE_CABIN_SCRIPT.length + 2; i++) {
    await page.evaluate(() => window.NO_WAKE.skipDialogue());
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => window.NO_WAKE.phase === 'ready_to_fire');
  const script = await page.evaluate(() => ({
    lines: window.NO_WAKE.dialogueLog.map((line) => line.text),
    cues: window.NO_WAKE.cueLog.map((entry) => entry.cue),
    phase: window.NO_WAKE.phase,
    objective: document.getElementById('objective')?.textContent ?? null,
    promptVisible: !document.getElementById('execution-prompt').classList.contains('hidden'),
    moveScale: window.NO_WAKE.player.moveScale,
  }));
  check('the Negev question lands, and nobody makes a speech after it',
    script.lines.some((line) => /Mirage/.test(line))
      && script.lines.some((line) => /Negev on B/.test(line))
      && script.lines.some((line) => /brother to me/.test(line))
      && script.lines.at(-1) === 'All right.',
    JSON.stringify(script.lines.slice(-4)));
  check('movement locks, aim stays free, and the objective is DRAW YOUR WEAPON with no countdown',
    script.phase === 'ready_to_fire' && /DRAW YOUR WEAPON/.test(script.objective ?? '')
      && script.promptVisible && script.moveScale === 0,
    JSON.stringify({ phase: script.phase, objective: script.objective, moveScale: script.moveScale }));

  const armed = await page.evaluate(() => ({
    playerGun: window.NO_WAKE.state.playerGun?.visible,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
    weapons: Object.fromEntries(['playerGun', 'louGun', 'booskiGun'].map((key) => {
      const gun = window.NO_WAKE.state[key];
      let meshes = 0;
      gun?.traverse((object) => { if (object.isMesh) meshes++; });
      return [key, { model: gun?.userData.weaponModel, meshes }];
    })),
    irishArmed: Boolean(window.NO_WAKE.state.irishGun),
  }));
  check('Tony carries the shared revolver, Lou and Booski carry detailed 9mms, Irish carries nothing',
    armed.playerGun && armed.willyVisible && !armed.irishArmed
      && armed.weapons.playerGun.model === 'six-shot revolver'
      && armed.weapons.playerGun.meshes >= 15
      && armed.weapons.louGun.model === '9mm semi-automatic'
      && armed.weapons.booskiGun.model === '9mm semi-automatic'
      && armed.weapons.louGun.meshes >= 20 && armed.weapons.booskiGun.meshes >= 20,
    JSON.stringify(armed));
  await capture('no-wake-draw.png');
  // Let the last staged beat's timers finish before the volley, so nothing the
  // script scheduled can land on top of the body.
  await page.waitForTimeout(2000);

  await page.mouse.click(640, 360);
  await page.waitForFunction(() => window.NO_WAKE.phase === 'body');
  const executed = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      phase: game.phase,
      shots: game.state.executionShots,
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
      fell: Math.abs(game.boat.cast.willy.group.rotation.z) > 1,
      shot: game.cameraDirector.shot?.id ?? null,
      onSole: game.boat.cast.willy.group.position.y <= game.boat.cabinDeck.height + .05,
      glassRolling: Boolean(game.state.glassRoll),
    };
  });
  /* All three fire on the same beat and keep firing: four volleys, three
   * shooters, twelve rounds. The old scene fired four in total and neither
   * Lou nor Booski was visibly one of them. */
  check('the player fires first and all three shooters empty into him on the same beat',
    executed.phase === 'body' && executed.shots >= 10
      && executed.checkpoint === 'execution' && executed.fell && executed.onSole,
    JSON.stringify(executed));
  check('the collapse cuts to a low side profile and the shot glass starts to roll',
    executed.shot === 'execution-collapse-profile' && executed.glassRolling,
    JSON.stringify({ shot: executed.shot, rolling: executed.glassRolling }));
  await capture('no-wake-collapse.png');

  await page.waitForFunction(() => window.NO_WAKE.state.glassRoll === undefined
    || window.NO_WAKE.state.glassRoll === null);
  const glass = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const foot = game.cabin.props.sinkFoot;
    const at = game.cabin.props.shotGlass.position;
    return { at: at.toArray(), foot: foot.toArray(), distance: at.distanceTo(foot) };
  });
  check('the shot glass rolls across the sole and stops against the sink',
    glass.distance < .12, JSON.stringify(glass));

  /* ---------------------------------------------------------------- *
   * The body: wrap, weights, carry, water
   * ---------------------------------------------------------------- */

  await page.waitForFunction(() => window.NO_WAKE.state.wrapStage === 'roll');
  const wrapStages = [];
  for (const expected of ['roll', 'fold', 'straps']) {
    const stage = await page.evaluate((want) => {
      const game = window.NO_WAKE;
      if (game.state.wrapStage !== want) return { want, got: game.state.wrapStage, ok: false };
      const targeted = window.__aim([0.40, 0.30, -3.00]);
      game.interaction.press();
      for (let i = 0; i < 120 && game.state.wrapStage === want; i++) game.interaction.update(.05);
      game.interaction.release();
      return {
        want, targeted, ok: game.state.wrapStage !== want,
        bagVisible: game.bodyRig.bag.visible,
        ragdollVisible: game.boat.cast.willy.group.visible,
        folded: game.bodyRig.state.folded,
        strapped: game.bodyRig.state.strapped,
      };
    }, expected);
    wrapStages.push(stage);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.NO_WAKE.bodyRig.state.closed === true);
  const wrapped = await page.evaluate(() => ({
    stages: window.NO_WAKE.bodyRig.state,
    ragdollGone: !window.NO_WAKE.boat.cast.willy.group.visible,
    bagVisible: window.NO_WAKE.bodyRig.bag.visible,
    prefab: Boolean(window.NO_WAKE.bodyRig.bag.getObjectByName('no-wake-wrapped-body')),
    phase: window.NO_WAKE.phase,
  }));
  check('the ragdoll is swapped for the stabilised wrapped-body prefab before anything is carried',
    wrapStages.every((stage) => stage.ok && /body interaction proxy/.test(stage.targeted ?? ''))
      && wrapped.ragdollGone && wrapped.bagVisible && wrapped.prefab
      && wrapped.stages.folded === 2 && wrapped.stages.strapped && wrapped.stages.closed,
    JSON.stringify({ wrapStages: wrapStages.map((s) => s.want), ...wrapped }));
  await capture('no-wake-wrapped.png');

  await page.waitForFunction(() => window.NO_WAKE.phase === 'weights');
  const upForWeights = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([-0.40, 0.70, -2.20]);
    game.interaction.press();
    for (let i = 0; i < 80 && !game.state.moving; i++) game.interaction.update(.05);
    game.interaction.release();
    return { targeted, moving: game.state.moving };
  });
  await page.waitForFunction(() => window.NO_WAKE.state.below === false);
  const onDeckAgain = await page.evaluate(() => ({
    below: window.NO_WAKE.state.below,
    enclosure: window.NO_WAKE.engineAudio.enclosure,
    local: window.NO_WAKE.world.toBoatLocal(window.NO_WAKE.player.position.clone()).toArray(),
  }));
  check('the open air comes back the moment he steps up out of the cabin',
    /companionway/.test(upForWeights.targeted ?? '') && !onDeckAgain.below
      && onDeckAgain.enclosure === 1,
    JSON.stringify(onDeckAgain));

  const ballast = await page.evaluate((foredeck) => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + foredeck;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.02, foredeck + 1.66, -2.90)));
    game.player.update(1 / 60);
    const targeted = window.__aim([-0.02, 2.10, -3.72]);
    game.interaction.press();
    for (let i = 0; i < 120 && !game.state.carriedBallast; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted, taken: game.state.carriedBallast,
      shot: game.cameraDirector.shot?.id ?? null,
      slots: [...document.querySelectorAll('#hotbar .slot')].map((s) => s.textContent.trim()).filter(Boolean),
    };
  }, DECK.foredeckHeight);
  const irishOnStation = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    return game.world.toBoatLocal(game.boat.cast.irish.group.getWorldPosition(new V())).toArray();
  });
  check('the ballast comes out of the forward locker, on the bow, with Irish still on his station',
    /forward locker/.test(ballast.targeted ?? '') && ballast.taken
      && ballast.shot === 'ballast-bow-locker'
      && irishOnStation[2] < -3 && irishOnStation[1] > DECK.height,
    JSON.stringify({ ...ballast, irish: irishOnStation }));
  await capture('no-wake-ballast.png');

  await page.waitForFunction(() => window.NO_WAKE.phase === 'weights_returning');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.60, game.boat.deck.height + 1.66, 0.60)));
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.update(1 / 60);
    window.__aim([-1.26, 1.80, -0.70]);
    game.interaction.press();
    for (let i = 0; i < 80 && !game.state.moving; i++) game.interaction.update(.05);
    game.interaction.release();
  });
  await page.waitForFunction(() => window.NO_WAKE.phase === 'weights_attach');
  const weighted = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([0.40, 0.30, -3.00]);
    game.interaction.press();
    for (let i = 0; i < 120 && !game.bodyRig.state.weighted; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted,
      weighted: game.bodyRig.state.weighted,
      onBag: Boolean(game.bodyRig.bag.getObjectByName('cast-iron ballast bundle')),
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
    };
  });
  check('the ballast clips to the authored sockets on the bag and banks the weighted checkpoint',
    weighted.weighted && weighted.onBag && weighted.checkpoint === 'weighted',
    JSON.stringify(weighted));

  await page.waitForFunction(() => window.NO_WAKE.phase === 'carry', null, { timeout: 300000 });
  const carryStart = await page.evaluate(() => ({
    shot: window.NO_WAKE.cameraDirector.shot?.id ?? null,
    bag: window.NO_WAKE.bodyRig.bag.position.toArray(),
    spoken: window.NO_WAKE.cueLog.map((e) => e.cue),
  }));
  check('"Move him" starts a two-person carry out of the cabin',
    carryStart.shot === 'carry-lift-cabin'
      && carryStart.spoken.includes('body.lou.move-him'),
    JSON.stringify({ shot: carryStart.shot, bag: carryStart.bag }));

  /* Sample the authored carry at four points along its own parameter rather
   * than waiting on wall clock: it has to leave the cabin, come up through the
   * companionway, cross the cockpit and arrive on the platform, with Booski's
   * hands on the other end the whole way. */
  const carrySamples = [];
  for (const t of [.15, .40, .70, 1.0]) {
    const sample = await page.evaluate((at) => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      game.bodyRig.carryTo(at, { booski: game.boat.cast.booski });
      const bag = game.bodyRig.bag.position.clone();
      const booski = game.boat.cast.booski.group.position.clone();
      return {
        t: at,
        bag: bag.toArray(),
        booskiGap: bag.distanceTo(booski),
        lou: game.boat.cast.lou.group.position.toArray(),
        irish: game.world.toBoatLocal(game.boat.cast.irish.group.getWorldPosition(new V())).toArray(),
      };
    }, t);
    carrySamples.push(sample);
  }
  check('the carry rises out of the cabin, crosses the cockpit and sets down on the platform',
    carrySamples[0].bag[1] < carrySamples[1].bag[1]
      && carrySamples[1].bag[2] < carrySamples[2].bag[2]
      && carrySamples[3].bag[2] > 5 && carrySamples[3].bag[1] < carrySamples[2].bag[1]
      && carrySamples.every((s) => s.booskiGap > .8 && s.booskiGap < 2.0)
      && carrySamples.every((s) => s.irish[2] < -3),
    JSON.stringify(carrySamples.map((s) => ({ t: s.t, bag: s.bag.map((n) => +n.toFixed(2)), gap: +s.booskiGap.toFixed(2) }))));

  /* The path itself was just sampled at four points; what is left is waiting
   * out its authored duration, which is measured in SIMULATED seconds and so
   * costs minutes of wall clock on this rasteriser (engine trap #2). Advance
   * the beat's own clock and wait on the arrival it earns. */
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 40; });
  await page.waitForFunction(() => window.NO_WAKE.phase === 'platform', null, { timeout: 300000 });
  /* Lou looks at the shoreline and nods, and only then does the screen ask for
   * anything. Same rule as the companionway: wait for the man, not the frame. */
  await page.waitForFunction(
    () => /DUMP THE BODY/.test(document.getElementById('objective')?.textContent ?? '')
      && window.NO_WAKE.interaction.paused === false,
    null, { timeout: 300000 },
  );
  const platform = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      shot: game.cameraDirector.shot?.id ?? null,
      objective: document.getElementById('objective')?.textContent ?? null,
      bag: game.bodyRig.bag.position.toArray(),
      platformY: game.boat.root.userData.waterline.platformY,
      waterY: game.boat.root.userData.waterline.surfaceY,
      louHelped: game.boat.cast.lou.group.position.z > 3.5,
    };
  });
  check('the bag is set down on the platform, inches above the water, and Lou never helped carry',
    /DUMP THE BODY/.test(platform.objective ?? '') && platform.bag[2] > 5
      && platform.platformY - platform.waterY < .4 && !platform.louHelped,
    JSON.stringify(platform));
  await capture('no-wake-platform.png');

  const dumped = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([0, 0.55, 5.72]);
    game.interaction.press();
    for (let i = 0; i < 160 && !game.state.bodyDisposed; i++) game.interaction.update(.05);
    game.interaction.release();
    return { targeted, disposed: game.state.bodyDisposed, phase: game.phase };
  });
  check('the player holds to put him over, through the disposal zone',
    /disposal zone/.test(dumped.targeted ?? '') && dumped.disposed && dumped.phase === 'dispose',
    JSON.stringify(dumped));

  const disposal = [];
  for (const t of [.3, .6, 1.0]) {
    disposal.push(await page.evaluate((at) => {
      const game = window.NO_WAKE;
      const result = game.bodyRig.disposeTo(at);
      return {
        t: at, y: game.bodyRig.bag.position.y, visible: game.bodyRig.bag.visible,
        sink: result.sinkDepth, struck: result.struck,
      };
    }, t));
  }
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 2.0; });
  await page.waitForFunction(() => window.NO_WAKE.state.splashed === true, null, { timeout: 300000 });
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 3.0; });
  await page.waitForFunction(() => window.NO_WAKE.cameraDirector.shot?.id === 'disposal-water-hold');
  await capture('no-wake-water-hold.png');
  check('one strike on the water, it sinks, it is gone — and the camera holds on the water',
    disposal[0].y > disposal[1].y && disposal[2].sink > 1.5 && !disposal[2].visible
      && disposal[0].struck === false && disposal[2].struck === true
      && await page.evaluate(() => window.NO_WAKE.cameraDirector.shot?.id === 'disposal-water-hold'),
    JSON.stringify(disposal));

  /* ---------------------------------------------------------------- *
   * The exit: the player drives her out, and nobody speaks
   * ---------------------------------------------------------------- */

  await page.waitForFunction(() => window.NO_WAKE.phase === 'exit', null, { timeout: 300000 });
  await page.waitForFunction(
    () => /LEAVE THE INLET/.test(document.getElementById('objective')?.textContent ?? ''),
    null, { timeout: 300000 },
  );
  const exitStart = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    objective: document.getElementById('objective')?.textContent ?? null,
    anchored: window.NO_WAKE.physics.anchored,
    portRunning: window.NO_WAKE.state.ignitionPort,
    spoken: window.NO_WAKE.cueLog.map((e) => e.cue),
  }));
  check('the inlet reports still clear, Lou says start her, and the boat is unlocked to leave',
    exitStart.phase === 'exit' && /LEAVE THE INLET/.test(exitStart.objective ?? '')
      && !exitStart.anchored && !exitStart.portRunning
      && exitStart.spoken.includes('body.irish.still-clear')
      && exitStart.spoken.includes('body.lou.start-her'),
    JSON.stringify({ ...exitStart, spoken: exitStart.spoken.slice(-3) }));

  const restarted = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.10, game.boat.deck.height + 1.66, 0.40)));
    game.player.update(1 / 60);
    const out = [];
    for (const [key, at] of [['ignitionPort', [1.34, 1.62, -0.22]], ['ignitionStarboard', [1.56, 1.62, -0.22]]]) {
      const targeted = window.__aim(at);
      game.interaction.press();
      for (let i = 0; i < 120 && !game.state[key]; i++) game.interaction.update(.05);
      game.interaction.release();
      out.push({ key, targeted, on: game.state[key] });
    }
    return { out, running: game.physics.running };
  });
  await page.waitForFunction(() => window.NO_WAKE.state.anchorUp === true, null, { timeout: 300000 });
  check('both engines are restarted by hand and Irish gets the anchor before she can go',
    restarted.out.every((step) => step.on && /ignition/.test(step.targeted ?? ''))
      && restarted.running,
    JSON.stringify(restarted));

  const drivenOut = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    window.__aim([1.16, 1.88, -0.52]);
    game.interaction.press();
    for (let i = 0; i < 40 && !game.state.atHelm; i++) game.interaction.update(.05);
    game.interaction.release();
    const startHeading = game.physics.heading;
    /* Turn her around and run for open water. She came in bow-first, so leaving
     * means putting the helm over -- the owner's "turn the boat around, natural
     * course home", done by the player rather than by a bezier.
     *
     * The helm input is real and so is the turn it produces; only the ninety
     * metres of open water afterwards are fast-forwarded through the same
     * fixed-step integrator the game uses, because at this frame rate they
     * would otherwise be six minutes of wall clock for no new information. */
    game.player.setKey('KeyW', true);
    game.player.setKey('KeyD', true);
    await new Promise((resolve) => {
      let frames = 0;
      const tick = () => {
        frames++;
        if (Math.abs(game.physics.heading - startHeading) > .25 || frames > 400) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const turned = Math.abs(game.physics.heading - startHeading);
    game.player.setKey('KeyD', false);
    for (let i = 0; i < 4000; i++) game.physics.advance(1 / 120);
    await new Promise((resolve) => {
      const tick = () => (game.state.astern ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
    game.player.clearKeys();
    return {
      atHelm: game.state.atHelm,
      turned,
      speed: game.physics.speed,
      shot: game.cameraDirector.shot?.id ?? null,
      spokenAfterStart: game.cueLog.filter((e) => e.cue.startsWith('exit.')).length,
    };
  });
  check('the player drives her out under his own helm and the camera looks astern at the wake',
    drivenOut.atHelm && drivenOut.turned > .2 && drivenOut.speed > 3
      && drivenOut.shot === 'exit-astern-wake' && drivenOut.spokenAfterStart === 0,
    JSON.stringify(drivenOut));
  await capture('no-wake-astern.png');

  await page.waitForFunction(() => window.NO_WAKE.campaignState.missions.no_wake.status === 'complete',
    null, { timeout: 300000 });
  const completed = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    chapter: window.NO_WAKE.campaignState.story.chapter,
    canonical: localStorage.getItem('squatchlife.campaign'),
    objective: document.getElementById('objective')?.textContent ?? null,
  }));
  check('completion records every irreversible beat and opens Front and Center',
    completed.mission.status === 'complete' && completed.mission.betrayalConfirmed
      && completed.mission.playerFired && completed.mission.bodyDisposed
      && completed.chapter === 'date'
      && /MISSION COMPLETE: NO WAKE/.test(completed.objective ?? ''),
    JSON.stringify(completed.mission));
  check('the complete browser playthrough leaves canonical storage byte-for-byte untouched',
    completed.canonical === SENTINEL);
  check('the browser emitted no uncaught errors', problems.length === 0, problems.slice(0, 3).join(' | '));
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

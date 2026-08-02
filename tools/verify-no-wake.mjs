#!/usr/bin/env node
/** Browser-level production verification for NO WAKE. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allNoWakeVoiceLines } from '../src/nowake/dialogue.js';

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
check('all 18 NO WAKE lines have stable cue ids, cast voices and exact manifest text',
  authoredVoice.length === 18
    && manifestVoice.length === authoredVoice.length
    && authoredVoice.every((line) => {
      const cue = manifestByName.get(`vo.nowake.${line.cue}.1`);
      return cue?.voice === line.voice && cue?.say === line.text;
    }),
  JSON.stringify({ authored: authoredVoice.length, manifest: manifestVoice.length }));

const recordingSheet = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');
const noWakePickupFiles = authoredVoice
  .map((line) => `vo.nowake.${line.cue}.1.mp3`)
  .filter((file) => recordingSheet.includes(`\`${file}\``));
check('every NO WAKE delivery is indexed and the generated handoff reports no voice pickups',
  authoredVoice.every((line) => indexedFiles.has(`vo.nowake.${line.cue}.1.mp3`))
    && noWakePickupFiles.length === 0,
  JSON.stringify({ noWakePickupFiles }));

const shots = path.join(ROOT, 'docs', 'validation', '2026-07-31');
if (WRITE_SCREENSHOTS) await fsp.mkdir(shots, { recursive: true });
const capture = (name) => (WRITE_SCREENSHOTS
  ? page.screenshot({ path: path.join(shots, name) })
  : Promise.resolve());

try {
  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.NO_WAKE.postfx?.disable?.();
    document.getElementById('start-btn').click();
  });
  await page.waitForFunction(() => !document.getElementById('overlay'), null, { timeout: 30000 });
  await page.waitForTimeout(250);

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
  check('the cruiser sits at a measured displacement waterline instead of riding on its chine',
    boot.waterline.restingY < -.1
      && boot.waterline.draft > .85 && boot.waterline.draft < 1.05
      && boot.waterline.sideFreeboard > .70 && boot.waterline.sideFreeboard < .95
      && boot.waterline.deckFreeboard > .95 && boot.waterline.deckFreeboard < 1.15,
    JSON.stringify(boot.waterline));
  const boatRadio = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    await game.radioReady;
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
      neighbors,
      cruiserExterior: exteriorFaces(cruiserHull),
    };
  });
  check('the compact startup cluster keeps three distinct non-overlapping controls',
    marinaRefinement.controlSpan < 1.05 && marinaRefinement.overlaps.length === 0,
    JSON.stringify({ span: marinaRefinement.controlSpan, overlaps: marinaRefinement.overlaps }));
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
  await capture('no-wake-gate-c.png');
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
    game.boat.targets.board.userData.interact.onUse();
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

  await page.evaluate(() => {
    window.NO_WAKE.startUnderway();
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

  await page.evaluate(() => window.NO_WAKE.startUnderway());

  await page.evaluate(() => window.NO_WAKE.skipDrive());
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

  await page.evaluate(() => window.NO_WAKE.beginConfrontation());
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

  await page.evaluate(() => window.NO_WAKE.fire());
  await page.waitForTimeout(1100);
  const body = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    shots: window.NO_WAKE.state.executionShots,
    fell: Math.abs(window.NO_WAKE.boat.cast.willy.group.rotation.z) > 1,
  }));
  check('Tony fires first, Lou and Booski join, and Willy falls on deck',
    body.phase === 'body' && body.shots >= 4 && body.fell, JSON.stringify(body));

  await page.evaluate(() => window.NO_WAKE.disposeBody());
  await page.waitForTimeout(2600);
  const disposal = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    disposed: window.NO_WAKE.state.bodyDisposed,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
  }));
  check('body disposal enters the silent return with Willy removed from the boat',
    disposal.phase === 'return' && disposal.disposed && !disposal.willyVisible,
    JSON.stringify(disposal));

  await page.evaluate(() => window.NO_WAKE.completeMission());
  await page.waitForTimeout(250);
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

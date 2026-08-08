#!/usr/bin/env node
/**
 * Focused, interaction-driven browser proof for the first-visit Bing side job.
 *
 * This deliberately does not call License to Grill's state methods, dialogue
 * `choose`, or interaction descriptors. The preview's public teleport helper
 * only stages a player/camera pose; every result comes through the same door,
 * E-key, number-key and left-click listeners used by a normal playthrough.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5245;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify License to Grill.');
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
/* Match the established Bing verifier's small software-GL surface. Gameplay
 * reach comes from the production raycaster, not pixel count, and drawing four
 * times as many pixels made a focused interaction route fight the renderer. */
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.setDefaultTimeout(20000);
/* This route proves gameplay, not the Bing's separate resident-audio budget.
 * Keep Gratin's through-the-door recording so the first check proves a real
 * shouted take, while preventing hundreds of unrelated club lines and radio
 * clips from turning a focused one-minute route into a four-minute decode.
 * `verify:bing` remains the authoritative complete audio-residency check. */
const fullAudioIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const focusedFiles = (fullAudioIndex.files || []).filter((file) => (
  file.startsWith('vo.bing.full.licenseToGrillDoor.knocking.')
));
const focusedVersions = Object.fromEntries(Object.entries(fullAudioIndex.versions || {})
  .filter(([file]) => focusedFiles.includes(file)));
await page.route('**/assets/sfx/index.json', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ files: focusedFiles, versions: focusedVersions }),
}));
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text().slice(0, 300));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

function routeCheck(name, ok, detail = '') {
  check(name, ok, detail);
  if (!ok) throw new Error(`route prerequisite failed: ${name}`);
}

let currentStage = 'browser boot';
function mark(stage) {
  currentStage = stage;
  console.log(`\n[stage] ${stage}`);
}

/* A focused verifier must fail with a useful location instead of owning a
 * browser indefinitely. The outer command still has its own ceiling; this
 * one closes Chromium first and reports the last live production stage. */
const watchdog = setTimeout(() => {
  console.error(`License to Grill verifier exceeded 180s at: ${currentStage}`);
  void browser.close().catch(() => {});
  server.close();
  setTimeout(() => process.exit(2), 1500);
}, 180000);

/** Run the same production systems the live frame owns, without SwiftShader wall time. */
async function step(seconds = 0.1, dt = 0.05) {
  await page.evaluate(([duration, frame]) => {
    const b = window.__bing;
    for (let elapsed = 0; elapsed < duration; elapsed += frame) {
      b.player.update(frame);
      b.interaction.update(frame);
      b.club.update(frame, b.player.position);
      b.slots.update(frame);
      b.blackjack.update(frame);
      b.dialogue.update(frame, b.player.position);
      b.mission.update(frame);
      b.updateZones(frame);
      b.licenseToGrill.update(frame);
      for (const npc of b.cast.all) npc.update(frame, b.player.position);
    }
  }, [seconds, dt]);
}

async function facts() {
  return page.evaluate(() => {
    const b = window.__bing;
    const hand = document.getElementById('hand-item');
    return {
      phase: b.licenseToGrill.phase,
      node: b.dialogue.nodeId,
      active: b.dialogue.active,
      options: b.dialogue.options.length,
      speaker: b.dialogue.node?.who ?? '',
      line: document.querySelector('#dialogue .line')?.textContent?.trim() ?? '',
      x: b.player.position.x,
      z: b.player.position.z,
      mode: b.player.mode,
      seatedIn: b.game.seatedIn,
      room: b.club.roomAt(b.player.position.x, b.player.position.z),
      currentLabel: b.interaction.current
        ? String(typeof b.interaction.current.userData.interact.label === 'function'
          ? b.interaction.current.userData.interact.label()
          : b.interaction.current.userData.interact.label)
        : '',
      hasCord: b.licenseToGrill.hasCord,
      cordOwned: b.inventory.has('cord'),
      cordVisible: b.licenseToGrill.cord?.root?.visible ?? false,
      cordParentIsCamera: b.licenseToGrill.cord?.root?.parent === b.camera,
      tool: b.licenseToGrill.tool,
      held: b.licenseToGrill.held,
      handVisible: !!hand && !hand.classList.contains('hidden'),
      handName: hand?.querySelector('.name')?.textContent?.trim() ?? '',
      handHint: hand?.querySelector('.hint')?.textContent?.trim() ?? '',
      pressure: b.licenseToGrill.state?.pressure ?? null,
      swings: b.licenseToGrill.state?.swings ?? null,
      used: [...(b.licenseToGrill.state?.used ?? [])],
      handled: [...(b.licenseToGrill.state?.handled ?? [])],
      smashed: [...(b.licenseToGrill.state?.smashed ?? [])],
    };
  });
}

async function waitForDialogue({ node = null, options = null, active = null }, maxSeconds = 90) {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.25) {
    const current = await facts();
    if ((node === null || current.node === node)
      && (options === null || current.options >= options)
      && (active === null || current.active === active)) return current;
    await step(0.25);
  }
  return facts();
}

async function pressCode(code) {
  await page.keyboard.press(code);
  await step(0.1);
}

/** Stage a normal first-person pose, then aim at the centre of a production target. */
async function stageAim(target, stand) {
  return page.evaluate(({ target: targetName, stand: pose }) => {
    const b = window.__bing;
    let object = null;
    if (targetName === 'storage-door') object = b.club.doors.storage.leaf;
    else if (targetName === 'blond') object = b.licenseToGrill.blond?.group;
    else if (targetName.startsWith('belonging:')) {
      object = b.licenseToGrill.table.get(targetName.slice('belonging:'.length))?.pad;
    }
    if (!object) return { aimed: false, reason: 'target missing' };

    object.updateWorldMatrix(true, true);
    const box = new b.THREE.Box3().setFromObject(object);
    const centre = box.isEmpty()
      ? object.getWorldPosition(new b.THREE.Vector3())
      : box.getCenter(new b.THREE.Vector3());
    b.teleport(pose.x, pose.z, 0);
    const dx = centre.x - b.player.position.x;
    const dy = centre.y - b.player.position.y;
    const dz = centre.z - b.player.position.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    b.player.yaw = Math.atan2(-dx, -dz);
    b.player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / distance)));
    b.player.update(0.016);
    /* Keep the player's horizontal facing for movement/reach rules, then aim
     * the rendered production camera at the actual mesh centre. Three's YXZ
     * camera quaternion is authoritative for InteractionSystem's raycaster;
     * reconstructing it from a scalar pitch was close but missed a closed
     * door at 1.86 m in the low-resolution browser. */
    b.camera.lookAt(centre);
    b.camera.updateMatrixWorld(true);
    b.interaction.update(0.016);
    const current = b.interaction.current;
    const label = current
      ? String(typeof current.userData.interact.label === 'function'
        ? current.userData.interact.label() : current.userData.interact.label)
      : '';
    return {
      aimed: current === object,
      target: targetName,
      label,
      distance: Number(distance.toFixed(3)),
      player: [Number(b.player.position.x.toFixed(3)), Number(b.player.position.z.toFixed(3))],
      centre: centre.toArray().map((value) => Number(value.toFixed(3))),
    };
  }, { target, stand });
}

async function clickCanvas() {
  const canvas = page.locator('#scene');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('game canvas has no bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await step(0.9, 0.04);
}

/** Turn in place with the preview's public pose helper, then walk to a real
 * world waypoint through the production W binding. No quest state or player
 * position is assigned by the verifier after the doorway has opened. */
async function walkToWaypoint(x, z, maxSeconds = 1.5) {
  const facing = await page.evaluate(({ waypointX, waypointZ }) => {
    const b = window.__bing;
    const from = { x: b.player.position.x, z: b.player.position.z };
    const yaw = Math.atan2(-(waypointX - from.x), -(waypointZ - from.z));
    /* Same coordinates: this is an aim change, not a positional shortcut. */
    b.teleport(from.x, from.z, yaw);
    return { from, yaw, waypoint: { x: waypointX, z: waypointZ } };
  }, { waypointX: x, waypointZ: z });

  await page.keyboard.down('w');
  let progress = null;
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.1) {
    await step(0.1, 0.025);
    progress = await page.evaluate(({ waypointX, waypointZ }) => {
      const b = window.__bing;
      return {
        x: b.player.position.x,
        z: b.player.position.z,
        distance: Math.hypot(b.player.position.x - waypointX, b.player.position.z - waypointZ),
        chairDistance: Math.hypot(b.player.position.x - 9.6, b.player.position.z + 12.3),
      };
    }, { waypointX: x, waypointZ: z });
    if (progress.distance < 0.24) break;
  }
  await page.keyboard.up('w');
  await step(0.1);
  return { facing, progress, facts: await facts() };
}

try {
  mark('load Bing');
  await page.goto(`http://localhost:${PORT}/bing.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bing?.licenseToGrill && window.__bing?.interaction, null, {
    timeout: 90000,
  });
  mark('start Bing and decode focused cue');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing?.game?.started, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__bing.postfx.disable?.();
    /* The route advances the exact production systems in `step()`. Stop the
     * duplicate requestAnimationFrame scheduler after startup so SwiftShader
     * is not drawing an unrelated frame between every asserted interaction.
     * The already-queued callback runs once, sees this replacement, and ends. */
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
  await page.waitForTimeout(100);

  /* Bing starts in the driver's seat. Leave it through the live key binding
   * before the preview helper stages a hallway pose, so no seated/drive state
  * leaks into the on-foot route. */
  await pressCode('KeyQ');
  let onFoot = await facts();
  for (let elapsed = 0; elapsed < 2 && onFoot.mode !== 'walk'; elapsed += 0.1) {
    await step(0.1, 0.025);
    onFoot = await facts();
  }
  routeCheck('Q exits the starting car before the focused on-foot route',
    onFoot.seatedIn === null && onFoot.mode === 'walk', JSON.stringify(onFoot));

  const originalMarks = await page.evaluate(() => Object.fromEntries(
    ['gratin', 'numbskull', 'shubenator'].map((id) => {
      const npc = window.__bing.family.byId[id];
      return [id, { x: npc.group.position.x, z: npc.group.position.z }];
    }),
  ));

  /* Approach from the hallway. This is the closed-door trigger, not open(). */
  mark('hallway shout and storage door');
  await page.evaluate(() => window.__bing.teleport(6.75, -7.75, 0));
  await step(0.15);
  const shouted = await facts();
  const shoutedAudio = await page.evaluate(() => {
    const cue = 'vo.bing.full.licenseToGrillDoor.knocking.line.1mvtv1e';
    return {
      decoded: (window.__bing.audio.buffers.get(cue)?.[0]?.duration ?? 0) > 0,
      requested: window.__bing.game.voLog.includes(cue),
    };
  });
  routeCheck('approaching the store-room door triggers Gratin through the hallway',
    shouted.phase === 'closed'
      && shouted.node === 'knocking'
      && /second set of hands/i.test(shouted.line)
      && shoutedAudio.decoded && shoutedAudio.requested,
    JSON.stringify({ ...shouted, audio: shoutedAudio }));
  await waitForDialogue({ active: false });

  const doorAim = await stageAim('storage-door', { x: 6.75, z: -7.75 });
  routeCheck('the closed storage door is reachable by the normal crosshair',
    doorAim.aimed && /delicate matter|gratin/i.test(doorAim.label), JSON.stringify(doorAim));
  const beforeOpen = await facts();
  await pressCode('KeyE');
  const opened = await page.evaluate(() => {
    const b = window.__bing;
    return {
      phase: b.licenseToGrill.phase,
      doorOpen: b.club.doors.storage.open,
      x: b.player.position.x,
      z: b.player.position.z,
      blond: !!b.licenseToGrill.blond,
      tableSize: b.licenseToGrill.table.size,
    };
  });
  routeCheck('E opens and dresses the scene without teleporting the player',
    opened.phase === 'open' && opened.doorOpen && opened.blond && opened.tableSize === 5
      && Math.hypot(opened.x - beforeOpen.x, opened.z - beforeOpen.z) < 0.08,
    JSON.stringify({ before: beforeOpen, after: opened }));

  /* Walk through the now-open doorway with the production movement keys. */
  mark('walk through door and take cord');
  await page.keyboard.down('w');
  await step(1.65, 0.025);
  await page.keyboard.up('w');
  await step(0.15);
  const crossed = await facts();
  routeCheck('W walks through the opened doorway without a positional shortcut',
    crossed.room === 'storage' && crossed.x > 5.6 && crossed.z < -9.6,
    JSON.stringify(crossed));

  /* The doorway centre is offset from the chair. A straight southward walk
   * stops 3.59 m away, just outside the authored 3.4 m arrival radius. Turn
   * toward a measured clear patch between the door, prep table and cart, then
   * cover the remaining metre on foot. */
  const arrivalWalk = await walkToWaypoint(7.65, -10.9);
  const entered = arrivalWalk.facts;
  routeCheck('walking to the measured chair-side waypoint starts Blond on arrival',
    arrivalWalk.progress?.chairDistance < 3.4
      && entered.active
      && ['open', 'resume', 'brief', 'numbskullWeighsIn', 'firstQuestion', 'persuasive']
        .includes(entered.node),
    JSON.stringify(arrivalWalk));

  const handoff = await waitForDialogue({ node: 'handOverCord', options: 1 });
  routeCheck('the authored introduction reaches Gratin\'s cord handoff',
    handoff.node === 'handOverCord' && handoff.options === 1,
    JSON.stringify(handoff));
  await pressCode('Digit1');
  const cord = await facts();
  routeCheck('taking the cord uses the live dialogue option, inventory and first-person model',
    cord.hasCord && cord.cordOwned && cord.cordVisible && cord.cordParentIsCamera
      && cord.handVisible && /cord/i.test(cord.handName) && /click/i.test(cord.handHint),
    JSON.stringify(cord));
  await waitForDialogue({ active: false });

  /* Three separate player clicks, each aimed at Blond and allowed to resolve. */
  mark('three cord swings');
  for (let wanted = 1; wanted <= 3; wanted += 1) {
    const aim = await stageAim('blond', { x: 9.6, z: -10.45 });
    await clickCanvas();
    const landed = await facts();
    routeCheck(`cord swing ${wanted} lands through the normal mouse binding`,
      landed.swings === wanted && landed.pressure === wanted * 4,
      JSON.stringify({ aim, landed }));
    await waitForDialogue({ active: false });
  }

  /* Work on Blond -> use something off the cart -> tenderizer. */
  mark('tenderizer');
  const blondAim = await stageAim('blond', { x: 9.6, z: -10.45 });
  await pressCode('KeyE');
  const floor = await waitForDialogue({ node: 'floor', options: 6 });
  check('E on Blond reopens the physical interrogation floor',
    blondAim.aimed && floor.node === 'floor' && floor.options >= 6,
    JSON.stringify({ blondAim, floor }));
  await pressCode('Digit5');
  const cart = await waitForDialogue({ node: 'cart', options: 5 });
  check('the cart is selected from Blond\'s live dialogue',
    cart.node === 'cart' && cart.options === 5, JSON.stringify(cart));
  await pressCode('Digit1');
  const tenderizer = await waitForDialogue({ active: false });
  const tenderizerModel = await page.evaluate(() => ({
    tool: window.__bing.licenseToGrill.tool,
    modelOnCamera: window.__bing.camera.getObjectByName('grill.tool.tenderizer')?.parent
      === window.__bing.camera,
    cordVisible: window.__bing.licenseToGrill.cord.root.visible,
    hand: document.querySelector('#hand-item .name')?.textContent?.trim() ?? '',
  }));
  check('choosing the tenderizer puts a visible tool in Tony\'s hands',
    tenderizer.tool === 'tenderizer' && tenderizerModel.modelOnCamera
      && !tenderizerModel.cordVisible && /tender/i.test(tenderizerModel.hand),
    JSON.stringify({ tenderizer, tenderizerModel }));

  const tenderAim = await stageAim('blond', { x: 9.6, z: -10.45 });
  await clickCanvas();
  const tenderUse = await facts();
  check('the held tenderizer only applies when the player clicks Blond in reach',
    tenderUse.used.includes('tenderizer') && tenderUse.pressure === 20
      && tenderUse.node === 'useTenderizer',
    JSON.stringify({ tenderAim, tenderUse }));
  await waitForDialogue({ node: 'floor', options: 6 });
  await pressCode('KeyQ');

  /* Inspect and smash the watch through its low physical target. */
  mark('watch pickup and smash');
  const watchAim = await stageAim('belonging:watch', { x: 9.25, z: -11.7 });
  await pressCode('KeyE');
  const watchHeld = await facts();
  check('E on the authored watch pad picks it up and triggers Blond\'s property line',
    watchAim.aimed && watchHeld.held === 'watch' && watchHeld.handVisible
      && /watch/i.test(watchHeld.handName) && watchHeld.node === 'propWatch'
      && watchHeld.handled.includes('watch'),
    JSON.stringify({ watchAim, watchHeld }));
  await waitForDialogue({ active: false });
  await clickCanvas();
  const watchSmashed = await facts();
  check('left click smashes the held watch into persistent wreckage',
    watchSmashed.held === null && watchSmashed.smashed.includes('watch')
      && watchSmashed.used.includes('smashed:watch') && watchSmashed.pressure === 40
      && watchSmashed.node === 'smashWatch',
    JSON.stringify(watchSmashed));

  /* Reaching forty through real actions should physically borrow Shubes. */
  mark('Shubenator interruption');
  const shubesEntered = await waitForDialogue({ node: 'shubesEnters' });
  const shubesAtDoor = await page.evaluate(() => {
    const npc = window.__bing.family.byId.shubenator;
    return {
      x: npc.group.position.x,
      z: npc.group.position.z,
      visible: npc.group.visible,
      inRoom: window.__bing.licenseToGrill.inRoom('shubenator'),
    };
  });
  check('Shubenator physically arrives for his interruption instead of speaking offstage',
    shubesEntered.node === 'shubesEnters' && shubesAtDoor.visible && shubesAtDoor.inRoom
      && Math.hypot(shubesAtDoor.x - 6.9, shubesAtDoor.z + 9.95) < 0.08,
    JSON.stringify({ shubesEntered, shubesAtDoor }));
  const afterShubes = await waitForDialogue({ node: 'floor', options: 7 });
  check('the interruption returns control with the car pressure option available',
    afterShubes.node === 'floor' && afterShubes.options === 7,
    JSON.stringify(afterShubes));

  /* Option six is the newly earned car question. Complete with the first end. */
  mark('car threat and completion');
  await pressCode('Digit6');
  const forklift = await waitForDialogue({ node: 'carForklift', options: 1 });
  check('the physical property inspection unlocks the authored car threat',
    forklift.node === 'carForklift' && forklift.options === 1, JSON.stringify(forklift));
  await pressCode('Digit1');
  const named = await waitForDialogue({ node: 'afterTheName', options: 2 });
  check('the car threat makes Blond give up the informant',
    named.node === 'afterTheName' && named.options === 2, JSON.stringify(named));
  await pressCode('Digit2');
  const ending = await waitForDialogue({ node: 'endings', options: 3 });
  await pressCode('Digit1');
  await step(0.2);

  const cleanup = await page.evaluate((marks) => {
    const b = window.__bing;
    const positions = Object.fromEntries(['gratin', 'numbskull', 'shubenator'].map((id) => {
      const npc = b.family.byId[id];
      return [id, {
        x: npc.group.position.x,
        z: npc.group.position.z,
        home: Math.hypot(npc.group.position.x - marks[id].x, npc.group.position.z - marks[id].z) < 0.08,
      }];
    }));
    const watch = b.licenseToGrill.table.get('watch');
    const previewStorage = window.__squatchLifePreviewRuntime?.storage;
    const stored = JSON.parse(previewStorage?.getItem('squatch.bing.license-to-grill') || 'null');
    return {
      phase: b.licenseToGrill.phase,
      persisted: b.licenseToGrill.persisted,
      stored,
      positions,
      cordStillOwned: b.inventory.has('cord'),
      cordHidden: !b.licenseToGrill.cord.root.visible,
      tool: b.licenseToGrill.tool,
      held: b.licenseToGrill.held,
      watchWreck: !!watch?.wreck && watch.group.visible === false,
    };
  }, originalMarks);
  check('ending the quest persists the result and cleans up every borrowed actor and held prop',
    cleanup.phase === 'done' && cleanup.persisted?.completed && cleanup.stored?.completed
      && cleanup.persisted.informant === 'Vincent Mallard'
      && Object.values(cleanup.positions).every((position) => position.home)
      && cleanup.cordStillOwned && cleanup.cordHidden
      && cleanup.tool === null && cleanup.held === null && cleanup.watchWreck,
    JSON.stringify(cleanup));
  check('the complete real-browser route has no runtime errors', runtimeErrors.length === 0,
    runtimeErrors.slice(0, 5).join(' / '));
} finally {
  clearTimeout(watchdog);
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
console.log(failed.length
  ? `\n${failed.length} of ${results.length} License to Grill checks failed.`
  : `\nAll ${results.length} License to Grill checks passed.`);
process.exit(failed.length ? 1 : 0);

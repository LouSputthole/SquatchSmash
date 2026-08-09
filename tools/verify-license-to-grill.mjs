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
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5245;
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'validation', '2026-08-09', 'license-to-grill');
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
    /* Current Chromium's direct SwiftShader GL backend can lose the context
     * once the focused route stops rAF. ANGLE keeps the same software renderer
     * alive long enough for explicit evidence frames. */
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
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
const missingResponses = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text().slice(0, 300));
});
page.on('response', (response) => {
  if (response.status() === 404) missingResponses.push(response.url());
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
      hits: b.licenseToGrill.state?.hits ?? null,
      dead: b.licenseToGrill.state?.dead ?? false,
      broken: b.licenseToGrill.state?.broken ?? false,
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
    } else if (targetName.startsWith('cart:')) {
      object = b.licenseToGrill.cart.get(targetName.slice('cart:'.length))?.pad;
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

async function clickCanvas(seconds = 0.9) {
  const canvas = page.locator('#scene');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('game canvas has no bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await step(seconds, 0.04);
}

/** Capture the actual scene at review resolution without the preview/HUD card
 * covering the tiny focused viewport. Gameplay assertions always run with the
 * production HUD intact; this helper changes only presentation for one frame. */
async function captureScene(name, framing = null) {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.evaluate(() => {
    const overlays = [
      ...document.querySelectorAll('#hud > *'),
      document.querySelector('#squatch-preview-notice'),
    ].filter(Boolean);
    for (const node of overlays) {
      node.dataset.evidenceVisibility = node.style.visibility;
      node.style.visibility = 'hidden';
    }
  });
  const dataUrl = await page.evaluate((evidenceFraming) => new Promise((resolve) => {
    const b = window.__bing;
    const originalPosition = b.camera.position.clone();
    const originalQuaternion = b.camera.quaternion.clone();
    if (evidenceFraming === 'fatal-pool') {
      const pool = b.licenseToGrill.blood.pools.meshes.find((mesh) => mesh.visible);
      if (!pool) throw new Error('fatal-pool evidence requested without a visible death pool');
      const centre = pool.getWorldPosition(new b.THREE.Vector3());
      /* A high side angle keeps Blond's final slump in frame while exposing
       * the grown floor plane beyond the chair instead of looking through it. */
      b.camera.position.set(centre.x + 1.35, centre.y + 3.5, centre.z + 1.45);
      b.camera.lookAt(centre.x - 0.08, centre.y + 0.06, centre.z - 0.08);
      b.camera.updateMatrixWorld(true);
    }
    window.__bingEvidenceRaf(() => {
      b.postfx.render(0.016);
      b.renderer.getContext().finish();
      const image = b.renderer.domElement.toDataURL('image/png');
      b.camera.position.copy(originalPosition);
      b.camera.quaternion.copy(originalQuaternion);
      b.camera.updateMatrixWorld(true);
      resolve(image);
    });
  }), framing);
  const evidencePath = path.join(EVIDENCE_DIR, name);
  await fsp.writeFile(evidencePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const { data, info } = await sharp(evidencePath).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  let low = 255;
  let high = 0;
  let nonBlack = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const light = Math.max(data[i], data[i + 1], data[i + 2]);
    low = Math.min(low, light);
    high = Math.max(high, light);
    if (light > 8) nonBlack += 1;
  }
  const pixels = info.width * info.height;
  routeCheck(`visual evidence ${name} contains a readable rendered scene`,
    info.width === 960 && info.height === 540 && high - low > 24 && nonBlack / pixels > 0.05,
    JSON.stringify({ width: info.width, height: info.height, range: high - low,
      nonBlackRatio: Number((nonBlack / pixels).toFixed(4)) }));
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-evidence-visibility]')) {
      node.style.visibility = node.dataset.evidenceVisibility ?? '';
      delete node.dataset.evidenceVisibility;
    }
  });
  await page.setViewportSize({ width: 320, height: 200 });
  await step(0.08, 0.04);
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

/**
 * Load a clean preview, leave the starting car, open the real storage door,
 * walk through it, and let Gratin's authored automatic handoff finish.
 * Reloading creates a new PreviewMemoryStorage, which keeps the three outcome
 * routes isolated without mutating quest state from the verifier.
 */
async function enterFreshRoom(route, { proveShout = false } = {}) {
  mark(`${route}: load fresh Bing preview`);
  await page.goto(`http://localhost:${PORT}/bing.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bing?.licenseToGrill && window.__bing?.interaction, null, {
    timeout: 90000,
  });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing?.game?.started, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__bing.postfx.disable?.();
    window.__bingEvidenceRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
  await page.waitForTimeout(100);

  await pressCode('KeyQ');
  let onFoot = await facts();
  for (let elapsed = 0; elapsed < 2 && onFoot.mode !== 'walk'; elapsed += 0.1) {
    await step(0.1, 0.025);
    onFoot = await facts();
  }
  routeCheck(`${route}: Q exits the starting car`,
    onFoot.seatedIn === null && onFoot.mode === 'walk', JSON.stringify(onFoot));

  if (proveShout) {
    const webgl = await page.evaluate(() => {
      const gl = window.__bing.renderer.getContext();
      return {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(gl.RENDERER),
        webgl2: window.__bing.renderer.capabilities.isWebGL2,
        context: gl.constructor?.name ?? '',
        contextLost: gl.isContextLost(),
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      };
    });
    routeCheck(`${route}: production renderer owns a live WebGL context`,
      webgl.webgl2 && /WebGL/i.test(webgl.context) && !webgl.contextLost
        && webgl.drawingBuffer.every((value) => value > 0),
      JSON.stringify(webgl));

    const objective = await page.evaluate(() => {
      const expected = 'Help Au Gratin in the back room';
      const entry = window.__bing.optionalObjectives().find((item) => item.text === expected);
      const row = [...document.querySelectorAll('#objectives li')]
        .find((item) => item.textContent.trim() === expected);
      return {
        entry,
        rendered: row?.textContent?.trim() ?? '',
        classes: row ? [...row.classList] : [],
      };
    });
    routeCheck(`${route}: requested back-room objective is required, exact and incomplete`,
      objective.entry?.optional === false && objective.entry?.done === false
        && objective.rendered === 'Help Au Gratin in the back room'
        && !objective.classes.includes('optional') && !objective.classes.includes('done'),
      JSON.stringify(objective));
  }

  const originalMarks = await page.evaluate(() => Object.fromEntries(
    ['gratin', 'numbskull', 'shubenator'].map((id) => {
      const npc = window.__bing.family.byId[id];
      return [id, { x: npc.group.position.x, z: npc.group.position.z }];
    }),
  ));

  await page.evaluate(() => window.__bing.teleport(6.75, -7.75, 0));
  await step(0.15);
  if (proveShout) {
    const shouted = await facts();
    const shoutedAudio = await page.evaluate(() => {
      const cue = 'vo.bing.full.licenseToGrillDoor.knocking.line.1mvtv1e';
      return {
        decoded: (window.__bing.audio.buffers.get(cue)?.[0]?.duration ?? 0) > 0,
        requested: window.__bing.game.voLog.includes(cue),
      };
    });
    routeCheck(`${route}: hallway approach triggers Gratin's recorded shout`,
      shouted.phase === 'closed' && shouted.node === 'knocking'
        && /second set of hands/i.test(shouted.line)
        && shoutedAudio.decoded && shoutedAudio.requested,
      JSON.stringify({ ...shouted, audio: shoutedAudio }));
  }
  await waitForDialogue({ active: false });

  const doorAim = await stageAim('storage-door', { x: 6.75, z: -7.75 });
  routeCheck(`${route}: storage door is reachable by the production ray`,
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
      cartSize: b.licenseToGrill.cart.size,
      restraints: b.licenseToGrill.restraints?.cuffs?.length ?? 0,
    };
  });
  routeCheck(`${route}: E opens and physically dresses the room without teleporting`,
    opened.phase === 'open' && opened.doorOpen && opened.blond
      && opened.tableSize === 5 && opened.cartSize === 4 && opened.restraints === 2
      && Math.hypot(opened.x - beforeOpen.x, opened.z - beforeOpen.z) < 0.08,
    JSON.stringify({ before: beforeOpen, after: opened }));

  await page.keyboard.down('w');
  await step(1.65, 0.025);
  await page.keyboard.up('w');
  await step(0.15);
  const crossed = await facts();
  routeCheck(`${route}: W crosses the opened doorway`,
    crossed.room === 'storage' && crossed.x > 5.6 && crossed.z < -9.6,
    JSON.stringify(crossed));

  const arrivalWalk = await walkToWaypoint(7.65, -10.9);
  routeCheck(`${route}: walking to the chair starts Blond`,
    arrivalWalk.progress?.chairDistance < 3.4 && arrivalWalk.facts.active,
    JSON.stringify(arrivalWalk));

  const handoff = await waitForDialogue({ node: 'handOverCord' });
  routeCheck(`${route}: Gratin hands over the cord automatically with no numbered choice`,
    handoff.node === 'handOverCord' && handoff.options === 0
      && handoff.hasCord && handoff.cordOwned && handoff.cordParentIsCamera,
    JSON.stringify(handoff));
  await waitForDialogue({ active: false });
  const cord = await facts();
  routeCheck(`${route}: automatic handoff leaves the cord equipped and usable`,
    cord.hasCord && cord.cordOwned && cord.cordVisible && cord.handVisible
      && /cord/i.test(cord.handName) && /click/i.test(cord.handHint),
    JSON.stringify(cord));
  return { originalMarks, opened, cord };
}

try {
  await fsp.mkdir(EVIDENCE_DIR, { recursive: true });

  /* Route one: the requested interaction grammar and the property-success
   * outcome. This is deliberately a fresh route: once property breaks, body
   * hits are consumed so the authored information outcome cannot be undercut. */
  const informationRoute = await enterFreshRoom('information route', { proveShout: true });
  mark('information route: seated restraints and physical tenderizer');
  const seatedAim = await stageAim('blond', { x: 9.6, z: -10.45 });
  const seatedRig = await page.evaluate(() => {
    const b = window.__bing;
    const rig = b.licenseToGrill.restraints;
    b.scene.updateMatrixWorld(true);
    const first = rig.links[0].getWorldPosition(new b.THREE.Vector3());
    const last = rig.links.at(-1).getWorldPosition(new b.THREE.Vector3());
    const cuffs = rig.cuffs.map((cuff) => cuff.getWorldPosition(new b.THREE.Vector3()));
    return {
      cuffs: rig.cuffs.map((cuff) => cuff.name),
      links: rig.links.length,
      gap: Math.min(
        first.distanceTo(cuffs[0]) + last.distanceTo(cuffs[1]),
        first.distanceTo(cuffs[1]) + last.distanceTo(cuffs[0]),
      ),
    };
  });
  routeCheck('seated Blond has two named cuffs joined endpoint-to-endpoint',
    seatedAim.aimed && seatedRig.cuffs.length === 2 && seatedRig.links >= 5 && seatedRig.gap < 0.18,
    JSON.stringify(seatedRig));
  await captureScene('blond-restraints-seated.png');

  const tenderizerAim = await stageAim('cart:tenderizer', { x: 7.95, z: -11.25 });
  routeCheck('the real tenderizer target is reached by the production interaction ray',
    tenderizerAim.aimed && /pick up.*tender/i.test(tenderizerAim.label),
    JSON.stringify(tenderizerAim));
  await pressCode('KeyE');
  const tenderizerHeld = await page.evaluate(() => {
    const b = window.__bing;
    const held = b.camera.getObjectByName('grill.tool.tenderizer');
    const world = b.licenseToGrill.cart.get('tenderizer').group;
    const anonymous = [];
    held?.traverse((part) => { if (!part.name) anonymous.push(part.type); });
    return {
      tool: b.licenseToGrill.tool,
      heldOnCamera: held?.parent === b.camera,
      worldVisible: world.visible,
      cordVisible: b.licenseToGrill.cord.root.visible,
      hand: document.querySelector('#hand-item .name')?.textContent?.trim() ?? '',
      rotation: held?.rotation.toArray().slice(0, 3) ?? [],
      anonymous,
    };
  });
  routeCheck('E removes one named tenderizer from the cart and puts it visibly in hand',
    tenderizerHeld.tool === 'tenderizer' && tenderizerHeld.heldOnCamera
      && !tenderizerHeld.worldVisible && !tenderizerHeld.cordVisible
      && /tender/i.test(tenderizerHeld.hand) && tenderizerHeld.anonymous.length === 0,
    JSON.stringify(tenderizerHeld));

  const impactAim = await stageAim('blond', { x: 9.6, z: -10.45 });
  await clickCanvas(0.12);
  const windup = await page.evaluate(() => {
    const b = window.__bing;
    const held = b.camera.getObjectByName('grill.tool.tenderizer');
    return {
      hits: b.licenseToGrill.state.hits,
      progress: b.licenseToGrill.toolSwing,
      rotation: held.rotation.toArray().slice(0, 3),
    };
  });
  routeCheck('actual left mouse visibly winds up the tenderizer before damage',
    impactAim.aimed && windup.hits === 0 && windup.progress > 0
      && windup.rotation.some((value, index) => Math.abs(value - tenderizerHeld.rotation[index]) > 0.08),
    JSON.stringify({ impactAim, windup }));
  await captureScene('tenderizer-windup.png');
  await step(0.65, 0.04);
  const tenderizerImpact = await facts();
  const firstBlood = await page.evaluate(() => {
    const q = window.__bing.licenseToGrill;
    return q.blood.impacts.marksOn(q.blond);
  });
  routeCheck('the tenderizer applies exactly once at its impact frame with shared blood',
    tenderizerImpact.hits === 1 && tenderizerImpact.pressure === 8
      && tenderizerImpact.used.includes('tenderizer')
      && tenderizerImpact.node === 'useTenderizer' && firstBlood >= 2,
    JSON.stringify({ tenderizerImpact, firstBlood }));
  await waitForDialogue({ node: 'floor', options: 6 });
  await pressCode('KeyQ');
  const tenderizerReturned = await page.evaluate(() => ({
    tool: window.__bing.licenseToGrill.tool,
    visible: window.__bing.licenseToGrill.cart.get('tenderizer').group.visible,
  }));
  routeCheck('Q returns that same tenderizer to the physical cart',
    tenderizerReturned.tool === null && tenderizerReturned.visible,
    JSON.stringify(tenderizerReturned));

  mark('information route: physical watch break and spoken information');
  const watchAim = await stageAim('belonging:watch', { x: 9.25, z: -11.7 });
  await pressCode('KeyE');
  const watchHeld = await facts();
  routeCheck('E on the physical watch target picks it up without using left mouse as E',
    watchAim.aimed && watchHeld.held === 'watch' && /watch/i.test(watchHeld.handName)
      && watchHeld.node === 'propWatch' && watchHeld.handled.includes('watch'),
    JSON.stringify({ watchAim, watchHeld }));
  await waitForDialogue({ active: false });
  await clickCanvas(0.12);
  const watchSmashed = await facts();
  routeCheck('left mouse breaks the held watch and commits the information route',
    watchSmashed.held === null && watchSmashed.broken && watchSmashed.pressure === 100
      && watchSmashed.hits === 1 && watchSmashed.smashed.includes('watch')
      && watchSmashed.node === 'smashWatch', JSON.stringify(watchSmashed));
  const disclosed = await waitForDialogue({ node: 'breaks' });
  routeCheck('a broken possession speaks the handler meeting instead of killing Blond',
    /every Thursday behind the laundromat/i.test(disclosed.line) && !disclosed.dead,
    JSON.stringify(disclosed));
  const namedLine = await waitForDialogue({ node: 'theName' });
  routeCheck('the successful route audibly delivers Vincent Mallard',
    /Vincent Mallard/i.test(namedLine.line), JSON.stringify(namedLine));
  const afterName = await waitForDialogue({ node: 'afterTheName', options: 2 });
  await pressCode('Digit2');
  await waitForDialogue({ node: 'endings', options: 3 });
  await pressCode('Digit1');
  await step(0.2);

  const informationCleanup = await page.evaluate((marks) => {
    const b = window.__bing;
    const positions = Object.fromEntries(['gratin', 'numbskull', 'shubenator'].map((id) => {
      const npc = b.family.byId[id];
      return [id, Math.hypot(npc.group.position.x - marks[id].x, npc.group.position.z - marks[id].z) < 0.08];
    }));
    const previewStorage = window.__squatchLifePreviewRuntime?.storage;
    const stored = JSON.parse(previewStorage?.getItem('squatch.bing.license-to-grill') || 'null');
    const watch = b.licenseToGrill.table.get('watch');
    return {
      phase: b.licenseToGrill.phase,
      persisted: b.licenseToGrill.persisted,
      stored,
      positions,
      cordOwned: b.inventory.has('cord'),
      tool: b.licenseToGrill.tool,
      held: b.licenseToGrill.held,
      watchWreck: !!watch?.wreck && !watch.group.visible,
    };
  }, informationRoute.originalMarks);
  routeCheck('property success persists information and cleans every borrowed actor/hand',
    informationCleanup.phase === 'done' && informationCleanup.persisted?.completed
      && informationCleanup.stored?.completed
      && informationCleanup.persisted.informant === 'Vincent Mallard'
      && Object.values(informationCleanup.positions).every(Boolean)
      && informationCleanup.cordOwned && informationCleanup.tool === null
      && informationCleanup.held === null && informationCleanup.watchWreck,
    JSON.stringify(informationCleanup));

  /* Route two: a fresh preview with no property break. Seven actual mouse
   * impacts own the mutually exclusive failure route. */
  await enterFreshRoom('fatal route');
  mark('fatal route: seven real tenderizer impacts');
  const fatalTenderAim = await stageAim('cart:tenderizer', { x: 7.95, z: -11.25 });
  routeCheck('fatal route reaches the physical tenderizer by ray', fatalTenderAim.aimed,
    JSON.stringify(fatalTenderAim));
  await pressCode('KeyE');
  const fatalBlondAim = await stageAim('blond', { x: 9.6, z: -10.45 });
  routeCheck('fatal route aims at Blond in authored reach', fatalBlondAim.aimed,
    JSON.stringify(fatalBlondAim));
  let preGrowth = null;
  for (let wanted = 1; wanted <= 7; wanted += 1) {
    await clickCanvas(wanted === 7 ? 0.38 : 0.7);
    const hit = await facts();
    routeCheck(`fatal route left-click impact ${wanted} is counted once`,
      hit.hits === wanted && (wanted < 7 ? hit.phase === 'open' : hit.phase === 'done'),
      JSON.stringify(hit));
    if (wanted === 7) {
      preGrowth = await page.evaluate(() => {
        const q = window.__bing.licenseToGrill;
        const pool = q.blood.pools.meshes.find((mesh) => mesh.visible);
        return { opacity: pool?.material.opacity ?? -1, scale: pool?.scale.x ?? -1 };
      });
    }
  }
  await step(0.8, 0.04);
  const fatal = await page.evaluate(() => {
    const b = window.__bing;
    const q = b.licenseToGrill;
    const rig = q.restraints;
    const pool = q.blood.pools.meshes.find((mesh) => mesh.visible);
    b.scene.updateMatrixWorld(true);
    const first = rig.links[0].getWorldPosition(new b.THREE.Vector3());
    const last = rig.links.at(-1).getWorldPosition(new b.THREE.Vector3());
    const cuffs = rig.cuffs.map((cuff) => cuff.getWorldPosition(new b.THREE.Vector3()));
    const previewStorage = window.__squatchLifePreviewRuntime?.storage;
    return {
      phase: q.phase,
      state: { hits: q.state.hits, dead: q.state.dead, broken: q.state.broken },
      persisted: q.persisted,
      stored: JSON.parse(previewStorage?.getItem('squatch.bing.license-to-grill') || 'null'),
      impactMarks: q.blood.impacts.marksOn(q.blond),
      poolCount: q.blood.pools.visibleCount,
      pool: { opacity: pool?.material.opacity ?? -1, scale: pool?.scale.x ?? -1 },
      bodyRotation: q.blond.parts.body.rotation.z,
      deadPose: q.blond.group.userData.dead === true,
      chainGap: Math.min(
        first.distanceTo(cuffs[0]) + last.distanceTo(cuffs[1]),
        first.distanceTo(cuffs[1]) + last.distanceTo(cuffs[0]),
      ),
      toast: document.getElementById('toast-stack')?.textContent ?? '',
    };
  });
  routeCheck('seventh hit produces no-info death, readable slump, growing pool and attached chain',
    fatal.phase === 'done' && fatal.state.hits === 7 && fatal.state.dead && !fatal.state.broken
      && fatal.persisted?.ending === 'beaten_to_death'
      && fatal.persisted?.informant === null && fatal.persisted?.meet === null
      && fatal.stored?.informant === null && fatal.impactMarks >= 14 && fatal.poolCount === 1
      && fatal.pool.opacity > preGrowth.opacity && fatal.pool.scale > preGrowth.scale
      && fatal.deadPose && Math.abs(fatal.bodyRotation) > 0.2 && fatal.chainGap < 0.18
      && /information dies with him/i.test(fatal.toast),
    JSON.stringify({ preGrowth, fatal }));
  await stageAim('blond', { x: 9.6, z: -10.45 });
  await captureScene('fatal-blood-pool.png', 'fatal-pool');
  await clickCanvas(0.2);
  const afterDeadClick = await facts();
  routeCheck('left mouse remains consumed on the corpse and cannot create an eighth hit',
    afterDeadClick.hits === 7 && afterDeadClick.dead && afterDeadClick.phase === 'done',
    JSON.stringify(afterDeadClick));

  /* Route three preserves the pre-existing Shubenator/car path without
   * smashing property or accumulating seven body hits. */
  const carRoute = await enterFreshRoom('car route');
  mark('car route: non-breaking pressure and Shubenator interruption');
  const carWatchAim = await stageAim('belonging:watch', { x: 9.25, z: -11.7 });
  await pressCode('KeyE');
  const carWatch = await facts();
  routeCheck('car route physically handles a possession without breaking it',
    carWatchAim.aimed && carWatch.held === 'watch' && carWatch.pressure === 14
      && !carWatch.broken, JSON.stringify(carWatch));
  await waitForDialogue({ active: false });
  await pressCode('KeyQ');

  const sauceAim = await stageAim('cart:sauce', { x: 8.5, z: -11.15 });
  routeCheck('car route reaches the unlabelled bottle directly by ray', sauceAim.aimed,
    JSON.stringify(sauceAim));
  await pressCode('KeyE');
  await stageAim('blond', { x: 9.6, z: -10.45 });
  await clickCanvas(0.7);
  const sauceImpact = await facts();
  routeCheck('the direct sauce LMB impact adds pressure without breaking property',
    sauceImpact.hits === 1 && sauceImpact.pressure === 32 && !sauceImpact.broken,
    JSON.stringify(sauceImpact));
  await waitForDialogue({ node: 'floor', options: 7 });
  await pressCode('KeyQ');

  /* Let the open floor conversation lapse naturally by distance before the
   * next physical pickup, so its landed reaction can own the Shubes handoff. */
  await page.evaluate(() => window.__bing.teleport(0, 0, 0));
  await step(0.2);
  routeCheck('walking out of earshot closes the floor conversation',
    (await facts()).active === false, JSON.stringify(await facts()));
  const tongsAim = await stageAim('cart:tongs', { x: 8.35, z: -11.15 });
  routeCheck('car route reaches the tongs directly by ray', tongsAim.aimed,
    JSON.stringify(tongsAim));
  await pressCode('KeyE');
  await stageAim('blond', { x: 9.6, z: -10.45 });
  await clickCanvas(0.7);
  const tongsImpact = await facts();
  routeCheck('second non-breaking tool hit crosses Shubes pressure below the fatal line',
    tongsImpact.hits === 2 && tongsImpact.pressure === 42 && !tongsImpact.broken,
    JSON.stringify(tongsImpact));
  const shubesEntered = await waitForDialogue({ node: 'shubesEnters' });
  const shubesAtDoor = await page.evaluate(() => {
    const b = window.__bing;
    const npc = b.family.byId.shubenator;
    return {
      x: npc.group.position.x,
      z: npc.group.position.z,
      visible: npc.group.visible,
      inRoom: b.licenseToGrill.inRoom('shubenator'),
    };
  });
  routeCheck('Shubenator still physically arrives on the non-breaking route',
    shubesEntered.node === 'shubesEnters' && shubesAtDoor.visible && shubesAtDoor.inRoom
      && Math.hypot(shubesAtDoor.x - 6.9, shubesAtDoor.z + 9.95) < 0.08,
    JSON.stringify({ shubesEntered, shubesAtDoor }));
  const afterShubes = await waitForDialogue({ node: 'floor', options: 7 });
  routeCheck('Shubes returns control with the authored car option available',
    afterShubes.options === 7, JSON.stringify(afterShubes));
  await pressCode('KeyQ');
  await pressCode('Digit6');
  const forklift = await waitForDialogue({ node: 'carForklift', options: 1 });
  routeCheck('handled property still unlocks the car threat',
    forklift.node === 'carForklift' && forklift.options === 1, JSON.stringify(forklift));
  await pressCode('Digit1');
  const carNamed = await waitForDialogue({ node: 'afterTheName', options: 2 });
  routeCheck('car threat still delivers the informant without killing Blond',
    carNamed.node === 'afterTheName' && !carNamed.dead, JSON.stringify(carNamed));
  await pressCode('Digit2');
  await waitForDialogue({ node: 'endings', options: 3 });
  await pressCode('Digit1');
  await step(0.2);
  const carCleanup = await page.evaluate((marks) => {
    const b = window.__bing;
    return {
      persisted: b.licenseToGrill.persisted,
      actorsHome: ['gratin', 'numbskull', 'shubenator'].every((id) => {
        const npc = b.family.byId[id];
        return Math.hypot(npc.group.position.x - marks[id].x, npc.group.position.z - marks[id].z) < 0.08;
      }),
    };
  }, carRoute.originalMarks);
  routeCheck('car route completes with information and restores the floor cast',
    carCleanup.persisted?.informant === 'Vincent Mallard' && carCleanup.actorsHome,
    JSON.stringify(carCleanup));

  check('the complete real-browser route has no runtime errors', runtimeErrors.length === 0,
    runtimeErrors.slice(0, 5).join(' / '));
  check('the complete real-browser route requests no 404 resources', missingResponses.length === 0,
    missingResponses.slice(0, 5).join(' / '));
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

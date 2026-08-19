#!/usr/bin/env node
/**
 * Focused browser proof for CARTEL PALACE.
 *
 * Every authored preview checkpoint boots in a fresh document, starts through
 * the real scene button, and is inspected through the runtime's public debug
 * surface. The canonical campaign namespace is seeded with a sentinel first:
 * Cartel Palace must use PreviewMemoryStorage and leave that byte untouched.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5244;
const SENTINEL = '{"canonical":"cartel palace preview must not touch this"}';
const CHECKPOINTS = Object.freeze([
  'approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear',
]);
const NEW_GROUND_COMBAT_CUES = Object.freeze([
  'combat.bullet.impact.flesh',
  'combat.bullet.impact.flesh.heavy',
  'combat.bullet.impact.head',
  'combat.bullet.impact.armor',
  'combat.bullet.impact.armor.heavy',
  'combat.armor.break',
  'combat.armor.plate.drop',
  'combat.player.hit.flesh',
  'combat.takedown.quiet',
  'combat.triage.bandage',
  'combat.bullet.impact.wood',
  'combat.bullet.impact.metal',
  'combat.bullet.impact.glass',
  'combat.bullet.impact.dirt',
  'combat.bullet.whiz.pistol',
  'combat.bullet.whiz.heavy',
  'combat.body.fall.gravel',
  'combat.body.fall.grass',
  'combat.shell.floor.wood',
  'weapon.shotgun.fire',
  'weapon.shotgun.reload.out',
  'weapon.shotgun.reload.in',
  'weapon.shotgun.empty',
  'weapon.shotgun.mag.floor',
  'weapon.shotgun.cycle',
]);
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Cartel Palace.');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
  });
  response.end(await fsp.readFile(file));
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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.addInitScript((sentinel) => {
  localStorage.setItem('squatchlife.campaign', sentinel);
}, SENTINEL);

const problems = [];
const notFound = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 260));
});
page.on('response', (response) => {
  if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  for (const checkpoint of CHECKPOINTS) {
    const href = `http://localhost:${PORT}/cartel-palace.html?preview=1&checkpoint=${checkpoint}`;
    await page.goto(href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'menu', null, {
      timeout: 180000,
    });
    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'active', null, {
      timeout: 180000,
    });
    await page.waitForTimeout(180);

    const state = await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      const snapshot = runtime.snapshot();
      const environment = runtime.geometry();
      return {
        checkpoint: runtime.checkpoint,
        snapshot,
        campaignScene: runtime.campaignState.scene.id,
        campaignMission: runtime.campaignState.missions.cartel_palace,
        materialLanguage: runtime.palace.materialLanguage,
        evidence: runtime.evidence(),
        loadout: runtime.loadout.items,
        selected: runtime.loadout.selected,
        guards: runtime.cast.guards.length,
        mark: {
          role: runtime.cast.mark.role,
          maxHealth: runtime.cast.mark.actor.maxHealth,
          armor: runtime.cast.mark.actor.armor,
          down: runtime.cast.mark.actor.incapacitated,
        },
        sauce: {
          role: runtime.cast.sauce.role,
          down: runtime.cast.sauce.actor.incapacitated,
        },
        doors: runtime.palace.state(),
        extractionVisible: runtime.palace.targets.extractionGate.visible,
        geometry: {
          meshes: environment.meshes,
          groups: environment.groups,
          namedMeshes: environment.namedMeshes,
          colliders: environment.colliders,
          solidWaterworks: environment.solidWaterworks,
          zones: Object.fromEntries(Object.entries(environment.zones)
            .map(([name, zone]) => [name, { meshes: zone.meshes, bounds: zone.bounds }])),
        },
        previewNotice: Boolean(document.getElementById('squatch-preview-notice')),
        canonical: localStorage.getItem('squatchlife.campaign'),
        bootFailed: !document.getElementById('bootFailure')?.hidden,
      };
    });

    const evidenceExpected = ['betrayal', 'dining_room', 'clear'].includes(checkpoint) ? 3 : 0;
    check(`${checkpoint}: boots the bounded mission checkpoint`,
      state.checkpoint === checkpoint
        && state.snapshot.beat === checkpoint
        && state.campaignScene === 'cartel_palace'
        && state.campaignMission.status === 'in_progress',
      JSON.stringify({ checkpoint: state.checkpoint, mission: state.campaignMission }));
    check(`${checkpoint}: keeps the evidence trail and world state coherent`,
      state.snapshot.evidenceFound.length === evidenceExpected
        && Object.values(state.evidence).filter(Boolean).length === evidenceExpected
        && state.materialLanguage === 'stucco-stone-clay-tile-courtyard'
        && state.geometry.colliders >= 20,
      JSON.stringify({ evidence: state.snapshot.evidenceFound, geometry: state.geometry }));
    check(`${checkpoint}: exposes the real refined environment inventory`,
      state.geometry.meshes >= 750
        && state.geometry.groups >= 90
        && state.geometry.namedMeshes / state.geometry.meshes >= 0.85
        && Object.keys(state.geometry.zones).sort().join(',')
          === 'ceilings,courtyard,dining,gallery,guestSuite,office,security'
        && Object.values(state.geometry.zones).every((zone) => zone.meshes > 0)
        && state.geometry.solidWaterworks.sort().join(',')
          === 'courtyard-fountain-collider,reflecting-pool-collider',
      JSON.stringify({
        meshes: state.geometry.meshes,
        groups: state.geometry.groups,
        namedMeshes: state.geometry.namedMeshes,
        zones: Object.fromEntries(Object.entries(state.geometry.zones).map(([name, zone]) => [name, zone.meshes])),
        solidWaterworks: state.geometry.solidWaterworks,
      }));
    check(`${checkpoint}: uses the shared final-raid combat contract`,
      state.loadout.length === 5
        && state.loadout.filter(Boolean).length >= 3
        && state.selected >= 0 && state.selected < 5
        && state.guards >= 8
        && state.mark.role === 'boss'
        && state.mark.maxHealth >= 400
        && state.sauce.role === 'traitor',
      JSON.stringify({ loadout: state.loadout, guards: state.guards, mark: state.mark }));
    check(`${checkpoint}: remains an isolated developer preview`,
      state.previewNotice && state.canonical === SENTINEL && !state.bootFailed,
      JSON.stringify({ previewNotice: state.previewNotice, bootFailed: state.bootFailed }));

    if (checkpoint === 'approach') {
      await page.evaluate(() => {
        const runtime = window.CARTEL_PALACE;
        runtime.player.position.set(19.2, 1.66, 63.1);
        runtime.player.yaw = 0;
        runtime.player.pitch = -0.27;
        runtime.player.update(0);
      });
      await page.waitForFunction(() => {
        const runtime = window.CARTEL_PALACE;
        return runtime.interaction.current === runtime.palace.targets.powerBox;
      });
      await page.keyboard.down('e');
      await page.waitForFunction(() => window.CARTEL_PALACE.snapshot().beat === 'perimeter');
      await page.keyboard.up('e');
      const route = await page.evaluate(() => ({
        mission: window.CARTEL_PALACE.snapshot(),
        doors: window.CARTEL_PALACE.palace.state(),
        facadeLightIntensity: window.CARTEL_PALACE.palace.lights
          .filter((light) => light.name === 'courtyard-wall-lantern-light')
          .map((light) => light.intensity),
        facadeBulbColors: (() => {
          const colors = [];
          window.CARTEL_PALACE.palace.root.traverse((object) => {
            if (object.name === 'courtyard-lantern-bulb') colors.push(object.material.color.getHex());
          });
          return colors;
        })(),
      }));
      check('approach: the real E-hold target cuts power and opens the route',
        route.mission.beat === 'perimeter'
          && route.mission.powerCut
          && route.doors.serviceGateOpen
          && route.facadeLightIntensity.length === 4
          && route.facadeLightIntensity.every((intensity) => intensity === 0)
          && route.facadeBulbColors.length === 4
          && route.facadeBulbColors.every((color) => color === 0x080909),
        JSON.stringify(route));
    }

    if (checkpoint === 'clear') {
      check('clear: both targets are down and the player still activates extraction',
        state.mark.down && state.sauce.down
          && state.snapshot.markEliminated && state.snapshot.sauceEliminated
          && state.extractionVisible && !state.doors.extractionOpen,
        JSON.stringify({ mark: state.mark, sauce: state.sauce, doors: state.doors }));
      await page.evaluate(() => {
        const runtime = window.CARTEL_PALACE;
        runtime.player.position.set(0, 1.66, -50.25);
        runtime.player.yaw = 0;
        runtime.player.pitch = 0;
        runtime.player.update(0);
      });
      await page.waitForFunction(() => {
        const runtime = window.CARTEL_PALACE;
        return runtime.interaction.current === runtime.palace.targets.extractionGate;
      });
      await page.keyboard.down('e');
      await page.waitForFunction(() => window.CARTEL_PALACE.phase === 'complete');
      await page.keyboard.up('e');
      const departure = await page.evaluate(() => ({
        palace: window.CARTEL_PALACE.campaignState.missions.cartel_palace.status,
        initiation: window.CARTEL_PALACE.campaignState.missions.initiation.status,
        chapter: window.CARTEL_PALACE.campaignState.story.chapter,
      }));
      check('clear: the real E-hold extraction completes Palace and unlocks Initiation',
        departure.palace === 'complete'
          && departure.initiation === 'available'
          && departure.chapter === 'big_night',
        JSON.stringify(departure));
    }
  }

  /* Combat gets one fresh estate document after the authored checkpoint walk.
   * Each probe takes the public JSON-safe combat checkpoint and clears both
   * blood pools before arranging its deterministic sample. Cleanup restores
   * the checkpoint and presentation transients so one proof cannot make the
   * next one pass (or fail) by accident. */
  const combatHref = `http://localhost:${PORT}/cartel-palace.html?preview=1&checkpoint=estate`;
  await page.goto(combatHref, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'menu', null, {
    timeout: 180000,
  });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'active', null, {
    timeout: 180000,
  });
  await page.waitForTimeout(180);

  const armorHud = await page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    const snapshot = runtime.combatSnapshot();
    runtime.resetCombatBlood();
    try {
      const row = document.getElementById('health');
      const meter = row?.querySelector('.armor-meter');
      const value = document.getElementById('armor-value');
      const visible = (node) => Boolean(node)
        && getComputedStyle(node).display !== 'none'
        && getComputedStyle(node).visibility !== 'hidden'
        && Number(getComputedStyle(node).opacity) > 0;
      return {
        rowVisible: visible(row),
        meterVisible: visible(meter),
        valueVisible: visible(value),
        label: value?.textContent?.trim() ?? null,
        displayed: Number.parseInt(value?.textContent ?? '', 10),
        armor: runtime.playerActor.armor,
      };
    } finally {
      runtime.combatRestore(snapshot);
      runtime.resetCombatBlood();
    }
  });
  check('combat HUD exposes a visible armor row backed by the live player actor',
    armorHud.rowVisible && armorHud.meterVisible && armorHud.valueVisible
      && armorHud.displayed === Math.round(armorHud.armor)
      && armorHud.label === `${Math.round(armorHud.armor)} ARMOR`,
    JSON.stringify(armorHud));

  const combatAudioBank = await page.evaluate((expected) => {
    const audio = window.CARTEL_PALACE.combatAudio.audio;
    const manifest = new Map((audio.manifest?.sfx ?? []).map((cue) => [cue.name, cue]));
    const available = audio._availableFiles instanceof Set ? audio._availableFiles : new Set();
    const cues = expected.map((name) => {
      const record = manifest.get(name) ?? null;
      const file = record?.file || `${name}.mp3`;
      const indexed = available.has(file);
      return {
        name,
        manifest: Boolean(record),
        file,
        indexed,
        resident: audio.hasSample(name),
      };
    });
    return {
      expected: expected.length,
      manifest: cues.filter((cue) => cue.manifest).length,
      indexed: cues.filter((cue) => cue.indexed).length,
      resident: cues.filter((cue) => cue.resident).length,
      pending: cues.filter((cue) => !cue.indexed).map((cue) => cue.name),
      indexedButMissing: cues
        .filter((cue) => cue.indexed && !cue.resident)
        .map((cue) => cue.name),
      cues,
    };
  }, NEW_GROUND_COMBAT_CUES);
  check('the runtime combat bank contains all 25 non-story cues and decodes every delivered file',
    combatAudioBank.expected === 25
      && combatAudioBank.manifest === 25
      && combatAudioBank.indexedButMissing.length === 0,
    JSON.stringify({
      manifest: combatAudioBank.manifest,
      indexed: combatAudioBank.indexed,
      resident: combatAudioBank.resident,
      pending: combatAudioBank.pending,
      indexedButMissing: combatAudioBank.indexedButMissing,
    }));

  /* Drive the literal document mouse bindings. Pointer lock is established by
   * the same canvas click a player uses; right down/up must change the shared
   * WeaponSystem, and the next real left press must produce recoil feedback. */
  const alreadyLocked = await page.evaluate(() => (
    document.pointerLockElement === document.getElementById('scene')
  ));
  if (!alreadyLocked) {
    await page.mouse.click(480, 300);
    await page.waitForFunction(() => (
      document.pointerLockElement === document.getElementById('scene')
    ), null, { timeout: 10000 });
  }
  await page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    const weapon = runtime.weapons;
    const player = runtime.player;
    window.__palaceAdsProof = {
      combat: runtime.combatSnapshot(),
      playerActor: runtime.playerActor.snapshot(),
      loadout: runtime.loadout.checkpoint(),
      weaponStats: { ...weapon.stats },
      weaponState: {
        aimed: weapon.aimed,
        aimBlend: weapon.aimBlend,
        baseFov: weapon._baseFov,
        managingFov: weapon._managingFov,
      },
      player: {
        position: player.position.clone(),
        velocity: player.velocity.clone(),
        yaw: player.yaw,
        pitch: player.pitch,
        enabled: player.enabled,
      },
      fov: weapon.camera.fov,
      roots: runtime.cast.all.map((entry) => ({ entry, visible: entry.root.visible })),
      crosshairTransform: document.getElementById('crosshair').style.transform,
    };
    runtime.resetCombatBlood();
    runtime.security.alarm = true;
    for (const entry of runtime.cast.all) {
      entry.active = false;
      entry.root.visible = false;
    }
    if (!weapon.current) runtime.loadout.apply(weapon);
    const semiSlot = runtime.loadout.items.findIndex((id) => (
      id && weapon.firearm(id).def.auto === false
    ));
    if (semiSlot >= 0) runtime.loadout.select(semiSlot, weapon);
    const firearm = weapon.firearm(weapon.current);
    firearm.restore({ ...firearm.snapshot(), rounds: Math.max(1, firearm.rounds) });
    firearm.cooldown = 0;
    player.clearKeys();
    player.velocity.set(0, 0, 0);
    weapon.setTrigger(false);
    weapon.setAimed(false);
    weapon.aimBlend = 0;
  });

  const readWeaponFeedback = () => page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    const feedback = runtime.weapons.feedback();
    const transform = document.getElementById('crosshair').style.transform;
    return {
      feedback,
      fov: runtime.weapons.camera.fov,
      pitch: runtime.player.pitch,
      shots: runtime.weapons.stats.shots,
      locked: document.pointerLockElement === document.getElementById('scene'),
      crosshairScale: Number(/scale\(([^)]+)\)/.exec(transform)?.[1]),
      transform,
    };
  });

  let adsProof;
  try {
    await page.waitForTimeout(220);
    const hip = await readWeaponFeedback();
    await page.mouse.move(480, 300);
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction(() => window.CARTEL_PALACE.weapons.aimBlend > 0.98,
      null, { timeout: 10000 });
    const aimed = await readWeaponFeedback();
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(() => window.CARTEL_PALACE.weapons.aimBlend < 0.001,
      null, { timeout: 10000 });
    const released = await readWeaponFeedback();
    const beforeShot = await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      const firearm = runtime.weapons.firearm(runtime.weapons.current);
      firearm.cooldown = 0;
      firearm.setTrigger(false);
      return {
        pitch: runtime.player.pitch,
        shots: runtime.weapons.stats.shots,
      };
    });
    await page.mouse.down({ button: 'left' });
    await page.waitForFunction(() => {
      const runtime = window.CARTEL_PALACE;
      const transform = document.getElementById('crosshair').style.transform;
      const scale = Number(/scale\(([^)]+)\)/.exec(transform)?.[1]);
      const feedback = runtime.weapons.feedback();
      if (feedback.bloom <= 0 || scale <= 1) return false;
      window.__palaceShotMoment = {
        feedback: { ...feedback },
        fov: runtime.weapons.camera.fov,
        pitch: runtime.player.pitch,
        shots: runtime.weapons.stats.shots,
        locked: document.pointerLockElement === document.getElementById('scene'),
        crosshairScale: scale,
        transform,
      };
      return true;
    }, null, { timeout: 10000 });
    const shot = await page.evaluate(() => window.__palaceShotMoment);
    await page.mouse.up({ button: 'left' });
    await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      runtime.weapons.firearm(runtime.weapons.current).cooldown = 99;
    });
    await page.keyboard.down('w');
    await page.mouse.down({ button: 'right' });
    await page.mouse.down({ button: 'left' });
    await page.waitForFunction(() => {
      const runtime = window.CARTEL_PALACE;
      return runtime.player.keys.has('KeyW')
        && runtime.weapons.aimed
        && runtime.weapons.firearm(runtime.weapons.current).triggerHeld;
    }, null, { timeout: 10000 });
    const heldBeforeLoss = await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      return {
        keys: [...runtime.player.keys],
        aimed: runtime.weapons.aimed,
        triggerHeld: runtime.weapons.firearm(runtime.weapons.current).triggerHeld,
        interactionHolding: runtime.interaction.holding,
        enabled: runtime.player.enabled,
      };
    });
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => {
      const runtime = window.CARTEL_PALACE;
      return document.pointerLockElement === null
        && runtime.player.keys.size === 0
        && runtime.weapons.aimed === false
        && runtime.weapons.firearm(runtime.weapons.current).triggerHeld === false;
    }, null, { timeout: 10000 });
    const clearedAfterLoss = await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      return {
        pointerLocked: document.pointerLockElement !== null,
        keys: [...runtime.player.keys],
        aimed: runtime.weapons.aimed,
        triggerHeld: runtime.weapons.firearm(runtime.weapons.current).triggerHeld,
        interactionHolding: runtime.interaction.holding,
        enabled: runtime.player.enabled,
      };
    });
    adsProof = {
      hip, aimed, released, beforeShot, shot,
      inputLoss: { heldBeforeLoss, clearedAfterLoss },
    };
  } finally {
    await page.mouse.up({ button: 'left' }).catch(() => {});
    await page.mouse.up({ button: 'right' }).catch(() => {});
    await page.keyboard.up('w').catch(() => {});
    await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      const saved = window.__palaceAdsProof;
      if (!saved) return;
      runtime.weapons.setTrigger(false);
      runtime.weapons.setAimed(false);
      runtime.weapons.cancelPendingImpacts();
      runtime.combatRestore(saved.combat);
      runtime.playerActor.restore(saved.playerActor);
      runtime.loadout.restore(saved.loadout, runtime.weapons);
      Object.assign(runtime.weapons.stats, saved.weaponStats);
      runtime.weapons.aimed = saved.weaponState.aimed;
      runtime.weapons.aimBlend = saved.weaponState.aimBlend;
      runtime.weapons._baseFov = saved.weaponState.baseFov;
      runtime.weapons._managingFov = saved.weaponState.managingFov;
      runtime.player.position.copy(saved.player.position);
      runtime.player.velocity.copy(saved.player.velocity);
      runtime.player.yaw = saved.player.yaw;
      runtime.player.pitch = saved.player.pitch;
      runtime.player.enabled = saved.player.enabled;
      runtime.weapons.camera.fov = saved.fov;
      runtime.weapons.camera.updateProjectionMatrix();
      for (const { entry, visible } of saved.roots) entry.root.visible = visible;
      document.getElementById('crosshair').style.transform = saved.crosshairTransform;
      delete window.__palaceShotMoment;
      runtime.resetCombatBlood();
      delete window.__palaceAdsProof;
    });
  }
  check('literal right-mouse down/up drives ADS blend and field of view',
    adsProof.hip.locked
      && adsProof.hip.feedback.aimed === false
      && adsProof.aimed.feedback.aimed === true
      && adsProof.aimed.feedback.aimBlend > 0.98
      && adsProof.aimed.fov < adsProof.hip.fov
      && adsProof.released.feedback.aimed === false
      && adsProof.released.feedback.aimBlend < 0.001
      && Math.abs(adsProof.released.fov - adsProof.hip.fov) < 0.001,
    JSON.stringify(adsProof));
  check('the next real left press immediately kicks pitch and blooms the visible crosshair',
    adsProof.shot.shots === adsProof.beforeShot.shots + 1
      && adsProof.shot.pitch > adsProof.beforeShot.pitch
      && adsProof.shot.feedback.bloom > 0
      && adsProof.shot.crosshairScale > 1,
    JSON.stringify({ before: adsProof.beforeShot, after: adsProof.shot }));
  check('real pointer-lock loss clears held movement, trigger and ADS state',
    adsProof.inputLoss.heldBeforeLoss.keys.includes('KeyW')
      && adsProof.inputLoss.heldBeforeLoss.aimed
      && adsProof.inputLoss.heldBeforeLoss.triggerHeld
      && adsProof.inputLoss.heldBeforeLoss.enabled
      && adsProof.inputLoss.clearedAfterLoss.pointerLocked === false
      && adsProof.inputLoss.clearedAfterLoss.keys.length === 0
      && adsProof.inputLoss.clearedAfterLoss.aimed === false
      && adsProof.inputLoss.clearedAfterLoss.triggerHeld === false
      && adsProof.inputLoss.clearedAfterLoss.interactionHolding === false
      && adsProof.inputLoss.clearedAfterLoss.enabled === false,
    JSON.stringify(adsProof.inputLoss));

  const restoreProof = await page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    const original = runtime.combatSnapshot();
    runtime.resetCombatBlood();
    try {
      const serialized = JSON.stringify(original);
      const checkpoint = JSON.parse(serialized);
      const securityCheckpoint = checkpoint.security ?? checkpoint;
      const entry = runtime.cast.guards[0];
      const record = securityCheckpoint.entries.find((item) => item.id === entry.id);
      const playerRecord = checkpoint.player?.actor ?? runtime.playerActor.durableSnapshot();
      const suppressionRecord = checkpoint.player?.suppression ?? runtime.suppression.snapshot();
      const playerWeaponId = checkpoint.loadout?.equipped ?? runtime.weapons.current;
      const playerFirearm = runtime.weapons.firearm(playerWeaponId);
      const playerAmmo = checkpoint.loadout?.ammo?.[playerWeaponId] ?? playerFirearm.snapshot();
      runtime.playerActor.health = 1;
      runtime.playerActor.armor = 0;
      runtime.suppression.value = 1;
      playerFirearm.rounds = 0;
      playerFirearm.reserve = 0;
      playerFirearm.triggerHeld = true;
      entry.actor.health = 1;
      entry.actor.armor = 0;
      entry.firearm.rounds = 0;
      entry.firearm.reserve = 0;
      entry.firearm.triggerHeld = true;
      entry.perception.target = { id: 'forbidden-live-target' };
      entry.perception.targetVisible = true;
      entry.perception.sampledPoint = entry.root.position.clone();
      entry.perception.lastSeen = entry.root.position.clone().addScalar(99);
      entry.perception.memory = 99;
      entry.perception.awareness = 1;
      entry.impairments.stagger = 9;
      entry.impairments.armWound = 1;
      entry.impairments.legWound = 1;
      entry.weaponAim.aligned = true;
      entry.weaponAim.aimError = 0;
      entry.weaponAim.boreError = 0;
      entry.aimAligned = true;
      runtime.combatRestore(checkpoint);
      const restored = runtime.combatSnapshot();
      const restoredSerialized = JSON.stringify(restored);
      const firstDifference = (before, after, path = '$') => {
        if (Object.is(before, after)) return null;
        if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
          return { path, before, after };
        }
        const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
        for (const key of keys) {
          const difference = firstDifference(before[key], after[key], `${path}.${key}`);
          if (difference) return difference;
        }
        return null;
      };
      return {
        jsonSafe: Boolean(serialized && checkpoint.version === 1
          && checkpoint.player?.actor && checkpoint.loadout && checkpoint.security),
        exact: restoredSerialized === serialized,
        firstDifference: firstDifference(checkpoint, restored),
        name: checkpoint.name ?? null,
        player: {
          health: runtime.playerActor.health,
          armor: runtime.playerActor.armor,
          expectedHealth: playerRecord.health,
          expectedArmor: playerRecord.armor,
        },
        suppression: runtime.suppression.snapshot(),
        expectedSuppression: suppressionRecord,
        playerWeaponId,
        playerFirearm: playerFirearm.snapshot(),
        playerTriggerHeld: playerFirearm.triggerHeld,
        expectedPlayerAmmo: playerAmmo,
        actor: {
          health: entry.actor.health,
          armor: entry.actor.armor,
          expectedHealth: record.actor.health,
          expectedArmor: record.actor.armor,
        },
        firearm: entry.firearm.snapshot(),
        expectedFirearm: record.firearm,
        perception: entry.perception.snapshot(),
        expectedPerception: record.perception,
        impairments: entry.impairments.snapshot(),
        expectedImpairments: record.impairments,
        target: entry.perception.target?.id ?? null,
        targetVisible: entry.perception.targetVisible,
        aimAligned: entry.aimAligned,
        moduleAligned: entry.weaponAim.aligned,
        triggerHeld: entry.firearm.triggerHeld,
      };
    } finally {
      runtime.combatRestore(original);
      runtime.resetCombatBlood();
    }
  });
  check('the Palace combat checkpoint is JSON-safe and restores durable state exactly',
    restoreProof.jsonSafe && restoreProof.exact
      && restoreProof.actor.health === restoreProof.actor.expectedHealth
      && restoreProof.actor.armor === restoreProof.actor.expectedArmor
      && JSON.stringify(restoreProof.firearm) === JSON.stringify(restoreProof.expectedFirearm)
      && JSON.stringify(restoreProof.perception) === JSON.stringify(restoreProof.expectedPerception)
      && JSON.stringify(restoreProof.impairments) === JSON.stringify(restoreProof.expectedImpairments),
    JSON.stringify(restoreProof));
  check('checkpoint restore preserves player armor, suppression and equipped ammunition',
    restoreProof.name === 'estate'
      && restoreProof.player.health === restoreProof.player.expectedHealth
      && restoreProof.player.armor === restoreProof.player.expectedArmor
      && JSON.stringify(restoreProof.suppression)
        === JSON.stringify(restoreProof.expectedSuppression)
      && restoreProof.playerFirearm.id === restoreProof.playerWeaponId
      && restoreProof.playerFirearm.rounds === restoreProof.expectedPlayerAmmo.rounds
      && restoreProof.playerFirearm.reserve === restoreProof.expectedPlayerAmmo.reserve
      && restoreProof.playerTriggerHeld === false,
    JSON.stringify(restoreProof));
  check('checkpoint restore clears live target, alignment and held-trigger permission',
    restoreProof.target === null
      && restoreProof.targetVisible === false
      && restoreProof.aimAligned === false
      && restoreProof.moduleAligned === false
      && restoreProof.triggerHeld === false,
    JSON.stringify(restoreProof));

  const collisionProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const security = runtime.security;
    const snapshot = runtime.combatSnapshot();
    const playerActor = runtime.playerActor.snapshot();
    const playerPosition = runtime.player.position.clone();
    const originalColliders = security.colliders;
    const originalSpaceBoxes = security.space.boxes;
    const originalFireBoxes = security.fireControl.colliders;
    const entries = runtime.cast.guards.slice(0, 2);
    const transients = entries.map((entry) => ({
      entry,
      patrol: entry.patrol,
      blocked: entry.blocked,
      visible: entry.root.visible,
      pose: entry.figure.pose,
      poseFrom: entry.figure._poseFrom,
      nodes: [entry.figure.tilt, ...Object.values(entry.figure.parts), entry.weaponModel]
        .filter((node) => node?.position?.clone && node?.quaternion?.clone && node?.scale?.clone)
        .map((node) => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() })),
    }));
    const wall = new THREE.Box3(
      new THREE.Vector3(-2, 0, 3),
      new THREE.Vector3(2, 3.2, 3.25),
    );
    wall.combatId = 'verify-palace-movement-wall';
    runtime.resetCombatBlood();
    try {
      security.colliders = [wall];
      security.space.boxes = security.colliders;
      security.fireControl.colliders = security.colliders;
      security.alarm = false;
      for (const entry of runtime.cast.all) entry.active = entries.includes(entry);
      runtime.player.position.set(100, 1.66, 100);
      for (const entry of entries) {
        entry.down = false;
        entry.root.visible = true;
        entry.root.position.set(0, 0, 0);
        entry.root.rotation.y = 0;
        entry.patrol = [new THREE.Vector3(0, 0, 8)];
        entry.patrolIndex = 0;
        entry.blocked = false;
        entry.perception.restore({ awareness: 0, memory: 0, lastSeen: null });
      }
      const expanded = wall.clone().expandByScalar(security.space.radius);
      const strictlyInside = (point) => (
        point.x > expanded.min.x + 1e-6 && point.x < expanded.max.x - 1e-6
          && point.y > expanded.min.y + 1e-6 && point.y < expanded.max.y - 1e-6
          && point.z > expanded.min.z + 1e-6 && point.z < expanded.max.z - 1e-6
      );
      let penetrated = false;
      let everBlocked = false;
      for (let frame = 0; frame < 600; frame++) {
        security.update(1 / 60, { playerPosition: runtime.player.position });
        penetrated ||= entries.some((entry) => strictlyInside(entry.root.position));
        everBlocked ||= entries.some((entry) => entry.blocked);
      }
      return {
        penetrated,
        everBlocked,
        radius: security.space.radius,
        requiredSeparation: security.space.separation,
        separation: entries[0].root.position.distanceTo(entries[1].root.position),
        expanded: { min: expanded.min.toArray(), max: expanded.max.toArray() },
        entries: entries.map((entry) => ({
          id: entry.id,
          position: entry.root.position.toArray(),
          blocked: entry.blocked,
        })),
      };
    } finally {
      security.colliders = originalColliders;
      security.space.boxes = originalSpaceBoxes;
      security.fireControl.colliders = originalFireBoxes;
      runtime.playerActor.restore(playerActor);
      runtime.player.position.copy(playerPosition);
      runtime.combatRestore(snapshot);
      for (const saved of transients) {
        saved.entry.patrol = saved.patrol;
        saved.entry.blocked = saved.blocked;
        saved.entry.root.visible = saved.visible;
        saved.entry.figure.pose = saved.pose;
        saved.entry.figure._poseFrom = saved.poseFrom;
        for (const pose of saved.nodes) {
          pose.node.position.copy(pose.position);
          pose.node.quaternion.copy(pose.quaternion);
          pose.node.scale.copy(pose.scale);
        }
      }
      runtime.resetCombatBlood();
    }
  });
  check('Palace patrol bodies detour without entering an expanded live Box3',
    collisionProof.everBlocked && collisionProof.penetrated === false,
    JSON.stringify(collisionProof));
  check('Palace actor separation resolves a real overlap to the configured body spacing',
    collisionProof.separation >= collisionProof.requiredSeparation - 1e-5,
    JSON.stringify(collisionProof));

  const sightProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const security = runtime.security;
    const snapshot = runtime.combatSnapshot();
    const playerActor = runtime.playerActor.snapshot();
    const playerPose = {
      position: runtime.player.position.clone(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
    };
    const originalColliders = security.colliders;
    const originalSpaceBoxes = security.space.boxes;
    const originalFireBoxes = security.fireControl.colliders;
    const originalRandom = security.random;
    const originalFireRandom = security.fireControl.random;
    const guard = runtime.cast.guards[0];
    const internal = security.runtime.get(guard.id);
    const transient = {
      patrol: guard.patrol,
      visible: guard.root.visible,
      blocked: guard.blocked,
      lastShot: guard.lastShot,
      aimPoint: guard.aimPoint.clone(),
      lastSeen: guard.lastSeen.clone(),
      pose: guard.figure.pose,
      poseFrom: guard.figure._poseFrom,
      nodes: [guard.figure.tilt, ...Object.values(guard.figure.parts), guard.weaponModel]
        .filter((node) => node?.position?.clone && node?.quaternion?.clone && node?.scale?.clone)
        .map((node) => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() })),
    };
    const wall = new THREE.Box3(
      new THREE.Vector3(-2, 0, 3),
      new THREE.Vector3(2, 3.2, 3.2),
    );
    wall.combatId = 'verify-palace-sight-wall';
    const alwaysMiss = () => 1;
    runtime.resetCombatBlood();
    try {
      security.colliders = [wall];
      security.space.boxes = security.colliders;
      security.fireControl.colliders = security.colliders;
      security.random = alwaysMiss;
      security.fireControl.random = alwaysMiss;
      security.alarm = false;
      security.stats.roundsFired = 0;
      runtime.hostileMuzzleFlashes.reset();
      for (const entry of runtime.cast.all) entry.active = entry === guard;
      guard.active = true;
      guard.down = false;
      guard.root.visible = true;
      guard.root.position.set(0, 0, 0);
      guard.root.rotation.y = 0;
      guard.patrol = [];
      guard.blocked = false;
      guard.lastShot = null;
      guard.aimPoint.set(0, 0, 0);
      guard.lastSeen.set(0, 0, 0);
      internal.perception.restore({ awareness: 0, memory: 0, lastSeen: null });
      internal.impairments.reset();
      internal.aim.reset();
      internal.firearm.restore({ ...internal.firearm.snapshot(), rounds: Math.max(1, internal.firearm.rounds) });
      internal.shotClock = 0;
      runtime.playerActor.restore({
        ...playerActor,
        health: runtime.playerActor.maxHealth,
        armor: runtime.playerActor.maxArmor,
        incapacitated: false,
      });
      runtime.player.position.set(0, 1.66, 8);
      const healthBefore = runtime.playerActor.health;
      const armorBefore = runtime.playerActor.armor;
      for (let frame = 0; frame < 180; frame++) {
        security.update(1 / 60, { playerPosition: runtime.player.position });
      }
      const blocked = {
        visible: internal.perception.targetVisible,
        target: internal.perception.target?.id ?? null,
        lastSeen: internal.perception.lastSeen?.toArray() ?? null,
        awareness: internal.perception.awareness,
        publicAwareness: guard.awareness,
        rounds: security.stats.roundsFired,
        health: runtime.playerActor.health,
        armor: runtime.playerActor.armor,
        healthBefore,
        armorBefore,
      };

      security.colliders = [];
      security.space.boxes = security.colliders;
      security.fireControl.colliders = security.colliders;
      security.alarm = true;
      internal.shotClock = 99;
      security.update(1 / 60, { playerPosition: runtime.player.position });
      const acquiredBeforeTurn = internal.perception.targetVisible;
      guard.root.rotation.y = Math.PI;
      internal.aim.reset();
      internal.shotClock = 0;
      guard.lastShot = null;
      security.stats.roundsFired = 0;
      let frames = 0;
      for (; frames < 600 && !guard.lastShot; frames++) {
        security.update(1 / 60, { playerPosition: runtime.player.position });
      }
      guard.root.updateMatrixWorld(true);
      const sampled = internal.perception.sampledPoint?.clone()
        ?? new THREE.Vector3(runtime.player.position.x, 1.5, runtime.player.position.z);
      const toTarget = sampled.clone().sub(guard.root.position);
      const horizontalTarget = toTarget.clone().setY(0).normalize();
      const bodyForward = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(guard.root.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0).normalize();
      const headForward = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(guard.figure.parts.head.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0).normalize();
      const muzzle = guard.weaponModel.localToWorld(guard.weaponModel.userData.muzzle.clone());
      const bore = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(guard.weaponModel.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const towardSample = sampled.clone().sub(muzzle).normalize();
      const shot = guard.lastShot;
      const flash = runtime.hostileMuzzleFlashes.report();
      return {
        blocked,
        clear: {
          acquiredBeforeTurn,
          frames,
          visible: internal.perception.targetVisible,
          target: internal.perception.target?.id ?? null,
          rounds: security.stats.roundsFired,
          bodyError: bodyForward.angleTo(horizontalTarget),
          headError: headForward.angleTo(horizontalTarget),
          boreError: bore.angleTo(towardSample),
          publicBoreError: guard.boreError,
          aimError: guard.aimError,
          originError: shot?.origin?.distanceTo(muzzle) ?? Infinity,
          flash,
          flashOriginError: shot?.origin && flash.lastOrigin
            ? shot.origin.distanceTo(new THREE.Vector3().fromArray(flash.lastOrigin))
            : Infinity,
          blocked: shot?.blocked ?? null,
          missDistance: shot?.end?.distanceTo(sampled) ?? Infinity,
          missMin: security.fireControl.missMin,
          shot: shot ? {
            origin: shot.origin?.toArray() ?? null,
            end: shot.end?.toArray() ?? null,
            hit: shot.hit,
            blocked: shot.blocked,
          } : null,
        },
      };
    } finally {
      security.colliders = originalColliders;
      security.space.boxes = originalSpaceBoxes;
      security.fireControl.colliders = originalFireBoxes;
      security.random = originalRandom;
      security.fireControl.random = originalFireRandom;
      runtime.playerActor.restore(playerActor);
      runtime.player.position.copy(playerPose.position);
      runtime.player.yaw = playerPose.yaw;
      runtime.player.pitch = playerPose.pitch;
      runtime.combatRestore(snapshot);
      guard.patrol = transient.patrol;
      guard.root.visible = transient.visible;
      guard.blocked = transient.blocked;
      guard.lastShot = transient.lastShot;
      guard.aimPoint.copy(transient.aimPoint);
      guard.lastSeen.copy(transient.lastSeen);
      guard.figure.pose = transient.pose;
      guard.figure._poseFrom = transient.poseFrom;
      for (const pose of transient.nodes) {
        pose.node.position.copy(pose.position);
        pose.node.quaternion.copy(pose.quaternion);
        pose.node.scale.copy(pose.scale);
      }
      runtime.resetCombatBlood();
    }
  });
  check('a solid Box3 prevents Palace acquisition, awareness refresh, fire and player damage',
    sightProof.blocked.visible === false
      && sightProof.blocked.target === null
      && sightProof.blocked.lastSeen === null
      && sightProof.blocked.awareness === 0
      && sightProof.blocked.publicAwareness === 0
      && sightProof.blocked.rounds === 0
      && sightProof.blocked.health === sightProof.blocked.healthBefore
      && sightProof.blocked.armor === sightProof.blocked.armorBefore,
    JSON.stringify(sightProof));
  check('once exposed, body, head and rendered gun settle on the player before one truthful miss',
    sightProof.clear.acquiredBeforeTurn
      && sightProof.clear.visible
      && sightProof.clear.target === 'prospect'
      && sightProof.clear.rounds === 1
      && sightProof.clear.bodyError <= 0.14
      && sightProof.clear.headError <= 0.14
      && sightProof.clear.boreError <= 0.14
      && sightProof.clear.publicBoreError <= 0.14
      && sightProof.clear.aimError <= 0.14
      && sightProof.clear.originError <= 1e-6
      && (sightProof.clear.blocked
        || sightProof.clear.missDistance >= sightProof.clear.missMin - 1e-6),
    JSON.stringify(sightProof));
  check('a hostile shot lights one bounded flash at the exact rendered muzzle',
    sightProof.clear.flash.capacity === 12
      && sightProof.clear.flash.active === 1
      && sightProof.clear.flash.active <= sightProof.clear.flash.capacity
      && sightProof.clear.flashOriginError <= 1e-6,
    JSON.stringify({
      flash: sightProof.clear.flash,
      originError: sightProof.clear.flashOriginError,
    }));

  const materialProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const weapons = runtime.weapons;
    const snapshot = runtime.combatSnapshot();
    const playerPose = {
      position: runtime.player.position.clone(),
      velocity: runtime.player.velocity.clone(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
      enabled: runtime.player.enabled,
    };
    const saved = {
      hitTargets: weapons.hitTargets,
      onEvent: weapons.onEvent,
      random: Math.random,
      stats: { ...weapons.stats },
      cueLog: [...weapons.cueLog],
      ejectaDropped: weapons.ejecta.dropped,
      ejectaLanded: weapons.ejecta.landed,
    };
    const slabs = [];
    let fireEvent = null;
    try {
      runtime.resetCombatBlood();
      runtime.ballisticImpacts.reset();
      weapons.cancelPendingImpacts();
      weapons.ejecta.clear();
      for (const entry of runtime.cast.all) entry.active = false;
      runtime.player.position.set(0, 1.66, 92);
      runtime.player.velocity.set(0, 0, 0);
      runtime.player.yaw = 0;
      runtime.player.pitch = 0;
      runtime.player.update(0);
      weapons.equip('carbine');
      weapons.setAimed(true);
      weapons.update(0);
      weapons.camera.updateMatrixWorld(true);
      weapons.model.updateMatrixWorld(true);
      const origin = weapons.model.localToWorld(weapons.model.userData.muzzle.clone());
      const direction = weapons.camera.getWorldDirection(new THREE.Vector3()).normalize();
      const orient = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), direction,
      );
      const makeSlab = (material, distance, thickness) => {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(4, 4, thickness),
          new THREE.MeshBasicMaterial({ color: 0xffffff }),
        );
        slab.name = `verify-${material}-slab`;
        slab.position.copy(origin).addScaledVector(direction, distance);
        slab.quaternion.copy(orient);
        slab.userData.combatMaterial = material;
        slab.userData.combatThickness = thickness;
        weapons.world.add(slab);
        slab.updateMatrixWorld(true);
        slabs.push(slab);
        return slab;
      };
      makeSlab('glass', 4, 0.05);
      makeSlab('wood_thin', 6, 0.05);
      makeSlab('concrete', 8, 0.2);
      weapons.hitTargets = slabs;
      const firearm = weapons.firearm('carbine');
      firearm.restore({ ...firearm.snapshot(), rounds: 2, reserve: 30, shots: 0 });
      firearm.cooldown = 0;
      weapons.onEvent = (event) => {
        if (event?.type === 'fire') fireEvent = event;
        saved.onEvent?.(event);
      };
      Math.random = () => 0;
      weapons.triggerPress();
      for (let frame = 0; frame < 20; frame++) weapons.update(0.1);
      const contacts = (fireEvent?.shot?.contacts ?? []).map((contact) => ({
        material: contact.material,
        penetrated: contact.penetrated,
        stopped: contact.stopped,
        thickness: contact.thickness,
        point: contact.point?.toArray() ?? null,
        normal: contact.normal?.toArray() ?? null,
      }));
      const terminal = fireEvent?.shot?.contacts?.find((contact) => contact.stopped) ?? null;
      const visibleMarks = runtime.ballisticImpacts.pool.filter((mark) => mark.visible);
      const terminalMark = visibleMarks.find((mark) => (
        mark.userData.combatMaterial === 'concrete'
      )) ?? null;
      const expectedMark = terminal?.point?.clone()
        .addScaledVector(terminal.normal, 0.004) ?? null;
      return {
        fired: fireEvent?.shot?.fired === true,
        blocked: fireEvent?.shot?.blocked === true,
        contacts,
        end: fireEvent?.shot?.end?.toArray() ?? null,
        terminalPoint: terminal?.point?.toArray() ?? null,
        endError: terminal?.point && fireEvent?.shot?.end
          ? terminal.point.distanceTo(fireEvent.shot.end) : Infinity,
        marks: runtime.ballisticImpacts.report(),
        markMaterials: visibleMarks.map((mark) => mark.userData.combatMaterial),
        terminalMarkVisible: terminalMark?.visible === true,
        terminalMarkError: terminalMark && expectedMark
          ? terminalMark.position.distanceTo(expectedMark) : Infinity,
      };
    } finally {
      Math.random = saved.random;
      weapons.onEvent = saved.onEvent;
      weapons.hitTargets = saved.hitTargets;
      weapons.cancelPendingImpacts();
      weapons.ejecta.clear();
      weapons.ejecta.dropped = saved.ejectaDropped;
      weapons.ejecta.landed = saved.ejectaLanded;
      for (const slab of slabs) {
        slab.parent?.remove(slab);
        slab.geometry.dispose();
        slab.material.dispose();
      }
      runtime.combatRestore(snapshot);
      Object.assign(weapons.stats, saved.stats);
      weapons.cueLog.splice(0, weapons.cueLog.length, ...saved.cueLog);
      runtime.player.position.copy(playerPose.position);
      runtime.player.velocity.copy(playerPose.velocity);
      runtime.player.yaw = playerPose.yaw;
      runtime.player.pitch = playerPose.pitch;
      runtime.player.enabled = playerPose.enabled;
      runtime.player.update(0);
      runtime.ballisticImpacts.reset();
      runtime.resetCombatBlood();
    }
  });
  check('one real Palace round penetrates explicit glass and thin wood before concrete stops it',
    materialProof.fired
      && materialProof.blocked
      && materialProof.contacts.length === 3
      && materialProof.contacts[0].material === 'glass'
      && materialProof.contacts[0].penetrated
      && !materialProof.contacts[0].stopped
      && materialProof.contacts[1].material === 'wood_thin'
      && materialProof.contacts[1].penetrated
      && !materialProof.contacts[1].stopped
      && materialProof.contacts[2].material === 'concrete'
      && !materialProof.contacts[2].penetrated
      && materialProof.contacts[2].stopped
      && materialProof.endError <= 1e-6,
    JSON.stringify(materialProof));
  check('material impacts leave bounded visible marks at the exact physical endpoints',
    materialProof.marks.capacity === 32
      && materialProof.marks.visibleCount === 3
      && materialProof.marks.visibleCount <= materialProof.marks.capacity
      && materialProof.markMaterials.join(',') === 'glass,wood_thin,concrete'
      && materialProof.terminalMarkVisible
      && materialProof.terminalMarkError <= 1e-6,
    JSON.stringify(materialProof));

  const playerSuppressionProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const weapons = runtime.weapons;
    const field = runtime.suppressionField;
    const snapshot = runtime.combatSnapshot();
    const playerPose = {
      position: runtime.player.position.clone(),
      velocity: runtime.player.velocity.clone(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
      enabled: runtime.player.enabled,
    };
    const saved = {
      hitTargets: weapons.hitTargets,
      random: Math.random,
      fieldColliders: field.colliders,
      fieldBoxes: field.space.boxes,
      stats: { ...weapons.stats },
      cueLog: [...weapons.cueLog],
      ejectaDropped: weapons.ejecta.dropped,
      ejectaLanded: weapons.ejecta.landed,
    };
    const exposed = runtime.cast.guards[0];
    const covered = runtime.cast.guards[1];
    try {
      runtime.resetCombatBlood();
      weapons.cancelPendingImpacts();
      weapons.ejecta.clear();
      for (const entry of runtime.cast.all) entry.active = entry === exposed || entry === covered;
      exposed.down = false;
      covered.down = false;
      exposed.suppression.reset();
      covered.suppression.reset();
      runtime.player.position.set(0, 1.66, 92);
      runtime.player.velocity.set(0, 0, 0);
      runtime.player.yaw = 0;
      runtime.player.pitch = 0;
      runtime.player.update(0);
      weapons.equip('pistol9');
      weapons.setAimed(true);
      weapons.update(0);
      weapons.camera.updateMatrixWorld(true);
      weapons.model.updateMatrixWorld(true);
      const origin = weapons.model.localToWorld(weapons.model.userData.muzzle.clone());
      const direction = weapons.camera.getWorldDirection(new THREE.Vector3()).normalize();
      const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
      const exposedPoint = origin.clone().addScaledVector(direction, 8).addScaledVector(right, 0.55);
      const coveredNearest = origin.clone().addScaledVector(direction, 11);
      const coveredPoint = coveredNearest.clone().addScaledVector(right, 0.55);
      exposed.root.position.copy(exposedPoint).add(new THREE.Vector3(0, -1.35, 0));
      covered.root.position.copy(coveredPoint).add(new THREE.Vector3(0, -1.35, 0));
      exposed.root.updateMatrixWorld(true);
      covered.root.updateMatrixWorld(true);
      const coverCenter = coveredNearest.clone().lerp(coveredPoint, 0.5);
      const cover = new THREE.Box3(
        coverCenter.clone().addScalar(-0.16),
        coverCenter.clone().addScalar(0.16),
      );
      cover.combatId = 'verify-player-suppression-cover';
      field.colliders = [cover];
      field.space.boxes = field.colliders;
      weapons.hitTargets = [];
      const firearm = weapons.firearm('pistol9');
      firearm.restore({ ...firearm.snapshot(), rounds: 2, reserve: 30, shots: 0 });
      firearm.cooldown = 0;
      Math.random = () => 0;
      weapons.triggerPress();
      const feedback = runtime.combatFeedback().playerSuppression;
      return {
        exposed: { id: exposed.id, value: exposed.suppression.value },
        covered: { id: covered.id, value: covered.suppression.value },
        feedback: feedback ? {
          applied: feedback.applied,
          projectiles: feedback.projectiles,
          ids: feedback.suppressed.map((record) => record.id),
          pelletCount: feedback.pellets.length,
        } : null,
        cover: { min: cover.min.toArray(), max: cover.max.toArray() },
      };
    } finally {
      Math.random = saved.random;
      weapons.hitTargets = saved.hitTargets;
      field.colliders = saved.fieldColliders;
      field.space.boxes = saved.fieldBoxes;
      weapons.cancelPendingImpacts();
      weapons.ejecta.clear();
      weapons.ejecta.dropped = saved.ejectaDropped;
      weapons.ejecta.landed = saved.ejectaLanded;
      runtime.combatRestore(snapshot);
      Object.assign(weapons.stats, saved.stats);
      weapons.cueLog.splice(0, weapons.cueLog.length, ...saved.cueLog);
      runtime.player.position.copy(playerPose.position);
      runtime.player.velocity.copy(playerPose.velocity);
      runtime.player.yaw = playerPose.yaw;
      runtime.player.pitch = playerPose.pitch;
      runtime.player.enabled = playerPose.enabled;
      runtime.player.update(0);
      runtime.resetCombatBlood();
    }
  });
  check('a real player near-miss suppresses one exposed guard while side cover protects the other',
    playerSuppressionProof.exposed.value > 0
      && playerSuppressionProof.covered.value === 0
      && playerSuppressionProof.feedback?.applied
      && playerSuppressionProof.feedback.projectiles === 1
      && playerSuppressionProof.feedback.pelletCount === 1
      && playerSuppressionProof.feedback.ids.length === 1
      && playerSuppressionProof.feedback.ids[0] === playerSuppressionProof.exposed.id,
    JSON.stringify(playerSuppressionProof));

  const tacticsProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const security = runtime.security;
    const snapshot = runtime.combatSnapshot();
    const saved = {
      combatPosts: security.combatPosts,
      colliders: security.colliders,
      spaceBoxes: security.space.boxes,
      fireBoxes: security.fireControl.colliders,
    };
    const guards = runtime.cast.guards.slice(0, 2);
    const mark = runtime.cast.mark;
    const sauce = runtime.cast.sauce;
    try {
      security.colliders = [];
      security.space.boxes = security.colliders;
      security.fireControl.colliders = security.colliders;
      security.combatPosts = [
        { id: 'verify-cover', kind: 'cover', position: new THREE.Vector3(-2, 0, 4), score: 2 },
        { id: 'verify-flank', kind: 'flank', position: new THREE.Vector3(2, 0, 4), score: 1 },
      ];
      security.tacticalReservations.clear();
      guards[0].root.position.set(-1, 0, 5);
      guards[1].root.position.set(1, 0, 5);
      const target = new THREE.Vector3(0, 1.5, 10);
      for (const entry of [...guards, mark, sauce]) {
        const internal = security.runtime.get(entry.id);
        internal.tacticTime = 0;
        internal.tacticalPost = null;
      }
      const markBefore = mark.root.position.clone();
      const sauceBefore = sauce.root.position.clone();
      security._combatMove(guards[0], 0, target, 1);
      security._combatMove(guards[1], 0, target, 1);
      security._combatMove(mark, 0, target, 1);
      security._combatMove(sauce, 0, target, 1);
      const selected = guards.map((entry) => {
        const post = security.runtime.get(entry.id).tacticalPost;
        return { id: entry.id, post: post?.id ?? null, kind: post?.kind ?? null };
      });
      return {
        selected,
        reservations: [...security.tacticalReservations.entries()],
        mark: {
          post: security.runtime.get(mark.id).tacticalPost?.id ?? null,
          anchorError: mark.root.position.distanceTo(markBefore),
          authoredError: mark.root.position.distanceTo(security.runtime.get(mark.id).authoredPosition),
        },
        sauce: {
          post: security.runtime.get(sauce.id).tacticalPost?.id ?? null,
          anchorError: sauce.root.position.distanceTo(sauceBefore),
          authoredError: sauce.root.position.distanceTo(security.runtime.get(sauce.id).authoredPosition),
        },
      };
    } finally {
      security.combatPosts = saved.combatPosts;
      security.colliders = saved.colliders;
      security.space.boxes = saved.spaceBoxes;
      security.fireControl.colliders = saved.fireBoxes;
      runtime.combatRestore(snapshot);
      runtime.resetCombatBlood();
    }
  });
  check('two ordinary guards reserve distinct cover and flank posts while Mark and Sauce keep authored anchors',
    tacticsProof.selected.length === 2
      && new Set(tacticsProof.selected.map((entry) => entry.post)).size === 2
      && tacticsProof.selected.map((entry) => entry.kind).sort().join(',') === 'cover,flank'
      && tacticsProof.reservations.length === 2
      && tacticsProof.mark.post === null
      && tacticsProof.mark.anchorError <= 1e-9
      && tacticsProof.mark.authoredError <= 1e-9
      && tacticsProof.sauce.post === null
      && tacticsProof.sauce.anchorError <= 1e-9
      && tacticsProof.sauce.authoredError <= 1e-9,
    JSON.stringify(tacticsProof));

  const reloadProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const security = runtime.security;
    const audio = runtime.combatAudio.audio;
    const snapshot = runtime.combatSnapshot();
    const entry = runtime.cast.guards.find((guard) => guard.id === 'guardhouse');
    const internal = security.runtime.get(entry.id);
    const savedPlay = audio.play;
    const requests = [];
    const nodes = [entry.figure.tilt, ...Object.values(entry.figure.parts), entry.weaponModel]
      .filter((node) => node?.position?.clone && node?.quaternion?.clone && node?.scale?.clone)
      .map((node) => ({
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      }));
    try {
      audio.play = function recordHostileCue(name, options = {}) {
        requests.push({
          name,
          position: options.position?.toArray?.() ?? null,
        });
        return savedPlay.call(this, name, options);
      };
      entry.active = true;
      entry.down = false;
      entry.root.visible = true;
      entry.weaponModel.updateWorldMatrix(true, true);
      const expectedAudioPosition = entry.weaponModel.getWorldPosition(new THREE.Vector3());
      internal.firearm.restore({
        ...internal.firearm.snapshot(),
        rounds: 0,
        reserve: Math.max(1, internal.firearm.capacity),
      });
      const started = internal.firearm.reload();
      security._publishWeaponEvent(entry, internal, { type: 'reload-start' });
      const restGun = internal.restGunQuaternion?.clone() ?? entry.weaponModel.quaternion.clone();
      security._pose(entry, internal, {
        pitch: 0,
        hasTarget: true,
        interrupted: true,
      });
      const posedGun = entry.weaponModel.quaternion.clone();
      const roundsBefore = security.stats.roundsFired;
      internal.perception.targetVisible = true;
      internal.perception.sampledPoint = runtime.player.position.clone();
      internal.shotClock = 0;
      entry.lastShot = null;
      entry.weaponModel.updateWorldMatrix(true, true);
      const origin = entry.weaponModel.localToWorld(entry.weaponModel.userData.muzzle.clone());
      const direction = runtime.player.position.clone().sub(origin).normalize();
      security._fire(entry, internal, {
        aligned: true,
        origin,
        direction,
      }, runtime.player.position.clone());
      return {
        started,
        reloadPose: entry.reloadPose,
        modelReloadPose: entry.weaponModel.userData.reloadPose,
        gunPoseDelta: posedGun.angleTo(restGun),
        rightArm: entry.figure.parts.armR.rotation.x,
        leftArm: entry.figure.parts.armL.rotation.x,
        requests,
        audioPositionError: requests[0]?.position
          ? expectedAudioPosition.distanceTo(new THREE.Vector3().fromArray(requests[0].position))
          : Infinity,
        reloading: internal.firearm.reloading,
        roundsBefore,
        roundsAfter: security.stats.roundsFired,
        lastShot: entry.lastShot,
      };
    } finally {
      audio.play = savedPlay;
      runtime.combatRestore(snapshot);
      for (const pose of nodes) {
        pose.node.position.copy(pose.position);
        pose.node.quaternion.copy(pose.quaternion);
        pose.node.scale.copy(pose.scale);
      }
      runtime.resetCombatBlood();
    }
  });
  check('hostile reload events drive a visible pose and positional weapon audio',
    reloadProof.started
      && reloadProof.reloadPose === 1
      && reloadProof.modelReloadPose === 1
      && reloadProof.gunPoseDelta > 0.2
      && reloadProof.rightArm > -0.65 && reloadProof.rightArm < -0.4
      && reloadProof.leftArm > -0.55 && reloadProof.leftArm < -0.3
      && reloadProof.requests.length >= 1
      && reloadProof.audioPositionError <= 1e-6,
    JSON.stringify(reloadProof));
  check('a hostile firearm cannot produce another shot while its reload is active',
    reloadProof.reloading
      && reloadProof.roundsAfter === reloadProof.roundsBefore
      && reloadProof.lastShot === null,
    JSON.stringify(reloadProof));

  const guardStepProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const security = runtime.security;
    const audio = runtime.combatAudio.audio;
    const snapshot = runtime.combatSnapshot();
    const playerPose = runtime.player.position.clone();
    const saved = {
      play: audio.play,
      colliders: security.colliders,
      spaceBoxes: security.space.boxes,
      fireBoxes: security.fireControl.colliders,
      patrol: runtime.cast.guards[0].patrol,
    };
    const guard = runtime.cast.guards[0];
    const internal = security.runtime.get(guard.id);
    const requests = [];
    try {
      audio.play = function recordStep(name, options = {}) {
        if (String(name).startsWith('footstep.')) {
          requests.push({ name, position: options.position?.toArray?.() ?? null });
        }
        return saved.play.call(this, name, options);
      };
      runtime.combatSteps.reset();
      security.colliders = [];
      security.space.boxes = security.colliders;
      security.fireControl.colliders = security.colliders;
      security.alarm = false;
      for (const entry of runtime.cast.all) entry.active = entry === guard;
      guard.active = true;
      guard.down = false;
      guard.root.visible = true;
      guard.root.position.set(0, 0, 25);
      guard.patrol = [new THREE.Vector3(0, 0, 33)];
      guard.patrolIndex = 0;
      guard.blocked = false;
      internal.perception.restore({ awareness: 0, memory: 0, lastSeen: null });
      runtime.player.position.set(100, 1.66, 100);
      for (let frame = 0; frame < 150; frame++) {
        security.update(0.1, { playerPosition: runtime.player.position });
      }
      return {
        id: guard.id,
        requests,
        finalPosition: guard.root.position.toArray(),
        cadenceActors: runtime.combatSteps._actors.size,
      };
    } finally {
      audio.play = saved.play;
      security.colliders = saved.colliders;
      security.space.boxes = saved.spaceBoxes;
      security.fireControl.colliders = saved.fireBoxes;
      guard.patrol = saved.patrol;
      runtime.combatSteps.reset();
      runtime.player.position.copy(playerPose);
      runtime.combatRestore(snapshot);
      runtime.resetCombatBlood();
    }
  });
  check('real guard travel requests positional enemy footstep cues at independent cadence',
    guardStepProof.requests.length >= 4
      && guardStepProof.requests.every((request) => request.name === 'footstep.concrete')
      && guardStepProof.requests.every((request) => request.position?.length === 3)
      && guardStepProof.requests.every((request) => request.position.every(Number.isFinite))
      && guardStepProof.cadenceActors === 1
      && guardStepProof.finalPosition[2] > 30,
    JSON.stringify(guardStepProof));

  const incomingFeedbackProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const snapshot = runtime.combatSnapshot();
    const playerPose = {
      position: runtime.player.position.clone(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
    };
    const guard = runtime.cast.guards[0];
    const directionNode = document.getElementById('damage-direction');
    const armorNode = document.getElementById('armor-break');
    const suppressionNode = document.getElementById('suppression-pressure');
    const ruleOpacity = (selector) => {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules ?? []) {
          if (rule.selectorText === selector) return Number(rule.style.opacity);
        }
      }
      return NaN;
    };
    try {
      for (const entry of runtime.cast.all) entry.active = false;
      runtime.player.position.set(0, 1.66, 0);
      runtime.player.yaw = 0;
      runtime.player.pitch = 0;
      runtime.player.update(0);
      const listener = runtime.player.position.clone();
      const origins = [
        ['front', listener.clone().add(new THREE.Vector3(0, 0, 4))],
        ['right', listener.clone().add(new THREE.Vector3(4, 0, 0))],
        ['back', listener.clone().add(new THREE.Vector3(0, 0, -4))],
        ['left', listener.clone().add(new THREE.Vector3(-4, 0, 0))],
      ];
      const sectors = [];
      for (const [expected, origin] of origins) {
        runtime.security.onPlayerHit({
          id: guard.id,
          result: {
            applied: true,
            damage: 1,
            absorbed: 0,
            armorBroken: false,
            fatal: false,
          },
          shot: { origin },
        });
        const feedback = runtime.combatFeedback();
        sectors.push({
          expected,
          actual: feedback.incoming?.sector ?? null,
          kind: feedback.incoming?.kind ?? null,
          active: directionNode.classList.contains('active'),
          dataset: directionNode.dataset.sector ?? null,
          bearing: directionNode.style.getPropertyValue('--bearing'),
        });
      }
      runtime.security.onPlayerHit({
        id: guard.id,
        result: {
          applied: true,
          damage: 2,
          absorbed: 12,
          armorBroken: true,
          fatal: false,
        },
        shot: { origin: listener.clone().add(new THREE.Vector3(0, 0, 4)) },
      });
      const armor = {
        feedback: runtime.combatFeedback(),
        active: armorNode.classList.contains('active'),
        targetOpacity: ruleOpacity('#armor-break.active'),
        display: getComputedStyle(armorNode).display,
        visibility: getComputedStyle(armorNode).visibility,
        transitionOpacity: Number(getComputedStyle(armorNode).opacity),
      };
      runtime.suppression.reset();
      const from = listener.clone().add(new THREE.Vector3(3, 0, 4));
      const to = listener.clone().add(new THREE.Vector3(0.4, 0, 0));
      runtime.security.onEnemyFire({
        entry: guard,
        from,
        to,
        hit: false,
        whiz: true,
        blocked: false,
        blocker: null,
        nearMiss: true,
        missDistance: 0.2,
        direction: to.clone().sub(from).normalize(),
      });
      await new Promise((resolve) => setTimeout(resolve, 180));
      const suppression = {
        value: runtime.suppression.value,
        vignette: runtime.combatFeedback().suppression,
        active: suppressionNode.classList.contains('active'),
        pressure: Number(suppressionNode.dataset.pressure),
        inlineOpacity: Number(suppressionNode.style.opacity),
        display: getComputedStyle(suppressionNode).display,
        visibility: getComputedStyle(suppressionNode).visibility,
        transitionOpacity: Number(getComputedStyle(suppressionNode).opacity),
      };
      return { sectors, armor, suppression };
    } finally {
      runtime.player.position.copy(playerPose.position);
      runtime.player.yaw = playerPose.yaw;
      runtime.player.pitch = playerPose.pitch;
      runtime.combatRestore(snapshot);
      runtime.player.update(0);
      runtime.resetCombatBlood();
    }
  });
  check('incoming Palace fire presents deterministic front, right, back and left sectors',
    incomingFeedbackProof.sectors.map((record) => record.actual).join(',')
      === 'front,right,back,left'
      && incomingFeedbackProof.sectors.every((record) => (
        record.actual === record.expected
          && record.dataset === record.expected
          && record.kind === 'health-hit'
          && record.active
          && record.bearing.endsWith('rad')
      )),
    JSON.stringify(incomingFeedbackProof.sectors));
  check('armor-break and near-miss pressure drive visible Palace combat overlays',
    incomingFeedbackProof.armor.feedback.incoming?.kind === 'armor-break'
      && incomingFeedbackProof.armor.feedback.armorBreakVisible
      && incomingFeedbackProof.armor.active
      && incomingFeedbackProof.armor.targetOpacity === 1
      && incomingFeedbackProof.armor.display !== 'none'
      && incomingFeedbackProof.armor.visibility !== 'hidden'
      && incomingFeedbackProof.suppression.value > 0
      && incomingFeedbackProof.suppression.vignette > 0
      && incomingFeedbackProof.suppression.active
      && incomingFeedbackProof.suppression.pressure > 0
      && incomingFeedbackProof.suppression.inlineOpacity > 0
      && incomingFeedbackProof.suppression.display !== 'none'
      && incomingFeedbackProof.suppression.visibility !== 'hidden',
    JSON.stringify({
      armor: incomingFeedbackProof.armor,
      suppression: incomingFeedbackProof.suppression,
    }));

  const armorSilhouetteProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const original = runtime.combatSnapshot();
    const target = runtime.cast.guards.find((entry) => entry.id === 'gate-one');
    const visible = target.root.visible;
    runtime.resetCombatBlood();
    try {
      target.active = true;
      target.down = false;
      target.root.visible = true;
      target.actor.restore({
        ...target.actor.snapshot(),
        health: target.actor.maxHealth,
        armor: target.actor.maxArmor,
        incapacitated: false,
      });
      target.armorPresentation.restore();
      const armorCheckpoint = runtime.combatSnapshot();
      const anchor = target.figure.parts.body;
      let object = null;
      anchor.traverse((node) => { if (!object && node.isMesh) object = node; });
      target.root.updateMatrixWorld(true);
      const point = anchor.localToWorld(new THREE.Vector3(0, 0.7, -0.18));
      const normal = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const origin = point.clone().addScaledVector(normal, 4);
      const direction = point.clone().sub(origin).normalize();
      const impact = (damage) => runtime.combatImpact({
        object,
        weapon: 'pistol9',
        point,
        normal,
        origin,
        direction,
        distance: origin.distanceTo(point),
        damage,
        penetration: 0,
      });
      const before = target.armorPresentation.report();
      const first = impact(target.actor.armor / 0.55 + 1);
      const broken = target.armorPresentation.report();
      const brokenOpacity = target.armorPresentation.parts.map((part) => part.material.opacity);
      const second = impact(1);
      const secondReport = target.armorPresentation.report();
      runtime.combatRestore(armorCheckpoint);
      const restored = target.armorPresentation.report();
      const restoredOpacity = target.armorPresentation.parts.map((part) => part.material.opacity);
      return {
        before,
        first: {
          armorBroken: first.result?.armorBroken === true,
          presented: first.armorBreakPresented === true,
        },
        broken,
        brokenOpacity,
        second: {
          armorBroken: second.result?.armorBroken === true,
          presented: second.armorBreakPresented === true,
        },
        secondReport,
        restored,
        restoredOpacity,
        restoredArmor: target.actor.armor,
        expectedArmor: armorCheckpoint.security.entries
          .find((entry) => entry.id === target.id)?.actor?.armor ?? null,
      };
    } finally {
      runtime.combatRestore(original);
      target.root.visible = visible;
      runtime.resetCombatBlood();
    }
  });
  check('an armored guard silhouette breaks once and checkpoint restore rebuilds every plate',
    armorSilhouetteProof.before.state === 'armored'
      && armorSilhouetteProof.first.armorBroken
      && armorSilhouetteProof.first.presented
      && armorSilhouetteProof.broken.state === 'broken'
      && armorSilhouetteProof.brokenOpacity.every((opacity) => opacity < 1)
      && armorSilhouetteProof.second.armorBroken === false
      && armorSilhouetteProof.second.presented === false
      && armorSilhouetteProof.secondReport.state === 'broken'
      && armorSilhouetteProof.restored.state === 'armored'
      && armorSilhouetteProof.restored.visiblePlates === armorSilhouetteProof.before.visiblePlates
      && armorSilhouetteProof.restoredOpacity.every((opacity) => opacity === 1)
      && armorSilhouetteProof.restoredArmor === armorSilhouetteProof.expectedArmor,
    JSON.stringify(armorSilhouetteProof));

  const shotgunProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const weapons = runtime.weapons;
    const snapshot = runtime.combatSnapshot();
    const target = runtime.cast.guards.find((entry) => entry.id === 'guardhouse');
    const playerPose = {
      position: runtime.player.position.clone(),
      velocity: runtime.player.velocity.clone(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
      enabled: runtime.player.enabled,
    };
    const targetPose = {
      position: target.root.position.clone(),
      quaternion: target.root.quaternion.clone(),
      scale: target.root.scale.clone(),
      visible: target.root.visible,
    };
    const saved = {
      hitTargets: weapons.hitTargets,
      onEvent: weapons.onEvent,
      random: Math.random,
      stats: { ...weapons.stats },
      cueLog: [...weapons.cueLog],
      ejectaDropped: weapons.ejecta.dropped,
      ejectaLanded: weapons.ejecta.landed,
    };
    let plate = null;
    const fireEvents = [];
    try {
      runtime.resetCombatBlood();
      runtime.ballisticImpacts.reset();
      weapons.cancelPendingImpacts();
      weapons.ejecta.clear();
      for (const entry of runtime.cast.all) entry.active = entry === target;
      target.active = true;
      target.down = false;
      target.root.visible = true;
      target.actor.restore({
        ...target.actor.snapshot(),
        health: target.actor.maxHealth,
        armor: 0,
        incapacitated: false,
      });
      target.armorPresentation?.restore();
      runtime.player.position.set(0, 1.66, 92);
      runtime.player.velocity.set(0, 0, 0);
      runtime.player.yaw = 0;
      runtime.player.pitch = 0;
      runtime.player.update(0);
      weapons.equip('shotgun');
      weapons.setAimed(true);
      weapons.update(0);
      weapons.camera.updateMatrixWorld(true);
      weapons.model.updateMatrixWorld(true);
      const origin = weapons.model.localToWorld(weapons.model.userData.muzzle.clone());
      const direction = weapons.camera.getWorldDirection(new THREE.Vector3()).normalize();
      target.root.position.copy(origin).addScaledVector(direction, 6);
      target.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      plate = new THREE.Mesh(
        new THREE.BoxGeometry(5, 5, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      plate.name = 'verify-shotgun-target';
      plate.userData.hitZone = 'chest';
      plate.userData.hitPart = 'chest';
      plate.userData.combatMaterial = 'flesh';
      plate.userData.combatThickness = 0.1;
      target.root.add(plate);
      target.root.updateMatrixWorld(true);
      weapons.hitTargets = [plate];
      const firearm = weapons.firearm('shotgun');
      firearm.restore({ ...firearm.snapshot(), rounds: 2, reserve: 12, shots: 0 });
      firearm.cooldown = 0;
      weapons.cueLog.length = 0;
      const values = [
        0, 0,
        0.08, 0.12,
        0.16, 0.25,
        0.24, 0.38,
        0.32, 0.51,
        0.40, 0.64,
        0.48, 0.78,
      ];
      let randomIndex = 0;
      Math.random = () => values[randomIndex++ % values.length];
      weapons.onEvent = (event) => {
        if (event?.type === 'fire') fireEvents.push(event);
        saved.onEvent?.(event);
      };
      const roundsBefore = firearm.rounds;
      const healthBefore = target.actor.health;
      const impactsBefore = weapons.stats.impacts;
      weapons.triggerPress();
      const roundsAfterFire = firearm.rounds;
      for (let frame = 0; frame < 8; frame++) weapons.update(0.1);
      const event = fireEvents[0] ?? null;
      const pellets = event?.shot?.pellets ?? [];
      const directions = pellets.map((pellet) => pellet.direction.toArray()
        .map((value) => value.toFixed(6)).join(','));
      const fireCues = weapons.cueLog.filter((cue) => cue === 'weapon.shotgun.fire');
      const cycleCues = weapons.cueLog.filter((cue) => cue === 'weapon.shotgun.cycle');
      return {
        fireEvents: fireEvents.length,
        roundsBefore,
        roundsAfterFire,
        roundsAfterCycle: firearm.rounds,
        projectiles: event?.shot?.projectiles ?? null,
        pellets: pellets.length,
        projectileIndexes: pellets.map((pellet) => pellet.projectileIndex),
        uniqueDirections: new Set(directions).size,
        contactCounts: pellets.map((pellet) => pellet.contacts.length),
        allStopped: pellets.every((pellet) => pellet.stopped && pellet.blocked),
        triggerDamageCap: event?.shot?.triggerDamageCap ?? null,
        healthBefore,
        healthAfter: target.actor.health,
        healthDamage: healthBefore - target.actor.health,
        impacts: weapons.stats.impacts - impactsBefore,
        fireCues: fireCues.length,
        cycleCues: cycleCues.length,
        cueLog: [...weapons.cueLog],
      };
    } finally {
      Math.random = saved.random;
      weapons.onEvent = saved.onEvent;
      weapons.hitTargets = saved.hitTargets;
      weapons.cancelPendingImpacts();
      weapons.ejecta.clear();
      weapons.ejecta.dropped = saved.ejectaDropped;
      weapons.ejecta.landed = saved.ejectaLanded;
      if (plate) {
        plate.parent?.remove(plate);
        plate.geometry.dispose();
        plate.material.dispose();
      }
      runtime.combatRestore(snapshot);
      Object.assign(weapons.stats, saved.stats);
      weapons.cueLog.splice(0, weapons.cueLog.length, ...saved.cueLog);
      runtime.player.position.copy(playerPose.position);
      runtime.player.velocity.copy(playerPose.velocity);
      runtime.player.yaw = playerPose.yaw;
      runtime.player.pitch = playerPose.pitch;
      runtime.player.enabled = playerPose.enabled;
      runtime.player.update(0);
      target.root.position.copy(targetPose.position);
      target.root.quaternion.copy(targetPose.quaternion);
      target.root.scale.copy(targetPose.scale);
      target.root.visible = targetPose.visible;
      runtime.ballisticImpacts.reset();
      runtime.resetCombatBlood();
    }
  });
  check('one real shotgun shell creates seven independently resolved paths with capped actor damage',
    shotgunProof.fireEvents === 1
      && shotgunProof.roundsBefore - shotgunProof.roundsAfterFire === 1
      && shotgunProof.roundsAfterCycle === shotgunProof.roundsAfterFire
      && shotgunProof.projectiles === 7
      && shotgunProof.pellets === 7
      && shotgunProof.projectileIndexes.join(',') === '0,1,2,3,4,5,6'
      && shotgunProof.uniqueDirections === 7
      && shotgunProof.contactCounts.every((count) => count === 1)
      && shotgunProof.allStopped
      && shotgunProof.impacts === 7
      && shotgunProof.healthDamage > 0
      && shotgunProof.healthDamage <= shotgunProof.triggerDamageCap + 1e-6
      && shotgunProof.triggerDamageCap === 72,
    JSON.stringify(shotgunProof));
  check('one shotgun trigger requests exactly one blast and one completed pump-cycle cue',
    shotgunProof.fireCues === 1 && shotgunProof.cycleCues === 1,
    JSON.stringify({
      fireCues: shotgunProof.fireCues,
      cycleCues: shotgunProof.cycleCues,
      cueLog: shotgunProof.cueLog,
    }));

  const chestProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const snapshot = runtime.combatSnapshot();
    const target = runtime.cast.guards.find((entry) => entry.id === 'guardhouse');
    const crosshair = document.getElementById('crosshair');
    const confirmed = crosshair.dataset.confirmed;
    const visible = target.root.visible;
    runtime.resetCombatBlood();
    try {
      runtime.security.alarm = true;
      target.active = true;
      target.down = false;
      target.root.visible = true;
      target.actor.restore({
        ...target.actor.snapshot(),
        health: target.actor.maxHealth,
        armor: target.actor.maxArmor,
        incapacitated: false,
      });
      const anchor = target.figure.parts.body;
      let object = null;
      anchor.traverse((node) => { if (!object && node.isMesh) object = node; });
      target.root.updateMatrixWorld(true);
      const localPoint = new THREE.Vector3(0.013, 0.021, 0.017);
      const point = anchor.localToWorld(localPoint.clone());
      const normal = new THREE.Vector3(0.17, 0.08, 1).normalize()
        .applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const origin = point.clone().addScaledVector(normal, 4);
      const direction = point.clone().sub(origin).normalize();
      const armorBefore = target.actor.armor;
      const healthBefore = target.actor.health;
      const result = runtime.combatImpact({
        object,
        weapon: runtime.weapons.current,
        point,
        normal,
        origin,
        direction,
        distance: origin.distanceTo(point),
        damage: 12,
        penetration: 0,
      });
      return {
        entry: result.entry?.id ?? null,
        zone: result.zone,
        part: result.part,
        applied: result.applied,
        fatal: result.fatal,
        absorbed: result.result?.absorbed ?? 0,
        armorBefore,
        armorAfter: target.actor.armor,
        healthBefore,
        healthAfter: target.actor.health,
        confirmed: crosshair.dataset.confirmed ?? null,
      };
    } finally {
      runtime.combatRestore(snapshot);
      target.root.visible = visible;
      if (confirmed == null) delete crosshair.dataset.confirmed;
      else crosshair.dataset.confirmed = confirmed;
      runtime.resetCombatBlood();
    }
  });
  check('a full chest impact spends armor, stays nonfatal and gives armor confirmation',
    chestProof.entry === 'guardhouse'
      && chestProof.zone === 'chest'
      && chestProof.part === 'chest'
      && chestProof.applied
      && chestProof.fatal === false
      && chestProof.absorbed > 0
      && chestProof.armorAfter < chestProof.armorBefore
      && chestProof.healthAfter > 0
      && chestProof.healthAfter < chestProof.healthBefore
      && chestProof.confirmed === 'armor',
    JSON.stringify(chestProof));

  /* Leave the fatal visual proof last. A Palace down pose is deliberately
   * sampled before cleanup, including moving the already-fallen root; the
   * attached wound must follow the captured anchor-local point and a visible
   * floor pool must exist at the same time. */
  const headProof = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const runtime = window.CARTEL_PALACE;
    const snapshot = runtime.combatSnapshot();
    const target = runtime.cast.mark;
    const crosshair = document.getElementById('crosshair');
    const confirmed = crosshair.dataset.confirmed;
    const visible = target.root.visible;
    const savedPose = {
      pose: target.figure.pose,
      poseFrom: target.figure._poseFrom,
      visualState: target.root.userData.visualState,
      nodes: [target.figure.tilt, ...Object.values(target.figure.parts), target.weaponModel]
        .filter((node) => node?.position?.clone && node?.quaternion?.clone && node?.scale?.clone)
        .map((node) => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() })),
    };
    runtime.resetCombatBlood();
    try {
      runtime.security.alarm = true;
      target.active = true;
      target.down = false;
      target.root.visible = true;
      target.actor.restore({
        ...target.actor.snapshot(),
        health: target.actor.maxHealth,
        armor: target.actor.maxArmor,
        incapacitated: false,
      });
      const anchor = target.figure.parts.head;
      let object = null;
      anchor.traverse((node) => { if (!object && node.isMesh) object = node; });
      target.root.updateMatrixWorld(true);
      const localPoint = new THREE.Vector3(0.02, 0.03, 0.01);
      const point = anchor.localToWorld(localPoint.clone());
      const normal = new THREE.Vector3(0.17, 0.08, 1).normalize()
        .applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const origin = point.clone().addScaledVector(normal, 4);
      const direction = point.clone().sub(origin).normalize();
      const firearm = runtime.weapons.firearm(runtime.weapons.current);
      const armorBefore = target.actor.armor;
      const result = runtime.combatImpact({
        object,
        weapon: runtime.weapons.current,
        point,
        normal,
        origin,
        direction,
        distance: origin.distanceTo(point),
        damage: firearm.def.damage,
        penetration: firearm.def.penetration,
      });
      const wound = runtime.bloodImpacts.marksFor(target.actor)
        .find((mark) => mark.name === 'blood.impact') ?? null;
      const beforeMove = wound?.getWorldPosition(new THREE.Vector3()) ?? null;
      target.root.position.add(new THREE.Vector3(1.25, 0, 0.75));
      target.root.rotation.y += 0.31;
      target.root.updateMatrixWorld(true);
      const expected = result.anchorLocalPoint
        ? anchor.localToWorld(result.anchorLocalPoint.clone()) : null;
      const afterMove = wound?.getWorldPosition(new THREE.Vector3()) ?? null;
      return {
        entry: result.entry?.id ?? null,
        zone: result.zone,
        part: result.part,
        applied: result.applied,
        lethal: result.lethal,
        fatal: result.fatal,
        absorbed: result.result?.absorbed ?? null,
        armorBefore,
        health: target.actor.health,
        incapacitated: target.actor.incapacitated,
        down: target.down,
        localPointError: result.anchorLocalPoint?.distanceTo(localPoint) ?? Infinity,
        marks: runtime.bloodImpacts.marksOn(target.actor),
        woundParent: wound?.parent === anchor,
        woundMoved: beforeMove && afterMove ? afterMove.distanceTo(beforeMove) : 0,
        anchorError: afterMove && expected ? afterMove.distanceTo(expected) : Infinity,
        deathPools: runtime.deathBloodPools.visibleCount,
        visiblePool: runtime.deathBloodPools.meshes.some((mesh) => mesh.visible),
        confirmed: crosshair.dataset.confirmed ?? null,
      };
    } finally {
      runtime.combatRestore(snapshot);
      target.root.visible = visible;
      target.figure.pose = savedPose.pose;
      target.figure._poseFrom = savedPose.poseFrom;
      if (savedPose.visualState == null) delete target.root.userData.visualState;
      else target.root.userData.visualState = savedPose.visualState;
      for (const pose of savedPose.nodes) {
        pose.node.position.copy(pose.position);
        pose.node.quaternion.copy(pose.quaternion);
        pose.node.scale.copy(pose.scale);
      }
      if (confirmed == null) delete crosshair.dataset.confirmed;
      else crosshair.dataset.confirmed = confirmed;
      runtime.resetCombatBlood();
    }
  });
  check('a full real head-mesh impact is lethal through armor and records headshot feedback',
    headProof.entry === 'mark'
      && headProof.zone === 'head'
      && headProof.part === 'head'
      && headProof.applied && headProof.lethal && headProof.fatal
      && headProof.armorBefore > 0
      && headProof.absorbed === 0
      && headProof.health === 0
      && headProof.incapacitated && headProof.down
      && headProof.localPointError <= 1e-6
      && headProof.confirmed === 'headshot',
    JSON.stringify(headProof));
  check('fatal Palace blood stays attached after the fallen root moves and leaves a visible floor pool',
    headProof.marks >= 1
      && headProof.woundParent
      && headProof.woundMoved > 0.5
      && headProof.anchorError <= 0.012
      && headProof.deathPools >= 1
      && headProof.visiblePool,
    JSON.stringify(headProof));

  /* ---- In-memory death retry -------------------------------------------
   * A fresh estate document first: the combat probes above drive security
   * directly (bypassing mission persistence), so the campaign's persisted
   * snapshot no longer matches the scene they restored — a real run never
   * diverges like that, and the retry contract is defined against real play.
   *
   * Then dirty the run for real — a guard shot dead (which raises the alarm
   * and re-persists the checkpoint snapshot in the same call, with the guard
   * still alive at capture time), a floor blood pool, a narration line
   * mid-air — kill the player, and drive the same retryFromCheckpoint() the
   * retry button uses. The page must NOT reload (sentinel survives), and the
   * restored run must have no duplicate actors, no leftover blood, no
   * stacked audio loops and no talking corpse of a subtitle. */
  await page.goto(combatHref, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'menu', null, {
    timeout: 180000,
  });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'active', null, {
    timeout: 180000,
  });
  await page.waitForTimeout(180);

  const retryProof = await page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    window.__palaceRetrySentinel = 'no-reload';
    const audio = runtime.combatAudio.audio;
    const loopsBefore = [...(audio.loops?.keys?.() ?? [])].sort();
    const guard = runtime.cast.guards.find((entry) => entry.active && !entry.down);
    const guardId = guard.id;
    for (let round = 0; round < 6 && !guard.down; round++) {
      runtime.security.applyPlayerShot(guard.figure.parts.head, 'carbine');
    }
    runtime.deathBloodPools.spill(guard.root.position.clone(), { floorY: 0 });
    document.getElementById('subtitle')?.classList.remove('hidden');
    const snapshot = runtime.campaignStory.mission.checkpointSnapshot ?? null;
    const before = {
      guardDown: guard.down,
      alarm: runtime.security.alarm,
      bodyAlarm: document.body.classList.contains('alarm'),
      pools: runtime.deathBloodPools.visibleCount,
      snapshotAlarm: snapshot?.security?.alarm ?? null,
      snapshotGuardDown: snapshot?.security?.entries
        ?.find((entry) => entry.id === guardId)?.down ?? null,
    };
    runtime.playerActor.health = 0;
    runtime.playerActor.incapacitated = true;
    runtime.presentPlayerDeath();
    const dead = {
      phase: runtime.phase,
      overlayShown: !document.getElementById('death').classList.contains('hidden'),
    };
    const retried = runtime.retryFromCheckpoint();
    const restoredGuard = runtime.cast.guards.find((entry) => entry.id === guardId);
    const after = {
      retried,
      phase: runtime.phase,
      overlayHidden: document.getElementById('death').classList.contains('hidden'),
      guardDown: restoredGuard.down,
      guardActive: restoredGuard.active,
      guardWeaponVisible: restoredGuard.weaponModel?.visible === true,
      guardHealth: restoredGuard.actor.health,
      guardMaxHealth: restoredGuard.actor.maxHealth,
      health: runtime.playerActor.health,
      maxHealth: runtime.playerActor.maxHealth,
      incapacitated: runtime.playerActor.incapacitated,
      pools: runtime.deathBloodPools.visibleCount,
      bloodMarks: [...runtime.bloodImpacts.wounds.pool, ...runtime.bloodImpacts.spatter.pool]
        .filter((mesh) => mesh.visible).length,
      alarm: runtime.security.alarm,
      bodyAlarm: document.body.classList.contains('alarm'),
      subtitleHidden: document.getElementById('subtitle')?.classList.contains('hidden') ?? true,
      loopsAfter: [...(audio.loops?.keys?.() ?? [])].sort(),
      sentinel: window.__palaceRetrySentinel,
      checkpoint: runtime.checkpoint,
      beat: runtime.mission.beat,
      playerAt: {
        x: +runtime.player.position.x.toFixed(2),
        z: +runtime.player.position.z.toFixed(2),
      },
    };
    return { loopsBefore, before, dead, after };
  });
  check('dying mid-estate presents the death card with the world genuinely dirty',
    retryProof.before.guardDown && retryProof.before.alarm && retryProof.before.bodyAlarm
      && retryProof.before.pools >= 1
      && retryProof.dead.phase === 'dead' && retryProof.dead.overlayShown
      && retryProof.before.snapshotAlarm === true
      && retryProof.before.snapshotGuardDown === false,
    JSON.stringify({ before: retryProof.before, dead: retryProof.dead }));
  check('the retry restores the checkpoint in memory — same document, no reload',
    retryProof.after.retried === true
      && retryProof.after.sentinel === 'no-reload'
      && retryProof.after.phase === 'active'
      && retryProof.after.overlayHidden
      && retryProof.after.checkpoint === 'estate'
      && retryProof.after.beat === 'estate'
      && Math.abs(retryProof.after.playerAt.x - 14.3) < 0.5
      && Math.abs(retryProof.after.playerAt.z - 5.5) < 0.5,
    JSON.stringify(retryProof.after));
  check('the retry resurrects nobody wrongly and leaves nobody wrongly dead',
    retryProof.after.guardDown === false
      && retryProof.after.guardActive === true
      && retryProof.after.guardWeaponVisible === true
      && retryProof.after.guardHealth === retryProof.after.guardMaxHealth
      && retryProof.after.health === retryProof.after.maxHealth
      && retryProof.after.incapacitated === false,
    JSON.stringify(retryProof.after));
  check('the retry wipes the attempt\'s blood, cuts its subtitle and stacks no audio loops',
    retryProof.after.pools === 0
      && retryProof.after.bloodMarks === 0
      && retryProof.after.subtitleHidden === true
      && JSON.stringify(retryProof.after.loopsAfter) === JSON.stringify(retryProof.loopsBefore)
      && retryProof.after.alarm === true
      && retryProof.after.bodyAlarm === true,
    JSON.stringify({ loops: retryProof.loopsBefore, after: retryProof.after }));

  const webgl = await page.evaluate(() => {
    const gl = window.CARTEL_PALACE.renderer.getContext();
    return {
      context: Boolean(gl),
      lost: gl?.isContextLost?.() ?? true,
      version: gl?.getParameter?.(gl.VERSION) ?? null,
      renderer: gl?.getParameter?.(gl.RENDERER) ?? null,
      drawCalls: window.CARTEL_PALACE.renderer.info.render.calls,
    };
  });
  check('the Palace renderer retains a live WebGL context through the combat probes',
    webgl.context && webgl.lost === false && webgl.drawCalls > 0,
    JSON.stringify(webgl));

  check('all Palace resources load without browser errors',
    problems.length === 0 && notFound.length === 0,
    JSON.stringify({ problems, notFound }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\nCARTEL PALACE ${results.length - failed}/${results.length} checks passed.`);
process.exitCode = failed ? 1 : 0;

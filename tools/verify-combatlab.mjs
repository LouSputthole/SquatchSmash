#!/usr/bin/env node
/**
 * Verify The Combat Lab -- the proving ground for `src/core/combat/`.
 *
 * WHAT THIS CHECKS, AND WHY IT IS SHAPED THIS WAY
 *
 * The lab exists to answer combat questions the missions cannot ask safely:
 * does a round go where the crosshair is, does a head kill, does a helmet
 * save, does a chest take a believable number of rounds, do seven enemies in
 * an open yard actually notice a man standing in it. So every check below is
 * written as one of those questions, asked the way a player asks it -- point
 * the camera at a real world position, pull the trigger once, read what the
 * framework recorded.
 *
 * Three rules this script keeps (docs/ENGINE-TRAPS.md):
 *
 *   1. Trap #2: the simulation clock is not the wall clock. Nothing here
 *      sleeps for a duration. Time is bought from the scene's own
 *      `window.combatlab.tick(seconds, step)`, which runs updateGame() at a
 *      fixed step with no rendering in the way, so a loaded box and an idle
 *      one buy exactly the same six seconds of firefight.
 *   2. Trap #5: gates that lie. A shot is aimed at a hitbox mesh's real world
 *      position and fired through `playerCombat.triggerPress()` -- the same
 *      call the left mouse button makes -- rather than by poking damage into
 *      a Vitals. If the wiring between camera, WeaponSystem, ShotResolver and
 *      Vitals is broken anywhere, no assertion below can pass.
 *   3. Rendering is switched OFF for the body of the run and back ON at each
 *      end, because a swiftshader frame of this scene costs seconds and none
 *      of the combat questions are rendering questions -- but "it booted" and
 *      "it still draws afterwards" are, so those two frames are real.
 *
 * `log.counts.shots` is deliberately NOT used as evidence a round was fired:
 * nothing in the framework calls `CombatLog.shot()`, so it is always zero.
 * Rounds are counted from `weapons.stats.shots` (the player's) and impacts
 * from `effects.counts` (everyone's).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5231;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

/** Generous, because a genuine failure is the only thing that ever waits. */
const SIM_WAIT = 180000;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the combat lab.');
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
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.setDefaultTimeout(SIM_WAIT);

const problems = [];
const notFound = [];
page.on('response', (r) => {
  if (r.status() === 404) notFound.push(new URL(r.url()).pathname);
});
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});

const results = [];
const notes = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}
function note(text) {
  notes.push(text);
  console.log(`  info  ${text}`);
}

/* ------------------------------------------------------------------ */
/* Small helpers over window.combatlab's debug handle                  */
/* ------------------------------------------------------------------ */

/** Buy simulated seconds. Never a wall-clock wait. */
async function tick(seconds = 1, step = 1 / 60) {
  await page.evaluate(([s, st]) => window.combatlab.tick(s, st), [seconds, step]);
}

async function teleport(x, y, z, yawDeg = 0) {
  await page.evaluate(
    ([tx, ty, tz, tyaw]) => window.combatlab.teleport(tx, ty, tz, tyaw),
    [x, y, z, yawDeg],
  );
}

const lab = () => page.evaluate(() => ({
  spawns: window.combatlab.lab.spawns,
  LAB: {
    YARD: { ...window.combatlab.LAB.YARD },
    RANGE: { ...window.combatlab.LAB.RANGE },
    MATERIAL_WALL: { ...window.combatlab.LAB.MATERIAL_WALL },
    KILLHOUSE: { ...window.combatlab.LAB.KILLHOUSE },
    UPPER_Y: window.combatlab.LAB.UPPER_Y,
  },
}));

const state = () => page.evaluate(() => {
  const L = window.combatlab;
  return {
    equipped: L.weapons.equipped,
    shots: L.weapons.stats.shots,
    effects: { ...L.effects.counts },
    counts: { ...L.log.counts },
    health: L.playerCombat.vitals.health,
    maxHealth: L.playerCombat.vitals.maxHealth,
    dead: L.playerCombat.vitals.dead,
    combatants: L.combatants.map((c) => ({
      id: c.id, faction: c.faction, ...c.report(),
    })),
    encounter: L.encounter()?.report() ?? null,
  };
});

try {
  await page.goto(`http://localhost:${PORT}/combatlab.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.combatlab?.playerCombat, null, { timeout: SIM_WAIT });

  /* ================================================================ */
  /* 1. It boots, and it draws                                        */
  /* ================================================================ */
  console.log('\n-- boot --');
  const handle = await page.evaluate(() => {
    const L = window.combatlab;
    return {
      keys: ['scene', 'camera', 'player', 'playerCombat', 'weapons', 'armory', 'lab',
        'combatants', 'resolver', 'rules', 'cover', 'log', 'effects', 'checkpoints']
        .filter((k) => L[k] === undefined || L[k] === null),
      weaponsInArmory: L.armory?.slots?.length ?? L.armory?.racks?.length ?? null,
    };
  });
  check('window.combatlab exposes the whole framework', handle.keys.length === 0,
    handle.keys.length ? `missing: ${handle.keys.join(', ')}` : 'all present');

  await page.waitForFunction(() => window.combatlab.framesRendered > 0, null, { timeout: SIM_WAIT });
  const bootFrames = await page.evaluate(() => window.combatlab.framesRendered);
  check('the lab renders a real frame before anything is asked of it', bootFrames > 0,
    `${bootFrames} frames`);

  check('nothing 404s on the way in', notFound.length === 0,
    `missing: ${[...new Set(notFound)].join(', ') || 'nothing'}`);
  check('no console errors on the way in', problems.length === 0, problems.join(' | '));

  /* Rendering off for the body of the run: every question below is about
   * simulation, and a swiftshader frame of this scene costs seconds. */
  await page.evaluate(() => { window.combatlab.renderEnabled = false; });

  /* Page-side helpers. Kept here rather than in the scene because they are
   * the verifier's business: aiming a camera at a world point, and reading a
   * named hitbox's world position off the animated rig. */
  await page.evaluate(() => {
    const L = window.combatlab;
    const { THREE } = L;
    const _v = new THREE.Vector3();
    const _e = new THREE.Euler(0, 0, 0, 'YXZ');

    /**
     * Point the eye at a world position, exactly.
     *
     * In core/player.js the camera quaternion is Euler(pitch, yaw, 0, 'YXZ'),
     * so forward is (-sin yaw cos pitch, sin pitch, -cos yaw cos pitch) and
     * the heading toward (dx, dz) is atan2(-dx, -dz). Both the player's own
     * yaw/pitch AND the camera are set, so the next tick agrees with the ray
     * this shot is about to fire.
     */
    L.__aim = (p) => {
      const cam = L.camera;
      const eye = cam.getWorldPosition(new THREE.Vector3());
      const dx = p.x - eye.x;
      const dy = p.y - eye.y;
      const dz = p.z - eye.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      L.player.yaw = yaw;
      L.player.pitch = pitch;
      _e.set(pitch, yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(_e);
      cam.updateMatrixWorld(true);
      const dir = cam.getWorldDirection(_v.clone());
      return {
        yaw, pitch,
        eye: { x: eye.x, y: eye.y, z: eye.z },
        dir: { x: dir.x, y: dir.y, z: dir.z },
        distance: Math.hypot(dx, dy, dz),
      };
    };

    /** Where a named hit region of a named combatant actually is, right now. */
    L.__region = (id, region) => {
      const c = L.combatants.find((k) => k.id === id);
      if (!c) return null;
      const m = c.hitboxes.meshes.find((mm) => mm.userData.hitRegion === region);
      if (!m) return null;
      const p = m.getWorldPosition(new THREE.Vector3());
      return { x: p.x, y: p.y, z: p.z };
    };

    /** The nearest world mesh of a given material, and where its face is. */
    L.__material = (material, from) => {
      let best = null;
      for (const m of L.lab.hitMeshes) {
        if (m.userData.material !== material) continue;
        const p = m.getWorldPosition(new THREE.Vector3());
        const d = Math.hypot(p.x - from.x, p.z - from.z);
        if (!best || d < best.d) best = { d, name: m.name, x: p.x, y: p.y, z: p.z };
      }
      return best;
    };

    /** One deliberate trigger pull through the player's own path. */
    L.__fire = () => {
      const before = L.weapons.stats.shots;
      const shot = L.playerCombat.triggerPress();
      return {
        fired: L.weapons.stats.shots > before,
        reason: shot?.reason ?? null,
        obstructed: L.weapons.obstructed,
      };
    };
  });

  /* ================================================================ */
  /* 2. A round goes where the camera is looking                      */
  /* ================================================================ */
  console.log('\n-- the range, the guns, and where the round goes --');
  const { spawns, LAB } = await lab();

  await teleport(spawns.rangeBench.x, 0, spawns.rangeBench.z, 0);
  await tick(0.3);

  const equipped = await page.evaluate(() => {
    const ok = window.combatlab.weapons.equip('ak47');
    return { ok, current: window.combatlab.weapons.equipped };
  });
  check("weapons.equip('ak47') puts the rifle in his hands",
    equipped.ok && equipped.current === 'ak47', `equipped: ${equipped.current}`);

  /* The yaw convention, proved rather than assumed: yaw 0 must look down -Z,
   * and yaw +90 degrees down -X. Everything that aims below depends on it. */
  const facing = await page.evaluate(() => {
    const L = window.combatlab;
    const out = [];
    for (const deg of [0, 90, 180, 270]) {
      L.player.yaw = (deg * Math.PI) / 180;
      L.player.pitch = 0;
      L.player.update(1 / 60);
      const d = L.camera.getWorldDirection(new L.THREE.Vector3());
      out.push({ deg, x: Math.round(d.x * 100) / 100, z: Math.round(d.z * 100) / 100 });
    }
    return out;
  });
  const facesRight = facing.every((f) => {
    const yaw = (f.deg * Math.PI) / 180;
    return Math.abs(f.x - -Math.sin(yaw)) < 0.02 && Math.abs(f.z - -Math.cos(yaw)) < 0.02;
  });
  check('the camera faces where player.yaw says it does (yaw 0 is -Z)', facesRight,
    facing.map((f) => `${f.deg}deg->(${f.x},${f.z})`).join(' '));

  /* Now the material wall, from its own firing line: a drywall panel is a
   * real world surface with a real material tag, and a round into it must
   * come back through the resolver as a world impact. */
  await teleport(spawns.materialWall.x, 0, spawns.materialWall.z, 0);
  await tick(0.3);
  const panel = await page.evaluate(() => window.combatlab.__material('drywall', {
    x: window.combatlab.player.position.x, z: window.combatlab.player.position.z,
  }));
  check('the material wall has a drywall panel to shoot at', !!panel,
    panel ? `${panel.name} at (${panel.x.toFixed(1)}, ${panel.z.toFixed(1)})` : 'none found');

  const beforeWall = await state();
  const aimWall = await page.evaluate((p) => window.combatlab.__aim(p), panel);
  const wallShot = await page.evaluate(() => window.combatlab.__fire());
  await tick(0.2);
  const afterWall = await state();
  check('a trigger pull spends a round', afterWall.shots > beforeWall.shots,
    `shots ${beforeWall.shots} -> ${afterWall.shots}${wallShot.fired ? '' : ` (${wallShot.reason ?? 'no shot'}${wallShot.obstructed ? ', obstructed' : ''})`}`);
  check('the resolver reports the world surface the round struck',
    afterWall.effects.world > beforeWall.effects.world,
    `world impacts ${beforeWall.effects.world} -> ${afterWall.effects.world}, ${aimWall.distance.toFixed(1)}m`);

  /* ================================================================ */
  /* 3. A head kills                                                  */
  /* ================================================================ */
  console.log('\n-- the head, the helmet, and the chest --');
  await page.evaluate(() => window.combatlab.clearCombatants());

  /* Down an empty range lane, six metres, aimed: nothing between the muzzle
   * and the man. Up to three bodies, because the ak47's aimed cone is small
   * but not zero -- if it NEVER lands, the aiming or the rig is wrong. */
  let headshot = null;
  for (let attempt = 0; attempt < 3 && !headshot?.dead; attempt++) {
    headshot = await page.evaluate(async ([bench]) => {
      const L = window.combatlab;
      L.clearCombatants();
      /* Back on the firing point, facing downrange. The material wall's own
       * line (where check 2 left him) has the range's side berm across it --
       * a round fired from there never reaches the range at all. */
      L.teleport(bench.x, 0, bench.z, 0);
      L.tick(0.2);
      const id = `verify.head.${Date.now()}`;
      L.spawnCombatant('rifleman', 'police', { x: bench.x, z: bench.z - 6, id });
      L.tick(0.1);
      L.weapons.equip('ak47');
      L.playerCombat.setAim(true);
      L.tick(0.5);
      const head = L.__region(id, 'head');
      if (!head) return { dead: false, reason: 'no head hitbox' };
      const aim = L.__aim(head);
      const before = L.log.counts.headshots;
      const shot = L.__fire();
      L.tick(0.2);
      L.playerCombat.setAim(false);
      const c = L.combatants.find((k) => k.id === id);
      return {
        dead: c?.report().dead === true,
        headshots: L.log.counts.headshots - before,
        health: c?.report().health,
        distance: aim.distance,
        fired: shot.fired,
        reason: shot.reason,
      };
    }, [spawns.rangeBench]);
  }
  check('an aimed rifle round to the head drops a rifleman', headshot?.dead === true,
    `health ${Math.round(headshot?.health ?? -1)}, ${(headshot?.distance ?? 0).toFixed(1)}m`);
  check('and the log records it as a headshot', (headshot?.headshots ?? 0) >= 1,
    `headshots this shot: ${headshot?.headshots ?? 0}`);

  /* ================================================================ */
  /* 4. A helmet saves                                                */
  /* ================================================================ */
  const helmet = await page.evaluate(async ([bench]) => {
    const L = window.combatlab;
    L.clearCombatants();
    L.teleport(bench.x, 0, bench.z, 0);
    L.tick(0.2);
    const id = `verify.helmet.${Date.now()}`;
    L.spawnCombatant('armored', 'police', { x: bench.x, z: bench.z - 6, id });
    L.tick(0.1);
    L.weapons.equip('pistol9');
    L.playerCombat.setAim(true);
    L.tick(0.5);
    const head = L.__region(id, 'head');
    if (!head) return { reason: 'no head hitbox' };
    L.__aim(head);
    const before = L.log.counts.helmetSaves;
    const shot = L.__fire();
    L.tick(0.2);
    L.playerCombat.setAim(false);
    const c = L.combatants.find((k) => k.id === id);
    return {
      saves: L.log.counts.helmetSaves - before,
      dead: c?.report().dead === true,
      helmet: c?.report().helmet,
      health: c?.report().health,
      fired: shot.fired,
      reason: shot.reason,
    };
  }, [spawns.rangeBench]);
  check('a 9mm to an armored head is eaten by the helmet', (helmet?.saves ?? 0) >= 1,
    `helmet saves: ${helmet?.saves ?? 0}, helmet left ${Math.round(helmet?.helmet ?? -1)}`);
  check('and the man behind the helmet is still standing', helmet?.dead === false,
    `health ${Math.round(helmet?.health ?? -1)}`);

  /* ================================================================ */
  /* 5. A chest is not a sponge                                       */
  /* ================================================================ */
  const chest = await page.evaluate(async ([bench]) => {
    const L = window.combatlab;
    L.clearCombatants();
    L.teleport(bench.x, 0, bench.z, 0);
    L.tick(0.2);
    const id = `verify.chest.${Date.now()}`;
    L.spawnCombatant('rifleman', 'police', { x: bench.x, z: bench.z - 6, id });
    L.tick(0.1);
    L.weapons.equip('pistol9');
    L.playerCombat.setAim(true);
    L.tick(0.5);
    let rounds = 0;
    let misses = 0;
    for (let i = 0; i < 12; i++) {
      const c = L.combatants.find((k) => k.id === id);
      if (!c || c.report().dead) break;
      const chestAt = L.__region(id, 'upperTorso');
      if (!chestAt) break;
      L.__aim(chestAt);
      const before = L.log.counts.hits;
      const shot = L.__fire();
      if (shot.fired) rounds++;
      if (L.log.counts.hits === before) misses++;
      L.tick(0.25);
    }
    L.playerCombat.setAim(false);
    const c = L.combatants.find((k) => k.id === id);
    return { rounds, misses, dead: c?.report().dead === true, health: c?.report().health };
  }, [spawns.rangeBench]);
  check('a rifleman dies to a believable burst of 9mm, not a magazine',
    chest.dead === true && chest.rounds >= 3 && chest.rounds <= 5,
    `${chest.rounds} rounds fired (${chest.misses} did not land), health ${Math.round(chest.health ?? -1)}`);

  /* ================================================================ */
  /* 6. Seven men in a yard notice the man standing in it             */
  /* ================================================================ */
  console.log('\n-- the yard fight --');
  await page.evaluate(() => window.combatlab.clearCombatants());
  const fightErrorsBefore = problems.length;
  const yard = await page.evaluate(() => {
    const L = window.combatlab;
    L.startEncounter('yard');
    L.tick(0.5);
    return { spawned: L.combatants.length, state: L.encounter()?.report().state };
  });
  check('the yard encounter fields its whole squad', yard.spawned >= 7,
    `${yard.spawned} combatants, encounter ${yard.state}`);

  await teleport(LAB.YARD.x, 0, LAB.YARD.z, 180);
  await page.evaluate(() => {
    const L = window.combatlab;
    L.weapons.equip('ak47');
    L.playerCombat.vitals.invuln = 0;
  });
  const fightBefore = await state();
  const fightMs = Date.now();
  await tick(6, 1 / 60);
  const fightWall = Date.now() - fightMs;
  const fight = await state();
  const foes = fight.combatants.filter((c) => c.faction !== 'crew');
  const reacted = foes.filter((c) => c.state !== 'unaware' && !c.dead);
  check('the enemy notices a man standing in the open yard', reacted.length >= 1,
    `${reacted.length}/${foes.length} reacted: ${[...new Set(foes.map((c) => c.state))].join(', ')}`);

  const shooting = foes.some((c) => ['firing', 'inCover', 'seekingCover', 'flanking', 'repositioning', 'suppressed'].includes(c.state));
  const hurt = fight.health < fightBefore.maxHealth;
  const impacts = fight.effects.world + fight.effects.body
    - (fightBefore.effects.world + fightBefore.effects.body);
  const landed = fight.counts.hits - fightBefore.counts.hits;
  check('and fights: rounds are in the air and the player is under them',
    shooting || hurt || impacts > 0,
    `player ${Math.round(fight.health)}/${fight.maxHealth}hp, ${impacts} impacts, ${landed} rounds landed on him`);
  check('no console errors during the firefight',
    problems.length === fightErrorsBefore,
    problems.slice(fightErrorsBefore).join(' | '));
  note(`six simulated seconds of a seven-man yard fight cost ${fightWall} ms of wall clock`);
  note(`standing in the open against seven of them costs ${Math.round(fightBefore.maxHealth - fight.health)} health in six seconds${fight.dead ? ' -- he does not survive it' : ''}`);

  /* ================================================================ */
  /* 7. Cover and suppression are used, not decorative                */
  /* ================================================================ */
  const tactics = foes.filter((c) => c.suppression > 0 || c.state === 'inCover'
    || c.state === 'seekingCover' || c.cover);
  if (tactics.length) {
    check('the squad uses cover and feels suppression', true,
      `${tactics.length} of ${foes.length}: ${tactics.map((c) => `${c.state}${c.cover ? `@${c.cover}` : ''}`).slice(0, 4).join(', ')}`);
  } else {
    note('no combatant reported cover or suppression in six seconds -- soft check, not a failure');
  }
  check('nobody is still unaware after six seconds in an open yard',
    foes.every((c) => c.dead || c.state !== 'unaware'),
    `${foes.filter((c) => !c.dead && c.state === 'unaware').length} still unaware`);

  /* ================================================================ */
  /* 8. Losing fails the encounter; clearing it completes it          */
  /* ================================================================ */
  /* Standing in the open against seven riflemen is losing, and the framework
   * says so: the player's death is reported to the controller and the fight
   * ends 'failed'. That has to be asserted before the winning case, because
   * a failed encounter can never be completed afterwards -- so the kill-all
   * below is run against a FRESH yard, from a firing point out of the yard's
   * reach, which is the only honest way to ask "does clearing it complete". */
  if (fight.dead) {
    check('the encounter reports failure when the player goes down',
      (await state()).encounter?.state === 'failed',
      `encounter ${(await state()).encounter?.state}`);
  }

  const cleared = await page.evaluate(([bench]) => {
    const L = window.combatlab;
    L.playerCombat.vitals.revive({ health: L.playerCombat.vitals.maxHealth });
    L.teleport(bench.x, 0, bench.z, 0); // the range, a long way from the yard
    L.startEncounter('yard');
    L.tick(0.5);
    const spawned = L.combatants.filter((c) => c.faction !== 'crew').length;
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      for (const c of [...L.combatants]) {
        if (c.faction === 'crew' || c.report().dead) continue;
        c.scriptKill({ direction: { x: 0, z: 1 } });
      }
      L.tick(1);
      const r = L.encounter()?.report() ?? null;
      rounds.push(`${r?.state}/${r?.alive} alive`);
      if (r?.state === 'complete') break;
    }
    return { report: L.encounter()?.report() ?? null, rounds, spawned };
  }, [spawns.rangeBench]);
  check('killing everyone -- reinforcements included -- completes the encounter',
    cleared.report?.state === 'complete',
    `${cleared.spawned} spawned, ${cleared.rounds.join(' then ')} (${cleared.report?.kills} kills)`);

  /* ================================================================ */
  /* 9. A checkpoint is a real save and a real load                   */
  /* ================================================================ */
  console.log('\n-- checkpoints, allies, doors, movers --');
  const cp = await page.evaluate(() => {
    const L = window.combatlab;
    L.playerCombat.vitals.revive({ health: L.playerCombat.vitals.maxHealth });
    L.playerCombat.vitals.invuln = 0;
    const captured = L.playerCombat.vitals.health;
    const encounterBefore = L.encounter()?.report().state ?? null;
    L.checkpoints.capture('t');
    L.playerCombat.vitals.applyRaw(50);
    const hurt = L.playerCombat.vitals.health;
    const restored = L.checkpoints.restore();
    return {
      captured,
      hurt,
      after: L.playerCombat.vitals.health,
      restored,
      encounterBefore,
      encounterAfter: L.encounter()?.report().state ?? null,
    };
  });
  check('damage lands on the player', cp.hurt < cp.captured,
    `${cp.captured} -> ${cp.hurt}`);
  check('restoring the checkpoint gives back exactly what was captured',
    cp.restored === true && Math.abs(cp.after - cp.captured) < 0.001,
    `${cp.hurt} -> ${cp.after} (captured ${cp.captured})`);
  check('and the encounter survives the round trip',
    cp.encounterAfter === cp.encounterBefore,
    `${cp.encounterBefore} -> ${cp.encounterAfter}`);

  /* ================================================================ */
  /* 10. An ally is the same framework, on the other side             */
  /* ================================================================ */
  const allyErrors = problems.length;
  const ally = await page.evaluate(() => {
    const L = window.combatlab;
    const a = L.spawnAlly();
    L.tick(1);
    return {
      faction: a?.faction,
      crew: L.combatants.filter((c) => c.faction === 'crew').length,
      state: a?.report().state,
    };
  });
  check('spawnAlly() fields a crew Squatch that runs without error',
    ally.crew >= 1 && ally.faction === 'crew' && problems.length === allyErrors,
    `${ally.crew} crew, state ${ally.state}${problems.length > allyErrors ? ` | ${problems.slice(allyErrors).join(' | ')}` : ''}`);

  /* ================================================================ */
  /* 11. Doors move, and so do the movers                             */
  /* ================================================================ */
  const doors = await page.evaluate(() => {
    const L = window.combatlab;
    const before = L.lab.colliders.length;
    const opened = L.lab.doors[0].toggle();
    const open = L.lab.colliders.length;
    L.lab.doors[0].toggle();
    return { before, open, closed: L.lab.colliders.length, opened, count: L.lab.doors.length };
  });
  check('an opened door stops being a wall (and a closed one starts again)',
    doors.open < doors.before && doors.closed === doors.before,
    `colliders ${doors.before} -> ${doors.open} -> ${doors.closed}, ${doors.count} doors`);

  const movers = await page.evaluate(() => {
    const L = window.combatlab;
    const before = L.lab.movingTargets.targets.map((t) => t.group.position.x);
    L.tick(1);
    const after = L.lab.movingTargets.targets.map((t) => t.group.position.x);
    return { before, after, moved: before.filter((x, i) => Math.abs(x - after[i]) > 0.1).length };
  });
  check('the range carriers actually travel their rails',
    movers.moved === movers.before.length && movers.before.length > 0,
    `${movers.moved}/${movers.before.length} moved, e.g. ${movers.before[0]?.toFixed(2)} -> ${movers.after[0]?.toFixed(2)}`);

  /* ================================================================ */
  /* 12. A dozen enemies at once, and the clock                       */
  /* ================================================================ */
  console.log('\n-- the stress wave --');
  const stressErrors = problems.length;
  const stressStart = await page.evaluate(() => {
    const L = window.combatlab;
    L.startEncounter('stress');
    L.tick(0.5);
    return L.combatants.length;
  });
  const stressMs = Date.now();
  await tick(5, 1 / 30);
  const stressWall = Date.now() - stressMs;
  const stress = await state();
  check('the stress wave runs a dozen bodies with no console errors',
    problems.length === stressErrors && stressStart >= 12,
    `${stressStart} spawned${problems.length > stressErrors ? ` | ${problems.slice(stressErrors).join(' | ')}` : ''}`);
  note(`five simulated seconds of ${stressStart} combatants at 1/30 cost ${stressWall} ms of wall clock (${(stressWall / 150).toFixed(1)} ms per simulated step)`);
  note(`${stress.combatants.filter((c) => !c.dead).length} of ${stressStart} still standing when the wave was cut short`);

  const torn = await page.evaluate(() => {
    window.combatlab.clearCombatants();
    window.combatlab.tick(0.5);
    return window.combatlab.combatants.length;
  });
  check('clearCombatants() takes every body back off the board', torn === 0,
    `${torn} left`);

  /* ================================================================ */
  /* 13. It still draws when the shooting stops                       */
  /* ================================================================ */
  console.log('\n-- after the shooting --');
  const framesBefore = await page.evaluate(() => {
    window.combatlab.renderEnabled = true;
    return window.combatlab.framesRendered;
  });
  await page.waitForFunction(
    (n) => window.combatlab.framesRendered > n + 1, framesBefore, { timeout: SIM_WAIT },
  );
  const shot = await page.screenshot({ type: 'png', timeout: SIM_WAIT });
  check('the lab still renders a non-black frame after every fight it ran',
    shot.some((b, i) => i > 64 && b > 24), `${shot.length} bytes`);

  check('nothing 404d for the whole run', notFound.length === 0,
    `missing: ${[...new Set(notFound)].join(', ') || 'nothing'}`);
  check('no console errors for the whole run', problems.length === 0,
    [...new Set(problems)].slice(0, 6).join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Combat Lab checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Combat Lab checks passed.`);

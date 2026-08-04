#!/usr/bin/env node
/**
 * Verify The Enola Squatch end to end in a real browser: boot, the on-foot
 * walkaround (six real checks driven through the real interaction system, the
 * crew standing round the aeroplane, boarding through the crew door), the
 * seated crew, cockpit preflight, taxi, takeoff (real thrust from all four
 * engines), climb-out and turn, the cruise nav-correction barks, the detection
 * corridor, the compound's defensive fire (damage API) and the rear gunner,
 * the bombing approach over Squatchbourg, the bomb-bay malfunction, a real 1-5
 * release-line choice (payload detaches, mass drops), the falling whistle, the
 * detonation, the crater the city used to be in, escape, the engine emergency,
 * return, landing (grading), and the epilogue/report card. Asserts no
 * console/page errors across the whole run.
 *
 * Drives the mission through `window.__enolaSquatch` (see
 * `src/enolasquatch/main.js`) rather than simulating raw key/mouse input for
 * every leg: some inter-phase transitions are exercised organically (real
 * physics integration, real phase-exit conditions), others are jumped via
 * `.go(phase)` where holding a precise flight attitude for real would make
 * this script fragile rather than meaningfully more thorough — each shortcut
 * is called out in a comment at the point it is taken.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5225;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Enola Squatch.');
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

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });

  await page.goto(`http://localhost:${PORT}/enolasquatch.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.enolaSquatch === true, null, { timeout: 30000 });
  check('the page boots and signals the watchdog', true);

  /* ---- Start button really boots the mission (not just go()) ---- */
  const booted = await page.evaluate(() => {
    document.getElementById('start-btn').click();
    const h = window.__enolaSquatch;
    return {
      overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
      // The flight HUD is deliberately DOWN on the apron — there is no flight
      // to instrument yet — and the preflight checklist is up in its place.
      hudUp: !document.getElementById('br-hud').classList.contains('hidden'),
      checklistUp: !document.getElementById('br-checklist').classList.contains('hidden'),
      phase: h.mission.phase,
      inCockpit: h.mission.inCockpit,
      playerEnabled: h.player.enabled,
      onGround: Math.abs(h.player.position.y - (h.groundHeight(h.player.position.x, h.player.position.z) + 1.66)) < 0.2,
    };
  });
  check('the Start button hides the title card and puts Tony on the apron on foot, not in the seat',
    booted.overlayHidden && !booted.hudUp && booted.checklistUp
      && booted.phase === 'walkaround' && booted.inCockpit === false
      && booted.playerEnabled && booted.onGround,
    JSON.stringify(booted));

  /* ---- The crew are actually there, standing round the aeroplane ---- */
  const crewOnApron = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const p = h.physics.position;
    return {
      count: h.crew.all.length,
      names: h.crew.all.map((f) => f.group.name),
      aboard: h.crew.aboard,
      inScene: h.crew.all.every((f) => f.group.parent === h.scene),
      // Everybody within twenty metres of the aeroplane, and nobody inside it.
      near: h.crew.all.every((f) => {
        const d = Math.hypot(f.group.position.x - p.x, f.group.position.z - p.z);
        return d > 1 && d < 22;
      }),
      // Sasole is Sasole. Big Uncle Lou is not on this aeroplane.
      sasoleIsPilot: h.crew.sasole.group.name === 'captain_lou_sasole',
      noBigLou: h.crew.all.every((f) => f.group.name !== 'lou' && f.group.name !== 'big_uncle_lou'),
    };
  });
  check('the four crew stand round the aeroplane on the apron, and Sasole is not Big Uncle Lou',
    crewOnApron.count === 4 && !crewOnApron.aboard && crewOnApron.inScene && crewOnApron.near
      && crewOnApron.sasoleIsPilot && crewOnApron.noBigLou,
    JSON.stringify(crewOnApron));

  /* ---- The walkaround, played for real ----
   * Every check below is reached by standing the player where a person would
   * stand and pointing his head at the part, then pressing E through the real
   * `InteractionSystem` — no `onUse` is called directly. That is deliberate:
   * the failure this guards against is a check the player can SEE and cannot
   * REACH, which is a bug this project has already shipped once (the Beef
   * Run's fuel sample) and which calling the handler directly cannot detect. */
  const walkaround = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const log = [];
    let guard = 0;
    while (!h.preflight.complete && guard++ < 40) {
      const at = h.standAtNextCheck(2.0);
      if (!at) break;
      const before = h.preflight.doneCount;
      /* `interaction.current` is the object the real crosshair found. Its
       * `.name` is often empty (a bare `THREE.Group` for a propeller hub, for
       * instance), so presence is what is asserted and the label the HUD would
       * print is what is logged — a name test would fail on parts that are
       * perfectly reachable. */
      const target = h.interaction.current;
      const desc = target?.userData?.interact;
      const label = desc ? (typeof desc.label === 'function' ? desc.label() : desc.label) : null;
      // Hold long enough to satisfy the longest hold in the walk (1.0 s).
      h.pressE(1.3);
      log.push({
        check: at.name,
        prompted: !!target,
        label,
        countBefore: before,
        countAfter: h.preflight.doneCount,
      });
    }
    return {
      log,
      complete: h.preflight.complete,
      done: h.preflight.doneCount,
      tasks: Object.fromEntries(Object.entries(h.preflight.tasks)
        .map(([k, t]) => [k, `${t.count}/${t.need}`])),
      seen: {
        numbskull: h.dialogue.seen('preflight.numbskull'),
        restraints: h.dialogue.seen('preflight.restraints'),
        bombbay: h.dialogue.seen('preflight.bombbay'),
        shubes: h.dialogue.seen('preflight.shubes.first'),
      },
      phase: h.mission.phase,
    };
  });
  check('every walkaround check is reachable on foot and completes through the real interaction system',
    walkaround.complete && walkaround.done === 6
      && walkaround.log.every((row) => row.prompted)
      /* Ten presses for ten checks (2 chocks + 4 props + 1 each of bay,
       * payload, tail, surfaces). More than that means the crosshair had to be
       * re-aimed, i.e. something is only reachable by luck. */
      && walkaround.log.length === 10,
    JSON.stringify({ complete: walkaround.complete, tasks: walkaround.tasks, log: walkaround.log }));

  check('the walkaround fires the four crew beats that used to play at nobody from the left seat',
    walkaround.seen.numbskull && walkaround.seen.restraints
      && walkaround.seen.bombbay && walkaround.seen.shubes,
    JSON.stringify(walkaround.seen));

  /* ---- Boarding through the crew door ---- */
  const boarding = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const armed = !!h.mission.boardTarget;
    // Stand at the door and press E, through the real interaction system.
    const door = h.mission.boardTarget;
    const pos = { x: 0, y: 0, z: 0 };
    if (door) {
      door.updateWorldMatrix(true, false);
      const e = door.matrixWorld.elements;
      pos.x = e[12]; pos.y = e[13]; pos.z = e[14];
    }
    const gy = h.groundHeight(pos.x, pos.z);
    // Two metres out from the door, on the same side.
    const ax = pos.x - h.physics.position.x;
    const az = pos.z - h.physics.position.z;
    const len = Math.hypot(ax, az) || 1;
    const sx = pos.x + (ax / len) * 1.8;
    const sz = pos.z + (az / len) * 1.8;
    h.player.position.set(sx, gy + 1.66, sz);
    h.player.ground = gy;
    const dx = pos.x - sx; const dy = pos.y - (gy + 1.66); const dz = pos.z - sz;
    h.player.yaw = Math.atan2(-dx, -dz);
    h.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    h.tick(1 / 30);
    const prompted = !!h.interaction.current;
    h.pressE(0);
    return {
      armed,
      prompted,
      inCockpit: h.mission.inCockpit,
      phase: h.mission.phase,
      crewAboard: h.crew.aboard,
      playerEnabled: h.player.enabled,
      interactionPaused: h.interaction.paused,
      bayClosed: h.mission.bombBayOpen === false,
    };
  });
  check('the crew door arms when the walk is done and boarding it puts everyone in the aeroplane',
    boarding.armed && boarding.prompted && boarding.inCockpit && boarding.phase === 'preflight'
      && boarding.crewAboard && !boarding.playerEnabled && boarding.interactionPaused
      && boarding.bayClosed,
    JSON.stringify(boarding));

  /* ---- The crew are physically in their seats, riding the airframe ---- */
  const seated = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const inAircraft = (f) => {
      let o = f.group;
      while (o) { if (o === h.aircraft.group) return true; o = o.parent; }
      return false;
    };
    const world = (f) => {
      f.group.updateWorldMatrix(true, false);
      const e = f.group.matrixWorld.elements;
      return { x: e[12], y: e[13], z: e[14] };
    };
    const p = h.physics.position;
    const dist = (f) => {
      const w = world(f);
      return Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
    };
    return {
      allParented: h.crew.all.every(inAircraft),
      allSitting: h.crew.all.every((f) => f.pose === 'sit'),
      // Everybody inside the airframe's own envelope: nose to tail is about
      // 24 m, so nobody should be further than 14 m from the CG.
      distances: Object.fromEntries(h.crew.all.map((f) => [f.group.name, +dist(f).toFixed(1)])),
      gunnerInTurret: (() => {
        const seat = h.aircraft.anchors.rearGunSeat;
        const g = h.crew.shubes.group.position;
        return Math.hypot(g.x - seat.x, g.z - seat.z) < 1.2;
      })(),
      bombardierInNose: (() => {
        const st = h.aircraft.anchors.bombardierStation;
        const g = h.crew.numbskull.group.position;
        return Math.hypot(g.x - st.x, g.z - st.z) < 1.5;
      })(),
    };
  });
  check('all four crew are seated inside the airframe — Shubes in the tail turret, Numbskull in the nose',
    seated.allParented && seated.allSitting && seated.gunnerInTurret && seated.bombardierInNose
      && Object.values(seated.distances).every((d) => d < 14),
    JSON.stringify(seated));

  /* ---- The rear gun exists as a station, and it moves ---- */
  const gunStation = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const a = h.aircraft;
    const before = a.parts.rearGunTurret.rotation.y;
    h.tick(2.2);   // the idle sweep
    const swept = Math.abs(a.parts.rearGunTurret.rotation.y - before) > 0.02;
    // Now fire it, off the mission's own state rather than by poking the mesh.
    h.mission.gunFiring = true;
    h.mission.gunAim.set(h.physics.position.x - 600, h.physics.position.y - 300, h.physics.position.z);
    /* Sampled across the burst rather than at the end of it: the muzzle flash
     * is a few frames long on a twelve-rounds-a-second cadence, so a single
     * reading after the fact lands between shots more often than not. */
    let flashPeak = 0;
    for (let i = 0; i < 40; i++) {
      h.tick(1 / 60);
      flashPeak = Math.max(flashPeak, ...a.parts.gunFlash.map((f) => f.material.opacity));
    }
    const flashLit = flashPeak > 0.2;
    const aimed = Math.abs(a.parts.rearGunTurret.rotation.y) > 0.001;
    h.mission.gunFiring = false;
    h.tick(0.2);
    return {
      hasStation: !!a.parts.rearGunStation,
      barrels: a.parts.gunBarrels.length,
      flashes: a.parts.gunFlash.length,
      swept,
      flashLit,
      flashPeak: +flashPeak.toFixed(2),
      aimed,
      seatAnchor: !!a.anchors.rearGunSeat,
      muzzleAnchor: !!a.anchors.rearGunMuzzle,
    };
  });
  check('the rear gun is a real station: twin barrels, muzzle flashes, an idle sweep and an aimed burst',
    gunStation.hasStation && gunStation.barrels === 2 && gunStation.flashes === 2
      && gunStation.swept && gunStation.flashLit && gunStation.aimed
      && gunStation.seatAnchor && gunStation.muzzleAnchor,
    JSON.stringify(gunStation));

  /* ---- Squatchbourg is built, instanced, and inside its draw-call budget ---- */
  const cityBuilt = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const s = h.city.stats();
    let instanced = 0;
    let meshes = 0;
    h.city.group.traverse((o) => {
      if (o.isInstancedMesh) instanced++;
      else if (o.isMesh) meshes++;
    });
    /* The real frame cost, measured rather than asserted from the source: put
     * the camera over the city, render one frame, and read the renderer's own
     * counters. This is what "performance matters" has to mean for a browser
     * game — a number, from a render, not a claim about instancing. */
    const before = { calls: h.renderer.info.render.calls, tris: h.renderer.info.render.triangles };
    const cam = h.camera;
    const savedPos = cam.position.clone();
    const savedQuat = cam.quaternion.clone();
    cam.position.set(h.city.x - 1400, h.city.groundY + 900, h.city.z);
    cam.lookAt(h.city.x, h.city.groundY, h.city.z);
    h.renderer.info.reset();
    h.renderer.render(h.scene, cam);
    const overCity = { calls: h.renderer.info.render.calls, tris: h.renderer.info.render.triangles };
    cam.position.copy(savedPos);
    cam.quaternion.copy(savedQuat);
    return { ...s, instanced, meshes, destroyed: h.city.destroyed, before, overCity };
  });
  check('Squatchbourg is an extensive instanced city, not a few hundred separate meshes',
    cityBuilt.buildings > 400 && cityBuilt.instanced >= 3 && cityBuilt.meshes < 90
      && cityBuilt.streetLights > 100 && !cityBuilt.destroyed,
    JSON.stringify({ ...cityBuilt, before: undefined, overCity: undefined }));

  check('a whole frame with the city filling it stays inside a browser-game budget',
    cityBuilt.overCity.calls < 120 && cityBuilt.overCity.tris < 400000,
    `${cityBuilt.overCity.calls} draw calls, ${cityBuilt.overCity.tris} triangles for the whole scene from 3000 ft over the target`);

  /* ---- Cockpit preflight: all four engines start, brakes off, clears to taxi ---- */
  const engineStart = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.engines.masterBattery = true;
    h.engines.fuelSelectors = true;
    h.input.throttle = 0.15;
    h.engines.crank(2);        // "three and four are yours, Prospect"
    h.engines.crank(3);
    h.tick(5);
    h.input.parkingBrake = false;
    h.tick(1);
    return {
      running: h.engines.engines.map((e) => e.running),
      engineStartBeat: h.dialogue.seen('preflight.engineStart'),
      phase: h.mission.phase,
    };
  });
  check('all four engines start, the start-sequence beat plays, and preflight clears to taxi',
    engineStart.running.every(Boolean) && engineStart.engineStartBeat
      && engineStart.phase === 'taxi',
    JSON.stringify(engineStart));

  /* ---- Takeoff: real thrust from all four engines (the config.js design
   * note flags that only engines 0/1 fed physics unless engineNames encode
   * left/right — this proves both banks actually push). ---- */
  const takeoff = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('takeoff');
    const phaseAtStart = h.mission.phase;
    h.input.key('KeyW', true);
    h.input.throttle = 1;
    h.tick(8);
    h.input.key('KeyW', false);
    return {
      phaseAtStart,
      thrustL: h.physics.thrustL,
      thrustR: h.physics.thrustR,
      ias: h.physics.ias,
      groundSpeed: h.physics.groundSpeed,
    };
  });
  check('go("takeoff") stages the runway, and all four engines produce real thrust under full power',
    takeoff.phaseAtStart === 'takeoff' && takeoff.thrustL > 1000 && takeoff.thrustR > 1000
      && (takeoff.ias > 5 || takeoff.groundSpeed > 5),
    JSON.stringify(takeoff));

  /* Shortcut: an unassisted headless takeoff roll/rotation is a flight-model
   * timing question (already covered by `npm run check:flight`'s tuning
   * tests), not a wiring one — jump the remaining roll/rotate/liftoff. */
  const climbTurnEntry = await page.evaluate(() => window.__enolaSquatch.go('climbTurn'));
  check('go("climbTurn") reaches the climb-out phase', climbTurnEntry === 'climbTurn');

  /* ---- Climb/turn: the real past-the-turn-point + heading-hold logic. ---- */
  const turnBeat = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(6); // physically crosses TURN_POINT.z heading south, per go('climbTurn')'s pose
    return { turnCalled: h.mission.flags.turnCalled, sawTurnLine: h.dialogue.seen('climb.turn.east') };
  });
  check('crossing the real turn point fires the turn-onto-090 beat',
    turnBeat.turnCalled && turnBeat.sawTurnLine, JSON.stringify(turnBeat));

  const cruiseEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Heading-hold-for-2.5s is exercised for real; only the turn maneuver
    // itself is short-circuited by setting the heading directly.
    h.physics.setPose(h.physics.position.clone(), 90, Math.max(h.physics.velocity.length(), 60));
    h.tick(4);
    return h.mission.phase;
  });
  check('holding 090 for real transitions climbTurn into cruise', cruiseEntry === 'cruise', cruiseEntry);

  /* ---- Cruise: a real nav-correction bark when off-heading. ---- */
  const navBark = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.physics.setPose(h.physics.position.clone(), 90 + 40, h.physics.velocity.length());
    h.tick(10); // clears cruise.settle's own queue and the 4s nav-call cooldown
    return {
      navOffCourse: h.mission.flags.navOffCourse,
      sawCorrection: h.dialogue.seen('nav.left5') || h.dialogue.seen('nav.right5') || h.dialogue.seen('nav.wrongWay'),
    };
  });
  check('flying 40 degrees off the 090 corridor fires a real Irish heading-correction bark',
    navBark.navOffCourse && navBark.sawCorrection, JSON.stringify(navBark));

  /* ---- Detection corridor: real exposure/attention accumulation, then a
   * real, unassisted straight-line crossing into the compound's defenses. ---- */
  const detectionEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.physics.setPose(h.physics.position.clone(), 90, h.physics.velocity.length());
    const phase = h.go('detection');
    return { phase, active: h.detection.active, state: h.detection.state };
  });
  check('go("detection") deploys the corridor patrol/radar stealth meter',
    detectionEntry.phase === 'detection' && detectionEntry.active
      && ['unnoticed', 'searching', 'located'].includes(detectionEntry.state),
    JSON.stringify(detectionEntry));

  const throughCorridor = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Hands-off flight is not trimmed for this loaded, heavy four-engine
    // bomber (per config.js's design note) — with no elevator input at all
    // it noses over into a dive within seconds, same as a real untrimmed
    // aircraft would. A light, duty-cycled climb input (20% of each second)
    // is the same real control the cockpit exposes, just automated rather
    // than held by a human hand, and is what keeps 40 real, physically
    // integrated seconds of forward flight clear of the ground.
    h.input.throttle = 0.85;
    for (let i = 0; i < 40; i++) {
      h.input.key('KeyS', true);
      h.tick(0.2);
      h.input.key('KeyS', false);
      h.tick(0.8);
    }
    return { phase: h.mission.phase, x: h.physics.position.x, agl: h.physics.agl, failed: h.mission.failed };
  });
  check('flying the real corridor for real clears past it into the compound\'s defenses',
    throughCorridor.phase === 'defense' && !throughCorridor.failed, JSON.stringify(throughCorridor));

  /* ---- Defense: the damage API affects real state without crashing. ---- */
  const defenseDamage = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const before = h.engines.engines[0].health;
    h.defense.damageEngine(0);
    h.defense.damageRudder();
    h.defense.damageElectrical();
    h.defense.damageFuel();
    h.tick(1);
    return {
      damage: { ...h.defense.damage, engines: h.defense.damage.engines.slice() },
      engineHealthDropped: h.engines.engines[0].health < before,
      sawHitLine: h.dialogue.seen('defense.hit'),
      phase: h.mission.phase,
    };
  });
  /* ---- The rear gunner works the gun off the mission's own state ---- */
  const gunnerOrganic = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    let firedFrames = 0;
    let maxYaw = 0;
    for (let i = 0; i < 480; i++) {
      h.tick(1 / 60);
      if (h.mission.gunFiring) firedFrames++;
      maxYaw = Math.max(maxYaw, Math.abs(h.aircraft.anim.gunYaw));
    }
    return {
      firedFrames,
      maxYaw: +maxYaw.toFixed(3),
      defenseState: h.defense.state,
      openBeat: h.dialogue.seen('defense.gunner.open'),
      readyBeat: h.dialogue.seen('defense.gunner.on'),
    };
  });
  check('the Shubenator works the rear gun for real during the defence phase, in bursts',
    gunnerOrganic.firedFrames > 30 && gunnerOrganic.firedFrames < 460
      && gunnerOrganic.openBeat && gunnerOrganic.maxYaw > 0.01,
    JSON.stringify(gunnerOrganic));

  check('Defense\'s damage API flips real state, damages the engine, and plays the hit beat without crashing',
    defenseDamage.damage.engines[0] === true && defenseDamage.damage.rudder
      && defenseDamage.damage.electrical && defenseDamage.damage.fuel
      && defenseDamage.engineHealthDropped && defenseDamage.sawHitLine
      && defenseDamage.phase === 'defense',
    JSON.stringify(defenseDamage));

  /* Shortcut: the rest of the run to the target is straight, undamaging
   * flight already proven above (corridor crossing) — jump to the approach. */
  const bombApproachEntry = await page.evaluate(() => window.__enolaSquatch.go('bombApproach'));
  check('go("bombApproach") stages the bombing run', bombApproachEntry === 'bombApproach');

  const targetingReal = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(1);
    return {
      onHeading: h.targeting.onHeading,
      onAltitude: h.targeting.onAltitude,
      distance: h.targeting.distance,
    };
  });
  check('Targeting really reads the staged approach as on heading and on altitude',
    targetingReal.onHeading && targetingReal.onAltitude && Number.isFinite(targetingReal.distance),
    JSON.stringify(targetingReal));

  const bombMalfunctionEntry = await page.evaluate(() => window.__enolaSquatch.go('bombMalfunction'));
  check('go("bombMalfunction") stages the bomb-bay-doors-stuck beat', bombMalfunctionEntry === 'bombMalfunction');

  const releaseEntry = await page.evaluate(() => window.__enolaSquatch.go('release'));
  check('go("release") arms the release choice', releaseEntry === 'release');

  /* ---- Release: a real 1-5 choice, the payload actually detaches, mass drops. ---- */
  const beforeMass = await page.evaluate(() => window.__enolaSquatch.physics.mass);
  const release = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const before = { released: h.payload.released, mass: h.physics.mass };
    const chose = h.mission.chooseReleaseLine('3'); // "Lou sends his regards."
    h.tick(4); // stuck -> kick -> payload.release()
    return {
      chose,
      before,
      released: h.payload.released,
      afterMass: h.physics.mass,
      phase: h.mission.phase,
      payloadReleasedFlag: h.mission.payloadReleased,
    };
  });
  check('choosing release line 3 via chooseReleaseLine actually detaches the Fat Squatch and drops the mass',
    release.chose && !release.before.released && release.released
      && release.payloadReleasedFlag
      && (release.before.mass - release.afterMass) > 2000
      && release.phase === 'explosion',
    JSON.stringify({ ...release, deltaMass: release.before.mass - release.afterMass }));
  check('the mass drop matches the Fat Squatch\'s payload mass',
    Math.abs((beforeMass - release.afterMass) - 2700) < 5,
    JSON.stringify({ beforeMass, afterMass: release.afterMass }));

  /* ---- The whistle starts the moment the payload leaves the mount ---- */
  const whistle = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    return {
      // `ready` is false when the browser gave us no AudioContext at all, in
      // which case there is nothing to assert about a sound — but the mission
      // must still have ASKED for it, which is what `_fallSeconds` records.
      audioReady: !!h.audio.ready,
      whistling: !!h.audio.whistling,
      fallSeconds: h.mission._fallSeconds ?? null,
      saidFalling: h.dialogue.seen('bomb.falling') || h.dialogue.queue.some((l) => l.beat === 'bomb.falling'),
    };
  });
  check('releasing the Fat Squatch starts the falling whistle, timed to the real length of the fall',
    typeof whistle.fallSeconds === 'number' && whistle.fallSeconds > 3 && whistle.fallSeconds < 20
      && (!whistle.audioReady || whistle.whistling),
    JSON.stringify(whistle));

  /* ---- Let the payload actually fall and detonate for real, then escape.
   * Escape's own gate needs `p.agl > 220`, and the beat is literally "climb,
   * bank, and don't look at it" — hold real climb input throughout, the same
   * trim reasoning as the corridor crossing above.
   *
   * The explosion phase runs 18 s now rather than 4.2 (the mushroom cap does
   * not finish rising until about 11), so this flies the whole of it. ---- */
  const explosionReal = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.input.throttle = 0.9;
    const seen = { flashPeak: 0, fireballPeak: 0, debris: 0, lightPeak: 0 };
    // Same duty-cycled climb input as the corridor crossing above (KeyS is
    // this flight model's nose-up — verified empirically, see this phase's
    // report) — held while the payload really falls and the VFX plays.
    for (let i = 0; i < 34; i++) {
      h.input.key('KeyS', true);
      h.tick(0.25);
      h.input.key('KeyS', false);
      h.tick(0.75);
      const vfx = h.mission._explosionVfx;
      if (vfx) {
        seen.flashPeak = Math.max(seen.flashPeak, vfx.flash.scale.x);
        seen.fireballPeak = Math.max(seen.fireballPeak, ...vfx.fire.map((b) => b.scale.x));
        seen.lightPeak = Math.max(seen.lightPeak, vfx.light.intensity);
        seen.debris = Math.max(seen.debris, vfx.debris.length);
      }
    }
    return {
      impacted: h.payload.impacted,
      bombAccuracy: h.mission.score.bombAccuracy,
      phase: h.mission.phase,
      agl: h.physics.agl,
      failed: h.mission.failed,
      whistleStopped: !h.audio.whistling,
      seen,
    };
  });
  check('the Fat Squatch really falls, really impacts, and the mission really moves through explosion into escape',
    explosionReal.impacted && typeof explosionReal.bombAccuracy === 'number'
      && explosionReal.phase === 'escape' && !explosionReal.failed
      && explosionReal.whistleStopped,
    JSON.stringify({ ...explosionReal, seen: undefined }));

  check('the detonation is on the scale the brief asked for: a huge flash, a real light, a fireball and a debris fan',
    explosionReal.seen.flashPeak > 500 && explosionReal.seen.fireballPeak > 400
      && explosionReal.seen.lightPeak > 1e5 && explosionReal.seen.debris >= 30,
    JSON.stringify(explosionReal.seen));

  /* ---- The crater: the city is gone, the ground is a hole, and physics knows ---- */
  const crater = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const c = h.crater;
    if (!c) return { crater: false };
    const centreNow = h.groundHeight(c.x, c.z);
    // Buildings inside the lip have to be gone. Sample the instance matrices.
    const buildings = h.city.parts.buildings;
    const m = new Float32Array(16);
    let insideAlive = 0;
    for (let i = 0; i < buildings.count; i++) {
      buildings.instanceMatrix.array.slice(i * 16, i * 16 + 16).forEach((v, k) => { m[k] = v; });
      const bx = m[12] + h.city.x;
      const bz = m[14] + h.city.z;
      const scaleY = Math.hypot(m[4], m[5], m[6]);
      if (Math.hypot(bx - c.x, bz - c.z) < c.radius * 0.9 && scaleY > 1) insideAlive++;
    }
    return {
      crater: true,
      cityDestroyed: h.city.destroyed,
      radius: c.radius,
      depth: c.depth,
      centreDrop: +(c.groundY - centreNow).toFixed(1),
      /* The hole has an edge: the profile is a real bowl with a raised lip
       * that runs out to exactly nothing, rather than an infinite depression
       * dragging the whole map down with it. */
      lipRise: +h.craterOffsetAt(c.radius + 1).toFixed(1),
      zeroBeyondLip: h.craterOffsetAt(c.radius + 400) === 0,
      craterMeshInScene: !!c.mesh.parent,
      insideAlive,
      streetsHidden: h.city.parts.streets.visible === false,
    };
  });
  check('the city is gone and a giant crater is in its place — in the mesh AND in the ground the aeroplane flies over',
    crater.crater && crater.cityDestroyed && crater.craterMeshInScene
      && crater.centreDrop > 80 && crater.insideAlive === 0 && crater.streetsHidden
      && crater.lipRise > 5 && crater.zeroBeyondLip,
    JSON.stringify(crater));

  /* ---- Escape naturally finds the engine damaged earlier and offers the
   * emergency choice; resolve it with 'baby' (no forced effect, so the
   * scripted overheat decays on its own rather than getting stuck). ---- */
  const emergencyEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    for (let i = 0; i < 12; i++) {
      h.input.key('KeyS', true);
      h.tick(0.25);
      h.input.key('KeyS', false);
      h.tick(0.75);
    } // escape's own 10s + margin decides emergency-or-return
    return {
      phase: h.mission.phase,
      engineHit: h.defense.damage.engines.findIndex(Boolean),
      agl: h.physics.agl,
      failed: h.mission.failed,
    };
  });
  check('escape finds the engine damaged during the defense phase and offers the emergency choice',
    emergencyEntry.phase === 'emergency' && emergencyEntry.engineHit >= 0 && !emergencyEntry.failed,
    JSON.stringify(emergencyEntry));

  const emergencyResolved = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const chose = h.mission.chooseEmergencyResponse('baby');
    h.tick(75); // the scripted overheat (70s) has to decay before return
    return { chose, phase: h.mission.phase };
  });
  check('choosing the emergency response resolves it and the mission moves on to return',
    emergencyResolved.chose && emergencyResolved.phase === 'return',
    JSON.stringify(emergencyResolved));

  /* ---- Return / landing: a real touchdown, a real grade. ---- */
  const landing = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('landing'); // stages a real touchdown pose on runway 18
    h.tick(2);        // registers the touchdown and grades it for real
    return {
      phase: h.mission.phase,
      finalLanding: h.mission.score.finalLanding,
      perfect: h.dialogue.seen('landing.perfect'),
      hard: h.dialogue.seen('landing.hard'),
    };
  });
  check('landing grades a real touchdown and reports a perfect-or-hard result',
    typeof landing.finalLanding === 'number' && landing.finalLanding >= 0 && landing.finalLanding <= 1
      && (landing.perfect || landing.hard) && landing.phase === 'epilogue',
    JSON.stringify(landing));

  /* ---- Epilogue / the report card. ---- */
  const epilogue = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(9);
    return { finished: h.mission.finished, report: h.mission.finished ? h.mission.report() : null };
  });
  check('the epilogue completes the mission and produces a real report card',
    epilogue.finished && epilogue.report
      && typeof epilogue.report.rank === 'string'
      && Array.isArray(epilogue.report.stats) && epilogue.report.stats.length > 0,
    JSON.stringify({ finished: epilogue.finished, rank: epilogue.report?.rank, tier: epilogue.report?.tier }));

  check('no runtime console/page errors occurred across the whole run', problems.length === 0, problems.join(' | '));

  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}

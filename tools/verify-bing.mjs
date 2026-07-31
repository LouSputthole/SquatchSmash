#!/usr/bin/env node
/**
 * Play the Bing, headlessly, from the lot to the ending card.
 *
 *   node tools/verify-bing.mjs        (npm run verify:bing)
 *
 * The club is a state machine wired to a building: a door being open changes
 * what you can hear, walking into a room advances an objective, and Lou does
 * not put the package on the desk until the conversation has got there. None
 * of that shows up in a syntax check, and all of it breaks silently -- the
 * failure mode is a player standing in an office where nothing happens.
 *
 * So this drives the real systems in a real browser: it starts the game,
 * walks the player through every beat, and asserts the mission state at each
 * one. It steps the update functions directly rather than waiting on frames,
 * because software rendering runs at about one frame a second and the point
 * here is the logic, not the pixels.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5199;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the club.');
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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
/* Small viewport: every pixel here is drawn on the CPU. */
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const failedToLoad = await page.evaluate(() => {
  const el = document.getElementById('loading');
  return el?.classList.contains('failed') ? el.textContent : null;
});
if (failedToLoad) {
  console.error(`The club did not load: ${failedToLoad}`);
  await browser.close();
  server.close();
  process.exit(1);
}

await page.click('#start-btn');
/* Starting loads the whole sample bank, which is several hundred files. */
await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 90000 });
await page.evaluate(() => window.__bing.postfx.disable?.());

/** Step the game's own update path for `secs` of simulated time. */
async function tick(secs = 1, step = 0.25) {
  await page.evaluate(([secs, step]) => {
    const b = window.__bing;
    for (let t = 0; t < secs; t += step) {
      b.player.update(step);
      b.dialogue.update(step, b.player.position);
      b.mission.update(step);
      b.slots.update(step);
      b.blackjack.update(step);
      b.club.update(step, b.player.position);
      b.game.drive?.(step);
    }
  }, [secs, step]);
}

async function walkTo(x, z, yaw = 0) {
  await page.evaluate(([x, z, yaw]) => {
    const b = window.__bing;
    b.game.seatedIn = null;
    b.player.mode = 'walk';
    b.player._tween = null;
    b.player.yawCenter = null;
    b.player.position.set(x, 1.66, z);
    b.player.yaw = yaw;
    b.player.update(0.016);
  }, [x, z, yaw]);
  await tick(0.5);
}

const state = () => page.evaluate(() => {
  const b = window.__bing;
  return {
    mission: b.mission.state,
    room: b.club.roomAt(b.player.position.x, b.player.position.z),
    objectives: b.mission.objectives.map((o) => `${o.done ? 'x' : ' '}${o.id}`),
    flags: { ...b.mission.flags },
    money: b.game.money,
    options: b.dialogue.active ? b.dialogue.options.length : -1,
    inventory: b.inventory.items.filter(Boolean),
    carrying: b.game.carrying ?? null,
    campaign: b.campaign?.state ?? null,
    hands: b.mission.hands,
    spins: b.mission.spins,
  };
});

const choose = async (i) => {
  await page.evaluate((i) => window.__bing.dialogue.choose(i), i);
  await tick(3);
};

/* The felt's three sounds are authored as manifest cues, not generated here:
 * the WebAudio synth stands in for any that have no file yet. */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const cues = new Map((manifest.sfx || []).map((cue) => [cue.name, cue]));
  check('the felt’s three sound cues are authored in the manifest',
    ['card.deal', 'card.flip', 'chip.stack'].every((name) => (cues.get(name)?.prompt || '').length > 20));
}

console.log('Driving the mission…');

let s = await state();
check('starts behind the wheel in the lot', s.mission === 'lot', s.mission);
/* Three things the evening is for, and none of them ticked in the lot. The
 * club's own optional list is separate and lives on the HUD card, not on the
 * mission -- it is checked further down against the rendered objectives. */
check('the night opens on its three jobs, none of them done',
  s.objectives.join(',') === ' lou, margo, shot', s.objectives.join(','));
const displayedDay = await page.textContent('#clock .day');
check('the first Bing visit is still Day One', displayedDay === 'Day 1', displayedDay);

/* ---- the lot, the parked cars, and getting out safely ---- */
const vehicles = await page.evaluate(() => {
  const b = window.__bing;
  const entries = [
    ['player', b.car],
    ...b.lot.cars.map((vehicle, i) => [`parked-${i}`, vehicle]),
    ['lou', b.lot.lou],
    ['watchers', b.lot.watchers],
  ];
  const measured = entries.map(([id, vehicle]) => {
    vehicle.group.updateMatrixWorld(true);
    const box = new b.THREE.Box3().setFromObject(vehicle.group);
    const c = vehicle.worldCollider;
    return {
      id,
      x: vehicle.group.position.x,
      z: vehicle.group.position.z,
      min: box.min.toArray(),
      max: box.max.toArray(),
      grounded: Math.abs(box.min.y) < 0.015,
      contained: !!c
        && c.min.x <= box.min.x && c.max.x >= box.max.x
        && c.min.z <= box.min.z && c.max.z >= box.max.z
        && c.max.y >= box.max.y,
    };
  });
  const overlaps = [];
  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = measured[i];
      const c = measured[j];
      const overlapX = Math.min(a.max[0], c.max[0]) - Math.max(a.min[0], c.min[0]);
      const overlapZ = Math.min(a.max[2], c.max[2]) - Math.max(a.min[2], c.min[2]);
      if (overlapX > 0.02 && overlapZ > 0.02) overlaps.push(`${a.id}/${c.id}`);
    }
  }
  const bayCentred = measured
    .filter((v) => v.id === 'player' || v.id.startsWith('parked-'))
    .every((v) => {
      const col = Math.round((v.x + 23.7) / 4.6);
      return Math.abs(v.x - (-23.7 + col * 4.6)) < 0.01
        && (Math.abs(v.z - 25) < 0.01 || Math.abs(v.z - 35) < 0.01);
    });
  return {
    count: measured.length,
    overlaps,
    grounded: measured.every((v) => v.grounded),
    contained: measured.every((v) => v.contained),
    bayCentred,
    playerColliderLive: b.club.colliders.includes(b.car.worldCollider),
  };
});
check('all eighteen vehicles are grounded and separated',
  vehicles.count === 18 && vehicles.grounded && vehicles.overlaps.length === 0,
  JSON.stringify(vehicles.overlaps));
check('every visible car is contained by its matching collider',
  vehicles.contained && vehicles.playerColliderLive);
check('the ordinary parked cars sit on the painted bay centres', vehicles.bayCentred);

await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })));
await tick(1.2, 0.1);
const carExit = await page.evaluate(() => {
  const b = window.__bing;
  return {
    seated: b.game.seatedIn,
    mode: b.player.mode,
    safe: b.standingClearAt(b.player.position.x, b.player.position.z),
    room: b.club.roomAt(b.player.position.x, b.player.position.z),
    x: b.player.position.x,
    z: b.player.position.z,
  };
});
check('getting out of the car lands on validated clear ground',
  carExit.seated === null && carExit.mode === 'walk' && carExit.safe && carExit.room === 'lot',
  JSON.stringify(carExit));

/* The open portal must be visually clear as well as collider-clear. */
const frontPortal = await page.evaluate(() => {
  const b = window.__bing;
  const door = b.club.doors.front;
  if (!door.open) door.toggle();
  door._t = door.swing;
  door.pivot.rotation.y = door.swing;
  b.scene.updateMatrixWorld(true);
  const ray = new b.THREE.Raycaster(
    new b.THREE.Vector3(0, 1.35, 15.8),
    new b.THREE.Vector3(0, 0, -1),
    0,
    1.0,
  );
  const hits = ray.intersectObject(b.club.root, true).filter((hit) => {
    if (!hit.object.visible) return false;
    // Rain and other particle fields are Points, not opaque portal geometry.
    // They can intersect at distance zero when a randomized particle spawns
    // on the ray origin, which made this visual-clearance assertion flaky.
    if (!hit.object.isMesh) return false;
    const materials = Array.isArray(hit.object.material)
      ? hit.object.material : [hit.object.material];
    return materials.some((m) => m?.visible !== false && (m.opacity ?? 1) > 0.05);
  });
  const collisionClear = b.standingClearAt(0, 15.42);
  door.toggle();
  door._t = 0;
  door.pivot.rotation.y = 0;
  return {
    collisionClear,
    hits: hits.map((hit) => ({
      name: hit.object.name || hit.object.type,
      distance: Number(hit.distance.toFixed(3)),
    })),
  };
});
check('the open front door reveals a clear vestibule portal',
  frontPortal.collisionClear && frontPortal.hits.length === 0,
  JSON.stringify(frontPortal));

/* ---- the bouncer ---- */
await walkTo(0, 13, Math.PI);
await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.start(b.scripts.bouncer, 'open', b.cast.byName.bouncer);
});
await tick(1);
s = await state();
check('the bouncer offers four answers', s.options === 4, String(s.options));
await choose(0);
await tick(4);
check('and lets you in', (await state()).flags.bouncerCleared === true);

/* ---- the rest of the club ----
 * These are the things the mission does not need and the player will do
 * anyway: a door, a drink, a chair, a tip. Each one has broken at least once.
 */
await tick(6);
check('a conversation ends by itself', !(await page.evaluate(() => window.__bing.dialogue.active)));

const people = await page.evaluate(() => {
  const b = window.__bing;
  const performers = Object.entries(b.cast.byName)
    .filter(([key]) => key.startsWith('performer'))
    .map(([, npc]) => {
      const names = [];
      let finite = true;
      npc.group.updateMatrixWorld(true);
      npc.group.traverse((o) => {
        if (o.name) names.push(o.name);
        if (o.matrix?.elements?.some((v) => !Number.isFinite(v))) finite = false;
      });
      const size = new b.THREE.Box3().setFromObject(npc.group).getSize(new b.THREE.Vector3());
      const required = [
        'performer.bikini-top.left',
        'performer.bikini-top.right',
        'performer.bikini-bottom.rear.left',
        'performer.bikini-bottom.rear.right',
        'performer.bikini-top.band',
        'performer.bikini-bottom.band',
      ];
      return {
        profile: npc.group.userData.npc,
        requiredMeshes: required.every((name) => names.includes(name)),
        finite,
        height: size.y,
      };
    });

  const drinkers = b.cast.all.filter((npc) => npc.job === 'drink').map((npc) => {
    npc.group.updateMatrixWorld(true);
    const bounds = new b.THREE.Box3().setFromObject(npc.group);
    return {
      seated: npc.seated,
      dropped: npc.group.position.y < npc.baseY,
      floor: bounds.min.y,
    };
  });
  const movers = b.cast.all.filter((npc) => npc.job === 'patrol' || npc.job === 'dance');
  for (let i = 0; i < 180; i++) {
    for (const npc of movers) npc.update(1 / 30, b.player.position);
  }
  const patrolsClear = movers
    .filter((npc) => npc.job === 'patrol' && npc.group.visible)
    .every((npc) => npc._navClear(npc.group.position.x, npc.group.position.z));
  let nonHeroShadowCasters = 0;
  for (const npc of b.cast.all) {
    if (npc.tier === 'hero') continue;
    npc.group.traverse((o) => {
      if (o.isMesh && o.castShadow) nonHeroShadowCasters += 1;
    });
  }
  return {
    count: b.cast.all.length,
    performers,
    drinkers,
    moversSmooth: movers.every((npc) => npc._every <= 1 / 30 + 1e-6),
    patrolsClear,
    nonHeroShadowCasters,
  };
});
check('the full nightclub population remains present', people.count >= 30, String(people.count));
check('all stage performers are tagged adult female curvy bikini performers',
  people.performers.length === 4
    && people.performers.every((p) => p.profile.role === 'performer'
      && p.profile.adult === true
      && p.profile.gender === 'female'
      && p.profile.bodyShape === 'curvy'
      && p.profile.outfit === 'bikini'
      && p.requiredMeshes
      && p.finite
      && p.height > 1.55 && p.height < 1.95),
  JSON.stringify(people.performers));
check('drink animations begin from a real seated, floor-safe pose',
  people.drinkers.length > 0
    && people.drinkers.every((p) => p.seated && p.dropped && p.floor > -0.08),
  JSON.stringify(people.drinkers));
check('walking and dancing NPCs update smoothly and patrol clear of furniture',
  people.moversSmooth && people.patrolsClear);
check('ambient and background people no longer multiply shadow passes',
  people.nonHeroShadowCasters === 0, String(people.nonHeroShadowCasters));

/* ---- the wave-2 scene pass: stage front, hair, seating, walls ---- */
const scenePass = await page.evaluate(() => {
  const b = window.__bing;
  const guard = b.cast.byName.security;
  const runway = b.club.anchors.runway;
  const stageNav = {
    blockers: b.club.navBlockers.length,
    runwayBlocked: !guard._navClear(runway.x, runway.z),
    deckBlocked: !guard._navClear(-12, -7.2),
    playerStageHeight: b.club.groundAt(-12, -7.2),
    blockersOutOfPlayerWorld: !b.club.colliders.includes(b.club.navBlockers[0]),
  };

  const hairOf = (npc) => {
    const pieces = [];
    npc.group.traverse((o) => {
      if (o.isMesh && /^person\.hair\./.test(o.name)) pieces.push(o);
    });
    return pieces;
  };
  const blondePieces = hairOf(b.cast.byName.performer3);
  const hairShaped = Object.entries(b.cast.byName)
    .filter(([key]) => key.startsWith('performer'))
    .every(([, npc]) => hairOf(npc).length >= 2);

  let chain = false;
  let pendant = false;
  b.cast.byName.lou.group.traverse((o) => {
    if (o.name === 'necklace.chain') chain = true;
    if (o.name === 'necklace.pendant') pendant = true;
  });

  const patronsSeated = [];
  for (let i = 0; i < 6; i++) {
    const patron = b.cast.byName[`patron${i}`];
    if (!patron) continue;
    const { x, z } = patron.group.position;
    patronsSeated.push(x > 0
      ? x > 4.18 && x < 4.92        // on an east bench, not in its table
      : z > 10.63 && z < 11.37);    // pushed back onto a north bench
  }

  const toilets = [];
  b.scene.traverse((o) => {
    if (o.name !== 'toilet') return;
    const p = new b.THREE.Vector3();
    o.getWorldPosition(p);
    if (p.x < 7.9 || p.x > 13.9 || p.z < -1.4 || p.z > 2.7) return;
    let water = false;
    o.traverse((m) => { if (m.isMesh && m.material?.isMeshPhysicalMaterial) water = true; });
    toilets.push(water);
  });

  return {
    stageNav,
    blondeHair: blondePieces[0]?.material.color.getHex() ?? null,
    blondePieceCount: blondePieces.length,
    hairShaped,
    chain,
    pendant,
    patronsSeated: patronsSeated.length === 6 && patronsSeated.every(Boolean),
    archClear: b.standingClearAt(4.7, 3.4),
    monitorMounted: b.club.office.monitor.position.x > 13.3,
    toilets,
    duckWaiting: !!b.club.storeroom?.duck && b.club.storeroom.duck.visible === false,
  };
});
check('the stage front blocks the crowd but still takes the player',
  scenePass.stageNav.blockers === 3
    && scenePass.stageNav.runwayBlocked
    && scenePass.stageNav.deckBlocked
    && scenePass.stageNav.playerStageHeight > 0.5
    && scenePass.stageNav.blockersOutOfPlayerWorld,
  JSON.stringify(scenePass.stageNav));
check('the runway is the blonde’s and every performer wears shaped hair',
  scenePass.blondeHair === 0xdcb04a && scenePass.blondePieceCount >= 3 && scenePass.hairShaped,
  `hair #${(scenePass.blondeHair ?? 0).toString(16)}, ${scenePass.blondePieceCount} pieces`);
check('Lou’s chain drapes to a pendant lying on his chest',
  scenePass.chain && scenePass.pendant);
check('booth patrons sit on the benches, not in the tables',
  scenePass.patronsSeated);
check('the arch to the back of house is clear of booth colliders',
  scenePass.archClear);
check('the office monitor hangs from its wall bracket',
  scenePass.monitorMounted);
check('three real toilets with water in the bowls stand in the stalls',
  scenePass.toilets.length === 3 && scenePass.toilets.every(Boolean),
  JSON.stringify(scenePass.toilets));
check('the duck waits unfound in the store room',
  scenePass.duckWaiting);

const acoustics = await page.evaluate(() => {
  const b = window.__bing;
  const calls = [];
  const originalSetLoopVolume = b.audio.setLoopVolume;
  b.audio.setLoopVolume = function setLoopVolumeSpy(...args) {
    calls.push(args);
    return originalSetLoopVolume.apply(this, args);
  };
  const setDoor = (door, open) => {
    if (door.open !== open) door.toggle();
    door._t = open ? door.swing : 0;
    door.pivot.rotation.y = door._t;
  };
  setDoor(b.club.doors.front, false);
  setDoor(b.club.doors.inner, false);
  b.player.position.set(-0.7, 1.66, 25);
  b.updateZones(0.016);
  const outside = { ...b.game.acoustics };

  setDoor(b.club.doors.front, true);
  b.player.position.set(0, 1.66, 13);
  b.updateZones(0.016);
  const vestibule = { ...b.game.acoustics };

  setDoor(b.club.doors.inner, true);
  b.player.position.set(-8, 1.66, 4);
  b.updateZones(0.016);
  const main = { ...b.game.acoustics };
  const beforeRepeat = calls.length;
  for (let i = 0; i < 60; i++) b.updateZones(0.016);
  const repeatedRamps = calls.length - beforeRepeat;
  const rainVisibleInside = b.club.rain.points.visible;

  b.audio.setLoopVolume = originalSetLoopVolume;
  setDoor(b.club.doors.front, false);
  setDoor(b.club.doors.inner, false);
  return { outside, vestibule, main, repeatedRamps, rainVisibleInside };
});
check('rain settles sharply across the entrance doors',
  acoustics.outside.rain === 0.38
    && acoustics.vestibule.rain <= 0.04
    && acoustics.main.rain <= 0.006
    && acoustics.main.rain < acoustics.outside.rain / 50
    && !acoustics.rainVisibleInside,
  JSON.stringify(acoustics));
check('an unchanged room does not schedule WebAudio ramps every frame',
  acoustics.repeatedRamps === 0, String(acoustics.repeatedRamps));

const doors = await page.evaluate(() => {
  const b = window.__bing;
  const d = b.club.doors.lou;
  const before = b.club.colliders.length;
  d.leaf.userData.interact.onUse();
  const open = { open: d.open, colliders: b.club.colliders.length };
  d.leaf.userData.interact.onUse();
  const locked = b.club.doors.manager;
  locked.leaf.userData.interact.onUse();
  return {
    before, open,
    closed: { open: d.open, colliders: b.club.colliders.length },
    lockedStayedShut: !locked.open,
  };
});
check('a door opens and takes its collider with it',
  doors.open.open && doors.open.colliders === doors.before - 1, JSON.stringify(doors.open));
check('and gives it back on the way closed',
  !doors.closed.open && doors.closed.colliders === doors.before, JSON.stringify(doors.closed));
check('the locked ones stay locked', doors.lockedStayedShut);

/* ---- conversations persist ----
 * Walk off mid-thread and the next talk resumes where it lapsed; only a
 * finished conversation replays from the top. */
await walkTo(-18.5, 2.2, Math.PI / 2);
const resume = await page.evaluate(() => {
  const b = window.__bing;
  const bartender = b.cast.byName.bartender;
  b.dialogue.start(b.scripts.bartender, 'open', bartender, { resume: true });
  b.dialogue.choose(0);                                    // the architecture joke
  for (let i = 0; i < 40 && b.dialogue.nodeId !== 'order'; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  const mid = b.dialogue.nodeId;
  b.dialogue.end('walked-away');
  b.dialogue.start(b.scripts.bartender, 'open', bartender, { resume: true });
  const resumed = b.dialogue.nodeId;
  b.dialogue.choose(0);                                    // club soda; thread completes
  for (let i = 0; i < 40 && b.dialogue.active; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  b.dialogue.start(b.scripts.bartender, 'open', bartender, { resume: true });
  const replayed = b.dialogue.nodeId;
  b.dialogue.end('done');
  return { mid, resumed, replayed };
});
check('a walked-away conversation resumes; a finished one replays',
  resume.mid === 'order' && resume.resumed === 'order' && resume.replayed === 'open',
  JSON.stringify(resume));

/* ---- the floor ---- */
await walkTo(-8, 4, Math.PI);
s = await state();
check('walking in starts Lou waiting', s.mission === 'club', s.mission);

const bar = await page.evaluate(() => {
  const b = window.__bing;
  b.scripts.bartender.order.options[1].effect();          // a beer
  const held = b.game.heldDrink;
  b.game.drinking = 3;                                    // as if [F] had been held
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
  return { held };
});
await tick(3, 0.1);
/* The swallow rides the real frame loop's key handling, which under software
 * rendering can lag the stepped clock — poll up to twenty more simulated
 * seconds instead of racing a single window. This check failed one run in
 * five on the old fixed wait. */
for (let i = 0; i < 20; i++) {
  if (await page.evaluate(() => window.__bing.drunk.level > 0)) break;
  await tick(1, 0.1);
}
check('the bar serves, and the drink lands',
  bar.held === 'beer' && (await page.evaluate(() => window.__bing.drunk.level)) > 0,
  `drunk ${await page.evaluate(() => window.__bing.drunk.level.toFixed(2))}`);

const seat = await page.evaluate(() => {
  const b = window.__bing;
  const spot = b.club.anchors.booths[0];
  b.game.seatedIn = null;
  b.player.position.set(spot.x + 1, 1.66, spot.z);
  b.player.mode = 'walk';
  const pads = [];
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const text = typeof l === 'function' ? l() : l;
    if (text && String(text).includes('booth')) pads.push(o);
  });
  if (!pads.length) return { found: false };
  pads[0].userData.interact.onUse();
  return { found: true, seated: b.game.seatedIn };
});
await tick(2);
check('there is somewhere to sit', seat.found && seat.seated === 'seat', JSON.stringify(seat));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })));
await tick(2);
const stoodFromBooth = await page.evaluate(() => {
  const b = window.__bing;
  return {
    seated: b.game.seatedIn,
    safe: b.standingClearAt(b.player.position.x, b.player.position.z),
    room: b.club.roomAt(b.player.position.x, b.player.position.z),
    x: b.player.position.x,
    z: b.player.position.z,
  };
});
check('and a validated clear way back up',
  stoodFromBooth.seated === null && stoodFromBooth.safe && stoodFromBooth.room === 'main',
  JSON.stringify(stoodFromBooth));

const allSeatExits = await page.evaluate(() => {
  const b = window.__bing;
  const exits = b.club.anchors.booths.map((spot) => {
    const yaw = spot.x > 0 ? Math.PI / 2 : 0;
    const safe = b.findSafeStandSpot(spot, yaw);
    return safe ? { x: safe.x, z: safe.z, clear: b.standingClearAt(safe.x, safe.z) } : null;
  });
  const table = b.findSafeStandSpot(
    b.club.anchors.blackjackSeats[2],
    b.club.anchors.blackjackSeats[2].yaw,
  );
  return {
    exits,
    table: table ? { x: table.x, z: table.z, clear: b.standingClearAt(table.x, table.z) } : null,
  };
});
check('every authored booth and the blackjack seat have a safe egress',
  allSeatExits.exits.length === 9
    && allSeatExits.exits.every((exit) => exit?.clear)
    && allSeatExits.table?.clear,
  JSON.stringify(allSeatExits));

const unstuck = await page.evaluate(() => {
  const b = window.__bing;
  const blocked = b.club.anchors.booths[0];
  b.player._tween = null;
  b.player.mode = 'walk';
  b.player.position.set(blocked.x, 1.66, blocked.z);
  const wasBlocked = !b.standingClearAt(blocked.x, blocked.z);
  const moved = b.recoverIfStuck();
  return {
    wasBlocked,
    moved,
    safe: b.standingClearAt(b.player.position.x, b.player.position.z),
  };
});
check('[Q] unstuck only moves a genuinely blocked walking player',
  unstuck.wasBlocked && unstuck.moved && unstuck.safe,
  JSON.stringify(unstuck));

/* ---- the Family hangout floor ----
 * The owner's order: everyone in the Family table hangs out here between
 * missions, with their real faces, one identity everywhere. Fresh campaign:
 * fifteen on the floor — Sasole is still at Whispering Pines until the Beef
 * Run is flown, and Big Uncle Lou is upstairs, never duplicated. */
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
const familyState = await page.evaluate(() => {
  const b = window.__bing;
  const members = b.family.all.map((npc) => {
    let photoFaces = 0;
    npc.group.updateMatrixWorld(true);
    npc.group.traverse((o) => {
      if (o.isMesh && Array.isArray(o.material) && o.material[4]?.map) photoFaces += 1;
    });
    const { x, z } = npc.group.position;
    return {
      id: npc.characterId,
      photo: npc.familyMember.photo,
      hasFace: photoFaces > 0,
      eyes: npc.parts.eyes.length,
      job: npc.job,
      seated: !!npc.seated,
      standingClear: npc.job === 'stand' ? b.standingClearAt(x, z) : true,
      navClear: npc._clearOf(b.club.navBlockers, x, z),
      interactive: !!npc.group.userData.interact,
    };
  });
  return {
    members,
    ids: members.map((m) => m.id).sort(),
    faces: [...b.faceIndex].sort(),
  };
});
{
  const expected = ['ape', 'booski', 'deathmegatron', 'eric', 'gratin', 'hogmama',
    'irish', 'lag', 'numbskull', 'old_stove', 'rippinflow', 'seff',
    'shubenator', 'snow', 'willy'];
  check('the Family holds the floor on a fresh campaign — fifteen, stable ids, no second Lou',
    familyState.ids.join(',') === expected.join(','),
    familyState.ids.join(','));
  check('Sasole sits out until the Beef Run is flown',
    !familyState.ids.includes('captain_lou_sasole'));
  const ledger = {
    lag: 'lag.png', willy: 'willy.png', irish: 'irish.png', ape: 'ape.png',
    old_stove: 'stove.png', seff: 'seff.png', numbskull: 'numbskull.png',
  };
  check('real faces where the photos exist; authored heads staged for the seven to come',
    familyState.members.every((m) => (familyState.faces.includes(m.photo)
      ? m.hasFace
      : !m.hasFace && m.eyes === 2 && ledger[m.id] === m.photo)),
    JSON.stringify(familyState.members.map((m) => [m.id, m.hasFace])));
  check('they are patrons, not patrollers — seated or idling, clear of the stage nav and walls',
    familyState.members.every((m) => ['sit', 'drink', 'stand', 'lean'].includes(m.job)
      && (m.job === 'stand' ? m.standingClear : m.seated)
      && m.navClear && m.interactive),
    JSON.stringify(familyState.members.map((m) => [m.id, m.job, m.navClear])));
}

/* Every cue the Family's scripts name must be authored in the manifest —
 * say() and voiceCue() are silent about a typo forever. Numbskull is the one
 * deliberate exception: no voice id yet, so his tree carries no cue names. */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const authored = new Set((manifest.sfx || []).map((cue) => cue.name));
  const scripted = await page.evaluate(() => {
    const b = window.__bing;
    const cues = new Set();
    let numbskullCues = 0;
    for (const [id, tree] of Object.entries(b.familyScripts)) {
      for (const node of Object.values(tree)) {
        const collect = (owner) => {
          if (!owner?.cue) return;
          cues.add(typeof owner.cue === 'function' ? owner.cue() : owner.cue);
          if (id === 'numbskull') numbskullCues += 1;
        };
        collect(node);
        const opts = typeof node.options === 'function' ? node.options() : node.options;
        for (const opt of opts || []) collect(opt);
      }
    }
    return { cues: [...cues], numbskullCues };
  });
  const slugs = ['lag', 'gratin', 'eric', 'hogmama', 'deathmegatron', 'booski',
    'sasole', 'willy', 'irish', 'ape', 'stove', 'snow', 'rippinflow', 'seff',
    'shubenator', 'numbskull'];
  const ledgered = [
    ...slugs.flatMap((slug) => [`vo.bing.hang.${slug}.1`, `vo.bing.hang.${slug}.2`]),
    ...['lag', 'gratin', 'hogmama', 'sasole', 'irish'].map((slug) => `vo.bing.hang.${slug}.tony.1`),
    'vo.bing.booski.shot.offer', 'vo.bing.booski.shot.yell',
    'vo.bing.booski.shot.handoff', 'vo.bing.booski.shot.tony.1',
    'vo.bing.blackjack.dealer.deal.1', 'vo.bing.blackjack.dealer.deal.2',
    'vo.bing.blackjack.dealer.win', 'vo.bing.blackjack.dealer.lose',
    'vo.bing.blackjack.dealer.push', 'vo.bing.blackjack.dealer.bust',
    'vo.bing.blackjack.tony.win', 'vo.bing.blackjack.tony.lose',
  ];
  const missing = [
    ...scripted.cues.filter((cue) => !authored.has(cue)),
    ...ledgered.filter((cue) => !authored.has(cue)),
  ];
  check('every cue the floor names is authored in the manifest, Numbskull now included',
    missing.length === 0 && scripted.numbskullCues >= 2,
    missing.slice(0, 3).join(' / ') || `${scripted.cues.length} cues, numbskull ${scripted.numbskullCues}`);
}

/* Walk-up talk goes through the club's own dialogue machine: the member's
 * subtitled line carries their cue, a lapsed thread resumes, a finished one
 * replays from the top. */
await walkTo(2.4, -2.1, Math.PI / 2);
const famResume = await page.evaluate(() => {
  const b = window.__bing;
  const gratin = b.family.byId.gratin;
  gratin.group.userData.interact.onUse();
  const openNode = b.dialogue.nodeId;
  const openCue = typeof b.dialogue.node.cue === 'function' ? b.dialogue.node.cue() : b.dialogue.node.cue;
  const who = b.dialogue.ui.name.textContent;
  b.dialogue.choose(0);
  for (let i = 0; i < 40 && b.dialogue.nodeId !== 'more'; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  const mid = b.dialogue.nodeId;
  b.dialogue.end('walked-away');
  gratin.group.userData.interact.onUse();
  const resumed = b.dialogue.nodeId;
  b.dialogue.choose(0);                       // Tony's last word; thread completes
  for (let i = 0; i < 40 && b.dialogue.active; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  gratin.group.userData.interact.onUse();
  const replayed = b.dialogue.nodeId;
  b.dialogue.end('done');
  return { openNode, openCue, who, mid, resumed, replayed };
});
check('a Family walk-up opens with the member’s own subtitled cue',
  famResume.openNode === 'open' && famResume.openCue === 'vo.bing.hang.gratin.1'
    && famResume.who === 'GRATIN',
  JSON.stringify(famResume));
check('a lapsed Family thread resumes; a finished one replays',
  famResume.mid === 'more' && famResume.resumed === 'more' && famResume.replayed === 'open',
  JSON.stringify(famResume));

/* ---- Booski's shot, end to end ----
 * Talk → offer → the yell → the bouncer hustles the shot across the room
 * under a held camera → handoff → Tony holds a whiskey he did not order.
 * The beat is stepped here the way the frame loop steps it. */
await walkTo(-17.3, 1.5, Math.PI / 2);
await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.start(b.familyScripts.booski, 'open', b.family.byId.booski, { resume: true });
  b.dialogue.choose(0);
});
/* Long enough for the offer AND the yell. A node's hold is now at least as
 * long as its own recording (see dialogue.js `_cueHold`), so the three-line
 * run to the yell takes as long as the three recordings do -- which is the
 * entire point of the fix, and six seconds no longer covers it. */
await tick(14);
const midBeat = await page.evaluate(() => ({
  frozen: window.__bing.player.mode === 'frozen',
  running: !!window.__bing.game.beat,
  oneShot: window.__bing.game.booskiShotDone,
}));
check('the yell hands the room to the delivery — camera held, beat running',
  midBeat.frozen && midBeat.running && midBeat.oneShot,
  JSON.stringify(midBeat));

async function tickBeat(secs, step = 0.25) {
  await page.evaluate(([secs, step]) => {
    const b = window.__bing;
    for (let t = 0; t < secs && b.game.beat; t += step) {
      b.cast.byName.bouncer.update(step, b.player.position);
      b.game.beat(step);
      b.dialogue.update(step, b.player.position);
    }
  }, [secs, step]);
}
await tickBeat(30);
await tickBeat(30);
const afterBeat = await page.evaluate(() => {
  const b = window.__bing;
  const post = b.club.anchors.bouncerPost;
  const bp = b.cast.byName.bouncer.group.position;
  return {
    beatOver: b.game.beat === null,
    walk: b.player.mode === 'walk',
    holdingShot: b.game.heldDrink === 'whiskey',
    inSlot: b.inventory.items.filter(Boolean).includes('whiskey'),
    bouncerHome: Math.hypot(bp.x - post.x, bp.z - post.z) < 1,
    folded: b.cast.byName.bouncer.folded,
    handoffSaid: b.dialogue.history.has('handoff') && b.dialogue.history.has('tony'),
    voiced: ['vo.bing.booski.shot.offer', 'vo.bing.booski.shot.yell',
      'vo.bing.booski.shot.handoff', 'vo.bing.booski.shot.tony.1']
      .every((cue) => b.game.voLog.includes(cue)),
  };
});
check('the shot lands and control comes back cleanly, bouncer back on his post',
  afterBeat.beatOver && afterBeat.walk && afterBeat.holdingShot && afterBeat.inSlot
    && afterBeat.bouncerHome && afterBeat.folded,
  JSON.stringify(afterBeat));
check('the beat spoke its four authored cues in order of appearance',
  afterBeat.handoffSaid && afterBeat.voiced,
  JSON.stringify(afterBeat));
const shotAgain = await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.start(b.familyScripts.booski, 'open', b.family.byId.booski, { resume: true });
  const opts = b.dialogue.options.map((o) => o.next ?? null);
  const line = b.dialogue.ui.line.textContent;
  b.dialogue.end('done');
  return { opts, line };
});
check('the shot is a one-shot per visit — Booski moves on to the next story',
  shotAgain.opts.length === 1 && shotAgain.opts[0] === null
    && /six hundred on red/i.test(shotAgain.line),
  JSON.stringify(shotAgain));

/* ---- the table finds its voice ----
 * Dealer bark on the deal, dealer verdict beside the WIN/LOSE callout, and
 * Tony's line only on his own wins and losses — never push, never bust. */
const bjDeal = await page.evaluate(() => {
  const b = window.__bing;
  const sayCalls = [];
  const origSay = b.audio.say;
  b.audio.say = function spy(group, opts) {
    sayCalls.push(group);
    return origSay.call(this, group, opts);
  };
  b.game.voLog.length = 0;
  b.blackjack.sitDown();
  b.blackjack.setBet(25);
  b.game.seatedIn = 'table';
  b.interaction.current = null;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  b.audio.say = origSay;
  return { sayCalls, state: b.blackjack.state };
});
check('the dealer calls the cards in on every deal',
  bjDeal.sayCalls.includes('bing.blackjack.dealer.deal'),
  JSON.stringify(bjDeal.sayCalls));
await tick(3, 0.2);
await page.evaluate(() => {
  const b = window.__bing;
  if (b.blackjack.state === 'player') b.blackjack.stand();
});
await tick(6, 0.2);
const bjVerdict = await page.evaluate(() => {
  const b = window.__bing;
  const out = { kind: b.game.lastHand?.kind ?? null, voLog: [...b.game.voLog] };
  b.game.seatedIn = null;
  b.blackjack.standUp();
  return out;
});
{
  const wantDealer = {
    blackjack: 'vo.bing.blackjack.dealer.win',
    win: 'vo.bing.blackjack.dealer.win',
    lose: 'vo.bing.blackjack.dealer.lose',
    push: 'vo.bing.blackjack.dealer.push',
    bust: 'vo.bing.blackjack.dealer.bust',
  }[bjVerdict.kind];
  const wantTony = bjVerdict.kind === 'win' || bjVerdict.kind === 'blackjack'
    ? 'vo.bing.blackjack.tony.win'
    : bjVerdict.kind === 'lose' ? 'vo.bing.blackjack.tony.lose' : null;
  const tonyBarks = bjVerdict.voLog.filter((cue) => cue.startsWith('vo.bing.blackjack.tony.'));
  check('the dealer calls the verdict beside the callout, Tony answers only his wins and losses',
    !!bjVerdict.kind && bjVerdict.voLog.includes(wantDealer)
      && (wantTony ? tonyBarks.join(',') === wantTony : tonyBarks.length === 0),
    `${bjVerdict.kind}: ${bjVerdict.voLog.join(', ')}`);
}

/* ---- the machine ----
 * Asserting the wallet went down would be wrong: it is a slot machine, and
 * occasionally it pays. What has to be true is that three spins happened and
 * that each one was staked. */
const slots = await page.evaluate(() => {
  const b = window.__bing;
  const before = b.game.money;
  let staked = 0;
  for (let i = 0; i < 3; i++) {
    const at = b.game.money;
    if (b.slots.spin()) staked += at - b.game.money;
    b.slots.update(4);
  }
  return { before, after: b.game.money, staked, wager: b.slots.wager, net: b.slots.view.net };
});
s = await state();
check('the machine takes a stake on every spin',
  s.spins === 3 && slots.staked === slots.wager * 3,
  `staked $${slots.staked} at $${slots.wager}, net ${slots.net >= 0 ? '+' : ''}$${slots.net}`);

/* ---- the table ---- */
await page.evaluate(() => {
  const b = window.__bing;
  b.blackjack.sitDown();
  b.blackjack.setBet(25);
  b.blackjack.deal();
});
await tick(3, 0.2);
const cardRead = await page.evaluate(() => {
  const mesh = window.__bing.blackjack._meshes[0];
  const face = mesh?.material?.[2];
  return mesh ? {
    w: mesh.geometry.parameters.width,
    d: mesh.geometry.parameters.depth,
    lit: (face?.emissiveIntensity ?? 0) > 0.2 && !!face?.emissiveMap,
  } : null;
});
check('the cards deal large and carry their own light',
  !!cardRead && cardRead.w >= 0.08 && cardRead.d >= 0.11 && cardRead.lit,
  JSON.stringify(cardRead));
await page.evaluate(() => window.__bing.blackjack.stand());
await tick(6, 0.2);
check('a hand of blackjack resolves', (await state()).hands >= 1);
const verdict = await page.evaluate(() => document.getElementById('bj-callout')?.textContent ?? '');
check('the hand ends with an explicit verdict on screen',
  /BLACKJACK|YOU WIN|PUSH|BUST|HOUSE WINS/.test(verdict), verdict);
await page.evaluate(() => window.__bing.blackjack.standUp());

/* ---- the back of house ---- */
await walkTo(6.7, 2, Math.PI);
check('the hallway moves the objective on', (await state()).mission === 'hallway');
await walkTo(10.5, -6, Math.PI);
await tick(1);
s = await state();
check('the office starts Lou talking', s.mission === 'office' && s.options >= 0, s.mission);

/* ---- Lou ---- */
let ominous = null;
for (let i = 0; i < 8; i++) {
  const st = await state();
  if (st.flags.gotPackage) break;
  if (st.mission === 'package') {
    /* Before he takes it: the parcel on the desk carries its own dark red
     * light and a breathing glow, neither of which belongs to the desk lamp. */
    ominous = await page.evaluate(() => {
      const b = window.__bing;
      b.club.update(0.3, b.player.position);
      return {
        visible: b.club.office.parcel.visible,
        light: Number(b.club.office.parcelLight.intensity.toFixed(2)),
        glow: Number(b.club.office.parcelCloth.material.emissiveIntensity.toFixed(2)),
      };
    });
    await page.evaluate(() => window.__bing.club.office.parcel.userData.interact.onUse());
    await tick(2);
    break;
  }
  if (st.options > 0) await choose(0);
  else await tick(3);
}
check('the package sits in its own wrong light before he takes it',
  !!ominous && ominous.visible && ominous.light > 0.5 && ominous.glow > 0.05,
  JSON.stringify(ominous));
s = await state();
check('Lou puts it on the desk and you take it', s.flags.gotPackage === true, s.mission);
check('it is inside your jacket, not in a slot',
  s.carrying === 'parcel' && !s.inventory.includes('parcel'),
  `carrying ${s.carrying}, slots [${s.inventory.join(',')}]`);
check('the shared campaign owns the concealed package',
  s.campaign?.inventory?.concealed?.includes('parcel') === true,
  JSON.stringify(s.campaign?.inventory ?? null));

/* The case the reviewer found: four drinks and no drop key used to mean the
 * package went nowhere while the mission insisted it was on you. */
const full = await page.evaluate(() => {
  const b = window.__bing;
  for (let i = 0; i < 6; i++) b.scripts.bartender.order.options[1].effect();
  return { slots: b.inventory.items.filter(Boolean).length, carrying: b.game.carrying, full: b.inventory.full };
});
check('a full hotbar cannot lose the package',
  full.full && full.slots === 4 && full.carrying === 'parcel', JSON.stringify(full));

for (let i = 0; i < 10; i++) {
  const st = await state();
  if (st.mission === 'briefed') break;
  if (st.options > 0) await choose(st.options - 1);
  else await tick(3);
}
check('he finishes and lets you go', (await state()).mission === 'briefed');

/* Once the job is done the front door itself offers the exit -- the owner's
 * playtest never found the wheel. The drive-out stays the canonical path
 * below; this only proves the on-foot prompt exists, arms, and is held. */
const leavePad = await page.evaluate(() => {
  const b = window.__bing;
  let pad = null;
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const text = typeof l === 'function' ? l() : l;
    if (text && /call it a night|head for the motel/i.test(String(text))) pad = o;
  });
  if (!pad) return null;
  return {
    z: pad.position.z,
    enabled: pad.userData.interact.enabled?.() ?? true,
    hold: pad.userData.interact.hold ?? 0,
  };
});
check('the front door offers a hold-to-leave once the job is done',
  !!leavePad && leavePad.enabled && leavePad.hold > 0 && Math.abs(leavePad.z - 16.75) < 1.5,
  JSON.stringify(leavePad));

/* ---- out ---- */
await walkTo(6.7, 2, 0);
await tick(1);
await walkTo(-4, 20, 0);
await tick(1);
check('back in the lot carrying it', (await state()).mission === 'lot-return');

/* The back way out: the alarm chirps, and the yard counts as leaving by it. */
const rear = await page.evaluate(() => {
  const b = window.__bing;
  b.club.doors.service.leaf.userData.interact.onUse();
  b.player.position.set(9, 1.66, -17);
  b.player.update(0.016);
  return { tripped: b.mission.flags.alarmTripped };
});
await tick(1.5);
check('the service door has a live alarm on it', rear.tripped);
check('and the yard behind it counts as the back way',
  await page.evaluate(() => window.__bing.mission.flags.leftByRear === true));

await walkTo(-4, 20, 0);
await tick(1);
await page.evaluate(() => {
  const b = window.__bing;
  b.game.seatedIn = 'car';
  b.car.wheel.userData.interact.onUse();
});
await page.waitForTimeout(800);
await tick(12, 0.5);
const ended = await page.evaluate(() => ({
  over: window.__bing.game.over,
  done: window.__bing.mission.state === 'done',
  card: document.getElementById('overlay').classList.contains('ending'),
  title: document.querySelector('#overlay .tag')?.textContent || '',
  saved: window.__bing.campaign?.state?.missions?.bada_bing_one ?? null,
  nextMission: window.__bing.campaign?.state?.missions?.squatchfather ?? null,
  returnHref: document.getElementById('next-level')?.getAttribute('href') ?? null,
}));
check('driving out finishes the mission', ended.over && ended.done, JSON.stringify(ended));
check('and puts up an ending card', ended.card, ended.title);
check('completion is recorded in shared campaign state',
  ended.saved?.status === 'complete' && ended.saved?.packageReceived === true,
  JSON.stringify(ended.saved));
check('the package unlocks Squatchfather',
  ended.nextMission?.status === 'available',
  JSON.stringify(ended.nextMission));
check('the ending offers a return to the apartment',
  ended.returnHref === 'index.html', ended.returnHref ?? 'missing');

if (ended.returnHref === 'index.html') {
  await page.evaluate(() => document.getElementById('next-level').click());
  await page.waitForFunction(() => window.__squatch, null, { timeout: 90000 });
  const returned = await page.evaluate(() => ({
    scene: window.__squatch.campaign?.state?.scene ?? null,
    hasPackage: window.__squatch.campaign?.hasItem('parcel') ?? false,
    player: {
      mode: window.__squatch.player.mode,
      x: window.__squatch.player.position.x,
      z: window.__squatch.player.position.z,
    },
  }));
  check('returning home keeps the package and front-door spawn',
    returned.hasPackage
      && returned.scene?.id === 'apartment'
      && returned.scene?.spawn === 'front_door'
      && returned.player.mode === 'walk'
      && Math.abs(returned.player.x - 2.55) < 0.05
      && Math.abs(returned.player.z - 3.72) < 0.05,
    JSON.stringify(returned));
}

/* ---- one identity, before and after the Beef Run ----
 * Same save, one field changed: the airstrip flown. Reload the club and the
 * Captain is at his table near the stage — same stable id as the cockpit,
 * same face photo, and the sixteenth chair on the floor. */
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('squatchlife.campaign'));
  raw.missions.airstrip_smuggling.status = 'complete';
  raw.missions.airstrip_smuggling.checkpoint = 'landed_home';
  raw.missions.airstrip_smuggling.cargoLoaded = true;
  localStorage.setItem('squatchlife.campaign', JSON.stringify(raw));
});
await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bing?.family, null, { timeout: 90000 });
const postRun = await page.evaluate(() => {
  const b = window.__bing;
  const sasole = b.family.byId.captain_lou_sasole ?? null;
  let hasFace = false;
  sasole?.group.traverse((o) => {
    if (o.isMesh && Array.isArray(o.material) && o.material[4]?.map) hasFace = true;
  });
  return {
    count: b.family.all.length,
    present: !!sasole,
    hasFace,
    atHisTable: sasole
      ? Math.hypot(sasole.group.position.x + 12.55, sasole.group.position.z - 0.85) < 0.3
      : false,
    seated: !!sasole?.seated,
  };
});
check('after the Beef Run the Captain takes his table — same id, his own face',
  postRun.present && postRun.count === 16 && postRun.hasFace
    && postRun.atHisTable && postRun.seated,
  JSON.stringify(postRun));

check('nothing threw on the way round', problems.length === 0, problems.slice(0, 3).join(' / '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);

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

console.log('Driving the mission…');

let s = await state();
check('starts behind the wheel in the lot', s.mission === 'lot', s.mission);
check('one objective, and it is Lou', s.objectives.join('') === ' lou', s.objectives.join(','));
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
await page.evaluate(() => window.__bing.blackjack.stand());
await tick(6, 0.2);
check('a hand of blackjack resolves', (await state()).hands >= 1);
await page.evaluate(() => window.__bing.blackjack.standUp());

/* ---- the back of house ---- */
await walkTo(6.7, 2, Math.PI);
check('the hallway moves the objective on', (await state()).mission === 'hallway');
await walkTo(10.5, -6, Math.PI);
await tick(1);
s = await state();
check('the office starts Lou talking', s.mission === 'office' && s.options >= 0, s.mission);

/* ---- Lou ---- */
for (let i = 0; i < 8; i++) {
  const st = await state();
  if (st.flags.gotPackage) break;
  if (st.mission === 'package') {
    await page.evaluate(() => window.__bing.club.office.parcel.userData.interact.onUse());
    await tick(2);
    break;
  }
  if (st.options > 0) await choose(0);
  else await tick(3);
}
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

check('nothing threw on the way round', problems.length === 0, problems.slice(0, 3).join(' / '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);

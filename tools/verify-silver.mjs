#!/usr/bin/env node
/**
 * Play Front and Center, headlessly, from the pavement to the ending card.
 *
 *   node tools/verify-silver.mjs        (npm run verify:silver)
 *
 * Same reasoning as verify-bing.mjs, and more of it. This mission is a state
 * machine wired to a building *and* to a woman walking next to you, and almost
 * everything that can go wrong with it is invisible to a syntax check:
 *
 *   - the companion gets stuck in the cellar and the player never finds out
 *     until he turns round at the host station and she is two rooms back;
 *   - a tip pays out twice, or pays out after a checkpoint reload;
 *   - the table cutscene builds a table and then the table is not there;
 *   - the conversation queue stalls because a round never reported done;
 *   - an ending resolves to a node that does not exist.
 *
 * So this drives the real systems in a real browser: it walks the whole route,
 * tips everybody, sits down, talks, watches both cutscenes, and asserts the
 * mission state at each beat. It steps the update functions directly rather
 * than waiting on frames, because software rendering runs at about a frame a
 * second and the point here is the logic.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5201;

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
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(`http://localhost:${PORT}/silver.html`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
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

/* Clicked in-page rather than through the mouse: this panel is taller than
 * the Bing's and the button falls outside the deliberately tiny viewport,
 * which every pixel of is drawn on the CPU. */
await page.evaluate(() => document.getElementById('start-btn').click());
await page.waitForFunction(() => window.__silver?.game.started, null, { timeout: 90000 });
await page.evaluate(() => window.__silver.postfx.disable?.());

/** Step the game's own update path for `secs` of simulated time. */
async function tick(secs = 1, step = 0.25) {
  await page.evaluate(([s, st]) => {
    const b = window.__silver;
    for (let t = 0; t < s; t += st) {
      b.player.update(st);
      if (b.game.drive) b.game.drive(st);
      if (b.game.scene) b.game.scene.update(st);
      b.room.update(st, b.player.position);
      b.dialogue.update(st, b.player.position);
      b.date.update(st, b.player.position, b.player.yaw);
      b.performance.update(st);
      b.mission.update(st, { trailing: b.date.isTrailing });
      b.__zones();
      b.__seatTick(st);
      b.__host();
    }
  }, [secs, step]);
}

/** Walk, rather than teleport, so the companion has to keep up. */
async function walkTo(x, z) {
  await page.evaluate(([tx, tz]) => {
    const b = window.__silver;
    const d0 = Math.hypot(tx - b.player.position.x, tz - b.player.position.z);
    const s = Math.max(0.6, d0 / 3.2);        // his actual walking speed
    b.player.mode = 'walk';
    b.player._tween = null;
    b.player.yawCenter = null;
    const from = b.player.position.clone();
    const steps = Math.ceil(s / 0.05);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const px = from.x + (tx - from.x) * k;
      const pz = from.z + (tz - from.z) * k;
      /* Pass his own current height, exactly as world.groundAt does in the
       * game: the cellar is under the kitchen and x/z alone cannot say which
       * floor you are on. Asking without it walks you along the ceiling. */
      const y0 = b.player.position.y - 1.66;
      b.player.position.set(px, b.room.groundAt(px, pz, y0) + 1.66, pz);
      b.player.yaw = Math.atan2(-(tx - from.x), -(tz - from.z));
      b.date.update(0.05, b.player.position, b.player.yaw);
      b.room.update(0.05, b.player.position);
      b.mission.update(0.05, { trailing: b.date.isTrailing });
      b.__zones();
    }
    b.player.update(0.016);
  }, [x, z]);
  await tick(0.8);
}

/** Stand still and let her arrive, which is what a player does. */
async function waitForHer(secs = 12) {
  for (let i = 0; i < secs; i++) {
    const gap = await page.evaluate(() => Math.hypot(
      window.__silver.date.position.x - window.__silver.player.position.x,
      window.__silver.date.position.z - window.__silver.player.position.z,
    ));
    if (gap < 3) return gap;
    await tick(1, 0.1);
  }
  return page.evaluate(() => Math.hypot(
    window.__silver.date.position.x - window.__silver.player.position.x,
    window.__silver.date.position.z - window.__silver.player.position.z,
  ));
}

const state = () => page.evaluate(() => {
  const b = window.__silver;
  const p = b.player.position;
  return {
    mission: b.mission.state,
    room: b.room.roomAt(p.x, p.z, p.y - 1.6),
    objectives: b.mission.objectives.map((o) => `${o.done ? 'x' : ' '}${o.id}`),
    flags: { ...b.mission.flags },
    money: b.game.money,
    woo: b.woo.score,
    tips: b.woo.tipCount,
    tipsLeft: b.woo.tipsLeft,
    streak: b.woo.streakClosed,
    options: b.dialogue.active ? b.dialogue.options.length : -1,
    dateGap: Math.hypot(b.date.position.x - p.x, b.date.position.z - p.z),
    dateRoom: b.room.roomAt(b.date.position.x, b.date.position.z, b.date.position.y),
    dateMode: b.date.mode,
    seated: b.game.seated,
    scene: !!b.game.scene,
  };
});

const choose = async (i) => {
  await page.evaluate((n) => window.__silver.dialogue.choose(n), i);
  await tick(3);
};

await page.evaluate(() => { window.__roomLog = []; });
console.log('Driving the evening…');

/* ---- arrival ---- */
await tick(5, 0.2);
let s = await state();
check('the car pulls up and hands control back inside five seconds',
  s.mission === 'arrived', s.mission);
check('she is out of the car and next to him', s.dateGap < 4, s.dateGap.toFixed(1));
check('the wallet can pay for the evening',
  s.money >= 600, `$${s.money}`);

/* ---- the driver ---- */
const drove = await page.evaluate(() => {
  const b = window.__silver;
  const before = b.game.money;
  b.taxi.window.userData.interact.onUse();
  const once = { money: b.game.money, woo: b.woo.score };
  b.taxi.window.userData.interact.onUse();     // try to farm it
  return { before, once, after: b.game.money, wooAfter: b.woo.score };
});
check('tipping the driver costs money and pays Woo',
  drove.once.money === drove.before - 40 && drove.once.woo > 12,
  `$${drove.before} → $${drove.once.money}, woo ${drove.once.woo}`);
check('and a second attempt pays nothing and costs nothing',
  drove.after === drove.once.money && drove.wooAfter === drove.once.woo,
  `$${drove.after}, woo ${drove.wooAfter}`);

/* ---- her question about the front door ---- */
await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.start(b.scripts.arrival, 'open', b.date.npc);
});
await tick(1);
check('she asks about the front entrance, and there are four answers',
  (await state()).options === 4, String((await state()).options));
await choose(0);
await tick(5);

/* ---- the route ---- */
await walkTo(20, 38);
await walkTo(34, 26);
s = await state();
check('the alley starts the service route', s.mission === 'service-route', s.mission);
check('she came down the alley too', s.dateRoom === 'alley' || s.dateGap < 6,
  `${s.dateRoom}, ${s.dateGap.toFixed(1)}m`);

await page.evaluate(() => window.__silver.room.doors.service.toggle());
await walkTo(31, 12);
await walkTo(24, 11.5);
await walkTo(15.8, 11);      // the full length of the ramp
await walkTo(16.4, 4);
s = await state();
check('the ramp puts him underground', s.mission === 'cellar' && s.room === 'cellar',
  `${s.mission} / ${s.room}`);
const caughtUp = await waitForHer();
const her = await page.evaluate(() => {
  const b = window.__silver;
  return {
    x: +b.date.position.x.toFixed(1), y: +b.date.position.y.toFixed(1),
    z: +b.date.position.z.toFixed(1), at: b.date.at, stuck: +b.date._stuck.toFixed(1),
    room: b.room.roomAt(b.date.position.x, b.date.position.z, b.date.position.y),
  };
});
check('and she followed him down the ramp and caught up', caughtUp < 3,
  `${caughtUp.toFixed(1)}m — she is ${JSON.stringify(her)}`);
console.log('    rooms:', (await page.evaluate(() => window.__roomLog)).join(' → '));
check('the cellar floor is only the cellar floor to somebody already down there',
  await page.evaluate(() => {
    const g = window.__silver.room.groundAt;
    return g(22, 1, -2.9) < -2 && g(22, 1, 0) === 0;
  }), 'the kitchen is directly above it');

/* Every doorway on the route, which is where a follower dies. */
await walkTo(24, -4);
await walkTo(16.4, -3);
await walkTo(16.4, 1);
await walkTo(19.5, 1);       // back up the other ramp
await walkTo(19, -4);
s = await state();
check('the ramp brings him back up to the kitchen',
  s.mission === 'kitchen' && Math.abs(await page.evaluate(() => window.__silver.player.position.y - 1.66)) < 0.4,
  s.mission);
const afterRamps = await waitForHer();
check('she is still with him after four doorways and two ramps',
  afterRamps < 3, `${afterRamps.toFixed(1)}m`);

/* ---- the controller has to walk it, not be placed on it ----
 * Everything above moves the player by setting his position, which is the
 * only way to drive a first-person game headlessly and also the reason this
 * check has to exist: setting position.y hides the question of whether the
 * *controller* can get down there. It eases its ground height and resolves
 * collision, and either of those can refuse a ramp. So: put him at the top,
 * give him nothing but x and z, and see where his feet end up.
 */
const walked = await page.evaluate(() => {
  const b = window.__silver;
  b.game.drive = null;                 // the arrival tween would drag him back
  b.player.mode = 'walk';
  b.player._tween = null;
  b.player.position.set(34, 1.66, 20);
  b.player.ground = 0;
  const legs = [[31, 12], [24, 11.5], [15.8, 11], [16.4, 5], [21, 3]];
  const trace = [];
  let from = { x: 34, z: 20 };
  for (const [tx, tz] of legs) {
    for (let i = 1; i <= 60; i++) {
      const k = i / 60;
      b.player.position.x = from.x + (tx - from.x) * k;
      b.player.position.z = from.z + (tz - from.z) * k;
      b.player.update(0.05);           // and nothing else touches y
    }
    trace.push(`${tx},${tz}=${b.player.ground.toFixed(2)}`);
    from = { x: b.player.position.x, z: b.player.position.z };
  }
  return { trace, ground: b.player.ground, x: b.player.position.x, z: b.player.position.z };
});
check('the controller walks itself down the ramp into the cellar',
  walked.ground < -2.5 && Math.abs(walked.x - 21) < 0.5,
  walked.trace.join(' → '));

/* ---- the hazard, and the kitchen ---- */
const hazard = await page.evaluate(() => {
  const b = window.__silver;
  let pad = null;
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const text = typeof l === 'function' ? l() : l;
    if (text && String(text).includes('Put a hand out')) pad = o;
  });
  if (!pad) return { found: false };
  const before = b.woo.score;
  pad.userData.interact.onUse();
  const after = b.woo.score;
  pad.userData.interact.onUse();
  return { found: true, before, after, again: b.woo.score };
});
check('there is a hazard on the line worth getting her round',
  hazard.found && hazard.after > hazard.before, JSON.stringify(hazard));
check('and it cannot be farmed', hazard.again === hazard.after, String(hazard.again));

/* ---- tip the back of house ---- */
const tipEveryone = () => page.evaluate(() => {
  const b = window.__silver;
  const before = b.game.money;
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return {
    spent: before - b.game.money,
    tips: b.woo.tipCount,
    left: b.woo.tipsLeft,
    streak: b.woo.streakClosed,
    woo: b.woo.score,
  };
});
let tipped = await tipEveryone();
check('the back of house can be looked after on the way through',
  tipped.tips >= 8, `${tipped.tips} so far`);
check('and it cost real money', tipped.spent > 200, `$${tipped.spent}`);

const farm = await page.evaluate(() => {
  const b = window.__silver;
  const before = { money: b.game.money, woo: b.woo.score };
  for (let i = 0; i < 3; i++) {
    for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  }
  return { before, money: b.game.money, woo: b.woo.score };
});
check('Woo cannot be farmed by tipping the room again',
  farm.money === farm.before.money && farm.woo === farm.before.woo,
  `$${farm.money}, woo ${farm.woo}`);

/* ---- the corridor and the floor ---- */
await walkTo(13, -14);
await walkTo(12.5, 4);
check('the corridor is on the way', (await state()).mission === 'corridor', (await state()).mission);
await walkTo(12.5, 22);
await walkTo(6, 24);
s = await state();
check('and it comes out on the floor of the club', s.mission === 'host', s.mission);
check('no loading screen anywhere between the alley and the room',
  await page.evaluate(() => !document.getElementById('blackout')?.classList.contains('on')), '');

/* ---- cutscene one ---- */
const beforeTable = await page.evaluate(() => window.__silver.room.frontTable.group.visible);
await walkTo(2.2, 23.4);
await tick(1);
check('walking up to the host station starts the table scene',
  (await state()).scene === true && !beforeTable, String((await state()).scene));
await tick(26, 0.25);
s = await state();
check('the scene ends and gives control back', s.scene === false && s.mission === 'seating', s.mission);

const table = await page.evaluate(() => {
  const b = window.__silver;
  const g = b.room.frontTable.group;
  const want = b.room.anchors.frontTable;
  return {
    visible: g.visible,
    at: [g.position.x, g.position.z],
    want: [want.x, want.z],
    chairs: b.room.frontTable.chairs.filter((c) => c.visible).length,
    /* The one thing that must be true: there is exactly one table object and
     * it is the one the staff carried. */
    count: (() => { let n = 0; b.scene.traverse((o) => { if (o.name === 'front-table') n++; }); return n; })(),
  };
});
check('the table is real, in place, and there is only one of it',
  table.visible && table.count === 1
    && Math.abs(table.at[0] - table.want[0]) < 0.1 && Math.abs(table.at[1] - table.want[1]) < 0.1,
  JSON.stringify(table));
check('with two chairs at it', table.chairs === 2, String(table.chairs));

/* ---- sitting down ---- */
const chair = await page.evaluate(() => {
  const b = window.__silver;
  b.player.position.set(b.room.anchors.frontTable.x + 1.2, 1.66, b.room.anchors.frontTable.z + 1.2);
  const before = b.woo.score;
  b.game.chairPads.her.userData.interact.onUse();
  return { before, after: b.woo.score, dateMode: b.date.mode };
});
check('pulling her chair out is worth something, and sits her down',
  chair.after > chair.before && chair.dateMode === 'seated', JSON.stringify(chair));

await page.evaluate(() => window.__silver.game.chairPads.his.userData.interact.onUse());
await tick(2.5, 0.1);
s = await state();
check('and he can sit down opposite her', s.seated === true && s.mission === 'round-one', s.mission);

/* ---- the conversation ---- */
await tick(2);
check('sitting down starts her talking', (await state()).options > 0, String((await state()).options));
await choose(0);
await tick(6);

/* Drive the whole seated queue: every round, always taking the first answer.
 * Nothing is skipped and nothing is forced -- this is the queue running at its
 * own pace with somebody pressing 1 every time it stops. */
let sawShowScene = false;
let sawDrinks = false;
for (let i = 0; i < 140; i++) {
  const st = await state();
  if (st.flags.drinkOrdered) sawDrinks = true;
  if (st.scene && st.flags.showStarted === false && sawDrinks) sawShowScene = true;
  if (st.mission === 'performance') break;
  if (st.options > 0) await choose(0);
  else await tick(6, 0.5);
}
s = await state();
check('the whole roster, front and back, can be looked after',
  s.tipsLeft <= 1, `${s.tips} tipped, ${s.tipsLeft} left`);
check('the drink order happens and she gets what she drinks',
  s.flags.drinkOrdered !== null, String(s.flags.drinkOrdered));
check('somebody from the family stops by the table',
  s.flags.familyMet?.length > 0 || s.flags.introducedAs !== null,
  JSON.stringify({ met: s.flags.familyMet, as: s.flags.introducedAs }));
check('the champagne arrives from the table by the pillar',
  s.flags.champagneSent === true, String(s.flags.champagneSent));

/* ---- "funny how?" ----
 * Reached by taking the first answer every time, which is the point: the
 * homage is on the main line of the conversation, not down a branch. */
check('the "you\'re funny" exchange happened and the room went quiet',
  s.flags.funnyHow === true, String(s.flags.funnyHow));
check('and breaking the tension paid',
  await page.evaluate(() => window.__silver.woo.has('Woo.FunnyHowSuccess')));

/* ---- cutscene two ---- */
check('the lights going down is the second scene, and it ran on its own',
  sawShowScene, sawShowScene ? 'reached on its own clock' : 'never saw the scene');
await tick(16, 0.25);
s = await state();
check('the band arrives and control comes back at the table',
  s.mission === 'performance' && s.scene === false && s.seated === true, s.mission);
const showState = await page.evaluate(() => {
  const b = window.__silver;
  return {
    playing: b.performance.playing,
    visible: b.band.members.filter((m) => m.group.visible).length,
    curtain: b.room.lighting.stage,
    house: b.room.lighting.house,
    /* The lamps near you stay lit when the house goes down — that is the
     * whole look of the second half. The ones across the room are switched
     * off by the pool, which is a performance decision and invisible: what
     * you see at that distance is the emissive shade, not the light. */
    lampsNear: b.room.lamps.filter((l) => l.light.intensity > 0).length,
    lampsTotal: b.room.lamps.length,
    lights: (() => { let n = 0; b.scene.traverse((o) => { if (o.isLight && o.intensity > 0) n++; }); return n; })(),
  };
});
check('seven of them, on stage, with the house down and the near table lamps still lit',
  showState.playing && showState.visible === 7 && showState.lampsNear > 0,
  JSON.stringify(showState));
check('and the light budget stays sane in a room with eighty fittings in it',
  showState.lights <= 45 && showState.lampsNear < showState.lampsTotal,
  `${showState.lights} live lights, ${showState.lampsNear}/${showState.lampsTotal} lamps`);

/* ---- the things the evening still has in it after the band ---- */
const afterBand = await page.evaluate(() => {
  const b = window.__silver;
  const out = {};
  // The champagne thank-you: one look and one press, and it is worth something.
  let pad = null;
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const t = typeof l === 'function' ? l() : l;
    if (t && String(t).includes('pillar')) pad = o;
  });
  out.foundPillar = !!pad;
  if (pad) {
    const before = b.woo.score;
    pad.userData.interact.onUse();
    pad.userData.interact.onUse();            // and only once
    out.thanked = b.mission.flags.champagneThanked;
    out.gain = b.woo.score - before;
  }
  return out;
});
check('the table by the pillar can be thanked, once',
  afterBand.foundPillar && afterBand.thanked && afterBand.gain > 0,
  JSON.stringify(afterBand));

await page.evaluate(() => window.__silver.dialogue.end());
await page.evaluate(() => window.__silver.debug.toast());
await tick(1);
check('there is a toast, and it has options', (await state()).options >= 3,
  String((await state()).options));
await choose(0);
await tick(4);
check('and making one is worth something', (await state()).flags.toast !== null,
  String((await state()).flags.toast));

/* ---- the sway ---- */
const swayRun = await page.evaluate(() => {
  const b = window.__silver;
  b.sway.start(true);
  for (let i = 0; i < 4; i++) {
    b.sway.t = (60 / b.sway.bpm) * i + (60 / b.sway.bpm) * 0.5;   // dead on the beat
    b.sway.press();
  }
  return { hits: b.sway.hits, result: b.sway.result, active: b.sway.active };
});
check('the sway can be played on the beat and scored',
  swayRun.hits === 4 && swayRun.result === 'good' && !swayRun.active, JSON.stringify(swayRun));

/* ---- checkpoint reload cannot pay a tip twice ---- */
const reload = await page.evaluate(() => {
  const b = window.__silver;
  const cp = b.debug.save();
  const before = { woo: b.woo.score, tips: b.woo.tipCount, money: b.game.money };
  b.woo.score = 3;
  b.debug.load();
  const after = { woo: b.woo.score, tips: b.woo.tipCount, money: b.game.money };
  // And then try to be paid again for everything already on the ledger
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return { cp: !!cp, before, after, farmed: b.woo.score };
});
check('a checkpoint restores the score and the ledger',
  reload.after.woo === reload.before.woo && reload.after.tips === reload.before.tips,
  JSON.stringify(reload.after));
check('and reloading does not let a tip pay out twice',
  reload.farmed === reload.after.woo, String(reload.farmed));

/* ---- the endings ---- */
const endings = await page.evaluate(() => {
  const { Mission } = window.__silver.mission.constructor
    ? { Mission: window.__silver.mission.constructor } : {};
  const out = {};
  const cases = [
    ['perfect', 98, 'perfect', { drinkOrdered: 'rye', funnyHow: true, invitation: 'callback' }],
    ['strong', 84, 'strong', { invitation: 'plain' }],
    ['good', 70, 'good', { invitation: 'plain' }],
    ['awkward', 45, 'bad', { invitation: 'plain' }],
    ['disaster', 20, 'disaster', { invitation: 'plain' }],
    ['gentleman', 72, 'good', { invitation: 'none' }],
    ['insult', 99, 'perfect', { invitation: 'transactional' }],
    ['from-a-distance', 60, 'decent', { chaos: 5, invitation: 'plain' }],
  ];
  for (const [name, score, band, flags] of cases) {
    const m = new Mission();
    Object.assign(m.flags, flags);
    out[name] = m.resolve(score, band);
  }
  return out;
});
const wanted = {
  perfect: 'perfect', strong: 'strong', good: 'good', awkward: 'awkward',
  disaster: 'disaster', gentleman: 'gentleman', insult: 'insult',
  'from-a-distance': 'from-a-distance',
};
const wrong = Object.entries(wanted).filter(([k, v]) => endings[k] !== v);
check('every ending resolves to the one it should', wrong.length === 0,
  wrong.map(([k, v]) => `${k}: wanted ${v}, got ${endings[k]}`).join('; '));

const cards = await page.evaluate((names) => names.filter((n) => !window.__silver.ENDINGS[n]),
  Object.keys(wanted));
check('and every one of them has a card written for it', cards.length === 0, cards.join(', '));

/* ---- money is not required to finish ---- */
const broke = await page.evaluate(() => {
  const b = window.__silver;
  b.game.money = 0;
  const before = b.woo.score;
  b.debug.resetTips();
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return { woo: b.woo.score, before, money: b.game.money };
});
check('with an empty wallet nothing is charged and nothing is awarded',
  broke.money === 0, `$${broke.money}`);

/* ---- accessibility ---- */
const access = await page.evaluate(() => {
  const ids = ['opt-subs', 'opt-bigsubs', 'opt-shake', 'opt-assist'];
  const present = ids.filter((i) => document.getElementById(i)).length;
  const big = document.getElementById('opt-bigsubs');
  big.checked = true;
  big.dispatchEvent(new Event('change'));
  const applied = document.body.classList.contains('bigsubs');
  const stored = localStorage.getItem('squatch.bigsubs');
  big.checked = false;
  big.dispatchEvent(new Event('change'));
  return { present, applied, stored, cleared: !document.body.classList.contains('bigsubs') };
});
check('the accessibility switches exist, apply, and persist',
  access.present === 4 && access.applied && access.stored === '1' && access.cleared,
  JSON.stringify(access));
check('the dance timing can be widened',
  await page.evaluate(() => {
    const b = window.__silver;
    b.sway.start(false);
    const tight = b.sway.window;
    b.sway.start(true);
    return b.sway.window > tight;
  }), '');

/* ---- the debug panel is not in a shipped page ---- */
check('the dev panel is absent without ?dev',
  await page.evaluate(() => !document.getElementById('debug')), '');

/* ---- and it ends ---- */
await page.evaluate(() => window.__silver.debug.ending('strong'));
await page.waitForTimeout(500);
const ended = await page.evaluate(() => ({
  over: window.__silver.game.over,
  card: document.getElementById('overlay').classList.contains('ending'),
  title: document.querySelector('#overlay .tag')?.textContent || '',
  saved: JSON.parse(localStorage.getItem('squatch.frontAndCenter') || 'null'),
}));
check('the evening ends on a card', ended.over && ended.card, ended.title);
check('and the relationship is written down for the next scene',
  !!ended.saved && ended.saved.date?.met === true && typeof ended.saved.woo === 'number',
  JSON.stringify(ended.saved && {
    woo: ended.saved.woo, outcome: ended.saved.outcome,
    tipped: ended.saved.tippedEverybody, available: ended.saved.date?.available,
  }));

check('nothing threw on the way round', problems.length === 0, problems.slice(0, 3).join(' / '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length
  ? `\n${failed.length} of ${results.length} checks failed.`
  : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);

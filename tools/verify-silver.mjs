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
const PORT = Number(process.env.PORT) || 5212;

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

/**
 * Step the game's own update path for `secs` of simulated time.
 *
 * Everything the frame loop calls, in the order it calls it. `__evening` is the
 * one that used to be missing: the car outside, the dance, and the two things
 * she notices about being ignored all lived inline in `frame()`, so this driver
 * never ran them — which is exactly why a dance that could not be started and a
 * car that drove off mid-conversation both got past it.
 */
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
      b.__evening(st);
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

/* ---- the driver ----
 * Through the conversation's own doubled-up option, because that is the only
 * elective generosity on the route and `Woo.GenerousTip` had nothing at all
 * that could fire it. The hold-to-tip interface is then tested doing the other
 * half of its job — refusing a second one — and pays out for fourteen other
 * people later in the kitchen.
 */
const drove = await page.evaluate(() => {
  const b = window.__silver;
  const before = b.game.money;
  const big = b.scripts.driver.open.options().find((o) => o.tone === '$80');
  const offered = !!big?.when?.();
  big?.effect?.();
  const once = { money: b.game.money, woo: b.woo.score, generous: b.woo.has('Woo.GenerousTip') };
  big?.effect?.();                             // try to farm it
  b.taxi.window.userData.interact.onUse();     // and the hold, on a man already looked after
  return { before, offered, once, after: b.game.money, wooAfter: b.woo.score };
});
check('tipping the driver costs money and pays Woo',
  drove.once.money === drove.before - 80 && drove.once.woo > 12,
  `$${drove.before} → $${drove.once.money}, woo ${drove.once.woo}`);
check('and handing him double is generous, which is its own small thing',
  drove.offered && drove.once.generous, JSON.stringify(drove.once));
check('and a second attempt pays nothing and costs nothing',
  drove.after === drove.once.money && drove.wooAfter === drove.once.woo,
  `$${drove.after}, woo ${drove.wooAfter}`);

/* ---- the car waits for the conversation ----
 * It used to go on a forty-five second timer started the moment control came
 * back, so reading her opening line and picking an answer cost you the driver,
 * the tip, the full-roster streak and a line of the ending card. Nothing on
 * screen said that was a clock.
 */
await tick(70, 0.5);
const stillThere = await page.evaluate(() => ({
  gone: window.__silver.debug.taxiGone(),
  prompt: !!window.__silver.taxi.window.userData.interact,
  state: window.__silver.mission.state,
}));
check('the car is still at the kerb a minute later, because nobody has walked away',
  !stillThere.gone && stillThere.prompt, JSON.stringify(stillThere));

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

const drovOff = await page.evaluate(() => ({
  gone: window.__silver.debug.taxiGone(),
  prompt: !!window.__silver.taxi.window.userData.interact,
}));
check('and once he has walked off the car goes, and takes its prompt with it',
  drovOff.gone && !drovOff.prompt, JSON.stringify(drovOff));

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
/* Standing still until she arrives is a thing the player does deliberately and
 * the table had a point in it for — with nothing anywhere that fired it. */
check('stopping and letting her catch up is worth the point it is worth',
  await page.evaluate(() => window.__silver.woo.has('Woo.WaitedForDate')), '');
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
const pace = await page.evaluate(() => ({
  kept: window.__silver.woo.has('Woo.KeptPace'),
  left: window.__silver.mission.flags.abandonments,
}));
check('walking the whole route without losing her once pays, and losing her forfeits it',
  pace.kept === (pace.left === 0), `kept ${pace.kept}, left behind ${pace.left}×`);
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

/* ---- the two chairs ----
 *
 * Where the seats are and which way they point is the whole seated half of the
 * mission. They used to be one behind the other on the line from the table to
 * the stage, with the view pointed down it: she sat behind his head, outside the
 * yaw clamp, unlookable-at, for twenty minutes of conversation.
 */
const facing = await page.evaluate(() => {
  const b = window.__silver;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const [his, hers] = b.room.anchors.frontSeats;
  const stage = b.room.anchors.stageCentre;
  const toward = (t, from) => Math.atan2(-(t.x - from.x), -(t.z - from.z));
  return {
    range: 1.7,
    toHer: Math.abs(wrap(toward(hers, his) - his.faceYaw)),
    toStage: Math.abs(wrap(toward(stage, his) - his.faceYaw)),
    apart: Math.hypot(hers.x - his.x, hers.z - his.z),
  };
});
check('his chair looks at her, with the stage a turn away and still inside the clamp',
  facing.toHer < 0.2 && facing.toStage < facing.range && facing.apart > 1
    && facing.apart < 2.2,
  `she is ${facing.toHer.toFixed(2)} rad off centre, the stage ${facing.toStage.toFixed(2)} `
    + `of ${facing.range}, ${facing.apart.toFixed(2)}m apart`);

/* ---- sitting down ----
 * Sitting down has to seat both of them. It used to seat only him unless the
 * optional chair-pull pad was used, so a player who simply sat down spent the
 * entire seated half of the evening talking to a woman standing beside the
 * table — and the harness never saw it, because the harness always pulled the
 * chair first.
 */
const satAlone = await page.evaluate(() => {
  const b = window.__silver;
  b.player.position.set(b.room.anchors.frontTable.x + 1.2, 1.66, b.room.anchors.frontTable.z + 1.2);
  b.game.chairPads.his.userData.interact.onUse();
  return { seated: b.game.seated, dateMode: b.date.mode, sitting: !!b.date.npc.seated,
    chairPulled: b.mission.flags.chairPulled };
});
check('sitting down puts her in the other chair, with no chair-pull involved',
  satAlone.seated && satAlone.dateMode === 'seated' && satAlone.sitting
    && !satAlone.chairPulled, JSON.stringify(satAlone));

/* Both of them back on their feet, so the optional pad is tested doing what it
 * is for rather than re-seating somebody already sitting. */
const chair = await page.evaluate(() => {
  const b = window.__silver;
  b.game.chairPads.his.userData.interact.onUse();       // he stands
  b.date.standFrom({ x: b.room.anchors.frontTable.x + 1.4, z: b.room.anchors.frontTable.z + 1.6 });
  b.date.follow();
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

/* A cutscene takes her over, and the end of one used to hand her back to
 * `follow` unconditionally — so the champagne stood her up out of her chair for
 * the rest of the evening, and the moment the band arrived she got up and walked
 * away from the table she had just said "oh, they're real" at. */
const stillSitting = await page.evaluate(() => {
  const b = window.__silver;
  const seat = b.room.anchors.frontSeats[1];
  return {
    mode: b.date.mode,
    sitting: !!b.date.npc.seated,
    off: Math.hypot(b.date.position.x - seat.x, b.date.position.z - seat.z),
  };
});
check('and both cutscenes leave her in her chair rather than on her feet',
  stillSitting.mode === 'seated' && stillSitting.sitting && stillSitting.off < 0.2,
  JSON.stringify(stillSitting));
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

/* ---- the sway ----
 *
 * Driven through `startSway()` and the real key handler, which is the whole
 * point. Starting the minigame by hand — which is what this used to do — tested
 * four lines of `Sway` and nothing else, and hid the fact that the dance was
 * unstartable: the latch went up nine hundred milliseconds before the first bar,
 * the frame loop judged it lost on the next frame, and `Woo.SwayCompleted` was
 * unreachable by any route a player could take.
 */
await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.end();
  b.settings.assist = true;                    // the wide window, not the tight one
});
await page.evaluate(() => window.__silver.debug.sway());
await tick(0.6, 0.1);
const swayPending = await page.evaluate(() => {
  const b = window.__silver;
  return {
    swayed: b.mission.flags.swayed, state: b.mission.state,
    running: b.game.swayRunning, starting: b.game.swayStarting, active: b.sway.active,
  };
});
check('getting up out of the chair is not itself a failed dance',
  swayPending.swayed === null && swayPending.state === 'sway' && swayPending.starting,
  JSON.stringify(swayPending));

await page.waitForTimeout(1100);               // the band gets to the bar, on a real clock
const swayLive = await page.evaluate(() => ({
  active: window.__silver.sway.active,
  running: window.__silver.game.swayRunning,
  bar: !!window.__silver.sway.view,
}));
check('and then there is a dance, running, with a bar to hit',
  swayLive.active && swayLive.running && swayLive.bar, JSON.stringify(swayLive));

/* The four bars, in one pass in the page.
 *
 * One pass because the real frame loop is running in there: a press per round
 * trip leaves twenty milliseconds of animation frames between each one, the
 * timing bar moves on, and the beat you were aiming at goes by unplayed. The
 * presses themselves are real keydowns through the real handler — the pinning
 * of `t` is the metronome standing still, not the input being faked. */
const swayPlay = await page.evaluate(() => {
  const b = window.__silver;
  const E = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  };
  b.sway.t = b.sway.beatLength * 0.5;             // dead on the first beat
  for (let i = 0; i < 6; i++) E();                // and mash it
  const mashed = {
    hits: b.sway.hits, misses: b.sway.misses, beat: b.sway.beat, active: b.sway.active,
  };
  for (let k = 1; k < 4; k++) {
    b.sway.t = b.sway.beatLength * (k + 0.5);
    E();
  }
  return {
    mashed,
    hits: b.sway.hits, misses: b.sway.misses, result: b.sway.result,
    active: b.sway.active, swayed: b.mission.flags.swayed,
    completed: b.woo.has('Woo.SwayCompleted'),
  };
});
check('six presses inside one beat is one judgement, not four hits and an early finish',
  swayPlay.mashed.hits === 1 && swayPlay.mashed.misses === 0
    && swayPlay.mashed.beat === 1 && swayPlay.mashed.active,
  JSON.stringify(swayPlay.mashed));
check('four beats on the beat is a dance, and it pays',
  swayPlay.hits === 4 && swayPlay.misses === 0 && swayPlay.result === 'good'
    && !swayPlay.active && swayPlay.swayed === 'good' && swayPlay.completed,
  JSON.stringify(swayPlay));

await page.waitForTimeout(3500);
await tick(1, 0.25);
const backAtTable = await page.evaluate(() => {
  const b = window.__silver;
  return {
    state: b.mission.state, seated: b.game.seated,
    dateMode: b.date.mode, hers: !!b.date.npc.seated, running: b.game.swayRunning,
  };
});
check('and it puts the evening back somewhere the rest of it is written for',
  backAtTable.state === 'performance' && backAtTable.seated
    && backAtTable.dateMode === 'seated' && !backAtTable.running,
  JSON.stringify(backAtTable));

/* Which is the thing that actually broke: stuck in `sway`, she stopped being
 * able to notice being kept waiting, for the rest of the mission. */
const impatience = await page.evaluate(() => {
  const b = window.__silver;
  const heard = [];
  const real = b.mission.hooks.onImpatient;
  b.mission.hooks.onImpatient = (key, st) => { heard.push(`${key}@${st}`); };
  b.mission.inState = 74;
  b.mission._impatient = 0;
  for (let i = 0; i < 20; i++) b.mission.update(0.5, { trailing: false });
  b.mission.hooks.onImpatient = real;
  return { heard, state: b.mission.state };
});
check('so she starts noticing being kept waiting again',
  impatience.heard.length > 0, `${impatience.state}: ${impatience.heard.join(', ') || 'silence'}`);

/* ---- the set ends ----
 * It used to wrap round to the top and play forever, so the third number — the
 * one three separate people tell you is *the* one — came round again, and with
 * it the callback, the toast and another offer to dance.
 */
for (let i = 0; i < 7; i++) {
  if (await page.evaluate(() => window.__silver.performance.setEnded)) break;
  await page.evaluate(() => {
    const p = window.__silver.performance;
    if (p.current) p.t = p.current.dur + 0.05;
  });
  await tick(0.4, 0.2);
  await page.waitForTimeout(2600);
}
const setEnd = await page.evaluate(() => {
  const b = window.__silver;
  return {
    ended: b.performance.setEnded, playing: b.performance.playing,
    played: b.performance.numbersPlayed.slice(),
    theOne: b.performance.numbersPlayed.filter((n) => n === 'third').length,
  };
});
check('the band play their four numbers, once each, and then the set is over',
  setEnd.ended && !setEnd.playing && setEnd.played.length === 4 && setEnd.theOne === 1,
  setEnd.played.join(' → '));

/* ---- checkpoint reload cannot pay a tip twice, and puts the evening back ----
 *
 * It used to save the flags, the money and the score, and drop the mission
 * state, the rounds already had, whether he was sitting down and every latch in
 * main.js — so a "restored" evening came back with the right number over a
 * mission that thought it was still standing on the pavement. Scramble
 * everything the checkpoint claims to own, and see what comes back.
 */
const reload = await page.evaluate(() => {
  const b = window.__silver;
  const snap = (x) => ({
    woo: x.woo.score, tips: x.woo.tipCount, money: x.game.money,
    state: x.mission.state, rounds: [...x.mission.roundsDone].sort().join(','),
    objectives: x.mission.objectives.length, ledger: x.woo.ledger.length,
    seated: x.game.seated, swayed: x.mission.flags.swayed, hers: x.date.mode,
  });
  b.dialogue.end();
  const cp = b.debug.save();
  const before = snap(b);
  b.woo.score = 3;
  b.woo.ledger.length = 0;
  b.woo.fired.delete('Woo.CookTipped');
  b.mission.state = 'arrived';
  b.mission.roundsDone.clear();
  b.mission.objectives.length = 0;
  b.mission.flags.swayed = null;
  b.game.seated = false;
  b.game.money = 7;
  b.date.follow();
  b.debug.load();
  const after = snap(b);
  // And then try to be paid again for everything already on the ledger
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return { cp: !!cp, before, after, farmed: b.woo.score, saved: !!cp.mission };
});
check('a checkpoint restores the score and the ledger',
  reload.after.woo === reload.before.woo && reload.after.tips === reload.before.tips
    && reload.after.ledger === reload.before.ledger,
  JSON.stringify(reload.after));
const cpFields = ['state', 'rounds', 'objectives', 'seated', 'swayed', 'hers', 'money'];
const cpWrong = cpFields.filter((k) => reload.after[k] !== reload.before[k]);
check('and it round-trips the evening it claims to: state, rounds, chairs and all',
  reload.saved && cpWrong.length === 0,
  cpWrong.length
    ? cpWrong.map((k) => `${k}: ${reload.before[k]} → ${reload.after[k]}`).join('; ')
    : `${reload.after.state}, rounds ${reload.after.rounds || 'none'}, seated ${reload.after.seated}`);
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

/* ---- the invitation, and what "rushed" is measured against ----
 *
 * `Woo.InvitationRushed` fired on every single run of this mission, careful or
 * not, because the judgement read `inState` two nodes after the move into
 * `invitation` had reset it — so it was measuring how fast the player reads a
 * menu. The harness never saw it, because it called the ending resolver
 * directly and never once used the invitation the game offers.
 */
const asked = await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.end();
  b.mission.inState = 150;                     // he has sat through the show
  const opened = b.debug.invite();
  return {
    opened, state: b.mission.state, options: b.dialogue.options.length,
    askedAfter: b.mission.askedAfter, rushed: b.mission.rushedIt,
  };
});
check('the invitation comes up off the back of the evening, with a way out of it',
  asked.opened && asked.state === 'invitation' && asked.options >= 5,
  JSON.stringify(asked));
check('and a man who sat through the show has not rushed it',
  asked.rushed === false && asked.askedAfter >= 150, JSON.stringify(asked));

const rushing = await page.evaluate(() => {
  const Mission = window.__silver.mission.constructor;
  const fresh = (secs) => {
    const m = new Mission();
    m.flags.showStarted = true;
    m.setState('performance');
    m.roundsDone = new Set(['entrance', 'drinks', 'family', 'personal']);
    m.inState = secs;
    const ok = m.offerInvitation();
    m.flags.invitation = 'plain';
    return { ok, rushed: m.rushedIt, askedAfter: m.askedAfter };
  };
  const declined = new Mission();
  declined.flags.showStarted = true;
  declined.setState('performance');
  declined.roundsDone = new Set(['entrance', 'drinks', 'family', 'personal']);
  declined.inState = 2;
  declined.offerInvitation();
  declined.flags.invitation = 'none';
  return { early: fresh(4), late: fresh(140), declined: declined.rushedIt };
});
check('but asking four seconds after the curtain is rushing it',
  rushing.early.ok && rushing.early.rushed && !rushing.late.rushed,
  JSON.stringify(rushing));
check('and deciding not to ask is never rushing it', rushing.declined === false, '');

await choose(0);                               // the plain one, and let it play out
await tick(2);
const judged = await page.evaluate(() => {
  const b = window.__silver;
  return {
    rushed: b.woo.has('Woo.InvitationRushed'),
    outcome: b.mission.flags.outcome,
    woo: b.woo.score,
  };
});
check('so the rush penalty stays in its box on a careful evening',
  !judged.rushed && !!judged.outcome, JSON.stringify(judged));

/* ---- and it ends ---- */
await page.waitForFunction(() => window.__silver.game.over, null, { timeout: 20000 });
const ended = await page.evaluate(() => ({
  over: window.__silver.game.over,
  card: document.getElementById('overlay').classList.contains('ending'),
  title: document.querySelector('#overlay .tag')?.textContent || '',
  saved: JSON.parse(localStorage.getItem('squatch.frontAndCenter') || 'null'),
}));
check('the evening ends on a card, reached by asking her rather than by a debug button',
  ended.over && ended.card && !!ended.saved?.outcome,
  `${ended.title} — ${ended.saved?.outcome}`);
check('and the relationship is written down for the next scene',
  !!ended.saved && ended.saved.delia?.met === true && typeof ended.saved.woo === 'number',
  JSON.stringify(ended.saved && {
    woo: ended.saved.woo, outcome: ended.saved.outcome,
    tipped: ended.saved.tippedEverybody, available: ended.saved.delia?.available,
  }));

/* ---- and the one line the score cannot buy back ----
 * Last, because it fires into the live ledger, and by here the evening has been
 * written down and there is nothing left to spoil. "Car's outside. Come on."
 * used to cost nothing whatsoever above eighty: the flag was set, the ending
 * looked at it, and the twelve points in the table never left the table.
 */
const crude = await page.evaluate(() => {
  const b = window.__silver;
  const opt = b.scripts.invitation.open.options().find((o) => o.tone === 'Overconfident');
  const before = b.woo.score;
  opt?.effect?.();
  const Mission = b.mission.constructor;
  const low = new Mission();
  low.flags.invitation = 'crude';
  return {
    found: !!opt, before, after: b.woo.score,
    fired: b.woo.has('Woo.CrudeInvitation'),
    andThen: low.resolve(50, 'decent'),
  };
});
check('"car’s outside, come on" costs what it costs at any score',
  crude.found && crude.fired && crude.after <= crude.before - 12
    && crude.andThen === 'disaster',
  JSON.stringify(crude));

check('nothing threw on the way round', problems.length === 0, problems.slice(0, 3).join(' / '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length
  ? `\n${failed.length} of ${results.length} checks failed.`
  : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);

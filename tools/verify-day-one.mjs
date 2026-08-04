#!/usr/bin/env node
/**
 * Verify the campaign handoff from the apartment's opening morning to the
 * first Bada Bing visit in a real browser.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAMPAIGN_VERSION } from '../src/core/campaign.js';
import { isApartmentPreloadCue } from '../src/core/apartment-audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5201;
const voiceManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const voiceIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/index.json'), 'utf8'));
const recordedFiles = new Set(voiceIndex.files || []);
const expectedApartmentCues = (voiceManifest.sfx || [])
  .filter((cue) => recordedFiles.has(cue.file || `${cue.name}.mp3`))
  .filter(isApartmentPreloadCue)
  .map((cue) => cue.name);
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Day One.');
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

const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  /* The verifier drives the room through its exposed game seam instead of
   * clicking Wake Up. Match that first user gesture here so voice assertions
   * exercise decoded production buffers, not the intentionally silent
   * pre-gesture AudioContext. */
  const audioLoadStartedAt = Date.now();
  const apartmentAudioLoad = await page.evaluate(async (expectedCues) => {
    const audio = window.__squatch.audio;
    await audio.init();
    const loaded = await audio.loadManifest();
    const resident = [...audio.buffers.keys()];
    return {
      loaded,
      plan: audio.preloadStats ?? null,
      resident: resident.length,
      missingExpected: expectedCues.filter((name) => !audio.buffers.has(name)),
      sceneOnlyVo: resident.filter((name) => name.startsWith('vo.beefrun.')
        || name.startsWith('vo.silver.')
        || name.startsWith('vo.bing.')
        || name.startsWith('vo.sf.')),
    };
  }, expectedApartmentCues);
  apartmentAudioLoad.wallMs = Date.now() - audioLoadStartedAt;
  check('the Apartment decodes its complete hub sound set without mission-only voice banks',
    apartmentAudioLoad.plan?.manifestTotal === voiceManifest.sfx.length
      && apartmentAudioLoad.plan?.selected === expectedApartmentCues.length
      && apartmentAudioLoad.loaded?.total === expectedApartmentCues.length
      && apartmentAudioLoad.loaded?.loaded === expectedApartmentCues.length
      && apartmentAudioLoad.resident === expectedApartmentCues.length
      && apartmentAudioLoad.missingExpected.length === 0
      && apartmentAudioLoad.sceneOnlyVo.length === 0,
    JSON.stringify({ ...apartmentAudioLoad, expected: expectedApartmentCues.length }));

  const initial = await page.evaluate(() => {
    const state = window.__squatch.campaign.state;
    let apartmentGun = null;
    window.__squatch.apartment.root.traverse((object) => {
      if (object.name === 'revolver') apartmentGun = object;
    });
    return {
      event: state.events.lou_first_call.status,
      mission: state.missions.bada_bing_one.status,
      scene: state.scene.id,
      timeMinutes: state.story.timeMinutes,
      liveMinutes: window.__squatch.time.minutes,
      phase: window.__squatch.time.phase,
      skyFrom: window.__squatch.time.skyFrom,
      skyTo: window.__squatch.time.skyTo,
      dayness: window.__squatch.time.dayness,
      gunVisible: apartmentGun?.visible,
    };
  });
  check('the campaign opens in the apartment', initial.scene === 'apartment', initial.scene);
  check('Lou has not already called', initial.event === 'pending', initial.event);
  check('Bada Bing starts locked', initial.mission === 'locked', initial.mission);
  check('the apartment revolver is absent before Lou’s first package',
    initial.gunVisible === false, String(initial.gunVisible));
  check('Day One starts at the authored 6:04 AM checkpoint',
    initial.timeMinutes === 6 * 60 + 4 && initial.liveMinutes === 6 * 60 + 4,
    JSON.stringify(initial));
  check('the first view outside is committed dawn rather than a night dissolve',
    initial.phase === 'dawn'
      && initial.skyFrom === 'dawn'
      && initial.skyTo === 'dawn'
      && initial.dayness >= 0.18,
    JSON.stringify(initial));

  const coffee = await page.evaluate(() => {
    const apartment = window.__squatch.apartment;
    const [min, max] = apartment.coffeeTable.bounds;
    const withinTable = (object) => object.position.x >= min[0] - 0.03
      && object.position.x <= max[0] + 0.03
      && object.position.z >= min[2] - 0.03
      && object.position.z <= max[2] + 0.03;
    return {
      rotation: apartment.coffeeTable.group.rotation.y,
      width: max[0] - min[0],
      depth: max[2] - min[2],
      items: Object.fromEntries(Object.entries(apartment.coffeeTableItems)
        .map(([name, object]) => [name, withinTable(object)])),
    };
  });
  check('the coffee table turns ninety degrees with every prop and use target still on it',
    Math.abs(coffee.rotation - Math.PI / 2) < 0.001
      && coffee.width < coffee.depth
      && Object.values(coffee.items).every(Boolean),
    JSON.stringify(coffee));

  await page.waitForTimeout(1200);
  const afterIdle = await page.evaluate(() => ({
    saved: window.__squatch.campaign.state.story.timeMinutes,
    live: window.__squatch.time.minutes,
  }));
  check('waiting in the apartment does not advance story time',
    afterIdle.saved === initial.timeMinutes && afterIdle.live === initial.liveMinutes,
    JSON.stringify(afterIdle));

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(6.1);
    return {
      ringing: game.phone.ringing,
      eventId: game.phone.call?.def?.eventId,
      from: game.phone.call?.def?.from,
      instruction: document.querySelector('#toast-stack')?.textContent?.trim(),
    };
  });
  check('Big Uncle Lou rings the physical phone after the player gets up',
    ringing.ringing && ringing.eventId === 'lou_first_call' && ringing.from === 'Big Uncle Lou',
    JSON.stringify(ringing));
  check('the incoming-call prompt explains the real two-step E control',
    ringing.instruction?.includes('Phone on the nightstand')
      && ringing.instruction.includes('press [E] to pick it up')
      && ringing.instruction.includes('then [E] to answer'),
    ringing.instruction);

  /* He is still in what he slept in, and that has to be beside the point. The
   * nightstand drawer's aim proxy stands three quarters of a metre proud of the
   * drawer and so encloses the phone lying on the nightstand; while it was a
   * hard target it answered for the phone, and the only way to reach a ringing
   * phone was to go and get changed first. So: aim at the phone with every
   * chore still undone, and take it the way a player does. */
  const reach = await page.evaluate(async () => {
    const game = window.__squatch;
    const THREE = await import('three');
    game.interaction.setPaused(false);
    game.player.mode = 'walk';
    game.player.position.set(-3.30, 1.66, -3.20);
    game.player.eyeHeight = 1.66;
    game.player.update(0.016);
    game.camera.up.set(0, 1, 0);
    game.camera.lookAt(new THREE.Vector3(-3.36, 0.62, -4.20));
    game.camera.updateMatrixWorld(true);
    game.interaction.update(0.016);
    const target = game.interaction.current;
    const label = target && (typeof target.userData.interact.label === 'function'
      ? target.userData.interact.label()
      : target.userData.interact.label);
    const emptyHotbarHidden = document.getElementById('hotbar')?.classList.contains('hidden');
    game.interaction.press();
    return {
      dressed: game.apartment.state.dressed,
      label,
      carrying: game.apartment.inventory.has('phone'),
      held: game.apartment.state.heldItem,
      emptyHotbarHidden,
      hotbarSlots: document.getElementById('hotbar')?.children.length,
      carriedInCampaign: game.campaign.state.inventory.carried.includes('phone'),
    };
  });
  check('the ringing phone can be picked up before he has changed clothes',
    reach.dressed === false
      && reach.label === 'Take your <b>phone</b>'
      && reach.carrying === true
      && reach.held === 'phone',
    JSON.stringify(reach));
  /* The slots are drawn before he is carrying anything. They used to appear
   * only once something was in them, so the one thing that says there ARE
   * pockets showed up after you had worked out that there were. */
  check('the carried slots are on screen with nothing in them',
    reach.emptyHotbarHidden === false && reach.hotbarSlots === 5,
    JSON.stringify(reach));

  /* THE bug: the phone was the first thing he had ever carried, [Q] is what
   * the hand card tells you puts things down, and dropHeld had a branch for
   * the can, the smokes and the whiskey and a silent `else` for everything
   * else that emptied the slot. The nightstand model had been hidden since
   * pickup, so one press deleted the only object Lou can reach him through.
   *
   * Making it undroppable fixed the deletion and left [Q] doing nothing at
   * all while it was in his hand, which reads as broken in its own right. So
   * [Q] POCKETS it: out of the hand, out of the hand card, still in the
   * hotbar, still in the save, and back out with its own number key. */
  const kept = await page.evaluate(() => {
    const game = window.__squatch;
    game.game.inBed = false;
    game.player.mode = 'walk';
    const slot = game.apartment.inventory.items.indexOf('phone');
    // What [Q] reaches once it has finished asking about beds and toilets.
    game.dropHeld();
    let nightstandPhone = null;
    game.apartment.root.traverse((o) => { if (o.name === 'phone') nightstandPhone = o; });
    const pocketed = {
      carrying: game.apartment.inventory.has('phone'),
      held: game.apartment.state.heldItem,
      handHidden: document.getElementById('hand-item')?.classList.contains('hidden'),
      backOnNightstand: nightstandPhone?.visible,
      carriedInCampaign: game.campaign.state.inventory.carried.includes('phone'),
      slot,
    };
    // And back out again.
    game.apartment.inventory.select(slot);
    return { ...pocketed, retaken: game.apartment.state.heldItem };
  });
  check('[Q] pockets his phone instead of destroying it, and it comes back out',
    kept.carrying === true
      && kept.held === null
      && kept.handHidden === true
      && kept.backOnNightstand === false
      && kept.carriedInCampaign === true
      && kept.retaken === 'phone',
    JSON.stringify(kept));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    if (!game.apartment.inventory.has('phone')) game.apartment.inventory.add('phone');
    game.audio.clearPlaybackLog?.();
    game.phone.press();
    return {
      inCall: game.phone.inCall,
      dressed: game.apartment.state.dressed,
      event: game.campaign.state.events.lou_first_call.status,
      mission: game.campaign.state.missions.bada_bing_one.status,
      changedClothes: game.campaign.state.activities.changedClothes,
      timeMinutes: game.campaign.state.story.timeMinutes,
      liveMinutes: game.time.minutes,
    };
  });
  check('answering before the wardrobe leaves the campaign consistent',
    answered.dressed === false
      && answered.changedClothes === false
      && answered.event === 'answered'
      && answered.mission === 'available',
    JSON.stringify(answered));

  /* He answers out loud now. Drive the call until it is his turn and check the
   * cue it reaches is a real one in the manifest, in the player's voice, with
   * the words that are on the screen -- and that an unrecorded reply still
   * holds for a reading beat rather than stalling the call. */
  const reply = await page.evaluate(async () => {
    const game = window.__squatch;
    // The first update after answering is Big Uncle Lou's first audible line.
    // Inspect the real AudioBuffer path before moving the scripted call on to
    // Tony's currently unrecorded answer.
    if (game.phone.call?.line < 0) game.phone.update(0.25);
    const caller = game.phone.call?.turns?.[game.phone.call.line];
    const callerPlayback = game.audio.playbacks
      .filter((playback) => playback.name === caller?.cue)
      .at(-1);
    let turn = null;
    for (let i = 0; i < 400 && game.phone.inCall && !turn; i++) {
      game.phone.update(0.25);
      const t = game.phone.call?.turns?.[game.phone.call.line];
      if (t?.who === 'me') turn = t;
    }
    const manifest = await fetch('assets/sfx/manifest.json').then((r) => r.json());
    const cue = manifest.sfx.find((c) => c.name === turn?.cue);
    return {
      callerCue: caller?.cue,
      callerBufferCount: game.audio.buffers.get(caller?.cue)?.length ?? 0,
      callerPlayback: callerPlayback ? {
        source: callerPlayback.source,
        decodedDuration: callerPlayback.decodedDuration,
        gain: callerPlayback.gain,
        connectedToSfx: callerPlayback.connectedToSfx,
      } : null,
      cue: turn?.cue,
      text: turn?.text,
      voice: cue?.voice,
      says: cue?.say,
      hold: game.phone.call?.hold,
      stillTalking: game.phone.inCall,
    };
  });
  check('Tony’s reply on Lou’s call resolves to a cue in his own voice',
    reply.cue === 'vo.call.lou.bada_bing.tony.1'
      && reply.voice === 'player'
      && reply.says === reply.text
      && reply.stillTalking === true
      && reply.hold > 0,
    JSON.stringify(reply));
  check('answering the held phone persists Lou’s call',
    answered.inCall && answered.event === 'answered', JSON.stringify(answered));
  check('Big Uncle Lou first phone line is a decoded, audible SFX-buffer playback',
    reply.callerCue === 'vo.call.lou.bada_bing.1'
      && reply.callerPlayback?.source === 'buffer'
      && reply.callerPlayback.decodedDuration > 0
      && reply.callerPlayback.gain > 0
      && reply.callerPlayback.connectedToSfx === true,
    JSON.stringify(reply.callerPlayback));
  check('the answered call unlocks Bada Bing', answered.mission === 'available', answered.mission);
  check('answering Lou advances the saved and displayed clock by three minutes',
    answered.timeMinutes === 6 * 60 + 7 && answered.liveMinutes === 6 * 60 + 7,
    JSON.stringify(answered));


  /* ---------------------------------------------------------------- */
  /* The first morning is a tutorial with seventeen hours in it        */
  /* ---------------------------------------------------------------- */

  /* Day One's list used to be four chores and a call, which is a morning's
   * work in a day that does not start until a quarter to midnight. The rest
   * of the tutorial -- the inbox, the computer, a game of Squatch Smash -- was
   * nowhere on it, and neither was the fact that a man with nothing on can go
   * back to bed. */
  const panel = await page.evaluate(() => {
    const game = window.__squatch;
    game.updateObjectives();
    const plan = game.apartmentStory.objectives(game.activityContext());
    const drawn = [...document.querySelectorAll('#objectives .olist li')].map((li) => ({
      text: li.textContent,
      required: li.classList.contains('required'),
      done: li.classList.contains('done'),
    }));
    return { items: plan.items, drawn, hidden: document.getElementById('objectives')?.classList.contains('hidden') };
  });
  const optional = panel.items.filter((i) => !i.required);
  check('Day One lists its optional tutorial beats as optional',
    optional.some((i) => i.id === 'emailChecked')
      && optional.some((i) => i.id === 'pcUsed')
      && optional.some((i) => i.id === 'playedGame')
      && panel.items.filter((i) => i.required).length >= 5,
    JSON.stringify(panel.items.map((i) => `${i.id}${i.required ? '!' : '?'}`)));
  check('the optional beats say how to skip the wait for the Bing',
    optional.some((i) => i.id === 'killtime' && /sleep it off|have a drink/i.test(i.label)),
    JSON.stringify(optional.map((i) => i.label)));
  check('the panel draws required and optional differently',
    panel.hidden === false
      && panel.drawn.some((li) => li.required)
      && panel.drawn.some((li) => !li.required && !li.done),
    JSON.stringify(panel.drawn.map((li) => `${li.required ? 'R' : 'o'}:${li.text.slice(0, 18)}`)));

  /* ---------------------------------------------------------------- */
  /* The flat on the first morning                                     */
  /* ---------------------------------------------------------------- */

  /* The core finding: apartment.js had no reference to the campaign chapter
   * at all, so every morning was dressed identically. Day One's flat is the
   * anonymous one -- a lanyard for the job he is about to stop turning up to,
   * and not one thing he has not earned yet. */
  const dayOneRoom = await page.evaluate(() => {
    const game = window.__squatch;
    const shown = [];
    const hidden = [];
    for (const [id, piece] of game.apartment.dressing) {
      (piece.group.visible ? shown : hidden).push(id);
    }
    return { chapter: game.apartment.dressedChapter(), shown, hidden, raining: game.apartment.state.raining };
  });
  check('the flat is dressed for Day One and for no other day',
    dayOneRoom.chapter === 'day_one'
      && dayOneRoom.shown.includes('lanyard')
      && dayOneRoom.shown.includes('willyPhoto')
      && !dayOneRoom.shown.includes('bloodShirt')
      && !dayOneRoom.shown.includes('cashStacks')
      && !dayOneRoom.shown.includes('gunCase')
      && !dayOneRoom.shown.includes('suitBag')
      && dayOneRoom.raining === false,
    JSON.stringify(dayOneRoom.shown));
  check('no trophy from a mission he has not run yet is on show',
    ['cashSmall', 'cashMid', 'cashStacks', 'motelKey', 'silverMatches', 'bingMatches',
      'jerkyHaul', 'laundryHeap', 'casualJacket', 'willyGap']
      .every((id) => dayOneRoom.hidden.includes(id)),
    JSON.stringify(dayOneRoom.hidden));

  /* ---------------------------------------------------------------- */
  /* The pizza, end to end                                             */
  /* ---------------------------------------------------------------- */

  /* Owner report: taking a slice put nothing in inventory and it could not be
   * eaten. Three separate faults -- no model in the hand, a hold bar handed an
   * object where it wanted a number so eating showed you nothing at all, and
   * [Q] deleting the slice through the same silent else that once ate the
   * phone. Driven here exactly as a player would drive it. */
  const pizza = await page.evaluate(async () => {
    const game = window.__squatch;
    const THREE = await import('three');
    game.interaction.setPaused(false);
    game.player.mode = 'walk';
    game.player.position.set(-2.55, 1.66, 0.74);
    game.player.eyeHeight = 1.66;
    game.player.update(0.016);
    game.camera.up.set(0, 1, 0);
    game.camera.lookAt(new THREE.Vector3(-3.48, 0.47, 0.74));
    game.camera.updateMatrixWorld(true);
    game.interaction.update(0.016);
    const target = game.interaction.current;
    const label = target && (typeof target.userData.interact.label === 'function'
      ? target.userData.interact.label() : target.userData.interact.label);
    const slicesBefore = game.apartment.pizza.slicesLeft();
    game.interaction.press();
    const held = game.apartment.state.heldItem;
    game.heldSlice.group.visible = game.apartment.state.heldItem === 'slice';
    const inHand = game.heldSlice.group.visible;
    const handName = document.querySelector('#hand-item .name')?.textContent;

    // Eat it. The hold bar has to move, and the campaign has to record it.
    game.apartment.state.fed = false;
    game.player.keys.add('KeyF');
    game.game.seated = false;
    let barMoved = false;
    for (let i = 0; i < 40; i++) {
      game.updateConsume(0.1);
      const w = parseFloat(document.querySelector('#prompt .holdbar i')?.style?.width || '0');
      if (w > 0 && w < 100) barMoved = true;
    }
    game.player.keys.delete('KeyF');
    return {
      label,
      slicesBefore,
      held,
      inHand,
      handName,
      barMoved,
      afterHeld: game.apartment.state.heldItem,
      fed: game.apartment.state.fed,
      eaten: game.campaign.state.activities.eaten,
      slicesAfter: game.apartment.pizza.slicesLeft(),
    };
  });
  check('a slice can be taken, is visibly in his hand, and can be eaten',
    pizza.label === 'Take a <b>slice</b>'
      && pizza.held === 'slice'
      && pizza.inHand === true
      && pizza.handName === 'Slice of pizza'
      && pizza.barMoved === true
      && pizza.afterHeld === null
      && pizza.fed === true
      && pizza.eaten === true,
    JSON.stringify(pizza));

  /* Nothing [Q] touches may cease to exist. The slice goes back in the box it
   * came out of; the revolver goes back on the coffee table it came off. */
  const dropped = await page.evaluate(() => {
    const game = window.__squatch;
    game.game.inBed = false;
    game.player.mode = 'walk';
    game.apartment.inventory.add('slice');
    const boxBefore = game.apartment.pizza.slicesLeft();
    game.dropHeld();
    const sliceBack = game.apartment.pizza.slicesLeft() === boxBefore + 1
      && !game.apartment.inventory.has('slice');

    let revolver = null;
    game.apartment.root.traverse((o) => { if (o.name === 'revolver') revolver = o; });
    revolver.visible = false;               // as if he had picked it up
    game.apartment.inventory.add('gun');
    game.dropHeld();
    return {
      sliceBack,
      gunHeld: game.apartment.state.heldItem,
      gunCarried: game.apartment.inventory.has('gun'),
      gunOnTable: revolver?.visible,
      boxBefore,
      boxAfter: game.apartment.pizza.slicesLeft(),
    };
  });
  check('[Q] destroys nothing: the slice goes back in the box',
    dropped.sliceBack === true, JSON.stringify(dropped));
  /* The revolver is still locked on Day One, so `dropGun` refuses -- and a
   * refusal has to mean he keeps it rather than that it evaporates. */
  check('[Q] destroys nothing: a gun it cannot put down stays in his hands',
    dropped.gunOnTable === true || dropped.gunCarried === true,
    JSON.stringify(dropped));

  /* ---------------------------------------------------------------- */
  /* Killing time                                                      */
  /* ---------------------------------------------------------------- */

  /* Day One is explicitly no rush. Lying down is how a man spends a day with
   * nothing in it -- toward the evening rather than into tomorrow -- and the
   * save has to agree with the clock on the wall afterwards. */
  await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.clear();
    game.game.inBed = true;
    game.sleepInBed();
  });
  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, { timeout: 20000 });
  const napped = await page.evaluate(() => ({
    liveDay: window.__squatch.time.day,
    liveMinutes: window.__squatch.time.minutes,
    savedDay: window.__squatch.campaign.state.story.day,
    savedMinutes: window.__squatch.campaign.state.story.timeMinutes,
    chapter: window.__squatch.campaign.state.story.chapter,
    door: window.__squatch.apartmentStory.tryLeave({
      eaten: true, showered: true, peed: true, pooped: true, changedClothes: true,
    }),
  }));
  check('a Day One nap kills the day toward the evening and is saved',
    napped.liveDay === 1
      && napped.liveMinutes === 19 * 60
      && napped.savedDay === 1
      && napped.savedMinutes === 19 * 60
      && napped.chapter === 'day_one'
      && napped.door?.destination === 'bada_bing_one',
    JSON.stringify(napped));

  /* The morning's other errand needs a cause, and until now the only two were
   * four cigarettes or nothing. All three routes are checked live because the
   * numbers are the whole feature: a route that leaves the meter short is a
   * required chore with no way to finish it. */
  const urges = await page.evaluate(() => {
    const game = window.__squatch;
    const st = game.apartment.state;
    const run = (fn) => {
      st.bowel = 0;
      st.bowelCause = null;
      st.urgeAnnounced = false;
      fn();
      return { bowel: st.bowel, cause: st.bowelCause };
    };

    // One pouch.
    st.lipPacked = false;
    const zyn = run(() => game.takeZyn());
    st.lipPacked = false;

    // One pull on the jug, driven through the real [F] hold rather than poked.
    st.heldItem = 'milk';
    const milkBefore = st.milkLeft;
    const bladderBefore = st.bladder;
    const milk = run(() => {
      game.player.keys.add('KeyF');
      for (let i = 0; i < 240; i++) game.updateConsume(1 / 60);
      game.player.keys.delete('KeyF');
    });
    st.heldItem = null;

    /* And once a morning. A dart is what gets things started, not a lever that
     * marches you off the balcony every time you pull it, so both routes are
     * asked again with the business already done -- the pouch through
     * `startTheUrge`, the eggs through their own partial. */
    game.game.pooped = true;
    st.lipPacked = false;
    const zynAfter = run(() => game.takeZyn());
    st.panState = 'done';
    const eggsAfter = run(() => game.eatEggs());
    game.game.pooped = false;
    st.lipPacked = false;

    return {
      zyn,
      milk,
      zynAfter,
      eggsAfter,
      milkTaken: milkBefore - st.milkLeft,
      bladderRose: st.bladder > bladderBefore,
    };
  });
  check('one zyn is enough on its own, and says so',
    urges.zyn.bowel === 1 && urges.zyn.cause === 'zyn',
    JSON.stringify(urges.zyn));
  check('a pull of raw milk fills both tanks and is the third route to the toilet',
    urges.milk.bowel === 1
      && urges.milk.cause === 'milk'
      && urges.milkTaken === 1
      && urges.bladderRose,
    JSON.stringify(urges));
  check('having been once, nothing sends him back -- not the zyn, not the eggs',
    urges.zynAfter.bowel === 0 && urges.zynAfter.cause === null
      && urges.eggsAfter.bowel === 0 && urges.eggsAfter.cause === null,
    JSON.stringify({ zynAfter: urges.zynAfter, eggsAfter: urges.eggsAfter }));

  /* The door has been a silent line of text since the Goals object stopped
   * being called, with thirty-two delivered takes unreachable behind it.
   *
   * Waiting on the takes rather than assuming them: the apartment's wider
   * library fills in behind play, and the point of the check is that the door
   * speaks once it can, not that a headless run got there first. */
  await page.waitForFunction(
    () => window.__squatch.audio.hasSample('vo.door.piss.1')
      && window.__squatch.audio.hasSample('vo.door.poop.1'),
    null,
    { timeout: 120000 },
  );
  const doorVoice = await page.evaluate(() => {
    const game = window.__squatch;
    const st = game.apartment.state;
    st.fed = true;
    st.showered = true;
    st.dressed = true;
    game.game.peed = false;
    game.game.pooped = false;

    const spoken = () => game.audio.playbacks
      .filter((playback) => playback.name.startsWith('vo.door.'))
      .map((playback) => playback.name);
    const stack = document.querySelector('#toast-stack');
    const clearToasts = () => { if (stack) stack.textContent = ''; };

    /* The gate walk above already tried the handle once over each of these,
     * and the escalation is per-reason and deliberately sticky, so wind it
     * back to a man who has not tried this door yet today. */
    game.doorTries.clear();
    clearToasts();
    game.audio.clearPlaybackLog();
    const first = game.tryLeave();
    const afterFirst = spoken();
    const firstToast = document.querySelector('#toast-stack')?.textContent ?? '';

    // Second time over the same thing, he also tells himself how.
    clearToasts();
    game.audio.clearPlaybackLog();
    game.tryLeave();
    const afterSecond = spoken();
    const secondToast = document.querySelector('#toast-stack')?.textContent ?? '';

    game.game.peed = true;
    clearToasts();
    game.audio.clearPlaybackLog();
    const dump = game.tryLeave();
    game.tryLeave();
    return {
      firstId: first?.id,
      afterFirst,
      afterSecond,
      firstToast,
      secondToast,
      dumpId: dump?.id,
      dumpToast: document.querySelector('#toast-stack')?.textContent ?? '',
      dumpVo: spoken(),
    };
  });
  check('the door speaks its refusal instead of only printing it',
    doorVoice.firstId === 'peed'
      && doorVoice.afterFirst.some((name) => name.startsWith('vo.door.piss.')),
    JSON.stringify(doorVoice.afterFirst));
  check('trying the same locked door twice adds the how, not just the what',
    doorVoice.firstToast.trim() === ''
      && /toilet/i.test(doorVoice.secondToast)
      && doorVoice.afterSecond.some((name) => name.startsWith('vo.door.piss.')),
    JSON.stringify({ first: doorVoice.firstToast, second: doorVoice.secondToast }));
  check('the one hint that cannot be guessed from the room names the dart, the zyn and the milk',
    doorVoice.dumpId === 'pooped'
      && /dart|zyn/i.test(doorVoice.dumpToast)
      && /milk/i.test(doorVoice.dumpToast)
      && doorVoice.dumpVo.some((name) => name.startsWith('vo.door.poop.')),
    JSON.stringify({ toast: doorVoice.dumpToast, vo: doorVoice.dumpVo }));

  const gates = await page.evaluate(() => {
    const game = window.__squatch;
    const state = game.apartment.state;
    state.fed = false;
    state.showered = false;
    game.game.peed = false;
    game.game.pooped = false;
    state.dressed = false;
    state.repliedHR = false;

    const found = [];
    found.push(game.tryLeave()?.id);
    state.fed = true;
    found.push(game.tryLeave()?.id);
    state.showered = true;
    found.push(game.tryLeave()?.id);
    game.game.peed = true;
    found.push(game.tryLeave()?.id);
    game.game.pooped = true;
    found.push(game.tryLeave()?.id);
    state.dressed = true;
    const go = game.tryLeave();
    return { found, go, emailChecked: state.repliedHR };
  });
  check('the live door reports the five chores in order',
    JSON.stringify(gates.found)
      === JSON.stringify(['eaten', 'showered', 'peed', 'pooped', 'changedClothes']),
    JSON.stringify(gates.found));
  check('email remains optional for departure',
    gates.emailChecked === false && gates.go?.destination === 'bada_bing_one',
    JSON.stringify(gates.go));

  await page.waitForURL(`http://localhost:${PORT}/bing.html`, { timeout: 10000 });
  await page.waitForFunction(() => window.__bing?.campaign, null, { timeout: 60000 });
  /* The clock paints on the Bing's first HUD frame, which on a swiftshader
   * run is not the frame after `__bing` appears. Five seconds was already the
   * thin end of it and flaked outright once this file grew a decode wait. */
  await page.waitForFunction(
    () => document.querySelector('#clock .time')?.textContent?.trim(),
    null,
    { timeout: 30000 },
  );
  const arrived = await page.evaluate(() => {
    const state = window.__bing.campaign.state;
    return {
      scene: state.scene.id,
      spawn: state.scene.spawn,
      mission: state.missions.bada_bing_one.status,
      activities: state.activities,
      event: state.events.lou_first_call.status,
      timeMinutes: state.story.timeMinutes,
      timeEvents: state.story.timeEvents,
      carried: state.inventory.carried,
      clock: document.querySelector('#clock .time')?.textContent?.trim(),
    };
  });
  // It is how the rest of the cast reaches him; it does not stay at home.
  check('the phone travels to the Bing with him',
    arrived.carried.includes('phone'), JSON.stringify(arrived.carried));
  check('the apartment door routes directly to Bada Bing',
    arrived.scene === 'bada_bing_one' && arrived.spawn === 'driver_seat',
    `${arrived.scene}/${arrived.spawn}`);
  check('the story handoff persists mission and activity state',
    arrived.mission === 'in_progress'
      && arrived.event === 'answered'
      && arrived.activities.eaten
      && arrived.activities.showered
      && arrived.activities.peed
      && arrived.activities.pooped
      && arrived.activities.changedClothes
      && !arrived.activities.emailChecked,
    JSON.stringify(arrived));
  check('travel advances once to the authored 11:41 PM Bing arrival',
    arrived.timeMinutes === 23 * 60 + 41
      && arrived.timeEvents.includes('call.lou_first')
      && arrived.timeEvents.includes('travel.bada_bing_one')
      && arrived.clock === '11:41 PM',
    JSON.stringify(arrived));

  /* The durable packageReceived milestone, rather than the parcel currently
   * being in inventory, keeps the apartment gun unlocked on later returns. */
  await page.evaluate(() => {
    const campaign = window.__bing.campaign;
    campaign.update((state) => {
      state.missions.bada_bing_one.status = 'complete';
      state.missions.bada_bing_one.packageReceived = true;
      state.missions.squatchfather.status = 'complete';
      state.inventory.concealed = [];
    });
    campaign.transition('apartment', { spawn: 'front_door' });
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartment, null, { timeout: 60000 });
  const laterGun = await page.evaluate(() => {
    let apartmentGun = null;
    window.__squatch.apartment.root.traverse((object) => {
      if (object.name === 'revolver') apartmentGun = object;
    });
    let nightstandPhone = null;
    window.__squatch.apartment.root.traverse((object) => {
      if (object.name === 'phone') nightstandPhone = object;
    });
    return {
      visible: apartmentGun?.visible,
      packageReceived:
        window.__squatch.campaign.state.missions.bada_bing_one.packageReceived,
      carriesPackage:
        window.__squatch.campaign.state.inventory.concealed.includes('parcel'),
      carriesPhone: window.__squatch.apartment.inventory.has('phone'),
      phoneOnNightstand: nightstandPhone?.visible,
    };
  });
  check('he comes home with the phone still in his pocket',
    laterGun.carriesPhone === true && laterGun.phoneOnNightstand === false,
    JSON.stringify(laterGun));
  check('the revolver returns after Lou’s package and remains after delivery',
    laterGun.visible === true
      && laterGun.packageReceived === true
      && laterGun.carriesPackage === false,
    JSON.stringify(laterGun));

  const corruptRaw = '{"version":1,"scene":';
  await page.evaluate((raw) => {
    localStorage.setItem('squatchlife.campaign', raw);
  }, corruptRaw);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: 60000 });
  /* "Visibly" means visible to a person, so wake up first. The notice used to
   * be raised 200ms into module scope, behind the title card and gone twelve
   * seconds later -- long before the apartment had even finished building on
   * this machine, let alone before anyone had clicked through to look at it. */
  await page.click('#start-btn');
  /* Waking up loads the whole sound manifest before the room appears, so wait
   * for the notice rather than for a fixed beat -- and swallow the timeout, so
   * a notice that never comes is reported by the check below instead of
   * throwing out of the whole run. */
  await page.waitForFunction(
    () => document.querySelector('#toast-stack')?.textContent?.includes('Save recovered'),
    null,
    { timeout: 60000 },
  ).catch(() => {});
  const recovered = await page.evaluate(() => ({
    state: window.__squatch.campaign.state,
    recovery: window.__squatch.campaign.recovery,
    storedRecovery: JSON.parse(localStorage.getItem('squatchlife.campaign.recovery')),
    storedVersion: JSON.parse(localStorage.getItem('squatchlife.campaign')).version,
    recoveryNotice: document.querySelector('#toast-stack')?.textContent?.trim(),
  }));
  check('corrupt browser saves are preserved and visibly recovered',
    recovered.state.version === CAMPAIGN_VERSION
      && recovered.state.scene.id === 'apartment'
      && recovered.storedVersion === CAMPAIGN_VERSION
      && recovered.recovery?.reason === 'invalid_json'
      && recovered.recovery?.raw === corruptRaw
      && recovered.storedRecovery?.raw === corruptRaw
      && recovered.recoveryNotice?.includes('Save recovered'),
    JSON.stringify(recovered));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Day One checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Day One checks passed.`);

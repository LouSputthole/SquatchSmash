#!/usr/bin/env node
/**
 * Verify the Day Four handoff in a real browser: the Silver Room return,
 * Margo's morning, Lou's Silver Pines call, the three-hole round and return,
 * then Lou's heist call, preparation, and the apartment door routing into
 * THE TAKE while Initiation remains locked.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5213;
const CAPTURE = process.argv.find((arg) => arg.startsWith('--capture='))?.slice('--capture='.length) || null;
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
  console.error('playwright is not installed; cannot verify the big night.');
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

/*
 * The state the Silver Room's end card leaves behind: Day 3, twenty past
 * eleven at night, standing at his own front door with the Motel long done,
 * the date behind him, and the Golf morning before the big job and big night.
 *
 * Day 3 is the `date` chapter. Sleeping it off turns the page onto Day 4's
 * `golf_morning`; completing Silver Pines opens `heist_day` later that morning.
 */
await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 2,
    revision: 44,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'date',
      day: 3,
      timeMinutes: 23 * 60 + 20,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
      timeEvents: [
        'activity.eat', 'activity.shower', 'activity.poop',
        'activity.change_clothes', 'call.lou_first', 'travel.bada_bing_one',
        'call.booski_day_two', 'travel.airstrip', 'mission.airstrip',
        'call.lou_second', 'travel.bada_bing_two', 'mission.bada_bing_two',
        'travel.jerky_motel', 'mission.jerky_motel',
        'call.margo_date', 'travel.silver_room', 'mission.silver_room',
      ],
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: false,
    },
    inventory: { carried: [], concealed: [] },
    missions: {
      bada_bing_one: { status: 'complete', packageReceived: true, ending: 'front' },
      squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
      airstrip_smuggling: {
        status: 'complete', checkpoint: 'landed_home', cargoLoaded: true,
        detected: false, landingQuality: 'clean',
      },
      bada_bing_two: { status: 'complete', assignment: 'reserve_pickup' },
      jerky_motel: {
        status: 'complete', ending: 'home', cargoRecovered: true,
        packagesIntact: 6, freshness: 74, policeHeat: 12,
      },
      silver_room: {
        status: 'complete', outcome: 'strong', woo: 74, band: 'strong',
        tippedEverybody: true, rememberedDrink: true,
        seeingHerAgain: true, knowsWhatHeDoes: true,
      },
      initiation: { status: 'locked' },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'answered' },
      lou_second_call: { status: 'answered' },
      margo_date_call: { status: 'answered' },
      booski_big_night_call: { status: 'pending' },
    },
  }));
});

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const home = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      tag: document.querySelector('#overlay .tag')?.textContent ?? '',
      day: game.time.day,
      minutes: game.time.minutes,
      door: game.apartmentStory.tryLeave({
        eaten: true, showered: true, peed: true, pooped: true, changedClothes: true,
      }),
    };
  });
  check('the apartment recognises the return from the Silver Room',
    home.tag.includes('Silver Room')
      && home.day === 3
      && Math.abs(home.minutes - (23 * 60 + 20)) < 1,
    JSON.stringify(home));
  /* ---------------------------------------------------------------- */
  /* The third morning, before it is slept off                         */
  /* ---------------------------------------------------------------- */

  /* Day 3 is the `date` chapter, and its whole job is atmosphere: a grey wet
   * morning, the Motel on the wire, and Willy quietly off the fridge door
   * with nobody saying a word about it. */
  const dateRoom = await page.evaluate(() => {
    const game = window.__squatch;
    const shown = [];
    for (const [id, piece] of game.apartment.dressing) {
      if (piece.group.visible) shown.push(id);
    }
    return {
      chapter: game.apartment.dressedChapter(),
      shown,
      raining: game.apartment.state.raining,
      messages: game.apartment.messagesWaiting(),
      lou: game.apartmentStory.messages().list[0]?.from,
      vague: game.apartmentStory.messages().list
        .some((m) => m.lines.some((l) => /Willy|plain|may need doing/i.test(l))),
      motelOnTheWire: /motel/i.test(game.apartmentStory.news()?.radio?.line || ''),
    };
  });
  check('the third morning is wet, grey, and missing Willy',
    dateRoom.chapter === 'date'
      && dateRoom.raining === true
      && dateRoom.shown.includes('rain')
      && dateRoom.shown.includes('willyGap')
      && !dateRoom.shown.includes('willyPhoto')
      && dateRoom.shown.includes('motelKey')
      && dateRoom.shown.includes('casualJacket')
      // Still an accumulating flat: Day Two's things are all still here.
      && dateRoom.shown.includes('bloodShirt')
      && dateRoom.shown.includes('cashSmall'),
    JSON.stringify(dateRoom.shown));
  check('Lou has stopped saying things, and the Motel is on the news',
    dateRoom.messages === 2
      && dateRoom.lou === 'Big Uncle Lou'
      && dateRoom.vague === true
      && dateRoom.motelOnTheWire === true,
    JSON.stringify(dateRoom));

  /* Enter through the same first gesture as a player. This starts WebAudio,
   * hides the return card, and lets the visual/audio assertions below inspect
   * the actual scene rather than a simulation running behind the title card. */
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => window.__squatch.game.started === true, null, { timeout: 30000 });

  check('the door sends him to bed instead of out to the Circle',
    home.door?.kind === 'stay' && home.door?.id === 'sleep_before_big_night',
    JSON.stringify(home.door));

  /* ---------------------------------------------------------------- */
  /* G1 (2026-08-06 playtest): the night she comes home, on all fours   */
  /* until the glue effect actually lands on her back                   */
  /* ---------------------------------------------------------------- */

  /* Driven directly rather than by replaying the Silver Room mission: the
   * scene's natural trigger, `apartmentStory.margoComeHomeOwed()`, only
   * fires once at boot off a `cameHome` verdict this fixture never carries.
   * `startMargoComeHome` and the rest of the scene's driver functions are on
   * `window.__squatch` for exactly this -- exercising the beat without
   * earning a whole mission's 'perfect'/'strong' ending first. */
  const comeHomeStart = await page.evaluate(() => {
    const game = window.__squatch;
    game.startMargoComeHome();
    // Skip the six-second walk to the bedside; nothing under test happens there.
    game.game.margoScene.walkStart = performance.now() - 7000;
    game.updateMargoWake(1 / 60);
    return {
      running: !!game.game.margoScene,
      kind: game.game.margoScene?.kind,
      pose: game.apartment.margo.pose,
    };
  });
  check('the come-home scene starts standing, walked in from the door',
    comeHomeStart.running && comeHomeStart.kind === 'comeHome'
      && comeHomeStart.pose === 'standing',
    JSON.stringify(comeHomeStart));

  await page.waitForFunction(
    () => window.__squatch.game.margoScene?.awaitingHelp === true,
    null,
    { timeout: 60000 },
  );
  /* Same power-bar drive as the morning's dress-help beat (`dressGame` below):
   * tap to start it, then hit every pull with the marker centred in the
   * window, so the fastening completes deterministically.
   *
   * The three snapshots below -- just-fastened, mid-landing, landed -- are
   * captured inside ONE `page.evaluate`, not three. Split across separate
   * round trips, the page's own render loop keeps calling `updateMargoWake`
   * in real time between them (it runs unconditionally every animation
   * frame), so the ramp could sneak past 33/34 of the way to its target
   * before the "still holding" snapshot ever executes and make this flaky.
   * A single synchronous script cannot be interleaved by that loop. */
  const comeHome = await page.evaluate(() => {
    const game = window.__squatch;
    const target = game.apartment.margo.helpTarget;
    if (game.interaction.current !== target) game.interaction.current = target;
    game.interaction.press();
    const bar = game.margoDress.bar;
    for (let i = 0; i < bar.total; i++) {
      game.updateMargoDressHelp(1 / 60);
      bar.pos = (bar.window[0] + bar.window[1]) / 2;
      bar.press();
    }
    const snap = () => ({
      running: !!game.game.margoScene,
      paused: game.interaction.paused,
      visible: game.apartment.margo.group.visible,
      pose: game.apartment.margo.pose,
      glueTarget: game.game.margoScene?.dressGlueTarget ?? null,
      glue: game.apartment.margo.dressGlue,
      blobsShown: game.apartment.margo.dressGlueGroup.children.filter((b) => b.visible).length,
      blobsTotal: game.apartment.margo.dressGlueGroup.children.length,
    });
    // The exact frame the fastening finishes: the glue has just been
    // triggered and NOTHING has ramped onto the dress yet.
    const justFastened = snap();
    /* One frame short of the glue's own landing ramp (`dt * 1.8` a frame in
     * `updateMargoWake`, so 34 frames of 1/60s to cross 0 to 1) -- the hold
     * has to still be holding here, all fours and all, or the gate is a
     * decoration. */
    for (let i = 0; i < 33; i++) game.updateMargoWake(1 / 60);
    const stillHolding = snap();
    // The one frame the ramp actually catches its target -- the gate itself.
    game.updateMargoWake(1 / 60);
    const landed = snap();
    return { justFastened, stillHolding, landed };
  });
  check('the fastening finishes with her still on all fours and the glue only just triggered',
    comeHome.justFastened.running === true
      && comeHome.justFastened.pose === 'kneeling'
      && comeHome.justFastened.glueTarget === 1
      && comeHome.justFastened.glue === 0
      && comeHome.justFastened.blobsShown === 0,
    JSON.stringify(comeHome.justFastened));
  check('she is still on all fours while the glue is still landing on her back',
    comeHome.stillHolding.running === true
      && comeHome.stillHolding.pose === 'kneeling'
      && comeHome.stillHolding.glue > 0 && comeHome.stillHolding.glue < 1,
    JSON.stringify(comeHome.stillHolding));
  check('she reaches bed only once the glue has fully landed on her back',
    comeHome.landed.running === false
      && comeHome.landed.paused === false
      && comeHome.landed.glue === 1
      && comeHome.landed.blobsShown === comeHome.landed.blobsTotal
      && comeHome.landed.pose === 'lying'
      && comeHome.landed.visible === true,
    JSON.stringify(comeHome.landed));

  const slept = await page.evaluate(() => {
    const game = window.__squatch;
    game.lieOnBed();
    game.sleepInBed();
    const state = game.campaign.state;
    return {
      story: state.story,
      scene: state.scene,
      motel: state.missions.jerky_motel.status,
      silver: state.missions.silver_room.status,
      golf: state.missions.silver_pines.status,
      heist: state.missions.bank_heist.status,
      initiation: state.missions.initiation.status,
      golfCall: state.events.lou_golf_call.status,
      heistCall: state.events.lou_heist_call.status,
    };
  });
  check('sleep writes the Day Four Golf checkpoint at seven in the morning',
    slept.story.chapter === 'golf_morning'
      && slept.story.day === 4
      && slept.story.timeMinutes === 7 * 60
      && slept.scene.spawn === 'wake',
    JSON.stringify(slept));
  check('the campaign so far survives the last sleep',
    slept.motel === 'complete' && slept.silver === 'complete', JSON.stringify(slept));
  check('Lou, Silver Pines, THE TAKE, and the Initiation stay shut until he wakes',
    slept.golfCall === 'pending'
      && slept.heistCall === 'pending'
      && slept.golf === 'locked'
      && slept.heist === 'locked'
      && slept.initiation === 'locked',
    JSON.stringify(slept));

  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, {
    timeout: 15000,
  });
  const woke = await page.evaluate(() => ({
    day: window.__squatch.time.day,
    minutes: window.__squatch.time.minutes,
    mode: window.__squatch.player.mode,
  }));
  check('the live apartment wakes in bed at seven on Day Four',
    woke.day === 4 && Math.abs(woke.minutes - 7 * 60) < 1 && woke.mode === 'bed',
    JSON.stringify(woke));

  /* ---------------------------------------------------------------- */
  /* The fourth morning: the den, and the woman in it                  */
  /* ---------------------------------------------------------------- */

  const peak = await page.evaluate(() => {
    const game = window.__squatch;
    const shown = [];
    for (const [id, piece] of game.apartment.dressing) {
      if (piece.group.visible) shown.push(id);
    }
    const mug = game.apartment.dressing.get('tammyDashboardMug')?.group;
    const mugParts = [];
    mug?.traverse((object) => { if (object.name) mugParts.push(object.name); });
    return {
      chapter: game.apartment.dressedChapter(),
      shown,
      raining: game.apartment.state.raining,
      mug: {
        label: mug?.userData.label,
        continuityName: mug?.userData.continuityName,
        parts: mugParts,
      },
    };
  });
  check('Day Four starts in the accumulated flat before heist gear appears',
    peak.chapter === 'golf_morning'
      && ['cashStacks', 'suitBag', 'gunCase', 'jerkyHaul', 'silverMatches', 'laundryHeap']
        .every((id) => peak.shown.includes(id))
      && ['heistArmor', 'heistGloves', 'heistMask', 'heistCarbine',
        'heistSidearm', 'heistMagazines', 'heistDuffel']
        .every((id) => !peak.shown.includes(id))
      // Everything he accumulated on the way here is still here.
      && ['bloodShirt', 'cashSmall', 'bingMatches', 'motelKey', 'casualJacket', 'willyGap', 'tammyDashboardMug']
        .every((id) => peak.shown.includes(id))
      && !peak.shown.includes('lanyard')
      && !peak.shown.includes('willyPhoto')
      && peak.raining === false,
    JSON.stringify(peak.shown));
  check('Beef Run’s keepsake returns as Tammy’s Dashboard Mug with the cockpit label',
    peak.mug.label === 'Tammy’s Dashboard Mug'
      && peak.mug.continuityName === 'tammy-mug'
      && peak.mug.parts.includes('tammy-mug')
      && peak.mug.parts.includes('tammy-mug-label'),
    JSON.stringify(peak.mug));

  const laterCloset = await page.evaluate(() => {
    const apartment = window.__squatch.apartment;
    apartment.state.closetOpen = true;
    for (let i = 0; i < 120; i++) apartment.update(1 / 60, i / 60);
    return apartment.closet.hangers.map((hanger) => ({
      x: hanger.mesh.position.x,
      yaw: hanger.mesh.rotation.y,
    }));
  });
  check('the closet still clears fully in the later accumulated apartment',
    laterCloset.length >= 4
      && laterCloset.every((hanger) => hanger.x >= 4.88 && Math.abs(hanger.yaw) >= 1.48)
      && Math.max(...laterCloset.map((hanger) => hanger.x))
        - Math.min(...laterCloset.map((hanger) => hanger.x)) <= 0.05,
    JSON.stringify(laterCloset));

  /* The cutscene. It runs on the fourth morning only, it is one-shot against
   * the campaign's own clock, and -- the part that matters -- it hands
   * control back rather than leaving the player watching a woman walk. */
  await page.waitForFunction(() => !!window.__squatch.game.margoScene, null, { timeout: 60000 });
  const scene = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      running: !!game.game.margoScene,
      owed: game.apartmentStory.margoWakeOwed(),
      visible: game.apartment.margo.group.visible,
      mode: game.player.mode,
    };
  });
  check('the fourth morning opens with somebody else in the bed',
    scene.running === true && scene.visible === true && scene.mode === 'bed',
    JSON.stringify(scene));

  await page.waitForFunction(
    () => window.__squatch.game.margoScene?.awaitingHelp === true,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(180);
  const helpReady = await page.evaluate(() => {
    const game = window.__squatch;
    game.interaction.update(1 / 60);
    const names = [];
    game.apartment.margo.group.traverse((object) => {
      if (object.name) names.push(object.name);
    });
    return {
      identity: game.apartment.margo.identity,
      outfit: game.apartment.margo.outfit,
      pose: game.apartment.margo.pose,
      knees: game.apartment.margo.knees.map((knee) => knee.rotation.x),
      torso: game.apartment.margo.upper.rotation.x,
      headY: (() => {
        game.apartment.margo.group.updateMatrixWorld(true);
        // elements[13] is the world translation's Y; no THREE import needed here.
        return Math.round(game.apartment.margo.head.matrixWorld.elements[13] * 1000) / 1000;
      })(),
      canonicalFace: names.includes('margo.face.skull')
        && names.includes('margo.face.eye.left')
        && names.includes('margo.hair.fall.main'),
      shapedClothes: names.includes('margo.silhouette.seat.left')
        && names.includes('margo.silhouette.seat.right'),
      targetVisible: game.apartment.margo.helpTarget.visible,
      targetCurrent: game.interaction.current === game.apartment.margo.helpTarget,
      prompt: document.querySelector('#prompt .label')?.textContent ?? '',
      /* Where the beat is TAKING the camera, not where a swiftshader frame
       * rate has got it to yet: both of these ease in over about a second of
       * real time, and this gate renders at single-figure frames per second.
       * `aim` is the point his head turns toward and `lift` is how far he
       * props himself up, and both are what the pose needs to be legible. */
      aim: game.game.margoScene?.aim ?? null,
      lift: game.game.margoScene?.cameraLiftTarget ?? 0,
      pitchFloor: Math.round(game.player.pitchMin * 100) / 100,
    };
  });
  check('morning Margo is the Front and Center character in different clothes',
    helpReady.identity === 'margo'
      && helpReady.outfit === 'morning_blouse_and_jeans'
      && helpReady.canonicalFace
      && helpReady.shapedClothes,
    JSON.stringify(helpReady));
  /* Bent over on all fours, not knelt upright: the fastening runs down the
   * BACK of the dress, so the pose is what makes the interaction reachable at
   * all. Her head ending up barely above her own hips is the cheapest thing
   * to assert that an upright kneel cannot fake. */
  check('the dress-help beat bends her over on all fours and puts the target under the crosshair',
    helpReady.pose === 'kneeling'
      && helpReady.knees.every((angle) => angle > 1.3)
      && helpReady.torso > 1.3
      && helpReady.headY < 0.75
      && helpReady.targetVisible
      && helpReady.targetCurrent
      && /help margo/i.test(helpReady.prompt)
      /* And he is being propped up on an elbow and pointed down at her rather
       * than left flat squinting over his own duvet. The aim onto her back
       * wants about -0.43 of pitch, so the look floor has to be below that --
       * at the -0.35 it used to be, his head stopped short of the beat. */
      && helpReady.lift === 1
      && helpReady.aim?.[1] < 0.8
      && helpReady.pitchFloor <= -0.5,
    JSON.stringify(helpReady));
  if (CAPTURE) {
    const capturePath = path.resolve(CAPTURE);
    await fsp.mkdir(path.dirname(capturePath), { recursive: true });
    await page.setViewportSize({ width: 960, height: 600 });
    const overlayDisplay = await page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      const previous = overlay?.style.display ?? '';
      if (overlay) overlay.style.display = 'none';
      return previous;
    });
    /* Pump the scene's own update so the camera has arrived before the
     * shutter. The lift and the head turn both ease in over about a second of
     * REAL time and this gate renders at single-figure frames per second, so a
     * capture taken on wall clock is a photograph of a camera still moving.
     * `updateMargoWake` reads its beats off performance.now(), so stepping it
     * converges the pose without skipping the scene forward. */
    await page.evaluate(() => {
      for (let i = 0; i < 150; i++) window.__squatch.updateMargoWake(1 / 60);
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: capturePath });
    await page.evaluate((display) => {
      const overlay = document.getElementById('overlay');
      if (overlay) overlay.style.display = display;
    }, overlayDisplay);
    console.log(`  note  captured Margo dress-help frame at ${capturePath}`);
  }

  /* The beat is the picture frame's sweeping power bar rather than a hold, so
   * it is driven the way the bar is actually played: tap to start it, then hit
   * [E] with the marker inside the window. The marker is parked mid-window by
   * hand rather than waited for, because a sweep that speeds up on every
   * success is not something a headless gate should be trying to time. */
  const dressGame = await page.evaluate(() => {
    const game = window.__squatch;
    const target = game.apartment.margo.helpTarget;
    const reachable = game.interaction.current === target;
    /* Continue far enough to report all downstream checks even if camera
     * reachability failed; the `reachable` assertion above still fails. */
    if (!reachable) game.interaction.current = target;
    game.interaction.press();
    const bar = game.margoDress.bar;
    const started = bar.active && game.margoDress.running;
    const clapWhileRunning = game.audio.loops.has('margo.dress.clap');

    const before = game.audio.playbacks.length;
    const total = bar.total;
    let good = 0;
    for (let i = 0; i < total; i++) {
      // One frame of sweep, then a press planted in the middle of the window.
      game.updateMargoDressHelp(1 / 60);
      bar.pos = (bar.window[0] + bar.window[1]) / 2;
      if (bar.press()) good++;
    }
    const played = game.audio.playbacks.slice(before).map((playback) => playback.name);
    return {
      reachable,
      started,
      clapWhileRunning,
      total,
      good,
      running: game.margoDress.running,
      progress: game.game.margoScene?.dressProgress ?? 0,
      modelProgress: game.apartment.margo.dressHelpProgress,
      moans: played.filter((name) => name.startsWith('moan.')),
      finish: played.filter((name) => name === 'clap.wet.finish').length,
      clapAfter: game.audio.loops.has('margo.dress.clap'),
      glueTarget: game.game.margoScene?.dressGlueTarget ?? 0,
    };
  });
  check('the dress beat is the same power bar as the picture frame, and it lands every pull',
    dressGame.reachable
      && dressGame.started
      && dressGame.total === 7
      && dressGame.good === 7
      && dressGame.running === false
      && dressGame.progress === 1
      && dressGame.modelProgress === 1,
    JSON.stringify(dressGame));
  check('every successful pull plays a take, over a bed that stops when the bar does',
    JSON.stringify(dressGame.moans)
      === JSON.stringify(['moan.1', 'moan.3', 'moan.4', 'moan.5', 'moan.6', 'moan.3', 'moan.5'])
      && dressGame.clapWhileRunning === true
      && dressGame.clapAfter === false
      && dressGame.finish === 1
      && dressGame.glueTarget === 1,
    JSON.stringify(dressGame));

  const dressPayoff = await page.evaluate(() => {
    const game = window.__squatch;
    // A second of the scene's own update is what ramps the mess onto the dress.
    for (let i = 0; i < 60; i++) game.updateMargoWake(1 / 60);
    const margo = game.apartment.margo;
    const blobs = margo.dressGlueGroup.children;
    return {
      dressGlue: margo.dressGlue,
      blobs: blobs.length,
      shown: blobs.filter((blob) => blob.visible).length,
      // Parented to the blouse, so it walks out of the flat with her.
      parented: margo.dressGlueGroup.parent === margo.upper,
      pose: margo.pose,
    };
  });
  check('the bottle gives all over the dress, and the dress takes it with her',
    dressPayoff.dressGlue === 1
      && dressPayoff.blobs >= 6
      && dressPayoff.shown === dressPayoff.blobs
      && dressPayoff.parented
      && dressPayoff.pose === 'standing',
    JSON.stringify(dressPayoff));

  const dressImpacts = await page.evaluate(() => {
    const game = window.__squatch;
    const margoScene = game.game.margoScene;
    return {
      candidates: margoScene?.dressImpactCandidates ?? [],
      history: margoScene?.dressImpactHistory ?? [],
      available: (margoScene?.dressImpactCandidates ?? []).filter((cue) => game.audio.hasSample(cue)),
      fallbackDecoded: game.audio.hasSample('drunk.collapse'),
      audioReady: game.audio.ready,
    };
  });
  /* This check used to tolerate `available: []` by accepting two
   * `drunk.collapse` fallbacks, which is exactly what it saw on every run: the
   * four takes had shipped but were not in the startup decode set, so the
   * authored foley never once played and the gate reported green anyway. The
   * takes are delivered and preloaded now, so the tolerant branch is gone —
   * an empty candidate set is a failure, not an accepted state. */
  check('dress help plays the four authored impacts, not the fallback',
    JSON.stringify(dressImpacts.candidates) === JSON.stringify([
      'margo.dress.body-impact.1',
      'margo.dress.body-impact.2',
      'margo.dress.body-impact.3',
      'margo.dress.body-impact.4',
    ])
      && dressImpacts.history.length === 2
      && dressImpacts.available.length === 4
      && dressImpacts.history.every((cue) => dressImpacts.available.includes(cue))
      && dressImpacts.history[0] !== dressImpacts.history[1],
    JSON.stringify(dressImpacts));
  await page.waitForFunction(() => !window.__squatch.game.margoScene, null, { timeout: 180000 });
  const handedBack = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      running: !!game.game.margoScene,
      visible: game.apartment.margo.group.visible,
      owed: game.apartmentStory.margoWakeOwed(),
      events: game.campaign.state.story.timeEvents,
      minutes: game.campaign.state.story.timeMinutes,
      mode: game.player.mode,
      pitch: Math.round(game.player.pitch * 100) / 100,
      yawCentre: Math.round((game.player.yawCenter ?? 0) * 100) / 100,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('Margo gets dressed, leaves, and hands the room back',
    handedBack.running === false
      && handedBack.visible === false
      && handedBack.owed === false
      && handedBack.events.includes('scene.margo_wake')
      && handedBack.minutes === 7 * 60
      // Exactly the pose an ordinary morning hands over.
      && handedBack.mode === 'bed'
      && handedBack.pitch === 0.95
      && handedBack.door?.kind === 'call',
    JSON.stringify(handedBack));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  const reload = await page.evaluate(() => ({
    tag: document.querySelector('#overlay .tag')?.textContent ?? '',
    story: window.__squatch.campaign.state.story,
    scene: window.__squatch.campaign.state.scene,
  }));
  check('a reload restores the Golf-morning wake checkpoint',
    reload.story.chapter === 'golf_morning'
      && reload.story.day === 4
      && reload.story.timeMinutes === 7 * 60
      && reload.scene.spawn === 'wake'
      && reload.tag.includes('Day Four'),
    JSON.stringify(reload));

  const golfRinging = await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp();
    game.apartmentStory.update(6.1);
    const definition = game.phone.call?.def;
    return {
      ringing: game.phone.ringing,
      eventId: definition?.eventId,
      characterId: definition?.characterId,
      from: definition?.from,
      vo: definition?.vo,
      targetSceneId: definition?.targetSceneId,
      lines: definition?.lines?.length ?? 0,
    };
  });
  check('Big Uncle Lou rings the physical phone about Silver Pines',
    golfRinging.ringing
      && golfRinging.eventId === 'lou_golf_call'
      && golfRinging.characterId === 'lou'
      && golfRinging.from === 'Big Uncle Lou'
      && golfRinging.vo === 'call.lou.golf'
      && golfRinging.targetSceneId === 'silver_pines'
      && golfRinging.lines === 4,
    JSON.stringify(golfRinging));

  const golfAnswered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const story = game.campaign.state.story;
    return {
      inCall: game.phone.inCall,
      golfCall: game.campaign.state.events.lou_golf_call.status,
      heistCall: game.campaign.state.events.lou_heist_call.status,
      golf: game.campaign.state.missions.silver_pines.status,
      heist: game.campaign.state.missions.bank_heist.status,
      initiation: game.campaign.state.missions.initiation.status,
      timeMinutes: story.timeMinutes,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('answering Lou unlocks only Silver Pines at 7:03',
    golfAnswered.inCall
      && golfAnswered.golfCall === 'answered'
      && golfAnswered.heistCall === 'pending'
      && golfAnswered.golf === 'available'
      && golfAnswered.heist === 'locked'
      && golfAnswered.initiation === 'locked'
      && golfAnswered.timeMinutes === 7 * 60 + 3,
    JSON.stringify(golfAnswered));
  check('the apartment door now routes to Silver Pines',
    golfAnswered.door?.kind === 'go'
      && golfAnswered.door?.destination === 'silver_pines',
    JSON.stringify(golfAnswered.door));

  const golfDeparted = await page.evaluate(() => {
    window.__squatch.tryLeave();
    const state = window.__squatch.campaign.state;
    return {
      day: state.story.day,
      chapter: state.story.chapter,
      timeMinutes: state.story.timeMinutes,
      events: state.story.timeEvents,
      golf: state.missions.silver_pines.status,
      heist: state.missions.bank_heist.status,
      initiation: state.missions.initiation.status,
    };
  });
  check('leaving for Silver Pines lands at Day 4, 7:30 AM through the authored clock',
    golfDeparted.day === 4
      && golfDeparted.chapter === 'golf_morning'
      && golfDeparted.timeMinutes === 7 * 60 + 30
      && golfDeparted.events.includes('travel.silver_pines')
      && golfDeparted.golf === 'available'
      && golfDeparted.heist === 'locked'
      && golfDeparted.initiation === 'locked',
    JSON.stringify(golfDeparted));

  await page.waitForURL(/golf\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__golfReady === true, null, { timeout: 60000 });
  const golfStarted = await page.evaluate(async () => {
    const result = await window.__golf.boot();
    const state = window.__golf.campaign.state;
    return {
      result,
      scene: state.scene,
      chapter: state.story.chapter,
      timeMinutes: state.story.timeMinutes,
      golf: state.missions.silver_pines.status,
      heist: state.missions.bank_heist.status,
    };
  });
  check('the departure really boots Silver Pines with the round in progress',
    golfStarted.result?.ok === true
      && golfStarted.result?.resumed === false
      && golfStarted.scene.id === 'silver_pines'
      && golfStarted.scene.spawn === 'car_park'
      && golfStarted.chapter === 'golf_morning'
      && golfStarted.timeMinutes === 7 * 60 + 30
      && golfStarted.golf === 'in_progress'
      && golfStarted.heist === 'locked',
    JSON.stringify(golfStarted));

  const golfFinished = await page.evaluate(() => {
    const game = window.__golf;
    const holes = [
      { hole: 1, par: 3, strokes: 4, penalties: 0, heardInvitation: true, rodeWithLou: true },
      { hole: 2, par: 5, strokes: 6, penalties: 1, foundWater: true },
      { hole: 3, par: 4, strokes: 5, penalties: 0, hitGreenInRegulation: true },
    ];
    const recorded = holes.map((hole) => game.story.recordHole(hole));
    const completed = game.story.complete();
    const state = game.campaign.state;
    return {
      recorded,
      completed,
      scene: state.scene,
      story: state.story,
      golf: state.missions.silver_pines,
      heist: state.missions.bank_heist.status,
      heistCall: state.events.lou_heist_call.status,
      initiation: state.missions.initiation.status,
    };
  });
  check('three persisted holes close Silver Pines at 10:30 and open heist day',
    golfFinished.recorded.every(Boolean)
      && golfFinished.completed === true
      && golfFinished.story.chapter === 'heist_day'
      && golfFinished.story.day === 4
      && golfFinished.story.timeMinutes === 10 * 60 + 30
      && golfFinished.story.timeEvents.includes('mission.silver_pines')
      && golfFinished.golf.status === 'complete'
      && golfFinished.golf.holesPlayed === 3
      && golfFinished.golf.holes.length === 3
      && golfFinished.golf.strokes === 15
      && golfFinished.golf.penalties === 1
      && golfFinished.golf.toPar === 3
      && golfFinished.golf.heardInvitation === true
      && golfFinished.golf.rodeWithLou === true
      && golfFinished.heistCall === 'pending'
      && golfFinished.heist === 'locked'
      && golfFinished.initiation === 'locked',
    JSON.stringify(golfFinished));

  await page.evaluate(() => document.querySelector('#endcard-home')?.click());
  await page.waitForURL(/index\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const golfReturn = await page.evaluate(() => {
    const game = window.__squatch;
    const shown = [];
    for (const [id, piece] of game.apartment.dressing) {
      if (piece.group.visible) shown.push(id);
    }
    return {
      tag: document.querySelector('#overlay .tag')?.textContent ?? '',
      returnSource: game.apartmentReturnSource,
      story: game.campaign.state.story,
      scene: game.campaign.state.scene,
      golf: game.campaign.state.missions.silver_pines,
      shown,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('the Silver Pines Home control returns to the heist-day apartment',
    golfReturn.tag.includes('Back from Silver Pines')
      && golfReturn.tag.includes('One job left before seven')
      && golfReturn.returnSource === 'silver_pines'
      && golfReturn.story.chapter === 'heist_day'
      && golfReturn.story.day === 4
      && golfReturn.story.timeMinutes === 10 * 60 + 30
      && golfReturn.scene.id === 'apartment'
      && golfReturn.scene.spawn === 'front_door'
      && golfReturn.golf.status === 'complete'
      && golfReturn.golf.holesPlayed === 3
      && golfReturn.door?.kind === 'call'
      && golfReturn.door?.id === 'lou_heist_call',
    JSON.stringify(golfReturn));
  check('THE TAKE loadout appears only after the round',
    ['heistArmor', 'heistGloves', 'heistMask', 'heistCarbine',
      'heistSidearm', 'heistMagazines', 'heistDuffel']
      .every((id) => golfReturn.shown.includes(id)),
    JSON.stringify(golfReturn.shown));

  const heistRinging = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.update(6.1);
    const definition = game.phone.call?.def;
    return {
      ringing: game.phone.ringing,
      eventId: definition?.eventId,
      characterId: definition?.characterId,
      from: definition?.from,
      vo: definition?.vo,
      targetSceneId: definition?.targetSceneId,
      lines: definition?.lines?.length ?? 0,
    };
  });
  check('Big Uncle Lou now rings the physical phone about THE TAKE',
    heistRinging.ringing
      && heistRinging.eventId === 'lou_heist_call'
      && heistRinging.characterId === 'lou'
      && heistRinging.from === 'Big Uncle Lou'
      && heistRinging.vo === 'call.lou.heist'
      && heistRinging.targetSceneId === 'bank_heist'
      && heistRinging.lines === 4,
    JSON.stringify(heistRinging));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    for (const itemId of ['armor', 'gloves', 'mask', 'carbine', 'sidearm', 'magazines', 'duffel']) {
      game.apartmentStory.collectHeistPreparation(itemId);
    }
    const story = game.campaign.state.story;
    return {
      inCall: game.phone.inCall,
      golfCall: game.campaign.state.events.lou_golf_call.status,
      call: game.campaign.state.events.lou_heist_call.status,
      golf: game.campaign.state.missions.silver_pines.status,
      heist: game.campaign.state.missions.bank_heist.status,
      initiation: game.campaign.state.missions.initiation.status,
      preparation: game.campaign.state.missions.bank_heist.preparation,
      timeMinutes: story.timeMinutes,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('answering Lou unlocks THE TAKE but keeps the completed round and Initiation locked',
    answered.inCall
      && answered.golfCall === 'answered'
      && answered.call === 'answered'
      && answered.golf === 'complete'
      && answered.heist === 'available'
      && answered.initiation === 'locked'
      && answered.timeMinutes === 10 * 60 + 33
      && Object.values(answered.preparation).filter(Boolean).length >= 7,
    JSON.stringify(answered));
  check('the prepared apartment door now routes to THE TAKE',
    answered.door?.kind === 'go' && answered.door?.destination === 'bank_heist',
    JSON.stringify(answered.door));

  const departed = await page.evaluate(() => {
    window.__squatch.tryLeave();
    const state = window.__squatch.campaign.state;
    return {
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      events: state.story.timeEvents,
      heist: state.missions.bank_heist.status,
      initiation: state.missions.initiation.status,
    };
  });
  check('leaving for THE TAKE lands at Day 4, 11:15 AM through the authored clock',
    departed.day === 4
      && departed.timeMinutes === 11 * 60 + 15
      && departed.events.includes('travel.bank_heist')
      && departed.heist === 'in_progress'
      && departed.initiation === 'locked',
    JSON.stringify(departed));

  // The door's fade-out really navigates into the new mission boundary.
  await page.waitForURL(/heist\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__heistDebug, null, { timeout: 60000 });
  const arrived = await page.evaluate(() => ({
    state: window.__heistDebug.state,
    crewHuman: window.__heistDebug.crewHuman,
    savedScene: JSON.parse(localStorage.getItem('squatchlife.campaign')).scene,
  }));
  check('the departure really lands in THE TAKE with the scene saved',
    typeof arrived.state === 'string'
      && arrived.crewHuman === true
      && arrived.savedScene.id === 'bank_heist'
      && arrived.savedScene.spawn === 'safehouse',
    JSON.stringify(arrived));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  const replay = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(60);
    const state = game.campaign.state;
    return {
      call: game.phone.call?.def?.eventId ?? null,
      answered: state.events.lou_heist_call.status,
      timeMinutes: state.story.timeMinutes,
      heist: state.missions.bank_heist.status,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('coming back home does not replay Lou or lose the interrupted heist',
    replay.call === null
      && replay.answered === 'answered'
      && replay.timeMinutes === 11 * 60 + 15
      && replay.heist === 'in_progress'
      && replay.door?.destination === 'bank_heist',
    JSON.stringify(replay));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} big-night checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} big-night checks passed.`);

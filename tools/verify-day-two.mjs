#!/usr/bin/env node
/**
 * Verify the apartment's persistent Day One -> Day Two transition and
 * Booskibro's one-shot airstrip call in a real browser.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5202;
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
  console.error('playwright is not installed; cannot verify Day Two.');
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

await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 12,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 23 * 60 + 20,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
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
      airstrip_smuggling: { status: 'locked' },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'pending' },
    },
  }));
});

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  /* ---------------------------------------------------------------- */
  /* Coming home from the restaurant                                   */
  /* ---------------------------------------------------------------- */

  /* Owner report: the bed refused him on the way back from the Squatchfather,
   * so Day One could not be closed. Two separate faults. The Squatchfather is
   * a frozen scene with no clock of its own, so nothing put an hour on the
   * restaurant and he came home at the same 11:41 PM he left at, into a flat
   * that thought he had just got up. And most of the bed -- headboard, far
   * rail, corners, everything the seat proxy does not quite cover -- was
   * registered with a flat "You just got up. Give it an hour." */
  const home = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      day: game.campaign.state.story.day,
      minutes: game.campaign.state.story.timeMinutes,
      chapter: game.campaign.state.story.chapter,
      clock: game.time.clock12,
      events: game.campaign.state.story.timeEvents,
      door: game.apartmentStory.tryLeave({
        eaten: true, showered: true, pooped: true, changedClothes: true,
      }),
    };
  });
  check('the walk home from the restaurant lands at three in the morning',
    home.day === 2
      && home.minutes === 3 * 60
      && home.clock === '3:00 AM'
      && home.chapter === 'day_one'
      && home.events.includes('mission.squatchfather'),
    JSON.stringify(home));
  check('the door sends him to bed rather than back out',
    home.door?.kind === 'stay' && home.door?.id === 'sleep',
    JSON.stringify(home.door));

  /* Aim at the bed from four places a person would stand. Every one of them
   * has to offer lying down; none of them may refuse. */
  const bedAim = await page.evaluate(async () => {
    const game = window.__squatch;
    const THREE = await import('three');
    game.interaction.setPaused(false);
    game.player.mode = 'walk';
    const spots = [
      [-3.00, -3.40, [-4.15, 0.66, -3.40]],
      [-3.20, -2.10, [-4.30, 0.60, -4.10]],
      [-2.60, -4.10, [-4.30, 0.90, -4.30]],
      [-3.60, -1.90, [-4.15, 0.68, -2.60]],
    ];
    const labels = [];
    for (const [px, pz, look] of spots) {
      game.player.position.set(px, 1.66, pz);
      game.player.eyeHeight = 1.66;
      game.player.update(0.016);
      game.camera.up.set(0, 1, 0);
      game.camera.lookAt(new THREE.Vector3(look[0], look[1], look[2]));
      game.camera.updateMatrixWorld(true);
      // The probe moves the camera itself instead of using a rendered frame.
      // Refresh the static room matrices too, otherwise Three raycasts against
      // the identity transforms and misses an actually reachable bed.
      game.scene.updateMatrixWorld(true);
      game.interaction.current = null;
      game.interaction.update(0.016);
      const target = game.interaction.current;
      labels.push(target && (typeof target.userData.interact.label === 'function'
        ? target.userData.interact.label() : target.userData.interact.label));
    }
    return labels;
  });
  check('every angle on the bed offers lying down, and none of them refuses',
    bedAim.length === 4
      && bedAim.every((l) => typeof l === 'string' && l.includes('lie down'))
      && !bedAim.some((l) => /just got up|Give it an hour/i.test(l || '')),
    JSON.stringify(bedAim));

  const sleepStarted = await page.evaluate(() => {
    const game = window.__squatch;
    game.lieOnBed();
    game.sleepInBed();
    const state = game.campaign.state;
    return {
      story: state.story,
      scene: state.scene,
      bada: state.missions.bada_bing_one.status,
      squatchfather: state.missions.squatchfather,
      lou: state.events.lou_first_call.status,
      booski: state.events.booski_day_two_call.status,
      airstrip: state.missions.airstrip_smuggling.status,
    };
  });
  check('sleep writes the Day Two checkpoint before the transition animation ends',
    sleepStarted.story.day === 2
      && sleepStarted.story.chapter === 'day_two'
      && sleepStarted.story.timeMinutes === 420
      && sleepStarted.scene.spawn === 'wake',
    JSON.stringify(sleepStarted));
  check('Day One completion survives sleep',
    sleepStarted.bada === 'complete'
      && sleepStarted.squatchfather.status === 'complete'
      && sleepStarted.squatchfather.weaponDropped
      && sleepStarted.lou === 'answered',
    JSON.stringify(sleepStarted));
  check('the Day Two call and airstrip remain pending until the player wakes',
    sleepStarted.booski === 'pending' && sleepStarted.airstrip === 'locked',
    JSON.stringify(sleepStarted));

  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, {
    timeout: 10000,
  });
  const woke = await page.evaluate(() => ({
    day: window.__squatch.time.day,
    minutes: window.__squatch.time.minutes,
    mode: window.__squatch.player.mode,
    transitionPending: !!window.__squatch.player._tween,
    clockDay: document.querySelector('#clock .day')?.textContent,
    clockTime: document.querySelector('#clock .time')?.textContent,
    subtitle: document.querySelector('#subtitle')?.textContent?.trim(),
    panelTitle: document.querySelector('#objectives .otitle')?.textContent,
    panel: [...document.querySelectorAll('#objectives li')]
      .map((li) => ({ text: li.textContent, done: li.classList.contains('done') })),
    flat: {
      fed: window.__squatch.apartment.state.fed,
      showered: window.__squatch.apartment.state.showered,
      dressed: window.__squatch.apartment.state.dressed,
      panState: window.__squatch.apartment.state.panState,
      heldItem: window.__squatch.apartment.state.heldItem,
    },
  }));
  check('the live apartment wakes in bed at 7:00 AM on Day Two',
    woke.day === 2 && Math.abs(woke.minutes - 420) < 1
      && woke.mode === 'bed' && !woke.transitionPending,
    JSON.stringify({
      day: woke.day,
      minutes: woke.minutes,
      mode: woke.mode,
      transitionPending: woke.transitionPending,
    }));
  /* The bug the owner hit: the second morning presented as the first one. The
   * clock, the line he says on waking and the panel all have to name Day Two,
   * and none of them may mention Day One or the man who rang yesterday. */
  check('waking on Day Two says Day Two everywhere it says anything',
    woke.clockDay === 'Day 2'
      && woke.clockTime === '7:00 AM'
      && woke.subtitle.includes('Day 2')
      && woke.subtitle.includes('Booskibro')
      && !/Day One|Day 1/.test(woke.subtitle)
      && woke.panelTitle === 'Day 2 · today',
    JSON.stringify({
      clockDay: woke.clockDay, clockTime: woke.clockTime,
      subtitle: woke.subtitle, panelTitle: woke.panelTitle,
    }));
  /* And it is a morning, not yesterday with a new number on it: he has not
   * eaten today, has not showered today, and is in what he slept in. */
  check('Day Two is a fresh morning rather than yesterday’s flat',
    woke.flat.fed === false
      && woke.flat.showered === false
      && woke.flat.dressed === false
      && woke.flat.panState === null
      && woke.flat.heldItem !== 'phone',
    JSON.stringify(woke.flat));
  check('the objectives panel lists the Day Two morning and Booskibro’s call',
    woke.panel.length === 5
      && woke.panel.every((row) => row.done === false)
      && woke.panel[0].text === 'Eat something'
      && woke.panel.at(-1).text === 'Answer Booskibro’s call'
      && !woke.panel.some((row) => /Lou/.test(row.text)),
    JSON.stringify(woke.panel));
  await page.waitForFunction(
    () => window.__squatch.radio.hasHeardBulletin('news.radio.day_two'),
    null,
    { timeout: 5000 },
  );
  const dayTwoRadio = await page.evaluate(() => ({
    on: window.__squatch.radio.on,
    volume: window.__squatch.radio.volume,
    bulletin: window.__squatch.radio.hasHeardBulletin('news.radio.day_two'),
  }));
  check('Day Two starts with the radio audibly on and the murder bulletin queued first',
    dayTwoRadio.on === true
      && Math.abs(dayTwoRadio.volume - 0.70) < 0.001
      && dayTwoRadio.bulletin === true,
    JSON.stringify(dayTwoRadio));
  const radioKnob = await page.evaluate(() => {
    const game = window.__squatch;
    const knob = game.apartment.root.getObjectByName('radio-volume-knob');
    const before = game.radio.volumePercent;
    knob?.userData.interact?.onTap?.();
    const louder = game.radio.volumePercent;
    knob?.userData.interact?.onUse?.();
    return { before, louder, after: game.radio.volumePercent, label: knob?.userData.interact?.label?.() };
  });
  check('the visible radio knob raises and lowers the radio volume in seven-percent steps',
    radioKnob.before === 70
      && radioKnob.louder === 77
      && radioKnob.after === 70
      && /70%/.test(radioKnob.label || ''),
    JSON.stringify(radioKnob));

  /* ---------------------------------------------------------------- */
  /* The flat on the second morning                                    */
  /* ---------------------------------------------------------------- */

  /* The room itself carries last night forward: the bloodied shirt, the first
   * fold of money and Bing's matchbook remain, while the day-job lanyard is
   * gone. This is the authored Day Two continuity, not generic floor clutter. */
  const room = await page.evaluate(() => {
    const game = window.__squatch;
    const shown = [];
    for (const [id, piece] of game.apartment.dressing) {
      if (piece.group.visible) shown.push(id);
    }
    return {
      chapter: game.apartment.dressedChapter(),
      shown,
      messages: game.apartment.messagesWaiting(),
      raining: game.apartment.state.raining,
    };
  });
  check('the second morning is a visibly different flat from the first',
    room.chapter === 'day_two'
      && room.shown.includes('bloodShirt')
      && room.shown.includes('cashSmall')
      && room.shown.includes('bingMatches')
      && !room.shown.includes('lanyard')
      && !room.shown.includes('cashStacks')
      && !room.shown.includes('gunCase')
      && room.raining === false,
    JSON.stringify(room.shown));

  const apartmentVisuals = await page.evaluate(async () => {
    const apartment = window.__squatch.apartment;
    const blood = apartment.dressing.get('bloodShirt')?.group;
    const meshes = [];
    blood?.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.computeBoundingBox?.();
      const box = node.geometry?.boundingBox;
      if (!box) return;
      const width = (box.max.x - box.min.x) * Math.abs(node.scale.x || 1);
      const depth = (box.max.z - box.min.z) * Math.abs(node.scale.z || 1);
      meshes.push({ width, depth, color: node.material?.color?.getHex?.() ?? null });
    });

    apartment.state.closetOpen = true;
    /* Software-rendered Chromium may deliver only a handful of rAF frames in
     * 900 real milliseconds. Advance the room's real updater deterministically
     * so this measures the authored final pose, not host scheduling noise. */
    for (let frame = 0; frame < 120; frame++) apartment.update(1 / 60, frame / 60);
    const hangers = apartment.closet?.hangers ?? [];
    const closet = hangers.map((hanger) => ({
      x: hanger.mesh.position.x,
      yaw: hanger.mesh.rotation.y,
    }));
    return { meshes, closet };
  });
  const bloodWidth = apartmentVisuals.meshes.reduce((sum, mesh) => sum + mesh.width, 0);
  const bloodHasReadableFabric = apartmentVisuals.meshes.some((mesh) => {
    if (mesh.color == null) return false;
    const r = (mesh.color >> 16) & 255;
    const g = (mesh.color >> 8) & 255;
    const b = mesh.color & 255;
    return (r + g + b) / (3 * 255) >= 0.38;
  });
  check('the bloody shirt reads as a full discarded garment instead of dark floor clutter',
    bloodWidth >= 0.90 && bloodHasReadableFabric,
    JSON.stringify({ width: bloodWidth, meshes: apartmentVisuals.meshes }));
  check('opening the closet moves every garment fully to one side',
    apartmentVisuals.closet.length >= 4
      && apartmentVisuals.closet.every((hanger) => hanger.x >= 4.78 && Math.abs(hanger.yaw) >= 1.05),
    JSON.stringify(apartmentVisuals.closet));


  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  const reload = await page.evaluate(() => ({
    tag: document.querySelector('#overlay .tag')?.textContent ?? '',
    story: window.__squatch.campaign.state.story,
    scene: window.__squatch.campaign.state.scene,
  }));
  check('a reload restores the Day Two wake checkpoint',
    reload.story.day === 2
      && reload.story.timeMinutes === 420
      && reload.scene.spawn === 'wake'
      && reload.tag.includes('Day Two'),
    JSON.stringify(reload));

  // Use Playwright's keyboard rather than a synthetic document event: Escape
  // is one of the keys browsers may reserve while pointer lock is involved.
  const loadedBeforePause = await page.evaluate(() => {
    window.__squatch.game.started = true;
    window.__squatch.game.paused = false;
    return window.__squatch.audio.loadedCount;
  });
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => window.__squatch.game.paused
    && !document.querySelector('#overlay')?.classList.contains('hidden'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__squatch.game.paused === false, null, { timeout: 10000 });
  const loadedAfterResume = await page.evaluate(() => window.__squatch.audio.loadedCount);
  const escapePause = {
    paused,
    resumed: true,
    loadedBeforePause,
    loadedAfterResume,
  };
  check('Escape opens and closes pause without decoding the audio library again',
    escapePause.paused
      && escapePause.resumed
      && escapePause.loadedAfterResume === escapePause.loadedBeforePause,
    JSON.stringify(escapePause));

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    // The page has been loaded long enough for a real 20-second wall timer to
    // elapse. Reset the public story clock so this assertion measures the
    // authored delay itself rather than test harness setup time.
    game.apartmentStory.beginMorning({ delay: 20, reset: true });
    game.getUp();
    game.apartmentStory.update(19.7);
    const early = game.phone.ringing;
    game.apartmentStory.update(0.5);
    const definition = game.phone.call?.def;
    return {
      early,
      ringing: game.phone.ringing,
      eventId: definition?.eventId,
      characterId: definition?.characterId,
      targetCharacterId: definition?.targetCharacterId,
      from: definition?.from,
    };
  });
  check('Booskibro rings the physical phone after the Day Two wake-up',
    ringing.early === false
      && ringing.ringing
      && ringing.eventId === 'booski_day_two_call'
      && ringing.characterId === 'booski'
      && ringing.from === 'Booskibro',
    JSON.stringify(ringing));
  check('Booskibro names Captain Lou Sasole without colliding with Lou',
    ringing.targetCharacterId === 'captain_lou_sasole'
      && ringing.targetCharacterId !== 'lou',
    JSON.stringify(ringing));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const connected = game.phone.inCall;
    const radioDuring = {
      ducked: game.radio.phoneDucked,
      scale: game.radio.mixScale,
      knob: game.radio.volume,
    };
    const departure = game.tryLeave();
    game.phone.hangUp();
    return {
      inCall: connected,
      event: game.campaign.state.events.booski_day_two_call.status,
      mission: game.campaign.state.missions.airstrip_smuggling.status,
      departure,
      radioDuring,
      radioAfter: {
        ducked: game.radio.phoneDucked,
        scale: game.radio.mixScale,
        knob: game.radio.volume,
      },
    };
  });
  check('answering Booskibro persists the event and unlocks the airstrip mission',
    answered.inCall
      && answered.event === 'answered'
      && answered.mission === 'available',
    JSON.stringify(answered));
  check('the connected call ducks the radio by 66 percent and restores the player setting on hang-up',
    answered.radioDuring.ducked
      && answered.radioDuring.scale === 0.34
      && answered.radioAfter.ducked === false
      && answered.radioAfter.scale === 1
      && answered.radioDuring.knob === answered.radioAfter.knob,
    JSON.stringify({ during: answered.radioDuring, after: answered.radioAfter }));
  check('the apartment door now routes to the real Beef Run scene',
    answered.departure?.kind === 'go'
      && answered.departure?.destination === 'airstrip_smuggling',
    JSON.stringify(answered.departure));
  const departTime = await page.evaluate(() => {
    const story = window.__squatch.campaign.state.story;
    return { day: story.day, timeMinutes: story.timeMinutes, events: story.timeEvents };
  });
  check('leaving for the airstrip lands at Day 2, 9:10 AM through the authored clock',
    departTime.day === 2
      && departTime.timeMinutes === 9 * 60 + 10
      && departTime.events.includes('travel.airstrip'),
    JSON.stringify(departTime));

  // The door's fade-out really navigates: ride it to Whispering Pines.
  await page.waitForURL(/beefrun\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });
  const arrived = await page.evaluate(() => ({
    scene: window.__beefrun.campaignState.scene.id,
    mission: window.__beefrun.campaignState.missions.airstrip_smuggling.status,
  }));
  check('the departure really lands at the Beef Run with the mission waiting',
    arrived.scene === 'airstrip_smuggling' && arrived.mission === 'available',
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
      lou: state.events.lou_first_call.status,
      booski: state.events.booski_day_two_call.status,
      airstrip: state.missions.airstrip_smuggling.status,
    };
  });
  check('reload does not replay either completed call',
    replay.call === null
      && replay.lou === 'answered'
      && replay.booski === 'answered'
      && replay.airstrip === 'available',
    JSON.stringify(replay));

  /* And it has something to say about last night, once, from Lou. */
  const machine = await page.evaluate(() => {
    const game = window.__squatch;
    game.game.inBed = false;
    game.player.mode = 'walk';
    const waiting = game.apartment.messagesWaiting();
    const before = game.apartmentStory.messages();
    const played = game.playMessages();
    const after = game.apartmentStory.messages();
    return {
      waiting,
      from: before.list[0]?.from,
      mentionsRestaurant: before.list.some((m) => m.lines.some((l) => /restaurant/i.test(l))),
      played,
      heardBefore: before.heard,
      heardAfter: after.heard,
      replayed: game.playMessages(),
      left: game.apartment.messagesWaiting(),
      news: !!game.apartmentStory.news()?.radio,
      newsMentionsRestaurant: /restaurant/i.test(game.apartmentStory.news()?.radio?.line || ''),
    };
  });
  check('a voicemail from Lou about the restaurant is waiting, and plays once',
    machine.waiting === 1
      && machine.from === 'Big Uncle Lou'
      && machine.mentionsRestaurant === true
      && machine.heardBefore === false
      && machine.played === true
      && machine.heardAfter === true
      && machine.replayed === false
      && machine.left === 0,
    JSON.stringify(machine));
  check('the wire is carrying the restaurant too',
    machine.news === true && machine.newsMentionsRestaurant === true,
    JSON.stringify(machine));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Day Two checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Day Two checks passed.`);

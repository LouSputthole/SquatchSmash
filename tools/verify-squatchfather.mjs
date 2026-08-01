#!/usr/bin/env node
/**
 * Verify the package-gated apartment -> Squatchfather -> apartment round trip
 * in a real browser, including the restaurant's critical state-machine beats,
 * the recorded audio (VO, footsteps, ambience and train beds), and that every
 * seated man faces the way his beat was authored.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5203;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Squatchfather.');
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
const problems = [];
function trackRuntimeErrors(page) {
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
}

const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
trackRuntimeErrors(page);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 7,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 23 * 60 + 55,
      meetingKnown: false,
      meetingLearnedFrom: null,
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: false,
      whiskeyRelaxed: true,
    },
    inventory: { carried: [], concealed: ['parcel'] },
    missions: {
      bada_bing_one: {
        status: 'complete',
        packageReceived: true,
        ending: 'rear',
      },
      squatchfather: {
        status: 'available',
        weaponStaged: false,
        weaponDropped: false,
      },
    },
    events: { lou_first_call: { status: 'answered' } },
  }));
});

async function state() {
  return page.evaluate(() => {
    const scene = window.squatchfather;
    const campaign = scene.campaign.state;
    return {
      beat: scene.state(),
      hasWeapon: scene.prospect.hasWeapon,
      weaponDropped: scene.prospect.weaponDropped,
      packageCarried: scene.campaign.hasItem('parcel'),
      mission: campaign.missions.squatchfather,
      endVisible: !document.getElementById('endCard').classList.contains('hidden'),
    };
  });
}

async function go(beat, seconds = 0.2) {
  return page.evaluate(([beat, seconds]) => {
    const scene = window.squatchfather;
    scene.go(beat);
    scene.tick(seconds);
    return scene.state();
  }, [beat, seconds]);
}

async function openingSnapshot(target) {
  return target.evaluate(() => {
    const scene = window.squatchfather;
    const { prospect } = scene;
    return {
      beat: scene.state(),
      canMove: prospect.canMove,
      canLook: prospect.canLook,
      seated: prospect.seated,
      scripted: prospect.autoTarget !== null,
      blocked: prospect.blocked(prospect.pos.x, prospect.pos.z),
      position: {
        x: prospect.pos.x,
        z: prospect.pos.z,
      },
      forward: {
        x: -Math.sin(prospect.yaw),
        z: -Math.cos(prospect.yaw),
      },
    };
  });
}

async function verifyOpeningMovement(target, label) {
  const before = await openingSnapshot(target);
  check(`${label} starts Tony outside every active collider`,
    before.beat === 'START_EXTERIOR'
      && before.canMove
      && before.canLook
      && !before.seated
      && !before.scripted
      && !before.blocked,
    JSON.stringify(before));

  // Real keyboard input drives the real listeners, but the simulation time
  // comes from the scene's own tick so the distance is deterministic even
  // when a loaded machine renders the page at a crawl.
  await target.keyboard.down('KeyW');
  await target.waitForTimeout(120);
  await target.evaluate(() => window.squatchfather.tick(0.6));
  await target.keyboard.up('KeyW');
  await target.waitForTimeout(80);

  const after = await openingSnapshot(target);
  const dx = after.position.x - before.position.x;
  const dz = after.position.z - before.position.z;
  const distance = Math.hypot(dx, dz);
  const forwardProgress = dx * before.forward.x + dz * before.forward.z;
  check(`${label} accepts W movement in the camera-facing direction`,
    distance > 0.35 && forwardProgress > 0.3 && !after.blocked,
    JSON.stringify({
      before: before.position,
      after: after.position,
      distance: Number(distance.toFixed(3)),
      forwardProgress: Number(forwardProgress.toFixed(3)),
      beat: after.beat,
      blocked: after.blocked,
    }));
}

try {
  const previewPage = await browser.newPage({ viewport: { width: 480, height: 300 } });
  trackRuntimeErrors(previewPage);
  await previewPage.goto(
    `http://localhost:${PORT}/squatchfather.html?preview=1`,
    { waitUntil: 'load' },
  );
  await previewPage.waitForFunction(() => window.squatchfather?.fsm, null, { timeout: 60000 });
  const tonyPresentation = await previewPage.evaluate(() => {
    const p = window.squatchfather.prospect;
    const skull = p.fig.head.getObjectByName('sf.face.skull');
    const hand = p.weapon.getObjectByName('prospect.viewmodel.hand');
    return {
      profile: p.fig.group.userData.characterPresentation,
      skin: skull.material.color.getHex(),
      hand: hand?.material.color.getHex(),
      furRidge: !!p.fig.head.getObjectByName('sf.face.brow.ridge'),
      furCheeks: !!p.fig.head.getObjectByName('sf.hair.cheek.left')
        || !!p.fig.head.getObjectByName('sf.hair.cheek.right'),
    };
  });
  check('Tony remains a human prospect in the Squatchfather mirror and view-model',
    tonyPresentation.profile?.id === 'prospect'
      && tonyPresentation.profile?.species === 'human'
      && tonyPresentation.skin === 0xd2a074
      && tonyPresentation.hand === 0xd2a074
      && !tonyPresentation.furRidge && !tonyPresentation.furCheeks,
    JSON.stringify(tonyPresentation));
  const familyArt = await previewPage.evaluate(async () => {
    const state = window.squatchfather.sceneState;
    await state.artReady;
    const describe = (art) => ({ ...art.userData.art, width: art.geometry.parameters.width });
    return {
      coast: describe(state.props.coastPictureArt),
      portraits: state.props.familyPortraitArt.map(describe),
    };
  });
  check('the supplied coast print is the large dining-room feature picture',
    familyArt.coast.real
      && familyArt.coast.file === 'squatchfather-coast-squatch.png'
      && familyArt.coast.width >= 3.8,
    JSON.stringify(familyArt.coast));
  check('the eleven supplied Family portraits replace Squatchfather filler art',
    familyArt.portraits.length === 11
      && familyArt.portraits.every((portrait) => portrait.real)
      && familyArt.portraits.map((portrait) => portrait.file).join(',')
        === 'bing-hallway-uncle-lou.png,bing-hallway-rippinflow.png,bing-hallway-booskibro.png,bing-hallway-shubenator.png,family-portrait-sauce.webp,family-portrait-lag.webp,family-portrait-hogmama.webp,family-portrait-ape.webp,family-portrait-eric.webp,family-portrait-irish.webp,family-portrait-seff.webp',
    JSON.stringify(familyArt.portraits));
  check('the direct preview exposes a playable start button',
    await previewPage.locator('#startBtn').isVisible()
      && await previewPage.locator('#squatch-preview-notice').isVisible());
  const bathroomWindow = await previewPage.evaluate(() => {
    const glass = window.squatchfather.scene.getObjectByName('bathroom.window.glass');
    const lower = window.squatchfather.scene.getObjectByName('bathroom.window.lowerTile');
    const header = window.squatchfather.scene.getObjectByName('bathroom.window.headerTile');
    const glassBottom = glass.position.y - glass.geometry.parameters.height / 2;
    const glassTop = glass.position.y + glass.geometry.parameters.height / 2;
    const lowerTop = lower.position.y + lower.geometry.parameters.height / 2;
    const headerBottom = header.position.y - header.geometry.parameters.height / 2;
    return {
      named: !!glass,
      opensAboveLower: glassBottom >= lowerTop - 0.08,
      opensBelowHeader: glassTop <= headerBottom + 0.08,
    };
  });
  check('the bathroom window is recessed into a tile opening',
    bathroomWindow.named && bathroomWindow.opensAboveLower && bathroomWindow.opensBelowHeader,
    JSON.stringify(bathroomWindow));
  await previewPage.click('#startBtn');
  await previewPage.waitForFunction(
    () => window.squatchfather.state() === 'START_EXTERIOR',
  );
  await verifyOpeningMovement(previewPage, 'the direct preview');
  const hesitation = await previewPage.evaluate(() => {
    const sf = window.squatchfather;
    sf.go('SHOOT_SAL');
    sf.tick(20.1);
    return {
      beat: sf.state(),
      failureTitle: document.getElementById('deathTitle')?.textContent,
    };
  });
  check('hesitating through the Sal shooting window fails the scene after twenty seconds',
    hesitation.beat === 'FAILED' && hesitation.failureTitle === 'YOU HESITATED',
    JSON.stringify(hesitation));
  await previewPage.close();

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const departure = await page.evaluate(() => window.__squatch.tryLeave());
  check('the apartment selects Squatchfather after the Bing',
    departure?.destination === 'squatchfather', JSON.stringify(departure));
  await page.waitForURL(`http://localhost:${PORT}/squatchfather.html`, { timeout: 45000 });
  await page.waitForFunction(() => window.squatchfather?.fsm, null, { timeout: 60000 });

  let before = await state();
  check('Lou’s package is still carried before the player begins',
    before.packageCarried && before.mission.status === 'available',
    JSON.stringify(before.mission));

  await page.click('#startBtn');
  await page.waitForFunction(() => window.squatchfather.state() === 'START_EXTERIOR');
  const squatchfatherInventory = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    slots: document.querySelectorAll('#hotbar .slot').length,
  }));
  check('Squatchfather keeps the shared five-slot inventory visible',
    squatchfatherInventory.visible && squatchfatherInventory.slots === 5,
    JSON.stringify(squatchfatherInventory));
  let current = await state();
  check('beginning stages the package as the bathroom weapon',
    !current.packageCarried
      && current.mission.status === 'in_progress'
      && current.mission.weaponStaged,
    JSON.stringify(current.mission));
  await verifyOpeningMovement(page, 'the saved-game entry');

  // ---- Recorded audio: the samples must decode, the beds must run on them,
  // the footsteps must land on real files, and a VO beat must actually play.
  const REQUIRED_SAMPLES = [
    'footstep.wood', 'footstep.tile', 'footstep.street.wet',
    'restaurant.room.tone', 'restaurant.murmur', 'restaurant.kitchen',
    'street.wet.night', 'bathroom.tone',
    'train.elevated.rumble', 'train.elevated.roar', 'train.elevated.sub',
    'ear.ringing', 'vo.sf.greeting.1', 'vo.sf.opening.1',
  ];
  await page.waitForFunction(
    (names) => names.every((n) => window.squatchfather.audio.sampleReady(n)),
    REQUIRED_SAMPLES,
    { timeout: 30000 },
  ).catch(() => {});

  const audioState = await page.evaluate((names) => {
    const scene = window.squatchfather;
    scene.tick(0.5); // lets any synth stand-in bed upgrade to its recording
    const missing = names.filter((n) => !scene.audio.sampleReady(n));
    const beds = {};
    for (const [key, bed] of Object.entries(scene.ambience.beds)) {
      if (bed.name) beds[`ambience.${key}`] = !!bed.isSample;
    }
    for (const [key, bed] of Object.entries(scene.train.beds)) {
      beds[`train.${key}`] = !!bed.isSample;
    }
    return { missing, beds, synthBeds: Object.keys(beds).filter((k) => !beds[k]) };
  }, REQUIRED_SAMPLES);
  check('the ambience and train recordings load and drive the live beds',
    audioState.missing.length === 0 && audioState.synthBeds.length === 0,
    JSON.stringify(audioState));

  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.squatchfather.tick(2));
  await page.keyboard.up('KeyW');
  const steps = await page.evaluate(() => ({
    ready: ['footstep.wood', 'footstep.tile', 'footstep.street.wet']
      .every((n) => window.squatchfather.audio.sampleReady(n)),
    played: window.squatchfather.audio.playLog().filter((n) => n.startsWith('footstep.')),
  }));
  check('footsteps resolve to the recorded surface files',
    steps.ready && steps.played.length > 0,
    JSON.stringify({ ready: steps.ready, played: steps.played.slice(0, 4) }));

  // ---- Every seated man faces his authored direction: McClawsky walks in
  // and takes his chair, Sal is across the table, and Prospect's mirror body
  // sits under the camera. The face is checked empirically from the tie's
  // world position, not just the yaw number.
  const facing = await page.evaluate(() => {
    const scene = window.squatchfather;
    scene.go('APPROACH_TABLE');
    scene.tick(8); // the escort walk ends in the chair

    const worldOf = (obj) => {
      obj.updateWorldMatrix(true, false);
      const m = obj.matrixWorld.elements;
      return { x: m[12], z: m[14] };
    };
    const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const measure = (fig, want, lookTarget) => {
      const at = { x: fig.group.position.x, z: fig.group.position.z };
      const tie = worldOf(fig.tie);
      const face = { x: tie.x - at.x, z: tie.z - at.z };
      const fl = Math.hypot(face.x, face.z) || 1;
      const to = { x: lookTarget.x - at.x, z: lookTarget.z - at.z };
      const tl = Math.hypot(to.x, to.z) || 1;
      return {
        yaw: +fig.group.rotation.y.toFixed(3),
        want: +want.toFixed(3),
        yawErr: +Math.abs(wrap(fig.group.rotation.y - want)).toFixed(3),
        faceDot: +((face.x / fl) * (to.x / tl) + (face.z / fl) * (to.z / tl)).toFixed(3),
        seated: fig.seated,
      };
    };

    const table = { x: 0, z: 5 };
    const playerSeat = { x: 0, z: 3.1 };
    const out = { mcMode: scene.mcclawsky.mode };
    out.sal = measure(scene.sal.fig, Math.PI, playerSeat);
    out.mcclawsky = measure(scene.mcclawsky.fig, -Math.PI / 2, table);

    // Prospect's body: sit, measure, and put everything back.
    const p = scene.prospect;
    const saved = { x: p.pos.x, z: p.pos.z, yaw: p.yaw, canMove: p.canMove };
    p.sit();
    out.prospect = measure(p.fig, 0, table);
    p.stand();
    p.teleport({ x: saved.x, z: saved.z }, saved.yaw);
    p.canMove = saved.canMove;
    p.fig.group.position.set(saved.x, 0, saved.z);
    return out;
  });
  const facingOk = (m) => m.seated && m.yawErr <= 0.05 && m.faceDot >= 0.95;
  check('every seated man faces his authored direction',
    facing.mcMode === 'seated'
      && facingOk(facing.sal) && facingOk(facing.mcclawsky) && facingOk(facing.prospect),
    JSON.stringify(facing));

  // ---- The completed faces, pinned by measurement like Margo's check:
  // two brows with skin between them, eyes about an eye-width apart, a nose
  // off the face plane but short of a snout, a mouth wider than the nose,
  // a jaw that tapers inside the skull.
  const faces = await page.evaluate(() => {
    const scene = window.squatchfather;
    const measure = (fig) => {
      const head = fig.head;
      const get = (n) => head.getObjectByName(n);
      const need = ['sf.face.skull', 'sf.face.jaw', 'sf.face.brow.left', 'sf.face.brow.right',
        'sf.face.eye.left', 'sf.face.eye.right', 'sf.face.iris.left', 'sf.face.iris.right',
        'sf.face.pupil.left', 'sf.face.pupil.right', 'sf.face.nose.bridge', 'sf.face.nose.tip',
        'sf.face.lip.upper', 'sf.face.mouth'];
      const missing = need.filter((n) => !get(n));
      if (missing.length) return { missing };
      const dim = (n) => get(n).userData.dim;
      const skull = get('sf.face.skull');
      const eyeL = get('sf.face.eye.left');
      const eyeR = get('sf.face.eye.right');
      const browL = get('sf.face.brow.left');
      const browR = get('sf.face.brow.right');
      const nose = get('sf.face.nose.tip');
      return {
        missing,
        eyeWidth: dim('sf.face.eye.left').w,
        eyeGap: Math.abs(eyeL.position.x - eyeR.position.x) - dim('sf.face.eye.left').w,
        browGap: Math.abs(browL.position.x - browR.position.x) - dim('sf.face.brow.left').w,
        noseOff: (nose.position.z + dim('sf.face.nose.tip').d / 2)
          - (skull.position.z + dim('sf.face.skull').d / 2),
        noseWidth: dim('sf.face.nose.tip').w,
        mouthWidth: dim('sf.face.mouth').w,
        jawWidth: dim('sf.face.jaw').w,
        skullWidth: dim('sf.face.skull').w,
      };
    };
    return { sal: measure(scene.sal.fig), mcclawsky: measure(scene.mcclawsky.fig) };
  });
  const faceOk = (f) => f && !f.missing.length
    && f.eyeGap / f.eyeWidth > 0.8 && f.eyeGap / f.eyeWidth < 1.5
    && f.browGap > 0.02
    && f.noseOff > 0.005 && f.noseOff < 0.03
    && f.mouthWidth > f.noseWidth
    && f.jawWidth < f.skullWidth * 0.85;
  check('both wiseguys wear faces with proportions somebody chose',
    faceOk(faces.sal) && faceOk(faces.mcclawsky), JSON.stringify(faces));

  const talk = await page.evaluate(() => {
    const scene = window.squatchfather;
    const sample = (fig) => {
      fig.speak(1.2);
      let maxMouth = 0;
      let minJaw = 10;
      for (let i = 0; i < 70; i++) {
        scene.tick(0.02);
        maxMouth = Math.max(maxMouth, fig.mouth.scale.y);
        minJaw = Math.min(minJaw, fig.jaw.position.y);
      }
      return {
        maxMouth: +maxMouth.toFixed(2),
        jawDrop: +(fig.jaw.userData.baseY - minJaw).toFixed(3),
      };
    };
    return { sal: sample(scene.sal.fig), mcclawsky: sample(scene.mcclawsky.fig) };
  });
  const talkOk = (t) => t.maxMouth > 1.6 && t.jawDrop > 0.015;
  check('talking opens a shaped mouth, not a hinged slab',
    talkOk(talk.sal) && talkOk(talk.mcclawsky), JSON.stringify(talk));

  // ---- Elbows only ever hinge forward: sampled across the whole gesture
  // library, the walk cycle and a talk, no elbow ever hyperextends backwards.
  const elbows = await page.evaluate(() => {
    const scene = window.squatchfather;
    let max = -10;
    for (const fig of [scene.sal.fig, scene.mcclawsky.fig]) {
      for (const gesture of ['shrug', 'hands', 'drink', 'eat', 'point', 'reach', 'open']) {
        fig.playGesture(gesture, 1.0);
        for (let i = 0; i < 60; i++) {
          scene.tick(0.02);
          for (const a of [fig.armL, fig.armR]) max = Math.max(max, a.elbow.rotation.x);
        }
      }
    }
    return { maxElbowX: +max.toFixed(3) };
  });
  check('every elbow hinges forward, never backwards',
    elbows.maxElbowX <= 0.05, JSON.stringify(elbows));

  // ---- A recorded VO beat plays and holds for the clip's real length.
  const vo = await page.evaluate(() => {
    const scene = window.squatchfather;
    scene.go('OPENING_DIALOGUE');
    scene.tick(2.6); // through the opening beat into Sal's first line
    const log = scene.audio.voLog().slice();
    const hold = scene.dialogue.current && scene.dialogue.current.speaker
      ? +scene.dialogue.t.toFixed(2) : null;
    scene.dialogue.stop(); // don't let the sequence finish under later beats
    return { log, hold };
  });
  check('a recorded VO line plays for the opening beat',
    vo.log.some((v) => v.name === 'vo.sf.opening.1' && v.sample && v.duration > 0.5),
    JSON.stringify(vo));

  // ---- The distant car horn keeps to the street: forced due indoors it
  // stays silent, forced due outdoors it fires. (OPENING_DIALOGUE's update
  // does not drive the ambience crossfade, so setOutside sticks here.)
  const horn = await page.evaluate(() => {
    const scene = window.squatchfather;
    const amb = scene.ambience;
    const count = () => scene.audio.playLog().filter((n) => n === 'street.horn.distant').length;
    amb.passT = 999; amb.clinkT = 999; amb.dripT = 999;
    amb.setOutside(0);
    amb.hornT = -1;
    const before = count();
    scene.tick(0.4);
    const insideFired = count() - before;
    amb.setOutside(1);
    amb.hornT = -1;
    scene.tick(0.4);
    const outsideFired = count() - before - insideFired;
    amb.setOutside(0);
    return { insideFired, outsideFired };
  });
  check('the distant horn never honks indoors',
    horn.insideFired === 0 && horn.outsideFired > 0, JSON.stringify(horn));

  await go('SEARCH_TOILET');
  current = await state();
  check('the bathroom objective is reachable', current.beat === 'SEARCH_TOILET', current.beat);

  await go('RETRIEVE_WEAPON', 1.5);
  const revolver = await page.evaluate(() => ({
    weaponVisible: window.squatchfather.prospect.weapon.visible,
    bundleRevolver: !!window.squatchfather.toiletInteraction.bundle.getObjectByName('bundle.revolver'),
  }));
  check('the bathroom weapon reads as a revolver from the first beat',
    revolver.weaponVisible && revolver.bundleRevolver, JSON.stringify(revolver));

  await page.evaluate(() => window.squatchfather.tick(4.7));
  current = await state();
  check('the real retrieval sequence returns to the table with the weapon',
    current.beat === 'RETURN_TO_TABLE' && current.hasWeapon,
    `${current.beat}, weapon ${current.hasWeapon}`);

  const finalHorn = await page.evaluate(() => {
    const sf = window.squatchfather;
    const count = () => sf.audio.playLog().filter((n) => n === 'train.horn.far').length;
    const before = count();
    sf.go('TRAIN_APPROACH');
    sf.tick(0.2);
    return {
      ready: sf.audio.sampleReady('train.horn.far'),
      played: count() - before,
      intensity: sf.train.target,
    };
  });
  check('the deep train horn sounds under maximum vibration before Tony draws',
    finalHorn.ready && finalHorn.played === 1 && finalHorn.intensity === 1,
    JSON.stringify(finalHorn));
  await page.evaluate(() => {
    window.squatchfather.pressFire();
    window.squatchfather.tick(0.8);
  });
  current = await state();
  check('the train cue advances into the first shooting beat',
    current.beat === 'SHOOT_SAL', current.beat);

  // ---- The first shot must cost what the second one costs.
  //
  // The muzzle flash is a PointLight that is hidden until the trigger, and
  // three.js keys every material's shader program on how many lights are
  // visible. Without a prewarm, the frame that light first appears on has to
  // compile and link a program for the entire room: measured at ~994ms against
  // ~8ms for a quiet frame, which is the ten dropped frames the owner sees.
  //
  // Both shots are driven through the real path here (pressFire + a hair of
  // simulated time, so fire() runs and impacts.update has not yet decayed the
  // flash away), and each is rendered explicitly rather than waiting on frame
  // pacing — a loaded box running software GL renders far too slowly for rAF
  // deltas to say anything, and at 4fps the flash decays inside updateGame and
  // never reaches a render at all.
  //
  // Nothing here is compared against a millisecond count. The quiet reference
  // is a MEDIAN frame, which a single stalled sample cannot move, and it is
  // scaled to the width of the shot window so the two are like for like. The
  // program count is the exact, noise-free half of the proof: the hitch was
  // thirteen new programs, so zero growth is the regression that matters.
  await page.waitForFunction(() => !!window.squatchfather.prewarmReport, null, { timeout: 90000 });
  const shotCost = await page.evaluate(() => {
    const sf = window.squatchfather;
    const { renderer, scene: gl, camera } = sf;
    const draw = () => {
      const t0 = performance.now();
      renderer.render(gl, camera);
      return +(performance.now() - t0).toFixed(2);
    };
    const shoot = () => {
      sf.pressFire();
      sf.tick(0.001); // fire() runs; the flash is lit and not yet decayed
      const window6 = [draw()];
      for (let i = 0; i < 5; i++) { sf.tick(0.02); window6.push(draw()); }
      return window6;
    };
    for (let i = 0; i < 3; i++) draw(); // settle
    const quiet = [];
    for (let i = 0; i < 6; i++) quiet.push(draw());

    const programsBefore = renderer.info.programs.length;
    const first = shoot();
    const programsAfterFirst = renderer.info.programs.length;
    const salBeat = sf.state();
    const second = shoot();
    return {
      quiet,
      first,
      second,
      programsBefore,
      programsAfterFirst,
      programsAfterSecond: renderer.info.programs.length,
      salBeat,
      mcBeat: sf.state(),
      woundsFollowBodies: sf.blood.pool.filter((m) => m.visible).every((m) => (
        m.parent === sf.sal.fig.neck || m.parent === sf.sal.fig.torso
          || m.parent === sf.mcclawsky.fig.neck || m.parent === sf.mcclawsky.fig.torso
      )),
      woundVisuals: sf.blood.pool.filter((m) => m.visible).map((m) => ({
        size: m.geometry.parameters.width,
        side: m.material.side,
        renderOrder: m.renderOrder,
      })),
    };
  });
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const quietFrame = Math.max(median(shotCost.quiet), 0.05);
  const ratioOf = (win) => sum(win) / (quietFrame * win.length);
  const firstRatio = ratioOf(shotCost.first);
  const secondRatio = ratioOf(shotCost.second);
  const shotDetail = JSON.stringify({
    firstShotVsQuiet: +firstRatio.toFixed(2),
    secondShotVsQuiet: +secondRatio.toFixed(2),
    quietMedianMs: +quietFrame.toFixed(2),
    firstFrameMs: shotCost.first[0],
    secondFrameMs: shotCost.second[0],
    programs: [
      shotCost.programsBefore, shotCost.programsAfterFirst, shotCost.programsAfterSecond,
    ],
  });
  check('the first shot compiles nothing the room did not already have',
    shotCost.programsAfterFirst === shotCost.programsBefore
      && shotCost.programsAfterSecond === shotCost.programsBefore,
    shotDetail);
  /* 8x is deliberately loose: a stalled sample on a loaded box has been seen
   * at 5x, and the unprewarmed hitch measured 21x across this same window
   * (994ms in one frame against an 8ms median), so the two do not overlap. */
  check('the first shot costs what a later shot costs',
    firstRatio <= 8 && firstRatio <= Math.max(secondRatio, 1) * 8,
    shotDetail);

  check('shooting Sal advances to McClawsky',
    shotCost.salBeat === 'SHOOT_MCCLAWSKY', shotCost.salBeat);

  current = await state();
  check('shooting McClawsky requires the weapon drop', current.beat === 'DROP_WEAPON', current.beat);
  check('the wounds stay attached to the men as they fall',
    shotCost.woundsFollowBodies === true, JSON.stringify(shotCost.woundsFollowBodies));
  check('four large red wounds remain visible from either side after both men fall',
    shotCost.woundVisuals.length === 4
      && shotCost.woundVisuals.every((w) => w.size >= 0.3 && w.side === 2 && w.renderOrder >= 4),
    JSON.stringify(shotCost.woundVisuals));
  if (process.env.CAPTURE) {
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const sf = window.squatchfather;
      sf.tick(0.9);
      sf.scene.updateMatrixWorld(true);
      sf.renderer.render(sf.scene, sf.camera);
    });
    const captureDir = path.join(ROOT, 'docs', 'validation', '2026-08-01');
    await fsp.mkdir(captureDir, { recursive: true });
    await page.screenshot({
      path: path.join(captureDir, 'squatchfather-blood-after-shots.png'),
    });
  }

  // ---- The room really cowers: the waiter runs to the back corner and goes
  // down; the diners are off their chairs, low, arms wrapped over their
  // heads — and they hold it.
  const cower = await page.evaluate(() => {
    const scene = window.squatchfather;
    scene.tick(3);
    const figs = scene.sceneState.figures;
    const m = (fig) => ({
      cowering: !!fig.cowering,
      pelvisY: +fig.pelvis.position.y.toFixed(2),
      armX: +fig.armL.shoulder.rotation.x.toFixed(2),
    });
    return {
      waiter: {
        ...m(figs.waiter),
        pos: [+figs.waiter.group.position.x.toFixed(2), +figs.waiter.group.position.z.toFixed(2)],
      },
      diner1: m(figs.diner1),
      diner2: m(figs.diner2),
    };
  });
  const down = (m) => m.cowering && m.pelvisY < 0.62 && m.armX < -1.8;
  const waiterInCorner = Math.hypot(cower.waiter.pos[0] + 6.2, cower.waiter.pos[1] - 10.1) < 0.8;
  check('after the shots the room cowers in earnest',
    down(cower.waiter) && down(cower.diner1) && down(cower.diner2) && waiterInCorner,
    JSON.stringify(cower));

  const droppedGun = await page.evaluate(() => {
    window.squatchfather.dropInteraction.drop();
    window.squatchfather.tick(0.2);
    const gun = window.squatchfather.prospect.droppedMesh;
    return {
      name: gun?.name,
      parts: gun?.children.length ?? 0,
      hasCylinder: gun?.children.some((part) => part.geometry?.type === 'CylinderGeometry') ?? false,
    };
  });
  current = await state();
  check('dropping the weapon opens the exit', current.beat === 'WALK_TO_EXIT', current.beat);
  check('the floor weapon is a standalone revolver, not the boxy view-model hand rig',
    droppedGun.name === 'dropped-revolver' && droppedGun.parts >= 10 && droppedGun.hasCylinder,
    JSON.stringify(droppedGun));

  await go('SCENE_COMPLETE', 2.1);
  current = await state();
  check('scene completion persists the dropped weapon',
    current.mission.status === 'complete'
      && current.mission.weaponStaged
      && current.mission.weaponDropped,
    JSON.stringify(current.mission));
  check('the chapter card appears after the car exit', current.endVisible);

  await page.click('#againBtn');
  await page.waitForURL(`http://localhost:${PORT}/index.html`, { timeout: 45000 });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: 60000 });
  const home = await page.evaluate(() => {
    const game = window.__squatch;
    const mission = game.campaign.state.missions.squatchfather;
    return {
      scene: game.campaign.state.scene,
      mission,
      hasPackage: game.campaign.hasItem('parcel'),
      player: {
        mode: game.player.mode,
        x: Number(game.player.position.x.toFixed(2)),
        z: Number(game.player.position.z.toFixed(2)),
      },
    };
  });
  check('Squatchfather returns to the apartment’s front door',
    home.scene.id === 'apartment'
      && home.scene.spawn === 'front_door'
      && home.player.mode === 'walk'
      && home.player.x === 2.55
      && home.player.z === 3.72,
    JSON.stringify(home));
  check('the package does not return after the weapon was dropped',
    !home.hasPackage && home.mission.status === 'complete',
    JSON.stringify(home.mission));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Squatchfather checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Squatchfather checks passed.`);

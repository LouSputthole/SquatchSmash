import {
  CAMPAIGN_STORAGE_KEY,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../../src/core/campaign.js';
import { CAMPAIGN_STAT_MISSION_IDS } from '../../src/core/campaign-stats.js';
import {
  assertNoVisualErrors,
  captureVisual,
  expect,
  installStablePresentation,
  installVisualDeterminism,
  test,
} from './visual-fixture.mjs';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function returnVisitSave() {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    Object.assign(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
      status: 'complete', payloadReleased: true, returnedHome: true,
    });
    state.missions[MISSION_IDS.MANSION_RETURN].status = 'available';
    state.story.chapter = 'mansion_return';
    state.story.day = 12;
    state.story.timeMinutes = 17 * 60 + 10;
  });
  return storage.getItem(CAMPAIGN_STORAGE_KEY);
}

function initiationRecordSave() {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.scene = { id: SCENE_IDS.INITIATION, spawn: 'gathering' };
    state.story.chapter = 'big_night';
    state.story.day = 12;
    state.story.timeMinutes = 23 * 60 + 10;
    Object.assign(state.missions[MISSION_IDS.CARTEL_PALACE], {
      status: 'complete', checkpoint: 'clear',
      evidenceFound: ['photograph', 'security_tape', 'ledger'],
      sauceBetrayalConfirmed: true, markEliminated: true, sauceEliminated: true,
      outcome: 'clean',
    });
    state.missions[MISSION_IDS.INITIATION].status = 'available';
    state.statistics = {
      ...state.statistics,
      missionsCompleted: CAMPAIGN_STAT_MISSION_IDS.length - 1,
      campaignDaysElapsed: 12,
      shotsFired: 407,
      peopleKilled: 53,
      cabinExecutionByProspect: true,
      cabinExecutionCounted: true,
      margoCameHome: true,
      grossTake: 1_260_000,
      palaceEvidenceRecovered: 3,
      familyRespect: 100,
      completedMissionIds: CAMPAIGN_STAT_MISSION_IDS.filter((id) => id !== MISSION_IDS.INITIATION),
    };
  });
  return storage.getItem(CAMPAIGN_STORAGE_KEY);
}

async function bootActiveScene(page, {
  path,
  handle,
  start,
  active,
  seed,
  storage = {},
  outfitId = 'cream_cashmere',
}) {
  await installVisualDeterminism(page, { seed, storage, outfitId });
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(handle, null, { timeout: 180_000 });
  await installStablePresentation(page);
  if (start) {
    const button = page.locator(start);
    /* Preview checkpoints may enter active play before their menu finishes
     * hydrating.  Use the real button whenever it is offered; a hidden button
     * means that route has already consumed the same start transition. */
    if (await button.isVisible()) await button.click();
  }
  if (active) await page.waitForFunction(active, null, { timeout: 180_000 });
}

async function stageHomeMirror(page, kind) {
  return page.evaluate((sceneKind) => {
    /* Park the native loop before moving the real player. The first Ubuntu
     * retry proved that even the short await between staging and capture can
     * admit a frame which resolves the capsule away from the mirror mark. */
    window.__SQUATCH_VISUAL_TEST__.clock.freeze({ capturePending: true });
    const runtime = sceneKind === 'regular'
      ? window.__squatch
      : sceneKind === 'luxury'
        ? window.LUXURY_APARTMENT
        : window.CABIN;
    /* Cabin entry is authored for Day 2 at 09:20. Unlike the Luxury test,
     * which stages its clock in the living-room receipt immediately above,
     * the Cabin receipt used to inherit whichever preview save/default the
     * current campaign implementation supplied. That let a calendar change
     * turn the same mirror baseline from Day 7 daylight into Day 2 pre-dawn.
     * Set the story-owned arrival time while the render clock is frozen; the
     * one explicit capture frame below then applies the matching sun/sky pass. */
    if (sceneKind === 'cabin') runtime.setTime(2, 9 * 60 + 20);
    const home = runtime.apartment ?? runtime.home ?? runtime.cabin;
    const mirror = home.mirrorMesh;
    const bodyController = runtime.firstPersonBody ?? runtime.reflectionBody ?? null;
    const bodyGroup = bodyController?.group
      ?? runtime.scene.children.find((child) => child.userData?.firstPersonBody);
    const bodyMetadata = bodyGroup?.userData?.firstPersonBody ?? null;
    const player = runtime.player;
    const camera = runtime.camera ?? player.camera;

    /* Keep pointer-lock lifecycle events from re-enabling locomotion after the
     * authored pose is applied. suspend() leaves the rendering controllers
     * alive; it only turns off the browser-to-player input route. */
    runtime.input?.suspend?.({ exitPointerLock: false });

    mirror.updateWorldMatrix(true, false);
    const center = mirror.getWorldPosition(mirror.position.clone());
    const quaternion = mirror.getWorldQuaternion(mirror.quaternion.clone());
    const normal = center.clone().set(0, 0, 1).applyQuaternion(quaternion).normalize();
    const signed = player.position.clone().sub(center).dot(normal);
    if (signed < 0) normal.multiplyScalar(-1);
    /* Both multi-room homes spawn beyond the bathroom partition from the
     * usable face of their mirror. Choosing the normal nearest the spawn put
     * the receipt behind that wall; face the bathroom instead. */
    if (sceneKind === 'cabin' || sceneKind === 'luxury') normal.multiplyScalar(-1);
    const eye = center.clone().addScaledVector(normal, 1.52);
    eye.y = Math.max(center.y + 0.02, 1.62);

    player.mode = 'walk';
    /* This is a presentation receipt, not a locomotion probe. Keep the real
     * frame/body/mirror path active while preventing collision resolution from
     * moving the authored camera before that single frame is rendered. */
    player.enabled = false;
    player.yawCenter = null;
    player.pitchMin = -Math.PI / 2 + 0.05;
    player.pitchMax = Math.PI / 2 - 0.05;
    player.position.copy(eye);
    player.ground = eye.y - 1.66;
    player.eyeHeight = 1.66;
    player.velocity?.set?.(0, 0, 0);
    const delta = center.clone().sub(eye);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    player.update?.(0);
    bodyController?.update?.(0, player);
    camera.position.copy(eye);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    /* The regular apartment does not publish its controller. Leave its real
     * update enabled for the one explicit render-clock step below; that frame
     * moves the reflection body to this new player pose before drawing it. */
    if (runtime.game) runtime.game.paused = false;
    if (runtime.state) runtime.state.paused = true;
    runtime.postfx?.setEnabled?.(false);
    return {
      kind: sceneKind,
      mirror: center.toArray().map((value) => +value.toFixed(3)),
      eye: eye.toArray().map((value) => +value.toFixed(3)),
      normal: normal.toArray().map((value) => +value.toFixed(3)),
      outfit: bodyController?.outfitId ?? bodyMetadata?.outfitId ?? null,
      reflectionLayer: bodyController?.reflectionLayer ?? bodyMetadata?.reflectionLayer ?? null,
      visible: bodyGroup?.visible === true,
      day: runtime.time?.day ?? null,
      minutes: runtime.time?.minutes ?? null,
    };
  }, kind);
}

async function expectHomeMirrorPoseHeld(page, kind, staged) {
  const actual = await page.evaluate((sceneKind) => {
    const runtime = sceneKind === 'regular'
      ? window.__squatch
      : sceneKind === 'luxury'
        ? window.LUXURY_APARTMENT
        : window.CABIN;
    const player = runtime.player;
    const camera = runtime.camera ?? player.camera;
    const rounded = (vector) => vector.toArray().map((value) => +value.toFixed(3));
    return {
      player: rounded(player.position),
      camera: rounded(camera.position),
      playerEnabled: player.enabled,
      inputSuspended: runtime.input?.snapshot?.().suspended ?? null,
    };
  }, kind);
  expect(actual).toMatchObject({
    player: staged.eye,
    camera: staged.eye,
    playerEnabled: false,
    inputSuspended: true,
  });
}

test('regular apartment mirror and persisted outfit @smoke', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/index.html?preview=1',
    handle: () => Boolean(window.__squatch?.apartment?.mirrorMesh),
    start: '#start-btn',
    active: () => document.getElementById('overlay')?.classList.contains('hidden'),
    seed: 0x1101,
  });
  const mirror = await stageHomeMirror(page, 'regular');
  expect(mirror).toMatchObject({ outfit: 'cream_cashmere', reflectionLayer: 1, visible: true });
  /* The PR smoke runs on Ubuntu while a reviewed baseline may be authored on
   * Windows. This receipt is the rendered mirror/body/outfit, not Courier New
   * HUD glyphs or the Segoe UI preview banner; both are substituted by Linux
   * and produced a stable 4,794-pixel false diff on the first main run. Keep
   * effects and the whole WebGL frame visible, but remove those unrelated DOM
   * overlays from this one cross-platform release receipt. */
  await page.addStyleTag({ content: `
    #hud, #squatch-preview-notice { visibility: hidden !important; }
  ` });
  await captureVisual(page, 'regular-apartment-mirror-outfit', mirror);
  await expectHomeMirrorPoseHeld(page, 'regular', mirror);
  assertNoVisualErrors(page);
});

test('luxury apartment mirror, living room, and Margo two-floor route', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/luxury-apartment.html?preview=1',
    handle: () => Boolean(window.LUXURY_APARTMENT?.home?.mirrorMesh),
    start: '#start-btn',
    active: () => window.LUXURY_APARTMENT?.state?.phase === 'active',
    seed: 0x2202,
  });

  const living = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.setTime(8, 20 * 60 + 30);
    runtime.state.paused = true;
    /* An authored wide rather than the main spawn's wall-facing yaw: keep the
     * sectional, coffee-table contraband and cinema wall in one stable shot. */
    runtime.camera.position.set(-0.55, 1.76, 6.55);
    runtime.camera.lookAt(4.72, 0.92, 3.28);
    runtime.camera.updateMatrixWorld(true);
    return {
      phase: runtime.state.phase,
      day: runtime.time.day,
      minutes: runtime.time.minutes,
      position: runtime.camera.position.toArray().map((value) => +value.toFixed(3)),
      outfit: runtime.firstPersonBody.outfitId,
    };
  });
  await captureVisual(page, 'luxury-apartment-living-room', living);

  const mirror = await stageHomeMirror(page, 'luxury');
  expect(mirror).toMatchObject({ outfit: 'cream_cashmere', reflectionLayer: 1, visible: true });
  await captureVisual(page, 'luxury-apartment-mirror-outfit', mirror);

  const checkpoints = await page.evaluate(() => window.LUXURY_APARTMENT.debug.margo.checkpointIds);
  const shots = [
    { id: checkpoints.ENTRANCE, name: 'luxury-margo-entrance', eye: [0, 0.9, 2.4], aim: 0.38 },
    { id: checkpoints.STAIRS, name: 'luxury-margo-staircase', eye: [2.5, 1.2, 2.2], aim: 0.38 },
    { id: checkpoints.UPSTAIRS_DRESS, name: 'luxury-margo-upstairs-dress-help', eye: [2.4, 1.15, 0.35], aim: 0.38 },
    { id: checkpoints.SLEEP, name: 'luxury-margo-sleep', eye: [-2.5, 1.0, 2.1], aim: 0.25 },
    { id: checkpoints.MORNING_DEPARTURE, name: 'luxury-margo-morning-departure', eye: [-2.4, 1.1, 2.0], aim: 0.38 },
  ];

  for (const shot of shots) {
    const report = await page.evaluate(({ id, eye, aim }) => {
      const runtime = window.LUXURY_APARTMENT;
      const staged = runtime.debug.margo.stage(id);
      runtime.state.paused = true;
      for (let index = 0; index < 180; index++) runtime.home.doors.elevator.update(1 / 120);
      runtime.camera.position.set(
        staged.position[0] + eye[0],
        staged.position[1] + eye[1],
        staged.position[2] + eye[2],
      );
      runtime.camera.lookAt(staged.position[0], staged.position[1] + aim, staged.position[2]);
      runtime.camera.updateMatrixWorld(true);
      return staged;
    }, shot);
    expect(report).toMatchObject({ checkpoint: shot.id, visible: true });
    await captureVisual(page, shot.name, report);
  }
  assertNoVisualErrors(page);
});

test('cabin mirror and persisted outfit', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/cabin.html?preview=1',
    handle: () => Boolean(window.CABIN?.cabin?.mirrorMesh),
    start: '#start-btn',
    active: () => window.CABIN?.state?.phase === 'active',
    seed: 0x3303,
  });
  const mirror = await stageHomeMirror(page, 'cabin');
  expect(mirror).toMatchObject({
    outfit: 'cream_cashmere', reflectionLayer: 1, visible: true,
    day: 2, minutes: 9 * 60 + 20,
  });
  await captureVisual(page, 'cabin-mirror-outfit', mirror);
  assertNoVisualErrors(page);
});

test('Mansion foyer authored framing', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/mansion.html?preview=1&checkpoint=arrival',
    handle: () => Boolean(window.mansion?.scene && window.mansion?.rooms?.foyerCenter),
    start: '#startBtn',
    active: () => window.mansion?.running === true,
    seed: 0x4404,
  });
  const foyer = await page.evaluate(() => {
    const runtime = window.mansion;
    const at = runtime.rooms.foyerCenter;
    runtime.setRendering(false);
    runtime.visibility.setEnabled(false);
    runtime.teleport(at.x, at.y, at.z + 8.2, 0);
    runtime.player.pitch = -0.035;
    runtime.player.update(0);
    runtime.setRendering(true);
    return {
      anchor: [at.x, at.y, at.z],
      camera: runtime.camera.position.toArray().map((value) => +value.toFixed(3)),
      tierDown: runtime.foyerTierDown,
      visit: runtime.campaign.visit,
    };
  });
  await captureVisual(page, 'mansion-foyer', foyer);
  assertNoVisualErrors(page);
});

test('repaired Mansion debrief pays off the wrong-city clue', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/mansion.html?visit=return',
    handle: () => window.mansion?.campaign?.visit === 'return' && Boolean(window.mansion?.cast),
    start: '#startBtn',
    active: () => window.mansion?.running === true,
    seed: 0x5505,
    storage: { [CAMPAIGN_STORAGE_KEY]: returnVisitSave() },
  });
  const aimed = await page.evaluate(() => {
    const runtime = window.mansion;
    runtime.setRendering(false);
    const labelOf = (target) => {
      const source = target?.userData?.interact?.label;
      return typeof source === 'function' ? source() : source;
    };
    const target = runtime.interaction.targets.find((candidate) => (
      candidate.userData.npc?.name === 'Big Uncle Lou'
      && labelOf(candidate) === "Receive Lou's briefing"
    ));
    if (!target) return { ok: false, reason: 'Lou interaction target missing' };
    target.updateWorldMatrix(true, true);
    const bounds = new runtime.THREE.Box3().setFromObject(target);
    const targetPoint = bounds.getCenter(new runtime.THREE.Vector3());
    targetPoint.y = bounds.max.y - 0.22;
    const at = target.getWorldPosition(new runtime.THREE.Vector3());
    const facing = new runtime.THREE.Vector3(0, 0, -1)
      .applyQuaternion(target.getWorldQuaternion(new runtime.THREE.Quaternion()));
    const rosterLou = runtime.cast.roster.find(({ id }) => id === 'lou');
    for (const distance of [2.15, 2.4]) {
      for (const offset of [Math.PI, 0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const direction = facing.clone().applyAxisAngle(new runtime.THREE.Vector3(0, 1, 0), offset);
        const stand = at.clone().addScaledVector(direction, distance);
        runtime.teleport(stand.x, rosterLou.y, stand.z, 0);
        const dx = targetPoint.x - runtime.player.position.x;
        const dy = targetPoint.y - runtime.player.position.y;
        const dz = targetPoint.z - runtime.player.position.z;
        runtime.player.yaw = Math.atan2(-dx, -dz);
        runtime.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        runtime.tick(0.12);
        if (runtime.interaction.current === target) return { ok: true, distance, offset };
      }
    }
    return { ok: false, reason: 'crosshair did not select Lou' };
  });
  expect(aimed.ok).toBe(true);
  await page.keyboard.press('KeyE');
  const briefing = await page.evaluate(() => {
    const runtime = window.mansion;
    const caption = runtime.cast.captions.find((entry) => (
      entry.cue === 'vo.silentsquatch.return.briefing.lou.instrument'
    ));
    runtime.setRendering(true);
    return { aimed: true, caption, frames: runtime.framesRendered };
  });
  expect(briefing.caption?.text).toMatch(/instrument was right.*wrong fucking city/i);
  await captureVisual(page, 'mansion-repaired-debrief', briefing);
  assertNoVisualErrors(page);
});

test('Enola cockpit carries the subtle wrong-city instrument clue', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/enolasquatch.html?preview=1&airSeed=1945',
    handle: () => window.__squatch?.enolaSquatch === true && Boolean(window.__enolaSquatch?.mission),
    start: '#start-btn',
    active: () => document.getElementById('overlay')?.classList.contains('hidden'),
    seed: 0x1945,
  });
  const clue = await page.evaluate(() => {
    const runtime = window.__enolaSquatch;
    /* The analogue needles advance in the flight loop. Take ownership of its
     * already-scheduled frame before authoring the cockpit receipt so runner
     * speed cannot decide whether the gauges receive an extra tick. */
    window.__SQUATCH_VISUAL_TEST__.clock.freeze({ capturePending: true });
    runtime.browserInput?.suspend?.({ exitPointerLock: false });
    runtime.go('bombApproach');
    /* Settle the reused analogue instrument canvas on fixed simulation time.
     * Its 14 Hz paint cadence and damped needles need more than one 1/30 tick;
     * half a second makes the panel agree with the digital flight HUD without
     * introducing a wall-clock frame into the receipt. */
    runtime.tick(0.5, 1 / 60);
    runtime.postfx.enabled = false;
    runtime.postfx.render();
    runtime.postfx.sample(0);
    return runtime.state().wrongCityClue;
  });
  expect(clue).toMatchObject({
    order: 'THE DESERT COMPOUND', navigation: 'SQUATCHBOURG', visible: true,
  });
  await captureVisual(page, 'enola-wrong-city-instrument', clue, { frames: 0 });
  assertNoVisualErrors(page);
});

test('Cartel Palace courtyard checkpoint', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/cartel-palace.html?preview=1&checkpoint=perimeter',
    handle: () => window.CARTEL_PALACE?.phase === 'menu',
    start: '#start-btn',
    active: () => window.CARTEL_PALACE?.phase === 'active',
    seed: 0x6606,
  });
  const courtyard = await page.evaluate(() => {
    const runtime = window.CARTEL_PALACE;
    runtime.player.yaw = -0.18;
    runtime.player.pitch = -0.04;
    runtime.player.update(0);
    runtime.postfx.enabled = false;
    return {
      checkpoint: runtime.checkpoint,
      beat: runtime.snapshot().beat,
      position: runtime.player.position.toArray().map((value) => +value.toFixed(3)),
      navigationReady: runtime.palaceNavigationReady === true,
    };
  });
  expect(courtyard).toMatchObject({ checkpoint: 'perimeter', beat: 'perimeter' });
  await captureVisual(page, 'cartel-palace-courtyard', courtyard);
  assertNoVisualErrors(page);
});

test('THE TAKE escape-car active view follows real throttle input', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/heist.html?preview=1&checkpoint=vehicle_escape',
    handle: () => Boolean(window.__heistDebug?.start),
    start: '#start',
    active: () => window.__heistDebug?.snapshot().phase === 'driving'
      && window.__heistDebug.inputState().driving,
    seed: 0x7707,
  });
  /* Park the real render loop before staging. The objective and Rippinflow's
   * 5.83-second opening call use native timers, while the road/camera use RAF;
   * the old baseline let software-renderer wall time decide which survived.
   * Wait for the next game callback to queue so no native frame can race the
   * fixed driving simulation below. */
  await page.evaluate(() => window.__SQUATCH_VISUAL_TEST__.clock.freeze());
  await page.waitForFunction(() => (
    window.__SQUATCH_VISUAL_TEST__.clock.snapshot().queued > 0
  ), null, { timeout: 15_000, polling: 50 });
  await page.locator('#scene').click({ position: { x: 480, y: 270 } });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__heistDebug.inputState().keys.includes('KeyW'));
  const drive = await page.evaluate(() => {
    window.__heistDebug.placeCar(20, -300, Math.PI, { resetRoute: true, resetDamage: true });
    return window.__heistDebug.simulateDriving(4, 1 / 120);
  });
  await page.keyboard.up('KeyW');
  expect(drive.ok).toBe(true);
  expect(drive.mph).toBeGreaterThan(60);
  /* This is the active-drive opening, not a world-only beauty shot. Keep its
   * truthful standing order and spoken route call visible even if screenshot
   * capture itself is slow; first assert the exact live state so the test-only
   * presentation class cannot manufacture absent or stale copy. */
  const presentation = await page.evaluate(() => {
    const objectives = document.querySelector('#objectives');
    const subtitle = document.querySelector('#subtitle');
    const snapshot = window.__heistDebug.snapshot();
    const copy = (node) => node?.textContent.replace(/\s+/g, ' ').trim() ?? '';
    const report = {
      objective: [
        copy(objectives?.querySelector('.otitle')),
        copy(objectives?.querySelector('.olist li')),
      ].filter(Boolean).join(' '),
      subtitle: copy(subtitle),
      spoken: snapshot.voice.spoken,
      clock: window.__SQUATCH_VISUAL_TEST__.clock.snapshot(),
    };
    objectives?.classList.add('visual-active-drive');
    subtitle?.classList.add('visual-active-drive');
    return report;
  });
  expect(presentation.objective).toBe(
    'Objective Drive. Follow Rippin’s calls — every wrong turn is a wall.',
  );
  expect(presentation.subtitle).toBe(
    'Rippinflow: Prospect drives. Left out, wrong way on purpose, then the warehouse lights.',
  );
  expect(presentation.spoken).toContain('rippin_drive');
  expect(presentation.clock).toMatchObject({ frozen: true });
  expect(presentation.clock.queued).toBeGreaterThan(0);
  await page.addStyleTag({ content: `
    #objectives.visual-active-drive,
    #subtitle.visual-active-drive {
      display: block !important;
      opacity: 1 !important;
    }
  ` });
  await captureVisual(page, 'the-take-escape-car', { ...drive, presentation });
  assertNoVisualErrors(page);
});

test('Initiation ends on THE PROSPECT\'S RECORD', async ({ page }) => {
  await bootActiveScene(page, {
    path: '/initiation.html',
    handle: () => window.INITIATION?.phase === 'approach',
    start: null,
    active: null,
    seed: 0x8808,
    storage: { [CAMPAIGN_STORAGE_KEY]: initiationRecordSave() },
  });
  /* Exercise the same trusted-input arm the player uses.  The debug skip must
   * not outrun the shared voice bank and manufacture an unloaded-cue error. */
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.INITIATION.audioArmed === true);
  await page.waitForFunction(() => window.INITIATION.audioReady
    || window.INITIATION.audioLoadError,
  null, { timeout: 180_000 });
  expect(await page.evaluate(() => ({
    ready: window.INITIATION.audioReady,
    error: window.INITIATION.audioLoadError,
    missing: window.INITIATION.missingVoiceCues,
  }))).toEqual({ ready: true, error: null, missing: [] });
  await page.evaluate(() => window.INITIATION.skipToInduction());
  await page.waitForFunction(() => window.INITIATION.phase === 'complete'
    && document.querySelector('#credits')?.classList.contains('showing')
    && [...document.querySelectorAll('#credits-track .credits-section')]
      .some((heading) => heading.textContent === "THE PROSPECT'S RECORD"),
  null, { timeout: 180_000 });
  await page.addStyleTag({ content: `
    #credits .credits-window {
      overflow: hidden !important;
      mask-image: none !important;
    }
    #credits .credits-track {
      position: static !important;
      inset: auto !important;
      transform: none !important;
      animation: none !important;
      padding: 12px 16px 40px !important;
    }
    #credits .credits-section { margin-top: 18px !important; }
  ` });
  const record = await page.evaluate(() => {
    const track = document.getElementById('credits-track');
    const windowEl = document.querySelector('#credits .credits-window');
    document.activeElement?.blur?.();
    windowEl.scrollTop = 0;
    const headings = [...track.querySelectorAll('.credits-section')]
      .map((heading) => heading.textContent.trim());
    const rows = [...track.querySelectorAll('.credits-row')].slice(0, 9).map((row) => ({
      label: row.querySelector('.credits-role')?.textContent?.trim(),
      value: row.querySelector('.credits-name')?.textContent?.trim(),
    }));
    return { phase: window.INITIATION.phase, headings, rows };
  });
  expect(record.headings[0]).toBe("THE PROSPECT'S RECORD");
  expect(record.rows[0]).toEqual({ label: 'Missions completed', value: '16 / 16' });
  await captureVisual(page, 'initiation-prospects-record', record);
  assertNoVisualErrors(page);
});

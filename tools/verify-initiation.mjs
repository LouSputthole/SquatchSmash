#!/usr/bin/env node
/**
 * Verify INITIATION NIGHT — the cabin ceremony, all six acts.
 *
 * WHAT THIS FILE USED TO BE, AND WHY THAT MATTERED.
 *
 * It was written for the OLD Initiation -- the gauntlet -- and was never
 * updated when the scene was rewritten as the cabin ceremony. It asserted a
 * cast of 13 with 4 prospects (the ceremony has 15 and 5), expected voice cues
 * under `vo.initiation.ceremony.` (they are `vo.initiation.cabin.` now), and
 * called `skipToGauntlet()` to wait for a phase named `gauntlet_in` that no
 * longer exists in the source. It then read `.requested` off a probe that
 * stopped returning it, threw a TypeError, and DIED -- so acts two through six
 * were never reached, and every check after line 113 had silently not run for
 * as long as the ceremony has existed.
 *
 * That is how the scene's whole fifth act shipped broken. The ritual camera
 * framed a fixed patch of tabletop 2.4 m in front of where the player actually
 * stands, so the hand, the cut, the card and the burning all happened behind
 * the camera; the saint card never burned at all; and the cut sprayed floor
 * decals a metre wide across the cabin for a beat whose stage direction reads
 * "this is not a gore beat". None of it was hard to see. Nothing was looking.
 *
 * So this walks the real phase graph: approach, the line, the clearing, the
 * trail, the cabin, the ritual, the room. It is deliberately blunt about act
 * five, because act five is the one that was never checked.
 *
 * The 2026-08-23 systems pass folded in the first-person rework: the formal
 * articulated cast, voice readiness (loaded/decoded/played, never a synth
 * stand-in), execution free-look, and the mass-kneel staging checks below.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceOverlapFindings } from './voice-overlap-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5206;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Initiation scene.');
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const problems = [];
const missing = [];
page.on('pageerror', (error) => {
  /* WITH THE STACK. A bare message names the Web Audio call that threw and
   * not the code that fed it, and there are twenty-five ramp sites in this
   * game. Two runs were spent narrowing it by hand. */
  const where = (error.stack ?? '').split('\n').slice(1, 4).join(' | ');
  problems.push(where ? `${error.message} @ ${where}` : error.message);
});
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});
page.on('response', (response) => {
  if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
});

/**
 * Get the scene to `phase`, pressing the action button the way a player does.
 *
 * One press is not enough and assuming it was cost two verifier runs. The
 * scene has ONE button: `actionPress()` advances the subtitle when a line is
 * up and only arms the ritual input once the line has cleared. So a beat that
 * speaks and then asks for a press needs at least two, and a slow software
 * renderer stretches every authored second into three or four real ones.
 *
 * Pressing on a slow tick until the phase moves is both what a player does and
 * the only thing that is not a race.
 */
async function driveTo(page, phase, { timeout = 90000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate((want) => window.INITIATION.phase === want, phase)) return true;
    if (Date.now() > deadline) {
      const seen = await page.evaluate(() => window.INITIATION.phase);
      /* WITH WHAT THE PAGE SAID. A stall is almost always an exception in the
       * frame loop, and a bare "never reached X" sends you reading phase
       * tables for an hour. Two runs went that way. */
      const said = problems.length ? ` — page said: ${problems.slice(0, 2).join(' ;; ')}` : '';
      const at = await page.evaluate(() => ({
        t: window.INITIATION.phaseT, paused: window.INITIATION.paused,
      })).catch(() => null);
      throw new Error(`Initiation never reached '${phase}' — stuck in '${seen}' `
        + `(phaseT ${at?.t?.toFixed?.(1) ?? '?'}s, paused ${at?.paused})${said}`);
    }
    await page.evaluate(() => window.INITIATION.smashAction());
    await page.waitForTimeout(400);
  }
}

/**
 * Walk the player, on the real keys, until the phase moves.
 *
 * `approach` and `line_up` advance on DISTANCE -- within 17 m of the line,
 * then within 1.05 m of the slot -- so pressing the action key at them does
 * nothing at all, which is why the first attempt at driving the middle acts
 * sat in `approach` for four two-minute timeouts and reported the scene
 * broken. It was the driver that had no legs.
 *
 * Which key is forward is MEASURED rather than assumed: it holds one, watches
 * whether the gap to the target actually closes, and swaps if it does not.
 * The spawn heading is authored and could be re-authored, and a walker that
 * silently strolls the wrong way would look exactly like a scene that cannot
 * advance.
 */
async function walkTo(page, phase, { timeout = 120000 } = {}) {
  /* Where he is, which way he is pointed, and how far off the mark.
   *
   * `window.INITIATION.player` is the SHARED `Player` (see
   * src/initiation/player-adapter.js), which carries `position` and `yaw`
   * directly. This used to read `player.group.position`, which is a figure's
   * shape and not a controller's -- so every call threw
   * "Cannot read properties of undefined", the walk never took a step, and the
   * four phases downstream of it timed out one after another. Five red checks
   * from one stale property name, and none of them said so. The fallbacks keep
   * it working either way. */
  const state = () => page.evaluate(() => {
    const player = window.INITIATION.player;
    const p = player.position ?? player.group.position;
    const c = window.INITIATION.PLAYER_SLOT;
    return {
      dx: c.x - p.x,
      dz: c.z - p.z,
      yaw: player.yaw ?? player.group.rotation.y,
      enabled: player.enabled === true,
      phase: window.INITIATION.phase,
    };
  });

  const held = new Set();
  const hold = async (keys) => {
    for (const key of [...held]) if (!keys.has(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
  };

  const deadline = Date.now() + timeout;
  /* Which strafe key is his right is MEASURED, not assumed: pick one, watch
   * whether the gap closes, flip once if it does not. Walking confidently in
   * the wrong direction looks exactly like a scene that cannot advance, which
   * is how the first version of this reported four phases broken. */
  let rightIsD = true;
  /* AND SO IS WHICH WAY IS FORWARD, for the same reason and with more at
   * stake. The shared Player's yaw is `Math.atan2(-dx, -dz)` -- a heading
   * whose forward vector is (-sin, -cos) -- and the arithmetic below was
   * written for the opposite convention. A walker that strafes the wrong way
   * wanders; a walker that walks BACKWARDS never arrives, and looks from the
   * outside exactly like a scene that cannot advance. So the forward sign is
   * measured against the closing distance too. */
  let forwardSign = -1;
  let best = Infinity;
  let stale = 0;
  let flippedStrafe = false;
  try {
    for (;;) {
      const at = await state();
      if (at.phase === phase) return true;
      const gap = Math.hypot(at.dx, at.dz);
      if (Date.now() > deadline) {
        /* SAY WHICH OF THE TWO IT WAS.
         *
         * A walker that never moves has two completely different causes and
         * one symptom. Either the scene will not take input -- `Player.enabled`
         * is gated on `inputActive`, which the adapter drives off pointer lock,
         * and a headless Chromium that refuses the lock leaves the keys inert
         * -- or input is arriving and the walk is genuinely going nowhere.
         * Reporting the distance alone sent the first of those to be
         * investigated as the second. */
        throw new Error(at.enabled
          ? `Initiation never walked to '${phase}' — in '${at.phase}', ${gap.toFixed(1)} m out `
            + 'with input live, so the keys are reaching the scene and the walk itself is stuck'
          : `Initiation never walked to '${phase}': the scene never enabled input `
            + `(Player.enabled false in '${at.phase}'). The adapter gates that on pointer `
            + 'lock, which this browser did not grant — the walk was never driveable.');
      }
      if (gap < best - 0.1) { best = gap; stale = 0; flippedStrafe = false; } else { stale += 1; }
      if (stale === 4) {
        /* Strafe first, because it is the cheaper mistake; forward next. */
        if (!flippedStrafe) { rightIsD = !rightIsD; flippedStrafe = true; }
        else { forwardSign = -forwardSign; flippedStrafe = false; }
        stale = 0;
      }

      /* The heading-relative move. Forward is +Z rotated by the yaw, which is
       * the convention `Math.atan2(x, z)` reads for everywhere else here. */
      const sin = Math.sin(at.yaw);
      const cos = Math.cos(at.yaw);
      const forward = (at.dx * sin + at.dz * cos) * forwardSign;
      const right = at.dx * cos - at.dz * sin;
      const keys = new Set();
      if (forward > 0.4) keys.add('KeyW');
      else if (forward < -0.4) keys.add('KeyS');
      if (right > 0.4) keys.add(rightIsD ? 'KeyD' : 'KeyA');
      else if (right < -0.4) keys.add(rightIsD ? 'KeyA' : 'KeyD');
      await hold(keys);
      await page.waitForTimeout(450);
    }
  } finally {
    await hold(new Set());
  }
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  await page.goto(`http://localhost:${PORT}/initiation.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.phase, null, { timeout: 60000 });

  const initial = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    members: window.INITIATION.members.length,
    memberNames: window.INITIATION.members.map((member) => member.name).filter(Boolean),
    prospects: window.INITIATION.prospects.length,
    playerController: window.INITIATION.player?.constructor?.name,
    presentationFigure: window.INITIATION.playerFigure?.constructor?.name,
    control: window.INITIATION.control,
    pose: window.INITIATION.playerPose,
    formalMembers: window.INITIATION.members.every((member) => member.sq?.model?.dress === 'suit'),
    formalProspects: window.INITIATION.prospects.every((prospect) => prospect.sq?.model?.dress === 'suit'),
    actorColliders: window.INITIATION.actorColliders,
    objective: document.querySelector('#objective')?.textContent,
    /* WHAT THE PLAYER ACTUALLY READS, which is now the shared upper-left
     * panel every other scene uses rather than this scene's own div. The keys
     * live in the panel's hint line, so a check that wants to know the player
     * was told how to move has to look at both halves. */
    panel: document.querySelector('#objectives')?.textContent ?? null,
    canvasCount: document.querySelectorAll('canvas').length,
    inventoryVisible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    inventorySlots: document.querySelectorAll('#hotbar .slot').length,
  }));

  check('the namespaced Initiation scene reaches its interactive approach phase',
    initial.phase === 'approach' && initial.control === 'playable' && initial.canvasCount >= 1,
    JSON.stringify(initial));
  /* The ceremony's cast, not the gauntlet's: fifteen of the Circle in the
   * clearing and five prospects in the line, Kittenboss among them. */
  check('the ceremony cast and prospect line are preserved',
    initial.members === 15 && initial.prospects === 5,
    `${initial.members} members, ${initial.prospects} NPC prospects`);
  check('Tony uses the shared first-person Player with a separate articulated ceremony body',
    initial.playerController === 'Player'
      && initial.presentationFigure === 'InitiationCeremonyFigure'
      && initial.pose === 'standing',
    JSON.stringify(initial));
  check('every attendee keeps their canonical body in a formal suit',
    initial.formalMembers && initial.formalProspects,
    JSON.stringify({ members: initial.formalMembers, prospects: initial.formalProspects }));
  check('soft actor collision is live but smaller than a roadblock',
    initial.actorColliders.length === 20
      && initial.actorColliders.every((circle) => circle.active && circle.r >= 0.32 && circle.r <= 0.45),
    JSON.stringify(initial.actorColliders));
  check('Captain Lou Sasole appears under his canonical identity',
    initial.memberNames.includes('CAPTAIN LOU SASOLE'),
    initial.memberNames.join(' | '));
  check('the scene gives a visible movement objective, on the shared panel',
    Boolean(initial.objective) && (initial.panel ?? '').includes('WASD'),
    `${initial.objective || 'no objective'} | panel: ${initial.panel ?? 'absent'}`);
  check('Initiation keeps the shared five-slot inventory visible',
    initial.inventoryVisible && initial.inventorySlots === 5,
    JSON.stringify({ visible: initial.inventoryVisible, slots: initial.inventorySlots }));

  await page.locator('canvas').first().click({ position: { x: 320, y: 180 } });
  await page.waitForFunction(() => window.INITIATION.audioReady || window.INITIATION.audioLoadError,
    null, { timeout: 120000 });
  const audioState = await page.evaluate(() => ({
    ready: window.INITIATION.audioReady,
    error: window.INITIATION.audioLoadError,
    missing: window.INITIATION.missingVoiceCues,
    failed: window.INITIATION.failedCues,
  }));
  check('the first gesture decodes the active Initiation voice bank before ceremony dialogue',
    audioState.ready && !audioState.error && audioState.missing.length === 0 && audioState.failed.length === 0,
    JSON.stringify(audioState));
  check('all scene modules, art and face textures load', missing.length === 0, missing.join(' | '));

  /* ---------------------------------------------------------------- */
  /* ACT ONE — the clearing                                             */
  /* ---------------------------------------------------------------- */

  const voiceProbe = await page.evaluate(() => window.INITIATION.speakVoiceProbe());
  check('the conspiracy reveal uses the authored Lou cue',
    voiceProbe.speaker === 'BIG UNCLE LOU SPUTTHOLE'
      && voiceProbe.line.includes('Willy wasn’t the rat')
      && voiceProbe.cue.startsWith('vo.initiation.cabin.'),
    JSON.stringify(voiceProbe));
  check('the conspiracy reveal cue actually entered the audible buffer graph',
    voiceProbe.loaded && voiceProbe.duration > 0 && voiceProbe.played && !voiceProbe.blocked,
    JSON.stringify(voiceProbe));

  const quizVoiceProbe = await page.evaluate(() => window.INITIATION.speakQuizVoiceProbe());
  check('Tony reads the selected founders answer through a decoded voice take',
    quizVoiceProbe.speaker === 'PROSPECT TWO'
      && quizVoiceProbe.line.includes('Deathmegatron')
      && quizVoiceProbe.cue.startsWith('vo.initiation.ceremony.prospect-two.')
      && quizVoiceProbe.loaded && quizVoiceProbe.duration > 0
      && quizVoiceProbe.played && !quizVoiceProbe.blocked,
    JSON.stringify(quizVoiceProbe));

  /* ---------------------------------------------------------------- */
  /* ACTS TWO TO FOUR — the part nothing had ever played               */
  /* ---------------------------------------------------------------- */

  /* THIS IS THE GAP THAT LET ACT FIVE SHIP BROKEN, ONE ACT EARLIER.
   *
   * Until now this verifier touched `approach` and then called
   * `skipToRitual()`, so forty of the scene's forty-five phases were never
   * once played by anything. The pure tests prove the phase graph is sound --
   * every phase reachable, every exit real, every beat authored -- and that is
   * a different claim from the runtime actually walking it: timers firing,
   * cameras cutting, lines playing, the pistol changing hands. Act five was
   * proven as data too, and shipped broken. See docs/ENGINE-TRAPS.md 5.
   *
   * Driven, not skipped. `driveTo` presses the action key on a slow tick,
   * which is what a player does and the only thing that is not a race. */
  /* On foot to the line, because that is how a player gets there. */
  let walked = true;
  try {
    await walkTo(page, 'line_chat', { timeout: 120000 });
  } catch (error) {
    walked = false;
    check('the player can walk from the woods to his place in the line', false, error.message);
  }
  if (walked) check('the player can walk from the woods to his place in the line', true);

  const MIDDLE = [
    ['speech', 'Booskibro speaks to the line'],
    ['q1', 'the first question is asked'],
    ['exec_one', 'the first man is taken out of the line'],
    ['q2_intro', 'the second question comes round'],
  ];
  for (const [phase, what] of MIDDLE) {
    let reached = true;
    try {
      await driveTo(page, phase, { timeout: 120000 });
    } catch (error) {
      reached = false;
      check(`the scene reaches ${phase} — ${what}`, false, error.message);
    }
    if (reached) check(`the scene reaches ${phase} — ${what}`, true);
  }

  /* Nobody talked over anybody on the way here. The engine's own playback log
   * is the evidence; `voiceOverlaps()` is the arithmetic. A line that MEANS
   * to cut in says so with `interrupt: true` and is not reported. */
  const midOverlap = await voiceOverlapFindings(page, 'window.INITIATION.audio');
  check('the audio engine is reachable, so silence here means silence',
    midOverlap.reachable, midOverlap.reachable ? `${midOverlap.voices} voice lines heard ${JSON.stringify(midOverlap.windows?.slice(0, 5))}` : 'window.INITIATION.audio did not resolve');
  check('no two people talk over each other through the executions',
    midOverlap.reachable && midOverlap.findings.length === 0,
    midOverlap.findings.length
      ? JSON.stringify(midOverlap.findings.slice(0, 4))
      : `${midOverlap.voices} lines, none overlapping`);

  /* ---------------------------------------------------------------- */
  /* ACT FIVE — the blade, the hand, the cut, the card, the burning    */
  /* ---------------------------------------------------------------- */

  await page.evaluate(() => window.INITIATION.skipToMassKneel());
  const kneel = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    control: window.INITIATION.control,
    pose: window.INITIATION.playerPose,
    eyeY: window.INITIATION.player.position.y,
    kneeling: window.INITIATION.prospects
      .filter((prospect) => prospect.name !== 'PROSPECT ONE')
      .map((prospect) => ({ name: prospect.name, pose: prospect.sq.pose, rootY: prospect.sq.position.y })),
  }));
  check('mass execution staging keeps Tony kneeling in first-person free-look',
    kneel.phase === 'mass_kneel' && kneel.control === 'look-only'
      && kneel.pose === 'kneeling' && kneel.eyeY < 1.1,
    JSON.stringify(kneel));
  check('all four remaining prospects kneel on articulated legs without buried roots',
    kneel.kneeling.length === 4
      && kneel.kneeling.every((entry) => entry.pose === 'kneeling' && entry.rootY >= -0.01),
    JSON.stringify(kneel.kneeling));


  await page.evaluate(() => window.INITIATION.skipToRitual());
  await page.waitForFunction(() => window.INITIATION.phase === 'blade', null, { timeout: 30000 });

  const ritualStart = await page.evaluate(() => window.INITIATION.ritual);
  check('act five opens on the ritual camera',
    ritualStart.camera === 'ritual', JSON.stringify(ritualStart));

  /* THE CHECK THAT WOULD HAVE CAUGHT IT. The shot is supposed to be close on
   * the hand; it aimed at a fixed patch of tabletop 2.4 m in front of it.
   *
   * On `aimMiss` and not `lookMiss`: the camera flies rather than cuts, and a
   * debug skip from the clearing to the cabin starts it 70 m away, so the
   * smoothed look point is meaningless for about a second afterwards. */
  check('the ritual camera is aimed at the hand',
    ritualStart.aimMiss < 1.0,
    `shot aims ${ritualStart.aimMiss?.toFixed(2)} m off the hand`);

  /* And the skip CUT rather than flew: the smoothed look point is already on
   * the hand, because `skipToRitual` snaps the camera to the shot. Before it
   * did, this waited twenty seconds for a camera to cross the map and then
   * timed out anyway on a slow software renderer. */
  check('a skip into act five cuts to the shot rather than flying to it',
    ritualStart.lookMiss < 1.0,
    `look point misses the hand by ${ritualStart.lookMiss?.toFixed(2)} m`);

  /* Drive it: the blade runs on a timer, then the hand is asked for, then the
   * cut. Every one of those beats speaks first, so every one needs more than
   * one press. */
  await page.waitForFunction(() => window.INITIATION.phase === 'hand', null, { timeout: 90000 });
  await driveTo(page, 'cut');
  await driveTo(page, 'card');

  const afterCut = await page.evaluate(() => window.INITIATION.ritual);
  check('the cut is marked on the palm, not on the floorboards',
    afterCut.palmCut, JSON.stringify(afterCut));
  check('the saint card is in the player\'s hand from IN-420, before the oath',
    afterCut.cardInPlayerHand && afterCut.cardVisible,
    JSON.stringify(afterCut));

  /* Both oath lines -- Lou says each, the prompt goes up, Tony repeats it --
   * and then the burning. */
  await driveTo(page, 'burn', { timeout: 180000 });
  await page.evaluate(() => window.INITIATION.setHold(true));
  /* The burn tick is held off while IN-440 is still speaking, so this waits
   * for the line as well as for the card to take. */
  await page.waitForFunction(() => window.INITIATION.ritual.char > 0, null, { timeout: 90000 });

  const burning = await page.evaluate(() => window.INITIATION.ritual);
  check('the card catches, and there is a flame on it',
    burning.char > 0 && burning.flame && burning.cardVisible,
    JSON.stringify(burning));
  check('the card is burning in the player\'s own hand',
    burning.cardInPlayerHand, JSON.stringify(burning));
  check('the camera stays on the burning hand',
    burning.lookMiss < 1.0 && burning.aimMiss < 1.0,
    `aim ${burning.aimMiss?.toFixed(2)} m / look ${burning.lookMiss?.toFixed(2)} m off the hand`);

  /* Let go. Past the commit, Lou has it and nothing dead-ends. */
  await page.waitForFunction(() => window.INITIATION.ritual.committed, null, { timeout: 90000 });
  await page.evaluate(() => window.INITIATION.setHold(false));
  await page.waitForFunction(() => window.INITIATION.phase === 'made', null, { timeout: 120000 });

  const made = await page.evaluate(() => window.INITIATION.ritual);
  check('a player who lets go after the commit is held, and it burns down',
    made.char === 1 && !made.cardVisible,
    JSON.stringify(made));

  /* ---------------------------------------------------------------- */
  /* ACT SIX — the room, and out                                       */
  /* ---------------------------------------------------------------- */

  /* Act six is the room, Lou's aside, and the pull-back out of the window:
   * about 76 authored seconds, several of which wait on a press.
   *
   * THE BUDGET IS ARITHMETIC, NOT A NUDGE. `main.js` clamps its frame delta to
   * 0.05 s, so a phase timer advances at (fps / 20) of real time and never
   * faster. Measured here at the stall: phaseT reached 10.9 s in 420 s of wall
   * clock -- about 2.6% of real time, which is half a frame a second. At that
   * rate `pullback`'s 14 s timer alone needs nine minutes, so 420 s was never
   * enough and the runs that passed inside it were lucky rather than fast.
   *
   * A real player at 60 fps sees no clamp at all and act six takes act six.
   *
   * AND IT IS NOT ACT SIX. `tools/probe-initiation-fps.mjs` samples the same
   * phase clock across the scene and measured 2.9 fps in the clearing, 1.5 in
   * the cabin and 1.3 at the pull-back: uniformly slow, declining gently with
   * how much is dressed in front of the camera. That is the headless software
   * renderer, not a beat doing something expensive, and there is nothing here
   * to fix. Act six only LOOKED singular because it is the one act gated on a
   * long unattended timer rather than on a keypress. */
  await driveTo(page, 'complete', { timeout: 900000 });
  const inducted = await page.evaluate(() => ({
    controller: window.INITIATION.player?.constructor?.name,
    figure: window.INITIATION.playerFigure?.constructor?.name,
    bandana: window.INITIATION.playerFigure?.model?.bandana,
    dead: window.INITIATION.deadProspects,
    title: document.querySelector('#complete .title')?.textContent?.trim(),
    subtitle: document.querySelector('#complete .subtitle')?.textContent?.replace(/\s+/g, ' ').trim(),
    visible: !document.querySelector('#complete')?.classList.contains('hidden'),
  }));
  check('induction keeps shared first-person control and awards Tony the member bandana',
    inducted.controller === 'Player'
      && inducted.figure === 'InitiationCeremonyFigure'
      && inducted.bandana === true,
    JSON.stringify(inducted));
  check('Kittenboss dies beside Tony and Tony is the only surviving prospect',
    ['PROSPECT ONE', 'PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE', 'KITTENBOSS']
      .every((name) => inducted.dead.includes(name))
      && !inducted.dead.includes('PROSPECT TWO'),
    JSON.stringify(inducted.dead));
  check('completion describes family membership rather than a species change',
    inducted.visible
      && inducted.title === 'SILVER SASQUATCH'
      && inducted.subtitle?.includes("walking out family")
      && !inducted.subtitle?.includes('squatch feet'),
    JSON.stringify(inducted));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} catch (error) {
  console.error('Initiation verifier aborted before checks completed.');
  console.error('Runtime errors:', problems);
  console.error('Missing responses:', missing);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Initiation checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Initiation checks passed.`);

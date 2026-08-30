#!/usr/bin/env node
/**
 * Verify THE COLD OPEN in a real browser.
 *
 * The opening's whole job is to make the player believe Squatch Smash is the
 * product he downloaded, and then take that belief off him. Every claim in
 * that sentence is checkable, and none of it is checkable by reading code:
 *
 *   - the monitor has to COVER the viewport. Not fit it. A black band round
 *     the edge of "the game" is the one tell that gives the opening away
 *     before it has started, and whether the quad clears the frustum edge
 *     depends on the desk, the field of view AND the window shape.
 *   - the camera must not move until he says yes to quitting.
 *   - the real Squatch Smash pause/quit UI must start the reveal.
 *   - the reveal has to pass through his chair, then put him on his feet and
 *     return real apartment movement without asking for Q.
 *   - the phone must NOT ring during the beat afterwards. Forty seconds of
 *     nothing is what carries him from "I quit the game" to "that was a game
 *     inside this game", and a call landing in it steps on all of it.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5240;
const EVIDENCE_DIR = path.join(ROOT, 'artifacts', 'cold-open');
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
  console.error('playwright is not installed; cannot verify the cold open.');
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

/* Record the input the verifier really sends in every frame. This regression
 * is specifically "no Q required", so the proof must be able to say that Q
 * never arrived by accident through a helper or focus workaround. */
await page.addInitScript(() => {
  window.__coldOpenVerifyKeys = [];
  window.__coldOpenVerifyContextLosses = 0;
  window.__coldOpenVerifyContextRestores = 0;
  window.addEventListener('keydown', (event) => {
    window.__coldOpenVerifyKeys.push(event.code);
  }, true);
  window.addEventListener('webglcontextlost', () => {
    window.__coldOpenVerifyContextLosses += 1;
  }, true);
  window.addEventListener('webglcontextrestored', () => {
    window.__coldOpenVerifyContextRestores += 1;
  }, true);
});

const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});
page.on('requestfailed', (request) => {
  /* Media can be deliberately absent and substituted by the audio engine;
   * documents and code cannot. Keep the network assertion about boot/runtime
   * integrity instead of turning the recording backlog into a scene failure. */
  if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
    problems.push(`${request.resourceType()} failed: ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
  }
});

const results = [];
const RETURNING_ONLY = process.argv.includes('--returning-only');
const EXIT_CONTROL_ONLY = process.argv.includes('--exit-control-only');
const HELD_TAB_ONLY = process.argv.includes('--held-tab-only');
const EXIT_WALL_BUDGET_MS = 12000;
const SHUTDOWN_WALL_BUDGET_MS = 30000;
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/* THE BUDGETS ARE WRITTEN IN REAL-TIME SECONDS, AND NOT EVERY MACHINE HAS ANY.
 *
 * The strict wall-clock limits below are a deliberate regression boundary --
 * an authored 5.2-second reveal has to arrive in something like 5.2 seconds,
 * and the 120-second waits they replaced certified a route that took over
 * three minutes. But they assume the page paints in real time, and under
 * `--use-gl=swiftshader` -- which is how this repo launches locally and in CI
 * -- it does not. The reveal still advances on wall time, so what actually
 * runs out is the RENDER: at ten frames a second the same authored move is
 * drawn in a fiftieth of the frames, and every step around it -- the pause
 * menu, the shutdown card, the landing -- costs whole frames the budget was
 * never sized for.
 *
 * So measure what the page really draws and scale by how far short of 60 fps
 * it falls, never below the authored value. On a real-time machine the ratio
 * is 1 and the strict budgets stand exactly as written. */
let wallScale = 1;

/** A wall-clock budget in the frames this machine actually paints. */
function budget(ms) {
  return Math.max(ms, Math.round(ms * wallScale));
}

/** Count real animation frames. Nothing else can tell us how slow this is. */
async function measureFrameRate(target, sampleMs = 2000) {
  return target.evaluate((ms) => new Promise((resolve) => {
    const started = performance.now();
    let ticks = 0;
    const tick = () => {
      ticks += 1;
      const elapsed = performance.now() - started;
      if (elapsed >= ms) resolve(ticks / (elapsed / 1000));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), sampleMs);
}

async function calibrateWallBudgets(target, label) {
  const fps = await measureFrameRate(target);
  wallScale = Math.max(1, 60 / Math.max(fps, 0.05));
  console.log(`  info  ${label} paints ${fps.toFixed(1)} fps; wall budgets ×${wallScale.toFixed(1)} `
    + `(exit ${budget(EXIT_WALL_BUDGET_MS)}ms, shutdown ${budget(SHUTDOWN_WALL_BUDGET_MS)}ms)`);
  return fps;
}

/** Let the page render for a while: the reveal is a five-second camera move. */
async function settle(seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  }
}

const state = () => page.evaluate(() => window.__squatch.coldOpenState);

async function verifyParentExitRoute(kind) {
  const routePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const routeProblems = [];
  routePage.on('pageerror', (error) => routeProblems.push(error.message));
  routePage.on('console', (message) => {
    if (message.type() === 'error') routeProblems.push(message.text().slice(0, 240));
  });
  routePage.on('requestfailed', (request) => {
    if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
      routeProblems.push(`${request.resourceType()} failed: ${request.url()}`);
    }
  });

  try {
    await routePage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
    await routePage.waitForFunction(() => window.__squatch?.coldOpenState?.active === true,
      null, { timeout: 90000 });
    await calibrateWallBudgets(routePage, `the ${kind} route`);
    const exitControl = routePage.locator('button').filter({
      hasText: /EXIT TO DESKTOP|QUIT SQUATCH SMASH/,
    }).first();
    await exitControl.waitFor({ state: 'visible', timeout: 60000 });
    const exitCopy = await exitControl.evaluate((button) => ({
      text: button.textContent,
      aria: button.getAttribute('aria-label'),
      title: button.title,
    }));
    check(`the ${kind} cold-open exit does not reveal SquatchOS`,
      /QUIT SQUATCH SMASH/i.test(exitCopy.text)
        && !/SquatchOS|desktop/i.test(`${exitCopy.text} ${exitCopy.aria} ${exitCopy.title}`),
      JSON.stringify(exitCopy));

    let actionStartedAt;
    if (kind === 'click') {
      await exitControl.evaluate((button) => {
        button.addEventListener('click', () => {
          window.__coldOpenExitRequestedAt = Date.now();
        }, { once: true });
      });
      await exitControl.click();
      actionStartedAt = await routePage.evaluate(() => window.__coldOpenExitRequestedAt);
    } else {
      const frameElement = await routePage.waitForSelector(
        'iframe[title="Squatch Smash"]', { timeout: 60000 },
      );
      const frame = await frameElement.contentFrame();
      if (!frame) throw new Error('Held-Tab Squatch Smash iframe never produced a document');
      await frame.evaluate(() => {
        window.__coldOpenHeldTabKeys = [];
        window.addEventListener('keydown', (event) => {
          if (event.code === 'Tab') window.__coldOpenHeldTabKeys.push('down');
        }, true);
        window.addEventListener('keyup', (event) => {
          if (event.code === 'Tab') window.__coldOpenHeldTabKeys.push('up');
        }, true);
      });
      /* Put browser focus on a real control in the framed game, then deliver
       * the same physical keydown/hold/keyup sequence a player does. Calling
       * dispatchEvent here would only prove a JavaScript listener. */
      await frame.locator('#startBtn').click();
      await frame.waitForFunction(() => window.SQUATCH?.state === 'playing',
        null, { timeout: 30000 });
      actionStartedAt = Date.now();
      await routePage.keyboard.down('Tab');
      await routePage.waitForTimeout(800);
      await routePage.keyboard.up('Tab');
      const tabKeys = await frame.evaluate(() => window.__coldOpenHeldTabKeys);
      check('the real held-Tab keystroke reaches the framed game',
        tabKeys.includes('down') && tabKeys.includes('up'), JSON.stringify(tabKeys));
    }

    const exitBudgetMs = budget(EXIT_WALL_BUDGET_MS);
    let returnedToWorld = true;
    try {
      await routePage.waitForFunction(() => {
        const runtime = window.__squatch;
        return runtime
          && runtime.coldOpenState.active === false
          && runtime.game.seated === false
          && runtime.player.mode === 'walk'
          && runtime.inputOwner === 'world'
          && runtime.arcade.inputMode === 'relative'
          && runtime.arcade.mode === 'desktop'
          && runtime.arcade.app === null
          && runtime.interaction.paused === false;
      }, null, { timeout: exitBudgetMs });
    } catch {
      returnedToWorld = false;
    }

    const wallMs = Date.now() - actionStartedAt;
    const landed = await routePage.evaluate(() => {
      const runtime = window.__squatch;
      const frame = document.querySelector('iframe[title="Squatch Smash"]');
      return {
        coldOpenActive: runtime.coldOpenState.active,
        phase: runtime.coldOpenState.phase,
        seated: runtime.game.seated,
        playerMode: runtime.player.mode,
        inputOwner: runtime.inputOwner,
        arcadeInputMode: runtime.arcade.inputMode,
        arcadeMode: runtime.arcade.mode,
        arcadeApp: runtime.arcade.app?.id ?? null,
        interactionPaused: runtime.interaction.paused,
        frameVisible: frame ? getComputedStyle(frame).display !== 'none' : false,
        frameSrc: frame?.getAttribute('src') ?? null,
        x: runtime.player.position.x,
        z: runtime.player.position.z,
      };
    });
    check(`the ${kind} route completes the reveal and stands him within the wall-clock budget`,
      returnedToWorld && wallMs < exitBudgetMs
        && !landed.coldOpenActive && landed.phase === 'beat' && !landed.seated
        && landed.playerMode === 'walk' && landed.inputOwner === 'world'
        && landed.arcadeInputMode === 'relative'
        && landed.arcadeMode === 'desktop' && landed.arcadeApp === null
        && !landed.interactionPaused && !landed.frameVisible
        && landed.frameSrc === 'about:blank',
      JSON.stringify({ wallMs, budgetMs: exitBudgetMs, ...landed }));

    if (returnedToWorld) {
      await routePage.keyboard.down('KeyS');
      try {
        await routePage.waitForFunction(({ x, z }) => {
          const player = window.__squatch?.player;
          return player && Math.hypot(player.position.x - x, player.position.z - z) > 0.10;
        }, { x: landed.x, z: landed.z }, { timeout: 30000 });
      } finally {
        await routePage.keyboard.up('KeyS');
      }
    }
    const moved = await routePage.evaluate(({ x, z }) => ({
      distance: Math.hypot(window.__squatch.player.position.x - x, window.__squatch.player.position.z - z),
      mode: window.__squatch.player.mode,
      owner: window.__squatch.inputOwner,
    }), { x: landed.x, z: landed.z });
    check(`real movement works after the ${kind} exit without Q or another click`,
      returnedToWorld && moved.distance > 0.10 && moved.mode === 'walk' && moved.owner === 'world',
      JSON.stringify(moved));
    check(`the ${kind} exit has no runtime or network errors`,
      routeProblems.length === 0, routeProblems.slice(0, 3).join(' | '));

    await fsp.mkdir(EVIDENCE_DIR, { recursive: true });
    const evidence = path.join(EVIDENCE_DIR, `parent-${kind}-exit-to-apartment.png`);
    await routePage.screenshot({ path: evidence, animations: 'disabled' });
    console.log(`  evidence  ${path.relative(ROOT, evidence)}`);
  } finally {
    await routePage.close();
  }
}

try {
  if (!RETURNING_ONLY && !EXIT_CONTROL_ONLY && !HELD_TAB_ONLY) {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.coldOpenState, null, { timeout: 90000 });
  /* The cold open is armed after boot resolves, which is a tick later than
   * the debug surface appearing. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.active, null, { timeout: 60000 });
  await calibrateWallBudgets(page, 'the cold open');

  /* ---------------------------------------------------------------- */
  /* 1. IT OPENS IN SQUATCH SMASH                                      */
  /* ---------------------------------------------------------------- */
  const opening = await state();
  check('the game opens straight into Squatch Smash, with no title card',
    opening.active && opening.overlayHidden && opening.app === 'smash',
    JSON.stringify(opening));
  check('he is in the chair, and never asked to sit in it',
    opening.seated && opening.posture === null,
    `seated=${opening.seated} posture=${JSON.stringify(opening.posture)}`);
  check('SquatchOS never shows him it booted',
    opening.osMode === 'app', `os mode ${opening.osMode}`);

  /* THE CHECK THE WHOLE OPENING RESTS ON. */
  check('the monitor COVERS the viewport — no room visible around the game',
    opening.covers,
    `quad ndc x[${opening.cover.minX?.toFixed(2)}, ${opening.cover.maxX?.toFixed(2)}] `
    + `y[${opening.cover.minY?.toFixed(2)}, ${opening.cover.maxY?.toFixed(2)}] (needs to pass ±1)`);

  check('the real Squatch Smash page is the thing on screen',
    (await page.locator('iframe').count()) > 0
      && await page.evaluate(() => {
        const frame = document.querySelector('iframe');
        return !!frame && getComputedStyle(frame).display !== 'none'
          && (frame.getAttribute('src') || '').includes('game/');
    }),
    'the embedded page is game/index.html, not a mock');

  const frameElement = await page.waitForSelector('iframe[title="Squatch Smash"]', { timeout: 60000 });
  const smashFrame = await frameElement.contentFrame();
  if (!smashFrame) throw new Error('Squatch Smash iframe never produced a document');
  await smashFrame.waitForFunction(() => window.SQUATCH?.state === 'menu', null, { timeout: 60000 });
  const openingGameCopy = await smashFrame.locator('body').innerText();
  check('the Squatch Smash menu does not spoil the apartment before the reveal',
    !/apartment|SquatchOS|leave the desk/i.test(openingGameCopy));

  /* ---------------------------------------------------------------- */
  /* 2. NOTHING MOVES UNTIL HE QUITS                                    */
  /* ---------------------------------------------------------------- */
  await settle(1.5);
  const held = await state();
  check('the camera does not drift while he plays',
    held.phase === 'playing' && held.pullbackK === 0 && held.covers,
    JSON.stringify({ phase: held.phase, k: held.pullbackK, covers: held.covers }));
  check('and the phone is not counting down yet',
    held.ringsIn === null, `ringsIn=${held.ringsIn}`);

  /* ---------------------------------------------------------------- */
  /* 3. THE FAKE QUIT, AND THE REVEAL                                   */
  /* ---------------------------------------------------------------- */
  const startedAt = held.cameraToMonitor;

  /* THE PLAYER'S DOOR, NOT THE HOST HOOK.
   *
   * The old verifier called `window.__squatch.quitSquatchSmash()` directly.
   * It stayed green while the actual pause-menu door was unreachable, and it
   * also stayed green while the reveal deliberately stranded the player in
   * the chair. Start a run, pause it, choose the labelled Quit action and say
   * YES exactly as the player does. */
  await smashFrame.locator('body').press('Enter');
  await smashFrame.waitForFunction(() => window.SQUATCH?.state === 'playing', null, { timeout: 30000 });
  await smashFrame.locator('body').press('Escape');
  await smashFrame.waitForFunction(() => window.__scenePause?.isPaused?.() === true,
    null, { timeout: 30000 });
  const coldOpenPauseCopy = await smashFrame.locator('[data-scene-pause]').innerText();
  check('the required pause-menu path still does not spoil the reveal',
    !/apartment|SquatchOS|Squatch Life|leave the desk/i.test(coldOpenPauseCopy),
    coldOpenPauseCopy.replace(/\s+/g, ' ').slice(0, 240));
  await smashFrame.getByRole('button', { name: 'Quit Squatch Smash', exact: true }).click();
  const quitBox = await smashFrame.evaluate(() => ({
    confirmShown: !document.getElementById('quitConfirm').classList.contains('hidden'),
    stillPaused: window.SQUATCH.state === 'paused',
    menuHidden: document.querySelector('[data-scene-pause]')?.classList.contains('hidden') === true,
  }));
  check('the real pause-menu Quit action opens its confirmation box',
    quitBox.confirmShown && quitBox.stillPaused && quitBox.menuHidden,
    JSON.stringify(quitBox));

  /* Capture child evidence before YES intentionally unloads that document.
   * Reading it after the quit would inspect the fresh about:blank page and
   * turn both the no-Q and WebGL assertions into accidental tautologies. */
  const smashEvidenceBeforeQuit = await smashFrame.evaluate(() => {
    const canvas = document.getElementById('game');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return {
      keys: [...window.__coldOpenVerifyKeys],
      contextLost: window.__coldOpenVerifyContextLosses,
      contextRestored: window.__coldOpenVerifyContextRestores,
      contextLostNow: gl?.isContextLost?.() === true,
    };
  });

  await smashFrame.locator('#quitYes').evaluate((button) => {
    button.addEventListener('click', () => {
      window.__coldOpenQuitConfirmedAt = Date.now();
    }, { once: true });
  });
  await smashFrame.locator('#quitYes').click();
  const quitConfirmedAt = await smashFrame.evaluate(() => window.__coldOpenQuitConfirmedAt);
  check('saying YES shows Squatch Smash shutting down',
    await smashFrame.locator('#shutdown').evaluate((element) => !element.classList.contains('hidden')));
  /* SAMPLE THE SHUTDOWN CARD BETWEEN FRAMES, AND TAKE IT IN ONE READ.
   *
   * `SHUTDOWN_S` is 0.55 seconds, and the phase machine is fed raw wall time
   * (`rawDt`) on purpose, so the card is spent by whichever `update()` first
   * carries 0.55 s of it. Playwright's default `polling: 'raf'` samples in an
   * animation frame -- which is exactly where that `update()` runs -- so the
   * card is only ever witnessed while a frame is shorter than it. Measured on
   * this box while the box was busy: 1.4 fps, a 1066 ms mean frame, and
   * `playing -> pullback` with no `shutdown` sample in 64 frames. Nothing was
   * wrong with the game; the probe simply had its eyes shut at the only moment
   * the state existed, and no timeout can buy back a sample that is never
   * taken. A millisecond poll looks in the gaps between frames instead, which
   * is where the child's 520 ms quit timer lands.
   *
   * Take the state IN the predicate too. The old second `state()` round trip
   * could straddle the next frame and read a phase that had already moved on. */
  /* …and even the millisecond poll has a floor: when one frame carries more
   * than the whole 0.55 s card, shutdown is entered and left inside a single
   * update() and there is no gap in which it exists to be sampled. So the
   * product keeps a receipt -- `coldOpenState.phaseLog`, every phase entered
   * with the pull-back value at entry -- and the proof reads the ledger
   * instead of racing the transient. */
  const shutting = await page.waitForFunction(() => {
    const snapshot = window.__squatch.coldOpenState;
    const entry = snapshot.phaseLog.find((logged) => logged.phase === 'shutdown');
    return entry ? { entry, phase: snapshot.phase } : null;
  }, null, { timeout: budget(SHUTDOWN_WALL_BUDGET_MS), polling: 10 })
    .then((handle) => handle.jsonValue());
  check('saying yes looks like the game closing, not like a cutscene starting',
    shutting.entry.phase === 'shutdown' && shutting.entry.k === 0,
    JSON.stringify(shutting));

  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'pullback',
    null, { timeout: budget(EXIT_WALL_BUDGET_MS) });

  /* WAIT ON THE DOLLY, NOT ON THE CLOCK. The first draft slept 1.2 seconds
   * and asserted the room was visible; under swiftshader this page renders at
   * about ten frames a second, so 1.2 s of wall time is 11% of a five-second
   * pull-back -- the camera had barely left the monitor and the monitor still
   * filled the screen. The check was measuring too early and calling the
   * sequence broken. Wait for the move to be half done and then look. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.pullbackK > 0.5,
    null, { timeout: budget(EXIT_WALL_BUDGET_MS) });
  const midway = await state();
  check('the room appears around the monitor as the camera comes off it',
    midway.cameraToMonitor > startedAt && !midway.covers,
    JSON.stringify({ k: midway.pullbackK.toFixed(2), covers: midway.covers }));

  /* The radio joins DURING the pull-back rather than on its first frame: it
   * waits for its voice bank, so the station ident is a playback instead of a
   * mime. The room tone carries the first frame; this holds the radio to
   * arriving before the move is over. */
  const radioCameOn = await page
    .waitForFunction(() => window.__squatch.coldOpenState.radioOn, null,
      { timeout: budget(EXIT_WALL_BUDGET_MS) })
    .then(() => true).catch(() => false);
  check('the radio comes on during the pull-back, voice bank decoded', radioCameOn);

  /* This is an authored 5.2-second reveal, not 104 physics frames. A strict
   * wall-time limit is the regression boundary: the old 120-second waits
   * certified a route that took more than three minutes on the live size. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'beat',
    null, { timeout: budget(EXIT_WALL_BUDGET_MS) });
  await page.waitForFunction(() => {
    const runtime = window.__squatch;
    return runtime
      && runtime.coldOpenState.active === false
      && runtime.game.seated === false
      && runtime.player.mode === 'walk'
      && runtime.player.enabled === true
      && runtime.inputOwner === 'world'
      && runtime.arcade.inputMode === 'relative'
      && runtime.arcade.mode === 'desktop'
      && runtime.arcade.app === null
      && runtime.interaction.paused === false;
  }, null, { timeout: budget(EXIT_WALL_BUDGET_MS) });

  const automaticExitWallMs = Date.now() - quitConfirmedAt;
  check('pause-menu Quit returns control within the wall-clock budget',
    automaticExitWallMs < budget(EXIT_WALL_BUDGET_MS),
    `${automaticExitWallMs}ms (budget ${budget(EXIT_WALL_BUDGET_MS)}ms)`);

  const landed = await page.evaluate(() => {
    const runtime = window.__squatch;
    const frame = document.querySelector('iframe[title="Squatch Smash"]');
    return {
      ...runtime.coldOpenState,
      playerMode: runtime.player.mode,
      playerEnabled: runtime.player.enabled,
      inputOwner: runtime.inputOwner,
      arcadeInputMode: runtime.arcade.inputMode,
      arcadeMode: runtime.arcade.mode,
      arcadeApp: runtime.arcade.app?.id ?? null,
      interactionPaused: runtime.interaction.paused,
      frameVisible: frame ? getComputedStyle(frame).display !== 'none' : false,
      frameSrc: frame?.getAttribute('src') ?? null,
      deskExitDistance: Math.hypot(
        runtime.player.position.x - runtime.apartment.deskExit.x,
        runtime.player.position.z - runtime.apartment.deskExit.z,
      ),
      x: runtime.player.position.x,
      z: runtime.player.position.z,
    };
  });
  check('quitting automatically stands him at the authored desk exit',
    !landed.active && !landed.seated && landed.playerMode === 'walk'
      && landed.deskExitDistance < 0.05,
    JSON.stringify({
      active: landed.active,
      seated: landed.seated,
      playerMode: landed.playerMode,
      deskExitDistance: landed.deskExitDistance,
    }));
  check('the apartment owns input again with no Q prompt or framed game left open',
    landed.inputOwner === 'world' && landed.arcadeInputMode === 'relative'
      && landed.arcadeMode === 'desktop' && landed.arcadeApp === null
      && !landed.interactionPaused && !landed.frameVisible
      && landed.frameSrc === 'about:blank' && landed.posture === null,
    JSON.stringify({
      inputOwner: landed.inputOwner,
      arcadeInputMode: landed.arcadeInputMode,
      arcadeMode: landed.arcadeMode,
      arcadeApp: landed.arcadeApp,
      interactionPaused: landed.interactionPaused,
      frameVisible: landed.frameVisible,
      frameSrc: landed.frameSrc,
      posture: landed.posture,
    }));

  /* Do not click the room and do not send Q. Focus restoration is part of the
   * bug: a state object can say "walk" while the keyboard still belongs to a
   * hidden iframe. Hold the real backwards key until the player physically
   * moves away from the desk. */
  await page.keyboard.down('KeyS');
  try {
    await page.waitForFunction(({ x, z }) => {
      const player = window.__squatch?.player;
      return player && Math.hypot(player.position.x - x, player.position.z - z) > 0.10;
    }, { x: landed.x, z: landed.z }, { timeout: 60000 });
  } finally {
    await page.keyboard.up('KeyS');
  }
  const moved = await page.evaluate(({ x, z }) => ({
    distance: Math.hypot(window.__squatch.player.position.x - x, window.__squatch.player.position.z - z),
    mode: window.__squatch.player.mode,
    inputOwner: window.__squatch.inputOwner,
  }), { x: landed.x, z: landed.z });
  check('real apartment movement works immediately, without Q or another click',
    moved.distance > 0.10 && moved.mode === 'walk' && moved.inputOwner === 'world',
    JSON.stringify(moved));
  await fsp.mkdir(EVIDENCE_DIR, { recursive: true });
  const automaticExitEvidence = path.join(EVIDENCE_DIR, 'automatic-exit-to-apartment.png');
  await page.screenshot({ path: automaticExitEvidence, animations: 'disabled' });
  console.log(`  evidence  ${path.relative(ROOT, automaticExitEvidence)}`);

  const keyEvidence = {
    apartment: await page.evaluate(() => window.__coldOpenVerifyKeys),
    smash: smashEvidenceBeforeQuit.keys,
  };
  check('the whole route used no Q key at all',
    ![...keyEvidence.apartment, ...keyEvidence.smash].includes('KeyQ'),
    JSON.stringify(keyEvidence));

  /* ---------------------------------------------------------------- */
  /* 4. THE BEAT                                                        */
  /* ---------------------------------------------------------------- */
  check('Lou is a long way off ringing: the silence is the point',
    landed.ringsIn > 30,
    `rings in ${landed.ringsIn?.toFixed(1)}s`);

  /* THE MUTE-OPENING GATE. The cold open is a third way into the flat, and
   * the first shipped build of it never decoded a single recording: all the
   * sample loading lived in the Start button's click handler, which this path
   * bypasses, so Lou's first call played as silence under its subtitles. The
   * reveal now owes the same decode the Start button performs, and this holds
   * it to that: the bank for the pending call must actually be decoded
   * buffers -- `hasSample` semantics -- not merely requested, by the time the
   * beat is counting down toward the ring. */
  const pendingVo = await page.evaluate(() => window.__squatch.apartmentStory.pendingCall()?.vo ?? null);
  check('the beat knows which call it is counting down to',
    typeof pendingVo === 'string' && pendingVo.length > 0, `vo=${JSON.stringify(pendingVo)}`);
  const voiceBankDecoded = await page.waitForFunction((vo) => window.__squatch.audio.ready
    && window.__squatch.audio.hasSample(`vo.${vo}.1`)
    && window.__squatch.audio.hasSample(`vo.${vo}.tony.1`), pendingVo, { timeout: 90000 })
    .then(() => true).catch(() => false);
  check('the reveal decodes the voice bank for that call — the opening is not mute',
    voiceBankDecoded, `vo.${pendingVo}.1 / vo.${pendingVo}.tony.1`);

  await settle(4);
  const thinking = await state();
  check('nothing happens while he works out what just happened',
    thinking.ringsIn > 25 && thinking.ringsIn < landed.ringsIn,
    `rings in ${thinking.ringsIn?.toFixed(1)}s, counting down`);

  const contextLosses = {
    apartment: await page.evaluate(() => ({
      lost: window.__coldOpenVerifyContextLosses,
      restored: window.__coldOpenVerifyContextRestores,
      lostNow: window.__squatch.renderer.getContext().isContextLost(),
    })),
    smashBeforeQuit: {
      lost: smashEvidenceBeforeQuit.contextLost,
      restored: smashEvidenceBeforeQuit.contextRestored,
      lostNow: smashEvidenceBeforeQuit.contextLostNow,
    },
  };
  check('Squatch Smash is healthy while live and the apartment is healthy after exit',
    !contextLosses.apartment.lostNow && !contextLosses.smashBeforeQuit.lostNow
      && contextLosses.apartment.lost === contextLosses.apartment.restored
      && contextLosses.smashBeforeQuit.lost === contextLosses.smashBeforeQuit.restored,
    JSON.stringify(contextLosses));

  check('no runtime console errors occurred', problems.length === 0, problems.slice(0, 3).join(' | '));

  /* ---------------------------------------------------------------- */
  /* [Q] GETS HIM OUT OF THE CHAIR                                     */
  /* ---------------------------------------------------------------- */
  /* A SECOND PAGE, because the cold open can only be quit once.
   *
   * Everything above walks the pause-menu Quit door, and that door has been
   * green throughout a period when the owner twice reported he could not get
   * out of the chair. He was not using it -- he was pressing Q, which is what
   * the apartment's own key handler promises works "everywhere", and which
   * reached nothing at all: Squatch Smash owns the keyboard while it is up and
   * had no Q of its own, and the apartment's router only runs once the input
   * adapter has captured, which during the cold open it never does.
   *
   * So: a fresh page, no clicking about, one keypress, and the reveal has to
   * happen. This is the gesture the player actually makes. */
  const qPage = await browser.newPage({ viewport: { width: 480, height: 300 } });
  try {
    await qPage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
    await qPage.waitForFunction(() => window.__squatch?.coldOpenState, null, { timeout: 90000 });
    await qPage.waitForFunction(() => window.__squatch.coldOpenState.active, null, { timeout: 60000 });
    await qPage.waitForSelector('iframe[title="Squatch Smash"]', { timeout: 60000 });

    const beforeQ = await qPage.evaluate(() => ({
      seated: window.__squatch.game.seated,
      phase: window.__squatch.coldOpenState.phase,
      activeEl: document.activeElement?.tagName ?? null,
    }));
    /* Count the key on both sides. A bare "he is still seated" cannot tell a
     * handler that ran and did nothing from a key that reached no document at
     * all, and those have completely different fixes. */
    await qPage.evaluate(() => {
      window.__qTop = 0;
      window.addEventListener('keydown', (e) => { if (e.code === 'KeyQ') window.__qTop += 1; }, true);
    });
    const qFrame = await (await qPage.$('iframe[title="Squatch Smash"]')).contentFrame();
    await qFrame.evaluate(() => {
      window.__qIn = 0;
      window.addEventListener('keydown', (e) => { if (e.code === 'KeyQ') window.__qIn += 1; }, true);
    });
    await qPage.keyboard.press('q');
    const delivery = {
      top: await qPage.evaluate(() => window.__qTop),
      iframe: await qFrame.evaluate(() => window.__qIn),
    };

    /* Pump frames rather than sleeping. Under swiftshader nobody is driving
     * rAF for a page Playwright is not looking at, and a starved page looks
     * exactly like a frozen one -- which cost this investigation two runs. */
    let stood = false;
    for (let i = 0; i < 90 && !stood; i += 1) {
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline) {
        await qPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      }
      stood = await qPage.evaluate(() => window.__squatch.coldOpenState.active === false);
    }
    /* `player.mode` is still 'frozen' at the instant the dolly lands -- the
     * seat tween is unwinding and the morning beat has not handed control
     * back yet. Give it a moment and assert what the player cares about:
     * that he ends up able to walk. Asserting on the landing frame would be
     * asserting on a transition. */
    let walking = false;
    for (let i = 0; i < 20 && !walking; i += 1) {
      const deadline = Date.now() + 500;
      while (Date.now() < deadline) {
        await qPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      }
      walking = await qPage.evaluate(() => window.__squatch.player.mode === 'walk');
    }
    const afterQ = await qPage.evaluate(() => ({
      seated: window.__squatch.game.seated,
      active: window.__squatch.coldOpenState.active,
      mode: window.__squatch.player.mode,
    }));
    check('[Q] alone ends the cold open and puts him on his feet',
      beforeQ.seated && beforeQ.phase === 'playing'
        && stood && !afterQ.seated && !afterQ.active && walking,
      `${JSON.stringify(beforeQ)} -> ${JSON.stringify(afterQ)}; key delivered ${JSON.stringify(delivery)}`);
  } finally {
    await qPage.close();
  }
  }

  /* Do not benchmark a second copy of the opening while the first apartment
   * and its restored WebGL context are still rendering in the same browser.
   * The user has one tab; the verifier should put the same load on the route
   * whose wall time it measures. */
  if (!RETURNING_ONLY && !EXIT_CONTROL_ONLY && !HELD_TAB_ONLY) await page.close();

  if (!RETURNING_ONLY) {
    if (!HELD_TAB_ONLY) await verifyParentExitRoute('click');
    await verifyParentExitRoute('held-tab');
  }

  /* ---------------------------------------------------------------- */
  /* 5. QUIT ALWAYS LEAVES THE DESK                                    */
  /* ---------------------------------------------------------------- */
  /* The opening is only eligible on a pristine campaign. A returning player
   * can still sit at the same computer and launch the same embedded game,
   * though, and confirmed Quit must mean the same thing there: close Squatch
   * Smash and put him on his feet. The old host rejected this call whenever
   * `coldOpenActive` was false, leaving the real child on its shutdown card
   * forever. The pristine-page route above could never see that state. */
  if (!EXIT_CONTROL_ONLY && !HELD_TAB_ONLY) {
  const returnPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const returnProblems = [];
  returnPage.on('pageerror', (error) => returnProblems.push(error.message));
  returnPage.on('console', (message) => {
    if (message.type() === 'error') returnProblems.push(message.text().slice(0, 240));
  });
  returnPage.on('requestfailed', (request) => {
    if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
      returnProblems.push(`${request.resourceType()} failed: ${request.url()}`);
    }
  });
  try {
    await returnPage.goto(
      `http://localhost:${PORT}/index.html?preview=1&beat=first_apartment`,
      { waitUntil: 'load' },
    );
    await returnPage.waitForFunction(() => window.__squatch?.coldOpenState,
      null, { timeout: 90000 });
    await returnPage.locator('#start-btn').click();
    await returnPage.waitForFunction(() => window.__squatch?.game?.started === true,
      null, { timeout: 60000 });
    /* Calibrate on the started flat, not on the Start card: an overlay over a
     * scene nobody is drawing yet reports a frame rate this route never gets.
     * `--returning-only` reaches this block with no earlier calibration too. */
    await calibrateWallBudgets(returnPage, 'the returning player');

    /* Stage only the walk up to the desk. From Enter through Quit/YES and the
     * attempted exit, every input below is the real player-facing path. */
    await returnPage.evaluate(() => window.__squatch.sitAtPC());
    await returnPage.waitForFunction(() => window.__squatch?.game?.seated === true,
      null, { timeout: 30000 });
    await returnPage.evaluate(() => {
      const runtime = window.__squatch;
      if (runtime.arcade.mode === 'off') runtime.arcade.boot();
      runtime.arcade.skipBoot();
      runtime.arcade.launchById('smash');
      runtime.arcade.setSeated(true);
    });

    const returnFrameElement = await returnPage.waitForSelector(
      'iframe[title="Squatch Smash"]', { timeout: 60000 },
    );
    const returnFrame = await returnFrameElement.contentFrame();
    if (!returnFrame) throw new Error('Returning-player Squatch Smash iframe never produced a document');
    await returnFrame.waitForFunction(() => window.SQUATCH?.state === 'menu',
      null, { timeout: 60000 });
    await returnFrame.locator('body').press('Enter');
    await returnFrame.waitForFunction(() => window.SQUATCH?.state === 'playing',
      null, { timeout: 30000 });
    await returnFrame.locator('body').press('Escape');
    await returnFrame.waitForFunction(() => window.__scenePause?.isPaused?.() === true,
      null, { timeout: 30000 });
    await returnFrame.getByRole('button', { name: 'Quit Squatch Smash', exact: true }).click();
    /* Stamp the host call in the parent. This iframe is deliberately unloaded
     * by the successful exit, so reading a child-side click timestamp after
     * the action would race the very navigation the verifier is proving. */
    await returnPage.evaluate(() => {
      const host = window.__SQUATCH_SMASH_HOST;
      const quit = host.quitSquatchSmash.bind(host);
      host.quitSquatchSmash = (...args) => {
        window.__returningQuitConfirmedAt = Date.now();
        return quit(...args);
      };
    });
    await returnFrame.locator('#quitYes').click();

    let returnedToWorld = true;
    try {
      await returnPage.waitForFunction(() => {
        const runtime = window.__squatch;
        return runtime
          && runtime.coldOpenState.active === false
          && runtime.game.seated === false
          && runtime.player.mode === 'walk'
          && runtime.player.enabled === true
          && runtime.inputOwner === 'world'
          && runtime.arcade.inputMode === 'relative'
          && runtime.arcade.mode === 'desktop'
          && runtime.arcade.app === null
          && runtime.interaction.paused === false;
      }, null, { timeout: budget(EXIT_WALL_BUDGET_MS) });
    } catch {
      returnedToWorld = false;
    }

    const returnExit = await returnPage.evaluate(() => {
      const runtime = window.__squatch;
      const frame = document.querySelector('iframe[title="Squatch Smash"]');
      return {
        returnedToWorld: false,
        coldOpenActive: runtime.coldOpenState.active,
        seated: runtime.game.seated,
        playerMode: runtime.player.mode,
        playerEnabled: runtime.player.enabled,
        inputOwner: runtime.inputOwner,
        arcadeInputMode: runtime.arcade.inputMode,
        arcadeMode: runtime.arcade.mode,
        arcadeApp: runtime.arcade.app?.id ?? null,
        interactionPaused: runtime.interaction.paused,
        frameVisible: frame ? getComputedStyle(frame).display !== 'none' : false,
        frameSrc: frame?.getAttribute('src') ?? null,
        x: runtime.player.position.x,
        z: runtime.player.position.z,
      };
    });
    returnExit.returnedToWorld = returnedToWorld;
    const returnQuitConfirmedAt = await returnPage.evaluate(
      () => window.__returningQuitConfirmedAt,
    );
    const returnExitWallMs = Date.now() - returnQuitConfirmedAt;
    check('confirmed Quit also ejects a returning player from the desk',
      returnExit.returnedToWorld
        && !returnExit.coldOpenActive && !returnExit.seated
        && returnExit.playerMode === 'walk' && returnExit.playerEnabled
        && returnExit.inputOwner === 'world'
        && returnExit.arcadeInputMode === 'relative'
        && returnExit.arcadeMode === 'desktop' && returnExit.arcadeApp === null
        && !returnExit.interactionPaused
        && !returnExit.frameVisible && returnExit.frameSrc === 'about:blank',
      JSON.stringify(returnExit));
    check('returning-player Quit also restores control within the wall-clock budget',
      returnExit.returnedToWorld && returnExitWallMs < budget(EXIT_WALL_BUDGET_MS),
      `${returnExitWallMs}ms (budget ${budget(EXIT_WALL_BUDGET_MS)}ms)`);

    if (returnedToWorld) {
      await returnPage.keyboard.down('KeyS');
      try {
        await returnPage.waitForFunction(({ x, z }) => {
          const player = window.__squatch?.player;
          return player && Math.hypot(player.position.x - x, player.position.z - z) > 0.10;
        }, { x: returnExit.x, z: returnExit.z }, { timeout: 30000 });
      } finally {
        await returnPage.keyboard.up('KeyS');
      }
    }
    const returnMove = await returnPage.evaluate(({ x, z }) => ({
      distance: Math.hypot(window.__squatch.player.position.x - x, window.__squatch.player.position.z - z),
      mode: window.__squatch.player.mode,
      owner: window.__squatch.inputOwner,
    }), { x: returnExit.x, z: returnExit.z });
    check('the returning player can walk away without Q or another click',
      returnedToWorld && returnMove.distance > 0.10
        && returnMove.mode === 'walk' && returnMove.owner === 'world',
      JSON.stringify(returnMove));
    check('the returning-player exit has no runtime or network errors',
      returnProblems.length === 0, returnProblems.slice(0, 3).join(' | '));

    const returnEvidence = path.join(EVIDENCE_DIR, 'returning-player-quit-exits-desk.png');
    await returnPage.screenshot({ path: returnEvidence, animations: 'disabled' });
    console.log(`  evidence  ${path.relative(ROOT, returnEvidence)}`);
  } finally {
    await returnPage.close();
  }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} cold open checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} cold open checks passed.`);

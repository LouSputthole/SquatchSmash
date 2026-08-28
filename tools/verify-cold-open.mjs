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
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Let the page render for a while: the reveal is a five-second camera move. */
async function settle(seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  }
}

const state = () => page.evaluate(() => window.__squatch.coldOpenState);

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.coldOpenState, null, { timeout: 90000 });
  /* The cold open is armed after boot resolves, which is a tick later than
   * the debug surface appearing. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.active, null, { timeout: 60000 });

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

  await smashFrame.locator('#quitYes').click();
  check('saying YES shows Squatch Smash shutting down',
    await smashFrame.locator('#shutdown').evaluate((element) => !element.classList.contains('hidden')));
  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'shutdown',
    null, { timeout: 30000 });
  const shutting = await state();
  check('saying yes looks like the game closing, not like a cutscene starting',
    shutting.phase === 'shutdown' && shutting.pullbackK === 0,
    JSON.stringify({ phase: shutting.phase, k: shutting.pullbackK }));

  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'pullback',
    null, { timeout: 20000 });
  const moving = await state();
  check('the radio comes on the moment the camera starts to move',
    moving.radioOn, `radio ${moving.radioOn}`);

  /* WAIT ON THE DOLLY, NOT ON THE CLOCK. The first draft slept 1.2 seconds
   * and asserted the room was visible; under swiftshader this page renders at
   * about ten frames a second, so 1.2 s of wall time is 11% of a five-second
   * pull-back -- the camera had barely left the monitor and the monitor still
   * filled the screen. The check was measuring too early and calling the
   * sequence broken. Wait for the move to be half done and then look. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.pullbackK > 0.5,
    null, { timeout: 60000 });
  const midway = await state();
  check('the room appears around the monitor as the camera comes off it',
    midway.cameraToMonitor > startedAt && !midway.covers,
    JSON.stringify({ k: midway.pullbackK.toFixed(2), covers: midway.covers }));

  /* Ten frames a second against a 5.2 s dolly is a minute of patience. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'beat',
    null, { timeout: 120000 });
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
  }, null, { timeout: 120000 });

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

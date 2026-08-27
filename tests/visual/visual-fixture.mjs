import { test as base, expect } from 'playwright/test';

const states = new WeakMap();

function diagnosticState(page) {
  let state = states.get(page);
  if (!state) {
    state = {
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
      httpFailures: [],
    };
    states.set(page, state);
  }
  return state;
}

export const test = base.extend({
  visualDiagnostics: [async ({ page }, use, testInfo) => {
    const state = diagnosticState(page);
    page.on('console', (message) => {
      if (message.type() === 'error') state.consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => state.pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText ?? 'unknown request failure';
      if (!reason.includes('ERR_ABORTED')) {
        state.requestFailures.push(`${request.method()} ${request.url()} - ${reason}`);
      }
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        state.httpFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    await use(state);

    const readiness = await page.evaluate(() => {
      const marker = window.__SQUATCH_VISUAL_TEST__ ?? null;
      const canvas = document.querySelector('canvas');
      return {
        marker: marker ? {
          seed: marker.seed,
          shot: marker.shot,
          state: marker.state,
          clock: marker.clock?.snapshot?.() ?? null,
        } : null,
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        canvas: canvas ? {
          width: canvas.width,
          height: canvas.height,
          cssWidth: canvas.getBoundingClientRect().width,
          cssHeight: canvas.getBoundingClientRect().height,
        } : null,
        globals: {
          apartment: Boolean(window.__squatch?.apartment),
          luxuryApartment: Boolean(window.LUXURY_APARTMENT?.home),
          cabin: Boolean(window.CABIN?.cabin),
          mansion: Boolean(window.mansion?.scene),
          enola: Boolean(window.__enolaSquatch?.mission),
          palace: Boolean(window.CARTEL_PALACE?.mission),
          heist: Boolean(window.__heistDebug?.start),
          initiation: Boolean(window.INITIATION?.phase),
        },
      };
    }).catch((error) => ({ unavailable: error.message, url: page.url() }));

    const report = { ...state, readiness };
    await testInfo.attach('scene-readiness.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: 'application/json',
    });
    if (testInfo.status !== testInfo.expectedStatus) {
      const html = await page.content().catch((error) => `DOM unavailable: ${error.message}`);
      await testInfo.attach('dom-snapshot.html', {
        body: Buffer.from(html),
        contentType: 'text/html',
      });
    }
  }, { auto: true }],
});

export { expect };

/**
 * Install before navigation. Every test receives a fresh browser context, so
 * clearing storage here cannot touch a developer save. The seeded PRNG covers
 * authored prop/NPC variants; the render clock lets the test freeze the real
 * scene loop after one explicitly requested frame instead of sleeping until a
 * software rasteriser happens to look still.
 */
export async function installVisualDeterminism(page, {
  seed = 0x5a17c4,
  storage = {},
  outfitId = 'cream_cashmere',
} = {}) {
  await page.addInitScript(({ requestedSeed, entries, appearance }) => {
    try {
      localStorage.clear();
      for (const [key, value] of entries) localStorage.setItem(key, String(value));
      localStorage.setItem('squatchsmash.player-appearance.v1', JSON.stringify({
        version: 1,
        outfitId: appearance,
      }));
    } catch { /* opaque origins are replaced by the first real navigation */ }

    let randomState = requestedSeed >>> 0;
    Math.random = () => {
      randomState += 0x6d2b79f5;
      let value = randomState;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    const nativeRaf = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    let frozen = false;
    let nextId = 1;
    let virtualNow = performance.now();
    const queued = new Map();
    const nativeIds = new Map();

    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      if (frozen) {
        queued.set(id, callback);
      } else {
        const nativeId = nativeRaf((time) => {
          nativeIds.delete(id);
          virtualNow = time;
          callback(time);
        });
        nativeIds.set(id, nativeId);
      }
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      queued.delete(id);
      const nativeId = nativeIds.get(id);
      if (nativeId !== undefined) nativeCancel(nativeId);
      nativeIds.delete(id);
    };

    const clock = {
      freeze() { frozen = true; },
      resume() {
        frozen = false;
        const callbacks = [...queued.values()];
        queued.clear();
        for (const callback of callbacks) window.requestAnimationFrame(callback);
      },
      step(milliseconds = 1000 / 60) {
        frozen = true;
        virtualNow += milliseconds;
        const callbacks = [...queued.values()];
        queued.clear();
        for (const callback of callbacks) callback(virtualNow);
        return callbacks.length;
      },
      snapshot() {
        return { frozen, queued: queued.size, nativePending: nativeIds.size, now: virtualNow };
      },
    };

    window.__SQUATCH_VISUAL_TEST__ = {
      seed: requestedSeed >>> 0,
      shot: null,
      state: null,
      clock,
    };
  }, {
    requestedSeed: seed,
    entries: Object.entries(storage),
    appearance: outfitId,
  });
}

export async function installStablePresentation(page) {
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-delay: 0s !important;
      animation-duration: 0s !important;
      animation-iteration-count: 1 !important;
      caret-color: transparent !important;
      transition-delay: 0s !important;
      transition-duration: 0s !important;
    }
  ` });
}

export async function freezeRenderedFrame(page, frames = 1) {
  await page.evaluate(() => window.__SQUATCH_VISUAL_TEST__.clock.freeze());
  await page.waitForFunction(() => (
    window.__SQUATCH_VISUAL_TEST__.clock.snapshot().queued > 0
  ), null, { timeout: 15_000 }).catch(() => {});
  await page.evaluate((count) => {
    const clock = window.__SQUATCH_VISUAL_TEST__.clock;
    for (let index = 0; index < count; index++) clock.step(1000 / 60);
  }, frames);
}

export async function captureVisual(page, name, readiness = {}) {
  await page.evaluate(({ shot, state }) => {
    window.__SQUATCH_VISUAL_TEST__.shot = shot;
    window.__SQUATCH_VISUAL_TEST__.state = state;
  }, { shot: name, state: readiness });
  await freezeRenderedFrame(page);
  await expect(page).toHaveScreenshot(`${name}.png`);
}

export function assertNoVisualErrors(page) {
  const state = diagnosticState(page);
  expect({
    consoleErrors: state.consoleErrors,
    pageErrors: state.pageErrors,
    requestFailures: state.requestFailures,
    httpFailures: state.httpFailures,
  }).toEqual({
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
  });
}

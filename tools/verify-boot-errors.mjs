#!/usr/bin/env node
/**
 * Block each standalone scene's entry module and prove the shared classic
 * boot guard provides a recovery screen rather than a silent blank canvas.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5209;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
/* Every page the Pages workflow stages, not a sample of them. Until the
 * 2026-08-14 checks-that-lie pass this listed 8 of the 20 staged pages, so a
 * scene could ship with no recovery screen and this gate would still be
 * green -- and several had (see NO_RECOVERY below).
 *
 * Case shapes:
 *   (default)              boot-guard page: block `module`, expect the
 *                          #bootFailure panel with reload + apartment links.
 *   surface: 'loading'     __squatchFail page (index/bing/beefrun/enola):
 *                          block `module`, expect #loading.failed with the
 *                          page's own title and the module in the detail.
 *   noRecovery: '<why>'    KNOWN DEFECT, allowlisted by this pass: the page
 *                          has no boot guard and no onerror surface, so a
 *                          blocked module is a silent dead page. The check
 *                          asserts that this is still the (bad) state and
 *                          goes RED the day someone adds a guard, so the
 *                          entry cannot outlive its excuse. Fixing the pages
 *                          is scene-code work this pass does not own.
 *   static: true           no JavaScript entry at all: load it unblocked and
 *                          expect zero page errors and its launcher content.
 */
const CASES = [
  {
    page: 'bing.html',
    module: 'src/bing/router.js',
    scene: 'Bada Bing router',
    surface: 'loading',
  },
  {
    page: 'bing.html?visit=2',
    module: 'src/bing/hotdog-main.js',
    scene: 'HotDog Incident routed module',
    surface: 'loading',
  },
  {
    page: 'index.html',
    module: 'src/main.js',
    scene: 'Apartment',
    surface: 'loading',
  },
  {
    page: 'beefrun.html',
    module: 'src/beefrun/main.js',
    scene: 'Beef Run',
    surface: 'loading',
    title: 'Could not load the mission code',
  },
  {
    page: 'enolasquatch.html',
    module: 'src/enolasquatch/main.js',
    scene: 'Enola Squatch',
    surface: 'loading',
    title: 'Could not load the mission code',
  },
  {
    page: 'nowake.html',
    module: 'src/nowake/main.js',
    scene: 'NO WAKE',
  },
  {
    page: 'motel.html',
    module: 'src/motel/main.js',
    scene: 'Jerky Motel',
  },
  {
    page: 'graveyard.html',
    module: 'src/graveyard/main.js',
    scene: 'Squatch Graveyard',
    title: 'Could not load the graveyard',
  },
  {
    page: 'squatchfather.html',
    module: 'src/squatchfather/main.js',
    scene: 'Squatchfather',
  },
  {
    page: 'initiation.html',
    module: 'src/initiation/main.js',
    scene: 'Initiation',
  },
  {
    page: 'silver.html',
    module: 'src/silver/main.js',
    scene: 'Silver Room',
  },
  {
    page: 'golf.html',
    module: 'src/golf/main.js',
    scene: 'Silver Pines',
  },
  {
    page: 'silvercase.html',
    module: 'src/silvercase/main.js',
    scene: 'The Silver Case',
  },
  {
    page: 'mansion.html',
    module: 'src/mansion/main.js',
    scene: 'PROJECT SILENT SQUATCH',
  },
  {
    page: 'mansion-siege.html',
    module: 'src/mansion/siege/main.js',
    scene: 'Mansion Under Siege',
  },
  {
    page: 'cartel-palace.html',
    module: 'src/cartel-palace/main.js',
    scene: 'Cartel Palace',
    title: 'Could not load Cartel Palace',
    // Its authored recovery link is "SCENE PREVIEW", not the apartment.
    recovery: './preview.html',
  },
  {
    page: 'combatlab.html',
    module: 'src/combatlab/main.js',
    scene: 'Combat System',
    title: 'Could not load Combat System',
    // A dev tool launched from the preview menu goes back to the menu.
    recovery: 'preview.html',
  },
  {
    page: 'heist.html',
    module: 'src/heist/main.js',
    scene: 'THE TAKE',
    noRecovery: 'heist.html has no boot guard and no onerror on its module script; '
      + 'a blocked src/heist/main.js leaves a start card whose BEGIN does nothing',
  },
  {
    page: 'roster.html',
    module: 'src/core/characters.js',
    scene: 'Roster tool',
    noRecovery: 'roster.html renders from an inline module with no guard; '
      + 'a blocked import dies silently',
  },
  {
    page: 'wardrobe.html',
    module: 'src/wardrobe/preview.js',
    scene: 'Wardrobe tool',
    noRecovery: 'wardrobe.html renders from an inline module with no guard; '
      + 'a blocked import dies silently',
  },
  {
    page: 'preview.html',
    scene: 'Preview launcher',
    static: true,
  },
];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify boot failures.');
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  for (const spec of CASES) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

    if (spec.static) {
      // No JavaScript entry to block; the page loading cleanly IS its boot.
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'load' });
      const cards = await page.locator('article.card').count();
      check(`${spec.scene} serves its launcher with no page errors`,
        pageErrors.length === 0 && cards > 0,
        `${cards} card(s), errors: ${JSON.stringify(pageErrors)}`);
      await page.close();
      continue;
    }

    await page.route(`**/${spec.module}`, (route) => route.abort('failed'));
    await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'load' });

    if (spec.noRecovery) {
      /* Allowlisted defect: no recovery surface exists. Give any surface a
       * moment to appear (both known surfaces are wired to onerror, which
       * fires on the aborted fetch, so a real guard shows up well inside
       * this window), then assert the documented-bad state still holds.
       * The day a guard lands, this goes red and the case graduates to a
       * real assertion instead of rotting in the allowlist. */
      const surfaced = await page.waitForSelector('#bootFailure:not([hidden]), #loading.failed',
        { timeout: 2500 }).then(() => true, () => false);
      check(`${spec.scene} still has NO boot recovery (allowlisted defect: ${spec.noRecovery})`,
        !surfaced,
        surfaced ? 'a recovery surface appeared — add a real case and drop the allowlist entry' : '');
      await page.close();
      continue;
    }

    const selector = spec.surface === 'loading'
      ? '#loading.failed'
      : '#bootFailure:not([hidden])';
    await page.waitForSelector(selector, { timeout: 10000 });

    const failure = await page.evaluate((surface) => {
      const el = document.querySelector(surface === 'loading' ? '#loading' : '#bootFailure');
      if (surface === 'loading') {
        return {
          title: el.querySelector('strong')?.textContent,
          detail: el.querySelector('span')?.textContent,
          visible: el.classList.contains('failed'),
        };
      }
      return {
        title: el.querySelector('[data-boot-title]')?.textContent,
        detail: el.querySelector('[data-boot-detail]')?.textContent,
        apartment: el.querySelector('a')?.getAttribute('href'),
        reload: Boolean(el.querySelector('[data-boot-reload]')),
      };
    }, spec.surface);
    if (spec.surface === 'loading') {
      check(`${spec.scene} reports its blocked entry module`,
        failure.visible
          && failure.title === (spec.title ?? 'Could not load the game code')
          && failure.detail.includes(path.basename(spec.module)),
        JSON.stringify(failure));
      await page.close();
      continue;
    }
    check(`${spec.scene} reports a blocked entry module`,
      failure.title === (spec.title ?? 'Could not load the scene')
        && failure.detail.includes(spec.module),
      JSON.stringify(failure));
    const recovery = spec.recovery ?? './index.html';
    check(`${spec.scene} offers reload and recovery to ${recovery}`,
      failure.reload && failure.apartment === recovery,
      JSON.stringify(failure));
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} boot-failure checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} boot-failure checks passed.`);

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
const CASES = [
  {
    page: 'bing.html',
    module: 'src/bing/router.js',
    scene: 'Bada Bing router',
    surface: 'bing',
  },
  {
    page: 'bing.html?visit=2',
    module: 'src/bing/hotdog-main.js',
    scene: 'HotDog Incident routed module',
    surface: 'bing',
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
    await page.route(`**/${spec.module}`, (route) => route.abort('failed'));
    await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'load' });
    const selector = spec.surface === 'bing'
      ? '#loading.failed'
      : '#bootFailure:not([hidden])';
    await page.waitForSelector(selector, { timeout: 10000 });

    const failure = await page.evaluate((surface) => {
      const el = document.querySelector(surface === 'bing' ? '#loading' : '#bootFailure');
      if (surface === 'bing') {
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
    if (spec.surface === 'bing') {
      check(`${spec.scene} reports its blocked router path`,
        failure.visible
          && failure.title === 'Could not load the game code'
          && failure.detail.includes(path.basename(spec.module)),
        JSON.stringify(failure));
      await page.close();
      continue;
    }
    check(`${spec.scene} reports a blocked entry module`,
      failure.title === (spec.title ?? 'Could not load the scene')
        && failure.detail.includes(spec.module),
      JSON.stringify(failure));
    check(`${spec.scene} offers reload and apartment recovery`,
      failure.reload && failure.apartment === './index.html',
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

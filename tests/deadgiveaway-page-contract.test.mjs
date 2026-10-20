/**
 * deadgiveaway.html is a real standalone page: the shared boot guard names
 * the global main.js publishes, the importmap resolves three, the entry
 * module has an onerror surface, and the Pages workflow stages the file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('deadgiveaway.html');
const main = read('src/deadgiveaway/main.js');

test('the page carries the boot guard for the DEAD_GIVEAWAY global', () => {
  assert.match(html, /<script src="\.\/src\/core\/boot-guard\.js"[^>]*data-target="bootFailure"[^>]*data-ready="DEAD_GIVEAWAY"/);
  assert.match(html, /id="bootFailure"[^>]*hidden/);
  assert.match(html, /data-boot-title/);
  assert.match(html, /data-boot-detail/);
  assert.match(html, /data-boot-reload/);
  assert.match(main, /window\.DEAD_GIVEAWAY = \{/, 'main.js must publish the global the guard waits for');
});

test('the page has the importmap and a guarded entry module', () => {
  assert.match(html, /<script type="importmap">\{"imports":\{"three":"\.\/vendor\/three\.module\.min\.js"\}\}<\/script>/);
  assert.match(html, /<script type="module" src="src\/deadgiveaway\/main\.js" onerror="window\.__squatchSceneFail\('Could not load Dead Giveaway','src\/deadgiveaway\/main\.js failed to load\.'\)"><\/script>/);
  assert.match(html, /href="src\/deadgiveaway\/deadgiveaway\.css"/);
});

test('the page mounts no shared Hud, so it needs none of the fatal HUD ids', () => {
  /* core/hud.js throws in its constructor when a page lacks #hud, #prompt,
   * #subtitle and the rest. This page has its own table HUD (table-ui.js);
   * if main.js ever constructs `new Hud(`, the ids must arrive with it. */
  if (/new Hud\(/.test(main)) {
    for (const id of ['hud', 'prompt', 'subtitle', 'toast-stack']) assert.match(html, new RegExp(`id="${id}"`));
  } else {
    assert.doesNotMatch(main, /from '\.\.\/core\/hud\.js'/);
  }
});

test('the Pages workflow stages the page', () => {
  const pages = read('.github/workflows/pages.yml');
  const cp = pages.match(/cp index\.html[\s\S]*?_site\//)?.[0] ?? '';
  assert.match(cp, /\bdeadgiveaway\.html\b/, 'deadgiveaway.html is not in the pages.yml cp list');
});

test('the boot-failure gate covers the page', () => {
  const tool = read('tools/verify-boot-failure-surfaces.mjs');
  assert.match(tool, /page: 'deadgiveaway\.html',\s*module: 'src\/deadgiveaway\/main\.js'/);
});

test('the composition root uses the shared engine pieces the contract names', () => {
  assert.match(main, /new THREE\.PerspectiveCamera\(68,/);
  assert.match(main, /attachPixelRatio\(renderer\)/);
  assert.match(main, /buildBackroom\(scene, \{ renderer, M \}\)/);
  assert.match(main, /new Player\(camera, world\)/);
  assert.match(main, /FIRST_PERSON_CAPTURE_MODES\.POINTER_LOCK_OR_DRAG/);
  assert.match(main, /audio\.updateListener\(camera\)/);
  assert.match(main, /createPauseMenu\(/);
  assert.match(main, /player\.sitAt\(/);
});

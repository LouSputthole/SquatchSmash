/**
 * A scene page has to carry the furniture its HUD dereferences.
 *
 * `core/hud.js` reads eleven elements in its CONSTRUCTOR and dereferences most
 * of them on the spot — `this.handItem.querySelector('.icon')`, and the same
 * for the prompt, the radio OSD, the clock and the bladder. So a page that
 * leaves one out does not degrade and does not warn: `new Hud()` throws, the
 * module dies before a single frame, and the page shows "Could not start".
 *
 * THE SPECIAL MEETING SHIPPED THAT WAY. Its own page, its own runtime, its own
 * place on the campaign route, twenty-two passing tests — and `#hand-item` was
 * missing, so it had never once opened in a browser. Every one of those tests
 * was headless and not one of them builds a Hud. The owner found it by looking
 * for the scene in the preview list and not finding it.
 *
 * This is the cheap half of never doing that again: static, no browser, and it
 * reads the required ids out of `hud.js` itself rather than from a list here,
 * so a Hud that starts dereferencing a twelfth element brings every page that
 * lacks it down with it — at `npm test` rather than on the owner's machine.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hudSource = fs.readFileSync(path.join(ROOT, 'src/core/hud.js'), 'utf8');

/** The ids the Hud constructor looks up, read out of the constructor itself. */
function requiredHudIds() {
  const ctor = hudSource.slice(hudSource.indexOf('constructor()'));
  const body = ctor.slice(0, ctor.indexOf('\n  }'));
  return [...body.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
}

/**
 * The ones it dereferences immediately, which are the ones that actually
 * throw. A missing element it only stores is a latent bug; a missing element
 * it calls `.querySelector` on is a page that will not open.
 */
function fatalHudIds() {
  const ctor = hudSource.slice(hudSource.indexOf('constructor()'));
  const body = ctor.slice(0, ctor.indexOf('\n  }'));
  const stored = new Map();
  for (const [, field, id] of body.matchAll(/this\.(\w+) = document\.getElementById\('([^']+)'\)/g)) {
    stored.set(field, id);
  }
  const fatal = new Set();
  for (const [, field] of body.matchAll(/this\.(\w+)\.querySelector\(/g)) {
    if (stored.has(field)) fatal.add(stored.get(field));
  }
  return [...fatal];
}

/** Every page that constructs a Hud, and the HTML that page loads. */
function pagesThatBuildAHud() {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, 'src'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const main = path.join(ROOT, 'src', entry.name, 'main.js');
    if (!fs.existsSync(main)) continue;
    if (!/new Hud\(/.test(fs.readFileSync(main, 'utf8'))) continue;
    /* Matched on the scene's DIRECTORY, not on `main.js` by name: bing.html
     * loads `src/bing/router.js`, which is the thing that decides which of the
     * two Bing visits to import. A page that pulls anything out of the scene's
     * folder is that scene's page. */
    const html = fs.readdirSync(ROOT)
      .filter((name) => name.endsWith('.html'))
      .find((name) => fs.readFileSync(path.join(ROOT, name), 'utf8')
        .includes(`src/${entry.name}/`));
    out.push({ scene: entry.name, html });
  }
  return out;
}

test('the Hud constructor still looks its elements up by id', () => {
  const ids = requiredHudIds();
  assert.ok(ids.length >= 8,
    'hud.js no longer reads its elements the way this test knows how to find them —'
    + ' rewrite the reader below rather than deleting the check');
  assert.ok(ids.includes('crosshair') && ids.includes('prompt'));
});

test('every page that builds a Hud carries every element the Hud dereferences', () => {
  const fatal = fatalHudIds();
  assert.ok(fatal.length >= 4, `expected several fatal ids, found ${fatal.join(', ')}`);

  const pages = pagesThatBuildAHud();
  assert.ok(pages.length >= 8, `only found ${pages.length} pages that build a Hud`);

  const broken = [];
  for (const { scene, html } of pages) {
    assert.ok(html, `${scene}/main.js builds a Hud but no .html loads it`);
    const markup = fs.readFileSync(path.join(ROOT, html), 'utf8');
    const missing = fatal.filter((id) => !markup.includes(`id="${id}"`));
    if (missing.length) broken.push(`${html} is missing #${missing.join(', #')}`);
  }
  assert.deepEqual(broken, [],
    'these pages construct a Hud that will throw on them, so the scene cannot open at all');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../mansion-siege.html', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../tools/verify-mansion-siege.mjs', import.meta.url), 'utf8');

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('the Siege five-slot loadout is bottom-centred away from its ammunition card', () => {
  const inventory = cssRule('body #scene-inventory-hands');
  const ammo = cssRule('#ammo');

  assert.match(inventory, /left:\s*50%/);
  assert.match(inventory, /right:\s*auto/);
  assert.match(inventory, /transform:\s*translateX\(-50%\)/);
  assert.match(inventory, /bottom:\s*22px/);
  assert.match(ammo, /right:\s*26px/);
  assert.match(ammo, /bottom:\s*26px/);
});

test('the focused browser serves the shared HUD styles as CSS before measuring DOM bounds', () => {
  assert.match(verifier, /'\.css':\s*'text\/css; charset=utf-8'/);
  assert.match(verifier, /getBoundingClientRect\(\)/,
    'layout acceptance must measure the rendered cards, not only inspect CSS source');
});

test('combat acceptance publishes durable screenshot and exact audio-routing evidence', () => {
  assert.match(verifier, /'after-combat-health-hud\.png'/);
  assert.match(verifier, /'after-combat-audio-evidence\.json'/);
  assert.match(verifier, /requestedCue:\s*'weapon\.carbine\.fire'/);
  assert.match(verifier, /legacyFallback:\s*fallbackAfter\.weaponPlayback\.includes/);
});

test('the hunt pip rides the crosshair ring, quieter than the damage wedge, and the verifier pins it', () => {
  /* Owner, playtest 2026-08-13: "four attacks left cant find them". The
   * remnant hunts (mission.huntActive) and this chevron says which way. It
   * is a direction on the ring round the crosshair, not a marker: centred
   * on the viewport, rotated by the same relative-bearing convention as
   * the shared damage wedge, and deliberately less loud than that wedge
   * (0.92 active) so a threat pip never reads as a hit. */
  const pip = cssRule('#huntPip');
  assert.match(pip, /position:\s*fixed/);
  assert.match(pip, /left:\s*50%/);
  assert.match(pip, /top:\s*50%/);
  assert.match(pip, /rotate\(var\(--hunt-bearing\)\)/);
  assert.match(pip, /translateY\(-\d+px\)/, 'the pip sits out on a ring, not on the crosshair');
  assert.match(pip, /pointer-events:\s*none/);
  const active = cssRule('#huntPip.active');
  const opacity = Number(active.match(/opacity:\s*([\d.]+)/)?.[1]);
  assert.ok(opacity > 0.3 && opacity <= 0.8, `hunt pip active opacity ${opacity} should be visible but quieter than the 0.92 damage wedge`);
  assert.match(pip, /drop-shadow/, 'the chevron needs a dark halo to read over the chandelier');
  assert.match(html, /<div id="huntPip" hidden aria-hidden="true"><\/div>/);
  assert.match(cssRule('#waveCount.hunt'), /border-color/, 'the counter changes state while the remnant hunts');
  assert.match(verifier, /'hunt-pip-remnant\.png'/);
  assert.match(verifier, /huntPip/, 'the verifier reads the pip the player sees');
});

test('the ammunition card speaks to the player, not the state machine', () => {
  /* The line under the count is RELOADING / EMPTY -- R / NO ROUNDS, and the
   * page's own `#ammo.dry` rule finally has a class that sets it. Same
   * words as the base house's card in src/mansion/main.js. */
  const main = fs.readFileSync(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');
  assert.match(main, /ammoEl\.classList\.toggle\('dry'/);
  assert.match(main, /'RELOADING'/);
  assert.match(main, /'EMPTY — R'/);
  assert.match(main, /'NO ROUNDS'/);
  assert.doesNotMatch(main, /ammoStateEl\.textContent = hud\.state/,
    'the raw Firearm phase id must not be the thing under the count');
  assert.match(cssRule('#ammo.dry #ammoMag'), /color/);
  assert.match(verifier, /'RELOADING'/);
  assert.match(verifier, /'EMPTY \\u2014 R'/, 'the verifier pins the dry line');
});

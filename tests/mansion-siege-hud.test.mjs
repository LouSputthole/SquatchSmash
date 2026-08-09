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

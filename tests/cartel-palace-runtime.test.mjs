import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createCartelPalaceCampaignStory } from '../src/core/final-arc-story.js';

const ROOT = new URL('../', import.meta.url);

test('Cartel Palace is a first-class runtime built on the shared game systems', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('cartel-palace.html', ROOT), 'utf8'),
    readFile(new URL('src/cartel-palace/main.js', ROOT), 'utf8'),
  ]);

  assert.match(html, /src\/cartel-palace\/main\.js/);
  /* `objective` is deliberately not on this list any more. The Palace used to
   * draw its own objective card in this page's markup; it drives the shared
   * one from src/core/objective-panel.js now, which builds its own element at
   * runtime -- so the pin for it is in the shared-module list below, where a
   * scene quietly dropping it fails the same way. */
  for (const id of ['scene', 'overlay', 'start-btn', 'prompt', 'crosshair', 'hotbar', 'ammo', 'boss',
    /* The boss bar names its subject at runtime now -- the chef for his stage,
     * Mark for his -- so the element it writes into has to exist. */
    'boss-name']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  for (const shared of [
    '../core/player.js', '../core/hud.js', '../core/interaction.js', '../core/audio.js',
    '../core/postfx.js', '../core/weapons/WeaponSystem.js', '../core/scene-inventory.js',
    '../core/objective-panel.js',
    '../core/pause-menu.js', '../core/final-arc-story.js', '../core/final-arc-loadout.js',
  ]) {
    assert.ok(main.includes(shared), `runtime bypasses shared ${shared}`);
  }
  assert.match(main, /createCartelPalaceCampaignStory/);
  assert.match(main, /createFinalArcLoadout/);
  assert.match(main, /combatVitals\(playerActor\)/,
    'the Palace HUD must consume the canonical health and armor view model');
  assert.doesNotMatch(main, /new Inventory\(/, 'scene must not fork final-arc loadout persistence');
  assert.match(main, /KeyQ[\s\S]{0,180}loadout\.stow\(weapons\)/,
    'Q must share the final-arc empty-hands contract');
  assert.match(main, /pagehide[\s\S]{0,180}loadout\.capture\(weapons\)/,
    'ammo changes must survive scene navigation');
  /* The Palace goes HOME before the pickup.
   *
   * Act One of the Special Meeting lives in Apartment, so jumping straight to
   * the kerb loses the call, getting ready, refused door and headlights. */
  assert.match(main,
    /navigateCampaign\(campaign, SCENE_IDS\.APARTMENT, \{ spawn: 'front_door'/);
  assert.doesNotMatch(main, /navigateCampaign\([\s\S]{0,160}SCENE_IDS\.SPECIAL_MEETING/);
  assert.doesNotMatch(main, /navigateCampaign\([\s\S]{0,120}SCENE_IDS\.INITIATION/);
  assert.doesNotMatch(main,
    /missions\[MISSION_IDS\.INITIATION\]\.status\s*=\s*'in_progress'/,
    'Palace must not claim a mission that starts at the Special Meeting treeline');
  assert.doesNotMatch(main, /vo\.cartel|SEQUENCES|DialogueController/,
    'locked confrontation voice lines must not be invented in the runtime');
  assert.match(main, /event\.button === 0[\s\S]{0,180}finale\.canPlayerFire\(\)[\s\S]{0,180}weapons\.setTrigger\(true\)/,
    'left-click must cross the finale fire-permission seam before reaching WeaponSystem');
  assert.doesNotMatch(main, /finale\.interrupt\(\)/,
    'a post-shot interruption callback is too late to protect essential dialogue');
  assert.match(main, /finale\.update\(dt\);[\s\S]{0,300}security\.update\(dt/,
    'the finale clock is not advanced before shared combat AI');
  assert.match(main, /onPresentationStep:[\s\S]{0,500}combatSteps\.update\(/,
    'scripted Palace arrivals bypass the shared positional footstep cadence');
});

test('the Palace browser gate certifies one clean-start mission before checkpoint probes', async () => {
  const verifier = await readFile(new URL('../tools/verify-cartel-palace.mjs', import.meta.url), 'utf8');
  assert.ok(verifier.includes("'--use-gl=angle'")
      && verifier.includes("'--use-angle=swiftshader'"),
  'the Palace gate must use the stable ANGLE-on-SwiftShader route used by other heavy scenes');
  assert.match(verifier, /CLEAN_START_HREF\s*=\s*`[^`]*cartel-palace\.html\?preview=1`/,
    'the browser gate has no ordinary preview entry without an authored checkpoint');
  assert.match(verifier, /clean start:[\s\S]*real pointer lock[\s\S]*housekeeper[\s\S]*entry watch[\s\S]*opening dialogue blocks a real shot[\s\S]*walking A-Team entrance[\s\S]*Mark retreats[\s\S]*post-combat extraction/i,
    'the clean-start gate does not cover the player-facing Palace pass end to end');
  assert.match(verifier, /page\.keyboard\.down\('e'\)[\s\S]*interaction\.update\(0\.1\)/,
    'clean-start progression must cross the real keyboard/InteractionSystem seam');
  assert.match(verifier, /page\.mouse\.down\(\{ button: 'left' \}\)[\s\S]*finale\.canPlayerFire\(\)/,
    'clean-start dialogue protection must be exercised through the document mouse binding');
});

test('Cartel Palace death retry restores in memory, with reload only as the fallback', async () => {
  const [main, hud] = await Promise.all([
    readFile(new URL('src/cartel-palace/main.js', ROOT), 'utf8'),
    readFile(new URL('src/core/hud.js', ROOT), 'utf8'),
  ]);

  assert.match(main, /function retryFromCheckpoint\(\)/,
    'the death retry must be an in-memory checkpoint restore');
  assert.match(main, /retryButton\.addEventListener\('click', \(\) => \{\s*[\s\S]{0,400}?if \(!retryFromCheckpoint\(\)\) location\.reload\(\);/,
    'reload is the fallback for an unrestorable snapshot, never the primary path');
  assert.doesNotMatch(main, /retryButton\.addEventListener\('click', \(\) => location\.reload\(\)\)/,
    'the retry button must not rebuild the page unconditionally');
  assert.match(main, /function presentPlayerDeath\(\)/,
    'death presentation is one function so the retry un-freezes everything it froze');
  assert.match(main, /PALACE_BEATS\.DINING_ROOM\) security\.activateFinalEncounter\(\)/,
    'a dining-room restore must re-assert the final encounter or the bosses come back passive');
  assert.match(main, /hud\.clearSay\(\)/,
    'the failed attempt\'s pending narration must not talk into the restored timeline');
  assert.match(hud, /clearSay\(\)\s*\{/, 'Hud must expose the narration cut the retry relies on');
});

test('Cartel Palace has a focused browser verifier registered in package scripts', async () => {
  const [pkg, verifier] = await Promise.all([
    readFile(new URL('package.json', ROOT), 'utf8').then(JSON.parse),
    readFile(new URL('tools/verify-cartel-palace.mjs', ROOT), 'utf8'),
  ]);
  assert.equal(pkg.scripts['verify:cartel-palace'], 'node tools/verify-cartel-palace.mjs');
  for (const checkpoint of ['approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear']) {
    assert.ok(verifier.includes(checkpoint), `verifier omits ${checkpoint}`);
  }
  assert.match(verifier, /CARTEL_PALACE/);
  assert.match(verifier, /squatchlife\.campaign/);
});

test('Cartel Palace preview begins its available mission before checkpointing', () => {
  const sentinel = '{"canonical":"leave cartel palace preview isolated"}';
  const canonicalStorage = {
    raw: sentinel,
    reads: 0,
    writes: 0,
    getItem() { this.reads++; return this.raw; },
    setItem(_key, value) { this.writes++; this.raw = String(value); },
  };
  globalThis.location = {
    pathname: '/game/cartel-palace.html',
    search: '?preview=1&checkpoint=clear',
  };
  globalThis.localStorage = canonicalStorage;

  try {
    const campaign = createCampaign();
    const story = createCartelPalaceCampaignStory({ campaign });
    assert.equal(campaign.state.scene.id, SCENE_IDS.CARTEL_PALACE);
    assert.equal(story.mission.status, 'available');
    assert.equal(
      campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_CARTEL_PALACE),
      false,
      'an available preview mission must not pre-consume its own departure event',
    );

    assert.deepEqual(story.begin(), { ok: true, resumed: false });
    assert.equal(story.mission.status, 'in_progress');
    assert.equal(
      campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_CARTEL_PALACE),
      true,
    );
    assert.equal(campaign.state.missions[MISSION_IDS.CARTEL_PALACE].checkpoint, null);
    assert.equal(canonicalStorage.raw, sentinel);
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
    delete globalThis.__squatchLifePreviewRuntime;
  }
});

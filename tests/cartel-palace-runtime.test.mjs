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
  for (const id of ['scene', 'overlay', 'start-btn', 'objective', 'prompt', 'crosshair', 'hotbar', 'ammo', 'boss']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  for (const shared of [
    '../core/player.js', '../core/hud.js', '../core/interaction.js', '../core/audio.js',
    '../core/postfx.js', '../core/weapons/WeaponSystem.js', '../core/scene-inventory.js',
    '../core/pause-menu.js', '../core/final-arc-story.js', '../core/final-arc-loadout.js',
  ]) {
    assert.ok(main.includes(shared), `runtime bypasses shared ${shared}`);
  }
  assert.match(main, /createCartelPalaceCampaignStory/);
  assert.match(main, /createFinalArcLoadout/);
  assert.doesNotMatch(main, /new Inventory\(/, 'scene must not fork final-arc loadout persistence');
  assert.match(main, /KeyQ[\s\S]{0,180}loadout\.stow\(weapons\)/,
    'Q must share the final-arc empty-hands contract');
  assert.match(main, /pagehide[\s\S]{0,180}loadout\.capture\(weapons\)/,
    'ammo changes must survive scene navigation');
  assert.match(main, /navigateCampaign\([\s\S]*SCENE_IDS\.INITIATION/);
  assert.doesNotMatch(main, /vo\.cartel|SEQUENCES|DialogueController/,
    'locked confrontation voice lines must not be invented in the runtime');
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

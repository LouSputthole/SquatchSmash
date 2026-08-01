import { ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();

const TEST_MODULES = [
  './campaign.test.mjs',
  './fresh-save-campaign-route.test.mjs',
  './daynight.test.mjs',
  './characters.test.mjs',
  './initiation-canon.test.mjs',
  './apartment-story.test.mjs',
  './phone.test.mjs',
  './squatchfather-story.test.mjs',
  './airstrip-story.test.mjs',
  './airstrip-mission.test.mjs',
  './beefrun-lineup.test.mjs',
  './beefrun-runway-start.test.mjs',
  './post-airstrip-story.test.mjs',
  './bada-bing-two-mission.test.mjs',
  './bing-dialogue-lock.test.mjs',
  './bing-audio.test.mjs',
  './no-wake-story.test.mjs',
  './silver-story.test.mjs',
  './squatch-smash-goals.test.mjs',
  './preview-mode.test.mjs',
  './radio-tape.test.mjs',
  './sfx-index.test.mjs',
  './audio-engine.test.mjs',
  './apartment-audio.test.mjs',
  './inventory.test.mjs',
  './inventory-view.test.mjs',
  './player.test.mjs',
];

for (const modulePath of TEST_MODULES) await import(modulePath);

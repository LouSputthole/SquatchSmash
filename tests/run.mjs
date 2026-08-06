import test from 'node:test';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
/* Before ANY module is imported. Scene modules bake textures at module load
 * and the per-file `globalThis.document ??=` stubs cannot fix that between
 * themselves -- see `ensureDomShim`'s own note for the run this silently
 * truncated. */
ensureDomShim();

const TEST_MODULES = [
  './build-kit.test.mjs',
  './campaign.test.mjs',
  './heist-campaign.test.mjs',
  './bank-heist-story.test.mjs',
  './combat-core.test.mjs',
  './weapons-core.test.mjs',
  './ground-vehicle.test.mjs',
  './heist-bank-threat.test.mjs',
  './heist-safehouse.test.mjs',
  './heist-presentation.test.mjs',
  './heist-level-presentation.test.mjs',
  './heist-systems.test.mjs',
  './heist-route.test.mjs',
  './heist-hostages.test.mjs',
  './heist-loadout.test.mjs',
  './heist-scale.test.mjs',
  './fresh-save-campaign-route.test.mjs',
  './daynight.test.mjs',
  './apartment-dressing.test.mjs',
  './apartment-milk.test.mjs',
  './margo-morning.test.mjs',
  './mouth.test.mjs',
  './audio-variant-bank.test.mjs',
  './signature-audio.test.mjs',
  './characters.test.mjs',
  './initiation-canon.test.mjs',
  './initiation-voice.test.mjs',
  './motel-voice.test.mjs',
  './motel-dialogue-timing.test.mjs',
  './motel-presentation.test.mjs',
  './motel-silverback.test.mjs',
  './apartment-story.test.mjs',
  './apartment-voice-coverage.test.mjs',
  './phone.test.mjs',
  './squatchfather-story.test.mjs',
  './airstrip-story.test.mjs',
  './airstrip-mission.test.mjs',
  './beefrun-lineup.test.mjs',
  './beefrun-mission-rules.test.mjs',
  './beefrun-flight-safety.test.mjs',
  './beefrun-cockpit-frame.test.mjs',
  './beefrun-cecilio-face.test.mjs',
  './beefrun-runway-start.test.mjs',
  './beefrun-playtest-fixes.test.mjs',
  './post-airstrip-story.test.mjs',
  './bada-bing-two-mission.test.mjs',
  './hotdog-attack.test.mjs',
  './graveyard-controls.test.mjs',
  './gut-presentation.test.mjs',
  './outfits.test.mjs',
  './appearances.test.mjs',
  './wrapped-body.test.mjs',
  './graveyard-mission.test.mjs',
  './hotdog-graveyard-story.test.mjs',
  './hotdog-voice-catalog.test.mjs',
  './scene-audio-residency.test.mjs',
  './bing-dialogue-lock.test.mjs',
  './bing-family.test.mjs',
  './bing-family-asides.test.mjs',
  './license-to-grill.test.mjs',
  './license-to-grill-room.test.mjs',
  './bing-voice-coverage.test.mjs',
  './beefrun-voice-manifest.test.mjs',
  './new-scene-voice-manifest.test.mjs',
  './enolasquatch-combat.test.mjs',
  './enolasquatch-detonation.test.mjs',
  './enolasquatch-nose-art.test.mjs',
  './enolasquatch-restart.test.mjs',
  './enolasquatch-bomb-audio.test.mjs',
  './bing-audio.test.mjs',
  './no-wake-story.test.mjs',
  './no-wake-irish.test.mjs',
  './no-wake-deck.test.mjs',
  './silver-story.test.mjs',
  './silver-ape-continuity.test.mjs',
  './silvercase-cast.test.mjs',
  './silent-squatch-mission.test.mjs',
  './silent-squatch-voice.test.mjs',
  './silent-squatch-lab-contract.test.mjs',
  './mansion-cast-whip.test.mjs',
  './mansion-siege.test.mjs',
  './mansion-siege-dressing.test.mjs',
  './mansion-siege-people.test.mjs',
  './silver-voice-catalog.test.mjs',
  './golf-story.test.mjs',
  './golf-gallery.test.mjs',
  './silver-pines.test.mjs',
  './golf-runtime-polish.test.mjs',
  './squatch-smash-goals.test.mjs',
  './preview-mode.test.mjs',
  './radio-tape.test.mjs',
  './radio-voice-coverage.test.mjs',
  './voice-transition-runtime.test.mjs',
  './sfx-index.test.mjs',
  './audio-production-tools.test.mjs',
  './audio-engine.test.mjs',
  './media-performance.test.mjs',
  './apartment-audio.test.mjs',
  './inventory.test.mjs',
  './inventory-view.test.mjs',
  './player.test.mjs',
];

/* A module that throws while being IMPORTED used to end the run silently.
 * `await import()` in a bare loop rejects, the loop stops, and every module
 * after it never registers a single test -- so the suite that should have
 * shouted came back "0 fail" with two hundred tests quietly missing, and the
 * only clue was a total nobody was reading. Now the broken import IS a failing
 * test, named after the file, and the rest of the list still runs. */
for (const modulePath of TEST_MODULES) {
  try {
    await import(modulePath);
  } catch (err) {
    test(`${modulePath} — the module could not even be imported`, () => { throw err; });
  }
}

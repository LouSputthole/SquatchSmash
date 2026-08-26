import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';
import {
  apartmentReturnSource,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { createMotelStory } from '../src/core/motel-story.js';
import {
  APARTMENT_PREVIEW_VARIANTS,
  isPreviewMode,
  previewBeefRunCheckpointForLocation,
  previewCheckpointForLocation,
  previewDifficultyForLocation,
  previewApartmentVariantForLocation,
  previewNavigationHref,
  previewSceneForLocation,
} from '../src/core/preview-mode.js';

class WatchStorage {
  constructor(raw) {
    this.raw = raw;
    this.reads = 0;
    this.writes = 0;
  }

  getItem() {
    this.reads++;
    return this.raw;
  }

  setItem(_key, value) {
    this.writes++;
    this.raw = String(value);
  }
}

test('preview query and route resolution preserve existing query parameters', () => {
  const current = {
    pathname: '/game/bing.html',
    search: '?visit=2&preview=1',
  };
  assert.equal(isPreviewMode(current), true);
  assert.equal(previewSceneForLocation(current), SCENE_IDS.BADA_BING_TWO);
  assert.equal(previewSceneForLocation({
    pathname: '/game/nowake.html', search: '?preview=1',
  }), SCENE_IDS.NO_WAKE);
  assert.equal(previewSceneForLocation({
    pathname: '/game/graveyard.html', search: '?preview=1',
  }), SCENE_IDS.SQUATCH_GRAVEYARD);
  assert.equal(previewSceneForLocation({
    pathname: '/game/golf.html', search: '?preview=1',
  }), SCENE_IDS.SILVER_PINES);
  for (const [pathname, scene] of [
    ['/game/cabin.html', SCENE_IDS.COUNTRYSIDE_CABIN],
    ['/game/silvercase.html', SCENE_IDS.SILVER_CASE],
    ['/game/mansion-siege.html', SCENE_IDS.MANSION_SIEGE],
    ['/game/enolasquatch.html', SCENE_IDS.ENOLA_SQUATCH],
    ['/game/cartel-palace.html', SCENE_IDS.CARTEL_PALACE],
  ]) {
    assert.equal(previewSceneForLocation({ pathname, search: '?preview=1' }), scene, pathname);
  }
  assert.equal(previewSceneForLocation({
    pathname: '/game/mansion.html', search: '?visit=return&preview=1',
  }), SCENE_IDS.MANSION_RETURN);
  assert.equal(previewApartmentVariantForLocation({
    pathname: '/game/index.html',
    search: '?preview=1&apartment=after-beef-run',
  }), 'after-beef-run');
  assert.equal(previewApartmentVariantForLocation({
    pathname: '/game/index.html',
    search: '?preview=1&apartment=not-a-checkpoint',
  }), null);
  assert.ok(APARTMENT_PREVIEW_VARIANTS.includes('day-four-wake'));
  assert.ok(APARTMENT_PREVIEW_VARIANTS.includes('after-golf'));
  assert.ok(APARTMENT_PREVIEW_VARIANTS.includes('after-heist'));
  assert.equal(
    previewNavigationHref('bing.html?visit=2#lot', current),
    'bing.html?visit=2&preview=1#lot',
  );
  assert.equal(
    previewNavigationHref('index.html', { pathname: '/game/index.html', search: '' }),
    'index.html',
  );
});

test('heist preview checkpoint and difficulty inputs are bounded', () => {
  assert.equal(previewCheckpointForLocation({
    search: '?preview=1&checkpoint=mercer_garage',
  }), 'mercer_garage');
  assert.equal(previewCheckpointForLocation({
    search: '?preview=1&checkpoint=teleport_everywhere',
  }), 'safehouse');
  assert.equal(previewDifficultyForLocation({
    search: '?preview=1&difficulty=forgiving',
  }), 'forgiving');
  assert.equal(previewDifficultyForLocation({
    search: '?preview=1&difficulty=nightmare',
  }), 'professional');
});

test('Beef Run preview checkpoints are bounded and cannot override a normal save', () => {
  assert.equal(previewBeefRunCheckpointForLocation({
    pathname: '/game/beefrun.html', search: '?preview=1&checkpoint=preflight',
  }), 'preflight');
  assert.equal(previewBeefRunCheckpointForLocation({
    pathname: '/game/beefrun.html', search: '?preview=1&checkpoint=takeoff',
  }), 'takeoff');
  assert.equal(previewBeefRunCheckpointForLocation({
    pathname: '/game/beefrun.html', search: '?preview=1&checkpoint=landing',
  }), 'landing');
  assert.equal(previewBeefRunCheckpointForLocation({
    pathname: '/game/beefrun.html', search: '?preview=1&checkpoint=teleport_everywhere',
  }), null);
  assert.equal(previewBeefRunCheckpointForLocation({
    pathname: '/game/beefrun.html', search: '?checkpoint=takeoff',
  }), null);
  assert.equal(previewBeefRunCheckpointForLocation({
    pathname: '/game/heist.html', search: '?preview=1&checkpoint=takeoff',
  }), null);
});

test('the preview launcher exposes the Beef Run preflight alongside its flight skips', () => {
  const html = fs.readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  assert.match(html, /beefrun\.html\?preview=1&amp;checkpoint=preflight[^>]*>Preflight</i);
});

test('final-arc launcher links preserve preview isolation and expose Cartel Palace skips', () => {
  const html = fs.readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  assert.match(html, /data-preview-scene="cabin"[^>]+href="cabin\.html\?preview=1"/i);
  assert.match(html, /silvercase\.html\?preview=1&amp;checkpoint=car[^>]*>Car</i);
  assert.match(html, /mansion-siege\.html\?preview=1&amp;checkpoint=wake[^>]*>Wake</i);
  assert.match(html, /data-preview-scene="mansion-siege"[^>]+href="mansion-siege\.html\?preview=1"/i);
  assert.match(html, /data-preview-scene="mansion-return"[^>]+href="mansion\.html\?visit=return&amp;preview=1"/i);
  assert.match(html, /data-preview-scene="cartel-palace"[^>]+href="cartel-palace\.html\?preview=1"/i);
  for (const checkpoint of ['approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear']) {
    assert.match(html, new RegExp(`cartel-palace\\.html\\?preview=1&amp;checkpoint=${checkpoint}`));
  }
  const sceneOrder = [...html.matchAll(/data-preview-scene="([^"]+)"/g)]
    .map((match) => match[1]);
  const finalOrder = [
    'heist', 'cabin', 'silvercase', 'mansion', 'mansion-siege', 'enolasquatch',
    'mansion-return', 'cartel-palace', 'initiation',
  ];
  assert.deepEqual(
    sceneOrder.filter((scene) => finalOrder.includes(scene)),
    finalOrder,
  );
});

test('the unplaced luxury apartment is available as a standalone future-hub preview', () => {
  const html = fs.readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  assert.match(
    html,
    /data-preview-scene="luxury-apartment"[^>]+href="luxury-apartment\.html\?preview=1"/i,
  );
  assert.match(html, /FUTURE HUB · UNPLACED/i);
});

test('the preview launcher exposes the wardrobe and combat development tools', () => {
  const html = fs.readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  assert.match(html, /data-preview-tool="wardrobe"[^>]+href="wardrobe\.html"/i);
  assert.match(html, /data-preview-tool="combat"[^>]+href="combatlab\.html\?preview=1"/i);
});

test('motel preview starts unlocked without reading or writing canonical localStorage', () => {
  const sentinel = '{"canonical":"leave me alone"}';
  const canonicalStorage = new WatchStorage(sentinel);
  globalThis.localStorage = canonicalStorage;
  globalThis.location = {
    pathname: '/game/motel.html',
    search: '?preview=1',
  };

  try {
    const campaign = createCampaign();
    assert.equal(campaign.state.scene.id, SCENE_IDS.JERKY_MOTEL);
    assert.equal(
      campaign.state.missions[MISSION_IDS.BADA_BING_TWO].status,
      'complete',
    );
    assert.equal(
      campaign.state.missions[MISSION_IDS.JERKY_MOTEL].status,
      'available',
    );
    assert.deepEqual(createMotelStory({ campaign }).begin(), {
      ok: true,
      resumed: false,
    });
    assert.equal(canonicalStorage.raw, sentinel);
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);

    const navigated = [];
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, {
      spawn: 'front_door',
      location: { assign: (href) => navigated.push(href) },
    });
    assert.deepEqual(navigated, ['index.html?preview=1']);
    assert.equal(canonicalStorage.raw, sentinel);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
  }
});

test('every authored apartment iteration receives a coherent isolated campaign checkpoint', () => {
  const sentinel = '{"canonical":"apartment previews leave this alone"}';
  const canonicalStorage = new WatchStorage(sentinel);
  const cases = [
    {
      variant: 'day-one-wake', spawn: 'wake', chapter: 'day_one', day: 1, time: 6 * 60 + 4,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.BADA_BING_ONE].status, 'locked');
        assert.equal(state.events[EVENT_IDS.LOU_FIRST_CALL].status, 'pending');
        assert.equal(state.inventory.carried.includes(ITEM_IDS.PHONE), false);
      },
    },
    {
      variant: 'after-bing-one', spawn: 'front_door', chapter: 'day_one', day: 1,
      time: 23 * 60 + 41,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.BADA_BING_ONE].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'available');
        assert.equal(state.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
        assert.ok(state.inventory.carried.includes(ITEM_IDS.PHONE));
        assert.ok(state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE));
      },
    },
    {
      variant: 'after-squatchfather', spawn: 'front_door', chapter: 'day_one', day: 2,
      time: 3 * 60,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_ATTABOY_CALL].status, 'pending');
        assert.equal(state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE), false);
      },
    },
    {
      variant: 'day-two-wake', spawn: 'wake', chapter: 'day_two', day: 2,
      time: 7 * 60,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'locked');
        assert.equal(state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'pending');
      },
    },
    {
      variant: 'after-beef-run', spawn: 'front_door', chapter: 'day_two', day: 2,
      time: 20 * 60 + 30,
      verify(state) {
        const airstrip = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
        assert.equal(airstrip.status, 'complete');
        assert.equal(airstrip.checkpoint, 'landed_home');
        assert.equal(airstrip.cargoLoaded, true);
        assert.equal(state.events[EVENT_IDS.LOU_SECOND_CALL].status, 'pending');
        assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'locked');
      },
    },
    {
      variant: 'after-motel', spawn: 'front_door', chapter: 'day_two', day: 3,
      time: 4 * 60 + 30,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'locked');
        assert.equal(state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'pending');
      },
    },
    {
      variant: 'day-three-wake', spawn: 'wake', chapter: 'no_wake', day: 3,
      time: 12 * 60,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'locked');
        assert.equal(state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'pending');
      },
    },
    {
      variant: 'after-no-wake', spawn: 'front_door', chapter: 'date', day: 3,
      time: 16 * 60 + 40,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'locked');
        assert.equal(state.events[EVENT_IDS.MARGO_DATE_CALL].status, 'pending');
      },
    },
    {
      variant: 'after-silver-room', spawn: 'front_door', chapter: 'date', day: 3,
      time: 23 * 60 + 20,
      verify(state) {
        const silver = state.missions[MISSION_IDS.SILVER_ROOM];
        assert.equal(silver.status, 'complete');
        assert.equal(silver.outcome, 'strong');
        assert.equal(silver.seeingHerAgain, true);
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
      },
    },
    {
      variant: 'day-four-wake', spawn: 'wake', chapter: 'golf_morning', day: 4,
      time: 7 * 60,
      verify(state, campaign) {
        assert.equal(state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'pending');
        assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'locked');
        assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'locked');
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
        assert.equal(createApartmentStory({ campaign }).margoWakeOwed(), true);
      },
    },
    {
      variant: 'after-golf', spawn: 'front_door', chapter: 'heist_day', day: 4,
      time: 10 * 60 + 30,
      verify(state, campaign) {
        assert.equal(state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_HEIST_CALL].status, 'pending');
        assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'locked');
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
        assert.equal(
          state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_WAKE),
          true,
        );
        assert.equal(createApartmentStory({ campaign }).margoWakeOwed(), false);
      },
    },
    {
      variant: 'after-heist', spawn: 'front_door', chapter: 'post_heist', day: 4,
      time: 17 * 60 + 20,
      verify(state, campaign) {
        const heist = state.missions[MISSION_IDS.BANK_HEIST];
        assert.equal(heist.status, 'complete');
        assert.equal(heist.cleanup.finalCalls, true);
        assert.equal(heist.cleanup.washed, false);
        assert.equal(heist.cleanup.changed, false);
        assert.equal(heist.cleanup.gearSecured, false);
        assert.equal(
          heist.operationalLoss + heist.familyShare + heist.crewShare + heist.prospectShare,
          heist.grossTake,
        );
        assert.equal(state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
        assert.equal(
          createApartmentStory({ campaign }).tryLeave(state.activities).id,
          'washed',
        );
      },
    },
  ];
  const expectedReturnSources = new Map([
    ['day-one-wake', null],
    ['after-bing-one', SCENE_IDS.BADA_BING_ONE],
    ['after-squatchfather', SCENE_IDS.SQUATCHFATHER],
    ['day-two-wake', null],
    ['after-beef-run', SCENE_IDS.AIRSTRIP_SMUGGLING],
    ['after-motel', SCENE_IDS.JERKY_MOTEL],
    ['day-three-wake', null],
    ['after-no-wake', SCENE_IDS.NO_WAKE],
    ['after-silver-room', SCENE_IDS.SILVER_ROOM],
    ['day-four-wake', null],
    ['after-golf', SCENE_IDS.SILVER_PINES],
    ['after-heist', SCENE_IDS.BANK_HEIST],
  ]);

  assert.deepEqual(cases.map(({ variant }) => variant), [...APARTMENT_PREVIEW_VARIANTS]);
  globalThis.localStorage = canonicalStorage;
  try {
    for (const entry of cases) {
      globalThis.location = {
        pathname: '/game/index.html',
        search: `?preview=1&apartment=${entry.variant}`,
      };
      const campaign = createCampaign();
      const state = campaign.state;
      assert.deepEqual(state.scene, { id: SCENE_IDS.APARTMENT, spawn: entry.spawn }, entry.variant);
      assert.equal(state.story.chapter, entry.chapter, entry.variant);
      assert.equal(state.story.day, entry.day, entry.variant);
      assert.equal(state.story.timeMinutes, entry.time, entry.variant);
      assert.equal(
        apartmentReturnSource(state),
        expectedReturnSources.get(entry.variant),
        entry.variant,
      );
      entry.verify(state, campaign);
      assert.equal(canonicalStorage.raw, sentinel, entry.variant);
    }
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
    delete globalThis.__squatchLifePreviewRuntime;
  }
});

test('standalone mission previews receive only temporary prerequisites', () => {
  const cases = [
    {
      location: { pathname: '/squatchfather.html', search: '?preview=1' },
      scene: SCENE_IDS.SQUATCHFATHER,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.BADA_BING_ONE].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'available');
        assert.ok(state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE));
      },
    },
    {
      location: { pathname: '/bing.html', search: '?visit=2&preview=1' },
      scene: SCENE_IDS.BADA_BING_TWO,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_SECOND_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'available');
      },
    },
    {
      location: { pathname: '/graveyard.html', search: '?preview=1' },
      scene: SCENE_IDS.SQUATCH_GRAVEYARD,
      verify(state) {
        const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
        assert.equal(incident.status, 'in_progress');
        assert.equal(incident.checkpoint, 'body_loaded');
        assert.equal(incident.bodyLoaded, true);
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'locked');
        assert.equal(state.story.day, 5);
        assert.equal(state.story.timeMinutes, 15);
        assert.equal(
          state.story.timeEvents.includes(TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD),
          true,
        );
      },
    },
    {
      location: { pathname: '/nowake.html', search: '?preview=1' },
      scene: SCENE_IDS.NO_WAKE,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'available');
        assert.equal(state.story.chapter, 'no_wake');
        assert.equal(state.story.day, 5);
      },
    },
    {
      location: { pathname: '/silver.html', search: '?preview=1' },
      scene: SCENE_IDS.SILVER_ROOM,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'complete');
        assert.equal(state.events[EVENT_IDS.MARGO_DATE_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'available');
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
        assert.equal(state.story.chapter, 'date');
        assert.equal(state.story.day, 5);
      },
    },
    {
      location: { pathname: '/golf.html', search: '?preview=1' },
      scene: SCENE_IDS.SILVER_PINES,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'available');
        assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'locked');
        assert.equal(state.story.chapter, 'golf_morning');
        assert.equal(state.story.day, 6);
      },
    },
    {
      location: { pathname: '/heist.html', search: '?preview=1' },
      scene: SCENE_IDS.BANK_HEIST,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_HEIST_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'available');
        assert.equal(state.story.chapter, 'heist_day');
        assert.equal(state.story.day, 6);
      },
    },
    {
      location: { pathname: '/cabin.html', search: '?preview=1' },
      scene: SCENE_IDS.COUNTRYSIDE_CABIN,
      verify(state) {
        const heist = state.missions[MISSION_IDS.BANK_HEIST];
        assert.equal(heist.status, 'complete');
        assert.equal(heist.cleanupComplete, true);
        assert.equal(state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
        assert.equal(state.story.chapter, 'post_heist');
        assert.equal(state.story.day, 7);
        assert.equal(state.story.timeMinutes, 11 * 60 + 15);
        assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.PHONE_READ_CABIN), true);
        assert.equal(
          state.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN),
          true,
        );
        assert.equal(state.inventory.carried.includes(ITEM_IDS.PHONE), true);
      },
    },
    {
      location: { pathname: '/mansion.html', search: '?visit=return&preview=1' },
      scene: SCENE_IDS.MANSION_RETURN,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.SILVER_CASE].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SILENT_SQUATCH].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.MANSION_SIEGE].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.ENOLA_SQUATCH].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.MANSION_RETURN].status, 'available');
        assert.equal(state.missions[MISSION_IDS.CARTEL_PALACE].status, 'locked');
        assert.equal(state.story.chapter, 'mansion_return');
        assert.equal(state.story.day, 9);
        assert.equal(state.story.timeMinutes, 18 * 60 + 30);
      },
    },
    {
      location: { pathname: '/initiation.html', search: '?preview=1' },
      scene: SCENE_IDS.INITIATION,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.CARTEL_PALACE].status, 'complete');
        assert.equal(state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'available');
        // Preview uses the same post-Cabin clock as play: Palace extraction is
        // the end of Day 7, and the frozen Initiation follows it directly.
        assert.equal(state.story.chapter, 'big_night');
        assert.equal(state.story.day, 9);
        assert.equal(state.story.timeMinutes, 23 * 60);
      },
    },
  ];

  for (const entry of cases) {
    globalThis.location = entry.location;
    try {
      const campaign = createCampaign();
      assert.equal(campaign.state.scene.id, entry.scene);
      entry.verify(campaign.state);
    } finally {
      delete globalThis.location;
    }
  }
});

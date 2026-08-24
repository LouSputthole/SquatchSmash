#!/usr/bin/env node
/**
 * One-browser proof for the complete durable campaign route.
 *
 * Every handoff uses the public page URL and the real browser localStorage
 * save. Rendering entry modules are replaced with empty modules so this gate
 * measures campaign topology, persistence, and story contracts instead of
 * allocating sixteen unrelated WebGL worlds. The core campaign/story modules
 * still execute in the page and every mission exits through the production
 * createCampaignSceneSkipAdapter.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from '../src/core/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const NAVIGATION_TIMEOUT_MS = Number(process.env.CAMPAIGN_MARATHON_TIMEOUT_MS) || 30_000;

const TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
});

/** HTML-owned runtime entries. Core modules imported by the gate stay live. */
export const PUBLIC_RUNTIME_ENTRY_PATHS = Object.freeze([
  '/src/main.js',
  '/src/bing/router.js',
  '/src/squatchfather/main.js',
  '/src/beefrun/main.js',
  '/src/graveyard/main.js',
  '/src/motel/main.js',
  '/src/nowake/main.js',
  '/src/silver/main.js',
  '/src/golf/main.js',
  '/src/heist/main.js',
  '/src/cabin/main.js',
  '/src/silvercase/main.js',
  '/src/mansion/main.js',
  '/src/mansion/siege/main.js',
  '/src/enolasquatch/main.js',
  '/src/cartel-palace/main.js',
  '/src/specialmeeting/main.js',
  '/src/initiation/main.js',
  '/src/core/boot-guard.js',
  '/src/core/preview-entry.js',
]);

const transition = (id, from, to, href, spawn, action, requiredEvents = []) => Object.freeze({
  id, from, to, href, spawn, action, requiredEvents: Object.freeze(requiredEvents),
});

/** The exact public route, including every Apartment return and final landing. */
export const MARATHON_TRANSITIONS = Object.freeze([
  transition('day-one-to-bing', SCENE_IDS.APARTMENT, SCENE_IDS.BADA_BING_ONE,
    '/bing.html', 'driver_seat', 'apartment:day-one', [TIME_EVENT_IDS.DEPART_BADA_BING_ONE]),
  transition('bing-one-home', SCENE_IDS.BADA_BING_ONE, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip'),
  transition('home-to-squatchfather', SCENE_IDS.APARTMENT, SCENE_IDS.SQUATCHFATHER,
    '/squatchfather.html', 'restaurant_exterior', 'apartment:squatchfather'),
  transition('squatchfather-home', SCENE_IDS.SQUATCHFATHER, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip'),
  transition('home-to-beefrun', SCENE_IDS.APARTMENT, SCENE_IDS.AIRSTRIP_SMUGGLING,
    '/beefrun.html', 'hangar', 'apartment:beefrun', [
      TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER, TIME_EVENT_IDS.DEPART_AIRSTRIP,
    ]),
  transition('beefrun-home', SCENE_IDS.AIRSTRIP_SMUGGLING, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_AIRSTRIP]),
  transition('home-to-bing-two', SCENE_IDS.APARTMENT, SCENE_IDS.BADA_BING_TWO,
    '/bing.html?visit=2', 'driver_seat', 'apartment:bing-two', [TIME_EVENT_IDS.DEPART_BADA_BING_TWO]),
  transition('bing-two-to-graveyard', SCENE_IDS.BADA_BING_TWO, SCENE_IDS.SQUATCH_GRAVEYARD,
    '/graveyard.html', 'headlights', 'skip', [TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD]),
  transition('graveyard-to-motel', SCENE_IDS.SQUATCH_GRAVEYARD, SCENE_IDS.JERKY_MOTEL,
    '/motel.html', 'passenger_seat', 'skip', [
      TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO, TIME_EVENT_IDS.DEPART_JERKY_MOTEL,
    ]),
  transition('motel-home', SCENE_IDS.JERKY_MOTEL, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL]),
  transition('home-to-no-wake', SCENE_IDS.APARTMENT, SCENE_IDS.NO_WAKE,
    '/nowake.html', 'gate_c', 'apartment:no-wake', [TIME_EVENT_IDS.DEPART_NO_WAKE]),
  transition('no-wake-home', SCENE_IDS.NO_WAKE, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_NO_WAKE]),
  transition('home-to-silver-room', SCENE_IDS.APARTMENT, SCENE_IDS.SILVER_ROOM,
    '/silver.html', 'kerb', 'apartment:silver-room', [TIME_EVENT_IDS.DEPART_SILVER_ROOM]),
  transition('silver-room-home', SCENE_IDS.SILVER_ROOM, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_SILVER_ROOM]),
  transition('home-to-golf', SCENE_IDS.APARTMENT, SCENE_IDS.SILVER_PINES,
    '/golf.html', 'car_park', 'apartment:golf', [TIME_EVENT_IDS.DEPART_SILVER_PINES]),
  transition('golf-home', SCENE_IDS.SILVER_PINES, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_SILVER_PINES]),
  transition('home-to-heist', SCENE_IDS.APARTMENT, SCENE_IDS.BANK_HEIST,
    '/heist.html', 'safehouse', 'apartment:heist', [TIME_EVENT_IDS.DEPART_BANK_HEIST]),
  transition('heist-home', SCENE_IDS.BANK_HEIST, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_BANK_HEIST]),
  transition('home-to-cabin', SCENE_IDS.APARTMENT, SCENE_IDS.COUNTRYSIDE_CABIN,
    '/cabin.html', 'arrival', 'apartment:cabin', [
      TIME_EVENT_IDS.PHONE_READ_CABIN, TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN,
    ]),
  transition('cabin-to-silver-case', SCENE_IDS.COUNTRYSIDE_CABIN, SCENE_IDS.SILVER_CASE,
    '/silvercase.html', 'car_ride', 'cabin:rest', [TIME_EVENT_IDS.CABIN_REST]),
  transition('silver-case-to-mansion', SCENE_IDS.SILVER_CASE, SCENE_IDS.MANSION,
    '/mansion.html', 'gate', 'skip', [
      TIME_EVENT_IDS.DEPART_SILVER_CASE, TIME_EVENT_IDS.COMPLETE_SILVER_CASE,
    ]),
  transition('mansion-to-siege', SCENE_IDS.MANSION, SCENE_IDS.MANSION_SIEGE,
    '/mansion-siege.html', 'guest_suite', 'skip', [
      TIME_EVENT_IDS.DEPART_MANSION,
      TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH,
      TIME_EVENT_IDS.REST_AT_MANSION,
    ]),
  transition('siege-to-enola', SCENE_IDS.MANSION_SIEGE, SCENE_IDS.ENOLA_SQUATCH,
    '/enolasquatch.html', 'airfield', 'skip', [TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE]),
  transition('enola-to-mansion-return', SCENE_IDS.ENOLA_SQUATCH, SCENE_IDS.MANSION_RETURN,
    '/mansion.html?visit=return', 'driveway', 'skip', [
      TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH, TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH,
    ]),
  transition('mansion-return-to-palace', SCENE_IDS.MANSION_RETURN, SCENE_IDS.CARTEL_PALACE,
    '/cartel-palace.html', 'approach', 'skip', [
      TIME_EVENT_IDS.RETURN_TO_MANSION, TIME_EVENT_IDS.COMPLETE_MANSION_RETURN,
    ]),
  /* THE PALACE HAS NOT GONE STRAIGHT TO THE CABIN SINCE THE SPECIAL MEETING
   * WAS WRITTEN. This table said it did, and said so for as long as the
   * Special Meeting has existed: the marathon died at step 25 waiting for
   * initiation.html while the browser sat on specialmeeting.html. Nothing
   * caught it because nothing runs this gate -- it is not in CI, and the unit
   * test beside it only checks that the table is internally consistent, which
   * a wrong table can be. The route of record is SCENES[CARTEL_PALACE].next
   * in src/core/campaign.js; read it there, not from here.
   *
   * DEPART_SPECIAL_MEETING is deliberately NOT required below. The played
   * scene writes it on boot (src/specialmeeting/main.js), and this gate stubs
   * every scene runtime out -- so the only Special Meeting fact that reaches
   * the save here is the exact-once COMPLETE the skip adapter commits. */
  transition('palace-to-special-meeting', SCENE_IDS.CARTEL_PALACE, SCENE_IDS.SPECIAL_MEETING,
    '/specialmeeting.html', 'kerb', 'skip', [
      TIME_EVENT_IDS.DEPART_CARTEL_PALACE, TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE,
    ]),
  transition('special-meeting-to-initiation', SCENE_IDS.SPECIAL_MEETING, SCENE_IDS.INITIATION,
    '/initiation.html', 'gathering', 'skip', [TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING]),
  transition('initiation-to-finale', SCENE_IDS.INITIATION, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'initiation:complete', [
      TIME_EVENT_IDS.DEPART_INITIATION, TIME_EVENT_IDS.COMPLETE_INITIATION,
    ]),
]);

export function validateMarathonPlan(plan = MARATHON_TRANSITIONS) {
  assert.equal(plan.length, 28, 'the canonical marathon must have 28 transitions');
  assert.equal(plan[0]?.from, SCENE_IDS.APARTMENT);
  assert.equal(plan.at(-1)?.to, SCENE_IDS.APARTMENT);
  assert.equal(plan.at(-1)?.action, 'initiation:complete');
  for (const [index, step] of plan.entries()) {
    assert.ok(step.id && step.from && step.to && step.href && step.spawn && step.action,
      `transition ${index + 1} must be fully specified`);
    assert.equal(step.href.includes('preview=1'), false, `${step.id} must use a canonical URL`);
    if (index > 0) {
      assert.equal(step.from, plan[index - 1].to,
        `${step.id} must continue from the previous browser landing`);
    }
  }
  const skipScenes = plan.filter((step) => step.action === 'skip').map((step) => step.from);
  assert.deepEqual(skipScenes, [
    SCENE_IDS.BADA_BING_ONE,
    SCENE_IDS.SQUATCHFATHER,
    SCENE_IDS.AIRSTRIP_SMUGGLING,
    SCENE_IDS.BADA_BING_TWO,
    SCENE_IDS.SQUATCH_GRAVEYARD,
    SCENE_IDS.JERKY_MOTEL,
    SCENE_IDS.NO_WAKE,
    SCENE_IDS.SILVER_ROOM,
    SCENE_IDS.SILVER_PINES,
    SCENE_IDS.BANK_HEIST,
    SCENE_IDS.SILVER_CASE,
    SCENE_IDS.MANSION,
    SCENE_IDS.MANSION_SIEGE,
    SCENE_IDS.ENOLA_SQUATCH,
    SCENE_IDS.MANSION_RETURN,
    SCENE_IDS.CARTEL_PALACE,
    SCENE_IDS.SPECIAL_MEETING,
  ], 'every recoverable mission must use the production skip handoff exactly once');
  return true;
}

function createStaticServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? HOST}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(ROOT, relative);
      if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const stat = await fsp.stat(file).catch(() => null);
      if (!stat?.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': stat.size,
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      server.off('listening', ready);
      reject(error);
    };
    const ready = () => {
      server.off('error', fail);
      resolve();
    };
    server.once('error', fail);
    server.once('listening', ready);
    server.listen(0, HOST);
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
}

async function browserCampaign(page) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return {
      raw,
      state: raw === null ? null : JSON.parse(raw),
      url: location.href,
      preview: new URL(location.href).searchParams.get('preview') === '1',
      campaignKeys: Object.keys(localStorage).filter((key) => key === storageKey),
    };
  }, CAMPAIGN_STORAGE_KEY);
}

async function seedFreshCampaign(page) {
  return page.evaluate(async () => {
    const { createCampaign } = await import('/src/core/campaign.js');
    const campaign = createCampaign();
    if (!campaign.persistent) throw new Error('browser campaign did not acquire localStorage');
    campaign.update(() => {});
    return campaign.state;
  });
}

function navigationContextLoss(error) {
  return /Execution context was destroyed|Cannot find context with specified id|Target page, context or browser has been closed/i
    .test(error?.message ?? '');
}

async function executeBrowserAction(page, step) {
  return page.evaluate(async (currentStep) => {
    const campaignModule = await import('/src/core/campaign.js');
    const {
      MISSION_IDS: M,
      SCENE_IDS: S,
      TIME_EVENT_IDS: T,
      createCampaign,
      navigateCampaign,
    } = campaignModule;
    const campaign = createCampaign();
    const ensure = (condition, message) => {
      if (!condition) throw new Error(`${currentStep.id}: ${message}`);
    };
    ensure(campaign.persistent, 'campaign must retain browser localStorage');
    ensure(campaign.state.scene.id === currentStep.from,
      `active scene is ${campaign.state.scene.id}, expected ${currentStep.from}`);

    const navigate = () => navigateCampaign(campaign, currentStep.to, {
      spawn: currentStep.spawn,
      location: globalThis.location,
    });

    if (currentStep.action.startsWith('apartment:')) {
      const apartmentModule = await import('/src/core/apartment-story.js');
      const story = apartmentModule.createApartmentStory({ campaign, ring: () => true });
      const leaveFor = (sceneId) => {
        const result = story.tryLeave(campaign.state.activities);
        ensure(result?.kind === 'go' && result.destination === sceneId,
          `Apartment refused ${sceneId}: ${JSON.stringify(result)}`);
      };
      /* The chapter's own thing, done the way the flat does it.
       *
       * Every chapter that sends him home asks for one thing that is his
       * rather than the family's -- CHAPTER_PASTIMES in apartment-story.js --
       * and the door will not open until it is done. Asserted before it is
       * ticked rather than just ticked: this marathon is the end-to-end proof
       * that the campaign is walkable, and a pastime that fires in the wrong
       * chapter or never fires at all should stop it here. */
      const pastime = (activityId) => {
        const events = apartmentModule.pastimeActivityEvents();
        const prompt = story.tryLeave(campaign.state.activities);
        ensure(prompt?.kind === 'activity' && prompt.id === activityId,
          `expected the ${activityId} beat, got ${JSON.stringify(prompt)}`);
        const moved = campaign.advanceTime(events[activityId], (state) => {
          state.activities[activityId] = true;
        });
        ensure(moved.applied === true, `${activityId} did not reach the clock`);
      };

      if (currentStep.action === 'apartment:day-one') {
        for (const [eventId, activity] of [
          [T.EAT, 'eaten'],
          [T.SHOWER, 'showered'],
          [T.PEE, 'peed'],
          [T.POOP, 'pooped'],
          [T.CHANGE_CLOTHES, 'changedClothes'],
        ]) {
          campaign.advanceTime(eventId, (state) => { state.activities[activity] = true; });
        }
        ensure(story.callAnswered(apartmentModule.DAY_ONE_LOU_CALL) === true,
          'Day One Lou call was not accepted');
        leaveFor(S.BADA_BING_ONE);
        const departure = campaign.advanceTime(T.DEPART_BADA_BING_ONE, (state) => {
          state.missions[M.BADA_BING_ONE].status = 'in_progress';
        });
        ensure(departure.applied === true, 'Bing departure was not recorded');
      } else if (currentStep.action === 'apartment:squatchfather') {
        const prompt = story.tryLeave(campaign.state.activities);
        ensure(prompt?.kind === 'activity' && prompt.id === 'whiskeyRelaxed',
          `expected whiskey beat, got ${JSON.stringify(prompt)}`);
        campaign.update((state) => { state.activities.whiskeyRelaxed = true; });
        leaveFor(S.SQUATCHFATHER);
      } else if (currentStep.action === 'apartment:beefrun') {
        ensure(campaign.advanceTime(T.COMPLETE_SQUATCHFATHER).applied === true,
          'Squatchfather return clock was not recorded');
        ensure(story.sleep()?.ok === true, 'Day Two sleep failed');
        ensure(story.callAnswered(apartmentModule.DAY_TWO_BOOSKI_CALL) === true,
          'Day Two Booski call was not accepted');
        pastime('watchedTv');
        leaveFor(S.AIRSTRIP_SMUGGLING);
        ensure(campaign.advanceTime(T.DEPART_AIRSTRIP).applied === true,
          'Beef Run departure was not recorded');
      } else if (currentStep.action === 'apartment:bing-two') {
        ensure(story.callAnswered(apartmentModule.DAY_TWO_LOU_SECOND_CALL) === true,
          'second Bing call was not accepted');
        leaveFor(S.BADA_BING_TWO);
        ensure(campaign.advanceTime(T.DEPART_BADA_BING_TWO).applied === true,
          'second Bing departure was not recorded');
      } else if (currentStep.action === 'apartment:no-wake') {
        ensure(story.sleep()?.ok === true, 'post-Motel sleep failed');
        ensure(story.callAnswered(apartmentModule.NO_WAKE_LOU_CALL) === true,
          'NO WAKE call was not accepted');
        pastime('playedCounterSquatch');
        leaveFor(S.NO_WAKE);
        ensure(campaign.advanceTime(T.DEPART_NO_WAKE).applied === true,
          'NO WAKE departure was not recorded');
      } else if (currentStep.action === 'apartment:silver-room') {
        ensure(story.callAnswered(apartmentModule.DATE_MARGO_CALL) === true,
          'Margo date call was not accepted');
        leaveFor(S.SILVER_ROOM);
        ensure(campaign.advanceTime(T.DEPART_SILVER_ROOM).applied === true,
          'Silver Room departure was not recorded');
      } else if (currentStep.action === 'apartment:golf') {
        ensure(story.sleep()?.ok === true, 'Day Four sleep failed');
        ensure(story.callAnswered(apartmentModule.DAY_FOUR_LOU_GOLF_CALL) === true,
          'Golf call was not accepted');
        pastime('playedSquatchShoot');
        leaveFor(S.SILVER_PINES);
        ensure(campaign.advanceTime(T.DEPART_SILVER_PINES).applied === true,
          'Golf departure was not recorded');
      } else if (currentStep.action === 'apartment:heist') {
        ensure(story.callAnswered(apartmentModule.DAY_FOUR_LOU_HEIST_CALL) === true,
          'Heist call was not accepted');
        for (const item of apartmentModule.HEIST_PREPARATION_ITEMS) {
          ensure(story.collectHeistPreparation(item.id) === true,
            `Heist preparation ${item.id} failed`);
        }
        leaveFor(S.BANK_HEIST);
        ensure(campaign.advanceTime(T.DEPART_BANK_HEIST).applied === true,
          'Heist departure was not recorded');
      } else if (currentStep.action === 'apartment:cabin') {
        for (const item of apartmentModule.HEIST_CLEANUP_ITEMS) {
          ensure(story.completeHeistCleanup(item.id) === true,
            `Heist cleanup ${item.id} failed`);
        }
        const unread = story.tryLeave(campaign.state.activities);
        ensure(unread?.id === T.PHONE_READ_CABIN,
          `Cabin message did not gate departure: ${JSON.stringify(unread)}`);
        ensure(campaign.advanceTime(T.PHONE_READ_CABIN).applied === true,
          'Lou cabin message was not recorded');
        leaveFor(S.COUNTRYSIDE_CABIN);
        ensure(campaign.advanceTime(T.DEPART_COUNTRYSIDE_CABIN).applied === true,
          'Cabin departure was not recorded');
      } else {
        throw new Error(`${currentStep.id}: unknown Apartment action ${currentStep.action}`);
      }
      navigate();
      return { ok: true, action: currentStep.action };
    }

    if (currentStep.action === 'cabin:rest') {
      const { createCountrysideCabinStory } = await import(
        '/src/core/countryside-cabin-story.js'
      );
      const story = createCountrysideCabinStory({ campaign });
      const refused = story.tryLeave();
      ensure(refused?.kind === 'stay' && refused.id === 'cabin_rest_first',
        `Cabin car did not require the lay-low rest: ${JSON.stringify(refused)}`);
      ensure(story.rest()?.ok === true, 'Cabin lay-low rest failed');
      const repeat = story.rest();
      ensure(repeat?.ok === false && repeat.reason === 'already_rested',
        `Cabin rest was not exact-once: ${JSON.stringify(repeat)}`);
      const departure = story.tryLeave();
      ensure(departure?.kind === 'go' && departure.destination === S.SILVER_CASE,
        `Cabin refused The Silver Case: ${JSON.stringify(departure)}`);
      navigate();
      return { ok: true, action: currentStep.action };
    }

    if (currentStep.action === 'skip') {
      let begun = null;
      if (currentStep.from === S.SQUATCHFATHER) {
        begun = (await import('/src/core/squatchfather-story.js'))
          .createSquatchfatherStory({ campaign }).begin();
      } else if (currentStep.from === S.AIRSTRIP_SMUGGLING) {
        begun = (await import('/src/core/airstrip-story.js'))
          .createAirstripStory({ campaign }).begin();
      } else if (currentStep.from === S.BADA_BING_TWO) {
        begun = (await import('/src/core/bada-bing-two-story.js'))
          .createBadaBingTwoStory({ campaign }).begin();
      } else if (currentStep.from === S.JERKY_MOTEL) {
        begun = (await import('/src/core/motel-story.js'))
          .createMotelStory({ campaign }).begin();
      } else if (currentStep.from === S.NO_WAKE) {
        begun = (await import('/src/core/no-wake-story.js'))
          .createNoWakeStory({ campaign }).begin();
      } else if (currentStep.from === S.SILVER_ROOM) {
        begun = (await import('/src/core/silver-story.js'))
          .createSilverStory({ campaign }).begin();
      } else if (currentStep.from === S.SILVER_PINES) {
        begun = (await import('/src/core/golf-story.js'))
          .createGolfStory({ campaign }).begin();
      } else if (currentStep.from === S.BANK_HEIST) {
        begun = (await import('/src/core/bank-heist-story.js'))
          .createBankHeistStory({ campaign }).begin();
      }
      if (begun !== null) ensure(begun?.ok === true,
        `public story begin failed: ${JSON.stringify(begun)}`);

      const { createCampaignSceneSkipAdapter } = await import('/src/core/campaign-scene-skip.js');
      const skip = createCampaignSceneSkipAdapter({
        campaign,
        sceneId: currentStep.from,
        location: globalThis.location,
      });
      ensure(typeof skip === 'function', 'scene has no canonical skip adapter');
      const result = skip();
      ensure(result?.ok === true, `canonical skip failed: ${JSON.stringify(result)}`);
      return result;
    }

    if (currentStep.action === 'initiation:complete') {
      const mission = campaign.state.missions[M.INITIATION];
      ensure(mission.status === 'available' || mission.status === 'in_progress',
        `Initiation arrived ${mission.status}`);
      if (mission.status === 'available') {
        const departure = campaign.advanceTime(T.DEPART_INITIATION, (state) => {
          state.missions[M.INITIATION].status = 'in_progress';
        }, { required: true });
        ensure(departure.applied === true, 'Initiation departure was not recorded');
      }
      const completion = campaign.advanceTime(T.COMPLETE_INITIATION, (state) => {
        state.missions[M.INITIATION].status = 'complete';
      }, { required: true });
      ensure(completion.applied === true, 'Initiation completion was not recorded');
      navigate();
      return { ok: true, action: currentStep.action };
    }

    throw new Error(`${currentStep.id}: unknown action ${currentStep.action}`);
  }, step);
}

function absoluteMinutes(state) {
  return (state.story.day - 1) * 24 * 60 + state.story.timeMinutes;
}

function assertMission(state, missionId, expected) {
  const mission = state.missions[missionId];
  assert.ok(mission, `missing mission ${missionId}`);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(mission[key], value, `${missionId}.${key}`);
  }
}

function hasItem(state, itemId) {
  return state.inventory.carried.includes(itemId) || state.inventory.concealed.includes(itemId);
}

function assertLandingFacts(step, state) {
  switch (step.id) {
    case 'day-one-to-bing':
      assertMission(state, MISSION_IDS.BADA_BING_ONE, { status: 'in_progress' });
      break;
    case 'bing-one-home':
      assertMission(state, MISSION_IDS.BADA_BING_ONE,
        { status: 'complete', packageReceived: true, ending: 'followed' });
      assert.equal(state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE), true);
      break;
    case 'home-to-squatchfather':
      assertMission(state, MISSION_IDS.SQUATCHFATHER, { status: 'available' });
      assert.equal(hasItem(state, ITEM_IDS.LOU_PACKAGE), true);
      break;
    case 'squatchfather-home':
      assertMission(state, MISSION_IDS.SQUATCHFATHER,
        { status: 'complete', weaponStaged: true, weaponDropped: true });
      assert.equal(hasItem(state, ITEM_IDS.LOU_PACKAGE), false);
      break;
    case 'home-to-beefrun':
      assertMission(state, MISSION_IDS.AIRSTRIP_SMUGGLING, { status: 'available' });
      break;
    case 'beefrun-home':
      assertMission(state, MISSION_IDS.AIRSTRIP_SMUGGLING,
        { status: 'complete', checkpoint: 'landed_home', cargoLoaded: true, landingQuality: 'clean' });
      break;
    case 'home-to-bing-two':
      assertMission(state, MISSION_IDS.BADA_BING_TWO, { status: 'available' });
      break;
    case 'bing-two-to-graveyard':
      assertMission(state, MISSION_IDS.BADA_BING_TWO,
        { status: 'in_progress', checkpoint: 'body_loaded', bodyWrapped: true, bodyLoaded: true });
      break;
    case 'graveyard-to-motel':
      assertMission(state, MISSION_IDS.BADA_BING_TWO,
        { status: 'complete', checkpoint: 'buried', burialComplete: true });
      break;
    case 'motel-home':
      assertMission(state, MISSION_IDS.JERKY_MOTEL,
        { status: 'complete', ending: 'home', cargoRecovered: true });
      break;
    case 'home-to-no-wake':
      assertMission(state, MISSION_IDS.NO_WAKE, { status: 'available' });
      break;
    case 'no-wake-home':
      assertMission(state, MISSION_IDS.NO_WAKE, {
        status: 'complete', checkpoint: 'returned', betrayalConfirmed: true,
        playerFired: true, bodyDisposed: true,
      });
      break;
    case 'home-to-silver-room':
      assertMission(state, MISSION_IDS.SILVER_ROOM, { status: 'available' });
      break;
    case 'silver-room-home':
      assertMission(state, MISSION_IDS.SILVER_ROOM,
        { status: 'complete', outcome: 'perfect', seeingHerAgain: true, cameHome: true });
      break;
    case 'home-to-golf':
      assertMission(state, MISSION_IDS.SILVER_PINES, { status: 'available' });
      break;
    case 'golf-home':
      assertMission(state, MISSION_IDS.SILVER_PINES, { status: 'complete', holesPlayed: 3 });
      assert.equal(state.missions[MISSION_IDS.SILVER_PINES].holes.length, 3);
      break;
    case 'home-to-heist':
      assertMission(state, MISSION_IDS.BANK_HEIST, { status: 'available' });
      break;
    case 'heist-home':
      assertMission(state, MISSION_IDS.BANK_HEIST,
        { status: 'complete', checkpoint: 'vehicle_swap', outcome: 'professional' });
      break;
    case 'home-to-cabin':
      assertMission(state, MISSION_IDS.BANK_HEIST, { cleanupComplete: true });
      assertMission(state, MISSION_IDS.SILVER_CASE, { status: 'available' });
      break;
    case 'cabin-to-silver-case':
      assert.equal(state.story.timeEvents.filter(
        (eventId) => eventId === TIME_EVENT_IDS.CABIN_REST,
      ).length, 1, 'Cabin rest must be exact-once');
      assertMission(state, MISSION_IDS.SILVER_CASE, { status: 'available' });
      break;
    case 'silver-case-to-mansion':
      assertMission(state, MISSION_IDS.SILVER_CASE,
        { status: 'complete', checkpoint: 'case_recovered', caseRecovered: true });
      assertMission(state, MISSION_IDS.SILENT_SQUATCH, { status: 'available' });
      assert.equal(state.inventory.carried.includes(ITEM_IDS.SILVER_CASE), true);
      break;
    case 'mansion-to-siege':
      assertMission(state, MISSION_IDS.SILENT_SQUATCH,
        { status: 'complete', checkpoint: 'clear', sleptAtMansion: true, trophyAwarded: true });
      assertMission(state, MISSION_IDS.MANSION_SIEGE, { status: 'available' });
      assert.equal(hasItem(state, ITEM_IDS.SILVER_CASE), false);
      assert.equal(state.inventory.carried.includes(ITEM_IDS.SQUATCHANIUM_MINIATURE), true);
      break;
    case 'siege-to-enola':
      assertMission(state, MISSION_IDS.MANSION_SIEGE,
        { status: 'complete', checkpoint: 'wave_one' });
      assertMission(state, MISSION_IDS.ENOLA_SQUATCH, { status: 'available' });
      break;
    case 'enola-to-mansion-return':
      assertMission(state, MISSION_IDS.ENOLA_SQUATCH,
        { status: 'complete', checkpoint: 'return', payloadReleased: true, returnedHome: true });
      assertMission(state, MISSION_IDS.MANSION_RETURN, { status: 'available' });
      break;
    case 'mansion-return-to-palace':
      assertMission(state, MISSION_IDS.MANSION_RETURN, {
        status: 'complete', briefingComplete: true, wrongCityConfirmed: true,
        sauceMissingConfirmed: true, palaceLocationKnown: true,
      });
      assertMission(state, MISSION_IDS.CARTEL_PALACE, { status: 'available' });
      break;
    case 'palace-to-special-meeting':
      assertMission(state, MISSION_IDS.CARTEL_PALACE, {
        status: 'complete', checkpoint: 'clear', sauceBetrayalConfirmed: true,
        markEliminated: true, sauceEliminated: true, outcome: 'clean',
      });
      assertMission(state, MISSION_IDS.INITIATION, { status: 'available' });
      assert.equal(state.finale.status, 'locked');
      break;
    /* The one campaign scene with no mission record -- there is no
     * MISSION_IDS.SPECIAL_MEETING, because nothing in the drive can be done
     * well or badly (see RECOVERABLE_CAMPAIGN_SCENES in campaign-scene-skip.js).
     * So the durable fact this landing has to prove is the exact-once time
     * event, and that it did not disturb the Initiation it opens onto. */
    case 'special-meeting-to-initiation':
      assert.equal(state.story.timeEvents.filter(
        (eventId) => eventId === TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING,
      ).length, 1, 'Special Meeting completion must be exact-once');
      assertMission(state, MISSION_IDS.INITIATION, { status: 'available' });
      assert.equal(state.finale.status, 'locked');
      break;
    case 'initiation-to-finale':
      assertMission(state, MISSION_IDS.INITIATION, { status: 'complete' });
      assert.deepEqual(state.finale, {
        status: 'ready',
        creditsViewed: false,
        freeplayUnlocked: false,
        completedAt: { day: state.story.day, timeMinutes: state.story.timeMinutes },
      });
      assert.equal(state.story.timeEvents.filter(
        (eventId) => eventId === TIME_EVENT_IDS.COMPLETE_INITIATION,
      ).length, 1, 'Initiation completion must be exact-once');
      break;
    default:
      assert.fail(`unclassified marathon landing ${step.id}`);
  }
}

function assertContinuity(step, current, previous) {
  assert.equal(current.version, CAMPAIGN_VERSION, `${step.id} schema`);
  assert.deepEqual(current.scene, { id: step.to, spawn: step.spawn }, `${step.id} scene`);
  assert.deepEqual(current.lastTransition,
    { from: step.from, to: step.to, spawn: step.spawn }, `${step.id} transition`);
  assert.ok(current.revision > previous.revision, `${step.id} must advance revision`);
  assert.ok(absoluteMinutes(current) >= absoluteMinutes(previous), `${step.id} rewound the clock`);
  for (const eventId of previous.story.timeEvents) {
    assert.equal(current.story.timeEvents.includes(eventId), true,
      `${step.id} lost time/travel event ${eventId}`);
  }
  for (const eventId of step.requiredEvents) {
    assert.equal(current.story.timeEvents.includes(eventId), true,
      `${step.id} omitted required time/travel event ${eventId}`);
  }
  for (const bucket of ['carried', 'concealed']) {
    assert.equal(new Set(current.inventory[bucket]).size, current.inventory[bucket].length,
      `${step.id} duplicated ${bucket} inventory`);
  }
  const concealed = new Set(current.inventory.concealed);
  assert.equal(current.inventory.carried.some((itemId) => concealed.has(itemId)), false,
    `${step.id} put one item in both inventory buckets`);
  assertLandingFacts(step, current);
}

async function durableLanding(page, baseUrl, step, previous, ordinal) {
  const expectedUrl = new URL(step.href, baseUrl).href;
  assert.equal(page.url(), expectedUrl, `${step.id} URL`);
  const beforeReload = await browserCampaign(page);
  assert.equal(beforeReload.preview, false, `${step.id} entered preview mode`);
  assert.equal(beforeReload.campaignKeys.length, 1, `${step.id} lost the one canonical save`);
  assert.ok(beforeReload.raw, `${step.id} has no durable campaign save`);
  assertContinuity(step, beforeReload.state, previous);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  const afterReload = await browserCampaign(page);
  assert.equal(afterReload.url, expectedUrl, `${step.id} reload URL`);
  assert.equal(afterReload.raw, beforeReload.raw, `${step.id} reload rewrote the save`);
  assert.deepEqual(afterReload.state, beforeReload.state, `${step.id} reload changed campaign state`);
  console.log(
    `  PASS ${String(ordinal).padStart(2, '0')}/${MARATHON_TRANSITIONS.length}`
    + ` ${step.from} -> ${step.to}`
    + ` | r${afterReload.state.revision}`
    + ` | day ${afterReload.state.story.day}`
    + ` ${String(Math.floor(afterReload.state.story.timeMinutes / 60)).padStart(2, '0')}`
    + `:${String(afterReload.state.story.timeMinutes % 60).padStart(2, '0')}`,
  );
  return afterReload.state;
}

async function navigateStep(page, baseUrl, step) {
  const expectedUrl = new URL(step.href, baseUrl).href;
  const navigation = page.waitForURL(expectedUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  const action = executeBrowserAction(page, step).catch((error) => {
    if (navigationContextLoss(error)) return { ok: true, navigationContextLost: true };
    throw error;
  });
  await Promise.all([navigation, action]);
}

export async function verifyCampaignMarathon() {
  validateMarathonPlan();
  const server = createStaticServer();
  let browser = null;
  let context = null;
  try {
    await listen(server);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://${HOST}:${address.port}`;
    const { launchChromium } = await import('./launch-chromium.mjs');
    browser = await launchChromium({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
      args: ['--disable-gpu', '--mute-audio'],
    });
    context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await context.newPage();
    const publicEntries = new Set(PUBLIC_RUNTIME_ENTRY_PATHS);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (publicEntries.has(pathname)) {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: '/* Campaign marathon: rendering runtime intentionally omitted. */',
        });
      } else if (['font', 'image', 'media'].includes(request.resourceType())) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto(`${baseUrl}/index.html`, {
      waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS,
    });
    assert.equal(new URL(page.url()).searchParams.has('preview'), false);
    let previous = await seedFreshCampaign(page);
    const initial = await browserCampaign(page);
    assert.equal(initial.state.version, CAMPAIGN_VERSION);
    assert.deepEqual(initial.state.scene, { id: SCENE_IDS.APARTMENT, spawn: 'wake' });
    assert.equal(initial.state.finale.status, 'locked');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    assert.equal((await browserCampaign(page)).raw, initial.raw,
      'initial durable save changed on reload');

    console.log(`Campaign marathon: schema v${CAMPAIGN_VERSION}, one context, one page`);
    for (const [index, step] of MARATHON_TRANSITIONS.entries()) {
      await navigateStep(page, baseUrl, step);
      previous = await durableLanding(page, baseUrl, step, previous, index + 1);
    }

    assert.equal(previous.finale.status, 'ready');
    console.log(
      `Campaign marathon passed: ${MARATHON_TRANSITIONS.length}/${MARATHON_TRANSITIONS.length}`
      + ` handoffs, ${MARATHON_TRANSITIONS.length} durable landings,`
      + ` ${MARATHON_TRANSITIONS.length} reload proofs, finale ready.`,
    );
    return previous;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await closeServer(server).catch(() => {});
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  verifyCampaignMarathon().catch((error) => {
    console.error(`Campaign marathon failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}

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
  EVENT_IDS,
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
  '/src/luxury-apartment/main.js',
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
  transition('bing-one-to-squatchfather', SCENE_IDS.BADA_BING_ONE, SCENE_IDS.SQUATCHFATHER,
    '/squatchfather.html', 'restaurant_exterior', 'skip'),
  /* BEATS 3 TO 7. The driver takes him out of town and the flat does not see
   * him again until the Motel sends him back. The route used to run
   * squatchfather -> home -> home -> beefrun -> home -> bing two, which is
   * where three of the bible's beats had nowhere to happen. */
  transition('squatchfather-to-cabin', SCENE_IDS.SQUATCHFATHER, SCENE_IDS.COUNTRYSIDE_CABIN,
    '/cabin.html', 'arrival', 'skip', [
      TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER, TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW,
    ]),
  transition('cabin-to-beefrun', SCENE_IDS.COUNTRYSIDE_CABIN, SCENE_IDS.AIRSTRIP_SMUGGLING,
    '/beefrun.html', 'hangar', 'cabin:visit-one', [TIME_EVENT_IDS.DEPART_AIRSTRIP]),
  transition('beefrun-to-cabin', SCENE_IDS.AIRSTRIP_SMUGGLING, SCENE_IDS.COUNTRYSIDE_CABIN,
    '/cabin.html', 'arrival', 'skip', [
      TIME_EVENT_IDS.COMPLETE_AIRSTRIP, TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP,
    ]),
  transition('cabin-to-bing-two', SCENE_IDS.COUNTRYSIDE_CABIN, SCENE_IDS.BADA_BING_TWO,
    '/bing.html?visit=2', 'driver_seat', 'cabin:visit-two', [
      TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN, TIME_EVENT_IDS.DEPART_BADA_BING_TWO,
    ]),
  transition('bing-two-to-graveyard', SCENE_IDS.BADA_BING_TWO, SCENE_IDS.SQUATCH_GRAVEYARD,
    '/graveyard.html', 'headlights', 'skip', [TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD]),
  transition('graveyard-to-motel', SCENE_IDS.SQUATCH_GRAVEYARD, SCENE_IDS.JERKY_MOTEL,
    '/motel.html', 'passenger_seat', 'skip', [
      TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO, TIME_EVENT_IDS.DEPART_JERKY_MOTEL,
    ]),
  transition('motel-home', SCENE_IDS.JERKY_MOTEL, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL]),
  /* BEATS 11.5 TO 19, IN THE BIBLE'S ORDER.
   *
   * The route used to run home -> NO WAKE -> home -> the date -> home -> the
   * round -> home -> the bank -> home -> the cabin -> the Silver Case: five
   * returns to a flat the story bible says he moves out of halfway through,
   * a harbour job three beats early, and the last third of the game reached
   * through a property he had already finished on Day 3.
   *
   * It now runs THE TAKE on Day 5, the round on Day 6, and everything after
   * the eighteenth green from the address Lou hands him on it. */
  transition('home-to-heist', SCENE_IDS.APARTMENT, SCENE_IDS.BANK_HEIST,
    '/heist.html', 'safehouse', 'apartment:heist', [TIME_EVENT_IDS.DEPART_BANK_HEIST]),
  transition('heist-home', SCENE_IDS.BANK_HEIST, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'skip', [TIME_EVENT_IDS.COMPLETE_BANK_HEIST]),
  transition('home-to-golf', SCENE_IDS.APARTMENT, SCENE_IDS.SILVER_PINES,
    '/golf.html', 'car_park', 'apartment:golf', [TIME_EVENT_IDS.DEPART_SILVER_PINES]),
  /* Beat 14. The last thing the starter flat ever does is let him out of it. */
  transition('golf-to-luxury', SCENE_IDS.SILVER_PINES, SCENE_IDS.LUXURY_APARTMENT,
    '/luxury-apartment.html', 'arrival', 'skip', [
      TIME_EVENT_IDS.COMPLETE_SILVER_PINES, TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT,
    ]),
  transition('luxury-to-silver-room', SCENE_IDS.LUXURY_APARTMENT, SCENE_IDS.SILVER_ROOM,
    '/silver.html', 'kerb', 'luxury:date', [
      TIME_EVENT_IDS.LUXURY_GET_READY, TIME_EVENT_IDS.DEPART_SILVER_ROOM,
    ]),
  transition('silver-room-to-luxury', SCENE_IDS.SILVER_ROOM, SCENE_IDS.LUXURY_APARTMENT,
    '/luxury-apartment.html', 'main', 'skip', [TIME_EVENT_IDS.COMPLETE_SILVER_ROOM]),
  transition('luxury-to-no-wake', SCENE_IDS.LUXURY_APARTMENT, SCENE_IDS.NO_WAKE,
    '/nowake.html', 'gate_c', 'luxury:no-wake', [
      TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME,
      TIME_EVENT_IDS.LUXURY_STAYOVER_REST,
      TIME_EVENT_IDS.LUXURY_MARGO_WAKE,
      TIME_EVENT_IDS.DEPART_NO_WAKE,
    ]),
  transition('no-wake-to-luxury', SCENE_IDS.NO_WAKE, SCENE_IDS.LUXURY_APARTMENT,
    '/luxury-apartment.html', 'main', 'skip', [
      TIME_EVENT_IDS.COMPLETE_NO_WAKE, TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT,
    ]),
  /* Beat 19, and the doorway the post-heist cabin held open until now. */
  transition('luxury-to-silver-case', SCENE_IDS.LUXURY_APARTMENT, SCENE_IDS.SILVER_CASE,
    '/silvercase.html', 'car_ride', 'luxury:silver-case'),
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
  /* Palace completion returns to the home Lou gave him. The marathon drives
   * Beat 27 through the luxury story adapter before it reaches the kerb; a
   * direct Palace -> Special Meeting edge would skip the call. */
  transition('palace-to-luxury', SCENE_IDS.CARTEL_PALACE, SCENE_IDS.LUXURY_APARTMENT,
    '/luxury-apartment.html', 'main', 'skip', [
      TIME_EVENT_IDS.DEPART_CARTEL_PALACE, TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE,
    ]),
  transition('luxury-to-special-meeting', SCENE_IDS.LUXURY_APARTMENT, SCENE_IDS.SPECIAL_MEETING,
    '/specialmeeting.html', 'kerb', 'luxury:special-meeting', [
      TIME_EVENT_IDS.DEPART_SPECIAL_MEETING,
    ]),
  transition('special-meeting-to-initiation', SCENE_IDS.SPECIAL_MEETING, SCENE_IDS.INITIATION,
    '/initiation.html', 'gathering', 'skip', [
      TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING, TIME_EVENT_IDS.DEPART_INITIATION,
    ]),
  transition('initiation-to-finale', SCENE_IDS.INITIATION, SCENE_IDS.APARTMENT,
    '/index.html', 'front_door', 'initiation:complete', [
      TIME_EVENT_IDS.DEPART_INITIATION, TIME_EVENT_IDS.COMPLETE_INITIATION,
    ]),
]);

export function validateMarathonPlan(plan = MARATHON_TRANSITIONS) {
  assert.equal(plan.length, 27, 'the canonical marathon must have 27 transitions');
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
    SCENE_IDS.BANK_HEIST,
    SCENE_IDS.SILVER_PINES,
    SCENE_IDS.SILVER_ROOM,
    SCENE_IDS.NO_WAKE,
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
      EVENT_IDS: E,
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
      } else if (currentStep.action === 'apartment:heist') {
        /* BEAT 11.5. Snow gets him in from the Motel at half six and he sleeps it
         * off; the flat opens on the morning of Day 5 with Lou's call and a
         * car coming at a quarter to one. */
        ensure(story.sleep()?.ok === true, 'post-Motel sleep failed');
        ensure(story.callAnswered(apartmentModule.DAY_FOUR_LOU_HEIST_CALL) === true,
          'Heist call was not accepted');
        pastime('playedCounterSquatch');
        for (const item of apartmentModule.HEIST_PREPARATION_ITEMS) {
          ensure(story.collectHeistPreparation(item.id) === true,
            `Heist preparation ${item.id} failed`);
        }
        leaveFor(S.BANK_HEIST);
        ensure(campaign.advanceTime(T.DEPART_BANK_HEIST).applied === true,
          'Heist departure was not recorded');
      } else if (currentStep.action === 'apartment:golf') {
        /* BEAT 12, and then beat 13's morning. Wash the bank off, take Lou's
         * call about a new space, sleep, and drive to the course. */
        for (const item of apartmentModule.HEIST_CLEANUP_ITEMS) {
          ensure(story.completeHeistCleanup(item.id) === true,
            `Heist cleanup ${item.id} failed`);
        }
        const owed = story.tryLeave(campaign.state.activities);
        ensure(owed?.kind === 'call' && owed.id === apartmentModule.NEW_SPACE_LOU_CALL.eventId,
          `the new-space call did not gate the door: ${JSON.stringify(owed)}`);
        ensure(story.callAnswered(apartmentModule.NEW_SPACE_LOU_CALL) === true,
          'new-space call was not accepted');
        ensure(story.sleep()?.ok === true, 'the night before the round failed');
        pastime('playedSquatchShoot');
        leaveFor(S.SILVER_PINES);
        ensure(campaign.advanceTime(T.DEPART_SILVER_PINES).applied === true,
          'Golf departure was not recorded');
      } else if (currentStep.action === 'apartment:special-meeting') {
        const call = story.tryLeave(campaign.state.activities);
        ensure(call?.kind === 'call'
          && call.id === apartmentModule.SPECIAL_MEETING_BOOSKI_CALL.eventId,
        `Special Meeting call did not gate departure: ${JSON.stringify(call)}`);
        ensure(story.callAnswered(apartmentModule.SPECIAL_MEETING_BOOSKI_CALL) === true,
          'Special Meeting call was not accepted');
        for (const item of apartmentModule.chapterPastimes().big_night) pastime(item.id);
        const waiting = story.tryLeave(campaign.state.activities);
        ensure(waiting?.kind === 'wait' && waiting.id === 'special_meeting_car',
          `Apartment did not wait for the pickup: ${JSON.stringify(waiting)}`);
        const departure = story.tryLeave({
          ...campaign.state.activities,
          carOutside: true,
        });
        ensure(departure?.kind === 'go' && departure.destination === S.SPECIAL_MEETING,
          `Apartment refused the arrived pickup: ${JSON.stringify(departure)}`);
        ensure(campaign.advanceTime(T.DEPART_SPECIAL_MEETING).applied === true,
          'Special Meeting departure was not recorded');
      } else {
        throw new Error(`${currentStep.id}: unknown Apartment action ${currentStep.action}`);
      }
      navigate();
      return { ok: true, action: currentStep.action };
    }

    /* THE LUXURY APARTMENT, beats 14 to 19. Same shape as the flat above it:
     * the real story adapter, driven through the gates a player meets, in
     * order, so a phase that cannot be left stops the walk here. */
    if (currentStep.action.startsWith('luxury:')) {
      const luxuryModule = await import('/src/core/luxury-apartment-story.js');
      const apartmentModule = await import('/src/core/apartment-story.js');
      const luxury = luxuryModule.createLuxuryApartmentStory({ campaign });
      const leaveFor = (sceneId) => {
        const result = luxury.tryLeave();
        ensure(result?.kind === 'go' && result.destination === sceneId,
          `Luxury apartment refused ${sceneId}: ${JSON.stringify(result)}`);
      };

      if (currentStep.action === 'luxury:date') {
        ensure(luxury.arrived() === true, 'the drive from Silver Pines was not recorded');
        ensure(luxury.phase() === 'get_ready', `arrived in phase ${luxury.phase()}`);
        const chore = luxury.tryLeave();
        ensure(chore?.kind === 'activity' && chore.id === T.LUXURY_GET_READY,
          `GET READY did not gate the door: ${JSON.stringify(chore)}`);
        ensure(luxury.completeGetReady()?.ok === true, 'getting ready failed');
        ensure(luxury.pendingCall() === null,
          'the retired Margo apartment call tried to ring');
        ensure(campaign.state.events[E.MARGO_DATE_CALL]?.status === 'answered',
          'the cabin appointment did not survive to the luxury apartment');
        ensure(!campaign.state.story.timeEvents.includes(T.MARGO_DATE_CALL),
          'the retired Margo apartment call advanced the clock');
        leaveFor(S.SILVER_ROOM);
        ensure(campaign.advanceTime(T.DEPART_SILVER_ROOM).applied === true,
          'Silver Room departure was not recorded');
      } else if (currentStep.action === 'luxury:no-wake') {
        /* BEATS 16 AND 17. She came home, the night happens, she leaves in
         * the morning, and only then does the family get to ring. */
        ensure(luxury.margoComeHomeOwed() === true,
          `she did not come home: phase ${luxury.phase()}`);
        const early = luxury.sleep();
        ensure(early?.ok === false && early.reason === 'margo_still_arriving',
          `the bed was reachable before she was in: ${JSON.stringify(early)}`);
        ensure(luxury.margoComeHomeDone() === true, 'the come-home beat failed');
        const night = luxury.sleep();
        ensure(night?.ok === true && night.day === 7 && night.timeMinutes === 7 * 60 + 10,
          `the stayover missed its authored morning: ${JSON.stringify(night)}`);
        ensure(luxury.margoWakeOwed() === true, 'the morning after was not owed');
        ensure(luxury.margoWakeDone() === true, 'the morning after failed');
        ensure(luxury.callAnswered(apartmentModule.NO_WAKE_LOU_CALL) === true,
          'NO WAKE call was not accepted');
        leaveFor(S.NO_WAKE);
        ensure(campaign.advanceTime(T.DEPART_NO_WAKE).applied === true,
          'NO WAKE departure was not recorded');
      } else if (currentStep.action === 'luxury:silver-case') {
        /* BEAT 19. Home from the dock, a quiet hour, and then a call about
         * something small and sensitive. */
        ensure(luxury.phase() === 'return', `beat 19 arrived in phase ${luxury.phase()}`);
        const owed = luxury.tryLeave();
        ensure(owed?.kind === 'call'
          && owed.id === apartmentModule.SILVER_CASE_BOOSKI_CALL.eventId,
        `the Silver Case call did not gate the door: ${JSON.stringify(owed)}`);
        ensure(luxury.callAnswered(apartmentModule.SILVER_CASE_BOOSKI_CALL) === true,
          'Silver Case call was not accepted');
        leaveFor(S.SILVER_CASE);
      } else if (currentStep.action === 'luxury:special-meeting') {
        ensure(luxury.phase() === 'special_meeting',
          `beat 27 arrived in phase ${luxury.phase()}`);
        const owed = luxury.tryLeave();
        ensure(owed?.kind === 'call'
          && owed.id === apartmentModule.SPECIAL_MEETING_BOOSKI_CALL.eventId,
        `the Special Meeting call did not gate the lift: ${JSON.stringify(owed)}`);
        ensure(luxury.callAnswered(apartmentModule.SPECIAL_MEETING_BOOSKI_CALL) === true,
          'Special Meeting call was not accepted');
        leaveFor(S.SPECIAL_MEETING);
        ensure(campaign.advanceTime(T.DEPART_SPECIAL_MEETING).applied === true,
          'Special Meeting departure was not recorded');
      } else {
        throw new Error(`${currentStep.id}: unknown luxury action ${currentStep.action}`);
      }
      navigate();
      return { ok: true, action: currentStep.action };
    }

    if (currentStep.action === 'cabin:visit-one'
      || currentStep.action === 'cabin:visit-two') {
      const cabinModule = await import('/src/core/countryside-cabin-story.js');
      const story = cabinModule.createCountrysideCabinStory({ campaign });

      /* BEATS 4 AND 5. Bed, Lou, four walks, Margo, Booski about the Captain.
       * Every gate is exercised in order rather than skipped to, because the
       * whole point of this walk is that a player can actually do it. */
      if (currentStep.action === 'cabin:visit-one') {
        const toldToWait = story.tryLeave();
        ensure(toldToWait?.kind === 'stay' && toldToWait.id === 'cabin_wait',
          `Cabin car was not locked on arrival: ${JSON.stringify(toldToWait)}`);
        const tooEarly = story.completeOpeningCall();
        ensure(tooEarly?.ok === false && tooEarly.reason === 'arrival_rest_incomplete',
          `Lou rang before the bed: ${JSON.stringify(tooEarly)}`);
        ensure(story.completeArrivalRest()?.applied === true, 'Cabin arrival rest failed');
        ensure(story.completeOpeningCall()?.firstTime === true, 'Lou opening call failed');
        const unwalked = story.completeMargoCall();
        ensure(unwalked?.ok === false && unwalked.reason === 'explore_first',
          `Margo was dialled before the walks: ${JSON.stringify(unwalked)}`);
        for (const landmark of cabinModule.COUNTRYSIDE_CABIN_LANDMARKS) {
          ensure(story.visit(landmark.id)?.ok === true, `${landmark.id} walk failed`);
        }
        ensure(story.completeMargoCall()?.firstTime === true, 'Margo call failed');
        ensure(story.completeBooskiSasoleCall()?.firstTime === true, 'Booski call failed');
        ensure(story.visitOneComplete() === true, 'visit one did not finish');
        const departure = story.tryLeave();
        ensure(departure?.kind === 'go' && departure.destination === S.AIRSTRIP_SMUGGLING,
          `Cabin refused the airstrip: ${JSON.stringify(departure)}`);
        ensure(campaign.advanceTime(T.DEPART_AIRSTRIP).applied === true,
          'Beef Run departure was not recorded');
        navigate();
        return { ok: true, action: currentStep.action };
      }

      /* BEAT 7. The dungeon, and Booski about Billy at the end of it. */
      if (currentStep.action === 'cabin:visit-two') {
        ensure(story.returnedFromAirstrip() === true,
          'the drive back from the airstrip was not recorded');
        const stillWaiting = story.tryLeave();
        ensure(stillWaiting?.kind === 'stay',
          `Cabin car opened before the dungeon: ${JSON.stringify(stillWaiting)}`);
        ensure(story.completeSecondRest()?.applied === true, 'second cabin night failed');
        ensure(story.completeGratinCall()?.firstTime === true, 'Gratin call failed');
        ensure(story.openCellar()?.ok === true, 'cellar failed');
        ensure(story.enterDungeon()?.ok === true, 'dungeon entry failed');
        for (const id of Object.values(cabinModule.CABIN_HOSTAGE_IDS)) {
          const hostage = story.hostageState(id);
          ensure(story.hitHostage(id, { hits: hostage.threshold })?.ok === true,
            `${id} interrogation failed`);
        }
        ensure(story.learnAteamIntel()?.ok === true, 'A-Team intel failed');
        ensure(story.chooseExecution('player')?.ok === true, 'execution choice failed');
        for (const id of Object.values(cabinModule.CABIN_HOSTAGE_IDS)) {
          story.damageHostage(id, { hits: story.hostageState(id).remaining });
          ensure(story.killHostage(id)?.ok === true, `${id} death failed`);
        }
        const nightfall = story.completeNightfall();
        ensure(nightfall?.day === 3 && nightfall.timeMinutes === 20 * 60 + 45,
          `nightfall missed its authored hour: ${JSON.stringify(nightfall)}`);
        for (const id of Object.values(cabinModule.CABIN_HOSTAGE_IDS)) {
          story.wrapHostage(id);
          story.moveBodyToFire(id);
        }
        story.stageBodies();
        story.pourGas();
        story.igniteBonfire();
        story.completeFireCleanup();
        story.drink();
        const blackout = story.blackout();
        ensure(blackout?.day === 4 && blackout.timeMinutes === 9 * 60 + 30,
          `blackout missed its authored hour: ${JSON.stringify(blackout)}`);
        ensure(story.completeMorningCall()?.ok === true, 'morning call failed');
        ensure(story.completeMorningWake()?.ok === true, 'morning wake failed');
        const beforeBilly = story.tryLeave();
        ensure(beforeBilly?.kind === 'stay',
          `Cabin car opened before Booski rang: ${JSON.stringify(beforeBilly)}`);
        ensure(story.completeBillyCall()?.firstTime === true, 'Billy call failed');
        const departure = story.tryLeave();
        ensure(departure?.kind === 'go' && departure.destination === S.BADA_BING_TWO,
          `Cabin refused the Bing: ${JSON.stringify(departure)}`);
        ensure(campaign.advanceTime(T.DEPART_CABIN_FOR_TOWN).applied === true,
          'cabin departure for town was not recorded');
        ensure(campaign.advanceTime(T.DEPART_BADA_BING_TWO).applied === true,
          'second Bing departure was not recorded');
        navigate();
        return { ok: true, action: currentStep.action };
      }

      throw new Error(`${currentStep.id}: unknown cabin action ${currentStep.action}`);
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
    case 'bing-one-to-squatchfather':
      assertMission(state, MISSION_IDS.BADA_BING_ONE,
        { status: 'complete', packageReceived: true, ending: 'followed' });
      assert.equal(state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE), true);
      assertMission(state, MISSION_IDS.SQUATCHFATHER, { status: 'available' });
      assert.equal(hasItem(state, ITEM_IDS.LOU_PACKAGE), true);
      break;
    case 'squatchfather-to-cabin':
      assertMission(state, MISSION_IDS.SQUATCHFATHER,
        { status: 'complete', weaponStaged: true, weaponDropped: true });
      assert.equal(hasItem(state, ITEM_IDS.LOU_PACKAGE), false);
      /* He arrives in the small hours of Day Two, not at half eleven on Day
       * One: the county road is two hours and twenty minutes of it. */
      assert.equal(state.story.day, 2, 'the drive out must land on Day Two');
      break;
    case 'cabin-to-beefrun':
      assertMission(state, MISSION_IDS.AIRSTRIP_SMUGGLING, { status: 'available' });
      /* Booski's call at the cabin IS the Beef Run authorisation. If it stopped
       * marking the apartment's own event the aeroplane would refuse to start. */
      assert.equal(state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'answered');
      assert.equal(state.events[EVENT_IDS.CABIN_MARGO_CALL].status, 'answered');
      break;
    case 'beefrun-to-cabin':
      assertMission(state, MISSION_IDS.AIRSTRIP_SMUGGLING,
        { status: 'complete', checkpoint: 'landed_home', cargoLoaded: true, landingQuality: 'clean' });
      break;
    case 'cabin-to-bing-two':
      assertMission(state, MISSION_IDS.BADA_BING_TWO, { status: 'available' });
      /* And Booski about Billy IS the come-back-to-the-Bing summons. */
      assert.equal(state.events[EVENT_IDS.LOU_SECOND_CALL].status, 'answered');
      assert.equal(state.events[EVENT_IDS.CABIN_BILLY_CALL].status, 'answered');
      assert.equal(state.story.chapter, 'day_two',
        'the chapter turns on the county road, not in his own bed');
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
    case 'home-to-heist':
      assertMission(state, MISSION_IDS.BANK_HEIST, { status: 'available' });
      /* Day 5, the morning after the Motel. THE TAKE moved here from Day 6
       * when the owner put the job before the reward. */
      assert.equal(state.story.day, 5, 'THE TAKE must leave on Day Five');
      assert.equal(state.story.chapter, 'heist_day');
      break;
    case 'heist-home':
      assertMission(state, MISSION_IDS.BANK_HEIST,
        { status: 'complete', checkpoint: 'vehicle_swap', outcome: 'professional' });
      break;
    case 'home-to-golf':
      assertMission(state, MISSION_IDS.SILVER_PINES, { status: 'available' });
      assertMission(state, MISSION_IDS.BANK_HEIST, { cleanupComplete: true });
      /* Beat 12's call landed the night before, which is what makes the
       * round a reward rather than an errand before a bank job. */
      assert.equal(state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
      assert.equal(state.story.day, 6, 'the round must tee off on Day Six');
      break;
    case 'golf-to-luxury':
      assertMission(state, MISSION_IDS.SILVER_PINES, { status: 'complete', holesPlayed: 3 });
      assert.equal(state.missions[MISSION_IDS.SILVER_PINES].holes.length, 3);
      /* THE STARTER FLAT GOES DARK HERE. The Home Ladder's second rung, and
       * the campaign never routes back to the first one. */
      assert.equal(state.story.chapter, 'luxury_apartment');
      assert.equal(state.story.day, 6);
      break;
    case 'luxury-to-silver-room':
      assertMission(state, MISSION_IDS.SILVER_ROOM, { status: 'available' });
      assert.equal(state.story.day, 6, 'the date is the night of the handover');
      assert.equal(state.story.timeMinutes, 19 * 60 + 30);
      break;
    case 'silver-room-to-luxury':
      assertMission(state, MISSION_IDS.SILVER_ROOM,
        { status: 'complete', outcome: 'perfect', seeingHerAgain: true, cameHome: true });
      break;
    case 'luxury-to-no-wake':
      assertMission(state, MISSION_IDS.NO_WAKE, { status: 'available' });
      /* Beat 18 is the morning after the stayover, and its anchor moved two
       * days with the route. Left on Day 5 it would have been absorbed whole
       * -- an afternoon on a boat that started and finished at 07:14. */
      assert.equal(state.story.day, 7, 'the harbour job must be Day Seven');
      assert.equal(state.story.timeMinutes, 12 * 60 + 45);
      break;
    case 'no-wake-to-luxury':
      assertMission(state, MISSION_IDS.NO_WAKE, {
        status: 'complete', checkpoint: 'returned', betrayalConfirmed: true,
        playerFired: true, bodyDisposed: true,
      });
      break;
    case 'luxury-to-silver-case':
      /* The ledger is exact-once by id, and this flat has four visits with
       * four sets of markers. One spent twice would mean a beat replayed. */
      for (const eventId of [
        TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT,
        TIME_EVENT_IDS.LUXURY_GET_READY,
        TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME,
        TIME_EVENT_IDS.LUXURY_STAYOVER_REST,
        TIME_EVENT_IDS.LUXURY_MARGO_WAKE,
        TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT,
      ]) {
        assert.equal(state.story.timeEvents.filter((id) => id === eventId).length, 1,
          `${eventId} must be exact-once`);
      }
      /* And the Act-One cabin's own rest markers, which this walk spent on
       * Days 2 and 3 and must never have spent again -- the post-heist trip
       * that used to stand between here and the Silver Case is gone. */
      for (const eventId of [
        TIME_EVENT_IDS.CABIN_LAY_LOW_REST,
        TIME_EVENT_IDS.CABIN_SECOND_REST,
      ]) {
        assert.equal(state.story.timeEvents.filter((id) => id === eventId).length, 1,
          `${eventId} must be exact-once`);
      }
      assert.equal(state.events[EVENT_IDS.BOOSKI_SILVER_CASE_CALL].status, 'answered');
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
      assert.deepEqual([state.story.day, state.story.timeMinutes], [9, 18 * 60],
        'Enola must end on Day Nine before the deliberate repair jump');
      break;
    case 'mansion-return-to-palace':
      assertMission(state, MISSION_IDS.MANSION_RETURN, {
        status: 'complete', briefingComplete: true, wrongCityConfirmed: true,
        sauceMissingConfirmed: true, palaceLocationKnown: true,
      });
      assertMission(state, MISSION_IDS.CARTEL_PALACE, { status: 'available' });
      assert.deepEqual([state.story.day, state.story.timeMinutes], [12, 19 * 60 + 15],
        'the repaired-mansion briefing must land on Day Twelve');
      break;
    case 'palace-to-luxury':
      assertMission(state, MISSION_IDS.CARTEL_PALACE, {
        status: 'complete', checkpoint: 'clear', sauceBetrayalConfirmed: true,
        markEliminated: true, sauceEliminated: true, outcome: 'clean',
      });
      assertMission(state, MISSION_IDS.INITIATION, { status: 'available' });
      assert.equal(state.finale.status, 'locked');
      assert.deepEqual([state.story.day, state.story.timeMinutes], [12, 23 * 60],
        'the Palace must extract at eleven on Day Twelve');
      break;
    case 'luxury-to-special-meeting':
      assert.equal(state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status, 'answered');
      assert.equal(state.story.timeEvents.filter(
        (eventId) => eventId === TIME_EVENT_IDS.DEPART_SPECIAL_MEETING,
      ).length, 1, 'Special Meeting departure must be exact-once');
      assertMission(state, MISSION_IDS.INITIATION, { status: 'available' });
      assert.deepEqual([state.story.day, state.story.timeMinutes], [13, 17 * 60 + 55],
        'the Special Meeting pickup must wait for the next evening');
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
      assert.equal(state.story.timeEvents.filter(
        (eventId) => eventId === TIME_EVENT_IDS.DEPART_INITIATION,
      ).length, 1, 'Initiation departure must be exact-once');
      assertMission(state, MISSION_IDS.INITIATION, { status: 'in_progress' });
      assert.equal(state.finale.status, 'locked');
      assert.deepEqual([state.story.day, state.story.timeMinutes], [13, 19 * 60],
        '42 minutes in the car plus 23 at the spur and trail must land at 19:00');
      break;
    case 'initiation-to-finale':
      assertMission(state, MISSION_IDS.INITIATION, { status: 'complete' });
      assert.equal(state.statistics.missionsCompleted, 16,
        "THE PROSPECT'S RECORD must contain every completed campaign mission");
      assert.equal(state.statistics.completedMissionIds.length, 16,
        'the bounded exact-once mission ledger must be full at the finale');
      assert.equal(state.statistics.campaignDaysElapsed, 13);
      assert.equal(state.statistics.cabinExecutionByProspect, true);
      assert.equal(state.statistics.margoCameHome, true);
      assert.ok(state.statistics.peopleKilled >= 2,
        'the walked cabin execution must reach the stored record');
      assert.deepEqual(state.finale, {
        status: 'ready',
        creditsViewed: false,
        freeplayUnlocked: false,
        completedAt: { day: state.story.day, timeMinutes: state.story.timeMinutes },
      });
      assert.equal(state.story.timeEvents.filter(
        (eventId) => eventId === TIME_EVENT_IDS.COMPLETE_INITIATION,
      ).length, 1, 'Initiation completion must be exact-once');
      assert.deepEqual([state.story.day, state.story.timeMinutes], [13, 20 * 60 + 50],
        'the completed ceremony must remain on Day Thirteen');
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

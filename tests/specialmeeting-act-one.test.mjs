/**
 * THE SPECIAL MEETING — ACT ONE, WHICH IS A FLAT AND A TELEPHONE.
 *
 * `tests/specialmeeting-act-one` is the other half of
 * `tests/specialmeeting-script.test.mjs`. That file holds the SCENE to its
 * claims -- every branch ends in the front seat, nobody reassures him, the
 * owner's lines are the owner's. This one holds the FLAT to Act One's, because
 * beats SM-010 to SM-090 do not happen on that scene's page. They happen in
 * the apartment, driven by `src/core/apartment-story.js` and `src/main.js`,
 * and until they were wired they were eight banks of authored dialogue and
 * thirty-odd minted cues that nothing in the game ever asked for.
 *
 * Four things are checked here and each of them was a way to ship silence:
 *
 *   1. THE TRAP. `normalize()` in core/campaign.js force-answers
 *      `BOOSKI_BIG_NIGHT_CALL` for any save whose Initiation is not `locked`,
 *      and finishing the Cartel Palace is exactly what unlocks it. Hang this
 *      scene off that event and the call arrives pre-answered: the phone never
 *      rings, the flat plays the wrong idle bank, and the door opens on a
 *      conversation nobody has had. The evening therefore has an event of its
 *      own, and the whole first section below exists to prove that event is
 *      still pending at the exact moment the trap would have sprung.
 *
 *   2. THE WORDS. SM-030 is thirteen VERBATIM lines. `core/phone.js` builds
 *      cue names out of a call definition's own `lines`/`replies` arrays, so a
 *      mis-paired call puts Tony's answer under Booskibro's cue and neither of
 *      them is saying what the owner wrote any more. The call is derived from
 *      the script rather than copied out of it, and the derivation is checked
 *      against `scriptCues()` line for line and name for name.
 *
 *   3. THE DOOR. Four states in one fixed order -- the call, his own thing,
 *      the wait, the car -- and the order is load-bearing in both directions.
 *      A pastime above the call is a door answering an unanswered telephone
 *      with "you have not played your game yet"; a pastime above the CAR is
 *      the flat making a joke at three men who are already outside.
 *
 *   4. THE SAVE. A shape change with no migration tells every existing player
 *      their save is corrupt -- see the version-seventeen guard in
 *      tests/campaign.test.mjs. Version 19 adds an event, so the v18 path is
 *      walked here, in both directions: a save standing in the flat with the
 *      Palace freshly over still owes the call, and a save already in the car
 *      does not.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { callScript } from '../src/core/phone.js';
import {
  SPECIAL_MEETING_ACT_ONE,
  SPECIAL_MEETING_BOOSKI_CALL,
  apartmentReturnSource,
  chapterPastimes,
  createApartmentStory,
  isSpecialMeetingNight,
} from '../src/core/apartment-story.js';
import { beat, scriptCues } from '../src/specialmeeting/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const manifestByName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));

/* A campaign needs somewhere to write. Same shape the campaign suite uses. */
class MemoryStorage {
  constructor() { this.values = new Map(); }

  getItem(key) { return this.values.get(key) ?? null; }

  setItem(key, value) { this.values.set(key, String(value)); }

  removeItem(key) { this.values.delete(key); }
}

/** The four chores, all done. Nothing after Day One counts them anyway. */
const CHORES_DONE = Object.freeze({
  eaten: true, showered: true, peed: true, pooped: true, changedClothes: true,
});

/** The big night's two pastimes, done, so the door is past them. */
const PASTIMES_DONE = Object.fromEntries(
  chapterPastimes().big_night.map((item) => [item.id, true]),
);

/**
 * The save exactly as it is the moment he lets himself back in.
 *
 * The Palace played and finished, the Initiation unlocked behind it (which is
 * what `CartelPalaceCampaignStory.complete()` does), the chapter turned to
 * `big_night` (which is also what it does, and is why the Palace rather than
 * the chapter is what tells these two nights apart), and Tony standing at his
 * own front door. Written through `update` so it goes through `normalize` on
 * the way to disk, which is the whole point of the first test below.
 */
function homeFromThePalace({ storage = new MemoryStorage(), ...overrides } = {}) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'big_night';
    state.story.day = 6;
    state.story.timeMinutes = 23 * 60 + 10;
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.missions[MISSION_IDS.CARTEL_PALACE].status = 'complete';
    state.missions[MISSION_IDS.CARTEL_PALACE].checkpoint = 'clear';
    state.missions[MISSION_IDS.CARTEL_PALACE].sauceBetrayalConfirmed = true;
    state.missions[MISSION_IDS.CARTEL_PALACE].markEliminated = true;
    state.missions[MISSION_IDS.CARTEL_PALACE].sauceEliminated = true;
    state.missions[MISSION_IDS.INITIATION].status = 'available';
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    Object.assign(state.missions[MISSION_IDS.CARTEL_PALACE], overrides.palace ?? {});
    Object.assign(state.missions[MISSION_IDS.INITIATION], overrides.initiation ?? {});
  });
  return campaign;
}

const storyFor = (campaign) => createApartmentStory({ campaign, ring: () => true });

/* ====================================================================== *
 * 1. THE TRAP
 * ====================================================================== */

test('finishing the Palace does not answer a call nobody has made yet', () => {
  const storage = new MemoryStorage();
  homeFromThePalace({ storage });

  /* Reloaded, so `normalize()` has had its say. This is the assertion the
   * whole event id exists for: the big-night call comes back answered because
   * the Initiation is unlocked, and the Special Meeting's does not, because
   * nothing about an unlocked Initiation is evidence that Booskibro rang. */
  const state = createCampaign({ storage }).state;
  assert.equal(state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered',
    'the grandfathered inference has been tightened and the old saves have lost their route');
  assert.equal(state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status, 'pending',
    'the Special Meeting call arrived pre-answered — its phone will never ring');
  assert.notEqual(
    EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL,
    EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
    'the two calls share an id again, which is the trap',
  );
});

test('the phone that rings on this night is the Special Meeting’s', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);
  assert.equal(story.pendingCall(), SPECIAL_MEETING_BOOSKI_CALL);

  assert.equal(story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL), true);
  assert.equal(story.pendingCall(), null, 'it rings once and then it is over');
  assert.equal(
    campaign.state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status,
    'answered',
  );
});

test('answering it moves nothing, because the call itself moved nothing', () => {
  const campaign = homeFromThePalace();
  const before = {
    initiation: campaign.state.missions[MISSION_IDS.INITIATION].status,
    day: campaign.state.story.day,
    minutes: campaign.state.story.timeMinutes,
  };
  storyFor(campaign).callAnswered(SPECIAL_MEETING_BOOSKI_CALL);
  const after = campaign.state;

  assert.equal(after.missions[MISSION_IDS.INITIATION].status, before.initiation,
    'Booskibro unlocked something by refusing to say where he was sending a car');
  /* Zero on the clock, and on purpose: DEPART_SPECIAL_MEETING already folds
   * the call, changing, decompression and going downstairs into the Day 13
   * pickup anchor. See its note in core/campaign.js. */
  assert.equal(after.story.day, before.day);
  assert.equal(after.story.timeMinutes, before.minutes,
    'the call was billed twice — once here and once in DEPART_SPECIAL_MEETING');
  assert.ok(after.story.timeEvents.includes(TIME_EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL),
    'nothing recorded that he took it, so a reload will ring him again');
});

/* ====================================================================== *
 * 2. THE WORDS
 * ====================================================================== */

test('the call in the flat is SM-030, line for line and cue for cue', () => {
  const turns = callScript(SPECIAL_MEETING_BOOSKI_CALL);
  const authored = scriptCues().filter((cue) => cue.beat === 'SM-030');

  assert.equal(authored.length, 13, 'SM-030 is thirteen lines and all of them are the owner’s');
  assert.deepEqual(
    turns.map((turn) => ({ cue: turn.cue, text: turn.text })),
    authored.map((cue) => ({ cue: cue.name, text: cue.say })),
    'the flat is asking for cues the script never minted, or saying words it never wrote',
  );
  assert.equal(authored.every((cue) => cue.verbatim), true,
    'a line of this call stopped being marked verbatim');

  /* Booskibro hangs up first, mid-air, without waiting. He does not say
   * goodbye. The shape of that in a call definition is a caller line with no
   * reply under it, and it has to be the LAST one. */
  const { lines, replies } = SPECIAL_MEETING_BOOSKI_CALL;
  assert.equal(lines.length, 7);
  assert.equal(replies.length, 7);
  assert.equal(replies.at(-1), null, 'Tony got the last word in a call that ends on a click');
  assert.equal(replies.slice(0, -1).every((reply) => typeof reply === 'string' && reply), true);
  assert.equal(lines.at(-1), "It's a meeting, Prospect. Put on something decent.");
});

test('the call has its own bank and does not overwrite the big night’s', () => {
  assert.equal(SPECIAL_MEETING_BOOSKI_CALL.vo, 'call.booski.special_meeting');
  assert.equal(SPECIAL_MEETING_BOOSKI_CALL.targetSceneId, SCENE_IDS.SPECIAL_MEETING,
    'this call sends him downstairs, not to the ceremony');
  for (const turn of callScript(SPECIAL_MEETING_BOOSKI_CALL)) {
    assert.equal(turn.cue.startsWith('vo.call.booski.special_meeting.'), true, turn.cue);
    assert.equal(turn.cue.includes('bignight'), false,
      'a delivered take of the warm call is about to be recorded over');
  }
});

test('every line Act One speaks has a manifest cue that says the same words', () => {
  const missing = [];
  const wrong = [];
  const takes = [
    ...Object.values(SPECIAL_MEETING_ACT_ONE).flat(),
    ...callScript(SPECIAL_MEETING_BOOSKI_CALL).map((turn) => ({
      cue: turn.cue, text: turn.text,
    })),
  ];
  assert.ok(takes.length >= 40, 'Act One has lost banks somewhere between here and the script');

  for (const take of takes) {
    const cue = manifestByName.get(take.cue);
    if (!cue) { missing.push(take.cue); continue; }
    if (cue.say !== take.text) wrong.push(`${take.cue}: "${cue.say}" ≠ "${take.text}"`);
  }
  assert.deepEqual(missing, [], 'these lines play as silence — no cue exists to record');
  assert.deepEqual(wrong, [], 'the manifest and the script disagree about what he says');
});

test('the flat plays the beats it was handed, in the script’s own order', () => {
  const expected = {
    idleBefore: 'SM-010',
    deadLine: 'SM-040',
    callBack: 'SM-050',
    idleAfter: 'SM-060',
    gettingReady: 'SM-070',
    doorRefusals: 'SM-080',
    headlights: 'SM-090',
  };
  assert.deepEqual(Object.keys(SPECIAL_MEETING_ACT_ONE), Object.keys(expected),
    'a bank was added or dropped without the runtime in src/main.js being told');

  for (const [bank, beatId] of Object.entries(expected)) {
    const authored = beat(beatId).lines.filter((line) => line.spoken);
    assert.deepEqual(
      SPECIAL_MEETING_ACT_ONE[bank].map((take) => [take.text, take.cue]),
      authored.map((line) => [line.text, line.cue]),
      `${bank} is not ${beatId}`,
    );
  }
  /* SM-070's four lines are staged at fittings this flat does not own -- there
   * is no mirror in the build and the wardrobe is a nightstand drawer -- so
   * main.js reads `where` to decide what the drawer says. Losing it would cost
   * nothing loudly and the wrong line quietly. */
  assert.deepEqual(
    SPECIAL_MEETING_ACT_ONE.gettingReady.map((take) => take.where),
    ['wardrobe', 'mirror', 'mirror', 'mirror'],
  );
});

/* ====================================================================== *
 * 3. THE DOOR
 * ====================================================================== */

test('the door: the call, his own thing, the wait, and then the car', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);

  const waitingOnBooski = story.tryLeave({ ...CHORES_DONE, ...PASTIMES_DONE });
  assert.equal(waitingOnBooski.kind, 'call');
  assert.equal(waitingOnBooski.id, EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL);
  assert.ok(waitingOnBooski.line, 'the door refused and said nothing');
  assert.equal(waitingOnBooski.takes.length, 1,
    'the pre-call door has one line and it is the only one that fits an hour '
    + 'in which nobody has told him anything');
  assert.equal(waitingOnBooski.takes[0].text, "Nobody's rung. Nobody's rung all day.");

  story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL);

  /* Now his own thing, in order, exactly as every other chapter's works. */
  for (const item of chapterPastimes().big_night) {
    const done = Object.fromEntries(
      chapterPastimes().big_night
        .slice(0, chapterPastimes().big_night.indexOf(item))
        .map((prior) => [prior.id, true]),
    );
    const refusal = story.tryLeave({ ...CHORES_DONE, ...done });
    assert.equal(refusal.kind, 'activity');
    assert.equal(refusal.id, item.id);
  }

  const waiting = story.tryLeave({ ...CHORES_DONE, ...PASTIMES_DONE });
  assert.equal(waiting.kind, 'wait', 'the flat has nothing left to ask and let him walk out');
  assert.equal(waiting.id, 'special_meeting_car');
  assert.equal(waiting.takes.length, 3);

  const going = story.tryLeave({ ...CHORES_DONE, ...PASTIMES_DONE, carOutside: true });
  assert.deepEqual(going, { kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING });
});

test('headlights end the pastimes — nobody keeps three men waiting to finish a game', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);
  story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL);

  /* Nothing of his own done, and the car outside. Every OTHER chapter would
   * answer this with the pastime, because in every other chapter the pastime
   * sits between him and the door. Here it sits between him and the CAR, and
   * the car has arrived. */
  const going = story.tryLeave({ ...CHORES_DONE, carOutside: true });
  assert.deepEqual(going, { kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING },
    'the door offered him a video game while a car idled outside with three men in it');
});

test('the door says three different things while he waits, each with its own cue', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);
  story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL);
  const { takes } = story.tryLeave({ ...CHORES_DONE, ...PASTIMES_DONE });

  /* Three sentences, not three readings of one. src/main.js walks them by how
   * many times he has tried the handle so the subtitle and the recording are
   * always the same line -- which only works if each take carries its own cue.
   */
  assert.deepEqual(takes.map((take) => take.text), [
    "No. He said they're coming here. I'm not walking out on that.",
    "They're picking me up. If I'm not in when they get here, that's on me.",
    "I don't know where it is. That's rather the point.",
  ]);
  assert.deepEqual(new Set(takes.map((take) => take.cue)).size, 3,
    'two of the refusals share a cue, so one of them can never be heard');
  for (const take of takes) {
    assert.equal(manifestByName.get(take.cue)?.say, take.text, take.cue);
  }
});

test('nothing at this door, or on this panel, names what he is going to', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);
  story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL);

  const said = [
    ...story.objectives({ ...CHORES_DONE }).items.map((item) => item.label),
    ...story.objectives({ ...CHORES_DONE, ...PASTIMES_DONE }).items.map((item) => item.label),
    ...story.objectives({ ...CHORES_DONE, ...PASTIMES_DONE, carOutside: true })
      .items.map((item) => item.label),
    ...SPECIAL_MEETING_ACT_ONE.doorRefusals.map((take) => take.text),
  ].join(' | ').toLowerCase();

  /* docs/SPECIAL-MEETING-SCRIPT.md's forbidden list is a rule about the HUD as
   * much as about the cast: nobody names the ceremony, the fire, the Circle,
   * the founders or the word initiation before the trees open at SM-560. */
  for (const forbidden of ['initiation', 'ceremony', 'the circle', 'founders', 'special meeting']) {
    assert.equal(said.includes(forbidden), false, `the flat said "${forbidden}" out loud`);
  }
  // And nothing tells him he is safe, which is the other half of the same rule.
  for (const forbidden of ['don’t worry', 'nothing will happen', 'you’re fine', 'nice surprise']) {
    assert.equal(said.includes(forbidden), false, `the flat reassured him: "${forbidden}"`);
  }
});

test('the morning list names the right telephone and then the car', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);

  const owed = story.objectives({ ...CHORES_DONE }).items;
  const callRow = owed.find((item) => item.id === EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL);
  assert.ok(callRow, 'the panel is waiting on the big night’s call, which cannot ring tonight');
  assert.equal(callRow.done, false);
  assert.match(callRow.label, /Booskibro/);
  assert.equal(owed.some((item) => item.id === EVENT_IDS.BOOSKI_BIG_NIGHT_CALL), false);

  story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL);
  const answered = story.objectives({ ...CHORES_DONE }).items;
  assert.equal(
    answered.find((item) => item.id === EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL).done,
    true,
  );

  const waiting = story.objectives({ ...CHORES_DONE, ...PASTIMES_DONE }).items;
  const waitRow = waiting.find((item) => item.id === 'special_meeting_car');
  assert.ok(waitRow, 'a man with nothing left to do was given nothing to look at either');
  assert.equal(waitRow.label, 'Wait in for Seff, Lag and Numbskull');
  assert.notEqual(waitRow.label, 'Sleep',
    'the wait is rendering as a sleep gate, which is a different night entirely');

  const leaving = story.objectives({ ...CHORES_DONE, ...PASTIMES_DONE, carOutside: true }).items;
  assert.equal(
    leaving.some((item) => item.label === 'Leave for the car downstairs'),
    true,
  );
});

test('the panel stops calling his own thing required once the car is outside', () => {
  const campaign = homeFromThePalace();
  const story = storyFor(campaign);
  story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL);
  const ids = chapterPastimes().big_night.map((item) => item.id);

  const waiting = story.objectives({ ...CHORES_DONE }).items;
  for (const id of ids) {
    assert.equal(waiting.find((item) => item.id === id).required, true,
      `${id}: the door is gating on this and the panel says it is optional`);
  }

  /* And once there is a car at the kerb the door is not gating on them any
   * more, so the panel must not claim it is. A checklist that lies about what
   * is mandatory is worse than no checklist -- the rule `routineRequired` in
   * core/apartment-story.js was written for. */
  const arrived = story.objectives({ ...CHORES_DONE, carOutside: true }).items;
  for (const id of ids) {
    const row = arrived.find((item) => item.id === id);
    assert.ok(row, `${id}: dropped off the panel rather than merely un-required`);
    assert.equal(row.done, false);
    assert.equal(row.required, false,
      `${id}: still marked required with three men idling outside`);
  }
});

/* ====================================================================== *
 * 4. WHICH NIGHT THIS IS
 * ====================================================================== */

test('a grandfathered big night is still the old big night', () => {
  /* A save that reached the Initiation before the final arc existed carries
   * `grandfathered: true` on every mission it never played, the Palace
   * included. Those players have Booskibro's warm call already answered and a
   * door that opens on the ceremony, and this scene must not take that off
   * them by mistaking a migration marker for an evening. */
  const campaign = homeFromThePalace({ palace: { grandfathered: true } });
  assert.equal(isSpecialMeetingNight(campaign.state), false);

  const story = storyFor(campaign);
  assert.equal(story.pendingCall(), null, 'the grandfathered call is answered, so nothing rings');
  assert.deepEqual(story.tryLeave({ ...CHORES_DONE, ...PASTIMES_DONE }), {
    kind: 'go', destination: SCENE_IDS.INITIATION,
  });
});

test('the flat stops asking once the Initiation is over', () => {
  /* The campaign's last landing is back in this flat. A door that kept asking
   * a finished player to wait in for a car would be a trap with the credits
   * already rolled. */
  const campaign = homeFromThePalace({ initiation: { status: 'complete' } });
  assert.equal(isSpecialMeetingNight(campaign.state), false);
});

test('it is not the Special Meeting on any night but this one', () => {
  const fresh = createCampaign({ storage: new MemoryStorage() });
  assert.equal(isSpecialMeetingNight(fresh.state), false, 'Day One is the Special Meeting');

  const wrongChapter = homeFromThePalace();
  wrongChapter.update((state) => { state.story.chapter = 'post_heist'; });
  assert.equal(isSpecialMeetingNight(wrongChapter.state), false);

  const noPalace = createCampaign({ storage: new MemoryStorage() });
  noPalace.update((state) => { state.story.chapter = 'big_night'; });
  assert.equal(isSpecialMeetingNight(noPalace.state), false,
    'a big night with no Palace behind it is the grandfathered one');
});

test('coming home from the Palace reads as coming home from the Palace', () => {
  /* Mission completion accumulates, so this list has to prefer the NEWEST
   * beat. Before the Palace was on it, a man letting himself in the night
   * Sauce was dealt with was told he was back from THE TAKE. */
  const campaign = homeFromThePalace();
  campaign.update((state) => {
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  assert.equal(apartmentReturnSource(campaign.state), SCENE_IDS.CARTEL_PALACE);
});

/* ====================================================================== *
 * 5. THE ROUTE, AND THE SAVE
 * ====================================================================== */

test('the graph routes the Palace through the luxury-apartment call', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  campaign.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });
  assert.doesNotThrow(() => campaign.transition(SCENE_IDS.LUXURY_APARTMENT, { spawn: 'main' }),
    'the Palace cannot send him to the home he owns, so Beat 27 is unreachable');
  assert.doesNotThrow(() => campaign.transition(SCENE_IDS.SPECIAL_MEETING, { spawn: 'kerb' }),
    'the private lift cannot reach the kerb, so Act One has no way out');
  assert.doesNotThrow(() => campaign.transition(SCENE_IDS.INITIATION, { spawn: 'gathering' }));

  /* And both bypasses stay pulled: Palace cannot skip the luxury-home
   * first act or the Special Meeting itself. */
  const direct = createCampaign({ storage: new MemoryStorage() });
  direct.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });
  assert.throws(
    () => direct.transition(SCENE_IDS.SPECIAL_MEETING, { spawn: 'kerb' }),
    /Cannot transition from "cartel_palace" to "special_meeting"/,
  );

  const legacy = createCampaign({ storage: new MemoryStorage() });
  legacy.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });
  assert.throws(
    () => legacy.transition(SCENE_IDS.INITIATION, { spawn: 'gathering' }),
    /Cannot transition from "cartel_palace" to "initiation"/,
  );
});

test('a version eighteen save gains the call without being called corrupt', () => {
  /* The same guard as the pastimes one in tests/campaign.test.mjs, and for the
   * same reason: `normalize()` rebuilds `events` from the base object's keys,
   * so a v18 save with no migration comes back carrying a field it did not
   * have on disk, and `structurallyBroken` in `readSave()` announces every
   * existing save in the world to its owner as recovered. */
  const storage = new MemoryStorage();
  const before = homeFromThePalace().state;
  before.version = 18;
  delete before.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL];
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(before));

  const campaign = createCampaign({ storage });
  assert.equal(campaign.recoveredNow, false,
    'an existing save was reported to the player as recovered by a schema bump');
  assert.equal(campaign.recovery, null);
  assert.equal(campaign.state.version, CAMPAIGN_VERSION);
  assert.equal(JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY)).version, CAMPAIGN_VERSION);

  /* And it lands PENDING, because this save is the exact player the beat was
   * written for: standing in his own flat with the Palace freshly over and
   * nobody having rung him. Answering it on his behalf would delete the scene. */
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status, 'pending');
  assert.equal(isSpecialMeetingNight(campaign.state), true);
});

test('a version eighteen save already in the car does not get rung again', () => {
  for (const scene of [
    { id: SCENE_IDS.SPECIAL_MEETING, spawn: 'spur' },
    { id: SCENE_IDS.INITIATION, spawn: 'gathering' },
  ]) {
    const storage = new MemoryStorage();
    const before = homeFromThePalace().state;
    before.version = 18;
    before.scene = scene;
    before.missions[MISSION_IDS.INITIATION].status = 'in_progress';
    delete before.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL];
    storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(before));

    const campaign = createCampaign({ storage });
    assert.equal(campaign.recoveredNow, false, scene.id);
    assert.equal(
      campaign.state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status,
      'answered',
      `${scene.id}: a finished evening left a telephone ringing in an empty flat`,
    );
  }
});

test('the answered call survives a reload, so the evening never restarts', () => {
  const storage = new MemoryStorage();
  const campaign = homeFromThePalace({ storage });
  storyFor(campaign).callAnswered(SPECIAL_MEETING_BOOSKI_CALL);

  const reloaded = createCampaign({ storage });
  assert.equal(
    reloaded.state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status,
    'answered',
  );
  assert.equal(storyFor(reloaded).pendingCall(), null);
  const door = storyFor(reloaded).tryLeave({ ...CHORES_DONE, ...PASTIMES_DONE });
  assert.equal(door.kind, 'wait', 'a reload put him back in front of the telephone');
});

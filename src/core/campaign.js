import {
  getPreviewRuntime,
  installPreviewNotice,
  previewNavigationHref,
} from './preview-mode.js';

/**
 * Stable IDs shared by every scene. Display names and voice-provider aliases
 * belong in character data; story state only uses these IDs.
 */
export const CHARACTER_IDS = Object.freeze({
  PROSPECT: 'prospect',
  LOU: 'lou',
  CAPTAIN_LOU_SASOLE: 'captain_lou_sasole',
  BOOSKI: 'booski',
  APE: 'ape',
  MARGO: 'margo',
  /* The rest of the Family, per the locked ledger (docs/VOICE-CASTING.md).
   * One stable id per person: the Sasole at a Bing table is the Sasole of
   * the Beef Run, and these ids are what every scene keys face, voice and
   * dialogue ownership from. Display names live with character data. */
  LAG: 'lag',
  GRATIN: 'gratin',
  ERIC: 'eric',
  HOG_MAMA: 'hogmama',
  DEATHMEGATRON: 'deathmegatron',
  WILLY: 'willy',
  IRISH: 'irish',
  OLD_STOVE: 'old_stove',
  SNOW: 'snow',
  RIPPINFLOW: 'rippinflow',
  SEFF: 'seff',
  SHUBENATOR: 'shubenator',
  NUMBSKULL: 'numbskull',
});

export const SCENE_IDS = Object.freeze({
  APARTMENT: 'apartment',
  BADA_BING_ONE: 'bada_bing_one',
  SQUATCHFATHER: 'squatchfather',
  AIRSTRIP_SMUGGLING: 'airstrip_smuggling',
  BADA_BING_TWO: 'bada_bing_two',
  JERKY_MOTEL: 'jerky_motel',
  NO_WAKE: 'no_wake',
  SILVER_ROOM: 'silver_room',
  INITIATION: 'initiation',
});

export const ITEM_IDS = Object.freeze({
  LOU_PACKAGE: 'parcel',
  /* Once he has picked it up off the nightstand he has it for good, in every
   * scene and across every save. It is not a possession, it is how the rest of
   * the cast reaches him -- a campaign where the phone can be left on a table
   * is a campaign where Lou rings an empty room. Carried, never concealed.
   */
  PHONE: 'phone',
});

export const MISSION_IDS = Object.freeze({
  BADA_BING_ONE: 'bada_bing_one',
  SQUATCHFATHER: 'squatchfather',
  AIRSTRIP_SMUGGLING: 'airstrip_smuggling',
  BADA_BING_TWO: 'bada_bing_two',
  JERKY_MOTEL: 'jerky_motel',
  NO_WAKE: 'no_wake',
  SILVER_ROOM: 'silver_room',
  INITIATION: 'initiation',
});

export const EVENT_IDS = Object.freeze({
  LOU_FIRST_CALL: 'lou_first_call',
  /* The one call that asks nothing of him. Lou rings the night the
   * Squatchfather business is settled to say well done without once saying
   * what for -- so it is deliberately not a gate: the door does not wait for
   * it, sleeping does not wait for it, and missing it costs nothing but the
   * only kind words anybody in this family says out loud. */
  LOU_ATTABOY_CALL: 'lou_attaboy_call',
  BOOSKI_DAY_TWO_CALL: 'booski_day_two_call',
  LOU_SECOND_CALL: 'lou_second_call',
  LOU_NO_WAKE_CALL: 'lou_no_wake_call',
  MARGO_DATE_CALL: 'margo_date_call',
  BOOSKI_BIG_NIGHT_CALL: 'booski_big_night_call',
});

export const TIME_EVENT_IDS = Object.freeze({
  EAT: 'activity.eat',
  SHOWER: 'activity.shower',
  POOP: 'activity.poop',
  CHANGE_CLOTHES: 'activity.change_clothes',
  CHECK_EMAIL: 'activity.check_email',
  /* Standing at the sideboard listening to what landed while he was out. One
   * per chapter, because there is one message per chapter and a man does not
   * hear yesterday's twice. Registered as time events rather than as a new
   * field on the save so the state SHAPE does not move -- an added field makes
   * every existing save normalise differently, which the loader would report
   * to the player as a recovered save. */
  HEAR_MESSAGES_DAY_TWO: 'activity.messages.day_two',
  HEAR_MESSAGES_DATE: 'activity.messages.date',
  HEAR_MESSAGES_BIG_NIGHT: 'activity.messages.big_night',
  /* Phone read markers have no clock cost. They deliberately live in the
   * existing time-event ledger so a phone rebuilt in another scene retains
   * its unread state without a second browser-only save. */
  PHONE_READ_FAMILY: 'phone.read.family',
  PHONE_READ_LOU: 'phone.read.lou',
  PHONE_READ_MUM: 'phone.read.mum',
  /** Margo waking up beside him on the fourth morning, and leaving. */
  MARGO_WAKE: 'scene.margo_wake',
  LOU_FIRST_CALL: 'call.lou_first',
  LOU_ATTABOY_CALL: 'call.lou_attaboy',
  BOOSKI_DAY_TWO_CALL: 'call.booski_day_two',
  LOU_SECOND_CALL: 'call.lou_second',
  LOU_NO_WAKE_CALL: 'call.lou_no_wake',
  MARGO_DATE_CALL: 'call.margo_date',
  BOOSKI_BIG_NIGHT_CALL: 'call.booski_big_night',
  DEPART_BADA_BING_ONE: 'travel.bada_bing_one',
  /* Coming home from the restaurant. The Squatchfather scene keeps no clock of
   * its own -- it is deliberately frozen -- so the return leg is what puts the
   * hour on it, and it is applied by the apartment on arrival. Without it he
   * walked back in at the same 11:41 PM he left at, which is why the bed felt
   * like it was refusing him: the flat still thought he had just got up. */
  COMPLETE_SQUATCHFATHER: 'mission.squatchfather',
  DEPART_AIRSTRIP: 'travel.airstrip',
  COMPLETE_AIRSTRIP: 'mission.airstrip',
  DEPART_BADA_BING_TWO: 'travel.bada_bing_two',
  COMPLETE_BADA_BING_TWO: 'mission.bada_bing_two',
  DEPART_JERKY_MOTEL: 'travel.jerky_motel',
  COMPLETE_JERKY_MOTEL: 'mission.jerky_motel',
  DEPART_NO_WAKE: 'travel.no_wake',
  COMPLETE_NO_WAKE: 'mission.no_wake',
  DEPART_SILVER_ROOM: 'travel.silver_room',
  COMPLETE_SILVER_ROOM: 'mission.silver_room',
  DEPART_INITIATION: 'travel.initiation',
});

const TIME_EVENTS = Object.freeze({
  [TIME_EVENT_IDS.EAT]: Object.freeze({ minutes: 20 }),
  [TIME_EVENT_IDS.SHOWER]: Object.freeze({ minutes: 15 }),
  [TIME_EVENT_IDS.POOP]: Object.freeze({ minutes: 10 }),
  [TIME_EVENT_IDS.CHANGE_CLOTHES]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.CHECK_EMAIL]: Object.freeze({ minutes: 10 }),
  [TIME_EVENT_IDS.HEAR_MESSAGES_DAY_TWO]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.HEAR_MESSAGES_DATE]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.PHONE_READ_FAMILY]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.PHONE_READ_LOU]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.PHONE_READ_MUM]: Object.freeze({ minutes: 0 }),
  /* Costs nothing on the clock. This one is a marker rather than an errand:
   * the big night's morning is an authored ten o'clock checkpoint and the
   * ceremony is an authored seven, and putting a quarter of an hour between
   * them buys the story nothing while moving two pinned times. She wakes him
   * at ten and it is still ten when she goes, which is also how the morning
   * after actually plays. */
  [TIME_EVENT_IDS.MARGO_WAKE]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.LOU_FIRST_CALL]: Object.freeze({ minutes: 3 }),
  // Shorter than the rest. Lou is not asking for anything, so it is short.
  [TIME_EVENT_IDS.LOU_ATTABOY_CALL]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.BOOSKI_DAY_TWO_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.LOU_SECOND_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.LOU_NO_WAKE_CALL]: Object.freeze({ minutes: 4 }),
  [TIME_EVENT_IDS.MARGO_DATE_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.DEPART_BADA_BING_ONE]: Object.freeze({
    atLeast: Object.freeze({ day: 1, timeMinutes: 23 * 60 + 41 }),
  }),
  /* The restaurant, the walk away from it and the drive back. He lets himself
   * in at three in the morning of the night Day One runs into: still Day One's
   * chapter, on the second calendar day, exactly as the Motel already does at
   * half four. Sleeping from here is what turns the page. */
  [TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 3 * 60 }),
  }),
  // "Whispering Pines Municipal, ten past nine." The drive out to the field.
  [TIME_EVENT_IDS.DEPART_AIRSTRIP]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 9 * 60 + 10 }),
  }),
  // The return leg is flown at dusk; the mission ends after dark.
  [TIME_EVENT_IDS.COMPLETE_AIRSTRIP]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 20 * 60 + 30 }),
  }),
  // The club again, late the same evening Lou calls him back in.
  [TIME_EVENT_IDS.DEPART_BADA_BING_TWO]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 23 * 60 }),
  }),
  // Lou's assignment lands after the club crosses midnight.
  [TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 45 }),
  }),
  // The drive out to the Motel, straight from the club.
  [TIME_EVENT_IDS.DEPART_JERKY_MOTEL]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 60 + 30 }),
  }),
  // Deal, betrayal, recovery, and the getaway end before dawn.
  [TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 4 * 60 + 30 }),
  }),
  // A deliberately vague call, then the drive down to South Harbor.
  [TIME_EVENT_IDS.DEPART_NO_WAKE]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 12 * 60 + 45 }),
  }),
  // Dock work, the run offshore, and the silent return consume the afternoon.
  [TIME_EVENT_IDS.COMPLETE_NO_WAKE]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 16 * 60 + 40 }),
  }),
  /* Day 3 is the calm before the verdict. He wakes at noon off the back of the
   * Motel, Margo rings in the afternoon, and he leaves at half seven for a
   * nine o'clock table -- the Silver Room's own evening. */
  [TIME_EVENT_IDS.DEPART_SILVER_ROOM]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 19 * 60 + 30 }),
  }),
  // Dinner, a set by the Midnight Pines, and the walk out the front.
  [TIME_EVENT_IDS.COMPLETE_SILVER_ROOM]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 23 * 60 + 20 }),
  }),
  /* The big night is the day after the date. Sleeping off the Silver Room is
   * what turns the page, so the ceremony lands on Day 4 at seven sharp. */
  [TIME_EVENT_IDS.DEPART_INITIATION]: Object.freeze({
    atLeast: Object.freeze({ day: 4, timeMinutes: 19 * 60 }),
  }),
});
const MINUTES_PER_DAY = 24 * 60;

export const CAMPAIGN_VERSION = 5;
export const CAMPAIGN_STORAGE_KEY = 'squatchlife.campaign';
export const CAMPAIGN_RECOVERY_KEY = `${CAMPAIGN_STORAGE_KEY}.recovery`;

const SCENES = Object.freeze({
  [SCENE_IDS.APARTMENT]: Object.freeze({
    href: 'index.html',
    defaultSpawn: 'wake',
    spawns: Object.freeze(['wake', 'front_door', 'motel_retry']),
    next: Object.freeze([
      SCENE_IDS.BADA_BING_ONE,
      SCENE_IDS.SQUATCHFATHER,
      SCENE_IDS.AIRSTRIP_SMUGGLING,
      SCENE_IDS.BADA_BING_TWO,
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.INITIATION,
    ]),
  }),
  [SCENE_IDS.BADA_BING_ONE]: Object.freeze({
    href: 'bing.html',
    defaultSpawn: 'driver_seat',
    spawns: Object.freeze(['driver_seat', 'club_entrance']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.SQUATCHFATHER]: Object.freeze({
    href: 'squatchfather.html',
    defaultSpawn: 'restaurant_exterior',
    spawns: Object.freeze(['restaurant_exterior', 'development_entry']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: Object.freeze({
    href: 'beefrun.html',
    defaultSpawn: 'hangar',
    spawns: Object.freeze(['hangar']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.BADA_BING_TWO]: Object.freeze({
    href: 'bing.html?visit=2',
    defaultSpawn: 'driver_seat',
    spawns: Object.freeze(['driver_seat', 'club_entrance']),
    next: Object.freeze([SCENE_IDS.JERKY_MOTEL]),
  }),
  [SCENE_IDS.JERKY_MOTEL]: Object.freeze({
    href: 'motel.html',
    defaultSpawn: 'passenger_seat',
    spawns: Object.freeze(['passenger_seat']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.NO_WAKE]: Object.freeze({
    href: 'nowake.html',
    defaultSpawn: 'gate_c',
    spawns: Object.freeze(['gate_c']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  /* The date. One continuous scene with no loads of its own, so it has a single
   * spawn on the pavement where the hired car drops them, and it comes home the
   * way every other mission does. */
  [SCENE_IDS.SILVER_ROOM]: Object.freeze({
    href: 'silver.html',
    defaultSpawn: 'kerb',
    spawns: Object.freeze(['kerb']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  /* The Initiation is registered so the apartment door can route to it through
   * ordinary campaign state. The scene itself is deliberately untouched: it
   * does not read the campaign, claim the scene, or report completion yet, so
   * it has no outbound edge and nothing here waits on one. */
  [SCENE_IDS.INITIATION]: Object.freeze({
    href: 'initiation.html',
    defaultSpawn: 'gathering',
    spawns: Object.freeze(['gathering']),
    next: Object.freeze([]),
  }),
});

function normalizedSpawn(sceneId, spawn) {
  const scene = SCENES[sceneId];
  return scene?.spawns.includes(spawn) ? spawn : scene?.defaultSpawn;
}

function requiredSpawn(sceneId, spawn) {
  const scene = SCENES[sceneId];
  const requested = spawn ?? scene?.defaultSpawn;
  if (!scene?.spawns.includes(requested)) {
    throw new Error(`Unknown spawn "${requested}" for scene "${sceneId}"`);
  }
  return requested;
}

function initialState() {
  return {
    version: CAMPAIGN_VERSION,
    revision: 0,
    scene: {
      id: SCENE_IDS.APARTMENT,
      spawn: 'wake',
    },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 6 * 60 + 4,
      meetingKnown: false,
      meetingLearnedFrom: null,
      timeEvents: [],
    },
    activities: {
      eaten: false,
      showered: false,
      pooped: false,
      changedClothes: false,
      emailChecked: false,
      whiskeyRelaxed: false,
    },
    /* One station, several physical receivers. The station's running order is
     * shared so changing scenes does not rewind the same jokes and records;
     * receiver power is separate because switching off the car radio should
     * not switch off the set in the apartment. Bulletin history lives here as
     * story continuity rather than page memory. */
    radio: {
      volume: 0.70,
      cursor: 0,
      cycle: 0,
      selections: {},
      songReactionCursor: 0,
      adReactionCursor: 0,
      heardBulletins: [],
      receivers: {},
    },
    inventory: {
      carried: [],
      concealed: [],
    },
    missions: {
      [MISSION_IDS.BADA_BING_ONE]: {
        status: 'locked',
        packageReceived: false,
        ending: null,
      },
      [MISSION_IDS.SQUATCHFATHER]: {
        status: 'locked',
        weaponStaged: false,
        weaponDropped: false,
      },
      [MISSION_IDS.AIRSTRIP_SMUGGLING]: {
        status: 'locked',
        checkpoint: null,
        cargoLoaded: false,
        detected: false,
        landingQuality: null,
      },
      [MISSION_IDS.BADA_BING_TWO]: {
        status: 'locked',
        assignment: null,
      },
      [MISSION_IDS.JERKY_MOTEL]: {
        status: 'locked',
        ending: null,
        cargoRecovered: false,
        packagesIntact: 0,
        freshness: 0,
        policeHeat: 0,
      },
      [MISSION_IDS.NO_WAKE]: {
        status: 'locked',
        checkpoint: null,
        betrayalConfirmed: false,
        playerFired: false,
        bodyDisposed: false,
      },
      /* The date's durable summary. The mission itself keeps a much larger
       * record while it is running; this is only what a later scene could
       * reasonably ask about an evening it did not watch. */
      [MISSION_IDS.SILVER_ROOM]: {
        status: 'locked',
        outcome: null,
        woo: 0,
        band: null,
        tippedEverybody: false,
        rememberedDrink: false,
        seeingHerAgain: false,
        knowsWhatHeDoes: false,
      },
      [MISSION_IDS.INITIATION]: {
        status: 'locked',
      },
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_ATTABOY_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.BOOSKI_DAY_TWO_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_SECOND_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_NO_WAKE_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.MARGO_DATE_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]: {
        status: 'pending',
      },
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string'))]
    : [];
}

const MIGRATIONS = Object.freeze({
  1(saved) {
    return {
      ...saved,
      version: 2,
    };
  },
  2(saved) {
    return {
      ...saved,
      version: 3,
      activities: {
        ...saved.activities,
        whiskeyRelaxed: saved.activities?.whiskeyRelaxed === true,
      },
    };
  },
  3(saved) {
    const silverStatus = saved.missions?.[MISSION_IDS.SILVER_ROOM]?.status;
    const initiationStatus = saved.missions?.[MISSION_IDS.INITIATION]?.status;
    const progressed = ['available', 'in_progress', 'complete'];
    const alreadyPastNoWake = progressed.includes(silverStatus)
      || progressed.includes(initiationStatus)
      || ['date', 'big_night'].includes(saved.story?.chapter);
    return {
      ...saved,
      version: 4,
      missions: {
        ...saved.missions,
        [MISSION_IDS.NO_WAKE]: alreadyPastNoWake
          ? {
            status: 'complete', checkpoint: 'returned', betrayalConfirmed: true,
            playerFired: true, bodyDisposed: true,
          }
          : {
            status: 'locked', checkpoint: null, betrayalConfirmed: false,
            playerFired: false, bodyDisposed: false,
          },
      },
      events: {
        ...saved.events,
        [EVENT_IDS.LOU_NO_WAKE_CALL]: {
          status: alreadyPastNoWake ? 'answered' : 'pending',
        },
      },
    };
  },
  4(saved) {
    return {
      ...saved,
      version: 5,
      radio: {
        volume: 0.70,
        cursor: 0,
        cycle: 0,
        selections: {},
        songReactionCursor: 0,
        adReactionCursor: 0,
        heardBulletins: [],
        receivers: {},
        ...saved.radio,
      },
    };
  },
});

function migrate(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return { ok: false, reason: 'invalid_shape' };
  }
  if (!Number.isSafeInteger(saved.version)
    || saved.version < 1
    || saved.version > CAMPAIGN_VERSION) {
    return { ok: false, reason: 'unsupported_version' };
  }

  let value = saved;
  let changed = false;
  while (value.version < CAMPAIGN_VERSION) {
    const migration = MIGRATIONS[value.version];
    if (typeof migration !== 'function') {
      return { ok: false, reason: 'unsupported_version' };
    }
    const beforeVersion = value.version;
    try {
      value = migration(value);
    } catch {
      return { ok: false, reason: 'migration_failed' };
    }
    if (!value
      || typeof value !== 'object'
      || !Number.isSafeInteger(value.version)
      || value.version <= beforeVersion
      || value.version > CAMPAIGN_VERSION) {
      return { ok: false, reason: 'migration_failed' };
    }
    changed = true;
  }
  return { ok: true, value, changed };
}

function hasCurrentShape(saved) {
  return Number.isSafeInteger(saved.revision)
    && saved.scene && typeof saved.scene === 'object'
    && saved.story && typeof saved.story === 'object'
    && saved.activities && typeof saved.activities === 'object'
    && saved.radio && typeof saved.radio === 'object'
    && saved.inventory && typeof saved.inventory === 'object'
    && saved.missions && typeof saved.missions === 'object'
    && saved.events && typeof saved.events === 'object';
}

function normalize(saved) {
  const base = initialState();
  if (!saved || saved.version !== CAMPAIGN_VERSION) return base;

  const sceneId = SCENES[saved.scene?.id] ? saved.scene.id : base.scene.id;
  const mission = saved.missions?.[MISSION_IDS.BADA_BING_ONE] ?? {};
  const status = ['locked', 'available', 'in_progress', 'complete']
    .includes(mission.status) ? mission.status : base.missions.bada_bing_one.status;
  const squatchfather = saved.missions?.[MISSION_IDS.SQUATCHFATHER] ?? {};
  const squatchfatherStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(squatchfather.status)
    ? squatchfather.status
    : (status === 'complete' ? 'available' : base.missions.squatchfather.status);
  const airstrip = saved.missions?.[MISSION_IDS.AIRSTRIP_SMUGGLING] ?? {};
  const airstripStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(airstrip.status)
    ? airstrip.status
    : base.missions.airstrip_smuggling.status;
  const bingTwo = saved.missions?.[MISSION_IDS.BADA_BING_TWO] ?? {};
  const bingTwoStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(bingTwo.status) ? bingTwo.status : base.missions.bada_bing_two.status;
  const motel = saved.missions?.[MISSION_IDS.JERKY_MOTEL] ?? {};
  const motelStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(motel.status) ? motel.status : base.missions.jerky_motel.status;
  const noWake = saved.missions?.[MISSION_IDS.NO_WAKE] ?? {};
  const noWakeStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(noWake.status) ? noWake.status : base.missions.no_wake.status;
  const silver = saved.missions?.[MISSION_IDS.SILVER_ROOM] ?? {};
  const silverStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(silver.status) ? silver.status : base.missions.silver_room.status;
  const initiation = saved.missions?.[MISSION_IDS.INITIATION] ?? {};
  const initiationStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(initiation.status) ? initiation.status : base.missions.initiation.status;
  const louCall = saved.events?.[EVENT_IDS.LOU_FIRST_CALL] ?? {};
  const attaboyCall = saved.events?.[EVENT_IDS.LOU_ATTABOY_CALL] ?? {};
  const booskiCall = saved.events?.[EVENT_IDS.BOOSKI_DAY_TWO_CALL] ?? {};
  const louSecondCall = saved.events?.[EVENT_IDS.LOU_SECOND_CALL] ?? {};
  const louNoWakeCall = saved.events?.[EVENT_IDS.LOU_NO_WAKE_CALL] ?? {};
  const margoCall = saved.events?.[EVENT_IDS.MARGO_DATE_CALL] ?? {};
  const booskiBigNightCall = saved.events?.[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL] ?? {};
  const radio = saved.radio ?? {};
  const radioSelections = Object.fromEntries(
    Object.entries(radio.selections && typeof radio.selections === 'object'
      ? radio.selections : {})
      .filter(([key, value]) => typeof key === 'string'
        && key.length <= 120
        && Number.isSafeInteger(value)
        && value >= 0)
      .map(([key, value]) => [key, Math.min(value, 1_000_000)]),
  );
  const radioReceivers = Object.fromEntries(
    Object.entries(radio.receivers && typeof radio.receivers === 'object'
      ? radio.receivers : {})
      .filter(([key, value]) => typeof key === 'string'
        && key.length <= 80
        && typeof value === 'boolean'),
  );

  const state = {
    version: CAMPAIGN_VERSION,
    revision: Number.isSafeInteger(saved.revision) && saved.revision >= 0
      ? saved.revision : 0,
    scene: {
      id: sceneId,
      spawn: normalizedSpawn(sceneId, saved.scene?.spawn),
    },
    story: {
      chapter: typeof saved.story?.chapter === 'string'
        ? saved.story.chapter : base.story.chapter,
      day: Number.isSafeInteger(saved.story?.day) && saved.story.day > 0
        ? saved.story.day : base.story.day,
      timeMinutes: Number.isFinite(saved.story?.timeMinutes)
        ? saved.story.timeMinutes : base.story.timeMinutes,
      meetingKnown: saved.story?.meetingKnown === true,
      meetingLearnedFrom: typeof saved.story?.meetingLearnedFrom === 'string'
        ? saved.story.meetingLearnedFrom : null,
      timeEvents: uniqueStrings(saved.story?.timeEvents),
    },
    activities: Object.fromEntries(
      Object.keys(base.activities)
        .map((key) => [key, saved.activities?.[key] === true]),
    ),
    radio: {
      volume: boundedNumber(radio.volume, 0, 1, base.radio.volume),
      cursor: boundedNumber(radio.cursor, 0, 1_000_000, 0, true),
      cycle: boundedNumber(radio.cycle, 0, 1_000_000, 0, true),
      selections: radioSelections,
      songReactionCursor: boundedNumber(radio.songReactionCursor, 0, 1_000_000, 0, true),
      adReactionCursor: boundedNumber(radio.adReactionCursor, 0, 1_000_000, 0, true),
      heardBulletins: uniqueStrings(radio.heardBulletins).slice(-64),
      receivers: radioReceivers,
    },
    inventory: {
      carried: uniqueStrings(saved.inventory?.carried),
      concealed: uniqueStrings(saved.inventory?.concealed),
    },
    missions: {
      [MISSION_IDS.BADA_BING_ONE]: {
        status,
        packageReceived: mission.packageReceived === true,
        ending: typeof mission.ending === 'string' ? mission.ending : null,
      },
      [MISSION_IDS.SQUATCHFATHER]: {
        status: squatchfatherStatus,
        weaponStaged: squatchfather.weaponStaged === true,
        weaponDropped: squatchfather.weaponDropped === true,
      },
      [MISSION_IDS.AIRSTRIP_SMUGGLING]: {
        status: airstripStatus,
        checkpoint: ['airstrip', 'remote_strip', 'returning', 'landed_home']
          .includes(airstrip.checkpoint) ? airstrip.checkpoint : null,
        cargoLoaded: airstrip.cargoLoaded === true,
        detected: airstrip.detected === true,
        landingQuality: typeof airstrip.landingQuality === 'string'
          ? airstrip.landingQuality : null,
      },
      [MISSION_IDS.BADA_BING_TWO]: {
        status: bingTwoStatus,
        assignment: typeof bingTwo.assignment === 'string' ? bingTwo.assignment : null,
      },
      [MISSION_IDS.JERKY_MOTEL]: {
        status: motelStatus,
        ending: typeof motel.ending === 'string' ? motel.ending : null,
        cargoRecovered: motel.cargoRecovered === true,
        packagesIntact: boundedNumber(motel.packagesIntact, 0, 8, 0, true),
        freshness: boundedNumber(motel.freshness, 0, 100, 0),
        policeHeat: boundedNumber(motel.policeHeat, 0, 100, 0),
      },
      [MISSION_IDS.NO_WAKE]: {
        status: noWakeStatus,
        checkpoint: ['dock', 'underway', 'open_water', 'execution', 'returned']
          .includes(noWake.checkpoint) ? noWake.checkpoint : null,
        betrayalConfirmed: noWake.betrayalConfirmed === true,
        playerFired: noWake.playerFired === true,
        bodyDisposed: noWake.bodyDisposed === true,
      },
      [MISSION_IDS.SILVER_ROOM]: {
        status: silverStatus,
        outcome: [
          'perfect', 'strong', 'good', 'gentleman', 'polite',
          'from-a-distance', 'awkward', 'insult', 'disaster',
        ]
          .includes(silver.outcome) ? silver.outcome : null,
        woo: boundedNumber(silver.woo, 0, 100, 0, true),
        band: typeof silver.band === 'string' ? silver.band : null,
        tippedEverybody: silver.tippedEverybody === true,
        rememberedDrink: silver.rememberedDrink === true,
        seeingHerAgain: silver.seeingHerAgain === true,
        knowsWhatHeDoes: silver.knowsWhatHeDoes === true,
      },
      [MISSION_IDS.INITIATION]: {
        status: initiationStatus,
      },
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: {
        // Campaign saves created before the call event existed already exposed
        // or completed this mission. Treat that progress as proof the call
        // happened instead of replaying Lou and downgrading the mission.
        status: louCall.status === 'answered' || status !== 'locked'
          ? 'answered' : 'pending',
      },
      /* The one call with no mission behind it to infer from, so there is
       * nothing to reconstruct: a save that predates it has never heard it and
       * gets it on the next return from the Squatchfather. A save already past
       * that night never will, which is the correct amount of loss for a call
       * that unlocks nothing. */
      [EVENT_IDS.LOU_ATTABOY_CALL]: {
        status: attaboyCall.status === 'answered' ? 'answered' : 'pending',
      },
      [EVENT_IDS.BOOSKI_DAY_TWO_CALL]: {
        // Once the airstrip mission has been exposed, Booski's call must not
        // replay even if this save predates the explicit event record.
        status: booskiCall.status === 'answered' || airstripStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      [EVENT_IDS.LOU_SECOND_CALL]: {
        status: louSecondCall.status === 'answered' || bingTwoStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      [EVENT_IDS.LOU_NO_WAKE_CALL]: {
        status: louNoWakeCall.status === 'answered' || noWakeStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      // An exposed Silver Room is proof Margo already rang.
      [EVENT_IDS.MARGO_DATE_CALL]: {
        status: margoCall.status === 'answered' || silverStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      // Same rule at the end of the line: an exposed Initiation is proof
      // Booskibro's big-night call already landed.
      [EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]: {
        status: booskiBigNightCall.status === 'answered' || initiationStatus !== 'locked'
          ? 'answered' : 'pending',
      },
    },
  };

  if (saved.lastTransition
    && SCENES[saved.lastTransition.from]
    && SCENES[saved.lastTransition.to]
    && typeof saved.lastTransition.spawn === 'string') {
    state.lastTransition = {
      from: saved.lastTransition.from,
      to: saved.lastTransition.to,
      spawn: normalizedSpawn(saved.lastTransition.to, saved.lastTransition.spawn),
    };
  }
  return state;
}

function load(storage) {
  const fresh = {
    state: initialState(),
    storage,
    persist: false,
    recovery: null,
    newRecovery: null,
    readOnly: false,
  };
  if (!storage) return fresh;

  let raw;
  try {
    raw = storage.getItem(CAMPAIGN_STORAGE_KEY);
  } catch {
    return { ...fresh, storage: null };
  }
  try {
    const recoveryRaw = storage.getItem(CAMPAIGN_RECOVERY_KEY);
    if (recoveryRaw !== null) {
      const recovery = JSON.parse(recoveryRaw);
      if (recovery
        && typeof recovery.reason === 'string'
        && typeof recovery.raw === 'string') {
        fresh.recovery = recovery;
      }
    }
  } catch {
    // A damaged recovery record must never make a valid primary save unreadable.
  }
  if (raw === null) return fresh;

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return {
      ...fresh,
      persist: true,
      newRecovery: { reason: 'invalid_json', raw },
    };
  }

  const migrated = migrate(saved);
  if (!migrated.ok) {
    const readOnly = migrated.reason === 'unsupported_version';
    return {
      ...fresh,
      persist: !readOnly,
      newRecovery: { reason: migrated.reason, raw },
      readOnly,
    };
  }

  const state = normalize(migrated.value);
  const normalizedChanged = JSON.stringify(state) !== JSON.stringify(migrated.value);
  const structurallyBroken = !migrated.changed
    && (!hasCurrentShape(migrated.value) || normalizedChanged);
  return {
    ...fresh,
    state,
    persist: migrated.changed || normalizedChanged,
    newRecovery: structurallyBroken ? { reason: 'invalid_shape', raw } : null,
  };
}

class Campaign {
  constructor(storage) {
    const loaded = load(storage);
    this.storage = loaded.storage;
    this._state = loaded.state;
    this._recoveredNow = Boolean(loaded.newRecovery);
    this._recovery = loaded.newRecovery ?? loaded.recovery;

    if (loaded.newRecovery && this.storage) {
      if (loaded.recovery
        && (loaded.recovery.reason !== loaded.newRecovery.reason
          || loaded.recovery.raw !== loaded.newRecovery.raw)) {
        this._recovery = {
          ...loaded.newRecovery,
          previous: {
            reason: loaded.recovery.reason,
            raw: loaded.recovery.raw,
          },
        };
      }
      try {
        this.storage.setItem(
          CAMPAIGN_RECOVERY_KEY,
          JSON.stringify(this._recovery),
        );
      } catch {
        // Never overwrite an unreadable save unless its recovery copy was
        // successfully preserved first.
        this.storage = null;
      }
    }
    if (loaded.readOnly) this.storage = null;
    if (loaded.persist && this.storage) this.#save();
  }

  get state() {
    return clone(this._state);
  }

  get recovery() {
    return this._recovery ? clone(this._recovery) : null;
  }

  get recoveredNow() {
    return this._recoveredNow;
  }

  get persistent() {
    return Boolean(this.storage);
  }

  addItem(itemId, { concealed = false } = {}) {
    const bucket = concealed ? 'concealed' : 'carried';
    const other = concealed ? 'carried' : 'concealed';
    this._state.inventory[other] = this._state.inventory[other]
      .filter((id) => id !== itemId);
    if (!this._state.inventory[bucket].includes(itemId)) {
      this._state.inventory[bucket].push(itemId);
    }
    this._state.revision++;
    this.#save();
  }

  hasItem(itemId) {
    return this._state.inventory.carried.includes(itemId)
      || this._state.inventory.concealed.includes(itemId);
  }

  update(change) {
    if (typeof change !== 'function') throw new TypeError('Campaign update requires a function');
    const candidate = clone(this._state);
    change(candidate);
    candidate.version = CAMPAIGN_VERSION;
    candidate.revision = this._state.revision + 1;
    this._state = normalize(candidate);
    this.#save();
    return this.state;
  }

  /**
   * Register the page that actually loaded. This keeps direct development
   * entrypoints usable without inventing a story transition that never ran.
   */
  enter(sceneId, { spawn } = {}) {
    if (!SCENES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`);
    const resolvedSpawn = requiredSpawn(sceneId, spawn);
    this._state.scene = { id: sceneId, spawn: resolvedSpawn };
    this._state.revision++;
    this.#save();
    return this.state;
  }

  advanceTime(eventId, change) {
    const event = TIME_EVENTS[eventId];
    if (!event) throw new Error(`Unknown time event "${eventId}"`);
    if (change !== undefined && typeof change !== 'function') {
      throw new TypeError('Campaign time event change must be a function');
    }
    if (this._state.story.timeEvents.includes(eventId)) {
      return {
        applied: false,
        day: this._state.story.day,
        timeMinutes: this._state.story.timeMinutes,
        minutesAdvanced: 0,
      };
    }

    const before = (this._state.story.day - 1) * MINUTES_PER_DAY
      + this._state.story.timeMinutes;
    const target = event.atLeast
      ? (event.atLeast.day - 1) * MINUTES_PER_DAY + event.atLeast.timeMinutes
      : before + event.minutes;
    const absolute = Math.max(before, target);
    const minutesAdvanced = absolute - before;
    this.update((state) => {
      change?.(state);
      state.story.day = Math.floor(absolute / MINUTES_PER_DAY) + 1;
      state.story.timeMinutes = absolute % MINUTES_PER_DAY;
      state.story.timeEvents.push(eventId);
    });
    return {
      applied: true,
      day: this._state.story.day,
      timeMinutes: this._state.story.timeMinutes,
      minutesAdvanced,
    };
  }

  transition(sceneId, { spawn } = {}) {
    const before = clone(this._state);
    const from = this._state.scene.id;
    if (!SCENES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`);
    if (!SCENES[from]?.next.includes(sceneId)) {
      throw new Error(`Cannot transition from "${from}" to "${sceneId}"`);
    }
    const resolvedSpawn = requiredSpawn(sceneId, spawn);
    this._state.scene = { id: sceneId, spawn: resolvedSpawn };
    this._state.lastTransition = { from, to: sceneId, spawn: resolvedSpawn };
    this._state.revision++;
    if (!this.#save()) {
      this._state = before;
      throw new Error('Campaign transition could not be saved');
    }
    return this.state;
  }

  restore(snapshot) {
    this._state = normalize({
      ...clone(snapshot),
      version: CAMPAIGN_VERSION,
    });
    if (!this.#save()) {
      throw new Error('Campaign rollback could not be saved');
    }
    return this.state;
  }

  /**
   * Start over deliberately.
   *
   * This is intentionally separate from recovery: a repaired save keeps a
   * forensic copy of the damaged data, whereas a player-confirmed restart
   * replaces the primary save with Day One and discards any old recovery
   * record. Write the fresh primary first so a storage failure never erases
   * the campaign that was on disk.
   */
  reset() {
    const fresh = initialState();
    if (this.storage) {
      try {
        this.storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(fresh));
      } catch {
        return null;
      }
      try {
        this.storage.removeItem?.(CAMPAIGN_RECOVERY_KEY);
      } catch {
        // The valid new primary campaign is still more important than an old
        // recovery note that the player explicitly chose to discard.
      }
    }
    this._state = fresh;
    this._recovery = null;
    this._recoveredNow = false;
    return this.state;
  }

  #save() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(this._state));
      return true;
    } catch {
      // Sandboxed frames and privacy modes can expose localStorage but reject
      // writes. The current page still gets a coherent in-memory campaign.
      this.storage = null;
      return false;
    }
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function boundedNumber(value, min, max, fallback, integer = false) {
  if (!Number.isFinite(value)) return fallback;
  const bounded = Math.max(min, Math.min(max, value));
  return integer ? Math.round(bounded) : bounded;
}

function seedPreviewCampaign(campaign, sceneId) {
  campaign.update((state) => {
    const firstBing = state.missions[MISSION_IDS.BADA_BING_ONE];
    const squatchfather = state.missions[MISSION_IDS.SQUATCHFATHER];
    const airstrip = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    const secondBing = state.missions[MISSION_IDS.BADA_BING_TWO];
    const motel = state.missions[MISSION_IDS.JERKY_MOTEL];
    const noWake = state.missions[MISSION_IDS.NO_WAKE];
    const silver = state.missions[MISSION_IDS.SILVER_ROOM];
    const initiation = state.missions[MISSION_IDS.INITIATION];

    if (sceneId === SCENE_IDS.BADA_BING_ONE) {
      firstBing.status = 'available';
      state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
      return;
    }

    if ([
      SCENE_IDS.SQUATCHFATHER,
      SCENE_IDS.AIRSTRIP_SMUGGLING,
      SCENE_IDS.BADA_BING_TWO,
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.INITIATION,
    ].includes(sceneId)) {
      firstBing.status = 'complete';
      firstBing.packageReceived = true;
      state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.SQUATCHFATHER) {
      squatchfather.status = 'available';
      if (!state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE)) {
        state.inventory.concealed.push(ITEM_IDS.LOU_PACKAGE);
      }
      return;
    }

    if (sceneId === SCENE_IDS.AIRSTRIP_SMUGGLING) {
      squatchfather.status = 'complete';
      squatchfather.weaponStaged = true;
      squatchfather.weaponDropped = true;
      state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
      airstrip.status = 'available';
      return;
    }

    if ([
      SCENE_IDS.BADA_BING_TWO,
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.INITIATION,
    ].includes(sceneId)) {
      squatchfather.status = 'complete';
      squatchfather.weaponStaged = true;
      squatchfather.weaponDropped = true;
      airstrip.status = 'complete';
      airstrip.checkpoint = 'landed_home';
      airstrip.cargoLoaded = true;
      state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
      state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.BADA_BING_TWO) {
      secondBing.status = 'available';
      return;
    }

    if ([
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.INITIATION,
    ].includes(sceneId)) {
      secondBing.status = 'complete';
      secondBing.assignment = 'reserve_pickup';
      motel.status = 'available';
    }

    if ([SCENE_IDS.NO_WAKE, SCENE_IDS.SILVER_ROOM, SCENE_IDS.INITIATION].includes(sceneId)) {
      motel.status = 'complete';
      motel.ending = 'home';
      motel.cargoRecovered = true;
    }

    if (sceneId === SCENE_IDS.NO_WAKE) {
      state.story.chapter = 'no_wake';
      state.story.day = 3;
      state.story.timeMinutes = 12 * 60 + 45;
      state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
      noWake.status = 'available';
      return;
    }

    if ([SCENE_IDS.SILVER_ROOM, SCENE_IDS.INITIATION].includes(sceneId)) {
      noWake.status = 'complete';
      noWake.checkpoint = 'returned';
      noWake.betrayalConfirmed = true;
      noWake.playerFired = true;
      noWake.bodyDisposed = true;
      state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
      state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.SILVER_ROOM) {
      /* He slept off the Motel, woke at noon, and she rang in the afternoon.
       * Half seven on the evening of Day 3, on his way out of the door. */
      state.story.chapter = 'date';
      state.story.day = 3;
      state.story.timeMinutes = 19 * 60 + 30;
      silver.status = 'available';
      return;
    }

    if (sceneId === SCENE_IDS.INITIATION) {
      silver.status = 'complete';
      silver.outcome = 'strong';
      silver.woo = 74;
      silver.seeingHerAgain = true;
      /* And then he slept off the date, which is the page turn into the big
       * night: Day 4, ten in the morning, ceremony at seven. */
      state.story.chapter = 'big_night';
      state.story.day = 4;
      state.story.timeMinutes = 10 * 60;
      state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status = 'answered';
      initiation.status = 'available';
    }
  });

  const spawn = SCENES[sceneId]?.defaultSpawn;
  campaign.enter(sceneId, { spawn });
}

export function createCampaign(options = {}) {
  const explicitStorage = Object.prototype.hasOwnProperty.call(options, 'storage');
  const preview = explicitStorage ? null : getPreviewRuntime();
  const storage = explicitStorage ? options.storage : (preview?.storage ?? browserStorage());
  const campaign = new Campaign(storage);

  if (preview && !preview.seeded) {
    seedPreviewCampaign(campaign, preview.sceneId);
    preview.seeded = true;
  }
  if (preview) installPreviewNotice();
  return campaign;
}

/**
 * Give a physical receiver access to the campaign's shared station state.
 *
 * The Radio module only knows this small interface: load one snapshot, save
 * one snapshot, and record which authored bulletins have aired. Campaign
 * normalization and storage remain local to this adapter, while apartment,
 * car and boat receivers all get the same running order.
 */
export function createCampaignRadioAdapter(
  campaign,
  { receiverId, defaultPower = true } = {},
) {
  if (!campaign || typeof campaign.update !== 'function') {
    throw new TypeError('Campaign radio adapter requires a campaign');
  }
  if (typeof receiverId !== 'string' || !receiverId) {
    throw new TypeError('Campaign radio adapter requires a receiverId');
  }

  return Object.freeze({
    load() {
      const radio = campaign.state.radio;
      return {
        ...radio,
        selections: { ...radio.selections },
        heardBulletins: [...radio.heardBulletins],
        power: typeof radio.receivers[receiverId] === 'boolean'
          ? radio.receivers[receiverId] : defaultPower,
      };
    },

    save(snapshot) {
      campaign.update((state) => {
        const radio = state.radio;
        radio.volume = snapshot.volume;
        radio.cursor = snapshot.cursor;
        radio.cycle = snapshot.cycle;
        radio.selections = { ...snapshot.selections };
        radio.songReactionCursor = snapshot.songReactionCursor;
        radio.adReactionCursor = snapshot.adReactionCursor;
        if (typeof snapshot.power === 'boolean') {
          radio.receivers[receiverId] = snapshot.power;
        }
      });
    },

    hasHeardBulletin(id) {
      return typeof id === 'string' && campaign.state.radio.heardBulletins.includes(id);
    },

    markBulletinHeard(id) {
      if (typeof id !== 'string' || !id || this.hasHeardBulletin(id)) return false;
      campaign.update((state) => {
        state.radio.heardBulletins.push(id);
        state.radio.heardBulletins = uniqueStrings(state.radio.heardBulletins).slice(-64);
      });
      return true;
    },
  });
}

export function navigateCampaign(
  campaign,
  sceneId,
  { spawn, location = globalThis.location } = {},
) {
  const scene = SCENES[sceneId];
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  if (!location || typeof location.assign !== 'function') {
    throw new TypeError('Campaign navigation requires a location with assign()');
  }

  const before = campaign.state;
  const state = campaign.transition(sceneId, { spawn });
  try {
    location.assign(previewNavigationHref(scene.href));
    return state;
  } catch (error) {
    // location.assign() can be rejected by sandboxed/embedded browsers. Do
    // not strand the save at a page the browser never reached.
    try {
      campaign.restore(before);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Navigation failed and campaign rollback could not be saved',
      );
    }
    throw error;
  }
}

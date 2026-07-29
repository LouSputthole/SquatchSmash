/**
 * Stable IDs shared by every scene. Display names and voice-provider aliases
 * belong in character data; story state only uses these IDs.
 */
export const CHARACTER_IDS = Object.freeze({
  PROSPECT: 'prospect',
  LOU: 'lou',
  CAPTAIN_LOU_SASOLE: 'captain_lou_sasole',
  BOOSKI: 'booski',
});

export const SCENE_IDS = Object.freeze({
  APARTMENT: 'apartment',
  BADA_BING_ONE: 'bada_bing_one',
  SQUATCHFATHER: 'squatchfather',
  AIRSTRIP_SMUGGLING: 'airstrip_smuggling',
  BADA_BING_TWO: 'bada_bing_two',
  JERKY_MOTEL: 'jerky_motel',
});

export const ITEM_IDS = Object.freeze({
  LOU_PACKAGE: 'parcel',
});

export const MISSION_IDS = Object.freeze({
  BADA_BING_ONE: 'bada_bing_one',
  SQUATCHFATHER: 'squatchfather',
  AIRSTRIP_SMUGGLING: 'airstrip_smuggling',
  BADA_BING_TWO: 'bada_bing_two',
  JERKY_MOTEL: 'jerky_motel',
});

export const EVENT_IDS = Object.freeze({
  LOU_FIRST_CALL: 'lou_first_call',
  BOOSKI_DAY_TWO_CALL: 'booski_day_two_call',
  LOU_SECOND_CALL: 'lou_second_call',
});

export const CAMPAIGN_VERSION = 1;
export const CAMPAIGN_STORAGE_KEY = 'squatchlife.campaign';

const SCENES = Object.freeze({
  [SCENE_IDS.APARTMENT]: Object.freeze({
    href: 'index.html',
    next: Object.freeze([
      SCENE_IDS.BADA_BING_ONE,
      SCENE_IDS.SQUATCHFATHER,
      SCENE_IDS.AIRSTRIP_SMUGGLING,
      SCENE_IDS.BADA_BING_TWO,
    ]),
  }),
  [SCENE_IDS.BADA_BING_ONE]: Object.freeze({
    href: 'bing.html',
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.SQUATCHFATHER]: Object.freeze({
    href: 'squatchfather.html',
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: Object.freeze({
    href: 'airstrip.html',
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.BADA_BING_TWO]: Object.freeze({
    href: 'bing.html?visit=2',
    next: Object.freeze([SCENE_IDS.JERKY_MOTEL]),
  }),
  [SCENE_IDS.JERKY_MOTEL]: Object.freeze({
    href: 'motel.html',
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
});

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
    },
    activities: {
      eaten: false,
      showered: false,
      pooped: false,
      changedClothes: false,
      emailChecked: false,
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
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.BOOSKI_DAY_TWO_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_SECOND_CALL]: {
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
  const louCall = saved.events?.[EVENT_IDS.LOU_FIRST_CALL] ?? {};
  const booskiCall = saved.events?.[EVENT_IDS.BOOSKI_DAY_TWO_CALL] ?? {};
  const louSecondCall = saved.events?.[EVENT_IDS.LOU_SECOND_CALL] ?? {};

  const state = {
    version: CAMPAIGN_VERSION,
    revision: Number.isSafeInteger(saved.revision) && saved.revision >= 0
      ? saved.revision : 0,
    scene: {
      id: sceneId,
      spawn: typeof saved.scene?.spawn === 'string' ? saved.scene.spawn : 'default',
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
    },
    activities: Object.fromEntries(
      Object.keys(base.activities)
        .map((key) => [key, saved.activities?.[key] === true]),
    ),
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
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: {
        // Campaign saves created before the call event existed already exposed
        // or completed this mission. Treat that progress as proof the call
        // happened instead of replaying Lou and downgrading the mission.
        status: louCall.status === 'answered' || status !== 'locked'
          ? 'answered' : 'pending',
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
    },
  };

  if (saved.lastTransition
    && SCENES[saved.lastTransition.from]
    && SCENES[saved.lastTransition.to]
    && typeof saved.lastTransition.spawn === 'string') {
    state.lastTransition = {
      from: saved.lastTransition.from,
      to: saved.lastTransition.to,
      spawn: saved.lastTransition.spawn,
    };
  }
  return state;
}

function load(storage) {
  if (!storage) return initialState();
  try {
    return normalize(JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY)));
  } catch {
    return initialState();
  }
}

class Campaign {
  constructor(storage) {
    this.storage = storage;
    this._state = load(storage);
  }

  get state() {
    return clone(this._state);
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
  enter(sceneId, { spawn = 'default' } = {}) {
    if (!SCENES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`);
    this._state.scene = { id: sceneId, spawn };
    this._state.revision++;
    this.#save();
    return this.state;
  }

  transition(sceneId, { spawn = 'default' } = {}) {
    const from = this._state.scene.id;
    if (!SCENES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`);
    if (!SCENES[from]?.next.includes(sceneId)) {
      throw new Error(`Cannot transition from "${from}" to "${sceneId}"`);
    }
    this._state.scene = { id: sceneId, spawn };
    this._state.lastTransition = { from, to: sceneId, spawn };
    this._state.revision++;
    this.#save();
    return this.state;
  }

  #save() {
    try {
      this.storage?.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(this._state));
    } catch {
      // Sandboxed frames and privacy modes can expose localStorage but reject
      // writes. The current page still gets a coherent in-memory campaign.
      this.storage = null;
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

export function createCampaign({ storage = browserStorage() } = {}) {
  return new Campaign(storage);
}

export function navigateCampaign(
  campaign,
  sceneId,
  { spawn = 'default', location = globalThis.location } = {},
) {
  const state = campaign.transition(sceneId, { spawn });
  location.assign(SCENES[sceneId].href);
  return state;
}

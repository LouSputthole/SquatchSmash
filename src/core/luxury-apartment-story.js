import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';
import {
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  SPECIAL_MEETING_BOOSKI_CALL,
  departureRefusal,
} from './apartment-story.js';
import { SPECIAL_MEETING_ACT_ONE } from './special-meeting-home-prelude.js';

/**
 * THE LUXURY APARTMENT, as the campaign sees it. Beats 14, 16, 17, 19 and 27.
 *
 * The bible gives Chapter 3's second half to a flat Lou hands over on the
 * eighteenth green, and it is four separate visits rather than one scene with
 * a lot of state:
 *
 *   14  the keys, and GET READY FOR YOUR DATE
 *   15  (Front & Center, elsewhere) -- he leaves from here and comes back
 *   16  she comes home with him, and stays
 *   17  the morning: she goes, and then Lou rings about a boat
 *   18  (NO WAKE, elsewhere) -- he leaves from here and comes back
 *   19  a quiet evening, and then a call about something sensitive
 *   27  home from the Palace; Booskibro calls a special meeting and sends a car
 *
 * WHY THE PHASE COMES OFF THE CLOCK LEDGER AND NOT OFF `story.chapter`.
 *
 * `core/countryside-cabin-story.js` established this shape for the Act-One
 * cabin and the reason is the same one: the ledger is already exact-once,
 * already reloaded with the save, and already the thing every one of these
 * beats has to write anyway. A parallel set of chapter strings would be a
 * second source of truth for the same six facts, and the first time the two
 * disagreed the player would be the one to find out. So `phase()` below is a
 * pure read of what has been spent, in order, and nothing here keeps state.
 *
 * IT ALSO READS MISSION STATUS, deliberately. A save that comes here with the
 * Silver Room or NO WAKE already complete -- the grandfathered kind
 * MIGRATIONS[20] walks across from the old order -- must not be asked to play
 * a beat it can see is behind him. Finished is finished.
 *
 * WHAT IT DOES NOT OWN: the staged Margo scene. Beats 16 and 17 are wired as
 * route and clock here, and `margoComeHomeOwed()`/`margoWakeOwed()` are the
 * hooks the physical two-floor runtime uses to play her, exactly as
 * `ApartmentStory` exposes them for the starter flat.
 */

/** The states this flat passes through, in the order the bible plays them. */
export const LUXURY_APARTMENT_PHASES = Object.freeze([
  'get_ready',
  'date',
  'come_home',
  'stayover',
  'morning',
  'no_wake',
  'return',
  'complete',
  'special_meeting',
]);

/**
 * The durable proof that Tony and Margo already made their date in the cabin.
 *
 * The first three forms are the current route. The remaining seams grandfather
 * saves from before the cabin owned the call: if Booski has already sent Tony
 * to Sasole, or the Beef Run is exposed, that save is past the cabin morning
 * and must not be stranded by a newly required compatibility bit.
 */
export function margoDateScheduled(state) {
  const answered = (eventId) => state.events?.[eventId]?.status === 'answered';
  const spent = (eventId) => state.story?.timeEvents?.includes(eventId) === true;
  const airstripStatus = state.missions?.[MISSION_IDS.AIRSTRIP_SMUGGLING]?.status;
  return answered(EVENT_IDS.MARGO_DATE_CALL)
    || answered(EVENT_IDS.CABIN_MARGO_CALL)
    || spent(TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL)
    || answered(EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL)
    || answered(EVENT_IDS.BOOSKI_DAY_TWO_CALL)
    || ['available', 'in_progress', 'complete'].includes(airstripStatus);
}

class LuxuryApartmentStory {
  constructor({ campaign }) {
    this.campaign = campaign;
    this.#reconcileMargoDate();
  }

  #spent(eventId) {
    return this.campaign.state.story.timeEvents.includes(eventId);
  }

  #answered(eventId) {
    return this.campaign.state.events[eventId]?.status === 'answered';
  }

  #mission(missionId) {
    return this.campaign.state.missions[missionId];
  }

  /**
   * Keep the retired event id readable without replaying its retired call.
   * This is a runtime compatibility repair, not a schema migration: the save
   * shape does not change, so a valid save receives no false recovery notice.
   */
  #reconcileMargoDate() {
    const state = this.campaign.state;
    if (!margoDateScheduled(state)) return false;
    const eventPending = state.events[EVENT_IDS.MARGO_DATE_CALL].status !== 'answered';
    const silverLockedAfterReady = this.#spent(TIME_EVENT_IDS.LUXURY_GET_READY)
      && state.missions[MISSION_IDS.SILVER_ROOM].status === 'locked';
    if (!eventPending && !silverLockedAfterReady) return false;
    this.campaign.update((next) => {
      next.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
      if (next.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_GET_READY)
        && next.missions[MISSION_IDS.SILVER_ROOM].status === 'locked') {
        next.missions[MISSION_IDS.SILVER_ROOM].status = 'available';
      }
    });
    return true;
  }

  /**
   * Book the drive that got him here.
   *
   * Two arrivals, two markers, because the ledger is exact-once by id: the
   * cross-town run from Silver Pines with Lou in the passenger seat is not
   * the same journey as the ride back from South Harbor, and sharing one id
   * would price the first and give the second away free.
   */
  arrive() {
    return this.campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT);
  }

  /** Home from the dock. Beat 19 begins when this lands. */
  returnFromDock() {
    return this.campaign.advanceTime(TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT);
  }

  /** Has he been driven here at all? Beat 14 has not started until he has. */
  arrived() {
    return this.#spent(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT);
  }

  /**
   * Where in the four visits this save is.
   *
   * Read top to bottom; the first thing outstanding is the phase. Every test
   * is either a spent marker or a finished mission, so this is a function of
   * the save and reloading cannot move it.
   */
  phase() {
    /* Beat 27 is another visit to this same address, separated from beat 19 by
     * the whole final arc. Palace completion is the durable seam that makes it
     * unambiguous. A grandfathered Palace was never played and must keep the
     * old terminal route rather than being sent backward into a new call. */
    const palace = this.#mission(MISSION_IDS.CARTEL_PALACE);
    if (palace.status === 'complete' && palace.grandfathered !== true) {
      return 'special_meeting';
    }
    const silver = this.#mission(MISSION_IDS.SILVER_ROOM);
    const noWakeDone = this.#mission(MISSION_IDS.NO_WAKE).status === 'complete';

    if (silver.status !== 'complete') {
      return this.#spent(TIME_EVENT_IDS.LUXURY_GET_READY) ? 'date' : 'get_ready';
    }
    if (!noWakeDone) {
      /* THE DATE ALWAYS COMES HOME NOW. Woo is a performance grade, not a
       * route fork. Read the durable beat markers rather than the historical
       * `cameHome` mission field so old low-score saves receive the same
       * canonical continuation instead of silently skipping two scenes. */
      if (!this.#spent(TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME)) return 'come_home';
      if (!this.#spent(TIME_EVENT_IDS.LUXURY_STAYOVER_REST)) return 'stayover';
      if (!this.#spent(TIME_EVENT_IDS.LUXURY_MARGO_WAKE)) return 'morning';
      return 'no_wake';
    }
    return this.#answered(EVENT_IDS.BOOSKI_SILVER_CASE_CALL) ? 'complete' : 'return';
  }

  /**
   * Beat 14's objective, which the bible marks optional and the door does
   * not: "Shower, change clothes, check phone, leave for Front & Center."
   *
   * Optional in the bible means "no failure state", not "skippable" -- the
   * exit transition for beat 14 is literally "Complete get-ready flow and
   * leave". Forty-five minutes on the clock and it cannot move the table:
   * DEPART_SILVER_ROOM is anchored at half seven.
   */
  completeGetReady() {
    if (this.phase() !== 'get_ready') return { ok: false, reason: 'wrong_phase' };
    if (!margoDateScheduled(this.campaign.state)) {
      return { ok: false, reason: 'margo_date_not_scheduled' };
    }
    const applied = this.campaign.advanceTime(TIME_EVENT_IDS.LUXURY_GET_READY, (state) => {
      /* Legacy key, current meaning: the appointment exists. No second call,
       * and therefore no spend of TIME_EVENT_IDS.MARGO_DATE_CALL. */
      state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
      if (state.missions[MISSION_IDS.SILVER_ROOM].status === 'locked') {
        state.missions[MISSION_IDS.SILVER_ROOM].status = 'available';
      }
    }).applied === true;
    return applied ? { ok: true } : { ok: false, reason: 'already_ready' };
  }

  /** She came back with him. Woo changes the line, never this route. */
  margoComeHomeOwed() {
    return this.phase() === 'come_home';
  }

  /** She is in, helped out of the dress, and asleep. Marker prevents replay. */
  margoComeHomeDone() {
    if (this.phase() !== 'come_home') return false;
    return this.campaign
      .advanceTime(TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME).applied === true;
  }

  /**
   * The night. Beat 16 ends "fade/sleep into the following morning", so this
   * is the whole of what going to bed does here -- there is no chapter to
   * turn, because this flat's beats are ledger entries rather than chapters.
   *
   * Refused until she is in, so that lying down cannot skip her arrival.
   */
  sleep() {
    const phase = this.phase();
    if (phase === 'come_home') return { ok: false, reason: 'margo_still_arriving' };
    if (phase !== 'stayover') return { ok: false, reason: 'wrong_phase' };
    const rest = this.campaign.advanceTime(TIME_EVENT_IDS.LUXURY_STAYOVER_REST);
    if (!rest.applied) return { ok: false, reason: 'already_slept' };
    const { day, timeMinutes } = this.campaign.state.story;
    return { ok: true, day, timeMinutes };
  }

  /** Beat 17. She gets dressed, goes, and only then can Lou ring. */
  margoWakeOwed() {
    return this.phase() === 'morning';
  }

  /** She left. The quiet window the bible asks for starts here. */
  margoWakeDone() {
    if (this.phase() !== 'morning') return false;
    return this.campaign.advanceTime(TIME_EVENT_IDS.LUXURY_MARGO_WAKE).applied === true;
  }

  /**
   * Which telephone this flat is waiting on, or null.
   *
   * Three calls remain, one per later outgoing beat, and the order is the phase order
   * rather than a list of chapter tests -- `phase()` has already decided
   * which visit this is, so each of these only has to ask whether its own
   * call has landed yet.
   */
  pendingCall() {
    const phase = this.phase();
    if (phase === 'no_wake' && !this.#answered(EVENT_IDS.LOU_NO_WAKE_CALL)) {
      return NO_WAKE_LOU_CALL;
    }
    if (phase === 'return' && !this.#answered(EVENT_IDS.BOOSKI_SILVER_CASE_CALL)) {
      return SILVER_CASE_BOOSKI_CALL;
    }
    if (phase === 'special_meeting'
      && !this.#answered(EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL)) {
      return SPECIAL_MEETING_BOOSKI_CALL;
    }
    return null;
  }

  /**
   * Take one of them.
   *
   * Each writes the answer and unlocks exactly what the caller offered, which
   * is the same contract `ApartmentStory.callAnswered` keeps. Beat 19's is
   * the odd one: THE TAKE already made the Silver Case available on Day 5, so
   * Booskibro's call unlocks nothing and only records that it landed -- which
   * is also all it does in the fiction. He is being told a thing is coming,
   * not being given it.
   */
  callAnswered(definition) {
    if (definition?.eventId === EVENT_IDS.LOU_NO_WAKE_CALL
      && !this.#answered(EVENT_IDS.LOU_NO_WAKE_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_NO_WAKE_CALL, (state) => {
        state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
        state.missions[MISSION_IDS.NO_WAKE].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.BOOSKI_SILVER_CASE_CALL
      && !this.#answered(EVENT_IDS.BOOSKI_SILVER_CASE_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.BOOSKI_SILVER_CASE_CALL, (state) => {
        state.events[EVENT_IDS.BOOSKI_SILVER_CASE_CALL].status = 'answered';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL
      && !this.#answered(EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL, (state) => {
        state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status = 'answered';
      });
      return true;
    }
    return false;
  }

  /**
   * The front door, in the same vocabulary `ApartmentStory.tryLeave` speaks:
   * `go` with a destination, `call` waiting on a telephone, `activity`
   * waiting on something he has to do, `stay` meaning the answer is bed.
   *
   * @param {object} activities the room's own live flags, for parity with the
   *   starter flat's door. Nothing in this flat gates on one yet.
   */
  tryLeave(activities = {}) {
    const phase = this.phase();
    if (phase === 'get_ready') {
      return {
        kind: 'activity',
        id: TIME_EVENT_IDS.LUXURY_GET_READY,
        label: 'Get ready for your date',
        hint: 'Shower, put on something for the Silver Room, and take the phone.',
        ...departureRefusal('luxury_get_ready'),
      };
    }
    if (phase === 'date') {
      return { kind: 'go', destination: SCENE_IDS.SILVER_ROOM };
    }
    if (phase === 'come_home' || phase === 'stayover') {
      return {
        kind: 'stay',
        id: 'luxury_stayover',
        ...departureRefusal('luxury_stayover'),
      };
    }
    if (phase === 'morning') {
      return {
        kind: 'stay',
        id: 'luxury_margo_morning',
        ...departureRefusal('luxury_margo_morning'),
      };
    }
    if (phase === 'no_wake') {
      if (!this.#answered(EVENT_IDS.LOU_NO_WAKE_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.LOU_NO_WAKE_CALL,
          ...departureRefusal('no_wake_call'),
        };
      }
      return { kind: 'go', destination: SCENE_IDS.NO_WAKE };
    }
    if (phase === 'return') {
      return {
        kind: 'call',
        id: EVENT_IDS.BOOSKI_SILVER_CASE_CALL,
        ...departureRefusal('final_arc_locked'),
      };
    }
    if (phase === 'special_meeting') {
      /* Legacy finished-campaign saves intentionally keep their old replay
       * door. They already completed the ride and have no transient car clock
       * to resume, so making them wait for a new pickup would manufacture a
       * second Beat 27 after the credits. */
      if (this.#mission(MISSION_IDS.INITIATION).status === 'complete') {
        return { kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING };
      }
      if (!this.#answered(EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL,
          line: 'Nobody’s rung. Nobody’s rung all day.',
          hint: 'Answer Booskibro’s call.',
        };
      }
      if (activities.carOutside === true) {
        return { kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING };
      }
      return {
        kind: 'wait',
        id: 'special_meeting_car',
        label: 'Wait in for Seff, Lag and Numbskull',
        line: SPECIAL_MEETING_ACT_ONE.doorRefusals[0].text,
        takes: SPECIAL_MEETING_ACT_ONE.doorRefusals,
      };
    }
    return { kind: 'go', destination: SCENE_IDS.SILVER_CASE };
  }

  /**
   * The morning's list, for the objective panel.
   *
   * Derived from `tryLeave` for the same reason the starter flat's is: a
   * panel that authors its own copy of the door's rules is a panel that will
   * eventually disagree with the door, and the player believes the panel.
   */
  objectives(activities = {}) {
    const phase = this.phase();
    const door = this.tryLeave(activities);
    const items = [];
    const call = this.pendingCall();
    if (call) {
      items.push({
        id: call.eventId,
        label: `Answer ${call.from}’s call`,
        done: false,
        required: true,
      });
    }
    if (door.kind === 'activity' || door.kind === 'wait') {
      items.push({ id: door.id, label: door.label, done: false, required: true });
    } else if (door.kind === 'stay') {
      /* THREE SHUT DOORS, AND ONLY ONE OF THEM IS A BED.
       *
       * `stay` drew itself as "Sleep" for all of them, which was wrong twice
       * over. In `come_home` she is on the stairs and `sleep()` refuses with
       * `margo_still_arriving`, so the panel was naming the one action the
       * story would not accept -- a man told to go to bed by a bed that says
       * no. In `morning` it is ten past seven and she is collecting her
       * things, and the door's own line says so: "She is still getting her
       * things together. I am not walking out before she does."
       *
       * The refusal keys are cue names and stay exactly as they are; this is
       * the panel learning to read them. (Both audits found this
       * independently and chose the same morning words.) */
      items.push({
        id: door.id,
        label: LUXURY_STAY_LABELS[phase] ?? 'Sleep',
        done: false,
        required: true,
      });
    } else if (door.kind === 'go') {
      items.push({
        id: `depart.${door.destination}`,
        label: `Leave for ${LUXURY_SCENE_LABELS[door.destination] ?? door.destination}`,
        done: false,
        required: true,
      });
    }
    return { phase, day: this.campaign.state.story.day, items };
  }
}

/**
 * What a shut door is asking for, by the visit it is shutting.
 *
 * Beat 16 arrives with her and beat 17 ends with her leaving; neither is a
 * nap, and the night between them is the only one of the three that is.
 *
 * The two words are the staged scene's own -- `luxury-apartment/margo-scene.js`
 * puts "Follow Margo upstairs" and "See Margo out" on the objective line while
 * she is actually walking -- so the door and the scene cannot be found calling
 * the same beat two different things.
 */
const LUXURY_STAY_LABELS = Object.freeze({
  come_home: 'Follow Margo upstairs',
  stayover: 'Sleep',
  morning: 'See Margo out',
});

/** Somewhere to go, in words a person would use for it. */
const LUXURY_SCENE_LABELS = Object.freeze({
  [SCENE_IDS.SILVER_ROOM]: 'Front & Center',
  [SCENE_IDS.NO_WAKE]: 'South Harbor',
  [SCENE_IDS.SILVER_CASE]: 'the Silver Case pickup',
  [SCENE_IDS.SPECIAL_MEETING]: 'the car downstairs',
});

export function createLuxuryApartmentStory(options) {
  return new LuxuryApartmentStory(options);
}

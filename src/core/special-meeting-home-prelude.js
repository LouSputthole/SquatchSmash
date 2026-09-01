import { beat as specialMeetingBeat } from '../specialmeeting/script.js';

function takesFor(beatId) {
  return Object.freeze(specialMeetingBeat(beatId).lines
    .filter((line) => line.spoken)
    .map((line) => Object.freeze({
      text: line.text,
      cue: line.cue,
      where: line.where ?? null,
    })));
}

/**
 * Act One is performed in a home, not on specialmeeting.html. Keep its authored
 * words tied to the canonical script while both home adapters share timing.
 */
export const SPECIAL_MEETING_ACT_ONE = Object.freeze({
  idleBefore: takesFor('SM-010'),
  deadLine: takesFor('SM-040'),
  callBack: takesFor('SM-050'),
  idleAfter: takesFor('SM-060'),
  gettingReady: takesFor('SM-070'),
  doorRefusals: takesFor('SM-080'),
  headlights: takesFor('SM-090'),
});

export const SPECIAL_MEETING_HOME_TIMING = Object.freeze({
  ringDelay: 74,
  carWait: 170,
  resumedCarWait: 16,
  idleAfter: 19,
  idleGap: 31,
  initialCooldown: 14,
  ringBack: 11,
  ringBackLineDelay: 0.5,
  gettingReadyDelay: 1.6,
  headlightLineDelay: 1.5,
});

/** All home-prelude cues, for the two room adapters' startup decode lists. */
export function specialMeetingHomePreludeCueNames() {
  return Object.freeze(Object.values(SPECIAL_MEETING_ACT_ONE)
    .flat()
    .map(({ cue }) => cue));
}

/**
 * Shared, renderer-free timing owner for SM-010 through SM-090.
 *
 * A home supplies only policy and effects: whether this is the active night,
 * whether the durable call was taken, how one exact take is spoken, and how
 * its physical phone/car respond. The sequence itself cannot fork again.
 */
export function createSpecialMeetingHomePrelude({
  isActive = () => true,
  isCallTaken = () => false,
  isSpeechBusy = () => false,
  say = () => 0,
  onCallbackAvailable = () => {},
  onCarArrives = () => {},
  onRingbackStart = () => {},
  onRingbackEnd = () => {},
  onChanged = () => {},
} = {}) {
  /* Durable resume state exists before either home dismisses its start overlay.
   * `isActive()` controls ticking below; it must not erase a saved answered call
   * merely because the renderer has not entered its active phase yet. */
  const resumed = isCallTaken();
  const state = {
    said: new Set(),
    still: 0,
    cooldown: SPECIAL_MEETING_HOME_TIMING.initialCooldown,
    hungUp: resumed,
    carIn: resumed ? SPECIAL_MEETING_HOME_TIMING.resumedCarWait : null,
    carOutside: false,
    ringingOut: 0,
    ringbackActive: false,
    rungBack: 0,
    dressed: 0,
    deferred: [],
  };

  const idleBank = () => (
    isCallTaken() ? SPECIAL_MEETING_ACT_ONE.idleAfter : SPECIAL_MEETING_ACT_ONE.idleBefore
  );

  function nextTake(bank) {
    return bank.find(({ cue }) => !state.said.has(cue)) ?? null;
  }

  function speakTake(take, options = {}) {
    if (!take) return 0;
    state.said.add(take.cue);
    return say(take, options) || 0;
  }

  function later(seconds, action) {
    state.deferred.push({ remaining: Math.max(0, seconds), action });
  }

  function updateDeferred(elapsed) {
    const due = [];
    for (const item of state.deferred) {
      item.remaining -= elapsed;
      if (item.remaining <= 0) due.push(item);
    }
    if (!due.length) return;
    state.deferred = state.deferred.filter((item) => !due.includes(item));
    for (const item of due) item.action();
  }

  function carArrives() {
    if (state.carOutside) return false;
    state.carIn = null;
    state.carOutside = true;
    onCarArrives();
    later(SPECIAL_MEETING_HOME_TIMING.headlightLineDelay, () => {
      const take = nextTake(SPECIAL_MEETING_ACT_ONE.headlights)
        ?? SPECIAL_MEETING_ACT_ONE.headlights[0];
      speakTake(take);
    });
    onChanged(prelude.snapshot());
    return true;
  }

  const prelude = {
    update(dt, { busy = false, moving = false } = {}) {
      if (!isActive()) return prelude;
      const elapsed = Math.max(0, Number(dt) || 0);
      updateDeferred(elapsed);
      if (state.ringbackActive) {
        state.ringingOut -= elapsed;
        if (state.ringingOut <= 0) prelude.endRingBack();
      }
      if (state.carIn !== null) {
        state.carIn -= elapsed;
        if (state.carIn <= 0) carArrives();
      }
      state.cooldown -= elapsed;
      state.still = busy || moving ? 0 : state.still + elapsed;
      if (busy || state.cooldown > 0 || isSpeechBusy()) return prelude;
      if (state.still < SPECIAL_MEETING_HOME_TIMING.idleAfter) return prelude;
      const take = nextTake(idleBank());
      if (!take) return prelude;
      speakTake(take);
      state.still = 0;
      state.cooldown = SPECIAL_MEETING_HOME_TIMING.idleGap;
      return prelude;
    },

    callEnded() {
      if (!isActive() || state.hungUp || !isCallTaken()) return false;
      state.hungUp = true;
      state.carIn = SPECIAL_MEETING_HOME_TIMING.carWait;
      const hold = speakTake(SPECIAL_MEETING_ACT_ONE.deadLine[0]);
      later(Math.max(0, hold) + 0.4, onCallbackAvailable);
      onChanged(prelude.snapshot());
      return true;
    },

    canRingBack({ phoneBusy = false, phoneHeld = false } = {}) {
      return isActive()
        && state.hungUp
        && !phoneBusy
        && phoneHeld
        && state.ringingOut <= 0;
    },

    ringBack(context = {}) {
      if (!prelude.canRingBack(context)) return false;
      state.ringingOut = SPECIAL_MEETING_HOME_TIMING.ringBack;
      state.ringbackActive = true;
      onRingbackStart();
      onChanged(prelude.snapshot());
      return true;
    },

    endRingBack() {
      if (!state.ringbackActive) return false;
      state.ringingOut = 0;
      state.ringbackActive = false;
      onRingbackEnd();
      const take = SPECIAL_MEETING_ACT_ONE.callBack[
        Math.min(state.rungBack, SPECIAL_MEETING_ACT_ONE.callBack.length - 1)
      ];
      state.rungBack += 1;
      later(SPECIAL_MEETING_HOME_TIMING.ringBackLineDelay, () => speakTake(take));
      onChanged(prelude.snapshot());
      return true;
    },

    dressed() {
      if (!isActive()) return false;
      const take = SPECIAL_MEETING_ACT_ONE.gettingReady[
        Math.min(state.dressed, SPECIAL_MEETING_ACT_ONE.gettingReady.length - 1)
      ];
      state.dressed += 1;
      later(SPECIAL_MEETING_HOME_TIMING.gettingReadyDelay, () => speakTake(take));
      onChanged(prelude.snapshot());
      return true;
    },

    doorRefusal(attempt = 1) {
      const index = Math.max(0, Math.min(
        SPECIAL_MEETING_ACT_ONE.doorRefusals.length - 1,
        Math.floor(attempt) - 1,
      ));
      return SPECIAL_MEETING_ACT_ONE.doorRefusals[index];
    },

    carArrives,

    snapshot() {
      return Object.freeze({
        said: Object.freeze([...state.said]),
        still: state.still,
        cooldown: state.cooldown,
        hungUp: state.hungUp,
        carIn: state.carIn,
        carOutside: state.carOutside,
        ringingOut: state.ringingOut,
        rungBack: state.rungBack,
        dressed: state.dressed,
      });
    },
  };

  return prelude;
}

/**
 * Campaign-aware text messages.
 *
 * Texts are a view of durable story state, not a second mission system. A
 * scene can rebuild the phone after a return, refresh, or direct preview and
 * still show exactly the messages the player has earned. Reading a thread is
 * recorded with a zero-minute campaign event, so the unread dot survives a
 * reload without introducing a parallel phone save.
 */
import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

const READ_EVENTS = Object.freeze({
  family: TIME_EVENT_IDS.PHONE_READ_FAMILY,
  lou: TIME_EVENT_IDS.PHONE_READ_LOU,
  mum: TIME_EVENT_IDS.PHONE_READ_MUM,
  cabin: TIME_EVENT_IDS.PHONE_READ_CABIN,
});

export function phoneReadEventForThread(id) {
  return READ_EVENTS[id] ?? null;
}

function message(who, text) {
  return { them: true, who, text };
}

function thread(id, who, messages, state) {
  const readEventId = phoneReadEventForThread(id);
  return {
    id,
    who,
    readEventId,
    unread: Boolean(readEventId && !state.story?.timeEvents?.includes(readEventId)),
    messages,
  };
}

/** Return the phone's compact, always-readable story inbox for a save. */
export function phoneThreadsForCampaign(state) {
  const events = state?.events ?? {};
  const missions = state?.missions ?? {};
  const family = [
    message('BOOSKIBRO', 'you awake'),
    message('BOOSKIBRO', 'answer your phone'),
    message('APE', 'he is probably looking at the fridge again'),
  ];
  if (events[EVENT_IDS.LOU_FIRST_CALL]?.status === 'answered') {
    family.push(message('BOOSKIBRO', 'Bing tonight. don\'t make Lou wait.'));
  }
  /* The inbox may echo an answered call; it must not announce that call's
   * content just because the mission before it happened. */
  if (events[EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL]?.status === 'answered') {
    family.push(message('BOOSKIBRO', 'Beef Run in the morning. Sasole has the plane.'));
  }
  if (events[EVENT_IDS.CABIN_BILLY_CALL]?.status === 'answered') {
    family.push(message('BOOSKIBRO', 'You made it back. HotDog party at the Bing. Family only.'));
  }
  if (missions[MISSION_IDS.BADA_BING_TWO]?.status === 'complete') {
    family.push(message('SNOW', 'HotDog is handled. Motel next. Room twelve.'));
  }
  if (missions[MISSION_IDS.JERKY_MOTEL]?.status === 'complete') {
    family.push(message('BOOSKIBRO', 'Good work. Get some sleep. Keep your phone on.'));
  }
  /* `BOOSKI_BIG_NIGHT_CALL` remains in campaign state for grandfathered
   * saves, but it belongs to the retired direct-to-Initiation route. Never
   * turn that compatibility marker back into current story presentation.
   * The final pickup has its own exact-once call and is the only event allowed
   * to leave pickup instructions in the inbox. */
  if (events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL]?.status === 'answered') {
    family.push(message(
      'BOOSKIBRO',
      'Special meeting. Seff, Lag, and Numbskull are coming to pick you up. Be outside.',
    ));
  }

  const lou = [
    message('UNCLE LOU', 'Keep your phone on. I will call.'),
    message('UNCLE LOU', 'We will talk face to face.'),
  ];
  if (events[EVENT_IDS.LOU_FIRST_CALL]?.status === 'answered') {
    lou.push(message('UNCLE LOU', 'Bing tonight. Do not make me wait.'));
  }
  if (missions[MISSION_IDS.BADA_BING_ONE]?.packageReceived) {
    lou.push(message('UNCLE LOU', 'Keep the package close. We will talk after.'));
  }
  if (missions[MISSION_IDS.AIRSTRIP_SMUGGLING]?.status === 'complete') {
    lou.push(message('UNCLE LOU', 'Bing. Closed party. Front room.'));
  }

  /* These are the orders Tony reads after the Squatchfather driver actually
   * leaves him at the Act One cabin. `BANK_HEIST` used to expose this thread,
   * resurrecting a retired post-heist drive north in the middle of Day Five.
   * Scene ownership makes the inbox honest even for legacy saves whose old
   * time-event ledgers do not contain the newer cabin departure markers. */
  const cabin = state?.scene?.id === SCENE_IDS.COUNTRYSIDE_CABIN
    ? thread('cabin', 'UNCLE LOU · LAY LOW', [
      message('UNCLE LOU', 'The driver is taking you north. Do not go home.'),
      message('UNCLE LOU', 'There is a cabin past the old forestry gate. The key is under the porch rail.'),
      message('UNCLE LOU', 'Stay there. Walk the property if you get restless. Nobody sees you until I say.'),
      message('UNCLE LOU', 'Keep this phone on. We will call when we need you.'),
    ], state)
    : null;

  return [
    thread('family', 'THE FAMILY', family, state),
    thread('lou', 'UNCLE LOU', lou, state),
    cabin,
    thread('mum', 'MUM', [
      message('MUM', 'Is tomorrow the thing'),
      message('MUM', 'You never tell me anything'),
      message('MUM', 'Love you'),
    ], state),
  ].filter(Boolean);
}

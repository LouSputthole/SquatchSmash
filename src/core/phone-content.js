/**
 * Campaign-aware text messages.
 *
 * Texts are a view of durable story state, not a second mission system. A
 * scene can rebuild the phone after a return, refresh, or direct preview and
 * still show exactly the messages the player has earned. Reading a thread is
 * recorded with a zero-minute campaign event, so the unread dot survives a
 * reload without introducing a parallel phone save.
 */
import { EVENT_IDS, MISSION_IDS, TIME_EVENT_IDS } from './campaign.js';

const READ_EVENTS = Object.freeze({
  family: TIME_EVENT_IDS.PHONE_READ_FAMILY,
  lou: TIME_EVENT_IDS.PHONE_READ_LOU,
  mum: TIME_EVENT_IDS.PHONE_READ_MUM,
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
  if (missions[MISSION_IDS.SQUATCHFATHER]?.status === 'complete') {
    family.push(message('BOOSKIBRO', 'Beef Run in the morning. Sasole has the plane.'));
  }
  if (missions[MISSION_IDS.AIRSTRIP_SMUGGLING]?.status === 'complete') {
    family.push(message('BOOSKIBRO', 'You made it back. Lou wants you at the Bing.'));
  }
  if (missions[MISSION_IDS.BADA_BING_TWO]?.status === 'complete') {
    family.push(message('SNOW', 'Motel is open. I\'ll keep the clerk busy.'));
  }
  if (missions[MISSION_IDS.JERKY_MOTEL]?.status === 'complete') {
    family.push(message('BOOSKIBRO', 'Good work. Sleep. Big night after that.'));
  }
  if (events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]?.status === 'answered') {
    family.push(message('BOOSKIBRO', 'Everybody is waiting. seven sharp.'));
  }

  const lou = [
    message('UNCLE LOU', 'Sent you an email. Read it properly.'),
    message('UNCLE LOU', 'Not on the phone. Properly.'),
  ];
  if (missions[MISSION_IDS.BADA_BING_ONE]?.packageReceived) {
    lou.push(message('UNCLE LOU', 'Keep the package close. We will talk after.'));
  }
  if (missions[MISSION_IDS.AIRSTRIP_SMUGGLING]?.status === 'complete') {
    lou.push(message('UNCLE LOU', 'Back office. Same place.'));
  }

  return [
    thread('family', 'THE FAMILY', family, state),
    thread('lou', 'UNCLE LOU', lou, state),
    thread('mum', 'MUM', [
      message('MUM', 'Is tomorrow the thing'),
      message('MUM', 'You never tell me anything'),
      message('MUM', 'Love you'),
    ], state),
  ];
}

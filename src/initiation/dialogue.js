import { initiationVoiceLine, uniqueInitiationVoiceLines } from './voice.js';

const VOICE_OF = Object.freeze({
  BOOSKIBRO: 'booski',
  'BIG UNCLE LOU SPUTTHOLE': 'lou',
  /* The executed prospect is visibly somebody else, never Tony's voice. */
  'PROSPECT ONE': 'doorman',
});

function beat(name, entries) {
  return Object.freeze(entries.map(([who, text, gesture]) => initiationVoiceLine({
    scope: 'ceremony',
    speaker: `${name}-${who}`,
    voice: VOICE_OF[who],
    who,
    text,
    gesture,
  })));
}

export const CEREMONY_BEATS = Object.freeze({
  speech: beat('speech', [
    ['BOOSKIBRO', 'Brothers. Sisters. Silverbacks of the Circle.'],
    ['BOOSKIBRO', 'Before there were bandanas... there was a fire. And before this fire... there were FIVE.', 'slam'],
    ['BOOSKIBRO', 'Five who walked out of their apartments and into the pines. Five who heard the forest — and answered it.'],
    ['BOOSKIBRO', 'Tonight, five prospects stand where the five once stood. The forest is watching. I am ALSO watching.', 'slam'],
    ['BIG UNCLE LOU SPUTTHOLE', 'What Booskibro means is: welcome. This is a family. A large, damp, forest family.', 'slam'],
    ['BIG UNCLE LOU SPUTTHOLE', 'Also — whoever keeps leaving beer cans at the fire pit, knock it off. The raccoons are ORGANIZING.'],
    ['BOOSKIBRO', 'ENOUGH. Prospects! Your first trial is not of the body... but of the MIND.', 'slam'],
  ]),
  q1: beat('q1', [
    ['BOOSKIBRO', 'Prospect One. Step forward.'],
    ['BOOSKIBRO', 'Who are the FIVE founding members of the Silver Sasquatches?'],
    ['PROSPECT ONE', 'Oh — uh. Booskibro... Big Uncle Lou... uhh. Bigfoot? Garfield?? ...the GEICO Gecko???'],
    ['BIG UNCLE LOU SPUTTHOLE', 'Oof.'],
    ['BOOSKIBRO', 'WRONG.', 'slam'],
  ]),
  q2: beat('q2', [
    ['BIG UNCLE LOU SPUTTHOLE', '...Anyway!'],
    ['BOOSKIBRO', 'Prospect Two. Same question.'],
    ['BIG UNCLE LOU SPUTTHOLE', 'No pressure. Well. Some pressure. A specific, recently demonstrated amount of pressure.'],
  ]),
  correct: beat('correct', [
    ['BOOSKIBRO', 'CORRECT. Myself. Big Uncle Lou Sputthole. Rippinflow. The Shubenator. Deathmegatron. The FIVE.', 'slam'],
    ['BIG UNCLE LOU SPUTTHOLE', 'Somebody did the reading!'],
    ['BOOSKIBRO', 'The mind is sharp. Now we test the BODY. Clear the line — THE GAUNTLET AWAITS.', 'slam'],
  ]),
  wrong: beat('wrong', [
    ['BOOSKIBRO', 'WRONG.', 'slam'],
    ['BIG UNCLE LOU SPUTTHOLE', 'Oh no. Same as the last guy. Word for word almost.'],
  ]),
  endured: beat('endured', [
    ['BOOSKIBRO', 'ENOUGH.'],
    ['BOOSKIBRO', 'Beaten down to a stump... and still on two feet. The Circle sees you, prospect.'],
    ['BOOSKIBRO', 'Second trial: THE ROAR. The forest must learn your voice. Let it OUT.'],
  ]),
  roar: beat('roar', [
    ['BOOSKIBRO', 'HA! Birds three ridges over just quit their nests.'],
    ['BOOSKIBRO', 'Final trial: THE TIMBER. That old deadfall has mocked this clearing long enough. SMASH IT.', 'slam'],
  ]),
  anoint: beat('anoint', [
    ['BOOSKIBRO', 'You took the Circle’s fists. You gave the forest your voice. You turned a log into a suggestion.'],
    ['BOOSKIBRO', 'Tony Squatchtana. You walked into this clearing a prospect.'],
    ['BOOSKIBRO', 'Walk out a SQUATCH.', 'slam'],
  ]),
  retry: beat('retry', [
    ['BOOSKIBRO', 'The Circle forgives once. Arms DOWN this time, prospect.'],
  ]),
});

export const SPEECH = CEREMONY_BEATS.speech;
export const Q1_LINES = CEREMONY_BEATS.q1;
export const Q2_LINES = CEREMONY_BEATS.q2;
export const CORRECT_LINES = CEREMONY_BEATS.correct;
export const WRONG_LINES = CEREMONY_BEATS.wrong;
export const ENDURED_LINES = CEREMONY_BEATS.endured;
export const ROAR_LINES = CEREMONY_BEATS.roar;
export const ANOINT_LINES = CEREMONY_BEATS.anoint;
export const RETRY_LINE = CEREMONY_BEATS.retry;

/** Tony reads his selected founders answer before the Circle judges it. */
export const QUIZ_OPTIONS = Object.freeze([
  ['Booskibro, Big Uncle Lou Sputthole, Rippinflow, The Shubenator, Deathmegatron', true],
  ['Booskibro, Big Uncle Lou Sputthole, Bigfoot, Garfield, the GEICO Gecko', false],
  ['Booskibro, Snow, Hogmama, Ericran, and two raccoons in a coat', false],
].map(([text, correct]) => initiationVoiceLine({
  /* Quiz answers are part of the live ceremony preload bank. */
  scope: 'ceremony',
  speaker: 'prospect-two',
  voice: 'player',
  who: 'PROSPECT TWO',
  text,
  correct,
})));

export function allCeremonyVoiceLines() {
  return uniqueInitiationVoiceLines(...Object.values(CEREMONY_BEATS), QUIZ_OPTIONS);
}

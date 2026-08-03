/**
 * LICENSE TO GRILL — the store room, and the man tied up in it.
 *
 * A side quest off the back hallway of the Bada Bing. Au Gratin has caught a
 * foreign intelligence officer, tied him to the chair that is bolted to the
 * floor, and got precisely nowhere with him for several hours, because James
 * Blond treats being interrogated as a slightly disappointing hotel stay.
 * Gratin needs a second set of hands. He is not asking.
 *
 * ---- what the scene is actually about ----
 *
 * The joke has a mechanic under it. Hitting Blond does nothing — he has been
 * trained for it and, more to the point, he enjoys the audience. Every
 * physical option in here is deliberately near-worthless, and the scene is
 * written so the player works out on their own that the man does not care
 * about his body at all and cares enormously about his things. The watch, the
 * camera, the pistol, the jacket: each one moves him. The car finishes him.
 *
 * So `pressure` is not a health bar. It is how close the player is to noticing
 * what Blond is. Beating him raises it a trickle; touching his property raises
 * it properly; mentioning the Harrington ends the conversation. A player who
 * only ever swings the cord can still get there, slowly, and will feel stupid
 * when they find the keys, which is the correct feeling.
 *
 * ---- structure ----
 *
 * This module is the writing and the rules. It owns no meshes, no audio and no
 * campaign save; `main.js` mounts it, `dialogue.js` plays it, and the room it
 * happens in is dressed in `club.js`. Cues are deliberately not hand-named —
 * `applyBingVoiceCues` mints them from the words so `npm run vo:bing` finds
 * them, which is the same route every line added to this club since the
 * generator landed has taken.
 */
import { CHARACTER_IDS } from '../core/campaign.js';
import { SHUBENATOR_SIGNATURE_TAKES } from '../core/shubenator-signature.js';
import { applyBingVoiceCues } from './script.js';

/** The name Blond gives up, and the thread it starts. */
export const INFORMANT_NAME = 'Vincent Mallard';
export const INFORMANT_MEET = 'behind the laundromat, Thursdays';

/** What the quest is called on the door and in the objective list. */
export const QUEST = Object.freeze({
  id: 'license_to_grill',
  door: 'Help Au Gratin with a delicate matter',
  objective: 'Make James Blond talk',
  title: 'License to Grill',
});

/** Pressure at which Blond stops enjoying himself enough for Shubes to matter. */
export const SHUBES_INTERRUPTION_AT = 40;

/**
 * Everything the player can do to him, and what it is worth.
 *
 * The numbers are the argument: `chair` and `strike` are almost free and buy
 * almost nothing, and the two of them together cannot break him inside a
 * player's patience. `sauce` is the best of the physical options because it is
 * the only one that surprises him. Property is worth three to five times a
 * beating, and the car is not on this table at all — it is not a nudge, it is
 * the end.
 */
export const PRESSURE = Object.freeze({
  chair: 3,
  strike: 4,
  tenderizer: 8,
  ice: 5,
  tongs: 10,
  sauce: 18,
  watch: 14,
  camera: 12,
  pistol: 12,
  jacket: 16,
});

/** His things, in the order a player is likely to turn them over. */
export const BELONGINGS = Object.freeze([
  Object.freeze({ id: 'watch', label: 'A luxury wristwatch', node: 'propWatch' }),
  Object.freeze({ id: 'camera', label: 'A miniature spy camera', node: 'propCamera' }),
  Object.freeze({ id: 'pistol', label: 'A custom pistol', node: 'propPistol' }),
  Object.freeze({ id: 'jacket', label: 'A pristine tuxedo jacket', node: 'propJacket' }),
  Object.freeze({ id: 'keys', label: 'The keys to something parked out back', node: 'propKeys' }),
]);

/** The three ways it ends. */
export const ENDINGS = Object.freeze({
  LEFT: 'left_tied',
  UNTIED: 'untied_one_hand',
  SHOT: 'finished',
});

/**
 * The interrogation's rules, with no dialogue and no scene attached.
 *
 * Pure so the whole thing can be reasoned about — and tested — without a
 * browser, a club or a man in a chair.
 */
export function createInterrogation({ onBreak = () => {} } = {}) {
  const state = {
    pressure: 0,
    respect: 0,
    asked: new Set(),
    used: new Set(),
    handled: new Set(),
    shubesSeen: false,
    carThreatened: false,
    broken: false,
    answeredCounter: null,
    ending: null,
    compassion: false,
    cash: 0,
  };

  /** He notices a thing being done to him, and mostly does not mind. */
  function apply(kind) {
    const gain = PRESSURE[kind] ?? 0;
    if (state.used.has(kind) && kind !== 'chair' && kind !== 'strike') {
      /* A trick only works the first time. Repeating an environmental option
       * is not punished, it is simply worth nothing, which is the same lesson
       * the scene is teaching about the beating. */
      return { gain: 0, repeat: true, pressure: state.pressure };
    }
    state.used.add(kind);
    if (BELONGINGS.some((item) => item.id === kind)) state.handled.add(kind);
    state.pressure = Math.min(100, state.pressure + gain);
    return { gain, repeat: false, pressure: state.pressure };
  }

  return {
    get state() { return state; },
    get pressure() { return state.pressure; },
    get broken() { return state.broken; },

    apply,
    ask(id) { state.asked.add(id); return state.asked.size; },

    /** Shubes walks in once, and only when it is at its worst. */
    shubesDue() {
      return !state.shubesSeen && !state.broken && state.pressure >= SHUBES_INTERRUPTION_AT;
    },
    markShubes() { state.shubesSeen = true; },

    /**
     * The car. Available once the player has turned over anything of his, so
     * the discovery is earned rather than handed over, and unconditional once
     * it is — no threshold, no roll. He breaks.
     */
    carAvailable() { return state.handled.size > 0 && !state.broken; },
    threatenCar() {
      if (state.broken) return false;
      state.carThreatened = true;
      state.broken = true;
      state.pressure = 100;
      onBreak();
      return true;
    },

    /** His attempt to turn it round, and what the answer is worth. */
    answerCounter(id, respect = 0) {
      state.answeredCounter = id;
      state.respect += respect;
      return state.respect;
    },

    finish(ending, { cash = 0 } = {}) {
      state.ending = ending;
      state.compassion = ending === ENDINGS.UNTIED;
      state.cash = cash;
      if (ending === ENDINGS.UNTIED) state.respect -= 1;
      if (ending === ENDINGS.SHOT) state.respect += 1;
      return this.persist();
    },

    /** What the campaign keeps. Deliberately small and all facts. */
    persist() {
      return {
        completed: state.broken,
        informant: state.broken ? INFORMANT_NAME : null,
        meet: state.broken ? INFORMANT_MEET : null,
        ending: state.ending,
        compassion: state.compassion,
        gratinRespect: state.respect,
        cash: state.cash,
        card: state.ending === ENDINGS.SHOT,
        methods: [...state.used].sort(),
        sawShubes: state.shubesSeen,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* The words                                                           */
/* ------------------------------------------------------------------ */

const BLOND = 'Blond';
const GRATIN = 'Gratin';
const NUMBSKULL = 'Numbskull';
const SHUBES = 'The Shubenator';
const PROSPECT = 'Prospect';

/**
 * @param {object} hooks
 *   swing()          run the timing prompt for the cord
 *   apply(kind)      register an interrogation method
 *   ask(id)          register a question
 *   carAvailable()   has he had his things gone through
 *   threatenCar()    break him
 *   shubesDue()      is it bad enough for the mozzarella sticks
 *   markShubes()     the door has opened
 *   answerCounter()  respond to his pitch
 *   finish(ending)   end the scene
 */
export function buildLicenseToGrillScript({
  swing = () => {},
  apply = () => ({ gain: 0, repeat: false }),
  ask = () => 0,
  carAvailable = () => false,
  threatenCar = () => false,
  shubesDue = () => false,
  markShubes = () => {},
  answerCounter = () => 0,
  finish = () => {},
} = {}) {
  /**
   * After anything is done to him, the scene either cuts to Shubes or goes
   * back to the floor. One place decides, so the interruption cannot be
   * missed by whichever branch the player happened to take.
   */
  const backToWork = () => {
    if (shubesDue()) { markShubes(); return 'shubesEnters'; }
    return 'floor';
  };

  const blond = {
    /* ---------------- arrival ---------------- */
    open: {
      who: BLOND,
      line: 'Blond. James Blond. International intelligence, specialised operations, occasional baccarat.',
      hold: 5.0,
      next: 'resume',
    },
    resume: {
      who: GRATIN,
      line: 'I didn’t ask for your résumé.',
      hold: 2.6,
      next: 'brief',
    },
    brief: {
      who: GRATIN,
      line: 'He keeps laughing every time I hit him. I can’t tell if he’s tough or just British.',
      hold: 4.4,
      next: 'numbskullWeighsIn',
    },
    numbskullWeighsIn: {
      who: NUMBSKULL,
      line: 'I offered to hold him. Gratin says that’s not the part that isn’t working.',
      hold: 4.0,
      next: 'firstQuestion',
    },

    /* ---------------- the first round is on rails ---------------- */
    firstQuestion: {
      who: PROSPECT,
      line: 'Who hired you?',
      hold: 2.2,
      next: 'persuasive',
    },
    persuasive: {
      who: BLOND,
      line: 'You’ll need to be considerably more persuasive.',
      hold: 3.0,
      next: 'handOverCord',
    },
    handOverCord: {
      who: GRATIN,
      line: 'Aim low. Apparently that’s where England keeps its secrets.',
      hold: 3.6,
      options: [
        {
          tone: 'Swing',
          text: 'Take the cord.',
          next: () => { swing(); return null; },
        },
      ],
    },
    /* main.js re-enters here when the timing prompt resolves. */
    afterSwing: {
      who: BLOND,
      line: 'I’ve had rougher service in Monte Carlo.',
      hold: 3.2,
      next: 'gratinVindicated',
    },
    gratinVindicated: {
      who: GRATIN,
      line: 'See? That’s the crap he’s been doing all night.',
      hold: 3.2,
      next: 'floor',
    },

    /* ---------------- the floor: everything else hangs off here ---------------- */
    floor: {
      who: GRATIN,
      line: () => (carAvailable()
        ? 'He’s got a whole life in that jacket. Keep pulling.'
        : 'Well? He’s not going to volunteer.'),
      options: () => {
        const options = [
          { tone: 'Ask', text: 'Who inside the family are you talking to?', next: 'qInformant' },
          { tone: 'Ask', text: 'Where did the silver case go?', next: 'qCase' },
          { tone: 'Ask', text: 'Who sent you into our city?', next: 'qOrg' },
          { tone: 'Ask', text: 'How do you keep your hair like that?', next: 'qHair' },
          { tone: 'Hurt', text: 'Use something off the cart.', next: 'cart' },
          { tone: 'Search', text: 'Go through his things.', next: 'things' },
          { tone: 'Leave', text: 'Step back and let Gratin have another go.', next: 'gratinTurn' },
        ];
        if (carAvailable()) {
          options.splice(6, 0, { tone: 'Press', text: 'What kind of car?', next: 'car' });
        }
        return options;
      },
    },

    /* ---------------- questions ---------------- */
    qInformant: {
      who: BLOND,
      enter: () => { ask('informant'); },
        line: 'Inside? Goodness. You’ve assumed the answer is a person and not, say, a filing habit.',
      hold: 4.6,
      next: 'counterMaybe',
    },
    qCase: {
      who: BLOND,
      enter: () => { ask('case'); },
        line: 'The silver case went where silver cases go. I’d check the last man who told you it was silver.',
      hold: 4.8,
      next: 'counterMaybe',
    },
    qOrg: {
      who: BLOND,
      enter: () => { ask('org'); },
        line: 'Nobody sends me anywhere. I am invited. Occasionally I am invited very quietly indeed.',
      hold: 4.6,
      next: 'counterMaybe',
    },
    qHair: {
      who: BLOND,
      enter: () => { ask('hair'); },
        line: 'Sea salt, discipline, and excellent genetics.',
      hold: 3.2,
      next: 'hairAgain',
    },
    hairAgain: {
      who: GRATIN,
      line: 'Hit him again.',
      hold: 2.2,
      next: 'floor',
    },

    /* Blond turns it round, once, after any real question. */
    counterMaybe: {
      who: BLOND,
      line: 'You know, your employer will dispose of you the moment you become inconvenient.',
      hold: 4.4,
      next: 'counterGratin',
    },
    counterGratin: {
      who: GRATIN,
      line: 'Lou still has my bowling shoes. We’re tied together financially.',
      hold: 3.8,
      next: 'counterAtYou',
    },
    counterAtYou: {
      who: BLOND,
      line: 'And you. The new recruit. Do you truly believe these animals consider you family?',
      hold: 4.6,
      options: [
        {
          tone: 'Reply',
          text: 'More than your people considered you.',
          next: () => { answerCounter('cold', 2); return 'counterLanded'; },
        },
        {
          tone: 'Reply',
          text: 'I’m mostly here for the health insurance.',
          next: () => { answerCounter('joke', 1); return 'counterJoke'; },
        },
        {
          tone: 'Reply',
          text: 'Keep talking.',
          next: () => { answerCounter('invite', 1); return 'counterKeep'; },
        },
        {
          tone: 'Say nothing',
          text: '…',
          next: () => { answerCounter('silence', 2); return 'counterSilence'; },
        },
      ],
    },
    counterLanded: {
      who: GRATIN,
      line: 'Oh, that landed. Look at his face. That LANDED.',
      hold: 3.6,
      next: 'floor',
    },
    counterJoke: {
      who: NUMBSKULL,
      line: 'We do not have that. Gratin, do we have that?',
      hold: 3.4,
      next: 'floor',
    },
    counterKeep: {
      who: BLOND,
      line: 'I’d rather not, now you’ve said it like that.',
      hold: 3.0,
      next: 'floor',
    },
    counterSilence: {
      who: GRATIN,
      line: 'Nothing. He gave him nothing. Prospect, that’s the first professional thing anybody’s done in this room tonight.',
      hold: 5.0,
      next: 'floor',
    },

    /* ---------------- the cart ---------------- */
    cart: {
      who: GRATIN,
      line: 'Help yourself. It’s a kitchen.',
      options: [
        { tone: 'Cord', text: 'The chair again.', next: 'useChair' },
        { tone: 'Cord', text: 'Not the chair.', next: 'useStrike' },
        { tone: 'Tool', text: 'The meat tenderiser.', next: 'useTenderizer' },
        { tone: 'Tool', text: 'The ice bucket.', next: 'useIce' },
        { tone: 'Tool', text: 'The tongs.', next: 'useTongs' },
        { tone: 'Tool', text: 'The bottle with no label.', next: 'useSauce' },
        { tone: 'Back', text: 'Leave the cart alone.', next: 'floor' },
      ],
    },
    useChair: {
      who: BLOND,
      enter: () => { apply('chair'); },
        line: 'Do let me know when you begin.',
      hold: 2.8,
      next: () => backToWork(),
    },
    useStrike: {
      who: BLOND,
      enter: () => { apply('strike'); },
        line: 'Mm. Yes. That is certainly a thing that happened to me.',
      hold: 3.4,
      next: () => backToWork(),
    },
    useTenderizer: {
      who: BLOND,
      enter: () => { apply('tenderizer'); },
        line: 'Surely that violates some international convention.',
      hold: 3.4,
      next: 'tenderizerGratin',
    },
    tenderizerGratin: {
      who: GRATIN,
      line: 'This is Tennessee. We got our own conventions.',
      hold: 3.2,
      // He slams it on the cart. Nobody in this room actually uses it on him.
      next: () => backToWork(),
    },
    useIce: {
      who: BLOND,
      enter: () => { apply('ice'); },
        line: 'Cold.',
      hold: 1.8,
      next: 'iceGratin',
    },
    iceGratin: {
      who: GRATIN,
      line: 'Outstanding work, Prospect. We’ve confirmed his temperature.',
      hold: 3.6,
      next: () => backToWork(),
    },
    useTongs: {
      who: BLOND,
      enter: () => { apply('tongs'); },
        line: 'Let’s not be theatrical.',
      hold: 2.6,
      next: 'tongsGratin',
    },
    tongsGratin: {
      who: GRATIN,
      line: 'Buddy, you wore a tuxedo to spy on Sasquatches.',
      hold: 3.4,
      next: () => backToWork(),
    },
    useSauce: {
      who: GRATIN,
      enter: () => { apply('sauce'); },
        line: 'This is either hot sauce or fryer cleaner. Label fell off.',
      hold: 4.0,
      next: 'sauceBlond',
    },
    sauceBlond: {
      who: BLOND,
      line: 'Now — let us all be terribly calm about this. What was the question?',
      hold: 4.2,
      next: () => backToWork(),
    },

    /* ---------------- his things ---------------- */
    things: {
      who: NUMBSKULL,
      line: 'Everything off him’s in the box. I counted it twice so nobody says anything later.',
      options: () => {
        const options = BELONGINGS
          .filter((item) => item.id !== 'keys')
          .map((item) => ({ tone: 'Handle', text: item.label, next: item.node }));
        options.push({ tone: 'Keys', text: 'The keys to something parked out back.', next: 'propKeys' });
        options.push({ tone: 'Back', text: 'Put the box down.', next: 'floor' });
        return options;
      },
    },
    propWatch: {
      who: BLOND,
      enter: () => { apply('watch'); },
        line: 'Careful. That is not a watch, that is a receipt for eleven years of my life.',
      hold: 4.6,
      next: () => backToWork(),
    },
    propCamera: {
      who: BLOND,
      enter: () => { apply('camera'); },
        line: 'There is nothing on it. There is famously nothing on it. Please put it down.',
      hold: 4.4,
      next: () => backToWork(),
    },
    propPistol: {
      who: BLOND,
      enter: () => { apply('pistol'); },
        line: 'That is a fitted grip. You will not find another. I would rather you shot me with it than dropped it.',
      hold: 5.0,
      next: () => backToWork(),
    },
    propJacket: {
      who: BLOND,
      enter: () => { apply('jacket'); },
        line: 'That is not off a rack. A man in Naples is going to hear about this and he is going to be hurt.',
      hold: 5.0,
      next: 'jacketGratin',
    },
    jacketGratin: {
      who: GRATIN,
      line: 'Prospect. Prospect, look at him. He didn’t blink for the tongs.',
      hold: 4.0,
      next: () => backToWork(),
    },
    propKeys: {
      who: GRATIN,
      line: 'Car keys. Nice ones. Heavier than my car.',
      hold: 3.4,
      next: 'floor',
    },

    /* ---------------- the car, which is the end ---------------- */
    car: {
      who: PROSPECT,
      line: 'What kind of car?',
      hold: 2.0,
      next: 'carAnswer',
    },
    carAnswer: {
      who: BLOND,
      line: 'A 1964 Harrington V12.',
      hold: 2.8,
      next: 'carGratin',
    },
    carGratin: {
      who: GRATIN,
      line: 'Is that the little silver one out back?',
      hold: 3.0,
      next: 'carAlarm',
    },
    carAlarm: {
      who: BLOND,
      line: 'You stay away from that automobile.',
      hold: 2.8,
      next: 'carForklift',
    },
    carForklift: {
      who: GRATIN,
      line: 'Prospect, go get the forklift.',
      hold: 3.0,
      options: [
        {
          tone: 'Go',
          text: 'Turn towards the door.',
          next: () => { threatenCar(); return 'breaks'; },
        },
      ],
    },
    breaks: {
      who: BLOND,
      line: 'All right! The informant meets my handler every Thursday behind the laundromat.',
      hold: 5.2,
      next: 'nameDemanded',
    },
    nameDemanded: {
      who: GRATIN,
      line: 'Name.',
      hold: 1.6,
      next: 'theName',
    },
    theName: {
      who: BLOND,
      line: `${INFORMANT_NAME}.`,
      hold: 2.6,
      next: 'writtenDown',
    },
    writtenDown: {
      who: GRATIN,
      line: 'Numbskull, is there a pen. There’s a pen. I’m using the menu.',
      hold: 4.2,
      next: 'afterTheName',
    },
    afterTheName: {
      who: GRATIN,
      line: 'Anything else you want to ask him while he’s being helpful?',
      options: [
        { tone: 'Ask', text: 'Why didn’t you tell us before?', next: 'whyNot' },
        { tone: 'Done', text: 'Nothing. We’re finished here.', next: 'endings' },
      ],
    },
    whyNot: {
      who: BLOND,
      line: 'Because I assumed you were professionals.',
      hold: 3.2,
      next: 'gratinLooksRound',
    },
    gratinLooksRound: {
      who: GRATIN,
      line: 'That was your first mistake.',
      hold: 2.8,
      next: 'endings',
    },

    /* ---------------- how it ends ---------------- */
    endings: {
      who: GRATIN,
      line: 'So. What do we do with him.',
      options: [
        {
          tone: 'Leave',
          text: 'Leave him tied. Lou can decide.',
          next: () => { finish(ENDINGS.LEFT); return 'endLeft'; },
        },
        {
          tone: 'Mercy',
          text: 'Untie one hand.',
          next: () => { finish(ENDINGS.UNTIED); return 'endUntied'; },
        },
        {
          tone: 'Finish it',
          text: 'Finish the job.',
          next: () => { finish(ENDINGS.SHOT); return 'endShot'; },
        },
      ],
    },
    endLeft: {
      who: GRATIN,
      line: 'Good. He’s Lou’s problem now, and Lou likes problems that can’t stand up.',
      hold: 4.6,
    },
    endUntied: {
      who: GRATIN,
      line: 'One hand. ONE. And you’re explaining the plate to Lou, not me.',
      hold: 4.4,
    },
    endShot: {
      who: GRATIN,
      line: 'Right. Numbskull, the drain’s right there. And somebody find out whose car that is now.',
      hold: 5.2,
    },

    /* ---------------- Gratin has another go ---------------- */
    gratinTurn: {
      who: GRATIN,
      line: 'Fine. Watch. This is a technique.',
      hold: 3.0,
      next: 'gratinTechnique',
    },
    gratinTechnique: {
      who: BLOND,
      enter: () => { apply('chair'); },
        line: 'That is the same technique.',
      hold: 2.8,
      next: 'gratinAdmits',
    },
    gratinAdmits: {
      who: GRATIN,
      line: 'It’s a good technique.',
      hold: 2.4,
      next: () => backToWork(),
    },

    /* ---------------- the interruption ---------------- */
    shubesEnters: {
      who: SHUBES,
      line: SHUBENATOR_SIGNATURE_TAKES.firstMeeting.text,
      cue: SHUBENATOR_SIGNATURE_TAKES.firstMeeting.cue,
      direction: 'Cheerful, holding a plate. He has not registered the man tied to the chair and will not for some time.',
      hold: 2.6,
      next: 'shubesPrivate',
    },
    shubesPrivate: {
      who: GRATIN,
      line: 'Private meeting.',
      hold: 2.0,
      next: 'shubesIsThis',
    },
    shubesIsThis: {
      who: SHUBES,
      line: 'Oh. Is this the guy?',
      hold: 2.2,
      next: 'shubesWhatGuy',
    },
    shubesWhatGuy: {
      who: GRATIN,
      line: 'What guy?',
      hold: 1.8,
      next: 'shubesTheBritishGuy',
    },
    shubesTheBritishGuy: {
      who: SHUBES,
      line: 'The British guy tied to the chair.',
      hold: 2.6,
      next: 'shubesDenial',
    },
    shubesDenial: {
      who: GRATIN,
      line: 'There is no British guy tied to the chair.',
      hold: 3.0,
      next: 'shubesGoodEvening',
    },
    shubesGoodEvening: {
      who: BLOND,
      line: 'Good evening.',
      hold: 1.8,
      next: 'shubesHey',
    },
    shubesHey: {
      who: SHUBES,
      line: 'Hey.',
      // The pause is the joke. Nobody fills it.
      hold: 3.6,
      next: 'shubesOffers',
    },
    shubesOffers: {
      who: SHUBES,
      line: 'Mozzarella stick?',
      hold: 2.4,
      next: 'shubesAccepted',
    },
    shubesAccepted: {
      who: BLOND,
      line: 'Thank you.',
      hold: 1.8,
      next: 'shubesGetOut',
    },
    shubesGetOut: {
      who: GRATIN,
      line: 'Get out.',
      hold: 1.8,
      next: 'shubesBacksOut',
    },
    shubesBacksOut: {
      who: SHUBES,
      line: 'Okay. Well, let me know if you guys need anything.',
      hold: 3.6,
      next: 'shubesReturns',
    },
    shubesReturns: {
      who: SHUBES,
      line: 'Do you want me to lock this?',
      hold: 2.6,
      next: 'shubesYes',
    },
    shubesYes: {
      who: GRATIN,
      line: 'YES.',
      hold: 1.6,
      next: 'shubesAftermath',
    },
    shubesAftermath: {
      who: BLOND,
      line: 'Remarkably good.',
      hold: 2.2,
      next: 'shubesFrozen',
    },
    shubesFrozen: {
      who: GRATIN,
      line: 'They’re frozen.',
      hold: 2.6,
      next: 'floor',
    },
  };

  /** The door, before any of this. */
  const door = {
    knocking: {
      who: GRATIN,
      line: 'Prospect! Get back here. I need a second set of hands.',
      hold: 3.8,
    },
  };

  /** Much later, immaculate, as though none of it happened. */
  const callback = {
    open: {
      who: BLOND,
      line: 'I’ve been meaning to discuss your interrogation technique.',
      hold: 3.6,
      options: [
        { tone: 'Reply', text: 'Still driving the silver car?', next: 'walksAway' },
        /* The silence is written as silence, not as the words "say nothing" —
         * the tone label carries the meaning and the empty text keeps it out
         * of the recording ledger, the same way the counterattack does. */
        { tone: 'Say nothing', text: '…', next: null },
      ],
    },
    walksAway: {
      who: BLOND,
      line: '…',
      direction: 'He does not answer. He turns and leaves at a completely normal speed.',
      hold: 2.4,
    },
  };

  return applyBingVoiceCues({
    [CHARACTER_IDS.JAMES_BLOND]: blond,
    licenseToGrillDoor: door,
    licenseToGrillCallback: callback,
  });
}

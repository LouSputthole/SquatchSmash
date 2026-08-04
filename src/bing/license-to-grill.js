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
  /**
   * And breaking one of his things, on top of having picked it up.
   *
   * Deliberately the smallest number on this table except the cord, and that
   * is the argument, not an oversight. What moves him is a stranger holding
   * the thing and deciding. Once it is in pieces the decision has been made
   * and there is nothing left of it to threaten him with — which is the same
   * lesson the repeat rule teaches about the cart, and the reason the car
   * works: the car is still in one piece when he talks.
   *
   * Counted once per object, so a full table of smashed effects is worth 24 —
   * meaningful, and still nothing beside walking towards the door.
   */
  smash: 6,
});

/**
 * His things, laid out on the prep table against the north wall.
 *
 * They used to be a submenu: `things` opened a list and the player picked
 * words off it. The owner's note is that this was the wrong interface for the
 * best idea in the scene — *"each one you pick up triggers the voice dialogue
 * and then you have the option to smash it"* — so each one is now a physical
 * object on a real table with a real pickup, and this list is what the runtime
 * builds and what the recording ledger walks.
 *
 * `node` is the exchange his picking it up fires. `smashNode` is the exchange
 * for breaking it, and the keys deliberately have none: a set of car keys is
 * not the thing you break, it is the thing that tells you what to threaten.
 */
export const BELONGINGS = Object.freeze([
  Object.freeze({
    id: 'watch',
    label: 'A luxury wristwatch',
    hand: 'His wristwatch',
    icon: '⌚',
    node: 'propWatch',
    smashNode: 'smashWatch',
  }),
  Object.freeze({
    id: 'camera',
    label: 'A miniature spy camera',
    hand: 'His camera',
    icon: '📷',
    node: 'propCamera',
    smashNode: 'smashCamera',
  }),
  Object.freeze({
    id: 'pistol',
    label: 'A custom pistol',
    hand: 'His pistol',
    icon: '🔫',
    node: 'propPistol',
    smashNode: 'smashPistol',
  }),
  Object.freeze({
    id: 'jacket',
    label: 'A pristine tuxedo jacket',
    hand: 'His jacket',
    icon: '🧥',
    node: 'propJacket',
    smashNode: 'smashJacket',
  }),
  Object.freeze({
    id: 'keys',
    label: 'The keys to something parked out back',
    hand: 'His car keys',
    icon: '🔑',
    node: 'propKeys',
    smashNode: null,
  }),
]);

/** How many landed swings of the cord before Gratin points at the table. */
export const SWINGS_BEFORE_THE_TABLE = 3;

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
    /** Which of his things are in pieces. A subset of `handled`, always. */
    smashed: new Set(),
    /** Landed swings of the cord, which is how Gratin knows when to stop you. */
    swings: 0,
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
    /* Only swings that LAND. A cord that cracks on the floor is `chair`, and
     * so is Gratin's own demonstration; neither is Tony hitting the man, and
     * Gratin's "you have done that three times now" has to mean the three the
     * room actually watched. */
    if (kind === 'strike') state.swings += 1;
    if (BELONGINGS.some((item) => item.id === kind)) state.handled.add(kind);
    state.pressure = Math.min(100, state.pressure + gain);
    return { gain, repeat: false, pressure: state.pressure };
  }

  /**
   * Break one of his things.
   *
   * Separate from `apply` because it is a second act on an object that has
   * already been picked up, and because it must be countable per object —
   * `apply` dedupes by kind, so four smashes through it would have been worth
   * one. Recorded into `used` rather than into a new persisted field, so the
   * campaign's payload keeps its shape and `methods` simply reads
   * `smashed:watch` alongside `sauce`.
   */
  function smash(id) {
    if (!BELONGINGS.some((item) => item.id === id && item.smashNode)) {
      return { gain: 0, repeat: false, pressure: state.pressure };
    }
    if (state.smashed.has(id)) {
      return { gain: 0, repeat: true, pressure: state.pressure };
    }
    state.smashed.add(id);
    state.used.add(`smashed:${id}`);
    state.pressure = Math.min(100, state.pressure + PRESSURE.smash);
    return { gain: PRESSURE.smash, repeat: false, pressure: state.pressure };
  }

  return {
    get state() { return state; },
    get pressure() { return state.pressure; },
    get broken() { return state.broken; },

    apply,
    smash,
    /** Landed swings of the cord so far. */
    swings() { return state.swings; },
    /** Has this thing already been picked up off the table? */
    isHandled(id) { return state.handled.has(id); },
    /** Is it in pieces? */
    isSmashed(id) { return state.smashed.has(id); },
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
 *   takeCord()       put the cord in Tony's hands as a carried item
 *   apply(kind)      register an interrogation method
 *   ask(id)          register a question
 *   carAvailable()   has he had his things gone through
 *   threatenCar()    break him
 *   shubesDue()      is it bad enough for the mozzarella sticks
 *   markShubes()     the door has opened
 *   answerCounter()  respond to his pitch
 *   finish(ending)   end the scene
 *   broken()         has he given the name up yet
 *   handled()        how many of his things have been turned over
 *   handOff(node)    leave whoever you are talking to and go back to Blond,
 *                    at the named node, once the current line has finished
 */
export function buildLicenseToGrillScript({
  takeCord = () => {},
  apply = () => ({ gain: 0, repeat: false }),
  ask = () => 0,
  carAvailable = () => false,
  threatenCar = () => false,
  shubesDue = () => false,
  markShubes = () => {},
  answerCounter = () => 0,
  finish = () => {},
  broken = () => false,
  handled = () => 0,
  handOff = () => {},
} = {}) {
  /**
   * After anything is done to him at the chair, the scene either cuts to
   * Shubes or goes back to the floor. One place decides, so the interruption
   * cannot be missed by whichever branch the player happened to take.
   */
  const backToWork = () => {
    if (shubesDue()) { markShubes(); return 'shubesEnters'; }
    return 'floor';
  };

  /**
   * And the same decision for anything done at the TABLE, where ending the
   * thread is the right answer rather than opening a menu.
   *
   * Picking a man's watch up is not a conversation you are in the middle of:
   * you are across the room with your back to him, holding it. He says his
   * piece, it stops, and the player decides what to do with the object and
   * when to walk back. Only the Shubenator gets to override that, because his
   * whole joke is that he arrives at the wrong moment.
   */
  const backToTable = () => {
    if (shubesDue()) { markShubes(); return 'shubesEnters'; }
    return null;
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
    /* ---------------- the cord changes hands ----------------
     *
     * It used to be a timing bar: one option started a sweeping prompt, two
     * hits landed and the scene moved on whether or not the player had ever
     * wanted to hit anybody. Owner's note, 2026-08-04: *"Gratin should hand me
     * the cord and let it come to my inventory like an item"* and *"I want to
     * be able to whip him on command."* So he hands it over, it is a thing
     * Tony is carrying for the rest of the evening, and every swing after this
     * is the player's own decision at the moment they take it.
     *
     * The instruction is deliberately NOT in this node. Gratin finishes, and
     * the runtime puts the button on screen in the beat afterwards — see
     * `sayThenInstruct` in src/silvercase/main.js and the tone doctrine's
     * "HUD instructions never replace a character". */
    handOverCord: {
      who: GRATIN,
      line: 'Here. Off the fryer. It was a cord before it was anything else, so nobody has to explain it later.',
      hold: 6.2,
      options: [
        {
          tone: 'Take',
          text: 'Take the cord.',
          next: () => { takeCord(); return 'cordInHand'; },
        },
      ],
    },
    cordInHand: {
      who: GRATIN,
      line: 'Aim low. Apparently that’s where England keeps its secrets.',
      hold: 3.6,
    },

    /* ---------------- the cord, on command ----------------
     *
     * The runtime plays one of these each time a swing actually lands, in
     * order, and the third one is where Gratin gives up on the beating and
     * points at the table. He is the game's own instructions in this room and
     * it is far better coming out of him than out of a caption.
     *
     * `afterSwing` keeps its old name because it is the first of them and the
     * scene has always re-entered on it. */
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
    },
    swingTwo: {
      who: BLOND,
      line: 'Do keep going. I should hate to be the only one in this room getting anything out of it.',
      hold: 5.0,
      next: 'swingTwoNumbskull',
    },
    swingTwoNumbskull: {
      who: NUMBSKULL,
      line: 'Is he supposed to be doing that with his face?',
      hold: 3.2,
    },
    swingThree: {
      who: BLOND,
      line: 'There. That is all of it. That is everything my body has to offer you and I am afraid it is not very much.',
      hold: 6.6,
      next: 'tableNudge',
    },
    tableNudge: {
      who: GRATIN,
      line: 'Stop. Prospect — stop. Look at his face. He’s been counting them.',
      hold: 4.8,
      next: 'tableNudgeTable',
    },
    tableNudgeTable: {
      who: GRATIN,
      line: 'Everything out of his pockets is on the table behind you. Numbskull laid it out. Go and pick his life up instead of hitting him with a fryer part.',
      hold: 8.0,
      next: 'tableNudgeBlond',
    },
    tableNudgeBlond: {
      who: BLOND,
      line: 'I would very much rather you didn’t.',
      hold: 3.0,
    },
    /* Four, five, nine. A player who keeps swinging after Gratin has told him
     * to stop gets told, every time, that it is not working — which is the
     * scene's whole argument and has to survive being ignored.
     *
     * These two carry no `enter`: the runtime applies the method itself,
     * because whether a swing lands is decided by where Tony is standing and
     * not by which line comes next. */
    swingAgain: {
      who: BLOND,
      line: 'Mm. Yes. That is certainly a thing that happened to me.',
      hold: 3.4,
    },
    /* And a swing that goes wide — off the chair back, off the drain cover,
     * off the floor. Worth `chair`, which is three, which is nothing. */
    swingWide: {
      who: BLOND,
      line: 'Do let me know when you begin.',
      hold: 2.8,
    },

    /* ---------------- the floor: everything else hangs off here ---------------- */
    floor: {
      who: GRATIN,
      line: () => (carAvailable()
        ? 'He’s got a whole life in that jacket. Keep pulling.'
        : 'Well? He’s not going to volunteer.'),
      /* No "go through his things" any more. That was a submenu standing in
       * for a room, and the room exists: his effects are laid out on the prep
       * table by the door and each one is picked up with both hands. What is
       * left here is what a conversation IS — the questions, the cart, and
       * standing back to let Gratin embarrass himself again. */
      options: () => {
        const options = [
          { tone: 'Ask', text: 'Who inside the family are you talking to?', next: 'qInformant' },
          { tone: 'Ask', text: 'Where did the silver case go?', next: 'qCase' },
          { tone: 'Ask', text: 'Who sent you into our city?', next: 'qOrg' },
          { tone: 'Ask', text: 'How do you keep your hair like that?', next: 'qHair' },
          { tone: 'Hurt', text: 'Use something off the cart.', next: 'cart' },
          { tone: 'Leave', text: 'Step back and let Gratin have another go.', next: 'gratinTurn' },
        ];
        if (carAvailable()) {
          options.splice(5, 0, { tone: 'Press', text: 'What kind of car?', next: 'car' });
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
      /* The two cord entries are gone from here. The cord is in Tony's hands
       * now and swinging it is a mouse button, not a line on a menu — leaving
       * them would have offered the player a worse version of a thing they
       * were already holding. */
      options: [
        { tone: 'Tool', text: 'The meat tenderiser.', next: 'useTenderizer' },
        { tone: 'Tool', text: 'The ice bucket.', next: 'useIce' },
        { tone: 'Tool', text: 'The tongs.', next: 'useTongs' },
        { tone: 'Tool', text: 'The bottle with no label.', next: 'useSauce' },
        { tone: 'Back', text: 'Leave the cart alone.', next: 'floor' },
      ],
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

    /* ---------------- his things, off the table ----------------
     *
     * The writing is the writing it always was; what changed is who asks for
     * it. There is no menu. Each of these fires because the player has walked
     * across the room, looked at an object on a steel table and picked it up
     * with their own hands, which is the only reason any of it lands: he is
     * not answering a question, he is watching a stranger hold his property.
     *
     * They all end their thread rather than reopening the floor — the player
     * is at the table with their back to him, holding the thing, and what
     * happens next is theirs. */
    propWatch: {
      who: BLOND,
      enter: () => { apply('watch'); },
        line: 'Careful. That is not a watch, that is a receipt for eleven years of my life.',
      hold: 4.6,
      next: () => backToTable(),
    },
    propCamera: {
      who: BLOND,
      enter: () => { apply('camera'); },
        line: 'There is nothing on it. There is famously nothing on it. Please put it down.',
      hold: 4.4,
      next: () => backToTable(),
    },
    propPistol: {
      who: BLOND,
      enter: () => { apply('pistol'); },
        line: 'That is a fitted grip. You will not find another. I would rather you shot me with it than dropped it.',
      hold: 5.0,
      next: () => backToTable(),
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
      next: () => backToTable(),
    },
    propKeys: {
      who: GRATIN,
      line: 'Car keys. Nice ones. Heavier than my car.',
      hold: 3.4,
      next: 'propKeysBlond',
    },
    propKeysBlond: {
      who: BLOND,
      /* The first and only time in this room that he does not have a line
       * ready. He says nothing, and Gratin does not notice, and the player
       * either notices or does not — which is the scene. */
      line: '…',
      direction: 'He does not answer. It is the only question all night he has not had a joke prepared for, and he knows the room can hear that.',
      hold: 2.6,
    },

    /* ---------------- and breaking them ----------------
     *
     * The other half of the owner's note: *"then you have the option to smash
     * it."* Worth `PRESSURE.smash` — six — and no more, because a thing in
     * pieces cannot be threatened with any more. What it buys is this writing,
     * which is the coldest he gets, and the player finding out that the man
     * who laughed through a beating has a floor after all. */
    smashWatch: {
      who: BLOND,
      line: 'That was my father’s. You have just done the only thing that will be remembered about tonight.',
      hold: 6.0,
      next: 'smashWatchGratin',
    },
    smashWatchGratin: {
      who: GRATIN,
      line: 'There it is. THERE it is. Prospect — everything on that table. All of it.',
      hold: 5.2,
      next: () => backToTable(),
    },
    smashCamera: {
      who: BLOND,
      line: 'There was nothing on it. Now there is nothing on it in a way I shall have to explain in writing.',
      hold: 6.0,
      next: () => backToTable(),
    },
    smashPistol: {
      who: BLOND,
      line: 'You have bent the frame. That was fitted to my hand. Do you understand that it cannot be replaced, only apologised for.',
      hold: 7.2,
      next: 'smashPistolNumbskull',
    },
    smashPistolNumbskull: {
      who: NUMBSKULL,
      line: 'That was worth my car.',
      hold: 2.6,
      next: () => backToTable(),
    },
    smashJacket: {
      who: BLOND,
      line: 'You have torn it at the shoulder. That is not a repair. There is no repair. That is a funeral.',
      hold: 6.4,
      next: () => backToTable(),
    },
    /* And the one thing in the room he is not allowed to break, because it is
     * the only good news anybody in here has had all night. */
    smashKeys: {
      who: GRATIN,
      line: 'Not those. Prospect, look at me — not those. Those are the only good news in this room.',
      hold: 5.6,
      next: () => backToTable(),
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

  /* ------------------------------------------------------------------ */
  /* The other two people in the room                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Gratin, in the store room, on this specific evening.
   *
   * He had the club's ordinary floor barks in here, which is the owner's note
   * and is also the whole problem with borrowing a man off the floor: the
   * figure moved rooms and the writing did not. On the floor he is a man in a
   * booth being loyal to the wrong shrimp. In here he is the man who caught a
   * spy, has been alone with him since seven, and has run out of ideas — and
   * he is the game's own instructions, because he is the one who knows what
   * the cart and the box are for.
   *
   * Every branch comes back to `open` so this is a thing you can stand and
   * ask, and the last option hands the player back to the chair, which is the
   * answer to "where do I start".
   */
  const gratin = {
    open: {
      who: GRATIN,
      line: () => {
        if (broken()) return 'We got a name out of him. Whatever you do next, do it away from my shoes.';
        if (carAvailable()) return 'You are getting somewhere. Whatever you just picked up, pick up more of it.';
        return 'What are you standing there for? He is four feet away and he is having a lovely time.';
      },
      options: () => {
        const options = [
          { tone: 'Ask', text: 'What do you actually need from me?', next: 'need' },
          { tone: 'Ask', text: 'What have you already tried?', next: 'tried' },
          { tone: 'Ask', text: 'Who is he?', next: 'who' },
        ];
        if (!broken()) {
          options.push({ tone: 'Ask', text: 'Why can’t you do this yourself?', next: 'why' });
        }
        if (handled() > 0 && !broken()) {
          options.push({ tone: 'Ask', text: 'He went quiet when I touched his things.', next: 'noticed' });
        }
        options.push({ tone: 'Go', text: 'Let me have a go at him.', next: 'handOff' });
        options.push({ tone: 'Back', text: 'Nothing. Forget it.', next: null });
        return options;
      },
    },
    need: {
      who: GRATIN,
      line: 'A second set of hands and a second face. He has had mine all night and he has started finishing my sentences.',
      hold: 5.0,
      next: 'needTools',
    },
    needTools: {
      who: GRATIN,
      line: 'Cart is on your left, it is a kitchen, help yourself. Everything he had in his pockets is on the table by the door. Use one, use the other, use both. Just get me a name.',
      hold: 7.4,
      next: 'open',
    },
    tried: {
      who: GRATIN,
      line: 'Hitting him. Hitting him harder. Waiting a while. Hitting him during the waiting.',
      hold: 4.8,
      next: 'triedFace',
    },
    triedFace: {
      who: GRATIN,
      line: 'Every single time he looks at me like I have brought him the wrong wine.',
      hold: 4.2,
      next: 'open',
    },
    who: {
      who: GRATIN,
      line: 'Foreign. Intelligence, the proper kind. Walked across our lot with a camera the size of a lighter and did not run when I said his name out loud.',
      hold: 7.0,
      next: 'whoWorry',
    },
    whoWorry: {
      who: GRATIN,
      line: 'That last part is the part I do not like.',
      hold: 2.8,
      next: 'open',
    },
    why: {
      who: GRATIN,
      line: 'Because I have been in this room since seven o’clock and I am starting to like him.',
      hold: 4.6,
      next: 'open',
    },
    noticed: {
      who: GRATIN,
      line: 'I saw it. Hit him and he writes a review. Touch one thing that belongs to him and he forgets to be charming.',
      hold: 6.2,
      next: 'noticedMore',
    },
    noticedMore: {
      who: GRATIN,
      line: 'So stop hitting him and start going through what’s on that table.',
      hold: 4.0,
      next: 'open',
    },
    handOff: {
      who: GRATIN,
      line: 'Good. And Prospect — watch his face, not his mouth. His mouth is a professional.',
      hold: 5.0,
      next: () => { handOff('floor'); return null; },
    },
  };

  /**
   * Numbskull, who emptied the man out onto the table, in the corner, being no
   * help and total help.
   *
   * He is the belongings. The scene's whole argument is that the table is
   * worth more than the cord, and he is the man standing next to the table
   * saying so without knowing he is saying it.
   *
   * He used to be HOLDING the box, and handing it over was a dialogue option
   * that opened a submenu of nouns. The objects are on a real table now, so
   * what is left of him is the part that was always the good part: the
   * inventory clerk who has priced a spy's watch against his own car and is
   * not allowed to go outside and look at the thing the keys open.
   */
  const numbskull = {
    open: {
      who: NUMBSKULL,
      line: () => (broken()
        ? 'He gave it up. I want it on the record that nobody needed holding.'
        : 'Everything off him is laid out on that table. Watch, camera, the little gun, and keys to something.'),
      options: () => {
        const options = [
          { tone: 'Ask', text: 'Anything on there worth anything?', next: 'worth' },
          { tone: 'Ask', text: 'You holding up, Numbskull?', next: 'holding' },
        ];
        if (!broken()) {
          options.push({ tone: 'Ask', text: 'Did you go through it properly?', next: 'theBox' });
        }
        options.push({ tone: 'Back', text: 'Later.', next: null });
        return options;
      },
    },
    worth: {
      who: NUMBSKULL,
      line: 'The watch is worth my car. The little gun is worth my car. The keys go to something I have not been allowed to walk out and look at.',
      hold: 7.0,
      next: 'worthWall',
    },
    worthWall: {
      who: NUMBSKULL,
      line: 'Gratin said do not go and look at it. So I have been looking at this wall instead.',
      hold: 4.8,
      next: 'open',
    },
    holding: {
      who: NUMBSKULL,
      line: 'I am good. I said early on I would hold him still and everybody went quiet at me.',
      hold: 5.0,
      next: 'holdingStill',
    },
    holdingStill: {
      who: NUMBSKULL,
      line: 'I do still think it would help.',
      hold: 2.6,
      next: 'open',
    },
    theBox: {
      who: NUMBSKULL,
      line: 'Twice. Pockets, lining, both shoes. Then I put it all out where you could see it, in a line, like a shop.',
      hold: 6.6,
      next: 'theBoxDrain',
    },
    theBoxDrain: {
      who: NUMBSKULL,
      line: 'Do not set any of it down on the floor. The floor in here has a drain in it.',
      hold: 5.0,
      next: 'open',
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
    licenseToGrillGratin: gratin,
    licenseToGrillNumbskull: numbskull,
    licenseToGrillDoor: door,
    licenseToGrillCallback: callback,
  });
}

/**
 * Which scene tree belongs to whom while the store room is running.
 *
 * Exported rather than inlined in the runtime so `tools/bing-vo.mjs` and the
 * tests can ask the same question the club asks, and so nothing has to guess
 * at a scope name from a character id.
 */
export const SCENE_TREES = Object.freeze({
  [CHARACTER_IDS.GRATIN]: 'licenseToGrillGratin',
  [CHARACTER_IDS.NUMBSKULL]: 'licenseToGrillNumbskull',
});

/**
 * Front and Center -- entry point.
 *
 * Same engine as the flat and the Bing: the first-person controller, the
 * look-at interaction system, the HUD, the audio engine, the intoxication
 * model and the non-modal dialogue box all come straight out of src/core and
 * src/bing. What is new is the building, the woman walking next to you, a
 * score for how you are behaving, and two moments -- exactly two -- where the
 * camera is taken off you.
 *
 * The rule the Bing was built on still holds everywhere else: you do not lose
 * control because somebody important started talking. Every conversation in
 * here can be walked out of, including the one about what you do for a living.
 */
import * as THREE from 'three';
import { SilverAudioEngine } from './audio.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { Drunk, BEER_UNITS, WHISKEY_UNITS } from '../core/drunk.js';
import { Highs } from '../core/highs.js';
import { PostFX } from '../core/postfx.js';
import { Inventory, ITEMS } from '../core/inventory.js';
import { makeHeldDrinks } from '../world/props.js';
import { makeMaterials } from '../world/materials.js';
import { roomEnvironment } from '../world/textures.js';

import { buildRoom, ROOMS, roomAt, zoneAt, CELLAR_Y, STAGE_H, STEP_UP } from './room.js';
import { populate, makeBand } from './cast.js';
import { Date_ } from './date.js';
import { Woo, EVENTS, TIP_POINTS, TIP_TOTAL } from './woo.js';
import { Mission, ENDINGS, BACK_OF_HOUSE_TOTAL } from './mission.js';
import { Dialogue } from '../bing/dialogue.js';
import { buildScripts, DATE, DATE_BARKS, BARKS, NOTES, VOICE_OF, PROFILE_OF } from './script.js';
import { Performance, Sway, SET } from './perform.js';
import { makeTaxi } from './vehicle.js';
import { SCENE_IDS, createCampaign, navigateCampaign } from '../core/campaign.js';
import { createSilverStory } from '../core/silver-story.js';
import { getPreviewRuntime } from '../core/preview-mode.js';

/* The campaign owns the save. Loading this page claims the scene; the story
 * class gates the evening on the Motel being finished and on Margo having
 * rung, and folds the ending into campaign state. In preview mode
 * createCampaign() hands back page-local memory instead of localStorage. */
const campaign = createCampaign();
const story = createSilverStory({ campaign });

/** Why the evening cannot start, in the same one-excuse voice as the door. */
const UNAVAILABLE = {
  already_complete: 'You already had this evening. It went how it went.',
  motel_incomplete: 'There is a night’s work in front of this and you have not done it.',
  margo_call_incomplete: 'Nobody has asked you to dinner.',
  mission_locked: 'There is no table in your name.',
};

/** Enough to tip everybody and buy dinner, with room to be stupid once. */
const START_CASH = Math.max(600, TIP_TOTAL + 240);
const DRINK_TIME = 2.4;

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');
const fxDrunk = document.getElementById('fx-drunk');

const ui = {
  objectives: document.getElementById('objectives'),
  objectiveList: document.querySelector('#objectives ul'),
  wallet: document.getElementById('wallet'),
  cash: document.querySelector('#wallet .cash'),
  woo: document.getElementById('woo'),
  wooFill: document.querySelector('#woo .bar i'),
  wooNum: document.querySelector('#woo .num'),
  wooNote: document.querySelector('#woo .note'),
  tips: document.getElementById('tips'),
  dialogue: {
    root: document.getElementById('dialogue'),
    name: document.querySelector('#dialogue .who'),
    line: document.querySelector('#dialogue .line'),
    options: document.querySelector('#dialogue .options'),
  },
};

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  window.__squatchSceneFail?.(
    'This device cannot run the club',
    'It needs WebGL and the browser would not give us a context. ' + (err?.message || ''),
  );
  throw err;
}
/* The room is already geometry-heavy. Rendering four fragments for every CSS
 * pixel on a 2x display bought almost no visible detail through the film grain
 * and was the largest avoidable GPU cost in this scene. */
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 300);
scene.add(camera);

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.24;
  pmrem.dispose();
  src.dispose();
}

const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
/* The shared bloom is tuned for the flat — a dark room where anything over
 * 0.82 linear is genuinely a light. A supper club at full house is made of
 * lit white tablecloth, every metre of which clears that threshold, so the
 * whole room bloomed: the wave-2 note called the table lamps "glaring" and
 * could not see Margo behind the flare, and the flare was mostly the cloth.
 * The club raises the bar so only real emitters and the hot pool directly
 * under a fitting bloom, and takes a third off the strength. The flat's own
 * numbers are untouched — this is this room's rig, set on this room's pass. */
if (postfx.bloom) {
  postfx.bloom.threshold = 1.35;
  postfx.bloom.strength = 0.34;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* Systems                                                             */
/* ------------------------------------------------------------------ */

const audio = new SilverAudioEngine();
const hud = new Hud();
const interaction = new InteractionSystem(camera, hud);
const world = { colliders: [], floorZones: [], groundAt: () => 0 };
const player = new Player(camera, world);
/* The building has two levels stacked, so the floor height depends on which
 * one you are already on. Everything that walks answers for itself. */
world.groundAt = (x, z) => room?.groundAt(x, z, player.position.y - player.eyeHeight) ?? 0;
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const drunk = new Drunk();
const highs = new Highs();
/* Every campaign scene speaks the same five-box inventory language. Silver
 * starts empty, but empty pockets are still useful information. */
const inventory = new Inventory(5);
inventory.onChange = (inv) => {
  hud.setInventory(inv, ITEMS);
  hud.setHand(inv.held ? ITEMS[inv.held] : null);
};

/**
 * Accessibility.
 *
 * Four switches on the start screen. The project has no options menu — the
 * flat has one screen and so does the Bing — so bolting one on would be a
 * bigger change than the mission it is for. These live in localStorage under
 * `squatch.*`, so when the flat and the Bing want them they are already there.
 *
 * Two things are honoured without a switch, because they should not be
 * optional: every intelligible line is subtitled (the dialogue box *is* the
 * subtitle), and nothing in the HUD says anything with colour alone — the Woo
 * strip carries the same information in its number and its label, the phone
 * ringing is a visible pulse as well as a sound, and the stage cue is a
 * lighting change the player is looking at.
 */
const settings = {
  subtitles: localStorage.getItem('squatch.subs') !== '0',
  bigSubtitles: localStorage.getItem('squatch.bigsubs') === '1',
  reduceShake: localStorage.getItem('squatch.reduceShake') === '1',
  assist: localStorage.getItem('squatch.assist') === '1',
};

function applySettings() {
  document.body.classList.toggle('nosubs', !settings.subtitles);
  document.body.classList.toggle('bigsubs', settings.bigSubtitles);
}

for (const [id, key, store] of [
  ['opt-subs', 'subtitles', 'squatch.subs'],
  ['opt-bigsubs', 'bigSubtitles', 'squatch.bigsubs'],
  ['opt-shake', 'reduceShake', 'squatch.reduceShake'],
  ['opt-assist', 'assist', 'squatch.assist'],
]) {
  const el = document.getElementById(id);
  if (!el) continue;
  el.checked = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked;
    try {
      localStorage.setItem(store, el.checked ? '1' : '0');
    } catch { /* private browsing; it still applies this session */ }
    applySettings();
  });
}
applySettings();

const game = {
  started: false,
  paused: false,
  over: false,
  money: START_CASH,
  seated: false,
  heldDrink: null,
  drinking: 0,
  elapsed: 0,
  noted: new Set(),
  known: new Set(),          // things the player has been told and may recall
  greeted: new Set(),
  scene: null,               // the running cutscene, if any
  round: null,               // which conversation round is up
  pausedSeatedRound: null,   // Margo's exact table thread, paused by standing
  barkAt: 14,
  lastBark: -1,
  floorFrontDoorBarked: false,
  swayRunning: false,
  /** Up between "get up" and the first bar, which is not nothing. */
  swayStarting: false,
  checkpoint: null,
  /* Every voice cue the evening has asked for, recorded or not. The only way
   * to see that a line is wired before the recording exists. */
  voLog: [],
};

window.__squatchStage?.('Wetting the pavement…');
const room = buildRoom(scene, { renderer });
world.colliders = room.colliders;
world.floorZones = room.floorZones;

window.__squatchStage?.('Opening for the evening…');
const cast = populate(scene, room);
const band = makeBand(scene, room);
const taxi = makeTaxi(scene, room.anchors.dropOff);

/* ------------------------------------------------------------------ */
/* The score                                                           */
/* ------------------------------------------------------------------ */

const woo = new Woo({
  onChange: (score, delta, label) => paintWoo(score, delta, label),
  onEvent: (id, delta) => {
    if (delta > 0) audio.play('woo.up', { volume: 0.5 });
    else if (delta < 0) audio.play('woo.down', { volume: 0.5 });
    void id;
  },
  onStreak: (n) => {
    audio.play('woo.streak', { volume: 0.6 });
    hud.toast('EVERYBODY EATS', 'good');
    narrate(`<em>Every last one of them. ${n} people, and not one of them said thank you like it was a favour.</em>`, 5200);
    mission.complete('tips');
  },
});

const mission = new Mission({
  onState: onMissionState,
  onObjective: paintObjectives,
  onNote: (text) => narrate(text, 4600),
  onImpatient: (key) => date.bark(key, DATE_BARKS[key]),
  onCheckpoint: saveCheckpoint,
});

/* ------------------------------------------------------------------ *
 * Exact-cue voice.
 *
 * The scene now has one exact recording slot for every authored line. This is
 * the same arrangement the Bing uses and for the same reason: `audio.say()`
 * picks among `vo.<group>.<n>` siblings, which is
 * right for a bark and wrong for a script — a subtitled line has to play ITS
 * recording, and half the trees in here belong to two people at once, so a
 * group pick would put the waiter's words in Margo's mouth.
 *
 * So: one named cue, played when its file exists, silent when it does not.
 * Nothing synthesises a voice; a wrong voice is worse than no voice, and the
 * subtitle is the accessibility answer either way. Every attempt lands in
 * `game.voLog` whether or not there is audio behind it, which is what lets
 * the verifier prove the wiring fires before a single mp3 has been made.
 * ------------------------------------------------------------------ */
/**
 * When the line currently in somebody's mouth is due to finish.
 *
 * `solo` stops whatever is speaking, which is correct for a scene shot on one
 * camera and was catastrophic everywhere else. `greet()` starts the man's line
 * and then, on the *same frame*, fires Margo's recognition bark — and the
 * bark's own solo stop cut him off. Measured in the browser: the cellarman's
 * 5.85s take played for 0.89s and then stopped, `naturalEnd: false`. That is
 * every recorded line on the service route, the manager's, and Vinny's four,
 * all of which are on disk, indexed, decoded, and were being played for about
 * a syllable each. Which is exactly the report — "still missing some voice
 * lines from the manager" — and it was never a casting or delivery gap.
 *
 * So a bark is `ambient`: it waits for the floor rather than taking it. One
 * deferred bark at a time, flushed from the frame loop, and abandoned if it
 * has waited longer than it is worth — a remark about the cellar is not worth
 * hearing four lines later.
 */
let voiceFreeAt = 0;

function voiceSpeaking() { return performance.now() < voiceFreeAt; }

/**
 * The queue of beats waiting for the floor.
 *
 * This started as one slot, which was right for the problem it was written
 * for — a bark landing on top of a recorded line — and wrong for the one the
 * owner found next: "there's a lot of dialogue and action subtitles playing
 * simultaneously at once during the opening scene."
 *
 * They were. The first fifteen seconds of the mission fires the "as far back
 * as you can remember" line at the moment the overlay goes, the "she is out of
 * the car" line the instant `arrived` lands, the street's own narrator note
 * the first time `roomAt` answers 'street', and one of her barks on top of all
 * three — and `hud.say` is a single element that replaces its own contents
 * with no queue behind it, so each of those wiped the one before it after
 * about a second. Four written lines, none of them readable.
 *
 * One slot cannot hold four. So it is a short queue with the same two rules
 * the slot had: only one thing has the floor at a time, and anything that has
 * waited longer than it is worth is dropped rather than said late — a remark
 * about the pavement is not worth reading in the cellar.
 */
const waiting = [];
/** A beat of air between one line leaving the screen and the next arriving. */
const NARRATION_GAP = 260;
let narrationGapAt = 0;

/** Whether anything is currently using the one subtitle line, or the one voice. */
function floorBusy() {
  return hud.saying || voiceSpeaking() || performance.now() < narrationGapAt;
}

/** The whole deferred beat, not only its audio: subtitle and take travel together. */
function deferVoice(job, { expires = 11000 } = {}) {
  waiting.push({ job, expiresAt: performance.now() + expires });
  /* Four is already more than anybody will read. Beyond that the oldest go,
   * because a backlog means the scene is talking over itself somewhere and
   * the newest line is the one that still describes what is on screen. */
  if (waiting.length > 4) waiting.splice(0, waiting.length - 4);
}

/**
 * Narration, queued: the action subtitles, her barks, and the authored beats
 * that are not part of a conversation tree.
 *
 * Not used by `barks()` — the room's own overheard voices are rationed to one
 * every eleven to twenty-eight seconds already, are never addressed to the
 * player, and are the one thing in here that is better dropped than delayed.
 */
function narrate(text, ms = 4200, { cue = null, volume = 0.9, expires = 14000 } = {}) {
  deferVoice(() => {
    hud.say(text, ms);
    narrationGapAt = performance.now() + ms + NARRATION_GAP;
    if (cue) voiceCue(cue, { volume });
  }, { expires });
  flushVoice();
}

function flushVoice() {
  while (waiting.length) {
    if (floorBusy()) {
      /* Only the head can time out: the queue is in the order things were
       * said, and dropping from the middle would reorder the evening. */
      if (performance.now() > waiting[0].expiresAt) { waiting.shift(); continue; }
      return;
    }
    const { job } = waiting.shift();
    job();
    /* One per pass. `job` is what puts the line on screen, so the next trip
     * round sees a busy floor rather than clearing it again immediately. */
    return;
  }
}

function voiceCue(name, { volume = 0.9, delay = 0, solo = true } = {}) {
  if (!name) return false;
  game.voLog.push(name);
  if (game.voLog.length > 256) game.voLog.shift();
  if (solo) {
    audio._vo?.stop?.();
    audio._vo = null;
  }
  if (!audio.ready) return false;
  const bank = audio.buffers?.get(name);
  if (!bank?.length) return false;
  const src = audio.play(name, { volume, delay });
  if (solo) audio._vo = src;
  const seconds = delay + (src?.buffer ? src.buffer.duration : 1.6);
  audio.hold(seconds + 0.25);
  /* Only a solo line holds the floor. The room's own overheard voices are
   * played `solo: false` on purpose and must not make a bark wait. */
  if (solo) voiceFreeAt = performance.now() + seconds * 1000;
  return true;
}

/** A node's or a reply's cue: a string, or a function when the line is one. */
const nodeCue = (owner) => (typeof owner?.cue === 'function' ? owner.cue() : owner?.cue);
const cueSeconds = (name) => audio.buffers?.get(name)?.[0]?.duration ?? 0;

const dialogue = new Dialogue(ui.dialogue, {
  onLine: (text, who, node) => {
    performance_.setDucked(true);
    voiceCue(nodeCue(node));
  },
  /* The replies are Prospect's and he has never had a voice in this scene;
   * the hook is here so that when he gets one it is a `cue` on the option and
   * nothing else has to move. */
  onChoice: (opt) => voiceCue(nodeCue(opt)),
  cueSeconds,
  onEnd: () => {
    performance_.setDucked(false);
    game.talkingTo = null;
  },
});

/* ------------------------------------------------------------------ */
/* Her                                                                 */
/* ------------------------------------------------------------------ */

const date = new Date_(scene, room, {
  /* Deferred, not dropped, and subtitle-with-take. She is reacting to
   * something somebody has just said, so she says it when he has finished
   * saying it — which is also what a person does. */
  onBark: (line, key, i) => narrate(`<em>${DATE.name}:</em> ${line}`, 4600, {
    cue: `vo.silver.margo.bark.${key}.${i + 1}`, volume: 0.85,
  }),
  onLeftBehind: () => {
    const n = mission.leftBehind();
    woo.fire('Woo.DateLeftBehind');
    date.bark('behind', DATE_BARKS.behind);
    if (n === 3) narrate('<em>She has stopped hurrying to keep up, which is a decision rather than a speed.</em>', 5000);
  },
});

const performance_ = new Performance({
  audio,
  room,
  band,
  onNumber: (n) => {
    hud.toast(`♫ ${n.title} — the Midnight Pines`, '');
    /* Queued, with its take. The bandleader introducing a number is the one
     * line in the scene most likely to arrive while the announcer is still
     * finishing his — see `startShowCutscene`, which now holds the band until
     * the announcement is actually over rather than at a hardcoded 8.2s. */
    if (n.say) narrate(`<em>${n.lead}:</em> ${n.say}`, 5000, { cue: n.cue });
    if (n.theOne) {
      mission.flags.mainPerformanceStarted = true;
      mission.refreshBoard();
      // Three separate people said the third number was the one.
      const answerBandleader = () => {
        if (game.known.has('third-number')) woo.fire('Woo.CallbackUsed');
        date.watch(band.leader.group, 4);
        date.bark('show', DATE_BARKS.show);
        offerSway();
      };
      /* Margo is another solo voice. Let the bandleader finish naming the
       * number before her callback replaces him; five seconds is the authored
       * subtitle hold, and a longer delivered take extends it. */
      const bandleaderHold = n.say ? Math.max(5, cueSeconds(n.cue) + 0.4) : 0;
      if (bandleaderHold > 0) performance_.defer(bandleaderHold, answerBandleader);
      else answerBandleader();
    }
  },
  onNumberEnd: (n) => {
    if (!n.theOne || mission.flags.mainPerformanceComplete) return;
    mission.flags.mainPerformanceComplete = true;
    mission.refreshBoard();
    saveCheckpoint(mission.state);
  },
  onNumberError: (n, error) => {
    if (!n.theOne) return;
    hud.toast('THE HOUSE BAND CARRIES IT LIVE', 'bad');
    narrate('<em>The featured recording drops out. The Midnight Pines do not. They carry the number live.</em>', 5600);
    console.warn(`Featured performance fallback: ${error?.message || 'stream unavailable'}`);
  },
  onApplause: () => { if (date.mode === 'seated') date.npc.say(1.2); },
  /* The set ends. It used to wrap round to the top and play forever, which
   * meant the third number — the one three separate people tell you is the one
   * — came round again, with the callback, the toast and another offer to dance
   * behind it. Four numbers, then a club between sets. */
  onSetEnd: () => {
    setDinersDuck(0.76, 4);
    hud.toast('♫ end of the set', '');
    narrate('<em>The lights come up a third and the room gets its voice back all at once. '
      + 'Somebody at the back is still clapping on his own.</em>', 5200);
  },
});

const sway = new Sway();

/* ------------------------------------------------------------------ */
/* Money, HUD                                                          */
/* ------------------------------------------------------------------ */

function addMoney(delta) {
  game.money = Math.max(0, game.money + delta);
  ui.cash.textContent = `$${game.money.toLocaleString()}`;
  ui.wallet.classList.remove('hidden');
  ui.wallet.classList.toggle('down', delta < 0);
  ui.wallet.classList.add('bump');
  setTimeout(() => ui.wallet.classList.remove('bump'), 180);
}

/**
 * The strip. Compact on purpose: a label, a bar, a number, and a line of text
 * when something happens. The number is visible because the player has to
 * understand there is a game being played; everything else about it is small.
 */
let wooNoteTimer = null;
function paintWoo(score, delta, label) {
  ui.woo.classList.remove('hidden');
  ui.wooFill.style.width = `${score}%`;
  ui.wooNum.textContent = String(score);
  ui.woo.classList.toggle('good', score >= 65);
  ui.woo.classList.toggle('bad', score < 35);
  if (delta) {
    ui.woo.classList.remove('up', 'down');
    // Reflow, or two hits in a row only animate once.
    void ui.woo.offsetWidth;
    ui.woo.classList.add(delta > 0 ? 'up' : 'down');
  }
  if (label) {
    clearTimeout(wooNoteTimer);
    ui.wooNote.textContent = label;
    ui.wooNote.classList.remove('hidden');
    wooNoteTimer = setTimeout(() => ui.wooNote.classList.add('hidden'), 2600);
  }
  paintTips();
}

function paintTips() {
  const left = woo.tipsLeft;
  if (woo.tipCount === 0) { ui.tips.classList.add('hidden'); return; }
  ui.tips.classList.remove('hidden');
  ui.tips.innerHTML = `<span class="cap">looked after</span><span class="n">${woo.tipCount}</span>`
    + `<span class="of">of ${woo.tipCount + left}</span>`;
}

/**
 * The board, down the side of the screen.
 *
 * The evening's work above a rule, the things that are merely worth doing
 * below it, and the current line — the first one that is neither done nor
 * optional — marked, because a list of eight where seven are crossed out
 * still needs to say which one is now. Finished lines stay: crossing
 * something out is most of what a list is for, and this one is also the
 * record of an evening the player is being scored on.
 */
function paintObjectives(list) {
  ui.objectives.classList.remove('hidden');
  const now = list.find((o) => !o.done && !o.optional);
  const row = (o) => {
    const li = document.createElement('li');
    li.className = [o.done ? 'done' : '', o.optional ? 'optional' : '', o === now ? 'now' : '']
      .filter(Boolean).join(' ');
    li.textContent = o.text;
    return li;
  };
  const main = list.filter((o) => !o.optional);
  const extra = list.filter((o) => o.optional);
  const rows = main.map(row);
  if (extra.length) {
    const rule = document.createElement('li');
    rule.className = 'rule';
    rule.textContent = 'IF YOU LIKE';
    rows.push(rule, ...extra.map(row));
  }
  ui.objectiveList.replaceChildren(...rows);
}

/* ------------------------------------------------------------------ */
/* Tipping                                                             */
/* ------------------------------------------------------------------ */

/**
 * Money changes hands.
 *
 * Not a menu and not a screen: a hold on the person you are already talking to,
 * a folded-paper noise, and a line. The Woo event carries the value and fires
 * once, so there is nothing to farm — a second hold on the same man does
 * nothing at all except cost you the money, which is why it is refused instead.
 */
function tip(id, amount, { generous = false, contextual = false } = {}) {
  if (woo.has(id)) return false;
  if (game.money < amount) {
    hud.say('<em>Not enough on you. Which is its own kind of statement.</em>', 3200);
    return false;
  }
  addMoney(-amount);
  audio.play('tip.fold', { volume: 0.75 });
  woo.fire(id);
  if (generous) woo.fire('Woo.GenerousTip');
  if (contextual) woo.fire('Woo.ContextualTip');
  date.bark('tipped', DATE_BARKS.tipped);
  const npc = npcForTip(id);
  if (npc) date.watch(npc.group, 2.2);
  /* Everybody between the alley and the curtain, for the board's optional
   * line about looking after the room. The front of house is a different
   * thing and is not counted here — tipping the host is buying a table. */
  if (BACK_OF_HOUSE.has(id)) mission.flags.backOfHouseTipped++;
  mission.refreshBoard();
  return true;
}

/**
 * The seven people on the way in who have no reason to do you a favour.
 *
 * Vinny is the first of them and he is on the route: `cast.byName.doorman` is
 * built at `serviceDoor + (1.6, −1.4)`, which is the alley, not the canopy.
 * (`anchors.doorman` is a different man entirely — the background figure on
 * the public door at (2.6, 35.8), who is not on the tip roster at all. Two
 * doormen, one of them named after the anchor the other one uses.)
 *
 * The board asks for six of these seven, so one missed handshake across a
 * cellar, a dry store, a walk-in, a prep kitchen, a line and a dish pit is
 * survivable. What it did not do was say so — see BACK_OF_HOUSE_TOTAL and the
 * `staff` line in mission.js.
 */
const BACK_OF_HOUSE = new Set([
  'Woo.DoorAttendantTipped', 'Woo.CellarWorkerTipped', 'Woo.DeliveryTipped',
  'Woo.PorterTipped', 'Woo.CookTipped', 'Woo.LineCookTipped', 'Woo.DishwasherTipped',
]);

function npcForTip(id) {
  const t = TIP_POINTS.find((x) => x.id === id);
  return t ? cast.byName[t.who] : null;
}

/* ------------------------------------------------------------------ */
/* Script wiring                                                       */
/* ------------------------------------------------------------------ */

const scripts = buildScripts({
  mission,
  flags: mission.flags,
  woo,
  fire: (id, amount) => woo.fire(id, amount),
  tip: (id, amount, opts) => tip(id, amount, opts),
  money: () => game.money,
  drunkLevel: () => drunk.level,
  knows: (id) => game.known.has(id),
  remember: (id) => game.known.add(id),
  order: (what) => serveDrink(what),
  serveTable: () => serveTable(),
  holdTheRoom: () => holdTheRoom(true),
  releaseTheRoom: () => holdTheRoom(false),
  startTableCutscene: () => startTableCutscene(),
  startSway: () => startSway(),
  playRequest: () => performance_.request(mission.flags.songRequested),
  /* Entering the invitation menu is a mission event whichever way it is
   * reached — his key, or her line running into it — and it is recorded here
   * so the two routes cannot record it differently. */
  openInvitation: () => {
    showAskPrompt(false);
    mission.offerInvitation();
    mission.addObjective('ask', 'Decide how the night ends');
  },
  judgeInvitation: () => judgeInvitation(),
});

/* ------------------------------------------------------------------ */
/* Drinks                                                              */
/* ------------------------------------------------------------------ */

const M = makeMaterials();
const heldDrinks = makeHeldDrinks(M);
heldDrinks.group.position.set(0.26, -0.30, -0.42);
camera.add(heldDrinks.group);
function poseDrink(which, k) {
  const can = heldDrinks.can;
  const bottle = heldDrinks.bottle;
  can.visible = which === 'can';
  bottle.visible = which === 'bottle';
  const m = which === 'can' ? can : which === 'bottle' ? bottle : null;
  if (!m) return;
  const e = k * k * (3 - 2 * k);
  m.position.set(-0.10 * e, 0.20 * e, 0.09 * e);
  m.rotation.set(-1.30 * e, 0, 0.34 * e);
}
poseDrink(null, 0);

function serveDrink(what) {
  const kind = what === 'whiskey' || what === 'rye' ? 'whiskey' : what === 'beer' ? 'beer' : 'soft';
  audio.play('pour', { volume: 0.5 });
  if (kind === 'soft') return;
  if (inventory.full) return;
  game.heldDrink = kind;
  inventory.add(kind === 'whiskey' ? 'whiskey' : 'beer');
}

/** Two drinks land on the table. Hers has one ice cube in it. */
function serveTable() {
  audio.play('pour', { volume: 0.45, position: room.anchors.frontTable });
  audio.play('ice.drop', { volume: 0.4, delay: 0.9, position: room.anchors.frontTable });
  audio.play('glass.set', { volume: 0.4, delay: 1.2, position: room.anchors.frontTable });
  frontGlasses(true);
  if (mission.flags.drinkOrdered === 'rye') {
    narrate('<em>One cube. He did not have to be told, and she watches him not be told.</em>', 4600);
  }
}

function drinkTick(dt) {
  if (!game.heldDrink) return;
  if (!keys.has('KeyF')) {
    if (game.drinking > 0) { game.drinking = 0; poseDrink(null, 0); }
    return;
  }
  game.drinking += dt;
  const k = Math.min(1, game.drinking / DRINK_TIME);
  poseDrink(game.heldDrink === 'whiskey' ? 'bottle' : 'can', k);
  if (k < 1) return;
  drunk.drink(game.heldDrink === 'whiskey' ? WHISKEY_UNITS : BEER_UNITS);
  audio.play('can.sip', { volume: 0.5 });
  inventory.remove?.(game.heldDrink === 'whiskey' ? 'whiskey' : 'beer');
  game.heldDrink = null;
  game.drinking = 0;
  poseDrink(null, 0);
  if (drunk.level > 0.55) {
    narrate('<em>She notices. She does not say anything, which is not the same as not noticing.</em>', 4200);
  }
  /* Past a certain point the glass goes over. This is the only thing in the
   * mission that makes a mess, and it is the whole of the chaos counter — which
   * had a value, an ending written for it ("from a distance"), and no way at all
   * of going up. Four of these and she likes you from across the table. */
  if (drunk.level > 0.7 && game.seated) {
    woo.fire('Woo.DrinkSpilled');
    mission.madeAMess();
    audio.play('glass.set', { volume: 0.6, position: room.anchors.frontTable });
    audio.play('ice.drop', { volume: 0.5, delay: 0.15, position: room.anchors.frontTable });
    date.bark('spill', DATE_BARKS.spill);
    narrate('<em>The glass goes over. Not far, and not much in it, and a waiter is on it '
      + 'before you are — which is somehow the worst part.</em>', 4200);
  }
}

/* ------------------------------------------------------------------ */
/* Interactables                                                       */
/* ------------------------------------------------------------------ */

function reg(mesh, desc) {
  if (!mesh) return null;
  return interaction.register(mesh, desc);
}

/** Scratch, for asking a door leaf where it actually is in the world. */
const _doorAt = new THREE.Vector3();

function registerDoor(key, opts = {}) {
  const door = room.doors[key];
  if (!door) return;
  reg(door.leaf, {
    label: () => (door.locked ? `${door.label} — locked` : `${door.open ? 'Close' : 'Open'} ${door.label}`),
    onUse: () => {
      if (door.locked) {
        audio.play('door.locked', { volume: 0.55, position: door.pivot.position });
        hud.say(opts.lockedLine ?? 'Locked. Not tonight.', 3000);
        return;
      }
      const wasOpen = door.open;
      door.toggle();
      audio.play(wasOpen ? 'door.knob' : 'door.creak', { volume: 0.5, position: door.pivot.position });
      /* Holding a door is only worth anything if she is behind you and about
       * to walk through it. Opening every door in the building is not charm. */
      if (date.mode === 'follow') {
        const gap = date.position.distanceTo(player.position);
        if (!wasOpen && gap < 4.5) woo.fire('Woo.DateDoorHeld');
        /* And shutting one she is walking into is the other half of the same
         * gesture, which had a value in the table and nothing that fired it.
         * Her distance to the door rather than to him: closing a door across
         * the building while she happens to be behind you is not rudeness. */
        if (wasOpen && gap < 4.5) {
          door.leaf.getWorldPosition(_doorAt);
          if (date.position.distanceTo(_doorAt) < 3.2) {
            woo.fire('Woo.DoorInHerFace');
            date.bark('shut', DATE_BARKS.shut);
          }
        }
      }
      opts.onToggle?.(door);
    },
  });
}

registerDoor('service', {
  onToggle: (door) => {
    if (!door.open) return;
    mission.flags.sideDoorOpened = true;
    date.bark('door', DATE_BARKS.door);
  },
});
registerDoor('kitchenSwing');
registerDoor('walkin');
registerDoor('front');
registerDoor('backstage', { lockedLine: 'Backstage. Not while there is a band behind it.' });
registerDoor('manager', { lockedLine: 'The manager is not in his office. The manager is never in his office.' });
registerDoor('rear');

/* ---- people you can talk to, and hand something to ---- */

/**
 * One target, two actions: tap to greet, hold to take care of them.
 *
 * This is the tipping interface. It is deliberately the same button as
 * everything else in the game with a longer press on it, because the moment it
 * becomes a menu it becomes an economy, and it is not meant to feel like an
 * economy. It is meant to feel like a handshake with something in it.
 */
function registerPerson(key, tree, { tipId = null, amount = 0, greetOnly = false } = {}) {
  const npc = cast.byName[key];
  if (!npc) return;
  reg(npc.group, {
    label: () => {
      const talk = `Talk to <b>${npc.name}</b>`;
      if (greetOnly || !tipId) return talk;
      if (woo.has(tipId)) return `${talk} <span class="done">— looked after</span>`;
      if (game.money < amount) return `${talk} — <span class="cant">$${amount} to look after</span>`;
      return `${talk} <span class="hold">· hold to take care of him ($${amount})</span>`;
    },
    hold: tipId ? 0.55 : undefined,
    onTap: tipId ? () => greet(npc, tree) : undefined,
    onUse: () => {
      if (!tipId) { greet(npc, tree); return; }
      if (woo.has(tipId)) { hud.say('<em>Once is generous. Twice is a man buying something.</em>', 3200); return; }
      /* Tipping somebody the instant after they have got you out of trouble
       * reads differently, and the game notices. */
      const contextual = performance.now() - (npc.helpedAt ?? -1e9) < 6000;
      if (tip(tipId, amount, { contextual })) greet(npc, tree, 'took');
    },
  });
}

function greet(npc, tree, at = 'open') {
  /* One conversation at a time, ENDED, not replaced. `dialogue.start` on top
   * of a live conversation never fired the old one's onEnd — so a waiter
   * summoned to the table and then talked past was orphaned there for the
   * night, standing beside the cloth with his tray. Ending it runs the
   * cleanup: he goes back to his station, the ape goes back to his table. */
  if (dialogue.active && game.talkingTo !== npc) dialogue.end('interrupted');
  npc.faceToward(player.position.x, player.position.z);
  game.greeted.add(npc.name);
  game.talkingTo = npc;
  if (!tree) return;
  const node = tree[at] ? at : 'open';
  dialogue.start(tree, node, npc);
  // She looks at whoever just said his name.
  date.watch(npc.group, 3);
  if (date.mode === 'follow') date.bark('recognised', DATE_BARKS.recognised);
}

for (const t of TIP_POINTS) {
  if (t.who === 'driver') continue;                   // he is in the car
  if (t.who === 'bandleader') continue;               // he is behind a curtain
  registerPerson(t.who, scripts[t.script], { tipId: t.id, amount: t.amount });
}
/* The bandleader lives in the band rather than in the club's cast, and does
 * not exist as far as the player is concerned until the curtain goes. */
cast.byName.bandleader = band.leader;
registerPerson('bandleader', scripts.bandleader, { tipId: 'Woo.BandleaderTipped', amount: 40 });
/* The ape has no tree on a tap: his scene is the one where he comes to YOUR
 * table, and starting it by poking him at his own — "he arrives the way a man
 * arrives when he has been working up to it" said over a seated man who has
 * not moved — replayed the whole family round from the wrong side of the room. */
registerPerson('ape', null, { greetOnly: true });
registerPerson('smoker', null, { greetOnly: true });

/* ---- the things in the world ---- */

reg(room.anchors.crateMesh, {
  label: 'The <b>crate by the wall</b>',
  onUse: () => {
    hud.say('Chalk on the lid, in a hand that presses too hard: a name, and under it, '
      + '<em>NOT FOR THE FLOOR</em>.', 4800);
    if (cast.byName.cellarman) greet(cast.byName.cellarman, scripts.cellarman, 'who');
  },
});

{
  // The hot pan. The one hazard on the route, and the only one that matters.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshBasicMaterial({ visible: false }));
  pad.position.set(room.anchors.hotPan.x, 1, room.anchors.hotPan.z);
  scene.add(pad);
  reg(pad, {
    label: () => (woo.has('Woo.HazardGuided') ? 'The <b>line</b>' : 'Put a hand out for <b>her</b>'),
    onUse: () => {
      if (woo.fire('Woo.HazardGuided')) {
        audio.play('kitchen.pan', { volume: 0.5, position: pad.position });
        date.bark('hazard', DATE_BARKS.hazard);
        mission.flags.hazardSeen = true;
        const cook = cast.byName.hotPan;
        if (cook) cook.helpedAt = performance.now();
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const front = room.frontTable;

function frontGlasses(on) {
  for (const c of front.group.children) {
    if (c.name === 'setting') c.visible = on;
  }
}

/**
 * The table, finished and in place, with no scene attached.
 *
 * The cutscene builds it a piece at a time, which is the point of the cutscene.
 * This is the same end state applied at once, for a checkpoint that was taken
 * after it happened — the alternative being to play the whole scene again to a
 * player who has already watched it.
 */
function showFrontTable() {
  const A = room.anchors;
  front.group.visible = true;
  front.group.position.set(A.frontTable.x, 0, A.frontTable.z);
  for (const c of front.group.children) c.visible = true;
  front.chairs.forEach((c, i) => {
    c.visible = true;
    c.position.set(A.frontSeats[i].x, 0, A.frontSeats[i].z);
    c.rotation.y = A.frontSeats[i].yaw;
  });
  const lamp = front.group.children.find((c) => c.isPointLight);
  if (lamp) lamp.intensity = lamp.userData.base;
  game.chairPads?.his.position.set(A.frontSeats[0].x, 0.7, A.frontSeats[0].z);
  game.chairPads?.her.position.set(A.frontSeats[1].x, 0.7, A.frontSeats[1].z);
}

/**
 * Into the chair.
 *
 * Shared by sitting down and by a checkpoint putting him back, which is the
 * only reason it is separate: a restore must not re-run the beat.
 */
function seatPlayer(done) {
  const seat = room.anchors.frontSeats[0];
  game.seated = true;
  audio.play('chair.sit', { volume: 0.5 });
  hud.setMode('seated');
  hud.setPosture('stand up');
  player.sitAt({
    position: new THREE.Vector3(seat.x, 1.24, seat.z),
    yaw: seat.faceYaw,
    pitch: -0.06,
    /* Wide enough to look at her, the stage, and whoever is coming over, and
     * not so wide that the room stops being in front of you. */
    yawRange: 1.7,
    pitchMin: -0.8,
    pitchMax: 0.45,
  }, done);
  /* And she sits down with him.
   *
   * This used to depend entirely on the optional chair-pull pad, so a player
   * who simply sat down had the entire seated half of the mission — six
   * conversations, a waiter, the champagne, the band — with his date standing
   * beside the table like a woman waiting for a bus. Pulling her chair out is
   * still worth something; it is no longer the only way she ever sits. */
  if (date.mode !== 'seated') date.sitAt(room.anchors.frontSeats[1]);
}

/** Sit down. His chair, her chair, and the club carries on around it. */
function sitAtTable() {
  if (game.seated) return;
  const firstSit = !mission.flags.seated;
  seatPlayer(() => {
    mission.satDown();
    if (game.pausedSeatedRound) {
      const round = game.pausedSeatedRound;
      game.pausedSeatedRound = null;
      beginRound(round, { resume: true });
    } else if (firstSit) {
      beginRound('table');
    }
  });
}

function standFromTable() {
  if (!game.seated) return;
  /* Standing is a pause, not a rewind. Dialogue already owns a per-tree
   * bookmark; end only Margo's seated tree with a resumable reason and reopen
   * that exact round after the chair tween. Service conversations keep their
   * ordinary walk-away semantics. */
  if (dialogue.active && dialogue.tree === scripts.seated) {
    game.pausedSeatedRound = game.round;
    dialogue.end('seated-paused');
  }
  game.seated = false;
  hud.setMode('walk');
  hud.setPosture(null);
  player.standFrom({ x: player.position.x, z: player.position.z + 0.8 });
}

{
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  pad.name = 'his-chair';
  pad.visible = false;
  scene.add(pad);
  reg(pad, {
    label: () => (game.seated ? 'Stand up' : 'Sit <b>down</b>'),
    enabled: () => mission.flags.tableBuilt,
    onUse: () => (game.seated ? standFromTable() : sitAtTable()),
  });

  const herPad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  herPad.visible = false;
  scene.add(herPad);
  reg(herPad, {
    label: () => (mission.flags.chairPulled ? 'Her <b>chair</b>' : 'Pull out her <b>chair</b>'),
    enabled: () => mission.flags.tableBuilt && !game.seated && !mission.flags.chairPulled,
    onUse: () => {
      mission.flags.chairPulled = true;
      woo.fire('Woo.ChairPulled');
      audio.play('chair.pull', { volume: 0.5, position: herPad.position });
      const seat = room.anchors.frontSeats[1];
      date.sitAt(seat);
      const moment = scripts.moments.chairPulled;
      narrate(`<em>${moment.who}:</em> ${moment.line}`, moment.hold * 1000, { cue: nodeCue(moment) });
    },
  });
  game.chairPads = { his: pad, her: herPad };
}

/**
 * Four men send you a bottle and then watch to see what you do about it.
 *
 * There is one right answer and it takes a second and a half: you catch the
 * eye of whoever lifted his fingers off the cloth and you lift your glass.
 * Not doing it is not rude by itself — she does not notice — but the table by
 * the pillar notices, and so does everybody who works here.
 */
const thanksPad = new THREE.Mesh(
  new THREE.BoxGeometry(3.2, 2.2, 3.2),
  new THREE.MeshBasicMaterial({ visible: false }),
);
thanksPad.position.set(cast.crewTable.x, 1.1, cast.crewTable.z);
thanksPad.visible = false;
scene.add(thanksPad);
reg(thanksPad, {
  label: () => (mission.flags.champagneThanked
    ? 'The <b>table by the pillar</b>'
    : 'Raise your glass to <b>the pillar</b>'),
  enabled: () => mission.flags.champagneSent,
  onUse: () => {
    if (mission.flags.champagneThanked) return;
    mission.flags.champagneThanked = true;
    woo.fire('Woo.ChampagneAcknowledged');
    mission.complete('thanks');
    audio.play('glass.set', { volume: 0.35, position: thanksPad.position });
    const b = cast.byName['bing-bouncer'];
    b?.faceToward(player.position.x, player.position.z);
    b?.say(1.4);
    narrate('<em>Two fingers off the cloth, and back to whatever they were saying. '
      + 'That is the entire exchange and everybody in this room understood it.</em>', 5200);
    date.watch(thanksPad, 3);
  },
});

/* ------------------------------------------------------------------ */
/* Cutscenes                                                           */
/* ------------------------------------------------------------------ */

/**
 * A cutscene here is a list of things to do at times, plus a camera that goes
 * from where the player was standing to somewhere better and back.
 *
 * It never fades and it never loads. The room keeps running underneath —
 * waiters keep walking, the crowd keeps talking, the lamps stay lit — because
 * the entire point of both of these moments is that they are happening in the
 * room you are standing in, to you, now.
 */
class Cutscene {
  /**
   * @param {Array} beats
   * @param {object} o {
   *   camera, onDone,
   *   dateSeat: a chair to put her back in when it ends. A cutscene takes her
   *     over and the end of one used to hand her unconditionally back to
   *     `follow`, which stood her up out of her chair in the middle of the
   *     evening: after the champagne she spent the rest of the night on her
   *     feet next to a seated man, and the second the band started she got up
   *     and walked away from the table she had just said "oh, they're real" at.
   * }
   */
  constructor(beats, {
    camera: shots = [], onDone, dateSeat = null, onUpdate = null, onPose = null,
  } = {}) {
    this.beats = beats.slice().sort((a, b) => a.at - b.at);
    this.shots = shots;
    this.onDone = onDone;
    this.onUpdate = onUpdate;
    this.onPose = onPose;
    this.dateSeat = dateSeat;
    this.t = 0;
    this.next = 0;
    this.from = { pos: player.position.clone(), yaw: player.yaw, pitch: player.pitch };
    this.dur = Math.max(...this.beats.map((b) => b.at + (b.hold ?? 3)), 1);
    player.mode = 'frozen';
    player.clearKeys();
    interaction.setPaused(true);
    date.takeOver();
    document.body.classList.add('cutscene');
  }

  update(dt) {
    this.t += dt;

    while (this.next < this.beats.length && this.t >= this.beats[this.next].at) {
      const b = this.beats[this.next++];
      if (b.line) {
        ui.dialogue.root.classList.remove('hidden');
        ui.dialogue.name.textContent = (b.who || '').toUpperCase();
        ui.dialogue.line.innerHTML = b.line;
        ui.dialogue.options.classList.add('hidden');
        /* The timeline owns the pacing here, so a cue that runs long must not
         * hold the floor past its beat — `solo` still cuts the previous line
         * off, which is what a scene shot on one camera does anyway. */
        voiceCue(b.cue);
      }
      b.run?.();
    }

    /* Some scenes have physical work in them, not only dialogue. This runs
     * before the camera so a shot tracking a moving prop sees this frame's
     * position rather than following one frame behind it. */
    this.onUpdate?.(this.t, dt);

    /* The camera: a slow move between authored points, eased. Slow because a
     * fast one in a room this dark reads as a cut, and there are no cuts.
     *
     * Each shot starts from wherever the camera IS. It used to start from
     * `this.from.pos` — the spot the player was standing when the scene began
     * — so the first frame of every later shot teleported the camera back
     * there and then flew it out again: a visible snap at every shot change,
     * worst in the table scene, where the camera dropped out of the host
     * conversation mid-sentence. `shot.from` remains an authored override. */
    if (this.shots.length) {
      let shot = this.shots[0];
      for (const s of this.shots) if (this.t >= s.at) shot = s;
      if (shot !== this._shot) {
        this._shot = shot;
        this._shotFrom = shot.from ?? player.position.clone();
      }
      const k = Math.min(1, (this.t - shot.at) / (shot.dur ?? 4));
      const e = k * k * (3 - 2 * k);
      player.position.lerpVectors(this._shotFrom, shot.to, e);
      if (shot.look) {
        const dx = shot.look.x - player.position.x;
        const dz = shot.look.z - player.position.z;
        const want = Math.atan2(-dx, -dz);
        const d = Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw));
        player.yaw += d * Math.min(1, dt * 2.4);
        const dy = (shot.look.y ?? 1.2) - player.position.y;
        const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
        player.pitch += (wantPitch - player.pitch) * Math.min(1, dt * 2.4);
      }
    }

    if (this.t >= this.dur) this.finish();
  }

  /** Reapply a cinematic pose after the ordinary NPC idle pass. */
  pose() { this.onPose?.(this.t); }

  finish() {
    if (this._done) return;
    this._done = true;
    ui.dialogue.root.classList.add('hidden');
    player.mode = 'walk';
    interaction.setPaused(false);
    if (this.dateSeat) date.sitAt(this.dateSeat);
    else date.release();
    document.body.classList.remove('cutscene');
    game.scene = null;
    this.onDone?.();
  }
}

/* ---- one: the table ---- */

let tableCutsceneStarted = false;
function startTableCutscene() {
  if (tableCutsceneStarted) return;
  /* Only where it can happen. The host's own script fires this, and his tip
   * node can be reached from anywhere the player can reach him -- which, if
   * he ever ends up on the floor mid-service, would otherwise build a table
   * around somebody standing in the kitchen. */
  if (mission.state !== 'host') return;
  tableCutsceneStarted = true;
  mission.tableCutscene();

  const A = room.anchors;
  const target = A.frontTable;
  const movers = [cast.byName.mover1, cast.byName.mover2].filter(Boolean);
  const manager = cast.byName.manager;
  const waiter = cast.byName.waiter;
  const carryStarts = movers.map((m) => m.group.position.clone());
  const carryMid = A.tableCarryRoute[1];
  const carryPoint = new THREE.Vector3();
  const carryAhead = new THREE.Vector3();
  const tableLook = new THREE.Vector3(A.tableStaging.x, 0.95, A.tableStaging.z);

  /* The real table waits in the service lane even while hidden, so the first
   * camera move can find where the work is about to begin. */
  front.group.position.copy(A.tableStaging);

  const pointOnCarry = (k, out) => {
    const u = 1 - k;
    out.set(
      u * u * A.tableStaging.x + 2 * u * k * carryMid.x + k * k * target.x,
      0,
      u * u * A.tableStaging.z + 2 * u * k * carryMid.z + k * k * target.z,
    );
    return out;
  };

  const carrierMarks = (at, ahead) => {
    const dx = ahead.x - at.x;
    const dz = ahead.z - at.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    const sideX = -dz / d;
    const sideZ = dx / d;
    return [
      new THREE.Vector3(at.x + sideX * 0.82, 0, at.z + sideZ * 0.82),
      new THREE.Vector3(at.x - sideX * 0.82, 0, at.z - sideZ * 0.82),
    ];
  };

  const placeCarriers = (marks, ahead) => {
    movers.forEach((m, i) => {
      const mark = marks[i] ?? marks[0];
      m.group.position.copy(mark);
      m.baseY = mark.y;
      m.faceToward(ahead.x, ahead.z, true);
    });
  };

  /* Exact marks at the end of the carry. The chair phase must begin here,
   * not at a made-up point behind the table: that old handoff moved one waiter
   * 1.63m in a single frame even though the table itself never jumped. */
  const carryBeforeEnd = pointOnCarry(0.975, new THREE.Vector3());
  const carryBeyondEnd = target.clone().add(target.clone().sub(carryBeforeEnd));
  const carrierSetMarks = carrierMarks(target, carryBeyondEnd);
  const chairWorkEnds = A.frontSeats.map((seat) => new THREE.Vector3(seat.x, 0, seat.z + 1.05));

  /* The complete procession: they converge on the table, flank it while the
   * same object crosses the room, put it down, then each walks a chair out.
   * Nothing swaps and nothing teleports. */
  const updateTableWork = (t) => {
    const approachFrom = 9.2;
    const liftAt = 10.5;
    const setAt = 16.0;
    const chairsDone = 17.4;

    if (t >= approachFrom && t < liftAt) {
      pointOnCarry(0, carryPoint);
      pointOnCarry(0.02, carryAhead);
      const marks = carrierMarks(carryPoint, carryAhead);
      const raw = Math.min(1, Math.max(0, (t - approachFrom) / (liftAt - approachFrom)));
      const k = raw * raw * (3 - 2 * raw);
      movers.forEach((m, i) => {
        m.group.position.lerpVectors(carryStarts[i], marks[i], k);
        m.faceToward(carryPoint.x, carryPoint.z, true);
      });
      return;
    }

    if (t >= liftAt && t < setAt) {
      const raw = Math.min(1, (t - liftAt) / (setAt - liftAt));
      const k = raw * raw * (3 - 2 * raw);
      pointOnCarry(k, carryPoint);
      pointOnCarry(Math.min(1, k + 0.025), carryAhead);
      front.group.position.copy(carryPoint);
      placeCarriers(carrierMarks(carryPoint, carryAhead), carryAhead);
      return;
    }

    if (t >= setAt && t < chairsDone) {
      front.group.position.copy(target);
      const raw = Math.min(1, (t - setAt) / (chairsDone - setAt));
      const k = raw * raw * (3 - 2 * raw);
      front.chairs.forEach((chair, i) => {
        const seat = A.frontSeats[i];
        chair.visible = true;
        chair.position.set(
          target.x + (seat.x - target.x) * k,
          0,
          target.z + (seat.z - target.z) * k,
        );
        chair.rotation.y = seat.yaw;
      });
      movers.forEach((m, i) => {
        const seat = A.frontSeats[i];
        m.group.position.lerpVectors(carrierSetMarks[i], chairWorkEnds[i], k);
        m.faceToward(seat.x, seat.z, true);
      });
    }
  };

  const poseTableWork = (t) => {
    if (t < 9.2 || t > 17.4) return;
    for (const m of movers) {
      /* Hands under the edge for the carry, then down onto the chair backs.
       * Applied after Npc.update so the ordinary idle never wipes the pose. */
      m.parts.armL.rotation.x = -0.78;
      m.parts.armR.rotation.x = -0.78;
      m.parts.foreL.rotation.x = -1.22;
      m.parts.foreR.rotation.x = -1.22;
    }
  };

  // Park the two of them where the host station can see them
  player.position.set(A.hostMark.x, 1.66, A.hostMark.z);
  date.group.position.set(A.hostMark.x - 1.1, 0, A.hostMark.z - 0.3);
  date.npc.faceToward(A.host.x, A.host.z, true);

  for (const m of movers) { m.route = null; m.job = 'stand'; }

  const beats = [
    ...scripts.scenes.table.map((b) => ({ ...b })),
    {
      at: 9.2,
      run: () => {
        // The manager says four words and the room starts moving. He turns
        // back to his own station afterwards rather than spending the rest of
        // the evening looking at the patch of floor a table used to be on.
        glanceOver(manager, A.tableStaging.x, A.tableStaging.z, 14);
        for (const m of movers) m.faceToward(target.x, target.z);
      },
    },
    {
      at: 10.5,
      run: () => {
        /* The real table. Not a stand-in: this object is the one that is still
         * here in twenty minutes with her drink on it. */
        front.group.visible = true;
        front.group.position.copy(A.tableStaging);
        for (const child of front.group.children) {
          child.visible = ['front-pedestal', 'front-foot', 'front-top'].includes(child.name);
        }
        audio.play('table.set', { volume: 0.34, position: A.tableStaging });
      },
    },
    {
      at: 16.0,
      run: () => {
        front.group.position.set(target.x, 0, target.z);
        audio.play('table.set', { volume: 0.6, position: target });
      },
    },
    {
      at: 17.4,
      run: () => {
        // Chairs finish the trip on their own legs, one in each waiter's hands.
        const seats = A.frontSeats;
        front.chairs.forEach((c, i) => {
          c.visible = true;
          c.position.set(seats[i].x, 0, seats[i].z);
          c.rotation.y = seats[i].yaw;
        });
        audio.play('chair.pull', { volume: 0.5, position: target });
      },
    },
    {
      at: 18.6,
      run: () => {
        // Cloth: a top and a skirt, and still no lamp or settings.
        front.group.children.find((c) => c.name === 'front-cloth-top').visible = true;
        front.group.children.find((c) => c.name === 'front-cloth').visible = true;
        audio.play('cloth.snap', { volume: 0.7, position: target });
        waiter?.faceToward(target.x, target.z);
      },
    },
    {
      at: 20.2,
      run: () => {
        frontGlasses(true);
        // The lamp comes on last, which is what makes it a table
        const lampG = front.group.children.find((c) => c.name === 'front-lamp');
        if (lampG) lampG.visible = true;
        const l = front.group.children.find((c) => c.isPointLight);
        if (l) l.intensity = l.userData.base;
        audio.play('cutlery.set', { volume: 0.5, position: target });
        audio.play('glass.set', { volume: 0.4, delay: 0.3, position: target });
      },
    },
    {
      at: 21.5,
      /* Held long enough for the final dolly to finish its glide: the scene
       * runs to at+hold, and cutting it at 24.5 dropped the player mid-floor
       * with the camera still moving. */
      hold: 6,
      run: () => {
        // The room notices. Six of them, not all of them; a whole room turning
        // would be a musical number.
        let turned = 0;
        for (const npc of cast.all) {
          if (turned >= 6) break;
          if (npc.job !== 'sit' && npc.job !== 'drink') continue;
          if (npc.group.position.distanceTo(target) > 12) continue;
          glanceOver(npc, target.x, target.z, 5.5);
          turned++;
        }
      },
    },
  ];

  game.scene = new Cutscene(beats, {
    /* One shot on the two of them for the whole host/manager exchange — the
     * camera used to leave for the (empty) table spot at 8.5, half a second
     * before "Two-top. Front and center." landed, and pitched down at the
     * carpet while they were still talking. It holds on faces until the
     * manager turns to the room at 9.0, then follows the work. */
    camera: [
      { at: 0, to: new THREE.Vector3(A.hostMark.x, 1.66, A.hostMark.z + 0.4), look: { x: A.host.x - 1.2, y: 1.55, z: A.host.z - 0.3 }, dur: 2.5 },
      /* Four connected dolly marks keep both carriers and the same tabletop in
       * frame all the way from the service lane to front-and-centre. `tableLook`
       * is mutated below, so these are tracking shots rather than four pans to
       * stale coordinates. */
      { at: 9.2, to: new THREE.Vector3(-2.0, 1.78, 15.0), look: tableLook, dur: 3.0 },
      { at: 12.2, to: new THREE.Vector3(-7.4, 1.62, 7.0), look: tableLook, dur: 3.8 },
      { at: 16.0, to: new THREE.Vector3(-10.9, 1.48, 0.1), look: tableLook, dur: 3.4 },
      { at: 19.4, to: new THREE.Vector3(-11.8, 1.56, -3.0), look: tableLook, dur: 4.4 },
    ],
    onUpdate: (t, dt) => {
      updateTableWork(t, dt);
      tableLook.set(front.group.position.x, 0.95, front.group.position.z);
    },
    onPose: poseTableWork,
    onDone: () => {
      mission.tableBuilt();
      game.chairPads.his.position.set(A.frontSeats[0].x, 0.7, A.frontSeats[0].z);
      game.chairPads.her.position.set(A.frontSeats[1].x, 0.7, A.frontSeats[1].z);
      date.release();
      date.follow();
      narrate('<em>She has not said anything for eleven seconds, which for her is a review.</em>', 5000);
      hud.setPosture(null);
      for (const m of movers) {
        m.job = 'patrol';
        m.route = [{ x: -9.5, z: 0.5 }, { x: -4, z: 4 }, { x: -12, z: 2 }];
      }
    },
  });
}

/* ---- the champagne ---- */

let champagneSent = false;
/* Sent and finished are different questions. `champagneSent` stops it going
 * twice; this says the cutscene has handed control back, which is what the
 * next beat at the table actually has to wait for. */
let champagneComplete = false;
function sendChampagne() {
  if (champagneSent || !game.seated) return;
  champagneSent = true;
  mission.flags.champagneSent = true;
  const target = room.anchors.frontTable;
  const waiter = comesToTable(cast.byName.waiter, { x: 1.2, z: 1.4 });
  audio.play('cork.pop', { volume: 0.55, position: target });

  /* He says who sent it and he points at them.
   *
   * The owner's note is that the bottle arriving, being accounted for, and
   * Ape coming over are three things in a fixed order and were arriving on
   * top of each other. The order is the queue's job; this is the middle beat
   * actually happening on screen instead of only in the subtitle — the man
   * turns to the pillar, his arm comes up, and the camera goes where he is
   * pointing rather than panning at nothing.
   */
  const pillar = cast.crewTable;
  const bouncer = cast.byName['bing-bouncer'];
  let pointing = 0;
  const beats = [
    ...scripts.scenes.champagne.map((b) => ({ ...b })),
    {
      at: 2.4,
      run: () => {
        waiter?.faceToward(pillar.x, pillar.z);
        pointing = 1;
      },
    },
    {
      at: 6.0,
      run: () => {
        // Two fingers off the cloth, from the one of them she is looking at.
        if (bouncer) {
          glanceOver(bouncer, target.x, target.z, 7);
          bouncer.say(1.4);
        }
        date.watch(bouncer?.group ?? null, 5);
      },
    },
    { at: 8.6, run: () => { pointing = 0; } },
  ];

  game.scene = new Cutscene(beats, {
    dateSeat: room.anchors.frontSeats[1],
    camera: [
      { at: 0, to: player.position.clone(), look: { x: target.x + 1.2, y: 1.4, z: target.z + 1.4 }, dur: 1.5 },
      { at: 5.5, to: player.position.clone(), look: { x: pillar.x, y: 1.3, z: pillar.z }, dur: 3 },
    ],
    /* The point itself, written after `Npc.update` for the same reason the
     * table carry's grip is: the idle pose is the last author otherwise, and
     * the arm goes back down inside one frame. */
    onPose: () => {
      if (!pointing || !waiter) return;
      waiter.parts.armR.rotation.x = -1.42;
      waiter.parts.armR.rotation.z = -0.22;
      waiter.parts.foreR.rotation.x = -0.12;
    },
    onDone: () => {
      // Control comes back sitting down, which is where it was.
      player.mode = 'seated';
      champagneComplete = true;
      goesBack(waiter);
      mission.addObjective('thanks', 'Acknowledge the table by the pillar', { optional: true });
      thanksPad.visible = true;
      narrate('<em>Look over at the pillar and [E] to lift a glass at them.</em>', 4600);
    },
  });
}

/* ---- two: the band ---- */

let showStarted = false;
function startShowCutscene() {
  if (showStarted) return;
  showStarted = true;
  mission.showCutscene();
  const A = room.anchors;

  room.setHouse(0.28, 0);
  setDinersDuck(0.29, 2.2);

  /* The band comes on when the announcement is OVER, not at 8.2 seconds.
   *
   * "Overlapping sounds when performance starts — it starts before the
   * announce finishes." Exactly right, and the arithmetic says so: the
   * announcer's beat is authored at 5.5s and `performance_.begin()` was nailed
   * to 8.2, which gives "Ladies and gentlemen — the Silver Room is proud — the
   * Midnight Pines" two and seven tenths of a second to be said in. The
   * delivered take is longer than that, so the curtain, the stage clunk, four
   * stems and the bandleader's own introduction all landed on top of the last
   * third of it — every time, for everybody, because 2.7 is not a duration
   * anybody measured, it is the gap between two numbers that were chosen
   * separately.
   *
   * So the announcement's own length is what moves the band: the recorded take
   * if there is one, and the authored reading beat if there is not. Same rule
   * the rest of the scene uses for a line that has to finish before the next
   * thing happens.
   */
  const announceAt = 5.5;
  const announceCue = scripts.scenes.show.find((b) => b.who === 'the announcer')?.cue;
  /* A floor of 3.4s so an unrecorded announcement still gets read, and a
   * ceiling so a pathological take cannot strand the player in a dark room. */
  const announceFor = Math.min(9, Math.max(3.4, cueSeconds(announceCue) + 0.6));
  const bandOn = announceAt + announceFor;

  /* Everything the curtain cues moves with the curtain. The authored beats put
   * the "seven of them: brass across the back" description at 9.0 and her "oh,
   * they're real" at 12.0, both written against a band that arrived at 8.2 —
   * so they slide by whatever the announcement turned out to need, and keep
   * the spacing somebody chose between them. */
  const slide = bandOn - 8.2;
  const beats = [
    ...scripts.scenes.show.map((b) => ({ ...b, at: b.at > 8.2 ? b.at + slide : b.at })),
    { at: 0.2, run: () => audio.play('light.dip', { volume: 0.5 }) },
    { at: 4.8, run: () => audio.play('mic.handle', { volume: 0.4, position: A.stageCentre }) },
    {
      at: bandOn,
      run: () => {
        room.setHouse(0.28, 1);
        audio.play('stage.clunk', { volume: 0.55, position: A.stageCentre });
        performance_.begin();
      },
    },
    { at: bandOn + 2.3, run: () => { performance_.applaud(1.1); date.npc.faceToward(A.stageCentre.x, A.stageCentre.z); } },
  ];

  const seat = A.frontSeats[0];
  game.scene = new Cutscene(beats, {
    dateSeat: A.frontSeats[1],
    camera: [
      { at: 0, from: player.position.clone(), to: new THREE.Vector3(seat.x, 1.24, seat.z), look: { x: A.stageCentre.x, y: 1.6, z: A.stageCentre.z }, dur: 3 },
      { at: 11.5 + slide, to: new THREE.Vector3(seat.x, 1.24, seat.z), look: { x: A.frontSeats[1].x, y: 1.3, z: A.frontSeats[1].z }, dur: 2 },
    ],
    onDone: () => {
      player.mode = 'seated';
      /* Still centred on her. The stage is a ninety-degree turn from that and
       * inside the range, which is the only arrangement where both of the
       * things the second half is about are things you can choose to look at. */
      player.yawCenter = seat.faceYaw;
      player.yawRange = 1.9;
      mission.showStarted();
      setDinersDuck(0.47, 2);
    },
  });
}

/**
 * The room going quiet for a second and a half.
 *
 * Used once, for "Funny how?". Nothing else in the mission does this, which is
 * the only reason it works.
 */
/**
 * A look, not a stare.
 *
 * `faceToward` sets `targetYaw` and nothing ever clears it, so every one-off
 * "the room notices" turn in this scene was permanent. Six diners turned to
 * the front table at the end of the table cutscene and were still turned to it
 * an hour later; the pillar four-top turned to Tony for "Funny how?" and never
 * looked away again. That is the reported "table to left stares at you", and
 * the diners' own `look: false` could never have fixed it, because this is the
 * body and not the head.
 *
 * So a glance is a glance: turn, hold it for a beat, then go back to whatever
 * you were sitting at.
 */
function glanceOver(npc, x, z, secs = 3.2) {
  if (!npc) return;
  const back = npc.homeYaw ?? npc.group.rotation.y;
  npc.faceToward(x, z);
  clearTimeout(npc.__glanceBack);
  npc.__glanceBack = setTimeout(() => {
    /* Unless something else has since given him somewhere to be — a waiter
     * called to the table owns his own facing and must not be spun back to
     * his chair mid-order. */
    if (npc.job === 'sit' || npc.job === 'drink' || npc.job === 'stand') npc.targetYaw = back;
  }, secs * 1000);
}

function holdTheRoom(on) {
  setDinersDuck(on ? 0.06 : 0.47, on ? 0.25 : 1.2);
  performance_.setDucked(on);
  if (!on) return;
  for (const key of ['ape', 'bing-bouncer', 'waiter']) {
    glanceOver(cast.byName[key], player.position.x, player.position.z, 4.4);
  }
}

/* ------------------------------------------------------------------ */
/* Conversation rounds                                                 */
/* ------------------------------------------------------------------ */

/**
 * The seated conversation is not one tree. It is six of them, opened by
 * different things: sitting down, a waiter arriving, a man coming over from
 * another table, the band. That is the difference between a conversation and a
 * dialogue menu.
 */
function beginRound(id, { resume = false } = {}) {
  if (mission.roundsDone.has(id) || (!resume && game.round === id)) return;
  game.round = id;
  const at = {
    table: 'table',
    entrance: 'round1',
    work: 'round2',
    funny: 'funny',
    personal: 'personal',
  }[id];
  if (!at) return;
  dialogue.start(scripts.seated, at, date.npc, { resume });
  date.watch(null, 0);
}

/**
 * The evening, in order.
 *
 * Two things were wrong with the order and one with the length.
 *
 * **Order.** The champagne used to arrive off a side clock (`seatedFor > 74`)
 * rather than out of this list, and a side clock cannot be sequenced against
 * anything. If the drinks round was still open at 74 — which it is whenever
 * the player reads — the bottle went first and the waiter turned up
 * afterwards to ask what they were drinking. The owner's note is a strict
 * order: **waiter, then the bottle is sent and the waiter says who sent it
 * and points, then Ape arrives.** It is a queue entry now, so the queue's own
 * `dialogue.active` guard enforces all three of those with no special cases.
 *
 * **Length.** "Scene kind of drags on — dessert could come a bit quicker."
 * The `after` number was never the thing holding dessert up: it is gated on
 * the featured number finishing, and the featured number is a 192-second
 * master that starts behind two warm-up numbers and a 240-second run-up. That
 * put dessert nine and a quarter minutes after sitting down. The run-up is
 * tightened here and the two warm-ups are shortened in `perform.js`; the
 * master is what it is.
 */
const ROUND_QUEUE = [
  { id: 'table', after: 0 },
  { id: 'entrance', after: 6 },
  { id: 'work', after: 24 },
  /* Skipped if the order already happened — the waiter patrols within reach
   * of the front table, so a player can wave him down before the queue does,
   * and the round must not then play a second time. */
  { id: 'drinks', after: 44, run: () => { if (!mission.roundsDone.has('drinks')) waiterComesOver(); } },
  /* The bottle. After the waiter has been to the table and before the family
   * comes over, because that is the order the evening happens in. */
  { id: 'champagne', after: 74, run: () => sendChampagne() },
  /* Ape does not walk over while the champagne is still being explained. */
  { id: 'family', after: 96, ready: () => champagneComplete, run: () => apeComesOver() },
  { id: 'funny', after: 132 },
  { id: 'personal', after: 164 },
  { id: 'show', after: 196, run: () => startShowCutscene() },
  /* After the band. The evening keeps having things in it — this is the
   * window the brief asks for, where the player works out for himself that
   * it is going well rather than being handed a button that says so. */
  { id: 'another', after: 262, run: () => waiterComesOver('another') },
  { id: 'toast', after: 318, run: () => raiseAGlass() },
  { id: 'dessert', after: 376, ready: () => mission.flags.mainPerformanceComplete,
    run: () => waiterComesOver('dessert') },
  /* And then the thing the whole evening has been for. Without this the queue
   * simply ran out after dessert and the player was left at a table with a
   * finished conversation and an objective he had no way to act on — the
   * reported "nothing happens after you order dessert, how are you supposed to
   * ask her about seeing her again". */
  { id: 'closing', after: 404, ready: () => mission.invitationReady && !mission.flags.invitation,
    run: () => closeTheEvening() },
];

let queueAt = 0;
let seatedFor = 0;
function runSeatedQueue(dt) {
  if (!game.seated || game.scene) return;
  seatedFor += dt;
  const next = ROUND_QUEUE[queueAt];
  if (!next || seatedFor < next.after) return;
  if (dialogue.active) return;
  if (next.ready && !next.ready()) return;
  queueAt++;
  if (next.run) next.run();
  else beginRound(next.id);
}

/**
 * Bring somebody to the table.
 *
 * Conversations lapse at six and a half metres — that is the rule that makes
 * every conversation in this game walk-out-able, and it is a good rule. It
 * also means a waiter cannot take an order from the far side of the dining
 * room, which is exactly what was happening: the round opened, the range check
 * ended it on the same frame, and the queue sat there waiting for a
 * conversation that had already finished.
 *
 * So anybody whose job is to arrive at your table arrives at it.
 */
function comesToTable(npc, offset = { x: 1.3, z: 0.9 }) {
  if (!npc) return null;
  const t = room.anchors.frontTable;
  /* His station's round, kept the first time he is called over. `goesBack`
   * falls back to it, so a man summoned twice without being released between
   * — which is a timing accident, not a plan — still has somewhere to go
   * instead of standing at the table for the rest of the evening. */
  npc.__homeRoute ??= npc.route;
  npc.__wasPatrolling = npc.route;
  npc.route = null;
  npc.job = 'stand';
  npc.stand?.();
  npc.group.position.set(t.x + offset.x, 0, t.z + offset.z);
  npc.faceToward(player.position.x, player.position.z, true);
  return npc;
}

function goesBack(npc) {
  if (!npc) return;
  const route = npc.__wasPatrolling ?? npc.__homeRoute;
  if (route) {
    npc.route = route;
    npc.job = 'patrol';
    npc.__wasPatrolling = null;
  }
}

function waiterComesOver(at = 'open') {
  const w = comesToTable(cast.byName.waiter, { x: 1.1, z: 1.0 });
  if (!w) return;
  greet(w, scripts.waiter, at);
}

function apeComesOver() {
  const ape = cast.byName.ape;
  if (!ape) return;
  /* Once. The queue fires this on its own clock, and without the guard a
   * family round that had already happened played again, word for word. */
  if (mission.roundsDone.has('family')) return;
  const target = room.anchors.frontTable;
  ape.stand();
  ape.job = 'stand';
  /* His own spot on the open side of the table — NOT behind Tony and not at
   * the waiter's mark. The old offsets were only 22cm apart, so the round
   * where the ape lingered put him inside whichever waiter arrived next. */
  ape.group.position.set(target.x, 0, target.z + 1.6);
  ape.faceToward(player.position.x, player.position.z, true);
  /* Through greet, not around it: greet records him as `talkingTo`, and
   * `talkingTo` is how the conversation's end knows whose walk home to run.
   * Started directly, the dialogue ended and nobody had been talking — so he
   * stood at the table for the rest of the night, waiting to intersect the
   * waiter. */
  greet(ape, scripts.ape);
  date.watch(ape.group, 5);
}

/* Ape goes back to his own table when the conversation ends. */
dialogue.hooks.onEnd = (reason) => {
  performance_.setDucked(false);
  const who = game.talkingTo;
  game.talkingTo = null;
  if (who === cast.byName.waiter) goesBack(who);
  if (who === cast.byName.ape && who.homeSeat) {
    who.group.position.set(who.homeSeat.x, 0, who.homeSeat.z);
    who.group.rotation.y = who.homeSeat.yaw;
    /* And the yaw he is easing *towards*, not only the one he is at.
     * `greet()` aims everybody it opens at the player, and that target
     * survives — so Ape sat back down at his own table and then turned, over
     * the next second, to face Tony's, and stayed like that for the rest of
     * the evening. From the front table that is a man at the next table
     * staring at you, which is exactly what was reported. */
    who.targetYaw = who.homeSeat.yaw;
    who.gaze = 0;
    who.job = 'sit';
    who.sit();
  }
  if (reason === 'walked-away' && date.mode === 'seated') woo.fire('Woo.QuestionIgnored');
};

/* ------------------------------------------------------------------ */
/* The sway, the invitation, the endings                               */
/* ------------------------------------------------------------------ */

function raiseAGlass() {
  if (mission.flags.toast || !game.seated || dialogue.active) return;
  dialogue.start(scripts.toast, 'open', date.npc);
}

function offerSway() {
  if (mission.flags.swayed || !game.seated) return;
  mission.addObjective('sway', 'Get up, if you are getting up', { optional: true });
  performance_.defer(4, () => {
    if (dialogue.active || game.scene || mission.flags.swayed) return;
    dialogue.start(scripts.sway, 'open', date.npc);
  });
}

/**
 * Asking again after she has said she would rather watch.
 *
 * She does not shout. That is the whole point of the line, and it is why this
 * costs more than almost anything else in the mission.
 */
function askAgain() {
  if (mission.flags.swayed !== 'refused' || dialogue.active) return false;
  dialogue.start(scripts.sway, 'forced', date.npc);
  return true;
}

/**
 * Getting up.
 *
 * The nine hundred milliseconds between standing up and the first bar are the
 * whole reason this needed rewriting: `swayRunning` used to be set at the top of
 * this function, and the frame loop — which ends the dance the moment
 * `swayRunning` is true and the minigame is not active — is entitled to run
 * during those nine hundred milliseconds. So the sway was judged and lost
 * before it began, `Woo.SwayCompleted` was unreachable by any route, and the
 * timing bar then started up under a player who had already been told he was
 * terrible. The latch goes up when the music does.
 */
function startSway() {
  if (game.swayRunning || game.swayStarting || sway.active) return;
  if (mission.flags.swayed) return;
  game.swayStarting = true;
  mission.startSway();
  standFromTable();
  const spot = { x: room.anchors.frontTable.x + 0.6, z: room.anchors.frontTable.z - 1.6 };
  setTimeout(() => {
    game.swayStarting = false;
    date.standFrom(spot);
    date.hold();
    sway.start(settings.assist);
    game.swayRunning = true;
    narrate('<em>Four bars. Hit [E] on the beat and try to look like you meant it.</em>', 4600);
  }, 900);
}

/**
 * Sitting back down.
 *
 * `setState('performance')` was refused here, every time, because `sway` is
 * after `performance` in the list and the list only runs forwards — so the
 * mission spent the rest of the evening in a state that is not one of the ones
 * she gets bored in, and she never said another word about being kept waiting.
 * `mission.endSway()` is the named exception, and it lands back in a state the
 * rest of the mission is written for.
 */
function finishSway() {
  if (!game.swayRunning) return;
  game.swayRunning = false;
  const result = sway.result;
  mission.flags.swayed = result;
  hud.setTiming(null);
  if (result === 'good') woo.fire('Woo.SwayCompleted');
  dialogue.start(scripts.sway, result === 'good' ? 'good' : 'bad', date.npc);
  setTimeout(() => {
    /* Back into the chairs, both of them — and through `seatPlayer` rather than
     * `sitAtTable`, because sitting down for the second time tonight must not
     * re-run the beat that opens the first conversation of the evening. */
    seatPlayer();
    mission.endSway();
  }, 3200);
}

/**
 * The end of the evening, as a beat rather than as a hotkey nobody used.
 *
 * The report: "nothing happens after you order dessert, how are you supposed
 * to ask her about seeing her again". It was accurate. The seated queue's last
 * entry was dessert; after it ran, the queue was exhausted and the mission sat
 * there. The invitation existed and was reachable — one key, listed once on a
 * pause screen — and nothing in the room ever said so or ever would.
 *
 * So the evening closes itself. The plates go, the room drops, and she gives
 * him the opening: an authored beat, played straight, no wink at it. Then the
 * prompt is up for as long as the moment lasts. If he sits on it, she moves
 * first — and that line hands straight into the same menu, because the one
 * thing that must not happen is the player reaching the end of a thirty-minute
 * mission and finding no way to finish it.
 *
 * Deciding not to ask is still on the menu, and is still not rushing it.
 */
let closingStarted = false;
let closingFor = -1;

function showAskPrompt(on) {
  const el = document.getElementById('ask');
  if (!el) return;
  if (on) el.querySelector('span').textContent = 'ask her about seeing her again';
  el.classList.toggle('hidden', !on);
}

function closeTheEvening() {
  if (closingStarted || !game.seated || mission.flags.invitation) return;
  closingStarted = true;
  /* The plates go first. He is clearing a table, not delivering a cue, so he
   * arrives, works, and leaves without a word — and the room gets quiet
   * behind him, which is the only stage direction this beat needs. */
  const w = comesToTable(cast.byName.waiter, { x: 1.05, z: 1.05 });
  audio.play('cutlery.set', { volume: 0.42, position: room.anchors.frontTable });
  audio.play('glass.set', { volume: 0.34, delay: 0.7, position: room.anchors.frontTable });
  setTimeout(() => goesBack(w), 2600);
  setDinersDuck(0.29, 3);
  dialogue.start(scripts.invitation, 'plates', date.npc);
  mission.addObjective('ask', 'Decide how the night ends');
  closingFor = 0;
}

/** Her patience with a man who will not say it, in seconds. */
const CLOSING_GRACE = 52;
let closingNudged = false;

function closingTick(dt) {
  if (closingFor < 0 || mission.flags.invitation || game.over) return;
  closingFor += dt;
  /* Only while he is in the chair, because that is the only place the key
   * does anything. Advertising R to a man on his feet is the same class of
   * mistake as not advertising it at all. */
  showAskPrompt(game.seated && !dialogue.active && mission.invitationReady);
  if (closingNudged || closingFor < CLOSING_GRACE) return;
  if (dialogue.active || game.scene || sway.active) return;
  closingNudged = true;
  showAskPrompt(false);
  /* `next: 'open'` on this node, so her line runs into the menu on its own
   * hold. `mission.offerInvitation()` is idempotent about when he asked, so
   * arriving this way records the same honest answer the R key does. */
  dialogue.start(scripts.invitation, 'waiting', date.npc);
}

function offerInvitation() {
  if (!mission.invitationReady) return false;
  if (!mission.offerInvitation()) return false;
  showAskPrompt(false);
  mission.addObjective('ask', 'Decide how the night ends');
  dialogue.start(scripts.invitation, 'open', date.npc);
  return true;
}

function judgeInvitation() {
  showAskPrompt(false);
  closingFor = -1;
  /* Rushing it is asked of the mission rather than worked out here: `inState`
   * at this point is seconds since the invitation menu opened, which is a
   * measure of how fast the player reads. It fired on every run in the game,
   * including the careful ones, and the harness never saw it because it called
   * the ending resolver directly. */
  const rushed = mission.rushedIt;
  const outcome = mission.resolve(woo.score, woo.band.key);
  if (!rushed && (outcome === 'perfect' || outcome === 'strong')) woo.fire('Woo.InvitationTiming');
  if (rushed) woo.fire('Woo.InvitationRushed');
  mission.finish(outcome);
  setTimeout(() => dialogue.start(scripts.invitation, outcome, date.npc), 500);
  setTimeout(() => finish(outcome), 8000);
}

function finish(outcome) {
  if (game.over) return;
  game.over = true;
  mission.done();
  const e = ENDINGS[outcome] ?? ENDINGS.awkward;
  const saved = mission.persist(woo);
  /* The evening goes into the campaign, not into a private key only this page
   * has ever read. The story class takes the persist() payload as-is and keeps
   * the handful of facts a later scene could ask about. */
  story.complete(saved);

  performance_.finish();
  overlay.classList.remove('hidden');
  overlay.classList.add('ending');
  overlay.querySelector('h1').innerHTML = 'FRONT AND<span>CENTER</span>';
  overlay.querySelector('.tag').textContent = e.title;

  const extras = [
    `<b>Woo:</b> ${woo.score} — ${woo.band.name}.`,
    `<b>Looked after:</b> ${woo.tipCount} of ${woo.tipCount + woo.tipsLeft}${woo.streakClosed ? ' — everybody eats.' : '.'}`,
  ];
  if (saved.rememberedDrink) extras.push('You remembered the ice cube.');
  if (saved.funnyHow) extras.push('You made a room go quiet for a second and a half.');
  if (saved.swayed === 'good') extras.push('And you can, very slightly, dance.');
  if (saved.seeingHerAgain) extras.push('<b>She will pick up if you ring the station.</b>');
  assetStatus.innerHTML = `${e.body}<br><br>${extras.join(' ')}`;
  /* The evening ends where every other mission ends: at his own front door.
   * Replaying it is a preview/debug affordance, not the way out. */
  startBtn.textContent = 'Go Home';
  startBtn.disabled = false;
  startBtn.onclick = () => {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  };
  document.exitPointerLock?.();
}

/* ------------------------------------------------------------------ */
/* Checkpoints                                                         */
/* ------------------------------------------------------------------ */

/**
 * Enough to put the evening back where it was, and — the part that matters —
 * the Woo ledger, so reloading cannot pay a tip twice.
 *
 * "Enough" was doing a lot of work in that sentence. The first version saved
 * the flags, the money and the score, and dropped the mission state, the rounds
 * already had, whether he was sitting down, and every latch in this file — so a
 * restored evening came back with the right number over a mission that thought
 * it was still on the pavement, rebuilt the table it already had, and re-ran
 * the first conversation. It round-trips now, and it is still only reachable
 * from the debug panel: nothing here restores on boot, because deciding when a
 * player is resuming rather than starting is the campaign's business.
 */
function saveCheckpoint(state) {
  game.checkpoint = {
    state,
    mission: mission.checkpoint(),
    /* The cellar sits directly beneath the kitchen. x/z alone cannot say
     * which floor a checkpoint belongs to, so persist each actor's feet
     * height alongside their horizontal position. */
    player: {
      x: player.position.x,
      y: player.position.y - player.eyeHeight,
      z: player.position.z,
      yaw: player.yaw,
    },
    date: { x: date.position.x, y: date.position.y, z: date.position.z, mode: date.mode },
    money: game.money,
    woo: woo.snapshot(),
    known: [...game.known],
    greeted: [...game.greeted],
    noted: [...game.noted],
    seated: game.seated,
    round: game.round,
    queueAt,
    seatedFor,
    /* The module latches. Every one of these is a "this has already happened"
     * that lives in a closure rather than in the mission, and every one of them
     * would otherwise happen a second time. */
    latches: {
      tableCutsceneStarted,
      champagneSent,
      showStarted,
      taxiGone,
      /* Whether she has already asked about the front door. The `arrived`
       * checkpoint is taken on the pavement, either side of that question. */
      arrivalAsked,
      /* The closing beat is a latch like the rest of them: a reload taken
       * after the plates went must not clear the table a second time and put
       * her opening line back in her mouth. */
      closingStarted,
      closingNudged,
      closingFor,
    },
  };
  try {
    // Developer previews keep checkpoints in their page-local campaign store.
    const storage = getPreviewRuntime()?.storage ?? globalThis.localStorage;
    storage.setItem('squatch.fac.checkpoint', JSON.stringify(game.checkpoint));
  } catch { /* nothing to do about it */ }
}

function restoreCheckpoint(cp = game.checkpoint) {
  if (!cp) return false;
  woo.restore(cp.woo);          // the ledger, so nothing pays out twice
  game.money = cp.money;
  addMoney(0);
  mission.restore(cp.mission);
  game.known = new Set(cp.known ?? []);
  game.greeted = new Set(cp.greeted ?? []);
  game.noted = new Set(cp.noted ?? []);
  game.round = cp.round ?? null;
  queueAt = cp.queueAt;
  seatedFor = cp.seatedFor;

  const l = cp.latches ?? {};
  tableCutsceneStarted = !!l.tableCutsceneStarted;
  champagneSent = !!l.champagneSent;
  showStarted = !!l.showStarted;
  arrivalAsked = !!l.arrivalAsked;
  arrivalIn = -1;
  closingStarted = !!l.closingStarted;
  closingNudged = !!l.closingNudged;
  closingFor = Number.isFinite(l.closingFor) ? l.closingFor : -1;
  showAskPrompt(false);
  if (l.taxiGone && !taxiGone) leaveTaxi();

  /* The table is a real object that the cutscene carried into place. If the
   * checkpoint was taken after that, it is where it was; putting it back is a
   * matter of what is visible, not of playing the scene again. */
  if (mission.flags.tableBuilt) showFrontTable();
  /* The pillar's raise-a-glass pad is stood up by the champagne scene. A
   * restore that skipped this lost the thank-you (and its objective) for the
   * rest of a champagne-sent evening: the raycaster only sees visible pads. */
  thanksPad.visible = !!mission.flags.champagneSent;
  /* A performance checkpoint stores story progress, not a media decoder or an
   * exact bar of the set. Before the feature, restart the authored set. After
   * it, restore the honest between-set room instead of claiming the remaining
   * slow number resumed from state we never saved. */
  if (mission.flags.showStarted) {
    if (mission.flags.mainPerformanceComplete) {
      performance_.restoreBetweenSets();
      setDinersDuck(0.76, 1.2);
    } else {
      performance_.begin();
    }
  }

  game.swayRunning = false;
  game.swayStarting = false;
  sway.active = false;
  hud.setTiming(null);
  game.scene = null;
  interaction.setPaused(false);
  document.body.classList.remove('cutscene');

  player._tween = null;
  player.yawCenter = null;
  player.mode = 'walk';
  /* Older checkpoints have no y and therefore retain the historical ground
   * level fallback. New checkpoints restore against the floor the actor was
   * actually standing on, rather than the kitchen directly over the cellar. */
  const playerFeet = Number.isFinite(cp.player.y) ? cp.player.y : 0;
  const playerGround = room.groundAt(cp.player.x, cp.player.z, playerFeet);
  player.position.set(cp.player.x, playerGround + player.eyeHeight, cp.player.z);
  player.ground = playerGround;
  player.yaw = cp.player.yaw;
  hud.setMode('walk');
  hud.setPosture(null);
  game.seated = false;
  const dateFeet = Number.isFinite(cp.date.y) ? cp.date.y : 0;
  date.group.position.set(cp.date.x, room.groundAt(cp.date.x, cp.date.z, dateFeet), cp.date.z);
  date.mode = cp.date.mode === 'seated' ? 'seated' : 'follow';

  /* Sitting down is a pose on two people, so it is restored rather than
   * described: put him in the chair without re-running the beat that opens the
   * first conversation, and put her in hers. */
  if (cp.seated) seatPlayer();
  else if (date.mode === 'seated') date.sitAt(room.anchors.frontSeats[1]);
  paintWoo(woo.score, 0, null);
  paintTips();
  return true;
}

/* ------------------------------------------------------------------ */
/* Mission state                                                       */
/* ------------------------------------------------------------------ */

function onMissionState(state) {
  if (state === 'arrived') {
    date.follow();
    narrate('<em>She is out of the car and looking at the front door, which has a queue on it.</em>', 5000);
    /* Her opening question is owed, not fired-and-forgotten. See `arrivalTick`. */
    arrivalIn = 3;
  }
  if (state === 'host') {
    mission.addObjective('tips', 'Take care of everybody', { optional: true });
    /* The whole route walked without once leaving her in a doorway. Worth a
     * point, and worth it here rather than at the end, because this is the last
     * moment at which it is still true. */
    if (mission.flags.abandonments === 0) woo.fire('Woo.KeptPace');
  }
  if (state === 'ending') hud.setPosture(null);
}

/* ------------------------------------------------------------------ */
/* Zones                                                               */
/* ------------------------------------------------------------------ */

let where = 'street';
let zone = 'exterior';

/**
 * How much of the dining room's voice the evening is currently allowing.
 *
 * 1 is the room as the zone mix describes it. Everything below that is an
 * event asking for quiet — the lights going down, the room noticing something,
 * the plates being cleared — and it is a multiplier rather than a level so
 * that walking out of the room while the band is on still takes the crowd with
 * you. `updateZones` applies it every frame; nothing else may write these two
 * loops directly, which is the entire point.
 */
let dinersDuck = 1;
function setDinersDuck(k, ramp = 1.1) {
  dinersDuck = Math.max(0, k);
  audio.setLoopVolume('ambience.diners', 0.34 * dinersDuck, ramp);
  audio.setLoopVolume('ambience.diners.chatter', 0.24 * dinersDuck, ramp);
}

function updateZones() {
  const p = player.position;
  const next = roomAt(p.x, p.z, p.y - 1.6);
  const nextZone = zoneAt(next);

  /* Five beds, crossfaded on where he is standing. The club leaks backwards
   * through the building at exactly the rate the route walks forwards, which
   * is the whole trick of the entrance: the glamour arrives before you do. */
  const mix = {
    exterior: { alley: 0.5, cellar: 0.0, kitchen: 0.02, diners: 0.03, band: 0.05, line: 0.0, chatter: 0.0 },
    cellar: { alley: 0.06, cellar: 0.4, kitchen: 0.1, diners: 0.03, band: 0.06, line: 0.05, chatter: 0.02 },
    kitchen: { alley: 0.02, cellar: 0.08, kitchen: 0.42, diners: 0.06, band: 0.12, line: 0.30, chatter: 0.04 },
    corridor: { alley: 0.0, cellar: 0.02, kitchen: 0.16, diners: 0.2, band: 0.34, line: 0.10, chatter: 0.13 },
    club: { alley: 0.0, cellar: 0.0, kitchen: 0.03, diners: 0.34, band: 0.85, line: 0.02, chatter: 0.24 },
  }[nextZone] ?? { alley: 0.2, cellar: 0, kitchen: 0, diners: 0.1, band: 0.1, line: 0, chatter: 0 };

  audio.setLoopVolume('ambience.alley', mix.alley, 1.1);
  audio.setLoopVolume('ambience.cellar', mix.cellar, 1.1);
  audio.setLoopVolume('ambience.kitchen', mix.kitchen, 1.1);
  /* The two beds the room was missing under the two it already had: the work
   * being done in the kitchen, and two hundred people talking in the dining
   * room. See `core/audio.js` — `ambience.kitchen` is only the extraction fan
   * and `ambience.diners` is only the wash. */
  audio.setLoopVolume('ambience.kitchen.line', mix.line, 1.1);
  /* Both of the dining-room beds carry the show's duck.
   *
   * This is the other half of "cut the other sounds". `updateZones` runs every
   * single frame and used to assign `ambience.diners` the flat zone number
   * with nothing else in it — so every deliberate duck in the mission was
   * overwritten within 16 milliseconds of being asked for. The house lights
   * going down set it to 0.10 and it was back at 0.34 on the next frame; the
   * room going quiet for "Funny how?" asked for 0.02 and never got below a
   * third; the whole of the featured number played over a crowd bed at full
   * room volume, which is a wash of bandpassed noise sitting exactly where a
   * held vocal note sits. Zone and event are two different questions and the
   * bed needs the answer to both, so one is a level and the other is a
   * multiplier on it. */
  audio.setLoopVolume('ambience.diners', mix.diners * dinersDuck, 1.1);
  audio.setLoopVolume('ambience.diners.chatter', mix.chatter * dinersDuck, 1.1);
  /* The city, and the queue.
   *
   * The city is a flat exterior bed; the crowd is not, because thirty people
   * standing on one stretch of pavement is a place and not a weather. It
   * falls off with the walk down the alley and is gone once the service door
   * is behind you, which is the whole gag of the entrance — the queue is a
   * sound you leave. */
  const outside = nextZone === 'exterior';
  const toQueue = Math.hypot(p.x - 0, p.z - 38.1);
  audio.setLoopVolume('ambience.city.night', outside ? 0.34 : 0.03, 1.4);
  audio.setLoopVolume(
    'ambience.crowd',
    outside ? Math.max(0, 0.5 - toQueue * 0.011) : 0,
    1.4,
  );
  performance_.setRoomMix(mix.band, 1.1);
  // Behind a closed door, everything gets a blanket over it
  audio.setMuffle(nextZone === 'cellar' || nextZone === 'kitchen', 900);

  if (next === where) return;
  /* The headless driver watches this: a route that silently resolves to the
   * wrong room is the single hardest thing to see from inside the game. */
  window.__roomLog?.push(`${next}@${player.position.y.toFixed(2)}:${mission.state}`);
  where = next;
  zone = nextZone;
  onRoomChange(next);
}

function onRoomChange(next) {
  const key = { street: 'street', alley: 'alley', stair: 'alley', cellar: 'cellar',
    drystore: 'cellar', walkin: 'cellar', undercroft: 'cellar',
    prep: 'kitchen', kitchen: 'kitchen',
    dish: 'kitchen', corridor: 'corridor', floor: 'floor', lobby: 'floor' }[next];
  const notes = NOTES[key];
  if (notes && !game.noted.has(key)) {
    game.noted.add(key);
    narrate(notes[(Math.random() * notes.length) | 0], 4800);
  }
  if (key && DATE_BARKS[key] && date.mode === 'follow') {
    setTimeout(() => date.bark(key, DATE_BARKS[key]), 1400);
  }

  if (next === 'alley' && mission.state === 'arrived') mission.intoAlley();
  /* The undercroft counts as being down there. A player who walks straight
   * off the bottom of the ramp — which is now a doorway rather than a wall,
   * and therefore the thing the ramp invites you to do — must not find the
   * mission still sitting in `service-route` behind him. */
  if (['cellar', 'stair', 'undercroft'].includes(next) && mission.state === 'service-route') mission.intoCellar();
  if ((next === 'kitchen' || next === 'prep') && ['service-route', 'cellar'].includes(mission.state)) mission.intoKitchen();
  if (next === 'corridor' && ['cellar', 'kitchen'].includes(mission.state)) mission.intoCorridor();
  if (next === 'floor' && ['corridor', 'kitchen'].includes(mission.state)) {
    mission.atHostStation();
    date.bark('floor', DATE_BARKS.floor);
  }
}

/* The host station triggers the first cutscene by being walked up to, so a
 * player who ignores the host entirely still gets the scene. */
function checkHostStation() {
  if (mission.state !== 'host' || tableCutsceneStarted || game.scene) return;
  const d = player.position.distanceTo(room.anchors.hostStation);
  if (d < 2.6) startTableCutscene();
}

/**
 * What the city sounds like while you are still outside it.
 *
 * The street and the alley had one twenty-second loop between them, so the
 * first two minutes of the mission — which is a man on a wet pavement in front
 * of thirty people, walking round the side of a building — sounded like a
 * corridor. This is the traffic, the horns two streets over, and the elevated
 * line, which is the one sound that makes the alley feel like it has a city on
 * top of it rather than a ceiling.
 *
 * Positioned, so they arrive from somewhere: the road is north of the frontage
 * and the line runs over the far end of the alley. Rationed the same way the
 * room's barks are, and quieter in the alley than on the street, because the
 * alley is where the mission wants you listening for a door.
 */
let streetAt = 4;
let trainAt = 22;
const _streetAt = new THREE.Vector3();
function streetSound(dt) {
  if (zone !== 'exterior' || game.scene) return;
  const inAlley = where === 'alley' || where === 'stair';
  const gain = inAlley ? 0.34 : 0.72;

  streetAt -= dt;
  if (streetAt <= 0) {
    streetAt = 7 + Math.random() * 11;
    const pick = Math.random();
    const cue = pick < 0.62 ? 'street.car.pass.wet'
      : pick < 0.86 ? 'traffic.pass' : 'street.horn.distant';
    /* On the road, and a good way up it — a car passing is a thing going by
     * over there, not a thing happening at your shoulder. */
    _streetAt.set(
      player.position.x + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 22),
      0.6, 44,
    );
    audio.play(cue, { volume: gain * (0.5 + Math.random() * 0.4), position: _streetAt, ref: 12, maxDist: 90 });
  }

  trainAt -= dt;
  if (trainAt > 0) return;
  trainAt = 44 + Math.random() * 46;
  /* The elevated line: three stems that are one train. Over the top of the
   * alley, because that is where you want the city to be when you are looking
   * for the service door. */
  _streetAt.set(38, 9, inAlley ? 6 : 30);
  audio.play('train.elevated.rumble', { volume: gain * 0.5, position: _streetAt, ref: 16, maxDist: 120 });
  audio.play('train.elevated.roar', { volume: gain * 0.34, delay: 0.9, position: _streetAt, ref: 16, maxDist: 120 });
  audio.play('train.elevated.sub', { volume: gain * 0.42, delay: 0.4, position: _streetAt, ref: 20, maxDist: 140 });
  for (let i = 0; i < 6; i++) {
    audio.play('train.rail.clatter', {
      volume: gain * 0.24, delay: 1.4 + i * 0.42, position: _streetAt, ref: 14, maxDist: 90,
    });
  }
  if (Math.random() < 0.4) {
    audio.play('train.horn.far', { volume: gain * 0.3, delay: 3.2, position: _streetAt, ref: 30, maxDist: 200 });
  }
}

/**
 * The kitchen, working.
 *
 * "Need kitchen sound — clattering and background of a kitchen cooking and
 * working." The bed was one extraction fan, and the only clatter in the
 * building was a single `kitchen.pan` or `kitchen.plate` played on a coin flip
 * behind a bark — so eleven people at full service on a Tuesday made one noise
 * every twenty seconds, and the room she is counting cooks in sounded like an
 * empty plant room.
 *
 * Rationed the same way the street is, and positioned the same way: the pass
 * and the line are where the noise is, the dish pit is where the plates are,
 * and the prep benches are where the knife is. Which one you hear depends on
 * which of them you are nearest, so walking the length of the kitchen changes
 * what the kitchen is doing rather than only how loud it is.
 */
const KITCHEN_WORK = [
  // [cue, x, z, volume, weight]
  ['kitchen.clatter', 20.4, -10.5, 0.42, 5],
  ['kitchen.pan', 20.4, -10.5, 0.38, 4],
  ['kitchen.plate', 19.0, -6.6, 0.34, 4],
  ['kitchen.chop', 18.5, 5.2, 0.40, 3],
  ['kitchen.oven', 23.0, -10.5, 0.34, 2],
  ['kitchen.ticket', 19.0, -6.9, 0.30, 2],
  ['kitchen.clatter', 26.6, -13.6, 0.36, 4],
];
const KITCHEN_WEIGHT = KITCHEN_WORK.reduce((n, w) => n + w[4], 0);
let kitchenAt = 2.5;
const _workAt = new THREE.Vector3();
function kitchenSound(dt) {
  /* Prep and dish count as the kitchen: they are the same room with a
   * different job in them, and the pass is audible from all of it. */
  if (!['kitchen', 'prep', 'dish'].includes(where) || game.scene) return;
  kitchenAt -= dt;
  if (kitchenAt > 0) return;
  /* Close together, because that is what a service sounds like. Two and a
   * half seconds of silence in a working kitchen is a kitchen that has
   * stopped, and everybody in one notices when it does. */
  kitchenAt = 1.1 + Math.random() * 2.6;
  let roll = Math.random() * KITCHEN_WEIGHT;
  let pick = KITCHEN_WORK[0];
  for (const w of KITCHEN_WORK) {
    roll -= w[4];
    if (roll <= 0) { pick = w; break; }
  }
  const [cue, x, z, volume] = pick;
  _workAt.set(x, 1.0, z);
  audio.play(cue, {
    volume: volume * (0.7 + Math.random() * 0.5), position: _workAt, ref: 3, maxDist: 26,
  });
}

/**
 * The dining room, eating.
 *
 * "More ambience sound effects for once you are in the main dining room —
 * backroom chatter, eating, etc, but not overbearing." The last clause is the
 * hard one and it is why this is not simply louder: the player is sitting at a
 * table having the only conversation the mission is about, in front of a live
 * band, and anything here that competes with either of those has made the
 * scene worse rather than fuller.
 *
 * So: quiet, sparse, always somewhere else in the room, and it thins right out
 * while anybody is talking or while the featured number is playing. Two
 * hundred people are a bed (`ambience.diners.chatter`); this is the handful of
 * individual sounds that stop a bed being a texture — a fork going down, two
 * glasses meeting, somebody sitting back.
 */
const FLOOR_LIFE = ['dining.cutlery', 'dining.cutlery', 'dining.glass.clink', 'dining.chair'];
let floorLifeAt = 6;
function floorSound(dt) {
  if (zone !== 'club' || game.scene) return;
  floorLifeAt -= dt;
  if (floorLifeAt > 0) return;
  floorLifeAt = 3.4 + Math.random() * 5.2;
  /* Out of the way of the two things worth listening to. Not silenced — a
   * dining room that stops dead the moment she starts a sentence is its own
   * kind of wrong — but well under them. */
  const busy = dialogue.active || performance_.onTheOne;
  const cue = FLOOR_LIFE[(Math.random() * FLOOR_LIFE.length) | 0];
  /* Somewhere else: at least three metres away, in the half of the room
   * behind the front table rather than on the stage side of it. */
  const a = Math.random() * Math.PI * 2;
  const r = 3.2 + Math.random() * 7;
  _workAt.set(
    player.position.x + Math.sin(a) * r,
    0.85,
    Math.max(player.position.z + 1.2, player.position.z + Math.cos(a) * r),
  );
  audio.play(cue, {
    volume: (busy ? 0.16 : 0.34) * (0.6 + Math.random() * 0.6),
    position: _workAt,
    ref: 4,
    maxDist: 22,
  });
}

/**
 * The one question she asks on the pavement, which he has to be there for.
 *
 * It used to be `setTimeout(() => { if (!dialogue.active) start(arrival) }, 3000)`
 * — one attempt, three seconds after he got out of the car, abandoned without
 * a second try if anything at all was being said at that instant. And the
 * thing being said at that instant is almost always the driver: he is the
 * nearest interactable, he is worth $40 and a Woo event, and the game has just
 * put a prompt on his window. Tip him inside the first three seconds — which
 * is the good play, and the one the tutorial prompt asks for — and her opening
 * question never happened, the four replies to it were never offered, and the
 * board's "tell her why you are not using the front door" had nothing left
 * that could ever have completed it.
 *
 * So it is owed rather than fired: it waits for a free mouth, keeps waiting
 * while he finishes with the driver, and gives up only when he has actually
 * walked into the alley, because at that point she is asking about a door
 * neither of them can see any more.
 */
let arrivalIn = -1;
let arrivalAsked = false;
function arrivalTick(dt) {
  if (arrivalIn < 0 || arrivalAsked) return;
  if (mission.state !== 'arrived') { arrivalIn = -1; return; }
  arrivalIn -= dt;
  if (arrivalIn > 0) return;
  /* Not on top of a live conversation — that was the right instinct in the
   * original and it is kept. It just has to come back. */
  if (dialogue.active || game.scene) { arrivalIn = 1.2; return; }
  arrivalAsked = true;
  arrivalIn = -1;
  dialogue.start(scripts.arrival, 'open', date.npc);
}

/* What the building sounds like when nobody is talking to you. */
function barks(dt) {
  game.barkAt -= dt;
  if (game.barkAt > 0 || dialogue.active || game.scene) return;
  const key = { street: null, alley: 'alley', stair: 'alley', cellar: 'cellar',
    drystore: 'cellar', walkin: 'cellar', prep: 'kitchen', kitchen: 'kitchen',
    dish: 'kitchen', corridor: 'corridor', floor: 'floor', lobby: 'floor' }[where];
  const list = BARKS[key];
  /* The floor is where the player spends the long half of the evening. At the
   * kitchen cadence it sounded like a diner was performing material at him,
   * and the front-door civilian joke kept coming back. Give the room air and
   * retire that one line after its first appearance. */
  game.barkAt = key === 'floor' ? 28 + Math.random() * 20 : 11 + Math.random() * 12;
  if (!list) return;
  const available = list.map((line, i) => ({ line, i }))
    .filter(({ i }) => !(key === 'floor' && i === 5 && game.floorFrontDoorBarked));
  let picked = (Math.random() * available.length) | 0;
  if (available.length > 1 && available[picked].i === game.lastBark) {
    picked = (picked + 1) % available.length;
  }
  const { line: bark, i } = available[picked];
  game.lastBark = i;
  if (key === 'floor' && i === 5) game.floorFrontDoorBarked = true;
  const [who, line] = bark;
  hud.say(`<em>${who}:</em> ${line}`, 4200);
  /* The room's own voices. Anonymous by design — "a cook", "the pass" — so
   * they share the wait staff's profile and are named by where and which,
   * which is also the only stable thing about them. Quieter and never solo:
   * this is the building overheard, not somebody talking to you. */
  voiceCue(`vo.silver.room.${key}.${i + 1}`, { volume: 0.5, solo: false });
  if (key === 'kitchen') audio.play(Math.random() < 0.5 ? 'kitchen.plate' : 'kitchen.pan', { volume: 0.3 });
}

/* ------------------------------------------------------------------ */
/* The per-frame glue                                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything the evening needs looked at every frame that is not already
 * somebody else's job: the car outside, the dance, whether he stopped and let
 * her catch up, and whether he has spent the show watching the band instead of
 * the woman he brought to it.
 *
 * One function on purpose. The headless driver steps the update path by hand
 * rather than waiting on frames, so anything living inline in `frame()` is
 * something it silently does not run — which is how a dance that could not be
 * started, a rush penalty that always fired, and a car that drove off in the
 * middle of a conversation all got past a fifty-four check harness. It calls
 * this, the same as the frame loop does.
 */
const STAGE_YAW = room.anchors.frontSeatStageYaw;
let trailedFor = 0;
let staredFor = 0;

function evening(dt) {
  taxiTick(dt);
  /* In here rather than inline in `frame()`, for exactly the reason the
   * comment above this function gives: anything living in the frame loop is
   * something the headless driver silently does not run, and both a silent
   * street and a bark that never gets its turn are the kind of thing nobody
   * notices is untested. */
  streetSound(dt);
  /* Same reason as the street: anything living inline in `frame()` is
   * something the headless driver silently does not run, and a kitchen that
   * makes no noise is exactly the kind of thing nobody notices is untested. */
  kitchenSound(dt);
  floorSound(dt);
  arrivalTick(dt);
  flushVoice();

  if (sway.active) { sway.update(dt); hud.setTiming(sway.view); }
  else if (game.swayRunning) finishSway();

  /* He stopped, and she arrived, and that is worth a point once. */
  if (date.mode === 'follow') {
    const gap = date.position.distanceTo(player.position);
    if (date.isTrailing) trailedFor += dt;
    else if (gap < 2.4) {
      if (trailedFor > 1.5 && !woo.has('Woo.WaitedForDate')) {
        woo.fire('Woo.WaitedForDate');
        date.bark('waited', DATE_BARKS.waited);
      }
      trailedFor = 0;
    }
  } else {
    trailedFor = 0;
  }

  /* Her chair is dead ahead of his and the stage is a quarter-turn to his
   * right, so facing the band for three quarters of a minute at a stretch is a
   * decision rather than a seating arrangement. She notices. She always does. */
  if (game.seated && mission.state === 'performance' && performance_.playing) {
    const off = Math.abs(Math.atan2(
      Math.sin(player.yaw - STAGE_YAW), Math.cos(player.yaw - STAGE_YAW),
    ));
    staredFor = off < 0.4 ? staredFor + dt : 0;
    if (staredFor >= 45) {
      staredFor = 0;
      woo.fire('Woo.StaredAtStage');
      date.bark('staring', DATE_BARKS.staring);
    }
  } else {
    staredFor = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

const keys = new Set();
let dragLook = false;
let dragging = false;

function enableInput() {
  player.enabled = true;
  document.body.classList.remove('unlocked');
}

function requestLock() {
  if (dragLook) { enableInput(); return; }
  const p = canvas.requestPointerLock?.();
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (!dragLook && document.pointerLockElement !== canvas && !game.paused) fallBackToDragLook();
  }, 600);
}

function fallBackToDragLook() {
  if (dragLook) return;
  dragLook = true;
  enableInput();
  hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em>', 7000);
}

const pauseMenu = createPauseMenu({
  title: 'Front and Center',
  canPause: () => game.started && !game.over,
  getObjective: () => mission.objectives.find((objective) => !objective.done)?.text
    || 'Stay with Margo and finish the evening.',
  instructions: [
    'W A S D — move. E or Click — interact.',
    'Q — stand up or leave the current seat.',
    'During dialogue: number keys — answer.',
    'At the table: R — say the next planned toast or invitation when it is ready.',
    'During the sway: press E on the beat.',
    'Tab — pause and review the current objective.',
  ],
  onPause: () => {
    game.paused = true;
    player.enabled = false;
    keys.clear();
    player.clearKeys();
    interaction.release();
    interaction.setPaused(true);
    performance_.pause();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    game.paused = false;
    interaction.setPaused(false);
    audio.ctx?.resume?.();
    performance_.resume();
    clock.getDelta();
    requestLock();
  },
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  player.enabled = locked || dragLook;
  document.body.classList.toggle('unlocked', !locked && !dragLook);
  if (!locked && !dragLook) player.clearKeys();
});

document.addEventListener('mousemove', (e) => {
  if (dragLook && !dragging) return;
  if (!dragLook && document.pointerLockElement !== canvas) return;
  player.handleMouseMove(e.movementX, e.movementY);
});

canvas.addEventListener('mousedown', (e) => {
  if (game.paused) return;
  if (dragLook) dragging = true;
  if (e.button === 0) pressInteract();
});
window.addEventListener('mouseup', (e) => {
  dragging = false;
  if (e.button === 0) interaction.release();
});

function pressInteract() {
  if (sway.active) { swayPress(); return; }
  interaction.press();
}

function swayPress() {
  const judged = sway.press();
  // A press on a beat that has already been played is not a miss. It is nothing.
  if (judged === null) return;
  audio.play(judged ? 'woo.up' : 'woo.down', { volume: 0.4 });
  if (!sway.active) finishSway();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  player.setKey(e.code, true);

  if (e.code === 'KeyE') pressInteract();
  if (e.code === 'KeyQ') {
    if (game.seated && !sway.active) standFromTable();
  }
  if (e.code === 'KeyR' && !dialogue.active && game.seated) {
    /* One key for "say the thing you have been working up to". What that is
     * depends on where the evening has got to, which is the same logic the
     * player is using. */
    /* The invitation goes first once it is genuinely available. It used to sit
     * behind "ask her to dance again", so a man who had been turned down on
     * the floor and had not raised a glass pressed R at the end of the evening
     * and got the dance conversation instead of the one the objective on his
     * screen was telling him to have. */
    if (mission.invitationReady) offerInvitation();
    else if (mission.flags.swayed === 'refused' && !mission.flags.toast) askAgain();
    else if (mission.flags.showStarted && !mission.flags.toast) raiseAGlass();
  }
  if (/^Digit[1-7]$/.test(e.code)) {
    const n = Number(e.code.slice(-1)) - 1;
    if (dialogue.active && dialogue.options.length) dialogue.choose(n);
    else if (n < inventory.slots) inventory.select(n);
  }
  if (e.code === 'Escape') document.exitPointerLock?.();
  if (e.code === 'Tab') {
    e.preventDefault();
    pauseMenu.toggle();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => { keys.clear(); player.clearKeys(); });

canvas.addEventListener('click', () => {
  if (!game.started || game.paused) return;
  if (document.pointerLockElement !== canvas && !dragLook) requestLock();
});

/* ------------------------------------------------------------------ */
/* Arrival                                                             */
/* ------------------------------------------------------------------ */

/**
 * Three to eight seconds, and then it is yours.
 *
 * The brief on this was blunt and correct: the arrival is not the mission. The
 * car stops, two doors open, and the player is standing on a wet pavement with
 * a woman next to him before he has finished reading the sign.
 */
function arrive() {
  const A = room.anchors;
  /* Standing on the pavement beside the car, from the first frame.
   *
   * The car used to be twenty-two metres up the street with the player
   * welded to its flank, so the evening opened on three and a bit seconds of
   * sliding sideways past a wall at door-handle height, and then a cut to the
   * kerb. Whatever that reads as, it is not arriving: the owner's note was
   * that he wanted to start next to the car and not walk up to it from
   * somewhere else. So he starts where the car stops, which is where he was
   * always going to end up, and the car is already at its kerb -- the parking
   * spot itself is untouched, the body still wholly on the road with a shoe's
   * width between the sill and the stone.
   *
   * The doors are still the first thing that happens, and she is still out
   * before he has read the sign. */
  player.mode = 'frozen';
  player.position.set(A.dropOff.x, room.groundAt(A.dropOff.x, A.dropOff.z) + 1.66, A.dropOff.z);
  player.ground = room.groundAt(A.dropOff.x, A.dropOff.z);
  player.yaw = Math.PI;
  player.pitch = -0.05;
  date.takeOver();
  const dx = A.dropOff.x - 1.7;
  const dz = A.dropOff.z - 0.1;
  /* On whatever she is standing on rather than on zero: the drop-off is on
   * the pavement, which is 140mm up. */
  date.group.position.set(dx, room.groundAt(dx, dz), dz);

  taxi.group.position.x = taxi.park.x;
  taxi.driver.group.position.x = taxi.park.x + 0.55;

  /* Where he actually started, recorded on the frame he started on. The
   * headless driver cannot see this any other way — by the time it can ask,
   * he has been able to walk for four seconds. */
  game.spawn = {
    toCar: +player.position.distanceTo(taxi.group.position).toFixed(2),
    toPark: +Math.hypot(player.position.x - taxi.park.x, player.position.z - taxi.park.z).toFixed(2),
    toHer: +Math.hypot(player.position.x - date.position.x, player.position.z - date.position.z).toFixed(2),
    feet: +(player.position.y - 1.66).toFixed(2),
  };

  audio.play('car.door', { volume: 0.55, delay: 0.2 });
  audio.play('car.door', { volume: 0.5, delay: 0.75 });

  /* A beat with the doors, and then it is his.
   *
   * Kept as a `drive` step rather than a setTimeout because the headless
   * driver steps the update path by hand and does not wait on clocks -- a
   * timer here is an arrival it can never watch happen. */
  let t = 0;
  game.drive = (dt) => {
    t += dt;
    if (t <= 1.2) return;
    date.release();
    player.mode = 'walk';
    game.drive = null;
    mission.outOfCar();
    registerDriver();
  };
}

function registerDriver() {
  reg(taxi.window, {
    label: () => (woo.has('Woo.DriverTipped')
      ? 'Wave the <b>driver</b> off'
      : 'Talk to the <b>driver</b> <span class="hold">· hold to take care of him ($40)</span>'),
    hold: 0.55,
    onTap: () => {
      taxi.driver.faceToward(player.position.x, player.position.z);
      game.talkingTo = taxi.driver;
      dialogue.start(scripts.driver, 'open', taxi.driver);
    },
    onUse: () => {
      if (tip('Woo.DriverTipped', 40)) {
        mission.flags.driverTipped = true;
        game.talkingTo = taxi.driver;
        dialogue.start(scripts.driver, 'tipped', taxi.driver);
      }
    },
  });
  taxiWatching = true;
}

/**
 * When the car goes.
 *
 * It used to go on a forty-five second timer started the instant control came
 * back — which is about as long as it takes to read her opening line and pick
 * an answer. Reading the conversation you are standing in cost you the driver,
 * the tip, and with it the full-roster streak and the best line in the ending
 * card, and there was nothing on screen to suggest that was a clock. So: he
 * goes when the pavement is done with him. The player walking away is the cue,
 * a very long stop is the backstop, and he does not pull off mid-sentence.
 */
let taxiWatching = false;
let taxiGone = false;
let taxiWaited = 0;

function leaveTaxi() {
  if (taxiGone) return;
  taxiGone = true;
  taxiWatching = false;
  /* And he goes with a sound, which he did not.
   *
   * A car that has been idling at the kerb for four minutes with a man in it
   * silently accelerating up the street is the single loudest missing thing in
   * the opening. Starter, a rev off the kerb, and the pass fading up the road
   * — positioned on the car, so it goes *away*. The horn is his, and only
   * sometimes: he is aggrieved, not furious. */
  const at = taxi.group.position.clone();
  audio.play('car.engine.start', { volume: 0.42, position: at, ref: 4, maxDist: 60 });
  audio.play('car.engine.rev', { volume: 0.5, delay: 1.5, position: at, ref: 4, maxDist: 60 });
  audio.play('street.car.pass.wet', {
    volume: 0.44, delay: 2.1, position: at.clone().add(new THREE.Vector3(16, 0, 0)), ref: 8, maxDist: 80,
  });
  audio.play('traffic.pass', {
    volume: 0.3, delay: 3.4, position: at.clone().add(new THREE.Vector3(34, 0, 0)), ref: 12, maxDist: 90,
  });
  if (mission.flags.driverTipped) {
    audio.play('street.horn.distant', { volume: 0.26, delay: 3.9, position: at, ref: 20, maxDist: 120 });
  }
  taxi.leave();
  /* And the prompt goes with him. Left registered, the interaction system kept
   * a live "hold to take care of him ($40)" target attached to a car driving
   * up the street, and to the empty air it left behind. */
  interaction.unregister(taxi.window);
}

function taxiTick(dt) {
  taxi.update?.(dt);
  if (!taxiWatching || taxiGone) return;
  taxiWaited += dt;
  const talkingToHim = dialogue.active && game.talkingTo === taxi.driver;
  if (talkingToHim) return;
  const walkedOff = player.position.distanceTo(taxi.group.position) > 12
    || mission.state !== 'arrived';
  if (walkedOff || taxiWaited > 240) leaveTaxi();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

startBtn.addEventListener('click', async () => {
  if (game.over) return;
  if (!game.started) {
    /* The campaign decides whether tonight is happening at all, before a single
     * sample is loaded. A refused start leaves the title screen up with the
     * reason on it rather than dropping him onto the pavement. */
    const started = story.begin();
    if (!started.ok) {
      const tag = overlay.querySelector('.tag');
      if (tag) tag.textContent = UNAVAILABLE[started.reason] ?? 'The Silver Room is not expecting you.';
      startBtn.disabled = true;
      startBtn.textContent = 'Not tonight';
      return;
    }
    if (campaign.state.scene.id !== SCENE_IDS.SILVER_ROOM) {
      campaign.enter(SCENE_IDS.SILVER_ROOM, { spawn: 'kerb' });
    }
  }
  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();

  if (!game.started) {
    game.started = true;
    /* Draw the five empty boxes on the first gameplay frame. Waiting for the
     * first pickup made the inventory system invisible until it was too late
     * to teach the player that it existed. */
    inventory.onChange(inventory);
    /* Six beds now, not four. `kitchen.line` is the gas and the simmer under
     * the extraction; `diners.chatter` is the talking under the wash. Both
     * start at zero and are crossfaded by `updateZones` like the rest. */
    for (const bed of ['alley', 'cellar', 'kitchen', 'kitchen.line', 'diners', 'diners.chatter']) {
      audio.startLoop(`ambience.${bed}`, { volume: 0, ambience: true, fade: 1.5 });
    }
    /* Two more beds, outdoors only. The queue at the rope is thirty people
     * who have been there an hour and were, until now, completely silent —
     * and the city they are standing in was one twenty-second alley loop for
     * the whole exterior. Both are in the campaign's own sound set; the
     * Silver Room simply was not asking for them. */
    audio.startLoop('ambience.crowd', { volume: 0, ambience: true, fade: 2 });
    audio.startLoop('ambience.city.night', { volume: 0, ambience: true, fade: 2 });
    audio.setLoopVolume('ambience.alley', 0.5, 1.5);
    room.setHouse(1, 0, true);
    addMoney(0);
    paintWoo(woo.score, 0, null);
    paintObjectives(mission.objectives);
    arrive();
    narrate('<em>As far back as you can remember, you have wanted to be the man who does not '
      + 'stand in that queue.</em>', 6400);
  }
  game.paused = false;
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  if (!game.started || game.paused) { renderer.render(scene, camera); return; }
  const dt = raw * highs.timeScale;
  game.elapsed += raw;

  drunk.update(raw);
  highs.update(raw);
  player.sway.yaw = drunk.sway.yaw + highs.sway.yaw;
  player.sway.pitch = drunk.sway.pitch + highs.sway.pitch;
  player.sway.roll = drunk.sway.roll + highs.sway.roll;
  player.impair = drunk.swayStrength * (settings.reduceShake ? 0.3 : 0.8);
  player.moveScale = highs.moveScale;
  fxDrunk.style.setProperty('--blur', `${drunk.blur.toFixed(2)}px`);
  fxDrunk.style.setProperty('--vig', drunk.vignette.toFixed(3));
  fxDrunk.style.setProperty('--warm', drunk.warmth.toFixed(3));

  player.update(dt);
  if (game.drive) game.drive(raw);
  if (game.scene) game.scene.update(raw);
  else interaction.update(dt);

  room.update(dt, player.position);
  dialogue.update(dt, player.position);
  date.update(dt, player.position, player.yaw);
  mission.update(raw, { trailing: date.isTrailing });
  drinkTick(raw);
  updateZones();
  checkHostStation();
  barks(raw);
  runSeatedQueue(raw);
  closingTick(raw);
  evening(raw);

  /* Crowd: the near half every frame, the far half on the Npc class's own
   * stagger. Beyond twenty metres in a dark room, nobody has ever noticed. */
  const p = player.position;
  for (const npc of cast.all) {
    const d = Math.abs(npc.group.position.x - p.x) + Math.abs(npc.group.position.z - p.z);
    if (d > 26) continue;
    npc.update(dt, p);
  }
  for (const m of band.members) if (m.group.visible) m.update(dt, p);
  /* Cutscene work poses must be the final author on the two waiters' arms.
   * Their normal idle update still runs so faces and feet stay alive. */
  game.scene?.pose?.();
  /* After the band's own Npc updates, so the playing poses it writes are what
   * gets rendered. Before, Npc.update ran last and re-posed every musician
   * with the idle loop at its own 20Hz cadence — two systems fighting over
   * the same arms, which is the shake the playtest saw on stage. */
  performance_.update(dt);

  audio.updateListener(camera);

  const mins = 12 + Math.floor(game.elapsed / 14);
  const hour = 9 + Math.floor(mins / 60);
  hud.setClock(2, `${hour > 12 ? hour - 12 : hour}:${String(mins % 60).padStart(2, '0')} PM`, game.elapsed);

  postfx.render(dt);
}

/* ------------------------------------------------------------------ */

assetStatus.innerHTML = 'The room is drawn at load time. Voice and effect banks load for this scene; '
  + 'the featured song streams only when its number begins.';
loading.classList.add('hidden');

window.__silver = {
  THREE, scene, camera, renderer, postfx, player, room, cast, band, date, taxi,
  mission, woo, dialogue, hud, audio, game, interaction, drunk, inventory,
  scripts, performance: performance_, sway, settings, ROOMS, SET, EVENTS, ENDINGS,
  /* The number the back of house is built to, so the verifier holds it to
   * the same one rather than to a copy of it. */
  STEP_UP,
  /* Same rule for the other number two files have to agree about: the set of
   * tips that count as "on the way through", and how many the board asks for.
   * A list and a threshold that drift apart is an objective nobody can
   * finish, which is what they had already done once. */
  BACK_OF_HOUSE: [...BACK_OF_HOUSE], BACK_OF_HOUSE_TOTAL,
  /* The room's own overheard lines, so the harness can aim at one of them by
   * its index — which is how they are addressed everywhere else — instead of
   * at a fraction of a list length that changes every time somebody writes
   * another diner. */
  BARKS,
  /* Who has been cast, and in whose voice: the verifier holds the manifest
   * to both. */
  VOICE_OF, PROFILE_OF,
  campaign, story,
  get campaignState() { return campaign.state; },
  /* The pieces the headless driver has to be able to step by hand, because it
   * runs the update path directly rather than waiting on frames. */
  __zones: () => updateZones(),
  __seatTick: (dt) => { runSeatedQueue(dt); closingTick(dt); },
  /* The closing beat, so the harness can play the real dessert→invitation
   * path rather than calling the debug button and declaring it reachable. */
  __closing: () => ({
    started: closingStarted, nudged: closingNudged, forSecs: closingFor,
    prompt: !document.getElementById('ask')?.classList.contains('hidden'),
  }),
  __host: () => checkHostStation(),
  __barks: (dt) => { barks(dt); flushVoice(); },
  /* The one-mouth-at-a-time gate, so the harness can prove a recorded line
   * is not being cut off by the next thing that wants to talk. */
  __voice: () => ({ speaking: voiceSpeaking(), deferred: waiting.length > 0, queued: waiting.length }),
  /* The car, the dance, and the two things she notices about being ignored.
   * The driver has to step this or it is testing a game nobody plays. */
  __evening: (dt) => evening(dt),
  /* ---- development only. The panel is off in the shipped page. ---- */
  debug: {
    tp(x, z, yaw = 0) {
      player.mode = 'walk';
      player._tween = null;
      player.yawCenter = null;
      player.position.set(x, room.groundAt(x, z) + 1.66, z);
      player.yaw = yaw;
      player.update(0.016);
      date.group.position.set(x - 1.2, room.groundAt(x - 1.2, z), z);
    },
    phase(name) {
      const A = room.anchors;
      const spots = {
        street: [A.dropOff.x, A.dropOff.z],
        alley: [34, 20],
        cellar: [22, 1],
        kitchen: [20, -8],
        corridor: [12.5, 10],
        host: [A.hostStation.x, A.hostStation.z + 2],
        table: [A.frontTable.x + 1.5, A.frontTable.z + 1.5],
      };
      const s = spots[name];
      if (s) this.tp(s[0], s[1]);
      return mission.state;
    },
    setWoo(n) { woo.score = Math.max(0, Math.min(100, n)); paintWoo(woo.score, 0, null); },
    addWoo(n) { woo.score = Math.max(0, Math.min(100, woo.score + n)); paintWoo(woo.score, n, null); },
    allTips() { for (const t of TIP_POINTS) woo.fire(t.id); },
    resetTips() { for (const t of TIP_POINTS) woo.fired.delete(t.id); woo.tips.clear(); woo.streakClosed = false; paintTips(); },
    table() { startTableCutscene(); },
    champagne() { sendChampagne(); },
    show() { startShowCutscene(); },
    ending(kind) { finish(kind); },
    fired() { return [...woo.fired]; },
    ledger() { return woo.ledger.slice(); },
    save() { saveCheckpoint(mission.state); return game.checkpoint; },
    load() { return restoreCheckpoint(); },
    crowd() { return cast.all.length + band.members.length; },
    invite() { return offerInvitation(); },
    sitDown() { sitAtTable(); },
    seatHer() { date.sitAt(room.anchors.frontSeats[1]); },
    waiter() { waiterComesOver(); },
    toast() { raiseAGlass(); },
    askAgain() { return askAgain(); },
    events() { return Object.keys(EVENTS); },
    /* The two paths that used to exist only inside a closure, which is why
     * neither of the bugs in them was catchable from outside. */
    sway() { startSway(); return { running: game.swayRunning, starting: game.swayStarting }; },
    taxiGone() { return taxiGone; },
  },
};

/* ------------------------------------------------------------------ */
/* Debug                                                               */
/* ------------------------------------------------------------------ */

/**
 * Development only, and gone otherwise.
 *
 * Everything here is also on `window.__silver.debug`, which is what the
 * headless driver uses. The panel exists because this mission has a shape you
 * cannot get to quickly — six minutes of walking and talking before the second
 * cutscene — and testing the last ten minutes by playing the first twenty is
 * how tuning does not get done.
 *
 * Shown only with `?dev` on the URL. No key toggles it into a shipped build by
 * accident, and the element is not in the page at all otherwise.
 */
if (new URLSearchParams(location.search).has('dev')) {
  const panel = document.createElement('div');
  panel.id = 'debug';
  panel.innerHTML = '<h4>FRONT AND CENTER · DEV</h4>'
    + '<div class="row" data-row="phase"></div>'
    + '<div class="row" data-row="scene"></div>'
    + '<div class="row" data-row="woo"></div>'
    + '<div class="row" data-row="end"></div>'
    + '<div class="stat"></div>';
  document.body.appendChild(panel);

  const D = window.__silver.debug;
  const rows = {
    phase: [['street', () => D.phase('street')], ['alley', () => D.phase('alley')],
      ['cellar', () => D.phase('cellar')], ['kitchen', () => D.phase('kitchen')],
      ['corridor', () => D.phase('corridor')], ['host', () => D.phase('host')],
      ['table', () => { D.phase('table'); D.seatHer(); D.sitDown(); }]],
    scene: [['table scene', () => { mission.setState('host'); D.table(); }],
      ['champagne', () => D.champagne()], ['band', () => D.show()],
      ['waiter', () => D.waiter()], ['sway', () => startSway()],
      ['invite', () => { mission.flags.showStarted = true; mission.setState('performance'); mission.inState = 999; D.invite(); }]],
    woo: [['−10', () => D.addWoo(-10)], ['+10', () => D.addWoo(10)],
      ['0', () => D.setWoo(0)], ['50', () => D.setWoo(50)], ['100', () => D.setWoo(100)],
      ['all tips', () => D.allTips()], ['reset tips', () => D.resetTips()],
      ['save', () => D.save()], ['load', () => D.load()]],
    end: Object.keys(ENDINGS).map((k) => [k, () => D.ending(k)]),
  };
  for (const [row, buttons] of Object.entries(rows)) {
    const host = panel.querySelector(`[data-row="${row}"]`);
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      host.appendChild(b);
    }
  }
  const stat = panel.querySelector('.stat');
  setInterval(() => {
    const p = player.position;
    stat.innerHTML = `<b>${mission.state}</b> · ${roomAt(p.x, p.z, p.y - 1.66)} · `
      + `woo <b>${woo.score}</b> (${woo.band.key}) · tips <b>${woo.tipCount}</b>/${woo.tipCount + woo.tipsLeft}<br>`
      + `$${game.money} · ${cast.all.length + band.members.length} figures · `
      + `${woo.fired.size} events fired<br>`
      + `x ${p.x.toFixed(1)} z ${p.z.toFixed(1)} y ${(p.y - 1.66).toFixed(1)} · `
      + `she is ${date.position.distanceTo(p).toFixed(1)}m away (${date.mode})`;
  }, 250);
}

frame();

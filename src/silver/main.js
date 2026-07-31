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
import { AudioEngine } from '../core/audio.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { Drunk, BEER_UNITS, WHISKEY_UNITS } from '../core/drunk.js';
import { Highs } from '../core/highs.js';
import { PostFX } from '../core/postfx.js';
import { Inventory, ITEMS } from '../core/inventory.js';
import { makeHeldDrinks } from '../world/props.js';
import { makeMaterials } from '../world/materials.js';
import { roomEnvironment } from '../world/textures.js';

import { buildRoom, ROOMS, roomAt, zoneAt, CELLAR_Y, STAGE_H } from './room.js';
import { populate, makeBand } from './cast.js';
import { Date_ } from './date.js';
import { Woo, EVENTS, TIP_POINTS, TIP_TOTAL } from './woo.js';
import { Mission, ENDINGS } from './mission.js';
import { Dialogue } from '../bing/dialogue.js';
import { buildScripts, DATE, DATE_BARKS, BARKS, NOTES } from './script.js';
import { Performance, Sway, SET } from './perform.js';
import { makeTaxi } from './vehicle.js';
import { SCENE_IDS, createCampaign, navigateCampaign } from '../core/campaign.js';
import { createSilverStory } from '../core/silver-story.js';

/* The campaign owns the save. Loading this page claims the scene; the story
 * class gates the evening on the Motel being finished and on Margo having
 * rung, and folds the ending into campaign state. In preview mode
 * createCampaign() hands back page-local memory instead of localStorage. */
const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.SILVER_ROOM) {
  campaign.enter(SCENE_IDS.SILVER_ROOM, { spawn: 'kerb' });
}
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

const audio = new AudioEngine();
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
const inventory = new Inventory(4);

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
  barkAt: 14,
  lastBark: -1,
  swayRunning: false,
  /** Up between "get up" and the first bar, which is not nothing. */
  swayStarting: false,
  checkpoint: null,
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
    hud.say(`<em>Every last one of them. ${n} people, and not one of them said thank you like it was a favour.</em>`, 5200);
    mission.complete('tips');
  },
});

const mission = new Mission({
  onState: onMissionState,
  onObjective: paintObjectives,
  onNote: (text) => hud.say(text, 4600),
  onImpatient: (key) => date.bark(key, DATE_BARKS[key]),
  onCheckpoint: saveCheckpoint,
});

const dialogue = new Dialogue(ui.dialogue, {
  onLine: () => performance_.setDucked(true),
  onEnd: () => {
    performance_.setDucked(false);
    game.talkingTo = null;
  },
});

/* ------------------------------------------------------------------ */
/* Her                                                                 */
/* ------------------------------------------------------------------ */

const date = new Date_(scene, room, {
  onBark: (line) => hud.say(`<em>${DATE.name}:</em> ${line}`, 4600),
  onLeftBehind: () => {
    const n = mission.leftBehind();
    woo.fire('Woo.DateLeftBehind');
    date.bark('behind', DATE_BARKS.behind);
    if (n === 3) hud.say('<em>She has stopped hurrying to keep up, which is a decision rather than a speed.</em>', 5000);
  },
});

const performance_ = new Performance({
  audio,
  room,
  band,
  onNumber: (n) => {
    hud.toast(`♫ ${n.title} — the Midnight Pines`, '');
    if (n.say) hud.say(`<em>${n.lead}:</em> ${n.say}`, 5000);
    if (n.theOne) {
      // Three separate people said the third number was the one.
      if (game.known.has('third-number')) woo.fire('Woo.CallbackUsed');
      date.watch(band.leader.group, 4);
      date.bark('show', DATE_BARKS.show);
      offerSway();
    }
  },
  onApplause: () => { if (date.mode === 'seated') date.npc.say(1.2); },
  /* The set ends. It used to wrap round to the top and play forever, which
   * meant the third number — the one three separate people tell you is the one
   * — came round again, with the callback, the toast and another offer to dance
   * behind it. Four numbers, then a club between sets. */
  onSetEnd: () => {
    audio.setLoopVolume('ambience.diners', 0.26, 4);
    hud.toast('♫ end of the set', '');
    hud.say('<em>The lights come up a third and the room gets its voice back all at once. '
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

function paintObjectives(list) {
  ui.objectives.classList.remove('hidden');
  ui.objectiveList.replaceChildren(...list.map((o) => {
    const li = document.createElement('li');
    li.className = `${o.done ? 'done' : ''}${o.optional ? ' optional' : ''}`.trim();
    li.textContent = o.text;
    return li;
  }));
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
  return true;
}

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
  hud.setInventory(inventory, ITEMS);
}

/** Two drinks land on the table. Hers has one ice cube in it. */
function serveTable() {
  audio.play('pour', { volume: 0.45, position: room.anchors.frontTable });
  audio.play('ice.drop', { volume: 0.4, delay: 0.9, position: room.anchors.frontTable });
  audio.play('glass.set', { volume: 0.4, delay: 1.2, position: room.anchors.frontTable });
  frontGlasses(true);
  if (mission.flags.drinkOrdered === 'rye') {
    hud.say('<em>One cube. He did not have to be told, and she watches him not be told.</em>', 4600);
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
  hud.setInventory(inventory, ITEMS);
  if (drunk.level > 0.55) {
    hud.say('<em>She notices. She does not say anything, which is not the same as not noticing.</em>', 4200);
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
    hud.say('<em>The glass goes over. Not far, and not much in it, and a waiter is on it '
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
  seatPlayer(() => {
    mission.satDown();
    beginRound('table');
  });
}

function standFromTable() {
  if (!game.seated) return;
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
      hud.say(`<em>${DATE.name}:</em> Somebody raised you. I want their name.`, 4600);
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
    hud.say('<em>Two fingers off the cloth, and back to whatever they were saying. '
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
  constructor(beats, { camera: shots = [], onDone, dateSeat = null } = {}) {
    this.beats = beats.slice().sort((a, b) => a.at - b.at);
    this.shots = shots;
    this.onDone = onDone;
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
      }
      b.run?.();
    }

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
        // The manager says four words and the room starts moving.
        manager?.faceToward(A.tableStaging.x, A.tableStaging.z);
        for (const m of movers) m.faceToward(target.x, target.z);
        audio.play('table.set', { volume: 0.4, position: A.tableStaging });
      },
    },
    {
      at: 10.5,
      run: () => {
        /* The real table. Not a stand-in: this object is the one that is still
         * here in twenty minutes with her drink on it. */
        front.group.visible = true;
        front.group.position.set(A.tableStaging.x, 0, A.tableStaging.z);
      },
    },
    {
      at: 15.4,
      run: () => {
        front.group.position.set(target.x, 0, target.z);
        audio.play('table.set', { volume: 0.6, position: target });
        for (const m of movers) {
          m.group.position.set(target.x + (Math.random() - 0.5) * 2, 0, target.z + 1.2);
          m.faceToward(target.x, target.z, true);
        }
      },
    },
    {
      at: 16.6,
      run: () => {
        // Chairs
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
      at: 17.8,
      run: () => {
        // Cloth
        for (const c of front.group.children) {
          if (c.geometry?.type === 'CylinderGeometry' && c.scale.y > 0.4) c.visible = true;
        }
        front.group.children.forEach((c) => { if (c.name !== 'setting') c.visible = true; });
        audio.play('cloth.snap', { volume: 0.7, position: target });
        waiter?.faceToward(target.x, target.z);
      },
    },
    {
      at: 19.2,
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
          npc.faceToward(target.x, target.z);
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
      { at: 9.2, to: new THREE.Vector3(A.hostMark.x - 1.5, 1.7, A.hostMark.z - 1), look: { x: A.tableStaging.x, y: 1.2, z: A.tableStaging.z }, dur: 4.5 },
      { at: 15, to: new THREE.Vector3(A.hostMark.x - 3, 1.68, A.hostMark.z - 3), look: { x: target.x, y: 0.9, z: target.z }, dur: 6 },
      /* Slow. This is a twenty-metre dolly across the whole room and at dur 3
       * it was a whip pan; at 6 it is the room being taken in. */
      { at: 22, to: new THREE.Vector3(-6, 1.66, -1.5), look: { x: target.x, y: 1.0, z: target.z }, dur: 6 },
    ],
    onDone: () => {
      mission.tableBuilt();
      game.chairPads.his.position.set(A.frontSeats[0].x, 0.7, A.frontSeats[0].z);
      game.chairPads.her.position.set(A.frontSeats[1].x, 0.7, A.frontSeats[1].z);
      date.release();
      date.follow();
      hud.say('<em>She has not said anything for eleven seconds, which for her is a review.</em>', 5000);
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
function sendChampagne() {
  if (champagneSent || !game.seated) return;
  champagneSent = true;
  mission.flags.champagneSent = true;
  const target = room.anchors.frontTable;
  const waiter = comesToTable(cast.byName.waiter, { x: 1.2, z: 1.4 });
  audio.play('cork.pop', { volume: 0.55, position: target });

  game.scene = new Cutscene(scripts.scenes.champagne.map((b) => ({ ...b })), {
    dateSeat: room.anchors.frontSeats[1],
    camera: [
      { at: 0, to: player.position.clone(), look: { x: target.x + 1.2, y: 1.4, z: target.z + 1.4 }, dur: 1.5 },
      { at: 5.5, to: player.position.clone(), look: { x: cast.crewTable.x, y: 1.3, z: cast.crewTable.z }, dur: 3 },
    ],
    onDone: () => {
      // Control comes back sitting down, which is where it was.
      player.mode = 'seated';
      goesBack(waiter);
      mission.addObjective('thanks', 'Acknowledge the table by the pillar', { optional: true });
      thanksPad.visible = true;
      hud.say('<em>Look over at the pillar and [E] to lift a glass at them.</em>', 4600);
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
  audio.setLoopVolume('ambience.diners', 0.1, 2.2);

  const beats = [
    ...scripts.scenes.show.map((b) => ({ ...b })),
    { at: 0.2, run: () => audio.play('light.dip', { volume: 0.5 }) },
    { at: 4.8, run: () => audio.play('mic.handle', { volume: 0.4, position: A.stageCentre }) },
    {
      at: 8.2,
      run: () => {
        room.setHouse(0.28, 1);
        audio.play('stage.clunk', { volume: 0.55, position: A.stageCentre });
        performance_.begin();
      },
    },
    { at: 10.5, run: () => { performance_.applaud(1.1); date.npc.faceToward(A.stageCentre.x, A.stageCentre.z); } },
  ];

  const seat = A.frontSeats[0];
  game.scene = new Cutscene(beats, {
    dateSeat: A.frontSeats[1],
    camera: [
      { at: 0, from: player.position.clone(), to: new THREE.Vector3(seat.x, 1.24, seat.z), look: { x: A.stageCentre.x, y: 1.6, z: A.stageCentre.z }, dur: 3 },
      { at: 11.5, to: new THREE.Vector3(seat.x, 1.24, seat.z), look: { x: A.frontSeats[1].x, y: 1.3, z: A.frontSeats[1].z }, dur: 2 },
    ],
    onDone: () => {
      player.mode = 'seated';
      /* Still centred on her. The stage is a ninety-degree turn from that and
       * inside the range, which is the only arrangement where both of the
       * things the second half is about are things you can choose to look at. */
      player.yawCenter = seat.faceYaw;
      player.yawRange = 1.9;
      mission.showStarted();
      audio.setLoopVolume('ambience.diners', 0.16, 2);
    },
  });
}

/**
 * The room going quiet for a second and a half.
 *
 * Used once, for "Funny how?". Nothing else in the mission does this, which is
 * the only reason it works.
 */
function holdTheRoom(on) {
  audio.setLoopVolume('ambience.diners', on ? 0.02 : 0.16, on ? 0.25 : 1.2);
  performance_.setDucked(on);
  for (const key of ['ape', 'bing-bouncer', 'waiter']) {
    const npc = cast.byName[key];
    if (npc && on) npc.faceToward(player.position.x, player.position.z);
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
function beginRound(id) {
  if (mission.roundsDone.has(id) || game.round === id) return;
  game.round = id;
  const at = {
    table: 'table',
    entrance: 'round1',
    work: 'round2',
    funny: 'funny',
    personal: 'personal',
  }[id];
  if (!at) return;
  dialogue.start(scripts.seated, at, date.npc);
  date.watch(null, 0);
}

const ROUND_QUEUE = [
  { id: 'table', after: 0 },
  { id: 'entrance', after: 6 },
  { id: 'work', after: 26 },
  /* Skipped if the order already happened — the waiter patrols within reach
   * of the front table, so a player can wave him down before the queue does,
   * and the round must not then play a second time. */
  { id: 'drinks', after: 48, run: () => { if (!mission.roundsDone.has('drinks')) waiterComesOver(); } },
  { id: 'family', after: 96, run: () => apeComesOver() },
  { id: 'funny', after: 150 },
  { id: 'personal', after: 186 },
  { id: 'show', after: 240, run: () => startShowCutscene() },
  /* After the band. The evening keeps having things in it — this is the
   * window the brief asks for, where the player works out for himself that
   * it is going well rather than being handed a button that says so. */
  { id: 'another', after: 300, run: () => waiterComesOver('another') },
  { id: 'toast', after: 355, run: () => raiseAGlass() },
  { id: 'dessert', after: 430, run: () => waiterComesOver('dessert') },
];

let queueAt = 0;
let seatedFor = 0;
function runSeatedQueue(dt) {
  if (!game.seated || game.scene) return;
  seatedFor += dt;
  // The champagne arrives on its own clock, between the drinks and the family
  if (seatedFor > 74 && !champagneSent && !dialogue.active) sendChampagne();

  const next = ROUND_QUEUE[queueAt];
  if (!next || seatedFor < next.after) return;
  if (dialogue.active) return;
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
  /* His own spot on the far corner of the table — NOT the waiter's mark. The
   * two offsets used to be 22cm apart, so the round where the ape lingers put
   * him inside whichever waiter was next summoned. */
  ape.group.position.set(target.x + 1.7, 0, target.z + 0.5);
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
  setTimeout(() => {
    if (dialogue.active || game.scene || mission.flags.swayed) return;
    dialogue.start(scripts.sway, 'open', date.npc);
  }, 4000);
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
    hud.say('<em>Four bars. Hit [E] on the beat and try to look like you meant it.</em>', 4600);
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

function offerInvitation() {
  if (!mission.invitationReady) return false;
  if (!mission.offerInvitation()) return false;
  mission.addObjective('ask', 'Decide how the night ends');
  dialogue.start(scripts.invitation, 'open', date.npc);
  return true;
}

function judgeInvitation() {
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
    player: { x: player.position.x, z: player.position.z, yaw: player.yaw },
    date: { x: date.position.x, z: date.position.z, mode: date.mode },
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
    },
  };
  try {
    localStorage.setItem('squatch.fac.checkpoint', JSON.stringify(game.checkpoint));
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
  if (l.taxiGone && !taxiGone) leaveTaxi();

  /* The table is a real object that the cutscene carried into place. If the
   * checkpoint was taken after that, it is where it was; putting it back is a
   * matter of what is visible, not of playing the scene again. */
  if (mission.flags.tableBuilt) showFrontTable();
  /* The pillar's raise-a-glass pad is stood up by the champagne scene. A
   * restore that skipped this lost the thank-you (and its objective) for the
   * rest of a champagne-sent evening: the raycaster only sees visible pads. */
  thanksPad.visible = !!mission.flags.champagneSent;

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
  player.position.set(cp.player.x, room.groundAt(cp.player.x, cp.player.z) + 1.66, cp.player.z);
  player.yaw = cp.player.yaw;
  hud.setMode('walk');
  hud.setPosture(null);
  game.seated = false;
  date.group.position.set(cp.date.x, room.groundAt(cp.date.x, cp.date.z), cp.date.z);
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
    hud.say('<em>She is out of the car and looking at the front door, which has a queue on it.</em>', 5000);
    setTimeout(() => {
      if (!dialogue.active) dialogue.start(scripts.arrival, 'open', date.npc);
    }, 3000);
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

function updateZones() {
  const p = player.position;
  const next = roomAt(p.x, p.z, p.y - 1.6);
  const nextZone = zoneAt(next);

  /* Five beds, crossfaded on where he is standing. The club leaks backwards
   * through the building at exactly the rate the route walks forwards, which
   * is the whole trick of the entrance: the glamour arrives before you do. */
  const mix = {
    exterior: { alley: 0.5, cellar: 0.0, kitchen: 0.02, diners: 0.03, band: 0.05 },
    cellar: { alley: 0.06, cellar: 0.4, kitchen: 0.1, diners: 0.03, band: 0.06 },
    kitchen: { alley: 0.02, cellar: 0.08, kitchen: 0.42, diners: 0.06, band: 0.12 },
    corridor: { alley: 0.0, cellar: 0.02, kitchen: 0.16, diners: 0.2, band: 0.34 },
    club: { alley: 0.0, cellar: 0.0, kitchen: 0.03, diners: 0.34, band: 0.85 },
  }[nextZone] ?? { alley: 0.2, cellar: 0, kitchen: 0, diners: 0.1, band: 0.1 };

  audio.setLoopVolume('ambience.alley', mix.alley, 1.1);
  audio.setLoopVolume('ambience.cellar', mix.cellar, 1.1);
  audio.setLoopVolume('ambience.kitchen', mix.kitchen, 1.1);
  audio.setLoopVolume('ambience.diners', mix.diners, 1.1);
  for (const s of ['rhythm', 'horns', 'piano', 'vocal']) {
    const n = performance_.current;
    if (n) audio.setLoopVolume(`band.${s}`, n.stems[s] * mix.band, 1.1);
  }
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
    drystore: 'cellar', walkin: 'cellar', prep: 'kitchen', kitchen: 'kitchen',
    dish: 'kitchen', corridor: 'corridor', floor: 'floor', lobby: 'floor' }[next];
  const notes = NOTES[key];
  if (notes && !game.noted.has(key)) {
    game.noted.add(key);
    hud.say(notes[(Math.random() * notes.length) | 0], 4800);
  }
  if (key && DATE_BARKS[key] && date.mode === 'follow') {
    setTimeout(() => date.bark(key, DATE_BARKS[key]), 1400);
  }

  if (next === 'alley' && mission.state === 'arrived') mission.intoAlley();
  if ((next === 'cellar' || next === 'stair') && mission.state === 'service-route') mission.intoCellar();
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

/* What the building sounds like when nobody is talking to you. */
function barks(dt) {
  game.barkAt -= dt;
  if (game.barkAt > 0 || dialogue.active || game.scene) return;
  game.barkAt = 11 + Math.random() * 12;
  const key = { street: null, alley: 'alley', stair: 'alley', cellar: 'cellar',
    drystore: 'cellar', walkin: 'cellar', prep: 'kitchen', kitchen: 'kitchen',
    dish: 'kitchen', corridor: 'corridor', floor: 'floor', lobby: 'floor' }[where];
  const list = BARKS[key];
  if (!list) return;
  let i = (Math.random() * list.length) | 0;
  if (i === game.lastBark) i = (i + 1) % list.length;
  game.lastBark = i;
  const [who, line] = list[i];
  hud.say(`<em>${who}:</em> ${line}`, 4200);
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
    if (mission.flags.swayed === 'refused' && !mission.flags.toast) askAgain();
    else if (mission.invitationReady) offerInvitation();
    else if (mission.flags.showStarted && !mission.flags.toast) raiseAGlass();
  }
  if (/^Digit[1-7]$/.test(e.code)) {
    const n = Number(e.code.slice(-1)) - 1;
    if (dialogue.active && dialogue.options.length) dialogue.choose(n);
  }
  if (e.code === 'Escape') document.exitPointerLock?.();
  if (e.code === 'Tab') {
    e.preventDefault();
    ui.objectives.classList.toggle('hidden');
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
  player.mode = 'frozen';
  player.position.set(taxi.park.x - 0.6, 1.3, taxi.park.z - 1.6);
  player.yaw = Math.PI;
  player.pitch = -0.05;
  date.takeOver();
  date.group.position.set(taxi.park.x - 1.8, 0, taxi.park.z - 1.4);

  audio.play('car.door', { volume: 0.55, delay: 2.2 });
  audio.play('car.door', { volume: 0.5, delay: 3.0 });

  /* The car comes up the street — along it, nose first, the way a car arrives
   * at a kerb — and eases to a stop wholly on the road. The camera glides with
   * it at the kerbline, looking at the frontage sliding past, which is the
   * first thing the evening shows you: the queue, the rope, the sign. */
  let t = 0;
  game.drive = (dt) => {
    t += dt;
    const k = Math.min(1, t / 2.2);
    const e = k * k * (3 - 2 * k);
    taxi.group.position.x = taxi.park.x - 22 * (1 - e);
    taxi.driver.group.position.x = taxi.group.position.x + 0.55;
    player.position.x = taxi.group.position.x - 0.6;
    date.group.position.x = taxi.group.position.x - 1.8;
    if (t > 3.2) {
      player.position.set(A.dropOff.x, 1.66, A.dropOff.z);
      /* On whatever she is standing on rather than on zero: the drop-off is
       * on the pavement, which is 140mm up. */
      const dx = A.dropOff.x - 1.7;
      const dz = A.dropOff.z - 0.1;
      date.group.position.set(dx, room.groundAt(dx, dz), dz);
      date.release();
      player.mode = 'walk';
      game.drive = null;
      mission.outOfCar();
      registerDriver();
    }
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
  }
  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();

  if (!game.started) {
    game.started = true;
    for (const bed of ['alley', 'cellar', 'kitchen', 'diners']) {
      audio.startLoop(`ambience.${bed}`, { volume: 0, ambience: true, fade: 1.5 });
    }
    audio.setLoopVolume('ambience.alley', 0.5, 1.5);
    room.setHouse(1, 0, true);
    addMoney(0);
    paintWoo(woo.score, 0, null);
    paintObjectives(mission.objectives);
    arrive();
    hud.say('<em>As far back as you can remember, you have wanted to be the man who does not '
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

assetStatus.innerHTML = 'Everything in here is drawn and synthesised at load time — '
  + 'no models, no textures, no audio files.';
loading.classList.add('hidden');

window.__silver = {
  THREE, scene, camera, renderer, postfx, player, room, cast, band, date, taxi,
  mission, woo, dialogue, hud, audio, game, interaction, drunk, inventory,
  scripts, performance: performance_, sway, settings, ROOMS, SET, EVENTS, ENDINGS,
  campaign, story,
  get campaignState() { return campaign.state; },
  /* The pieces the headless driver has to be able to step by hand, because it
   * runs the update path directly rather than waiting on frames. */
  __zones: () => updateZones(),
  __seatTick: (dt) => runSeatedQueue(dt),
  __host: () => checkHostStation(),
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

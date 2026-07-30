/**
 * A Quick Stop at the Bing -- entry point.
 *
 * Same engine as the flat: the first-person controller, the look-at
 * interaction system, the HUD, the audio engine and the intoxication model all
 * come straight out of src/core. What is new is the building, the people in
 * it, two things to lose money on, and a man in the back who has been waiting.
 *
 * The rule this level is built around: you never lose control because somebody
 * important started talking. There is no cutscene in here, including the one
 * everybody would expect at the end.
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
import {
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { createBadaBingTwoStory } from '../core/bada-bing-two-story.js';
import { makeHeldDrinks } from '../world/props.js';
import { makeMaterials } from '../world/materials.js';
import { roomEnvironment } from '../world/textures.js';

import { buildClub, ROOMS, roomAt, STAGE_H } from './club.js';
import { populate, makeAssociate } from './cast.js';
import { makeSlotMachine, SlotMachine } from './slots.js';
import { Blackjack, BETS } from './blackjack.js';
import { makePlayerCar, populateLot } from './vehicles.js';
import { Dialogue } from './dialogue.js';
import { buildScripts, AMBIENT, NOTES } from './script.js';
import { Mission, ENDINGS } from './mission.js';
import {
  SecondVisitMission,
  buildSecondVisitLouScript,
} from './second-visit.js';

const START_CASH = 340;
const DRINK_TIME = 2.4;

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');
const blackout = document.getElementById('blackout');
const assetStatus = document.getElementById('asset-status');
const fxDrunk = document.getElementById('fx-drunk');

const ui = {
  objectives: document.getElementById('objectives'),
  objectiveList: document.querySelector('#objectives ul'),
  wallet: document.getElementById('wallet'),
  cash: document.querySelector('#wallet .cash'),
  gamble: document.getElementById('gamble'),
  gambleTitle: document.querySelector('#gamble .title'),
  gambleBody: document.querySelector('#gamble .body'),
  gambleKeys: document.querySelector('#gamble .keys'),
  carrying: document.getElementById('carrying'),
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
  window.__squatchFail?.(
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
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

{
  // Chrome, brass and glass need something to reflect or they render black.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();
  src.dispose();
}

const postfx = new PostFX(renderer, scene, camera);
postfx.enable();

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
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const drunk = new Drunk();
const highs = new Highs();
const inventory = new Inventory(4);
const campaign = createCampaign();
const requestedVisit = new URLSearchParams(location.search).get('visit');
const isSecondVisit = requestedVisit === '2'
  || campaign.state.scene.id === SCENE_IDS.BADA_BING_TWO;
const activeSceneId = isSecondVisit ? SCENE_IDS.BADA_BING_TWO : SCENE_IDS.BADA_BING_ONE;
if (campaign.state.scene.id !== activeSceneId) {
  campaign.enter(activeSceneId, { spawn: 'driver_seat' });
}
const secondVisitStory = isSecondVisit ? createBadaBingTwoStory({ campaign }) : null;

const game = {
  started: false,
  storyStarted: false,
  paused: false,
  over: false,
  money: START_CASH,
  seatedIn: null,      // 'car' | 'table' | null
  atMachine: false,
  drinking: 0,
  heldDrink: null,
  elapsed: 0,
  lastAmbient: -1,
  ambientAt: 20,
  noted: new Set(),
  stagedOn: false,
  louTalking: false,
};

const MissionType = isSecondVisit ? SecondVisitMission : Mission;
const mission = new MissionType({
  onObjective: paintObjectives,
  onMessage: (text) => {
    hud.toast(text, '');
    audio.play('phone.ring', { volume: 0.35 });
  },
  onNote: (text) => hud.say(text, 4200),
  onState: (state) => { if (state === 'done') finish(); },
  onAssociate: sendAssociate,
});

const dialogue = new Dialogue(ui.dialogue, {
  onLine: () => audio.play('radio.talk', { volume: 0.0 }),
  onEnd: () => { game.louTalking = false; },
});

/* ------------------------------------------------------------------ */
/* The building                                                        */
/* ------------------------------------------------------------------ */

window.__squatchStage?.('Wiring the neon…');
const club = buildClub(scene, { renderer });
world.colliders = club.colliders;
world.floorZones = club.floorZones;
world.groundAt = club.groundAt;

window.__squatchStage?.('Letting people in…');
const cast = populate(scene, club, { includeMargo: !isSecondVisit });
const associate = makeAssociate(scene, club.anchors.hallMouth, club.colliders, club.navBlockers);

/* ------------------------------------------------------------------ *
 * The gambling floor's voice.
 *
 * A hand of blackjack takes a few seconds, and there is something worth
 * remarking on at four separate points in it -- the deal, a hit, the stand,
 * and the payout. Left alone that is the dealer and the prospect narrating
 * every card of a long shoe at each other, which stops being funny somewhere
 * in the first minute.
 *
 * So the table has one floor between the two of them: a line, then quiet for
 * a while, whoever it was that spoke. Each moment also carries its own chance
 * roll, low for the routine ones and high for the rare ones, and the rare
 * outcomes get first refusal on the floor by being offered it first.
 *
 * A refused roll must NOT consume the cooldown, and neither must a line that
 * has no recording yet -- say() returns false in both cases, and an ungenerated
 * bank would otherwise sit on the floor in silence and mute the whole table.
 * ------------------------------------------------------------------ */
let lastTableLine = -999;
function tableSay(group, { chance = 1, delay = 0, gap = 7 } = {}) {
  const now = performance.now() / 1000;
  if (now - lastTableLine < gap) return false;
  if (chance < 1 && Math.random() > chance) return false;
  if (!audio.say(group, { delay })) return false;
  lastTableLine = now;
  return true;
}

/* Offer the floor to each candidate in turn and stop at the first one that
 * takes it. Exactly one line per moment: say() cancels a previously scheduled
 * line when a new one arrives, so two calls in the same tick would leave the
 * first one silently unplayed rather than queued behind it. */
function tableSayFirst(candidates) {
  for (const [group, opts] of candidates) {
    if (group && tableSay(group, opts)) return true;
  }
  return false;
}

/* Spins in a row that paid nothing. The machine is across the room from the
 * felt and keeps its own counsel, so it does not share the table's floor. */
let deadSpins = 0;

/* The verdict, big and unmistakable, because "the dealer quietly sweeps your
 * chips" turned out to be too subtle a way to find out how the hand went.
 * The text stays in the node after the fade so the state remains inspectable. */
const bjCallout = document.getElementById('bj-callout');
let bjCalloutTimer = 0;
function showHandCallout({ kind, staked = 0, payout = 0 } = {}) {
  if (!bjCallout || !kind) return;
  const net = Math.round(payout - staked);
  const view = {
    blackjack: ['BLACKJACK', `+$${net}`, 'win'],
    win: ['YOU WIN', `+$${net}`, 'win'],
    push: ['PUSH', 'the bet comes back', 'push'],
    bust: ['BUST', `−$${staked}`, 'lose'],
    lose: ['HOUSE WINS', `−$${staked}`, 'lose'],
  }[kind];
  if (!view) return;
  bjCallout.innerHTML = `<span class="word">${view[0]}</span><span class="net">${view[1]}</span>`;
  bjCallout.classList.remove('win', 'push', 'lose');
  bjCallout.classList.add('show', view[2]);
  clearTimeout(bjCalloutTimer);
  bjCalloutTimer = setTimeout(() => bjCallout.classList.remove('show'), 2400);
}

// The machine bolted to the floor by the front booths
const slotParts = makeSlotMachine({ x: club.slot.x, z: club.slot.z, rotY: Math.PI });
scene.add(slotParts.group);
const slots = new SlotMachine(slotParts, {
  getMoney: () => game.money,
  spend: (n) => addMoney(-n),
  win: (n) => addMoney(n),
  onSpin: () => {
    audio.play('slot.pull', { volume: 0.5, position: slotParts.group.position });
    audio.play('slot.reel', { volume: 0.32, position: slotParts.group.position });
    mission.spun();
  },
  onStop: () => audio.play('slot.stop', { volume: 0.34, position: slotParts.group.position }),
  onWin: (amount) => {
    audio.play('slot.win', { volume: 0.5 });
    hud.toast(`+$${amount}`, 'good');
    deadSpins = 0;
  },
  onLose: () => {
    hud.say('<em>The machine takes it with mechanical indifference.</em>', 2600);
    /* Only once it is a run of nothing, so the line reads as a running total
     * rather than a verdict on one pull. If the roll declines, the streak
     * carries -- he gets there eventually instead of losing the moment. */
    if (++deadSpins >= 4 && audio.say('slots.dead', { chance: 0.6, delay: 1.4 })) deadSpins = 0;
  },
  onJackpot: (amount) => {
    audio.play('slot.jackpot', { volume: 0.75 });
    hud.toast(`JACKPOT · $${amount}`, 'good');
    hud.say('Every head in the room turns. Lou can hear this from the office. Lou <em>will</em> hear about this.', 6000);
    mission.jackpot();
    for (const npc of cast.all) npc.faceToward(slotParts.group.position.x, slotParts.group.position.z);
    deadSpins = 0;
    // Well behind the bell, so he is reacting to the room rather than to a reel.
    audio.say('slots.jackpot', { delay: 2.6 });
  },
  onNote: (text) => hud.toast(text, ''),
});

// The table in the corner, and the seat they keep open for the prospect
const seat = club.anchors.blackjackSeats[2];
const blackjack = new Blackjack(scene, { x: club.bj.x, z: club.bj.z }, seat, {
  getMoney: () => game.money,
  spend: (n) => addMoney(-n),
  win: (n) => addMoney(n),
  onDeal: () => audio.play('card.deal', { volume: 0.45, position: club.anchors.blackjack }),
  onFlip: () => audio.play('card.flip', { volume: 0.5, position: club.anchors.blackjack }),
  onChips: () => audio.play('chips.place', { volume: 0.4, position: club.anchors.blackjack }),
  onState: paintGamble,
  onHandDone: (hands, won, outcome = {}) => {
    mission.handPlayed();
    if (won) audio.play('chip.stack', { volume: 0.55, position: club.anchors.blackjack });
    showHandCallout(outcome);
    void hands;

    /* Cleaned out. Trumps whatever else the hand was, because being unable to
     * make the twenty-five is the end of the evening rather than a result. */
    if (game.money < BETS[0]) {
      tableSay('bj.broke', { delay: 1.8, gap: 0 });
      return;
    }

    /* Otherwise: the rarer the outcome, the earlier it is offered the floor and
     * the likelier it is to take it. The dealer is the fallback on the ordinary
     * hands -- he calls the table when the prospect has nothing to add.
     *
     * The result of a hand gets a much shorter gap than the patter that led up
     * to it (SETTLE vs. the 6-12s on deal/hit/stand). The chance rolls do the
     * rationing across hands; the gap is only here so the dealer calling the
     * deal cannot mute the payoff two seconds later. One second clears the two
     * tightest cases with margin: a natural blackjack settles 1.75s after the
     * deal patter, and a stand against a dealer already on seventeen settles
     * 1.25s after "Dealer plays." */
    const SETTLE = 1.0;
    const { kind, doubled, dealerBlackjack } = outcome;
    if (kind === 'blackjack') {
      tableSayFirst([
        ['bj.blackjack', { chance: 0.85, delay: 1.2, gap: SETTLE }],
        ['bj.dealer.payout', { delay: 0.4, gap: SETTLE }],
      ]);
    } else if (kind === 'win' && doubled) {
      tableSayFirst([
        ['bj.double', { chance: 0.9, delay: 1.3, gap: SETTLE }],
        ['bj.dealer.payout', { delay: 0.4, gap: SETTLE }],
      ]);
    } else if (kind === 'bust') {
      tableSayFirst([
        ['bj.bust', { chance: 0.5, delay: 1.0, gap: SETTLE }],
        ['bj.dealer.bust', { chance: 0.5, delay: 0.35, gap: SETTLE }],
      ]);
    } else if (kind === 'win') {
      tableSayFirst([
        ['bj.win', { chance: 0.35, delay: 1.1, gap: SETTLE }],
        ['bj.dealer.payout', { chance: 0.45, delay: 0.4, gap: SETTLE }],
      ]);
    } else if (kind === 'lose') {
      tableSayFirst([
        // The dealer turning over twenty-one is worth him saying so.
        [dealerBlackjack ? 'bj.dealer.blackjack' : null, { chance: 0.7, delay: 0.5, gap: SETTLE }],
        ['bj.lose', { chance: 0.35, delay: 1.2, gap: SETTLE }],
      ]);
    }
    // A push is a non-event. Nobody remarks on getting their own money back.
  },
});

const car = makePlayerCar(scene, {
  x: club.anchors.playerCar.x,
  z: club.anchors.playerCar.z,
  yaw: Math.PI / 2,
});
club.colliders.push(car.worldCollider);
const lot = populateLot(scene, club.colliders, club.anchors);

/* Put him behind the wheel before the first frame. Booting at the origin and
 * tweening out to the car meant the zone system spent a second convinced he
 * was standing in the middle of the club, and started Lou's patience clock
 * before the engine was even off. */
player.position.copy(car.driverPosition());
player.yaw = car.driverYaw();
player.mode = 'frozen';

/* Held drinks ride on the camera, exactly as they do in the flat. */
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

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

const scriptContext = {
  mission,
  flags: mission.flags,
  money: () => game.money,
  drunkLevel: () => drunk.level,
  spins: () => mission.spins,
  hands: () => mission.hands,
  asked: new Set(),
  order: (what) => serveDrink(what),
  sitAtTable: () => sitAtTable(),
  showParcel: () => {
    club.office.parcel.visible = true;
    mission.parcelOut();
    audio.play('gun.pickup', { volume: 0.3, position: club.anchors.parcel });
  },
  showEnvelope: () => { club.office.envelope.visible = true; },
};
const scripts = buildScripts(scriptContext);
if (isSecondVisit) scripts.lou = buildSecondVisitLouScript({ mission });

/* ------------------------------------------------------------------ */
/* Money, drinks, objectives                                           */
/* ------------------------------------------------------------------ */

function addMoney(delta) {
  game.money = Math.max(0, game.money + delta);
  ui.cash.textContent = `$${game.money.toLocaleString()}`;
  ui.wallet.classList.remove('hidden');
  ui.wallet.classList.toggle('down', delta < 0);
  ui.wallet.classList.add('bump');
  setTimeout(() => ui.wallet.classList.remove('bump'), 180);
}

function paintObjectives(list) {
  ui.objectives.classList.remove('hidden');
  ui.objectiveList.replaceChildren(...list.map((o) => {
    const li = document.createElement('li');
    li.className = o.done ? 'done' : '';
    li.textContent = o.text;
    return li;
  }));
}

/** What is inside the jacket. Its own line, because it is not in your hands. */
function paintCarrying() {
  const item = game.carrying ? ITEMS[game.carrying] : null;
  if (!item) {
    ui.carrying.classList.add('hidden');
    return;
  }
  ui.carrying.classList.remove('hidden');
  ui.carrying.innerHTML = `<span class="icon">${item.icon}</span>`
    + `<span class="what">${item.name}</span><span class="where">${item.hint}</span>`;
}

function serveDrink(what) {
  const kind = what === 'whiskey' ? 'whiskey' : what === 'beer' ? 'beer' : 'soft';
  audio.play(kind === 'soft' ? 'glass.set' : 'can.crack', { volume: 0.5, position: club.anchors.barService });
  audio.play('till.ring', { volume: 0.3, delay: 0.6, position: club.anchors.barService });
  if (kind === 'soft') {
    hud.toast('Club soda. Very professional.', '');
    return;
  }
  /* Four hands' worth is the limit, and there is nowhere in a club to put a
   * beer down, so the bar stops serving rather than pouring into the void. */
  if (inventory.full) {
    hud.say('<em>Bartender:</em> Finish one of those first. I am not a shelf.', 4200);
    return;
  }
  game.heldDrink = kind;
  inventory.add(kind === 'whiskey' ? 'whiskey' : 'beer');
  hud.setHand({ ...ITEMS[kind === 'whiskey' ? 'whiskey' : 'beer'], hint: 'Hold [F] to drink' });
  hud.setInventory(inventory, ITEMS);
  mission.drank();
}

function drinkTick(dt) {
  if (!game.heldDrink) return;
  if (!keys.has('KeyF')) {
    if (game.drinking > 0) {
      game.drinking = 0;
      poseDrink(null, 0);
    }
    return;
  }
  game.drinking += dt;
  const k = Math.min(1, game.drinking / DRINK_TIME);
  poseDrink(game.heldDrink === 'whiskey' ? 'bottle' : 'can', k);
  if (k < 1) return;
  // Down it
  const units = game.heldDrink === 'whiskey' ? WHISKEY_UNITS : BEER_UNITS;
  drunk.drink(units);
  audio.play(game.heldDrink === 'whiskey' ? 'can.sip' : 'can.crush', { volume: 0.5 });
  inventory.remove?.(game.heldDrink === 'whiskey' ? 'whiskey' : 'beer');
  game.heldDrink = null;
  game.drinking = 0;
  poseDrink(null, 0);
  hud.setHand(null);
  hud.setInventory(inventory, ITEMS);
  hud.say(drunk.level > 0.5
    ? 'That one landed. Lou is going to be able to tell.'
    : 'Warm. Free. Not the point of the visit.', 3600);
}

/* ------------------------------------------------------------------ */
/* Interactables                                                       */
/* ------------------------------------------------------------------ */

function reg(mesh, desc) {
  if (!mesh) return null;
  return interaction.register(mesh, desc);
}

/** Doors: the leaf swings, the collider comes out of the wall, that is all. */
function registerDoor(key, opts = {}) {
  const door = club.doors[key];
  if (!door) return;
  reg(door.leaf, {
    label: () => {
      if (door.locked) return `<b>${door.label}</b> — locked`;
      return `${door.open ? 'Close' : 'Open'} <b>${door.label}</b>`;
    },
    onUse: () => {
      if (door.locked) {
        audio.play('door.locked', { volume: 0.6, position: door.pivot.position });
        hud.say(opts.lockedLine ?? 'Locked. Tonight, anyway.', 3000);
        return;
      }
      const wasOpen = door.open;
      door.toggle();
      audio.play(wasOpen ? 'door.knob' : 'door.creak', { volume: 0.5, position: door.pivot.position });
      opts.onToggle?.(door);
    },
  });
}

registerDoor('front');
registerDoor('inner');
registerDoor('manager', { lockedLine: 'The manager’s office. There is no manager. There is a room.' });
registerDoor('ladies', { lockedLine: 'Not tonight, and not ever, frankly.' });
registerDoor('mens');
registerDoor('storage');
registerDoor('lou', {
  onToggle: (door) => {
    if (door.open && mission.state === 'office' && game.louTalking) {
      dialogue.start(scripts.lou, 'doorOpen', cast.byName.lou);
    }
  },
});
registerDoor('service', {
  onToggle: (door) => {
    if (!door.open) return;
    if (!mission.flags.alarmDisabled) {
      mission.flags.alarmTripped = true;
      audio.play('alarm.chirp', { volume: 0.6, position: club.anchors.serviceDoor });
      hud.say('The box above the door chirps twice. Somebody in this building now knows.', 4200);
    } else {
      hud.say('Nothing. Which is the whole reason you flipped the isolator.', 3200);
    }
  },
});

/* ---- people ---- */

function talkTo(npc, tree, at = 'open') {
  return {
    label: () => `Talk to <b>${npc.name}</b>`,
    onUse: () => {
      npc.faceToward(player.position.x, player.position.z);
      dialogue.start(tree, at, npc);
    },
  };
}

reg(cast.byName.bouncer.group, {
  label: () => (mission.readyToLeave ? 'Say something to the <b>bouncer</b>' : 'Talk to the <b>bouncer</b>'),
  onUse: () => {
    const npc = cast.byName.bouncer;
    npc.faceToward(player.position.x, player.position.z);
    if (mission.readyToLeave) dialogue.start(scripts.bouncer, 'leaving', npc);
    else if (mission.flags.bouncerCleared) dialogue.start(scripts.bouncer, 'returning', npc);
    else dialogue.start(scripts.bouncer, 'open', npc);
  },
});
reg(cast.byName.bartender.group, talkTo(cast.byName.bartender, scripts.bartender));
reg(cast.byName.hallGuard.group, talkTo(cast.byName.hallGuard, scripts.hallGuard));
reg(cast.byName.dealer.group, talkTo(cast.byName.dealer, scripts.dealer));
reg(cast.byName.dj.group, talkTo(cast.byName.dj, scripts.dj));
/* Scene One only, so she is registered only when she is actually in the room. */
if (cast.byName.margo) {
  reg(cast.byName.margo.group, {
    label: () => (mission.flags.gaveNumber
      ? 'Say goodnight to <b>Margo</b>'
      : 'Talk to the <b>woman at the end of the bar</b>'),
    onUse: () => {
      const her = cast.byName.margo;
      her.faceToward(player.position.x, player.position.z);
      dialogue.start(scripts.margo, mission.flags.gaveNumber ? 'number' : 'open', her);
    },
  });
}
reg(cast.byName.lou.group, {
  label: () => (mission.state === 'briefed' ? 'Confirm with <b>Lou</b>' : 'Talk to <b>Lou</b>'),
  onUse: () => {
    const lou = cast.byName.lou;
    lou.faceToward(player.position.x, player.position.z);
    if (mission.state === 'briefed') dialogue.start(scripts.lou, 'parting', lou);
    else if (mission.flags.gotPackage) dialogue.start(scripts.lou, 'envelope', lou);
    else if (dialogue.history.size) dialogue.start(scripts.lou, 'greet', lou);
    else startLouScene();
  },
});

/* ---- the office ---- */

reg(club.office.parcel, {
  label: () => (mission.flags.gotPackage ? 'Look at it again' : 'Take the <b>package</b>'),
  enabled: () => !isSecondVisit,
  hold: 0.9,
  onTap: () => {
    if (mission.flags.gotPackage) return;
    club.office.parcelGun.visible = true;
    hud.say('Under the cloth: a compact black thing with worn grips. It has been somewhere before.', 4600);
  },
  onUse: () => {
    if (mission.flags.gotPackage) {
      mission.flags.inspected++;
      hud.say('<em>Condition good. Loaded. Sits flat under a jacket. Nothing about it is yours.</em>', 4200);
      if (mission.flags.inspected >= 2 && mission.state === 'package') {
        dialogue.start(scripts.lou, 'inspecting', cast.byName.lou);
      }
      return;
    }
    takePackage();
  },
});

reg(club.office.envelope, {
  label: 'Read the <b>envelope</b>',
  enabled: () => !isSecondVisit,
  onUse: () => {
    hud.say('An address on Ferry Street. A sketch of a dining room with an X on the corner booth. '
      + 'A time. A photograph of somebody eating. On the back, in Lou’s hand: <em>bathroom is by the kitchen.</em>', 7000);
    mission.note('You know where you are going next. Not what happens when you get there.');
  },
});

reg(club.office.cabinet, {
  label: 'The <b>liquor cabinet</b>',
  onUse: () => {
    audio.play('glass.set', { volume: 0.4 });
    if (mission.state === 'office' || mission.state === 'package') {
      dialogue.start(scripts.lou, 'liquor', cast.byName.lou);
    } else {
      hud.say('Four bottles, none of them opened tonight.', 3000);
    }
  },
});

reg(club.office.safePicture, {
  label: 'The <b>photographs</b>',
  hold: 1.1,
  onTap: () => {
    hud.say('The Bing, 1979. Half the men in it are not around any more, and the other half are.', 4200);
    if (mission.state === 'office' || mission.state === 'package') {
      dialogue.start(scripts.lou, 'photos', cast.byName.lou);
    }
  },
  onUse: () => {
    // Swing the picture: there is a safe behind it, and Lou is watching you
    club.office.safePicture.rotation.z = 0.5;
    club.office.safe.visible = true;
    hud.say('There is a safe behind it. Lou does not look up, which is somehow worse.', 4600);
    mission.flags.foundSafe = true;
  },
});

reg(club.office.monitor, {
  label: 'The <b>security monitor</b>',
  onUse: () => {
    mission.flags.sawCar = true;
    hud.say('Four views of a club and one of the lot. On the lot camera: a grey sedan by the office wall, '
      + 'engine off, two shapes in the front.', 5200);
    if (mission.state === 'office' || mission.state === 'package') {
      dialogue.start(scripts.lou, 'monitor', cast.byName.lou);
    }
  },
});

reg(club.office.ledger, {
  label: 'The <b>ledger</b>',
  onUse: () => hud.say('Columns of numbers in a hand that presses too hard. One of them is circled twice.', 4200),
});

/* ---- the bar, the machine, the table ---- */

reg(slotParts.group, {
  label: () => (game.atMachine ? 'Step away' : 'Play the <b>slot machine</b>'),
  onUse: () => (game.atMachine ? leaveMachine() : useMachine()),
});
reg(slotParts.panel, {
  label: 'The side <b>panel</b>',
  hold: 1.0,
  onUse: () => {
    if (slots.inspectPanel()) {
      mission.flags.secretPanel = true;
      hud.say('The panel is not screwed down. Behind it: a second counter, wired in after the fact, '
        + 'counting something that is not going in the ledger.', 6000);
      mission.note('Somebody is skimming the machine. That is a conversation for another night.');
    } else {
      hud.say('Still open. Still counting.', 2600);
    }
  },
});

{
  // The empty chair they keep for the prospect
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  pad.position.set(seat.x, 0.55, seat.z);
  scene.add(pad);
  reg(pad, {
    label: () => (game.seatedIn === 'table' ? 'Stand up' : 'Sit at the <b>table</b>'),
    onUse: () => (game.seatedIn === 'table' ? standFromTable() : sitAtTable()),
  });
}

/* ---- somewhere to sit, and somebody to tip ---- */

const SAFE_STAND_RADIUS = 0.34;
const SAFE_STAND_RADII = [0.55, 0.8, 1.05, 1.3, 1.6, 2.0, 2.5];
const SAFE_STAND_ANGLES = [
  0, Math.PI / 2, -Math.PI / 2, Math.PI,
  Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75,
];

/** True when Tony's standing capsule clears every live club collider. */
function standingClearAt(x, z, expectedRoom = null) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (expectedRoom && roomAt(x, z) !== expectedRoom) return false;
  const ground = club.groundAt(x, z);
  const foot = ground;
  const head = ground + 1.66;
  for (const b of club.colliders) {
    if (head < b.min.y || foot > b.max.y) continue;
    const cx = Math.max(b.min.x, Math.min(b.max.x, x));
    const cz = Math.max(b.min.z, Math.min(b.max.z, z));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < SAFE_STAND_RADIUS * SAFE_STAND_RADIUS) return false;
  }
  return true;
}

/**
 * Find a nearby validated egress point. Authored candidates are tried first;
 * the radial search handles all booth/table variants and future furniture.
 */
function findSafeStandSpot(origin, preferredYaw = player.yaw, candidates = []) {
  const originRoom = roomAt(origin.x, origin.z);
  const check = (p, keepRoom = true) => {
    if (!p) return null;
    const expected = keepRoom ? originRoom : null;
    if (!standingClearAt(p.x, p.z, expected)) return null;
    return new THREE.Vector3(p.x, club.groundAt(p.x, p.z), p.z);
  };
  for (const p of candidates) {
    const safe = check(p);
    if (safe) return safe;
  }
  for (const radius of SAFE_STAND_RADII) {
    for (const offset of SAFE_STAND_ANGLES) {
      const yaw = preferredYaw + offset;
      const safe = check({
        x: origin.x - Math.sin(yaw) * radius,
        z: origin.z - Math.cos(yaw) * radius,
      });
      if (safe) return safe;
    }
  }
  // Door thresholds can straddle two room labels; make one final local pass
  // without the label restriction while still requiring full clearance.
  for (const radius of SAFE_STAND_RADII) {
    for (const offset of SAFE_STAND_ANGLES) {
      const yaw = preferredYaw + offset;
      const safe = check({
        x: origin.x - Math.sin(yaw) * radius,
        z: origin.z - Math.cos(yaw) * radius,
      }, false);
      if (safe) return safe;
    }
  }
  return null;
}

function standPlayerSafely(candidates = []) {
  const target = findSafeStandSpot(player.position, player.yaw, candidates);
  if (!target) {
    hud.toast('No clear place to stand. Press [Q] again after looking toward open floor.', '');
    return null;
  }
  player.standFrom({ x: target.x, z: target.z });
  return target;
}

/** [Q] while walking is a quiet emergency unstuck, only when actually needed. */
function recoverIfStuck() {
  if (standingClearAt(player.position.x, player.position.z)) return false;
  const target = findSafeStandSpot(player.position, player.yaw);
  if (!target) return false;
  player._tween = null;
  player.mode = 'walk';
  player.yawCenter = null;
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.ground = target.y;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.position.set(target.x, target.y + 1.66, target.z);
  player.velocity.set(0, 0, 0);
  player.update(0.016);
  hud.toast('Moved clear.', 'good');
  return true;
}

/**
 * Booths and two-tops. Sitting is the whole difference between a room you walk
 * through and a room you are in, and it costs one pad and one pose.
 */
function sitOn(spot, yaw) {
  if (game.seatedIn) return;
  game.seatedIn = 'seat';
  audio.play('chair.sit', { volume: 0.5 });
  hud.setMode('seated');
  hud.setPosture('stand up');
  player.sitAt({
    position: new THREE.Vector3(spot.x, 1.22, spot.z),
    yaw,
    pitch: -0.12,
    yawRange: 1.5,
    pitchMin: -0.9,
    pitchMax: 0.5,
  }, () => {
    if (!game.satOnce) {
      game.satOnce = true;
      hud.say('Nobody looks over. In here that is the same as being welcome.', 4200);
    }
  });
}

function standFromSeat() {
  if (game.seatedIn !== 'seat') return;
  const target = standPlayerSafely();
  if (!target) return;
  game.seatedIn = null;
  hud.setMode('walk');
  hud.setPosture(null);
}

for (const spot of club.anchors.booths) {
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
  pad.position.set(spot.x, 0.6, spot.z);
  scene.add(pad);
  // Booths face the room: the east wall run looks west, the front run north
  const yaw = spot.x > 0 ? Math.PI / 2 : 0;
  reg(pad, {
    label: () => (game.seatedIn === 'seat' ? 'Get up' : 'Sit in the <b>booth</b>'),
    onUse: () => (game.seatedIn === 'seat' ? standFromSeat() : sitOn(spot, yaw)),
  });
}

{
  // Tipping: the one interaction on the stage that security has no view on
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
  pad.position.set(club.anchors.runway.x, 1.3, club.anchors.runway.z);
  scene.add(pad);
  reg(pad, {
    label: () => (game.money >= 20 ? 'Tip the <b>performer</b> ($20)' : 'Tip the <b>performer</b> — no cash'),
    enabled: () => game.money >= 20,
    onUse: () => {
      addMoney(-20);
      game.tips = (game.tips || 0) + 1;
      audio.play('chips.place', { volume: 0.4 });
      hud.say(game.tips === 1
        ? 'Twenty on the edge of the runway. It goes without either of you acknowledging it.'
        : 'Another twenty. You are going to run out before she does.', 4200);
    },
  });
}

/* ---- the bathroom, the store room, the lot ---- */

{
  const mirrorPad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  mirrorPad.position.set(ROOMS.bathroom.x1 - 0.12, 1.6, -0.2);
  scene.add(mirrorPad);
  reg(mirrorPad, {
    label: 'The <b>mirror</b>',
    onUse: () => hud.say(mission.flags.gotPackage
      ? 'A prospect in a borrowed jacket with something under it. The jacket sits fine. You sit worse.'
      : 'A prospect in a borrowed jacket. The crack across the glass takes your face apart and puts it back wrong.', 5200),
  });

  const graffitiPad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
  graffitiPad.position.set(ROOMS.bathroom.x0 + 0.14, 1.5, 2.55);
  scene.add(graffitiPad);
  reg(graffitiPad, {
    label: 'Read the <b>wall</b>',
    onUse: () => hud.say('BOOSKI WAS HERE. APE IS A CHEAT. SHUBES CRIED. Underneath, in different pen: '
      + '<em>he did not cry.</em>', 5200),
  });

  for (const stall of club.anchors.stalls) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.7, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
    pad.position.set(stall.x, 1.05, stall.z);
    scene.add(pad);
    reg(pad, {
      label: () => (stall.locked ? 'The <b>locked stall</b>' : 'Open the <b>stall</b>'),
      onUse: () => {
        if (stall.locked) {
          audio.play('door.locked', { volume: 0.4 });
          hud.say('Occupied. Whoever is in there stops talking the moment you try the door, '
            + 'which is how you know it was worth listening to.', 5200);
          mission.flags.heardBusiness = true;
          return;
        }
        stall.pivot.rotation.y = stall.pivot.rotation.y ? 0 : -1.6;
        audio.play('door.creak', { volume: 0.35 });
        if (stall.index === 1 && !mission.flags.foundCard) {
          mission.flags.foundCard = true;
          hud.toast('Found: a lost membership card', 'good');
          hud.say('A club membership card on the cistern, in a name that is not the name on the front of it.', 4800);
        }
      },
    });
  }

  const ventPad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  ventPad.position.set(ROOMS.bathroom.x0 + 1.3, 2.35, ROOMS.bathroom.z0 + 0.45);
  scene.add(ventPad);
  reg(ventPad, {
    label: 'The <b>vent</b>',
    onUse: () => hud.say('The duct runs west, over the hallway, into the office wall. You can hear a chair '
      + 'creak through it. Worth remembering.', 5200),
  });
}

{
  const alarmPad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
  alarmPad.position.set(9.05, 2.35, ROOMS.storage.z0 + 0.3);
  scene.add(alarmPad);
  reg(alarmPad, {
    label: () => (mission.flags.alarmDisabled ? 'The <b>alarm</b> — isolated' : 'The <b>alarm box</b>'),
    hold: 1.4,
    onTap: () => hud.say('A contact alarm on the service door, green light, thirty years old and still awake.', 4200),
    onUse: () => {
      if (mission.flags.alarmDisabled) return;
      mission.flags.alarmDisabled = true;
      club.anchors.alarmLed.material.emissive.setHex(0x2a2a30);
      audio.play('rope.clip', { volume: 0.5 });
      hud.toast('Alarm isolated', 'good');
      hud.say('You flip the isolator like a man who has watched somebody else do it. The green light goes out.', 4800);
    },
  });

  const manifestPad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  manifestPad.position.set(8.2, 1.5, ROOMS.storage.z0 + 0.25);
  scene.add(manifestPad);
  reg(manifestPad, {
    label: 'The <b>manifest</b>',
    onUse: () => hud.say('Kegs, six. Liquor, four. Duck, quantity left blank, initialled by somebody with '
      + 'one letter in their name.', 5000),
  });

  /* The answer to the manifest's blank line, for whoever pokes around the
   * store room instead of going to see Lou like they were told. */
  const duckPad = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  duckPad.position.set(club.storeroom.crate.position.x, 0.38, club.storeroom.crate.position.z);
  scene.add(duckPad);
  reg(duckPad, {
    label: () => (club.storeroom.duck.visible ? 'The <b>duck</b>' : 'The crate marked <b>DUCK</b>'),
    onUse: () => {
      const store = club.storeroom;
      audio.play('duck.quack', { volume: 0.6, position: duckPad.position });
      if (!store.duck.visible) {
        store.duck.visible = true;
        store.lid.rotation.z = 0.85;
        store.lid.position.set(0.36, 0.4, -0.05);
        hud.toast('Found: the duck', 'good');
        hud.say('One rubber duck, packed in straw. Manifest quantity finally resolved. '
          + 'Somebody out front paid four hundred dollars for this.', 5600);
        mission.note('The duck on the manifest is a rubber one. Nobody must ever know you know.');
      } else {
        hud.say('It squeaks with the confidence of contraband.', 3200);
      }
    },
  });
}

/* ---- outside ---- */

{
  const sedanPad = new THREE.Mesh(
    new THREE.BoxGeometry(lot.watchers.length + 0.4, 1.8, lot.watchers.width + 0.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  sedanPad.position.copy(club.anchors.suspiciousCar).setY(1);
  sedanPad.rotation.y = lot.watchers.group.rotation.y;
  scene.add(sedanPad);
  reg(sedanPad, {
    label: () => (mission.flags.plateRead ? 'The <b>grey sedan</b>' : 'The <b>grey sedan</b>'),
    hold: 1.2,
    onTap: () => {
      mission.flags.sawCar = true;
      hud.say('Two of them in the front. Neither is talking. The one on the passenger side has been '
        + 'watching the office wall, not the door.', 5400);
    },
    onUse: () => {
      mission.flags.sawCar = true;
      if (!mission.flags.plateRead) {
        mission.flags.plateRead = true;
        hud.toast('Plate memorised', 'good');
        hud.say('You walk past the bumper without breaking step and take the plate with you. '
          + 'The engine turns over behind you.', 5400);
        audio.play('car.start', { volume: 0.4, position: club.anchors.suspiciousCar });
      }
    },
  });

  const dumpsterPad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  dumpsterPad.position.set(24, 0.8, -7.2);
  scene.add(dumpsterPad);
  reg(dumpsterPad, {
    label: 'The <b>dumpster</b>',
    onUse: () => {
      audio.play('neighbours.thump', { volume: 0.4, position: dumpsterPad.position });
      hud.say('Bar waste, a broken stool, and a bin bag somebody threw from the side door twenty minutes ago.', 4600);
    },
  });
}

/* ---- your car ---- */

{
  const doorPad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
  doorPad.position.copy(car.exitPosition()).setY(1);
  scene.add(doorPad);
  reg(doorPad, {
    label: () => (mission.readyToLeave ? 'Get in and <b>go</b>' : 'Get back in the <b>car</b>'),
    enabled: () => game.seatedIn !== 'car',
    onUse: () => getInCar(),
  });

  reg(car.radioFace, {
    label: () => (game.radioOn === false ? 'Radio <b>on</b>' : 'Radio <b>off</b>'),
    enabled: () => game.seatedIn === 'car',
    onUse: () => {
      game.radioOn = game.radioOn === false;
      audio.setLoopVolume('car.radio', game.radioOn ? 0.3 : 0, 0.4);
      hud.toast(game.radioOn ? 'The Squatch, 97.8' : 'Off. Better.', '');
    },
  });

  reg(car.gloveLid, {
    label: 'The <b>glove box</b>',
    enabled: () => game.seatedIn === 'car',
    onUse: () => {
      audio.play('door.knob', { volume: 0.4 });
      hud.say('Registration in somebody else’s name, a torch with no batteries, and eleven napkins '
        + 'from a place that closed.', 5200);
    },
  });

  reg(car.wheel, {
    label: () => (mission.readyToLeave ? 'Hold to <b>drive away</b>' : 'The <b>wheel</b>'),
    enabled: () => game.seatedIn === 'car',
    hold: mission.readyToLeave ? 1.4 : undefined,
    onTap: () => hud.say('Not until you have got what you came for.', 3000),
    onUse: () => {
      if (!mission.readyToLeave) {
        hud.say(isSecondVisit
          ? 'Not until Lou gives you the motel assignment.'
          : 'Not until you have got what you came for.', 3000);
        return;
      }
      driveAway();
    },
  });
}

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

function startLouScene() {
  game.louTalking = true;
  cast.byName.lou.faceToward(player.position.x, player.position.z);
  dialogue.start(scripts.lou, 'enter', cast.byName.lou);
}

/**
 * Take the package.
 *
 * It does not go in a slot. The spec for this beat is "the weapon disappears
 * into the concealed inventory slot", and modelling it as concealed carry
 * rather than as the fifth beer solves a real problem at the same time: the
 * hotbar has four slots, drinks go in them, and there is no drop key in here,
 * so a player who ordered four rounds and took the package would have watched
 * `add()` fail while the mission carried on insisting it was under his jacket.
 */
function takePackage() {
  mission.tookPackage();
  club.office.parcel.visible = false;
  game.carrying = 'parcel';
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    const saved = state.missions[MISSION_IDS.BADA_BING_ONE];
    saved.status = 'in_progress';
    saved.packageReceived = true;
  });
  paintCarrying();
  hud.toast('ITEM ACQUIRED: Lou’s package', 'good');
  audio.play('gun.pickup', { volume: 0.6 });
  hud.say('It goes inside the jacket. It is heavier than the shape of it suggests.', 4200);
  dialogue.start(scripts.lou, 'taken', cast.byName.lou);
}

function sitAtTable() {
  if (game.seatedIn) return;
  game.seatedIn = 'table';
  audio.play('chair.sit', { volume: 0.5 });
  hud.setMode('seated');
  hud.setPosture('stand up');
  player.sitAt({
    position: new THREE.Vector3(seat.x, 1.24, seat.z),
    yaw: seat.yaw,
    pitch: -0.42,
    yawRange: 1.0,
    pitchMin: -0.95,
    pitchMax: 0.25,
  }, () => {
    blackjack.sitDown();
    hud.say('The dealer looks at you exactly once and then never again.', 3600);
  });
}

function standFromTable() {
  if (game.seatedIn !== 'table') return;
  const target = standPlayerSafely([
    { x: seat.x, z: seat.z + 0.55 },
    { x: seat.x + 0.7, z: seat.z + 0.45 },
    { x: seat.x - 0.7, z: seat.z + 0.45 },
  ]);
  if (!target) return;
  game.seatedIn = null;
  blackjack.standUp();
  hud.setMode('walk');
  hud.setPosture(null);
  paintGamble(null);
}

function useMachine() {
  game.atMachine = true;
  hud.setPosture('step away');
  // Stand square in front of the cabinet with eyes on the reels, instead of
  // playing from wherever the E press happened to land.
  const stand = club.anchors.slotStand;
  const machine = club.anchors.slotMachine;
  player.position.x = stand.x;
  player.position.z = stand.z;
  player.yaw = Math.atan2(-(machine.x - stand.x), -(machine.z - stand.z));
  player.pitch = -0.12;
  paintGamble(null);
  paintMachine();
  club.anchors.slotLight.intensity = 14;
}

function leaveMachine() {
  game.atMachine = false;
  hud.setPosture(null);
  ui.gamble.classList.add('hidden');
  club.anchors.slotLight.intensity = 9;
}

function getInCar() {
  game.seatedIn = 'car';
  audio.play('car.door', { volume: 0.6 });
  hud.setMode('seated');
  hud.setPosture('get out');
  player.sitAt({
    position: car.driverPosition(),
    yaw: car.driverYaw(),
    pitch: -0.05,
    yawRange: 1.5,
    pitchMin: -0.8,
    pitchMax: 0.5,
  });
  if (mission.state === 'lot-return' || mission.readyToLeave) {
    hud.say(isSecondVisit
      ? 'Room twelve, product first. <em>Hold [E] on the wheel to drive to the motel.</em>'
      : 'Package under the jacket, rain on the windscreen. <em>Hold [E] on the wheel.</em>', 5200);
  }
}

function getOutOfCar() {
  if (game.seatedIn !== 'car') return;
  const target = standPlayerSafely([car.exitPosition()]);
  if (!target) return;
  game.seatedIn = null;
  audio.play('car.door', { volume: 0.6 });
  audio.stopLoop('car.radio', 0.6);
  audio.stopLoop('engine.idle', 0.8);
  hud.setMode('walk');
  hud.setPosture(null);
  if (mission.state === 'lot') mission.setState('outside');
}

function sendAssociate() {
  if (mission.readyToLeave) return;
  const npc = associate;
  npc.group.visible = true;
  npc.group.position.set(club.anchors.hallMouth.x, 0, club.anchors.hallMouth.z);
  // Walk him to wherever the prospect actually is
  npc.route = [
    { x: player.position.x, z: player.position.z },
    { x: club.anchors.hallMouth.x, z: club.anchors.hallMouth.z },
  ];
  npc.routeAt = 0;
  game.associateWalking = true;
  hud.toast('Somebody is coming out of the back hallway.', '');
}

function driveAway() {
  if (game.over) return;
  game.over = true;
  interaction.setPaused(true);
  player.mode = 'frozen';
  audio.play('car.start', { volume: 0.7 });
  audio.startLoop('engine.idle', { volume: 0.25 });
  hud.hidePrompt();
  hud.setPosture(null);
  // The car pulls out. No cutscene camera -- you are still sitting in it.
  const from = car.group.position.clone();
  const fromYaw = car.group.rotation.y;
  const to = new THREE.Vector3(club.anchors.lotExit.x, 0, club.anchors.lotExit.z + 8);
  let k = 0;
  game.drive = (dt) => {
    k = Math.min(1, k + dt * 0.16);
    const e = k * k;
    car.group.position.lerpVectors(from, to, e);
    car.group.rotation.y = fromYaw + e * 0.9;
    player.position.copy(car.driverPosition());
    player.yaw = car.driverYaw();
    if (k >= 1) {
      game.drive = null;
      showEnding(mission.ending());
    }
  };
  mission.finish(mission.ending());
}

function finish() { /* the ending card is driven by driveAway() */ }

function showEnding(kind) {
  const e = isSecondVisit
    ? {
      title: 'ROOM TWELVE IS WAITING',
      body: 'Lou gave you the job in the same office, but this visit ends differently. '
        + 'Manny is already outside the Jerky Motel with the payment, and the apartment is not on the route.',
    }
    : (ENDINGS[kind] || ENDINGS.followed);
  if (isSecondVisit) {
    if (!secondVisitStory.complete({ assignment: mission.assignment })) {
      throw new Error('Bada Bing Scene Two ended without a durable assignment');
    }
  } else {
    campaign.update((state) => {
      const saved = state.missions[MISSION_IDS.BADA_BING_ONE];
      saved.status = 'complete';
      saved.packageReceived = campaign.hasItem(ITEM_IDS.LOU_PACKAGE);
      saved.ending = kind;
      if (saved.packageReceived) {
        const nextMission = state.missions[MISSION_IDS.SQUATCHFATHER];
        if (nextMission.status === 'locked') nextMission.status = 'available';
      }
    });
  }
  game.paused = true;
  player.enabled = false;
  blackout.classList.remove('on');
  overlay.classList.remove('hidden');
  overlay.classList.add('ending');
  overlay.querySelector('h1').innerHTML = 'THE<span>BING</span>';
  overlay.querySelector('.tag').textContent = e.title;
  const extras = [];
  if (mission.flags.jackpot) extras.push(isSecondVisit
    ? 'You hit the jackpot while Lou waited for you a second time.'
    : 'You left with the jackpot and the package, which is more than most prospects manage.');
  if (mission.hands >= 6) extras.push(`You sat ${mission.hands} hands at that table while a made squatch waited for you.`);
  if (mission.drinks > 0) extras.push(`Drinks taken on the way in: ${mission.drinks}.`);
  if (mission.flags.secretPanel) extras.push('And somebody is skimming that machine. You know it, and now Lou is going to know it.');
  if (inventory.count() > 0) extras.push(`You also drove off with ${inventory.count()} of Lou's drinks in your hands.`);
  if (mission.flags.alarmTripped) extras.push('The service door alarm chirped on your way out. Somebody will mention it.');
  /* Offered rather than forced, and no link out of here: the campaign owns
   * where he goes next, and where he goes next is home with the package. */
  if (mission.flags.gaveNumber) {
    extras.push('You gave somebody at the end of the bar your number, which is not a thing you do.');
  }
  extras.push(isSecondVisit
    ? '<br><b>NEXT: DRIVE DIRECTLY TO THE JERKY MOTEL</b>'
    : '<br><b>NEXT: RETURN HOME WITH LOU’S PACKAGE</b>');
  assetStatus.innerHTML = `${e.body}<br><br>${extras.join(' ')}`;
  startBtn.style.display = 'none';
  let next = document.getElementById('next-level');
  if (!next) {
    next = document.createElement('a');
    next.id = 'next-level';
    overlay.querySelector('.panel').appendChild(next);
  }
  next.href = isSecondVisit ? 'motel.html' : 'index.html';
  next.textContent = isSecondVisit
    ? 'Drive to the Jerky Motel →'
    : 'Return to the apartment →';
  next.onclick = (event) => {
    event.preventDefault();
    if (isSecondVisit) campaign.advanceTime(TIME_EVENT_IDS.DEPART_JERKY_MOTEL);
    navigateCampaign(campaign, isSecondVisit ? SCENE_IDS.JERKY_MOTEL : SCENE_IDS.APARTMENT, {
      spawn: isSecondVisit ? 'passenger_seat' : 'front_door',
      location,
    });
  };
  document.exitPointerLock?.();
}

/* ------------------------------------------------------------------ */
/* HUD panels                                                          */
/* ------------------------------------------------------------------ */

function paintGamble(view) {
  if (game.atMachine) return;
  if (!view) {
    ui.gamble.classList.add('hidden');
    return;
  }
  ui.gamble.classList.remove('hidden');
  ui.gambleTitle.textContent = 'BLACKJACK · $25 MIN';
  const rows = [];
  if (view.state === 'bet') {
    rows.push(`Bet: <b>$${view.bet}</b>`);
    rows.push(`<span class="felt">${BETS.map((b) => (b === view.bet ? `[${b}]` : b)).join(' · ')}</span>`);
  } else {
    rows.push(`Dealer: <b>${view.dealer.join(' ')}</b>`);
    rows.push(`You: <b>${view.player.join(' ')}</b> — ${view.playerTotal > 21 ? '<span class="bust">bust</span>' : view.playerTotal}`);
    rows.push(`Bet: <b>$${view.bet}</b>`);
  }
  if (view.message) rows.push(`<span class="felt">${view.message}</span>`);
  ui.gambleBody.innerHTML = rows.join('<br>');
  ui.gambleKeys.innerHTML = view.state === 'bet'
    ? '<kbd>1</kbd>–<kbd>4</kbd> stake · <kbd>E</kbd> deal · <kbd>Q</kbd> get up'
    : view.state === 'player'
      ? '<kbd>E</kbd> hit · <kbd>F</kbd> stand · <kbd>R</kbd> double · <kbd>Q</kbd> get up'
      : '<kbd>Q</kbd> get up';
}

function paintMachine() {
  if (!game.atMachine) return;
  ui.gamble.classList.remove('hidden');
  ui.gambleTitle.textContent = 'BADA BING · SLOTS';
  const v = slots.view;
  const rows = [`Stake: <b>$${v.wager}</b>`];
  if (v.reels) rows.push(`<span class="felt">${v.reels.join(' · ')}</span>`);
  rows.push(`Spins: <b>${v.spins}</b> · Net: <b>${v.net >= 0 ? '+' : ''}$${v.net}</b>`);
  rows.push('3× squatch pays ×250 · then cherry, bell, bar, cash');
  ui.gambleBody.innerHTML = rows.join('<br>');
  ui.gambleKeys.innerHTML = '<kbd>1</kbd>/<kbd>2</kbd> stake · <kbd>E</kbd> spin · <kbd>Q</kbd> step away';
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
  if (e.button === 0) interaction.press();
});
window.addEventListener('mouseup', (e) => {
  dragging = false;
  if (e.button === 0) interaction.release();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  player.setKey(e.code, true);

  if (e.code === 'KeyE') {
    // At the table and the machine, E is the game's own button
    if (game.seatedIn === 'table' && blackjack.state !== 'off' && !interaction.current) {
      if (blackjack.state === 'bet') {
        blackjack.deal();
        /* Still on 'bet' means it refused the hand, which at this table only
         * ever means he cannot cover it -- so the dealer says the one thing a
         * croupier says to a man sitting at the felt without the minimum. */
        if (blackjack.state === 'bet') tableSay('bj.dealer.minimum', { gap: 12 });
        else tableSay('bj.dealer.deal', { chance: 0.35, gap: 9 });
      } else if (blackjack.state === 'player') {
        blackjack.hit();
        /* Only while the hand is still live. A hit that took him to twenty-one
         * or past it hands straight off to the dealer, and "Card." landing there
         * would sit on the floor and swallow the bust line a second later --
         * which is the one worth hearing. */
        if (blackjack.state === 'player') tableSay('bj.dealer.hit', { chance: 0.3, gap: 6 });
      }
      return;
    }
    if (game.atMachine && !interaction.current) {
      slots.spin();
      paintMachine();
      return;
    }
    interaction.press();
  }
  if (e.code === 'KeyQ') {
    if (game.seatedIn === 'table') standFromTable();
    else if (game.seatedIn === 'seat') standFromSeat();
    else if (game.seatedIn === 'car') getOutOfCar();
    else if (game.atMachine) leaveMachine();
    else recoverIfStuck();
  }
  if (game.seatedIn === 'table' && blackjack.state === 'player') {
    if (e.code === 'KeyF') {
      blackjack.stand();
      tableSay('bj.dealer.stand', { chance: 0.35, gap: 6 });
    }
    /* Nothing from the dealer on a double -- the prospect has his own line for
     * how that one turns out, and the croupier calling it first would step on it. */
    if (e.code === 'KeyR') blackjack.double();
  }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
    const n = Number(e.code.slice(-1)) - 1;
    if (dialogue.active && dialogue.options.length) {
      dialogue.choose(n);
    } else if (game.seatedIn === 'table' && blackjack.state === 'bet') {
      blackjack.setBet(BETS[n]);
    } else if (game.atMachine) {
      if (n === 0) slots.changeWager(-1);
      if (n === 1) slots.changeWager(1);
      paintMachine();
    }
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

startBtn.addEventListener('click', async () => {
  if (game.over) return;
  if (isSecondVisit && !game.storyStarted) {
    const started = secondVisitStory.begin();
    if (!started.ok) {
      overlay.querySelector('.tag').textContent = started.reason === 'already_complete'
        ? 'This visit is already complete in the current save.'
        : 'Lou has not called Prospect back to the Bing yet.';
      startBtn.textContent = 'MISSION UNAVAILABLE';
      startBtn.disabled = true;
      return;
    }
    game.storyStarted = true;
  }
  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();

  if (!game.started) {
    game.started = true;
    audio.startLoop('ambience.rain', { volume: 0.5, ambience: true, fade: 1.5 });
    audio.startLoop('ambience.club', { volume: 0.04, ambience: true, fade: 2 });
    audio.startLoop('ambience.crowd', { volume: 0.02, ambience: true, fade: 2 });
    // The record actually playing on the floor tonight, from the DJ booth.
    audio.startMusicLoop('music.club', 'assets/music/sallie-j.mp3', {
      volume: 0.04, ambience: true, position: club.anchors.dj, ref: 3.5, maxDist: 34, fade: 2,
    });
    // Lou's radio plays his old stuff all night; the panner does the
    // round-the-corner falloff on its own.
    audio.startMusicLoop('office.radio', 'assets/music/good-ole-days.mp3', {
      volume: 0.22, ambience: true, position: club.anchors.officeRadio, ref: 0.8, maxDist: 9,
    });
    audio.startLoop('engine.idle', { volume: 0.22, ambience: false });
    audio.startLoop('car.radio', { name: 'radio.talk', volume: 0.3 });
    game.radioOn = true;
    getInCar();
    addMoney(0);
    paintObjectives(mission.objectives);
    hud.say(isSecondVisit
      ? '<em>Day Two.</em> Lou is waiting in the same back office with a different job.'
      : '<em>11:41 PM.</em> Lou is waiting in the back office with a package.', 6000);
    setTimeout(() => hud.say('<em>[Q]</em> to get out of the car.', 4200), 6400);
  }
  game.paused = false;
});

/* ------------------------------------------------------------------ */
/* Zones: what you can hear from where you are standing                */
/* ------------------------------------------------------------------ */

let room = 'lot';
let acousticKey = '';
function updateZones(dt) {
  const p = player.position;
  const next = roomAt(p.x, p.z);
  const inside = next !== 'lot' && next !== 'outside' && next !== 'alley' && next !== 'yard';
  const officeDoorOpen = club.doors.lou.open;
  const innerOpen = club.doors.inner.open;
  const frontOpen = club.doors.front.open;

  // Only schedule WebAudio ramps when the acoustic state actually changes.
  // The previous per-frame calls built an ever-growing automation timeline.
  const nextAcousticKey = `${next}:${frontOpen ? 1 : 0}:${innerOpen ? 1 : 0}:${officeDoorOpen ? 1 : 0}`;
  if (nextAcousticKey !== acousticKey) {
    acousticKey = nextAcousticKey;

    // Rain falls off sharply across two real doors. Outside is present but no
    // longer overpowering; once inside the main room it is effectively gone.
    const rainVolume = !inside ? 0.38
      : next === 'vestibule'
        ? frontOpen ? (innerOpen ? 0.055 : 0.035) : 0.012
        : next === 'main'
          ? innerOpen ? 0.006 : 0.002
          : 0.001;
    audio.setLoopVolume('ambience.rain', rainVolume, 0.8);

    // The club: the whole point of the wall between the hallway and the floor
    const music = next === 'main' ? 0.5
      : next === 'vestibule' ? (innerOpen ? 0.4 : 0.2)
        : next === 'hallway' ? 0.17
          : next === 'office' ? (officeDoorOpen ? 0.16 : 0.07)
            : next === 'bathroom' || next === 'storage' ? 0.1
              : 0.05;
    const crowd = next === 'main' ? 0.32 : next === 'vestibule' ? 0.14 : 0.04;
    audio.setLoopVolume('ambience.club', music, 0.7);
    audio.setLoopVolume('ambience.crowd', crowd, 0.7);
    audio.setLoopVolume('music.club', music * 0.9, 0.7);
    // The wall does the muffling per-loop now — footsteps and dialogue in the
    // back of house stay crisp while the record dulls round the corner.
    const cutoff = next === 'main' || next === 'vestibule' ? 20000
      : next === 'hallway' ? 1400
        : next === 'office' ? (officeDoorOpen ? 1600 : 700)
          : next === 'bathroom' || next === 'storage' ? 600
            : 900;
    audio.setLoopCutoff('ambience.club', cutoff, 0.6);
    audio.setLoopCutoff('music.club', cutoff, 0.6);
    game.acoustics = { room: next, rain: rainVolume, music, crowd, cutoff };
    club.rain.setVisible(!inside);
  }

  if (next !== room) {
    room = next;
    onRoomChange(next);
  }
  void dt;
}

function onRoomChange(next) {
  const notes = NOTES[next];
  if (notes && !game.noted.has(next)) {
    game.noted.add(next);
    hud.say(notes[(Math.random() * notes.length) | 0], 4600);
  }
  if (next === 'main' && !mission.inside) {
    mission.enteredClub();
    hud.say('Warm, loud, and darker than it needs to be. The hallway to the back is on the right.', 5200);
  }
  if (next === 'hallway' && mission.state === 'club') mission.reachedHallway();
  if (next === 'office' && (mission.state === 'hallway' || mission.state === 'club')) {
    mission.enteredOffice();
    startLouScene();
  }
  if (next !== 'office' && mission.state === 'briefed' && !game.partingSaid) {
    game.partingSaid = true;
    mission.leftOffice();
    dialogue.start(scripts.lou, 'parting', cast.byName.lou);
  }
  /* Only counts on the way out: wandering down the alley on the way in is
   * sightseeing, not tradecraft. */
  if (mission.readyToLeave && (next === 'yard' || next === 'alley')) {
    mission.flags.leftByRear = true;
  }
  if ((next === 'lot' || next === 'alley') && mission.state === 'leaving') {
    mission.backInLot();
    /* You told him, so somebody is out here. He does nothing except be
     * visible, which is the entire point of him. */
    if (mission.flags.toldLou && !game.manOutside) {
      game.manOutside = true;
      associate.group.visible = true;
      associate.job = 'stand';
      associate.folded = true;
      associate.route = null;
      associate.group.position.set(3.9, 0, 17.8);
      associate.faceToward(club.anchors.suspiciousCar.x, club.anchors.suspiciousCar.z, true);
      hud.say('One of Lou’s men is under the canopy with a cigarette, looking at the grey sedan '
        + 'the way you look at a dog you have not decided about.', 5600);
    }
    hud.say('Rain, neon, and your car exactly where you left it.', 4200);
  }
}

/* The stage: walk onto it and somebody comes over. */
function checkStage() {
  const p = player.position;
  const on = player.ground > STAGE_H * 0.5;
  if (on && !game.stagedOn) {
    game.stagedOn = true;
    const guard = cast.byName.security;
    guard.route = null;
    guard.job = 'stand';
    guard.group.position.set(p.x + 1.6, 0, p.z + 1.8);
    guard.faceToward(p.x, p.z, true);
    dialogue.start(scripts.security, 'open', guard);
    audio.setLoopVolume('ambience.club', 0.08, 0.2);
    setTimeout(() => audio.setLoopVolume('ambience.club', 0.5, 1.2), 1400);
  } else if (!on && game.stagedOn) {
    game.stagedOn = false;
    const guard = cast.byName.security;
    guard.job = 'patrol';
    // Same there-and-back round as his authored one: no leg crosses the
    // stage front, which is nav-blocked for the crowd.
    guard.route = [
      { x: -6.3, z: -4.5 }, { x: -6.3, z: 5.7 },
      { x: -17.9, z: 5.7 }, { x: -17.9, z: -2.3 },
      { x: -17.9, z: 5.7 }, { x: -6.3, z: 5.7 },
    ];
  }
}

/* Patrons say things as you go past, and never the same thing twice running. */
function ambientChatter(dt) {
  game.ambientAt -= dt;
  if (game.ambientAt > 0 || dialogue.active) return;
  game.ambientAt = 16 + Math.random() * 14;
  if (room !== 'main' && room !== 'vestibule') return;
  let i = (Math.random() * AMBIENT.length) | 0;
  if (i === game.lastAmbient) i = (i + 1) % AMBIENT.length;
  game.lastAmbient = i;
  const [who, line] = AMBIENT[i];
  hud.say(`<em>${who}:</em> ${line}`, 4200);
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();

function paintCampaignClock() {
  const story = campaign.state.story;
  const hour24 = Math.floor(story.timeMinutes / 60) % 24;
  const hour12 = hour24 % 12 || 12;
  const time12 = `${hour12}:${String(story.timeMinutes % 60).padStart(2, '0')} `
    + `${hour24 >= 12 ? 'PM' : 'AM'}`;
  hud.setClock(story.day, time12, game.elapsed);
}

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  paintCampaignClock();
  if (!game.started || game.paused) {
    renderer.render(scene, camera);
    return;
  }
  const dt = raw * highs.timeScale;
  game.elapsed += raw;

  drunk.update(raw);
  highs.update(raw);
  player.sway.yaw = drunk.sway.yaw + highs.sway.yaw;
  player.sway.pitch = drunk.sway.pitch + highs.sway.pitch;
  player.sway.roll = drunk.sway.roll + highs.sway.roll;
  player.impair = drunk.swayStrength * 0.8;
  player.moveScale = highs.moveScale;
  player.lookDrag = highs.lookDrag;
  fxDrunk.style.setProperty('--blur', `${drunk.blur.toFixed(2)}px`);
  fxDrunk.style.setProperty('--vig', drunk.vignette.toFixed(3));
  fxDrunk.style.setProperty('--warm', drunk.warmth.toFixed(3));

  player.update(dt);
  if (game.drive) game.drive(raw);
  interaction.update(dt);
  club.update(dt, player.position);
  slots.update(dt);
  blackjack.update(dt);
  dialogue.update(dt, player.position);
  mission.update(raw);
  drinkTick(raw);
  updateZones(dt);
  checkStage();
  ambientChatter(raw);
  if (game.atMachine) paintMachine();

  for (const npc of cast.all) npc.update(dt, player.position);
  if (game.associateWalking) {
    associate.update(dt, player.position);
    const d = Math.hypot(associate.group.position.x - player.position.x, associate.group.position.z - player.position.z);
    if (d < 2.2 && !game.associateSpoke) {
      game.associateSpoke = true;
      dialogue.start(scripts.associate, 'open', associate);
    }
  }

  audio.updateListener(camera);

  postfx.render(dt);
  postfx.sample(raw);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

assetStatus.innerHTML = 'Everything in here is drawn and synthesised at load time — '
  + 'no models, no textures, no audio files.';
if (isSecondVisit) {
  document.querySelector('#objectives .head').textContent = 'BACK TO THE BING';
  overlay.querySelector('.tag').textContent =
    'Day Two. Lou is waiting in the back office with the next assignment.';
}
loading.classList.add('hidden');
window.__bing = {
  THREE, scene, camera, renderer, postfx, player, club, cast, slots, blackjack, mission, dialogue, hud, audio, game,
  interaction, drunk, highs, inventory, campaign, car, lot, associate, scripts,
  isSecondVisit, secondVisitStory,
  updateZones, standingClearAt, findSafeStandSpot, recoverIfStuck,
  teleport(x, z, yaw = 0) {
    player.mode = 'walk';
    player.position.set(x, 1.66, z);
    player.yaw = yaw;
    player.velocity.set(0, 0, 0);
    player.update(0.016);
  },
};
frame();

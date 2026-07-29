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
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
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
if (campaign.state.scene.id !== SCENE_IDS.BADA_BING_ONE) {
  campaign.enter(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
}

const game = {
  started: false,
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

const mission = new Mission({
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
const cast = populate(scene, club);
const associate = makeAssociate(scene, club.anchors.hallMouth);

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
  },
  onLose: () => hud.say('<em>The machine takes it with mechanical indifference.</em>', 2600),
  onJackpot: (amount) => {
    audio.play('slot.jackpot', { volume: 0.75 });
    hud.toast(`JACKPOT · $${amount}`, 'good');
    hud.say('Every head in the room turns. Lou can hear this from the office. Lou <em>will</em> hear about this.', 6000);
    mission.jackpot();
    for (const npc of cast.all) npc.faceToward(slotParts.group.position.x, slotParts.group.position.z);
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
  onChips: () => audio.play('chips.place', { volume: 0.4, position: club.anchors.blackjack }),
  onState: paintGamble,
  onHandDone: (hands, won) => {
    mission.handPlayed();
    if (won) audio.play('chips.place', { volume: 0.5 });
    void hands;
  },
});

const car = makePlayerCar(scene, { x: club.anchors.playerCar.x, z: club.anchors.playerCar.z, yaw: Math.PI });
const lot = populateLot(scene, club.colliders, club.anchors);

/* Put him behind the wheel before the first frame. Booting at the origin and
 * tweening out to the car meant the zone system spent a second convinced he
 * was standing in the middle of the club, and started Lou's patience clock
 * before the engine was even off. */
player.position.set(car.driverPose.x - 0.55, 1.24, car.driverPose.z);
player.yaw = Math.PI;
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

const scripts = buildScripts({
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
});

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
  label: () => (mission.flags.gotPackage ? 'Say something to the <b>bouncer</b>' : 'Talk to the <b>bouncer</b>'),
  onUse: () => {
    const npc = cast.byName.bouncer;
    npc.faceToward(player.position.x, player.position.z);
    if (mission.flags.gotPackage) dialogue.start(scripts.bouncer, 'leaving', npc);
    else if (mission.flags.bouncerCleared) dialogue.start(scripts.bouncer, 'returning', npc);
    else dialogue.start(scripts.bouncer, 'open', npc);
  },
});
reg(cast.byName.bartender.group, talkTo(cast.byName.bartender, scripts.bartender));
reg(cast.byName.hallGuard.group, talkTo(cast.byName.hallGuard, scripts.hallGuard));
reg(cast.byName.dealer.group, talkTo(cast.byName.dealer, scripts.dealer));
reg(cast.byName.dj.group, talkTo(cast.byName.dj, scripts.dj));
reg(cast.byName.lou.group, {
  label: () => (mission.state === 'briefed' ? 'Say goodnight to <b>Lou</b>' : 'Talk to <b>Lou</b>'),
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
  game.seatedIn = null;
  hud.setMode('walk');
  hud.setPosture(null);
  player.standFrom({ x: player.position.x, z: player.position.z });
}

for (const spot of club.anchors.booths) {
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
  pad.position.set(spot.x, 0.6, spot.z);
  scene.add(pad);
  // Booths face the room: the east wall run looks west, the front run north
  const yaw = spot.x > 0 ? Math.PI / 2 : Math.PI;
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
  graffitiPad.position.set(ROOMS.bathroom.x0 + 0.14, 1.5, 1.6);
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
}

/* ---- outside ---- */

{
  const sedanPad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 5.4), new THREE.MeshBasicMaterial({ visible: false }));
  sedanPad.position.copy(club.anchors.suspiciousCar).setY(1);
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
  const doorPad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 2.4), new THREE.MeshBasicMaterial({ visible: false }));
  doorPad.position.set(car.driverPose.x - 1.2, 1, car.driverPose.z);
  scene.add(doorPad);
  reg(doorPad, {
    label: () => (mission.flags.gotPackage ? 'Get in and <b>go</b>' : 'Get back in the <b>car</b>'),
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
    label: () => (mission.flags.gotPackage ? 'Hold to <b>drive away</b>' : 'The <b>wheel</b>'),
    enabled: () => game.seatedIn === 'car',
    hold: mission.flags.gotPackage ? 1.4 : undefined,
    onTap: () => hud.say('Not until you have got what you came for.', 3000),
    onUse: () => {
      if (!mission.flags.gotPackage) {
        hud.say('Not until you have got what you came for.', 3000);
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
  game.seatedIn = null;
  blackjack.standUp();
  hud.setMode('walk');
  hud.setPosture(null);
  paintGamble(null);
  player.standFrom({ x: seat.x, z: seat.z + 0.4 });
}

function useMachine() {
  game.atMachine = true;
  hud.setPosture('step away');
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
  const yaw = Math.PI;
  player.sitAt({
    position: new THREE.Vector3(car.driverPose.x - 0.55, 1.24, car.driverPose.z),
    yaw,
    pitch: -0.05,
    yawRange: 1.5,
    pitchMin: -0.8,
    pitchMax: 0.5,
  });
  if (mission.state === 'lot-return' || mission.flags.gotPackage) {
    hud.say('Package under the jacket, rain on the windscreen. <em>Hold [E] on the wheel.</em>', 5200);
  }
}

function getOutOfCar() {
  if (game.seatedIn !== 'car') return;
  game.seatedIn = null;
  audio.play('car.door', { volume: 0.6 });
  audio.stopLoop('car.radio', 0.6);
  audio.stopLoop('engine.idle', 0.8);
  hud.setMode('walk');
  hud.setPosture(null);
  player.standFrom({ x: car.driverPose.x - 1.6, z: car.driverPose.z });
  if (mission.state === 'lot') mission.setState('outside');
}

function sendAssociate() {
  if (mission.flags.gotPackage) return;
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
  const to = new THREE.Vector3(club.anchors.lotExit.x, 0, club.anchors.lotExit.z + 8);
  let k = 0;
  game.drive = (dt) => {
    k = Math.min(1, k + dt * 0.16);
    const e = k * k;
    car.group.position.lerpVectors(from, to, e);
    car.group.rotation.y = Math.PI + e * 0.9;
    player.position.set(car.group.position.x - 0.55, 1.24, car.group.position.z);
    if (k >= 1) {
      game.drive = null;
      showEnding(mission.ending());
    }
  };
  mission.finish(mission.ending());
}

function finish() { /* the ending card is driven by driveAway() */ }

function showEnding(kind) {
  const e = ENDINGS[kind] || ENDINGS.followed;
  campaign.update((state) => {
    const saved = state.missions[MISSION_IDS.BADA_BING_ONE];
    saved.status = 'complete';
    saved.packageReceived = campaign.hasItem(ITEM_IDS.LOU_PACKAGE);
    saved.ending = kind;
    if (saved.packageReceived) {
      const next = state.missions[MISSION_IDS.SQUATCHFATHER];
      if (next.status === 'locked') next.status = 'available';
    }
  });
  game.paused = true;
  player.enabled = false;
  blackout.classList.remove('on');
  overlay.classList.remove('hidden');
  overlay.classList.add('ending');
  overlay.querySelector('h1').innerHTML = 'THE<span>BING</span>';
  overlay.querySelector('.tag').textContent = e.title;
  const extras = [];
  if (mission.flags.jackpot) extras.push('You left with the jackpot and the package, which is more than most prospects manage.');
  if (mission.hands >= 6) extras.push(`You sat ${mission.hands} hands at that table while a made squatch waited for you.`);
  if (mission.drinks > 0) extras.push(`Drinks taken on the way in: ${mission.drinks}.`);
  if (mission.flags.secretPanel) extras.push('And somebody is skimming that machine. You know it, and now Lou is going to know it.');
  if (inventory.count() > 0) extras.push(`You also drove off with ${inventory.count()} of Lou's drinks in your hands.`);
  if (mission.flags.alarmTripped) extras.push('The service door alarm chirped on your way out. Somebody will mention it.');
  extras.push('<br><b>NEXT: RETURN HOME WITH LOU’S PACKAGE</b>');
  assetStatus.innerHTML = `${e.body}<br><br>${extras.join(' ')}`;
  startBtn.textContent = 'Again';
  startBtn.onclick = () => location.reload();
  let next = document.getElementById('next-level');
  if (!next) {
    next = document.createElement('a');
    next.id = 'next-level';
    overlay.querySelector('.panel').appendChild(next);
  }
  next.href = 'index.html';
  next.textContent = 'Return to the apartment →';
  next.onclick = (event) => {
    event.preventDefault();
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, {
      spawn: 'front_door',
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
      if (blackjack.state === 'bet') blackjack.deal();
      else if (blackjack.state === 'player') blackjack.hit();
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
  }
  if (game.seatedIn === 'table' && blackjack.state === 'player') {
    if (e.code === 'KeyF') blackjack.stand();
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
    audio.startLoop('engine.idle', { volume: 0.22, ambience: false });
    audio.startLoop('car.radio', { name: 'radio.talk', volume: 0.3 });
    game.radioOn = true;
    getInCar();
    addMoney(0);
    paintObjectives(mission.objectives);
    hud.say('<em>11:41 PM.</em> Lou is waiting in the back office with a package.', 6000);
    setTimeout(() => hud.say('<em>[Q]</em> to get out of the car.', 4200), 6400);
  }
  game.paused = false;
});

/* ------------------------------------------------------------------ */
/* Zones: what you can hear from where you are standing                */
/* ------------------------------------------------------------------ */

let room = 'lot';
function updateZones(dt) {
  const p = player.position;
  const next = roomAt(p.x, p.z);
  const inside = next !== 'lot' && next !== 'outside' && next !== 'alley' && next !== 'yard';
  const officeDoorOpen = club.doors.lou.open;
  const innerOpen = club.doors.inner.open;

  // Rain: loud outside, a rumour indoors
  audio.setLoopVolume('ambience.rain', inside ? (next === 'vestibule' ? 0.13 : 0.02) : 0.5, 0.8);
  // The club: the whole point of the wall between the hallway and the floor
  const music = next === 'main' ? 0.5
    : next === 'vestibule' ? (innerOpen ? 0.4 : 0.2)
      : next === 'hallway' ? 0.17
        : next === 'office' ? (officeDoorOpen ? 0.16 : 0.07)
          : next === 'bathroom' || next === 'storage' ? 0.1
            : 0.05;
  audio.setLoopVolume('ambience.club', music, 0.7);
  audio.setLoopVolume('ambience.crowd', next === 'main' ? 0.32 : next === 'vestibule' ? 0.14 : 0.04, 0.7);
  audio.setMuffle(inside && next !== 'main' && next !== 'vestibule', 780);

  if (next !== room) {
    room = next;
    club.rain.setVisible(!inside);
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
  if (mission.flags.gotPackage && (next === 'yard' || next === 'alley')) {
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
    guard.route = [{ x: -6, z: -4 }, { x: -6, z: 6 }, { x: -18, z: 6 }, { x: -18, z: -2 }];
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

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
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

  // The clock in the corner: late on Day One, nearly the next morning.
  const mins = 41 + Math.floor(game.elapsed / 12);
  const hour = 11 + Math.floor(mins / 60);
  hud.setClock(1, `${hour > 12 ? hour - 12 : hour}:${String(mins % 60).padStart(2, '0')} ${hour >= 12 ? 'AM' : 'PM'}`, game.elapsed);

  postfx.render(dt);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

assetStatus.innerHTML = 'Everything in here is drawn and synthesised at load time — '
  + 'no models, no textures, no audio files.';
loading.classList.add('hidden');
window.__bing = {
  THREE, scene, camera, renderer, postfx, player, club, cast, slots, blackjack, mission, dialogue, hud, audio, game,
  interaction, drunk, highs, inventory, campaign, car, lot, associate, scripts,
  teleport(x, z, yaw = 0) {
    player.mode = 'walk';
    player.position.set(x, 1.66, z);
    player.yaw = yaw;
    player.velocity.set(0, 0, 0);
    player.update(0.016);
  },
};
frame();

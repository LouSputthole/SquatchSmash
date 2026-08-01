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
import { Phone } from '../core/phone.js';
import { phoneThreadsForCampaign } from '../core/phone-content.js';
import { createApartmentStory } from '../core/apartment-story.js';
import { PostFX } from '../core/postfx.js';
import { Inventory, ITEMS } from '../core/inventory.js';
import {
  EVENT_IDS,
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
import {
  familyPresent,
  loadFaceIndex,
  populateFamily,
  buildFamilyScripts,
} from './family.js';
import { makeSlotMachine, SlotMachine } from './slots.js';
import { Blackjack, BETS } from './blackjack.js';
import { makePlayerCar, populateLot } from './vehicles.js';
import { Dialogue } from './dialogue.js';
import { buildScripts, applyBingVoiceCues, AMBIENT, NOTES } from './script.js';
import { Mission, ENDINGS } from './mission.js';
import {
  SecondVisitMission,
  buildSecondVisitLouScript,
} from './second-visit.js';

const START_CASH = 340;
const DRINK_TIME = 2.4;
/* How much of the synthesised club bed survives under the real record. */
const BED_UNDER_RECORD = 0.16;

/* The DJ alternates these by visit. They are genuine positional records on
 * the club floor, not apartment-radio tracks pasted over the room. Keeping
 * the last index in local storage makes a refresh change the set instead of
 * randomly handing a player the same song all night. */
const CLUB_DJ_RECORDS = Object.freeze([
  { file: 'squatches-in-the-house.mp3', title: 'Squatches in the House' },
  { file: 'sallie-j.mp3', title: 'Sallie J' },
]);
const CLUB_DJ_INDEX_KEY = 'squatch.bing.dj.record';

function nextClubDjRecord() {
  try {
    const saved = Number.parseInt(localStorage.getItem(CLUB_DJ_INDEX_KEY), 10);
    const index = Number.isInteger(saved) && saved >= 0 ? saved % CLUB_DJ_RECORDS.length : 0;
    localStorage.setItem(CLUB_DJ_INDEX_KEY, String((index + 1) % CLUB_DJ_RECORDS.length));
    return CLUB_DJ_RECORDS[index];
  } catch {
    return CLUB_DJ_RECORDS[0];
  }
}

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
  subtitle: document.getElementById('subtitle'),
  kit: document.getElementById('kit'),
  kitList: document.querySelector('#kit ul'),
  phonePocket: document.getElementById('phone-pocket'),
  phone: document.getElementById('phone-osd'),
  phoneScreen: document.querySelector('#phone-osd .screen'),
  phoneKeys: document.querySelector('#phone-osd .keys'),
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
const secondVisitStory = isSecondVisit ? createBadaBingTwoStory({ campaign }) : null;
/* The drive over. Both visits book their travel time on ARRIVAL rather than
 * on departure -- the campaign already knows the hour the prospect pulls
 * into this lot (23:41 on the first night), and until this ran the club sat
 * at whatever time he last got out of bed. `advanceTime` only ever moves the
 * clock forward, so re-entering a scene cannot rewind the evening.
 *
 * Scene Two is deliberately claimed only after its story guard succeeds on
 * Start. Merely opening `bing.html?visit=2` must not move a fresh save into a
 * locked mission or advance its clock. Scene One retains its established
 * arrival behavior. */
if (!isSecondVisit) {
  if (campaign.state.scene.id !== activeSceneId) {
    campaign.enter(activeSceneId, { spawn: 'driver_seat' });
  }
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_ONE);
}

/* ---- he arrives empty-handed ----
 * The whole point of the first visit is Lou putting the package on the desk
 * and the prospect picking it up, and the campaign's inventory is durable:
 * anybody who has played this night before still had `parcel` on him from
 * last time, so scene one opened with the thing it exists to hand over
 * already inside his jacket -- readout, weight and all -- and Lou's briefing
 * handed him a second copy of what he was carrying.
 *
 * Nothing else grants it: the only add() in the game is takePackage(), at the
 * handoff. So the fix is to make the START of the visit authoritative -- the
 * night begins with it not on him, whatever the save remembers -- rather than
 * to hunt for a grant that was never there. Scene TWO is untouched: by then
 * the package is the Squatchfather's business and long gone.
 */
if (!isSecondVisit && campaign.hasItem(ITEM_IDS.LOU_PACKAGE)) {
  campaign.update((state) => {
    const drop = (list) => list.filter((id) => id !== ITEM_IDS.LOU_PACKAGE);
    state.inventory.carried = drop(state.inventory.carried);
    state.inventory.concealed = drop(state.inventory.concealed);
  });
}

/* ---- and he arrives with his phone ----
 * The flat records the pickup once and for good (ITEM_IDS.PHONE in `carried`),
 * and everything phone-shaped in here reads that record. Two ways to reach
 * this lot never went through that morning: a scene preview, and a save
 * written before the phone was an item at all. Both of them answered Lou on
 * it -- that call is what put the prospect in the car -- so the club takes the
 * campaign at its word and records what already happened rather than leaving
 * a man with no way to answer the next one. */
if (!campaign.hasItem(ITEM_IDS.PHONE)
  && campaign.state.events[EVENT_IDS.LOU_FIRST_CALL]?.status === 'answered') {
  campaign.addItem(ITEM_IDS.PHONE);
}

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
  booskiShotDone: false,
  beat: null,          // the one scripted camera beat (Booski's shot delivery)
  lastHand: null,      // last blackjack outcome, for the table's voice
  clubRecord: null,    // the actual record selected for this visit's DJ set
  voLog: [],           // recent exact-cue voice attempts, for the verifier
  /* The objective card reads the mission, the Family and half a dozen other
   * systems, none of which exist while the Mission constructor is still
   * adding its own first objectives. Nothing paints until the club stands. */
  hudReady: false,
};

const MissionType = isSecondVisit ? SecondVisitMission : Mission;
const mission = new MissionType({
  onObjective: () => repaintObjectives(),
  onMessage: (text) => {
    hud.toast(text, '');
    audio.play('phone.ring', { volume: 0.35 });
  },
  onNote: (text) => hud.say(text, 4200),
  onState: (state) => { if (state === 'done') finish(); },
  onAssociate: sendAssociate,
});

/* ------------------------------------------------------------------ *
 * Exact-cue voice.
 *
 * audio.say() picks among `vo.<group>.<n>` variants, which is right for
 * barks and wrong for dialogue: a subtitled line must play ITS recording,
 * not a sibling's — and a member's bank also holds the prospect's replies
 * (`vo.bing.hang.gratin.tony.1` shares the gratin prefix), so a group pick
 * could put Tony's words in Gratin's mouth. This plays one named cue when
 * its recording exists and stays silent when it does not, same as say():
 * a synthesised voice would be worse than silence.
 *
 * Attempts land in game.voLog either way, so the verifier can prove the
 * wiring fires before a single mp3 has been generated.
 * ------------------------------------------------------------------ */
function voiceCue(name, { volume = 0.9, delay = 0, solo = true } = {}) {
  if (!name) return false;
  game.voLog.push(name);
  if (game.voLog.length > 60) game.voLog.shift();
  if (!audio.ready) return false;
  const bank = audio.buffers?.get(name);
  if (!bank?.length) return false;
  // One voice at a time, unless this line is scheduled behind another.
  if (solo) audio._vo?.stop?.();
  const src = audio.play(name, { volume, delay });
  if (solo) audio._vo = src;
  const secs = src?.buffer ? src.buffer.duration : 1.6;
  audio.hold(delay + secs + 0.25);
  return true;
}

/** How long a recorded cue runs, or 0 when it has no recording yet. */
function cueSeconds(name) {
  const bank = audio.buffers?.get(name);
  return bank?.length ? bank[0].duration : 0;
}

/* Dialogue nodes and replies may carry a `cue` (string, or a function when
 * the node's line itself is dynamic). The subtitle always shows; the voice
 * plays exactly when its recording exists. */
function nodeCue(owner) {
  return typeof owner?.cue === 'function' ? owner.cue() : owner?.cue;
}

/* ------------------------------------------------------------------ *
 * Where the words sit.
 *
 * Three separate things write to the bottom of the screen: the conversation
 * box (name, line, numbered replies), the narrator's subtitle, and a patron's
 * ambient remark as you go past. Left alone they land on top of each other --
 * the owner's screenshot had a reply option reading through somebody else's
 * sentence. So while a conversation is up, the subtitle line is lifted clear
 * of whatever the dialogue box currently measures, and the crowd shuts up
 * (see ambientChatter). Nothing is hidden that carries information; the
 * narration you actually need mid-conversation -- what is under the cloth,
 * what the monitor shows -- just moves up out of the way.
 * ------------------------------------------------------------------ */
let talkLayoutAt = 0;
function layoutTalk(force = false) {
  const now = performance.now();
  if (!force && now - talkLayoutAt < 180) return;
  talkLayoutAt = now;
  const h = dialogue?.active ? ui.dialogue.root.offsetHeight : 0;
  document.documentElement.style.setProperty('--talk-h', `${Math.round(h)}px`);
}

const dialogue = new Dialogue(ui.dialogue, {
  onLine: (text, who, node) => {
    audio.play('radio.talk', { volume: 0.0 });
    voiceCue(nodeCue(node));
    layoutTalk(true);
  },
  onChoice: (opt) => { voiceCue(nodeCue(opt)); layoutTalk(true); },
  onPaint: () => layoutTalk(true),
  onMovementLock: (locked) => {
    if (locked) {
      /* Objective briefings are the one kind of dialogue Tony cannot stroll
       * away from. Keep the camera where it is, clear held movement, and
       * return to the exact prior posture once the authored thread ends. */
      game.dialogueModeBeforeLock = player.mode;
      player.clearKeys();
      /* `briefing` disables locomotion while leaving the mouse-look path
       * live. The old `frozen` state made Lou's required conversation feel
       * like the camera had been taken away in the office doorway. */
      if (player.mode === 'walk') player.mode = 'briefing';
      return;
    }
    if (game.dialogueModeBeforeLock === 'walk' && player.mode === 'briefing') {
      player.mode = 'walk';
      player.clearKeys();
    }
    game.dialogueModeBeforeLock = null;
  },
  onActive: (on) => {
    document.body.classList.toggle('talking', on);
    /* A conversation that opens while a patron is still mid-remark clears the
     * remark rather than sliding it: two people talking at once at the bottom
     * of the screen is the exact pile-up this is here to stop. */
    if (on) ui.subtitle?.classList.add('hidden');
    layoutTalk(true);
  },
  onEnd: () => {
    game.louTalking = false;
    if (game.louBriefing) {
      game.louBriefing = false;
      if (player.enabled && !game.seatedIn) player.mode = 'walk';
    }
  },
  cueSeconds,
});

/* ------------------------------------------------------------------ */
/* The building                                                        */
/* ------------------------------------------------------------------ */

window.__squatchStage?.('Wiring the neon…');
const club = buildClub(scene, { renderer });
world.colliders = club.colliders;
world.floorZones = club.floorZones;
world.groundAt = club.groundAt;
/* The props that borrow the player's own art off assets/art -- the stickers
 * on Lou's fridge. The room is already standing and dressed with the drawn
 * versions; this only waits for the real images, and never throws if they are
 * not there. */
await club.artReady;

window.__squatchStage?.('Letting people in…');
const cast = populate(scene, club, { includeMargo: !isSecondVisit });
const associate = makeAssociate(scene, club.anchors.hallMouth, club.colliders, club.navBlockers);

/* ---- the Family ----
 * Everyone from the owner's locked table hangs out here between missions,
 * with their real faces where the photos exist. Presence is read from the
 * shared campaign: Sasole only after the Beef Run is flown, Booski from the
 * start, everyone else always — both visits get the floor. Big Uncle Lou is
 * already upstairs and is not duplicated. The face index says which photos
 * have landed, so nothing ever fetches a PNG that is not there. */
window.__squatchStage?.('Seating the Family…');
const faceIndex = await loadFaceIndex();
const family = populateFamily(scene, club, {
  present: familyPresent(campaign.state),
  faces: faceIndex,
});
for (const npc of family.all) {
  cast.all.push(npc);
  if (!cast.byName[npc.characterId]) cast.byName[npc.characterId] = npc;
}

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
    game.lastHand = outcome;
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

    /* The authored table VO (docs/VOICE-CASTING.md): the dealer calls every
     * verdict right beside the WIN/LOSE callout, and the prospect answers his
     * own wins and losses — never a push, never his own bust. These are
     * single named cues, so they play through voiceCue; until the recordings
     * land they fall through to the older floor patter below, and once they
     * exist they take the floor first so nobody speaks twice. */
    const dealerCue = {
      blackjack: 'vo.bing.blackjack.dealer.win',
      win: 'vo.bing.blackjack.dealer.win',
      lose: 'vo.bing.blackjack.dealer.lose',
      push: 'vo.bing.blackjack.dealer.push',
      bust: 'vo.bing.blackjack.dealer.bust',
    }[kind] ?? null;
    const tonyCue = kind === 'win' || kind === 'blackjack'
      ? 'vo.bing.blackjack.tony.win'
      : kind === 'lose' ? 'vo.bing.blackjack.tony.lose' : null;
    if (dealerCue && performance.now() / 1000 - lastTableLine >= SETTLE) {
      const dealerSpoke = voiceCue(dealerCue, { delay: 0.45 });
      const tonySpoke = tonyCue
        ? voiceCue(tonyCue, {
          delay: 0.45 + (dealerSpoke ? cueSeconds(dealerCue) + 0.35 : 0.55),
          solo: !dealerSpoke,
        })
        : false;
      if (dealerSpoke || tonySpoke) {
        lastTableLine = performance.now() / 1000;
        return;
      }
    }

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
  secondVisit: () => isSecondVisit,
  request: (what) => {
    game.songRequested = what;
    audio.play('radio.tune', { volume: 0.35, position: club.anchors.dj });
    hud.toast('Request in', 'good');
  },
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
applyBingVoiceCues(scripts);

/* ------------------------------------------------------------------ */
/* Money, drinks, objectives                                           */
/* ------------------------------------------------------------------ */

function addMoney(delta) {
  game.money = Math.max(0, game.money + delta);
  if (game.kitOpen) paintKit();
  ui.cash.textContent = `$${game.money.toLocaleString()}`;
  ui.wallet.classList.remove('hidden');
  ui.wallet.classList.toggle('down', delta < 0);
  ui.wallet.classList.add('bump');
  setTimeout(() => ui.wallet.classList.remove('bump'), 180);
}

/**
 * The objective card.
 *
 * Two lists in one box. Required beats read as they always have. Optional
 * ones -- the reasons to actually be in a nightclub rather than walking
 * through one -- sit under a rule, dimmer, and some of them carry a live
 * tally (`3/15 squatches`) rather than a tick. Order is authored, not
 * insertion: an objective that completes does not jump about.
 */
function paintObjectives(list) {
  ui.objectives.classList.remove('hidden');
  const rows = [];
  const row = (o) => {
    const li = document.createElement('li');
    li.className = [o.optional ? 'optional' : '', o.done ? 'done' : ''].filter(Boolean).join(' ');
    if (o.total) {
      const tally = document.createElement('span');
      tally.className = 'tally';
      tally.textContent = `${o.count ?? 0}/${o.total}`;
      li.appendChild(tally);
    }
    li.appendChild(document.createTextNode(o.text));
    return li;
  };
  for (const o of list) if (!o.optional) rows.push(row(o));
  const optional = list.filter((o) => o.optional);
  if (optional.length) {
    const rule = document.createElement('li');
    rule.className = 'rule';
    rule.textContent = 'WHILE YOU ARE HERE';
    rows.push(rule);
    for (const o of optional) rows.push(row(o));
  }
  ui.objectiveList.replaceChildren(...rows);
}

/* ------------------------------------------------------------------ *
 * The optional evening.
 *
 * The required objectives are the mission's and always have been. These are
 * the club's own, and every one of them is wired to a beat that already
 * existed: the shot, the table, the machine, the runway, the bar, and the
 * Family on the floor. The squatch counter reads its total off whoever is
 * actually present tonight, so it is right on a fresh save (fifteen) and
 * right after the Beef Run (sixteen) without a second list to keep.
 *
 * "Squatches" is the crew's word for the crew. Everybody in this club
 * presents as human, and nothing here says otherwise.
 * ------------------------------------------------------------------ */
const spokeTo = new Set();
function optionalObjectives() {
  const list = [
    {
      id: 'mingle',
      text: 'Talk with the squatches around the club',
      optional: true,
      count: spokeTo.size,
      total: family.all.length,
      done: family.all.length > 0 && spokeTo.size >= family.all.length,
    },
    { id: 'slots', text: 'Play the slots', optional: true, done: (mission.spins || 0) > 0 },
    { id: 'cards', text: 'Play blackjack', optional: true, done: (mission.hands || 0) > 0 },
    { id: 'tip', text: 'Tip the performers', optional: true, done: (game.tips || 0) > 0 },
    { id: 'drink', text: 'Order a drink from the bar', optional: true, done: (mission.drinks || 0) > 0 },
  ];
  if (isSecondVisit) {
    list.push({ id: 'song', text: 'Request a song from the DJ', optional: true, done: !!game.songRequested });
  }
  return list;
}

/** The mission's list, then the club's. Repainted whenever either moves. */
function repaintObjectives() {
  if (!game.hudReady) return;
  paintObjectives([...mission.objectives, ...optionalObjectives()]);
}

/* Repaint only when something actually moved. The card is rebuilt from
 * scratch when it does, which is fine at the rate a nightclub changes. */
let objectiveSig = '';
function objectivesTick() {
  if (!game.hudReady) return;
  if (mission.flags.metHer) mission.complete('margo');
  if (game.booskiShotDone) mission.complete('shot');
  const sig = `${mission.objectives.map((o) => (o.done ? 1 : 0)).join('')}`
    + `|${mission.objectives.length}|${spokeTo.size}|${mission.spins || 0}|${mission.hands || 0}`
    + `|${mission.drinks || 0}|${game.tips || 0}|${game.songRequested ? 1 : 0}`;
  if (sig === objectiveSig) return;
  objectiveSig = sig;
  repaintObjectives();
}

/** Somebody on the floor has now been talked to. Counts once. */
function noteSpokeTo(npc) {
  if (!npc?.characterId || !npc.familyMember || spokeTo.has(npc.characterId)) return;
  spokeTo.add(npc.characterId);
  repaintObjectives();
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
  /* `autoDrink` is seconds of hold the game is doing on the player's behalf.
   * The shot beat uses it: Booski says drink, so Tony drinks, and it goes
   * through the same pose, the same units and the same swallow as [F]. */
  if (game.autoDrink > 0) game.autoDrink = Math.max(0, game.autoDrink - dt);
  if (!keys.has('KeyF') && game.autoDrink <= 0) {
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

/* ------------------------------------------------------------------ *
 * Twenty-five seconds of clarity.
 *
 * Whatever is on the urinal lip does what it does: the world narrows, the
 * legs speed up, and the edges of the frame go dark and stay dark until it
 * lets go. Deliberately a short, self-contained state rather than a fourth
 * entry in the Highs system -- this is not a night out, it is a bathroom.
 * ------------------------------------------------------------------ */
const FOCUS_FOV = 9;      // degrees the view narrows by at full effect
let focusK = 0;

function startFocus(secs = 25) {
  game.focus = Math.max(game.focus || 0, secs);
}

function focusTick(dt) {
  if (game.focus > 0) game.focus = Math.max(0, game.focus - dt);
  const want = game.focus > 0 ? 1 : 0;
  // Comes on fast, lets go slowly, which is the honest shape of it.
  focusK += (want - focusK) * Math.min(1, dt * (want ? 2.2 : 0.55));
  if (focusK < 0.003) {
    if (game.focusWasOn) {
      game.focusWasOn = false;
      camera.fov = 70;
      camera.updateProjectionMatrix();
    }
    return;
  }
  game.focusWasOn = true;
  camera.fov = 70 - FOCUS_FOV * focusK;
  camera.updateProjectionMatrix();
  player.moveScale *= 1 + 0.42 * focusK;
  fxDrunk.style.setProperty('--vig', (drunk.vignette + 0.42 * focusK).toFixed(3));
}

/* A short cheerful shower of bills. DOM, not geometry: it is a HUD flourish
 * on a tip, it lasts under two seconds, and it costs nothing. */
const moneyLayer = document.getElementById('money-burst');
function moneyBurst(n = 9) {
  if (!moneyLayer) return;
  for (let i = 0; i < n; i++) {
    const bill = document.createElement('i');
    bill.className = 'bill';
    bill.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 22}vmin`);
    bill.style.setProperty('--rot', `${(Math.random() * 2 - 1) * 220}deg`);
    bill.style.setProperty('--delay', `${Math.random() * 0.22}s`);
    bill.style.setProperty('--rise', `${18 + Math.random() * 16}vmin`);
    moneyLayer.appendChild(bill);
    setTimeout(() => bill.remove(), 2100);
  }
  audio.play('bing.money.flutter', { volume: 0.4 });
}

/* ------------------------------------------------------------------ *
 * What is on you.
 *
 * The flat has pockets, a nightstand and a hotbar. The club had a single
 * "carrying" line and nothing else, so a player who had just been handed a
 * gun wrapped in a cloth could not see that he had it, and a player whose
 * phone was ringing had no way to reach the phone at all -- the owner's
 * "can't answer my phone there because I can't get to my inventory".
 *
 * This is the club's own readout, deliberately small: campaign items (the
 * ones that survive the drive), what is in your hands, the roll in your
 * pocket, and the phone. [I] shows and hides it; it comes up on its own
 * whenever something lands in it.
 * ------------------------------------------------------------------ */
const KIT_ITEMS = {
  [ITEM_IDS.LOU_PACKAGE]: { icon: '🩶', name: 'A wrapped package', where: () => 'INSIDE JACKET' },
  /* The phone is a campaign item like the package -- the flat puts it in
   * `carried` the morning he picks it up off the nightstand and it never
   * leaves. It used to be a hard-coded row printed under the money whether or
   * not he owned one, which is a readout that cannot tell you anything: the
   * one thing an inventory is for is answering "have I got it on me". It now
   * comes out of the same campaign inventory the package does, and the [P]
   * key below reads the same answer. */
  [ITEM_IDS.PHONE]: {
    icon: '📱',
    name: 'Phone',
    where: () => (phone.ringing ? 'RINGING' : 'POCKET'),
    cls: () => (phone.ringing ? 'ring' : ''),
  },
};

/** Is his phone actually on him? Everything phone-shaped in here asks this. */
function hasPhone() {
  return campaign.hasItem(ITEM_IDS.PHONE);
}

function paintKit() {
  const rows = [];
  const line = (icon, name, where, cls = '') => {
    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML = `<span class="icon">${icon}</span><span class="what">${name}</span>`
      + `<span class="where">${where}</span>`;
    rows.push(li);
  };
  // Campaign items first: they are the ones that leave the building with you.
  for (const [id, meta] of Object.entries(KIT_ITEMS)) {
    // The phone has its own persistent lower-right affordance. It is a tool,
    // not another line in the campaign-item card.
    if (id === ITEM_IDS.PHONE) continue;
    if (campaign.hasItem(id)) line(meta.icon, meta.name, meta.where(), meta.cls?.() ?? '');
  }
  line('💵', `$${game.money.toLocaleString()}`, 'POCKET');
  ui.kitList.replaceChildren(...rows);
}

function showKit(on = true) {
  game.kitOpen = on;
  ui.kit.classList.toggle('hidden', !on);
  if (on) paintKit();
  paintPhonePocket();
}

/* ---- the phone ----
 * The same Phone the flat uses, drawn into the HUD instead of onto a model
 * in his hand: the club is a first-person scene without a hotbar slot to
 * spare, and a call you cannot answer is a campaign that cannot advance.
 * The apartment story owns which call is pending and what answering it
 * means, so this reuses it rather than keeping a second copy of the rules.
 */
const phone = new Phone({
  time: { day: campaign.state.story.day, hour: 23 },
  audio,
  calls: [],
  threads: phoneThreadsForCampaign(campaign.state),
  onThreadRead: (thread) => {
    if (thread.readEventId) campaign.advanceTime(thread.readEventId);
  },
});
let phoneContentRevision = campaign.state.revision;
function syncPhoneThreads() {
  const state = campaign.state;
  if (state.revision === phoneContentRevision) return;
  phone.setThreads(phoneThreadsForCampaign(state));
  phoneContentRevision = state.revision;
}
ui.phoneScreen?.appendChild(phone.canvas);
const phoneStory = createApartmentStory({
  campaign,
  ring: (definition) => {
    // It cannot ring in his pocket if it is not in his pocket.
    if (!hasPhone()) return false;
    const rang = phone.ring(definition);
    if (rang) {
      showKit(true);
      hud.toast(`Incoming: ${definition.from}`, '');
      hud.say('Your phone is going in your pocket. <em>[P] to take it out, [E] to answer.</em>', 5200);
    }
    return rang;
  },
});
phoneStory.beginMorning();
phone.onAnswered = (definition) => {
  phoneStory.callAnswered(definition);
  paintKit();
};

/* Taking it out is gated on owning it, and owning it is the campaign's call --
 * the same `carried` entry the kit reads. A prospect who never picked the
 * phone up off his own nightstand has nothing to raise in here. */
function showPhone(on = true) {
  if (on && !hasPhone()) {
    hud.say('You left it at home. <em>It is on the nightstand, ringing at nobody.</em>', 3200);
    return;
  }
  game.phoneUp = on;
  ui.phone.classList.toggle('hidden', !on);
  if (on) showKit(true);
  paintPhonePocket();
}

function paintPhonePocket() {
  if (!ui.phonePocket) return;
  const carried = hasPhone();
  ui.phonePocket.classList.toggle('hidden', !carried);
  ui.phonePocket.classList.toggle('ringing', carried && phone.ringing);
}

function paintPhone() {
  phone.draw();
  ui.phone.classList.toggle('ringing', phone.ringing);
  ui.phoneKeys.textContent = phone.ringing
    ? '[E] ANSWER   [P] POCKET'
    : phone.inCall ? '[Q] HANG UP'
      : (phone.screen === 'messages' || phone.screen === 'thread')
        ? '[E] SELECT   WHEEL THREAD   [Q] POCKET'
        : '[E] SELECT   [P] POCKET';
}

function phoneTick(dt) {
  /* The phone reads the campaign clock too. It was built with a fixed hour,
   * so the one screen in the club with a time printed on it in numerals was
   * the one screen disagreeing with the wall. */
  syncPhoneThreads();
  const story = campaign.state.story;
  phone.time.day = story.day;
  // The Phone reads `hour` as a FRACTIONAL hour; the fraction is its minutes.
  phone.time.hour = (story.timeMinutes / 60) % 24;
  phoneStory.update(dt);
  phone.update(dt);
  if (game.phoneUp) paintPhone();
  paintPhonePocket();
  /* It rings whether or not it is out, and it comes out on its own the
   * moment it does -- a missed campaign call is a stuck campaign. */
  if (phone.ringing && !game.phoneUp) showPhone(true);
  if (game.kitOpen && (phone.ringing || phone.inCall)) paintKit();
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

/* "Talk to" starts are resumable: walk off mid-conversation and the next
 * press picks it back up where it lapsed. Scripted one-shots (door lines,
 * the package beat) keep starting exactly where they are told to. */
function talkTo(npc, tree, at = 'open') {
  return {
    label: () => `Talk to <b>${npc.name}</b>`,
    onUse: () => {
      npc.faceToward(player.position.x, player.position.z);
      noteSpokeTo(npc);
      dialogue.start(tree, at, npc, { resume: true });
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
    else dialogue.start(scripts.bouncer, 'open', npc, { resume: true });
  },
});
reg(cast.byName.bartender.group, talkTo(cast.byName.bartender, scripts.bartender));
reg(cast.byName.hallGuard.group, talkTo(cast.byName.hallGuard, scripts.hallGuard));
reg(cast.byName.dealer.group, talkTo(cast.byName.dealer, scripts.dealer));
reg(cast.byName.dj.group, talkTo(cast.byName.dj, scripts.dj));
/* Scene One only, so she is registered only when she is actually in the room. */
if (cast.byName.margo) {
  reg(cast.byName.margo.group, {
    label: () => (mission.flags.gaveNumber || mission.flags.metHer
      ? 'Talk to <b>Margo</b>'
      : 'Talk to the <b>woman at the end of the bar</b>'),
    onUse: () => {
      const her = cast.byName.margo;
      her.faceToward(player.position.x, player.position.z);
      noteSpokeTo(her);
      dialogue.start(scripts.margo, mission.flags.gaveNumber ? 'number' : 'open', her, { resume: true });
    },
  });
}
reg(cast.byName.lou.group, {
  label: () => (mission.state === 'briefed' ? 'Confirm with <b>Lou</b>' : 'Talk to <b>Lou</b>'),
  onUse: () => {
    const lou = cast.byName.lou;
    lou.faceToward(player.position.x, player.position.z);
    if (mission.state === 'briefed') {
      /* Business first, then he is just a man in his office. The second press
       * gets his two recorded floor lines rather than the parting line on a
       * loop -- one Lou, one voice, and nothing in the bank left unplayed. */
      if (game.louPartingSaid) dialogue.start(scripts.lou, 'hang', lou, { resume: true });
      else { game.louPartingSaid = true; dialogue.start(scripts.lou, 'parting', lou); }
    } else if (mission.flags.gotPackage) dialogue.start(scripts.lou, 'envelope', lou, { resume: true });
    else if (dialogue.tree === scripts.lou && dialogue.history.size) {
      // Dialogue history is global. A bouncer or bartender chat must not make
      // Lou's first required briefing look resumable.
      dialogue.start(scripts.lou, 'greet', lou, { resume: true });
    }
    else startLouScene();
  },
});

/* ---- the Family, walk-up talk ----
 * Ordinary resumable conversations through the same machine as everyone
 * else: walk off mid-thread and the next [E] picks it back up. Booski's
 * tree carries the shot beat; the hook hands it to startShotBeat below. */
const familyScripts = buildFamilyScripts({
  shotDone: () => game.booskiShotDone,
  startShot: () => startShotBeat(),
});
for (const npc of family.all) {
  const tree = familyScripts[npc.characterId];
  if (tree) reg(npc.group, talkTo(npc, tree));
}

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

/* The stage's own two recorded lines. They were in the bank from the first
 * casting pass and had never been hooked to anything, because the performers
 * are background figures with no walk-up conversation. They belong to the one
 * moment the floor and the stage actually talk to each other: the tip. She
 * says the first one the first time and the second one after that, through
 * the same subtitled dialogue machine as everybody else, so the voice and the
 * words on screen are the same words. */
const stageTalk = {
  first: {
    who: 'the dancer',
    line: 'You’re sweet. Tip the band, sweetheart.',
    cue: 'vo.bing.stage.1',
    hold: 3.0,
  },
  again: {
    who: 'the dancer',
    line: 'Eyes up here are free. The winkin’ costs.',
    cue: 'vo.bing.stage.2',
    hold: 3.0,
  },
};

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
      moneyBurst();
      const her = cast.byName.performer3;
      if (her) dialogue.start(stageTalk, game.tips === 1 ? 'first' : 'again', her);
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
  graffitiPad.position.set(ROOMS.bathroom.x0 + 0.14, 1.5, 2.11);
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

  /* The line on the urinal lip. Nothing points at it, nothing asks you to
   * take it, and no objective moves either way -- it is just there, the way
   * it would be. Twenty-five seconds of everything being very clear
   * afterwards, then it lets go of you. */
  const powderPad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  powderPad.position.copy(club.anchors.powder);
  scene.add(powderPad);
  reg(powderPad, {
    label: () => (game.focus > 0 ? 'You are fine. You are <b>great</b>.' : 'The line on the <b>urinal</b>'),
    hold: 1.1,
    onTap: () => hud.say('A line of something white on the lip of the urinal, laid out with a card and left. '
      + 'It has been there a while. Nobody in this building is coming back for it.', 5200),
    onUse: () => {
      if (game.focus > 0) {
        hud.say('There is nothing left and you knew that before you bent down.', 3200);
        return;
      }
      club.anchors.powderMesh?.parent?.remove(club.anchors.powderMesh);
      startFocus(25);
      audio.play('bing.line.snort', { volume: 0.5 });
      hud.toast('Locked in', 'good');
      hud.say('<em>Oh.</em> Everything in the room arrives at once and stands very still, and you are, '
        + 'briefly, the most competent man in New Jersey.', 5600);
    },
  });

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

  /* Whoever is under the tarpaulin. One look, and then the room is a room
   * you have been in with a body in it, which is a different room. */
  if (club.storeroom.body) {
    const bodyPad = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 2.0), new THREE.MeshBasicMaterial({ visible: false }));
    bodyPad.position.set(club.anchors.body.x, 0.55, club.anchors.body.z);
    scene.add(bodyPad);
    reg(bodyPad, {
      label: () => (mission.flags.foundBody ? 'Under the <b>tarpaulin</b>' : 'Something under a <b>tarpaulin</b>'),
      hold: 1.2,
      onTap: () => hud.say('A tarp thrown over something between the crates and the freezer. '
        + 'Two boots are out the end of it, laces still done up.', 5000),
      onUse: () => {
        if (mission.flags.foundBody) {
          hud.say('Still there. He is not going to be less there in ten minutes.', 3400);
          return;
        }
        mission.flags.foundBody = true;
        audio.play('door.creak', { volume: 0.25, position: bodyPad.position });
        hud.toast('You should not have looked', '');
        hud.say('You lift the corner. A man, face down, in a good coat, with a hand out towards the door '
          + 'he did not reach. The stain has gone into the grout and dried at the edges — this happened '
          + 'before your shift. <em>You put the tarp back exactly as it was.</em>', 8000);
        mission.note('There is a man under a tarpaulin in the store room. Nobody has mentioned him.');
      },
    });
  }

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

/* ---- the way out on foot ----
 * "Leave the Bada Bing" used to mean finding your car and knowing to hold [E]
 * on the wheel, which nobody guessed. Once the job is done the front door
 * itself offers the exit; the drive-out from the wheel still works the same. */
{
  const leavePad = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.9, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
  leavePad.position.set(0, 1.1, 16.75);
  scene.add(leavePad);
  reg(leavePad, {
    label: () => (isSecondVisit ? 'Hold to <b>head for the motel</b>' : 'Hold to <b>call it a night</b>'),
    enabled: () => mission.readyToLeave && !game.seatedIn && !game.over,
    hold: 1.2,
    onUse: () => leaveByFrontDoor(),
  });
}

function leaveByFrontDoor() {
  if (game.over || !mission.readyToLeave) return;
  /* Walking out the front counts exactly like driving out: a beat of black
   * while Tony crosses the lot, then the same drive-away ending, so every
   * flag he earned tonight still shapes the card. */
  mission.backInLot();
  audio.play('car.door', { volume: 0.5, delay: 0.55 });
  blackout.classList.add('on');
  setTimeout(() => {
    game.seatedIn = 'car';
    player._tween = null;
    player.mode = 'frozen';
    player.position.copy(car.driverPosition());
    player.yaw = car.driverYaw();
    hud.setMode('seated');
    blackout.classList.remove('on');
    driveAway();
  }, 700);
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
        audio.play('car.engine.start', { volume: 0.4, position: club.anchors.suspiciousCar });
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
    /* A CONSTANT. This read `mission.readyToLeave ? 1.4 : undefined`, which
     * the interaction system evaluates exactly once, at registration -- and
     * the mission is never ready to leave at the moment the club is built.
     * So the wheel was a tap forever, "Hold to drive away" was a lie, and the
     * onTap under it was unreachable code. The wheel is always a hold: tap it
     * early and he tells you why not, hold it when the job is done and you
     * are gone. (interaction.js divides by `hold`, so it cannot be a
     * function without changing a system this scene does not own.) */
    hold: 1.4,
    onTap: () => hud.say(mission.readyToLeave
      ? 'Hold it. You are leaving.'
      : 'Not until you have got what you came for.', 3000),
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
  game.louBriefing = true;
  cast.byName.lou.faceToward(player.position.x, player.position.z);
  dialogue.start(scripts.lou, 'enter', cast.byName.lou, { lockMovement: true });
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
  dialogue.start(scripts.lou, 'taken', cast.byName.lou, { lockMovement: true });
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
  audio.stopLoop('car.engine.idle', 0.8);
  hud.setMode('walk');
  hud.setPosture(null);
  if (mission.state === 'lot') mission.setState('outside');
}

/* ------------------------------------------------------------------ *
 * Booski's shot — the owner's booked beat.
 *
 * Talk to Booski at the bar and he offers a shot, then yells the
 * thirty-seconds line across the room. The yell starts this: a short camera
 * beat that follows the bartender hustling the shot over from the service
 * station, the
 * handoff line when it arrives, and the prospect holding a whiskey he did
 * not order. One-shot per visit. The camera hijack is the gentlest the club
 * allows — the player is frozen only while the bartender crosses the room,
 * and control comes back the moment the glass lands, before the toast.
 * ------------------------------------------------------------------ */
const SHOT_BAR_STAND = { x: -17.75, z: 2.5 };

function giveShot() {
  game.heldDrink = 'whiskey';
  game.drinking = 0;
  if (!inventory.full) inventory.add('whiskey');
  hud.setHand({ ...ITEMS.whiskey, hint: 'Hold [F] to drink' });
  hud.setInventory(inventory, ITEMS);
  showKit(true);
  hud.toast('On the house. Loudly.', 'good');
  mission.drank?.();
}

function startShotBeat() {
  if (game.booskiShotDone || game.beat || game.over) return;
  game.booskiShotDone = true;
  game.shotSunk = false;
  const bartender = cast.byName.bartender;
  if (!bartender) return;
  const booski = family.byId.booski;
  const station = {
    x: bartender.group.position.x,
    z: bartender.group.position.z,
    yaw: bartender.group.rotation.y,
    job: bartender.job,
    speed: bartender.speed,
  };
  const hijacked = player.mode === 'walk';
  if (hijacked) {
    player.mode = 'frozen';
    interaction.setPaused(true);
    hud.hidePrompt();
  }
  bartender.job = 'patrol';
  bartender.speed = 2.3;      // thirty FUCKING seconds — he hustles
  bartender.route = [{ x: SHOT_BAR_STAND.x, z: SHOT_BAR_STAND.z }];
  bartender.routeAt = 0;
  let phase = 'to-bar';
  let t = 0;

  /* ---- the framing ----
   * The shot starts where a shot should start: on the bar, on Booski, and
   * on the glass. The aim point only follows the bartender once he comes
   * close enough to be worth looking at, and the yaw is slew-limited, so
   * from any starting view it is a pan rather than a cut. */
  const aim = new THREE.Vector3(
    club.anchors.barService.x,
    1.35,
    booski ? booski.position.z : club.anchors.barService.z,
  );
  const openAim = aim.clone();
  const MAX_SLEW = 1.5;               // radians a second; a head turn, not a snap
  const frameOn = (tx, tz, dt2, lead = 3.0) => {
    const wantYaw = Math.atan2(-(tx - player.position.x), -(tz - player.position.z));
    const dy = Math.atan2(Math.sin(wantYaw - player.yaw), Math.cos(wantYaw - player.yaw));
    const step = dy * Math.min(1, dt2 * lead);
    player.yaw += Math.abs(step) > MAX_SLEW * dt2 ? Math.sign(step) * MAX_SLEW * dt2 : step;
    player.pitch += (-0.04 - player.pitch) * Math.min(1, dt2 * 2.4);
  };

  game.beat = (dt) => {
    t += dt;
    const bp = bartender.group.position;
    if (phase === 'to-bar') {
      if (hijacked) {
        /* Hold the bar, then hand the frame over to the man with the tray as
         * he comes into it. `near` is 1 when he is on top of the delivery. */
        const away = Math.hypot(bp.x - openAim.x, bp.z - openAim.z);
        const near = Math.min(1, Math.max(0, (9 - away) / 6));
        aim.set(
          openAim.x + (bp.x - openAim.x) * near,
          1.35,
          openAim.z + (bp.z - openAim.z) * near,
        );
        frameOn(aim.x, aim.z, dt, 2.4 + near * 1.6);
      }
      const d = Math.hypot(bp.x - SHOT_BAR_STAND.x, bp.z - SHOT_BAR_STAND.z);
      if (d < 0.6 || t > 16) {
        if (t > 16) bartender.group.position.set(SHOT_BAR_STAND.x, 0, SHOT_BAR_STAND.z);
        phase = 'handoff';
        t = 0;
        bartender.job = 'stand';
        bartender.faceToward(
          booski ? booski.position.x : player.position.x,
          booski ? booski.position.z : player.position.z,
        );
        audio.play('glass.set', { volume: 0.55, position: club.anchors.barService });
        giveShot();
        /* Control back BEFORE the toast -- the club's rule is that nobody
         * important talking ever costs you the sticks. */
        if (hijacked) {
          player.mode = 'walk';
          interaction.setPaused(false);
        }
        if (booski) dialogue.start(familyScripts.booskiShot, 'handoff', booski);
      }
    } else if (phase === 'handoff') {
      /* "Drink, baby." So he drinks it. The drink system does the work --
       * same pose, same units, same swallow as holding [F] -- and the player
       * has had the sticks back since the glass landed, so anybody who would
       * rather keep it can simply walk off with it. */
      if (t > 1.9 && !game.shotSunk && game.heldDrink === 'whiskey') {
        game.shotSunk = true;
        game.autoDrink = DRINK_TIME + 0.35;
        mission.flags.tookShot = true;
      }
      if (t > 2.2) {
        phase = 'return';
        t = 0;
        bartender.job = 'patrol';
        bartender.route = [{ x: station.x, z: station.z }];
        bartender.routeAt = 0;
      }
    } else if (phase === 'return') {
      const d = Math.hypot(bp.x - station.x, bp.z - station.z);
      if (d < 0.7 || t > 24) {
        bartender.group.position.set(station.x, 0, station.z);
        bartender.job = station.job;
        bartender.folded = false;
        bartender.speed = station.speed ?? bartender.speed;
        bartender.group.rotation.y = station.yaw;
        bartender.targetYaw = undefined;
        game.beat = null;
      }
    }
  };
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

/**
 * Bank the second visit's assignment.
 *
 * Idempotent and total: a mission that is already complete with an
 * assignment on it is a success, not an error, and a mission with no
 * assignment is a bug worth a console line rather than an exception thrown
 * out of a requestAnimationFrame callback where nothing can catch it.
 */
function recordSecondVisit() {
  if (!isSecondVisit) return true;
  const saved = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  if (saved.status === 'complete' && saved.assignment) return true;
  if (secondVisitStory.complete({ assignment: mission.assignment })) return true;
  console.error('[bing] Scene Two ended without a durable assignment',
    { status: saved.status, assignment: mission.assignment });
  return false;
}

function driveAway() {
  if (game.over) return;
  game.over = true;
  // Bank it before the car moves, so the record cannot depend on a tween.
  recordSecondVisit();
  interaction.setPaused(true);
  player.mode = 'frozen';
  audio.play('car.engine.start', { volume: 0.7 });
  audio.startLoop('car.engine.idle', { volume: 0.25 });
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
        + 'Snow is already outside the Jerky Motel with the payment, and the apartment is not on the route.',
    }
    : (ENDINGS[kind] || ENDINGS.followed);
  if (isSecondVisit) {
    /* Recorded on the way out of the lot, not here.
     *
     * This used to call complete() and THROW when it returned false -- from
     * inside the rAF closure that drives the car out, which killed the frame
     * loop before the ending card was ever appended. complete() returns
     * false for two entirely ordinary reasons (the mission is already
     * complete, or this is a second call), so the gate failed at whatever
     * point the race happened to land. The write now happens once, in
     * driveAway(), and reaching the card is not conditional on it. */
    recordSecondVisit();
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

/* Drag-look is a FALLBACK, never a life sentence: every attempt asks the
 * browser for real pointer lock again, and the moment one succeeds the drag
 * mode retires itself. Losing lock once (an alt-tab, an overlay, a denied
 * request) used to latch dragLook forever and no click could undo it. */
let dragLookHinted = false;

function requestLock() {
  const p = canvas.requestPointerLock?.();
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (document.pointerLockElement !== canvas && !game.paused) fallBackToDragLook();
  }, 600);
}

function fallBackToDragLook() {
  if (document.pointerLockElement === canvas) return;
  if (!dragLook && !dragLookHinted) {
    dragLookHinted = true;
    hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em> '
      + 'Any click keeps retrying the real thing.', 7000);
  }
  dragLook = true;
  enableInput();
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) dragLook = false;   // the real thing won; retire the fallback
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
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  player.setKey(e.code, true);

  if (e.code === 'KeyE') {
    /* The phone takes [E] first while it is out. Same rule as the flat: a
     * ringing phone is the most interactive thing in the room. */
    if (game.phoneUp) {
      if (phone.ringing) phone.answer();
      else phone.press();
      paintPhone();
      paintKit();
      return;
    }
    // At the table and the machine, E is the game's own button
    if (game.seatedIn === 'table' && blackjack.state !== 'off' && !interaction.current) {
      if (blackjack.state === 'bet') {
        blackjack.deal();
        /* Still on 'bet' means it refused the hand, which at this table only
         * ever means he cannot cover it -- so the dealer says the one thing a
         * croupier says to a man sitting at the felt without the minimum. */
        if (blackjack.state === 'bet') tableSay('bj.dealer.minimum', { gap: 12 });
        else {
          /* The authored deal barks ("Cards comin' in." / "Good luck,
           * prospect.") lead once generated; the older patter stands in
           * until then. say() never repeats the same one twice running. */
          tableSayFirst([
            ['bing.blackjack.dealer.deal', { gap: 8 }],
            ['bj.dealer.deal', { chance: 0.35, gap: 9 }],
          ]);
        }
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
    if (game.phoneUp) {
      if (phone.call) phone.hangUp();
      else showPhone(false);
      paintPhone();
      return;
    }
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
  if (e.code === 'KeyI') showKit(!game.kitOpen);
  if (e.code === 'KeyP') showPhone(!game.phoneUp);
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
window.addEventListener('wheel', (e) => {
  if (!game.phoneUp || (phone.screen !== 'messages' && phone.screen !== 'thread')) return;
  e.preventDefault();
  phone.cycle(e.deltaY > 0 ? 1 : -1);
  paintPhone();
}, { passive: false });
window.addEventListener('blur', () => { keys.clear(); player.clearKeys(); });

canvas.addEventListener('click', () => {
  if (!game.started || game.paused) return;
  // Every canvas click while unlocked re-attempts REAL pointer lock, even
  // from drag-look -- the browser may grant it now that this is a fresh
  // user gesture, and pointerlockchange retires the fallback when it does.
  if (document.pointerLockElement !== canvas) requestLock();
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
    if (campaign.state.scene.id !== activeSceneId) {
      campaign.enter(activeSceneId, { spawn: 'driver_seat' });
    }
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
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
    audio.startLoop('ambience.bing.rain.muffled', { volume: 0, ambience: true, fade: 1.5 });
    audio.startLoop('ambience.club', { volume: 0.04 * BED_UNDER_RECORD, ambience: true, fade: 2 });
    audio.startLoop('ambience.crowd', { volume: 0.02, ambience: true, fade: 2 });
    // The record actually playing on the floor tonight, from the DJ booth.
    const clubRecord = nextClubDjRecord();
    game.clubRecord = clubRecord.file;
    audio.startMusicLoop('music.club', `assets/music/${clubRecord.file}`, {
      volume: 0.04, ambience: true, position: club.anchors.dj, ref: 3.5, maxDist: 34, fade: 2,
    });
    // Lou's radio plays his old stuff all night; the panner does the
    // round-the-corner falloff on its own.
    audio.startMusicLoop('office.radio', 'assets/music/good-ole-days.mp3', {
      volume: 0.22, ambience: true, position: club.anchors.officeRadio, ref: 0.8, maxDist: 9,
    });
    audio.startLoop('car.engine.idle', { volume: 0.22, ambience: false });
    audio.startLoop('car.radio', { name: 'radio.talk', volume: 0.3 });
    game.radioOn = true;
    getInCar();
    addMoney(0);
    game.hudReady = true;
    repaintObjectives();
    showKit(true);
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

    /* Rain through the brick. `ambience.rain` is rain you are STANDING in,
     * and indoors it has to be turned down so far that what is left of it is
     * hiss -- the "static" the owner could not place. The muffled bed is the
     * low half of the same storm with nothing above 400Hz, so it can sit at
     * an audible level in here and still read as weather. */
    const rainThrough = !inside ? 0
      : next === 'vestibule' ? 0.14
        : next === 'main' ? 0.05
          : next === 'hallway' ? 0.1
            : 0.08;
    audio.setLoopVolume('ambience.bing.rain.muffled', rainThrough, 0.8);

    // The club: the whole point of the wall between the hallway and the floor
    const music = next === 'main' ? 0.5
      : next === 'vestibule' ? (innerOpen ? 0.4 : 0.2)
        : next === 'hallway' ? 0.17
          : next === 'office' ? (officeDoorOpen ? 0.16 : 0.07)
            : next === 'bathroom' || next === 'storage' ? 0.1
              : 0.05;
    const crowd = next === 'main' ? 0.32 : next === 'vestibule' ? 0.14 : 0.04;
    /* There is a REAL record on the deck now (music.club, from the DJ
     * booth), and the synthesised club bed predates it. Left at full level
     * the two of them play different music at each other, and the bed's 52Hz
     * kick is the "loud humming" -- so the bed drops to a sub you feel under
     * the record rather than a second band you hear over it. The crowd's
     * filtered noise comes down for the same reason: at a third of the mix
     * two hundred inaudible people are indistinguishable from tape hiss. */
    audio.setLoopVolume('ambience.club', music * BED_UNDER_RECORD, 0.7);
    audio.setLoopVolume('ambience.crowd', crowd * 0.5, 0.7);
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
    hud.say('Big Uncle Lou is at the desk. <kbd>E</kbd> when you are ready to talk.', 4600);
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
  if (next === 'vestibule' && mission.readyToLeave && !game.leaveHinted) {
    game.leaveHinted = true;
    hud.say('Out the front and into the rain. <em>Hold [E] at the door to leave, or take the wheel in the lot.</em>', 5600);
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
    audio.setLoopVolume('ambience.club', 0.02, 0.2);
    audio.setLoopVolume('music.club', 0.08, 0.2);
    setTimeout(() => {
      audio.setLoopVolume('ambience.club', 0.5 * BED_UNDER_RECORD, 1.2);
      audio.setLoopVolume('music.club', 0.45, 1.2);
    }, 1400);
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

/* Patrons say things as you go past, and never the same thing twice running.
 * Never while somebody is actually talking to you, and never in the first
 * couple of seconds after a conversation closes either -- a background remark
 * landing on the last line of a conversation is the pile-up the owner
 * flagged, and it reads as the person you were talking to saying it. */
function ambientChatter(dt) {
  game.ambientAt -= dt;
  if (dialogue.active) {
    game.ambientAt = Math.max(game.ambientAt, 3);
    return;
  }
  if (game.ambientAt > 0) return;
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

/**
 * The clock, everywhere at once.
 *
 * The HUD read 6:04 AM in a club whose own title card says 11:41 PM, because
 * driving to the Bing never told the campaign that any time had passed --
 * the arrival was recorded when you LEFT. The travel event is applied on the
 * way in now (see below), and the wall clocks behind the bar and over Lou's
 * desk are hung off the same number, so the room and the HUD cannot disagree.
 */
function paintCampaignClock() {
  const story = campaign.state.story;
  const hour24 = Math.floor(story.timeMinutes / 60) % 24;
  const minute = story.timeMinutes % 60;
  const hour12 = hour24 % 12 || 12;
  const time12 = `${hour12}:${String(minute).padStart(2, '0')} `
    + `${hour24 >= 12 ? 'PM' : 'AM'}`;
  hud.setClock(story.day, time12, game.elapsed);
  if (game.shownClock !== story.timeMinutes) {
    game.shownClock = story.timeMinutes;
    club.setClock(hour24, minute);
  }
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
  focusTick(raw);
  fxDrunk.style.setProperty('--blur', `${drunk.blur.toFixed(2)}px`);
  fxDrunk.style.setProperty('--vig', drunk.vignette.toFixed(3));
  fxDrunk.style.setProperty('--warm', drunk.warmth.toFixed(3));

  player.update(dt);
  if (game.drive) game.drive(raw);
  if (game.beat) game.beat(raw);
  interaction.update(dt);
  club.update(dt, player.position);
  slots.update(dt);
  blackjack.update(dt);
  dialogue.update(dt, player.position);
  if (dialogue.active) layoutTalk();
  phoneTick(raw);
  objectivesTick();
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
  family, familyScripts, faceIndex,
  isSecondVisit, secondVisitStory,
  phone, phoneStory, spokeTo, stageTalk, voiceCue,
  updateZones, standingClearAt, findSafeStandSpot, recoverIfStuck,
  paintKit, showKit, showPhone, repaintObjectives, optionalObjectives,
  startFocus, focusTick, moneyBurst, noteSpokeTo,
  teleport(x, z, yaw = 0) {
    player.mode = 'walk';
    player.position.set(x, 1.66, z);
    player.yaw = yaw;
    player.velocity.set(0, 0, 0);
    player.update(0.016);
  },
};
frame();

/**
 * A Morning at Silver Pines — entry point.
 *
 * Same engine as the flat, the club and the Silver Room: the first-person
 * controller, the look-at interaction system, the HUD, the audio engine and
 * the non-modal dialogue box all come out of `src/core` and `src/bing`. What
 * is new is a golf course, a ball, and three men who will wait as long as it
 * takes for you to hit it.
 *
 * The camera is the thing worth reading carefully. He is first-person the
 * whole morning — walking, standing over the ball, and sitting in the cart
 * while Lou says the only important thing anybody says. The one time the view
 * leaves his eyes is to follow a struck ball, and it comes straight back.
 */

import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { SCENE_IDS, createCampaign, navigateCampaign } from '../core/campaign.js';
import { createGolfStory } from '../core/golf-story.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';

import { Course } from './terrain.js';
import { Golfer, makeBag, makeBall } from './cast.js';
import { CartPair } from './carts.js';
import { CueQueue, Dialogue, numberKeyOwner } from './dialogue.js';
import { Round, BEAT } from './mission.js';
import { Swing, SWING_PHASE, DEAD_ZONE } from './swing.js';
import { CLUB_IDS, getClub, estimateCarry } from './clubs.js';
import { BALL_STATE, solveShot } from './ball.js';
import {
  SURFACE, surfaceProps, toYards, toFeet, getHole, HOLES, relativeLabel, scoreName,
} from './course.js';
import { heightAt, surfaceAt } from './field.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { HOLE, builtHoles } from './hole.js';
import {
  CourseAudio, GOLF_LATER_AUDIO_SCOPES, GOLF_START_AUDIO_SCOPE,
  playRecordedGolfChoice, playRecordedGolfCue, recordedGolfClip,
} from './audio.js';
import { completedRoundAction, connectGolfFootsteps } from './runtime.js';

/* ------------------------------------------------------------------ */
/* Campaign                                                            */
/* ------------------------------------------------------------------ */

const campaign = createCampaign();
const story = createGolfStory({ campaign });

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');

const ui = {
  card: document.getElementById('golfcard'),
  hole: document.querySelector('#golfcard .hole'),
  par: document.querySelector('#golfcard .par'),
  strokes: document.querySelector('#golfcard .strokes'),
  pin: document.querySelector('#golfcard .pin'),
  shot: document.getElementById('shot'),
  club: document.querySelector('#shot .club'),
  carry: document.querySelector('#shot .carry'),
  lie: document.querySelector('#shot .lie'),
  wind: document.querySelector('#shot .wind'),
  meter: document.getElementById('meter'),
  meterFill: document.querySelector('#meter .fill'),
  meterMark: document.querySelector('#meter .mark'),
  meterLine: document.querySelector('#meter .line'),
  meterHint: document.querySelector('#meter .hint'),
  aim: document.getElementById('aim'),
  dialogue: {
    root: document.getElementById('dialogue'),
    name: document.querySelector('#dialogue .who'),
    line: document.querySelector('#dialogue .line'),
    options: document.querySelector('#dialogue .options'),
  },
  endcard: document.getElementById('endcard'),
};

const stage = (t) => window.__squatchStage?.(t);

function paintSavedRoundHint() {
  const progress = story.mission;
  if (progress?.status !== 'in_progress' || !Array.isArray(progress.holes)) return;
  const finished = new Set(progress.holes.map((entry) => Number(entry.hole)));
  const next = builtHoles().find((number) => !finished.has(number));
  if (!next) return;
  const hole = getHole(next);
  const fine = overlay?.querySelector('.fine');
  if (fine) fine.textContent = `Your first ${finished.size} hole${finished.size === 1 ? ' is' : 's are'} already on Lou’s card.`;
  if (startBtn) startBtn.textContent = `Resume · Hole ${hole?.number ?? next}`;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  window.__squatchSceneFail?.('This machine cannot open WebGL', String(err?.message || err));
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.08, 700);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

stage('Opening the gate…');
const course = new Course(scene, renderer, { onProgress: stage });

stage('Rounding up the foursome…');
const golfers = {
  [CHARACTER_IDS.LOU]: new Golfer(scene, CHARACTER_IDS.LOU, { ...HOLE.lot.lou, yaw: Math.PI }),
  [CHARACTER_IDS.RIPPINFLOW]: new Golfer(scene, CHARACTER_IDS.RIPPINFLOW, { ...HOLE.lot.rippinflow, yaw: Math.PI }),
  [CHARACTER_IDS.ERIC]: new Golfer(scene, CHARACTER_IDS.ERIC, { ...HOLE.lot.eric, yaw: Math.PI }),
};

const carts = new CartPair(scene);
carts.parkInLot(HOLE.lot.carts);

const bag = makeBag(scene, HOLE.lot.bag.x, HOLE.lot.bag.z, 0.4);
const ballMeshes = new Map();
for (const id of [CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.ERIC]) {
  ballMeshes.set(id, makeBall(scene, 0xeef0f4));
}
const playerBallMesh = makeBall(scene, 0xffffff);
ballMeshes.set(CHARACTER_IDS.PROSPECT, playerBallMesh);

/* ------------------------------------------------------------------ */
/* Player, HUD, audio                                                  */
/* ------------------------------------------------------------------ */

const hud = new Hud();
const audio = new AudioEngine();
const player = new Player(camera, course);
player.position.set(HOLE.lot.playerStart.x, 1.66, HOLE.lot.playerStart.z);
player.yaw = Math.PI;
player.mode = 'walk';

const interaction = new InteractionSystem(camera, hud);

let courseAudio = null;
connectGolfFootsteps(player, () => courseAudio);
let activeVoice = null;
const cues = new CueQueue({
  say: (cue, secs) => {
    const who = cue.speaker === CHARACTER_IDS.PROSPECT ? 'Prospect'
      : golfers[cue.speaker]?.name ?? '';
    hud.say(`<em>${who}</em> ${cue.text}`, secs * 1000);
    golfers[cue.speaker]?.say(secs);
    activeVoice?.stop?.();
    activeVoice = playRecordedGolfCue(audio, cue.id, {
      volume: 0.88,
      position: golfers[cue.speaker]?.position ?? null,
      ref: 2.2,
      maxDist: 34,
    });
    courseAudio?.duck(true);
  },
  clear: (reason) => {
    if (reason === 'interrupted' || reason === 'reset') activeVoice?.stop?.();
    courseAudio?.duck(false);
  },
  /* Recorded performance owns subtitle timing; reading speed is the fallback. */
  clipLength: (id) => {
    const clip = recordedGolfClip(audio, id);
    return clip?.duration ?? null;
  },
});

const dialogue = new Dialogue(ui.dialogue, {
  onChoice: (option) => {
    audio.play('ui.select', { volume: 0.4 });
    activeVoice?.stop?.();
    activeVoice = playRecordedGolfChoice(audio, option, { volume: 0.92 });
  },
  cueSeconds: (cueId) => recordedGolfClip(audio, cueId)?.duration ?? 0,
  onEnd: () => { cues.suppressBanter(false); },
});

/* ------------------------------------------------------------------ */
/* The round                                                           */
/* ------------------------------------------------------------------ */

let ended = false;
const round = new Round({
  cues,
  dialogue,
  golfers,
  carts,
  audio: null,        // set once the engine is ready
  missions: campaign.state.missions,
  hooks: {
    onToast: (text) => hud.toast(text),
    onStroke: () => paintCard(),
    onBag: () => syncGolfInventory(),
    onBallEvent: (kind, data) => {
      if (kind === 'stop' && data.id === CHARACTER_IDS.PROSPECT) paintCard();
    },
    onHoleComplete: (summary, next) => showHoleCard(summary, next),
    onLoadHole: (n) => course.load(n),
    onRoundComplete: (summary) => showEndCard(summary),
  },
});

/* ------------------------------------------------------------------ */
/* Camera modes                                                        */
/* ------------------------------------------------------------------ */

const CAM = { WALK: 'walk', ADDRESS: 'address', FLIGHT: 'flight', CART: 'cart' };
let camMode = CAM.WALK;
let aimYaw = Math.PI;
const swing = new Swing();
let club = 'iron';
let flightTimer = 0;
const _v = new THREE.Vector3();
const _look = new THREE.Vector3();

const sceneInventory = new SceneInventoryBar({
  slots: 5,
  visible: false,
  catalog: {
    driver: { icon: 'D', name: 'Driver' },
    iron: { icon: 'I', name: 'Iron' },
    putter: { icon: 'P', name: 'Putter' },
  },
});

function syncGolfInventory() {
  const selected = Math.max(0, CLUB_IDS.indexOf(club));
  sceneInventory.set(round.hasBag ? CLUB_IDS : [], selected);
}

function selectClub(id, { sound = false } = {}) {
  if (!CLUB_IDS.includes(id)) return false;
  club = id;
  syncGolfInventory();
  if (sound) audio.play('golf.bag', { volume: 0.4 });
  paintShot();
  return true;
}

function ballPos() {
  const b = round.playerBall.position;
  return _v.set(b.x, b.y, b.z);
}

/** Stand over it: eye down, club out, and the group still in shot. */
function enterAddress() {
  if (!round.canAddress()) return false;
  camMode = CAM.ADDRESS;
  player.enabled = false;
  player.mode = 'frozen';
  swing.reset();
  const b = round.playerBall.position;
  aimYaw = Math.atan2(HOLE.pin.x - b.x, HOLE.pin.z - b.z);
  ui.shot.classList.remove('hidden');
  ui.aim.classList.remove('hidden');
  hud.hidePrompt();
  return true;
}

function leaveAddress() {
  camMode = CAM.WALK;
  player.enabled = true;
  player.mode = 'walk';
  swing.reset();
  ui.shot.classList.add('hidden');
  ui.meter.classList.add('hidden');
  ui.aim.classList.add('hidden');
  // Stand where he was standing, beside the ball.
  const b = round.playerBall.position;
  player.position.x = b.x - Math.sin(aimYaw) * 0.9;
  player.position.z = b.z - Math.cos(aimYaw) * 0.9;
  player.yaw = aimYaw;
}

function applyAddressCamera() {
  const b = round.playerBall.position;
  /* Behind and above the ball, looking down the line he is aiming. Low enough
   * to read the slope, high enough to still see the green. */
  const back = 1.25;
  const x = b.x - Math.sin(aimYaw) * back;
  const z = b.z - Math.cos(aimYaw) * back;
  camera.position.set(x, heightAt(x, z) + 1.52, z);
  _look.set(b.x + Math.sin(aimYaw) * 8, b.y + 0.9, b.z + Math.cos(aimYaw) * 8);
  camera.lookAt(_look);
}

function applyFlightCamera(dt) {
  const b = round.playerBall.position;
  /* Behind and slightly above, easing rather than snapping. Never spins, never
   * whips: the player has to be able to read where it is going. */
  const target = _v.set(
    b.x - Math.sin(aimYaw) * 9,
    Math.max(heightAt(b.x, b.z) + 3.2, b.y + 2.6),
    b.z - Math.cos(aimYaw) * 9,
  );
  camera.position.lerp(target, Math.min(1, dt * 3.4));
  camera.lookAt(b.x, b.y + 0.4, b.z);
}

function applyCartCamera() {
  carts.lead.seatWorld('passenger', _v);
  camera.position.copy(_v);
  /* He keeps the look. The cart decides where he is, never where he is
   * looking — that is the whole reason this is not a cutscene. */
  const e = new THREE.Euler(player.pitch, carts.lead.group.rotation.y + player.yawOffset, 0, 'YXZ');
  camera.quaternion.setFromEuler(e);
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

function paintCard() {
  const hole = getHole(HOLE.number);
  const h = round.card.hole(CHARACTER_IDS.PROSPECT, HOLE.number);
  ui.hole.textContent = `HOLE ${hole.number} · ${hole.name.toUpperCase()}`;
  ui.par.textContent = `PAR ${hole.par} · ${hole.yards} YDS`;
  ui.strokes.textContent = h ? `${h.strokes}` : '0';
  const d = round.distanceToPin();
  ui.pin.textContent = d < 27 ? `${Math.round(toFeet(d))} ft` : `${Math.round(toYards(d))} yds`;
}

function paintShot() {
  const c = getClub(club);
  const surface = round.playerSurface();
  const lie = surfaceProps(surface);
  ui.club.textContent = c.name.toUpperCase();
  ui.lie.textContent = lie.label;
  ui.wind.textContent = `${HOLE.wind.mph} MPH ${HOLE.wind.label}`;
  const power = swing.phase === SWING_PHASE.IDLE ? 1 : Math.max(swing.power, swing.marker);
  const est = estimateCarry(club, power, lie);
  ui.carry.textContent = c.grounded
    ? `≈ ${Math.round(toFeet(est))} ft`
    : `≈ ${Math.round(toYards(est))} yds`;
}

/**
 * The aim indicator.
 *
 * A cone, not a line. The player is shown roughly where this club off this lie
 * tends to finish, and never a guaranteed trajectory — an exact laser removes
 * the judgement, and the judgement is the game.
 */
function paintAim() {
  const c = getClub(club);
  const lie = surfaceProps(round.playerSurface());
  const spreadDeg = c.dispersion * 0.8 + lie.spread;
  ui.aim.style.setProperty('--spread', `${Math.min(46, spreadDeg * 3.4)}px`);
  const b = round.playerBall.position;
  const toPin = Math.atan2(HOLE.pin.x - b.x, HOLE.pin.z - b.z);
  let off = ((aimYaw - toPin) * 180) / Math.PI;
  while (off > 180) off -= 360;
  while (off < -180) off += 360;
  ui.aim.querySelector('.label').textContent = Math.abs(off) < 1
    ? 'AT THE PIN'
    : `${Math.abs(off).toFixed(0)}° ${off > 0 ? 'RIGHT' : 'LEFT'}`;
}

/* The meter runs from the late end of the strike sweep to full power, not from
 * zero to full power.
 *
 * The strike marker travels past the line into negative territory, and mapping
 * that onto a bar that starts at zero clamps it — so the marker parked at the
 * left edge and being *late* looked identical to being perfect. The whole
 * point of the third click is that you can see yourself miss it. */
const METER_FLOOR = -0.30;
const meterPct = (v) => `${Math.max(0, Math.min(100,
  ((v - METER_FLOOR) / (1 - METER_FLOOR)) * 100))}%`;

function paintMeter() {
  if (!swing.active && swing.phase !== SWING_PHASE.DONE) {
    ui.meter.classList.add('hidden');
    return;
  }
  ui.meter.classList.remove('hidden');

  const striking = swing.phase !== SWING_PHASE.POWER;
  ui.meterFill.style.width = meterPct(striking ? swing.power : swing.marker);
  ui.meterMark.style.left = meterPct(swing.marker);

  /* The forgiving middle, drawn where it actually is, so a player can see the
   * size of the target he is being given rather than having to infer it. */
  ui.meterLine.style.left = meterPct(-DEAD_ZONE);
  ui.meterLine.style.width =
    `${((DEAD_ZONE * 2) / (1 - METER_FLOOR)) * 100}%`;

  ui.meterHint.textContent = swing.phase === SWING_PHASE.POWER
    ? 'CLICK: POWER'
    : swing.phase === SWING_PHASE.STRIKE ? 'CLICK: STRIKE' : swing.strikeLabel();
  ui.meter.classList.toggle('strike', swing.phase === SWING_PHASE.STRIKE);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

player.yawOffset = 0;

function fireSwing() {
  const result = swing.result;
  swing.reset();
  ui.meter.classList.add('hidden');
  const shot = round.playerSwing({
    club, power: result.power, accuracy: result.accuracy, aim: aimYaw,
  });
  if (!shot) return;
  camMode = CAM.FLIGHT;
  flightTimer = 0;
  ui.shot.classList.add('hidden');
  ui.aim.classList.add('hidden');
  hud.toast(swing.strikeLabel ? '' : '');
}

function onClick() {
  if (camMode !== CAM.ADDRESS) return;
  const phase = swing.click();
  if (phase === SWING_PHASE.DONE) fireSwing();
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (document.pointerLockElement !== canvas) return;
  if (camMode === CAM.ADDRESS) { onClick(); return; }
  interaction.press();
});
window.addEventListener('mouseup', () => interaction.release());

window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (camMode === CAM.ADDRESS) {
    // Aim only. He does not move his feet while he is over the ball.
    aimYaw -= e.movementX * 0.0016;
    return;
  }
  if (camMode === CAM.CART) {
    player.yawOffset -= e.movementX * 0.0022;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - e.movementY * 0.0022));
    return;
  }
  player.handleMouseMove(e.movementX, e.movementY);
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  /* The one input rule that matters. Number keys pick a reply when replies are
   * on screen and pick a club when they are not — never both. */
  if (/^Digit[1-9]$/.test(e.code)) {
    if (numberKeyOwner(dialogue) === 'dialogue') {
      dialogue.choose(Number(e.code.slice(5)) - 1);
      e.preventDefault();
      return;
    }
    const idx = Number(e.code.slice(5)) - 1;
    if (idx < CLUB_IDS.length && round.hasBag) {
      selectClub(CLUB_IDS[idx], { sound: true });
      if (club === 'driver' && round.beat === BEAT.PLAYER_TEE) {
        cues.playSequence('bark.driver_on_par_three');
      }
    }
    return;
  }

  switch (e.code) {
    case 'KeyE':
      if (camMode === CAM.ADDRESS) return;
      if (round.canAddress() && nearBall()) { enterAddress(); return; }
      interaction.press();
      break;
    case 'Escape':
      if (camMode === CAM.ADDRESS) { leaveAddress(); return; }
      document.exitPointerLock?.();
      break;
    case 'KeyQ':
      if (camMode === CAM.ADDRESS) leaveAddress();
      break;
    case 'KeyR':
      if (round.needsRelief()) round.takeDrop(
        round.playerBall.state === BALL_STATE.OUT_OF_BOUNDS ? 'oob' : 'water',
      );
      break;
    case 'KeyF':
      if (round.requestSkip()) hud.toast('Skipping ahead.');
      break;
    case 'KeyM':
      audio.setMasterVolume(audio.muted ? 1 : 0);
      audio.muted = !audio.muted;
      hud.toast(audio.muted ? 'Muted' : 'Sound on');
      break;
    default:
      player.setKey(e.code, true);
  }
});

window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});

function nearBall() {
  const b = round.playerBall.position;
  return Math.hypot(player.position.x - b.x, player.position.z - b.z) < 2.6;
}

/* ------------------------------------------------------------------ */
/* Interactables                                                       */
/* ------------------------------------------------------------------ */

interaction.register(bag, {
  label: () => (round.hasBag ? 'Three clubs. That is the bag.' : 'Take the <b>bag</b>'),
  enabled: () => !round.hasBag,
  onUse: () => round.takeBag(),
});

interaction.register(course.marker, {
  label: () => {
    const hole = getHole(HOLE.number);
    return hole
      ? `HOLE ${hole.number} · ${hole.name.toUpperCase()} · PAR ${hole.par} · ${hole.yards} YARDS`
      : 'SILVER PINES';
  },
  onUse: () => {
    const hole = getHole(HOLE.number);
    hud.say(hole
      ? `<em>Silver Pines</em> Hole ${hole.number}. ${hole.yards} yards. ${hole.blurb}`
      : '<em>Silver Pines</em>');
  },
});

/* ------------------------------------------------------------------ */
/* End card                                                            */
/* ------------------------------------------------------------------ */

/**
 * Between holes.
 *
 * The card goes up on the hole he has just played, the world is thrown away
 * and rebuilt behind the black, and he walks onto the next tee. This is the
 * only moment in the round the player is not in control, and it lasts exactly
 * as long as the fade.
 */
function showHoleCard(summary, next) {
  story.recordHole(round.persist());
  if (next === null) return;

  const card = ui.endcard;
  card.querySelector('.kicker').textContent = `HOLE ${summary.hole} COMPLETE`;
  card.querySelector('h1').textContent = (getHole(summary.hole)?.name ?? '').toUpperCase();
  card.querySelector('.result').textContent = scoreName(summary.strokes, summary.par);
  card.querySelector('.strokes').textContent =
    `${summary.strokes} strokes · ${relativeLabel(summary.toPar)}`;
  card.querySelector('.stats').textContent = holeStats(summary).join(' · ');
  const upcoming = getHole(next);
  card.querySelector('.next').innerHTML = upcoming
    ? `NEXT: ${upcoming.name.toUpperCase()}<br><span>PAR ${upcoming.par} · ${upcoming.yards} YARDS</span>`
    : '';
  card.querySelector('.actions').classList.add('hidden');
  card.classList.remove('hidden');

  player.enabled = false;
  running = false;
  window.setTimeout(() => {
    round.startHole(next);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    player.yaw = Math.atan2(PIN_X() - t.x, PIN_Z() - t.z) + Math.PI;
    selectClub('iron');
    camMode = CAM.WALK;
    player.mode = 'walk';
    player.enabled = true;
    running = true;
    ended = false;
    card.classList.add('hidden');
    card.querySelector('.actions').classList.remove('hidden');
    paintCard();
  }, 3400);
}

const PIN_X = () => HOLE.pin.x;
const PIN_Z = () => HOLE.pin.z;

function holeStats(summary) {
  const stats = [];
  if (summary.closestApproachFeet) stats.push(`Closest approach ${Math.round(summary.closestApproachFeet)} ft`);
  if (summary.longestShotYards) stats.push(`Longest shot ${Math.round(summary.longestShotYards)} yds`);
  if (summary.penalties) stats.push(`${summary.penalties} penalty stroke${summary.penalties > 1 ? 's' : ''}`);
  if (summary.hitGreenInRegulation) stats.push('Green in regulation');
  if (summary.heardInvitation) stats.push('“We invited you.”');
  return stats;
}

/**
 * The round is over.
 *
 * The card is the whole morning rather than the last hole: three lines, the
 * total, and what it came to against par. `story.complete()` is what finally
 * closes the mission — and it refuses a round of fewer than three holes, so
 * this is the only place the campaign learns he actually played golf with Lou
 * rather than being driven to a tee.
 */
function showEndCard(summary) {
  if (ended) return;
  ended = true;
  story.recordHole(round.persist());
  const closed = story.complete({ holes: summary.holes });

  const card = ui.endcard;
  card.querySelector('.kicker').textContent = closed
    ? 'THE ROUND' : `${summary.holes.length} HOLES PLAYED`;
  card.querySelector('h1').textContent = 'SILVER PINES';
  card.querySelector('.result').textContent = relativeLabel(summary.toPar);
  card.querySelector('.strokes').textContent =
    `${summary.strokes} strokes over ${summary.holes.length} hole${summary.holes.length === 1 ? '' : 's'}`;

  /* Everybody's card, because the argument about Rippin's five is the point
   * of keeping one at all. */
  card.querySelector('.stats').innerHTML = summary.lines
    .map((l) => `${l.card} ${l.strokes} (${l.label})`)
    .join(' &nbsp;·&nbsp; ');

  const built = round.holes.length;
  card.querySelector('.next').innerHTML = built < HOLES.length
    ? `${HOLES.length - built} HOLE${HOLES.length - built === 1 ? '' : 'S'} STILL TO BUILD<br>`
      + `<span>${HOLES.filter((h) => !h.playable).map((h) => h.name.toUpperCase()).join(' · ')}</span>`
    : 'THAT IS THE ROUND<br><span>SEVEN O\'CLOCK IS THE ROOM</span>';

  card.querySelector('.actions').classList.remove('hidden');
  const replay = document.getElementById('endcard-again');
  if (replay) replay.hidden = completedRoundAction() !== 'replay';
  card.classList.remove('hidden');
  document.exitPointerLock?.();
  player.enabled = false;
  audio.play('golf.cup', { volume: 0.5 });
}

const returnHome = () => {
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
};
document.getElementById('endcard-home')?.addEventListener('click', returnHome);
document.getElementById('endcard-again')?.addEventListener('click', () => {
  if (completedRoundAction() === 'replay') window.location.reload();
  else returnHome();
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let running = false;
let booting = false;
let paused = false;

function currentObjective() {
  switch (round.beat) {
    case BEAT.LOT: return 'Walk to the golf bag beside Erican and press E to pick it up.';
    case BEAT.WALK_TO_TEE: return 'Carry the bag from the car park to the first tee and join the group.';
    case BEAT.TEE_TALK: return dialogue.active
      ? 'Listen to Lou. When answers appear, press the matching number key.'
      : 'Stay with the group while the first-tee conversation finishes.';
    case BEAT.NPC_TEE: return 'Watch Erican, Rippin and Lou tee off. Press F only if you want to skip ahead.';
    case BEAT.PLAYER_TEE: return 'Walk to your ball, press E to address it, aim with the mouse, then click three times to swing.';
    case BEAT.TEE_RESULT: return 'Watch where your tee shot finishes, then follow the group to the carts.';
    case BEAT.CART: return 'Ride with Lou and listen. Number keys answer him when choices appear.';
    case BEAT.APPROACH: return 'Play your ball into the cup. Walk to it and press E before every shot.';
    case BEAT.HOLE_OUT:
    case BEAT.SCORECARD: return 'Wait for the group to finish the hole and mark the scorecard.';
    case BEAT.WALK_OFF: return 'Walk back to the carts to finish this hole.';
    case BEAT.NEXT_TEE: return 'The next tee is being set. The round will continue in a moment.';
    case BEAT.DONE: return 'The round is complete.';
    default: return 'Stay with Lou, Erican and Rippin and follow the current golf card.';
  }
}

const pauseMenu = createPauseMenu({
  title: 'A Morning at Silver Pines',
  canPause: () => running && !ended,
  getObjective: currentObjective,
  instructions: [
    'W A S D — walk. E or Click — interact.',
    'At your ball: E — address it. Q — back off.',
    '1 — driver. 2 — iron. 3 — putter.',
    'While addressing: mouse — aim; click — start, power, then strike.',
    'During dialogue: number keys — answer.',
    'R — take a drop. F — skip an NPC tee shot. M — mute.',
    'Tab — pause or resume.',
  ],
  onPause: () => {
    paused = true;
    player.clearKeys();
    player.enabled = false;
    interaction.release();
    interaction.setPaused(true);
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    paused = false;
    interaction.setPaused(false);
    player.enabled = camMode === CAM.WALK;
    audio.ctx?.resume?.();
    clock.getDelta();
    requestMouseCapture();
  },
  onRestart: () => window.location.reload(),
});

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!running) return;
  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  cues.update(dt);
  dialogue.update(dt, player.position);
  round.update(dt, player.position);
  courseAudio?.update(dt);

  // --- camera ---
  if (camMode === CAM.ADDRESS) {
    swing.update(dt);
    if (swing.phase === SWING_PHASE.DONE) fireSwing();
    applyAddressCamera();
    paintShot();
    paintAim();
    paintMeter();
  } else if (camMode === CAM.FLIGHT) {
    flightTimer += dt;
    applyFlightCamera(dt);
    /* Back to him once the ball has stopped and the eye has had a moment to
     * register where it finished. */
    if (!round.playerBall.moving && flightTimer > 1.4) leaveAddress();
  } else if (camMode === CAM.CART) {
    applyCartCamera();
    if (round.beat !== BEAT.CART) {
      camMode = CAM.WALK;
      player.enabled = true;
      player.mode = 'walk';
      player.yaw += player.yawOffset;
      player.yawOffset = 0;
      player.position.x = HOLE.cartPark.x + 1.6;
      player.position.z = HOLE.cartPark.z + 1.2;
    }
  } else {
    player.update(dt);
    interaction.update(dt);
    if (round.beat === BEAT.CART) {
      camMode = CAM.CART;
      player.enabled = false;
      player.mode = 'frozen';
      player.yawOffset = 0;
    }
  }

  // --- world ---
  course.update(dt, player.position);
  carts.update(dt);
  for (const g of Object.values(golfers)) g.update(dt, player.position);

  for (const [id, mesh] of ballMeshes) {
    const b = round.ballFor(id);
    if (!b) continue;
    mesh.position.set(b.position.x, b.position.y + 0.0213, b.position.z);
    mesh.visible = b.state !== BALL_STATE.WATER;
  }

  audio.updateListener(camera);
  paintCard();
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function requestMouseCapture() {
  try {
    /* Embedded browsers may reject pointer lock even after a user gesture.
     * That removes mouse-look, but it must not turn a successfully started
     * round into a fatal boot error. */
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    /* Pointer lock is optional; clicking the course can try again later. */
  }
}

const START_BLOCK_COPY = Object.freeze({
  already_complete: 'This morning is already on the card. Return to the apartment.',
  mission_locked: 'Lou has not invited you to Silver Pines yet. Return to the apartment and keep moving through the campaign.',
  silver_incomplete: 'Finish the Silver Room before this morning becomes available.',
  wrong_chapter: 'This is not the morning Lou invited you to Silver Pines.',
  lou_call_incomplete: 'Lou has not made the golf call yet. Return to the apartment.',
  travel_incomplete: 'Leave for Silver Pines through the apartment after Lou calls.',
  wrong_scene: 'This round must be resumed through the apartment door.',
  out_of_sequence: 'Silver Pines is not available from this point in the campaign.',
});

function showStartBlocked(result = {}) {
  const reason = result.reason || (result.unrouted ? 'out_of_sequence' : 'mission_locked');
  const panel = overlay?.querySelector('.panel');
  const tag = panel?.querySelector('.tag');
  const fine = panel?.querySelector('.fine');
  if (tag) tag.textContent = START_BLOCK_COPY[reason] || START_BLOCK_COPY.out_of_sequence;
  if (fine) fine.textContent = reason === 'already_complete'
    ? 'The completed round is saved. Continue from the apartment.'
    : 'No campaign progress was changed. Continue from the apartment when the invitation arrives.';
  if (startBtn) {
    startBtn.textContent = reason === 'already_complete' ? 'Round complete' : 'Scene locked';
    startBtn.disabled = true;
  }
  loading?.classList.add('hidden');
  overlay?.classList.remove('hidden');
  booting = false;
  window.__golfStartBlocked = reason;
  return { ok: false, reason };
}

function prefetchLaterGolfAudio() {
  void (async () => {
    for (const scope of GOLF_LATER_AUDIO_SCOPES) {
      await audio.loadAdditional?.(scope).catch?.(() => {});
    }
  })();
}

async function boot() {
  if (running || booting) return;
  booting = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Walking over…';

  /* This is the first campaign write. A bare URL, a locked save, or an
   * out-of-sequence scene stays on this card and leaves the save untouched. */
  const begun = story.begin();
  if (!begun.ok || begun.unrouted) return showStartBlocked(begun);
  if (campaign.state.scene.id !== SCENE_IDS.SILVER_PINES) {
    campaign.enter(SCENE_IDS.SILVER_PINES, { spawn: 'car_park' });
  }

  const resumeHole = begun.resumed ? round.restoreProgress(story.mission) : 1;
  if (begun.resumed && resumeHole === null) {
    story.complete({ holes: story.mission.holes });
    return showStartBlocked({ reason: 'already_complete' });
  }

  await audio.init?.().catch?.(() => {});
  await audio.loadManifest?.(GOLF_START_AUDIO_SCOPE).catch?.(() => {});
  courseAudio = new CourseAudio(audio);
  round.audio = courseAudio;
  courseAudio.start();

  if (begun.resumed && resumeHole > 1) {
    await audio.loadAdditional?.({ prefixes: [`vo.golf.h${resumeHole}.`] }).catch?.(() => {});
  }

  loading?.classList.add('hidden');
  overlay.classList.add('hidden');
  document.getElementById('hud')?.setAttribute('aria-hidden', 'false');
  ui.card.classList.remove('hidden');
  sceneInventory.show();
  syncGolfInventory();

  requestMouseCapture();
  player.enabled = true;
  if (begun.resumed && resumeHole > 1) {
    round.startHole(resumeHole);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    player.yaw = Math.atan2(PIN_X() - t.x, PIN_Z() - t.z) + Math.PI;
    selectClub('iron');
  } else {
    round.begin();
  }
  prefetchLaterGolfAudio();
  running = true;
  paintCard();
  booting = false;
  return begun;
}

startBtn?.addEventListener('click', () => { boot(); });
canvas.addEventListener('click', () => {
  if (running && !pauseMenu.isPaused() && document.pointerLockElement !== canvas && !ended) requestMouseCapture();
});

frame();

/* ------------------------------------------------------------------ */
/* Verification handle                                                 */
/* ------------------------------------------------------------------ */

/**
 * What `tools/verify-golf.mjs` drives.
 *
 * Deliberately the real objects rather than a parallel test API: a harness
 * that plays a copy of the game proves nothing about the game.
 */
window.__golf = {
  campaign, story, round, course, golfers, carts, cues, dialogue, swing,
  player, camera, scene, audio,
  get beat() { return round.beat; },
  get camMode() { return camMode; },
  get club() { return club; },
  setClub: (c) => selectClub(c),
  get aimYaw() { return aimYaw; },
  setAim: (a) => { aimYaw = a; },
  enterAddress,
  leaveAddress,
  boot,
  /** Take a shot without the meter, for the harness. */
  hit: (power, accuracy = 0) => round.playerSwing({ club, power, accuracy, aim: aimYaw }),
  /** The game's own shot solver, so a harness can aim the way an NPC does. */
  solve: (from, target, withClub = club) => solveShot({
    from, target, club: withClub, lie: surfaceProps(surfaceAt(from.x, from.z)),
  }),
  /* Everything the frame loop advances except rendering. It has to be
   * everything: a harness that steps the mission but not the men walking to
   * the tee is testing a game nobody is playing. */
  step: (dt) => {
    cues.update(dt);
    dialogue.update(dt, player.position);
    round.update(dt, player.position);
    carts.update(dt);
    for (const g of Object.values(golfers)) g.update(dt, player.position);
    courseAudio?.update(dt);
  },
  /* Take the transition without the fade, for a harness that runs faster than
   * real time. Same calls `showHoleCard` makes, minus the three seconds of
   * black nobody is watching. */
  advanceToNextHole: () => {
    const next = round.nextHoleNumber();
    if (next === null) return null;
    round.startHole(next);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    selectClub('iron');
    camMode = CAM.WALK;
    player.mode = 'walk';
    player.enabled = true;
    ended = false;
    return HOLE.number;
  },
  teleport: (x, z) => {
    player.position.x = x;
    player.position.z = z;
  },
  /* The live hole, so a harness driving hole three is not reading
   * hole one's pin. */
  get LAYOUT() { return HOLE; },
  HOLE, builtHoles,
  /* Load a hole for real: rebind the layout and rebuild the world. */
  loadHole: (n) => { course.load(n); return HOLE.number; },
  SURFACE, surfaceProps, heightAt, surfaceAt, toYards, toFeet,
};
/* The loading layer is above the opening card. Release it as soon as world
 * construction finishes so the card's user-gesture button can initialise
 * WebAudio and begin the round. */
loading?.classList.add('hidden');
paintSavedRoundHint();
startBtn?.removeAttribute('disabled');
window.__golfReady = true;

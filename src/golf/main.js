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

import { Course } from './terrain.js';
import { Golfer, makeBag, makeBall } from './cast.js';
import { CartPair } from './carts.js';
import { CueQueue, Dialogue, numberKeyOwner } from './dialogue.js';
import { Round, BEAT } from './mission.js';
import { Swing, SWING_PHASE, DEAD_ZONE } from './swing.js';
import { CLUB_IDS, getClub, estimateCarry } from './clubs.js';
import { BALL_STATE, solveShot } from './ball.js';
import {
  SURFACE, surfaceProps, toYards, toFeet, getHole, nextHole, relativeLabel, scoreName,
} from './course.js';
import { heightAt, surfaceAt } from './field.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { HOLE, setActiveHole, builtHoles } from './hole.js';

/* ------------------------------------------------------------------ */
/* Campaign                                                            */
/* ------------------------------------------------------------------ */

const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.SILVER_PINES) {
  campaign.enter(SCENE_IDS.SILVER_PINES, { spawn: 'car_park' });
}
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
  [CHARACTER_IDS.ERICAN]: new Golfer(scene, CHARACTER_IDS.ERICAN, { ...HOLE.lot.erican, yaw: Math.PI }),
};

const carts = new CartPair(scene);
carts.parkInLot(HOLE.lot.carts);

const bag = makeBag(scene, HOLE.lot.bag.x, HOLE.lot.bag.z, 0.4);
const ballMeshes = new Map();
for (const id of [CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.ERICAN]) {
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
const cues = new CueQueue({
  say: (cue, secs) => {
    const who = cue.speaker === CHARACTER_IDS.PROSPECT ? 'Prospect'
      : golfers[cue.speaker]?.name ?? '';
    hud.say(`<em>${who}</em> ${cue.text}`, secs * 1000);
    golfers[cue.speaker]?.say(secs);
    courseAudio?.duck(true);
  },
  clear: () => { courseAudio?.duck(false); },
  /* No clips exist yet, so subtitle reading time is what times every line.
   * The moment `assets/sfx/manifest.json` carries `vo.golf.*`, this starts
   * returning real durations and the timing follows the performance instead. */
  clipLength: (id) => {
    const buf = audio.buffers?.get?.(`vo.${id}`);
    return buf ? buf.duration : null;
  },
});

const dialogue = new Dialogue(ui.dialogue, {
  onChoice: () => { audio.play('ui.select', { volume: 0.4 }); },
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
    onBallEvent: (kind, data) => {
      if (kind === 'stop' && data.id === CHARACTER_IDS.PROSPECT) paintCard();
    },
    onEndCard: (summary) => showEndCard(summary),
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
  const hole = getHole(1);
  const h = round.card.hole(CHARACTER_IDS.PROSPECT, 1);
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
    ? 'AT THE HOLE.pin'
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
      club = CLUB_IDS[idx];
      audio.play('golf.bag', { volume: 0.4 });
      if (club === 'driver' && round.beat === BEAT.PLAYER_TEE) {
        cues.playSequence('bark.driver_on_par_three');
      }
      paintShot();
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
  label: () => 'HOLE 1 · THE INVITATION · PAR 3 · 167 YARDS',
  onUse: () => hud.say('<em>Silver Pines</em> One-sixty-seven. Water right, bunker left.'),
});

/* ------------------------------------------------------------------ */
/* End card                                                            */
/* ------------------------------------------------------------------ */

function showEndCard(summary) {
  if (ended) return;
  ended = true;
  story.recordHole(round.persist());

  const next = nextHole(1);
  ui.endcard.querySelector('.result').textContent = scoreName(summary.strokes, summary.par);
  ui.endcard.querySelector('.strokes').textContent =
    `${summary.strokes} strokes · ${relativeLabel(summary.toPar)}`;
  ui.endcard.querySelector('.next').innerHTML = next
    ? `NEXT: ${next.name.toUpperCase()}<br><span>PAR ${next.par} · ${next.yards} YARDS</span>`
    : '';
  const stats = [];
  if (summary.closestApproachFeet) stats.push(`Closest approach ${Math.round(summary.closestApproachFeet)} ft`);
  if (summary.longestShotYards) stats.push(`Longest shot ${Math.round(summary.longestShotYards)} yds`);
  if (summary.penalties) stats.push(`${summary.penalties} penalty stroke${summary.penalties > 1 ? 's' : ''}`);
  if (summary.hitGreenInRegulation) stats.push('Green in regulation');
  if (summary.heardInvitation) stats.push('“We invited you.”');
  ui.endcard.querySelector('.stats').textContent = stats.join(' · ');

  ui.endcard.classList.remove('hidden');
  document.exitPointerLock?.();
  player.enabled = false;
  audio.play('golf.cup', { volume: 0.5 });
}

document.getElementById('endcard-home')?.addEventListener('click', () => {
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
});
document.getElementById('endcard-again')?.addEventListener('click', () => {
  window.location.reload();
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let running = false;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!running) return;

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

async function boot() {
  const begun = story.begin();
  if (!begun.ok && begun.reason === 'already_complete') {
    hud.toast('You already played this morning.');
  }
  if (begun.unrouted) {
    /* Honest about it rather than silently pretending: the apartment does not
     * offer this round yet, so anybody here arrived by opening the page. */
    hud.toast('Silver Pines, out of sequence.');
  }

  await audio.init?.().catch?.(() => {});
  courseAudio = new (await import('./audio.js')).CourseAudio(audio);
  round.audio = courseAudio;
  courseAudio.start();

  loading?.classList.add('hidden');
  overlay.classList.add('hidden');
  document.getElementById('hud')?.setAttribute('aria-hidden', 'false');
  ui.card.classList.remove('hidden');

  canvas.requestPointerLock?.();
  player.enabled = true;
  running = true;
  round.begin();
  paintCard();
}

startBtn?.addEventListener('click', () => { boot(); });
canvas.addEventListener('click', () => {
  if (running && document.pointerLockElement !== canvas && !ended) canvas.requestPointerLock?.();
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
  setClub: (c) => { club = c; },
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
  teleport: (x, z) => {
    player.position.x = x;
    player.position.z = z;
  },
  /* The live hole, so a harness driving hole three is not reading
   * hole one's pin. */
  get LAYOUT() { return HOLE; },
  HOLE, setActiveHole, builtHoles,
  SURFACE, surfaceProps, heightAt, surfaceAt, toYards, toFeet,
};
window.__golfReady = true;

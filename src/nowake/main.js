import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import {
  MISSION_IDS, SCENE_IDS, createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createNoWakeStory } from '../core/no-wake-story.js';
import { Player } from '../core/player.js';
import { PostFX } from '../core/postfx.js';
import { BulletHoles } from '../world/bullets.js';
import { BoatPhysics } from './physics.js';
import { buildNoWakeWorld } from './world.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const objectiveEl = document.getElementById('objective');
const objectiveDetailEl = document.getElementById('objective-detail');
const helmHud = document.getElementById('helm-hud');
const throttleReadout = document.getElementById('throttle-readout');
const speedReadout = document.getElementById('speed-readout');
const rpmReadout = document.getElementById('rpm-readout');
const routeProgress = document.getElementById('route-progress');
const executionPrompt = document.getElementById('execution-prompt');
const speakerEl = document.getElementById('speaker');

const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.NO_WAKE) {
  campaign.enter(SCENE_IDS.NO_WAKE, { spawn: 'gate_c' });
}
const story = createNoWakeStory({ campaign });
const entry = story.begin();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .04, 1800);
scene.add(camera);
const world = buildNoWakeWorld(scene);
const hud = new Hud();
const player = new Player(camera, world);
const interaction = new InteractionSystem(camera, hud);
const audio = new AudioEngine();
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 1.18;
  postfx.bloom.strength = .25;
}
const physics = new BoatPhysics();
const blood = new BulletHoles(scene, 'blood');

const state = {
  phase: 'dock',
  boarded: false,
  battery: false,
  blower: false,
  engine: false,
  bowLine: false,
  sternLine: false,
  atHelm: false,
  driveSeconds: 0,
  dialogue: null,
  dialogueLog: [],
  ambientIndex: 0,
  phaseTime: 0,
  executionShots: 0,
  bodyDisposed: false,
  returnFrom: new THREE.Vector3(),
  returnHeading: 0,
  leaving: false,
};

const DRIVE_SECONDS = 90;
const boat = world.boat;
const local = new THREE.Vector3();
const localCamera = new THREE.Vector3();
let lastHeading = 0;
let lastTime = performance.now();
let elapsed = 0;

function setObjective(title, detail = '') {
  objectiveEl.textContent = title;
  objectiveDetailEl.textContent = detail;
}

function phase(next) {
  state.phase = next;
  state.phaseTime = 0;
}

function showSpeaker(who, text) {
  speakerEl.querySelector('small').textContent = who;
  speakerEl.querySelector('span').textContent = text;
  speakerEl.classList.remove('hidden');
  state.dialogueLog.push({ who, text });
}

function hideSpeaker() {
  speakerEl.classList.add('hidden');
}

function dialogue(lines, done) {
  state.dialogue = { lines, at: -1, left: 0, done };
  document.body.classList.add('cinematic');
  interaction.setPaused(true);
  advanceDialogue();
}

function advanceDialogue() {
  const d = state.dialogue;
  if (!d) return;
  d.at++;
  if (d.at >= d.lines.length) {
    const done = d.done;
    state.dialogue = null;
    hideSpeaker();
    document.body.classList.remove('cinematic');
    done?.();
    return;
  }
  const line = d.lines[d.at];
  d.left = line.seconds ?? Math.max(2.6, Math.min(6.2, line.text.length / 15));
  showSpeaker(line.who, line.text);
  audio.say(`nowake.${line.voice ?? line.who.toLowerCase().replaceAll(' ', '_')}.${line.cue ?? d.at + 1}`);
  audio.hold(d.left);
  if (line.focus) state.focus = line.focus;
}

function updateDialogue(dt) {
  if (!state.dialogue) return;
  state.dialogue.left -= dt;
  if (state.dialogue.left <= 0) advanceDialogue();
}

function registerInteractions() {
  interaction.register(boat.targets.board, {
    label: 'Step aboard <em>Lou’s cruiser</em>',
    enabled: () => !state.boarded,
    onUse: () => {
      state.boarded = true;
      player.position.set(-1.65, 2.58, 4.25);
      player.ground = .92;
      player.yaw = 0;
      hud.toast('Aboard · Gate C', 'good');
      setObjective('Start the boat', 'Battery · blower · ignition');
      story.checkpoint('dock');
    },
  });
  interaction.register(boat.targets.battery, {
    label: () => state.battery ? 'Battery switch <em>ON</em>' : 'Turn on battery switch',
    enabled: () => state.boarded && !state.battery,
    onUse: () => {
      state.battery = true;
      audio.play('switch.click', { volume: .75 });
      hud.toast('Battery on', 'good');
    },
  });
  interaction.register(boat.targets.blower, {
    label: () => state.blower ? 'Bilge blower <em>RUNNING</em>' : 'Run bilge blower',
    enabled: () => state.battery && !state.blower,
    hold: 1.1,
    onUse: () => {
      state.blower = true;
      audio.play('switch.click', { volume: .7 });
      audio.startLoop('bilge', { name: 'fan.pc', volume: .08 });
      hud.toast('Bilge clear', 'good');
    },
  });
  interaction.register(boat.targets.ignition, {
    label: () => !state.blower ? 'Run the blower first' : 'Turn ignition',
    enabled: () => state.battery && !state.engine,
    hold: .8,
    onUse: () => {
      if (!state.blower) {
        hud.say('Lou would hear that explosion from the parking lot.', 3500);
        return;
      }
      state.engine = true;
      physics.running = true;
      audio.stopLoop('bilge', .25);
      audio.play('switch.click', { volume: .7 });
      audio.startLoop('engine', { name: 'engine.idle', volume: .17 });
      setObjective('Release the mooring lines', 'Bow and stern · then take the helm');
      hud.toast('Twin diesels alive', 'good');
    },
  });
  for (const [key, target, name] of [
    ['bowLine', boat.targets.bowLine, 'bow'], ['sternLine', boat.targets.sternLine, 'stern'],
  ]) {
    interaction.register(target, {
      label: `Release ${name} line`,
      enabled: () => state.engine && !state[key],
      hold: .85,
      onUse: () => {
        state[key] = true;
        audio.play('cloth.rustle', { volume: .7, rate: .8 });
        hud.toast(`${name[0].toUpperCase()}${name.slice(1)} line clear`, 'good');
        if (state.bowLine && state.sternLine) {
          physics.mooringReleased = true;
          setObjective('Take the helm', 'Reverse clear of Gate C');
        }
      },
    });
  }
  interaction.register(boat.targets.helm, {
    label: 'Take the helm',
    enabled: () => state.engine && state.bowLine && state.sternLine && !state.atHelm,
    onUse: enterHelm,
  });
  interaction.register(boat.cast.willy.group, {
    label: 'Roll Willy to the transom',
    holdLabel: 'Move the body overboard',
    hold: 1.8,
    enabled: () => state.phase === 'body' && !state.bodyDisposed,
    onUse: disposeBody,
  });
}

function enterHelm() {
  state.atHelm = true;
  phase('drive');
  player.mode = 'seated';
  player.enabled = true;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -.65;
  player.pitchMax = .42;
  player.yaw = physics.heading;
  player.pitch = -.05;
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(-.82, 2.12, .10)));
  physics.throttle = 0;
  helmHud.classList.remove('hidden');
  setObjective('Run for open water', 'Clear the marina · follow the channel markers');
  story.checkpoint('underway');
  hud.say('Easy astern. Get the stern clear, then take her out.', 4300);
}

const AMBIENT = [
  { at: 12, who: 'Willy', text: 'This old girl still smells like Lou’s cigars. He sold the ashtrays but kept the smell.' },
  { at: 31, who: 'Booskibro', text: 'Red markers to starboard, Tony. Unless you want the Harbor Patrol in the conversation.' },
  { at: 53, who: 'Willy', text: 'Nice to get out. Everybody has been looking at me funny since the Motel.' },
  { at: 72, who: 'Big Uncle Lou', text: 'Nobody is looking at anybody, Willy. Enjoy the water.' },
];

function driveLine(line) {
  showSpeaker(line.who, line.text);
  audio.hold(4.6);
  setTimeout(() => {
    if (!state.dialogue && ['drive', 'coast'].includes(state.phase)) hideSpeaker();
  }, 4700);
}

function reachOpenWater() {
  if (state.phase !== 'drive') return;
  phase('coast');
  story.checkpoint('open_water');
  setObjective('Bring her to idle', 'Open water · throttle back to neutral');
  hud.say('That is far enough. Bring her down.', 3800);
}

function beginConfrontation() {
  if (state.phase !== 'coast') return;
  phase('confrontation');
  physics.throttle = 0;
  state.atHelm = false;
  helmHud.classList.add('hidden');
  player.mode = 'frozen';
  setObjective('Listen', 'The engines tick in the swell');
  const motel = campaign.state.missions[MISSION_IDS.JERKY_MOTEL];
  const beef = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  const motelFact = motel.policeHeat > 55
    ? 'The Bureau was on the Motel road before the first siren. That did not happen by luck.'
    : 'The Bureau knew the Motel, the room, and what was in the cases before Cecilio opened the door.';
  const beefFact = beef.detected
    ? 'The Beef Run drew eyes because somebody gave them a tail number and a day.'
    : 'The Beef Run was clean. Then a Bureau report named the strip, the cargo, and all four crates.';
  dialogue([
    { who: 'Big Uncle Lou', voice: 'lou', focus: 'lou', text: 'Kill the engines in your head for a minute, kid. We need the quiet.' },
    { who: 'Willy', voice: 'willy', focus: 'willy', text: 'What is this, Lou? You said a ride. I brought sandwiches.' },
    { who: 'Big Uncle Lou', voice: 'lou', focus: 'lou', text: beefFact },
    { who: 'Booskibro', voice: 'booski', focus: 'booski', text: 'Four people knew the reserve pickup. Lou, me, Tony, and the man who asked twice which room.' },
    { who: 'Willy', voice: 'willy', focus: 'willy', text: 'I ask things. I am interested. That is a crime now?' },
    { who: 'Big Uncle Lou', voice: 'lou', focus: 'lou', text: motelFact },
    { who: 'Willy', voice: 'willy', focus: 'willy', text: 'You think I talked to the Bureau? After all these years?' },
    { who: 'Big Uncle Lou', voice: 'lou', focus: 'lou', text: 'We know you did. The only question left is whether you make us hear you deny it again.' },
    { who: 'Willy', voice: 'willy', focus: 'willy', text: 'I need the head.' },
  ], willyBelow);
}

function willyBelow() {
  phase('below');
  setObjective('Wait', 'Willy went below');
  state.willyStartZ = boat.cast.willy.group.position.z;
  state.focus = null;
  setTimeout(() => {
    if (state.phase !== 'below') return;
    prepareGuns();
    dialogue([
      { who: 'Booskibro', voice: 'booski', focus: 'booski', text: 'When he comes back, do not look at Lou. Look at Willy.' },
      { who: 'Big Uncle Lou', voice: 'lou', focus: 'lou', text: 'You fire with us. Not after us.' },
    ], willyReturns);
  }, 4300);
}

function makeGun() {
  const gun = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: .35, metalness: .72 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x4a2d1e, roughness: .8 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(.07, .08, .42), dark);
  barrel.position.z = -.18;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(.09, .26, .12), grip);
  handle.position.set(0, -.13, .04);
  handle.rotation.x = -.25;
  gun.add(barrel, handle);
  return gun;
}

function prepareGuns() {
  if (state.gunsReady) return;
  state.gunsReady = true;
  state.louGun = makeGun();
  state.booskiGun = makeGun();
  boat.cast.lou.parts.foreR.add(state.louGun);
  boat.cast.booski.parts.foreR.add(state.booskiGun);
  state.louGun.position.set(0, -.22, -.12);
  state.booskiGun.position.copy(state.louGun.position);
  state.playerGun = makeGun();
  state.playerGun.position.set(.26, -.24, -.52);
  state.playerGun.rotation.set(-.08, 0, 0);
  state.playerGun.visible = false;
  camera.add(state.playerGun);
}

function willyReturns() {
  phase('ready_to_fire');
  boat.cast.lou.group.position.set(-1.22, .92, 1.45);
  boat.cast.booski.group.position.set(1.22, .92, 1.55);
  boat.cast.willy.job = 'stand';
  boat.cast.willy._syncJob(true);
  boat.cast.willy.group.position.set(0, .92, 3.05);
  boat.cast.willy.group.rotation.y = Math.PI;
  state.playerGun.visible = true;
  player.mode = 'frozen';
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(0, 2.14, .05)));
  player.yaw = physics.heading + Math.PI;
  player.pitch = -.08;
  interaction.setPaused(true);
  setObjective('Do what Lou brought you here to do', 'Willy is back on deck');
  executionPrompt.classList.remove('hidden');
  state.focus = 'willy';
  hud.say('Willy comes back up. Lou does not look at you.', 4200);
}

function fireExecution() {
  if (state.phase !== 'ready_to_fire') return;
  phase('execution');
  executionPrompt.classList.add('hidden');
  story.checkpoint('execution');
  const impact = boat.cast.willy.group.localToWorld(new THREE.Vector3(0, 1.35, .22));
  const normal = camera.position.clone().sub(impact).normalize();
  audio.play('gun.shot', { volume: 1 });
  blood.muzzle(camera.localToWorld(new THREE.Vector3(.25, -.18, -.72)));
  blood.punch(impact, normal);
  state.executionShots = 1;
  state.playerGun.rotation.x = .32;
  setTimeout(() => npcShot(boat.cast.lou, state.louGun), 210);
  setTimeout(() => npcShot(boat.cast.booski, state.booskiGun), 390);
  setTimeout(() => npcShot(boat.cast.lou, state.louGun), 650);
  setTimeout(dropWilly, 760);
}

function npcShot(npc, gun) {
  if (state.phase !== 'execution') return;
  const muzzle = gun.localToWorld(new THREE.Vector3(0, 0, -.42));
  audio.play('gun.shot', { volume: .92, position: muzzle });
  blood.muzzle(muzzle);
  const impact = boat.cast.willy.group.localToWorld(new THREE.Vector3(
    (Math.random() - .5) * .18, 1.2 + Math.random() * .35, .18,
  ));
  blood.punch(impact, camera.position.clone().sub(impact).normalize());
  state.executionShots++;
  npc.speaking = .2;
}

function dropWilly() {
  if (state.phase !== 'execution') return;
  phase('body');
  boat.cast.willy.group.rotation.z = -1.38;
  boat.cast.willy.group.position.y = .48;
  state.playerGun.visible = false;
  state.focus = null;
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(0, 2.45, 3.85)));
  player.yaw = physics.heading;
  player.pitch = -.35;
  player.mode = 'seated';
  player.enabled = true;
  player.yawCenter = player.yaw;
  player.yawRange = .65;
  interaction.setPaused(false);
  setObjective('Put Willy over the side', 'Hold E at the body');
  audio.play('body.fall', { volume: .78 });
  hud.say('Nobody says his name. The water knocks against the hull.', 5000);
}

function disposeBody() {
  if (state.phase !== 'body' || state.bodyDisposed) return;
  state.bodyDisposed = true;
  interaction.setPaused(true);
  phase('dispose');
  setObjective('Let go', 'There will be no wake for him');
  audio.play('cloth.rustle', { volume: .7 });
  setTimeout(() => {
    boat.cast.willy.group.visible = false;
    audio.play('water.splash', { volume: .9 });
    beginReturn();
  }, 1450);
}

function beginReturn() {
  phase('return');
  state.returnFrom.copy(boat.root.position);
  state.returnHeading = physics.heading;
  state.atHelm = false;
  setObjective('Ride back', 'Nobody speaks');
  document.body.classList.add('cinematic');
  hud.say('Lou takes the helm. Booski watches the water close.', 4800);
}

function completeMission() {
  if (state.leaving) return;
  state.leaving = true;
  phase('complete');
  document.body.classList.add('cinematic');
  setObjective('NO WAKE', 'South Harbor · 4:40 PM');
  const completed = story.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  });
  if (!completed) {
    hud.toast('Mission state could not be saved', 'bad', 6000);
    state.leaving = false;
    return;
  }
  showSpeaker('Tony', 'The phone will ring when it rings.');
  setTimeout(() => {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door', location });
  }, 3600);
}

function updateReturn(dt) {
  if (state.phase !== 'return') return;
  const k = Math.min(1, state.phaseTime / 16);
  const ease = k * k * (3 - 2 * k);
  boat.root.position.lerpVectors(state.returnFrom, new THREE.Vector3(0, 0, 0), ease);
  boat.root.rotation.y = THREE.MathUtils.lerp(state.returnHeading, 0, ease);
  boat.root.position.y = Math.sin(state.phaseTime * 1.2) * .05;
  camera.position.lerp(new THREE.Vector3(
    boat.root.position.x + 7, boat.root.position.y + 4.4, boat.root.position.z + 13,
  ), Math.min(1, dt * 1.6));
  camera.lookAt(boat.root.position.x, boat.root.position.y + 1.1, boat.root.position.z);
  if (k >= 1) completeMission();
}

function updateBoat(dt) {
  if (['drive', 'coast'].includes(state.phase)) {
    if (state.phase === 'drive') {
      if (player.keys.has('KeyW')) physics.throttle += dt * .45;
      if (player.keys.has('KeyS')) physics.throttle -= dt * .55;
      physics.throttle = THREE.MathUtils.clamp(physics.throttle, -1, 1);
      physics.steer = (player.keys.has('KeyD') ? 1 : 0) - (player.keys.has('KeyA') ? 1 : 0);
      if (Math.abs(physics.speed) > .8) state.driveSeconds += dt;
      const nextAmbient = AMBIENT[state.ambientIndex];
      if (nextAmbient && state.driveSeconds >= nextAmbient.at) {
        driveLine(nextAmbient);
        state.ambientIndex++;
      }
      if (state.driveSeconds >= DRIVE_SECONDS && physics.distance >= 360) reachOpenWater();
    } else {
      if (player.keys.has('KeyS')) physics.throttle -= dt * .75;
      else physics.throttle += (0 - physics.throttle) * Math.min(1, dt * 1.5);
      physics.steer *= Math.max(0, 1 - dt * 2);
      if (Math.abs(physics.throttle) < .08 && Math.abs(physics.speed) < .75) beginConfrontation();
    }
    physics.advance(dt);
    const motion = physics.motion();
    boat.root.position.set(physics.position.x, motion.heave, physics.position.y);
    boat.root.rotation.set(motion.pitch, physics.heading, motion.roll, 'YXZ');
    boat.wheel.rotation.z = physics.steer * .7;
    const wakeAt = boat.root.localToWorld(new THREE.Vector3(0, 0, 5.7));
    world.wake.emit(wakeAt, physics.heading, Math.abs(physics.speed), dt);
    audio.setLoopVolume('engine', .11 + Math.abs(physics.throttle) * .16, .12);
  }

  if (state.atHelm && ['drive', 'coast'].includes(state.phase)) {
    const deltaHeading = physics.heading - lastHeading;
    player.yaw += deltaHeading;
    player.position.copy(boat.root.localToWorld(local.set(-.82, 2.12, .10)));
    player.sway.roll = physics.motion().roll * .32;
    lastHeading = physics.heading;
    throttleReadout.textContent = Math.abs(physics.throttle) < .04
      ? 'N' : physics.throttle > 0 ? `${Math.round(physics.throttle * 100)}% F` : `${Math.round(-physics.throttle * 100)}% R`;
    speedReadout.textContent = Math.round(Math.abs(physics.speed) * 1.944);
    rpmReadout.textContent = Math.round(physics.rpm / 50) * 50;
    routeProgress.style.width = `${Math.min(100, state.driveSeconds / DRIVE_SECONDS * 100)}%`;
  }
}

function updateFocus(dt) {
  if (!state.focus || state.phase === 'return') return;
  const npc = boat.cast[state.focus];
  if (!npc) return;
  const target = npc.group.localToWorld(new THREE.Vector3(0, 1.48, 0));
  const desired = new THREE.Quaternion();
  const ghost = new THREE.Object3D();
  ghost.position.copy(camera.position);
  ghost.lookAt(target);
  desired.copy(ghost.quaternion);
  camera.quaternion.slerp(desired, Math.min(1, dt * 7));
}

function updateCast(dt) {
  localCamera.copy(camera.position);
  boat.root.worldToLocal(localCamera);
  for (const npc of Object.values(boat.cast)) npc.update(dt, localCamera);
  if (state.phase === 'below') {
    const w = boat.cast.willy.group;
    w.position.z += (-1.0 - w.position.z) * Math.min(1, dt * 1.8);
    w.position.y += (-.7 - w.position.y) * Math.min(1, dt * 1.5);
  }
}

function resumeCheckpoint() {
  if (!entry.ok) {
    startButton.textContent = 'Return to the apartment';
    overlay.querySelector('.tag').textContent = `NO WAKE is unavailable (${entry.reason.replaceAll('_', ' ')}).`;
    return;
  }
  const checkpoint = campaign.state.missions[MISSION_IDS.NO_WAKE].checkpoint;
  if (!entry.resumed || checkpoint === 'dock' || !checkpoint) return;
  Object.assign(state, {
    boarded: true, battery: true, blower: true, engine: true, bowLine: true, sternLine: true,
  });
  physics.running = true;
  physics.mooringReleased = true;
  if (checkpoint === 'underway') {
    setTimeout(enterHelm, 0);
    return;
  }
  physics.position.set(0, -430);
  physics.distance = 430;
  physics.heading = 0;
  physics.throttle = 0;
  boat.root.position.set(0, 0, -430);
  state.boarded = true;
  if (checkpoint === 'open_water') {
    phase('coast');
    state.atHelm = true;
    player.mode = 'seated';
    helmHud.classList.remove('hidden');
    setObjective('Bring her to idle', 'Open water · throttle back to neutral');
  } else {
    prepareGuns();
    willyReturns();
  }
}

registerInteractions();
player.mode = 'walk';
player.enabled = false;
player.position.set(-5.15, 1.86, 8.4);
player.ground = .2;
player.eyeHeight = 1.66;
player.yaw = -.55;
player.pitch = -.08;
player.update(.016);
hud.setClock(3, '12:45 PM', 0);
resumeCheckpoint();

const runtime = {
  get phase() { return state.phase; }, set phase(v) { state.phase = v; },
  get campaignState() { return campaign.state; },
  state, physics, world, boat, player, interaction, story, postfx, dialogueLog: state.dialogueLog,
  startUnderway() {
    Object.assign(state, {
      boarded: true, battery: true, blower: true, engine: true, bowLine: true, sternLine: true,
    });
    physics.running = true;
    physics.mooringReleased = true;
    enterHelm();
  },
  skipDrive() {
    if (state.phase !== 'drive') return false;
    state.driveSeconds = DRIVE_SECONDS;
    physics.distance = 380;
    physics.position.y = -430;
    reachOpenWater();
    return true;
  },
  skipDialogue() {
    if (!state.dialogue) return false;
    advanceDialogue();
    return true;
  },
  fire: fireExecution,
  beginConfrontation,
  prepareExecution() { prepareGuns(); willyReturns(); },
  dropWilly,
  disposeBody,
  beginReturn,
  completeMission,
};
window.NO_WAKE = runtime;
window.__squatchSceneReady?.('NO WAKE ready');

startButton.addEventListener('click', async () => {
  if (!entry.ok) {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door', location });
    return;
  }
  await audio.init();
  // Decoding the global library is deliberately background work. The shared
  // engine upgrades cues as buffers land; it must not hold the harbor behind
  // a title card while unrelated campaign VO decodes.
  audio.loadManifest();
  audio.startLoop('harbor', { name: 'ambience.rain', volume: .08, ambience: true });
  document.body.classList.add('playing');
  overlay.classList.add('out');
  player.enabled = true;
  canvas.requestPointerLock?.();
  setTimeout(() => overlay.remove(), 850);
});

document.addEventListener('pointerlockchange', () => {
  player.enabled = document.pointerLockElement === canvas || state.atHelm;
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  player.setKey(event.code, true);
  if (event.code === 'KeyE') interaction.press();
  if (event.code === 'KeyB') hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
  if (event.code === 'KeyQ' && state.atHelm) {
    if (Math.abs(physics.speed) > .35) hud.say('Not while she is moving.', 2200);
    else {
      state.atHelm = false;
      player.mode = 'walk';
      helmHud.classList.add('hidden');
    }
  }
});
document.addEventListener('keyup', (event) => {
  player.setKey(event.code, false);
  if (event.code === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (state.phase === 'ready_to_fire') fireExecution();
  else if (document.pointerLockElement === canvas) interaction.press();
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) interaction.release();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.05, Math.max(.001, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  state.phaseTime += dt;
  updateDialogue(dt);
  updateBoat(dt);
  if (state.phase !== 'return') player.update(dt);
  interaction.update(dt);
  updateCast(dt);
  updateFocus(dt);
  updateReturn(dt);
  blood.update(dt);
  if (state.playerGun) state.playerGun.rotation.x += (0 - state.playerGun.rotation.x) * Math.min(1, dt * 9);
  world.update(elapsed, dt);
  hud.setClock(3, state.phase === 'complete' ? '4:40 PM' : '12:45 PM', elapsed);
  postfx.render();
  postfx.sample(dt);
}

requestAnimationFrame(animate);
setTimeout(() => loading.classList.add('out'), 180);
setTimeout(() => loading.remove(), 820);

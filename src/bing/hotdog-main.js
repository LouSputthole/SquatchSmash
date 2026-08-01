import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import { AuthoredClock } from '../core/authored-clock.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { createBadaBingTwoStory } from '../core/bada-bing-two-story.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { PostFX } from '../core/postfx.js';
import { buildClub, roomAt } from './club.js';
import { restoreHotDogCleanupPresentation } from './hotdog-cleanup-presentation.js';
import { buildHotDogParty } from './hotdog-party.js';
import {
  SECOND_VISIT_CLEANUP_TASKS,
  SecondVisitMission,
  buildHotDogPartySequence,
} from './second-visit.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');
const blackout = document.getElementById('blackout');
const objectivesRoot = document.getElementById('objectives');
const objectiveList = objectivesRoot.querySelector('ul');
const dialogueRoot = document.getElementById('dialogue');

objectivesRoot.querySelector('.head').textContent = 'THE HOTDOG INCIDENT';

overlay.querySelector('h1').innerHTML = 'THE <span>HOTDOG INCIDENT</span>';
overlay.querySelector('.tag').textContent = 'The Bada Bing is closed for Billy HotDog\'s welcome-home party. Family only. Hog Mama is waiting on the stage controls.';
startButton.textContent = 'Enter the closed party';
overlay.querySelector('.controls').innerHTML = [
  '<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> hurry · <kbd>Space</kbd> jump</li>',
  '<li><kbd>E</kbd> / <kbd>Click</kbd> interact · hold for cleanup and loading</li>',
  '<li><kbd>Tab</kbd> objectives · <kbd>B</kbd> bloom · <kbd>Esc</kbd> release mouse</li>',
  '<li>The room handles its own jobs. Prospect has one short cleanup spine.</li>',
].join('');
assetStatus.textContent = 'Closed party · Hog Mama set · sudden attack · cleanup · body transfer';

const campaign = createCampaign();
const story = createBadaBingTwoStory({ campaign });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.45));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 260);
scene.add(camera);
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 0.9;
  postfx.bloom.strength = 0.32;
}

const audio = new AudioEngine();
const hud = new Hud();
const world = { colliders: [], floorZones: [], groundAt: () => 0 };
const player = new Player(camera, world);
const interaction = new InteractionSystem(camera, hud);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

window.__squatchStage?.('Closing the club to the public...');
const club = buildClub(scene, { renderer });
world.colliders = club.colliders;
world.floorZones = club.floorZones;
world.groundAt = club.groundAt;
await club.artReady;
window.__squatchStage?.('Seating the entire Family...');
const party = await buildHotDogParty(scene, club);
window.__squatchStage?.('Wiring the cleanup route...');

const clock = new AuthoredClock();
clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
const sequence = buildHotDogPartySequence();

const state = {
  phase: 'menu',
  started: false,
  room: 'outside',
  elapsed: 0,
  director: {
    running: false,
    index: 0,
    remaining: 0,
    current: null,
    waitingForGun: false,
    handoffReady: false,
  },
  fallen: false,
  cleanupActive: false,
  bathroom: new Set(),
  evidence: new Set(),
  kitTaken: false,
  finalSwept: false,
  wrapped: false,
  loaded: false,
  lineHistory: [],
  endingShown: false,
};

let mission = null;
mission = new SecondVisitMission({
  onObjective: repaintObjectives,
  onMessage: (text) => hud.toast(text, ''),
  onNote: (text) => hud.say(text, 4200),
});

function repaintObjectives() {
  if (!mission) return;
  objectiveList.replaceChildren(...mission.objectives.map((objective) => {
    const li = document.createElement('li');
    li.className = objective.done ? 'done' : '';
    li.innerHTML = `<i></i><span>${objective.text}</span>`;
    return li;
  }));
  objectivesRoot.classList.remove('hidden');
}
repaintObjectives();
window.__squatchStage?.('Assigning party reactions...');

function cueSeconds(name) {
  const bank = audio.buffers?.get(name);
  return bank?.length ? bank[0].duration : 0;
}

function playCue(name) {
  if (!name || !audio.ready) return false;
  const bank = audio.buffers?.get(name);
  if (!bank?.length) return false;
  audio._vo?.stop?.();
  const source = audio.play(name, { volume: 0.9 });
  audio._vo = source;
  return true;
}

function actorFor(name) {
  const normalized = String(name).toLowerCase();
  if (normalized.includes('lou')) return party.extra.lou;
  if (normalized.includes('hotdog')) return party.extra.hotdog;
  if (normalized === 'ape') return party.byId.ape;
  if (normalized.includes('hog mama')) return party.byId.hogmama;
  if (normalized.includes('shubenator')) return party.byId.shubenator;
  if (normalized.includes('rippin')) return party.byId.rippinflow;
  if (normalized.includes('lawnmower')) return party.extra.lawnmower;
  if (normalized.includes('aubbie')) return party.extra.aubbie;
  if (normalized.includes('snow')) return party.byId.snow;
  return null;
}

function showLine(beat) {
  const who = beat.who || '';
  dialogueRoot.querySelector('.who').textContent = who;
  dialogueRoot.querySelector('.line').textContent = beat.line;
  dialogueRoot.querySelector('.options').classList.add('hidden');
  dialogueRoot.classList.remove('hidden');
  state.lineHistory.push({ who, line: beat.line, cue: beat.cue });
  const actor = actorFor(who);
  actor?.say(Math.max(1.5, beat.seconds ?? 2.5));
  actor?.faceToward(player.position.x, player.position.z);
  playCue(beat.cue);
}

function hideLine() {
  dialogueRoot.classList.add('hidden');
}

function react(reaction) {
  const all = party.all;
  if (reaction === 'numbskull-early-laugh') party.byId.numbskull?.say(2.5);
  if (reaction === 'gratin-choke') {
    const gratin = party.byId.gratin;
    gratin?.say(3);
    audio.play('glass.set', { volume: 0.42, position: gratin?.position });
  }
  if (reaction === 'ape-laugh') party.byId.ape?.say(3.2);
  if (reaction === 'lou-warning-look') party.extra.lou.faceToward(party.extra.hotdog.position.x, party.extra.hotdog.position.z);
  if (reaction === 'eric-recording') party.byId.eric?.faceToward(-12, -5.7);
  if (reaction === 'room-laugh') {
    for (let i = 0; i < all.length; i += 2) all[i].say(1.8 + (i % 3) * 0.3);
  }
}

function moveApeOut() {
  const ape = party.byId.ape;
  ape.job = 'patrol';
  ape.speed = 1.7;
  ape.route = [
    { x: -8.4, z: 2.6 },
    { x: 5.9, z: 2.8 },
    { x: 6.5, z: -3.2 },
  ];
  ape.routeAt = 0;
}

function returnApe() {
  const ape = party.byId.ape;
  ape.route = null;
  ape.job = 'stand';
  ape.group.position.set(-14.7, 0, -0.15);
  ape.faceToward(party.extra.hotdog.position.x, party.extra.hotdog.position.z, true);
}

function stageAttack() {
  if (state.fallen) return;
  state.fallen = true;
  mission.startAttack();
  const hotdog = party.extra.hotdog;
  const ape = party.byId.ape;
  hotdog.job = 'stand';
  hotdog.group.position.set(-15.8, 0.25, -0.45);
  hotdog.group.rotation.set(0, 1.3, -1.34);
  ape.group.position.set(-14.9, 0, -0.25);
  ape.group.rotation.y = -1.6;
  party.cleanup.blood.visible = true;
  party.cleanup.brokenStool.visible = true;
  party.cleanup.gun.visible = true;
  audio.play('glass.wine.fall', { volume: 0.95, position: hotdog.position });
  setTimeout(() => audio.play('gun.drop.wood', { volume: 0.76, position: party.cleanup.gun.position }), 420);
  hud.toast('HOTDOG IS REACHING FOR A GUN', 'bad', 4200);
}

function assignCleanupRoles() {
  if (state.cleanupActive) return;
  state.cleanupActive = true;
  club.doors.ladies.locked = false;
  const set = (npc, x, z, job = 'work', yaw = 0) => {
    if (!npc) return;
    npc.route = null;
    npc.job = job;
    npc.baseY = 0;
    npc.group.position.set(x, 0, z);
    npc.group.rotation.y = yaw;
  };
  set(party.byId.ape, 4.25, -4.5, 'sit', -Math.PI / 2);
  set(party.byId.deathmegatron, 3.25, -3.7, 'stand', -Math.PI / 2);
  party.byId.deathmegatron.folded = true;
  set(party.byId.rippinflow, -14.4, -1.4, 'stand', 1.2);
  set(party.byId.numbskull, -13.4, -1.6, 'stand', 1.5);
  set(party.extra.aubbie, -17.0, -1.5, 'work', 1.2);
  set(party.byId.booski, -18.2, 1.9, 'work', Math.PI / 2);
  set(party.byId.hogmama, -2.4, 5.8, 'work', -2.8);
  set(party.byId.gratin, -1.0, 5.8, 'work', 2.8);
  set(party.byId.shubenator, -5.6, -8.1, 'work', 0);
  set(party.byId.snow, 6.45, -8.2, 'stand', Math.PI);
  set(party.extra.sauce, -3.6, 6.2, 'work', -2.6);
  party.byId.eric.group.visible = false;
  hud.say('Lou turns panic into departments. Your part is on the board.', 4800);
}

function applyBeatAction(action) {
  if (action === 'performance-finish') mission.finishPerformance();
  if (action === 'ape-leaves') moveApeOut();
  if (action === 'ape-returns') returnApe();
  if (action === 'attack') stageAttack();
  if (action === 'enable-gun-kick') {
    state.director.waitingForGun = true;
    state.director.running = false;
  }
  if (action === 'music-cut') audio.setLoopVolume('party.record', 0, 0.25);
  if (action === 'cleanup-start') assignCleanupRoles();
}

function beginSequence() {
  if (!mission.startPerformance()) return false;
  state.director.running = true;
  state.director.index = 0;
  state.director.remaining = 0;
  audio.setLoopVolume('party.record', 0.12, 0.8);
  return true;
}

function updateDirector(dt) {
  const d = state.director;
  if (!d.running) return;
  if (d.remaining > 0) {
    d.remaining -= dt;
    if (d.remaining > 0) return;
    applyBeatAction(d.current?.action);
    d.current = null;
    hideLine();
    if (!d.running) return;
  }
  const next = sequence[d.index];
  if (!next) {
    d.running = false;
    if (mission.readyToLeave) finishParty();
    return;
  }
  if (next.phase === 'handoff' && !d.handoffReady) return;
  d.index++;
  d.current = next;
  showLine(next);
  react(next.reaction);
  d.remaining = Math.max(next.seconds ?? 2.5, cueSeconds(next.cue) + 0.3);
}

function completeCleanupTask(task) {
  if (!mission.completeCleanup(task)) return false;
  story.recordCleanup(task);
  repaintObjectives();
  return true;
}

function registerDoor(key, lockedLine = 'Locked for the party.') {
  const door = club.doors[key];
  if (!door) return;
  interaction.register(door.leaf, {
    label: () => door.locked ? `<b>${door.label}</b> · locked` : `${door.open ? 'Close' : 'Open'} <b>${door.label}</b>`,
    enabled: () => state.phase === 'active' && !state.director.current,
    onUse: () => {
      if (door.locked) {
        audio.play('door.locked', { volume: 0.55, position: door.pivot.position });
        hud.say(lockedLine, 2600);
        return;
      }
      const opening = !door.open;
      door.toggle();
      audio.play(opening ? 'door.creak' : 'door.knob', { volume: 0.5, position: door.pivot.position });
    },
  });
}
for (const key of ['front', 'inner', 'mens', 'ladies', 'storage', 'service']) registerDoor(key);

interaction.register(party.stage.controls, {
  label: 'Press <b>Hog Mama\'s spotlight and microphone controls</b>',
  enabled: () => state.phase === 'active' && mission.state === 'party' && !state.director.running,
  onUse: () => {
    if (!beginSequence()) return;
    hud.toast('HOG MAMA · 30 SECOND SET', 'good');
    audio.play('switch.click', { volume: 0.72, position: party.stage.controls.position });
  },
});

interaction.register(party.cleanup.gun, {
  label: 'Kick <b>HotDog\'s revolver</b> away',
  enabled: () => state.phase === 'active' && state.director.waitingForGun && !mission.flags.gunKicked,
  onUse: () => {
    if (!mission.kickGun()) return;
    story.recordAttack({ gunKicked: true });
    party.cleanup.gun.position.x += 2.4;
    party.cleanup.gun.rotation.z += 5.2;
    audio.play('gun.drop.wood', { volume: 0.9, position: party.cleanup.gun.position });
    state.director.waitingForGun = false;
    state.director.running = true;
    repaintObjectives();
    hud.toast('GUN SECURED', 'good');
  },
});

for (const [id, pad] of Object.entries(party.cleanup.bathroomPads)) {
  interaction.register(pad, {
    label: () => `Check the <b>${id === 'mens' ? 'men\'s room' : 'ladies\' room'}</b>`,
    enabled: () => state.phase === 'active' && mission.state === 'cleanup' && !state.bathroom.has(id),
    onUse: () => {
      state.bathroom.add(id);
      audio.play('cloth.suit.movement', { volume: 0.4, position: pad.position });
      hud.say(id === 'mens'
        ? 'Two wet towels, one broken dispenser, nobody hiding.'
        : 'Empty stalls. Eric\'s forgotten camera battery under the sink.', 3600);
      pad.visible = false;
      if (state.bathroom.size === 2) completeCleanupTask('bathrooms');
    },
  });
}

interaction.register(party.cleanup.kit, {
  label: 'Take <b>Aubbie\'s correct cleanup kit</b>',
  enabled: () => state.phase === 'active' && mission.state === 'cleanup' && !state.kitTaken,
  onUse: () => {
    state.kitTaken = true;
    party.cleanup.kit.visible = false;
    completeCleanupTask('cleaning_kit');
    audio.play('cloth.snap', { volume: 0.55, position: party.cleanup.kit.position });
    hud.say('Plastic sheeting, nitrile gloves, carpet knife, proper chemicals. Aubbie labels everything.', 4300);
  },
});

for (const [id, prop] of [['cufflink', party.cleanup.cufflink], ['lapel', party.cleanup.lapel]]) {
  interaction.register(prop, {
    label: () => `Pick up HotDog\'s <b>${id === 'cufflink' ? 'missing cufflink' : 'lapel pin'}</b>`,
    enabled: () => state.phase === 'active' && mission.state === 'cleanup' && !state.evidence.has(id),
    onUse: () => {
      state.evidence.add(id);
      prop.visible = false;
      audio.play('gun.pickup', { volume: 0.34, rate: 1.28, position: prop.position });
      hud.say(id === 'cufflink'
        ? 'One cufflink. Booski can stop saying “one cufflink.”'
        : 'The lapel pin was under the stage lip. HotDog travelled farther than expected.', 3600);
      if (state.evidence.size === 2) completeCleanupTask('missing_evidence');
    },
  });
}

interaction.register(party.extra.lou.group, {
  label: () => state.cleanupActive ? 'Report to <b>Lou for the final sweep</b>' : 'Talk to <b>Lou</b>',
  enabled: () => state.phase === 'active' && !state.director.current,
  onUse: () => {
    party.extra.lou.faceToward(player.position.x, player.position.z);
    party.extra.lou.say(3);
    if (!state.cleanupActive) {
      hud.say('Enjoy the party, Prospect. That is an order with a very short shelf life.', 3900);
      return;
    }
    const prerequisites = ['bathrooms', 'cleaning_kit', 'missing_evidence']
      .every((task) => mission.cleanup.has(task));
    if (!prerequisites) {
      const missing = [];
      if (!mission.cleanup.has('bathrooms')) missing.push('bathrooms');
      if (!mission.cleanup.has('cleaning_kit')) missing.push('Aubbie\'s kit');
      if (!mission.cleanup.has('missing_evidence')) missing.push('HotDog\'s jewelry');
      hud.say(`Not a sweep. You still owe me: ${missing.join(', ')}.`, 4200);
      return;
    }
    if (!state.finalSwept) {
      state.finalSwept = true;
      completeCleanupTask('final_sweep');
      restoreHotDogCleanupPresentation(party, mission.cleanup);
      hud.say('Lou checks the room once, slowly. “Wrap him. Snow gets the keys.”', 4600);
    } else {
      hud.say('The room looks closed, not cleaned. That is the difference Lou wanted.', 3600);
    }
  },
});

interaction.register(party.extra.hotdog.group, {
  label: 'Hold to <b>wrap Billy HotDog</b> with Rippin and Aubbie',
  hold: 1.8,
  enabled: () => state.phase === 'active'
    && state.fallen
    && SECOND_VISIT_CLEANUP_TASKS.every((task) => mission.cleanup.has(task))
    && !state.wrapped,
  onTap: () => hud.say('Rippin has the shoulders. Hold and take the legs.', 2800),
  onUse: () => {
    if (!mission.wrapBody()) return;
    state.wrapped = true;
    party.extra.hotdog.group.visible = false;
    party.cleanup.wrap.visible = true;
    audio.play('cloth.snap', { volume: 0.82, position: party.cleanup.wrap.position });
    repaintObjectives();
    hud.say('Plastic tight, face covered, nothing loose. Snow opens the service exit.', 4000);
  },
});

interaction.register(party.cleanup.loadPad, {
  label: 'Hold to <b>load HotDog into Snow\'s car</b>',
  hold: 1.7,
  enabled: () => state.phase === 'active' && state.wrapped && !state.loaded,
  onTap: () => hud.say('Snow has the trunk open. Hold and lift with Numbskull.', 3000),
  onUse: () => {
    if (!mission.assign('reserve_pickup')) return;
    state.loaded = true;
    party.cleanup.wrap.visible = false;
    audio.play('car.door.close.heavy', { volume: 0.75, position: party.cleanup.loadPad.position });
    const banked = story.completeClub({
      assignment: mission.assignment,
      bodyWrapped: mission.flags.bodyWrapped,
      bodyLoaded: mission.flags.bodyLoaded,
    });
    if (!banked) {
      console.error('[bing-two] cleanup could not be banked', campaign.state.missions[MISSION_IDS.BADA_BING_TWO]);
      hud.toast('Campaign save failed', 'bad', 5200);
      return;
    }
    state.director.handoffReady = true;
    state.director.running = true;
    repaintObjectives();
  },
});
window.__squatchStage?.('Checking the service exit...');

// Family walk-ups remain short ambient context. They never replace an
// objective and they shut off while the authored sequence owns the room.
for (const npc of party.all) {
  if ([party.extra.lou, party.extra.hotdog].includes(npc)) continue;
  interaction.register(npc.group, {
    label: () => `Check in with <b>${npc.name}</b>`,
    enabled: () => state.phase === 'active' && !state.director.current && !state.director.waitingForGun,
    onUse: () => {
      npc.faceToward(player.position.x, player.position.z);
      npc.say(2.4);
      const lines = state.cleanupActive
        ? {
          Booskibro: 'One cufflink, one pin, one tab. I am counting because nobody else can count under pressure.',
          Snow: 'Route is clear. Graveyard first. Motel after.',
          Aubbie: 'Correct plastic is in storage. The shower curtain was Lawnmower.',
          Lawnmower: 'The shovel made sense when I picked it up.',
          'Hog Mama': 'The cake did not kill anybody and I am not throwing it out.',
          Gratin: 'The kitchen stays hot. Bleach smells like bleach; onions smell like business.',
          DeathMegatron: 'Phone in the basket. Door stays locked.',
          Rippinflow: 'Ape stays in the booth. HotDog stays wherever we put him.',
          Numbskull: 'Do we load the broken stool before or after the person?',
        }
        : {
          Willy: 'HotDog got louder in county. I did not know that was medically possible.',
          Eric: 'The camera is old. Tape, not cloud. That is good now, apparently.',
          Gratin: 'HotDog touched every serving utensil. Every one.',
          Snow: 'Cold in here. Good.',
          Aubbie: 'Microphone cable is fixed. Do not step on the new splice.',
        };
      hud.say(lines[npc.name] ?? (state.cleanupActive
        ? `${npc.name} has a job and no interest in swapping.`
        : `${npc.name} watches HotDog like a glass set too close to an edge.`), 3800);
    },
  });
}

function restoreFromCampaign() {
  const saved = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  if (!saved.gunKicked) return;
  mission.enteredClub();
  mission.startPerformance();
  mission.finishPerformance();
  mission.startAttack();
  stageAttack();
  mission.kickGun();
  state.director.index = sequence.findIndex((beat) => beat.action === 'cleanup-start') + 1;
  state.director.waitingForGun = false;
  assignCleanupRoles();
  for (const task of saved.cleanupTasks) {
    mission.completeCleanup(task);
  }
  state.bathroom = new Set(saved.cleanupTasks.includes('bathrooms') ? ['mens', 'ladies'] : []);
  state.kitTaken = saved.cleanupTasks.includes('cleaning_kit');
  state.evidence = new Set(saved.cleanupTasks.includes('missing_evidence') ? ['cufflink', 'lapel'] : []);
  state.finalSwept = saved.cleanupTasks.includes('final_sweep');
  restoreHotDogCleanupPresentation(party, saved.cleanupTasks);
  if (saved.bodyWrapped) {
    mission.wrapBody();
    state.wrapped = true;
    party.extra.hotdog.group.visible = false;
    party.cleanup.wrap.visible = true;
  }
  repaintObjectives();
}

function finishParty() {
  if (state.endingShown) return;
  state.endingShown = true;
  mission.finish();
  state.phase = 'complete';
  player.enabled = false;
  player.clearKeys();
  interaction.setPaused(true);
  document.exitPointerLock?.();
  blackout.classList.add('on');
  setTimeout(() => {
    overlay.classList.remove('hidden');
    overlay.classList.add('ending');
    overlay.querySelector('h1').innerHTML = 'THE HOTDOG <span>INCIDENT</span>';
    overlay.querySelector('.tag').textContent = 'Snow and the Prospect take the wrapped body out through the service door. The Bada Bing cleanup continues behind them.';
    assetStatus.innerHTML = '<b>NEXT: THE SQUATCH GRAVEYARD</b><br>HotDog still has to disappear before the Motel opens.';
    startButton.textContent = 'Ride with Snow to the graveyard →';
    startButton.disabled = false;
    startButton.onclick = () => navigateCampaign(campaign, SCENE_IDS.SQUATCH_GRAVEYARD, {
      spawn: 'headlights', location,
    });
    blackout.classList.remove('on');
  }, 900);
}

function setAcoustics(next) {
  const inside = !['lot', 'outside', 'alley', 'yard'].includes(next);
  audio.setLoopVolume('party.rain', inside ? 0.018 : 0.32, 0.8);
  audio.setLoopVolume('party.record', next === 'main' ? 0.17 : inside ? 0.06 : 0.025, 0.7);
  audio.setLoopVolume('party.crowd', next === 'main' ? 0.1 : inside ? 0.025 : 0, 0.7);
  club.rain.setVisible(!inside);
}

function updateRoom() {
  const next = roomAt(player.position.x, player.position.z);
  if (next === state.room) return;
  state.room = next;
  setAcoustics(next);
  if (next === 'main' && !mission.inside) {
    mission.enteredClub();
    repaintObjectives();
    hud.say('No customers, no dancers, no open tables. Every face in the room belongs to the Family.', 5200);
  }
}

function teleport(x, z, yaw = player.yaw) {
  player.mode = 'walk';
  player.position.set(x, 1.66, z);
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;
  player.pitch = 0;
  player.update(0.016);
}

const game = {
  get started() { return state.started; },
  get phase() { return state.phase; },
  get director() { return state.director; },
  get cleanupActive() { return state.cleanupActive; },
};
const cast = {
  all: party.all,
  byName: {
    lou: party.extra.lou,
    hotdog: party.extra.hotdog,
    aubbie: party.extra.aubbie,
    lawnmower: party.extra.lawnmower,
    sauce: party.extra.sauce,
    ...party.byId,
  },
};
const runtime = {
  isSecondVisit: true,
  campaign,
  secondVisitStory: story,
  story,
  mission,
  party,
  cast,
  club,
  player,
  interaction,
  audio,
  postfx,
  game,
  state,
  sequence,
  teleport,
  beginSequence,
  kickGun: () => party.cleanup.gun.userData.interact?.onUse?.(),
  completeCleanupTask,
  get campaignState() { return campaign.state; },
};
window.__squatchStage?.('Opening the doors...');
window.__bing = runtime;
window.HOTDOG_INCIDENT = runtime;

function requestGamePointerLock() {
  try {
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    // Embedded previews can deny pointer lock. The scene remains playable
    // through its debug/verification surface and a later canvas click retries.
  }
}

startButton.addEventListener('click', async () => {
  if (state.phase === 'complete') return;
  const begun = story.begin();
  if (!begun.ok) {
    if (begun.reason === 'already_complete') {
      overlay.querySelector('.tag').textContent = 'This incident is already complete. HotDog is in the ground.';
      startButton.textContent = 'Continue through the graveyard';
      startButton.onclick = () => story.continueAfterCompletion({ location });
    } else {
      overlay.querySelector('.tag').textContent = 'Lou has not called the Prospect back for the closed party yet.';
      startButton.textContent = 'MISSION UNAVAILABLE';
      startButton.disabled = true;
    }
    return;
  }
  if (begun.checkpoint === 'body_loaded') {
    navigateCampaign(campaign, SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights', location });
    return;
  }
  if (campaign.state.scene.id !== SCENE_IDS.BADA_BING_TWO) {
    campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
  }
  startButton.disabled = true;
  startButton.textContent = 'Loading party audio...';
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
  clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
  await audio.init();
  // The authored party is almost entirely voiced. Do not let a fast player
  // reach Hog Mama's controls while the recordings are still decoding and
  // silently fall through to subtitle-only playback.
  await audio.loadManifest();
  audio.startLoop('party.rain', { name: 'ambience.rain', volume: 0.3, ambience: true, fade: 1.2 });
  audio.startLoop('party.crowd', { name: 'ambience.crowd', volume: 0.02, ambience: true, fade: 1.2 });
  audio.startMusicLoop('party.record', 'assets/music/good-ole-days.mp3', {
    volume: 0.035, ambience: true, position: club.anchors.dj, ref: 3.5, maxDist: 36, fade: 1.4,
  });
  state.started = true;
  state.phase = 'active';
  startButton.disabled = false;
  overlay.classList.add('hidden');
  document.body.classList.add('playing', 'hotdog-party');
  player.enabled = true;
  // Start just inside the closed club. The exterior arrival was dead walking
  // before the scene's actual premise; this gets the player to the packed room
  // and stage controls immediately.
  teleport(club.anchors.frontDoor.x, club.anchors.frontDoor.z - 7.1, 0);
  restoreFromCampaign();
  requestGamePointerLock();
  hud.say('<em>11:00 PM.</em> Closed party. Hog Mama is waiting for somebody to work the stage controls.', 6000);
});

document.addEventListener('pointerlockchange', () => {
  if (state.phase === 'active') player.enabled = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') event.preventDefault();
  if (state.phase !== 'active') return;
  player.setKey(event.code, true);
  if (event.code === 'KeyE') interaction.press();
  if (event.code === 'KeyB') hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
  if (event.code === 'Tab') {
    event.preventDefault();
    objectivesRoot.classList.toggle('hidden');
  }
});
document.addEventListener('keyup', (event) => {
  player.setKey(event.code, false);
  if (event.code === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && document.pointerLockElement === canvas) interaction.press();
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) interaction.release();
});
canvas.addEventListener('click', () => {
  if (state.phase === 'active' && document.pointerLockElement !== canvas) requestGamePointerLock();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

let lastTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  state.elapsed += dt;
  if (state.phase === 'active') {
    player.update(dt);
    interaction.update(dt);
    updateRoom();
    updateDirector(dt);
    for (const npc of party.all) {
      if (state.fallen && npc === party.extra.hotdog) continue;
      npc.update(dt, player.position);
    }
  }
  club.update(dt, player.position);
  clock.update(dt);
  hud.setClock(clock.day, clock.clock12, clock.elapsedReal);
  postfx.render();
  postfx.sample(dt);
}
requestAnimationFrame(animate);

setTimeout(() => loading.classList.add('hidden'), 220);

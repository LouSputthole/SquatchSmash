/**
 * DEAD GIVEAWAY — composition root.
 *
 * One flight down from the Bada Bing: a card room, eight chairs, sixteen
 * words on the wall, and one player at the table who does not know which of
 * them is the one. Design and contracts: docs/DEAD-GIVEAWAY.md. Wire
 * protocol: docs/DEAD-GIVEAWAY-PROTOCOL.md.
 *
 * What this file does, in order:
 *   1. builds the renderer, the room (world.js), the camera, the shared
 *      Player and the shared first-person input Adapter;
 *   2. connects to the server (dg-client.js) and, after a reload, walks back
 *      into the same seat (client.resume());
 *   3. renders every `state` snapshot: the seated cast (seats.js), the board,
 *      the clue cards, the chips, the turn marker, the HUD (table-ui.js) and
 *      the lobby card (lobby.js);
 *   4. turns clicks and keys into intents the server rules on, and relays
 *      look direction (10 Hz) and gestures (actions.js);
 *   5. runs the table's voices and faces (table-media.js, face-video.js).
 *
 * THE CLIENT NEVER SIMULATES A RULE. Everything on screen is drawn from the
 * latest snapshot, so a reload or a reconnect just draws the same table.
 */
import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { Player } from '../core/player.js';
import { createFirstPersonInput, FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { makeMaterials } from '../world/materials.js';
import { connectDeadGiveaway } from '../core/online/dg-client.js';
import { createTableMedia } from '../core/online/table-media.js';
import { attachFaceVideo } from '../core/online/face-video.js';
import { buildBackroom, SEAT_COUNT } from './world.js';
import { ROSTER, characterById } from './characters.js';
import { createSeatRig } from './seats.js';
import { createActions, ACTIONS, ACTION_CUES } from './actions.js';
import { createLobby } from './lobby.js';
import { createMediaPanel } from './media-panel.js';
import {
  createTableUi, boardModel, clueList, legendModel, myAction, turnText, phaseLabel,
} from './table-ui.js';

const stage = (text) => { try { window.__squatchStage?.(text); } catch { /* cosmetic */ } };
stage('Down the stairs…');

const params = new URLSearchParams(location.search);
const uiRoot = document.getElementById('dg-ui');

/* ------------------------------------------------------------------ */
/* Renderer, scene, camera                                             */
/* ------------------------------------------------------------------ */

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
attachPixelRatio(renderer);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'scene';
renderer.domElement.setAttribute('aria-label', 'Dead Giveaway: the card room under the Bada Bing');
renderer.domElement.tabIndex = -1;
document.body.insertBefore(renderer.domElement, document.body.firstChild);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.name = 'deadgiveaway.scene';

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 60);
camera.name = 'deadgiveaway.camera';
scene.add(camera);

const M = makeMaterials();
const world = buildBackroom(scene, { renderer, M });
const T = world.anchors.table;
stage('Pulling out the chairs…');

/* ------------------------------------------------------------------ */
/* Audio: the club upstairs, through the floor                         */
/* ------------------------------------------------------------------ */

const audio = new AudioEngine();
/* The Bing's own bed (`ambience.club`: "muffled bass thump through walls"),
 * low and with the top cut off, because it is a floor away. */
const BED = 'ambience.club';
const BED_VOLUME = 0.05;
const BED_CUTOFF_HZ = 240;
const CUES = ['ambience.club', 'whiskey.swig', 'glass.set', 'cig.drag', 'cig.exhale', 'deadgiveaway.spit'];
let audioStarting = null;
function startAudio() {
  if (audioStarting) return audioStarting;
  audioStarting = audio.init()
    .then(() => audio.loadManifest({ names: [...CUES, ...ACTION_CUES] }))
    .then(() => {
      audio.startLoop('ambience.club', { volume: BED_VOLUME, ambience: true, fade: 3 });
      audio.setLoopCutoff(BED, BED_CUTOFF_HZ, 0.1);
    })
    .catch((error) => { console.warn('[DeadGiveaway] audio did not start:', error); });
  return audioStarting;
}
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => { startAudio(); }, { once: true, capture: true });
}

/* Voice wins the mix: the bed comes down while anybody at the table talks. */
const speakingNow = new Set();
let ducked = false;
function refreshDuck() {
  const want = speakingNow.size > 0;
  if (want === ducked || !audio.ready) return;
  ducked = want;
  audio.busLevel('ambience', want ? 0.22 : 0.55, want ? 0.15 : 0.6);
}

/* ------------------------------------------------------------------ */
/* Player and input                                                    */
/* ------------------------------------------------------------------ */

const player = new Player(camera, world);
player.mode = 'frozen';
player.enabled = false;

let paused = false;
let typing = false;
let seatedAt = null;          // the seat the camera is in, or null (orbiting)

const lobbyVisible = () => Boolean(lobby?.visible);
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let lastMouse = null;

function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable);
}

/** Ray from the crosshair when locked, from the cursor otherwise. */
function rayFrom(event) {
  camera.updateMatrixWorld();
  if (document.pointerLockElement === canvas || !event) pointerNdc.set(0, 0);
  else pointerNdc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  return raycaster;
}

function pickableNow() {
  const a = myAction(current);
  return a === 'vote' || a === 'payback';
}

const input = createFirstPersonInput({
  player,
  canvas,
  captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
  canEnable: () => seatedAt !== null && !paused && !lobbyVisible() && player.mode === 'seated',
  canHandleInput: () => !paused && !typing,
  controlState: () => ({ movementEnabled: false, interactionEnabled: false }),
  routes: {
    /* A click on a man during the vote (or the Rat's payback) picks him. It
     * works in both capture modes: with the pointer locked the ray leaves the
     * crosshair; with drag-look (or no capture at all) it leaves the cursor.
     * Returning true keeps the click from also asking for pointer lock. */
    mouseDown(event) {
      if (event.button !== 0 || seatedAt === null || !pickableNow()) return false;
      const id = seats.pick(rayFrom(event));
      if (id && ui.selectFromWorld(id)) return true;
      return false;
    },
  },
});
canvas.addEventListener('mousemove', (event) => { lastMouse = event; });

/* ------------------------------------------------------------------ */
/* Seats, actions                                                      */
/* ------------------------------------------------------------------ */

const faceHandles = new Map();   // playerId -> face-video handle
const streams = new Map();       // playerId -> { audio, video }
const mediaPrefs = { framing: null };

const seats = createSeatRig(scene, {
  world,
  audio,
  THREE,
  onRebuild: (playerId) => {
    /* The figure under a face feed was rebuilt (character change, or Tony
     * given a photo skull): the old handle points at a discarded mesh. */
    const old = faceHandles.get(playerId);
    if (old) { try { old.detach(); } catch { /* gone */ } faceHandles.delete(playerId); }
    queueMicrotask(() => refreshFace(playerId));
  },
});

const actions = createActions({
  scene,
  camera,
  audio,
  world,
  seats,
  smoke: world.haze,
  THREE,
  selfId: () => client?.me?.playerId ?? null,
  send: (kind, extra) => { client?.emit('act', { kind, ...extra }); },
});

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

let client = null;
let media = null;
let current = null;

const ERROR_TEXT = {
  room_not_found: 'There is no table with that code.',
  room_full: 'That table is full.',
  bad_name: 'That name will not do. Letters and numbers, twenty at most.',
  bad_character: 'Pick somebody from the grid.',
  not_host: 'Only the host can do that.',
  wrong_phase: 'Not now.',
  not_your_turn: 'It is not your turn.',
  bad_clue: 'A clue is one to sixty characters.',
  bad_vote: 'You cannot vote for that player.',
  bad_word: 'Pick one of the sixteen words.',
  bad_target: 'Not that player.',
  not_rat: 'Only the Rat does that.',
  rate_limited: 'Slow down.',
  timeout: 'The table did not answer. Check the connection.',
  closed: 'Not connected.',
  invalid: 'The table did not accept that.',
};
const errorText = (error) => ERROR_TEXT[error?.code] ?? error?.detail ?? error?.message ?? String(error);

/** Ask the server for something; a refusal is a toast, never an unhandled rejection. */
async function ask(event, payload = {}) {
  if (!client) return false;
  try {
    await client.request(event, payload);
    return true;
  } catch (error) {
    ui.toast(errorText(error), 'bad');
    return false;
  }
}

function connect() {
  try {
    client = connectDeadGiveaway({});
  } catch (error) {
    console.error('[DeadGiveaway] could not create the client:', error);
    lobby.say('Could not reach the table server.', true);
    return;
  }
  client.on('state', (state) => applyState(state));
  client.on('pose', ({ playerId, yaw, pitch } = {}) => seats.setPose(playerId, yaw, pitch));
  client.on('act', ({ playerId, kind, target } = {}) => actions.remote(playerId, kind, { target }));
  client.on('chat', (msg = {}) => ui.addChat({ name: msg.name ?? 'Somebody', text: String(msg.text ?? '') }));
  client.on('media:speaking', ({ playerId, speaking } = {}) => setSpeaking(playerId, speaking));
  client.on('room:closed', ({ reason } = {}) => {
    resetLocal();
    if (reason === 'replaced') {
      /* The same player sat down from another tab. Stop here entirely: a
       * reconnect from this tab would only take the seat back and bounce
       * the other one, forever. */
      client.close();
      client = null;
      lobby.say('You sat down at this table from another tab. Reload here to take the seat back.', true);
      return;
    }
    lobby.say(reason === 'room_not_found' ? 'That table has closed.' : 'The table closed.', true);
  });
  client.on('error', ({ code, message } = {}) => {
    /* rate_limited is the server shaping a burst of poses or gestures;
     * bad_target fires whenever an rtc:signal goes to a player who has just
     * dropped. Neither is something the player did wrong. */
    if (code === 'rate_limited' || code === 'bad_target') return;
    ui.toast(ERROR_TEXT[code] ?? message ?? 'The table refused that.', 'bad');
  });
  client.on('disconnect', () => { if (current) ui.toast('Lost the table. Reconnecting…', 'bad'); });
  client.on('reconnect', ({ rejoined } = {}) => { if (rejoined) ui.toast('Back at the table.'); });

  client.resume()
    .then((state) => { if (state) onJoined(); })
    .catch((error) => { lobby.say(`Could not rejoin your table: ${errorText(error)}`, true); });
}

function onJoined() {
  if (!client?.me) return;
  if (!media) {
    try {
      media = createTableMedia({
        client,
        selfId: client.me.playerId,
        onStream: (playerId, s) => { streams.set(playerId, s); refreshFace(playerId); applyVolume(playerId); },
        onSpeaking: (playerId, on) => setSpeaking(playerId, on),
      });
    } catch (error) {
      console.warn('[DeadGiveaway] media engine unavailable:', error);
      media = null;
    }
    mediaPanel.refresh();
    if (mediaPanel.prefs.enabled && media) mediaPanel.start();
  }
  if (client.state?.code) {
    const url = new URL(location.href);
    url.searchParams.set('code', client.state.code);
    history.replaceState(null, '', url);
  }
}

function setSpeaking(playerId, on) {
  if (!playerId) return;
  if (on) speakingNow.add(playerId); else speakingNow.delete(playerId);
  seats.setSpeaking(playerId, on);
  if (playerId === client?.me?.playerId) mediaPanel.setSpeaking(on);
  refreshDuck();
}

/* ------------------------------------------------------------------ */
/* Faces on heads                                                      */
/* ------------------------------------------------------------------ */

function refreshFace(playerId) {
  const me = client?.me?.playerId;
  if (!playerId || playerId === me) return;
  const p = current?.players?.find((q) => q.id === playerId);
  const video = streams.get(playerId)?.video ?? null;
  const want = Boolean(p?.cam && video && seats.headOf(playerId));
  const handle = faceHandles.get(playerId);
  if (!want) {
    if (handle) { handle.detach(); faceHandles.delete(playerId); }
    return;
  }
  if (handle?.attached) { handle.setStream(video); return; }
  if (seats.ensureFaceSurface(playerId)) return;   // rebuilt; onRebuild comes back here
  const head = seats.headOf(playerId);
  if (!head) return;
  const next = attachFaceVideo(head.person, video, { ...(mediaPrefs.framing ?? mediaPanel.prefs.framing) });
  if (next.attached) faceHandles.set(playerId, next);
}

function detachAllFaces() {
  for (const h of faceHandles.values()) { try { h.detach(); } catch { /* gone */ } }
  faceHandles.clear();
}

/* ------------------------------------------------------------------ */
/* Per-player volume and pan                                           */
/* ------------------------------------------------------------------ */

const volumes = new Map();
function applyVolume(playerId) {
  if (!media) return;
  media.setVolume(playerId, volumes.has(playerId) ? volumes.get(playerId) : 1);
}

const pans = new Map();
const _head = new THREE.Vector3();
function updatePans() {
  if (!media || !current) return;
  for (const p of current.players ?? []) {
    if (p.id === client?.me?.playerId) continue;
    const head = seats.headOf(p.id)?.head;
    if (!head) continue;
    head.getWorldPosition(_head).applyMatrix4(camera.matrixWorldInverse);
    const pan = Math.max(-1, Math.min(1, Math.atan2(_head.x, -_head.z) / (Math.PI / 2))) * 0.75;
    if (Math.abs((pans.get(p.id) ?? 99) - pan) > 0.05) {
      pans.set(p.id, pan);
      media.setPan(p.id, pan);
    }
  }
}

/* ------------------------------------------------------------------ */
/* State -> the room                                                   */
/* ------------------------------------------------------------------ */

let boardSig = '';
let clueSig = '';
let lastActionKey = '';

function applyState(state) {
  if (!state || typeof state !== 'object') return;
  current = state;
  const me = state.me?.playerId ?? client?.me?.playerId ?? null;
  const players = Array.isArray(state.players) ? state.players : [];

  /* The cast. */
  const taken = new Set();
  for (const p of players) {
    if (!Number.isInteger(p.seat)) continue;
    taken.add(p.seat);
    seats.occupy(p.seat, { playerId: p.id, characterId: p.character, name: p.name, isSelf: p.id === me });
    seats.setOut(p.id, Boolean(p.out));
  }
  for (const o of seats.occupied()) {
    if (!taken.has(o.seat)) {
      actions.forget(o.playerId);
      const h = faceHandles.get(o.playerId);
      if (h) { h.detach(); faceHandles.delete(o.playerId); }
      seats.vacate(o.seat);
    }
  }

  /* The board (only repainted when it changes: it is a canvas texture). */
  const b = boardModel(state);
  const nextBoardSig = JSON.stringify(b);
  if (nextBoardSig !== boardSig) {
    boardSig = nextBoardSig;
    world.board.paint({
      category: b.category || null, words: b.words, highlightIndex: b.highlightIndex, revealIndex: b.revealIndex, dim: b.dim,
    });
  }

  /* Clue cards on the felt, chips at every place, the turn marker. */
  const clues = state.phase === 'LOBBY' || state.phase === 'DEAL' ? [] : clueList(state);
  const nextClueSig = JSON.stringify(clues.map((c) => [c.seat, c.text]));
  if (nextClueSig !== clueSig) {
    clueSig = nextClueSig;
    world.clues.clear();
    for (const c of clues) if (Number.isInteger(c.seat)) world.clues.set(c.seat, c.text);
  }
  for (let s = 0; s < SEAT_COUNT; s++) {
    const p = players.find((q) => q.seat === s);
    world.chips.set(s, p ? Math.max(0, p.lives ?? 0) : 0);
  }
  world.marker.setTurn(state.phase === 'CLUES' && Number.isInteger(state.turnSeat) ? state.turnSeat : null);

  /* The reveal lights the Rat red at his seat; the count marks the accused. */
  const r = state.result;
  if (r?.ratId && r.roles) seats.setMark(r.ratId, 'rat');
  else seats.clearMarks('rat');
  if (state.phase === 'VOTE_RESULT' && r?.accusedId) seats.setMark(r.accusedId, 'accused');
  else seats.clearMarks('accused');

  /* Where I sit. */
  const mine = players.find((p) => p.id === me);
  if (mine && Number.isInteger(mine.seat)) sitAt(mine.seat);
  else standUp();

  ui.render(state);
  lobby.render(state);
  for (const p of players) refreshFace(p.id);

  /* When the server is waiting on a click from me, give back the cursor. */
  const action = myAction(state);
  const actionKey = `${state.phase}|${state.round}|${action}`;
  if (actionKey !== lastActionKey) {
    lastActionKey = actionKey;
    if (action && action !== 'clue' && document.pointerLockElement === canvas) input.releasePointerLock();
  }
  input.refresh('state');
  if (pauseMenu.isPaused()) renderVolumes();
}

/* ------------------------------------------------------------------ */
/* Sitting down and the lobby orbit                                    */
/* ------------------------------------------------------------------ */

const _e = new THREE.Euler(0, 0, 0, 'YXZ');

function sitAt(seat) {
  if (seatedAt === seat) return;
  const info = world.anchors.seats.find((s) => s.seat === seat);
  if (!info) return;
  if (seatedAt === null) {
    /* Glide in from wherever the orbit had the camera. */
    player.position.copy(camera.position);
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    player.yaw = _e.y;
    player.pitch = _e.x;
  }
  seatedAt = seat;
  const dx = T.x - info.x;
  const dz = T.z - info.z;
  const d = Math.hypot(dx, dz) || 1;
  const eyeY = info.eyeY ?? (info.sitY ?? 0.53) + 0.68;
  player.sitAt({
    /* Five centimetres in from the chair's centre: a man at a card table
     * sits forward. */
    position: new THREE.Vector3(info.x + (dx / d) * 0.05, eyeY, info.z + (dz / d) * 0.05),
    yaw: info.yaw,
    /* Level enough that the faces across the felt sit in the middle of the
     * view, low enough that the clue cards are in it too. */
    pitch: -0.14,
    /* Wide enough to see every chair and the board from any of them. */
    yawRange: Math.PI * 0.92,
    pitchMin: -1.05,
    pitchMax: 0.75,
    dur: 1.4,
  }, () => input.refresh('seated'));
}

function standUp() {
  if (seatedAt === null) return;
  seatedAt = null;
  player.mode = 'frozen';
  player.yawCenter = null;
  input.releasePointerLock();
}

let orbitT = 0;
function updateOrbit(dt) {
  const o = world.anchors.lobbyOrbit ?? { x: T.x, z: T.z, radius: 3, y: 2, lookY: T.topY };
  orbitT += dt * 0.07;
  camera.position.set(o.x + Math.sin(orbitT) * o.radius, o.y, o.z + Math.cos(orbitT) * o.radius);
  camera.lookAt(o.x, o.lookY, o.z);
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

const mediaPanel = createMediaPanel({
  getMedia: () => media,
  onStart: async (prefs) => {
    await media.start({ micId: prefs.micId, camId: prefs.camId, outId: prefs.outId, framing: prefs.framing, mic: prefs.mic, cam: prefs.cam });
    media.setSensitivity(prefs.sensitivity);
  },
  onFraming: (framing) => {
    mediaPrefs.framing = framing;
    for (const h of faceHandles.values()) h.setFraming(framing);
  },
});

const lobby = createLobby({
  root: uiRoot,
  seatCount: SEAT_COUNT,
  mediaPanel,
  initialCode: params.get('code') ?? '',
  intents: {
    async create({ name, character }) {
      if (!client) throw new Error('Not connected to the table server.');
      try { await client.create({ name, character }); } catch (error) { throw new Error(errorText(error)); }
      onJoined();
      lobby.say('');
    },
    async join({ code, name, character }) {
      if (!client) throw new Error('Not connected to the table server.');
      try { await client.join({ code, name, character }); } catch (error) { throw new Error(errorText(error)); }
      onJoined();
      lobby.say('');
    },
    seat: (seat) => ask('player:seat', { seat }),
    character: (character) => ask('player:character', { character }),
    start: () => ask('game:start', {}),
    leave: () => leaveRoom(),
  },
});

const ui = createTableUi({
  root: uiRoot,
  faceFor: (characterId) => characterById(characterId).face,
  legend: legendModel(ACTIONS, (kind) => actions.keyFor(kind)),
  onTypingChange: (on) => { typing = on; input.refresh('typing'); },
  onSelect: (id) => {
    if (id) seats.setMark(id, 'selected');
    else seats.clearMarks('selected');
  },
  intents: {
    clue: (text) => ask('game:clue', { text }),
    ready: (ready) => ask('game:readyToVote', { ready }),
    callVote: () => ask('game:callVote', {}),
    vote: (target) => ask('game:vote', { target }),
    lastWord: (index) => ask('game:lastWord', { index }),
    payback: (target) => ask('game:payback', { target }),
    next: () => ask('game:next', {}),
    abort: () => ask('game:abort', {}),
    skipTurn: () => ask('game:skipTurn', {}),
    chat: (text) => { client?.emit('chat', { text }); },
  },
});

async function leaveRoom() {
  const m = media;
  media = null;
  try { m?.close(); } catch { /* closing anyway */ }
  try { await client?.leave(); } catch { /* leaving anyway */ }
  resetLocal();
}

function resetLocal() {
  const m = media;
  media = null;
  try { m?.close(); } catch { /* closing anyway */ }
  detachAllFaces();
  streams.clear();
  speakingNow.clear();
  refreshDuck();
  for (const o of seats.occupied()) actions.forget(o.playerId);
  seats.vacateAll();
  seats.clearMarks();
  world.clues.clear();
  for (let s = 0; s < SEAT_COUNT; s++) world.chips.set(s, 0);
  world.marker.setTurn(null);
  world.board.paint({ dim: true });
  boardSig = '';
  clueSig = '';
  current = null;
  standUp();
  ui.reset();
  mediaPanel.reset();
  lobby.collapse(false);
  lobby.render(null);
  const url = new URL(location.href);
  url.searchParams.delete('code');
  history.replaceState(null, '', url);
}

/* Keys that belong to the table, not to the Player. */
window.addEventListener('keydown', (event) => {
  if (paused || event.repeat || isTypingTarget(event.target) || !current) return;
  const kind = actions.kindForKey(event.code);
  if (kind) {
    if (seatedAt !== null && player.mode === 'seated') actions.perform(kind);
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyB') { ui.toggleBoard(); event.preventDefault(); } else if (event.code === 'KeyC') { ui.toggleClues(); event.preventDefault(); } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
    input.releasePointerLock();
    ui.openChat();
    event.preventDefault();
  }
});

/* ------------------------------------------------------------------ */
/* Pause                                                               */
/* ------------------------------------------------------------------ */

const pauseMenu = createPauseMenu({
  title: 'Dead Giveaway',
  getObjective: () => (current ? `${phaseLabel(current.phase)} — ${turnText(current)}` : 'Open a table, or join one with its code.'),
  instructions: () => [
    'Mouse — look round the table (click to capture, or drag).',
    `${ACTIONS.map((k, i) => `${i + 1} ${k}`).join(' · ')}.`,
    'B — the board. C — the clues. Enter — chat. Tab — this menu.',
    'Vote and Payback — click the man, or his name, then confirm.',
  ],
  showSaveData: () => false,
  actions: [
    { label: 'Leave the table', onSelect: () => { void leaveRoom(); } },
  ],
  onPause: () => {
    paused = true;
    input.suspend();
    mediaPanel.mount(pauseMediaSlot);
    mediaPanel.refresh();
    renderVolumes();
  },
  onResume: () => {
    paused = false;
    mediaPanel.mount(document.querySelector('#dg-lobby .dg-media-slot'));
    input.resume({ requestPointerLock: false });
  },
});

/* The table's own section in the pause menu: media settings and a volume
 * per player. Inserted above the shared settings. */
const pauseSection = document.createElement('section');
pauseSection.className = 'dg-pause-section';
pauseSection.innerHTML = '<div class="scene-pause-label">Mic and camera</div><div class="dg-pause-media"></div>'
  + '<div class="scene-pause-label">Voices at the table</div><div class="dg-pause-volumes"></div>';
const pauseMediaSlot = pauseSection.querySelector('.dg-pause-media');
const pauseVolumes = pauseSection.querySelector('.dg-pause-volumes');
pauseMenu.root.querySelector('[data-scene-settings]')?.before(pauseSection);

function renderVolumes() {
  const me = client?.me?.playerId;
  const others = (current?.players ?? []).filter((p) => p.id !== me);
  pauseVolumes.replaceChildren(...(others.length ? others.map((p) => {
    const row = document.createElement('label');
    row.className = 'scene-setting slider dg-volume';
    const name = document.createElement('span');
    name.textContent = p.name;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round((volumes.get(p.id) ?? 1) * 100));
    slider.addEventListener('input', () => {
      volumes.set(p.id, Number(slider.value) / 100);
      applyVolume(p.id);
    });
    row.append(name, slider);
    return row;
  }) : [Object.assign(document.createElement('p'), { textContent: 'Nobody else is at the table.' })]));
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

let poseClock = 0;
let panClock = 0;
let hoverClock = 0;
let lastPose = { yaw: NaN, pitch: NaN };

function sendPose() {
  if (!client || seatedAt === null || player.mode !== 'seated') return;
  const yaw = +player.yaw.toFixed(3);
  const pitch = +player.pitch.toFixed(3);
  if (Math.abs(yaw - lastPose.yaw) < 0.004 && Math.abs(pitch - lastPose.pitch) < 0.004) return;
  lastPose = { yaw, pitch };
  client.emit('pose', { yaw, pitch });
}

function updateHover() {
  if (seatedAt === null || !pickableNow()) { canvas.style.cursor = ''; return; }
  const locked = document.pointerLockElement === canvas;
  if (!locked && !lastMouse) return;
  const id = seats.pick(rayFrom(locked ? null : lastMouse));
  canvas.style.cursor = !locked && id ? 'pointer' : '';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('contextmenu', (event) => { if (event.target === canvas) event.preventDefault(); });

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (seatedAt === null) updateOrbit(dt);
  else player.update(dt);
  camera.updateMatrixWorld();
  seats.update(dt);
  actions.update(dt);
  world.update(dt, camera);
  audio.updateListener(camera);

  poseClock += dt;
  if (poseClock >= 0.1) { poseClock = 0; sendPose(); }
  panClock += dt;
  if (panClock >= 0.25) { panClock = 0; updatePans(); }
  hoverClock += dt;
  if (hoverClock >= 0.1) { hoverClock = 0; updateHover(); }

  renderer.render(scene, camera);
}

updateOrbit(0);
requestAnimationFrame(frame);
document.getElementById('loading')?.classList.add('done');
stage('');

/* ------------------------------------------------------------------ */
/* Published for the verifier and the console                         */
/* ------------------------------------------------------------------ */

const _p = new THREE.Vector3();
window.DEAD_GIVEAWAY = {
  scene, camera, renderer, world, seats, actions, player, input, audio, ui, lobby, roster: ROSTER,
  get client() { return client; },
  get media() { return media; },
  get state() { return current; },
  get seatedAt() { return seatedAt; },
  faces: faceHandles,
  /** Screen position (CSS px) of a seated player's head, for a real click. */
  screenOf(playerId) {
    const head = seats.headOf(playerId)?.head;
    if (!head) return null;
    camera.updateMatrixWorld();
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(_p);
    _p.y -= 0.25;
    _p.project(camera);
    if (_p.z > 1) return null;
    return { x: (_p.x + 1) / 2 * window.innerWidth, y: (1 - _p.y) / 2 * window.innerHeight };
  },
  /** Turn the seated camera toward a player (verifier convenience; same Player look path). */
  lookAt(playerId) {
    const head = seats.headOf(playerId)?.head;
    if (!head || player.mode !== 'seated') return false;
    head.getWorldPosition(_p);
    const dx = _p.x - player.position.x;
    const dz = _p.z - player.position.z;
    const want = Math.atan2(-dx, -dz);
    player.yaw += Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw));
    player.pitch = Math.atan2(_p.y - 0.25 - player.position.y, Math.hypot(dx, dz));
    /* Write the camera now rather than on the next frame, which on a
     * software rasteriser can be seconds away. */
    player.update(0);
    camera.updateMatrixWorld();
    return true;
  },
  boardState: () => ({ ...world.board.state, words: [...world.board.state.words] }),
  chipsAt: (seat) => world.chips.countAt(seat),
  clueAt: (seat) => world.clues.textAt(seat),
};

connect();

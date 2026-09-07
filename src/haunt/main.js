// Dev haunt — the Stranger's client. A blind spirit-cam plus a strip of
// prank buttons, talking to the host over src/core/online/haunt-link.js.
//
// Protocol out: {t:'hello', name} once after join,
//               {t:'pose', x, y, z, yaw, pitch} at 10 Hz while moving,
//               {t:'cmd', cmd, arg} on button press.
// Protocol in:  {t:'scene', id} and {t:'player', x, z, yaw}.

import * as THREE from 'three';
import { joinHaunt } from '../core/online/haunt-link.js';

// ---------------------------------------------------------------- DOM

const $ = (id) => document.getElementById(id);
const joinCard = $('join-card');
const joinBtn = $('join-btn');
const ritual = $('ritual');
const offerOut = $('offer-out');
const answerIn = $('answer-in');
const connectBtn = $('connect-btn');
const copyOfferBtn = $('copy-offer');
const joinError = $('join-error');
const nameInput = $('name-input');
const surface = $('surface');
const sceneChip = $('scene-chip');
const hostChip = $('host-chip');
const statusChip = $('status-chip');
const whisperText = $('whisper-text');
const muteBtn = $('mute-btn');
const canvas = $('scene');


// ---------------------------------------------------------------- three

const EYE_HEIGHT = 1.66;
const MOVE_SPEED = 4.2;       // m/s — brisk walk, easy to trail a player
const POSE_INTERVAL_MS = 100; // 10 Hz

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080a);
scene.fog = new THREE.Fog(0x07080a, 8, 55);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, EYE_HEIGHT, 6);
camera.rotation.order = 'YXZ'; // yaw then pitch, FPS-style

// The dev sees nothing of the real scene: a void with a grid to stand on.
const grid = new THREE.GridHelper(200, 200, 0x2a3a4a, 0x161c24);
scene.add(grid);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0x0a0c10 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

scene.add(new THREE.AmbientLight(0x404050, 1.2));

// Host marker: a glowing orb, a beam so it reads from far away through the
// fog, and a nose cone showing which way the player is facing.
const hostMarker = new THREE.Group();
const orb = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 20, 16),
  new THREE.MeshBasicMaterial({ color: 0xd8b25a }));
orb.position.y = 1.2;
hostMarker.add(orb);
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.05, 40, 8, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xd8b25a, transparent: true, opacity: 0.25,
    depthWrite: false,
  }));
beam.position.y = 20;
hostMarker.add(beam);
const nose = new THREE.Mesh(
  new THREE.ConeGeometry(0.14, 0.5, 10),
  new THREE.MeshBasicMaterial({ color: 0xe8d9a8 }));
nose.rotation.x = Math.PI / 2; // point along -Z after yaw
nose.position.set(0, 1.2, -0.55);
hostMarker.add(nose);
const glow = new THREE.PointLight(0xd8b25a, 2.5, 12);
glow.position.y = 1.4;
hostMarker.add(glow);
hostMarker.visible = false;
scene.add(hostMarker);

// Where the last {t:'player'} put them; the marker eases toward it.
const hostTarget = { x: 0, z: 0, yaw: 0, seen: false };

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- input

let yaw = 0;
let pitch = 0;
const keys = Object.create(null);

function typingInField() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

window.addEventListener('keydown', (e) => {
  if (typingInField()) return;
  keys[e.code] = true;
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k of Object.keys(keys)) keys[k] = false;
});

canvas.addEventListener('click', () => {
  if (!surface.classList.contains('hidden') && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0023;
  pitch -= e.movementY * 0.0023;
  pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
});

// ---------------------------------------------------------------- link

let link = null;
let alive = false;

function setStatus(text, dead) {
  statusChip.textContent = text;
  statusChip.classList.toggle('dead', !!dead);
}

function onMessage(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.t === 'scene') {
    sceneChip.textContent = 'SCENE: ' + String(obj.id);
  } else if (obj.t === 'player') {
    hostTarget.x = Number(obj.x) || 0;
    hostTarget.z = Number(obj.z) || 0;
    hostTarget.yaw = Number(obj.yaw) || 0;
    if (!hostTarget.seen) {
      hostTarget.seen = true;
      hostMarker.position.set(hostTarget.x, 0, hostTarget.z);
      hostMarker.visible = true;
    }
  }
}

function onClose() {
  alive = false;
  setStatus('LINK DEAD', true);
  for (const b of document.querySelectorAll('#pranks button')) b.disabled = true;
}

function safeSend(obj) {
  if (!alive || !link) return;
  try { link.send(obj); } catch (err) {
    console.warn('[haunt] send failed', err);
  }
}

// ---------------------------------------------------------------- join

/* The paste ritual: OPEN THE LINE mints the offer code (and takes the mic —
 * this click is the user gesture), the host hands back a reply, WALK IN
 * completes it. No broker anywhere; see haunt-link.js. */
async function join() {
  joinError.classList.add('hidden');
  joinBtn.disabled = true;
  joinBtn.textContent = 'OPENING THE LINE…';
  try {
    link = await joinHaunt({ onMessage, onClose });
  } catch (err) {
    console.warn('[haunt] line failed', err);
    joinBtn.disabled = false;
    joinBtn.textContent = 'OPEN THE LINE';
    joinError.textContent = 'No line. ' + (err && err.message ? err.message : '');
    joinError.classList.remove('hidden');
    return;
  }
  offerOut.value = link.offerBase64;
  ritual.classList.remove('hidden');
  joinBtn.textContent = 'LINE OPEN';
}

async function walkIn() {
  const name = nameInput.value.trim() || 'The Stranger';
  const reply = answerIn.value.trim();
  if (!reply) { answerIn.focus(); return; }
  connectBtn.disabled = true;
  connectBtn.textContent = 'CROSSING…';
  try {
    await link.acceptAnswer(reply);
  } catch (err) {
    console.warn('[haunt] walk-in failed', err);
    connectBtn.disabled = false;
    connectBtn.textContent = 'WALK IN';
    joinError.textContent = err && err.message ? err.message : 'The door did not open.';
    joinError.classList.remove('hidden');
    return;
  }

  alive = true;
  safeSend({ t: 'hello', name });

  // Mic state readout; the link may not have delivered a mic (denied, no device).
  const track = link.micStream && link.micStream.getAudioTracks
    ? link.micStream.getAudioTracks()[0]
    : null;
  if (!track) {
    muteBtn.textContent = 'MIC: NONE';
    muteBtn.classList.remove('live');
    muteBtn.disabled = true;
  }

  joinCard.classList.add('hidden');
  surface.classList.remove('hidden');
  canvas.requestPointerLock();
  startLoops();
}

joinBtn.addEventListener('click', join);
connectBtn.addEventListener('click', walkIn);
copyOfferBtn.addEventListener('click', () => {
  navigator.clipboard?.writeText(offerOut.value);
  copyOfferBtn.textContent = 'COPIED';
  setTimeout(() => { copyOfferBtn.textContent = 'COPY'; }, 1400);
});
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// ---------------------------------------------------------------- pranks

for (const btn of document.querySelectorAll('button.prank')) {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    const msg = { t: 'cmd', cmd };
    if (cmd === 'whisper') {
      const text = whisperText.value.trim();
      if (!text) { whisperText.focus(); return; }
      msg.arg = text;
      whisperText.value = '';
    }
    safeSend(msg);
    btn.classList.add('sent');
    setTimeout(() => btn.classList.remove('sent'), 250);
  });
}

whisperText.addEventListener('keydown', (e) => {
  e.stopPropagation(); // WASD must not drift the cam while typing
  if (e.key === 'Enter') document.querySelector('[data-cmd="whisper"]').click();
});

let muted = false;
muteBtn.addEventListener('click', () => {
  const track = link && link.micStream && link.micStream.getAudioTracks
    ? link.micStream.getAudioTracks()[0]
    : null;
  if (!track) return;
  muted = !muted;
  track.enabled = !muted;
  muteBtn.textContent = muted ? 'MIC: MUTED' : 'MIC: LIVE';
  muteBtn.classList.toggle('muted', muted);
  muteBtn.classList.toggle('live', !muted);
});

// ---------------------------------------------------------------- loops

let poseTimer = 0;
const lastPose = { x: NaN, y: NaN, z: NaN, yaw: NaN, pitch: NaN };

function posesDiffer() {
  const p = camera.position;
  return Math.abs(p.x - lastPose.x) > 1e-4 ||
         Math.abs(p.y - lastPose.y) > 1e-4 ||
         Math.abs(p.z - lastPose.z) > 1e-4 ||
         Math.abs(yaw - lastPose.yaw) > 1e-4 ||
         Math.abs(pitch - lastPose.pitch) > 1e-4;
}

function sendPose() {
  const p = camera.position;
  lastPose.x = p.x; lastPose.y = p.y; lastPose.z = p.z;
  lastPose.yaw = yaw; lastPose.pitch = pitch;
  safeSend({
    t: 'pose',
    x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
    yaw: +yaw.toFixed(4), pitch: +pitch.toFixed(4),
  });
}

function startLoops() {
  // One pose right away so the host sees the spirit arrive, then 10 Hz
  // only while the pose actually changes.
  sendPose();
  poseTimer = setInterval(() => {
    if (alive && posesDiffer()) sendPose();
  }, POSE_INTERVAL_MS);
  window.addEventListener('beforeunload', () => {
    clearInterval(poseTimer);
    if (link) try { link.close(); } catch (err) { /* already down */ }
  });
}

const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  // WASD relative to yaw, flat on the ground plane.
  moveDir.set(0, 0, 0);
  if (keys.KeyW) moveDir.z -= 1;
  if (keys.KeyS) moveDir.z += 1;
  if (keys.KeyA) moveDir.x -= 1;
  if (keys.KeyD) moveDir.x += 1;
  if (moveDir.lengthSq() > 0) {
    moveDir.normalize().multiplyScalar(MOVE_SPEED * dt);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    camera.position.x += moveDir.x * cos + moveDir.z * sin;
    camera.position.z += moveDir.z * cos - moveDir.x * sin;
  }
  camera.position.y = EYE_HEIGHT;
  camera.rotation.set(pitch, yaw, 0);

  // Ease the host marker toward its last reported spot.
  if (hostTarget.seen) {
    const k = 1 - Math.pow(0.001, dt); // framerate-independent lerp
    hostMarker.position.x += (hostTarget.x - hostMarker.position.x) * k;
    hostMarker.position.z += (hostTarget.z - hostMarker.position.z) * k;
    hostMarker.rotation.y = hostTarget.yaw;
    orb.position.y = 1.2 + Math.sin(performance.now() * 0.003) * 0.12;

    const dx = hostTarget.x - camera.position.x;
    const dz = hostTarget.z - camera.position.z;
    hostChip.textContent = 'HOST: ' + Math.hypot(dx, dz).toFixed(1) + 'm';
  }

  renderer.render(scene, camera);
}
animate();

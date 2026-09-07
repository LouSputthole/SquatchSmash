/**
 * THE DEV HAUNT, HOST SIDE — runs inside a live scene page.
 *
 * `?haunt=1` puts a small paste-ritual panel on the scene: paste the code the
 * dev's haunt.html minted, hand back the reply, and from that moment a
 * stranger nobody invited is standing in the room — moving on the dev's own
 * WASD, speaking with the dev's actual voice through a panner parked in his
 * chest, and wired to whatever pranks the scene chose to expose.
 *
 * Deliberately additive: nothing here runs unless the query flag is present,
 * so every gate that boots a scene in its default state — geometry census
 * included — sees a world with no stranger in it.
 *
 * Scene contract (all optional beyond THREE/scene/camera):
 *   initHauntHost({
 *     THREE, scene, camera,
 *     sceneId: 'luxury_apartment',
 *     getPlayer: () => ({ x, z, yaw }),      // streamed to the dev at 5 Hz
 *     onFrame: (fn) => {},                   // register fn(dt) on the loop
 *     pranks: { whisper(text), fart(), lights(), phone(), nudge(), jumpscare() },
 *   })
 */

import { hostHaunt } from './haunt-link.js';

const PANEL_CSS = `
#haunt-panel { position: fixed; right: 10px; bottom: 10px; z-index: 4000;
  background: rgba(10,10,12,.92); color: #cfc9b8; border: 1px solid #3a382f;
  font: 12px/1.5 ui-monospace, monospace; padding: 10px 12px; width: 300px;
  border-radius: 6px; }
#haunt-panel h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: .12em;
  color: #d3b356; }
#haunt-panel textarea { width: 100%; height: 52px; background: #16161a;
  color: #9aa; border: 1px solid #333; font: 10px ui-monospace, monospace;
  resize: none; }
#haunt-panel button { background: #2a2822; color: #d3b356; border: 1px solid
  #4a4638; padding: 3px 10px; margin-top: 6px; cursor: pointer;
  font: 11px ui-monospace, monospace; }
#haunt-panel .st { color: #7d8a6a; margin-top: 4px; min-height: 16px; }
`;

/** A stranger nobody can place: dark suit, wide shoulders, no face to speak
 * of. Primitives only — the haunt must not disturb any scene's authored
 * geometry census, so it borrows nothing from the cast builders. */
function buildStranger(THREE) {
  const group = new THREE.Group();
  group.name = 'haunt-stranger';
  const suit = new THREE.MeshLambertMaterial({ color: 0x1c1d22 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a705d });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.72, 10), suit);
  torso.position.y = 1.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 1.58;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 12), suit);
  brim.position.y = 1.66;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 12), suit);
  crown.position.y = 1.74;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 8), suit);
  legL.position.set(-0.1, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.1;
  group.add(torso, head, brim, crown, legL, legR);
  return group;
}

export function initHauntHost({
  THREE, scene, camera, sceneId = 'scene',
  getPlayer = null, onFrame = null, pranks = {},
} = {}) {
  if (new URLSearchParams(location.search).get('haunt') !== '1') return null;

  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
  const panel = document.createElement('div');
  panel.id = 'haunt-panel';
  panel.innerHTML = `
    <h4>THE STRANGER'S LINE</h4>
    <div>Paste his code:</div>
    <textarea id="haunt-offer" spellcheck="false"></textarea>
    <button id="haunt-accept">ACCEPT</button>
    <div id="haunt-reply-wrap" hidden>
      <div>Hand this back:</div>
      <textarea id="haunt-reply" readonly spellcheck="false"></textarea>
      <button id="haunt-copy">COPY</button>
    </div>
    <div class="st" id="haunt-status">waiting</div>`;
  document.body.appendChild(panel);
  const status = (line) => { panel.querySelector('#haunt-status').textContent = line; };

  let stranger = null;
  let devName = 'The Stranger';
  const target = { x: 0, y: 0, z: 0, yaw: 0 };
  /* hello and the voice track race each other across the pipe; the status
   * line composes both instead of letting the later one clobber the first. */
  const arrival = { joined: false, voice: false };
  const renderArrival = () => {
    if (arrival.joined && arrival.voice) status(`${devName} walked in · line open`);
    else if (arrival.joined) status(`${devName} walked in`);
    else if (arrival.voice) status('a line is open');
  };

  /* Voice: its own context, spatialized by a panner parked in the stranger's
   * chest. Chrome will not feed a WebRTC stream into WebAudio unless some
   * media element also owns it, so a muted <audio> holds the stream open. */
  let audio = null;
  const attachVoice = (stream) => {
    const keepAlive = new Audio();
    keepAlive.srcObject = stream;
    keepAlive.muted = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    source.connect(panner).connect(ctx.destination);
    audio = { ctx, panner, keepAlive };
    if (ctx.state === 'suspended') ctx.resume();
    arrival.voice = true;
    renderArrival();
  };

  const link = hostHaunt({
    onMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        devName = String(msg.name || 'The Stranger').slice(0, 40);
        if (!stranger) {
          stranger = buildStranger(THREE);
          scene.add(stranger);
        }
        link.send({ t: 'scene', id: sceneId });
        arrival.joined = true;
        renderArrival();
      } else if (msg.t === 'pose' && stranger) {
        target.x = Number(msg.x) || 0;
        target.y = Number(msg.y) || 0;
        target.z = Number(msg.z) || 0;
        target.yaw = Number(msg.yaw) || 0;
      } else if (msg.t === 'cmd') {
        const handler = pranks[msg.cmd];
        if (typeof handler === 'function') handler(msg.arg);
        else console.warn(`haunt: scene has no '${msg.cmd}' prank`);
      }
    },
    onVoice: attachVoice,
    onLeave() {
      status('the line went dead');
      if (stranger) { scene.remove(stranger); stranger = null; }
    },
  });

  panel.querySelector('#haunt-accept').addEventListener('click', async () => {
    const code = panel.querySelector('#haunt-offer').value;
    if (!code.trim()) return;
    try {
      status('answering…');
      const reply = await link.acceptOffer(code);
      panel.querySelector('#haunt-reply').value = reply;
      panel.querySelector('#haunt-reply-wrap').hidden = false;
      status('hand the reply back');
    } catch (error) {
      status(`bad code: ${error.message}`);
    }
  });
  panel.querySelector('#haunt-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(panel.querySelector('#haunt-reply').value);
  });

  /* The stranger eases toward the dev's pose; the voice follows his chest and
   * the listener rides the scene camera. Player pose flows back at 5 Hz. */
  let sinceReport = 0;
  const tick = (dt = 0.016) => {
    if (stranger) {
      const k = Math.min(1, dt * 10);
      stranger.position.x += (target.x - stranger.position.x) * k;
      stranger.position.y += ((target.y - 1.66) - stranger.position.y) * k;
      stranger.position.z += (target.z - stranger.position.z) * k;
      stranger.rotation.y = target.yaw;
    }
    if (audio && stranger) {
      const chest = stranger.position;
      audio.panner.setPosition(chest.x, chest.y + 1.3, chest.z);
      const listener = audio.ctx.listener;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      if (listener.setPosition) {
        listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
        listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
      }
    }
    sinceReport += dt;
    if (sinceReport > 0.2 && link.connected) {
      sinceReport = 0;
      const player = getPlayer?.();
      if (player) link.send({ t: 'player', x: player.x, z: player.z, yaw: player.yaw });
    }
  };

  if (onFrame) onFrame(tick);
  else {
    let last = performance.now();
    const raf = () => {
      const now = performance.now();
      tick(Math.min(0.1, (now - last) / 1000));
      last = now;
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  return { link, tick, get stranger() { return stranger; } };
}

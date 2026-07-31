/**
 * What is on the television.
 *
 * The desk PC has an OS and apps because you sit at it and use it. The TV is
 * the opposite: you look at it from the couch and the only thing you ever do
 * is change what is on. So this is a channel list, not a shell.
 *
 * A channel is any object with:
 *   name              what the on-screen banner says
 *   draw(g, t, w, h)  paint the frame; `t` is seconds since it came on
 *   glow()            optional { colour, intensity } for the room
 *   enter(ctx)        optional; it just came on. { audio, position }
 *   leave()           optional; something else is on now, or the set is off
 *
 * That is deliberately the smallest interface that could work, because the
 * content is going to be written by somebody else. Everything below is
 * placeholder: real channels replace them and nothing else has to change.
 *
 * Static between channels is not decoration -- it is how you can tell the set
 * did something when a channel you have not written yet draws nothing.
 */

import { drawSquatchSilhouette } from '../world/textures.js';
import { assetUrl } from './assets.js';

export const W = 512;
export const H = 288;

const VIDEO_DIR = 'assets/video/';

/** Seconds of snow when the channel changes. */
const SWITCH = 0.45;

/* ------------------------------------------------------------------ */
/* Placeholder channels                                                */
/* ------------------------------------------------------------------ */

function snow(g, amount = 1) {
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255 * amount;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** Bars, a clock, and nothing else. The channel that is always there. */
const TEST_CARD = {
  name: 'SQUATCH TEST CARD',
  draw(g, t) {
    const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    const bw = W / bars.length;
    for (let i = 0; i < bars.length; i++) {
      g.fillStyle = bars[i];
      g.fillRect(i * bw, 0, bw + 1, H * 0.74);
    }
    g.fillStyle = '#0b0b0b';
    g.fillRect(0, H * 0.74, W, H * 0.26);
    g.fillStyle = '#d8d8d8';
    g.font = '600 15px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('NO SIGNAL — 97.8 SQUATCH TV', W / 2, H * 0.86);
    g.font = '12px ui-monospace, monospace';
    g.fillStyle = '#7b7b7b';
    g.fillText(`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, W / 2, H * 0.94);
    g.textAlign = 'left';
  },
  glow: () => ({ colour: 0xbfc6cf, intensity: 1.15 }),
};

/** Rolling text over a flat backdrop, the way a local station fills airtime. */
const NOTICES = {
  name: 'COMMUNITY NOTICES',
  lines: [
    'SQUATCH MEETING — WEDNESDAY 7PM — THE USUAL PLACE',
    'BRING NOTHING',
    'IRISH IS BRINGING THE EGGS',
    'THE HALL IS COLD. IT HAS ALWAYS BEEN COLD.',
    'LOST: ONE BANDANA. RED. SENTIMENTAL VALUE.',
    'EAT THOSE PASTURE RAISED EGGS FOLKS',
  ],
  draw(g, t) {
    g.fillStyle = '#08243a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#0d3a5c';
    g.fillRect(0, H * 0.18, W, H * 0.64);
    g.fillStyle = '#e8f0f8';
    g.font = '700 17px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('COMMUNITY NOTICES', W / 2, H * 0.13);
    g.font = '13px ui-monospace, monospace';
    const step = 26;
    const shift = (t * 22) % (this.lines.length * step);
    for (let i = 0; i < this.lines.length; i++) {
      const y = H * 0.30 + i * step - shift + this.lines.length * step;
      const wrapped = ((y - H * 0.20) % (this.lines.length * step)) + H * 0.20;
      if (wrapped < H * 0.20 || wrapped > H * 0.80) continue;
      g.fillStyle = i === 0 ? '#ffd782' : '#cfe2f2';
      g.fillText(this.lines[i], W / 2, wrapped);
    }
    g.textAlign = 'left';
  },
  glow: () => ({ colour: 0x4f86b8, intensity: 1.0 }),
};

/** Off-air. Snow and a hum, at four in the morning in a flat. */
const STATIC = {
  name: 'STATIC',
  draw(g) { snow(g, 0.55); },
  glow: () => ({ colour: 0x9aa2ab, intensity: 0.85 }),
};

/* ------------------------------------------------------------------ */
/* Real programming                                                    */
/* ------------------------------------------------------------------ */

/**
 * A nature documentary about the one subject this world has. Hills, fog, a
 * distant figure that keeps its distance, and captions written by somebody
 * who has been in that hide far too long.
 */
const SQUATCH_WATCH = {
  name: 'SQUATCH WATCH',
  captions: [
    'DAY 41. HE KNOWS WE ARE HERE.',
    'THE GUIDE REFUSES TO GO PAST THE TREELINE.',
    'HE TOOK THE SANDWICHES. ALL OF THEM.',
    'WE HAVE NAMED HIM GARY. GARY DOES NOT CARE.',
    'DAY 44. GARY HAS A FAMILY. THEY ALSO DO NOT CARE.',
    'FUNDING RUNS OUT FRIDAY.',
  ],
  draw(g, t) {
    // Dusk sky, three ranges of hills, and fog that never quite lifts.
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#26343c');
    sky.addColorStop(0.6, '#48545a');
    sky.addColorStop(1, '#6a6e66');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const drift = (t * 6) % W;
    for (const [base, amp, col] of [
      [0.52, 26, '#31413c'], [0.66, 20, '#273630'], [0.82, 14, '#1c2a24'],
    ]) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) {
        g.lineTo(x, H * base + Math.sin((x + drift * 0.4) * 0.02) * amp);
      }
      g.lineTo(W, H);
      g.fill();
    }
    // Gary, crossing left to right forever, far enough away to be deniable.
    const gx = ((t * 14) % (W + 120)) - 60;
    drawSquatchSilhouette(g, gx, H * 0.74, 52, 'rgba(10,14,12,0.9)');
    g.fillStyle = 'rgba(214,222,214,0.10)';
    g.fillRect(0, H * (0.62 + Math.sin(t * 0.3) * 0.03), W, H * 0.1);
    // The broadcast furniture.
    g.fillStyle = '#c22';
    g.fillRect(14, 12, 8, 8);
    g.fillStyle = '#e8e8e0';
    g.font = '700 12px ui-monospace, monospace';
    g.fillText('LIVE', 28, 20);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, H - 34, W, 22);
    g.fillStyle = '#f0e6c8';
    g.font = '600 13px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(this.captions[Math.floor(t / 7) % this.captions.length], W / 2, H - 19);
    g.textAlign = 'left';
  },
  glow: () => ({ colour: 0x54685e, intensity: 1.0 }),
};

/** Somebody paying for airtime at this hour is selling exactly one thing. */
const JERKY_CHANNEL = {
  name: 'THE JERKY CHANNEL',
  draw(g, t) {
    g.fillStyle = '#2a1410';
    g.fillRect(0, 0, W, H);
    // The product, rotating on velvet like it cost something.
    const cx = W / 2;
    const cy = H * 0.46;
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.sin(t * 0.8) * 0.35);
    g.fillStyle = '#6a3018';
    g.beginPath();
    g.ellipse(0, 0, 88, 30, 0.2, 0, 7);
    g.fill();
    g.strokeStyle = '#4a1f0e';
    g.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(-70, i * 9);
      g.quadraticCurveTo(0, i * 9 + 6, 70, i * 9 - 4);
      g.stroke();
    }
    g.restore();
    const pulse = Math.sin(t * 4) > 0;
    g.fillStyle = '#f2d8a0';
    g.font = '900 26px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.fillText('SILVERBACK RESERVE', cx, 42);
    g.font = '700 15px "Trebuchet MS", sans-serif';
    g.fillStyle = '#d8b070';
    g.fillText('AIR-CURED AT ALTITUDE · ASK NOBODY WHERE', cx, 64);
    g.fillStyle = pulse ? '#ffd23a' : '#c89a2a';
    g.font = '900 30px "Trebuchet MS", sans-serif';
    g.fillText('$19.99', cx, H - 44);
    g.font = '700 13px "Trebuchet MS", sans-serif';
    g.fillStyle = '#e8d8c0';
    g.fillText(pulse ? 'CALL NOW. NOT LATER. NOW.' : 'OPERATORS ARE STANDING AROUND', cx, H - 22);
    g.textAlign = 'left';
  },
  glow: () => ({ colour: 0xb07030, intensity: 1.1 }),
};

/** The esports broadcast for the game on the desk. The casters never sleep. */
const COUNTER_SQUATCH_LEGENDS = {
  name: 'COUNTER-SQUATCH LEGENDS',
  feed: [
    'xXgroundhogXx cheated SQUATCHLORD',
    'SQUATCHLORD is having a moment',
    'beans planted the pinecone',
    'xXgroundhogXx cheated beans',
    'ADMIN: nothing we can do',
  ],
  draw(g, t) {
    g.fillStyle = '#101820';
    g.fillRect(0, 0, W, H);
    // A top-down map diagram with two sites and a dotted rush route.
    g.strokeStyle = '#2c3c4c';
    g.lineWidth = 2;
    g.strokeRect(W * 0.12, H * 0.16, W * 0.5, H * 0.62);
    g.strokeRect(W * 0.18, H * 0.24, W * 0.14, H * 0.18);
    g.strokeRect(W * 0.44, H * 0.5, W * 0.14, H * 0.2);
    g.fillStyle = '#c8a24a';
    g.font = '700 13px ui-monospace, monospace';
    g.fillText('A', W * 0.24, H * 0.34);
    g.fillText('B', W * 0.5, H * 0.61);
    g.setLineDash([4, 6]);
    g.lineDashOffset = -t * 20;
    g.strokeStyle = '#e0533a';
    g.beginPath();
    g.moveTo(W * 0.14, H * 0.74);
    g.quadraticCurveTo(W * 0.36, H * 0.6, W * 0.5, H * 0.58);
    g.stroke();
    g.setLineDash([]);
    // Score bug and the feed.
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(W * 0.3, 8, W * 0.4, 26);
    g.fillStyle = '#e8e8e0';
    g.font = '900 15px ui-monospace, monospace';
    g.textAlign = 'center';
    const round = Math.floor(t / 12);
    g.fillText(`SQUATCH ${7 + (round % 6)} — ${6 + ((round * 3) % 7)} RANGERS`, W / 2, 26);
    g.textAlign = 'right';
    g.font = '11px ui-monospace, monospace';
    for (let i = 0; i < 3; i++) {
      const line = this.feed[(Math.floor(t / 4) + i) % this.feed.length];
      g.fillStyle = i === 0 ? '#f0c860' : '#9ab0c4';
      g.fillText(line, W - 14, H * 0.2 + i * 16);
    }
    g.textAlign = 'left';
  },
  glow: () => ({ colour: 0x3a5a7a, intensity: 1.05 }),
};

/* ------------------------------------------------------------------ */
/* Tape                                                                */
/* ------------------------------------------------------------------ */

/**
 * A channel that is a video file, blitted frame by frame onto the same canvas
 * everything else paints on -- so the screen, its glow and its texture upload
 * carry on knowing nothing about it.
 *
 * The element is built the first time the channel comes on rather than at
 * load, because a set that is never switched on should not have fetched a
 * video, and `enter()` runs off a keypress, which is the gesture autoplay
 * wants. Its sound goes out through a panner at the set, at the same rolloff
 * the radio uses: a telly across the room is a telly across the room.
 *
 * The file being missing is normal -- a bundled build has no assets/ folder to
 * fetch from -- so a failure is a card on screen, not an exception.
 */
function videoChannel({ name, file, card, glow }) {
  let el = null;
  let wired = false;
  let failed = false;

  return {
    name,
    enter({ audio, position } = {}) {
      if (failed) return;
      if (!el) {
        el = document.createElement('video');
        el.src = assetUrl(VIDEO_DIR, file);
        el.loop = true;
        el.playsInline = true;
        el.preload = 'auto';
        el.addEventListener('error', () => { failed = true; });
      }
      /* No audio system (the club office set) or none running yet: play it
       * muted rather than blaring out of the middle of the player's head. */
      if (!wired && audio?.ready && position) {
        try {
          const ctx = audio.ctx;
          const src = ctx.createMediaElementSource(el);
          const tone = ctx.createBiquadFilter();
          tone.type = 'lowpass';
          tone.frequency.value = 5200;
          const gain = ctx.createGain();
          gain.gain.value = 0.9;
          const panner = ctx.createPanner();
          panner.panningModel = 'HRTF';
          panner.distanceModel = 'inverse';
          panner.refDistance = 3.0;
          panner.maxDistance = 26;
          panner.rolloffFactor = 1.1;
          if (panner.positionX) {
            panner.positionX.value = position.x;
            panner.positionY.value = position.y;
            panner.positionZ.value = position.z;
          } else {
            panner.setPosition(position.x, position.y, position.z);
          }
          src.connect(tone);
          tone.connect(gain);
          gain.connect(panner);
          panner.connect(audio.busMusic);
          /* It may have been switched on once before the audio context was
           * running, and played muted. Now there is somewhere to send it. */
          el.muted = false;
          wired = true;
        } catch {
          el.muted = true;    // ponytail: one graph per element, so this only ever fails once
          wired = true;
        }
      }
      if (!wired) el.muted = true;
      const p = el.play();
      if (p && p.catch) p.catch(() => { /* the card covers it */ });
    },
    leave() {
      try { el?.pause(); } catch { /* never started */ }
    },
    draw(g, t) {
      g.fillStyle = '#050608';
      g.fillRect(0, 0, W, H);
      if (!failed && el && el.readyState >= 2) {
        g.drawImage(el, 0, 0, W, H);
        return;
      }
      // Still loading, or there is no tape. Either way: say so, do not freeze.
      snow(g, 0.35);
      g.fillStyle = 'rgba(6,8,12,0.72)';
      g.fillRect(0, H * 0.40, W, H * 0.20);
      g.fillStyle = '#e8dcc0';
      g.font = '700 15px ui-monospace, monospace';
      g.textAlign = 'center';
      g.fillText(failed ? card : 'TRACKING…', W / 2, H * 0.52);
      g.textAlign = 'left';
    },
    glow: () => glow,
  };
}

/**
 * Somebody's tape of the Austin trip, on the shelf under the telly, played
 * more times than anyone will admit to.
 */
const AUSTIN_TAPE = videoChannel({
  name: 'THE AUSTIN TAPE',
  file: 'austin-2.mp4',
  card: 'NO TAPE IN THE MACHINE',
  glow: { colour: 0xb8c4d4, intensity: 1.15 },
});

export const CHANNELS = [
  SQUATCH_WATCH, JERKY_CHANNEL, COUNTER_SQUATCH_LEGENDS, AUSTIN_TAPE,
  NOTICES, TEST_CARD, STATIC,
];

/* ------------------------------------------------------------------ */

export class Tv {
  constructor({ audio } = {}) {
    this.audio = audio;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.channels = CHANNELS.slice();
    this.index = 0;
    this.on = false;
    this.t = 0;
    this._switch = 0;
    this._paint();
  }

  get channel() { return this.channels[this.index % this.channels.length]; }

  /** Add a channel at runtime, so content can be dropped in from anywhere. */
  register(channel) {
    this.channels.push(channel);
    return channel;
  }

  toggle() {
    this.on = !this.on;
    this.t = 0;
    this._switch = this.on ? SWITCH : 0;
    this.audio?.play('tv.click', { volume: 0.6, position: this.position });
    if (this.on) this._enter();
    else { this._leave(); this._paint(); }
    return this.on;
  }

  next() {
    if (!this.on) return;
    this._leave();
    this.index = (this.index + 1) % this.channels.length;
    this.t = 0;
    this._switch = SWITCH;
    this.audio?.play('tv.click', { volume: 0.45, position: this.position });
    this._enter();
  }

  /* A channel that is a running thing rather than a drawing -- a tape, say --
   * needs to know when it is on and when it is not. Everything else ignores
   * these, which is why they are optional. */
  _enter() {
    try {
      this.channel.enter?.({ audio: this.audio, position: this.position });
    } catch { /* a channel somebody is still writing */ }
  }

  _leave() {
    try { this.channel.leave?.(); } catch { /* as above */ }
  }

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this._switch > 0) this._switch -= dt;
    this._paint();
  }

  _paint() {
    const g = this.g;
    if (!this.on) {
      g.fillStyle = '#05070a';
      g.fillRect(0, 0, W, H);
      return;
    }
    if (this._switch > 0) { snow(g, 0.9); return; }
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    try {
      this.channel.draw(g, this.t, W, H);
    } catch {
      /* A channel that throws is a channel somebody is still writing. Show
       * that rather than freezing on its last good frame. */
      snow(g, 0.7);
    }
    // Channel banner for a moment after a change.
    if (this.t < 2.4) {
      const a = Math.min(1, (2.4 - this.t) / 0.6);
      g.globalAlpha = a;
      g.fillStyle = 'rgba(8,10,14,0.72)';
      g.fillRect(12, H - 40, 200, 26);
      g.fillStyle = '#ffd782';
      g.font = '600 12px ui-monospace, monospace';
      g.fillText(`${this.index + 1}  ${this.channel.name}`, 20, H - 22);
      g.globalAlpha = 1;
    }
  }

  glow() {
    if (!this.on) return { colour: 0x000000, intensity: 0 };
    if (this._switch > 0) return { colour: 0xb9c0c8, intensity: 1.3 };
    return this.channel.glow?.() ?? { colour: 0x9fb4cc, intensity: 1.0 };
  }
}

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
 *
 * That is deliberately the smallest interface that could work, because the
 * content is going to be written by somebody else. Everything below is
 * placeholder: real channels replace them and nothing else has to change.
 *
 * Static between channels is not decoration -- it is how you can tell the set
 * did something when a channel you have not written yet draws nothing.
 */

export const W = 512;
export const H = 288;

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

export const CHANNELS = [TEST_CARD, NOTICES, STATIC];

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
    if (!this.on) this._paint();
    return this.on;
  }

  next() {
    if (!this.on) return;
    this.index = (this.index + 1) % this.channels.length;
    this.t = 0;
    this._switch = SWITCH;
    this.audio?.play('tv.click', { volume: 0.45, position: this.position });
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

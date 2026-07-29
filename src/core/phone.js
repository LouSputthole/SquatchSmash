/**
 * The phone.
 *
 * Built around calls rather than around a screen. The messages are here
 * because a phone without them is not a phone, but the thing this exists for
 * is somebody ringing you: a name, a photograph of nobody, and a voice you
 * have to sit and listen to because there is no way to skim a phone call.
 *
 * That is why calls have priority over every other screen and why answering
 * one takes the phone over completely. A message you can glance at and put
 * away; a call happens at its own speed and there is nothing to do while it
 * does. It is the one thing in this flat that is not on your schedule.
 *
 * A call is data:
 *
 *   { at: 9.5, from: 'Uncle Lou', vo: 'call.lou',
 *     lines: ['Kid.', 'Tomorrow. Seven.'], meeting: true }
 *
 * `at` is the in-game hour, counted the way Chat counts it, so a call lands
 * whether or not the phone is in your pocket. `vo` names the bank: line N of
 * the call plays `vo.<bank>.<n+1>`, so recording them is dropping mp3s in a
 * folder and nothing here changes. Until they exist the line still shows on
 * screen and holds for a reading beat, which is exactly how the radio behaved
 * before its hosts were recorded.
 */

export const W = 300;
export const H = 620;

/** Rings for this long before they give up. */
const RING_SECONDS = 14;
/** A line with no recording holds for this long, plus a bit per character. */
const READ_BASE = 1.4;
const READ_PER_CHAR = 0.045;

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

/**
 * Who rings, and when. Times are in-game hours from the start of Tuesday.
 *
 * Every one of these is somebody checking on him the day before his
 * initiation, and not one of them says so directly.
 */
export const CALLS = [
  {
    at: 9.2,
    from: 'Uncle Lou',
    vo: 'call.lou',
    meeting: true,
    lines: [
      'Kid. You up?',
      'Good. Listen — I sent you a thing this morning, do not make it weird.',
      'Tomorrow. Seven. Bring nothing.',
      'And eat something. You never eat.',
    ],
  },
  {
    at: 13.6,
    from: 'BOOSKI',
    vo: 'call.booski',
    meeting: true,
    lines: [
      'you good?',
      'im driving tomorrow so dont get a bus or whatever it is you do',
      'seven. the usual place.',
      'right. thats it. thats the call.',
    ],
  },
  {
    at: 16.1,
    from: 'Goy Corp · HR',
    vo: 'call.hr',
    lines: [
      'Hi! Just following up on my email.',
      'It looks like the message I received back from you may have been sent in error.',
      'I am going to log it as a system fault and we will say no more about it.',
      'So — can I put you down for tomorrow evening?',
    ],
  },
  {
    at: 19.4,
    from: 'Unknown',
    vo: 'call.unknown',
    lines: [
      '…',
      'Is this the man from the flat.',
      'It is. It is the man from the flat.',
      'We will see you tomorrow.',
    ],
  },
];

/** Threads already on the phone when he wakes up. */
export const THREADS = [
  {
    who: 'BOOSKI',
    messages: [
      { them: true, text: 'you awake' },
      { them: true, text: 'answer your phone' },
      { them: true, text: 'im not doing this over text' },
    ],
  },
  {
    who: 'Uncle Lou',
    messages: [
      { them: true, text: 'Sent you an email. Read it properly.' },
      { them: true, text: 'Not on the phone. Properly.' },
    ],
  },
  {
    who: 'MUM',
    messages: [
      { them: true, text: 'Is tomorrow the thing' },
      { them: true, text: 'You never tell me anything' },
      { them: true, text: 'Love you' },
    ],
  },
];

/* ------------------------------------------------------------------ */

export class Phone {
  /**
   * @param {object} o
   * @param {object} o.time  the in-game clock
   * @param {object} o.audio
   * @param {object[]} o.calls scheduled calls; pass [] when story owns them
   */
  constructor({ time, audio, calls = CALLS } = {}) {
    this.time = time;
    this.audio = audio;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');

    this.threads = THREADS.map((t) => ({ ...t, messages: t.messages.slice() }));
    this.calls = calls.slice();
    /** Calls that have already happened, newest first. */
    this.recents = [];

    /** 'home' | 'messages' | 'thread' | 'recents' */
    this.screen = 'home';
    this.thread = 0;
    this.missed = 0;

    /** The call in progress, if any. */
    this.call = null;
    this._next = 0;
    this._t = 0;
    /** Fires when a call with `meeting` is actually answered. */
    this.onMeeting = null;
    /** Fires for every answered call, with the exact call definition. */
    this.onAnswered = null;
  }

  /** Hours since the start of Tuesday, the way Chat counts. */
  _clock() {
    return ((this.time?.day ?? 1) - 1) * 24 + (this.time?.hour ?? 0);
  }

  get ringing() { return !!this.call && this.call.state === 'ringing'; }
  get inCall() { return !!this.call && this.call.state === 'talking'; }

  /* ---------------------------------------------------------------- */
  /* Calls                                                             */
  /* ---------------------------------------------------------------- */

  /** Start one now, whatever the clock says. */
  ring(def) {
    if (this.call) return false;
    this.call = { def, state: 'ringing', t: 0, line: -1, hold: 0, source: null };
    this.audio?.startLoop?.('phone.ring', { volume: 0.5 });
    return true;
  }

  answer() {
    if (!this.ringing) return;
    this.audio?.stopLoop?.('phone.ring', 0.08);
    this.call.state = 'talking';
    this.call.t = 0;
    this.call.line = -1;
    this.call.hold = 0;
    this.onAnswered?.(this.call.def);
    if (this.call.def.meeting) this.onMeeting?.();
  }

  /** Hang up, or refuse to pick up. Both end the same way. */
  hangUp() {
    if (!this.call) return;
    const { def, state } = this.call;
    this.audio?.stopLoop?.('phone.ring', 0.08);
    try { this.call.source?.stop(); } catch { /* already finished */ }
    this.audio?.play?.('phone.hangup', { volume: 0.5 });
    this.recents.unshift({
      who: def.from,
      missed: state === 'ringing',
      at: this._stamp(),
    });
    if (state === 'ringing') this.missed++;
    this.call = null;
  }

  _stamp() {
    const h = Math.floor(this.time?.hour ?? 0) % 24;
    const m = Math.floor(((this.time?.hour ?? 0) % 1) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  /** Move to the next line of the call, or end it. */
  _advance() {
    const c = this.call;
    c.line++;
    if (c.line >= c.def.lines.length) {
      // He does not get to say goodbye. Nobody on this phone says goodbye.
      this.hangUp();
      return;
    }
    const text = c.def.lines[c.line];
    const cue = `vo.${c.def.vo}.${c.line + 1}`;
    c.source = this.audio?.play?.(cue, { volume: 0.95 }) ?? null;
    /* A recorded line holds for exactly as long as it takes to say. One that
     * has not been recorded yet holds for a reading beat instead, so the call
     * still has a shape before a single mp3 exists. */
    c.hold = c.source?.buffer
      ? c.source.buffer.duration + 0.45
      : READ_BASE + text.length * READ_PER_CHAR;
  }

  /* ---------------------------------------------------------------- */

  update(dt) {
    // Anything due on the clock rings, whether or not he is holding it.
    const now = this._clock();
    while (this._next < this.calls.length && this.calls[this._next].at <= now) {
      const def = this.calls[this._next++];
      if (!this.call) this.ring(def);
      else this.recents.unshift({ who: def.from, missed: true, at: this._stamp() });
    }

    if (!this.call) return;
    this.call.t += dt;

    if (this.call.state === 'ringing') {
      if (this.call.t >= RING_SECONDS) this.hangUp();
      return;
    }

    this.call.hold -= dt;
    if (this.call.hold <= 0) this._advance();
  }

  /* ---------------------------------------------------------------- */
  /* Screens                                                           */
  /* ---------------------------------------------------------------- */

  /** One button, contextual, because there is one button on a phone. */
  press() {
    if (this.ringing) { this.answer(); return; }
    if (this.inCall) { this.hangUp(); return; }
    if (this.screen === 'home') { this.screen = 'messages'; return; }
    if (this.screen === 'messages') { this.screen = 'thread'; return; }
    if (this.screen === 'thread') { this.screen = 'recents'; this.missed = 0; return; }
    this.screen = 'home';
  }

  /** The other direction, for moving between threads. */
  cycle(dir = 1) {
    if (this.screen !== 'messages' && this.screen !== 'thread') return;
    this.thread = (this.thread + dir + this.threads.length) % this.threads.length;
  }

  draw() {
    const g = this.g;
    g.fillStyle = '#0a0c10';
    g.fillRect(0, 0, W, H);

    // Status bar, always.
    g.fillStyle = '#8b93a2';
    g.font = '600 13px ui-monospace, SFMono-Regular, monospace';
    g.textAlign = 'left';
    g.fillText(this._stamp(), 14, 26);
    g.textAlign = 'right';
    g.fillText('▮▮▯  4%', W - 14, 26);
    g.textAlign = 'left';

    if (this.call) { this._drawCall(g); return; }
    if (this.screen === 'messages') this._drawThreadList(g);
    else if (this.screen === 'thread') this._drawThread(g);
    else if (this.screen === 'recents') this._drawRecents(g);
    else this._drawHome(g);
  }

  _drawHome(g) {
    g.textAlign = 'center';
    g.fillStyle = '#e6ecf5';
    g.font = '600 54px ui-monospace, monospace';
    g.fillText(this._stamp().replace(/ [AP]M$/, ''), W / 2, H * 0.30);
    g.font = '13px ui-monospace, monospace';
    g.fillStyle = '#79839a';
    g.fillText('Tuesday', W / 2, H * 0.30 + 26);

    const unread = this.threads.reduce((n, t) => n + t.messages.length, 0);
    const rows = [
      ['Messages', `${unread} unread`, '#e06a6a'],
      ['Recents', this.missed ? `${this.missed} missed` : 'nothing today', this.missed ? '#e06a6a' : '#5f6a7d'],
    ];
    let y = H * 0.52;
    for (const [label, sub, colour] of rows) {
      g.fillStyle = '#151a24';
      g.fillRect(20, y - 26, W - 40, 54);
      g.textAlign = 'left';
      g.fillStyle = '#dbe3ef';
      g.font = '600 15px ui-monospace, monospace';
      g.fillText(label, 34, y - 4);
      g.fillStyle = colour;
      g.font = '12px ui-monospace, monospace';
      g.fillText(sub, 34, y + 15);
      y += 68;
    }
    this._hint(g, '[E] open');
  }

  _drawThreadList(g) {
    g.textAlign = 'left';
    g.fillStyle = '#e6ecf5';
    g.font = '600 17px ui-monospace, monospace';
    g.fillText('Messages', 18, 62);
    let y = 92;
    for (let i = 0; i < this.threads.length; i++) {
      const t = this.threads[i];
      if (i === this.thread) {
        g.fillStyle = '#1c2432';
        g.fillRect(12, y - 20, W - 24, 56);
        g.fillStyle = '#5b8fd8';
        g.fillRect(12, y - 20, 3, 56);
      }
      g.fillStyle = '#dbe3ef';
      g.font = '600 14px ui-monospace, monospace';
      g.fillText(t.who, 26, y);
      g.fillStyle = '#79839a';
      g.font = '12px ui-monospace, monospace';
      g.fillText(clip(g, t.messages[t.messages.length - 1].text, W - 60), 26, y + 20);
      y += 68;
    }
    this._hint(g, '[E] read  ·  wheel: another');
  }

  _drawThread(g) {
    const t = this.threads[this.thread];
    g.textAlign = 'left';
    g.fillStyle = '#e6ecf5';
    g.font = '600 16px ui-monospace, monospace';
    g.fillText(t.who, 18, 62);

    let y = 100;
    g.font = '13px ui-monospace, monospace';
    for (const m of t.messages) {
      const lines = wrap(g, m.text, W - 96);
      const hgt = lines.length * 19 + 14;
      g.fillStyle = m.them ? '#1e2530' : '#2f4f7d';
      const x = m.them ? 16 : 80;
      round(g, x, y, W - 96, hgt, 12);
      g.fillStyle = '#dfe6f1';
      for (let i = 0; i < lines.length; i++) g.fillText(lines[i], x + 14, y + 21 + i * 19);
      y += hgt + 10;
    }
    this._hint(g, '[E] recents');
  }

  _drawRecents(g) {
    g.textAlign = 'left';
    g.fillStyle = '#e6ecf5';
    g.font = '600 17px ui-monospace, monospace';
    g.fillText('Recents', 18, 62);
    if (!this.recents.length) {
      g.fillStyle = '#5f6a7d';
      g.font = '13px ui-monospace, monospace';
      g.fillText('Nobody has rung.', 18, 96);
      g.fillText('Nobody rings.', 18, 118);
    }
    let y = 96;
    for (const r of this.recents.slice(0, 8)) {
      g.fillStyle = r.missed ? '#e06a6a' : '#dbe3ef';
      g.font = '600 14px ui-monospace, monospace';
      g.fillText(`${r.missed ? '↙' : '↗'} ${r.who}`, 18, y);
      g.fillStyle = '#5f6a7d';
      g.font = '12px ui-monospace, monospace';
      g.fillText(r.at, 18, y + 18);
      y += 48;
    }
    this._hint(g, '[E] home');
  }

  _drawCall(g) {
    const c = this.call;
    g.textAlign = 'center';
    g.fillStyle = '#79839a';
    g.font = '13px ui-monospace, monospace';
    g.fillText(c.state === 'ringing' ? 'incoming call' : 'connected', W / 2, H * 0.20);

    g.fillStyle = '#e6ecf5';
    g.font = '600 24px ui-monospace, monospace';
    g.fillText(c.def.from, W / 2, H * 0.26);

    // The photograph of nobody.
    const r = 46;
    g.fillStyle = '#1b2230';
    g.beginPath();
    g.arc(W / 2, H * 0.38, r, 0, 7);
    g.fill();
    g.fillStyle = '#39435a';
    g.font = '600 34px ui-monospace, monospace';
    g.fillText(c.def.from[0].toUpperCase(), W / 2, H * 0.38 + 12);

    if (c.state === 'ringing') {
      // A ring you can see, so it is obvious what the button does.
      const pulse = 0.5 + Math.sin(c.t * 6) * 0.5;
      g.globalAlpha = 0.25 + pulse * 0.55;
      g.strokeStyle = '#5ad07a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2, H * 0.38, r + 10 + pulse * 8, 0, 7);
      g.stroke();
      g.globalAlpha = 1;
      this._hint(g, '[E] answer   ·   [Q] decline');
      return;
    }

    // What is being said, one line at a time.
    const text = c.def.lines[c.line] ?? '';
    g.font = '14px ui-monospace, monospace';
    const lines = wrap(g, text, W - 56);
    let y = H * 0.56;
    g.fillStyle = '#cdd7e6';
    for (const ln of lines) { g.fillText(ln, W / 2, y); y += 21; }

    g.fillStyle = '#4d5768';
    g.font = '12px ui-monospace, monospace';
    g.fillText(`${Math.floor(c.t / 60)}:${String(Math.floor(c.t % 60)).padStart(2, '0')}`, W / 2, H * 0.80);
    this._hint(g, '[E] hang up');
  }

  _hint(g, text) {
    g.textAlign = 'center';
    g.fillStyle = '#4d5768';
    g.font = '11px ui-monospace, monospace';
    g.fillText(text, W / 2, H - 22);
    g.textAlign = 'left';
  }
}

/* ------------------------------------------------------------------ */

function clip(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function wrap(g, text, max) {
  const out = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
  }
  out.push(line);
  return out;
}

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

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
 *     lines: ['Kid.', 'Tomorrow. Seven.'],
 *     replies: ['Uncle Lou.', 'Seven. I will be there.'], meeting: true }
 *
 * `at` is the in-game hour, counted the way Chat counts it, so a call lands
 * whether or not the phone is in your pocket. `vo` names the bank: line N of
 * the call plays `vo.<bank>.<n+1>`, so recording them is dropping mp3s in a
 * folder and nothing here changes. Until they exist the line still shows on
 * screen and holds for a reading beat, which is exactly how the radio behaved
 * before its hosts were recorded.
 *
 * `replies` is the other half of the conversation, and optional. A call used
 * to be one man talking and a silence where the other one was; `replies[i]` is
 * what the man holding the phone says back to `lines[i]`, out loud, from
 * `vo.<bank>.tony.<i+1>` -- the same bank, so a call is one folder, and the
 * same reading-beat fallback, so his half works unrecorded exactly as the
 * caller's half always has. A hole in `replies` is a line he lets go past him.
 */

export const W = 300;
export const H = 620;

/**
 * Rings for this long before they give up.
 *
 * The ring cue is four seconds, so this is four and a half of them. It was
 * fourteen -- three and a bit -- and a story call you have to cross the room
 * for is a story call you can lose by being in the bathroom. Exported because
 * the story schedules its retries around it and the two numbers drifting apart
 * is how you get a caller ringing back before he has finished giving up.
 */
export const RING_SECONDS = 18;
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
    from: 'BOOSKIBRO',
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
    who: 'BOOSKIBRO',
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

/**
 * Both sides of a call, in the order they are said.
 *
 * Exported because it is the only place that knows how a call's cue names are
 * built, and everything that wants to check a call has a voice -- a verifier,
 * a test, whatever comes next -- should ask here rather than rebuild the
 * string and drift.
 *
 * @param {object} def a call definition
 * @returns {{who: 'them'|'me', text: string, cue: string}[]}
 */
export function callScript(def) {
  const turns = [];
  const lines = def?.lines ?? [];
  for (let i = 0; i < lines.length; i++) {
    turns.push({ who: 'them', text: lines[i], cue: `vo.${def.vo}.${i + 1}` });
    const reply = def.replies?.[i];
    if (reply) turns.push({ who: 'me', text: reply, cue: `vo.${def.vo}.tony.${i + 1}` });
  }
  return turns;
}

/* ------------------------------------------------------------------ */

export class Phone {
  /**
   * @param {object} o
   * @param {object} o.time  the in-game clock
   * @param {object} o.audio
   * @param {object[]} o.calls scheduled calls; pass [] when story owns them
   */
  constructor({
    time,
    audio,
    calls = CALLS,
    threads = THREADS,
    onThreadRead = null,
    onCallState = null,
  } = {}) {
    this.time = time;
    this.audio = audio;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');

    this.threads = [];
    this.setThreads(threads);
    this.calls = calls.slice();
    this.onThreadRead = onThreadRead;
    /** Notifies the scene when a connected call starts or ends. */
    this.onCallState = onCallState;
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
  get unreadCount() { return this.threads.filter((thread) => thread.unread).length; }

  /** The phone is a held item. Every idle screen must say how to pocket it. */
  idleHint() {
    if (this.screen === 'messages') return '[E] read  ·  wheel: another  ·  [Q] pocket';
    if (this.screen === 'thread') return 'wheel: another  ·  [E] recents  ·  [Q] pocket';
    if (this.screen === 'recents') return '[E] home  ·  [Q] pocket';
    return '[E] open  ·  [Q] pocket';
  }

  /** Replace story-derived content without losing which thread is selected. */
  setThreads(threads = THREADS) {
    const selectedId = this.threads?.[this.thread]?.id;
    this.threads = threads.map((thread, i) => ({
      id: thread.id ?? `thread-${i}`,
      who: thread.who ?? 'UNKNOWN',
      readEventId: thread.readEventId ?? null,
      unread: thread.unread === true,
      messages: (thread.messages ?? []).map((message) => ({ ...message })),
    }));
    const selected = this.threads.findIndex((thread) => thread.id === selectedId);
    this.thread = selected >= 0
      ? selected : Math.min(this.thread ?? 0, Math.max(0, this.threads.length - 1));
  }

  _readSelectedThread() {
    const selected = this.threads[this.thread];
    if (!selected?.unread) return;
    selected.unread = false;
    this.onThreadRead?.(selected);
  }

  /* ---------------------------------------------------------------- */
  /* Calls                                                             */
  /* ---------------------------------------------------------------- */

  /** Start one now, whatever the clock says. */
  ring(def) {
    if (this.call) return false;
    this.call = {
      def, state: 'ringing', t: 0, line: -1, hold: 0, source: null,
      turns: callScript(def),
    };
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
    this.onCallState?.(true, this.call.def);
    this.onAnswered?.(this.call.def);
    if (this.call.def.meeting) this.onMeeting?.();
  }

  /** Hang up, or refuse to pick up. Required story calls only end naturally. */
  hangUp({ force = false } = {}) {
    if (!this.call) return false;
    const { def, state } = this.call;
    if (state === 'talking' && def.allowHangup === false && !force) return false;
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
    if (state === 'talking') this.onCallState?.(false, def);
    return true;
  }

  _stamp() {
    const h = Math.floor(this.time?.hour ?? 0) % 24;
    const m = Math.floor(((this.time?.hour ?? 0) % 1) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  /** Move to the next thing said by either of them, or end the call. */
  _advance() {
    const c = this.call;
    c.line++;
    const turn = c.turns[c.line];
    if (!turn) {
      // He does not get to say goodbye. Nobody on this phone says goodbye.
      this.hangUp({ force: true });
      return;
    }
    /* His own voice is in the room and the caller's is coming out of an
     * earpiece held to his head, so they are not quite the same loudness. */
    c.source = this.audio?.play?.(turn.cue, {
      volume: turn.who === 'me' ? 0.88 : 0.95,
    }) ?? null;
    /* A recorded line holds for exactly as long as it takes to say. One that
     * has not been recorded yet holds for a reading beat instead, so the call
     * still has a shape before a single mp3 exists -- which is what carries
     * his half of every call until somebody records it. */
    c.hold = c.source?.buffer
      ? c.source.buffer.duration + 0.45
      : READ_BASE + turn.text.length * READ_PER_CHAR;
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
    if (this.screen === 'messages') { this.screen = 'thread'; this._readSelectedThread(); return; }
    if (this.screen === 'thread') { this.screen = 'recents'; this.missed = 0; return; }
    this.screen = 'home';
  }

  /** The other direction, for moving between threads. */
  cycle(dir = 1) {
    if (this.screen !== 'messages' && this.screen !== 'thread') return;
    if (!this.threads.length) return;
    this.thread = (this.thread + dir + this.threads.length) % this.threads.length;
    if (this.screen === 'thread') this._readSelectedThread();
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

    const unread = this.unreadCount;
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
    this._hint(g, this.idleHint());
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
      const latest = t.messages[t.messages.length - 1]?.text ?? 'nothing here';
      g.fillText(clip(g, latest, W - 60), 26, y + 20);
      if (t.unread) {
        g.fillStyle = '#e06a6a';
        g.beginPath();
        g.arc(W - 28, y - 6, 5, 0, 7);
        g.fill();
      }
      y += 68;
    }
    this._hint(g, this.idleHint());
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
      const label = m.who && m.who !== t.who ? `${m.who}: ` : '';
      const lines = wrap(g, `${label}${m.text}`, W - 96);
      const hgt = lines.length * 19 + 14;
      g.fillStyle = m.them ? '#1e2530' : '#2f4f7d';
      const x = m.them ? 16 : 80;
      round(g, x, y, W - 96, hgt, 12);
      g.fillStyle = '#dfe6f1';
      for (let i = 0; i < lines.length; i++) g.fillText(lines[i], x + 14, y + 21 + i * 19);
      y += hgt + 10;
    }
    this._hint(g, this.idleHint());
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
    this._hint(g, this.idleHint());
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

    /* What is being said, one line at a time, by whichever of them is saying
     * it. The caller's name is already at the top of the screen, so the label
     * only has to say when it is NOT him -- and his own name is not in his own
     * phone, so it says "you". */
    const turn = c.turns?.[c.line];
    const mine = turn?.who === 'me';
    g.fillStyle = '#4d5768';
    g.font = '11px ui-monospace, monospace';
    g.fillText(mine ? 'you' : c.def.from.toLowerCase(), W / 2, H * 0.50);

    const text = turn?.text ?? '';
    g.font = '14px ui-monospace, monospace';
    const lines = wrap(g, text, W - 56);
    let y = H * 0.56;
    g.fillStyle = mine ? '#8fa8c8' : '#cdd7e6';
    for (const ln of lines) { g.fillText(ln, W / 2, y); y += 21; }

    g.fillStyle = '#4d5768';
    g.font = '12px ui-monospace, monospace';
    g.fillText(`${Math.floor(c.t / 60)}:${String(Math.floor(c.t % 60)).padStart(2, '0')}`, W / 2, H * 0.80);
    this._hint(g, c.def.allowHangup === false ? 'connected · listen' : '[E] hang up');
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

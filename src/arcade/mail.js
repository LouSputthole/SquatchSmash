/**
 * SQUATCH MAIL -- the inbox on the desk PC.
 *
 * There is one message that matters and it arrived while you were asleep. The
 * rest is what an inbox is: a receipt, a newsletter nobody signed up for, and
 * a thread from the boys that has been going for two days.
 *
 * It is the fourth way to find out about the meeting, after the note on the
 * corkboard, the radio, and Booski typing into a server nobody is in. None of
 * them is the intended route -- the point is that the information is lying
 * around in four places and it is still possible to spend the whole day not
 * looking at any of them.
 *
 * An app in the SquatchOS sense: the OS hands it the drawing context and the
 * input while it has focus. See os.js.
 */
import { W, H } from './os.js';

const LIST_W = 244;
const ROW_H = 46;
const HEADER_H = 30;

/**
 * Newest first. `meeting` marks the one that counts as having been told.
 *
 * Bodies are PARAGRAPHS, not lines. The pane wraps them at draw time, so a
 * line break in here is a real one -- a blank line, a list, a quoted reply --
 * and never a guess about how wide the reading pane happens to be.
 */
const MESSAGES = [
  {
    from: 'People Operations',
    addr: 'people@goycorp.com',
    subject: 'Notice of separation',
    time: '4:51 AM',
    unread: true,
    fired: true,
    body: [
      'Dear Associate,',
      '',
      'Following the Q3 performance review cycle, Goy Corp has elected to end '
        + 'your employment effective immediately. This decision reflects sustained '
        + 'underperformance against your role expectations and is final.',
      '',
      'Your building access was revoked at 4:50 AM. Please do not attend the '
        + 'site. Any personal effects at your workstation will be boxed and held '
        + 'for thirty (30) days.',
      '',
      'Your final pay will be issued on the normal schedule. HR will be in touch '
        + 'regarding benefits continuation.',
      '',
      'We thank you for your contributions and wish you well in your future '
        + 'endeavours.',
      '',
      '— People Operations, Goy Corp',
      '',
      'This mailbox is not monitored. Please do not reply.',
    ],
  },
  {
    from: 'Marguerite Vane · HR',
    addr: 'm.vane@goycorp.com',
    subject: 'Tomorrow evening — coverage request',
    time: '4:58 AM',
    unread: true,
    hr: true,
    replyable: true,
    body: [
      'Hi!',
      '',
      'Quick one. We are short-staffed on the Wednesday evening shift and I am '
        + 'reaching out to everyone individually. Could you stay on until 11pm '
        + 'tomorrow? It would really help the team out.',
      '',
      'I know it is short notice and I know you may have plans. I would not ask '
        + 'if it were not important, and I think it would be noticed — in a good '
        + 'way — by the people who notice these things.',
      '',
      'Let me know either way before end of day. A yes would mean a lot.',
      '',
      'Warmly,',
      'Marguerite',
      '',
      'Marguerite Vane · People & Culture · Goy Corp',
      '"Together, forward."',
    ],
  },
  {
    from: 'BOOSKI',
    addr: 'booski@silversasquatches.gg',
    subject: 'RE: RE: RE: tomorrow',
    time: '2:14 AM',
    unread: true,
    meeting: true,
    body: [
      'ok so its confirmed. squatch meeting. tomorrow night. 7pm.',
      'the usual place. bring the thing.',
      '',
      'ape says hes coming which means he is not coming',
      'irish is bringing the eggs',
      '',
      'dont be weird about it just show up',
      '',
      '> On Mon, LOU wrote:',
      '> is it tomorrow or the day after',
      '',
      '>> On Mon, BOOSKI wrote:',
      '>> tomorrow',
    ],
  },
  {
    from: 'Goy Corp IT',
    addr: 'noreply@goycorp.com',
    subject: 'Mandatory security training — OVERDUE',
    time: 'Mon 4:02 PM',
    unread: false,
    body: [
      'This is your fourteenth reminder.',
      '',
      'Module 3 (Recognising Suspicious Attachments) remains incomplete. Failure '
        + 'to complete assigned training may be reflected in your performance review.',
      '',
      'Estimated time to complete: 11 minutes.',
      '',
      '[ START MODULE ]   ← link expired',
    ],
  },
  {
    from: 'Silver Sasquatches',
    addr: 'store@silversasquatches.gg',
    subject: 'Your order has shipped!',
    time: 'Sun 11:39 AM',
    unread: false,
    body: [
      'Great news — your order is on its way.',
      '',
      '  1x  Team jersey (Austin Major 2025)      ....  $64.00',
      '  1x  Crest sticker pack                   ....   $8.00',
      '  1x  "I AINT GAY" 7-inch, silver vinyl    ....  $22.00',
      '',
      'Estimated delivery: Tuesday.',
      '',
      'Track your parcel with the link below. The link below has not been included.',
    ],
  },
];

/**
 * What comes out when you reply to HR.
 *
 * You do get to type. Every key you press puts the next character of this on
 * the screen instead of the one you asked for, and the longer you go the
 * clearer it is that the sentence was always going to be this one. He knows
 * what he is doing. He is not going to the Wednesday shift.
 */
const REPLY = 'Go fuck yourself I have a squatch meeting';

export class Mail {
  constructor({ os, audio } = {}) {
    this.id = 'mail';
    this.label = 'SQUATCH\nMAIL.exe';
    this.os = os;
    this.audio = audio;
    this.messages = MESSAGES.map((m) => ({ ...m }));
    this.sel = 0;
    this.scroll = 0;
    this.t = 0;
    /** Set once the separation notice has actually been opened. */
    this.readFiring = false;
    /** null | 'compose' | 'sent' */
    this.reply = null;
    /** How much of REPLY has been typed. */
    this.typed = 0;
    /** Set once the reply has actually gone. */
    this.repliedToHR = false;
  }

  get unread() {
    return this.messages.reduce((n, m) => n + (m.unread ? 1 : 0), 0);
  }

  /** Icon: an envelope, with the unread count on it if there is one. */
  drawIcon(g, cx, cy, s) {
    const w = s * 0.72, h = w * 0.66;
    g.save();
    g.translate(cx, cy);

    g.fillStyle = '#e6e9ee';
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = '#8d97a8';
    g.lineWidth = Math.max(1, s * 0.02);
    g.strokeRect(-w / 2, -h / 2, w, h);
    // Flap.
    g.beginPath();
    g.moveTo(-w / 2, -h / 2);
    g.lineTo(0, h * 0.12);
    g.lineTo(w / 2, -h / 2);
    g.stroke();

    const n = this.unread;
    if (n) {
      const r = s * 0.16;
      g.fillStyle = '#d33b3b';
      g.beginPath();
      g.arc(w / 2 - r * 0.3, -h / 2 - r * 0.1, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `700 ${Math.round(r * 1.3)}px ui-monospace, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), w / 2 - r * 0.3, -h / 2 - r * 0.1 + 1);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }
    g.restore();
  }

  enter() {
    this.t = 0;
    this._open(this.sel);
  }

  _open(i) {
    this.sel = Math.max(0, Math.min(this.messages.length - 1, i));
    this.scroll = 0;
    this.reply = null;
    const m = this.messages[this.sel];
    if (m.unread) {
      m.unread = false;
      this.audio?.play('ui.select', { volume: 0.35 });
    }
    if (m.fired && !this.readFiring) {
      this.readFiring = true;
      this.onFired?.();
    }
    if (m.meeting) this.onMeeting?.();
  }

  onClick(down) {
    if (!down) return;
    const { x, y } = this.os.cursor;
    if (this.reply === 'compose' && x > LIST_W) return;   // typing; the pane is the letter
    if (x > LIST_W) {
      // SEND, bottom right of the reading pane.
      if (this._sendRect && inRect(x, y, this._sendRect)) this._send();
      return;
    }
    const i = Math.floor((y - HEADER_H) / ROW_H);
    if (i >= 0 && i < this.messages.length) this._open(i);
  }

  onKey(code) {
    const m = this.messages[this.sel];

    if (this.reply === 'compose') {
      /*
       * The joke only works if you are genuinely typing. So every key that
       * would put a character on the screen puts the NEXT character of REPLY
       * there instead -- you are hammering the keyboard, and what appears is
       * not what you pressed. Backspace works, which makes it worse.
       */
      if (code === 'Escape') { this.reply = null; return true; }
      if (code === 'Backspace') {
        this.typed = Math.max(0, this.typed - 1);
        return true;
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (this.typed >= REPLY.length) this._send();
        return true;
      }
      if (/^(Key|Digit|Numpad|Space|Comma|Period|Semicolon|Quote|Slash|Minus|Equal|Backquote|Bracket)/.test(code)) {
        if (this.typed < REPLY.length) {
          this.typed++;
          this.audio?.play('pc.keyboard', { volume: 0.35 });
        }
        return true;
      }
      // Tab still gets you out of the app; everything else is swallowed.
      return code !== 'Tab';
    }

    if (code === 'KeyR' && m.replyable && !m.replied) {
      this.reply = 'compose';
      this.typed = 0;
      return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') { this._open(this.sel + 1); return true; }
    if (code === 'ArrowUp' || code === 'KeyW') { this._open(this.sel - 1); return true; }
    if (code === 'PageDown') { this.scroll += 6; return true; }
    if (code === 'PageUp') { this.scroll = Math.max(0, this.scroll - 6); return true; }
    return false;
  }

  _send() {
    if (this.typed < REPLY.length) return;
    const m = this.messages[this.sel];
    m.replied = true;
    this.reply = 'sent';
    this.repliedToHR = true;
    this.audio?.play('ui.select', { volume: 0.6 });
    this.onReplied?.();
  }

  update(dt) {
    this.t += dt;
    const g = this.os.g;
    const m = this.messages[this.sel];

    g.fillStyle = '#12151d';
    g.fillRect(0, 0, W, H);

    // Title bar.
    g.fillStyle = '#1d2432';
    g.fillRect(0, 0, W, HEADER_H);
    g.fillStyle = '#c8d2e2';
    g.font = '600 12px ui-monospace, SFMono-Regular, monospace';
    g.textAlign = 'left';
    g.fillText('Squatch Mail', 12, 20);
    /* Left of centre, not right: the OS draws its own [TAB] desktop hint in
     * the top right corner and the two were printing on top of each other. */
    const n = this.unread;
    g.font = '11px ui-monospace, monospace';
    g.fillStyle = n ? '#e06a6a' : '#6b7689';
    g.fillText(n ? `${n} unread` : 'no unread', 108, 20);

    /* ---- the list ---- */
    g.fillStyle = '#171b26';
    g.fillRect(0, HEADER_H, LIST_W, H - HEADER_H);
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      const y = HEADER_H + i * ROW_H;
      if (i === this.sel) {
        g.fillStyle = '#26314a';
        g.fillRect(0, y, LIST_W, ROW_H);
        g.fillStyle = '#5b8fd8';
        g.fillRect(0, y, 3, ROW_H);
      }
      if (msg.unread) {
        g.fillStyle = '#e06a6a';
        g.beginPath();
        g.arc(14, y + ROW_H / 2, 3.4, 0, Math.PI * 2);
        g.fill();
      }
      g.font = `${msg.unread ? '700' : '400'} 11px ui-monospace, monospace`;
      g.fillStyle = msg.unread ? '#e8eef8' : '#9aa5b8';
      g.fillText(clip(g, msg.from, 150), 26, y + 18);
      g.font = '10px ui-monospace, monospace';
      g.fillStyle = '#6b7689';
      g.fillText(msg.time, LIST_W - 12 - g.measureText(msg.time).width, y + 18);
      g.fillStyle = msg.unread ? '#b9c4d6' : '#767f91';
      g.fillText(clip(g, msg.subject, LIST_W - 38), 26, y + 33);

      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.beginPath();
      g.moveTo(0, y + ROW_H - 0.5);
      g.lineTo(LIST_W, y + ROW_H - 0.5);
      g.stroke();
    }

    /* ---- the message ---- */
    const x0 = LIST_W + 16;
    g.font = '600 13px ui-monospace, monospace';
    g.fillStyle = '#e8eef8';
    g.fillText(clip(g, m.subject, W - x0 - 12), x0, HEADER_H + 22);
    g.font = '10px ui-monospace, monospace';
    g.fillStyle = '#7d879a';
    g.fillText(`${m.from}  <${m.addr}>`, x0, HEADER_H + 38);
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    g.moveTo(x0, HEADER_H + 48.5);
    g.lineTo(W - 12, HEADER_H + 48.5);
    g.stroke();

    if (this.reply) { this._drawCompose(g, x0, m); return; }

    g.font = '10px ui-monospace, monospace';
    /* Wrapped here rather than in the copy. Hand-wrapping the message bodies
     * meant the line length was a fact about the pane hidden in a data file,
     * and the first message that ran two characters long simply printed off
     * the right-hand edge -- which is what it did. */
    const lines = this._wrapped(g, m, W - x0 - 14);
    const rows = Math.floor((H - HEADER_H - 62) / 13);
    this.scroll = Math.min(this.scroll, Math.max(0, lines.length - rows));
    for (let i = 0; i < rows && i + this.scroll < lines.length; i++) {
      const line = lines[i + this.scroll];
      g.fillStyle = line.startsWith('>') ? '#5f6a7d' : '#b7c1d2';
      g.fillText(line, x0, HEADER_H + 66 + i * 13);
    }
    if (lines.length > rows + this.scroll) {
      g.fillStyle = '#5f6a7d';
      g.fillText('▾ PgDn', W - 60, H - 8);
    }

    if (m.replyable) {
      g.font = '10px ui-monospace, monospace';
      g.fillStyle = m.replied ? '#5c6a7c' : '#8fb4e6';
      g.fillText(m.replied ? 'replied' : '[R] reply', x0, H - 8);
    }
    this._sendRect = null;
  }

  /** The reply window, and what happens in it. */
  _drawCompose(g, x0, m) {
    const w = W - x0 - 12;
    g.font = '10px ui-monospace, monospace';
    g.fillStyle = '#7d879a';
    g.fillText(`To: ${m.addr}`, x0, HEADER_H + 66);
    g.fillText(`Subject: RE: ${clip(g, m.subject, w - 70)}`, x0, HEADER_H + 80);

    // The letter itself.
    const bx = x0, by = HEADER_H + 90, bh = H - by - 34;
    g.fillStyle = '#0d1119';
    g.fillRect(bx, by, w, bh);
    g.strokeStyle = this.reply === 'sent' ? 'rgba(110,190,130,.5)' : 'rgba(140,170,215,.35)';
    g.strokeRect(bx + 0.5, by + 0.5, w - 1, bh - 1);

    const typed = REPLY.slice(0, this.typed);
    const lines = this._wrap(g, typed, w - 16);
    g.fillStyle = '#d6dfec';
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], bx + 8, by + 18 + i * 13);

    if (this.reply === 'compose') {
      // Caret, so it is obvious the keyboard is doing something.
      if (Math.floor(this.t * 2.6) % 2 === 0) {
        const last = lines[lines.length - 1] ?? '';
        const cx = bx + 8 + g.measureText(last).width;
        const cy = by + 8 + (lines.length - 1) * 13;
        g.fillRect(cx + 1, cy, 5, 11);
      }
      g.fillStyle = '#6b7689';
      g.fillText(this.typed >= REPLY.length
        ? '[ENTER] send   ·   [ESC] discard'
        : 'type…   ·   [ESC] discard', bx, H - 8);

      if (this.typed >= REPLY.length) {
        const label = ' SEND ';
        const bw = g.measureText(label).width + 14;
        this._sendRect = { x: W - 12 - bw, y: H - 20, w: bw, h: 15 };
        g.fillStyle = '#2c4a70';
        g.fillRect(this._sendRect.x, this._sendRect.y, bw, 15);
        g.fillStyle = '#dce6f4';
        g.fillText(label, this._sendRect.x + 7, H - 9);
      } else {
        this._sendRect = null;
      }
      return;
    }

    // Sent.
    this._sendRect = null;
    g.fillStyle = '#7cc48d';
    g.fillText('sent · 0 replies expected', bx, H - 8);
  }

  /** Fold one string. The message wrapper is per-message and cached. */
  _wrap(g, text, max) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
    return out;
  }

  /**
   * Fold a message to the pane width, keeping blank lines and quote markers.
   * Cached per message and width, since the wrap is the same every frame.
   */
  _wrapped(g, m, max) {
    if (m._wrapAt === max && m._wrap) return m._wrap;
    const out = [];
    for (const raw of m.body) {
      if (!raw) { out.push(''); continue; }
      // A quoted line keeps its markers on every row it folds onto.
      const mark = /^(>+\s*)/.exec(raw)?.[1] ?? '';
      const words = raw.slice(mark.length).split(' ');
      let line = mark;
      for (const word of words) {
        const next = line === mark ? mark + word : `${line} ${word}`;
        if (g.measureText(next).width > max && line !== mark) {
          out.push(line);
          line = mark + word;
        } else {
          line = next;
        }
      }
      out.push(line);
    }
    m._wrapAt = max;
    m._wrap = out;
    return out;
  }

  glow() {
    return { colour: 0x8fa8d0, intensity: 0.95 };
  }
}

/** Trim a string to fit, with an ellipsis. */
function clip(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Point in a {x,y,w,h}. */
function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * YUKA vs OLIVE -- a comparison page somebody left open on the desk PC.
 *
 * The man who lives here got as far as researching which food scanner app to
 * install and no further, which is the most honest thing on this computer.
 *
 * An app in the SquatchOS sense: the OS owns the monitor canvas and hands
 * this the drawing context plus input while it has focus. See arcade/os.js.
 *
 * Drawn natively rather than shown as an image. The source is a dense
 * two-column comparison; scaled into 640x360 it is a grey smear, and a page
 * you cannot read is not a page.
 */
import { W, H } from './os.js';

const INK = '#1b2430';
const MUTED = '#6b7684';
const PAPER = '#f4f6f8';
const CARD = '#ffffff';
const YUKA = '#f08a20';
const OLIVE = '#2f7d33';
const BAD = '#c0392b';
const GOOD = '#1f8ecd';

const COLUMNS = [
  {
    name: 'Yuka', accent: YUKA,
    heads: [
      { title: 'What it emphasizes', colour: YUKA, lines: [
        'Nutrition score, additives and organic',
        'status, in a published formula',
        'Simple 0-100 rating, plus suggested',
        'alternative products',
      ] },
      { title: 'Where it falls short', colour: BAD, lines: [
        'No dedicated "seed oil" factor in the',
        'scoring breakdown',
        'You still read the oils yourself',
      ] },
    ],
  },
  {
    name: 'Olive', accent: OLIVE,
    heads: [
      { title: 'What it emphasizes', colour: OLIVE, lines: [
        'Scores on additives, seed oils,',
        'processing level and detected toxins',
        'Flags controversial ingredients before',
        'you go looking for them',
      ] },
      { title: 'Why it wins here', colour: GOOD, lines: [
        'Seed oils are their own category',
        'Faster scan-to-decision when oil',
        'quality is the whole question',
      ] },
    ],
  },
];

/* The gag: he never scans anything he owns, because he knows. Scores are
 * fixed per item -- a random number every press reads as a bug, and the joke
 * is that the answer was never in doubt. */
const PANTRY = [
  { item: 'Four-pack of lager', score: 12, note: 'It has not been misjudged.' },
  { item: 'Pasture raised eggs', score: 84, note: 'The one thing in the flat that scores.' },
  { item: 'Instant noodles', score: 9, note: 'Seed oils: yes. All of them.' },
  { item: 'Cigarettes', score: 0, note: 'Not a food. Scanned anyway.' },
  { item: 'Whiskey', score: 6, note: 'No additives, technically.' },
  { item: 'Tin of soup', score: 31, note: 'The app made a face.' },
  { item: 'Frozen pizza', score: 17, note: 'Processing level: yes.' },
];

export class Yuka {
  constructor({ os, audio } = {}) {
    this.id = 'yuka';
    this.label = 'YUKA vs\nOLIVE.htm';
    this.os = os;
    this.audio = audio;
    this.t = 0;
    /** Index into PANTRY, or -1 while the comparison is up. */
    this.scan = -1;
    this.scanT = 0;
  }

  /** Icon: the two apps' colours, split down the middle. */
  drawIcon(g, cx, cy, s) {
    const w = s * 0.74, h = w;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = PAPER;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = YUKA;
    g.fillRect(-w / 2, -h / 2, w / 2, h * 0.34);
    g.fillStyle = OLIVE;
    g.fillRect(0, -h / 2, w / 2, h * 0.34);
    g.strokeStyle = '#9aa4b2';
    g.lineWidth = Math.max(1, s * 0.02);
    g.strokeRect(-w / 2, -h / 2, w, h);
    // Three lines of "text" under the headers.
    g.fillStyle = '#c3cad4';
    for (let i = 0; i < 3; i++) {
      g.fillRect(-w / 2 + w * 0.08, -h / 2 + h * 0.46 + i * h * 0.14, w * 0.84, h * 0.07);
    }
    g.restore();
  }

  enter() { this.scan = -1; this.scanT = 0; }
  exit() {}

  onPointer() {}
  onClick(down) { if (down) this._next(); }

  onKey(code, down) {
    if (!down) return false;
    if (code === 'Space' || code === 'Enter') { this._next(); return true; }
    if (code === 'Escape' && this.scan >= 0) { this.scan = -1; return true; }
    return false;
  }

  /** Scan the next thing in the flat, then wrap back to the comparison. */
  _next() {
    this.scan = this.scan + 1 >= PANTRY.length ? -1 : this.scan + 1;
    this.scanT = 0;
    this.audio?.play?.('pc.mouseclick', { volume: 0.35 });
  }

  glow() {
    if (this.scan < 0) return { colour: 0xf4f6f8, intensity: 0.62 };
    const s = PANTRY[this.scan].score;
    return { colour: s >= 50 ? 0x2f7d33 : 0xc0392b, intensity: 0.66 };
  }

  update(dt) {
    this.t += dt;
    this.scanT += dt;
    const g = this.os.g;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    if (this.scan >= 0) this._drawScan(g);
    else this._drawComparison(g);
  }

  _drawComparison(g) {
    g.fillStyle = INK;
    g.font = 'bold 19px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText('Food scanner apps: Yuka vs Olive', 22, 32);

    g.fillStyle = MUTED;
    g.font = '11px system-ui, sans-serif';
    g.fillText('If you specifically want seed oils called out, Olive makes that a first-class signal.', 22, 50);

    const cw = 288, cx0 = 22, gap = 20;
    COLUMNS.forEach((col, i) => {
      const x = cx0 + i * (cw + gap);
      g.fillStyle = CARD;
      this._round(g, x, 62, cw, 232, 8);
      g.fill();
      g.strokeStyle = '#e2e6ec';
      g.lineWidth = 1;
      g.stroke();

      // Name tab.
      g.fillStyle = col.accent;
      this._round(g, x + 14, 74, 96, 22, 4);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(col.name, x + 62, 89);
      g.textAlign = 'left';

      let y = 122;
      for (const head of col.heads) {
        g.fillStyle = head.colour;
        g.font = 'bold 11px system-ui, sans-serif';
        g.fillText(head.title, x + 14, y);
        y += 15;
        g.fillStyle = MUTED;
        g.font = '10px system-ui, sans-serif';
        for (const line of head.lines) {
          g.fillText(line, x + 18, y);
          y += 12;
        }
        y += 8;
      }
    });

    // Bottom line.
    g.fillStyle = CARD;
    this._round(g, 22, 302, 596, 40, 8);
    g.fill();
    g.strokeStyle = '#e2e6ec';
    g.stroke();
    g.fillStyle = OLIVE;
    this._round(g, 34, 312, 92, 20, 4);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('Bottom line', 80, 326);
    g.textAlign = 'left';
    g.fillStyle = INK;
    g.font = '10px system-ui, sans-serif';
    g.fillText('For "is this processed?", Yuka is solid. If seed oils are the question, Olive is', 140, 320);
    g.fillText('the purpose-built one.  [space] scan something in the flat', 140, 334);
  }

  _drawScan(g) {
    const p = PANTRY[this.scan];
    const pass = p.score >= 50;
    const accent = pass ? OLIVE : BAD;
    // Count the ring up rather than snapping, so it reads as a measurement.
    const grow = Math.min(1, this.scanT * 2.2);
    const shown = Math.round(p.score * grow);

    g.fillStyle = MUTED;
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText('Olive  ·  scan result', 22, 30);

    g.fillStyle = INK;
    g.font = 'bold 20px system-ui, sans-serif';
    g.fillText(p.item, 22, 62);

    // Score dial.
    const cx = 150, cy = 190, r = 62;
    g.strokeStyle = '#e2e6ec';
    g.lineWidth = 13;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = accent;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (shown / 100));
    g.stroke();
    g.lineCap = 'butt';

    g.fillStyle = accent;
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(shown), cx, cy + 12);
    g.fillStyle = MUTED;
    g.font = '10px system-ui, sans-serif';
    g.fillText('out of 100', cx, cy + 30);
    g.textAlign = 'left';

    g.fillStyle = CARD;
    this._round(g, 248, 118, 370, 148, 8);
    g.fill();
    g.strokeStyle = '#e2e6ec';
    g.lineWidth = 1;
    g.stroke();

    g.fillStyle = accent;
    g.font = 'bold 12px system-ui, sans-serif';
    g.fillText(pass ? 'Cleared' : 'Seed oils detected', 266, 144);
    g.fillStyle = INK;
    g.font = '11px system-ui, sans-serif';
    g.fillText(p.note, 266, 168);

    g.fillStyle = MUTED;
    g.font = '10px system-ui, sans-serif';
    g.fillText('[space] scan the next thing   ·   [esc] back to the comparison', 266, 240);
  }

  /** Rounded rect path -- roundRect is not everywhere yet. */
  _round(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}

/**
 * COUNTER-SQUATCH FIELD GUIDE
 *
 * Two slides somebody saved to the desktop after another bad queue. The deck
 * is deliberately its own small app rather than an email attachment: it has
 * readable controls, remembers no story state, and gives the player a reason
 * to use the PC's mouse for something besides mail.
 */
import { W, H } from './os.js';
import { loadJson, assetUrl } from '../core/assets.js';

const ARCADE_DIR = 'assets/arcade/';

const SLIDES = [
  {
    image: 'counter-squatch.teamplay',
    title: 'TEAMPLAY™',
    kicker: 'A revolutionary mindset shift',
    lines: [
      'Trust the call.',
      'Trade teammates.',
      'Throw supportive utility.',
      'Accept that your idea was not always better.',
    ],
    note: 'Reported side effects: higher win rates, positive comms, and having to say “nice try” like you mean it.',
    voice: 'computer.cs.teamplay',
  },
  {
    image: 'counter-squatch.baiters-brain',
    title: "BAITER'S BRAIN",
    kicker: 'A completely normal tactical condition',
    lines: [
      'Every team call is the worst call ever heard.',
      'The plan is ignored to lurk the other bombsite.',
      'There is “no real IGL.”',
      'The one-versus-three that almost happened is retold for years.',
    ],
    note: 'If symptoms persist for more than one half, stop queuing with Baiter and call a teammate.',
    voice: 'computer.cs.baiters',
  },
];

async function loadComputerImages() {
  const manifest = await loadJson(ARCADE_DIR, 'manifest.json');
  const entries = manifest?.images || [];
  const images = new Map();
  await Promise.all(entries.map((entry) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { images.set(entry.id, image); resolve(); };
    image.onerror = () => resolve();
    image.src = assetUrl(ARCADE_DIR, entry.file);
  })));
  return images;
}

function inside(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function roundRect(g, x, y, w, h, r = 6) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawContain(g, image, x, y, w, h) {
  if (!image?.naturalWidth || !image?.naturalHeight) return false;
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const dw = Math.round(image.naturalWidth * scale);
  const dh = Math.round(image.naturalHeight * scale);
  g.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

function wrap(g, text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A clickable two-slide training deck. */
export class CounterSquatchGuide {
  constructor({ os, audio } = {}) {
    this.id = 'counter-guide';
    this.label = 'HOW TO\nCOUNTER.ppt';
    this.usesOsCursor = true;
    this.os = os;
    this.audio = audio;
    this.images = new Map();
    this.loading = null;
    this.slide = 0;
    this.t = 0;
    this.prevRect = null;
    this.nextRect = null;
  }

  drawIcon(g, cx, cy, s) {
    const w = s * 0.74;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#efe6d5';
    g.fillRect(-w / 2, -w / 2, w, w);
    g.fillStyle = '#c56d45';
    g.fillRect(-w / 2, -w / 2, w, w * 0.23);
    g.fillStyle = '#27282a';
    g.font = `bold ${Math.round(s * 0.19)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('CS', 0, s * 0.10);
    g.fillStyle = '#758b5e';
    g.fillRect(-w * 0.30, w * 0.19, w * 0.60, w * 0.10);
    g.strokeStyle = '#867967';
    g.lineWidth = 1.5;
    g.strokeRect(-w / 2, -w / 2, w, w);
    g.restore();
  }

  enter() {
    this.t = 0;
    if (!this.loading) {
      this.loading = loadComputerImages().then((images) => { this.images = images; });
    }
    this._saySlide();
  }

  exit() {}
  onPointer() {}

  onClick(down) {
    if (!down) return;
    const { x, y } = this.os.cursor;
    if (this.prevRect && inside(x, y, this.prevRect)) this._change(-1);
    else if (this.nextRect && inside(x, y, this.nextRect)) this._change(1);
  }

  onKey(code, down) {
    if (!down) return false;
    if (code === 'ArrowLeft' || code === 'KeyA') { this._change(-1); return true; }
    if (code === 'ArrowRight' || code === 'KeyD' || code === 'Space' || code === 'Enter') {
      this._change(1); return true;
    }
    if (code === 'KeyR') { this._saySlide(); return true; }
    return false;
  }

  _change(delta) {
    const next = Math.max(0, Math.min(SLIDES.length - 1, this.slide + delta));
    if (next === this.slide) return;
    this.slide = next;
    this.audio?.play?.('pc.mouseclick', { volume: 0.33 });
    this._saySlide();
  }

  _saySlide() {
    this.audio?.say?.(SLIDES[this.slide].voice, { volume: 0.82, delay: 0.38 });
  }

  glow() { return { colour: 0xe8bd83, intensity: 0.72 }; }

  update(dt) {
    this.t += dt;
    const g = this.os.g;
    const slide = SLIDES[this.slide];
    g.fillStyle = '#11141b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#242936';
    g.fillRect(0, 0, W, 30);
    g.fillStyle = '#eee8dd';
    g.font = '600 12px ui-monospace, monospace';
    g.textAlign = 'left';
    g.fillText('HOW TO PLAY COUNTER-SQUATCH.ppt', 12, 20);
    g.fillStyle = '#9ea8b8';
    g.font = '10px ui-monospace, monospace';
    g.textAlign = 'right';
    g.fillText(`${this.slide + 1} / ${SLIDES.length}`, W - 14, 20);

    // Paper slide, kept portrait so the supplied design remains legible.
    roundRect(g, 18, 42, 274, 286, 5);
    g.fillStyle = '#08090c';
    g.fill();
    const image = this.images.get(slide.image);
    if (!drawContain(g, image, 22, 46, 266, 278)) {
      g.fillStyle = '#e7dece';
      g.font = 'bold 14px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Loading slide…', 155, 182);
    }

    // The short version at monitor-reading size; the original artwork remains
    // on the left rather than being reduced to an unreadable thumbnail.
    g.fillStyle = '#eef1f6';
    g.font = 'bold 21px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(slide.title, 316, 70);
    g.fillStyle = '#d7a272';
    g.font = 'italic 12px system-ui, sans-serif';
    g.fillText(slide.kicker, 316, 90);

    let y = 124;
    g.font = '12px system-ui, sans-serif';
    for (const line of slide.lines) {
      g.fillStyle = '#7eb780';
      g.fillText('✓', 318, y);
      g.fillStyle = '#dfe5ee';
      for (const wrapped of wrap(g, line, 284)) {
        g.fillText(wrapped, 338, y);
        y += 16;
      }
      y += 7;
    }

    roundRect(g, 316, 238, 302, 58, 5);
    g.fillStyle = '#1c2330';
    g.fill();
    g.fillStyle = '#aeb9c9';
    g.font = '10px system-ui, sans-serif';
    y = 255;
    for (const line of wrap(g, slide.note, 280)) {
      g.fillText(line, 328, y);
      y += 13;
    }

    this.prevRect = { x: 316, y: 308, w: 92, h: 26 };
    this.nextRect = { x: 516, y: 308, w: 102, h: 26 };
    this._drawButton(g, this.prevRect, '← PREV', this.slide > 0);
    this._drawButton(g, this.nextRect, this.slide < SLIDES.length - 1 ? 'NEXT →' : 'DONE', this.slide < SLIDES.length - 1);
    g.fillStyle = '#7c8798';
    g.font = '10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('[←/→] change slide  ·  [R] replay commentary', W / 2, H - 10);
    this.os.drawCursor(true);
  }

  _drawButton(g, r, text, active) {
    roundRect(g, r.x, r.y, r.w, r.h, 4);
    g.fillStyle = active ? '#3d638d' : '#2a2e37';
    g.fill();
    g.strokeStyle = active ? '#8fb9e5' : '#4b5260';
    g.stroke();
    g.fillStyle = active ? '#f1f5fb' : '#747d8d';
    g.font = 'bold 10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(text, r.x + r.w / 2, r.y + 17);
    g.textAlign = 'left';
  }
}

/** The received match-result image: a photo viewer, not another story app. */
export class CounterSquatchMatchPhoto {
  constructor({ os, audio } = {}) {
    this.id = 'match-result';
    this.label = 'MATCH\nRESULT.jpg';
    this.usesOsCursor = true;
    this.os = os;
    this.audio = audio;
    this.images = new Map();
    this.loading = null;
  }

  drawIcon(g, cx, cy, s) {
    const w = s * 0.78, h = w * 0.68;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#25364a';
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#e64be6';
    g.fillRect(-w * 0.32, -h * 0.30, w * 0.64, h * 0.16);
    g.fillStyle = '#d2a950';
    g.fillRect(-w * 0.38, h * 0.13, w * 0.28, h * 0.10);
    g.fillStyle = '#b4cad8';
    g.fillRect(w * 0.05, h * 0.13, w * 0.33, h * 0.10);
    g.strokeStyle = '#9ba8ba';
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }

  enter() {
    if (!this.loading) {
      this.loading = loadComputerImages().then((images) => { this.images = images; });
    }
    this.audio?.say?.('computer.cs.result', { volume: 0.80, delay: 0.35 });
  }

  exit() {}
  onPointer() {}
  onClick() {}
  onKey() { return false; }
  glow() { return { colour: 0xd651e4, intensity: 0.68 }; }

  update() {
    const g = this.os.g;
    g.fillStyle = '#0d1017';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#222a39';
    g.fillRect(0, 0, W, 30);
    g.fillStyle = '#edf1f8';
    g.font = '600 12px ui-monospace, monospace';
    g.textAlign = 'left';
    g.fillText('MATCH_RESULT.jpg  ·  received', 12, 20);
    const image = this.images.get('counter-squatch.match-result');
    if (!drawContain(g, image, 14, 38, W - 28, H - 58)) {
      g.fillStyle = '#b7c2d2';
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Loading match result…', W / 2, H / 2);
    }
    g.fillStyle = 'rgba(8,10,14,.82)';
    g.fillRect(14, H - 23, W - 28, 17);
    g.fillStyle = '#aeb9cb';
    g.font = '10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('Somebody saved this. Nobody explained why.', W / 2, H - 11);
    this.os.drawCursor(true);
  }
}

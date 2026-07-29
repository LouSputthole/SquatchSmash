/**
 * SquatchOS -- the shell running on the desk PC.
 *
 * Owns the monitor canvas, the boot sequence, the desktop, the mouse cursor
 * and the CRT treatment. Everything else is an app: the OS hands each one the
 * drawing context and forwards input while it is in focus.
 *
 * An app is any object with:
 *   id, label            identity on the desktop
 *   drawIcon(g,cx,cy,s)  its desktop icon
 *   enter() / exit()     focus changes
 *   update(dt)           simulate and draw into os.g
 *   onPointer(dx,dy)     relative mouse motion
 *   onClick(down)        primary button
 *   onKey(code,down)     returns true if it consumed the key
 *   glow()               { colour, intensity } for the room's screen spill
 */

export const W = 640;
export const H = 360;

export class SquatchOS {
  constructor({ audio } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.audio = audio;

    this.apps = [];
    this.app = null;
    this.mode = 'off';        // off | boot | desktop | app
    this.t = 0;
    this.modeT = 0;

    this.cursor = { x: W / 2, y: H / 2 };
    this.clock = '6:04 AM';

    this._boot = [
      'SQUATCH BIOS v4.04',
      'CPU: Cryptid Core i7 @ 4.9GHz  OK',
      'MEM: 32768MB                   OK',
      'GPU: HairyForce RTX            OK',
      'Detecting storage .............',
      'Loading SquatchOS ............. ',
    ];
  }

  register(app) {
    this.apps.push(app);
    return app;
  }

  /** Called when the tower is powered on. */
  boot() {
    this.mode = 'boot';
    this.modeT = 0;
  }

  powerOff() {
    if (this.app) this.app.exit?.();
    this.app = null;
    this.mode = 'off';
  }

  /** Where each desktop icon sits. */
  _iconRect(i) {
    return { x: 26, y: 26 + i * 108, w: 96, h: 96 };
  }

  _iconAt(x, y) {
    for (let i = 0; i < this.apps.length; i++) {
      const r = this._iconRect(i);
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return this.apps[i];
    }
    return null;
  }

  launch(app) {
    if (!app) return;
    this.audio?.play('ui.select', { volume: 0.5 });
    this.app = app;
    this.mode = 'app';
    this.modeT = 0;
    app.enter?.();
  }

  toDesktop() {
    if (this.app) this.app.exit?.();
    this.app = null;
    this.mode = 'desktop';
    this.modeT = 0;
    this.cursor.x = W / 2;
    this.cursor.y = H / 2;
    this.audio?.play('ui.select', { volume: 0.35 });
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  onPointer(dx, dy) {
    if (this.mode === 'app') {
      this.app.onPointer?.(dx, dy);
      return;
    }
    const sens = 0.62;
    this.cursor.x = clamp(this.cursor.x + dx * sens, 4, W - 4);
    this.cursor.y = clamp(this.cursor.y + dy * sens, 4, H - 4);
  }

  onClick(down) {
    if (this.mode === 'desktop') {
      if (down) this.launch(this._iconAt(this.cursor.x, this.cursor.y));
      return;
    }
    if (this.mode === 'app') this.app.onClick?.(down);
  }

  onKey(code, down) {
    if (!down) return false;
    if (this.mode === 'boot') return false;

    // Tab always drops you back to the desktop.
    if (code === 'Tab') {
      if (this.mode === 'app') this.toDesktop();
      return true;
    }

    if (this.mode === 'desktop') {
      if (code === 'Space' || code === 'Enter') {
        this.launch(this._iconAt(this.cursor.x, this.cursor.y) || this.apps[0]);
        return true;
      }
      // Number keys launch directly.
      const n = Number(code.replace('Digit', ''));
      if (n >= 1 && n <= this.apps.length) {
        this.launch(this.apps[n - 1]);
        return true;
      }
      return false;
    }

    if (this.mode === 'app') return !!this.app.onKey?.(code, down);
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  update(dt) {
    this.t += dt;
    this.modeT += dt;

    if (this.mode === 'boot' && this.modeT > 3.4) {
      this.mode = 'desktop';
      this.modeT = 0;
    }

    switch (this.mode) {
      case 'off':
        this.g.fillStyle = '#05060a';
        this.g.fillRect(0, 0, W, H);
        break;
      case 'boot':
        this._drawBoot();
        break;
      case 'desktop':
        this._drawDesktop();
        break;
      case 'app':
        this.app.update(dt);
        this._drawExitHint();
        break;
    }

    if (this.mode !== 'off') this._drawCrt();
  }

  /**
   * The way out, in the corner of the screen.
   *
   * Tab has always dropped back to the desktop and Q has always got you out of
   * the chair; neither was written down anywhere, so from inside a match there
   * was no visible way back to the room at all. An app can hide it -- set
   * `hideExitHint` while something is mid-flow -- but by default it is there.
   */
  _drawExitHint() {
    if (this.app?.hideExitHint) return;
    const g = this.g;
    g.save();
    g.globalAlpha = 0.62;
    g.font = '10px "Courier New", monospace';
    g.textAlign = 'right';
    const text = '[TAB] desktop   ·   [Q] leave the desk';
    const w = g.measureText(text).width;
    g.fillStyle = 'rgba(6,8,12,.62)';
    g.fillRect(W - w - 16, 4, w + 12, 16);
    g.fillStyle = '#9fb0c8';
    g.fillText(text, W - 10, 15);
    g.restore();
  }

  glow() {
    switch (this.mode) {
      case 'off': return { colour: 0x000000, intensity: 0 };
      case 'boot': return { colour: 0x66ff88, intensity: 0.5 };
      case 'desktop': return { colour: 0x6f8fc8, intensity: 0.9 };
      default: return this.app?.glow?.() ?? { colour: 0x7fa8d8, intensity: 1.0 };
    }
  }

  /** The name main.js knows it by. */
  sampleGlow() { return this.glow(); }

  /** Fed from the apartment clock so the taskbar agrees with the wall. */
  setClock(text) { this.clock = text; }

  /* ---------------------------------------------------------------- */
  /* Chrome                                                            */
  /* ---------------------------------------------------------------- */

  _drawBoot() {
    const g = this.g;
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, W, H);
    g.font = '13px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillStyle = '#9fe89f';
    const shown = Math.min(this._boot.length, Math.floor(this.modeT / 0.42) + 1);
    for (let i = 0; i < shown; i++) g.fillText(this._boot[i], 26, 42 + i * 20);
    if (Math.floor(this.t * 2.4) % 2 === 0) {
      const wLast = g.measureText(this._boot[shown - 1]).width;
      g.fillRect(26 + wLast + 4, 32 + (shown - 1) * 20, 8, 13);
    }
  }

  _drawDesktop() {
    const g = this.g;

    // Wallpaper.
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#161a2c');
    sky.addColorStop(1, '#0b0d16');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,90,220,.06)';
    for (let i = 0; i < 30; i++) {
      const x = (i * 137.5) % W;
      g.fillRect(x, 0, 1, H);
    }

    for (let i = 0; i < this.apps.length; i++) {
      const app = this.apps[i];
      const r = this._iconRect(i);
      const hot = this._iconAt(this.cursor.x, this.cursor.y) === app;

      if (hot) {
        g.fillStyle = 'rgba(90,140,220,.28)';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = 'rgba(140,180,240,.5)';
        g.lineWidth = 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }

      app.drawIcon?.(g, r.x + r.w / 2, r.y + 30, 46);

      g.fillStyle = '#dfe6f2';
      g.font = '10px "Courier New", monospace';
      g.textAlign = 'center';
      const lines = String(app.label).split('\n');
      lines.forEach((ln, k) => g.fillText(ln, r.x + r.w / 2, r.y + 68 + k * 12));

      g.fillStyle = '#5d6a85';
      g.fillText(`[${i + 1}]`, r.x + r.w / 2, r.y + 68 + lines.length * 12);
    }

    // Taskbar.
    g.fillStyle = 'rgba(10,12,20,.92)';
    g.fillRect(0, H - 26, W, 26);
    g.fillStyle = '#7f8ba0';
    g.font = '11px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillText('SquatchOS', 12, H - 9);
    g.textAlign = 'right';
    g.fillText(this.clock, W - 12, H - 9);

    g.textAlign = 'center';
    g.fillStyle = 'rgba(220,230,245,.45)';
    g.fillText('click an icon, or press its number', W / 2, H - 44);

    this.drawCursor(true);
  }

  /** Shared by the OS and by apps that want the arrow rather than a reticle. */
  drawCursor(arrow, cur = this.cursor) {
    const g = this.g;
    const { x, y } = cur;
    if (!arrow) return;
    g.fillStyle = '#f0e8d0';
    g.strokeStyle = '#101418';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y + 15);
    g.lineTo(x + 4.5, y + 11);
    g.lineTo(x + 10, y + 10);
    g.closePath();
    g.fill();
    g.stroke();
  }

  /** Scanlines + vignette, so the monitor reads as a monitor. */
  _drawCrt() {
    const g = this.g;
    g.globalAlpha = 0.10;
    g.fillStyle = '#000';
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    g.globalAlpha = 1;

    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.86);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
  }

  /* Forwarded to whichever app cares. */
  grantBuff(n) {
    for (const a of this.apps) a.grantBuff?.(n);
  }

  setImpairment(v) {
    for (const a of this.apps) a.setImpairment?.(v);
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

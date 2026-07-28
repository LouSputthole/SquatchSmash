/**
 * SQUATCH SMASH -- the game on the desk PC.
 *
 * Renders to an offscreen 640x360 canvas which apartment.js maps onto the
 * monitor. It owns its own boot / desktop / menu / play / game-over shell so
 * sitting down at the PC feels like using a PC.
 *
 * Input arrives from main.js while the player is seated:
 *   onPointer(dx, dy)  relative mouse motion (pointer is locked)
 *   onClick(down)      primary button
 *   onKey(code, down)  keyboard
 *
 * See arcade/mount.js for the interface an alternative game must implement.
 */
import { drawSquatchSilhouette } from '../world/textures.js';

const W = 640;
const H = 360;

const KINDS = {
  grunt: { points: 100, life: 1, up: 1.95, colour: '#6d5038', size: 1.00, friendly: false },
  runner: { points: 220, life: 1, up: 1.15, colour: '#82592f', size: 0.86, friendly: false },
  brute: { points: 400, life: 2, up: 2.70, colour: '#4c3a26', size: 1.28, friendly: false },
  golden: { points: 1000, life: 1, up: 1.35, colour: '#d8ab3a', size: 1.02, friendly: false },
  cub: { points: 0, life: 1, up: 2.00, colour: '#9d7a55', size: 0.58, friendly: true },
  hiker: { points: 0, life: 1, up: 2.20, colour: '#d2603c', size: 0.94, friendly: true },
};

/** Nine burrows arranged in three receding rows. */
const SPOTS = (() => {
  const out = [];
  const rows = [
    { y: 238, scale: 0.80, count: 4, spread: 250 },
    { y: 284, scale: 0.98, count: 3, spread: 214 },
    { y: 336, scale: 1.18, count: 3, spread: 196 },
  ];
  for (const r of rows) {
    for (let i = 0; i < r.count; i++) {
      const t = r.count === 1 ? 0.5 : i / (r.count - 1);
      out.push({ x: W / 2 + (t - 0.5) * 2 * r.spread, y: r.y, scale: r.scale });
    }
  }
  return out;
})();

export class SquatchSmash {
  constructor({ audio, onScore } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.audio = audio;
    this.onScore = onScore;

    this.mode = 'off';
    this.t = 0;
    this.modeT = 0;

    this.cursor = { x: W / 2, y: H / 2 };
    this.clickHeld = false;
    this.swing = 0;

    this.entities = [];
    this.particles = [];
    this.floaters = [];

    this.score = 0;
    this.best = Number(localStorage.getItem('squatchsmash.best') || 0);
    this.lives = 3;
    this.wave = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.spawnTimer = 0;
    this.waveRemaining = 0;
    this.shake = 0;
    this.flash = 0;
    this.slowmo = 0;
    this.buffCharges = 0;
    /** How hard the aim wanders, driven by how drunk the player is. */
    this.impair = 0;

    this.menuIndex = 0;
    this._bootLines = [];
    this._desktopSel = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  /** Called when the tower is powered on. */
  boot() {
    this.mode = 'boot';
    this.modeT = 0;
    this._bootLines = [
      'SQUATCH BIOS v4.04',
      'CPU: Cryptid Core i7 @ 4.9GHz  OK',
      'MEM: 32768MB                   OK',
      'GPU: HairyForce RTX            OK',
      'Detecting storage .............',
      'Loading SquatchOS ............. ',
    ];
  }

  powerOff() {
    this.mode = 'off';
    this.entities.length = 0;
    this.particles.length = 0;
  }

  /** Grant a slow-motion charge -- earned by drinking a beer in the kitchen. */
  grantBuff(n = 1) {
    this.buffCharges += n;
  }

  /** 0 = sober and steady, 1+ = the crosshair has a mind of its own. */
  setImpairment(v) {
    this.impair = v;
  }

  startRun() {
    this.mode = 'play';
    this.modeT = 0;
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.entities.length = 0;
    this.particles.length = 0;
    this.floaters.length = 0;
    this.slowmo = 0;
    this._nextWave();
  }

  _nextWave() {
    this.wave++;
    this.waveRemaining = 8 + this.wave * 3;
    this.spawnTimer = 0.35;
    this.audio?.play('arcade.wave', { volume: 0.5 });
    this._float(W / 2, 96, `WAVE ${this.wave}`, '#ffd24a', 1.5, 1.6);
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  onPointer(dx, dy) {
    const sens = 0.62;
    this.cursor.x = clamp(this.cursor.x + dx * sens, 8, W - 8);
    this.cursor.y = clamp(this.cursor.y + dy * sens, 8, H - 8);
  }

  onClick(down) {
    if (!down) {
      this.clickHeld = false;
      return;
    }
    this.clickHeld = true;

    if (this.mode === 'desktop') {
      // Click the icon if the cursor is on it.
      if (this._iconHit(this.cursor.x, this.cursor.y)) this._launch();
      return;
    }
    if (this.mode === 'menu') {
      this.startRun();
      return;
    }
    if (this.mode === 'over') {
      if (this.modeT > 1.1) this.mode = 'menu';
      return;
    }
    if (this.mode === 'play') this._smash();
  }

  onKey(code, down) {
    if (!down) return false;
    if (this.mode === 'boot') return false;

    if (code === 'Space' || code === 'Enter') {
      if (this.mode === 'desktop') this._launch();
      else if (this.mode === 'menu') this.startRun();
      else if (this.mode === 'over' && this.modeT > 1.1) this.mode = 'menu';
      else if (this.mode === 'play') this._smash();
      return true;
    }
    if (code === 'KeyB' && this.mode === 'play') {
      this._useBuff();
      return true;
    }
    return false;
  }

  _launch() {
    this.audio?.play('ui.select', { volume: 0.5 });
    this.mode = 'menu';
    this.modeT = 0;
  }

  _iconHit(x, y) {
    return x > 26 && x < 118 && y > 26 && y < 122;
  }

  _useBuff() {
    if (this.buffCharges <= 0 || this.slowmo > 0) return;
    this.buffCharges--;
    this.slowmo = 9;
    this.audio?.play('arcade.golden', { volume: 0.5 });
    this._float(W / 2, 120, 'STEADY HANDS', '#8fe8ff', 1.6, 1.8);
  }

  /* ---------------------------------------------------------------- */
  /* Simulation                                                        */
  /* ---------------------------------------------------------------- */

  update(dt) {
    this.t += dt;
    this.modeT += dt;

    if (this.mode === 'boot' && this.modeT > 3.4) {
      this.mode = 'desktop';
      this.modeT = 0;
      this.cursor.x = W / 2;
      this.cursor.y = H / 2;
    }

    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.swing = Math.max(0, this.swing - dt * 6);

    if (this.mode === 'play') this._updatePlay(dt);

    // Drunk aim: the crosshair drifts on its own. Slow-mo reins it back in,
    // which is exactly what the first two beers bought you.
    if (this.impair > 0 && (this.mode === 'play' || this.mode === 'menu')) {
      const s = this.impair * (this.slowmo > 0 ? 0.3 : 1);
      this.cursor.x = clamp(this.cursor.x
        + (Math.sin(this.t * 0.83) * 46 + Math.sin(this.t * 2.11 + 1.3) * 16) * s * dt, 8, W - 8);
      this.cursor.y = clamp(this.cursor.y
        + (Math.cos(this.t * 0.61 + 0.7) * 30 + Math.sin(this.t * 1.77) * 11) * s * dt, 8, H - 8);
    }

    // Particles and floaters run in every mode so the menu keeps its embers.
    const scale = this.mode === 'play' && this.slowmo > 0 ? 0.45 : 1;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * scale;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += 420 * dt * scale;
      p.x += p.vx * dt * scale;
      p.y += p.vy * dt * scale;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
      f.y -= 26 * dt;
    }

    this._draw();
  }

  _updatePlay(dt) {
    if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - dt);
    const sdt = dt * (this.slowmo > 0 ? 0.45 : 1);

    // Spawning.
    if (this.waveRemaining > 0) {
      this.spawnTimer -= sdt;
      if (this.spawnTimer <= 0) {
        this._spawn();
        this.waveRemaining--;
        const pace = Math.max(0.28, 0.82 - this.wave * 0.05);
        this.spawnTimer = pace * (0.6 + Math.random() * 0.8);
      }
    } else if (this.entities.length === 0) {
      this._nextWave();
    }

    // Entities rise, hold, then drop.
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.age += sdt;
      const k = KINDS[e.kind];

      if (e.dead) {
        e.pop -= sdt * 5;
        if (e.pop <= 0) this.entities.splice(i, 1);
        continue;
      }

      if (e.age < 0.22) {
        e.pop = e.age / 0.22;
      } else if (e.age < k.up) {
        e.pop = 1;
      } else if (e.age < k.up + 0.28) {
        e.pop = 1 - (e.age - k.up) / 0.28;
      } else {
        // Escaped.
        this.entities.splice(i, 1);
        if (!k.friendly) {
          this.combo = 0;
          this.audio?.play('arcade.miss', { volume: 0.4 });
          this._float(e.x, e.y - 40, 'MISSED', '#ff8b6b', 1.0, 1.0);
        }
        continue;
      }
      e.bob = Math.sin(e.age * 9 + e.seed) * 2;
    }
  }

  _spawn() {
    const free = SPOTS.filter((s) => !this.entities.some((e) => e.spot === s && !e.dead));
    if (!free.length) return;
    const spot = free[(Math.random() * free.length) | 0];

    const roll = Math.random();
    const w = this.wave;
    let kind = 'grunt';
    if (roll < 0.02 + Math.min(0.05, w * 0.004)) kind = 'golden';
    else if (roll < 0.14) kind = 'hiker';
    else if (roll < 0.22) kind = 'cub';
    else if (roll < 0.22 + Math.min(0.26, w * 0.035)) kind = 'brute';
    else if (roll < 0.55 + Math.min(0.22, w * 0.03)) kind = 'runner';

    const k = KINDS[kind];
    this.entities.push({
      kind, spot, x: spot.x, y: spot.y, scale: spot.scale,
      age: 0, pop: 0, bob: 0, hp: k.life, dead: false,
      seed: Math.random() * 6.28,
      // Higher waves shorten the window everything is vulnerable for.
      window: k.up * Math.max(0.55, 1 - this.wave * 0.03),
    });
    if (kind === 'golden') this.audio?.play('arcade.golden', { volume: 0.3 });
  }

  _smash() {
    this.swing = 1;
    this.audio?.play('pc.mouseclick', { volume: 0.25 });

    // Topmost (nearest row first) entity under the cursor.
    const hits = this.entities
      .filter((e) => !e.dead && e.pop > 0.3 && this._overlaps(e))
      .sort((a, b) => b.y - a.y);

    if (!hits.length) {
      this.combo = 0;
      this.audio?.play('arcade.miss', { volume: 0.35 });
      this._puff(this.cursor.x, this.cursor.y, '#6b6152', 6);
      return;
    }

    const e = hits[0];
    const k = KINDS[e.kind];

    if (k.friendly) {
      e.dead = true;
      this.lives--;
      this.combo = 0;
      this.shake = 1;
      this.flash = 1;
      this.audio?.play('arcade.hurt', { volume: 0.6 });
      this._float(e.x, e.y - 46, e.kind === 'cub' ? 'THAT WAS A BABY' : 'THAT WAS A HIKER', '#ff5b4a', 1.4, 1.6);
      this._puff(e.x, e.y - 20, '#c85a3a', 16);
      if (this.lives <= 0) this._gameOver();
      return;
    }

    e.hp--;
    this.shake = Math.max(this.shake, 0.45);
    this._puff(e.x, e.y - 24 * e.scale, k.colour, 12);

    if (e.hp > 0) {
      this.audio?.play('arcade.hit', { volume: 0.4, rate: 0.8 });
      this._float(e.x, e.y - 52, 'ARMOURED', '#c9c2b0', 0.9, 0.8);
      return;
    }

    e.dead = true;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = Math.min(8, 1 + Math.floor(this.combo / 3));
    const gained = k.points * mult;
    this.score += gained;

    this.audio?.play('arcade.hit', { volume: 0.55 });
    if (e.kind === 'golden') {
      this.audio?.play('arcade.golden', { volume: 0.6 });
      this.flash = 0.8;
      this.buffCharges++;
    }
    if (this.combo > 1 && this.combo % 3 === 0) {
      this.audio?.play('arcade.combo', { volume: 0.4, rate: 1 + Math.min(0.6, this.combo * 0.03) });
    }
    if (Math.random() < 0.3) this.audio?.play('arcade.roar', { volume: 0.28 });

    this._float(e.x, e.y - 50, `${gained}`, e.kind === 'golden' ? '#ffd24a' : '#e8f0d8', 1.1, 1.1);
    if (mult > 1) this._float(e.x, e.y - 68, `x${mult}`, '#8fe8ff', 0.9, 0.9);
    this.onScore?.(this.score);
  }

  _overlaps(e) {
    const k = KINDS[e.kind];
    const s = e.scale * k.size;
    const hw = 30 * s;
    const hh = 62 * s * e.pop;
    const cx = e.x;
    const cy = e.y - hh / 2 + e.bob;
    return Math.abs(this.cursor.x - cx) < hw && Math.abs(this.cursor.y - cy) < hh / 2 + 10;
  }

  _gameOver() {
    this.mode = 'over';
    this.modeT = 0;
    this.audio?.play('arcade.gameover', { volume: 0.6 });
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('squatchsmash.best', String(this.best));
    }
  }

  _puff(x, y, colour, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 190;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        life: 0.4 + Math.random() * 0.5, size: 1 + Math.random() * 3, colour,
      });
    }
  }

  _float(x, y, text, colour, life, size) {
    this.floaters.push({ x, y, text, colour, life, max: life, size });
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  _draw() {
    const g = this.g;
    g.save();
    if (this.shake > 0) {
      g.translate((Math.random() - 0.5) * this.shake * 9, (Math.random() - 0.5) * this.shake * 9);
    }

    switch (this.mode) {
      case 'off': g.fillStyle = '#05060a'; g.fillRect(-20, -20, W + 40, H + 40); break;
      case 'boot': this._drawBoot(); break;
      case 'desktop': this._drawDesktop(); break;
      case 'menu': this._drawForest(); this._drawMenu(); break;
      case 'play': this._drawForest(); this._drawPlay(); break;
      case 'over': this._drawForest(); this._drawPlay(); this._drawOver(); break;
    }

    g.restore();
    if (this.mode !== 'off') this._drawCrt();
  }

  _drawBoot() {
    const g = this.g;
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, W, H);
    g.font = '13px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillStyle = '#9fe89f';
    const shown = Math.min(this._bootLines.length, Math.floor(this.modeT / 0.42) + 1);
    for (let i = 0; i < shown; i++) {
      g.fillText(this._bootLines[i], 26, 42 + i * 20);
    }
    if (Math.floor(this.t * 2.4) % 2 === 0) {
      g.fillRect(26 + (shown ? g.measureText(this._bootLines[shown - 1]).width : 0) + 4, 32 + (shown - 1) * 20, 8, 13);
    }
  }

  _drawDesktop() {
    const g = this.g;
    // Wallpaper: the same forest, lightly washed out.
    this._drawForest(0.55);
    g.fillStyle = 'rgba(10,14,22,.45)';
    g.fillRect(0, 0, W, H);

    // Icon.
    const hot = this._iconHit(this.cursor.x, this.cursor.y);
    g.fillStyle = hot ? 'rgba(90,140,220,.35)' : 'rgba(0,0,0,0)';
    g.fillRect(26, 26, 92, 96);
    g.fillStyle = '#1b2436';
    g.fillRect(46, 34, 52, 52);
    g.strokeStyle = '#5d7fb5';
    g.lineWidth = 2;
    g.strokeRect(46, 34, 52, 52);
    drawSquatchSilhouette(g, 72, 82, 48, '#cfd8e8');
    g.fillStyle = '#dfe6f2';
    g.font = '11px "Courier New", monospace';
    g.textAlign = 'center';
    g.fillText('SQUATCH', 72, 100);
    g.fillText('SMASH.exe', 72, 112);

    // Taskbar.
    g.fillStyle = 'rgba(12,16,26,.9)';
    g.fillRect(0, H - 26, W, 26);
    g.fillStyle = '#7f8ba0';
    g.font = '11px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillText('SquatchOS', 12, H - 9);
    g.textAlign = 'right';
    g.fillText('6:0' + (4 + Math.floor(this.t / 30)) + ' AM', W - 12, H - 9);

    g.textAlign = 'center';
    g.fillStyle = 'rgba(220,230,245,.6)';
    g.fillText('double-click, or just hit SPACE', W / 2, H - 42);

    this._drawCursor(true);
  }

  /** Night forest backdrop shared by menu and play. */
  _drawForest(dim = 1) {
    const g = this.g;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1020');
    sky.addColorStop(0.55, '#152238');
    sky.addColorStop(1, '#1d2b28');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // Moon + glow.
    g.fillStyle = 'rgba(220,230,255,.10)';
    g.beginPath(); g.arc(524, 86, 52, 0, 7); g.fill();
    g.fillStyle = '#e8eeff';
    g.beginPath(); g.arc(524, 86, 26, 0, 7); g.fill();
    g.fillStyle = '#152238';
    g.beginPath(); g.arc(534, 78, 24, 0, 7); g.fill();

    // Stars.
    for (let i = 0; i < 60; i++) {
      const x = (i * 97.3) % W;
      const y = (i * 53.7) % 130;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 1.4 + i));
      g.fillStyle = `rgba(255,255,255,${tw * 0.5})`;
      g.fillRect(x, y, 1.5, 1.5);
    }

    // Three receding treelines.
    const bands = [
      { y: 152, h: 84, col: '#12202a', step: 30 },
      { y: 178, h: 112, col: '#0c1820', step: 42 },
      { y: 208, h: 146, col: '#071016', step: 58 },
    ];
    for (const b of bands) {
      g.fillStyle = b.col;
      for (let x = -30; x < W + 30; x += b.step) {
        const jitter = ((x * 7919) % 23) - 11;
        g.beginPath();
        g.moveTo(x, b.y);
        g.lineTo(x + b.step / 2, b.y - b.h - jitter);
        g.lineTo(x + b.step, b.y);
        g.closePath();
        g.fill();
      }
      g.fillRect(0, b.y, W, H - b.y);
    }

    // Ground + burrow mounds.
    const ground = g.createLinearGradient(0, 200, 0, H);
    ground.addColorStop(0, '#16241a');
    ground.addColorStop(1, '#0d1711');
    g.fillStyle = ground;
    g.fillRect(0, 206, W, H - 206);
    // Blend the treeline into the clearing rather than butting them together.
    const seam = g.createLinearGradient(0, 194, 0, 232);
    seam.addColorStop(0, 'rgba(7,16,22,.95)');
    seam.addColorStop(1, 'rgba(7,16,22,0)');
    g.fillStyle = seam;
    g.fillRect(0, 194, W, 38);
    for (const s of SPOTS) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.beginPath();
      g.ellipse(s.x, s.y, 42 * s.scale, 12 * s.scale, 0, 0, 7);
      g.fill();
      g.fillStyle = '#233524';
      g.beginPath();
      g.ellipse(s.x, s.y + 6 * s.scale, 46 * s.scale, 12 * s.scale, 0, Math.PI, 0);
      g.fill();
    }

    // Ground fog.
    const fog = g.createLinearGradient(0, 190, 0, H);
    fog.addColorStop(0, 'rgba(130,160,170,0)');
    fog.addColorStop(0.45, 'rgba(130,160,170,.10)');
    fog.addColorStop(1, 'rgba(130,160,170,.05)');
    g.fillStyle = fog;
    g.fillRect(0, 190, W, H - 190);

    if (dim < 1) {
      g.fillStyle = `rgba(8,12,20,${1 - dim})`;
      g.fillRect(0, 0, W, H);
    }
  }

  _drawPlay() {
    const g = this.g;

    // Entities, far rows first.
    const sorted = [...this.entities].sort((a, b) => a.y - b.y);
    for (const e of sorted) this._drawEntity(e);

    // Particles.
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      g.fillStyle = p.colour;
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.globalAlpha = 1;

    // Floating text.
    g.textAlign = 'center';
    for (const f of this.floaters) {
      const a = Math.min(1, f.life / f.max * 1.6);
      g.globalAlpha = a;
      g.font = `bold ${Math.round(14 * f.size)}px "Courier New", monospace`;
      g.fillStyle = '#000';
      g.fillText(f.text, f.x + 1, f.y + 1);
      g.fillStyle = f.colour;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;

    this._drawHud();
    if (this.mode === 'play') this._drawCursor(false);

    if (this.flash > 0) {
      g.fillStyle = `rgba(255,70,50,${this.flash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }
    if (this.slowmo > 0) {
      g.fillStyle = `rgba(90,180,255,${0.07 + Math.sin(this.t * 6) * 0.02})`;
      g.fillRect(0, 0, W, H);
    }
  }

  _drawEntity(e) {
    const g = this.g;
    const k = KINDS[e.kind];
    const s = e.scale * k.size;
    const rise = 62 * s * e.pop;
    const baseY = e.y + 4 + e.bob;

    g.save();
    // Clip so they emerge from the mound instead of sliding over it.
    g.beginPath();
    g.rect(e.x - 60 * s, baseY - 130 * s, 120 * s, 130 * s);
    g.clip();

    const top = baseY - rise;

    if (e.kind === 'hiker') {
      // Bright jacket, small pack, definitely not a squatch.
      g.fillStyle = '#2b3a4a';
      g.fillRect(e.x - 9 * s, top + 26 * s, 18 * s, 36 * s);
      g.fillStyle = k.colour;
      g.fillRect(e.x - 13 * s, top + 8 * s, 26 * s, 26 * s);
      g.fillStyle = '#e8c9a0';
      g.beginPath(); g.arc(e.x, top + 2 * s, 9 * s, 0, 7); g.fill();
      g.fillStyle = '#d8d24a';
      g.fillRect(e.x - 12 * s, top - 6 * s, 24 * s, 6 * s);
    } else {
      const body = k.colour;
      drawSquatchSilhouette(g, e.x, baseY, 96 * s * Math.max(0.05, e.pop), body);
      // Eyes glow so they read at a glance.
      const eyeY = top + 10 * s;
      g.fillStyle = e.kind === 'golden' ? '#fff2ad' : e.kind === 'cub' ? '#9fe8ff' : '#ffcf5a';
      g.fillRect(e.x - 7 * s, eyeY, 4 * s, 3 * s);
      g.fillRect(e.x + 3 * s, eyeY, 4 * s, 3 * s);
      if (e.kind === 'brute' && e.hp > 1) {
        // Armour plate.
        g.fillStyle = '#8d939c';
        g.fillRect(e.x - 14 * s, top + 22 * s, 28 * s, 12 * s);
      }
      if (e.kind === 'golden') {
        g.globalAlpha = 0.35 + Math.sin(this.t * 8) * 0.15;
        g.fillStyle = '#ffe89a';
        drawSquatchSilhouette(g, e.x, baseY, 100 * s * Math.max(0.05, e.pop), '#ffe89a');
        g.globalAlpha = 1;
      }
      if (e.kind === 'cub') {
        g.fillStyle = '#ffd9e8';
        g.fillRect(e.x - 4 * s, top + 18 * s, 8 * s, 3 * s);
      }
    }

    if (e.dead) {
      g.globalAlpha = Math.max(0, e.pop);
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.fillRect(e.x - 30 * s, top, 60 * s, 60 * s);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  _drawHud() {
    const g = this.g;
    g.font = 'bold 15px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillStyle = '#0008';
    g.fillRect(0, 0, W, 30);

    g.fillStyle = '#f0e8d0';
    g.fillText(`SCORE ${this.score}`, 12, 20);

    g.textAlign = 'center';
    g.fillStyle = this.combo >= 3 ? '#8fe8ff' : '#8d8577';
    g.fillText(this.combo >= 2 ? `COMBO x${Math.min(8, 1 + Math.floor(this.combo / 3))}` : `WAVE ${this.wave}`, W / 2, 20);

    g.textAlign = 'right';
    g.fillStyle = '#ff6b5e';
    g.fillText('♥'.repeat(Math.max(0, this.lives)), W - 12, 20);

    if (this.buffCharges > 0) {
      g.textAlign = 'left';
      g.font = '11px "Courier New", monospace';
      g.fillStyle = '#ffd24a';
      g.fillText(`[B] STEADY HANDS x${this.buffCharges}`, 12, 44);
    }
    if (this.slowmo > 0) {
      g.textAlign = 'left';
      g.font = '11px "Courier New", monospace';
      g.fillStyle = '#8fe8ff';
      g.fillText(`STEADY ${this.slowmo.toFixed(1)}s`, 12, 58);
    }
    if (this.impair > 0.25 && this.slowmo <= 0) {
      g.textAlign = 'right';
      g.font = '11px "Courier New", monospace';
      g.fillStyle = '#ff9a5e';
      g.fillText(this.impair > 0.8 ? 'VISION SWIMMING' : 'HANDS UNSTEADY', W - 12, 40);
    }
  }

  _drawMenu() {
    const g = this.g;
    g.fillStyle = 'rgba(6,10,18,.62)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.fillStyle = '#f0e8d0';
    g.font = 'bold 52px "Courier New", monospace';
    g.fillText('SQUATCH', W / 2, 128);
    g.fillStyle = '#ffb648';
    g.fillText('SMASH', W / 2, 178);

    g.font = '13px "Courier New", monospace';
    g.fillStyle = '#b9ae97';
    g.fillText('smash the squatch. spare the hiker.', W / 2, 212);

    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 2.4));
    g.globalAlpha = pulse;
    g.fillStyle = '#f0e8d0';
    g.font = 'bold 15px "Courier New", monospace';
    g.fillText('CLICK  or  SPACE  to start', W / 2, 258);
    g.globalAlpha = 1;

    g.font = '12px "Courier New", monospace';
    g.fillStyle = '#7f7767';
    g.fillText(`BEST  ${this.best}`, W / 2, 292);
    g.fillText('Q to get up from the desk', W / 2, 312);

    this._drawCursor(true);
  }

  _drawOver() {
    const g = this.g;
    g.fillStyle = 'rgba(6,10,18,.74)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';

    g.fillStyle = '#ff6b5e';
    g.font = 'bold 40px "Courier New", monospace';
    g.fillText('GAME OVER', W / 2, 138);

    g.fillStyle = '#f0e8d0';
    g.font = 'bold 20px "Courier New", monospace';
    g.fillText(`SCORE  ${this.score}`, W / 2, 182);
    g.font = '13px "Courier New", monospace';
    g.fillStyle = '#b9ae97';
    g.fillText(`WAVE ${this.wave}   BEST COMBO x${Math.min(8, 1 + Math.floor(this.bestCombo / 3))}`, W / 2, 208);
    g.fillStyle = this.score >= this.best ? '#ffd24a' : '#7f7767';
    g.fillText(this.score >= this.best ? 'NEW PERSONAL BEST' : `BEST  ${this.best}`, W / 2, 232);

    if (this.modeT > 1.1) {
      g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 2.4));
      g.fillStyle = '#f0e8d0';
      g.font = 'bold 14px "Courier New", monospace';
      g.fillText('CLICK to continue', W / 2, 278);
      g.globalAlpha = 1;
    }
  }

  _drawCursor(arrow) {
    const g = this.g;
    const { x, y } = this.cursor;
    if (arrow) {
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
      return;
    }
    // Play mode: a club-shaped reticle that kicks on swing.
    const k = this.swing;
    g.save();
    g.translate(x, y);
    g.rotate(-k * 0.9);
    g.strokeStyle = k > 0 ? '#ffd24a' : '#f0e8d0';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 11 - k * 3, 0, 7);
    g.stroke();
    g.beginPath();
    g.moveTo(-17, 0); g.lineTo(-6, 0);
    g.moveTo(17, 0); g.lineTo(6, 0);
    g.moveTo(0, -17); g.lineTo(0, -6);
    g.moveTo(0, 17); g.lineTo(0, 6);
    g.stroke();
    g.restore();
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

  /** Average screen brightness/hue, used to drive the monitor's room glow. */
  sampleGlow() {
    switch (this.mode) {
      case 'off': return { colour: 0x000000, intensity: 0 };
      case 'boot': return { colour: 0x66ff88, intensity: 0.5 };
      case 'desktop': return { colour: 0x6f8fc8, intensity: 0.9 };
      default:
        return {
          colour: this.flash > 0.2 ? 0xff5a44 : this.slowmo > 0 ? 0x66aaff : 0x7fa8d8,
          intensity: 1.1 + (this.flash > 0.2 ? 0.8 : 0),
        };
    }
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

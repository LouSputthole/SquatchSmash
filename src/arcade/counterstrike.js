/**
 * COUNTER-SQUATCH: GLOBAL OFFENSE
 *
 * A parody. The joke is that you never get to play: every round you spawn,
 * get a fraction of a second of control, and are killed through a wall by
 * somebody who is very obviously cheating. The window shrinks each round
 * until you are being killed before you have spawned at all.
 *
 * There is no way to win and that is the point. The only thing that changes
 * is your rank, which only ever goes down, and the killfeed, which gets less
 * plausible.
 */
import { W, H } from './os.js';

/** How long you get to hold the mouse before it happens, by death count. */
function windowFor(deaths) {
  if (deaths >= 9) return 0;                    // killed in the buy menu
  return Math.max(0.12, 1.5 * Math.pow(0.78, deaths));
}

const CHEATERS = [
  'xX_no_recoil_Xx',
  'definitely_not_cheating',
  'SILVER_ANDY_2009',
  'ur_mom_HVH',
  'AWP_god_ttv',
  'legit_player_99',
  'hardware_ban_survivor',
  '[VAC]_pending',
  'my_uncle_works_at_valve',
  'wallhacks.exe',
];

const WEAPONS = ['AWP', 'AK-47', 'DEAGLE', 'SCAR-20', 'NEGEV', 'ZEUS x27', 'KNIFE'];

const TAGS = ['WALLBANG', 'THROUGH SMOKE', 'NOSCOPE', 'PRE-FIRED', 'BLIND', 'AIRBORNE'];

const RANKS = [
  'SILVER IV', 'SILVER III', 'SILVER II', 'SILVER I',
  'SILVER ELITE… no',
  'UNRANKED',
  'BELOW UNRANKED',
  'SPECTATOR (INVOLUNTARY)',
  'PLEASE STOP',
];

/** Lines the game shows on the death screen, in order of desperation. */
const DEATH_NOTES = [
  'You were killed by a player with a 94% headshot rate.',
  'Their crosshair was already on you when you spawned.',
  'Report filed. Thank you. It has been ignored.',
  'You did not see them. They saw you through two walls and a crate.',
  'Their account is nine hours old.',
  'Overwatch has reviewed the demo and taken no action.',
  'You have not fired a single bullet this match.',
  'Consider a different hobby. Consider the fridge.',
  'You were killed during the warmup.',
  'You were killed in the buy menu. You had not spawned yet.',
];

export class CounterSquatch {
  constructor({ audio, os } = {}) {
    this.id = 'counter';
    this.label = 'COUNTER-\nSQUATCH.exe';
    this.audio = audio;
    this.os = os;
    this.g = os.g;
    this.state = 'menu';   // menu | buy | alive | dead | scoreboard
    this.t = 0;
    this.stateT = 0;

    this.deaths = 0;
    this.kills = 0;
    this.shots = 0;
    this.reports = 0;
    this.impair = 0;
    this.fluked = false;

    this.cursor = { x: W / 2, y: H / 2 };
    this.aimYaw = 0;
    this.killfeed = [];
    this.killer = CHEATERS[0];
    this.weapon = 'AWP';
    this.tag = 'WALLBANG';
    this.shake = 0;
    this.flash = 0;
    this.reportHot = false;
    this.best = 0;
  }

  /* ---------------------------------------------------------------- */

  drawIcon(g, cx, cy, s) {
    // A crosshair over a crate, which is as close to a logo as it deserves.
    g.fillStyle = '#2a2f3a';
    g.fillRect(cx - s / 2, cy - s / 2, s, s);
    g.strokeStyle = '#6f7a8d';
    g.lineWidth = 2;
    g.strokeRect(cx - s / 2, cy - s / 2, s, s);
    g.strokeStyle = '#c8a24a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx - s / 2, cy - s / 6); g.lineTo(cx + s / 2, cy - s / 6);
    g.moveTo(cx - s / 2, cy + s / 6); g.lineTo(cx + s / 2, cy + s / 6);
    g.stroke();
    g.strokeStyle = '#e8f0ff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 11, cy); g.lineTo(cx - 4, cy);
    g.moveTo(cx + 4, cy); g.lineTo(cx + 11, cy);
    g.moveTo(cx, cy - 11); g.lineTo(cx, cy - 4);
    g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 11);
    g.stroke();
    g.strokeStyle = '#d94a3a';
    g.beginPath();
    g.arc(cx, cy, 3.5, 0, 7);
    g.stroke();
  }

  enter() {
    this.state = 'menu';
    this.stateT = 0;
    this.deaths = 0;
    this.kills = 0;
    this.shots = 0;
    this.reports = 0;
    this.fluked = false;
    this.killfeed = [];
    this.cursor.x = W / 2;
    this.cursor.y = H / 2;
  }

  exit() { }

  setImpairment(v) { this.impair = v; }

  get rank() {
    return RANKS[Math.min(RANKS.length - 1, Math.floor(this.deaths / 1.5))];
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  onPointer(dx, dy) {
    const sens = 0.62;
    if (this.state === 'alive') {
      // You do have control. It just does not help.
      this.aimYaw = clamp(this.aimYaw + dx * 0.9, -220, 220);
      this.cursor.y = clamp(this.cursor.y + dy * sens, 40, H - 40);
      return;
    }
    this.cursor.x = clamp(this.cursor.x + dx * sens, 4, W - 4);
    this.cursor.y = clamp(this.cursor.y + dy * sens, 4, H - 4);
  }

  onClick(down) {
    if (!down) return;
    if (this.state === 'menu') { this._startMatch(); return; }
    if (this.state === 'alive') {
      // You are allowed to shoot. Nothing has ever been there -- with one
      // exception per match, so that "last session: 7 deaths, 1 kills" is
      // occasionally true and you have something to bring up at the meeting.
      this.shots++;
      this.audio?.play('cs.shot', { volume: 0.5 });
      if (!this.fluked && this.deaths >= 2 && Math.random() < 0.05) this._fluke();
      return;
    }
    if (this.state === 'dead') {
      if (this._reportHit(this.cursor.x, this.cursor.y)) this._report();
      else if (this.stateT > 1.6) this._respawn();
      return;
    }
    if (this.state === 'scoreboard' && this.stateT > 0.8) this.state = 'menu';
  }

  onKey(code, down) {
    if (!down) return false;
    if (code === 'Space' || code === 'Enter') {
      if (this.state === 'menu') this._startMatch();
      else if (this.state === 'dead' && this.stateT > 1.6) this._respawn();
      else if (this.state === 'scoreboard') this.state = 'menu';
      return true;
    }
    if (code === 'KeyR' && this.state === 'dead') { this._report(); return true; }
    return false;
  }

  /* ---------------------------------------------------------------- */

  _startMatch() {
    this.state = 'buy';
    this.stateT = 0;
    this.audio?.play('cs.round', { volume: 0.5 });
  }

  _respawn() {
    if (this.deaths >= DEATH_NOTES.length) {
      this.state = 'scoreboard';
      this.stateT = 0;
      return;
    }
    this.state = 'buy';
    this.stateT = 0;
    this.audio?.play('cs.round', { volume: 0.4 });
  }

  _spawn() {
    this.state = 'alive';
    this.stateT = 0;
    this.aimYaw = 0;
    this.cursor.y = H / 2;
    this.window = windowFor(this.deaths);
  }

  /* One bullet, one match, and it lands. It does not save the round. */
  _fluke() {
    this.fluked = true;
    this.kills++;
    this.flash = 0.5;
    const victim = CHEATERS[(Math.random() * CHEATERS.length) | 0];
    this.killfeed.unshift({
      killer: 'you', weapon: WEAPONS[(Math.random() * WEAPONS.length) | 0],
      tag: TAGS[(Math.random() * TAGS.length) | 0], victim, life: 6, mine: true,
    });
    if (this.killfeed.length > 5) this.killfeed.pop();
    this.audio?.play('cs.headshot', { volume: 0.7 });
    this.audio?.say?.('cs.kill', { delay: 0.5 });
  }

  _die() {
    this.deaths++;
    this.state = 'dead';
    this.stateT = 0;
    this.shake = 1;
    this.flash = 1;

    this.killer = CHEATERS[(this.deaths - 1) % CHEATERS.length];
    this.weapon = WEAPONS[(Math.random() * WEAPONS.length) | 0];
    this.tag = TAGS[(Math.random() * TAGS.length) | 0];

    this.killfeed.unshift({ killer: this.killer, weapon: this.weapon, tag: this.tag, life: 6 });
    if (this.killfeed.length > 5) this.killfeed.pop();

    this.audio?.play('cs.death', { volume: 0.6 });
    this.best = Math.max(this.best, this.deaths);
  }

  _reportHit(x, y) {
    return x > W / 2 - 78 && x < W / 2 + 78 && y > 236 && y < 262;
  }

  _report() {
    this.reports++;
    this.audio?.play('ui.select', { volume: 0.4 });
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    this.shake = Math.max(0, this.shake - dt * 3.4);
    this.flash = Math.max(0, this.flash - dt * 3.6);

    for (const k of this.killfeed) k.life -= dt;
    while (this.killfeed.length && this.killfeed[this.killfeed.length - 1].life <= 0) {
      this.killfeed.pop();
    }

    if (this.state === 'buy' && this.stateT > 0.85) this._spawn();
    if (this.state === 'alive' && this.stateT >= this.window) this._die();

    this._draw();
  }

  glow() {
    if (this.state === 'dead') return { colour: 0xff4436, intensity: 1.3 };
    if (this.state === 'alive') return { colour: 0xc8b48a, intensity: 1.1 };
    return { colour: 0x7f93b8, intensity: 0.95 };
  }

  /* ---------------------------------------------------------------- */

  _draw() {
    const g = this.g;
    g.save();
    if (this.shake > 0) {
      g.translate((Math.random() - 0.5) * this.shake * 11, (Math.random() - 0.5) * this.shake * 11);
    }

    switch (this.state) {
      case 'menu': this._drawMenu(); break;
      case 'buy': this._drawMap(); this._drawBuy(); break;
      case 'alive': this._drawMap(); this._drawHud(); this._drawReticle(); break;
      case 'dead': this._drawMap(); this._drawHud(); this._drawDead(); break;
      case 'scoreboard': this._drawMap(); this._drawScoreboard(); break;
    }
    g.restore();

    if (this.flash > 0) {
      g.fillStyle = `rgba(180,20,10,${this.flash * 0.45})`;
      g.fillRect(0, 0, W, H);
    }
  }

  /** A dusty corridor. Deliberately drab. */
  _drawMap() {
    const g = this.g;
    const pan = this.aimYaw;

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9c8f6f');
    sky.addColorStop(0.5, '#c3b48c');
    sky.addColorStop(1, '#8a7c5c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // Far wall with an arch you will never reach.
    g.fillStyle = '#a3906a';
    g.fillRect(-pan * 0.15 + 120, 60, 400, 200);
    g.fillStyle = '#7d6c4e';
    g.fillRect(-pan * 0.15 + 250, 120, 140, 140);

    // Side walls, parallaxing faster.
    g.fillStyle = '#8d7c5c';
    g.fillRect(-pan * 0.5 - 240, 20, 300, 320);
    g.fillRect(-pan * 0.5 + 580, 20, 300, 320);

    // Crates.
    g.fillStyle = '#8a6a3e';
    for (const [cx, cw] of [[-pan * 0.5 + 90, 70], [-pan * 0.5 + 470, 60]]) {
      g.fillRect(cx, 232, cw, cw);
      g.strokeStyle = '#6a4f2c';
      g.lineWidth = 3;
      g.strokeRect(cx, 232, cw, cw);
    }

    // Floor.
    g.fillStyle = '#b9a97f';
    g.fillRect(0, 296, W, H - 296);
    g.strokeStyle = 'rgba(120,104,72,.45)';
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = 300 + i * 8;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }

    // Dust in the light.
    for (let i = 0; i < 26; i++) {
      const x = (i * 211 + this.t * 9) % W;
      const y = (i * 97) % 260 + 30;
      g.fillStyle = `rgba(255,246,220,${0.05 + (i % 3) * 0.03})`;
      g.fillRect(x, y, 2, 2);
    }
  }

  _drawMenu() {
    const g = this.g;
    g.fillStyle = 'rgba(12,14,20,.82)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.fillStyle = '#e8ecf4';
    g.font = 'bold 34px "Courier New", monospace';
    g.fillText('COUNTER-SQUATCH', W / 2, 92);
    g.fillStyle = '#c8a24a';
    g.font = 'bold 17px "Courier New", monospace';
    g.fillText('GLOBAL OFFENSE', W / 2, 118);

    g.font = '12px "Courier New", monospace';
    g.fillStyle = '#8e97a8';
    g.fillText('competitive · matchmaking · 128 tick (allegedly)', W / 2, 152);

    g.fillStyle = '#6f7a8d';
    g.fillText(`RANK  ${this.rank}`, W / 2, 186);

    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 2.4));
    g.globalAlpha = pulse;
    g.fillStyle = '#e8ecf4';
    g.font = 'bold 15px "Courier New", monospace';
    g.fillText('CLICK  or  SPACE  to queue', W / 2, 228);
    g.globalAlpha = 1;

    g.font = '11px "Courier New", monospace';
    g.fillStyle = '#5d6675';
    g.fillText('TAB returns to the desktop', W / 2, 264);
    if (this.best > 0) {
      g.fillStyle = '#8e97a8';
      g.fillText(`last session: ${this.best} deaths, ${this.kills} kills`, W / 2, 286);
    }

    this._drawCursor();
  }

  _drawBuy() {
    const g = this.g;
    g.fillStyle = 'rgba(10,12,18,.86)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'left';
    g.fillStyle = '#c8a24a';
    g.font = 'bold 15px "Courier New", monospace';
    g.fillText('BUY MENU', 40, 54);

    g.font = '12px "Courier New", monospace';
    const items = [
      ['1', 'AK-47', '$2700'], ['2', 'AWP', '$4750'], ['3', 'ARMOUR', '$1000'],
      ['4', 'DEFUSE KIT', '$400'], ['5', 'SMOKE', '$300'], ['6', 'HOPE', '$0'],
    ];
    items.forEach(([k, n, p], i) => {
      g.fillStyle = '#7f8a9d';
      g.fillText(`[${k}]  ${n}`, 40, 84 + i * 22);
      g.textAlign = 'right';
      g.fillStyle = i === 5 ? '#4a5262' : '#9aa6ba';
      g.fillText(p, 300, 84 + i * 22);
      g.textAlign = 'left';
    });

    // The timer runs out before you could possibly use any of it.
    const left = Math.max(0, 0.85 - this.stateT);
    g.textAlign = 'center';
    g.fillStyle = '#e8ecf4';
    g.font = 'bold 26px "Courier New", monospace';
    g.fillText(`0:0${Math.ceil(left * 10)}`, W / 2 + 160, 130);
    g.font = '11px "Courier New", monospace';
    g.fillStyle = '#6f7a8d';
    g.fillText('buy time remaining', W / 2 + 160, 150);

    g.fillStyle = '#c8a24a';
    g.font = '12px "Courier New", monospace';
    g.fillText(this.deaths === 0 ? 'MATCH FOUND' : `ROUND ${this.deaths + 1}`, W / 2, 300);
  }

  _drawHud() {
    const g = this.g;

    // Killfeed.
    g.textAlign = 'right';
    g.font = '11px "Courier New", monospace';
    this.killfeed.forEach((k, i) => {
      const a = Math.min(1, k.life / 1.2);
      g.globalAlpha = a;
      g.fillStyle = 'rgba(10,12,18,.6)';
      // Almost always they killed you. Once a match, the other way round.
      const victim = k.victim || 'you';
      const mid = `[${k.weapon}] ${k.tag}  `;
      const label = `${k.killer}  ${mid}${victim}`;
      const w = g.measureText(label).width + 14;
      g.fillRect(W - 12 - w, 12 + i * 17, w, 15);
      g.fillStyle = k.mine ? '#5fb06a' : '#e05a44';
      g.fillText(`${k.killer}  `, W - 12 - g.measureText(`${mid}${victim}`).width - 6, 24 + i * 17);
      g.fillStyle = '#c8a24a';
      g.fillText(mid, W - 12 - g.measureText(victim).width - 4, 24 + i * 17);
      g.fillStyle = '#9aa6ba';
      g.fillText(victim, W - 14, 24 + i * 17);
      g.globalAlpha = 1;
    });

    // Bottom bar.
    g.textAlign = 'left';
    g.fillStyle = 'rgba(10,12,18,.55)';
    g.fillRect(0, H - 34, W, 34);
    g.font = 'bold 17px "Courier New", monospace';
    g.fillStyle = this.state === 'dead' ? '#7a2a22' : '#dfe6f2';
    g.fillText(`${this.state === 'dead' ? 0 : 100} HP`, 14, H - 12);
    g.font = '12px "Courier New", monospace';
    g.fillStyle = '#8e97a8';
    g.fillText(`$800`, 96, H - 12);

    g.textAlign = 'center';
    g.fillStyle = '#8e97a8';
    g.fillText(`K ${this.kills}   D ${this.deaths}`, W / 2, H - 12);

    g.textAlign = 'right';
    g.fillStyle = '#c8a24a';
    g.font = 'bold 14px "Courier New", monospace';
    g.fillText('AWP', W - 14, H - 12);
  }

  _drawReticle() {
    const g = this.g;
    const x = W / 2;
    const y = this.cursor.y;
    // A little sway if the player has been drinking.
    const s = this.impair * 6;
    const ox = Math.sin(this.t * 2.2) * s;
    const oy = Math.cos(this.t * 1.7) * s * 0.6;
    g.strokeStyle = '#5efc82';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + ox - 11, y + oy); g.lineTo(x + ox - 4, y + oy);
    g.moveTo(x + ox + 4, y + oy); g.lineTo(x + ox + 11, y + oy);
    g.moveTo(x + ox, y + oy - 11); g.lineTo(x + ox, y + oy - 4);
    g.moveTo(x + ox, y + oy + 4); g.lineTo(x + ox, y + oy + 11);
    g.stroke();
  }

  _drawDead() {
    const g = this.g;
    g.fillStyle = 'rgba(20,6,4,.62)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.fillStyle = '#e8ecf4';
    g.font = 'bold 15px "Courier New", monospace';
    g.fillText('You were killed by', W / 2, 74);

    g.fillStyle = '#ff6b5e';
    g.font = 'bold 24px "Courier New", monospace';
    g.fillText(this.killer, W / 2, 106);

    g.fillStyle = '#c8a24a';
    g.font = '13px "Courier New", monospace';
    g.fillText(`${this.weapon}  ·  ${this.tag}  ·  ${this.deaths === 1 ? '1st' : this.deaths + 'th'} death`, W / 2, 132);

    g.fillStyle = '#a9b2c2';
    g.font = '12px "Courier New", monospace';
    const note = DEATH_NOTES[Math.min(DEATH_NOTES.length - 1, this.deaths - 1)];
    wrap(g, note, W / 2, 166, 420, 17);

    // The report button. It works. Nothing happens.
    const hot = this._reportHit(this.cursor.x, this.cursor.y);
    g.fillStyle = hot ? '#3a4152' : '#262b36';
    g.fillRect(W / 2 - 78, 236, 156, 26);
    g.strokeStyle = '#4e576a';
    g.lineWidth = 1;
    g.strokeRect(W / 2 - 78.5, 235.5, 157, 27);
    g.fillStyle = '#dfe6f2';
    g.font = 'bold 12px "Courier New", monospace';
    g.fillText(this.reports === 0 ? 'REPORT PLAYER' : `REPORTED (${this.reports})`, W / 2, 253);

    if (this.reports > 0) {
      g.fillStyle = '#6f7a8d';
      g.font = '11px "Courier New", monospace';
      g.fillText(
        this.reports < 3 ? 'Thank you. We take this seriously.'
          : this.reports < 6 ? 'Thank you. We still take this seriously.'
            : 'Thank you.',
        W / 2, 278,
      );
    }

    if (this.stateT > 1.6) {
      g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 2.6));
      g.fillStyle = '#e8ecf4';
      g.font = 'bold 12px "Courier New", monospace';
      g.fillText('CLICK or SPACE to requeue', W / 2, 306);
      g.globalAlpha = 1;
    }

    this._drawCursor();
  }

  _drawScoreboard() {
    const g = this.g;
    g.fillStyle = 'rgba(10,12,18,.88)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.fillStyle = '#ff6b5e';
    g.font = 'bold 26px "Courier New", monospace';
    g.fillText('MATCH ABANDONED', W / 2, 74);

    g.fillStyle = '#a9b2c2';
    g.font = '13px "Courier New", monospace';
    g.fillText('Not by you. Everyone else left.', W / 2, 100);

    const rows = [
      ['deaths', String(this.deaths)],
      ['kills', String(this.kills)],
      ['shots fired', String(this.shots)],
      ['reports filed', String(this.reports)],
      ['action taken', 'none'],
      ['rank', this.rank],
    ];
    g.font = '12px "Courier New", monospace';
    rows.forEach(([k, v], i) => {
      const y = 138 + i * 20;
      g.textAlign = 'left';
      g.fillStyle = '#7f8a9d';
      g.fillText(k, W / 2 - 110, y);
      g.textAlign = 'right';
      g.fillStyle = i === 4 ? '#e05a44' : '#dfe6f2';
      g.fillText(v, W / 2 + 110, y);
    });

    if (this.stateT > 0.8) {
      g.textAlign = 'center';
      g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 2.4));
      g.fillStyle = '#e8ecf4';
      g.fillText('CLICK to go again', W / 2, 300);
      g.globalAlpha = 1;
    }
    this._drawCursor();
  }

  _drawCursor() {
    const g = this.g;
    const { x, y } = this.cursor;
    g.fillStyle = '#f0e8d0';
    g.strokeStyle = '#101418';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x, y + 15);
    g.lineTo(x + 4.5, y + 11); g.lineTo(x + 10, y + 10);
    g.closePath();
    g.fill(); g.stroke();
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function wrap(g, text, cx, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((ln, i) => g.fillText(ln, cx, y + i * lh));
}

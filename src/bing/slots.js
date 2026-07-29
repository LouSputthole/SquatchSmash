/**
 * The slot machine.
 *
 * Purple and gold, bolted to the floor near the front booths, and playable
 * without leaving the room: the camera never takes over, there is no menu, and
 * everything you press is a button on the cabinet.
 *
 * The reels are three cylinders sharing one strip texture. Spinning is a real
 * rotation that eases into a stop on a chosen symbol, so what the reels say is
 * what the machine paid.
 */
import * as THREE from 'three';
import { mat, box, cylinder, sphere, group } from '../world/build.js';
import { lit, sign, printed, rand } from './kit.js';

/** The strip, in reel order. Twelve stops, one of them a squatch. */
const STRIP = ['cigar', 'duck', 'steak', 'cigar', 'cash', 'duck', 'cigar', 'steak', 'cash', 'cigar', 'duck', 'squatch'];

export const PAYOUTS = {
  cigar: 5,
  duck: 10,
  steak: 15,
  cash: 25,
  squatch: 0,        // the jackpot is handled separately
};

export const WAGERS = [5, 10, 25, 50];

const SYMBOL_ORDER = ['cigar', 'duck', 'steak', 'cash', 'squatch'];

function drawSymbol(g, kind, s) {
  g.save();
  if (kind === 'cigar') {
    g.fillStyle = '#6b4326';
    g.fillRect(s * 0.18, s * 0.44, s * 0.58, s * 0.13);
    g.fillStyle = '#3a2a1c';
    g.fillRect(s * 0.18, s * 0.44, s * 0.1, s * 0.13);
    g.fillStyle = '#e8a23a';
    g.fillRect(s * 0.5, s * 0.44, s * 0.08, s * 0.13);
    g.globalAlpha = 0.5;
    g.fillStyle = '#d9d9d9';
    g.beginPath();
    g.arc(s * 0.82, s * 0.36, s * 0.07, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'duck') {
    g.fillStyle = '#f0e14a';
    g.beginPath();
    g.ellipse(s * 0.46, s * 0.6, s * 0.24, s * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(s * 0.66, s * 0.38, s * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8892a';
    g.fillRect(s * 0.76, s * 0.36, s * 0.15, s * 0.06);
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(s * 0.7, s * 0.34, s * 0.022, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'steak') {
    g.fillStyle = '#a83a3a';
    g.beginPath();
    g.ellipse(s * 0.5, s * 0.52, s * 0.27, s * 0.2, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8d0c0';
    g.beginPath();
    g.ellipse(s * 0.68, s * 0.62, s * 0.09, s * 0.05, 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6e2020';
    g.lineWidth = s * 0.018;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(s * 0.34, s * (0.5 + i * 0.08));
      g.lineTo(s * 0.64, s * (0.46 + i * 0.08));
      g.stroke();
    }
  } else if (kind === 'cash') {
    g.fillStyle = '#3f7a4a';
    g.fillRect(s * 0.22, s * 0.38, s * 0.56, s * 0.28);
    g.strokeStyle = '#8fd8a0';
    g.lineWidth = s * 0.014;
    g.strokeRect(s * 0.26, s * 0.42, s * 0.48, s * 0.2);
    g.fillStyle = '#8fd8a0';
    g.font = `900 ${s * 0.22}px "Trebuchet MS", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('$', s * 0.5, s * 0.53);
  } else {
    // The team mark: silver squatch head, red bandana.
    g.fillStyle = '#9aa0ab';
    g.fillRect(s * 0.34, s * 0.3, s * 0.32, s * 0.34);
    g.fillStyle = '#c3c8d4';
    g.fillRect(s * 0.38, s * 0.44, s * 0.24, s * 0.18);
    g.fillStyle = '#d92e2e';
    g.fillRect(s * 0.32, s * 0.27, s * 0.36, s * 0.09);
    g.fillStyle = '#232a3d';
    g.fillRect(s * 0.41, s * 0.47, s * 0.05, s * 0.04);
    g.fillRect(s * 0.54, s * 0.47, s * 0.05, s * 0.04);
    g.fillStyle = '#6e747f';
    g.fillRect(s * 0.3, s * 0.64, s * 0.4, s * 0.06);
  }
  g.restore();
}

function reelTexture() {
  const cell = 128;
  const n = STRIP.length;
  const c = document.createElement('canvas');
  c.width = cell;
  c.height = cell * n;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.save();
    g.translate(0, i * cell);
    g.fillStyle = i % 2 ? '#f6f2e8' : '#eae4d6';
    g.fillRect(0, 0, cell, cell);
    g.strokeStyle = '#b8b0a0';
    g.lineWidth = 4;
    g.strokeRect(2, 2, cell - 4, cell - 4);
    drawSymbol(g, STRIP[i], cell);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** The cabinet. Returns the group and every part the game animates. */
export function makeSlotMachine({ x, z, rotY = 0 }) {
  const purple = mat({ color: 0x3f2470, roughness: 0.42, metalness: 0.15 });
  const gold = mat({ color: 0xc8a24a, roughness: 0.3, metalness: 0.8 });
  const chrome = mat({ color: 0xb9c0cc, roughness: 0.2, metalness: 0.95 });

  const g = group('slot-machine');
  g.add(box({ size: [0.92, 0.95, 0.64], pos: [0, 0.48, 0], mat: purple }));
  /* The reel housing is a bezel, not a box. Built as one solid cabinet, the
   * reels sat inside it and the machine was a purple slab with a name on it. */
  g.add(box({ size: [0.98, 0.16, 0.62], pos: [0, 1.55, -0.04], mat: purple }));   // above the window
  g.add(box({ size: [0.98, 0.14, 0.62], pos: [0, 1.02, -0.04], mat: purple }));   // below it
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.16, 0.55, 0.62], pos: [sx * 0.41, 1.3, -0.04], mat: purple }));
  }
  g.add(box({ size: [0.98, 0.7, 0.06], pos: [0, 1.28, -0.32], mat: mat({ color: 0x1a1030, roughness: 0.9 }) }));
  g.add(box({ size: [1.02, 0.55, 0.62], pos: [0, 1.88, -0.04], mat: purple }));
  g.add(box({ size: [1.04, 0.06, 0.72], pos: [0, 0.96, 0], mat: gold }));
  g.add(box({ size: [1.06, 0.06, 0.64], pos: [0, 2.18, -0.04], mat: gold }));

  g.add(sign(printed('slot-header', ['BADA BING'], {
    w: 512, h: 256, bg: '#2a0f3a', fg: '#ff5aa0', font: '900 88px "Trebuchet MS", sans-serif',
  }), 0.86, 0.4, { x: 0, y: 1.9, z: 0.32, emissive: 0xff3d8b, intensity: 2.2 }));

  /* Real machines backlight the reels, and in a room this dark that is the
   * difference between three symbols and a black slot. */
  const strip = reelTexture();
  const reelMat = new THREE.MeshStandardMaterial({
    map: strip, emissiveMap: strip, emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.32, roughness: 0.85,
  });
  const reelGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.24, 28, 1, true);
  reelGeo.rotateZ(Math.PI / 2);
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(reelGeo, reelMat);
    r.position.set(-0.26 + i * 0.26, 1.3, 0.02);
    g.add(r);
    reels.push(r);
  }
  // Smoked glass across the opening, and a gold surround for it
  g.add(box({ size: [0.72, 0.5, 0.02], pos: [0, 1.3, 0.25], mat: mat({ color: 0x8aa0c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12 }) }));
  for (const [w, h, yy] of [[0.78, 0.03, 1.56], [0.78, 0.03, 1.04]]) {
    g.add(box({ size: [w, h, 0.05], pos: [0, yy, 0.26], mat: gold }));
  }
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.03, 0.55, 0.05], pos: [sx * 0.385, 1.3, 0.26], mat: gold }));
  }

  // Credit display, redrawn as the numbers change
  const creditCanvas = document.createElement('canvas');
  creditCanvas.width = 256;
  creditCanvas.height = 64;
  const creditTex = new THREE.CanvasTexture(creditCanvas);
  creditTex.colorSpace = THREE.SRGBColorSpace;
  const creditPanel = box({
    size: [0.44, 0.11, 0.02], pos: [-0.22, 1.0, 0.34],
    mat: new THREE.MeshStandardMaterial({
      map: creditTex, emissiveMap: creditTex, emissive: new THREE.Color(0x2affc8),
      emissiveIntensity: 1.6, roughness: 1,
    }),
  });
  g.add(creditPanel);

  const buttons = [];
  for (let i = 0; i < 3; i++) {
    const b = cylinder({
      r: 0.055, h: 0.04, pos: [-0.24 + i * 0.24, 0.93, 0.32], rotX: Math.PI / 2,
      mat: lit([0xff4a4a, 0xffd75e, 0x4affa0][i], 1.4),
    });
    g.add(b);
    buttons.push(b);
  }
  g.add(box({ size: [0.52, 0.09, 0.16], pos: [0, 0.42, 0.34], mat: mat({ color: 0x14141a, roughness: 0.9 }) }));
  for (let i = 0; i < 6; i++) {
    g.add(box({ size: [0.02, 0.16, 0.01], pos: [0.24 + i * 0.03, 1.68, 0.33], mat: mat({ color: 0x14141a, roughness: 0.9 }) }));
  }

  // The handle, which does nothing the button does not, and is the point
  const arm = group('arm');
  arm.position.set(0.56, 1.25, 0);
  arm.add(cylinder({ r: 0.025, h: 0.44, pos: [0, 0.22, 0], mat: chrome }));
  arm.add(sphere({ r: 0.07, pos: [0, 0.46, 0], mat: mat({ color: 0xd92e2e, roughness: 0.35 }) }));
  g.add(arm);

  // The side panel somebody has had off and screwed back on badly
  const panel = box({ size: [0.03, 0.5, 0.42], pos: [-0.47, 0.55, 0.02], mat: mat({ color: 0x33205e, roughness: 0.6 }) });
  g.add(panel);

  const topper = box({ size: [0.4, 0.14, 0.4], pos: [0, 2.28, -0.04], mat: lit(0xffd75e, 0.4) });
  g.add(topper);

  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  return {
    group: g, reels, arm, buttons, panel, topper,
    creditCanvas, creditTex, creditPanel,
  };
}

const SPIN_TIME = [1.5, 2.0, 2.6];   // each reel stops a beat after the last

export class SlotMachine {
  /**
   * @param {object} parts from makeSlotMachine
   * @param {object} hooks { getMoney, spend, win, onSpin, onStop, onJackpot, onNote }
   */
  constructor(parts, hooks = {}) {
    this.parts = parts;
    this.hooks = hooks;
    this.wager = WAGERS[1];
    this.spinning = false;
    this.active = false;
    this.spins = 0;
    this.won = 0;
    this.lost = 0;
    /** Set once the player has noticed the machine has been opened up. */
    this.secretFound = false;
    this._t = 0;
    this._stops = [0, 0, 0];
    this._from = [0, 0, 0];
    this._result = null;
    this._armT = 0;
    this._flash = 0;
    this.paintCredit();
  }

  /** Index into STRIP for whatever is showing on a reel. */
  static symbolAt(i) { return STRIP[((i % STRIP.length) + STRIP.length) % STRIP.length]; }

  paintCredit(text = null) {
    const c = this.parts.creditCanvas;
    const g = c.getContext('2d');
    g.fillStyle = '#04140f';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#2affc8';
    g.font = '900 40px "Courier New", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text ?? `BET $${this.wager}`, c.width / 2, c.height / 2 + 2);
    this.parts.creditTex.needsUpdate = true;
  }

  changeWager(dir) {
    if (this.spinning) return;
    const i = WAGERS.indexOf(this.wager);
    const next = Math.max(0, Math.min(WAGERS.length - 1, i + dir));
    this.wager = WAGERS[next];
    this.paintCredit();
    this.hooks.onNote?.(`Bet $${this.wager}`);
  }

  spin() {
    if (this.spinning) return false;
    if ((this.hooks.getMoney?.() ?? 0) < this.wager) {
      this.paintCredit('NO FUNDS');
      this.hooks.onNote?.('Not enough on you for that.');
      return false;
    }
    this.hooks.spend?.(this.wager);
    this.lost += this.wager;
    this.spins++;
    this.spinning = true;
    this._t = 0;
    this._armT = 1;
    this.paintCredit('SPINNING');

    // Pick the stops first, then animate to them. The reel is the readout of
    // a decision already made, which is exactly what the real thing is.
    for (let i = 0; i < 3; i++) {
      this._from[i] = this.parts.reels[i].rotation.x;
      this._stops[i] = Math.floor(Math.random() * STRIP.length);
    }
    this._result = this._stops.map((s) => STRIP[s]);
    this.hooks.onSpin?.(this.wager);
    return true;
  }

  /** What three of a kind is worth, or 0. */
  _payout() {
    const [a, b, c] = this._result;
    if (a !== b || b !== c) return { amount: 0, kind: null };
    if (a === 'squatch') return { amount: this.wager * 250, kind: 'squatch' };
    return { amount: this.wager * PAYOUTS[a], kind: a };
  }

  update(dt) {
    // The handle springs back after it is pulled
    if (this._armT > 0) {
      this._armT = Math.max(0, this._armT - dt * 1.8);
      this.parts.arm.rotation.x = -this._armT * 0.9;
    }
    if (this._flash > 0) {
      this._flash -= dt;
      const on = Math.sin(this._flash * 28) > 0;
      this.parts.topper.material.emissiveIntensity = on ? 4 : 0.3;
      for (const b of this.parts.buttons) b.material.emissiveIntensity = on ? 3 : 0.6;
      if (this._flash <= 0) {
        this.parts.topper.material.emissiveIntensity = 0.4;
        for (const b of this.parts.buttons) b.material.emissiveIntensity = 1.4;
      }
    }
    if (!this.spinning) return;

    this._t += dt;
    let allStopped = true;
    for (let i = 0; i < 3; i++) {
      const dur = SPIN_TIME[i];
      const reel = this.parts.reels[i];
      if (this._t < dur) {
        allStopped = false;
        // Fast at first, easing into the stop over the last third
        const k = this._t / dur;
        const speed = 26 * (1 - k * k * k);
        reel.rotation.x += speed * dt;
      } else if (!reel.userData.landed) {
        reel.userData.landed = true;
        // Land exactly on the chosen stop: one symbol is 1/STRIP of a turn
        const per = (Math.PI * 2) / STRIP.length;
        const target = this._stops[i] * per;
        const turns = Math.ceil(reel.rotation.x / (Math.PI * 2)) * Math.PI * 2;
        reel.rotation.x = turns + target;
        this.hooks.onStop?.(i);
      }
    }
    if (!allStopped) return;

    this.spinning = false;
    for (const r of this.parts.reels) r.userData.landed = false;
    const { amount, kind } = this._payout();
    if (amount > 0) {
      this.won += amount;
      this.hooks.win?.(amount);
      this._flash = kind === 'squatch' ? 4.5 : 1.6;
      this.paintCredit(kind === 'squatch' ? 'JACKPOT' : `WIN $${amount}`);
      if (kind === 'squatch') this.hooks.onJackpot?.(amount);
      else this.hooks.onWin?.(amount, kind);
      setTimeout(() => { if (!this.spinning) this.paintCredit(); }, 2600);
    } else {
      this.paintCredit('NOTHING');
      this.hooks.onLose?.(this.wager);
      setTimeout(() => { if (!this.spinning) this.paintCredit(); }, 1800);
    }
  }

  /** The panel on the side has been off. Somebody has been at the board. */
  inspectPanel() {
    if (this.secretFound) return false;
    this.secretFound = true;
    this.parts.panel.rotation.z = 0.12;
    this.parts.panel.position.x -= 0.03;
    return true;
  }

  get view() {
    return {
      wager: this.wager,
      spinning: this.spinning,
      reels: this._result,
      spins: this.spins,
      net: this.won - this.lost,
    };
  }
}

export { STRIP, rand };

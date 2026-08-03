/**
 * FlightInstrumentSystem — the six round dials on the Brushrunner's panel.
 *
 * All of it is one canvas, repainted a few times a second and used as the
 * panel's texture. Needles are damped toward their reading and carry a little
 * noise, because none of these instruments has been calibrated since the
 * aeroplane had a different owner and a different registration.
 */
import { KT, FT, AC } from './config.js';
import { clamp, damp } from './util.js';

const REDRAW_HZ = 14;

const DIALS = [
  { id: 'asi',  x: 150, y: 150, r: 104, label: 'AIRSPEED', unit: 'KNOTS' },
  { id: 'ai',   x: 380, y: 150, r: 104, label: 'ATTITUDE', unit: '' },
  { id: 'alt',  x: 610, y: 150, r: 104, label: 'ALTITUDE', unit: 'FT' },
  { id: 'vsi',  x: 840, y: 150, r: 90,  label: 'CLIMB', unit: 'FT/MIN' },
  { id: 'tach', x: 200, y: 372, r: 92,  label: 'RPM', unit: 'L / R' },
  { id: 'temp', x: 430, y: 372, r: 92,  label: 'CYL TEMP', unit: '°C' },
  { id: 'fuel', x: 660, y: 372, r: 78,  label: 'FUEL', unit: 'OPTIMIST' },
  { id: 'oil',  x: 862, y: 372, r: 66,  label: 'OIL PRESS', unit: '' },
];

export class Instruments {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {object} [opts.ac] aircraft tuning profile (dial scaling, fuel
   *   capacity), defaults to Beef Run's AC.
   */
  constructor(canvas, { ac = AC } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ac = ac;
    this.dirty = true;
    this.t = 0;
    this.acc = 0;
    this.n = {
      asi: 0, alt: 0, vsi: 0, pitch: 0, roll: 0,
      rpmL: 0, rpmR: 0, tempL: 40, tempR: 40, fuel: 1, oil: 0,
    };
    this.failed = new Set();     // instruments the pro difficulty has killed
    this.paint();
  }

  /** Unstable Professional gets to lose a dial mid-flight. */
  failInstrument(id) { this.failed.add(id); this.dirty = true; }

  update(dt, phys, engines, state = {}) {
    this.t += dt;
    const n = this.n;
    const wob = () => (Math.sin(this.t * 11.3) + Math.sin(this.t * 4.7)) * 0.5;

    n.asi = damp(n.asi, phys.ias * KT + wob() * 1.4, 6, dt);
    n.alt = damp(n.alt, phys.position.y * FT, 4, dt);
    n.vsi = damp(n.vsi, phys.vspeed * FT * 60, 2.2, dt);
    n.pitch = damp(n.pitch, phys.pitchDeg, 12, dt);
    n.roll = damp(n.roll, phys.rollDeg, 12, dt);
    n.rpmL = damp(n.rpmL, engines.engines[0].rpm + wob() * 12, 7, dt);
    n.rpmR = damp(n.rpmR, engines.engines[1].rpm + wob() * 12, 7, dt);
    n.tempL = damp(n.tempL, engines.engines[0].temp, 3, dt);
    n.tempR = damp(n.tempR, engines.engines[1].temp, 3, dt);
    n.fuel = damp(n.fuel, clamp(engines.fuel / this.ac.fuelMass, 0, 1), 1.2, dt);
    // Oil pressure reads low and always has. There is a note about it.
    n.oil = damp(n.oil, engines.anyRunning ? 14 + (n.rpmL / 2450) * 42 : 3, 2, dt);
    this.battery = state.battery !== false;

    this.acc += dt;
    if (this.acc >= 1 / REDRAW_HZ) {
      this.acc = 0;
      this.paint();
      this.dirty = true;
    }
  }

  paint() {
    const ctx = this.ctx;
    const { width: W, height: H } = this.canvas;
    ctx.fillStyle = '#211f1c';
    ctx.fillRect(0, 0, W, H);
    // Panel grain.
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = i % 2 ? '#000' : '#fff';
      ctx.fillRect(Math.random() * W, Math.random() * H, Math.random() * 60, 1);
    }
    ctx.globalAlpha = 1;

    for (const d of DIALS) this.dial(d);

    // Placard under the oil gauge, matching the one screwed to the panel.
    ctx.fillStyle = '#d8d2c0';
    ctx.fillRect(796, 452, 132, 26);
    ctx.fillStyle = '#1c1a17';
    ctx.font = '700 15px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('IGNORE BELOW 20', 862, 470);
  }

  dial(d) {
    const ctx = this.ctx;
    const dead = this.failed.has(d.id) || !this.battery;

    // Bezel and face.
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r + 8, 0, Math.PI * 2);
    ctx.fillStyle = '#3a3833';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = dead ? '#0d0d0c' : '#141412';
    ctx.fill();
    ctx.strokeStyle = '#5c574d';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (!dead) {
      switch (d.id) {
        case 'asi': this.asi(d); break;
        case 'ai': this.attitude(d); break;
        case 'alt': this.altimeter(d); break;
        case 'vsi': this.vsi(d); break;
        case 'tach': this.tach(d); break;
        case 'temp': this.temp(d); break;
        case 'fuel': this.fuel(d); break;
        case 'oil': this.oil(d); break;
      }
    } else {
      ctx.fillStyle = '#4a463d';
      ctx.font = '700 16px Trebuchet MS, sans-serif';
      ctx.fillText('— — —', 0, 0);
    }

    ctx.fillStyle = '#9a9384';
    ctx.font = '700 13px Trebuchet MS, sans-serif';
    ctx.fillText(d.label, 0, d.r - 22);
    if (d.unit) {
      ctx.font = '600 10px Trebuchet MS, sans-serif';
      ctx.fillStyle = '#6f6a5e';
      ctx.fillText(d.unit, 0, d.r - 8);
    }
    ctx.restore();
  }

  /** Ticks and numbers around a dial sweeping from `a0` to `a1` radians. */
  ring(r, from, to, step, a0, a1, fmt, opts = {}) {
    const ctx = this.ctx;
    const { major = step, textR = r - 30, color = '#e8e2d0' } = opts;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    for (let v = from; v <= to + 1e-6; v += step) {
      const k = (v - from) / (to - from);
      const a = a0 + (a1 - a0) * k;
      const isMajor = Math.abs(v % major) < 1e-6;
      ctx.lineWidth = isMajor ? 3 : 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6));
      ctx.lineTo(Math.cos(a) * (r - (isMajor ? 20 : 13)), Math.sin(a) * (r - (isMajor ? 20 : 13)));
      ctx.stroke();
      if (isMajor && fmt) {
        ctx.font = '700 15px Trebuchet MS, sans-serif';
        ctx.fillText(fmt(v), Math.cos(a) * textR, Math.sin(a) * textR);
      }
    }
  }

  needle(angle, length, opts = {}) {
    const ctx = this.ctx;
    const { color = '#f4f0e4', width = 5, tail = 16 } = opts;
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-tail, 0);
    ctx.lineTo(length, 0);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#c8c2b2';
    ctx.fill();
  }

  arc(r, a0, a1, color, width = 7) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /* ---- individual dials ---- */

  asi(d) {
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    const map = (v) => A0 + (A1 - A0) * clamp(v / 200, 0, 1);
    // Green arc: the range this thing is happy in. White: flaps out.
    this.arc(d.r - 16, map(58), map(160), '#2f8f4a', 7);
    this.arc(d.r - 27, map(48), map(95), '#dcdcd0', 5);
    this.arc(d.r - 16, map(160), map(180), '#d9b02a', 7);
    this.arc(d.r - 16, map(180), map(200), '#d92e2e', 7);
    this.ring(d.r, 0, 200, 10, A0, A1, (v) => (v % 40 === 0 ? String(v) : ''), { major: 20 });
    this.needle(map(this.n.asi), d.r - 26);
  }

  attitude(d) {
    const ctx = this.ctx;
    const roll = (-this.n.roll * Math.PI) / 180;
    const pitchPx = clamp(this.n.pitch, -30, 30) * 2.6;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, d.r - 8, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(roll);
    ctx.fillStyle = '#3f74b8';
    ctx.fillRect(-d.r, -d.r * 2 + pitchPx, d.r * 2, d.r * 2);
    ctx.fillStyle = '#7a4a24';
    ctx.fillRect(-d.r, pitchPx, d.r * 2, d.r * 2);
    ctx.strokeStyle = '#f4f0e4';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-d.r, pitchPx);
    ctx.lineTo(d.r, pitchPx);
    ctx.stroke();
    for (const p of [-20, -10, 10, 20]) {
      const y = pitchPx - p * 2.6;
      const w = Math.abs(p) === 10 ? 26 : 16;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
    // Fixed aeroplane symbol.
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-34, 0); ctx.lineTo(-12, 0);
    ctx.moveTo(12, 0); ctx.lineTo(34, 0);
    ctx.moveTo(0, -3); ctx.lineTo(0, 5);
    ctx.stroke();
  }

  altimeter(d) {
    const A0 = -Math.PI / 2;
    const hundreds = ((this.n.alt % 1000) / 1000) * Math.PI * 2;
    const thousands = ((this.n.alt % 10000) / 10000) * Math.PI * 2;
    this.ring(d.r, 0, 9, 1, A0, A0 + Math.PI * 2 * (9 / 10), (v) => String(v), { major: 1, textR: d.r - 34 });
    this.needle(A0 + thousands, d.r - 52, { width: 7, color: '#e8e2d0' });
    this.needle(A0 + hundreds, d.r - 24, { width: 4, color: '#f4f0e4' });
    const ctx = this.ctx;
    ctx.fillStyle = '#9a9384';
    ctx.font = '700 13px Trebuchet MS, sans-serif';
    ctx.fillText(`${Math.round(this.n.alt)}`, 0, 44);
  }

  vsi(d) {
    const A0 = Math.PI * 0.5, A1 = Math.PI * 2.5;
    const v = clamp(this.n.vsi, -2000, 2000);
    const a = A0 + ((v + 2000) / 4000) * (A1 - A0) * 0.82 + 0.55;
    this.ring(d.r, -2000, 2000, 250, A0 + 0.55, A0 + (A1 - A0) * 0.82 + 0.55,
      (x) => (Math.abs(x) % 1000 === 0 ? String(Math.abs(x) / 1000) : ''), { major: 500, textR: d.r - 30 });
    this.needle(a, d.r - 24, { width: 4 });
  }

  tach(d) {
    const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;
    const map = (rpm) => A0 + (A1 - A0) * clamp(rpm / 3000, 0, 1);
    this.arc(d.r - 14, map(1900), map(2500), '#2f8f4a', 6);
    this.arc(d.r - 14, map(2500), map(3000), '#d92e2e', 6);
    this.ring(d.r, 0, 3000, 250, A0, A1, (v) => (v % 1000 === 0 ? String(v / 100) : ''), { major: 500, textR: d.r - 30 });
    this.needle(map(this.n.rpmL), d.r - 24, { width: 4, color: '#f4f0e4' });
    this.needle(map(this.n.rpmR), d.r - 24, { width: 3, color: '#d9b02a' });
  }

  temp(d) {
    const A0 = Math.PI * 0.8, A1 = Math.PI * 2.2;
    const map = (t) => A0 + (A1 - A0) * clamp((t - 20) / 300, 0, 1);
    this.arc(d.r - 14, map(120), map(230), '#2f8f4a', 6);
    this.arc(d.r - 14, map(230), map(260), '#d9b02a', 6);
    this.arc(d.r - 14, map(260), map(320), '#d92e2e', 6);
    this.ring(d.r, 20, 320, 30, A0, A1, (v) => (v % 100 < 1 ? String(v) : ''), { major: 60, textR: d.r - 28 });
    this.needle(map(this.n.tempL), d.r - 24, { width: 4, color: '#f4f0e4' });
    this.needle(map(this.n.tempR), d.r - 24, { width: 3, color: '#d9b02a' });
  }

  fuel(d) {
    const A0 = Math.PI * 0.85, A1 = Math.PI * 2.15;
    const a = A0 + (A1 - A0) * this.n.fuel;
    this.arc(d.r - 12, A0, A0 + (A1 - A0) * 0.18, '#d92e2e', 6);
    const ctx = this.ctx;
    ctx.fillStyle = '#e8e2d0';
    ctx.font = '700 14px Trebuchet MS, sans-serif';
    ctx.fillText('E', Math.cos(A0) * (d.r - 30), Math.sin(A0) * (d.r - 30));
    ctx.fillText('F', Math.cos(A1) * (d.r - 30), Math.sin(A1) * (d.r - 30));
    this.needle(a, d.r - 22, { width: 4 });
  }

  oil(d) {
    const A0 = Math.PI * 0.85, A1 = Math.PI * 2.15;
    const a = A0 + (A1 - A0) * clamp(this.n.oil / 80, 0, 1);
    this.arc(d.r - 12, A0, A0 + (A1 - A0) * 0.25, '#d92e2e', 5);
    this.ring(d.r, 0, 80, 20, A0, A1, (v) => String(v), { major: 20, textR: d.r - 26 });
    this.needle(a, d.r - 20, { width: 3.5 });
  }
}

import * as core from './core.js';

// A handgun going off inside a small room with hard walls. Loud, short, and
// followed by slap-back off the tile and the front windows.

export function gunshot() {
  if (!core.isReady()) return;
  // The recorded revolver — indoors, loud, with its own ringing tail. The
  // synth below remains the fallback until the sample decodes.
  if (core.playSample('gun.shot', { volume: 1 })) return;
  const t = core.now();

  // Crack
  core.noise(t, { peak: 0.95, attack: 0.0008, decay: 0.05, type: 'highpass', freq: 2400, rate: 1.4 });
  // Body
  core.noise(t, { peak: 0.85, attack: 0.001, decay: 0.16, type: 'bandpass', freq: 620, q: 0.6, rate: 1.1 });
  // Thump
  core.tone(t, { type: 'sine', from: 220, to: 46, dur: 0.22, peak: 0.8 });
  core.tone(t + 0.002, { type: 'square', from: 130, to: 60, dur: 0.1, peak: 0.3 });

  // Room slap-back
  core.noise(t + 0.055, { peak: 0.22, attack: 0.004, decay: 0.2, type: 'lowpass', freq: 1600 });
  core.noise(t + 0.13, { peak: 0.12, attack: 0.01, decay: 0.35, type: 'lowpass', freq: 900 });
  core.noise(t + 0.26, { peak: 0.05, attack: 0.02, decay: 0.5, type: 'lowpass', freq: 520 });
}

// Checking the revolver in the bathroom — cylinder out, spin, closed.
export function weaponCheck() {
  if (!core.isReady()) return;
  if (core.playSample('gun.reload', { volume: 0.8 })) return;
  const t = core.now();
  core.noise(t, { peak: 0.2, attack: 0.002, decay: 0.05, type: 'bandpass', freq: 2600, q: 2 });
  core.tone(t + 0.01, { type: 'square', from: 900, to: 420, dur: 0.05, peak: 0.14 });
  core.noise(t + 0.11, { peak: 0.24, attack: 0.001, decay: 0.06, type: 'bandpass', freq: 1800, q: 1.6 });
  core.tone(t + 0.12, { type: 'square', from: 620, to: 280, dur: 0.06, peak: 0.18 });
}

// Steel on hardwood, once, and then it stays there.
export function weaponDrop() {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'triangle', from: 260, to: 90, dur: 0.14, peak: 0.4 });
  core.noise(t, { peak: 0.28, attack: 0.001, decay: 0.09, type: 'bandpass', freq: 1500, q: 1.1 });
  core.tone(t + 0.09, { type: 'triangle', from: 190, to: 70, dur: 0.1, peak: 0.16 });
  core.noise(t + 0.1, { peak: 0.1, attack: 0.002, decay: 0.14, type: 'lowpass', freq: 900 });
}

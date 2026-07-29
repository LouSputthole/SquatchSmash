import * as core from './core.js';

// Small sounds the scene leans on: footsteps on three surfaces, chairs, doors,
// cloth, a wine glass going over, and a heartbeat for the bathroom.

export function footstep(surface = 'wood', loud = 1) {
  if (!core.isReady()) return;
  const t = core.now();
  if (surface === 'street') {
    core.noise(t, { peak: 0.1 * loud, attack: 0.002, decay: 0.09, type: 'bandpass', freq: 700, q: 1.1 });
    core.noise(t + 0.01, { peak: 0.05 * loud, attack: 0.003, decay: 0.12, type: 'highpass', freq: 2600 }); // wet
  } else if (surface === 'tile') {
    core.noise(t, { peak: 0.11 * loud, attack: 0.001, decay: 0.07, type: 'bandpass', freq: 1900, q: 1.6 });
    core.tone(t, { type: 'triangle', from: 360, to: 150, dur: 0.07, peak: 0.07 * loud });
  } else {
    core.noise(t, { peak: 0.09 * loud, attack: 0.002, decay: 0.1, type: 'lowpass', freq: 620 });
    core.tone(t, { type: 'sine', from: 150, to: 70, dur: 0.09, peak: 0.09 * loud });
  }
}

export function chairScrape() {
  if (!core.isReady()) return;
  const t = core.now();
  core.noise(t, { peak: 0.24, attack: 0.03, decay: 0.4, type: 'bandpass', freq: 480, q: 0.8, rate: 0.5 });
  core.tone(t, { type: 'sawtooth', from: 180, to: 120, dur: 0.36, peak: 0.09 });
}

export function chairKnock() {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'triangle', from: 190, to: 60, dur: 0.18, peak: 0.35 });
  core.noise(t, { peak: 0.2, attack: 0.002, decay: 0.14, type: 'lowpass', freq: 800 });
}

export function doorOpen() {
  if (!core.isReady()) return;
  const t = core.now();
  core.noise(t, { peak: 0.13, attack: 0.05, decay: 0.35, type: 'bandpass', freq: 320, q: 0.7, rate: 0.4 });
  core.tone(t + 0.3, { type: 'sine', from: 120, to: 60, dur: 0.12, peak: 0.14 });
}

export function doorClose() {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'sine', from: 140, to: 48, dur: 0.2, peak: 0.42 });
  core.noise(t, { peak: 0.22, attack: 0.002, decay: 0.13, type: 'lowpass', freq: 500 });
  core.noise(t + 0.02, { peak: 0.08, attack: 0.002, decay: 0.07, type: 'bandpass', freq: 2200, q: 2 });
}

export function cloth() {
  if (!core.isReady()) return;
  core.noise(core.now(), { peak: 0.08, attack: 0.02, decay: 0.22, type: 'highpass', freq: 2600, rate: 0.5 });
}

export function pour() {
  if (!core.isReady()) return;
  const t = core.now();
  for (let i = 0; i < 14; i++) {
    core.tone(t + i * 0.06, { type: 'sine', from: 600 + Math.random() * 500, to: 300, dur: 0.05, peak: 0.045 });
  }
  core.noise(t, { peak: 0.05, attack: 0.1, decay: 0.7, type: 'bandpass', freq: 2200, q: 0.9 });
}

export function glassFall() {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'sine', from: 2600, to: 1800, dur: 0.12, peak: 0.16 });
  core.noise(t + 0.12, { peak: 0.3, attack: 0.001, decay: 0.16, type: 'highpass', freq: 3400 });
  for (let i = 0; i < 5; i++) {
    core.tone(t + 0.13 + i * 0.035, { type: 'triangle', from: 3200 + Math.random() * 2400, to: 1600, dur: 0.06, peak: 0.09 });
  }
}

export function searchRustle() {
  if (!core.isReady()) return;
  core.noise(core.now(), { peak: 0.1, attack: 0.03, decay: 0.28, type: 'bandpass', freq: 1400, q: 0.8, rate: 0.6 });
}

export function pipeKnock() {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'sine', from: 720, to: 300, dur: 0.16, peak: 0.2 });
  core.tone(t + 0.005, { type: 'square', from: 1400, to: 900, dur: 0.05, peak: 0.06 });
}

export function heartbeat(strength = 1) {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'sine', from: 74, to: 38, dur: 0.16, peak: 0.32 * strength });
  core.tone(t + 0.19, { type: 'sine', from: 62, to: 34, dur: 0.2, peak: 0.22 * strength });
}

export function breath(strength = 1) {
  if (!core.isReady()) return;
  core.noise(core.now(), { peak: 0.09 * strength, attack: 0.12, decay: 0.4, type: 'bandpass', freq: 620, q: 0.7, rate: 0.4 });
}

export function carDoor() {
  if (!core.isReady()) return;
  const t = core.now();
  core.tone(t, { type: 'sine', from: 180, to: 55, dur: 0.24, peak: 0.45 });
  core.noise(t, { peak: 0.24, attack: 0.002, decay: 0.16, type: 'lowpass', freq: 600 });
}

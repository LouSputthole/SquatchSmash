import * as audio from '../audio/core.js';

// After the shots, the room goes away for a while: a sine tone sits on top of
// everything, the rest of the mix drops behind a low-pass, and the screen
// picks up a pale bloom.

export class EarRingingEffect {
  constructor(ui) {
    this.ui = ui;
    this.active = false;
    this.t = 0;
    this.dur = 0;
  }

  start(dur = 9) {
    this.active = true;
    this.t = 0;
    this.dur = dur;
    this.ui.ringFlash.classList.add('on');
    audio.startRinging();
    audio.duck(0.28, 620);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.ui.ringFlash.classList.remove('on');
    audio.stopRinging();
    audio.duck(1, 20000);
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    // Hearing comes back gradually rather than snapping off
    audio.duck(0.28 + 0.72 * k * k, 620 + 19000 * k * k);
    audio.setRinging(1 - k);
    if (this.t >= this.dur) this.stop();
  }
}

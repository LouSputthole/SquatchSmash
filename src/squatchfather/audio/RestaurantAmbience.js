import * as core from './core.js';

// The bed the whole scene sits on: wet street outside, low room tone and
// murmured conversation inside, a kitchen behind its door, hard bathroom
// tone once he is in there — and everything going muffled and far away once
// the bathroom door shuts.
//
// Every bed prefers its recording (restaurant.room.tone, restaurant.murmur,
// street.wet.night, restaurant.kitchen, bathroom.tone) looped seamlessly;
// the synth loops stand in until a file decodes and the swap keeps the same
// gain envelope, so the crossfades and the door muffle behave identically
// on either source.

// Recorded bed levels. The envelopes below multiply these the same way the
// synth gains are multiplied, so the mix moves as one.
const LVL = {
  room: 0.3,
  murmur: 0.24,
  street: 0.5,
  kitchen: 0.14,
  bathroom: 0.24,
};

export class RestaurantAmbience {
  constructor() {
    this.started = false;
    this.outside = 1;   // 0..1 crossfade
    this.muffle = 0;    // 0..1
    this.clinkT = 2;
    this.dripT = 1.5;
    this.hornT = 18;
    this.passT = 3;
  }

  // A bed that prefers its recording, with a synth stand-in until it decodes.
  #bed(sampleName, synthFactory = null) {
    const bed = { name: sampleName, handle: null, isSample: false };
    if (sampleName) {
      bed.handle = core.sampleLoop(sampleName, { gain: 0 });
      bed.isSample = !!bed.handle;
    }
    if (!bed.handle && synthFactory) bed.handle = synthFactory();
    return bed;
  }

  // Swap a synth stand-in for its recording once the file has decoded,
  // carrying the current gain over so nothing jumps.
  #upgrade(bed) {
    if (!bed || !bed.name || bed.isSample) return;
    const gain = bed.handle ? bed.handle.gain.gain.value : 0;
    const up = core.sampleLoop(bed.name, { gain });
    if (!up) return;
    if (bed.handle) {
      try { bed.handle.src.stop(); } catch { /* never started */ }
    }
    bed.handle = up;
    bed.isSample = true;
  }

  start() {
    if (this.started || !core.isReady()) return;
    this.started = true;

    this.beds = {
      // Room tone
      room: this.#bed('restaurant.room.tone',
        () => core.noiseLoop({ type: 'lowpass', freq: 340, gain: 0.05, rate: 0.35 })),
      // Murmured diners. One recording covers what the synth needed two
      // wobbling bands for; murmurB is synth-only and stops on upgrade.
      murmurA: this.#bed('restaurant.murmur',
        () => core.noiseLoop({ type: 'bandpass', freq: 420, q: 1.6, gain: 0.035, rate: 0.28 })),
      murmurB: this.#bed(null,
        () => core.noiseLoop({ type: 'bandpass', freq: 780, q: 2.2, gain: 0.022, rate: 0.22 })),
      // Street: traffic hiss on wet asphalt
      street: this.#bed('street.wet.night',
        () => core.noiseLoop({ type: 'lowpass', freq: 1500, gain: 0.09, rate: 0.55 })),
      // Recording-only beds — the synth never had these, so they fade in
      // whenever the files land.
      kitchen: this.#bed('restaurant.kitchen'),
      bathroom: this.#bed('bathroom.tone'),
    };
    if (this.beds.murmurA.isSample) this.#dropMurmurB();
    this.t = 0;
  }

  #dropMurmurB() {
    const b = this.beds.murmurB;
    if (!b.handle) return;
    try { b.handle.src.stop(); } catch { /* never started */ }
    b.handle = null;
  }

  // How far inside he is. 1 = on the street, 0 = at the table.
  setOutside(v) {
    this.outside = Math.max(0, Math.min(1, v));
  }

  // 1 once the bathroom door closes behind him.
  setMuffle(v) {
    this.muffle = Math.max(0, Math.min(1, v));
  }

  // A car going by on wet pavement — swells past and away.
  #carPass() {
    if (core.playSample('street.car.pass.wet', {
      volume: 0.45 * this.outside, rate: 0.94 + Math.random() * 0.12,
    })) return;
    const t = core.now();
    core.noise(t, { peak: 0.16 * this.outside, attack: 0.5, decay: 1.1, type: 'lowpass', freq: 1800, rate: 0.9 });
  }

  update(dt) {
    if (!this.started) return;
    this.t += dt;
    const inside = 1 - this.outside;
    const muf = 1 - this.muffle * 0.88;
    const now = core.now();

    const { room, murmurA, murmurB, street, kitchen, bathroom } = this.beds;
    for (const bed of [room, murmurA, street, kitchen, bathroom]) this.#upgrade(bed);
    if (murmurA.isSample) this.#dropMurmurB();

    // Recorded beds go dull behind the shut door with a lowpass sweep; the
    // synth beds keep their authored filter moves.
    const doorLp = 16000 * (1 - this.muffle) + 700 * this.muffle;

    if (room.isSample) {
      room.handle.gain.gain.setTargetAtTime(LVL.room * (inside * muf + 0.24), now, 0.25);
      room.handle.filt.frequency.setTargetAtTime(doorLp, now, 0.3);
    } else if (room.handle) {
      room.handle.gain.gain.setTargetAtTime(0.05 * inside * muf + 0.012, now, 0.25);
    }

    if (murmurA.isSample) {
      murmurA.handle.gain.gain.setTargetAtTime(LVL.murmur * inside * muf, now, 0.25);
      murmurA.handle.filt.frequency.setTargetAtTime(doorLp, now, 0.3);
    } else if (murmurA.handle) {
      murmurA.handle.gain.gain.setTargetAtTime(0.038 * inside * muf, now, 0.25);
      murmurA.handle.filt.frequency.setTargetAtTime(
        (380 + Math.sin(this.t * 0.7) * 90) * (1 - this.muffle * 0.6), now, 0.3
      );
      if (murmurB.handle) murmurB.handle.gain.gain.setTargetAtTime(0.024 * inside * muf, now, 0.25);
    }

    if (street.isSample) {
      street.handle.gain.gain.setTargetAtTime(LVL.street * (this.outside + 0.13 * inside) * muf, now, 0.3);
      // Wide open on the pavement; through the facade, then the door, it dulls.
      street.handle.filt.frequency.setTargetAtTime(
        (this.outside > 0.5 ? 15000 : 1400) * (1 - this.muffle * 0.8), now, 0.3
      );
    } else if (street.handle) {
      street.handle.gain.gain.setTargetAtTime((0.09 * this.outside + 0.012 * inside) * muf, now, 0.3);
      street.handle.filt.frequency.setTargetAtTime(
        (this.outside > 0.5 ? 1700 : 700) * (1 - this.muffle * 0.65), now, 0.3
      );
    }

    // Pans and extractor through the kitchen wall — inside only, no highs.
    if (kitchen.handle) {
      kitchen.handle.gain.gain.setTargetAtTime(LVL.kitchen * inside * muf, now, 0.3);
      kitchen.handle.filt.frequency.setTargetAtTime(900 * (1 - this.muffle * 0.5), now, 0.3);
    }

    // Hard tiled tone, present only once the bathroom door is between him
    // and the restaurant.
    if (bathroom.handle) {
      bathroom.handle.gain.gain.setTargetAtTime(LVL.bathroom * this.muffle, now, 0.3);
    }

    // Cutlery, glasses, a kitchen door
    this.clinkT -= dt;
    if (this.clinkT <= 0) {
      this.clinkT = 2.5 + Math.random() * 5;
      if (inside > 0.4) {
        const t = core.now();
        const peak = (0.05 + Math.random() * 0.05) * inside * muf;
        if (!core.playSample('dish.clink', { volume: peak * 6, rate: 0.92 + Math.random() * 0.2 })) {
          core.tone(t, { type: 'triangle', from: 2100 + Math.random() * 1600, to: 1400, dur: 0.09, peak });
          core.noise(t, { peak: peak * 0.5, attack: 0.002, decay: 0.06, type: 'highpass', freq: 3000 });
        }
      }
    }

    // Water dripping somewhere out of sight
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 1.4 + Math.random() * 2.6;
      if (this.muffle > 0.5) {
        if (!core.playSample('bathroom.drip', { volume: 0.35, rate: 0.9 + Math.random() * 0.25 })) {
          core.tone(core.now(), { type: 'sine', from: 900 + Math.random() * 500, to: 240, dur: 0.11, peak: 0.06 });
        }
      }
    }

    // Traffic on the wet street: a car swelling past, and the odd horn
    if (this.outside > 0.2) {
      this.passT -= dt;
      if (this.passT <= 0) {
        this.passT = 3 + Math.random() * 5;
        this.#carPass();
      }
      // The horn belongs to the street bed only: it never fires once he is
      // through the door — a car horn indoors is a wrong sound, not colour.
      this.hornT -= dt;
      if (this.hornT <= 0 && this.outside > 0.6) {
        this.hornT = 9 + Math.random() * 16;
        if (!core.playSample('street.horn.distant', { volume: 0.3 * this.outside, rate: 0.95 + Math.random() * 0.1 })) {
          const t = core.now();
          core.tone(t, { type: 'sawtooth', from: 320, to: 300, dur: 0.5, peak: 0.035 * this.outside });
          core.tone(t, { type: 'sawtooth', from: 400, to: 378, dur: 0.5, peak: 0.028 * this.outside });
        }
      }
    }
  }
}

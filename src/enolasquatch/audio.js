/**
 * The Enola Squatch's sound.
 *
 * The scene shipped with no audio engine at all — `main.js` had a
 * `visibilitychange` handler whose whole body was a comment saying there was
 * nothing to mute. That is why none of the eighty-seven authored lines in
 * `dialogue/script.js` could ever have been heard even after they are
 * recorded, and why the owner's "I also want the drop of the bomb to have the
 * pheeeeeew (Classic falling sound effect)" had nowhere to go.
 *
 * This wires the mission to the same stack the Beef Run uses:
 *
 *   `EnolaAudioEngine` — `src/core/audio.js`'s AudioEngine, narrowed to decode
 *     only the recordings THIS page can use, exactly the way
 *     `BeefAudioEngine` narrows it for the airstrip. It accepts
 *     `vo.enolasquatch.*` (the cue namespace `dialogue/script.js`'s `cueOf`
 *     mints and `tools/enolasquatch-vo.mjs` writes into the manifest), so the
 *     moment those takes are recorded they play with no further code change.
 *
 *   `EnolaMissionAudio extends MissionAudio` — engine loops, airframe wind,
 *     the stall horn, the headset muffle and the per-line VO lookup all come
 *     from the Beef Run's own class unmodified. Two things are added:
 *
 *       fallingWhistle()  the falling-bomb whistle
 *       detonation()      the blast
 *
 * BOTH OF THOSE ARE SYNTHESISED, ON PURPOSE. `assets/sfx/manifest.json` and
 * `assets/sfx/index.json` are owner-generated and off limits to this work, so
 * a new recorded cue is not something this change is allowed to mint. A live
 * WebAudio graph on the engine's own context needs no manifest entry, no file,
 * and no voice run — and for a descending whistle and a very large bang it is
 * genuinely the right tool anyway, because both are a frequency sweep and an
 * envelope rather than a performance.
 */
import { AudioEngine } from '../core/audio.js';
import { isBundled, loadJson } from '../core/assets.js';
import { loadOnceRetriable } from '../core/load-queue.js';
import { MissionAudio } from '../beefrun/audio.js';
import { clamp, lerp } from '../beefrun/util.js';

const SFX_DIR = 'assets/sfx/';

/** One-off recordings shared with the apartment that this page calls by name. */
export const ENOLA_SHARED_CUES = new Set([
  'switch.click',
  'ui.select',
  'frame.adjust',
  'door.knob',
  'can.set',
  'gun.dry',
  'gun.shot',
  'gun.impact',
  'closet.slide',
  'plane.crash.explosion',
  'can.crush',
]);

/** Recorded cues the Enola Squatch page is allowed to decode. */
export function isEnolaPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    name.startsWith('vo.enolasquatch.')
    || name.startsWith('enolasquatch.')
    || name.startsWith('footstep.')
    || name.startsWith('ambience.')
    || ENOLA_SHARED_CUES.has(name)
  );
}

export class EnolaAudioEngine extends AudioEngine {
  loadManifest() {
    return loadOnceRetriable(this, '_manifestLoadPromise', () => this._loadEnolaManifestOnce());
  }

  async _loadEnolaManifestOnce() {
    this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;
    const cues = this.manifest.sfx || [];
    let availableCues;
    if (isBundled()) {
      availableCues = cues.filter((cue) => /^data:/.test(cue.file || ''));
    } else {
      const index = await loadJson(SFX_DIR, 'index.json');
      const available = index ? new Set(index.files || []) : null;
      this._fileVersions = index?.versions || {};
      availableCues = available
        ? cues.filter((cue) => available.has(cue.file || `${cue.name}.mp3`))
        : cues;
    }
    const wanted = availableCues.filter(isEnolaPreloadCue);
    this.preloadStats = { manifestTotal: cues.length, selected: wanted.length };
    await this._loadWanted(wanted);
    return { total: wanted.length, loaded: this.loadedCount };
  }
}

export class EnolaMissionAudio extends MissionAudio {
  constructor(engine) {
    super(engine);
    this._whistle = null;
  }

  /* ---------------------------------------------------------------- */
  /* The pheeeeeew                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * The classic falling whistle, started the instant the Fat Squatch leaves
   * the mount and stopped by `endFallingWhistle()` at impact.
   *
   * Three layers, because one swept sine is a theremin and not a bomb:
   *
   *   - the whistle itself: a sine sweeping down through about three octaves,
   *     with a small amount of exponential droop so it falls fastest at the
   *     end (which is what sells the last second),
   *   - a second sine a fifth above at a fifth of the level, detuned, so it
   *     has a body rather than being a test tone,
   *   - a band-passed noise bed tracking the same sweep, which is the air.
   *
   * A slow vibrato on the pair keeps it from sounding synthesised even though
   * it is entirely synthesised.
   *
   * @param {number} seconds how long the fall is expected to take. The sweep
   *   is scheduled to land at the bottom of its range at that moment; if the
   *   bomb arrives early `endFallingWhistle()` simply cuts it there, which is
   *   the right behaviour and not an error.
   */
  fallingWhistle(seconds = 8) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    this.endFallingWhistle(0.02);
    const t = ctx.currentTime;
    const dur = clamp(seconds, 1.2, 20);
    const bus = this.engine.busSfx;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.24, t + 0.28);
    out.connect(bus);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 14;
    vibrato.connect(vibratoGain);

    const tones = [];
    for (const [mult, level, type] of [[1, 1, 'sine'], [1.5, 0.2, 'sine'], [0.5, 0.16, 'triangle']]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      // Down through three octaves, fastest at the end.
      osc.frequency.setValueAtTime(1500 * mult, t);
      osc.frequency.exponentialRampToValueAtTime(620 * mult, t + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(165 * mult, t + dur);
      vibratoGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(out);
      osc.start(t);
      tones.push(osc);
    }

    // The air around it: white noise through a band-pass riding the sweep.
    const noiseLen = Math.ceil(ctx.sampleRate * Math.min(dur + 0.5, 6));
    const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 3.4;
    band.frequency.setValueAtTime(1500, t);
    band.frequency.exponentialRampToValueAtTime(165, t + dur);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.26;
    noise.connect(band).connect(noiseGain).connect(out);
    noise.start(t);

    vibrato.start(t);
    this._whistle = { out, tones, noise, vibrato, startedAt: t };
    return true;
  }

  /** Cut the whistle — at impact, or when a checkpoint restart wipes the beat. */
  endFallingWhistle(fade = 0.06) {
    const w = this._whistle;
    if (!w) return;
    this._whistle = null;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      w.out.gain.cancelScheduledValues(t);
      w.out.gain.setValueAtTime(Math.max(w.out.gain.value, 0.0001), t);
      w.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    } catch { /* a context that has gone away is not an error worth throwing */ }
    const stopAt = t + fade + 0.05;
    for (const osc of w.tones) { try { osc.stop(stopAt); } catch { /* already stopped */ } }
    try { w.noise.stop(stopAt); } catch { /* already stopped */ }
    try { w.vibrato.stop(stopAt); } catch { /* already stopped */ }
  }

  get whistling() { return !!this._whistle; }

  /* ---------------------------------------------------------------- */
  /* The blast                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * "I want the explosion to be absolutely earth shattering and massive."
   *
   * Not `MissionAudio.explosion()` — that one is the Brushrunner hitting a
   * hillside, three short cues stacked, about a second long. This is a
   * different order of event and is built as one:
   *
   *   0.00  the crack: broadband noise through a lowpass that slams open and
   *         then closes over a second and a half
   *   0.00  the punch: a sine dropping 70 Hz -> 22 Hz, which is the part felt
   *         rather than heard
   *   0.28  the second front, quieter and duller — the sound reaching you off
   *         the ground rather than through the air
   *   0.00  a nine-second rumble tail on a slow filter sweep, which is what
   *         makes it read as enormous instead of merely loud
   *
   * @param {number} scale 0..1.5 — how big. 1 is the Fat Squatch.
   */
  detonation(scale = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const t = ctx.currentTime;
    const k = clamp(scale, 0.2, 1.5);

    const noiseBuffer = (seconds) => {
      const n = Math.ceil(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Pink-ish: white noise with a one-pole smoother, which has far more
      // low-end energy than white and is what a blast actually is.
      let last = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.035 * white) / 1.035;
        data[i] = last * 3.2 + white * 0.35;
      }
      return buffer;
    };

    const burst = (delay, level, len, openHz, closeHz) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(len);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(openHz, t + delay);
      lp.frequency.exponentialRampToValueAtTime(closeHz, t + delay + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(level * k, t + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + len);
      src.connect(lp).connect(g).connect(bus);
      src.start(t + delay);
      src.stop(t + delay + len + 0.05);
    };

    burst(0, 0.95, 1.8, 9000, 300);        // the crack
    burst(0.28, 0.5, 2.6, 1800, 120);      // the ground-borne second front
    burst(0.05, 0.62, 9.0, 400, 45);       // the rumble tail

    // The punch. Nothing about this is audible on a laptop speaker and it is
    // the whole event on anything with a woofer.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 1.5);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.85 * k, t + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    sub.connect(subGain).connect(bus);
    sub.start(t);
    sub.stop(t + 3.3);

    // And the debris, thrown for a long time afterwards.
    for (let i = 0; i < 5; i++) {
      burst(1.1 + i * 0.55 + Math.random() * 0.3, 0.16, 0.7, 2600, 200);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* The flak                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * One burst, heard from `distance` metres.
   *
   * Owner: "the flak coming from the ground is bad ass. Let's really refine
   * that." Most of what makes a near miss frightening is not the volume, it is
   * the SPECTRUM: a burst two hundred metres away is a dull thud through the
   * airframe because the air has taken the top off it, and one thirty metres
   * away is a flat crack with all of it still in. So the lowpass corner and the
   * attack both move with distance, rather than one sample being played
   * quieter.
   *
   * Synthesised on purpose, like everything else on this page — see the file
   * header. `assets/sfx/manifest.json` is owner-generated and off limits, and a
   * bandwidth-limited noise burst is genuinely the right tool for this anyway.
   *
   * @param {number} distance metres
   * @param {number} [severity] 0..1, as `Defense` computed it
   */
  flakBurst(distance = 200, severity = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const near = clamp(1 - distance / 320, 0, 1);
    // Sound takes time to get there. Under a fifth of a second at these
    // ranges, and it is exactly what separates "a burst" from "a burst NEAR
    // YOU" — the near ones arrive with the light.
    const t = ctx.currentTime + clamp(distance / 336, 0, 1.2);

    const len = 0.5 + near * 0.5;
    const n = Math.ceil(ctx.sampleRate * len);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 2.6 + white * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // 380 Hz at three hundred metres, 6.5 kHz right on top of you.
    lp.frequency.setValueAtTime(lerp(380, 6500, near * near), t);
    lp.frequency.exponentialRampToValueAtTime(lerp(120, 400, near), t + len);
    const g = ctx.createGain();
    const peak = clamp(0.16 + near * 0.7, 0, 0.9) * clamp(0.4 + severity, 0.2, 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + lerp(0.03, 0.004, near));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + len + 0.05);

    // The thump you feel rather than hear, only when it is genuinely close.
    if (near > 0.35) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(lerp(70, 130, near), t);
      sub.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(near * 0.5, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      sub.connect(sg).connect(bus);
      sub.start(t);
      sub.stop(t + 0.75);
    }
    return true;
  }

  /**
   * Splinters arriving on the skin.
   *
   * The sound a crew actually remembers: not the bang, the gravel on the
   * fuselage half a second afterwards. A short burst of filtered impulses,
   * which is what it is.
   *
   * @param {number} [k] 0..1 — how much of it there was
   */
  shrapnel(k = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const t0 = ctx.currentTime;
    const hits = 4 + Math.round(clamp(k, 0, 1) * 12);
    for (let i = 0; i < hits; i++) {
      const at = t0 + Math.random() * 0.28;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900 + Math.random() * 2600, at);
      osc.frequency.exponentialRampToValueAtTime(180 + Math.random() * 300, at + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.value = 1400 + Math.random() * 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.06 + Math.random() * 0.09 * clamp(k, 0, 1), at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      osc.connect(bp).connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + 0.08);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* The blast wave arriving                                           */
  /* ---------------------------------------------------------------- */

  /**
   * The front reaching the aeroplane.
   *
   * `detonation()` above is the event itself; this is the moment it gets to
   * YOU, which is a completely different sound — a crack with no distance in
   * it at all, then the airframe ringing, then a long roar of disturbed air
   * going past. Fired by `MissionController.onShockWave()` at whatever range
   * the player actually managed to get, which is why the break turn is worth
   * flying.
   *
   * @param {number} [severity] 0..3 as the mission computed it
   */
  blastWave(severity = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const t = ctx.currentTime;
    const k = clamp(severity, 0.15, 3);

    // The slap.
    const n = Math.ceil(ctx.sampleRate * 2.4);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 4.2 + white * 0.3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(clamp(0.5 * k, 0.05, 1), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 2.4);

    // The airframe, complaining about it for a second and a half.
    for (const f of [148, 233, 391]) {
      const ring = ctx.createOscillator();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(f * (0.98 + Math.random() * 0.04), t + 0.02);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.0001, t + 0.02);
      rg.gain.exponentialRampToValueAtTime(0.05 * clamp(k, 0.2, 1.4), t + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      ring.connect(rg).connect(bus);
      ring.start(t + 0.02);
      ring.stop(t + 1.7);
    }
    return true;
  }

  dispose() {
    this.endFallingWhistle(0.02);
    super.dispose();
  }
}

/**
 * Recorded one-shots and beds requested directly by the NO WAKE runtime.
 *
 * The owner's complaint about the old scene was that the engines and the water
 * were thin, so the redesign asks for real beds under every leg of the trip:
 * marina ambience at the dock, gulls over it, an ocean bed at the inlet, a
 * start, an idle and a rev on the levers, and water tapping the fiberglass from
 * inside the cabin. Five of those are new cues and are listed in
 * `VOICE-LINES-TODO.md` until somebody records them; everything else on this
 * list is already on disk.
 */
import { boatSpeedFraction } from './physics.js';

export const NO_WAKE_AUDIO_CUE_NAMES = Object.freeze([
  'ambience.harbor',
  'ambience.ocean.night',
  'seagull.distant',
  'boat.hull.creak',
  'water.lap.hull',
  'bird',
  'chair.scrape.wood',
  'boat.ballast.chain',
  'cloth.snap',
  'cloth.suit.movement',
  'dish.clink',
  'door.creak',
  'drunk.collapse',
  'glass.set',
  'gun.shot',
  'hotdog.body.floor',
  'boat.bag.zip',
  'pc.fan',
  'pour',
  'radio.click',
  'switch.click',
  'ui.select',
  'woo.streak',
  'water.splash',
  'whiskey.pour',
]);

/** Dialogue, boat systems, and walking surfaces owned by the NO WAKE page. */
export const NO_WAKE_AUDIO_PREFIXES = Object.freeze([
  'vo.nowake.',
  'boat.',
  'footstep.',
]);

const NO_WAKE_AUDIO_CUE_SET = new Set(NO_WAKE_AUDIO_CUE_NAMES);

/**
 * Swept up by the `footstep.` prefix but never NO WAKE's to load: the scene
 * walks boards and nothing else (the dock and the whole boat are `wood`, plus
 * the one authored `boat.board.step`). `footstep.sand` is golf's bunker grain
 * and sits on the generation ledger until recorded; without this exclusion the
 * zero-pending delivery gate reported it as a NO WAKE pickup.
 */
const NO_WAKE_AUDIO_EXCLUDED = new Set(['footstep.sand']);

export function isNoWakeAudioPreloadCue(cue, radioCueNames = []) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  if (!name) return false;
  if (NO_WAKE_AUDIO_EXCLUDED.has(name)) return false;
  return new Set(radioCueNames).has(name)
    || NO_WAKE_AUDIO_CUE_SET.has(name)
    || NO_WAKE_AUDIO_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Keep the radio's bounded, read-only preload plan intact while adding only
 * sounds owned by this scene. Fresh arrays make the request safe to mutate.
 */
export function noWakeAudioLoadOptions(radioCueNames = []) {
  return {
    names: [...new Set([...radioCueNames, ...NO_WAKE_AUDIO_CUE_NAMES])],
    prefixes: [...NO_WAKE_AUDIO_PREFIXES],
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Two seconds of noise, shared by the exhaust and water layers. */
function engineNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // Brown-ish rather than white: an engine room is weight, not hiss.
    last = (last + (Math.random() * 2 - 1) * .16) * .96;
    data[i] = last;
  }
  return buffer;
}

/**
 * The cruiser's own twin diesels, as a live graph rather than a cue.
 *
 * `boat.engine.idle` and `boat.engine.underway` are recorded stems and stay
 * exactly as they are -- this runs underneath them. What a stem cannot do is
 * answer the throttle: it plays at one rpm forever, so the player pushes both
 * levers to the stop and the boat sounds the same as it did alongside. This is
 * the part he is standing on. Two big slow-turning engines under the cockpit
 * sole, each with its own firing rate, block rumble and wet exhaust, running a
 * couple of Hz apart so they beat against each other the way two engines that
 * were never quite in sync actually do, all of it heard through a deck.
 *
 * Same pattern as `src/beefrun/audio.js`: built on the shared AudioEngine's
 * context and bus, so the master, limiter and ducking still own the result.
 */
export class NoWakeEngineAudio {
  constructor(engine) {
    this.engine = engine;      // AudioEngine from src/core/audio.js
    this.ready = false;
    this.running = false;
    this.nodes = null;
    /**
     * How much of the engine room reaches the ear.
     *
     * "The companionway drops into a warm enclosed cabin. Engines go muffled
     * and physical." One number rather than a second graph: below decks the
     * sole filter closes down and the level drops, and when Booski shuts the
     * companionway doors it closes further still, which is the moment the room
     * stops being outdoors. 1 is on deck.
     */
    this.enclosure = 1;
  }

  /**
   * @param {number} value 1 on deck, ~0.45 below, ~0.2 with the doors shut.
   */
  setEnclosure(value) {
    this.enclosure = Math.max(0, Math.min(1, value));
  }

  get ctx() { return this.engine?.ctx; }

  /** Called after AudioEngine.init(), from the same user gesture. */
  init() {
    const ctx = this.ctx;
    if (!ctx || this.ready) return;
    const noise = engineNoise(ctx);

    const out = ctx.createGain();
    out.gain.value = 0;
    /* Everything arrives through the cockpit sole and a hatch. The corner
     * opens with load, which is most of what tells the ear the engines are
     * working rather than merely turning. */
    const sole = ctx.createBiquadFilter();
    sole.type = 'lowpass';
    sole.frequency.value = 340;
    sole.Q.value = .8;
    out.connect(sole);
    sole.connect(this.engine.busSfx);

    const engines = [];
    for (let i = 0; i < 2; i++) {
      const side = ctx.createGain();
      side.gain.value = .5;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) {
        pan.pan.value = i === 0 ? -.38 : .38;
        side.connect(pan);
        pan.connect(out);
      } else {
        side.connect(out);
      }

      // Firing rate: a six-cylinder four-stroke at 700 rpm fires about 35
      // times a second, and this pair idles there.
      const fire = ctx.createOscillator();
      fire.type = 'sawtooth';
      fire.frequency.value = 35;
      const fireGain = ctx.createGain();
      fireGain.gain.value = .58;
      fire.connect(fireGain);
      fireGain.connect(side);

      // The block itself, an octave down, is the weight you feel through the
      // deck rather than anything you could hum.
      const block = ctx.createOscillator();
      block.type = 'square';
      block.frequency.value = 17.5;
      const blockGain = ctx.createGain();
      blockGain.gain.value = .34;
      block.connect(blockGain);
      blockGain.connect(side);

      // Wet exhaust out of the transom, breathing at the firing rate.
      const exhaust = ctx.createBufferSource();
      exhaust.buffer = noise;
      exhaust.loop = true;
      const exhaustFilter = ctx.createBiquadFilter();
      exhaustFilter.type = 'bandpass';
      exhaustFilter.frequency.value = 190;
      exhaustFilter.Q.value = .9;
      const exhaustGain = ctx.createGain();
      exhaustGain.gain.value = .30;
      exhaust.connect(exhaustFilter);
      exhaustFilter.connect(exhaustGain);
      exhaustGain.connect(side);
      exhaust.start();

      fire.start();
      block.start();
      engines.push({ fire, block, exhaustFilter, exhaustGain, side });
    }

    this.nodes = { out, sole, engines };
    this.ready = true;
  }

  /** Both engines catch. Called on the ignition, after the starter cue. */
  start() {
    if (!this.ready || this.running) return;
    this.running = true;
    // Up to the idle level; `setDrive` owns it from the next frame on.
    this.nodes.out.gain.setTargetAtTime(.46, this.ctx.currentTime, .5);
  }

  /** Shut down: the graph keeps running silently rather than being rebuilt. */
  stop(fade = .7) {
    if (!this.ready || !this.running) return;
    this.running = false;
    this.nodes.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
  }

  /**
   * Drive the engines from the boat, once a frame.
   *
   * `duck` steps the whole engine room back while somebody on deck is talking.
   * These are big engines directly under the cockpit and the mission's ambient
   * lines are all spoken over them at cruising revs.
   *
   * @param {{rpm:number, throttle:number, speed:number, duck?:number}} drive
   */
  setDrive({ rpm = 0, throttle = 0, speed = 0, duck = 1 } = {}) {
    if (!this.ready || !this.running) return;
    const t = this.ctx.currentTime;
    const load = clamp(Math.abs(throttle), 0, 1);
    const turning = clamp((rpm - 700) / 3600, 0, 1);
    const way = boatSpeedFraction(speed);
    for (let i = 0; i < this.nodes.engines.length; i++) {
      const e = this.nodes.engines[i];
      // Port engine a shade slower than starboard, permanently.
      const trim = i === 0 ? .985 : 1.012;
      const fire = (35 + turning * 128) * trim;
      e.fire.frequency.setTargetAtTime(fire, t, .09);
      e.block.frequency.setTargetAtTime(fire * .5, t, .11);
      e.exhaustFilter.frequency.setTargetAtTime(150 + turning * 620 + way * 180, t, .12);
      e.exhaustGain.gain.setTargetAtTime(.24 + load * .34, t, .12);
      e.side.gain.setTargetAtTime(.42 + turning * .30, t, .10);
    }
    /* Hatches and sole let more of the top end through the harder they work,
     * and a closed companionway takes almost all of it away again. The engines
     * are louder than they were: this is the thing the player is standing on,
     * and the old mix had it behind the seagulls. */
    const enclosed = .28 + this.enclosure * .72;
    this.nodes.sole.frequency.setTargetAtTime(
      (320 + turning * 1320 + way * 300) * enclosed, t, .14,
    );
    const level = (.46 + load * .34 + way * .16)
      * (.24 + this.enclosure * .76) * clamp(duck, 0, 1);
    this.nodes.out.gain.setTargetAtTime(level, t, .18);
  }
}

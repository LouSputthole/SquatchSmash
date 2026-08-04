/**
 * DialogueSystem — the Enola Squatch's own copy of `src/beefrun/dialogue.js`.
 *
 * Not a reuse of that file: `src/beefrun/dialogue.js` imports `BEATS, BARKS,
 * SPEAKERS, cueOf, barkCueOf` directly from `./script.js` at the top of the
 * file, i.e. it hardcodes the import path to Beef Run's own script rather
 * than accepting the data as a constructor/method argument. There is no way
 * to hand it this mission's `BEATS`/`BARKS`/`SPEAKERS` from outside, so per
 * the phase brief this is a new, small file "closely modeled on" the
 * original rather than a fork of it or an import of it.
 *
 * Everything else is intentionally identical: the same queue, the same
 * once/urgent/delay semantics on `play()`, the same per-pool bark cooldown
 * plus a global one, the same played/seen bookkeeping, the same headset
 * marker. One real behavioural change, needed by this mission's own script:
 *
 *   BARKS entries here are `{who, text}` pairs (see the header comment in
 *   `./script.js`), not bare strings — this crew is four people talking over
 *   each other, not one pilot narrating to himself. Beef Run's `bark()`
 *   hardcodes `who: 'SASOLE'` on the line it queues because every one of its
 *   BARKS entries is implicitly Lou. This version reads `.who` off the picked
 *   line instead, so a pool can mix speakers (e.g. `gunnerFiring` is always
 *   Shubes, but nothing stops a future pool from alternating).
 */
import { BEATS, BARKS, SPEAKERS, cueOf, barkCueOf } from './script.js';
import { clamp } from '../../beefrun/util.js';

const BARK_COOLDOWN = {
  default: 9,
  // A prod at a player who has stopped walking round the aeroplane. Long,
  // because being nagged every nine seconds is worse than being lost.
  walkaroundIdle: 30,
  heavyBanked: 16, heavySlow: 20, heavySmooth: 26,
  gunnerIdle: 22, gunnerFiring: 3.5,
  lowFuel: 30, terrainClose: 4,
};
const GLOBAL_BARK_COOLDOWN = 5;

export class DialogueSystem {
  constructor(hud, { audio = null, onLine = null } = {}) {
    this.hud = hud;
    this.audio = audio;
    this.onLine = onLine;           // (line, speaker) => void — drives the figures/camera
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.headset = false;
    this.played = new Set();
    this._barkAt = Object.create(null);
    this._barkIndex = Object.create(null);
    this._lastBarkAt = -999;
    this.t = 0;
    this.enabled = true;
  }

  /** Is anybody talking, or about to? */
  get busy() { return !!this.current || this.queue.length > 0; }

  /**
   * @param {string} id a key in BEATS
   * @param {object} opts { once, urgent, delay }
   */
  play(id, { once = false, urgent = false, delay = 0 } = {}) {
    const beat = BEATS[id];
    if (!beat) return false;
    if (once && this.played.has(id)) return false;
    this.played.add(id);
    if (urgent) {
      this.queue.length = 0;
      this.current = null;
      this.timer = 0;
    }
    beat.forEach((line, i) => this.queue.push({ ...line, beat: id, cue: cueOf(id, i, line.who) }));
    if (delay) this.timer = Math.max(this.timer, delay);
    return true;
  }

  /** Has a given beat already been played? */
  seen(id) { return this.played.has(id); }

  /**
   * A one-liner from a named pool. Dropped rather than queued if the moment
   * has passed by the time there is room to say it. Pools here are
   * `{who, text}` pairs (see the class comment) rather than bare strings.
   */
  bark(pool, { force = false } = {}) {
    const lines = BARKS[pool];
    if (!lines || !this.enabled) return false;
    const cd = BARK_COOLDOWN[pool] ?? BARK_COOLDOWN.default;
    if (!force && this.t - (this._barkAt[pool] ?? -999) < cd) return false;
    if (!force && this.t - this._lastBarkAt < GLOBAL_BARK_COOLDOWN) return false;
    if (this.busy && !force) return false;
    this._barkAt[pool] = this.t;
    this._lastBarkAt = this.t;
    const i = (this._barkIndex[pool] = ((this._barkIndex[pool] ?? -1) + 1) % lines.length);
    const line = lines[i];
    this.queue.push({ who: line.who, text: line.text, hold: 2.6, bark: true, cue: barkCueOf(pool, i, line.who) });
    return true;
  }

  /** Wipe everything pending — used when a checkpoint restarts a phase. */
  clear() {
    this.queue.length = 0;
    this.current = null;
    this.timer = 0;
  }

  /** Forget what has been said, so a restarted phase can say it again. */
  forget(...ids) {
    for (const id of ids) this.played.delete(id);
  }

  setHeadset(on) {
    this.headset = on;
  }

  update(dt) {
    this.t += dt;
    if (!this.enabled) return;
    if (this.timer > 0) {
      this.timer -= dt;
      return;
    }
    if (!this.queue.length) {
      this.current = null;
      return;
    }
    const line = this.queue.shift();
    this.current = line;
    const recordedSeconds = this.audio?.line(line) || 0;
    this.timer = Math.max(line.hold ?? 2.4, recordedSeconds > 0 ? recordedSeconds + 0.45 : 0);

    const speaker = SPEAKERS[line.who] ?? SPEAKERS.SASOLE;
    // Everyone forward of the headset is on the intercom once it is live —
    // not just SASOLE/PROSPECT the way Beef Run's two-person cockpit reads
    // it, because this crew is four people on the same circuit.
    const headsetMark = this.headset ? ' class="hs"' : '';
    this.hud.say(
      `<b style="color:${speaker.colour}"${headsetMark}>${speaker.name}</b> ${line.text}`,
      clamp(this.timer * 1000 + 400, 1200, 7000),
    );
    this.onLine?.(line, speaker);
    // The voice bank is optional, same as Beef Run's: a cue with no recording
    // simply does not play audio, and the subtitle still reads.
  }
}

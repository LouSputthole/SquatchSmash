/**
 * DialogueSystem.
 *
 * Beats are queued and played one line at a time through the apartment's HUD
 * subtitle, with the speaker's name in their own colour. Two rules keep it out
 * of the player's way: a beat never interrupts a beat unless it is marked
 * urgent, and Lou's unscripted one-liners never interrupt anything at all —
 * they wait for a gap, and if the gap does not come, they are dropped.
 *
 * The other half of the job is the headset. Once the aeroplane is running,
 * everything Lou says is coming through an intercom over two piston engines,
 * so the audio side gets told to filter it and the subtitle gets a marker.
 */
import { BEATS, BARKS, SPEAKERS, cueOf, barkCueOf } from './script.js';
import { clamp } from './util.js';

const BARK_COOLDOWN = { default: 9, stall: 4, terrain: 3.5, smooth: 40, banked: 14 };

export class DialogueSystem {
  constructor(hud, { audio = null, onLine = null } = {}) {
    this.hud = hud;
    this.audio = audio;
    this.onLine = onLine;           // (line, speaker) => void — drives the figures
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.headset = false;
    this.played = new Set();
    this._barkAt = Object.create(null);
    this._barkIndex = Object.create(null);
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
   * has passed by the time there is room to say it.
   */
  bark(pool, { force = false } = {}) {
    const lines = BARKS[pool];
    if (!lines || !this.enabled) return false;
    const cd = BARK_COOLDOWN[pool] ?? BARK_COOLDOWN.default;
    if (!force && this.t - (this._barkAt[pool] ?? -999) < cd) return false;
    if (this.busy && !force) return false;
    this._barkAt[pool] = this.t;
    const i = (this._barkIndex[pool] = ((this._barkIndex[pool] ?? -1) + 1) % lines.length);
    this.queue.push({ who: 'SASOLE', text: lines[i], hold: 2.6, bark: true, cue: barkCueOf(pool, i) });
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
    this.timer = line.hold ?? 2.4;

    const speaker = SPEAKERS[line.who] ?? SPEAKERS.SASOLE;
    const headsetMark = this.headset && (line.who === 'SASOLE' || line.who === 'PROSPECT')
      ? ' class="hs"' : '';
    this.hud.say(
      `<b style="color:${speaker.colour}"${headsetMark}>${speaker.name}</b> ${line.text}`,
      clamp(this.timer * 1000 + 400, 1200, 7000),
    );
    this.onLine?.(line, speaker);
    // The voice bank is optional: a cue that has never been recorded simply
    // does not play, and the line still reads.
    this.audio?.line(line);
  }
}

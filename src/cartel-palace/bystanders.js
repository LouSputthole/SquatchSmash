/**
 * THE PEOPLE WHO WORK HERE.
 *
 * Owner, 2026-08-20 playtest: *"an unarmed cleaning lady / civilian nearby
 * who panics and cowers rather than fighting when shooting starts, with
 * lines like 'Don't shoot! Don't shoot!'"*
 *
 * The estate had eight men with guns and nobody else, so the only thing the
 * building could tell you about itself was that it was defended. A cleaner
 * with a cart in the front hall says the rest of it: that the floor was
 * being mopped an hour ago, that somebody's shift was interrupted, and that
 * the player is the worst thing that has happened here all year.
 *
 * She is a CIVILIAN in exactly the sense the begging trio at Mark's table
 * are (see cast.js): hit zones and a small health pool, no CombatActor, no
 * faction, no firearm runtime, and nothing the mission counts either way.
 * `PalaceSecurity` never ticks her, so this owns her clock — her breathing,
 * her pose blends, her mouth, the short run to cover, and her lines.
 *
 * Four states, one direction only:
 *
 *   calm      at her cart, working.
 *   startled  she has seen the player, and says so.
 *   fleeing   a short authored run to `cowerAt`, out of the door lane.
 *   cowering  face down, repeating herself, for the rest of the mission.
 *
 * Nothing in here can ever escalate. She does not pick anything up, she does
 * not raise an alarm, and if the player shoots her the scene handles it the
 * way it handles the wife: full blood, no mission consequence, and a line
 * from somebody else about what kind of person does that.
 */

const FLEE_SECONDS = 1.15;
/* A gunshot this close is in her room; anything further is noise from the
 * grounds she only reacts to once she has seen who made it. The entry hall
 * is 14 m from the front doors to the corridor arch. */
const NEAR_SHOT_RADIUS = 14;
/* How long she stands startled before a remembered alarm sends her down:
 * long enough for "Oh -- oh no" to read as hers, short enough that the
 * dive is still the thing he sees on the way in. */
const STARTLED_RECALL_SECONDS = 0.9;

/* How hard she is shaking, by state — the shared `HeistFigure.update` fear
 * term, the same knob the finale's civilians use. */
const FEAR = Object.freeze({
  calm: 0.05, startled: 0.55, fleeing: 0.95, cowering: 0.8,
});

/* Lines she repeats from the floor, in order, on a slow clock. She never
 * stops being frightened; she only runs out of new ways to say it. */
import { PRONE_MOUTH_Y } from './voice.js';

const COWER_LINES = Object.freeze(['cleaner.cower.one', 'cleaner.cower.two']);

/** Dialogue cannot come from a body the rendered hierarchy has hidden. */
function visibleInWorld(object) {
  if (!object?.parent) return false;
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

/**
 * Runs the estate's working civilians.
 *
 * @param {object} options
 * @param {object} options.cast   the palace cast (uses `cast.bystanders`)
 * @param {object} [options.voice] a PalaceVoice, for everything she says
 * @param {object} [options.player] anything with a `.position` Vector3
 */
export class PalaceBystanders {
  constructor({ cast, voice = null, player = null } = {}) {
    if (!cast?.bystanders) throw new TypeError('PalaceBystanders requires a cast with bystanders');
    this.cast = cast;
    this.voice = voice;
    this.player = player;
    this.state = new Map();
    for (const entry of cast.bystanders) {
      this.state.set(entry.id, {
        entry,
        phase: 'calm',
        from: entry.root.position.clone(),
        t: 0,
        cowerClock: 0,
        cowerIndex: 0,
        pleaded: false,
      });
    }
  }

  _record(entry) {
    return entry ? this.state.get(entry.id) ?? null : null;
  }

  /**
   * She has noticed the player. Pose and one line; nothing else changes.
   * Gated by the caller on distance, and by PalaceVoice on line of sight, so
   * she cannot react to a man she has not seen.
   */
  notice(entry = this.cast.bystanders[0]) {
    const record = this._record(entry);
    /* Owner, 2026-08-28: *"Rosa must already be visibly present before her
     * first line begins."* Her model is synchronous, built with the cast, but
     * this guard makes that ordering a runtime invariant: a future checkpoint
     * cleanup or visibility pass cannot leave the line live after hiding or
     * detaching the body. */
    if (!record || record.entry.down || record.phase !== 'calm'
      || !visibleInWorld(record.entry.root)) return false;
    record.phase = 'startled';
    record.entry.figure.setState?.('startled', { blend: true });
    this.voice?.say?.('cleaner.spotted', {
      position: record.entry.root.position, radius: 12, urgent: true,
    });
    /* If the grounds have already gone loud, she goes down a breath after
     * she sees him -- standing, then diving, in that order. */
    if (record.alarmed) record.recallClock = STARTLED_RECALL_SECONDS;
    return true;
  }

  /**
   * Shooting. Everybody who is still standing goes to the floor.
   *
   * She runs to her authored cower point first — it is out of the lane from
   * the door to the corridor, so a panicking civilian never becomes a
   * navigation problem in the middle of a firefight — and drops there.
   */
  panic({ position = null } = {}) {
    let moved = false;
    for (const record of this.state.values()) {
      if (record.entry.down || record.phase === 'fleeing' || record.phase === 'cowering') continue;
      /* SHE STAYS ON HER FEET UNTIL HE WALKS IN. Owner, 2026-09-02: "Be
       * better if Rosa was standing and then dives on the ground when you
       * come in." A shot on the grounds or the alarm going up used to put
       * her face down at her cower point before the player had reached the
       * front door, so the first he saw of her was a body on the floor. Now
       * a room that has not seen him yet only REMEMBERS the noise: she keeps
       * working, and the moment `notice()` fires -- he is in the hall and she
       * has seen him -- the remembered alarm sends her to the floor. A shot
       * fired in her own room is the exception and drops her at once. */
      if (record.phase === 'calm') {
        const near = position && record.entry.root.position.distanceTo(position) <= NEAR_SHOT_RADIUS;
        if (!near) {
          record.alarmed = true;
          continue;
        }
      }
      record.entry.panicked = true;
      record.from.copy(record.entry.root.position);
      record.t = 0;
      if (record.entry.cowerAt) {
        record.phase = 'fleeing';
        record.entry.figure.setState?.('bolting', { blend: true });
      } else {
        record.phase = 'cowering';
        record.entry.figure.setState?.('kneeling', { blend: true });
      }
      moved = true;
    }
    if (moved) {
      const first = [...this.state.values()].find((record) => !record.entry.down);
      this.voice?.say?.('cleaner.panic.one', {
        position: first?.entry.root.position ?? null, radius: 22, urgent: true,
      });
    }
    return moved;
  }

  /** Simulated clock only — dt from the scene loop, never wall time. */
  update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    for (const record of this.state.values()) {
      const { entry } = record;
      entry.figure.update(step, { fear: entry.down ? 0 : FEAR[record.phase] ?? 0 });
      if (entry.down) continue;

      if (record.phase === 'startled' && record.recallClock > 0) {
        record.recallClock -= step;
        if (record.recallClock <= 0) this.panic({ position: entry.root.position });
        continue;
      }

      if (record.phase === 'fleeing') {
        record.t = Math.min(1, record.t + step / FLEE_SECONDS);
        // Smoothstep, so she leaves and arrives rather than teleports.
        const eased = record.t * record.t * (3 - 2 * record.t);
        entry.root.position.lerpVectors(record.from, entry.cowerAt, eased);
        if (record.t >= 1) {
          record.phase = 'cowering';
          record.cowerClock = 2.6;
          entry.figure.setState?.('prone', { blend: true });
          this.voice?.say?.('cleaner.panic.two', {
            position: entry.root.position, radius: 16, mouthY: PRONE_MOUTH_Y,
          });
        }
        continue;
      }

      if (record.phase !== 'cowering') continue;
      record.cowerClock -= step;
      if (record.cowerClock <= 0) {
        record.cowerClock = 9 + record.cowerIndex * 3;
        const id = COWER_LINES[record.cowerIndex % COWER_LINES.length];
        record.cowerIndex++;
        /* From the floor, behind whatever she is behind. If he cannot see
         * her, he does not hear her -- which is the whole of the owner's
         * "disembodied cleaner" note. */
        this.voice?.say?.(id, {
          position: entry.root.position, radius: 11, mouthY: PRONE_MOUTH_Y,
        });
      }
      /* Standing over her. She stops repeating and asks him directly — once,
       * and only once, in the whole mission. */
      if (!record.pleaded && this.player?.position
        && this.player.position.distanceTo(entry.root.position) <= 3.4) {
        record.pleaded = this.voice?.say?.('cleaner.plead', {
          position: entry.root.position, radius: 5, urgent: true,
          mouthY: PRONE_MOUTH_Y,
        }) === true;
      }
    }
    return this;
  }

  /**
   * Stage the room as a checkpoint restore found it: everybody already down
   * where they landed, no run, no lines replayed.
   */
  stagePanicked() {
    for (const record of this.state.values()) {
      if (record.entry.down) continue;
      record.phase = 'cowering';
      record.t = 1;
      record.cowerClock = 12;
      record.entry.panicked = true;
      if (record.entry.cowerAt) record.entry.root.position.copy(record.entry.cowerAt);
      record.entry.figure.setState?.('prone', { blend: false });
    }
    return this;
  }

  /** JSON-safe view for tests and the verifier. */
  report() {
    return Object.freeze({
      people: [...this.state.values()].map((record) => Object.freeze({
        id: record.entry.id,
        phase: record.phase,
        alarmed: record.alarmed === true,
        down: record.entry.down === true,
        x: record.entry.root.position.x,
        z: record.entry.root.position.z,
      })),
    });
  }
}

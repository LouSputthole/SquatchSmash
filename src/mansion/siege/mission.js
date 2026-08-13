/**
 * MANSION UNDER SIEGE -- the mission model.
 *
 * Beats, objectives, checkpoints and the transition out to Enola Squatch.
 * Written against docs/MANSION-SIEGE-NIGHT.md, and like waves.js it holds no
 * THREE and no scene: the scene tells it what the player did, it tells the
 * scene what state the house should be in and what the objective says.
 *
 * WHY THE CHECKPOINT TAKES PROVIDERS. The original brief lists eleven things a
 * checkpoint must restore, and most of them -- weapon, health, ammunition,
 * who is dead, which panes are out -- live in systems this file must not
 * import. So the scene registers a named provider for each, and `capture()`
 * calls all of them. The value of doing it this way is not tidiness: it is
 * that `checkpointFields()` can be asserted against the brief's list in a
 * test, so a checkpoint that silently forgets the broken glass fails in CI
 * instead of on a staircase.
 */
import { WaveDirector, WAVES, ENCOUNTERS } from './waves.js';

/**
 * Every beat, in authored order, with the objective it puts on the HUD.
 *
 * ## THE `hint` FIELD, AND THE PLAYTEST THAT PUT IT THERE
 *
 * `objective` is what the mission wants; `hint` is which way that is. They
 * are two fields because they are two sentences with two jobs, and because
 * the objective strings are asserted verbatim by `verify:mansion-siege` --
 * folding directions into them would make every route check a string-length
 * test on prose.
 *
 * Driven end to end as a first-time player, the mission was legible from the
 * bed to the corridor and then stopped being legible three times:
 *
 *   TO_ARMORY   "Reach the armory" in a 31 m basement corridor with four
 *               doorways off it and no sign of which one.
 *   TO_OFFICE   "Reach Lou's office" from a basement, when the office is two
 *               storeys up at the far end of a house he has never walked.
 *   LITTLE_FRIEND  "Hold the house" -- with no way to know that the mission
 *               is waiting on him to stand in one specific six-metre bay
 *               holding one specific gun and press one specific key.
 *
 * The hint is one of three channels carrying each of those; the other two are
 * a line of Booski's in `./script.js` and, for the firing step, a lit
 * ammunition point you can see from the office door.
 */
export const BEATS = Object.freeze({
  /** Eyes open on the guest-room ceiling. The fight started without him. */
  WAKE: Object.freeze({
    objective: null, hint: null, state: 'under_attack', checkpoint: 'wake',
  }),
  /** Out of the room, down the corridor, past two men. */
  TO_ARMORY: Object.freeze({
    objective: 'Reach the armory',
    hint: 'East along the cellar hall, then south through the last door',
    state: 'under_attack',
  }),
  /** At the rack. Any real weapon take is enough to keep the mission moving. */
  ARM: Object.freeze({
    objective: 'Arm yourself',
    hint: 'E takes a weapon off the rack. Pick any one you want, then get upstairs.',
    state: 'under_attack',
  }),
  /** Up the cellar stair, through the foyer, up the horseshoe. */
  TO_OFFICE: Object.freeze({
    objective: "Reach Lou's office",
    hint: 'Up the cellar stair, across the foyer, up the horseshoe — top floor, far end',
    state: 'under_attack',
  }),
  /** The whole family, armed, still shooting while they talk. */
  BRIEFING: Object.freeze({
    objective: null, hint: null, state: 'under_attack', checkpoint: 'briefed',
  }),
  /** A weapon comes up at the top of the stairs. The line. Once. */
  LITTLE_FRIEND: Object.freeze({
    objective: 'Hold the house',
    hint: 'Take the lit firing step on the gallery rail. Weapon up, then press F.',
    state: 'under_attack',
  }),
  WAVE_ONE: Object.freeze({
    objective: 'Hold the house',
    hint: 'They come up the drive, through the front door and up both flights',
    state: 'under_attack',
  }),
  /** A breath, not a tea ceremony. */
  LULL: Object.freeze({
    objective: 'Hold the house',
    hint: 'Reload. The next lot are forming up on the drive.',
    state: 'under_attack',
    checkpoint: 'wave_one',
  }),
  WAVE_TWO: Object.freeze({
    objective: 'Hold the house',
    hint: 'Front door again — and once, both wings at the same time',
    state: 'under_attack',
  }),
  /** Smoke, bodies, glass, and the alarm still going for a while yet. */
  /* The objective reads as ACHIEVED rather than as nothing. A HUD that goes
   * blank the instant the last man drops is how a player learns the mission
   * ended when in fact Lou is still walking to the landing to talk to him. */
  AFTERMATH: Object.freeze({
    objective: 'The house is held',
    hint: 'Lou is coming to the landing',
    state: 'damaged',
    done: true,
  }),
  TO_SASOLE: Object.freeze({
    objective: 'Meet Captain Sasole',
    hint: 'The flight jacket, on the gallery landing east of the balcony',
    state: 'post_battle',
  }),
  COMPLETE: Object.freeze({
    objective: 'Mission complete', hint: null, state: 'post_battle', done: true,
  }),
});

export const BEAT_NAMES = Object.freeze(Object.keys(BEATS));
export const B = Object.freeze(Object.fromEntries(BEAT_NAMES.map((n) => [n, n])));

/**
 * The four checkpoints, and the beat each one resumes at.
 *
 * A checkpoint resumes at the START of its beat, not where the player was
 * standing -- restoring mid-corridor with two men half-dead and the door
 * behind you already open is worse than walking the corridor again.
 */
export const CHECKPOINTS = Object.freeze({
  wake: Object.freeze({ id: 'wake', beat: B.WAKE, label: 'Woke up' }),
  armed: Object.freeze({ id: 'armed', beat: B.TO_OFFICE, label: 'Armed' }),
  briefed: Object.freeze({ id: 'briefed', beat: B.LITTLE_FRIEND, label: 'Briefed' }),
  wave_one: Object.freeze({ id: 'wave_one', beat: B.LULL, label: 'Wave one held' }),
});

/**
 * Everything a checkpoint restores, named exactly as the brief names it.
 * The scene must register a provider for each; `capture()` throws if one is
 * missing, which is the whole point of the list existing.
 */
export const CHECKPOINT_FIELDS = Object.freeze([
  'weapon',
  'health',
  'ammunition',
  'enemiesDown',
  'guardsDown',
  'damageProps',
  'brokenGlass',
  'objectives',
  'activeWave',
  'friendlies',
  'dialogue',
  /* Combat stations are finite resources. Saving their charges separately
   * keeps a checkpoint rewind from manufacturing bandages or ammunition. */
  'supplies',
]);

/** How long the lull between the two waves lasts, in seconds. */
export const LULL_SECONDS = 9;

export class SiegeMission {
  /**
   * @param {object} opts
   * @param {import('./state.js').MansionDamageState} opts.damage
   * @param {(beat: string, prev: string|null) => void} [opts.onBeat]
   * @param {(text: string|null) => void} [opts.onObjective]
   * @param {(order: object) => void} [opts.onSpawn]
   * @param {(id: string) => void} [opts.onCheckpoint]
   */
  constructor({
    damage, onBeat = null, onObjective = null, onSpawn = null, onCheckpoint = null,
  } = {}) {
    if (!damage) throw new Error('SiegeMission needs the damage-state overlay');
    this.damage = damage;
    this.onBeat = onBeat;
    this.onObjective = onObjective;
    this.onSpawn = onSpawn;
    this.onCheckpoint = onCheckpoint;

    this.beat = null;
    this.time = 0;
    this.history = [];
    this.providers = new Map();
    this.checkpoint = null;

    /* The line is said once, ever. Not once per checkpoint, not once per
     * wave -- once, and a restore after it must not hand it back. */
    this.littleFriendSaid = false;

    this.waves = {
      one: new WaveDirector({ wave: 'one', onSpawn: (o) => this.onSpawn?.(o) }),
      two: new WaveDirector({ wave: 'two', onSpawn: (o) => this.onSpawn?.(o) }),
    };
    /** Encounter members still standing, by encounter id. */
    this.encounters = new Map(Object.values(ENCOUNTERS)
      .map((e) => [e.id, new Set(e.members.map((m) => m.id))]));
    this._lull = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Beats                                                              */
  /* ---------------------------------------------------------------- */

  get objective() { return this.beat ? BEATS[this.beat].objective : null; }
  /** The directional half of the objective. See the note on BEATS. */
  get hint() { return this.beat ? BEATS[this.beat].hint ?? null : null; }
  /** Whether this beat's objective is a thing achieved rather than pending. */
  get objectiveDone() { return this.beat ? BEATS[this.beat].done === true : false; }
  /**
   * Seconds left in the lull, or null when the mission is not in one.
   *
   * Exposed because the HUD needs it. A balcony that has gone quiet with an
   * empty wave counter is indistinguishable from a mission that has ended,
   * and a player who thinks the mission has ended leaves the firing step --
   * so the counter counts the lull down instead of hiding.
   */
  get lullRemaining() {
    return this.beat === B.LULL ? Math.max(0, this._lull) : null;
  }

  get activeWave() {
    if (this.beat === B.WAVE_ONE) return this.waves.one;
    if (this.beat === B.WAVE_TWO) return this.waves.two;
    return null;
  }

  /**
   * How many attackers this mission has been told are down. All twenty-seven
   * of them: the corridor's two, the foyer's three, and both waves.
   *
   * ## WHY THE MISSION COUNTS AND NOT THE SCENE
   *
   * The mission-complete card used to read this off `attackers.all()` and
   * count `actor.incapacitated`, and it reported 2 at the end of a run that
   * had put down all twenty-seven. Two different reasons, both structural:
   * `despawnAll()` clears the board between phases without incapacitating
   * anybody, and a checkpoint restore rebuilds the roster from a snapshot. So
   * the scene's live actor list is a picture of who is standing NOW, which is
   * a different question from what the player did over three minutes.
   *
   * `noteDown()` is the one call every death of every kind already funnels
   * through -- encounters and both waves -- so the tally belongs beside it and
   * survives despawn, restore and beat changes for free.
   */
  get attackersDown() {
    let encountersDown = 0;
    for (const encounter of Object.values(ENCOUNTERS)) {
      const standing = this.encounters.get(encounter.id)?.size ?? encounter.members.length;
      encountersDown += encounter.members.length - standing;
    }
    return encountersDown + this.waves.one.down.size + this.waves.two.down.size;
  }

  start(beat = B.WAKE) { this._enter(beat); return this; }

  _enter(name) {
    const definition = BEATS[name];
    if (!definition) throw new Error(`Unknown siege beat: ${name}`);
    const prev = this.beat;
    this.beat = name;
    this.time = 0;
    this.history.push(name);
    /* The house state is a property of the beat, so it cannot drift out of
     * step with the fiction the way a manually-called apply() would. */
    if (this.damage.state !== definition.state) this.damage.apply(definition.state);
    this.onBeat?.(name, prev);
    this.onObjective?.(definition.objective, definition.hint ?? null, definition.done === true);
    if (definition.checkpoint) this.saveCheckpoint(definition.checkpoint);
    if (name === B.WAVE_ONE) this.waves.one.begin();
    if (name === B.WAVE_TWO) this.waves.two.begin();
    if (name === B.LULL) this._lull = LULL_SECONDS;
    return name;
  }

  /** The scene's frame tick. Advances anything that advances on its own. */
  update(dt) {
    if (!this.beat) return;
    const step = Math.max(0, Number(dt) || 0);
    this.time += step;
    if (this.beat === B.WAVE_ONE) {
      this.waves.one.update(step);
      if (this.waves.one.cleared) this._enter(B.LULL);
      return;
    }
    if (this.beat === B.LULL) {
      this._lull -= step;
      if (this._lull <= 0) this._enter(B.WAVE_TWO);
      return;
    }
    if (this.beat === B.WAVE_TWO) {
      this.waves.two.update(step);
      if (this.waves.two.cleared) this._enter(B.AFTERMATH);
    }
  }

  /* ---------------------------------------------------------------- */
  /* What the player did                                                */
  /* ---------------------------------------------------------------- */

  /** The wake-up animation finished and the player has control. */
  wokeUp() {
    if (this.beat !== B.WAKE) return false;
    this._enter(B.TO_ARMORY);
    return true;
  }

  /** The player crossed into BASEMENT_ROOM. */
  enteredArmory() {
    if (this.beat !== B.TO_ARMORY) return false;
    this._enter(B.ARM);
    return true;
  }

  /** The player took one real weapon from the basement armory. */
  weaponTaken(id) {
    if (this.beat !== B.ARM || typeof id !== 'string' || id.length === 0) return false;
    this._enter(B.TO_OFFICE);
    this.saveCheckpoint('armed');
    return true;
  }

  /** The player crossed into OFFICE. */
  enteredOffice() {
    if (this.beat !== B.TO_OFFICE) return false;
    this._enter(B.BRIEFING);
    return true;
  }

  /** Lou finished talking. */
  briefingEnded() {
    if (this.beat !== B.BRIEFING) return false;
    this._enter(B.LITTLE_FRIEND);
    return true;
  }

  /**
   * The player is on the landing with a weapon up. Returns true exactly
   * once in a playthrough -- the caller plays the line on true and does
   * nothing on false, so a checkpoint restore cannot replay it.
   */
  sayHello() {
    if (this.beat !== B.LITTLE_FRIEND || this.littleFriendSaid) return false;
    this.littleFriendSaid = true;
    this._enter(B.WAVE_ONE);
    return true;
  }

  /** An attacker went down. Routed to whichever roster owns it. */
  noteDown(id) {
    for (const [encounterId, standing] of this.encounters) {
      if (standing.delete(id)) {
        if (standing.size === 0) this.onBeat?.(`encounter:${encounterId}:cleared`, this.beat);
        return true;
      }
    }
    if (this.waves.one.noteDown(id)) return true;
    if (this.waves.two.noteDown(id)) return true;
    return false;
  }

  /** The player talked to Sasole. */
  metSasole() {
    if (this.beat !== B.TO_SASOLE) return false;
    this._enter(B.COMPLETE);
    return true;
  }

  /** Lou's post-battle conversation ended. */
  aftermathEnded() {
    if (this.beat !== B.AFTERMATH) return false;
    this._enter(B.TO_SASOLE);
    return true;
  }

  get complete() { return this.beat === B.COMPLETE; }

  /* ---------------------------------------------------------------- */
  /* Checkpoints                                                        */
  /* ---------------------------------------------------------------- */

  /** Register the scene's reader/writer pair for one checkpoint field. */
  provide(field, { capture, restore }) {
    if (!CHECKPOINT_FIELDS.includes(field)) {
      throw new Error(`"${field}" is not a checkpoint field`);
    }
    if (typeof capture !== 'function' || typeof restore !== 'function') {
      throw new Error(`Provider for "${field}" needs capture() and restore()`);
    }
    this.providers.set(field, { capture, restore });
    return this;
  }

  /** Fields with no provider yet. Empty is the only shippable answer. */
  missingProviders() {
    return CHECKPOINT_FIELDS.filter((field) => !this.providers.has(field));
  }

  saveCheckpoint(id) {
    const definition = CHECKPOINTS[id];
    if (!definition) throw new Error(`Unknown siege checkpoint: ${id}`);
    const missing = this.missingProviders();
    if (missing.length) {
      throw new Error(`Checkpoint "${id}" cannot save without: ${missing.join(', ')}`);
    }
    const scene = {};
    for (const [field, provider] of this.providers) scene[field] = provider.capture();
    this.checkpoint = {
      id,
      beat: definition.beat,
      damage: this.damage.snapshot(),
      littleFriendSaid: this.littleFriendSaid,
      waves: {
        one: this.waves.one.snapshot(),
        two: this.waves.two.snapshot(),
      },
      encounters: Object.fromEntries(
        [...this.encounters].map(([key, set]) => [key, [...set]]),
      ),
      scene,
    };
    this.onCheckpoint?.(id);
    return this.checkpoint;
  }

  /**
   * Put the mission back where the checkpoint left it.
   *
   * Order matters: waves and encounters first, so that re-entering the beat
   * cannot re-begin a wave that was already half fought, then the beat, then
   * the scene's own fields on top.
   */
  restoreCheckpoint(snapshot = this.checkpoint) {
    if (!snapshot) return false;
    this.damage.restore(snapshot.damage);
    this.littleFriendSaid = snapshot.littleFriendSaid === true;
    this.waves.one.restore(snapshot.waves.one);
    this.waves.two.restore(snapshot.waves.two);
    this.encounters = new Map(Object.entries(snapshot.encounters)
      .map(([key, ids]) => [key, new Set(ids)]));
    const definition = BEATS[snapshot.beat];
    const prev = this.beat;
    this.beat = snapshot.beat;
    this.time = 0;
    this.history.push(snapshot.beat);
    if (this.damage.state !== definition.state) this.damage.apply(definition.state);
    this.onBeat?.(snapshot.beat, prev);
    this.onObjective?.(definition.objective, definition.hint ?? null, definition.done === true);
    if (snapshot.beat === B.LULL) this._lull = LULL_SECONDS;
    for (const [field, provider] of this.providers) {
      provider.restore(snapshot.scene[field]);
    }
    return true;
  }
}

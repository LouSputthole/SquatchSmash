/**
 * One gun's state: what is in it, what is left, and where it is in a reload.
 *
 * Deliberately free of THREE, of the AudioEngine and of the DOM, so the rules
 * below can be read and tested without building a scene. `WeaponSystem.js`
 * is what turns these events into a magazine falling on a concrete floor.
 *
 * WHY NOT `core/combat/weapon.js`. That class still exists but no production
 * scene runs on it any more — THE TAKE, its last consumer, now mounts this
 * class behind the `HeistFirearm` compatibility Adapter in
 * `src/heist/combat.js`. The old class modelled a reload as one timer and
 * ammunition as a count of whole magazines. This one has to answer two
 * questions that one deliberately does not:
 *
 *   1. WHEN does the magazine leave the gun? A reload that ejects at the start
 *      and a reload that ejects at the end look completely different, and the
 *      owner asked for the magazine to come out and fall. So a reload here is
 *      two phases with the ejection between them.
 *   2. WHAT happens to the rounds still in it? On every box-fed gun in the
 *      catalog they go on the floor with the magazine, because they do. On the
 *      revolver they do not, because a speedloader tops up what the ejector rod
 *      dumps and nobody throws live .45 away.
 *
 * EVENTS. `fire()` and `reload()` answer immediately; everything with a
 * duration comes out of `update(dt)` as a list, in the order it happened:
 *
 *   {type:'eject',  rounds}   the magazine has just left the gun. `rounds` is
 *                             how many were still in it — that is what the
 *                             player lost, and on the revolver it is how many
 *                             cases hit the floor.
 *   {type:'loaded', loaded}   a fresh magazine is seated and the gun is ready.
 *   {type:'cycle', kind}      a timed action completed after a shot; the pump
 *                             shotgun reports one ejected shell here.
 *
 * The dry click is not one of these: it is a REFUSAL, not something that
 * happens on a timer, so it comes back from `fire()` as `reason: 'empty'` —
 * once per trigger pull, whatever else the trigger is doing.
 */
import { weaponDef } from './catalog.js';

export const READY = 'ready';
export const RELOAD_OUT = 'reload-out';
export const RELOAD_IN = 'reload-in';

export class Firearm {
  /**
   * @param {string|object} definition catalog id, or a definition object.
   * @param {object} [o]
   * @param {number} [o.rounds]  rounds in the magazine at pickup (default full)
   * @param {number} [o.reserve] loose rounds carried (default the catalog's)
   */
  constructor(definition, { rounds = null, reserve = null } = {}) {
    const def = typeof definition === 'string' ? weaponDef(definition) : definition;
    if (!def) throw new Error(`unknown weapon "${definition}"`);
    this.def = def;
    this.id = def.id;
    this.capacity = def.capacity;
    this.rounds = rounds === null ? def.capacity : Math.max(0, Math.min(def.capacity, rounds));
    this.reserve = reserve === null ? def.reserve : Math.max(0, reserve);
    this.state = READY;
    this.timer = 0;
    /** Rounds fired since the last reload — the revolver's case count. */
    this.spent = 0;
    /** Rounds fired ever, by this instance. Drives the tracer interval. */
    this.shots = 0;
    this.cooldown = 0;
    this.recoil = 0;
    /* A pump cycle is a timed presentation event, independent of the reload
     * state. It is transient for the same reason recoil is transient. */
    this._cycleTimer = 0;
    this._cyclePending = false;
    this.triggerHeld = false;
    /* A semi-automatic will not fire again until the trigger is released.
     * Without this, "click to fire" on a 5.5 rps pistol is a 5.5 rps pistol
     * for as long as the button is down, which is not a semi-automatic. */
    this._triggerConsumed = false;
    /* And an EMPTY gun clicks once per pull whether it is automatic or not.
     * Without this an emptied SAW reports 'empty' on every frame the trigger
     * is down, and thirteen dry clicks a second is not a dry click. */
    this._clicked = false;
  }

  get reloading() { return this.state !== READY; }

  get empty() { return this.rounds <= 0; }

  /** Nothing in the gun and nothing to put in it. */
  get dead() { return this.rounds <= 0 && this.reserve <= 0; }

  /** Whether the next round out of this gun is a tracer. */
  get nextIsTracer() {
    const every = Math.max(1, this.def.tracer.every | 0);
    return (this.shots % every) === 0;
  }

  setTrigger(down) {
    this.triggerHeld = down === true;
    if (!this.triggerHeld) {
      this._triggerConsumed = false;
      this._clicked = false;
    }
  }

  /**
   * Pull the trigger once.
   *
   * @returns {{fired:boolean, reason?:string, tracer?:boolean, rounds?:number}}
   *   `reason` is 'reloading' | 'cooldown' | 'empty' | 'semi' | 'clicked'.
   *   'empty' is the one a scene turns into the dry click, and it is returned
   *   exactly once per trigger pull; every frame after that on the same pull
   *   is 'clicked'. The others are silent too, because a gun that clicks every
   *   frame you hold a dead trigger is unbearable.
   */
  fire(spreadOptions = {}) {
    if (this.state !== READY) return { fired: false, reason: 'reloading' };
    if (!this.def.auto && this._triggerConsumed) return { fired: false, reason: 'semi' };
    if (this.cooldown > 0) return { fired: false, reason: 'cooldown' };
    if (this.rounds <= 0) {
      this._triggerConsumed = true;
      if (this._clicked) return { fired: false, reason: 'clicked' };
      this._clicked = true;
      return { fired: false, reason: 'empty' };
    }
    const tracer = this.nextIsTracer;
    this.rounds--;
    this.spent++;
    this.shots++;
    this._triggerConsumed = true;
    this.cooldown = 1 / Math.max(0.05, this.def.rps);
    this.recoil = Math.min(1, this.recoil + this.def.recoil * 6);
    const cycleSeconds = Math.max(0, Number(this.def.cycleSeconds) || 0);
    if (cycleSeconds > 0) {
      this._cycleTimer = cycleSeconds;
      this._cyclePending = true;
    }
    return {
      fired: true,
      tracer,
      rounds: this.rounds,
      projectiles: Math.max(1, Math.trunc(Number(this.def.projectiles) || 1)),
      spread: this.spreadNow(spreadOptions),
    };
  }

  /**
   * The cone the next round leaves in, widened by recoil and suppression.
   * Calling with no options preserves the original hip-fire cone exactly.
   */
  spreadNow(options = {}) {
    const { aimed = false, aimStability = 1 } = options || {};
    const stability = Math.max(0, Math.min(
      1,
      Number.isFinite(Number(aimStability)) ? Number(aimStability) : 1,
    ));
    const adsMultiplier = aimed === true ? 0.48 : 1;
    const suppressionMultiplier = 1 + (1 - stability) * 1.8;
    return this.def.spread
      * (1 + this.recoil * 1.4)
      * adsMultiplier
      * suppressionMultiplier;
  }

  /**
   * Add loose rounds without exceeding this weapon's catalog carry limit.
   * @returns {number} the number of rounds actually accepted.
   */
  resupply(amount) {
    const requested = Math.max(0, Math.trunc(Number(amount) || 0));
    const maximum = Math.max(0, Math.trunc(Number(this.def.reserve) || 0));
    const space = Math.max(0, maximum - this.reserve);
    const added = Math.min(space, requested);
    if (added <= 0) return 0;
    this.reserve += added;
    return added;
  }

  /**
   * Start a reload.
   *
   * @returns {boolean} whether one actually started. Refused when one is
   *   already running, when the gun is full, or when there is nothing left to
   *   put in it.
   */
  reload() {
    if (this.state !== READY) return false;
    if (this.reserve <= 0) return false;
    if (this.rounds >= this.capacity) return false;
    this.state = RELOAD_OUT;
    this.timer = this.def.reloadOut;
    return true;
  }

  /** Cancel a reload in progress — a scene stows the gun mid-reload. */
  cancelReload() {
    if (this.state === READY) return false;
    /* Only a reload that has not yet ejected can be taken back. Once the
     * magazine is on the floor it is on the floor. */
    const wasOut = this.state === RELOAD_OUT;
    this.state = READY;
    this.timer = 0;
    if (!wasOut) {
      // Ejected but not reloaded: the gun is genuinely empty until you finish.
      this.rounds = 0;
    }
    return true;
  }

  /**
   * @param {number} dt seconds
   * @returns {Array<object>} events, in order
   */
  update(dt) {
    const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    const events = [];
    this.cooldown = Math.max(0, this.cooldown - step);
    this.recoil = Math.max(0, this.recoil - step * 2.6);
    if (this._cyclePending) {
      this._cycleTimer = Math.max(0, this._cycleTimer - step);
      if (this._cycleTimer <= 0) {
        this._cyclePending = false;
        const kind = this.def.cycleEject ?? 'action';
        if (this.def.cycleEject) this.spent = Math.max(0, this.spent - 1);
        events.push({ type: 'cycle', kind, rounds: this.def.cycleEject ? 1 : 0 });
      }
    }
    if (this.state === READY) return events;

    this.timer -= step;
    if (this.timer > 0) return events;

    if (this.state === RELOAD_OUT) {
      const carried = this.rounds;
      /* The magazine leaves. On a box-fed gun whatever was in it leaves with
       * it; on the revolver the ejector rod dumps the SPENT cases and the
       * unfired rounds are kept and re-seated by the loader. */
      const droppedRounds = this.def.partialLoss ? carried : this.spent;
      if (this.def.partialLoss) this.rounds = 0;
      events.push({ type: 'eject', rounds: droppedRounds, kind: this.def.eject });
      this.state = RELOAD_IN;
      this.timer += this.def.reloadIn;
      if (this.timer < 0) this.timer = 0;
      return events;
    }

    // RELOAD_IN finished: seat what the reserve can give.
    const need = this.capacity - this.rounds;
    const taken = Math.min(need, this.reserve);
    this.reserve -= taken;
    this.rounds += taken;
    this.spent = 0;
    this.state = READY;
    this.timer = 0;
    this._triggerConsumed = this.triggerHeld;
    this._clicked = false;
    events.push({ type: 'loaded', loaded: taken, rounds: this.rounds });
    return events;
  }

  /** Everything a HUD needs, in one object. */
  snapshot() {
    return {
      id: this.id,
      name: this.def.name,
      short: this.def.short,
      rounds: this.rounds,
      capacity: this.capacity,
      reserve: this.reserve,
      state: this.state,
      reloading: this.reloading,
      empty: this.empty,
      auto: this.def.auto,
      shots: this.shots,
    };
  }

  /**
   * Restore durable ammunition into a newly-mounted scene or checkpoint.
   * Reload timers and held-trigger latches are presentation-local transients;
   * carrying a gun through a scene seam must never resume half a reload or
   * fire because the previous page closed while the mouse was down.
   */
  restore(snapshot = {}) {
    if (snapshot.id && snapshot.id !== this.id) return false;
    const rounds = Number.isFinite(snapshot.rounds) ? Math.trunc(snapshot.rounds) : this.rounds;
    const reserve = Number.isFinite(snapshot.reserve) ? Math.trunc(snapshot.reserve) : this.reserve;
    this.rounds = Math.max(0, Math.min(this.capacity, rounds));
    this.reserve = Math.max(0, reserve);
    this.shots = Math.max(0, Math.trunc(Number(snapshot.shots) || 0));
    this.state = READY;
    this.timer = 0;
    this.spent = 0;
    this.cooldown = 0;
    this.recoil = 0;
    this._cycleTimer = 0;
    this._cyclePending = false;
    this.triggerHeld = false;
    this._triggerConsumed = false;
    this._clicked = false;
    return true;
  }
}

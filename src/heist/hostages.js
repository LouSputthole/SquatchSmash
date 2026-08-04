/**
 * The people on the floor of Cumberland Fidelity & Trust.
 *
 * THE TAKE had sixteen figures and one verb: an "ORDER LOBBY DOWN" button that
 * put every one of them into the same pose at the same instant and then never
 * looked at them again. A bank robbery where the civilians are furniture is not
 * a bank robbery.
 *
 * This is the model half — no Three.js, no DOM, so the whole loop is testable.
 * `./level.js` builds the figures and `main.js` wires the verbs to keys.
 *
 * The loop, in the order a player meets it:
 *
 *   1. You point a gun at somebody. They see it and they beg. (`aim`)
 *   2. You can talk them down — the bank's money, not theirs. (`reassure`)
 *   3. You can take what they have on them instead. (`demand`)
 *   4. You can put them on the floor. (`order`)
 *   5. You can zip-tie them, and then they stay there. (`restrain`)
 *
 * And the thing that makes it a system rather than a menu: anybody who is not
 * restrained is still a person with their own nerve. Left alone they recover,
 * stand up, and start looking for the door or the foot switch under the teller
 * counter. Control is something you spend the clock holding, not a button you
 * pressed once in the lobby.
 */

export const HOSTAGE_STATES = Object.freeze([
  'ambient', 'startled', 'pleading', 'kneeling', 'prone',
  'restrained', 'bolting', 'alarm', 'down',
]);

/** States in which a person is no longer a risk to the job. */
export const CONTROLLED_STATES = Object.freeze(['prone', 'restrained', 'down']);

/** How long a person will hold a pose you put them in, before nerve returns. */
const COMPLIANCE_DECAY = 0.055;

/** Aim pressure needed before somebody notices the muzzle and reacts. */
const AIM_THRESHOLD = 0.22;

export class Hostage {
  /**
   * @param {object} o
   *   id        stable id, used by the figure and the checkpoint
   *   nerve     0 calm, 1 the one who is going to be a problem
   *   valuables dollars on their person
   *   anchor    where they belong in the lobby
   */
  constructor({ id, nerve = 0.5, valuables = 0, anchor = null, role = 'customer' }) {
    if (!id) throw new Error('Hostage requires an id');
    this.id = id;
    this.nerve = Math.max(0, Math.min(1, nerve));
    this.valuables = Math.max(0, Math.round(valuables));
    this.anchor = anchor;
    this.role = role;
    this.state = 'ambient';
    this.panic = 0;
    this.compliance = 0;
    this.aimPressure = 0;
    this.reassured = false;
    this.robbed = false;
    this.restrained = false;
    this.down = false;
    this.noticedAim = false;
    /** Seconds this person has been unattended and free to make a decision. */
    this.unwatched = 0;
    /** Seconds of continuous drift toward a door or an alarm. */
    this.driftFor = 0;
  }

  get controlled() { return CONTROLLED_STATES.includes(this.state); }
  get interactive() { return !this.down && !this.restrained; }

  /**
   * A muzzle is on this person.
   * @returns {string|null} 'plead' the first time they react, else null.
   */
  aim(dt, { distance = 6, aimedDownSights = false } = {}) {
    if (this.down || this.restrained) return null;
    const proximity = 1 - Math.max(0, Math.min(1, distance / 14));
    this.aimPressure = Math.min(1, this.aimPressure
      + Math.max(0, dt) * (0.9 + proximity * 1.4) * (aimedDownSights ? 1.5 : 1));
    this.unwatched = 0;
    if (this.aimPressure < AIM_THRESHOLD) return null;
    this.compliance = Math.min(1, this.compliance + Math.max(0, dt) * 0.5);
    this.panic = Math.min(1, this.panic + Math.max(0, dt) * 0.28 * (1 - (this.reassured ? 0.7 : 0)));
    if (this.state === 'ambient' || this.state === 'startled'
      || this.state === 'bolting' || this.state === 'alarm') {
      this.state = 'pleading';
    }
    if (this.noticedAim) return null;
    this.noticedAim = true;
    return 'plead';
  }

  /** Nobody is looking at this person this frame. */
  release(dt) {
    this.aimPressure = Math.max(0, this.aimPressure - Math.max(0, dt) * 0.35);
    this.unwatched += Math.max(0, dt);
  }

  /**
   * "We are here for the bank's money. Not yours."
   * @returns {{ok: boolean, response: string}}
   */
  reassure() {
    if (this.down) return { ok: false, response: 'none' };
    if (this.restrained) return { ok: true, response: 'reassured_tied' };
    this.reassured = true;
    this.panic = Math.max(0, this.panic - 0.45);
    this.compliance = Math.min(1, this.compliance + 0.3);
    this.driftFor = 0;
    if (this.state === 'bolting' || this.state === 'alarm') this.state = 'pleading';
    return { ok: true, response: this.nerve > 0.66 ? 'reassured_hard' : 'reassured' };
  }

  /**
   * "Wallet. On the floor."
   *
   * Refused by anybody who is not already frightened of you — which is the
   * point: robbing the customers costs you the time you spent making them
   * calm, and the money is the kind the crew came in specifically not to take.
   *
   * @returns {{ok: boolean, amount: number, response: string}}
   */
  demand() {
    if (this.down || this.robbed) {
      return { ok: false, amount: 0, response: this.robbed ? 'already_robbed' : 'none' };
    }
    const willing = this.compliance + this.panic * 0.4 - this.nerve * 0.35;
    if (willing < 0.35) return { ok: false, amount: 0, response: 'refuses' };
    this.robbed = true;
    this.reassured = false;
    this.panic = Math.min(1, this.panic + 0.22);
    return { ok: true, amount: this.valuables, response: 'hands_over' };
  }

  /** "On the floor." A tap puts them on their knees, again puts them flat. */
  order() {
    if (this.down || this.restrained) return { ok: false, state: this.state };
    this.compliance = Math.min(1, this.compliance + 0.42);
    this.driftFor = 0;
    if (this.state === 'prone') return { ok: true, state: 'prone' };
    this.state = this.state === 'kneeling' ? 'prone' : 'kneeling';
    if (this.compliance >= 0.8) this.state = 'prone';
    return { ok: true, state: this.state };
  }

  /** Zip ties. Permanent, and the only thing that actually ends a person's turn. */
  restrain() {
    if (this.down) return { ok: false, reason: 'down' };
    if (this.restrained) return { ok: false, reason: 'already' };
    if (this.state !== 'prone' && this.state !== 'kneeling') {
      return { ok: false, reason: 'not_down' };
    }
    this.restrained = true;
    this.state = 'restrained';
    this.panic = Math.max(0, this.panic - 0.2);
    this.compliance = 1;
    this.driftFor = 0;
    return { ok: true, reason: 'tied' };
  }

  /** A round landed on this person. */
  fell() {
    if (this.down) return false;
    this.down = true;
    this.state = 'down';
    this.compliance = 1;
    return true;
  }

  /** Gunfire anywhere in the room. */
  startle(intensity = 0.4) {
    if (this.down || this.restrained) return;
    this.panic = Math.min(1, this.panic + intensity * (1.15 - this.compliance * 0.5));
    if (this.state === 'ambient') this.state = 'startled';
  }

  /**
   * @param {number} dt
   * @param {object} room
   *   control  0..1 how much of the lobby is already flat
   *   covered  a crew weapon is on this part of the room
   * @returns {string|null} 'bolting' or 'alarm' at the moment it happens
   */
  update(dt, { control = 0, covered = false } = {}) {
    const step = Math.max(0, dt);
    if (this.down || this.restrained) return null;
    this.panic = Math.max(0, this.panic - step * 0.09);
    const pressure = (covered ? 0.5 : 0) + control * 0.35 + (this.reassured ? 0.15 : 0);
    this.compliance = Math.max(0, this.compliance
      - step * COMPLIANCE_DECAY * (1 + this.nerve) * (1 - Math.min(0.9, pressure)));

    /* Somebody who has been left alone, is not flat on the floor, and still
     * has their nerve will eventually do something about it. Panic pushes them
     * at the door; a cool head pushes them at the alarm, which is worse. */
    /* The pacing is deliberate: the most nervous person in the room needs about
     * nine seconds of being ignored before they move, and somebody who was put
     * on the floor has to shed their compliance first, which is another seven.
     * Fast enough that the lobby is a clock; slow enough that a player working
     * the room one person at a time is not punished for taking his time. */
    const loose = this.state !== 'prone' && this.compliance < 0.34 && this.unwatched > 5;
    if (!loose) { this.driftFor = Math.max(0, this.driftFor - step); return null; }
    this.driftFor += step * (0.6 + this.nerve);
    if (this.driftFor < 6) return null;
    this.driftFor = 0;
    const next = this.panic > 0.55 ? 'bolting' : 'alarm';
    if (this.state === next) return null;
    this.state = next;
    return next;
  }

  capture() {
    return {
      id: this.id, state: this.state, panic: this.panic, compliance: this.compliance,
      aimPressure: this.aimPressure, reassured: this.reassured, robbed: this.robbed,
      restrained: this.restrained, down: this.down, noticedAim: this.noticedAim,
      unwatched: this.unwatched, driftFor: this.driftFor, valuables: this.valuables,
    };
  }

  restore(record = {}) {
    if (record.id && record.id !== this.id) throw new Error('Hostage snapshot mismatch');
    this.state = HOSTAGE_STATES.includes(record.state) ? record.state : 'ambient';
    this.panic = Number(record.panic) || 0;
    this.compliance = Number(record.compliance) || 0;
    this.aimPressure = Number(record.aimPressure) || 0;
    this.reassured = record.reassured === true;
    this.robbed = record.robbed === true;
    this.restrained = record.restrained === true;
    this.down = record.down === true;
    this.noticedAim = record.noticedAim === true;
    this.unwatched = Number(record.unwatched) || 0;
    this.driftFor = Number(record.driftFor) || 0;
    if (Number.isFinite(record.valuables)) this.valuables = record.valuables;
  }

  reset() {
    this.state = 'ambient';
    this.panic = 0;
    this.compliance = 0;
    this.aimPressure = 0;
    this.reassured = false;
    this.robbed = false;
    this.restrained = false;
    this.down = false;
    this.noticedAim = false;
    this.unwatched = 0;
    this.driftFor = 0;
  }
}

/**
 * The lobby as a whole.
 *
 * Owns the roster, the room-level control figure everybody's nerve is measured
 * against, and the events the mission needs to hear about: somebody bolting for
 * the door, somebody reaching for the alarm, somebody being shot.
 */
export class HostageDirector {
  constructor(hostages = []) {
    this.hostages = hostages;
    this.casualties = 0;
    this.robbedCount = 0;
    this.restrainedCount = 0;
    this.alarmAttempts = 0;
    this.escapes = 0;
    this.personalCashTaken = 0;
  }

  get(id) { return this.hostages.find((person) => person.id === id) ?? null; }

  get control() {
    if (!this.hostages.length) return 1;
    const held = this.hostages.filter((person) => person.controlled).length;
    return held / this.hostages.length;
  }

  /** Everybody who can still cause a problem. */
  get loose() {
    return this.hostages.filter((person) => !person.controlled).length;
  }

  startleAll(intensity = 0.5) {
    for (const person of this.hostages) person.startle(intensity);
  }

  demand(id) {
    const person = this.get(id);
    if (!person) return { ok: false, amount: 0, response: 'none' };
    const result = person.demand();
    if (result.ok) {
      this.robbedCount++;
      this.personalCashTaken += result.amount;
    }
    return result;
  }

  restrain(id) {
    const person = this.get(id);
    if (!person) return { ok: false, reason: 'missing' };
    const result = person.restrain();
    if (result.ok) this.restrainedCount++;
    return result;
  }

  fell(id) {
    const person = this.get(id);
    if (!person?.fell()) return false;
    this.casualties++;
    this.startleAll(0.7);
    return true;
  }

  /**
   * Advance everybody who is not being looked at this frame.
   * @param {Set<string>} watched ids currently under a crew muzzle
   * @returns {Array<{id: string, event: string}>}
   */
  update(dt, { watched = new Set(), covered = false } = {}) {
    const events = [];
    const control = this.control;
    for (const person of this.hostages) {
      if (!watched.has(person.id)) person.release(dt);
      const event = person.update(dt, { control, covered });
      if (!event) continue;
      if (event === 'alarm') this.alarmAttempts++;
      if (event === 'bolting') this.escapes++;
      events.push({ id: person.id, event });
    }
    return events;
  }

  summary() {
    return {
      total: this.hostages.length,
      controlled: this.hostages.filter((person) => person.controlled).length,
      restrained: this.hostages.filter((person) => person.restrained).length,
      pleading: this.hostages.filter((person) => person.state === 'pleading').length,
      loose: this.loose,
      casualties: this.casualties,
      robbed: this.robbedCount,
      alarmAttempts: this.alarmAttempts,
      escapes: this.escapes,
      personalCashTaken: this.personalCashTaken,
      control: this.control,
    };
  }

  capture() {
    return {
      casualties: this.casualties,
      robbedCount: this.robbedCount,
      restrainedCount: this.restrainedCount,
      alarmAttempts: this.alarmAttempts,
      escapes: this.escapes,
      personalCashTaken: this.personalCashTaken,
      people: this.hostages.map((person) => person.capture()),
    };
  }

  restore(snapshot = {}) {
    this.casualties = snapshot.casualties ?? 0;
    this.robbedCount = snapshot.robbedCount ?? 0;
    this.restrainedCount = snapshot.restrainedCount ?? 0;
    this.alarmAttempts = snapshot.alarmAttempts ?? 0;
    this.escapes = snapshot.escapes ?? 0;
    this.personalCashTaken = snapshot.personalCashTaken ?? 0;
    for (const [index, record] of (snapshot.people ?? []).entries()) {
      this.hostages[index]?.restore(record);
    }
  }

  reset() {
    this.casualties = 0;
    this.robbedCount = 0;
    this.restrainedCount = 0;
    this.alarmAttempts = 0;
    this.escapes = 0;
    this.personalCashTaken = 0;
    for (const person of this.hostages) person.reset();
  }
}

/**
 * The lobby roster.
 *
 * Twenty-two people, authored rather than rolled: nerve runs from the man who
 * was already on the floor before anybody asked to the teller who has done the
 * training and is thinking about the switch under her till. Personal cash is
 * small — a few hundred each — precisely so that robbing the room is never
 * worth what it costs, which is the whole argument of the scene's scoring.
 */
export function createLobbyHostages() {
  const ROLES = [
    { role: 'teller', nerve: 0.86, valuables: 120 },
    { role: 'customer', nerve: 0.12, valuables: 240 },
    { role: 'customer', nerve: 0.34, valuables: 90 },
    { role: 'customer', nerve: 0.58, valuables: 410 },
    { role: 'clerk', nerve: 0.44, valuables: 60 },
    { role: 'customer', nerve: 0.22, valuables: 180 },
    { role: 'customer', nerve: 0.71, valuables: 320 },
    { role: 'clerk', nerve: 0.29, valuables: 75 },
    { role: 'teller', nerve: 0.79, valuables: 140 },
    { role: 'customer', nerve: 0.06, valuables: 55 },
    { role: 'customer', nerve: 0.48, valuables: 260 },
  ];
  return Array.from({ length: 22 }, (_, index) => {
    const spec = ROLES[index % ROLES.length];
    return new Hostage({
      id: `hostage_${index + 1}`,
      nerve: Math.max(0.04, Math.min(0.95, spec.nerve + (index % 3 - 1) * 0.05)),
      valuables: spec.valuables + (index % 4) * 25,
      anchor: `lobby_${index + 1}`,
      role: spec.role,
    });
  });
}

/**
 * What a squad shares, and how slowly.
 *
 * A blackboard between NPCs on the same side. Information travels by RADIO
 * RULES: a member posts what they saw, and everyone else receives it after
 * a configurable delay and only within shout/radio range — so flanking one
 * guard quietly does not psychically brief the far wing of the mansion.
 *
 * It also owns the tokens that keep a squad from acting like one organism:
 * only so many members may flank at once, only so many may push, and the
 * same cover point cannot be claimed twice.
 */
export class SquadBlackboard {
  /**
   * @param {object} o
   * @param {number} [o.shareDelay]  seconds from seeing to squadmates knowing
   * @param {number} [o.shareRange]  metres a callout carries
   * @param {number} [o.flankBudget] members allowed to flank simultaneously
   * @param {number} [o.pushBudget]  members allowed to advance simultaneously
   */
  constructor({ shareDelay = 1.2, shareRange = 45, flankBudget = 1, pushBudget = 2 } = {}) {
    this.shareDelay = shareDelay;
    this.shareRange = shareRange;
    this.flankBudget = flankBudget;
    this.pushBudget = pushBudget;

    this.members = new Map(); // id -> {x, z, alive, leader}
    this.lastKnown = null; // {x, z, at} — squad's shared belief
    this.pending = []; // sightings in transit: {x, z, from, timer}
    this.incomingFireDir = null; // {x, z} unit-ish vector fire came from
    this.downed = 0;
    this.leaderDown = false;
    this.playerReloading = false;
    this.playerExposed = false;
    this._reloadTimer = 0;
    this._flankers = new Set();
    this._pushers = new Set();
    this._coverClaims = new Map(); // coverId -> memberId
  }

  join(id, { leader = false } = {}) {
    this.members.set(id, { x: 0, z: 0, alive: true, leader });
  }

  updateMember(id, x, z) {
    const m = this.members.get(id);
    if (m) { m.x = x; m.z = z; }
  }

  /** A member confirmed the player with their own eyes. */
  report(id, { x, z }) {
    const m = this.members.get(id);
    if (!m) return;
    this.pending.push({ x, z, fromX: m.x, fromZ: m.z, timer: this.shareDelay });
  }

  /** Rounds came in from a bearing — even without a sighting, share it. */
  reportIncomingFire(dir) { this.incomingFireDir = { ...dir, age: 0 }; }

  reportPlayerReloading() { this.playerReloading = true; this._reloadTimer = 2.2; }

  reportPlayerExposed(exposed) { this.playerExposed = exposed === true; }

  /** A member died. Everyone in range learns, morale layers listen. */
  reportDown(id) {
    const m = this.members.get(id);
    if (!m || !m.alive) return;
    m.alive = false;
    this.downed++;
    if (m.leader) this.leaderDown = true;
    this._flankers.delete(id);
    this._pushers.delete(id);
    for (const [cover, owner] of this._coverClaims) {
      if (owner === id) this._coverClaims.delete(cover);
    }
  }

  get aliveCount() {
    let n = 0;
    for (const m of this.members.values()) if (m.alive) n++;
    return n;
  }

  update(dt) {
    const step = Math.max(0, dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.timer -= step;
      if (p.timer <= 0) {
        this.lastKnown = { x: p.x, z: p.z, at: 0 };
        this.pending.splice(i, 1);
      }
    }
    if (this.lastKnown) {
      this.lastKnown.at += step;
      if (this.lastKnown.at > 30) this.lastKnown = null;
    }
    if (this.incomingFireDir) {
      this.incomingFireDir.age += step;
      if (this.incomingFireDir.age > 8) this.incomingFireDir = null;
    }
    if (this._reloadTimer > 0) {
      this._reloadTimer -= step;
      if (this._reloadTimer <= 0) this.playerReloading = false;
    }
  }

  /** Squad intel a member at (x,z) can actually receive — range-gated. */
  intelFor(id) {
    const m = this.members.get(id);
    if (!m || !this.lastKnown) return null;
    const d = Math.hypot(this.lastKnown.x - m.x, this.lastKnown.z - m.z);
    /* The callout reaches shout range around the CALLER, but we only kept
     * the sighting; range-gate on the sighting itself as a fair proxy. */
    if (d > this.shareRange) return null;
    return { x: this.lastKnown.x, z: this.lastKnown.z, age: this.lastKnown.at };
  }

  /* ----- tokens ---------------------------------------------------- */

  requestFlank(id) {
    if (this._flankers.has(id)) return true;
    if (this._flankers.size >= this.flankBudget) return false;
    this._flankers.add(id);
    return true;
  }

  releaseFlank(id) { this._flankers.delete(id); }

  requestPush(id) {
    if (this._pushers.has(id)) return true;
    if (this._pushers.size >= this.pushBudget) return false;
    this._pushers.add(id);
    return true;
  }

  releasePush(id) { this._pushers.delete(id); }

  claimCover(coverId, memberId) {
    const owner = this._coverClaims.get(coverId);
    if (owner && owner !== memberId) return false;
    this._coverClaims.set(coverId, memberId);
    return true;
  }

  releaseCover(coverId, memberId) {
    if (this._coverClaims.get(coverId) === memberId) this._coverClaims.delete(coverId);
  }

  coverOwner(coverId) { return this._coverClaims.get(coverId) ?? null; }

  snapshot() {
    return {
      lastKnown: this.lastKnown ? { ...this.lastKnown } : null,
      downed: this.downed,
      leaderDown: this.leaderDown,
    };
  }

  restore(s) {
    if (!s) return;
    this.lastKnown = s.lastKnown ? { ...s.lastKnown } : null;
    this.downed = s.downed ?? 0;
    this.leaderDown = s.leaderDown === true;
    this.pending.length = 0;
    this._flankers.clear();
    this._pushers.clear();
    this._coverClaims.clear();
  }
}

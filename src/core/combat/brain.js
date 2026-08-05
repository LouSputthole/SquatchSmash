/**
 * One NPC's combat mind.
 *
 * The same deferred-transition state table every mission FSM in this repo
 * uses (`go()` queues, current state's update runs first, `history[]` for
 * verifiers) — but per-combatant, driving INTENT rather than presentation:
 *
 *   { move: {x,z,run,crouch}|null, aimAt: {x,z}|null, fire, suppressing,
 *     crouch, peeking, state }
 *
 * The body (`combatant.js`) executes intent with real collision stepping and
 * real line-of-fire rays; the brain never teleports anyone and never shoots
 * through a wall — it can only ask to aim at what perception actually offers:
 * a seen player, or a LAST KNOWN point that ages and dies.
 *
 * States: unaware, suspicious, investigating, alerted, seekingCover,
 * inCover, firing, repositioning, flanking, suppressed, retreating,
 * surrendering, searching, dead.
 *
 * Roles bend the weights, not the machine: a rusher pushes where a cover
 * shooter peeks, a flanker spends the squad's flank token, a machine gunner
 * suppresses last-known positions, a marksman keeps his band. One brain,
 * ten temperaments — the owner's "roles should not require separate AI
 * implementations".
 */
import { ROLES } from './archetypes.js';

const S = Object.freeze({
  UNAWARE: 'unaware',
  SUSPICIOUS: 'suspicious',
  INVESTIGATING: 'investigating',
  ALERTED: 'alerted',
  SEEKING_COVER: 'seekingCover',
  IN_COVER: 'inCover',
  FIRING: 'firing',
  REPOSITIONING: 'repositioning',
  FLANKING: 'flanking',
  SUPPRESSED: 'suppressed',
  RETREATING: 'retreating',
  SURRENDERING: 'surrendering',
  SEARCHING: 'searching',
  DEAD: 'dead',
});

export const BRAIN_STATES = S;

export class CombatBrain {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {object} o.archetype   archetypes.js row
   * @param {object} o.perception  Perception
   * @param {object} o.morale      MoraleModel
   * @param {object} o.suppression SuppressionModel
   * @param {object} [o.squad]     SquadBlackboard
   * @param {object} [o.cover]     CoverField
   * @param {Array}  [o.retreatPoints] [{x,z}]
   * @param {object} [o.difficulty] config.js profile
   * @param {()=>number} [o.rng]
   */
  constructor({
    id, archetype, perception, morale, suppression,
    squad = null, cover = null, retreatPoints = [], difficulty = null, rng = Math.random,
  }) {
    this.id = id;
    this.arch = archetype;
    this.perception = perception;
    this.morale = morale;
    this.suppression = suppression;
    this.squad = squad;
    this.cover = cover;
    this.retreatPoints = retreatPoints;
    this.difficulty = difficulty;
    this.rng = rng;

    this.name = S.UNAWARE;
    this.pending = null;
    this.history = [S.UNAWARE];
    this.timeIn = 0;
    this.coverPoint = null;
    this.flankTarget = null;
    this.moveGoal = null;
    this.peek = { exposed: false, timer: this._hideTime() };
    this.intent = emptyIntent(S.UNAWARE);
    this.stuckTime = 0;
  }

  go(state) {
    if (state !== this.name) this.pending = state;
  }

  is(...names) { return names.includes(this.pending ?? this.name) || names.includes(this.name); }

  /** The body took a hit. */
  onDamaged({ direction = null, staggered = false } = {}) {
    if (this.name === S.DEAD) return;
    this.morale.note('hit');
    this.perception.confidence = Math.max(this.perception.confidence, 0.7);
    if (direction && !this.perception.lastKnown) {
      // Blood tells you the bearing even when your eyes did not.
      this.perception.investigate = { x: direction.x, z: direction.z, priority: 0.9, age: 0 };
    }
    if (staggered && this.name !== S.SUPPRESSED) this.go(S.SEEKING_COVER);
    else if (this.is(S.UNAWARE, S.SUSPICIOUS, S.INVESTIGATING)) this.go(S.ALERTED);
  }

  die() {
    this.name = S.DEAD;
    this.pending = null;
    this.history.push(S.DEAD);
    this._releaseTokens();
    this.intent = emptyIntent(S.DEAD);
  }

  /**
   * @param {number} dt
   * @param {object} ctx {me:{x,z,heading}, player:{x,z,moving,crouched},
   *   stuck:boolean, playerDead:boolean}
   * @returns intent
   */
  update(dt, ctx) {
    if (this.name === S.DEAD) return this.intent;
    const step = Math.max(0, dt);
    this.timeIn += step;
    this.stuckTime = ctx.stuck ? this.stuckTime + step : 0;

    const per = this.perception;
    const known = per.lastKnown ?? (this.squad ? this.squad.intelFor(this.id) : null);
    const dist = known ? Math.hypot(known.x - ctx.me.x, known.z - ctx.me.z) : Infinity;

    // Global overrides, in priority order.
    if (this.morale.surrendered && this.name !== S.SURRENDERING) this.go(S.SURRENDERING);
    else if (this._shouldBreak() && !this.is(S.RETREATING, S.SURRENDERING)) this.go(S.RETREATING);
    else if (this.suppression.value > this._suppressionBreak()
      && !this.is(S.SUPPRESSED, S.RETREATING, S.SURRENDERING, S.UNAWARE)) {
      this.go(S.SUPPRESSED);
    }

    const intent = emptyIntent(this.name);
    this[`_${this.name}`]?.(step, ctx, { known, dist, intent });

    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this._enter(next, ctx);
    }
    intent.state = this.name;
    this.intent = intent;
    return intent;
  }

  /* ---------------- state behaviours -------------------------------- */

  _unaware(dt, ctx, { intent }) {
    if (this.perception.reacted) { this._shareSighting(ctx); this.go(S.ALERTED); return; }
    if (this.perception.suspicious || this.perception.investigate) this.go(S.SUSPICIOUS);
    intent.move = null; // patrol/idle stays the Npc job's business
  }

  _suspicious(dt, ctx, { intent }) {
    if (this.perception.reacted) { this._shareSighting(ctx); this.go(S.ALERTED); return; }
    const spot = this.perception.investigate;
    if (spot && this.timeIn > this.arch.skill.reaction * this._reactionScale()) {
      this.go(S.INVESTIGATING);
      return;
    }
    if (!spot && !this.perception.suspicious && this.timeIn > 4) this.go(S.UNAWARE);
    // Stand and look toward the worry.
    if (spot) intent.aimAt = { x: spot.x, z: spot.z };
  }

  _investigating(dt, ctx, { intent }) {
    if (this.perception.reacted) { this._shareSighting(ctx); this.go(S.ALERTED); return; }
    const spot = this.perception.investigate;
    if (!spot) { this.go(this.perception.suspicious ? S.SUSPICIOUS : S.UNAWARE); return; }
    const d = Math.hypot(spot.x - ctx.me.x, spot.z - ctx.me.z);
    if (d < 1.6 || this.timeIn > 14) {
      this.perception.investigate = null;
      this.go(S.SEARCHING);
      return;
    }
    intent.move = { x: spot.x, z: spot.z, run: false, crouch: false };
    intent.aimAt = { x: spot.x, z: spot.z };
  }

  _alerted(dt, ctx, { known, intent }) {
    this._shareSighting(ctx);
    // React, then pick a fight posture by role.
    if (this.timeIn < this.arch.skill.reaction * this._reactionScale()) {
      if (known) intent.aimAt = known;
      return;
    }
    const role = this.arch.role;
    if (role === ROLES.RUSHER && this._aggression() > 0.6) { this.go(S.REPOSITIONING); return; }
    if (role === ROLES.FLANKER && this.squad?.requestFlank(this.id)) { this.go(S.FLANKING); return; }
    this.go(S.SEEKING_COVER);
  }

  _seekingCover(dt, ctx, { known, intent }) {
    if (!this.coverPoint) {
      const threat = known ?? { x: ctx.player.x, z: ctx.player.z };
      /* Refuse only cover nearly on top of the threat — a room is 5 m wide,
       * and a crate 5 m from the player is exactly what indoor cover IS. */
      this.coverPoint = this.cover?.query({
        from: ctx.me, threat, claimBy: this.id, squad: this.squad,
        maxDist: 20, minThreatDist: Math.min(3.5, this.arch.engage.near * 0.5),
      }) ?? null;
      if (!this.coverPoint) { this.go(known ? S.FIRING : S.SEARCHING); return; }
    }
    const d = Math.hypot(this.coverPoint.x - ctx.me.x, this.coverPoint.z - ctx.me.z);
    if (d < 0.7) { this.go(S.IN_COVER); return; }
    if (this.stuckTime > 1.2 || this.timeIn > 8) {
      // Bad point. Let it go and fight from here rather than orbit a crate.
      this._releaseCover();
      this.go(known ? S.FIRING : S.SEARCHING);
      return;
    }
    intent.move = { x: this.coverPoint.x, z: this.coverPoint.z, run: true, crouch: false };
    if (known && this.perception.seeing) intent.aimAt = known;
  }

  _inCover(dt, ctx, { known, dist, intent }) {
    if (!this.coverPoint) { this.go(S.SEEKING_COVER); return; }
    if (this.coverPoint.compromised > 0.7) {
      this._releaseCover();
      this.go(S.REPOSITIONING);
      return;
    }
    if (!known && this.timeIn > 6) { this._releaseCover(); this.go(S.SEARCHING); return; }

    // The peek cycle: hide, rise, fire, drop. Suppression stretches hiding.
    this.peek.timer -= dt;
    if (this.peek.timer <= 0) {
      this.peek.exposed = !this.peek.exposed;
      this.peek.timer = this.peek.exposed ? this._exposeTime() : this._hideTime();
    }
    const low = this.coverPoint.height === 'low';
    intent.crouch = low ? !this.peek.exposed : this.rng() < 0.3 ? !this.peek.exposed : false;
    intent.peeking = this.peek.exposed;
    if (this.peek.exposed && known) {
      intent.aimAt = known;
      intent.fire = this.perception.seeing
        || (this.squad?.playerReloading === false && this._suppressor() && (known.age ?? 0) < 4);
      intent.suppressing = !this.perception.seeing && intent.fire;
    }
    // The player is reloading and close: the pushy roles take the moment.
    if (this.squad?.playerReloading && dist < this.arch.engage.far
      && this._aggression() > 0.75 && this.squad.requestPush(this.id)) {
      this._releaseCover();
      this.go(S.REPOSITIONING);
    }
  }

  _firing(dt, ctx, { known, dist, intent }) {
    if (!known) { this.go(S.SEARCHING); return; }
    intent.aimAt = known;
    intent.fire = this.perception.seeing;
    intent.suppressing = !this.perception.seeing && this._suppressor() && (known.age ?? 0) < 3;
    intent.fire = intent.fire || intent.suppressing;
    // Standing in the open is a phase, not a lifestyle.
    if (this.timeIn > 2.5 && this.cover) { this.go(S.SEEKING_COVER); return; }
    if (dist > this.arch.engage.far) intent.move = { x: known.x, z: known.z, run: true, crouch: false };
    else if (dist < this.arch.engage.near && this.arch.role !== ROLES.RUSHER) {
      // Back out of the band, still shooting.
      const away = this._awayFrom(ctx.me, known, 6);
      intent.move = { ...away, run: false, crouch: false };
    }
  }

  _repositioning(dt, ctx, { known, dist, intent }) {
    if (!known) { this.squad?.releasePush(this.id); this.go(S.SEARCHING); return; }
    const band = this.arch.role === ROLES.RUSHER
      ? this.arch.engage.near
      : (this.arch.engage.near + this.arch.engage.far) / 2;
    if (dist <= band + 1) {
      this.squad?.releasePush(this.id);
      this.go(this.cover ? S.SEEKING_COVER : S.FIRING);
      return;
    }
    if (this.stuckTime > 1.4) { this.squad?.releasePush(this.id); this.go(S.SEEKING_COVER); return; }
    intent.move = { x: known.x, z: known.z, run: true, crouch: false };
    if (this.perception.seeing) { intent.aimAt = known; intent.fire = dist < this.arch.engage.far; }
  }

  _flanking(dt, ctx, { known, intent }) {
    if (!known) { this._releaseFlank(); this.go(S.SEARCHING); return; }
    if (!this.flankTarget || this.timeIn > 12 || this.stuckTime > 1.6) {
      this.flankTarget = this._pickFlankPoint(ctx.me, known);
      if (!this.flankTarget) { this._releaseFlank(); this.go(S.SEEKING_COVER); return; }
    }
    const d = Math.hypot(this.flankTarget.x - ctx.me.x, this.flankTarget.z - ctx.me.z);
    if (d < 1.2) {
      this._releaseFlank();
      this.go(S.FIRING);
      return;
    }
    intent.move = { x: this.flankTarget.x, z: this.flankTarget.z, run: true, crouch: false };
    // A flanker holds fire until he is round the corner — that is the point.
    if (this.perception.seeing && this.rng() < 0.2) { intent.aimAt = known; }
  }

  _suppressed(dt, ctx, { known, intent }) {
    // Head down. The world is loud. Aim wobbles somewhere useful at best.
    intent.crouch = true;
    if (known && this.rng() < 0.25) intent.aimAt = known;
    this.morale.note('suppressedHeavily', dt);
    if (this.suppression.value < this._suppressionBreak() * 0.55) {
      this.go(this.coverPoint ? S.IN_COVER : S.SEEKING_COVER);
    }
  }

  _retreating(dt, ctx, { known, intent }) {
    const goal = this._retreatGoal(ctx.me, known);
    if (!goal || Math.hypot(goal.x - ctx.me.x, goal.z - ctx.me.z) < 1.5) {
      if (this.morale.considerSurrender(this.rng)) { this.go(S.SURRENDERING); return; }
      // Rallied at the fallback: fight from here, warily.
      if (this.morale.band !== 'broken') { this.go(S.SEEKING_COVER); return; }
      intent.crouch = true;
      // Broken and cornered: blind fire over whatever is near.
      if (known && this.rng() < 0.1) { intent.aimAt = known; intent.fire = true; intent.suppressing = true; }
      return;
    }
    intent.move = { x: goal.x, z: goal.z, run: true, crouch: false };
  }

  _surrendering(dt, ctx, { intent }) {
    intent.crouch = true;
    intent.surrendered = true;
    // Nothing else. The encounter controller decides what surrender means.
  }

  _searching(dt, ctx, { known, intent }) {
    if (this.perception.reacted) { this._shareSighting(ctx); this.go(S.ALERTED); return; }
    if (known && (known.age ?? 0) < 2) { this.go(S.ALERTED); return; }
    const spot = known ?? this.perception.investigate;
    if (spot) {
      const d = Math.hypot(spot.x - ctx.me.x, spot.z - ctx.me.z);
      if (d > 1.6) { intent.move = { x: spot.x, z: spot.z, run: false, crouch: false }; return; }
    }
    // Sweep near the last idea for a while, then let it go.
    if (this.timeIn > 12) {
      this.perception.confidence = Math.min(this.perception.confidence, 0.2);
      this.go(S.SUSPICIOUS);
      return;
    }
    if (!this.moveGoal || this.timeIn % 4 < dt) {
      const base = spot ?? ctx.me;
      const a = this.rng() * Math.PI * 2;
      this.moveGoal = { x: base.x + Math.sin(a) * 5, z: base.z + Math.cos(a) * 5 };
    }
    intent.move = { x: this.moveGoal.x, z: this.moveGoal.z, run: false, crouch: false };
  }

  /* ---------------- helpers ---------------------------------------- */

  _enter(state, ctx) {
    this.name = state;
    this.timeIn = 0;
    this.history.push(state);
    if (this.history.length > 64) this.history.splice(0, this.history.length - 64);
    if (state === S.SEEKING_COVER) this.coverPoint = null;
    if (state === S.FLANKING) this.flankTarget = null;
    if (state === S.IN_COVER) this.peek = { exposed: false, timer: this._hideTime() * 0.5 };
  }

  _shareSighting(ctx) {
    if (this.squad && this.perception.seeing) {
      this.squad.report(this.id, { x: ctx.player.x, z: ctx.player.z });
    }
  }

  _releaseCover() {
    if (this.coverPoint) this.squad?.releaseCover(this.coverPoint.id, this.id);
    this.coverPoint = null;
  }

  _releaseFlank() { this.squad?.releaseFlank(this.id); this.flankTarget = null; }

  _releaseTokens() {
    this._releaseCover();
    this._releaseFlank();
    this.squad?.releasePush(this.id);
  }

  _reactionScale() { return this.difficulty?.npcReactionScale ?? 1; }

  _aggression() {
    const base = this.morale.band === 'steady' ? 0.8 : this.morale.band === 'shaken' ? 0.45 : 0.15;
    return base * (this.difficulty?.npcAggression ?? 1);
  }

  _suppressor() {
    return this.arch.role === ROLES.MACHINE_GUNNER || this.arch.role === ROLES.COVER_SHOOTER;
  }

  _suppressionBreak() {
    return 0.55 + this.arch.suppressResist * 0.4
      * (this.difficulty?.npcSuppressionResistScale ?? 1);
  }

  _shouldBreak() {
    return this.morale.band === 'broken' && !this.arch.morale.fightToDeath;
  }

  _exposeTime() {
    const shaken = this.morale.band !== 'steady' ? 0.6 : 1;
    return (0.7 + this.rng() * 0.8) * shaken * (1 - this.suppression.value * 0.5);
  }

  _hideTime() {
    const shaken = this.morale.band !== 'steady' ? 1.6 : 1;
    return (0.8 + this.rng() * 1.1) * shaken * (1 + this.suppression.value * 1.6);
  }

  _awayFrom(me, threat, dist) {
    const dx = me.x - threat.x;
    const dz = me.z - threat.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    return { x: me.x + (dx / len) * dist, z: me.z + (dz / len) * dist };
  }

  _pickFlankPoint(me, threat) {
    /* Swing wide of the threat: a point at the threat's range from the
     * flanker, rotated ±70..110° off the direct bearing, biased to the side
     * the flanker is already on so he does not cross the player's muzzle. */
    const dx = threat.x - me.x;
    const dz = threat.z - me.z;
    const dist = Math.max(6, Math.hypot(dx, dz));
    const bearing = Math.atan2(dx, dz);
    const side = Math.sin(bearing) * me.x - Math.cos(bearing) * me.z > 0 ? 1 : -1;
    const swing = (Math.PI / 2) * (0.8 + this.rng() * 0.45) * side;
    const a = bearing + swing;
    return {
      x: threat.x - Math.sin(a) * dist * 0.7,
      z: threat.z - Math.cos(a) * dist * 0.7,
    };
  }

  _retreatGoal(me, known) {
    if (this.retreatPoints.length) {
      // The farthest fallback from the threat that is not past the threat.
      let best = null;
      let bestScore = -Infinity;
      for (const p of this.retreatPoints) {
        const dThreat = known ? Math.hypot(p.x - known.x, p.z - known.z) : 10;
        const dMe = Math.hypot(p.x - me.x, p.z - me.z);
        const score = dThreat * 0.6 - dMe * 0.3;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      return best;
    }
    return known ? this._awayFrom(me, known, 14) : null;
  }

  report() {
    return {
      id: this.id,
      state: this.name,
      history: [...this.history],
      morale: this.morale.value,
      moraleBand: this.morale.band,
      suppression: this.suppression.value,
      confidence: this.perception.confidence,
      lastKnown: this.perception.lastKnown ? { ...this.perception.lastKnown } : null,
      cover: this.coverPoint?.id ?? null,
    };
  }

  snapshot() {
    return {
      state: this.name,
      perception: this.perception.snapshot(),
      morale: this.morale.snapshot(),
    };
  }

  restore(s) {
    if (!s) return;
    this.name = s.state ?? S.UNAWARE;
    this.pending = null;
    this.timeIn = 0;
    this.coverPoint = null;
    this.flankTarget = null;
    this.perception.restore(s.perception);
    this.morale.restore(s.morale);
  }
}

function emptyIntent(state) {
  return {
    move: null, aimAt: null, fire: false, suppressing: false,
    crouch: false, peeking: false, surrendered: false, state,
  };
}

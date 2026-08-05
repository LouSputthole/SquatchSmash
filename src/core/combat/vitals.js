/**
 * One health model for everyone who can be shot.
 *
 * The player and every combat NPC run the same `Vitals` — the owner's rule
 * that specialised characters EXTEND the shared framework rather than
 * reimplementing it. What differs between a goon, an armored heavy and the
 * player is the numbers handed to the constructor, not the arithmetic.
 *
 * `CombatActor` (actors.js) stays untouched — THE TAKE runs on it and its
 * snapshot format is in saved checkpoints. Vitals is the richer model the
 * combat framework fields; the migration note lives in
 * docs/COMBAT-FRAMEWORK.md.
 *
 * Facts, not presentation: Vitals knows nothing about screens, cameras or
 * meshes. It records WHAT happened (damage, direction, source, headshot,
 * helmet save) and the presentation layers read the record.
 */
import { resolveHit } from './damage.js';

export class Vitals {
  /**
   * @param {object} o
   * @param {number} [o.maxHealth]
   * @param {number} [o.vest]        torso armor points
   * @param {number} [o.helmet]      head armor points
   * @param {number} [o.resistance]  0..1 fraction shaved off all damage
   * @param {number} [o.painThreshold] single-hit damage that forces a stagger
   * @param {number} [o.staggerResist] 0..1 chance to ride out a stagger
   * @param {boolean} [o.protectedCore] mission-critical: cannot drop below 1
   * @param {object} [o.regen] {mode:'none'|'partial'|'full', ceiling, delay, rate}
   * @param {number} [o.spawnInvuln] seconds of invulnerability after spawn/restore
   * @param {()=>number} [o.rng]
   */
  constructor({
    maxHealth = 100, vest = 0, helmet = 0, resistance = 0,
    painThreshold = 22, staggerResist = 0.1, protectedCore = false,
    regen = { mode: 'none' }, spawnInvuln = 0, rng = Math.random,
  } = {}) {
    this.maxHealth = Math.max(1, maxHealth);
    this.health = this.maxHealth;
    this.maxVest = Math.max(0, vest);
    this.vest = this.maxVest;
    this.maxHelmet = Math.max(0, helmet);
    this.helmet = this.maxHelmet;
    this.resistance = Math.min(0.95, Math.max(0, resistance));
    this.painThreshold = painThreshold;
    this.staggerResist = Math.min(1, Math.max(0, staggerResist));
    this.protectedCore = protectedCore === true;
    this.regen = { mode: 'none', ceiling: 0.4, delay: 6, rate: 9, ...regen };
    this.invuln = Math.max(0, spawnInvuln);
    this.rng = rng;

    this.dead = false;
    this.godMode = false; // debug only; stripped builds never set it
    this.sinceHit = 999;
    /** The last few hits, newest last — direction is the attacker's bearing. */
    this.recentHits = [];
    /** Set once, by the hit that killed. */
    this.killedBy = null;
  }

  get lowHealth() { return !this.dead && this.health <= this.maxHealth * 0.3; }

  get fraction() { return this.health / this.maxHealth; }

  /**
   * Apply one resolved ray to this body.
   *
   * @param {object} o
   * @param {object} o.weapon    catalog definition
   * @param {number} o.distance
   * @param {string} [o.region]
   * @param {number} [o.carried] damage fraction kept after cover penetration
   * @param {number} [o.scale]   outer multiplier (difficulty for the player,
   *                             npc damage tuning for NPCs)
   * @param {object} [o.attacker] whoever fired — kept in the record
   * @param {{x:number,z:number}} [o.direction] bearing the shot came FROM
   * @returns the damage.js result plus {applied, fatal, staggered, health}
   */
  applyHit({
    weapon, distance = 0, region = 'upperTorso', carried = 1, scale = 1,
    attacker = null, direction = null,
  }) {
    if (this.dead) return { applied: false, reason: 'dead' };
    if (this.godMode || this.invuln > 0) {
      return { applied: false, reason: this.godMode ? 'god' : 'invulnerable' };
    }

    const hit = resolveHit({
      weapon, distance, region,
      vest: this.vest, helmet: this.helmet,
      carried, scale: scale * (1 - this.resistance), rng: this.rng,
    });

    this.vest = Math.max(0, this.vest - hit.vestSpent);
    this.helmet = Math.max(0, this.helmet - hit.helmetSpent);

    let fatal = false;
    const next = this.health - hit.damage;
    if (next <= 0 && this.protectedCore) {
      /* A mission-critical character reports the would-be kill and stands at
       * 1 — the mission decides what that means (usually a checkpoint), the
       * body never quietly dies. Same contract CombatActor established. */
      this.health = 1;
      fatal = true;
    } else {
      this.health = Math.max(0, next);
      fatal = this.health <= 0;
      if (fatal) this.dead = true;
    }

    const forced = hit.damage >= this.painThreshold;
    const staggered = !fatal && (forced
      || (this.rng() < hit.staggerChance && this.rng() >= this.staggerResist));

    this.sinceHit = 0;
    const record = {
      ...hit, applied: true, fatal, staggered,
      protectedCore: fatal && this.protectedCore && !this.dead,
      attacker, direction, health: this.health, at: null,
    };
    this.recentHits.push(record);
    if (this.recentHits.length > 8) this.recentHits.splice(0, this.recentHits.length - 8);
    if (this.dead && !this.killedBy) this.killedBy = record;
    return record;
  }

  /** Scripted or environmental damage that skips ballistics. */
  applyRaw(amount, { attacker = null, direction = null, lethal = true } = {}) {
    if (this.dead || this.godMode || this.invuln > 0) return { applied: false };
    const dmg = Math.max(0, amount) * (1 - this.resistance);
    const floor = lethal && !this.protectedCore ? 0 : 1;
    this.health = Math.max(floor, this.health - dmg);
    const fatal = this.health <= 0;
    if (fatal) this.dead = true;
    this.sinceHit = 0;
    const record = { applied: true, damage: dmg, fatal, attacker, direction, region: null };
    this.recentHits.push(record);
    if (this.dead && !this.killedBy) this.killedBy = record;
    return record;
  }

  heal(amount) {
    if (this.dead) return 0;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + Math.max(0, amount));
    return this.health - before;
  }

  giveVest(points) { this.maxVest = Math.max(this.maxVest, points); this.vest = points; }

  giveHelmet(points) { this.maxHelmet = Math.max(this.maxHelmet, points); this.helmet = points; }

  update(dt) {
    const step = Math.max(0, dt);
    this.invuln = Math.max(0, this.invuln - step);
    this.sinceHit += step;
    if (this.dead || this.regen.mode === 'none') return;
    if (this.sinceHit < this.regen.delay) return;
    const ceiling = this.regen.mode === 'full'
      ? this.maxHealth
      : this.maxHealth * this.regen.ceiling;
    if (this.health < ceiling) {
      this.health = Math.min(ceiling, this.health + this.regen.rate * step);
    }
  }

  /** Checkpoint restore brings a body back exactly as captured. */
  snapshot() {
    return {
      health: this.health, vest: this.vest, helmet: this.helmet,
      dead: this.dead, maxHealth: this.maxHealth,
    };
  }

  restore(snapshot, { invuln = 0 } = {}) {
    if (!snapshot) return;
    this.health = Math.max(0, Math.min(this.maxHealth, snapshot.health ?? this.maxHealth));
    this.vest = Math.max(0, snapshot.vest ?? 0);
    this.helmet = Math.max(0, snapshot.helmet ?? 0);
    this.dead = snapshot.dead === true || this.health <= 0;
    this.invuln = Math.max(0, invuln);
    this.sinceHit = 999;
    this.recentHits.length = 0;
    if (!this.dead) this.killedBy = null;
  }

  revive({ health = this.maxHealth } = {}) {
    this.dead = false;
    this.health = Math.max(1, Math.min(this.maxHealth, health));
    this.killedBy = null;
    this.recentHits.length = 0;
  }
}

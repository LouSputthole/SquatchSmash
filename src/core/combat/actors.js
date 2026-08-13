import { DEFAULT_FACTION_MATRIX } from './factions.js';

const INJURY_GRADES = Object.freeze(['none', 'minor', 'moderate', 'severe']);

export class CombatActor {
  constructor({
    id,
    faction,
    maxHealth = 100,
    armor = 0,
    maxArmor = null,
    core = false,
  }) {
    if (!id || !faction) throw new Error('CombatActor requires id and faction');
    this.id = id;
    this.faction = faction;
    this.maxHealth = Math.max(1, maxHealth);
    this.health = this.maxHealth;
    const initialArmor = Math.max(0, Number(armor) || 0);
    const armorCapacity = maxArmor === null
      ? initialArmor
      : Math.max(0, Number(maxArmor) || 0);
    this.maxArmor = Math.max(initialArmor, armorCapacity);
    this.armor = Math.min(this.maxArmor, initialArmor);
    this.core = core === true;
    this.injury = 'none';
    this.incapacitated = false;
    this.suppression = 0;
    this.role = null;
    this.anchor = null;
    this.carrying = null;
  }

  applyHit({
    amount,
    attacker,
    playerShot = false,
    matrix = DEFAULT_FACTION_MATRIX,
    lethal = false,
  }) {
    if (this.incapacitated || !matrix.canDamage(attacker, this, { playerShot })) {
      return { applied: false, reason: 'protected' };
    }
    const raw = Math.max(0, Number(amount) || 0);
    const armorBefore = this.armor;
    const healthBefore = this.health;
    /* A lethal hit is an explicit hit-location decision made by the scene
     * adapter (a resolved headshot, for example). It still passes faction and
     * core-character protection above, but body armour cannot turn it into a
     * torso hit. */
    const isLethal = lethal === true;
    const absorbed = isLethal ? 0 : Math.min(this.armor, raw * 0.55);
    this.armor -= absorbed;
    const damage = isLethal ? this.health : Math.max(0, raw - absorbed);
    const next = isLethal ? 0 : this.health - damage;
    const details = {
      applied: true,
      lethal: isLethal,
      raw,
      damage,
      absorbed,
      armorBefore,
      armorAfter: this.armor,
      armorBroken: armorBefore > 0 && this.armor <= 0,
      healthBefore,
    };
    if (this.core && next <= 0) {
      this.health = 1;
      this.injury = 'severe';
      return {
        ...details,
        /* `fatal` is outcome truth, not "this amount would normally kill".
         * Generic Adapters use it to create corpses, death pools and mission
         * casualties, so a protected actor who is still standing must never
         * report a fatal result. `fatalPrevented` preserves the useful fact
         * that core protection intercepted an otherwise fatal transition. */
        fatal: false,
        fatalPrevented: true,
        protectedCore: true,
        healthAfter: this.health,
      };
    }
    this.health = Math.max(0, next);
    this.incapacitated = this.health <= 0;
    this._syncInjury();
    return {
      ...details,
      fatal: this.incapacitated,
      healthAfter: this.health,
    };
  }

  _syncInjury() {
    const ratio = this.health / this.maxHealth;
    this.injury = ratio > 0.72 ? 'none'
      : ratio > 0.45 ? 'minor'
        : ratio > 0.2 ? 'moderate' : 'severe';
  }

  /** Restore ordinary health without silently reviving an incapacitated actor. */
  heal(amount) {
    if (this.incapacitated) return 0;
    const before = Math.max(0, Math.min(this.maxHealth, Number(this.health) || 0));
    this.health = Math.min(this.maxHealth, before + Math.max(0, Number(amount) || 0));
    this._syncInjury();
    return this.health - before;
  }

  /** Add armour durability up to this actor's authored capacity. */
  replenishArmor(amount) {
    const before = Math.max(0, Number(this.armor) || 0);
    if (before >= this.maxArmor) return 0;
    this.armor = Math.min(this.maxArmor, before + Math.max(0, Number(amount) || 0));
    return this.armor - before;
  }

  setInjury(grade) {
    if (!INJURY_GRADES.includes(grade)) return false;
    this.injury = grade;
    const caps = { none: 1, minor: 0.72, moderate: 0.45, severe: 0.2 };
    this.health = Math.min(this.health, Math.max(1, this.maxHealth * caps[grade]));
    return true;
  }

  snapshot() {
    return {
      id: this.id,
      health: this.health,
      armor: this.armor,
      /* Keep legacy actors that assigned `.armor` directly checkpoint-safe. */
      maxArmor: Math.max(this.maxArmor, this.armor),
      injury: this.injury,
      incapacitated: this.incapacitated,
      suppression: this.suppression,
      role: this.role,
      anchor: this.anchor,
      carrying: this.carrying,
    };
  }

  /**
   * JSON-safe state for a campaign seam.
   *
   * `snapshot()` remains the in-memory Runtime checkpoint and can carry scene
   * relationships. This bounded record deliberately excludes Object3D and
   * held-object references so a Combat Adapter cannot accidentally serialize
   * an entire scene graph into campaign storage.
   */
  durableSnapshot() {
    return {
      version: 1,
      id: this.id,
      health: this.health,
      armor: this.armor,
      maxArmor: Math.max(this.maxArmor, this.armor),
      injury: this.injury,
      incapacitated: this.incapacitated,
      suppression: this.suppression,
      role: this.role,
    };
  }

  /** Restore Durable combat state while preserving live scene relationships. */
  restoreDurable(snapshot) {
    const anchor = this.anchor;
    const carrying = this.carrying;
    this.restore({ ...snapshot, anchor, carrying });
    this.anchor = anchor;
    this.carrying = carrying;
    return this;
  }

  restore(snapshot) {
    if (!snapshot || snapshot.id !== this.id) throw new Error(`Actor snapshot mismatch for ${this.id}`);
    this.health = Math.max(0, Math.min(this.maxHealth, Number(snapshot.health) || 0));
    const restoredArmor = Math.max(0, Number(snapshot.armor) || 0);
    const restoredMaximum = Number.isFinite(Number(snapshot.maxArmor))
      ? Math.max(0, Number(snapshot.maxArmor))
      : this.maxArmor;
    this.maxArmor = Math.max(restoredMaximum, restoredArmor);
    this.armor = Math.min(this.maxArmor, restoredArmor);
    this.injury = INJURY_GRADES.includes(snapshot.injury) ? snapshot.injury : 'none';
    this.incapacitated = snapshot.incapacitated === true;
    this.suppression = Math.max(0, Math.min(1, Number(snapshot.suppression) || 0));
    this.role = snapshot.role ?? null;
    this.anchor = snapshot.anchor ?? null;
    this.carrying = snapshot.carrying ?? null;
  }
}

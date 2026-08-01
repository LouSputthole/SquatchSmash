import { DEFAULT_FACTION_MATRIX } from './factions.js';

const INJURY_GRADES = Object.freeze(['none', 'minor', 'moderate', 'severe']);

export class CombatActor {
  constructor({
    id,
    faction,
    maxHealth = 100,
    armor = 0,
    core = false,
  }) {
    if (!id || !faction) throw new Error('CombatActor requires id and faction');
    this.id = id;
    this.faction = faction;
    this.maxHealth = Math.max(1, maxHealth);
    this.health = this.maxHealth;
    this.armor = Math.max(0, armor);
    this.core = core === true;
    this.injury = 'none';
    this.incapacitated = false;
    this.suppression = 0;
    this.role = null;
    this.anchor = null;
    this.carrying = null;
  }

  applyHit({ amount, attacker, playerShot = false, matrix = DEFAULT_FACTION_MATRIX }) {
    if (this.incapacitated || !matrix.canDamage(attacker, this, { playerShot })) {
      return { applied: false, reason: 'protected' };
    }
    const raw = Math.max(0, Number(amount) || 0);
    const absorbed = Math.min(this.armor, raw * 0.55);
    this.armor -= absorbed;
    const damage = Math.max(0, raw - absorbed);
    const next = this.health - damage;
    if (this.core && next <= 0) {
      this.health = 1;
      this.injury = 'severe';
      return { applied: true, fatal: true, protectedCore: true, damage };
    }
    this.health = Math.max(0, next);
    this.incapacitated = this.health <= 0;
    const ratio = this.health / this.maxHealth;
    this.injury = ratio > 0.72 ? 'none'
      : ratio > 0.45 ? 'minor'
        : ratio > 0.2 ? 'moderate' : 'severe';
    return { applied: true, fatal: this.incapacitated, damage };
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
      injury: this.injury,
      incapacitated: this.incapacitated,
      suppression: this.suppression,
      role: this.role,
      anchor: this.anchor,
      carrying: this.carrying,
    };
  }

  restore(snapshot) {
    if (!snapshot || snapshot.id !== this.id) throw new Error(`Actor snapshot mismatch for ${this.id}`);
    this.health = Math.max(0, Math.min(this.maxHealth, Number(snapshot.health) || 0));
    this.armor = Math.max(0, Number(snapshot.armor) || 0);
    this.injury = INJURY_GRADES.includes(snapshot.injury) ? snapshot.injury : 'none';
    this.incapacitated = snapshot.incapacitated === true;
    this.suppression = Math.max(0, Math.min(1, Number(snapshot.suppression) || 0));
    this.role = snapshot.role ?? null;
    this.anchor = snapshot.anchor ?? null;
    this.carrying = snapshot.carrying ?? null;
  }
}

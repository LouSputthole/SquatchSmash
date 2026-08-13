/**
 * Finite combat recovery shared by encounters and checkpointed by the scene.
 *
 * This class owns only the number of station uses and their bounded grants.
 * CombatActor remains the health/armour authority and Firearm remains the
 * ammunition authority, so a supply station cannot overfill either model.
 */
export class CombatSupplyState {
  constructor({
    triageCharges = 2,
    resupplyCharges = 2,
    triageHeal = 45,
    armorPerUse = 45,
    magazinesPerWeapon = 2,
  } = {}) {
    this.maxTriageCharges = Math.max(0, Math.trunc(Number(triageCharges) || 0));
    this.maxResupplyCharges = Math.max(0, Math.trunc(Number(resupplyCharges) || 0));
    this.triageCharges = this.maxTriageCharges;
    this.resupplyCharges = this.maxResupplyCharges;
    this.triageHeal = Math.max(0, Number(triageHeal) || 0);
    this.armorPerUse = Math.max(0, Number(armorPerUse) || 0);
    this.magazinesPerWeapon = Math.max(0, Number(magazinesPerWeapon) || 0);
  }

  get triageRemaining() { return this.triageCharges; }

  get resupplyRemaining() { return this.resupplyCharges; }

  get remaining() {
    return {
      triage: this.triageCharges,
      resupply: this.resupplyCharges,
    };
  }

  useTriage(actor, { heal = this.triageHeal } = {}) {
    if (this.triageCharges <= 0 || typeof actor?.heal !== 'function') {
      return { used: false, healed: 0, remaining: this.triageCharges };
    }
    const healed = actor.heal(Math.max(0, Number(heal) || 0));
    if (healed <= 0) return { used: false, healed: 0, remaining: this.triageCharges };
    this.triageCharges--;
    return { used: true, healed, remaining: this.triageCharges };
  }

  useResupply({ actor = null, firearms = [] } = {}) {
    if (this.resupplyCharges <= 0) {
      return {
        used: false, armor: 0, ammunition: 0, remaining: this.resupplyCharges,
      };
    }

    const armor = typeof actor?.replenishArmor === 'function'
      ? actor.replenishArmor(this.armorPerUse)
      : 0;
    let ammunition = 0;
    const unique = new Set(firearms && typeof firearms[Symbol.iterator] === 'function'
      ? firearms : []);
    for (const firearm of unique) {
      if (typeof firearm?.resupply !== 'function') continue;
      const capacity = Math.max(0, Number(firearm.capacity) || 0);
      ammunition += firearm.resupply(capacity * this.magazinesPerWeapon);
    }

    if (armor <= 0 && ammunition <= 0) {
      return {
        used: false, armor: 0, ammunition: 0, remaining: this.resupplyCharges,
      };
    }
    this.resupplyCharges--;
    return {
      used: true, armor, ammunition, remaining: this.resupplyCharges,
    };
  }

  snapshot() {
    return {
      triageCharges: this.triageCharges,
      resupplyCharges: this.resupplyCharges,
    };
  }

  restore(snapshot = {}) {
    this.triageCharges = Math.max(0, Math.min(
      this.maxTriageCharges,
      Math.trunc(Number(snapshot.triageCharges) || 0),
    ));
    this.resupplyCharges = Math.max(0, Math.min(
      this.maxResupplyCharges,
      Math.trunc(Number(snapshot.resupplyCharges) || 0),
    ));
    return this.snapshot();
  }
}

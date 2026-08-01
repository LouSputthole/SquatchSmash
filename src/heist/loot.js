function clone(value) { return JSON.parse(JSON.stringify(value)); }

export class LootLedger {
  constructor(bags = []) {
    this.bags = new Map();
    for (const bag of bags) this.add(bag);
  }

  add({ id, value, weight = 16, anchor = null }) {
    if (!id || this.bags.has(id)) throw new Error(`Duplicate cash bag ${id}`);
    this.bags.set(id, {
      id,
      value: Math.max(0, Math.round(value || 0)),
      weight: Math.max(1, Number(weight) || 16),
      carrier: null,
      anchor,
      position: null,
      vehicle: null,
      recovered: false,
      abandoned: false,
      seized: false,
      compromised: false,
    });
  }

  get(id) { const bag = this.bags.get(id); return bag ? clone(bag) : null; }

  carry(id, actorId) {
    const bag = this.bags.get(id);
    if (!bag || !actorId || bag.vehicle || bag.seized) return false;
    bag.carrier = actorId;
    bag.position = null;
    bag.abandoned = false;
    return true;
  }

  drop(id, { anchor = null, position = null } = {}) {
    const bag = this.bags.get(id);
    if (!bag || !bag.carrier) return false;
    bag.carrier = null;
    bag.anchor = anchor ?? bag.anchor;
    bag.position = position ? clone(position) : null;
    return true;
  }

  load(id, vehicleId) {
    const bag = this.bags.get(id);
    if (!bag || !vehicleId || bag.seized || !bag.carrier) return false;
    bag.carrier = null;
    bag.position = null;
    bag.vehicle = vehicleId;
    bag.recovered = true;
    bag.abandoned = false;
    return true;
  }

  unload(id, anchor) {
    const bag = this.bags.get(id);
    if (!bag?.vehicle) return false;
    bag.vehicle = null;
    bag.anchor = anchor;
    bag.recovered = true;
    return true;
  }

  abandon(id) {
    const bag = this.bags.get(id);
    if (!bag || bag.vehicle || bag.carrier) return false;
    bag.abandoned = true;
    return true;
  }

  seize(id) {
    const bag = this.bags.get(id);
    if (!bag || bag.vehicle || bag.carrier) return false;
    bag.seized = true;
    bag.abandoned = true;
    return true;
  }

  compromise(id) {
    const bag = this.bags.get(id);
    if (!bag) return false;
    bag.compromised = true;
    return true;
  }

  summary() {
    const bags = [...this.bags.values()];
    return {
      totalBags: bags.length,
      recoveredBags: bags.filter((bag) => bag.recovered && !bag.seized).length,
      abandonedBags: bags.filter((bag) => bag.abandoned).length,
      grossRecovered: bags.filter((bag) => bag.recovered && !bag.seized)
        .reduce((sum, bag) => sum + bag.value, 0),
      compromisedCash: bags.filter((bag) => bag.recovered && bag.compromised)
        .reduce((sum, bag) => sum + bag.value, 0),
    };
  }

  capture() { return [...this.bags.values()].map(clone); }

  restore(records) {
    const ids = new Set();
    for (const bag of records ?? []) {
      if (!bag.id || ids.has(bag.id) || (bag.carrier && bag.vehicle)) {
        throw new Error('Invalid cash-bag checkpoint');
      }
      ids.add(bag.id);
    }
    this.bags = new Map((records ?? []).map((bag) => [bag.id, clone(bag)]));
  }

  reset() { this.bags.clear(); }
}

export function createHeistBags() {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `cash_${index + 1}`,
    value: index === 7 ? 210_000 : 180_000,
    weight: index === 7 ? 21 : 16,
    anchor: 'vault_cart',
  }));
}

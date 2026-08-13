import { getPreviewRuntime } from './preview-mode.js';
import { WEAPON_CATALOG, WEAPON_ORDER } from './weapons/catalog.js';
import { FINAL_ARC_LOADOUT_STORAGE_KEY } from './final-arc-loadout-storage.js';

export const FINAL_ARC_LOADOUT_VERSION = 1;
export const FINAL_ARC_SLOT_COUNT = 5;
export { FINAL_ARC_LOADOUT_STORAGE_KEY } from './final-arc-loadout-storage.js';

export const FINAL_ARC_WEAPON_CATALOG = Object.freeze(Object.fromEntries(
  WEAPON_ORDER.map((id) => [id, Object.freeze({
    icon: '⌐',
    name: WEAPON_CATALOG[id].name,
    hint: '[Click] to fire · [R] to reload',
  })]),
));

const clone = (value) => JSON.parse(JSON.stringify(value));

function browserStorage() {
  const preview = getPreviewRuntime();
  if (preview) return preview.storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function freshState() {
  return {
    version: FINAL_ARC_LOADOUT_VERSION,
    slots: new Array(FINAL_ARC_SLOT_COUNT).fill(null),
    selected: 0,
    equipped: null,
    ammo: {},
  };
}

function normalAmmo(id, value = {}) {
  const def = WEAPON_CATALOG[id];
  if (!def) return null;
  const rounds = Number.isFinite(value.rounds) ? value.rounds : def.capacity;
  const reserve = Number.isFinite(value.reserve) ? value.reserve : def.reserve;
  return {
    rounds: Math.max(0, Math.min(def.capacity, Math.trunc(rounds))),
    reserve: Math.max(0, Math.trunc(reserve)),
  };
}

function normalize(value) {
  const base = freshState();
  if (!value || typeof value !== 'object') return base;
  const seen = new Set();
  const source = Array.isArray(value.slots) ? value.slots : [];
  for (let i = 0; i < FINAL_ARC_SLOT_COUNT; i++) {
    const id = source[i];
    if (!WEAPON_CATALOG[id] || seen.has(id)) continue;
    seen.add(id);
    base.slots[i] = id;
    base.ammo[id] = normalAmmo(id, value.ammo?.[id]);
  }
  base.selected = Number.isInteger(value.selected)
    ? Math.max(0, Math.min(FINAL_ARC_SLOT_COUNT - 1, value.selected)) : 0;
  base.equipped = seen.has(value.equipped) ? value.equipped : null;
  if (base.equipped) base.selected = base.slots.indexOf(base.equipped);
  return base;
}

/** Bounded JSON-safe projection used by campaign checkpoint schemas. */
export function normalizeFinalArcLoadoutSnapshot(value) {
  return normalize(value);
}

export class FinalArcLoadout {
  constructor({ storage = undefined } = {}) {
    this.storage = storage === undefined ? browserStorage() : storage;
    this._state = freshState();
    if (this.storage) {
      try {
        this._state = normalize(JSON.parse(this.storage.getItem(FINAL_ARC_LOADOUT_STORAGE_KEY)));
      } catch {
        this._state = freshState();
      }
    }
  }

  get items() { return [...this._state.slots]; }
  get selected() { return this._state.selected; }
  get equipped() { return this._state.equipped; }
  get state() { return clone(this._state); }

  has(id) { return this._state.slots.includes(id); }

  acquire(id, ammo = {}) {
    if (!WEAPON_CATALOG[id]) return { ok: false, reason: 'unknown_weapon' };
    const existing = this._state.slots.indexOf(id);
    if (existing >= 0) {
      this._state.selected = existing;
      this._state.equipped = id;
      this.#save();
      return { ok: true, slot: existing, existing: true };
    }
    const slot = this._state.slots.indexOf(null);
    if (slot < 0) return { ok: false, reason: 'full' };
    this._state.slots[slot] = id;
    this._state.ammo[id] = normalAmmo(id, ammo);
    this._state.selected = slot;
    this._state.equipped = id;
    this.#save();
    return { ok: true, slot };
  }

  /** Replace only the durable weapon projection of a scene's five slots. */
  replaceSlots(items, {
    selected = this._state.selected,
    equipped = this._state.equipped,
    weaponSystem = null,
  } = {}) {
    this._state = normalize({
      slots: items,
      selected,
      equipped,
      ammo: this._state.ammo,
    });
    if (weaponSystem) this.capture(weaponSystem);
    else this.#save();
    return this.state;
  }

  /** An explicit rack return discards one gun, never the whole loadout. */
  remove(id, weaponSystem = null) {
    const slot = this._state.slots.indexOf(id);
    if (slot < 0) return false;
    this._state.slots[slot] = null;
    delete this._state.ammo[id];
    if (this._state.equipped === id) {
      this._state.equipped = null;
      weaponSystem?.stow?.({ silent: true });
    }
    this.#save();
    return true;
  }

  select(index, weaponSystem = null) {
    if (!Number.isInteger(index) || index < 0 || index >= FINAL_ARC_SLOT_COUNT) return false;
    this._state.selected = index;
    this._state.equipped = this._state.slots[index] ?? null;
    if (weaponSystem) {
      if (this._state.equipped) weaponSystem.equip?.(this._state.equipped);
      else weaponSystem.stow?.({ silent: true });
    }
    this.#save();
    return true;
  }

  /** Save the ammunition actually left in every owned firearm. */
  capture(weaponSystem) {
    if (!weaponSystem) return this.state;
    for (const id of this._state.slots) {
      if (!id) continue;
      const value = weaponSystem.firearm?.(id)?.snapshot?.();
      if (value) this._state.ammo[id] = normalAmmo(id, value);
    }
    const equipped = weaponSystem.equipped;
    this._state.equipped = this.has(equipped) ? equipped : null;
    if (this._state.equipped) this._state.selected = this._state.slots.indexOf(equipped);
    this.#save();
    return this.state;
  }

  /** Hydrate a new scene's WeaponSystem without manufacturing new ammunition. */
  apply(weaponSystem, { equip = true } = {}) {
    if (!weaponSystem) return this.state;
    for (const id of this._state.slots) {
      if (!id) continue;
      const firearm = weaponSystem.firearm?.(id);
      const ammo = this._state.ammo[id];
      if (!firearm || !ammo) continue;
      if (typeof firearm.restore === 'function') firearm.restore(ammo);
      else {
        firearm.rounds = ammo.rounds;
        firearm.reserve = ammo.reserve;
      }
    }
    if (equip && this._state.equipped) weaponSystem.equip?.(this._state.equipped);
    else weaponSystem.stow?.({ silent: true });
    return this.state;
  }

  /** Empty hands are a state; they are not an instruction to discard a gun. */
  stow(weaponSystem = null) {
    this._state.equipped = null;
    weaponSystem?.stow?.({ silent: true });
    this.#save();
    return true;
  }

  checkpoint() { return this.state; }

  restore(snapshot, weaponSystem = null) {
    this._state = normalize(snapshot);
    this.#save();
    this.apply(weaponSystem);
    return this.state;
  }

  #save() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(FINAL_ARC_LOADOUT_STORAGE_KEY, JSON.stringify(this._state));
      return true;
    } catch {
      this.storage = null;
      return false;
    }
  }
}

export function createFinalArcLoadout(options = {}) {
  return new FinalArcLoadout(options);
}

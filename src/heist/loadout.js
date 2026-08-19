import { weaponDef } from '../core/weapons/catalog.js';
import { HEIST_WEAPON_BINDINGS, HeistFirearm } from './combat.js';

/**
 * What Tony is carrying on the job, and which of it is in his hands.
 *
 * THE TAKE mounted `SceneInventoryBar` and then never gave the player a way to
 * change the selection or see the selected thing, so the bar was a picture of a
 * loadout rather than a loadout. This owns the model half: the five slots, the
 * selection, and the two weapons the selection switches between. The view half
 * (the bar itself and the first-person hands) is `SceneInventoryBar` plus
 * `./weapons.js`.
 *
 * Slot order is fixed rather than packed, because a slot that moves under the
 * player's thumb is worse than an empty one: `2` is always the sidearm even
 * while the carbine is still on the table.
 */

export const HEIST_SLOT_ORDER = Object.freeze([
  'carbine', 'sidearm', 'crowd', 'bag', 'keys',
]);

/**
 * Bar presentation for every item THE TAKE can put in a slot.
 *
 * Slot three is the crowd-control slot and it changes hands once: on the way in
 * it holds the rolled balaclava, and the moment that goes on your face it holds
 * the zip ties instead. One slot, one job — everything you do to a person who
 * is not shooting at you is on that key.
 */
export const HEIST_ITEM_CATALOG = Object.freeze({
  carbine: Object.freeze({ icon: '▰', name: 'Controlled carbine' }),
  sidearm: Object.freeze({ icon: '⌐', name: 'Commander sidearm' }),
  mask: Object.freeze({ icon: '☗', name: 'Balaclava — rolled' }),
  zip_ties: Object.freeze({ icon: '∞', name: 'Zip ties' }),
  duffel: Object.freeze({ icon: '▤', name: 'Empty duffel' }),
  cash_bag: Object.freeze({ icon: '$', name: 'Cash bag' }),
  keys: Object.freeze({ icon: '⌁', name: 'Escape-car keys' }),
});

/** Which catalog entries are things you can shoot with. */
export const HEIST_WEAPON_ITEMS = Object.freeze(['carbine', 'sidearm']);

/**
 * Two guns that are actually different — and they are the CATALOG's guns.
 *
 * The scene shipped with one weapon called CONTROLLED, so "switch inventory
 * items" had nothing to switch to. Then it shipped two, with numbers of its
 * own invention — a private 20-round carbine next to the campaign's canonical
 * 30-round one, which is the migration debt the reusable-systems doc recorded.
 * The defs below are now a read-only VIEW of `core/weapons/catalog.js` through
 * the slot bindings in `./combat.js`: the carbine is the armory's carbine, the
 * sidearm is Lou's 9mm, and a round from either does exactly what it does in
 * every other scene.
 */
export const HEIST_WEAPON_DEFS = Object.freeze(Object.fromEntries(
  Object.entries(HEIST_WEAPON_BINDINGS).map(([slot, binding]) => {
    const def = weaponDef(binding.weaponId);
    return [slot, Object.freeze({
      name: binding.label,
      weaponId: binding.weaponId,
      magazineSize: def.capacity,
      damage: def.damage,
      penetration: def.penetration,
    })];
  }),
));

export class HeistLoadout {
  constructor({ slots = HEIST_SLOT_ORDER.length } = {}) {
    this.slotCount = slots;
    /** Item key per slot, or null for an empty slot. */
    this.items = new Array(slots).fill(null);
    this.selected = 0;
    this.maskWorn = false;
    /* Canonical `Firearm` state behind the loadout's old surface — see
     * `HeistFirearm`. No second ammunition or reload authority exists here. */
    this.weapons = {
      carbine: new HeistFirearm('carbine'),
      sidearm: new HeistFirearm('sidearm'),
    };
  }

  /** Rebuild the slot contents. Selection survives if its slot still holds. */
  setSlots({ armed = false, bag = null, keys = false, mask = false } = {}) {
    const next = [
      armed ? 'carbine' : null,
      armed ? 'sidearm' : null,
      mask ? (this.maskWorn ? 'zip_ties' : 'mask') : null,
      bag,
      keys ? 'keys' : null,
    ];
    const changed = next.some((item, index) => item !== this.items[index]);
    this.items = next;
    if (!this.items[this.selected]) this.selected = this.firstFilledSlot();
    return changed;
  }

  firstFilledSlot() {
    const index = this.items.findIndex(Boolean);
    return index < 0 ? 0 : index;
  }

  /** @param {number} index zero-based slot. Empty slots are refused. */
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.slotCount) return false;
    if (!this.items[index]) return false;
    if (index === this.selected) return false;
    this.selected = index;
    return true;
  }

  /** Mouse wheel / bracket keys. Skips empty slots, wraps, never stalls. */
  cycle(direction = 1) {
    const step = direction >= 0 ? 1 : -1;
    for (let i = 1; i <= this.slotCount; i++) {
      const index = (this.selected + step * i + this.slotCount * i) % this.slotCount;
      if (this.items[index]) return this.select(index);
    }
    return false;
  }

  get selectedItem() { return this.items[this.selected] ?? null; }

  get selectedIsWeapon() { return HEIST_WEAPON_ITEMS.includes(this.selectedItem); }

  /** The HeistFirearm the trigger is wired to, or null for empty hands. */
  get activeWeapon() {
    return this.selectedIsWeapon ? this.weapons[this.selectedItem] : null;
  }

  /** True when the balaclava is the selected slot and still pushed up. */
  get maskInHand() { return this.selectedItem === 'mask'; }

  /** True when the zip ties are the thing in Tony's hands. */
  get tiesInHand() { return this.selectedItem === 'zip_ties'; }

  wearMask(worn = true) {
    this.maskWorn = worn === true;
    const index = HEIST_SLOT_ORDER.indexOf('crowd');
    if (this.items[index]) this.items[index] = this.maskWorn ? 'zip_ties' : 'mask';
    return this.maskWorn;
  }

  update(dt) {
    for (const weapon of Object.values(this.weapons)) weapon.update(dt);
  }

  snapshot() {
    return {
      items: [...this.items],
      selected: this.selected,
      maskWorn: this.maskWorn,
      weapons: {
        carbine: this.weapons.carbine.snapshot(),
        sidearm: this.weapons.sidearm.snapshot(),
      },
    };
  }

  restore(snapshot = {}) {
    this.items = Array.from({ length: this.slotCount },
      (_, index) => snapshot.items?.[index] ?? null);
    this.selected = Number.isInteger(snapshot.selected)
      ? Math.max(0, Math.min(this.slotCount - 1, snapshot.selected)) : 0;
    this.maskWorn = snapshot.maskWorn === true;
    if (snapshot.weapons?.carbine) this.weapons.carbine.restore(snapshot.weapons.carbine);
    if (snapshot.weapons?.sidearm) this.weapons.sidearm.restore(snapshot.weapons.sidearm);
    if (!this.items[this.selected]) this.selected = this.firstFilledSlot();
  }

  reset() {
    this.items = new Array(this.slotCount).fill(null);
    this.selected = 0;
    this.maskWorn = false;
    for (const weapon of Object.values(this.weapons)) weapon.reset();
  }
}

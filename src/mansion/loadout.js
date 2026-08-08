/**
 * What Tony is carrying around Lou's house, and which of it is in his hands.
 *
 * The mansion shipped with no inventory at all. The chrome case was a model
 * parented to the camera that the mission switched on and off, so it was in
 * your hands for the whole walk from the gate to the office whether you wanted
 * it there or not, and the guns on the basement racks went straight into the
 * weapon system with nothing to show you what you had. The owner's note:
 *
 *   "Also lets keep are inventory system. Let me have the case in my
 *    inventory. I spawn in holding it but can put it away and see it in my
 *    inventory. USe the same system form other scenes. We should already be
 *    doing this. This way I can grab guns and stuff too."
 *
 * We were already doing this: `core/inventory.js` is the model and
 * `core/scene-inventory.js`'s `SceneInventoryBar` is the bottom-of-screen
 * presentation, and eight other scenes mount exactly that pair. This is the
 * mansion's adapter between them and the two things the house can put in a
 * slot -- the case, and whatever came off the armory racks.
 *
 * THE ONE RULE THAT MAKES THE CASE WORK. Stowing the case must not fight the
 * mission for it. Two separate facts:
 *
 *   - does he HAVE the case      -- the mission's business (`onCase`)
 *   - is it in his HANDS         -- the player's business (this file)
 *
 * The model is visible only when both are true. Mixing them is how you get a
 * case that reappears in your hands the moment a beat fires, or a mission that
 * cannot take the case off you because the player put it away.
 */
import { Inventory } from '../core/inventory.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';

/**
 * Everything the house can put in a slot.
 *
 * Deliberately its own catalog rather than `core/inventory.js`'s `ITEMS`: that
 * one is the flat's -- beer, smokes, eggs -- and none of it is in this
 * building. The guns come from the weapon catalog by id, so a weapon added to
 * `core/weapons/catalog.js` needs no entry here.
 */
export const MANSION_ITEMS = Object.freeze({
  case: Object.freeze({ icon: '▤', name: 'The chrome case', hint: 'Lou is expecting this' }),
  /* Owner playtest: *"I should be able to put the whip away"*. He could not —
   * Gratin's cord went onto the camera and stayed in shot for the rest of the
   * night, through the delivery, the execution and the walk back up. It is a
   * thing he is carrying, so it is a slot like everything else, and `cast.js`
   * keeps the same OWNING/HOLDING split the case does. */
  cord: Object.freeze({ icon: '⌇', name: 'Gratin’s cord', hint: 'One each. House rule.' }),
});

/** Slot presentation for a weapon the player picked up. */
function weaponEntry(id, name) {
  return { icon: '⌐', name: name || id, hint: '[Click] to fire · [R] to reload' };
}

/**
 * @param {object} o
 *   weapons  the WeaponSystem, for equip/stow when the selection moves
 *   onCaseInHand(bool)  told when the case should be in view
 *   weaponName(id)      display name for a weapon id
 */
export function createMansionLoadout({
  weapons = null,
  onCaseInHand = () => {},
  onCordInHand = () => {},
  weaponName = (id) => id,
  slots = 5,
  durableLoadout = null,
  bar: suppliedBar = null,
} = {}) {
  const inventory = new Inventory(slots);
  /** Catalog grows as guns are picked up, so the bar can label them. */
  const catalog = { ...MANSION_ITEMS };
  const bar = suppliedBar ?? new SceneInventoryBar({ slots, catalog, visible: true });

  const isWeapon = (id) => Boolean(id) && id !== 'case' && id !== 'cord';

  /* A scene seam restores the exact weapon slots before mission-local things
   * (the case and the cord) are handed over. Local props can occupy the gaps;
   * the durable projection written back below contains guns only. */
  if (durableLoadout) {
    const saved = durableLoadout.state;
    for (let i = 0; i < Math.min(slots, saved.slots?.length ?? 0); i++) {
      const id = saved.slots[i];
      if (!isWeapon(id)) continue;
      inventory.items[i] = id;
      catalog[id] = weaponEntry(id, weaponName(id));
    }
    inventory.selected = Math.max(0, Math.min(slots - 1, saved.selected ?? 0));
    durableLoadout.apply(weapons, { equip: false });
  }

  function persist() {
    if (!durableLoadout) return null;
    durableLoadout.replaceSlots(
      inventory.items.map((id) => (isWeapon(id) ? id : null)),
      {
        selected: inventory.selected,
        equipped: weapons?.equipped ?? null,
        weaponSystem: weapons,
      },
    );
    return durableLoadout.state;
  }

  /**
   * Redraw, and put the case in or out of his hands.
   *
   * DELIBERATELY DOES NOT TOUCH THE WEAPON SYSTEM. The first version equipped
   * whatever weapon was in the selected slot from here, which reads fine and
   * is wrong twice over, because the ARMORY is the authority on guns, not this:
   *
   *   - pressing Q put the gun back on the rack, which fired `onEvent`, which
   *     called in here, which saw the weapon still sitting in its slot and
   *     equipped it again. The gun came straight back off the wall.
   *   - taking a sixth gun into five slots failed to add, so the selection
   *     stayed on the fifth, and this equipped THAT one instead. Asking for
   *     the Barrett handed you the AK.
   *
   * Both were caught by `verify:mansion` -- six checks, from a change that
   * parsed cleanly and looked right. Equipping now happens only where the
   * player actually asked for it: `select()` and `cycle()` below.
   */
  function apply() {
    onCaseInHand(inventory.held === 'case');
    onCordInHand(inventory.held === 'cord');
    bar.catalog = catalog;
    bar.set(inventory.items, inventory.selected);
    persist();
  }

  inventory.onChange = apply;

  /** Follow a selection the player made, and only a selection they made. */
  function selectionChanged() {
    const held = inventory.held;
    if (!weapons) return;
    if (isWeapon(held)) {
      if (weapons.equipped !== held) weapons.equip(held);
    } else if (weapons.equipped) {
      weapons.stow();
    }
  }

  return {
    inventory,
    bar,

    /** Put the case in a slot and hold it. Used at spawn. */
    giveCase() {
      if (inventory.has('case')) return true;
      const ok = inventory.add('case');
      apply();
      return ok;
    },

    /** Lou has it now, or it went through the drawer. */
    takeCase() {
      const had = inventory.remove('case');
      apply();
      return had;
    },

    hasCase: () => inventory.has('case'),

    /** Gratin handed the cord over. One each — see the hint on the item. */
    giveCord() {
      if (inventory.has('cord')) return true;
      const ok = inventory.add('cord');
      apply();
      return ok;
    },
    takeCord() {
      const had = inventory.remove('cord');
      apply();
      return had;
    },
    hasCord: () => inventory.has('cord'),

    /**
     * Mirror an armory pickup without erasing guns earned earlier. A new gun
     * fills the first free slot; selecting a known one reuses its stable slot.
     * Only an explicit physical rack return removes ownership.
     * @param {string|null} id the equipped weapon, or null for empty hands
     */
    syncWeapon(id, { rackedId = null } = {}) {
      if (rackedId) this.rackWeapon(rackedId);
      if (id && !inventory.has(id)) {
        catalog[id] = weaponEntry(id, weaponName(id));
        if (!inventory.add(id)) {
          persist();
          return false;
        }
      } else if (id) {
        inventory.select(inventory.items.indexOf(id));
      }
      /* Putting a gun back on the rack empties the slot it was in, and the
       * selection was still pointing at it -- so he walked away from the
       * armory holding nothing while the case sat in his inventory. Fall back
       * to whatever he is still carrying. Empty hands is a fine state to be
       * in; it is not a fine state to be PUT in. */
      if (!inventory.held) {
        const occupied = inventory.items.findIndex(Boolean);
        if (occupied >= 0) inventory.select(occupied);
      }
      apply();
      return true;
    },

    /** Q stows a gun; ownership, slot position and ammunition all survive. */
    stow() {
      weapons?.stow?.();
      const empty = inventory.items.indexOf(null);
      if (empty >= 0) inventory.select(empty);
      durableLoadout?.stow(weapons);
      apply();
      return true;
    },

    /** Returning a gun to a physical rack removes that one gun only. */
    rackWeapon(id) {
      if (!isWeapon(id)) return false;
      const removed = inventory.remove(id);
      if (!inventory.held) {
        const occupied = inventory.items.findIndex(Boolean);
        if (occupied >= 0) inventory.select(occupied);
      }
      apply();
      return removed;
    },

    select(i) {
      inventory.select(i);
      selectionChanged();
      apply();
    },
    cycle(dir) {
      inventory.cycle(dir);
      selectionChanged();
      apply();
    },
    capture: persist,
    refresh: apply,
  };
}

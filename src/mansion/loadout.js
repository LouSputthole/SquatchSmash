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
} = {}) {
  const inventory = new Inventory(slots);
  /** Catalog grows as guns are picked up, so the bar can label them. */
  const catalog = { ...MANSION_ITEMS };
  const bar = new SceneInventoryBar({ slots, catalog, visible: true });

  const isWeapon = (id) => Boolean(id) && id !== 'case' && id !== 'cord';

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
     * Mirror the armory: he carries exactly the gun the weapon system says he
     * has, and no more.
     *
     * At most ONE weapon slot, because the armory is a rack you take one thing
     * off — a slot per gun ever touched would fill five slots with guns that
     * are back on the wall, and then the case would have nowhere to go.
     * @param {string|null} id the equipped weapon, or null for empty hands
     */
    syncWeapon(id) {
      for (const existing of inventory.items) {
        if (isWeapon(existing) && existing !== id) inventory.remove(existing);
      }
      if (id && !inventory.has(id)) {
        catalog[id] = weaponEntry(id, weaponName(id));
        inventory.add(id);
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
    },

    select(i) {
      inventory.select(i);
      selectionChanged();
    },
    cycle(dir) {
      inventory.cycle(dir);
      selectionChanged();
    },
    refresh: apply,
  };
}

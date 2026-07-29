/**
 * What he is carrying.
 *
 * There used to be one pocket. `state.heldItem` was a string, every pickup
 * checked `!state.heldItem` before it would let you take anything, and putting
 * a beer down was the only way to pick up a packet of cigarettes -- which is
 * fine for a flat with three things in it and stops working the moment there
 * is a gun on the coffee table.
 *
 * So: several slots, one of them selected, and `heldItem` becomes "whatever is
 * in the selected slot". That last part is deliberate and is why this landed
 * without touching the twenty-odd places that read `state.heldItem` -- the
 * property is redefined as an accessor over this, so `=== 'cigs'` still means
 * what it meant, and `= 'beer'` still means "he is holding a beer now". The
 * only behaviour that had to change is the pickup gates, which asked whether
 * his hand was empty and should have been asking whether he had room.
 */

/** Everything that can be in a slot. `hold` is what the HUD says about it. */
export const ITEMS = {
  beer: { icon: '🍺', name: 'Cold beer', hint: 'Hold [F] to drink' },
  empty: { icon: '🥫', name: 'Empty can', hint: '[Q] to drop it' },
  cigs: { icon: '🚬', name: 'Smokes', hint: 'Hold [F] to light one' },
  whiskey: { icon: '🥃', name: "Jack & Daniel's", hint: 'Hold [F] to take a pull' },
  eggs: { icon: '🥚', name: 'Two eggs', hint: 'The hob is over there' },
  slice: { icon: '🍕', name: 'Slice of pizza', hint: 'Hold [F] to eat it' },
  gun: { icon: '🔫', name: 'The revolver', hint: '[Click] to fire · [R] to reload' },
  phone: { icon: '📱', name: 'Your phone', hint: '[E] to use it' },
  /* The Bing's mission item. It is never put in a slot -- it is carried
   * concealed, and the club draws its own line for that -- but the name and
   * the icon live here with everything else you can be holding. */
  parcel: { icon: '▣', name: "Lou's package", hint: 'Inside your jacket' },
};

export class Inventory {
  /** @param {number} slots how many things he can carry at once */
  constructor(slots = 5) {
    this.slots = slots;
    /** @type {(string|null)[]} */
    this.items = new Array(slots).fill(null);
    this.selected = 0;
    /** Called whenever anything changes, so the HUD can redraw. */
    this.onChange = null;
  }

  /** The id in the selected slot, or null. */
  get held() { return this.items[this.selected]; }

  get full() { return this.items.every((s) => s !== null); }

  has(id) { return this.items.includes(id); }

  count() { return this.items.reduce((n, s) => n + (s ? 1 : 0), 0); }

  /**
   * Put something in the first free slot and select it.
   * @returns {boolean} false if there was nowhere to put it
   */
  add(id) {
    if (!id) return false;
    const at = this.items.indexOf(null);
    if (at < 0) return false;
    this.items[at] = id;
    this.selected = at;
    this._changed();
    return true;
  }

  /** Take one out, by id. Prefers the selected slot if it matches. */
  remove(id) {
    let at = this.items[this.selected] === id ? this.selected : this.items.indexOf(id);
    if (at < 0) return false;
    this.items[at] = null;
    this._changed();
    return true;
  }

  /** Empty the selected slot. */
  clearSelected() {
    if (this.items[this.selected] === null) return null;
    const was = this.items[this.selected];
    this.items[this.selected] = null;
    this._changed();
    return was;
  }

  /** @param {number} i slot index */
  select(i) {
    if (i < 0 || i >= this.slots || i === this.selected) return;
    this.selected = i;
    this._changed();
  }

  /**
   * Next or previous OCCUPIED slot, wrapping. Skipping the empties matters:
   * cycling through four blanks to get from the beer to the smokes is the
   * kind of thing that makes a hotbar feel like paperwork.
   */
  cycle(dir = 1) {
    if (this.count() <= 1) return;
    let i = this.selected;
    for (let n = 0; n < this.slots; n++) {
      i = (i + dir + this.slots) % this.slots;
      if (this.items[i]) { this.select(i); return; }
    }
  }

  clear() {
    this.items.fill(null);
    this.selected = 0;
    this._changed();
  }

  _changed() { this.onChange?.(this); }
}

/**
 * Make `obj.heldItem` read and write the selected slot.
 *
 * This is the whole compatibility story. Everything written against the single
 * pocket keeps working: reads report what is in hand, `= something` picks it
 * up, `= null` puts down what is in hand.
 */
export function bindHeldItem(obj, inv) {
  Object.defineProperty(obj, 'heldItem', {
    enumerable: true,
    configurable: true,
    get: () => inv.held,
    set: (v) => {
      if (v === null || v === undefined) inv.clearSelected();
      else if (inv.held !== v) inv.add(v);
    },
  });
}

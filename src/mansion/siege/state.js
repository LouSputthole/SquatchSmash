/**
 * The mansion's damage-state overlay.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE (owner brief, 2026-08-05):
 *
 *   "Do not currently make permanent structural changes to the base mansion
 *    for this mission. ... We want the mansion designed correctly once before
 *    duplicating extensive edits across several versions."
 *
 * So `MansionGrounds.js` and `MansionInterior.js` stay the single source of
 * the house. The siege calls the same two builders the walking tour calls,
 * and then hangs everything it needs -- night light, wrecks, fire, shattered
 * glass, bodies, debris, attackers -- on top of the result as toggled groups.
 * Nothing in this file edits mansion geometry. If a change here would be
 * easier as an edit to the interior builder, it goes in the future-edit list
 * in docs/MANSION-SIEGE-NIGHT.md instead, and waits for the overview.
 *
 * WHY LAYERS AND NOT A STATE PER GROUP. Six states times forty groups is 240
 * booleans somebody has to keep in their head, and the failure mode is a
 * burning car that is on in `damaged` and off in `post_battle` because a
 * list was pasted wrong. Groups declare which LAYER they belong to -- one
 * word -- and each state declares which layers are lit. Adding a state is
 * one line; adding a group is one word.
 *
 * WHAT A BROKEN WINDOW ACTUALLY IS. Two registrations, not one edit:
 *
 *   damage.suppress('glass.foyer.w2', { object: pane, collider: paneBox,
 *                                       layers: ['battle'] });
 *   damage.group('glass.foyer.w2.shards', { object: shards,
 *                                           layers: ['battle'] });
 *
 * The intact pane hides AND its collider leaves the shared array in the same
 * instant. A pane that only hides is invisible glass you cannot walk through
 * -- which is the NO WAKE deck fault with a nicer view.
 *
 * DUCK-TYPED ON PURPOSE. Nothing here imports THREE. An "object" is anything
 * with a `.visible` property and a "collider" is whatever the scene's
 * collider array holds. That keeps the whole overlay testable headless,
 * which is the only way the checkpoint restore path ever gets exercised
 * without a browser.
 */

/** The six states the house can be in. Ordered as the campaign meets them. */
export const DAMAGE_STATES = Object.freeze([
  'clean',
  'alert',
  'under_attack',
  'damaged',
  'post_battle',
  'repaired',
]);

/**
 * Layers, and which states light them.
 *
 * `clean` and `repaired` are both empty, and that is the point: the house the
 * player returns to after Enola Squatch is the canonical house, not the siege
 * with its wreckage swept up. They differ only in the story flag the mission
 * carries, never in what is standing.
 */
export const STATE_LAYERS = Object.freeze({
  clean: Object.freeze([]),
  /* Night, alarm, guards at their posts. Nothing broken yet. */
  alert: Object.freeze(['night', 'alarm', 'posted']),
  /* The fight. */
  under_attack: Object.freeze(['night', 'alarm', 'battle', 'hostiles']),
  /* The fight is over but the alarm is still going. */
  damaged: Object.freeze(['night', 'alarm', 'battle']),
  /* Somebody has killed the alarm; the family is counting the cost. */
  post_battle: Object.freeze(['night', 'battle', 'aftermath']),
  repaired: Object.freeze([]),
});

export const LAYERS = Object.freeze([
  'night', 'alarm', 'posted', 'battle', 'hostiles', 'aftermath',
]);

function assertState(state) {
  if (!DAMAGE_STATES.includes(state)) {
    throw new Error(`Unknown mansion damage state: ${state}`);
  }
  return state;
}

function assertLayers(name, layers) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error(`${name} must declare at least one layer`);
  }
  for (const layer of layers) {
    if (!LAYERS.includes(layer)) {
      throw new Error(`${name} declares unknown layer "${layer}"`);
    }
  }
  return [...layers];
}

export class MansionDamageState {
  /**
   * @param {object[]} colliders the scene's live collider array, mutated in
   *   place. This is the same array the Player reads every frame, so a
   *   collider added here is solid on the next step and one removed is not.
   */
  constructor({ colliders = [], state = 'clean' } = {}) {
    this.colliders = colliders;
    this.entries = new Map();
    this._state = assertState(state);
    /** Set by the mission when a layer's own contents change mid-state. */
    this.onChange = null;
  }

  get state() { return this._state; }

  /** Every layer lit in the current state. */
  get activeLayers() { return new Set(STATE_LAYERS[this._state]); }

  /**
   * Siege-added content: hidden in `clean`, shown when one of its layers is
   * lit. This is the direction almost everything goes.
   */
  group(name, { object = null, colliders = [], layers, onShow = null, onHide = null } = {}) {
    return this._register(name, {
      mode: 'show', object, colliders, layers, onShow, onHide,
    });
  }

  /**
   * Base-mansion content the siege takes AWAY: an intact window pane, a
   * standing centrepiece, a chandelier that is on the floor now. Shown in
   * `clean`, hidden when one of its layers is lit -- the mirror of group().
   */
  suppress(name, { object = null, collider = null, colliders = [], layers } = {}) {
    const all = collider ? [collider, ...colliders] : colliders;
    return this._register(name, { mode: 'hide', object, colliders: all, layers });
  }

  _register(name, { mode, object, colliders, layers, onShow = null, onHide = null }) {
    if (!name) throw new Error('A damage-state entry needs a name');
    if (this.entries.has(name)) throw new Error(`Duplicate damage-state entry: ${name}`);
    const entry = {
      name,
      mode,
      object,
      colliders: [...colliders],
      layers: assertLayers(name, layers),
      onShow,
      onHide,
      /* Whether this entry's colliders are currently in the shared array.
       * Tracked rather than searched: a Box3 has no identity we can test
       * cheaply and double-adding one is a silent invisible wall. */
      attached: false,
      live: null,
    };
    this.entries.set(name, entry);
    this._settle(entry);
    return entry;
  }

  /** True when any of this entry's layers is lit in the current state. */
  _lit(entry) {
    const active = STATE_LAYERS[this._state];
    return entry.layers.some((layer) => active.includes(layer));
  }

  _settle(entry) {
    const lit = this._lit(entry);
    /* `show` entries are live when lit; `hide` entries are live when NOT. */
    const live = entry.mode === 'show' ? lit : !lit;
    if (entry.live === live) return false;
    entry.live = live;
    if (entry.object) entry.object.visible = live;
    if (live && !entry.attached) {
      for (const box of entry.colliders) this.colliders.push(box);
      entry.attached = true;
      entry.onShow?.(entry);
    } else if (!live && entry.attached) {
      for (const box of entry.colliders) {
        const at = this.colliders.indexOf(box);
        if (at >= 0) this.colliders.splice(at, 1);
      }
      entry.attached = false;
      entry.onHide?.(entry);
    }
    return true;
  }

  /**
   * Move the house to a state. Idempotent: re-applying the state a
   * checkpoint restored is a no-op rather than a rebuild, which is exactly
   * what a checkpoint needs it to be.
   */
  apply(state) {
    const next = assertState(state);
    const changed = [];
    this._state = next;
    for (const entry of this.entries.values()) {
      if (this._settle(entry)) changed.push(entry.name);
    }
    this.onChange?.({ state: next, changed });
    return changed;
  }

  /** Re-settle without changing state. For content that appears mid-fight. */
  refresh() { return this.apply(this._state); }

  has(name) { return this.entries.has(name); }
  entry(name) { return this.entries.get(name) ?? null; }

  /** Names of everything currently standing, for the verifier and for tests. */
  liveNames() {
    return [...this.entries.values()].filter((e) => e.live).map((e) => e.name).sort();
  }

  /**
   * Only what the SIEGE put there -- `group` entries that are live.
   *
   * This is the list to check a clean house against, and the distinction is
   * not pedantry. A `suppress` entry is live in `clean` BY DESIGN: the intact
   * window pane it names is standing, because the house is not broken yet. So
   * `liveNames()` in `clean` is correctly non-empty, and a verifier that reads
   * it as "things the siege added" reports twenty-two intact windows as a
   * leak. Ask this instead. Empty is the only correct answer in `clean` and
   * in `repaired`.
   */
  addedNames() {
    return [...this.entries.values()]
      .filter((e) => e.live && e.mode === 'show').map((e) => e.name).sort();
  }

  /** Base-mansion content the siege is currently taking away. */
  suppressedNames() {
    return [...this.entries.values()]
      .filter((e) => !e.live && e.mode === 'hide').map((e) => e.name).sort();
  }

  /**
   * A checkpoint stores the state name and nothing else, because the state
   * name reproduces every toggle deterministically. What a checkpoint must
   * store separately is what the FIGHT changed inside a state -- which
   * windows the player shot out, who is dead -- and that belongs to the
   * mission, not here.
   */
  snapshot() { return { state: this._state }; }

  restore(snapshot) {
    if (!snapshot?.state) throw new Error('Damage-state snapshot has no state');
    return this.apply(snapshot.state);
  }
}

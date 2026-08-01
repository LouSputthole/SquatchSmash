function clone(value) { return JSON.parse(JSON.stringify(value)); }

/** Coordinates complete teardown-before-restore across independent systems. */
export class CheckpointDirector {
  constructor() {
    this.systems = new Map();
    this.snapshots = new Map();
    this.latest = null;
  }

  register(id, adapter) {
    if (!id || this.systems.has(id)
      || typeof adapter?.capture !== 'function'
      || typeof adapter?.restore !== 'function'
      || typeof adapter?.reset !== 'function') {
      throw new Error(`Invalid checkpoint system ${id}`);
    }
    this.systems.set(id, adapter);
  }

  capture(id, meta = {}) {
    const systems = {};
    for (const [name, adapter] of this.systems) systems[name] = clone(adapter.capture());
    this.snapshots.set(id, clone({ id, meta, systems }));
    this.latest = id;
    return this.snapshot(id);
  }

  snapshot(id = this.latest) {
    const value = this.snapshots.get(id);
    return value ? clone(value) : null;
  }

  restore(id = this.latest) {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) return false;
    const systems = [...this.systems.entries()];
    // Reset in reverse construction order so listeners/effects disappear
    // before actors and geometry are rebuilt.
    for (let i = systems.length - 1; i >= 0; i--) systems[i][1].reset();
    for (const [name, adapter] of systems) adapter.restore(clone(snapshot.systems[name]));
    this.latest = id;
    return true;
  }

  clear() {
    const systems = [...this.systems.values()];
    for (let i = systems.length - 1; i >= 0; i--) systems[i].reset();
    this.snapshots.clear();
    this.latest = null;
  }
}

/**
 * Broadphase for the player's collider list.
 *
 * `Player._resolve` used to test the capsule against EVERY `THREE.Box3` in
 * `world.colliders`, twice a frame. The mansion carries thousands of them, and
 * the scan cost more than the whole rest of the controller. This is a uniform
 * grid over XZ that hands back only the boxes whose footprint could touch the
 * capsule, in the same ascending array order the brute-force loop walked, so
 * the resolver's behaviour is identical -- `tests/collider-broadphase.test.mjs`
 * proves that against a brute-force reference on random worlds.
 *
 * WHAT IT PROMISES. `query(x, z, r)` returns every index `i` for which the
 * live `colliders[i]` has an XZ bounding box that, grown by `r`, could contain
 * `(x, z)`. It may return more (a cell is 4 m wide; a hash collision merges two
 * cells), never fewer, so a candidate is always re-tested by the narrow phase.
 *
 * DYNAMIC COLLIDERS. Scenes do all of these to the array, and the grid has to
 * follow every one of them exactly:
 *   - replace it (`world.colliders = club.colliders`);
 *   - push / splice (doors, the siege's barricades, the heist's phases);
 *   - swap one box for another at the same length in one frame;
 *   - move a box IN PLACE (`truckCollider.min.set(...)`, the mansion cart's
 *     `cartCollider.copy(_seatBox)` every frame of Snow's errand, the Silent
 *     Squatch door sliding into the floor).
 * `sync()` rebuilds on identity/length change and otherwise walks the array
 * once comparing each box's identity and XZ extents with its snapshot,
 * re-filing only what moved. That walk is O(n) but it is four loads and four
 * compares per box -- roughly a tenth of what the old scan spent per box, and
 * the price of not needing scenes to tell us when they move a collider.
 *
 * Boxes with non-finite extents, or so large they would fill thousands of
 * cells (a floor slab the size of the map), live in an always-checked list
 * instead of the grid.
 */

const CELL = 4;
/** Boxes covering more cells than this go in the always-list. */
const MAX_CELLS = 4096;
/**
 * The query rectangle is grown by this much beyond the capsule radius so a
 * one-ulp disagreement between `p.x + r` here and `p.x - cx` in the narrow
 * phase can only ever ADD a candidate. Extra candidates cost a rejected test;
 * a missing one is a wall you walk through.
 */
const QUERY_EPS = 1e-6;

function cellOf(v, cell) { return Math.floor(v / cell); }
/* Two cells that hash alike merely share a bucket: still exact, slightly more
 * to test. Keep the multipliers odd and the result an int32. */
function hashCell(ix, iz) { return (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) | 0; }

export class ColliderGrid {
  constructor(cell = CELL) {
    this.cell = cell;
    this._array = null;
    this._n = 0;
    /** @type {Array<object|null>} box reference per index */
    this._boxes = [];
    /** minx, maxx, minz, maxz snapshot per index */
    this._ext = new Float64Array(0);
    /** @type {Map<number, number[]>} cell hash -> ascending? no: insertion order of indices */
    this._cells = new Map();
    /** Indices whose boxes are not in the grid (huge / non-finite). */
    this._always = [];
    /** Per index: 1 when the box lives in `_always`. */
    this._inAlways = new Uint8Array(0);
    /** Rebuild / re-file counters, exposed for tests and the perf HUD. */
    this.rebuilds = 0;
    this.refiles = 0;
  }

  /**
   * Bring the grid in line with `colliders`. Call once before querying in a
   * frame; cheap when nothing changed.
   */
  sync(colliders) {
    if (colliders !== this._array || colliders.length !== this._n) {
      this._rebuild(colliders);
      return;
    }
    const n = this._n;
    const boxes = this._boxes;
    const ext = this._ext;
    for (let i = 0; i < n; i++) {
      const b = colliders[i];
      const o = i * 4;
      if (b === boxes[i]
        && b.min.x === ext[o] && b.max.x === ext[o + 1]
        && b.min.z === ext[o + 2] && b.max.z === ext[o + 3]) continue;
      this._remove(i);
      this._insert(i, b);
      this.refiles++;
    }
  }

  _rebuild(colliders) {
    this._array = colliders;
    const n = this._n = colliders.length;
    this._boxes = new Array(n).fill(null);
    this._ext = new Float64Array(n * 4);
    this._inAlways = new Uint8Array(n);
    this._always.length = 0;
    this._cells.clear();
    for (let i = 0; i < n; i++) this._insert(i, colliders[i]);
    this.rebuilds++;
  }

  _insert(i, b) {
    const ext = this._ext;
    const o = i * 4;
    const minx = b.min.x, maxx = b.max.x, minz = b.min.z, maxz = b.max.z;
    ext[o] = minx; ext[o + 1] = maxx; ext[o + 2] = minz; ext[o + 3] = maxz;
    this._boxes[i] = b;
    const cell = this.cell;
    const x0 = cellOf(minx, cell), x1 = cellOf(maxx, cell);
    const z0 = cellOf(minz, cell), z1 = cellOf(maxz, cell);
    const span = (x1 - x0 + 1) * (z1 - z0 + 1);
    if (!(span >= 1 && span <= MAX_CELLS)) {
      /* NaN spans and Infinity spans both fail the first test: they go to the
       * always-list rather than into an infinite loop over cells. */
      this._inAlways[i] = 1;
      this._always.push(i);
      return;
    }
    this._inAlways[i] = 0;
    const cells = this._cells;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = hashCell(ix, iz);
        let list = cells.get(k);
        if (!list) cells.set(k, list = []);
        list.push(i);
      }
    }
  }

  _remove(i) {
    if (!this._boxes[i]) return;
    if (this._inAlways[i]) {
      const at = this._always.indexOf(i);
      if (at >= 0) this._always.splice(at, 1);
      this._inAlways[i] = 0;
      return;
    }
    const ext = this._ext;
    const o = i * 4;
    const cell = this.cell;
    const x0 = cellOf(ext[o], cell), x1 = cellOf(ext[o + 1], cell);
    const z0 = cellOf(ext[o + 2], cell), z1 = cellOf(ext[o + 3], cell);
    const cells = this._cells;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = cells.get(hashCell(ix, iz));
        if (!list) continue;
        const at = list.indexOf(i);
        if (at >= 0) list.splice(at, 1);
      }
    }
  }

  /**
   * Indices of every box whose footprint, grown by `r`, could contain (x, z),
   * ascending and unique. `out` is reused between calls -- read it before the
   * next query.
   * @returns {number[]}
   */
  query(x, z, r, out = []) {
    out.length = 0;
    const cell = this.cell;
    const rr = r + QUERY_EPS;
    const x0 = cellOf(x - rr, cell), x1 = cellOf(x + rr, cell);
    const z0 = cellOf(z - rr, cell), z1 = cellOf(z + rr, cell);
    const cells = this._cells;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = cells.get(hashCell(ix, iz));
        if (!list) continue;
        for (let k = 0; k < list.length; k++) out.push(list[k]);
      }
    }
    const always = this._always;
    for (let k = 0; k < always.length; k++) out.push(always[k]);
    if (out.length > 1) {
      out.sort(ascending);
      let w = 1;
      for (let k = 1; k < out.length; k++) {
        if (out[k] !== out[w - 1]) out[w++] = out[k];
      }
      out.length = w;
    }
    return out;
  }
}

function ascending(a, b) { return a - b; }

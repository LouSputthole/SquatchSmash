/**
 * Cover: where to stand so the bullets hit the furniture instead.
 *
 * Two sources feed one field:
 *   - AUTHORED nodes a level exports ({x, z, y, facing, height, id}) —
 *     the mission-area case the owner asked for;
 *   - DERIVED nodes minted from collider boxes (`deriveFromBoxes`) — a
 *     point on each face of a chest-high box, facing away from it — so an
 *     unscripted room still offers somewhere to crouch.
 *
 * `query()` scores candidates against a THREAT (usually the player):
 * a good point is near the seeker, inside the fight, puts the cover BETWEEN
 * occupant and threat, is not claimed, and has not been shot to pieces.
 * Squad claims come from squad.js so two men never choose the same crate.
 */
export class CoverField {
  constructor({ points = [] } = {}) {
    this.points = [];
    let n = 0;
    for (const p of points) this.add({ id: p.id ?? `cover-${n++}`, ...p });
  }

  add(p) {
    this.points.push({
      id: p.id ?? `cover-${this.points.length}`,
      x: p.x, z: p.z, y: p.y ?? 0,
      facing: { x: p.facing?.x ?? 0, z: p.facing?.z ?? 1 },
      height: p.height === 'low' ? 'low' : 'high',
      compromised: 0, // rises as rounds chew the point; decays slowly
      hits: 0,
    });
    return this.points[this.points.length - 1];
  }

  /**
   * Mint cover from AABB colliders: one candidate off the middle of each
   * long face of boxes between knee and head height.
   * @param {Array<{min:{x,y,z}, max:{x,y,z}}>} boxes
   * @param {object} [o] {margin, minSize, maxPoints}
   */
  deriveFromBoxes(boxes, { margin = 0.55, minSize = 0.5, maxPoints = 64 } = {}) {
    let added = 0;
    for (const b of boxes) {
      if (added >= maxPoints) break;
      const w = b.max.x - b.min.x;
      const d = b.max.z - b.min.z;
      const h = b.max.y - b.min.y;
      if (h < 0.7 || h > 2.6 || Math.max(w, d) < minSize) continue;
      const height = h < 1.25 ? 'low' : 'high';
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      const faces = [
        { x: cx, z: b.min.z - margin, facing: { x: 0, z: -1 } },
        { x: cx, z: b.max.z + margin, facing: { x: 0, z: 1 } },
        { x: b.min.x - margin, z: cz, facing: { x: -1, z: 0 } },
        { x: b.max.x + margin, z: cz, facing: { x: 1, z: 0 } },
      ];
      for (const f of faces) {
        if (added >= maxPoints) break;
        this.add({ ...f, y: b.min.y, height, id: `derived-${this.points.length}` });
        added++;
      }
    }
    return added;
  }

  /** Rounds landed near a point: it is getting less safe to be there. */
  noteImpactNear(x, z, radius = 1.4) {
    for (const p of this.points) {
      if (Math.hypot(p.x - x, p.z - z) <= radius) {
        p.hits++;
        p.compromised = Math.min(1, p.compromised + 0.18);
      }
    }
  }

  update(dt) {
    const step = Math.max(0, dt);
    for (const p of this.points) {
      if (p.compromised > 0) p.compromised = Math.max(0, p.compromised - 0.03 * step);
    }
  }

  /**
   * The best cover for a seeker against a threat.
   *
   * @param {object} o
   * @param {{x,z}} o.from     the seeker
   * @param {{x,z}} o.threat   what to hide from
   * @param {string} o.claimBy member id for squad claims
   * @param {object} [o.squad] SquadBlackboard for claim checks
   * @param {number} [o.maxDist] how far the seeker will run
   * @param {number} [o.minThreatDist] refuse cover closer to the threat than this
   * @param {(p)=>boolean} [o.filter] extra mission predicate (e.g. same floor)
   * @returns the chosen point (claimed), or null
   */
  query({
    from, threat, claimBy = null, squad = null,
    maxDist = 18, minThreatDist = 4, filter = null,
  }) {
    let best = null;
    let bestScore = -Infinity;
    for (const p of this.points) {
      const dSeeker = Math.hypot(p.x - from.x, p.z - from.z);
      if (dSeeker > maxDist) continue;
      const dThreat = Math.hypot(p.x - threat.x, p.z - threat.z);
      if (dThreat < minThreatDist) continue;
      if (filter && !filter(p)) continue;
      if (squad && claimBy) {
        const owner = squad.coverOwner(p.id);
        if (owner && owner !== claimBy) continue;
      }

      /* Does the point actually FACE the threat? The facing vector points
       * from the cover object outward through the occupant; good cover has
       * the threat on the far side, i.e. facing · toThreat < 0. */
      const tx = threat.x - p.x;
      const tz = threat.z - p.z;
      const tLen = Math.max(0.001, Math.hypot(tx, tz));
      const facingDot = (p.facing.x * tx + p.facing.z * tz) / tLen;

      let score = 0;
      score += facingDot < -0.25 ? 2.5 : facingDot < 0.1 ? 0.4 : -3;
      score -= dSeeker * 0.14; // near the seeker
      score += Math.min(dThreat, 25) * 0.05; // not on top of the threat
      score -= p.compromised * 2.2;
      if (best && Math.hypot(p.x - best.x, p.z - best.z) < 1) score -= 0.3;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && squad && claimBy) squad.claimCover(best.id, claimBy);
    return best;
  }
}

import * as THREE from 'three';

/**
 * Headless AABB queries for ground-combat sight lines and body movement.
 *
 * The defaults are the physical constants proven by Mansion Siege. Scenes
 * may tune them at construction time, but the collision rules stay here: a
 * segment uses a slab test, a body sweeps its leading edge one horizontal
 * axis at a time, and exact actor overlaps break by stable id rather than by
 * randomness or iteration timing.
 */

const AXES = Object.freeze(['x', 'y', 'z']);
const HORIZONTAL_AXES = Object.freeze(['x', 'z']);

export const DEFAULT_AABB_COMBAT_SPACE = Object.freeze({
  radius: 0.29,
  height: 1.72,
  separation: 0.52,
  verticalSeparation: 1.2,
  floorClearance: 0.08,
  headClearance: 0.04,
  originContainmentEpsilon: 1e-4,
  parallelEpsilon: 1e-6,
  movementEpsilon: 1e-8,
  minimumSegmentLength: 1e-4,
});

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value, fallback) {
  return Math.max(0, finite(value, fallback));
}

function pointFrom(value) {
  if (Array.isArray(value)) {
    return new THREE.Vector3(
      finite(value[0], 0), finite(value[1], 0), finite(value[2], 0),
    );
  }
  if (!value || !Number.isFinite(value.x)
    || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null;
  return new THREE.Vector3(value.x, value.y, value.z);
}

function hasValidBox(box) {
  return Boolean(box?.min && box?.max && AXES.every((axis) => (
    Number.isFinite(box.min[axis]) && Number.isFinite(box.max[axis])
  )));
}

function colliderId(box, index) {
  const id = box?.combatId ?? box?.id ?? box?.name
    ?? box?.userData?.combatId ?? box?.userData?.id;
  return id == null ? `~${String(index).padStart(10, '0')}` : String(id);
}

function colliderMaterial(box) {
  const value = box?.userData?.combatMaterial ?? box?.combatMaterial;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function entityPosition(entity) {
  if (entity && Number.isFinite(entity.x) && Number.isFinite(entity.y)
    && Number.isFinite(entity.z)) return entity;
  return entity?.position ?? entity?.root?.position ?? entity?.group?.position ?? null;
}

function entityId(entity) {
  const id = entity?.id ?? entity?.combatId ?? entity?.root?.userData?.combatId
    ?? entity?.root?.userData?.attackerId ?? entity?.root?.name ?? entity?.name;
  return id == null ? '' : String(id);
}

function eligiblePeer(peer) {
  return peer?.active !== false
    && peer?.incapacitated !== true
    && peer?.actor?.incapacitated !== true
    && peer?.down !== true;
}

function boundValue(bounds, axis, side) {
  const point = side === 'min' ? bounds?.min : bounds?.max;
  const scalar = side === 'min' ? bounds?.[`${axis}0`] : bounds?.[`${axis}1`];
  return finite(point?.[axis], finite(scalar, side === 'min' ? -Infinity : Infinity));
}

function clampToBounds(position, bounds) {
  if (!bounds) return false;
  let clamped = false;
  for (const axis of AXES) {
    const low = boundValue(bounds, axis, 'min');
    const high = boundValue(bounds, axis, 'max');
    const next = Math.min(high, Math.max(low, position[axis]));
    if (next !== position[axis]) {
      position[axis] = next;
      clamped = true;
    }
  }
  return clamped;
}

export class AabbCombatSpace {
  constructor({
    boxes = [],
    bounds = null,
    radius = DEFAULT_AABB_COMBAT_SPACE.radius,
    height = DEFAULT_AABB_COMBAT_SPACE.height,
    separation = DEFAULT_AABB_COMBAT_SPACE.separation,
    verticalSeparation = DEFAULT_AABB_COMBAT_SPACE.verticalSeparation,
    floorClearance = DEFAULT_AABB_COMBAT_SPACE.floorClearance,
    headClearance = DEFAULT_AABB_COMBAT_SPACE.headClearance,
    originContainmentEpsilon = DEFAULT_AABB_COMBAT_SPACE.originContainmentEpsilon,
    parallelEpsilon = DEFAULT_AABB_COMBAT_SPACE.parallelEpsilon,
    movementEpsilon = DEFAULT_AABB_COMBAT_SPACE.movementEpsilon,
    minimumSegmentLength = DEFAULT_AABB_COMBAT_SPACE.minimumSegmentLength,
  } = {}) {
    this.boxes = boxes ?? [];
    this.bounds = bounds;
    this.radius = nonNegative(radius, DEFAULT_AABB_COMBAT_SPACE.radius);
    this.height = nonNegative(height, DEFAULT_AABB_COMBAT_SPACE.height);
    this.separation = nonNegative(separation, DEFAULT_AABB_COMBAT_SPACE.separation);
    this.verticalSeparation = nonNegative(
      verticalSeparation, DEFAULT_AABB_COMBAT_SPACE.verticalSeparation,
    );
    this.floorClearance = nonNegative(
      floorClearance, DEFAULT_AABB_COMBAT_SPACE.floorClearance,
    );
    this.headClearance = nonNegative(
      headClearance, DEFAULT_AABB_COMBAT_SPACE.headClearance,
    );
    this.originContainmentEpsilon = nonNegative(
      originContainmentEpsilon, DEFAULT_AABB_COMBAT_SPACE.originContainmentEpsilon,
    );
    this.parallelEpsilon = nonNegative(
      parallelEpsilon, DEFAULT_AABB_COMBAT_SPACE.parallelEpsilon,
    );
    this.movementEpsilon = nonNegative(
      movementEpsilon, DEFAULT_AABB_COMBAT_SPACE.movementEpsilon,
    );
    this.minimumSegmentLength = nonNegative(
      minimumSegmentLength, DEFAULT_AABB_COMBAT_SPACE.minimumSegmentLength,
    );
  }

  /**
   * Return the first box crossed by the finite segment, or null.
   *
   * The returned `point` is always a new Vector3. A box containing the segment
   * origin is skipped so a body standing against its own cover is not blinded
   * by that cover. Equal-distance hits use the collider's stable id.
   */
  trace(from, to, {
    boxes = this.boxes,
    skipRadius = this.originContainmentEpsilon,
    ignore = null,
  } = {}) {
    return this.traceAll(from, to, { boxes, skipRadius, ignore })[0] ?? null;
  }

  /**
   * Return every box crossed by the finite segment in deterministic travel order.
   *
   * Contacts expose entry/exit points, path thickness and only the Adapter's
   * explicit `userData.combatMaterial`/`combatMaterial` tag. Names and render
   * materials are deliberately ignored so decorative geometry cannot become
   * penetrable by accident.
   */
  traceAll(from, to, {
    boxes = this.boxes,
    skipRadius = this.originContainmentEpsilon,
    ignore = null,
  } = {}) {
    const start = pointFrom(from);
    const end = pointFrom(to);
    if (!start || !end) return [];
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < this.minimumSegmentLength) return [];

    const contacts = [];
    let index = 0;
    for (const box of boxes ?? []) {
      const order = index++;
      if (!hasValidBox(box)) continue;
      if (ignore === box || ignore?.has?.(box)
        || (typeof ignore === 'function' && ignore(box))) continue;

      const originInside = AXES.every((axis) => (
        start[axis] >= box.min[axis] - skipRadius
        && start[axis] <= box.max[axis] + skipRadius
      ));
      if (originInside) continue;

      let t0 = 0;
      let t1 = 1;
      let clear = false;
      for (const axis of AXES) {
        const axisDelta = delta[axis];
        const low = box.min[axis];
        const high = box.max[axis];
        if (Math.abs(axisDelta) < this.parallelEpsilon) {
          if (start[axis] < low || start[axis] > high) clear = true;
          if (clear) break;
          continue;
        }
        let near = (low - start[axis]) / axisDelta;
        let far = (high - start[axis]) / axisDelta;
        if (near > far) [near, far] = [far, near];
        t0 = Math.max(t0, near);
        t1 = Math.min(t1, far);
        if (t0 > t1) {
          clear = true;
          break;
        }
      }
      if (clear || t0 < 0 || t0 > 1) continue;

      const distance = Math.max(0, t0 * length);
      const id = colliderId(box, order);
      const exitT = Math.max(t0, Math.min(1, t1));
      const exitDistance = Math.max(distance, exitT * length);
      contacts.push({
        box,
        id,
        t: t0,
        exitT,
        distance,
        exitDistance,
        thickness: exitDistance - distance,
        point: start.clone().addScaledVector(delta, t0),
        exitPoint: start.clone().addScaledVector(delta, exitT),
        material: colliderMaterial(box),
        order,
      });
    }
    contacts.sort((a, b) => {
      const deltaDistance = a.distance - b.distance;
      if (Math.abs(deltaDistance) > this.parallelEpsilon) return deltaDistance;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return a.order - b.order;
    });
    for (const contact of contacts) delete contact.order;
    return contacts;
  }

  _bodyOverlapsHeight(position, box) {
    return box.max.y > position.y + this.floorClearance
      && box.min.y < position.y + this.height - this.headClearance;
  }

  _moveAxis(position, axis, delta, boxes, contacts) {
    if (Math.abs(delta) < this.movementEpsilon) return 0;
    const orthogonal = axis === 'x' ? 'z' : 'x';
    const start = position[axis];
    let wanted = start + delta;
    for (const box of boxes ?? []) {
      if (!hasValidBox(box) || !this._bodyOverlapsHeight(position, box)) continue;
      const across = position[orthogonal];
      if (across < box.min[orthogonal] - this.radius
        || across > box.max[orthogonal] + this.radius) continue;
      const low = box.min[axis] - this.radius;
      const high = box.max[axis] + this.radius;
      const before = wanted;
      if (delta > 0 && start <= low && wanted > low) wanted = Math.min(wanted, low);
      else if (delta < 0 && start >= high && wanted < high) wanted = Math.max(wanted, high);
      else if (start > low && start < high && wanted > low && wanted < high) {
        /* Permit recovery from a bad restore, but never movement deeper into
         * the collider that already contains the body. */
        const centre = (low + high) * 0.5;
        if (Math.abs(wanted - centre) < Math.abs(start - centre)) wanted = start;
      }
      if (wanted !== before) contacts.add(box);
    }
    position[axis] = wanted;
    return wanted - start;
  }

  /**
   * Mutate `position` by the requested horizontal displacement.
   *
   * X and Z resolve independently, producing a wall slide. Leading edges are
   * swept, so a large frame cannot jump a thin collider. The result records
   * the actual displacement and whether collision or bounds trimmed it.
   */
  move(position, displacement, {
    boxes = this.boxes,
    bounds = this.bounds,
  } = {}) {
    const livePosition = entityPosition(position);
    const wanted = pointFrom(displacement) ?? new THREE.Vector3();
    if (!livePosition) throw new TypeError('AabbCombatSpace.move needs a mutable position');
    const before = pointFrom(livePosition);
    const contacts = new Set();

    for (const axis of HORIZONTAL_AXES) {
      this._moveAxis(livePosition, axis, wanted[axis], boxes, contacts);
    }
    const clamped = clampToBounds(livePosition, bounds);
    const actual = pointFrom(livePosition).sub(before);
    const expected = new THREE.Vector3(wanted.x, 0, wanted.z);
    const blocked = clamped || Math.abs(actual.x - expected.x) > this.movementEpsilon
      || Math.abs(actual.z - expected.z) > this.movementEpsilon;

    return {
      position: livePosition,
      displacement: actual,
      moved: Math.hypot(actual.x, actual.z),
      blocked,
      clamped,
      contacts: [...contacts],
    };
  }

  /**
   * Push one live subject out of overlapping peers, using `move` for every
   * correction so separation never grants passage through a wall.
   *
   * Exact coordinate ties choose -X for the lexically lower id and +X for the
   * higher id. Stable unique ids are therefore part of the Adapter contract.
   */
  separate(subject, peers, {
    boxes = this.boxes,
    bounds = this.bounds,
    separation = this.separation,
    verticalSeparation = this.verticalSeparation,
    positionOf = entityPosition,
    idOf = entityId,
    eligible = eligiblePeer,
    id = null,
  } = {}) {
    const position = positionOf(subject);
    if (!position) throw new TypeError('AabbCombatSpace.separate needs a mutable subject position');
    const before = pointFrom(position);
    const subjectId = String(id ?? idOf(subject) ?? '');
    const ordered = [...(peers ?? [])]
      .map((peer, index) => ({ peer, index, id: String(idOf(peer) ?? '') }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.index - b.index);
    let overlaps = 0;
    let blocked = false;
    const contacts = new Set();

    for (const record of ordered) {
      const peer = record.peer;
      if (!peer || peer === subject || !eligible(peer, subject)) continue;
      const other = positionOf(peer);
      if (!other || Math.abs(other.y - position.y) > verticalSeparation) continue;
      let dx = position.x - other.x;
      let dz = position.z - other.z;
      let distance = Math.hypot(dx, dz);
      if (distance >= separation) continue;
      overlaps++;
      let divisor = distance;
      if (distance < this.movementEpsilon) {
        const direction = subjectId < record.id ? -1 : 1;
        dx = direction;
        dz = 0;
        divisor = 1;
      }
      const push = separation - distance;
      const result = this.move(position, new THREE.Vector3(
        (dx / divisor) * push,
        0,
        (dz / divisor) * push,
      ), { boxes, bounds });
      blocked ||= result.blocked;
      for (const contact of result.contacts) contacts.add(contact);
    }

    const displacement = pointFrom(position).sub(before);
    return {
      position,
      displacement,
      moved: Math.hypot(displacement.x, displacement.z),
      blocked,
      overlaps,
      contacts: [...contacts],
    };
  }
}

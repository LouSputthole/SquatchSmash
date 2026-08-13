import * as THREE from 'three';

function immutableVector(value) {
  let vector = null;
  if (value?.isVector3) vector = value.clone();
  else if (value && Number.isFinite(value.x)
    && Number.isFinite(value.y) && Number.isFinite(value.z)) {
    vector = new THREE.Vector3(value.x, value.y, value.z);
  }
  return vector ? Object.freeze(vector) : null;
}

function immutableImpact(impact = {}) {
  return Object.freeze({
    point: immutableVector(impact.point),
    normal: immutableVector(impact.normal),
    origin: immutableVector(impact.origin),
    direction: immutableVector(impact.direction),
    distance: Number.isFinite(Number(impact.distance)) ? Number(impact.distance) : null,
    object: impact.object ?? null,
    weapon: impact.weapon ?? null,
    damage: Number.isFinite(Number(impact.damage)) ? Number(impact.damage) : null,
    penetration: Number.isFinite(Number(impact.penetration)) ? Number(impact.penetration) : null,
  });
}

function field(value, object, context) {
  return typeof value === 'function' ? value(object, context) : value;
}

function ancestorValue(object, key, stop = null) {
  let node = object ?? null;
  while (node) {
    if (node.userData?.[key] != null) return node.userData[key];
    if (node === stop) break;
    node = node.parent ?? null;
  }
  return null;
}

function defaultAnchor(object, root) {
  let node = object ?? null;
  while (node) {
    if (node.userData?.hitZone != null || node.userData?.hitPart != null) return node;
    if (node === root) break;
    node = node.parent ?? null;
  }
  return root ?? null;
}

function localNormal(anchor, normal) {
  if (!anchor?.matrixWorld || !normal?.isVector3) return null;
  const transform = new THREE.Matrix3().setFromMatrix4(anchor.matrixWorld).transpose();
  return normal.clone().applyMatrix3(transform).normalize();
}

function capturedLocalContact(impact, anchor) {
  if (!anchor || !Array.isArray(impact?.localContacts)) return null;
  return impact.localContacts.find((contact) => contact?.anchor === anchor) ?? null;
}

/** Locate a world impact on a registered combatant and apply shared actor damage. */
export class CombatImpactResolver {
  constructor() {
    this.registry = new Map();
  }

  /**
   * Register one hittable hierarchy. Descriptor values may be constants or
   * `(hitObject, context) => value` functions. `zoneOf`, `partOf`, `anchorOf`
   * and `materialOf` default to the nearest tagged ancestor when omitted.
   * The returned function unregisters only this exact registration.
   */
  register(root, descriptor = {}) {
    if (!root?.isObject3D) throw new TypeError('CombatImpactResolver.register needs an Object3D root');
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('CombatImpactResolver.register needs a descriptor');
    }
    const registration = { descriptor };
    this.registry.set(root, registration);
    let registered = true;
    return () => {
      if (!registered) return false;
      registered = false;
      if (this.registry.get(root) !== registration) return false;
      this.registry.delete(root);
      return true;
    };
  }

  /**
   * Resolve and apply one complete WeaponSystem impact. `impact` on the
   * returned Located hit is a frozen world-space record with frozen vector
   * clones; point/normal/origin/direction are also exposed directly. Anchor
   * locals are captured before `actor.applyHit`, so a fatal pose cannot move
   * the wound to the victim's former standing transform.
   */
  resolve(impact, {
    attacker,
    playerShot = false,
    damage = impact?.damage,
    lethalHeadshots = true,
    damageScale = 1,
  } = {}) {
    const record = immutableImpact(impact);
    const object = record.object;
    let root = object;
    let registration = null;
    while (root) {
      registration = this.registry.get(root) ?? null;
      if (registration) break;
      root = root.parent ?? null;
    }
    if (!registration) {
      return {
        ...record,
        impact: record,
        applied: false,
        fatal: false,
        lethal: false,
        reason: 'unregistered',
      };
    }

    const descriptor = registration.descriptor;
    const context = { impact: record, rawImpact: impact, object, root, descriptor };
    const combatant = field(descriptor.combatant, object, context) ?? null;
    const actor = field(descriptor.actor, object, { ...context, combatant })
      ?? combatant?.actor ?? root.userData?.combatActor ?? null;
    const inactive = root.visible === false
      || combatant?.active === false
      || combatant?.down === true
      || actor?.incapacitated === true;
    if (inactive) {
      return {
        ...record,
        impact: record,
        applied: false, fatal: false, lethal: false, reason: 'inactive',
        root, combatant, actor,
      };
    }
    if (!actor?.applyHit) {
      return {
        ...record,
        impact: record,
        applied: false, fatal: false, lethal: false, reason: 'no-actor',
        root, combatant, actor: null,
      };
    }

    const zone = field(descriptor.zoneOf, object, { ...context, combatant, actor })
      ?? ancestorValue(object, 'hitZone', root) ?? 'chest';
    const part = field(descriptor.partOf, object, { ...context, combatant, actor, zone })
      ?? ancestorValue(object, 'hitPart', root) ?? zone;
    const anchor = field(descriptor.anchorOf, object, {
      ...context, combatant, actor, zone, part,
    }) ?? defaultAnchor(object, root);
    const material = field(descriptor.materialOf, object, {
      ...context, combatant, actor, zone, part, anchor,
    }) ?? ancestorValue(object, 'combatMaterial', root)
      ?? ancestorValue(object, 'material', root)
      ?? 'flesh';
    anchor?.updateWorldMatrix?.(true, false);
    /* WeaponSystem captures these samples when the ray is fired. Prefer that
     * exact body-anchor space over converting the old world contact through a
     * transform that may have moved during visible tracer flight. Callers
     * without capture metadata retain the synchronous resolver fallback. */
    const captured = capturedLocalContact(impact, anchor);
    const localPoint = captured?.point?.isVector3
      ? captured.point.clone()
      : anchor?.worldToLocal && record.point?.isVector3
        ? anchor.worldToLocal(record.point.clone()) : null;
    const localSurfaceNormal = captured?.normal?.isVector3
      ? captured.normal.clone()
      : localNormal(anchor, record.normal);
    const anchorLocalPoint = localPoint ? Object.freeze(localPoint) : null;
    const anchorLocalNormal = localSurfaceNormal ? Object.freeze(localSurfaceNormal) : null;
    const lethal = lethalHeadshots === true && zone === 'head';
    const amount = Math.max(0, Number(damage) || 0)
      * Math.max(0, Number(damageScale) || 0);
    const rawResult = actor.applyHit({ amount, attacker, playerShot, lethal });
    const result = Object.freeze({ ...rawResult });

    return {
      ...record,
      impact: record,
      applied: result.applied === true,
      fatal: result.fatal === true,
      lethal,
      reason: result.reason ?? null,
      result,
      root,
      combatant,
      actor,
      zone,
      part,
      anchor,
      material,
      anchorLocalPoint,
      anchorLocalNormal,
    };
  }
}

import * as THREE from 'three';

function point(value) {
  if (value?.isVector3) return value;
  return new THREE.Vector3(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
}

/**
 * Vehicle-owned seat transforms for NPCs, props, and camera attachment points.
 *
 * Occupants are parented to anchors. They inherit translation, rotation,
 * suspension, and body roll through the scene graph; no frame loop chases a
 * moving car with copied world coordinates. Non-Object3D players use
 * `worldPoint()` against the same anchor, so camera and bodies share one seat
 * contract.
 */
export class VehicleOccupants {
  constructor(vehicleRoot, anchors = {}) {
    if (!vehicleRoot?.isObject3D) throw new TypeError('VehicleOccupants requires a vehicle Object3D');
    this.root = vehicleRoot;
    this.anchors = new Map();
    this.attachments = new Map();

    for (const [id, value] of Object.entries(anchors)) {
      const anchor = value?.isObject3D ? value : new THREE.Object3D();
      anchor.name ||= `vehicle.anchor.${id}`;
      if (!value?.isObject3D) anchor.position.copy(point(value));
      if (anchor.parent !== vehicleRoot) vehicleRoot.add(anchor);
      this.anchors.set(id, anchor);
    }
  }

  has(id) { return this.anchors.has(id); }
  anchor(id) { return this.anchors.get(id) ?? null; }

  worldPoint(id, offset = null, out = new THREE.Vector3()) {
    const anchor = this.anchor(id);
    if (!anchor) return null;
    anchor.updateWorldMatrix(true, false);
    out.copy(offset ? point(offset) : new THREE.Vector3());
    return anchor.localToWorld(out);
  }

  attach(id, object3D, {
    offset = null,
    drop = 0,
    localYaw = 0,
  } = {}) {
    const anchor = this.anchor(id);
    if (!anchor || !object3D?.isObject3D) return false;

    for (const [otherId, attachment] of this.attachments) {
      if (attachment.object3D === object3D) this.release(otherId);
    }
    if (this.attachments.has(id)) this.release(id);

    const restoreParent = object3D.parent ?? this.root.parent ?? null;
    anchor.add(object3D);
    const local = offset ? point(offset) : new THREE.Vector3(0, -drop, 0);
    object3D.position.copy(local);
    object3D.rotation.set(0, localYaw, 0);
    object3D.userData.vehicleAnchor = id;
    this.attachments.set(id, { object3D, restoreParent });
    return true;
  }

  release(id) {
    const attachment = this.attachments.get(id);
    if (!attachment) return null;
    const { object3D, restoreParent } = attachment;
    this.root.updateWorldMatrix(true, true);
    const destination = restoreParent?.isObject3D ? restoreParent : this.root.parent;
    if (destination?.isObject3D) destination.attach(object3D);
    else object3D.removeFromParent();
    delete object3D.userData.vehicleAnchor;
    this.attachments.delete(id);
    return object3D;
  }

  object(id) { return this.attachments.get(id)?.object3D ?? null; }
  ids() { return [...this.attachments.keys()]; }
  get size() { return this.attachments.size; }

  clear() {
    for (const id of [...this.attachments.keys()]) this.release(id);
  }
}

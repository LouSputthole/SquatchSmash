import * as THREE from 'three';

/**
 * Axis-aligned bounds for an Object3D expressed in another Object3D's frame.
 *
 * World-space AABBs are not suitable for clearance inside a moving vehicle:
 * pitch and roll expand both boxes along world Y, and the lowest corner of a
 * roof can be compared with a rider on the opposite side of the cabin. This
 * keeps every mesh in the vehicle's physical frame before taking its bounds.
 *
 * The result covers transformed mesh geometry. It intentionally does not
 * approximate an InstancedMesh's per-instance transforms.
 */
export function boundsInFrame(object, frame, out = new THREE.Box3()) {
  if (!object?.isObject3D || !frame?.isObject3D) {
    throw new TypeError('boundsInFrame requires Object3D object and frame values');
  }

  frame.updateWorldMatrix(true, false);
  object.updateWorldMatrix(true, true);

  const frameInverse = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const transform = new THREE.Matrix4();
  out.makeEmpty();

  object.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry || mesh.isInstancedMesh) return;
    let localBounds = null;
    if (mesh.isSkinnedMesh && typeof mesh.computeBoundingBox === 'function') {
      mesh.computeBoundingBox();
      localBounds = mesh.boundingBox;
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      localBounds = mesh.geometry.boundingBox;
    }
    if (!localBounds || localBounds.isEmpty()) return;
    transform.multiplyMatrices(frameInverse, mesh.matrixWorld);
    out.union(localBounds.clone().applyMatrix4(transform));
  });

  return out;
}

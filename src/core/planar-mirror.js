import * as THREE from 'three';

const _center = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _cameraPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _cameraTarget = new THREE.Vector3();
const _planeDelta = new THREE.Vector3();
const _reflectedPosition = new THREE.Vector3();
const _reflectedTarget = new THREE.Vector3();
const _worldUp = new THREE.Vector3();
const _reflectedUp = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

export function reflectPointAcrossPlane(point, planePoint, planeNormal, out = new THREE.Vector3()) {
  const distance = _planeDelta.copy(point).sub(planePoint).dot(planeNormal);
  return out.copy(point).addScaledVector(planeNormal, -2 * distance);
}

function reflectDirectionAcrossPlane(direction, planeNormal, out) {
  return out.copy(direction).addScaledVector(planeNormal, -2 * direction.dot(planeNormal));
}

/**
 * Canonical real-time planar reflection used by every playable bathroom.
 *
 * The mirror plane is derived from the mounted mesh's world transform. A
 * scene supplies only presentation policy (size, grime/cracks, visibility),
 * never another reflection camera or hard-coded world plane.
 */
export class PlanarMirror {
  constructor(scene, mirrorMesh, {
    width = 0.85,
    height = 1.05,
    resolution = [320, 400],
    tint = 0xc6ccd2,
    localNormal = new THREE.Vector3(0, 0, 1),
    overlayMaterial = null,
    overlayOffset = 0.006,
    maxDistance = 12,
    visibleWhen = null,
    enabled = false,
  } = {}) {
    if (!scene?.isScene || !mirrorMesh?.isMesh) {
      throw new TypeError('PlanarMirror requires a THREE.Scene and mounted mirror mesh');
    }
    this.scene = scene;
    this.mesh = mirrorMesh;
    this.width = width;
    this.height = height;
    this.localNormal = localNormal.clone().normalize();
    this.maxDistance = maxDistance;
    this.visibleWhen = visibleWhen;
    this.enabled = enabled;

    this.target = new THREE.WebGLRenderTarget(resolution[0], resolution[1], {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.target.texture.wrapS = THREE.RepeatWrapping;
    this.target.texture.repeat.x = -1;
    this.target.texture.offset.x = 1;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 80);
    this.camera.layers.enable(1);
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture, color: tint });
    this.mesh.material = this.material;

    this.overlay = null;
    if (overlayMaterial) {
      const overlay = new THREE.Mesh(new THREE.PlaneGeometry(width, height), overlayMaterial);
      overlay.name = `${mirrorMesh.name || 'mirror'}.overlay`;
      overlay.position.copy(mirrorMesh.position);
      overlay.rotation.copy(mirrorMesh.rotation);
      _normal.copy(this.localNormal).applyQuaternion(mirrorMesh.quaternion).multiplyScalar(overlayOffset);
      overlay.position.add(_normal);
      const fixtureGate = mirrorMesh.parent?.userData?.geometryGate;
      if (fixtureGate) overlay.userData.geometryGate = { ...fixtureGate };
      overlay.renderOrder = 2;
      (mirrorMesh.parent ?? scene).add(overlay);
      this.overlay = overlay;
    }
  }

  plane(outCenter = _center, outNormal = _normal) {
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(outCenter);
    this.mesh.getWorldQuaternion(_quaternion);
    outNormal.copy(this.localNormal).applyQuaternion(_quaternion).normalize();
    return { center: outCenter, normal: outNormal };
  }

  render(renderer, sourceCamera) {
    if (!this.enabled || !renderer || !sourceCamera) return false;
    const { center, normal } = this.plane();
    sourceCamera.getWorldPosition(_cameraPosition);
    if (Number.isFinite(this.maxDistance)
      && _cameraPosition.distanceToSquared(center) > this.maxDistance * this.maxDistance) return false;
    if (this.visibleWhen && !this.visibleWhen(sourceCamera, center, normal)) return false;

    sourceCamera.getWorldDirection(_cameraDirection);
    _cameraTarget.copy(_cameraPosition).add(_cameraDirection);
    reflectPointAcrossPlane(_cameraPosition, center, normal, _reflectedPosition);
    reflectPointAcrossPlane(_cameraTarget, center, normal, _reflectedTarget);

    sourceCamera.getWorldQuaternion(_quaternion);
    _worldUp.copy(sourceCamera.up).applyQuaternion(_quaternion);
    reflectDirectionAcrossPlane(_worldUp, normal, _reflectedUp).normalize();

    this.camera.position.copy(_reflectedPosition);
    this.camera.up.copy(_reflectedUp);
    this.camera.fov = sourceCamera.fov;
    this.camera.far = sourceCamera.far;
    this.camera.near = Math.max(0.03, Math.abs(_planeDelta.copy(_cameraPosition).sub(center).dot(normal)) + 0.03);
    if (this.camera.near >= this.camera.far) return false;
    this.camera.lookAt(_reflectedTarget);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    const previousTarget = renderer.getRenderTarget();
    const meshVisible = this.mesh.visible;
    const overlayVisible = this.overlay?.visible;
    try {
      this.mesh.visible = false;
      if (this.overlay) this.overlay.visible = false;
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      this.mesh.visible = meshVisible;
      if (this.overlay) this.overlay.visible = overlayVisible;
    }
    return true;
  }

  dispose() {
    this.overlay?.removeFromParent();
    this.overlay?.geometry?.dispose();
    this.overlay?.material?.dispose?.();
    this.material.dispose();
    this.target.dispose();
  }
}

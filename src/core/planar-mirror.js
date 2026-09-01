import * as THREE from 'three';

const _center = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _cameraPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _cameraTarget = new THREE.Vector3();
const _planeDelta = new THREE.Vector3();
const _reflectedPosition = new THREE.Vector3();
const _reflectedUp = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

export function reflectPointAcrossPlane(point, planePoint, planeNormal, out = new THREE.Vector3()) {
  const distance = _planeDelta.copy(point).sub(planePoint).dot(planeNormal);
  return out.copy(point).addScaledVector(planeNormal, -2 * distance);
}

/**
 * Canonical real-time planar reflection used by every playable bathroom.
 *
 * The mirror plane is derived from the mounted mesh's world transform. A
 * scene supplies only presentation policy (grime/cracks, visibility),
 * never another reflection camera or hard-coded world plane.
 *
 * The virtual camera's frustum is fitted through the four corners of the
 * glass quad (an off-axis projection from the reflected eye), so the glass
 * shows exactly the solid angle a mirror that size subtends — no more. The
 * first version reused the player's full FOV aimed at the mirror centre,
 * which crammed the whole room into a 0.54 m cabinet door and drew the
 * Prospect at a quarter of his real mirror size. Owner, 2026-08-31: "clip
 * jagged edges + over-reflection on all mirrors besides Squatchfather" —
 * the jagged edges were the unantialiased render target (now 4x MSAA), the
 * over-reflection was that oversized frustum.
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
    /* The glass PlaneGeometry is the single truth for the frustum fit;
     * options are only a fallback for meshes without plane parameters.
     * (The luxury vanity shipped a 0.72x0.84 glass configured 0.54x0.66,
     * and the mismatch stretched its whole reflection.) Mirrors mount at
     * unit world scale; a scaled mount would need these multiplied out. */
    const params = mirrorMesh.geometry?.parameters;
    this.width = Number.isFinite(params?.width) ? params.width : width;
    this.height = Number.isFinite(params?.height) ? params.height : height;
    this.localNormal = localNormal.clone().normalize();
    // Local up spans the glass's vertical; Gram-Schmidt keeps it valid for
    // any authored localNormal (every current mirror is a +Z plane).
    this.localUp = new THREE.Vector3(0, 1, 0)
      .addScaledVector(this.localNormal, -this.localNormal.y);
    if (this.localUp.lengthSq() < 1e-6) this.localUp.set(0, 0, 1);
    this.localUp.normalize();
    this.maxDistance = maxDistance;
    this.visibleWhen = visibleWhen;
    this.enabled = enabled;

    this.target = new THREE.WebGLRenderTarget(resolution[0], resolution[1], {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      samples: 4,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.target.texture.wrapS = THREE.RepeatWrapping;
    this.target.texture.repeat.x = -1;
    this.target.texture.offset.x = 1;

    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 80);
    this.camera.layers.enable(1);
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture, color: tint });
    this.mesh.material = this.material;

    this.overlay = null;
    if (overlayMaterial) {
      const overlay = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height), overlayMaterial);
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
    // Behind the glass or edge-on, there is nothing to fit a frustum through.
    const facing = _planeDelta.copy(_cameraPosition).sub(center).dot(normal);
    if (facing < 0.015) return false;
    if (Number.isFinite(this.maxDistance)
      && _cameraPosition.distanceToSquared(center) > this.maxDistance * this.maxDistance) return false;
    if (this.visibleWhen && !this.visibleWhen(sourceCamera, center, normal)) return false;

    /* The virtual eye is the player's eye reflected across the glass. It
     * faces the plane square-on with the glass's own vertical as up, and the
     * projection is fitted through the quad's corners below — the aim never
     * follows the player's look direction, only their position. */
    reflectPointAcrossPlane(_cameraPosition, center, normal, _reflectedPosition);
    this.mesh.getWorldQuaternion(_quaternion);
    _reflectedUp.copy(this.localUp).applyQuaternion(_quaternion).normalize();
    this.camera.position.copy(_reflectedPosition);
    this.camera.up.copy(_reflectedUp);
    this.camera.far = sourceCamera.far;
    _cameraTarget.copy(_reflectedPosition).add(normal);
    this.camera.lookAt(_cameraTarget);
    this.camera.updateMatrixWorld(true);

    /* Off-axis frustum through the glass corners. The near plane sits at the
     * glass itself, which also clips the cabinet carcass and wall behind it.
     * The render fills the target with exactly the quad's view, so the plain
     * plane UVs map it back 1:1 and the constructor's X-flip restores mirror
     * handedness. updateProjectionMatrix() would clobber this — never call
     * it after. */
    _cameraDirection.copy(center).applyMatrix4(this.camera.matrixWorldInverse);
    const distance = -_cameraDirection.z;
    if (!(distance > 0.01)) return false;
    const near = Math.max(0.02, distance * 0.999);
    if (near >= this.camera.far) return false;
    const scale = near / distance;
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.camera.near = near;
    this.camera.projectionMatrix.makePerspective(
      (_cameraDirection.x - halfW) * scale,
      (_cameraDirection.x + halfW) * scale,
      (_cameraDirection.y + halfH) * scale,
      (_cameraDirection.y - halfH) * scale,
      near,
      this.camera.far,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

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

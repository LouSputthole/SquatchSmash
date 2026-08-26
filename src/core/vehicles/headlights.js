import * as THREE from 'three';

/**
 * Build the one fog-volume shape every vehicle headlight uses.
 *
 * Three's ConeGeometry points toward local +Y and puts its wide base at -Y.
 * Laying that stock cone down with -PI/2 therefore puts the wide end at the
 * lamp and the point down the road: the exact backwards beam that survived in
 * both Special Meeting and Initiation. This geometry is transformed once so
 * its TIP is at local x=0 and its BASE is at local x=1. Callers can only scale
 * it longer/wider; they cannot accidentally reverse the invariant.
 */
export function createHeadlightBeamGeometry({ radialSegments = 12 } = {}) {
  const geometry = new THREE.ConeGeometry(1, 1, radialSegments, 1, true);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(0.5, 0, 0);
  geometry.userData.headlightBeam = Object.freeze({
    axis: '+x',
    tipX: 0,
    baseX: 1,
  });
  return geometry;
}

/**
 * Create a visible beam whose local origin is the headlight filament.
 * `reach` is metres forward and `farRadius` is the radius at that distance.
 */
export function createHeadlightBeam({
  geometry = null,
  material = null,
  reach = 16,
  farRadius = 1.5,
  name = 'headlight.beam',
  color = 0xffe9c0,
  opacity = 0.09,
  fog = true,
} = {}) {
  const ownedGeometry = geometry ?? createHeadlightBeamGeometry();
  const ownedMaterial = material ?? new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog,
  });
  const beam = new THREE.Mesh(ownedGeometry, ownedMaterial);
  beam.name = name;
  beam.castShadow = false;
  beam.receiveShadow = false;
  beam.renderOrder = 3;
  beam.userData.sceneAuditIgnore = true;
  setHeadlightBeamProfile(beam, { reach, farRadius });
  return beam;
}

/** Keep the tip fixed at the fixture while changing dipped/main-beam policy. */
export function setHeadlightBeamProfile(beam, { reach, farRadius }) {
  const length = Math.max(0.01, Number(reach) || 0.01);
  const radius = Math.max(0.001, Number(farRadius) || 0.001);
  beam.scale.set(length, radius, radius);
  beam.userData.headlightBeam = Object.freeze({
    axis: '+x',
    nearRadius: 0,
    farRadius: radius,
    reach: length,
  });
  return beam;
}

/** Aim local +X at a car-local direction without moving the beam origin. */
export function aimHeadlightBeam(beam, direction) {
  const target = direction?.isVector3
    ? direction.clone()
    : new THREE.Vector3(direction?.x ?? 1, direction?.y ?? 0, direction?.z ?? 0);
  if (target.lengthSq() < 1e-8) target.set(1, 0, 0);
  target.normalize();
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), target);
  return beam;
}

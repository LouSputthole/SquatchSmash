import * as THREE from 'three';

/**
 * Stable Palace route and encounter landmarks.
 *
 * Cast choreography needs these positions without importing the entire estate
 * builder (and its browser-authored texture dependencies). Keeping the data in
 * this small Palace-owned module also lets headless combat tests exercise the
 * cast without constructing decorative geometry.
 */
export const PALACE_ANCHORS = Object.freeze({
  approach: Object.freeze(new THREE.Vector3(14, 0, 76)),
  powerBox: Object.freeze(new THREE.Vector3(19.2, 1.15, 61.2)),
  perimeter: Object.freeze(new THREE.Vector3(14, 0, 51)),
  estate: Object.freeze(new THREE.Vector3(12.5, 0, 4)),
  belongings: Object.freeze(new THREE.Vector3(4.7, 0.72, -6.4)),
  paymentLedger: Object.freeze(new THREE.Vector3(-10.6, 0.88, -6.8)),
  securityStill: Object.freeze(new THREE.Vector3(14.8, 1.22, -10.2)),
  gallery: Object.freeze(new THREE.Vector3(0, 0, -25)),
  diningRoom: Object.freeze(new THREE.Vector3(0, 0, -42)),
  mark: Object.freeze(new THREE.Vector3(-3.2, 0, -40.8)),
  sauce: Object.freeze(new THREE.Vector3(3.2, 0, -40.8)),
  extraction: Object.freeze(new THREE.Vector3(0, 0, -55)),
});

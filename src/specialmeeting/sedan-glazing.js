/**
 * The Lincoln greenhouse used by both halves of THE SPECIAL MEETING.
 *
 * `makeCar()` supplies one solid glass box because that is cheap and correct
 * for background traffic viewed from outside. It is not a window system for a
 * car the player occupies: from a seat it becomes a tinted cube around the
 * camera, and adding a separate windscreen on top of it only doubles the
 * obstruction. Both the kerb car and the forest fallback therefore replace
 * that shell with the same six real panes here.
 */
import * as THREE from 'three';

const PANE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

/**
 * Mint an interior-safe glass material. Callers own and dispose the result.
 *
 * Transparent panes do not write depth: otherwise a faint pane can prevent
 * the forest, occupants, or headlights behind it from being drawn at all.
 */
export function createSedanGlassMaterial({
  color = 0x11161c,
  roughness = 0.05,
  metalness = 0.2,
  opacity = 0.16,
} = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function pane(parent, { name, size, position, rotationZ = 0, material }) {
  const mesh = new THREE.Mesh(PANE_GEOMETRY, material);
  mesh.name = name;
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.z = rotationZ;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

/**
 * Replace the borrowed solid greenhouse with a windscreen, rear pane, and
 * four independent side panes.
 *
 * `car.glass` remains a representative side pane for the older diagnostics
 * that inspect its material. It no longer refers to the removed shell.
 */
export function installSixPaneSedanGlazing({
  car,
  cabin,
  prefix = 'lincoln',
  sideMaterial,
  windscreenMaterial = sideMaterial,
  rearMaterial = sideMaterial,
} = {}) {
  if (!car?.group || !car.glass || !cabin || !sideMaterial) {
    throw new TypeError('installSixPaneSedanGlazing requires car, cabin, and sideMaterial');
  }

  const parent = car.group;
  const borrowedGreenhouse = car.glass;
  parent.remove(borrowedGreenhouse);

  const { cx0, cx1, cabinHalfW, glassY0, glassY1 } = cabin;
  const paneH = glassY1 - glassY0;
  const centreY = (glassY0 + glassY1) / 2;

  const windscreen = pane(parent, {
    name: `${prefix}.windscreen`,
    size: [0.05, paneH * 1.34, cabinHalfW * 1.9],
    position: [cx1 + 0.06, centreY - 0.04, 0],
    rotationZ: -0.36,
    material: windscreenMaterial,
  });
  const rearGlass = pane(parent, {
    name: `${prefix}.rear-glass`,
    size: [0.05, paneH * 1.2, cabinHalfW * 1.86],
    position: [cx0 - 0.05, centreY, 0],
    rotationZ: 0.30,
    material: rearMaterial,
  });

  const sidePanes = {};
  for (const side of [-1, 1]) {
    const key = side > 0 ? 'left' : 'right';
    const z = side * (cabinHalfW - 0.035);
    const front = pane(parent, {
      name: `${prefix}.window.front.${key}`,
      size: [1.16, paneH, 0.04],
      position: [-0.12, centreY, z],
      material: sideMaterial,
    });
    const rear = pane(parent, {
      name: `${prefix}.window.rear.${key}`,
      size: [1.02, paneH, 0.04],
      position: [-1.42, centreY, z],
      material: sideMaterial,
    });
    sidePanes[`front${side > 0 ? 'Left' : 'Right'}`] = front;
    sidePanes[`rear${side > 0 ? 'Left' : 'Right'}`] = rear;
  }

  /* Preserve the public diagnostic surface while making its meaning honest:
   * this is now one actual passenger-side pane, not the greenhouse volume. */
  car.glass = sidePanes.frontRight;
  car.glassPanes = Object.freeze({ windscreen, rearGlass, ...sidePanes });

  return {
    borrowedGreenhouse,
    windscreen,
    rearGlass,
    sidePanes,
    panes: [windscreen, rearGlass, ...Object.values(sidePanes)],
  };
}

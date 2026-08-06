/**
 * NO WAKE's mesh helpers.
 *
 * Shared by `world.js` (the hull, the deck and the harbour) and `cabin.js`
 * (below deck) so the two halves of one boat are built the same way.
 *
 * **Every helper takes a name first, and it is not optional.** `tools/scene-
 * audit.mjs` reports unnamed geometry as its own defect class for a reason:
 * an unnamed mesh is a mesh no verifier can ever assert anything about, and
 * the old boat contributed most of this page's 1,393 of them. Naming is also
 * how the audit's FLOATING pass tells a hanging cabin lamp from a crate
 * suspended in mid-air, so the names here are descriptive on purpose.
 */
import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _direction = new THREE.Vector3();

export const mat = (color, roughness = .72, metalness = 0) => new THREE.MeshStandardMaterial({
  color, roughness, metalness,
});

export function named(name, object) {
  object.name = name;
  return object;
}

export function mesh(name, geometry, material, x = 0, y = 0, z = 0) {
  const out = new THREE.Mesh(geometry, material);
  out.name = name;
  out.position.set(x, y, z);
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
}

export const box = (name, size, material, x = 0, y = 0, z = 0) => mesh(
  name, new THREE.BoxGeometry(size[0], size[1], size[2]), material, x, y, z,
);

export const cylinder = (name, r, h, material, x = 0, y = 0, z = 0, sides = 12) => mesh(
  name, new THREE.CylinderGeometry(r, r, h, sides), material, x, y, z,
);

export const tube = (name, r, h, rTop, material, x = 0, y = 0, z = 0, sides = 12) => mesh(
  name, new THREE.CylinderGeometry(rTop, r, h, sides), material, x, y, z,
);

export function beamBetween(name, from, to, radius, material, sides = 10) {
  _from.copy(from);
  _to.copy(to);
  _direction.subVectors(_to, _from);
  const out = mesh(name, new THREE.CylinderGeometry(radius, radius, _direction.length(), sides), material);
  out.position.addVectors(_from, _to).multiplyScalar(.5);
  out.quaternion.setFromUnitVectors(Y_AXIS, _direction.normalize());
  return out;
}

export function lineCurve(name, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(name, new THREE.TubeGeometry(curve, 30, radius, 8, false), material);
}

/** A lettered plate: dock signage, instrument faces, the NO WAKE board. */
export function textPlate(name, text, width, height, {
  foreground = '#d7dddc', background = '#172126', border = '#6d7778', font = 36,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = foreground;
  ctx.font = `700 ${font}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = mesh(name, new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map: texture, transparent: false, toneMapped: false,
  }));
  plate.castShadow = false;
  return plate;
}

/**
 * An invisible, generous interaction volume.
 *
 * Every hold on this boat is aimed from a moving deck, so the crosshair cannot
 * be asked to find a switch bezel or a rope strand. `colorWrite: false` rather
 * than `visible = false`, because Three skips raycasting anything invisible and
 * a proxy that cannot be hit is an elaborate way of changing nothing.
 */
export function proxy(name, size, x, y, z) {
  const out = box(name, size, new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, colorWrite: false,
    /* DOUBLE SIDED, and this is not cosmetic on an invisible box.
     *
     * A raycast only registers a hit on a face it meets from the outside, so a
     * front-side proxy is unusable by anyone standing inside it -- and these
     * volumes are deliberately generous, which means the player is often
     * inside one. Boarding was the case that found it: the gangway proxy
     * reaches across the dock to where a player naturally stands, and from
     * there the crosshair passed straight through it and found nothing. */
    side: THREE.DoubleSide,
  }), x, y, z);
  out.castShadow = false;
  out.receiveShadow = false;
  return out;
}

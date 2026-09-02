/**
 * Glue on somebody's back.
 *
 * Margo's morning rig (src/world/dressing.js) wears the blobs the seam game
 * leaves on her: the same baked blob texture `SplatSystem` sprays at the
 * picture frame, parented to her blouse so it travels with her. That rig is
 * its own compact skeleton, so the layout there is authored against its
 * torso. This is the same mess for the shared `makePerson` figure
 * (src/bing/cast.js) that every performer, Family member and guest in the
 * game is built on, so the Mansion's pool-side seam beat can land the glue
 * on the girl's back exactly the way the flat's does -- and so the next
 * scene to stage this game does not grow a third idea of what a blob is.
 *
 * Owner, 2026-09-02, on the Mansion's version: "the glue effect on the back
 * after, before they return to the chair."
 */
import * as THREE from 'three';
import { BLOB_HEAD_Y, createGlueBlobMaterial } from './splat.js';

/**
 * Where the mess lands on the back, in the torso wrap's own frame, as a
 * fraction of the ribcage: `[x of half width, y of half height, head
 * radius, run length]`. Ordered from the fastening outward, because `set`
 * reveals them in this order and it has to arrive as a spray from one point
 * rather than one frame of paint. The proportions are Margo's (her blobs
 * are authored on a 0.105 m half-depth, 0.40 m tall blouse) scaled onto the
 * figure's own chest, so a curvy performer and a broad man land the same
 * pattern at their own size.
 */
const BACK_BLOBS = Object.freeze([
  [0.00, 0.62, 0.115, 0.58],
  [-0.32, 0.50, 0.090, 0.44],
  [0.30, 0.44, 0.095, 0.50],
  [-0.09, 0.20, 0.100, 0.64],
  [0.50, 0.15, 0.072, 0.33],
  [-0.54, 0.14, 0.066, 0.30],
  [0.19, -0.10, 0.082, 0.47],
  [-0.25, -0.22, 0.072, 0.38],
  [0.04, -0.46, 0.062, 0.27],
]);

function ribcageOf(parts) {
  const torso = parts?.torso;
  const p = torso?.geometry?.parameters;
  if (p && Number.isFinite(p.width) && Number.isFinite(p.height) && Number.isFinite(p.depth)) {
    return { halfWidth: p.width / 2, halfHeight: p.height / 2, halfDepth: p.depth / 2 };
  }
  /* `softBox` figures and anything without a box ribcage: the shared
   * builder's average build, 0.188 * 2 wide, 0.32 tall, 0.135 * 2 deep. */
  return { halfWidth: 0.188, halfHeight: 0.16, halfDepth: 0.135 };
}

/**
 * Hang the blobs on a `makePerson` figure's back. They start invisible.
 *
 * @param {object} parts the figure's `parts` (needs `torsoWrap`; reads
 *   `torso` for the ribcage size)
 * @returns {{ group: THREE.Group, blobs: THREE.Mesh[], amount: number,
 *   set(amount: number): number }}
 */
export function attachDressGlue(parts) {
  const anchor = parts?.torsoWrap ?? parts?.body ?? null;
  const { halfWidth, halfHeight, halfDepth } = ribcageOf(parts);
  const group = new THREE.Group();
  group.name = 'person.dress.glue';
  /* On the back face, a millimetre proud of it, facing backwards. */
  group.position.set(0, 0, -halfDepth - 0.001);
  group.rotation.y = Math.PI;
  const blobs = BACK_BLOBS.map(([bx, by, r, run], i) => {
    const radius = r * halfWidth;
    const length = run * halfHeight;
    const w = radius * 2.6;
    const h = (length + radius * 1.3) * 1.08;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(w, h), createGlueBlobMaterial());
    blob.name = `person.dress.glue.${i + 1}`;
    /* Mirrored in x because the group is turned to face backwards. The
     * texture's own head sits BLOB_HEAD_Y down from its top edge rather than
     * at the plane's centre, so the plane is nudged to compensate. */
    blob.position.set(-bx * halfWidth, by * halfHeight - h * (0.5 - BLOB_HEAD_Y), 0);
    blob.visible = false;
    blob.castShadow = false;
    blob.receiveShadow = false;
    blob.userData.geometryGate = { overlap: false, checkSupport: false, checkWallEmbed: false };
    group.add(blob);
    return blob;
  });
  anchor?.add?.(group);
  const glue = {
    group,
    blobs,
    amount: 0,
    /**
     * Ramped rather than switched, and staggered across the blobs, because
     * the bottle gives all at once and then keeps going for a second after.
     * @param {number} amount 0 clean, 1 the whole tube
     */
    set(amount) {
      const p = Math.max(0, Math.min(1, Number(amount) || 0));
      glue.amount = p;
      blobs.forEach((blob, i) => {
        const at = (i / Math.max(1, blobs.length - 1)) * 0.70;
        const k = Math.max(0, Math.min(1, (p - at) / 0.30));
        blob.visible = k > 0;
        blob.material.opacity = 0.94 * k;
      });
      return p;
    },
  };
  glue.set(0);
  return glue;
}

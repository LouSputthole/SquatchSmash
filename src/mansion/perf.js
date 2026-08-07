/**
 * The two things the mansion was paying for every frame and getting nothing
 * back for.
 *
 * Both pages -- the walking tour (`./main.js`) and MANSION UNDER SIEGE
 * (`./siege/main.js`) -- stand the same 9,400-mesh house up, so both were
 * paying both bills. Neither is a layout problem and neither is fixed by
 * moving furniture: they are properties of the render, which is why they
 * live here and not in `scenes/MansionInterior.js`.
 *
 * MEASURED, headless Chromium, one `renderer.render(scene, camera)` per pose
 * with `renderer.info.autoReset` turned OFF (this three build resets `info`
 * AFTER the shadow pass, so with the default ON the shadow pass is invisible
 * and reads as zero -- which is exactly how it went unnoticed):
 *
 *   pose            total   shadow pass   main pass   main w/o transmission
 *   spawn          34,365        7,567      26,798                  13,648
 *   foyer          24,705        7,567      17,138                   8,751
 *   gallery        20,580        7,567      13,013                   6,677
 *   armory         16,441        7,567       8,874                   4,508
 *
 * ------------------------------------------------------------------------
 * 1. THE TRANSMISSION PASS, which doubled the main pass wherever a drinking
 *    glass was on screen.
 *
 *    `MeshPhysicalMaterial.transmission > 0` does not cost one object's
 *    worth of work. three.js puts those objects on a third render list and,
 *    if that list is not empty, runs `renderTransmissionPass()` -- which
 *    re-renders THE ENTIRE OPAQUE LIST into an offscreen target so the glass
 *    has something to refract. One tumbler on a bar therefore draws the
 *    whole house a second time. The house has 177 such meshes across 79
 *    materials: decanters, tumblers, bottles, the winter garden's panes, the
 *    vault glass, the shower screens.
 *
 *    Flattening them to ordinary alpha blending costs the refraction and
 *    the background blur behind a wine glass at 3 a.m. in a dark house, and
 *    buys back between 4,366 and 13,150 draw calls per frame.
 *
 * 2. THE SHADOW PASS, a flat 7,567 draw calls of which most were of objects
 *    the light physically cannot reach.
 *
 *    `src/world/build.js` gives every `box()`, `cylinder()` and `sphere()`
 *    `castShadow = true` unless the caller says otherwise, so all 9,400
 *    house meshes cast. There is exactly ONE shadow-casting light in either
 *    scene -- the moon, a DirectionalLight outside the building -- and its
 *    shadow camera is 90 x 110 m over a 1536 px map, so one shadow texel is
 *    5.9 x 7.2 cm.
 *
 *    Two consequences, and both are geometry rather than taste:
 *      - Nothing INSIDE the house can change that map in a way anybody can
 *        see. The shell is already between the moon and every interior mesh,
 *        so the whole interior volume is in shadow before a single ashtray
 *        is considered. Same for the laboratory, which is underground.
 *      - Outside, an object smaller than a few texels cannot resolve a
 *        shadow at all; it writes a smudge of two or three pixels into a
 *        1536 px map covering the entire property, and PCFSoft then filters
 *        that away.
 *
 * Neither function touches a position, a name, a collider or a material's
 * colour, so nothing a verifier walks or a player bumps into moves.
 */
import * as THREE from 'three';

/** Metres of the shadow camera's width per pixel of its map: 90 / 1536. */
const MOON_TEXEL = 90 / 1536;
/**
 * How many texels across an object has to be before its shadow is worth
 * rendering. Eight is deliberately generous -- it keeps every bollard,
 * planter, chair and bin -- and still removes the knick-knacks.
 */
const MIN_TEXELS = 8;

/**
 * Take the refraction off glass so the renderer stops drawing the house
 * twice.
 *
 * Materials are shared objects, so this is done once per material rather
 * than once per mesh, and a page is one document: mutating a material out of
 * `src/world/props.js` here changes the mansion's glass and nothing else in
 * the campaign, because every scene transition is a full page load.
 *
 * @param {THREE.Object3D[]} roots
 * @returns {{materials: number, meshes: number}}
 */
export function flattenTransmission(roots) {
  const done = new Set();
  let meshes = 0;
  for (const root of roots) {
    root?.traverse?.((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      let touched = false;
      for (const m of list) {
        if (!m || !(m.transmission > 0)) continue;
        touched = true;
        if (done.has(m)) continue;
        done.add(m);
        const t = m.transmission;
        m.transmission = 0;
        /* A material that was see-through ONLY because of transmission has
         * to be told to stay see-through, or the decanter becomes a lump.
         * One that already carried its own alpha keeps the alpha it was
         * authored with -- the artist already chose how solid it looks. */
        if (!m.transparent) {
          m.transparent = true;
          m.opacity = Math.min(m.opacity ?? 1, 1 - t * 0.75);
        }
        m.needsUpdate = true;
      }
      if (touched) meshes++;
    });
  }
  return { materials: done.size, meshes };
}

/**
 * Leave the moon's shadow map to the things that can actually cast into it.
 *
 * @param {object} o
 *   indoor   roots whose contents are inside the building or underground.
 *            Everything under them stops casting, full stop.
 *   outdoor  roots under the sky. A mesh there keeps its shadow only if its
 *            second-largest world dimension is at least `MIN_TEXELS` texels,
 *            i.e. big enough to resolve.
 * @returns {{kept: number, dropped: number}}
 */
export function capShadowCasters({ indoor = [], outdoor = [] } = {}) {
  let kept = 0;
  let dropped = 0;

  for (const root of indoor) {
    root?.traverse?.((o) => {
      if (!o.isMesh || !o.castShadow) return;
      o.castShadow = false;
      dropped++;
    });
  }

  const min = MOON_TEXEL * MIN_TEXELS;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  for (const root of outdoor) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      box.setFromObject(o);
      box.getSize(size);
      /* The SECOND-largest dimension, not the largest: a 4 m long, 2 cm
       * thick wire is 4 m of nothing. Sorting three numbers per mesh at boot
       * costs less than one frame of the shadows it removes. */
      const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
      if (dims[1] >= min) { kept++; return; }
      o.castShadow = false;
      dropped++;
    });
  }
  return { kept, dropped };
}

/** What the cap used, so a verifier can assert the rule and not a number. */
export const SHADOW_CAP = { texel: MOON_TEXEL, minTexels: MIN_TEXELS, minMetres: MOON_TEXEL * MIN_TEXELS };

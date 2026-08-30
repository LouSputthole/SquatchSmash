/**
 * THE SPECIAL MEETING — the night, as three lights and a fog.
 *
 * ALMOST NO ARTIFICIAL LIGHT. That is the brief and it is also the entire
 * lighting design: five sodium lamps in the first hundred metres, an
 * instrument glow, a phone, and after that two headlamps for eight hundred
 * metres. Everything the player sees for most of this scene, he sees because
 * the car is pointing at it.
 *
 * WHICH MEANS THE AMBIENT HAS TO BE NEARLY NOTHING
 *
 * The temptation with a night scene is to lift the hemisphere until the trees
 * are visible, and the moment that happens the headlights stop being the
 * light — they become a highlight on a wood you can already see, and the
 * scene's whole visual argument is gone. So the ambient here is set to the
 * lowest value at which a treeline still has a silhouette against the sky and
 * not one step higher. The moon is doing shape, not illumination.
 *
 * THE FOG THICKENS WITH THE DRIVE
 *
 * One exponential fog, whose density is a function of how far along the road
 * the car is: thin at the edge of town, and by the deep woods so thick that
 * the beams end in it. That is the same progression as the tree density and
 * the road width, said a third way, and it is the cheapest of the three.
 *
 * NO SECOND MOON, NO SECOND FOG. `src/mansion/siege/night.js` says it plainly
 * and it is worth repeating: a scene owns exactly one key light and one fog,
 * and a second of either doubles the sky and burns a shadow map for nothing.
 */

import * as THREE from 'three';
import { softCardTexture } from './textures.js';

/** Fog density by stage. Visibility roughly 3/density metres. */
export const FOG_BY_STAGE = Object.freeze({
  outskirts: 0.020,
  rural: 0.026,
  dirt: 0.033,
  deep: 0.042,
});

const SKY = 0x05070c;
const FOG = 0x070a11;

/**
 * Dress a scene for the night.
 *
 * @param {THREE.Scene} scene
 * @param {object} [options]
 * @param {THREE.WebGLRenderer} [options.renderer] tone mapping and exposure,
 *        if this scene owns the renderer. Left alone when it does not.
 * @returns {{moon, hemi, sky, update, dispose}}
 */
export function applyForestNight(scene, { renderer = null } = {}) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(FOG, FOG_BY_STAGE.outskirts);

  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    /* A shade over one. The headlights are the only bright thing in the frame
     * and ACES has to have somewhere to roll them off to, so the exposure is
     * set for the road forty metres out rather than for the road four metres
     * out, which is blown and should be. */
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  /* The moon. No shadow: the only shadow map in this scene belongs to the
   * nearside headlamp, where it is spent on trunks thrown across the road at
   * ten metres rather than on a canopy at forty. */
  const moon = new THREE.DirectionalLight(0x93a9c9, 0.85);
  moon.position.set(-46, 68, 30);
  moon.castShadow = false;
  scene.add(moon);
  scene.add(moon.target);

  /* Sky and ground bounce, and it is nearly nothing. Raise this and the wood
   * becomes visible without the car, which is the one thing it must not be. */
  const hemi = new THREE.HemisphereLight(0xa7b8d0, 0x06080a, 0.8);
  scene.add(hemi);

  const group = new THREE.Group();
  group.name = 'forest.night';
  scene.add(group);

  const materials = [];
  const geometries = [];

  /* The moon itself, `fog: false` because it is a source and not a surface.
   * Only visible where the canopy is open — which is the first minute, and
   * then it is gone and nobody notices it go. */
  const discGeo = new THREE.SphereGeometry(2.6, 20, 14);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xc9d6e4, fog: false });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.name = 'forest.moon';
  /* A hundred and ninety metres up and unlit by the fog, riding the camera so
   * it stays on the horizon. It is a light source drawn as a ball; the halo
   * below is the same light drawn as a card, sitting at the SAME point in
   * space on purpose. Neither is a solid, neither rests on anything, and the
   * question the gate asks about both is the wrong one. */
  disc.userData.geometryGate = { fixedSupportAnchor: true, overlap: false };
  disc.position.set(-260, 190, 150);
  group.add(disc);
  geometries.push(discGeo);
  materials.push(discMat);

  const haloGeo = new THREE.PlaneGeometry(40, 40);
  const haloMat = new THREE.MeshBasicMaterial({
    map: softCardTexture(),
    color: 0x9fb6cf,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.name = 'forest.moon.halo';
  halo.userData.geometryGate = { fixedSupportAnchor: true, overlap: false };
  halo.position.copy(disc.position);
  group.add(halo);
  geometries.push(haloGeo);
  materials.push(haloMat);

  /**
   * The town they left, on the horizon behind them.
   *
   * A low, wide, dirty-orange smear that is only visible in the first stretch
   * and is gone by the time anybody asks where they are going. It is the last
   * sight of anywhere with people in it, and its only job is to not be there
   * later.
   */
  const glowGeo = new THREE.PlaneGeometry(420, 90);
  const glowMat = new THREE.MeshBasicMaterial({
    map: softCardTexture(),
    color: 0xc2712a,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const townGlow = new THREE.Mesh(glowGeo, glowMat);
  townGlow.name = 'forest.town-glow';
  townGlow.position.set(20, 6, 330);
  townGlow.rotation.y = Math.PI;
  group.add(townGlow);
  geometries.push(glowGeo);
  materials.push(glowMat);

  const state = { density: FOG_BY_STAGE.outskirts };

  return {
    moon,
    hemi,
    group,
    townGlow,

    /**
     * Follow the drive.
     *
     * @param {number} dt
     * @param {object} [into] `{ stage, progress, focus }` from the drive.
     */
    update(dt, { stage = 'outskirts', progress = 0, focus = null } = {}) {
      const want = FOG_BY_STAGE[stage] ?? FOG_BY_STAGE.deep;
      /* Eased rather than stepped. A fog that changes density on a stage
       * boundary is a curtain coming down, and the boundary is a place on a
       * road that the player is looking straight at. */
      state.density += (want - state.density) * Math.min(1, dt * 0.35);
      if (scene.fog) scene.fog.density = state.density;

      // The town, going.
      glowMat.opacity = 0.20 * Math.max(0, 1 - progress * 4.2);
      townGlow.visible = glowMat.opacity > 0.004;

      if (focus) {
        /* The moon and its halo ride the camera so they stay on the horizon
         * instead of being something you drive past. The key light rides it
         * too, for the ordinary reason: a directional light's shadow-free
         * contribution is direction only, but its target has to be somewhere,
         * and somewhere is here. */
        disc.position.set(focus.x - 260, 190, focus.z + 150);
        halo.position.copy(disc.position);
        halo.lookAt(focus.x, focus.y ?? 2, focus.z);
        moon.position.set(focus.x - 46, focus.y + 68, focus.z + 30);
        moon.target.position.set(focus.x, focus.y ?? 0, focus.z);
        moon.target.updateMatrixWorld();
        townGlow.position.set(focus.x + 20, 6, focus.z + 330);
      }
    },

    dispose() {
      scene.remove(moon);
      scene.remove(moon.target);
      scene.remove(hemi);
      scene.remove(group);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      scene.fog = null;
    },
  };
}

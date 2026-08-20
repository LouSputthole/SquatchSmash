/**
 * Night, on one block.
 *
 * `DayNight` (src/core/daynight.js) holds this game's authored night values —
 * sun 0x7d95d8 at 0.22, hemisphere 0x2b3557 over 0x0d0f16 at 0.30, ambient
 * 0x44506e at 0.16, exposure 1.30 — but it applies NOTHING to a scene; it is a
 * table, and the apartment is its only consumer. Every night scene in the game
 * therefore writes its own rig, and the two that work (the graveyard and the
 * Initiation) both do the same three things: one moon, one fog, one warm
 * practical, and nothing else pretending to be the sky.
 *
 * This is that rig for a wet city street, where the important difference is
 * that the MOON IS NOT THE LIGHT. The street is lit by four sodium lamps, a
 * doorway bulb and a dead neon sign, all of which live in block.js; the
 * directional here is a cold rim off the rooftops, dim enough that walking out
 * of a lamp's pool actually costs you something.
 *
 * The one rule this file exists to keep, from src/mansion/siege/night.js: a
 * scene owns exactly ONE moon and ONE fog. A second doubles the sky and burns
 * a second shadow map for nothing.
 */
import * as THREE from 'three';

export const NIGHT = Object.freeze({
  background: 0x080a11,
  fog: Object.freeze({ colour: 0x0a0d14, density: 0.017 }),
  moon: Object.freeze({ colour: 0x93a9d4, intensity: 0.62 }),
  hemisphere: Object.freeze({ sky: 0x2b3557, ground: 0x0d0f16, intensity: 0.34 }),
  ambient: Object.freeze({ colour: 0x44506e, intensity: 0.16 }),
  exposure: 1.22,
  /** Half-width of the moon's shadow box, in metres, around the player. */
  shadowRadius: 30,
});

/** A vertical gradient: sodium haze at the horizon, nothing at the top. */
function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05070d');
  grad.addColorStop(0.52, '#0a0e18');
  grad.addColorStop(0.78, '#161725');
  grad.addColorStop(0.93, '#33241f');
  grad.addColorStop(1, '#4a2f1d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Light the block.
 *
 * Adds the sky, the fog and three lights to `scene` and returns the handle the
 * frame loop needs. `update(dt, focus)` walks the moon's shadow box with the
 * player: a fixed ortho box big enough for a hundred-metre street wastes every
 * texel it has, and one that fits the street has nothing left over for the
 * alley.
 */
export function applySpecialMeetingNight(scene, { renderer = null, shadows = true } = {}) {
  scene.background = new THREE.Color(NIGHT.background);
  scene.fog = new THREE.FogExp2(NIGHT.fog.colour, NIGHT.fog.density);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 20, 14),
    new THREE.MeshBasicMaterial({
      map: skyTexture(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  sky.name = 'specialmeeting.sky';
  sky.userData.geometryGate = { overlap: false, checkSupport: false };
  scene.add(sky);

  const moon = new THREE.DirectionalLight(NIGHT.moon.colour, NIGHT.moon.intensity);
  moon.name = 'specialmeeting.moon';
  moon.position.set(-26, 40, -18);
  if (shadows) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 140;
    const r = NIGHT.shadowRadius;
    moon.shadow.camera.left = -r;
    moon.shadow.camera.right = r;
    moon.shadow.camera.top = r;
    moon.shadow.camera.bottom = -r;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.02;
  }
  scene.add(moon);
  scene.add(moon.target);

  const hemisphere = new THREE.HemisphereLight(
    NIGHT.hemisphere.sky, NIGHT.hemisphere.ground, NIGHT.hemisphere.intensity,
  );
  hemisphere.name = 'specialmeeting.hemisphere';
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(NIGHT.ambient.colour, NIGHT.ambient.intensity);
  ambient.name = 'specialmeeting.ambient';
  scene.add(ambient);

  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = NIGHT.exposure;
    if (shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  const offset = new THREE.Vector3(-26, 40, -18);

  return {
    sky,
    moon,
    hemisphere,
    ambient,
    /** Ride the shadow box on whatever the camera is near. */
    update(dt, focus = null) {
      if (!focus) return;
      sky.position.set(focus.x, 0, focus.z);
      moon.target.position.set(focus.x, 0, focus.z);
      moon.position.copy(moon.target.position).add(offset);
      moon.target.updateMatrixWorld();
    },
    dispose() {
      sky.geometry.dispose();
      sky.material.map?.dispose();
      sky.material.dispose();
      scene.remove(sky, moon, moon.target, hemisphere, ambient);
    },
  };
}

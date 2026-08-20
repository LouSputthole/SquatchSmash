/**
 * The rest of the world — everything past the edge of the route.
 *
 * Owner playtest, 2026-08-19:
 *
 *   *"The world ends just past the city. Extend the surroundings: mountains,
 *   rolling terrain, distant hills, forest silhouettes, low-detail terrain
 *   meshes, fog/haze, atmospheric backdrop. It does not need dense geometry —
 *   it needs depth so the player does not discover that the Earth stops 300
 *   yards behind the city. Use aggressive LODs and simplified terrain to
 *   protect performance."*
 *
 * WHERE THE EDGE ACTUALLY IS. `./world-geometry.js` builds one detailed
 * heightfield over x -1400..14500 and z -4200..1000 — a 15.9 km by 5.2 km
 * ribbon along the route, at 50 m per segment. That is a lot of ground and it is
 * plenty in the direction of travel, but the route itself runs along z ≈ -500,
 * so the SOUTH edge of the ribbon is 1.5 km off the port wing. The compound
 * zone's fog reaches 4200 m (`ZONES_EAST`, ../config.js). 1.5 km is well inside
 * 4.2 km, so the last kilometre of the bombing run is flown alongside a visible
 * horizon line with nothing beyond it — which is exactly the "Earth stops 300
 * yards behind the city" the note describes, seen sideways.
 *
 * WHAT THIS IS. One more heightfield, an order of magnitude bigger and an order
 * of magnitude coarser: 46 km by 44 km at roughly 470 m per segment — about
 * 9,400 vertices and ONE draw call, against the detailed field's 33,000. It is
 * generated from the same `fbm`/`ridged` pair the route terrain uses so it is
 * the same landscape rather than a different one, and it rises into real
 * mountain ranges as it goes out, because a horizon that stays flat forever
 * reads as a disc.
 *
 * HOW IT AVOIDS FIGHTING THE DETAILED TERRAIN. Inside the detailed bounds it is
 * pushed a long way DOWN — `SINK_M` below the real ground at that point,
 * sampled from the same `groundHeightCombined` everything else uses — and it
 * comes back up across a `BLEND_M` skirt outside them. So there is no seam to
 * z-fight, no double surface for a ray to hit, and no possibility of the coarse
 * mesh poking through the field the aeroplane is actually flown against. It is
 * scenery and only scenery: nothing samples it, nothing lands on it, and
 * `groundHeightCombined` does not know it exists.
 *
 * THE LOD. There is one, and it is the cheapest kind that works: the coarse
 * field carries the far ground, and the mid-distance detail — the forest
 * silhouettes — is a single `InstancedMesh` of flat dark ridges placed only in
 * the annulus between the detailed bounds and about eight kilometres out, which
 * is the band where fog has not yet taken over but the real terrain has run out.
 * Past that band nothing is drawn but the coarse field and the haze, because
 * past that band nothing is legible anyway.
 */
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm, ridged, rng, coneGeo } from '../beefrun/util.js';

/** How far under the real ground the coarse field is buried inside the route. */
const SINK_M = 90;
/** The skirt it climbs back up across, outside the detailed bounds. */
const BLEND_M = 2600;

/** The coarse field's own extent, in metres. */
export const HORIZON_BOUNDS = Object.freeze({
  x0: -16000, x1: 30000,
  z0: -24000, z1: 20000,
});
/** Segments across each axis. 96 x 96 is ~9.4k vertices in one draw call. */
const SEGMENTS = 96;

/**
 * The coarse landscape's own height, before the route skirt is applied.
 *
 * Three layers and no more: broad rolling ground, a ridged mountain component
 * that only switches on with distance from the route, and a slow rise toward
 * the far edges so the outermost ring is a mountain wall rather than a cliff
 * into nothing.
 */
function horizonHeight(x, z, base) {
  const rolling = fbm(x / 4200, z / 4200, 3) * 190;
  // Distance from the route corridor, which runs east along z ~ -500.
  const off = Math.max(0, Math.abs(z + 500) - 3000) / 9000;
  const away = Math.max(0, Math.abs(x - 6500) - 9000) / 14000;
  const remoteness = clamp(Math.max(off, away), 0, 1);
  const mountains = ridged(x / 5600, z / 5600, 4) * 1250 * remoteness;
  const rim = smoothstep(0.35, 1, remoteness) * 420;
  return base + rolling + mountains + rim;
}

/**
 * Build the surround.
 *
 * @param {THREE.Scene} scene
 * @param {object} o
 * @param {function(number, number): number} o.getHeight the route's own
 *   `groundHeightCombined`, sampled only inside the detailed bounds
 * @param {{boundsX: number[], boundsZ: number[]}} o.detailed the detailed
 *   heightfield's extent, so this one knows where to hide
 * @param {number} [o.base] the elevation the far ground sits around
 * @returns {{ground: THREE.Mesh, silhouettes: THREE.InstancedMesh,
 *            haze: THREE.Mesh, dispose: function}}
 */
export function buildDistantHorizon(scene, { getHeight, detailed, base = 200 }) {
  const [dx0, dx1] = detailed.boundsX;
  const [dz0, dz1] = detailed.boundsZ;

  /** How far outside the detailed rectangle a point is, 0 inside, 1 past the skirt. */
  const outside = (x, z) => {
    const ox = Math.max(dx0 - x, x - dx1, 0);
    const oz = Math.max(dz0 - z, z - dz1, 0);
    return clamp(Math.hypot(ox, oz) / BLEND_M, 0, 1);
  };

  const width = HORIZON_BOUNDS.x1 - HORIZON_BOUNDS.x0;
  const depth = HORIZON_BOUNDS.z1 - HORIZON_BOUNDS.z0;
  const centerX = (HORIZON_BOUNDS.x0 + HORIZON_BOUNDS.x1) / 2;
  const centerZ = (HORIZON_BOUNDS.z0 + HORIZON_BOUNDS.z1) / 2;

  const geometry = new THREE.PlaneGeometry(width, depth, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const colour = new THREE.Color();
  /* Night palette. `ROCK` is what a lit ridge reads as at this distance and
   * `FAR` is the colour the compound zone's fog settles to (0x241c2c), so the
   * outermost ring dissolves into the haze instead of stopping against it. */
  const NEAR_GROUND = new THREE.Color(0x232b3e);
  const ROCK = new THREE.Color(0x3a4258);
  const FAR = new THREE.Color(0x241c2c);

  for (let index = 0; index < positions.count; index += 1) {
    const worldX = centerX + positions.getX(index);
    const worldZ = centerZ + positions.getZ(index);
    const out = outside(worldX, worldZ);
    const wild = horizonHeight(worldX, worldZ, base);
    /* Inside the route's own rectangle this mesh is buried; outside it, it
     * climbs to its own landscape across the skirt. `getHeight` is sampled only
     * where it is meaningful — the coarse field extends 16 km past the route in
     * places and the route's height function is not authored out there. */
    const buried = (out < 1 ? getHeight(clamp(worldX, dx0, dx1), clamp(worldZ, dz0, dz1)) : base) - SINK_M;
    positions.setY(index, lerp(buried, wild, smoothstep(0, 1, out)));

    const height = clamp((wild - base) / 900, 0, 1);
    colour.copy(NEAR_GROUND).lerp(ROCK, height);
    // Everything far from the route fades toward the haze it is seen through.
    const range = Math.hypot(worldX - 6500, worldZ + 500) / 22000;
    colour.lerp(FAR, clamp(range, 0, 1) * 0.85);
    colour.multiplyScalar(0.9 + fbm(worldX / 3100, worldZ / 3100, 2) * 0.2);
    colors[index * 3] = colour.r;
    colors[index * 3 + 1] = colour.g;
    colors[index * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  ground.name = 'distant-horizon-ground';
  ground.position.set(centerX, 0, centerZ);
  ground.castShadow = false;
  ground.receiveShadow = false;
  /* Backdrop, not level geometry: it is deliberately buried under the real
   * terrain over the whole route and nothing stands on it. */
  ground.userData.geometryGate = { checkSupport: false, overlap: false };
  ground.userData.distantBackdrop = true;
  scene.add(ground);

  /* ---- Forest silhouettes ----
   *
   * The mid band only. Inside the detailed bounds the route has its own trees
   * (`world-geometry.js`'s scatter); past about eight kilometres nothing is
   * legible through the haze. In between, a treeline is the single cheapest
   * thing that turns a smooth coarse hill into a landscape, because it gives
   * the ridge an edge. Flat, dark, unlit-looking cones in one instanced draw. */
  const SILHOUETTE_BUDGET = 900;
  const silhouettes = new THREE.InstancedMesh(
    coneGeo(26, 70, 5),
    new THREE.MeshStandardMaterial({ color: 0x161d2c, roughness: 1, metalness: 0 }),
    SILHOUETTE_BUDGET,
  );
  silhouettes.name = 'distant-horizon-treeline';
  silhouettes.castShadow = false;
  silhouettes.receiveShadow = false;
  silhouettes.userData.geometryGate = { checkSupport: false, overlap: false };
  const random = rng(0x5A11F0);
  const dummy = new THREE.Object3D();
  let used = 0;
  for (let attempt = 0; attempt < SILHOUETTE_BUDGET * 6 && used < SILHOUETTE_BUDGET; attempt += 1) {
    const worldX = HORIZON_BOUNDS.x0 + random() * width;
    const worldZ = HORIZON_BOUNDS.z0 + random() * depth;
    const out = outside(worldX, worldZ);
    // The band: clear of the route's own terrain, inside the legible distance.
    if (out < 0.55) continue;
    if (Math.hypot(worldX - 6500, worldZ + 500) > 13000) continue;
    // Clumps rather than an even sprinkle — a treeline, not a lawn.
    if (fbm(worldX / 1900, worldZ / 1900, 2) < 0.12) continue;
    const y = horizonHeight(worldX, worldZ, base);
    const scale = 1.4 + random() * 2.6;
    dummy.position.set(worldX, y + 34 * scale, worldZ);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(scale, scale * (0.7 + random() * 0.7), scale);
    dummy.updateMatrix();
    silhouettes.setMatrixAt(used, dummy.matrix);
    used += 1;
  }
  silhouettes.count = used;
  silhouettes.instanceMatrix.needsUpdate = true;
  scene.add(silhouettes);

  /* ---- The atmospheric backdrop ----
   *
   * A single open-ended cylinder standing around the whole route, painted with
   * a vertical gradient from the haze colour at the bottom to fully transparent
   * at the top. It sits outside every piece of terrain above and it is the last
   * thing between the player and the clear colour, so wherever the coarse field
   * still runs out — over the far mountains, past the top of the fog — there is
   * a band of night air rather than a hard edge.
   *
   * `depthWrite: false` and `BackSide`: it is a shell seen from inside, and it
   * must not occlude anything. It is not fogged, because it IS the fog's own
   * colour continued upward.
   */
  const HAZE_R = 26000;
  const hazeCanvas = document.createElement('canvas');
  hazeCanvas.width = 4;
  hazeCanvas.height = 128;
  const hz = hazeCanvas.getContext('2d');
  const grad = hz.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(36,28,44,0)');
  grad.addColorStop(0.62, 'rgba(36,28,44,0.42)');
  grad.addColorStop(1, 'rgba(44,36,54,0.92)');
  hz.fillStyle = grad;
  hz.fillRect(0, 0, 4, 128);
  const hazeTex = new THREE.CanvasTexture(hazeCanvas);
  hazeTex.colorSpace = THREE.SRGBColorSpace;
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(HAZE_R, HAZE_R, 5200, 32, 1, true),
    new THREE.MeshBasicMaterial({
      map: hazeTex,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
      toneMapped: false,
    }),
  );
  haze.name = 'distant-horizon-haze';
  haze.position.set(6500, base + 1500, -500);
  haze.renderOrder = -1;
  haze.userData.geometryGate = { checkSupport: false, overlap: false };
  haze.userData.distantBackdrop = true;
  scene.add(haze);

  return {
    ground,
    silhouettes,
    haze,
    /** Keep the backdrop centred on the aeroplane so it never runs out sideways. */
    follow(x, z) {
      haze.position.x = x;
      haze.position.z = z;
    },
    dispose() {
      for (const object of [ground, silhouettes, haze]) object.parent?.remove(object);
      geometry.dispose();
      silhouettes.geometry.dispose();
      haze.geometry.dispose();
      hazeTex.dispose();
    },
  };
}

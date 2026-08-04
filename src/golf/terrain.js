/**
 * Silver Pines, built.
 *
 * The ground comes out of `field.js` — this module only renders what that
 * module already decided. Height comes from `heightAt`, and the paint comes
 * from `surfaceAt` baked once into a top-down canvas texture, which is why the
 * bunker has a crisp edge and the green has a collar despite the mesh being on
 * a two-metre grid. Nothing here re-derives the shape of the hole; if the
 * render and the physics ever disagree, one of them is reading the wrong file.
 *
 * Everything is primitives and procedural texture, like the flat and the club.
 * No new art pipeline for one golf hole.
 */

import * as THREE from 'three';
import { mat } from '../world/build.js';
import { SURFACE, surfaceProps } from './course.js';
import { heightAt, surfaceAt } from './field.js';
import { HOLE, setActiveHole } from './hole.js';
import { Npc } from '../bing/cast.js';
import { FAMILY, loadFaceIndex } from '../bing/family.js';

/* Late morning after overnight rain: the light is warm and low-ish, the air
 * still has mist in it, and everything is a shade wetter than it will be by
 * lunchtime. */
export const SKY_COLOUR = 0xbcd4e6;

/**
 * How far you can see, per hole.
 *
 * Mist tuned for a 167-yard par 3 swallows the corner of a 520-yard dogleg,
 * and a corner you cannot see is not a decision — it is the same mistake the
 * flat mid-corridor made on Hole 1, in a different medium. So the distance
 * scales with the hole: far enough to read the shape you are being asked to
 * play, never so far that the morning stops looking like a morning after rain.
 */
function mistFor() {
  const span = Math.hypot(
    HOLE.green.x - HOLE.tee.x,
    HOLE.green.z - HOLE.tee.z,
  );
  return { near: 90, far: Math.max(340, Math.min(640, span * 1.35)) };
}

/* ------------------------------------------------------------------ */
/* The painted course                                                  */
/* ------------------------------------------------------------------ */

/* Baked once per hole, at a size chosen from the hole's own extent so every
 * hole gets about the same pixels per metre — roughly four, which is enough
 * for a bunker lip and cheap enough to generate inside the loading bar. A
 * fixed size was fine while there was one hole; the par 5 covers nearly twice
 * the ground, and at a constant bake it would have had half the resolution
 * exactly where the corner bunker needs an edge. */
const PIXELS_PER_METRE = 4.2;
const TEX_BUDGET = 1_400_000;   // total pixels, whatever the aspect ratio

function textureSize(spanX, spanZ) {
  let w = Math.round(spanX * PIXELS_PER_METRE);
  let h = Math.round(spanZ * PIXELS_PER_METRE);
  const over = (w * h) / TEX_BUDGET;
  if (over > 1) {
    const k = Math.sqrt(over);
    w = Math.round(w / k);
    h = Math.round(h / k);
  }
  return { w, h };
}

function tint(hex, mul) {
  const r = Math.min(255, ((hex >> 16) & 255) * mul);
  const g = Math.min(255, ((hex >> 8) & 255) * mul);
  const b = Math.min(255, (hex & 255) * mul);
  return [r, g, b];
}

function makeCourseTexture(onProgress) {
  const spanX = HOLE.terrain.maxX - HOLE.terrain.minX;
  const spanZ = HOLE.terrain.maxZ - HOLE.terrain.minZ;
  const { w: TEX_W, h: TEX_H } = textureSize(spanX, spanZ);

  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TEX_W, TEX_H);
  const data = img.data;

  for (let py = 0; py < TEX_H; py++) {
    /* v runs with +Z, and the plane is laid out so row 0 is minZ. Getting this
     * backwards mirrors the whole course, which is the kind of bug that looks
     * like a level design opinion. */
    const z = HOLE.terrain.minZ + (py / (TEX_H - 1)) * spanZ;
    for (let px = 0; px < TEX_W; px++) {
      const x = HOLE.terrain.minX + (px / (TEX_W - 1)) * spanX;
      const surface = surfaceAt(x, z);
      const base = surfaceProps(surface).colour;

      /* Per-pixel variation so nothing reads as flat paint: a coarse blotch
       * for wear and damp, a fine one for grass. */
      const blotch = Math.sin(x * 0.09) * Math.cos(z * 0.11) * 0.5
        + Math.sin(x * 0.031 + z * 0.027) * 0.5;
      const grain = ((px * 73856093) ^ (py * 19349663)) & 255;
      let mul = 1 + blotch * 0.055 + (grain / 255 - 0.5) * 0.10;

      /* Mowing. The green and the mown corridor are cut in bands, which is
       * most of what makes a golf course look like a golf course. */
      if (surface === SURFACE.GREEN) {
        mul *= 1 + (Math.floor(x / 2.4) % 2 ? 0.045 : -0.045);
      } else if (surface === SURFACE.FAIRWAY || surface === SURFACE.TEE) {
        mul *= 1 + (Math.floor(z / 5.5) % 2 ? 0.05 : -0.05);
      } else if (surface === SURFACE.ROUGH || surface === SURFACE.DEEP_ROUGH) {
        // Still wet in the long stuff, and wetter in the hollows.
        mul *= 0.94 + Math.sin(x * 0.21 + z * 0.17) * 0.05;
      } else if (surface === SURFACE.BUNKER) {
        // Raked, and coarse enough to read as sand from the tee.
        mul *= 1 + Math.sin((x + z) * 2.2) * 0.035 + (grain / 255 - 0.5) * 0.09;
      }

      const [r, g, b] = tint(base, mul);
      const i = (py * TEX_W + px) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    if (onProgress && (py & 127) === 0) onProgress(py / TEX_H);
  }

  ctx.putImageData(img, 0, 0);

  /* The cup, painted rather than modelled: a real hole in a heightfield would
   * need the mesh to have a hole in it, and at four pixels to the metre this
   * reads correctly from anywhere a player actually stands. The ball still
   * falls in through `field.js`, which knows nothing about this. */
  const cupPx = ((HOLE.pin.x - HOLE.terrain.minX) / spanX) * TEX_W;
  const cupPy = ((HOLE.pin.z - HOLE.terrain.minZ) / spanZ) * TEX_H;
  ctx.fillStyle = '#14200f';
  ctx.beginPath();
  ctx.ellipse(cupPx, cupPy, (HOLE.cupRadius / spanX) * TEX_W * 2.4,
    (HOLE.cupRadius / spanZ) * TEX_H * 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Terrain mesh                                                        */
/* ------------------------------------------------------------------ */

function buildTerrainMesh(texture, renderer) {
  const spanX = HOLE.terrain.maxX - HOLE.terrain.minX;
  const spanZ = HOLE.terrain.maxZ - HOLE.terrain.minZ;
  const segX = Math.round(spanX / HOLE.terrain.cell);
  const segZ = Math.round(spanZ / HOLE.terrain.cell);

  const geo = new THREE.PlaneGeometry(spanX, spanZ, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const cx = (HOLE.terrain.minX + HOLE.terrain.maxX) / 2;
  const cz = (HOLE.terrain.minZ + HOLE.terrain.maxZ) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    pos.setX(i, x);
    pos.setZ(i, z);
    pos.setY(i, heightAt(x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  if (renderer) {
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  /* Not from the shared `mat()` cache: the map is a canvas baked for this hole
   * and nothing else will ever want this material, so it is owned here and
   * disposed with the hole. */
  const material = new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.96, metalness: 0,
  });
  material.userData.holeLocal = true;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'course';
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

/* Deterministic per-band placement, so the tree line is the same tree line
 * every time somebody plays the hole. */
function bandRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PINE_GREENS = [0x2c4a2c, 0x35573a, 0x2a4432, 0x3b5f3c];
const OAK_GREENS = [0x4a6b33, 0x55763a, 0x41602f];

/**
 * Instanced trees.
 *
 * One InstancedMesh per part rather than per tree: three cone tiers and a
 * trunk is four draw calls for four hundred trees. They are placed only where
 * the ground is rough or worse, so nothing grows out of the middle of the
 * fairway or a bunker.
 */
function buildTrees(scene) {
  const pines = [];
  const oaks = [];
  const colliders = [];

  for (let b = 0; b < HOLE.treeBands.length; b++) {
    const band = HOLE.treeBands[b];
    const rand = bandRandom(0x5117e2 + b * 7919);
    let placed = 0;
    for (let tries = 0; tries < band.count * 14 && placed < band.count; tries++) {
      /* Square-root radius keeps them from clumping in the middle of the
       * band, which is what makes a planted line look planted. */
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const x = band.x + Math.cos(a) * r * band.rx;
      const z = band.z + Math.sin(a) * r * band.rz;

      const s = surfaceAt(x, z);
      if (s !== SURFACE.ROUGH && s !== SURFACE.DEEP_ROUGH) continue;
      // Keep the tee's sightline to the green genuinely open.
      if (Math.abs(x - 3) < 26 && z < 6 && z > -160) continue;

      const y = heightAt(x, z);
      const scale = 0.8 + rand() * 0.75;
      const spin = rand() * Math.PI * 2;
      const kind = band.kind === 'mixed' ? (rand() < 0.55 ? 'pine' : 'oak') : band.kind;
      (kind === 'pine' ? pines : oaks).push({ x, y, z, scale, spin, tint: rand() });
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - 0.55 * scale, y, z - 0.55 * scale),
        new THREE.Vector3(x + 0.55 * scale, y + 8 * scale, z + 0.55 * scale),
      ));
      placed++;
    }
  }

  const dummy = new THREE.Object3D();

  function instance(geometry, material, list, place) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geometry, material, list.length);
    im.castShadow = true;
    im.receiveShadow = false;
    for (let i = 0; i < list.length; i++) {
      place(dummy, list[i]);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  }

  const trunkMat = mat({ color: 0x4a3623, roughness: 1 });

  // --- pines: a trunk and three tiers of needles ---
  instance(new THREE.CylinderGeometry(0.16, 0.30, 6.5, 6), trunkMat, pines, (d, t) => {
    d.position.set(t.x, t.y + 3.25 * t.scale, t.z);
    d.rotation.set(0, t.spin, 0);
    d.scale.setScalar(t.scale);
  });
  for (let tier = 0; tier < 3; tier++) {
    const green = PINE_GREENS[tier % PINE_GREENS.length];
    instance(
      new THREE.ConeGeometry(2.5 - tier * 0.62, 3.4, 7),
      mat({ color: green, roughness: 1 }),
      pines,
      (d, t) => {
        d.position.set(t.x, t.y + (3.2 + tier * 1.85) * t.scale, t.z);
        d.rotation.set(0, t.spin + tier * 0.7, 0);
        d.scale.setScalar(t.scale);
      },
    );
  }

  // --- old deciduous trees: a thicker trunk and a lumpy crown ---
  instance(new THREE.CylinderGeometry(0.28, 0.46, 4.2, 6), trunkMat, oaks, (d, t) => {
    d.position.set(t.x, t.y + 2.1 * t.scale, t.z);
    d.rotation.set(0, t.spin, 0);
    d.scale.setScalar(t.scale);
  });
  for (let lump = 0; lump < 3; lump++) {
    const green = OAK_GREENS[lump % OAK_GREENS.length];
    instance(
      new THREE.IcosahedronGeometry(2.3 - lump * 0.35, 0),
      mat({ color: green, roughness: 1, flatShading: true }),
      oaks,
      (d, t) => {
        const off = lump - 1;
        d.position.set(
          t.x + off * 1.5 * t.scale,
          t.y + (4.6 + Math.abs(off) * -0.5 + t.tint) * t.scale,
          t.z + Math.sin(t.spin + lump) * 1.2 * t.scale,
        );
        d.rotation.set(t.spin, t.spin * 1.7, 0);
        d.scale.setScalar(t.scale * (1 + t.tint * 0.2));
      },
    );
  }

  return { colliders, count: pines.length + oaks.length };
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

function buildPond(scene) {
  if (!HOLE.pond) return null;
  const geo = new THREE.CircleGeometry(1, 56, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2d6b95,
    roughness: 0.14,
    metalness: 0.32,
    transparent: true,
    opacity: 0.88,
  });
  material.userData.holeLocal = true;
  const water = new THREE.Mesh(geo, material);
  water.name = 'pond';
  water.position.set(HOLE.pond.x, HOLE.pond.level, HOLE.pond.z);
  water.scale.set(HOLE.pond.rx, 1, HOLE.pond.rz);
  scene.add(water);

  /* A damp margin around the waterline. Without it the pond reads as a blue
   * sticker laid on the grass. */
  const rim = new THREE.Mesh(
    geo.clone(),
    mat({ color: 0x3f4a33, roughness: 1 }),
  );
  rim.position.set(HOLE.pond.x, HOLE.pond.level - 0.08, HOLE.pond.z);
  rim.scale.set(HOLE.pond.rx * 1.06, 1, HOLE.pond.rz * 1.06);
  scene.add(rim);

  return water;
}

/* ------------------------------------------------------------------ */
/* Flag, cup, tee markers, signage                                     */
/* ------------------------------------------------------------------ */

function buildFlag(scene) {
  const g = new THREE.Group();
  g.name = 'flag';
  const base = heightAt(HOLE.pin.x, HOLE.pin.z);
  g.position.set(HOLE.pin.x, base, HOLE.pin.z);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, HOLE.flagHeight, 8),
    mat({ color: 0xe8e8ec, roughness: 0.5 }),
  );
  pole.position.y = HOLE.flagHeight / 2;
  pole.castShadow = true;
  g.add(pole);

  /* The cup liner, sunk just under the painted hole so there is something
   * with depth to it when the player stands over a two-footer. */
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry(HOLE.cupRadius, HOLE.cupRadius, 0.3, 14, 1, true),
    mat({ color: 0x101a0c, roughness: 1, side: THREE.DoubleSide }),
  );
  liner.position.y = -0.15;
  g.add(liner);

  /* A readable cup target that does not alter ball physics. The translucent
   * ring sits on the turf and remains legible through the mist on holes two
   * and three; standing over it still reveals the regulation-size liner. */
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 40),
    new THREE.MeshBasicMaterial({
      color: 0xd6c4ff, transparent: true, opacity: 0.42,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  halo.name = `hole-${HOLE.number}-cup-halo`;
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.025;
  halo.renderOrder = 75;
  g.add(halo);

  /* Club colours, on the one piece of the course everybody looks at from a
   * hundred and sixty-seven yards away. Its own material because it moves. */
  const clothGeo = new THREE.PlaneGeometry(1.02, 0.62, 8, 3);
  clothGeo.translate(0.51, 0, 0);      // hinge at the pole, not the middle
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x9a6ff0, roughness: 0.8, side: THREE.DoubleSide,
    emissive: 0x2a1550, emissiveIntensity: 0.5,
  });
  clothMat.userData.holeLocal = true;
  const cloth = new THREE.Mesh(clothGeo, clothMat);
  cloth.position.set(0, HOLE.flagHeight - 0.32, 0);
  g.add(cloth);

  scene.add(g);
  return { group: g, cloth, halo, base };
}

/** The purple-and-silver markers this club uses instead of tee boxes. */
function buildTeeMarkers(scene) {
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.20, 0.34, 8),
      mat({ color: side < 0 ? 0x7b4fd9 : 0xc9ced9, roughness: 0.7 }),
    );
    const x = HOLE.teeMarks.ball.x + side * 2.6;
    const z = HOLE.teeMarks.ball.z + 0.4;
    m.position.set(x, heightAt(x, z) + 0.17, z);
    m.name = side < 0 ? 'tee-marker-left' : 'tee-marker-right';
    m.castShadow = true;
    scene.add(m);
  }
}

function signTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#20301f';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#c9ced9';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 484, 292);
  g.textAlign = 'center';
  const styles = [
    { font: 'bold 54px "Trebuchet MS", sans-serif', fill: '#c9ced9', y: 86 },
    { font: 'italic bold 46px "Trebuchet MS", sans-serif', fill: '#b79bf0', y: 152 },
    { font: 'bold 40px "Trebuchet MS", sans-serif', fill: '#e8e8ec', y: 218 },
    { font: 'bold 40px "Trebuchet MS", sans-serif', fill: '#e8e8ec', y: 272 },
  ];
  lines.forEach((line, i) => {
    const s = styles[Math.min(i, styles.length - 1)];
    g.font = s.font;
    g.fillStyle = s.fill;
    g.fillText(line, 256, s.y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The course marker by the tee. It says what the hole is, because a player
 * standing on a tee should not have to open a menu to find out.
 */
function buildHoleMarker(scene) {
  const g = new THREE.Group();
  g.name = 'hole-marker';
  const x = HOLE.teeMarks.ball.x - 4.6;
  const z = HOLE.teeMarks.ball.z + 2.4;
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = 0.22;

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.15, 0.14),
    mat({ color: 0x3a2a1c, roughness: 1 }),
  );
  post.position.y = 0.58;
  post.castShadow = true;
  g.add(post);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.94, 0.07),
    [
      mat({ color: 0x20301f, roughness: 1 }), mat({ color: 0x20301f, roughness: 1 }),
      mat({ color: 0x20301f, roughness: 1 }), mat({ color: 0x20301f, roughness: 1 }),
      Object.assign(new THREE.MeshStandardMaterial({
        map: signTexture([
          `HOLE ${HOLE.number}`,
          (HOLE.meta?.name ?? '').toUpperCase(),
          `PAR ${HOLE.par}`,
          `${HOLE.yards} YARDS`,
        ]),
        roughness: 0.9,
      }), { userData: { holeLocal: true } }),
      mat({ color: 0x20301f, roughness: 1 }),
    ],
  );
  board.position.y = 1.55;
  board.castShadow = true;
  g.add(board);
  scene.add(g);
  return g;
}

function entranceSignTexture() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20301f';
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = '#c9ced9';
  ctx.lineWidth = 7;
  ctx.strokeRect(16, 16, 608, 328);
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#e8e8ec';
  ctx.fillText('SILVER PINES', 320, 116);
  ctx.font = 'bold 32px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#c9ced9';
  ctx.fillText('GOLF & COUNTRY CLUB', 320, 164);
  ctx.font = 'italic bold 28px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#b79bf0';
  ctx.fillText('Members and Their Guests', 320, 232);
  ctx.font = '25px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#9aa0ac';
  ctx.fillText('Please check in at the pro shop', 320, 288);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The car-park welcome board, at the spot `LOT.sign` has always named -- data
 * that has sat in the layout since Hole 1 was authored with nothing ever
 * built at it. Hole 1 is the only hole with a car park, so it is the only
 * hole with an entrance to mark; two planters flank it because a sign
 * standing alone in mown grass reads as a placeholder and this club has had
 * twenty years to plant something round its own name.
 */
function buildEntranceSign(scene) {
  if (!HOLE.lot?.sign) return null;
  const { x, z, rot = 0 } = HOLE.lot.sign;
  const g = new THREE.Group();
  g.name = 'entrance-sign';
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = rot;

  const postMat = mat({ color: 0x3a2a1c, roughness: 1 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.7, 8), postMat);
    post.position.set(side * 1.05, 0.85, 0);
    post.castShadow = true;
    g.add(post);
  }

  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.42, 0.1),
    mat({ color: 0x20301f, roughness: 1 }),
  );
  backing.position.y = 1.55;
  backing.castShadow = true;
  g.add(backing);

  const faceMat = new THREE.MeshStandardMaterial({
    map: entranceSignTexture(), roughness: 0.85,
  });
  faceMat.userData.holeLocal = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.32, 1.3), faceMat);
  face.name = 'entrance-sign-face';
  face.position.set(0, 1.55, 0.056);
  g.add(face);

  const bloomColours = [0xc65a7a, 0xe0a640];
  for (const [i, side] of [-1, 1].entries()) {
    const planter = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.32, 0.5),
      mat({ color: 0x4a3623, roughness: 0.95 }),
    );
    planter.position.set(side * 1.5, 0.16, 0.25);
    planter.castShadow = true;
    g.add(planter);
    const bloom = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 0),
      mat({ color: bloomColours[i], roughness: 0.9, flatShading: true }),
    );
    bloom.position.set(side * 1.5, 0.42, 0.25);
    g.add(bloom);
  }

  scene.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* Buildings and the rest of the club                                  */
/* ------------------------------------------------------------------ */

/**
 * The Family, waiting out the last hole between the green and the clubhouse.
 *
 * These are the crew for the job that follows the round, so they are the same
 * people they are everywhere else: the roster, the model and the face photo
 * all come from `src/bing/family.js` through the shared figure builder, which
 * is the same route NO WAKE uses to put Lou and Booski on a boat. One id, one
 * face, one voice, every scene.
 *
 * They are scenery with a pulse — no colliders, no routes, no interactions.
 * Nobody is meant to walk up and talk to them; they are meant to be standing
 * there when he looks up from the putt.
 */
function buildGallery(scene, marks, faces = new Set()) {
  const byId = Object.fromEntries(FAMILY.map((member) => [member.id, member]));
  const built = [];
  for (const mark of marks) {
    const member = byId[mark.id];
    if (!member) continue;                       // a roster rename, not a crash
    /* Only wear a photo that exists. `assets/faces/index.json` is the club's
     * own answer to this and exists precisely so nothing probes for a PNG that
     * has not landed — Numbskull has no photograph yet, and asking for one is
     * a 404 in every console and a failed no-console-errors gate. Without it
     * he gets the authored head in the shared style, same as at the Bing. */
    const photo = faces.has(member.photo) ? `assets/faces/${member.photo}` : null;
    const npc = new Npc(scene, {
      name: member.name,
      tier: 'ambient',
      job: 'stand',
      x: mark.x,
      z: mark.z,
      y: heightAt(mark.x, mark.z),
      yaw: mark.yaw ?? 0,
      model: { ...member.model, face: photo },
    });
    npc.characterId = member.id;
    npc.group.userData.npc.characterId = member.id;
    npc.group.userData.npc.family = true;
    npc.group.userData.galleryMark = mark;
    built.push(npc);
  }
  return built;
}

/**
 * The name over the door.
 *
 * Silver Pines stays Silver Pines -- it is the campaign scene id, the HUD, the
 * course marker and three holes of dialogue, and none of that is what the
 * playtest note was reacting to. What it was reacting to is the building
 * itself having no name on it. So the club keeps its own name, and the
 * clubhouse gets a second, smaller line underneath: the room inside it that is
 * actually theirs. Every other Family venue is a pun on the source it is
 * winking at -- Bada Bing, the Squatchfather -- so this one follows the same
 * rule: the Family's own grille room, inside somebody else's respectable club,
 * the way a crew in this genre always has a table nobody else can sit at.
 */
const CLUBHOUSE_NAME = 'Silver Pines';
const CLUBHOUSE_ROOM = 'The Squatch Family Grille';

function clubhouseSignTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 288;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#241a12';
  ctx.fillRect(0, 0, 1024, 288);
  ctx.strokeStyle = '#c9ced9';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 992, 256);
  ctx.textAlign = 'center';
  ctx.font = 'bold 66px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#e8e8ec';
  ctx.fillText(CLUBHOUSE_NAME.toUpperCase(), 512, 108);
  ctx.font = 'italic bold 46px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#b79bf0';
  ctx.fillText(CLUBHOUSE_ROOM, 512, 186);
  ctx.font = '28px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#9aa0ac';
  ctx.fillText('MEMBERS AND THEIR GUESTS', 512, 234);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The clubhouse: brick and dark timber, and a size that says this place was
 * more impressive twenty years ago. Modelled rather than a card because the
 * player walks past it in the opening.
 */
function buildClubhouse(scene, colliders) {
  const g = new THREE.Group();
  g.name = 'clubhouse';
  const y = heightAt(HOLE.clubhouse.x, HOLE.clubhouse.z);
  g.position.set(HOLE.clubhouse.x, y, HOLE.clubhouse.z);
  g.rotation.y = HOLE.clubhouse.rot;

  const brick = mat({ color: 0x7a4b3c, roughness: 1 });
  const timber = mat({ color: 0x33261c, roughness: 1 });
  const roofMat = mat({ color: 0x2a2622, roughness: 1 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(22, 6.4, 12), brick);
  body.position.y = 3.2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(22.3, 2.1, 12.3), timber);
  upper.position.y = 7.4;
  upper.castShadow = true;
  g.add(upper);

  const roofGeo = new THREE.CylinderGeometry(7.1, 7.1, 22.6, 3, 1, false, Math.PI / 2);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 9.9;
  roof.castShadow = true;
  g.add(roof);

  const glass = mat({ color: 0xa9c6d6, roughness: 0.25, metalness: 0.1 });
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.8, 0.14), glass);
    w.position.set(-8.6 + i * 3.5, 3.6, 6.06);
    g.add(w);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.16), timber);
  door.position.set(0, 1.3, 6.08);
  g.add(door);

  /* The name over the door, on the timber band above the windows so it does
   * not compete with either. Baked per hole, like the tee-marker board, so it
   * tears down with the rest of the geometry rather than living on its own. */
  const signMat = new THREE.MeshStandardMaterial({
    map: clubhouseSignTexture(), roughness: 0.85,
  });
  signMat.userData.holeLocal = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 2.64), signMat);
  sign.name = 'clubhouse-sign';
  sign.position.set(0, 7.4, 6.21);
  g.add(sign);

  scene.add(g);
  colliders.push(new THREE.Box3(
    new THREE.Vector3(HOLE.clubhouse.x - 13, y, HOLE.clubhouse.z - 8),
    new THREE.Vector3(HOLE.clubhouse.x + 13, y + 11, HOLE.clubhouse.z + 8),
  ));
  return g;
}

/**
 * A stocked cooler standing off the cart path, one to a hole.
 *
 * Separate from the cooler riding on the cart itself (`carts.js` builds that
 * one) -- this is the course's own amenity, planted trailside the way a real
 * club stocks water and beer along the walk, and it is rebuilt fresh with
 * every hole, which reads as the staff getting to it before the group does.
 * Same box-and-lid silhouette as the cart's cooler so the two amenities read
 * as the same object seen in two places, not two different props.
 */
function buildSideCooler(scene) {
  if (!HOLE.sideCooler) return null;
  const { x, z, rot = 0 } = HOLE.sideCooler;
  const g = new THREE.Group();
  g.name = 'course-side-cooler';
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = rot;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.60, 0.48, 0.42),
    mat({ color: 0xd8e1e5, roughness: 0.78 }),
  );
  body.position.y = 0.24;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.08, 0.46),
    mat({ color: 0x6f86a0, roughness: 0.7 }),
  );
  lid.name = 'course-side-cooler-lid';
  lid.position.y = 0.52;
  lid.castShadow = true;
  g.add(lid);

  /* Six cans, a shade more than the cart carries, because this one nobody has
   * touched yet this morning. */
  const cans = [];
  for (let i = 0; i < 6; i++) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.15, 12),
      mat({ color: i % 2 ? 0xc8cdd2 : 0x7f5ab7, roughness: 0.38, metalness: 0.58 }),
    );
    can.name = `course-side-cooler-beer-${i + 1}`;
    can.position.set(-0.19 + (i % 3) * 0.19, 0.635, -0.08 + Math.floor(i / 3) * 0.16);
    g.add(can);
    cans.push(can);
  }

  scene.add(g);
  return { group: g, lid, cans };
}

/** The next tee, over the trees. Scenery, and a promise about the round. */
function buildNextHint(scene) {
  const g = new THREE.Group();
  g.name = 'next-tee-hint';
  const t = HOLE.nextHint.tee;
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.7, 0.1),
    mat({ color: 0x4a3a8f, roughness: 0.9 }),
  );
  marker.position.set(t.x, heightAt(t.x, t.z) + 0.9, t.z);
  marker.rotation.y = -0.5;
  g.add(marker);
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6),
    mat({ color: 0x3a2a1c, roughness: 1 }),
  );
  post.position.set(t.x, heightAt(t.x, t.z) + 0.55, t.z);
  g.add(post);
  scene.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* Near-player grass detail                                            */
/* ------------------------------------------------------------------ */

/**
 * A ring of grass tufts that follows the player.
 *
 * One InstancedMesh, re-scattered when he has walked far enough to need it —
 * never thousands of individually updated meshes, and never anything at all
 * more than twenty metres away where it would not be visible anyway.
 */
class GrassDetail {
  constructor(scene, count = 620) {
    /* Small, pale and short. The first pass used tall dark slabs, which from
     * standing height read as a field of fence posts rather than as grass —
     * detail meant to be noticed only out of the corner of the eye should not
     * be the highest-contrast thing on screen. */
    const blade = new THREE.PlaneGeometry(0.07, 0.15);
    blade.translate(0, 0.075, 0);
    this.mesh = new THREE.InstancedMesh(
      blade,
      Object.assign(new THREE.MeshStandardMaterial({
        color: 0x74ad57, roughness: 1, side: THREE.DoubleSide,
      }), { userData: { holeLocal: true } }),
      count,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.count = count;
    this.radius = 13;
    this._dummy = new THREE.Object3D();
    this._at = new THREE.Vector3(1e9, 0, 1e9);
    scene.add(this.mesh);
  }

  update(playerPos) {
    if (this._at.distanceToSquared(playerPos) < 36) return;
    this._at.copy(playerPos);
    const d = this._dummy;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      /* Golden-angle spiral: an even scatter with no clumping and no random
       * numbers to keep in sync between frames. */
      const t = (i + 0.5) / this.count;
      const a = i * 2.39996 + playerPos.x * 0.31 + playerPos.z * 0.17;
      const r = Math.sqrt(t) * this.radius;
      const x = playerPos.x + Math.cos(a) * r;
      const z = playerPos.z + Math.sin(a) * r;
      const s = surfaceAt(x, z);
      // Only where grass is actually long enough to see.
      const tall = s === SURFACE.ROUGH || s === SURFACE.DEEP_ROUGH;
      d.position.set(x, heightAt(x, z), z);
      d.rotation.set(0, a * 3.1, 0);
      d.scale.setScalar(tall ? (s === SURFACE.DEEP_ROUGH ? 1.0 : 0.7) : 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export class Course {
  constructor(scene, renderer, { onProgress } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.onProgress = onProgress;
    this.colliders = [];
    /* Which Family face photos exist, for the last hole's gallery. Filled in
     * from `assets/faces/index.json` once it loads; empty until then, which is
     * the safe answer — an unindexed member simply wears his authored head.
     * The gallery is only built when hole three is, long after this resolves. */
    this.faces = new Set();
    this.gallery = [];
    loadFaceIndex().then((files) => { this.faces = files; }).catch(() => {});
    /* The core Player wants floor zones for its footstep cue; out here the
     * answer comes from `field.js` instead, so the list is empty on purpose
     * and `surfaceAt` below is what main.js actually asks. */
    this.floorZones = [];

    scene.background = new THREE.Color(SKY_COLOUR);
    scene.fog = new THREE.Fog(SKY_COLOUR, 90, 340);

    /* Late morning, sun still in the east and climbing, mist burning off. The
     * shadow camera is deliberately small and follows the player: a shadow
     * frustum big enough for a 300-metre course would have no resolution
     * anywhere.
     *
     * The light belongs to the morning, not to the hole, so it is added to the
     * scene and survives every rebuild below. */
    scene.add(new THREE.HemisphereLight(0xd7e7f5, 0x3d5233, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.15);
    sun.position.set(60, 70, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this._t = 0;
    this.holeGroup = null;
    this.build();
  }

  /**
   * Build whichever hole `HOLE` currently names.
   *
   * Everything a hole owns goes under one group, which is what makes tearing
   * it down at the next tee a single removal rather than a hunt through the
   * scene graph for the things that belonged to the last one.
   */
  build() {
    const p = this.onProgress;
    this.teardown();

    const g = new THREE.Group();
    g.name = `hole-${HOLE.number}`;
    this.holeGroup = g;
    this.scene.add(g);
    this.colliders.length = 0;

    // The air belongs to the hole, so it is set with the hole.
    const mist = mistFor();
    this.scene.fog.near = mist.near;
    this.scene.fog.far = mist.far;

    p?.('Mowing the greens…');
    this.texture = makeCourseTexture();
    this.mesh = buildTerrainMesh(this.texture, this.renderer);
    g.add(this.mesh);

    p?.('Planting the pines…');
    const trees = buildTrees(g);
    this.colliders.push(...trees.colliders);
    this.treeCount = trees.count;

    p?.('Filling the pond…');
    this.water = buildPond(g);
    this.flag = buildFlag(g);
    buildTeeMarkers(g);
    this.marker = buildHoleMarker(g);
    this.entranceSign = buildEntranceSign(g);
    /* The clubhouse belongs to any hole that can see it, not to the hole with
     * the car park on it. Gating it on `lot` meant the last hole — whose whole
     * staging is the building standing square behind the final green — did not
     * have one. */
    if (HOLE.clubhouse) buildClubhouse(g, this.colliders);
    /* One stocked cooler a hole, standing off the path -- a fresh one, not the
     * same cans carried over, because it is not the same physical cooler. */
    this.sideCooler = buildSideCooler(g);
    if (HOLE.nextHint) buildNextHint(g);
    /* The crew waiting out the last hole. They belong to the hole group so a
     * hole change disposes them with everything else, and they are figures
     * rather than Golfers because they are not playing — nobody hands them a
     * club, a ball or a scorecard line. */
    this.gallery = HOLE.gallery ? buildGallery(g, HOLE.gallery, this.faces) : [];

    this.grass = new GrassDetail(g);
    this._waterBase = this.water ? this.water.position.y : 0;
    return this;
  }

  /** Load a different hole. The fade between tees is what hides this. */
  load(number) {
    setActiveHole(number);
    return this.build();
  }

  /**
   * Give back everything the last hole was holding.
   *
   * Geometry and textures are not garbage collected — they live on the GPU
   * until something disposes them — so a course that rebuilt three times
   * without this would leak two holes' worth of terrain, trees and canvas
   * textures into a scene that is still running.
   */
  teardown() {
    if (!this.holeGroup) return;
    this.holeGroup.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose?.();
        /* Materials are shared through `mat()` and must not be disposed here;
         * the ones this file makes itself are unique and are the flag, the
         * water, the grass and the painted sign. */
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (m?.userData?.holeLocal) {
            m.map?.dispose?.();
            m.dispose?.();
          }
        }
      }
    });
    this.scene.remove(this.holeGroup);
    this.texture?.dispose();
    this.texture = null;
    this.holeGroup = null;
  }

  /** What the player is standing on. Same answer the ball gets. */
  groundAt(x, z) {
    return heightAt(x, z);
  }

  surfaceAt(x, z) {
    return surfaceAt(x, z);
  }

  update(dt, playerPos) {
    this._t += dt;

    // The gallery breathes and shifts its weight, and looks at whoever is on
    // the green. They belong to the hole, so they update with it.
    if (this.gallery?.length) {
      for (const npc of this.gallery) npc.update(dt, playerPos);
    }

    // The flag moves in the same light wind the ball flies through.
    const cloth = this.flag.cloth;
    const wave = Math.sin(this._t * 2.4) * 0.10 + Math.sin(this._t * 5.1) * 0.04;
    cloth.rotation.y = -0.35 + wave;
    cloth.rotation.z = 0.06 + Math.sin(this._t * 3.3) * 0.05;

    // A slow breathing on the pond, rather than a scrolling normal map.
    if (this.water) {
      this.water.position.y = this._waterBase + Math.sin(this._t * 0.7) * 0.012;
    }

    if (playerPos) {
      this.grass.update(playerPos);
      /* Keep the shadow frustum around the player. Without this the whole
       * course either has no shadows or has shadows made of porridge. */
      this.sun.position.set(playerPos.x + 60, playerPos.y + 70, playerPos.z + 40);
      this.sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.teardown();
  }
}

export { HOLE, heightAt, surfaceAt };

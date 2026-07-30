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
import { HOLE } from './hole.js';

/* Late morning after overnight rain: the light is warm and low-ish, the air
 * still has mist in it, and everything is a shade wetter than it will be by
 * lunchtime. */
export const SKY_COLOUR = 0xbcd4e6;
const MIST_NEAR = 90;
const MIST_FAR = 340;

/* ------------------------------------------------------------------ */
/* The painted course                                                  */
/* ------------------------------------------------------------------ */

/* Baked once at load. 768×1152 over 182m × 308m is about four pixels per metre
 * down the hole, which is enough for a bunker lip and cheap enough to generate
 * inside the loading bar. */
const TEX_W = 768;
const TEX_H = 1152;

function tint(hex, mul) {
  const r = Math.min(255, ((hex >> 16) & 255) * mul);
  const g = Math.min(255, ((hex >> 8) & 255) * mul);
  const b = Math.min(255, (hex & 255) * mul);
  return [r, g, b];
}

function makeCourseTexture(onProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TEX_W, TEX_H);
  const data = img.data;

  const spanX = HOLE.terrain.maxX - HOLE.terrain.minX;
  const spanZ = HOLE.terrain.maxZ - HOLE.terrain.minZ;

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
  const material = mat({ map: texture, roughness: 0.96, metalness: 0 });
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
  const geo = new THREE.CircleGeometry(1, 56, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2d6b95,
    roughness: 0.14,
    metalness: 0.32,
    transparent: true,
    opacity: 0.88,
  });
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
  const base = heightAt(HOLE.pin.x, HOLE.pin.z);
  g.position.set(HOLE.pin.x, base, HOLE.pin.z);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, HOLE.flagHeight, 6),
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

  /* Club colours, on the one piece of the course everybody looks at from a
   * hundred and sixty-seven yards away. Its own material because it moves. */
  const clothGeo = new THREE.PlaneGeometry(0.76, 0.48, 8, 3);
  clothGeo.translate(0.38, 0, 0);      // hinge at the pole, not the middle
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({
    color: 0x9a6ff0, roughness: 0.8, side: THREE.DoubleSide,
    emissive: 0x2a1550, emissiveIntensity: 0.5,
  }));
  cloth.position.set(0, HOLE.flagHeight - 0.32, 0);
  g.add(cloth);

  scene.add(g);
  return { group: g, cloth, base };
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
      new THREE.MeshStandardMaterial({
        map: signTexture(['HOLE 1', 'THE INVITATION', 'PAR 3', '167 YARDS']),
        roughness: 0.9,
      }),
      mat({ color: 0x20301f, roughness: 1 }),
    ],
  );
  board.position.y = 1.55;
  board.castShadow = true;
  g.add(board);
  scene.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* Buildings and the rest of the club                                  */
/* ------------------------------------------------------------------ */

/**
 * The clubhouse: brick and dark timber, and a size that says this place was
 * more impressive twenty years ago. Modelled rather than a card because the
 * player walks past it in the opening.
 */
function buildClubhouse(scene, colliders) {
  const g = new THREE.Group();
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

  scene.add(g);
  colliders.push(new THREE.Box3(
    new THREE.Vector3(HOLE.clubhouse.x - 13, y, HOLE.clubhouse.z - 8),
    new THREE.Vector3(HOLE.clubhouse.x + 13, y + 11, HOLE.clubhouse.z + 8),
  ));
  return g;
}

/** The next tee, over the trees. Scenery, and a promise about the round. */
function buildHole2Hint(scene) {
  const g = new THREE.Group();
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
      new THREE.MeshStandardMaterial({
        color: 0x74ad57, roughness: 1, side: THREE.DoubleSide,
      }),
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
    this.colliders = [];
    /* The core Player wants floor zones for its footstep cue; out here the
     * answer comes from `field.js` instead, so the list is empty on purpose
     * and `surfaceAt` below is what main.js actually asks. */
    this.floorZones = [];

    scene.background = new THREE.Color(SKY_COLOUR);
    scene.fog = new THREE.Fog(SKY_COLOUR, MIST_NEAR, MIST_FAR);

    /* Late morning, sun still in the east and climbing, mist burning off. The
     * shadow camera is deliberately small and follows the player: a shadow
     * frustum big enough for a 300-metre course would have no resolution
     * anywhere. */
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

    onProgress?.('Mowing the greens…');
    this.texture = makeCourseTexture();
    this.mesh = buildTerrainMesh(this.texture, renderer);
    scene.add(this.mesh);

    onProgress?.('Planting the pines…');
    const trees = buildTrees(scene);
    this.colliders.push(...trees.colliders);
    this.treeCount = trees.count;

    onProgress?.('Filling the pond…');
    this.water = buildPond(scene);
    this.flag = buildFlag(scene);
    buildTeeMarkers(scene);
    this.marker = buildHoleMarker(scene);
    buildClubhouse(scene, this.colliders);
    buildHole2Hint(scene);

    this.grass = new GrassDetail(scene);
    this._t = 0;
    this._waterBase = this.water.position.y;
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

    // The flag moves in the same light wind the ball flies through.
    const cloth = this.flag.cloth;
    const wave = Math.sin(this._t * 2.4) * 0.10 + Math.sin(this._t * 5.1) * 0.04;
    cloth.rotation.y = -0.35 + wave;
    cloth.rotation.z = 0.06 + Math.sin(this._t * 3.3) * 0.05;

    // A slow breathing on the pond, rather than a scrolling normal map.
    this.water.position.y = this._waterBase + Math.sin(this._t * 0.7) * 0.012;

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
    this.texture?.dispose();
    this.mesh?.geometry?.dispose();
  }
}

export { HOLE, heightAt, surfaceAt };

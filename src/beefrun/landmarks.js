/**
 * The things Lou navigates by.
 *
 * There is no GPS in the Brushrunner and the one radio that works only
 * receives. So the route is flown by looking out of the window: a tower with
 * the top missing, a river bent into a horseshoe, a volcano with a thin smoke
 * plume, a red cliff, and finally a waterfall with a mountain behind it and a
 * runway in front.
 *
 * Each landmark is a single group, built once and left in the world — they are
 * big enough to be visible from a long way off, which is the entire point of
 * them, so they are not part of the streaming.
 */
import * as THREE from 'three';
import {
  solid, unlit, mat, boxGeo, cylGeo, coneGeo, sphereGeo, planeGeo,
  mesh, flatMesh, group, signTexture, rng, clamp,
} from './util.js';
import { LANDMARKS } from './config.js';
import { terrainHeight } from './terrain.js';

function brokenTower(x, z) {
  const g = group('landmark-tower');
  const y = terrainHeight(x, z);
  const steel = solid(0x8a5a42, { roughness: 0.85, metalness: 0.4 });   // rusted through
  // Three legs, leaning, with the top forty metres missing.
  for (let i = 0; i < 9; i++) {
    const level = i * 9;
    const shrink = 1 - i * 0.06;
    for (const [ax, az] of [[-1, -0.6], [1, -0.6], [0, 1.2]]) {
      const leg = mesh(boxGeo(1.1, 9, 1.1), steel, ax * 7 * shrink, y + level + 4.5, az * 7 * shrink);
      leg.rotation.z = -ax * 0.03;
      g.add(leg);
    }
    g.add(mesh(boxGeo(15 * shrink, 0.7, 15 * shrink), steel, 0, y + level + 9, 0));
  }
  // The top, lying in the scrub where it landed.
  const fallen = mesh(boxGeo(4, 4, 30), steel, x * 0 + 40, y + 2, 26);
  fallen.rotation.set(0.1, 0.6, 0.06);
  g.add(fallen);
  g.position.set(x, 0, z);
  return g;
}

function horseshoeRiver(x, z) {
  const g = group('landmark-river');
  const water = mat({ color: 0x3f6f9a, roughness: 0.18, metalness: 0.05 });
  // A ribbon bent into a horseshoe, laid just above the ground it cuts through.
  const pts = [];
  const R = 420;
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI * 1.15 * (i / 48) - Math.PI * 0.08;
    pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R * 0.8));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b);
    const seg = flatMesh(planeGeo(64, len + 6), water, mid.x, terrainHeight(x + mid.x, z + mid.z) + 1.2, mid.z);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z);
    g.add(seg);
    // Sand bars on the inside of the bend.
    if (i % 6 === 0) {
      const bar = flatMesh(new THREE.CircleGeometry(22, 10), solid(0xbaa87c, { roughness: 1 }), mid.x * 0.88, terrainHeight(x + mid.x * 0.88, z + mid.z * 0.88) + 1.3, mid.z * 0.88);
      bar.rotation.x = -Math.PI / 2;
      g.add(bar);
    }
  }
  g.position.set(x, 0, z);
  return g;
}

function volcano(x, z) {
  const g = group('landmark-volcano');
  const y = terrainHeight(x, z);
  const rock = solid(0x4a4038, { roughness: 1 });
  const cone = mesh(coneGeo(520, 620, 9), rock, 0, y + 250, 0);
  cone.receiveShadow = false;
  g.add(cone);
  // Crater rim: a darker ring set into the top.
  const rim = mesh(cylGeo(88, 130, 40, 10), solid(0x2e2822, { roughness: 1 }), 0, y + 545, 0);
  g.add(rim);
  const glow = flatMesh(new THREE.CircleGeometry(80, 12), unlit(0xd94f1e), 0, y + 532, 0);
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);
  // The plume: a thin stack of translucent puffs that drift.
  const plume = new THREE.Group();
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xb8b0a8, transparent: true, opacity: 0.3, depthWrite: false });
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(sphereGeo(1, 7, 5), smokeMat);
    const s = 30 + i * 9;
    p.scale.set(s, s * 0.8, s);
    p.position.set(i * 9, y + 590 + i * 46, i * 5);
    plume.add(p);
    puffs.push(p);
  }
  g.add(plume);
  g.position.set(x, 0, z);
  g.userData.puffs = puffs;
  return g;
}

function redCliff(x, z) {
  const g = group('landmark-cliff');
  const y = terrainHeight(x, z);
  const red = solid(0xa8442a, { roughness: 1 });
  const redDark = solid(0x7a2f1e, { roughness: 1 });
  // A face of stacked slabs, deliberately unmissable.
  for (let i = 0; i < 7; i++) {
    const w = 420 - i * 26;
    const slab = mesh(boxGeo(w, 42, 150 - i * 12), i % 2 ? red : redDark, (i % 2 ? 8 : -8), y + 20 + i * 40, 0);
    g.add(slab);
  }
  g.position.set(x, 0, z);
  g.rotation.y = 0.3;
  return g;
}

function waterfall(x, z) {
  const g = group('landmark-falls');
  const y = terrainHeight(x, z);
  const rock = solid(0x4a5244, { roughness: 1 });
  g.add(mesh(boxGeo(300, 300, 90), rock, 0, y + 150, -40));
  // The fall itself: a bright sheet with a mist ball at the bottom.
  const sheet = flatMesh(planeGeo(52, 240), mat({ color: 0xdfeef4, roughness: 0.1, emissive: 0xaac8d8, emissiveIntensity: 0.35 }), 0, y + 150, 8);
  g.add(sheet);
  const mistMat = new THREE.MeshBasicMaterial({ color: 0xe4eef2, transparent: true, opacity: 0.42, depthWrite: false });
  const mist = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(sphereGeo(1, 7, 5), mistMat);
    const s = 18 + i * 6;
    m.scale.set(s, s * 0.7, s);
    m.position.set((Math.random() - 0.5) * 40, y + 24 + Math.random() * 26, 16 + Math.random() * 20);
    g.add(m);
    mist.push(m);
  }
  // The pool, and the river leaving it toward the strip.
  const pool = flatMesh(new THREE.CircleGeometry(60, 16), mat({ color: 0x3f7f9a, roughness: 0.15 }), 0, y + 3, 40);
  pool.rotation.x = -Math.PI / 2;
  g.add(pool);
  g.position.set(x, 0, z);
  g.userData.mist = mist;
  return g;
}

/**
 * A radio mast with the Bureau's badge on it: an eagle holding a fork.
 * These are the things the player is supposed to stay away from on the way
 * back, and they are marked so there is no guessing involved.
 */
export function caibTower(x, z) {
  const g = group('caib-tower');
  const y = terrainHeight(x, z);
  const steel = solid(0xb8bcc2, { roughness: 0.5, metalness: 0.6 });
  const red = solid(0xd92e2e, { roughness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const band = i % 2 ? red : steel;
    for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const shrink = 1 - i * 0.07;
      g.add(mesh(boxGeo(0.5, 7, 0.5), band, ax * 3.4 * shrink, y + i * 7 + 3.5, az * 3.4 * shrink));
    }
    g.add(mesh(boxGeo(7 * (1 - i * 0.07), 0.4, 7 * (1 - i * 0.07)), steel, 0, y + i * 7 + 7, 0));
  }
  // Dishes, and the badge.
  for (const a of [0, 2.1, 4.2]) {
    const dish = mesh(cylGeo(2.4, 2.4, 0.4, 12), solid(0xd8d2c0, { roughness: 0.6 }), Math.cos(a) * 3.4, y + 44, Math.sin(a) * 3.4);
    dish.rotation.z = Math.PI / 2;
    dish.rotation.y = -a;
    g.add(dish);
  }
  const badge = flatMesh(planeGeo(6, 6), mat({ map: caibBadgeTexture(), roughness: 0.8, transparent: true }), 0, y + 20, 3.7);
  g.add(badge);
  const beacon = flatMesh(sphereGeo(0.8), unlit(0xff3a2a), 0, y + 57, 0);
  g.add(beacon);
  g.position.set(x, 0, z);
  g.userData.beacon = beacon;
  return g;
}

/** The insignia: an eagle holding a fork. Nobody at the Bureau finds it funny. */
export function caibBadgeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#1b2a4a';
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8c88a';
  ctx.lineWidth = 7;
  ctx.stroke();
  // Eagle: a blocky heraldic bird.
  ctx.fillStyle = '#d8c88a';
  ctx.beginPath();
  ctx.moveTo(128, 62);
  ctx.lineTo(150, 96);
  ctx.lineTo(214, 108);
  ctx.lineTo(158, 126);
  ctx.lineTo(170, 176);
  ctx.lineTo(128, 150);
  ctx.lineTo(86, 176);
  ctx.lineTo(98, 126);
  ctx.lineTo(42, 108);
  ctx.lineTo(106, 96);
  ctx.closePath();
  ctx.fill();
  // The fork, held in the talons.
  ctx.strokeStyle = '#e8e2d0';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(128, 150);
  ctx.lineTo(128, 206);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (const dx of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.moveTo(128 + dx, 206);
    ctx.lineTo(128 + dx, 232);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8e2d0';
  ctx.font = '900 22px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('C A I B', 128, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */

export function buildLandmarks(scene) {
  const root = group('landmarks');
  scene.add(root);
  const built = {};
  const builders = {
    tower: brokenTower, river: horseshoeRiver, volcano, cliff: redCliff, falls: waterfall,
  };
  for (const lm of LANDMARKS) {
    const make = builders[lm.kind];
    if (!make) continue;
    const g = make(lm.x, lm.z);
    root.add(g);
    built[lm.id] = { ...lm, group: g };
  }

  // The Bureau's masts, scattered over the high ground on the way home.
  const rand = rng(0xca1b);
  const towers = [];
  for (let i = 0; i < 7; i++) {
    const x = (rand() - 0.5) * 1800;
    const z = -1400 - i * 1150 - rand() * 400;
    const t = caibTower(x, z);
    root.add(t);
    towers.push({ group: t, position: new THREE.Vector3(x, terrainHeight(x, z), z) });
  }

  let t = 0;
  return {
    root, marks: built, towers,
    update(dt, focus) {
      t += dt;
      const vol = built.volcano?.group;
      if (vol) {
        for (let i = 0; i < vol.userData.puffs.length; i++) {
          const p = vol.userData.puffs[i];
          p.position.x = i * 9 + Math.sin(t * 0.2 + i * 0.5) * (12 + i * 5);
          p.position.z = i * 5 + Math.cos(t * 0.17 + i * 0.4) * (10 + i * 4);
        }
      }
      const falls = built.falls?.group;
      if (falls) {
        for (let i = 0; i < falls.userData.mist.length; i++) {
          const m = falls.userData.mist[i];
          m.scale.setScalar((18 + i * 6) * (1 + Math.sin(t * 1.2 + i) * 0.12));
        }
      }
      for (const tw of towers) {
        const b = tw.group.userData.beacon;
        if (b) b.visible = Math.sin(t * 2.6 + tw.position.x) > 0;
      }
      void focus; void clamp; void signTexture;
    },
  };
}

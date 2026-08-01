import * as THREE from 'three';
import { Figure, buildHead } from '../characters/Figure.js';
import { resolveGear } from '../../world/gear.js';

// The whole set: wet street under the elevated line, the dining room, the
// narrow hallway, and the bathroom with the thing behind the toilet.
//
// Everything is built from primitives and canvas textures, same as the rest of
// the game — no asset files. The builder returns the handful of live objects
// the scene logic needs (colliders, doors, interactables, rattling glassware,
// flickering lights, the train, the traffic).

// ---------- Layout ----------
// +Z runs deeper into the restaurant. The street is at negative Z.

export const POS = {
  // Beside the parked car, with enough clearance for Prospect's collision
  // radius. The old x=-14 point was inside the car's blocker.
  playerStart: new THREE.Vector3(-12, 0, -2.6),
  doorApproach: new THREE.Vector3(0, 0, -2.4),
  tableCenter: new THREE.Vector3(0, 0, 5),
  prospectSeat: new THREE.Vector3(0, 0, 3.1),
  salSeat: new THREE.Vector3(0, 0, 6.9),
  mcSeat: new THREE.Vector3(1.95, 0, 5),
  hallMouth: new THREE.Vector3(5, 0, 10.6),
  bathroomDoor: new THREE.Vector3(5, 0, 15),
  toilet: new THREE.Vector3(5.35, 0, 18.5),
  toiletSearch: new THREE.Vector3(5.35, 1.02, 19.08),
  mirror: new THREE.Vector3(2.15, 1.55, 16.9),
  getawayCar: new THREE.Vector3(-2.8, 0, -5.1),
};

export const PLAYER_START_YAW = -Math.PI / 2 - 0.02;

export const ROOM = {
  dining: { x0: -7, x1: 7, z0: 0, z1: 11, h: 3.2 },
  hall: { x0: 3.8, x1: 6.2, z0: 11, z1: 15, h: 2.6 },
  bath: { x0: 2.0, x1: 6.4, z0: 15, z1: 19.2, h: 2.7 },
  sidewalk: { x0: -22, x1: 12, z0: -4.6, z1: 0 },
};

export const SQUATCHFATHER_ART_SLOTS = [
  'squatchfather.dining.coast',
  'squatchfather.portrait.uncle_lou',
  'squatchfather.portrait.rippinflow',
  'squatchfather.portrait.booskibro',
  'squatchfather.portrait.shubenator',
  'squatchfather.portrait.sauce',
  'squatchfather.portrait.lag',
  'squatchfather.portrait.hogmama',
  'squatchfather.portrait.ape',
  'squatchfather.portrait.eric',
  'squatchfather.portrait.irish',
  'squatchfather.portrait.seff',
];

// ---------- Shared caches ----------

const matCache = new Map();
const geoCache = new Map();

function lam(color, extra = null) {
  const key = `l${color}|${extra ? JSON.stringify(extra) : ''}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
  return matCache.get(key);
}

function phong(color, extra = null) {
  const key = `p${color}|${extra ? JSON.stringify(extra) : ''}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshPhongMaterial({ color, ...(extra || {}) }));
  return matCache.get(key);
}

function boxGeo(w, h, d) {
  const key = `b${w},${h},${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

function cylGeo(rt, rb, h, seg = 12) {
  const key = `c${rt},${rb},${h},${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(key);
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- Canvas textures ----------

function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  return t;
}

// A bigfoot silhouette — the joke hidden in the wallpaper, also used on signs.
function drawSquatch(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -26, 11, 13, 0, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-16, -14);
  ctx.quadraticCurveTo(-22, 4, -15, 24);
  ctx.lineTo(-6, 24);
  ctx.lineTo(-6, 6);
  ctx.lineTo(6, 6);
  ctx.lineTo(6, 24);
  ctx.lineTo(15, 24);
  ctx.quadraticCurveTo(22, 4, 16, -14);
  ctx.quadraticCurveTo(0, -22, -16, -14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // long arms
  ctx.ellipse(-18, 0, 4, 15, 0.12, 0, Math.PI * 2);
  ctx.ellipse(18, 0, 4, 15, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const TEX = {};

function buildTextures() {
  if (TEX.built) return TEX;
  TEX.built = true;

  // Dark stained plank floor
  TEX.woodFloor = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#2a1c12';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const y = i * 32;
      c.fillStyle = i % 2 ? '#33231600' : '#00000022';
      c.fillRect(0, y, w, 32);
      c.strokeStyle = 'rgba(0,0,0,.55)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      for (let k = 0; k < 3; k++) {
        const x = ((i * 71 + k * 97) % 240) + 8;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 32);
        c.stroke();
      }
      c.strokeStyle = 'rgba(120,86,54,.16)';
      c.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const yy = y + 4 + k * 5;
        c.beginPath();
        c.moveTo(0, yy);
        c.bezierCurveTo(w / 3, yy + 2, (2 * w) / 3, yy - 2, w, yy);
        c.stroke();
      }
    }
  }, { repeat: [7, 6] });

  // Wallpaper: a tired damask with something extra in the pattern
  TEX.wallpaper = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#4a2f22';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,110,70,.22)';
    c.lineWidth = 2;
    for (const [cx, cy] of [[64, 64], [192, 192]]) {
      c.beginPath();
      c.arc(cx, cy, 26, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, 15, 0, Math.PI * 2);
      c.stroke();
    }
    drawSquatch(c, 192, 64, 0.55, 'rgba(126,92,58,.30)');
    drawSquatch(c, 64, 192, 0.55, 'rgba(126,92,58,.30)');
  }, { repeat: [6, 2] });

  // Cold green bathroom tile
  TEX.tile = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#5d7a63';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#33463a';
    c.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke();
      c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,.14)';
    for (let i = 0; i < 26; i++) {
      c.fillRect((i * 53) % w, (i * 31) % h, 10, 7);
    }
  }, { repeat: [4, 3] });

  // Cracked mirror — glass with a spider of fractures
  TEX.mirror = canvasTex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#5a6068');
    g.addColorStop(0.5, '#7d848e');
    g.addColorStop(1, '#4a5058');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 40; i++) c.fillRect((i * 97) % w, (i * 61) % h, 12, 3);
    c.strokeStyle = 'rgba(235,240,250,.75)';
    c.lineWidth = 1.6;
    const cx = 170; const cy = 96;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * (40 + (i % 3) * 34), cy + Math.sin(a) * (40 + (i % 4) * 30));
      c.stroke();
    }
    c.beginPath();
    for (let i = 0; i <= 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4;
      const r = 22 + (i % 2) * 8;
      const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  });

  TEX.clipping = canvasTex(512, 320, (c, w, h) => {
    c.fillStyle = '#ddd2b4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1712';
    c.font = 'bold 20px Georgia, serif';
    c.textAlign = 'center';
    c.fillText('THE VALLEY LEDGER', w / 2, 34);
    c.fillRect(24, 46, w - 48, 2);
    c.font = 'bold 44px Georgia, serif';
    c.fillText('SASQUATCHES WIN', w / 2, 106);
    c.fillText('WEDNESDAY NIGHT', w / 2, 152);
    c.fillText('AGAIN', w / 2, 198);
    c.font = 'italic 17px Georgia, serif';
    c.fillText('“We simply included harder.” — team spokesman', w / 2, 232);
    c.fillStyle = 'rgba(60,50,36,.55)';
    for (let i = 0; i < 5; i++) c.fillRect(40, 252 + i * 12, w - 80, 4);
    c.fillStyle = 'rgba(120,100,70,.18)';
    for (let i = 0; i < 60; i++) c.fillRect((i * 137) % w, (i * 71) % h, 9, 9);
  });

  TEX.specials = canvasTex(384, 512, (c, w, h) => {
    c.fillStyle = '#1d2420';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.lineWidth = 3;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.textAlign = 'center';
    c.fillStyle = '#f0ead8';
    c.font = 'italic bold 34px Georgia, serif';
    c.fillText('TONIGHT', w / 2, 78);
    c.fillStyle = '#c9a86a';
    c.font = 'italic bold 40px Georgia, serif';
    c.fillText('THE GREAT', w / 2, 168);
    c.fillText('INCLUDER', w / 2, 214);
    c.fillStyle = '#e8e2d0';
    c.font = 'italic 22px Georgia, serif';
    c.fillText('everything on it.', w / 2, 262);
    c.fillText('everyone gets a plate.', w / 2, 294);
    c.font = 'italic 20px Georgia, serif';
    c.fillStyle = '#9fb0a4';
    c.fillText('— veal — clams —', w / 2, 356);
    c.fillText('— the usual —', w / 2, 388);
    c.fillStyle = '#c9a86a';
    c.font = 'italic bold 26px Georgia, serif';
    c.fillText('Silver Squatch Reserve', w / 2, 452);
  });

  TEX.noSquatch = canvasTex(512, 200, (c, w, h) => {
    c.fillStyle = '#e6e0cd';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(90,70,40,.25)';
    for (let i = 0; i < 40; i++) c.fillRect((i * 113) % w, (i * 67) % h, 8, 8);
    c.fillStyle = '#2a2118';
    c.textAlign = 'center';
    c.font = 'bold 40px Georgia, serif';
    c.fillText('NO SHOES  NO SHIRT', w / 2, 78);
    c.fillText('NO SQUATCH', w / 2, 132);
    c.fillStyle = 'rgba(42,33,24,.65)';
    drawSquatch(c, 62, 100, 1.05, 'rgba(42,33,24,.5)');
    drawSquatch(c, 450, 100, 1.05, 'rgba(42,33,24,.5)');
  });

  TEX.wineLabel = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#2b1a26';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e7e9f0';
    c.fillRect(24, 60, w - 48, 140);
    c.fillStyle = '#3a2a55';
    c.textAlign = 'center';
    c.font = 'bold 26px Georgia, serif';
    c.fillText('SILVER', w / 2, 104);
    c.fillText('SQUATCH', w / 2, 134);
    c.font = 'italic 20px Georgia, serif';
    c.fillText('Reserve', w / 2, 166);
    drawSquatch(c, w / 2, 188, 0.32, 'rgba(58,42,85,.75)');
  });

  TEX.portrait = canvasTex(128, 160, (c, w, h) => {
    c.fillStyle = '#c8b795';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#8d7d63';
    c.beginPath();
    c.arc(w / 2, 62, 26, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(w / 2 - 42, h);
    c.quadraticCurveTo(w / 2, 78, w / 2 + 42, h);
    c.fill();
    c.fillStyle = 'rgba(80,64,44,.35)';
    for (let i = 0; i < 30; i++) c.fillRect((i * 53) % w, (i * 37) % h, 6, 6);
  });

  TEX.asphalt = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#15161c';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 20 + Math.floor(Math.random() * 26);
      c.fillStyle = `rgba(${v},${v + 2},${v + 6},.6)`;
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, { repeat: [8, 4] });

  TEX.sidewalk = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#2b2c33';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(10,10,14,.9)';
    c.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      c.beginPath(); c.moveTo(i * 128, 0); c.lineTo(i * 128, h); c.stroke();
      c.beginPath(); c.moveTo(0, i * 128); c.lineTo(w, i * 128); c.stroke();
    }
    for (let i = 0; i < 400; i++) {
      const v = 36 + Math.floor(Math.random() * 22);
      c.fillStyle = `rgba(${v},${v},${v + 6},.5)`;
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, { repeat: [10, 2] });

  TEX.brick = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#3a2622';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#4a2f28';
    for (let r = 0; r < 16; r++) {
      const off = (r % 2) * 16;
      for (let i = -1; i < 8; i++) c.fillRect(i * 32 + off + 2, r * 16 + 2, 28, 12);
    }
    c.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < 200; i++) c.fillRect(Math.random() * w, Math.random() * h, 5, 5);
  }, { repeat: [6, 3] });

  return TEX;
}

// ---------- Builder ----------

export function buildSquatchfatherScene(scene, renderer) {
  const T = buildTextures();
  scene.background = new THREE.Color(0x0a0c14);
  scene.fog = new THREE.Fog(0x0a0c14, 18, 70);

  const colliders = [];
  const interactables = [];
  const glassware = [];
  const candles = [];

  // Registers an axis-aligned blocker footprint. `id` lets doors toggle theirs.
  function block(x, z, w, d, id = null) {
    const c = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, id, on: true };
    colliders.push(c);
    return c;
  }

  function solid(w, h, d, mat, x, y, z, parent = scene) {
    const m = box(w, h, d, mat, x, y, z);
    parent.add(m);
    block(x, z, w, d);
    return m;
  }

  // ================= EXTERIOR =================

  const street = new THREE.Group();
  scene.add(street);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 12), phong(0x20222a, {
    map: T.asphalt, shininess: 60, specular: 0x556070,
  }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(-4, 0.01, -10.6);
  road.receiveShadow = true;
  street.add(road);

  const walk = new THREE.Mesh(new THREE.PlaneGeometry(90, 4.6), phong(0x35373f, {
    map: T.sidewalk, shininess: 34, specular: 0x424a58,
  }));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(-4, 0.06, -2.3);
  walk.receiveShadow = true;
  street.add(walk);
  street.add(box(90, 0.16, 0.3, lam(0x4a4c54), -4, 0.05, -4.55)); // curb

  // Puddles left over from the rain
  const puddleMat = phong(0x0d1018, { shininess: 110, specular: 0x8fa4c8, transparent: true, opacity: 0.75 });
  for (const [px, pz, ps] of [[-9.5, -3.2, 1.5], [-2.2, -2.0, 1.0], [3.6, -3.6, 1.9], [-16, -2.4, 1.2]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(ps, 16), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.y = 0.6;
    p.position.set(px, 0.075, pz);
    street.add(p);
  }

  // Far side of the street: blank warehouse wall so the road reads as a canyon
  const farWall = box(90, 12, 1, lam(0x1a1720, { map: T.brick }), -4, 6, -17.5);
  street.add(farWall);

  // Elevated railway
  const rail = new THREE.Group();
  street.add(rail);
  const girder = lam(0x241f28);
  rail.add(box(90, 0.7, 7, girder, -4, 7.6, -10.2));
  rail.add(box(90, 0.35, 0.35, lam(0x1b1720), -4, 8.05, -12.6));
  rail.add(box(90, 0.35, 0.35, lam(0x1b1720), -4, 8.05, -7.8));
  for (let i = 0; i < 12; i++) {
    const x = -46 + i * 8;
    rail.add(box(1.0, 7.3, 1.0, girder, x, 3.65, -13.4));
    rail.add(box(1.0, 7.3, 1.0, girder, x, 3.65, -7.0));
    rail.add(box(1.0, 0.5, 7, girder, x, 7.1, -10.2));
  }
  // Ties read fine as one dark strip from street level
  const tieStrip = new THREE.Mesh(new THREE.PlaneGeometry(90, 7), lam(0x100d16));
  tieStrip.rotation.x = -Math.PI / 2;
  tieStrip.position.set(-4, 7.96, -10.2);
  rail.add(tieStrip);

  // The train itself — parked far off-screen until the sequence needs it.
  const train = new THREE.Group();
  const carMat = lam(0x2b3340);
  const litMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  for (let i = 0; i < 5; i++) {
    const z = i * 12;
    train.add(box(11.4, 3.0, 3.2, carMat, z, 9.8, -10.2));
    for (let wnd = 0; wnd < 4; wnd++) {
      const wx = z - 4.2 + wnd * 2.8;
      const a = new THREE.Mesh(boxGeo(1.7, 1.0, 0.1), litMat);
      a.position.set(wx, 10.2, -8.62);
      train.add(a);
      const b = a.clone();
      b.position.z = -11.78;
      train.add(b);
    }
    train.add(box(11.4, 0.5, 3.4, lam(0x1a2029), z, 8.3, -10.2));
  }
  train.position.x = -260;
  train.visible = false;
  street.add(train);

  // Restaurant facade
  const facade = new THREE.Group();
  scene.add(facade);
  const brickMat = lam(0x3a2622, { map: T.brick });
  // Built around the shopfront rather than across it — a single slab here
  // walled the place up, so from the street there was no door and no windows.
  facade.add(box(6, 11, 0.5, brickMat, -10, 5.5, -0.25));   // left of the front
  facade.add(box(6, 11, 0.5, brickMat, 10, 5.5, -0.25));    // right of the front
  facade.add(box(14, 8.6, 0.5, brickMat, 0, 6.7, -0.25));   // header above the glass
  facade.add(box(6.3, 1.0, 0.5, brickMat, -3.85, 0.5, -0.25)); // stall risers, either
  facade.add(box(6.3, 1.0, 0.5, brickMat, 3.85, 0.5, -0.25));  // side of the doorway
  block(-10, -0.25, 6, 0.5);
  block(10, -0.25, 6, 0.5);
  facade.add(box(13, 0.5, 1.4, lam(0x241a2e), 0, 4.0, -0.7)); // awning band
  for (let i = 0; i < 5; i++) {
    facade.add(box(1.9, 0.42, 1.4, lam(i % 2 ? 0x6e2f2f : 0xe8e6de), -4 + i * 2, 3.75, -0.72));
  }

  // Neon-ish sign over the door
  const signTex = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#120c18';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = '#f4c96a';
    c.font = 'italic bold 54px Georgia, serif';
    c.fillText("SORRENTO'S", w / 2, 64);
    c.fillStyle = '#cfd4e0';
    c.font = 'italic 24px Georgia, serif';
    c.fillText('· ITALIAN · UNDER THE LINE ·', w / 2, 100);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 5.1, -0.55);
  facade.add(sign);
  const signGlow = new THREE.PointLight(0xffbe66, 14, 11, 2);
  signGlow.position.set(0, 4.6, -1.2);
  facade.add(signGlow);

  // Bulb over the door — the one thing visible from down the block
  const doorBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe3ae }));
  doorBulb.position.set(0, 2.75, -0.62);
  facade.add(doorBulb);
  const doorLamp = new THREE.PointLight(0xffc98a, 10, 12, 2);
  doorLamp.position.set(0, 2.7, -0.9);
  facade.add(doorLamp);

  // Streetlamps
  for (const lx of [-13, 6]) {
    const pole = new THREE.Group();
    pole.add(cyl(0.09, 0.11, 5.6, lam(0x24242c), 0, 2.8, 0));
    pole.add(box(1.4, 0.12, 0.2, lam(0x24242c), 0.6, 5.6, 0));
    const head = new THREE.Mesh(boxGeo(0.5, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    head.position.set(1.2, 5.45, 0);
    pole.add(head);
    const lp = new THREE.PointLight(0xffdda0, 34, 20, 2);
    lp.position.set(1.2, 5.3, 0);
    pole.add(lp);
    pole.position.set(lx, 0, -4.2);
    street.add(pole);
    block(lx, -4.2, 0.5, 0.5);
  }

  // ---------- Cars ----------
  function makeCar(bodyColor) {
    const g = new THREE.Group();
    const body = box(4.6, 0.95, 1.95, lam(bodyColor), 0, 0.75, 0);
    g.add(body);
    g.add(box(2.5, 0.8, 1.8, lam(bodyColor), -0.15, 1.5, 0));
    g.add(box(2.2, 0.55, 1.86, phong(0x0d1220, { shininess: 90, specular: 0x99aacc }), -0.15, 1.55, 0));
    g.add(box(4.7, 0.18, 2.0, lam(0x1b1b20), 0, 0.42, 0));
    for (const [wx, wz] of [[1.5, 0.98], [1.5, -0.98], [-1.5, 0.98], [-1.5, -0.98]]) {
      const wheel = cyl(0.42, 0.42, 0.28, lam(0x121216), wx, 0.42, wz, 10);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
    const hl = new THREE.Mesh(boxGeo(0.12, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
    hl.position.set(2.32, 0.85, 0.6);
    g.add(hl);
    const hr = hl.clone(); hr.position.z = -0.6; g.add(hr);
    const tl = new THREE.Mesh(boxGeo(0.1, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
    tl.position.set(-2.32, 0.9, 0.62);
    g.add(tl);
    const tr = tl.clone(); tr.position.z = -0.62; g.add(tr);
    return g;
  }

  const parkedCar = makeCar(0x2e2a33);
  parkedCar.position.set(-15.6, 0, -3.4);
  street.add(parkedCar);
  block(-15.6, -3.4, 4.8, 2.1);

  const getawayCar = makeCar(0x1c1a22);
  getawayCar.position.copy(POS.getawayCar);
  getawayCar.rotation.y = Math.PI;
  street.add(getawayCar);
  block(POS.getawayCar.x, POS.getawayCar.z, 4.8, 2.1);
  const carGlow = new THREE.PointLight(0xff5a3a, 0.0, 7, 2);
  carGlow.position.set(POS.getawayCar.x + 2.3, 0.9, POS.getawayCar.z);
  street.add(carGlow);

  // Traffic that keeps moving through the whole scene
  const traffic = [];
  for (let i = 0; i < 4; i++) {
    const c = makeCar([0x3a2030, 0x1f3040, 0x40391f, 0x2b2b34][i]);
    const dir = i % 2 ? -1 : 1;
    c.rotation.y = dir > 0 ? 0 : Math.PI;
    c.position.set(-40 + i * 24, 0, dir > 0 ? -8.6 : -12.4);
    street.add(c);
    traffic.push({ mesh: c, dir, speed: 9 + i * 2.5 });
  }

  // ================= RESTAURANT SHELL =================

  const D = ROOM.dining;
  const wallMat = lam(0x4a2f22, { map: T.wallpaper });
  const wainscot = lam(0x2e1d14);
  const floorMat = lam(0x2a1c12, { map: T.woodFloor });
  const ceilMat = lam(0x181017);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(D.x1 - D.x0, D.z1 - D.z0), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, (D.z0 + D.z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(D.x1 - D.x0, D.z1 - D.z0), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, D.h, (D.z0 + D.z1) / 2);
  scene.add(ceil);

  // Interior walls. Wainscot band along the bottom, wallpaper above.
  function innerWall(cx, cz, w, d, h = D.h) {
    const upper = box(w, h - 1.0, d, wallMat, cx, 1.0 + (h - 1.0) / 2, cz);
    const lower = box(w, 1.0, d, wainscot, cx, 0.5, cz);
    scene.add(upper, lower);
    block(cx, cz, w, d);
    return upper;
  }

  // Side + back walls
  innerWall(D.x0 - 0.1, 5.5, 0.2, 11);
  innerWall(D.x1 + 0.1, 5.5, 0.2, 11);
  innerWall(-6.1, 11.1, 1.8, 0.2);       // back wall, left of the kitchen door
  innerWall(-0.05, 11.1, 7.7, 0.2);      // back wall, between kitchen and hallway
  innerWall(6.6, 11.1, 0.8, 0.2);        // back wall, right of the hallway

  // Front wall with two windows and a doorway at x ∈ [-0.7, 0.7]
  const frontSegs = [[-3.85, 6.3], [3.85, 6.3]]; // centre x, width
  for (const [cx, w] of frontSegs) {
    scene.add(box(w, 1.0, 0.2, wainscot, cx, 0.5, -0.1));                 // below glass
    scene.add(box(w, D.h - 2.4, 0.2, wallMat, cx, 2.4 + (D.h - 2.4) / 2, -0.1)); // above glass
    block(cx, -0.1, w, 0.2);
  }
  // Window glass + mullions
  const glassMat = phong(0x8fb4d8, { transparent: true, opacity: 0.14, shininess: 100, specular: 0xffffff });
  for (const cx of [-3.85, 3.85]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.4), glassMat);
    g.position.set(cx, 1.7, -0.1);
    scene.add(g);
    for (let i = -1; i <= 1; i++) scene.add(box(0.08, 1.4, 0.14, lam(0x1e1410), cx + i * 2.0, 1.7, -0.1));
    scene.add(box(6.2, 0.12, 0.16, lam(0x1e1410), cx, 1.0, -0.1));
    scene.add(box(6.2, 0.12, 0.16, lam(0x1e1410), cx, 2.4, -0.1));
  }

  // ---------- Front door ----------
  const frontDoor = new THREE.Group();
  const doorLeaf = box(1.35, 2.35, 0.1, lam(0x3a2416), 0.675, 1.18, 0);
  frontDoor.add(doorLeaf);
  frontDoor.add(box(0.9, 1.0, 0.06, phong(0x9fbcd8, { transparent: true, opacity: 0.2, shininess: 90 }), 0.675, 1.62, 0.03));
  frontDoor.add(cyl(0.05, 0.05, 0.28, lam(0xc8a45a), 1.22, 1.1, 0.09));
  frontDoor.position.set(-0.7, 0, -0.05);
  scene.add(frontDoor);
  const frontDoorBlock = block(0, -0.05, 1.5, 0.14, 'frontDoor');

  // A "NO SHOES, NO SHIRT, NO SQUATCH" placard beside the door
  // Taped up inside the window by the door, facing the room. Double-sided so
  // it also reads (backwards, as these always do) from the street.
  const placard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.37),
    new THREE.MeshLambertMaterial({ map: T.noSquatch, side: THREE.DoubleSide, transparent: true })
  );
  placard.position.set(2.3, 2.05, 0.05);
  scene.add(placard);

  // ---------- Furniture ----------
  const clothMat = lam(0xe8e4d8);
  const chairMat = lam(0x8e1f24);
  const chairFrame = lam(0x2a1a12);

  function makeChair(x, z, facing) {
    const g = new THREE.Group();
    g.add(box(0.52, 0.09, 0.52, chairMat, 0, 0.45, 0));
    g.add(box(0.52, 0.62, 0.1, chairMat, 0, 0.78, -0.22));
    for (const [lx, lz] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
      g.add(box(0.06, 0.45, 0.06, chairFrame, lx, 0.22, lz));
    }
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    scene.add(g);
    return g;
  }

  function makeTable(x, z, r = 0.85, withSetting = true) {
    const g = new THREE.Group();
    const top = cyl(r, r, 0.08, clothMat, 0, 0.74, 0, 18);
    g.add(top);
    // Tablecloth skirt
    const skirt = cyl(r, r * 0.9, 0.72, clothMat, 0, 0.38, 0, 18);
    g.add(skirt);
    g.position.set(x, 0, z);
    scene.add(g);
    block(x, z, r * 1.9, r * 1.9);
    if (withSetting) makeCandle(x, z);
    return g;
  }

  function makeCandle(x, z, parent = scene) {
    const g = new THREE.Group();
    g.add(cyl(0.05, 0.06, 0.16, lam(0xd8cdb0), 0, 0.86, 0, 8));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    flame.position.set(0, 1.0, 0);
    g.add(flame);
    const light = new THREE.PointLight(0xffb066, 2.4, 3.6, 2);
    light.position.set(0, 1.02, 0);
    g.add(light);
    g.position.set(x, 0, z);
    parent.add(g);
    candles.push({ flame, light, phase: Math.random() * 10 });
    return { group: g, flame, light };
  }

  function makeWineGlass(x, y, z, parent = scene) {
    const g = new THREE.Group();
    const glass = phong(0xd8e4f0, { transparent: true, opacity: 0.32, shininess: 110, specular: 0xffffff });
    g.add(cyl(0.055, 0.03, 0.13, glass, 0, 0.09, 0, 10));
    g.add(cyl(0.012, 0.012, 0.07, glass, 0, 0.015, 0, 6));
    g.add(cyl(0.05, 0.05, 0.01, glass, 0, -0.02, 0, 10));
    const wine = cyl(0.045, 0.028, 0.07, lam(0x5a0f22, { transparent: true, opacity: 0.9 }), 0, 0.06, 0, 10);
    g.add(wine);
    g.position.set(x, y, z);
    parent.add(g);
    glassware.push({ mesh: g, base: g.position.clone(), phase: Math.random() * 10 });
    return g;
  }

  function makeBottle(x, y, z, parent = scene) {
    const g = new THREE.Group();
    g.add(cyl(0.055, 0.065, 0.28, lam(0x14301c), 0, 0.14, 0, 10));
    g.add(cyl(0.022, 0.03, 0.16, lam(0x14301c), 0, 0.34, 0, 8));
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.14, 12, 1, true), new THREE.MeshLambertMaterial({ map: T.wineLabel }));
    label.position.set(0, 0.15, 0);
    g.add(label);
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  function makeBreadBasket(x, y, z) {
    const g = new THREE.Group();
    g.add(cyl(0.17, 0.13, 0.09, lam(0x7d5a2e), 0, 0.045, 0, 10));
    for (let i = 0; i < 3; i++) {
      const b = box(0.2, 0.07, 0.07, lam(0xd8ac68), (i - 1) * 0.06, 0.11, (i % 2) * 0.04);
      b.rotation.y = i * 0.5;
      g.add(b);
    }
    g.position.set(x, y, z);
    scene.add(g);
  }

  // The meeting table
  const table = makeTable(POS.tableCenter.x, POS.tableCenter.z, 0.95, false);
  // Everything on the cloth stays inside the 0.95 radius of the table top.
  makeCandle(POS.tableCenter.x - 0.02, POS.tableCenter.z + 0.05);
  makeBreadBasket(POS.tableCenter.x - 0.5, 0.78, POS.tableCenter.z - 0.1);
  makeBottle(POS.tableCenter.x - 0.42, 0.78, POS.tableCenter.z + 0.3);

  const prospectGlass = makeWineGlass(-0.38, 0.78, 4.55);
  const salGlass = makeWineGlass(0.38, 0.78, 5.5);
  const mcGlass = makeWineGlass(0.62, 0.78, 4.62);

  // Plates
  for (const [px, pz] of [[0, 4.4], [0, 5.6], [0.7, 5.0]]) {
    const plate = cyl(0.21, 0.19, 0.03, lam(0xf2efe6), px, 0.79, pz, 16);
    scene.add(plate);
  }

  const prospectChair = makeChair(POS.prospectSeat.x, POS.prospectSeat.z, 0);
  makeChair(POS.salSeat.x, POS.salSeat.z, Math.PI);
  makeChair(POS.mcSeat.x, POS.mcSeat.z, -Math.PI / 2);

  // The chair the player is told to take
  const chairHit = new THREE.Mesh(boxGeo(0.9, 1.5, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  chairHit.position.set(POS.prospectSeat.x, 0.75, POS.prospectSeat.z);
  chairHit.userData.interact = { id: 'chair', label: 'Sit down', hold: 0 };
  scene.add(chairHit);
  interactables.push(chairHit);

  // Background tables
  for (const [tx, tz, rot] of [[-4.7, 2.4, 0.3], [4.7, 2.2, -0.4], [-4.9, 7.2, 0.1], [-6.0, 4.6, 1.4]]) {
    makeTable(tx, tz, 0.7);
    // The occupant looks along local +Z = (sin θ, cos θ); these angles turn
    // each chair back toward its own table rather than out into the room.
    makeChair(tx + Math.cos(rot) * 1.1, tz + Math.sin(rot) * 1.1, -rot - Math.PI / 2);
    makeChair(tx - Math.cos(rot) * 1.1, tz - Math.sin(rot) * 1.1, -rot + Math.PI / 2);
  }

  // Counter / bar along the back left
  const counter = solid(4.6, 1.05, 0.7, lam(0x3d2415), -4.2, 0.52, 9.6);
  scene.add(box(4.7, 0.08, 0.85, lam(0x241610), -4.2, 1.08, 9.6));
  // Bottle shelf behind it
  scene.add(box(4.6, 0.08, 0.4, lam(0x241610), -4.2, 1.75, 10.55));
  for (let i = 0; i < 7; i++) makeBottle(-6.2 + i * 0.62, 1.79, 10.55);

  // ---------- Kitchen swinging door ----------
  const kitchenDoor = new THREE.Group();
  kitchenDoor.add(box(1.3, 2.2, 0.09, lam(0x4a3320), -0.65, 1.1, 0));
  kitchenDoor.add(box(0.6, 0.5, 0.05, phong(0xaac0d0, { transparent: true, opacity: 0.25, shininess: 80 }), -0.65, 1.72, 0.03));
  kitchenDoor.position.set(-3.9, 0, 11.0);
  scene.add(kitchenDoor);
  block(-4.55, 11.0, 1.3, 0.14);

  // A slice of kitchen behind the swinging door — the cook has to be standing
  // in something when he comes to look, and the door does swing open.
  const KIT = { x0: -7, x1: -2.5, z0: 11.2, z1: 14.6, h: 2.8 };
  const kitTile = lam(0x8d9490);
  const kFloor = new THREE.Mesh(new THREE.PlaneGeometry(KIT.x1 - KIT.x0, KIT.z1 - KIT.z0), lam(0x4c5250));
  kFloor.rotation.x = -Math.PI / 2;
  kFloor.position.set((KIT.x0 + KIT.x1) / 2, 0.02, (KIT.z0 + KIT.z1) / 2);
  scene.add(kFloor);
  const kCeil = kFloor.clone();
  kCeil.rotation.x = Math.PI / 2;
  kCeil.position.y = KIT.h;
  scene.add(kCeil);
  scene.add(box(0.2, KIT.h, KIT.z1 - KIT.z0, kitTile, KIT.x0 - 0.1, KIT.h / 2, (KIT.z0 + KIT.z1) / 2));
  scene.add(box(0.2, KIT.h, KIT.z1 - KIT.z0, kitTile, KIT.x1 + 0.1, KIT.h / 2, (KIT.z0 + KIT.z1) / 2));
  scene.add(box(KIT.x1 - KIT.x0 + 0.4, KIT.h, 0.2, kitTile, (KIT.x0 + KIT.x1) / 2, KIT.h / 2, KIT.z1 + 0.1));
  scene.add(box(3.6, 0.9, 0.7, phong(0xb8bcc0, { shininess: 60, specular: 0xdddddd }), -4.7, 0.45, 13.9));
  for (let i = 0; i < 4; i++) scene.add(cyl(0.09, 0.09, 0.34, lam(0xc8ccd0), -6.0 + i * 0.9, 1.06, 13.9, 8));
  const kitchenLight = new THREE.PointLight(0xdfe8ee, 5, 8, 2);
  kitchenLight.position.set(-4.7, 2.5, 12.8);
  scene.add(kitchenLight);

  // Purple + silver scarf hung by the kitchen
  const scarfTex = canvasTex(64, 256, (c, w, h) => {
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? '#7b4fd9' : '#cfd4e0';
      c.fillRect(0, i * 16, w, 16);
    }
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(0, 0, 6, h);
  });
  const scarf = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.5), new THREE.MeshLambertMaterial({ map: scarfTex, side: THREE.DoubleSide }));
  scarf.position.set(-6.92, 1.9, 10.3);
  scarf.rotation.y = Math.PI / 2;
  scene.add(scarf);
  scene.add(box(0.12, 0.06, 0.06, lam(0x8a7a5a), -6.94, 2.66, 10.3));

  // ---------- Wall dressing ----------
  function framed(tex, w, h, x, y, z, ry) {
    const g = new THREE.Group();
    g.add(box(w + 0.09, h + 0.09, 0.05, lam(0x2a1c10), 0, 0, -0.02));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    art.position.z = 0.012;
    g.add(art);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    scene.add(g);
    return { group: g, art };
  }

  framed(T.clipping, 1.0, 0.62, -6.96, 2.0, 3.4, Math.PI / 2);   // Sasquatches clipping
  // The supplied coastal Squatch print is the dining room's hero piece: a
  // large landscape frame, clear of the smaller newspaper clippings.
  const coastPicture = framed(T.specials, 3.8, 2.15, -6.96, 1.72, 8.35, Math.PI / 2);
  coastPicture.art.userData.art = { slot: 'squatchfather.dining.coast', real: false };
  // These replace the old repeated filler portraits with the supplied Family
  // gallery. Two rows keep all eleven readable without crowding the dining
  // room's hero print on the opposite wall.
  const familyPortraits = [
    ['squatchfather.portrait.uncle_lou', 'bing-hallway-uncle-lou.png', 2.32, 1.8],
    ['squatchfather.portrait.rippinflow', 'bing-hallway-rippinflow.png', 2.32, 3.2],
    ['squatchfather.portrait.booskibro', 'bing-hallway-booskibro.png', 2.32, 4.6],
    ['squatchfather.portrait.shubenator', 'bing-hallway-shubenator.png', 2.32, 6.0],
    ['squatchfather.portrait.sauce', 'family-portrait-sauce.png', 2.32, 7.4],
    ['squatchfather.portrait.lag', 'family-portrait-lag.png', 2.32, 8.8],
    ['squatchfather.portrait.hogmama', 'family-portrait-hogmama.png', 1.25, 2.45],
    ['squatchfather.portrait.ape', 'family-portrait-ape.png', 1.25, 3.85],
    ['squatchfather.portrait.eric', 'family-portrait-eric.png', 1.25, 5.25],
    ['squatchfather.portrait.irish', 'family-portrait-irish.png', 1.25, 6.65],
    ['squatchfather.portrait.seff', 'family-portrait-seff.png', 1.25, 8.05],
  ].map(([slot, file, y, z]) => {
    const portrait = framed(T.portrait, 0.46, 0.62, 6.96, y, z, -Math.PI / 2);
    portrait.art.userData.art = { slot, real: false };
    return { slot, file, width: 0.46, ...portrait };
  });

  // ================= HALLWAY =================

  const H = ROOM.hall;
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), floorMat);
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set((H.x0 + H.x1) / 2, 0.02, (H.z0 + H.z1) / 2);
  hallFloor.receiveShadow = true;
  scene.add(hallFloor);
  const hallCeil = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), ceilMat);
  hallCeil.rotation.x = Math.PI / 2;
  hallCeil.position.set((H.x0 + H.x1) / 2, H.h, (H.z0 + H.z1) / 2);
  scene.add(hallCeil);

  innerWall(H.x0 - 0.1, 13, 0.2, 4, H.h);
  innerWall(H.x1 + 0.1, 13, 0.2, 4, H.h);
  // Wall stubs either side of the bathroom door (doorway is x 4.3 → 5.6)
  innerWall(3.15, 15.1, 2.3, 0.2, H.h);
  innerWall(6.0, 15.1, 0.8, 0.2, H.h);

  const hallLampGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const hallLamp = new THREE.Mesh(hallLampGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  hallLamp.position.set(5, 2.4, 13);
  scene.add(hallLamp);
  scene.add(cyl(0.012, 0.012, 0.2, lam(0x1a1a1a), 5, 2.52, 13, 4));

  // ================= BATHROOM =================

  const B = ROOM.bath;
  const tileMat = lam(0x5d7a63, { map: T.tile });
  const bathFloorMat = lam(0x47554a, { map: T.tile });

  const bFloor = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), bathFloorMat);
  bFloor.rotation.x = -Math.PI / 2;
  bFloor.position.set((B.x0 + B.x1) / 2, 0.02, (B.z0 + B.z1) / 2);
  bFloor.receiveShadow = true;
  scene.add(bFloor);
  const bCeil = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), lam(0x3d4a40));
  bCeil.rotation.x = Math.PI / 2;
  bCeil.position.set((B.x0 + B.x1) / 2, B.h, (B.z0 + B.z1) / 2);
  scene.add(bCeil);

  function tileWall(cx, cz, w, d) {
    const m = box(w, B.h, d, tileMat, cx, B.h / 2, cz);
    scene.add(m);
    block(cx, cz, w, d);
    return m;
  }
  tileWall(B.x0 - 0.1, 17.1, 0.2, 4.2);
  tileWall(B.x1 + 0.1, 17.1, 0.2, 4.2);
  /* A window is an opening in the tile, not a sheet of blue glass pasted on
   * top of it. Keep the collision continuous but build the visible north wall
   * around the opening, then sink glass and its frame into that reveal. */
  const bathBackZ = B.z1 + 0.1;
  const tilePiece = (name, w, h, x, y) => {
    const piece = box(w, h, 0.2, tileMat, x, y, bathBackZ);
    piece.name = name;
    scene.add(piece);
    return piece;
  };
  tilePiece('bathroom.window.leftTile', 0.72, B.h, 2.36, B.h / 2);
  tilePiece('bathroom.window.rightTile', 2.68, B.h, 5.06, B.h / 2);
  tilePiece('bathroom.window.lowerTile', 1.0, 2.02, 3.2, 1.01);
  tilePiece('bathroom.window.headerTile', 1.0, 0.16, 3.2, 2.62);
  block((B.x0 + B.x1) / 2, B.z1 + 0.1, B.x1 - B.x0 + 0.4, 0.2);

  // Bathroom door — hinged at x=4.3, standing open until he walks through it
  const bathDoor = new THREE.Group();
  bathDoor.add(box(1.3, 2.3, 0.09, lam(0x3f2b1a), 0.65, 1.15, 0));
  bathDoor.add(box(0.12, 0.12, 0.06, lam(0xb8a06a), 1.18, 1.1, 0.07));
  bathDoor.position.set(4.3, 0, 15.05);
  // Open, but shy of sweeping the leaf through its own jamb at x=3.15.
  bathDoor.rotation.y = -1.72;
  scene.add(bathDoor);
  const bathDoorBlock = block(4.95, 15.05, 1.3, 0.14, 'bathDoor');
  bathDoorBlock.on = false;

  // Small window near the ceiling
  const bwin = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), phong(0x2a3a48, {
    transparent: true, opacity: 0.5, shininess: 80, specular: 0xaaccee,
  }));
  bwin.name = 'bathroom.window.glass';
  bwin.position.set(3.2, 2.35, B.z1 - 0.012);
  bwin.rotation.y = Math.PI;
  scene.add(bwin);
  scene.add(box(1.0, 0.06, 0.08, lam(0x2c3830), 3.2, 2.62, B.z1 - 0.035));
  scene.add(box(1.0, 0.06, 0.08, lam(0x2c3830), 3.2, 2.08, B.z1 - 0.035));
  const moonSpill = new THREE.PointLight(0x6f88b8, 5, 5.5, 2);
  moonSpill.position.set(3.2, 2.1, B.z1 - 0.5);
  scene.add(moonSpill);

  // ---------- The toilet ----------
  const porcelain = phong(0xd8d8d0, { shininess: 40, specular: 0x9aa0a8 });
  const toilet = new THREE.Group();
  toilet.add(cyl(0.28, 0.22, 0.42, porcelain, 0, 0.21, 0, 14));          // bowl base
  const bowl = cyl(0.3, 0.26, 0.14, porcelain, 0, 0.47, 0.02, 16);
  toilet.add(bowl);
  toilet.add(box(0.56, 0.06, 0.44, porcelain, 0, 0.55, 0.02));           // seat
  toilet.add(box(0.56, 0.62, 0.24, porcelain, 0, 0.86, 0.42));           // tank
  toilet.add(box(0.6, 0.06, 0.3, porcelain, 0, 1.2, 0.42));              // tank lid
  toilet.add(box(0.09, 0.05, 0.05, lam(0xa8a49a), 0.22, 1.06, 0.3));     // handle
  // Tank against the back wall, bowl facing into the room
  toilet.position.copy(POS.toilet);
  scene.add(toilet);
  block(POS.toilet.x, POS.toilet.z, 0.7, 1.1);

  // Exposed pipes
  const pipeMat = phong(0x8d8a80, { shininess: 60, specular: 0xbbbbb0 });
  scene.add(cyl(0.045, 0.045, 2.6, pipeMat, 6.3, 1.3, 19.05, 8));
  const runPipe = cyl(0.045, 0.045, 2.2, pipeMat, 5.2, 2.45, 19.05, 8);
  runPipe.rotation.z = Math.PI / 2;
  scene.add(runPipe);
  scene.add(cyl(0.045, 0.045, 0.95, pipeMat, 4.12, 1.99, 19.05, 8)); // elbow down
  const toiletPipe = cyl(0.035, 0.035, 0.5, pipeMat, POS.toilet.x + 0.4, 0.5, 19.05, 8);
  scene.add(toiletPipe);

  // The interaction volume: the narrow gap behind the upper rear of the tank.
  const searchHit = new THREE.Mesh(boxGeo(0.75, 0.5, 0.26), new THREE.MeshBasicMaterial({ visible: false }));
  searchHit.position.copy(POS.toiletSearch);
  searchHit.userData.interact = { id: 'toilet', label: 'Search behind toilet', hold: 2.6 };
  scene.add(searchHit);
  interactables.push(searchHit);

  // The wrapped package itself — hidden until it comes out.
  const wrapped = new THREE.Group();
  wrapped.add(box(0.26, 0.12, 0.11, lam(0x6d6558), 0, 0, 0));
  wrapped.add(box(0.28, 0.04, 0.13, lam(0x585044), 0, 0.02, 0));
  wrapped.position.set(POS.toilet.x, 1.02, 19.13);
  wrapped.visible = false;
  scene.add(wrapped);

  // ---------- Sink + cracked mirror ----------
  const sink = new THREE.Group();
  sink.add(box(0.62, 0.16, 0.48, porcelain, 0, 0.9, 0));
  sink.add(cyl(0.13, 0.1, 0.34, porcelain, 0, 0.68, 0, 10));
  sink.add(cyl(0.02, 0.02, 0.14, pipeMat, -0.18, 1.04, 0, 6));
  const spout = cyl(0.018, 0.018, 0.14, pipeMat, -0.12, 1.1, 0, 6);
  spout.rotation.z = Math.PI / 2;
  sink.add(spout);
  sink.position.set(B.x0 + 0.32, 0, 16.9);
  scene.add(sink);
  block(B.x0 + 0.32, 16.9, 0.6, 0.6);

  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.05), new THREE.MeshLambertMaterial({ map: T.mirror }));
  mirror.position.set(B.x0 + 0.06, 1.62, 16.9);
  mirror.rotation.y = Math.PI / 2;
  scene.add(mirror);
  scene.add(box(0.05, 1.14, 0.94, lam(0x4a4438), B.x0 + 0.02, 1.62, 16.9));

  // Strip light over the glass — without it he is a black cut-out in his own
  // reflection, and that beat only works if he can see his face.
  const vanityTube = new THREE.Mesh(boxGeo(0.08, 0.07, 0.8), new THREE.MeshBasicMaterial({ color: 0xe6f2ea }));
  vanityTube.position.set(B.x0 + 0.16, 2.28, 16.9);
  scene.add(vanityTube);
  const vanityLight = new THREE.PointLight(0xdfeee6, 6, 4.5, 2);
  vanityLight.position.set(B.x0 + 0.45, 2.18, 16.9);
  scene.add(vanityLight);

  // Wrong places to search — the scene supports looking in them.
  function decoy(id, label, x, y, z, w, h, d) {
    const hit = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, y, z);
    hit.userData.interact = { id, label, hold: 1.1, decoy: true };
    scene.add(hit);
    interactables.push(hit);
    return hit;
  }

  // Cabinet under the sink
  const cabinet = box(0.5, 0.7, 0.5, lam(0x3f4a40), B.x0 + 0.34, 0.35, 15.9);
  scene.add(cabinet);
  block(B.x0 + 0.34, 15.9, 0.5, 0.5);
  decoy('cabinet', 'Search the cabinet', B.x0 + 0.4, 0.4, 15.9, 0.6, 0.8, 0.6);
  decoy('sink', 'Search under the sink', B.x0 + 0.4, 0.62, 16.9, 0.7, 0.5, 0.6);

  // Radiator
  const radiator = new THREE.Group();
  for (let i = 0; i < 7; i++) radiator.add(cyl(0.05, 0.05, 0.62, lam(0x9a9288), -0.2 + i * 0.07, 0.34, 0, 6));
  radiator.add(box(0.56, 0.08, 0.12, lam(0x9a9288), 0, 0.66, 0));
  radiator.position.set(3.0, 0, B.z1 - 0.14);
  scene.add(radiator);
  block(3.0, B.z1 - 0.14, 0.6, 0.3);
  decoy('radiator', 'Search behind the radiator', 3.0, 0.5, B.z1 - 0.34, 0.7, 0.8, 0.42);

  // Flickering ceiling light
  const bathLampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: 0xdff0e0 }));
  bathLampMesh.position.set(4.3, B.h - 0.08, 17.3);
  scene.add(bathLampMesh);
  const bathLight = new THREE.PointLight(0xcfe6d2, 15, 9, 2);
  bathLight.position.set(4.3, B.h - 0.25, 17.3);
  scene.add(bathLight);

  // ================= LIGHTING =================

  const ambient = new THREE.AmbientLight(0x39344a, 1.5);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x8ea6d8, 0.7);
  moon.position.set(-14, 24, -20);
  scene.add(moon);

  const entryLight = new THREE.PointLight(0xffb066, 13, 10, 2);
  entryLight.position.set(0, 2.8, 1.6);
  scene.add(entryLight);

  const counterLight = new THREE.PointLight(0xffb066, 12, 10, 2);
  counterLight.position.set(-4.2, 2.7, 9.0);
  scene.add(counterLight);

  const roomLight = new THREE.PointLight(0xffa860, 16, 16, 2);
  roomLight.position.set(0, 2.9, 6.5);
  scene.add(roomLight);

  const tableSpot = new THREE.SpotLight(0xffc890, 34, 12, 0.9, 0.6, 1.6);
  tableSpot.position.set(0, 3.05, 5);
  tableSpot.target.position.set(0, 0.8, 5);
  tableSpot.castShadow = true;
  tableSpot.shadow.mapSize.set(1024, 1024);
  tableSpot.shadow.camera.near = 0.5;
  tableSpot.shadow.camera.far = 12;
  scene.add(tableSpot, tableSpot.target);

  const hallLight = new THREE.PointLight(0xffc07a, 9, 8, 2);
  hallLight.position.set(5, 2.35, 13);
  scene.add(hallLight);

  // Wall sconces so the sides of the room aren't a void
  for (const [sx, sz, ry] of [[-6.86, 2.0, 1], [-6.86, 6.6, 1], [6.86, 4.0, -1], [6.86, 8.0, -1]]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 8, 1, true), lam(0xd8b070, { side: THREE.DoubleSide }));
    shade.position.set(sx, 2.25, sz);
    shade.rotation.z = ry * 0.35;
    scene.add(shade);
    const sl = new THREE.PointLight(0xffa860, 6, 7, 2);
    sl.position.set(sx + ry * 0.3, 2.2, sz);
    scene.add(sl);
  }

  // Warm spill through the front windows onto the wet sidewalk
  for (const wx of [-3.85, 3.85]) {
    const spill = new THREE.PointLight(0xffb066, 11, 10, 2);
    spill.position.set(wx, 1.9, -1.1);
    scene.add(spill);
  }

  // Layer 1 holds Prospect's body, which only the mirror camera renders — the
  // lights around the bathroom have to reach it or he shows up as a cut-out.
  for (const l of [ambient, moon, bathLight, moonSpill, hallLight, vanityLight]) l.layers.enable(1);

  // Hanging lamps over the background tables
  for (const [lx, lz] of [[-4.7, 2.4], [4.7, 2.2], [-4.9, 7.2]]) {
    scene.add(cyl(0.01, 0.01, 0.9, lam(0x1a1a1a), lx, 2.75, lz, 4));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 10, 1, true), lam(0x8e1f24, { side: THREE.DoubleSide }));
    shade.position.set(lx, 2.2, lz);
    scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    bulb.position.set(lx, 2.08, lz);
    scene.add(bulb);
    const pl = new THREE.PointLight(0xffb066, 7, 6.5, 2);
    pl.position.set(lx, 2.0, lz);
    scene.add(pl);
  }

  // ================= BACKGROUND STAFF & DINERS =================
  // Simple figures that hold still, then react after the shots.

  // The cook keeps the scene's quick slab body, but his head comes from the
  // characters' own face kit — brows, eyes, nose, lips — so he is not a
  // blank block peering through the porthole.
  function makeBystander(x, z, facing, coat, skin, face = {}) {
    const g = new THREE.Group();
    g.add(box(0.5, 0.75, 0.3, lam(coat), 0, 1.15, 0));
    const head = buildHead({ skin, bulk: 0.95, ...face });
    head.group.position.set(0, 1.5, 0);
    g.add(head.group);
    g.add(box(0.13, 0.6, 0.16, lam(coat), -0.31, 1.15, 0));
    g.add(box(0.13, 0.6, 0.16, lam(coat), 0.31, 1.15, 0));
    g.add(box(0.2, 0.78, 0.2, lam(0x22242c), -0.13, 0.39, 0));
    g.add(box(0.2, 0.78, 0.2, lam(0x22242c), 0.13, 0.39, 0));
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    scene.add(g);
    return g;
  }

  // The waiter and the diners are full Figures — they need the rig so they
  // can serve the room, and later actually cower instead of clipping into
  // their chairs.
  function makeFigure(x, z, facing, opts, pose = 'stand') {
    const f = new Figure({ height: 0.96, ...opts });
    f.setPose(pose);
    f.place(x, z, facing);
    scene.add(f.group);
    return f;
  }

  // Clear of the bar counter's collider and its overhanging lip.
  const waiterFig = makeFigure(-3.2, 8.5, Math.PI, {
    coat: 0xe8e4dc, shirt: 0xdcd6c8, tie: 0x2a2a30, skin: 0xc79c72,
    bulk: 0.95, hair: 0x241c14, hairStyle: 'short', browTilt: 0.08, iris: 0x3a2a18,
  });
  const cook = makeBystander(-5.2, 11.6, Math.PI, 0xdcd8d0, 0xb98a63,
    { hair: 0x3a3230, hairStyle: 'crop', browHeavy: true, browTilt: 0.03, iris: 0x2a3a2a });
  cook.visible = true;
  // Each diner SITS at his table, on the chair that keeps his face toward
  // the room — the man at the left table used to stand behind the far chair
  // and greet every arrival with his coat-back.
  const diner1Fig = makeFigure(-5.75, 2.07, -0.3 + Math.PI / 2, {
    coat: 0x3a3b48, shirt: 0xd8d0c0, tie: 0x4a2a2a, skin: 0xd0a87e,
    bulk: 0.95, hair: 0x4a3826, hairStyle: 'short', browTilt: 0.1, iris: 0x2a3a4a,
  }, 'sit');
  const diner2Fig = makeFigure(5.71, 1.77, 0.4 - Math.PI / 2, {
    coat: 0x4a3a3a, shirt: 0xd0c8b8, tie: 0x2a3040, skin: 0xc09069,
    bulk: 0.95, hair: 0x2c241c, hairStyle: 'crop', lidHeavy: true, browTilt: 0.05, iris: 0x3a2a18,
  }, 'sit');
  const waiter = waiterFig.group;
  const diner1 = diner1Fig.group;
  const diner2 = diner2Fig.group;

  // ================= EXIT + CAR INTERACTION =================

  // Kept entirely on the car's side of where the player can stand, or the ray
  // would start inside the box and never hit its front face.
  const carHit = new THREE.Mesh(boxGeo(2.4, 1.6, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  carHit.position.set(POS.getawayCar.x, 1.0, POS.getawayCar.z + 0.5);
  carHit.userData.interact = { id: 'car', label: 'Get in the car', hold: 0 };
  scene.add(carHit);
  interactables.push(carHit);

  // Keep the player on the sidewalk instead of wandering into traffic.
  block(-4, -5.0, 90, 0.6);
  block(-24, -2.3, 0.6, 5);
  block(13, -2.3, 0.6, 5);

  // ================= LIVE STATE =================

  const state = {
    scene,
    renderer,
    colliders,
    interactables,
    glassware,
    candles,
    train,
    traffic,
    doors: { frontDoor, kitchenDoor, bathDoor, frontDoorBlock, bathDoorBlock },
    lights: {
      ambient, moon, bathLight, bathLampMesh, tableSpot, hallLight,
      roomLight, entryLight, counterLight, carGlow, signGlow,
    },
    props: {
      table, chairHit, searchHit, wrapped, mirror, prospectChair,
      prospectGlass, salGlass, mcGlass, toilet, getawayCar, parkedCar,
      coastPicture: coastPicture.group, coastPictureArt: coastPicture.art,
      familyPortraits: familyPortraits.map((portrait) => portrait.group),
      familyPortraitArt: familyPortraits.map((portrait) => portrait.art),
    },
    bystanders: { waiter, cook, diner1, diner2 },
    figures: { waiter: waiterFig, diner1: diner1Fig, diner2: diner2Fig },
    flicker: 0,
    t: 0,
  };

  // The scene builds synchronously; the supplied print lands after its image
  // request resolves. The canvas texture remains as a fallback if it fails.
  const suppliedArt = [
    { slot: 'squatchfather.dining.coast', file: 'squatchfather-coast-squatch.png', width: 3.8, ...coastPicture },
    ...familyPortraits.map((portrait) => ({
      slot: portrait.slot,
      ...portrait,
    })),
  ];
  state.artReady = resolveGear(SQUATCHFATHER_ART_SLOTS).then((gear) => {
    const dressed = [];
    for (const entry of suppliedArt) {
      const supplied = gear.get(entry.slot);
      if (!supplied?.real) continue;
      entry.art.geometry.dispose();
      entry.art.geometry = new THREE.PlaneGeometry(entry.width, entry.width / supplied.aspect);
      entry.art.material.dispose();
      entry.art.material = new THREE.MeshLambertMaterial({ map: supplied.texture });
      entry.art.userData.art = { slot: entry.slot, real: true, file: entry.file };
      dressed.push(entry.slot);
    }
    return dressed;
  }).catch(() => []);

  // Ambient motion: candle flicker, bathroom light stutter, traffic loop,
  // and the rigged bystanders breathing.
  state.update = (dt) => {
    state.t += dt;
    for (const f of Object.values(state.figures)) f.update(dt);
    for (const c of candles) {
      const f = 0.82 + Math.sin(state.t * 9 + c.phase) * 0.1 + Math.sin(state.t * 23 + c.phase * 2) * 0.06;
      c.light.intensity = 2.4 * f;
      c.flame.scale.set(0.85 + f * 0.2, 0.8 + f * 0.35, 0.85 + f * 0.2);
    }
    // Bad ballast in the bathroom
    state.flicker -= dt;
    if (state.flicker <= 0) {
      state.flicker = 0.15 + Math.random() * 2.4;
      const dim = Math.random() < 0.35;
      bathLight.intensity = dim ? 4 + Math.random() * 3 : 14 + Math.random() * 2.5;
      bathLampMesh.material.color.setHex(dim ? 0x8fa892 : 0xdff0e0);
    }
    for (const c of traffic) {
      c.mesh.position.x += c.dir * c.speed * dt;
      if (c.dir > 0 && c.mesh.position.x > 46) c.mesh.position.x = -46;
      if (c.dir < 0 && c.mesh.position.x < -46) c.mesh.position.x = 46;
    }
  };

  return state;
}

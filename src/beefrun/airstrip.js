/**
 * El Hueso.
 *
 * A dirt shelf cut into the side of a valley, uphill to the south, with a
 * cliff off the north end and a mountain wall behind. The terrain does the
 * work — see `elHuesoShape` in terrain.js — and this file puts the huts, the
 * drums, the trucks and the chickens on top of it.
 *
 * Everything is placed by asking the heightfield where the ground is, so the
 * strip's slope is never written down twice.
 */
import * as THREE from 'three';
import {
  solid, unlit, mat, boxGeo, cylGeo, coneGeo, planeGeo,
  mesh, flatMesh, group, signTexture, rng, clamp, damp,
} from './util.js';
import { EH } from './config.js';
import { terrainHeight } from './terrain.js';
import { makeChicken, updateChicken, makeGuard, makeCecilio } from './npc.js';

/** Rutted dirt with tyre tracks down the middle. */
function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a5c3a';
  ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = ['#6d5132', '#8a6a44', '#5f4629', '#94764e'][i % 4];
    ctx.globalAlpha = 0.3 + Math.random() * 0.45;
    ctx.fillRect(Math.random() * 256, Math.random() * 1024, 12 + Math.random() * 80, 6 + Math.random() * 40);
  }
  // Two wheel tracks, packed harder and darker.
  ctx.globalAlpha = 0.5;
  for (const x of [86, 154]) {
    ctx.fillStyle = '#5a4128';
    ctx.fillRect(x, 0, 18, 1024);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHut(seed) {
  const rand = rng(seed);
  const g = group('hut');
  const plank = solid(0x7a6244, { roughness: 1 });
  const tin = solid(0x8a8578, { roughness: 0.7, metalness: 0.4 });
  const w = 4 + rand() * 2, d = 3.4 + rand() * 1.6, h = 2.5;
  g.add(mesh(boxGeo(w, h, d), plank, 0, h / 2, 0));
  const roof = mesh(boxGeo(w + 0.8, 0.14, d + 0.8), tin, 0, h + 0.2, 0);
  roof.rotation.x = 0.12;
  g.add(roof);
  g.add(mesh(boxGeo(1.0, 1.9, 0.1), solid(0x4a3a26, { roughness: 1 }), 0, 0.95, d / 2 + 0.05));
  // A patch of blue tarp over the corner that leaks.
  g.add(mesh(boxGeo(2.0, 0.06, 1.6), solid(0x2f6b8a, { roughness: 1 }), w / 4, h + 0.3, -d / 4));
  // The caller has to sit this on a slope, so it needs to know how wide it is.
  g.userData.halfX = w / 2;
  g.userData.halfZ = d / 2;
  return g;
}

/** The open-sided shelter the armed men sit under. */
function makeShelter() {
  const g = group('shelter');
  const post = solid(0x6b5432, { roughness: 1 });
  const tin = solid(0x9a9488, { roughness: 0.65, metalness: 0.45 });
  for (const sx of [-3.4, 3.4]) {
    for (const sz of [-2.4, 2.4]) {
      g.add(mesh(boxGeo(0.2, 2.6, 0.2), post, sx, 1.3, sz));
    }
  }
  const roof = mesh(boxGeo(8, 0.12, 6), tin, 0, 2.7, 0);
  roof.rotation.x = 0.1;
  g.add(roof);
  // A bench, a table, a radio.
  g.add(mesh(boxGeo(4, 0.14, 0.5), solid(0x8a6a42, { roughness: 1 }), -1, 0.5, -1.6));
  g.add(mesh(boxGeo(1.6, 0.12, 1.0), solid(0x8a6a42, { roughness: 1 }), 1.8, 0.8, 0.4));
  g.add(mesh(boxGeo(0.5, 0.3, 0.34), solid(0x3a3a3e, { roughness: 0.7 }), 1.8, 1.0, 0.4));
  return g;
}

function makeDrum(color = 0x3f6b46) {
  const g = group('drum');
  g.add(mesh(cylGeo(0.42, 0.42, 1.1, 12), solid(color, { roughness: 0.72, metalness: 0.35 }), 0, 0.55, 0));
  for (const y of [0.3, 0.8]) {
    g.add(mesh(cylGeo(0.45, 0.45, 0.06, 12), solid(color, { roughness: 0.8, metalness: 0.3 }), 0, y, 0));
  }
  return g;
}

function makeMilitaryTruck() {
  const g = group('mil-truck');
  const olive = solid(0x4a5236, { roughness: 0.9 });
  const canvasMat = solid(0x6b6247, { roughness: 1 });
  const tyre = solid(0x1c1c20, { roughness: 0.95 });
  g.add(mesh(boxGeo(2.3, 1.0, 6.4), olive, 0, 1.2, 0));
  g.add(mesh(boxGeo(2.2, 1.4, 2.0), olive, 0, 2.2, 2.0));
  g.add(mesh(boxGeo(2.0, 0.8, 0.1), mat({ color: 0xa8bcc4, roughness: 0.3, transparent: true, opacity: 0.5 }), 0, 2.5, 2.98));
  // Canvas tilt over the bed.
  const tilt = mesh(cylGeo(1.3, 1.3, 4.0, 8, false), canvasMat, 0, 2.3, -1.2);
  tilt.rotation.z = Math.PI / 2;
  tilt.rotation.y = Math.PI / 2;
  g.add(tilt);
  for (const sx of [-1.05, 1.05]) {
    for (const sz of [-2.0, 0.2, 2.2]) {
      const w = mesh(cylGeo(0.62, 0.62, 0.42, 12), tyre, sx, 0.62, sz);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  }
  return g;
}

/** Canvas-covered stacks of things nobody will discuss. */
function makeCargoStack(seed) {
  const rand = rng(seed);
  const g = group('cargo-stack');
  const crate = solid(0x8a6a42, { roughness: 1 });
  for (let i = 0; i < 5; i++) {
    g.add(mesh(boxGeo(1.1, 0.8, 0.9), crate, (i % 3) * 1.2 - 1.2, 0.4 + Math.floor(i / 3) * 0.82, (rand() - 0.5) * 0.3));
  }
  const cover = mesh(boxGeo(4.2, 0.1, 2.0), solid(0x5f6247, { roughness: 1 }), 0, 1.75, 0);
  cover.rotation.x = (rand() - 0.5) * 0.16;
  g.add(cover);
  return g;
}

/**
 * @param {(dx: number, dz: number) => number} groundRel ground height at an
 *   offset from the mast's foot, relative to the mast's foot. The guy wires
 *   are anchored to real points at both ends, so on a slope each one has to
 *   know where its own foot lands or it ends up staked to thin air.
 */
function makeAntenna(groundRel = () => 0) {
  const g = group('antenna');
  const steel = solid(0x9aa0a6, { roughness: 0.55, metalness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const y = i * 3;
    for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]]) {
      g.add(mesh(boxGeo(0.09, 3, 0.09), steel, sx, y + 1.5, sz));
    }
    g.add(mesh(boxGeo(1.2, 0.07, 1.2), steel, 0, y + 3, 0));
  }
  g.add(mesh(cylGeo(0.04, 0.04, 3, 5), steel, 0, 16.5, 0));
  // Guy wires, drawn as thin boxes because nobody will ever count them. Each
  // one runs from a collar on the mast to a stake on the ground it reaches.
  const wireMat = solid(0x5a5a5a, { roughness: 0.8 });
  const anchor = new THREE.Vector3(0, 13, 0);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fx = Math.cos(a) * 9, fz = Math.sin(a) * 9;
    const span = new THREE.Vector3(fx, groundRel(fx, fz), fz).sub(anchor);
    const len = span.length();
    const wire = mesh(boxGeo(0.03, len, 0.03), wireMat, 0, 0, 0);
    wire.position.copy(anchor).addScaledVector(span, 0.5);
    wire.quaternion.setFromUnitVectors(up, span.clone().normalize());
    g.add(wire);
  }
  return g;
}

/** A windsock made out of somebody's red shirt. */
function makeShirtSock() {
  const g = group('shirt-sock');
  g.add(mesh(cylGeo(0.07, 0.09, 3.4, 6), solid(0x6b5432, { roughness: 1 }), 0, 1.7, 0));
  const pivot = new THREE.Group();
  pivot.position.y = 3.3;
  const shirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.22, 1.1, 8, 1, true),
    mat({ color: 0xa8322a, roughness: 1, side: THREE.DoubleSide }),
  );
  shirt.rotation.z = Math.PI / 2;
  shirt.position.x = 0.6;
  pivot.add(shirt);
  // The sleeves are still on it.
  for (const sz of [-0.22, 0.22]) {
    const sleeve = mesh(boxGeo(0.5, 0.1, 0.16), solid(0xa8322a, { roughness: 1 }), 0.5, 0, sz);
    pivot.add(sleeve);
  }
  g.add(pivot);
  return { group: g, pivot };
}

/* ------------------------------------------------------------------ */

export function buildAirstrip(scene) {
  const root = group('el-hueso');
  scene.add(root);
  const rand = rng(0xbee5);
  const colliders = [];
  const floorZones = [];

  const stripLen = EH.zLow - EH.zHigh;              // positive
  const stripMidZ = (EH.zLow + EH.zHigh) / 2;
  const stripMidY = (EH.elevLow + EH.elevHigh) / 2;

  const at = (x, z) => new THREE.Vector3(x, terrainHeight(x, z), z);
  const place = (obj, x, z, rotY = 0) => {
    obj.position.copy(at(x, z));
    obj.rotation.y = rotY;
    root.add(obj);
    return obj;
  };
  const addCollider = (x, z, halfX, halfZ, top = 4) => {
    const y = terrainHeight(x, z);
    const box = new THREE.Box3(
      new THREE.Vector3(x - halfX, y - 1, z - halfZ),
      new THREE.Vector3(x + halfX, y + top, z + halfZ),
    );
    colliders.push(box);
    return box;
  };
  /**
   * Sit a rectangular thing on sloping ground. The shelf falls away under
   * everything up here, so a single centre sample leaves the downhill corners
   * hanging in the air; take the lowest corner instead and let the uphill side
   * bury itself in the hill, which is what a shed on a slope actually does.
   */
  const sinkToGround = (obj, x, z, halfX, halfZ, rotY = 0) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    let low = Infinity;
    for (const sx of [-halfX, halfX]) {
      for (const sz of [-halfZ, halfZ]) {
        low = Math.min(low, terrainHeight(x + sx * c + sz * s, z - sx * s + sz * c));
      }
    }
    obj.position.y = low;
    return low;
  };

  /* ---- The strip itself: a sloped skin laid over the shelf ---- */
  const dirt = mat({ map: dirtTexture(), roughness: 1 });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(EH.rwyWidth * 2, stripLen, 4, 64), dirt);
  strip.rotation.x = -Math.PI / 2;
  {
    /* The plane is built in XY and then laid down with rotation.x = -PI/2, so
     * its local +y runs along -z in the world and its local +z runs straight
     * up. Read the along-strip position out of y, write the height into z —
     * do it the other way round and the whole 620 m collapses to a sliver. */
    const pos = strip.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const wx = EH.x + pos.getX(i);
      const wz = stripMidZ - pos.getY(i);
      pos.setZ(i, terrainHeight(wx, wz) + 0.06 - stripMidY);
    }
    strip.geometry.computeVertexNormals();
  }
  strip.position.set(EH.x, stripMidY, stripMidZ);
  strip.receiveShadow = true;
  root.add(strip);
  floorZones.push({
    box: new THREE.Box3(
      new THREE.Vector3(EH.x - 40, 600, EH.zHigh - 40),
      new THREE.Vector3(EH.x + 40, 800, EH.zLow + 40),
    ),
    surface: 'tile',
  });

  // Muddy turnaround at the top (uphill) end, where you stop and swing round.
  const mud = flatMesh(new THREE.CircleGeometry(24, 22), solid(0x4a3a26, { roughness: 1 }), EH.x, 0, EH.zHigh - 20);
  mud.position.y = terrainHeight(EH.x, EH.zHigh - 20) + 0.07;
  mud.rotation.x = -Math.PI / 2;
  root.add(mud);

  /* ---- Buildings, off the west side ---- */
  const camp = [];
  for (let i = 0; i < 4; i++) {
    const x = EH.x - 26 - rand() * 8;
    const z = EH.zHigh + 40 + i * 22;
    const rot = rand() * 0.6 - 0.3;
    const hut = place(makeHut(0x300 + i * 31), x, z, rot);
    sinkToGround(hut, x, z, hut.userData.halfX, hut.userData.halfZ, rot);
    addCollider(x, z, 3.4, 2.8, 3);
    camp.push(hut);
  }

  const shelterX = EH.x - 22, shelterZ = EH.zHigh + 34;
  place(makeShelter(), shelterX, shelterZ, 0.15);
  /* Four posts, not one box. The shelter is open on every side and the men sit
   * under it — a collider on the roof footprint walls the player out of a
   * space they are supposed to be able to walk into, and traps the guards. */
  {
    const c = Math.cos(0.15), s = Math.sin(0.15);
    for (const sx of [-3.4, 3.4]) {
      for (const sz of [-2.4, 2.4]) {
        addCollider(shelterX + sx * c + sz * s, shelterZ - sx * s + sz * c, 0.2, 0.2, 2.6);
      }
    }
  }

  const antX = EH.x - 40, antZ = EH.zHigh + 20;
  const antBase = terrainHeight(antX, antZ);
  place(makeAntenna((dx, dz) => terrainHeight(antX + dx, antZ + dz) - antBase), antX, antZ);
  const sock = makeShirtSock();
  place(sock.group, EH.x + 16, EH.zHigh + 30);

  for (let i = 0; i < 2; i++) {
    const x = EH.x - 30 + i * 9;
    const z = EH.zHigh + 100 + i * 14;
    const rot = 1.4 + i * 0.4;
    const lorry = place(makeMilitaryTruck(), x, z, rot);
    sinkToGround(lorry, x, z, 1.15, 3.2, rot);
    addCollider(x, z, 2.6, 3.4, 3);
  }

  const drums = [];
  for (let i = 0; i < 11; i++) {
    const x = EH.x - 20 + (rand() - 0.5) * 14;
    const z = EH.zHigh + 58 + rand() * 30;
    const d = place(makeDrum(i % 3 === 0 ? 0x8a4a2a : 0x3f6b46), x, z);
    if (i % 4 === 0) {
      d.rotation.z = 1.55;                          // one on its side, always
      // On its side it rolls onto its rims, and the group origin is no longer
      // the bottom of the drum — lift it back out of the dirt.
      d.position.y += 0.45;
    }
    drums.push(d);
  }

  // West of the strip edge, not on it: the third stack used to sit at EH.x - 5,
  // which is inside the 8 m half-width and directly under the landing roll.
  for (let i = 0; i < 3; i++) {
    place(makeCargoStack(0x900 + i * 17), EH.x - 17 - i * 6, EH.zHigh + 46 + rand() * 8, rand());
  }

  /* ---- The departure arrow, painted on a barrel ---- */
  const arrowBarrel = makeDrum(0xd8d2c0);
  place(arrowBarrel, EH.x - 13, EH.zHigh + 26);
  const arrowFace = flatMesh(planeGeo(0.8, 0.8), mat({
    map: signTexture(['↓  N  ↓', 'DEPART'], { w: 256, h: 256, bg: '#d8d2c0', fg: '#a8322a', border: null, rough: false }),
    roughness: 0.9,
  }), 0, 0.62, 0.44);
  arrowBarrel.add(arrowFace);

  /* ---- Chickens ---- */
  const chickens = [];
  for (let i = 0; i < 7; i++) {
    const x = EH.x + (rand() - 0.5) * 26;
    const z = EH.zHigh + 30 + rand() * 90;
    const c = makeChicken(x, z);
    c.group.position.y = terrainHeight(x, z);
    root.add(c.group);
    chickens.push(c);
  }

  /* ---- The men ---- */
  /* The bench takes up the north-west of the shelter and the table the
   * north-east, so the old grid stood guard 0 inside the bench and guard 3
   * inside the table. They line up along the open south side instead, where
   * they can watch the strip and there is nothing to stand through. Offsets
   * are world-relative to the shelter, which is itself yawed 0.15. */
  const guards = [];
  const guardRow = [-2.6, -1.0, 0.6, 2.2];
  for (let i = 0; i < 4; i++) {
    const g = makeGuard(i);
    const x = shelterX + guardRow[i];
    const z = shelterZ + 1.6;
    g.group.position.copy(at(x, z));
    g.group.rotation.y = 0.2 + (rand() - 0.5) * 0.5;
    root.add(g.group);
    guards.push(g);
  }
  const cecilio = makeCecilio();
  cecilio.group.position.copy(at(EH.x - 11, EH.zHigh + 44));
  cecilio.group.rotation.y = 1.3;
  root.add(cecilio.group);

  /* ---- Jungle immediately beside the strip: it is not scenery, it is a wall ---- */
  const palmTrunk = cylGeo(0.28, 0.42, 9, 6);
  const palmFrond = boxGeo(0.28, 0.1, 4.4);
  const trunkMat = solid(0x4a3a24, { roughness: 1 });
  const frondMat = solid(0x2f6b34, { roughness: 1 });
  for (let i = 0; i < 90; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = EH.x + side * (EH.rwyWidth + 4 + rand() * 26);
    const z = EH.zHigh - 30 + rand() * (stripLen + 90);
    if (side < 0 && x > EH.x - 46 && z < EH.zHigh + 130 && z > EH.zHigh + 10) continue;  // keep the camp clear
    const y = terrainHeight(x, z);
    const t = mesh(palmTrunk, trunkMat, x, y + 4.5, z);
    t.rotation.z = (rand() - 0.5) * 0.24;
    root.add(t);
    for (let f = 0; f < 5; f++) {
      const frond = mesh(palmFrond, frondMat, x, y + 8.8, z);
      frond.rotation.y = (f / 5) * Math.PI * 2 + rand();
      frond.rotation.z = -0.32 - rand() * 0.2;
      frond.position.x += Math.cos(frond.rotation.y) * 2.1;
      frond.position.z += Math.sin(frond.rotation.y) * 2.1;
      root.add(frond);
    }
  }

  /* ---- Anchors ---- */
  const touchdownZ = EH.zLow - 60;
  const anchors = {
    // Land uphill (heading 180), stop in the turnaround at the top.
    landingHeading: 180,
    threshold: at(EH.x, EH.zLow - 10),
    touchdown: at(EH.x, touchdownZ),
    parkSpot: at(EH.x, EH.zHigh + 22),
    parkHeading: 0,
    departHeading: 0,                   // downhill, off the cliff
    departStart: at(EH.x, EH.zHigh + 18),
    cliffEdge: at(EH.x, EH.zLow + 40),
    cecilio: cecilio.group.position.clone(),
    crateStack: at(EH.x - 15, EH.zHigh + 40),
    shelter: at(shelterX, shelterZ),
  };

  const state = { t: 0 };

  return {
    root, colliders, floorZones, anchors, chickens, guards, cecilio, drums, sock,
    stripMidZ, stripMidY,

    /** Where the ground is under a point on the strip. */
    groundAt: (x, z) => terrainHeight(x, z),

    /**
     * @param {?THREE.Vector3} propWash where the aeroplane is, if it is running.
     *   The chickens care about this more than anything else on the strip.
     */
    update(dt, { propWash = null } = {}) {
      state.t += dt;
      sock.pivot.rotation.y = damp(sock.pivot.rotation.y, 2.4 + Math.sin(state.t * 0.9) * 0.3, 1.4, dt);
      for (const c of chickens) {
        updateChicken(c, dt, terrainHeight(c.group.position.x, c.group.position.z), propWash);
      }
      void clamp;
    },
  };
}

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
  solid, unlit, mat, boxGeo, cylGeo, planeGeo,
  mesh, flatMesh, group, signTexture, rng, clamp, damp,
} from './util.js';
import { EH } from './config.js';
import { terrainHeight, terrainMeshHeight, terrainNormal, TERRAIN_DETAIL } from './terrain.js';
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
function makeShelter(worldX, worldZ, yaw) {
  const g = group('shelter');
  const post = solid(0x6b5432, { roughness: 1 });
  const tin = solid(0x9a9488, { roughness: 0.65, metalness: 0.45 });
  const furniture = solid(0x8a6a42, { roughness: 1 });
  const originY = terrainHeight(worldX, worldZ);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const supportToTerrain = (x, z, topY, width, depth, name) => {
    const footX = worldX + x * c + z * s;
    const footZ = worldZ - x * s + z * c;
    const bottomY = terrainHeight(footX, footZ) - originY;
    const height = topY - bottomY;
    const leg = mesh(boxGeo(width, height, depth), furniture, x, bottomY + height / 2, z);
    leg.name = name;
    return leg;
  };
  for (const sx of [-3.4, 3.4]) {
    for (const sz of [-2.4, 2.4]) {
      g.add(mesh(boxGeo(0.2, 2.6, 0.2), post, sx, 1.3, sz));
    }
  }
  const roof = mesh(boxGeo(8, 0.12, 6), tin, 0, 2.7, 0);
  roof.rotation.x = 0.1;
  g.add(roof);
  // A bench, a table, a radio.
  const benchSeat = mesh(boxGeo(4, 0.14, 0.5), furniture, -1, 0.5, -1.6);
  benchSeat.name = 'shelter-bench-seat';
  g.add(benchSeat);
  for (const x of [-2.35, 0.35]) {
    g.add(supportToTerrain(x, -1.6, 0.43, 0.16, 0.4, 'shelter-bench-leg'));
  }
  const tableTop = mesh(boxGeo(1.6, 0.12, 1.0), furniture, 1.8, 0.8, 0.4);
  tableTop.name = 'shelter-table-top';
  g.add(tableTop);
  for (const x of [1.15, 2.45]) {
    for (const z of [0.05, 0.75]) {
      g.add(supportToTerrain(x, z, 0.74, 0.1, 0.1, 'shelter-table-leg'));
    }
  }
  const radio = mesh(boxGeo(0.5, 0.3, 0.34), solid(0x3a3a3e, { roughness: 0.7 }), 1.8, 1.0, 0.4);
  radio.name = 'shelter-radio';
  g.add(radio);
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
  const ownGroundedAssembly = (obj, assemblyId, support = obj.children[0]) => {
    obj.userData.geometryGate = {
      ...(obj.userData.geometryGate ?? {}),
      assemblyId,
    };
    if (!support) throw new Error(`Missing support witness for ${assemblyId}`);
    support.userData.geometryGate = {
      ...(support.userData.geometryGate ?? {}),
      // One exact base/foot records that this authored assembly is planted by
      // terrainHeight(); no scene-scale parent suppression is needed.
      checkSupport: false,
    };
    return obj;
  };
  const addCollider = (x, z, halfX, halfZ, top = 4, assemblyId = null) => {
    const y = terrainHeight(x, z);
    const box = new THREE.Box3(
      new THREE.Vector3(x - halfX, y - 1, z - halfZ),
      new THREE.Vector3(x + halfX, y + top, z + halfZ),
    );
    if (assemblyId) box.userData = { geometryGate: { assemblyId } };
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
  strip.name = 'el-hueso-sloped-runway-surface';
  strip.userData.geometryGate = {
    overlap: false,
    checkSupport: false,
  };
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
  mud.name = 'el-hueso-turnaround-surface';
  mud.userData.geometryGate = { checkSupport: false };
  mud.position.y = terrainHeight(EH.x, EH.zHigh - 20) + 0.07;
  mud.rotation.x = -Math.PI / 2;
  root.add(mud);

  /* ---- Buildings, off the west side ---- */
  const camp = [];
  for (let i = 0; i < 4; i++) {
    const x = EH.x - 26 - rand() * 8;
    const z = EH.zHigh + 40 + i * 22;
    const rot = rand() * 0.6 - 0.3;
    const hutAssembly = `beefrun.el-hueso.hut.${i + 1}`;
    const hut = place(ownGroundedAssembly(makeHut(0x300 + i * 31), hutAssembly), x, z, rot);
    sinkToGround(hut, x, z, hut.userData.halfX, hut.userData.halfZ, rot);
    addCollider(x, z, 3.4, 2.8, 3, hutAssembly);
    camp.push(hut);
  }

  const shelterX = EH.x - 22, shelterZ = EH.zHigh + 34, shelterYaw = 0.15;
  const shelterAssembly = 'beefrun.el-hueso.shelter';
  place(
    ownGroundedAssembly(makeShelter(shelterX, shelterZ, shelterYaw), shelterAssembly),
    shelterX, shelterZ, shelterYaw,
  );
  /* Four posts, not one box. The shelter is open on every side and the men sit
   * under it — a collider on the roof footprint walls the player out of a
   * space they are supposed to be able to walk into, and traps the guards. */
  {
    const c = Math.cos(shelterYaw), s = Math.sin(shelterYaw);
    for (const sx of [-3.4, 3.4]) {
      for (const sz of [-2.4, 2.4]) {
        addCollider(
          shelterX + sx * c + sz * s, shelterZ - sx * s + sz * c, 0.2, 0.2, 2.6,
          shelterAssembly,
        );
      }
    }
  }

  const antX = EH.x - 40, antZ = EH.zHigh + 20;
  const antBase = terrainHeight(antX, antZ);
  place(ownGroundedAssembly(
    makeAntenna((dx, dz) => terrainHeight(antX + dx, antZ + dz) - antBase),
    'beefrun.el-hueso.antenna',
  ), antX, antZ);
  const sock = makeShirtSock();
  ownGroundedAssembly(sock.group, 'beefrun.el-hueso.shirt-sock');
  place(sock.group, EH.x + 16, EH.zHigh + 30);

  for (let i = 0; i < 2; i++) {
    // Keep the first lorry west of hut four's real blocker. Their former
    // colliders overlapped by 20 cm even though the drawn bodies only looked
    // close, creating an invisible pinch point between camp fixtures.
    const x = EH.x + [-40, -21][i];
    const z = EH.zHigh + 100 + i * 14;
    const rot = 1.4 + i * 0.4;
    const lorryAssembly = `beefrun.el-hueso.military-truck.${i + 1}`;
    const lorryModel = makeMilitaryTruck();
    const lorry = place(
      ownGroundedAssembly(lorryModel, lorryAssembly, lorryModel.children.at(-1)),
      x, z, rot,
    );
    sinkToGround(lorry, x, z, 1.15, 3.2, rot);
    addCollider(x, z, 2.6, 3.4, 3, lorryAssembly);
  }

  const drums = [];
  for (let i = 0; i < 11; i++) {
    const x = EH.x - 20 + (rand() - 0.5) * 14;
    const z = EH.zHigh + 58 + rand() * 30;
    const d = place(ownGroundedAssembly(
      makeDrum(i % 3 === 0 ? 0x8a4a2a : 0x3f6b46),
      `beefrun.el-hueso.drum.${i + 1}`,
    ), x, z);
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
    place(
      ownGroundedAssembly(makeCargoStack(0x900 + i * 17), `beefrun.el-hueso.cargo.${i + 1}`),
      EH.x - 17 - i * 6, EH.zHigh + 46 + rand() * 8, rand(),
    );
  }

  /* ---- The departure arrow, painted on a barrel ---- */
  const arrowBarrel = makeDrum(0xd8d2c0);
  ownGroundedAssembly(arrowBarrel, 'beefrun.el-hueso.departure-barrel');
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
    /* The support witness is a LEG, found BY NAME rather than by where it sits
     * in the child list: `children[4]` was the first leg only while the head,
     * beak and comb were three separate children. Grouping the head into one
     * pivot (see makeChicken) made children[4] undefined, which
     * ownGroundedAssembly throws on -- correctly, but for a reason nobody
     * would have guessed from the call site. Every part of the bird carries
     * its own name now, for this and for the allowlists. */
    const chickenLeg = c.group.children.find((child) => child.name === 'chicken-leg');
    ownGroundedAssembly(c.group, `beefrun.el-hueso.chicken.${i + 1}`, chickenLeg);
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
    ownGroundedAssembly(
      g.group,
      g.group.userData.geometryGate.assemblyId,
      g.group.getObjectByName(`guard${i}-leg-right-boot`),
    );
    const x = shelterX + guardRow[i];
    const z = shelterZ + 1.6;
    g.group.position.copy(at(x, z));
    g.group.rotation.y = 0.2 + (rand() - 0.5) * 0.5;
    root.add(g.group);
    guards.push(g);
  }
  const cecilio = makeCecilio();
  ownGroundedAssembly(
    cecilio.group,
    cecilio.group.userData.geometryGate.assemblyId,
    cecilio.group.getObjectByName('cecilio-leg-right-boot'),
  );
  cecilio.group.position.copy(at(EH.x - 11, EH.zHigh + 44));
  cecilio.group.rotation.y = 1.3;
  root.add(cecilio.group);

  /* ---- The jungle: palms hard against the strip, a canopy wall behind ----
   *
   * Owner, 2026-08-05: "fix the trees at the mountain airport". Both stands
   * used to be planted at the HEIGHTFIELD's height, but the ground the player
   * sees is the chunk MESH -- a plane between vertices 18-28 m apart -- and on
   * this valley wall the two disagree by a metre and more, so trunks stood
   * on air and crowns placed from the same number sat a metre off their own
   * trunks. Every trunk was vertical, every palm's fronds were planks offset
   * SIDEWAYS from the top rather than radiating from it, and 44 near-identical
   * cones stood in a band like a plantation. The rules now, in the order
   * docs/FUTURE-EDITS.md lists them:
   *   1. grounding   -- base at the lowest of the heightfield and the two
   *                     mesh detail levels the strip is drawn at, sunk a
   *                     little further, so nothing floats at any LOD;
   *   2. slope tilt  -- a fraction of the ground normal, capped;
   *   3. variance    -- skewed sizes, crown widths, clumps rather than a band;
   *   4. exclusion   -- runway, turnaround, apron and camp are kept clear by
   *                     one predicate, `onOperatingSurface`;
   *   5. popping     -- everything is instanced, so it is drawn or not as a
   *                     whole under the fog rather than in rings.
   * Crowns and fronds are built from the trunk's own top, not from a shared
   * y, so a tree can no longer split.
   */
  const stripCentre = { x: EH.x, zHigh: EH.zHigh, zLow: EH.zLow };
  const turnaround = { x: EH.x, z: EH.zHigh - 20, r: 24 };
  /** The ground the aircraft and the men use. Nothing grows here. */
  const onOperatingSurface = (x, z, margin = 4) => {
    const dx = x - stripCentre.x;
    if (Math.abs(dx) <= EH.rwyWidth + margin && z >= stripCentre.zHigh - 60 && z <= stripCentre.zLow + 60) return true;
    if (Math.hypot(x - turnaround.x, z - turnaround.z) <= turnaround.r + margin) return true;
    // Apron: the parking spot and the walk between it and the shelter.
    if (Math.abs(dx) <= 14 + margin && z >= EH.zHigh + 4 && z <= EH.zHigh + 46) return true;
    // The camp, the drums, the lorries, the antenna: the whole west shelf.
    if (dx < -8 && dx > -50 - margin && z > EH.zHigh + 8 && z < EH.zHigh + 132) return true;
    // The shirt windsock and the chickens' run beside it.
    if (Math.abs(x - (EH.x + 16)) < 5 + margin && Math.abs(z - (EH.zHigh + 30)) < 6 + margin) return true;
    return false;
  };
  /**
   * Where the ground actually is for something planted at (x, z): the lowest
   * of the heightfield and the mesh at the two detail levels a chunk on the
   * strip is drawn at (28 segments underfoot, 24 one ring out). Taking the
   * minimum means a trunk sunk from here is under the surface at whichever
   * of them is showing; the coarser rings only ever draw this from a
   * kilometre away.
   */
  const plantedGround = (x, z) => Math.min(
    terrainHeight(x, z),
    terrainMeshHeight(x, z, TERRAIN_DETAIL[0]),
    terrainMeshHeight(x, z, TERRAIN_DETAIL[1]),
  );
  const _up = new THREE.Vector3(0, 1, 0);
  const _n = new THREE.Vector3();
  const _lean = new THREE.Vector3();
  const _qTilt = new THREE.Quaternion();
  const _qYaw = new THREE.Quaternion();
  const _ident = new THREE.Quaternion();
  /** A little of the slope, never more than ~12 degrees; trees mostly grow up. */
  const slopeTilt = (x, z, amount, out) => {
    terrainNormal(x, z, _n);
    _lean.copy(_up).lerp(_n, amount).normalize();
    out.setFromUnitVectors(_up, _lean);
    const angle = Math.acos(clamp(_lean.y, -1, 1));
    if (angle > 0.21) out.slerp(_ident, 1 - 0.21 / angle);
    return out;
  };
  const _m = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _scl = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _top = new THREE.Vector3();
  const _mFrond = new THREE.Matrix4();
  const _qFrond = new THREE.Quaternion();
  const _qDroop = new THREE.Quaternion();
  const _axisY = new THREE.Vector3(0, 1, 0);
  const _axisX = new THREE.Vector3(1, 0, 0);
  const jungleReport = { palms: [], canopy: [] };

  /* Palms right beside the strip: it is not scenery, it is a wall. Same
   * z-span rule as before -- the run stops short of `zLow` so no palm is
   * rooted on the cliff drop `elHuesoShape` opens past it. */
  const PALM_H = 9;
  const PALM_SINK = 1.4;
  const FRONDS = 7;
  const palmCount = 96;
  const palmTrunkGeo = new THREE.CylinderGeometry(0.26, 0.44, PALM_H + PALM_SINK, 7);
  palmTrunkGeo.translate(0, (PALM_H + PALM_SINK) / 2 - PALM_SINK, 0);   // origin at the ground point
  const frondGeo = new THREE.BoxGeometry(0.62, 0.05, 4.6);
  frondGeo.translate(0, 0, 2.3);                                         // origin at the inner end
  const palmPrefix = 'beefrun-el-hueso-palm';
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, solid(0x4a3a24, { roughness: 1 }), palmCount);
  palmTrunks.name = 'el-hueso-palm-trunks';
  palmTrunks.userData.geometryGate = {
    instanceAssemblyPrefix: palmPrefix,
    checkSupport: false,
  };
  const palmFrondMaterial = mat({ color: 0x2f6b34, roughness: 1, side: THREE.DoubleSide });
  const palmFronds = Array.from({ length: FRONDS }, (_, index) => {
    const batch = new THREE.InstancedMesh(frondGeo, palmFrondMaterial, palmCount);
    batch.name = `el-hueso-palm-frond-fan-${index + 1}`;
    batch.userData.geometryGate = {
      instanceAssemblyPrefix: palmPrefix,
      overlap: false,
    };
    return batch;
  });
  let palmsPlaced = 0;
  for (let i = 0; i < palmCount * 6 && palmsPlaced < palmCount; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = EH.x + side * (EH.rwyWidth + 4 + Math.pow(rand(), 1.3) * 26);
    const z = EH.zHigh - 30 + rand() * (stripLen + 15);
    if (onOperatingSurface(x, z, 3)) continue;
    const s = 0.72 + Math.pow(rand(), 1.2) * 0.62;
    const y = plantedGround(x, z);
    slopeTilt(x, z, 0.45, _qTilt);
    // A palm leans a little of its own accord as well, and yaws freely.
    _qYaw.setFromAxisAngle(_axisY, rand() * Math.PI * 2);
    _qDroop.setFromAxisAngle(_axisX, (rand() - 0.5) * 0.16);
    _q.copy(_qTilt).multiply(_qYaw).multiply(_qDroop);
    _pos.set(x, y, z);
    _scl.set(s, s, s);
    _m.compose(_pos, _q, _scl);
    palmTrunks.setMatrixAt(palmsPlaced, _m);
    // Fronds radiate from THIS trunk's top, wherever the lean put it.
    _top.set(0, PALM_H * s, 0).applyQuaternion(_q).add(_pos);
    for (let f = 0; f < FRONDS; f++) {
      const yaw = (f / FRONDS) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const droop = 0.42 + rand() * 0.5;
      _qYaw.setFromAxisAngle(_axisY, yaw);
      _qDroop.setFromAxisAngle(_axisX, droop);
      _qFrond.copy(_qYaw).multiply(_qDroop);
      _scl.set(s * (0.9 + rand() * 0.3), s, s * (0.85 + rand() * 0.4));
      _mFrond.compose(_top, _qFrond, _scl);
      palmFronds[f].setMatrixAt(palmsPlaced, _mFrond);
    }
    jungleReport.palms.push({ x, z, y, s });
    palmsPlaced++;
  }
  palmTrunks.count = palmsPlaced;
  palmTrunks.instanceMatrix.needsUpdate = true;
  palmTrunks.computeBoundingSphere();
  for (const batch of palmFronds) {
    batch.count = palmsPlaced;
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
  }
  root.add(palmTrunks, ...palmFronds);

  /* The canopy wall behind the palms: clumps of broad-crowned trees up the
   * valley wall, so El Hueso reads as a strip cut out of a hillside rather
   * than a band of cones beside a lawn. Two draw calls however many there
   * are. The z-range still stops short of `zLow` for the same cliff reason. */
  const CANOPY_H = 8;
  const CANOPY_SINK = 1.6;
  const jungleCount = 120;
  const jungleTrunkGeo = new THREE.CylinderGeometry(0.42, 0.72, CANOPY_H + CANOPY_SINK, 6);
  jungleTrunkGeo.translate(0, (CANOPY_H + CANOPY_SINK) / 2 - CANOPY_SINK, 0);
  const crownGeo = new THREE.ConeGeometry(5.2, 13, 7);
  crownGeo.translate(0, CANOPY_H - 2.4 + 6.5, 0);           // crown base 2.4 m down the trunk
  const jungleTrunks = new THREE.InstancedMesh(jungleTrunkGeo, solid(0x443522, { roughness: 1 }), jungleCount);
  jungleTrunks.name = 'el-hueso-jungle-trunks';
  const jungleCrowns = new THREE.InstancedMesh(crownGeo, solid(0x245f32, { roughness: 1 }), jungleCount);
  jungleCrowns.name = 'el-hueso-jungle-foliage';
  const junglePrefix = 'beefrun-el-hueso-jungle';
  jungleTrunks.userData.geometryGate = {
    instanceAssemblyPrefix: junglePrefix,
    checkSupport: false,
  };
  jungleCrowns.userData.geometryGate = {
    instanceAssemblyPrefix: junglePrefix,
    overlap: false,
  };
  // Clump centres up and down both flanks, then trees around them.
  const clumps = [];
  for (let c = 0; c < 22; c++) {
    const side = c % 2 ? 1 : -1;
    clumps.push({
      x: EH.x + side * (EH.rwyWidth + 30 + rand() * 46),
      z: EH.zHigh - 60 + (c / 22) * (stripLen + 45) + (rand() - 0.5) * 30,
      r: 8 + rand() * 12,
    });
  }
  let jungled = 0;
  for (let i = 0; i < jungleCount * 8 && jungled < jungleCount; i++) {
    let x; let z;
    if (rand() < 0.8) {
      const cl = clumps[Math.floor(rand() * clumps.length)];
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * cl.r;
      x = cl.x + Math.cos(a) * d;
      z = cl.z + Math.sin(a) * d;
    } else {
      const side = rand() < 0.5 ? -1 : 1;
      x = EH.x + side * (EH.rwyWidth + 28 + rand() * 50);
      z = EH.zHigh - 60 + rand() * (stripLen + 45);
    }
    if (Math.abs(x - EH.x) < EH.rwyWidth + 26 || onOperatingSurface(x, z, 8)) continue;
    const s = 0.62 + Math.pow(rand(), 1.5) * 1.15;                     // most middling, a few giants
    // The old clump sampler allowed neighbouring trunks to cross. Preserve
    // clumps visually while reserving enough room for both tilted stems.
    const clearsExistingTrunks = jungleReport.canopy.every((other) => (
      Math.hypot(x - other.x, z - other.z) > 2.2 * (s + other.s) + 0.2
    ));
    if (!clearsExistingTrunks) continue;
    const y = plantedGround(x, z);
    slopeTilt(x, z, 0.4, _qTilt);
    _qYaw.setFromAxisAngle(_axisY, rand() * Math.PI * 2);
    _q.copy(_qTilt).multiply(_qYaw);
    _pos.set(x, y, z);
    _scl.set(s, s * (0.9 + rand() * 0.3), s);
    _m.compose(_pos, _q, _scl);
    jungleTrunks.setMatrixAt(jungled, _m);
    const w = 0.8 + rand() * 0.5;                                        // crown width, independent of height
    _scl.set(_scl.x * w, _scl.y, _scl.z * w);
    _m.compose(_pos, _q, _scl);
    jungleCrowns.setMatrixAt(jungled, _m);
    jungleReport.canopy.push({ x, z, y, s });
    jungled++;
  }
  jungleTrunks.count = jungled;
  jungleCrowns.count = jungled;
  jungleTrunks.instanceMatrix.needsUpdate = true;
  jungleCrowns.instanceMatrix.needsUpdate = true;
  jungleTrunks.computeBoundingSphere();
  jungleCrowns.computeBoundingSphere();
  root.add(jungleTrunks, jungleCrowns);

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
    /** Every planted tree (x, z, ground y, scale) and the keep-clear test, for the verifier. */
    jungle: { ...jungleReport, onOperatingSurface, plantedGround },

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

/**
 * Whispering Pines Municipal.
 *
 * One cracked runway, a hangar with a dent in it, and three signs that argue
 * with each other. The field is built in world space around the origin: the
 * runway runs north–south, the apron and everything anybody actually uses is
 * off the west side, and the entrance road comes in from further west still,
 * which is where Prospect is standing when the mission starts.
 */
import * as THREE from 'three';
import {
  solid, unlit, mat, boxGeo, cylGeo, coneGeo, sphereGeo, planeGeo,
  mesh, flatMesh, group, signBoard, signTexture, rng, clamp, damp,
} from './util.js';
import { WP } from './config.js';
import { makeCrow, makeDog } from './npc.js';

const ELEV = WP.elev;

/** Cracked asphalt with a faded centreline, drawn once and repeated. */
function runwayTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3d3d40';
  ctx.fillRect(0, 0, 256, 1024);
  // Patchy repairs and weathering.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = ['#454548', '#37373a', '#4a4a44', '#33332f'][i % 4];
    ctx.globalAlpha = 0.25 + Math.random() * 0.4;
    ctx.fillRect(Math.random() * 256, Math.random() * 1024, 10 + Math.random() * 70, 8 + Math.random() * 60);
  }
  ctx.globalAlpha = 1;
  // Cracks, with grass in them.
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = Math.random() < 0.4 ? '#4a5c34' : '#26262a';
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * 256, y = Math.random() * 1024;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Centreline, mostly gone.
  ctx.fillStyle = '#c9c4b0';
  for (let y = 0; y < 1024; y += 128) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.5;
    ctx.fillRect(120, y, 16, 76);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHangar() {
  const g = group('hangar');
  const corrugated = solid(0x8d9298, { roughness: 0.62, metalness: 0.45 });
  const rust = solid(0x7a5a42, { roughness: 0.9, metalness: 0.2 });
  const w = 22, d = 16, h = 7;
  // Back and sides.
  g.add(mesh(boxGeo(w, h, 0.3), corrugated, 0, h / 2, -d / 2));
  g.add(mesh(boxGeo(0.3, h, d), corrugated, -w / 2, h / 2, 0));
  g.add(mesh(boxGeo(0.3, h, d), corrugated, w / 2, h / 2, 0));
  // Front, with the opening.
  for (const sx of [-1, 1]) {
    g.add(mesh(boxGeo(w / 2 - 5, h, 0.3), corrugated, sx * (w / 4 + 2.5), h / 2, d / 2));
  }
  g.add(mesh(boxGeo(10, 1.4, 0.3), corrugated, 0, h - 0.7, d / 2));
  /* Roof, faked with a shallow three-sided prism laid front-to-back. The
   * rotations matter: rotation.y = PI turns the prism's apex up instead of
   * down (it used to hang point-first through the building and out the bottom,
   * swallowing anything parked off the south wall), and rotation.x lays the
   * prism along the depth. Scale then stretches the section out to the walls,
   * so the eaves land on top of them at y = h and the ridge sits 3 m above. */
  const roofR = 3, ridge = 3;
  const roof = mesh(cylGeo(roofR, roofR, d, 3, false), corrugated, 0, h + ridge / 3, 0);
  roof.rotation.y = Math.PI;
  roof.rotation.x = Math.PI / 2;
  roof.scale.set((w / 2) / (roofR * Math.cos(Math.PI / 6)), 1, ridge / (roofR * 1.5));
  g.add(roof);
  g.userData.eaveY = h;
  g.userData.ridgeY = h + ridge;
  g.userData.halfW = w / 2;
  // Rust running down from the roof line.
  for (let i = 0; i < 6; i++) {
    g.add(mesh(boxGeo(0.9, 2.6, 0.06), rust, -w / 2 + 2 + i * 3.6, h - 2.2, d / 2 + 0.17));
  }
  return g;
}

function makeOpsShack() {
  const g = group('ops-shack');
  const board = solid(0x9a8a6a, { roughness: 1 });
  const trim = solid(0x5a4a34, { roughness: 0.95 });
  g.add(mesh(boxGeo(7, 3.2, 5), board, 0, 1.6, 0));
  const roof = mesh(boxGeo(7.8, 0.24, 5.8), trim, 0, 3.34, 0);
  roof.rotation.x = 0.06;
  g.add(roof);
  g.add(mesh(boxGeo(1.1, 2.2, 0.14), trim, -1.8, 1.1, 2.55));
  g.add(mesh(boxGeo(2.2, 1.2, 0.1), mat({ color: 0x9fb4bd, roughness: 0.25, metalness: 0.1 }), 1.2, 1.9, 2.55));
  // Air conditioner in the window, not running.
  g.add(mesh(boxGeo(0.8, 0.5, 0.5), solid(0xb8bcc0, { roughness: 0.6 }), 1.2, 1.4, 2.7));
  return g;
}

/** A vending machine that does not work, with the plug hanging beside it. */
function makeVendingMachine() {
  const g = group('vending');
  g.add(mesh(boxGeo(1.0, 2.0, 0.72), solid(0xb42a2a, { roughness: 0.55 }), 0, 1.0, 0));
  const front = flatMesh(planeGeo(0.82, 1.3), mat({
    map: signTexture(['OUT OF', 'ORDER'], { w: 256, h: 384, bg: '#1a1a1f', fg: '#d8d2c0', border: null, rough: false }),
    roughness: 0.4,
  }), 0, 1.2, 0.37);
  g.add(front);
  const cord = mesh(cylGeo(0.02, 0.02, 1.2, 5), solid(0x1a1a1a, { roughness: 0.9 }), 0.4, 0.3, 0.4);
  cord.rotation.z = 0.6;
  g.add(cord);
  return g;
}

function makePickup(color = 0x8a2f2f, doorColor = 0x3f5f8a) {
  const g = group('pickup');
  const body = solid(color, { roughness: 0.62, metalness: 0.25 });
  const door = solid(doorColor, { roughness: 0.7, metalness: 0.2 });
  const glass = mat({ color: 0xbfd8e2, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.55 });
  const tyre = solid(0x1c1c20, { roughness: 0.95 });
  g.add(mesh(boxGeo(2.0, 0.9, 5.4), body, 0, 1.0, 0));
  g.add(mesh(boxGeo(1.9, 1.0, 2.0), body, 0, 1.85, 0.7));
  g.add(mesh(boxGeo(1.8, 0.7, 1.9), glass, 0, 2.0, 0.72));
  // Mismatched doors, one each side, neither the colour of the truck.
  g.add(mesh(boxGeo(0.08, 0.9, 1.5), door, -1.0, 1.55, 0.6));
  g.add(mesh(boxGeo(0.08, 0.9, 1.5), solid(0x6a6a52, { roughness: 0.8 }), 1.0, 1.55, 0.6));
  // Bed.
  g.add(mesh(boxGeo(2.0, 0.5, 2.4), body, 0, 1.6, -1.5));
  for (const sx of [-0.85, 0.85]) {
    for (const sz of [-1.7, 1.7]) {
      const w = mesh(cylGeo(0.48, 0.48, 0.32, 12), tyre, sx, 0.5, sz);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  }
  const lights = [];
  for (const sx of [-0.72, 0.72]) {
    const lamp = flatMesh(sphereGeo(0.17, 8, 6), unlit(0x2a2a24), sx, 1.15, 2.72);
    g.add(lamp);
    lights.push(lamp);
  }
  /* A real light, not just two bright discs. When the truck is driven round to
   * the threshold at dusk this is the only thing putting anything on the
   * ground there, so the beam has to actually exist. Off until asked for. */
  const beam = new THREE.SpotLight(0xfff0c8, 0, 150, 0.46, 0.5, 0.9);
  beam.position.set(0, 1.25, 2.7);
  beam.target.position.set(0, -0.6, 60);
  beam.castShadow = false;
  g.add(beam, beam.target);
  return { group: g, lights, beam };
}

/** An aeroplane that stopped being one. */
function makeWreck(seed) {
  const rand = rng(seed);
  const g = group('wreck');
  const bare = solid(0x8f9298, { roughness: 0.72, metalness: 0.55 });
  const oxidised = solid(0x6f6a60, { roughness: 0.95, metalness: 0.3 });
  g.add(mesh(boxGeo(1.3, 1.4, 6.4), oxidised, 0, 1.0, 0));
  const nose = mesh(coneGeo(0.7, 1.6, 8), oxidised, 0, 1.0, 3.6);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  // One wing on, one wing leaning against the fuselage.
  g.add(mesh(boxGeo(9, 0.22, 1.5), bare, -3.5, 1.7, 0.3));
  /* Leaned at 0.5 rad from a 0.9 m hub, a 4 m half-span puts the low tip
   * 1.11 m under the grass. Shallower, and lifted so the tip just grazes it. */
  const lean = 0.24;
  const loose = mesh(boxGeo(8, 0.22, 1.5), bare, 3.4, 4 * Math.sin(lean) + 0.11 * Math.cos(lean), -0.6);
  loose.rotation.z = -lean;
  loose.rotation.y = 0.3;
  g.add(loose);
  g.add(mesh(boxGeo(0.16, 1.8, 1.4), bare, 0, 1.9, -3.0));
  // Weeds through it.
  for (let i = 0; i < 9; i++) {
    const blade = mesh(boxGeo(0.05, 0.5 + rand() * 0.7, 0.05), solid(0x5c7a3a, { roughness: 1 }), (rand() - 0.5) * 7, 0.3, (rand() - 0.5) * 7);
    blade.rotation.z = (rand() - 0.5) * 0.5;
    g.add(blade);
  }
  g.rotation.y = rand() * Math.PI * 2;
  return g;
}

function makeWindsock() {
  const g = group('windsock');
  g.add(mesh(cylGeo(0.09, 0.12, 5.5, 8), solid(0xb8bcc0, { roughness: 0.5, metalness: 0.6 }), 0, 2.75, 0));
  const pivot = new THREE.Group();
  pivot.position.y = 5.3;
  const sockMat = mat({ color: 0xe8622a, roughness: 1, side: THREE.DoubleSide });
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.24, 2.4, 10, 1, true), sockMat);
  sock.rotation.z = Math.PI / 2;
  sock.position.x = 1.2;
  pivot.add(sock);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.29, 0.5, 10, 1, true), mat({ color: 0xe8e2d4, roughness: 1, side: THREE.DoubleSide }));
  stripe.rotation.z = Math.PI / 2;
  stripe.position.x = 1.2;
  pivot.add(stripe);
  g.add(pivot);
  return { group: g, pivot, sock };
}

function makeFuelTank() {
  const g = group('fuel-tank');
  const tank = mesh(cylGeo(1.6, 1.6, 6, 14), solid(0x8a7a5a, { roughness: 0.88, metalness: 0.3 }), 0, 2.4, 0);
  tank.rotation.z = Math.PI / 2;
  g.add(tank);
  for (const sx of [-2, 2]) {
    g.add(mesh(boxGeo(0.4, 1.4, 2.4), solid(0x5a5248, { roughness: 0.9 }), sx, 0.7, 0));
  }
  // Rust streaks and a hand-painted word.
  g.add(mesh(boxGeo(2.2, 0.9, 0.06), mat({
    map: signTexture(['100LL'], { w: 256, h: 128, bg: '#7a6a4a', fg: '#2a2218', border: null }),
    roughness: 0.95,
  }), 0, 2.6, 1.63));
  // The pump, and the shade the dog likes.
  const pump = mesh(boxGeo(0.7, 1.5, 0.5), solid(0xb42a2a, { roughness: 0.7 }), 3.4, 0.75, 0);
  g.add(pump);
  const hose = mesh(cylGeo(0.06, 0.06, 2.2, 6), solid(0x1a1a1a, { roughness: 0.95 }), 3.4, 0.6, 0.6);
  hose.rotation.x = 1.1;
  g.add(hose);
  return g;
}

function makeBeacon() {
  const g = group('beacon');
  g.add(mesh(cylGeo(0.14, 0.2, 8, 8), solid(0x9aa0a6, { roughness: 0.5, metalness: 0.6 }), 0, 4, 0));
  /* Head at the top of the mast, lenses as its children at the head's own
   * origin — they are carried round by head.rotation.y in update(). Adding
   * them to the group instead reparents them off the head, which left the
   * lenses hanging in the air, unlit and stationary, above a head sitting on
   * the grass. */
  const head = mesh(cylGeo(0.5, 0.5, 0.6, 10), solid(0x3a3a3e, { roughness: 0.6 }), 0, 8.3, 0);
  g.add(head);
  const lens = flatMesh(boxGeo(0.55, 0.34, 0.2), unlit(0xffd75e), 0, 0, 0.3);
  head.add(lens);
  const lensB = flatMesh(boxGeo(0.55, 0.34, 0.2), unlit(0x3fe07a), 0, 0, -0.3);
  head.add(lensB);
  return { group: g, head };
}

/* ------------------------------------------------------------------ */

export function buildAirfield(scene, { terrain } = {}) {
  const root = group('whispering-pines');
  root.position.y = 0;
  scene.add(root);

  const colliders = [];
  const floorZones = [];
  const rand = rng(0x5eef);
  const addCollider = (x, z, halfX, halfZ, top = 4) => {
    const box = new THREE.Box3(
      new THREE.Vector3(x - halfX, ELEV - 1, z - halfZ),
      new THREE.Vector3(x + halfX, ELEV + top, z + halfZ),
    );
    colliders.push(box);
    return box;
  };

  /* ---- Runway, taxiway, apron ---- */
  const asphalt = mat({ map: runwayTexture(), roughness: 0.94 });
  const runway = flatMesh(planeGeo(WP.rwyWidth * 2, WP.rwyHalf * 2), asphalt, WP.x, ELEV + 0.04, WP.z);
  runway.rotation.x = -Math.PI / 2;
  root.add(runway);

  /* The county never repaired the real runway lights. For the dusk return,
   * locals lay out battery lamps along both edges; one instanced mesh keeps the
   * whole readable runway to a single draw call. */
  const runwayLightGeo = new THREE.SphereGeometry(0.16, 6, 4);
  const runwayLightMat = unlit(0xfff1b8);
  const runwayLights = new THREE.InstancedMesh(runwayLightGeo, runwayLightMat, 24);
  runwayLights.name = 'runway-36-edge-lights';
  runwayLights.visible = false;
  const lightDummy = new THREE.Object3D();
  let runwayLightIndex = 0;
  for (const z of [-405, -330, -255, -180, -105, 0, 105, 180, 255, 330, 405, 425]) {
    for (const x of [-WP.rwyWidth, WP.rwyWidth]) {
      lightDummy.position.set(x, ELEV + 0.22, z);
      lightDummy.updateMatrix();
      runwayLights.setMatrixAt(runwayLightIndex++, lightDummy.matrix);
    }
  }
  runwayLights.instanceMatrix.needsUpdate = true;
  runwayLights.frustumCulled = true;
  root.add(runwayLights);

  const apronMat = solid(0x4a4a4c, { roughness: 0.96 });
  const apron = flatMesh(planeGeo(34, 52), apronMat, -52, ELEV + 0.035, 396);
  apron.rotation.x = -Math.PI / 2;
  root.add(apron);
  const taxiway = flatMesh(planeGeo(38, 13), apronMat, -34, ELEV + 0.035, 396);
  taxiway.rotation.x = -Math.PI / 2;
  root.add(taxiway);

  /* The departure route has to read from the left seat without a map: a faded
   * yellow centreline leaves the parking spot, turns through the taxiway, and
   * ends at two hold-short bars before runway 18. The HUD arrow points to the
   * same hold point, so the physical world and the mission objective agree. */
  const taxiPaint = unlit(0xe2bd3c, { transparent: true, opacity: 0.88 });
  const taxiStripe = (name, x, z, width, length) => {
    const stripe = flatMesh(planeGeo(width, length), taxiPaint, x, ELEV + 0.065, z);
    stripe.name = name;
    stripe.rotation.x = -Math.PI / 2;
    root.add(stripe);
  };
  // Parking -> apron -> taxiway -> hold short on the west side of the runway.
  taxiStripe('taxi-route-parking', -44.5, 385, 21, 0.16);
  taxiStripe('taxi-route-turn', -34, 390.5, 0.16, 11);
  taxiStripe('taxi-route-apron', -24.5, 396, 19, 0.16);
  // The double bars that say the briefing is over and the runway begins.
  taxiStripe('taxi-route-hold-short-a', -14.25, 396, 0.22, 12.5);
  taxiStripe('taxi-route-hold-short-b', -13.75, 396, 0.22, 12.5);

  floorZones.push({
    box: new THREE.Box3(new THREE.Vector3(-70, 0, 368), new THREE.Vector3(-12, 10, 424)),
    surface: 'tile',
  });

  // Threshold markings at the north end, worn to almost nothing.
  for (let i = 0; i < 6; i++) {
    const bar = flatMesh(planeGeo(1.6, 16), mat({ color: 0xc9c4b0, roughness: 0.9, transparent: true, opacity: 0.35 }), -7 + i * 2.8, ELEV + 0.05, 418);
    bar.rotation.x = -Math.PI / 2;
    root.add(bar);
  }

  /* ---- Buildings ---- */
  const hangar = makeHangar();
  hangar.position.set(-60, ELEV, 404);
  hangar.rotation.y = Math.PI;
  root.add(hangar);
  /* Two piers, not one block: the hangar's door is a 10 m hole in the south
   * wall and a single footprint collider bricks it up, so the player cannot
   * walk into the building the mission sends them into. */
  addCollider(-68, 404, 3, 8, 7);
  addCollider(-52, 404, 3, 8, 7);
  // The piers stop 10 m apart, but the back wall behind the opening is solid —
  // without this band the player walks out through the north wall at z 412.
  addCollider(-60, 412, 5, 0.3, 7);

  const shack = makeOpsShack();
  shack.position.set(-38, ELEV, 366);
  shack.rotation.y = -0.3;
  root.add(shack);
  addCollider(-38, 366, 3.6, 2.6, 3.4);

  const vending = makeVendingMachine();
  vending.position.set(-34.6, ELEV, 369.2);
  vending.rotation.y = -0.3;
  root.add(vending);
  addCollider(-34.6, 369.2, 0.6, 0.5, 2.1);

  const tank = makeFuelTank();
  tank.position.set(-72, ELEV, 372);
  tank.rotation.y = 0.4;
  root.add(tank);
  addCollider(-72, 372, 3.6, 2, 4);

  const beacon = makeBeacon();
  beacon.group.position.set(-46, ELEV, 418);
  root.add(beacon.group);
  addCollider(-46, 418, 0.4, 0.4, 8.6);

  const windsock = makeWindsock();
  windsock.group.position.set(-18, ELEV, 424);
  root.add(windsock.group);
  addCollider(-18, 424, 0.3, 0.3, 5.5);

  const truck = makePickup();
  truck.group.position.set(-44, ELEV, 356);
  truck.group.rotation.y = 1.1;
  root.add(truck.group);
  // Held on to, because the truck is driven away at dusk and the collider has
  // to go with it rather than stay parked on the apron as an invisible wall.
  const truckCollider = addCollider(-44, 356, 2.6, 2.6, 2.4);

  for (let i = 0; i < 2; i++) {
    const wreck = makeWreck(0x1000 + i * 77);
    wreck.position.set(-84 - i * 6, ELEV, 344 - i * 16);
    root.add(wreck);
    addCollider(-84 - i * 6, 344 - i * 16, 4, 4, 3);
  }

  /* ---- The three signs ---- */
  const signPost = group('signs');
  const main = signBoard(['WHISPERING PINES', 'MUNICIPAL'], 6.4, 1.8, { w: 640, h: 200, bg: '#c9b78d' });
  main.position.y = 3.2;
  signPost.add(main);
  const night = signBoard(['NO NIGHT OPERATIONS'], 5.0, 0.9, { w: 512, h: 96, bg: '#b8a87c' });
  night.position.y = 2.0;
  signPost.add(night);
  const seriously = signBoard(['SERIOUSLY'], 2.6, 0.7, { w: 256, h: 80, bg: '#e0d6bc', fg: '#8a2020', border: null, tilt: 0.05 });
  seriously.position.set(-0.6, 1.25, 0.02);
  seriously.rotation.z = -0.06;
  signPost.add(seriously);
  for (const sx of [-3, 3]) {
    signPost.add(mesh(boxGeo(0.24, 4.2, 0.24), solid(0x6b5432, { roughness: 1 }), sx, 2.1, 0));
  }
  signPost.position.set(-96, ELEV, 352);
  signPost.rotation.y = 1.35;
  root.add(signPost);
  // One slim collider per post — a box across the whole board would be a wall
  // of air either side of the sign, and the entrance road runs past it.
  for (const sx of [-3, 3]) {
    addCollider(-96 + sx * Math.cos(1.35), 352 - sx * Math.sin(1.35), 0.3, 0.3, 4.2);
  }

  /* ---- Ground detail ---- */
  // Oil stains where aeroplanes have stood, and where one still does.
  for (let i = 0; i < 9; i++) {
    const stain = flatMesh(
      new THREE.CircleGeometry(0.5 + rand() * 1.4, 10),
      mat({ color: 0x1a1712, roughness: 1, transparent: true, opacity: 0.35 + rand() * 0.25 }),
      -66 + rand() * 30, ELEV + 0.05, 376 + rand() * 40,
    );
    stain.rotation.x = -Math.PI / 2;
    stain.scale.y = 0.6 + rand() * 0.6;
    root.add(stain);
  }
  // Grass through the cracks, along the runway edges.
  const tuft = new THREE.InstancedMesh(
    boxGeo(0.06, 0.4, 0.06),
    solid(0x5c7a3a, { roughness: 1 }),
    260,
  );
  tuft.castShadow = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const edge = rand() < 0.5 ? -1 : 1;
    dummy.position.set(
      edge * (WP.rwyWidth - rand() * 1.6),
      ELEV + 0.18,
      (rand() - 0.5) * WP.rwyHalf * 2,
    );
    dummy.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
    dummy.scale.setScalar(0.6 + rand() * 0.9);
    dummy.updateMatrix();
    tuft.setMatrixAt(i, dummy.matrix);
  }
  root.add(tuft);

  // Empty jerky wrappers near the office. Somebody has been at these for years.
  const wrappers = [];
  for (let i = 0; i < 11; i++) {
    const w = flatMesh(
      planeGeo(0.22, 0.16),
      mat({ color: [0x8a2f2f, 0x2f4a8a, 0xc0a040][i % 3], roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide }),
      -36 + (rand() - 0.5) * 9, ELEV + 0.06, 364 + (rand() - 0.5) * 8,
    );
    w.rotation.set(-Math.PI / 2 + (rand() - 0.5) * 0.4, rand() * 3, 0);
    root.add(w);
    wrappers.push(w);
  }

  // Loose tarps over something nobody remembers.
  const tarps = [];
  for (let i = 0; i < 2; i++) {
    const tarp = mesh(boxGeo(3.4, 1.2, 2.6), solid(0x4a5f7a, { roughness: 1 }), -68 + i * 5, ELEV + 0.6, 410 - i * 6);
    tarp.rotation.y = rand();
    root.add(tarp);
    const corner = mesh(boxGeo(1.2, 0.06, 0.9), solid(0x4a5f7a, { roughness: 1 }), 1.6, 0.5, 1.0);
    tarp.add(corner);
    tarps.push({ mesh: corner, phase: rand() * 6 });
  }

  /* ---- Wildlife ---- */
  /* Crows sit on the roof, so they follow it: the pitch runs from the eaves at
   * hangar-local x = +-halfW up to the ridge at x = 0, and the hangar is yawed
   * PI so its local x is the negated world offset. */
  const crows = [];
  for (let i = 0; i < 4; i++) {
    const x = -66 + i * 4;
    const t = Math.min(1, Math.abs(x + 60) / hangar.userData.halfW);
    const y = ELEV + hangar.userData.ridgeY
      - (hangar.userData.ridgeY - hangar.userData.eaveY) * t + 0.07;
    const c = makeCrow(x, y, 404 + (rand() - 0.5) * 4);
    root.add(c.group);
    crows.push(c);
  }
  // Clear of the fuel tank's collider and of the west cradle it used to be
  // buried 0.32 m inside; still in the shade, which is the whole point of it.
  const dog = makeDog(-67.5, 371);
  root.add(dog.group);

  /* ---- Insects: a haze of specks that only exists near the shack ---- */
  const bugGeo = new THREE.BufferGeometry();
  const bugCount = 60;
  const bugPos = new Float32Array(bugCount * 3);
  for (let i = 0; i < bugCount; i++) {
    bugPos[i * 3] = -38 + (rand() - 0.5) * 10;
    bugPos[i * 3 + 1] = ELEV + 1 + rand() * 1.6;
    bugPos[i * 3 + 2] = 366 + (rand() - 0.5) * 10;
  }
  bugGeo.setAttribute('position', new THREE.BufferAttribute(bugPos, 3));
  // Each bug's tether point: the per-frame jitter stays inside a small radius
  // of home, so hours of it cannot walk the swarm across the apron.
  const bugHome = bugPos.slice();
  // The dusk fade writes opacity every frame; an opaque material ignores it.
  const bugs = new THREE.Points(bugGeo, new THREE.PointsMaterial({ color: 0x2a2418, size: 0.06, sizeAttenuation: true, transparent: true }));
  root.add(bugs);

  /* ---- Anchors the mission cares about ---- */
  const anchors = {
    playerStart: new THREE.Vector3(-88, ELEV, 350),
    /* Nose east, so the wing runs north–south. The hangar's front wall is the
     * plane z = 396 and the span is 17.2 m: parked at z 388 the north wingtip
     * reached 396.6 and stood inside the wall. At 385 it stops at 393.6,
     * eight feet clear, and the tail still clears Stove's crates. */
    parking: new THREE.Vector3(-55, ELEV, 385),
    parkingHeading: 90,
    // Clear of the wing and facing the road. Captain Sasole needs to read as
    // someone waiting to brief Tony, not a figure clipped into the aircraft.
    louStand: new THREE.Vector3(-52.4, ELEV, 380.3),
    holdShort: new THREE.Vector3(-16, ELEV, 396),
    lineUp: new THREE.Vector3(WP.x, ELEV, 400),
    departHeading: 180,
    truck: truck.group.position.clone(),
    hangarDoor: new THREE.Vector3(-60, ELEV, 394),
    /* Old Stove starts inside the hangar — in the shade, framed by the door
     * opening (x -65..-55), officially not present — and walks out to
     * stoveStand near the end of the preflight to wait beside his crates. */
    stoveHangar: new THREE.Vector3(-62, ELEV, 401),
    /* Close enough for Stove, Sasole and the player to read as one handoff,
     * but south of the tailplane rather than inside it. The old (-64, 386)
     * stop left him 12.9 m from Sasole, across the aircraft with no shared
     * stage picture. */
    stoveStand: new THREE.Vector3(-60.5, ELEV, 379.5),
    stoveCrates: new THREE.Vector3(-62, ELEV, 382),
    stoveCart: new THREE.Vector3(-58, ELEV, 380),
  };

  /* There used to be a `bounds` box here, offered as a soft fence around the
   * field. Nothing ever read it, and nothing should: the mission walks the
   * player around El Hueso as well, 10 km down-route, so a fence drawn around
   * Whispering Pines would either do nothing or trap them at the other end.
   * The colliders above are the only thing holding the player in. */

  const state = { t: 0, dusk: 0, truckLights: false };

  return {
    root, colliders, floorZones, anchors,
    truck, windsock, beacon, crows, dog, tarps, wrappers, bugs,
    elevation: ELEV,

    /** Sunset arrival: the beacon matters now, and so do the headlights. */
    setDusk(t) { state.dusk = clamp(t, 0, 1); },
    setTruckLights(on) {
      state.truckLights = on;
      for (const l of truck.lights) l.material = unlit(on ? 0xfff0c8 : 0x2a2a24);
      truck.beam.intensity = on ? 260 : 0;
      runwayLights.visible = on;
    },
    /** Drive the truck round to light the threshold. */
    moveTruckToThreshold() {
      truck.group.position.set(-26, ELEV, -420);
      // Nose east and a little down-field, so the beam actually crosses the
      // threshold. Pointed the other way it lit the trees behind the truck.
      truck.group.rotation.y = Math.PI / 2 + 0.25;
      // The collider is a separate box in world space; drive it round too, or
      // the player walks into a pickup that is no longer there.
      truckCollider.min.set(-26 - 2.6, ELEV - 1, -420 - 2.6);
      truckCollider.max.set(-26 + 2.6, ELEV + 2.4, -420 + 2.6);
      this.setTruckLights(true);
    },

    update(dt, wind = 0.4, windDir = 0) {
      state.t += dt;
      // Windsock: it swings with the wind and never quite settles.
      windsock.pivot.rotation.y = damp(windsock.pivot.rotation.y, windDir + Math.sin(state.t * 0.7) * 0.14, 1.2, dt);
      const droop = clamp(1 - wind, 0, 1);
      windsock.sock.rotation.z = Math.PI / 2 - droop * 0.5;
      // Beacon turns whether or not it is dark.
      beacon.head.rotation.y += dt * 2.4;
      for (const t of tarps) {
        t.mesh.rotation.x = Math.sin(state.t * 1.6 + t.phase) * 0.14 * (0.4 + wind);
      }
      // Bugs jitter in place, tethered to bugHome.
      const arr = bugs.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = clamp(arr[i] + (Math.random() - 0.5) * 0.03, bugHome[i] - 0.4, bugHome[i] + 0.4);
        arr[i + 1] = clamp(arr[i + 1] + (Math.random() - 0.5) * 0.02, bugHome[i + 1] - 0.25, bugHome[i + 1] + 0.25);
        arr[i + 2] = clamp(arr[i + 2] + (Math.random() - 0.5) * 0.03, bugHome[i + 2] - 0.4, bugHome[i + 2] + 0.4);
      }
      bugs.geometry.attributes.position.needsUpdate = true;
      bugs.material.opacity = 1 - state.dusk * 0.8;
    },
  };
}

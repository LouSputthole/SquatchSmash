import * as THREE from 'three';

import { EVIDENCE_IDS } from './mission.js';

export const PALACE_ANCHORS = Object.freeze({
  approach: Object.freeze(new THREE.Vector3(14, 0, 76)),
  powerBox: Object.freeze(new THREE.Vector3(19.2, 1.15, 61.2)),
  perimeter: Object.freeze(new THREE.Vector3(14, 0, 51)),
  estate: Object.freeze(new THREE.Vector3(12.5, 0, 4)),
  belongings: Object.freeze(new THREE.Vector3(4.7, 0.72, -6.4)),
  paymentLedger: Object.freeze(new THREE.Vector3(-10.6, 0.88, -6.8)),
  securityStill: Object.freeze(new THREE.Vector3(14.9, 1.22, -10.2)),
  gallery: Object.freeze(new THREE.Vector3(0, 0, -25)),
  diningRoom: Object.freeze(new THREE.Vector3(0, 0, -42)),
  mark: Object.freeze(new THREE.Vector3(-3.2, 0, -40.8)),
  sauce: Object.freeze(new THREE.Vector3(3.2, 0, -40.8)),
  extraction: Object.freeze(new THREE.Vector3(0, 0, -55)),
});

const M = Object.freeze({
  stucco: new THREE.MeshStandardMaterial({ color: 0xc4aa82, roughness: 0.92 }),
  stuccoDark: new THREE.MeshStandardMaterial({ color: 0x8f7454, roughness: 0.96 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x665342, roughness: 0.94 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0x9a8061, roughness: 0.88 }),
  tile: new THREE.MeshStandardMaterial({ color: 0x6f2e25, roughness: 0.88 }),
  tileDark: new THREE.MeshStandardMaterial({ color: 0x351c1a, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3c2115, roughness: 0.82 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0x6e4227, roughness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc79b49, roughness: 0.32, metalness: 0.76 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x16191b, roughness: 0.56, metalness: 0.58 }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xe1d2b4, roughness: 0.91 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x665044, roughness: 0.78 }),
  floorAccent: new THREE.MeshStandardMaterial({ color: 0xb38b57, roughness: 0.74 }),
  textile: new THREE.MeshStandardMaterial({ color: 0x5a1718, roughness: 0.98 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xe6d9b7, roughness: 1 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x241e19, roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.95 }),
  red: new THREE.MeshStandardMaterial({ color: 0x6a1718, roughness: 0.86 }),
  green: new THREE.MeshStandardMaterial({ color: 0x213c2d, roughness: 0.96 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x1d3929, roughness: 0.99 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x164a59, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.82,
  }),
  screen: new THREE.MeshStandardMaterial({
    color: 0x122329, emissive: 0x5c9aa3, emissiveIntensity: 0.9, roughness: 0.38,
  }),
  lampWarm: new THREE.MeshBasicMaterial({ color: 0xffd69a }),
  lampCool: new THREE.MeshBasicMaterial({ color: 0x94dce5 }),
  blackout: new THREE.MeshBasicMaterial({ color: 0x080909 }),
});

function box(size, position, material, name = '', { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.fromArray(position);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function cylinder(radius, height, position, material, name = '', segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.fromArray(position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addCollider(colliders, center, size, name = '') {
  const c = new THREE.Vector3(...center);
  const half = new THREE.Vector3(...size).multiplyScalar(0.5);
  const collider = new THREE.Box3(c.clone().sub(half), c.clone().add(half));
  collider.name = name;
  colliders.push(collider);
  return collider;
}

function solid(parent, colliders, size, position, material, name = '') {
  const mesh = box(size, position, material, name);
  parent.add(mesh);
  const collider = addCollider(colliders, position, size, name);
  mesh.userData.collider = collider;
  return mesh;
}

function removeCollider(colliders, collider) {
  const index = colliders.indexOf(collider);
  if (index >= 0) colliders.splice(index, 1);
}

function arch(parent, x, z, width = 3.2, height = 3.8, depth = 0.5) {
  parent.add(
    box([0.44, height, depth], [x - width / 2, height / 2, z], M.stoneLight, 'carved-arch-pillar'),
    box([0.44, height, depth], [x + width / 2, height / 2, z], M.stoneLight, 'carved-arch-pillar'),
  );
  const curve = new THREE.Mesh(
    new THREE.TorusGeometry(width / 2, 0.22, 8, 28, Math.PI),
    M.stoneLight,
  );
  curve.name = 'carved-arch-crown';
  curve.position.set(x, height - 0.05, z);
  curve.rotation.z = Math.PI;
  curve.castShadow = true;
  parent.add(curve);
}

function tiledRoof(parent, x, z, width, depth, y = 5.15) {
  for (const side of [-1, 1]) {
    const roof = box([width / 2 + 0.55, 0.18, depth + 0.85], [x + side * width / 4, y, z], M.tile, 'clay-tile-roof');
    roof.rotation.z = side * 0.19;
    parent.add(roof);
  }
  for (let rz = z - depth / 2; rz <= z + depth / 2; rz += 0.72) {
    const ridge = cylinder(0.07, width + 0.9, [x, y + 0.13, rz], M.tileDark, 'roof-tile-ridge', 8);
    ridge.rotation.z = Math.PI / 2;
    parent.add(ridge);
  }
}

function ironGate(width, height, name) {
  const gate = new THREE.Group();
  gate.name = name;
  for (let x = -width / 2; x <= width / 2; x += 0.34) {
    gate.add(box([0.055, height, 0.08], [x, height / 2, 0], M.iron, `${name}.bar`));
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 4), M.iron);
    point.position.set(x, height + 0.12, 0);
    gate.add(point);
  }
  gate.add(
    box([width + 0.15, 0.11, 0.1], [0, 0.55, 0], M.iron),
    box([width + 0.15, 0.11, 0.1], [0, height - 0.35, 0], M.iron),
  );
  return gate;
}

function palm(parent, x, z, scale = 1) {
  const trunk = cylinder(0.18 * scale, 4.8 * scale, [x, 2.4 * scale, z], M.woodLight, 'date-palm', 9);
  trunk.rotation.z = (Math.sin(x * 2.1 + z) * 0.05);
  parent.add(trunk);
  for (let i = 0; i < 9; i++) {
    const frond = box([0.12 * scale, 0.045, 2.7 * scale], [x, 4.7 * scale, z], M.leaf, 'palm-frond');
    frond.rotation.y = (i / 9) * Math.PI * 2;
    frond.rotation.x = 0.25;
    frond.translateZ(1.1 * scale);
    parent.add(frond);
  }
}

function cypress(parent, x, z, height = 4.2) {
  const shrub = new THREE.Mesh(new THREE.ConeGeometry(0.72, height, 10), M.leaf);
  shrub.name = 'cypress';
  shrub.position.set(x, height / 2, z);
  shrub.castShadow = true;
  parent.add(shrub);
}

function vehicle(parent, x, z, yaw = 0, color = 0x16191e) {
  const car = new THREE.Group();
  car.name = 'cartel-suv';
  car.position.set(x, 0.42, z);
  car.rotation.y = yaw;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.36 });
  car.add(
    box([2.05, 0.72, 4.7], [0, 0.42, 0], bodyMat, 'suv-body'),
    box([1.82, 0.72, 2.35], [0, 1.02, -0.18], M.iron, 'suv-cabin'),
    box([1.68, 0.5, 0.035], [0, 1.1, 1.02], M.screen, 'suv-windshield'),
  );
  for (const sx of [-0.92, 0.92]) for (const sz of [-1.55, 1.55]) {
    const wheel = cylinder(0.36, 0.23, [sx, 0.2, sz], M.blackout, 'suv-wheel', 12);
    wheel.rotation.z = Math.PI / 2;
    car.add(wheel);
  }
  parent.add(car);
  return car;
}

function framedPortrait(parent, x, y, z, { scale = 1, facing = 'z' } = {}) {
  const portrait = new THREE.Group();
  portrait.name = 'mark-family-portrait';
  const frame = box([2.2 * scale, 2.7 * scale, 0.12], [0, 0, 0], M.brass, 'portrait-frame');
  const field = box([1.94 * scale, 2.44 * scale, 0.14], [0, 0, 0.04], M.red, 'portrait-field');
  portrait.add(frame, field);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36 * scale, 14, 10), M.stoneLight);
  head.position.set(0, 0.36 * scale, 0.17);
  const torso = box([0.88 * scale, 0.85 * scale, 0.18], [0, -0.47 * scale, 0.15], M.ink, 'portrait-mark');
  portrait.add(head, torso);
  // Mark's initial appears throughout the building before Mark does.
  const slashA = box([0.12, 0.62, 0.08], [-0.18, 0.94 * scale, 0.19], M.brass, 'mark-monogram');
  const slashB = slashA.clone();
  slashA.rotation.z = -0.45;
  slashB.position.x = 0.18;
  slashB.rotation.z = 0.45;
  portrait.add(slashA, slashB);
  portrait.position.set(x, y, z);
  if (facing === 'x') portrait.rotation.y = Math.PI / 2;
  parent.add(portrait);
  return portrait;
}

function table(parent, colliders, x, z, width, depth, name = 'table') {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, 0, z);
  g.add(box([width, 0.12, depth], [0, 0.82, 0], M.woodLight, `${name}.top`));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box([0.12, 0.8, 0.12], [sx * (width / 2 - 0.16), 0.4, sz * (depth / 2 - 0.16)], M.wood, `${name}.leg`));
  }
  parent.add(g);
  addCollider(colliders, [x, 0.48, z], [width, 0.96, depth], name);
  return g;
}

function evidenceBelongings(parent, colliders) {
  const at = PALACE_ANCHORS.belongings;
  const bench = table(parent, colliders, at.x, at.z, 2.2, 0.8, 'guest-suite-luggage-bench');
  const target = box([1.15, 0.28, 0.62], [0, 1.05, 0], M.wood, 'evidence.sauce-belongings');
  target.userData.evidenceId = EVIDENCE_IDS.BELONGINGS;
  target.userData.evidenceTitle = 'Sauce\'s open suitcase';
  target.userData.evidenceDetail = 'Chef whites, his passport, and three nights of folded clothes. Nobody packed this man in a hurry.';
  bench.add(target);
  const coat = box([0.72, 0.035, 0.44], [0, 1.21, 0], M.white, 'sauce-chef-whites');
  bench.add(coat);
  const passport = box([0.18, 0.035, 0.26], [0.25, 1.25, 0.08], M.red, 'sauce-passport');
  bench.add(passport);
  return target;
}

function evidenceLedger(parent, colliders) {
  const at = PALACE_ANCHORS.paymentLedger;
  const desk = table(parent, colliders, at.x, at.z, 2.6, 1.2, 'mark-office-desk');
  const target = box([0.62, 0.09, 0.78], [0, 0.94, 0], M.paper, 'evidence.payment-ledger');
  target.rotation.y = -0.18;
  target.userData.evidenceId = EVIDENCE_IDS.PAYMENT_LEDGER;
  target.userData.evidenceTitle = 'Mark\'s payment ledger';
  target.userData.evidenceDetail = 'Sauce is listed as a consultant. The first payment predates the attack on Lou\'s house.';
  desk.add(target);
  for (let i = 0; i < 7; i++) {
    target.add(box([0.46, 0.008, 0.018], [0, 0.052, -0.24 + i * 0.075], M.ink, 'ledger-entry', { cast: false }));
  }
  return target;
}

function evidenceSecurityStill(parent, colliders) {
  const at = PALACE_ANCHORS.securityStill;
  const consoleTable = table(parent, colliders, at.x, at.z + 0.7, 3.1, 0.72, 'security-console');
  const target = box([1.35, 0.86, 0.09], [0, 1.25, -0.34], M.screen, 'evidence.security-still');
  target.userData.evidenceId = EVIDENCE_IDS.SECURITY_STILL;
  target.userData.evidenceTitle = 'Security still: Sauce at the gate';
  target.userData.evidenceDetail = 'No restraints. No escort. Sauce keys himself in, carrying a bottle for Mark.';
  consoleTable.add(target);
  const silhouette = box([0.32, 0.52, 0.025], [0.18, 1.22, -0.4], M.white, 'security-still-sauce', { cast: false });
  consoleTable.add(silhouette);
  return target;
}

/**
 * Build Mark's walled estate as its own map. It deliberately shares no Lou
 * mansion builder or palette: stucco, carved stone, clay tile, courtyards,
 * water, service rooms, and a long dining axis define this compound.
 */
export function buildCartelPalace(scene) {
  const root = new THREE.Group();
  root.name = 'cartel-palace.compound';
  scene.add(root);
  const colliders = [];

  const earth = new THREE.Mesh(new THREE.PlaneGeometry(150, 190), new THREE.MeshStandardMaterial({
    color: 0x171b17, roughness: 1,
  }));
  earth.name = 'palace-surrounding-land';
  earth.rotation.x = -Math.PI / 2;
  earth.position.set(0, -0.025, 10);
  earth.receiveShadow = true;
  root.add(earth);

  // Dirt approach and tire ruts stop the player materializing at a front door.
  root.add(box([7.8, 0.05, 36], [14, 0.015, 74], M.stone, 'dirt-service-road', { cast: false }));
  for (const x of [12.5, 15.5]) root.add(box([0.34, 0.018, 34], [x, 0.045, 74], M.ink, 'tire-rut', { cast: false }));

  const perimeter = new THREE.Group();
  perimeter.name = 'palace-perimeter';
  root.add(perimeter);
  solid(perimeter, colliders, [0.7, 4.6, 112], [-22, 2.3, 3], M.stuccoDark, 'west-compound-wall');
  solid(perimeter, colliders, [0.7, 4.6, 112], [22, 2.3, 3], M.stuccoDark, 'east-compound-wall');
  solid(perimeter, colliders, [19.2, 4.6, 0.7], [-12.75, 2.3, -53], M.stuccoDark, 'rear-compound-wall-west');
  solid(perimeter, colliders, [19.2, 4.6, 0.7], [12.75, 2.3, -53], M.stuccoDark, 'rear-compound-wall-east');
  solid(perimeter, colliders, [33.3, 4.6, 0.7], [-5.35, 2.3, 59], M.stuccoDark, 'front-compound-wall-west');
  solid(perimeter, colliders, [5.2, 4.6, 0.7], [19.4, 2.3, 59], M.stuccoDark, 'front-compound-wall-east');
  for (const x of [-22, -11, 0, 10.8, 17.2, 22]) {
    perimeter.add(box([1.15, 5.15, 1.15], [x, 2.58, 59], M.stoneLight, 'perimeter-pier'));
  }

  const serviceGate = ironGate(6.0, 3.8, 'service-gate');
  serviceGate.position.set(14, 0, 58.9);
  serviceGate.userData.closedRotation = 0;
  root.add(serviceGate);
  const serviceGateCollider = addCollider(colliders, [14, 2, 58.9], [6.1, 4.0, 0.3], 'service-gate');

  const powerBox = new THREE.Group();
  powerBox.name = 'service-power-box';
  powerBox.position.copy(PALACE_ANCHORS.powerBox);
  const cabinet = box([0.72, 1.05, 0.26], [0, 0, 0], M.iron, 'power-cabinet');
  cabinet.userData.actionTarget = 'power';
  powerBox.add(cabinet);
  const powerLight = box([0.1, 0.1, 0.03], [0.2, 0.28, -0.15], M.screen, 'power-status', { cast: false });
  powerBox.add(powerLight);
  root.add(powerBox);

  // Separate guard housing and vehicle yard make the compound read as defended.
  const guardhouse = new THREE.Group();
  guardhouse.name = 'guard-housing';
  guardhouse.position.set(15, 0, 48);
  root.add(guardhouse);
  solid(guardhouse, colliders, [9, 3.7, 11], [0, 1.85, 0], M.stucco, 'guardhouse-shell');
  guardhouse.add(box([8.5, 0.26, 11.6], [0, 4.0, 0], M.tile, 'guardhouse-tile-roof'));
  // Door-sized visual recess on the west face.
  guardhouse.add(box([0.1, 2.4, 1.25], [-4.56, 1.2, 1.7], M.wood, 'guardhouse-door'));
  vehicle(root, -15, 50, Math.PI / 2, 0x0f1316);
  vehicle(root, -9.5, 50, Math.PI / 2, 0x282318);
  addCollider(colliders, [-15, 0.8, 50], [4.8, 1.6, 2.2], 'cartel-suv-one');
  addCollider(colliders, [-9.5, 0.8, 50], [4.8, 1.6, 2.2], 'cartel-suv-two');

  // Courtyard: tile axis, fountain, pool and vegetation instead of Lou's lawns.
  root.add(box([7.2, 0.08, 48], [0, 0.02, 34], M.floorAccent, 'courtyard-processional-tile', { cast: false }));
  root.add(box([42, 0.07, 41], [0, 0.01, 33], M.floor, 'courtyard-paving', { cast: false }));
  const fountain = cylinder(3.1, 0.52, [0, 0.26, 35], M.stoneLight, 'courtyard-fountain', 28);
  root.add(fountain);
  const fountainWater = cylinder(2.7, 0.04, [0, 0.54, 35], M.water, 'courtyard-fountain-water', 28);
  root.add(fountainWater);
  const pool = box([11, 0.12, 7], [-11, 0.02, 19], M.water, 'reflecting-pool', { cast: false });
  root.add(pool);
  root.add(box([12, 0.3, 8], [-11, -0.12, 19], M.stoneLight, 'pool-coping'));
  // Re-add a visible water plane slightly above the coping top.
  pool.position.y = 0.08;
  for (const [x, z] of [[-18, 54], [-18, 32], [18, 31], [-18, 8], [18, 8]]) palm(root, x, z, 0.9);
  for (const x of [-16, -13, 13, 16]) cypress(root, x, 10, 4.6);

  // Estate exterior and roof. The interior shell is built from segments so
  // the service and dining doors are real openings, not visual decals.
  const estate = new THREE.Group();
  estate.name = 'mark-estate';
  root.add(estate);
  estate.add(box([36, 0.14, 62], [0, 0.01, -19], M.floor, 'estate-tile-floor', { cast: false }));
  // Front, service doorway between x 11.5 and 15.5.
  solid(estate, colliders, [29.5, 4.8, 0.5], [-3.25, 2.4, 12], M.stucco, 'estate-front-west');
  solid(estate, colliders, [2.5, 4.8, 0.5], [16.75, 2.4, 12], M.stucco, 'estate-front-east');
  solid(estate, colliders, [0.5, 4.8, 62], [-18, 2.4, -19], M.stucco, 'estate-west-wall');
  solid(estate, colliders, [0.5, 4.8, 62], [18, 2.4, -19], M.stucco, 'estate-east-wall');
  solid(estate, colliders, [14.8, 4.8, 0.5], [-10.6, 2.4, -50], M.stucco, 'estate-rear-wall-west');
  solid(estate, colliders, [14.8, 4.8, 0.5], [10.6, 2.4, -50], M.stucco, 'estate-rear-wall-east');
  arch(estate, 13.5, 11.68, 3.6, 3.6, 0.5);
  tiledRoof(estate, 0, -19, 38, 64, 5.35);

  const estateDoor = box([3.4, 3.45, 0.22], [13.5, 1.73, 11.7], M.wood, 'estate-service-door');
  estate.add(estateDoor);
  const estateDoorCollider = addCollider(colliders, [13.5, 1.73, 11.7], [3.4, 3.45, 0.35], 'estate-service-door');

  // Rooms and a continuous service corridor along the east edge.
  solid(estate, colliders, [0.35, 4.2, 20], [10.5, 2.1, 2], M.plaster, 'guest-service-partition');
  solid(estate, colliders, [0.35, 4.2, 7.5], [10.5, 2.1, -18.25], M.plaster, 'security-service-partition');
  solid(estate, colliders, [0.35, 4.2, 8.5], [10.5, 2.1, -30.75], M.plaster, 'gallery-service-partition');
  // West office / guest split with wide door gaps.
  solid(estate, colliders, [8.2, 4.2, 0.35], [-13.9, 2.1, 1.5], M.plaster, 'office-north-partition');
  solid(estate, colliders, [18.4, 4.2, 0.35], [1.3, 2.1, 1.5], M.plaster, 'guest-north-partition');
  solid(estate, colliders, [7.8, 4.2, 0.35], [-14.1, 2.1, -15], M.plaster, 'office-south-partition');
  solid(estate, colliders, [18.2, 4.2, 0.35], [1.4, 2.1, -15], M.plaster, 'guest-south-partition');
  // Gallery to dining partition, with a locked double door in the middle.
  solid(estate, colliders, [14.7, 4.3, 0.42], [-10.65, 2.15, -34.2], M.plaster, 'dining-partition-west');
  solid(estate, colliders, [14.7, 4.3, 0.42], [10.65, 2.15, -34.2], M.plaster, 'dining-partition-east');
  const diningDoors = new THREE.Group();
  diningDoors.name = 'dining-room-double-doors';
  diningDoors.position.set(0, 0, -34.15);
  const diningDoorLeft = box([3.1, 3.45, 0.2], [-1.58, 1.73, 0], M.wood, 'dining-door-left');
  const diningDoorRight = box([3.1, 3.45, 0.2], [1.58, 1.73, 0], M.wood, 'dining-door-right');
  diningDoors.add(diningDoorLeft, diningDoorRight);
  estate.add(diningDoors);
  const diningDoorCollider = addCollider(colliders, [0, 1.73, -34.15], [6.3, 3.45, 0.35], 'dining-room-doors');

  // Mark's authorship is everywhere before his body is: portraits, brass M,
  // family cars, account desk, and the crest over the final doors.
  framedPortrait(estate, -17.66, 2.15, -5.8, { scale: 0.82, facing: 'x' });
  framedPortrait(estate, -17.66, 2.15, -24, { scale: 0.82, facing: 'x' });
  framedPortrait(estate, 0, 2.25, -33.9, { scale: 0.68 });

  const evidence = {
    [EVIDENCE_IDS.BELONGINGS]: evidenceBelongings(estate, colliders),
    [EVIDENCE_IDS.PAYMENT_LEDGER]: evidenceLedger(estate, colliders),
    [EVIDENCE_IDS.SECURITY_STILL]: evidenceSecurityStill(estate, colliders),
  };

  // Office shelves, guest bed and security racks make the clue rooms read as
  // rooms rather than three interaction boxes in a corridor.
  for (let z = -11.5; z <= -2; z += 2.2) {
    solid(estate, colliders, [0.75, 2.2, 1.5], [-16.6, 1.1, z], M.wood, 'mark-office-files');
  }
  solid(estate, colliders, [4.2, 0.68, 2.3], [4.7, 0.34, -11.2], M.wood, 'guest-suite-bed');
  estate.add(box([3.9, 0.16, 2.12], [4.7, 0.76, -11.2], M.white, 'guest-suite-linen'));
  for (let z = -14; z <= -6; z += 2.1) {
    solid(estate, colliders, [1.05, 2.4, 0.7], [16.9, 1.2, z], M.iron, 'security-rack');
  }

  // Portrait gallery and evidence approach.
  for (const side of [-1, 1]) {
    for (let z = -18; z >= -31; z -= 3.5) framedPortrait(estate, side * 9.8, 1.75, z, { scale: 0.46, facing: 'x' });
  }
  const galleryRunner = box([5.2, 0.025, 17], [0, 0.09, -24.5], M.textile, 'portrait-gallery-runner', { cast: false });
  estate.add(galleryRunner);

  // Dining room: one long table, two clear target positions, sideboards and a
  // rear terrace. It is larger than every room before it and ends the axis.
  const finalTable = table(estate, colliders, 0, -42.4, 9.8, 2.2, 'mark-dining-table');
  for (let x = -3.9; x <= 3.9; x += 1.3) {
    finalTable.add(cylinder(0.045, 0.32, [x, 1.06, 0], M.brass, 'dining-candle', 8));
  }
  solid(estate, colliders, [3.8, 1.1, 0.75], [-14.7, 0.55, -43.5], M.wood, 'dining-sideboard-west');
  solid(estate, colliders, [3.8, 1.1, 0.75], [14.7, 0.55, -43.5], M.wood, 'dining-sideboard-east');
  framedPortrait(estate, 0, 2.5, -49.65, { scale: 1.05 });

  const extractionGate = ironGate(5.4, 3.7, 'terrace-extraction-gate');
  extractionGate.position.set(0, 0, -52.6);
  estate.add(extractionGate);
  const extractionCollider = addCollider(colliders, [0, 2, -52.6], [5.5, 4.0, 0.3], 'terrace-extraction-gate');

  // One pool of local lights; the composition root can cap or disable it.
  const lights = [];
  for (const [x, y, z, color, intensity, distance] of [
    [0, 1.1, 35, 0x7ac4d1, 5.2, 15],
    [-11, 0.4, 19, 0x4ea6b8, 4.2, 13],
    [11, 3.1, 58.2, 0xffb66d, 12, 16],
    [17, 3.1, 58.2, 0xffb66d, 12, 16],
    [13.5, 2.7, 9.5, 0xffb66d, 14, 15],
    [14.5, 2.7, 1, 0xffc27a, 13, 14],
    [-10, 2.7, -6, 0xffb66d, 15, 14],
    [5, 2.7, -7, 0xffb66d, 14, 14],
    [15, 2.5, -10, 0x86aeb2, 12, 13],
    [14.5, 2.7, -24, 0x91bcc2, 13, 14],
    [0, 2.9, -25, 0xffa85a, 17, 16],
    [0, 2.9, -36.5, 0xffb16b, 18, 15],
    [0, 2.9, -42, 0xff9c51, 24, 20],
    [-3.2, 3.2, -43, 0xffd6a0, 22, 10],
    [3.2, 3.2, -43, 0xb7d3dc, 20, 10],
  ]) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    root.add(light);
    lights.push(light);

    // The light has a source in the world. Interior fixtures sit against the
    // ceiling; water lights are recessed into the fountain and pool instead
    // of reading as unexplained floating points.
    if (z <= 12 || z >= 55) {
      const fixture = new THREE.Group();
      fixture.name = 'palace-ceiling-practical';
      fixture.position.set(x, 4.18, z);
      fixture.add(
        cylinder(0.2, 0.12, [0, 0, 0], M.brass, 'practical-brass-cap', 10),
        new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 10, 7),
          color === 0x86aeb2 ? M.lampCool : M.lampWarm,
        ),
      );
      fixture.children[1].position.y = -0.14;
      root.add(fixture);
    }
  }

  let serviceGateOpen = false;
  let estateDoorOpen = false;
  let diningOpen = false;
  let extractionOpen = false;

  function openServiceGate() {
    if (serviceGateOpen) return false;
    serviceGateOpen = true;
    serviceGate.rotation.y = Math.PI / 2;
    serviceGate.position.x = 11.1;
    removeCollider(colliders, serviceGateCollider);
    powerLight.material = M.blackout;
    return true;
  }

  function openEstateDoor() {
    if (estateDoorOpen) return false;
    estateDoorOpen = true;
    estateDoor.rotation.y = -Math.PI / 2;
    estateDoor.position.x = 11.9;
    removeCollider(colliders, estateDoorCollider);
    return true;
  }

  function openDiningRoom() {
    if (diningOpen) return false;
    diningOpen = true;
    diningDoorLeft.rotation.y = Math.PI / 2;
    diningDoorRight.rotation.y = -Math.PI / 2;
    diningDoorLeft.position.x = -3.05;
    diningDoorRight.position.x = 3.05;
    removeCollider(colliders, diningDoorCollider);
    return true;
  }

  function openExtraction() {
    if (extractionOpen) return false;
    extractionOpen = true;
    extractionGate.visible = false;
    removeCollider(colliders, extractionCollider);
    return true;
  }

  root.updateMatrixWorld(true);
  return {
    root,
    colliders,
    floorZones: [],
    groundAt: () => 0,
    materialLanguage: 'stucco-stone-clay-tile-courtyard',
    anchors: PALACE_ANCHORS,
    evidence,
    targets: { powerBox: cabinet, estateDoor, diningDoor: diningDoors, extractionGate },
    doors: { openServiceGate, openEstateDoor, openDiningRoom, openExtraction },
    lights,
    state: () => ({ serviceGateOpen, estateDoorOpen, diningOpen, extractionOpen }),
  };
}

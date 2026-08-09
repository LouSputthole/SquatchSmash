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
  ceiling: new THREE.MeshStandardMaterial({ color: 0xddd0b9, roughness: 0.94 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x665044, roughness: 0.78 }),
  floorAccent: new THREE.MeshStandardMaterial({ color: 0xb38b57, roughness: 0.74 }),
  textile: new THREE.MeshStandardMaterial({ color: 0x5a1718, roughness: 0.98 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xe6d9b7, roughness: 1 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x241e19, roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.95 }),
  red: new THREE.MeshStandardMaterial({ color: 0x6a1718, roughness: 0.86 }),
  green: new THREE.MeshStandardMaterial({ color: 0x213c2d, roughness: 0.96 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x1d3929, roughness: 0.99 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xd8eef0, roughness: 0.14, metalness: 0.06, transparent: true, opacity: 0.42,
  }),
  water: new THREE.MeshStandardMaterial({
    color: 0x164a59, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.82,
  }),
  screen: new THREE.MeshStandardMaterial({
    color: 0x122329, emissive: 0x5c9aa3, emissiveIntensity: 0.9, roughness: 0.38,
  }),
  window: new THREE.MeshStandardMaterial({
    color: 0x101a1d, emissive: 0x203f43, emissiveIntensity: 0.34, roughness: 0.22, metalness: 0.12,
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

function diningChair(parent, colliders, x, z, yaw, index) {
  const chair = new THREE.Group();
  chair.name = `dining-chair.${index}`;
  chair.position.set(x, 0, z);
  chair.rotation.y = yaw;
  chair.add(
    box([0.76, 0.12, 0.76], [0, 0.52, 0], M.woodLight, 'dining-chair-seat'),
    box([0.76, 0.92, 0.12], [0, 1.0, 0.34], M.wood, 'dining-chair-back'),
    box([0.62, 0.58, 0.58], [0, 0.62, 0], M.textile, 'dining-chair-upholstery'),
  );
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    chair.add(box([0.085, 0.5, 0.085], [sx * 0.3, 0.25, sz * 0.3], M.wood, 'dining-chair-leg'));
  }
  parent.add(chair);
  addCollider(colliders, [x, 0.7, z], [0.9, 1.4, 0.9], chair.name);
  return chair;
}

function diningPlaceSetting(parent, x, z, index) {
  const setting = new THREE.Group();
  setting.name = `dining-place-setting.${index}`;
  setting.position.set(x, 0.92, z);
  const plate = cylinder(0.23, 0.026, [0, 0, 0], M.white, 'dining-plate', 18);
  const innerPlate = cylinder(0.15, 0.012, [0, 0.022, 0], M.floorAccent, 'dining-plate-rim', 18);
  const glass = cylinder(0.055, 0.17, [0.28, 0.09, 0], M.glass, 'dining-glass', 12);
  const napkin = box([0.19, 0.022, 0.28], [-0.28, 0.025, 0], M.textile, 'dining-napkin');
  setting.add(plate, innerPlate, glass, napkin);
  parent.add(setting);
  return setting;
}

function diningChandelier(parent) {
  const fixture = new THREE.Group();
  fixture.name = 'dining-chandelier';
  fixture.position.set(0, 0, -42.4);
  fixture.add(cylinder(0.035, 0.78, [0, 4.12, 0], M.brass, 'dining-chandelier-chain', 8));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.055, 8, 32), M.brass);
  ring.name = 'dining-chandelier-ring';
  ring.position.y = 3.7;
  ring.rotation.x = Math.PI / 2;
  fixture.add(ring);
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    const arm = box(
      [1.18, 0.045, 0.045],
      [Math.cos(angle) * 0.62, 3.7, Math.sin(angle) * 0.62],
      M.brass,
      'dining-chandelier-arm',
    );
    arm.rotation.y = -angle;
    fixture.add(arm);
    fixture.add(cylinder(
      0.13, 0.07,
      [Math.cos(angle) * 1.24, 3.63, Math.sin(angle) * 1.24],
      M.brass,
      'dining-chandelier-cup',
      10,
    ));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 7), M.lampWarm);
    bulb.name = 'dining-chandelier-bulb';
    bulb.position.set(Math.cos(angle) * 1.24, 3.58, Math.sin(angle) * 1.24);
    fixture.add(bulb);
  }
  parent.add(fixture);
  return fixture;
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
  const courtyardPracticalLights = [];
  const courtyardLampBulbs = [];

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

  const courtyardDetails = new THREE.Group();
  courtyardDetails.name = 'courtyard-refinement';
  root.add(courtyardDetails);

  // The original basin had water but no fountain silhouette. A two-tier stone
  // centerpiece and six explicit arcs make it legible from the service gate.
  const centerpiece = new THREE.Group();
  centerpiece.name = 'courtyard-fountain-centerpiece';
  centerpiece.position.set(0, 0, 35);
  centerpiece.add(
    cylinder(0.68, 1.0, [0, 1.04, 0], M.stoneLight, 'courtyard-fountain-pedestal', 18),
    cylinder(1.02, 0.16, [0, 1.56, 0], M.stoneLight, 'courtyard-fountain-tier', 24),
    cylinder(0.25, 0.7, [0, 1.96, 0], M.stoneLight, 'courtyard-fountain-column', 16),
    cylinder(0.58, 0.14, [0, 2.34, 0], M.stoneLight, 'courtyard-fountain-tier', 20),
  );
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), M.brass);
  finial.name = 'courtyard-fountain-finial';
  finial.position.y = 2.58;
  centerpiece.add(finial);
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const curve = new THREE.QuadraticBezierCurve3(
      direction.clone().multiplyScalar(0.28).setY(2.42),
      direction.clone().multiplyScalar(1.08).setY(2.82),
      direction.clone().multiplyScalar(1.75).setY(0.64),
    );
    const jet = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.026, 5, false), M.glass);
    jet.name = 'courtyard-water-jet';
    jet.castShadow = false;
    centerpiece.add(jet);
  }
  courtyardDetails.add(centerpiece);
  addCollider(colliders, [0, 0.35, 35], [6.4, 0.7, 6.4], 'courtyard-fountain-collider');

  // A raised four-piece coping reads as an edge from any approach angle and
  // gives the reflecting pool the same physical truth as its stone surround.
  courtyardDetails.add(
    box([12.0, 0.22, 0.35], [-11, 0.14, 15.15], M.stoneLight, 'reflecting-pool-border'),
    box([12.0, 0.22, 0.35], [-11, 0.14, 22.85], M.stoneLight, 'reflecting-pool-border'),
    box([0.35, 0.22, 7.35], [-16.85, 0.14, 19], M.stoneLight, 'reflecting-pool-border'),
    box([0.35, 0.22, 7.35], [-5.15, 0.14, 19], M.stoneLight, 'reflecting-pool-border'),
  );
  addCollider(colliders, [-11, 0.22, 19], [12.0, 0.44, 8.0], 'reflecting-pool-collider');

  // The blank estate front now has repeated window bays, a plinth/cornice
  // hierarchy and wall lanterns. All pieces project from existing solid walls
  // and therefore introduce no new blockers in the courtyard route.
  courtyardDetails.add(
    box([29.5, 0.28, 0.2], [-3.25, 0.24, 12.34], M.stoneLight, 'estate-facade-plinth'),
    box([2.5, 0.28, 0.2], [16.75, 0.24, 12.34], M.stoneLight, 'estate-facade-plinth'),
    box([29.5, 0.26, 0.28], [-3.25, 4.48, 12.36], M.stoneLight, 'estate-facade-cornice'),
    box([2.5, 0.26, 0.28], [16.75, 4.48, 12.36], M.stoneLight, 'estate-facade-cornice'),
  );
  for (const x of [-15.0, -11.1, -7.2, -3.3, 0.6, 4.5, 8.4, 16.8]) {
    const bay = new THREE.Group();
    bay.name = 'estate-facade-bay';
    bay.position.set(x, 0, 12.43);
    bay.add(
      box([1.48, 1.78, 0.06], [0, 2.35, 0], M.window, 'estate-facade-window', { cast: false }),
      box([1.9, 0.18, 0.22], [0, 1.42, 0.02], M.stoneLight, 'estate-facade-window-sill'),
      box([1.9, 0.22, 0.22], [0, 3.3, 0.02], M.stoneLight, 'estate-facade-window-header'),
      box([0.18, 2.05, 0.2], [-0.86, 2.35, 0.01], M.stoneLight, 'estate-facade-window-jamb'),
      box([0.18, 2.05, 0.2], [0.86, 2.35, 0.01], M.stoneLight, 'estate-facade-window-jamb'),
    );
    courtyardDetails.add(bay);
  }
  for (const x of [-13.1, -5.25, 2.55, 10.35]) {
    const lantern = new THREE.Group();
    lantern.name = 'courtyard-wall-lantern';
    lantern.position.set(x, 2.8, 12.68);
    lantern.add(
      box([0.08, 0.42, 0.22], [0, 0, -0.08], M.brass, 'courtyard-lantern-bracket'),
      cylinder(0.16, 0.08, [0, 0.26, 0.06], M.brass, 'courtyard-lantern-cap', 10),
    );
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 7), M.lampWarm);
    bulb.name = 'courtyard-lantern-bulb';
    bulb.position.set(0, 0.05, 0.08);
    lantern.add(bulb);
    courtyardLampBulbs.push(bulb);
    courtyardDetails.add(lantern);
    const light = new THREE.PointLight(0xffb86f, 4.4, 9.5, 2);
    light.name = 'courtyard-wall-lantern-light';
    light.position.set(x, 2.75, 13.1);
    root.add(light);
    courtyardPracticalLights.push(light);
  }

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

  // A real interior shell keeps the exterior clay roof and its ridges out of
  // every eye-level room view. The panels meet at authored room boundaries;
  // they are visual soffits, not collision slabs, so the mission route and
  // headroom remain exactly as they were.
  const ceilings = new THREE.Group();
  ceilings.name = 'estate-interior-ceilings';
  estate.add(ceilings);
  for (const [name, size, position] of [
    ['estate-entry-ceiling', [7.0, 0.12, 16.0], [14.2, 4.54, 4.0]],
    ['mark-office-ceiling', [9.25, 0.12, 16.0], [-13.275, 4.54, -6.75]],
    ['guest-suite-ceiling', [18.95, 0.12, 16.0], [0.825, 4.54, -6.75]],
    ['security-room-ceiling', [7.0, 0.12, 14.0], [14.2, 4.54, -11.0]],
    ['service-corridor-ceiling', [7.0, 0.12, 16.0], [14.2, 4.54, -26.0]],
    ['portrait-gallery-ceiling', [28.0, 0.12, 18.8], [-3.7, 4.54, -24.6]],
    ['final-dining-ceiling', [35.5, 0.12, 15.35], [0, 4.54, -42.075]],
  ]) {
    ceilings.add(box(size, position, M.ceiling, name, { cast: false, receive: true }));
  }

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

  const officeDetails = new THREE.Group();
  officeDetails.name = 'mark-office-refinement';
  estate.add(officeDetails);
  officeDetails.add(
    box([7.2, 0.035, 11.0], [-13.2, 0.07, -6.6], M.green, 'office-detail.rug', { cast: false }),
    box([0.08, 1.45, 12.5], [-17.69, 1.18, -6.5], M.woodLight, 'office-detail.wainscot'),
    box([0.08, 0.12, 12.5], [-17.63, 1.92, -6.5], M.brass, 'office-detail.dado-rail'),
  );
  const officeDrawers = new THREE.Group();
  officeDrawers.name = 'office-detail.file-drawers';
  for (let z = -11.5; z <= -2; z += 2.2) {
    for (const y of [0.46, 1.08, 1.7]) {
      officeDrawers.add(
        box([0.035, 0.48, 1.18], [-16.21, y, z], M.woodLight, 'office-file-drawer-face'),
        box([0.025, 0.08, 0.32], [-16.18, y, z], M.brass, 'office-file-drawer-pull'),
      );
    }
  }
  officeDetails.add(officeDrawers);

  const officeChair = new THREE.Group();
  officeChair.name = 'office-detail.desk-chair';
  officeChair.position.set(-10.6, 0, -8.25);
  officeChair.add(
    box([0.72, 0.12, 0.72], [0, 0.52, 0], M.wood, 'office-chair-seat'),
    box([0.72, 0.88, 0.12], [0, 1.0, -0.32], M.wood, 'office-chair-back'),
    box([0.58, 0.18, 0.58], [0, 0.61, 0], M.textile, 'office-chair-cushion'),
  );
  officeDetails.add(officeChair);

  const officeLamp = new THREE.Group();
  officeLamp.name = 'office-detail.desk-lamp';
  officeLamp.position.set(-11.55, 0, -6.8);
  officeLamp.add(
    cylinder(0.19, 0.07, [0, 0.92, 0], M.brass, 'office-lamp-base', 12),
    cylinder(0.035, 0.62, [0, 1.23, 0], M.brass, 'office-lamp-stem', 8),
  );
  const officeShade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 12, 1, true), M.lampWarm);
  officeShade.name = 'office-lamp-shade';
  officeShade.position.set(0, 1.55, 0);
  officeLamp.add(officeShade);
  officeDetails.add(officeLamp);

  const officeCoffers = new THREE.Group();
  officeCoffers.name = 'office-detail.ceiling-beams';
  for (const z of [-12.5, -9.5, -6.5, -3.5, -0.5]) {
    officeCoffers.add(box([8.0, 0.14, 0.16], [-13.7, 4.4, z], M.wood, 'office-ceiling-beam', { cast: false }));
  }
  officeDetails.add(officeCoffers);

  solid(estate, colliders, [4.2, 0.68, 2.3], [4.7, 0.34, -11.2], M.wood, 'guest-suite-bed');
  estate.add(box([3.9, 0.16, 2.12], [4.7, 0.76, -11.2], M.white, 'guest-suite-linen'));

  const guestDetails = new THREE.Group();
  guestDetails.name = 'guest-suite-refinement';
  estate.add(guestDetails);
  guestDetails.add(
    box([8.8, 0.035, 9.2], [4.7, 0.07, -9.4], M.textile, 'guest-suite-detail.rug', { cast: false }),
    box([4.55, 1.55, 0.18], [4.7, 1.25, -12.32], M.wood, 'guest-suite-detail.headboard'),
    box([4.45, 0.28, 0.16], [4.7, 0.53, -10.05], M.woodLight, 'guest-suite-detail.footboard'),
    box([3.6, 0.11, 0.65], [4.7, 0.88, -11.77], M.floorAccent, 'guest-suite-detail.blanket-fold'),
  );
  const guestPillows = new THREE.Group();
  guestPillows.name = 'guest-suite-detail.pillows';
  guestPillows.add(
    box([1.5, 0.18, 0.62], [3.75, 0.93, -11.72], M.white, 'guest-suite-pillow'),
    box([1.5, 0.18, 0.62], [5.65, 0.93, -11.72], M.white, 'guest-suite-pillow'),
  );
  guestDetails.add(guestPillows);
  const nightstands = new THREE.Group();
  nightstands.name = 'guest-suite-detail.nightstands';
  const bedsideLamps = new THREE.Group();
  bedsideLamps.name = 'guest-suite-detail.bedside-lamps';
  for (const x of [1.9, 7.5]) {
    nightstands.add(
      box([0.9, 0.12, 0.78], [x, 0.64, -11.25], M.woodLight, 'guest-suite-nightstand-top'),
      box([0.68, 0.58, 0.58], [x, 0.31, -11.25], M.wood, 'guest-suite-nightstand-base'),
    );
    bedsideLamps.add(
      cylinder(0.13, 0.05, [x, 0.74, -11.25], M.brass, 'guest-suite-lamp-base', 10),
      cylinder(0.025, 0.4, [x, 0.94, -11.25], M.brass, 'guest-suite-lamp-stem', 8),
    );
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), M.lampWarm);
    bulb.name = 'guest-suite-lamp-bulb';
    bulb.position.set(x, 1.17, -11.25);
    bedsideLamps.add(bulb);
  }
  guestDetails.add(nightstands, bedsideLamps);
  const guestWall = new THREE.Group();
  guestWall.name = 'guest-suite-detail.wall-panels';
  for (const x of [2.6, 4.7, 6.8]) {
    guestWall.add(box([1.65, 1.35, 0.08], [x, 2.65, -12.36], M.woodLight, 'guest-suite-wall-panel'));
  }
  guestDetails.add(guestWall);
  const guestCoffers = new THREE.Group();
  guestCoffers.name = 'guest-suite-detail.ceiling-beams';
  for (const x of [-6.5, -3.3, -0.1, 3.1, 6.3, 9.5]) {
    guestCoffers.add(box([0.16, 0.14, 15.2], [x, 4.4, -6.75], M.woodLight, 'guest-suite-ceiling-beam', { cast: false }));
  }
  guestDetails.add(guestCoffers);

  for (let z = -14; z <= -6; z += 2.1) {
    solid(estate, colliders, [1.05, 2.4, 0.7], [16.9, 1.2, z], M.iron, 'security-rack');
  }

  const securityDetails = new THREE.Group();
  securityDetails.name = 'security-room-refinement';
  estate.add(securityDetails);
  securityDetails.add(
    box([6.5, 0.035, 10.5], [14.2, 0.07, -11.0], M.ink, 'security-detail.floor-field', { cast: false }),
    box([6.2, 0.025, 0.32], [14.2, 0.095, -6.8], M.floorAccent, 'security-detail.threshold-stripe', { cast: false }),
    box([3.5, 1.65, 0.12], [14.9, 2.15, -10.38], M.iron, 'security-detail.console-backdrop'),
  );
  const monitorBank = new THREE.Group();
  monitorBank.name = 'security-detail.monitor-bank';
  for (const [x, y] of [[13.9, 2.35], [14.9, 2.35], [15.9, 2.35], [14.4, 1.75], [15.4, 1.75]]) {
    monitorBank.add(box([0.82, 0.5, 0.06], [x, y, -10.48], M.screen, 'security-monitor', { cast: false }));
  }
  securityDetails.add(monitorBank);
  const rackFaces = new THREE.Group();
  rackFaces.name = 'security-detail.rack-faces';
  const indicators = new THREE.Group();
  indicators.name = 'security-detail.indicators';
  for (let z = -14; z <= -6; z += 2.1) {
    rackFaces.add(box([0.07, 1.95, 0.55], [16.36, 1.2, z], M.stone, 'security-rack-face'));
    for (const y of [0.65, 1.05, 1.45, 1.85]) {
      indicators.add(box([0.025, 0.055, 0.055], [16.31, y, z], M.lampCool, 'security-rack-indicator', { cast: false }));
    }
  }
  securityDetails.add(rackFaces, indicators);
  const cableTray = new THREE.Group();
  cableTray.name = 'security-detail.cable-tray';
  cableTray.add(
    box([0.12, 0.12, 10.5], [11.35, 4.23, -11], M.iron, 'security-cable-rail', { cast: false }),
    box([0.12, 0.12, 10.5], [11.85, 4.23, -11], M.iron, 'security-cable-rail', { cast: false }),
  );
  for (let z = -15.7; z <= -6.3; z += 0.7) {
    cableTray.add(box([0.62, 0.04, 0.05], [11.6, 4.2, z], M.iron, 'security-cable-rung', { cast: false }));
  }
  securityDetails.add(cableTray);
  const stool = new THREE.Group();
  stool.name = 'security-detail.operator-stool';
  stool.position.set(13.25, 0, -8.7);
  stool.add(
    cylinder(0.3, 0.1, [0, 0.58, 0], M.woodLight, 'security-stool-seat', 14),
    cylinder(0.06, 0.55, [0, 0.29, 0], M.iron, 'security-stool-post', 8),
  );
  securityDetails.add(stool);

  // Portrait gallery and evidence approach.
  for (const side of [-1, 1]) {
    for (let z = -18; z >= -31; z -= 3.5) framedPortrait(estate, side * 9.8, 1.75, z, { scale: 0.46, facing: 'x' });
  }
  const galleryRunner = box([5.2, 0.025, 17], [0, 0.09, -24.5], M.textile, 'portrait-gallery-runner', { cast: false });
  estate.add(galleryRunner);

  const galleryDetails = new THREE.Group();
  galleryDetails.name = 'portrait-gallery-refinement';
  estate.add(galleryDetails);
  // The west side previously had no mounting surface at all. This one solid
  // gallery wall gives the portrait sequence architectural depth without
  // changing the central patrol/combat aisle.
  solid(galleryDetails, colliders, [0.32, 4.2, 18.6], [-10.5, 2.1, -24.6], M.plaster, 'gallery-west-wall');
  for (const side of [-1, 1]) {
    for (const z of [-18, -21.5, -25, -28.5]) {
      galleryDetails.add(box(
        [0.08, 2.45, 2.45], [side * 10.08, 1.75, z], M.woodLight, 'gallery-wall-panel',
      ));
      const pictureLight = new THREE.Group();
      pictureLight.name = 'gallery-picture-light';
      pictureLight.position.set(side * 9.63, 2.68, z);
      pictureLight.add(box([0.38, 0.06, 0.06], [0, 0, 0], M.brass, 'gallery-picture-light-arm'));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 9, 6), M.lampWarm);
      bulb.name = 'gallery-picture-light-bulb';
      bulb.position.set(-side * 0.18, -0.08, 0);
      pictureLight.add(bulb);
      galleryDetails.add(pictureLight);
    }
  }
  galleryDetails.add(
    box([0.055, 0.04, 17.0], [-2.58, 0.115, -24.5], M.brass, 'gallery-runner-border', { cast: false }),
    box([0.055, 0.04, 17.0], [2.58, 0.115, -24.5], M.brass, 'gallery-runner-border', { cast: false }),
  );
  for (const z of [-16.6, -19.4, -22.2, -25.0, -27.8, -30.6, -33.2]) {
    galleryDetails.add(box([19.6, 0.14, 0.16], [0, 4.4, z], M.wood, 'gallery-ceiling-beam', { cast: false }));
  }
  for (const x of [-6.5, 0, 6.5]) {
    galleryDetails.add(box([0.16, 0.14, 17.9], [x, 4.4, -24.6], M.wood, 'gallery-ceiling-beam', { cast: false }));
  }
  for (const [index, x] of [-8.25, 8.25].entries()) {
    const bench = new THREE.Group();
    bench.name = 'gallery-bench';
    bench.position.set(x, 0, -24.6);
    bench.add(
      box([0.86, 0.14, 3.0], [0, 0.52, 0], M.woodLight, `gallery-bench.${index}.seat`),
      box([0.68, 0.18, 2.72], [0, 0.63, 0], M.textile, `gallery-bench.${index}.cushion`),
      box([0.12, 0.5, 0.12], [0, 0.25, -1.26], M.wood, `gallery-bench.${index}.leg`),
      box([0.12, 0.5, 0.12], [0, 0.25, 1.26], M.wood, `gallery-bench.${index}.leg`),
    );
    galleryDetails.add(bench);
    addCollider(colliders, [x, 0.52, -24.6], [1.0, 1.04, 3.2], `gallery-bench.${index}`);
  }
  // The existing east-side service-wall gap remains the evidence-route door;
  // an overhead lintel and jambs make that gap intentional without closing it.
  galleryDetails.add(
    box([0.4, 3.45, 0.28], [10.5, 1.73, -26.28], M.stoneLight, 'gallery-service-door-jamb'),
    box([0.4, 3.45, 0.28], [10.5, 1.73, -22.22], M.stoneLight, 'gallery-service-door-jamb'),
    box([0.4, 0.32, 4.35], [10.5, 3.62, -24.25], M.stoneLight, 'gallery-service-door-lintel'),
  );

  // Dining room: a formal cartel table staged as the final arena. The front
  // edge deliberately has no chairs: Mark and Sauce retain their canonical
  // positions and the player gets two clean flanking lanes around the table.
  const diningStage = new THREE.Group();
  diningStage.name = 'final-dining-refinement';
  estate.add(diningStage);
  diningStage.add(box([14.8, 0.04, 11.5], [0, 0.07, -42.15], M.textile, 'final-dining-rug', { cast: false }));

  const finalTable = table(diningStage, colliders, 0, -42.4, 9.8, 2.2, 'mark-dining-table');
  finalTable.add(box([8.7, 0.024, 0.54], [0, 0.9, 0], M.floorAccent, 'dining-table-runner', { cast: false }));
  for (let x = -3.9; x <= 3.9; x += 1.3) {
    finalTable.add(cylinder(0.045, 0.32, [x, 1.06, 0], M.brass, 'dining-candle', 8));
  }
  let settingIndex = 0;
  for (const z of [-0.62, 0.62]) {
    for (const x of [-3.55, -1.2, 1.2, 3.55]) {
      diningPlaceSetting(finalTable, x, z, settingIndex++);
    }
  }
  let chairIndex = 0;
  for (const [x, z, yaw] of [
    [-3.6, -44.2, Math.PI], [-1.2, -44.2, Math.PI],
    [1.2, -44.2, Math.PI], [3.6, -44.2, Math.PI],
    [-5.55, -42.4, -Math.PI / 2], [5.55, -42.4, Math.PI / 2],
  ]) diningChair(diningStage, colliders, x, z, yaw, chairIndex++);

  for (const z of [-36.4, -38.8, -41.2, -43.6, -46.0, -48.4]) {
    diningStage.add(box([32.8, 0.12, 0.18], [0, 4.4, z], M.wood, 'dining-coffer-beam', { cast: false }));
  }
  for (const x of [-12, -6, 0, 6, 12]) {
    diningStage.add(box([0.18, 0.12, 13.6], [x, 4.4, -42.4], M.wood, 'dining-coffer-beam', { cast: false }));
  }
  for (const x of [-17.7, 17.7]) {
    for (const z of [-37.0, -40.6, -44.2, -47.8]) {
      diningStage.add(box([0.08, 1.5, 2.6], [x, 1.2, z], M.woodLight, 'dining-wall-panel'));
    }
  }
  for (const x of [-14.2, -10.4, -6.6, 6.6, 10.4, 14.2]) {
    diningStage.add(
      box([3.1, 2.6, 0.08], [x, 1.58, -49.69], M.woodLight, 'dining-rear-wall-panel'),
      box([2.7, 2.2, 0.055], [x, 1.58, -49.63], M.textile, 'dining-rear-wall-inset'),
    );
  }
  diningChandelier(diningStage);

  solid(diningStage, colliders, [3.8, 1.1, 0.75], [-14.7, 0.55, -43.5], M.wood, 'dining-sideboard-west');
  solid(diningStage, colliders, [3.8, 1.1, 0.75], [14.7, 0.55, -43.5], M.wood, 'dining-sideboard-east');
  framedPortrait(diningStage, 0, 2.5, -49.65, { scale: 1.05 });

  const extractionGate = ironGate(5.4, 3.7, 'terrace-extraction-gate');
  extractionGate.position.set(0, 0, -52.6);
  estate.add(extractionGate);
  const extractionCollider = addCollider(colliders, [0, 2, -52.6], [5.5, 4.0, 0.3], 'terrace-extraction-gate');

  // One pool of local lights; the composition root can cap or disable it.
  const lights = [...courtyardPracticalLights];
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
    [0, 3.35, -25, 0xffa85a, 11, 16],
    [0, 2.9, -36.5, 0xffb16b, 18, 15],
    [0, 3.55, -42.4, 0xff9c51, 14, 20],
    [-3.2, 2.85, -43, 0xffd6a0, 9, 10],
    [3.2, 2.85, -43, 0xb7d3dc, 8, 10],
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
    for (const light of courtyardPracticalLights) light.intensity = 0;
    for (const bulb of courtyardLampBulbs) bulb.material = M.blackout;
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

  const environmentZones = Object.freeze({
    ceilings,
    courtyard: courtyardDetails,
    office: officeDetails,
    guestSuite: guestDetails,
    security: securityDetails,
    gallery: galleryDetails,
    dining: diningStage,
  });

  /**
   * Public, derived inspection data for Node and browser verification. Nothing
   * here is a hand-maintained promise: counts, names and bounds are recomputed
   * from the same live scene graph the player sees.
   */
  function inspectEnvironment() {
    root.updateMatrixWorld(true);
    let meshes = 0;
    let groups = 0;
    let namedMeshes = 0;
    root.traverse((object) => {
      if (object.isMesh) {
        meshes++;
        if (object.name) namedMeshes++;
      }
      if (object.isGroup) groups++;
    });

    const zones = Object.fromEntries(Object.entries(environmentZones).map(([name, zone]) => {
      let zoneMeshes = 0;
      const names = new Set();
      zone.traverse((object) => {
        if (object.isMesh) zoneMeshes++;
        if (object.name) names.add(object.name);
      });
      const bounds = new THREE.Box3().setFromObject(zone);
      return [name, {
        meshes: zoneMeshes,
        names: [...names].sort(),
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      }];
    }));

    return {
      meshes,
      groups,
      namedMeshes,
      colliders: colliders.length,
      colliderNames: colliders.map((collider) => collider.name).filter(Boolean).sort(),
      solidWaterworks: colliders
        .filter((collider) => ['courtyard-fountain-collider', 'reflecting-pool-collider'].includes(collider.name))
        .map((collider) => collider.name),
      zones,
    };
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
    inspectEnvironment,
    state: () => ({ serviceGateOpen, estateDoorOpen, diningOpen, extractionOpen }),
  };
}

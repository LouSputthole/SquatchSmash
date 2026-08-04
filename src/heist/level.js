import * as THREE from 'three';
import { buildEscapeCity, ESCAPE_START } from './city.js';
import {
  HeistFigure, makeBankGuardFigure, makeBankManagerFigure, makeHostageFigure,
} from './people.js';
import { makeCashBag, makeHeistCarbine, makeHeistSidearm, makeBalaclava, makeZipTies } from './weapons.js';

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x5a5b58, roughness: 0.92 }),
  darkConcrete: new THREE.MeshStandardMaterial({ color: 0x292c2e, roughness: 0.95 }),
  marble: new THREE.MeshStandardMaterial({ color: 0xbdb8ab, roughness: 0.42 }),
  marbleDark: new THREE.MeshStandardMaterial({ color: 0x6d6559, roughness: 0.46 }),
  brass: new THREE.MeshStandardMaterial({ color: 0x8b6a31, metalness: 0.7, roughness: 0.3 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.74 }),
  richWood: new THREE.MeshStandardMaterial({ color: 0x36211a, roughness: 0.55 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xa4c4c7, transparent: true, opacity: 0.28, roughness: 0.15 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x1c2023, roughness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x353a3d, metalness: 0.75, roughness: 0.35 }),
  cash: new THREE.MeshStandardMaterial({ color: 0x7f8c63, roughness: 0.8 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.92 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x20384a, roughness: 0.72 }),
  tactical: new THREE.MeshStandardMaterial({ color: 0x171c1d, roughness: 0.88 }),
  webbing: new THREE.MeshStandardMaterial({ color: 0x4e5548, roughness: 1 }),
  warning: new THREE.MeshStandardMaterial({ color: 0xa33c2f, roughness: 0.76 }),
  carpet: new THREE.MeshStandardMaterial({ color: 0x3a2f2c, roughness: 1 }),
  invisible: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
};

const GLOW = {
  screen: new THREE.MeshBasicMaterial({ color: 0x6fa3b8, toneMapped: false }),
  exit: new THREE.MeshBasicMaterial({ color: 0x4ec27a, toneMapped: false }),
  amber: new THREE.MeshBasicMaterial({ color: 0xe4c36f, toneMapped: false }),
  alarm: new THREE.MeshBasicMaterial({ color: 0xd2434b, toneMapped: false }),
};

function mesh(group, geometry, material, position, name = '') {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.name = name;
  item.castShadow = true;
  item.receiveShadow = true;
  group.add(item);
  return item;
}

function box(group, size, position, material = MAT.concrete, name = '') {
  return mesh(group, new THREE.BoxGeometry(...size), material, position, name);
}

function flat(group, size, position, material, name = '') {
  const item = box(group, size, position, material, name);
  item.castShadow = false;
  return item;
}

function bounds(size, position) {
  const half = size.map((value) => value / 2);
  return new THREE.Box3(
    new THREE.Vector3(position[0] - half[0], position[1] - half[1], position[2] - half[2]),
    new THREE.Vector3(position[0] + half[0], position[1] + half[1], position[2] + half[2]),
  );
}

function floorZone(width, depth, surface, x = 0, z = 0) {
  return { box: bounds([width, 0.1, depth], [x, 0, z]), surface };
}

function roomColliders(width, depth, height) {
  return [
    bounds([width, height, 0.25], [0, height / 2, -depth / 2]),
    bounds([width, height, 0.25], [0, height / 2, depth / 2]),
    bounds([0.25, height, depth], [-width / 2, height / 2, 0]),
    bounds([0.25, height, depth], [width / 2, height / 2, 0]),
  ];
}

function room(group, width, depth, height, floorMaterial = MAT.concrete, {
  back = true, front = true,
} = {}) {
  box(group, [width, 0.2, depth], [0, -0.1, 0], floorMaterial);
  if (front) box(group, [width, height, 0.25], [0, height / 2, -depth / 2], MAT.darkConcrete);
  if (back) box(group, [width, height, 0.25], [0, height / 2, depth / 2], MAT.darkConcrete);
  box(group, [0.25, height, depth], [-width / 2, height / 2, 0], MAT.darkConcrete);
  box(group, [0.25, height, depth], [width / 2, height / 2, 0], MAT.darkConcrete);
  /* A ceiling that casts shadow would put the whole room under the key light's
   * own roof and black the floor out — it is a lid, not an occluder. */
  flat(group, [width, 0.2, depth], [0, height, 0], MAT.darkConcrete);
}

/** One car body, shared by the level, the street and the whole escape city. */
export function makeVehicleBody(group, position, color = 0x17191c, name = 'vehicle') {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(...position);
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.42 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.75 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x1a2228, transparent: true, opacity: 0.62, roughness: 0.18, metalness: 0.2,
  });
  box(root, [3.9, 0.62, 1.82], [0, 0.66, 0], bodyMat, `${name}-body`);
  box(root, [3.94, 0.18, 1.86], [0, 0.38, 0], trim);
  box(root, [2.05, 0.58, 1.66], [-0.22, 1.26, 0], bodyMat, `${name}-cabin`);
  box(root, [1.5, 0.42, 1.6], [-0.2, 1.3, 0], glass, `${name}-glazing`);
  box(root, [0.5, 0.34, 1.5], [0.86, 1.22, 0], glass);
  box(root, [0.18, 0.2, 1.72], [1.94, 0.72, 0], trim, `${name}-grille`);
  box(root, [0.14, 0.16, 1.6], [-1.96, 0.7, 0], trim);
  for (const side of [-0.94, 0.94]) {
    box(root, [1.9, 0.06, 0.06], [-0.2, 0.92, side], trim);
    box(root, [0.16, 0.14, 0.05], [-1.1, 1.06, side * 1.0], trim);
  }
  for (const x of [-1.35, 1.35]) {
    for (const z of [-0.94, 0.94]) {
      const arch = box(root, [1.0, 0.5, 0.12], [x, 0.62, z * 0.99], trim);
      arch.castShadow = false;
      const wheel = mesh(root, new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14),
        new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.95 }), [x, 0.4, z]);
      wheel.rotation.x = Math.PI / 2;
      const hub = mesh(root, new THREE.CylinderGeometry(0.17, 0.17, 0.28, 10),
        new THREE.MeshStandardMaterial({ color: 0x6e7276, metalness: 0.8, roughness: 0.4 }),
        [x, 0.4, z]);
      hub.rotation.x = Math.PI / 2;
    }
  }
  group.add(root);
  return root;
}

/* ------------------------------------------------------------------ */
/* Safehouse                                                           */
/* ------------------------------------------------------------------ */

function buildSafehouse() {
  const group = new THREE.Group();
  group.name = 'phase-safehouse';
  room(group, 18, 14, 4.2);

  /* The floor is a poured slab with a drain and old tape lines: this room is a
   * body shop somebody stopped using, not a briefing set. */
  for (let i = -3; i <= 3; i++) {
    flat(group, [17.4, 0.01, 0.06], [0, 0.005, i * 2], MAT.darkConcrete);
  }
  const drain = mesh(group, new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), MAT.steel, [5.6, 0.02, -3.4]);
  drain.castShadow = false;
  for (const [x, z, w, d] of [[-2.6, 4.6, 3.4, 2.2], [6.2, -1.4, 2.6, 3]]) {
    flat(group, [w, 0.012, d], [x, 0.006, z], MAT.carpet);
  }

  for (const [index, x] of [-7, -5.1, 6.8].entries()) {
    const locker = new THREE.Group();
    locker.name = `prep-locker-${index + 1}`;
    locker.userData.kind = 'prep-locker';
    locker.position.set(x, 0, -6.45);
    box(locker, [1.55, 2.9, 0.72], [0, 1.45, 0], MAT.steel);
    box(locker, [1.35, 2.62, 0.06], [0, 1.45, 0.39], MAT.darkConcrete);
    for (const y of [0.45, 2.28]) {
      for (let vent = -2; vent <= 2; vent++) {
        box(locker, [0.14, 0.025, 0.035], [vent * 0.2, y, 0.435], MAT.brass);
      }
    }
    box(locker, [0.08, 0.34, 0.07], [0.48, 1.5, 0.44], MAT.brass);
    box(locker, [0.5, 0.2, 0.02], [-0.3, 2.05, 0.4], MAT.paper);
    group.add(locker);
  }

  const evidence = new THREE.Group();
  evidence.name = 'evidence-board';
  evidence.position.set(0.5, 2.35, -6.76);
  box(evidence, [5.25, 2.55, 0.12], [0, 0, 0], MAT.wood);
  const paperLayout = [
    [-1.72, 0.55, 0.9, 0.68], [-0.55, 0.72, 0.7, 0.52],
    [0.55, 0.48, 0.86, 0.72], [1.7, 0.68, 0.72, 0.56],
    [-1.15, -0.48, 0.78, 0.6], [0.2, -0.55, 1.15, 0.62], [1.65, -0.48, 0.7, 0.58],
  ];
  for (const [x, y, w, h] of paperLayout) {
    box(evidence, [w, h, 0.025], [x, y, 0.075], MAT.paper);
    box(evidence, [w * 0.7, 0.035, 0.016], [x, y + 0.12, 0.096], MAT.ink);
    for (let line = 0; line < 4; line++) {
      box(evidence, [w * (0.62 - line * 0.06), 0.014, 0.012],
        [x - w * 0.05, y - 0.02 - line * 0.075, 0.094], MAT.ink);
    }
  }
  // Red thread between the pins: the one piece of set dressing that says these
  // seven sheets are about one building.
  const pins = [[-1.3, 0.2], [-0.2, 0.35], [0.8, -0.05], [1.45, 0.3], [-0.6, -0.4]];
  for (const [x, y] of pins) {
    const pin = mesh(evidence, new THREE.SphereGeometry(0.045, 8, 6), MAT.warning, [x, y, 0.12]);
    pin.castShadow = false;
  }
  for (let i = 0; i < pins.length - 1; i++) {
    const [ax, ay] = pins[i];
    const [bx, by] = pins[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    const thread = box(evidence, [length, 0.012, 0.012],
      [(ax + bx) / 2, (ay + by) / 2, 0.125], MAT.warning);
    thread.rotation.z = Math.atan2(by - ay, bx - ax);
    thread.castShadow = false;
  }
  group.add(evidence);

  const briefing = new THREE.Group();
  briefing.name = 'briefing-map';
  briefing.position.set(0, 0, 0.2);
  box(briefing, [5.8, 0.18, 2.4], [0, 0.88, 0], MAT.wood);
  for (const x of [-2.45, 2.45]) {
    for (const z of [-0.85, 0.85]) box(briefing, [0.24, 0.88, 0.24], [x, 0.43, z], MAT.steel);
  }
  box(briefing, [4.75, 0.035, 1.78], [0, 0.99, 0], MAT.paper);
  const route = new THREE.Group();
  route.name = 'blueprint-route';
  route.position.y = 1.035;
  for (const [x, z, w, d, angle = 0] of [
    [-1.35, 0.42, 1.55, 0.055, -0.18], [-0.2, 0.05, 1.2, 0.055, -0.35],
    [0.78, -0.32, 1.15, 0.055, -0.14], [1.65, -0.62, 0.82, 0.055, 0.18],
  ]) {
    const segment = box(route, [w, 0.025, d], [x, 0, z], MAT.warning);
    segment.rotation.y = angle;
  }
  for (const [x, z] of [[-2, 0.65], [-0.85, 0.28], [0.35, -0.12], [1.3, -0.48], [2, -0.6]]) {
    mesh(route, new THREE.CylinderGeometry(0.085, 0.085, 0.035, 12), MAT.brass, [x, 0.02, z]);
  }
  // The bank itself, in card, standing on the plan.
  const model = new THREE.Group();
  model.name = 'briefing-bank-model';
  model.position.set(-1.7, 1.02, -0.5);
  box(model, [0.72, 0.3, 0.5], [0, 0.15, 0], MAT.paper);
  for (let i = 0; i < 4; i++) box(model, [0.05, 0.24, 0.05], [-0.26 + i * 0.17, 0.14, 0.28], MAT.paper);
  briefing.add(model, route);
  // The things on a table people have been sitting at for two hours.
  box(briefing, [0.3, 0.09, 0.22], [2.05, 1.02, 0.62], MAT.darkConcrete);
  mesh(briefing, new THREE.CylinderGeometry(0.06, 0.05, 0.11, 10), MAT.paper, [1.7, 1.04, 0.5]);
  mesh(briefing, new THREE.CylinderGeometry(0.06, 0.05, 0.11, 10), MAT.paper, [-1.95, 1.04, 0.72]);
  box(briefing, [0.19, 0.04, 0.12], [-2.1, 1.01, -0.6], MAT.warning);
  group.add(briefing);

  const armor = new THREE.Group();
  armor.name = 'safehouse-armor';
  armor.position.set(-5.5, 0, 2.8);
  box(armor, [0.1, 1.8, 0.1], [0, 0.9, -0.18], MAT.steel, 'armor-stand');
  box(armor, [0.7, 0.08, 0.45], [0, 0.06, -0.18], MAT.steel);
  const armorParts = [];
  armorParts.push(box(armor, [0.9, 0.78, 0.24], [0, 1.14, 0], MAT.tactical, 'armor-vest-body'));
  armorParts.push(box(armor, [0.22, 0.34, 0.25], [-0.54, 1.4, 0], MAT.webbing, 'armor-shoulder-left'));
  armorParts.push(box(armor, [0.22, 0.34, 0.25], [0.54, 1.4, 0], MAT.webbing, 'armor-shoulder-right'));
  for (let i = -1; i <= 1; i++) {
    armorParts.push(box(armor, [0.25, 0.2, 0.12], [i * 0.29, 0.92, 0.18], MAT.webbing, `armor-pouch-${i + 2}`));
  }
  armorParts.push(box(armor, [0.62, 0.06, 0.2], [0, 0.74, 0.05], MAT.webbing, 'armor-cummerbund'));
  armor.userData.setEquipped = (value) => armorParts.forEach((part) => { part.visible = !value; });
  group.add(armor);

  /* The loadout table now carries the modelled weapons rather than four boxes:
   * the same carbine and sidearm that end up in the player's hands, so the
   * thing he picks up is visibly the thing he then holds. */
  const loadout = new THREE.Group();
  loadout.name = 'safehouse-loadout';
  loadout.position.set(4.7, 0, 2.5);
  box(loadout, [3.8, 0.17, 1.35], [0, 0.9, 0], MAT.wood, 'loadout-table');
  for (const x of [-1.55, 1.55]) box(loadout, [0.2, 0.9, 0.9], [x, 0.43, 0], MAT.steel);
  const gearParts = [];
  const carbine = makeHeistCarbine({ sling: true });
  carbine.name = 'loadout-carbine';
  carbine.position.set(-0.75, 1.06, 0.1);
  carbine.rotation.set(0, Math.PI / 2 - 0.1, 0);
  carbine.scale.setScalar(1.9);
  /* Kept for the presentation test and the verifier: the receiver by name, and
   * pushed into `gearParts` in its own right so that "is the carbine still on
   * the table" can be asked of the named mesh rather than of its parent. */
  const receiver = carbine.getObjectByName('carbine-upper');
  if (receiver) receiver.name = 'loadout-carbine-receiver';
  gearParts.push(carbine, receiver);
  loadout.add(carbine);
  const sidearm = makeHeistSidearm();
  sidearm.name = 'loadout-sidearm';
  sidearm.position.set(0.35, 1.02, 0.34);
  sidearm.rotation.set(0, Math.PI / 2 + 0.3, 0);
  sidearm.scale.setScalar(1.9);
  gearParts.push(sidearm);
  loadout.add(sidearm);
  const magazines = new THREE.Group();
  magazines.name = 'loadout-magazines';
  magazines.position.set(0.95, 1.12, -0.34);
  for (let i = 0; i < 4; i++) {
    const magazine = box(magazines, [0.09, 0.3, 0.05], [i * 0.13, 0, 0], MAT.steel);
    magazine.rotation.z = 0.04 * i;
  }
  loadout.add(magazines);
  gearParts.push(magazines);
  const ties = makeZipTies();
  ties.name = 'loadout-zip-ties';
  ties.position.set(1.5, 1.0, 0.36);
  ties.scale.setScalar(1.5);
  loadout.add(ties);
  gearParts.push(ties);
  const masks = new THREE.Group();
  masks.name = 'loadout-masks';
  masks.position.set(-1.75, 1.02, 0.4);
  for (let i = 0; i < 3; i++) {
    const mask = makeBalaclava({ rolled: true });
    mask.position.set(i * 0.24, 0, i % 2 ? 0.1 : 0);
    mask.scale.setScalar(1.15);
    masks.add(mask);
  }
  loadout.add(masks);
  gearParts.push(masks);
  const duffel = makeCashBag({ full: false });
  duffel.name = 'loadout-duffel';
  duffel.position.set(1.3, 1.1, 0.3);
  duffel.scale.setScalar(1.6);
  loadout.add(duffel);
  gearParts.push(duffel);
  loadout.userData.setEquipped = (value) => gearParts.forEach((part) => { part.visible = !value; });
  group.add(loadout);

  /* Room fittings: a strip light with a cage, a wall fan, a water heater, a
   * stack of tyres, a workbench, a coffee urn and a wall clock. Nothing here
   * is interactive; all of it is why the room reads as somewhere people are. */
  for (const x of [-4.5, 4.5]) {
    const light = new THREE.PointLight(0xffd89d, 2.8, 11, 2);
    light.position.set(x, 3.45, 0);
    group.add(light);
    const fitting = box(group, [2.4, 0.12, 0.34], [x, 3.5, 0], MAT.steel);
    fitting.castShadow = false;
    flat(group, [2.2, 0.05, 0.28], [x, 3.42, 0], GLOW.amber);
    for (let i = -2; i <= 2; i++) box(group, [0.03, 0.16, 0.32], [x + i * 0.5, 3.42, 0], MAT.steel);
  }
  const cameraFill = new THREE.PointLight(0xffe5c2, 1.9, 11, 2);
  cameraFill.position.set(0, 2.75, 4.25);
  cameraFill.name = 'safehouse-camera-fill';
  group.add(cameraFill);
  /* A low fill on the crew side of the table. They stand with the evidence
   * board behind them and the ceiling fittings above and in front, so without
   * this the five people the player is here to meet are five silhouettes. */
  const crewFill = new THREE.PointLight(0xffe0b4, 2.1, 12, 2);
  crewFill.position.set(0, 2.35, -1.6);
  crewFill.name = 'safehouse-crew-fill';
  group.add(crewFill);

  const bench = new THREE.Group();
  bench.name = 'safehouse-bench';
  bench.position.set(-8.2, 0, -1.6);
  box(bench, [1.1, 0.14, 4.2], [0, 0.92, 0], MAT.wood);
  box(bench, [0.9, 0.9, 0.14], [0, 0.45, -2], MAT.steel);
  box(bench, [0.9, 0.9, 0.14], [0, 0.45, 2], MAT.steel);
  for (const z of [-1.4, 0.2, 1.5]) box(bench, [0.5, 0.28, 0.4], [0, 1.12, z], MAT.darkConcrete);
  box(bench, [0.1, 1.5, 3.6], [0.5, 2, 0], MAT.darkConcrete);
  for (const [y, z] of [[1.6, -1.2], [1.6, 0.4], [2.2, -0.6], [2.2, 1.1]]) {
    box(bench, [0.06, 0.34, 0.1], [0.42, y, z], MAT.steel);
  }
  group.add(bench);

  const urn = new THREE.Group();
  urn.position.set(8.2, 0, -3.4);
  box(urn, [1.1, 0.9, 1.6], [0, 0.45, 0], MAT.steel);
  mesh(urn, new THREE.CylinderGeometry(0.16, 0.16, 0.44, 12), MAT.steel, [0, 1.12, 0]);
  for (let i = 0; i < 4; i++) {
    mesh(urn, new THREE.CylinderGeometry(0.045, 0.038, 0.1, 8), MAT.paper, [-0.3 + i * 0.2, 0.95, 0.4]);
  }
  group.add(urn);

  for (let i = 0; i < 5; i++) {
    const tyre = mesh(group, new THREE.TorusGeometry(0.36, 0.14, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 1 }), [8.1, 0.16 + i * 0.24, 4.6]);
    tyre.rotation.x = Math.PI / 2;
  }
  const clock = mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), MAT.paper, [-8.7, 3.1, 2.4]);
  clock.rotation.z = Math.PI / 2;
  clock.name = 'safehouse-clock';
  box(group, [0.04, 0.2, 0.03], [-8.63, 3.18, 2.4], MAT.ink);

  const van = makeVehicleBody(group, [0, 0, 5], 0x151719, 'primary-van');
  van.scale.set(1.25, 1.2, 1.1);
  const vanDoor = box(group, [1.6, 2.2, 0.12], [0, 1.25, 5.95], MAT.steel, 'van-door');
  box(group, [0.14, 0.5, 0.06], [0.55, 1.25, 6.02], MAT.brass);

  return {
    group,
    // Back from the table, not on top of it: at z 3 the briefing map filled the
    // lower half of the frame and the crew behind it were a row of shoulders.
    spawn: new THREE.Vector3(0, 1.66, 4.9),
    interactables: { briefing, armor, loadout, van: vanDoor },
    colliders: [
      ...roomColliders(18, 14, 4.2),
      bounds([5.8, 1.05, 2.4], [0, 0.52, 0.2]),
      bounds([4.1, 1.2, 1.5], [4.7, 0.6, 2.5]),
      bounds([4.9, 2.0, 2.1], [0, 1, 5]),
      bounds([1.1, 1.1, 4.2], [-8.2, 0.55, -1.6]),
      bounds([1.1, 1.1, 1.6], [8.2, 0.55, -3.4]),
    ],
    floorZones: [floorZone(18, 14, 'concrete')],
  };
}

/* ------------------------------------------------------------------ */
/* Van                                                                 */
/* ------------------------------------------------------------------ */

function buildVan() {
  const group = new THREE.Group();
  group.name = 'phase-van';
  box(group, [3.6, 0.16, 6.4], [0, -0.08, 0], MAT.steel);
  box(group, [3.6, 2.8, 0.14], [0, 1.4, 3.13], MAT.darkConcrete);
  box(group, [0.14, 2.8, 6.4], [-1.73, 1.4, 0], MAT.darkConcrete);
  box(group, [0.14, 2.8, 6.4], [1.73, 1.4, 0], MAT.darkConcrete);
  box(group, [3.6, 0.16, 6.4], [0, 2.78, 0], MAT.darkConcrete);
  // Benches down both sides, ribbed walls, grab rails, a strapped equipment
  // case and the bulkhead window through to the cab.
  box(group, [0.62, 0.62, 4.8], [-1.32, 0.54, 0.1], MAT.wood);
  box(group, [0.62, 0.62, 4.8], [1.32, 0.54, 0.1], MAT.wood);
  for (let i = -6; i <= 6; i++) {
    box(group, [0.05, 2.4, 0.05], [-1.64, 1.4, i * 0.45], MAT.steel);
    box(group, [0.05, 2.4, 0.05], [1.64, 1.4, i * 0.45], MAT.steel);
  }
  for (const z of [-1.65, -0.55, 0.55, 1.65]) {
    box(group, [0.05, 0.05, 0.55], [-1.0, 1.8, z], MAT.brass);
    box(group, [0.05, 0.05, 0.55], [1.0, 1.8, z], MAT.brass);
  }
  const bulkhead = box(group, [1.2, 0.7, 0.06], [0, 1.7, 3.08], MAT.glass, 'van-bulkhead-window');
  bulkhead.castShadow = false;
  const kit = box(group, [1.0, 0.42, 0.6], [0, 0.22, 2.3], MAT.tactical, 'van-equipment-case');
  box(group, [1.05, 0.06, 0.08], [0, 0.46, 2.3], MAT.webbing);
  const dome = new THREE.PointLight(0xd8b884, 1.1, 6, 2);
  dome.position.set(0, 2.5, 0);
  group.add(dome);
  flat(group, [0.5, 0.05, 0.22], [0, 2.62, 0], GLOW.amber, 'van-dome-lens');

  const door = box(group, [2.4, 2.5, 0.14], [0, 1.25, -3.13], MAT.steel, 'van-interior-door');
  box(group, [0.1, 0.5, 0.06], [0.5, 1.3, -3.04], MAT.brass);
  box(group, [0.1, 0.5, 0.06], [-0.5, 1.3, -3.04], MAT.brass);

  /**
   * The reason the mask never went on.
   *
   * The mask prompt lived on `van-interior-door` at z -3.13, the player spawns
   * at z +1.9, and `InteractionSystem` stops looking at 2.7 m — so the target
   * was five metres away, `player.moveScale` is 0 in here, and there was
   * physically no way to reach it. The verifier never caught it because it
   * called the interaction directly instead of looking at it.
   *
   * This is a soft volume filling the whole box, so pulling the mask on works
   * from the seat, facing anywhere.
   */
  /* Double-sided and small, both deliberately.
   *
   * Double-sided because the player is INSIDE it, and a `FrontSide` mesh is
   * invisible to a raycast that starts within it — every triangle faces away.
   * Small because `InteractionSystem` stops looking at 2.7 m: a proxy the size
   * of the whole box puts its far wall five metres down the aisle, which is
   * the same unreachable distance the rear door was at. Two and a bit metres
   * across the seat means every direction the player can look is in range. */
  const cabin = box(group, [2.4, 2.0, 2.4], [0, 1.3, 1.9], new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  }), 'van-cabin');
  cabin.castShadow = false;
  cabin.receiveShadow = false;

  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 1.9),
    interactables: { van: door, cabin, kit },
    colliders: [
      bounds([3.6, 2.8, 0.14], [0, 1.4, 3.13]),
      bounds([0.14, 2.8, 6.4], [-1.73, 1.4, 0]),
      bounds([0.14, 2.8, 6.4], [1.73, 1.4, 0]),
      bounds([0.62, 0.62, 4.8], [-1.32, 0.54, 0.1]),
      bounds([0.62, 0.62, 4.8], [1.32, 0.54, 0.1]),
    ],
    floorZones: [floorZone(3.6, 6.4, 'metal')],
  };
}

/* ------------------------------------------------------------------ */
/* Bank                                                                */
/* ------------------------------------------------------------------ */

/** Where the twenty-two lobby civilians stand when the doors come in. */
export const LOBBY_ANCHORS = Object.freeze([
  // The queue at the teller line, facing the counter.
  { x: -5.2, z: 0.4, yaw: Math.PI }, { x: -3.6, z: 0.9, yaw: Math.PI },
  { x: -2.0, z: 0.6, yaw: Math.PI }, { x: -0.4, z: 1.1, yaw: Math.PI },
  { x: 1.2, z: 0.7, yaw: Math.PI }, { x: 2.8, z: 1.2, yaw: Math.PI },
  // The tellers, behind it, facing out.
  { x: -6.1, z: -3.1, yaw: 0, role: 'teller' }, { x: -2.6, z: -3.1, yaw: 0, role: 'teller' },
  { x: 0.9, z: -3.1, yaw: 0, role: 'teller' }, { x: 4.4, z: -3.1, yaw: 0, role: 'teller' },
  // The writing desks and the waiting seats on the east side.
  { x: 6.4, z: 2.4, yaw: -1.9 }, { x: 7.6, z: 1.2, yaw: -2.4 },
  { x: 7.9, z: 4.1, yaw: -1.2 }, { x: 6.2, z: 5.2, yaw: -0.8 },
  // The manager's desks on the west side.
  { x: -7.4, z: 3.2, yaw: 1.9, role: 'clerk' }, { x: -6.4, z: 5.0, yaw: 1.4, role: 'clerk' },
  { x: -8.1, z: 6.2, yaw: 0.9 },
  /* Near the doors, which is where the people who nearly got out are — but
   * clear of x 0, because that is the doorway the crew comes through and a
   * stranger's shoulder blades filling the frame on entry is not an entrance. */
  { x: -3.4, z: 8.1, yaw: 0.3 }, { x: 3.1, z: 8.4, yaw: -0.4 },
  { x: 4.6, z: 7.0, yaw: -0.7 }, { x: -5.2, z: 7.4, yaw: 0.5 },
  { x: -3.2, z: 5.5, yaw: 0.1 },
]);

function buildTellerLine(group) {
  const line = new THREE.Group();
  line.name = 'teller-line';
  line.position.set(-1, 0, -2.4);
  box(line, [17.2, 1.12, 0.85], [0, 0.56, 0], MAT.richWood, 'teller-counter');
  box(line, [17.4, 0.09, 1.0], [0, 1.16, 0], MAT.marbleDark);
  box(line, [17.2, 0.16, 0.16], [0, 0.24, 0.44], MAT.brass);
  for (let i = 0; i < 5; i++) {
    const x = -6.9 + i * 3.45;
    // Glazed screen with a speak-through and a cash tray.
    box(line, [3.1, 1.3, 0.05], [x, 1.86, 0.1], MAT.glass, `teller-screen-${i + 1}`);
    box(line, [3.2, 0.09, 0.12], [x, 2.53, 0.1], MAT.brass);
    box(line, [0.12, 1.3, 0.12], [x - 1.6, 1.86, 0.1], MAT.brass);
    box(line, [0.5, 0.28, 0.1], [x, 1.32, 0.1], MAT.darkConcrete);
    box(line, [0.66, 0.05, 0.4], [x, 1.22, 0.32], MAT.steel);
    // The teller's side: terminal, lamp, stamp, a till drawer.
    box(line, [0.42, 0.32, 0.06], [x - 0.4, 1.4, -0.34], MAT.darkConcrete);
    flat(line, [0.36, 0.26, 0.02], [x - 0.4, 1.4, -0.31], GLOW.screen, `teller-screen-glow-${i + 1}`);
    box(line, [0.5, 0.09, 0.36], [x + 0.55, 1.24, -0.3], MAT.steel, `teller-till-${i + 1}`);
    box(line, [0.14, 0.2, 0.14], [x + 1.2, 1.3, -0.3], MAT.brass);
  }
  group.add(line);
  return line;
}

function buildBank() {
  const group = new THREE.Group();
  group.name = 'phase-bank';
  /* No +Z wall (the entrance group is it) and no solid -Z wall: the vault
   * corridor opens through it, so that wall is two panels and a lintel with a
   * 8.4 m doorway between them. A single slab there is what would make the
   * vault unreachable. */
  room(group, 22, 22, 6.4, MAT.marble, { back: false, front: false });
  for (const side of [-1, 1]) {
    box(group, [6.8, 6.4, 0.25], [side * 7.6, 3.2, -11], MAT.darkConcrete, `bank-rear-wall-${side}`);
  }
  box(group, [8.4, 2.6, 0.25], [0, 5.1, -11], MAT.darkConcrete, 'bank-vault-lintel');
  box(group, [8.9, 0.3, 0.4], [0, 3.75, -11], MAT.brass, 'bank-vault-arch');

  // A veined marble floor with a compass inlay, because a bank floor is the
  // first thing you see and a flat grey slab reads as an empty level.
  for (let i = -5; i <= 5; i++) {
    flat(group, [21.6, 0.012, 0.09], [0, 0.007, i * 2], MAT.marbleDark);
    flat(group, [0.09, 0.012, 21.6], [i * 2, 0.007, 0], MAT.marbleDark);
  }
  const inlay = mesh(group, new THREE.CylinderGeometry(2.3, 2.3, 0.02, 24), MAT.marbleDark, [0, 0.012, 3.2]);
  inlay.castShadow = false;
  const inlayInner = mesh(group, new THREE.CylinderGeometry(1.75, 1.75, 0.03, 24), MAT.brass, [0, 0.016, 3.2]);
  inlayInner.castShadow = false;

  const columnXs = [-8, -4.4, 4.4, 8];
  for (const [index, x] of columnXs.entries()) {
    const column = mesh(group, new THREE.CylinderGeometry(0.42, 0.55, 5.6, 18),
      MAT.marble, [x, 2.8, 7], `bank-column-${index + 1}`);
    column.userData.kind = 'bank-column';
    mesh(group, new THREE.CylinderGeometry(0.62, 0.5, 0.4, 18), MAT.marbleDark, [x, 5.75, 7]);
    mesh(group, new THREE.CylinderGeometry(0.66, 0.66, 0.24, 18), MAT.marbleDark, [x, 0.12, 7]);
    for (let flute = 0; flute < 8; flute++) {
      const angle = (flute / 8) * Math.PI * 2;
      const groove = box(group, [0.07, 5.2, 0.07],
        [x + Math.cos(angle) * 0.45, 2.8, 7 + Math.sin(angle) * 0.45], MAT.marbleDark);
      groove.castShadow = false;
    }
  }

  buildTellerLine(group);

  // A coffered ceiling with pendant fittings, and a mezzanine rail behind the
  // teller line — vertical detail is what stops a big room reading as a box.
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const coffer = flat(group, [3.6, 0.22, 3.6], [i * 4, 6.28, j * 4], MAT.marbleDark);
      coffer.receiveShadow = false;
    }
  }
  for (const [x, z] of [[-6, 3], [0, 3], [6, 3], [-6, -1], [6, -1]]) {
    box(group, [0.06, 1.5, 0.06], [x, 5.5, z], MAT.brass);
    const shade = mesh(group, new THREE.CylinderGeometry(0.42, 0.6, 0.4, 12), MAT.brass, [x, 4.6, z]);
    shade.castShadow = false;
    flat(group, [0.9, 0.05, 0.9], [x, 4.42, z], GLOW.amber);
  }
  box(group, [21, 0.2, 0.24], [0, 3.4, -8.4], MAT.brass, 'bank-mezzanine-rail');
  for (let i = -9; i <= 9; i += 2) box(group, [0.07, 0.9, 0.07], [i, 2.95, -8.4], MAT.brass);

  // The doors: a revolving vestibule at +Z with brass frames and a lit EXIT.
  const doors = new THREE.Group();
  doors.name = 'bank-entrance';
  doors.position.set(0, 0, 10.6);
  box(doors, [22, 6.4, 0.4], [0, 3.2, 0.3], MAT.marbleDark);
  const exit = box(doors, [3.2, 3.8, 0.12], [0, 1.9, 0.2], MAT.glass, 'bank-exit');
  box(doors, [0.16, 3.9, 0.2], [-1.7, 1.95, 0.16], MAT.brass);
  box(doors, [0.16, 3.9, 0.2], [1.7, 1.95, 0.16], MAT.brass);
  for (const x of [-5.4, 5.4]) {
    box(doors, [2.6, 3.6, 0.1], [x, 1.9, 0.2], MAT.glass);
    box(doors, [2.8, 0.16, 0.18], [x, 3.78, 0.16], MAT.brass);
  }
  flat(doors, [0.9, 0.28, 0.06], [0, 4.1, 0.1], GLOW.exit, 'bank-exit-sign');
  group.add(doors);

  // Furniture: writing desks, a rope queue, seats, a deposit-box wall.
  for (const [x, z, yaw] of [[7.0, 2.4, -0.6], [7.0, 5.0, -0.6], [-7.2, 4.2, 0.6]]) {
    const desk = new THREE.Group();
    desk.position.set(x, 0, z);
    desk.rotation.y = yaw;
    box(desk, [1.5, 0.1, 0.8], [0, 1.02, 0], MAT.richWood);
    for (const sx of [-0.65, 0.65]) box(desk, [0.09, 1.0, 0.09], [sx, 0.51, 0], MAT.brass);
    box(desk, [0.28, 0.02, 0.2], [0.3, 1.08, 0.1], MAT.paper);
    box(desk, [0.06, 0.16, 0.06], [-0.4, 1.14, 0], MAT.brass);
    group.add(desk);
  }
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Group();
    post.position.set(-6.4 + i * 2.2, 0, 1.9);
    mesh(post, new THREE.CylinderGeometry(0.06, 0.13, 1.0, 10), MAT.brass, [0, 0.5, 0]);
    mesh(post, new THREE.SphereGeometry(0.09, 8, 6), MAT.brass, [0, 1.05, 0]);
    if (i < 4) {
      const rope = box(post, [2.2, 0.05, 0.05], [1.1, 0.86, 0], MAT.warning);
      rope.castShadow = false;
    }
    group.add(post);
  }
  for (let i = 0; i < 4; i++) {
    const seat = new THREE.Group();
    seat.position.set(8.4, 0, 0.4 + i * 1.4);
    box(seat, [0.6, 0.1, 0.55], [0, 0.46, 0], MAT.richWood);
    box(seat, [0.6, 0.5, 0.1], [0, 0.7, -0.24], MAT.richWood);
    for (const [sx, sz] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) {
      box(seat, [0.05, 0.44, 0.05], [sx, 0.22, sz], MAT.steel);
    }
    group.add(seat);
  }
  const boxes = new THREE.Group();
  boxes.name = 'deposit-wall';
  boxes.position.set(-10.5, 0, -4);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = box(boxes, [0.06, 0.28, 0.36], [0, 0.6 + row * 0.32, -1.4 + col * 0.4], MAT.steel);
      cell.castShadow = false;
      box(boxes, [0.04, 0.05, 0.05], [0.05, 0.6 + row * 0.32, -1.4 + col * 0.4], MAT.brass);
    }
  }
  group.add(boxes);

  const guardFigure = makeBankGuardFigure({ name: 'bank-guard', x: -6, z: 4, yaw: 0.9 });
  group.add(guardFigure.root);
  const rearGuardFigure = makeBankGuardFigure({
    name: 'bank-rear-guard', x: 6.8, z: -0.2, yaw: Math.PI, height: 1.79,
  });
  group.add(rearGuardFigure.root);

  /* The crowd proxy the old "ORDER LOBBY DOWN" button used. It is kept, moved
   * over the whole floor and made soft, so the room-wide order is still there
   * for a player who does not want to work the lobby one person at a time —
   * but every individual is now their own target in front of it. */
  const crowd = box(group, [18, 0.12, 9], [0, 0.06, 3.4], MAT.invisible, 'bank-crowd');
  crowd.castShadow = false;

  const managerFigure = makeBankManagerFigure({ name: 'bank-manager', x: 7.5, z: -4.2, yaw: -1.9 });
  group.add(managerFigure.root);
  const manager = managerFigure.root;
  const managerStart = manager.position.clone();
  const managerEnd = new THREE.Vector3(2.7, 0, -8.1);
  manager.userData.setEscortProgress = (progress) => {
    const p = Math.max(0, Math.min(1, progress));
    manager.position.lerpVectors(managerStart, managerEnd, p);
    manager.rotation.y = Math.atan2(managerEnd.x - manager.position.x, managerEnd.z - manager.position.z);
    manager.userData.escortProgress = p;
    if (p > 0 && p < 1) {
      const gait = Math.sin(p * 26) * 0.45;
      managerFigure.parts.legL.rotation.x = gait;
      managerFigure.parts.legR.rotation.x = -gait;
      managerFigure.parts.armL.rotation.set(-2.3, 0, -0.5);
      managerFigure.parts.armR.rotation.set(-0.4, 0, 0.3);
    }
  };

  const civilians = LOBBY_ANCHORS.map((anchor, index) => {
    const figure = makeHostageFigure({
      id: `bank-civilian-${index + 1}`,
      index,
      role: anchor.role ?? 'customer',
      x: anchor.x,
      z: anchor.z,
      yaw: anchor.yaw,
    });
    group.add(figure.root);
    // A soft, person-sized aim volume: reliable to look at across a lobby and
    // reliable to raycast a bullet into, without depending on a forearm mesh.
    const proxy = box(figure.root, [0.72, 1.75, 0.62], [0, 0.9, 0], MAT.invisible,
      `${figure.root.name}-proxy`);
    proxy.castShadow = false;
    proxy.receiveShadow = false;
    figure.root.userData.proxy = proxy;
    figure.root.userData.hostageId = `hostage_${index + 1}`;
    figure.root.userData.setState = (state) => figure.setState(state);
    return figure.root;
  });

  for (const [x, color] of [[-7.2, 0xffd9a1], [0, 0xffe4bd], [7.2, 0xd6e6ff]]) {
    const light = new THREE.PointLight(color, 2.5, 15, 2);
    light.position.set(x, 4.7, 1.5);
    group.add(light);
  }
  const alarmLight = new THREE.PointLight(0xd2434b, 0, 18, 2);
  alarmLight.position.set(0, 5.2, -4);
  alarmLight.name = 'bank-alarm-light';
  group.add(alarmLight);

  /* The vault: a corridor behind the teller line, a real door with a wheel and
   * bolt work, and the cash on trolleys inside it. */
  const vaultRoom = new THREE.Group();
  vaultRoom.name = 'vault-room';
  vaultRoom.position.set(0, 0, -10.1);
  box(vaultRoom, [8.4, 4.4, 0.3], [0, 2.2, -3.2], MAT.steel);
  box(vaultRoom, [0.3, 4.4, 6.4], [-4.2, 2.2, 0], MAT.steel);
  box(vaultRoom, [0.3, 4.4, 6.4], [4.2, 2.2, 0], MAT.steel);
  box(vaultRoom, [8.4, 0.2, 6.4], [0, 4.3, 0], MAT.steel);
  box(vaultRoom, [8.4, 0.1, 6.4], [0, 0.02, 0], MAT.darkConcrete);
  const vaultLight = new THREE.PointLight(0xcfe0ea, 2.2, 12, 2);
  vaultLight.position.set(0, 3.6, -1.4);
  vaultRoom.add(vaultLight);
  group.add(vaultRoom);

  const vault = new THREE.Group();
  vault.name = 'vault-door';
  vault.position.set(0, 0, -10.1);
  const disc = mesh(vault, new THREE.CylinderGeometry(2.3, 2.3, 0.55, 32), MAT.steel, [0, 2.5, 3.1]);
  disc.rotation.x = Math.PI / 2;
  const ring = mesh(vault, new THREE.TorusGeometry(2.42, 0.16, 8, 32), MAT.brass, [0, 2.5, 3.1]);
  ring.rotation.x = 0;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    mesh(vault, new THREE.CylinderGeometry(0.11, 0.11, 0.6, 8),
      MAT.brass, [Math.cos(angle) * 1.85, 2.5 + Math.sin(angle) * 1.85, 3.28])
      .rotation.x = Math.PI / 2;
  }
  const wheel = mesh(vault, new THREE.TorusGeometry(0.62, 0.075, 8, 20), MAT.brass, [0, 2.5, 3.44]);
  wheel.name = 'vault-wheel';
  for (let i = 0; i < 4; i++) {
    const spoke = box(vault, [1.24, 0.08, 0.08], [0, 2.5, 3.44], MAT.brass);
    spoke.rotation.z = (i / 4) * Math.PI;
  }
  mesh(vault, new THREE.CylinderGeometry(0.16, 0.16, 0.2, 12), MAT.steel, [0, 2.5, 3.5]).rotation.x = Math.PI / 2;
  const panel = box(vault, [0.55, 0.75, 0.14], [2.9, 1.7, 3.2], MAT.darkConcrete, 'vault-panel');
  flat(vault, [0.4, 0.28, 0.03], [2.9, 1.92, 3.29], GLOW.alarm, 'vault-panel-screen');
  for (let i = 0; i < 12; i++) {
    box(vault, [0.09, 0.07, 0.03], [2.72 + (i % 3) * 0.18, 1.66 - Math.floor(i / 3) * 0.12, 3.29], MAT.steel);
  }
  group.add(vault);
  vault.userData.setOpen = (open) => {
    disc.position.x = open ? -2.6 : 0;
    disc.rotation.z = open ? 0.5 : 0;
    ring.visible = !open;
    wheel.position.x = open ? -2.6 : 0;
  };

  const bags = new THREE.Group();
  bags.name = 'vault-cash';
  bags.position.set(0, 0, -10.1);
  for (let i = 0; i < 8; i++) {
    const bag = makeCashBag({ full: true });
    bag.name = `cash-${i + 1}`;
    bag.position.set(-2.4 + (i % 4) * 1.6, 0.16, -0.6 + Math.floor(i / 4) * 1.3);
    bag.rotation.y = (i % 3 - 1) * 0.3;
    bag.scale.setScalar(1.5);
    bags.add(bag);
  }
  for (const x of [-2.9, 2.9]) {
    const trolley = new THREE.Group();
    trolley.position.set(x, 0, -1.9);
    box(trolley, [1.4, 0.08, 0.8], [0, 0.6, 0], MAT.steel);
    box(trolley, [1.4, 0.08, 0.8], [0, 0.16, 0], MAT.steel);
    box(trolley, [0.06, 0.9, 0.06], [-0.66, 0.45, 0], MAT.steel);
    box(trolley, [0.06, 0.9, 0.06], [0.66, 0.45, 0], MAT.steel);
    for (let s = 0; s < 6; s++) {
      box(trolley, [0.34, 0.12, 0.22], [-0.5 + (s % 3) * 0.5, 0.72, -0.2 + Math.floor(s / 3) * 0.34], MAT.cash);
    }
    bags.add(trolley);
  }
  group.add(bags);

  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 8.6),
    interactables: {
      guard: guardFigure.root,
      rearGuard: rearGuardFigure.root,
      crowd,
      manager,
      vault,
      exit,
    },
    figures: { guard: guardFigure, rearGuard: rearGuardFigure, manager: managerFigure },
    civilians,
    alarmLight,
    colliders: [
      bounds([22, 6.4, 0.25], [0, 3.2, 11]),
      bounds([0.25, 6.4, 22], [-11, 3.2, 0]),
      bounds([0.25, 6.4, 22], [11, 3.2, 0]),
      bounds([6.8, 6.4, 0.25], [-7.6, 3.2, -11]),
      bounds([6.8, 6.4, 0.25], [7.6, 3.2, -11]),
      ...columnXs.map((x) => bounds([1.1, 5.6, 1.1], [x, 2.8, 7])),
      bounds([17.2, 1.3, 0.9], [-1, 0.65, -2.4]),
      bounds([0.4, 3, 3.4], [-10.5, 1.5, -4]),
      bounds([0.3, 4.4, 6.4], [-4.2, 2.2, -10.1]),
      bounds([0.3, 4.4, 6.4], [4.2, 2.2, -10.1]),
      bounds([8.4, 4.4, 0.3], [0, 2.2, -13.3]),
      bounds([1.4, 1.0, 1.4], [8.4, 0.5, 2.5]),
    ],
    floorZones: [floorZone(22, 22, 'marble'), floorZone(8.4, 6.4, 'concrete', 0, -10.1)],
  };
}

/* ------------------------------------------------------------------ */
/* Street                                                              */
/* ------------------------------------------------------------------ */

function buildStreet() {
  const group = new THREE.Group();
  group.name = 'phase-street';
  box(group, [18, 0.2, 72], [0, -0.1, 0], MAT.asphalt);
  for (let z = -34; z < 34; z += 8) flat(group, [0.2, 0.02, 4], [0, 0.015, z], MAT.warning);
  for (const side of [-1, 1]) {
    box(group, [3.4, 0.35, 72], [side * 10.3, 0.12, 0], MAT.concrete);
    box(group, [0.3, 0.42, 72], [side * 8.7, 0.2, 0], MAT.marbleDark);
    for (let i = 0; i < 9; i++) {
      const color = i % 2 ? 0x3d4449 : 0x342f2b;
      const height = 8 + (i % 3) * 2;
      const facade = box(group, [6, height, 7], [side * 13.4, height / 2, -31 + i * 8],
        new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      facade.castShadow = false;
      // Storefront glass, a lit sign band, a doorway and a fire escape.
      box(group, [0.12, 2.6, 5], [side * 10.5, 1.5, -31 + i * 8], MAT.glass);
      flat(group, [0.1, 0.4, 3.4], [side * 10.42, 3.3, -31 + i * 8],
        i % 3 === 0 ? GLOW.exit : GLOW.amber);
      for (let level = 1; level * 3 < height; level++) {
        flat(group, [0.1, 0.5, 4.4], [side * 10.42, level * 3 + 1.6, -31 + i * 8], GLOW.screen);
      }
      if (i % 3 === 1) {
        for (let f = 0; f < 3; f++) {
          box(group, [1.4, 0.08, 3], [side * 9.7, 3.4 + f * 2.6, -31 + i * 8], MAT.steel);
          box(group, [0.06, 2.6, 0.06], [side * 9.1, 4.7 + f * 2.6, -32.4 + i * 8], MAT.steel);
        }
      }
    }
    // Lamp posts and a hydrant run down both kerbs.
    for (let i = 0; i < 6; i++) {
      const z = -30 + i * 12;
      box(group, [0.16, 6.4, 0.16], [side * 9.6, 3.2, z], MAT.steel);
      box(group, [1.8, 0.12, 0.12], [side * 8.7, 6.3, z], MAT.steel);
      flat(group, [0.7, 0.14, 0.32], [side * 7.9, 6.15, z], GLOW.amber, `street-practical-${side}-${i}`);
    }
  }
  const coverCars = [];
  for (let i = 0; i < 8; i++) {
    const position = [i % 2 ? -5.5 : 5.5, 0, -25 + i * 7];
    makeVehicleBody(group, position, i % 3 ? 0x31363a : 0x5a1f22, `cover-car-${i}`);
    coverCars.push(bounds([4.1, 1.9, 2.2], [position[0], 0.95, position[2]]));
  }
  // Planters on the bank steps: the cover Snow's authored line names.
  for (const x of [-3.4, 0, 3.4]) {
    const planter = box(group, [2.2, 0.9, 1.1], [x, 0.45, 31.5], MAT.marbleDark, `bank-planter-${x}`);
    planter.userData.kind = 'street-cover';
    box(group, [1.9, 0.4, 0.85], [x, 1.0, 31.5], new THREE.MeshStandardMaterial({ color: 0x2f3a27, roughness: 1 }));
    coverCars.push(bounds([2.2, 1.1, 1.1], [x, 0.55, 31.5]));
  }
  box(group, [7, 6.5, 1], [-5.5, 3.25, 35], MAT.marble, 'bank-facade-left');
  box(group, [7, 6.5, 1], [5.5, 3.25, 35], MAT.marble, 'bank-facade-right');
  box(group, [4, 2.2, 1], [0, 5.4, 35], MAT.marble, 'bank-facade-lintel');
  for (const x of [-3.2, 3.2]) {
    mesh(group, new THREE.CylinderGeometry(0.4, 0.5, 5.4, 14), MAT.marble, [x, 2.7, 34.2]);
  }
  for (let i = 0; i < 3; i++) box(group, [11, 0.22, 0.9], [0, 0.11 + i * 0.22, 33 - i * 0.9], MAT.marble);
  const bankDoor = box(group, [4, 4, 0.2], [0, 2, 34], MAT.brass, 'street-start');
  const van = makeVehicleBody(group, [0, 0, 14], 0x111316, 'disabled-van');
  van.rotation.y = 0.18;
  van.scale.set(1.2, 1.15, 1.05);
  const droppedBag = makeCashBag({ full: true });
  droppedBag.name = 'dropped-bag';
  droppedBag.position.set(-3.2, 0.22, -6);
  droppedBag.rotation.set(0.2, 0.7, 0.35);
  droppedBag.scale.setScalar(1.5);
  group.add(droppedBag);
  const garage = box(group, [7, 4.5, 0.2], [0, 2.25, -35], MAT.concrete, 'garage-entry');
  flat(group, [4.4, 0.5, 0.1], [0, 4.9, -35], GLOW.amber, 'garage-sign');

  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 31),
    interactables: { bankDoor, van, droppedBag, garage },
    colliders: [
      bounds([3.4, 10, 72], [-10.3, 5, 0]),
      bounds([3.4, 10, 72], [10.3, 5, 0]),
      ...coverCars,
      bounds([4.9, 2.0, 2.2], [0, 1, 14]),
      bounds([7, 6.5, 1], [-5.5, 3.25, 35]),
      bounds([7, 6.5, 1], [5.5, 3.25, 35]),
    ],
    floorZones: [floorZone(18, 72, 'asphalt')],
  };
}

/* ------------------------------------------------------------------ */
/* Garage                                                              */
/* ------------------------------------------------------------------ */

function buildGarage() {
  const group = new THREE.Group();
  group.name = 'phase-garage';
  room(group, 24, 30, 4.4);
  for (const x of [-8, -3, 3, 8]) {
    for (const z of [-10, 0, 10]) {
      box(group, [0.8, 4.4, 0.8], [x, 2.2, z], MAT.concrete);
      flat(group, [0.9, 0.6, 0.9], [x, 0.3, z], MAT.warning);
    }
  }
  // Bays, arrows, drips, and the strip lights that make a garage a garage.
  for (let i = -5; i <= 5; i++) {
    flat(group, [0.12, 0.01, 5.4], [i * 2.2, 0.006, -11], MAT.paper);
    flat(group, [0.12, 0.01, 5.4], [i * 2.2, 0.006, 11], MAT.paper);
  }
  for (let i = -2; i <= 2; i++) {
    const fitting = box(group, [0.28, 0.14, 9], [i * 5, 4.2, 0], MAT.steel);
    fitting.castShadow = false;
    flat(group, [0.22, 0.05, 8.6], [i * 5, 4.1, 0], GLOW.amber);
    const light = new THREE.PointLight(0xe8d7ae, 1.6, 14, 2);
    light.position.set(i * 5, 3.9, 0);
    group.add(light);
  }
  for (const [x, z] of [[-10, -6], [9.6, 4]]) {
    for (let i = 0; i < 4; i++) box(group, [0.9, 0.9, 0.9], [x, 0.45 + i * 0.9, z], MAT.darkConcrete);
  }
  const ramp = box(group, [7, 0.3, 8], [0, 0.9, 13], MAT.concrete, 'garage-ramp');
  ramp.rotation.x = 0.22;
  const hold = box(group, [8, 0.1, 3], [0, 0.05, 8], MAT.invisible, 'garage-hold');
  hold.castShadow = false;
  const sedan = makeVehicleBody(group, [0, 0, -8], 0x34393d, 'escape-sedan');
  const load = box(group, [2.4, 1.1, 0.2], [0, 0.85, -7], MAT.steel, 'sedan-trunk');
  const drive = box(group, [1, 1.3, 0.2], [-1.1, 1.1, -8], MAT.glass, 'driver-door');
  for (let i = 0; i < 5; i++) {
    const parked = makeVehicleBody(group, [i % 2 ? -9.4 : 9.4, 0, -11 + i * 5.5],
      [0x2b3035, 0x4a2222, 0x223528, 0x36363c, 0x2d3a48][i], `garage-parked-${i}`);
    parked.rotation.y = Math.PI / 2;
  }
  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 12),
    interactables: { hold, load, drive },
    sedan,
    colliders: [
      ...roomColliders(24, 30, 4.4),
      ...[-8, -3, 3, 8].flatMap((x) => [-10, 0, 10]
        .map((z) => bounds([0.8, 4.4, 0.8], [x, 2.2, z]))),
      bounds([4.1, 1.9, 2.2], [0, 0.95, -8]),
    ],
    floorZones: [floorZone(24, 30, 'concrete')],
  };
}

/* ------------------------------------------------------------------ */
/* Driving                                                             */
/* ------------------------------------------------------------------ */

function buildDriving() {
  const group = new THREE.Group();
  group.name = 'phase-driving';
  const city = buildEscapeCity(group, (parent, position, colour, name) => (
    makeVehicleBody(parent, position, colour, name)
  ));

  const roadblock = new THREE.Group();
  roadblock.name = 'roadblock';
  const blockNode = city.route.find((node) => node.id === 'roadblock');
  roadblock.position.set(blockNode.x, 0, blockNode.z);
  // Two cruisers nose-out with a gap between them, spike strips at the kerbs
  // and a flare line — the gap is the authored answer and it has to read.
  for (const [side, angle] of [[-1, 0.4], [1, -0.4]]) {
    const car = makeVehicleBody(roadblock, [0, 0, side * 7.4], 0x1c3048, `roadblock-cruiser-${side}`);
    car.rotation.y = Math.PI / 2 + angle;
    const bar = box(car, [0.8, 0.16, 0.24], [-0.4, 1.74, 0], GLOW.alarm, `roadblock-bar-${side}`);
    bar.castShadow = false;
    flat(car, [0.8, 0.16, 0.24], [0.4, 1.74, 0], GLOW.screen);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const cone = mesh(roadblock, new THREE.ConeGeometry(0.24, 0.7, 8), MAT.warning,
        [-6 + i * 4, 0.35, side * 10.4]);
      cone.castShadow = false;
    }
  }
  group.add(roadblock);

  const swapMat = MAT.invisible;
  const swap = box(group, [9, 0.1, 7], [20, 0.05, -652], swapMat, 'industrial-swap');
  swap.castShadow = false;
  // The swap yard: a lit shed, a skip, a stack of pallets and a chain fence.
  box(group, [11, 5, 8], [8, 2.5, -655], MAT.darkConcrete, 'swap-shed');
  // Small, and set back off the walking area: at three metres square and 1.6 m
  // from where the player is put down, this was a wall of yellow.
  flat(group, [0.08, 0.34, 0.9], [13.6, 3.4, -655], GLOW.amber, 'swap-shed-light');
  flat(group, [0.08, 0.34, 0.9], [13.6, 3.4, -651], GLOW.amber, 'swap-shed-light-2');
  const yardLight = new THREE.PointLight(0xffd7a0, 3, 40, 2);
  yardLight.position.set(17, 7, -653);
  group.add(yardLight);
  box(group, [3, 1.6, 2.2], [26, 0.8, -659], MAT.warning, 'swap-skip');
  for (let i = 0; i < 4; i++) box(group, [1.2, 0.16, 1.0], [25, 0.1 + i * 0.18, -646], MAT.wood);
  for (let i = 0; i < 8; i++) box(group, [0.08, 2.4, 0.08], [13 + i * 2.2, 1.2, -644], MAT.steel);

  const cleanCar = makeVehicleBody(group, [23.8, 0, -656], 0x18231f, 'clean-swap-car');
  cleanCar.rotation.y = Math.PI / 2;
  const trunk = box(group, [1.4, 0.7, 0.2], [22.9, 0.82, -656], MAT.steel, 'swap-trunk');
  const bagsProp = box(group, [1.6, 0.7, 0.8], [17.7, 0.36, -652], MAT.darkConcrete, 'swap-bags');
  const aid = box(group, [0.62, 0.18, 0.42], [15.8, 0.76, -654], MAT.marble, 'swap-aid');
  const masks = box(group, [0.72, 0.16, 0.48], [16.9, 0.7, -656], MAT.darkConcrete, 'swap-masks');
  const jackets = box(group, [1.1, 0.28, 0.6], [18.5, 0.15, -657], MAT.wood, 'swap-jackets');
  const weapons = box(group, [1.7, 0.24, 0.62], [20.2, 0.16, -657], MAT.steel, 'swap-weapons');
  const wipe = box(group, [0.6, 0.08, 0.42], [21.7, 0.75, -654], MAT.marble, 'swap-wipe');
  const depart = box(group, [1.2, 1.4, 0.2], [24.1, 1.0, -655.2], swapMat, 'swap-depart');

  const car = makeVehicleBody(group, [ESCAPE_START.x, 0, ESCAPE_START.z], 0x34393d, 'player-car');
  for (const z of [-0.58, 0.58]) {
    const headlight = new THREE.PointLight(0xffe4b0, 4.5, 40, 1.55);
    headlight.position.set(1.9, 0.78, z);
    car.add(headlight);
    flat(car, [0.08, 0.2, 0.34], [1.96, 0.78, z], GLOW.amber,
      `player-headlamp-${z < 0 ? 'left' : 'right'}`);
    flat(car, [0.06, 0.16, 0.28], [-1.98, 0.74, z], GLOW.alarm,
      `player-taillamp-${z < 0 ? 'left' : 'right'}`);
  }

  /**
   * Three cruisers instead of one.
   *
   * The old chase had a single car pinned 5.8 m off the rear bumper by a lerp,
   * which is a tow rope rather than a pursuit. `main.js` now drives these as
   * independent chasers with their own lag; the second and third join as the
   * heat climbs, and all three break off at the swap.
   */
  const pursuers = [];
  for (let i = 0; i < 3; i++) {
    const cruiser = makeVehicleBody(group, [ESCAPE_START.x, 0, ESCAPE_START.z - 20 - i * 9],
      0x203854, `pursuit-cruiser-${i + 1}`);
    cruiser.scale.setScalar(0.96);
    const redLens = new THREE.MeshBasicMaterial({ color: 0xff282d, toneMapped: false });
    const blueLens = new THREE.MeshBasicMaterial({ color: 0x3f7dff, toneMapped: false });
    flat(cruiser, [0.74, 0.12, 0.18], [-0.42, 1.78, 0], redLens, 'pursuit-lightbar-red');
    flat(cruiser, [0.74, 0.12, 0.18], [0.42, 1.78, 0], blueLens, 'pursuit-lightbar-blue');
    for (const z of [-0.58, 0.58]) {
      flat(cruiser, [0.08, 0.18, 0.3], [1.96, 0.76, z], GLOW.amber);
      flat(cruiser, [0.08, 0.18, 0.3], [-1.96, 0.76, z], redLens);
    }
    const red = new THREE.PointLight(0xe13d3d, 3.2, 14, 2);
    const blue = new THREE.PointLight(0x3f72e5, 3.2, 14, 2);
    red.position.set(-0.35, 1.85, 0);
    blue.position.set(0.35, 1.85, 0);
    cruiser.add(red, blue);
    cruiser.userData.beacons = { red, blue };
    cruiser.visible = i === 0;
    pursuers.push(cruiser);
  }

  return {
    group,
    spawn: new THREE.Vector3(ESCAPE_START.x, 2.4, ESCAPE_START.z + 2),
    start: ESCAPE_START,
    car,
    pursuit: pursuers[0],
    pursuers,
    roadblock,
    roads: city.roads,
    route: city.route,
    obstacles: city.obstacles,
    barriers: city.barriers,
    interactables: {
      swap, trunk, bags: bagsProp, aid, masks, jackets, weapons, wipe, depart,
    },
    colliders: [],
    floorZones: city.roads.map((road) => floorZone(road.w, road.d, 'asphalt', road.x, road.z)),
  };
}

export function buildHeistLevel(scene) {
  const phases = {
    safehouse: buildSafehouse(), van: buildVan(), bank: buildBank(), street: buildStreet(),
    garage: buildGarage(), driving: buildDriving(),
  };
  for (const phase of Object.values(phases)) { phase.group.visible = false; scene.add(phase.group); }
  const world = { colliders: [], floorZones: [] };
  let active = null;
  function activate(id) {
    if (!phases[id]) return null;
    for (const [name, phase] of Object.entries(phases)) phase.group.visible = name === id;
    active = id;
    world.colliders.length = 0;
    world.floorZones.length = 0;
    world.colliders.push(...(phases[id].colliders ?? []));
    world.floorZones.push(...(phases[id].floorZones ?? []));
    return phases[id];
  }
  return { phases, world, activate, get active() { return active; } };
}

export { HeistFigure };

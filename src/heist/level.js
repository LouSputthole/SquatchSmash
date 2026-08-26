import * as THREE from 'three';
import { buildEscapeCity, ESCAPE_START } from './city.js';
import {
  HeistFigure, makeBankGuardFigure, makeBankManagerFigure, makeHostageFigure,
} from './people.js';
import {
  makeCashBag, makeHeistCarbine, makeHeistSidearm, makeBalaclava, makePlateCarrier, makeZipTies,
} from './weapons.js';

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

function ownGeometry(node, assemblyId, policy = {}) {
  node.userData.geometryGate = {
    ...node.userData.geometryGate,
    assemblyId,
    ...policy,
  };
  return node;
}

function ownAddedChildren(group, startIndex, assemblyId, policy = {}) {
  for (const child of group.children.slice(startIndex)) {
    ownGeometry(child, assemblyId, policy);
  }
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
  const thickness = 0.25;
  // Collision-union members meet at their faces. Full-width slabs overlap at
  // every corner and turn an intentional wall run into a permanent false hit.
  return [
    bounds([width - thickness, height, thickness], [0, height / 2, -depth / 2]),
    bounds([width - thickness, height, thickness], [0, height / 2, depth / 2]),
    bounds([thickness, height, depth - thickness], [-width / 2, height / 2, 0]),
    bounds([thickness, height, depth - thickness], [width / 2, height / 2, 0]),
  ];
}

function room(group, width, depth, height, floorMaterial = MAT.concrete, {
  back = true, front = true,
} = {}) {
  const firstChild = group.children.length;
  box(group, [width, 0.2, depth], [0, -0.1, 0], floorMaterial);
  if (front) box(group, [width, height, 0.25], [0, height / 2, -depth / 2], MAT.darkConcrete);
  if (back) box(group, [width, height, 0.25], [0, height / 2, depth / 2], MAT.darkConcrete);
  box(group, [0.25, height, depth], [-width / 2, height / 2, 0], MAT.darkConcrete);
  box(group, [0.25, height, depth], [width / 2, height / 2, 0], MAT.darkConcrete);
  /* A ceiling that casts shadow would put the whole room under the key light's
   * own roof and black the floor out — it is a lid, not an occluder. */
  flat(group, [width, 0.2, depth], [0, height, 0], MAT.darkConcrete);
  ownAddedChildren(group, firstChild, `heist.${group.name}.shell`, {
    fixedSupportAnchor: true,
    structural: true,
  });
  group.children[firstChild].name = `${group.name}-floor`;
}

/** One car body, shared by the level, the street and the whole escape city. */
export function makeVehicleBody(group, position, color = 0x17191c, name = 'vehicle') {
  const root = new THREE.Group();
  root.name = name;
  root.userData.geometryGate = {
    assemblyId: `heist.vehicle.${name}`,
  };
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

/**
 * A full-height cargo van, long on local Z with its load doors at -Z.
 *
 * `makeVehicleBody` is deliberately a sedan: it is long on X, low-roofed,
 * glazed through the passenger compartment, and shared by the escape car and
 * the police fleet. Scaling that mesh made the primary van a wide car. This
 * builder gives boarding scenes a different, truthful silhouette while
 * leaving every vehicle that is meant to drive like a car alone.
 */
export function makeCargoVan(group, position, color = 0x151719, name = 'cargo-van') {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(...position);
  root.userData.kind = 'cargo-van';
  root.userData.geometryGate = {
    assemblyId: `heist.vehicle.${name}`,
  };

  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.48, roughness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0d1012, roughness: 0.78 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x17242b, transparent: true, opacity: 0.58, roughness: 0.17, metalness: 0.12,
  });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xb72b25, toneMapped: false });

  // One tall, uninterrupted load box is the read a scaled passenger car lacks.
  box(root, [2.68, 0.68, 5.72], [0, 0.72, 0.18], bodyMat, `${name}-lower-body`);
  box(root, [2.58, 2.12, 4.42], [0, 1.55, -0.34], bodyMat, `${name}-cargo-box`);
  box(root, [2.66, 0.14, 4.5], [0, 2.66, -0.3], trim, `${name}-roof-cap`);

  // The cab and short nose live at +Z; the cargo doors face the room at -Z.
  box(root, [2.5, 1.72, 1.7], [0, 1.34, 2.48], bodyMat, `${name}-cab`);
  box(root, [2.42, 0.48, 0.72], [0, 0.84, 3.28], bodyMat, `${name}-nose`);
  const windscreen = box(root, [2.14, 0.78, 0.08], [0, 1.86, 3.31], glass, `${name}-windscreen`);
  windscreen.rotation.x = -0.13;
  for (const side of [-1, 1]) {
    const sideWindow = box(root, [0.07, 0.72, 1.02], [side * 1.255, 1.82, 2.48], glass,
      `${name}-cab-window-${side < 0 ? 'left' : 'right'}`);
    sideWindow.castShadow = false;
    box(root, [0.16, 0.22, 0.38], [side * 1.43, 1.72, 2.76], trim,
      `${name}-mirror-${side < 0 ? 'left' : 'right'}`);
    // The long recessed rub rail preserves the slab-sided commercial read.
    box(root, [0.08, 0.12, 3.55], [side * 1.34, 1.3, -0.35], trim,
      `${name}-cargo-rail-${side < 0 ? 'left' : 'right'}`);
  }

  const rearZ = -2.59;
  for (const [side, label] of [[-1, 'left'], [1, 'right']]) {
    box(root, [1.23, 2.08, 0.1], [side * 0.635, 1.53, rearZ], bodyMat,
      `${name}-rear-door-${label}`);
    for (const y of [0.78, 2.2]) {
      box(root, [0.08, 0.2, 0.06], [side * 1.13, y, rearZ - 0.075], trim,
        `${name}-rear-hinge-${label}-${y < 1 ? 'low' : 'high'}`);
    }
    flat(root, [0.18, 0.38, 0.04], [side * 1.05, 0.9, rearZ - 0.085], lamp,
      `${name}-tail-light-${label}`);
  }
  box(root, [0.06, 1.96, 0.06], [0, 1.53, rearZ - 0.07], trim, `${name}-rear-seam`);
  box(root, [0.3, 0.1, 0.06], [0.2, 1.46, rearZ - 0.09], trim, `${name}-rear-handle`);
  box(root, [2.82, 0.22, 0.3], [0, 0.43, -2.7], trim, `${name}-rear-bumper`);
  flat(root, [0.52, 0.22, 0.035], [0, 0.69, -2.655], MAT.paper, `${name}-rear-plate`);

  // Two axles, four visible wheels. Their axis is X because this van is long Z.
  for (const z of [-1.72, 2.18]) {
    for (const x of [-1.37, 1.37]) {
      const wheel = mesh(root, new THREE.CylinderGeometry(0.43, 0.43, 0.28, 16),
        new THREE.MeshStandardMaterial({ color: 0x090b0c, roughness: 0.98 }), [x, 0.46, z],
        `${name}-wheel-${z < 0 ? 'rear' : 'front'}-${x < 0 ? 'left' : 'right'}`);
      wheel.rotation.z = Math.PI / 2;
      const hub = mesh(root, new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12),
        new THREE.MeshStandardMaterial({ color: 0x73777b, metalness: 0.82, roughness: 0.36 }),
        [x, 0.46, z]);
      hub.rotation.z = Math.PI / 2;
    }
  }

  // A soft proxy over the physical pair keeps both leaves one E target.
  const rearDoorTarget = box(root, [2.5, 2.26, 0.12], [0, 1.5, rearZ - 0.11],
    new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    }), 'van-door');
  rearDoorTarget.castShadow = false;
  rearDoorTarget.receiveShadow = false;
  rearDoorTarget.userData.kind = 'cargo-van-rear-doors';
  root.userData.rearDoorTarget = rearDoorTarget;

  group.add(root);
  return root;
}

/* ------------------------------------------------------------------ */
/* Safehouse                                                           */
/* ------------------------------------------------------------------ */

function buildSafehouse() {
  const group = new THREE.Group();
  group.name = 'phase-safehouse';
  // The north wall is a loading bay, not a solid wall with a vehicle clipped
  // into it. Its shell is authored below around the opening.
  room(group, 18, 14, 4.2, MAT.concrete, { back: false });

  const loadingBay = new THREE.Group();
  loadingBay.name = 'safehouse-loading-bay';
  loadingBay.userData.kind = 'loading-bay';
  ownGeometry(loadingBay, 'heist.phase-safehouse.shell', { structural: true, fixedSupportAnchor: true });
  loadingBay.position.set(0, 0, 7);
  const BAY_OPENING = 3.7;
  const BAY_WING = (18 - BAY_OPENING) / 2;
  const BAY_WING_X = BAY_OPENING / 2 + BAY_WING / 2;
  box(loadingBay, [BAY_WING, 4.2, 0.25], [-BAY_WING_X, 2.1, 0], MAT.darkConcrete,
    'loading-bay-wall-left');
  box(loadingBay, [BAY_WING, 4.2, 0.25], [BAY_WING_X, 2.1, 0], MAT.darkConcrete,
    'loading-bay-wall-right');
  box(loadingBay, [BAY_OPENING, 0.68, 0.25], [0, 3.86, 0], MAT.darkConcrete,
    'loading-bay-header');
  box(loadingBay, [0.2, 3.55, 0.38], [-1.92, 1.78, -0.04], MAT.steel,
    'loading-bay-jamb-left');
  box(loadingBay, [0.2, 3.55, 0.38], [1.92, 1.78, -0.04], MAT.steel,
    'loading-bay-jamb-right');
  const roller = mesh(loadingBay, new THREE.CylinderGeometry(0.22, 0.22, 3.48, 14),
    MAT.steel, [0, 3.48, -0.24], 'loading-bay-roller');
  roller.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const practical = new THREE.PointLight(0xffd18c, 2.5, 8, 2);
    practical.name = `loading-bay-task-light-${side < 0 ? 'left' : 'right'}`;
    practical.position.set(side * 2.5, 3.18, -0.9);
    loadingBay.add(practical);
    flat(loadingBay, [0.62, 0.12, 0.34], [side * 2.5, 3.3, -0.2], GLOW.amber,
      `loading-bay-lamp-${side < 0 ? 'left' : 'right'}`);
  }
  group.add(loadingBay);

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
  // Painted guide lines make the empty floor a loading apron and make the
  // van's direction legible even before the player reaches the doors.
  flat(group, [0.1, 0.018, 4.1], [-1.7, 0.012, 4.75], MAT.warning, 'loading-apron-stripe-left');
  flat(group, [0.1, 0.018, 4.1], [1.7, 0.012, 4.75], MAT.warning, 'loading-apron-stripe-right');
  flat(group, [3.5, 0.018, 0.12], [0, 0.012, 2.72], MAT.warning, 'loading-apron-stop-line');

  for (const [index, x] of [-7, -5.1, 6.8].entries()) {
    const locker = new THREE.Group();
    locker.name = `prep-locker-${index + 1}`;
    locker.userData.kind = 'prep-locker';
    ownGeometry(locker, `heist.safehouse.locker.${index + 1}`);
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
  evidence.userData.geometryGate = {
    assemblyId: 'heist.safehouse.evidence-board',
  };
  // Five millimetres off the finished wall face: visibly mounted and inside
  // the gate's four-centimetre fixed-anchor tolerance.
  evidence.position.set(0.5, 2.35, -6.81);
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

  /* ---------------------------------------------------------------- *
   * The briefing table.
   *
   * Owner: *"the briefing tabletop needs a rework — it's unclear what to
   * do"*. He was looking at a blank sheet of paper with four red dashes and
   * five brass discs on it, plus one white card block. Nothing on that table
   * said what the four dashes were, which end of them the job started at, or
   * that the white block was the bank — so the plan the whole mission is
   * about was a decoration.
   *
   * It is a PLAN now, and it reads left to right in the order the night
   * happens, because that is the only ordering a player can pick up without
   * being told:
   *
   *   1 THE BANK       west end, in white card with its columns and steps
   *   2 MERCER STREET  the asphalt strip out of its doors
   *   3 THE GARAGE     the concrete box with its ramp
   *   4 THE SWAP YARD  the shed on the canal, east end
   *
   * Each site stands on a coloured base — green where the crew is meant to
   * be, red where it goes wrong — and each carries a pip block counting its
   * number, which is the only way to number something on a table without
   * putting a font in the scene. The route between them is one continuous
   * bright line rather than four floating dashes, with an arrow head on it,
   * so which way you travel is visible rather than inferred.
   * ---------------------------------------------------------------- */
  const briefing = new THREE.Group();
  briefing.name = 'briefing-map';
  ownGeometry(briefing, 'heist.safehouse.briefing-map');
  briefing.position.set(0, 0, 0.2);
  box(briefing, [5.8, 0.18, 2.4], [0, 0.88, 0], MAT.wood, 'briefing-table-top');
  for (const x of [-2.45, 2.45]) {
    for (const z of [-0.85, 0.85]) box(briefing, [0.24, 0.88, 0.24], [x, 0.43, z], MAT.steel);
  }
  // The plan sheet, with a printed border and a survey grid on it.
  box(briefing, [4.75, 0.035, 1.78], [0, 0.99, 0], MAT.paper, 'briefing-plan-sheet');
  /* THE SURFACE EVERYTHING ON THIS TABLE STANDS ON.
   *
   * Owner: *"tabletop rework"*, for the brief as well as the debrief. Every
   * model on this plan — all four site cards, the route line, the four site
   * pads — was authored at a hand-picked y between 1.02 and 1.035, and the
   * paper's top face is at 1.0075. So the whole plan hovered one to two and a
   * half centimetres over the sheet it is supposed to be drawn on, which at
   * this scale is a card model the height of its own doorway off the ground.
   * It reads as a diorama that has been knocked, and it is why the table did
   * not look like a plan.
   *
   * `scene-audit` never caught it and never will: its FLOATING rule allows
   * 12 cm of support gap, because that tolerance is what stops it reporting
   * every chair leg in the mansion. This one is measured by
   * `heist-level-presentation.test.mjs` instead, against this constant, so
   * the next thing put on this table has a number to sit on.
   *
   * The 0.8 mm is not decoration. Seating a face EXACTLY on another face is
   * the other half of the same problem — two surfaces at one depth fighting
   * for the pixel, which is `scene-audit`'s COPLANAR class and the owner's
   * "black bar, non-stop flicker" everywhere else it has turned up. Seating
   * the plan on 1.0075 put the route line's underside on the paper's top face
   * and the audit reported it over 0.39 m². Less than a millimetre is under
   * the eye and over the depth buffer. */
  const SHEET_TOP = 0.99 + 0.035 / 2;
  const PLAN_TOP = SHEET_TOP + 0.0008;
  for (const [w, d, z] of [[4.55, 0.02, -0.84], [4.55, 0.02, 0.84]]) {
    flat(briefing, [w, 0.006, d], [0, 1.009, z], MAT.ink);
  }
  for (const x of [-2.28, 2.28]) flat(briefing, [0.02, 0.006, 1.7], [x, 1.009, 0], MAT.ink);
  for (let i = -5; i <= 5; i++) flat(briefing, [0.008, 0.004, 1.62], [i * 0.4, 1.008, 0], MAT.marbleDark);
  for (let i = -2; i <= 2; i++) flat(briefing, [4.4, 0.004, 0.008], [0, 1.008, i * 0.34], MAT.marbleDark);
  // A title block along the top edge: the red band a plan always has.
  flat(briefing, [1.5, 0.006, 0.16], [-1.55, 1.009, -0.7], MAT.warning, 'briefing-title-block');
  for (let i = 0; i < 5; i++) flat(briefing, [0.22, 0.005, 0.03], [-2.1 + i * 0.26, 1.013, -0.7], MAT.paper);

  /* The route: one continuous line through the four sites, with an arrow head
   * at the far end. Four disconnected dashes are a pattern; a line with a
   * point on it is a direction. */
  const route = new THREE.Group();
  route.name = 'blueprint-route';
  // Legs are 2 cm thick and centred on the group, so the group sits a
  // centimetre proud of the paper and the ink lies ON it.
  route.position.y = PLAN_TOP + 0.01;
  const legs = [
    [-1.62, 0.5, -0.62, 0.16], [-0.62, 0.16, 0.34, -0.2],
    [0.34, -0.2, 1.24, -0.44], [1.24, -0.44, 2.02, -0.56],
  ];
  for (const [ax, az, bx, bz] of legs) {
    const length = Math.hypot(bx - ax, bz - az);
    const leg = box(route, [length, 0.02, 0.05],
      [(ax + bx) / 2, 0, (az + bz) / 2], MAT.warning);
    leg.rotation.y = -Math.atan2(bz - az, bx - ax);
    leg.castShadow = false;
  }
  const head = mesh(route, new THREE.ConeGeometry(0.09, 0.2, 4), MAT.warning, [2.12, 0, -0.58]);
  head.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - 0.15);
  /* Flattened to the thickness of the line it terminates. Laid on its side a
   * cone is 18 cm of solid pyramid: it hung 6 cm THROUGH the plan sheet and
   * stood three times the height of its own route line above it. */
  head.scale.z = 0.11;
  head.castShadow = false;
  head.name = 'blueprint-route-arrow';
  briefing.add(route);

  /* The four sites. `pips` is the site's number, counted in blocks, because
   * a numeral on a tabletop needs a font and a font needs a canvas. */
  const SITES = [
    { id: 'bank', x: -1.62, z: 0.5, pips: 1, good: true },
    { id: 'street', x: -0.62, z: 0.16, pips: 2, good: false },
    { id: 'garage', x: 0.34, z: -0.2, pips: 3, good: false },
    { id: 'swap', x: 1.24, z: -0.44, pips: 4, good: true },
  ];
  const siteMarkers = [];
  for (const site of SITES) {
    const marker = new THREE.Group();
    marker.name = `briefing-site-${site.id}`;
    marker.position.set(site.x, PLAN_TOP + 0.006, site.z);
    // The base pad: green where the crew is meant to be, red where it is not.
    flat(marker, [0.46, 0.012, 0.36], [0, 0, 0],
      site.good ? new THREE.MeshStandardMaterial({ color: 0x3f6b46, roughness: 0.9 }) : MAT.warning);
    // The pip strip along the front edge: one block per step of the plan.
    for (let i = 0; i < site.pips; i++) {
      flat(marker, [0.035, 0.014, 0.035], [-0.16 + i * 0.055, 0.009, 0.15], MAT.ink);
    }
    briefing.add(marker);
    siteMarkers.push(marker);
  }

  /* 1 — THE BANK, in card: the facade, its four columns, and the steps. */
  const bankCard = new THREE.Group();
  bankCard.name = 'briefing-bank-model';
  bankCard.position.set(-1.62, PLAN_TOP, 0.5);
  box(bankCard, [0.62, 0.3, 0.34], [0, 0.15, -0.04], MAT.paper);
  for (let i = 0; i < 4; i++) box(bankCard, [0.045, 0.24, 0.045], [-0.2 + i * 0.135, 0.12, 0.14], MAT.paper);
  box(bankCard, [0.66, 0.06, 0.06], [0, 0.31, 0.02], MAT.paper);
  for (let i = 0; i < 3; i++) flat(bankCard, [0.5, 0.014, 0.05], [0, 0.012 + i * 0.014, 0.18 + i * 0.045], MAT.marbleDark);
  briefing.add(bankCard);

  /* 2 — MERCER STREET: the strip of road, its kerbs, and the dead van. */
  const streetCard = new THREE.Group();
  streetCard.name = 'briefing-street-model';
  streetCard.position.set(-0.62, PLAN_TOP, 0.16);
  flat(streetCard, [0.16, 0.014, 0.42], [0, 0.008, 0], MAT.asphalt);
  for (const side of [-1, 1]) flat(streetCard, [0.03, 0.02, 0.42], [side * 0.095, 0.012, 0], MAT.marbleDark);
  for (let i = -1; i <= 1; i++) flat(streetCard, [0.014, 0.004, 0.06], [0, 0.017, i * 0.12], MAT.paper);
  box(streetCard, [0.07, 0.05, 0.12], [0.02, 0.04, -0.1], MAT.darkConcrete, 'briefing-street-van');
  briefing.add(streetCard);

  /* 3 — THE GARAGE: a concrete box with its mouth open and its ramp out. */
  const garageCard = new THREE.Group();
  garageCard.name = 'briefing-garage-model';
  garageCard.position.set(0.34, PLAN_TOP, -0.2);
  for (const side of [-1, 1]) box(garageCard, [0.05, 0.22, 0.3], [side * 0.16, 0.11, 0], MAT.darkConcrete);
  box(garageCard, [0.37, 0.22, 0.05], [0, 0.11, -0.175], MAT.darkConcrete);
  box(garageCard, [0.37, 0.04, 0.3], [0, 0.24, 0], MAT.darkConcrete);
  const gRamp = flat(garageCard, [0.2, 0.014, 0.2], [0, 0.05, 0.2], MAT.concrete);
  gRamp.rotation.x = 0.4;
  box(garageCard, [0.09, 0.05, 0.16], [0, 0.04, -0.02], MAT.steel, 'briefing-garage-sedan');
  briefing.add(garageCard);

  /* 4 — THE SWAP YARD: the shed, the fence, and the clean car under it. */
  const swapCard = new THREE.Group();
  swapCard.name = 'briefing-swap-model';
  swapCard.position.set(1.24, PLAN_TOP, -0.44);
  box(swapCard, [0.34, 0.16, 0.24], [0, 0.08, -0.03], MAT.steel);
  const roof = box(swapCard, [0.38, 0.02, 0.28], [0, 0.17, -0.03], MAT.darkConcrete);
  roof.rotation.z = 0.08;
  for (let i = 0; i < 5; i++) box(swapCard, [0.008, 0.09, 0.008], [-0.16 + i * 0.08, 0.045, 0.14], MAT.brass);
  box(swapCard, [0.1, 0.045, 0.16], [0.02, 0.03, 0.06], MAT.marbleDark, 'briefing-swap-car');
  briefing.add(swapCard);

  /* The things on a table people have been sitting at for two hours: an
   * ashtray, two mugs, a scale rule, a pack of photographs weighed down. */
  box(briefing, [0.3, 0.09, 0.22], [2.05, 1.02, 0.62], MAT.darkConcrete);
  mesh(briefing, new THREE.CylinderGeometry(0.06, 0.05, 0.11, 10), MAT.paper, [1.7, 1.04, 0.5]);
  mesh(briefing, new THREE.CylinderGeometry(0.06, 0.05, 0.11, 10), MAT.paper, [-1.95, 1.04, 0.72]);
  box(briefing, [0.19, 0.04, 0.12], [-2.1, 1.01, -0.6], MAT.warning);
  const rule = box(briefing, [0.62, 0.012, 0.05], [-1.1, 1.015, 0.78], MAT.brass, 'briefing-scale-rule');
  rule.rotation.y = 0.14;
  for (let i = 0; i < 4; i++) {
    const photo = box(briefing, [0.24, 0.006, 0.18], [0.75 + i * 0.02, 1.012 + i * 0.006, 0.72], MAT.paper);
    photo.rotation.y = -0.1 + i * 0.07;
  }

  /* ---------------------------------------------------------------- *
   * The same table, at the end of the night.
   *
   * Owner: *"debrief: tabletop rework + clear objective"*, and — from the
   * pass before — *"everyone is just waiting for me at the end, not sure
   * what the debrief shit is either"*. The debrief happens at THIS table, and
   * the table was still showing the plan: a route to a bank the crew had
   * already robbed, with the money nowhere on it. The one thing the debrief
   * is about is the count, and the count lived in a panel in the corner of
   * the screen — so the room the player was standing in said nothing.
   *
   * `setDebrief` swaps the table over. The plan comes off — route, site pads
   * and all four card models — and what came home goes on: one bag per
   * recovered bag, in a row along the back edge, each with its cash out in
   * front of it in banded bundles. Eight bags is a full table. Six is a table
   * with two gaps in it, which is a thing you can see from the doorway.
   *
   * The row deliberately avoids the ashtray, the two mugs, the scale rule and
   * the photographs, which stay: people are still sitting here. A first pass
   * put the bags in two rows and swallowed a coffee mug inside bag seven.
   * ---------------------------------------------------------------- */
  const planning = [bankCard, streetCard, garageCard, swapCard, route, ...siteMarkers];
  const takeGroup = new THREE.Group();
  takeGroup.name = 'briefing-take';
  takeGroup.visible = false;
  briefing.add(takeGroup);
  const takeBags = [];
  const takeStacks = [];
  /* The bag body is 0.27 tall about its own origin and the row is scaled to
   * 0.92, so this is the height that puts eight canvas bottoms on the paper. */
  const BAG_SCALE = 0.92;
  const BAG_Y = PLAN_TOP + 0.135 * BAG_SCALE;
  for (let i = 0; i < 8; i++) {
    const x = -1.47 + i * 0.42;
    const bag = makeCashBag({ full: true });
    bag.name = `debrief-bag-${i + 1}`;
    bag.position.set(x, BAG_Y, -0.62);
    bag.rotation.y = (i % 3 - 1) * 0.14;
    bag.scale.setScalar(BAG_SCALE);
    takeGroup.add(bag);
    takeBags.push(bag);
    /* The cash out of that bag: six banded bundles, two across and three
     * high, sitting in front of it where a count gets stacked. */
    const stack = new THREE.Group();
    stack.name = `debrief-stack-${i + 1}`;
    stack.position.set(x, PLAN_TOP, 0.06);
    for (let s = 0; s < 6; s++) {
      const bx = (s % 2 ? 0.075 : -0.075);
      const by = 0.016 + Math.floor(s / 2) * 0.032;
      const note = box(stack, [0.14, 0.03, 0.1], [bx, by, 0], MAT.cash);
      note.rotation.y = (s % 2 ? 1 : -1) * 0.07;
      const band = box(stack, [0.042, 0.033, 0.105], [bx, by, 0], MAT.warning);
      band.rotation.y = note.rotation.y;
    }
    takeGroup.add(stack);
    takeStacks.push(stack);
  }
  /* The ledger Numbskull reads the count off, in the corner Lou sits in. */
  const ledger = box(takeGroup, [0.46, 0.03, 0.32], [2.02, PLAN_TOP + 0.015, -0.5],
    MAT.paper, 'debrief-ledger');
  ledger.rotation.y = -0.18;
  for (let i = 0; i < 6; i++) {
    box(takeGroup, [0.3 - i * 0.02, 0.008, 0.014],
      [2.0, PLAN_TOP + 0.033, -0.6 + i * 0.04], MAT.ink).rotation.y = -0.18;
  }

  /**
   * Turn the table from a plan into a count, or back.
   *
   * @param {number} bags how many of the eight came home
   * @param {boolean} [on] false puts the plan back — a checkpoint that resumes
   *   BEFORE the return has to rebuild a table nobody has counted on yet
   */
  briefing.userData.setDebrief = (bags = 0, on = true) => {
    for (const part of planning) part.visible = !on;
    takeGroup.visible = on;
    const home = Math.max(0, Math.min(takeBags.length, Math.round(bags)));
    for (let i = 0; i < takeBags.length; i++) {
      takeBags[i].visible = i < home;
      takeStacks[i].visible = i < home;
    }
    briefing.userData.debriefBags = on ? home : 0;
    briefing.userData.debriefShowing = on;
  };
  briefing.userData.planTop = PLAN_TOP;
  briefing.userData.debriefShowing = false;
  briefing.userData.debriefBags = 0;
  group.add(briefing);

  /* The vest, on a stand, facing the room.
   *
   * Owner, twice: *"vest model still looks bad"*. It was six boxes — a slab
   * for the body, two for the shoulders, three pouches — at nearly a metre
   * across, which is a wardrobe rather than a plate carrier. It is the
   * modelled `makePlateCarrier` now, at the size a carrier actually is
   * (34 cm across the plate), hanging on a mannequin torso so it reads as
   * something a person takes off a stand and puts on.
   */
  const armor = new THREE.Group();
  armor.name = 'safehouse-armor';
  ownGeometry(armor, 'heist.safehouse.armor');
  armor.position.set(-5.5, 0, 2.8);
  box(armor, [0.09, 1.35, 0.09], [0, 0.68, -0.16], MAT.steel, 'armor-stand');
  box(armor, [0.62, 0.07, 0.42], [0, 0.05, -0.16], MAT.steel);
  mesh(armor, new THREE.CylinderGeometry(0.15, 0.19, 0.5, 10), MAT.darkConcrete, [0, 1.3, -0.16])
    .name = 'armor-mannequin';
  box(armor, [0.34, 0.1, 0.26], [0, 1.6, -0.16], MAT.darkConcrete);
  const armorParts = [];
  const vest = makePlateCarrier({ colour: 0x1d2224, loaded: true });
  vest.name = 'armor-vest-body';
  vest.position.set(0, 1.32, -0.1);
  vest.scale.setScalar(1.15);
  armor.add(vest);
  armorParts.push(vest);
  // A spare set of gloves and a plate bag under the stand, so the corner is a
  // place gear lives rather than a plinth with one object on it.
  const gloves = box(armor, [0.3, 0.06, 0.18], [0.34, 0.09, 0.1], MAT.tactical, 'armor-gloves');
  armorParts.push(gloves);
  armor.userData.setEquipped = (value) => armorParts.forEach((part) => { part.visible = !value; });
  group.add(armor);

  /* The loadout table now carries the modelled weapons rather than four boxes:
   * the same carbine and sidearm that end up in the player's hands, so the
   * thing he picks up is visibly the thing he then holds. */
  const loadout = new THREE.Group();
  loadout.name = 'safehouse-loadout';
  ownGeometry(loadout, 'heist.safehouse.loadout');
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
    const side = x < 0 ? 'left' : 'right';
    const fixture = new THREE.Group();
    fixture.name = `safehouse-strip-light-${side}`;
    ownGeometry(fixture, `heist.safehouse.strip-light.${side}`);
    group.add(fixture);
    const light = new THREE.PointLight(0xffd89d, 2.8, 11, 2);
    light.name = `safehouse-overhead-${side}`;
    light.position.set(x, 3.45, 0);
    fixture.add(light);
    const fitting = box(fixture, [2.4, 0.12, 0.34], [x, 3.5, 0], MAT.steel,
      `safehouse-strip-light-body-${side}`);
    fitting.castShadow = false;
    flat(fixture, [2.2, 0.05, 0.28], [x, 3.42, 0], GLOW.amber,
      `safehouse-strip-light-glow-${side}`);
    for (let i = -2; i <= 2; i++) box(fixture, [0.03, 0.16, 0.32],
      [x + i * 0.5, 3.42, 0], MAT.steel, `safehouse-strip-light-cage-${side}-${i + 3}`);
    // The old fitting stopped 54 cm below the ceiling with nothing holding it.
    // Two hangers now join its top to the underside of the room shell.
    for (const dx of [-0.8, 0.8]) box(fixture, [0.04, 0.54, 0.04],
      [x + dx, 3.83, 0], MAT.steel, `safehouse-strip-light-hanger-${side}`);
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
  ownGeometry(bench, 'heist.safehouse.bench');
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
  urn.name = 'safehouse-coffee-urn';
  ownGeometry(urn, 'heist.safehouse.coffee-urn');
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
  const clockAssembly = new THREE.Group();
  clockAssembly.name = 'safehouse-clock';
  ownGeometry(clockAssembly, 'heist.safehouse.clock');
  // Back of the 6 cm case is tangent to the west wall's inner face.
  clockAssembly.position.set(-8.845, 3.1, 2.4);
  const clock = mesh(clockAssembly, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16),
    MAT.paper, [0, 0, 0], 'safehouse-clock-face');
  clock.rotation.z = Math.PI / 2;
  box(clockAssembly, [0.04, 0.2, 0.03], [0.07, 0.08, 0], MAT.ink, 'safehouse-clock-hand');
  group.add(clockAssembly);

  /* Nose outside, cargo doors inside: this van is backed through the bay
   * instead of parked sideways across the work floor. */
  const van = makeCargoVan(group, [0, 0, 6.45], 0x151719, 'primary-van');
  const vanDoor = van.userData.rearDoorTarget;

  return {
    group,
    // Clear apron between the briefing and the rear doors. The old 4.9 spawn
    // was physically inside the scaled car and collision resolution decided
    // which side of the alleged van the player appeared on.
    spawn: new THREE.Vector3(0, 1.66, 2.25),
    interactables: { briefing, armor, loadout, van: vanDoor },
    colliders: [
      // Safehouse shell with a real 3.7 m opening at the loading bay.
      bounds([17.75, 4.2, 0.25], [0, 2.1, -7]),
      bounds([0.25, 4.2, 13.75], [-9, 2.1, 0]),
      bounds([0.25, 4.2, 13.75], [9, 2.1, 0]),
      bounds([7.025, 4.2, 0.25], [-5.3625, 2.1, 7]),
      bounds([7.025, 4.2, 0.25], [5.3625, 2.1, 7]),
      bounds([BAY_OPENING, 0.68, 0.25], [0, 3.86, 7]),
      bounds([5.8, 1.05, 2.4], [0, 0.52, 0.2]),
      bounds([4.1, 1.2, 1.5], [4.7, 0.6, 2.5]),
      bounds([2.9, 2.9, 6.35], [0, 1.45, 6.45]),
      bounds([1.1, 1.1, 4.2], [-8.2, 0.55, -1.6]),
      bounds([1.1, 1.1, 1.6], [8.2, 0.55, -3.4]),
    ],
    floorZones: [floorZone(18, 14, 'concrete')],
  };
}

/* ------------------------------------------------------------------ */
/* Van                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Where the top of the van's bench cushion is, in metres.
 *
 * Not a taste number: it is the height of a `HeistFigure.seated()` hip with
 * that figure's boots on y=0, measured on the campaign's 1.78 m frame. The
 * seat is placed from the pose rather than the pose from the seat, which is
 * the only ordering that survives somebody changing a leg length.
 */
export const VAN_SEAT_HEIGHT = 0.5;

function buildVan() {
  const group = new THREE.Group();
  group.name = 'phase-van';
  group.userData.geometryGate = {
    assemblyId: 'heist.van.interior',
  };
  /* The first captured interior was functionally black: one 1.1-intensity
   * bulb over near-black concrete panels gave the renderer no gradients to
   * return. These are still work-van colours, but painted metal rather than
   * an unlit void. */
  const vanWall = new THREE.MeshStandardMaterial({
    color: 0x5b6469, metalness: 0.24, roughness: 0.76,
  });
  const vanCeiling = new THREE.MeshStandardMaterial({
    color: 0x4a5358, metalness: 0.2, roughness: 0.82,
  });
  const vanDoor = new THREE.MeshStandardMaterial({
    color: 0x626b70, metalness: 0.35, roughness: 0.62,
  });
  const vanBench = new THREE.MeshStandardMaterial({ color: 0x59483b, roughness: 0.88 });
  const vanCushion = new THREE.MeshStandardMaterial({ color: 0x877159, roughness: 0.92 });
  const vanRubber = new THREE.MeshStandardMaterial({ color: 0x343e43, roughness: 0.98 });

  box(group, [3.6, 0.16, 6.4], [0, -0.08, 0], MAT.steel, 'van-floor');
  box(group, [3.6, 2.8, 0.14], [0, 1.4, 3.13], vanWall, 'van-bulkhead-wall');
  box(group, [0.14, 2.8, 6.4], [-1.73, 1.4, 0], vanWall, 'van-wall-left');
  box(group, [0.14, 2.8, 6.4], [1.73, 1.4, 0], vanWall, 'van-wall-right');
  box(group, [3.6, 0.16, 6.4], [0, 2.78, 0], vanCeiling, 'van-ceiling');
  /* Benches down both sides, ribbed walls, grab rails, a strapped equipment
   * case and the bulkhead window through to the cab.
   *
   * THE SEAT IS AT SITTING HEIGHT NOW. It was a 62 cm block with a cushion on
   * top of it, so the cushion's surface was at 96 cm — a bar stool, in a van,
   * for people 1.78 m tall. Nobody could sit on it, which is a good part of
   * why nobody did: `VAN_SEAT_HEIGHT` is the measured height of the hips in
   * `HeistFigure.seated()` with the feet on this floor, so the seat arrives
   * under the man rather than the man being posed to reach the seat.
   *
   * The pan also reaches further INBOARD than the block did (to x 0.94 from
   * x 1.01) because a seated man's thighs run across it toward the aisle, and
   * the block under it is set back so his boots land on open floor. */
  for (const [side, label] of [[-1, 'left'], [1, 'right']]) {
    box(group, [0.5, VAN_SEAT_HEIGHT - 0.12, 4.8], [side * 1.42, (VAN_SEAT_HEIGHT - 0.12) / 2, 0.1],
      vanBench, `van-bench-${label}`);
    box(group, [0.72, 0.12, 4.72], [side * 1.30, VAN_SEAT_HEIGHT - 0.06, 0.1], vanCushion,
      `van-bench-cushion-${label}`);
    box(group, [0.14, 0.95, 4.72], [side * 1.60, VAN_SEAT_HEIGHT + 0.475, 0.1], vanCushion,
      `van-bench-back-${label}`);
    for (const z of [-1.55, -0.45, 0.65, 1.75]) {
      box(group, [0.74, 0.025, 0.045], [side * 1.30, VAN_SEAT_HEIGHT + 0.007, z], MAT.webbing,
        `van-bench-seam-${label}-${z}`);
    }
  }
  for (let i = -6; i <= 6; i++) {
    box(group, [0.05, 2.4, 0.05], [-1.64, 1.4, i * 0.45], MAT.steel,
      `van-wall-rib-left-${i + 7}`);
    box(group, [0.05, 2.4, 0.05], [1.64, 1.4, i * 0.45], MAT.steel,
      `van-wall-rib-right-${i + 7}`);
  }
  for (const z of [-1.65, -0.55, 0.55, 1.65]) {
    box(group, [0.05, 0.05, 0.55], [-1.0, 1.8, z], MAT.brass);
    box(group, [0.05, 0.05, 0.55], [1.0, 1.8, z], MAT.brass);
  }
  const bulkhead = box(group, [1.2, 0.7, 0.06], [0, 1.7, 3.08], MAT.glass, 'van-bulkhead-window');
  bulkhead.castShadow = false;
  const kit = box(group, [1.0, 0.42, 0.6], [0, 0.22, 2.3], MAT.tactical, 'van-equipment-case');
  box(group, [1.05, 0.06, 0.08], [0, 0.46, 2.3], MAT.webbing);

  /* Two local pools, total intensity 4.8. The central dome reveals the five
   * occupied seats; the shorter rear pool gives the exit beat a destination.
   * Neither spills beyond this six-metre box. */
  box(group, [0.92, 0.1, 0.42], [0, 2.68, 0.55], MAT.steel, 'van-dome-fixture');
  flat(group, [0.74, 0.045, 0.3], [0, 2.62, 0.55], GLOW.amber, 'van-dome-lens');
  const dome = new THREE.PointLight(0xffd39a, 2.7, 6.4, 2);
  dome.name = 'van-dome-task-light';
  dome.position.set(0, 2.4, 0.55);
  group.add(dome);

  box(group, [1.72, 0.1, 0.34], [0, 2.66, -2.22], MAT.steel, 'van-rear-task-fixture');
  flat(group, [1.48, 0.045, 0.22], [0, 2.6, -2.22], GLOW.amber, 'van-rear-task-lens');
  const rearTask = new THREE.PointLight(0xffdfb0, 2.1, 4.8, 2);
  rearTask.name = 'van-rear-task-light';
  rearTask.position.set(0, 2.34, -2.22);
  group.add(rearTask);

  flat(group, [1.3, 0.025, 5.05], [0, 0.018, -0.05], vanRubber, 'van-aisle-runner');
  for (const z of [-1.8, -0.9, 0, 0.9, 1.8]) {
    flat(group, [1.14, 0.012, 0.035], [0, 0.036, z], MAT.steel, `van-aisle-rib-${z}`);
  }

  const door = box(group, [2.4, 2.5, 0.14], [0, 1.25, -3.13], vanDoor, 'van-interior-door');
  for (const [side, label] of [[-1, 'left'], [1, 'right']]) {
    box(group, [1.02, 0.88, 0.035], [side * 0.58, 1.55, -3.04], vanCeiling,
      `van-rear-door-panel-${label}`);
    flat(group, [0.34, 0.12, 0.025], [side * 0.84, 0.46, -3.015], GLOW.alarm,
      `van-rear-door-reflector-${label}`);
    box(group, [0.1, 0.5, 0.06], [side * 0.5, 1.3, -3.0], MAT.brass,
      `van-rear-door-latch-${label}`);
  }

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
      bounds([0.74, VAN_SEAT_HEIGHT, 4.8], [-1.30, VAN_SEAT_HEIGHT / 2, 0.1]),
      bounds([0.74, VAN_SEAT_HEIGHT, 4.8], [1.30, VAN_SEAT_HEIGHT / 2, 0.1]),
    ],
    floorZones: [floorZone(3.6, 6.4, 'metal')],
  };
}

/* ------------------------------------------------------------------ */
/* Bank                                                                */
/* ------------------------------------------------------------------ */

/**
 * Where the crew piles the cash before the doors go.
 *
 * Off the entrance centre line on purpose: the crew come through x 0 and the
 * player spawns on it, and a heap of duffles in a doorway is a heap of
 * duffles somebody is standing in.
 */
export const STAGING_POINT = Object.freeze({ x: -1.6, z: 9.2 });

/** Where the twenty-two lobby civilians stand when the doors come in. */
export const LOBBY_ANCHORS = Object.freeze([
  /* The queue at the teller line, facing the counter — and standing clear of
   * it. The counter's front face is at z −1.975; a customer told to get down
   * lies along the way they are facing, so anybody inside about 1.8 m of the
   * counter lies through it. These start at z +0.4. */
  /* Every one of these six used to be `yaw: Math.PI` to the last digit, and
   * the staging gate is what noticed: FACING_UNIFORM, four customers inside
   * one 6 m bucket pointed the same way to within 2°. A queue facing the
   * counter is right; a queue facing the counter to nine decimal places is the
   * owner's *"they are all looking forward at the same spot"*, one room over
   * from where he first wrote it. So they still face the counter, and no two
   * of them agree about exactly where it is: the man at the front is square
   * on, the ones behind him are half-turned out of boredom, and the last is
   * looking at the door because he has been here twenty minutes.
   *
   * The offsets are authored constants rather than jitter on purpose -- a
   * random yaw would move the geometry gate's recorded buckets on every
   * build. */
  { x: -5.2, z: 0.4, yaw: Math.PI - 0.05 }, { x: -3.6, z: 0.9, yaw: Math.PI + 0.21 },
  { x: -2.0, z: 0.6, yaw: Math.PI - 0.28 }, { x: -0.4, z: 1.1, yaw: Math.PI + 0.13 },
  { x: 1.2, z: 0.7, yaw: Math.PI - 0.34 }, { x: 2.8, z: 1.2, yaw: Math.PI + 0.52 },
  /* THE TELLERS, BEHIND THE COUNTER — and turned along it.
   *
   * Owner: *"bank teller NPCs clip through the counter"*. They stood at
   * z −3.1 facing +Z, and the counter is a solid 17.2 × 0.85 m box whose back
   * face is at z −2.825. Twenty-seven centimetres of clearance is already
   * inside a standing figure's own depth; and the instant one of them was
   * ordered down, `prone()` laid them out ALONG THEIR FACING — 1.7 m of
   * person straight through the counter, the tills and the glass.
   *
   * They are at z −3.9 now, a working arm's length behind the counter, and
   * turned to face down the line rather than across it. Told to get down,
   * they lie in the clear run of floor between the counter and the vault
   * corridor, which is where a teller behind a counter would actually end up.
   */
  /* The two west windows moved out from x −2.6 to make room for the vault
   * door to swing. It is hinged on the west jamb and its free edge sweeps to
   * x −2.45 at z −3.0, which is exactly where the second teller was standing
   * — the geometry gate found her inside the leaf the moment the door became
   * a thing that moves rather than a thing that teleports. */
  { x: -7.4, z: -3.9, yaw: -Math.PI / 2 + 0.35, role: 'teller' },
  { x: -4.9, z: -3.9, yaw: -Math.PI / 2 + 0.48, role: 'teller' },
  { x: 0.9, z: -3.9, yaw: Math.PI / 2 - 0.22, role: 'teller' },
  { x: 4.4, z: -3.9, yaw: Math.PI / 2 - 0.41, role: 'teller' },
  // The writing desks and the waiting seats on the east side.
  { x: 5.5, z: 2.4, yaw: -1.9 }, { x: 7.6, z: 1.2, yaw: -2.4 },
  { x: 8.5, z: 3.8, yaw: -1.2 }, { x: 5.4, z: 5.5, yaw: -0.8 },
  // The manager's desks on the west side.
  { x: -8.2, z: 2.8, yaw: 1.9, role: 'clerk' }, { x: -5.5, z: 5.5, yaw: 1.4, role: 'clerk' },
  { x: -8.8, z: 5.5, yaw: 0.9 },
  /* Near the doors, which is where the people who nearly got out are — but
   * clear of x 0, because that is the doorway the crew comes through and a
   * stranger's shoulder blades filling the frame on entry is not an entrance. */
  { x: -3.0, z: 7.9, yaw: 0.3 }, { x: 3.1, z: 8.4, yaw: -0.4 },
  { x: 5.8, z: 8.1, yaw: -0.7 }, { x: -6.9, z: 7.9, yaw: 0.5 },
  { x: -3.2, z: 5.5, yaw: 0.1 },
]);

function buildTellerLine(group) {
  const line = new THREE.Group();
  line.name = 'teller-line';
  ownGeometry(line, 'heist.bank.teller-line');
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
  const rearShellStart = group.children.length;
  for (const side of [-1, 1]) {
    box(group, [6.8, 6.4, 0.25], [side * 7.6, 3.2, -11], MAT.darkConcrete, `bank-rear-wall-${side}`);
  }
  box(group, [8.4, 2.6, 0.25], [0, 5.1, -11], MAT.darkConcrete, 'bank-vault-lintel');
  box(group, [8.9, 0.3, 0.4], [0, 3.75, -11], MAT.brass, 'bank-vault-arch');
  ownAddedChildren(group, rearShellStart, 'heist.phase-bank.shell', { structural: true, fixedSupportAnchor: true });

  // A veined marble floor with a compass inlay, because a bank floor is the
  // first thing you see and a flat grey slab reads as an empty level.
  for (let i = -5; i <= 5; i++) {
    flat(group, [21.6, 0.012, 0.09], [0, 0.007, i * 2], MAT.marbleDark);
    flat(group, [0.09, 0.012, 21.6], [i * 2, 0.007, 0], MAT.marbleDark);
  }
  const inlayStart = group.children.length - 22;
  const inlay = mesh(group, new THREE.CylinderGeometry(2.3, 2.3, 0.02, 24), MAT.marbleDark, [0, 0.012, 3.2]);
  inlay.castShadow = false;
  const inlayInner = mesh(group, new THREE.CylinderGeometry(1.75, 1.75, 0.03, 24), MAT.brass, [0, 0.016, 3.2]);
  inlayInner.castShadow = false;
  ownAddedChildren(group, inlayStart, 'heist.bank.floor-inlay', { overlap: false });

  const columnXs = [-8, -4.4, 4.4, 8];
  for (const [index, x] of columnXs.entries()) {
    const columnStart = group.children.length;
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
    ownAddedChildren(group, columnStart, `heist.bank.column.${index + 1}`);
  }

  buildTellerLine(group);

  // A coffered ceiling with pendant fittings, and a mezzanine rail behind the
  // teller line — vertical detail is what stops a big room reading as a box.
  const ceilingStart = group.children.length;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const coffer = flat(group, [3.6, 0.22, 3.6], [i * 4, 6.08, j * 4], MAT.marbleDark);
      coffer.receiveShadow = false;
    }
  }
  for (const [x, z] of [[-6, 3], [0, 3], [6, 3], [-6, -1], [6, -1]]) {
    box(group, [0.06, 1.5, 0.06], [x, 5.5, z], MAT.brass);
    const shade = mesh(group, new THREE.CylinderGeometry(0.42, 0.6, 0.4, 12), MAT.brass, [x, 4.6, z]);
    shade.castShadow = false;
    flat(group, [0.9, 0.05, 0.9], [x, 4.42, z], GLOW.amber);
  }
  ownAddedChildren(group, ceilingStart, 'heist.bank.ceiling-fixtures');
  const mezzanineStart = group.children.length;
  box(group, [21, 0.2, 0.24], [0, 3.4, -8.4], MAT.brass, 'bank-mezzanine-rail');
  for (let i = -9; i <= 9; i += 2) box(group, [0.07, 0.9, 0.07], [i, 2.95, -8.4], MAT.brass);
  ownAddedChildren(group, mezzanineStart, 'heist.phase-bank.shell', { structural: true, fixedSupportAnchor: true });

  // The doors: a revolving vestibule at +Z with brass frames and a lit EXIT.
  const doors = new THREE.Group();
  doors.name = 'bank-entrance';
  ownGeometry(doors, 'heist.phase-bank.shell', { structural: true, fixedSupportAnchor: true });
  doors.position.set(0, 0, 10.6);
  box(doors, [22, 6.4, 0.4], [0, 3.2, 0.3], MAT.marbleDark);
  const exitPane = box(doors, [3.2, 3.8, 0.12], [0, 1.9, 0.2], MAT.glass, 'bank-exit');
  /* THE WAY OUT, and why it is a proxy rather than the glass.
   *
   * Owner, playtest 2026-08-26: *"after you have the cash pile, there's no way
   * to get outside. You stand by the door, you can't really leave."*
   *
   * The state machine was never the problem. The entrance wall on the line
   * above is a solid 22 x 6.4 x 0.4 m slab with no doorway cut in it, running
   * world z 10.70-11.10, and the glass pane sits at z 10.74-10.86 -- entirely
   * INSIDE that slab, four centimetres behind its lobby face. The whole phase
   * group is registered as an interaction occluder, and InteractionSystem's
   * hit loop BREAKS on the first hit that owns no descriptor (see the loop in
   * src/core/interaction.js) rather than skipping past it, so the marble takes
   * the ray every time and the pane four centimetres further along is never
   * examined. Driven headlessly over the shipped geometry, `bank-exit` became
   * the crosshair target in 0 of 1127 lobby viewpoints, and 0 of 420 samples
   * at the closest position the player clamp allows.
   *
   * So the descriptor moves onto an invisible volume standing proud of the
   * slab on the lobby side, which is what this module's own header prescribes
   * and what `cash-staging-volume` two hundred lines below already does.
   * Invisible is the correct flag on both counts: three.js still raycasts a
   * mesh with `visible = false`, so the crosshair finds it, while
   * `hiddenOrIgnored` in src/core/combat/aim-proxy.js walks the parents for
   * exactly that flag, so it will never stop a bullet.
   *
   * It is thin because it has to fit the gap exactly. The player clamp for
   * this phase stops him at z 10.40 and the slab face is at z 10.70, so the
   * volume lives at 10.45-10.66: proud of the marble, and never containing
   * the camera. A deeper box would be easier to hit and useless, because a
   * box is invisible to a ray that starts inside it -- every triangle faces
   * away -- which this very file warns about a couple of hundred lines up. */
  const exit = box(doors, [3.4, 2.3, 0.21], [0, 1.45, -0.045], MAT.invisible,
    'bank-exit-volume');
  exit.visible = false;
  exit.castShadow = false;
  exit.receiveShadow = false;
  ownGeometry(exit, 'heist.bank.exit-volume', { overlap: false, checkSupport: false });
  box(doors, [0.16, 3.9, 0.2], [-1.7, 1.95, 0.16], MAT.brass);
  box(doors, [0.16, 3.9, 0.2], [1.7, 1.95, 0.16], MAT.brass);
  for (const x of [-5.4, 5.4]) {
    box(doors, [2.6, 3.6, 0.1], [x, 1.9, 0.2], MAT.glass);
    box(doors, [2.8, 0.16, 0.18], [x, 3.78, 0.16], MAT.brass);
  }
  flat(doors, [0.9, 0.28, 0.06], [0, 4.1, 0.1], GLOW.exit, 'bank-exit-sign');
  group.add(doors);

  // Furniture: writing desks, a rope queue, seats, a deposit-box wall.
  for (const [index, [x, z, yaw]] of [[7.0, 2.4, -0.6], [7.0, 5.0, -0.6], [-7.2, 4.2, 0.6]].entries()) {
    const desk = new THREE.Group();
    desk.name = `bank-writing-desk-${index + 1}`;
    ownGeometry(desk, `heist.bank.writing-desk.${index + 1}`);
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
    post.name = `bank-queue-post-${i + 1}`;
    ownGeometry(post, 'heist.bank.queue');
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
    seat.name = `bank-waiting-seat-${i + 1}`;
    ownGeometry(seat, `heist.bank.waiting-seat.${i + 1}`);
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
  ownGeometry(boxes, 'heist.bank.deposit-wall');
  boxes.position.set(-10.5, 0, -4);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = box(boxes, [0.06, 0.28, 0.36], [0, 0.6 + row * 0.32, -1.4 + col * 0.4], MAT.steel);
      cell.castShadow = false;
      box(boxes, [0.04, 0.05, 0.05], [0.05, 0.6 + row * 0.32, -1.4 + col * 0.4], MAT.brass);
    }
  }
  group.add(boxes);

  /* THE GUARD STANDS ON THE DOOR.
   *
   * Owner: *"Lets put the gaurd closer to the door"*. He was at (-6, 4) —
   * the middle of the west floor, eight metres from the entrance, behind the
   * queue and beside a writing desk, so the crew came through the doors and
   * the one man in the room who was going to shoot somebody was a figure in
   * the middle distance. A guard stands where the public comes in.
   *
   * This is four metres inside the doors, three metres from where the crew
   * come through, turned to look down the hall at the teller line — which is
   * what he is watching until the doors go.
   *
   * IN FRONT of the entry point rather than beside it, on purpose: the whole
   * beat is 2.75 seconds long, and a guard the player has to turn round to
   * find is a guard who shoots a teller while he is being looked for. East
   * side rather than west because the west door area is already four bodies
   * and a column — the geometry gate found him standing inside `bank-column-2`
   * on the first attempt. */
  const guardFigure = makeBankGuardFigure({ name: 'bank-guard', x: 2.2, z: 6.4, yaw: -2.79 });
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
  ownGeometry(crowd, 'heist.bank.crowd-proxy', { overlap: false, checkSupport: false });

  const managerFigure = makeBankManagerFigure({ name: 'bank-manager', x: 7.5, z: -4.2, yaw: -1.9 });
  group.add(managerFigure.root);
  const manager = managerFigure.root;
  const managerStart = manager.position.clone();
  /* THE MANAGER STOPS AT THE DOOR.
   *
   * Owner: *"The manager walks into the vault before its opened."* He did,
   * literally: the escort's endpoint was (2.7, −8.1), and the vault corridor's
   * mouth is at z −7.0. So the walk that is supposed to end with a man
   * standing at his own access panel ended with him a metre inside a vault
   * with a shut four-tonne door in front of him — and the collider that stops
   * the PLAYER doing that has nothing to do with a tween on a Vector3.
   *
   * He ends beside the panel now, on the lobby side of the doorway, which is
   * also where the order tells the player to go and hold E. */
  const managerEnd = new THREE.Vector3(3.1, 0, -5.9);
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
    /* An aim volume, not a surface. `HeistCombatAdapter.trace` resolves a
     * round that lands on one of these onto the body behind it — a wound on
     * the proxy's front face is 19 cm in front of the chest, which is the
     * owner's *"decals float in the air"*. */
    proxy.userData.aimProxy = true;
    figure.root.userData.proxy = proxy;
    figure.root.userData.hostageId = `hostage_${index + 1}`;
    figure.root.userData.setState = (state, options) => figure.setState(state, options);
    return figure.root;
  });

  /* ------------------------------------------------------------------ *
   * THE STAGING POINT
   *
   * Owner: *"The staging point should be clearly marked near the bank door.
   * like a yellow circle maybe. lkets make sure the money bags appear there
   * as duffle bags as you stage them."*
   *
   * There was no staging point. The order said "drop it on the staging point"
   * and the thing it meant was `bank-exit` — the pane of glass in the
   * doorway, 1.9 m up in the air — so the prompt appeared while you were
   * looking at a window and the bag you had just carried the length of the
   * lobby went into a number on the HUD and nowhere else. Eight bags could be
   * staged without one of them ever being visible.
   *
   * A painted circle with hazard hatching, three metres inside the doors and
   * a metre and a half off the entrance line so the crew are not walking
   * through it. The eight duffles sit on it, heaped, and appear one at a time
   * as they are carried out — which is also the only readout in the room that
   * says how far through the job you are.
   * ------------------------------------------------------------------ */
  const staging = new THREE.Group();
  staging.name = 'cash-staging';
  ownGeometry(staging, 'heist.bank.staging', { overlap: false });
  staging.position.set(STAGING_POINT.x, 0, STAGING_POINT.z);
  const stagingRing = mesh(staging, new THREE.RingGeometry(1.06, 1.32, 40), MAT.warning,
    [0, 0.015, 0], 'staging-ring');
  stagingRing.rotation.x = -Math.PI / 2;
  stagingRing.castShadow = false;
  stagingRing.receiveShadow = false;
  // Hazard hatching round the outside, and a bar stencil inside it.
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const tick = flat(staging, [0.1, 0.012, 0.26],
      [Math.cos(angle) * 1.5, 0.013, Math.sin(angle) * 1.5], MAT.warning);
    tick.rotation.y = -angle;
    tick.castShadow = false;
  }
  for (const z of [-0.34, 0, 0.34]) {
    flat(staging, [1.5, 0.012, 0.14], [0, 0.014, z], MAT.warning).castShadow = false;
  }

  /* The bags themselves: built once, hidden, and shown as they arrive. Laid
   * out in a heap rather than a grid, because eight duffles in rows is a
   * warehouse and this is a pile by a door. */
  const stagedBags = [];
  for (let i = 0; i < 8; i++) {
    const bag = makeCashBag({ full: true });
    bag.name = `staged-cash-${i + 1}`;
    const angle = i * 2.4;
    const radius = i < 4 ? 0.34 : 0.66;
    bag.position.set(Math.cos(angle) * radius, i < 6 ? 0.16 : 0.44, Math.sin(angle) * radius);
    bag.rotation.set(0, angle * 0.8, i > 5 ? 0.18 : 0);
    bag.scale.setScalar(1.5);
    bag.visible = false;
    staging.add(bag);
    stagedBags.push(bag);
  }
  staging.userData.setStaged = (count) => {
    const shown = Math.max(0, Math.min(stagedBags.length, Math.round(count) || 0));
    for (const [index, bag] of stagedBags.entries()) bag.visible = index < shown;
    staging.userData.staged = shown;
  };
  staging.userData.setStaged(0);
  /* A soft volume over the circle, so the prompt is on the marked floor
   * rather than on a window. Soft, so a bag or a crew member standing on it
   * still wins the ray. */
  const stagingVolume = mesh(staging, new THREE.CylinderGeometry(1.4, 1.4, 2.2, 16),
    MAT.invisible, [0, 1.1, 0], 'cash-staging-volume');
  stagingVolume.castShadow = false;
  stagingVolume.receiveShadow = false;
  ownGeometry(stagingVolume, 'heist.bank.staging-volume', { overlap: false, checkSupport: false });
  group.add(staging);

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
  ownGeometry(vaultRoom, 'heist.phase-bank.shell', { structural: true, fixedSupportAnchor: true });
  vaultRoom.position.set(0, 0, -10.1);
  box(vaultRoom, [8.4, 4.4, 0.3], [0, 2.2, -3.2], MAT.steel);
  box(vaultRoom, [0.3, 4.4, 6.4], [-4.2, 2.2, 0], MAT.steel);
  box(vaultRoom, [0.3, 4.4, 6.4], [4.2, 2.2, 0], MAT.steel);
  box(vaultRoom, [8.4, 0.2, 6.4], [0, 4.3, 0], MAT.steel);
  const vaultFloor = box(vaultRoom, [8.4, 0.1, 6.4], [0, 0.02, 0], MAT.darkConcrete, 'vault-room-floor');
  ownGeometry(vaultFloor, 'heist.phase-bank.shell');
  const vaultLight = new THREE.PointLight(0xcfe0ea, 2.2, 12, 2);
  vaultLight.position.set(0, 3.6, -1.4);
  vaultRoom.add(vaultLight);
  group.add(vaultRoom);

  /* ------------------------------------------------------------------ *
   * THE VAULT DOOR
   *
   * Three separate faults, all reported in one breath: *"there is a big gap
   * in the vault next to the doors ... when the vault opens it opens funky.
   * Door is all wonky."*
   *
   * 1. THE GAP. The doorway between the two rear-wall panels is 8.4 m wide
   *    and 4.2 m tall. The door hung in it was a 2 m-radius DISC — four
   *    metres across, in an eight-metre hole, with nothing whatever in the
   *    four metres of daylight either side of it. An invisible collider held
   *    the player back, so you could stand at a wall you could see straight
   *    through into the vault you had not opened yet.
   *
   *    The bulkhead is real now: one extruded steel plate filling the whole
   *    opening with a circular aperture cut out of it, six centimetres bigger
   *    than the door that plugs it. That is the reveal a vault door sits in,
   *    and it is why the door reads as a door.
   *
   * 2. THE FUNKY OPEN. `setOpen(true)` teleported the whole leaf 4.8 m to the
   *    left and 0.65 m forward in a single frame and rolled the disc 0.5 rad
   *    on the way past. Nothing about that is a door opening; it is a door
   *    being deleted from one place and drawn in another.
   *
   *    It is HINGED, and it takes three and a half seconds: the wheel spins
   *    and the bolts withdraw first, and then four tonnes of steel swings out
   *    on a smoothstep. `tickDoor` advances it and `main.js` drives that off
   *    the same simulated clock as everything else.
   *
   * 3. THE SWING ANGLE is 1.12 rad rather than square, because the free edge
   *    of a 2 m leaf on a hinge 2.35 m off centre reaches z −3.09 at that
   *    angle and the teller counter's face is at z −2.825. A door that opens
   *    into the counter is the next bug report.
   * ------------------------------------------------------------------ */
  const VAULT_DOOR_SWING = 1.12;
  const VAULT_HINGE_X = -2.35;

  const vault = new THREE.Group();
  vault.name = 'vault-door';
  ownGeometry(vault, 'heist.bank.vault-door');
  vault.position.set(0, 0, -10.1);

  /* The bulkhead: the whole opening, minus a round hole for the door. Extrude
   * runs along +Z from the shape's own plane, so it is offset back by half
   * its depth to sit centred on the doorway the leaf plugs. */
  const APERTURE = 2.06;
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-4.05, 0);
  frameShape.lineTo(4.05, 0);
  frameShape.lineTo(4.05, 4.2);
  frameShape.lineTo(-4.05, 4.2);
  frameShape.closePath();
  const aperture = new THREE.Path();
  aperture.absarc(0, 2.2, APERTURE, 0, Math.PI * 2, true);
  frameShape.holes.push(aperture);
  const bulkhead = new THREE.Mesh(
    new THREE.ExtrudeGeometry(frameShape, { depth: 0.5, bevelEnabled: false, curveSegments: 32 }),
    MAT.steel,
  );
  bulkhead.name = 'vault-bulkhead';
  bulkhead.position.set(0, 0, 3.1 - 0.25);
  bulkhead.castShadow = true;
  vault.add(bulkhead);
  // A brass reveal round the aperture, so the hole is a mouth and not a cut.
  const reveal = mesh(vault, new THREE.TorusGeometry(APERTURE + 0.06, 0.09, 8, 40),
    MAT.brass, [0, 2.2, 3.36]);
  reveal.name = 'vault-aperture-reveal';

  /* The leaf, on a hinge. Everything that moves when the door opens is a
   * child of this group and nothing else is — the old pose moved the disc and
   * the wheel and left the bolts hanging in the doorway. */
  const hinge = new THREE.Group();
  hinge.name = 'vault-door-hinge';
  hinge.position.set(VAULT_HINGE_X, 0, 3.1);
  vault.add(hinge);
  const leaf = (geometry, material, [x, y, z], name = '') => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x - VAULT_HINGE_X, y, z - 3.1);
    m.castShadow = true;
    if (name) m.name = name;
    hinge.add(m);
    return m;
  };

  const disc = leaf(new THREE.CylinderGeometry(2.0, 2.0, 0.55, 32), MAT.steel,
    [0, 2.2, 3.1], 'vault-door-leaf');
  disc.rotation.x = Math.PI / 2;
  const ring = leaf(new THREE.TorusGeometry(1.86, 0.12, 8, 32), MAT.brass, [0, 2.2, 3.1]);
  ring.rotation.x = 0;

  /* The locking bolts, which withdraw into the leaf before it can move. */
  const bolts = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const bolt = leaf(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 8), MAT.brass,
      [Math.cos(angle) * 1.62, 2.2 + Math.sin(angle) * 1.62, 3.28], `vault-bolt-${i + 1}`);
    bolt.rotation.x = Math.PI / 2;
    bolts.push(bolt);
  }
  const boltHomeZ = bolts.map((bolt) => bolt.position.z);

  /* The wheel, in its own group so that spinning it spins its spokes too. */
  const wheelGroup = new THREE.Group();
  wheelGroup.name = 'vault-wheel';
  wheelGroup.position.set(0 - VAULT_HINGE_X, 2.2, 3.44 - 3.1);
  hinge.add(wheelGroup);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.075, 8, 20), MAT.brass);
  wheel.castShadow = true;
  wheelGroup.add(wheel);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 0.08), MAT.brass);
    spoke.rotation.z = (i / 4) * Math.PI;
    spoke.castShadow = true;
    wheelGroup.add(spoke);
  }
  const boss = leaf(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 12), MAT.steel, [0, 2.2, 3.5]);
  boss.rotation.x = Math.PI / 2;

  /* The hinge itself, which a swinging door has to be visibly hung on. */
  for (const y of [0.55, 2.2, 3.85]) {
    const knuckle = mesh(vault, new THREE.CylinderGeometry(0.19, 0.19, 0.42, 12),
      MAT.steel, [VAULT_HINGE_X, y, 3.36]);
    knuckle.name = `vault-hinge-knuckle-${y}`;
  }
  mesh(vault, new THREE.CylinderGeometry(0.1, 0.1, 3.7, 10), MAT.brass,
    [VAULT_HINGE_X, 2.2, 3.36]).name = 'vault-hinge-pin';

  const panel = box(vault, [0.55, 0.75, 0.14], [2.9, 1.7, 3.42], MAT.darkConcrete, 'vault-panel');
  panel.castShadow = true;
  flat(vault, [0.4, 0.28, 0.03], [2.9, 1.92, 3.51], GLOW.alarm, 'vault-panel-screen');
  for (let i = 0; i < 12; i++) {
    box(vault, [0.09, 0.07, 0.03], [2.72 + (i % 3) * 0.18, 1.66 - Math.floor(i / 3) * 0.12, 3.51], MAT.steel);
  }
  group.add(vault);

  /* THE DOOR IS A WALL WHILE IT IS SHUT.
   *
   * Owner, an earlier pass: *"the vault can be walked into before it opens"*.
   * The collider fills the whole opening rather than just the disc, because
   * the gap around a round door in a square hole is a gap a player will find.
   * It is added to and removed from the live collider list by `setOpen` — the
   * same call that starts the swing, so the thing you can see and the thing
   * you can walk through cannot disagree.
   */
  const doorCollider = bounds([APERTURE * 2, 4.4, 0.55], [0, 2.2, -7.0]);
  vault.userData.doorCollider = doorCollider;
  /* The swung-open leaf is four metres of steel standing in the corridor
   * mouth. Without this the player walks through it, which is the same class
   * of bug as walking through the shut one. */
  vault.userData.openLeafCollider = bounds([2.24, 4.0, 3.78], [-1.33, 2.2, -4.85]);
  vault.userData.open = false;
  vault.userData.doorSwing = VAULT_DOOR_SWING;

  let doorPhase = 0;
  let doorTarget = 0;
  const applyDoorPhase = () => {
    /* The first third is the wheel and the bolts; the rest is the swing. A
     * door this size does not start moving until it has been unlocked, and
     * seeing that happen is most of what makes it read as a vault. */
    const spin = Math.min(1, doorPhase / 0.34);
    const raw = Math.max(0, (doorPhase - 0.34) / 0.66);
    const swing = raw * raw * (3 - 2 * raw);
    wheelGroup.rotation.z = -spin * Math.PI * 4;
    for (const [index, bolt] of bolts.entries()) {
      bolt.position.z = boltHomeZ[index] - spin * 0.24;
    }
    hinge.rotation.y = -swing * VAULT_DOOR_SWING;
    vault.userData.doorPhase = doorPhase;
  };
  applyDoorPhase();

  /**
   * @param {boolean} open
   * @param {object} [options]
   * @param {boolean} [options.animate] false (the default) snaps, which is
   *   what a checkpoint restore and the preview stager want; the bypass in
   *   `main.js` passes true and gets the three and a half seconds.
   */
  vault.userData.setOpen = (open, { animate = false } = {}) => {
    const isOpen = open === true;
    const changed = vault.userData.open !== isOpen;
    vault.userData.open = isOpen;
    doorTarget = isOpen ? 1 : 0;
    if (!animate) doorPhase = doorTarget;
    applyDoorPhase();
    if (changed) vault.userData.onOpenChanged?.(isOpen);
  };

  /** Advance the swing. Returns true while it is still moving. */
  vault.userData.tickDoor = (dt) => {
    if (doorPhase === doorTarget) return false;
    const step = Math.max(0, Number(dt) || 0) / 3.4;
    doorPhase = doorTarget > doorPhase
      ? Math.min(doorTarget, doorPhase + step)
      : Math.max(doorTarget, doorPhase - step);
    applyDoorPhase();
    return doorPhase !== doorTarget;
  };

  const bags = new THREE.Group();
  bags.name = 'vault-cash';
  ownGeometry(bags, 'heist.bank.vault-cash');
  bags.position.set(0, 0, -10.1);
  for (let i = 0; i < 8; i++) {
    const bag = makeCashBag({ full: true });
    bag.name = `cash-${i + 1}`;
    bag.position.set(-2.4 + (i % 4) * 1.6, 0.28, -0.6 + Math.floor(i / 4) * 1.3);
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
      exitPane,
      staging: stagingVolume,
    },
    staging,
    figures: { guard: guardFigure, rearGuard: rearGuardFigure, manager: managerFigure },
    civilians,
    alarmLight,
    colliders: [
      bounds([21.75, 6.4, 0.25], [0, 3.2, 11]),
      bounds([0.25, 6.4, 21.75], [-11, 3.2, 0]),
      bounds([0.25, 6.4, 21.75], [11, 3.2, 0]),
      bounds([6.525, 6.4, 0.25], [-7.6125, 3.2, -11]),
      bounds([6.525, 6.4, 0.25], [7.6125, 3.2, -11]),
      ...columnXs.map((x) => bounds([1.1, 5.6, 1.1], [x, 2.8, 7])),
      bounds([17.2, 1.3, 0.9], [-1, 0.65, -2.4]),
      bounds([0.4, 3, 3.4], [-10.5, 1.5, -4]),
      bounds([0.3, 4.4, 5.875], [-4.2, 2.2, -10.2125]),
      bounds([0.3, 4.4, 5.875], [4.2, 2.2, -10.2125]),
      /* The bulkhead either side of the aperture. It is solid steel and it
       * does not open, so unlike the door it is never taken back out. */
      bounds([4.05 - APERTURE, 4.2, 0.5], [-(4.05 + APERTURE) / 2, 2.1, -7.0]),
      bounds([4.05 - APERTURE, 4.2, 0.5], [(4.05 + APERTURE) / 2, 2.1, -7.0]),
      bounds([8.1, 4.4, 0.3], [0, 2.2, -13.3]),
      bounds([1.4, 1.0, 1.4], [8.4, 0.5, 2.5]),
      /* The shut vault door. `buildHeistLevel` takes this one back out when
       * the bypass finishes — see `vault.userData.onOpenChanged`. Without it
       * the 8.4 m doorway between the two rear-wall panels was open floor and
       * the player could walk into the vault before Shubenator had touched
       * the panel. */
      vault.userData.doorCollider,
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
  ownGeometry(box(group, [18, 0.2, 72], [0, -0.1, 0], MAT.asphalt, 'heist-street-ground'),
    'heist.street.ground', { structural: true, fixedSupportAnchor: true });
  for (let z = -34; z < 34; z += 8) {
    ownGeometry(flat(group, [0.2, 0.02, 4], [0, 0.015, z], MAT.warning),
      'heist.street.lane-paint', { overlap: false });
  }
  for (const side of [-1, 1]) {
    ownGeometry(box(group, [3.4, 0.35, 72], [side * 10.3, 0.175, 0], MAT.concrete),
      `heist.street.sidewalk.${side}`, { overlap: false });
    ownGeometry(box(group, [0.3, 0.42, 72], [side * 8.7, 0.2, 0], MAT.marbleDark),
      `heist.street.sidewalk.${side}`, { overlap: false });
    for (let i = 0; i < 9; i++) {
      const facadeStart = group.children.length;
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
      // Storefronts stand on the 35 cm pavement instead of intersecting it.
      for (const part of group.children.slice(facadeStart)) part.position.y += 0.35;
      ownAddedChildren(group, facadeStart, `heist.street.facade.${side}.${i}`);
    }
    // Lamp posts and a hydrant run down both kerbs.
    for (let i = 0; i < 6; i++) {
      const fixtureStart = group.children.length;
      const z = -30 + i * 12;
      box(group, [0.16, 6.4, 0.16], [side * 9.6, 3.2, z], MAT.steel);
      box(group, [1.8, 0.12, 0.12], [side * 8.7, 6.3, z], MAT.steel);
      flat(group, [0.7, 0.14, 0.32], [side * 7.9, 6.15, z], GLOW.amber, `street-practical-${side}-${i}`);
      ownAddedChildren(group, fixtureStart, `heist.street.lamp.${side}.${i}`);
    }
  }
  /* The parked cars, and the fire positions they make.
   *
   * `firePositions` is the street's own answer to *"Everyones just standing
   * ther"* — the police movement layer in `main.js` bounds between these
   * rather than choosing arbitrary coordinates, so the fight runs along the
   * cover the street actually has instead of down the middle of the road.
   * They are AUTHORED HERE, beside the cars they belong to, because a cover
   * list that lives somewhere else drifts the first time a car moves. */
  const coverCars = [];
  const firePositions = [];
  for (let i = 0; i < 8; i++) {
    const position = [i % 2 ? -5.5 : 5.5, 0, -25 + i * 7];
    makeVehicleBody(group, position, i % 3 ? 0x31363a : 0x5a1f22, `cover-car-${i}`);
    coverCars.push(bounds([4.1, 1.9, 2.2], [position[0], 0.95, position[2]]));
    /* Either end of the car, clear of its 2.2 m hull: a man tucked in at the
     * bumper with two tonnes of parked saloon between him and the muzzle. */
    firePositions.push({ id: `car-${i}-near`, x: position[0], z: position[2] - 2.9 });
    firePositions.push({ id: `car-${i}-far`, x: position[0], z: position[2] + 2.9 });
    // And the open centre lane, which is what a man crossing the road uses.
    firePositions.push({ id: `lane-${i}`, x: i % 2 ? -1.9 : 1.9, z: position[2] - 1.4 });
  }
  // Planters on the bank steps: the cover Snow's authored line names.
  for (const x of [-3.4, 0, 3.4]) {
    const planterStart = group.children.length;
    const planter = box(group, [2.2, 0.9, 1.1], [x, 0.45, 31.5], MAT.marbleDark, `bank-planter-${x}`);
    planter.userData.kind = 'street-cover';
    box(group, [1.9, 0.4, 0.85], [x, 1.0, 31.5], new THREE.MeshStandardMaterial({ color: 0x2f3a27, roughness: 1 }));
    ownAddedChildren(group, planterStart, 'heist.street.bank-entry');
    coverCars.push(bounds([2.2, 1.1, 1.1], [x, 0.55, 31.5]));
  }
  const bankFacadeStart = group.children.length;
  box(group, [7, 6.5, 1], [-5.5, 3.25, 35], MAT.marble, 'bank-facade-left');
  box(group, [7, 6.5, 1], [5.5, 3.25, 35], MAT.marble, 'bank-facade-right');
  box(group, [4, 2.2, 1], [0, 5.4, 35], MAT.marble, 'bank-facade-lintel');
  for (const x of [-3.2, 3.2]) {
    mesh(group, new THREE.CylinderGeometry(0.4, 0.5, 5.4, 14), MAT.marble, [x, 2.7, 34.2]);
  }
  for (let i = 0; i < 3; i++) box(group, [11, 0.22, 0.9], [0, 0.11 + i * 0.22, 33 - i * 0.9], MAT.marble);
  const bankDoor = box(group, [4, 4, 0.2], [0, 2, 34], MAT.brass, 'street-start');
  ownAddedChildren(group, bankFacadeStart, 'heist.street.bank-entry');
  const van = makeVehicleBody(group, [0, 0, 14], 0x111316, 'disabled-van');
  van.rotation.y = 0.18;
  van.scale.set(1.2, 1.15, 1.05);
  const droppedBag = makeCashBag({ full: true });
  droppedBag.name = 'dropped-bag';
  ownGeometry(droppedBag, 'heist.street.dropped-bag');
  droppedBag.position.set(-3.2, 0.38, -6);
  droppedBag.rotation.set(0.2, 0.7, 0.35);
  droppedBag.scale.setScalar(1.5);
  group.add(droppedBag);
  const garage = box(group, [7, 4.5, 0.2], [0, 2.25, -35], MAT.concrete, 'garage-entry');
  const garageSign = flat(group, [4.4, 0.5, 0.1], [0, 4.65, -35], GLOW.amber, 'garage-sign');
  ownGeometry(garage, 'heist.street.garage-entry');
  ownGeometry(garageSign, 'heist.street.garage-entry');

  /* The dead van is cover too — it is the biggest solid on the street and it
   * is exactly where the first block is fought. */
  for (const [id, x, z] of [['van-west', -3.6, 14], ['van-east', 3.6, 14]]) {
    firePositions.push({ id, x, z });
  }

  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 31),
    firePositions: Object.freeze(firePositions.map((slot) => Object.freeze(slot))),
    interactables: { bankDoor, van, droppedBag, garage },
    colliders: [
      bounds([3.4, 10, 72], [-10.3, 5, 0]),
      bounds([3.4, 10, 72], [10.3, 5, 0]),
      ...coverCars,
      bounds([4.9, 2.0, 2.2], [0, 1, 14]),
      bounds([6.6, 6.5, 1], [-5.3, 3.25, 35]),
      bounds([6.6, 6.5, 1], [5.3, 3.25, 35]),
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
  room(group, 24, 30, 4.4, MAT.concrete, { back: false });
  const rearShellStart = group.children.length;
  for (const side of [-1, 1]) {
    box(group, [8.2, 4.4, 0.25], [side * 7.9, 2.2, 15], MAT.darkConcrete,
      `garage-ramp-portal-wing-${side}`);
  }
  box(group, [7.6, 1.2, 0.25], [0, 3.8, 15], MAT.darkConcrete, 'garage-ramp-portal-lintel');
  ownAddedChildren(group, rearShellStart, 'heist.phase-garage.shell', { structural: true, fixedSupportAnchor: true });
  for (const x of [-8, -3, 3, 8]) {
    for (const z of [-10, 0, 10]) {
      if (z === 10 && Math.abs(x) === 3) continue;
      const pillarStart = group.children.length;
      box(group, [0.8, 4.4, 0.8], [x, 2.2, z], MAT.concrete);
      flat(group, [0.9, 0.6, 0.9], [x, 0.3, z], MAT.warning);
      ownAddedChildren(group, pillarStart, 'heist.phase-garage.shell', { structural: true, fixedSupportAnchor: true });
    }
  }
  // Bays, arrows, drips, and the strip lights that make a garage a garage.
  for (let i = -5; i <= 5; i++) {
    ownGeometry(flat(group, [0.12, 0.01, 5.4], [i * 2.2, 0.006, -11], MAT.paper),
      'heist.garage.bay-paint', { overlap: false });
    ownGeometry(flat(group, [0.12, 0.01, 5.4], [i * 2.2, 0.006, 11], MAT.paper),
      'heist.garage.bay-paint', { overlap: false });
  }
  for (let i = -2; i <= 2; i++) {
    const overheadStart = group.children.length;
    const fitting = box(group, [0.28, 0.14, 9], [i * 5, 4.2, 0], MAT.steel);
    fitting.castShadow = false;
    flat(group, [0.22, 0.05, 8.6], [i * 5, 4.1, 0], GLOW.amber);
    ownAddedChildren(group, overheadStart, `heist.garage.overhead.${i}`);
    const light = new THREE.PointLight(0xe8d7ae, 1.6, 14, 2);
    light.name = `garage-overhead-${i + 3}`;
    light.position.set(i * 5, 3.9, 0);
    group.add(light);
  }
  for (const [x, z] of [[-6.8, -13], [9.6, 4]]) {
    const crateStart = group.children.length;
    for (let i = 0; i < 4; i++) box(group, [0.9, 0.9, 0.9], [x, 0.45 + i * 0.9, z], MAT.darkConcrete);
    ownAddedChildren(group, crateStart, `heist.garage.crate-stack.${x}.${z}`);
  }
  /* The ramp down from the street, and the thing the player used to spawn
   * inside of.
   *
   * Owner: *"garage spawn faces/intersects a big wall"*. The spawn was
   * (0, 1.66, 12) and this slab runs z 9 to 17 at a metre off the floor, so
   * the player arrived standing in the middle of it, three metres off the
   * back wall, looking at concrete. It was also not a collider, so the ramp
   * you can see was a thing you walked through.
   *
   * The ramp keeps its place — it is where the crew came in from — and is a
   * solid now. The spawn moved to the clear floor in front of it. */
  /* AND THEN IT WAS ROTATED THE WRONG WAY.
   *
   * Owner, playtest 2026-08-26: *"the on-ramp that you came in on is inverted
   * the wrong way."*
   *
   * `rotation.x = 0.22` drives the +Z end DOWN and the -Z end UP, and +Z is
   * the street: the slab stood 2.07 m high where the garage floor is and 0.32
   * m high at the mouth it is supposed to come in through. It climbed into the
   * room. Negative is the way down from the street, and the pivot drops from
   * 1.05 to 0.72 so the foot lands flush with the floor instead of on a 32 cm
   * lip: interior end 0.00, portal line 1.30, street end 1.74. */
  const rampStart = group.children.length;
  const RAMP_TILT = -0.22;
  const RAMP_PIVOT_Y = 0.72;
  const ramp = box(group, [7, 0.3, 8], [0, RAMP_PIVOT_Y, 13], MAT.concrete, 'garage-ramp');
  ramp.rotation.x = RAMP_TILT;
  for (const side of [-1, 1]) {
    const wall = box(group, [0.3, 1.6, 8], [side * 3.5, RAMP_PIVOT_Y + 0.83, 13],
      MAT.darkConcrete, `garage-ramp-wall-${side}`);
    /* The kerbs were axis-aligned while the slab between them sloped, so they
     * sank into it at one end and floated off it at the other. */
    wall.rotation.x = RAMP_TILT;
  }
  ownAddedChildren(group, rampStart, 'heist.garage.ramp');
  const hold = box(group, [8, 0.1, 3], [0, 0.05, 8], MAT.invisible, 'garage-hold');
  hold.castShadow = false;
  ownGeometry(hold, 'heist.garage.hold-proxy', { overlap: false, checkSupport: false });
  const sedan = makeVehicleBody(group, [0, 0, -8], 0x34393d, 'escape-sedan');
  const load = box(group, [2.4, 1.1, 0.2], [0, 0.85, -7], MAT.steel, 'sedan-trunk');
  const drive = box(group, [1, 1.3, 0.2], [-1.1, 1.1, -8], MAT.glass, 'driver-door');
  ownGeometry(load, 'heist.vehicle.escape-sedan');
  ownGeometry(drive, 'heist.vehicle.escape-sedan');

  /* A transfer lane, not an isolated car in the dark. The five ceiling pools
   * stay unchanged; one directed work lamp picks out the trunk without adding
   * another omnidirectional light to every surface in the garage. */
  const transfer = new THREE.Group();
  transfer.name = 'garage-transfer-zone';
  ownGeometry(transfer, 'heist.garage.transfer-zone', { overlap: false });
  transfer.position.set(0, 0, -8);
  flat(transfer, [0.1, 0.018, 6.4], [-2.55, 0.012, 0], MAT.warning,
    'garage-transfer-stripe-left');
  flat(transfer, [0.1, 0.018, 6.4], [2.55, 0.012, 0], MAT.warning,
    'garage-transfer-stripe-right');
  flat(transfer, [5.2, 0.018, 0.12], [0, 0.012, 3], MAT.warning,
    'garage-transfer-stop-line');
  for (const [x, label] of [[-1.35, 'left'], [1.35, 'right']]) {
    const stop = box(transfer, [0.82, 0.18, 0.24], [x, 0.09, -1.38], MAT.warning,
      `garage-wheel-stop-${label}`);
    stop.rotation.x = -0.12;
  }
  group.add(transfer);

  const workLamp = new THREE.Group();
  workLamp.name = 'garage-work-lamp';
  ownGeometry(workLamp, 'heist.garage.work-lamp');
  workLamp.position.set(3.8, 0, -4.8);
  box(workLamp, [0.62, 0.08, 0.62], [0, 0.04, 0], MAT.steel, 'garage-work-lamp-base');
  box(workLamp, [0.08, 3.1, 0.08], [0, 1.55, 0], MAT.steel, 'garage-work-lamp-mast');
  const lampHead = flat(workLamp, [0.66, 0.42, 0.18], [-0.18, 2.95, -0.08], GLOW.amber,
    'garage-work-lamp-head');
  lampHead.rotation.y = -0.45;
  group.add(workLamp);
  const taskTarget = new THREE.Object3D();
  taskTarget.name = 'garage-sedan-task-target';
  taskTarget.position.set(0, 0.8, -8);
  group.add(taskTarget);
  const taskLight = new THREE.SpotLight(0xffdfaa, 4.8, 18, Math.PI / 5, 0.45, 1.8);
  taskLight.name = 'garage-sedan-task-light';
  taskLight.position.set(3.6, 3.0, -4.7);
  taskLight.target = taskTarget;
  group.add(taskLight);

  const toolCart = new THREE.Group();
  toolCart.name = 'garage-tool-cart';
  ownGeometry(toolCart, 'heist.garage.tool-cart');
  toolCart.position.set(5.5, 0, -5.5);
  box(toolCart, [1.35, 0.12, 0.72], [0, 0.42, 0], MAT.steel, 'garage-tool-cart-lower');
  box(toolCart, [1.35, 0.12, 0.72], [0, 1.02, 0], MAT.steel, 'garage-tool-cart-top');
  for (const [x, z] of [[-0.55, -0.25], [-0.55, 0.25], [0.55, -0.25], [0.55, 0.25]]) {
    mesh(toolCart, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), MAT.tactical, [x, 0.12, z])
      .rotation.z = Math.PI / 2;
  }
  box(toolCart, [0.08, 0.85, 0.08], [-0.64, 0.72, 0], MAT.steel);
  box(toolCart, [0.5, 0.08, 0.08], [-0.86, 1.1, 0], MAT.steel, 'garage-tool-cart-handle');
  box(toolCart, [0.24, 0.18, 0.32], [-0.34, 1.17, 0], MAT.warning, 'garage-tool-case');
  group.add(toolCart);
  for (let i = 0; i < 5; i++) {
    const parked = makeVehicleBody(group, [i % 2 ? -10.2 : 10.2, 0, -11 + i * 5.5],
      [0x2b3035, 0x4a2222, 0x223528, 0x36363c, 0x2d3a48][i], `garage-parked-${i}`);
    parked.rotation.y = Math.PI / 2;
  }
  return {
    group,
    /* On the floor in front of the ramp, facing the sedan at z −8. `player.yaw
     * = 0` looks down −Z, so the first thing in frame is the car the objective
     * is about instead of the back wall the spawn used to be pressed into. */
    spawn: new THREE.Vector3(0, 1.66, 6.4),
    /* Fire positions for the men coming down the ramp: the pillar line at
     * x ±3 and ±8, and the mouth of the ramp itself. Same contract as the
     * street's — see `buildStreet`. The pillars are 0.8 m square, so a slot
     * sits a body's width off one, not inside it. */
    firePositions: Object.freeze([
      { id: 'ramp-mouth', x: 0, z: 11.4 },
      { id: 'ramp-west', x: -2.4, z: 12.2 },
      { id: 'ramp-east', x: 2.4, z: 12.2 },
      { id: 'pillar-w-out', x: -8, z: 11.2 },
      { id: 'pillar-e-out', x: 8, z: 11.2 },
      { id: 'pillar-w-near', x: -3, z: 1.4 },
      { id: 'pillar-e-near', x: 3, z: 1.4 },
      { id: 'pillar-w-mid', x: -8, z: 1.4 },
      { id: 'pillar-e-mid', x: 8, z: 1.4 },
      { id: 'lane-west', x: -5.6, z: 6.2 },
      { id: 'lane-east', x: 5.6, z: 6.2 },
    ].map((slot) => Object.freeze(slot))),
    interactables: { hold, load, drive },
    sedan,
    colliders: [
      ...roomColliders(24, 30, 4.4).filter((_, index) => index !== 1),
      bounds([8.075, 4.4, 0.25], [-7.8375, 2.2, 15]),
      bounds([8.075, 4.4, 0.25], [7.8375, 2.2, 15]),
      bounds([7.6, 1.2, 0.25], [0, 3.8, 15]),
      ...[-8, -3, 3, 8].flatMap((x) => [-10, 0, 10]
        .filter((z) => !(z === 10 && Math.abs(x) === 3))
        .map((z) => bounds([0.8, 4.4, 0.8], [x, 2.2, z]))),
      bounds([4.1, 1.9, 2.2], [0, 0.95, -8]),
      /* THE RAMP, AS SOMETHING YOU CAN WALK ON.
       *
       * It used to be one axis-aligned 6.7 x 2.6 x 8 box over the whole
       * footprint -- a solid wall two and a half metres tall, in both
       * directions, standing exactly where the way in is. The slab above it
       * slopes, so the solid has to as well, and this engine's colliders are
       * AABBs: approximate the slope with eight one-metre treads, each as
       * tall as the ramp surface at its own midpoint. That is a 21.8 cm rise
       * per tread, which is an ordinary stair step. */
      ...Array.from({ length: 8 }, (_, i) => {
        const z = 9.5 + i;
        const top = 0.866 + (z - 13) * 0.2182;
        return bounds([6.7, top, 1], [0, top / 2, z]);
      }),
      ...[-1, 1].map((side) => bounds([0.3, 2.4, 8], [side * 3.5, 1.2, 13])),
      // The stacked crates in the two corners.
      ...[[-6.8, -13], [9.6, 4]].map(([x, z]) => bounds([0.9, 3.6, 0.9], [x, 1.8, z])),
      bounds([1.4, 1.2, 0.8], [5.5, 0.6, -5.5]),
      // The five parked cars down the side walls.
      ...Array.from({ length: 5 }, (_, i) => bounds([2.2, 1.9, 4.1],
        [i % 2 ? -10.2 : 10.2, 0.95, -11 + i * 5.5])),
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
  ownGeometry(roadblock, 'heist.driving.roadblock');
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
  ownGeometry(swap, 'heist.driving.swap-proxy', { overlap: false, checkSupport: false });
  // The swap yard: a lit shed, a skip, a stack of pallets and a chain fence.
  const swapShed = box(group, [11, 5, 8], [8, 2.5, -655], MAT.darkConcrete, 'swap-shed');
  // Small, and set back off the walking area: at three metres square and 1.6 m
  // from where the player is put down, this was a wall of yellow.
  const swapShedLight = flat(group, [0.08, 0.34, 0.9], [13.53, 3.4, -655], GLOW.amber, 'swap-shed-light');
  const swapShedLight2 = flat(group, [0.08, 0.34, 0.9], [13.53, 3.4, -651], GLOW.amber, 'swap-shed-light-2');
  ownGeometry(swapShed, 'heist.driving.swap-shed');
  ownGeometry(swapShedLight, 'heist.driving.swap-shed');
  ownGeometry(swapShedLight2, 'heist.driving.swap-shed');
  const yardPole = new THREE.Group();
  yardPole.name = 'swap-yard-light-pole';
  ownGeometry(yardPole, 'heist.driving.yard-light-pole');
  yardPole.position.set(17, 0, -648.2);
  box(yardPole, [0.18, 6.6, 0.18], [0, 3.3, 0], MAT.steel, 'swap-yard-light-mast');
  box(yardPole, [0.16, 0.16, 4.8], [0, 6.5, -2.4], MAT.steel, 'swap-yard-light-arm');
  flat(yardPole, [0.9, 0.18, 0.48], [0, 6.36, -4.72], GLOW.amber, 'swap-yard-light-head');
  group.add(yardPole);
  const yardLight = new THREE.PointLight(0xffd7a0, 4.2, 38, 2);
  yardLight.name = 'swap-yard-fill';
  yardLight.position.set(17, 6.35, -652.9);
  group.add(yardLight);
  box(group, [3, 1.6, 2.2], [27, 0.8, -659], MAT.warning, 'swap-skip');
  const palletStart = group.children.length;
  for (let i = 0; i < 4; i++) box(group, [1.2, 0.16, 1.0], [25, 0.1 + i * 0.18, -646], MAT.wood);
  ownAddedChildren(group, palletStart, 'heist.driving.pallet-stack');
  for (let i = 0; i < 8; i++) box(group, [0.08, 2.4, 0.08], [13 + i * 2.2, 1.2, -644], MAT.steel);

  const cleanCarBay = new THREE.Group();
  cleanCarBay.name = 'swap-clean-car-bay';
  ownGeometry(cleanCarBay, 'heist.driving.clean-car-bay', { overlap: false });
  cleanCarBay.position.set(23.8, 0, -656);
  flat(cleanCarBay, [0.1, 0.02, 6.2], [-1.55, 0.012, 0], MAT.warning,
    'swap-clean-car-stripe-left');
  flat(cleanCarBay, [0.1, 0.02, 6.2], [1.55, 0.012, 0], MAT.warning,
    'swap-clean-car-stripe-right');
  flat(cleanCarBay, [3.2, 0.02, 0.12], [0, 0.012, -3], MAT.warning,
    'swap-clean-car-stop-line');
  group.add(cleanCarBay);

  const workbench = new THREE.Group();
  workbench.name = 'swap-workbench';
  ownGeometry(workbench, 'heist.driving.workbench');
  workbench.position.set(18.8, 0, -654);
  box(workbench, [7, 0.16, 1.2], [0, 0.72, 0], MAT.steel, 'swap-workbench-top');
  for (const x of [-3.2, 3.2]) {
    for (const z of [-0.42, 0.42]) box(workbench, [0.14, 0.68, 0.14], [x, 0.34, z], MAT.steel);
  }
  box(workbench, [6.5, 0.08, 0.12], [0, 0.36, 0.45], MAT.warning, 'swap-workbench-safety-edge');
  group.add(workbench);

  const sortingTarp = new THREE.Group();
  sortingTarp.name = 'swap-sorting-tarp';
  ownGeometry(sortingTarp, 'heist.driving.sorting-tarp', { overlap: false });
  sortingTarp.position.set(19.1, 0, -657);
  flat(sortingTarp, [5.8, 0.018, 2.0], [0, 0.012, 0], MAT.tactical, 'swap-sorting-tarp-sheet');
  for (const x of [-1.4, 0, 1.4]) {
    flat(sortingTarp, [0.04, 0.01, 1.8], [x, 0.025, 0], MAT.warning, `swap-sorting-divider-${x}`);
  }
  group.add(sortingTarp);

  for (const [x, z, label] of [[14.35, -658.15, 'left'], [25.65, -650.25, 'right']]) {
    const bollard = new THREE.Group();
    bollard.name = `swap-bollard-${label}`;
    ownGeometry(bollard, `heist.driving.bollard.${label}`);
    bollard.position.set(x, 0, z);
    mesh(bollard, new THREE.CylinderGeometry(0.16, 0.19, 1.2, 12), MAT.warning, [0, 0.6, 0]);
    flat(bollard, [0.35, 0.1, 0.35], [0, 0.78, 0], MAT.paper, `swap-bollard-band-${label}`);
    group.add(bollard);
  }

  // Two narrow task pools, sharing the existing yard fill rather than adding
  // more point lights to the entire driving scene.
  const taskRig = new THREE.Group();
  taskRig.name = 'swap-task-light-rig';
  taskRig.userData.geometryGate = {
    assemblyId: 'heist.driving.task-light-rig',
  };
  box(taskRig, [11.2, 0.16, 0.16], [20.2, 4.75, -651.2], MAT.steel, 'swap-task-light-truss');
  for (const [x, label] of [[14.68, 'left'], [25.72, 'right']]) {
    box(taskRig, [0.16, 4.75, 0.16], [x, 2.375, -651.2], MAT.steel,
      `swap-task-light-post-${label}`);
  }
  for (const [id, x, targetPosition] of [
    ['workbench', 18.2, [18.5, 0.8, -654]],
    ['car', 24, [23.8, 0.9, -656]],
  ]) {
    flat(taskRig, [0.68, 0.18, 0.42], [x, 4.55, -651.4], GLOW.amber,
      `swap-task-fixture-${id}`);
    const target = new THREE.Object3D();
    target.name = `swap-task-target-${id}`;
    target.position.set(...targetPosition);
    group.add(target);
    const light = new THREE.SpotLight(0xffdda2, id === 'car' ? 5.2 : 4.8, 20,
      Math.PI / 5, 0.48, 1.8);
    light.name = `swap-task-light-${id}`;
    light.position.set(x, 4.5, -651.4);
    light.target = target;
    group.add(light);
  }
  group.add(taskRig);

  const cleanCar = makeVehicleBody(group, [23.8, 0, -656], 0x18231f, 'clean-swap-car');
  cleanCar.rotation.y = Math.PI / 2;
  const trunk = box(group, [1.4, 0.7, 0.2], [22.9, 0.82, -656], MAT.steel, 'swap-trunk');
  ownGeometry(trunk, 'heist.vehicle.clean-swap-car');
  const bagsProp = box(group, [1.6, 0.7, 0.8], [17.7, 0.36, -652], MAT.darkConcrete, 'swap-bags');
  const aid = box(group, [0.62, 0.18, 0.42], [15.8, 0.89, -654], MAT.marble, 'swap-aid');
  const masks = box(group, [0.72, 0.16, 0.48], [17.1, 0.88, -654], MAT.darkConcrete, 'swap-masks');
  const jackets = box(group, [1.1, 0.28, 0.6], [18.5, 0.15, -657], MAT.wood, 'swap-jackets');
  const weapons = box(group, [1.7, 0.24, 0.62], [20.2, 0.16, -657], MAT.steel, 'swap-weapons');
  const wipe = box(group, [0.6, 0.08, 0.42], [21.7, 0.84, -654], MAT.marble, 'swap-wipe');
  const depart = box(group, [1.2, 1.4, 0.2], [24.1, 1.0, -655.2], swapMat, 'swap-depart');
  ownGeometry(aid, 'heist.driving.workbench');
  ownGeometry(masks, 'heist.driving.workbench');
  ownGeometry(wipe, 'heist.driving.workbench');
  ownGeometry(jackets, 'heist.driving.sorting-tarp');
  ownGeometry(weapons, 'heist.driving.sorting-tarp');
  ownGeometry(depart, 'heist.driving.depart-proxy', { overlap: false, checkSupport: false });

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
    colliders: [
      // Large authored solids in the walkable swap-yard bounds.
      bounds([3, 1.6, 2.2], [27, 0.8, -659]),
      bounds([2.2, 1.9, 4.1], [23.8, 0.95, -656]),
      bounds([7, 0.88, 1.2], [18.8, 0.44, -654]),
      bounds([1.2, 0.82, 1], [25, 0.41, -646]),
      bounds([0.38, 1.2, 0.38], [14.35, 0.6, -658.15]),
      bounds([0.38, 1.2, 0.38], [25.65, 0.6, -650.25]),
    ],
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

  /* The vault door, joined up: the shut door is in the bank's collider list
   * and comes out of it the moment the bypass finishes. Both lists are kept —
   * the phase's own, so an `activate('bank')` after the door opened does not
   * put the wall back, and the live one, so opening it while standing in the
   * lobby takes effect on the same frame the disc rolls aside. */
  const vault = phases.bank.interactables.vault;
  const doorCollider = vault.userData.doorCollider;
  const openLeafCollider = vault.userData.openLeafCollider;
  const bankColliders = phases.bank.colliders;
  vault.userData.onOpenChanged = (open) => {
    /* Two solids trade places: shut, the aperture is blocked; open, the leaf
     * standing in the corridor mouth is. Both lists are kept — the phase's
     * own, so an `activate('bank')` after the door opened does not put the
     * wall back, and the live one, so opening it while standing in the lobby
     * takes effect on the same frame. */
    const swap = (list, solid, wanted) => {
      const at = list.indexOf(solid);
      if (wanted && at < 0) list.push(solid);
      if (!wanted && at >= 0) list.splice(at, 1);
    };
    for (const list of [bankColliders, ...(active === 'bank' ? [world.colliders] : [])]) {
      swap(list, doorCollider, !open);
      swap(list, openLeafCollider, open);
    }
  };

  return { phases, world, activate, get active() { return active; } };
}

export { HeistFigure };

import * as THREE from 'three';

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x5a5b58, roughness: 0.92 }),
  darkConcrete: new THREE.MeshStandardMaterial({ color: 0x292c2e, roughness: 0.95 }),
  marble: new THREE.MeshStandardMaterial({ color: 0xbdb8ab, roughness: 0.62 }),
  brass: new THREE.MeshStandardMaterial({ color: 0x8b6a31, metalness: 0.7, roughness: 0.3 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.74 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xa4c4c7, transparent: true, opacity: 0.28, roughness: 0.15 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x1c2023, roughness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x353a3d, metalness: 0.75, roughness: 0.35 }),
  cash: new THREE.MeshStandardMaterial({ color: 0x7f8c63, roughness: 0.8 }),
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
    bounds([0.25, height, depth], [-width / 2, height / 2, 0]),
    bounds([0.25, height, depth], [width / 2, height / 2, 0]),
  ];
}

function room(group, width, depth, height, floorMaterial = MAT.concrete) {
  box(group, [width, 0.2, depth], [0, -0.1, 0], floorMaterial);
  box(group, [width, height, 0.25], [0, height / 2, -depth / 2], MAT.darkConcrete);
  box(group, [0.25, height, depth], [-width / 2, height / 2, 0], MAT.darkConcrete);
  box(group, [0.25, height, depth], [width / 2, height / 2, 0], MAT.darkConcrete);
}

function vehicle(group, position, color = 0x17191c, name = 'vehicle') {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(...position);
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.42 });
  box(root, [3.9, 0.75, 1.8], [0, 0.72, 0], bodyMat);
  box(root, [2.1, 0.65, 1.65], [-0.25, 1.35, 0], bodyMat);
  for (const x of [-1.35, 1.35]) for (const z of [-0.94, 0.94]) {
    const wheel = mesh(root, new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16),
      new THREE.MeshLambertMaterial({ color: 0x0b0c0d }), [x, 0.4, z]);
    wheel.rotation.x = Math.PI / 2;
  }
  group.add(root);
  return root;
}

function civilianFigure(group, position, index) {
  const root = new THREE.Group();
  root.name = `bank-civilian-${index + 1}`;
  root.position.set(...position);
  const clothing = new THREE.MeshLambertMaterial({ color: [0x48505a, 0x6a5145, 0x424c3e, 0x5a465c][index % 4] });
  const skin = new THREE.MeshLambertMaterial({ color: [0xb98562, 0x8b5e42, 0xd0a17b][index % 3] });
  box(root, [0.48, 1.05, 0.3], [0, 0.95, 0], clothing);
  mesh(root, new THREE.SphereGeometry(0.22, 10, 8), skin, [0, 1.65, 0]);
  box(root, [0.17, 0.8, 0.18], [-0.15, 0.4, 0], MAT.darkConcrete);
  box(root, [0.17, 0.8, 0.18], [0.15, 0.4, 0], MAT.darkConcrete);
  root.userData.setState = (state) => {
    root.rotation.x = state === 'prone' ? -Math.PI / 2 : 0;
    root.scale.y = state === 'kneeling' ? 0.68 : 1;
    root.position.y = state === 'prone' ? 0.28 : 0;
  };
  group.add(root);
  return root;
}

function buildSafehouse() {
  const group = new THREE.Group();
  group.name = 'phase-safehouse';
  room(group, 18, 14, 4.2);
  for (let i = 0; i < 5; i++) {
    const machine = box(group, [1.6, 1.6, 1.2], [-6.7 + i * 2.4, 0.8, -5.4], MAT.steel);
    const door = mesh(group, new THREE.CylinderGeometry(0.48, 0.48, 0.08, 20), MAT.glass,
      [-6.7 + i * 2.4, 0.86, -4.77]);
    door.rotation.x = Math.PI / 2;
  }
  box(group, [5.8, 0.16, 2.4], [0, 0.86, 0.2], MAT.wood, 'briefing-map');
  box(group, [4.6, 0.08, 1.7], [0, 0.97, 0.2], new THREE.MeshLambertMaterial({ color: 0xd0c4a8 }));
  for (let i = 0; i < 3; i++) box(group, [1.15, 0.05, 0.07], [-1.4 + i * 1.35, 1.04, 0.2], MAT.brass);
  const armor = box(group, [0.9, 0.18, 0.72], [-5.5, 1.05, 2.8], MAT.darkConcrete, 'safehouse-armor');
  const loadout = box(group, [3.5, 0.15, 1.1], [4.7, 0.96, 2.5], MAT.wood, 'safehouse-loadout');
  for (let i = 0; i < 4; i++) box(group, [0.6, 0.08, 0.12], [3.6 + i * 0.7, 1.08, 2.5], MAT.steel);
  const van = vehicle(group, [0, 0, 5], 0x151719, 'primary-van');
  van.scale.set(1.25, 1.2, 1.1);
  const vanDoor = box(group, [1.6, 2.2, 0.12], [0, 1.25, 5.95], MAT.steel, 'van-door');
  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 3),
    interactables: { briefing: group.getObjectByName('briefing-map'), armor, loadout, van: vanDoor },
    colliders: [
      ...roomColliders(18, 14, 4.2),
      bounds([5.8, 1.05, 2.4], [0, 0.52, 0.2]),
      bounds([4.1, 1.2, 1.5], [4.7, 0.6, 2.5]),
      bounds([4.9, 2.0, 2.1], [0, 1, 5]),
    ],
    floorZones: [floorZone(18, 14, 'concrete')],
  };
}

function buildVan() {
  const group = new THREE.Group();
  group.name = 'phase-van';
  box(group, [3.6, 0.16, 6.4], [0, -0.08, 0], MAT.steel);
  box(group, [3.6, 2.8, 0.14], [0, 1.4, 3.13], MAT.darkConcrete);
  box(group, [0.14, 2.8, 6.4], [-1.73, 1.4, 0], MAT.darkConcrete);
  box(group, [0.14, 2.8, 6.4], [1.73, 1.4, 0], MAT.darkConcrete);
  box(group, [0.62, 0.62, 4.8], [-1.32, 0.54, 0.1], MAT.wood);
  box(group, [0.62, 0.62, 4.8], [1.32, 0.54, 0.1], MAT.wood);
  for (const z of [-1.65, -0.55, 0.55, 1.65]) {
    box(group, [0.05, 0.05, 0.55], [-1.0, 1.8, z], MAT.brass);
    box(group, [0.05, 0.05, 0.55], [1.0, 1.8, z], MAT.brass);
  }
  const door = box(group, [2.4, 2.5, 0.14], [0, 1.25, -3.13], MAT.steel, 'van-interior-door');
  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 1.9),
    interactables: { van: door },
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

function buildBank() {
  const group = new THREE.Group();
  group.name = 'phase-bank';
  room(group, 22, 22, 6, MAT.marble);
  for (const x of [-8, -3, 3, 8]) {
    mesh(group, new THREE.CylinderGeometry(0.42, 0.55, 5.6, 18), MAT.marble, [x, 2.8, 7]);
  }
  for (let i = 0; i < 5; i++) {
    box(group, [3.4, 1.35, 0.8], [-7.2 + i * 3.55, 0.68, -2.4], MAT.wood);
    box(group, [3.2, 1.2, 0.06], [-7.2 + i * 3.55, 1.9, -2], MAT.glass);
  }
  const guard = box(group, [0.7, 1.75, 0.5], [-6, 0.88, 4], new THREE.MeshLambertMaterial({ color: 0x303c47 }), 'bank-guard');
  const rearGuard = box(group, [0.7, 1.75, 0.5], [6.8, 0.88, -0.2], new THREE.MeshLambertMaterial({ color: 0x303c47 }), 'bank-rear-guard');
  const crowd = box(group, [4.8, 0.12, 3.4], [3.5, 0.06, 2.8], MAT.marble, 'bank-crowd');
  crowd.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const manager = box(group, [0.7, 1.75, 0.5], [7.5, 0.88, -4.2], new THREE.MeshLambertMaterial({ color: 0x574b3d }), 'bank-manager');
  const civilians = Array.from({ length: 16 }, (_, index) => civilianFigure(group, [
    1.2 + (index % 4) * 1.45,
    0,
    0.9 + Math.floor(index / 4) * 1.25,
  ], index));
  const vault = mesh(group, new THREE.CylinderGeometry(2.4, 2.4, 0.5, 32), MAT.steel, [0, 2.6, -10.1], 'vault-door');
  vault.rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    box(group, [0.72, 0.32, 0.5], [-3.2 + (i % 4) * 2.1, 0.32, -7.2 + Math.floor(i / 4) * 1.1], MAT.cash, `cash-${i + 1}`);
  }
  const exit = box(group, [3.2, 3.8, 0.12], [0, 1.9, 10.8], MAT.glass, 'bank-exit');
  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 8.5),
    interactables: { guard, rearGuard, crowd, manager, vault, exit },
    civilians,
    colliders: [
      ...roomColliders(22, 22, 6),
      ...[-8, -3, 3, 8].map((x) => bounds([1.1, 5.6, 1.1], [x, 2.8, 7])),
      ...Array.from({ length: 5 }, (_, i) => bounds([3.4, 1.35, 0.8], [-7.2 + i * 3.55, 0.68, -2.4])),
      bounds([5.2, 0.8, 2.6], [0, 0.4, -7.0]),
    ],
    floorZones: [floorZone(22, 22, 'marble')],
  };
}

function buildStreet() {
  const group = new THREE.Group();
  group.name = 'phase-street';
  box(group, [18, 0.2, 72], [0, -0.1, 0], MAT.asphalt);
  for (const side of [-1, 1]) {
    box(group, [3.4, 0.35, 72], [side * 10.3, 0.12, 0], MAT.concrete);
    for (let i = 0; i < 9; i++) {
      const color = i % 2 ? 0x3d4449 : 0x342f2b;
      box(group, [6, 8 + (i % 3) * 2, 7], [side * 13.4, 4, -31 + i * 8],
        new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    }
  }
  const coverCars = [];
  for (let i = 0; i < 8; i++) {
    const position = [i % 2 ? -5.5 : 5.5, 0, -25 + i * 7];
    vehicle(group, position, i % 3 ? 0x31363a : 0x5a1f22, `cover-car-${i}`);
    coverCars.push(bounds([4.1, 1.9, 2.2], [position[0], 0.95, position[2]]));
  }
  box(group, [7, 6.5, 1], [-5.5, 3.25, 35], MAT.marble, 'bank-facade-left');
  box(group, [7, 6.5, 1], [5.5, 3.25, 35], MAT.marble, 'bank-facade-right');
  box(group, [4, 2.2, 1], [0, 5.4, 35], MAT.marble, 'bank-facade-lintel');
  const bankDoor = box(group, [4, 4, 0.2], [0, 2, 34], MAT.brass, 'street-start');
  const van = vehicle(group, [0, 0, 14], 0x111316, 'disabled-van');
  van.rotation.y = 0.18;
  const droppedBag = box(group, [0.8, 0.45, 0.5], [-3.2, 0.23, -6], new THREE.MeshLambertMaterial({ color: 0x18191a }), 'dropped-bag');
  const garage = box(group, [7, 4.5, 0.2], [0, 2.25, -35], MAT.concrete, 'garage-entry');
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

function buildGarage() {
  const group = new THREE.Group();
  group.name = 'phase-garage';
  room(group, 24, 30, 4.4);
  for (const x of [-8, -3, 3, 8]) for (const z of [-10, 0, 10]) {
    box(group, [0.8, 4.4, 0.8], [x, 2.2, z], MAT.concrete);
  }
  const hold = box(group, [8, 0.1, 3], [0, 0.05, 8], new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }), 'garage-hold');
  const sedan = vehicle(group, [0, 0, -8], 0x34393d, 'escape-sedan');
  const load = box(group, [2.4, 1.1, 0.2], [0, 0.85, -7], MAT.steel, 'sedan-trunk');
  const drive = box(group, [1, 1.3, 0.2], [-1.1, 1.1, -8], MAT.glass, 'driver-door');
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

function buildDriving() {
  const group = new THREE.Group();
  group.name = 'phase-driving';
  /* A real route with three committed city turns. The old prototype was a
   * straight 130m runway; this folded street plan forces braking, steering and
   * recovery while keeping every junction readable from the chase camera. */
  const roads = [
    { x: 0, z: -76, w: 24, d: 212 },
    { x: 120, z: -180, w: 264, d: 24 },
    { x: 250, z: -290, w: 24, d: 244 },
    { x: 135, z: -420, w: 254, d: 24 },
    { x: 20, z: -535, w: 24, d: 254 },
  ];
  for (const road of roads) box(group, [road.w, 0.2, road.d], [road.x, -0.1, road.z], MAT.asphalt);
  const blocks = [
    [-17, -55, 10, 24], [17, -70, 10, 24], [105, -205, 22, 10], [195, -155, 22, 10],
    [225, -290, 10, 28], [275, -330, 10, 28], [150, -445, 24, 10], [65, -395, 24, 10],
    [-7, -520, 10, 28], [47, -570, 10, 28],
  ];
  for (const [x, z, w, d] of blocks) {
    box(group, [w, 7 + ((Math.abs(x) + Math.abs(z)) % 4), d], [x, 3.5, z], MAT.darkConcrete);
  }
  const route = Object.freeze([
    Object.freeze({ id: 'warehouse_left', x: 0, z: -170, radius: 18, label: 'LEFT — MARKET STREET' }),
    Object.freeze({ id: 'market_east', x: 240, z: -180, radius: 20, label: 'RIGHT — FINANCIAL DISTRICT' }),
    Object.freeze({ id: 'roadblock', x: 250, z: -400, radius: 20, label: 'CENTER GAP — ROADBLOCK' }),
    Object.freeze({ id: 'canal_turn', x: 30, z: -420, radius: 20, label: 'LEFT — CANAL SERVICE ROAD' }),
    Object.freeze({ id: 'industrial_swap', x: 20, z: -650, radius: 20, label: 'INDUSTRIAL SWAP' }),
  ]);
  for (const node of route) {
    const marker = box(group, [0.24, 2.8, 0.24], [node.x, 1.4, node.z],
      new THREE.MeshBasicMaterial({ color: 0xc9a85d }), `route-${node.id}`);
    marker.userData.routeNode = node.id;
  }
  const roadblock = new THREE.Group();
  roadblock.name = 'roadblock';
  roadblock.position.set(250, 0, -400);
  vehicle(roadblock, [-4.6, 0, 0], 0x1c3048);
  vehicle(roadblock, [4.6, 0, 0], 0x1c3048);
  group.add(roadblock);
  const swapMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const swap = box(group, [9, 0.1, 7], [20, 0.05, -652], swapMat, 'industrial-swap');
  const cleanCar = vehicle(group, [23.8, 0, -656], 0x18231f, 'clean-swap-car');
  cleanCar.rotation.y = Math.PI / 2;
  const trunk = box(group, [1.4, 0.7, 0.2], [22.9, 0.82, -656], MAT.steel, 'swap-trunk');
  const bags = box(group, [1.6, 0.7, 0.8], [17.7, 0.36, -652], MAT.darkConcrete, 'swap-bags');
  const aid = box(group, [0.62, 0.18, 0.42], [15.8, 0.76, -654], MAT.marble, 'swap-aid');
  const masks = box(group, [0.72, 0.16, 0.48], [16.9, 0.7, -656], MAT.darkConcrete, 'swap-masks');
  const jackets = box(group, [1.1, 0.28, 0.6], [18.5, 0.15, -657], MAT.wood, 'swap-jackets');
  const weapons = box(group, [1.7, 0.24, 0.62], [20.2, 0.16, -657], MAT.steel, 'swap-weapons');
  const wipe = box(group, [0.6, 0.08, 0.42], [21.7, 0.75, -654], MAT.marble, 'swap-wipe');
  const depart = box(group, [1.2, 1.4, 0.2], [24.1, 1.0, -655.2], swapMat, 'swap-depart');
  const car = vehicle(group, [0, 0, 18], 0x34393d, 'player-car');
  for (const z of [-0.58, 0.58]) {
    const headlight = new THREE.PointLight(0xffe4b0, 2.4, 24, 1.6);
    headlight.position.set(1.9, 0.78, z);
    car.add(headlight);
  }
  return {
    group, spawn: new THREE.Vector3(0, 2.4, 20), car, roadblock, roads, route,
    obstacles: blocks.map(([x, z, w, d]) => ({ x, z, w, d })),
    interactables: { swap, trunk, bags, aid, masks, jackets, weapons, wipe, depart },
    colliders: [],
    floorZones: roads.map((road) => floorZone(road.w, road.d, 'asphalt', road.x, road.z)),
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

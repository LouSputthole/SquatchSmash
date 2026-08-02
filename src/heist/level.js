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
  paper: new THREE.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.92 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x20384a, roughness: 0.72 }),
  tactical: new THREE.MeshStandardMaterial({ color: 0x171c1d, roughness: 0.88 }),
  webbing: new THREE.MeshStandardMaterial({ color: 0x4e5548, roughness: 1 }),
  warning: new THREE.MeshStandardMaterial({ color: 0xa33c2f, roughness: 0.76 }),
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
  const torso = box(root, [0.48, 0.88, 0.3], [0, 1.05, 0], clothing, 'civilian-torso');
  const head = mesh(root, new THREE.SphereGeometry(0.22, 12, 9), skin, [0, 1.68, 0], 'civilian-head');
  const hair = mesh(root, new THREE.SphereGeometry(0.225, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: [0x2c211c, 0x59422c, 0x171719][index % 3] }), [0, 1.72, -0.015], 'civilian-hair');
  const armLeft = box(root, [0.14, 0.72, 0.16], [-0.33, 1.08, 0], skin, 'civilian-arm-left');
  const armRight = box(root, [0.14, 0.72, 0.16], [0.33, 1.08, 0], skin, 'civilian-arm-right');
  const legLeft = box(root, [0.17, 0.78, 0.18], [-0.15, 0.4, 0], MAT.darkConcrete, 'civilian-leg-left');
  const legRight = box(root, [0.17, 0.78, 0.18], [0.15, 0.4, 0], MAT.darkConcrete, 'civilian-leg-right');
  const response = ['kneeling', 'prone', 'hiding', 'protecting'][index % 4];
  const resetPose = () => {
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    root.position.y = 0;
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    hair.rotation.set(0, 0, 0);
    armLeft.rotation.set(0, 0, 0);
    armRight.rotation.set(0, 0, 0);
    legLeft.rotation.set(0, 0, 0);
    legRight.rotation.set(0, 0, 0);
  };
  root.userData.setState = (state) => {
    resetPose();
    const visual = ['prone', 'kneeling', 'comply'].includes(state) ? response : state;
    if (visual === 'prone') {
      root.rotation.x = -Math.PI / 2;
      root.position.y = 0.3;
    } else if (visual === 'kneeling') {
      root.scale.y = 0.72;
      armLeft.rotation.z = -0.7;
      armRight.rotation.z = 0.7;
    } else if (visual === 'hiding') {
      root.scale.y = 0.78;
      root.rotation.y = index % 2 ? 0.72 : -0.72;
      armLeft.rotation.x = -1.45;
      armRight.rotation.x = -1.45;
    } else if (visual === 'protecting') {
      root.scale.y = 0.68;
      armLeft.rotation.z = -1.9;
      armRight.rotation.z = 1.9;
      head.rotation.x = -0.35;
    }
    root.userData.visualState = visual;
    return visual;
  };
  root.userData.responseStyle = response;
  group.add(root);
  return root;
}

function bankActor(group, {
  name, position, clothing = 0x303c47, manager = false, guard = false,
}) {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(...position);
  const cloth = new THREE.MeshStandardMaterial({ color: clothing, roughness: 0.82 });
  const skin = new THREE.MeshLambertMaterial({ color: manager ? 0xb98562 : 0x9c6c4d });
  box(root, [0.62, 0.94, 0.38], [0, 1.1, 0], cloth, `${name}-torso`);
  mesh(root, new THREE.SphereGeometry(0.25, 12, 9), skin, [0, 1.8, 0], `${name}-head`);
  const armLeft = box(root, [0.16, 0.8, 0.18], [-0.41, 1.08, 0], cloth, `${name}-arm-left`);
  const armRight = box(root, [0.16, 0.8, 0.18], [0.41, 1.08, 0], cloth, `${name}-arm-right`);
  box(root, [0.2, 0.82, 0.22], [-0.18, 0.42, 0], MAT.darkConcrete, `${name}-leg-left`);
  box(root, [0.2, 0.82, 0.22], [0.18, 0.42, 0], MAT.darkConcrete, `${name}-leg-right`);
  if (guard) {
    const badge = mesh(root, new THREE.CircleGeometry(0.075, 12), MAT.brass, [-0.18, 1.28, 0.2], `${name}-badge`);
    const gun = new THREE.Group();
    gun.name = `${name}-gun`;
    box(gun, [0.28, 0.11, 0.09], [0, 0, 0], MAT.tactical);
    box(gun, [0.1, 0.22, 0.08], [-0.06, -0.13, 0], MAT.tactical);
    gun.position.set(0.45, 0.9, 0.18);
    gun.visible = false;
    root.add(gun);
    root.userData.setThreatProgress = (progress) => {
      const p = Math.max(0, Math.min(1, progress));
      gun.visible = p > 0;
      gun.position.y = 0.9 + p * 0.55;
      gun.position.z = 0.18 + p * 0.1;
      armRight.rotation.x = -p * 1.2;
      armRight.rotation.z = p * 0.35;
    };
    root.userData.setNeutralized = () => {
      gun.visible = false;
      root.rotation.z = -Math.PI / 2;
      root.position.y = 0.35;
    };
    root.userData.resetThreatPose = () => {
      gun.visible = false;
      gun.position.set(0.45, 0.9, 0.18);
      armRight.rotation.set(0, 0, 0);
      root.rotation.z = 0;
      root.position.y = 0;
    };
    badge.rotation.y = 0;
  }
  if (manager) {
    const briefcase = new THREE.Group();
    briefcase.name = `${name}-briefcase`;
    box(briefcase, [0.48, 0.36, 0.14], [0, 0, 0], MAT.wood);
    box(briefcase, [0.2, 0.08, 0.08], [0, 0.23, 0], MAT.brass);
    briefcase.position.set(0.48, 0.65, 0);
    root.add(briefcase);
    armRight.rotation.z = 0.18;
  }
  group.add(root);
  return root;
}

function buildSafehouse() {
  const group = new THREE.Group();
  group.name = 'phase-safehouse';
  room(group, 18, 14, 4.2);
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
  }
  for (const [x, y] of [[-1.3, 0.2], [-0.2, 0.35], [0.8, -0.05], [1.45, 0.3]]) {
    const pin = mesh(evidence, new THREE.SphereGeometry(0.045, 8, 6), MAT.warning, [x, y, 0.12]);
    pin.castShadow = false;
  }
  group.add(evidence);

  const briefing = new THREE.Group();
  briefing.name = 'briefing-map';
  briefing.position.set(0, 0, 0.2);
  box(briefing, [5.8, 0.18, 2.4], [0, 0.88, 0], MAT.wood);
  for (const x of [-2.45, 2.45]) for (const z of [-0.85, 0.85]) {
    box(briefing, [0.24, 0.88, 0.24], [x, 0.43, z], MAT.steel);
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
  briefing.add(route);
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
  armor.userData.setEquipped = (value) => armorParts.forEach((part) => { part.visible = !value; });
  group.add(armor);

  const loadout = new THREE.Group();
  loadout.name = 'safehouse-loadout';
  loadout.position.set(4.7, 0, 2.5);
  box(loadout, [3.8, 0.17, 1.35], [0, 0.9, 0], MAT.wood, 'loadout-table');
  for (const x of [-1.55, 1.55]) box(loadout, [0.2, 0.9, 0.9], [x, 0.43, 0], MAT.steel);
  const gearParts = [];
  const carbine = new THREE.Group();
  carbine.name = 'loadout-carbine';
  carbine.position.set(-0.55, 1.08, 0.12);
  carbine.rotation.y = -0.08;
  gearParts.push(box(carbine, [1.5, 0.14, 0.15], [0, 0, 0], MAT.steel, 'loadout-carbine-receiver'));
  gearParts.push(box(carbine, [0.88, 0.055, 0.055], [1.02, 0, 0], MAT.tactical, 'loadout-carbine-barrel'));
  gearParts.push(box(carbine, [0.52, 0.17, 0.16], [-0.95, 0, 0], MAT.tactical, 'loadout-carbine-stock'));
  gearParts.push(box(carbine, [0.17, 0.42, 0.13], [0.12, -0.22, 0], MAT.steel, 'loadout-carbine-magwell'));
  loadout.add(carbine);
  const magazines = new THREE.Group();
  magazines.name = 'loadout-magazines';
  magazines.position.set(0.65, 1.12, -0.32);
  for (let i = 0; i < 3; i++) gearParts.push(box(magazines, [0.18, 0.38, 0.13], [i * 0.25, 0, 0], MAT.steel));
  loadout.add(magazines);
  const duffel = new THREE.Group();
  duffel.name = 'loadout-duffel';
  duffel.position.set(1.08, 1.15, 0.3);
  gearParts.push(box(duffel, [1.15, 0.48, 0.54], [0, 0, 0], MAT.webbing));
  const handle = mesh(duffel, new THREE.TorusGeometry(0.32, 0.035, 6, 16, Math.PI), MAT.tactical, [0, 0.3, 0]);
  handle.rotation.x = Math.PI / 2;
  gearParts.push(handle);
  loadout.add(duffel);
  loadout.userData.setEquipped = (value) => gearParts.forEach((part) => { part.visible = !value; });
  group.add(loadout);

  for (const x of [-4.5, 4.5]) {
    const light = new THREE.PointLight(0xffd89d, 2.8, 11, 2);
    light.position.set(x, 3.45, 0);
    group.add(light);
  }
  const cameraFill = new THREE.PointLight(0xffe5c2, 1.55, 9, 2);
  cameraFill.position.set(0, 2.75, 4.25);
  cameraFill.name = 'safehouse-camera-fill';
  group.add(cameraFill);
  const van = vehicle(group, [0, 0, 5], 0x151719, 'primary-van');
  van.scale.set(1.25, 1.2, 1.1);
  const vanDoor = box(group, [1.6, 2.2, 0.12], [0, 1.25, 5.95], MAT.steel, 'van-door');
  return {
    group,
    spawn: new THREE.Vector3(0, 1.66, 3),
    interactables: { briefing, armor, loadout, van: vanDoor },
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
  const columnXs = [-8, -4.4, 4.4, 8];
  for (const [index, x] of columnXs.entries()) {
    const column = mesh(group, new THREE.CylinderGeometry(0.42, 0.55, 5.6, 18),
      MAT.marble, [x, 2.8, 7], `bank-column-${index + 1}`);
    column.userData.kind = 'bank-column';
  }
  for (let i = 0; i < 5; i++) {
    box(group, [3.4, 1.35, 0.8], [-7.2 + i * 3.55, 0.68, -2.4], MAT.wood);
    box(group, [3.2, 1.2, 0.06], [-7.2 + i * 3.55, 1.9, -2], MAT.glass);
  }
  const guard = bankActor(group, {
    name: 'bank-guard', position: [-6, 0, 4], clothing: 0x26384a, guard: true,
  });
  const rearGuard = bankActor(group, {
    name: 'bank-rear-guard', position: [6.8, 0, -0.2], clothing: 0x26384a, guard: true,
  });
  rearGuard.rotation.y = Math.PI;
  const crowd = box(group, [4.8, 0.12, 3.4], [3.5, 0.06, 2.8], MAT.marble, 'bank-crowd');
  crowd.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const manager = bankActor(group, {
    name: 'bank-manager', position: [7.5, 0, -4.2], clothing: 0x574b3d, manager: true,
  });
  const managerStart = manager.position.clone();
  const managerEnd = new THREE.Vector3(2.7, 0, -8.1);
  manager.userData.setEscortProgress = (progress) => {
    const p = Math.max(0, Math.min(1, progress));
    manager.position.lerpVectors(managerStart, managerEnd, p);
    manager.rotation.y = Math.atan2(managerEnd.x - manager.position.x, managerEnd.z - manager.position.z);
    manager.userData.escortProgress = p;
  };
  const civilians = Array.from({ length: 16 }, (_, index) => civilianFigure(group, [
    1.2 + (index % 4) * 1.45,
    0,
    0.9 + Math.floor(index / 4) * 1.25,
  ], index));
  for (const [x, color] of [[-7.2, 0xffd9a1], [0, 0xffe4bd], [7.2, 0xd6e6ff]]) {
    const light = new THREE.PointLight(color, 2.5, 13, 2);
    light.position.set(x, 4.7, 1.5);
    group.add(light);
  }
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
      ...columnXs.map((x) => bounds([1.1, 5.6, 1.1], [x, 2.8, 7])),
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
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xc9b977 });
  for (const road of roads) {
    box(group, [road.w, 0.2, road.d], [road.x, -0.1, road.z], MAT.asphalt);
    if (road.d > road.w) {
      for (let z = road.z - road.d / 2 + 8; z < road.z + road.d / 2; z += 18) {
        box(group, [0.18, 0.025, 7], [road.x, 0.015, z], laneMat);
      }
    } else {
      for (let x = road.x - road.w / 2 + 8; x < road.x + road.w / 2; x += 18) {
        box(group, [7, 0.025, 0.18], [x, 0.015, road.z], laneMat);
      }
    }
  }
  const blocks = [
    [-17, -55, 10, 24], [17, -70, 10, 24], [105, -205, 22, 10], [195, -155, 22, 10],
    [225, -290, 10, 28], [275, -330, 10, 28], [150, -445, 24, 10], [65, -395, 24, 10],
    [-7, -520, 10, 28], [47, -570, 10, 28],
  ];
  const warmWindows = new THREE.MeshBasicMaterial({ color: 0x8f7547, toneMapped: false });
  const coolWindows = new THREE.MeshBasicMaterial({ color: 0x536b70, toneMapped: false });
  for (const [index, [x, z, w, d]] of blocks.entries()) {
    box(group, [w, 7 + ((Math.abs(x) + Math.abs(z)) % 4), d], [x, 3.5, z], MAT.darkConcrete,
      `route-building-${index + 1}`);
    for (const [level, y] of [2.25, 4.45].entries()) {
      const windowMaterial = (index + level) % 3 === 0 ? coolWindows : warmWindows;
      const frontStrip = box(group, [Math.max(1.8, w * 0.62), 0.22, 0.07],
        [x, y, z + d / 2 + 0.04], windowMaterial, `driving-window-front-${index + 1}-${level + 1}`);
      const sideStrip = box(group, [0.07, 0.22, Math.max(1.8, d * 0.62)],
        [x + w / 2 + 0.04, y, z], windowMaterial, `driving-window-side-${index + 1}-${level + 1}`);
      frontStrip.userData.kind = 'driving-window-strip';
      sideStrip.userData.kind = 'driving-window-strip';
    }
  }
  const route = Object.freeze([
    Object.freeze({ id: 'warehouse_left', x: 0, z: -170, radius: 18, label: 'LEFT — MARKET STREET' }),
    Object.freeze({ id: 'market_east', x: 240, z: -180, radius: 20, label: 'RIGHT — FINANCIAL DISTRICT' }),
    Object.freeze({ id: 'roadblock', x: 250, z: -400, radius: 20, label: 'CENTER GAP — ROADBLOCK' }),
    Object.freeze({ id: 'canal_turn', x: 30, z: -420, radius: 20, label: 'LEFT — CANAL SERVICE ROAD' }),
    Object.freeze({ id: 'industrial_swap', x: 20, z: -650, radius: 20, label: 'INDUSTRIAL SWAP' }),
  ]);
  for (const node of route) {
    const marker = box(group, [0.42, 4.4, 0.42], [node.x, 2.2, node.z],
      new THREE.MeshBasicMaterial({ color: 0xc9a85d }), `route-${node.id}`);
    marker.userData.routeNode = node.id;
  }
  const practicalMaterial = new THREE.MeshBasicMaterial({ color: 0xe4c36f, toneMapped: false });
  const practicalPositions = [
    [-8.5, -18], [8.5, -55], [-8.5, -92], [8.5, -130], [-8.5, -162],
    [52, -171.5], [106, -188.5], [160, -171.5], [214, -188.5],
    [241.5, -235], [258.5, -290], [241.5, -345], [258.5, -390],
    [205, -411.5], [145, -428.5], [85, -411.5], [35, -428.5],
    [11.5, -475], [28.5, -535], [11.5, -595],
  ];
  for (const [index, [x, z]] of practicalPositions.entries()) {
    box(group, [0.14, 5.8, 0.14], [x, 2.9, z], MAT.steel, `route-lamp-post-${index + 1}`);
    const practical = box(group, [0.72, 0.14, 0.34], [x, 5.72, z], practicalMaterial,
      `route-practical-${index + 1}`);
    practical.userData.kind = 'route-practical';
  }
  for (const [x, z] of [[0, -80], [180, -180], [250, -350], [55, -420]]) {
    const light = new THREE.PointLight(0xffd69b, 3.4, 72, 2);
    light.position.set(x, 7, z);
    group.add(light);
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
    const headlight = new THREE.PointLight(0xffe4b0, 4.5, 36, 1.55);
    headlight.position.set(1.9, 0.78, z);
    car.add(headlight);
    box(car, [0.08, 0.2, 0.34], [1.96, 0.78, z], practicalMaterial,
      `player-headlamp-${z < 0 ? 'left' : 'right'}`);
  }
  const pursuit = vehicle(group, [0, 0, 33], 0x203854, 'pursuit-cruiser');
  pursuit.scale.set(0.94, 0.94, 0.94);
  const redLens = new THREE.MeshBasicMaterial({ color: 0xff282d, toneMapped: false });
  const blueLens = new THREE.MeshBasicMaterial({ color: 0x3f7dff, toneMapped: false });
  box(pursuit, [0.74, 0.12, 0.18], [-0.42, 1.78, 0], redLens, 'pursuit-lightbar-red');
  box(pursuit, [0.74, 0.12, 0.18], [0.42, 1.78, 0], blueLens, 'pursuit-lightbar-blue');
  for (const z of [-0.58, 0.58]) {
    box(pursuit, [0.08, 0.18, 0.3], [1.96, 0.76, z], practicalMaterial,
      `pursuit-headlamp-${z < 0 ? 'left' : 'right'}`);
    box(pursuit, [0.08, 0.18, 0.3], [-1.96, 0.76, z], redLens,
      `pursuit-tail-${z < 0 ? 'left' : 'right'}`);
  }
  const red = new THREE.PointLight(0xe13d3d, 3.2, 12, 2);
  const blue = new THREE.PointLight(0x3f72e5, 3.2, 12, 2);
  red.position.set(-0.35, 1.85, 0);
  blue.position.set(0.35, 1.85, 0);
  pursuit.add(red, blue);
  return {
    group, spawn: new THREE.Vector3(0, 2.4, 20), car, pursuit, roadblock, roads, route,
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

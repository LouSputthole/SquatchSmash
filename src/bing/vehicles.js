/**
 * The cars in the lot, and the one you arrived in.
 *
 * Fifteen-odd vehicles built from one boxy factory dressed four ways, plus a
 * driveable interior for yours: a windscreen with rain on it, a radio, a glove
 * box, and a handbrake that ends the mission.
 */
import * as THREE from 'three';
import { mat, box, group, collider } from '../world/build.js';
import { lit, rand, pick } from './kit.js';

const BODY_COLOURS = [0x16161c, 0x24242e, 0x4a1418, 0x2e2e36, 0x5a4a2a, 0x18242e, 0x7a7a82, 0x3a2a1e];

const SHAPES = {
  sedan: { L: 4.9, bodyH: 1.0, W: 1.95, cabinL: 2.5, cabinH: 0.9, wheelR: 0.36, cabinOff: -0.25 },
  lincoln: { L: 5.4, bodyH: 1.05, W: 2.0, cabinL: 2.7, cabinH: 0.86, wheelR: 0.37, cabinOff: -0.4 },
  suv: { L: 4.8, bodyH: 1.45, W: 2.05, cabinL: 2.9, cabinH: 1.1, wheelR: 0.42, cabinOff: -0.1 },
  compact: { L: 3.9, bodyH: 0.88, W: 1.72, cabinL: 2.0, cabinH: 0.8, wheelR: 0.31, cabinOff: -0.1 },
  van: { L: 5.7, bodyH: 2.05, W: 2.2, cabinL: 3.4, cabinH: 1.25, wheelR: 0.4, cabinOff: 0.7 },
};

/**
 * One car. Returns the group plus the bits that light up, because half of
 * these have somebody sitting in them with the engine running.
 */
export function makeCar(kind = 'sedan', colour = null, { dented = false } = {}) {
  const s = SHAPES[kind] ?? SHAPES.sedan;
  const paint = mat({ color: colour ?? pick(BODY_COLOURS), roughness: dented ? 0.72 : 0.36, metalness: 0.55 });
  const glass = mat({ color: 0x0d141c, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.82 });
  const rubber = mat({ color: 0x101014, roughness: 0.95 });
  const chrome = mat({ color: 0xb9c0cc, roughness: 0.2, metalness: 0.95 });

  const g = group(`car.${kind}`);
  const bodyY = s.wheelR + s.bodyH / 2;
  g.add(box({ size: [s.L, s.bodyH, s.W], pos: [0, bodyY, 0], mat: paint }));
  const cabinY = s.wheelR + s.bodyH + s.cabinH / 2;
  g.add(box({ size: [s.cabinL, s.cabinH, s.W * 0.94], pos: [s.cabinOff, cabinY, 0], mat: paint }));
  g.add(box({ size: [s.cabinL * 0.93, s.cabinH * 0.56, s.W * 0.96], pos: [s.cabinOff, cabinY + s.cabinH * 0.12, 0], mat: glass }));
  g.add(box({ size: [0.14, 0.16, s.W * 0.92], pos: [s.L / 2 - 0.05, s.wheelR + 0.3, 0], mat: chrome }));
  g.add(box({ size: [0.14, 0.16, s.W * 0.92], pos: [-s.L / 2 + 0.05, s.wheelR + 0.3, 0], mat: chrome }));

  const heads = [];
  const tails = [];
  for (const sz of [-1, 1]) {
    const h = box({ size: [0.08, 0.18, 0.34], pos: [s.L / 2 - 0.02, s.wheelR + s.bodyH * 0.65, sz * (s.W / 2 - 0.36)], mat: lit(0xfff0c8, 0.15) });
    const t = box({ size: [0.08, 0.14, 0.28], pos: [-s.L / 2 + 0.02, s.wheelR + s.bodyH * 0.65, sz * (s.W / 2 - 0.34)], mat: lit(0x8a1a1a, 0.6) });
    g.add(h, t);
    heads.push(h);
    tails.push(t);
  }

  const wheelGeo = new THREE.CylinderGeometry(s.wheelR, s.wheelR, 0.26, 14);
  wheelGeo.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, rubber);
      w.position.set(sx * (s.L / 2 - 1.1), s.wheelR, sz * (s.W / 2 - 0.03));
      w.castShadow = true;
      g.add(w);
    }
  }
  if (dented) {
    g.add(box({ size: [0.9, 0.5, 0.06], pos: [1.2, s.wheelR + 0.5, s.W / 2 - 0.02], mat: mat({ color: 0x8a8a90, roughness: 0.95 }) }));
  }
  g.userData.vehicle = {
    kind,
    length: s.L,
    width: s.W,
    height: s.wheelR + s.bodyH + s.cabinH,
  };

  return {
    group: g, heads, tails,
    length: s.L, width: s.W, height: s.wheelR + s.bodyH + s.cabinH,
    collider: collider([-s.L / 2, 0, -s.W / 2], [s.L / 2, 1.6, s.W / 2]),
  };
}

/**
 * Axis-aligned world collider around a transformed car.
 *
 * Cars are authored long on local X and can face any yaw. The old lot code
 * assumed every collider was long on world Z, which happened to fit most bays
 * but left the sideways surveillance car solid in empty space and permeable
 * through its doors. The wheel allowance covers the small amount by which the
 * tyres sit proud of the nominal body width.
 */
export function makeVehicleCollider(vehicle, pad = 0.08) {
  const yaw = vehicle.group.rotation.y;
  const halfLength = vehicle.length / 2 + pad;
  const halfWidth = vehicle.width / 2 + 0.12 + pad;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const halfX = c * halfLength + s * halfWidth;
  const halfZ = s * halfLength + c * halfWidth;
  const { x, z } = vehicle.group.position;
  return collider(
    [x - halfX, 0, z - halfZ],
    [x + halfX, Math.max(1.6, vehicle.height), z + halfZ],
    0,
  );
}

/** Two silhouettes in a car with the engine off. They do not get out. */
export function makeWatchers() {
  const g = group('watchers');
  const fur = mat({ color: 0x1a1a20, roughness: 1 });
  for (const sz of [-0.45, 0.45]) {
    g.add(box({ size: [0.42, 0.5, 0.34], pos: [0, 0, sz], mat: fur }));
    g.add(box({ size: [0.3, 0.3, 0.3], pos: [-0.05, 0.4, sz], mat: fur }));
  }
  return g;
}

/**
 * Your car, with an interior you can sit in.
 *
 * The mission starts here: engine running, wipers going, radio on, and a
 * message on the dash telling you Lou has something for you.
 */
export function makePlayerCar(scene, { x, z, yaw = 0 }) {
  const car = makeCar('sedan', 0x1d1f28);
  car.group.position.set(x, 0, z);
  car.group.rotation.y = yaw;
  car.group.userData.role = 'player-car';
  scene.add(car.group);

  const interior = group('interior');
  const trim = mat({ color: 0x2a2118, roughness: 0.9 });
  const dash = box({ size: [0.5, 0.28, 1.7], pos: [0.75, 1.05, 0], mat: trim });
  interior.add(dash);
  // Wheel, radio, glove box, mirror
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 20), mat({ color: 0x14141a, roughness: 0.8 }));
  wheel.position.set(0.52, 1.12, -0.42);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.5;
  interior.add(wheel);
  const radioFace = box({ size: [0.03, 0.1, 0.26], pos: [0.52, 1.06, 0.02], mat: lit(0xffb648, 1.4) });
  interior.add(radioFace);
  const gloveLid = box({ size: [0.04, 0.22, 0.42], pos: [0.5, 0.95, 0.44], mat: mat({ color: 0x322619, roughness: 0.9 }) });
  interior.add(gloveLid);
  interior.add(box({ size: [0.06, 0.5, 1.7], pos: [-0.9, 1.0, 0], mat: trim }));  // rear bench
  interior.add(box({ size: [0.5, 0.06, 1.7], pos: [-0.55, 0.72, 0], mat: trim })); // seat base
  car.group.add(interior);

  // Poses live in car-local space, so changing the parking angle cannot put
  // Tony or the interaction pad through the neighbouring vehicle.
  const driverLocal = new THREE.Vector3(-0.35, 1.24, -0.42);
  const exitLocal = new THREE.Vector3(-0.35, 0, -1.55);
  const worldPoint = (local) => {
    car.group.updateMatrixWorld(true);
    return local.clone().applyMatrix4(car.group.matrixWorld);
  };

  return {
    ...car,
    interior,
    radioFace,
    gloveLid,
    wheel,
    driverLocal,
    exitLocal,
    /** Where the camera sits when you are behind the wheel. */
    driverPosition: () => worldPoint(driverLocal),
    /** Clear ground beside the driver's door. */
    exitPosition: () => worldPoint(exitLocal),
    /** Player yaw matching the car's local +X forward direction. */
    driverYaw: () => car.group.rotation.y - Math.PI / 2,
    worldCollider: makeVehicleCollider(car),
  };
}

/** Fill the lot: Lincolns, Cadillacs, two SUVs, a van, and one dented compact. */
export function populateLot(scene, colliders, anchors) {
  const spots = [
    [-23.7, 25, 'lincoln', null, {}], [-19.1, 25, 'sedan', null, {}], [-14.5, 25, 'suv', 0x2a2a34, {}],
    [-9.9, 25, 'sedan', null, {}], [-5.3, 25, 'lincoln', 0x1a1a22, {}],
    [3.9, 25, 'compact', 0x6a4a2a, { dented: true }], [8.5, 25, 'sedan', null, {}],
    [13.1, 25, 'suv', null, {}], [17.7, 25, 'lincoln', null, {}],
    [-23.7, 35, 'sedan', null, {}], [-19.1, 35, 'sedan', null, {}], [-9.9, 35, 'van', 0xd8d4c8, {}],
    [-0.7, 35, 'lincoln', null, {}], [8.5, 35, 'sedan', null, {}], [17.7, 35, 'sedan', null, {}],
  ];
  const cars = [];
  for (const [cx, cz, kind, colour, opts] of spots) {
    const c = makeCar(kind, colour, opts);
    c.group.position.set(cx, 0, cz);
    c.group.rotation.y = Math.PI / 2 + rand(-0.03, 0.03);
    scene.add(c.group);
    c.worldCollider = makeVehicleCollider(c);
    colliders.push(c.worldCollider);
    cars.push(c);
  }

  // Lou's dark sedan, in the space with his name painted under it
  const lou = makeCar('lincoln', 0x101016);
  lou.group.position.copy(anchors.louCar);
  lou.group.rotation.y = Math.PI / 2;
  scene.add(lou.group);
  lou.worldCollider = makeVehicleCollider(lou);
  colliders.push(lou.worldCollider);

  // And the suspiciously clean one, parked where it can see the back office
  const watchers = makeCar('sedan', 0x2e3038);
  watchers.group.position.copy(anchors.suspiciousCar);
  watchers.group.rotation.y = Math.PI;
  const inside = makeWatchers();
  inside.position.set(-0.2, 1.15, 0);
  watchers.group.add(inside);
  scene.add(watchers.group);
  watchers.worldCollider = makeVehicleCollider(watchers);
  colliders.push(watchers.worldCollider);

  return { cars, lou, watchers, watcherFigures: inside };
}

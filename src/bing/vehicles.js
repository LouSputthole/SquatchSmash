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
  const trim = mat({ color: 0x241d18, roughness: 0.88 });
  const vinyl = mat({ color: 0x17171b, roughness: 0.82 });
  const stitched = mat({ color: 0x302922, roughness: 0.95 });
  const dashPlastic = mat({ color: 0x121317, roughness: 0.76 });
  const gaugeDark = mat({ color: 0x090a0c, roughness: 0.42, metalness: 0.15 });
  const chromeTrim = mat({ color: 0xb9c0cc, roughness: 0.2, metalness: 0.95 });
  const amber = lit(0xffb648, 1.4);

  /* The first interior was a dash, one bench and a steering-wheel ring. More
   * importantly, Tony's eye was at y=1.24 while the sedan's solid body shell
   * reaches y=1.36. The camera was physically inside a block. This cockpit is
   * built around a 1.55 m seated eye: all seat backs and headrests finish
   * behind or below it, and the body sill stays below the camera. */
  const dash = box({
    name: 'cockpit.dashboard', size: [0.48, 0.28, 1.72], pos: [0.72, 1.20, 0], mat: dashPlastic,
  });
  interior.add(dash);

  // Two proper front seats. The headrests are behind Tony, never around him.
  const seats = [];
  for (const side of [-1, 1]) {
    const zSeat = side * 0.43;
    const seat = group(side < 0 ? 'cockpit.seat.driver' : 'cockpit.seat.passenger');
    seat.add(box({ name: 'seat.cushion', size: [0.60, 0.12, 0.58], pos: [-0.43, 0.73, zSeat], mat: stitched }));
    seat.add(box({ name: 'seat.back', size: [0.13, 0.66, 0.56], pos: [-0.77, 1.08, zSeat], mat: stitched }));
    seat.add(box({ name: 'seat.headrest', size: [0.13, 0.22, 0.32], pos: [-0.80, 1.53, zSeat], mat: vinyl }));
    interior.add(seat);
    seats.push(seat);
  }

  // Rear bench, with a cushion, back and three low headrests visible on a look-back.
  const rearBench = group('cockpit.rear-bench');
  rearBench.add(box({ name: 'rear.cushion', size: [0.54, 0.13, 1.64], pos: [-1.28, 0.74, 0], mat: stitched }));
  rearBench.add(box({ name: 'rear.back', size: [0.13, 0.62, 1.66], pos: [-1.56, 1.06, 0], mat: stitched }));
  for (const rz of [-0.55, 0, 0.55]) {
    rearBench.add(box({ name: 'rear.headrest', size: [0.12, 0.17, 0.26], pos: [-1.58, 1.45, rz], mat: vinyl }));
  }
  interior.add(rearBench);

  // Wheel, column, instrument binnacle and illuminated analogue gauges.
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.024, 8, 24),
    mat({ color: 0x111216, roughness: 0.76 }),
  );
  wheel.name = 'cockpit.steering-wheel';
  wheel.position.set(0.43, 1.33, -0.43);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.32;
  interior.add(wheel);
  const steeringColumn = cylinderMesh(0.035, 0.44, dashPlastic);
  steeringColumn.name = 'cockpit.steering-column';
  steeringColumn.position.set(0.50, 1.22, -0.43);
  steeringColumn.rotation.z = Math.PI / 2;
  interior.add(steeringColumn);
  interior.add(box({ name: 'cockpit.gauge-hood', size: [0.11, 0.24, 0.54], pos: [0.47, 1.45, -0.43], mat: dashPlastic }));
  const gauges = [];
  for (const [gz, r] of [[-0.56, 0.075], [-0.39, 0.085], [-0.23, 0.06]]) {
    const bezel = cylinderMesh(r, 0.018, gaugeDark, 18);
    bezel.name = 'cockpit.gauge';
    bezel.position.set(0.405, 1.46, gz);
    bezel.rotation.z = Math.PI / 2;
    interior.add(bezel);
    const needle = box({ name: 'cockpit.gauge-needle', size: [0.012, r * 0.95, 0.008], pos: [0.393, 1.46, gz], mat: amber });
    needle.rotation.x = 0.55;
    interior.add(needle);
    gauges.push(bezel);
  }

  // Centre stack: radio display, station buttons, vents, glove box and trim.
  const radioFace = box({ name: 'cockpit.radio-display', size: [0.035, 0.105, 0.28], pos: [0.47, 1.25, 0.03], mat: amber });
  interior.add(radioFace);
  for (const zButton of [-0.10, -0.05, 0, 0.05, 0.10]) {
    interior.add(box({ name: 'cockpit.radio-button', size: [0.04, 0.026, 0.026], pos: [0.445, 1.16, zButton], mat: gaugeDark }));
  }
  for (const zVent of [-0.18, 0.18]) {
    interior.add(box({ name: 'cockpit.vent', size: [0.04, 0.085, 0.14], pos: [0.445, 1.39, zVent], mat: gaugeDark }));
  }
  const gloveLid = box({ name: 'cockpit.glove-box', size: [0.045, 0.24, 0.44], pos: [0.48, 1.11, 0.48], mat: trim });
  interior.add(gloveLid);

  // Door cards, centre console, shifter, pedals and the little things that sell a cabin.
  for (const side of [-1, 1]) {
    interior.add(box({
      name: side < 0 ? 'cockpit.door.driver' : 'cockpit.door.passenger',
      size: [1.80, 0.55, 0.055], pos: [-0.25, 1.08, side * 0.86], mat: trim,
    }));
    interior.add(box({ name: 'cockpit.door-handle', size: [0.24, 0.035, 0.035], pos: [0.05, 1.28, side * 0.825], mat: chromeTrim }));
  }
  const consoleGroup = group('cockpit.center-console');
  consoleGroup.add(box({ name: 'console.body', size: [0.86, 0.24, 0.24], pos: [-0.22, 0.84, 0], mat: vinyl }));
  const shifter = cylinderMesh(0.022, 0.20, chromeTrim, 10);
  shifter.name = 'cockpit.shifter';
  shifter.position.set(0.03, 1.01, 0);
  shifter.rotation.z = -0.20;
  consoleGroup.add(shifter);
  consoleGroup.add(box({ name: 'cockpit.shifter-knob', size: [0.075, 0.075, 0.07], pos: [0.01, 1.12, 0], mat: dashPlastic }));
  interior.add(consoleGroup);
  for (const pz of [-0.52, -0.36]) {
    interior.add(box({ name: 'cockpit.pedal', size: [0.08, 0.16, 0.10], pos: [0.61, 0.58, pz], mat: gaugeDark, rotZ: -0.18 }));
  }

  const rearView = box({ name: 'cockpit.rear-view-mirror', size: [0.055, 0.12, 0.34], pos: [0.65, 1.88, 0], mat: chromeTrim });
  interior.add(rearView);
  const sunStrip = box({ name: 'cockpit.windscreen-header', size: [0.10, 0.09, 1.70], pos: [0.86, 1.98, 0], mat: vinyl });
  interior.add(sunStrip);
  const domeLamp = box({ name: 'cockpit.dome-lamp', size: [0.16, 0.025, 0.28], pos: [-0.25, 1.99, 0], mat: lit(0xffd2a0, 0.75) });
  interior.add(domeLamp);
  const domeLight = new THREE.PointLight(0xffd2a0, 0.62, 3.1, 2);
  domeLight.name = 'cockpit.dome-light';
  domeLight.position.set(-0.18, 1.82, 0);
  interior.add(domeLight);
  car.group.add(interior);

  // Poses live in car-local space, so changing the parking angle cannot put
  // Tony or the interaction pad through the neighbouring vehicle.
  const driverLocal = new THREE.Vector3(-0.18, 1.55, -0.43);
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
    seats,
    rearBench,
    gauges,
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

/** Small local helper: the shared builder's cylinder returns a Mesh too, but
 * the cockpit uses several arbitrary-axis cylinders and needs direct access
 * to their transforms before they join the car. */
function cylinderMesh(radius, height, material, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
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

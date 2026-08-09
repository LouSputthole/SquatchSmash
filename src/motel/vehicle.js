import * as THREE from 'three';
import { makePlayerCar } from '../bing/vehicles.js';

// The Motel owns the blocking and story beats; the actual automobile is the
// complete Bada Bing player car. Silver Case delegates to the same factory.
const MAROON = 0x8b3f5d;
const PARK = new THREE.Vector3(-8, 0, 17);
const ARRIVAL = [
  new THREE.Vector3(-36, 0, 34),
  new THREE.Vector3(-20, 0, 34),
  new THREE.Vector3(-8, 0, 8),
  PARK,
];

// The eye sits above the actual passenger cushion, not on the dashboard. That
// extra 37cm of setback is what lets a mostly-forward view retain Snow in a
// side third without clipping either adult rig.
const PASSENGER = new THREE.Vector3(-0.62, 1.55, 0.43);
const PASSENGER_ACTOR = new THREE.Vector3(-0.38, 0.02, 0.43);
const DRIVER_ACTOR = new THREE.Vector3(0.05, 0.06, -0.43);
const PASSENGER_DOOR = new THREE.Vector3(-0.20, 1.18, 0.82);
const PASSENGER_EXIT = new THREE.Vector3(-0.20, 0, 1.72);
const DRIVER_EXIT = new THREE.Vector3(-0.20, 0, -1.72);
const MONEY_CASE = new THREE.Vector3(-0.78, 1.05, 0.38);
const GLOVEBOX = new THREE.Vector3(0.55, 1.20, 0.45);
const TRUNK = new THREE.Vector3(-2.68, 1.0, 0);
// Front/passenger three-quarter: both faces, both seat assignments, and the
// open silhouette are readable without backing the proof camera into a palm.
const EXTERIOR_CAMERA = new THREE.Vector3(1.9, 2.35, 3.2);
const CABIN_CENTER = new THREE.Vector3(-0.30, 1.25, 0);

function bezierPoint(t, out = new THREE.Vector3()) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(ARRIVAL[0], u * u * u)
    .addScaledVector(ARRIVAL[1], 3 * u * u * t)
    .addScaledVector(ARRIVAL[2], 3 * u * t * t)
    .addScaledVector(ARRIVAL[3], t * t * t);
}

function bezierTangent(t, out = new THREE.Vector3()) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(ARRIVAL[1].clone().sub(ARRIVAL[0]), 3 * u * u)
    .addScaledVector(ARRIVAL[2].clone().sub(ARRIVAL[1]), 6 * u * t)
    .addScaledVector(ARRIVAL[3].clone().sub(ARRIVAL[2]), 3 * t * t)
    .normalize();
}

function removeConvertibleRoof(car) {
  const remove = new Set([
    'car.glass',
    'car.roof',
    'car.pillar.c.left',
    'car.pillar.c.right',
    'cockpit.headliner',
    'cockpit.dome-lamp',
    'cockpit.dome-light',
    'cockpit.sun-visor',
  ]);
  const doomed = [];
  car.group.traverse((object) => {
    if (remove.has(object.name)) doomed.push(object);
  });
  for (const object of doomed) object.parent?.remove(object);
}

function paintMaroon(car) {
  const original = car.paint;
  const paint = original.clone();
  paint.color.setHex(MAROON);
  car.group.traverse((object) => {
    if (object.material === original) object.material = paint;
  });
  car.paint = paint;
}

/**
 * Scene adapter over the Bing's complete cockpit.
 *
 * Coordinates and the short pull-in belong to the Motel. Seats, dashboard,
 * steering, door cards, pedals, windscreen and exterior remain the shared car.
 */
export function makeMotelArrivalCar(scene) {
  const car = makePlayerCar(scene, {
    x: PARK.x,
    z: PARK.z,
    yaw: -Math.PI / 2,
  });
  paintMaroon(car);
  removeConvertibleRoof(car);

  const driverSeat = car.group.getObjectByName('cockpit.seat.driver');
  const passengerSeat = car.group.getObjectByName('cockpit.seat.passenger');
  driverSeat.userData.seatRole = 'driver';
  driverSeat.userData.occupant = null;
  passengerSeat.userData.seatRole = 'passenger';
  passengerSeat.userData.occupant = null;

  // A bounded dashboard/courtesy glow: enough to read Snow, the wheel and
  // both seats, with a short falloff that cannot flatten the motel night.
  const cabinFill = new THREE.PointLight(0xffbdcf, 5.5, 3.4, 2);
  cabinFill.name = 'vehicle.motel.cabin-fill';
  cabinFill.position.set(-0.18, 1.72, 0);
  car.group.add(cabinFill);

  car.group.name = 'vehicle.motel.convertible';
  car.group.userData.sharedVehicleBase = 'bing.makePlayerCar';
  car.group.userData.bodyStyle = 'convertible';
  car.group.userData.paintColor = MAROON;

  const point = (local) => {
    car.group.updateMatrixWorld(true);
    return local.clone().applyMatrix4(car.group.matrixWorld);
  };
  const tangent = new THREE.Vector3();
  const routePoint = new THREE.Vector3();

  const adapter = {
    ...car,
    cabinFill,
    park: PARK.clone(),
    arrivalStart: ARRIVAL[0].clone(),
    passengerPosition: () => point(PASSENGER),
    passengerActorPosition: () => point(PASSENGER_ACTOR),
    driverActorPosition: () => point(DRIVER_ACTOR),
    driverFacingPassengerYaw: () => {
      const from = point(DRIVER_ACTOR);
      const to = point(PASSENGER);
      return Math.atan2(to.x - from.x, to.z - from.z);
    },
    passengerFacingDriverYaw: () => {
      const from = point(PASSENGER);
      const to = point(DRIVER_ACTOR);
      return Math.atan2(to.x - from.x, to.z - from.z);
    },
    passengerArrivalYaw: (snowBlend = 0.35) => {
      const forward = adapter.forwardYaw();
      const towardSnow = adapter.passengerFacingDriverYaw();
      const arc = Math.atan2(Math.sin(towardSnow - forward), Math.cos(towardSnow - forward));
      return forward + arc * THREE.MathUtils.clamp(snowBlend, 0, 1);
    },
    passengerDoorPosition: () => point(PASSENGER_DOOR),
    passengerExitPosition: () => point(PASSENGER_EXIT),
    driverExitPosition: () => point(DRIVER_EXIT),
    moneyCasePosition: () => point(MONEY_CASE),
    gloveboxPosition: () => point(GLOVEBOX),
    trunkPosition: () => point(TRUNK),
    exteriorCameraPosition: () => point(EXTERIOR_CAMERA),
    cabinCenterPosition: () => point(CABIN_CENTER),
    /** Actor/camera yaw convention in the Motel: zero looks along world +z. */
    forwardYaw: () => {
      const at = point(new THREE.Vector3(1, 0, 0));
      return Math.atan2(at.x - car.group.position.x, at.z - car.group.position.z);
    },
    placeArrival(progress) {
      const t = THREE.MathUtils.clamp(progress, 0, 1);
      bezierPoint(t, routePoint);
      bezierTangent(t, tangent);
      car.group.position.copy(routePoint);
      // The shared car's nose is local +x.
      car.group.rotation.y = Math.atan2(-tangent.z, tangent.x);
      car.group.updateMatrixWorld(true);
      return t;
    },
  };

  adapter.placeArrival(0);
  return adapter;
}

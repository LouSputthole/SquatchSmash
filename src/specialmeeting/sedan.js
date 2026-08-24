/**
 * The car.
 *
 * Not a prop. This is a real vehicle: a `GroundVehicle` (the bicycle model the
 * heist's getaway car runs on) with a body bolted to it, four named seats that
 * anything can be strapped into, doors with ground beside them, and a boot
 * with a person's worth of room in it. It arrives under its own power, it sits
 * at the kerb with the engine running, and when everybody is in it, it leaves.
 *
 * WHAT IS REUSED, AND WHY THE INTERIOR IS NOT
 *
 * The shell, the hollowing-out and the world collider are the Bing's:
 * `makeCar` (a boxy sedan built four ways), `openCabin` (which takes the two
 * solid slabs off one car so the cabin is a space instead of a lump of paint)
 * and `makeVehicleCollider`. The physics and the fixed-step runner are core.
 *
 * The COCKPIT is built here rather than imported from `makePlayerCar`, for
 * three reasons that are all about this scene:
 *
 *   1. `makePlayerCar` seats its driver at local −Z. Traffic here drives on
 *      the right, this car arrives heading EAST, and the whole staging of the
 *      scene depends on the FRONT PASSENGER door being the one on the kerb —
 *      the one the player is standing next to. So the driver goes on +Z and
 *      everything mirrors with him.
 *   2. It needs four seats that can be addressed by name, not two seats and a
 *      bench. Three made men and a prospect is a seating plan, and the seating
 *      plan is the scene.
 *   3. It needs a boot that is a hole rather than a slab, because there is
 *      somebody in it.
 *
 * FRAME: local +X is the way the car is pointed, +Y is up, +Z is the driver's
 * side. `GroundVehicle` integrates heading 0 as +Z, so the mesh carries
 * `heading − PI/2` — the same offset the heist applies for the same reason.
 */
import * as THREE from 'three';

import { makeCar, openCabin, makeVehicleCollider } from '../bing/vehicles.js';
import { lit } from '../bing/kit.js';
import { GroundVehicle } from '../core/vehicles/ground-vehicle.js';
import { FixedStepRunner } from '../core/vehicles/fixed-step.js';
import { box, cylinder, group, mat } from '../world/build.js';

/**
 * A heavy old car, driven gently.
 *
 * Long wheelbase, soft brakes, and a top speed nothing on this block will ever
 * ask for. `maxSteer` is deliberately short of the default: this thing turns
 * like a boat, which is most of why the corner at the end of the street takes
 * as long as it does.
 */
export const SEDAN_CONFIG = Object.freeze({
  acceleration: 4.6,
  reverseAcceleration: 3,
  brakeForce: 9.5,
  drag: 0.02,
  rollingResistance: 0.8,
  maxForwardSpeed: 26,
  maxReverseSpeed: 6,
  maxSteer: 0.5,
  steerRate: 2.2,
  throttleRate: 2.4,
  brakeRate: 4,
  wheelBase: 3.1,
  lateralGrip: 5.6,
  bodyRollRate: 4,
  suspensionRate: 7,
});

/** Seats, in car-local metres, measured at the top of the cushion. */
export const SEATS = Object.freeze({
  driver: Object.freeze({ x: -0.30, y: 0.80, z: 0.44 }),
  front_passenger: Object.freeze({ x: -0.30, y: 0.80, z: -0.44 }),
  rear_left: Object.freeze({ x: -1.28, y: 0.80, z: 0.48 }),
  rear_right: Object.freeze({ x: -1.28, y: 0.80, z: -0.48 }),
});

/** In the order a Squatch would fill them, which is not the order you want. */
export const SEAT_IDS = Object.freeze(['driver', 'front_passenger', 'rear_left', 'rear_right']);

/** A seated eye, above the cushion. */
export const SEATED_EYE = 0.72;

/**
 * A seated FIGURE's origin, below the cushion.
 *
 * `Npc.sit()` folds the hips and knees but the rig's origin stays at the
 * floor, so a body placed at seat height is standing on the seat. Golf found
 * the number and it is the same rig: drop it 0.92.
 */
export const SEATED_FIGURE_DROP = 0.92;

/** The boot: where a second prospect is, and nobody mentions it. */
export const TRUNK_ANCHOR = Object.freeze({ x: -2.18, y: 0.62, z: 0 });

const DOOR_STANDOFF = 1.36;

/** Where a man stands to open a door, in car-local metres. */
export const DOORS = Object.freeze({
  driver: Object.freeze({ x: -0.30, y: 0, z: DOOR_STANDOFF }),
  front_passenger: Object.freeze({ x: -0.30, y: 0, z: -DOOR_STANDOFF }),
  rear_left: Object.freeze({ x: -1.28, y: 0, z: DOOR_STANDOFF }),
  rear_right: Object.freeze({ x: -1.28, y: 0, z: -DOOR_STANDOFF }),
  trunk: Object.freeze({ x: -3.35, y: 0, z: 0 }),
});

const _local = new THREE.Vector3();

/**
 * Build the sedan.
 *
 * Returns the car, its physics, and every anchor anything else in the scene
 * needs. It does NOT add itself to a scene — the caller does that, because the
 * caller is the one that knows whether this is the live scene or a headless
 * geometry snapshot.
 */
export function buildMeetingSedan({ colour = 0x0b0d12 } = {}) {
  const car = makeCar('lincoln', colour, { spatialId: 'specialmeeting.arrival-sedan' });
  const root = car.group;
  root.name = 'specialmeeting.sedan';
  root.userData.geometryGate = { assemblyId: 'specialmeeting.sedan' };
  root.userData.role = 'meeting-sedan';

  const shape = car.shape;
  const cabin = openCabin(car);

  /* The side and rear glass is one box and a box culls its own back faces, so
   * from inside the car there would be no windows at all. One clone, so the
   * lot's other cars keep the single-sided material they share. */
  car.glass.material = car.glass.material.clone();
  car.glass.material.side = THREE.DoubleSide;

  /* ---------------------------------------------------------------- */
  /* The boot                                                          */
  /* ---------------------------------------------------------------- */
  /* `openCabin` puts the rear of the body back as one solid panel, which is
   * right for every other car in the game and wrong for this one. The same
   * trick again, one compartment further back: take the slab out, put a well
   * in its place, and hang a lid on the front edge of the hole. */
  const trunk = buildTrunkWell(car, cabin);

  /* ---------------------------------------------------------------- */
  /* The cockpit                                                       */
  /* ---------------------------------------------------------------- */
  const interior = buildInterior(car, cabin);
  root.add(interior.group);

  /* ---------------------------------------------------------------- */
  /* Lights                                                            */
  /* ---------------------------------------------------------------- */
  const lights = buildLights(car, shape);
  root.add(lights.group);

  /* Wheels come out of `makeCar` unnamed, and they have to turn. They are the
   * only cylinders on the car at the tyre radius, which is a stable way to
   * find them without reaching into another scene's builder. */
  const wheels = root.children.filter((child) => (
    child.isMesh
    && child.geometry?.type === 'CylinderGeometry'
    && Math.abs((child.geometry.parameters?.radiusTop ?? 0) - shape.wheelR) < 1e-6
  ));
  wheels.forEach((wheel, i) => { wheel.name = `sedan.wheel.${i}`; });

  const vehicle = new GroundVehicle(SEDAN_CONFIG);
  const runner = new FixedStepRunner({ hz: 120, maxSteps: 8 });
  const occupants = new Map();

  let wheelSpin = 0;
  let trunkOpen = 0;
  let trunkTarget = 0;
  let brake = 0;
  let headlightsOn = false;

  const worldPoint = (local, out = new THREE.Vector3()) => {
    root.updateMatrixWorld(true);
    return out.set(local.x, local.y, local.z).applyMatrix4(root.matrixWorld);
  };

  const sedan = {
    car,
    group: root,
    vehicle,
    runner,
    wheels,
    trunk,
    interior,
    lights,

    /** Put the car somewhere without driving it there. */
    placeAt(x, z, heading) {
      vehicle.x = x;
      vehicle.z = z;
      vehicle.heading = heading;
      vehicle.speed = 0;
      vehicle.lateralSlip = 0;
      vehicle.setInput({ throttle: 0, steer: 0, brake: 1 });
      sedan.syncMesh();
      return sedan;
    },

    /** Copy the physics state onto the mesh. Cheap; safe to call any time. */
    syncMesh() {
      root.position.set(vehicle.x, vehicle.suspension * 0.5, vehicle.z);
      /* Procedural cars are long on local X and the physics heading is +Z.
       * Body roll is about the long axis, so it rides on X once the yaw has
       * been applied — the same composition the heist uses. */
      root.rotation.set(
        vehicle.bodyRoll * 0.8,
        vehicle.heading - Math.PI / 2,
        -vehicle.suspension * 1.4,
      );
      return sedan;
    },

    /** Headlights: two filaments, one beam pair, one real light. */
    setHeadlights(on) {
      headlightsOn = !!on;
      lights.setHeadlights(headlightsOn);
      return sedan;
    },

    get headlightsOn() { return headlightsOn; },

    /** 0 for taillights, 1 for somebody standing on the brake. */
    setBrake(value) {
      brake = Math.max(0, Math.min(1, value));
      lights.setBrake(brake);
      return sedan;
    },

    /** Drive the boot lid. 0 shut, 1 open; it takes about a second either way. */
    setTrunk(open) {
      trunkTarget = Math.max(0, Math.min(1, open));
      return sedan;
    },

    get trunkOpen() { return trunkOpen; },

    /** Dome light, for when a door is open and the car is looking at you. */
    setCabinLight(on) {
      interior.setCabinLight(!!on);
      return sedan;
    },

    /** Seat, door and boot anchors, in car-local metres. */
    seatLocal(id) { return SEATS[id] ?? null; },
    seatWorld(id, out) { return worldPoint(SEATS[id] ?? SEATS.driver, out); },
    eyeWorld(id, out) {
      const seat = SEATS[id] ?? SEATS.driver;
      _local.set(seat.x, seat.y + SEATED_EYE, seat.z);
      return worldPoint(_local, out);
    },
    doorWorld(id, out) { return worldPoint(DOORS[id] ?? DOORS.driver, out); },
    trunkWorld(out) { return worldPoint(TRUNK_ANCHOR, out); },
    /** Yaw a player should carry to face the same way the car does. */
    facingYaw() { return root.rotation.y - Math.PI / 2; },

    /**
     * Strap something into a seat.
     *
     * The occupant keeps being moved onto its seat every frame, which is what
     * the golf cart's ride-along does and what any conversation in a moving
     * car needs: dialogue range is measured against the speaker's body, so a
     * body left standing on the pavement ends the conversation the moment the
     * car pulls off. `drop` exists because a `makePerson` rig's origin is its
     * feet — pass 0 for a camera or an anchor.
     */
    occupy(id, object3D, { drop = SEATED_FIGURE_DROP, yaw = true } = {}) {
      if (!SEATS[id] || !object3D) return sedan;
      occupants.set(id, { object3D, drop, yaw });
      sedan.rideAlong();
      return sedan;
    },
    release(id) {
      occupants.delete(id);
      return sedan;
    },
    occupantIds() { return [...occupants.keys()]; },
    get seatsTaken() { return occupants.size; },

    /** Put every occupant back on its seat. Called from `update`. */
    rideAlong() {
      if (!occupants.size) return sedan;
      root.updateMatrixWorld(true);
      for (const [id, rider] of occupants) {
        const seat = SEATS[id];
        _local.set(seat.x, seat.y - rider.drop, seat.z).applyMatrix4(root.matrixWorld);
        rider.object3D.position.copy(_local);
        if (rider.yaw) rider.object3D.rotation.y = root.rotation.y;
      }
      return sedan;
    },

    /**
     * Advance the physics and everything hanging off it.
     *
     * `control` is whatever is holding the wheel this frame — the route driver
     * during the arrival, nothing at all while it sits at the kerb. It is
     * called once per FIXED step, not once per frame, so the car behaves the
     * same on a bad machine as on a good one.
     */
    update(dt, control = null) {
      runner.advance(dt, (fixed) => {
        control?.update?.(fixed);
        vehicle.step(fixed);
      });
      sedan.syncMesh();

      wheelSpin += (vehicle.speed / Math.max(0.05, shape.wheelR)) * dt;
      for (const wheel of wheels) wheel.rotation.y = wheelSpin;

      if (trunkOpen !== trunkTarget) {
        const rate = dt / 1.1;
        trunkOpen += Math.sign(trunkTarget - trunkOpen)
          * Math.min(rate, Math.abs(trunkTarget - trunkOpen));
        trunk.setOpen(trunkOpen);
      }

      lights.update(dt, vehicle);
      sedan.rideAlong();
      return sedan;
    },

    /** Axis-aligned collider for the car where it is standing right now. */
    collider() {
      return makeVehicleCollider(car, 0.1);
    },

    dispose() {
      occupants.clear();
      lights.dispose();
    },
  };

  sedan.setHeadlights(false);
  sedan.setBrake(0);
  return sedan;
}

/* -------------------------------------------------------------------- */
/* Parts                                                                 */
/* -------------------------------------------------------------------- */

/** Take the boot slab out and put a well and a lid in its place. */
function buildTrunkWell(car, cabin) {
  const root = car.group;
  const shape = car.shape;
  const halfW = shape.W / 2;
  const y0 = shape.wheelR;
  const y1 = shape.wheelR + shape.bodyH;
  const rear = -shape.L / 2;
  const front = cabin.x0;                    // the cabin's rear bulkhead
  const slab = root.getObjectByName('car.body.rear');
  if (slab) root.remove(slab);

  const paint = car.paint;
  const liner = mat({ color: 0x0c0c10, roughness: 0.98 });
  const wall = 0.09;
  const floorY = y0 + 0.14;

  const panel = (name, minX, minY, minZ, maxX, maxY, maxZ, material) => {
    const mesh = box({
      name,
      size: [maxX - minX, maxY - minY, maxZ - minZ],
      pos: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      mat: material,
    });
    root.add(mesh);
    return mesh;
  };

  // What is left of the slab: a tail panel, two rear quarters and a floor.
  panel('sedan.trunk.tail', rear, y0, -halfW, rear + wall, y1, halfW, paint);
  for (const side of [-1, 1]) {
    panel(`sedan.trunk.quarter.${side < 0 ? 'right' : 'left'}`,
      rear, y0, side > 0 ? halfW - wall : -halfW,
      front, y1, side > 0 ? halfW : -halfW + wall, paint);
  }
  panel('sedan.trunk.floor', rear + wall, y0, -halfW + wall, front, floorY, halfW - wall, liner);
  panel('sedan.trunk.bulkhead', front - wall, floorY, -halfW + wall, front, y1, halfW - wall, paint);

  /* The lid, on a pivot at the front edge of the hole. It lifts back and up,
   * which is the only direction a boot lid has ever opened, and it is the
   * whole reason the reveal reads: the lid comes up, and there is a face. */
  const hinge = group('sedan.trunk.lid');
  hinge.position.set(front, y1, 0);
  const lid = box({
    name: 'sedan.trunk.lid.panel',
    size: [front - rear, 0.07, shape.W * 0.98],
    pos: [-(front - rear) / 2, 0.02, 0],
    mat: paint,
  });
  hinge.add(lid);
  hinge.userData.geometryGate = { overlap: false };
  root.add(hinge);

  return {
    hinge,
    lid,
    /** 0 shut, 1 up. Radians, not degrees, and negative is up on this axis. */
    setOpen(amount) {
      hinge.rotation.z = -1.02 * Math.max(0, Math.min(1, amount));
    },
  };
}

/** Dash, wheel, four seats, headliner, door cards. Nothing that is not seen. */
function buildInterior(car, cabin) {
  const root = group('sedan.interior');
  const floorY = cabin.floorY;
  const stitched = mat({ color: 0x2a2620, roughness: 0.96 });
  const vinyl = mat({ color: 0x141418, roughness: 0.84 });
  const carpet = mat({ color: 0x17130f, roughness: 0.99 });
  const dashPlastic = mat({ color: 0x101115, roughness: 0.78 });
  const chrome = mat({ color: 0xb9c0cc, roughness: 0.22, metalness: 0.95 });
  const amber = lit(0xffb648, 1.2);
  const dome = lit(0xffd2a0, 0.05);

  root.add(box({ name: 'sedan.dash', size: [0.46, 0.30, 1.76], pos: [0.70, 1.24, 0], mat: dashPlastic }));
  root.add(box({ name: 'sedan.cowl', size: [0.16, 0.05, 1.78], pos: [0.96, 1.40, 0], mat: dashPlastic }));
  root.add(box({ name: 'sedan.gauge-hood', size: [0.12, 0.24, 0.52], pos: [0.46, 1.48, 0.44], mat: dashPlastic }));
  root.add(box({ name: 'sedan.gauges', size: [0.03, 0.16, 0.42], pos: [0.40, 1.47, 0.44], mat: amber, cast: false }));
  root.add(box({ name: 'sedan.radio', size: [0.035, 0.10, 0.26], pos: [0.46, 1.27, 0], mat: amber, cast: false }));

  /* Seats. The driver is on +Z because this car drives on the right, and the
   * seat the prospect is put in is the one on the kerb. */
  for (const id of SEAT_IDS) {
    const seat = SEATS[id];
    const rear = id.startsWith('rear');
    const seatGroup = group(`sedan.seat.${id}`);
    seatGroup.add(box({
      name: 'seat.cushion', size: [0.62, 0.14, 0.60],
      pos: [seat.x, seat.y - 0.07, seat.z], mat: stitched,
    }));
    seatGroup.add(box({
      name: 'seat.back', size: [0.14, 0.64, 0.58],
      pos: [seat.x - (rear ? 0.32 : 0.38), seat.y + 0.32, seat.z], mat: stitched,
    }));
    seatGroup.add(box({
      name: 'seat.headrest', size: [0.13, 0.20, 0.30],
      pos: [seat.x - (rear ? 0.34 : 0.40), seat.y + 0.74, seat.z], mat: vinyl,
    }));
    root.add(seatGroup);
  }

  /* Steering wheel: rim, three spokes, boss and column, raked the way a column
   * rakes. Built in its own frame in YXZ order — an XYZ Euler puts the rake
   * term in the parent frame, where it spins the rim in its own plane and
   * leaves the wheel standing bolt upright. */
  const wheel = group('sedan.steering-wheel');
  wheel.position.set(0.28, 1.30, SEATS.driver.z);
  wheel.rotation.order = 'YXZ';
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.42;
  const rim = mat({ color: 0x101116, roughness: 0.78 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.023, 8, 24), rim));
  for (const angle of [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]) {
    const spoke = box({
      name: 'sedan.steering-spoke', size: [0.16, 0.016, 0.024],
      pos: [Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, 0], mat: rim,
    });
    spoke.rotation.z = angle;
    wheel.add(spoke);
  }
  wheel.add(cylinder({ name: 'sedan.steering-boss', r: 0.05, h: 0.03, pos: [0, 0, -0.014], rotX: Math.PI / 2, mat: dashPlastic }));
  wheel.add(cylinder({ name: 'sedan.steering-column', r: 0.033, h: 0.36, pos: [0, 0, 0.19], rotX: Math.PI / 2, mat: dashPlastic }));
  root.add(wheel);

  // Door cards, an armrest each, and a capping rail over the join to the sill.
  const trim = mat({ color: 0x211b16, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const z = side * 0.78;
    const name = side > 0 ? 'driver' : 'passenger';
    root.add(box({ name: `sedan.door-card.${name}`, size: [2.30, 0.56, 0.055], pos: [-0.42, 1.10, z], mat: trim }));
    root.add(box({ name: `sedan.door-cap.${name}`, size: [2.30, 0.05, 0.075], pos: [-0.42, 1.40, z], mat: trim }));
    root.add(box({ name: `sedan.armrest.${name}`, size: [0.56, 0.08, 0.09], pos: [-0.32, 1.21, side * 0.72], mat: vinyl }));
    root.add(box({ name: `sedan.door-handle.${name}`, size: [0.22, 0.035, 0.035], pos: [0.06, 1.29, side * 0.74], mat: chrome }));
  }

  // Floor: a tunnel down the middle and a mat under each pair of feet.
  root.add(box({ name: 'sedan.tunnel', size: [2.4, 0.16, 0.30], pos: [-0.45, floorY + 0.08, 0], mat: carpet }));
  for (const z of [-0.46, 0.46]) {
    root.add(box({ name: 'sedan.floor-mat.front', size: [0.84, 0.03, 0.56], pos: [0.26, floorY + 0.02, z], mat: carpet, cast: false }));
    root.add(box({ name: 'sedan.floor-mat.rear', size: [0.62, 0.03, 0.56], pos: [-1.06, floorY + 0.02, z], mat: carpet, cast: false }));
  }
  root.add(box({ name: 'sedan.pedals', size: [0.10, 0.16, 0.24], pos: [0.60, floorY + 0.12, 0.50], mat: dashPlastic, rotZ: -0.18 }));

  // Headliner, mirror, and the dome lamp that goes on when a door opens.
  root.add(box({
    name: 'sedan.headliner', size: [2.40, 0.06, 1.72],
    pos: [-0.42, cabin.glassY1 - 0.18, 0], mat: mat({ color: 0xc9c1b0, roughness: 0.97 }),
  }));
  root.add(box({ name: 'sedan.mirror', size: [0.05, 0.12, 0.36], pos: [0.62, cabin.glassY1 - 0.31, 0], mat: chrome }));
  const domeLamp = box({
    name: 'sedan.dome-lamp', size: [0.18, 0.03, 0.30],
    pos: [-0.42, cabin.glassY1 - 0.23, 0], mat: dome, cast: false,
  });
  root.add(domeLamp);

  /* A windscreen, because there was a hole in the front of the car. Faint: it
   * is read from the frame round it and the amber of the dash caught in it. */
  const screen = box({
    name: 'sedan.windscreen',
    size: [0.024, 0.88, 1.74],
    pos: [0.94, cabin.glassY0 + 0.06, 0],
    mat: mat({
      color: 0x8fa8bc, roughness: 0.06, metalness: 0.1,
      transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    }),
    cast: false,
  });
  screen.rotation.z = 0.20;
  screen.userData.geometryGate = { overlap: false };
  root.add(screen);

  /* ONE CAR, ONE ASSEMBLY.
   *
   * The interior used to carry an assembly id of its own, which made the gate
   * treat the dash and the shell as two objects that happen to occupy the same
   * cubic metre — sixteen interpenetration findings per kerb state for a
   * steering wheel being inside a car. Sharing the body's id says the true
   * thing instead: this is the same object as the panels around it.
   *
   * It also retires the `checkSupport: false` that used to sit here. That was
   * only ever needed because an interior floating on its own has nothing under
   * it; joined to the shell, the component the gate weighs is the whole car,
   * and the whole car is on its wheels on the road. */
  root.userData.geometryGate = { assemblyId: 'specialmeeting.sedan' };

  return {
    group: root,
    domeLamp,
    setCabinLight(on) {
      domeLamp.material.emissiveIntensity = on ? 1.1 : 0.05;
    },
  };
}

/**
 * Headlights, tail lights and one real beam.
 *
 * Two headlamps, two beam cones and ONE SpotLight between them. Two spots is
 * two shadow-free forward passes over every wall on the block for a difference
 * nobody can see at night through fog; the pair of filaments and the pair of
 * cones is what sells "two headlights", and the single light is what actually
 * puts a moving pool on the road.
 */
function buildLights(car, shape) {
  const root = group('sedan.lights');
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2cf,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const beams = [];
  for (const side of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 13, 12, 1, true), beamMat);
    cone.name = `sedan.headlight.beam.${side < 0 ? 'right' : 'left'}`;
    cone.rotation.z = -Math.PI / 2;
    cone.position.set(shape.L / 2 + 6.2, shape.wheelR + 0.42, side * (shape.W / 2 - 0.38));
    cone.castShadow = false;
    cone.receiveShadow = false;
    cone.userData.geometryGate = { overlap: false, checkSupport: false };
    root.add(cone);
    beams.push(cone);
  }

  const spot = new THREE.SpotLight(0xfff0cc, 0, 34, 0.44, 0.55, 1.4);
  spot.name = 'sedan.headlight.spot';
  spot.position.set(shape.L / 2 - 0.1, shape.wheelR + 0.5, 0);
  spot.castShadow = false;
  const target = new THREE.Object3D();
  target.name = 'sedan.headlight.target';
  target.position.set(shape.L / 2 + 18, -0.4, 0);
  spot.target = target;
  root.add(spot, target);

  let on = false;
  let flicker = 0;

  return {
    group: root,
    spot,
    beams,
    setHeadlights(value) {
      on = value;
      for (const head of car.heads) head.material.emissiveIntensity = value ? 2.6 : 0.12;
      spot.intensity = value ? 26 : 0;
      beamMat.opacity = value ? 0.055 : 0;
    },
    setBrake(value) {
      /* Tail lights are always on with the headlights; the brake is the same
       * bulb harder. A car that only lights its tails when it stops reads as a
       * car with its lights off, which is not what is parked outside. */
      const base = on ? 0.75 : 0.12;
      for (const tail of car.tails) tail.material.emissiveIntensity = base + value * 2.4;
    },
    update(dt) {
      if (!on) return;
      /* An old car's lights breathe with the alternator. Two per cent, on a
       * slow wander — enough that the beam is not a decal. */
      flicker += dt * 2.3;
      beamMat.opacity = 0.055 + Math.sin(flicker) * 0.004;
    },
    dispose() {
      beamMat.dispose();
      for (const beam of beams) beam.geometry.dispose();
    },
  };
}

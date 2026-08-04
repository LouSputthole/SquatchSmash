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
  const bodyBox = box({ name: 'car.body', size: [s.L, s.bodyH, s.W], pos: [0, bodyY, 0], mat: paint });
  g.add(bodyBox);
  const cabinY = s.wheelR + s.bodyH + s.cabinH / 2;
  const cabinBox = box({ name: 'car.cabin', size: [s.cabinL, s.cabinH, s.W * 0.94], pos: [s.cabinOff, cabinY, 0], mat: paint });
  g.add(cabinBox);
  const glassBox = box({ name: 'car.glass', size: [s.cabinL * 0.93, s.cabinH * 0.56, s.W * 0.96], pos: [s.cabinOff, cabinY + s.cabinH * 0.12, 0], mat: glass });
  g.add(glassBox);
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
    /* The three shell slabs, by name. Fifteen cars in the lot are only ever
     * seen from outside and want exactly this: one solid body, one solid
     * greenhouse, one pane. The car you sit IN has to take two of them apart
     * (see openCabin), so it needs to be able to find them. */
    body: bodyBox, cabin: cabinBox, glass: glassBox,
    shape: s, paint, glassMat: glass,
    length: s.L, width: s.W, height: s.wheelR + s.bodyH + s.cabinH,
    collider: collider([-s.L / 2, 0, -s.W / 2], [s.L / 2, 1.6, s.W / 2]),
  };
}

/**
 * Take the lid off one car, so the cabin is a space instead of a solid.
 *
 * The owner's note on the opening shot was "need to fix the car interior
 * (looks like shit)", and the reason is structural rather than a question of
 * detail: the cockpit in `makePlayerCar` is careful, complete work — dash,
 * two front seats, a rear bench, gauges, a radio stack, door cards, a console
 * and a shifter, pedals — and almost all of it is BURIED. The sedan's body
 * slab is one solid box from y 0.36 to y 1.36, the driver's eye sits at 1.55,
 * and everything in that cabin below 1.36 is inside the paint. From behind
 * the wheel you were looking across a flat painted deck at a steering rim
 * sunk into it to the shoulders, three headrest nubs and a mirror, with no
 * floor, no windscreen and no pillars — you could see the wet lot straight
 * through the front of the car, because a box viewed from inside culls away.
 *
 * So this does not add detail. It removes the two slabs that were hiding the
 * detail already there, and puts back the parts a box was standing in for:
 * a floor pan, sills and a bulkhead fore and aft, the door tops, four
 * pillars, a headliner and a windscreen. The silhouette from outside is the
 * same car — every panel lands on the faces the two boxes occupied.
 *
 * Player car only. The lot's fifteen are untouched and stay one box each.
 */
export function openCabin(car, { from, to } = {}) {
  const s = car.shape;
  const paint = car.paint;
  const g = car.group;

  const bodyY0 = s.wheelR;
  const bodyY1 = s.wheelR + s.bodyH;                 // 1.36 on the sedan
  const cabinY1 = bodyY1 + s.cabinH;                 // 2.26
  const halfW = s.W / 2;
  const cabinHalfW = (s.W * 0.94) / 2;
  // The opening, along the car's length. Defaults to the greenhouse footprint.
  const x0 = from ?? (s.cabinOff - s.cabinL / 2);
  const x1 = to ?? (s.cabinOff + s.cabinL / 2);

  g.remove(car.body, car.cabin);

  const panel = (name, minX, minY, minZ, maxX, maxY, maxZ, material = paint) => {
    const m = box({
      name,
      size: [maxX - minX, maxY - minY, maxZ - minZ],
      pos: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      mat: material,
    });
    g.add(m);
    return m;
  };

  const SILL = 0.145;     // outer skin thickness down the sides
  const FLOOR = 0.09;     // the pan you put your feet on
  const BULK = 0.12;      // front and rear bulkheads

  /* ---- what is left of the body slab ----
   * Everything fore of the dash and aft of the rear bench stays solid; it is
   * engine and boot and nobody is ever inside it. */
  panel('car.body.front', x1, bodyY0, -halfW, s.L / 2, bodyY1, halfW);
  panel('car.body.rear', -s.L / 2, bodyY0, -halfW, x0, bodyY1, halfW);
  // Sides, as skin rather than as fill.
  for (const sz of [-1, 1]) {
    panel(`car.body.sill.${sz < 0 ? 'left' : 'right'}`,
      x0, bodyY0, sz > 0 ? halfW - SILL : -halfW,
      x1, bodyY1, sz > 0 ? halfW : -halfW + SILL);
  }
  // The floor, and the two bulkheads that close the cabin off front and back.
  panel('car.floor', x0, bodyY0, -halfW + SILL, x1, bodyY0 + FLOOR, halfW - SILL,
    mat({ color: 0x14141a, roughness: 0.95 }));
  panel('car.bulkhead.front', x1 - BULK, bodyY0 + FLOOR, -halfW + SILL, x1, bodyY1, halfW - SILL);
  panel('car.bulkhead.rear', x0, bodyY0 + FLOOR, -halfW + SILL, x0 + BULK, bodyY1, halfW - SILL);

  /* ---- what is left of the greenhouse ----
   * A roof, four pillars and the band of body colour under the side glass.
   * The glass box that was always there is untouched and still fills the gap
   * between them from outside. */
  const glassY0 = bodyY1 + s.cabinH * 0.12 - (s.cabinH * 0.56) / 2;   // 1.666
  const glassY1 = bodyY1 + s.cabinH * 0.12 + (s.cabinH * 0.56) / 2;   // 2.170
  const cx0 = s.cabinOff - s.cabinL / 2;
  const cx1 = s.cabinOff + s.cabinL / 2;
  panel('car.roof', cx0, glassY1, -cabinHalfW, cx1, cabinY1, cabinHalfW);
  for (const sz of [-1, 1]) {
    const zOut = sz > 0 ? cabinHalfW : -cabinHalfW;
    const zIn = sz > 0 ? cabinHalfW - 0.07 : -cabinHalfW + 0.07;
    const side = sz < 0 ? 'left' : 'right';
    // Waist: the strip of paint between the door top and the side glass.
    panel(`car.waist.${side}`, cx0, bodyY1, Math.min(zIn, zOut), cx1, glassY0, Math.max(zIn, zOut));
    // A and C pillars, at the ends of the same run.
    panel(`car.pillar.a.${side}`, cx1 - 0.09, glassY0, Math.min(zIn, zOut), cx1, glassY1, Math.max(zIn, zOut));
    panel(`car.pillar.c.${side}`, cx0, glassY0, Math.min(zIn, zOut), cx0 + 0.09, glassY1, Math.max(zIn, zOut));
  }
  /* No panel across the front or the back of the greenhouse: those two gaps
   * are the windscreen and the rear window, and the roof slab above them is
   * already the header. The original single cabin box filled both, which is
   * why there was nothing in front of the driver but open air. */

  return {
    x0, x1, cx0, cx1, cabinHalfW,
    floorY: bodyY0 + FLOOR,
    waistY: bodyY1,
    glassY0,
    glassY1,
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

  /* Open the shell BEFORE anything is put inside it. Until this ran, the
   * whole cockpit below y 1.36 was sealed inside the body slab and the
   * driver's 1.55m eye looked out over a painted lid. */
  const cabin = openCabin(car);
  /* The side and rear glass is one box, and a box seen from inside culls
   * every face. Double-sided on this one car so the windows read as windows
   * from the driver's seat as well as from the lot. */
  car.glass.material = car.glass.material.clone();
  car.glass.material.side = THREE.DoubleSide;

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

  /* ---------------- steering wheel, column and binnacle ----------------
   *
   * Owner's playtest note, 2026-08-04: *"Steering wheel in the car when you
   * arrive at the bing is pushed all forward."* It was, in three separate
   * ways, and the same class of mistake as the one just fixed in the Silver
   * Case's cabin.
   *
   * 1. It had **no rake**. A `TorusGeometry` is built in the XY plane, so its
   *    axis is +Z; `rotation.y = PI/2` sends that axis onto this cabin's +X,
   *    which is straight ahead — a rim standing bolt upright. The
   *    `rotation.x = 0.32` written underneath it was meant to be the rake and
   *    did nothing at all: the default Euler order is XYZ, so the x term is
   *    applied in the PARENT frame, and after the y turn the parent's X *is*
   *    the wheel's own axis. It span the rim in its own plane and left the
   *    rake at zero. Fixed by taking the rotation in `YXZ` order, where the x
   *    term lands in the frame the y term produced and rakes the wheel the
   *    way a column does.
   * 2. There was **no wheel**, only a rim. No hub, no spokes, no horn ring —
   *    a bare 36 cm hoop hanging in the air in front of the dashboard.
   * 3. It was **against the dash**. The rim sat at x 0.43 with the dashboard's
   *    front face at 0.48, and the column ran forward from underneath it into
   *    the dash rather than back out of the boss towards the driver, so
   *    nothing reached the seat.
   *
   * The cabin's frame: +X is straight ahead, +Y is up, and the driver sits at
   * z −0.43 with his eye at (−0.18, 1.55). A sedan wheel rakes about 24° off
   * vertical with the TOP edge further forward, which here is the wheel's axis
   * pointing forward and down. */
  const WHEEL_RAKE = 0.42;
  const wheelRim = mat({ color: 0x111216, roughness: 0.76 });
  const wheel = group('cockpit.steering-wheel');
  wheel.position.set(0.30, 1.28, -0.43);
  wheel.rotation.order = 'YXZ';
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = WHEEL_RAKE;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 8, 26), wheelRim));
  // Three spokes at 12, 4 and 8 o'clock, in the wheel's OWN plane, so they
  // carry the rake with the rim instead of being placed by hand beside it.
  for (const a of [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]) {
    const spoke = box({
      name: 'cockpit.steering-spoke', size: [0.16, 0.016, 0.024],
      pos: [Math.cos(a) * 0.088, Math.sin(a) * 0.088, 0], mat: wheelRim,
    });
    spoke.rotation.z = a;
    wheel.add(spoke);
  }
  /* Boss and horn ring, dished towards the driver — which in this rig is
   * NEGATIVE local z. The rig's local +Z is the wheel's axis and it points
   * forward and down into the dashboard (that is what the rake IS), so the
   * face of the wheel is on the −z side and everything the driver's thumbs
   * touch belongs there. */
  const boss = cylinderMesh(0.052, 0.028, dashPlastic, 16);
  boss.rotation.x = Math.PI / 2;
  boss.position.set(0, 0, -0.012);
  wheel.add(boss);
  const hornRing = cylinderMesh(0.03, 0.012, chromeTrim, 16);
  hornRing.rotation.x = Math.PI / 2;
  hornRing.position.set(0, 0, -0.03);
  wheel.add(hornRing);
  /* And the column the other way, out of the BACK of the boss along +z on the
   * same rake, so the two are one assembly rather than a hoop and a bar that
   * happen to be near each other. Its far end lands inside the dash slab at
   * roughly (0.61, 1.14), which is 13 cm inside the front face. */
  const steeringColumn = cylinderMesh(0.033, 0.34, dashPlastic);
  steeringColumn.name = 'cockpit.steering-column';
  steeringColumn.rotation.x = Math.PI / 2;
  steeringColumn.position.set(0, 0, 0.18);
  wheel.add(steeringColumn);
  // Indicator and wiper stalks, either side of the column, in the same frame.
  for (const [sx, len, tilt] of [[-0.095, 0.15, 1.25], [0.095, 0.12, -1.3]]) {
    const stalk = cylinderMesh(0.008, len, chromeTrim, 8);
    stalk.rotation.z = tilt;
    stalk.position.set(sx, -0.055, -0.03);
    wheel.add(stalk);
  }
  interior.add(wheel);
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

  /* Door cards, centre console, shifter, pedals and the little things that
   * sell a cabin. The cards have come 8cm inboard: they used to sit at
   * z ±0.86 with their outer face 2mm inside the body skin, which nothing
   * could see through and which now z-fights the sill the open shell leaves
   * behind. At ±0.78 they stand clearly proud of it, the way trim does. */
  const DOOR_Z = 0.78;
  for (const side of [-1, 1]) {
    interior.add(box({
      name: side < 0 ? 'cockpit.door.driver' : 'cockpit.door.passenger',
      size: [1.80, 0.55, 0.055], pos: [-0.25, 1.08, side * DOOR_Z], mat: trim,
    }));
    interior.add(box({ name: 'cockpit.door-handle', size: [0.24, 0.035, 0.035], pos: [0.05, 1.28, side * (DOOR_Z - 0.038)], mat: chromeTrim }));
    /* An armrest and a window winder, because a door card with nothing on it
     * is a wall. Both sit on the cabin side of the card. */
    interior.add(box({
      name: 'cockpit.armrest', size: [0.52, 0.07, 0.09],
      pos: [-0.28, 1.19, side * (DOOR_Z - 0.06)], mat: vinyl,
    }));
    interior.add(box({
      name: 'cockpit.window-winder', size: [0.05, 0.05, 0.05],
      pos: [0.10, 1.12, side * (DOOR_Z - 0.05)], mat: chromeTrim,
    }));
    /* The card only reaches y 1.355; the shell's waist starts at 1.36. A
     * capping rail across the join turns two panels into one door. */
    interior.add(box({
      name: 'cockpit.door-cap', size: [1.80, 0.05, 0.075],
      pos: [-0.25, 1.375, side * DOOR_Z], mat: trim,
    }));
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

  /* ---- the windscreen ----
   *
   * There was not one. The scene's own description of this car is "a
   * windscreen with rain on it", and the only glass on the model was the
   * single-sided greenhouse box, whose front face sits above the driver's
   * eyeline and culls away from inside anyway. Straight ahead there was a
   * hole in the front of the car.
   *
   * One raked pane from the top of the cowl to the roof header, filling the
   * aperture the open shell leaves between the A-pillars. Faint, because you
   * have to drive through it — the read comes from the frame round it, the
   * wipers lying across the bottom and the amber of the dash caught in it. */
  const screenGlass = mat({
    color: 0x8fa8bc,
    roughness: 0.06,
    metalness: 0.1,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
  });
  const windscreen = box({
    name: 'cockpit.windscreen',
    size: [0.024, 0.86, 1.70],
    pos: [0.955, 1.77, 0],
    mat: screenGlass,
    cast: false,
  });
  windscreen.rotation.z = 0.20;      // the top leans back over the cabin
  interior.add(windscreen);
  // Wipers, parked at the bottom of the pane where wipers park.
  for (const wz of [-0.42, 0.42]) {
    const blade = box({
      name: 'cockpit.wiper', size: [0.03, 0.022, 0.62],
      pos: [1.028, 1.375, wz], mat: mat({ color: 0x121216, roughness: 0.9 }), cast: false,
    });
    blade.rotation.x = 0.14;
    interior.add(blade);
  }
  // The cowl: the strip of body between the dash top and the glass.
  interior.add(box({
    name: 'cockpit.cowl', size: [0.16, 0.05, 1.74], pos: [0.99, 1.345, 0], mat: dashPlastic,
  }));

  /* ---- the roof, from underneath ----
   * The open shell's roof slab sits at 2.17. A headliner at 2.00 gives the
   * cabin a ceiling at the height a car has one, and the dome lamp, the sun
   * strip and the mirror all hang off it instead of floating under a slab
   * twenty centimetres above them. */
  const headliner = box({
    name: 'cockpit.headliner', size: [2.32, 0.06, 1.68], pos: [-0.25, 2.03, 0],
    mat: mat({ color: 0xcfc7b6, roughness: 0.96 }),
  });
  interior.add(headliner);

  const rearView = box({ name: 'cockpit.rear-view-mirror', size: [0.055, 0.12, 0.34], pos: [0.65, 1.88, 0], mat: chromeTrim });
  interior.add(rearView);
  // And the stalk it hangs from, up to the headliner.
  interior.add(box({
    name: 'cockpit.mirror-stalk', size: [0.03, 0.11, 0.05], pos: [0.65, 1.99, 0], mat: chromeTrim,
  }));
  const sunStrip = box({ name: 'cockpit.windscreen-header', size: [0.10, 0.09, 1.70], pos: [0.86, 1.98, 0], mat: vinyl });
  interior.add(sunStrip);
  // Two sun visors, folded up against the header.
  for (const vz of [-0.42, 0.42]) {
    interior.add(box({
      name: 'cockpit.sun-visor', size: [0.19, 0.02, 0.58], pos: [0.74, 1.985, vz], mat: vinyl,
    }));
  }
  const domeLamp = box({ name: 'cockpit.dome-lamp', size: [0.16, 0.025, 0.28], pos: [-0.25, 1.99, 0], mat: lit(0xffd2a0, 0.75) });
  interior.add(domeLamp);
  const domeLight = new THREE.PointLight(0xffd2a0, 0.62, 3.1, 2);
  domeLight.name = 'cockpit.dome-light';
  domeLight.position.set(-0.18, 1.82, 0);
  interior.add(domeLight);

  /* ---- the floor, dressed ----
   * The pan `openCabin` puts back is bare metal. A mat under each footwell
   * and a transmission tunnel down the middle is what stops it reading as
   * the bottom of a box. */
  const carpet = mat({ color: 0x1b1613, roughness: 0.99 });
  interior.add(box({
    name: 'cockpit.tunnel', size: [2.20, 0.16, 0.30], pos: [-0.30, cabin.floorY + 0.08, 0], mat: carpet,
  }));
  for (const mz of [-0.46, 0.46]) {
    interior.add(box({
      name: 'cockpit.floor-mat', size: [0.86, 0.03, 0.56], pos: [0.28, cabin.floorY + 0.02, mz], mat: carpet, cast: false,
    }));
    interior.add(box({
      name: 'cockpit.floor-mat.rear', size: [0.66, 0.03, 0.56], pos: [-1.02, cabin.floorY + 0.02, mz], mat: carpet, cast: false,
    }));
  }

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

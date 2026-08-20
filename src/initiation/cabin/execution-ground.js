/**
 * INITIATION NIGHT — the mud, and what is pointed at it.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS PLACE IS FOR
 *
 * It is not a ceremonial site. There is no altar, no fire pit laid out in a
 * ring, no banner: it is the flat bit at the end of a track where vehicles can
 * turn round, and tonight it has eleven men standing on it in the dark. The
 * only reason anything is visible at all is that two of them left their
 * headlights on, which is also the only reason anyone can watch what happens.
 *
 * Everything in here serves ONE staging requirement, and it comes from the
 * owner: each prospect is put on their knees and shot in the back of the head,
 * one at a time, WHERE THE PLAYER CAN SEE IT. So:
 *
 *   - the beams come from BEHIND the prospect line, so the men in the line are
 *     shapes and the ground in front of them is white;
 *   - they cross at the kneel marks, so a kneeling figure is lit from both
 *     sides and picked out against dark trees;
 *   - the mud is wide enough that an executioner can stand a metre behind a
 *     kneeling man without either of them being inside a car, a tree, a
 *     barrel or each other. site.js proves that with numbers; this file just
 *     has to not put anything in the way, so nothing is built inside the
 *     working rectangle at all.
 *
 * The boot car is parked with its back to all of it. She came out of that.
 */

import * as THREE from 'three';
import { makeCar } from '../../bing/vehicles.js';

import {
  assembly, bakedTexture, between, boxPart, cylinderPart, effect, glowMaterial,
  namedGroup, part, rng, speckle,
} from './kit.js';
import { BURN_BARREL, CLEARING_CARS, MUD, carYaw } from './site.js';

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

function mudTexture() {
  return bakedTexture(512, (context, size) => {
    speckle(context, size, '#241c14', ['#191309', '#2e2418', '#120d06', '#38291a', '#0d0a05'], 3200,
      { alpha: [0.3, 0.85], grain: [3, 14] });
  }, { repeat: 5 });
}

/**
 * The pan of churned ground.
 *
 * A flat sheet 2 cm off the forest floor: high enough not to z-fight with it,
 * low enough that the gate counts it as resting on it rather than hovering
 * over it. Everything else on this ground — ruts, standing water, the trodden
 * patch under the line — is thinner still and stacked in the same two
 * centimetres, which is deliberate: nothing built from sheets this thin can
 * ever produce an interpenetration finding against anything, because the
 * gate's threshold is 3 cm on the SHALLOWEST axis and none of them is that
 * deep.
 */
function buildMud(random) {
  const group = assembly('clearing.mud', 'initiation.mud');
  const width = MUD.maxX - MUD.minX;
  const depth = MUD.maxZ - MUD.minZ;
  const pan = part(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ map: mudTexture() }),
    (MUD.minX + MUD.maxX) / 2, MUD.y, (MUD.minZ + MUD.maxZ) / 2, 'clearing.mud.pan',
  );
  pan.rotation.x = -Math.PI / 2;
  pan.receiveShadow = true;
  group.add(pan);

  /* Tyre arcs: everything that came in here turned round on this. */
  for (let i = 0; i < 7; i++) {
    const radius = between(random, 3.4, 8.2);
    const centreX = between(random, -5.5, 5.5);
    const centreZ = between(random, -9.0, -3.2);
    const arc = part(
      new THREE.RingGeometry(radius, radius + between(random, 0.22, 0.4),
        22, 1, between(random, 0, 6.28), between(random, 0.7, 2.1)),
      new THREE.MeshLambertMaterial({ color: 0x140f08, transparent: true, opacity: 0.85 }),
      centreX, MUD.y + 0.004, centreZ, 'clearing.mud.tyre.arc',
    );
    arc.rotation.x = -Math.PI / 2;
    group.add(arc);
  }

  /* Standing water. It has rained, and nobody has drained a forest. */
  for (let i = 0; i < 9; i++) {
    const puddle = part(
      new THREE.CircleGeometry(between(random, 0.45, 1.35), 14),
      new THREE.MeshLambertMaterial({ color: 0x0e1418 }),
      between(random, MUD.minX + 1.2, MUD.maxX - 1.2), MUD.y + 0.008,
      between(random, MUD.minZ + 0.8, MUD.maxZ - 0.8), 'clearing.mud.puddle',
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(1, between(random, 0.6, 1.4), 1);
    group.add(puddle);
  }

  /* The strip in front of the line, walked flat by men who arrived early. */
  const trodden = part(
    new THREE.PlaneGeometry(13.5, 2.4),
    new THREE.MeshLambertMaterial({ color: 0x1b150d }),
    -0.5, MUD.y + 0.006, -8.2, 'clearing.mud.trodden',
  );
  trodden.rotation.x = -Math.PI / 2;
  group.add(trodden);

  return group;
}

/* ------------------------------------------------------------------ */
/* The barrel                                                          */
/* ------------------------------------------------------------------ */

/**
 * A drum with a fire in it.
 *
 * The one warm light on the whole clearing, and the reason it is a rusted
 * barrel rather than a bonfire is the difference between backwoods and pagan.
 * Men who have been standing in the cold for an hour burn a pallet in a drum.
 * They do not lay a ceremonial fire and then shoot four people next to it.
 */
function buildBurnBarrel() {
  const group = assembly('clearing.barrel', 'initiation.barrel');
  const body = cylinderPart('barrel.body', BURN_BARREL.radius, BURN_BARREL.radius * 0.96,
    BURN_BARREL.height, 12, 0x4a3a28, [0, BURN_BARREL.height / 2, 0]);
  body.castShadow = true;
  group.add(body);
  for (const ring of [0.28, 0.62]) {
    group.add(cylinderPart('barrel.rib', BURN_BARREL.radius + 0.02, BURN_BARREL.radius + 0.02,
      0.05, 12, 0x35291b, [0, BURN_BARREL.height * ring, 0]));
  }
  const flames = [];
  for (const [radius, height, lift, colour, boost] of [
    [0.3, 1.05, 0.95, 0xff4a12, 2.2],
    [0.2, 0.78, 0.88, 0xffa02a, 2.6],
    [0.11, 0.5, 0.82, 0xffe07a, 3.0],
  ]) {
    const flame = effect(new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 6),
      glowMaterial(colour, boost),
    ));
    flame.name = 'barrel.fire.flame';
    flame.position.y = BURN_BARREL.height + lift * 0.42;
    flames.push(flame);
    group.add(flame);
  }
  const light = new THREE.PointLight(0xff8c3a, 46, 22, 2);
  light.position.set(0, BURN_BARREL.height + 0.5, 0);
  group.add(light);
  group.position.set(BURN_BARREL.x, 0, BURN_BARREL.z);
  return { group, flames, light };
}

/* ------------------------------------------------------------------ */
/* Cars                                                                */
/* ------------------------------------------------------------------ */

/**
 * One parked car, and its light.
 *
 * ONE SpotLight per car, from the midpoint of its two headlamps, with two
 * beam cones drawn at the actual lamps. A light each would double the shadow
 * cost of the scene's only real light source for a difference nobody can see
 * at night through fog; the cones are what sell "two beams", and they are
 * effects, so the geometry gate is right to ignore them.
 *
 * The lamps themselves get a fresh emissive material rather than a brighter
 * shared one — `lit()` hands back a new material per call today, but a scene
 * that turns another scene's headlights on because they happened to share a
 * cache entry is not a bug anybody finds quickly.
 */
function buildCar(spec) {
  const car = makeCar(spec.kind, spec.colour, { dented: spec.dented ?? false });
  const yaw = carYaw(spec);
  car.group.position.set(spec.x, 0, spec.z);
  car.group.rotation.y = yaw;
  car.group.name = `parked.${spec.id}`;
  /**
   * ONE owner for the whole car, declared rather than inferred.
   *
   * `makeCar` builds a body slab, a greenhouse slab and a pane of glass that
   * all occupy the same space on purpose, and the gate only forgives that
   * between parts of one object. Left to infer, it takes the nearest NAMED
   * ancestor — which for the boot lid was the hinge group, so the lid came out
   * as a separate object with a car inside it.
   */
  car.group.userData.geometryGate = { assemblyId: `initiation.car.${spec.id}` };

  const lights = [];
  if (spec.lights) {
    for (const head of car.heads) {
      head.material = glowMaterial(0xfff2d0, 1.9);
      const beam = effect(new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 16, 10, 1, true),
        glowMaterial(0xffe9c0, 0.14, {
          transparent: true, opacity: 0.09, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      ));
      beam.name = 'headlight.beam.fog.volume';
      /* The cone is built along +y, so it is laid down the car's own +x. */
      beam.rotation.z = -Math.PI / 2;
      beam.position.set(head.position.x + 8, head.position.y, head.position.z);
      car.group.add(beam);
    }
    const spot = new THREE.SpotLight(0xfff0d2, 140, 34, 0.44, 0.55, 1.4);
    spot.position.set(car.shape.L / 2, car.shape.wheelR + car.shape.bodyH * 0.65, 0);
    spot.target.position.set(car.shape.L / 2 + 20, -0.4, 0);
    car.group.add(spot);
    car.group.add(spot.target);
    lights.push(spot);
  }

  /**
   * The boot, standing open.
   *
   * The lid is hinged at the back of the roofline and swung up, and it is
   * added INTO the car's own group so the gate reads it as part of the car
   * rather than as a slab of steel hovering over one.
   */
  if (spec.bootOpen) {
    const shape = car.shape;
    const lidLength = 1.15;
    const hinge = new THREE.Group();
    hinge.position.set(-shape.cabinL / 2 + shape.cabinOff - 0.1, shape.wheelR + shape.bodyH, 0);
    hinge.rotation.z = -1.15;
    const lid = boxPart('car.boot.lid', [lidLength, 0.07, shape.W * 0.86],
      [-lidLength / 2, 0, 0], 0x14161a);
    hinge.add(lid);
    car.group.add(hinge);
  }

  /**
   * Colliders, as the circles this scene's movement actually uses.
   *
   * Three of them down the car's length rather than one big one: a single
   * circle round a 5.4 m Lincoln is a 2.7 m no-go bubble that stops the player
   * walking past its wing, and the walk past these cars is the walk in.
   */
  const colliders = [];
  const half = car.length / 2 - car.width / 2;
  for (const along of [-half, 0, half]) {
    colliders.push({
      x: spec.x + Math.cos(yaw) * along,
      z: spec.z - Math.sin(yaw) * along,
      r: car.width / 2 + 0.2,
      /* Three circles down ONE car, so of course they share ground -- they
       * are spaced by the car's length and sized by its width, and a spacing
       * wide enough to keep them apart would leave two gaps in the middle of
       * a Lincoln. The geometry gate blocks collider-collider penetration by
       * default, so the tessellation is declared where it is built. */
      overlap: false,
    });
  }
  return { car, colliders, lights };
}

/* ------------------------------------------------------------------ */
/* The whole ground                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build the execution ground.
 *
 * `cars` defaults to the clearing's three. Pass a different list to build the
 * cabin yard with the same code, which is what index.js does.
 */
export function buildExecutionGround({ seed = 0x9e1d, cars = CLEARING_CARS, mud = true, barrel = true } = {}) {
  const random = rng(seed);
  const group = namedGroup('initiation.execution-ground');
  const colliders = [];
  const flames = [];
  const lights = [];

  if (mud) group.add(buildMud(random));

  if (barrel) {
    const built = buildBurnBarrel();
    group.add(built.group);
    flames.push(...built.flames);
    lights.push(built.light);
    colliders.push({ x: BURN_BARREL.x, z: BURN_BARREL.z, r: BURN_BARREL.radius + 0.3 });
  }

  const parked = [];
  for (const spec of cars) {
    const built = buildCar(spec);
    group.add(built.car.group);
    colliders.push(...built.colliders);
    lights.push(...built.lights);
    parked.push({ id: spec.id, ...built.car });
  }

  return { group, colliders, flames, lights, cars: parked };
}

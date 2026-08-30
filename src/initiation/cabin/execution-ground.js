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
import { createHeadlightBeam } from '../../core/vehicles/headlights.js';

import {
  assembly, bakedTexture, between, boxPart, cylinderPart, effect, glowMaterial,
  namedGroup, part, rng, speckle,
} from './kit.js';
import { BONFIRE, CLEARING_CARS, MUD, carYaw } from './site.js';

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
/* The bonfire                                                         */
/* ------------------------------------------------------------------ */

/** A large but grounded wood fire: stone ring, crossed logs, flames and smoke. */
function buildBonfire(random) {
  const group = assembly('clearing.bonfire', 'initiation.bonfire');
  const stones = [];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const stone = boxPart(
      'bonfire.ring.stone',
      [0.55, 0.25, 0.38],
      [Math.cos(angle) * 1.04, 0.125, Math.sin(angle) * 1.04],
      i % 2 ? 0x5a5145 : 0x6b6051,
    );
    stone.rotation.y = -angle;
    stone.castShadow = true;
    stones.push(stone);
    group.add(stone);
  }
  const logs = [];
  for (const [y, angle, offset] of [
    [0.13, Math.PI / 4, -0.22],
    [0.13, Math.PI / 4, 0.22],
    [0.34, -Math.PI / 4, -0.18],
    [0.34, -Math.PI / 4, 0.18],
  ]) {
    const log = boxPart('bonfire.log', [1.75, 0.26, 0.28], [0, y, offset], 0x3a2111);
    log.rotation.y = angle;
    log.castShadow = true;
    logs.push(log);
    group.add(log);
  }
  const flames = [];
  for (const [radius, height, x, z, colour, boost] of [
    [0.72, 1.65, 0, 0, 0xff4214, 2.4],
    [0.48, 1.42, -0.24, 0.14, 0xff8a22, 2.8],
    [0.32, 1.12, 0.28, -0.10, 0xffd067, 3.2],
    [0.20, 0.82, 0.06, 0.26, 0xfff2a2, 3.6],
  ]) {
    const flame = effect(new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 6),
      glowMaterial(colour, boost),
    ));
    flame.name = 'bonfire.flame';
    flame.position.set(x, 0.55 + height / 2, z);
    flame.userData.baseScale = 0.88 + random() * 0.2;
    flame.userData.phase = random() * Math.PI * 2;
    flames.push(flame);
    group.add(flame);
  }

  const smokeCount = 22;
  const smokePositions = new Float32Array(smokeCount * 3);
  const smokePhase = [];
  for (let i = 0; i < smokeCount; i++) {
    const angle = random() * Math.PI * 2;
    const radius = random() * 0.42;
    smokePositions[i * 3] = Math.cos(angle) * radius;
    smokePositions[i * 3 + 1] = 1.05 + random() * 3.4;
    smokePositions[i * 3 + 2] = Math.sin(angle) * radius;
    smokePhase.push(random() * Math.PI * 2);
  }
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smoke = effect(new THREE.Points(
    smokeGeometry,
    new THREE.PointsMaterial({
      color: 0x776f65,
      size: 0.72,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  ));
  smoke.name = 'bonfire.smoke';
  group.add(smoke);

  const light = new THREE.PointLight(0xff873c, 68, 25, 2);
  light.name = 'bonfire.light';
  light.position.set(0, BONFIRE.height + 0.42, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.001;
  group.add(light);
  group.position.set(BONFIRE.x, 0, BONFIRE.z);

  let time = 0;
  const update = (dt) => {
    time += Math.max(0, Number(dt) || 0);
    for (const flame of flames) {
      const wave = Math.sin(time * 8.7 + flame.userData.phase);
      const lean = Math.sin(time * 5.3 + flame.userData.phase * 1.7);
      const scale = flame.userData.baseScale;
      flame.scale.set(scale * (1 + wave * 0.08), scale * (1 + wave * 0.16), scale);
      flame.rotation.z = lean * 0.09;
    }
    light.intensity = 58 + Math.sin(time * 11.3) * 7 + Math.sin(time * 4.1 + 0.8) * 4;
    const positions = smoke.geometry.attributes.position.array;
    for (let i = 0; i < smokeCount; i++) {
      const base = i * 3;
      positions[base] += Math.sin(time * 0.75 + smokePhase[i]) * dt * 0.045;
      positions[base + 1] += dt * (0.22 + (i % 5) * 0.025);
      positions[base + 2] += Math.cos(time * 0.62 + smokePhase[i]) * dt * 0.04;
      if (positions[base + 1] > 4.8) positions[base + 1] = 1.05;
    }
    smoke.geometry.attributes.position.needsUpdate = true;
    smoke.material.opacity = 0.16 + Math.sin(time * 0.9) * 0.035;
  };
  return { group, flames, light, smoke, stones, logs, update };
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
/**
 * The world box of everything SOLID under a group.
 *
 * `Box3.setFromObject` would do this in one line and get the wrong answer: it
 * counts every mesh, and a lit car carries two headlight fog cones sixteen
 * metres long. Those are marked `sceneAuditIgnore` where they are built, which
 * is the same flag the scene audit reads, so this walks the tree and honours
 * it. Returns null for a group with nothing solid in it, which no car is.
 */
function solidBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let found = false;
  const walk = (object, ignored) => {
    const skip = ignored || object.userData?.sceneAuditIgnore === true;
    if (!skip && object.isMesh) {
      box.union(new THREE.Box3().setFromObject(object));
      found = true;
    }
    for (const child of object.children) walk(child, skip);
  };
  walk(root, false);
  return found ? box : null;
}

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
      const beam = effect(createHeadlightBeam({
        reach: 16,
        farRadius: 1.5,
        material: glowMaterial(0xffe9c0, 0.14, {
          transparent: true, opacity: 0.09, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      }));
      beam.name = 'headlight.beam.fog.volume';
      beam.position.copy(head.position);
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
   *
   * AND THEY CARRY THEIR HEIGHT, because a car is a thing you look OVER.
   *
   * The runtime only ever reads x, z and r -- `pushOut` in
   * src/initiation/main.js -- so a bare circle says "you cannot walk here" and
   * says nothing at all about how tall the thing is. Every gate downstream has
   * to invent a band, and the Adapter's is the standing interaction band,
   * -0.5 m to 4 m. Conservative is right for walking into a car. It is WRONG
   * for looking past one: the framing gate reported the ceremony camera at
   * y = 3.6 as CAMERA_INSIDE_SOLID and the walk to the cabin door as
   * SPEAKER_OCCLUDED, and in both cases the blocking solid was a parked
   * Lincoln whose roof is 2.26 m off the mud. The camera was a metre and a
   * third clear of it; the door sightline crossed y = 4.0, the top cap of a
   * band nobody had ever authored, 1.74 m over the paint.
   *
   * So the band is MEASURED off the built car rather than read off SHAPES.
   * The shape table is not the tallest thing on every car -- the boot car's
   * open lid stands 0.20 m proud of its own roof -- and a measurement cannot
   * go stale when somebody edits a slab, which an authored copy of it can.
   * Effects are skipped: the headlight fog cone is a 16 m mesh and it is not
   * steel. One band for all three circles, taken from the whole car, because
   * the world-aligned box of a cabin on an angled car already overlaps all
   * three footprints and splitting it would claim a precision the circles
   * themselves do not have.
   */
  const bounds = solidBounds(car.group);
  const colliders = [];
  const half = car.length / 2 - car.width / 2;
  for (const along of [-half, 0, half]) {
    colliders.push({
      x: spec.x + Math.cos(yaw) * along,
      z: spec.z - Math.sin(yaw) * along,
      r: car.width / 2 + 0.2,
      /* `=== 0` catches the negative zero a rotated wheel cylinder measures
       * out at and nothing else, because -0 === 0. It keeps the sign out of
       * the solid ids the gates build their allowlist keys from. */
      y0: bounds.min.y === 0 ? 0 : bounds.min.y,
      y1: bounds.max.y,
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
export function buildExecutionGround({
  seed = 0x9e1d,
  cars = CLEARING_CARS,
  mud = true,
  barrel = true,
  bonfire = barrel,
} = {}) {
  const random = rng(seed);
  const group = namedGroup('initiation.execution-ground');
  const colliders = [];
  const flames = [];
  const lights = [];
  let update = () => {};

  if (mud) group.add(buildMud(random));

  if (bonfire) {
    const built = buildBonfire(random);
    group.add(built.group);
    flames.push(...built.flames);
    lights.push(built.light);
    colliders.push({ x: BONFIRE.x, z: BONFIRE.z, r: BONFIRE.radius + 0.35 });
    update = built.update;
  }

  const parked = [];
  for (const spec of cars) {
    const built = buildCar(spec);
    group.add(built.car.group);
    colliders.push(...built.colliders);
    lights.push(...built.lights);
    parked.push({ id: spec.id, ...built.car });
  }

  return { group, colliders, flames, lights, cars: parked, update };
}

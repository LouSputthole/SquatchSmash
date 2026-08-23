/**
 * The one parked vehicle the opening shot is close enough to inspect.
 *
 * The shared `makeCar()` silhouettes are intentionally cheap set dressing.
 * This pickup is not: it sits opposite the apartment door, in the player's
 * first clear view of the block. It keeps the same small vehicle Interface
 * (`group`, dimensions, lights) so the block's collider Adapter remains the
 * single source of physical truth.
 */
import * as THREE from 'three';

import { box, cylinder, group, mat } from '../world/build.js';
import { lit } from '../bing/kit.js';

const SIZE = Object.freeze({ length: 5.18, width: 1.92, height: 1.86, wheelR: 0.39 });

export function buildFeaturedPickup({ colour = 0xb9b4a6 } = {}) {
  const paint = mat({ color: colour, roughness: 0.48, metalness: 0.42 });
  const trim = mat({ color: 0x17191d, roughness: 0.82, metalness: 0.15 });
  const chrome = mat({ color: 0xb8bec5, roughness: 0.18, metalness: 0.95 });
  const rubber = mat({ color: 0x0e0f12, roughness: 0.98 });
  const upholstery = mat({ color: 0x38332d, roughness: 0.92 });
  const glass = mat({
    color: 0x9bb3c1,
    roughness: 0.08,
    metalness: 0.08,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const g = group('featured-pickup');
  const add = (part) => { g.add(part); return part; };

  // Chassis, bonnet and a separate open bed keep the silhouette believable.
  add(box({ name: 'pickup.chassis', size: [4.9, 0.25, 1.66], pos: [0, 0.53, 0], mat: trim }));
  add(box({ name: 'pickup.hood', size: [1.48, 0.62, 1.82], pos: [1.72, 0.91, 0], mat: paint }));
  add(box({ name: 'pickup.front-bumper', size: [0.16, 0.26, 1.88], pos: [2.56, 0.55, 0], mat: chrome }));
  add(box({ name: 'pickup.rear-bumper', size: [0.16, 0.24, 1.86], pos: [-2.56, 0.56, 0], mat: chrome }));
  const bedFloor = add(box({ name: 'pickup.bed.floor', size: [1.82, 0.16, 1.62], pos: [-1.53, 0.82, 0], mat: paint }));
  for (const side of [-1, 1]) {
    add(box({
      name: `pickup.bed.side.${side < 0 ? 'left' : 'right'}`,
      size: [1.86, 0.62, 0.13], pos: [-1.5, 1.08, side * 0.84], mat: paint,
    }));
  }
  add(box({ name: 'pickup.tailgate', size: [0.14, 0.62, 1.68], pos: [-2.39, 1.08, 0], mat: paint }));

  // The cab is a shell, not a solid block, so the seats and dash remain seen.
  add(box({ name: 'pickup.cab.floor', size: [1.86, 0.15, 1.62], pos: [0.16, 0.76, 0], mat: trim }));
  add(box({ name: 'pickup.cab.roof', size: [1.72, 0.12, 1.72], pos: [0.04, 1.80, 0], mat: paint }));
  for (const side of [-1, 1]) {
    add(box({
      name: `pickup.door.${side < 0 ? 'left' : 'right'}`,
      size: [1.55, 0.72, 0.10], pos: [0.16, 1.12, side * 0.86], mat: paint,
    }));
    add(box({
      name: `pickup.window.${side < 0 ? 'left' : 'right'}`,
      size: [1.38, 0.58, 0.025], pos: [0.14, 1.53, side * 0.865], mat: glass, cast: false,
    }));
    add(box({
      name: `pickup.door-seam.${side < 0 ? 'left' : 'right'}`,
      size: [0.025, 0.82, 0.018], pos: [-0.61, 1.17, side * 0.922], mat: trim, cast: false,
    }));
    add(box({
      name: `pickup.handle.${side < 0 ? 'left' : 'right'}`,
      size: [0.23, 0.045, 0.045], pos: [-0.28, 1.28, side * 0.94], mat: chrome, cast: false,
    }));
    const mirror = group(`pickup.mirror.${side < 0 ? 'left' : 'right'}`);
    mirror.add(box({ name: 'pickup.mirror.stalk', size: [0.12, 0.05, 0.18], pos: [0, 0, side * 0.09], mat: trim }));
    mirror.add(box({ name: 'pickup.mirror.glass', size: [0.16, 0.16, 0.04], pos: [0, 0.04, side * 0.20], mat: glass, cast: false }));
    mirror.position.set(0.72, 1.48, side * 0.91);
    add(mirror);
  }
  add(box({ name: 'pickup.windscreen', size: [0.04, 0.62, 1.60], pos: [0.87, 1.50, 0], mat: glass, rotZ: 0.17, cast: false }));
  add(box({ name: 'pickup.rear-window', size: [0.035, 0.50, 1.42], pos: [-0.76, 1.49, 0], mat: glass, cast: false }));

  // Interior silhouettes are intentionally readable through the pale glass.
  add(box({ name: 'pickup.dashboard', size: [0.34, 0.28, 1.43], pos: [0.67, 1.12, 0], mat: trim }));
  for (const side of [-1, 1]) {
    const seat = group(`pickup.seat.${side < 0 ? 'left' : 'right'}`);
    seat.add(box({ name: 'pickup.seat.cushion', size: [0.57, 0.18, 0.58], pos: [0, 0.83, side * 0.39], mat: upholstery }));
    seat.add(box({ name: 'pickup.seat.back', size: [0.22, 0.66, 0.57], pos: [-0.22, 1.15, side * 0.39], mat: upholstery, rotZ: -0.08 }));
    add(seat);
  }

  const heads = [];
  const tails = [];
  add(box({ name: 'pickup.grille', size: [0.05, 0.38, 1.24], pos: [2.61, 0.88, 0], mat: chrome }));
  for (const side of [-1, 1]) {
    const head = add(box({
      name: `pickup.headlight.${side < 0 ? 'left' : 'right'}`,
      size: [0.055, 0.25, 0.34], pos: [2.62, 1.04, side * 0.65], mat: lit(0xfff0ce, 0.12), cast: false,
    }));
    const tail = add(box({
      name: `pickup.taillight.${side < 0 ? 'left' : 'right'}`,
      size: [0.055, 0.32, 0.22], pos: [-2.47, 1.08, side * 0.72], mat: lit(0x8a1717, 0.45), cast: false,
    }));
    heads.push(head);
    tails.push(tail);
  }

  const wheelGeo = new THREE.CylinderGeometry(SIZE.wheelR, SIZE.wheelR, 0.28, 18);
  wheelGeo.rotateX(Math.PI / 2);
  for (const x of [-1.72, 1.70]) {
    for (const side of [-1, 1]) {
      const tyre = new THREE.Mesh(wheelGeo, rubber);
      tyre.name = 'pickup.wheel';
      tyre.position.set(x, SIZE.wheelR, side * 0.88);
      tyre.castShadow = true;
      g.add(tyre);
      add(cylinder({
        name: 'pickup.wheel.hub', r: 0.20, h: 0.30,
        pos: [x, SIZE.wheelR, side * 0.885], rotX: Math.PI / 2, mat: chrome,
      }));
    }
  }

  g.userData.vehicle = { kind: 'pickup', ...SIZE, detailed: true };
  g.userData.geometryGate = { assemblyId: 'specialmeeting.featured-pickup' };
  return {
    group: g, heads, tails, body: bedFloor, paint, glassMat: glass,
    length: SIZE.length, width: SIZE.width, height: SIZE.height,
    shape: { L: SIZE.length, W: SIZE.width, wheelR: SIZE.wheelR },
  };
}

export const FEATURED_PICKUP_SIZE = SIZE;

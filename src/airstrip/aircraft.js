import * as THREE from 'three';
import { box, cylinder, group, mat, sphere } from '../world/build.js';

const PAINT = mat({ color: 0xb52c25, roughness: 0.42, metalness: 0.2 });
const PAINT_DARK = mat({ color: 0x6d1715, roughness: 0.5, metalness: 0.15 });
const ALUMINIUM = mat({ color: 0xc8ccd0, roughness: 0.32, metalness: 0.78 });
const BLACK = mat({ color: 0x17191c, roughness: 0.7 });
const GLASS = new THREE.MeshPhysicalMaterial({
  color: 0x8bb2c8,
  roughness: 0.12,
  transmission: 0.35,
  transparent: true,
  opacity: 0.58,
});
const CHECK = new THREE.MeshBasicMaterial({
  color: 0xffc04a,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
});

/**
 * A compact bush plane built at wheel height. Heading zero points down -Z.
 * Interaction proxies are real pieces of the aircraft rather than floating
 * buttons; the subtle amber material is visible only while preflighting.
 */
export function buildAircraft(scene) {
  const root = group('aircraft');

  const fuselage = cylinder({
    rTop: 0.72,
    rBottom: 0.52,
    h: 5.8,
    pos: [0, 1.18, 0],
    rotX: Math.PI / 2,
    mat: PAINT,
    seg: 24,
  });
  root.add(fuselage);
  root.add(sphere({ r: 0.57, rz: 1.05, pos: [0, 1.18, -2.85], mat: PAINT }));
  root.add(sphere({ r: 0.42, rz: 1.2, pos: [0, 1.2, 2.85], mat: PAINT_DARK }));

  const wing = box({
    size: [9.8, 0.16, 1.35],
    pos: [0, 1.82, -0.15],
    mat: PAINT,
  });
  root.add(wing);
  root.add(box({ size: [3.6, 0.12, 0.82], pos: [0, 1.74, 2.55], mat: PAINT_DARK }));
  root.add(box({ size: [0.14, 1.48, 1.05], pos: [0, 2.12, 2.45], mat: PAINT_DARK }));

  const cockpit = box({
    size: [1.25, 0.85, 1.45],
    pos: [0, 1.7, -0.82],
    mat: GLASS,
  });
  root.add(cockpit);
  root.add(box({ size: [1.38, 0.14, 1.55], pos: [0, 2.15, -0.82], mat: PAINT_DARK }));

  const gear = group('landing gear');
  for (const x of [-1.05, 1.05]) {
    gear.add(cylinder({
      r: 0.28,
      h: 0.18,
      pos: [x, 0.28, -0.15],
      rotZ: Math.PI / 2,
      mat: BLACK,
      seg: 16,
    }));
    gear.add(box({
      size: [0.06, 0.78, 0.06],
      pos: [x * 0.72, 0.68, -0.15],
      rotZ: x < 0 ? -0.45 : 0.45,
      mat: ALUMINIUM,
    }));
  }
  gear.add(cylinder({
    r: 0.18,
    h: 0.13,
    pos: [0, 0.22, 2.82],
    rotZ: Math.PI / 2,
    mat: BLACK,
    seg: 14,
  }));
  root.add(gear);

  const propeller = group('propeller');
  propeller.position.set(0, 1.2, -3.48);
  propeller.add(cylinder({
    r: 0.15,
    h: 0.25,
    pos: [0, 0, 0],
    rotX: Math.PI / 2,
    mat: ALUMINIUM,
  }));
  propeller.add(box({ size: [0.12, 2.65, 0.08], pos: [0, 0, -0.15], mat: BLACK }));
  root.add(propeller);

  const fuelCap = cylinder({
    r: 0.11,
    h: 0.04,
    pos: [-2.4, 1.93, -0.15],
    mat: ALUMINIUM,
  });
  const controlWindow = box({
    size: [0.08, 0.58, 0.72],
    pos: [0.67, 1.68, -0.8],
    mat: GLASS,
  });
  const propHub = sphere({ r: 0.23, pos: [0, 1.2, -3.62], mat: ALUMINIUM });
  const cargoHatch = box({
    size: [0.08, 0.7, 0.95],
    pos: [-0.55, 1.2, 1.55],
    mat: PAINT_DARK,
  });
  const door = box({
    size: [0.08, 1.0, 0.9],
    pos: [0.69, 1.43, -0.55],
    mat: PAINT_DARK,
  });
  root.add(fuelCap, controlWindow, propHub, cargoHatch, door);

  const proxies = {
    fuel: interactionProxy(root, [-2.4, 1.93, -0.15], [0.7, 0.35, 0.7]),
    controls: interactionProxy(root, [0.72, 1.68, -0.8], [0.45, 1.0, 1.0]),
    propeller: interactionProxy(root, [0, 1.2, -3.6], [1.2, 2.8, 0.8]),
    cargo: interactionProxy(root, [-0.62, 1.2, 1.55], [0.5, 1.0, 1.25]),
    board: interactionProxy(root, [0.76, 1.35, -0.55], [0.65, 1.35, 1.25]),
    cargoHatch: interactionProxy(root, [-0.7, 1.15, 1.55], [0.8, 1.25, 1.45]),
  };

  root.position.set(0, 0, 120);
  scene.add(root);

  return {
    group: root,
    propeller,
    proxies,
    setInspectionVisible(visible) {
      for (const key of ['fuel', 'controls', 'propeller', 'cargo']) {
        proxies[key].visible = visible;
      }
    },
    updateFromFlight(flight) {
      root.position.set(flight.x, flight.altitude, flight.z);
      root.rotation.order = 'YXZ';
      root.rotation.y = flight.heading;
      root.rotation.x = flight.pitch;
      root.rotation.z = -flight.bank;
      propeller.rotation.z += (2 + flight.throttle * 46) / 60;
    },
  };
}

function interactionProxy(parent, pos, size) {
  const proxy = box({
    size,
    pos,
    mat: CHECK,
    cast: false,
    receive: false,
  });
  proxy.visible = false;
  proxy.name = 'interaction proxy';
  parent.add(proxy);
  return proxy;
}

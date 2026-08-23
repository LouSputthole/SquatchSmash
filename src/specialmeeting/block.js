/**
 * THE SPECIAL MEETING — one block, at night, with nobody on it.
 *
 * The player comes downstairs and stands on a pavement. That is the entire
 * gameplay requirement, and it is exactly why this has to be built properly:
 * the flat upstairs has been a real place for the whole campaign, and if the
 * street under it is a backdrop then the moment he steps outside to be
 * collected, the game admits the flat was a set. Detail is load-bearing here
 * for the reason docs/TONE-AND-PARODY.md gives — an under-built scene fails
 * the doctrine before a word of it is heard.
 *
 * So: a road with a crown and a kerb, two pavements, the building he lives in
 * with its door and its fire escape, an alley beside it with the bins in it, a
 * few tenant parking spaces, a laundromat across the road that shut hours ago,
 * poles and wires, six cars that were already here, and a city carrying on
 * behind all of it. Empty, because it is late. Not dead: a light on in four
 * windows, a television going in one of them, a signal blinking amber at a
 * junction nobody is at.
 *
 * WHAT IS REUSED
 *   src/world/build.js      box / boxFrom / cylinder / mat / collider / group
 *   src/bing/kit.js         asphalt, brick, printed, neonText, lit, tiled
 *   src/bing/vehicles.js    makeCar + makeVehicleCollider for the parked cars
 *   src/silver/room.js      the instanced-skyline technique (three draw calls,
 *                           a 64x64 window canvas as map AND emissive map, a
 *                           deterministic seed) — the code is inside another
 *                           builder's closure, so the METHOD is reused here
 *                           rather than the lines.
 *   ./surfaces.js           the four textures a street has and a club does not
 *
 * BUDGETS, because this is an exterior at night and they are the whole game:
 *   - Five real point lights on the block: three of the six lamp posts, the
 *     bulb over the door, the caged one in the alley. Everything else that
 *     appears to glow is an emissive material. The Bing's lot settled this.
 *   - One shadow-casting light, and it is the moon (night.js). Nothing here
 *     casts from a practical.
 *   - The skyline is three draws and no lights at all.
 *   - Every scatter is seeded. The block is identical on every load.
 */
import * as THREE from 'three';

import { asphalt, brick, lit, neonText, printed, tiled } from '../bing/kit.js';
import { makeCar, makeVehicleCollider } from '../bing/vehicles.js';
import { box, boxFrom, collider, cylinder, group, mat } from '../world/build.js';
import { buildFeaturedPickup } from './featured-vehicle.js';
import {
  ALLEY,
  APARTMENT,
  APARTMENT_HEIGHT,
  CROSS_STREET,
  NEIGHBOUR,
  NORTH_PARKING_Z,
  PARKED_AT_KERB,
  PARKING,
  ROAD,
  SIDEWALK,
  SOUTH_BLOCK,
  SOUTH_PARKING_Z,
  STREETLIGHTS,
  UTILITY_POLES,
  kerbZ,
  parkingBay,
} from './layout.js';
import { curtainedWindow, paperedGlass, pavement, shutter } from './surfaces.js';

/** Which windows are awake. Fixed, so the building is the same every night. */
const LIT_WINDOWS = Object.freeze([
  '0:1', '1:4', '2:0', '2:3', '3:5',
]);
/** And the one with a television in it. */
const TELEVISION_WINDOW = '1:2';

const STOREY = APARTMENT.storeyHeight;
const FACADE_Z = APARTMENT.facadeZ;

/** Window bay centres across the apartment front. The door breaks the rhythm. */
const BAYS = Object.freeze([-12, -8.8, -6.2, -1.8, 1.4, 4.6]);

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Build the block into `scene`.
 *
 * @param {THREE.Scene} scene
 * @param {object} options
 *   `registerLight` is handed every real light this makes, so a scene that
 *   wants a nearest-N budget scheduler (src/mansion/siege) can take them
 *   without this module knowing anything about one.
 * @returns {{group, colliders, floorZones, lights, interactables, anchors,
 *            update: Function, dispose: Function}}
 */
export function buildSpecialMeetingBlock(scene, { registerLight = null } = {}) {
  const root = group('specialmeeting.block');
  const colliders = [];
  const lights = [];
  const ticking = [];
  const interactables = [];
  const anchors = {};
  const disposables = [];
  let serial = 0;

  const own = (object, kind, policy = {}) => {
    object.userData.geometryGate = {
      assemblyId: `specialmeeting.${kind}.${++serial}`,
      ...policy,
    };
    return object;
  };
  const structural = (mesh) => {
    mesh.userData.geometryGate = {
      ...(mesh.userData.geometryGate ?? {}),
      structural: true,
      fixedSupportAnchor: true,
    };
    return mesh;
  };
  const loose = (mesh) => {
    mesh.userData.geometryGate = {
      ...(mesh.userData.geometryGate ?? {}),
      overlap: false,
      checkSupport: false,
    };
    return mesh;
  };
  const add = (mesh, parent = root) => {
    parent.add(mesh);
    return mesh;
  };
  const solid = (minX, minZ, maxX, maxZ, minY = 0, maxY = 3) => {
    colliders.push(collider([minX, minY, minZ], [maxX, maxY, maxZ]));
  };
  const practical = (light) => {
    lights.push(light);
    registerLight?.(light);
    return light;
  };

  /* ---------------------------------------------------------------- */
  /* Materials                                                         */
  /* ---------------------------------------------------------------- */
  const roadTex = tiled(asphalt(), 18, 2);
  const alleyTex = tiled(asphalt(), 3, 8);
  const lotTex = tiled(asphalt(), 4, 4);
  const paveTex = tiled(pavement(), 20, 1.2);
  disposables.push(roadTex, alleyTex, lotTex, paveTex);

  /* Lines everything on the pavement is set out from: the middle of the walk,
   * its depth, and the strip nearest the kerb where the furniture goes. */
  const walkDepth = Math.abs(SIDEWALK.north.z1 - SIDEWALK.north.z0);
  const northWalkZ = (SIDEWALK.north.z0 + SIDEWALK.north.z1) / 2;
  const kerbLineNorth = SIDEWALK.north.z0 - 0.6;
  const kerbLineSouth = SIDEWALK.south.z0 + 0.6;

  const MAT = {
    road: mat({ map: roadTex, roughness: 0.94 }),
    alley: mat({ map: alleyTex, roughness: 0.96 }),
    lot: mat({ map: lotTex, roughness: 0.95 }),
    pavement: mat({ map: paveTex, roughness: 0.93 }),
    kerb: mat({ color: 0x5b5c62, roughness: 0.88 }),
    paint: mat({ color: 0xb9b09a, roughness: 0.9 }),
    brickRed: mat({ map: tiled(brick('#6a3a30'), 5, 5), roughness: 0.96 }),
    brickBrown: mat({ map: tiled(brick('#4a3128'), 5, 6), roughness: 0.97 }),
    brickGrey: mat({ map: tiled(brick('#4a4a4e'), 5, 4), roughness: 0.97 }),
    stone: mat({ color: 0x3c3d43, roughness: 0.9 }),
    steel: mat({ color: 0x2a2c31, roughness: 0.7, metalness: 0.5 }),
    darkSteel: mat({ color: 0x191b1f, roughness: 0.8, metalness: 0.4 }),
    wood: mat({ color: 0x3f3226, roughness: 0.98 }),
    glassDark: mat({
      color: 0x0a0d12, roughness: 0.16, metalness: 0.3,
      transparent: true, opacity: 0.86,
    }),
    puddle: mat({ color: 0x0c0f16, roughness: 0.06, metalness: 0.55 }),
    shutter: mat({ map: tiled(shutter(), 3, 1), roughness: 0.86, metalness: 0.35 }),
    papered: mat({ map: tiled(paperedGlass(), 2, 1), roughness: 0.95 }),
  };

  /* ---------------------------------------------------------------- */
  /* The ground                                                        */
  /* ---------------------------------------------------------------- */
  const roadLength = ROAD.maxX - ROAD.minX;
  const roadway = add(box({
    name: 'block.road',
    size: [roadLength, 0.12, ROAD.halfWidth * 2],
    pos: [(ROAD.minX + ROAD.maxX) / 2, -0.06, ROAD.centreZ],
    mat: MAT.road,
    cast: false,
  }));
  structural(own(roadway, 'road'));

  /* The two cross streets. They sit a millimetre under the main carriageway so
   * the junction squares are not two coplanar surfaces fighting over the same
   * pixels — the same stagger the heist's road grid needs. */
  for (const [name, x] of [['west', CROSS_STREET.westX], ['east', CROSS_STREET.eastX]]) {
    const cross = add(box({
      name: `block.cross-street.${name}`,
      size: [CROSS_STREET.halfWidth * 2, 0.12, 120],
      pos: [x, -0.061, 0],
      mat: MAT.road,
      cast: false,
    }));
    loose(own(cross, 'cross-street'));
  }

  // Lane dashes down the middle, and a solid edge line each side.
  for (let x = ROAD.minX + 3; x < ROAD.maxX; x += 6) {
    if (Math.abs(x - CROSS_STREET.westX) < 6 || Math.abs(x - CROSS_STREET.eastX) < 6) continue;
    loose(add(box({
      name: 'block.lane-dash',
      size: [2.6, 0.02, 0.14],
      pos: [x, 0.005, 0],
      mat: MAT.paint,
      cast: false,
    })));
  }

  // Pavements. Their top face IS the kerb: 15 cm, which the player steps over.
  for (const side of ['north', 'south']) {
    const walk = SIDEWALK[side];
    const depth = Math.abs(walk.z1 - walk.z0);
    const slab = add(box({
      name: `block.pavement.${side}`,
      size: [walk.maxX - walk.minX, ROAD.kerbHeight, depth],
      pos: [(walk.minX + walk.maxX) / 2, ROAD.kerbHeight / 2, (walk.z0 + walk.z1) / 2],
      mat: MAT.pavement,
      cast: false,
    }));
    structural(own(slab, 'pavement'));
    // A granite kerbstone along the face, so the edge has an edge.
    const face = walk.z0 + (side === 'north' ? 0.11 : -0.11);
    loose(add(box({
      name: `block.kerbstone.${side}`,
      size: [walk.maxX - walk.minX, 0.17, 0.22],
      pos: [(walk.minX + walk.maxX) / 2, 0.085, face],
      mat: MAT.kerb,
      cast: false,
    })));
    // And a collider on the kerb line, so stepping up is a step and not a jump.
    const z0 = Math.min(walk.z0, face);
    solid(walk.minX, z0 - 0.12, walk.maxX, z0 + 0.12, 0, ROAD.kerbHeight);
  }

  /* ---------------------------------------------------------------- */
  /* Puddles and drains                                                */
  /* ---------------------------------------------------------------- */
  /* It rained earlier. Puddles are the cheapest thing on this block and they
   * do more than anything else on it: a wet road takes the sodium lamps and
   * the headlights and hands them back, which is the entire look. */
  const puddles = [
    [-18.5, -5.0, 3.4, 1.5], [-7.5, -5.3, 2.2, 1.1], [4.5, 5.1, 3.0, 1.4],
    [17.5, -4.8, 2.6, 1.2], [-2.5, 4.6, 1.8, 0.9], [-17.6, -12.5, 2.4, 1.6],
  ];
  for (const [px, pz, pw, pd] of puddles) {
    const inAlley = pz < FACADE_Z;
    loose(add(box({
      name: 'block.puddle',
      size: [pw, 0.012, pd],
      pos: [px, (inAlley ? ROAD.kerbHeight : 0) + 0.007, pz],
      mat: MAT.puddle,
      cast: false,
    })));
  }
  for (const [dx, dz] of [[-16, SIDEWALK.north.z0 + 0.2], [6, SIDEWALK.south.z0 - 0.2]]) {
    loose(add(box({
      name: 'block.storm-drain',
      size: [0.9, 0.05, 0.4],
      pos: [dx, 0.01, dz],
      mat: MAT.darkSteel,
      cast: false,
    })));
  }

  /* ---------------------------------------------------------------- */
  /* The apartment building                                            */
  /* ---------------------------------------------------------------- */
  const apartment = group('block.apartment');
  add(apartment);
  const backZ = FACADE_Z - APARTMENT.depth;
  const shell = boxFrom(
    APARTMENT.minX, 0, backZ, APARTMENT.maxX, APARTMENT_HEIGHT, FACADE_Z, MAT.brickRed,
    { name: 'apartment.shell', cast: true },
  );
  structural(own(shell, 'apartment'));
  add(shell, apartment);
  solid(APARTMENT.minX, backZ, APARTMENT.maxX, FACADE_Z, 0, APARTMENT_HEIGHT);

  // A stone base course, and a cornice at the parapet, so it is not one box.
  loose(add(boxFrom(
    APARTMENT.minX - 0.12, 0, FACADE_Z - 0.02, APARTMENT.maxX + 0.12, 1.15, FACADE_Z + 0.14,
    MAT.stone, { name: 'apartment.base-course', cast: false },
  ), apartment));
  loose(add(boxFrom(
    APARTMENT.minX - 0.2, APARTMENT_HEIGHT - 0.8, FACADE_Z - 0.02,
    APARTMENT.maxX + 0.2, APARTMENT_HEIGHT - 0.35, FACADE_Z + 0.24,
    MAT.stone, { name: 'apartment.cornice' },
  ), apartment));

  // Windows: two materials for twenty-four openings, one of them with a TV in it.
  const litSkin = curtainedWindow(true);
  const darkSkin = curtainedWindow(false);
  const litMat = mat({
    map: litSkin.map, emissiveMap: litSkin.emissive, emissive: 0xffffff,
    emissiveIntensity: 0.95, roughness: 0.9,
  });
  const darkMat = mat({ map: darkSkin.map, roughness: 0.92 });
  let televisionMat = null;
  for (let storey = 0; storey < APARTMENT.storeys; storey++) {
    for (let bay = 0; bay < BAYS.length; bay++) {
      const key = `${storey}:${bay}`;
      const alight = LIT_WINDOWS.includes(key);
      const television = key === TELEVISION_WINDOW;
      let material = alight ? litMat : darkMat;
      if (television) {
        /* Its own material, because it flickers and a shared one would take
         * every other lit window in the building with it. */
        televisionMat = mat({
          map: litSkin.map, emissiveMap: litSkin.emissive, emissive: 0x6f86c4,
          emissiveIntensity: 0.8, roughness: 0.9, unique: true,
        });
        material = televisionMat;
      }
      const pane = box({
        name: `apartment.window.${key}`,
        size: [1.0, 1.7, 0.06],
        pos: [BAYS[bay], 1.55 + storey * STOREY + 0.85, FACADE_Z + 0.03],
        mat: material,
        cast: false,
      });
      loose(pane);
      add(pane, apartment);
      // A sill under each, which is what a window actually reads by at night.
      loose(add(box({
        name: 'apartment.sill',
        size: [1.24, 0.09, 0.18],
        pos: [BAYS[bay], 1.55 + storey * STOREY - 0.04, FACADE_Z + 0.08],
        mat: MAT.stone,
        cast: false,
      }), apartment));
    }
  }
  if (televisionMat) {
    let flickerT = 0;
    ticking.push((dt) => {
      flickerT += dt;
      const cut = Math.sin(flickerT * 5.3) * Math.sin(flickerT * 1.7 + 1.1);
      televisionMat.emissiveIntensity = 0.55 + 0.42 * (0.5 + 0.5 * cut);
    });
  }

  /* ---- the door he comes out of ---- */
  const entrance = group('block.entrance');
  add(entrance, apartment);
  const ex = APARTMENT.entranceX;
  const half = APARTMENT.entranceWidth / 2;

  // Two steps up off the pavement to a landing at the building line.
  const stepMat = MAT.stone;
  loose(add(boxFrom(ex - half - 0.3, 0, FACADE_Z + 0.55, ex + half + 0.3, 0.30, FACADE_Z + 0.95,
    stepMat, { name: 'entrance.step.lower', cast: false }), entrance));
  loose(add(boxFrom(ex - half - 0.3, 0, FACADE_Z + 0.02, ex + half + 0.3, 0.45, FACADE_Z + 0.58,
    stepMat, { name: 'entrance.step.upper', cast: false }), entrance));
  solid(ex - half - 0.3, FACADE_Z + 0.55, ex + half + 0.3, FACADE_Z + 0.95, 0, 0.30);
  solid(ex - half - 0.3, FACADE_Z + 0.02, ex + half + 0.3, FACADE_Z + 0.58, 0, 0.45);

  // Jambs, lintel and a small canopy over the top of the steps.
  for (const side of [-1, 1]) {
    const jamb = add(boxFrom(
      ex + side * half - 0.22, 0, FACADE_Z - 0.02, ex + side * half + 0.22, 3.3, FACADE_Z + 0.34,
      MAT.stone, { name: `entrance.jamb.${side < 0 ? 'west' : 'east'}` },
    ), entrance);
    own(jamb, 'entrance-jamb');
    solid(ex + side * half - 0.22, FACADE_Z, ex + side * half + 0.22, FACADE_Z + 0.34, 0, 3.3);
  }
  loose(add(boxFrom(ex - half - 0.34, 3.3, FACADE_Z - 0.02, ex + half + 0.34, 3.62, FACADE_Z + 0.92,
    MAT.stone, { name: 'entrance.canopy' }), entrance));

  /* The doors: dark glass with a lobby behind them. The glow is the material,
   * not a light — a real bulb inside a sealed box would light nothing but the
   * inside of the box. What the street sees is warm glass at knee-to-head
   * height, which is exactly what it would see. */
  const lobbyGlass = mat({
    color: 0x120e09, emissive: 0xffb765, emissiveIntensity: 0.55,
    roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.94,
  });
  const doors = box({
    name: 'entrance.doors',
    size: [APARTMENT.entranceWidth - 0.5, 2.35, 0.09],
    pos: [ex, 0.45 + 1.18, FACADE_Z + 0.06],
    mat: lobbyGlass,
    cast: false,
  });
  loose(doors);
  add(doors, entrance);
  interactables.push({
    id: 'apartment-door',
    mesh: doors,
    label: 'The <b>door</b> you came out of',
  });
  loose(add(box({
    name: 'entrance.mullion',
    size: [0.07, 2.35, 0.12],
    pos: [ex, 0.45 + 1.18, FACADE_Z + 0.09],
    mat: MAT.darkSteel,
    cast: false,
  }), entrance));

  // The number over the door, on the transom.
  const numberTex = printed('sm.entrance-number', [APARTMENT.number], {
    w: 256, h: 128, bg: '#0f0d0b', fg: '#e8d7a6', font: '900 74px "Trebuchet MS", sans-serif',
  });
  const numberPlate = box({
    name: 'entrance.number',
    size: [0.9, 0.42, 0.05],
    pos: [ex, 3.02, FACADE_Z + 0.06],
    mat: mat({
      map: numberTex, emissiveMap: numberTex, emissive: 0xffffff,
      emissiveIntensity: 0.5, roughness: 0.9,
    }),
    cast: false,
  });
  loose(add(numberPlate, entrance));

  // Buzzer panel on the east jamb, with the tenants' names on it.
  const buzzerTex = printed('sm.buzzers', ['SUPER', 'CARBONE', 'D. LUCCI', '—'], {
    w: 128, h: 256, bg: '#1a1a1e', fg: '#9aa0a8', font: '600 26px "Trebuchet MS", sans-serif',
  });
  loose(add(box({
    name: 'entrance.buzzers',
    size: [0.16, 0.34, 0.06],
    pos: [ex + half + 0.24, 1.55, FACADE_Z + 0.2],
    mat: mat({ map: buzzerTex, roughness: 0.85 }),
    rotY: -Math.PI / 2,
    cast: false,
  }), entrance));

  // The bulb over the door. One of the five real lights, and the one that
  // matters: it is what he is standing under while he waits.
  const fixture = add(box({
    name: 'entrance.lamp-housing',
    size: [0.34, 0.16, 0.26],
    pos: [ex, 3.24, FACADE_Z + 0.42],
    mat: MAT.darkSteel,
    cast: false,
  }), entrance);
  /* Bolted to the brick 3.24 m up, over the door. Nothing is under it and
   * nothing is meant to be -- the gate looks DOWN for support and finds the
   * top step two and a half metres below, which is a correct measurement of
   * the wrong thing. */
  own(fixture, 'entrance-lamp', { fixedSupportAnchor: true });
  loose(add(box({
    name: 'entrance.lamp-lens',
    size: [0.26, 0.09, 0.2],
    pos: [ex, 3.15, FACADE_Z + 0.42],
    mat: lit(0xffcf9a, 2.6),
    cast: false,
  }), entrance));
  const doorLight = new THREE.PointLight(0xffcf9a, 7.5, 11, 2);
  doorLight.name = 'entrance.light';
  doorLight.position.set(ex, 3.0, FACADE_Z + 0.55);
  add(doorLight, entrance);
  practical(doorLight);

  // A handrail down the steps, and the bins that live beside them.
  const rail = group('entrance.handrail');
  for (const dz of [FACADE_Z + 0.25, FACADE_Z + 0.9]) {
    rail.add(cylinder({
      name: 'entrance.rail-post', r: 0.035, h: 0.95, pos: [ex - half - 0.24, 0.62, dz], mat: MAT.steel,
    }));
  }
  const bar = cylinder({
    name: 'entrance.rail', r: 0.035, h: 0.95, pos: [ex - half - 0.24, 1.06, FACADE_Z + 0.58], mat: MAT.steel,
  });
  bar.rotation.x = Math.PI / 2;
  rail.add(bar);
  loose(rail);
  add(rail, entrance);

  /* Two bins beside the steps, and they have to MISS each other. They were
   * authored sixty centimetres apart with bodies of radius 0.34 and lids of
   * 0.37, so the second one stood six centimetres inside the first and its lid
   * four centimetres inside that body -- a detail nobody would place on
   * purpose and nobody looking at the doorway would fail to see. A metre apart
   * clears both radii and both leans with room to spare, and they still read
   * as a pair rather than as two bins at opposite ends of the wall. */
  for (const [bx, bz, tilt] of [[ex + half + 0.75, FACADE_Z + 0.7, 0.05], [ex + half + 1.75, FACADE_Z + 0.55, -0.08]]) {
    const bin = group('block.bin');
    bin.add(cylinder({ name: 'bin.body', r: 0.34, h: 0.95, pos: [0, 0.62, 0], mat: MAT.darkSteel }));
    bin.add(cylinder({ name: 'bin.lid', r: 0.37, h: 0.07, pos: [0, 1.12, 0], mat: MAT.steel }));
    bin.position.set(bx, ROAD.kerbHeight, bz);
    bin.rotation.z = tilt;
    own(bin, 'bin', { checkSupport: false });
    add(bin, apartment);
    solid(bx - 0.4, bz - 0.4, bx + 0.4, bz + 0.4, 0, 1.2);
  }

  /* ---- fire escape on the street face ---- */
  add(buildFireEscape({
    name: 'apartment.fire-escape',
    x: 3.0,
    faceZ: FACADE_Z,
    outward: 1,
    landings: [3.5, 6.6, 9.7],
    mats: MAT,
    own,
  }), apartment);

  /* ---------------------------------------------------------------- */
  /* The alley                                                         */
  /* ---------------------------------------------------------------- */
  const alley = group('block.alley');
  add(alley);
  const alleyFloor = add(boxFrom(
    ALLEY.minX, 0, ALLEY.endZ, ALLEY.maxX, ROAD.kerbHeight, ALLEY.mouthZ,
    MAT.alley, { name: 'alley.floor', cast: false },
  ), alley);
  structural(own(alleyFloor, 'alley-floor'));

  // The neighbour on the far side of it: five storeys, no way in from here.
  const neighbour = add(boxFrom(
    NEIGHBOUR.minX, 0, NEIGHBOUR.facadeZ - NEIGHBOUR.depth,
    NEIGHBOUR.maxX, NEIGHBOUR.height, NEIGHBOUR.facadeZ,
    MAT.brickBrown, { name: 'alley.neighbour' },
  ));
  structural(own(neighbour, 'neighbour'));
  solid(NEIGHBOUR.minX, NEIGHBOUR.facadeZ - NEIGHBOUR.depth, NEIGHBOUR.maxX, NEIGHBOUR.facadeZ,
    0, NEIGHBOUR.height);

  /* No wall on the east side: that side of the alley IS the building, whose
   * shell already runs from the back of the lot to the street. A separate
   * return wall there would leave a metre of ground between the two with
   * nothing under it, which is exactly the kind of gap a player finds. */
  const alleyEnd = add(boxFrom(
    ALLEY.minX, 0, ALLEY.endZ - 0.6, ALLEY.maxX, 6.5, ALLEY.endZ,
    MAT.brickGrey, { name: 'alley.dead-end' },
  ), alley);
  structural(own(alleyEnd, 'alley-end'));
  solid(ALLEY.minX, ALLEY.endZ - 0.6, ALLEY.maxX, ALLEY.endZ, 0, 6.5);

  // Dumpster: lid, body, wheels, and a stripe of a serial number nobody reads.
  const dumpster = group('alley.dumpster');
  dumpster.add(box({ name: 'dumpster.body', size: [1.9, 1.25, 1.5], pos: [0, 0.7, 0], mat: mat({ color: 0x2a3a30, roughness: 0.95 }) }));
  dumpster.add(box({ name: 'dumpster.lid', size: [1.96, 0.1, 1.56], pos: [0, 1.36, 0], mat: mat({ color: 0x22302a, roughness: 0.95 }) }));
  for (const wx of [-0.7, 0.7]) {
    for (const wz of [-0.6, 0.6]) {
      dumpster.add(cylinder({
        name: 'dumpster.castor', r: 0.09, h: 0.08, pos: [wx, 0.09, wz],
        rotZ: Math.PI / 2, mat: MAT.darkSteel, cast: false,
      }));
    }
  }
  dumpster.position.set(ALLEY.dumpster.x, ROAD.kerbHeight, ALLEY.dumpster.z);
  dumpster.rotation.y = ALLEY.dumpster.yaw;
  own(dumpster, 'dumpster', { checkSupport: false });
  add(dumpster, alley);
  solid(ALLEY.dumpster.x - 1.1, ALLEY.dumpster.z - 0.9, ALLEY.dumpster.x + 1.1, ALLEY.dumpster.z + 0.9, 0, 1.5);

  // Bags that did not make it into it, and a stack of crates against the wall.
  const alleyRnd = seeded(0x9b1f22);
  for (let i = 0; i < 5; i++) {
    const bx = ALLEY.dumpster.x + (alleyRnd() - 0.5) * 2.6;
    const bz = ALLEY.dumpster.z + 1.2 + alleyRnd() * 1.6;
    const bag = cylinder({
      name: 'alley.rubbish-bag',
      r: 0.28 + alleyRnd() * 0.12,
      h: 0.5,
      pos: [bx, ROAD.kerbHeight + 0.25, bz],
      mat: mat({ color: 0x141418, roughness: 0.96 }),
    });
    loose(add(bag, alley));
  }
  for (let i = 0; i < 4; i++) {
    const crate = box({
      name: 'alley.crate',
      size: [0.72, 0.42, 0.6],
      pos: [ALLEY.minX + 0.7, ROAD.kerbHeight + 0.21 + i * 0.42, -19.4 + (i % 2) * 0.16],
      mat: MAT.wood,
    });
    crate.rotation.y = (alleyRnd() - 0.5) * 0.3;
    own(crate, 'crate', { checkSupport: false });
    add(crate, alley);
  }

  // Service door into the back of the building, and a caged bulb over it.
  const serviceDoor = add(box({
    name: 'alley.service-door',
    size: [0.1, 2.1, 1.0],
    pos: [ALLEY.serviceDoor.x + 0.06, ROAD.kerbHeight + 1.05, ALLEY.serviceDoor.z],
    mat: MAT.steel,
  }), alley);
  loose(serviceDoor);
  loose(add(box({
    name: 'alley.service-lamp',
    size: [0.16, 0.16, 0.22],
    pos: [ALLEY.serviceDoor.x + 0.14, ROAD.kerbHeight + 2.5, ALLEY.serviceDoor.z],
    mat: lit(0xffd8a4, 2.2),
    cast: false,
  }), alley));
  const alleyLight = new THREE.PointLight(0xffd0a0, 4.6, 9, 2);
  alleyLight.name = 'alley.light';
  alleyLight.position.set(ALLEY.serviceDoor.x + 0.5, ROAD.kerbHeight + 2.45, ALLEY.serviceDoor.z);
  add(alleyLight, alley);
  practical(alleyLight);

  // A second fire escape, on the alley wall, because that is where they are.
  /* Built in its own frame — a facade at local z 0, the run along local x —
   * and then turned a quarter and stood against the alley wall. A rotation.y
   * of −PI/2 sends local +x to world +z and local +z (the way it projects) to
   * world −x, which is out into the alley. */
  const alleyEscape = buildFireEscape({
    name: 'alley.fire-escape',
    x: ALLEY.fireEscape.z,
    faceZ: 0,
    outward: 1,
    landings: [3.5, 6.6, 9.7],
    mats: MAT,
    own,
  });
  alleyEscape.rotation.y = -Math.PI / 2;
  alleyEscape.position.set(ALLEY.fireEscape.x, 0, 0);
  add(alleyEscape, alley);

  /* ---------------------------------------------------------------- */
  /* Tenant parking                                                    */
  /* ---------------------------------------------------------------- */
  const lot = group('block.parking');
  add(lot);
  const apron = add(boxFrom(
    PARKING.minX, 0, PARKING.minZ, PARKING.maxX, ROAD.kerbHeight, PARKING.maxZ,
    MAT.lot, { name: 'parking.apron', cast: false },
  ), lot);
  structural(own(apron, 'parking-apron'));
  // The break in the kerb the cars use, ramped rather than kerbed.
  const cut = box({
    name: 'parking.curb-cut',
    size: [PARKING.curbCut.maxX - PARKING.curbCut.minX, 0.14, walkDepth],
    pos: [(PARKING.curbCut.minX + PARKING.curbCut.maxX) / 2, 0.06, northWalkZ],
    mat: MAT.lot,
    cast: false,
  });
  cut.rotation.x = -0.038;
  loose(add(cut, lot));

  for (let i = 0; i < PARKING.bays; i++) {
    const bay = parkingBay(i);
    loose(add(box({
      name: 'parking.bay-line',
      size: [0.1, 0.02, 4.8],
      pos: [bay.x - PARKING.bayWidth / 2, ROAD.kerbHeight + 0.01, bay.z],
      mat: MAT.paint,
      cast: false,
    }), lot));
  }
  loose(add(box({
    name: 'parking.bay-line.last',
    size: [0.1, 0.02, 4.8],
    pos: [parkingBay(PARKING.bays - 1).x + PARKING.bayWidth / 2, ROAD.kerbHeight + 0.01, parkingBay(0).z],
    mat: MAT.paint,
    cast: false,
  }), lot));

  // A low block wall along the back of the lot and the fence beside it.
  const lotWall = add(boxFrom(
    PARKING.minX - 0.3, 0, PARKING.minZ - 0.35, PARKING.maxX + 0.3, 1.3, PARKING.minZ,
    MAT.brickGrey, { name: 'parking.wall' },
  ), lot);
  structural(own(lotWall, 'parking-wall'));
  solid(PARKING.minX - 0.3, PARKING.minZ - 0.35, PARKING.maxX + 0.3, PARKING.minZ, 0, 1.3);
  for (let i = 0; i <= 6; i++) {
    const fz = PARKING.minZ + (i / 6) * (PARKING.maxZ - PARKING.minZ);
    loose(add(cylinder({
      name: 'parking.fence-post', r: 0.05, h: 2.0,
      pos: [PARKING.maxX + 0.3, ROAD.kerbHeight + 1.0, fz], mat: MAT.steel,
    }), lot));
  }
  solid(PARKING.maxX + 0.2, PARKING.minZ, PARKING.maxX + 0.4, PARKING.maxZ, 0, 2.0);

  /* Chain link across the frontage either side of the entrance. A tenant lot
   * open along twelve metres of pavement is not a lot, it is a hole in the
   * block that happens to have bays painted on it. */
  for (const [fromX, toX] of [
    [PARKING.minX - 0.3, PARKING.curbCut.minX],
    [PARKING.curbCut.maxX, PARKING.maxX + 0.3],
  ]) {
    const fence = box({
      name: 'parking.frontage-fence',
      size: [toX - fromX, 1.9, 0.08],
      pos: [(fromX + toX) / 2, ROAD.kerbHeight + 0.95, PARKING.maxZ + 0.05],
      mat: MAT.steel,
      cast: false,
    });
    own(fence, 'parking-fence', { checkSupport: false });
    add(fence, lot);
    solid(fromX, PARKING.maxZ - 0.1, toX, PARKING.maxZ + 0.2, 0, 1.9);
  }

  const lotSignTex = printed('sm.tenant-parking', ['TENANT PARKING', 'VIOLATORS TOWED'], {
    w: 512, h: 256, bg: '#16233a', fg: '#e9edf4', font: '900 52px "Trebuchet MS", sans-serif',
    border: '#e9edf4',
  });
  loose(add(box({
    name: 'parking.sign',
    size: [1.1, 0.6, 0.05],
    pos: [PARKING.minX + 0.6, ROAD.kerbHeight + 2.0, PARKING.maxZ - 0.4],
    mat: mat({ map: lotSignTex, roughness: 0.88 }),
    cast: false,
  }), lot));
  loose(add(cylinder({
    name: 'parking.sign-post', r: 0.045, h: 2.2,
    pos: [PARKING.minX + 0.6, ROAD.kerbHeight + 1.1, PARKING.maxZ - 0.4], mat: MAT.steel,
  }), lot));

  for (const spot of PARKING.parked) {
    const bay = parkingBay(spot.bay);
    const car = makeCar(spot.kind, spot.colour, { dented: !!spot.dented });
    car.group.position.set(bay.x, ROAD.kerbHeight, bay.z);
    car.group.rotation.y = Math.PI / 2;
    own(car.group, 'parked-car', { checkSupport: false });
    add(car.group, lot);
    colliders.push(makeVehicleCollider(car, 0.1));
  }

  /* ---------------------------------------------------------------- */
  /* Across the road                                                   */
  /* ---------------------------------------------------------------- */
  const southBlock = group('block.south');
  add(southBlock);
  const southDepth = SOUTH_BLOCK.depth;
  const southHeight = SOUTH_BLOCK.storeys * SOUTH_BLOCK.storeyHeight;
  const southRnd = seeded(0x33ae71);
  for (const unit of SOUTH_BLOCK.units) {
    const width = unit.maxX - unit.minX;
    const facadeMat = unit.kind === 'laundromat' ? MAT.brickGrey
      : unit.kind === 'shuttered' ? MAT.brickBrown : MAT.brickRed;
    const face = boxFrom(
      unit.minX, 0, SOUTH_BLOCK.facadeZ, unit.maxX, southHeight, SOUTH_BLOCK.facadeZ + southDepth,
      facadeMat, { name: `south.${unit.id}` },
    );
    structural(own(face, 'south-unit'));
    add(face, southBlock);
    solid(unit.minX, SOUTH_BLOCK.facadeZ, unit.maxX, SOUTH_BLOCK.facadeZ + southDepth, 0, southHeight);

    // Upper-storey windows, mostly out. Nobody lives over a shut shop.
    for (let storey = 1; storey < SOUTH_BLOCK.storeys; storey++) {
      const count = Math.max(2, Math.floor(width / 3.2));
      for (let i = 0; i < count; i++) {
        const wx = unit.minX + (width / count) * (i + 0.5);
        const alight = southRnd() < 0.16;
        loose(add(box({
          name: 'south.window',
          size: [0.9, 1.5, 0.06],
          pos: [wx, storey * SOUTH_BLOCK.storeyHeight + 1.5, SOUTH_BLOCK.facadeZ - 0.03],
          mat: alight ? litMat : darkMat,
          cast: false,
        }), southBlock));
      }
    }

    if (unit.kind === 'blank') {
      // A loading door and a ghost sign painted on a hundred years ago.
      loose(add(box({
        name: 'south.loading-door',
        size: [3.2, 3.0, 0.1],
        pos: [(unit.minX + unit.maxX) / 2, 1.55, SOUTH_BLOCK.facadeZ - 0.05],
        mat: MAT.shutter,
        cast: false,
      }), southBlock));
      continue;
    }

    // Shopfront: a dark recess, a stall riser, and the grille that is down.
    loose(add(boxFrom(
      unit.minX + 0.4, 0.15, SOUTH_BLOCK.facadeZ - 0.12, unit.maxX - 0.4, 3.4, SOUTH_BLOCK.facadeZ - 0.06,
      MAT.darkSteel, { name: 'south.shopfront-recess', cast: false },
    ), southBlock));
    const grille = box({
      name: `south.grille.${unit.id}`,
      size: [width - 1.0, 3.0, 0.08],
      pos: [(unit.minX + unit.maxX) / 2, 1.65, SOUTH_BLOCK.facadeZ - 0.14],
      mat: MAT.shutter,
      cast: false,
    });
    loose(add(grille, southBlock));

    if (unit.kind === 'laundromat') {
      /* One security light left on inside, behind the grille. It is the only
       * thing across the road with anything on in it, which is what makes the
       * street read as closed rather than as unbuilt. */
      loose(add(box({
        name: 'south.laundromat.security-light',
        size: [width - 1.4, 1.1, 0.04],
        pos: [(unit.minX + unit.maxX) / 2, 2.2, SOUTH_BLOCK.facadeZ - 0.1],
        mat: lit(0x7fa9b8, 0.55),
        cast: false,
      }), southBlock));

      // The sign. It is a laundromat, so of course one letter has gone.
      const signTex = neonText('sm.laundromat', 'SUDS CITY', '#57e0ff', {
        w: 1024, h: 256, font: '900 128px "Trebuchet MS", sans-serif',
      });
      const signMat = mat({
        map: signTex, emissiveMap: signTex, emissive: 0x8fe6ff,
        emissiveIntensity: 1.7, transparent: true, roughness: 1, unique: true,
      });
      const board = box({
        name: 'south.laundromat.sign',
        size: [width - 1.6, 1.15, 0.12],
        pos: [(unit.minX + unit.maxX) / 2, 4.25, SOUTH_BLOCK.facadeZ - 0.12],
        mat: signMat,
        cast: false,
      });
      loose(add(board, southBlock));
      let buzz = 0;
      ticking.push((dt) => {
        buzz += dt;
        /* A tube on its way out: mostly on, dropping out for a fraction of a
         * second every few seconds, never in a rhythm you could tap to. */
        const dip = Math.sin(buzz * 11.7) * Math.sin(buzz * 2.3 + 0.7) > 0.86 ? 0.25 : 1;
        signMat.emissiveIntensity = 1.7 * dip;
      });

      const hoursTex = printed('sm.laundromat-hours', ['WASH & DRY', 'OPEN 6AM'], {
        w: 512, h: 256, bg: '#101418', fg: '#c8d6dd', font: '700 46px "Trebuchet MS", sans-serif',
      });
      loose(add(box({
        name: 'south.laundromat.hours',
        size: [1.2, 0.6, 0.04],
        pos: [unit.minX + 1.6, 2.0, SOUTH_BLOCK.facadeZ - 0.16],
        mat: mat({ map: hoursTex, roughness: 0.9 }),
        cast: false,
      }), southBlock));
    }

    if (unit.kind === 'shuttered') {
      const nameTex = printed('sm.shoe-repair', ['PALUMBO', 'SHOE REPAIR'], {
        w: 512, h: 200, bg: '#221a14', fg: '#d9c08a', font: '900 54px "Trebuchet MS", sans-serif',
      });
      loose(add(box({
        name: 'south.shoe-repair.sign',
        size: [width - 2.2, 0.85, 0.1],
        pos: [(unit.minX + unit.maxX) / 2, 3.9, SOUTH_BLOCK.facadeZ - 0.12],
        mat: mat({ map: nameTex, roughness: 0.92 }),
        cast: false,
      }), southBlock));
      loose(add(box({
        name: 'south.shoe-repair.papered-transom',
        size: [width - 2.6, 0.55, 0.04],
        pos: [(unit.minX + unit.maxX) / 2, 3.2, SOUTH_BLOCK.facadeZ - 0.18],
        mat: MAT.papered,
        cast: false,
      }), southBlock));
    }
  }

  // A fire escape over the laundromat, facing the apartment across the road.
  const southEscape = buildFireEscape({
    name: 'south.fire-escape',
    x: -6.0,
    faceZ: SOUTH_BLOCK.facadeZ,
    outward: -1,
    landings: [3.9, 7.3],
    mats: MAT,
    own,
  });
  add(southEscape, southBlock);

  /* ---------------------------------------------------------------- */
  /* Lamps, poles and wires                                            */
  /* ---------------------------------------------------------------- */
  for (const lamp of STREETLIGHTS) {
    const side = lamp.side;
    const z = kerbZ(side) + (side === 'north' ? -0.65 : 0.65);
    const reach = side === 'north' ? 2.6 : -2.6;
    const post = group('block.streetlamp');
    post.add(cylinder({ name: 'streetlamp.post', r: 0.09, h: 7.4, pos: [0, 3.7, 0], mat: MAT.steel }));
    post.add(cylinder({ name: 'streetlamp.base', r: 0.16, h: 0.5, pos: [0, 0.25, 0], mat: MAT.steel }));
    const arm = box({
      name: 'streetlamp.arm', size: [0.12, 0.12, Math.abs(reach)],
      pos: [0, 7.25, reach / 2], mat: MAT.steel,
    });
    arm.rotation.x = side === 'north' ? -0.09 : 0.09;
    post.add(arm);
    post.add(box({
      name: 'streetlamp.head', size: [0.42, 0.16, 0.86],
      pos: [0, 7.02, reach], mat: lit(0xffb45e, 2.4), cast: false,
    }));
    post.position.set(lamp.x, ROAD.kerbHeight, z);
    own(post, 'streetlamp', { checkSupport: false });
    add(post);
    solid(lamp.x - 0.16, z - 0.16, lamp.x + 0.16, z + 0.16, 0, 7.4);

    if (lamp.live) {
      const light = new THREE.PointLight(0xffb45e, 22, 26, 2);
      light.name = `streetlamp.light.${lamp.x}`;
      light.position.set(lamp.x, ROAD.kerbHeight + 6.9, z + reach);
      add(light);
      practical(light);
    }
  }

  const poleTops = [];
  for (const pole of UTILITY_POLES) {
    const z = SIDEWALK.south.z0 + 1.1;
    const stack = group('block.utility-pole');
    stack.add(cylinder({ name: 'pole.trunk', r: 0.17, h: 9.6, pos: [0, 4.8, 0], mat: MAT.wood }));
    for (const [y, span] of [[8.6, 2.8], [7.7, 2.2]]) {
      stack.add(box({ name: 'pole.crossarm', size: [0.14, 0.13, span], pos: [0, y, 0], mat: MAT.wood }));
      for (const t of [-0.42, -0.16, 0.16, 0.42]) {
        stack.add(cylinder({
          name: 'pole.insulator', r: 0.055, h: 0.14,
          pos: [0, y + 0.13, t * span], mat: mat({ color: 0x2c3a3a, roughness: 0.5 }), cast: false,
        }));
      }
    }
    if (pole.transformer) {
      stack.add(cylinder({
        name: 'pole.transformer', r: 0.34, h: 0.95, pos: [0.42, 6.6, 0],
        mat: mat({ color: 0x3a3d42, roughness: 0.8, metalness: 0.4 }),
      }));
    }
    stack.position.set(pole.x, ROAD.kerbHeight, z);
    /* In the ground, not resting on it — same reasoning as the fire escape
     * above, and the same 9.6 m span that made a blanket opt-out too wide to
     * be allowed. */
    own(stack, 'utility-pole', { fixedSupportAnchor: true });
    add(stack);
    solid(pole.x - 0.22, z - 0.22, pole.x + 0.22, z + 0.22, 0, 9.6);
    poleTops.push({ x: pole.x, z, y: ROAD.kerbHeight + 8.73 });
  }

  const wireMat = mat({ color: 0x0e0f12, roughness: 0.95 });
  const wire = (from, to, sag, name) => {
    const mid = new THREE.Vector3(
      (from.x + to.x) / 2, (from.y + to.y) / 2 - sag, (from.z + to.z) / 2,
    );
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(from.x, from.y, from.z), mid, new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.026, 5, false), wireMat);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    loose(mesh);
    disposables.push(mesh.geometry);
    return add(mesh);
  };
  for (let i = 0; i < poleTops.length - 1; i++) {
    const a = poleTops[i];
    const b = poleTops[i + 1];
    for (const t of [-1.18, -0.45, 0.45, 1.18]) {
      wire({ x: a.x, y: a.y, z: a.z + t }, { x: b.x, y: b.y, z: b.z + t }, 0.85, 'block.wire');
    }
  }
  /* Two service drops across the road to the apartment. They are the only
   * things in the scene above head height between the player and the sky, and
   * a street with nothing overhead reads like a corridor with the roof off. */
  wire(
    { x: UTILITY_POLES[1].x, y: poleTops[1].y - 1.6, z: poleTops[1].z },
    { x: APARTMENT.entranceX - 3.4, y: 7.2, z: FACADE_Z + 0.1 },
    0.7, 'block.service-drop',
  );
  wire(
    { x: UTILITY_POLES[2].x, y: poleTops[2].y - 1.9, z: poleTops[2].z },
    { x: 5.2, y: 6.6, z: FACADE_Z + 0.1 },
    0.6, 'block.service-drop',
  );

  /* ---------------------------------------------------------------- */
  /* Cars that were already here                                       */
  /* ---------------------------------------------------------------- */
  const kerbRnd = seeded(0x71c4d9);
  for (const spot of PARKED_AT_KERB) {
    const car = spot.featured
      ? buildFeaturedPickup({ colour: spot.colour })
      : makeCar(spot.kind, spot.colour, { dented: !!spot.dented });
    const z = spot.side === 'north' ? NORTH_PARKING_Z : SOUTH_PARKING_Z;
    car.group.position.set(spot.x, 0, z);
    car.group.rotation.y = (spot.side === 'north' ? 0 : Math.PI) + (kerbRnd() - 0.5) * 0.05;
    own(car.group, 'kerb-car', { checkSupport: false });
    add(car.group);
    colliders.push(makeVehicleCollider(car, 0.1));
  }

  /* ---------------------------------------------------------------- */
  /* Street furniture                                                  */
  /* ---------------------------------------------------------------- */
  const hydrant = group('block.hydrant');
  hydrant.add(cylinder({ name: 'hydrant.body', r: 0.17, h: 0.72, pos: [0, 0.36, 0], mat: mat({ color: 0x8a2420, roughness: 0.85 }) }));
  hydrant.add(cylinder({ name: 'hydrant.cap', r: 0.13, h: 0.16, pos: [0, 0.78, 0], mat: mat({ color: 0x8a2420, roughness: 0.85 }) }));
  for (const sx of [-1, 1]) {
    hydrant.add(cylinder({
      name: 'hydrant.outlet', r: 0.08, h: 0.16, pos: [sx * 0.2, 0.5, 0],
      rotZ: Math.PI / 2, mat: mat({ color: 0x7a2420, roughness: 0.85 }), cast: false,
    }));
  }
  hydrant.position.set(-9, ROAD.kerbHeight, kerbLineNorth);
  own(hydrant, 'hydrant', { checkSupport: false });
  add(hydrant);
  solid(-9.25, kerbLineNorth - 0.25, -8.75, kerbLineNorth + 0.25, 0, 0.9);

  const mailbox = group('block.mailbox');
  mailbox.add(box({ name: 'mailbox.body', size: [0.72, 0.82, 0.56], pos: [0, 0.85, 0], mat: mat({ color: 0x1e3b6a, roughness: 0.86 }) }));
  mailbox.add(cylinder({ name: 'mailbox.hood', r: 0.28, h: 0.72, pos: [0, 1.26, 0], rotZ: Math.PI / 2, mat: mat({ color: 0x1e3b6a, roughness: 0.86 }) }));
  for (const lx of [-0.24, 0.24]) {
    mailbox.add(box({ name: 'mailbox.leg', size: [0.08, 0.44, 0.08], pos: [lx, 0.22, 0], mat: MAT.darkSteel, cast: false }));
  }
  mailbox.position.set(7.6, ROAD.kerbHeight, kerbLineNorth - 0.1);
  mailbox.rotation.y = -0.3;
  own(mailbox, 'mailbox', { checkSupport: false });
  add(mailbox);
  solid(7.1, kerbLineNorth - 0.6, 8.1, kerbLineNorth + 0.4, 0, 1.6);

  /* A bench outside the laundromat, on the other pavement. Nobody uses it and
   * nobody is going to; it is there because the far side of a street with
   * nothing on it at all reads as a wall with pictures of shops on it. */
  const bench = group('block.bench');
  for (const bx of [-1.1, 1.1]) {
    bench.add(box({ name: 'bench.leg', size: [0.1, 0.44, 0.5], pos: [bx, 0.22, 0], mat: MAT.darkSteel }));
  }
  bench.add(box({ name: 'bench.seat', size: [2.6, 0.09, 0.54], pos: [0, 0.48, 0], mat: MAT.wood }));
  bench.add(box({ name: 'bench.back', size: [2.6, 0.42, 0.08], pos: [0, 0.72, -0.23], mat: MAT.wood }));
  /* IT HAS TO MISS THE POLE.
   *
   * The bench used to sit at x = -3.4 with a seat 2.6 m across, which put its
   * west end at -4.7 -- and UTILITY_POLES[1] stands at exactly -4, on this
   * pavement, at this z. The pole came up through the seat. It is the sort of
   * thing that is invisible in a wide shot and impossible to unsee once the
   * player walks past it, so the position is DERIVED from the pole rather than
   * typed next to it, and the derivation is checked. */
  const benchHalf = 1.3;
  const benchX = -6.2;
  for (const pole of UTILITY_POLES) {
    if (Math.abs(pole.x - benchX) < benchHalf + 0.17 + 0.15) {
      throw new Error(
        `Special Meeting: the laundromat bench at x=${benchX} would swallow the `
        + `utility pole at x=${pole.x}`,
      );
    }
  }
  bench.position.set(benchX, ROAD.kerbHeight, kerbLineSouth + 0.5);
  bench.rotation.y = Math.PI;
  own(bench, 'bench', { checkSupport: false });
  add(bench);
  solid(benchX - benchHalf - 0.1, kerbLineSouth + 0.2, benchX + benchHalf + 0.1, kerbLineSouth + 0.8, 0, 1.0);

  for (const [nx, colour] of [[-11.4, 0x2a4a3a], [-10.7, 0x5a3a20]]) {
    const stand = group('block.newspaper-box');
    stand.add(box({ name: 'newsbox.body', size: [0.5, 0.78, 0.44], pos: [0, 0.75, 0], mat: mat({ color: colour, roughness: 0.9 }) }));
    stand.add(box({ name: 'newsbox.window', size: [0.36, 0.3, 0.04], pos: [0, 0.95, 0.23], mat: MAT.glassDark, cast: false }));
    stand.add(box({ name: 'newsbox.leg', size: [0.4, 0.36, 0.3], pos: [0, 0.18, 0], mat: MAT.darkSteel, cast: false }));
    stand.position.set(nx, ROAD.kerbHeight, kerbLineNorth - 0.2);
    own(stand, 'newspaper-box', { checkSupport: false });
    add(stand);
  }
  solid(-11.7, kerbLineNorth - 0.5, -10.4, kerbLineNorth + 0.1, 0, 1.2);

  /* ---------------------------------------------------------------- */
  /* The junctions, and the city behind them                           */
  /* ---------------------------------------------------------------- */
  const signalMats = [];
  for (const [name, x, flip] of [['west', CROSS_STREET.westX, 1], ['east', CROSS_STREET.eastX, -1]]) {
    const mast = group(`block.signal.${name}`);
    mast.add(cylinder({ name: 'signal.post', r: 0.1, h: 6.2, pos: [0, 3.1, 0], mat: MAT.darkSteel }));
    const armLength = 4.2;
    mast.add(box({
      name: 'signal.arm', size: [armLength, 0.12, 0.12],
      pos: [flip * armLength / 2, 6.0, 0], mat: MAT.darkSteel,
    }));
    const head = box({
      name: 'signal.head', size: [0.34, 0.92, 0.34],
      pos: [flip * armLength * 0.85, 5.55, 0], mat: MAT.darkSteel,
    });
    mast.add(head);
    const amberMat = lit(0xffa42a, 2.4);
    signalMats.push(amberMat);
    mast.add(box({
      name: 'signal.amber', size: [0.2, 0.2, 0.06],
      pos: [flip * armLength * 0.85, 5.55, -0.19], mat: amberMat, cast: false,
    }));
    mast.position.set(x - flip * (CROSS_STREET.halfWidth + 0.8), ROAD.kerbHeight, kerbLineNorth - 0.6);
    own(mast, 'signal', { checkSupport: false });
    add(mast);
  }
  let blink = 0;
  ticking.push((dt) => {
    blink += dt;
    /* Amber, all night, at the far ends of a street with nobody on it. Both
     * junctions on the same beat, because they are on the same controller. */
    const on = Math.sin(blink * 3.4) > 0;
    for (const material of signalMats) material.emissiveIntensity = on ? 2.4 : 0.06;
  });

  /* ---------------------------------------------------------------- */
  /* Closing the block                                                 */
  /* ---------------------------------------------------------------- */
  /* Four corner buildings and one return wall. None of them is dressed and
   * none of them is meant to be looked at: they exist because a pavement that
   * runs past the last building into open ground tells the player exactly how
   * big the set is, and this scene cannot afford him thinking about the set.
   * Their faces are on the same building lines as everything else, so from the
   * doorway the street reads as a street that keeps going. */
  /* Their east/west edges stop clear of the cross streets — a building
   * standing in a carriageway is exactly the kind of thing a player notices
   * from a doorway and cannot then stop noticing. */
  const closers = [
    ['north-east', PARKING.maxX + 0.6, -24, CROSS_STREET.eastX - 10, 9.5, MAT.brickGrey],
    ['north-west', -70, -26, CROSS_STREET.westX - 10, 15, MAT.brickBrown],
    ['south-west', -70, 26, CROSS_STREET.westX - 10, 12.5, MAT.brickBrown],
    ['south-east', CROSS_STREET.eastX + 10, 24, 70, 11, MAT.brickRed],
  ];
  for (const [name, minX, backEdge, maxX, height, material] of closers) {
    const south = name.startsWith('south');
    const front = south ? SIDEWALK.south.z1 : FACADE_Z;
    const minZ = south ? front : backEdge;
    const maxZ = south ? backEdge : front;
    const wall = boxFrom(minX, 0, minZ, maxX, height, maxZ, material, { name: `block.closer.${name}` });
    structural(own(wall, 'closer'));
    add(wall);
    solid(minX, minZ, maxX, maxZ, 0, height);
  }

  /* The gap between the building and the parking, walled and gated. Two metres
   * of brick with a steel gate in it, because the alternative is a two-metre
   * hole in the block that a curious player walks straight through. */
  const gateWall = add(boxFrom(
    APARTMENT.maxX, 0, FACADE_Z - 2.6, PARKING.minX, 2.9, FACADE_Z,
    MAT.brickRed, { name: 'block.side-gate-wall' },
  ));
  structural(own(gateWall, 'side-gate'));
  solid(APARTMENT.maxX, FACADE_Z - 2.6, PARKING.minX, FACADE_Z, 0, 2.9);
  loose(add(box({
    name: 'block.side-gate',
    size: [1.5, 2.1, 0.08],
    pos: [(APARTMENT.maxX + PARKING.minX) / 2, 1.2, FACADE_Z + 0.05],
    mat: MAT.steel,
    cast: false,
  })));

  // Walls closing both ends of the street, so the road does not run into nothing.
  for (const [name, x] of [['west', ROAD.minX - 4], ['east', ROAD.maxX + 4]]) {
    const wall = boxFrom(x - 5, 0, -46, x + 5, 26, 46, MAT.brickGrey, { name: `block.end-wall.${name}` });
    structural(own(wall, 'end-wall'));
    add(wall);
  }

  const skyline = buildSkyline();
  add(skyline.group);
  ticking.push(skyline.update);
  disposables.push(...skyline.disposables);

  /* ---------------------------------------------------------------- */
  /* Anchors and the boundary                                          */
  /* ---------------------------------------------------------------- */
  /* This is not a free-roam block and it does not pretend to be one. He is
   * held between the alley and the parking — far enough to walk the pavement
   * and look down it, close enough that he never gets to the junction and
   * finds out how thin it is out there.
   *
   * The leash is a slab across the whole street at each end, which is normal
   * and invisible. What is NOT invisible is the pavement, which is where he
   * will actually try to walk, so both ends of both pavements are boarded: a
   * plywood hoarding and a sidewalk-closed sign at the west end where the
   * building work is, chain link at the east. He gets a reason, not a wall. */
  for (const [endX, inward] of [[-38, 1], [34, -1]]) {
    for (const side of ['north', 'south']) {
      const walk = SIDEWALK[side];
      const west = endX < 0;
      const hoarding = box({
        name: `block.hoarding.${side}.${west ? 'west' : 'east'}`,
        size: [0.14, 2.4, Math.abs(walk.z1 - walk.z0) + 0.4],
        pos: [endX, ROAD.kerbHeight + 1.2, (walk.z0 + walk.z1) / 2],
        mat: west ? MAT.wood : MAT.steel,
      });
      own(hoarding, 'hoarding');
      add(hoarding);
      if (!west) continue;
      const closedTex = printed('sm.sidewalk-closed', ['SIDEWALK', 'CLOSED'], {
        w: 256, h: 256, bg: '#d8862a', fg: '#161208', font: '900 46px "Trebuchet MS", sans-serif',
        border: '#161208',
      });
      loose(add(box({
        name: 'block.hoarding.sign',
        size: [0.05, 0.7, 0.7],
        pos: [endX + inward * 0.1, ROAD.kerbHeight + 1.5, (walk.z0 + walk.z1) / 2],
        mat: mat({ map: closedTex, roughness: 0.9 }),
        cast: false,
      })));
    }
  }
  const boundaries = [
    collider([-38.2, 0, -30], [-37.8, 6, 30]),
    collider([33.8, 0, -30], [34.2, 6, 30]),
  ];
  colliders.push(...boundaries);

  anchors.entrance = new THREE.Vector3(APARTMENT.entranceX, ROAD.kerbHeight, FACADE_Z + 0.6);
  anchors.kerbMark = new THREE.Vector3(APARTMENT.entranceX, ROAD.kerbHeight, kerbLineNorth - 0.3);
  anchors.alleyMouth = new THREE.Vector3(
    (ALLEY.minX + ALLEY.maxX) / 2, ROAD.kerbHeight, ALLEY.mouthZ + 0.4,
  );
  anchors.parking = new THREE.Vector3(parkingBay(2).x, ROAD.kerbHeight, parkingBay(2).z);
  anchors.westJunction = new THREE.Vector3(CROSS_STREET.westX, 0, 0);

  scene.add(root);

  return {
    group: root,
    colliders,
    /** The two invisible slabs holding the player on the block. They are in
     * `colliders` as well; they are listed separately so anything reasoning
     * about the WORLD (a car, a verifier) can tell a leash from a building. */
    boundaries,
    /* The whole block is one surface as far as footsteps are concerned, and
     * that surface is wet pavement. */
    floorZones: [],
    lights,
    interactables,
    anchors,
    update(dt) {
      for (const tick of ticking) tick(dt);
    },
    dispose() {
      for (const item of disposables) item?.dispose?.();
      scene.remove(root);
    },
  };
}

/* -------------------------------------------------------------------- */
/* Parts                                                                 */
/* -------------------------------------------------------------------- */

/**
 * A fire escape: landings, rails, and the ladders between them.
 *
 * Built against a facade at `faceZ`, projecting in `outward` (+1 for a face
 * that looks toward +Z, −1 for one that looks the other way), centred on `x`.
 * Every part is a box; the read comes from the balustrade and the diagonals,
 * not from detail, and at night from the shadow of the whole thing on brick.
 */
function buildFireEscape({ name, x, faceZ, outward, landings, mats, own }) {
  const escape = group(name);
  const width = 2.6;
  const depth = 1.5;
  const steel = mats.steel;
  const dark = mats.darkSteel;

  for (let i = 0; i < landings.length; i++) {
    const y = landings[i];
    const zNear = faceZ + outward * 0.08;
    const zFar = faceZ + outward * depth;
    const zMid = (zNear + zFar) / 2;

    // The platform, and the grating you can see the street through.
    escape.add(box({
      name: 'fire-escape.landing', size: [width, 0.08, depth],
      pos: [x, y, zMid], mat: dark, cast: false,
    }));
    for (let s = 0; s < 5; s++) {
      escape.add(box({
        name: 'fire-escape.slat', size: [width, 0.03, 0.06],
        pos: [x, y + 0.06, zNear + outward * (0.2 + s * 0.28)], mat: steel, cast: false,
      }));
    }
    /* Balustrade. Only the OUTER edge gets rails: the inner one is the wall,
     * and a rail against brick is four boxes nobody will ever see. */
    escape.add(box({
      name: 'fire-escape.rail', size: [width, 0.05, 0.05],
      pos: [x, y + 1.05, zFar], mat: steel, cast: false,
    }));
    escape.add(box({
      name: 'fire-escape.rail.mid', size: [width, 0.04, 0.04],
      pos: [x, y + 0.58, zFar], mat: steel, cast: false,
    }));
    for (const side of [-1, 1]) {
      escape.add(box({
        name: 'fire-escape.rail.end', size: [0.05, 0.05, depth],
        pos: [x + side * width / 2, y + 1.05, zMid], mat: steel, cast: false,
      }));
      for (const zPost of [zNear, zFar]) {
        escape.add(box({
          name: 'fire-escape.post', size: [0.06, 1.1, 0.06],
          pos: [x + side * width / 2, y + 0.55, zPost], mat: steel, cast: false,
        }));
      }
      // The bracket holding the whole thing on the wall.
      const stay = box({
        name: 'fire-escape.stay', size: [0.06, 0.06, depth * 1.2],
        pos: [x + side * (width / 2 - 0.2), y - 0.4, zMid], mat: steel, cast: false,
      });
      stay.rotation.x = outward * 0.55;
      escape.add(stay);
    }

    // Ladder down to the landing below, or to the drop ladder at the bottom.
    const lower = i === 0 ? y - 2.4 : landings[i - 1];
    const run = y - lower;
    const ladder = group('fire-escape.ladder');
    const stringer = box({
      name: 'fire-escape.stringer', size: [0.06, Math.hypot(run, 1.3), 0.06],
      pos: [0, 0, 0], mat: steel, cast: false,
    });
    for (const side of [-0.3, 0.3]) {
      const rail = stringer.clone();
      rail.position.set(side, 0, 0);
      ladder.add(rail);
    }
    for (let rung = 0; rung < 6; rung++) {
      ladder.add(box({
        name: 'fire-escape.rung', size: [0.6, 0.03, 0.03],
        pos: [0, -Math.hypot(run, 1.3) / 2 + (rung + 0.5) * (Math.hypot(run, 1.3) / 6), 0],
        mat: steel, cast: false,
      }));
    }
    ladder.position.set(x + width / 2 - 0.5, (y + lower) / 2, faceZ + outward * (depth - 0.4));
    ladder.rotation.x = -outward * Math.atan2(1.3, run);
    escape.add(ladder);
  }

  /* BOLTED TO THE BUILDING, not standing on the pavement.
   *
   * This used to be a blanket `checkSupport: false, overlap: false`, and the
   * gate refuses one of those at this scale on purpose: a fire escape is 72
   * parts spanning nearly ten metres, and an opt-out that wide stops being a
   * note about one fixture and becomes a hole you could drive most of a scene
   * through. `SCENE_SCALE_SUPPRESSION` is the error, and it is a good one.
   *
   * `fixedSupportAnchor` is the narrower and truer statement: this thing is
   * held up by something the gate does not model — the wall it is bolted to —
   * and it applies per connected component, so each storey answers for
   * itself instead of the whole run being waved through at once. */
  own(escape, 'fire-escape', { fixedSupportAnchor: true });
  return escape;
}

/**
 * The city behind the block.
 *
 * Three instanced draws and no lights: the blocks, the water tanks on top of
 * them, and the aircraft-warning lights on the tall ones. The windows are a
 * 64x64 canvas used as the albedo AND the emissive map, which is what lets a
 * hundred and sixty buildings cost one material. The method is the Silver
 * Room's; it is proven at exactly this distance and this time of night.
 *
 * Nothing is placed within the set — the block, its two junctions and the
 * roads out of them — so the skyline is only ever seen over a roofline or
 * down a cross street, which is all a skyline card has to do.
 */
function buildSkyline() {
  const root = group('block.skyline');
  const disposables = [];

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 64;
  faceCanvas.height = 64;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64;
  glowCanvas.height = 64;
  const fg = faceCanvas.getContext('2d');
  const gg = glowCanvas.getContext('2d');
  fg.fillStyle = '#1c1e26';
  fg.fillRect(0, 0, 64, 64);
  gg.fillStyle = '#000';
  gg.fillRect(0, 0, 64, 64);
  const windowRnd = seeded(0x1d77c3);
  for (let wy = 0; wy < 16; wy++) {
    for (let wx = 0; wx < 8; wx++) {
      const alight = windowRnd() < 0.3;
      const px = 2 + wx * 8;
      const py = 2 + wy * 4;
      fg.fillStyle = alight ? '#8a7a52' : '#15171f';
      fg.fillRect(px, py, 5, 2);
      if (!alight) continue;
      gg.fillStyle = windowRnd() < 0.24 ? '#6c7c9a' : '#c7a35d';
      gg.fillRect(px, py, 5, 2);
    }
  }
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  for (const texture of [faceTex, glowTex]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.5, 2.4);
    disposables.push(texture);
  }
  const cityMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    emissiveMap: glowTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    roughness: 0.96,
    metalness: 0,
  });
  disposables.push(cityMat);

  const rnd = seeded(0x4c19ab);
  const clear = (x, z, w, d) => {
    // The set: the street, both junctions, and the roads leading out of them.
    if (x + w / 2 > -62 && x - w / 2 < 64 && z + d / 2 > -34 && z - d / 2 < 30) return false;
    if (Math.abs(x - CROSS_STREET.westX) < 16 || Math.abs(x - CROSS_STREET.eastX) < 16) return false;
    return true;
  };

  const lots = [];
  for (let gx = -8; gx <= 8; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      const bx = gx * 34 + (rnd() - 0.5) * 9;
      const bz = gz * 34 + (rnd() - 0.5) * 9;
      const radius = Math.hypot(bx, bz);
      if (radius > 250 || radius < 60) continue;
      if (rnd() < 0.18) continue;
      const w = 13 + rnd() * 14;
      const d = 13 + rnd() * 14;
      if (!clear(bx, bz, w, d)) continue;
      const near = Math.max(0, 1 - radius / 240);
      const h = 11 + rnd() * 16 + near * (rnd() < 0.2 ? 44 : 14);
      lots.push({ x: bx, z: bz, w, d, h, tint: 0.68 + rnd() * 0.5 });
    }
  }

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();

  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(blockGeo);
  const blocks = new THREE.InstancedMesh(blockGeo, cityMat, Math.max(1, lots.length));
  blocks.name = 'skyline.blocks';
  blocks.castShadow = false;
  blocks.receiveShadow = false;
  blocks.userData.geometryGate = { overlap: false, checkSupport: false };
  lots.forEach((lot, i) => {
    position.set(lot.x, lot.h / 2, lot.z);
    scale.set(lot.w, lot.h, lot.d);
    matrix.compose(position, quat, scale);
    blocks.setMatrixAt(i, matrix);
    colour.setHex(0x565a63).multiplyScalar(lot.tint);
    blocks.setColorAt(i, colour);
  });
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  root.add(blocks);

  const clutterCount = Math.max(1, Math.min(80, Math.floor(lots.length * 0.5)));
  const clutterGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  const clutterMat = new THREE.MeshStandardMaterial({ color: 0x36312a, roughness: 0.98 });
  disposables.push(clutterGeo, clutterMat);
  const clutter = new THREE.InstancedMesh(clutterGeo, clutterMat, clutterCount);
  clutter.name = 'skyline.rooftops';
  clutter.castShadow = false;
  clutter.userData.geometryGate = { overlap: false, checkSupport: false };
  for (let i = 0; i < clutterCount; i++) {
    const lot = lots[Math.floor(rnd() * lots.length)] ?? lots[0];
    if (!lot) break;
    const size = 2.2 + rnd() * 3;
    position.set(lot.x + (rnd() - 0.5) * lot.w * 0.5, lot.h + size / 2, lot.z + (rnd() - 0.5) * lot.d * 0.5);
    scale.set(size, size, size);
    matrix.compose(position, quat, scale);
    clutter.setMatrixAt(i, matrix);
  }
  clutter.instanceMatrix.needsUpdate = true;
  root.add(clutter);

  const tall = lots.filter((lot) => lot.h > 40);
  let warnMat = null;
  let warn = null;
  if (tall.length) {
    const warnGeo = new THREE.BoxGeometry(1, 1, 1);
    warnMat = new THREE.MeshBasicMaterial({ color: 0xd8402c, fog: false, transparent: true });
    disposables.push(warnGeo, warnMat);
    warn = new THREE.InstancedMesh(warnGeo, warnMat, tall.length);
    warn.name = 'skyline.warning-lights';
    warn.userData.geometryGate = { overlap: false, checkSupport: false };
    tall.forEach((lot, i) => {
      position.set(lot.x, lot.h + 0.7, lot.z);
      scale.set(1.2, 1.2, 1.2);
      matrix.compose(position, quat, scale);
      warn.setMatrixAt(i, matrix);
    });
    warn.instanceMatrix.needsUpdate = true;
    root.add(warn);
  }

  let t = 0;
  return {
    group: root,
    lots,
    disposables,
    update(dt) {
      if (!warnMat) return;
      t += dt;
      warnMat.opacity = 0.5 + 0.5 * Math.sin(t * 1.6);
    },
  };
}

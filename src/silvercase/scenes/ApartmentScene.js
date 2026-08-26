import * as THREE from 'three';
import {
  box, boxFrom, cylinder, sphere, plane, mat, group, collider,
} from '../../world/build.js';
import * as T from '../../world/textures.js';
import { makeMaterials } from '../../world/materials.js';
import {
  makeCouch, makeCoffeeTable, makeChair, makeKitchen, makeFridge,
} from '../../world/props.js';
import { makeCase } from '../props/case.js';

/**
 * The hallway and the apartment behind Lou's missing case — level geometry
 * only. No cast (Ape, Deke, Winston, Chester, Pruitt all live in cast/, a
 * later phase) and no mission logic: this file builds the room, hands back
 * every collider the Player controller (src/core/player.js) needs, and
 * exposes the named anchors the cast and state-machine phases place people
 * and drive beats against.
 *
 * Coordinate convention: +x runs from the hallway mouth toward the back of
 * the apartment, +z is "south" (the couch's wall), -z is "north" (the
 * bathroom/kitchen/bedroom wall). Floor is y=0 throughout.
 */

export const ROOMS = Object.freeze({
  hallway: Object.freeze({ x0: 0, x1: 6, z0: -1, z1: 1, h: 2.6 }),
  apartment: Object.freeze({ x0: 6, x1: 12, z0: -2.5, z1: 2.5, h: 2.6 }),
});

export const FRONT_DOOR = Object.freeze({
  x: 6, z: 0, width: 1.1, height: 2.2,
  hinge: Object.freeze({ x: 6, z: -0.55 }), // north jamb; swings open into the apartment
  openRotationY: Math.PI / 2 - 0.05,
});

export const BATHROOM_DOOR = Object.freeze({
  x: 11.2, z: -2.5, width: 0.9, height: 2.2,
  hinge: Object.freeze({ x: 10.75, z: -2.5 }), // west jamb, away from the kitchen counter
  openRotationY: -Math.PI / 2 + 0.05,
  /**
   * Not quite shut, which is the mission's own line about it: "The bathroom
   * door isn't quite shut." It is the tell that there is a fourth man in the
   * flat, so the door has to be visibly off the latch from the moment the
   * player is in the room — an eight-centimetre black gap at the strike side,
   * not a closed slab that the script merely claims is ajar.
   */
  ajarRotationY: -0.09,
});

// Every position later phases (cast/, state/) need, settled now so nothing
// downstream has to re-derive them.
//
// `yaw` is authored in ONE of two conventions depending on who it is meant
// for, because the two rigs in this codebase disagree about which way angle
// 0 faces:
//   - Player.js (the camera): forward = (-sin(yaw), 0, -cos(yaw)) -> 0 is -z.
//   - core/person.js's Person: facing = (sin(heading), 0, cos(heading)) ->
//     0 is +z, exactly the opposite sign convention.
// hallwaySpawn/frontDoorInside are camera checkpoints (Player-yaw); the seat
// and doorway anchors are for cast/'s Person-based NPCs (Person-heading).
export const ANCHORS = Object.freeze({
  hallwaySpawn: Object.freeze({ x: 0.8, y: 0, z: 0, yaw: -Math.PI / 2 }), // camera yaw
  frontDoorInside: Object.freeze({ x: 6.6, y: 0, z: 0, yaw: 0 }), // camera yaw
  // The two seat anchors are a figure's BASE, not the cushion height: the
  // shared builder's `Npc.sit()` folds a figure and drops it 0.42 from its
  // base onto a 0.53 m cushion (see STOOL_SIT's note in src/bing/cast.js).
  // The couch's cushions sit at 0.54 and the chair's at 0.53, so both bases
  // are effectively the floor. Handing this rig the cushion height instead
  // parks a man 46 cm in the air.
  // Four centimetres toward the cushion back keeps the connected seated-death
  // rig supported by the couch after its pelvis-pivot slump. At 1.94 the live
  // pose looked seated, but the settled body retained only a 38 cm contact band
  // and visually read as having slid off the front edge.
  couchSeat: Object.freeze({ x: 8.42, y: 0.01, z: 1.98, yaw: Math.PI }), // heading, faces -z (north)
  chairSeat: Object.freeze({ x: 8, y: 0, z: -1.2, yaw: 0 }), // heading, faces +z (south)
  kitchenSpot: Object.freeze({ x: 10.6, y: 0, z: -0.1, yaw: -Math.PI / 2 }), // Person heading, faces -x
  bathroomDoorway: Object.freeze({ x: 11.2, y: 0, z: -2.4, yaw: 0 }), // Person heading, faces +z (into the room)
  caseSpot: Object.freeze({ x: 9.6, y: 0.05, z: 1.6 }),
  // In FRONT of the couch, not inside it. The couch is a 2.15 m run centred on
  // x=8 with its front face at z=1.60 (see the COUCH block below); the table is
  // 1.20 x 0.62, so at the old (9.0, 1.6) its near half was buried in the
  // cushions and its long axis was hanging off the end of the couch. Centred on
  // the couch and 0.34 m clear of its front edge — a small flat's knee gap the
  // player's 0.30 m capsule can still cross — the whole living half of the
  // flat reads as one arrangement.
  coffeeTableSpot: Object.freeze({ x: 8.0, y: 0, z: 0.95 }),
  // The west wall's inner face is x=6.10. A 9 cm-deep set centred at 6.165
  // leaves the repo-standard 2 cm service gap instead of burying its back
  // 8.5 cm into the plaster.
  tvSpot: Object.freeze({ x: 6.165, y: 1.55, z: -1.6 }),
  fridgeSpot: Object.freeze({ x: 11.64, y: 0, z: 1.95 }),
  // On the wall's west segment, well clear of the bathroom doorway. The
  // brief's own "(e.g. z=-1.2)" would sit mid-room rather than on the wall
  // plane (z=-2.5); read as the intended clearance from the bathroom rather
  // than a literal z, and placed here instead — see the written report.
  bedroomDoor: Object.freeze({ x: 7.4, y: 0, z: -2.5 }),
});

export function buildApartmentScene() {
  const root = new THREE.Group();
  root.name = 'silvercaseApartment';

  const colliders = [];
  const interactables = [];

  /** Build a wall box and register its collider in one step. */
  function wallBox(x0, y0, z0, x1, y1, z1, m, supportAssemblyId) {
    const mesh = boxFrom(x0, y0, z0, x1, y1, z1, m);
    mesh.name = 'silvercase.apartment.shell-panel';
    mesh.userData.geometryGate = {
      structural: true,
      wall: true,
      fixedSupportAnchor: true,
      supportAssemblyId,
    };
    root.add(mesh);
    // Shell pieces are authored to meet exactly; player padding belongs on
    // standalone furniture, not on every adjoining wall segment.
    colliders.push(collider([x0, y0, z0], [x1, y1, z1], 0));
    return mesh;
  }

  // ---------------- materials ----------------
  // M is the shared apartment palette world/props.js's reused builders
  // (couch/coffee table/chair/kitchen/fridge) expect; M2 is this mission's
  // own grungier, mission-local set for the walls, floor, doors and clutter
  // it builds directly. Both are fully procedural (canvas textures via
  // world/textures.js) — no external image files.
  const M = makeMaterials();

  const wallTex = T.wallPaint('#6f6858');
  wallTex.repeat.set(5, 1.6);
  const floorTex = T.woodFloor();
  floorTex.repeat.set(9, 8);
  const hallFloorTex = T.tileTex(10, '#221d18', '#37312a');
  hallFloorTex.repeat.set(5, 2);
  const ceilTex = T.ceilingTex();
  ceilTex.repeat.set(6, 5);

  const M2 = {
    wall: mat({ map: wallTex, roughness: 0.96 }),
    wallDark: mat({ color: 0x241f1a, roughness: 0.94 }),
    floor: mat({ map: floorTex, roughness: 0.92 }),
    hallFloor: mat({ map: hallFloorTex, roughness: 0.88 }),
    ceiling: mat({ map: ceilTex, roughness: 1 }),
    doorWood: mat({ map: T.laminate('#3a2c1e'), roughness: 0.62 }),
    doorWorn: mat({ map: T.laminate('#4a3524'), roughness: 0.74 }),
    doorPanel: mat({ color: 0x2b2015, roughness: 0.7 }),
    doorFrame: mat({ color: 0x14100c, roughness: 0.7 }),
    trim: mat({ color: 0x2b2117, roughness: 0.72 }),
    brass: mat({ color: 0x9a7a3a, roughness: 0.42, metalness: 0.7 }),
    radiator: mat({ color: 0xb9b3a4, roughness: 0.62, metalness: 0.25 }),
    extinguisher: mat({ color: 0x8e2418, roughness: 0.48, metalness: 0.3 }),
    doormat: mat({ color: 0x2a2622, roughness: 1 }),
    paper: mat({ color: 0xb3ab97, roughness: 0.96 }),
    shade: mat({ color: 0xd8c9a8, roughness: 0.95, side: THREE.DoubleSide }),
    blind: mat({ color: 0xb9b09a, roughness: 0.98 }),
    rug: mat({ map: T.rugTex(), roughness: 1 }),
    dark: mat({ color: 0x07070a, roughness: 1 }),
    bag: mat({ color: 0x3a3226, roughness: 0.96 }),
    grip: mat({ color: 0x17140f, roughness: 0.55 }),
    batWood: mat({ color: 0x8a6a3a, roughness: 0.55 }),
    takeout: mat({ color: 0xd8cdb0, roughness: 0.92 }),
    takeoutDark: mat({ color: 0x8c6a3c, roughness: 0.9 }),
    glassRim: mat({
      color: 0xcfd8e0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.5,
    }),
  };
  // Mutated every frame (flicker), so built directly rather than through the
  // shared mat() cache.
  const tvScreen = mat({
    color: 0x050506, roughness: 0.6, emissive: 0x14232b, emissiveIntensity: 0.35, unique: true,
  });

  // ---------------- floors + ceilings ----------------
  const H = ROOMS.hallway;
  const hallFloor = plane(H.x1 - H.x0, H.z1 - H.z0, M2.hallFloor);
  hallFloor.name = 'silvercase.hallway.floor';
  hallFloor.userData.geometryGate = { structural: true, fixedSupportAnchor: true, supportAssemblyId: 'silvercase.shell.hallway' };
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set((H.x0 + H.x1) / 2, 0, (H.z0 + H.z1) / 2);
  root.add(hallFloor);
  const hallCeil = plane(H.x1 - H.x0, H.z1 - H.z0, M2.ceiling);
  hallCeil.name = 'silvercase.hallway.ceiling';
  hallCeil.userData.geometryGate = { structural: true, fixedSupportAnchor: true, supportAssemblyId: 'silvercase.shell.hallway' };
  hallCeil.rotation.x = Math.PI / 2;
  hallCeil.position.set((H.x0 + H.x1) / 2, H.h, (H.z0 + H.z1) / 2);
  root.add(hallCeil);

  const A = ROOMS.apartment;
  const aptFloor = plane(A.x1 - A.x0, A.z1 - A.z0, M2.floor);
  aptFloor.name = 'silvercase.apartment.floor';
  aptFloor.userData.geometryGate = { structural: true, fixedSupportAnchor: true, supportAssemblyId: 'silvercase.shell.apartment' };
  aptFloor.rotation.x = -Math.PI / 2;
  aptFloor.position.set((A.x0 + A.x1) / 2, 0, (A.z0 + A.z1) / 2);
  root.add(aptFloor);
  const aptCeil = plane(A.x1 - A.x0, A.z1 - A.z0, M2.ceiling);
  aptCeil.name = 'silvercase.apartment.ceiling';
  aptCeil.userData.geometryGate = { structural: true, fixedSupportAnchor: true, supportAssemblyId: 'silvercase.shell.apartment' };
  aptCeil.rotation.x = Math.PI / 2;
  aptCeil.position.set((A.x0 + A.x1) / 2, A.h, (A.z0 + A.z1) / 2);
  root.add(aptCeil);

  // ---------------- hallway shell ----------------
  wallBox(H.x0, 0, H.z0 - 0.2, H.x1 - 0.1, H.h, H.z0, M2.wall, 'silvercase.shell.hallway');
  wallBox(H.x0, 0, H.z1, H.x1 - 0.1, H.h, H.z1 + 0.2, M2.wall, 'silvercase.shell.hallway');
  wallBox(H.x0 - 0.2, 0, H.z0 - 0.2, H.x0, H.h, H.z1 + 0.2, M2.wallDark, 'silvercase.shell.hallway');

  // ---------------- hallway dressing ----------------
  //
  // This used to be a bare tube: two flat walls, three identical doors along
  // one of them, and a bulb close enough to the ceiling to burn a white hole
  // in it. It is the first thing the player walks down and it has to read as a
  // building somebody lives in — so it gets what a real walk-up corridor has.
  // All of it is decoration: nothing here takes a collider beyond the walls
  // that were already there, and nothing here is interactive.

  /** A small lettered plate — brass unit numbers, and the EXIT over the stairs. */
  const plateTexCache = new Map();
  function plateTexture(text, {
    bg = '#231e18', fg = '#c9a24a', font = 'bold 34px Georgia, serif',
  } = {}) {
    const key = `${text}|${bg}|${fg}|${font}`;
    if (!plateTexCache.has(key)) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 48;
      const g = c.getContext('2d');
      g.fillStyle = bg;
      g.fillRect(0, 0, 96, 48);
      g.fillStyle = fg;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 48, 26);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      plateTexCache.set(key, tex);
    }
    return plateTexCache.get(key);
  }
  const unitNumberTexture = (text) => plateTexture(text);

  /**
   * One neighbour's front door. `side` is -1 for the north wall (facing +z)
   * and +1 for the south wall (facing -z).
   */
  const hallwayDoors = [];
  function hallwayDoor(dx, side, unit, { mat: leafMat = M2.doorWood, mail = false } = {}) {
    const d = group('hallwayDoor');
    d.userData.geometryGate = {
      assemblyId: `silvercase.hallway-door.${unit}`,
    };
    d.add(box({ size: [0.85, 2.05, 0.04], pos: [0, 1.05, 0], mat: leafMat }));
    // The casing goes BEHIND the leaf in the door's own local frame — the
    // whole group is turned 180° for the south wall, so this must not be
    // flipped by `side` as well or the dark frame lands in front of the door
    // and every neighbour's flat reads as a black hole in the plaster.
    d.add(box({ size: [0.95, 2.2, 0.04], pos: [0, 1.12, -0.02], mat: M2.doorFrame }));
    // Two panels, so a door is not one slab.
    for (const py of [0.62, 1.48]) {
      d.add(box({ size: [0.58, 0.62, 0.012], pos: [0, py, 0.026], mat: M2.doorPanel }));
    }
    d.add(cylinder({ r: 0.016, h: 0.055, pos: [0.31, 1.0, 0.04], rotX: Math.PI / 2, mat: M.chrome }));
    // Peephole, deadbolt, and the number.
    d.add(cylinder({ r: 0.012, h: 0.02, pos: [0, 1.56, 0.035], rotX: Math.PI / 2, mat: M2.brass }));
    d.add(box({ size: [0.05, 0.09, 0.02], pos: [0.3, 1.2, 0.035], mat: M2.brass }));
    const plate = plane(0.17, 0.085, mat({ map: unitNumberTexture(unit), roughness: 0.55 }));
    plate.position.set(-0.005, 1.72, 0.032);
    d.add(plate);
    if (mail) {
      d.add(box({ size: [0.3, 0.055, 0.02], pos: [0, 0.98, 0.033], mat: M2.brass }));
      // A doormat that has not been beaten since the tenant moved in.
      const matRug = plane(0.7, 0.42, M2.doormat);
      matRug.rotation.x = -Math.PI / 2;
      matRug.position.set(dx, 0.014, (side < 0 ? H.z0 : H.z1) - side * 0.36);
      root.add(matRug);
    }
    // Keep the casing flush to the plaster instead of embedding it four
    // centimetres through the wall and both moulding rails.
    d.position.set(dx, 0, (side < 0 ? H.z0 : H.z1) + side * -0.06);
    d.rotation.y = side < 0 ? 0 : Math.PI;
    root.add(d);
    hallwayDoors.push(d);
    return d;
  }

  hallwayDoor(1.15, -1, '2A', { mail: true });
  hallwayDoor(3.9, -1, '2C');
  hallwayDoor(2.4, 1, '2B', { mat: M2.doorWorn });
  hallwayDoor(5.0, 1, '2D', { mail: true });

  // Skirting and a picture rail down both sides, the two mouldings that stop
  // a corridor reading as a cardboard box.
  for (const [z0, z1] of [[H.z0 - 0.02, H.z0 + 0.03], [H.z1 - 0.03, H.z1 + 0.02]]) {
    const skirting = boxFrom(H.x0 - 0.15, 0, z0, H.x1, 0.13, z1, M2.trim);
    const pictureRail = boxFrom(H.x0 - 0.15, 1.06, z0, H.x1, 1.11, z1, M2.trim);
    for (const moulding of [skirting, pictureRail]) {
      moulding.name = 'silvercase.apartment.shell-moulding';
      moulding.userData.geometryGate = {};
      root.add(moulding);
    }
  }

  // The runner. Worn strip down the middle, stopping short of both ends.
  const runnerTex = T.rugTex();
  runnerTex.repeat.set(1, 8);
  const runner = plane(1.2, 5.4, mat({ map: runnerTex, roughness: 1 }));
  runner.rotation.x = -Math.PI / 2;
  runner.rotation.z = Math.PI / 2;
  runner.position.set(2.9, 0.015, 0);
  root.add(runner);

  // The mailbox bank, on the end cap you have your back to when you arrive.
  const boxes = group('mailboxes');
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      boxes.add(box({
        size: [0.03, 0.19, 0.17],
        pos: [0, 1.05 + row * 0.21, -0.42 + col * 0.24],
        mat: M2.brass,
      }));
      boxes.add(box({
        size: [0.012, 0.02, 0.05],
        pos: [0.02, 1.05 + row * 0.21, -0.36 + col * 0.24],
        mat: M2.doorFrame,
      }));
    }
  }
  boxes.position.set(H.x0 + 0.03, 0, 0);
  root.add(boxes);

  // A radiator under the picture rail and an extinguisher on a real wall
  // bracket, rather than two cylinders hanging 6.5 cm off the plaster.
  const rad = group('radiator');
  rad.userData.geometryGate = { assemblyId: 'silvercase.radiator' };
  for (let i = 0; i < 11; i++) {
    rad.add(box({ size: [0.05, 0.52, 0.06], pos: [i * 0.062, 0.4, 0], mat: M2.radiator }));
  }
  rad.add(box({ size: [0.72, 0.05, 0.09], pos: [0.31, 0.68, 0], mat: M2.radiator }));
  // Two real feet carry the radiator to the floor instead of asking a support
  // annotation to bridge fourteen centimetres of empty air.
  for (const x of [0.06, 0.56]) {
    const foot = box({ size: [0.04, 0.14, 0.04], pos: [x, 0.071, 0], mat: M2.radiator });
    foot.name = 'radiator-foot';
    rad.add(foot);
  }
  rad.position.set(3.05, 0, H.z1 - 0.09);
  root.add(rad);
  const extinguisher = group('fire-extinguisher');
  extinguisher.userData.geometryGate = {
    assemblyId: 'silvercase.fire-extinguisher',
  };
  // Clear unit 2C's casing; the old x=4.35 put the bottle and brackets
  // through the door's strike-side edge.
  extinguisher.add(box({ size: [0.15, 0.04, 0.08], pos: [4.65, 0.87, H.z0 + 0.03], mat: M2.doorFrame }));
  extinguisher.add(box({ size: [0.15, 0.04, 0.08], pos: [4.65, 1.03, H.z0 + 0.03], mat: M2.doorFrame }));
  extinguisher.add(cylinder({ r: 0.055, h: 0.34, pos: [4.65, 0.95, H.z0 + 0.12], mat: M2.extinguisher }));
  extinguisher.add(cylinder({ r: 0.02, h: 0.12, pos: [4.65, 1.18, H.z0 + 0.12], mat: M2.doorFrame }));
  root.add(extinguisher);

  // Somebody's recycling, and last week's free paper nobody took in.
  root.add(box({ size: [0.3, 0.26, 0.3], pos: [0.55, 0.13, H.z1 - 0.22], mat: M2.bag, rotY: 0.3 }));
  root.add(box({ size: [0.24, 0.03, 0.31], pos: [2.42, 0.03, H.z1 - 0.42], mat: M2.paper, rotY: -0.5 }));
  root.add(box({ size: [0.22, 0.02, 0.29], pos: [2.5, 0.055, H.z1 - 0.36], mat: M2.paper, rotY: 0.2 }));
  root.add(box({ size: [0.34, 0.02, 0.26], pos: [5.05, 0.03, H.z1 - 0.44], mat: M2.takeout, rotY: 0.9 }));

  // Ceiling fixtures. The lights live INSIDE these rather than 20 cm below a
  // bare ceiling, which is what used to burn a white disc into the plaster.
  function ceilingFixture(x, z, ceilY, { colour = 0xffd9a0, intensity = 4.6, range = 7 } = {}) {
    const fixture = group('ceilingFixture');
    fixture.add(cylinder({ r: 0.16, h: 0.04, pos: [0, ceilY - 0.02, 0], mat: M2.trim }));
    // `unique` because a flickering fixture writes to this every frame, and
    // world/build.js's mat() cache would otherwise hand the same material to
    // all four of them (see its own note about cloning before mutating).
    const glass = sphere({
      r: 0.15,
      ry: 0.1,
      pos: [0, ceilY - 0.11, 0],
      mat: mat({
        color: 0xfff2d4, roughness: 0.5, emissive: 0xffdca6, emissiveIntensity: 1.6, unique: true,
      }),
      cast: false,
    });
    fixture.add(glass);
    fixture.position.set(x, 0, z);
    root.add(fixture);
    const lamp = new THREE.PointLight(colour, intensity, range, 2);
    // Below the diffuser rather than level with it: a source parked 2 cm off
    // the plaster is what burned the white disc into the old ceiling.
    lamp.position.set(x, ceilY - 0.3, z);
    root.add(lamp);
    return {
      fixture, glass, lamp, baseIntensity: intensity,
    };
  }
  ceilingFixture(1.6, 0, H.h, { intensity: 3.2, range: 6.5 });
  // The one that has been on its way out since the spring.
  const flickerLamp = ceilingFixture(4.5, 0, H.h, { colour: 0xdfe6ff, intensity: 3.6, range: 7 });

  // EXIT, over the stairs you came up.
  const exitTex = plateTexture('EXIT', {
    bg: '#3a0d0a', fg: '#ffd9d2', font: 'bold 30px "Trebuchet MS", sans-serif',
  });
  const exitSign = group('exitSign');
  exitSign.userData.geometryGate = { assemblyId: 'silvercase.exit-sign' };
  exitSign.add(box({ size: [0.04, 0.16, 0.36], pos: [0, 0, 0], mat: M2.trim }));
  // The sign hangs from the 2.6m hallway ceiling through a visible stem.
  const exitStem = box({ size: [0.04, 0.24, 0.04], pos: [0, 0.2, 0], mat: M2.brass });
  exitStem.name = 'exit-sign-ceiling-stem';
  exitSign.add(exitStem);
  const exitFace = plane(0.32, 0.13, mat({
    map: exitTex, roughness: 0.6, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 1.9,
  }));
  exitFace.position.set(0.026, 0, 0);
  exitFace.rotation.y = Math.PI / 2;
  exitSign.add(exitFace);
  exitSign.position.set(H.x0 + 0.08, 2.28, 0);
  root.add(exitSign);

  // ---------------- apartment shell ----------------
  // West wall, shared with the hallway mouth, split around the front door.
  wallBox(A.x0 - 0.1, 0, A.z0, A.x0 + 0.1, A.h, FRONT_DOOR.z - FRONT_DOOR.width / 2, M2.wall, 'silvercase.shell.apartment');
  wallBox(A.x0 - 0.1, 0, FRONT_DOOR.z + FRONT_DOOR.width / 2, A.x0 + 0.1, A.h, A.z1, M2.wall, 'silvercase.shell.apartment');
  // Corners butt at their physical faces instead of crossing through each other.
  wallBox(A.x0 + 0.1, 0, A.z1, A.x1 - 0.1, A.h, A.z1 + 0.2, M2.wall, 'silvercase.shell.apartment');
  wallBox(A.x1 - 0.1, 0, A.z0, A.x1 + 0.1, A.h, A.z1, M2.wallDark, 'silvercase.shell.apartment');
  const bathX0 = BATHROOM_DOOR.hinge.x;
  const bathX1 = BATHROOM_DOOR.hinge.x + BATHROOM_DOOR.width;
  wallBox(A.x0 + 0.1, 0, A.z0 - 0.2, bathX0 - 0.1, A.h, A.z0, M2.wall, 'silvercase.shell.apartment');
  wallBox(bathX1 + 0.1, 0, A.z0 - 0.2, A.x1 - 0.1, A.h, A.z0, M2.wall, 'silvercase.shell.apartment');

  // Decorative bedroom door — closed, non-interactive, never opens. Not
  // registered as an interactable at all, which is the "hitbox absent"
  // option the brief allows for a door the player is never meant to open.
  const bedroomDoor = group('bedroomDoor');
  bedroomDoor.userData.geometryGate = {
    assemblyId: 'silvercase.bedroom-door',
  };
  bedroomDoor.add(box({ size: [0.85, 2.05, 0.04], pos: [0, 1.05, 0], mat: M2.doorWood }));
  bedroomDoor.add(box({ size: [0.95, 2.2, 0.06], pos: [0, 1.12, -0.03], mat: M2.doorFrame }));
  for (const py of [0.62, 1.48]) {
    bedroomDoor.add(box({ size: [0.58, 0.62, 0.012], pos: [0, py, 0.026], mat: M2.doorPanel }));
  }
  bedroomDoor.add(cylinder({
    r: 0.016, h: 0.055, pos: [0.31, 1.0, 0.04], rotX: Math.PI / 2, mat: M.chrome,
  }));
  // Flush the casing to the north wall's room face rather than sinking its
  // back four centimetres into the plaster.
  bedroomDoor.position.set(ANCHORS.bedroomDoor.x, 0, A.z0 + 0.06);
  root.add(bedroomDoor);

  // ---------------- the window over the couch ----------------
  // The flat used to be four blank walls with no daylight and no night
  // either. One window on the south wall — clear of the couch, blind half
  // down, the block across the street lit up behind it — is what tells the
  // player what time it is and gives the room a wall worth looking at.
  // Cloned: world/textures.js memoises the skyline, and cropping the shared
  // instance's repeat/offset would crop it everywhere else in the game too.
  const cityTex = T.citySkyline('night').clone();
  cityTex.needsUpdate = true;
  cityTex.wrapS = THREE.RepeatWrapping;
  cityTex.repeat.set(0.35, 0.75);
  cityTex.offset.set(0.2, 0.2);
  const cityPane = plane(1.3, 0.95, mat({
    map: cityTex, roughness: 1, emissive: 0xffffff, emissiveMap: cityTex, emissiveIntensity: 0.55,
  }));
  cityPane.position.set(10.25, 1.62, A.z1 - 0.02);
  cityPane.rotation.y = Math.PI;
  root.add(cityPane);
  const windowFrame = group('window');
  windowFrame.userData.geometryGate = { assemblyId: 'silvercase.window' };
  for (const [sx, sy, w, h] of [[0, -0.52, 1.44, 0.08], [0, 0.52, 1.44, 0.08],
    [-0.7, 0, 0.06, 1.04], [0.7, 0, 0.06, 1.04], [0, 0, 1.4, 0.05]]) {
    windowFrame.add(box({ size: [w, h, 0.07], pos: [sx, sy, 0], mat: M2.trim }));
  }
  // The blind, pulled down to about the transom and left there.
  windowFrame.add(box({ size: [1.34, 0.34, 0.03], pos: [0, 0.36, -0.05], mat: M2.blind }));
  windowFrame.add(box({ size: [1.36, 0.05, 0.05], pos: [0, 0.17, -0.05], mat: M2.trim }));
  windowFrame.position.set(10.25, 1.62, A.z1 - 0.06);
  root.add(windowFrame);
  // Sill, and the cold light the street throws back into the room.
  const windowSill = box({ size: [1.5, 0.05, 0.16], pos: [10.25, 1.08, A.z1 - 0.08], mat: M2.trim });
  windowSill.name = 'silvercase.window.sill';
  windowSill.userData.geometryGate = { assemblyId: 'silvercase.window' };
  root.add(windowSill);
  const streetSpill = new THREE.PointLight(0x8fa6d8, 1.4, 4.5, 2);
  streetSpill.position.set(10.25, 1.62, A.z1 - 0.35);
  root.add(streetSpill);

  // ---------------- the front door ----------------
  const frontDoorPivot = new THREE.Group();
  frontDoorPivot.name = 'frontDoorPivot';
  frontDoorPivot.position.set(FRONT_DOOR.hinge.x, 0, FRONT_DOOR.hinge.z);
  const frontDoorLeaf = box({
    size: [0.06, FRONT_DOOR.height, FRONT_DOOR.width],
    pos: [0, FRONT_DOOR.height / 2, FRONT_DOOR.width / 2],
    mat: M2.doorWood,
  });
  frontDoorPivot.add(frontDoorLeaf);
  frontDoorPivot.add(cylinder({
    r: 0.016, h: 0.3, pos: [0.06, FRONT_DOOR.height / 2, FRONT_DOOR.width - 0.1], mat: M.chrome,
  }));
  // The one door in the corridor the player is going to knock on. Same
  // panelling, number plate and hardware as the neighbours, so it reads as
  // one of them rather than as a slab — plus the extra locks that say the
  // people behind it have something to lose.
  for (const py of [0.62, 1.5]) {
    frontDoorPivot.add(box({
      size: [0.014, 0.62, 0.6], pos: [-0.035, py, FRONT_DOOR.width / 2], mat: M2.doorPanel,
    }));
  }
  const frontPlate = plane(0.17, 0.085, mat({ map: unitNumberTexture('2E'), roughness: 0.55 }));
  frontPlate.position.set(-0.041, 1.74, FRONT_DOOR.width / 2);
  frontPlate.rotation.y = -Math.PI / 2;
  frontDoorPivot.add(frontPlate);
  frontDoorPivot.add(cylinder({
    r: 0.012, h: 0.02, pos: [-0.036, 1.58, FRONT_DOOR.width / 2], rotZ: Math.PI / 2, mat: M2.brass,
  }));
  for (const ly of [1.16, 1.34]) {
    frontDoorPivot.add(box({
      size: [0.02, 0.075, 0.05], pos: [-0.04, ly, FRONT_DOOR.width - 0.12], mat: M2.brass,
    }));
  }
  root.add(frontDoorPivot);
  const frontMat = plane(0.42, 0.72, M2.doormat);
  frontMat.rotation.x = -Math.PI / 2;
  frontMat.position.set(FRONT_DOOR.x - 0.42, 0.016, FRONT_DOOR.z);
  root.add(frontMat);

  const frontDoorCollider = collider(
    [FRONT_DOOR.x - 0.1, 0, FRONT_DOOR.z - FRONT_DOOR.width / 2],
    [FRONT_DOOR.x + 0.1, FRONT_DOOR.height, FRONT_DOOR.z + FRONT_DOOR.width / 2],
    0,
  );
  colliders.push(frontDoorCollider);

  const frontDoorHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, FRONT_DOOR.height, FRONT_DOOR.width + 0.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  frontDoorHit.name = 'frontDoor';
  frontDoorHit.position.set(FRONT_DOOR.x, FRONT_DOOR.height / 2, FRONT_DOOR.z);
  root.add(frontDoorHit);
  interactables.push(frontDoorHit);

  // ---------------- the bathroom door + shallow alcove ----------------
  // The one door in this flat the mission asks the player to read, and it used
  // to be a single 6 cm slab of laminate with no casing, no hardware and no
  // panels — indistinguishable from a cupboard, in a beat whose whole point is
  // that somebody is behind it. It now gets what every other door in this level
  // already had (two sunk panels, a lined casing, a knob) plus the two things
  // only this one needs: a strike-side edge dark enough to read as a gap when
  // it sits ajar, and a light behind it.
  const bathDoorPivot = new THREE.Group();
  bathDoorPivot.name = 'bathDoorPivot';
  bathDoorPivot.userData.geometryGate = { assemblyId: 'silvercase.bathroom-door-installation' };
  bathDoorPivot.position.set(BATHROOM_DOOR.hinge.x, 0, BATHROOM_DOOR.hinge.z);
  const BW = BATHROOM_DOOR.width;
  const BH = BATHROOM_DOOR.height;
  const bathDoorLeaf = box({
    size: [BW, BH, 0.06],
    pos: [BW / 2, BH / 2, 0],
    mat: M2.doorWorn,
  });
  bathDoorPivot.add(bathDoorLeaf);
  // Two sunk panels on each face, so it is a door from the room AND from the
  // bathroom side once it is standing open in the middle of the floor.
  for (const py of [0.62, 1.5]) {
    for (const pz of [0.032, -0.032]) {
      bathDoorPivot.add(box({
        size: [BW - 0.24, 0.6, 0.014], pos: [BW / 2, py, pz], mat: M2.doorPanel,
      }));
    }
  }
  // Knob and its rose, both sides, on the strike side away from the hinge.
  for (const pz of [0.05, -0.05]) {
    bathDoorPivot.add(cylinder({
      r: 0.028, h: 0.05, pos: [BW - 0.08, 1.0, pz], rotX: Math.PI / 2, mat: M2.brass,
    }));
    bathDoorPivot.add(cylinder({
      r: 0.042, h: 0.012, pos: [BW - 0.08, 1.0, pz * 0.6], rotX: Math.PI / 2, mat: M2.brass,
    }));
  }
  // Privacy bolt on the room side, and three hinges on the jamb side.
  bathDoorPivot.add(box({ size: [0.05, 0.075, 0.02], pos: [BW - 0.08, 1.2, 0.04], mat: M2.brass }));
  for (const hy of [0.32, 1.1, 1.88]) {
    const hinge = box({ size: [0.03, 0.11, 0.075], pos: [0.02, hy, 0], mat: M2.brass });
    hinge.name = 'bath-door-hinge';
    bathDoorPivot.add(hinge);
  }
  root.add(bathDoorPivot);

  // Casing around the opening, on the room side — the thing that makes a hole
  // in a wall read as a doorway. Sits just proud of the wall plane (A.z0) so it
  // never z-fights with it, and stops short of the leaf's swing.
  const bathCasing = group('bathroomCasing');
  bathCasing.userData.geometryGate = { assemblyId: 'silvercase.bathroom-door-installation' };
  bathCasing.add(box({ size: [0.07, BH + 0.09, 0.05], pos: [bathX0 - 0.03, (BH + 0.09) / 2, 0.03], mat: M2.trim }));
  bathCasing.add(box({ size: [0.07, BH + 0.09, 0.05], pos: [bathX1 + 0.03, (BH + 0.09) / 2, 0.03], mat: M2.trim }));
  bathCasing.add(box({ size: [BW + 0.2, 0.09, 0.05], pos: [(bathX0 + bathX1) / 2, BH + 0.045, 0.03], mat: M2.trim }));
  // The head jamb and the sill line inside the reveal, so the opening has
  // depth rather than being a cut in a card.
  bathCasing.add(box({ size: [BW, 0.04, 0.16], pos: [(bathX0 + bathX1) / 2, BH, -0.06], mat: M2.doorFrame }));
  bathCasing.add(box({ size: [BW, 0.02, 0.14], pos: [(bathX0 + bathX1) / 2, 0.01, -0.05], mat: M2.trim }));
  bathCasing.position.set(0, 0, A.z0);
  root.add(bathCasing);

  // One dim bulb behind it, because a bathroom nobody has switched off is what
  // puts a line of light down an ajar door — and what makes it obvious the
  // door moved when it comes off the latch.
  const bathGlow = new THREE.PointLight(0xbfd0e0, 1.2, 2.0, 2);
  bathGlow.position.set((bathX0 + bathX1) / 2, 1.75, A.z0 - 0.42);
  root.add(bathGlow);

  // Off the latch from the start. Not decoration: it is the mission's own clue
  // ("The bathroom door isn't quite shut"), and the beat that follows is a man
  // coming through it.
  bathDoorPivot.rotation.y = BATHROOM_DOOR.ajarRotationY;

  const bathDoorCollider = collider(
    [bathX0 + 0.1, 0, A.z0 - 0.1], [bathX1 - 0.1, BATHROOM_DOOR.height, A.z0 + 0.1], 0,
  );
  colliders.push(bathDoorCollider);

  // Shallow, unlit alcove — just enough depth for the door to swing and
  // someone to burst out of it. No modelled interior: same
  // never-show-contents rule as the case, enforced here by simply never
  // building anything back there to see.
  const ALC_DEPTH = 0.7;
  const alcBack = A.z0 - ALC_DEPTH;
  wallBox(bathX0 - 0.1, 0, alcBack, bathX0 + 0.1, A.h, A.z0, M2.dark, 'silvercase.shell.apartment');
  wallBox(bathX1 - 0.1, 0, alcBack, bathX1 + 0.1, A.h, A.z0, M2.dark, 'silvercase.shell.apartment');
  wallBox(bathX0 + 0.1, 0, alcBack - 0.1, bathX1 - 0.1, A.h, alcBack, M2.dark, 'silvercase.shell.apartment');
  const alcFloor = plane(bathX1 - bathX0, ALC_DEPTH, M2.dark);
  alcFloor.name = 'silvercase.bathroom-alcove.floor';
  alcFloor.userData.geometryGate = { structural: true, fixedSupportAnchor: true, supportAssemblyId: 'silvercase.shell.apartment' };
  alcFloor.rotation.x = -Math.PI / 2;
  alcFloor.position.set((bathX0 + bathX1) / 2, 0, A.z0 - ALC_DEPTH / 2);
  root.add(alcFloor);

  // ---------------- couch (against the south wall, facing north) ----------
  // makeCouch bakes its (x,z) straight into its children's coordinates
  // rather than positioning a group, so it is built at the origin and then
  // wrapped in a rotated/translated group — the same swapped-half-extents
  // trick makeCoffeeTable already uses internally for its own bounds.
  // z puts the back plane at 2.48, two centimetres clear of the south wall's
  // inner face (A.z1 = 2.5) — the stand-off the repo's furniture keeps against
  // walls (docs/NO-WAKE-PRODUCTION.md, "Two centimetres, everywhere") —
  // rather than 14 cm inside it, rear feet and all.
  const COUCH = { x: 8, z: 2.04 };
  const COUCH_LEN = 2.15;
  const COUCH_DEPTH = 0.88;
  const couchBuilt = makeCouch(M, { x: 0, z: 0, len: COUCH_LEN, depth: COUCH_DEPTH });
  const couchGroup = new THREE.Group();
  couchGroup.name = 'couch';
  couchGroup.userData.geometryGate = { assemblyId: 'silvercase.couch' };
  couchGroup.position.set(COUCH.x, 0, COUCH.z);
  couchGroup.rotation.y = Math.PI / 2; // rotates the couch's default +x facing to -z (north)
  couchGroup.add(couchBuilt.group);
  root.add(couchGroup);
  const couchBounds = [
    [COUCH.x - COUCH_LEN / 2, 0, COUCH.z - COUCH_DEPTH / 2],
    [COUCH.x + COUCH_LEN / 2, 0.66, COUCH.z + COUCH_DEPTH / 2],
  ];
  colliders.push(collider(couchBounds[0], couchBounds[1]));

  // A pistol grip poking out from under a couch cushion — purely visual; an
  // onLook flavour line is main.js's to wire on, not this file's. On the FAR
  // cushion from where Deke is sitting (ANCHORS.couchSeat), or the body would
  // land on top of the one detail that says these three were not unarmed.
  const couchGrip = group('couchGrip');
  couchGrip.userData.geometryGate = { assemblyId: 'silvercase.couch' };
  couchGrip.add(box({ size: [0.05, 0.09, 0.03], pos: [0, 0.02, 0], mat: M2.grip, rotZ: 0.5 }));
  couchGrip.position.set(7.45, 0.53, 1.70);
  root.add(couchGrip);

  // A rug under the couch, table and chair, so the living half of the flat
  // reads as one room somebody arranged rather than furniture on floorboards.
  const rug = plane(4.4, 3.2, M2.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = Math.PI / 2;
  rug.position.set(8.35, 0.018, 0.5);
  root.add(rug);

  // ---------------- coffee table ----------------
  const coffeeTable = makeCoffeeTable(M, {
    x: ANCHORS.coffeeTableSpot.x, z: ANCHORS.coffeeTableSpot.z, w: 1.2, d: 0.62,
  });
  root.add(coffeeTable.group);
  colliders.push(collider(coffeeTable.bounds[0], coffeeTable.bounds[1]));

  // Takeout containers + four drinking glasses on the table — the
  // environmental clue ("four glasses, three guys in the room"). `noticed`
  // is a plain flag main.js flips once the player has looked at it.
  const glassesGroup = group('glasses');
  for (const [gx, gz] of [[-0.28, 0.1], [-0.08, -0.06], [0.14, 0.12], [0.3, -0.08]]) {
    glassesGroup.add(cylinder({ r: 0.032, h: 0.1, pos: [gx, coffeeTable.top + 0.05, gz], mat: M2.glassRim }));
  }
  glassesGroup.position.set(ANCHORS.coffeeTableSpot.x, 0, ANCHORS.coffeeTableSpot.z);
  root.add(glassesGroup);

  const takeoutGroup = group('takeout');
  takeoutGroup.add(box({ size: [0.16, 0.06, 0.16], pos: [-0.35, coffeeTable.top + 0.03, -0.1], mat: M2.takeout }));
  takeoutGroup.add(box({
    size: [0.14, 0.05, 0.14], pos: [-0.15, coffeeTable.top + 0.025, -0.18], mat: M2.takeoutDark, rotY: 0.4,
  }));
  takeoutGroup.add(box({
    size: [0.15, 0.055, 0.1], pos: [0.32, coffeeTable.top + 0.03, 0.02], mat: M2.takeout, rotY: -0.2,
  }));
  takeoutGroup.position.set(ANCHORS.coffeeTableSpot.x, 0, ANCHORS.coffeeTableSpot.z);
  root.add(takeoutGroup);

  // ---------------- chair, facing the couch across the room ----------------
  const chair = makeChair(M, { x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z, rotY: 0 });
  root.add(chair.group);
  colliders.push(collider(chair.bounds[0], chair.bounds[1]));

  // ---------------- wall-mounted TV, entry-side wall ----------------
  const tv = group('tv');
  tv.userData.geometryGate = { assemblyId: 'silvercase.tv' };
  tv.add(box({ size: [0.09, 0.55, 0.9], pos: [0, 0, 0], mat: M2.wallDark }));
  const tvScreenMesh = box({ size: [0.02, 0.46, 0.8], pos: [0.05, 0, 0], mat: tvScreen });
  tv.add(tvScreenMesh);
  tv.position.set(ANCHORS.tvSpot.x, ANCHORS.tvSpot.y, ANCHORS.tvSpot.z);
  root.add(tv);

  // A bat leaning in the corner near the TV — purely visual, same optional
  // onLook hook as the couch grip.
  const batBehindTV = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.75, 8), M2.batWood);
  // Keep the tilted upper end tangent to the west wall instead of burying
  // half the bat through it.
  batBehindTV.position.set(6.25, 0.4, -1.85);
  batBehindTV.rotation.z = 0.32;
  root.add(batBehindTV);

  // ---------------- kitchen nook, east wall ----------------
  const kitchen = makeKitchen(M, { x: A.x1 - 0.3, z0: -1.85, z1: 1.5, wallX: A.x1 });
  // Two slim wall rails meet the worktop and the two disconnected upper runs.
  // They make the vertical load path visible and auditable without exempting
  // the entire shared kitchen builder from support checks.
  for (const z of [0.5, 1.2]) {
    kitchen.group.add(box({ size: [0.04, 0.56, 0.04], pos: [A.x1 - 0.15, 1.2, z], mat: M.darkSteel }));
  }
  root.add(kitchen.group);
  colliders.push(collider(
    kitchen.bounds[0],
    [A.x1 - 0.1, kitchen.bounds[1][1], kitchen.bounds[1][2]],
    0,
  ));

  const fridge = makeFridge(M, {
    x: ANCHORS.fridgeSpot.x, z: ANCHORS.fridgeSpot.z, w: 0.8, d: 0.72, h: 1.85,
  });
  root.add(fridge.group);
  colliders.push(collider(
    fridge.bounds[0],
    [A.x1 - 0.1, fridge.bounds[1][1], fridge.bounds[1][2]],
    0,
  ));

  // ---------------- the case, hidden near the kitchen/coffee table --------
  const caseInstance = makeCase({
    x: ANCHORS.caseSpot.x, y: ANCHORS.caseSpot.y, z: ANCHORS.caseSpot.z, rotY: 0.3,
  });
  root.add(caseInstance.group);

  // A duffel bag dumped in front of it — the occluding prop the player has
  // to look at/interact with before the case is "found". main.js hides (or
  // nudges aside) this group once that happens; no collider of its own, the
  // coffee table's collider already guards this footprint.
  const caseOcclusion = group('caseOcclusion');
  caseOcclusion.userData.geometryGate = { assemblyId: 'silvercase.case-occlusion' };
  caseOcclusion.add(box({ size: [0.32, 0.22, 0.22], pos: [0, 0.11, 0], mat: M2.bag, rotY: 0.5 }));
  caseOcclusion.add(box({ size: [0.24, 0.1, 0.18], pos: [0.05, 0.24, 0.02], mat: M2.bag, rotY: 0.2 }));
  // Keep the bag between the room and the case, not intersecting the case it
  // is meant to hide. This still blocks the player's first sightline.
  caseOcclusion.position.set(ANCHORS.caseSpot.x - 0.06, 0.01, ANCHORS.caseSpot.z - 0.42);
  root.add(caseOcclusion);

  const caseHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  caseHit.name = 'caseHiding';
  caseHit.position.set(ANCHORS.caseSpot.x, 0.2, ANCHORS.caseSpot.z + 0.05);
  root.add(caseHit);
  interactables.push(caseHit);

  // ---------------- lighting ----------------
  //
  // Every source hangs inside a fixture you can see, at a height that lights
  // the room rather than the plaster directly above it. The old pair of bare
  // point lights sat 20 cm under the ceiling and burned a white disc into it
  // from every angle in the flat.
  const ambient = new THREE.AmbientLight(0x3c3a44, 0.85);
  root.add(ambient);
  // A hemisphere on top of the ambient so a face has a top and a bottom.
  root.add(new THREE.HemisphereLight(0x50493c, 0x14100c, 0.5));

  ceilingFixture(8.4, 0.5, A.h, { intensity: 4.4, range: 8 });
  ceilingFixture(10.9, -0.6, A.h, { colour: 0xffe6bc, intensity: 3.2, range: 6.5 });

  // A standard lamp in the corner behind the couch, and the light it throws.
  const floorLamp = group('floorLamp');
  floorLamp.add(cylinder({ r: 0.14, h: 0.03, pos: [0, 0.015, 0], mat: M2.trim }));
  floorLamp.add(cylinder({ r: 0.018, h: 1.45, pos: [0, 0.73, 0], mat: M2.brass }));
  floorLamp.add(cylinder({
    rTop: 0.11, rBottom: 0.17, h: 0.24, pos: [0, 1.56, 0], mat: M2.shade, cast: false,
  }));
  floorLamp.position.set(6.65, 0, 2.05);
  root.add(floorLamp);
  // It stands in the open corner past the end of the couch, so it needs its
  // own footprint — the couch's collider stops 27 cm short of it.
  colliders.push(collider([6.47, 0, 1.87], [6.83, 1.7, 2.23]));
  const lampLight = new THREE.PointLight(0xffcf95, 3.4, 5, 2);
  lampLight.position.set(6.65, 1.5, 2.05);
  root.add(lampLight);

  // The television is a real light source in a dim room, and it is on.
  const tvGlow = new THREE.PointLight(0x9fd0e8, 1.5, 4, 2);
  tvGlow.position.set(ANCHORS.tvSpot.x + 0.35, ANCHORS.tvSpot.y, ANCHORS.tvSpot.z);
  root.add(tvGlow);

  // ---------------- per-frame update ----------------
  let flickerT = Math.random() * 10;
  let flickerHold = 0;
  function update(dt) {
    caseInstance.update(dt);
    flickerT += dt;
    const tvPulse = 0.3
      + Math.sin(flickerT * 7) * 0.06
      + (Math.random() < 0.02 ? -0.2 : 0);
    tvScreen.emissiveIntensity = tvPulse;
    tvGlow.intensity = 0.9 + tvPulse * 2.4;

    // The hallway tube that is on its way out: mostly fine, then a second of
    // stutter every so often. Cheap, and it is the whole character of the
    // corridor.
    flickerHold -= dt;
    if (flickerHold <= 0) flickerHold = 1.6 + Math.random() * 4.5;
    const stutter = flickerHold < 0.55;
    flickerLamp.lamp.intensity = stutter
      ? flickerLamp.baseIntensity * (Math.random() < 0.45 ? 0.06 : 1.15)
      : flickerLamp.baseIntensity;
    flickerLamp.glass.material.emissiveIntensity = stutter
      ? (flickerLamp.lamp.intensity > 1 ? 1.9 : 0.05)
      : 1.6;
  }

  return {
    root,
    colliders,
    interactables,
    spawns: { hallway: ANCHORS.hallwaySpawn },
    doors: {
      frontDoor: {
        group: frontDoorPivot,
        leaf: frontDoorLeaf,
        collider: frontDoorCollider,
        openRotationY: FRONT_DOOR.openRotationY,
        isOpen: () => Math.abs(frontDoorPivot.rotation.y) > 0.05,
      },
      bathroomDoor: {
        group: bathDoorPivot,
        leaf: bathDoorLeaf,
        openRotationY: BATHROOM_DOOR.openRotationY,
        /** Where it rests before anybody kicks it: off the latch, not shut. */
        ajarRotationY: BATHROOM_DOOR.ajarRotationY,
        collider: bathDoorCollider,
        /**
         * Open means OPEN — a man's width of it. The door starts ajar by
         * design, so a bare `> 0.05` test (which is what this was) called it
         * open before the mission had begun.
         */
        isOpen: () => Math.abs(bathDoorPivot.rotation.y) > 0.5,
        isAjar: () => Math.abs(bathDoorPivot.rotation.y) > 0.02,
      },
    },
    props: {
      couch: { group: couchGroup, bounds: couchBounds },
      coffeeTable,
      chair,
      kitchen,
      fridge,
      tv: { group: tv, screenMesh: tvScreenMesh, screenMat: tvScreen },
      glasses: { group: glassesGroup, noticed: false },
      takeout: takeoutGroup,
      case: caseInstance,
      caseOcclusion,
      hallwayDoors,
      bedroomDoor,
      weaponHints: { couchGrip, batBehindTV },
    },
    anchors: ANCHORS,
    update,
  };
}

import * as THREE from 'three';
import {
  box, boxFrom, cylinder, plane, mat, group, collider,
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
  couchSeat: Object.freeze({ x: 8, y: 0.46, z: 1.95, yaw: Math.PI }), // Person heading, faces -z (north)
  chairSeat: Object.freeze({ x: 8, y: 0.5, z: -1.2, yaw: 0 }), // Person heading, faces +z (south)
  kitchenSpot: Object.freeze({ x: 10.6, y: 0, z: -0.2, yaw: -Math.PI / 2 }), // Person heading, faces -x
  bathroomDoorway: Object.freeze({ x: 11.2, y: 0, z: -2.4, yaw: 0 }), // Person heading, faces +z (into the room)
  caseSpot: Object.freeze({ x: 9.6, y: 0.05, z: 1.6 }),
  coffeeTableSpot: Object.freeze({ x: 9.0, y: 0, z: 1.6 }),
  tvSpot: Object.freeze({ x: 6.06, y: 1.55, z: -1.6 }),
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
  function wallBox(x0, y0, z0, x1, y1, z1, m) {
    const mesh = boxFrom(x0, y0, z0, x1, y1, z1, m);
    root.add(mesh);
    colliders.push(collider([x0, y0, z0], [x1, y1, z1]));
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
    doorFrame: mat({ color: 0x14100c, roughness: 0.7 }),
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
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set((H.x0 + H.x1) / 2, 0.01, (H.z0 + H.z1) / 2);
  root.add(hallFloor);
  const hallCeil = plane(H.x1 - H.x0, H.z1 - H.z0, M2.ceiling);
  hallCeil.rotation.x = Math.PI / 2;
  hallCeil.position.set((H.x0 + H.x1) / 2, H.h, (H.z0 + H.z1) / 2);
  root.add(hallCeil);

  const A = ROOMS.apartment;
  const aptFloor = plane(A.x1 - A.x0, A.z1 - A.z0, M2.floor);
  aptFloor.rotation.x = -Math.PI / 2;
  aptFloor.position.set((A.x0 + A.x1) / 2, 0.01, (A.z0 + A.z1) / 2);
  root.add(aptFloor);
  const aptCeil = plane(A.x1 - A.x0, A.z1 - A.z0, M2.ceiling);
  aptCeil.rotation.x = Math.PI / 2;
  aptCeil.position.set((A.x0 + A.x1) / 2, A.h, (A.z0 + A.z1) / 2);
  root.add(aptCeil);

  // ---------------- hallway shell ----------------
  wallBox(H.x0 - 0.15, 0, H.z0 - 0.2, H.x1 + 0.1, H.h, H.z0, M2.wall); // north side
  wallBox(H.x0 - 0.15, 0, H.z1, H.x1 + 0.1, H.h, H.z1 + 0.2, M2.wall); // south side
  wallBox(H.x0 - 0.2, 0, H.z0 - 0.2, H.x0, H.h, H.z1 + 0.2, M2.wallDark); // entrance end cap

  // Decorative doors along the hallway's north wall — atmosphere only, no
  // collider beyond the wall itself and no interaction.
  const hallwayDoors = [];
  for (const dx of [1.4, 2.9, 4.4]) {
    const d = group('hallwayDoor');
    d.add(box({ size: [0.85, 2.05, 0.04], pos: [0, 1.05, 0], mat: M2.doorWood }));
    d.add(box({ size: [0.95, 2.2, 0.06], pos: [0, 1.12, -0.02], mat: M2.doorFrame }));
    d.add(cylinder({ r: 0.014, h: 0.05, pos: [0.32, 1.0, 0.03], rotX: Math.PI / 2, mat: M.chrome }));
    d.position.set(dx, 0, H.z0 + 0.02);
    root.add(d);
    hallwayDoors.push(d);
  }

  // ---------------- apartment shell ----------------
  // West wall, shared with the hallway mouth, split around the front door.
  wallBox(A.x0 - 0.1, 0, A.z0, A.x0 + 0.1, A.h, FRONT_DOOR.z - FRONT_DOOR.width / 2, M2.wall);
  wallBox(A.x0 - 0.1, 0, FRONT_DOOR.z + FRONT_DOOR.width / 2, A.x0 + 0.1, A.h, A.z1, M2.wall);
  // South wall.
  wallBox(A.x0, 0, A.z1, A.x1, A.h, A.z1 + 0.2, M2.wall);
  // East wall, behind the kitchen run.
  wallBox(A.x1 - 0.1, 0, A.z0, A.x1 + 0.1, A.h, A.z1, M2.wallDark);
  // North wall, split around the bathroom doorway.
  const bathX0 = BATHROOM_DOOR.hinge.x;
  const bathX1 = BATHROOM_DOOR.hinge.x + BATHROOM_DOOR.width;
  wallBox(A.x0, 0, A.z0 - 0.2, bathX0, A.h, A.z0, M2.wall);
  wallBox(bathX1, 0, A.z0 - 0.2, A.x1, A.h, A.z0, M2.wall);

  // Decorative bedroom door — closed, non-interactive, never opens. Not
  // registered as an interactable at all, which is the "hitbox absent"
  // option the brief allows for a door the player is never meant to open.
  const bedroomDoor = group('bedroomDoor');
  bedroomDoor.add(box({ size: [0.85, 2.05, 0.04], pos: [0, 1.05, 0], mat: M2.doorWood }));
  bedroomDoor.add(box({ size: [0.95, 2.2, 0.06], pos: [0, 1.12, 0.02], mat: M2.doorFrame }));
  bedroomDoor.position.set(ANCHORS.bedroomDoor.x, 0, A.z0 + 0.02);
  root.add(bedroomDoor);

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
  root.add(frontDoorPivot);

  const frontDoorCollider = collider(
    [FRONT_DOOR.x - 0.1, 0, FRONT_DOOR.z - FRONT_DOOR.width / 2],
    [FRONT_DOOR.x + 0.1, FRONT_DOOR.height, FRONT_DOOR.z + FRONT_DOOR.width / 2],
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
  const bathDoorPivot = new THREE.Group();
  bathDoorPivot.name = 'bathDoorPivot';
  bathDoorPivot.position.set(BATHROOM_DOOR.hinge.x, 0, BATHROOM_DOOR.hinge.z);
  const bathDoorLeaf = box({
    size: [BATHROOM_DOOR.width, BATHROOM_DOOR.height, 0.06],
    pos: [BATHROOM_DOOR.width / 2, BATHROOM_DOOR.height / 2, 0],
    mat: M2.doorWood,
  });
  bathDoorPivot.add(bathDoorLeaf);
  root.add(bathDoorPivot);

  const bathDoorCollider = collider(
    [bathX0, 0, A.z0 - 0.1], [bathX1, BATHROOM_DOOR.height, A.z0 + 0.1],
  );
  colliders.push(bathDoorCollider);

  // Shallow, unlit alcove — just enough depth for the door to swing and
  // someone to burst out of it. No modelled interior: same
  // never-show-contents rule as the case, enforced here by simply never
  // building anything back there to see.
  const ALC_DEPTH = 0.7;
  const alcBack = A.z0 - ALC_DEPTH;
  wallBox(bathX0 - 0.1, 0, alcBack - 0.1, bathX0 + 0.1, A.h, A.z0, M2.dark);
  wallBox(bathX1 - 0.1, 0, alcBack - 0.1, bathX1 + 0.1, A.h, A.z0, M2.dark);
  wallBox(bathX0, 0, alcBack - 0.1, bathX1, A.h, alcBack, M2.dark);
  const alcFloor = plane(bathX1 - bathX0, ALC_DEPTH, M2.dark);
  alcFloor.rotation.x = -Math.PI / 2;
  alcFloor.position.set((bathX0 + bathX1) / 2, 0.01, A.z0 - ALC_DEPTH / 2);
  root.add(alcFloor);

  // ---------------- couch (against the south wall, facing north) ----------
  // makeCouch bakes its (x,z) straight into its children's coordinates
  // rather than positioning a group, so it is built at the origin and then
  // wrapped in a rotated/translated group — the same swapped-half-extents
  // trick makeCoffeeTable already uses internally for its own bounds.
  const COUCH = { x: 8, z: 2.2 };
  const COUCH_LEN = 2.15;
  const COUCH_DEPTH = 0.88;
  const couchBuilt = makeCouch(M, { x: 0, z: 0, len: COUCH_LEN, depth: COUCH_DEPTH });
  const couchGroup = new THREE.Group();
  couchGroup.name = 'couch';
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
  // onLook flavour line is main.js's to wire on, not this file's.
  const couchGrip = group('couchGrip');
  couchGrip.add(box({ size: [0.05, 0.09, 0.03], pos: [0, 0.02, 0], mat: M2.grip, rotZ: 0.5 }));
  couchGrip.position.set(7.55, 0.42, 1.95);
  root.add(couchGrip);

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
  tv.add(box({ size: [0.09, 0.55, 0.9], pos: [0, 0, 0], mat: M2.wallDark }));
  const tvScreenMesh = box({ size: [0.02, 0.46, 0.8], pos: [0.05, 0, 0], mat: tvScreen });
  tv.add(tvScreenMesh);
  tv.position.set(ANCHORS.tvSpot.x, ANCHORS.tvSpot.y, ANCHORS.tvSpot.z);
  root.add(tv);

  // A bat leaning in the corner near the TV — purely visual, same optional
  // onLook hook as the couch grip.
  const batBehindTV = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.75, 8), M2.batWood);
  batBehindTV.position.set(6.1, 0.4, -1.85);
  batBehindTV.rotation.z = 0.32;
  root.add(batBehindTV);

  // ---------------- kitchen nook, east wall ----------------
  const kitchen = makeKitchen(M, { x: A.x1 - 0.3, z0: -1.85, z1: 1.5, wallX: A.x1 });
  root.add(kitchen.group);
  colliders.push(collider(kitchen.bounds[0], kitchen.bounds[1]));

  const fridge = makeFridge(M, {
    x: ANCHORS.fridgeSpot.x, z: ANCHORS.fridgeSpot.z, w: 0.8, d: 0.72, h: 1.85,
  });
  root.add(fridge.group);
  colliders.push(collider(fridge.bounds[0], fridge.bounds[1]));

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
  caseOcclusion.add(box({ size: [0.32, 0.22, 0.22], pos: [0, 0.11, 0], mat: M2.bag, rotY: 0.5 }));
  caseOcclusion.add(box({ size: [0.24, 0.1, 0.18], pos: [0.05, 0.24, 0.02], mat: M2.bag, rotY: 0.2 }));
  caseOcclusion.position.set(ANCHORS.caseSpot.x - 0.06, 0, ANCHORS.caseSpot.z + 0.14);
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
  const ambient = new THREE.AmbientLight(0x3a3a42, 0.55);
  root.add(ambient);
  const hallLamp = new THREE.PointLight(0xffd9a0, 6, 8, 2);
  hallLamp.position.set(3, 2.4, 0);
  root.add(hallLamp);
  const roomLampA = new THREE.PointLight(0xffe0b0, 5, 9, 2);
  roomLampA.position.set(8, 2.4, 0.5);
  root.add(roomLampA);
  const roomLampB = new THREE.PointLight(0xffe0b0, 4, 8, 2);
  roomLampB.position.set(11, 2.4, -0.5);
  root.add(roomLampB);

  // ---------------- per-frame update ----------------
  let flickerT = Math.random() * 10;
  function update(dt) {
    caseInstance.update(dt);
    flickerT += dt;
    tvScreen.emissiveIntensity = 0.3
      + Math.sin(flickerT * 7) * 0.06
      + (Math.random() < 0.02 ? -0.2 : 0);
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
        collider: bathDoorCollider,
        openRotationY: BATHROOM_DOOR.openRotationY,
        isOpen: () => Math.abs(bathDoorPivot.rotation.y) > 0.05,
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

import * as THREE from 'three';
import { lambert } from '../world.js';

// ---------------------------------------------------------------------------
// THE JERKY MOTEL — level geometry.
//
// A two-storey roadside motel at night: parking lot in front, exterior
// walkways on both floors, an empty swimming pool, a manager's office, a rear
// alley, and one fully modelled interior (room twelve, plus its bathroom and
// the neighbouring room eleven).
//
// Everything the player can walk into is registered as an axis-aligned box in
// `colliders`; everything they can stand on is resolved by `floorAt()`.
// ---------------------------------------------------------------------------

export const BOUNDS = { x0: -62, x1: 62, z0: -30, z1: 42 };

// Palette: sickly motel yellow, turquoise doors, hot neon pink, tropical green
const C = {
  stucco: 0xd8c88a,
  stuccoDark: 0xb3a067,
  trim: 0x2f7f78,
  door: 0x3fb9b0,
  doorDark: 0x2c8a84,
  concrete: 0x9a958c,
  concreteDark: 0x6f6b64,
  asphalt: 0x3a3a42,
  grass: 0x2c4c34,
  neonPink: 0xff3ea5,
  neonBlue: 0x4ad9ff,
  glass: 0x14202b,
  rail: 0xb9bec7,
  chrome: 0xc9ced6,
  wood: 0x6b4a2a,
  carpet: 0x6a5240,
  wall: 0x9fc7bd,
  bed: 0x7d4a5c,
  tile: 0xcfd6d2,
  dark: 0x14161c,
  palmTrunk: 0x5c4a32,
  palmLeaf: 0x2f6b3c,
  towel: 0xe8e2d2,
  blood: 0x6d1414,
};

const BUILDING = { x0: -34, x1: 34, z0: -16, z1: -4 };
const WALKWAY = { z0: -4, z1: -1.1 };
const DECK_Y = 4;
const ROOF_Y = 8;
const POOL = { x0: 14, x1: 30, z0: 6, z1: 20, y: -3 };
const POOL_STEPS = { x0: 14, x1: 17.5, z0: 16.5, z1: 20 };
const STAIRS_E = { x0: 24.5, x1: 28.5, z0: -1.1, z1: 6.5 };
const STAIRS_W = { x0: -28.5, x1: -24.5, z0: -1.1, z1: 6.5 };
const ROOM12 = { x0: -5, x1: 5, z0: -15.5, z1: -4.5 };
const ROOM11 = { x0: -17, x1: -7, z0: -15.5, z1: -4.5 };
const BATH = { x0: 1.4, x1: 5, z0: -15.5, z1: -11 };
const OFFICE = { x0: -50, x1: -38, z0: -14, z1: -4 };

function inRect(r, x, z) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function boxMesh(w, h, d, color, x, y, z, extra = null) {
  return mesh(new THREE.BoxGeometry(w, h, d), lambert(color, extra), x, y, z);
}

export function buildMotel(scene, renderer) {
  const colliders = [];
  const flicker = [];
  const refs = {};
  const breakables = [];   // destructible scenery: { group, x, z, radius, hp, kind }
  const lights = [];

  // Add an axis-aligned blocker. Returns the collider so callers can disable it.
  function block(x0, x1, z0, z1, y0, y1, tag = '') {
    const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, tag, enabled: true };
    colliders.push(c);
    return c;
  }

  // A wall panel: mesh + matching blocker.
  function wall(x0, x1, z0, z1, y0, y1, color, tag = 'wall') {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    const h = y1 - y0;
    const m = boxMesh(w, h, d, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(m);
    const c = block(x0, x1, z0, z1, y0, y1, tag);
    c.mesh = m;
    return { mesh: m, collider: c };
  }

  // ---------------- Sky, fog, lights ----------------
  scene.background = new THREE.Color(0x0d1220);
  scene.fog = new THREE.Fog(0x111a2a, 45, 165);
  scene.add(new THREE.HemisphereLight(0x53658f, 0x241d14, 1.15));
  scene.add(new THREE.AmbientLight(0x33405f, 0.7));

  const moon = new THREE.DirectionalLight(0x9db2e0, 0.95);
  moon.position.set(-40, 60, 35);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -42;
  moon.shadow.camera.right = 42;
  moon.shadow.camera.top = 42;
  moon.shadow.camera.bottom = -42;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 190;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  refs.moon = moon;

  // ---------------- Ground ----------------
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    lambert(C.grass)
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  grass.receiveShadow = true;
  scene.add(grass);

  const lot = new THREE.Mesh(new THREE.PlaneGeometry(96, 34), lambert(C.asphalt));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(0, 0, 11);
  lot.receiveShadow = true;
  scene.add(lot);

  // Cracked concrete walkway along the front of the building
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING.x1 - BUILDING.x0 + 6, 3.2), lambert(C.concrete));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(0, 0.01, -2.6);
  walk.receiveShadow = true;
  scene.add(walk);

  // Parking stripes
  for (let i = 0; i < 12; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 6), lambert(0xb9b28a));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-33 + i * 6, 0.02, 12);
    scene.add(stripe);
  }

  // The road out front
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 14), lambert(0x1e1e22));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.005, 34);
  scene.add(road);
  for (let i = -9; i <= 9; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.3), lambert(0xd8c86a));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 10, 0.02, 34);
    scene.add(dash);
  }

  // ---------------- Motel shell ----------------
  // Ground floor is solid except where the two modelled interiors are cut out.
  const gapFronts = [ROOM12, ROOM11];

  // Back wall (full length, both floors)
  wall(BUILDING.x0, BUILDING.x1, BUILDING.z0 - 0.4, BUILDING.z0, 0, ROOF_Y, C.stuccoDark, 'backwall');
  // End walls
  wall(BUILDING.x0 - 0.4, BUILDING.x0, BUILDING.z0, WALKWAY.z0, 0, ROOF_Y, C.stuccoDark);
  wall(BUILDING.x1, BUILDING.x1 + 0.4, BUILDING.z0, WALKWAY.z0, 0, ROOF_Y, C.stuccoDark);

  // Solid filler for the parts of the ground floor with no interior
  const fillSpans = [];
  {
    let cursor = BUILDING.x0;
    const sorted = [...gapFronts].sort((a, b) => a.x0 - b.x0);
    for (const g of sorted) {
      if (g.x0 > cursor) fillSpans.push([cursor, g.x0]);
      cursor = g.x1;
    }
    if (cursor < BUILDING.x1) fillSpans.push([cursor, BUILDING.x1]);
  }
  for (const [x0, x1] of fillSpans) {
    wall(x0, x1, BUILDING.z0, WALKWAY.z0, 0, DECK_Y, C.stucco, 'motel');
  }
  // Entire upper floor is solid (its doors are locked)
  wall(BUILDING.x0, BUILDING.x1, BUILDING.z0, WALKWAY.z0, DECK_Y, ROOF_Y, C.stucco, 'motel-upper');

  // Roof slab + parapet
  const roofSlab = boxMesh(BUILDING.x1 - BUILDING.x0 + 1.6, 0.5, (WALKWAY.z1 - BUILDING.z0) + 1.0,
    C.stuccoDark, 0, ROOF_Y + 0.25, (BUILDING.z0 + WALKWAY.z1) / 2);
  scene.add(roofSlab);

  // Second-floor deck (the walkway ceiling) + railing
  const deck = boxMesh(BUILDING.x1 - BUILDING.x0 + 1.6, 0.35, WALKWAY.z1 - WALKWAY.z0 + 0.6,
    C.concreteDark, 0, DECK_Y - 0.18, (WALKWAY.z0 + WALKWAY.z1) / 2 + 0.1);
  scene.add(deck);

  // Railing along the upper walkway — one section is loose and gives way.
  const railSections = [];
  for (let x = BUILDING.x0; x < BUILDING.x1; x += 4) {
    // Leave the stair landings open, or there is no way onto the upper floor
    const overStairs = [STAIRS_E, STAIRS_W].some((st) => x + 4 > st.x0 - 0.6 && x < st.x1 + 0.6);
    if (overStairs) continue;
    const g = new THREE.Group();
    g.add(boxMesh(4, 0.12, 0.12, C.rail, x + 2, DECK_Y + 1.05, WALKWAY.z1));
    g.add(boxMesh(4, 0.1, 0.1, C.rail, x + 2, DECK_Y + 0.6, WALKWAY.z1));
    g.add(boxMesh(0.12, 1.1, 0.12, C.rail, x + 0.1, DECK_Y + 0.55, WALKWAY.z1));
    scene.add(g);
    const col = block(x, x + 4, WALKWAY.z1 - 0.2, WALKWAY.z1 + 0.2, DECK_Y, DECK_Y + 1.2, 'railing');
    railSections.push({ group: g, collider: col, x0: x, x1: x + 4 });
  }
  // The rusted section right above room twelve
  refs.looseRail = railSections.find((r) => r.x0 <= 2 && r.x1 > 2) || railSections[0];
  if (refs.looseRail) {
    refs.looseRail.group.traverse((o) => { if (o.isMesh) o.material = lambert(0x8a6a58); });
  }

  // Doors + windows along both floors
  const doorNumbers = [];
  refs.roomDoors = [];
  for (let i = 0; i < 14; i++) {
    const x = BUILDING.x0 + 4 + i * 5;
    if (x > BUILDING.x1 - 3) break;
    for (const floor of [0, 1]) {
      const y = floor * DECK_Y;
      const num = floor === 0 ? 8 + i : 22 + i;
      const isTwelve = floor === 0 && num === 12;
      const doorGroup = new THREE.Group();
      const leaf = boxMesh(1.6, 2.6, 0.14, isTwelve ? C.door : (floor ? C.doorDark : C.door), 0.8, 1.3, 0);
      doorGroup.add(leaf);
      doorGroup.add(boxMesh(0.1, 0.1, 0.1, C.chrome, 1.5, 1.3, 0.12));
      doorGroup.position.set(x - 0.8, y + 0.02, WALKWAY.z0 - 0.06);
      scene.add(doorGroup);
      // Room number plate
      const plate = makeNumberPlate(num);
      plate.position.set(x + 1.4, y + 2.2, WALKWAY.z0 - 0.04);
      scene.add(plate);
      doorNumbers.push({ num, x, y, floor, group: doorGroup, plate });

      // Window beside each door
      const win = boxMesh(1.8, 1.5, 0.1, C.glass, x + 2.9, y + 1.7, WALKWAY.z0 - 0.05, { emissive: 0x0d2230 });
      scene.add(win);
      if (floor === 0 && num !== 12 && Math.random() < 0.4) {
        win.material = lambert(0x2c3b2a, { emissive: 0x22331e });
      }
      refs.roomDoors.push({ num, floor, group: doorGroup, x, window: win });
    }
  }
  refs.doorNumbers = doorNumbers;

  // Air-conditioning units dripping onto the walkway. The upstairs ones are
  // loose enough to shove over the railing onto whoever is chasing you.
  refs.acUnits = [];
  for (let i = 0; i < 8; i++) {
    const x = BUILDING.x0 + 6 + i * 8;
    const ac = boxMesh(1.3, 0.8, 0.7, 0xa8adb3, x, 1.6, WALKWAY.z0 - 0.35);
    scene.add(ac);
    const acU = boxMesh(1.3, 0.8, 0.7, 0xa8adb3, x, DECK_Y + 1.6, WALKWAY.z0 - 0.35);
    scene.add(acU);
    refs.acUnits.push({ mesh: acU, x, z: WALKWAY.z0 - 0.35, dropped: false });
  }

  // Walkway light fixtures. Only a handful carry a real light — the rest are
  // emissive shells, which keeps the per-fragment light count sane.
  for (let i = 0; i < 7; i++) {
    const x = BUILDING.x0 + 5 + i * 10;
    for (const floor of [0, 1]) {
      const y = floor * DECK_Y + 3.4;
      const lit = floor === 0 ? i % 3 === 1 : i === 3;
      const fixture = boxMesh(0.5, 0.16, 0.4, 0xd8d2c0, x, y, WALKWAY.z0 - 0.5, { emissive: lit ? 0x685c30 : 0x2a2418 });
      scene.add(fixture);
      if (!lit) continue;
      const l = new THREE.PointLight(0xffe6a8, 2.4, 22, 2);
      l.position.set(x, y - 0.3, WALKWAY.z0 - 0.9);
      scene.add(l);
      lights.push(l);
      flicker.push({ light: l, fixture, base: 2.4, phase: Math.random() * 10, rate: 0.4 + Math.random() * 3 });
    }
  }

  // Exterior stairs, both ends
  for (const st of [STAIRS_E, STAIRS_W]) {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const z = THREE.MathUtils.lerp(st.z1, st.z0, t);
      const y = THREE.MathUtils.lerp(0, DECK_Y, t);
      const s = boxMesh(st.x1 - st.x0, 0.3, (st.z1 - st.z0) / steps + 0.1, C.concreteDark,
        (st.x0 + st.x1) / 2, y + 0.1, z);
      scene.add(s);
    }
    // Stringer walls so you can't walk off the sides
    block(st.x0 - 0.3, st.x0, st.z0, st.z1, 0, DECK_Y + 1, 'stair-side');
    block(st.x1, st.x1 + 0.3, st.z0, st.z1, 0, DECK_Y + 1, 'stair-side');
    const railG = new THREE.Group();
    for (const sx of [st.x0, st.x1]) {
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        railG.add(boxMesh(0.12, 1.1, 0.12, C.rail, sx, THREE.MathUtils.lerp(0, DECK_Y, t) + 0.7,
          THREE.MathUtils.lerp(st.z1, st.z0, t)));
      }
    }
    scene.add(railG);
  }

  // ---------------- Room twelve ----------------
  const R = ROOM12;
  const ROOM_H = 3.4;

  // Floor + ceiling
  const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), lambert(C.carpet));
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.position.set((R.x0 + R.x1) / 2, 0.02, (R.z0 + R.z1) / 2);
  roomFloor.receiveShadow = true;
  scene.add(roomFloor);
  const ceil = boxMesh(R.x1 - R.x0, 0.2, R.z1 - R.z0, 0xbfb9a4, (R.x0 + R.x1) / 2, ROOM_H + 0.1, (R.z0 + R.z1) / 2);
  scene.add(ceil);

  // Side + back walls (back wall split around the bathroom window)
  wall(R.x0 - 0.3, R.x0, R.z0, R.z1, 0, DECK_Y, C.wall);
  wall(R.x1, R.x1 + 0.3, R.z0, R.z1, 0, DECK_Y, C.wall);
  wall(R.x0, 2.4, R.z0, R.z0 + 0.3, 0, DECK_Y, C.wall);      // back wall, room side
  wall(4.2, R.x1, R.z0, R.z0 + 0.3, 0, DECK_Y, C.wall);      // back wall, past the window
  wall(2.4, 4.2, R.z0, R.z0 + 0.3, 0, 1.1, C.wall);          // under the bathroom window
  wall(2.4, 4.2, R.z0, R.z0 + 0.3, 2.6, DECK_Y, C.wall);     // above it

  // Front wall with the doorway and the front window
  wall(R.x0, -1.1, R.z1, R.z1 + 0.3, 0, DECK_Y, C.wall);
  wall(1.0, R.x1, R.z1, R.z1 + 0.3, 0, DECK_Y, C.wall);
  wall(-1.1, 1.0, R.z1, R.z1 + 0.3, 2.7, DECK_Y, C.wall);    // over the door

  // The front door itself — hinged, and it closes behind you
  const frontDoor = makeDoor(1.9, 2.7, C.door);
  frontDoor.group.position.set(-1.05, 0.02, R.z1 + 0.15);
  scene.add(frontDoor.group);
  frontDoor.collider = block(-1.1, 1.0, R.z1, R.z1 + 0.3, 0, 2.7, 'door12');
  frontDoor.collider.enabled = false;
  frontDoor.open = true;
  refs.frontDoor = frontDoor;

  // Front window of room twelve — smashable, and Manny can see you through it
  const win12 = boxMesh(2.0, 1.5, 0.12, C.glass, 3.0, 1.85, R.z1 + 0.15, { emissive: 0x16303a });
  scene.add(win12);
  refs.window12 = { mesh: win12, broken: false, x: 3.0, z: R.z1 };

  // Bathroom: walls, door, window to the rear alley
  wall(BATH.x0 - 0.15, BATH.x0 + 0.15, BATH.z0, BATH.z1, 0, ROOM_H, C.tile);
  wall(BATH.x0, 2.6, BATH.z1 - 0.15, BATH.z1 + 0.15, 0, ROOM_H, C.tile);
  wall(4.1, BATH.x1, BATH.z1 - 0.15, BATH.z1 + 0.15, 0, ROOM_H, C.tile);
  const bathDoor = makeDoor(1.5, 2.4, 0xd8d2c0);
  bathDoor.group.position.set(2.6, 0.02, BATH.z1);
  bathDoor.group.rotation.y = Math.PI;
  scene.add(bathDoor.group);
  bathDoor.collider = block(2.6, 4.1, BATH.z1 - 0.15, BATH.z1 + 0.15, 0, 2.4, 'bathdoor');
  bathDoor.open = false;
  refs.bathDoor = bathDoor;

  const bathFloor = new THREE.Mesh(new THREE.PlaneGeometry(BATH.x1 - BATH.x0, BATH.z1 - BATH.z0), lambert(C.tile));
  bathFloor.rotation.x = -Math.PI / 2;
  bathFloor.position.set((BATH.x0 + BATH.x1) / 2, 0.03, (BATH.z0 + BATH.z1) / 2);
  scene.add(bathFloor);

  // Bathroom fittings
  const tub = boxMesh(1.6, 0.6, 2.2, 0xe4e8e4, 4.0, 0.3, -14.0);
  scene.add(tub);
  block(3.2, 4.9, -15.2, -12.8, 0, 0.6, 'tub');
  const curtainRod = boxMesh(1.8, 0.06, 0.06, C.chrome, 4.0, 2.1, -12.9);
  scene.add(curtainRod);
  const curtain = boxMesh(1.7, 1.9, 0.05, 0xbcd8d2, 4.0, 1.1, -12.9, { emissive: 0x1a2a28 });
  scene.add(curtain);
  refs.curtain = { mesh: curtain, rod: curtainRod, pulled: false };
  const sink = boxMesh(0.9, 0.25, 0.6, 0xe4e8e4, 2.3, 0.9, -15.0);
  scene.add(sink);
  const toilet = boxMesh(0.6, 0.8, 0.8, 0xe4e8e4, 2.2, 0.4, -12.2);
  scene.add(toilet);
  const bathLight = new THREE.PointLight(0xcfe6ff, 0.9, 8, 2);
  bathLight.position.set(3.2, 2.6, -13.5);
  scene.add(bathLight);
  lights.push(bathLight);
  refs.bathLight = bathLight;

  // Bathroom window (rear alley escape)
  const bathWin = boxMesh(1.6, 1.3, 0.1, C.glass, 3.3, 1.9, R.z0 + 0.12, { emissive: 0x101c14 });
  scene.add(bathWin);
  refs.bathWindow = { mesh: bathWin, open: false, broken: false, x: 3.3, z: R.z0 };

  // Beds
  const beds = [];
  for (const bz of [-12.6, -8.4]) {
    const g = new THREE.Group();
    g.add(boxMesh(2.2, 0.5, 3.2, 0x4a3a2c, 0, 0.25, 0));
    const mattress = boxMesh(2.1, 0.35, 3.1, C.bed, 0, 0.66, 0);
    g.add(mattress);
    g.add(boxMesh(1.0, 0.2, 0.5, 0xe8e4d8, 0, 0.9, -1.2));
    g.position.set(-3.1, 0, bz);
    scene.add(g);
    const col = block(-4.3, -2.0, bz - 1.6, bz + 1.6, 0, 0.9, 'bed');
    beds.push({ group: g, mattress, collider: col, x: -3.1, z: bz, flipped: false });
  }
  refs.beds = beds;

  // Nightstand + buzzing lamp
  const nightstand = boxMesh(0.9, 0.7, 0.9, C.wood, -3.1, 0.35, -10.5);
  scene.add(nightstand);
  const lampBase = boxMesh(0.2, 0.5, 0.2, 0x8a7a5a, -3.1, 0.95, -10.5);
  const lampShade = mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.5, 10), lambert(0xe8d9a8, { emissive: 0x6a5a20 }), -3.1, 1.45, -10.5);
  scene.add(lampBase, lampShade);
  const lampLight = new THREE.PointLight(0xffd9a0, 2.2, 12, 2);
  lampLight.position.set(-3.1, 1.6, -10.5);
  scene.add(lampLight);
  lights.push(lampLight);
  refs.lamp = { base: lampBase, shade: lampShade, light: lampLight, x: -3.1, z: -10.5, broken: false };
  flicker.push({ light: lampLight, fixture: lampShade, base: 2.2, phase: 3, rate: 7 });

  // Television on a dresser
  const dresser = boxMesh(1.6, 1.0, 0.7, C.wood, 3.6, 0.5, -8.6);
  scene.add(dresser);
  const tvBody = boxMesh(1.3, 1.0, 0.8, 0x2a2a30, 3.6, 1.5, -8.6);
  const tvScreen = boxMesh(1.05, 0.75, 0.06, 0x8fb8c8, 3.6, 1.52, -8.2, { emissive: 0x3a6a80 });
  scene.add(tvBody, tvScreen);
  block(2.8, 4.4, -9.2, -8.0, 0, 2.0, 'tv');
  refs.tv = { body: tvBody, screen: tvScreen, x: 3.6, z: -8.6, volume: 0.3, broken: false };

  // Dining table + chairs
  const tableGroup = new THREE.Group();
  tableGroup.add(boxMesh(1.6, 0.1, 1.6, C.wood, 0, 0.78, 0));
  for (const [sx, sz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    tableGroup.add(boxMesh(0.1, 0.78, 0.1, 0x4a3a22, sx, 0.39, sz));
  }
  tableGroup.position.set(1.4, 0, -6.4);
  scene.add(tableGroup);
  const tableCol = block(0.5, 2.3, -7.3, -5.5, 0, 0.9, 'table');
  refs.table = { group: tableGroup, collider: tableCol, x: 1.4, z: -6.4, kicked: false };

  const chairs = [];
  for (const [cx, cz] of [[-0.4, -6.4], [3.0, -6.4]]) {
    const ch = new THREE.Group();
    ch.add(boxMesh(0.7, 0.1, 0.7, 0x5c4630, 0, 0.45, 0));
    ch.add(boxMesh(0.7, 0.8, 0.1, 0x5c4630, 0, 0.85, -0.3));
    ch.position.set(cx, 0, cz);
    scene.add(ch);
    chairs.push(ch);
  }
  refs.chairs = chairs;
  refs.chairSeat = { x: 3.0, z: -6.4 };

  // Counter: seasonings, vacuum sealer, plastic sheeting
  const counter = boxMesh(4.4, 0.9, 0.7, 0x8a7f6a, -2.6, 0.45, -15.0);
  scene.add(counter);
  block(-4.9, -0.4, -15.4, -14.6, 0, 0.9, 'counter');
  const seasoningGroup = new THREE.Group();
  const jarColors = [0x8f3a1d, 0xc9a227, 0x5a3b1f, 0x8f1d1d, 0x3f6b2f];
  for (let i = 0; i < 5; i++) {
    const jar = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 8), lambert(jarColors[i]), -4.2 + i * 0.42, 1.03, -15.0);
    seasoningGroup.add(jar);
  }
  scene.add(seasoningGroup);
  refs.seasoning = { group: seasoningGroup, x: -3.4, z: -15.0, used: false };

  const sealer = new THREE.Group();
  sealer.add(boxMesh(1.0, 0.35, 0.6, 0xd8d4c8, 0, 1.07, 0));
  sealer.add(boxMesh(1.0, 0.12, 0.6, 0x2a2a30, 0, 1.3, 0));
  sealer.position.set(-1.2, 0, -15.0);
  scene.add(sealer);
  // Its power cord across the floor — a trip hazard during the fight
  const cord = boxMesh(0.06, 0.04, 2.6, 0x1c1c1c, -1.2, 0.04, -13.6);
  scene.add(cord);
  refs.sealer = { group: sealer, cord, x: -1.2, z: -15.0, tripArmed: false };

  const sheeting = boxMesh(2.6, 2.4, 0.05, 0xd8e4e8, -0.2, 1.2, -12.6, { emissive: 0x1a2426, transparent: true, opacity: 0.35 });
  sheeting.material.transparent = true;
  sheeting.material.opacity = 0.35;
  scene.add(sheeting);
  refs.sheeting = sheeting;

  // Ceiling fan, rotating unevenly
  const fan = new THREE.Group();
  fan.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8), lambert(0x8a8478), 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const blade = boxMesh(1.5, 0.05, 0.32, 0x6b5a3a, 0.75, -0.2, 0);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 4) * Math.PI * 2;
    pivot.add(blade);
    fan.add(pivot);
  }
  fan.position.set(0, ROOM_H - 0.35, -10.4);
  scene.add(fan);
  refs.fan = { group: fan, speed: 2.2, sparked: false };

  // Crooked beach picture
  const pic = boxMesh(1.3, 0.9, 0.08, 0x3f7fa8, -4.75, 2.2, -9.5, { emissive: 0x14262e });
  pic.rotation.z = 0.12;
  pic.rotation.y = Math.PI / 2;
  scene.add(pic);
  refs.picture = pic;

  // Room lamps
  const roomLight = new THREE.PointLight(0xffe0b0, 2.0, 20, 2);
  roomLight.position.set(0, 3.0, -10.0);
  scene.add(roomLight);
  lights.push(roomLight);
  refs.roomLight = roomLight;

  // The Reserve suitcase, open on the far bed
  refs.jerkyCase = makeJerkyCase();
  refs.jerkyCase.group.position.set(-3.1, 0.92, -8.4);
  refs.jerkyCase.group.rotation.y = 0.2;
  scene.add(refs.jerkyCase.group);
  refs.jerkyCase.x = -3.1;
  refs.jerkyCase.z = -8.4;

  // Rico's hidden premium stash, under the far bed
  const stash = makeJerkyCase(0x1d1d22);
  stash.group.scale.setScalar(0.8);
  stash.group.position.set(-3.1, 0.12, -12.6);
  stash.group.visible = false;
  scene.add(stash.group);
  refs.stash = { ...stash, x: -3.1, z: -12.6, found: false };

  // ---------------- Room eleven (the neighbour) ----------------
  const R11 = ROOM11;
  const r11Floor = new THREE.Mesh(new THREE.PlaneGeometry(R11.x1 - R11.x0, R11.z1 - R11.z0), lambert(0x5a4a3a));
  r11Floor.rotation.x = -Math.PI / 2;
  r11Floor.position.set((R11.x0 + R11.x1) / 2, 0.02, (R11.z0 + R11.z1) / 2);
  scene.add(r11Floor);
  scene.add(boxMesh(R11.x1 - R11.x0, 0.2, R11.z1 - R11.z0, 0xbfb9a4, (R11.x0 + R11.x1) / 2, ROOM_H + 0.1, (R11.z0 + R11.z1) / 2));
  wall(R11.x0 - 0.3, R11.x0, R11.z0, R11.z1, 0, DECK_Y, C.wall);
  wall(R11.x1, R11.x1 + 0.3, R11.z0, R11.z1, 0, DECK_Y, C.wall);
  wall(R11.x0, R11.x1, R11.z0, R11.z0 + 0.3, 0, DECK_Y, C.wall);
  wall(R11.x0, -13.1, R11.z1, R11.z1 + 0.3, 0, DECK_Y, C.wall);
  wall(-11.0, R11.x1, R11.z1, R11.z1 + 0.3, 0, DECK_Y, C.wall);
  wall(-13.1, -11.0, R11.z1, R11.z1 + 0.3, 2.7, DECK_Y, C.wall);
  const door11 = makeDoor(1.9, 2.7, C.door);
  door11.group.position.set(-13.05, 0.02, R11.z1 + 0.15);
  scene.add(door11.group);
  door11.collider = block(-13.1, -11.0, R11.z1, R11.z1 + 0.3, 0, 2.7, 'door11');
  door11.open = false;
  door11.locked = true;
  refs.door11 = door11;
  // Rear window of room eleven, out to the alley
  const win11 = boxMesh(1.6, 1.3, 0.1, C.glass, -12, 1.9, R11.z0 + 0.12, { emissive: 0x101c14 });
  scene.add(win11);
  refs.window11 = { mesh: win11, broken: false, x: -12, z: R11.z0 };
  // Stacked shipment crates — the real product
  const crates = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const crate = boxMesh(1.2, 0.8, 0.9, 0x2a2620, -15 + (i % 2) * 1.4, 0.4 + Math.floor(i / 2) * 0.85, -14);
    crates.add(crate);
  }
  scene.add(crates);
  refs.crates = { group: crates, x: -14.3, z: -14 };
  // Room eleven is lit by its own dead television and nothing else
  const r11Glow = boxMesh(1.2, 0.8, 0.06, 0x6fa8c0, -12, 1.6, -9.4, { emissive: 0x2a5a70 });
  scene.add(r11Glow);

  // ---------------- Office ----------------
  const O = OFFICE;
  const offFloor = new THREE.Mesh(new THREE.PlaneGeometry(O.x1 - O.x0, O.z1 - O.z0), lambert(0x6a6258));
  offFloor.rotation.x = -Math.PI / 2;
  offFloor.position.set((O.x0 + O.x1) / 2, 0.02, (O.z0 + O.z1) / 2);
  scene.add(offFloor);
  scene.add(boxMesh(O.x1 - O.x0 + 0.8, 0.4, O.z1 - O.z0 + 0.8, C.stuccoDark, (O.x0 + O.x1) / 2, 3.6, (O.z0 + O.z1) / 2));
  wall(O.x0 - 0.3, O.x0, O.z0, O.z1, 0, 3.6, C.stucco);
  wall(O.x1, O.x1 + 0.3, O.z0, O.z1, 0, 3.6, C.stucco);
  wall(O.x0, -45.1, O.z0, O.z0 + 0.3, 0, 3.6, C.stucco);     // rear wall, west of the rear door
  wall(-43.0, O.x1, O.z0, O.z0 + 0.3, 0, 3.6, C.stucco);     // rear wall, east
  wall(O.x0, -45.1, O.z1 - 0.3, O.z1, 0, 3.6, C.stucco);     // front wall, west of the front door
  wall(-43.0, O.x1, O.z1 - 0.3, O.z1, 0, 3.6, C.stucco);
  const officeDoor = makeDoor(1.9, 2.7, 0x3f6b8a);
  officeDoor.group.position.set(-45.05, 0.02, O.z1);
  scene.add(officeDoor.group);
  officeDoor.collider = block(-45.1, -43.0, O.z1 - 0.3, O.z1, 0, 2.7, 'officedoor');
  officeDoor.collider.enabled = false;
  officeDoor.open = true;
  refs.officeDoor = officeDoor;
  const officeRear = makeDoor(1.9, 2.7, 0x3f6b8a);
  officeRear.group.position.set(-45.05, 0.02, O.z0 + 0.3);
  officeRear.group.rotation.y = Math.PI;
  scene.add(officeRear.group);
  officeRear.collider = block(-45.1, -43.0, O.z0, O.z0 + 0.3, 0, 2.7, 'officerear');
  officeRear.open = false;
  officeRear.locked = true;
  refs.officeRearDoor = officeRear;

  const counterO = boxMesh(6, 1.1, 0.8, 0x7a5a3a, -44, 0.55, -7);
  scene.add(counterO);
  block(-47, -41, -7.4, -6.6, 0, 1.1, 'office-counter');
  const register = boxMesh(0.8, 0.5, 0.6, 0x3a3a42, -42.4, 1.35, -7);
  scene.add(register);
  refs.register = { mesh: register, x: -42.4, z: -6.2, robbed: false };
  const monitor = boxMesh(1.0, 0.7, 0.5, 0x24242a, -46.5, 1.6, -7.4);
  const monitorScreen = boxMesh(0.85, 0.55, 0.05, 0x6fa8c0, -46.5, 1.62, -7.1, { emissive: 0x2a5a70 });
  scene.add(monitor, monitorScreen);
  refs.monitor = { mesh: monitor, screen: monitorScreen, x: -46.5, z: -6.6, used: false };
  const officeLight = new THREE.PointLight(0xcfe0ff, 1.4, 18, 2);
  officeLight.position.set(-44, 3.0, -9);
  scene.add(officeLight);
  lights.push(officeLight);

  // "NO SMOKING. NO PARTIES. NO EXOTIC MEATS."
  const rulesSign = makeRulesSign();
  rulesSign.position.set(-41.5, 2.1, O.z1 + 0.15);
  scene.add(rulesSign);
  refs.rulesSign = { mesh: rulesSign, x: -41.5, z: O.z1 + 0.6 };

  // ---------------- Pool ----------------
  const poolShell = new THREE.Group();
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0), lambert(0x7fa8b8));
  pf.rotation.x = -Math.PI / 2;
  pf.position.set((POOL.x0 + POOL.x1) / 2, POOL.y + 0.02, (POOL.z0 + POOL.z1) / 2);
  pf.receiveShadow = true;
  poolShell.add(pf);
  // Inner walls, so you can only climb out at the steps
  const pw = 0.6;
  for (const [x0, x1, z0, z1] of [
    [POOL.x0 - pw, POOL.x0, POOL.z0 - pw, POOL.z1 + pw],
    [POOL.x1, POOL.x1 + pw, POOL.z0 - pw, POOL.z1 + pw],
    [POOL.x0 - pw, POOL.x1 + pw, POOL.z0 - pw, POOL.z0],
    [POOL.x0 - pw, POOL.x1 + pw, POOL.z1, POOL.z1 + pw],
  ]) {
    poolShell.add(boxMesh(x1 - x0, 3, z1 - z0, 0xbfc8c4, (x0 + x1) / 2, POOL.y + 1.5, (z0 + z1) / 2));
    block(x0, x1, z0, z1, POOL.y, 0, 'poolwall');
  }
  scene.add(poolShell);
  // Steps at the shallow corner
  for (let i = 0; i < 4; i++) {
    const y = POOL.y + (i + 1) * 0.75;
    poolShell.add(boxMesh(POOL_STEPS.x1 - POOL_STEPS.x0, 0.75, 0.85, 0xd0d8d4,
      (POOL_STEPS.x0 + POOL_STEPS.x1) / 2, y - 0.375, POOL_STEPS.z1 - 0.45 - i * 0.85));
  }
  // Lawn chairs and trash at the bottom
  for (let i = 0; i < 4; i++) {
    const chair = new THREE.Group();
    chair.add(boxMesh(0.7, 0.1, 1.8, 0x2f7f78, 0, 0.25, 0));
    chair.add(boxMesh(0.7, 0.1, 0.8, 0x2f7f78, 0, 0.55, -0.9));
    chair.position.set(POOL.x0 + 3 + Math.random() * 9, POOL.y, POOL.z0 + 3 + Math.random() * 9);
    chair.rotation.set(Math.random() * 0.6, Math.random() * 6, Math.random() * 0.6);
    scene.add(chair);
  }
  const poolLight = new THREE.PointLight(0x4ad9ff, 2.6, 30, 2);
  poolLight.position.set((POOL.x0 + POOL.x1) / 2, POOL.y + 1.5, (POOL.z0 + POOL.z1) / 2);
  scene.add(poolLight);
  lights.push(poolLight);
  // Drainage tunnel at the deep end — comes out behind the office
  const tunnel = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.6, 12, 1, true), lambert(0x14140f), POOL.x0 + 0.3, POOL.y + 1.0, POOL.z0 + 4);
  tunnel.rotation.z = Math.PI / 2;
  scene.add(tunnel);
  refs.poolTunnel = { mesh: tunnel, x: POOL.x0 + 1.0, z: POOL.z0 + 4, exit: { x: -40, z: -19 } };
  refs.pool = POOL;

  // ---------------- Cars ----------------
  function makeCar(color, plateGlow = false) {
    const g = new THREE.Group();
    g.add(boxMesh(2.0, 0.9, 4.6, color, 0, 0.85, 0));
    g.add(boxMesh(1.8, 0.8, 2.2, 0x121820, 0, 1.65, -0.2, { emissive: 0x0a1016 }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1.5, 1.5]) {
        const w = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), lambert(0x14141a), sx * 0.95, 0.45, sz);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    }
    for (const sx of [-0.65, 0.65]) {
      g.add(boxMesh(0.4, 0.25, 0.1, 0xfff0c0, sx, 0.9, 2.32, { emissive: plateGlow ? 0xa89860 : 0x554a28 }));
      g.add(boxMesh(0.4, 0.2, 0.1, 0xd92e2e, sx, 0.95, -2.32, { emissive: 0x5a1010 }));
    }
    return g;
  }

  // Manny's getaway sedan — engine off, parked facing the road
  const manCar = makeCar(0x6b2f3a);
  manCar.position.set(-8, 0, 17);
  scene.add(manCar);
  block(-9.2, -6.8, 14.6, 19.4, 0, 1.8, 'car');
  refs.manCar = { group: manCar, x: -8, z: 17, trunk: { x: -8, z: 19.6, opened: false }, headlights: [] };
  const hlL = new THREE.SpotLight(0xfff4d0, 0, 40, 0.5, 0.5, 1.4);
  hlL.position.set(-8.7, 0.9, 19.5);
  hlL.target.position.set(-9, 0.4, 40);
  scene.add(hlL, hlL.target);
  refs.manCar.headlights.push(hlL);

  // The second car — engine running, one of the warning signs
  const secondCar = makeCar(0x2f3a6b, true);
  secondCar.position.set(13, 0, 9);
  secondCar.rotation.y = 0.35;
  scene.add(secondCar);
  block(11.6, 14.4, 6.6, 11.4, 0, 1.8, 'car');
  refs.secondCar = { group: secondCar, x: 13, z: 9, idleT: 0 };

  // Background parked cars
  const parked = [];
  for (const [x, z, col] of [[2, 7, 0x3f5f3a], [-20, 10, 0x8a8a92], [22, 3, 0x6a5a3a], [-30, 6, 0x2a2a30]]) {
    const c = makeCar(col);
    c.position.set(x, 0, z);
    c.rotation.y = Math.random() * 0.3 - 0.15;
    scene.add(c);
    block(x - 1.3, x + 1.3, z - 2.5, z + 2.5, 0, 1.8, 'car');
    parked.push(c);
  }
  refs.parkedCars = parked;

  // ---------------- Motel sign, palms, alley clutter ----------------
  const signGroup = new THREE.Group();
  signGroup.add(boxMesh(0.7, 12, 0.7, 0x4a4a52, 0, 6, 0));
  const signBoard = boxMesh(8, 4.5, 0.4, 0x1b1424, 0, 12, 0);
  signGroup.add(signBoard);
  const signText = makeSignText();
  signText.position.set(0, 12, 0.3);
  signGroup.add(signText);
  const signGlow = new THREE.PointLight(C.neonPink, 3.2, 42, 2);
  signGlow.position.set(0, 11, 1.5);
  signGroup.add(signGlow);
  lights.push(signGlow);
  signGroup.position.set(-2, 0, 29);
  scene.add(signGroup);
  block(-2.6, -1.4, 28.4, 29.6, 0, 12, 'sign');
  refs.neon = { group: signGroup, glow: signGlow, board: signBoard, text: signText };
  flicker.push({ light: signGlow, fixture: signText, base: 3.2, phase: 1.4, rate: 0.7 });

  const palms = [];
  for (const [px, pz] of [[-38, 22], [-14, 26], [8, 24], [34, 18], [40, 2], [-52, 8], [26, 26], [-26, 30]]) {
    const palm = new THREE.Group();
    const h = 6 + Math.random() * 3;
    const trunk = mesh(new THREE.CylinderGeometry(0.22, 0.36, h, 7), lambert(C.palmTrunk), 0, h / 2, 0);
    palm.add(trunk);
    const crown = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const leaf = boxMesh(3.4, 0.1, 0.7, C.palmLeaf, 1.6, 0, 0);
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 7) * Math.PI * 2;
      pivot.rotation.z = -0.35 - Math.random() * 0.25;
      pivot.add(leaf);
      crown.add(pivot);
    }
    crown.position.y = h;
    palm.add(crown);
    palm.position.set(px, 0, pz);
    scene.add(palm);
    block(px - 0.5, px + 0.5, pz - 0.5, pz + 0.5, 0, h, 'palm');
    palms.push({ group: palm, crown, phase: Math.random() * 10 });
  }
  refs.palms = palms;

  // Ice machine + vending machine
  const ice = new THREE.Group();
  ice.add(boxMesh(1.6, 2.2, 1.0, 0xd8dce0, 0, 1.1, 0));
  ice.add(boxMesh(1.3, 0.7, 0.1, 0x2a3a44, 0, 1.5, 0.52, { emissive: 0x14303c }));
  ice.position.set(20, 0, -2.4);
  scene.add(ice);
  block(19.2, 20.8, -2.9, -1.9, 0, 2.2, 'ice');
  refs.iceMachine = { group: ice, x: 20, z: -1.6 };

  const vend = new THREE.Group();
  vend.add(boxMesh(1.5, 2.4, 0.9, 0xb42a3a, 0, 1.2, 0));
  vend.add(boxMesh(1.1, 1.6, 0.1, 0x2a3a44, 0, 1.5, 0.48, { emissive: 0x2a5a70 }));
  vend.position.set(-36.5, 0, -2.6);
  scene.add(vend);
  block(-37.3, -35.7, -3.1, -2.1, 0, 2.4, 'vending');
  refs.vending = { group: vend, x: -36.5, z: -1.8 };

  // Laundry cart with a bloodied towel
  const cart = new THREE.Group();
  cart.add(boxMesh(1.4, 0.9, 1.0, 0xb8bcc4, 0, 0.75, 0));
  for (const [wx, wz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) {
    cart.add(boxMesh(0.16, 0.3, 0.16, 0x2a2a30, wx, 0.15, wz));
  }
  const towel = boxMesh(0.9, 0.3, 0.7, C.towel, 0.1, 1.28, 0);
  const stain = boxMesh(0.4, 0.06, 0.3, C.blood, 0.2, 1.44, 0.05);
  cart.add(towel, stain);
  cart.position.set(-21, 0, -2.6);
  scene.add(cart);
  block(-21.8, -20.2, -3.2, -2.0, 0, 1.2, 'cart');
  refs.laundryCart = { group: cart, x: -21, z: -1.8 };

  // Security camera on a pole, aimed carefully away from room twelve
  const camPole = new THREE.Group();
  camPole.add(boxMesh(0.2, 5, 0.2, 0x4a4a52, 0, 2.5, 0));
  const camHead = boxMesh(0.5, 0.4, 0.9, 0x2a2a30, 0, 5.0, 0.3);
  const camLed = boxMesh(0.08, 0.08, 0.08, 0xff3030, 0, 5.15, 0.75, { emissive: 0xff1010 });
  camPole.add(camHead, camLed);
  camPole.position.set(9, 0, 2);
  camPole.rotation.y = 2.4; // pointing at the empty end of the lot
  scene.add(camPole);
  block(8.6, 9.4, 1.6, 2.4, 0, 5, 'pole');
  refs.camera = { group: camPole, head: camHead, x: 9, z: 2.9 };

  // Dumpsters in the rear alley
  for (const [dx, dz] of [[-8, -20], [12, -19], [-26, -20]]) {
    const d = new THREE.Group();
    d.add(boxMesh(3.0, 1.6, 1.8, 0x2f5a45, 0, 0.8, 0));
    d.add(boxMesh(3.1, 0.15, 1.9, 0x24463a, 0, 1.68, 0));
    d.position.set(dx, 0, dz);
    scene.add(d);
    block(dx - 1.5, dx + 1.5, dz - 0.9, dz + 0.9, 0, 1.7, 'dumpster');
  }

  // Discarded jerky wrapper in the lot (a clue)
  const wrapper = boxMesh(0.5, 0.02, 0.35, 0x1c1c22, -3, 0.04, 8, { emissive: 0x201a10 });
  wrapper.rotation.y = 0.6;
  scene.add(wrapper);
  refs.wrapper = { mesh: wrapper, x: -3, z: 8 };

  // Empty meat-preservation packets near the walkway
  const packets = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const p = boxMesh(0.28, 0.02, 0.2, 0xc0c4c8, (Math.random() - 0.5) * 1.6, 0.04, (Math.random() - 0.5) * 1.2, { emissive: 0x2a2e30 });
    p.rotation.y = Math.random() * 3;
    packets.add(p);
  }
  packets.position.set(6.5, 0, -3.0);
  scene.add(packets);
  refs.packets = { group: packets, x: 6.5, z: -3.0 };

  // Fence line along the back of the lot
  for (let x = -58; x < 58; x += 4) {
    const post = boxMesh(0.14, 2.0, 0.14, 0x585048, x, 1.0, 40);
    scene.add(post);
  }
  block(-58, 58, 39.6, 40.4, 0, 2.0, 'fence');

  // Outer walls of the world
  block(BOUNDS.x0 - 2, BOUNDS.x0, BOUNDS.z0, BOUNDS.z1, -4, 12, 'bounds');
  block(BOUNDS.x1, BOUNDS.x1 + 2, BOUNDS.z0, BOUNDS.z1, -4, 12, 'bounds');
  block(BOUNDS.x0, BOUNDS.x1, BOUNDS.z0 - 2, BOUNDS.z0, -4, 12, 'bounds');
  block(BOUNDS.x0, BOUNDS.x1, BOUNDS.z1, BOUNDS.z1 + 2, -4, 12, 'bounds');

  // ---------------- Floor resolution ----------------
  function stairHeight(st, z) {
    const t = THREE.MathUtils.clamp((st.z1 - z) / (st.z1 - st.z0), 0, 1);
    return t * DECK_Y;
  }

  // Highest walkable surface at (x, z) that is not more than a step above `y`.
  function floorAt(x, z, y) {
    const cands = [];
    if (inRect(POOL, x, z)) {
      if (inRect(POOL_STEPS, x, z)) {
        const t = THREE.MathUtils.clamp((z - POOL_STEPS.z0) / (POOL_STEPS.z1 - POOL_STEPS.z0), 0, 1);
        cands.push(POOL.y + t * 3);
      } else {
        cands.push(POOL.y);
      }
    } else {
      cands.push(0);
    }
    if (inRect(STAIRS_E, x, z)) cands.push(stairHeight(STAIRS_E, z));
    if (inRect(STAIRS_W, x, z)) cands.push(stairHeight(STAIRS_W, z));
    if (x >= BUILDING.x0 - 0.8 && x <= BUILDING.x1 + 0.8 && z >= WALKWAY.z0 - 0.2 && z <= WALKWAY.z1 + 0.4) {
      cands.push(DECK_Y);
    }
    let best = -Infinity;
    for (const c of cands) if (c <= y + 0.85 && c > best) best = c;
    if (best === -Infinity) best = Math.min(...cands);
    return best;
  }

  // Is this position inside the modelled interior of room twelve (or its bathroom)?
  function insideRoom12(x, z) {
    return inRect(ROOM12, x, z);
  }

  return {
    colliders,
    flicker,
    lights,
    refs,
    breakables,
    floorAt,
    insideRoom12,
    rects: { BUILDING, WALKWAY, ROOM12, ROOM11, BATH, OFFICE, POOL, POOL_STEPS, STAIRS_E, STAIRS_W },
    DECK_Y,
    ROOF_Y,
    block,
  };
}

// ---------------- Small builders ----------------

function makeDoor(w, h, color) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), lambert(color));
  leaf.position.set(w / 2, h / 2, 0);
  leaf.castShadow = true;
  pivot.add(leaf);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), lambert(0xc9ced6));
  knob.position.set(w - 0.2, h / 2, 0.1);
  pivot.add(knob);
  group.add(pivot);
  return { group, pivot, leaf, angle: 0, targetAngle: 0, open: false, locked: false, collider: null };
}

function makeNumberPlate(num) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1424';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffd75e';
  ctx.font = '900 84px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshLambertMaterial({ map: tex, emissive: 0x554420, emissiveMap: tex })
  );
  return m;
}

function makeSignText() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1424';
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = '#ff3ea5';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 260);
  ctx.fillStyle = '#ff3ea5';
  ctx.font = '900 italic 78px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FLAMINGO', 256, 100);
  ctx.fillStyle = '#4ad9ff';
  ctx.font = '900 62px Trebuchet MS, sans-serif';
  ctx.fillText('MOTEL', 256, 172);
  ctx.fillStyle = '#ffe27a';
  ctx.font = '900 34px Trebuchet MS, sans-serif';
  ctx.fillText('VACANCY  ·  AC  ·  POOL', 256, 232);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 4.2),
    new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1 })
  );
}

function makeRulesSign() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e2cc';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 240);
  ctx.fillStyle = '#2a2418';
  ctx.font = '900 44px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NO SMOKING.', 256, 78);
  ctx.fillText('NO PARTIES.', 256, 140);
  ctx.fillStyle = '#a01818';
  ctx.fillText('NO EXOTIC MEATS.', 256, 206);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshLambertMaterial({ map: tex, emissive: 0x333026, emissiveMap: tex })
  );
}

// The Reserve: vacuum-sealed black bricks with silver foil that catches the lamp.
export function makeJerkyCase(shellColor = 0x2a2118) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.0), lambert(shellColor));
  shell.position.y = 0.11;
  shell.castShadow = true;
  group.add(shell);
  const lid = new THREE.Group();
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.0), lambert(shellColor));
  lidMesh.position.set(0, 0.08, -0.5);
  lid.add(lidMesh);
  lid.position.set(0, 0.22, -0.5);
  lid.rotation.x = -2.0; // hinged open
  group.add(lid);

  const packs = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.1, 0.42),
      lambert(0x111014)
    );
    p.position.set(-0.55 + (i % 4) * 0.36, 0.27, -0.22 + Math.floor(i / 4) * 0.44);
    const foil = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.02, 0.34),
      lambert(0xd8dde4, { emissive: 0x6a7078 })
    );
    foil.position.y = 0.06;
    p.add(foil);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.09), lambert(0x8f1d1d, { emissive: 0x3a0808 }));
    seal.position.set(0.07, 0.07, 0.12);
    p.add(seal);
    group.add(p);
    packs.push({ mesh: p, foil, intact: true });
  }
  return { group, lid, packs, shell };
}

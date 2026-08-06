import * as THREE from 'three';

/**
 * The escape route, built around the instructions instead of against them.
 *
 * The owner's note: *"the instructions tell you to go left but the road is
 * right. Lets build the road around the instructions."* He was reading the
 * scene correctly. Rippinflow's authored calls are
 *
 *   "Left out, wrong way on purpose, then the warehouse lights."
 *   "Left at the warehouse. Hold it through Market, then right at the glass tower."
 *   "Roadblock. Center gap."
 *   "Canal road next."
 *
 * — LEFT, LEFT, RIGHT, straight, LEFT. The old geometry started the car
 * heading -Z and put the first junction's only continuation at +X, which from
 * that heading is a RIGHT (`right = forward × up`; forward -Z gives +X), and
 * the second turn was a left where the call says right. Two of the four calls
 * were mirrored.
 *
 * The road is now laid out from the calls. Starting heading NORTH (+Z):
 *
 *   leg 0  N   the garage exit lane
 *   node 0 LEFT  → E   "left out"
 *   leg 1  E   warehouse row
 *   node 1 LEFT  → S   "left at the warehouse", onto Market
 *   leg 2  S   Market Street
 *   node 2 RIGHT → E   "right at the glass tower", into the financial district
 *   leg 3  E   with the roadblock partway along it — straight through the gap
 *   node 4 LEFT  → S   the canal service road
 *   leg 4  S   down to the industrial swap, which has not moved
 *
 * Turn handedness in this project's frame: `right = forward × (0,1,0)`. So
 * heading N, left is +X; heading E, left is -Z; heading S, left is -X; heading
 * W, left is +Z. Every junction below was placed with that rule and there is a
 * test that re-derives it from the route rather than trusting this comment.
 *
 * The second half of the note — *"do blocked roads so you just have to stay on
 * the road you are on"* — is `BARRIERS`: every junction's wrong continuations
 * dead-end in concrete twelve metres past the turn, so the route is a route
 * rather than a suggestion, and the player is never punished for guessing.
 */

/**
 * Lambert, not Standard, and one shared unit box for the whole city.
 *
 * The route is about fourteen hundred pieces of geometry moving past the
 * camera at sixty miles an hour with eight practical lights on it. Built the
 * naive way — a `BoxGeometry` per piece and a PBR material on all of them —
 * that is fourteen hundred geometries and a physically-based shader evaluated
 * per light per fragment, which measured at under one frame per second in the
 * software rasteriser the verifier runs on. Sharing the geometry and dropping
 * to Lambert costs nothing visually at this distance and speed. Only the metal
 * that is meant to catch a highlight stays Standard.
 */
const MAT = {
  asphalt: new THREE.MeshLambertMaterial({ color: 0x1b1f22 }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x4c4e4d }),
  kerb: new THREE.MeshLambertMaterial({ color: 0x6a6c68 }),
  brick: new THREE.MeshLambertMaterial({ color: 0x4a3630 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x4e5054 }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x3a3d40 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x35393c, metalness: 0.7, roughness: 0.4 }),
  darkSteel: new THREE.MeshLambertMaterial({ color: 0x191c1f }),
  paint: new THREE.MeshLambertMaterial({ color: 0xc9b977 }),
  glassTower: new THREE.MeshStandardMaterial({
    color: 0x24333d, metalness: 0.55, roughness: 0.22,
  }),
};

/** One unit cube for the entire city; size lives in each mesh's scale. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const EMISSIVE = {
  warm: new THREE.MeshBasicMaterial({ color: 0x8f7547, toneMapped: false }),
  cool: new THREE.MeshBasicMaterial({ color: 0x536b70, toneMapped: false }),
  practical: new THREE.MeshBasicMaterial({ color: 0xe4c36f, toneMapped: false }),
  neonRed: new THREE.MeshBasicMaterial({ color: 0xd2434b, toneMapped: false }),
  neonBlue: new THREE.MeshBasicMaterial({ color: 0x4a8fd6, toneMapped: false }),
  neonGreen: new THREE.MeshBasicMaterial({ color: 0x5fbf7a, toneMapped: false }),
  signalRed: new THREE.MeshBasicMaterial({ color: 0xe2352f, toneMapped: false }),
  signalAmber: new THREE.MeshBasicMaterial({ color: 0xd99a2b, toneMapped: false }),
  signalGreen: new THREE.MeshBasicMaterial({ color: 0x3fbf6a, toneMapped: false }),
};

const NEONS = [EMISSIVE.neonRed, EMISSIVE.neonBlue, EMISSIVE.neonGreen];

function box(group, size, position, material, name = '') {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(...position);
  if (name) mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  group.add(mesh);
  return mesh;
}

/**
 * The five road segments, in the order they are driven.
 * `axis` is the direction the leg runs; `w` is always the X extent.
 */
export const ROUTE_ROADS = Object.freeze([
  Object.freeze({ id: 'garage_lane', x: -480, z: 60, w: 24, d: 110, axis: 'z' }),
  Object.freeze({ id: 'warehouse_row', x: -360, z: 95, w: 264, d: 24, axis: 'x' }),
  Object.freeze({ id: 'market_street', x: -240, z: -78, w: 24, d: 372, axis: 'z' }),
  Object.freeze({ id: 'financial_row', x: -104, z: -250, w: 296, d: 24, axis: 'x' }),
  Object.freeze({ id: 'canal_road', x: 20, z: -450, w: 24, d: 444, axis: 'z' }),
]);

/** Where the escape car starts: on the garage lane, pointing north. */
export const ESCAPE_START = Object.freeze({ x: -480, z: 22, heading: 0 });

/**
 * The authored turns.
 *
 * `heading` is the compass direction you are travelling when you REACH the
 * node; `turn` is what the call tells you to do there. The geometry above was
 * derived from these two columns and `tests/heist-route.test.mjs` re-derives it
 * again, so a road can never quietly disagree with an instruction again.
 */
export const ROUTE_NODES = Object.freeze([
  Object.freeze({
    id: 'garage_left', x: -480, z: 95, radius: 18,
    label: 'LEFT OUT — WAREHOUSE ROW', heading: 'N', turn: 'left',
  }),
  Object.freeze({
    id: 'warehouse_left', x: -240, z: 95, radius: 18,
    label: 'LEFT — MARKET STREET', heading: 'E', turn: 'left',
  }),
  Object.freeze({
    id: 'tower_right', x: -240, z: -250, radius: 18,
    label: 'RIGHT — FINANCIAL DISTRICT', heading: 'S', turn: 'right',
  }),
  Object.freeze({
    id: 'roadblock', x: -100, z: -250, radius: 20,
    label: 'CENTER GAP — ROADBLOCK', heading: 'E', turn: 'straight',
  }),
  Object.freeze({
    id: 'canal_turn', x: 20, z: -250, radius: 18,
    label: 'LEFT — CANAL SERVICE ROAD', heading: 'E', turn: 'left',
  }),
  Object.freeze({
    id: 'industrial_swap', x: 20, z: -650, radius: 20,
    label: 'INDUSTRIAL SWAP — KILL THE LIGHTS', heading: 'S', turn: 'stop',
  }),
]);

/** Unit vectors for the four compass headings, in this project's frame. */
export const HEADING_VECTORS = Object.freeze({
  N: Object.freeze({ x: 0, z: 1 }),
  E: Object.freeze({ x: 1, z: 0 }),
  S: Object.freeze({ x: 0, z: -1 }),
  W: Object.freeze({ x: -1, z: 0 }),
});

/** left/right of a heading, from `right = forward × up` with up = +Y. */
export function turnFrom(heading, turn) {
  const cycle = { N: 'E', E: 'S', S: 'W', W: 'N' };      // clockwise on the map
  const anti = { N: 'W', W: 'S', S: 'E', E: 'N' };
  if (turn === 'straight' || turn === 'stop') return heading;
  // right = forward × up. forward N (0,0,1) × (0,1,0) = (-1,0,0) = W.
  return turn === 'right' ? anti[heading] : cycle[heading];
}

/**
 * The dead ends.
 *
 * Each entry is a solid slab across a road stub, twelve to sixteen metres past
 * a junction, on every continuation the instructions do NOT name. Reaching one
 * is a bump and a stop, not a fail state — the road simply is not there.
 */
export const BARRIERS = Object.freeze([
  // garage_left: straight on north, and the right-hand stub of warehouse row.
  Object.freeze({ id: 'block_lane_north', x: -480, z: 113, w: 26, d: 5 }),
  Object.freeze({ id: 'block_warehouse_west', x: -490, z: 95, w: 5, d: 26 }),
  // warehouse_left: straight on east past the junction, and Market northbound.
  Object.freeze({ id: 'block_warehouse_east', x: -226, z: 95, w: 5, d: 26 }),
  Object.freeze({ id: 'block_market_north', x: -240, z: 106, w: 26, d: 5 }),
  // tower_right: Market southbound past the turn, and the financial row's west stub.
  Object.freeze({ id: 'block_market_south', x: -240, z: -262, w: 26, d: 5 }),
  Object.freeze({ id: 'block_financial_west', x: -250, z: -250, w: 5, d: 26 }),
  // canal_turn: the financial row's east stub, and the canal road northbound.
  Object.freeze({ id: 'block_financial_east', x: 42, z: -250, w: 5, d: 26 }),
  Object.freeze({ id: 'block_canal_north', x: 20, z: -232, w: 26, d: 5 }),
]);

/**
 * City blocks along the route: [x, z, width, depth, storeys].
 *
 * EVERY ONE OF THESE IS OFF THE ROAD, AND THERE IS A TEST.
 *
 * Owner: *"buildings intrude into the road"*. Two of the forty-one did, and
 * measurably: the warehouse at (-455, 78) put ten metres of itself across the
 * westbound carriageway of Warehouse Row, and the financial tower at (0,-290)
 * stood nine metres into the twenty-four-metre Canal Road — the leg the drive
 * finishes on. `intersectsDrivingObstacle` does not know about them (it reads
 * `BARRIERS`, which is a different list), so the car drove THROUGH the two of
 * them, which is worse than being blocked by them.
 *
 * `tests/heist-route.test.mjs` now derives every block's footprint and every
 * road corridor from these two tables and asserts they do not meet, with the
 * shopfront awning's 0.65 m included in the footprint — so the next building
 * that lands on a road fails a test rather than being driven through.
 */
const BLOCKS = [
  // Garage lane — low warehouse stock either side.
  [-505, 30, 22, 46, 2], [-455, 24, 22, 40, 2],
  // Pulled south off Warehouse Row: this one had 10 m of itself in the road.
  [-505, 84, 22, 30, 2], [-455, 64, 22, 30, 3],
  // Warehouse row — long sheds and loading bays.
  [-440, 70, 44, 22, 2], [-380, 70, 46, 22, 3], [-318, 70, 44, 22, 2],
  [-440, 120, 44, 22, 3], [-380, 120, 46, 22, 2], [-318, 120, 44, 22, 4],
  [-268, 122, 26, 26, 3],
  // Market Street — mid-rise commercial, both kerbs.
  [-268, 40, 22, 50, 5], [-212, 44, 22, 50, 4],
  [-268, -20, 22, 50, 6], [-212, -16, 22, 50, 5],
  [-268, -80, 22, 50, 4], [-212, -76, 22, 50, 7],
  [-268, -140, 22, 50, 6], [-212, -136, 22, 50, 5],
  [-268, -200, 22, 42, 5], [-212, -196, 22, 42, 8],
  // Financial district — the glass tower on the corner, then towers east.
  [-212, -282, 30, 30, 12], [-160, -212, 34, 30, 9],
  [-150, -286, 36, 32, 11], [-84, -216, 34, 30, 14],
  [-70, -288, 34, 32, 8], [-8, -214, 32, 30, 12],
  // Pushed west clear of Canal Road: this ten-storey tower stood 9 m into it.
  [-16, -290, 34, 34, 10], [56, -216, 30, 30, 7],
  // Canal road — industrial, sheds and yards.
  [-6, -300, 24, 44, 2], [46, -304, 24, 44, 3],
  [-6, -370, 24, 52, 2], [46, -366, 24, 52, 2],
  [-6, -444, 24, 52, 3], [46, -440, 24, 52, 2],
  [-6, -520, 24, 52, 2], [46, -516, 24, 52, 3],
  [-6, -596, 24, 48, 2], [46, -592, 24, 48, 2],
  [-6, -664, 24, 40, 2], [46, -660, 24, 40, 2],
];

const STOREY = 3.6;

function buildFacade(group, [x, z, w, d, storeys], index) {
  // Ten storeys and up is a tower, and a tower in this city is glass — which is
  // what makes "right at the glass tower" a landmark a driver can actually see.
  const glass = storeys >= 10;
  const height = storeys * STOREY;
  const material = glass ? MAT.glassTower : (index % 3 === 0 ? MAT.brick : MAT.stone);
  const shell = box(group, [w, height, d], [x, height / 2, z], material,
    `route-building-${index + 1}`);
  shell.userData.kind = 'route-building';

  /* Ground-floor shopfront: a dark recess, a lit sign band and an awning. The
   * eye reads a street at speed from the bottom four metres of it. */
  const front = d / 2 + 0.06;
  box(group, [w * 0.7, 2.6, 0.12], [x, 1.5, z + front], MAT.darkSteel);
  const sign = box(group, [w * 0.52, 0.42, 0.1], [x, 3.35, z + front + 0.05],
    NEONS[index % NEONS.length], `route-signage-${index + 1}`);
  sign.userData.kind = 'route-signage';
  if (index % 2 === 0) {
    const awning = box(group, [w * 0.6, 0.1, 1.1], [x, 2.95, z + front + 0.55], MAT.darkSteel);
    awning.rotation.x = -0.16;
    awning.updateMatrix();   // boxes here are static-matrix; a late rotation needs this
  }

  /* Window bands, every storey, on the two faces a driver can see. */
  for (let level = 1; level < storeys; level++) {
    const y = level * STOREY + 1.6;
    const material2 = (index + level) % 3 === 0 ? EMISSIVE.cool : EMISSIVE.warm;
    const strip = box(group, [Math.max(1.8, w * 0.72), 0.5, 0.08],
      [x, y, z + front], material2, `driving-window-front-${index + 1}-${level}`);
    strip.userData.kind = 'driving-window-strip';
    const side = box(group, [0.08, 0.5, Math.max(1.8, d * 0.72)],
      [x + w / 2 + 0.06, y, z], material2, `driving-window-side-${index + 1}-${level}`);
    side.userData.kind = 'driving-window-strip';
    const west = box(group, [0.08, 0.5, Math.max(1.8, d * 0.72)],
      [x - w / 2 - 0.06, y, z], material2, `driving-window-west-${index + 1}-${level}`);
    west.userData.kind = 'driving-window-strip';
  }

  /* Roof furniture, so the skyline is not a row of identical extrusions. */
  if (storeys >= 4) {
    box(group, [w * 0.3, 1.4, d * 0.3], [x + w * 0.16, height + 0.7, z - d * 0.16], MAT.concrete);
    box(group, [0.16, 3.4, 0.16], [x - w * 0.24, height + 1.7, z + d * 0.2], MAT.steel);
  }
  if (storeys >= 8) {
    const beacon = box(group, [0.3, 0.3, 0.3], [x - w * 0.24, height + 3.5, z + d * 0.2],
      EMISSIVE.signalRed, `route-beacon-${index + 1}`);
    beacon.userData.kind = 'route-beacon';
  }
}

function buildStreetFurniture(group, road, index) {
  const along = road.axis === 'z';
  const length = along ? road.d : road.w;
  const half = (along ? road.w : road.d) / 2;
  const count = Math.max(3, Math.floor(length / 34));
  for (let i = 0; i < count; i++) {
    const t = -length / 2 + (i + 0.5) * (length / count);
    const side = i % 2 ? 1 : -1;
    const x = along ? road.x + side * (half + 1.4) : road.x + t;
    const z = along ? road.z + t : road.z + side * (half + 1.4);

    // Lamp: post, arm, and a lit head over the carriageway.
    box(group, [0.16, 7.2, 0.16], [x, 3.6, z], MAT.steel, `route-lamp-post-${index}-${i}`);
    const armX = along ? -side * 1.5 : 0;
    const armZ = along ? 0 : -side * 1.5;
    box(group, [along ? 3 : 0.12, 0.12, along ? 0.12 : 3], [x + armX, 7.05, z + armZ], MAT.steel);
    const head = box(group, [0.8, 0.16, 0.36], [x + armX * 2, 6.9, z + armZ * 2],
      EMISSIVE.practical, `route-practical-${index}-${i}`);
    head.userData.kind = 'route-practical';

    if (i % 3 === 1) {
      // Hydrant and a bin: small, cheap, and the road stops reading as a table.
      box(group, [0.24, 0.7, 0.24], [x + (along ? -side * 0.9 : 0), 0.35,
        z + (along ? 0 : -side * 0.9)], EMISSIVE.signalRed);
      box(group, [0.5, 0.8, 0.5], [x + (along ? -side * 0.4 : 1.6), 0.4,
        z + (along ? 1.6 : -side * 0.4)], MAT.darkSteel);
    }
    if (i % 4 === 2) {
      // Bus shelter with a lit panel.
      const sx = x + (along ? -side * 1.1 : 0);
      const sz = z + (along ? 0 : -side * 1.1);
      box(group, [along ? 1.2 : 3.4, 0.12, along ? 3.4 : 1.2], [sx, 2.5, sz], MAT.darkSteel);
      box(group, [0.12, 2.4, 0.12], [sx, 1.25, sz], MAT.steel);
      box(group, [along ? 0.08 : 1.2, 1.5, along ? 1.2 : 0.08], [sx, 1.6, sz], EMISSIVE.cool);
    }
  }
}

function buildSidewalks(group, road, index) {
  const along = road.axis === 'z';
  const half = (along ? road.w : road.d) / 2;
  for (const side of [-1, 1]) {
    const x = along ? road.x + side * (half + 1.7) : road.x;
    const z = along ? road.z : road.z + side * (half + 1.7);
    const size = along ? [3.4, 0.28, road.d] : [road.w, 0.28, 3.4];
    box(group, size, [x, 0.14, z], MAT.sidewalk, `route-sidewalk-${index}-${side}`);
    const kerbSize = along ? [0.3, 0.34, road.d] : [road.w, 0.34, 0.3];
    const kerbX = along ? road.x + side * (half + 0.15) : road.x;
    const kerbZ = along ? road.z : road.z + side * (half + 0.15);
    box(group, kerbSize, [kerbX, 0.17, kerbZ], MAT.kerb);
  }
}

function buildLaneMarkings(group, road) {
  const along = road.axis === 'z';
  const length = along ? road.d : road.w;
  const start = (along ? road.z : road.x) - length / 2 + 6;
  for (let t = start; t < start + length - 10; t += 15) {
    const pos = along ? [road.x, 0.016, t] : [t, 0.016, road.z];
    box(group, along ? [0.2, 0.02, 6] : [6, 0.02, 0.2], pos, MAT.paint);
  }
  // Kerbside parking hatching, so the lane width is legible at speed.
  const edge = (along ? road.w : road.d) / 2 - 2.4;
  for (let t = start; t < start + length - 10; t += 30) {
    for (const side of [-1, 1]) {
      const pos = along ? [road.x + side * edge, 0.016, t] : [t, 0.016, road.z + side * edge];
      box(group, along ? [0.14, 0.02, 9] : [9, 0.02, 0.14], pos, MAT.paint);
    }
  }
}

/**
 * A parked car, at set-dressing fidelity.
 *
 * Deliberately five boxes on the shared unit geometry rather than the level's
 * full `makeVehicleBody`. Twenty-seven of those at twenty-five meshes each,
 * every one with its own geometry, is seven hundred draw calls of parked cars
 * — which is what pinned the escape to under a frame a second. These are
 * kerbside silhouettes the player passes at sixty; the cars that matter (his,
 * the cruisers, the roadblock, the clean car) are still the modelled one.
 */
function buildParkedCars(group, road, index) {
  const along = road.axis === 'z';
  const length = along ? road.d : road.w;
  const edge = (along ? road.w : road.d) / 2 - 2.3;
  const colours = [0x2c3136, 0x53201f, 0x1e3040, 0x3b3a2c, 0x4a4a4e];
  const parked = [];
  const count = Math.max(2, Math.floor(length / 62));
  for (let i = 0; i < count; i++) {
    const t = -length / 2 + 24 + i * (length / count);
    const side = i % 2 ? 1 : -1;
    const x = along ? road.x + side * edge : road.x + t;
    const z = along ? road.z + t : road.z + side * edge;
    const body = new THREE.MeshLambertMaterial({ color: colours[(index + i) % colours.length] });
    const long = along ? [1.9, 0.7, 4.2] : [4.2, 0.7, 1.9];
    const cab = along ? [1.7, 0.6, 2.0] : [2.0, 0.6, 1.7];
    box(group, long, [x, 0.62, z], body, `route-parked-${index}-${i}`);
    box(group, cab, [x, 1.2, z], body);
    box(group, along ? [1.98, 0.34, 3.4] : [3.4, 0.34, 1.98], [x, 0.4, z], MAT.darkSteel);
    const lampZ = along ? 2.05 : 0;
    const lampX = along ? 0 : 2.05;
    box(group, [0.1, 0.16, 0.24], [x + lampX, 0.72, z + lampZ], EMISSIVE.signalRed);
    parked.push({ x, z, w: along ? 2.1 : 4.3, d: along ? 4.3 : 2.1 });
  }
  return parked;
}

/**
 * Which way a mast has to be turned so its lenses face the oncoming driver.
 *
 * Owner: *"traffic lights face the wrong way"*. They faced ONE way — every
 * signal in the city was built at `node.x, node.z` with no rotation at all,
 * so all six lenses pointed at world +Z. Driving east along the financial row
 * you passed six signals showing you their backs, and the one at `canal_turn`
 * — the turn the whole last leg hangs on — was side-on.
 *
 * `ROUTE_NODES` already carries `heading`: the compass direction you are
 * TRAVELLING when you reach the node. A driver on heading H is looking along
 * +H, so the lens must point along −H. The lenses sit on the mast's local +Z,
 * and local +Z maps to world `(sin θ, cos θ)`, so θ = atan2(−Hx, −Hz).
 *
 * @param {string} heading one of N/E/S/W
 * @returns {number} yaw in radians
 */
export function signalYawForHeading(heading) {
  const vector = HEADING_VECTORS[heading] ?? HEADING_VECTORS.N;
  return Math.atan2(-vector.x, -vector.z);
}

function buildSignal(group, node) {
  const mast = new THREE.Group();
  mast.name = `route-signal-${node.id}`;
  mast.position.set(node.x, 0, node.z);
  // Turned to face whoever is arriving. See `signalYawForHeading`.
  mast.rotation.y = signalYawForHeading(node.heading);
  mast.userData.kind = 'route-signal';
  mast.userData.heading = node.heading;

  /* The pole stands on the kerb of a 24 m road — 11.5 m out, not 9 — and the
   * arm reaches back over the carriageway to hang the head near the centre
   * line, which is where a driver looks for it. */
  box(mast, [0.22, 8.2, 0.22], [-11.5, 4.1, 0], MAT.steel);
  box(mast, [11.4, 0.18, 0.18], [-5.9, 7.8, 0], MAT.steel);
  box(mast, [1.6, 0.14, 0.14], [-10.7, 7.0, 0], MAT.steel).rotation.z = 0.62;

  /* Three lenses, in the order every signal in the world has them, with a
   * hood over each. Two of three was part of why they did not read as
   * signals even when you were looking at the front of one. */
  const housing = box(mast, [0.44, 1.5, 0.36], [-0.4, 7.0, 0], MAT.darkSteel);
  housing.name = `route-signal-housing-${node.id}`;
  const lenses = [
    [7.48, EMISSIVE.signalRed], [7.0, EMISSIVE.signalAmber], [6.52, EMISSIVE.signalGreen],
  ];
  for (const [y, material] of lenses) {
    box(mast, [0.17, 0.17, 0.06], [-0.4, y, 0.2], material);
    // The hood: a lip above each lens, which is what makes a light a signal.
    box(mast, [0.3, 0.05, 0.16], [-0.4, y + 0.13, 0.26], MAT.darkSteel).rotation.x = -0.22;
  }
  // A back-plate behind the head, so the housing reads against a bright sky.
  box(mast, [0.72, 1.72, 0.05], [-0.4, 7.0, -0.2], MAT.darkSteel);

  const plate = box(mast, [2.8, 0.62, 0.08], [-5.4, 6.5, 0], MAT.sidewalk,
    `route-sign-${node.id}`);
  plate.userData.kind = 'route-sign';
  plate.userData.label = node.label;
  group.add(mast);
  return mast;
}

function buildBarrier(group, barrier) {
  const g = new THREE.Group();
  g.name = `route-barrier-${barrier.id}`;
  g.position.set(barrier.x, 0, barrier.z);
  const wide = barrier.w > barrier.d;
  const span = wide ? barrier.w : barrier.d;
  // Jersey barriers across the mouth, a works fence behind them, and a sign.
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * (span / 3);
    box(g, wide ? [span / 3 - 0.4, 1.1, 0.9] : [0.9, 1.1, span / 3 - 0.4],
      wide ? [offset, 0.55, 0] : [0, 0.55, offset], MAT.concrete);
  }
  box(g, wide ? [span, 2.2, 0.14] : [0.14, 2.2, span],
    [0, 1.1, wide ? -0.7 : 0], MAT.steel);
  const sign = box(g, wide ? [2.6, 0.9, 0.1] : [0.1, 0.9, 2.6], [0, 2.1, 0],
    EMISSIVE.signalAmber, `route-closed-${barrier.id}`);
  sign.userData.kind = 'route-road-closed';
  for (const side of [-1, 1]) {
    box(g, [0.34, 0.34, 0.34],
      wide ? [side * (span / 2 - 0.6), 1.3, 0.4] : [0.4, 1.3, side * (span / 2 - 0.6)],
      EMISSIVE.signalAmber);
  }
  group.add(g);
  return g;
}

/**
 * Build the whole route into `group`.
 *
 * @param {THREE.Group} group the driving phase's root
 * @param {Function} vehicleFactory `(group, position, colour, name) => Group`,
 *   passed in so the city shares `level.js`'s one car builder.
 * @returns {object} roads, route, obstacles, barriers and the lights
 */
export function buildEscapeCity(group, vehicleFactory) {
  const obstacles = [];

  for (const [index, road] of ROUTE_ROADS.entries()) {
    /* A MILLIMETRE OF STAGGER, AND IT MATTERS.
     *
     * Consecutive roads meet at a junction, and a junction is where two 24 m
     * slabs cross — 576 m² of two asphalt surfaces at exactly y 0, fighting
     * for every pixel of it. `scene-audit` calls that COPLANAR and the owner
     * calls it *"black bar ... non stop flicker"*; there are four of them on
     * the escape route, one at every turn the drive is built around, which is
     * the worst possible place to put a shimmering square.
     *
     * Each road sits 1.2 mm below the one before it, so at a junction the
     * earlier road's surface simply wins. The step is a tenth of the lane
     * paint's thickness and nothing in the drive reads road height: the car
     * runs on a fixed y and `intersectsDrivingObstacle` is flat. */
    box(group, [road.w, 0.2, road.d], [road.x, -0.1 - index * 0.0012, road.z],
      MAT.asphalt, `route-road-${road.id}`);
    buildLaneMarkings(group, road);
    buildSidewalks(group, road, index);
    buildStreetFurniture(group, road, index);
    for (const solid of buildParkedCars(group, road, index)) obstacles.push(solid);
  }

  for (const [index, block] of BLOCKS.entries()) {
    buildFacade(group, block, index);
    obstacles.push({ x: block[0], z: block[1], w: block[2], d: block[3] });
  }

  for (const node of ROUTE_NODES) {
    if (node.turn === 'stop') continue;
    buildSignal(group, node);
    const marker = box(group, [0.44, 5, 0.44], [node.x, 2.5, node.z],
      EMISSIVE.practical, `route-${node.id}`);
    marker.userData.routeNode = node.id;
    marker.visible = false;
  }

  for (const barrier of BARRIERS) {
    buildBarrier(group, barrier);
    obstacles.push({ x: barrier.x, z: barrier.z, w: barrier.w, d: barrier.d });
  }

  /* Overhead lighting for the junctions: what makes a turn readable a hundred
   * metres out at sixty miles an hour. Four of them, not eight — every extra
   * point light is another full lighting pass over every fragment of the city,
   * and the lamp heads and shopfront bands carry the rest of the read on their
   * own because they are unlit emissive strips. */
  const lights = [];
  for (const [x, z] of [[-480, 95], [-240, 95], [-240, -250], [20, -250]]) {
    const light = new THREE.PointLight(0xffd69b, 4.2, 120, 2);
    light.position.set(x, 10, z);
    group.add(light);
    lights.push(light);
  }

  return {
    roads: ROUTE_ROADS.map((road) => ({ x: road.x, z: road.z, w: road.w, d: road.d })),
    route: ROUTE_NODES,
    obstacles,
    barriers: BARRIERS,
    lights,
  };
}

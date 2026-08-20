/**
 * THE SPECIAL MEETING — the block, as numbers.
 *
 * Every measurement the exterior is built from lives here, in one plain-data
 * module with no THREE import, because four separate things have to agree
 * about where the kerb is: the geometry that draws it, the colliders that stop
 * you walking through it, the car that has to pull up against it, and the
 * tests that check all three. The moment any of those carries its own copy of
 * a number, one of them is wrong and nothing says so.
 *
 * The frame:
 *
 *   +X is east, and the street runs along it. The road's centreline is z = 0.
 *   The apartment building is on the NORTH side, at negative z. The closed
 *   laundromat is across the road at positive z.
 *
 * Which side of the road the car uses is not decoration. Traffic here drives
 * on the right, so a car heading EAST hugs the negative-z kerb — the kerb the
 * apartment door is on. That is why the sedan comes from the west end and why
 * its FRONT PASSENGER door, on the car's kerb side, opens onto the pavement
 * the player is standing on. The front seat is the one nearest him. It is
 * meant to be.
 */

/** Road surface, kerb to kerb. */
export const ROAD = Object.freeze({
  centreZ: 0,
  halfWidth: 4.5,
  kerbHeight: 0.15,
  /** How far the asphalt is drawn in each direction before the fog has it. */
  minX: -78,
  maxX: 78,
});

/** The two pavements. `z0` is the kerb face, `z1` the building line. */
export const SIDEWALK = Object.freeze({
  north: Object.freeze({ z0: -ROAD.halfWidth, z1: -8.4, minX: -40, maxX: 34 }),
  south: Object.freeze({ z0: ROAD.halfWidth, z1: 8.2, minX: -40, maxX: 34 }),
});

/** Eastbound lane centre: the lane the sedan arrives in. */
export const EASTBOUND_LANE_Z = -2.2;
/** Westbound lane centre, used by the traffic that never stops here. */
export const WESTBOUND_LANE_Z = 2.2;

/** The apartment block itself. Four storeys of brick with a lit doorway. */
export const APARTMENT = Object.freeze({
  minX: -13.5,
  maxX: 6.5,
  facadeZ: SIDEWALK.north.z1,
  depth: 14,
  storeys: 4,
  storeyHeight: 3.1,
  parapet: 0.8,
  /** Street number over the door, and the door's x. */
  entranceX: -4,
  entranceWidth: 2.6,
  number: '1149',
});

export const APARTMENT_HEIGHT = APARTMENT.storeys * APARTMENT.storeyHeight + APARTMENT.parapet;

/** Where the player is left standing when he comes downstairs. */
export const SPAWN = Object.freeze({
  x: APARTMENT.entranceX,
  z: -6.4,
  /** Player yaw convention is forward = (-sin y, -cos y); PI looks at +z. */
  yaw: Math.PI,
  /** Pavement top, so a scene can drop an eye height on it. */
  groundY: ROAD.kerbHeight,
});

/** The service alley, west of the building. Six metres, and no way through. */
export const ALLEY = Object.freeze({
  minX: -20.5,
  maxX: -14.5,
  mouthZ: SIDEWALK.north.z1,
  endZ: -25,
  dumpster: Object.freeze({ x: -18.5, z: -14.2, yaw: 0.08 }),
  serviceDoor: Object.freeze({ x: -14.5, z: -11.6 }),
  fireEscape: Object.freeze({ x: -14.5, z: -17.4 }),
});

/** The neighbour to the west of the alley — five storeys, no entrance. */
export const NEIGHBOUR = Object.freeze({
  minX: -34,
  maxX: ALLEY.minX,
  facadeZ: SIDEWALK.north.z1,
  depth: 16,
  height: 16.4,
});

/** The small parking area east of the building. Four bays and a lamp. */
export const PARKING = Object.freeze({
  minX: 8.6,
  maxX: 20.6,
  minZ: -19,
  maxZ: SIDEWALK.north.z1,
  /** The break in the kerb the cars use. */
  curbCut: Object.freeze({ minX: 10.4, maxX: 15.4 }),
  bayWidth: 2.7,
  bays: 4,
  /** Bay centres, west to east, filled from the data below. */
  parked: Object.freeze([
    Object.freeze({ bay: 0, kind: 'sedan', colour: 0x232630 }),
    Object.freeze({ bay: 1, kind: 'compact', colour: 0x4a3b22, dented: true }),
    Object.freeze({ bay: 3, kind: 'suv', colour: 0x1b1f26 }),
  ]),
});

/** Across the road. Nothing here is open and one of them never will be. */
export const SOUTH_BLOCK = Object.freeze({
  facadeZ: SIDEWALK.south.z1,
  depth: 15,
  storeys: 3,
  storeyHeight: 3.4,
  units: Object.freeze([
    Object.freeze({ id: 'warehouse', minX: -26, maxX: -9.5, kind: 'blank' }),
    Object.freeze({ id: 'laundromat', minX: -9.5, maxX: 3.5, kind: 'laundromat' }),
    Object.freeze({ id: 'shoe-repair', minX: 3.5, maxX: 15, kind: 'shuttered' }),
    Object.freeze({ id: 'corner', minX: 15, maxX: 30, kind: 'blank' }),
  ]),
});

/**
 * Street lighting.
 *
 * `live` is the short list that gets a real PointLight. Seven posts with seven
 * point lights is seven more forward-lit passes over every wall on the block,
 * and the Bing's lot settled this argument already: three real ones and four
 * emissive heads reads identically and costs a quarter of it.
 */
export const STREETLIGHTS = Object.freeze([
  Object.freeze({ x: -26, side: 'north', live: false }),
  Object.freeze({ x: -10, side: 'north', live: true }),
  Object.freeze({ x: 6, side: 'north', live: true }),
  Object.freeze({ x: 22, side: 'north', live: false }),
  Object.freeze({ x: -18, side: 'south', live: false }),
  Object.freeze({ x: 14, side: 'south', live: true }),
]);

/** Utility poles down the south kerb, and the wires between them. */
export const UTILITY_POLES = Object.freeze([
  Object.freeze({ x: -30, transformer: false }),
  Object.freeze({ x: -4, transformer: true }),
  Object.freeze({ x: 20, transformer: false }),
  Object.freeze({ x: 44, transformer: false }),
]);

/** Cars already at the kerb before anybody turns up. */
export const PARKED_AT_KERB = Object.freeze([
  Object.freeze({ x: -28.5, side: 'north', kind: 'sedan', colour: 0x1d2028 }),
  Object.freeze({ x: -21.5, side: 'north', kind: 'lincoln', colour: 0x14161c }),
  Object.freeze({ x: 12.5, side: 'north', kind: 'sedan', colour: 0x2c2f38, dented: true }),
  Object.freeze({ x: -13.5, side: 'south', kind: 'compact', colour: 0x3a2f45 }),
  Object.freeze({ x: 2.5, side: 'south', kind: 'van', colour: 0xb9b4a6 }),
  Object.freeze({ x: 24, side: 'south', kind: 'sedan', colour: 0x232a22 }),
]);

/** The cross street the sedan comes down, and the one at the far end. */
export const CROSS_STREET = Object.freeze({
  westX: -46,
  eastX: 48,
  halfWidth: 4.5,
});

/**
 * Where the sedan stops.
 *
 * Half a Lincoln is a metre wide, so a centreline at z = −3.35 puts the
 * kerb-side flank 15 cm off a kerb face at −4.5: parked, not abandoned. The x
 * is chosen so the FRONT PASSENGER door lands in front of the entrance, which
 * is the whole staging of the scene.
 */
export const SEDAN_STOP = Object.freeze({
  x: -2.9,
  z: -3.35,
  /** Heading in the vehicle's frame: forward = (sin h, cos h). PI/2 is east. */
  heading: Math.PI / 2,
});

/**
 * The arrival route, west to east, as `{ x, z, speed }`.
 *
 * The first three nodes are on the cross street and off the end of the block,
 * so the first thing the player sees is a pair of headlights swinging round a
 * corner a hundred metres away, raking the west facades on the way past. The
 * turn is a RIGHT turn — tighter, slower, and it puts the car in the kerb-side
 * lane without ever crossing the centreline.
 */
export const ARRIVAL_ROUTE = Object.freeze([
  Object.freeze({ x: CROSS_STREET.westX, z: -20, speed: 9 }),
  Object.freeze({ x: CROSS_STREET.westX, z: -12, speed: 7 }),
  Object.freeze({ x: CROSS_STREET.westX + 1.6, z: -6.2, speed: 5.5 }),
  Object.freeze({ x: CROSS_STREET.westX + 6.5, z: EASTBOUND_LANE_Z, speed: 6 }),
  Object.freeze({ x: -30, z: EASTBOUND_LANE_Z, speed: 7 }),
  Object.freeze({ x: -18, z: EASTBOUND_LANE_Z, speed: 5 }),
  Object.freeze({ x: -11, z: -2.7, speed: 3.2 }),
  Object.freeze({ x: -6.5, z: -3.2, speed: 2 }),
  Object.freeze({ x: SEDAN_STOP.x, z: SEDAN_STOP.z, speed: 0 }),
]);

/** Where the sedan starts: parked, dark, well off the end of the block. */
export const SEDAN_STAGING = Object.freeze({
  x: CROSS_STREET.westX,
  z: -34,
  heading: 0,
});

/** And the way out, once everybody is in it. East, and gone. */
export const DEPARTURE_ROUTE = Object.freeze([
  Object.freeze({ x: 4, z: -2.8, speed: 5 }),
  Object.freeze({ x: 20, z: EASTBOUND_LANE_Z, speed: 9 }),
  Object.freeze({ x: 40, z: EASTBOUND_LANE_Z, speed: 12 }),
  Object.freeze({ x: 74, z: EASTBOUND_LANE_Z, speed: 14 }),
]);

/** Seconds the player stands on the pavement before anything happens. */
export const WAIT_SECONDS = 10;

/** Beat lengths, in seconds, for the arrival state machine. */
export const ARRIVAL_TIMING = Object.freeze({
  /** Headlights come on, and hang there, before the car moves. */
  headlightHold: 1.4,
  /** Handbrake, engine still running, before anything is said. */
  settle: 1.6,
});

/** True while (x, z) is on the carriageway rather than a pavement. */
export function onRoad(x, z) {
  return Math.abs(z - ROAD.centreZ) <= ROAD.halfWidth
    && x >= ROAD.minX && x <= ROAD.maxX;
}

/** Pavement top height at (x, z): the kerb is 15 cm and the road is zero. */
export function groundAt(x, z) {
  if (onRoad(x, z)) return 0;
  if (z > SIDEWALK.north.z1 && z < SIDEWALK.south.z1) return ROAD.kerbHeight;
  /* The parking apron is at pavement height and its curb cut ramps down, but
   * nothing walks it during the beat, so it is flat kerb height like the rest
   * of the block behind the building line. */
  return ROAD.kerbHeight;
}

/** Centre of parking bay `i`, counting from the west. */
export function parkingBay(index) {
  const first = PARKING.minX + 1.3 + PARKING.bayWidth / 2;
  return Object.freeze({
    x: first + index * PARKING.bayWidth,
    z: (PARKING.minZ + PARKING.maxZ) / 2 - 1.2,
  });
}

/** Kerb-face z for a side of the street. */
export function kerbZ(side) {
  return side === 'south' ? SIDEWALK.south.z0 : SIDEWALK.north.z0;
}

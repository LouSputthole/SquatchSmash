// The Beef Run — shared mission constants.
//
// The route runs along -Z. Whispering Pines sits near the origin, El Hueso is
// ~10 km south. Everything in between is a compressed, stylized landscape.

export const KT = 1.94384;          // m/s -> knots
export const FT = 3.28084;          // m -> feet

// ---------- Whispering Pines Municipal ----------
export const WP = {
  x: 0,
  z: 0,
  elev: 42,
  rwyHalf: 430,      // runway runs z = -430 .. +430
  rwyWidth: 11,      // half width
  heading: 180,      // departure is southbound (-Z)
};

/* The return is flown northbound onto runway 36. Keep its restart pose and
 * navigation anchors together: the old checkpoint was 520 m above the field
 * only 2.4 km out, a roughly fifteen-degree dive to the near threshold. This
 * puts a restarted player on the same 4.3-degree arcade glide path that the
 * mission's terrain pass and approach coaching are designed around. */
const homeTouchdownZ = WP.z - WP.rwyHalf + 180;
const homeEntryZ = WP.z - 3600;
const homeGlideSlope = 0.075;
// Aim the straight descent just before the pavement. The loaded Brushrunner
// carries through its flare; aiming the mathematical line at the painted
// touchdown bars made the real wheels arrive beyond the far runway end.
const homeGlideAimZ = WP.z - WP.rwyHalf - 220;
export const HOME_APPROACH = Object.freeze({
  acquireZ: WP.z - 4300,
  finalZ: WP.z - 1450,
  glideSlope: homeGlideSlope,
  threshold: Object.freeze({ x: WP.x, z: WP.z - WP.rwyHalf }),
  touchdown: Object.freeze({ x: WP.x, z: homeTouchdownZ }),
  glideAim: Object.freeze({ x: WP.x, z: homeGlideAimZ }),
  entry: Object.freeze({
    x: WP.x,
    z: homeEntryZ,
    y: WP.elev + (homeGlideAimZ - homeEntryZ) * homeGlideSlope,
    heading: 0,
    speed: 45,
  }),
});

// ---------- El Hueso Mountain Airstrip ----------
// Uphill toward -Z, cliff at the +Z (low) end. Land uphill, depart downhill.
export const EH = {
  x: 40,
  zLow: -9620,
  zHigh: -10240,     // 620 m of dirt, which is barely enough and meant to be
  elevLow: 690,
  elevHigh: 726,     // just under 6% uphill
  rwyWidth: 8,
  runOut: 130,       // flat ground past the top end, before the mountain
};

export const ROUTE_LENGTH = 10400;

// ---------- Terrain zones (by z) ----------
// Each zone drives elevation, palette, scatter density and fog.
export const ZONES = [
  {
    id: 'pines', name: 'Whispering Pines', to: -900,
    base: 42, relief: 26, ridge: 0.35, scale: 900,
    ground: 0x4d7c3c, rock: 0x6b6f5c, tree: 0x35603a, trees: 46, treeScale: 1,
    fog: 0x9fc4e8, fogNear: 300, fogFar: 2600, sky: 0x9fc4e8,
  },
  {
    id: 'forest', name: 'Forest Mountains', to: -2700,
    base: 260, relief: 340, ridge: 1.0, scale: 1500,
    ground: 0x3f6b39, rock: 0x6e7461, tree: 0x2f5836, trees: 64, treeScale: 1.1,
    fog: 0x9dc0e2, fogNear: 300, fogFar: 3000, sky: 0x9fc4e8,
  },
  {
    id: 'farm', name: 'Broken Country', to: -4300,
    base: 90, relief: 40, ridge: 0.12, scale: 1100,
    ground: 0x8f9a4e, rock: 0x8a8570, tree: 0x4a7a38, trees: 8, treeScale: 1,
    fog: 0xd8dcc8, fogNear: 400, fogFar: 3600, sky: 0xbcd4e8,
  },
  {
    id: 'desert', name: 'Mesa Transition', to: -6100,
    base: 210, relief: 190, ridge: 0.8, scale: 900,
    ground: 0xc08a52, rock: 0xa9663a, tree: 0x6b7a4a, trees: 5, treeScale: 0.7,
    fog: 0xe8c69a, fogNear: 400, fogFar: 3800, sky: 0xd8bb92,
  },
  {
    id: 'coast', name: 'Tropical Coast', to: -7700,
    base: 30, relief: 60, ridge: 0.25, scale: 800,
    ground: 0x5f8f4a, rock: 0x8d8a72, tree: 0x2f6b3a, trees: 30, treeScale: 1.2,
    fog: 0xbfe0e8, fogNear: 400, fogFar: 3400, sky: 0xa8d4e8,
  },
  {
    id: 'jungle', name: 'El Hueso Valley', to: -99999,
    base: 700, relief: 520, ridge: 1.25, scale: 1250,
    ground: 0x2f6b34, rock: 0x5c6350, tree: 0x1f5a2c, trees: 92, treeScale: 1.25,
    fog: 0x9ec7a8, fogNear: 250, fogFar: 2400, sky: 0xa9cbd8,
  },
];

// ---------- Aircraft: Mammoth M-12 "Brushrunner" ----------
export const AC = {
  emptyMass: 2350,      // kg
  fuelMass: 380,        // full tanks
  maxCargo: 690,
  wingArea: 32,
  span: 17.2,
  chord: 1.92,
  CL0: 0.26,
  CLa: 5.1,             // per rad
  alphaStall: 0.29,     // ~16.6 deg
  CD0: 0.046,
  kInduced: 0.055,
  flapCL: 0.42,         // per full flap
  flapCD: 0.055,
  thrustMax: 5200,      // N per engine, static
  vThrustFade: 96,      // m/s where static thrust has bled off
  Ixx: 9000, Iyy: 11000, Izz: 10200,   // roll / pitch / yaw
  gearY: 1.62,          // wheel contact below CG
  wheelbase: 3.1,
  track: 3.4,
  vne: 92,              // m/s never-exceed (~179 kt)
  fuelBurn: 0.055,      // kg/s per engine at full power

  /* Ground handling and the pull to the left, which have to be tuned as a set.
   * The nosewheel is a rudder-pedal linkage with very little travel and it has
   * to stay useful until the fin has air over it; the swing has to be small
   * enough that full opposite pedal actually holds the centreline, at any
   * weight, on the worst surface in the mission. `npm run check:flight` measures
   * exactly that, because getting either number wrong looks completely normal
   * from inside the cockpit right up until the aeroplane is in the trees. */
  groundSteer: 0.26,    // rad of nosewheel at full pedal
  steerFadeV: 22,       // m/s where the tyre has handed over to the rudder
  torqueYaw: 1900,      // N·m of left yaw at full power, low speed
  torqueRoll: 1300,     // N·m of left roll with it
};

export const DIFFICULTY = {
  assisted: {
    id: 'assisted', label: 'Assisted',
    stability: 0.65, autoRudder: 0.85, stallGuard: 0.7, gust: 0.45,
    crosswind: 0.35, detectRate: 0.6, landingPath: true, groundAssist: 0.55,
    torque: 0.4,
  },
  standard: {
    id: 'standard', label: 'Standard',
    stability: 0.32, autoRudder: 0.22, stallGuard: 0.25, gust: 1,
    crosswind: 1, detectRate: 1, landingPath: false, groundAssist: 0.28,
    torque: 0.8,
  },
  pro: {
    id: 'pro', label: 'Unstable Professional',
    stability: 0.06, autoRudder: 0, stallGuard: 0, gust: 1.5,
    crosswind: 1.5, detectRate: 1.35, landingPath: false, groundAssist: 0.08,
    torque: 1.25,
  },
};

// Navigation landmarks along the outbound route (also used on the way back).
export const LANDMARKS = [
  { id: 'tower',   name: 'Broken radio tower', x: -180,  z: -1450, kind: 'tower' },
  { id: 'river',   name: 'Horseshoe river',    x: 260,   z: -3300, kind: 'river' },
  { id: 'volcano', name: 'Smoking volcano',    x: -520,  z: -5250, kind: 'volcano' },
  { id: 'cliff',   name: 'Red cliff face',     x: 420,   z: -6900, kind: 'cliff' },
  { id: 'falls',   name: 'The waterfall',      x: 60,    z: -9200, kind: 'falls' },
];

export const CHECKPOINTS = ['takeoff', 'approach', 'departure', 'return'];

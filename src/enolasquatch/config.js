// The Enola Squatch — shared mission constants.
//
// A night bombing-run parody built on the Beef Run's flight model. The
// aeroplane departs Whispering Pines on the SAME physical runway heading the
// Brushrunner uses (`WP.heading = 180`, south) — nothing about the field or
// its geometry changes — climbs out along the existing safe corridor, then
// executes a scripted turn onto 090 (east) for the outbound leg to the
// desert compound. Everything from the turn point onward is new ground the
// Beef Run's southbound `ZONES`/`LANDMARKS` never describe, hence the
// eastbound content below rather than a reuse of `src/beefrun/config.js`'s
// route data.
//
// `AircraftPhysics`, `EngineSystem`, `Instruments` and `CargoWeightSystem`
// are reused unmodified from `src/beefrun/*.js` — see their constructors,
// which all now take an `ac` (and, for engines, `engineNames`) parameter
// instead of importing Beef Run's `AC` directly. This file supplies that
// parameter for the Enola Squatch: `AC_ENOLA` below.

export const KT = 1.94384;          // m/s -> knots (same conversion, re-exported for convenience)
export const FT = 3.28084;          // m -> feet

// ---------- Whispering Pines Municipal ----------
// Deliberately NOT redefined here. The mission imports `WP` and
// `buildAirfield` straight from `src/beefrun/config.js` and
// `src/beefrun/airfield.js` — same physical runway, same hangar, same
// heading. Re-declaring it here would invite the two copies to drift.

/**
 * Where the scripted turn happens: far enough down the existing southbound
 * safety corridor (see the "outbound" carve in `src/beefrun/terrain.js`,
 * confirmed below) that the turn is well clear of the field and its
 * buildings, but before the corridor's fade-out. The corridor's lateral
 * flattening (`smoothstep(820, 300, Math.abs(x - WP.x))`) is centred on
 * `WP.x` and does not follow the aeroplane once it turns east, so the turn
 * needs to happen while there is still altitude in hand — this is a data
 * constant for the mission-wiring phase to trigger the turn beat against,
 * not a physical fence.
 */
export const TURN_POINT = Object.freeze({
  x: 0,
  z: -2600,
  minAltitudeAgl: 260,   // don't turn until at least this high, loaded
  newHeading: 90,        // east — see the design note at the end of this file
});

// ---------- Aircraft: "Enola Squatch" (unnamed 4-engine heavy) ----------
//
// Same shape as Beef Run's `AC`, tuned for a much heavier four-engine
// bomber that is "slower to turn, heavy during takeoff, resistant to sudden
// changes, difficult to climb while loaded, more stable at cruise, and
// vulnerable if banked too sharply" (the brief's words, and the numbers
// below are chosen to make each of those true in `AircraftPhysics` without
// touching a line of it):
//
//  - emptyMass/fuelMass/payloadMass: loaded mass is ~4.9x the Brushrunner's
//    (2350+380=2730 kg) at 13,500 kg, so momentum alone makes it heavy on
//    takeoff and slow to change energy state.
//  - Ixx/Iyy/Izz (roll/pitch/yaw inertia, per the AircraftPhysics comment
//    at the top of physics.js and its `step()`'s angular integration) are
//    roughly 10-13x the Brushrunner's — a wider, heavier aeroplane resists
//    sudden roll and pitch input exactly because more force is needed to
//    accelerate that inertia, which is what "resistant to sudden changes"
//    and "slower to turn" mean in this model.
//  - CLa is lower (4.3 vs 5.1 per radian) and alphaStall carries a wider
//    margin (0.33 vs 0.29 rad) than the Brushrunner: the wing generates lift
//    less eagerly per degree of attack and gives more warning before it
//    stops, which reads as "more stable at cruise" — small attitude changes
//    move the lift less, so the aeroplane wanders less on its own.
//  - kInduced is higher (0.065 vs 0.055): the lower-aspect-ratio wing
//    (span^2/wingArea = 28^2/110 = 7.1, vs the Brushrunner's 9.2) pays more
//    induced drag for the lift it does make, which bites hardest exactly
//    when the pilot hauls it into a hard bank and CL spikes — this is the
//    mechanism behind "vulnerable if banked too sharply": lift-induced drag
//    goes up with the square of CL, energy bleeds off fast, and a heavy
//    aeroplane that bleeds airspeed in a bank is close to the stall margin
//    it was just given a little more of.
//  - thrustMax is much higher per engine (9800 N vs the Brushrunner's 5200)
//    so the aeroplane is flyable at all, but thrust-to-weight at max gross
//    (4 x 9800 = 39200 N vs 13500 kg x 9.81 = 132435 N, a ratio of ~0.296)
//    is noticeably worse than the Brushrunner's loaded ratio of ~0.388 —
//    "difficult to climb while loaded" without needing a separate climb-rate
//    fudge factor anywhere.
//
// IMPORTANT engine-count note for the mission-wiring phase: the dialogue in
// `src/enolasquatch/dialogue/script.js` ('preflight.engineStart': "Start
// sequence. One, then two... Three and four are yours, Prospect.") implies
// a real four-engine `EngineSystem` — i.e. `engineNames` should be something
// like `['one', 'two', 'three', 'four']`, each individually crankable and
// individually damageable, matching the crew banter and the later
// 'emergency.overheat' / 'emergency.shutdown' beats ("she'll fly on three").
// But `AircraftPhysics.step()` (src/beefrun/physics.js) computes its
// aerodynamic forward force as `this.engines.thrust(0, V, rho)` +
// `this.engines.thrust(1, V, rho)` — it reads ONLY engine indices 0 and 1,
// regardless of how many engines exist in `engines.engines`. With a real
// four-engine `EngineSystem`, engines 2 and 3 will spin, burn fuel, heat up,
// and be individually startable/killable (all of `EngineSystem`'s own logic
// iterates `this.engines`, not a fixed pair), but they will NOT currently
// contribute to `sForce.z` in physics — only 0 and 1 do. `thrustMax` above
// is tuned as a per-engine figure assuming this gets resolved (either a
// small physics.js change in a later phase, since this one is scoped to
// leave src/beefrun/ untouched, or a mission-side convention of only ever
// throttling/counting engines 0-1 for thrust purposes while 2-3 are
// narrative/visual). Flagging this prominently rather than quietly working
// around it, since it changes how "difficult to climb while loaded" actually
// plays if only half the engines push.
// 2026-08-04 — the owner asked for a bigger aeroplane ("a little more detail
// on the plane and make it a bit bigger"). The airframe grew about 20% in
// every linear dimension and the numbers below moved with it as a SET, so the
// handling character described above is preserved rather than re-tuned:
//
//   span 28 -> 33.5 m, wingArea 110 -> 145 m^2  (aspect ratio 7.13 -> 7.74,
//     still low enough that kInduced bites in a hard bank)
//   emptyMass 8200 -> 9800, fuelMass 2600 -> 3000; payloadMass is UNCHANGED
//     because the Fat Squatch is "six thousand pounds" out loud, in dialogue.
//   thrustMax 9800 -> 11300 N/engine: loaded T/W is 45200 / (15500 * 9.81) =
//     0.297, within a thousandth of the 0.296 it was before, so "difficult to
//     climb while loaded" means exactly what it meant.
//   Ixx/Iyy/Izz up ~36%, roughly mass x length^2 — still slower to turn, and
//     no more so relative to its own control authority than before.
//   torqueYaw/torqueRoll deliberately NOT raised: Izz went up 36%, so the same
//     torque already produces a gentler swing, which is the right direction for
//     an aeroplane this size on a narrow runway.
export const AC_ENOLA = {
  emptyMass: 9800,      // kg
  fuelMass: 3000,       // full tanks, four engines
  payloadMass: 2700,    // kg — the Fat Squatch. "Six thousand pounds" (Sasole, taxi.line) ~= 2722 kg.
  wingArea: 145,
  span: 33.5,
  chord: 4.4,
  CL0: 0.28,
  CLa: 4.3,             // per rad — lower than the Brushrunner's 5.1: less twitchy per degree
  alphaStall: 0.33,     // ~18.9 deg — more margin than the Brushrunner's 0.29 (~16.6 deg)
  CD0: 0.058,
  kInduced: 0.065,
  flapCL: 0.38,
  flapCD: 0.065,
  airBrakeCD: 0.20,
  thrustMax: 11300,     // N per engine, static — see the engine-count note above
  vThrustFade: 140,     // m/s where static thrust has bled off — bigger engines, holds on longer
  Ixx: 130000, Iyy: 190000, Izz: 170000,  // roll / pitch / yaw
  gearY: 3.0,           // wheel contact below CG
  wheelbase: 7.2,
  track: 7.8,
  vne: 88,              // m/s never-exceed (~171 kt) — this is not a fast aeroplane
  fuelBurn: 0.095,      // kg/s per engine at full power

  /* Ground handling: heavier, less nimble than the Brushrunner. Less
   * nosewheel authority (a bigger tyre and a longer moment arm both cut
   * against agility) and a bit more speed before the rudder alone can hold
   * it, simply because there is more yawing inertia (Izz above) to move. */
  groundSteer: 0.18,    // rad of nosewheel at full pedal
  steerFadeV: 26,       // m/s where the tyre has handed over to the rudder
  torqueYaw: 3400,      // N·m of asymmetric-thrust yaw at full power, low speed
  torqueRoll: 2400,     // N·m of roll that comes with it

  /* Distance from the centreline to one side's thrust line. The four nacelles
   * sit at x = ±6.4 and ±13.4 m (`scenes/EnolaSquatch.js`), so a side's pair
   * averages 9.9 m; 9.6 leaves a little back for the fact that the inboard
   * engine is the one still turning most often. `AircraftPhysics` used to
   * hard-code the Brushrunner's 3.05 m here, which understated an engine-out
   * swing on this airframe by more than a factor of three — see the note at
   * the asymmetric-thrust term in `src/beefrun/physics.js`. */
  engineArm: 9.6,
};

/**
 * Mass bookkeeping for the payload release.
 *
 * `AircraftPhysics` has `this.mass` as a plain settable field — Beef Run's
 * own `CargoWeightSystem.applyTo()` writes `physics.mass = ac.emptyMass +
 * fuelMass + this.mass` every frame (see src/beefrun/cargo.js). The Fat
 * Squatch is a single fixed payload, not a set of loadable/movable crates
 * with their own CG-shifting physics, so pulling in the whole
 * `CargoWeightSystem` (crate zones, straps, slip, `cgOffset` from load
 * position) would be simulating machinery that doesn't exist for this
 * mission — there is exactly one thing back there, it does not move until
 * it is released, and then it is gone. The honest equivalent is this one
 * frame-by-frame mass write, done directly by the mission's own update loop
 * (not by these config/aircraft/payload modules, which stay passive data —
 * this function is exported so mission-wiring has one obvious, tested place
 * to call rather than re-deriving the formula):
 *
 *   physics.mass = enolaMass(fuelRemaining, payloadReleased);
 *
 * `payloadReleased` flips once, from `FatSquatch.release()`, and after that
 * the aeroplane is permanently `payloadMass` lighter — exactly the "she just
 * lost six thousand pounds" beat ('bomb.weightLoss').
 */
export function enolaMass(fuelMass, payloadReleased) {
  return AC_ENOLA.emptyMass + fuelMass + (payloadReleased ? 0 : AC_ENOLA.payloadMass);
}

// ---------- Terrain zones (by x) ----------
// The eastbound route runs along +X past the turn point, not along -Z like
// the Beef Run's `ZONES`. Same shape as `src/beefrun/config.js`'s `ZONES`
// (each entry drives elevation, palette, scatter density and fog) but
// banded by how far east of the field (x) the aeroplane is, and painted for
// a moonlit night rather than Beef Run's daylight route: dark desaturated
// blues climbing into the mountain corridor, paling into a silvered cloud
// bank, then warming into the desert compound's palette as the target
// nears. Brief's requested progression — moonlit mountains, small towns
// below, cloud banks, desert compound — in that order.
export const ZONES_EAST = [
  {
    id: 'foothills', name: 'Moonlit Foothills', to: 1800,
    base: 220, relief: 260, ridge: 0.85, scale: 1100,
    ground: 0x2a3550, rock: 0x44506a, tree: 0x1c2840, trees: 40, treeScale: 1.0,
    fog: 0x1a2440, fogNear: 400, fogFar: 3200, sky: 0x0c1330,
  },
  {
    id: 'corridor', name: 'The Mountain Corridor', to: 4200,
    base: 340, relief: 420, ridge: 1.3, scale: 1300,
    ground: 0x263048, rock: 0x3c4864, tree: 0x18223a, trees: 55, treeScale: 1.1,
    fog: 0x141c34, fogNear: 300, fogFar: 2600, sky: 0x0a1128,
  },
  {
    id: 'lowtown', name: 'Sasquache Flats', to: 6400,
    base: 120, relief: 90, ridge: 0.2, scale: 900,
    ground: 0x384a3c, rock: 0x50584a, tree: 0x243a28, trees: 22, treeScale: 0.9,
    fog: 0x1c2840, fogNear: 450, fogFar: 3600, sky: 0x121c38,
  },
  {
    id: 'clouds', name: 'The Cloud Bank', to: 8200,
    base: 60, relief: 40, ridge: 0.1, scale: 1400,
    ground: 0x30384a, rock: 0x454e60, tree: 0x1c2436, trees: 4, treeScale: 0.6,
    fog: 0xaab8d8, fogNear: 150, fogFar: 1400, sky: 0x28304a,
  },
  {
    id: 'compound', name: 'The Desert Compound', to: 99999,
    base: 240, relief: 70, ridge: 0.15, scale: 900,
    ground: 0x4a3f2e, rock: 0x5a4c38, tree: 0x2c2818, trees: 3, treeScale: 0.6,
    fog: 0x241c2c, fogNear: 500, fogFar: 4200, sky: 0x160f22,
  },
];

/**
 * Where the Enola Squatch is parked, and where the crew stand around it while
 * the walkaround is going on.
 *
 * NOT `airfield.anchors.parking`. That anchor is (-55, elev, 385) heading 090,
 * measured for the Brushrunner's 17.2 m span; with 33.5 m of wing the north
 * tip reaches z 401.5 and stands inside the hangar's east pier collider
 * (`src/beefrun/airfield.js`, `addCollider(-52, 404, 3, 8, 7)`). Nobody had
 * noticed because until now nothing ever put a walking player next to it.
 *
 * These coordinates put the aeroplane on the open south apron: tail at x -70,
 * nose at x -46, wingtips at z 325 and z 359. Clear of the hangar (z 396+),
 * the ops shack (-38, 366), the vending machine, the fuel tank (-72, 372) and
 * the two wrecks (-84, 344 and -90, 328), and inside the airfield's flat pad
 * (`terrainHeight`'s bowl runs 480 m out from the field, so the ground under
 * all of it is exactly `WP.elev`).
 */
export const ENOLA_PARKING = Object.freeze({
  x: -58,
  z: 342,
  heading: 90,          // nose east, wing running north–south, same as the Brushrunner's
  /* Where Tony is standing when the scene opens: off the aeroplane's port
   * side (the aeroplane's left is +X with a +Z nose, so "off the port wing" is
   * -X of the nose, i.e. short of the tail), far enough back that the whole
   * aeroplane is in frame on the first look. */
  playerStart: Object.freeze({ x: -78, z: 320 }),
});

export const TARGET_X = 9000;   // the target city, per the mission brief

/**
 * Squatchbourg — the small city the Fat Squatch is addressed to.
 *
 * "It doesn't have to be super detailed as we are only going to see it from
 * the air, but I want it to be more extensive" (owner, 2026-08-04). So: a real
 * street grid with a dense downtown, a mid-rise ring, low outskirts, an
 * industrial quarter and a river — about 900 buildings — but every one of
 * them is an instance, not a mesh. See `scenes/TargetCity.js` for the draw-call
 * budget and why the numbers below are the ones they are.
 *
 * `radius` is the outer edge of the built-up area. The bombing run's flattened
 * pad in `main.js` (`rawEastHeight`'s `smoothstep(640, 260, dPad)`) is 640 m,
 * so the city keeps inside that or its outskirts would climb a hillside.
 */
export const TARGET_CITY = Object.freeze({
  name: 'Squatchbourg',
  radius: 560,
  blockSize: 74,        // metres between street centrelines
  streetWidth: 13,
  downtownRadius: 165,  // inside this, buildings are tall and packed
  midRadius: 340,
  maxHeight: 96,        // the one tower everybody aims at
  seed: 0x5A5C17,
});

/**
 * The crater the city used to be in.
 *
 * `depth` is metres below the surrounding (already flattened) ground, `radius`
 * the lip. Wider than the city's downtown and deep enough that the rim reads
 * from three thousand feet, which is the only altitude anybody sees it from.
 */
export const CRATER = Object.freeze({
  radius: 620,
  depth: 118,
  rimHeight: 26,        // the thrown-up lip standing proud of the old ground
  rimWidth: 190,        // how far past `radius` the lip runs out
});

// Navigation landmarks along the eastbound route, x-positioned the same way
// Beef Run's `LANDMARKS` are z-positioned. `z` is a nominal cruise offset
// from the corridor the aeroplane turned onto, not a hard rail.
export const LANDMARKS_EAST = [
  { id: 'turnpoint', name: 'Turn Point Ridge', x: 900, z: -1100, kind: 'ridge' },
  // Detection-avoidance phase: a river valley cut between two ridgelines,
  // low enough to duck under a search radar/searchlight sweep.
  { id: 'corridor', name: "Widow's Notch — river valley", x: 2600, z: -1400, kind: 'corridor' },
  { id: 'town', name: 'Sasquache Flats (small town)', x: 5100, z: -900, kind: 'town' },
  { id: 'cloudbank', name: 'The Cloud Bank', x: 7300, z: -700, kind: 'clouds' },
  { id: 'compound', name: 'The Desert Compound', x: TARGET_X, z: -500, kind: 'compound' },
];

/**
 * Safety-carve note (no code here — `terrainHeight` in
 * `src/beefrun/terrain.js` cannot be edited by this phase, and none of these
 * three deliverables build terrain).
 *
 * Read closely, `terrainHeight`'s existing "outbound" carve is:
 *   const outbound = (WP.z - WP.rwyHalf) - z;
 *   if (outbound > 0) {
 *     const lateral = smoothstep(820, 300, Math.abs(x - WP.x));
 *     ...
 *   }
 * — it only flattens ground south of the runway's far end AND within about
 * 820 m of `WP.x` laterally. The climbout continues south along this
 * existing corridor (unchanged, safe) before the scripted turn onto 090; by
 * the time the aeroplane has turned and is climbing away to the east, `x -
 * WP.x` grows past ~820 m and `lateral` fades to 0 on its own — the existing
 * carve simply stops applying, harmlessly, rather than needing to be
 * disabled. So: NO fresh carve is needed near the airfield for this route.
 *
 * A fresh carve almost certainly IS needed near the far end, around
 * `TARGET_X` = 9000 — the `compound` zone above has `relief: 70` on top of
 * `base: 240`, which is gentle, but zone noise alone doesn't guarantee a
 * flat pad under the final approach the way `WP`'s own hand-carved bowl
 * guarantees one at the airfield. That carve is new logic for whatever
 * function replaces/wraps `terrainHeight` for this mission's own terrain
 * module (not built in this phase, and not a Beef Run file) — it should
 * flatten a landing-pad-sized bowl around `(TARGET_X, LANDMARKS_EAST[4].z)`
 * the same way `terrainHeight` already flattens one around `(WP.x, WP.z)`.
 */

export const CHECKPOINTS = ['takeoff', 'turnOnCourse', 'preRelease', 'return'];

/**
 * New HUD warning entries this mission needs, in the exact shape of
 * `WARNINGS` in `src/beefrun/hud.js` ({ text, kind }), additional to that
 * file's existing set (stall/terrain/overspeed/hot/cargo/runway/patrol/
 * located/fuel/gear — all of which still apply and are reused as-is; e.g.
 * 'located' already covers the searchlight beat and 'hot' already covers an
 * overheating engine). Not merged into hud.js here — a later phase decides
 * how the two sets combine.
 */
export const WARNINGS_ENOLA = {
  electrical: { text: 'ELECTRICAL FAULT', kind: 'amber' },
  bombBay: { text: 'BOMB BAY FAULT', kind: 'red' },      // 'bomb.doorsFail'
  payloadArmed: { text: 'PAYLOAD ARMED', kind: 'amber' },
  flak: { text: 'TAKING FIRE', kind: 'red' },            // 'defense.hit'
  overweight: { text: 'OVERWEIGHT', kind: 'amber' },
};

/*
 * Design note on the outbound heading, for anyone revisiting this file: the
 * brief left "east or west" open and this mission closes it to EAST (090).
 * Reusing the Whispering Pines airfield unmodified means the physical
 * takeoff direction stays south (`WP.heading = 180`) regardless; the compass
 * heading that actually defines "the desert compound is out this way" is
 * the post-climbout turn target above, `TURN_POINT.newHeading`. Turning the
 * aeroplane, rather than rebuilding or rotating the airfield, is what avoids
 * touching `src/beefrun/airfield.js` or `src/beefrun/config.js`'s `WP` at all.
 */

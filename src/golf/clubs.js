/**
 * Three clubs. That is the whole bag and it is deliberate.
 *
 * "You don't need seventeen ways to make the same mistake." No wedges, no
 * shot shaping, no spin control, no equipment progression — the interesting
 * decision on a par 3 is which of three obviously different tools you pick,
 * and adding a fourth makes that decision worse rather than richer.
 *
 * Every club can be used from everywhere. Putting from the tee is a bad idea,
 * not a blocked input; the game's job is to let him find that out.
 */

export const CLUB_IDS = Object.freeze(['driver', 'iron', 'putter']);

/**
 *   speed        ball speed at full power, m/s
 *   loft         launch angle, degrees
 *   dispersion   degrees of azimuth error at full mis-hit
 *   curve        relative side-spin available for a shaped airborne shot
 *   powerCurve   exponent on the power input; >1 gives finer control low down
 *   minSpeed     floor so a barely-tapped shot still moves
 *   rollScale    multiplier on the surface's rolling friction after landing
 *   grounded     true for a club that never leaves the ground
 */
export const CLUBS = Object.freeze({
  driver: Object.freeze({
    id: 'driver',
    name: 'Driver',
    key: '1',
    /* Lowest loft, highest ball speed, longest run-out, and by a distance the
     * widest miss. On this hole it is the wrong club, which is the point of
     * having it here on this hole. */
    speed: 80.0,
    loft: 11.5,
    dispersion: 7.5,
    curve: 1.25,
    powerCurve: 1.0,
    minSpeed: 6,
    rollScale: 1.0,
    grounded: false,
    blurb: 'Long, low, and hard to aim.',
  }),
  iron: Object.freeze({
    id: 'iron',
    name: 'Iron',
    key: '2',
    /* One iron doing the work of a bagful: full swing is about a six iron,
     * quarter swing is a chip. The general-purpose club and the right one
     * from this tee. */
    speed: 54.0,
    loft: 22.0,
    dispersion: 4.2,
    curve: 0.78,
    powerCurve: 1.18,
    minSpeed: 3,
    rollScale: 1.0,
    grounded: false,
    blurb: 'Everything from a chip to a hundred and ninety.',
  }),
  putter: Object.freeze({
    id: 'putter',
    name: 'Putter',
    key: '3',
    /* Stays on the ground, reads the slope, and is nearly useless anywhere
     * the grass is longer than the green. */
    speed: 7.2,
    loft: 0,
    dispersion: 0.9,
    curve: 0,
    powerCurve: 1.35,
    minSpeed: 0.35,
    rollScale: 1.0,
    grounded: true,
    blurb: 'Roll it. Do not hit it.',
  }),
});

export function getClub(id) {
  return CLUBS[id] ?? CLUBS.iron;
}

export function nextClub(id, dir = 1) {
  const i = CLUB_IDS.indexOf(id);
  const n = (i < 0 ? 0 : i + dir + CLUB_IDS.length) % CLUB_IDS.length;
  return CLUB_IDS[n];
}

/**
 * Turn a swing into launch conditions.
 *
 * `power` 0..1, `accuracy` −1..1 (0 is pure; sign is the direction of the
 * miss). `lie` is the surface properties from course.js, which is where the
 * rough steals power and the sand adds loft.
 *
 * A grounded club ignores the lie's launch bonus — a putter does not pop the
 * ball out of heavy grass, it fails to, which is the joke and also the rule.
 */
export function launchFor(club, { power, accuracy = 0, lie, uphill = 0 }) {
  const c = getClub(club);
  const p = Math.max(0, Math.min(1, power));

  /* A mis-hit costs distance as well as direction. Squared, so a small miss is
   * nearly free and a big one is not. */
  const miss = Math.abs(accuracy);
  const strike = 1 - 0.28 * miss * miss;

  const speed = Math.max(
    c.minSpeed,
    c.speed * Math.pow(p, c.powerCurve) * lie.power * strike,
  );

  const loft = c.grounded
    ? 0
    : c.loft + lie.launch + uphill;

  /* Direction of the miss follows its sign, and the lie adds its own spread on
   * top — a flier out of the rough goes where it goes. */
  /* Face angle starts the ball a little offline; side spin does most of the
   * visible work after launch. That makes a fade/slice or draw/hook curve
   * through the sky instead of being a straight shot pointed elsewhere.
   *
   * **The sign is negative and that is not a typo.** Yaw in this world is
   * `atan2(x, z)`, and the whole course plays down −Z, so *increasing* the
   * shot yaw swings the ball toward −X — which, from behind a man facing the
   * green, is his LEFT. (`aimYaw += …` on the A key in main.js is the same
   * fact from the other end.) A positive `accuracy` is an early click and an
   * open face, and an open face goes RIGHT, so the offset it produces has to
   * be a *negative* yaw delta. `ball.js`'s side lift is the same story: its
   * force runs along `(u_z, −u_x)`, which is the left of travel for any
   * heading, so a right-curving shot needs negative `sideSpin`.
   *
   * Both terms used to be positive, which flew every shaped shot as the exact
   * mirror of the word the HUD had just put on screen: SLICED finished left,
   * HOOKED finished right, and a player correcting for what he saw was being
   * taught the opposite of the rule. NPC swings all pass `accuracy: 0` and
   * were never affected, which is why nothing in the authored round noticed. */
  const dispersionDeg = -(accuracy * c.dispersion * (c.grounded ? 1 : 0.35)
    + Math.sign(accuracy || 1) * miss * lie.spread * (c.grounded ? 1 : 0.35));
  const sideSpin = c.grounded ? 0 : -accuracy * c.curve;

  return {
    speed,
    loftDeg: loft,
    offsetDeg: dispersionDeg,
    sideSpin,
    club: c.id,
    grounded: c.grounded,
  };
}

/**
 * What the HUD shows before he swings.
 *
 * Deliberately a range and not a number. The player is told roughly how far
 * this club goes at this power off this lie, and is not told where the ball
 * will land, because being certain is not what golf is.
 *
 * "Roughly" still has to mean roughly. This used to multiply the vacuum range
 * by one constant, and the real flight model does not work like that: drag
 * grows with the square of speed while lift does not keep up, so the fraction
 * of the vacuum range a ball actually carries *falls* as the swing gets
 * harder. Measured against the integrator on a flat fairway lie it runs 1.08
 * to 0.82 for the iron and 1.20 to 0.95 for the driver across the playable
 * power band. A flat 1.06 therefore under-read a soft driver by a tenth and
 * over-read a full iron by 28% — the HUD said 219 metres and the ball went
 * 152, which is the difference between clearing the water and not.
 */
export function estimateCarry(club, power, lie) {
  const c = getClub(club);
  const p = Math.max(0, Math.min(1, power));
  const speed = c.speed * Math.pow(p, c.powerCurve) * lie.power;
  if (c.grounded) {
    // Rolls until friction stops it: v² / 2a, on this surface.
    return (speed * speed) / (2 * Math.max(0.4, lie.roll));
  }
  /* Ballistic first guess with a flight-model correction folded in. Close
   * enough to plan a shot with, never exact enough to aim with. */
  const rad = (c.loft + lie.launch) * (Math.PI / 180);
  const vacuum = (speed * speed * Math.sin(2 * rad)) / 9.81;
  return vacuum * flightEfficiency(c.id, p);
}

/**
 * Where the ball comes to REST, which is what a plan is actually about.
 *
 * The player aims at the pin, or at a point down the fairway, and wants the
 * ball to finish there — carry plus whatever it runs out afterwards. The two
 * numbers are far enough apart to matter: a half iron carries 38 metres and
 * finishes 53, because a short shot lands shallow and releases.
 *
 * The run-out coefficients are measured on fairway-ish ground, because that
 * is where a plan target usually is. Landing on a green or in sand will do
 * something else, and the game tells him that afterwards — honestly — through
 * the shot result card rather than by pretending to know beforehand.
 */
export function estimateTotal(club, power, lie) {
  const c = getClub(club);
  if (c.grounded) return estimateCarry(club, power, lie);
  const p = Math.max(0, Math.min(1, power));
  const run = RUN_OUT[c.id] ?? RUN_OUT.iron;
  return estimateCarry(club, power, lie) * (run.settled + run.extra * (1 - p));
}

/**
 * Readable pre-shot landing area for the world-space yellow circle.
 *
 * This deliberately uses the same approximate distance already shown in the
 * HUD, then turns club and lie dispersion into an uncertainty radius. It is a
 * planning aid in the Hot Shots tradition, not a promise from the integrator.
 */
export function landingPreviewFor({
  from, aim = 0, club = 'iron', power = 0, lie,
} = {}) {
  const origin = from ?? { x: 0, z: 0 };
  const resolvedLie = lie ?? { power: 1, launch: 0, roll: 1, spread: 0 };
  const c = getClub(club);
  const distance = estimateCarry(c.id, power, resolvedLie);
  const spreadDeg = c.dispersion * (c.grounded ? 0.28 : 0.68)
    + Math.max(0, resolvedLie.spread ?? 0);
  const rawRadius = Math.tan(spreadDeg * Math.PI / 180) * distance;
  const radius = Math.max(c.grounded ? 0.45 : 2.2, Math.min(20, rawRadius));
  return {
    x: origin.x + Math.sin(aim) * distance,
    z: origin.z + Math.cos(aim) * distance,
    distance,
    radius,
    spreadDeg,
  };
}

/**
 * Recommended meter position for a requested FINISH distance.
 *
 * This intentionally solves against the same approximate model the HUD shows,
 * not the hidden trajectory integrator. It is a planning aid rather than an
 * aim bot, and remains honest when the lie or club changes.
 *
 * It solves against the total rather than the carry because every distance it
 * is ever handed is a distance to a *place* — the pin, a fairway point, the
 * number under W/S — and a plan that lands you on the number leaves you past
 * it. This was `powerForCarry`, and the two errors it carried (a carry model
 * that over-read at full power, solved against a target that wanted a total)
 * half-cancelled in the middle of the bar and diverged at both ends.
 */
export function powerForDistance(club, distance, lie) {
  const wanted = Math.max(0, Number.isFinite(distance) ? distance : 0);
  if (wanted <= 0) return 0;
  if (estimateTotal(club, 1, lie) <= wanted) return 1;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) * 0.5;
    if (estimateTotal(club, mid, lie) < wanted) low = mid;
    else high = mid;
  }
  return (low + high) * 0.5;
}

/**
 * Carry as a fraction of the vacuum range, once drag and lift have had their
 * say — and it is a line, not a number.
 *
 * Fitted by least squares against the real integrator over the playable band
 * (p ≥ 0.35, flat fairway lie); worst case inside that band is 1.3% for the
 * driver and 1.5% for the iron, against the 28% the single constant was out
 * by at the top of the bar. If the flight model changes these are expected to
 * be re-measured, not nudged.
 */
const FLIGHT_EFFICIENCY = Object.freeze({
  driver: Object.freeze({ base: 1.355, fade: 0.404 }),
  iron: Object.freeze({ base: 1.262, fade: 0.432 }),
});

function flightEfficiency(clubId, power) {
  const fit = FLIGHT_EFFICIENCY[clubId] ?? FLIGHT_EFFICIENCY.iron;
  /* Clamped because the fit is only measured over the playable band, and a
   * planning aid that reports a negative distance is worse than one that is
   * approximate. */
  return Math.max(0.6, Math.min(1.45, fit.base - fit.fade * power));
}

/**
 * How much further than its carry a shot runs out.
 *
 * `settled` is the release left in a full swing, which lands steeply and
 * mostly stops; `extra` is what a softer, flatter shot adds on top. Measured
 * on the same flat fairway ground as the efficiency fit, to within 6%.
 */
const RUN_OUT = Object.freeze({
  driver: Object.freeze({ settled: 1.03, extra: 0.74 }),
  iron: Object.freeze({ settled: 1.15, extra: 0.55 }),
});

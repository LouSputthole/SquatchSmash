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
   * through the sky instead of being a straight shot pointed elsewhere. */
  const dispersionDeg = accuracy * c.dispersion * (c.grounded ? 1 : 0.35)
    + Math.sign(accuracy || 1) * miss * lie.spread * (c.grounded ? 1 : 0.35);
  const sideSpin = c.grounded ? 0 : accuracy * c.curve;

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
  return vacuum * FLIGHT_EFFICIENCY;
}

/**
 * Recommended meter position for a requested carry/roll distance.
 *
 * This intentionally solves against the same approximate range the HUD shows,
 * not the hidden trajectory integrator. It is a planning aid rather than an
 * aim bot, and remains honest when the lie or club changes.
 */
export function powerForCarry(club, distance, lie) {
  const wanted = Math.max(0, Number.isFinite(distance) ? distance : 0);
  if (wanted <= 0) return 0;
  if (estimateCarry(club, 1, lie) <= wanted) return 1;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) * 0.5;
    if (estimateCarry(club, mid, lie) < wanted) low = mid;
    else high = mid;
  }
  return (low + high) * 0.5;
}

/* Carry as a fraction of the vacuum range, once drag and lift have had their
 * say. Measured against the real integrator in tools/verify-golf.mjs; if the
 * flight model changes, this number is expected to change with it. */
export const FLIGHT_EFFICIENCY = 1.06;

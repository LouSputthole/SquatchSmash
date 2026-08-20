/**
 * The seven weapons, as numbers.
 *
 * One table, no THREE, no DOM, no audio engine — so a test can read it and so
 * a scene that only wants to know how many rounds a SAW holds does not have
 * to build a SAW to find out.
 *
 * WHAT EACH FIELD IS FOR
 *
 *   capacity      rounds a full magazine (or cylinder, or belt) holds.
 *   reserve       loose rounds on the player at pickup. Displayed beside the
 *                 magazine count, and what a reload draws from.
 *   rps           rounds per second at the trigger.
 *   auto          true if holding the trigger keeps it firing.
 *   reloadOut     seconds from pressing reload to the old magazine leaving the
 *                 gun. The ejection happens at the END of this, not at the
 *                 start of the reload — that is the whole point of splitting
 *                 the reload in two.
 *   reloadIn      seconds from the ejection to the gun being ready again.
 *   eject         'magazine'   the fitted magazine object leaves and falls.
 *                 'cases'      spent brass is dumped, one object per fired
 *                              round, and a speedloader goes in. The revolver.
 *                 'ammobox'    the belt box leaves. The SAW.
 *   partialLoss   true if the rounds left in a discarded magazine are lost
 *                 with it. True for every box-fed gun here, because they are.
 *                 A revolver's unfired rounds go back in with the loader.
 *   tracer        {colour, width, speed, every} — `every` is how many rounds
 *                 between tracer rounds, the way a real belt is loaded. 1 is
 *                 every round.
 *   recoil        radians of muzzle climb per shot, before recovery.
 *   spread        radians, hip-fire cone at the muzzle.
 *   damage/pen    handed to whatever hit model the consuming scene runs. The
 *                 armory does not resolve hits; THE TAKE will.
 *   rack          how the armory racks it: how many copies on the wall, how
 *                 far apart, and whether it hangs flat on pegs (a handgun) or
 *                 stands muzzle-up in a slot (everything with a stock).
 */

/** Stable ids. Every other module keys off these strings. */
export const WEAPON_IDS = Object.freeze({
  REVOLVER: 'revolver',
  SHOTGUN: 'shotgun',
  PISTOL9: 'pistol9',
  CARBINE: 'carbine',
  SAW: 'saw',
  BARRETT: 'barrett',
  AK47: 'ak47',
});

/** Rack order, left to right along the armory wall. */
export const WEAPON_ORDER = Object.freeze([
  WEAPON_IDS.REVOLVER,
  WEAPON_IDS.SHOTGUN,
  WEAPON_IDS.PISTOL9,
  WEAPON_IDS.CARBINE,
  WEAPON_IDS.AK47,
  WEAPON_IDS.SAW,
  WEAPON_IDS.BARRETT,
]);

/** Cue names this system wants recorded, per weapon. */
export function weaponCue(id, slot) { return `weapon.${id}.${slot}`; }

/** The five sound slots every weapon owns. */
export const WEAPON_CUE_SLOTS = Object.freeze([
  'fire', 'reload.out', 'reload.in', 'empty', 'mag.floor',
]);

/** Pump guns add the action cycling between the shot and the next chamber. */
export const SHOTGUN_CUE_SLOTS = Object.freeze([
  ...WEAPON_CUE_SLOTS,
  'cycle',
]);

/* ------------------------------------------------------------------------ *
 * THE MIX. How loud each weapon is, relative to every other weapon.
 *
 * WHY THIS IS DATA AND WHY IT LIVES HERE. Every scene that plays a gun went
 * through `playWeaponCue`, and every one of them passed its own flat volume:
 * the player's fire was a hardcoded 0.75 for all seven guns, the palace's
 * enemies 0.55, the siege's 0.6. So a .45 and a SAW came out of the speakers
 * at exactly the same level, and the .45 — a 62-damage signature sidearm fired
 * twice a second — was the one that disappeared, because a single crack has
 * nowhere near the energy of thirteen rounds a second and needs the gain to
 * say so. A per-scene fix would have to be made seven times and would drift
 * six ways; the loudness of a gun is a property OF THE GUN, so it is a column
 * in the catalog beside its capacity and its recoil.
 *
 * HOW IT IS APPLIED. `playWeaponCue` multiplies: final = caller.volume * mix.
 * 1.0 is therefore "exactly what this cue used to be", so no call site had to
 * change and none of them are wrong — a scene still says how present the event
 * is (near/far, player/NPC) and the catalog says which gun it is.
 *
 * THE NUMBERS, against the player's 0.75 fire:
 *
 *   shotgun 1.50   The heaviest thing in the game indoors, which is where a
 *                  pump gun is used. 1.35 rounds a second, one shell per
 *                  trigger, so there is no stacking to worry about and all of
 *                  the headroom can go into a single shell.
 *   barrett 1.42   A bigger round than the 12-gauge, but it is a 0.95 rps
 *                  standoff rifle used down long sightlines and through
 *                  distance falloff. Deliberately ranked just under the pump
 *                  so the shotgun keeps the room.
 *   revolver 1.34  The signature sidearm, and previously inaudible. Six slow,
 *                  loud, sharp rounds: nothing about a wheelgun is sustained,
 *                  so it can afford to be near the top and it has to be, or
 *                  the gun the player carries all game reads as a cap gun.
 *   ak47 1.16      7.62, and it is not a 5.56 — the same reason its stand-in
 *                  is pitched down a major second from the carbine's.
 *   carbine 1.08   Punchy and snappy, clearly above the 9mm and clearly under
 *                  the shotgun. 12.5 rps is the ceiling here: an automatic
 *                  weapon multiplies its own gain by its rate of fire, and
 *                  anything higher turns held fire into a wall.
 *   saw 0.98       13.3 rps of belt. Left a hair under unity precisely
 *                  because it stacks — it is the loudest gun in the game by
 *                  arithmetic without any help from this table, and pushing
 *                  it further only feeds the master limiter.
 *   pistol9 0.90   The smallest round on the rack and the backup weapon.
 *                  Under the .45 on purpose; that gap is the whole reason to
 *                  pick up the .45.
 *
 * Handling slots (the magazine, the dry click, the pump) sit at 1.0 unless
 * the gun's mass says otherwise: they are foley, not gunfire, and a reload
 * that competes with a shot is a mix nobody asked for.
 * ------------------------------------------------------------------------ */

/** Every slot at its old level. Spread first, then override what differs. */
const FLAT_MIX = Object.freeze({
  fire: 1,
  'reload.out': 1,
  'reload.in': 1,
  empty: 1,
  'mag.floor': 1,
  cycle: 1,
});

const mix = (fire, over = {}) => Object.freeze({ ...FLAT_MIX, fire, ...over });

/** Per-weapon, per-slot gain multipliers. See the block comment above. */
export const WEAPON_MIX = Object.freeze({
  // A hammer falling on a spent chamber is this gun's second-most-heard sound.
  [WEAPON_IDS.REVOLVER]: mix(1.34, { empty: 1.12, 'mag.floor': 0.85 }),
  // The pump is half of what a pump gun sounds like; it gets to be heard.
  [WEAPON_IDS.SHOTGUN]: mix(1.50, { cycle: 1.18, 'reload.in': 1.05 }),
  [WEAPON_IDS.PISTOL9]: mix(0.90),
  [WEAPON_IDS.CARBINE]: mix(1.08),
  [WEAPON_IDS.AK47]: mix(1.16),
  // A loaded hundred-round box is the heaviest thing that hits these floors.
  [WEAPON_IDS.SAW]: mix(0.98, { 'mag.floor': 1.15 }),
  [WEAPON_IDS.BARRETT]: mix(1.42, { 'mag.floor': 1.08 }),
});

/**
 * The gain for one weapon's one cue slot.
 *
 * Unity for anything unknown, so a weapon or slot added tomorrow is merely
 * unmixed rather than silent. The test in `tests/weapon-audio-mix.test.mjs`
 * is what stops a new gun from staying unmixed.
 */
export function weaponMix(id, slot) {
  const gain = WEAPON_MIX[id]?.[slot];
  return Number.isFinite(gain) && gain > 0 ? gain : 1;
}

const def = (o) => Object.freeze({
  auto: false,
  partialLoss: true,
  eject: 'magazine',
  recoil: 0.02,
  spread: 0.02,
  damage: 30,
  penetration: 0.3,
  projectiles: 1,
  cycleSeconds: 0,
  cycleEject: null,
  ...o,
  tracer: Object.freeze({ colour: 0xfff0a0, width: 0.012, speed: 620, every: 1, ...(o.tracer || {}) }),
  rack: Object.freeze({ copies: 3, spacing: 0.34, mount: 'vertical', ...(o.rack || {}) }),
});

export const WEAPON_CATALOG = Object.freeze({
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.REVOLVER]: def({
    id: WEAPON_IDS.REVOLVER,
    name: 'Heavy-frame .45',
    short: '.45',
    kind: 'revolver',
    /* Six, and the cylinder shows you all six. There is no partial-magazine
     * dodge on a wheelgun: the ejector rod dumps whatever is in it, live or
     * spent, and the loader puts six back. */
    capacity: 6,
    reserve: 36,
    rps: 2.4,
    auto: false,
    reloadOut: 0.85,
    reloadIn: 1.55,
    eject: 'cases',
    partialLoss: false,
    recoil: 0.075,
    spread: 0.016,
    damage: 62,
    penetration: 0.30,
    tracer: { colour: 0xffd27a, width: 0.014, speed: 400, every: 1 },
    rack: { copies: 4, spacing: 0.30, mount: 'horizontal' },
    note: 'A Colt-pattern .45 on a long frame. Six, slow, and it settles arguments.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.SHOTGUN]: def({
    id: WEAPON_IDS.SHOTGUN,
    name: '12-gauge pump shotgun',
    short: '12 GA',
    kind: 'shotgun',
    capacity: 6,
    reserve: 36,
    rps: 1.35,
    auto: false,
    reloadOut: 0.65,
    reloadIn: 2.15,
    eject: 'shells',
    partialLoss: false,
    recoil: 0.105,
    spread: 0.085,
    damage: 18,
    penetration: 0.12,
    projectiles: 7,
    /* Seven independently-resolved pellets may overlap one body, but one
     * trigger is not seven point-blank rifle rounds. Scene Adapters spend the
     * cap across results in pellet order, preserving one damage transition. */
    triggerDamageCap: 72,
    cycleSeconds: 0.48,
    cycleEject: 'shotgun-shell',
    tracer: { colour: 0xffd79a, width: 0.011, speed: 440, every: 1 },
    rack: { copies: 3, spacing: 0.38, mount: 'vertical' },
    note: 'Six shells in the tube, seven pellets in the cone, and a visible pump between shots.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.PISTOL9]: def({
    id: WEAPON_IDS.PISTOL9,
    name: '9mm semi-automatic',
    short: '9mm',
    kind: 'pistol',
    capacity: 15,
    reserve: 75,
    rps: 5.5,
    auto: false,
    reloadOut: 0.55,
    reloadIn: 1.25,
    recoil: 0.030,
    spread: 0.019,
    damage: 28,
    penetration: 0.16,
    tracer: { colour: 0xfff2b0, width: 0.010, speed: 520, every: 1 },
    rack: { copies: 4, spacing: 0.30, mount: 'horizontal' },
    note: 'The double-stack Lou and Booski carry. Fifteen, and it never argues.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.CARBINE]: def({
    id: WEAPON_IDS.CARBINE,
    name: 'Short carbine',
    short: 'CARBINE',
    kind: 'rifle',
    capacity: 30,
    reserve: 150,
    rps: 12.5,
    auto: true,
    reloadOut: 0.60,
    reloadIn: 1.45,
    recoil: 0.022,
    spread: 0.013,
    damage: 42,
    penetration: 0.38,
    tracer: { colour: 0xfff0a0, width: 0.012, speed: 780, every: 3 },
    rack: { copies: 3, spacing: 0.34, mount: 'vertical' },
    note: 'THE TAKE’s gun. Thirty, fast, and it goes through a car door.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.AK47]: def({
    id: WEAPON_IDS.AK47,
    name: 'AK-47',
    short: 'AK',
    kind: 'rifle',
    capacity: 30,
    reserve: 150,
    rps: 10.0,
    auto: true,
    /* Slower than the carbine both ways: the magazine rocks in front-first
     * rather than dropping straight up the well, and you feel it. */
    reloadOut: 0.75,
    reloadIn: 1.75,
    recoil: 0.034,
    spread: 0.021,
    damage: 46,
    penetration: 0.42,
    tracer: { colour: 0xffb060, width: 0.013, speed: 715, every: 3 },
    rack: { copies: 3, spacing: 0.34, mount: 'vertical' },
    note: 'Stamped, curved thirty, and it will run wet, dirty or dropped.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.SAW]: def({
    id: WEAPON_IDS.SAW,
    name: 'Belt-fed SAW',
    short: 'SAW',
    kind: 'lmg',
    /* A hundred-round belt in a plastic box, and the box is the reload. Two
     * spare boxes on the rack, which is what one man carries. */
    capacity: 100,
    reserve: 200,
    rps: 13.3,
    auto: true,
    reloadOut: 1.30,
    reloadIn: 3.20,
    eject: 'ammobox',
    recoil: 0.026,
    spread: 0.030,
    damage: 38,
    penetration: 0.36,
    tracer: { colour: 0xff4c3a, width: 0.016, speed: 850, every: 4 },
    rack: { copies: 2, spacing: 0.46, mount: 'vertical' },
    note: 'Belt-fed, bipod, hundred-round box. Every fourth round is tracer.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.BARRETT]: def({
    id: WEAPON_IDS.BARRETT,
    name: 'Anti-materiel rifle',
    short: 'BARRETT',
    kind: 'sniper',
    capacity: 10,
    reserve: 30,
    rps: 0.95,
    auto: false,
    reloadOut: 1.05,
    reloadIn: 2.35,
    recoil: 0.16,
    spread: 0.0035,
    damage: 210,
    penetration: 0.95,
    tracer: { colour: 0xffffff, width: 0.022, speed: 900, every: 1 },
    rack: { copies: 2, spacing: 0.46, mount: 'vertical' },
    note: 'Semi-automatic, ten rounds, and the muzzle brake is half the noise.',
  }),
});

/** Every weapon definition, in rack order. */
export function weaponList() {
  return WEAPON_ORDER.map((id) => WEAPON_CATALOG[id]);
}

/** One definition, or null. */
export function weaponDef(id) {
  return WEAPON_CATALOG[id] ?? null;
}

/** Cue slots for one weapon; the pump gun alone owns an audible cycle. */
export function weaponCueSlots(id) {
  return id === WEAPON_IDS.SHOTGUN ? SHOTGUN_CUE_SLOTS : WEAPON_CUE_SLOTS;
}

/** Every cue name the seven weapons want recorded (the pump owns one extra cycle). */
export function allWeaponCueNames() {
  const out = [];
  for (const id of WEAPON_ORDER) {
    for (const slot of weaponCueSlots(id)) out.push(weaponCue(id, slot));
  }
  return out;
}

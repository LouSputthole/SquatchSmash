/**
 * The six weapons, as numbers.
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
  PISTOL9: 'pistol9',
  CARBINE: 'carbine',
  SAW: 'saw',
  BARRETT: 'barrett',
  AK47: 'ak47',
  PUMP12: 'pump12',
  SMG9: 'smg9',
  BR308: 'br308',
});

/** Rack order, left to right along the armory wall.
 *
 * DELIBERATELY still the original six. Lou's basement wall and THE TAKE's
 * loadout were built and verified against exactly these, in this order, and
 * a test pins it. The combat framework's additions rack separately. */
export const WEAPON_ORDER = Object.freeze([
  WEAPON_IDS.REVOLVER,
  WEAPON_IDS.PISTOL9,
  WEAPON_IDS.CARBINE,
  WEAPON_IDS.AK47,
  WEAPON_IDS.SAW,
  WEAPON_IDS.BARRETT,
]);

/** Every weapon the combat framework knows, including the newer three. */
export const COMBAT_WEAPON_ORDER = Object.freeze([
  ...WEAPON_ORDER,
  WEAPON_IDS.PUMP12,
  WEAPON_IDS.SMG9,
  WEAPON_IDS.BR308,
]);

/** Cue names this system wants recorded, per weapon. */
export function weaponCue(id, slot) { return `weapon.${id}.${slot}`; }

/** The five sound slots every weapon owns. */
export const WEAPON_CUE_SLOTS = Object.freeze([
  'fire', 'reload.out', 'reload.in', 'empty', 'mag.floor',
]);

/* The `combat` block is what the combat framework reads and nothing else
 * does. Every field is data — the catalog still resolves no hits and damages
 * nobody (see the standing-rule test in tests/weapons-core.test.mjs).
 *
 *   headshot        damage multiplier on the head hit region.
 *   pellets         rays per trigger pull. 1 for everything but the shotgun.
 *   pelletSpread    extra per-pellet cone, radians, on top of `spread`.
 *   falloff         {start, end, floor} metres and the damage fraction left
 *                   past `end`. Inside `start` the round does full damage.
 *   ads             {spread, zoom, time} — spread multiplier when aimed,
 *                   camera zoom factor, seconds to settle into the sights.
 *   moveSpread     spread multiplier while walking; sprinting blocks fire.
 *   crouchSpread   spread multiplier while crouched.
 *   recoil          {pitch, yaw, firstShot, recovery, climb, model} — camera
 *                   kick per shot (radians), horizontal jitter, first-shot
 *                   multiplier, recovery rate (rad/s toward the pre-recoil
 *                   aim), per-shot climb compounding in a burst, view-model
 *                   kick scale. Learnable, not random shake.
 *   emptyExtra      extra seconds on a reload that started on an empty gun
 *                   (working the action / bolt release). Tactical reloads
 *                   skip it.
 *   suppression     how frightening a near miss from this gun is, 0..1+.
 *   noise           metres at which an unsuppressed shot alerts NPCs.
 *   npc             {burst:{min,max,pause}, spread} — how an NPC runs the
 *                   same gun: burst cadence and a skill-neutral spread scale.
 */
const combatDef = (o = {}) => Object.freeze({
  headshot: 2.6,
  pellets: 1,
  pelletSpread: 0,
  moveSpread: 1.7,
  crouchSpread: 0.8,
  emptyExtra: 0,
  suppression: 0.5,
  noise: 80,
  ...o,
  falloff: Object.freeze({ start: 20, end: 60, floor: 0.5, ...(o.falloff || {}) }),
  ads: Object.freeze({ spread: 0.35, zoom: 1.3, time: 0.18, ...(o.ads || {}) }),
  recoil: Object.freeze({
    pitch: 0.016, yaw: 0.005, firstShot: 1.35, recovery: 5.5, climb: 1.12, model: 1,
    ...(o.recoil || {}),
  }),
  npc: Object.freeze({
    spread: 1.0,
    ...(o.npc || {}),
    burst: Object.freeze({ min: 2, max: 4, pause: 0.7, ...(o.npc?.burst || {}) }),
  }),
});

const def = (o) => Object.freeze({
  auto: false,
  partialLoss: true,
  eject: 'magazine',
  recoil: 0.02,
  spread: 0.02,
  damage: 30,
  penetration: 0.3,
  ...o,
  tracer: Object.freeze({ colour: 0xfff0a0, width: 0.012, speed: 620, every: 1, ...(o.tracer || {}) }),
  rack: Object.freeze({ copies: 3, spacing: 0.34, mount: 'vertical', ...(o.rack || {}) }),
  combat: combatDef(o.combat),
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
    combat: {
      headshot: 3.0,
      falloff: { start: 14, end: 40, floor: 0.45 },
      ads: { spread: 0.4, zoom: 1.18, time: 0.14 },
      recoil: { pitch: 0.05, yaw: 0.008, firstShot: 1.0, recovery: 7.5, climb: 1.0 },
      suppression: 0.7,
      noise: 90,
      npc: { burst: { min: 1, max: 2, pause: 1.0 } },
    },
    note: 'A Colt-pattern .45 on a long frame. Six, slow, and it settles arguments.',
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
    combat: {
      headshot: 2.8,
      falloff: { start: 12, end: 35, floor: 0.4 },
      ads: { spread: 0.38, zoom: 1.2, time: 0.14 },
      emptyExtra: 0.25,
      recoil: { pitch: 0.022, yaw: 0.006, firstShot: 1.1, recovery: 8.0, climb: 1.04 },
      suppression: 0.4,
      noise: 75,
      npc: { burst: { min: 1, max: 3, pause: 0.8 } },
    },
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
    combat: {
      headshot: 2.4,
      falloff: { start: 28, end: 80, floor: 0.55 },
      ads: { spread: 0.3, zoom: 1.35, time: 0.18 },
      emptyExtra: 0.4,
      recoil: { pitch: 0.012, yaw: 0.005, firstShot: 1.5, recovery: 6.0, climb: 1.16 },
      suppression: 0.55,
      noise: 90,
      npc: { burst: { min: 2, max: 5, pause: 0.6 } },
    },
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
    combat: {
      headshot: 2.4,
      falloff: { start: 25, end: 70, floor: 0.6 },
      ads: { spread: 0.32, zoom: 1.3, time: 0.2 },
      emptyExtra: 0.45,
      recoil: { pitch: 0.017, yaw: 0.008, firstShot: 1.5, recovery: 5.2, climb: 1.2 },
      suppression: 0.65,
      noise: 95,
      npc: { burst: { min: 2, max: 4, pause: 0.7 } },
    },
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
    combat: {
      headshot: 2.0,
      falloff: { start: 30, end: 90, floor: 0.6 },
      ads: { spread: 0.45, zoom: 1.2, time: 0.28 },
      moveSpread: 2.2,
      /* Strong initial movement that settles somewhat during sustained fire:
       * climb below 1 means each successive shot in a burst kicks a little
       * LESS than the one before, once the first few have walked the muzzle
       * up. The gun starts wild and beds in. */
      recoil: { pitch: 0.015, yaw: 0.011, firstShot: 1.7, recovery: 4.2, climb: 0.94 },
      suppression: 0.95,
      noise: 100,
      npc: { burst: { min: 5, max: 9, pause: 0.9 } },
    },
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
    combat: {
      headshot: 1.6,
      falloff: { start: 80, end: 300, floor: 0.8 },
      ads: { spread: 0.06, zoom: 3.6, time: 0.32 },
      moveSpread: 3.0,
      emptyExtra: 0.5,
      recoil: { pitch: 0.09, yaw: 0.006, firstShot: 1.0, recovery: 3.4, climb: 1.0 },
      suppression: 1.0,
      noise: 140,
      npc: { burst: { min: 1, max: 1, pause: 1.6 } },
    },
    note: 'Semi-automatic, ten rounds, and the muzzle brake is half the noise.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.PUMP12]: def({
    id: WEAPON_IDS.PUMP12,
    name: 'Pump twelve-gauge',
    short: 'PUMP',
    kind: 'shotgun',
    /* Seven in the tube, loaded one shell at a time. `reloadOut` is the
     * action coming open, `reloadIn` is seconds PER SHELL, and a reload can
     * be interrupted between shells keeping everything already loaded —
     * that is what `loadStyle: 'shells'` means to Firearm.js. */
    capacity: 7,
    reserve: 42,
    rps: 1.05,
    auto: false,
    loadStyle: 'shells',
    reloadOut: 0.45,
    reloadIn: 0.6,
    eject: 'shells',
    partialLoss: false,
    recoil: 0.11,
    spread: 0.012,
    damage: 11,
    penetration: 0.08,
    tracer: { colour: 0xffc880, width: 0.010, speed: 380, every: 1 },
    rack: { copies: 2, spacing: 0.36, mount: 'vertical' },
    combat: {
      headshot: 1.8,
      pellets: 8,
      pelletSpread: 0.035,
      falloff: { start: 8, end: 24, floor: 0.25 },
      ads: { spread: 0.7, zoom: 1.12, time: 0.16 },
      recoil: { pitch: 0.06, yaw: 0.009, firstShot: 1.0, recovery: 4.6, climb: 1.0 },
      suppression: 0.85,
      noise: 95,
      npc: { burst: { min: 1, max: 2, pause: 1.1 } },
    },
    note: 'Eight pellets of buck. Inside a room there is no second question.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.SMG9]: def({
    id: WEAPON_IDS.SMG9,
    name: '9mm submachine gun',
    short: 'SMG',
    kind: 'smg',
    capacity: 32,
    reserve: 160,
    rps: 13.5,
    auto: true,
    reloadOut: 0.5,
    reloadIn: 1.15,
    recoil: 0.014,
    spread: 0.02,
    damage: 24,
    penetration: 0.14,
    tracer: { colour: 0xfff2b0, width: 0.010, speed: 540, every: 4 },
    rack: { copies: 3, spacing: 0.30, mount: 'horizontal' },
    combat: {
      headshot: 2.5,
      falloff: { start: 14, end: 42, floor: 0.4 },
      ads: { spread: 0.4, zoom: 1.22, time: 0.14 },
      moveSpread: 1.35,
      emptyExtra: 0.3,
      /* Mild kick, but the cone opens the longer the trigger stays down:
       * high climb, quick recovery. Burst it and it laser-beams; hose it
       * and the last ten rounds are wallpaper. */
      recoil: { pitch: 0.008, yaw: 0.006, firstShot: 1.2, recovery: 7.5, climb: 1.22 },
      suppression: 0.45,
      noise: 70,
      npc: { burst: { min: 3, max: 6, pause: 0.55 } },
    },
    note: 'Thirty-two of the same 9mm, four times as fast. A hallway gun.',
  }),
  /* --------------------------------------------------------------- */
  [WEAPON_IDS.BR308]: def({
    id: WEAPON_IDS.BR308,
    name: '.308 battle rifle',
    short: 'BR',
    kind: 'rifle',
    capacity: 20,
    reserve: 100,
    rps: 5.2,
    auto: false,
    reloadOut: 0.7,
    reloadIn: 1.6,
    recoil: 0.042,
    spread: 0.008,
    damage: 58,
    penetration: 0.55,
    tracer: { colour: 0xffe090, width: 0.014, speed: 830, every: 2 },
    rack: { copies: 2, spacing: 0.40, mount: 'vertical' },
    combat: {
      headshot: 2.2,
      falloff: { start: 45, end: 140, floor: 0.65 },
      ads: { spread: 0.25, zoom: 1.8, time: 0.22 },
      moveSpread: 2.0,
      emptyExtra: 0.45,
      recoil: { pitch: 0.03, yaw: 0.007, firstShot: 1.15, recovery: 5.8, climb: 1.08 },
      suppression: 0.8,
      noise: 110,
      npc: { burst: { min: 1, max: 2, pause: 0.9 } },
    },
    note: 'Twenty rounds of .308, aimed. It reaches across the yard and wins.',
  }),
});

/** Every weapon definition, in rack order. */
export function weaponList() {
  return WEAPON_ORDER.map((id) => WEAPON_CATALOG[id]);
}

/** Every weapon the combat framework fields, including the newer three. */
export function combatWeaponList() {
  return COMBAT_WEAPON_ORDER.map((id) => WEAPON_CATALOG[id]);
}

/** One definition, or null. */
export function weaponDef(id) {
  return WEAPON_CATALOG[id] ?? null;
}

/** Every cue name the six weapons want recorded — thirty of them. */
export function allWeaponCueNames() {
  const out = [];
  for (const id of WEAPON_ORDER) {
    for (const slot of WEAPON_CUE_SLOTS) out.push(weaponCue(id, slot));
  }
  return out;
}

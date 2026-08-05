/**
 * Who you are fighting, as data.
 *
 * An archetype is everything a combat NPC needs beyond a body: durability,
 * armor, the gun, the temperament and the tactics. Missions spawn from these
 * rows (optionally overriding fields per encounter); nobody hand-rolls an
 * enemy inside a mission file.
 *
 * THE BULLET-SPONGE RULE, enforced here by the numbers themselves: ordinary
 * enemies sit at 100 health or under and go down to a believable burst.
 * Stronger enemies get ARMOR (which the player defeats with placement or
 * heavier calibre), better SKILL (tighter spread, shorter reactions),
 * better TACTICS (role weights) and better GUNS — `health` past ~120 is a
 * design smell, and no row here crosses it.
 *
 *   health         hit points. Kept believable — see above.
 *   vest           torso armor points (absorbs before health on covered
 *                  regions). 0 for none.
 *   helmet         head armor points, or 0. A helmet can SAVE a headshot:
 *                  see damage.js for the saved/knocked-off arithmetic.
 *   weapon         catalog id the archetype fields by default.
 *   skill          {spread, reaction, burstDiscipline} — spread multiplies
 *                  the weapon's npc spread (lower is deadlier), reaction is
 *                  seconds from stimulus to response, burstDiscipline 0..1
 *                  shortens bursts under recoil.
 *   painThreshold  damage a single hit must exceed to force a stagger.
 *   suppressResist 0..1 — how much incoming near-miss fear is shrugged off.
 *   staggerResist  0..1 — chance to ride out a would-be stagger.
 *   morale         {start, fightToDeath} — starting morale 0..1; a
 *                  fight-to-death archetype never routs or surrenders.
 *   role           default combat role, one of ROLES below.
 *   engage         {near, far} preferred fighting band in metres.
 *   voice          bark set key for pain/death/spot lines (audio layer).
 *   ragdoll        'topple' | 'authored' — death presentation default.
 */

export const ROLES = Object.freeze({
  RIFLEMAN: 'rifleman',
  RUSHER: 'rusher',
  COVER_SHOOTER: 'coverShooter',
  FLANKER: 'flanker',
  SHOTGUNNER: 'shotgunner',
  SMG: 'smg',
  MARKSMAN: 'marksman',
  MACHINE_GUNNER: 'machineGunner',
  SQUAD_LEADER: 'squadLeader',
  ARMORED: 'armored',
});

const arch = (o) => Object.freeze({
  health: 100,
  vest: 0,
  helmet: 0,
  weapon: 'pistol9',
  painThreshold: 22,
  suppressResist: 0.2,
  staggerResist: 0.1,
  role: ROLES.RIFLEMAN,
  voice: 'goon',
  ragdoll: 'topple',
  ...o,
  skill: Object.freeze({ spread: 1.0, reaction: 0.55, burstDiscipline: 0.5, ...(o.skill || {}) }),
  morale: Object.freeze({ start: 0.75, fightToDeath: false, ...(o.morale || {}) }),
  engage: Object.freeze({ near: 8, far: 30, ...(o.engage || {}) }),
});

export const NPC_ARCHETYPES = Object.freeze({
  /* The line infantry of every encounter. Dies like a person. */
  rifleman: arch({
    weapon: 'ak47',
    role: ROLES.RIFLEMAN,
    engage: { near: 10, far: 35 },
  }),
  /* Closes distance hard; frightening indoors, brittle in the open. */
  rusher: arch({
    health: 90,
    weapon: 'smg9',
    role: ROLES.RUSHER,
    skill: { spread: 1.2, reaction: 0.4, burstDiscipline: 0.25 },
    painThreshold: 30,
    suppressResist: 0.45,
    morale: { start: 0.85 },
    engage: { near: 3, far: 14 },
  }),
  /* Sits on a position and makes you dig him out. */
  coverShooter: arch({
    weapon: 'ak47',
    role: ROLES.COVER_SHOOTER,
    skill: { spread: 0.85, reaction: 0.6, burstDiscipline: 0.7 },
    suppressResist: 0.3,
    engage: { near: 12, far: 40 },
  }),
  /* Works the side door while the others hold your eyes. */
  flanker: arch({
    health: 95,
    weapon: 'smg9',
    role: ROLES.FLANKER,
    skill: { spread: 1.0, reaction: 0.45, burstDiscipline: 0.5 },
    morale: { start: 0.8 },
    engage: { near: 5, far: 20 },
  }),
  /* A doorway argument. */
  shotgunner: arch({
    health: 110,
    vest: 40,
    weapon: 'pump12',
    role: ROLES.SHOTGUNNER,
    painThreshold: 32,
    staggerResist: 0.25,
    engage: { near: 2, far: 12 },
  }),
  smg: arch({
    health: 90,
    weapon: 'smg9',
    role: ROLES.SMG,
    skill: { spread: 1.1, reaction: 0.5, burstDiscipline: 0.35 },
    engage: { near: 5, far: 18 },
  }),
  /* Punishes exposure at range; helpless if you get on top of him. */
  marksman: arch({
    health: 85,
    weapon: 'br308',
    role: ROLES.MARKSMAN,
    skill: { spread: 0.55, reaction: 0.7, burstDiscipline: 0.9 },
    suppressResist: 0.15,
    morale: { start: 0.65 },
    engage: { near: 25, far: 90 },
  }),
  /* Suppression on legs. The gun is the danger, not the man. */
  machineGunner: arch({
    health: 110,
    vest: 50,
    weapon: 'saw',
    role: ROLES.MACHINE_GUNNER,
    skill: { spread: 1.15, reaction: 0.65, burstDiscipline: 0.6 },
    painThreshold: 34,
    staggerResist: 0.3,
    engage: { near: 12, far: 45 },
  }),
  /* Steadies everyone near him; kill him and the squad feels it. */
  squadLeader: arch({
    health: 110,
    vest: 40,
    helmet: 25,
    weapon: 'carbine',
    role: ROLES.SQUAD_LEADER,
    skill: { spread: 0.8, reaction: 0.45, burstDiscipline: 0.75 },
    suppressResist: 0.5,
    morale: { start: 0.9 },
    engage: { near: 8, far: 32 },
  }),
  /* Hard because of PLATE, not hit points: crack the helmet, or go around
   * the vest — limbs and placement still work. Slow, loud, unmissable. */
  armored: arch({
    health: 120,
    vest: 120,
    helmet: 60,
    weapon: 'saw',
    role: ROLES.ARMORED,
    skill: { spread: 1.2, reaction: 0.75, burstDiscipline: 0.5 },
    painThreshold: 45,
    suppressResist: 0.8,
    staggerResist: 0.6,
    morale: { start: 0.95, fightToDeath: true },
    engage: { near: 4, far: 25 },
    ragdoll: 'topple',
  }),
  /* Allied Squatches run the SAME framework — tuned separately, protected
   * by mission rules (rules.js), never by hidden health hacks. */
  friendlyCrew: arch({
    weapon: 'carbine',
    role: ROLES.COVER_SHOOTER,
    skill: { spread: 1.1, reaction: 0.55, burstDiscipline: 0.7 },
    morale: { start: 0.9, fightToDeath: true },
    voice: 'crew',
    engage: { near: 8, far: 30 },
  }),
});

export function archetype(name) {
  return NPC_ARCHETYPES[name] ?? NPC_ARCHETYPES.rifleman;
}

/**
 * A mission's per-encounter override: same shape, any subset of fields.
 * Returns a frozen merged archetype without touching the base table.
 */
export function customArchetype(base, overrides = {}) {
  const b = typeof base === 'string' ? archetype(base) : base;
  return arch({ ...b, ...overrides,
    skill: { ...b.skill, ...(overrides.skill || {}) },
    morale: { ...b.morale, ...(overrides.morale || {}) },
    engage: { ...b.engage, ...(overrides.engage || {}) },
  });
}

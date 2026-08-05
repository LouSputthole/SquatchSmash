/**
 * Combat tuning, in one place, as data.
 *
 * Nothing in here executes: missions and the combat framework READ these
 * tables. The rule this file exists to enforce is the owner's own — no
 * hard-coded combat values scattered through mission files, and higher
 * difficulties must not simply multiply enemy health. A difficulty profile
 * here touches reaction time, accuracy, aggression, ammunition and player
 * durability; it never touches an NPC's hit points.
 *
 * `resolveDifficulty(name)` hands back a frozen profile; `COMBAT_TUNING`
 * carries the globals every system shares (player regen policy, feedback
 * strengths, performance ceilings). A mission that needs different rules
 * passes overrides to its own systems — it does not edit this file per
 * mission.
 */

export const DIFFICULTY_NAMES = Object.freeze(['easy', 'normal', 'hard']);

const profile = (o) => Object.freeze({
  /* Player durability. */
  playerHealthScale: 1, // multiplies PlayerVitals maxHealth
  playerDamageTakenScale: 1, // multiplies damage applied to the player
  /* Enemy sharpness — never enemy health. */
  npcReactionScale: 1, // multiplies perception reaction delays
  npcAccuracyScale: 1, // multiplies NPC spread (LOWER is more accurate)
  npcAggression: 1, // scales push/flank willingness in the brain
  npcSuppressionResistScale: 1, // how quickly enemies shrug off suppression
  flankerBudgetBonus: 0, // extra simultaneous flankers allowed
  /* Economy. */
  ammoScale: 1, // multiplies reserve ammunition handed to the player
  checkpointHealFloor: 0, // restore player at least to this fraction on load
  ...o,
});

export const DIFFICULTY_PROFILES = Object.freeze({
  easy: profile({
    playerHealthScale: 1.35,
    playerDamageTakenScale: 0.8,
    npcReactionScale: 1.5,
    npcAccuracyScale: 1.6,
    npcAggression: 0.7,
    npcSuppressionResistScale: 0.8,
    ammoScale: 1.5,
    checkpointHealFloor: 0.6,
  }),
  normal: profile({}),
  hard: profile({
    playerHealthScale: 0.8,
    playerDamageTakenScale: 1.15,
    npcReactionScale: 0.7,
    npcAccuracyScale: 0.75,
    npcAggression: 1.35,
    npcSuppressionResistScale: 1.4,
    flankerBudgetBonus: 1,
    ammoScale: 0.7,
    checkpointHealFloor: 0.35,
  }),
});

export function resolveDifficulty(name = 'normal') {
  return DIFFICULTY_PROFILES[name] ?? DIFFICULTY_PROFILES.normal;
}

/**
 * Globals every combat scene shares. A mission overrides a FIELD by passing
 * it into the system that reads it, not by mutating this table.
 */
export const COMBAT_TUNING = Object.freeze({
  player: Object.freeze({
    maxHealth: 100,
    /* 'none' | 'partial' | 'full' — the campaign default. 'partial' heals
     * back up to `regenCeiling` of max after `regenDelay` seconds without a
     * hit, at `regenRate` per second. Pickups and mission rules go past it. */
    regenMode: 'partial',
    regenCeiling: 0.4,
    regenDelay: 6,
    regenRate: 9,
    spawnInvulnSeconds: 2,
    lowHealthFraction: 0.3, // where the low-health presentation starts
  }),
  feedback: Object.freeze({
    /* Ordinary hits must never white-out the screen; these are ceilings the
     * presentation clamps to, whatever the damage was. */
    maxHitVignette: 0.45,
    maxCameraImpulse: 0.035, // radians of camera flinch on a heavy hit
    nearMissVignette: 0.12,
    lowHealthMuffleHz: 900, // audio lowpass at death's door, used carefully
  }),
  suppressionRadius: 3.2, // metres a passing round frightens from
  hearing: Object.freeze({
    // Multipliers on a weapon's catalog `noise` radius.
    indoors: 0.8,
    suppressed: 0.25,
    impact: 0.35, // a bullet striking near an NPC alerts within this fraction
  }),
  cleanup: Object.freeze({
    bodyLingerSeconds: 45, // corpses older than this may be reclaimed…
    bodyMinimum: 6, // …but this many most-recent bodies always remain
    ragdollSettleSeconds: 3.5, // physics stops being simulated after this
  }),
  /* Performance ceilings — pools clamp to these, oldest reclaimed first. */
  limits: Object.freeze({
    activeEnemies: 12,
    ragdolls: 8,
    decals: 48,
    casings: 24,
    bloodEffects: 24,
    tracerPool: 160,
    audioShotsPerSecond: 14, // gunfire voices the mixer will start per second
  }),
});

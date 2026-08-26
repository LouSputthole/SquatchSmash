/**
 * Canonical ground-combat import surface.
 *
 * A scene supplies a narrow Combat Adapter for its cast, rig, colliders,
 * authored navigation, presentation and mission consequences. The Modules
 * exported here own rules that must remain identical across missions.
 */
export { CombatActor } from './actors.js';
export { CombatAudio, CombatStepCadence, GROUND_COMBAT_AUDIO_CUES } from './audio.js';
export { CombatWeaponAim } from './aim.js';
export { lineOfFireClear, resolveBallisticHits, resolveMaterialPath } from './ballistics.js';
export {
  DEFAULT_FACTION_MATRIX,
  FACTIONS,
  FactionMatrix,
} from './factions.js';
export { CombatFireControl, DEFAULT_COMBAT_FIRE_CONTROL } from './fire-control.js';
export { resolveCombatFeedback } from './feedback.js';
export { CombatStatusHud, combatVitals } from './hud.js';
export {
  COMBAT_HIT_ZONE_DAMAGE, CombatImpactResolver, resolveHitZone,
} from './impact.js';
export { MuzzleFlashPool } from './muzzle-flash.js';
export { CombatImpairments, resolveCombatReaction } from './impairments.js';
export { CombatPerception, DEFAULT_COMBAT_PERCEPTION } from './perception.js';
export { CombatProjectilePattern } from './projectile-pattern.js';
export { AabbCombatSpace, DEFAULT_AABB_COMBAT_SPACE } from './spatial.js';
export { CombatSupplyState } from './supplies.js';
export { SuppressionModel } from './suppression.js';
export { CombatSuppressionField } from './suppression-field.js';
export { TracerPool } from './tracers.js';

/* Legacy compatibility surface. No production scene constructs
 * WeaponController any more — Heist, its last consumer, runs canonical
 * core/weapons/Firearm behind src/heist/combat.js — and new weapon state
 * belongs to Firearm. BurstController remains a useful NPC trigger policy. */
export { BurstController, WeaponController } from './weapon.js';

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
export { CombatImpactResolver } from './impact.js';
export { CombatImpairments, resolveCombatReaction } from './impairments.js';
export { CombatPerception, DEFAULT_COMBAT_PERCEPTION } from './perception.js';
export { CombatProjectilePattern } from './projectile-pattern.js';
export { AabbCombatSpace, DEFAULT_AABB_COMBAT_SPACE } from './spatial.js';
export { CombatSupplyState } from './supplies.js';
export { SuppressionModel } from './suppression.js';
export { CombatSuppressionField } from './suppression-field.js';
export { TracerPool } from './tracers.js';

/* Compatibility surface for Heist and existing Siege cast Adapters. New
 * weapon state belongs to core/weapons/Firearm; BurstController remains a
 * useful NPC trigger policy while those Adapters migrate. */
export { BurstController, WeaponController } from './weapon.js';

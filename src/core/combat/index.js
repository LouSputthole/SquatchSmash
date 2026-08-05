/**
 * The combat framework, one import.
 *
 *   import { PlayerCombat, Combatant, EncounterController, ... }
 *     from '../core/combat/index.js';
 *
 * The layers, and which file to read when one is wrong:
 *
 *   DATA (no THREE, no DOM — a Node test imports these bare):
 *     config.js       difficulty profiles + global tuning + pool ceilings
 *     materials.js    what walls are made of, to a bullet
 *     hit-regions.js  the eight places a person can be shot
 *     archetypes.js   who you fight: durability, gun, temperament, role
 *
 *   LOGIC (still pure):
 *     damage.js       falloff, region multipliers, helmet/vest arithmetic
 *     vitals.js       one health model for the player and every NPC
 *     recoil.js       learnable camera recoil + stance accuracy
 *     perception.js   what one NPC knows, and how surely
 *     squad.js        what a squad shares, and how slowly
 *     cover.js        where to stand so the bullets hit the furniture
 *     morale.js       the will to keep fighting
 *     brain.js        the per-NPC combat state machine
 *     rules.js        friendly fire modes + protected characters
 *     log.js          the readable combat record
 *     encounter.js    one firefight, configured, not scripted
 *
 *   SCENE (THREE and/or DOM):
 *     hitboxes.js     simplified volumes riding the animated rig
 *     shots.js        THE shot resolver — every gun's ray goes through it
 *     combatant.js    a person who can fight: rig + vitals + brain + gun
 *     effects.js      pooled decals, chips, blood, impact audio
 *     player-combat.js the player's side, assembled
 *     combat-hud.js   health, ammunition, a crosshair that tells the truth
 *     debug.js        the debug drawer (never constructed in release)
 *
 * The older pieces stay exported from here too — CombatActor is what THE
 * TAKE saves reference, and the shared TracerPool is everyone's tracer.
 */
export { CombatActor } from './actors.js';
export { resolveBallisticHits, lineOfFireClear } from './ballistics.js';
export { FACTIONS, FactionMatrix, DEFAULT_FACTION_MATRIX } from './factions.js';
export { SuppressionModel } from './suppression.js';
export { TracerPool } from './tracers.js';
export { WeaponController, BurstController } from './weapon.js';

export {
  COMBAT_TUNING, DIFFICULTY_NAMES, DIFFICULTY_PROFILES, resolveDifficulty,
} from './config.js';
export {
  DEFAULT_MATERIAL, DEFAULT_THICKNESS, MATERIAL_PROFILES, materialProfile, penetrate,
} from './materials.js';
export { HIT_REGIONS, REGION_NAMES, VEST_REGIONS, hitRegion } from './hit-regions.js';
export { NPC_ARCHETYPES, ROLES, archetype, customArchetype } from './archetypes.js';
export { falloffScale, resolveHit } from './damage.js';
export { Vitals } from './vitals.js';
export { RecoilController, stanceSpreadScale } from './recoil.js';
export { Perception } from './perception.js';
export { SquadBlackboard } from './squad.js';
export { CoverField } from './cover.js';
export { MORALE_EVENTS, MoraleModel } from './morale.js';
export { BRAIN_STATES, CombatBrain } from './brain.js';
export { FRIENDLY_FIRE, CombatRules } from './rules.js';
export { CombatLog } from './log.js';
export { EncounterController } from './encounter.js';

export { HitboxRig } from './hitboxes.js';
export { ShotResolver } from './shots.js';
export { Combatant } from './combatant.js';
export { ImpactEffects } from './effects.js';
export { PlayerCombat } from './player-combat.js';
export { CombatHud } from './combat-hud.js';
export { CombatDebug } from './debug.js';

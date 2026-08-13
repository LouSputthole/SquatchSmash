/**
 * The shared weapon system.
 *
 * One import for a scene that wants guns:
 *
 *   import { WeaponSystem, mountArmory, WEAPON_ORDER } from '../core/weapons/index.js';
 *
 * The pieces, and which file to read when one of them is wrong:
 *
 *   catalog.js      the seven weapons as numbers — capacity, rate, reload
 *                   timings, tracer interval, how they rack. No THREE, no DOM.
 *   models.js       the seven models, including the pump shotgun.
 *   Firearm.js      one gun's state: rounds, reserve, the two-phase reload,
 *                   the events. No THREE, no DOM, no audio.
 *   Ejecta.js       magazines and brass that leave the gun and land.
 *   WeaponSystem.js the scene runtime: view model, tracers, flash, sound.
 *   Armory.js       racks you take one off, use, and put back.
 *   audio.js        per-weapon cue names with verified stand-ins while
 *                   generated recordings are pending.
 *   build.js        DOM-free geometry helpers the models are built from.
 *
 * `assets/sfx/manifest.json` is not edited by any of these. See `audio.js`.
 */
export {
  SHOTGUN_CUE_SLOTS, WEAPON_CATALOG, WEAPON_CUE_SLOTS, WEAPON_IDS, WEAPON_ORDER,
  allWeaponCueNames, weaponCue, weaponCueSlots, weaponDef, weaponList,
} from './catalog.js';
export {
  WEAPON_SFX, WEAPON_SFX_STANDINS,
  playWeaponCue, playWeaponPickup, playWeaponStow,
  weaponCueNames, weaponStandInCueNames, weaponWantedCueNames,
} from './audio.js';
export { Firearm, READY, RELOAD_IN, RELOAD_OUT } from './Firearm.js';
export { EjectaPool } from './Ejecta.js';
export { WeaponSystem } from './WeaponSystem.js';
export { mountArmory, rackWidth } from './Armory.js';
export {
  WEAPON_MODEL_BUILDERS, buildAk47, buildBarrett, buildCarbine,
  buildNineMillimeter, buildRevolver, buildSaw, buildShotgun, buildSpeedloader,
  buildWeaponModel,
} from './models.js';
export { TracerPool } from '../combat/tracers.js';

/**
 * The shared weapon system.
 *
 * One import for a scene that wants guns:
 *
 *   import { WeaponSystem, mountArmory, WEAPON_ORDER } from '../core/weapons/index.js';
 *
 * The pieces, and which file to read when one of them is wrong:
 *
 *   catalog.js      the six weapons as numbers — capacity, rate, reload
 *                   timings, tracer interval, how they rack. No THREE, no DOM.
 *   models.js       the six models. Three were lifted out of `world/props.js`
 *                   and `heist/weapons.js` rather than rebuilt; three are new.
 *   Firearm.js      one gun's state: rounds, reserve, the two-phase reload,
 *                   the events. No THREE, no DOM, no audio.
 *   Ejecta.js       magazines and brass that leave the gun and land.
 *   WeaponSystem.js the scene runtime: view model, tracers, flash, sound.
 *   Armory.js       racks you take one off, use, and put back.
 *   audio.js        thirty cue names asked for, thirty stand-ins playing.
 *   build.js        DOM-free geometry helpers the models are built from.
 *
 * `assets/sfx/manifest.json` is not edited by any of these. See `audio.js`.
 */
export {
  WEAPON_CATALOG, WEAPON_CUE_SLOTS, WEAPON_IDS, WEAPON_ORDER,
  allWeaponCueNames, weaponCue, weaponDef, weaponList,
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
  buildNineMillimeter, buildRevolver, buildSaw, buildSpeedloader, buildWeaponModel,
} from './models.js';
export { TracerPool } from '../combat/tracers.js';

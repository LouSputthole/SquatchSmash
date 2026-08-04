/**
 * Tracers — every round in the air over the target, in one draw call.
 *
 * The implementation moved to `src/core/combat/tracers.js` when the shared
 * weapon system (`src/core/weapons/`) needed the same instanced pool for the
 * armory's guns. Nothing about the raid changed: this is the same class, with
 * the same defaults, under the same name and the same import path. Its
 * docstring — the argument for one InstancedMesh rather than a mesh per round,
 * and for `onArrive` leaving the hit model with the shooter — travelled with
 * it and is worth reading there before touching either caller.
 *
 * `Defense.js`, `Interceptors.js` and `systems/GunnerStation.js` all import
 * `TracerPool` from here and continue to.
 */
export { TracerPool } from '../../core/combat/tracers.js';

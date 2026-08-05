/**
 * What the world is made of, to a bullet.
 *
 * One profile per material a round can strike. Level geometry tags every
 * shootable mesh `mesh.userData.material` with one of these keys (and
 * optionally `userData.materialThickness` in metres); the shot resolver and
 * the effects layer both read the same row, so the sound of a hit, the dust
 * it throws, whether the round keeps going and how much it hurts afterwards
 * can never disagree with each other.
 *
 *   stop        how many metres of this material a fully-penetrating round
 *               (penetration 1.0) can pass. A weapon's `penetration` scales
 *               it down; thickness beyond the budget stops the round.
 *   keep        fraction of remaining damage kept after passing through.
 *   ricochet    chance 0..1 of a glancing round singing off instead of
 *               sticking. Effects only — a ricochet still ends the round.
 *   particle    'dust' | 'splinters' | 'sparks' | 'glass' | 'blood' | 'chips'
 *   decal       'hole' | 'crack' | 'dent' | 'wound' | null
 *   cue         the impact recording family the effects layer plays. Every
 *               name here is an existing manifest cue — nothing new is asked
 *               for by this table.
 */
export const MATERIAL_PROFILES = Object.freeze({
  drywall: Object.freeze({
    stop: 0.14, keep: 0.72, ricochet: 0.02,
    particle: 'dust', decal: 'hole', cue: 'heist.bullet.impact',
  }),
  wood: Object.freeze({
    stop: 0.07, keep: 0.6, ricochet: 0.05,
    particle: 'splinters', decal: 'hole', cue: 'gun.impact',
  }),
  glass: Object.freeze({
    stop: 0.5, keep: 0.9, ricochet: 0,
    particle: 'glass', decal: 'crack', cue: 'heist.bullet.impact',
  }),
  metal: Object.freeze({
    stop: 0.008, keep: 0.4, ricochet: 0.45,
    particle: 'sparks', decal: 'dent', cue: 'car.impact.metal',
  }),
  brick: Object.freeze({
    stop: 0, keep: 0, ricochet: 0.18,
    particle: 'chips', decal: 'hole', cue: 'heist.bullet.impact',
  }),
  concrete: Object.freeze({
    stop: 0, keep: 0, ricochet: 0.22,
    particle: 'dust', decal: 'hole', cue: 'heist.bullet.impact',
  }),
  vehicle: Object.freeze({
    stop: 0.03, keep: 0.5, ricochet: 0.3,
    particle: 'sparks', decal: 'dent', cue: 'heist.vehicle.impact',
  }),
  furniture: Object.freeze({
    stop: 0.1, keep: 0.65, ricochet: 0.03,
    particle: 'splinters', decal: 'hole', cue: 'gun.impact',
  }),
  flesh: Object.freeze({
    stop: 0.25, keep: 0.55, ricochet: 0,
    particle: 'blood', decal: 'wound', cue: 'gun.impact',
  }),
  armor: Object.freeze({
    stop: 0.004, keep: 0.3, ricochet: 0.5,
    particle: 'sparks', decal: 'dent', cue: 'car.impact.metal',
  }),
});

export const DEFAULT_MATERIAL = 'concrete';

export function materialProfile(name) {
  return MATERIAL_PROFILES[name] ?? MATERIAL_PROFILES[DEFAULT_MATERIAL];
}

/** Default thickness assumed when a mesh is tagged but not measured. */
export const DEFAULT_THICKNESS = Object.freeze({
  drywall: 0.02, wood: 0.03, glass: 0.01, metal: 0.004, brick: 0.2,
  concrete: 0.3, vehicle: 0.01, furniture: 0.05, flesh: 0.25, armor: 0.006,
});

/**
 * Can a round with this much penetration left get through, and what walks
 * out the far side?
 *
 * @returns {{ through: boolean, keep: number, spent: number }}
 *   `keep` is the damage fraction retained (0 when stopped); `spent` is the
 *   penetration budget consumed.
 */
export function penetrate(materialName, thickness, penetrationLeft) {
  const m = materialProfile(materialName);
  const t = thickness ?? DEFAULT_THICKNESS[materialName] ?? 0.3;
  if (m.stop <= 0) return { through: false, keep: 0, spent: penetrationLeft };
  const cost = t / m.stop; // fraction of a full budget this pass costs
  if (cost > penetrationLeft) return { through: false, keep: 0, spent: penetrationLeft };
  return { through: true, keep: m.keep, spent: cost };
}

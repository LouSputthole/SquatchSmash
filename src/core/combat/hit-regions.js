/**
 * The eight places a person can be shot, as data.
 *
 * The hitbox rig (`hitboxes.js`) tags every attached volume with one of
 * these keys; the damage resolver reads the same row. Multipliers are the
 * UNARMORED case — armor coverage is the archetype's business
 * (`archetypes.js` says which regions a vest or helmet covers), and helmet
 * arithmetic lives in `damage.js` so "the head was STRUCK" and "headshot
 * damage was APPLIED" stay two different facts.
 *
 *   multiplier  scales weapon damage when this region is hit. The head's
 *               own multiplier stacks with the weapon's `combat.headshot`.
 *   reaction    the default hit reaction the body plays for a non-fatal
 *               hit here: 'flinch' (small, additive), 'stagger' (interrupts),
 *               'arm' | 'leg' (limb-specific recoil/buckle).
 *   stagger     chance 0..1 that a solid hit here staggers rather than
 *               merely flinches, before pain-threshold scaling.
 *   bleed       relative bleed-out weight, if a mission enables bleed-out.
 */
export const HIT_REGIONS = Object.freeze({
  head: Object.freeze({ multiplier: 1.0, reaction: 'stagger', stagger: 0.9, bleed: 3 }),
  neck: Object.freeze({ multiplier: 1.6, reaction: 'stagger', stagger: 0.75, bleed: 3 }),
  upperTorso: Object.freeze({ multiplier: 1.0, reaction: 'flinch', stagger: 0.3, bleed: 2 }),
  lowerTorso: Object.freeze({ multiplier: 0.85, reaction: 'flinch', stagger: 0.25, bleed: 2 }),
  armL: Object.freeze({ multiplier: 0.6, reaction: 'arm', stagger: 0.15, bleed: 1 }),
  armR: Object.freeze({ multiplier: 0.6, reaction: 'arm', stagger: 0.15, bleed: 1 }),
  legL: Object.freeze({ multiplier: 0.7, reaction: 'leg', stagger: 0.35, bleed: 1 }),
  legR: Object.freeze({ multiplier: 0.7, reaction: 'leg', stagger: 0.35, bleed: 1 }),
});

export const REGION_NAMES = Object.freeze(Object.keys(HIT_REGIONS));

export function hitRegion(name) {
  return HIT_REGIONS[name] ?? HIT_REGIONS.upperTorso;
}

/** Regions a torso vest covers; a helmet covers only the head. */
export const VEST_REGIONS = Object.freeze(['upperTorso', 'lowerTorso']);

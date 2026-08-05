/**
 * Damage arithmetic, pure and testable.
 *
 * Nothing here touches a scene: these functions take numbers and hand back
 * numbers, and `vitals.js` is what actually subtracts the result from a
 * person. The taxonomy the owner asked for lives in the shapes returned —
 * a resolver can always tell apart:
 *
 *   headHit          the head HITBOX was struck (true even if a helmet ate it)
 *   headshotDamage   head-multiplied damage actually reached flesh
 *   helmetSaved      the helmet absorbed the round — sparks, stagger, no kill
 *   helmetKnockedOff the helmet is gone; the next one is a real headshot
 *   fatal            the target died of this hit (vitals adds this)
 *
 * Falloff is per-weapon catalog data (`combat.falloff`); region multipliers
 * come from `hit-regions.js`; armor coverage from the target's vest/helmet
 * points. Difficulty only ever scales the PLAYER side (damage the player
 * takes, never NPC health) — see config.js.
 */
import { hitRegion, VEST_REGIONS } from './hit-regions.js';

/** Damage fraction left at `distance` for a weapon's falloff curve. */
export function falloffScale(falloff, distance) {
  if (!falloff) return 1;
  const { start = 20, end = 60, floor = 0.5 } = falloff;
  if (!(distance > start)) return 1;
  if (distance >= end) return floor;
  const k = (distance - start) / Math.max(0.001, end - start);
  return 1 + (floor - 1) * k;
}

/**
 * Resolve one ray (or pellet) against a body region and its armor.
 *
 * @param {object} o
 * @param {object} o.weapon      a catalog definition (needs damage + combat)
 * @param {number} o.distance    metres travelled
 * @param {string} o.region      hit-regions key
 * @param {number} [o.vest]      torso armor points remaining
 * @param {number} [o.helmet]    head armor points remaining
 * @param {number} [o.carried]   damage fraction kept after penetrating cover
 * @param {number} [o.scale]     outer multiplier (difficulty, NPC skill)
 * @param {()=>number} [o.rng]   random source, injectable for tests
 * @returns {{
 *   damage:number, raw:number, headHit:boolean, headshotDamage:boolean,
 *   helmetSaved:boolean, helmetKnockedOff:boolean, helmetSpent:number,
 *   vestSpent:number, region:string, staggerChance:number, distance:number,
 * }}
 */
export function resolveHit({
  weapon, distance = 0, region = 'upperTorso',
  vest = 0, helmet = 0, carried = 1, scale = 1, rng = Math.random,
}) {
  const combat = weapon.combat ?? {};
  const row = hitRegion(region);
  const headHit = region === 'head' || region === 'neck';

  let raw = (weapon.damage ?? 0) * falloffScale(combat.falloff, distance) * carried * scale;
  raw *= row.multiplier;
  if (region === 'head') raw *= combat.headshot ?? 2.6;

  let damage = raw;
  let helmetSpent = 0;
  let vestSpent = 0;
  let helmetSaved = false;
  let helmetKnockedOff = false;

  if (region === 'head' && helmet > 0) {
    /* The helmet takes the round first. What it cannot absorb gets through
     * as blunt remainder — reduced, ringing, survivable. A helmet that hits
     * zero comes OFF, and the follow-up is a bare headshot. */
    helmetSpent = Math.min(helmet, raw);
    damage = Math.max(0, raw - helmetSpent) * 0.35;
    helmetSaved = damage < raw * 0.5;
    helmetKnockedOff = helmet - helmetSpent <= 0;
  } else if (vest > 0 && VEST_REGIONS.includes(region)) {
    /* Plate stops a share of what lands on it and is spent doing so. */
    const absorbed = Math.min(vest, raw * 0.65);
    vestSpent = absorbed;
    damage = raw - absorbed;
  }

  /* A helmet save still rattles the skull; everything else staggers by the
   * region's own odds. The target's staggerResist is vitals' business. */
  const staggerChance = helmetSaved
    ? 0.85
    : Math.min(1, row.stagger + (damage > 45 ? 0.25 : 0));

  return {
    damage,
    raw,
    headHit,
    headshotDamage: region === 'head' && !helmetSaved && damage > 0,
    helmetSaved,
    helmetKnockedOff,
    helmetSpent,
    vestSpent,
    region,
    staggerChance,
    distance,
    // Carried through for logs; rng reserved for future ricochet use.
    _rng: rng === Math.random ? undefined : rng,
  };
}

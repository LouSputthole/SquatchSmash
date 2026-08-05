/**
 * Who may hurt whom, per mission, in one object.
 *
 * `FactionMatrix` (factions.js) answers the STRUCTURAL question — police
 * shoot crew, nobody targets civilians. CombatRules wraps it with the
 * per-mission decisions the owner listed:
 *
 *   - friendly-fire mode: 'off' | 'reduced' | 'full' | 'playerOnly'
 *   - protected characters: named ids that cannot die here (they take the
 *     protectedCore path instead — visible in the record, handled by the
 *     mission, never a hidden health hack)
 *   - failure characters: shooting THIS one dead fails the mission
 *   - a grace filter against physics-fleas: friendly hits below
 *     `accidentFloor` damage never trigger failure, so a ricochet decal
 *     cannot end a campaign
 *
 * Allies barking when shot near/at is the audio layer's job; rules only
 * reports `allyGrazed` so it knows when.
 */
import { DEFAULT_FACTION_MATRIX } from './factions.js';

export const FRIENDLY_FIRE = Object.freeze({
  OFF: 'off',
  REDUCED: 'reduced',
  FULL: 'full',
  PLAYER_ONLY: 'playerOnly',
});

export class CombatRules {
  /**
   * @param {object} o
   * @param {object} [o.matrix] a FactionMatrix
   * @param {string} [o.friendlyFire] FRIENDLY_FIRE mode
   * @param {number} [o.friendlyFireScale] damage scale in 'reduced' mode
   * @param {string[]} [o.protectedIds] cannot die in this mission
   * @param {string[]} [o.failOnKillIds] killing one fails the mission
   * @param {number} [o.accidentFloor] friendly damage below this is noise
   * @param {(info)=>void} [o.onProtectedHit] mission callback
   * @param {(info)=>void} [o.onFriendlyKill] mission-failure callback
   */
  constructor({
    matrix = DEFAULT_FACTION_MATRIX,
    friendlyFire = FRIENDLY_FIRE.REDUCED,
    friendlyFireScale = 0.35,
    protectedIds = [],
    failOnKillIds = [],
    accidentFloor = 8,
    onProtectedHit = null,
    onFriendlyKill = null,
  } = {}) {
    this.matrix = matrix;
    this.friendlyFire = friendlyFire;
    this.friendlyFireScale = friendlyFireScale;
    this.protectedIds = new Set(protectedIds);
    this.failOnKillIds = new Set(failOnKillIds);
    this.accidentFloor = accidentFloor;
    this.onProtectedHit = onProtectedHit;
    this.onFriendlyKill = onFriendlyKill;
  }

  isProtected(id) { return this.protectedIds.has(id); }

  /**
   * May this shot hurt this target, and at what scale?
   * @returns {{allowed:boolean, scale:number, friendly:boolean, reason?:string}}
   */
  gate({ attacker, target, playerShot = false, damage = 0 }) {
    const same = attacker?.faction && attacker.faction === target?.faction;
    if (!same) {
      const allowed = this.matrix.canDamage(attacker, target, { playerShot });
      return { allowed, scale: 1, friendly: false, reason: allowed ? undefined : 'faction' };
    }
    // Same side: the mission's friendly-fire mode decides.
    switch (this.friendlyFire) {
      case FRIENDLY_FIRE.OFF:
        return { allowed: false, scale: 0, friendly: true, reason: 'friendly-fire-off' };
      case FRIENDLY_FIRE.FULL:
        return { allowed: true, scale: 1, friendly: true };
      case FRIENDLY_FIRE.PLAYER_ONLY:
        return playerShot
          ? { allowed: true, scale: 1, friendly: true }
          : { allowed: false, scale: 0, friendly: true, reason: 'npc-friendly-fire-off' };
      case FRIENDLY_FIRE.REDUCED:
      default:
        return { allowed: true, scale: this.friendlyFireScale, friendly: true };
    }
  }

  /**
   * Called by the resolver AFTER vitals applied a hit, with the record.
   * Routes protected-character and mission-failure consequences.
   * @returns {'ok'|'grazed'|'protected'|'failed'}
   */
  judge({ targetId, record, friendly, playerShot }) {
    if (record.protectedCore || (record.fatal && this.isProtected(targetId) && !record.applied)) {
      this.onProtectedHit?.({ targetId, record });
      return 'protected';
    }
    if (record.fatal && this.failOnKillIds.has(targetId) && playerShot) {
      this.onFriendlyKill?.({ targetId, record });
      return 'failed';
    }
    if (friendly && record.applied && record.damage >= this.accidentFloor) return 'grazed';
    return 'ok';
  }
}

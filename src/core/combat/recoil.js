/**
 * Recoil the player can learn, not screen shake.
 *
 * Two separate quantities per the owner's spec:
 *
 *   - CAMERA recoil: the muzzle genuinely climbs. `pitchKick`/`yawKick` are
 *     handed to the scene, which adds them to the player's actual aim — the
 *     player pulls down to compensate, exactly like the gun they are holding.
 *     A fraction recovers on its own (`recovery`), so a controlled pair
 *     settles and a mag dump walks.
 *   - VIEW-MODEL recoil: WeaponSystem's own `recoilKick` handles the gun
 *     model punching back; this class does not duplicate it.
 *
 * Per-weapon character comes straight from the catalog `combat.recoil` row:
 * first-shot multiplier, vertical climb compounding (`climb` > 1 gets worse
 * through a burst; the SAW's < 1 beds in), bounded horizontal variation
 * (alternating drift, not noise), and recovery rate.
 */
export class RecoilController {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    /** Uncompensated climb still owed back to the player, radians. */
    this.pendingPitch = 0;
    this.pendingYaw = 0;
    this.burstShots = 0;
    this.sinceShot = 999;
    this._driftSign = 1;
  }

  /**
   * One shot fired. Returns the kick to add to the aim THIS frame.
   * @param {object} profile catalog `combat.recoil`
   * @returns {{pitch:number, yaw:number}}
   */
  kick(profile) {
    const p = profile ?? {};
    if (this.sinceShot > 0.45) this.burstShots = 0;
    const n = this.burstShots++;
    this.sinceShot = 0;

    const first = n === 0 ? (p.firstShot ?? 1.35) : 1;
    const climb = Math.pow(p.climb ?? 1.12, Math.min(n, 12));
    const pitch = (p.pitch ?? 0.016) * first * climb;

    /* Horizontal: a bounded walk that alternates its lean so the pattern is
     * a wiggle around centre, learnable, never a coin-flip yank. */
    this._driftSign = -this._driftSign;
    const yaw = (p.yaw ?? 0.005) * (this._driftSign * 0.6 + (this.rng() - 0.5) * 0.8) * climb;

    this.pendingPitch += pitch * 0.55; // the rest is permanent climb to pull down
    this.pendingYaw += yaw * 0.55;
    return { pitch, yaw };
  }

  /**
   * Recover a share of the pending kick. Returns what to SUBTRACT from the
   * aim this frame (the camera easing back toward where it was).
   */
  update(dt, profile) {
    this.sinceShot += Math.max(0, dt);
    const rate = (profile?.recovery ?? 5.5) * Math.max(0, dt);
    const k = Math.min(1, rate);
    const pitch = this.pendingPitch * k;
    const yaw = this.pendingYaw * k;
    this.pendingPitch -= pitch;
    this.pendingYaw -= yaw;
    if (Math.abs(this.pendingPitch) < 1e-5) this.pendingPitch = 0;
    if (Math.abs(this.pendingYaw) < 1e-5) this.pendingYaw = 0;
    return { pitch, yaw };
  }

  reset() {
    this.pendingPitch = 0;
    this.pendingYaw = 0;
    this.burstShots = 0;
    this.sinceShot = 999;
  }
}

/**
 * The one spread number a shot actually uses, from everything the body is
 * doing. Used by the player (via WeaponSystem.getSpreadScale) AND by NPCs
 * (via their skill row), so the same stance physics applies to both.
 *
 * @param {object} o
 * @param {object} o.weapon      catalog definition
 * @param {boolean} [o.moving]
 * @param {boolean} [o.sprinting]
 * @param {boolean} [o.crouched]
 * @param {boolean} [o.airborne]
 * @param {number} [o.suppression] 0..1
 * @param {number} [o.injury]      0..1 (1 = nearly dead)
 * @param {number} [o.skill]       NPC skill spread multiplier; 1 for players
 * @returns {number} multiplier on the firearm's own bloomed spread
 */
export function stanceSpreadScale({
  weapon, moving = false, sprinting = false, crouched = false,
  airborne = false, suppression = 0, injury = 0, skill = 1,
}) {
  const c = weapon?.combat ?? {};
  let scale = skill;
  if (crouched) scale *= c.crouchSpread ?? 0.8;
  if (moving) scale *= c.moveSpread ?? 1.7;
  if (sprinting) scale *= 2.6; // fired from a dead run — when a mission allows it at all
  if (airborne) scale *= 3.2;
  scale *= 1 + suppression * 0.9;
  scale *= 1 + injury * 0.5;
  return scale;
}

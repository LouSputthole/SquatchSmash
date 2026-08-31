export const EXECUTION_CHOICE_SECONDS = 10;

/**
 * Simulation-time choice clock for Gratin's pistol handoff.
 *
 * It never uses setTimeout, so pausing the game pauses the decision and a
 * verifier can cross the deadline deterministically. Timeout deliberately
 * resolves to "gratin", the same authored outcome as choosing NO.
 */
export class CabinExecutionChoice {
  constructor({
    element = null,
    seconds = EXECUTION_CHOICE_SECONDS,
    onResolve = null,
  } = {}) {
    this.element = element;
    this.seconds = Math.max(0.1, Number(seconds) || EXECUTION_CHOICE_SECONDS);
    this.onResolve = onResolve;
    this.remaining = 0;
    this.active = false;
    this.result = null;
    this.reason = null;
    this._buttons = [...(element?.querySelectorAll?.('[data-choice]') || [])];
    for (const button of this._buttons) {
      button.addEventListener('click', () => this.choose(button.dataset.choice));
    }
    this.render();
  }

  open() {
    this.remaining = this.seconds;
    this.active = true;
    this.result = null;
    this.reason = null;
    this.render();
    return true;
  }

  choose(value, reason = 'player') {
    if (!this.active) return false;
    const normalized = value === 'yes' || value === 'player' ? 'player' : 'gratin';
    this.active = false;
    this.result = normalized;
    this.reason = reason;
    this.render();
    this.onResolve?.(normalized, reason);
    return true;
  }

  handleKey(code) {
    if (!this.active) return false;
    if (code === 'Digit1' || code === 'Numpad1') return this.choose('player', 'player');
    if (code === 'Digit2' || code === 'Numpad2') return this.choose('gratin', 'player');
    return false;
  }

  update(dt) {
    if (!this.active) return;
    this.remaining = Math.max(0, this.remaining - Math.max(0, Number(dt) || 0));
    if (this.remaining <= 0) {
      this.choose('gratin', 'timeout');
      return;
    }
    this.render();
  }

  close() {
    this.active = false;
    this.render();
  }

  render() {
    if (!this.element) return;
    this.element.classList.toggle('hidden', !this.active);
    const progress = this.active ? (this.remaining / this.seconds) * 100 : 0;
    this.element.style.setProperty('--choice-progress', progress.toFixed(2) + '%');
    const clock = this.element.querySelector('.choice-clock span');
    if (clock) clock.textContent = this.remaining.toFixed(1);
  }

  snapshot() {
    return Object.freeze({
      active: this.active,
      remaining: this.remaining,
      result: this.result,
      reason: this.reason,
    });
  }
}

export function createCabinExecutionChoice(options) {
  return new CabinExecutionChoice(options);
}

/* ------------------------------------------------------------------ */
/* The other half of the decision: what Gratin actually does           */
/* ------------------------------------------------------------------ */

/** How long he has to turn and bring the pistol up before each shot. */
export const GRATIN_AIM_SECONDS = 1.05;
/** Quiet beat between one body and the turn toward the next. */
export const GRATIN_SHOT_GAP_SECONDS = 0.50;
/** With nothing left to aim at, he lowers the gun and squares up again. */
export const GRATIN_RECOVER_SECONDS = 0.55;

/**
 * WHERE THE GUN ACTUALLY IS, MEASURED IN THE BUILT DUNGEON.
 *
 * A man does not shoot from the middle of his chest. With the 9 mm mounted on
 * Gratin's right forearm and the authored one-handed pose applied, the muzzle
 * stands 0.345 m right of his centre line, 0.740 m in front of it and 1.31 m
 * off the slab, and the bore leaves it 4.31 degrees to the right of his body
 * heading (that is the 0.08 rad roll in `AIM_SHOULDER_X`'s pose) and 6.36
 * degrees below horizontal. Both readings are stable to a hundredth of a
 * degree between the two victims, which is why they can be constants.
 *
 * Turning his BODY to the bearing of the man is therefore not enough: aiming
 * his chest at the baiter left the bore 10.2 degrees off, and at the A-Team
 * man 11.8 degrees off -- 0.72 m and 0.69 m wide at those ranges, which is a
 * clean miss of a human being. `aimAt` solves for the heading that puts the
 * BORE on the head instead.
 */
const AIM_SHOULDER_X = -1.18;
const AIM_FOREARM_X = -0.28;
const AIM_REFERENCE_ELEVATION = -0.1110;
const MUZZLE_RIGHT = 0.345;
const MUZZLE_FORWARD = 0.740;
const MUZZLE_HEIGHT = 1.31;
const BORE_YAW_OFFSET = 0.0752;

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

/**
 * GRATIN FACES THE MAN HE IS SHOOTING.
 *
 * Owner, cabin playtest: *"if you choose no to shooting them, the animation
 * from Gratin, he doesn't really face the ones that he's shooting. We put a
 * little more work into the actual animation there."*
 *
 * He was right and the geometry says how wrong. Gratin stands at (0.42, 12.92)
 * on the slab, facing the rack on a yaw of 66.87 degrees. With the restraint
 * poses running, the Counter-Strike baiter's head hangs at (-3.14, -4.18,
 * 14.83) and the A-Team man's lies at (3.65, -3.98, 13.89) -- one behind his
 * left shoulder, one behind his right. Nothing turned him for either: the old
 * `onGratinShot` played a pistol cue at his BOOTS and put a wound on a body he
 * had his back to, twice, 1.10 s apart.
 *
 * He now turns 137.18 degrees to the baiter, fires, then swings 134.21 degrees
 * the other way to the man on the rack. Measured after the turns, the bore
 * leaves the muzzle 0.17 and 0.70 degrees off those two heads -- 12 mm and
 * 49 mm at 4.04 m and 3.37 m.
 *
 * This owns the turn, the gun coming up, the recoil and the recovery, and it
 * is deliberately arithmetic rather than THREE so the execution branch stays
 * testable without a renderer -- `verify:cabin` runs its test file on its own,
 * outside the shim `tests/run.mjs` installs. The scene passes in the Npc, its
 * mounted gun, and a world point per victim; it drives nothing else.
 */
export function createCabinGratinExecutionStaging({
  actor = null,
  gun = null,
  aimSeconds = GRATIN_AIM_SECONDS,
  recoverSeconds = GRATIN_RECOVER_SECONDS,
} = {}) {
  const state = {
    homeYaw: Number(actor?.group?.rotation?.y) || 0,
    fromYaw: Number(actor?.group?.rotation?.y) || 0,
    toYaw: Number(actor?.group?.rotation?.y) || 0,
    // Starts spent, so the first frames of the scene do not read as a turn
    // and clear whatever heading the dungeon staged Gratin on.
    turnTime: Math.max(0.05, Number(aimSeconds) || GRATIN_AIM_SECONDS),
    turnDuration: Math.max(0.05, Number(aimSeconds) || GRATIN_AIM_SECONDS),
    present: 0,
    presentTarget: 0,
    elevation: AIM_REFERENCE_ELEVATION,
    kick: 0,
    aiming: false,
  };

  /**
   * Only take the arms while the gun is actually up.
   *
   * `Npc.update` writes Gratin's arms every frame for his idle, and this runs
   * after it. Posing unconditionally -- even to a zeroed rest -- would freeze
   * his idle for the whole chapter, so the pose is skipped entirely once the
   * gun is down and the recoil has bled off, and his own rig takes them back.
   */
  const applyPose = () => {
    if (!actor?.parts?.armR) return;
    const raise = state.present;
    if (raise <= 0.0005 && state.kick <= 0.0005) return;
    const pitch = AIM_SHOULDER_X - (state.elevation - AIM_REFERENCE_ELEVATION) - state.kick * 0.14;
    actor.parts.armR.rotation.set(pitch * raise, 0, 0.08 * raise);
    actor.parts.foreR.rotation.set((AIM_FOREARM_X - state.kick * 0.10) * raise, 0, 0);
    // The off hand stays down. A pistol executioner does not brace at a man
    // roped to a bench, and a second raised arm read as a two-handed stance
    // the mounted model cannot support.
    actor.parts.armL?.rotation?.set(-0.10 * raise, 0, -0.06 * raise);
    actor.parts.foreL?.rotation?.set(-0.12 * raise, 0, 0);
    if (gun) {
      if (gun.userData?.executionBaseRotationX === undefined) {
        gun.userData ??= {};
        gun.userData.executionBaseRotationX = gun.rotation.x;
      }
      gun.rotation.x = gun.userData.executionBaseRotationX - state.kick * 0.34;
    }
  };

  const snapshot = () => {
    const yaw = actor?.group?.rotation?.y ?? 0;
    return Object.freeze({
      aiming: state.aiming,
      yaw,
      targetYaw: state.toYaw,
      homeYaw: state.homeYaw,
      offByDegrees: Math.abs(wrapAngle(state.toYaw - yaw)) * 180 / Math.PI,
      turnedDegrees: Math.abs(wrapAngle(state.toYaw - state.fromYaw)) * 180 / Math.PI,
      elevationDegrees: state.elevation * 180 / Math.PI,
      present: state.present,
      kick: state.kick,
    });
  };

  return Object.freeze({
    /** Remember the heading he should be left on when the work is done. */
    markHome(yaw = actor?.group?.rotation?.y) {
      state.homeYaw = Number(yaw) || 0;
      return state.homeYaw;
    },

    /**
     * Turn toward one victim and start bringing the pistol up.
     * @param {{x:number,y:number,z:number}} point the victim's head in world space
     */
    aimAt(point) {
      if (!actor?.group || !point) return false;
      const here = actor.group.position;
      const tx = Number(point.x);
      const tz = Number(point.z);
      if (Math.hypot(tx - here.x, tz - here.z) < 1e-4) return false;
      state.fromYaw = actor.group.rotation.y;
      /* `Npc` faces its own +Z, so headings here are atan2(dx, dz), not the
       * player's camera convention -- handing this a `yawToward` result aims
       * him 180 out. Start from the bearing of his chest, then walk the muzzle
       * round with it three times; the offset is small next to the range, so
       * it settles inside a hundredth of a degree by the third pass. */
      let psi = Math.atan2(tx - here.x, tz - here.z);
      let muzzleX = here.x;
      let muzzleZ = here.z;
      for (let pass = 0; pass < 3; pass++) {
        const s = Math.sin(psi);
        const c = Math.cos(psi);
        muzzleX = here.x + c * MUZZLE_RIGHT + s * MUZZLE_FORWARD;
        muzzleZ = here.z - s * MUZZLE_RIGHT + c * MUZZLE_FORWARD;
        psi = Math.atan2(tx - muzzleX, tz - muzzleZ) - BORE_YAW_OFFSET;
      }
      state.toYaw = psi;
      state.turnTime = 0;
      const reach = Math.max(0.05, Math.hypot(tx - muzzleX, tz - muzzleZ));
      state.elevation = clamp(
        Math.atan2(Number(point.y) - (here.y + MUZZLE_HEIGHT), reach),
        -1.15,
        0.7,
      );
      state.aiming = true;
      state.presentTarget = 1;
      // A snap elsewhere must not drag him back mid-turn.
      if (actor) actor.targetYaw = undefined;
      return true;
    },

    /** One round away: recoil up the arm, and hold the heading. */
    fire() {
      if (!state.aiming) return false;
      state.kick = 1;
      return true;
    },

    /** Lower the gun and square back up on the remembered heading. */
    release() {
      if (!state.aiming) return false;
      state.fromYaw = actor?.group?.rotation?.y ?? state.homeYaw;
      state.toYaw = state.homeYaw;
      state.turnTime = 0;
      state.aiming = false;
      state.presentTarget = 0;
      return true;
    },

    update(dt = 0) {
      const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
      if (!actor?.group) return snapshot();
      if (state.turnTime < state.turnDuration) {
        state.turnTime = Math.min(state.turnDuration, state.turnTime + step);
        const delta = wrapAngle(state.toYaw - state.fromYaw);
        actor.group.rotation.y = state.fromYaw + delta * easeInOut(state.turnTime / state.turnDuration);
        actor.targetYaw = undefined;
      }
      // The gun comes up over the back half of the turn and drops faster.
      const presentRate = state.presentTarget > state.present
        ? step / (state.turnDuration * 0.55)
        : step / Math.max(0.05, recoverSeconds);
      state.present += clamp(state.presentTarget - state.present, -presentRate, presentRate);
      state.present = clamp(state.present, 0, 1);
      state.kick = Math.max(0, state.kick - step * 7.5);
      applyPose();
      return snapshot();
    },

    /** True once he is genuinely pointed at what he is about to shoot. */
    settled(tolerance = 0.09) {
      return Math.abs(wrapAngle(state.toYaw - (actor?.group?.rotation?.y ?? 0))) <= tolerance;
    },

    snapshot,
  });
}

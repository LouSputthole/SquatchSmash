import { WEAPON_CATALOG } from '../../core/weapons/catalog.js';

const FULL_LOADOUT_NUDGE = 'You are already carrying five guns. You are armed - get upstairs.';
/* The rack gun could not be recorded in the durable loadout, but Armory.take()
 * has already put it in the player's hands. He is armed; the mission says so
 * instead of pretending the pickup never happened. */
const UNTRACKED_TAKE_NUDGE = 'That one does not fit your loadout, but it is in your hands. You are armed - get upstairs.';
const FALLBACK_TAKE_NUDGE = 'That rack gun would not go in your loadout. The gun you already carry will do - get upstairs.';
const RETRY_TAKE_NUDGE = 'That rack gun would not go in your loadout. Take a different one off the rack.';

/** Every real catalog gun is valid at the gallery firing step; empty hands are not. */
export function isSiegeLineWeapon(id) {
  return typeof id === 'string' && Object.hasOwn(WEAPON_CATALOG, id);
}

/**
 * Resolve a real armory take without depending on Three.js or browser state.
 *
 * A scene inherited from the previous mission can already own all five slots.
 * In that case the rack weapon must go back, but the weapon the player already
 * selected is still a valid armory choice and must not strand the mission on
 * the ARM beat.
 *
 * `advance` means "keep going in the caller", not "the beat is now over": the
 * beat itself is still gated by `isSiegeLineWeapon()` inside the scene's
 * `completeArmoryPickup()`. It has to be true for the nudge to be reached at
 * all, because the caller returns on a false `advance` before it speaks.
 *
 * The rule this file exists to hold: ONCE THE PLAYER IS ARMED, "Arm yourself"
 * MUST BE SATISFIABLE. Every failed acquisition below either advances on a gun
 * that really is in his hands, or sends the rack copy back and says out loud
 * what to do next -- never a silent dead end in a room with nothing left to
 * press, which is exactly the shape the LITTLE_FRIEND nudge was written to
 * kill and which this beat inherited by never mirroring it.
 */
export function resolveArmoryTake({ takenId, acquisition, loadout } = {}) {
  if (acquisition?.ok) {
    return {
      advance: typeof takenId === 'string' && takenId.length > 0,
      keepTaken: true,
      equipSlot: Number.isInteger(acquisition.slot) ? acquisition.slot : -1,
      weaponId: takenId ?? null,
      nudge: null,
    };
  }

  const slots = Array.isArray(loadout?.slots) ? loadout.slots : [];
  const selected = Number.isInteger(loadout?.selected) ? loadout.selected : -1;
  const equipSlot = slots[selected] ? selected : slots.findIndex(Boolean);
  const weaponId = equipSlot >= 0 ? slots[equipSlot] : null;

  if (acquisition?.reason === 'full') {
    return {
      advance: typeof weaponId === 'string' && weaponId.length > 0,
      keepTaken: false,
      equipSlot,
      weaponId,
      nudge: weaponId ? FULL_LOADOUT_NUDGE : null,
    };
  }

  /* Any other refusal -- 'unknown_weapon' today, whatever the loadout learns to
   * refuse tomorrow. The gun is already off the wall and equipped, so a bare
   * `advance: false` left the player armed in an empty armory with the
   * objective still asking him to arm himself and nothing on screen saying
   * why. If the thing in his hands is a real line weapon, that IS the answer:
   * keep it and let the beat close on it, even though the durable loadout
   * could not record it. */
  if (isSiegeLineWeapon(takenId)) {
    return {
      advance: true,
      keepTaken: true,
      equipSlot: slots.indexOf(takenId),
      weaponId: takenId,
      nudge: UNTRACKED_TAKE_NUDGE,
    };
  }

  /* Not a gun the line accepts. The rack copy goes back so the stand is
   * interactable again, and he falls back to whatever he already owns. */
  return {
    advance: true,
    keepTaken: false,
    equipSlot,
    weaponId,
    nudge: weaponId ? FALLBACK_TAKE_NUDGE : RETRY_TAKE_NUDGE,
  };
}

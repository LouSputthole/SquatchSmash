import { WEAPON_CATALOG } from '../../core/weapons/catalog.js';

const FULL_LOADOUT_NUDGE = 'You are already carrying five guns. You are armed - get upstairs.';

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

  if (acquisition?.reason !== 'full') {
    return {
      advance: false,
      keepTaken: false,
      equipSlot: -1,
      weaponId: null,
      nudge: null,
    };
  }

  const slots = Array.isArray(loadout?.slots) ? loadout.slots : [];
  const selected = Number.isInteger(loadout?.selected) ? loadout.selected : -1;
  const equipSlot = slots[selected] ? selected : slots.findIndex(Boolean);
  const weaponId = equipSlot >= 0 ? slots[equipSlot] : null;

  return {
    advance: typeof weaponId === 'string' && weaponId.length > 0,
    keepTaken: false,
    equipSlot,
    weaponId,
    nudge: weaponId ? FULL_LOADOUT_NUDGE : null,
  };
}

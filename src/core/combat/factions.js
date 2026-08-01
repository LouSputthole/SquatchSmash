export const FACTIONS = Object.freeze({
  CREW: 'crew',
  POLICE: 'police',
  CIVILIAN: 'civilian',
  NEUTRAL: 'neutral',
});

function factionOf(value) {
  return typeof value === 'string' ? value : value?.faction;
}

/** Structural target policy shared by player ballistics and NPC selection. */
export class FactionMatrix {
  canTarget(attacker, target) {
    const from = factionOf(attacker);
    const to = factionOf(target);
    if (!from || !to || from === to) return false;
    if (to === FACTIONS.CIVILIAN || to === FACTIONS.NEUTRAL) return false;
    return (from === FACTIONS.CREW && to === FACTIONS.POLICE)
      || (from === FACTIONS.POLICE && to === FACTIONS.CREW);
  }

  canDamage(attacker, target, { playerShot = false } = {}) {
    const from = factionOf(attacker);
    const to = factionOf(target);
    if (!from || !to || from === to) return false;
    if (to === FACTIONS.NEUTRAL) return false;
    // Civilians are never an NPC target. A player's careless round may still
    // hit one so the mission can restore its checkpoint instead of lying.
    if (to === FACTIONS.CIVILIAN) return playerShot && from === FACTIONS.CREW;
    return this.canTarget(from, to);
  }
}

export const DEFAULT_FACTION_MATRIX = Object.freeze(new FactionMatrix());

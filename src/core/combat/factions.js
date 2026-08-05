export const FACTIONS = Object.freeze({
  CREW: 'crew',
  POLICE: 'police',
  /* The men who come up Lou's drive on the night of the siege, and the men
   * around Mark's table at the end of the campaign. They are the first
   * faction in this game that the CREW is allowed to shoot on sight. */
  CARTEL: 'cartel',
  CIVILIAN: 'civilian',
  NEUTRAL: 'neutral',
});

/**
 * Who may shoot whom, declared once and symmetrically.
 *
 * This used to be two hardcoded CREW/POLICE comparisons inside canTarget().
 * Adding a third faction to that shape means adding two more comparisons and
 * hoping nobody writes the pair backwards -- so the pairs are data now and
 * the lookup is generated from them in both directions.
 *
 * POLICE and CARTEL are deliberately NOT hostile to each other. No mission
 * puts them in the same room, an unused hostility is an untested one, and
 * the day a mission does need it, it is one line here.
 */
const HOSTILE_PAIRS = Object.freeze([
  [FACTIONS.CREW, FACTIONS.POLICE],
  [FACTIONS.CREW, FACTIONS.CARTEL],
]);

const HOSTILITY = new Map();
for (const [a, b] of HOSTILE_PAIRS) {
  HOSTILITY.set(`${a}>${b}`, true);
  HOSTILITY.set(`${b}>${a}`, true);
}

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
    return HOSTILITY.has(`${from}>${to}`);
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

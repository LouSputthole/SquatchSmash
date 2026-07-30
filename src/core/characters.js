import { CHARACTER_IDS } from './campaign.js';

/**
 * Story identity is intentionally separate from scene presentation.
 *
 * A scene may render one of these people with a procedural figure today and a
 * GLB tomorrow without changing mission flags, dialogue ownership, save data,
 * or voice selection. These identity facts are campaign canon; model and
 * clothing choices remain scene presentation.
 */
function character({
  id,
  canonicalName,
  subtitleName,
  voiceProfile,
  species,
  role,
  legacyAliases = [],
}) {
  return Object.freeze({
    id,
    canonicalName,
    subtitleName,
    voiceProfile,
    species,
    role,
    legacyAliases: Object.freeze([...legacyAliases]),
  });
}

export const CHARACTER_REGISTRY = Object.freeze({
  [CHARACTER_IDS.PROSPECT]: character({
    id: CHARACTER_IDS.PROSPECT,
    canonicalName: 'Tony Squatchtana',
    subtitleName: 'Prospect',
    voiceProfile: 'player',
    species: 'human',
    role: 'prospect',
    legacyAliases: ['player', 'tony_squatchtana'],
  }),
  [CHARACTER_IDS.LOU]: character({
    id: CHARACTER_IDS.LOU,
    canonicalName: 'Big Uncle Lou Sputthole',
    subtitleName: 'Big Uncle Lou',
    voiceProfile: 'lou1',
    species: 'human',
    role: 'founder',
    legacyAliases: ['lou1', 'lou_sputthole', 'big_uncle_lou'],
  }),
  [CHARACTER_IDS.CAPTAIN_LOU_SASOLE]: character({
    id: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    canonicalName: 'Captain Lou Sasole',
    subtitleName: 'Captain Lou Sasole',
    voiceProfile: 'lou2',
    species: 'human',
    role: 'family_member',
    legacyAliases: ['lou2', 'sasole'],
  }),
  [CHARACTER_IDS.BOOSKI]: character({
    id: CHARACTER_IDS.BOOSKI,
    canonicalName: 'Booskibro',
    subtitleName: 'Booskibro',
    voiceProfile: 'booski',
    species: 'human',
    role: 'founder',
    legacyAliases: ['booskibro'],
  }),
  /**
   * The Circle's roaster, and the first member Tony meets twice.
   *
   * He is a locked Initiation id (`src/initiation/npc.js`) who also turns up at
   * the pillar table in the Silver Room, so he needs one identity rather than
   * two scene-local cast keys that happen to spell the same word.
   */
  [CHARACTER_IDS.APE]: character({
    id: CHARACTER_IDS.APE,
    canonicalName: 'Ape',
    subtitleName: 'Ape',
    voiceProfile: 'ape',
    species: 'human',
    role: 'family_member',
    legacyAliases: ['APE'],
  }),
  /**
   * The date, and the only named person in the campaign with no stake in it.
   *
   * She is deliberately not family and deliberately not on the family's radio
   * station: she runs a kitchen, she is a civilian, and her good opinion costs
   * something to earn precisely because none of this belongs to her. The role
   * is `civilian` for that reason — it is load-bearing, not decoration.
   *
   * `date` is a legacy alias because the mission that introduced her keys her
   * by role rather than by name, so she can be recast with a data edit.
   */
  [CHARACTER_IDS.MARGO]: character({
    id: CHARACTER_IDS.MARGO,
    canonicalName: 'Margo Salas',
    subtitleName: 'Margo',
    voiceProfile: 'margo',
    species: 'human',
    role: 'civilian',
    legacyAliases: ['margo_salas', 'date'],
  }),
});

const CHARACTER_ALIASES = Object.freeze(
  Object.values(CHARACTER_REGISTRY).reduce((aliases, entry) => {
    aliases[entry.id] = entry.id;
    for (const alias of entry.legacyAliases) aliases[alias] = entry.id;
    return aliases;
  }, {}),
);

export function resolveCharacterId(reference) {
  return typeof reference === 'string'
    ? CHARACTER_ALIASES[reference] ?? null
    : null;
}

export function getCharacter(reference) {
  const id = resolveCharacterId(reference);
  return id ? CHARACTER_REGISTRY[id] : null;
}

export function voiceProfileFor(reference) {
  return getCharacter(reference)?.voiceProfile ?? null;
}

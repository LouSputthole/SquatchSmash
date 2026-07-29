import { CHARACTER_IDS } from './campaign.js';

/**
 * Story identity is intentionally separate from scene presentation.
 *
 * A scene may render one of these people with a procedural figure today and a
 * GLB tomorrow without changing mission flags, dialogue ownership, save data,
 * or voice selection. Species, model, clothing, and Initiation aliases stay
 * out of this file until their canon is agreed.
 */
function character({ id, subtitleName, voiceProfile, legacyAliases = [] }) {
  return Object.freeze({
    id,
    subtitleName,
    voiceProfile,
    legacyAliases: Object.freeze([...legacyAliases]),
  });
}

export const CHARACTER_REGISTRY = Object.freeze({
  [CHARACTER_IDS.PROSPECT]: character({
    id: CHARACTER_IDS.PROSPECT,
    subtitleName: 'Prospect',
    voiceProfile: 'player',
    legacyAliases: ['player'],
  }),
  [CHARACTER_IDS.LOU]: character({
    id: CHARACTER_IDS.LOU,
    subtitleName: 'Lou',
    voiceProfile: 'lou1',
    legacyAliases: ['lou1'],
  }),
  [CHARACTER_IDS.CAPTAIN_LOU_SASOLE]: character({
    id: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    subtitleName: 'Captain Lou Sasole',
    voiceProfile: 'lou2',
    legacyAliases: ['lou2'],
  }),
  [CHARACTER_IDS.BOOSKI]: character({
    id: CHARACTER_IDS.BOOSKI,
    subtitleName: 'Booski',
    voiceProfile: 'booski',
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

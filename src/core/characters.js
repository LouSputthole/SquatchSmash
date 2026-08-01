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
  /* The rest of the Family, one record per row of the owner's locked sheet
   * (docs/VOICE-CASTING.md). Voice profiles are the manifest's `voices` keys;
   * aliases carry spellings older assets already use — `erican` is Ericran's
   * face photo, `shubes` is the Shubenator's, `stove` is the cue slug. */
  [CHARACTER_IDS.LAG]: character({
    id: CHARACTER_IDS.LAG,
    canonicalName: 'Lag',
    subtitleName: 'Lag',
    voiceProfile: 'lag',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.GRATIN]: character({
    id: CHARACTER_IDS.GRATIN,
    canonicalName: 'Gratin',
    subtitleName: 'Gratin',
    voiceProfile: 'gratin',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.ERIC]: character({
    id: CHARACTER_IDS.ERIC,
    canonicalName: 'Ericran',
    subtitleName: 'Ericran',
    voiceProfile: 'eric',
    species: 'human',
    role: 'family_member',
    legacyAliases: ['ericran', 'erican'],
  }),
  [CHARACTER_IDS.HOG_MAMA]: character({
    id: CHARACTER_IDS.HOG_MAMA,
    canonicalName: 'Hog Mama',
    subtitleName: 'Hog Mama',
    voiceProfile: 'hogmama',
    species: 'human',
    role: 'family_member',
    legacyAliases: ['hog_mama'],
  }),
  [CHARACTER_IDS.DEATHMEGATRON]: character({
    id: CHARACTER_IDS.DEATHMEGATRON,
    canonicalName: 'DeathMegatron',
    subtitleName: 'DeathMegatron',
    voiceProfile: 'deathmegatron',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.WILLY]: character({
    id: CHARACTER_IDS.WILLY,
    canonicalName: 'Willy',
    subtitleName: 'Willy',
    voiceProfile: 'willy',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.IRISH]: character({
    id: CHARACTER_IDS.IRISH,
    canonicalName: 'Irish',
    subtitleName: 'Irish',
    voiceProfile: 'irish',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.OLD_STOVE]: character({
    id: CHARACTER_IDS.OLD_STOVE,
    canonicalName: 'Old Stove',
    subtitleName: 'Old Stove',
    voiceProfile: 'old-stove',
    species: 'human',
    role: 'family_member',
    legacyAliases: ['stove'],
  }),
  [CHARACTER_IDS.SNOW]: character({
    id: CHARACTER_IDS.SNOW,
    canonicalName: 'Snow',
    subtitleName: 'Snow',
    voiceProfile: 'snow',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.RIPPINFLOW]: character({
    id: CHARACTER_IDS.RIPPINFLOW,
    canonicalName: 'Rippinflow',
    subtitleName: 'Rippinflow',
    voiceProfile: 'rippinflow',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.SEFF]: character({
    id: CHARACTER_IDS.SEFF,
    canonicalName: 'Seff',
    subtitleName: 'Seff',
    voiceProfile: 'seff',
    species: 'human',
    role: 'family_member',
  }),
  [CHARACTER_IDS.SHUBENATOR]: character({
    id: CHARACTER_IDS.SHUBENATOR,
    canonicalName: 'The Shubenator',
    subtitleName: 'The Shubenator',
    voiceProfile: 'shubenator',
    species: 'human',
    role: 'family_member',
    legacyAliases: ['shubes'],
  }),
  /* No voice id yet — the sheet row is blank. His profile name is staged so
   * the id can be pasted into the manifest's `voices` block and nothing else
   * has to move; until then his lines are subtitles only. */
  [CHARACTER_IDS.NUMBSKULL]: character({
    id: CHARACTER_IDS.NUMBSKULL,
    canonicalName: 'Numbskull',
    subtitleName: 'Numbskull',
    voiceProfile: 'numbskull',
    species: 'human',
    role: 'family_member',
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

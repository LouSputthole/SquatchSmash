/**
 * Scene appearance adapter for the Special Meeting and Initiation.
 *
 * These are scene clothes, not new canonical bodies. The caller supplies the
 * established model (height, build, face, hair, skin, gender/body shape and
 * personal jewellery); this adapter changes only garment presentation into a
 * restrained, well-fitted suit. The ordinary Bing, Mansion and every other
 * scene therefore keep the same character in the clothes they already own.
 */

export const FORMAL_MEETING_STYLES = Object.freeze([
  Object.freeze({ jacket: 0x20242b, shirt: 0xe5e1d8, tie: 0x5b1f29 }),
  Object.freeze({ jacket: 0x292a31, shirt: 0xe9e4da, tie: 0x233d5c }),
  Object.freeze({ jacket: 0x242b2a, shirt: 0xe1dfd5, tie: 0x54352b }),
  Object.freeze({ jacket: 0x302a2b, shirt: 0xe7e0d5, tie: 0x263b34 }),
  Object.freeze({ jacket: 0x252633, shirt: 0xe3ded5, tie: 0x6a4930 }),
  Object.freeze({ jacket: 0x2e3030, shirt: 0xe8e3d8, tie: 0x4b284c }),
]);

const GARMENT_FIELDS = Object.freeze([
  'dress', 'shirt', 'shirtAccent', 'jacketColour', 'tieColour', 'pocketSquare',
  'trim', 'belt', 'trouserFit', 'trouserColour', 'luxury', 'neckline',
  'bowtie', 'bowtieColour', 'tuxedo', 'barefoot', 'hat', 'hatColour',
  'pinstripe', 'threePiece', 'waistcoatColour', 'patches', 'workVest',
  'workVestColour', 'pattern', 'argyle', 'knickers', 'shoeStyle',
  'gownStrapWidth',
]);

function stableStyleIndex(characterId) {
  const id = String(characterId ?? 'formal-guest');
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % FORMAL_MEETING_STYLES.length;
}
/** The deterministic tailoring colourway assigned to one stable identity. */
export function formalMeetingStyle(characterId) {
  return FORMAL_MEETING_STYLES[stableStyleIndex(characterId)];
}

/**
 * Dress an existing canonical body for this one formal night.
 *
 * The result is frozen because scene variants are appearance data, not a bag
 * a runtime is expected to mutate. `face` can still be added by a casting
 * layer with a final spread, exactly as the Bing does for ordinary clothes.
 */
export function formalMeetingModel(characterId, baseModel, {
  style = formalMeetingStyle(characterId),
} = {}) {
  if (!baseModel || typeof baseModel !== 'object') {
    throw new TypeError(`formalMeetingModel(${characterId}) requires a canonical base model`);
  }
  const identity = { ...baseModel };
  for (const field of GARMENT_FIELDS) delete identity[field];

  return Object.freeze({
    ...identity,
    dress: 'suit',
    shirt: style.jacket,
    jacketColour: style.jacket,
    shirtAccent: style.shirt,
    tieColour: style.tie,
    trim: true,
    belt: baseModel.belt || 'leather',
    trouserFit: 'creased',
    trouserColour: style.jacket,
    pocketSquare: false,
    luxury: false,
    neckline: false,
    bowtie: false,
    tuxedo: false,
    barefoot: false,
    hat: false,
    pinstripe: false,
    threePiece: false,
    patches: false,
    workVest: false,
    pattern: false,
    argyle: null,
    knickers: false,
    shoeStyle: 'plain',
  });
}

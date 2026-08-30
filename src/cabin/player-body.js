import { makePerson } from '../bing/cast.js';
import { DEFAULT_PLAYER_OUTFIT } from '../core/first-person-body.js';

export const CABIN_WORK_OUTFIT = 'cabin_workshirt';
export const LATE_NIGHT_OUTFIT = 'late-night_track_jacket';

const TONY_BASE = Object.freeze({
  height: 1.80,
  build: 1.03,
  gut: 0.08,
  skin: 0xc9936d,
  hair: 'short',
  hairColour: 0x261b16,
  bandana: false,
  castShadow: false,
});

/** Stable cross-scene appearance IDs; all colours are authored, never random. */
export const CABIN_PLAYER_OUTFITS = Object.freeze({
  black_henley: Object.freeze({
    ...TONY_BASE,
    dress: 'shirt',
    shirt: 0x17191d,
    trouserColour: 0x20242b,
    trim: true,
    tie: false,
    neckline: 'open',
  }),
  grey_henley: Object.freeze({
    ...TONY_BASE,
    dress: 'shirt',
    shirt: 0x6d7278,
    trouserColour: 0x20242b,
    trim: true,
    tie: false,
    neckline: 'open',
  }),
  good_shirt: Object.freeze({
    ...TONY_BASE,
    dress: 'shirt',
    shirt: 0x323b4b,
    trouserColour: 0x181b21,
    trim: true,
    tie: false,
    neckline: 'open',
  }),
  [DEFAULT_PLAYER_OUTFIT]: Object.freeze({
    ...TONY_BASE,
    dress: 'suit',
    jacketColour: 0x292d35,
    shirtAccent: 0xe4d8c2,
    trouserColour: 0x171a20,
    trim: true,
    belt: 'leather',
    tie: true,
    tieColour: 0x49354e,
    pocketSquare: false,
  }),
  cream_cashmere: Object.freeze({
    ...TONY_BASE,
    dress: 'shirt',
    shirt: 0xd8cdb7,
    trouserColour: 0x393a3f,
    trim: false,
    tie: false,
    neckline: 'open',
  }),
  [CABIN_WORK_OUTFIT]: Object.freeze({
    ...TONY_BASE,
    dress: 'shirt',
    shirt: 0x4b5143,
    trouserColour: 0x27303a,
    tie: false,
    trim: true,
    belt: 'leather',
    neckline: 'open',
  }),
  [LATE_NIGHT_OUTFIT]: Object.freeze({
    ...TONY_BASE,
    dress: 'tracksuit',
    shirt: 0x252d3d,
    jacketColour: 0x252d3d,
    trouserColour: 0x171c27,
    trim: true,
    tie: false,
  }),
});

/** Canonicalize persisted metadata before handing it to FirstPersonBody. */
export function knownCabinPlayerOutfitId(outfitId) {
  return Object.hasOwn(CABIN_PLAYER_OUTFITS, outfitId)
    ? outfitId : DEFAULT_PLAYER_OUTFIT;
}

export function resolveCabinPlayerOutfit(outfitId) {
  const id = knownCabinPlayerOutfitId(outfitId);
  return Object.freeze({ id, config: CABIN_PLAYER_OUTFITS[id] });
}

export function makeCabinPlayerFigure(outfitId) {
  const resolved = resolveCabinPlayerOutfit(outfitId);
  const figure = makePerson(resolved.config);
  figure.group.name = 'cabin-player-reflection-body';
  figure.group.userData.resolvedOutfitId = resolved.id;
  return figure;
}

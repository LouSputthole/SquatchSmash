/**
 * THE PROSPECT, in the mirror.
 *
 * One canonical Tony for every scene that reflects him — the same rule
 * `wardrobe.js` applies to the named cast, arrived at the same way: the
 * apartment and the cabin each typed this table locally and agreed by
 * discipline; the luxury apartment built him from the old story-scene box
 * rig instead, and its brand-new vanity mirror showed a different, cruder
 * man than every other glass in the game. Owner, 2026-09-01: "In luxury
 * apartment, mirror kind sucks still" — the mirror was fixed the day
 * before; the body it reflected was the remaining problem.
 *
 * A scene maps its stable outfit id onto this table and adds only what is
 * local to it (a group name, a spawn). Colours are authored, never random,
 * so the same id is the same clothes on every page.
 *
 * If `assets/faces/prospect.png` ever lands (listed in the faces index),
 * `withProspectFace` upgrades the head to the photo-skull technique that
 * makes Big Uncle Lou look like himself. Until then the procedural face
 * stands, and nothing 404s looking for it.
 */
import { makePerson } from '../bing/cast.js';
import { loadJson } from './assets.js';
import { DEFAULT_PLAYER_OUTFIT } from './first-person-body.js';

export const PROSPECT_BASE = Object.freeze({
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
export const PROSPECT_OUTFITS = Object.freeze({
  black_henley: Object.freeze({
    ...PROSPECT_BASE,
    dress: 'shirt',
    shirt: 0x17191d,
    trouserColour: 0x20242b,
    trim: true,
    tie: false,
    neckline: 'open',
  }),
  grey_henley: Object.freeze({
    ...PROSPECT_BASE,
    dress: 'shirt',
    shirt: 0x6d7278,
    trouserColour: 0x20242b,
    trim: true,
    tie: false,
    neckline: 'open',
  }),
  good_shirt: Object.freeze({
    ...PROSPECT_BASE,
    dress: 'shirt',
    shirt: 0x323b4b,
    trouserColour: 0x181b21,
    trim: true,
    tie: false,
    neckline: 'open',
  }),
  [DEFAULT_PLAYER_OUTFIT]: Object.freeze({
    ...PROSPECT_BASE,
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
    ...PROSPECT_BASE,
    dress: 'shirt',
    shirt: 0xd8cdb7,
    trouserColour: 0x393a3f,
    trim: false,
    tie: false,
    neckline: 'open',
  }),
  cabin_workshirt: Object.freeze({
    ...PROSPECT_BASE,
    dress: 'shirt',
    shirt: 0x4b5143,
    trouserColour: 0x27303a,
    tie: false,
    trim: true,
    belt: 'leather',
    neckline: 'open',
  }),
  'late-night_track_jacket': Object.freeze({
    ...PROSPECT_BASE,
    dress: 'tracksuit',
    shirt: 0x252d3d,
    jacketColour: 0x252d3d,
    trouserColour: 0x171c27,
    trim: true,
    tie: false,
  }),
});

/** Canonicalize persisted metadata before handing it to FirstPersonBody. */
export function knownProspectOutfitId(outfitId) {
  return Object.hasOwn(PROSPECT_OUTFITS, outfitId)
    ? outfitId : DEFAULT_PLAYER_OUTFIT;
}

export function resolveProspectOutfit(outfitId) {
  const id = knownProspectOutfitId(outfitId);
  return Object.freeze({ id, config: PROSPECT_OUTFITS[id] });
}

/* The owner's photo face, adopted the moment the asset exists. The index is
 * fetched once per page (scenes never probe PNGs directly — a probe for a
 * photo that has not landed yet is a 404 in every console). */
const PROSPECT_FACE_URL = 'assets/faces/prospect.png';
let prospectFacePromise = null;
let resolvedProspectFace = null;

export function prospectFaceUrl() {
  prospectFacePromise ??= loadJson('assets/faces/', 'index.json')
    .then((index) => {
      resolvedProspectFace = index?.files?.includes?.('prospect.png') ? PROSPECT_FACE_URL : null;
      return resolvedProspectFace;
    })
    .catch(() => null);
  return prospectFacePromise;
}

/**
 * The reflection body. Once `prospectFaceUrl()` has resolved to a real
 * asset, every figure built afterwards wears the photo head automatically;
 * a scene only has to `refresh()` its FirstPersonBody when the promise
 * answers. `face` stays overridable for tests.
 */
export function makeProspectFigure(outfitId, { name = 'player-reflection-body', face = resolvedProspectFace } = {}) {
  const resolved = resolveProspectOutfit(outfitId);
  const figure = makePerson(face ? { ...resolved.config, face } : resolved.config);
  figure.group.name = name;
  figure.group.userData.resolvedOutfitId = resolved.id;
  return figure;
}

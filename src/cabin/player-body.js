/**
 * The cabin's reflection body is the canonical Prospect. The outfit table
 * lived here first; it moved to `src/core/prospect-body.js` the night the
 * luxury apartment was caught reflecting a different, cruder Tony than
 * every other mirror (owner, 2026-09-01). This module keeps the cabin's
 * names so its callers and tests read the same as always.
 */
import {
  PROSPECT_OUTFITS,
  knownProspectOutfitId,
  makeProspectFigure,
  resolveProspectOutfit,
} from '../core/prospect-body.js';

export const CABIN_WORK_OUTFIT = 'cabin_workshirt';
export const LATE_NIGHT_OUTFIT = 'late-night_track_jacket';

/** Stable cross-scene appearance IDs; all colours are authored, never random. */
export const CABIN_PLAYER_OUTFITS = PROSPECT_OUTFITS;

/** Canonicalize persisted metadata before handing it to FirstPersonBody. */
export function knownCabinPlayerOutfitId(outfitId) {
  return knownProspectOutfitId(outfitId);
}

export function resolveCabinPlayerOutfit(outfitId) {
  return resolveProspectOutfit(outfitId);
}

export function makeCabinPlayerFigure(outfitId) {
  return makeProspectFigure(outfitId, { name: 'cabin-player-reflection-body' });
}

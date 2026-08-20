import { isPreviewMode } from '../core/preview-mode.js';

/** Public preview waypoint vocabulary. Keep this aligned with preview.html. */
export const GOLF_CHECKPOINTS = Object.freeze({
  hole1: 1,
  hole2: 2,
  hole3: 3,
  grille: 'grille',
});

export const GOLF_CHECKPOINT_LABELS = Object.freeze({
  hole1: 'HOLE 1 · THE INVITATION',
  hole2: 'HOLE 2 · THE LONG WALK',
  hole3: 'HOLE 3 · THE BIG NIGHT',
  grille: 'THE GRILLE · ROUND COMPLETE',
});

/**
 * Plausible completed-hole cards for waypoints that skip played holes.
 * These are the same values used by campaign preview seeding.
 */
export const GOLF_PREVIEW_HOLE_CARDS = Object.freeze({
  1: Object.freeze({ hole: 1, par: 3, strokes: 4, penalties: 0 }),
  2: Object.freeze({ hole: 2, par: 5, strokes: 5, penalties: 0 }),
  3: Object.freeze({ hole: 3, par: 4, strokes: 5, penalties: 0 }),
});

export function previewCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && Object.hasOwn(GOLF_CHECKPOINTS, value) ? value : null;
}

/**
 * Pure geometry/campaign plan for a public preview waypoint.
 *
 * The completed grille is shown over Hole 3: that is the only built state
 * containing the grille balcony and its five waiting figures. Keeping this
 * decision here lets the browser and headless adapter share one vocabulary
 * without importing the browser boot.
 */
export function golfPreviewStage(checkpoint) {
  if (!Object.hasOwn(GOLF_CHECKPOINTS, checkpoint)) {
    throw new Error(`Unknown Golf preview checkpoint: ${checkpoint}`);
  }
  const target = GOLF_CHECKPOINTS[checkpoint];
  const completedThrough = target === 'grille' ? 3 : target - 1;
  return Object.freeze({
    checkpoint,
    hole: target === 'grille' ? 3 : target,
    completedThrough,
    grille: target === 'grille',
  });
}

export function golfPreviewCompletedCards(checkpoint) {
  const { completedThrough } = golfPreviewStage(checkpoint);
  return Object.freeze(Array.from(
    { length: completedThrough },
    (_, index) => GOLF_PREVIEW_HOLE_CARDS[index + 1],
  ));
}

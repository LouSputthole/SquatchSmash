import { isPreviewMode } from '../core/preview-mode.js';
import { surfaceAt } from './field.js';

/**
 * Give the shared first-person controller the course's real footstep seam.
 *
 * Player's floor-zone fallback is intentionally apartment-shaped (`wood`).
 * Silver Pines has continuous terrain instead, so every emitted step resolves
 * the current point through the same surface map used by lies and ball physics.
 */
export function connectGolfFootsteps(
  player,
  courseAudio = () => null,
  surfaceAtPoint = surfaceAt,
) {
  if (!player) return false;
  const audioForStep = typeof courseAudio === 'function'
    ? courseAudio
    : () => courseAudio;
  player.onFootstep = (_fallbackSurface, intensity = 1) => {
    const point = player.position;
    if (!point) return;
    audioForStep()?.footstep(
      surfaceAtPoint(point.x, point.z),
      intensity,
      { x: point.x, y: point.y, z: point.z },
    );
  };
  return true;
}

/** A completed canonical round returns home; only disposable preview saves replay. */
export function completedRoundAction(locationLike = globalThis.location) {
  return isPreviewMode(locationLike) ? 'replay' : 'return_home';
}

/** Keep the picked-up bag out of both live and restored later-hole geometry. */
export function collectGolfBagGeometry(bag) {
  if (!bag?.isObject3D) throw new TypeError('Silver Pines bag geometry is required');
  bag.visible = false;
  return bag;
}

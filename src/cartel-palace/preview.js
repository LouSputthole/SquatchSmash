import { isPreviewMode } from '../core/preview-mode.js';
import { EVIDENCE_IDS } from './mission.js';

export const PALACE_PREVIEW_CHECKPOINTS = Object.freeze([
  'approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear',
]);

export function previewPalaceCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  const path = String(locationLike?.pathname || '').toLowerCase();
  if (!(path.endsWith('/cartel-palace.html') || path.endsWith('cartel-palace.html'))) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return 'approach'; }
  const value = params.get('checkpoint');
  return PALACE_PREVIEW_CHECKPOINTS.includes(value) ? value : 'approach';
}

export function previewSnapshotForCheckpoint(checkpoint) {
  const id = PALACE_PREVIEW_CHECKPOINTS.includes(checkpoint) ? checkpoint : 'approach';
  const reachedEvidence = ['betrayal', 'dining_room', 'clear'].includes(id);
  return {
    status: 'in_progress',
    checkpoint: id,
    powerCut: id !== 'approach',
    evidenceFound: reachedEvidence ? Object.values(EVIDENCE_IDS) : [],
    sauceBetrayalConfirmed: reachedEvidence,
    markEliminated: id === 'clear',
    sauceEliminated: id === 'clear',
    outcome: id === 'clear' ? 'clean' : null,
  };
}

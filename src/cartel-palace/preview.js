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

/** Stage Palace geometry without campaign, UI, audio or combat-system side effects. */
export function stagePalaceCheckpointGeometry(checkpoint, { palace, cast } = {}) {
  if (!PALACE_PREVIEW_CHECKPOINTS.includes(checkpoint)) {
    throw new Error(`Unknown Cartel Palace geometry checkpoint: ${checkpoint}`);
  }
  if (!palace?.doors || !cast?.markDown || !Array.isArray(cast.all)) {
    throw new Error('Cartel Palace checkpoint geometry requires the complete world and cast');
  }
  const snapshot = previewSnapshotForCheckpoint(checkpoint);
  if (checkpoint !== 'approach') palace.doors.openServiceGate();
  if (['estate', 'betrayal', 'dining_room', 'clear'].includes(checkpoint)) {
    palace.doors.openEstateDoor();
  }
  if (['dining_room', 'clear'].includes(checkpoint)) palace.doors.openDiningRoom();
  if (snapshot.markEliminated) {
    cast.mark.actor.health = 0;
    cast.mark.actor.incapacitated = true;
    cast.markDown(cast.mark);
  }
  if (snapshot.sauceEliminated) {
    cast.sauce.actor.health = 0;
    cast.sauce.actor.incapacitated = true;
    cast.markDown(cast.sauce);
  }
  return {
    checkpoint,
    powerCut: snapshot.powerCut,
    serviceGateOpen: checkpoint !== 'approach',
    estateDoorOpen: ['estate', 'betrayal', 'dining_room', 'clear'].includes(checkpoint),
    diningRoomOpen: ['dining_room', 'clear'].includes(checkpoint),
    markDown: cast.mark.down === true,
    sauceDown: cast.sauce.down === true,
  };
}

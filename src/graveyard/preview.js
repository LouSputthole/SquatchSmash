import { isPreviewMode } from '../core/preview-mode.js';

export const GRAVEYARD_PREVIEW_CHECKPOINTS = Object.freeze([
  'arrival',
  'carried',
  'placed',
  'buried',
]);

export const GRAVEYARD_PREVIEW_CHECKPOINT_LABELS = Object.freeze({
  arrival: 'OPEN TRUNK',
  carried: 'CARRY HOTDOG',
  placed: 'BODY IN GRAVE',
  buried: 'BURIAL COMPLETE',
});

const BODY_PHASE = Object.freeze({
  arrival: 'trunk',
  carried: 'carrying',
  placed: 'placed',
  buried: 'buried',
});

const PLAYER_POSE = Object.freeze({
  arrival: Object.freeze({ x: 4.5, y: 1.66, z: 21.5, yaw: 0.34, pitch: -0.1 }),
  carried: Object.freeze({ x: 0, y: 1.66, z: -12.8, yaw: 0, pitch: -0.12 }),
  placed: Object.freeze({ x: 2.8, y: 1.66, z: -14.4, yaw: 0.55, pitch: -0.16 }),
  buried: Object.freeze({ x: 2.8, y: 1.66, z: -14.4, yaw: 0.55, pitch: -0.16 }),
});

function searchParams(locationLike) {
  return new URLSearchParams(String(locationLike?.search ?? ''));
}

export function previewGraveyardCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  const pathname = String(locationLike?.pathname || '').toLowerCase();
  if (!(pathname.endsWith('/graveyard.html') || pathname.endsWith('graveyard.html'))) return null;
  const value = searchParams(locationLike).get('checkpoint');
  return GRAVEYARD_PREVIEW_CHECKPOINTS.includes(value) ? value : 'arrival';
}

/**
 * Deterministically stage the body and mission evidence for a public preview.
 * All mutation is confined to the collaborators supplied by the caller; no
 * campaign save, browser global, timer, audio or interaction registration is
 * touched here.
 */
export function stageGraveyardCheckpointGeometry(checkpoint, context = {}) {
  if (!GRAVEYARD_PREVIEW_CHECKPOINTS.includes(checkpoint)) {
    throw new RangeError(`Unknown Graveyard geometry checkpoint: ${checkpoint}`);
  }
  const { graveyard, mission, carryAnchor, player = null } = context;
  if (!graveyard || typeof graveyard.stageBodyPhase !== 'function') {
    throw new TypeError('Graveyard geometry staging requires the built graveyard world');
  }
  if (mission && typeof mission.restoreBodyCheckpoint !== 'function') {
    throw new TypeError('Graveyard geometry staging received an incompatible mission');
  }
  if (checkpoint === 'carried' && !carryAnchor) {
    throw new TypeError('The carried Graveyard checkpoint requires a carry anchor');
  }

  const pose = PLAYER_POSE[checkpoint];
  if (player?.position?.set) {
    player.position.set(pose.x, pose.y, pose.z);
    player.yaw = pose.yaw;
    player.pitch = pose.pitch;
    player.ground = 0;
    player.velocity?.set?.(0, 0, 0);
    player.clearKeys?.();
  }
  graveyard.stageBodyPhase(BODY_PHASE[checkpoint], { carryAnchor });
  mission?.restoreBodyCheckpoint(checkpoint);
  graveyard.root.updateMatrixWorld?.(true);

  return Object.freeze({
    checkpoint,
    bodyPhase: BODY_PHASE[checkpoint],
    body: Object.freeze(graveyard.bodyPresentation()),
    missionState: mission?.state ?? checkpoint,
    playerPose: Object.freeze({ ...pose }),
  });
}

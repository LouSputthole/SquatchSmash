import { crewHeadingForPhase, setCrewMasked } from './cast.js';
import { HEIST_PREVIEW_CHECKPOINTS } from './config.js';

export { HEIST_PREVIEW_CHECKPOINTS };

export const HEIST_SQUAD_FORMATIONS = Object.freeze({
  safehouse: Object.freeze([[-3.4, -1.2], [-1.7, -2.4], [0, -2.6], [1.8, -2.3], [3.5, -1.1]]),
  van: Object.freeze([[-1.15, 1.45], [1.15, 1.2], [-1.15, -0.2], [1.15, -0.55], [-1.15, -1.75]]),
  bank: Object.freeze([[-6.8, 6.4], [8.6, 6.0], [-8.8, -0.6], [8.8, -1.2], [4.2, 9.4]]),
  street: Object.freeze([[-2.5, 25], [6.6, 22], [-7, 18], [2.5, 17], [-6.8, 28]]),
  garage: Object.freeze([[-6.5, 7], [6.5, 6], [-7, 0], [7, -1], [-6.5, -6]]),
  driving: Object.freeze([[16, -649], [18, -651], [20, -653], [22, -651], [24, -649]]),
});

const CHECKPOINT_GEOMETRY = Object.freeze({
  safehouse: Object.freeze({ phase: 'safehouse', masked: false, prepared: false, vaultOpen: false }),
  bank_lobby: Object.freeze({ phase: 'bank', masked: true, prepared: true, vaultOpen: false }),
  vault_open: Object.freeze({ phase: 'bank', masked: true, prepared: true, vaultOpen: true }),
  street_withdrawal: Object.freeze({ phase: 'street', masked: true, prepared: true, vaultOpen: true }),
  mercer_garage: Object.freeze({ phase: 'garage', masked: true, prepared: true, vaultOpen: true }),
  vehicle_escape: Object.freeze({ phase: 'driving', masked: true, prepared: true, vaultOpen: true }),
  safehouse_debrief: Object.freeze({ phase: 'safehouse', masked: true, prepared: true, vaultOpen: true }),
});

export function heistCheckpointGeometry(checkpoint) {
  const geometry = CHECKPOINT_GEOMETRY[checkpoint];
  if (!geometry) throw new Error(`Unknown Heist geometry checkpoint: ${checkpoint}`);
  return geometry;
}

export function heistSquadAnchorIds() {
  return Object.entries(HEIST_SQUAD_FORMATIONS).flatMap(([phase, positions]) => (
    positions.map((_, index) => `${phase}_${index}`)
  ));
}

export function heistSquadAnchorPosition(anchorId) {
  const match = /^([a-z]+)_(\d+)$/.exec(anchorId);
  if (!match) throw new Error(`Unknown Heist squad anchor: ${anchorId}`);
  const positions = HEIST_SQUAD_FORMATIONS[match[1]];
  const position = positions?.[Number(match[2])];
  if (!position) throw new Error(`Unknown Heist squad anchor: ${anchorId}`);
  return position;
}

/**
 * Put the complete crew into one authored phase formation.
 *
 * Runtime passes an anchor assignment callback backed by SquadDirector. The
 * headless Adapter uses the deterministic index fallback. Both cross this same
 * geometry seam, so tests cannot quietly prove a pose the browser never uses.
 */
export function poseHeistCrewGeometry({ level, crew, phase, assignAnchor = null } = {}) {
  const phaseRoot = level?.phases?.[phase]?.group;
  const positions = HEIST_SQUAD_FORMATIONS[phase];
  if (!phaseRoot || !positions || !(crew instanceof Map)) {
    throw new Error('Heist crew geometry requires a complete level, crew Map, and phase');
  }
  if (crew.size !== positions.length) {
    throw new Error(`Heist ${phase} formation expects ${positions.length} crew, got ${crew.size}`);
  }

  const anchors = {};
  for (const [index, actor] of [...crew.values()].entries()) {
    phaseRoot.add(actor.group);
    const fallbackAnchor = `${phase}_${index}`;
    const anchor = assignAnchor?.(actor, phase, fallbackAnchor) ?? fallbackAnchor;
    const [x, z] = heistSquadAnchorPosition(anchor);
    actor.anchor = anchor;
    actor.group.position.set(x, 0, z);
    actor.heading = crewHeadingForPhase(phase, { x, z });
    actor.group.rotation.y = actor.heading;
    anchors[actor.id] = anchor;
  }
  return Object.freeze(anchors);
}

function stagePreparedSafehouse(level, prepared) {
  const safehouse = level.phases.safehouse.interactables;
  safehouse.armor.userData.setEquipped?.(prepared);
  safehouse.loadout.userData.setEquipped?.(prepared);
}

function stageDrivingStart(level) {
  const driving = level.phases.driving;
  const { x, z, heading = 0 } = driving.start;
  driving.car.position.set(x, 0, z);
  driving.car.rotation.set(0, heading - Math.PI / 2, 0);
  for (const [index, cruiser] of driving.pursuers.entries()) {
    cruiser.visible = index === 0;
    cruiser.position.set(x, 0, z - 16 - index * 9);
  }
}

/** Apply visible setpiece state without booting mission systems. */
export function applyHeistCheckpointSetpieceGeometry(checkpoint, { level, crew } = {}) {
  if (!level?.phases || !(crew instanceof Map)) {
    throw new Error('Heist checkpoint setpieces require the complete level and crew');
  }
  const geometry = heistCheckpointGeometry(checkpoint);
  setCrewMasked(crew, geometry.masked);
  stagePreparedSafehouse(level, geometry.prepared);
  level.phases.bank.interactables.vault.userData.setOpen?.(geometry.vaultOpen);
  if (checkpoint === 'vehicle_escape') stageDrivingStart(level);
  return geometry;
}

/** Stage every visible, deterministic geometry consequence of a public preview checkpoint. */
export function stageHeistCheckpointGeometry(checkpoint, { level, crew } = {}) {
  if (!level?.activate || !(crew instanceof Map)) {
    throw new Error('Heist checkpoint geometry requires the complete level and crew');
  }
  const geometry = heistCheckpointGeometry(checkpoint);
  const active = level.activate(geometry.phase);
  if (!active) throw new Error(`Heist checkpoint geometry is missing phase ${geometry.phase}`);
  const anchors = poseHeistCrewGeometry({ level, crew, phase: geometry.phase });
  applyHeistCheckpointSetpieceGeometry(checkpoint, { level, crew });
  return Object.freeze({ checkpoint, phase: geometry.phase, anchors });
}

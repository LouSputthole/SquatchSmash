import { crewHeadingForPhase, setCrewMasked } from './cast.js';
import { HEIST_PREVIEW_CHECKPOINTS } from './config.js';
import { VAN_SEAT_HEIGHT } from './level.js';
import { publishHeistFramingBeats } from './shots.js';

export { HEIST_PREVIEW_CHECKPOINTS };

export const HEIST_SQUAD_FORMATIONS = Object.freeze({
  safehouse: Object.freeze([[-3.4, -1.2], [-1.7, -2.4], [0, -2.6], [1.8, -2.3], [3.5, -1.1]]),
  /* On the benches, not beside them. x 1.42 puts the hips over the cushion
   * (which spans 0.94 to 1.66) with the shoulders against the seat back, and
   * the knees and boots land on the aisle floor in front. */
  van: Object.freeze([[-1.42, 1.6], [1.42, 1.0], [-1.42, 0], [1.42, -0.8], [-1.42, -1.6]]),
  bank: Object.freeze([[-6.8, 6.4], [8.6, 6.0], [-8.8, -0.6], [8.8, -1.2], [4.2, 9.4]]),
  street: Object.freeze([[-2.5, 25], [6.6, 22], [-7, 18], [2.5, 17], [-6.8, 28]]),
  garage: Object.freeze([[-6.5, 7], [6.5, 6], [-7, 0], [7, -1], [-6.5, -6]]),
  driving: Object.freeze([[16, -649], [18, -651], [20, -653], [22, -651], [24, -649]]),
});

/** How far back each seat sits. Five men in a van do not share a posture. */
const VAN_SLOUCH = Object.freeze([0.1, 0.5, 0.3, 0.62, 0]);

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
    /* THE POSE IS PART OF THE FORMATION. It has to be, because this seam is
     * the only place both the browser and the headless adapter go through —
     * putting the sit in `main.js` would mean the scale gate and the geometry
     * gate keep measuring five standing men in a van nobody stands up in.
     *
     * The slouch is per SEAT rather than per person, so the same crew member
     * sits the same way every ride and no two men beside each other sit
     * identically. Anywhere else it is `stand()`, which also puts a man who
     * has just got out of the van back on his feet. */
    if (phase === 'van') {
      actor.figure?.seated?.({
        slouch: VAN_SLOUCH[index % VAN_SLOUCH.length],
        seatY: VAN_SEAT_HEIGHT,
      });
      actor.figure?.setIdleLook?.({ seed: index + 1, range: 0.68, hold: [0.9, 2.8] });
    } else {
      /* Back on his feet with the gun where he carries it -- `lowReady` when
       * the figure was armed by `armCrewMember`, `stand` for anyone else. */
      if (actor.figure?.pose === 'seated') {
        if (actor.group.userData.weapon && actor.figure.lowReady) actor.figure.lowReady();
        else actor.figure.stand();
      }
      actor.figure?.setIdleLook?.(null);
    }
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
  /* AND THE SHOT LIST, LAST, BECAUSE IT READS THE STAGING IT DESCRIBES.
   *
   * `src/heist/shots.js` says why the beats exist; this is why they are
   * published HERE rather than in `buildHeistLevel`. A mark that names a
   * subject plants its look point at that subject's own range, and the guard,
   * the van doors and the escape car are only where they are going to be once
   * the phase is active, the crew are on their anchors and the setpieces have
   * been applied. Published at build time, half the shot list would be aimed
   * at a vault door that had not been opened yet.
   *
   * This is also the one seam both the browser and the headless adapter cross
   * -- the same argument the crew pose above makes for itself -- so the beats
   * the framing gate reads are the beats the played mission has. */
  publishHeistFramingBeats(geometry.phase, active.group, { spawn: active.spawn ?? null });
  return Object.freeze({ checkpoint, phase: geometry.phase, anchors });
}

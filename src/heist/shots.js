/**
 * THE TAKE — the camera marks, and what each of them claims to be looking at.
 *
 * ## Why this file exists at all
 *
 * `docs/FRAMING-GATE.md` is blunt about the hole it was built over: the
 * arithmetic that proves a camera is pointed at the man who is talking has
 * been finished and under test for days, and **nothing in the game publishes a
 * shot list for it to read**, so it has been measuring nothing. This is THE
 * TAKE opting in. The Special Meeting's `src/specialmeeting/shots.js` is the
 * same move on the other camera-driven scene.
 *
 * The marks below are not new. They were the `poses` table inside
 * `debugPoseForEvidence` in `main.js` — the deterministic camera positions the
 * browser evidence capture drives (`tools/verify-heist.mjs` asks for
 * `safehouse_van`, `garage_transfer` and `vehicle_swap_workbench` by name) —
 * plus the spawn each phase drops the player on. They have moved here whole,
 * name for name and number for number, so that the shot the screenshot tool
 * takes and the shot the framing gate measures are the same shot. Two copies
 * of a camera position drift the moment one of them is nudged, and then the
 * evidence and the gate disagree about a scene that only has one camera.
 *
 * ## What a beat here can honestly claim, and what it cannot
 *
 * THE TAKE is first person. The camera is the player's own eye and he may
 * point it anywhere he likes, so a beat here is never *"the shot holds on this
 * man"* — it is *"this is where the scene stood him and which way it turned
 * him, and here is what was in front of him when it did"*. Three consequences,
 * and they are the whole authoring rule:
 *
 *   - **`speaker`, not `subject`, for a person.** `framePlacement` normalises
 *     the aim direction, so the frustum and occlusion answers do not depend on
 *     how far down the ray `lookAt` is planted. That makes "is the man in the
 *     shot" a fair question about a camera the player owns. "Is the aim within
 *     a metre of his nose" is not, and `CAMERA_AIM_MISS` is therefore only
 *     asked where the scene really is pointing at one fixed thing.
 *   - **A ranged `lookAt` where there IS a fixed thing.** `aimedAt()` plants
 *     the look point at the SUBJECT's own range along the authored ray. The
 *     direction stays the mark's own yaw and pitch; only the distance comes
 *     off the build. So a prop that slides sideways out of the shot fails, and
 *     one that is simply further away than it used to be does not — which is
 *     correct, because a shot aimed at a man who steps back is still aimed at
 *     him.
 *   - **Nobody is named who the script deliberately puts out of frame.** Half
 *     the crew bark tactical lines from across a lobby on purpose. Naming them
 *     would fill the report with the scene working exactly as written.
 *
 * The rest of the marks carry no speaker and no subject, and that is not
 * padding: a camera position inside a solid is a shot of the inside of a wall,
 * and `CAMERA_INSIDE_SOLID` is the one question every authored camera in the
 * game can be asked without anybody writing another line of data.
 */
import * as THREE from 'three';

/**
 * The lens `main.js` builds. Not the house 66: this scene's
 * `PerspectiveCamera` is 72, and a beat that lets the gate assume otherwise is
 * a beat measuring a lens the player never looks through.
 */
export const HEIST_FOV_DEG = 72;

/** The player's eye, in metres. Every spawn in `level.js` is authored at it. */
export const HEIST_EYE_M = 1.66;

/**
 * The pitch `activatePhase` puts him on when a phase opens.
 *
 * Zero everywhere but the safehouse, which starts him looking slightly down at
 * a table. Restated here from `main.js` because a beat about where he is
 * pointed that ignores the pitch is a beat about a different camera.
 */
export const PHASE_SPAWN_PITCH = Object.freeze({
  safehouse: -0.12, van: 0, bank: 0, street: 0, garage: 0, driving: 0,
});

/**
 * Deterministic camera marks. Names and numbers are `main.js`'s own.
 *
 * `focus` is the browser evidence contract: the named nodes that have to
 * project inside the frame. `subjectObject` is the framing gate's half of the
 * same claim, and it is deliberately the FIRST focus node rather than all of
 * them — a beat has one subject, and the arithmetic is "is the aim on it",
 * which is a question about one point.
 */
export const HEIST_CAMERA_MARKS = Object.freeze({
  briefing: Object.freeze({ phase: 'safehouse', position: [0, 1.66, 2.55], yaw: 0, pitch: -0.28 }),
  armor: Object.freeze({ phase: 'safehouse', position: [-5.5, 1.66, 4.45], yaw: 0, pitch: -0.18 }),
  loadout: Object.freeze({ phase: 'safehouse', position: [4.7, 1.66, 4.25], yaw: 0, pitch: -0.38 }),
  safehouse_van: Object.freeze({
    phase: 'safehouse', position: [-4.6, 1.66, 0.9], yaw: -2.125, pitch: -0.05,
    focus: Object.freeze(['primary-van-rear-door-left', 'primary-van-rear-door-right', 'loading-bay-header']),
    subjectObject: 'primary-van-rear-door-right',
  }),
  /* On the guard where he stands, which moved to the door in the 2026-08-20
   * playtest pass. Derived: yaw = atan2(-dx, -dz) from this camera to him.
   *
   * THE ONE MARK IN THE SCENE THAT NAMES A MAN, and it names him twice. It is
   * the only authored camera here whose entire reason for existing is a
   * person: the guard is on screen for 2.75 seconds, he says
   * `guard_warning` — *"Stop right there"* — while he is, and the pose comment
   * above is a claim about arithmetic that nothing was checking. `speaker`
   * asks whether he is in the rectangle; `subject` asks whether the derived
   * yaw still lands on him, which is the half that goes stale the next time
   * somebody moves him. */
  bank_guard: Object.freeze({
    phase: 'bank', position: [0, 1.66, 8.5], yaw: -0.8086, pitch: -0.1661,
    speaker: 'bank-guard', subject: 'bank-guard',
  }),
  bank_lobby: Object.freeze({ phase: 'bank', position: [-0.6, 1.66, 5.6], yaw: -0.88, pitch: -0.1 }),
  bank_hostages: Object.freeze({ phase: 'bank', position: [0.2, 1.66, 5.4], yaw: 0.05, pitch: -0.08 }),
  bank_vault: Object.freeze({ phase: 'bank', position: [0, 1.66, -6.0], yaw: 0, pitch: -0.05 }),
  bank_exit: Object.freeze({ phase: 'street', position: [-4, 1.66, 28], yaw: -2.5536, pitch: 0 }),
  downtown_firefight: Object.freeze({ phase: 'street', position: [0, 1.66, 27], yaw: 0, pitch: 0 }),
  garage_transfer: Object.freeze({
    phase: 'garage', position: [-6.5, 1.66, -2], yaw: -0.826, pitch: -0.1,
    focus: Object.freeze(['escape-sedan', 'garage-transfer-zone', 'garage-tool-cart']),
    subjectObject: 'escape-sedan',
  }),
  vehicle_swap: Object.freeze({ phase: 'driving', position: [14, 1.66, -657], yaw: -2.158, pitch: 0 }),
  vehicle_swap_workbench: Object.freeze({
    phase: 'driving', position: [14.8, 1.66, -650], yaw: -0.763, pitch: -0.15,
    focus: Object.freeze(['swap-workbench', 'swap-sorting-tarp', 'swap-aid', 'swap-wipe']),
    subjectObject: 'swap-workbench',
  }),
});

/**
 * The direction the player faces at a yaw and a pitch.
 *
 * `Player`'s own convention, and it is not the obvious one: forward is
 * `(-sin yaw, ., -cos yaw)`, which is why every derived yaw in `main.js` is
 * written `Math.atan2(-dx, -dz)`. Getting the sign wrong here would point
 * every beat in this file a half turn out and report the whole mission as
 * filmed backwards, which is precisely the class of error the Special
 * Meeting's riders spent a fortnight in.
 */
export function heistLookDirection(yaw, pitch = 0) {
  const flat = Math.cos(pitch);
  return new THREE.Vector3(-Math.sin(yaw) * flat, Math.sin(pitch), -Math.cos(yaw) * flat);
}

/** A look point along the mark's own ray, `range` metres out. */
function aimedAt(position, yaw, pitch, range) {
  const direction = heistLookDirection(yaw, pitch).multiplyScalar(range);
  return [position[0] + direction.x, position[1] + direction.y, position[2] + direction.z];
}

/** How far down the ray a look point goes when nothing fixes the range. */
const FREE_LOOK_RANGE_M = 8;

function cameraFor(position, yaw, pitch, range) {
  return {
    position: [...position],
    lookAt: aimedAt(position, yaw, pitch, range),
    fovDeg: HEIST_FOV_DEG,
  };
}

/**
 * Every beat this phase publishes, cameras resolved against the built level.
 *
 * `phaseGroup` is wanted for one thing only: a mark that names a
 * `subjectObject` needs that node's range to plant its look point, and the
 * node is in the build rather than in this table. A named subject that no
 * longer resolves keeps its beat and drops the range, so the reporter reports
 * the missing node rather than this file silently dropping the shot — a prop
 * renamed out from under the camera filming it is the drift the gate is for.
 */
export function heistFramingBeats(phaseId, { phaseGroup = null, spawn = null } = {}) {
  const beats = [];

  if (spawn) {
    const pitch = PHASE_SPAWN_PITCH[phaseId] ?? 0;
    /* WHERE THE PHASE PUTS HIM, WHICH IS NOT A CAMERA ANYBODY AUTHORED AS A
     * SHOT AND IS THE MOST-SEEN FRAME IN THE MISSION ANYWAY. `activatePhase`
     * copies `phase.spawn` onto the player and sets yaw 0, so this is the
     * first thing on screen every time a phase opens, every reload and every
     * preview launch. It carries no speaker: the question worth asking of it
     * is whether the scene has stood him inside the masonry. */
    beats.push({
      id: `${phaseId}:spawn`,
      phase: phaseId,
      camera: cameraFor([spawn.x, spawn.y, spawn.z], 0, pitch, FREE_LOOK_RANGE_M),
    });
  }

  for (const [name, mark] of Object.entries(HEIST_CAMERA_MARKS)) {
    if (mark.phase !== phaseId) continue;
    /* A named subject fixes the range. A prop is found by its node name; an
     * ACTOR is found by the figure root's name, which `HeistFigure` sets to
     * the same string it marks the actor with -- the marker deliberately does
     * NOT name its node (`markActor`'s own comment: naming a previously
     * anonymous group re-buckets the geometry gate), so the two agreeing is
     * the whole reason this lookup works. The head comes off that marker's own
     * eye height, so this is not a second opinion about where a head is. */
    const named = mark.subjectObject ?? (typeof mark.subject === 'string' ? mark.subject : null);
    const node = named ? phaseGroup?.getObjectByName?.(named) : null;
    let range = FREE_LOOK_RANGE_M;
    if (node) {
      const at = node.getWorldPosition(new THREE.Vector3());
      if (named === mark.subject) at.y += node.userData?.actor?.eyeHeight ?? HEIST_EYE_M;
      range = Math.hypot(at.x - mark.position[0], at.y - mark.position[1], at.z - mark.position[2]);
    }
    beats.push({
      id: `mark:${name}`,
      phase: phaseId,
      camera: cameraFor(mark.position, mark.yaw, mark.pitch, range),
      ...(mark.speaker ? { speaker: mark.speaker } : {}),
      ...(mark.subject ? { subject: mark.subject } : {}),
      ...(mark.subjectObject ? { subjectObject: mark.subjectObject } : {}),
    });
  }

  return beats;
}

/** The node a published beat hangs on, so a re-stage replaces rather than adds. */
const SHOT_NODE_PREFIX = 'heist.shot.';

/**
 * Hang this phase's beats on the phase group, where the gate reads them.
 *
 * `userData.framingBeat` is one of the two spellings
 * `tools/verify-framing.mjs` reads, and it is the one that needs no change to
 * any adapter: the reporter traverses the roots it was handed and picks up
 * whatever the scene stamped on them. One empty `Object3D` per beat, because
 * one node can only carry one beat and the gate wants them all.
 *
 * They are invisible to everything else. `tools/geometry-collect.mjs` gathers
 * meshes with geometry on them and nothing else, so a bare `Object3D` is not a
 * record, not an assembly and not a bucket — checked by running the geometry
 * gate over this scene either side of adding them.
 */
export function publishHeistFramingBeats(phaseId, phaseGroup, { spawn = null } = {}) {
  if (!phaseGroup) throw new Error(`Heist framing beats need phase ${phaseId}'s group`);
  for (const stale of phaseGroup.children.filter((c) => c.name.startsWith(SHOT_NODE_PREFIX))) {
    phaseGroup.remove(stale);
  }
  const beats = heistFramingBeats(phaseId, { phaseGroup, spawn });
  for (const beat of beats) {
    const node = new THREE.Object3D();
    node.name = `${SHOT_NODE_PREFIX}${beat.id}`;
    node.userData.framingBeat = beat;
    phaseGroup.add(node);
  }
  return beats;
}

/**
 * The beat framing gate: pure analysis of whether the camera is actually
 * pointed at the thing the beat is about.
 *
 * THE INCIDENT THAT BOUGHT IT. Initiation Night's fifth act -- the blade, the
 * hand, the cut, the saint card, both oath lines and the burning -- played out
 * entirely off screen. The ritual shot was a pair of fixed points: the camera
 * at the table's west end, aimed at `TABLE_SOCKETS.card`, the patch of
 * tabletop the card is picked UP from. The player stands at CEREMONY_CENTRE,
 * 2.4 m short of that table, which does not merely put him off to one side of
 * the look point -- it puts him BEHIND THE CAMERA in z. So the act held a
 * steady, well-lit shot of an empty table while everything it is about
 * happened behind the lens. Nobody noticed for as long as the scene existed,
 * because the only way to notice was to play it, and the person playing it was
 * the person who had just written it.
 *
 * The fix is in src/initiation/main.js: `ritual()` follows `ritualHandWorld()`
 * now, so the offsets are relative to where the hand actually is. This is that
 * fix turned into arithmetic, so the next shot aimed at nothing fails a run
 * instead of surviving a playtest.
 *
 * THE FOUR NOTES IT ANSWERS:
 *
 *   - "the camera is looking at nothing"        -> CAMERA_AIM_MISS
 *   - "he talks and you cannot see him"         -> SPEAKER_OFF_CAMERA
 *   - "there is a wall in the way"              -> SPEAKER_OCCLUDED
 *   - "the shot starts inside the cupboard"     -> CAMERA_INSIDE_SOLID
 *
 * AIM VERSUS LOOK, which is the distinction that cost a verifier run. The
 * first draft of the Initiation check compared the SMOOTHED look point to the
 * hand and read 55 metres. The camera flies rather than cuts -- `updateCamera`
 * lerps at about 3.2 per second -- so a debug skip from the clearing to the
 * cabin starts it seventy metres out and the smoothed point is meaningless for
 * about a second afterwards. That check was measuring travel and calling it a
 * miss. So there are two findings here and not one: `CAMERA_AIM_MISS` is about
 * where the shot INTENDS to look and is always fair game, and
 * `CAMERA_LOOK_MISS` is about where the camera is actually looking and only
 * fires on a beat that has declared itself settled.
 *
 * Pure on purpose, exactly like tools/geometry-gate.mjs and
 * tools/staging-gate.mjs: numbers in, findings out, no scene graph. The
 * building lives in tools/verify-framing.mjs. A gate that can build its own
 * input is a gate that can be wrong about the input and the analysis at the
 * same time, and then it agrees with itself.
 */

/* THE DAY ARRIVED, AND THE MATHS MOVED OUT. docs/REUSE-FIRST.md rule 2 is
 * "extend, don't fork", and rule 4 is "when you do fork, say why, at the
 * fork". The slab test this gate needs already existed, correct and under
 * test, in the staging gate, so this gate imported it rather than writing a
 * second one -- and the note here said that the day a THIRD caller wanted it,
 * the right move was to lift it into a shared module and have everyone import
 * from there.
 *
 * That is what ./ray-solids.mjs is. The third caller is the staging gate
 * asking its facing question against the SHAPE the author wrote rather than
 * the square around it -- it had been answering conservatively and, on APE and
 * a parked Lincoln, wrongly. The box test, the circle test and the one
 * function that picks between them now live together, with nothing that knows
 * what a scene is; both gates import, both stay pure. */
import {
  insideSolid, rayBoxDistance, rayCylinderDistance, solidDistance,
} from './ray-solids.mjs';

/* Re-exported because this gate's own tests import them from it. */
export {
  insideSolid, rayBoxDistance, rayCylinderDistance, solidDistance,
};

/**
 * The lens the scenes actually build with.
 *
 * 66 is not a taste: it is what `buildGolf`, `buildBeefrun` and
 * `buildSquatchfather` construct their PerspectiveCameras with, with the
 * mansion at 70 and the graveyard at 68. A beat that knows its own fov says
 * so; one that does not gets the house lens rather than a guess that flatters
 * the shot.
 */
export const DEFAULT_FOV_DEG = 66;

/** 16:9, the aspect every scene's camera is built at before a resize. */
export const DEFAULT_ASPECT = 16 / 9;

/** Near and far planes, as the scenes build them. Metres. */
export const DEFAULT_NEAR_M = 0.05;
export const DEFAULT_FAR_M = 220;

/**
 * How far the shot's intended look point may sit from its named subject.
 *
 * One metre, because that is the number tools/verify-initiation.mjs already
 * asserts on for the ritual shot, and because a metre is about a head: closer
 * than that and the subject is in frame whatever else is wrong, further and
 * the shot is looking past him. The Initiation's miss was 2.4 m.
 */
export const AIM_MISS_TOLERANCE_M = 1.0;

/** The same tolerance for the smoothed look point, once a cut has landed. */
export const LOOK_MISS_TOLERANCE_M = 1.0;

/**
 * How much of the last stretch to the head is not counted as occlusion.
 *
 * A speaker standing with his back against a wall has that wall's box ending
 * within a few centimetres of his skull, and the ray reaches it just after it
 * reaches him only because of where the head height was measured. Fifteen
 * centimetres of grace stops "he is standing near a wall" reading as "there is
 * a wall in front of his face".
 */
export const OCCLUSION_SKIN_M = 0.15;

/**
 * A nanometre of slack on the frame edge.
 *
 * A head placed exactly on the edge of the lens is IN frame, and it stays in
 * frame under floating point: `tan(45°)` is 0.9999999999999999 rather than 1,
 * so a strict comparison turns a shot deliberately framed to its own edge into
 * a finding on the strength of the last bit of a double. Framing to the edge
 * is a decision. Rounding is not.
 */
const EDGE_EPSILON = 1e-9;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const round3 = (n) => Math.round(n * 1000) / 1000;
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

/** A unit vector, or null when there is no direction to be had. */
function unit(v) {
  const length = norm(v);
  if (!(length > 1e-9)) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * The camera's own three axes, from a position and a point it is looking at.
 *
 * The world up is +Y, except for a shot that looks straight up or straight
 * down -- the graveyard's camera hangs over a grave -- where up and forward
 * are parallel, the cross product collapses, and every subsequent dot product
 * is NaN. NaN compares false against everything, so without the fallback a
 * top-down shot would quietly report every head in it as off camera, which is
 * the same class of silent wrongness this gate exists to end. World +Z stands
 * in as up in that one case: the roll of a top-down shot is arbitrary anyway,
 * and all this basis is used for is deciding what is inside the rectangle.
 */
export function cameraBasis(position, lookAt, worldUp = [0, 1, 0]) {
  const forward = unit(sub(lookAt, position));
  if (!forward) return null;
  const up = Math.abs(dot(forward, worldUp)) > 0.9999 ? [0, 0, 1] : worldUp;
  /* `right` is cross(up, forward) and not the other way round: with x east,
   * y up and z north, a man facing north has east on his right, and that is
   * the product that returns +x. Getting it backwards costs nothing
   * mathematically -- the rectangle is symmetric -- and costs everything in a
   * finding, which would then send somebody looking off the wrong side of the
   * frame for a speaker who is off the other one. */
  const right = unit(cross(up, forward));
  if (!right) return null;
  return { forward, right, up: cross(forward, right) };
}

/**
 * Where a world point falls in a shot: in the rectangle, or out of which side.
 *
 * `reason` is the whole value of this over a boolean. "Off camera" sent the
 * owner back to play the scene again; "behind, 2.4 m back" is the Initiation
 * bug written out in full, and it is the difference between a finding and a
 * chore.
 */
export function framePlacement(shot, point) {
  const basis = cameraBasis(shot.position, shot.lookAt);
  if (!basis) return { inside: false, reason: 'degenerate', depthM: 0 };
  const d = sub(point, shot.position);
  const depth = dot(d, basis.forward);
  const halfV = Math.tan((shot.fovDeg * Math.PI) / 360);
  const limitY = depth * halfV;
  const limitX = limitY * shot.aspect;
  const x = dot(d, basis.right);
  const y = dot(d, basis.up);
  const placement = {
    inside: false, reason: null, depthM: depth, offsetX: x, offsetY: y, limitX, limitY,
  };
  if (depth < shot.near) return { ...placement, reason: depth < 0 ? 'behind' : 'near' };
  if (depth > shot.far) return { ...placement, reason: 'far' };
  if (y > limitY + EDGE_EPSILON) return { ...placement, reason: 'above' };
  if (y < -limitY - EDGE_EPSILON) return { ...placement, reason: 'below' };
  if (x > limitX + EDGE_EPSILON) return { ...placement, reason: 'right' };
  if (x < -limitX - EDGE_EPSILON) return { ...placement, reason: 'left' };
  return { ...placement, inside: true };
}

/** A beat's camera, with the house lens filled in where it said nothing. */
function shotOf(camera = {}) {
  return {
    position: isVec3(camera.position) ? camera.position : [0, 0, 0],
    lookAt: isVec3(camera.lookAt) ? camera.lookAt : null,
    fovDeg: Number.isFinite(camera.fovDeg) && camera.fovDeg > 0 ? camera.fovDeg : DEFAULT_FOV_DEG,
    aspect: Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : DEFAULT_ASPECT,
    near: Number.isFinite(camera.near) ? camera.near : DEFAULT_NEAR_M,
    far: Number.isFinite(camera.far) ? camera.far : DEFAULT_FAR_M,
  };
}

/**
 * The point a beat means when it names somebody.
 *
 * The head and not the feet, because the frustum question is "can I see him
 * talk". `collectActors` already computes `eye` from the rig's own eye height,
 * so this is the same number the staging gate reasons about rather than a
 * second opinion on where a head is.
 */
const headOf = (actor) => (isVec3(actor?.eye) ? actor.eye : actor?.position ?? null);

/**
 * Resolve whatever a beat put in a `speaker` or `subject` slot.
 *
 * Three spellings are allowed because three are useful: an actor id (the
 * common case -- the gate looks the body up and uses its head), a bare point
 * (the ritual's subject was a HAND, which is a node on a rig and not an actor
 * at all), or an object carrying both.
 */
function resolveTarget(value, actorsById) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const actor = actorsById.get(value);
    return actor ? { id: value, point: headOf(actor), actor } : { id: value, point: null, actor: null };
  }
  if (isVec3(value)) return { id: null, point: value, actor: null };
  const id = typeof value.id === 'string' ? value.id : null;
  const actor = id ? actorsById.get(id) ?? null : null;
  const point = isVec3(value.point) ? value.point : headOf(actor);
  return { id, point: point ?? null, actor };
}

const finding = (kind, beat, detail) => ({
  kind,
  beat: beat.id ?? null,
  phase: beat.phase ?? null,
  camera: beat.camera?.position?.map(round3) ?? null,
  ...detail,
});

/** Everything the gate can say about one scene's scripted beats. */
export function framingFindings({
  id,
  beats = [],
  actors = [],
  boxes = [],
  aimToleranceM = AIM_MISS_TOLERANCE_M,
  lookToleranceM = LOOK_MISS_TOLERANCE_M,
} = {}) {
  const findings = [];
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  const seen = new Set();
  for (const beat of beats) {
    if (beat.id != null && seen.has(beat.id)) findings.push(finding('BEAT_ID_DUPLICATE', beat, {}));
    if (beat.id != null) seen.add(beat.id);

    const shot = shotOf(beat.camera);

    /* The camera in the masonry, first, because it makes everything after it
     * meaningless: a camera inside a wall sees the inside of a wall. */
    const swallowed = boxes.find((box) => (
      box.blocks?.vision !== false && insideSolid(box, shot.position)
    ));
    if (swallowed) {
      findings.push(finding('CAMERA_INSIDE_SOLID', beat, { solid: swallowed.name ?? null }));
    }

    /* Who the beat is about. A beat that names nobody but its speaker is
     * about its speaker: the ritual is the exception rather than the rule,
     * and it is the exception because its subject was a hand. */
    const speaker = resolveTarget(beat.speaker, actorsById);
    const subject = beat.subject == null ? speaker : resolveTarget(beat.subject, actorsById);

    /* A name with no body behind it, reported once per slot. Same reason the
     * staging gate reports SEAT_MISSING rather than passing quietly: a body
     * renamed out from under the beat that films it is exactly the drift
     * these gates are for. */
    if (speaker?.id && !speaker.point) {
      findings.push(finding('BEAT_ACTOR_MISSING', beat, { field: 'speaker', actor: speaker.id }));
    }
    if (subject !== speaker && subject?.id && !subject.point) {
      findings.push(finding('BEAT_ACTOR_MISSING', beat, { field: 'subject', actor: subject.id }));
    }

    /* THE INITIATION CHECK. Where the shot says it is looking, against where
     * the thing it names actually is. */
    if (subject?.point && shot.lookAt) {
      const miss = norm(sub(shot.lookAt, subject.point));
      /* A BEAT MAY WIDEN ITS OWN TOLERANCE, and only widen it.
       *
       * One metre is right for a close-up: the ritual shot aimed 2.3 m off the
       * player's hand and that had to fail. It is wrong for a wide. The cabin's
       * `room` shot deliberately looks at the middle of the table with Lou at
       * the head of it, which measures 1.061 m off his chest -- and he is
       * plainly in frame, because SPEAKER_OFF_CAMERA does not fire on any of
       * those three beats. Making the whole gate looser to accommodate that
       * would have blinded it to the fault it was built for, so the shot that
       * knows it is wide says so, in one field, next to the shot.
       *
       * Only wider: a beat cannot tighten below the default and quietly become
       * the strictest check in the file. */
      const tolerance = Math.max(
        aimToleranceM,
        Number.isFinite(beat.aimToleranceM) && beat.aimToleranceM > 0 ? beat.aimToleranceM : 0,
      );
      if (miss > tolerance) {
        findings.push(finding('CAMERA_AIM_MISS', beat, {
          subject: subject.id,
          missM: round3(miss),
          lookAt: shot.lookAt.map(round3),
          subjectAt: subject.point.map(round3),
        }));
      }

      /* And only now the smoothed point, and only if the beat has said the cut
       * has landed. A beat that reports a look point without claiming to be
       * settled gets the benefit of the doubt, because the camera flies: the
       * first version of this measurement read 55 m of honest travel on a
       * debug skip and called it a bug. */
      if (beat.settled === true && isVec3(beat.look)) {
        const lookMiss = norm(sub(beat.look, subject.point));
        if (lookMiss > lookToleranceM) {
          findings.push(finding('CAMERA_LOOK_MISS', beat, {
            subject: subject.id,
            missM: round3(lookMiss),
            look: beat.look.map(round3),
            subjectAt: subject.point.map(round3),
          }));
        }
      }
    }

    /* Who is talking, and whether the player can see him do it. */
    if (!speaker?.point || !shot.lookAt) continue;

    const placement = framePlacement(shot, speaker.point);
    if (!placement.inside) {
      findings.push(finding('SPEAKER_OFF_CAMERA', beat, {
        speaker: speaker.id,
        reason: placement.reason,
        depthM: round3(placement.depthM),
        speakerAt: speaker.point.map(round3),
      }));
      continue;
    }

    /* Occlusion is only asked once the head is known to be in the rectangle,
     * and never when the camera is already buried: "there is a wall between
     * you and him" is not a second note when the first note is "you are inside
     * the wall". One fault, one finding. */
    if (swallowed) continue;
    const toHead = sub(speaker.point, shot.position);
    const range = norm(toHead);
    const dir = unit(toHead);
    if (!dir) continue;
    let nearest = Infinity;
    let blocker = null;
    for (const box of boxes) {
      if (box.blocks?.vision === false) continue;
      if (box.spatialKind === 'actor-body' && box.ownerActorId === speaker.id) continue;
      const distance = solidDistance(shot.position, dir, box);
      if (distance < nearest) { nearest = distance; blocker = box; }
    }
    if (nearest < range - OCCLUSION_SKIN_M) {
      findings.push(finding('SPEAKER_OCCLUDED', beat, {
        speaker: speaker.id,
        solid: blocker?.name ?? null,
        blockedAtM: round3(nearest),
        speakerAtM: round3(range),
      }));
    }
  }

  return { id, findings };
}

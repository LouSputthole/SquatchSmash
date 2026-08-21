/**
 * THE SPECIAL MEETING — where the camera is standing, and what is in front of it.
 *
 * ## Why this file exists
 *
 * `docs/FRAMING-GATE.md` is blunt about the hole it was built over: the
 * arithmetic that proves the camera is pointed at the man who is talking has
 * been finished and under test for days and **nothing in the game publishes a
 * shot list for it to read**, so it has been measuring nothing at all. This is
 * this scene opting in. `src/heist/shots.js` is the same move on THE TAKE.
 *
 * This scene has earned it twice over. The riders in the car faced the BACK of
 * it for the whole of a two-minute drive because `update()` wrote the player's
 * yaw straight onto a rig whose forward is the other way round, and nobody
 * noticed until a gate measured it (`cast.js`, `carFacing`). Everybody who got
 * out was turned along the car instead of at it. Everybody stood at y = 0,
 * including on a clearing floor thirty-two metres up. Every one of those was a
 * fact about a body, and the staging gate now holds them. What no gate held
 * was the other half: whether any of it is in shot.
 *
 * ## The camera belongs to the player, and that decides what a beat may claim
 *
 * There is no shot table in this scene. It is first person from the pavement
 * to the treeline, and the player can look where he likes. The scene points
 * the camera in exactly four places, and those four are the whole shot list:
 *
 *   `SPAWN.yaw`               he comes downstairs and is left facing the kerb
 *   `sedan.eyeWorld(...)`     the front seat, once the door shuts
 *   `PassengerRig.leave()`    he gets out at the spur, turned at the car
 *   `forest.trailYaw`         SM-530 puts him on the trailhead, facing up it
 *
 * The last two of those read the way they do BECAUSE of this file. Both were
 * measured wrong by the beats below on the first run and fixed in the same
 * pass — see `exitYaw()` in `./forest/passenger.js` and `startTheWalk()` in
 * `./main.js`, which carry the numbers.
 *
 * So a beat here says *"this is where the scene stood him and which way it
 * turned him"*, never *"the shot holds on this man"*. Two consequences, and
 * they are the authoring rule for the whole file:
 *
 *   - **`SPEAKER_OFF_CAMERA` is the finding that matters.** It is the owner's
 *     note — *"he talks and you cannot see him"* — and `framePlacement`
 *     normalises the aim direction, so it is a fair question about a camera
 *     the player steers.
 *   - **`CAMERA_AIM_MISS` is not, unless the scene really is aiming.** A beat
 *     that names a speaker gets the aim check whether it wants one or not:
 *     `framingFindings` defaults `subject` to `speaker`. So these beats name
 *     the point the SCENE aimed at as their subject rather than the man
 *     talking — the kerb mark the pavement spawn is squared up on, the back
 *     half of the car he is turned to when he gets out, the trail node the
 *     walk starts along. The aim check then measures something authored, which
 *     is the only kind of aim worth holding to a metre, and the frustum does
 *     the rest.
 *
 * ## Who is deliberately NOT named
 *
 * Nobody in Act Five. From SM-510 on, the entire point is that the three of
 * them are behind him: *"We're right behind you"*, *"close behind him, quiet,
 * almost private"*, *"from behind him, quietly"*. Naming those as speakers
 * would fill the report with the scene working exactly as written. Seff in the
 * driving seat is not named as a speaker either, for a different reason: the
 * gate has no idea what a windscreen is, so a man seen through one reads as a
 * man behind a wall. The car's collider is one box from the road to 2.28 m
 * with the whole cabin inside it — as it has to be, because it is the wall the
 * player walks round — and `docs/STAGING-GATE.md` already documents the same
 * box swallowing the same four riders.
 */
import * as THREE from 'three';

import { EYE_HEIGHT } from './stage.js';

/** The lens `main.js` builds. Not the house 66. */
export const SPECIAL_MEETING_FOV_DEG = 70;

/** The pitch the scene leaves him on when he comes downstairs. `stage.spawn`. */
const SPAWN_PITCH = -0.04;

/** The pitch `PassengerRig.leave()` sets when he gets out at the spur. */
const EXIT_PITCH = 0;

/** How far down the ray a look point goes when nothing fixes the range. */
const FREE_LOOK_RANGE_M = 8;

/** The node a published beat hangs on, so a re-stage replaces rather than adds. */
const SHOT_NODE_PREFIX = 'specialmeeting.shot.';

/**
 * The direction a player faces at a yaw and a pitch.
 *
 * `Player`'s own convention, and it is the one this scene has already been
 * bitten by: forward is `(-sin yaw, ., -cos yaw)`, half a turn from the
 * `makePerson` rig's `(sin, cos)`. That half turn is the two-minute drive
 * everybody spent looking at the back seat. `cast.js` carries the same note
 * over `carFacing()`.
 */
export function meetingLookDirection(yaw, pitch = 0) {
  const flat = Math.cos(pitch);
  return new THREE.Vector3(-Math.sin(yaw) * flat, Math.sin(pitch), -Math.cos(yaw) * flat);
}

/** A look point along the shot's own ray, `range` metres out. */
function aimedAt(position, yaw, pitch, range) {
  const d = meetingLookDirection(yaw, pitch).multiplyScalar(range);
  return [position[0] + d.x, position[1] + d.y, position[2] + d.z];
}

const rangeBetween = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * One camera, one target, and however many people are talking in front of it.
 *
 * The look point is planted at the TARGET's range along the authored ray, so
 * `CAMERA_AIM_MISS` comes out as the perpendicular distance from the target to
 * the shot's axis. Direction from the scene, distance from the build: a target
 * that slides sideways out of the shot fails, and one that is simply further
 * off than it was does not.
 */
function shotBeats({
  id, phase, position, yaw, pitch = 0, target = null, targetId = null, speakers = [],
}) {
  const range = target ? rangeBetween(position, target) : FREE_LOOK_RANGE_M;
  const camera = {
    position: [...position],
    lookAt: aimedAt(position, yaw, pitch, range),
    fovDeg: SPECIAL_MEETING_FOV_DEG,
  };
  const subject = target ? { id: targetId, point: [...target] } : null;
  const beats = [{
    id, phase, camera, ...(subject ? { subject } : {}),
  }];
  for (const speaker of speakers) {
    beats.push({
      id: `${id}:${speaker.toLowerCase()}`,
      phase,
      camera: { ...camera, position: [...position], lookAt: [...camera.lookAt] },
      speaker,
      ...(subject ? { subject: { id: subject.id, point: [...target] } } : {}),
    });
  }
  return beats;
}

/**
 * The pavement, outside the flat. Act Two.
 *
 * ONE CAMERA FOR THE WHOLE ACT, and it is `SPAWN`: he comes down the steps,
 * the scene puts him there facing the road, and everything anybody says to him
 * before he gets in the car is said to a man standing on that spot. The target
 * is `kerbMark` — the block's own anchor for the patch of kerb outside the
 * entrance, which is what `SEDAN_STOP.x` was chosen to put the front passenger
 * door in front of. `SPAWN.x` and `kerbMark.x` are authored in two different
 * files and are supposed to be the same number; measured on the built block
 * the shot misses the mark by 0.060 m, every millimetre of which is the
 * spawn's own -0.04 of pitch falling over the metre and a half between them,
 * and none of which is sideways.
 *
 * The frame is tighter than it looks. Lag, having stepped clear of the door,
 * measures 2.500 m off the axis against a half-width of 2.726 at his depth —
 * ninety-two per cent of the way to the edge of the picture. `STEP_CLEAR_M` in
 * `cast.js` is 1.7 m; at 1.9 he is out of shot while he is talking.
 *
 * Numbskull and Lag are named because they are on their feet on the pavement
 * in the open. Seff is not: he says his lines leaning across the front seat,
 * through a doorway and a windscreen the gate cannot see.
 */
export function kerbFramingBeats({ state, anchors, groundY = 0.15, spawn }) {
  if (!spawn) throw new Error('The kerb shot list needs the spawn');
  const kerbMark = anchors?.kerbMark;
  const position = [spawn.x, groundY + EYE_HEIGHT, spawn.z];
  const target = kerbMark ? [kerbMark.x, kerbMark.y + EYE_HEIGHT, kerbMark.z] : null;
  /* `waiting` is the ten seconds before the car turns the corner: nobody is
   * within forty metres of him and nothing is said by anybody with a body, so
   * the beat carries no speaker. It is still worth publishing — the question
   * that needs no author is whether the scene has stood him inside the
   * masonry, and a spawn point is exactly where that goes wrong. */
  const speakers = state === 'arrived' ? ['Numbskull', 'Lag'] : [];
  return shotBeats({
    id: `SM-100:the-pavement:${state}`,
    phase: 'kerb',
    position,
    yaw: spawn.yaw,
    pitch: SPAWN_PITCH,
    target,
    targetId: 'block.kerbMark',
    speakers,
  });
}

/**
 * The spur in the woods, engine off. Acts Four and Five.
 *
 * TWO CAMERAS AND TWO HEADINGS, and until this pass there was one of each.
 * `PassengerRig.leave()` stands him on the ground beside the front passenger
 * door and turns him; SM-530 then picks him up and puts him on the trailhead
 * sixteen metres away. That second move used to change his position and
 * nothing else, so whatever `leave()` had turned him to was still on him when
 * he arrived — which is why these are written as two beats with two headings
 * rather than one heading carried across a teleport.
 *
 * At the car the shot is on the car, because Act Four happens round it. At the
 * trailhead it is up the trail, because Act Five is the walk — *"Trail's up
 * there. Straight up. You can't miss it."*
 */
export function spurFramingBeats({
  exit, heading, lookTarget, trailHeading, trailhead, trailNext = null,
}) {
  if (!exit || !trailhead) throw new Error('The spur shot list needs the exit and the trailhead');
  const standing = [exit.x, exit.y + EYE_HEIGHT, exit.z];
  const atTrailhead = [trailhead.x, trailhead.y + EYE_HEIGHT, trailhead.z];
  /* WHAT THE TWO SHOTS ARE AIMED AT, AND HOW HARD THAT IS TO GET WRONG.
   *
   * At the car, the target is the point `exitYaw()` turns him to, so
   * `CAMERA_AIM_MISS` on that beat is close to a tautology and is not where
   * the value is -- it is `SPEAKER_OFF_CAMERA`, which is what caught all four
   * of them standing behind the camera. It is not published as a fiction: the
   * shot really is on the back half of the car and that really is what the
   * four of them are standing round.
   *
   * At the trailhead it is the same shape and worth saying out loud: the
   * heading is `forest.trailYaw` and the target is the trail node that getter
   * is derived from, and `main.js` now turns him with the same getter, so all
   * three agree by construction and the aim reads 0.000. That agreement IS the
   * fix. Until it existed, SM-530 moved him to the trailhead and changed
   * nothing else, so he arrived carrying whatever `leave()` had turned him to
   * at the car -- a hundred and forty-six degrees off the path he had just
   * been told he could not miss. The beat is here to keep the three of them
   * reading off one number, and to ask the question that needs no author:
   * whether the spot he is put down on is inside anything.
   */
  /* At the camera's own height, for the same reason the trailhead's target is:
   * a man standing beside a car is looking ALONG it, not down at the sill. */
  const rearOfCar = [lookTarget.x, standing[1], lookTarget.z];
  return [
    /* Act Four: the four of them sort themselves out round the car and all
     * four of them talk. Kittenboss does most of it, out of the boot and then
     * from behind the car; Numbskull says "Pop the trunk" from beside it; Seff
     * answers her from the driver's door; Lag names her. Every one of them is
     * on their feet in the open with nothing between them and the camera, so
     * every one of them is a fair `speaker`. */
    ...shotBeats({
      id: 'SM-400:out-of-the-car',
      phase: 'spur',
      position: standing,
      yaw: heading,
      pitch: EXIT_PITCH,
      target: rearOfCar,
      targetId: 'lincoln.rear',
      /* NUMBSKULL IS DELIBERATELY NOT ON THIS LIST, and it is the only name
       * left off for a reason that is not "the script puts him behind you".
       * SM-400: *"Numbskull stands beside Tony's door and steps back to give
       * him room."* Measured on the built spur, that leaves him 1.79 m away
       * and 69 degrees off the shot's axis: 0.639 m of depth and 1.666 m out
       * to the left against a half-width of 0.795 there. He is off the left
       * edge of a 70-degree lens on this heading and on every other one tried,
       * bar the two that put HIM in frame and threw Seff out instead. A man
       * standing at your elbow is not a framing fault, and a finding that
       * fires on every run for a body the script deliberately parked there is
       * a gate nobody reads. */
      speakers: ['Kittenboss', 'Seff', 'Lag'],
    }),
    /* Act Five: he is put on the trailhead and told to walk up it. Nobody is
     * named -- from SM-510 on, all three of them being behind him is the
     * scene. The one question left is whether the trail is in front of him. */
    ...shotBeats({
      id: 'SM-530:the-trailhead',
      phase: 'trail',
      position: atTrailhead,
      yaw: trailHeading,
      pitch: EXIT_PITCH,
      /* AT THE CAMERA'S OWN HEIGHT, and that is not a fudge -- it is the
       * measurement. The trail falls 4.486 m in its first 10 m, so the second
       * surveyed node stands 4.49 m below the eye at the trailhead, and a beat
       * that put its target on the ground there would be asking whether a man
       * told to walk up a path is staring at his own boots ten metres ahead.
       * He is not; he is looking along it, at pitch 0, which is what the scene
       * gives him. The bearing is the whole question. */
      target: trailNext ? [trailNext.x, atTrailhead[1], trailNext.z] : null,
      targetId: 'clearing.trail[1]',
    }),
  ];
}

/**
 * Hang beats where `tools/verify-framing.mjs` reads them.
 *
 * `userData.framingBeat` is one of the two spellings the reporter knows, and
 * it is the one that needs no change to any adapter: it traverses the roots it
 * was handed and picks up whatever the scene stamped on them. One empty
 * `Object3D` per beat, because a node can carry one beat and the gate wants
 * them all. They are invisible to everything else — `tools/geometry-collect.mjs`
 * gathers meshes with geometry on them and nothing else, so a bare `Object3D`
 * is not a record, not an assembly and not a bucket.
 *
 * (This is the same six lines as `publishHeistFramingBeats`. Two scenes is not
 * yet a shared module; the day a third publishes, this belongs in
 * `src/core/staging.js` beside the actor marker it is the other half of.)
 */
export function publishMeetingFramingBeats(parent, beats) {
  if (!parent) throw new Error('Special Meeting framing beats need somewhere to hang');
  for (const stale of parent.children.filter((c) => c.name.startsWith(SHOT_NODE_PREFIX))) {
    parent.remove(stale);
  }
  for (const beat of beats) {
    const node = new THREE.Object3D();
    node.name = `${SHOT_NODE_PREFIX}${beat.id}`;
    node.userData.framingBeat = beat;
    parent.add(node);
  }
  return beats;
}

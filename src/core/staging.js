/**
 * The staging marker: one way to say "this object is a person standing here,
 * facing that."
 *
 * Why this exists.  Every scene grew its own way of tagging its cast --
 * `userData.figure` in the heist, `userData.cast` in the mansion, a name
 * prefix in the Bing, nothing at all in half a dozen others.  The cost was not
 * untidiness, it was that no machine could ever check the notes the owner kept
 * writing: "they are all looking forward at the same spot", "the cops spawned
 * behind me", "they are standing in the seats".  Each of those is a one-line
 * assertion over a scene's cast, and not one of them could be written, because
 * finding the cast meant knowing which of six conventions a given file had
 * picked.  The shared `Person` rig did not even name its own head.
 *
 * So: one marker, `userData.actor`, stamped by the shared rig and by whatever
 * else puts a body in a scene.  tools/staging-gate.mjs reads it and nothing
 * else.  A scene that marks its cast gets checked; one that does not shows up
 * in the coverage report as unmarked, which is the ratchet.
 *
 * The facing convention is the part worth being loud about.  `Person` builds
 * its face on local +Z (see the `+z is the face` comment in person.js), so +Z
 * is the default here.  A rig that faces another way declares `faceAxis`
 * rather than quietly disagreeing -- a silent disagreement about which way is
 * forward is exactly how a mask ends up on the back of a head.
 */

/** The default face axis: the shared rig builds its face on local +Z. */
export const DEFAULT_FACE_AXIS = '+z';

/** Eye height of the shared rig, in metres: `Person` sits its head at 2.3. */
export const DEFAULT_EYE_HEIGHT_M = 2.3;

/** Hip height of the shared rig, in metres: the belt sits at 1.16. */
export const DEFAULT_HIP_HEIGHT_M = 1.16;

const FACE_AXES = Object.freeze({
  '+x': Object.freeze([1, 0, 0]),
  '-x': Object.freeze([-1, 0, 0]),
  '+z': Object.freeze([0, 0, 1]),
  '-z': Object.freeze([0, 0, -1]),
});

/*
 * Some rigs cannot describe their eyes and hips as two vertical offsets from
 * the actor root. A standing Person can; Margo's apartment rig cannot once
 * the same hip-pivoted body lies on its side. Keep those Object3D references
 * out of userData (Three serializes userData) and beside the marker instead.
 */
const ACTOR_LANDMARKS = new WeakMap();

/** Postures the gate knows how to check. */
export const ACTOR_POSTURES = Object.freeze(['stand', 'sit', 'kneel', 'lie', 'ride']);

/**
 * Roles carry no gameplay meaning -- they exist so a finding can say "three
 * CIVILIANS share a yaw" rather than "three objects", and so the spawn-arc
 * check can pick out the ones that are supposed to arrive in front of you.
 */
export const ACTOR_ROLES = Object.freeze([
  'player', 'crew', 'civilian', 'guard', 'enemy', 'principal', 'bystander',
]);

/**
 * The role words the scenes ALREADY use, mapped onto the coarse ones above.
 *
 * This table exists because the first draft of this file did not have it, and
 * instead handed a scene's own `role: 'performer'` straight to `markActor`,
 * which threw and took the whole Bing build down with it -- 46 tests. Twenty
 * role words were already in the source; inventing a second vocabulary beside
 * them, in the very change that added a gate against reinvented systems, was
 * the wrong way round.
 *
 * So the scenes keep their words, and this is where they meet the gate's.
 * Anything unlisted is a `bystander`: a person the gate will still check for
 * facing and footing, and will not hold to the spawn arc.
 */
export const ACTOR_ROLE_FOR_SCENE_ROLE = Object.freeze({
  prospect: 'player',
  crew: 'crew',
  family_member: 'crew',
  civilian: 'civilian',
  customer: 'civilian',
  teller: 'civilian',
  guard: 'guard',
  lobby_guard: 'guard',
  enemy: 'enemy',
  smg: 'enemy',
  rifle: 'enemy',
  flanker: 'enemy',
  boss: 'principal',
  founder: 'principal',
  principal: 'principal',
  traitor: 'principal',
  clerk: 'bystander',
  outsider: 'bystander',
  performer: 'bystander',
  seller: 'bystander',
});

/**
 * A scene's own role word in the gate's vocabulary, never throwing.
 *
 * Strictness belongs on `markActor`, where a hand-written call with a typo in
 * it should fail loudly. It does NOT belong on the path where a scene's
 * existing data is being translated: a role nobody has mapped yet is a
 * labelling gap, and a labelling gap must not stop a scene from building.
 */
export function coarseActorRole(role) {
  return ACTOR_ROLE_FOR_SCENE_ROLE[role] ?? 'bystander';
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new TypeError('Actor spec must be an object');
  const { id, role, posture } = spec;
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('Actor spec needs a non-empty id');
  }
  if (!ACTOR_ROLES.includes(role)) {
    throw new TypeError(`Actor ${id} has unknown role ${JSON.stringify(role)}`);
  }
  if (posture !== undefined && !ACTOR_POSTURES.includes(posture)) {
    throw new TypeError(`Actor ${id} has unknown posture ${JSON.stringify(posture)}`);
  }
  if (spec.faceAxis !== undefined && !(spec.faceAxis in FACE_AXES)) {
    throw new TypeError(`Actor ${id} has unknown faceAxis ${JSON.stringify(spec.faceAxis)}`);
  }
  for (const key of ['eyeHeight', 'hipHeight']) {
    if (spec[key] !== undefined && !(isFiniteNumber(spec[key]) && spec[key] > 0)) {
      throw new TypeError(`Actor ${id} has a non-positive ${key}`);
    }
  }
  if (spec.lookAt !== undefined && !(Array.isArray(spec.lookAt)
    && spec.lookAt.length === 3 && spec.lookAt.every(isFiniteNumber))) {
    throw new TypeError(`Actor ${id} lookAt must be three finite numbers`);
  }
  if (spec.seat !== undefined && typeof spec.seat !== 'string') {
    throw new TypeError(`Actor ${id} seat must be the seat object's name`);
  }
}

/**
 * Stamp an object as an actor.  Returns the object so it can be used inline.
 *
 * `posture: 'sit'` means the gate will look for `seat` and check the hips
 * against it; that pairing is what catches a crew that is technically parented
 * to a bench but standing on it.
 */
export function markActor(object, spec) {
  if (!object || typeof object !== 'object') throw new TypeError('Cannot mark a non-object as an actor');
  validateSpec(spec);
  object.userData ??= {};
  object.userData.actor = Object.freeze({
    id: spec.id,
    role: spec.role,
    posture: spec.posture ?? 'stand',
    faceAxis: spec.faceAxis ?? DEFAULT_FACE_AXIS,
    eyeHeight: spec.eyeHeight ?? DEFAULT_EYE_HEIGHT_M,
    hipHeight: spec.hipHeight ?? DEFAULT_HIP_HEIGHT_M,
    ...(spec.seat === undefined ? {} : { seat: spec.seat }),
    ...(spec.lookAt === undefined ? {} : { lookAt: Object.freeze([...spec.lookAt]) }),
    ...(spec.note === undefined ? {} : { note: spec.note }),
  });
  /* Deliberately NOT `object.name = ...`. The marker went in as a userData
   * tag for exactly this reason and then the first draft of this function
   * named unnamed objects anyway, which walked straight into the trap: the
   * geometry gate groups assemblies BY NAME, so naming a previously anonymous
   * Npc group re-bucketed its scene and took 46 tests with it. The id lives in
   * the marker; nothing needs it on the node. */
  return object;
}

/**
 * Change what an already-marked actor is DOING, without disturbing who it is.
 *
 * The marker is frozen because id/role/seat are authored facts that should not
 * drift; posture is the one field a rig changes every time it sits somebody
 * down, so it lives beside the marker as a plain string rather than forcing a
 * re-mark (and a fresh frozen object) on every pose change.
 */
export function setActorPosture(object, posture) {
  if (!ACTOR_POSTURES.includes(posture)) {
    throw new TypeError(`Unknown actor posture ${JSON.stringify(posture)}`);
  }
  if (!readActor(object)) throw new Error('Cannot set a posture on an unmarked object');
  object.userData.actorPosture = posture;
  // See setActorSeat: a seat outlives the sitting only as a stale excuse.
  if (posture !== 'sit') object.userData.actorSeat = undefined;
  return object;
}

/** The marker on an object, or null.  Never throws: callers traverse with it. */
/**
 * Say which seat an already-marked actor is sitting in.
 *
 * The marker's own `seat` is the seat a body was AUTHORED into, and for most
 * of the cast that is the only one it ever has. It is not enough on its own:
 * Ape stands at his roster spot in the Bing and sits in the east booth for
 * the cleanup, so his seat belongs to the pose, not to the roster -- and the
 * marker is frozen, so the pose cannot re-mark him.
 *
 * Clearing on any posture but `sit` is the point rather than a tidy-up. You
 * have a seat while you are sitting in one; a stale seat left on a body that
 * has stood up and walked off would go on excusing that solid from the
 * facing ray somewhere else in the room.
 */
export function setActorSeat(object, seat) {
  if (!readActor(object)) throw new Error('Cannot set a seat on an unmarked object');
  object.userData.actorSeat = seat ?? undefined;
  return object;
}

/**
 * Say how tall an already-marked actor is RIGHT NOW.
 *
 * The marker's `eyeHeight` and `hipHeight` are the heights a body was
 * authored at, and for anything that stands still that is the end of it. A
 * pose that folds a man changes both: the shared airfield rig drops its hips
 * from 0.86 to 0.52 to sit somebody down, so the whole body above the waist
 * comes with it. Measured on the Enola crew, all four declared an eye 0.340 m
 * above where their heads actually were, in an aeroplane, for the whole
 * flight -- the same class of fault as the 2.30 m Sasquatch default, arriving
 * through the pose instead of through the marker.
 *
 * Live beside the frozen marker, exactly like posture and seat, because a
 * pose changes several times a scene and re-marking would mean a fresh frozen
 * object every time somebody sat down.
 */
export function setActorHeights(object, { eyeHeight, hipHeight } = {}) {
  if (!readActor(object)) throw new Error('Cannot set heights on an unmarked object');
  if (eyeHeight !== undefined) object.userData.actorEyeHeight = eyeHeight;
  if (hipHeight !== undefined) object.userData.actorHipHeight = hipHeight;
  return object;
}

/**
 * Bind an actor marker to the rig's actual eye and hip transforms.
 *
 * This is the precise alternative to height offsets for articulated or
 * rotated bodies. The gate reads each anchor's already-updated matrixWorld;
 * it does not ask Three to mutate the scene while evidence is collected.
 */
export function setActorLandmarks(object, { eye, hip } = {}) {
  if (!readActor(object)) throw new Error('Cannot set landmarks on an unmarked object');
  for (const [name, anchor] of Object.entries({ eye, hip })) {
    if (!anchor?.matrixWorld?.elements) {
      throw new TypeError(`Actor ${name} landmark must be an Object3D`);
    }
  }
  ACTOR_LANDMARKS.set(object, Object.freeze({ eye, hip }));
  return object;
}

export function readActor(object) {
  const actor = object?.userData?.actor;
  return actor && typeof actor.id === 'string' ? actor : null;
}

/** The unit face direction for a marker, in the actor's own local space. */
export function faceAxisVector(actor) {
  return FACE_AXES[actor?.faceAxis ?? DEFAULT_FACE_AXIS] ?? FACE_AXES[DEFAULT_FACE_AXIS];
}

/**
 * Every marked actor under a root, with the world-space facts the gate needs.
 *
 * The caller is responsible for having updated world matrices -- this reads
 * `matrixWorld` and does not touch the scene graph, because the geometry
 * adapters hand their roots over already updated and a second update there
 * would be the tool mutating what it is measuring. Hidden actors are excluded
 * from player-facing staging by default. `includeHidden` exists only for the
 * certification inventory floor: it proves a visibility correction did not
 * delete the actor marker that older scans counted.
 */
export function collectActors(root, THREE, { includeHidden = false } = {}) {
  if (!root?.traverse) return [];
  const found = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const eyePosition = new THREE.Vector3();
  const hipPosition = new THREE.Vector3();
  root.traverse((object) => {
    /* Object3D.traverse deliberately visits hidden descendants. That is useful
     * for editing and exactly wrong for certification: a hidden actor is not
     * staged in the rendered state. Check the whole chain because a visible
     * marker under an invisible cast group is still invisible. */
    let visible = true;
    for (let cursor = object; cursor; cursor = cursor.parent) {
      if (cursor.visible === false) {
        visible = false;
        break;
      }
      if (cursor === root) break;
    }
    if (!visible && !includeHidden) return;

    const actor = readActor(object);
    if (!actor) return;
    const posture = object.userData.actorPosture ?? actor.posture;
    /* The seat a pose sat him in beats the one the roster authored, and so do
     * the heights it folded him to. */
    const seat = object.userData.actorSeat ?? actor.seat ?? null;
    const eyeHeight = object.userData.actorEyeHeight ?? actor.eyeHeight;
    const hipHeight = object.userData.actorHipHeight ?? actor.hipHeight;
    object.matrixWorld.decompose(position, quaternion, scale);
    const axis = faceAxisVector(actor);
    forward.set(axis[0], axis[1], axis[2]).applyQuaternion(quaternion);
    // Yaw about +Y, measured the way atan2(x, z) reads for a THREE heading.
    const yaw = Math.atan2(forward.x, forward.z);
    const landmarks = ACTOR_LANDMARKS.get(object);
    if (landmarks) {
      eyePosition.setFromMatrixPosition(landmarks.eye.matrixWorld);
      hipPosition.setFromMatrixPosition(landmarks.hip.matrixWorld);
    } else {
      eyePosition.set(position.x, position.y + eyeHeight, position.z);
      hipPosition.set(position.x, position.y + hipHeight, position.z);
    }
    found.push({
      object,
      actor,
      seat,
      id: actor.id,
      role: actor.role,
      posture,
      position: [position.x, position.y, position.z],
      forward: [forward.x, forward.y, forward.z],
      yaw,
      eye: [eyePosition.x, eyePosition.y, eyePosition.z],
      hip: [hipPosition.x, hipPosition.y, hipPosition.z],
    });
  });
  return found;
}

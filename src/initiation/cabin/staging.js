/**
 * INITIATION NIGHT — putting a man where the site says he goes.
 *
 * site.js says where. This says how, for the four things this scene does to a
 * figure that no shared rig has a function for:
 *
 *   1. KNEEL. Nothing in `core/person.js` kneels, and four people are going to.
 *   2. GO DOWN FORWARD. `main.js`'s only death is a stiff backward topple
 *      about the feet, which is right for a man shot in the chest standing up
 *      and absurd for one shot in the back of the head on his knees.
 *   3. HOLD SOMETHING. In a HAND, not on a forearm.
 *   4. FACE SOMETHING, ONCE, and stay facing it.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE ONE THING THAT WILL BREAK ALL OF THIS
 *
 * `Person.update()` writes `legL.rotation.x`, `legR.rotation.x`,
 * `group.rotation.y`, `group.position.y` and `body.rotation.x` EVERY FRAME,
 * unconditionally. A figure that is kneeling and is still being ticked stands
 * back up between one frame and the next, exactly the way a scripted
 * snap-face used to lose to an ambient turn in `bing/cast.js`.
 *
 * So a posed figure is either not ticked at all, or re-posed after the tick.
 * `poseKneeling()` and `poseFallen()` are idempotent and cheap, so the safe
 * shape is:
 *
 *     victim.update(dt, ZERO, 0);      // if it is being ticked at all
 *     poseKneeling(victim, mark);      // …then put it back
 *
 * `isPosed()` reports which figures are in that state, so the ceremony's own
 * update loop can skip them wholesale, which is cheaper and harder to forget.
 */

/* How long a fallen body is belongs to the SITE — every clearance on the mud
 * is measured against it — but it is derived from this file's pose, so it is
 * re-exported here for ceremony code that only imports the poses. One number,
 * one home, two doors. */
import { FALL_REACH } from './site.js';

export { FALL_REACH };

/* ------------------------------------------------------------------ */
/* KNEELING                                                            */
/* ------------------------------------------------------------------ */

/**
 * The pose, in the numbers of the rig it is applied to.
 *
 * `core/person.js` gives a leg ONE segment: a hip pivot at y = 1.16 with a
 * 1.1 m box hanging off it and a foot at the bottom. There is no knee, so a
 * kneel with the thigh vertical and the shin flat is not expressible, and the
 * honest reading of the one joint available is to treat the HIP PIVOT AS THE
 * KNEE: rotate the leg back through a right angle so it lies along the
 * ground, and drop the figure until it rests on it.
 *
 * That is a man on his knees sitting back on his heels — which is what men in
 * this position actually do, because nobody holds themselves upright while
 * this is being arranged behind them.
 *
 *   legPitch  +PI/2 swings the leg to the rear (a child at local -y goes to
 *             local -z, and -z is behind a Person, whose facing is +z).
 *   baseY     -1.02 = -(hip 1.16) + (half the leg box's 0.28 thickness),
 *             so the underside of the shin is exactly on the ground.
 *   footPitch -PI/2 lays the foot box back down flat. Without it the boot's
 *             0.44 m length is left standing on end and 16 cm of it is under
 *             the mud, toes first.
 *   bodyPitch a small forward slump. Nobody kneels to attention.
 */
export const KNEEL_POSE = Object.freeze({
  baseY: -1.02,
  legPitch: Math.PI / 2,
  footPitch: -Math.PI / 2,
  bodyPitch: 0.12,
  /** Where the crown of the head ends up. Matches site.js's KNEEL_HEAD_Y. */
  headY: 1.28,
});

/** The pitch a body has finished falling at: flat, but not ironed. */
export const FALL_PITCH = 1.35;
/** What the legs unfold to as he goes down. Prone, trailing, still bent. */
export const FALL_LEG_PITCH = 0.28;
/**
 * How far the body rides UP as it goes over.
 *
 * A man folding forward over his own shins does not pivot on a fixed point —
 * his hips roll up and over them. Without this the maths is clean and the
 * result is a torso 21 cm into the mud, because the rig's chest is 42 cm deep
 * and a chest laid flat needs half of that in clearance. Twenty centimetres
 * brings the lowest corner of the body to within two of the ground: lying in
 * it, not through it.
 */
export const FALL_LIFT = 0.2;

const ZERO_ROTATION_ORDER = 'YXZ';

/**
 * The hip pivots, and the boot at the bottom of each leg.
 *
 * Found by geometry rather than by index, because `buildLeg` is not this
 * module's to keep in sync: the boot is simply the lowest child of the leg.
 * The same trick finds a hand below.
 */
function lowestChild(pivot) {
  let found = null;
  for (const child of pivot?.children ?? []) {
    if (found === null || child.position.y < found.position.y) found = child;
  }
  return found;
}

function legsOf(figure) {
  return [figure.legL, figure.legR].filter(Boolean);
}

/**
 * Put a figure on its knees on a mark.
 *
 * `mark` is anything with `{ x, z, heading }` — a kneel mark from site.js, or
 * a bare object. Idempotent: call it every frame if that is easier.
 */
export function poseKneeling(figure, mark) {
  if (!figure?.group) return figure;
  const group = figure.group;
  group.rotation.order = ZERO_ROTATION_ORDER;
  if (typeof mark?.heading === 'number') {
    figure.heading = mark.heading;
    group.rotation.y = mark.heading;
  }
  group.rotation.x = 0;
  group.rotation.z = 0;
  if (typeof mark?.x === 'number') group.position.x = mark.x;
  if (typeof mark?.z === 'number') group.position.z = mark.z;
  group.position.y = KNEEL_POSE.baseY;
  for (const leg of legsOf(figure)) {
    leg.rotation.x = KNEEL_POSE.legPitch;
    const boot = lowestChild(leg);
    if (boot) boot.rotation.x = KNEEL_POSE.footPitch;
  }
  if (figure.body) figure.body.rotation.x = KNEEL_POSE.bodyPitch;
  /* Kill the walk cycle's state so a stray tick cannot resume mid-stride. */
  figure.swing = 0;
  figure.walkT = 0;
  group.userData.cabinPose = 'kneeling';
  return figure;
}

/**
 * Take a kneeling figure to the ground, face down, over `k` in [0, 1].
 *
 * ROTATED ABOUT THE KNEES, not about the group origin. The origin of a
 * kneeling figure is 1.02 m BELOW the mud (that is what the drop to
 * `KNEEL_POSE.baseY` did), so spinning the group about it swings a man
 * through the ground and out the other side. The position is therefore
 * recomputed each step so the knee stays exactly where it was put — which is
 * also why the body always ends up lying from the mark, and never sliding off
 * it.
 *
 * The tilt is applied about the figure's OWN left-right axis (rotation order
 * YXZ, yaw first), so a body facing any direction falls forward rather than
 * northward. main.js's toppling prospects use the default XYZ order and tip
 * about the world X axis regardless of which way they are facing; they get
 * away with it because they all face +z. These four do not.
 */
export function poseFallen(figure, mark, k = 1) {
  if (!figure?.group) return figure;
  const t = Math.max(0, Math.min(1, k));
  const group = figure.group;
  const heading = typeof mark?.heading === 'number' ? mark.heading : figure.heading ?? 0;
  const pitch = FALL_PITCH * t;

  group.rotation.order = ZERO_ROTATION_ORDER;
  figure.heading = heading;
  group.rotation.y = heading;
  group.rotation.x = pitch;
  group.rotation.z = 0;

  /* Keep the local point (0, -baseY, 0) — the knees — pinned to the mark. */
  const pivot = -KNEEL_POSE.baseY;
  const swing = pivot * Math.sin(pitch);
  group.position.x = (mark?.x ?? group.position.x) - swing * Math.sin(heading);
  group.position.z = (mark?.z ?? group.position.z) - swing * Math.cos(heading);
  group.position.y = -pivot * Math.cos(pitch) + FALL_LIFT * t;

  const legPitch = KNEEL_POSE.legPitch
    + (FALL_LEG_PITCH - KNEEL_POSE.legPitch) * t;
  for (const leg of legsOf(figure)) {
    leg.rotation.x = legPitch;
    const boot = lowestChild(leg);
    if (boot) boot.rotation.x = KNEEL_POSE.footPitch * (1 - t);
  }
  if (figure.body) figure.body.rotation.x = KNEEL_POSE.bodyPitch * (1 - t);
  figure.swing = 0;
  group.userData.cabinPose = t >= 1 ? 'fallen' : 'falling';
  return figure;
}

/** True while a figure is in a pose `Person.update()` would destroy. */
export function isPosed(figure) {
  const pose = figure?.group?.userData?.cabinPose;
  return pose === 'kneeling' || pose === 'falling' || pose === 'fallen';
}

/** Give a posed figure back to the walk cycle. */
export function clearPose(figure) {
  if (!figure?.group) return figure;
  const group = figure.group;
  group.rotation.x = 0;
  group.rotation.z = 0;
  group.position.y = 0;
  for (const leg of legsOf(figure)) {
    leg.rotation.x = 0;
    const boot = lowestChild(leg);
    if (boot) boot.rotation.x = 0;
  }
  if (figure.body) figure.body.rotation.x = 0;
  delete group.userData.cabinPose;
  return figure;
}

/* ------------------------------------------------------------------ */
/* HANDS                                                               */
/* ------------------------------------------------------------------ */

/**
 * The hand, on either rig this game has.
 *
 * `src/bing/cast.js`'s rig publishes `parts.handL` / `parts.handR` and that is
 * always the right answer when it exists. `core/person.js`'s Person does not
 * publish anything: `buildArm` adds a sleeve at -0.24, a forearm at -0.66 and
 * a hand at -0.95, and the hand is simply the lowest of the three.
 *
 * WHY THIS FUNCTION EXISTS AT ALL: the alternative is what is in this scene
 * already — `boosk.armR.add(staff)` with the staff pushed down 0.9 by hand —
 * and the alternative is what put beer cans on golfers' forearms. A thing held
 * in a hand goes in the hand; then it stays there when the arm moves, and no
 * magic offset has to be re-tuned when the pose changes.
 */
export function handSocket(figure, side = 'R') {
  const key = side === 'L' ? 'handL' : 'handR';
  const published = figure?.parts?.[key];
  if (published) return published;
  const arm = side === 'L' ? figure?.armL : figure?.armR;
  return lowestChild(arm) ?? arm ?? null;
}

/**
 * Put an object in a figure's hand.
 *
 * `offset` is in the hand's own space and defaults to nothing, because the
 * whole point is that there is no offset to get wrong. Returns the socket it
 * used so a caller can assert on it.
 */
export function attachToHand(figure, side, object, { offset = null, rotation = null } = {}) {
  const socket = handSocket(figure, side);
  if (!socket || !object) return null;
  socket.add(object);
  object.position.set(offset?.x ?? 0, offset?.y ?? 0, offset?.z ?? 0);
  if (rotation) object.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  return socket;
}

/** Take it back off, wherever it was hung. */
export function releaseFromHand(object) {
  object?.parent?.remove(object);
  return object;
}

/* ------------------------------------------------------------------ */
/* FACING                                                             */
/* ------------------------------------------------------------------ */

/**
 * Turn a figure to look at a point, NOW, and leave it there.
 *
 * This scene's executioners cannot use a chase-the-target facing helper. A
 * stored target yaw that `update()` chases every frame is the mechanism that
 * pinned a character forever after one ambient turn in `bing/cast.js`, and the
 * fix there was to make a snap CLEAR the target. Here there is no target at
 * all: the heading is written once, both on the rig and on the transform, and
 * nothing is left behind to drag it back.
 */
export function faceAt(figure, target) {
  if (!figure?.group || !target) return figure;
  const heading = Math.atan2(target.x - figure.group.position.x, target.z - figure.group.position.z);
  figure.heading = heading;
  figure.group.rotation.y = heading;
  if (typeof figure.targetYaw === 'number') figure.targetYaw = null;
  return figure;
}

/** Stand a figure on a mark, facing wherever the mark says. */
export function standOn(figure, mark) {
  if (!figure?.group || !mark) return figure;
  figure.group.position.set(mark.x, mark.y ?? 0, mark.z);
  if (typeof mark.heading === 'number') {
    figure.heading = mark.heading;
    figure.group.rotation.y = mark.heading;
  }
  return figure;
}

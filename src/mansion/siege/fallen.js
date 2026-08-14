/**
 * A body on the floor that is actually ON the floor.
 *
 * Owner, playtest 2026-08-13: *"the attackers when they die float like a foot
 * above the ground"*. Measured on the live scene before this module existed
 * (tools/probe-siege-pass.mjs corpses): every corpse's lowest RENDERED point
 * sat exactly on its floor -- `HeistFigure._ground()` guarantees that -- and
 * the body still read as floating, because the only thing touching the marble
 * was one hand. `fallen()` keeps the figure 12 degrees off flat
 * (`PI/2 - 0.12`) and rolls it 35 degrees about its own length, so grounding
 * the lowest point propped everything else in the air: head 0.35-0.37 m up,
 * one leg 0.30-0.37, the left arm 0.24-0.39. A plank resting on one corner.
 *
 * So the siege lays its dead flat. The incline goes to two degrees, the roll
 * is clamped to a slump instead of a twist, the head turns to the side rather
 * than lifting off the boards, and the limbs are posed in the body's plane
 * with a little deterministic variation per body so a cleared wave is not
 * eight copies of one corpse. `HeistFigure.fallen()` itself is untouched --
 * the heist owns that pose and other scenes rely on it.
 *
 * The caller is responsible for the weapon: Box3 includes invisible
 * descendants, so both siege adapters already detach the hand-mounted gun
 * around any pose measurement (`withoutMountedWeapon` / the ensemble's `down`
 * path). This helper only poses and settles.
 */

import * as THREE from 'three';

const _bounds = new THREE.Box3();

/** How far off flat a siege corpse lies. Two degrees keeps a hint of weight. */
const FALLEN_TILT_X = Math.PI / 2 - 0.035;
/** The most a corpse may roll about its own length. A slump, not a twist. */
const FALLEN_ROLL = 0.12;

/**
 * Pose a `HeistFigure` as a grounded siege casualty and settle it on
 * `figure.baseY`.
 *
 * @param {object} figure   the HeistFigure
 * @param {object} [options]
 * @param {number} [options.roll]    signed; only the SIGN picks the slump
 *   side, the magnitude is clamped to FALLEN_ROLL.
 * @param {number} [options.variant] any integer; picks deterministic limb
 *   variation so adjacent corpses differ.
 */
export function siegeFallenPose(figure, { roll = 0.5, variant = 0 } = {}) {
  const side = roll >= 0 ? 1 : -1;
  const v = Math.abs(Math.trunc(Number(variant) || 0));
  figure.fallen({ roll: side * FALLEN_ROLL });
  figure.tilt.rotation.x = FALLEN_TILT_X;

  const p = figure.parts;
  /* The head lies over on its cheek instead of craning off the floor. */
  p.head.rotation.set(0.32, side * (0.4 + (v % 3) * 0.12), 0);
  /* Arms in the body's plane — and "plane" is load-bearing. With the tilt at
   * ~90 degrees an arm's local X pitches it OUT of that plane, straight at
   * (or away from) the marble: the first cut of this pose kept `fallen()`'s
   * arm pitches (-2.62, -1.7) and the right hand reached 0.15 m below every
   * other part of the body, so `_settle()` grounded the HAND and propped the
   * corpse on it — the exact float this module exists to remove, rebuilt at a
   * new angle. So the pitches go to the plane's own values — past the head is
   * -2.9-ish, by the side is ~-0.3 — and the spread comes from Z, which swings
   * a horizontal arm ALONG the floor instead of through it. */
  p.armL.rotation.set(-2.98 + (v % 2) * 0.06, 0, -0.62 - (v % 3) * 0.14);
  p.foreL.rotation.set(-0.05 - (v % 2) * 0.04, 0, 0);
  p.armR.rotation.set(-0.2 - (v % 3) * 0.05, 0, 0.6 + (v % 2) * 0.16);
  p.foreR.rotation.set(-0.08, 0, 0);
  /* Legs nearly straight, ankles apart. A raised knee is a foot in the air
   * once the body is horizontal — and leg X is out-of-plane exactly like arm
   * X, so the splay lives in Z here too. */
  p.legL.rotation.set(-0.02 - (v % 2) * 0.02, 0, -0.08 - (v % 3) * 0.05);
  p.legR.rotation.set(0.01 + (v % 3) * 0.01, 0, 0.06 + (v % 2) * 0.04);
  p.shinL.rotation.set(0.03, 0, 0);
  p.shinR.rotation.set(0.02 + (v % 2) * 0.02, 0, 0);

  figure._settle();
  return figure;
}

/**
 * Fall INTO the pose instead of teleporting into it.
 *
 * Owner, playtest 2026-08-13: *"the downed animation sucks"*. Half of that was
 * the propped incline above; the other half was the cut -- the siege's cast
 * applied the floor pose in a single frame, the exact hard-cut fault
 * `HeistFigure`'s own pose blending was written to remove (see the long note
 * in src/heist/people.js). This wraps any authored pose application in that
 * same machinery: capture, apply, capture, rewind, and let `figure.update()`
 * walk the smoothstep across with per-frame grounding.
 *
 * `apply` runs synchronously and must leave the figure IN the target pose;
 * everything outside this helper (visibility, `figure.pose`, blood, barks)
 * therefore sees the man already down while the body spends `duration`
 * seconds getting there -- the same contract `setState` documents.
 *
 * `_groundBlend` is deliberately NOT set: per-frame grounding measures the
 * whole root with Box3, and a siege rig carries its hidden catalog weapon in
 * the hand -- grounding on THAT lifts the falling body a gun's depth into
 * the air for the whole blend. The captured endpoint tilt positions are both
 * measured-and-settled, so the smoothstep between them is honest; a wrist
 * grazing the boards mid-crumple is the cheaper artefact.
 */
export function blendSiegeFall(figure, apply, { duration = 0.55 } = {}) {
  const before = figure._capturePose();
  apply();
  const after = figure._capturePose();
  figure._applyPose(before);
  figure._poseFrom = before;
  figure._poseTo = after;
  figure._poseElapsed = 0;
  figure._poseDuration = Math.max(0.05, Number(duration) || 0.55);
  figure._groundBlend = false;
  return figure;
}

/**
 * A downed-but-alive body is not scenery.
 *
 * `HeistFigure.update()` deliberately freezes a fallen rig ("down means
 * down") because for a corpse that is correct. A protected name on 1 HP is
 * NOT a corpse: he is bleeding, pressing on the wound, dragging a knee and
 * lifting his head to call across the landing. This lays that motion as
 * absolute joint values over a captured base pose, so it cannot drift, and
 * re-grounds the rig so a pulled knee never pushes an elbow through the
 * marble.
 *
 * @param {object} figure     the downed HeistFigure
 * @param {object} state      per-member scratch: `{ base, headLift }`, owned
 *   by the caller. `base` is captured on the first call after the fall's
 *   blend lands; call sites reset the object when the man goes down.
 * @param {number} seconds    how long he has been down
 * @param {number} dt         frame step
 * @param {object} [options]  `legs`/`rock`/`press` false trims the writhe --
 *   for a body whose silhouette an evidence camera has pinned. `press` gates
 *   the wound-press arm: a pose whose floor contact IS that hand (Eric's
 *   legacy propped attitude grounds on the reaching right hand) floats the
 *   whole body the moment the press folds it up.
 * @returns the state object
 */
export function updateSiegeDownedWrithe(figure, state, seconds, dt, {
  legs = true,
  rock = true,
  press: pressArm = true,
} = {}) {
  /* Let the crumple blend finish before layering motion on its joints. */
  if (figure._poseFrom) return state;
  if (!state.base) state.base = figure._capturePose();
  const p = figure.parts;
  const nodes = [p.armL, p.armR, p.foreL, p.foreR, p.legL, p.legR, p.shinL, p.shinR, p.body, p.head];
  for (let i = 0; i < nodes.length; i++) nodes[i].rotation.set(...state.base.rotations[i]);
  figure.tilt.rotation.set(...state.base.tiltRotation);

  if (legs) {
    /* The knee: a slow asymmetric drag, out over ~1.4 s, back over ~2 s.
     * It drags ALONG the boards -- Z, the in-plane axis -- because hip
     * flexion (leg X) on a horizontal body is a knee pushed into the marble,
     * which the re-ground below answers by seesawing the whole man onto it.
     * The shin curl lifts the heel, which is the one direction a horizontal
     * leg can move that reads and costs nothing. */
    const knee = Math.max(0, Math.sin(seconds * 1.85));
    p.legR.rotation.z = state.base.rotations[5][2] + knee * 0.42;
    p.legR.rotation.x = state.base.rotations[5][0] - knee * 0.05;
    p.shinR.rotation.x = state.base.rotations[7][0] + knee * 0.55;
  }
  if (pressArm) {
    /* The wound hand: it sweeps the boards toward his side and back. Z is
     * the in-plane axis for a horizontal body (see siegeFallenPose above);
     * the first cut of this pressed with X -- a pitch -- which put the hand
     * through the marble from the flat pose and floated the whole body off
     * its grounded contact from the propped one. The pitch is now a whisper
     * of shoulder ease; the reach lives along the floor. */
    const press = 0.5 + 0.5 * Math.sin(seconds * 2.6 + 1.2);
    p.armR.rotation.z = state.base.rotations[1][2] - press * 0.34;
    p.armR.rotation.x = state.base.rotations[1][0] + press * 0.05;
    p.foreR.rotation.x = state.base.rotations[3][0] - press * 0.1;
  }
  /* The head: mostly on the boards, lifted while he calls for help. */
  state.headLift = Math.max(0, (state.headLift ?? 0) - dt / 1.6);
  const lift = state.headLift * state.headLift * (3 - 2 * state.headLift);
  p.head.rotation.x = state.base.rotations[9][0] - lift * 0.42;
  if (rock) {
    /* And the whole body rocks a few degrees on its slump side. */
    figure.tilt.rotation.z = state.base.tiltRotation[2]
      + Math.sin(seconds * 1.1) * 0.045;
  }

  /* Ground the MOVED rig on its RENDERED meshes, every frame. Not
   * `_ground()`: that measures the whole root with Box3, hidden hand-mounted
   * weapon included, which floats the body a gun's depth off the boards --
   * the exact fault this file's header measures. And not the settled base
   * lift alone either: the rock dips a shoulder edge a centimetre through
   * the marble and the sweep grazes it, so the body re-seats on whichever
   * part is its contact THIS frame -- which is also what a rocking body does. */
  figure.tilt.position.set(...state.base.tiltPosition);
  if (Number.isFinite(figure.baseY)) {
    figure.root.updateMatrixWorld(true);
    let minY = Infinity;
    const walk = (node) => {
      if (node.visible === false) return;
      if (node.isMesh) {
        _bounds.setFromObject(node);
        if (_bounds.min.y < minY) minY = _bounds.min.y;
      }
      for (const child of node.children) walk(child);
    };
    walk(figure.root);
    if (Number.isFinite(minY)) figure.tilt.position.y += figure.baseY - minY;
  }
  return state;
}


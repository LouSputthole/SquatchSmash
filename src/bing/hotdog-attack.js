/**
 * Bada Bing's HotDog attack is a local cinematic, not a combat-system import.
 *
 * Initiation owns a different actor rig and is intentionally frozen for
 * playtest.  This mirrors its readable windup / hit / recovery rhythm on the
 * existing Bing Npc rig, after that rig has performed its normal idle update.
 */

export const APE_EXIT_ROUTE = Object.freeze([
  // The stage's nav blocker closes the south lane. Clear the table on its
  // west side, then cross the open north aisle toward the bar.
  Object.freeze({ x: -14.55, z: 0.10 }),
  Object.freeze({ x: -14.55, z: 2.05 }),
  Object.freeze({ x: -12.0, z: 2.05 }),
  Object.freeze({ x: -8.4, z: 2.6 }),
]);

export const APE_RETURN_ROUTE = Object.freeze([
  Object.freeze({ x: -12.0, z: 2.05 }),
  Object.freeze({ x: -14.55, z: 2.05 }),
  Object.freeze({ x: -14.55, z: 0.10 }),
  Object.freeze({ x: -14.9, z: -0.25 }),
]);

export const HOTDOG_ATTACK_HIT_COUNT = 4;
/* The torso and pelvis are separate roots on the Bing rig. Folding the torso
 * half a radian while the legs remain upright visually tears Billy in two.
 * Keep the waist hinge anatomically bounded and put the rest of the collapse
 * into the articulated hips and knees. */
export const HOTDOG_MAX_TORSO_HINGE = 0.22;
export const HOTDOG_MAX_TORSO_ROLL = 0.11;
export const HOTDOG_MAX_HIP_BUCKLE = 0.46;
export const HOTDOG_MAX_KNEE_BUCKLE = 0.82;
/* Timing retuned for the 2026-08-19 playtest ("make sure the ape stabbing
 * animation is on point"): a longer, readable wind-up over the shoulder, a
 * committed strike, and a real recovery between blows. The whole four-hit
 * incident still lands inside the four simulated seconds the focused browser
 * check drives (tools/verify-bing-two.mjs steps 200 × 0.02s). */
export const HOTDOG_ATTACK_WINDUP = 0.26;
export const HOTDOG_ATTACK_IMPACT = 0.36;
export const HOTDOG_ATTACK_RECOVERY = 0.68;
export const HOTDOG_ATTACK_GAP = 0.14;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Ape's stab, one strike per interval.
 *
 * Three phases, all driven off the same clock the impacts land on:
 *   cocked        the wind-up — knife hand drawn high over the shoulder,
 *                 torso twisted away, off arm raised to pin HotDog
 *   followThrough the strike — the whole body pitches into it, the arm
 *                 drives DOWN past horizontal, the head drops with it
 *   recover       he pulls the blade back out and re-sets
 *
 * Everything below is rotations on the same six rig parts the original
 * four-hit controller posed (body/head/armR/foreR/armL/foreL) so both Npc
 * rigs and the headless test rig stay valid.
 */
function poseApeStrike(ape, knife, localTime, strikeIndex) {
  const windup = clamp01(localTime / HOTDOG_ATTACK_WINDUP);
  const strike = clamp01((localTime - HOTDOG_ATTACK_WINDUP)
    / (HOTDOG_ATTACK_IMPACT - HOTDOG_ATTACK_WINDUP));
  const recover = clamp01((localTime - HOTDOG_ATTACK_IMPACT)
    / (HOTDOG_ATTACK_RECOVERY - HOTDOG_ATTACK_IMPACT));
  const followThrough = strike * (1 - recover);
  const cocked = windup * (1 - strike);
  const alternating = strikeIndex % 2 === 0 ? 1 : -1;
  /* Later strikes are heavier: he has stopped measuring the man and is just
   * driving the blade. Scales the lean and the arc, never the timing. */
  const commitment = 1 + strikeIndex * 0.12;

  /* Body weight into it: twist back on the wind-up, pitch forward hard on
   * the strike — the stab comes off the hips, not off the elbow. */
  ape.parts.body.rotation.x = 0.10 * cocked - 0.34 * followThrough * commitment;
  ape.parts.body.rotation.y = 0.26 * cocked * alternating - 0.14 * followThrough * alternating;
  ape.parts.body.rotation.z = -0.14 * cocked + 0.12 * followThrough;
  ape.parts.head.rotation.x = 0.08 * cocked - 0.05 - followThrough * 0.22;

  /* The knife arm: cocked high over the shoulder, then a committed downward
   * drive well past the old punch arc. */
  ape.parts.armR.rotation.x = -0.30 - cocked * 1.55 - followThrough * 1.50 * commitment;
  ape.parts.foreR.rotation.x = -0.46 - cocked * 1.05 - followThrough * 0.42;
  ape.parts.armR.rotation.z = 0.08 * alternating + cocked * 0.34;

  /* The off hand does a job: it reaches out and pins HotDog by the lapel
   * through the strike instead of idling at his side. */
  ape.parts.armL.rotation.x = -0.20 - cocked * 0.55 - followThrough * 0.72;
  ape.parts.foreL.rotation.x = -0.45 - cocked * 0.30 - followThrough * 0.25;

  if (knife) {
    knife.visible = true;
    /* Blade up and back on the wind-up, rolled point-down through the
     * strike — an ice-pick grip stab, not a swung club. */
    knife.rotation.x = -0.32 - cocked * 0.85 + followThrough * 0.55;
    knife.rotation.z = 0.18 + alternating * 0.12 + followThrough * 0.10;
  }
}

/**
 * HotDog reads every strike: a flinch UP on Ape's wind-up (he can see it
 * coming), a hard buckle around the blade on the hit, and less and less
 * recovery each time — by the fourth he is folding, not recoiling.
 */
function poseHotDogRecoil(hotdog, origin, localTime, strikeIndex) {
  const windup = clamp01(localTime / HOTDOG_ATTACK_WINDUP);
  const recoil = clamp01((localTime - HOTDOG_ATTACK_WINDUP)
    / (HOTDOG_ATTACK_RECOVERY - HOTDOG_ATTACK_WINDUP));
  const hit = Math.sin(recoil * Math.PI);
  /* Accumulated damage: each landed strike leaves him more folded than the
   * last, so the recoil rides on a sagging baseline instead of resetting. */
  const sag = strikeIndex * 0.16;
  const flinch = windup * (1 - recoil) * (1 - strikeIndex * 0.2);

  hotdog.group.position.x = origin.x - hit * (0.09 + strikeIndex * 0.03);
  hotdog.group.position.z = origin.z - hit * 0.045;
  /* Doubles over the wound as the strikes stack up. The old torso-only bend
   * reached 0.50 rad against upright legs, separating the upper and lower
   * halves. Cap that waist joint and carry the remaining fold through the
   * hips and knees, where this articulated rig can actually collapse. */
  const desiredHinge = Math.max(0, -0.06 * flinch + hit * 0.24 + sag * 0.55);
  const torsoHinge = Math.min(HOTDOG_MAX_TORSO_HINGE, desiredHinge);
  const transferredFold = Math.max(0, desiredHinge - torsoHinge);
  const buckle = clamp01(hit * 0.58 + sag * 1.25 + transferredFold * 1.8);
  hotdog.parts.body.rotation.x = torsoHinge;
  hotdog.parts.body.rotation.z = hit
    * (strikeIndex % 2 ? HOTDOG_MAX_TORSO_ROLL : -HOTDOG_MAX_TORSO_ROLL);
  for (const leg of [hotdog.parts.legL, hotdog.parts.legR]) {
    if (leg?.rotation) leg.rotation.x = -HOTDOG_MAX_HIP_BUCKLE * buckle;
  }
  for (const shin of [hotdog.parts.shinL, hotdog.parts.shinR]) {
    if (shin?.rotation) shin.rotation.x = HOTDOG_MAX_KNEE_BUCKLE * buckle;
  }
  hotdog.parts.head.rotation.x = -0.14 * flinch + hit * 0.30 + sag * 0.35;
  hotdog.parts.head.rotation.z = hit * (strikeIndex % 2 ? -0.20 : 0.20);
  /* Hands come up at the blade — guarding on the early strikes, clutching
   * the wounds on the late ones. */
  hotdog.parts.armR.rotation.x = -0.25 * flinch - hit * 0.85 - sag * 0.6;
  hotdog.parts.foreR.rotation.x = -0.3 * flinch - hit * 0.9 - sag * 0.5;
  hotdog.parts.armL.rotation.x = -0.25 * flinch - hit * 0.7 - sag * 0.7;
  hotdog.parts.foreL.rotation.x = -0.3 * flinch - hit * 0.8 - sag * 0.6;
}

/**
 * THE ATTACK'S OWN TIMELINE, published.
 *
 * Owner, 2026-08-19: sync the effects to the animation rather than playing
 * generic impacts independently. So the animation says when, in its own
 * clock, and the runtime hangs sound on these rather than guessing offsets:
 *
 *   cock      the arm starts up over the shoulder -- cloth, the grip shifting
 *   withdraw  the blade starts coming back out of him
 *
 * The impact frame is not in here because it already has a callback of its
 * own (`onImpact`), which is what the gore and the camera shake also ride.
 */
export const HOTDOG_ATTACK_BEATS = Object.freeze(
  Array.from({ length: HOTDOG_ATTACK_HIT_COUNT }, (_, strike) => [
    Object.freeze({ strike: strike + 1, phase: 'cock', at: 0 }),
    Object.freeze({ strike: strike + 1, phase: 'withdraw', at: HOTDOG_ATTACK_IMPACT + 0.09 }),
  ]).flat(),
);

const STRIKE_INTERVAL = HOTDOG_ATTACK_RECOVERY + HOTDOG_ATTACK_GAP;

/** When one published beat happens, in the controller's own elapsed seconds. */
function beatTime(index) {
  const beat = HOTDOG_ATTACK_BEATS[index];
  return (beat.strike - 1) * STRIKE_INTERVAL + beat.at;
}

/**
 * A one-shot four-hit attack controller.  `update()` must run after both Npc
 * instances have finished their normal update so the authored pose is not
 * overwritten by the generic stand animation.
 */
export function createHotDogAttack({
  ape, hotdog, knife = null, onImpact = null, onPhase = null, onComplete = null,
} = {}) {
  if (!ape?.parts || !hotdog?.parts) throw new TypeError('HotDog attack requires Ape and HotDog Npc rigs');

  let active = false;
  let elapsed = 0;
  let landed = 0;
  let origin = null;
  /* Which animation beats have already been announced, so a frame long enough
   * to cross two of them still fires both, once each, in order. */
  let announced = 0;
  const interval = STRIKE_INTERVAL;

  const finish = () => {
    active = false;
    onComplete?.({ hits: landed });
  };

  return {
    get active() { return active; },
    get landed() { return landed; },
    get announced() { return announced; },

    start() {
      if (active) return false;
      active = true;
      elapsed = 0;
      landed = 0;
      announced = 0;
      origin = { x: hotdog.group.position.x, z: hotdog.group.position.z };
      ape.route = null;
      ape.job = 'stand';
      hotdog.route = null;
      hotdog.job = 'stand';
      if (knife) knife.visible = true;
      return true;
    },

    update(dt) {
      if (!active) return false;
      elapsed += Math.max(0, dt || 0);
      const strikeIndex = Math.min(HOTDOG_ATTACK_HIT_COUNT - 1, Math.floor(elapsed / interval));
      const localTime = elapsed - strikeIndex * interval;
      poseApeStrike(ape, knife, localTime, strikeIndex);
      poseHotDogRecoil(hotdog, origin, localTime, strikeIndex);

      /* The non-impact beats, announced off the SAME clock the pose is read
       * from rather than off a timer running beside it. `cock` is the frame
       * the arm starts up; `withdraw` is the frame he starts pulling the
       * blade back out. Sound hung on these lands on the animation instead of
       * beside it (owner, 2026-08-19: sync the effects to the animation). */
      while (announced < HOTDOG_ATTACK_BEATS.length
        && elapsed >= beatTime(announced)) {
        const beat = HOTDOG_ATTACK_BEATS[announced];
        announced += 1;
        onPhase?.({ ...beat, elapsed });
      }

      while (landed < HOTDOG_ATTACK_HIT_COUNT
        && elapsed >= landed * interval + HOTDOG_ATTACK_IMPACT) {
        landed += 1;
        const final = landed === HOTDOG_ATTACK_HIT_COUNT;
        onImpact?.({ hit: landed, final, elapsed });
        if (final) {
          /* The last withdraw happens 0.09s AFTER the last impact, which is
           * 0.09s after this controller stops -- so without this it was the
           * one beat in the table that could never fire, and the blade came
           * out of him in silence. Flush it on the way out: he pulls it back
           * and the man goes down, which is the same frame. */
          while (announced < HOTDOG_ATTACK_BEATS.length) {
            const beat = HOTDOG_ATTACK_BEATS[announced];
            announced += 1;
            onPhase?.({ ...beat, elapsed });
          }
          finish();
          return true;
        }
      }
      return false;
    },
  };
}

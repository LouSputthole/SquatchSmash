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
export const HOTDOG_ATTACK_WINDUP = 0.18;
export const HOTDOG_ATTACK_IMPACT = 0.26;
export const HOTDOG_ATTACK_RECOVERY = 0.50;
export const HOTDOG_ATTACK_GAP = 0.12;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function poseApeStrike(ape, knife, localTime, strikeIndex) {
  const windup = clamp01(localTime / HOTDOG_ATTACK_WINDUP);
  const strike = clamp01((localTime - HOTDOG_ATTACK_WINDUP)
    / (HOTDOG_ATTACK_IMPACT - HOTDOG_ATTACK_WINDUP));
  const recover = clamp01((localTime - HOTDOG_ATTACK_IMPACT)
    / (HOTDOG_ATTACK_RECOVERY - HOTDOG_ATTACK_IMPACT));
  const followThrough = strike * (1 - recover);
  const cocked = windup * (1 - strike);
  const alternating = strikeIndex % 2 === 0 ? 1 : -1;

  ape.parts.body.rotation.z = -0.08 * cocked + 0.09 * followThrough;
  ape.parts.head.rotation.x = -0.05 - followThrough * 0.09;
  ape.parts.armR.rotation.x = -0.30 - cocked * 1.02 - followThrough * 1.22;
  ape.parts.foreR.rotation.x = -0.46 - cocked * 0.82 - followThrough * 0.52;
  ape.parts.armR.rotation.z = 0.08 * alternating + cocked * 0.22;
  ape.parts.armL.rotation.x = -0.20 + cocked * 0.38 - followThrough * 0.22;
  ape.parts.foreL.rotation.x = -0.45 + cocked * 0.20;

  if (knife) {
    knife.visible = true;
    knife.rotation.x = -0.32 - cocked * 0.55 + followThrough * 0.34;
    knife.rotation.z = 0.18 + alternating * 0.12;
  }
}

function poseHotDogRecoil(hotdog, origin, localTime, strikeIndex) {
  const recoil = clamp01((localTime - HOTDOG_ATTACK_WINDUP)
    / (HOTDOG_ATTACK_RECOVERY - HOTDOG_ATTACK_WINDUP));
  const hit = Math.sin(recoil * Math.PI);
  hotdog.group.position.x = origin.x - hit * (0.07 + strikeIndex * 0.018);
  hotdog.group.position.z = origin.z - hit * 0.035;
  hotdog.parts.body.rotation.z = hit * (strikeIndex % 2 ? 0.11 : -0.11);
  hotdog.parts.head.rotation.z = hit * (strikeIndex % 2 ? -0.18 : 0.18);
}

/**
 * A one-shot four-hit attack controller.  `update()` must run after both Npc
 * instances have finished their normal update so the authored pose is not
 * overwritten by the generic stand animation.
 */
export function createHotDogAttack({ ape, hotdog, knife = null, onImpact = null, onComplete = null } = {}) {
  if (!ape?.parts || !hotdog?.parts) throw new TypeError('HotDog attack requires Ape and HotDog Npc rigs');

  let active = false;
  let elapsed = 0;
  let landed = 0;
  let origin = null;
  const interval = HOTDOG_ATTACK_RECOVERY + HOTDOG_ATTACK_GAP;

  const finish = () => {
    active = false;
    onComplete?.({ hits: landed });
  };

  return {
    get active() { return active; },
    get landed() { return landed; },

    start() {
      if (active) return false;
      active = true;
      elapsed = 0;
      landed = 0;
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

      while (landed < HOTDOG_ATTACK_HIT_COUNT
        && elapsed >= landed * interval + HOTDOG_ATTACK_IMPACT) {
        landed += 1;
        const final = landed === HOTDOG_ATTACK_HIT_COUNT;
        onImpact?.({ hit: landed, final, elapsed });
        if (final) {
          finish();
          return true;
        }
      }
      return false;
    },
  };
}

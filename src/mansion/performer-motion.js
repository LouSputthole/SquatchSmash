/**
 * Fixture-specific living motion for the Mansion's reused Bada Bing cast.
 *
 * `Npc` supplies the common body and ordinary standing/sitting animation. A
 * woman shoulder-deep in a pool is neither: planting that standing rig below
 * the waterline reads as a statue. Likewise, a club performer in a hot tub or
 * reclined on a chaise needs a bounded social/rest pose, not the same neutral
 * chair loop as a man at the dining table.
 *
 * These controllers run after `Npc.update`, author every transform they own
 * from a clock (never by accumulation), and never alter a measured seat Y.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createPoolTreadingMotion(npc, {
  water,
  waterY,
  phase = 0,
  margin = 0.55,
} = {}) {
  if (!npc?.group || !npc?.parts || !water || !Number.isFinite(waterY)) return null;
  const origin = {
    x: npc.group.position.x,
    y: npc.group.position.y,
    z: npc.group.position.z,
  };
  let time = 0;

  return Object.freeze({
    id: 'treading',
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) time += dt;
      const t = time + phase;
      const scull = Math.sin(t * 2.15);
      const opposite = Math.sin(t * 2.15 + Math.PI);
      npc.group.position.x = clamp(
        origin.x + Math.sin(t * 0.46) * 0.34,
        water.x0 + margin,
        water.x1 - margin,
      );
      npc.group.position.z = clamp(
        origin.z + Math.sin(t * 0.33 + 1.1) * 0.28,
        water.z0 + margin,
        water.z1 - margin,
      );
      npc.group.position.y = origin.y
        + Math.sin(t * 1.7) * 0.035
        + Math.sin(t * 3.4 + 0.6) * 0.009;

      npc.parts.body.rotation.x = 0.045 + Math.sin(t * 0.75) * 0.018;
      npc.parts.body.rotation.z = Math.sin(t * 0.62) * 0.035;
      npc.parts.head.rotation.x = -0.025 + Math.sin(t * 0.85 + 0.4) * 0.025;
      npc.parts.head.rotation.z = -npc.parts.body.rotation.z * 0.55;
      npc.parts.armL.rotation.set(-0.46 + scull * 0.12, 0.12, -0.72 - scull * 0.14);
      npc.parts.armR.rotation.set(-0.46 + opposite * 0.12, -0.12, 0.72 + opposite * 0.14);
      npc.parts.foreL.rotation.set(-0.48 - scull * 0.22, 0, -0.08);
      npc.parts.foreR.rotation.set(-0.48 - opposite * 0.22, 0, 0.08);
      /* The kick is mostly below the surface, but it stops the lower body from
       * remaining the unmistakable straight-leg standing silhouette. */
      npc.parts.legL.rotation.x = 0.12 + Math.sin(t * 2.5) * 0.16;
      npc.parts.legR.rotation.x = 0.12 + Math.sin(t * 2.5 + Math.PI) * 0.16;
      npc.parts.shinL.rotation.x = Math.max(0, -Math.sin(t * 2.5)) * 0.18;
      npc.parts.shinR.rotation.x = Math.max(0, Math.sin(t * 2.5)) * 0.18;
    },
    get snapshot() {
      return {
        motion: 'treading',
        time,
        x: npc.group.position.x,
        y: npc.group.position.y,
        z: npc.group.position.z,
      };
    },
  });
}

export function createSeatedPerformerMotion(npc, {
  kind = 'recliner',
  phase = 0,
} = {}) {
  if (!npc?.group || !npc?.parts) return null;
  /* The Mansion's measured seat pass runs after the cast is constructed. Take
   * the authoritative Y on the first update, after that pass, not here. */
  let seatY = null;
  let time = 0;

  return Object.freeze({
    id: kind === 'tub' ? 'seated-social' : 'reclined-rest',
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) time += dt;
      const t = time + phase;
      seatY ??= npc.group.position.y;
      npc.group.position.y = seatY;
      if (kind === 'tub') {
        const gesture = Math.sin(t * 0.78);
        npc.parts.body.rotation.x = -0.035 + Math.sin(t * 0.54) * 0.02;
        npc.parts.body.rotation.z = gesture * 0.038;
        npc.parts.head.rotation.x = 0.035 + Math.sin(t * 0.66 + 0.8) * 0.025;
        npc.parts.head.rotation.z = -gesture * 0.7;
        npc.parts.armL.rotation.set(-0.44 + gesture * 0.05, 0, -0.28);
        npc.parts.armR.rotation.set(-0.52 - gesture * 0.14, 0, 0.36 + gesture * 0.08);
        npc.parts.foreL.rotation.set(-0.58, 0, -0.04);
        npc.parts.foreR.rotation.set(-0.72 - gesture * 0.16, 0, 0.06);
        return;
      }

      /* Five seconds is an exact rest cycle. Existing stability checks sample
       * ten seconds apart, so they still prove the pose does not accumulate
       * while intermediate samples prove she is alive. */
      const rest = Math.sin(t * ((Math.PI * 2) / 5));
      npc.parts.body.rotation.x = -0.46 + rest * 0.012;
      npc.parts.body.rotation.z = rest * 0.018;
      npc.parts.head.rotation.x = 0.2 + rest * 0.022;
      npc.parts.head.rotation.z = -rest * 0.014;
      npc.parts.armL.rotation.set(-0.28 + rest * 0.025, 0, -0.28);
      npc.parts.armR.rotation.set(-0.28 - rest * 0.025, 0, 0.28);
    },
    get snapshot() {
      return {
        motion: kind === 'tub' ? 'seated-social' : 'reclined-rest',
        time,
        y: npc.group.position.y,
      };
    },
  });
}

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

/**
 * Height of the pelvis in the figure's own body-local frame.
 *
 * `src/bing/cast.js` builds the hip slab at `pos: [0, 1.0, 0]` inside the
 * `body` group, and `g.scale` carries height, so this is 1.0 for everybody on
 * the roster. Named here because the recline below is arithmetic about it, and
 * a magic 1.0 in that arithmetic is a number nobody could check.
 */
const BODY_HIP_Y = 1.0;

/**
 * Lean the torso back about the HIP rather than about the feet.
 *
 * OWNER PLAYTEST, TWICE: *"Girls on chairs legs are detached from body."*
 *
 * They were, and by 44 centimetres. The `body` group's origin is the figure's
 * own base -- the floor between her feet -- so `body.rotation.x = -0.46` does
 * not lean her back in a chair, it rotates her whole torso about her ANKLES.
 * The pelvis rides at body-local y 1.0, so 0.46 rad takes it 1.0 * sin(0.46) =
 * 0.444 m backwards and 1.0 * (1 - cos 0.46) = 0.104 m down. The legs are
 * SIBLINGS of `body`, not children of it, and they stayed exactly where they
 * were. Half a metre of daylight between her hips and her thighs.
 *
 * Rotating about the hip instead is one translation: put the body back where
 * the rotation took the hip from. After a rotation of `pitch` about X, the
 * point (0, HIP, 0) lands at (0, HIP*cos, HIP*sin), so adding
 * (0, HIP*(1-cos), -HIP*sin) returns it. Exact at every angle, so the pose
 * cannot drift as the rest cycle breathes.
 *
 * `_neutralPose()` in the shared Npc rig zeroes `body.position.x` and `.z`
 * every frame but NOT `.y`, which is why this writes all three rather than
 * only the two that move: an unwritten `.y` would accumulate.
 */
export function reclineTorsoAboutHip(npc, pitch, roll = 0) {
  const body = npc?.parts?.body;
  if (!body) return;
  body.rotation.x = pitch;
  body.rotation.z = roll;
  body.position.x = 0;
  body.position.y = BODY_HIP_Y * (1 - Math.cos(pitch));
  body.position.z = -BODY_HIP_Y * Math.sin(pitch);
}

/* ---------------------------------------------------------------------- */
/* THE DRESS BEAT'S POSE                                                    */
/* ---------------------------------------------------------------------- */

/**
 * Measured off `src/bing/cast.js`'s rig, not guessed, because every number
 * below is an arithmetic consequence of one of them:
 *
 *   hip pivot        y 0.922   `STANDING_LEG_ROOT_Y`
 *   thigh            0.44      `leg()`'s slab, and the knee group at -0.44
 *   knee cap slab    0.11 tall, 0.188 deep -- once the shin folds back the
 *                              DEEP dimension is the vertical one
 *   shin             0.42
 *   shoulder pivot   y 1.44    `arm()`
 *   upper arm 0.30 + forearm 0.27 = 0.57 of reach from the shoulder
 */
/* MEASURED ON THE BUILT FIGURE, by sweeping the fold and reading the lowest
 * mesh back, because the rig has no ankle: the shoe is a child of the shin, so
 * how far the shin folds decides where the foot ends up and there is nothing to
 * correct it with. At 1.55 the shin lies flat and the shoe hangs 110 mm THROUGH
 * the deck; the knee is only 6 mm under at the same drop, so the sole is the
 * whole problem. At 1.80 the fold carries the foot clear and the knee becomes
 * the lowest thing on her, 15 mm under -- which the drop below takes out.
 * Everything then lands within 2 mm of the deck: knees on it, hands on it,
 * nothing through it. */
const KNEE_DROP = 0.375;
const SHIN_FOLD = 1.80;
const TORSO_PITCH = 1.50;

/**
 * Hands and knees.
 *
 * OWNER PLAYTEST, verbatim: *"Need to fix the dress fix scene, they need to
 * get on all fours."*
 *
 * The beat used to play with the performer in her sun-lounger recline, which
 * is a pose for lying back on a chair and reads as nothing else. This is the
 * pose the beat is actually about, built from the rig it has rather than from
 * a new one:
 *
 *   - The figure DROPS 0.375 m, and the shins fold 1.80 rather than the 1.55
 *     that lays them flat -- both numbers measured on the built body rather
 *     than derived, for the reason at KNEE_DROP: this rig has no ankle joint.
 *   - Thighs vertical (hip 0), shins folded back along the floor.
 *   - The torso pitches 1.50 forward ABOUT THE HIP -- see
 *     `reclineTorsoAboutHip`, and note that doing this with a bare
 *     `body.rotation.x` would swing her pelvis a metre through the deck,
 *     since that group's origin is the floor between her feet.
 *   - Arms counter-rotate the torso exactly, so they hang vertically from a
 *     shoulder the pitch has brought down to 0.61 + 0.44*cos(1.50) = 0.64.
 *     0.57 of arm plus the hand slab reaches the deck from there.
 *   - The head counter-rotates most of the pitch back off, so she is looking
 *     along the deck rather than straight down at it.
 *
 * Every value is written, none accumulated, so this is safe to call once a
 * frame for as long as the beat runs.
 *
 * @param {object} npc     an Npc from src/bing/cast.js
 * @param {number} floorY  the deck she is on, in the npc's parent frame
 */
export function poseAllFours(npc, floorY) {
  const parts = npc?.parts;
  if (!parts || !Number.isFinite(floorY)) return;
  const scale = parts.heightScale ?? 1;
  npc.group.position.y = floorY - KNEE_DROP * scale;

  parts.legL.position.y = 0.922;
  parts.legR.position.y = 0.922;
  parts.legL.rotation.x = 0;
  parts.legR.rotation.x = 0;
  parts.shinL.rotation.x = SHIN_FOLD;
  parts.shinR.rotation.x = SHIN_FOLD;

  reclineTorsoAboutHip(npc, TORSO_PITCH);

  /* Straight down, and a little outboard so the hands land wider than the
   * shoulders -- which is where a person puts them. */
  parts.armL.rotation.set(-TORSO_PITCH, 0, -0.14);
  parts.armR.rotation.set(-TORSO_PITCH, 0, 0.14);
  parts.foreL.rotation.set(0.06, 0, 0);
  parts.foreR.rotation.set(0.06, 0, 0);

  parts.head.rotation.x = -TORSO_PITCH + 0.35;
  parts.head.rotation.z = 0;
}

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

/**
 * A man at a LAN station (owner note, 2026-08-19: Shubes, on RuneScape, all
 * evening). The neutral chair loop reads as a passenger; a man at a mouse is
 * hunched at the desk, and every so often his mouse hand goes -- a burst of
 * small flicks, with a slow lean toward the screen underneath it. Same
 * contract as the two controllers above: clock-authored, never accumulates,
 * never touches the measured seat Y, allocates nothing per frame.
 */
export function createLanGamerMotion(npc, {
  phase = 0,
} = {}) {
  if (!npc?.group || !npc?.parts) return null;
  /* The Mansion's measured seat pass runs after the cast is constructed. Take
   * the authoritative Y on the first update, after that pass, not here. */
  let seatY = null;
  let time = 0;

  return Object.freeze({
    id: 'lan-gamer',
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) time += dt;
      const t = time + phase;
      seatY ??= npc.group.position.y;
      npc.group.position.y = seatY;

      /* The flick envelope: mostly still, then a two-ish-second burst every
       * ten seconds or so. sin^6 keeps the rest phase genuinely at rest. */
      const gate = Math.max(0, Math.sin(t * 0.6));
      const burst = gate * gate * gate * gate * gate * gate;
      const flick = Math.sin(t * 9.7) * burst;
      const lean = Math.sin(t * 0.17);

      npc.parts.body.rotation.x = 0.14 + lean * 0.045;
      npc.parts.body.rotation.z = Math.sin(t * 0.23) * 0.015;
      npc.parts.head.rotation.x = -0.06 + lean * 0.03;
      npc.parts.head.rotation.z = Math.sin(t * 0.41) * 0.02;
      /* Left hand parked on the keys; right hand on the mouse, where the
       * burst lands. */
      npc.parts.armL.rotation.set(-0.60, 0.10, -0.18);
      npc.parts.foreL.rotation.set(-0.56, 0, -0.05);
      npc.parts.armR.rotation.set(-0.58 + flick * 0.03, -0.12, 0.16 + flick * 0.05);
      npc.parts.foreR.rotation.set(-0.50 + flick * 0.10, 0, 0.05);
    },
    /* The hunch pitches the body ~0.18 rad, which swings the measured hips
     * box ~4 cm below its upright height — so the seat correction must run
     * AGAINST THE HUNCHED POSE and then re-pin this motion's held Y. The
     * stager poses one update, corrects, and calls this. */
    rebaseSeatY() { seatY = null; },
    get snapshot() {
      return {
        motion: 'lan-gamer',
        time,
        y: npc.group.position.y,
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
        /* The same hip-anchored lean. It is only 0.035 rad here, so it costs
         * her 35 mm rather than 440 -- but a torso that pivots at the ankles
         * is wrong at every angle, not only the big ones. */
        reclineTorsoAboutHip(npc, -0.035 + Math.sin(t * 0.54) * 0.02, gesture * 0.038);
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
      reclineTorsoAboutHip(npc, -0.46 + rest * 0.012, rest * 0.018);
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

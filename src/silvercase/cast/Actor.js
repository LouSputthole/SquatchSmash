import * as THREE from 'three';
import { Npc } from '../../bing/cast.js';
import {
  applyConnectedDeathPivot,
  beginDeathTransition,
  restoreDeathTransition,
} from '../../core/death-transition.js';
import { coarseActorRole, markActor, setActorPosture } from '../../core/staging.js';

/**
 * A small humanoid actor: a canonical `Npc` body (src/bing/cast.js, built on
 * `makePerson`) plus the hp/faction/death bookkeeping the mission's cast
 * needs.
 *
 * The body used to be `core/person.js`'s `Person`, which is the Sasquatch
 * Smash rig — a 2.6 m frame with no height or build sliders. Five of those in
 * a 2.6 m-ceiling apartment is what "the scale on the characters are
 * completely off" was: every NPC's head was inside the ceiling and the player
 * stood eye-level with their chests. `Npc`/`makePerson` is the figure the
 * Bing, the Silver Room, the graveyard and Silver Pines all use, it is built
 * on a 1.78 m frame and scaled to a real `height`, and it is the only builder
 * that can be handed `APE_FAMILY_MEMBER.model` directly. See ./ape.js.
 *
 * Behaviour still comes from `Npc` (breathing, gaze, the seated and folded
 * poses, the arm/ribcage guard); this class adds only the three things the
 * Bing never needed:
 *
 *   - damage(amount, fromX, fromZ) — combat resolution, for the couch/chair
 *     targets and the bathroom gunman ONLY. Never call this on Ape.
 *   - kill({scripted}) — a directed narrative beat (Ape's own scripted
 *     "death" on mission failure, or any other authored execution). Skips
 *     faction/hostile checks entirely; it isn't combat, it's the story
 *     deciding something happened.
 *   - a body that STAYS WHERE IT DIED. `Npc.update()` rewrites the pose every
 *     frame, so a corpse has to stop being updated; and a man shot sitting
 *     down slumps into the furniture rather than sinking through it to the
 *     floor, which is what the couch used to do.
 */

/** 0.6–0.9s per the brief; splits the difference. */
const COLLAPSE_TIME = 0.75;
/** ApartmentScene.js: "Floor is y=0 throughout". */
const FLOOR_Y = 0;

function monotonicSeconds() {
  return (globalThis.performance?.now?.() ?? Date.now()) / 1000;
}

/**
 * How a body comes to rest. Two shapes, because a man falls very differently
 * depending on whether his weight was on his feet or in a chair.
 *
 * **standing** topples the whole figure. `pitch` rotates about WORLD x
 * (three.js applies Euler XYZ as RX·RY·RZ, so `rotation.x` is outermost and
 * heading-independent) and is signed — positive tips the figure toward +z.
 * `roll` is `rotation.z`, innermost, and therefore a roll about the figure's
 * OWN forward axis. `lift` raises the figure's origin as it goes over, because
 * rotating a body about a point on the floor otherwise buries half its
 * thickness in it.
 *
 * **seated** is the one the owner's note is about: *the dead guy on the couch
 * stays on the couch*. Nothing about the figure's world transform moves — the
 * hips stay in the cushion where `Npc.sit()` put them — and the death happens
 * entirely in the upper body: the trunk goes over sideways and forward, the
 * head drops, the arms let go. A slumped man, not a toppled statue.
 */
export const COLLAPSE = Object.freeze({
  /** Toppled full length onto the floor. */
  standing: Object.freeze({
    seat: false, pitch: Math.PI / 2 - 0.1, roll: 0.1, lift: 0.26, slideX: 0, slideZ: 0,
  }),
  /** Slumped in the seat he was sitting in. Never reaches the floor. */
  seated: Object.freeze({
    seat: true, bodyPitch: 0.3, bodyRoll: 0.42, sink: 0.045, slideX: 0, slideZ: 0,
  }),
});

function smooth(k) {
  return k * k * (3 - 2 * k);
}

/**
 * WHERE THIS RIG'S EYES AND HIPS ACTUALLY ARE, per unit of `heightScale`.
 *
 * Measured on the built figure over model heights 1.66..2.00 m: the head
 * centre lands on 1.637 x heightScale and the hip centre on 1.000 x
 * heightScale, linear in both. The staging marker's defaults are 2.30 and
 * 1.16, which are `core/person.js`'s SASQUATCH -- the same 2.6 m rig whose
 * heads were inside this flat's ceiling before the cast moved to `makePerson`
 * (see this file's opening note). Handing the gate those numbers would put
 * every eye ray half a metre above the head it belongs to, so the marker
 * declares the real ones the same way a rig facing another way declares
 * `faceAxis`.
 */
const EYE_PER_SCALE = 1.637;
const HIP_PER_SCALE = 1.000;

/**
 * The mission's own words for who somebody is, in the gate's vocabulary.
 *
 * Faction is what this scene already sorts people by, so faction is what the
 * marker translates -- through `coarseActorRole`, never straight into
 * `markActor`, which validates strictly and throws on a word it does not know
 * (that is how a role of 'performer' once took the Bing build down; see
 * ACTOR_ROLE_FOR_SCENE_ROLE). Ape is Family and on the errand with you; the
 * men in the flat are the other side of the deal until the bathroom door
 * opens.
 */
const SCENE_ROLE_FOR_FACTION = Object.freeze({
  friendly: 'family_member',
  neutral: 'seller',
  hostile: 'enemy',
});

/**
 * Stamp one built figure for the staging gate. docs/STAGING-GATE.md.
 *
 * The id is AUTHORED and passed in rather than taken from the display name:
 * ids end up in allowlists, and this mission builds two Apes -- one at the
 * wheel and one in the corridor -- which is precisely the duplicate the gate
 * reported (ACTOR_ID_DUPLICATE, six states of it) when both took their id from
 * the same name.
 */
export function markSilverCaseActor(npc, { id, faction = 'neutral', posture, seat }) {
  const pose = posture ?? (npc.seated ? 'sit' : 'stand');
  markActor(npc.group, {
    id,
    role: coarseActorRole(SCENE_ROLE_FOR_FACTION[faction] ?? faction),
    posture: pose,
    eyeHeight: EYE_PER_SCALE * npc.parts.heightScale,
    hipHeight: HIP_PER_SCALE * npc.parts.heightScale,
    /* The furniture is named rather than sniffed for, so a couch renamed out
     * from under the man sitting on it reports SEAT_MISSING instead of
     * passing quietly. */
    ...(seat ? { seat } : {}),
  });
  /* `Npc` moves the live posture every time it sits somebody down, and it
   * already did so in its own constructor, before this mark. Say it again on
   * the live field or an authored `ride` is quietly overruled by the `sit` the
   * rig set on the way in. */
  setActorPosture(npc.group, pose);
  return npc;
}

export class Actor {
  constructor({
    name = '', faction = 'neutral', hp = 100, npc, collapse = COLLAPSE.standing,
    characterId = null, pose = null,
  } = {}) {
    this.name = name;
    this.characterId = characterId;
    this.npc = npc;
    /** The `makePerson` part table — head, body, arms, forearms, legs, shins. */
    this.parts = npc.parts;
    this.group = npc.group;

    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
    this.downT = -1; // ragdoll collapse timer; -1 until death starts
    this.collapse = { ...COLLAPSE.standing, ...collapse };

    /**
     * An optional per-frame pose applied AFTER `Npc.update()`. Npc zeroes the
     * arm, forearm and head rotations at the top of every one of its own
     * updates — that is what stops a raised arm sticking forever — so a
     * mission-authored pose (the bathroom man's drawn revolver) has to be
     * re-applied downstream of it rather than set once at build time.
     */
    this.pose = pose;

    /** Where the body was standing/sitting when it was hit. */
    this._rest = {
      x: npc.group.position.x, y: npc.group.position.y, z: npc.group.position.z,
    };
    this._spawn = { ...this._rest, yaw: npc.group.rotation.y, baseY: npc.baseY };
    this._deathBounds = new THREE.Box3();
    this._deathPartBounds = new THREE.Box3();
    this._settled = false;
    this.reaction = null;
    this.tension = null;

    this.faction = faction; // 'hostile' | 'friendly' | 'neutral'

    // Locked exactly like Motel's Snow (src/motel/actors.js): the setter
    // itself refuses to arm a "friendly" actor, no matter what later code
    // tries to set it to — Ape (and any other friendly cast member) is
    // structurally unkillable-by-combat because he can never become
    // hostile, not because some call site remembers to check first.
    this._hostile = false;
    Object.defineProperty(this, 'hostile', {
      enumerable: true,
      configurable: false,
      get: () => this._hostile,
      set: (value) => {
        this._hostile = this.faction === 'friendly' ? false : Boolean(value);
      },
    });
    this.hostile = faction === 'hostile';
  }

  /** Kept for the mission's own reads; `Npc` calls the same object `parts`. */
  get person() {
    return this.npc.parts;
  }

  get seated() {
    return this.npc.job === 'sit' || this.npc.job === 'drink';
  }

  /** Immediate authored shock that remains downstream of Npc's pose reset. */
  startle({ shooter = null, body = null, duration = 1.8, stepDistance = 0.18 } = {}) {
    if (!this.alive) return false;
    const origin = this.group.position.clone();
    const away = new THREE.Vector3();
    if (shooter) away.set(origin.x - shooter.x, 0, origin.z - shooter.z);
    if (away.lengthSq() < 1e-6) {
      // Actor heading is +z at yaw 0; its local backward is therefore -z.
      away.set(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
    }
    away.normalize();
    this.reaction = {
      elapsed: 0,
      duration: Math.max(0.2, Number(duration) || 1.8),
      shooter: shooter?.clone?.() ?? null,
      body: body?.clone?.() ?? null,
      origin,
      away,
      stepDistance: THREE.MathUtils.clamp(Number(stepDistance) || 0.18, 0.08, 0.32),
    };
    return true;
  }

  _updateReaction(dt) {
    const reaction = this.reaction;
    if (!reaction) return;
    reaction.elapsed += dt;
    const progress = Math.min(1, reaction.elapsed / reaction.duration);
    const flinch = Math.sin(Math.PI * progress);
    /* Move the complete figure, never an upper-body branch. Chester is seated,
     * so this reads as the chair-side equivalent of a startled backward step:
     * his pelvis, legs, torso and head all recoil together and land at the new
     * position instead of the old split-rig illusion. */
    const step = smooth(Math.min(1, progress / 0.42)) * reaction.stepDistance;
    this.group.position.x = reaction.origin.x + reaction.away.x * step;
    this.group.position.z = reaction.origin.z + reaction.away.z * step;
    const target = progress < 0.42 ? reaction.shooter : reaction.body;
    if (target) {
      const yaw = Math.atan2(
        target.x - this.group.position.x,
        target.z - this.group.position.z,
      ) - this.group.rotation.y;
      this.parts.head.rotation.y = THREE.MathUtils.clamp(yaw, -0.8, 0.8);
    }
    this.parts.head.rotation.x = -0.16 * flinch;
    this.parts.armL.rotation.x = -0.5 * flinch;
    this.parts.armR.rotation.x = -0.42 * flinch;
    this.parts.foreL.rotation.x = -0.35 * flinch;
    this.parts.foreR.rotation.x = -0.28 * flinch;
    this.parts.torsoWrap.rotation.x = -0.10 * flinch;
    this.parts.torsoWrap.rotation.z = 0.08 * flinch;
    if (progress >= 1) {
      this.parts.torsoWrap.rotation.set(0, 0, 0);
      this.reaction = null;
    }
  }

  /**
   * Keep the last-survivor choice visibly and audibly alive. The clock is
   * injectable for deterministic tests, but production defaults to monotonic
   * wall time so a slow renderer cannot turn a 27-second decision into two
   * seconds of animation and one stale pose.
   */
  startTension({ now = monotonicSeconds, pulseSeconds = 4.5, onPulse = null } = {}) {
    if (!this.alive) return false;
    const clock = typeof now === 'function' ? now : monotonicSeconds;
    this.tension = {
      active: true,
      now: clock,
      startedAt: clock(),
      elapsed: 0,
      updates: 0,
      motion: 0,
      pulses: 0,
      ambientReceipts: 0,
      pulseSeconds: Math.max(1, Number(pulseSeconds) || 4.5),
      nextPulseAt: Math.max(1, Number(pulseSeconds) || 4.5),
      onPulse: typeof onPulse === 'function' ? onPulse : null,
      lastPose: 0,
    };
    return true;
  }

  _updateTension(dt) {
    const tension = this.tension;
    if (!tension?.active) return;
    const wallElapsed = Math.max(0, tension.now() - tension.startedAt);
    tension.elapsed = Math.max(tension.elapsed + Math.max(0, Number(dt) || 0), wallElapsed);
    tension.updates += 1;

    const pose = Math.sin(tension.elapsed * 1.9);
    const brace = 0.04 * (0.5 + 0.5 * Math.sin(tension.elapsed * 1.17 + 0.6));
    this.parts.head.rotation.z = pose * 0.035;
    this.parts.torsoWrap.rotation.z = pose * 0.012;
    this.parts.armL.rotation.x -= 0.10 + brace;
    this.parts.armR.rotation.x -= 0.08 + brace * 0.8;
    this.parts.foreL.rotation.x -= 0.16 + brace;
    this.parts.foreR.rotation.x -= 0.13 + brace * 0.8;
    tension.motion += Math.abs(pose - tension.lastPose);
    tension.lastPose = pose;

    if (tension.elapsed >= tension.nextPulseAt) {
      tension.pulses += 1;
      tension.nextPulseAt += tension.pulseSeconds;
      if (tension.onPulse?.({ elapsed: tension.elapsed, pulse: tension.pulses })) {
        tension.ambientReceipts += 1;
      }
    }
  }

  stopTension() {
    if (!this.tension?.active) return false;
    this.tension.active = false;
    this.parts.head.rotation.z = 0;
    this.parts.torsoWrap.rotation.z = 0;
    return true;
  }

  tensionSnapshot() {
    const tension = this.tension;
    if (!tension) return null;
    return {
      active: tension.active,
      elapsed: +tension.elapsed.toFixed(3),
      updates: tension.updates,
      motion: +tension.motion.toFixed(4),
      pulses: tension.pulses,
      ambientReceipts: tension.ambientReceipts,
      headRoll: +this.parts.head.rotation.z.toFixed(4),
    };
  }

  /**
   * Combat damage — the couch/chair targets and the bathroom gunman only.
   * Never call this on Ape or any other scripted-death target; use kill()
   * for those. Returns true if this hit brought the actor down.
   */
  damage(amount, fromX = this.group.position.x, fromZ = this.group.position.z) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - Math.max(0, Number(amount) || 0));

    const dx = this.group.position.x - fromX;
    const dz = this.group.position.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) {
      // A small cosmetic nudge away from the shot — not a physics push,
      // just enough that a hit reads as a hit.
      this.group.position.x += (dx / d) * 0.05;
      this.group.position.z += (dz / d) * 0.05;
    }

    if (this.hp <= 0) {
      this._startDeath();
      return true;
    }
    return false;
  }

  /**
   * The ONLY way Ape (or any other directed/scripted-death target) should
   * ever die. This is a narrative beat, not combat resolution: it does not
   * consult faction or hostile at all, and it works even on a "friendly"
   * actor whose hostile flag can never be set — that lock is what keeps Ape
   * safe from the player's own fire-resolution code path; it says nothing
   * about the mission FSM directing his death on purpose.
   */
  kill({ scripted = true } = {}) {
    void scripted;
    if (!this.alive) return;
    this.hp = 0;
    this._startDeath();
  }

  _startDeath() {
    this.alive = false;
    this.downT = 0;
    this._settled = false;
    /* The gate is told what the body is DOING, not just where it is: a man
     * shot in a chair is still sitting in it (COLLAPSE.seated never leaves
     * the furniture) and a man shot on his feet ends up on the floor. */
    this._deathTransition = beginDeathTransition(this.group, {
      mode: this.collapse.seat ? 'seated' : 'standing',
      pivot: this.collapse.seat ? this.parts.hips : null,
      stop: [() => this.npc.hush?.()],
    });
    this._rest = {
      x: this.group.position.x, y: this.group.position.y, z: this.group.position.z,
    };
    this._restY = this.collapse.seat
      ? this._rest.y - (this.collapse.sink ?? 0)
      : FLOOR_Y + (this.collapse.lift ?? 0);
    this._deadPose();
  }

  /**
   * The limbs a body keeps forever. Applied exactly once, at death, because
   * from this frame on `Npc.update()` is never called again for this actor —
   * if it were, it would zero all of this on the next tick and the corpse
   * would go back to breathing. The trunk and head are animated instead (see
   * update()), so the collapse reads as a fall rather than a cut.
   */
  _deadPose() {
    const p = this.parts;
    const side = Math.sign(this.collapse.bodyRoll ?? this.collapse.roll ?? 1) || 1;
    p.armL.rotation.set(0.16, 0, -0.36);
    p.armR.rotation.set(0.1, 0, 0.38);
    p.foreL.rotation.set(-0.2, 0, 0);
    p.foreR.rotation.set(-0.3, 0, 0);
    if (this.collapse.seat) {
      // Still folded into the seat, one knee falling open.
      p.legR.rotation.z = 0.2 * side;
      p.shinR.rotation.x = 1.2;
      p.legL.rotation.z = -0.08 * side;
    } else {
      // Toppling full length: the legs come out of any stance and go straight.
      p.legL.rotation.set(0.06, 0, 0);
      p.legR.rotation.set(-0.12, 0, 0.1);
      p.shinL.rotation.set(0.16, 0, 0);
      p.shinR.rotation.set(0.05, 0, 0);
    }
    /* Breathing belongs to the neutral wrapper in the shared figure rig.
     * The ribcage mesh encodes its authored dimensions in `scale` and no
     * longer carries the old `userData.base`; reset the wrapper so the body
     * does not freeze halfway through a breath. */
    p.torsoWrap.scale.set(1, 1, 1);
    p.mouth.scale.copy(p.mouth.userData.base);
  }

  /**
   * Living actors are driven by `Npc`; dead ones are driven by the collapse
   * below and by nothing else, which is the whole reason a body stays put.
   */
  update(dt, playerPos = null) {
    if (this.alive) {
      this.npc.update(dt, playerPos);
      this.pose?.(this.parts, this.npc);
      this._updateReaction(dt);
      this._updateTension(dt);
      return;
    }
    if (this.downT < 0 || this._settled) return;
    this.downT += dt;
    const k = smooth(Math.min(1, this.downT / COLLAPSE_TIME));
    const c = this.collapse;
    const p = this.parts;

    if (c.seat) {
      // Rotate the complete connected figure about the pelvis in the seat.
      const side = Math.sign(c.bodyRoll || 1) || 1;
      p.body.rotation.set(0, 0, 0);
      p.head.rotation.set(0.52 * k, 0.14 * k * side, -0.46 * k * side);
      /* A full 20-30 degree rigid-body rotation around the pelvis keeps the
       * hierarchy connected, but swings folded shins through nearby furniture
       * and can drive a shoulder below the floor.  The whole rig supplies the
       * connection-preserving weight shift; the head and relaxed limbs above
       * provide the readable slump. */
      const connectedTilt = 0.05;
      applyConnectedDeathPivot(this._deathTransition, {
        rotationDelta: {
          x: c.bodyPitch * k * connectedTilt,
          z: c.bodyRoll * k * connectedTilt,
        },
        pivotOffset: { y: -(c.sink ?? 0) * k },
      });
      /* Keep the connected fall honest at floor contact too. Rotating folded
       * legs around the pelvis can put the toe a centimetre under y=0 even
       * while the hips remain correctly planted in the cushion. Clamp the
       * complete rig as one body instead of detaching or re-posing one foot. */
      this.group.updateWorldMatrix(true, true);
      /* Wound decals are children of the body so they follow the collapse,
       * but they are not part of the body's contact hull. Measuring the whole
       * group made an animating `silvercase.mark` lift the corpse by a few
       * millimetres on later frames — the exact slow creep the mission's
       * minutes-later verifier is meant to catch. Union the rendered figure
       * meshes directly so child decals cannot move the actor that owns them. */
      this._deathBounds.makeEmpty();
      this.group.traverse((node) => {
        if (!node.isMesh || node.visible === false || node.name === 'silvercase.mark'
          || !node.geometry) return;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        if (!node.geometry.boundingBox) return;
        this._deathPartBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
        this._deathBounds.union(this._deathPartBounds);
      });
      if (this._deathBounds.min.y < FLOOR_Y) {
        this.group.position.y += FLOOR_Y - this._deathBounds.min.y;
      }
      if (k >= 1) this._settled = true;
      return;
    }

    p.body.rotation.set(0.1 * k, 0, 0);
    p.head.rotation.set(0.3 * k, 0, -0.28 * k);
    this.group.rotation.x = c.pitch * k;
    this.group.rotation.z = c.roll * k;
    this.group.position.set(
      this._rest.x + (c.slideX ?? 0) * k,
      this._rest.y + (this._restY - this._rest.y) * k,
      this._rest.z + (c.slideZ ?? 0) * k,
    );
    if (k >= 1) this._settled = true;
  }

  /**
   * Put a fallen actor back on his feet (or back in his chair) exactly where
   * he started. The mission has one checkpoint and a retry has to undo a
   * death completely, including the pose and the seat drop.
   */
  revive() {
    restoreDeathTransition(this._deathTransition);
    this._deathTransition = null;
    this.hp = this.maxHp;
    this.alive = true;
    this.downT = -1;
    this._settled = false;
    this.group.rotation.set(0, this._spawn.yaw, 0);
    this.group.position.set(this._spawn.x, this._spawn.y, this._spawn.z);
    this.parts.body.rotation.set(0, 0, 0);
    this.parts.head.rotation.set(0, 0, 0);
    for (const limb of [
      this.parts.legL, this.parts.legR, this.parts.shinL, this.parts.shinR,
      this.parts.armL, this.parts.armR, this.parts.foreL, this.parts.foreR,
    ]) limb.rotation.set(0, 0, 0);
    this.npc.baseY = this._spawn.baseY;
    this.npc.targetYaw = undefined;
    this.npc.gaze = 0;
    this.reaction = null;
    this.stopTension();
    this.tension = null;
    this.parts.torsoWrap.rotation.set(0, 0, 0);
    // Rebuild the living pose from scratch: _syncJob only re-poses on a job
    // CHANGE, and the job never changed — only the body did.
    this.npc._lastJob = null;
    this.npc._syncJob(true);
  }
}

/**
 * Builds the canonical figure plus the Actor wrapping it, and places both.
 *
 * `model` is a `makePerson` model row — `height` in real metres, `build`,
 * `dress`, `hair`, `skin`, `beard`, `face`, … — NOT a `core/person.js`
 * palette. `yaw` is the same heading both rigs use (facing =
 * (sin(h), 0, cos(h)), 0 = +z), so ApartmentScene's seat and doorway anchors
 * still feed straight in; its `hallwaySpawn`/`frontDoorInside` anchors are
 * camera yaw and still must not.
 *
 * `actorId` is the handle the staging gate knows this body by, and it is the
 * one field here that must be authored rather than derived -- see
 * `markSilverCaseActor`.
 */
export function makeActor({
  parent, name = '', actorId = '', faction = 'neutral', hp = 100, model = {},
  position = { x: 0, y: 0, z: 0 }, yaw = 0, job = 'stand', tier = 'hero',
  look = true, folded = false, collapse = COLLAPSE.standing, characterId = null,
  pose = null, npc = null, seat,
} = {}) {
  const figure = npc ?? new Npc(parent, {
    name,
    tier,
    job,
    look,
    x: position.x ?? 0,
    y: position.y ?? 0,
    z: position.z ?? 0,
    yaw,
    model: { ...model, castShadow: true },
  });
  figure.folded = folded;
  /* Only a figure THIS call built. A body handed in ready-made (Ape, from
   * ./ape.js) was marked by the builder that owns it, and a second stamp here
   * would be a second authority on one body's id. */
  if (!npc) {
    markSilverCaseActor(figure, {
      id: actorId || name, faction, seat, posture: job === 'sit' ? 'sit' : 'stand',
    });
  }
  const actor = new Actor({
    name, faction, hp, npc: figure, collapse, characterId, pose,
  });
  return { actor, npc: figure, group: figure.group };
}

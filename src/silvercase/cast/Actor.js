import { Npc } from '../../bing/cast.js';

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
    /* Whatever he was saying, he has stopped. `Npc.update()` is never called
     * again for this body, so the mouth would otherwise be frozen at whatever
     * width the last frame left it — mid-word, on a corpse. */
    this.npc.hush?.();
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
      return;
    }
    if (this.downT < 0) return;
    this.downT += dt;
    const k = smooth(Math.min(1, this.downT / COLLAPSE_TIME));
    const c = this.collapse;
    const p = this.parts;

    if (c.seat) {
      // He does not leave the furniture. Only his weight goes.
      const side = Math.sign(c.bodyRoll || 1) || 1;
      p.body.rotation.set(c.bodyPitch * k, 0, c.bodyRoll * k);
      p.head.rotation.set(0.52 * k, 0.14 * k * side, -0.46 * k * side);
      this.group.position.y = this._rest.y + (this._restY - this._rest.y) * k;
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
  }

  /**
   * Put a fallen actor back on his feet (or back in his chair) exactly where
   * he started. The mission has one checkpoint and a retry has to undo a
   * death completely, including the pose and the seat drop.
   */
  revive() {
    this.hp = this.maxHp;
    this.alive = true;
    this.downT = -1;
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
 */
export function makeActor({
  parent, name = '', faction = 'neutral', hp = 100, model = {},
  position = { x: 0, y: 0, z: 0 }, yaw = 0, job = 'stand', tier = 'hero',
  look = true, folded = false, collapse = COLLAPSE.standing, characterId = null,
  pose = null, npc = null,
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
  const actor = new Actor({
    name, faction, hp, npc: figure, collapse, characterId, pose,
  });
  return { actor, npc: figure, group: figure.group };
}

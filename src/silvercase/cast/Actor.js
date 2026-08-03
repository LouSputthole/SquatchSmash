import { Person } from '../../core/person.js';

/**
 * A small humanoid actor: a core/person.js `Person` body plus the hp/faction/
 * death bookkeeping the mission's cast needs. Modeled on Motel's bespoke
 * actor (src/motel/actors.js's `Actor`) — same hp/maxHp/faction shape, the
 * same locked `hostile` property Motel's Snow uses so a "friendly" actor can
 * never be flipped hostile by a stray state change — but reduced to only
 * what this mission actually asks of it: nobody here pathfinds, chases, or
 * swings a weapon, so all of that machinery stays out.
 *
 * Two distinct ways to die, on purpose:
 *   - damage(amount, fromX, fromZ) — combat resolution, for the couch/chair
 *     targets and the bathroom gunman ONLY. Never call this on Ape.
 *   - kill({scripted}) — a directed narrative beat (Ape's own scripted
 *     "death" on mission failure, or any other authored execution). Skips
 *     faction/hostile checks entirely; it isn't combat, it's the story
 *     deciding something happened.
 */

// "Toward horizontal" per the brief — just short of a dead-flat 90°, the
// same fudge src/motel/actors.js uses for its own fall.
const COLLAPSE_ROTATION = Math.PI / 2 - 0.1;
// 0.6–0.9s per the brief; splits the difference.
const COLLAPSE_TIME = 0.75;
// ApartmentScene.js: "Floor is y=0 throughout" — the one scene this cast
// lives in, so it's safe to bake in rather than thread through as a param.
const FLOOR_Y = 0;

export class Actor {
  constructor({
    name = '', faction = 'neutral', hp = 100, person,
  } = {}) {
    this.name = name;
    this.person = person;
    this.group = person.group;

    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
    this.downT = -1; // ragdoll collapse timer; -1 until death starts
    this._fallFromY = 0;

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

  /**
   * Combat damage — the couch/chair targets and the bathroom gunman only.
   * Never call this on Ape or any other scripted-death target; use kill()
   * for those. Returns true if this hit brought the actor down.
   * `fromX`/`fromZ` (the shot's origin) default to the actor's own position,
   * which makes the cosmetic knockback below a no-op if the caller doesn't
   * have a source handy.
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
   * `scripted` is accepted (and documented) rather than assumed, in case a
   * future beat ever wants to distinguish an authored death from an
   * unscripted one — nothing branches on it today.
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
    this._fallFromY = this.group.position.y;
  }

  /** Advances the ragdoll collapse once dead; a no-op every other frame. */
  update(dt) {
    if (this.downT < 0) return;
    this.downT += dt;
    const k = Math.min(1, this.downT / COLLAPSE_TIME);
    this.group.rotation.x = k * COLLAPSE_ROTATION;
    this.group.position.y = this._fallFromY + (FLOOR_Y - this._fallFromY) * k;
  }
}

/**
 * Builds the Person plus the Actor wrapping it, and places both.
 * `position` is `{x, y, z}` (y optional, defaults to 0); `yaw` is a Person
 * *heading* (facing = (sin(h), 0, cos(h)), 0 = +z) — see ApartmentScene.js's
 * own note on the two incompatible yaw conventions in this codebase before
 * feeding this a camera-yaw anchor by mistake.
 */
export function makeActor({
  name = '', faction = 'neutral', hp = 100, palette = {}, position = { x: 0, y: 0, z: 0 }, yaw = 0,
} = {}) {
  const person = new Person(palette);
  person.group.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  person.heading = yaw;
  person.group.rotation.y = yaw;
  const actor = new Actor({
    name, faction, hp, person,
  });
  return { actor, person, group: person.group };
}

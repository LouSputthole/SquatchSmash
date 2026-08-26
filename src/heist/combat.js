import { hiddenOrIgnored, resolveProxyContact } from '../core/combat/aim-proxy.js';
import * as THREE from 'three';

import { CombatFireControl } from '../core/combat/fire-control.js';
import {
  COMBAT_HIT_ZONE_DAMAGE, CombatImpactResolver, resolveHitZone,
} from '../core/combat/impact.js';
import { CombatImpairments } from '../core/combat/impairments.js';
import { CombatPerception } from '../core/combat/perception.js';
import { CombatWeaponAim } from '../core/combat/aim.js';
import { BurstController } from '../core/combat/weapon.js';
import { FACTIONS } from '../core/combat/factions.js';
import { Firearm } from '../core/weapons/Firearm.js';
import { WEAPON_CATALOG } from '../core/weapons/catalog.js';

/**
 * THE TAKE's compatibility Combat Adapter.
 *
 * This is the seam the migration matrix in docs/REUSABLE-GAMEPLAY-SYSTEMS.md
 * ordered first: THE TAKE ran its own copy of ground combat — `WeaponController`
 * ammunition, a hand-rolled police line-of-sight ray that deliberately stopped
 * 0.8 m short of the player, an unconditional `registerActorHit` that let a
 * debug round reach a hostage THROUGH A WALL, and a scene-local blood pool.
 * All of that overlapped `src/core/combat/` and `src/core/weapons/` without
 * consuming them, so THE TAKE's cover could disagree with every other scene's.
 *
 * The Adapter maps heist actors onto the shared Modules without touching the
 * mission: hostages, police phases, threat escalation, objectives, checkpoints
 * and authored navigation all stay in `main.js` and its Locality files.
 *
 *   - `HeistFirearm` puts the canonical catalog `Firearm` behind the exact
 *     surface `HeistLoadout`, the HUD and the checkpoints already consume, so
 *     ammunition, reload phases and damage numbers are the shared catalog's.
 *   - `resolvePlayerShot` is the player's raycast truth: one honest ray into
 *     the active phase geometry, first visible hit wins, and only a hit whose
 *     hierarchy is registered with `CombatImpactResolver` may damage an actor.
 *     A wall in front of a hostage is therefore a wall, for every caller —
 *     including the mission-tooling `shootHostage` probe that used to bypass
 *     geometry entirely.
 *   - `updateHostile` is one officer's whole shared pipeline: `CombatPerception`
 *     sight through the same honest trace, `CombatWeaponAim` turning the man
 *     and steering his modelled gun so the bore is visibly on the player before
 *     a round exists, `Firearm` spending real ammunition, and
 *     `CombatFireControl.resolveShot` owning blocker/hit/near-miss truth.
 *   - `presentImpact` feeds applied hits to the shared blood systems from
 *     `src/world/blood.js`: attached wounds, arterial spurts, and a spreading
 *     floor pool on a fatal — the same gore vocabulary as every other scene.
 *
 * No THREE scene, DOM or audio is owned here, so the whole seam runs headless
 * under `tests/heist-combat-adapter.test.mjs`.
 */

/** Which catalog gun each heist loadout slot actually is, plus its HUD label. */
export const HEIST_WEAPON_BINDINGS = Object.freeze({
  carbine: Object.freeze({ weaponId: 'carbine', label: 'CONTROLLED' }),
  sidearm: Object.freeze({ weaponId: 'pistol9', label: 'COMMANDER' }),
});

/**
 * The canonical `Firearm` behind THE TAKE's old `WeaponController` surface.
 *
 * `HeistLoadout`, the ammo readout, the R key and the checkpoint registry all
 * speak the old dialect (`fire()` returning damage, `beginReload`, `magazine`,
 * `snapshot`/`restore`). Rewriting every caller at once was exactly what the
 * migration order said not to do, so the dialect survives and the state does
 * not: rounds, reserve, two-phase reload, cooldown and recoil are all the
 * shared `Firearm`'s, and damage/penetration come off the shared catalog —
 * same weapon, same numbers, in every scene that mounts it.
 */
export class HeistFirearm {
  /** @param {string} slot a key of HEIST_WEAPON_BINDINGS */
  constructor(slot) {
    const binding = HEIST_WEAPON_BINDINGS[slot];
    if (!binding) throw new Error(`unknown heist weapon slot "${slot}"`);
    this.slot = slot;
    this.weaponId = binding.weaponId;
    this.firearm = new Firearm(binding.weaponId);
    const def = this.firearm.def;
    /* The read-only card the HUD and the loadout tests consume. `magazineSize`
     * keeps its legacy name; the number is the catalog's capacity. */
    this.definition = Object.freeze({
      name: binding.label,
      magazineSize: def.capacity,
      damage: def.damage,
      penetration: def.penetration,
    });
    this.aimed = false;
  }

  get magazine() { return this.firearm.rounds; }

  /** Loose reserve rounds — the catalog model, not the old whole-magazine count. */
  get reserveRounds() { return this.firearm.reserve; }

  get cooldown() { return this.firearm.cooldown; }

  get reloading() { return this.firearm.reloading; }

  setAimed(value) { this.aimed = value === true; }

  /**
   * One trigger pull. The click-to-fire input this scene uses is one pull per
   * call, so the trigger latch is cycled here — a semi-automatic still refuses
   * inside its cooldown and an empty gun clicks once per pull, exactly the
   * refusals the old controller reported.
   */
  fire() {
    this.firearm.setTrigger(true);
    const round = this.firearm.fire({ aimed: this.aimed });
    this.firearm.setTrigger(false);
    if (!round.fired) return { fired: false, reason: round.reason };
    return {
      fired: true,
      tracer: round.tracer === true,
      damage: this.definition.damage,
      penetration: this.definition.penetration,
      spread: round.spread,
      remaining: this.firearm.rounds,
    };
  }

  beginReload() { return this.firearm.reload(); }

  /** @returns {Array<object>} the Firearm's ordered events (eject/loaded/cycle). */
  update(dt) { return this.firearm.update(dt); }

  snapshot() { return this.firearm.snapshot(); }

  /**
   * Durable ammunition only; reload timers and trigger latches are transients
   * the shared `Firearm.restore` deliberately clears. The legacy
   * `{ magazine, reserveMagazines }` checkpoint shape is translated so an old
   * snapshot restores instead of silently emptying the gun.
   */
  restore(snapshot = {}) {
    const legacy = snapshot && !Number.isFinite(snapshot.rounds)
      && Number.isFinite(Number(snapshot.magazine));
    const translated = legacy
      ? {
        rounds: Number(snapshot.magazine),
        reserve: Math.max(0, Math.round(Number(snapshot.reserveMagazines) || 0))
          * this.definition.magazineSize,
      }
      : snapshot;
    this.firearm.restore(translated);
    this.aimed = false;
    return true;
  }

  /** Back to a bench-fresh gun: full magazine, full catalog reserve. */
  reset() {
    this.firearm.restore({
      rounds: this.firearm.capacity,
      reserve: this.firearm.def.reserve,
      shots: 0,
    });
    this.aimed = false;
  }
}

/* Module scratch, the shared-Adapter pattern: nothing here is allocated per
 * frame and nothing returned to a caller aliases these. Anything a caller may
 * keep (shot records, perception memory) is a copy owned by the shared Module
 * that made it. */
const _raycaster = new THREE.Raycaster();
const _segment = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _worldNormal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();

/** Officer eye and muzzle heights; the palace Adapter's proportions. */
const HOSTILE_EYE_HEIGHT = 1.52;
const HOSTILE_MUZZLE_HEIGHT = 1.35;

/**
 * What an officer is carrying.
 *
 * `makePoliceFigure` mounts the catalog `pistol9` on his hand and this
 * pipeline spends the same gun's ammunition, so the presentation layer can
 * read one id off the shot and get the right report, the right tracer colour
 * and the right muzzle-flash size without a second table to keep in step.
 */
export const HEIST_HOSTILE_WEAPON_ID = 'pistol9';

/**
 * Police trigger discipline.
 *
 * Owner, playtest 2026-08-26: the police *"never really appear to be shooting
 * back."* Part of that was arithmetic — one round every 2.6-4.6 s per officer,
 * so at five live officers the street produced 1.4 rounds a second, spread out
 * as evenly as a dripping tap. A lone pop with nothing before or after it does
 * not read as a man shooting at you; it reads as ambience.
 *
 * The same rounds now arrive in twos and threes at the pistol's own cyclic
 * rate, with a real pause between them, through the shared `BurstController`
 * the siege's riflemen already use. THE ROUNDS PER SECOND ARE HELD WHERE THEY
 * WERE, on purpose: this is item 52 on the presentation list, not a difficulty
 * change.
 *
 *   old   1 round per shot clock, mean 3.6 s        = 0.2778 rounds/s
 *
 * `BurstController` alternates its length deterministically (2, 3, 2, 3 ...)
 * and arms the pause on the burst's LAST round, so one cycle is `pause` plus
 * (n - 1) / 5.5 s of firing:
 *
 *          2.5 / (pause + 1.5 / 5.5) = 0.2778  ->  pause = 8.73 s
 *
 * Measured rather than assumed, because a magazine runs out: 300 s of held
 * contact by one officer against a static target, four seeds, with the
 * pause drawn per officer from the authored range and the 15-round reload
 * falling where it falls --
 *
 *   0.2900, 0.2833, 0.2733, 0.2433 rounds/s, mean 0.2725
 *
 * against the old model's 0.2778. Same fire, delivered in bursts of
 * 2, 3, 2, 3, 1 (the magazine), 3 ... at 0.183 s between rounds.
 */
export const HEIST_HOSTILE_BURST = Object.freeze({ min: 2, max: 3 });

/**
 * Turning a proxy contact into a body contact now lives in
 * `src/core/combat/aim-proxy.js`.
 *
 * It was written here, and it was right here, and it stayed here — so every
 * other scene with an aim volume kept the bug it fixes. Triple X hanging in
 * the Silent Squatch lab was the one the owner found: his hit box is a metre
 * of empty air around a man on a swinging chain, and the blood landed on the
 * box. Same fix, one copy, reachable from anywhere.
 */

export class HeistCombatAdapter {
  /**
   * @param {object} [options]
   * @param {FactionMatrix} [options.matrix] the scene's damage-permission Module
   * @param {() => number} [options.random] injected for deterministic tests
   */
  constructor({ matrix = null, random = Math.random } = {}) {
    this.matrix = matrix;
    this.random = typeof random === 'function' ? random : Math.random;
    this.impactResolver = new CombatImpactResolver();
    /* No AABB set: every trace goes through the scene raycast below, so shot
     * truth is the actual phase geometry rather than a parallel box world
     * that could quietly disagree with what the player sees. */
    this.fireControl = new CombatFireControl({ random: this.random });
    this.occluders = [];
    /* One shared perception/aim/firearm runtime per live hostile, keyed by
     * actor id so a recycled body with a fresh actor gets a fresh pipeline. */
    this._hostiles = new Map();
  }

  /** The Object3D roots that ARE this phase's ballistic truth. */
  setOccluders(roots = []) {
    this.occluders = Array.isArray(roots) ? roots.filter(Boolean) : [roots].filter(Boolean);
    return this.occluders.length;
  }

  /** Register one hittable hierarchy with the shared impact resolver. */
  register(root, descriptor) {
    return this.impactResolver.register(root, descriptor);
  }

  /** Per-frame shared-module upkeep (near-miss whiz rate limiting). */
  update(dt) {
    this.fireControl.update(dt);
  }

  /**
   * The honest ray: first intersection of the active phase geometry whose
   * ancestor chain is visible and not the ignored shooter. Returns the raw
   * three.js intersection (allocated per shot, not per frame) or null.
   *
   * ## The aim proxy, and why a hit on one is not a contact point
   *
   * Owner: *"when you shoot the civilians the decals float in the air."*
   * Every person in this scene carries an invisible 0.72 × 1.75 × 0.62 box so
   * that shooting somebody does not depend on getting the crosshair onto a
   * forearm. That box is a good aim volume and a terrible SURFACE: its front
   * face is at z 0.31 and a chest is at 0.12, so a round that resolved
   * against the proxy put its wound nineteen centimetres in front of the man
   * it hit — hanging in the air, exactly as reported.
   *
   * So the proxy still decides WHO was hit, and the body decides WHERE. A
   * proxy contact is replaced by the first real mesh under the same figure
   * along the same ray; a round that clipped the edge of the volume and
   * missed every mesh keeps the hit and has its point pulled onto the body's
   * own bounds, because a graze still lands on a person.
   */
  trace(origin, direction, { far = 120, ignore = null } = {}) {
    if (!this.occluders.length) return null;
    _raycaster.ray.origin.copy(origin);
    _raycaster.ray.direction.copy(direction).normalize();
    _raycaster.near = 0;
    _raycaster.far = Math.max(0, far);
    const hits = _raycaster.intersectObjects(this.occluders, true);
    for (const hit of hits) {
      if (hiddenOrIgnored(hit.object, ignore)) continue;
      if (hit.object?.userData?.aimProxy !== true) return hit;
      return resolveProxyContact(hit, hits, ignore);
    }
    return null;
  }

  /**
   * Segment occlusion for perception and fire control: the first blocking
   * contact strictly between two points, or null for a clear line. The tiny
   * end epsilon keeps a trace TO a surface from being blocked by it.
   */
  blockedBetween(from, to, { ignore = null } = {}) {
    _segment.copy(to).sub(from);
    const distance = _segment.length();
    if (distance <= 1e-6) return null;
    _segment.multiplyScalar(1 / distance);
    const hit = this.trace(from, _segment, { far: distance - 0.02, ignore });
    if (!hit) return null;
    return {
      point: hit.point,
      distance: hit.distance,
      object: hit.object,
      id: hit.object?.name ?? null,
    };
  }

  /**
   * Resolve one player round through shared shot truth.
   *
   * The ray decides what was hit; `CombatImpactResolver` decides what that
   * means. An unregistered first hit — wall, desk, cruiser — is returned as
   * plain world truth with `located.reason === 'unregistered'`, and no actor
   * behind it can be harmed, because the round never reached one.
   *
   * @returns {{hit: object|null, located: object|null}}
   */
  resolvePlayerShot({
    origin, direction, weapon = null, damage = 0, penetration = 0, far = 120,
  }) {
    const hit = this.trace(origin, direction, { far });
    if (!hit) return { hit: null, located: null };
    let normal = null;
    if (hit.face?.normal && hit.object?.matrixWorld) {
      normal = _worldNormal.copy(hit.face.normal)
        .applyMatrix3(_normalMatrix.getNormalMatrix(hit.object.matrixWorld))
        .normalize()
        .clone();
    }
    /* WHERE ON THE MAN. The resolver decides this again internally for its own
     * bookkeeping, but the multiplier has to be chosen BEFORE the call, so the
     * zone is read here off the same tagged part groups
     * (`HeistFigure._tagHitZones`) through the same shared walk. An untagged
     * wall answers `chest` and multiplies by 1, which is what an unregistered
     * contact was always worth. */
    const { zone } = resolveHitZone(hit.object);
    const located = this.impactResolver.resolve({
      object: hit.object,
      point: hit.point,
      normal,
      origin,
      direction,
      distance: hit.distance,
      weapon,
      damage,
      penetration,
    }, {
      attacker: { faction: FACTIONS.CREW },
      playerShot: true,
      damageScale: COMBAT_HIT_ZONE_DAMAGE[zone] ?? 1,
      lethalHeadshots: true,
    });
    return { hit, located };
  }

  _hostileRuntime(entry) {
    const id = entry.actor.id;
    let runtime = this._hostiles.get(id);
    if (!runtime) {
      runtime = {
        perception: new CombatPerception({
          /* Engaged street combatants, not sentries: full field, contact
           * memory long enough to cover a sprint between two cars. */
          memorySeconds: 4,
          trace: (from, to) => this.blockedBetween(from, to, { ignore: entry.root }),
        }),
        aim: new CombatWeaponAim(),
        firearm: new Firearm(HEIST_HOSTILE_WEAPON_ID),
        /* The opening stagger, so six officers do not all open up on the
         * frame the wave spawns. It seeds the first burst's wait below. */
        shotClock: 0.6 + this.random() * 1.2,
        burst: null,
        /* A hit costs him his aim, his accuracy and, on a limb, his speed —
         * the same shared Module the siege's attackers and the palace's
         * security run. Nothing in THE TAKE reacted to being shot before. */
        impairments: new CombatImpairments(),
      };
      this._hostiles.set(id, runtime);
    }
    return runtime;
  }

  /**
   * One officer's live impairment state, for the scene's presentation layer.
   * `reaction` is the visible flinch; `interrupted` is whether he is still
   * off his weapon.
   */
  hostileImpairments(actorId) {
    return this._hostiles.get(actorId)?.impairments ?? null;
  }

  /**
   * A player round landed on this officer. Shared truth in, shared reaction
   * out: the stagger window and the limb wound come from
   * `CombatImpairments`, keyed off the zone and part the impact resolver
   * already decided.
   *
   * @param {object} entry the police figure entry
   * @param {object} located an applied Located hit from `resolvePlayerShot`
   */
  noteHostileHit(entry, located) {
    if (!entry?.actor || located?.applied !== true) return false;
    const runtime = this._hostiles.get(entry.actor.id);
    if (!runtime) return false;
    return runtime.impairments.applyResolvedHit(located);
  }

  /**
   * One hostile officer, one frame, entirely through the shared pipeline.
   *
   * The scene keeps authoring WHO fights (wave budgets, spawn gates, recycle)
   * and HOW HARD (cadence, accuracy, per-round damage); everything mechanical
   * — sight, memory, turning, visible bore alignment, ammunition, blockers,
   * hits and near misses — is the shared Modules' truth. A wall between the
   * muzzle and the player denies the round in `CombatPerception.scan` and
   * again in `CombatFireControl.resolveShot`; there is no short ray and no
   * hit-chance dice detached from geometry any more.
   *
   * @param {object} entry `{ actor, root, weaponModel }` — a police figure
   * @param {number} dt simulated seconds
   * @param {object} options
   * @param {THREE.Vector3} options.targetPoint the player's aim point (copied
   *   by every shared Module that keeps it; the caller may pass scratch)
   * @param {CombatActor} options.targetActor
   * @param {number} options.accuracy scene-authored hit probability scalar
   * @param {number} options.damage scene-authored per-round damage
   * @param {number[]} [options.cadence] seconds between trigger pulls [min,max]
   * @param {number} [options.range] sight range in metres
   * @returns {{seen: boolean, frame: object, shot: object|null, events: Array}}
   */
  updateHostile(entry, dt, {
    targetPoint,
    targetActor,
    targetId = 'prospect',
    accuracy = 0.3,
    damage = 10,
    cadence = [2.6, 4.6],
    burst = HEIST_HOSTILE_BURST,
    range = 48,
  }) {
    const runtime = this._hostileRuntime(entry);
    const events = runtime.firearm.update(dt);
    runtime.shotClock = Math.max(0, runtime.shotClock - dt);
    /* The knock decays whether he is shooting or not. Ticked before the aim
     * frame is built, so a man hit this frame is off his weapon this frame. */
    runtime.impairments.update(dt);
    if (!runtime.burst) {
      /* Built on first use because the pause is scene-authored and the shot
       * clock's opening stagger is per officer: seeding `wait` with it is what
       * keeps a fresh wave from opening up in unison. */
      runtime.burst = new BurstController({
        min: burst.min,
        max: burst.max,
        pause: cadence[0] + this.random() * Math.max(0, cadence[1] - cadence[0]),
      });
      runtime.burst.wait = runtime.shotClock;
    }
    /* The modelled gun: heist figures hang it on `root.userData.weapon`
     * (see `makePoliceFigure`); an explicit `entry.weaponModel` wins so tests
     * and future casts can pass their own. Without a model there is no bore,
     * and without a bore `aligned` stays false — no round is invented. */
    const weaponModel = entry.weaponModel ?? entry.root?.userData?.weapon ?? null;

    _eye.copy(entry.root.position);
    _eye.y += HOSTILE_EYE_HEIGHT;
    /* Scratch is safe: CombatPerception.scan copies the origin and the sampled
     * point into vectors it owns before remembering either. */
    const seen = runtime.perception.scan({
      origin: _eye,
      range,
      candidates: [{
        id: targetId, actor: targetActor, point: targetPoint, position: targetPoint,
      }],
      samplePoint: (candidate) => candidate.point,
    });
    runtime.perception.tick(dt);

    /* Own eyes first, own memory second — the officer keeps his weapon on the
     * last honest sighting while the player is behind cover, and that facing
     * never becomes a shot: `resolveShot` below still demands visibility. */
    const aimTarget = seen?.point ?? runtime.perception.lastSeen;
    const frame = runtime.aim.update(dt, {
      root: entry.root,
      weaponModel,
      targetPoint: aimTarget,
      muzzleHeight: HOSTILE_MUZZLE_HEIGHT,
      /* A man taking rounds is off his aim, and a wounded arm settles onto a
       * target more slowly. Both are the shared impairment Module's. */
      settleScale: runtime.impairments.aimSettleScale,
      interrupted: runtime.firearm.reloading > 0 || runtime.impairments.interrupted,
    });

    /* THE TRIGGER, not a metronome. `BurstController` is called every frame
     * whether he may shoot or not, because the pause between bursts has to run
     * down while he is behind a car as well as while he is standing in the
     * open. The rate INSIDE a burst is the gun's own: the same
     * `firearm.cooldown` gate the siege's riflemen use. */
    const canFire = frame.aligned
      && runtime.perception.targetVisible
      && runtime.firearm.reloading <= 0
      && runtime.firearm.cooldown <= 0
      && !runtime.impairments.interrupted;
    let shot = null;
    if (runtime.burst.update(dt, canFire)) {
      runtime.firearm.setTrigger(true);
      const round = runtime.firearm.fire({ aimed: true });
      runtime.firearm.setTrigger(false);
      if (!round.fired) {
        if (round.reason === 'empty') {
          events.push({ type: 'empty' });
          if (runtime.firearm.reload()) events.push({ type: 'reload-start' });
        }
      } else {
        shot = this.fireControl.resolveShot({
          origin: frame.origin,
          boreDirection: frame.direction,
          aimPoint: runtime.perception.sampledPoint,
          targetPoint,
          target: { id: targetId, actor: targetActor, point: targetPoint },
          targetVisible: runtime.perception.targetVisible,
          attacker: { faction: FACTIONS.POLICE },
          matrix: this.matrix ?? undefined,
          /* A shaking man shoots worse. `accuracyScale` is the arm wound; the
           * scene's own suppression scalar is already folded into `accuracy`. */
          damage,
          accuracy: accuracy * runtime.impairments.accuracyScale,
          trace: (from, to) => this.blockedBetween(from, to, { ignore: entry.root }),
        });
        /* Presentation truth travels with the round: which gun made it, and
         * whether the catalog says this one is a visible tracer. The scene
         * owns the pools; it does not own the ballistics. */
        if (shot) {
          shot = {
            ...shot,
            weaponId: HEIST_HOSTILE_WEAPON_ID,
            tracer: round.tracer === true,
          };
        }
      }
    }
    return { seen: Boolean(seen), frame, shot, events };
  }

  /** The catalog's tracer card for the gun the police carry. */
  static hostileTracer() {
    return WEAPON_CATALOG[HEIST_HOSTILE_WEAPON_ID].tracer;
  }

  /** JSON-safe durable pipeline state for one hostile, for the checkpoint seam. */
  hostileSnapshot(actorId) {
    const runtime = this._hostiles.get(actorId);
    if (!runtime) return null;
    return {
      version: 1,
      firearm: runtime.firearm.snapshot(),
      perception: runtime.perception.snapshot(),
      aim: runtime.aim.snapshot(),
      shotClock: runtime.shotClock,
      impairments: runtime.impairments.snapshot(),
      burst: runtime.burst ? {
        min: runtime.burst.min,
        max: runtime.burst.max,
        pause: runtime.burst.pause,
        remaining: runtime.burst.remaining,
        wait: runtime.burst.wait,
        sequence: runtime.burst.sequence,
      } : null,
    };
  }

  restoreHostile(entry, snapshot = null) {
    const runtime = this._hostileRuntime(entry);
    if (!snapshot) return runtime;
    runtime.firearm.restore(snapshot.firearm ?? {});
    runtime.perception.restore(snapshot.perception ?? {});
    runtime.aim.restore(snapshot.aim ?? {}, { root: entry.root });
    runtime.shotClock = Math.max(0, Number(snapshot.shotClock) || 0);
    runtime.impairments.restore(snapshot.impairments ?? {});
    /* A checkpoint taken mid-burst restores mid-burst. A record from before
     * bursts existed has no `burst` block; that officer simply builds a fresh
     * one on his next frame, seeded from the restored shot clock. */
    const record = snapshot.burst ?? null;
    if (record) {
      runtime.burst = new BurstController({
        min: record.min, max: record.max, pause: record.pause,
      });
      runtime.burst.remaining = Math.max(0, Math.round(Number(record.remaining) || 0));
      runtime.burst.wait = Math.max(0, Number(record.wait) || 0);
      runtime.burst.sequence = Math.max(0, Math.round(Number(record.sequence) || 0));
    } else {
      runtime.burst = null;
    }
    return runtime;
  }

  /** A recycled body's previous actor keeps no pipeline. */
  dropHostile(actorId) {
    return this._hostiles.delete(actorId);
  }

  /** Checkpoint reset: every live pipeline is rebuilt from records or fresh. */
  resetHostiles() {
    this._hostiles.clear();
  }

  /**
   * Mount the shared blood systems (`src/world/blood.js`). Presentation
   * handles are injected so this seam stays DOM-free and headless-testable;
   * `main.js` owns constructing them against the real scene.
   */
  attachBlood({
    impacts = null, spurts = null, pools = null, floorYFor = () => 0,
  } = {}) {
    this.blood = { impacts, spurts, pools, floorYFor };
  }

  /**
   * Shared gore for one applied hit: an attached wound and spatter at the
   * exact ray point, an arterial burst off the wound, and — fatal only — a
   * spreading pool on the floor under the body. Bounded by each system's own
   * pool; a refused or unregistered impact leaves no blood, because no round
   * arrived.
   */
  presentImpact(located) {
    if (!located?.applied || !this.blood) return false;
    const { impacts, spurts, pools, floorYFor } = this.blood;
    const floorY = floorYFor(located);
    const outward = located.normal
      ?? (located.direction ? located.direction.clone().negate() : null);
    impacts?.hit({
      actor: located.actor,
      anchor: located.anchor ?? located.root,
      point: located.point,
      normal: located.normal,
      from: located.origin,
    });
    spurts?.burst(located.point, outward, {
      count: located.fatal ? 14 : 6,
      speed: located.fatal ? 3 : 2.2,
      floorY,
    });
    if (located.fatal) {
      pools?.spill(located.point, {
        floorY,
        size: 0.95 + this.random() * 0.55,
      });
    }
    return true;
  }
}

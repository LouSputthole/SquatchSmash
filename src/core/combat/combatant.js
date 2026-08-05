/**
 * A person who can fight: the body layer over the shared rig.
 *
 * Combatant owns one `Npc` (the same `makePerson` body every scene casts
 * from), a `Vitals`, a `CombatBrain`, its weapon state, its hitboxes and its
 * death. Out of combat the Npc's own job animation runs untouched (patrol,
 * lean, drink); the moment the brain leaves `unaware`/`suspicious` the
 * Combatant POSSESSES the rig — gait, aim pose, crouch, flinches, collapse —
 * and gives it back if the fight blows over. That split is what lets a
 * mansion guard walk his authored route right up until the first shot.
 *
 * Friendlies are the same class with a crew faction and the friendly
 * archetype — protected characters via rules.js, never a private health
 * system.
 *
 * The death pipeline runs in the owner's ordered steps: brain off → weapon
 * dropped → directional collapse chosen → collision (hitboxes) retired →
 * bark → kill event → cleanup registration. Ragdolls here are the repo's
 * authored-collapse kind — a physical tween, no skeleton physics — which
 * settles, never twitches, and costs nothing once down.
 */
import * as THREE from 'three';
import { archetype as lookupArchetype, customArchetype } from './archetypes.js';
import { Vitals } from './vitals.js';
import { CombatBrain, BRAIN_STATES } from './brain.js';
import { Perception } from './perception.js';
import { MoraleModel } from './morale.js';
import { SuppressionModel } from './suppression.js';
import { WeaponController, BurstController } from './weapon.js';
import { stanceSpreadScale } from './recoil.js';
import { HitboxRig } from './hitboxes.js';
import { weaponDef } from '../weapons/catalog.js';

const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();

const WALK = 1.5;
const RUN = 3.3;
const AI_STEP = 1 / 15; // perception/brain cadence; movement runs per frame

export class Combatant {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {object} o.npc         a bing-cast Npc (already in the scene)
   * @param {string|object} o.archetype  name or row (customArchetype output)
   * @param {string} o.faction
   * @param {object} o.resolver    ShotResolver
   * @param {()=>THREE.Object3D[]} o.targets  what this gun's rays test
   * @param {object} [o.squad]
   * @param {object} [o.cover]
   * @param {object} [o.tracers]   TracerPool
   * @param {object} [o.difficulty]
   * @param {Array}  [o.retreatPoints]
   * @param {(a,b)=>boolean} [o.canSee]  line-of-sight test
   * @param {(x:number,z:number)=>number} [o.groundAt]
   * @param {Array}  [o.colliders] Box3s for nav clearance
   * @param {Array}  [o.navBlockers]
   * @param {object} [o.boundary]  {x, z, w, d} the AI stays inside
   * @param {Function} [o.onEvent] ({type:'bark'|'shot'|'death'|..., ...})
   * @param {Function} [o.onDeath] ({id, byPlayer, headshot, region})
   * @param {boolean} [o.protectedCore]
   * @param {number}  [o.aliveBlockersIndex] managed externally
   * @param {()=>number} [o.rng]
   */
  constructor({
    id, npc, archetype, faction, resolver, targets,
    squad = null, cover = null, tracers = null, difficulty = null,
    retreatPoints = [], canSee = () => true, groundAt = () => 0,
    colliders = null, navBlockers = null, boundary = null,
    onEvent = null, onDeath = null, protectedCore = false, rng = Math.random,
  }) {
    this.id = id;
    this.npc = npc;
    this.faction = faction;
    this.resolver = resolver;
    this.targets = targets;
    this.squad = squad;
    this.tracers = tracers;
    this.difficulty = difficulty;
    this.groundAt = groundAt;
    this.colliders = colliders;
    this.navBlockers = navBlockers;
    this.boundary = boundary;
    this.onEvent = onEvent;
    this.onDeath = onDeath;
    this.rng = rng;

    this.arch = typeof archetype === 'string' ? lookupArchetype(archetype) : archetype;
    this.weapon = weaponDef(this.arch.weapon) ?? weaponDef('pistol9');
    this.vitals = new Vitals({
      maxHealth: this.arch.health,
      vest: this.arch.vest,
      helmet: this.arch.helmet,
      painThreshold: this.arch.painThreshold,
      staggerResist: this.arch.staggerResist,
      protectedCore,
      rng,
    });
    this.suppression = new SuppressionModel({
      decay: 0.55 * (1 + this.arch.suppressResist),
    });
    this.perception = new Perception({
      reaction: this.arch.skill.reaction,
      canSee,
    });
    this.morale = new MoraleModel({ ...this.arch.morale });
    this.brain = new CombatBrain({
      id, archetype: this.arch,
      perception: this.perception, morale: this.morale, suppression: this.suppression,
      squad, cover, retreatPoints, difficulty, rng,
    });
    squad?.join(id, { leader: this.arch.role === 'squadLeader' });

    /* Ammo and cadence: the catalog def drives both; WeaponController keeps
     * the count honest, BurstController keeps the finger human. */
    this.gun = new WeaponController({
      magazineSize: this.weapon.capacity,
      reserveMagazines: 4,
      roundsPerSecond: this.weapon.rps * 0.8,
      reloadSeconds: this.weapon.reloadOut + this.weapon.reloadIn + 0.4,
      damage: this.weapon.damage,
      penetration: this.weapon.penetration,
    });
    this.burst = new BurstController({ ...this.weapon.combat.npc.burst });

    this.hitboxes = new HitboxRig(npc.parts, this);
    npc.group.userData.combatant = this;

    this.dead = false;
    this.surrendered = false;
    this.possessed = false; // combat owns the pose
    this.crouched = false;
    this.moving = false;
    this.stuck = false;
    this.aimPitch = 0;
    this.gait = 0;
    this.flinch = 0; // additive small reaction, decays
    this.flinchSide = 1;
    this.stagger = 0; // interrupting reaction, blocks acting while > 0
    this.staggerRegion = null;
    this.collapse = null; // death tween state
    this.intent = null;
    this._aiAcc = this.rng() * AI_STEP; // spread AI ticks across frames
    this._lastPos = { x: npc.position.x, z: npc.position.z };
  }

  get x() { return this.npc.position.x; }

  get z() { return this.npc.position.z; }

  get y() { return this.npc.position.y + 1.3; }

  get state() { return this.brain.name; }

  /* ---------------- damage in ---------------------------------------- */

  /** Called by ShotResolver through vitals; the scene routes the record here. */
  noteShotResult(record) {
    if (this.dead) return;
    if (!record?.applied) return;
    this.squad?.reportIncomingFire(record.direction ?? { x: 0, z: 1 });
    this.onEvent?.({ type: 'bark', kind: record.fatal ? 'death' : 'pain', id: this.id });
    if (record.fatal && !record.protectedCore) {
      this._die(record);
      return;
    }
    if (record.staggered) {
      this.stagger = record.region?.startsWith('leg') ? 0.9 : 0.6;
      this.staggerRegion = record.region;
    } else {
      this.flinch = Math.min(1, this.flinch + 0.6);
      this.flinchSide = record.region === 'armL' || record.region === 'legL' ? -1 : 1;
    }
    this.brain.onDamaged({
      direction: record.attacker ? { x: record.attacker.x ?? 0, z: record.attacker.z ?? 0 } : null,
      staggered: record.staggered,
    });
  }

  /* ---------------- death -------------------------------------------- */

  _die(record) {
    this.dead = true;
    this.brain.die(); // 1. AI off
    this.squad?.reportDown(this.id); // squad + morale ripple
    this._dropWeapon(); // 2/3. weapon released
    // 4/5. collapse direction from the fatal shot, force believable.
    const dir = record.direction ?? { x: 0, z: 1 };
    const len = Math.max(0.001, Math.hypot(dir.x, dir.z));
    const away = { x: -dir.x / len, z: -dir.z / len }; // away from the shooter
    const heading = this.npc.group.rotation.y;
    const local = Math.atan2(away.x, away.z) - heading;
    const heavy = (record.raw ?? 30) > 55 ? 1.25 : 1;
    this.collapse = {
      t: 0,
      dur: record.headshotDamage ? 0.55 : 0.75,
      pitch: Math.cos(local) * 1.5 * heavy, // forward/back topple
      roll: -Math.sin(local) * 1.2 * heavy,
      lift: 0.12,
      sink: this.npc.seated ? 0.15 : 0,
    };
    this.hitboxes.dispose(); // 6. collision layers change: a body stops eating rays
    this.onEvent?.({
      type: 'death', id: this.id, headshot: record.headshotDamage === true,
      x: this.x, z: this.z,
    });
    this.onDeath?.({ // 8. the mission hears about it
      id: this.id,
      byPlayer: record.attacker?.isPlayer === true,
      headshot: record.headshotDamage === true,
      region: record.region,
    });
    // 9. cleanup: the scene's body manager reads `dead` + `deadAt`.
    this.deadAt = 0;
  }

  _dropWeapon() {
    const model = this.gunModel;
    if (!model) return;
    /* The gun leaves the hand and lies where its owner fell — reparented to
     * the world at its current transform, no physics needed. */
    const world = this.npc.group.parent;
    if (world) {
      model.updateWorldMatrix(true, false);
      world.attach(model);
      model.rotation.x = -Math.PI / 2 + (this.rng() - 0.5) * 0.3;
      model.position.y = this.groundAt(model.position.x, model.position.z) + 0.03;
    }
    this.gunModel = null;
  }

  /** Give this combatant a visible gun (the catalog model, in the right hand). */
  attachGunModel(model) {
    this.gunModel = model;
    const hand = this.npc.parts.foreR ?? this.npc.parts.armR;
    hand.add(model);
    model.position.set(0.02, -0.42, 0.1);
    model.rotation.set(-1.35, 0, 0);
    model.scale.setScalar(1);
  }

  /* ---------------- per frame ----------------------------------------- */

  /**
   * @param {number} dt
   * @param {object} ctx {player:{x,z,y,moving,crouched,dead}, foes?:[Combatant],
   *   playerIsThreat?:boolean}
   */
  update(dt, ctx) {
    if (this.dead) { this._updateCollapse(dt); return; }

    const step = Math.max(0, Math.min(0.1, dt));
    this.vitals.update(step);
    this.suppression.update(step);

    const threat = this._chooseThreat(ctx);

    // AI on a budget: perception + brain at AI_STEP, not every frame.
    this._aiAcc += step;
    if (this._aiAcc >= AI_STEP) {
      const aiDt = this._aiAcc;
      this._aiAcc = 0;
      const me = { x: this.x, z: this.z, heading: this.npc.group.rotation.y };
      if (threat) {
        this.perception.update(aiDt, me, {
          x: threat.x, z: threat.z, y: threat.y ?? 1.6,
          moving: threat.moving === true, crouched: threat.crouched === true,
        });
      } else {
        this.perception.update(aiDt, me, { x: this.x, z: this.z + 100, moving: false });
        this.perception.confidence = Math.max(0, this.perception.confidence - aiDt * 0.2);
      }
      this.morale.update(aiDt, { nearLeader: this._nearLeader() });
      this.intent = this.brain.update(aiDt, {
        me,
        player: threat ?? { x: this.x, z: this.z },
        stuck: this.stuck,
        playerDead: ctx.player?.dead === true,
      });
      this.squad?.updateMember(this.id, this.x, this.z);
    }
    const intent = this.intent ?? { move: null, aimAt: null, fire: false, crouch: false };

    // Possession: combat states own the body; calm states give it back.
    const calm = this.brain.is(BRAIN_STATES.UNAWARE, BRAIN_STATES.SUSPICIOUS);
    if (calm && !this.possessed) {
      this.npc.update(step, null);
      this._decayReactions(step);
      return;
    }
    if (calm && this.possessed && this.brain.name === BRAIN_STATES.UNAWARE) {
      this.possessed = false;
      this.npc.stand();
      return;
    }
    this.possessed = true;

    this.surrendered = intent.surrendered === true;
    this.crouched = intent.crouch === true;

    // Stagger interrupts everything briefly — but never grants immunity.
    if (this.stagger > 0) {
      this.stagger = Math.max(0, this.stagger - step);
      this.moving = false;
      this._pose(step, null);
      return;
    }

    // Movement, with the same collider clearance every NPC walk uses.
    this.moving = false;
    this.stuck = false;
    if (intent.move && !this.surrendered) {
      this._stepToward(intent.move, step);
    }

    // Facing: the aim wins, the path otherwise.
    const face = intent.aimAt ?? (intent.move && this.moving ? intent.move : null);
    if (face) this._turnToward(face.x, face.z, step);

    // Trigger discipline.
    if (intent.fire && threat && !this.surrendered) {
      this._updateFire(step, intent, threat, ctx);
    }
    if (this.gun.magazine <= 0 && this.gun.reloading <= 0 && this.gun.reserveMagazines > 0) {
      if (this.gun.beginReload()) this.onEvent?.({ type: 'bark', kind: 'reload', id: this.id });
    }
    this.gun.update(step);

    this._pose(step, intent);
    this._decayReactions(step);
  }

  _chooseThreat(ctx) {
    if (this.faction === 'crew') {
      // A friendly fights the nearest living enemy it could plausibly know of.
      let best = null;
      let bestD = Infinity;
      for (const foe of ctx.foes ?? []) {
        if (foe.dead || foe.surrendered) continue;
        const d = Math.hypot(foe.x - this.x, foe.z - this.z);
        if (d < bestD) { bestD = d; best = foe; }
      }
      return best ? { x: best.x, z: best.z, y: best.y, moving: best.moving, combatant: best } : null;
    }
    const p = ctx.player;
    if (!p || p.dead) return null;
    return p;
  }

  _nearLeader() {
    if (!this.squad) return false;
    for (const [id, m] of this.squad.members) {
      if (m.leader && m.alive && id !== this.id
        && Math.hypot(m.x - this.x, m.z - this.z) < 12) return true;
    }
    return false;
  }

  /* ---------------- locomotion ---------------------------------------- */

  _stepToward(goal, dt) {
    let gx = goal.x;
    let gz = goal.z;
    if (this.boundary) {
      const b = this.boundary;
      gx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, gx));
      gz = Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, gz));
    }
    const dx = gx - this.x;
    const dz = gz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return;
    const speed = (goal.run ? RUN : WALK) * (this.crouched ? 0.55 : 1);
    const stepLen = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * stepLen;
    const nz = this.z + (dz / d) * stepLen;
    const p = this.npc.group.position;
    if (this._clear(nx, nz)) {
      p.x = nx; p.z = nz;
    } else if (this._clear(nx, this.z)) {
      p.x = nx;
    } else if (this._clear(this.x, nz)) {
      p.z = nz;
    } else {
      this.stuck = true;
      return;
    }
    this.npc.baseY = this.groundAt(p.x, p.z);
    this.moving = true;
    this.gait += stepLen * 2.2;
  }

  _clear(x, z) {
    return clearOf(this.colliders, x, z, this.npc.baseY)
      && clearOf(this.navBlockers, x, z, this.npc.baseY);
  }

  _turnToward(x, z, dt) {
    const target = Math.atan2(x - this.x, z - this.z);
    const g = this.npc.group;
    let diff = target - g.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.rotation.y += diff * Math.min(1, dt * 8);
  }

  /* ---------------- shooting ------------------------------------------ */

  _updateFire(dt, intent, threat, ctx) {
    if (this.gun.reloading > 0) return;
    if (!this.burst.update(dt, true)) return;
    const shot = this.gun.fire();
    if (!shot.fired) return;

    // Friendly discipline: never fire with the player standing in the lane.
    if (this.faction === 'crew' && ctx.player && !ctx.player.dead) {
      if (pointNearSegment(ctx.player, this, threat, 0.8)) return;
    }

    // Muzzle: the held gun's real muzzle if there is one, else chest height.
    if (this.gunModel?.userData?.muzzle) {
      this.gunModel.localToWorld(_muzzle.copy(this.gunModel.userData.muzzle));
    } else {
      _muzzle.set(this.x, this.npc.position.y + 1.35, this.z);
    }
    _from.copy(_muzzle);

    // Aim at the threat's chest, through every human error we model.
    const aimY = (threat.y ?? this.groundAt(threat.x, threat.z) + 1.35)
      - (threat.crouched ? 0.35 : 0);
    _dir.set(threat.x - _from.x, aimY - _from.y, threat.z - _from.z).normalize();

    const spreadScale = stanceSpreadScale({
      weapon: this.weapon,
      moving: this.moving,
      crouched: this.crouched,
      suppression: this.suppression.value,
      injury: 1 - this.vitals.fraction,
      skill: this.arch.skill.spread
        * this.weapon.combat.npc.spread
        * (this.difficulty?.npcAccuracyScale ?? 1)
        * this.morale.accuracyPenalty
        * (intent.suppressing ? 1.8 : 1),
    });
    const cone = this.weapon.spread * (1 + this.gun.recoil) * spreadScale;
    if (cone > 0) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * cone;
      // Cheap orthonormal pair around the aim line.
      const rightX = _dir.z;
      const rightZ = -_dir.x;
      _dir.x += rightX * Math.cos(a) * r;
      _dir.y += Math.sin(a) * r;
      _dir.z += rightZ * Math.cos(a) * r;
      _dir.normalize();
    }

    const result = this.resolver.resolve({
      origin: _from,
      dir: _dir,
      weapon: this.weapon,
      attacker: { id: this.id, faction: this.faction, isPlayer: false, combatant: this, x: this.x, z: this.z },
      targets: this.targets(),
      scale: 1,
    });
    for (const s of result.surfaces) {
      if (s.kind === 'body' && s.combatant?.noteShotResult) s.combatant.noteShotResult(s.record);
    }
    this.tracers?.fire({
      from: _from.clone(),
      to: result.end,
      speed: this.weapon.tracer.speed,
      colour: this.weapon.tracer.colour,
      width: this.weapon.tracer.width,
    });
    this.onEvent?.({
      type: 'shot', id: this.id, weapon: this.weapon.id,
      from: _from.clone(), end: result.end, surfaces: result.surfaces,
      suppressing: intent.suppressing === true,
    });
  }

  /* ---------------- pose ----------------------------------------------- */

  _pose(dt, intent) {
    const parts = this.npc.parts;
    const t = (this.npc.t += dt);

    // Breathing continues; combat does not switch a man off.
    const breathe = 1 + Math.sin(t * 2.1) * 0.02;
    const base = parts.torso.userData.base;
    parts.torso.scale.set(base.x * breathe, base.y, base.z * breathe);

    // Stance: crouch folds the legs and drops the root.
    const ground = this.npc.baseY;
    const crouchDrop = this.crouched ? 0.34 : 0;
    parts.body.rotation.x = this.moving && !this.crouched ? 0.1 : this.crouched ? 0.16 : 0.04;
    this.npc.group.position.y = ground - crouchDrop
      + (this.moving ? Math.abs(Math.sin(this.gait)) * 0.05 : 0);

    if (this.surrendered) {
      // Knees down, hands up, nothing in them.
      parts.legL.rotation.x = -1.2;
      parts.legR.rotation.x = -1.2;
      parts.shinL.rotation.x = 2.0;
      parts.shinR.rotation.x = 2.0;
      parts.armL.rotation.x = -2.7;
      parts.armR.rotation.x = -2.7;
      this.npc.group.position.y = ground - 0.52;
      return;
    }

    // Legs: gait when moving, planted or folded otherwise.
    if (this.moving) {
      const swing = Math.sin(this.gait) * (this.crouched ? 0.26 : 0.42);
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
      parts.shinL.rotation.x = Math.max(0, -swing) * 0.8 + (this.crouched ? 0.7 : 0);
      parts.shinR.rotation.x = Math.max(0, swing) * 0.8 + (this.crouched ? 0.7 : 0);
    } else {
      parts.legL.rotation.x = this.crouched ? -0.95 : 0;
      parts.legR.rotation.x = this.crouched ? -0.75 : 0.02;
      parts.shinL.rotation.x = this.crouched ? 1.15 : 0;
      parts.shinR.rotation.x = this.crouched ? 0.95 : 0;
    }

    // Arms: the gun is up whenever there is anything to point it at.
    const aiming = intent?.aimAt != null;
    const pitch = this.aimPitch;
    if (aiming) {
      parts.armR.rotation.set(-1.3 - pitch, 0, 0.12);
      parts.foreR.rotation.set(-0.18, 0, 0);
      parts.armL.rotation.set(-1.05 - pitch, 0, -0.35);
      parts.foreL.rotation.set(-0.5, 0, 0);
      parts.head.rotation.x = -pitch * 0.4;
    } else {
      // Low ready.
      parts.armR.rotation.set(-0.55, 0, 0.1);
      parts.foreR.rotation.set(-0.5, 0, 0);
      parts.armL.rotation.set(-0.4, 0, -0.15);
      parts.foreL.rotation.set(-0.55, 0, 0);
      parts.head.rotation.x = 0;
    }

    // Reload read: the gun dips and the off hand works.
    if (this.gun.reloading > 0) {
      parts.armR.rotation.x += 0.5;
      parts.armL.rotation.x += 0.7;
      parts.foreL.rotation.x = -1.1 + Math.sin(t * 9) * 0.2;
    }

    // Reactions layer ON TOP — additive, never a full-body veto.
    if (this.flinch > 0) {
      parts.body.rotation.x += this.flinch * 0.12;
      parts.body.rotation.z = this.flinch * 0.08 * this.flinchSide;
      parts.head.rotation.z = this.flinch * 0.1 * this.flinchSide;
    }
    if (this.stagger > 0) {
      const k = this.stagger;
      if (this.staggerRegion?.startsWith('leg')) {
        // The leg buckles.
        const leg = this.staggerRegion === 'legL' ? parts.legL : parts.legR;
        leg.rotation.x = -0.6 * k;
        this.npc.group.position.y = ground - 0.18 * k - crouchDrop;
      } else {
        parts.body.rotation.x += 0.35 * k;
        parts.armR.rotation.x += 0.6 * k;
      }
    }
  }

  _decayReactions(dt) {
    this.flinch = Math.max(0, this.flinch - dt * 3.2);
  }

  _updateCollapse(dt) {
    if (!this.collapse) { this.deadAt += dt; return; }
    const c = this.collapse;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const e = k * k * (3 - 2 * k); // smoothstep — it settles, it does not bounce
    const g = this.npc.group;
    g.rotation.x = c.pitch * e;
    g.rotation.z = c.roll * e;
    g.position.y = this.npc.baseY + c.lift * Math.sin(Math.min(1, k * 1.6) * Math.PI)
      - (0.72 + c.sink) * e;
    const parts = this.npc.parts;
    parts.armL.rotation.x = -0.4 * e;
    parts.armR.rotation.x = -0.25 * e;
    parts.head.rotation.z = 0.35 * e;
    if (k >= 1) {
      this.collapse = null; // 9-and-done: no more per-frame cost for this body
      this.deadAt = 0;
    }
  }

  /* ---------------- scripted control ----------------------------------- */

  /**
   * Cinematic possession: missions may hold a combatant in a story pose,
   * force a specific death, or hand control back — without faking damage.
   */
  scriptHold(on = true) {
    this.scripted = on === true;
    if (on) this.brain.go(BRAIN_STATES.UNAWARE);
  }

  /** A story kill that still runs the real pipeline (Willy's boat rule). */
  scriptKill({ direction = { x: 0, z: 1 }, weapon = this.weapon, headshot = false } = {}) {
    const record = this.vitals.applyRaw(this.vitals.health + this.vitals.vest + 1000, {
      direction, lethal: true,
    });
    record.raw = weapon.damage;
    record.headshotDamage = headshot;
    record.region = headshot ? 'head' : 'upperTorso';
    record.direction = direction;
    this._die(record);
    return record;
  }

  /* ---------------- checkpoints ---------------------------------------- */

  snapshot() {
    return {
      id: this.id,
      x: this.x,
      z: this.z,
      yaw: this.npc.group.rotation.y,
      vitals: this.vitals.snapshot(),
      brain: this.brain.snapshot(),
      magazine: this.gun.snapshot(),
      dead: this.dead,
    };
  }

  restore(s) {
    if (!s || s.id !== this.id) return;
    this.npc.group.position.x = s.x;
    this.npc.group.position.z = s.z;
    this.npc.group.rotation.set(0, s.yaw ?? 0, 0);
    this.vitals.restore(s.vitals);
    this.brain.restore(s.brain);
    this.gun.restore(s.magazine);
    this.dead = s.dead === true;
    this.collapse = null;
    this.stagger = 0;
    this.flinch = 0;
    if (!this.dead) {
      this.npc.group.position.y = this.npc.baseY;
      if (!this.hitboxes.meshes.length) {
        this.hitboxes = new HitboxRig(this.npc.parts, this);
      }
    }
  }

  report() {
    return {
      ...this.brain.report(),
      health: this.vitals.health,
      vest: this.vitals.vest,
      helmet: this.vitals.helmet,
      dead: this.dead,
      surrendered: this.surrendered,
      x: Math.round(this.x * 10) / 10,
      z: Math.round(this.z * 10) / 10,
      magazine: this.gun.magazine,
    };
  }

  dispose() {
    this.hitboxes.dispose();
    this.npc.group.parent?.remove(this.npc.group);
  }
}

/* Same AABB-vs-circle clearance every walking NPC in the repo uses. */
function clearOf(list, x, z, baseY) {
  if (!list?.length) return true;
  const radius = 0.26;
  for (const b of list) {
    if (baseY > b.max.y || baseY + 1.8 < b.min.y) continue;
    const cx = Math.max(b.min.x, Math.min(b.max.x, x));
    const cz = Math.max(b.min.z, Math.min(b.max.z, z));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}

/** Is P (with a radius) near the segment A→B? Friendly-lane check. */
function pointNearSegment(p, a, b, radius) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = Math.max(1e-6, abx * abx + abz * abz);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  const dx = p.x - (a.x + abx * t);
  const dz = p.z - (a.z + abz * t);
  return dx * dx + dz * dz < radius * radius;
}

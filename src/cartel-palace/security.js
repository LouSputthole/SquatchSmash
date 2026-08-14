import * as THREE from 'three';

import {
  AabbCombatSpace,
  CombatFireControl,
  CombatImpactResolver,
  CombatImpairments,
  CombatPerception,
  SuppressionModel,
  CombatWeaponAim,
  FACTIONS,
  resolveCombatReaction,
} from '../core/combat/index.js';
import { Firearm } from '../core/weapons/Firearm.js';
import { weaponDef } from '../core/weapons/catalog.js';

/*
 * Sight.
 *
 * The old numbers were 14 m lit / 8.5 m blacked out across a forty-metre
 * courtyard, which meant a guard could not see a man walking up the middle of
 * his own drive. Detection was also a flat ramp, so anything he COULD see he
 * resolved in six tenths of a second whatever the distance -- long sight and a
 * flat ramp together would have deleted the stealth route, so the ramp now
 * scales with how much of his range the contact is using. Cutting the power
 * still roughly halves what he can see, and crouching still takes a third off
 * that again.
 */
const VISION = Object.freeze({
  poweredDistance: 24,
  /* 11 m, and the 0.72 crouch factor takes it to 7.92 -- deliberately under
   * the eight metres `tests/cartel-palace-mission.test.mjs` walks up to. The
   * mission's whole stealth promise is that cutting the power buys you the
   * approach; longer sight must not be bought out of that. */
  blackoutDistance: 11,
  crouchFactor: 0.72,
  fov: 132 * Math.PI / 180,
  memorySeconds: 6,
  poweredGain: 1.5,
  blackoutGain: 0.9,
  /* Floor on the distance term, so a contact at maximum range still resolves. */
  minimumGainScale: 0.32,
  loss: 0.72,
});

/*
 * Movement, per role.
 *
 * `advance` and `strafe` are metres per second. The previous values were 0.62
 * patrolling and 0.7 in a firefight -- half the speed of the slowest man in
 * Mansion Siege -- and inside 6.5 m every hostile switched to a sideways
 * shuffle at 0.29 m/s, which is what "the AI is retarded" looks like from the
 * player's side: they orbit you at walking-pace-divided-by-five and never
 * arrive.
 *
 * `standoff` is the range each role wants to fight at. Outside the band he
 * closes, inside it he backs off, and only within it does he sidestep -- so
 * repositioning reads as a decision rather than a stuck animation.
 */
const ROLE_TACTICS = Object.freeze({
  guard: Object.freeze({ patrol: 1.15, advance: 2.2, strafe: 1.25, standoff: 5.5 }),
  traitor: Object.freeze({ patrol: 0.95, advance: 1.9, strafe: 1.1, standoff: 6.5 }),
  boss: Object.freeze({ patrol: 0.8, advance: 1.35, strafe: 0.85, standoff: 4.5 }),
});

/*
 * Contact calls.
 *
 * The single worst behaviour in the mission: `update` only moved a hostile
 * when it had a REMEMBERED point of its own, and memory only existed if that
 * hostile had personally seen the player. So an alarm -- a gunshot, a body
 * found, the dining-room doors -- activated eight guards who then stood
 * exactly where they were posted for the rest of the mission. Sixty seconds of
 * soak with the alarm up produced zero rounds fired.
 *
 * A sighting, and the alarm itself, now publish one shared last-known point.
 * It is a POSITION, not a target: nobody shoots at it, they walk to it, and it
 * goes stale on its own. Anyone who arrives and finds nothing falls back to
 * their post.
 */
const CONTACT_MEMORY_SECONDS = 14;
const CONTACT_RESPONSE_RANGE = 46;
/* Awareness at which a guard who has lost sight goes and looks rather than
 * carrying on with his round. */
const INVESTIGATE_AWARENESS = 0.35;

const HIT_ZONE_MULTIPLIER = Object.freeze({ head: 1, chest: 1, limb: 0.62 });
const UP = new THREE.Vector3(0, 1, 0);

/** Authored mechanical posts only; objectives, story anchors and boss phases stay untouched. */
export const PALACE_COMBAT_POSTS = Object.freeze([
  Object.freeze({ id: 'gate-jamb', kind: 'cover', position: new THREE.Vector3(10.8, 0, 51.4), score: 1.05 }),
  Object.freeze({ id: 'guardhouse-corner', kind: 'flank', position: new THREE.Vector3(5.8, 0, 42.2), score: 0.9 }),
  Object.freeze({ id: 'fountain-east', kind: 'cover', position: new THREE.Vector3(4.2, 0, 35.5), score: 1 }),
  Object.freeze({ id: 'fountain-west', kind: 'flank', position: new THREE.Vector3(-4.2, 0, 34.6), score: 0.88 }),
  Object.freeze({ id: 'pool-colonnade', kind: 'cover', position: new THREE.Vector3(-8.2, 0, 15.2), score: 0.96 }),
  Object.freeze({ id: 'service-door-jamb', kind: 'cover', position: new THREE.Vector3(11.6, 0, 9.8), score: 1.02 }),
  Object.freeze({ id: 'service-rack', kind: 'flank', position: new THREE.Vector3(14.1, 0, -7.8), score: 0.9 }),
  Object.freeze({ id: 'gallery-bench-east', kind: 'cover', position: new THREE.Vector3(7.8, 0, -23.1), score: 1 }),
  Object.freeze({ id: 'gallery-bench-west', kind: 'flank', position: new THREE.Vector3(-7.8, 0, -27.2), score: 0.91 }),
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function zoneOf(object) {
  let node = object ?? null;
  while (node) {
    if (node.userData?.hitZone) return node.userData.hitZone;
    node = node.parent ?? null;
  }
  return 'chest';
}

/**
 * Palace-local tactical Adapter. Ordinary guards may reserve authored cover
 * and flank posts; bosses and traitors retain their authored phase anchors.
 */
export function choosePalaceCombatPosition({
  entry,
  target,
  posts = [],
  reservations = new Set(),
  space = null,
} = {}) {
  if (!entry || entry.role === 'boss' || entry.role === 'traitor'
    || entry.id === 'mark' || entry.id === 'traitor') return null;
  const origin = entry.root?.position;
  if (!origin || !target) return null;
  const available = posts
    .filter((post) => post?.position?.isVector3 && !reservations?.has?.(post.id))
    .map((post) => {
      const distance = origin.distanceTo(post.position);
      const targetDistance = post.position.distanceTo(target);
      const blocked = space?.trace?.(
        origin.clone().setY(origin.y + 0.9),
        post.position.clone().setY(post.position.y + 0.9),
      );
      return {
        post,
        blocked: blocked != null,
        score: Number(post.score) || 0,
        distance,
        targetDistance,
      };
    })
    .filter((candidate) => !candidate.blocked)
    .sort((a, b) => (b.score - a.score)
      || (a.distance - b.distance)
      || String(a.post.id).localeCompare(String(b.post.id)));
  if (available.length === 0) return null;
  const winner = available[0];
  return Object.freeze({
    post: winner.post,
    kind: winner.post.kind ?? 'cover',
    score: winner.score,
    distance: winner.distance,
    targetDistance: winner.targetDistance,
  });
}

/**
 * Cartel Palace Combat Adapter.
 *
 * Patrol anchors, stealth escalation, boss phases and mission callbacks stay
 * authored here. Sight memory, physical movement, visible weapon alignment,
 * shot truth, impairments and Located hits are shared ground-combat Modules.
 */
export class PalaceSecurity {
  constructor({
    cast,
    colliders = [],
    combatPosts = PALACE_COMBAT_POSTS,
    playerActor = null,
    random = Math.random,
    onAlarm = () => {},
    onPlayerHit = () => {},
    onEnemyFire = () => {},
    onWeaponEvent = () => {},
    onStep = () => {},
    onTargetDown = () => {},
    onBossPhase = () => {},
  } = {}) {
    if (!cast?.all) throw new TypeError('PalaceSecurity requires a palace cast');
    this.cast = cast;
    this.colliders = colliders;
    this.combatPosts = Array.isArray(combatPosts) ? combatPosts : PALACE_COMBAT_POSTS;
    this.playerActor = playerActor;
    this.random = typeof random === 'function' ? random : Math.random;
    this.onAlarm = onAlarm;
    this.onPlayerHit = onPlayerHit;
    this.onEnemyFire = onEnemyFire;
    this.onWeaponEvent = onWeaponEvent;
    this.onStep = onStep;
    this.onTargetDown = onTargetDown;
    this.onBossPhase = onBossPhase;
    this.alarm = false;
    this.alarmReason = null;
    /* Shared last-known player position and how stale it is. Runtime only:
     * a checkpoint restore clears it along with live targets and alignment. */
    this.contactPoint = null;
    this.contactAge = Infinity;
    this.playerPoint = null;
    this.space = new AabbCombatSpace({
      boxes: colliders,
      radius: 0.31,
      height: 1.78,
      separation: 0.58,
      verticalSeparation: 1.25,
    });
    this.fireControl = new CombatFireControl({
      random: this.random,
      space: this.space,
      colliders,
    });
    this.impactResolver = new CombatImpactResolver();
    this.runtime = new Map();
    this.tacticalReservations = new Map();
    this._unregister = [];
    this.stats = {
      takedowns: 0,
      alerts: 0,
      roundsFired: 0,
      targetsDown: [],
      blockedMoves: 0,
      nearMisses: 0,
    };

    for (const entry of cast.all) {
      const runtime = {
        perception: new CombatPerception({
          fov: VISION.fov,
          memorySeconds: VISION.memorySeconds,
          awarenessGain: 0,
          memoryAwarenessLoss: 0,
          lostAwarenessLoss: 0,
          space: this.space,
        }),
        impairments: new CombatImpairments(),
        suppression: new SuppressionModel(),
        aim: new CombatWeaponAim(),
        firearm: new Firearm(entry.weapon),
        shotClock: 0.35 + this.random() * 0.65,
        restGunQuaternion: entry.weaponModel?.quaternion?.clone?.() ?? null,
        authoredPosition: entry.root.position.clone(),
        detourSide: String(entry.id).split('')
          .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 1 : -1,
        detourTime: 0,
        tacticTime: 0,
        tacticalPost: null,
        reaction: null,
        reloadPose: 0,
      };
      this.runtime.set(entry.id, runtime);
      entry.perception = runtime.perception;
      entry.impairments = runtime.impairments;
      entry.suppression = runtime.suppression;
      entry.weaponAim = runtime.aim;
      entry.firearm = runtime.firearm;
      entry.aimPoint = new THREE.Vector3();
      entry.lastSeen = new THREE.Vector3();
      entry.aimAligned = false;
      entry.aimError = Infinity;
      entry.boreError = Infinity;
      entry.blocked = false;
      entry.lastShot = null;
      entry.lastShotOrigin = null;
      entry.reloadPose = 0;
      this._unregister.push(this.impactResolver.register(entry.root, {
        actor: entry.actor,
        combatant: entry,
      }));
    }
  }

  _runtime(entry) {
    return entry ? this.runtime.get(entry.id) ?? null : null;
  }

  /** A durable pose may move only into free live body space. */
  _restorablePosition(value, authored = null) {
    if (!Array.isArray(value) || value.length < 3
      || !value.slice(0, 3).every((axis) => Number.isFinite(axis))) return null;
    const point = new THREE.Vector3().fromArray(value);
    if (authored && (Math.abs(point.y - authored.y) > 0.5
      || Math.hypot(point.x - authored.x, point.z - authored.z) > 180)) return null;
    for (const box of this.colliders ?? []) {
      if (!box?.min || !box?.max) continue;
      const vertical = box.max.y > point.y + this.space.floorClearance
        && box.min.y < point.y + this.space.height - this.space.headClearance;
      const horizontal = point.x > box.min.x - this.space.radius
        && point.x < box.max.x + this.space.radius
        && point.z > box.min.z - this.space.radius
        && point.z < box.max.z + this.space.radius;
      if (vertical && horizontal) return null;
    }
    return point;
  }

  _checkpointPosition(value, runtime) {
    const authored = runtime.authoredPosition;
    return this._restorablePosition(value, authored)
      ?? this._restorablePosition(authored.toArray(), authored)
      ?? authored.clone();
  }

  _scan(entry, playerPosition, { powerCut = false, crouching = false } = {}) {
    const runtime = this._runtime(entry);
    if (!runtime || !entry.active || entry.down) return null;
    const origin = entry.root.position.clone();
    origin.y += 1.52;
    const point = playerPosition.clone();
    point.y = crouching ? 0.96 : 1.5;
    let range = powerCut ? VISION.blackoutDistance : VISION.poweredDistance;
    if (crouching) range *= VISION.crouchFactor;
    runtime.sightRange = range;
    const forward = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(UP, entry.root.rotation.y);
    const candidate = {
      id: 'prospect',
      actor: this.playerActor,
      point,
      position: point,
    };
    const seen = runtime.perception.scan({
      origin,
      forward,
      range,
      fov: VISION.fov,
      candidates: [candidate],
      boxes: this.colliders,
      samplePoint: (target) => target.point,
    });
    if (seen) {
      entry.aimPoint.copy(seen.point);
      entry.lastSeen.copy(seen.point);
      this._noteContact(seen.point);
    }
    return seen;
  }

  /**
   * Publish one shared last-known player position.
   *
   * This is deliberately a point and not a target: `_fire` still requires the
   * shooter's own unblocked sight, so a contact call moves people and never
   * puts a round through a wall.
   */
  _noteContact(point) {
    if (!point?.isVector3) return null;
    (this.contactPoint ??= new THREE.Vector3()).copy(point);
    this.contactAge = 0;
    return this.contactPoint;
  }

  /** The shared point, if it is fresh enough and near enough to be this one's problem. */
  _sharedContact(entry) {
    if (!this.contactPoint || this.contactAge > CONTACT_MEMORY_SECONDS) return null;
    if (entry.root.position.distanceTo(this.contactPoint) > CONTACT_RESPONSE_RANGE) return null;
    return this.contactPoint;
  }

  canSee(entry, playerPosition, options = {}) {
    if (!playerPosition?.isVector3) return false;
    return Boolean(this._scan(entry, playerPosition, options));
  }

  raiseAlarm(reason = 'detected') {
    if (this.alarm) return false;
    this.alarm = true;
    this.alarmReason = reason;
    this.stats.alerts++;
    this.onAlarm(reason);
    for (const guard of this.cast.guards) guard.active = !guard.down;
    /* Whatever raised it -- a gunshot, a contact, the dining-room doors --
     * happened where the player is standing. Everyone gets that address. */
    this._noteContact(this.playerPoint);
    return true;
  }

  silentTakedown(id, { distance = Infinity } = {}) {
    const entry = this.cast.guards.find((guard) => guard.id === id);
    if (!entry || entry.down || !entry.active || this.alarm
      || entry.awareness >= 0.72 || distance > 2.4) return false;
    const result = entry.actor.applyHit({
      amount: entry.actor.maxHealth,
      attacker: { faction: FACTIONS.CREW },
      playerShot: true,
      lethal: true,
    });
    if (!result.applied) return false;
    this.cast.markDown(entry);
    this.stats.takedowns++;
    this.stats.targetsDown.push(entry.id);
    this.onTargetDown(entry, { silent: true, result });
    return true;
  }

  applyPlayerImpact(impact) {
    if (!impact?.object) return { applied: false, reason: 'no-object' };
    this.raiseAlarm('gunshot');
    const def = weaponDef(impact.weapon);
    const zone = zoneOf(impact.object);
    const located = this.impactResolver.resolve({
      ...impact,
      damage: finite(impact.damage, def?.damage ?? 25),
      penetration: finite(impact.penetration, def?.penetration ?? 0),
    }, {
      attacker: { faction: FACTIONS.CREW },
      playerShot: true,
      damageScale: HIT_ZONE_MULTIPLIER[zone] ?? 1,
      lethalHeadshots: true,
    });
    const entry = located.combatant ?? null;
    if (!located.applied || !entry) return { ...located, entry };
    const runtime = this._runtime(entry);
    runtime?.impairments.applyResolvedHit(located);
    const reaction = resolveCombatReaction({
      direction: located.direction,
      actorYaw: entry.root.rotation.y,
      fatal: located.fatal,
    });
    if (runtime) runtime.reaction = reaction;
    const armorBreakPresented = entry.armorPresentation
      ? entry.armorPresentation.applyResult(located.result) === true
      : false;
    if (entry.role === 'boss' && located.result.armorBroken) {
      entry.phase = 'exposed';
      this.onBossPhase('exposed', entry);
    }
    if (located.fatal || entry.actor.incapacitated) {
      this.cast.markDown(entry, { reaction });
      if (entry.role === 'boss') {
        entry.phase = 'down';
        this.onBossPhase('down', entry);
      }
      if (!this.stats.targetsDown.includes(entry.id)) this.stats.targetsDown.push(entry.id);
      this.onTargetDown(entry, {
        silent: false,
        zone: located.zone,
        weaponId: impact.weapon,
        result: located.result,
      });
    }
    return {
      ...located,
      entry,
      amount: located.result.raw,
      reaction,
      armorBreakPresented,
    };
  }

  /** Backward-compatible test/authoring Adapter for the old two-argument API. */
  applyPlayerShot(objectOrImpact, weaponId = null) {
    if (objectOrImpact?.object && weaponId === null) {
      return this.applyPlayerImpact(objectOrImpact);
    }
    const object = objectOrImpact;
    if (!object) return { applied: false, reason: 'no-object' };
    object.updateWorldMatrix?.(true, false);
    const point = object.getWorldPosition?.(new THREE.Vector3()) ?? new THREE.Vector3();
    const origin = point.clone().add(new THREE.Vector3(0, 0, 4));
    const direction = point.clone().sub(origin).normalize();
    const def = weaponDef(weaponId);
    return this.applyPlayerImpact({
      object,
      weapon: weaponId,
      point,
      normal: direction.clone().negate(),
      origin,
      direction,
      distance: origin.distanceTo(point),
      damage: def?.damage ?? 25,
      penetration: def?.penetration ?? 0,
    });
  }

  activateFinalEncounter() {
    this.cast.activateFinalEncounter();
    this.raiseAlarm('dining_room');
  }

  _move(entry, displacement) {
    const result = this.space.move(entry.root.position, displacement, {
      boxes: this.colliders,
    });
    entry.blocked = result.blocked;
    if (result.blocked) this.stats.blockedMoves++;
    return result;
  }

  /**
   * Keep authored patrol/combat goals, but walk around a local blocker when a
   * direct step is materially lost. Every candidate still travels through
   * AabbCombatSpace; this is a small Adapter steering policy, not a navmesh.
   */
  _moveWithDetour(entry, displacement, runtime, dt) {
    const wanted = displacement.clone().setY(0);
    const length = wanted.length();
    if (length <= 1e-8) return this._move(entry, wanted);
    const forward = wanted.clone().multiplyScalar(1 / length);
    const tangent = (side) => new THREE.Vector3(
      forward.z * side,
      0,
      -forward.x * side,
    );
    const meaningful = (result, distance = length) => (
      result.moved >= distance * 0.62
    );
    const trySide = (side, distance) => this._move(
      entry,
      tangent(side).multiplyScalar(distance),
    );

    if (runtime.detourTime > 0) {
      runtime.detourTime = Math.max(0, runtime.detourTime - dt);
      let result = trySide(runtime.detourSide, length);
      if (!meaningful(result)) {
        const alternate = trySide(-runtime.detourSide, Math.max(0, length - result.moved));
        if (alternate.moved > result.moved) {
          runtime.detourSide *= -1;
          result = alternate;
        }
      }
      return result;
    }

    const direct = this._move(entry, wanted);
    if (!direct.blocked || meaningful(direct)) return direct;
    const remaining = Math.max(0, length - direct.moved);
    runtime.detourTime = 0.72;
    let result = trySide(runtime.detourSide, remaining);
    if (!meaningful(result, remaining)) {
      const alternateDistance = Math.max(0, remaining - result.moved);
      const alternate = trySide(-runtime.detourSide, alternateDistance);
      if (alternate.moved > result.moved) {
        runtime.detourSide *= -1;
        result = alternate;
      }
    }
    return result;
  }

  _tactics(entry) {
    return ROLE_TACTICS[entry?.role] ?? ROLE_TACTICS.guard;
  }

  _patrol(entry, dt, speedScale = 1) {
    if (!entry.patrol.length) return;
    const goal = entry.patrol[entry.patrolIndex % entry.patrol.length];
    const direction = goal.clone().sub(entry.root.position).setY(0);
    const distance = direction.length();
    if (distance < 0.22) {
      entry.patrolIndex = (entry.patrolIndex + 1) % entry.patrol.length;
      return;
    }
    const speed = this._tactics(entry).patrol;
    direction.multiplyScalar(Math.min(distance, dt * speed * speedScale) / distance);
    const runtime = this._runtime(entry);
    this._moveWithDetour(entry, direction, runtime, dt);
    if (!entry.aimAligned) entry.root.rotation.y = Math.atan2(direction.x, direction.z);
  }

  /**
   * Go and look, before anyone has shouted.
   *
   * A guard who half-saw something used to finish the sentence by walking the
   * rest of his patrol loop. He now walks to where he last saw it and stands
   * there until his memory runs out, which is what makes breaking line of
   * sight a decision rather than an off switch.
   */
  _investigate(entry, dt, point, speedScale = 1) {
    if (!point?.isVector3) return;
    const runtime = this._runtime(entry);
    const toward = point.clone().sub(entry.root.position).setY(0);
    const distance = toward.length();
    if (distance <= 1.2) {
      if (!entry.aimAligned && distance > 1e-6) {
        entry.root.rotation.y = Math.atan2(toward.x, toward.z);
      }
      return;
    }
    const speed = this._tactics(entry).patrol * 1.3;
    toward.multiplyScalar(Math.min(distance, dt * speed * speedScale) / distance);
    this._moveWithDetour(entry, toward, runtime, dt);
    if (!entry.aimAligned) entry.root.rotation.y = Math.atan2(toward.x, toward.z);
  }

  _combatMove(entry, dt, targetPoint, speedScale = 1) {
    if (!targetPoint?.isVector3) return;
    const runtime = this._runtime(entry);
    runtime.tacticTime = Math.max(0, runtime.tacticTime - dt);
    if (entry.role === 'guard' && runtime.tacticTime <= 0) {
      if (runtime.tacticalPost) this.tacticalReservations.delete(runtime.tacticalPost.id);
      const underPressure = runtime.suppression.value >= 0.42;
      const searchRadius = underPressure ? 18 : 13.5;
      const localPosts = this.combatPosts.filter((post) => (
        post.position.distanceTo(entry.root.position) <= searchRadius
        && (!underPressure || post.kind === 'cover')
      ));
      const choice = choosePalaceCombatPosition({
        entry,
        target: targetPoint,
        posts: localPosts,
        reservations: new Set(this.tacticalReservations.keys()),
        space: this.space,
      });
      runtime.tacticalPost = choice?.post ?? null;
      if (runtime.tacticalPost) {
        this.tacticalReservations.set(runtime.tacticalPost.id, entry.id);
      }
      runtime.tacticTime = 2.8 + (String(entry.id).length % 3) * 0.45;
    }
    const tacticalGoal = runtime.tacticalPost?.position ?? null;
    if (tacticalGoal && runtime.tacticalPost.kind === 'cover'
      && tacticalGoal.distanceTo(entry.root.position) <= 0.48) return;
    const holdingPost = Boolean(tacticalGoal
      && tacticalGoal.distanceTo(entry.root.position) > 0.48);
    const movementTarget = holdingPost ? tacticalGoal : targetPoint;
    const toward = movementTarget.clone().sub(entry.root.position).setY(0);
    const distance = toward.length();
    if (distance < 0.001) return;
    toward.multiplyScalar(1 / distance);
    const tactics = this._tactics(entry);
    let direction = toward;
    let speed = tactics.advance;
    /* Standoff discipline, but never while a detour is in progress: a man
     * already walking round a wall must finish that before he starts having
     * opinions about range, or he sidesteps into the wall he was avoiding. */
    if (!holdingPost && runtime.detourTime <= 0) {
      if (distance < tactics.standoff - 2) {
        direction = toward.clone().negate();
        speed = tactics.strafe;
      } else if (distance <= tactics.standoff + 1.5) {
        const side = runtime.detourSide;
        direction = new THREE.Vector3(toward.z * side, 0, -toward.x * side);
        speed = tactics.strafe;
      }
    }
    this._moveWithDetour(
      entry,
      direction.multiplyScalar(dt * speed * speedScale),
      runtime,
      dt,
    );
  }

  _pose(entry, runtime, frame) {
    entry.aimPitch = frame.pitch;
    const reaction = runtime.impairments.reaction;
    const directional = runtime.reaction;
    const parts = entry.figure.parts;
    if (parts?.body) {
      parts.body.rotation.z = (directional?.side ?? 0) * reaction * 0.13;
      parts.body.rotation.x = (directional?.forward ?? 0) * reaction * 0.08;
    }
    if (parts?.head) parts.head.rotation.x = -frame.pitch * 0.32 + reaction * 0.16;
    if (parts?.armR) parts.armR.rotation.x = -1.28 - frame.pitch * 0.72 + reaction * 0.52;
    if (parts?.foreR) parts.foreR.rotation.x = -0.16 - frame.pitch * 0.28;
    if (parts?.armL) parts.armL.rotation.x = -1.2 - frame.pitch * 0.65 - reaction * 0.25;
    if (parts?.foreL) parts.foreL.rotation.x = -0.3 - frame.pitch * 0.2;
    if (runtime.reloadPose > 0) {
      if (parts?.armR) parts.armR.rotation.x = -0.54;
      if (parts?.foreR) parts.foreR.rotation.x = -0.78;
      if (parts?.armL) parts.armL.rotation.x = -0.42;
      if (parts?.foreL) parts.foreL.rotation.x = -0.92;
    }
    if ((!frame.hasTarget || frame.interrupted) && runtime.restGunQuaternion && entry.weaponModel) {
      entry.weaponModel.quaternion.copy(runtime.restGunQuaternion);
      if (frame.interrupted) entry.weaponModel.rotateZ(reaction * 0.55);
      if (runtime.reloadPose > 0) entry.weaponModel.rotateZ(-0.72);
    }
  }

  _publishWeaponEvent(entry, runtime, event = {}) {
    if (event.type === 'reload-start' || event.type === 'eject') runtime.reloadPose = 1;
    else if (event.type === 'loaded') runtime.reloadPose = 0;
    entry.reloadPose = runtime.reloadPose;
    if (entry.weaponModel) entry.weaponModel.userData.reloadPose = runtime.reloadPose;
    const position = event.origin?.isVector3
      ? event.origin.clone()
      : entry.weaponModel?.getWorldPosition?.(new THREE.Vector3())
        ?? entry.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.onWeaponEvent({ ...event, id: entry.id, weapon: entry.weapon, entry, position });
  }

  _fire(entry, runtime, frame, playerPoint) {
    runtime.shotClock = Math.max(0, runtime.shotClock);
    if (runtime.shotClock > 0 || !frame.aligned || !runtime.perception.targetVisible) return;
    const distance = frame.origin?.distanceTo(playerPoint) ?? Infinity;
    const boss = entry.role === 'boss';
    const cadence = boss ? 0.19 : entry.role === 'traitor' ? 0.72 : 0.82;
    runtime.shotClock = cadence + this.random() * (boss ? 0.14 : 0.42);
    runtime.firearm.setTrigger(true);
    const round = runtime.firearm.fire({
      aimed: true,
      aimStability: runtime.impairments.accuracyScale * runtime.suppression.aimStability,
    });
    runtime.firearm.setTrigger(false);
    if (!round.fired) {
      if (round.reason === 'empty') {
        this._publishWeaponEvent(entry, runtime, { type: 'empty' });
      }
      if (round.reason === 'empty' && runtime.firearm.reload()) {
        this._publishWeaponEvent(entry, runtime, { type: 'reload-start' });
      }
      return;
    }
    const baseAccuracy = boss ? 0.78 : entry.role === 'traitor' ? 0.62 : 0.58;
    const accuracy = THREE.MathUtils.clamp(
      (baseAccuracy - distance * 0.012)
        * runtime.impairments.accuracyScale
        * runtime.suppression.aimStability,
      0.12,
      0.82,
    );
    const shot = this.fireControl.resolveShot({
      origin: frame.origin,
      boreDirection: frame.direction,
      aimPoint: runtime.perception.sampledPoint,
      targetPoint: playerPoint,
      target: { id: 'prospect', actor: this.playerActor, point: playerPoint },
      targetVisible: runtime.perception.targetVisible,
      attacker: { faction: FACTIONS.CARTEL },
      damage: boss ? 12 : entry.role === 'traitor' ? 15 : 9,
      accuracy,
      colliders: this.colliders,
    });
    if (!shot.fired) return;
    this._publishWeaponEvent(entry, runtime, {
      type: 'shot', id: entry.id, weapon: entry.weapon, entry,
      origin: shot.origin?.clone?.() ?? null,
      direction: shot.direction?.clone?.() ?? null,
    });
    this.stats.roundsFired++;
    if (shot.nearMiss) this.stats.nearMisses++;
    entry.lastShot = {
      origin: shot.origin?.clone?.() ?? null,
      direction: shot.direction?.clone?.() ?? null,
      end: shot.end?.clone?.() ?? null,
      blocked: shot.blocked,
      hit: shot.hit,
      nearMiss: shot.nearMiss,
      targetId: shot.targetId,
    };
    this.onEnemyFire({ ...shot, entry, from: shot.origin, to: shot.end });
    if (shot.applied) {
      this.onPlayerHit({
        id: entry.id,
        role: entry.role,
        amount: shot.damage,
        result: shot.result,
        shot,
      });
    }
  }

  update(dt, {
    playerPosition,
    powerCut = false,
    crouching = false,
    finalEncounter = false,
  } = {}) {
    if (!playerPosition?.isVector3) return;
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    this.fireControl.update(step);
    (this.playerPoint ??= new THREE.Vector3()).copy(playerPosition);
    this.contactAge += step;
    for (const entry of this.cast.all) {
      const runtime = this._runtime(entry);
      const weaponEvents = runtime.firearm.update(step);
      for (const event of weaponEvents) {
        this._publishWeaponEvent(entry, runtime, event);
      }
      runtime.impairments.update(step);
      runtime.suppression.update(step);
      entry.actor.suppression = runtime.suppression.value;
      if (runtime.suppression.value >= 0.42 && runtime.tacticalPost?.kind !== 'cover') {
        runtime.tacticTime = 0;
      }
      runtime.shotClock = Math.max(0, runtime.shotClock - step);
      entry.figure.update(step, { fear: entry.awareness });
      if (!entry.active || entry.down) continue;

      const seen = this._scan(entry, playerPosition, { powerCut, crouching });
      runtime.perception.tick(step);
      if (!this.alarm && entry.role === 'guard') {
        /* A shape at the far edge of what he can see takes longer to become a
         * man than one at four metres. Without this term the longer sight
         * range would simply have deleted the stealth approach. */
        const gain = seen
          ? (powerCut ? VISION.blackoutGain : VISION.poweredGain) * THREE.MathUtils.clamp(
            1 - (seen.distance / Math.max(1, runtime.sightRange ?? VISION.poweredDistance)),
            VISION.minimumGainScale,
            1,
          )
          : 0;
        runtime.perception.awareness = THREE.MathUtils.clamp(
          runtime.perception.awareness + (seen ? step * gain : -step * VISION.loss),
          0,
          1,
        );
        if (runtime.perception.awareness >= 1) this.raiseAlarm('guard_contact');
      } else if (seen) {
        runtime.perception.awareness = 1;
      } else if (runtime.perception.hasMemory) {
        runtime.perception.awareness = Math.max(0.7, runtime.perception.awareness - step * 0.04);
      }
      entry.awareness = runtime.perception.awareness;

      /* Own eyes first, own memory second, the shared contact call last. */
      const remembered = seen?.point
        ?? runtime.perception.lastSeen
        ?? this._sharedContact(entry);
      const beforeMove = entry.root.position.clone();
      if (!this.alarm && entry.role === 'guard') {
        if (runtime.perception.hasMemory
          && runtime.perception.awareness >= INVESTIGATE_AWARENESS) {
          this._investigate(entry, step, runtime.perception.lastSeen,
            runtime.impairments.speedScale);
        } else {
          this._patrol(entry, step, runtime.impairments.speedScale);
        }
      } else if ((this.alarm || finalEncounter) && remembered) {
        this._combatMove(entry, step, remembered, runtime.impairments.speedScale);
      }
      this.space.separate(entry, this.cast.all, {
        boxes: this.colliders,
        id: entry.id,
      });
      const moved = beforeMove.distanceTo(entry.root.position);
      this.onStep({
        id: entry.id,
        entry,
        dt: step,
        position: entry.root.position.clone(),
        distance: moved,
        moving: moved > 1e-6,
      });

      /* Weapon up and pointed where he is going, including at a contact call
       * he has not seen for himself. `_fire` below still demands his own
       * unblocked sight, so facing a called position never becomes shooting
       * at one. */
      const targetPoint = (this.alarm || finalEncounter)
        ? remembered
        : (seen?.point ?? runtime.perception.lastSeen);
      const frame = runtime.aim.update(step, {
        root: entry.root,
        weaponModel: entry.weaponModel,
        targetPoint,
        muzzleHeight: 1.38,
        settleScale: runtime.impairments.aimSettleScale,
        interrupted: runtime.impairments.interrupted || runtime.firearm.reloading,
        pose: (poseFrame) => this._pose(entry, runtime, poseFrame),
      });
      entry.aimAligned = frame.aligned;
      entry.aimError = frame.aimError;
      entry.boreError = frame.boreError;
      if (frame.origin) entry.lastShotOrigin = frame.origin.clone();
      if ((this.alarm || finalEncounter) && seen) this._fire(entry, runtime, frame, seen.point);
    }
  }

  /** JSON-safe runtime/durable combat state; never includes Object3D refs. */
  snapshot() {
    return {
      version: 1,
      alarm: this.alarm,
      alarmReason: this.alarmReason,
      stats: JSON.parse(JSON.stringify(this.stats)),
      fireControl: this.fireControl.snapshot(),
      entries: this.cast.all.map((entry) => {
        const runtime = this._runtime(entry);
        entry.actor.suppression = runtime.suppression.value;
        const aim = runtime.aim.snapshot();
        /* Restore clears the live target and applies `aim.yaw` to the root.
         * Serialize the visible root yaw into both fields so the durable
         * record is canonical even for dormant cast who never ran aim.update. */
        aim.yaw = entry.root.rotation.y;
        return {
          id: entry.id,
          active: entry.active,
          down: entry.down,
          phase: entry.phase ?? null,
          position: this._checkpointPosition(entry.root.position.toArray(), runtime).toArray(),
          yaw: entry.root.rotation.y,
          patrolIndex: entry.patrolIndex,
          actor: entry.actor.durableSnapshot(),
          firearm: runtime.firearm.snapshot(),
          perception: runtime.perception.snapshot(),
          impairments: runtime.impairments.snapshot(),
          suppression: runtime.suppression.snapshot(),
          aim,
          shotClock: runtime.shotClock,
          tacticTime: runtime.tacticTime,
          tacticalPost: runtime.tacticalPost?.id ?? null,
        };
      }),
    };
  }

  restore(snapshot = {}) {
    this.alarm = snapshot.alarm === true;
    this.alarmReason = snapshot.alarmReason ?? null;
    this.stats = {
      ...this.stats,
      ...(snapshot.stats && typeof snapshot.stats === 'object' ? snapshot.stats : {}),
      targetsDown: Array.isArray(snapshot.stats?.targetsDown)
        ? [...snapshot.stats.targetsDown] : [],
    };
    this.fireControl.restore(snapshot.fireControl);
    this.tacticalReservations.clear();
    /* A contact call is live runtime state, like a live target or a settled
     * bore: restoring a checkpoint has to forget it rather than resurrect a
     * position from the discarded timeline. */
    this.contactPoint = null;
    this.contactAge = Infinity;
    const records = new Map((snapshot.entries ?? []).map((record) => [record.id, record]));
    for (const entry of this.cast.all) {
      const record = records.get(entry.id);
      if (!record) continue;
      const runtime = this._runtime(entry);
      entry.actor.restoreDurable(record.actor);
      entry.active = record.active === true && !entry.actor.incapacitated;
      entry.down = record.down === true || entry.actor.incapacitated;
      entry.phase = record.phase ?? entry.phase;
      const restoredPosition = this._checkpointPosition(record.position, runtime);
      entry.root.position.copy(restoredPosition);
      entry.root.rotation.y = finite(record.yaw, entry.root.rotation.y);
      entry.patrolIndex = Math.max(0, Math.trunc(finite(record.patrolIndex, 0)));
      runtime.firearm.restore(record.firearm);
      runtime.perception.restore(record.perception);
      runtime.impairments.restore(record.impairments);
      runtime.suppression.restore(record.suppression);
      entry.actor.suppression = runtime.suppression.value;
      runtime.aim.restore(record.aim, { root: entry.root });
      runtime.shotClock = Math.max(0, finite(record.shotClock, 0));
      runtime.detourTime = 0;
      runtime.tacticTime = Math.max(0, finite(record.tacticTime, 0));
      runtime.tacticalPost = this.combatPosts.find(
        (post) => post.id === record.tacticalPost,
      ) ?? null;
      if (runtime.tacticalPost && entry.active && !entry.down) {
        this.tacticalReservations.set(runtime.tacticalPost.id, entry.id);
      }
      runtime.reaction = null;
      runtime.reloadPose = 0;
      entry.reloadPose = 0;
      if (entry.weaponModel) entry.weaponModel.userData.reloadPose = 0;
      entry.awareness = runtime.perception.awareness;
      if (runtime.perception.lastSeen) entry.lastSeen.copy(runtime.perception.lastSeen);
      else entry.lastSeen.set(0, 0, 0);
      entry.aimAligned = false;
      entry.aimError = Infinity;
      entry.boreError = Infinity;
      entry.blocked = false;
      entry.lastShot = null;
      entry.lastShotOrigin = null;
      entry.aimPoint.set(0, 0, 0);
      entry.aimPitch = 0;
      if (runtime.restGunQuaternion && entry.weaponModel) {
        entry.weaponModel.quaternion.copy(runtime.restGunQuaternion);
      }
      if (entry.down) {
        entry.down = false;
        this.cast.markDown(entry);
      } else {
        entry.figure.setState?.('stand', { blend: false });
        if (entry.weaponModel) entry.weaponModel.visible = true;
      }
      if (entry.armorPresentation) entry.armorPresentation.restore();
    }
    return this;
  }

  dispose() {
    for (const unregister of this._unregister.splice(0)) unregister();
  }
}

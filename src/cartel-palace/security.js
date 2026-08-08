import * as THREE from 'three';

import { FACTIONS } from '../core/combat/factions.js';
import { weaponDef } from '../core/weapons/catalog.js';

const VISION = Object.freeze({
  poweredDistance: 14,
  blackoutDistance: 8.5,
  crouchFactor: 0.72,
  halfAngleCos: Math.cos(58 * Math.PI / 180),
});

const HIT_ZONE_MULTIPLIER = Object.freeze({ head: 2.25, chest: 1, limb: 0.62 });
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _ray = new THREE.Ray();

function ownerOf(object) {
  let current = object;
  while (current) {
    if (current.userData?.palaceCombatant) return current.userData.palaceCombatant;
    current = current.parent;
  }
  return null;
}

function hitZoneOf(object) {
  let current = object;
  while (current) {
    if (current.userData?.hitZone) return current.userData.hitZone;
    current = current.parent;
  }
  return 'chest';
}

/**
 * Small infiltration director: authored patrol paths, sight cones, quiet
 * takedowns, alarm escalation, and the final-room combat loop. Rendering and
 * mission progression remain outside this module.
 */
export class PalaceSecurity {
  constructor({
    cast,
    colliders = [],
    onAlarm = () => {},
    onPlayerHit = () => {},
    onEnemyFire = () => {},
    onTargetDown = () => {},
    onBossPhase = () => {},
  } = {}) {
    this.cast = cast;
    this.colliders = colliders;
    this.onAlarm = onAlarm;
    this.onPlayerHit = onPlayerHit;
    this.onEnemyFire = onEnemyFire;
    this.onTargetDown = onTargetDown;
    this.onBossPhase = onBossPhase;
    this.alarm = false;
    this.alarmReason = null;
    this.shotClock = new Map();
    this.stats = { takedowns: 0, alerts: 0, roundsFired: 0, targetsDown: [] };
  }

  canSee(entry, playerPosition, { powerCut = false, crouching = false } = {}) {
    if (!entry?.active || entry.down) return false;
    _from.copy(entry.root.position).setY(1.52);
    _to.copy(playerPosition).setY(crouching ? 0.96 : 1.5);
    _direction.subVectors(_to, _from);
    const distance = _direction.length();
    let range = powerCut ? VISION.blackoutDistance : VISION.poweredDistance;
    if (crouching) range *= VISION.crouchFactor;
    if (distance > range || distance < 0.01) return false;
    _direction.multiplyScalar(1 / distance);
    _forward.set(0, 0, 1).applyAxisAngle(UP, entry.root.rotation.y);
    if (_forward.dot(_direction) < VISION.halfAngleCos) return false;

    _ray.set(_from, _direction);
    for (const collider of this.colliders) {
      const point = _ray.intersectBox(collider, _hit);
      if (point && point.distanceTo(_from) < distance - 0.25) return false;
    }
    return true;
  }

  raiseAlarm(reason = 'detected') {
    if (this.alarm) return false;
    this.alarm = true;
    this.alarmReason = reason;
    this.stats.alerts++;
    this.onAlarm(reason);
    for (const guard of this.cast.guards) guard.active = !guard.down;
    return true;
  }

  silentTakedown(id, { distance = Infinity } = {}) {
    const entry = this.cast.guards.find((guard) => guard.id === id);
    if (!entry || entry.down || !entry.active || this.alarm || entry.awareness >= 0.72 || distance > 2.4) {
      return false;
    }
    entry.actor.applyHit({
      amount: entry.actor.maxHealth + entry.actor.armor * 2 + 1,
      attacker: { faction: FACTIONS.CREW },
      playerShot: true,
    });
    this.cast.markDown(entry);
    this.stats.takedowns++;
    this.stats.targetsDown.push(entry.id);
    this.onTargetDown(entry, { silent: true });
    return true;
  }

  applyPlayerShot(object, weaponId) {
    const entry = ownerOf(object);
    if (!entry || entry.down || !entry.active) return { applied: false, reason: 'inactive' };
    this.raiseAlarm('gunshot');
    const def = weaponDef(weaponId);
    const zone = hitZoneOf(object);
    const amount = (def?.damage ?? 25) * (HIT_ZONE_MULTIPLIER[zone] ?? 1);
    const beforeArmor = entry.actor.armor;
    const result = entry.actor.applyHit({
      amount,
      attacker: { faction: FACTIONS.CREW },
      playerShot: true,
    });
    if (entry.role === 'boss' && beforeArmor > 0 && entry.actor.armor <= 0) {
      entry.phase = 'exposed';
      this.onBossPhase('exposed', entry);
    }
    if (result.fatal || entry.actor.incapacitated) {
      this.cast.markDown(entry);
      if (entry.role === 'boss') {
        entry.phase = 'down';
        this.onBossPhase('down', entry);
      }
      this.stats.targetsDown.push(entry.id);
      this.onTargetDown(entry, { silent: false, zone, weaponId });
    }
    return { ...result, entry, zone, amount };
  }

  activateFinalEncounter() {
    this.cast.activateFinalEncounter();
    this.raiseAlarm('dining_room');
  }

  _patrol(entry, dt) {
    if (!entry.patrol.length) return;
    const goal = entry.patrol[entry.patrolIndex % entry.patrol.length];
    _direction.subVectors(goal, entry.root.position);
    _direction.y = 0;
    const distance = _direction.length();
    if (distance < 0.22) {
      entry.patrolIndex = (entry.patrolIndex + 1) % entry.patrol.length;
      return;
    }
    _direction.multiplyScalar(1 / distance);
    entry.root.position.addScaledVector(_direction, Math.min(distance, dt * 0.62));
    entry.root.rotation.y = Math.atan2(_direction.x, _direction.z);
  }

  _fire(entry, dt, playerPosition) {
    let clock = (this.shotClock.get(entry.id) ?? (0.35 + Math.random() * 0.65)) - dt;
    if (clock > 0) {
      this.shotClock.set(entry.id, clock);
      return;
    }
    const distance = entry.root.position.distanceTo(playerPosition);
    const boss = entry.role === 'boss';
    const cadence = boss ? 0.19 : entry.role === 'traitor' ? 0.72 : 0.82;
    clock = cadence + Math.random() * (boss ? 0.14 : 0.42);
    this.shotClock.set(entry.id, clock);
    this.stats.roundsFired++;
    const accuracy = THREE.MathUtils.clamp((boss ? 0.78 : 0.58) - distance * 0.012, 0.18, 0.78);
    const hit = Math.random() < accuracy;
    this.onEnemyFire({
      entry,
      hit,
      from: entry.root.position.clone().setY(1.38),
      to: playerPosition.clone().setY(1.25),
    });
    if (hit) {
      this.onPlayerHit({
        id: entry.id,
        role: entry.role,
        amount: boss ? 12 : entry.role === 'traitor' ? 15 : 9,
      });
    }
  }

  update(dt, {
    playerPosition,
    powerCut = false,
    crouching = false,
    finalEncounter = false,
  } = {}) {
    if (!playerPosition) return;
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    for (const entry of this.cast.all) {
      entry.figure.update(step, { fear: entry.awareness });
      if (!entry.active || entry.down) continue;
      if (entry.role === 'guard' && !this.alarm) this._patrol(entry, step);
      const seen = this.canSee(entry, playerPosition, { powerCut, crouching });
      if (!this.alarm && entry.role === 'guard') {
        entry.awareness = THREE.MathUtils.clamp(
          entry.awareness + (seen ? step * (powerCut ? 0.88 : 1.65) : -step * 0.72),
          0,
          1,
        );
        if (entry.awareness >= 1) this.raiseAlarm('guard_contact');
      }
      if ((this.alarm || finalEncounter) && seen) this._fire(entry, step, playerPosition);
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);

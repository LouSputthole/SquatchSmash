/**
 * Initiation scene Adapter for the shared first-person Player Module.
 *
 * The scene still owns its ceremony blocking and its presentation-only Tony
 * figure. This Adapter owns only the Player/world Interface and the three
 * control states the scene needs: playable first person, stationary free-look,
 * and an authored cutscene camera.
 */
import * as THREE from 'three';

import { Player } from '../core/player.js';

export const INITIATION_CONTROL_MODES = Object.freeze({
  PLAYABLE: 'playable',
  LOOK_ONLY: 'look-only',
  CUTSCENE: 'cutscene',
});

export const PLAYER_POSES = Object.freeze({
  STANDING: 'standing',
  KNEELING: 'kneeling',
});

export const STANDING_EYE_HEIGHT = 1.66;
export const KNEELING_EYE_HEIGHT = 1.03;
/** Smaller than a rendered shoulder span: tangible, but never a hairy wall. */
export const SOFT_ACTOR_RADIUS = 0.40;

/** A live circle consumed by createInitiationPlayerWorld's existing Interface. */
export function createInitiationActorCircle(figure, { radius = SOFT_ACTOR_RADIUS } = {}) {
  const circle = {
    x: figure?.position?.x ?? 0,
    z: figure?.position?.z ?? 0,
    r: Math.min(0.45, Math.max(0.32, Number(radius) || SOFT_ACTOR_RADIUS)),
    active: true,
    actor: figure ?? null,
  };
  return syncInitiationActorCircle(circle, figure);
}

/** Keep collision on the rendered feet; scripted movers/fallen bodies opt out. */
export function syncInitiationActorCircle(circle, figure = circle?.actor, { active = true } = {}) {
  if (!circle) return null;
  circle.actor = figure ?? circle.actor ?? null;
  if (circle.actor?.position) {
    circle.x = circle.actor.position.x;
    circle.z = circle.actor.position.z;
  }
  circle.active = Boolean(active && circle.actor?.group?.visible !== false);
  return circle;
}

const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
]);

const ARROW_CODES = Object.freeze({
  ArrowUp: 'KeyW',
  ArrowDown: 'KeyS',
  ArrowLeft: 'KeyA',
  ArrowRight: 'KeyD',
});

/** Convert the scene's circular site geometry to the Interface Player expects. */
export function createInitiationPlayerWorld({ circles = [], bounds = 88 } = {}) {
  return {
    colliders: [],
    floorZones: [],
    groundAt: () => 0,
    resolvePlayer(player, axis, radius) {
      const p = player.position;
      for (const circle of circles) {
        if (!circle || circle.active === false) continue;
        const dx = p.x - circle.x;
        const dz = p.z - circle.z;
        const minimum = radius + circle.r;
        const distance = Math.hypot(dx, dz);
        if (distance >= minimum) continue;

        if (distance < 1e-6) {
          if (axis === 'x') p.x = circle.x + minimum;
          else p.z = circle.z + minimum;
        } else {
          const push = (minimum - distance) / distance;
          p.x += dx * push;
          p.z += dz * push;
        }
        player.velocity[axis] = 0;
      }
      if (axis === 'x') p.x = THREE.MathUtils.clamp(p.x, -bounds, bounds);
      else p.z = THREE.MathUtils.clamp(p.z, -bounds, bounds);
    },
  };
}

export function headingToPlayerYaw(heading) {
  return normalizeAngle(heading + Math.PI);
}

export function playerYawToHeading(yaw) {
  return normalizeAngle(yaw - Math.PI);
}

export class InitiationPlayerAdapter {
  constructor(camera, {
    circles = [],
    bounds = 88,
    onFootstep = null,
  } = {}) {
    this.camera = camera;
    this.world = createInitiationPlayerWorld({ circles, bounds });
    this.player = new Player(camera, this.world);
    this.player.onFootstep = onFootstep;

    this.control = INITIATION_CONTROL_MODES.CUTSCENE;
    this.pose = PLAYER_POSES.STANDING;
    this.browserEnabled = false;
    this.touchActive = false;
    this.inputSuspended = false;
    this.touchCodes = new Set();
    this.allowSprint = true;
    this.moveScale = 1;
  }

  /** Player-compatible Interface consumed by FirstPersonInputAdapter. */
  get enabled() { return this.browserEnabled; }

  set enabled(enabled) {
    this.browserEnabled = Boolean(enabled);
    this.#refreshEnabled();
  }

  teleport(point, { heading = null, yaw = null, pose = this.pose } = {}) {
    const eye = pose === PLAYER_POSES.KNEELING ? KNEELING_EYE_HEIGHT : STANDING_EYE_HEIGHT;
    this.pose = pose;
    this.player.position.set(point.x, point.y ?? eye, point.z);
    this.player.ground = 0;
    this.player.eyeHeight = eye;
    this.player.targetEye = eye;
    this.player.jumpHeight = 0;
    this.player.velocity.set(0, 0, 0);
    if (yaw !== null) this.player.yaw = yaw;
    else if (heading !== null) this.player.yaw = headingToPlayerYaw(heading);
    this.player.pitch = 0;
    this.player.update(0);
  }

  face(point) {
    const dx = point.x - this.player.position.x;
    const dz = point.z - this.player.position.z;
    if (Math.hypot(dx, dz) < 1e-6) return;
    this.player.yaw = Math.atan2(-dx, -dz);
    this.player.pitch = 0;
  }

  setControl(control, { pose = PLAYER_POSES.STANDING } = {}) {
    if (!Object.values(INITIATION_CONTROL_MODES).includes(control)) {
      throw new TypeError(`Unknown Initiation control mode: ${control}`);
    }
    const preserveHeldMovement = this.control === INITIATION_CONTROL_MODES.PLAYABLE
      && control === INITIATION_CONTROL_MODES.PLAYABLE;
    this.control = control;
    this.pose = pose;
    // Adjacent playable phases are narrative boundaries, not input boundaries.
    // Clearing here drops a physical key that is still held; browsers do not
    // owe us another keydown until the player releases and presses it again.
    if (!preserveHeldMovement) this.clearInput();

    const eye = pose === PLAYER_POSES.KNEELING ? KNEELING_EYE_HEIGHT : STANDING_EYE_HEIGHT;
    this.player.eyeHeight = eye;
    this.player.targetEye = eye;
    this.player.jumpHeight = 0;
    this.player.position.y = eye;
    this.player.yawCenter = null;
    this.player.yawRange = Math.PI;
    this.player.pitchMin = -Math.PI / 2 + 0.05;
    this.player.pitchMax = Math.PI / 2 - 0.05;

    if (control === INITIATION_CONTROL_MODES.PLAYABLE) this.player.mode = 'walk';
    else if (control === INITIATION_CONTROL_MODES.LOOK_ONLY) this.player.mode = 'seated';
    else this.player.mode = 'frozen';
    this.#refreshEnabled();
  }

  handleMouseMove(dx, dy) {
    this.player.handleMouseMove(dx, dy);
  }

  /** Apply scene pacing without replacing shared Player locomotion. */
  setMovementPolicy({ moveScale = 1, allowSprint = true } = {}) {
    const scale = Number(moveScale);
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError(`Initiation moveScale must be a positive number, got ${moveScale}`);
    }
    this.moveScale = scale;
    this.allowSprint = allowSprint !== false;
    this.player.moveScale = scale;
    if (!this.allowSprint) {
      this.player.setKey('ShiftLeft', false);
      this.player.setKey('ShiftRight', false);
      this.touchCodes.delete('ShiftLeft');
      this.touchCodes.delete('ShiftRight');
    }
  }

  setKey(code, down) {
    const normalized = ARROW_CODES[code] ?? code;
    if (!MOVEMENT_CODES.has(normalized)) return false;
    if (this.control !== INITIATION_CONTROL_MODES.PLAYABLE) {
      this.player.setKey(normalized, false);
      return false;
    }
    if (!this.allowSprint && (normalized === 'ShiftLeft' || normalized === 'ShiftRight')) {
      this.player.setKey(normalized, false);
      return true;
    }
    this.player.setKey(normalized, down);
    return true;
  }

  setTouchVector(x, y, { sprint = false } = {}) {
    for (const code of this.touchCodes) this.player.setKey(code, false);
    this.touchCodes.clear();
    if (this.inputSuspended || this.control !== INITIATION_CONTROL_MODES.PLAYABLE) return;

    if (y < -0.2) this.touchCodes.add('KeyW');
    if (y > 0.2) this.touchCodes.add('KeyS');
    if (x < -0.2) this.touchCodes.add('KeyA');
    if (x > 0.2) this.touchCodes.add('KeyD');
    if (sprint && this.allowSprint) this.touchCodes.add('ShiftLeft');
    for (const code of this.touchCodes) this.player.setKey(code, true);
  }

  setTouchActive(active) {
    this.touchActive = Boolean(active);
    if (!this.touchActive) this.setTouchVector(0, 0);
    this.#refreshEnabled();
  }

  setTouchButton(code, down) {
    if (this.inputSuspended) {
      this.setKey(code, false);
      return false;
    }
    return this.setKey(code, down);
  }

  /** Let canonical input lifecycle suspend touch without disabling touch mode. */
  setInputSuspended(suspended) {
    this.inputSuspended = Boolean(suspended);
    if (this.inputSuspended) this.clearInput();
    this.#refreshEnabled();
  }

  clearInput() {
    this.touchCodes.clear();
    this.player.clearKeys();
    this.player.velocity.set(0, 0, 0);
  }

  clearKeys() {
    this.clearInput();
  }

  update(dt) {
    this.player.update(dt);
  }

  /** Mirror the invisible first-person body onto the ceremony's visible rig. */
  syncFigure(figure) {
    if (!figure?.group) return;
    figure.group.position.x = this.player.position.x;
    figure.group.position.z = this.player.position.z;
    figure.group.position.y = 0;
    figure.heading = playerYawToHeading(this.player.yaw);
    figure.group.rotation.y = figure.heading;
  }

  #refreshEnabled() {
    this.player.enabled = !this.inputSuspended
      && (this.browserEnabled || this.touchActive)
      && this.control !== INITIATION_CONTROL_MODES.CUTSCENE;
  }
}

function normalizeAngle(angle) {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

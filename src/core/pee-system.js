/**
 * Shared free-aim urination controller.
 *
 * `StreamSystem` owns particles and impacts. This class owns the interaction
 * state that every scene otherwise had to re-create: choosing a fixture,
 * lifting the seat and lid, draining the bladder, driving the two audio beds,
 * and deriving the stream from the live camera aim.
 */
import * as THREE from 'three';

const DEFAULT_DRAIN_RATE = 0.075;
export const PEE_CUE_NAMES = Object.freeze([
  'toilet.lid',
  'pee.zip',
  'pee.stream',
  'pee.miss',
]);

export class PeeSystem {
  constructor({
    camera,
    stream,
    audio,
    colliders = null,
    bladder = 1,
    drainRate = DEFAULT_DRAIN_RATE,
    onState = null,
  } = {}) {
    if (!camera || !stream) throw new Error('PeeSystem requires a camera and StreamSystem');
    this.camera = camera;
    this.stream = stream;
    this.audio = audio ?? null;
    this.bladder = THREE.MathUtils.clamp(bladder, 0, 1);
    this.drainRate = drainRate;
    this.onState = onState;
    this.active = false;
    this.toilet = null;
    this.time = 0;
    this._origin = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    if (colliders) this.stream.setColliders(colliders);
  }

  get toiletId() { return this.toilet?.id ?? null; }

  start(toilet) {
    if (this.active || !toilet?.bowl || this.bladder <= 0.01) return false;
    this.toilet = toilet;
    this.active = true;
    this.time = 0;
    this.stream.setFloorHeight?.(toilet.floorY ?? 0);
    this.stream.setTarget(toilet.bowl, toilet.radius, toilet.waterY, toilet.collider ?? null);
    this.stream.resetStats();
    if (toilet.lidPivot) toilet.lidPivot.rotation.x = -1.92;
    if (toilet.seatPivot) toilet.seatPivot.rotation.x = -1.78;
    this.audio?.play?.('toilet.lid', { volume: 0.5, position: toilet.bowl });
    this.audio?.play?.('pee.zip', { volume: 0.7 });
    this.audio?.startLoop?.('pee.stream', { volume: 0, fade: 0.2 });
    this.audio?.startLoop?.('pee.miss', { volume: 0, fade: 0.2 });
    this.onState?.(this.report());
    return true;
  }

  stop() {
    if (!this.active) return false;
    const toilet = this.toilet;
    this.active = false;
    this.toilet = null;
    if (toilet?.seatPivot) toilet.seatPivot.rotation.x = 0;
    if (toilet?.lidPivot) toilet.lidPivot.rotation.x = 0;
    this.audio?.stopLoop?.('pee.stream', 0.25);
    this.audio?.stopLoop?.('pee.miss', 0.25);
    this.audio?.play?.('pee.zip', { volume: 0.6 });
    this.onState?.(this.report());
    return true;
  }

  update(dt) {
    this.stream.update(dt);
    if (!this.active) return;
    this.time += dt;
    this.bladder = Math.max(0, this.bladder - dt * this.drainRate);
    const ramp = Math.min(1, this.time / 0.42);
    const power = ramp * Math.min(1, 0.25 + this.bladder * 2.2);
    const level = 0.1 + power * 0.22;
    this.audio?.setLoopVolume?.('pee.stream', level * 0.68, 0.12);
    this.audio?.setLoopVolume?.('pee.miss', level * 0.46, 0.12);

    this.camera.getWorldPosition(this._origin);
    this.camera.getWorldDirection(this._direction);
    this._aim.copy(this._origin).addScaledVector(this._direction, 1.25);
    this._origin.addScaledVector(this._direction, 0.18);
    this._origin.y -= 0.58;
    this._direction.copy(this._aim).sub(this._origin).normalize();
    this.stream.emit(this._origin, this._direction, dt, power);
    if (this.bladder <= 0.001) this.stop();
  }

  report() {
    const stats = this.stream.stats ?? {};
    return {
      active: this.active,
      toiletId: this.toiletId,
      bladder: this.bladder,
      time: this.time,
      total: stats.total ?? 0,
      onTarget: stats.onTarget ?? 0,
      accuracy: stats.total > 0 ? stats.onTarget / stats.total : 1,
    };
  }
}

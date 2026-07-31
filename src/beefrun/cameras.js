/**
 * CameraManager — three flight cameras, and the walking one.
 *
 * Cockpit is the one the mission is designed around: head in the left seat,
 * instruments readable, Lou in your peripheral vision, and the mouse free to
 * look around. Chase sits behind and above for terrain and for watching the
 * control surfaces move. Landing drops in close behind the tail on final.
 *
 * Views never change themselves. The one exception is the cinematic-assist
 * option, which is off unless the player turns it on.
 */
import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';

const VIEWS = ['cockpit', 'chase', 'landing'];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class CameraManager {
  constructor(camera) {
    this.camera = camera;
    this.view = 'cockpit';
    this.cinematic = false;

    this.lookYaw = 0;
    this.lookPitch = 0;
    this.sensitivity = 0.0022;

    this.shake = 0;
    this.shakeDecay = 2.6;
    this.fovBase = 66;
    this.fovPunch = 0;

    this.smoothPos = new THREE.Vector3();
    this.smoothQuat = new THREE.Quaternion();
    this._init = false;
    this._bob = 0;
  }

  cycle() {
    const i = VIEWS.indexOf(this.view);
    this.view = VIEWS[(i + 1) % VIEWS.length];
    this._init = false;
    return this.view;
  }

  setView(v) {
    if (VIEWS.includes(v) && v !== this.view) {
      this.view = v;
      this._init = false;
    }
  }

  /** Mouse look. In the cockpit this moves the head; outside it orbits. */
  look(dx, dy) {
    this.lookYaw = clamp(this.lookYaw - dx * this.sensitivity, -2.4, 2.4);
    this.lookPitch = clamp(this.lookPitch - dy * this.sensitivity, -0.9, 0.85);
  }

  /** Recentre gradually when the player lets go of the mouse. */
  recentre(dt, rate = 0.8) {
    this.lookYaw = damp(this.lookYaw, 0, rate, dt);
    this.lookPitch = damp(this.lookPitch, 0, rate, dt);
  }

  addShake(amount) {
    this.shake = clamp(this.shake + amount, 0, 1.6);
  }

  punchFov(amount) {
    this.fovPunch = clamp(this.fovPunch + amount, 0, 12);
  }

  /**
   * @param {object} p AircraftPhysics
   * @param {THREE.Object3D} body the aeroplane group
   * @param {object} eye local-space cockpit eye point
   */
  update(dt, p, body, eye, { roughness = 0, gLoad = 1 } = {}) {
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * this.shakeDecay);
    this.fovPunch = damp(this.fovPunch, 0, 3, dt);

    // Every view is built from the aeroplane's own frame.
    body.updateMatrixWorld();

    if (this.view === 'cockpit') {
      _v.copy(eye).applyMatrix4(body.matrixWorld);
      // Head movement: the body leans into acceleration and the seat shakes.
      const bump = (this.shake + roughness * 0.5) * 0.03;
      this._bob += dt * (8 + p.groundSpeed * 0.4);
      _v.y += Math.sin(this._bob * 3.1) * bump + (gLoad - 1) * -0.012;
      _v.x += Math.cos(this._bob * 2.3) * bump * 0.7;
      cam.position.copy(_v);

      /* Face the nose. A camera looks down its own -Z and the aeroplane's
       * body frame puts the nose at +Z (physics.js, line one), so copying the
       * airframe's rotation straight onto the camera sat the pilot backwards
       * in his own seat, looking down the cabin at the cargo through the
       * culled back faces of the fuselage. Half a turn of yaw puts him the
       * way round the panel in front of him was built for; mouse look rides
       * on top of it and keeps its sense, because the whole head frame turned
       * rather than just the view direction. */
      _q.copy(body.quaternion);
      _e.set(this.lookPitch, Math.PI + this.lookYaw, 0, 'YXZ');
      cam.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromEuler(_e));
      // A little roll into the shake so it reads as the airframe, not the mouse.
      cam.rotateZ(Math.sin(this._bob * 4.7) * bump * 0.6);
      cam.fov = lerp(66, 74, clamp(p.tas / 90, 0, 1) * 0.25) + this.fovPunch;
    } else if (this.view === 'chase') {
      const dist = 26 + clamp(p.tas * 0.12, 0, 8);
      _v.set(0, 6.5, -dist).applyQuaternion(body.quaternion).add(body.position);
      // Do not let the chase camera bury itself in a hillside.
      _v2.copy(body.position);
      if (!this._init) { this.smoothPos.copy(_v); this._init = true; }
      this.smoothPos.x = damp(this.smoothPos.x, _v.x, 5, dt);
      this.smoothPos.y = damp(this.smoothPos.y, Math.max(_v.y, _v2.y - 4), 5, dt);
      this.smoothPos.z = damp(this.smoothPos.z, _v.z, 5, dt);
      cam.position.copy(this.smoothPos);
      _v.copy(body.position).add(_v2.set(0, 2.2, 6).applyQuaternion(body.quaternion));
      cam.lookAt(_v);
      _e.set(this.lookPitch * 0.5, this.lookYaw * 0.5, 0, 'YXZ');
      cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(_e));
      cam.rotateZ(-p.rollDeg * 0.0016);
      cam.fov = 70 + this.fovPunch;
    } else {
      // Landing: tight and low behind the tail, where the sink rate is legible.
      _v.set(0, 3.4, -13).applyQuaternion(body.quaternion).add(body.position);
      if (!this._init) { this.smoothPos.copy(_v); this._init = true; }
      this.smoothPos.lerp(_v, clamp(dt * 9, 0, 1));
      cam.position.copy(this.smoothPos);
      _v.copy(body.position).add(_v2.set(0, 0.6, 40).applyQuaternion(body.quaternion));
      cam.lookAt(_v);
      cam.fov = 58 + this.fovPunch;
    }

    // Shake goes on top of whatever the view decided.
    if (this.shake > 0.001) {
      const s = this.shake * 0.02;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      cam.rotateZ((Math.random() - 0.5) * this.shake * 0.01);
    }
    cam.updateProjectionMatrix();
  }

  /** Straight overhead of a point, used for the mission-complete flyover. */
  orbit(dt, target, radius = 60, height = 30, speed = 0.25) {
    this._orbit = (this._orbit ?? 0) + dt * speed;
    this.camera.position.set(
      target.x + Math.cos(this._orbit) * radius,
      target.y + height,
      target.z + Math.sin(this._orbit) * radius,
    );
    this.camera.lookAt(target);
  }
}

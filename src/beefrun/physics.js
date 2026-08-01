import * as THREE from 'three';
import { AC } from './config.js';
import { clamp, lerp, smoothstep } from './util.js';

// AircraftPhysics — arcade-realistic flight model on a fixed timestep.
//
// Body frame: +X right wing, +Y up, +Z nose forward.
//   torque +X = nose down, +Y = nose right, +Z = roll left.
// Deliberately simplified: one lifting surface, three contact points, and
// coefficients tuned by feel rather than by wind tunnel.

const FIXED = 1 / 120;
const MAX_STEPS = 8;
const G = 9.81;
const RHO0 = 1.225;

// Scratch — the step runs 120x a second, so nothing allocates in here.
const sQuat = new THREE.Quaternion();
const sQinv = new THREE.Quaternion();
const sAir = new THREE.Vector3();
const sVb = new THREE.Vector3();
const sDir = new THREE.Vector3();
const sLift = new THREE.Vector3();
const sForce = new THREE.Vector3();
const sTorque = new THREE.Vector3();
const sR = new THREE.Vector3();
const sOmegaW = new THREE.Vector3();
const sContactV = new THREE.Vector3();
const sFwd = new THREE.Vector3();
const sSide = new THREE.Vector3();
const sLat = new THREE.Vector3();
const sLong = new THREE.Vector3();
const sTotal = new THREE.Vector3();
const sBodyF = new THREE.Vector3();
const sTmp = new THREE.Vector3();
const sAccel = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const _euler = new THREE.Euler();

export class AircraftPhysics {
  constructor({ getHeight, getNormal = null }) {
    this.getHeight = getHeight;
    this.getNormal = getNormal;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.omega = new THREE.Vector3();       // body-frame rad/s

    this.controls = {
      pitch: 0, roll: 0, yaw: 0,
      throttleL: 0, throttleR: 0,
      flaps: 0, brake: 0, parkingBrake: true,
    };

    this.mass = AC.emptyMass + AC.fuelMass;
    this.cgOffset = 0;        // + = nose heavy, - = tail heavy (metres of shift)
    this.wind = new THREE.Vector3();
    this.gust = new THREE.Vector3();
    this.assist = { stability: 0.32, autoRudder: 0.35, stallGuard: 0.25, groundAssist: 0.28, torque: 0.8 };

    this.engines = null;
    this.damage = { wing: 0, gear: 0, tireBurst: false };

    this.wheels = [
      { pos: new THREE.Vector3(0, -AC.gearY, 2.15), steer: true, brake: false },
      { pos: new THREE.Vector3(-AC.track / 2, -AC.gearY, -0.55), steer: false, brake: true },
      { pos: new THREE.Vector3(AC.track / 2, -AC.gearY, -0.55), steer: false, brake: true },
    ];

    // Readouts
    this.tas = 0; this.ias = 0; this.alpha = 0; this.beta = 0;
    this.agl = 0; this.onGround = false; this.stalled = false; this.stallT = 0;
    this.gLoad = 1; this.vspeed = 0; this.groundSpeed = 0; this.rolling = false;
    this.wheelLoad = [0, 0, 0];
    this.suspension = [0, 0, 0];
    this.thrustL = 0; this.thrustR = 0;

    this.onTouchdown = null;  // (verticalSpeed, gLoad, wheelIndex)
    this.onImpact = null;     // (severity, what)

    this._acc = 0;
    this._prevVel = new THREE.Vector3();
    this._wasAirborne = false;
    this._stallRoll = 0;
    this.time = 0;
  }

  setPose(pos, headingDeg, speed = 0) {
    this.position.copy(pos);
    this.quat.setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(headingDeg), 0, 'YXZ'));
    this.velocity.set(0, 0, speed).applyQuaternion(this.quat);
    this.omega.set(0, 0, 0);
    this._prevVel.copy(this.velocity);
    this._wasAirborne = false;
    this._acc = 0;
  }

  /**
   * Compass heading. North is +Z and east is +X, so headings run clockwise
   * seen from above and an unrotated body points due north. The route south
   * to El Hueso is therefore 180, which is what the placards say.
   */
  get headingDeg() {
    sTmp.set(0, 0, 1).applyQuaternion(this.quat);
    return ((Math.atan2(sTmp.x, sTmp.z) * 180) / Math.PI + 360) % 360;
  }

  get pitchDeg() {
    sTmp.set(0, 0, 1).applyQuaternion(this.quat);
    return (Math.asin(clamp(sTmp.y, -1, 1)) * 180) / Math.PI;
  }

  get rollDeg() {
    sTmp.set(1, 0, 0).applyQuaternion(this.quat);
    sDir.set(0, 1, 0).applyQuaternion(this.quat);
    return (-Math.atan2(sTmp.y, sDir.y) * 180) / Math.PI;
  }

  advance(dt) {
    this._acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this._acc >= FIXED && steps < MAX_STEPS) {
      this.step(FIXED);
      this._acc -= FIXED;
      steps++;
      this.time += FIXED;
    }
    if (steps === MAX_STEPS) this._acc = 0;
  }

  step(dt) {
    const c = this.controls;
    const pos = this.position;

    const ground = this.getHeight(pos.x, pos.z);
    this.agl = pos.y - ground;
    const rho = RHO0 * Math.exp(-Math.max(pos.y, 0) / 8500);

    // ---------- Airflow ----------
    sQinv.copy(this.quat).invert();
    sAir.copy(this.velocity).sub(this.wind).sub(this.gust);
    sVb.copy(sAir).applyQuaternion(sQinv);
    const V = sVb.length();
    this.tas = V;
    this.ias = V * Math.sqrt(rho / RHO0);

    const alpha = V > 1.2 ? Math.atan2(-sVb.y, Math.max(Math.abs(sVb.z), 0.4) * Math.sign(sVb.z || 1)) : 0;
    const beta = V > 1.2 ? Math.asin(clamp(sVb.x / V, -1, 1)) : 0;
    this.alpha = alpha;
    this.beta = beta;

    const qbar = 0.5 * rho * V * V;
    const S = AC.wingArea;

    // Ground effect inside a wingspan of the surface.
    const ge = smoothstep(AC.span * 0.9, AC.span * 0.12, Math.max(this.agl, 0));
    const geLift = 1 + ge * 0.28;
    const geDrag = 1 - ge * 0.35;

    // ---------- Lift / stall ----------
    let CL = AC.CL0 + AC.CLa * alpha + AC.flapCL * c.flaps;
    const aStall = AC.alphaStall + c.flaps * 0.02 + this.assist.stallGuard * 0.08;
    const stallT = smoothstep(aStall, aStall + 0.16, Math.abs(alpha));
    this.stallT = stallT;
    this.stalled = stallT > 0.35 && V > 4;
    CL *= (1 - 0.7 * stallT) * geLift;
    CL = clamp(CL, -1.6, 2.4);

    const wingHealth = 1 - this.damage.wing * 0.4;
    const L = qbar * S * CL * wingHealth;
    const CD = AC.CD0 + this.damage.wing * 0.05
      + AC.kInduced * CL * CL * geDrag
      + AC.flapCD * c.flaps
      + stallT * 0.09;
    const D = qbar * S * CD;
    const sideF = qbar * S * (-1.15 * beta);

    sForce.set(0, 0, 0);
    if (V > 0.05) {
      sDir.copy(sVb).normalize();
      sForce.addScaledVector(sDir, -D);
      sLift.copy(sDir).cross(RIGHT);
      if (sLift.lengthSq() < 0.01) sLift.copy(UP); else sLift.normalize();
      sForce.addScaledVector(sLift, L);
      sForce.x += sideF;
    }

    // ---------- Thrust ----------
    const tL = this.engines ? this.engines.thrust(0, V, rho) : 0;
    const tR = this.engines ? this.engines.thrust(1, V, rho) : 0;
    this.thrustL = tL;
    this.thrustR = tR;
    sForce.z += tL + tR;

    // ---------- Moments ----------
    sTorque.set(0, 0, 0);
    const b = AC.span, ch = AC.chord;
    const Vref = Math.max(V, 12);
    const qSc = qbar * S * ch;
    const qSb = qbar * S * b;
    const cg = clamp(this.cgOffset, -0.6, 0.6);

    // Elevator authority is deliberately modest: full aft stick trims to an
    // angle of attack past the stall, which is the aeroplane telling you.
    const Cm = (0.82 + cg * 0.85) * alpha
      - 22 * this.omega.x * ch / (2 * Vref)
      - 0.45 * c.pitch
      + cg * 0.13
      - c.flaps * 0.055;
    sTorque.x += qSc * Cm;

    const Cl = -0.075 * c.roll
      - 0.50 * this.omega.z * b / (2 * Vref)
      + 0.045 * beta;
    sTorque.z += qSb * Cl;

    const Cn = 0.028 * c.yaw
      - 0.25 * this.omega.y * b / (2 * Vref)
      + 0.080 * beta;
    sTorque.y += qSb * Cn;

    // Asymmetric thrust, P-factor and engine torque: she pulls left.
    //
    // The pull builds with airspeed rather than being there at brake release —
    // it comes from the slipstream and from the descending blade, and neither
    // of those does much while the aeroplane is standing still. Modelling it as
    // full strength from a standstill gave a 40-degree swing before the rudder
    // had any air over it, which is not a handling characteristic, it is a
    // parked aeroplane spinning on its nosewheel.
    sTorque.y += (tL - tR) * 3.05 * 0.9;
    const slowPower = clamp((tL + tR) / (AC.thrustMax * 2), 0, 1)
      * smoothstep(0, 13, V) * clamp(1 - V / 55, 0, 1);
    sTorque.y -= slowPower * AC.torqueYaw * this.assist.torque;
    sTorque.z += slowPower * AC.torqueRoll * this.assist.torque;

    // Stall: nose drops, one wing lets go first.
    if (stallT > 0.3 && !this.onGround) {
      this._stallRoll = lerp(this._stallRoll, Math.sin(this.time * 3.7) * 0.6 + Math.sin(this.time * 1.31) * 0.4, dt * 3);
      sTorque.z += this._stallRoll * stallT * 14000 * (1 - this.assist.stallGuard * 0.6);
      sTorque.x += stallT * 2500 * (1 - this.assist.stallGuard * 0.8);
    }

    // ---------- Assistance ----------
    // The wing leveller gives up in the stall — it has nothing to work with,
    // and holding the wings level through a break would remove the one moment
    // the aeroplane is genuinely trying to kill you.
    if (this.assist.stability > 0 && !this.onGround && V > 15 && stallT < 0.3) {
      // +Z is roll-left, and rollDeg is positive in a right bank, so levelling
      // the wings means torque of the SAME sign as the bank.
      sTorque.z += clamp(this.rollDeg / 55, -1, 1) * qSb * 0.05 * this.assist.stability;
      sTorque.x -= this.omega.x * qSc * 0.85 * this.assist.stability;
    }
    if (this.assist.autoRudder > 0 && !this.onGround) {
      /* Coordination assist: yaw the nose TOWARD the velocity vector, which is
       * the same direction the fin already wants to go — it just gets there
       * faster than a beginner's feet would. The opposite sign turns this into
       * a directional divergence that takes about twenty seconds to notice. */
      sTorque.y += beta * qSb * 0.16 * this.assist.autoRudder;
    }
    if (this.assist.stallGuard > 0 && stallT > 0.5 && c.pitch > 0) {
      sTorque.x += qSc * 0.55 * this.assist.stallGuard * stallT;
    }

    // ---------- Ground contact ----------
    let anyContact = false;
    let touchdownReported = false;
    sOmegaW.copy(this.omega).applyQuaternion(this.quat);
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      sR.copy(w.pos).applyQuaternion(this.quat);
      const wx = pos.x + sR.x, wy = pos.y + sR.y, wz = pos.z + sR.z;
      const pen = this.getHeight(wx, wz) - wy;
      this.suspension[i] = clamp(pen / 0.35, 0, 1.4);
      if (pen <= 0) { this.wheelLoad[i] = 0; continue; }
      anyContact = true;

      sContactV.copy(sOmegaW).cross(sR).add(this.velocity);

      const stiff = 260000 * (1 - this.damage.gear * 0.3);
      let N = stiff * Math.min(pen, 0.9) - 22000 * sContactV.y;
      N = clamp(N, 0, 460000);
      this.wheelLoad[i] = N;

      // Wheel rolling direction, flattened, with nosewheel steering.
      sFwd.set(0, 0, 1).applyQuaternion(this.quat);
      sFwd.y = 0;
      if (sFwd.lengthSq() < 1e-4) sFwd.set(0, 0, 1);
      sFwd.normalize();
      if (w.steer) {
        /* Nosewheel steering, and not much of it: this is a rudder pedal
         * linkage, not a steering wheel. It fades out as the fin gets air over
         * it, and the two have to overlap or there is a band of speed with no
         * yaw control in it at all.
         *
         * The sign matters more than any of the numbers. A positive rotation
         * about +Y takes the nose toward +X, which is right, and right pedal is
         * positive — so this is `+steer`. It was `-steer`, which pointed the
         * tyre away from the pedal and made the ground controls reversed below
         * the speed where the rudder took over. It never looked like a reversal
         * because the swing was always leftward and the rudder always won in
         * the end; it looked like an aeroplane that wandered off the runway.
         * Measured open-loop it was unmistakable: full right pedal produced
         * twenty-two degrees a second squared of LEFT yaw. */
        const steer = c.yaw * AC.groundSteer * clamp(1 - V / AC.steerFadeV, 0, 1);
        sFwd.applyAxisAngle(UP, steer);
      }
      sSide.copy(sFwd).cross(UP).normalize();

      const latSpeed = sContactV.dot(sSide);
      const fwdSpeed = sContactV.dot(sFwd);

      // Tyres: slip-proportional up to a friction limit, so the aeroplane
      // tracks straight but will still slide if you get it sideways.
      const mu = this.damage.tireBurst && i === 1 ? 0.34 : 0.78;
      sLat.copy(sSide).multiplyScalar(-clamp(latSpeed * 0.6, -1, 1) * mu * N);

      // Enough to hold a run-up at three quarters power, and not much more.
      const brakeMu = w.brake ? (c.parkingBrake ? 0.7 : c.brake * 0.58) : 0.015;
      const rollMu = 0.02 + (this.damage.tireBurst && i === 1 ? 0.14 : 0);
      const longMag = -(brakeMu + rollMu) * N * Math.sign(fwdSpeed) * Math.min(1, Math.abs(fwdSpeed) / 1.1);
      sLong.copy(sFwd).multiplyScalar(longMag);

      sTotal.set(0, N, 0).add(sLat).add(sLong);
      sBodyF.copy(sTotal).applyQuaternion(sQinv);
      sForce.add(sBodyF);
      sTmp.copy(w.pos).cross(sBodyF);
      sTorque.add(sTmp);

      if (this._wasAirborne && !touchdownReported) {
        touchdownReported = true;
        const vs = Math.max(0, -this._prevVel.y);
        this.onTouchdown?.(vs, 1 + vs * 0.42, i);
        if (vs > 4.2) {
          this.damage.gear = clamp(this.damage.gear + (vs - 4.2) * 0.16, 0, 1);
          if (vs > 6.8) this.damage.tireBurst = true;
        }
      }
    }
    this.onGround = anyContact;
    if (anyContact) this._wasAirborne = false;
    else if (this.agl > 0.8) this._wasAirborne = true;

    /* Structural contact with the ground — as distinct from the wheels finding
     * it, which is a landing.
     *
     * Without this the aeroplane can be flown into a hillside at ninety knots
     * and simply carry on, because the undercarriage takes the load and slides:
     * three spring-damper contact points will happily toboggan up a mountain.
     * So the nose and the belly are checked against the surface directly, and
     * how bad it is scales with how fast you were going when you found out. */
    sTmp.set(0, 0.05, 4.4).applyQuaternion(this.quat);
    const noseClear = (pos.y + sTmp.y) - this.getHeight(pos.x + sTmp.x, pos.z + sTmp.z);
    const bellyClear = pos.y - this.getHeight(pos.x, pos.z);
    /* The nose only counts as a strike if the aeroplane is going somewhere. An
     * aeroplane parked at the top of an eight per cent strip has its nose over
     * rising ground and is not crashing into anything. */
    const struckNose = noseClear < 0.15 && sVb.z > 8;
    if (struckNose || bellyClear < 0.35) {
      const severity = V * 0.13 + Math.max(0, -this.velocity.y) * 0.6;
      // Whatever happens next, it is not still flying.
      this.velocity.multiplyScalar(Math.exp(-6 * dt));
      this.omega.multiplyScalar(Math.exp(-8 * dt));
      this.onImpact?.(severity, 'terrain');
    } else if (!anyContact && this.agl < 0.2) {
      this.onImpact?.(Math.max(0, -this.velocity.y - 1) + this.tas * 0.02, 'terrain');
    }

    // ---------- Integrate ----------
    this._prevVel.copy(this.velocity);
    sTmp.copy(sForce).applyQuaternion(this.quat);
    sTmp.y -= this.mass * G;

    /* A parking brake needs a static-friction state. The rolling-friction
     * equation above is proportional to wheel speed, so at exactly zero it
     * contributes exactly zero: one idling engine could creep the aircraft
     * half a metre and yaw it nearly twenty degrees during startup while the
     * cockpit still said PARKING BRAKE SET. If the aircraft is nearly stopped
     * and the tyre load can oppose the horizontal force, hold the contact patch
     * still. Once power exceeds that capacity (or the brake is released), the
     * ordinary tyre model takes over again. */
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const brakeCapacity = (this.wheelLoad[1] + this.wheelLoad[2]) * 0.7;
    const planarForce = Math.hypot(sTmp.x, sTmp.z);
    const parkingHeld = anyContact && c.parkingBrake
      && planarSpeed < 0.75 && planarForce <= brakeCapacity;
    if (parkingHeld) {
      sTmp.x = 0;
      sTmp.z = 0;
      this.velocity.x = 0;
      this.velocity.z = 0;
      // Static lateral tyre force also resists the yaw moment from starting
      // only one engine; without this the aeroplane pivots in place.
      sTorque.y = 0;
      this.omega.y = 0;
    }
    this.velocity.addScaledVector(sTmp, dt / this.mass);

    if (anyContact && this.velocity.lengthSq() < 0.04 && c.throttleL + c.throttleR < 0.06) {
      this.velocity.multiplyScalar(0.55);
    }
    pos.addScaledVector(this.velocity, dt);

    const minY = this.getHeight(pos.x, pos.z) - 1.2;
    if (pos.y < minY) {
      pos.y = minY + 0.1;
      if (this.velocity.y < 0) this.velocity.y *= -0.12;
    }

    // Angular integration (diagonal inertia: pitch about X, yaw about Y, roll about Z).
    this.omega.x += (sTorque.x / AC.Iyy) * dt;
    this.omega.y += (sTorque.y / AC.Izz) * dt;
    this.omega.z += (sTorque.z / AC.Ixx) * dt;
    this.omega.multiplyScalar(Math.exp(-0.3 * dt));

    sQuat.set(this.omega.x * dt * 0.5, this.omega.y * dt * 0.5, this.omega.z * dt * 0.5, 1).normalize();
    this.quat.multiply(sQuat).normalize();

    this.vspeed = this.velocity.y;
    this.groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.rolling = anyContact && this.groundSpeed > 0.6;
    sAccel.copy(this.velocity).sub(this._prevVel).divideScalar(dt);
    this.gLoad = 1 + sAccel.y / G;
  }

  euler(order = 'YXZ') {
    return _euler.setFromQuaternion(this.quat, order);
  }
}

export { FIXED as PHYSICS_STEP };

/**
 * Flight input.
 *
 * Keyboard axes are rate-limited rather than binary. A yoke is a heavy thing
 * on a cable run and it does not snap to full deflection because a key went
 * down; ramping the axis is most of what makes the Brushrunner feel like it
 * weighs three tonnes, and it is also what stops a keyboard from being able to
 * out-manoeuvre a gamepad.
 *
 * A gamepad, if one is plugged in, writes the same axes directly — it already
 * has the ramp built into the player's thumb.
 */
import { clamp, damp } from './util.js';

const RATE = { pitch: 2.1, roll: 2.6, yaw: 2.8 };      // units per second
const CENTRE = { pitch: 3.2, roll: 4.0, yaw: 5.0 };    // return-to-centre rate

export class FlightInput {
  constructor() {
    this.keys = new Set();
    this.axes = { pitch: 0, roll: 0, yaw: 0 };
    this.throttle = 0;
    this.throttleSplit = 0;      // -1 all left, +1 all right; used for the hot engine
    this.flaps = 0;
    this.brake = 0;
    this.airBrake = 0;
    this.parkingBrake = true;
    this.gamepadIndex = null;
    this.usingGamepad = false;
    this.onAction = null;        // (name) => void for one-shot keys
    this.enabled = true;
  }

  key(code, down) {
    if (down) {
      if (this.keys.has(code)) return;
      this.keys.add(code);
      this.action(code);
    } else {
      this.keys.delete(code);
    }
  }

  action(code) {
    const map = {
      KeyC: 'camera', KeyE: 'interact', KeyR: 'restart', KeyB: 'brakeToggle',
      KeyF: 'flapsDown', KeyG: 'flapsUp', KeyP: 'pause', Escape: 'pause',
      KeyM: 'mute', KeyH: 'help', KeyN: 'nav', KeyV: 'parkingBrake',
      Digit1: 'startLeft', Digit2: 'startRight', Digit3: 'battery', Digit4: 'fuel',
    };
    if (map[code]) this.onAction?.(map[code]);
  }

  clear() {
    this.keys.clear();
    this.axes.pitch = this.axes.roll = this.axes.yaw = 0;
    this.brake = 0;
    this.airBrake = 0;
  }

  /** Poll a gamepad, if there is one. Analogue always wins over the keyboard. */
  pollGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p && p.connected && p.axes.length >= 4) return p;
    }
    return null;
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const pad = this.pollGamepad();
    const dead = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);

    if (pad) {
      const pitch = dead(-pad.axes[1]);
      const roll = dead(pad.axes[0]);
      const yaw = dead(pad.axes[2] ?? 0);
      // Triggers: right for power, left for brakes.
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const airBrake = pad.buttons[5]?.value ?? 0;
      if (Math.abs(pitch) + Math.abs(roll) + Math.abs(yaw) + rt + lt + airBrake > 0.05) {
        this.usingGamepad = true;
      }
      if (this.usingGamepad) {
        this.axes.pitch = pitch;
        this.axes.roll = roll;
        this.axes.yaw = yaw;
        if (rt > 0.02) this.throttle = rt;
        this.brake = lt;
        this.airBrake = airBrake;
      }
    }

    if (!this.usingGamepad) {
      const want = {
        pitch: (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0),
        // Keep keyboard steering conventional and consistent with the gamepad:
        // A/Left banks left, while D/Right banks right.
        roll: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
        yaw: (k.has('KeyE') ? 0 : 0) + (k.has('Period') ? 1 : 0) - (k.has('Comma') ? 1 : 0),
      };
      // Q and E are rudder in the air; E is also "interact" on the ground, so
      // the mission enables one or the other, never both.
      if (this.rudderKeys) {
        // Keep the keyboard pedals in the cockpit sense players see on screen.
        // The old polarity made Q/E feel reversed even though the simulation's
        // internal positive-yaw convention is consistent with the gamepad.
        want.yaw = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
      }
      for (const axis of ['pitch', 'roll', 'yaw']) {
        const target = clamp(want[axis], -1, 1);
        if (target === 0) {
          this.axes[axis] = damp(this.axes[axis], 0, CENTRE[axis], dt);
          if (Math.abs(this.axes[axis]) < 0.004) this.axes[axis] = 0;
        } else {
          this.axes[axis] = clamp(this.axes[axis] + Math.sign(target) * RATE[axis] * dt, -1, 1);
        }
      }
      // Throttle on Shift / Control, and it moves like a lever.
      const up = k.has('ShiftLeft') || k.has('ShiftRight');
      const down = k.has('ControlLeft') || k.has('ControlRight');
      if (up) this.throttle = clamp(this.throttle + dt * 0.75, 0, 1);
      if (down) this.throttle = clamp(this.throttle - dt * 0.75, 0, 1);
      this.brake = k.has('KeyB') ? 1 : 0;
      // A momentary control: releasing Space retracts it immediately, so an
      // interrupted landing cannot leave hidden drag latched on the return.
      this.airBrake = k.has('Space') ? 1 : 0;
    }

    // Split throttle for the overheating engine: [ and ] trim the left one.
    if (k.has('BracketLeft')) this.throttleSplit = clamp(this.throttleSplit - dt * 0.8, -1, 0);
    if (k.has('BracketRight')) this.throttleSplit = clamp(this.throttleSplit + dt * 0.8, -1, 1);
  }

  /** Write the current input into an AircraftPhysics controls block. */
  applyTo(controls) {
    controls.pitch = this.axes.pitch;
    controls.roll = this.axes.roll;
    controls.yaw = this.axes.yaw;
    const split = this.throttleSplit;
    controls.throttleL = clamp(this.throttle * (1 + Math.min(split, 0)), 0, 1);
    controls.throttleR = clamp(this.throttle * (1 - Math.max(split, 0)), 0, 1);
    controls.flaps = this.flaps;
    controls.brake = this.brake;
    controls.airBrake = this.airBrake;
    controls.parkingBrake = this.parkingBrake;
  }

  stepFlaps(dir) {
    const steps = [0, 0.5, 1];
    const i = steps.indexOf(this.flaps);
    const next = clamp((i < 0 ? 0 : i) + dir, 0, steps.length - 1);
    this.flaps = steps[next];
    return this.flaps;
  }
}

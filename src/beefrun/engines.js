import { AC } from './config.js';
import { clamp, damp, lerp } from './util.js';

// EngineSystem — two piston engines that start reluctantly, run unevenly,
// overheat when abused, and can be killed outright by a prop strike.

const IDLE_RPM = 680;
const MAX_RPM = 2450;
const CATCH_RPM = 340;

export class EngineSystem {
  constructor() {
    this.engines = [this.makeEngine('left'), this.makeEngine('right')];
    this.masterBattery = false;
    this.fuelSelectors = false;
    this.fuel = AC.fuelMass;
    // The right engine is scripted to refuse the first start attempt.
    this.rightBalks = true;
    this.onEvent = null;   // (name, engineIndex) => void
  }

  makeEngine(side) {
    return {
      side,
      running: false,
      rpm: 0,
      throttle: 0,
      starter: 0,        // seconds of cranking left
      temp: 40,          // deg C, cylinder head
      health: 1,         // 1 = fine, 0 = dead
      dead: false,
      attempts: 0,
      roughness: 0,      // 0..1 audible/vibration sputter
      backfire: 0,
      hotScript: 0,      // seconds of scripted overheating
    };
  }

  reset(full = true) {
    this.engines = [this.makeEngine('left'), this.makeEngine('right')];
    this.masterBattery = false;
    this.fuelSelectors = false;
    this.rightBalks = true;
    if (full) this.fuel = AC.fuelMass;
  }

  // Bring both engines up hot and running (checkpoint restores mid-flight).
  forceRunning() {
    this.masterBattery = true;
    this.fuelSelectors = true;
    for (const e of this.engines) {
      if (e.dead) continue;
      e.running = true;
      e.rpm = 2200;
      e.temp = 175;
    }
    this.rightBalks = false;
  }

  get anyRunning() { return this.engines.some((e) => e.running); }
  get bothRunning() { return this.engines.every((e) => e.running); }

  setThrottle(i, v) { this.engines[i].throttle = clamp(v, 0, 1); }
  setThrottles(v) { this.engines.forEach((e) => (e.throttle = clamp(v, 0, 1))); }

  // Crank an engine. Returns 'cranking' | 'nofuel' | 'nopower' | 'dead'.
  crank(i) {
    const e = this.engines[i];
    if (e.dead) return 'dead';
    if (!this.masterBattery) return 'nopower';
    if (!this.fuelSelectors || this.fuel <= 0) return 'nofuel';
    if (e.running) return 'running';
    e.attempts++;
    e.starter = 1.6;
    this.onEvent?.('starter', i);
    return 'cranking';
  }

  kill(i, reason = 'shutdown') {
    const e = this.engines[i];
    e.running = false;
    e.rpm = 0;
    if (reason === 'destroyed') { e.dead = true; e.health = 0; }
    this.onEvent?.('shutdown', i);
  }

  /**
   * Take health off an engine.
   *
   * @param {number} floor the lowest health this kind of abuse can reach. Heat
   *   passes one; a propeller through the dirt does not. Overheating is meant to
   *   cost power permanently and leave you nursing it home, not to hand you a
   *   dead engine — see the seize in `update()`, which had no floor and killed
   *   the left engine eleven seconds into its own scripted overheat.
   */
  damage(i, amount, floor = 0) {
    const e = this.engines[i];
    e.health = clamp(e.health - amount, floor, 1);
    if (e.health <= 0.05) {
      e.dead = true;
      e.running = false;
      this.onEvent?.('failed', i);
    }
  }

  // Script the left engine into an overheat for the return leg.
  scriptOverheat(i, seconds = 60) {
    this.engines[i].hotScript = seconds;
    this.engines[i].temp = Math.max(this.engines[i].temp, 205);
  }

  update(dt, airspeed) {
    for (let i = 0; i < 2; i++) {
      const e = this.engines[i];
      e.backfire = Math.max(0, e.backfire - dt);

      if (e.starter > 0) {
        e.starter -= dt;
        e.rpm = damp(e.rpm, CATCH_RPM + 60, 6, dt);
        const balky = i === 1 && this.rightBalks && e.attempts <= 1;
        if (!balky && e.rpm > CATCH_RPM && !e.dead && this.fuel > 0) {
          e.running = true;
          e.starter = 0;
          e.backfire = 0.35;
          this.onEvent?.('catch', i);
        } else if (e.starter <= 0) {
          this.onEvent?.('balk', i);
          if (i === 1) this.rightBalks = false;   // it only refuses once
        }
      }

      if (e.running) {
        const target = lerp(IDLE_RPM, MAX_RPM, e.throttle) * lerp(0.55, 1, e.health);
        // Uneven idle: this thing has never seen a mechanic.
        const wobble = Math.sin(performance.now() / 1000 * 7.3 + i * 2.1) * 22 * (1 - e.throttle * 0.7);
        e.rpm = damp(e.rpm, target + wobble, 2.4, dt);

        const load = e.throttle * (e.rpm / MAX_RPM);
        const cooling = 0.02 + airspeed * 0.0032;
        // Full power sits just under the red line. Getting past it takes a
        // hot day, a long climb, or the script deciding it is time.
        /* The scripted overheat has to bite whatever power the player happens to
         * be carrying. At +105 it only crossed the mission's 250 °C trigger
         * above about three-quarters throttle, so anybody cruising home at a
         * sensible setting — which is most people — got a left engine that ran
         * warm, said nothing, and never asked to be nursed. The whole set piece
         * was invisible unless you were climbing at full power. */
        const targetTemp = 40 + load * 192 + (e.hotScript > 0 ? 185 : 0);
        const rate = targetTemp > e.temp ? 0.055 + load * 0.05 : cooling;
        e.temp = damp(e.temp, targetTemp, rate, dt);
        if (e.hotScript > 0) e.hotScript = Math.max(0, e.hotScript - dt);

        // Cooking the cylinders costs power permanently — but heat alone never
        // finishes an engine off. The point of the left engine on the way home
        // is that you fly the rest of the mission on an aeroplane that pulls to
        // one side, and you cannot do that with a dead one. The gradual decay
        // stops at 0.45 and a seizure stops at 0.3; getting past those takes
        // something mechanical, like a propeller through the dirt.
        if (e.temp > 245) {
          e.health = clamp(e.health - dt * 0.018, 0.45, 1);
          e.roughness = clamp((e.temp - 235) / 40, 0, 1);
          if (e.temp > 275 && Math.random() < dt * 0.35) {
            this.damage(i, 0.4, 0.3);
            this.onEvent?.('seize', i);
          }
        } else {
          e.roughness = damp(e.roughness, (1 - e.health) * 0.6, 2, dt);
        }

        this.fuel = Math.max(0, this.fuel - AC.fuelBurn * load * dt);
        if (this.fuel <= 0 || !this.fuelSelectors) {
          e.running = false;
          this.onEvent?.('starved', i);
        }
      } else {
        if (e.starter <= 0) e.rpm = damp(e.rpm, 0, 1.1, dt);
        e.temp = damp(e.temp, 30, 0.03 + airspeed * 0.002, dt);
      }
    }
  }

  // Newtons from one engine at the current air density.
  thrust(i, airspeed, rho) {
    const e = this.engines[i];
    if (!e.running) return e.rpm > 60 ? -180 : 0;    // windmilling drag
    /* Idle makes almost no thrust. Measuring from half idle RPM instead left
     * the aeroplane with a sixth of full power at the stop, which taxis itself
     * across the apron and takes forty seconds to decelerate to the stall. */
    const idleRef = IDLE_RPM * 0.92;
    const rpmFrac = clamp((e.rpm - idleRef) / (MAX_RPM - idleRef), -0.03, 1);
    const speedFade = clamp(1 - (airspeed / AC.vThrustFade) * 0.55, 0.25, 1);
    const densRatio = clamp(rho / 1.225, 0.45, 1);
    const rough = 1 - e.roughness * 0.22;
    return AC.thrustMax * rpmFrac * speedFade * densRatio * e.health * rough;
  }

  totalThrustFraction() {
    return (this.engines[0].rpm + this.engines[1].rpm) / (MAX_RPM * 2);
  }

  status(i) {
    const e = this.engines[i];
    if (e.dead) return 'DEAD';
    if (!e.running) return e.starter > 0 ? 'CRANK' : 'OFF';
    if (e.temp > 245) return 'HOT';
    if (e.health < 0.8) return 'ROUGH';
    return 'OK';
  }
}

export { IDLE_RPM, MAX_RPM };

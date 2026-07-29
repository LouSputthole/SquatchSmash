export const AIRSTRIP_STATES = Object.freeze([
  'meet_captain',
  'preflight',
  'board',
  'takeoff',
  'outbound',
  'remote_approach',
  'jerky_pickup',
  'load_cargo',
  'return_takeoff',
  'low_return',
  'home_approach',
  'complete',
  'detected',
  'crashed',
]);

export const PREFLIGHT_ITEMS = Object.freeze([
  'fuel',
  'controls',
  'propeller',
  'cargo',
]);

const OBJECTIVES = Object.freeze({
  meet_captain: 'Meet Captain Lou Sasole by the hangar',
  preflight: 'Inspect the fuel, controls, propeller, and cargo bay',
  board: 'Board the aircraft',
  takeoff: 'Taxi out and take off',
  outbound: 'Fly north and cross the border',
  remote_approach: 'Land at the wooded strip',
  jerky_pickup: 'Collect the beef jerky',
  load_cargo: 'Load the jerky into the cargo bay',
  return_takeoff: 'Take off for home',
  low_return: 'Stay low and cross the border undetected',
  home_approach: 'Land back at the original airstrip',
  complete: 'Jerky run complete',
  detected: 'Detected — retry the low return',
  crashed: 'Aircraft down — retry from the last checkpoint',
});

export class AirstripMission {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'meet_captain';
    this.inspected = new Set();
    this.cargoCollected = false;
    this.cargoLoaded = false;
    this.detection = 0;
    this.maxDetection = 0;
    this.landingQuality = null;
    this._resumeState = 'takeoff';
    this.#notify();
  }

  get objective() {
    return OBJECTIVES[this.state];
  }

  setState(next) {
    if (!AIRSTRIP_STATES.includes(next) || next === this.state) return false;
    this.state = next;
    this.#notify();
    return true;
  }

  meetCaptain() {
    if (this.state !== 'meet_captain') return false;
    return this.setState('preflight');
  }

  inspect(item) {
    if (this.state !== 'preflight'
      || !PREFLIGHT_ITEMS.includes(item)
      || this.inspected.has(item)) return false;
    this.inspected.add(item);
    this.hooks.onInspect?.(item, this);
    if (this.inspected.size === PREFLIGHT_ITEMS.length) this.setState('board');
    else this.#notify();
    return true;
  }

  board() {
    if (this.state !== 'board') return false;
    return this.setState('takeoff');
  }

  takeoff({ speed = 0, altitude = 0 } = {}) {
    if (this.state !== 'takeoff' || speed < 34 || altitude < 2) return false;
    this._resumeState = 'takeoff';
    return this.setState('outbound');
  }

  crossBorder() {
    if (this.state !== 'outbound') return false;
    return this.setState('remote_approach');
  }

  landRemote({ speed = Infinity, verticalSpeed = -Infinity } = {}) {
    if (this.state !== 'remote_approach'
      || speed > 32
      || verticalSpeed < -3.2) return false;
    this._resumeState = 'takeoff';
    return this.setState('jerky_pickup');
  }

  collectJerky() {
    if (this.state !== 'jerky_pickup') return false;
    this.cargoCollected = true;
    return this.setState('load_cargo');
  }

  loadCargo() {
    if (this.state !== 'load_cargo' || !this.cargoCollected) return false;
    this.cargoLoaded = true;
    this._resumeState = 'return_takeoff';
    return this.setState('return_takeoff');
  }

  takeoffReturn({ speed = 0, altitude = 0 } = {}) {
    if (this.state !== 'return_takeoff'
      || !this.cargoLoaded
      || speed < 34
      || altitude < 2) return false;
    this._resumeState = 'low_return';
    this.detection = Math.min(this.detection, 0.35);
    return this.setState('low_return');
  }

  setDetection(value) {
    if (this.state !== 'low_return') return false;
    this.detection = clamp(value, 0, 1);
    this.maxDetection = Math.max(this.maxDetection, this.detection);
    this.hooks.onDetection?.(this.detection, this);
    if (this.detection >= 1) this.setState('detected');
    return true;
  }

  crossBorderHome({ altitude = Infinity } = {}) {
    if (this.state !== 'low_return' || this.detection >= 1 || altitude > 65) return false;
    return this.setState('home_approach');
  }

  landHome({ speed = Infinity, verticalSpeed = -Infinity } = {}) {
    if (this.state !== 'home_approach'
      || !this.cargoLoaded
      || speed > 33
      || verticalSpeed < -3.2) return false;
    this.landingQuality = speed <= 28 && verticalSpeed >= -1.8 ? 'clean' : 'rough';
    return this.setState('complete');
  }

  crash() {
    if (this.state === 'complete' || this.state === 'crashed') return false;
    this._resumeState = this.cargoLoaded ? 'low_return' : 'takeoff';
    return this.setState('crashed');
  }

  retry() {
    if (this.state !== 'detected' && this.state !== 'crashed') return false;
    this.detection = this.cargoLoaded ? 0.35 : 0;
    return this.setState(this._resumeState);
  }

  #notify() {
    this.hooks.onState?.(this.state, this);
    this.hooks.onObjective?.(this.objective, this);
  }
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

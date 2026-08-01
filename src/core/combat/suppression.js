export class SuppressionModel {
  constructor({ decay = 0.55 } = {}) {
    this.value = 0;
    this.decay = decay;
  }

  noteNearMiss(distance, energy = 1) {
    const proximity = 1 - Math.max(0, Math.min(1, Number(distance) / 4));
    this.value = Math.min(1, this.value + proximity * Math.max(0, energy) * 0.42);
    return this.value;
  }

  update(dt) {
    this.value = Math.max(0, this.value - this.decay * Math.max(0, Number(dt) || 0));
    return this.value;
  }

  get aimStability() { return 1 - this.value * 0.38; }
  get vignette() { return this.value * 0.32; }
}

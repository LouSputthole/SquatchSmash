export class FixedStepRunner {
  constructor({ hz = 120, maxSteps = 8 } = {}) {
    this.fixedDt = 1 / hz;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
    this.simulationTime = 0;
    this.droppedTime = 0;
    this.lastSteps = 0;
  }

  advance(frameDt, step) {
    const incoming = Math.max(0, Math.min(0.25, Number(frameDt) || 0));
    this.accumulator += incoming;
    let count = 0;
    while (this.accumulator >= this.fixedDt && count < this.maxSteps) {
      step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.simulationTime += this.fixedDt;
      count++;
    }
    if (count === this.maxSteps && this.accumulator >= this.fixedDt) {
      const retained = this.accumulator % this.fixedDt;
      this.droppedTime += this.accumulator - retained;
      this.accumulator = retained;
    }
    this.lastSteps = count;
    return this.accumulator / this.fixedDt;
  }

  reset() {
    this.accumulator = 0;
    this.simulationTime = 0;
    this.droppedTime = 0;
    this.lastSteps = 0;
  }
}

// When the elevated train comes over, the room answers: glasses walk across
// the tablecloth, filament lamps stutter, and the camera picks up a low buzz.

export class TrainVibration {
  constructor(sceneState, director) {
    this.glassware = sceneState.glassware;
    this.lights = sceneState.lights;
    this.candles = sceneState.candles;
    this.director = director;
    this.intensity = 0;
    this.target = 0;
    this.t = 0;
    this.baseLightIntensity = new Map();
    for (const key of ['tableSpot', 'roomLight', 'hallLight', 'entryLight', 'counterLight']) {
      const l = this.lights[key];
      if (l) this.baseLightIntensity.set(l, l.intensity);
    }
  }

  set(level) {
    this.target = Math.max(0, Math.min(1, level));
  }

  update(dt) {
    this.t += dt;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 1.6);
    const v = this.intensity;
    this.director.extraShake = v * 0.9;

    for (const g of this.glassware) {
      const p = g.phase;
      g.mesh.position.x = g.base.x + Math.sin(this.t * 61 + p) * 0.0045 * v;
      g.mesh.position.z = g.base.z + Math.sin(this.t * 53 + p * 1.7) * 0.0045 * v;
      g.mesh.position.y = g.base.y + Math.abs(Math.sin(this.t * 47 + p)) * 0.0035 * v;
      g.mesh.rotation.z = Math.sin(this.t * 44 + p) * 0.02 * v;
    }

    for (const [light, base] of this.baseLightIntensity) {
      light.intensity = base * (1 - v * 0.12 * (0.5 + 0.5 * Math.sin(this.t * 31)));
    }

    for (const c of this.candles) {
      c.flame.rotation.z = Math.sin(this.t * 28 + c.phase) * 0.35 * v;
    }
  }
}

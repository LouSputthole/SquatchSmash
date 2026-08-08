/**
 * The short focus rush first authored for the line on the Bada Bing urinal.
 * Scenes own the prop and the writing; this owns the shared timing curve and
 * camera/movement effect so a reused line feels like the same drug.
 */
export class FocusRush {
  constructor({
    duration = 25,
    baseFov = 70,
    fovDrop = 9,
    moveBoost = 0.42,
  } = {}) {
    this.duration = duration;
    this.baseFov = baseFov;
    this.fovDrop = fovDrop;
    this.moveBoost = moveBoost;
    this.remaining = 0;
    this.strength = 0;
  }

  start(seconds = this.duration) {
    this.remaining = Math.max(this.remaining, seconds);
    return this.remaining;
  }

  update(dt) {
    if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - dt);
    const want = this.remaining > 0 ? 1 : 0;
    this.strength += (want - this.strength) * Math.min(1, dt * (want ? 2.2 : 0.55));
    if (!want && this.strength < 0.005) this.strength = 0;
    return this.strength;
  }

  apply(camera, player, { baseMoveScale = 1 } = {}) {
    const fov = this.baseFov - this.fovDrop * this.strength;
    if (camera && Math.abs(camera.fov - fov) > 0.0001) {
      camera.fov = fov;
      camera.updateProjectionMatrix?.();
    }
    if (player) player.moveScale = baseMoveScale * (1 + this.moveBoost * this.strength);
    return this.strength;
  }

  stop() {
    this.remaining = 0;
  }
}

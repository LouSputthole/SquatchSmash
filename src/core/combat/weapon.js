const DEFAULTS = Object.freeze({
  magazineSize: 20,
  reserveMagazines: 4,
  roundsPerSecond: 9,
  reloadSeconds: 2.1,
  recoilPerShot: 0.16,
  recoilRecovery: 1.8,
  hipSpread: 0.035,
  aimedSpread: 0.009,
  damage: 28,
  penetration: 0.35,
});

export class WeaponController {
  constructor(definition = {}) {
    this.definition = Object.freeze({ ...DEFAULTS, ...definition });
    this.magazine = this.definition.magazineSize;
    this.reserveMagazines = this.definition.reserveMagazines;
    this.reloading = 0;
    this.cooldown = 0;
    this.recoil = 0;
    this.aimed = false;
    this.shotsFired = 0;
  }

  setAimed(value) { this.aimed = value === true; }

  fire() {
    if (this.reloading > 0) return { fired: false, reason: 'reloading' };
    if (this.cooldown > 0) return { fired: false, reason: 'cooldown' };
    if (this.magazine <= 0) return { fired: false, reason: 'empty' };
    this.magazine--;
    this.shotsFired++;
    this.cooldown = 1 / this.definition.roundsPerSecond;
    this.recoil = Math.min(1, this.recoil + this.definition.recoilPerShot);
    return {
      fired: true,
      shot: this.shotsFired,
      damage: this.definition.damage,
      penetration: this.definition.penetration,
      spread: (this.aimed ? this.definition.aimedSpread : this.definition.hipSpread)
        * (1 + this.recoil),
      remaining: this.magazine,
    };
  }

  beginReload() {
    if (this.reloading > 0
      || this.magazine >= this.definition.magazineSize
      || this.reserveMagazines <= 0) return false;
    this.reloading = this.definition.reloadSeconds;
    return true;
  }

  update(dt) {
    const step = Math.max(0, Math.min(1, Number(dt) || 0));
    this.cooldown = Math.max(0, this.cooldown - step);
    this.recoil = Math.max(0, this.recoil - this.definition.recoilRecovery * step);
    if (this.reloading <= 0) return false;
    this.reloading = Math.max(0, this.reloading - step);
    if (this.reloading > 0) return false;
    this.reserveMagazines--;
    this.magazine = this.definition.magazineSize;
    return true;
  }

  snapshot() {
    return {
      magazine: this.magazine,
      reserveMagazines: this.reserveMagazines,
      reloading: this.reloading,
      cooldown: this.cooldown,
      recoil: this.recoil,
      aimed: this.aimed,
      shotsFired: this.shotsFired,
    };
  }

  restore(snapshot = {}) {
    this.magazine = Math.max(0, Math.min(this.definition.magazineSize, snapshot.magazine ?? 0));
    this.reserveMagazines = Math.max(0, Math.round(snapshot.reserveMagazines ?? 0));
    this.reloading = Math.max(0, Number(snapshot.reloading) || 0);
    this.cooldown = Math.max(0, Number(snapshot.cooldown) || 0);
    this.recoil = Math.max(0, Math.min(1, Number(snapshot.recoil) || 0));
    this.aimed = snapshot.aimed === true;
    this.shotsFired = Math.max(0, Math.round(snapshot.shotsFired ?? 0));
  }
}

export class BurstController {
  constructor({ min = 2, max = 4, pause = 0.7 } = {}) {
    this.min = min;
    this.max = Math.max(min, max);
    this.pause = pause;
    this.remaining = 0;
    this.wait = 0;
    this.sequence = 0;
  }

  update(dt, canFire) {
    this.wait = Math.max(0, this.wait - Math.max(0, dt));
    if (!canFire || this.wait > 0) return false;
    if (this.remaining <= 0) {
      this.remaining = this.min + (this.sequence++ % (this.max - this.min + 1));
    }
    this.remaining--;
    if (this.remaining <= 0) this.wait = this.pause;
    return true;
  }
}

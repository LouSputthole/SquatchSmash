export class SafehousePreparation {
  constructor(snapshot = null) {
    this.reset();
    if (snapshot) this.restore(snapshot);
  }

  get ready() { return this.armorReady && this.loadoutReady; }

  equipArmor() {
    if (this.armorReady) return { changed: false, item: 'armor' };
    this.armorReady = true;
    return { changed: true, item: 'armor' };
  }

  readyWeapons() {
    if (this.loadoutReady) return { changed: false, item: 'weapons' };
    this.loadoutReady = true;
    return { changed: true, item: 'weapons' };
  }

  reset() {
    this.armorReady = false;
    this.loadoutReady = false;
  }

  snapshot() {
    return {
      armorReady: this.armorReady,
      loadoutReady: this.loadoutReady,
      ready: this.ready,
    };
  }

  capture() { return this.snapshot(); }

  restore(snapshot = {}) {
    this.armorReady = snapshot.armorReady === true;
    this.loadoutReady = snapshot.loadoutReady === true;
  }
}

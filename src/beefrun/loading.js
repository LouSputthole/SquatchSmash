/**
 * Putting things in the aeroplane, and taking them back out.
 *
 * The cargo sequence stays physical without becoming a logistics minigame:
 * walk to each crate and press E. It is immediately loaded into the next safe
 * position, secured, and shown on the balance diagram. The door closes after
 * the final crate, so no cart, hold-marker hunt, or strap loop can strand the
 * player between the flight beats.
 *
 * The same class runs twice. At Whispering Pines it is three long crates of
 * Old Stove's tractor parts; at El Hueso those come out and three crates of
 * Silverback Reserve go in. Only the factory, the stack position and the
 * dialogue differ, so `kind` is the whole of the difference.
 *
 */
import { mesh, boxGeo, mat } from './util.js';
import { makeCrate, makeGunCrate } from './cargo.js';

export class Loading {
  /**
   * @param {object} deps
   *   { scene, interaction, aircraft, cargo, dialogue, audio, player,
   *     groundAt, stackAt, kind, count, briefBeat }
   *   `kind` is 'jerky' or 'guns'; `stackAt` is a world position.
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.kind = this.kind || 'jerky';
    this.count = this.count || 3;
    this.crates = [];
    this.registered = [];
    this.zoneHits = {};
    this.doorOpen = false;
    this.doorLatched = true;
    this.armed = false;
    this.onComplete = null;
    this.warned = { tail: false, nose: false, strap: false };
    this.build();
  }

  build() {
    const stack = this.stackAt;
    const make = this.kind === 'guns' ? makeGunCrate : makeCrate;
    const spacing = this.kind === 'guns' ? 1.9 : 1.35;

    for (let i = 0; i < this.count; i++) {
      const crate = make(i);
      crate.slip = 0;
      const cx = stack.x + (i % 2) * spacing;
      const cz = stack.z + Math.floor(i / 2) * 1.2;
      crate.group.position.set(cx, this.groundAt(cx, cz), cz);
      crate.group.rotation.y = 0.2 - i * 0.15;
      this.scene.add(crate.group);
      // The first jerky crate is open, because somebody has been holding a strip
      // of it up to the light for the last two minutes. Stove's do not open.
      if (this.kind === 'jerky') {
        if (i === 0) {
          crate.open = true;
          crate.lid.position.set(0.9, 0.05, 0.3);
          crate.lid.rotation.z = 0.1;
        } else {
          crate.contents.visible = false;
        }
      }
      this.crates.push(crate);
      this.cargo.loose.push(crate);
    }

    // Targets still exist for unloading on the far strip. Loading itself is
    // deliberately direct: the player uses each visible crate once.
    for (const [name, zone] of Object.entries(this.cargo.zones)) {
      const hit = mesh(boxGeo(1.2, 0.1, 1.0), mat({
        color: 0xd8c86a, roughness: 1, transparent: true, opacity: 0.22,
      }), -0.2, -0.9, zone.arm);
      hit.castShadow = false;
      hit.visible = false;
      this.aircraft.group.add(hit);
      this.zoneHits[name] = hit;
    }
  }

  /* ---------------------------------------------------------------- */

  get loadedCount() { return this.cargo.crateCount; }
  get allAboard() { return this.cargo.crateCount >= this.count; }
  get finished() {
    return this.allAboard && this.cargo.allStrapped && this.doorLatched && !this.doorOpen;
  }

  arm() {
    if (this.armed) return;
    this.armed = true;
    const reg = (m, desc) => {
      this.interaction.register(m, desc);
      this.registered.push(m);
    };

    // The cargo door is opened for this short sequence and closes itself once
    // all three crates are loaded. The only player action is E on a crate.
    this.doorOpen = true;
    this.doorLatched = false;
    this.showZones(false);

    for (const crate of this.crates) {
      reg(crate.group, {
        label: () => crate.zone ? '<b>Crate aboard</b>' : 'Load this <b>crate</b>',
        key: 'E',
        enabled: () => !crate.zone && !this.finished,
        onUse: () => this.loadCrate(crate),
      });
    }
  }

  disarm() {
    for (const m of this.registered) this.interaction.unregister(m);
    this.registered.length = 0;
    this.armed = false;
    this.showZones(false);
  }

  showZones(on) {
    for (const hit of Object.values(this.zoneHits)) hit.visible = on;
    this.cargo.showMarkers(on);
  }

  /** Load this crate into the next empty hold position and secure it. */
  loadCrate(crate) {
    if (crate.zone) return false;
    const name = Object.keys(this.cargo.zones)
      .find((zoneName) => !this.cargo.zones[zoneName].crate);
    if (!name) return false;
    this.cargo.load(name, crate);
    this.cargo.strap(name);
    this.audio?.play('can.set', { volume: 0.9 });
    if (this.briefBeat) this.dialogue.play(this.briefBeat, { once: true });
    this.checkBalance();
    if (this.allAboard) {
      this.doorOpen = false;
      this.doorLatched = true;
      this.audio?.play('door.knob', { volume: 0.8 });
      this.dialogue.play('load.done', { once: true });
      this.checkFinished();
    }
    return true;
  }

  /** Lou watches the diagram over your shoulder and says the useful thing. */
  checkBalance() {
    const state = this.cargo.balanceState;
    if (state === 'tail' && !this.warned.tail) {
      this.warned.tail = true;
      this.dialogue.play('load.tail', { urgent: true });
    } else if (state === 'nose' && !this.warned.nose) {
      this.warned.nose = true;
      this.dialogue.play('load.nose', { urgent: true });
    }
  }

  checkFinished() {
    if (this.finished) this.onComplete?.();
  }

  /* ---------------------------------------------------------------- */
  /* Taking it back out                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Arm the reverse: every crate in the hold becomes something to lift out and
   * put down at `dropAt`. Used at El Hueso, where Stove's consignment comes off
   * before the jerky goes on.
   */
  armUnload(dropAt) {
    this.dropAt = dropAt;
    this.unloaded = [];
    this.disarm();
    this.armed = true;
    const reg = (m, desc) => {
      this.interaction.register(m, desc);
      this.registered.push(m);
    };

    reg(this.aircraft.parts.doorHandle, {
      label: () => (this.doorOpen ? 'Close the <b>cargo door</b>' : 'Open the <b>cargo door</b>'),
      key: 'E',
      hold: 0.6,
      onHoldProgress: (t) => { this.aircraft.parts.doorLever.rotation.x = (this.doorOpen ? 1 - t : t) * Math.PI * 0.5; },
      onUse: () => {
        this.doorOpen = !this.doorOpen;
        this.doorLatched = !this.doorOpen;
        this.audio?.play('door.knob', { volume: 0.8 });
        this.showZones(this.doorOpen);
      },
    });

    for (const [name, hit] of Object.entries(this.zoneHits)) {
      reg(hit, {
        label: () => {
          const zone = this.cargo.zones[name];
          if (!zone.crate) return `<b>${name}</b> — empty`;
          return `Take the crate out of <b>${name}</b>`;
        },
        key: 'E',
        enabled: () => this.doorOpen && !!this.cargo.zones[name].crate,
        onUse: () => this.takeOut(name),
      });
    }
  }

  /** Lift one crate out and set it down on the pile. */
  takeOut(name) {
    const crate = this.cargo.unload(name);
    if (!crate) return false;
    if (crate.straps) {
      for (const s of crate.straps) s.parent?.remove(s);
      crate.straps = null;
    }
    const n = (this.unloaded ||= []).length;
    const drop = this.dropAt;
    const x = drop.x + (n % 2) * 1.9;
    const z = drop.z + Math.floor(n / 2) * 1.2;
    this.scene.add(crate.group);
    crate.group.position.set(x, this.groundAt(x, z), z);
    crate.group.rotation.set(0, 0.3 - n * 0.2, 0);
    crate.group.scale.setScalar(1);
    crate.slip = 0;
    this.unloaded.push(crate);
    this.audio?.play('can.set', { volume: 0.85 });
    if (this.cargo.crateCount === 0) this.onComplete?.();
    return true;
  }

  /* ---------------------------------------------------------------- */

  update(dt, playerPos, playerYaw) {
    void dt; void playerPos; void playerYaw;
  }

  /** Everything this sequence added, taken back out for a checkpoint restart. */
  dispose() {
    this.disarm();
    for (const crate of this.crates) {
      crate.group.parent?.remove(crate.group);
    }
    this.crates.length = 0;
    for (const hit of Object.values(this.zoneHits)) hit.parent?.remove(hit);
  }
}

/**
 * Putting things in the aeroplane, and taking them back out.
 *
 * The cargo sequence is played, not watched: open the door, lift a crate, put
 * it on the handcart, push the cart to the aeroplane, put each crate in one of
 * three marked positions, strap them, shut the door. The balance diagram on the
 * HUD reacts as it happens, so "all three in the back" is a thing the player
 * sees go red rather than a thing they are told afterwards.
 *
 * The same class runs twice. At Whispering Pines it is three long crates of
 * Old Stove's tractor parts; at El Hueso those come out and three crates of
 * Silverback Reserve go in. Only the factory, the stack position and the
 * dialogue differ, so `kind` is the whole of the difference.
 *
 * Crates can also be carried by hand, one at a time, if somebody would rather
 * do it the slow way. Cecilio has a view about that too.
 */
import * as THREE from 'three';
import { clamp, damp, group, mesh, boxGeo, mat } from './util.js';
import { makeCrate, makeGunCrate, makeHandcart, CRATE_MASS } from './cargo.js';

const CARRY_OFFSET = new THREE.Vector3(0, -0.42, 0.85);

export class Loading {
  /**
   * @param {object} deps
   *   { scene, interaction, aircraft, cargo, dialogue, audio, camera, player,
   *     groundAt, stackAt, cartAt, kind, count, briefBeat }
   *   `kind` is 'jerky' or 'guns'; `stackAt`/`cartAt` are world positions.
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.kind = this.kind || 'jerky';
    this.count = this.count || 3;
    this.crates = [];
    this.cart = null;
    this.carried = null;
    this.pushing = false;
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

    // The handcart.
    this.cart = makeHandcart();
    const cart = this.cartAt || { x: stack.x + 3.4, z: stack.z + 1 };
    this.cart.group.position.set(cart.x, this.groundAt(cart.x, cart.z), cart.z);
    this.cart.group.rotation.y = -0.4;
    this.scene.add(this.cart.group);
    this.cart.load = [];

    // Hit targets for the three positions inside the cabin.
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
  get onCart() { return this.cart.load.length; }
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

    // ---- The door ----
    reg(this.aircraft.parts.doorHandle, {
      label: () => (this.doorOpen ? 'Close and <b>latch</b> the cargo door' : 'Open the <b>cargo door</b>'),
      key: 'E',
      hold: 0.6,
      onHoldProgress: (t) => { this.aircraft.parts.doorLever.rotation.x = (this.doorOpen ? 1 - t : t) * Math.PI * 0.5; },
      onUse: () => {
        this.doorOpen = !this.doorOpen;
        this.doorLatched = !this.doorOpen;
        this.audio?.play('door.knob', { volume: 0.8 });
        this.showZones(this.doorOpen);
        if (!this.doorOpen && this.allAboard) {
          this.dialogue.play('load.done', { once: true });
          this.checkFinished();
        }
      },
      onTap: () => {
        if (this.doorOpen) this.dialogue.play('load.done', { once: true });
      },
    });

    // ---- The crates ----
    for (const crate of this.crates) {
      reg(crate.group, {
        label: () => (this.carried ? 'Hands <b>full</b>' : 'Lift the <b>crate</b>'),
        key: 'E',
        enabled: () => !this.carried && !crate.zone,
        onUse: () => this.pickUp(crate),
      });
    }

    // ---- The cart ----
    reg(this.cart.handle, {
      label: () => {
        if (this.carried) return 'Put the crate <b>on the cart</b>';
        return this.pushing ? 'Let go of the <b>cart</b>' : 'Push the <b>cart</b>';
      },
      key: 'E',
      onUse: () => {
        if (this.carried) this.putOnCart();
        else this.pushing = !this.pushing;
      },
    });

    // ---- The three positions ----
    for (const [name, hit] of Object.entries(this.zoneHits)) {
      reg(hit, {
        label: () => {
          const zone = this.cargo.zones[name];
          if (zone.crate) return zone.strapped ? `<b>${name}</b> secured` : `Hold to <b>strap</b> the ${name} crate`;
          return this.haveCrate ? `Load into <b>${name}</b>` : `<b>${name}</b> position`;
        },
        key: 'E',
        hold: 0.8,
        enabled: () => this.doorOpen,
        onUse: () => this.strap(name),
        onTap: () => this.place(name),
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

  get haveCrate() {
    return !!this.carried || this.cart.load.length > 0;
  }

  /* ---------------------------------------------------------------- */

  pickUp(crate) {
    this.carried = crate;
    const i = this.cart.load.indexOf(crate);
    if (i >= 0) this.cart.load.splice(i, 1);
    this.camera.add(crate.group);
    crate.group.position.copy(CARRY_OFFSET);
    crate.group.rotation.set(0, 0, 0);
    crate.group.scale.setScalar(0.62);       // held close, so it reads as heavy
    this.audio?.play('pizza.take', { volume: 0.6 });
    // Carrying two hundred kilos of cured meat slows a person down.
    if (this.player) this.player.moveScale = 0.62;
  }

  drop(crate, position) {
    this.scene.add(crate.group);
    crate.group.position.copy(position);
    crate.group.position.y = this.groundAt(position.x, position.z);
    crate.group.scale.setScalar(1);
    crate.group.rotation.set(0, 0, 0);
    if (this.carried === crate) this.carried = null;
    if (this.player) this.player.moveScale = 1;
  }

  putOnCart() {
    const crate = this.carried;
    if (!crate) return;
    if (this.cart.load.length >= 3) return;
    this.cart.group.add(crate.group);
    const slot = this.cart.load.length;
    crate.group.position.set(0, 0.5 + slot * 0.86, 0.1);
    crate.group.rotation.set(0, 0, 0);
    crate.group.scale.setScalar(1);
    this.cart.load.push(crate);
    this.carried = null;
    if (this.player) this.player.moveScale = 1;
    this.audio?.play('can.set', { volume: 0.7 });
  }

  /** Put whatever is to hand into a marked position. */
  place(name) {
    const zone = this.cargo.zones[name];
    if (!zone || zone.crate || !this.doorOpen) return false;
    const crate = this.carried || this.cart.load[this.cart.load.length - 1];
    if (!crate) return false;
    if (this.carried === crate) {
      this.carried = null;
      if (this.player) this.player.moveScale = 1;
    } else {
      this.cart.load.pop();
    }
    this.cargo.load(name, crate);
    this.audio?.play('can.set', { volume: 0.9 });
    if (this.briefBeat) this.dialogue.play(this.briefBeat, { once: true });
    this.checkBalance();
    return true;
  }

  strap(name) {
    const zone = this.cargo.zones[name];
    if (!zone?.crate || zone.strapped) return false;
    this.cargo.strap(name);
    this.audio?.play('frame.adjust', { volume: 0.7 });
    this.checkFinished();
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
    if (this.allAboard && !this.cargo.allStrapped && !this.warned.strap) {
      this.warned.strap = true;
      this.dialogue.play('load.strap');
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
    // The cart follows a couple of metres in front of whoever is pushing it.
    if (this.pushing) {
      const want = new THREE.Vector3(
        playerPos.x - Math.sin(playerYaw) * 1.7,
        0,
        playerPos.z - Math.cos(playerYaw) * 1.7,
      );
      want.y = this.groundAt(want.x, want.z);
      this.cart.group.position.x = damp(this.cart.group.position.x, want.x, 7, dt);
      this.cart.group.position.z = damp(this.cart.group.position.z, want.z, 7, dt);
      this.cart.group.position.y = damp(this.cart.group.position.y, want.y, 7, dt);
      this.cart.group.rotation.y = damp(this.cart.group.rotation.y, playerYaw, 6, dt);
    }

    // A carried crate sways with the walk.
    if (this.carried) {
      const t = performance.now() / 1000;
      this.carried.group.rotation.z = Math.sin(t * 4.4) * 0.035;
      this.carried.group.position.y = CARRY_OFFSET.y + Math.sin(t * 8.8) * 0.012;
    }
    void clamp; void group; void CRATE_MASS;
  }

  /** Everything this sequence added, taken back out for a checkpoint restart. */
  dispose() {
    this.disarm();
    for (const crate of this.crates) {
      crate.group.parent?.remove(crate.group);
    }
    this.crates.length = 0;
    this.cart.group.parent?.remove(this.cart.group);
    for (const hit of Object.values(this.zoneHits)) hit.parent?.remove(hit);
  }
}

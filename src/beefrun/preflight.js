/**
 * The walkaround.
 *
 * Six things to touch, in any order, using the apartment's own look-and-press
 * interaction system: the chocks, the fuel caps, the propellers, a fuel sample,
 * the cargo door, and the control surfaces. It is short on purpose. The job it
 * is really doing is teaching the player that E interacts, that holding E is a
 * different thing from tapping it, and that Lou has an opinion about all of it.
 *
 * The fuel sample is the one that is played rather than pressed: hold to drain,
 * and let go when the cup runs clear. That uses the hold/tap pair the
 * apartment's InteractionSystem already supports — a full hold overflows it, a
 * release inside the window is a good sample.
 */
import * as THREE from 'three';
import {
  solid, mat, boxGeo, cylGeo, mesh, group, clamp, damp,
} from './util.js';

const CHOCK_COLOUR = 0x8a6a42;

/**
 * A generous invisible box in front of a small part, so the crosshair does not
 * have to find a 30-centimetre wooden wedge from two metres away.
 *
 * Three.js raycasts against a mesh whose material is invisible, which is what
 * makes this work: the proxy is the thing the interaction system hits, and the
 * part itself is what the player sees move.
 */
function hitProxy(parent, w, h, d, x = 0, y = 0, z = 0) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  box.position.set(x, y, z);
  box.name = 'hit';
  parent.add(box);
  return box;
}

export class Preflight {
  /**
   * @param {object} deps { scene, interaction, aircraft, dialogue, hud, audio, physics }
   */
  constructor({ scene, interaction, aircraft, dialogue, audio }) {
    this.scene = scene;
    this.interaction = interaction;
    this.aircraft = aircraft;
    this.dialogue = dialogue;
    this.audio = audio;

    this.tasks = {
      chocks: { done: false, label: 'Wheel chocks', count: 0, need: 2 },
      caps: { done: false, label: 'Fuel caps', count: 0, need: 2 },
      props: { done: false, label: 'Propellers', count: 0, need: 2 },
      sample: { done: false, label: 'Fuel sample', count: 0, need: 1 },
      door: { done: false, label: 'Cargo door', count: 0, need: 1 },
      surfaces: { done: false, label: 'Control surfaces', count: 0, need: 2 },
    };

    this.registered = [];
    this.armed = false;
    this.onProgress = null;
    this.onComplete = null;

    this.sampleAttempts = 0;
    this.capLoose = 1;              // the right cap is the loose one
    this.capTurn = 0;
    this.surfaceAnim = { elevator: 0, rudder: 0 };
    this.build();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const ac = this.aircraft;
    // Chocks, in front of and behind each main wheel, parented to the aeroplane
    // so they sit right whatever heading it was left on.
    this.chocks = [];
    for (const [i, gear] of [[0, ac.parts.gear[1]], [1, ac.parts.gear[2]]]) {
      const g = group(`chock${i}`);
      const wedge = mesh(boxGeo(0.34, 0.22, 0.5), solid(CHOCK_COLOUR, { roughness: 1 }), 0, 0.11, 0);
      wedge.rotation.x = 0.22;
      g.add(wedge);
      const rope = mesh(cylGeo(0.02, 0.02, 0.5, 5), solid(0x8a8470, { roughness: 1 }), 0, 0.05, -0.3);
      rope.rotation.x = Math.PI / 2;
      g.add(rope);
      g.position.set(gear.leg.position.x, -1.62, gear.leg.position.z + 0.55);
      hitProxy(g, 0.8, 0.45, 0.8, 0, 0.16, 0);
      ac.group.add(g);
      this.chocks.push(g);
    }

    // The sampling cup, and the fuel in it. Hidden until it is being used.
    this.cup = group('sample-cup');
    const glass = mesh(cylGeo(0.055, 0.05, 0.12, 10), mat({
      color: 0xd8e4ea, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.45,
    }), 0, 0, 0);
    this.cup.add(glass);
    this.sampleFluid = mesh(cylGeo(0.048, 0.045, 0.02, 10), mat({
      color: 0xb8b49a, roughness: 0.35, transparent: true, opacity: 0.9,
    }), 0, -0.04, 0);
    this.cup.add(this.sampleFluid);
    this.cup.visible = false;
    ac.group.add(this.cup);
    this.cup.position.set(-1.4, -0.35, 0.4);

    // Reach proxies for the parts that are only a few centimetres across.
    // Kept tight: a proxy big enough to shadow the part next to it is worse
    // than no proxy at all — the prompt says one thing and E does another.
    for (const cap of ac.parts.fuelCap) hitProxy(cap, 0.46, 0.26, 0.46);
    // The propeller is three thin blades and a spinner; without this the
    // crosshair spends its time between them.
    for (const hub of ac.parts.prop) hitProxy(hub, 0.85, 0.85, 0.34);
    for (const drain of ac.parts.drain) hitProxy(drain, 0.34, 0.34, 0.34);
    hitProxy(ac.parts.doorHandle, 0.3, 0.34, 0.6);
  }

  /* ---------------------------------------------------------------- */

  get progress() {
    const all = Object.values(this.tasks);
    return all.filter((t) => t.done).length / all.length;
  }

  get complete() {
    return Object.values(this.tasks).every((t) => t.done);
  }

  /** Remaining tasks, for the objective line. */
  get remaining() {
    return Object.values(this.tasks).filter((t) => !t.done).map((t) => t.label);
  }

  finish(name) {
    const task = this.tasks[name];
    if (!task || task.done) return;
    task.count++;
    if (task.count >= task.need) {
      task.done = true;
      this.audio?.play('ui.select', { volume: 0.5 });
    }
    this.onProgress?.(name, task);
    if (this.complete) {
      this.dialogue.play('preflight.done', { once: true });
      this.onComplete?.();
    }
  }

  /* ---------------------------------------------------------------- */

  arm() {
    if (this.armed) return;
    this.armed = true;
    const reg = (meshObj, desc) => {
      this.interaction.register(meshObj, desc);
      this.registered.push(meshObj);
    };
    const ac = this.aircraft;

    // ---- 1. Chocks ----
    this.chocks.forEach((chock, i) => {
      reg(chock, {
        label: () => 'Pull the <b>chock</b> away',
        key: 'E',
        enabled: () => !this.tasks.chocks.done && chock.visible,
        onLook: () => this.dialogue.play('preflight.chocks', { once: true }),
        onUse: () => {
          // Dropped beside the wheel rather than deleted, because you can see
          // that you did it.
          chock.position.x += i === 0 ? -1.1 : 1.1;
          chock.position.z += 0.4;
          chock.rotation.z = i === 0 ? 1.4 : -1.4;
          this.interaction.unregister(chock);
          this.audio?.play('frame.adjust', { volume: 0.6 });
          this.finish('chocks');
          if (this.tasks.chocks.count === 1) this.dialogue.play('preflight.chocks.done', { once: true });
        },
      });
    });

    // ---- 2. Fuel caps ----
    ac.parts.fuelCap.forEach((cap, i) => {
      const loose = i === this.capLoose;
      reg(cap, {
        label: () => (loose
          ? (this.capTurn > 0 ? 'Keep <b>turning</b>' : 'Turn the loose <b>fuel cap</b>')
          : 'Check the <b>fuel cap</b>'),
        key: 'E',
        hold: loose ? 0.9 : undefined,
        enabled: () => !this.capChecked?.[i],
        onLook: () => this.dialogue.play('preflight.caps', { once: true }),
        onHoldProgress: (t) => {
          this.capTurn = t;
          cap.rotation.y = t * Math.PI * 2.4;
          if (loose) cap.position.y = 1.34 - t * 0.02;
        },
        onUse: () => {
          this.capChecked = this.capChecked || [false, false];
          this.capChecked[i] = true;
          cap.rotation.y = Math.PI * 2.4;
          this.audio?.play('switch.click', { volume: 0.7 });
          if (loose) this.dialogue.bark('smooth');
          this.interaction.unregister(cap);
          this.finish('caps');
        },
        onTap: () => {
          if (loose) {
            this.dialogue.play('preflight.caps.loose', { once: true });
            return;
          }
          this.capChecked = this.capChecked || [false, false];
          this.capChecked[i] = true;
          this.interaction.unregister(cap);
          this.audio?.play('switch.click', { volume: 0.5 });
          this.finish('caps');
        },
      });
    });

    // ---- 3. Propellers ----
    ac.parts.prop.forEach((hub, i) => {
      reg(hub, {
        label: () => 'Check the <b>propeller</b>',
        key: 'E',
        enabled: () => !this.propChecked?.[i],
        onUse: () => {
          this.propChecked = this.propChecked || [false, false];
          this.propChecked[i] = true;
          // Turn it through a quarter so it is obvious it moved.
          hub.rotation.z += Math.PI / 2;
          this.audio?.play('frame.adjust', { volume: 0.4 });
          if (i === 0) this.dialogue.play('preflight.props', { once: true });
          this.interaction.unregister(hub);
          this.finish('props');
        },
      });
    });

    // ---- 4. Fuel sample ----
    // Hold to drain. The first cup is cloudy; Lou hits the tank and the second
    // runs clear. Let go while it is clear and it counts.
    ac.parts.drain.forEach((drain) => {
      reg(drain, {
        label: () => 'Hold to <b>drain a sample</b>',
        holdLabel: () => 'Let go when it runs <b>clear</b>',
        key: 'E',
        hold: 1.5,
        enabled: () => !this.tasks.sample.done,
        onLook: () => this.dialogue.play('preflight.drain', { once: true }),
        onHoldProgress: (t) => {
          this.cup.visible = true;
          this.cup.position.set(drain.position.x, drain.position.y - 0.34, drain.position.z);
          this.sampleFluid.scale.y = clamp(t * 5, 0.2, 2.6);
          this.sampleFluid.position.y = -0.05 + this.sampleFluid.scale.y * 0.01;
          // First attempt: never clears. Second: clears in the window.
          const clear = this.sampleAttempts > 0 && t > 0.45 && t < 0.82;
          this.sampleClear = clear;
          this.sampleFluid.material = mat({
            color: clear ? 0x9ec4d8 : 0xb8b49a,
            roughness: clear ? 0.12 : 0.5,
            transparent: true,
            opacity: clear ? 0.55 : 0.95,
          });
        },
        // Held all the way: it overflows down your arm.
        onUse: () => {
          this.cup.visible = false;
          this.sampleAttempts++;
          this.dialogue.play('preflight.drain.cloudy', { once: this.sampleAttempts > 1 });
          this.audio?.play('glue.slip', { volume: 0.4 });
        },
        onTap: () => {
          this.cup.visible = false;
          if (this.sampleClear) {
            this.dialogue.play('preflight.drain.clear', { once: true });
            this.audio?.play('can.set', { volume: 0.5 });
            ac.parts.drain.forEach((d) => this.interaction.unregister(d));
            this.finish('sample');
          } else {
            this.sampleAttempts++;
            if (this.sampleAttempts === 1) {
              this.dialogue.play('preflight.drain.cloudy');
              // Lou walks over and hits the tank. It is not a repair.
              this.audio?.play('neighbours.thump', { volume: 0.5, delay: 0.8 });
            } else {
              this.dialogue.bark('smooth');
            }
          }
        },
      });
    });

    // ---- 5. Cargo door ----
    reg(ac.parts.doorHandle, {
      label: () => 'Turn the <b>door handle</b>',
      key: 'E',
      hold: 0.7,
      enabled: () => !this.tasks.door.done,
      onLook: () => this.dialogue.play('preflight.door', { once: true }),
      onHoldProgress: (t) => { ac.parts.doorLever.rotation.x = t * Math.PI * 0.5; },
      onUse: () => {
        ac.parts.doorLever.rotation.x = Math.PI * 0.5;
        this.audio?.play('door.knob', { volume: 0.8 });
        this.interaction.unregister(ac.parts.doorHandle);
        this.finish('door');
      },
      onTap: () => this.dialogue.play('preflight.door', { once: true }),
    });

    // ---- 6. Control surfaces ----
    for (const [name, pivot] of [['elevator', ac.parts.elevator], ['rudder', ac.parts.rudder]]) {
      reg(pivot, {
        label: () => `Move the <b>${name}</b>`,
        key: 'E',
        enabled: () => !this.surfaceChecked?.[name],
        onLook: () => this.dialogue.play('preflight.surfaces', { once: true }),
        onUse: () => {
          this.surfaceChecked = this.surfaceChecked || {};
          this.surfaceChecked[name] = true;
          this.surfaceAnim[name] = 1;
          this.audio?.play('frame.adjust', { volume: 0.5 });
          this.interaction.unregister(pivot);
          this.finish('surfaces');
        },
      });
    }
  }

  disarm() {
    for (const m of this.registered) this.interaction.unregister(m);
    this.registered.length = 0;
    this.armed = false;
    this.cup.visible = false;
  }

  /** Chocks vanish once the aeroplane starts moving; surfaces spring back. */
  update(dt, physics) {
    for (const name of ['elevator', 'rudder']) {
      if (this.surfaceAnim[name] > 0) {
        this.surfaceAnim[name] = Math.max(0, this.surfaceAnim[name] - dt * 0.8);
        const swing = Math.sin(this.surfaceAnim[name] * Math.PI * 3) * 0.32 * this.surfaceAnim[name];
        if (name === 'elevator') this.aircraft.parts.elevator.rotation.x = swing;
        else this.aircraft.parts.rudder.rotation.y = swing;
      }
    }
    if (physics?.groundSpeed > 1.5) {
      for (const c of this.chocks) c.visible = false;
    }
    void damp; void THREE;
  }

  /** True when the chocks are still under the wheels — Lou will mention it. */
  get chocksIn() {
    return !this.tasks.chocks.done;
  }
}

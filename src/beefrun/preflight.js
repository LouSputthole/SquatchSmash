/**
 * The walkaround.
 *
 * Six things to touch, in any order, using the apartment's own look-and-press
 * interaction system: the chocks, the fuel caps, the propellers, a fuel sample,
 * the cargo door, and the control surfaces. It is short on purpose. The job it
 * is really doing is teaching the player that E interacts, that holding E is a
 * different thing from tapping it, and that Lou has an opinion about all of it.
 *
 * The order stays free, but the walkaround is GUIDED: `next` names the first
 * unfinished check in walk order, a pulsing marker stands at that part of the
 * aeroplane, and `checklist` feeds the HUD its done / next / still-to-do rows.
 * Touch things in any order you like; the guidance just keeps pointing at the
 * nearest loose end.
 *
 * The fuel sample is a cup off each side, the way Lou says it. It used to be a
 * dexterity test — a hold released inside an unsignalled slice of its own
 * timer, on a first draw that was rigged to fail — which meant the one item
 * whose marker says "stand here and press E" was the one item E could not
 * finish. Now every way of closing the valve produces a cup: a tap, a release
 * part-way through a hold, a hold held until it overflows, even dragging the
 * crosshair off the drain mid-hold. The first cup is cloudy and Lou hits the
 * tank; the second runs clear. Holding is the flourish — you get to watch the
 * stream and the cup fill — and never the gate.
 */
import * as THREE from 'three';
import {
  solid, mat, boxGeo, cylGeo, mesh, flatMesh, group, clamp, damp,
} from './util.js';
import { terrainHeight } from './terrain.js';

const CHOCK_COLOUR = 0x8a6a42;

/* The order a careful walkaround goes in — chocks first, round the wing, down
 * the fuselage, tail last. The guidance points here; the player may not. */
const ORDER = ['chocks', 'caps', 'props', 'sample', 'door', 'surfaces'];

const _markerPos = new THREE.Vector3();
const _markerOff = new THREE.Vector3();
const _chockOff = new THREE.Vector3();

/* Where the highlight belongs on each part, in aeroplane-local metres from the
 * object the interaction is registered on.
 *
 * Most of them are the part. The control surfaces are not: `parts.rudder` and
 * `parts.elevator` are hinge-line pivots, and the panel you actually push
 * hangs half a metre aft of the hinge and three metres up the fin — so a
 * marker at the bare pivot pointed at air beside the tail, which is what the
 * ring on the tarmac was really complaining about. */
const MARKER_OFFSET = {
  chocks: new THREE.Vector3(0, 0.16, 0),
  caps: new THREE.Vector3(0, 0.06, 0),
  props: new THREE.Vector3(0, 0, 0.16),
  sample: new THREE.Vector3(0, -0.08, 0),
  door: new THREE.Vector3(0, 0, 0),
  surfaces: new THREE.Vector3(0, 0, -0.45),
};

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
      sample: { done: false, label: 'Fuel samples', count: 0, need: 2 },
      door: { done: false, label: 'Cargo door', count: 0, need: 1 },
      surfaces: { done: false, label: 'Control surfaces', count: 0, need: 2 },
    };

    this.registered = [];
    this.armed = false;
    this.onProgress = null;
    this.onComplete = null;

    this.sampleDrawn = [false, false];   // one cup off each side
    this.sampleHeld = null;              // which valve is open right now
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
    /* Which way the wedges point, kept for `stowGroundKit()` — once a chock is
     * out on the tarmac it is no longer a child of the aeroplane, so "which
     * side was it on" has to be remembered rather than read off its parent. */
    this.chocks[0].userData.side = -1;
    this.chocks[1].userData.side = 1;

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

    /* The fuel you can see: a stream running from the open valve down into
     * the cup, and the puddle every discarded cup leaves on the apron. The
     * stream only exists while the valve is held open — update() times it out
     * rather than trusting a release event, because drifting the crosshair
     * off the drain mid-hold cancels the hold without firing anything. */
    this.stream = mesh(cylGeo(0.013, 0.022, 0.3, 6), mat({
      color: 0xb8b49a, roughness: 0.3, transparent: true, opacity: 0.85,
    }), 0, 0, 0);
    this.stream.castShadow = false;
    this.stream.visible = false;
    ac.group.add(this.stream);
    this.streamT = 0;
    this.puddles = new Map();       // drain index -> the stain under that wing

    // Reach proxies for the parts that are only a few centimetres across.
    // Kept tight: a proxy big enough to shadow the part next to it is worse
    // than no proxy at all — the prompt says one thing and E does another.
    for (const cap of ac.parts.fuelCap) hitProxy(cap, 0.46, 0.26, 0.46);
    // The propeller is three thin blades and a spinner; without this the
    // crosshair spends its time between them.
    for (const hub of ac.parts.prop) hitProxy(hub, 0.85, 0.85, 0.34);
    for (const drain of ac.parts.drain) hitProxy(drain, 0.34, 0.34, 0.34);
    hitProxy(ac.parts.doorHandle, 0.3, 0.34, 0.6);

    /* The guide marker. The pulsing ring is ON the part now, turned to face
     * whoever is looking at it, with a slow-turning diamond in the middle of
     * it; the ring on the tarmac stays as a dimmer footprint saying where to
     * stand, and only bothers when the part is well off the ground. Anything
     * on the tail used to get the tarmac ring and nothing else, which pointed
     * at a patch of grass seven metres behind the aeroplane.
     *
     * Basic materials with no depth write — it is HUD paint that happens to
     * live in the world, the same idiom as the approach gates. */
    /* Drawn through the aeroplane on purpose. Both fuel caps sit on top of a
     * high wing, a metre and a half over the player's head, so from the ground
     * the thing the checklist is asking for is behind two hundred kilos of
     * cream-painted aluminium. The marker is guidance, not scenery: it belongs
     * on the glass in front of the wing rather than hidden behind it. */
    const paint = (opacity) => new THREE.MeshBasicMaterial({
      color: 0xe8c86a,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.marker = group('preflight-marker');
    this.markerRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 8, 28), paint(0.85));
    this.markerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), paint(0.9));
    this.markerFoot = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 28), paint(0.4));
    this.markerFoot.rotation.x = -Math.PI / 2;
    for (const piece of [this.markerFoot, this.markerRing, this.markerGem]) {
      // renderOrder is per-object in three.js, so it goes on each of them.
      piece.renderOrder = 6;
      this.marker.add(piece);
    }
    this.marker.visible = false;
    this.markerT = 0;
    this.scene.add(this.marker);
  }

  /* ---------------------------------------------------------------- */

  /** The stain under one wing root, minted the first time a cup lands there. */
  puddleFor(i) {
    if (!this.puddles.has(i)) {
      const drain = this.aircraft.parts.drain[i];
      // On the tarmac: the aircraft group's origin rides at gear height 1.62.
      const p = flatMesh(new THREE.CircleGeometry(1, 12), mat({
        color: 0x2a2620, roughness: 0.3, transparent: true, opacity: 0.5,
      }), drain.position.x, -1.575, drain.position.z + 0.12);
      p.rotation.x = -Math.PI / 2;
      p.scale.setScalar(0.001);
      p.visible = false;
      this.aircraft.group.add(p);
      this.puddles.set(i, p);
    }
    return this.puddles.get(i);
  }

  /** Tip a cup out onto the apron. The puddle spreads; clear fuel blues it. */
  dumpCup(i, clear) {
    this.cup.visible = false;
    this.stream.visible = false;
    const p = this.puddleFor(i);
    p.visible = true;
    p.scale.setScalar(Math.min(0.62, p.scale.x + 0.17));
    if (clear) {
      p.material = mat({ color: 0x3a444a, roughness: 0.12, transparent: true, opacity: 0.55 });
    }
  }

  /** The first cup off an aeroplane that has sat out overnight never is. */
  get sampleRunsClear() { return this.tasks.sample.count >= 1; }

  /**
   * The valve, open. The cup fills while it is held, the stream runs in the
   * colour of whatever is coming out, and `sampleHeld` remembers which side is
   * pouring so update() can close it if the crosshair wanders off.
   */
  runValve(drain, i, t) {
    this.sampleHeld = i;
    this.cup.visible = true;
    this.cup.position.set(drain.position.x, drain.position.y - 0.34, drain.position.z);
    this.sampleFluid.scale.y = clamp(t * 5, 0.2, 2.6);
    this.sampleFluid.position.y = -0.05 + this.sampleFluid.scale.y * 0.01;
    const clear = this.sampleRunsClear;
    this.sampleFluid.material = mat({
      color: clear ? 0x9ec4d8 : 0xb8b49a,
      roughness: clear ? 0.12 : 0.5,
      transparent: true,
      opacity: clear ? 0.55 : 0.95,
    });
    this.stream.visible = true;
    this.stream.position.set(drain.position.x, drain.position.y - 0.16, drain.position.z);
    this.stream.material = this.sampleFluid.material;
    this.streamT = 0.2;
  }

  /**
   * Close the valve and read the cup. Every route in here counts as a draw —
   * a tap, a release, an overflow, a wandered crosshair — because the marker
   * is standing at this drain telling the player that E does something.
   */
  drawSample(i, { spilled = false } = {}) {
    this.sampleHeld = null;
    this.streamT = 0;
    if (this.sampleDrawn[i] || this.tasks.sample.done) return;
    const clear = this.sampleRunsClear;
    this.sampleDrawn[i] = true;
    this.dumpCup(i, clear);
    this.interaction.unregister(this.aircraft.parts.drain[i]);
    if (clear) {
      this.dialogue.play('preflight.drain.clear', { once: true });
      this.audio?.play('can.set', { volume: 0.5 });
    } else {
      this.dialogue.play('preflight.drain.cloudy', { once: true });
      this.audio?.play(spilled ? 'glue.slip' : 'can.set', { volume: spilled ? 0.4 : 0.5 });
      // Lou walks over and hits the tank. It is not a repair.
      this.audio?.play('neighbours.thump', { volume: 0.5, delay: 0.8 });
    }
    this.finish('sample');
  }

  get progress() {
    const all = Object.values(this.tasks);
    return all.filter((t) => t.done).length / all.length;
  }

  get doneCount() {
    return Object.values(this.tasks).filter((t) => t.done).length;
  }

  get complete() {
    return Object.values(this.tasks).every((t) => t.done);
  }

  /** Remaining tasks, for the objective line. */
  get remaining() {
    return Object.values(this.tasks).filter((t) => !t.done).map((t) => t.label);
  }

  /** The task the guidance points at: the first unfinished one in walk order. */
  get next() {
    const name = ORDER.find((n) => !this.tasks[n].done);
    return name ? { name, ...this.tasks[name] } : null;
  }

  /** Checklist rows for the HUD: what is done, what is next, what remains. */
  get checklist() {
    const nextName = ORDER.find((n) => !this.tasks[n].done);
    return ORDER.map((name) => {
      const t = this.tasks[name];
      return {
        label: t.label,
        count: t.count,
        need: t.need,
        state: t.done ? 'done' : name === nextName ? 'next' : 'todo',
      };
    });
  }

  /**
   * The bit of aeroplane the next check lives on — for tasks with two
   * instances, the first one still untouched, so the marker hops from the
   * left cap to the right rather than hovering somewhere between them.
   */
  /**
   * The world point the highlight sits on: the part the next check lives on,
   * nudged by that check's own offset. Public because the verifier holds it
   * against the thing the crosshair has to hit.
   */
  markerAnchor(out = _markerPos) {
    const target = this.markerTarget();
    if (!target) return null;
    target.getWorldPosition(out);
    const off = MARKER_OFFSET[this.next?.name];
    if (off) out.add(_markerOff.copy(off).applyQuaternion(this.aircraft.group.quaternion));
    return out;
  }

  markerTarget() {
    const ac = this.aircraft;
    switch (this.next?.name) {
      case 'chocks': return this.chocks.find((c) => !c.userData.pulled) ?? this.chocks[0];
      case 'caps': return ac.parts.fuelCap.find((_, i) => !this.capChecked?.[i]) ?? ac.parts.fuelCap[0];
      case 'props': return ac.parts.prop.find((_, i) => !this.propChecked?.[i]) ?? ac.parts.prop[0];
      case 'sample': return ac.parts.drain.find((_, i) => !this.sampleDrawn[i]) ?? ac.parts.drain[0];
      case 'door': return ac.parts.doorHandle;
      case 'surfaces': return this.surfaceChecked?.elevator ? ac.parts.rudder : ac.parts.elevator;
      default: return null;
    }
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
          // that you did it — and left ON THE TARMAC rather than inside the
          // aeroplane's own frame, which is what used to fly them to El Hueso.
          chock.userData.pulled = true;
          this.interaction.unregister(chock);
          this.dropChock(chock, i === 0 ? -1.1 : 1.1);
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
    // A cup off each side, and the marker walks you from one drain to the
    // other exactly like it does the caps. Press E and a cup comes out; hold
    // it and you get to watch the stream fill one, which is the whole reason
    // the stream exists. The first cup is cloudy, Lou hits the tank, and the
    // second runs clear. The fuel is visible the whole way: a stream into the
    // cup while the valve is open, and a stain on the apron wherever a cup
    // gets tipped out.
    ac.parts.drain.forEach((drain, i) => {
      reg(drain, {
        label: () => 'Draw a <b>fuel sample</b>',
        holdLabel: () => 'Let go before it <b>overflows</b>',
        key: 'E',
        hold: 1.5,
        enabled: () => !this.sampleDrawn[i] && !this.tasks.sample.done,
        onLook: () => this.dialogue.play('preflight.drain', { once: true }),
        onHoldProgress: (t) => this.runValve(drain, i, t),
        // Held all the way: it overflows down your arm and onto the apron.
        // You still saw what colour it was, so it still counts.
        onUse: () => this.drawSample(i, { spilled: true }),
        onTap: () => this.drawSample(i),
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
    this.stream.visible = false;
    this.streamT = 0;
    this.sampleHeld = null;
    this.marker.visible = false;
  }

  /** Chocks vanish once the aeroplane starts moving; surfaces spring back. */
  update(dt, physics, camera = null) {
    for (const name of ['elevator', 'rudder']) {
      if (this.surfaceAnim[name] > 0) {
        this.surfaceAnim[name] = Math.max(0, this.surfaceAnim[name] - dt * 0.8);
        const swing = Math.sin(this.surfaceAnim[name] * Math.PI * 3) * 0.32 * this.surfaceAnim[name];
        if (name === 'elevator') this.aircraft.parts.elevator.rotation.x = swing;
        else this.aircraft.parts.rudder.rotation.y = swing;
      }
    }
    /* The stream stops the moment the valve is no longer being held open —
     * and whatever was in the cup when it stopped is the sample. Dragging the
     * crosshair off the drain mid-hold cancels the hold without firing a
     * release, so this timeout is what closes the valve in that case, and the
     * cup gets read rather than quietly thrown away. */
    if (this.streamT > 0) {
      this.streamT -= dt;
      if (this.streamT <= 0) {
        this.stream.visible = false;
        this.cup.visible = false;
        if (this.sampleHeld !== null) this.drawSample(this.sampleHeld);
      }
    }
    /* The guide marker breathes on whatever the checklist wants next: the ring
     * sits on the part and turns to face the camera, the diamond turns inside
     * it, and the footprint hangs below on the tarmac so there is still
     * somewhere to walk to. */
    this.markerT += dt;
    const anchor = this.armed && !this.complete ? this.markerAnchor(_markerPos) : null;
    if (anchor) {
      const ground = physics ? physics.position.y - 1.62 : anchor.y - 1;
      this.marker.visible = true;
      this.marker.position.copy(anchor);
      if (camera) this.markerRing.quaternion.copy(camera.quaternion);
      const pulse = 1 + Math.sin(this.markerT * 3.6) * 0.16;
      this.markerRing.scale.setScalar(pulse);
      this.markerRing.material.opacity = 0.55 + Math.sin(this.markerT * 3.6) * 0.28;
      this.markerGem.rotation.y += dt * 2.4;
      // The footprint only earns its place when the part is out of reach of it.
      const drop = anchor.y - (ground + 0.06);
      this.markerFoot.visible = drop > 0.7;
      /* A footprint directly below the drain tells the player to stand under
       * the wing root and aim vertically at their own feet. That makes a
       * visible marker but not a usable fuel-sample prompt. Step the marker
       * one metre outboard for the drains: from there the valve is inside the
       * normal look cone, clear of the fuselage, and still unmistakably tied
       * to the highlighted side of the aeroplane. */
      const drain = this.next?.name === 'sample' ? this.markerTarget() : null;
      const outboard = drain ? Math.sign(drain.position.x || 1) * 1.05 : 0;
      this.markerFoot.position.set(outboard, -drop, 0);
      this.markerFoot.scale.setScalar(pulse);
    } else {
      this.marker.visible = false;
    }
    /* Backstop only. The real rule lives in `stowGroundKit()`, which the
     * mission calls whenever the aeroplane is handed over to a pilot; this
     * catches an aeroplane that starts rolling while the walkaround is still
     * armed, which is a thing a player can do at any moment. */
    if (physics?.groundSpeed > 1.5) this.stowGroundKit();
    void damp;
  }

  /**
   * Take one chock out of the aeroplane and put it down on the ground.
   *
   * `scene.attach()` rather than `scene.add()`: attach preserves the object's
   * WORLD transform through the reparent, so the wedge does not jump when it
   * stops being a child of a rotated aeroplane. Then it is set flat on the
   * terrain, kicked `outboard` metres clear of the wheel, and tipped onto its
   * side, which is what a pulled chock looks like.
   *
   * @param {THREE.Object3D} chock
   * @param {number} outboard metres to kick it, in the aeroplane's own frame
   */
  dropChock(chock, outboard) {
    if (chock.userData.stowed) return false;
    const ac = this.aircraft.group;
    ac.updateWorldMatrix(true, false);
    // Where it ends up, decided in the aeroplane's frame and then frozen.
    _chockOff.set(chock.position.x + outboard, chock.position.y, chock.position.z + 0.4);
    _chockOff.applyMatrix4(ac.matrixWorld);
    this.scene.attach(chock);
    chock.position.copy(_chockOff);
    chock.position.y = terrainHeight(chock.position.x, chock.position.z);
    // Flat on the ground, tipped over, and keeping the heading it was pulled on.
    chock.rotation.set(0, ac.rotation.y, outboard < 0 ? 1.4 : -1.4);
    chock.userData.stowed = true;
    chock.visible = true;
    return true;
  }

  /**
   * Leave the ground kit on the ground.
   *
   * The chocks are BUILT as children of `aircraft.group`, which is right while
   * the aeroplane is parked: they sit correctly under the mains whatever
   * heading it was left on. It stops being right the moment it moves, and that
   * is the owner's note — *"wheel cholks come with the plane"*. Pulling one
   * only slid it 1.1 m inside the aeroplane's own frame, and both wedges then
   * flew the entire mission bolted to the airframe: measured at world y 1498.38
   * with the aeroplane at 1500 m over El Hueso.
   *
   * The old defence was one line in `update()` that hid them above walking
   * pace — and `update()` is only called during the `preflight` phase, so by
   * the time the aeroplane was rolling nothing was calling it at all.
   *
   * This is the real answer, and it is not phase-dependent: every chock still
   * attached to the aeroplane is re-parented to the scene, on the tarmac,
   * where it was. Safe to call as often as you like.
   *
   * @returns {number} how many were still aboard when it was called
   */
  stowGroundKit() {
    let moved = 0;
    for (const chock of this.chocks) {
      if (chock.userData.stowed) continue;
      this.dropChock(chock, (chock.userData.side ?? 1) * 1.1);
      moved++;
    }
    return moved;
  }

  /** True when the chocks are still under the wheels — Lou will mention it. */
  get chocksIn() {
    return !this.tasks.chocks.done;
  }

  /** True when nothing the walkaround put on the tarmac is still riding along. */
  get groundKitStowed() {
    return this.chocks.every((c) => c.userData.stowed);
  }
}

/**
 * The Enola Squatch's walkaround.
 *
 * The owner asked for this directly: "I want the scene to start with basically
 * the same precheck outside of it. We can use this to have the dialogue with
 * all the other characters that actually need to be there."
 *
 * So this is the Beef Run's `src/beefrun/preflight.js` idea — look at a part,
 * press E, Lou has an opinion — moved onto a four-engine heavy with a bomb
 * hanging out of its belly and four men standing round it. It is deliberately
 * NOT a fork of that file: the parts are different (four propellers instead of
 * two, no fuel drains within reach of a man on a shoulder-wing bomber, a bomb
 * bay and a tail gun instead of a cargo door), and the beats it fires are the
 * `preflight.*` entries that have been sitting in `dialogue/script.js` since
 * the scene was written with nowhere to play from. Almost nothing here is new
 * writing; it is existing dialogue finally given a trigger.
 *
 * Six checks, in any order, guided the same way Beef Run guides its own: `next`
 * names the first unfinished one in walk order, a pulsing marker stands on that
 * part of the aeroplane, and `checklist` feeds the HUD its done/next/todo rows.
 *
 *   chocks    x2  the wheel chocks under the mains
 *   props     x4  pull each propeller through — four engines, four checks
 *   bay       x1  the bomb-bay panel, and Numbskull's choice of bolts
 *   payload   x1  the Fat Squatch's restraint straps
 *   tail      x1  the rear gun, where the Shubenator should not be
 *   surfaces  x1  the elevator, from under the tailplane
 *
 * REACH. This aeroplane is much taller than the Brushrunner (`AC_ENOLA.gearY`
 * is 3.0 m, so the wing is four metres up) and `InteractionSystem`'s ray is
 * 2.7 m long from the eye. Every proxy below is therefore sized and dropped
 * deliberately so that a standing player can actually put the crosshair on it
 * from the tarmac — a check the player can see and cannot reach is worse than
 * no check at all, which is the lesson the Beef Run's fuel-sample beat already
 * paid for once.
 */
import * as THREE from 'three';
import { solid, boxGeo, cylGeo, mesh, group } from '../beefrun/util.js';
import { AC_ENOLA } from './config.js';

const CHOCK_COLOUR = 0x8a6a42;

/* The order a careful walkaround goes in: chocks first, up one wing and down
 * the other, then the belly, then the tail. The guidance points here; the
 * player may not. */
const ORDER = ['chocks', 'props', 'bay', 'payload', 'tail', 'surfaces'];

/* Sasole's four propeller reactions, indexed by how many blades have been
 * pulled through so far — see the "walkaround patter" block in
 * `dialogue/script.js` for why these are four separate beats and not one line
 * played four times. */
const PROP_REACTION = [
  'preflight.sasole.propOne',
  'preflight.sasole.propTwo',
  'preflight.sasole.propThree',
  'preflight.sasole.propFour',
];

const _markerPos = new THREE.Vector3();
const _markerOff = new THREE.Vector3();

/** Where the highlight belongs on each part, in aeroplane-local metres. */
const MARKER_OFFSET = {
  chocks: new THREE.Vector3(0, 0.2, 0),
  props: new THREE.Vector3(0, -1.6, 0.2),      // the low blade, not the hub
  bay: new THREE.Vector3(0, -0.1, 0),
  payload: new THREE.Vector3(0, 0.4, 0),
  tail: new THREE.Vector3(0, -0.5, 0),
  surfaces: new THREE.Vector3(0, -1.0, 0),
  /* The crew door. Not one of the six checks — it is where the marker goes
   * AFTER they are all done. See `pointAtBoarding()`. */
  board: new THREE.Vector3(0, -0.35, 0),
};

/**
 * A generous invisible box in front of a small or high part. Three.js raycasts
 * against a mesh whose material is `visible: false`, which is what makes this
 * work: the proxy is what the interaction system hits and the part is what the
 * player sees move.
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

export class EnolaPreflight {
  /**
   * @param {object} deps { scene, interaction, aircraft, payload, dialogue, crew, audio }
   */
  constructor({ scene, interaction, aircraft, payload, dialogue, crew = null, audio = null }) {
    this.scene = scene;
    this.interaction = interaction;
    this.aircraft = aircraft;
    this.payload = payload;
    this.dialogue = dialogue;
    this.crew = crew;
    this.audio = audio;

    this.tasks = {
      chocks: { done: false, label: 'Wheel chocks', count: 0, need: 2 },
      props: { done: false, label: 'Four propellers', count: 0, need: 4 },
      bay: { done: false, label: 'Bomb-bay panel', count: 0, need: 1 },
      payload: { done: false, label: 'Payload restraints', count: 0, need: 1 },
      tail: { done: false, label: 'Rear gun station', count: 0, need: 1 },
      surfaces: { done: false, label: 'Control surfaces', count: 0, need: 1 },
    };

    this.registered = [];
    this.armed = false;
    this.onProgress = null;
    this.onComplete = null;

    /* THE BOARDING BUG (owner playtest, 2026-08-04: "No way to board aircraft
     * after precheck").
     *
     * The crew door's interaction target was armed correctly and, tested from
     * a pose two metres off the door, prompted and boarded correctly — which
     * is exactly why the verifier passed it. What no test covered was the
     * thirty seconds BEFORE that pose. For all six checks the only thing
     * telling the player where to go is this marker; `update()` below hid it
     * the instant `complete` went true, which is the one moment it had
     * something new to say. The walk ends at the ELEVATOR — 12.4 m behind the
     * tail, measured in a browser — and the door is a 0.8 m panel on the far
     * (port) side of a 15.5 m fuselage under 33.5 m of wing. So the guidance
     * switched off, the objective line said "Climb aboard and take the left
     * seat" with no direction in it, and the two lines that do say where the
     * door is (`preflight.done` / `preflight.board`) have no recordings and
     * scroll past as subtitles. The player is not stranded by a broken
     * interaction; he is stranded because nothing on screen points at the one
     * part of the aeroplane he now needs.
     *
     * `boardAnchor` is that fix: the mission hands the marker the boarding hit
     * box, and the same ring/diamond/footprint that walked him round the
     * aeroplane walks him to the door and stays there until he is in it. */
    this.boardAnchor = null;

    this.propChecked = [false, false, false, false];
    this.surfaceAnim = 0;
    this.build();
  }

  /* ---------------------------------------------------------------- */

  build() {
    const ac = this.aircraft;

    /* Chocks under both main wheels, parented to the aeroplane so they sit
     * right whatever heading it was left on. `parts.gear[1]` and `[2]` are the
     * mains; `[0]` is the nose leg. */
    this.chocks = [];
    for (const [i, gear] of [[0, ac.parts.gear[1]], [1, ac.parts.gear[2]]]) {
      const g = group(`chock${i}`);
      const wedge = mesh(boxGeo(0.44, 0.3, 0.66), solid(CHOCK_COLOUR, { roughness: 1 }), 0, 0.15, 0);
      wedge.rotation.x = 0.22;
      g.add(wedge);
      const rope = mesh(cylGeo(0.025, 0.025, 0.7, 5), solid(0x8a8470, { roughness: 1 }), 0, 0.07, -0.42);
      rope.rotation.x = Math.PI / 2;
      g.add(rope);
      // The aeroplane group's origin rides at gear height, so the tarmac is
      // exactly `AC_ENOLA.gearY` below it.
      g.position.set(gear.leg.position.x, -AC_ENOLA.gearY, gear.leg.position.z + 0.9);
      hitProxy(g, 1.3, 1.9, 1.3, 0, 0.7, 0);
      ac.group.add(g);
      this.chocks.push(g);
    }

    /* Reach proxies. The propeller hub is 3.7 m off the tarmac and the blades
     * come down to about 1.4 m, so the box hangs BELOW the hub, over the blade
     * a man would actually put his hands on. */
    for (const hub of ac.parts.prop) hitProxy(hub, 1.6, 2.6, 1.2, 0, -1.5, 0.2);
    // The bomb-bay panel: the third mismatched patch, on the belly.
    hitProxy(ac.parts.patches[2], 2.0, 1.6, 2.0, 0, -0.6, 0);
    // The tail gun: a box slung under the turret, reachable from the tarmac.
    hitProxy(ac.parts.rearGunStation, 2.0, 2.6, 2.4, 0, -1.2, 0.4);
    // The elevator, from underneath the tailplane.
    hitProxy(ac.parts.elevator, 4.0, 3.0, 1.6, 0, -1.2, 0);

    /* The Fat Squatch's straps. `payload.group` is parented to the aeroplane's
     * `payloadMount`, so a proxy on it rides with the aeroplane too. */
    if (this.payload?.group) hitProxy(this.payload.group, 2.6, 2.4, 3.4, 0, 0, 0);

    /* The guide marker, built the same way Beef Run's is: a ring that lives on
     * the part and turns to face the camera, a slow diamond inside it, and a
     * dimmer footprint on the tarmac saying where to stand. Basic materials
     * with no depth test — it is HUD paint that happens to be in the world, and
     * on an aeroplane this size half the parts are behind two hundred kilos of
     * aluminium from where the player is standing. */
    const paint = (opacity) => new THREE.MeshBasicMaterial({
      color: 0xe8c86a,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.marker = group('enola-preflight-marker');
    this.markerRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.032, 8, 28), paint(0.85));
    this.markerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), paint(0.9));
    this.markerFoot = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 8, 28), paint(0.4));
    this.markerFoot.rotation.x = -Math.PI / 2;
    for (const piece of [this.markerFoot, this.markerRing, this.markerGem]) {
      piece.renderOrder = 6;
      this.marker.add(piece);
    }
    this.marker.visible = false;
    this.markerT = 0;
    this.scene.add(this.marker);
  }

  /* ---------------------------------------------------------------- */

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

  /** True while the chocks are still under the wheels — Sasole will mention it. */
  get chocksIn() {
    return !this.tasks.chocks.done;
  }

  /**
   * Point the guidance marker at the crew door once the walk is done.
   *
   * Called by `MissionController.armBoardingTarget()` with the same hit box
   * the interaction system is registered against, so the thing that pulses is
   * by construction the thing the crosshair has to find — they cannot drift
   * apart the way a hand-placed second marker would.
   *
   * @param {?THREE.Object3D} object the boarding hit box, or null to clear
   */
  pointAtBoarding(object = null) {
    this.boardAnchor = object;
  }

  /** True while the marker is standing on the crew door rather than a check. */
  get guidingToDoor() {
    return !!this.boardAnchor && this.complete;
  }

  markerTarget() {
    const ac = this.aircraft;
    if (this.guidingToDoor) return this.boardAnchor;
    switch (this.next?.name) {
      case 'chocks': return this.chocks.find((c) => !c.userData.pulled) ?? this.chocks[0];
      case 'props': return ac.parts.prop.find((_, i) => !this.propChecked[i]) ?? ac.parts.prop[0];
      case 'bay': return ac.parts.patches[2];
      case 'payload': return this.payload?.group ?? ac.parts.patches[2];
      case 'tail': return ac.parts.rearGunStation;
      case 'surfaces': return ac.parts.elevator;
      default: return null;
    }
  }

  /**
   * The world point the highlight sits on. Public because the verifier holds
   * it against the thing the crosshair actually has to hit.
   */
  markerAnchor(out = _markerPos) {
    const target = this.markerTarget();
    if (!target) return null;
    target.getWorldPosition(out);
    const off = MARKER_OFFSET[this.guidingToDoor ? 'board' : this.next?.name];
    if (off) out.add(_markerOff.copy(off).applyQuaternion(this.aircraft.group.quaternion));
    return out;
  }

  finish(name) {
    const task = this.tasks[name];
    if (!task || task.done) return;
    task.count++;
    if (task.count >= task.need) {
      task.done = true;
      this.audio?.play?.('ui.select', { volume: 0.5 });
    }
    this.onProgress?.(name, task);
    if (this.complete) this.onComplete?.();
  }

  /* ---------------------------------------------------------------- */

  arm() {
    if (this.armed) return;
    this.armed = true;
    const ac = this.aircraft;
    const reg = (meshObj, desc) => {
      this.interaction.register(meshObj, desc);
      this.registered.push(meshObj);
    };

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
          chock.userData.pulled = true;
          chock.position.x += i === 0 ? -1.4 : 1.4;
          chock.position.z += 0.5;
          chock.rotation.z = i === 0 ? 1.4 : -1.4;
          this.interaction.unregister(chock);
          this.audio?.play?.('frame.adjust', { volume: 0.6 });
          /* Sasole's reaction half — see the "walkaround patter" block in
           * `dialogue/script.js`. Fired from `onUse` rather than a timer so it
           * can only ever play at a part the player has actually touched, and
           * queued BEFORE `finish()` so it cannot land behind `preflight.done`
           * on a player who leaves the chocks until last. */
          if (this.tasks.chocks.count + 1 >= this.tasks.chocks.need) {
            this.dialogue.play('preflight.sasole.chocksDone', { once: true });
          }
          this.finish('chocks');
        },
      });
    });

    // ---- 2. Four propellers ----
    ac.parts.prop.forEach((hub, i) => {
      reg(hub, {
        label: () => `Pull <b>number ${i + 1}</b> through`,
        key: 'E',
        enabled: () => !this.propChecked[i],
        onLook: () => this.dialogue.play('preflight.props', { once: true }),
        onUse: () => {
          this.propChecked[i] = true;
          // Turn it through a third so it is obvious it moved.
          hub.rotation.z += (Math.PI * 2) / 3;
          this.audio?.play?.('frame.adjust', { volume: 0.4 });
          this.interaction.unregister(hub);
          /* One line per blade pulled, in the order they are pulled — NOT one
           * line per engine number, because the player may start at number
           * four. `PROP_REACTION` is indexed by how many are done, and queued
           * before `finish()` for the same reason the chock reaction is. */
          const said = PROP_REACTION[this.tasks.props.count];
          if (said) this.dialogue.play(said, { once: true });
          if (this.tasks.props.count + 1 === 4) this.dialogue.play('preflight.props.all', { once: true });
          this.finish('props');
        },
      });
    });

    // ---- 3. The bomb-bay panel ----
    reg(ac.parts.patches[2], {
      label: () => 'Check the <b>bomb-bay panel</b>',
      key: 'E',
      hold: 0.8,
      enabled: () => !this.tasks.bay.done,
      onLook: () => this.dialogue.play('preflight.numbskull', { once: true }),
      onUse: () => {
        this.dialogue.play('preflight.bombbay', { once: true });
        this.dialogue.play('preflight.sasole.bayDone', { once: true });
        this.audio?.play?.('switch.click', { volume: 0.7 });
        this.interaction.unregister(ac.parts.patches[2]);
        this.finish('bay');
      },
      onTap: () => this.dialogue.play('preflight.bombbay.tap', { once: true }),
    });

    // ---- 4. Payload restraints ----
    if (this.payload?.group) {
      reg(this.payload.group, {
        label: () => 'Check the <b>restraint straps</b>',
        key: 'E',
        hold: 1.0,
        enabled: () => !this.tasks.payload.done,
        onLook: () => this.dialogue.play('preflight.payload.look', { once: true }),
        onUse: () => {
          this.dialogue.play('preflight.restraints', { once: true });
          this.dialogue.play('preflight.sasole.payloadDone', { once: true });
          this.audio?.play?.('can.set', { volume: 0.5 });
          this.interaction.unregister(this.payload.group);
          this.finish('payload');
        },
        onTap: () => this.dialogue.play('preflight.payload.tap', { once: true }),
      });
    }

    // ---- 5. The rear gun, and the man already in it ----
    reg(ac.parts.rearGunStation, {
      label: () => 'Check the <b>rear gun</b>',
      key: 'E',
      enabled: () => !this.tasks.tail.done,
      onUse: () => {
        this.dialogue.play('preflight.shubes.first', { once: true });
        this.dialogue.play('preflight.sasole.tailDone', { once: true });
        this.crew?.speak?.('SHUBES', 2.0);
        this.audio?.play?.('gun.dry', { volume: 0.5 });
        this.interaction.unregister(ac.parts.rearGunStation);
        this.finish('tail');
      },
    });

    // ---- 6. Control surfaces ----
    reg(ac.parts.elevator, {
      label: () => 'Move the <b>elevator</b>',
      key: 'E',
      enabled: () => !this.tasks.surfaces.done,
      onLook: () => this.dialogue.play('preflight.surfaces', { once: true }),
      onUse: () => {
        this.surfaceAnim = 1;
        this.audio?.play?.('frame.adjust', { volume: 0.5 });
        this.interaction.unregister(ac.parts.elevator);
        // Before `finish()`, not after: `finish()` is what fires `onComplete`,
        // and "That is the walk" has to queue behind the reaction to the check
        // that finished it, not in front of it.
        this.dialogue.play('preflight.sasole.surfacesDone', { once: true });
        this.finish('surfaces');
      },
    });
  }

  disarm() {
    for (const m of this.registered) this.interaction.unregister(m);
    this.registered.length = 0;
    this.armed = false;
    this.boardAnchor = null;
    this.marker.visible = false;
  }

  /** Chocks vanish once the aeroplane starts moving; the elevator springs back. */
  update(dt, physics, camera = null) {
    if (this.surfaceAnim > 0) {
      this.surfaceAnim = Math.max(0, this.surfaceAnim - dt * 0.8);
      const swing = Math.sin(this.surfaceAnim * Math.PI * 3) * 0.32 * this.surfaceAnim;
      this.aircraft.parts.elevator.rotation.x = swing;
    }

    this.markerT += dt;
    /* `|| this.guidingToDoor` is the boarding fix: the marker used to die on
     * `complete` and leave the player looking for a door he has never been
     * shown. See the `boardAnchor` note in the constructor. */
    const guiding = this.armed && (!this.complete || this.guidingToDoor);
    const anchor = guiding ? this.markerAnchor(_markerPos) : null;
    if (anchor) {
      const ground = physics ? physics.position.y - AC_ENOLA.gearY : anchor.y - 1;
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
      this.markerFoot.position.set(0, -drop, 0);
      this.markerFoot.scale.setScalar(pulse);
    } else {
      this.marker.visible = false;
    }

    if (physics?.groundSpeed > 1.5) {
      for (const c of this.chocks) c.visible = false;
    }
  }
}

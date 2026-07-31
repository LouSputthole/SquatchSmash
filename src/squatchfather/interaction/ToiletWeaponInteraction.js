import * as THREE from 'three';
import * as Foley from '../audio/Foley.js';
import { weaponCheck } from '../audio/GunshotAudio.js';
import { POS } from '../scenes/SquatchfatherScene.js';
import { makeRevolver } from '../../world/props.js';

// Behind the upper rear of the tank, in the gap between porcelain and tile.
//
// The hold is deliberately not instant: for the first second his hand finds
// nothing but cold pipe, his breathing comes up, and the player has to keep
// holding. Then the cloth, the weight, the check, and back under the jacket.

const RETRIEVE = 5.4; // seconds of scripted business after the hold completes

export class ToiletWeaponInteraction {
  constructor({ prospect, director, scene, camera, dialogue, onRetrieved }) {
    this.prospect = prospect;
    this.director = director;
    this.scene = scene;
    this.camera = camera;
    this.dialogue = dialogue;
    this.onRetrieved = onRetrieved;

    this.wrongSearches = 0;
    this.breathT = 0;
    this.lastStage = -1;
    this.retrieving = false;
    this.t = 0;
    this.steps = [];
    this.found = false;

    // The bundle, held in view once it comes out of the gap. The revolver is
    // already half out of the cloth, so the beat reads as a GUN from the
    // first moment it is in his hand — not grey blocks assembling into one.
    this.bundle = new THREE.Group();
    const clothMat = new THREE.MeshLambertMaterial({ color: 0x6d6558 });
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.13), clothMat);
    cloth.position.set(0, -0.015, 0.04);
    this.bundle.add(cloth);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0x585044 }));
    knot.position.set(0.05, 0.02, 0.08);
    this.bundle.add(knot);
    const emerging = makeRevolver(null, { x: 0, y: 0, z: 0 });
    emerging.group.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: o.material.color.clone() });
    });
    emerging.group.name = 'bundle.revolver';
    emerging.group.scale.setScalar(1.2);
    emerging.group.position.set(0, 0.035, -0.02);
    emerging.group.rotation.set(-0.15, 0.35, 0.1);
    this.bundle.add(emerging.group);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.11), new THREE.MeshLambertMaterial({ color: 0x9aa0ab }));
    hand.position.set(0.01, -0.07, 0.13);
    this.bundle.add(hand);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.15), new THREE.MeshLambertMaterial({ color: 0x191a22 }));
    cuff.position.set(0.01, -0.11, 0.25);
    this.bundle.add(cuff);
    this.bundle.position.set(0.13, -0.19, -0.4);
    this.bundle.visible = false;
    camera.add(this.bundle);
  }

  // ---- Wrong places (under the sink, the radiator, the cabinet) ----
  wrongSearch(id) {
    Foley.searchRustle();
    this.wrongSearches++;
    if (this.wrongSearches === 2) {
      this.dialogue.say('wrongSearch');
      // The correct volume gets a little easier to land on, as promised
      return { easeUp: true };
    }
    return { easeUp: false };
  }

  // ---- Holding on the right spot ----
  holdProgress(p, dt) {
    const stage = p < 0.42 ? 0 : p < 0.75 ? 1 : 2;
    if (stage !== this.lastStage) {
      this.lastStage = stage;
      if (stage === 0) Foley.searchRustle();
      if (stage === 1) Foley.pipeKnock();          // nothing but pipe
      if (stage === 2) Foley.cloth();              // fingertips on cloth
    }
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = 0.75 - p * 0.3;
      Foley.breath(0.5 + p);
      if (p > 0.5) Foley.heartbeat(0.35 + p * 0.5);
    }
  }

  holdCancelled() {
    this.lastStage = -1;
  }

  // ---- He has it ----
  retrieve() {
    if (this.found) return;
    this.found = true;
    this.retrieving = true;
    this.t = 0;
    this.prospect.canMove = false;

    const wrapped = this.scene.props.wrapped;
    const gap = new THREE.Vector3(POS.toiletSearch.x, POS.toiletSearch.y + 0.05, POS.toiletSearch.z - 0.35);

    // The revolver reads early: the wrapped shape is on screen for barely
    // half a second before the gun is visibly out of the cloth, and the full
    // revolver is turning in his hands inside a second and a half.
    this.stepIndex = 0;
    this.steps = [
      [0.0, () => { wrapped.visible = true; this.director.steerTo(gap, 0.6); Foley.cloth(); }],
      [0.55, () => { wrapped.visible = false; this.bundle.visible = true; Foley.cloth(); }],
      [1.3, () => { this.bundle.visible = false; this.prospect.weapon.visible = true; this.inspect = true; Foley.cloth(); }],
      [2.2, () => { weaponCheck(); }],
      [3.4, () => {
        this.inspect = false;
        this.prospect.weapon.visible = false;
        this.prospect.takeWeapon();
        Foley.cloth();
      }],
      [3.9, () => { this.director.steerTo(new THREE.Vector3(POS.mirror.x, POS.mirror.y, POS.mirror.z), 0.9); }],
      [RETRIEVE, () => {
        this.retrieving = false;
        this.prospect.canMove = true;
        this.director.clearSteer();
        if (this.onRetrieved) this.onRetrieved();
      }],
    ];
    this.#pump(); // anything scheduled at t=0 runs the moment he finds it
  }

  // Steps are in order, so walk the cursor forward over everything now due.
  #pump() {
    while (this.stepIndex < this.steps.length && this.steps[this.stepIndex][0] <= this.t) {
      this.steps[this.stepIndex][1]();
      this.stepIndex++;
    }
  }

  update(dt) {
    if (!this.retrieving) return;
    this.t += dt;
    this.#pump();
    // Turning it over in his hands
    if (this.inspect) {
      const w = this.prospect.weapon;
      w.position.set(0.06, -0.13, -0.34);
      w.rotation.set(0.1, 0.9 + Math.sin(this.t * 2.2) * 0.35, -0.25);
    }
  }

  reset() {
    this.retrieving = false;
    this.found = false;
    this.inspect = false;
    this.stepIndex = 0;
    this.bundle.visible = false;
    this.wrongSearches = 0;
    this.lastStage = -1;
  }
}

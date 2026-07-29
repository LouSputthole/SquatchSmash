import * as THREE from 'three';
import { Figure } from './Figure.js';
import { POS } from '../scenes/SquatchfatherScene.js';

// Sal "The Prospector" Sorrento — already seated when Prospect walks in.
// Talks with his hands, drinks, leans in when he wants something.

export class SalController {
  constructor(scene) {
    this.fig = new Figure({
      coat: 0x2b2a34,
      shirt: 0xd8cfc0,
      tie: 0x6d1c22,
      skin: 0xd0a279,
      hair: 0x4a4038,
      bulk: 1.08,
    });
    this.fig.setPose('sit');
    this.fig.place(POS.salSeat.x, POS.salSeat.z, 0); // faces -Z, across the table
    scene.add(this.fig.group);
    this.watchT = 0;
    this.dead = false;
  }

  get group() { return this.fig.group; }

  // World point roughly at his eyes — the camera looks here during dialogue.
  get eyePoint() {
    return new THREE.Vector3(POS.salSeat.x, 1.36, POS.salSeat.z - 0.02);
  }

  speak(dur) { this.fig.speak(dur); }
  gesture(name, dur) { this.fig.playGesture(name, dur); }
  lean(on) { this.fig.leanForward(on); }
  lookAt(p) { this.fig.lookAt(p); }

  // Watches Prospect walk back from the hallway.
  watch(target) {
    this.fig.lookAt(target);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.fig.hit();
    this.fig.leanTarget = 0;
    setTimeout(() => { this.fig.down = true; }, 220);
  }

  // Checkpoint restart: he is sitting there again, mid-sentence.
  revive() {
    this.dead = false;
    const f = this.fig;
    f.down = false;
    f.deathT = 0;
    f.hitT = 0;
    f.talkT = 0;
    f.lean = 0;
    f.leanTarget = 0;
    f.torso.rotation.set(0, 0, 0);
    f.torso.position.set(0, 0.04, 0);
    f.neck.rotation.set(0, 0, 0);
    f.root.position.set(0, 0, 0);
    f.root.rotation.set(0, 0, 0);
    f.setPose('sit');
    this.fig.place(POS.salSeat.x, POS.salSeat.z, 0);
  }

  update(dt) {
    this.fig.update(dt);
    if (this.fig.down) {
      // Collapses forward against the table and stays there.
      const k = Math.min(1, this.fig.deathT * 2.6);
      const e = k * k * (3 - 2 * k);
      this.fig.torso.rotation.x = 1.18 * e;
      this.fig.torso.position.z = -0.26 * e;
      this.fig.neck.rotation.x = 0.42 * e;
      this.fig.neck.rotation.y *= 1 - e;
      this.fig.armL.shoulder.rotation.x = 0.35 + 0.75 * e;
      this.fig.armR.shoulder.rotation.x = 0.35 + 0.9 * e;
      this.fig.armL.elbow.rotation.x = -1.25 + 1.05 * e;
      this.fig.armR.elbow.rotation.x = -1.25 + 1.15 * e;
      this.fig.root.position.z = -0.12 * e;
    }
  }
}

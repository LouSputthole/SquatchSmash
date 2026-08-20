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
      // The composed boss: barbered dark hair going silver at the temples,
      // brows arched just enough to look interested, brown eyes.
      hairStyle: 'short',
      temples: 0xb8b2a8,
      browTilt: 0.11,
      iris: 0x3a2a18,
      // The made man, dressed like one: his own charcoal-plum cloth with the
      // chalk stripe lifted out of it, and gold kept to the two places a man
      // who is not showing off wears it — the bar on the tie and the buckle.
      trim: true,
      pinstripe: true,
      pocketSquare: 0xb8a05a,
      tieBar: 0xc9a94a,
      belt: 0x1c1a18,
      buckle: 0xb9993f,
    });
    this.fig.setPose('sit');
    // Faces -Z, across the table at Prospect's seat. The figure's face is on
    // local +Z, so that is a yaw of pi, not zero.
    this.fig.place(POS.salSeat.x, POS.salSeat.z, Math.PI);
    scene.add(this.fig.group);
    this.watchT = 0;
    this.dead = false;
  }

  get group() { return this.fig.group; }

  // World point roughly at his eyes — the camera looks here during dialogue.
  get eyePoint() {
    return new THREE.Vector3(POS.salSeat.x, 1.47, POS.salSeat.z - 0.02);
  }

  speak(dur, take = null) { this.fig.speak(dur, take); }
  hush() { this.fig.hush(); }
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
    setTimeout(() => { this.fig.setDown(true); }, 220);
  }

  // Checkpoint restart: he is sitting there again, mid-sentence.
  revive() {
    this.dead = false;
    const f = this.fig;
    f.setDown(false);
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
    this.fig.place(POS.salSeat.x, POS.salSeat.z, Math.PI);
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
      this.fig.root.position.z = 0.12 * e; // slides toward the table (+Z, his face side)
    }
  }
}

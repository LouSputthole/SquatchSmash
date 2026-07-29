import * as THREE from 'three';
import { Figure } from './Figure.js';
import { POS } from '../scenes/SquatchfatherScene.js';

// Captain McClawsky — opens the door, walks the guest in, sits, eats, and is
// dismissive throughout. Reaches inside his coat exactly once.

const DOOR_POST = new THREE.Vector3(1.1, 0, 1.0);

export class McClawskyController {
  constructor(scene) {
    this.fig = new Figure({
      coat: 0x2a3038,
      shirt: 0xdfe2e4,
      tie: 0x1c2430,
      skin: 0xd8a888,
      hair: 0x5a4a3a,
      bulk: 1.24,
      height: 1.04,
    });
    this.fig.place(DOOR_POST.x, DOOR_POST.z, Math.PI); // facing the door
    scene.add(this.fig.group);
    this.mode = 'door';       // door → escort → seated
    this.escortStage = 0;
    this.dead = false;
    this.drawT = -1;          // >=0 once he starts reaching
    this.drawn = false;
    this.onDrawComplete = null;

    // The revolver stays in the coat unless things go badly.
    this.gun = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
    const grip = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), steel);
    barrel.position.set(0, 0, -0.1);
    this.gun.add(barrel);
    this.gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.1), steel));
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
    stock.position.set(0, -0.11, 0.05);
    stock.rotation.x = -0.28;
    this.gun.add(stock);
    this.gun.visible = false;
    this.fig.armR.elbow.add(this.gun);
    this.gun.position.set(0, -0.36, 0.06);
  }

  get group() { return this.fig.group; }

  get eyePoint() {
    return new THREE.Vector3(POS.mcSeat.x - 0.04, 1.5, POS.mcSeat.z);
  }

  speak(dur) { this.fig.speak(dur); }
  gesture(name, dur) { this.fig.playGesture(name, dur); }
  lookAt(p) { this.fig.lookAt(p); }

  // Called when the player reaches the entrance.
  openDoor() {
    this.fig.playGesture('open', 1.4);
  }

  // Walk to the table and take the seat on Prospect's right.
  escortIn() {
    if (this.mode !== 'door') return;
    this.mode = 'escort';
  }

  // Idle business so he isn't a statue during the conversation.
  ambientBusiness() {
    if (this.mode !== 'seated' || this.dead) return;
    const r = Math.random();
    this.fig.playGesture(r < 0.5 ? 'eat' : 'drink', 1.6 + Math.random());
  }

  // Starts reaching inside the coat. If the player doesn't fire in time,
  // onDrawComplete fires and the scene cuts to black.
  startDraw(window = 1.6, onComplete = null) {
    if (this.dead || this.drawT >= 0) return;
    this.drawT = 0;
    this.drawWindow = window;
    this.onDrawComplete = onComplete;
    this.fig.playGesture('reach', window + 0.6);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.drawT = -1;
    this.onDrawComplete = null;
    this.fig.hit();
    setTimeout(() => { this.fig.down = true; }, 220);
  }

  // Checkpoint restart: back in his chair, hand nowhere near the coat.
  revive() {
    this.dead = false;
    this.drawT = -1;
    this.drawn = false;
    this.onDrawComplete = null;
    this.gun.visible = false;
    this.mode = 'seated';
    const f = this.fig;
    f.down = false;
    f.deathT = 0;
    f.hitT = 0;
    f.talkT = 0;
    f.lean = 0;
    f.leanTarget = 0;
    f.gestureT = 0;
    f.torso.rotation.set(0, 0, 0);
    f.torso.position.set(0, 0.04, 0);
    f.neck.rotation.set(0, 0, 0);
    f.root.position.set(0, 0, 0);
    f.root.rotation.set(0, 0, 0);
    f.setPose('sit');
    f.place(POS.mcSeat.x, POS.mcSeat.z, Math.PI / 2);
  }

  update(dt, prospectPos) {
    if (this.mode === 'escort') {
      // Two legs, latched — walk out past the table, then back into the chair
      if (this.escortStage === 0) {
        if (this.fig.walkTo(POS.mcSeat.x + 0.9, POS.mcSeat.z - 0.2, dt, 1.7)) this.escortStage = 1;
      } else if (this.fig.walkTo(POS.mcSeat.x, POS.mcSeat.z, dt, 1.2, false)) {
        this.fig.setPose('sit');
        this.fig.group.rotation.y = Math.PI / 2; // faces -X, at Prospect's right
        this.mode = 'seated';
      }
    } else if (this.mode === 'door' && prospectPos) {
      this.fig.lookAt(prospectPos);
    }

    if (this.drawT >= 0 && !this.dead) {
      this.drawT += dt;
      if (this.drawT > this.drawWindow * 0.55) this.gun.visible = true;
      if (this.drawT >= this.drawWindow && !this.drawn) {
        this.drawn = true;
        const cb = this.onDrawComplete;
        this.onDrawComplete = null;
        if (cb) cb();
      }
    }

    this.fig.update(dt);

    if (this.fig.down) {
      // Goes over backwards, taking the chair with him.
      const k = Math.min(1, this.fig.deathT * 2.2);
      const e = k * k * (3 - 2 * k);
      this.fig.root.rotation.x = 1.42 * e;
      this.fig.root.position.z = 0.42 * e;
      this.fig.root.position.y = -0.34 * e;
      this.fig.torso.rotation.x = -0.2 * e;
      this.fig.neck.rotation.x = -0.25 * e;
      this.fig.armL.shoulder.rotation.x = 0.35 - 0.9 * e;
      this.fig.armR.shoulder.rotation.x = 0.35 - 0.7 * e;
      this.fig.armL.elbow.rotation.x = -1.25 + 1.0 * e;
      this.fig.armR.elbow.rotation.x = -1.25 + 0.9 * e;
      this.gun.visible = false;
    }
  }
}

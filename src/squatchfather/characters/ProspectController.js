import * as THREE from 'three';
import { Figure } from './Figure.js';
import { PLAYER_START_YAW, POS } from '../scenes/SquatchfatherScene.js';
import { makeRevolver } from '../../world/props.js';

// Prospect — the quiet one. Played first-person, so this owns movement,
// collision, the eye position the camera rides on, the concealed handgun
// view-model, and a full body that only the bathroom mirror can see.

const RADIUS = 0.32;
const EYE_STAND = 1.76;   // level with the head of his own body in the mirror
const EYE_SEATED = 1.44;  // seated at a 0.78 table

export const SPEED = {
  normal: 2.7,
  measured: 1.85,   // the walk back from the bathroom
  controlled: 2.1,  // walking out, no running allowed
};

export class ProspectController {
  constructor(scene, camera, colliders) {
    this.scene = scene;
    this.camera = camera;
    this.colliders = colliders;

    this.pos = POS.playerStart.clone();
    this.yaw = PLAYER_START_YAW; // looking along the sidewalk toward the door
    this.pitch = -0.03;
    this.vel = new THREE.Vector3();
    this.eyeHeight = EYE_STAND;
    this.bob = 0;
    this.bobPhase = 0;
    this.speed = SPEED.normal;
    this.canMove = false;
    this.canLook = true;
    this.seated = false;
    this.stepCb = null;
    this.lastStep = 0;

    // Scripted movement (used when the scene walks him somewhere itself)
    this.autoTarget = null;
    this.autoDone = null;

    // ---- Body, for the mirror only (layer 1; the main camera never sees it)
    this.fig = new Figure({
      coat: 0x191a22,
      shirt: 0xdcd8cc,
      tie: 0x6a45c0,     // subtle purple
      skin: 0x9aa0ab,    // silver fur
      hair: 0x7e848f,
      bulk: 1.16,
      height: 1.02,
      fur: true,
      iris: 0x4a3418,    // amber, for the mirror moment
      browTilt: 0.06,
    });
    this.fig.group.traverse((o) => o.layers.set(1));
    scene.add(this.fig.group);

    // ---- Concealed revolver view-model
    // Lou's package IS the flat's coffee-table revolver, so the view-model is
    // the canonical prop, re-materialed for this scene's Lambert lighting —
    // its PBR metals render near-black here with no environment map.
    this.weapon = new THREE.Group();
    const revolver = makeRevolver(null, { x: 0, y: 0, z: 0 });
    revolver.group.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: o.material.color.clone() });
    });
    revolver.group.scale.setScalar(1.35);
    revolver.group.position.set(0, -0.02, -0.02);
    this.weapon.add(revolver.group);
    // A hand on the raked grip, so it isn't floating in front of his face
    const fur = new THREE.MeshLambertMaterial({ color: 0x9aa0ab });
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.11), fur);
    hand.position.set(0, -0.055, 0.09);
    hand.rotation.x = -0.42;
    this.weapon.add(hand);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.16), new THREE.MeshLambertMaterial({ color: 0x191a22 }));
    cuff.position.set(0.005, -0.13, 0.2);
    cuff.rotation.x = -0.3;
    this.weapon.add(cuff);
    this.weapon.visible = false;
    camera.add(this.weapon);

    this.hasWeapon = false;
    this.weaponOut = false;
    this.weaponDropped = false;
    this.drawT = 0;
    this.recoil = 0;

    this.WEAPON_REST = new THREE.Vector3(0.19, -0.2, -0.42);
    this.WEAPON_HIDDEN = new THREE.Vector3(0.24, -0.55, -0.3);
    this.weapon.position.copy(this.WEAPON_HIDDEN);
  }

  // ---------- Queries ----------

  get eye() {
    return new THREE.Vector3(this.pos.x, this.eyeHeight + this.bob, this.pos.z);
  }

  distanceTo(v) {
    return Math.hypot(this.pos.x - v.x, this.pos.z - v.z);
  }

  // ---------- Collision ----------

  blocked(x, z) {
    for (const c of this.colliders) {
      if (!c.on) continue;
      if (x > c.x0 - RADIUS && x < c.x1 + RADIUS && z > c.z0 - RADIUS && z < c.z1 + RADIUS) return true;
    }
    return false;
  }

  // ---------- Scripted movement ----------

  walkTo(target, onArrive = null) {
    this.autoTarget = target.clone();
    this.autoDone = onArrive;
  }

  teleport(v, yaw = null) {
    this.pos.set(v.x, 0, v.z);
    if (yaw !== null) this.yaw = yaw;
  }

  sit() {
    this.seated = true;
    this.canMove = false;
    this.pos.set(POS.prospectSeat.x, 0, POS.prospectSeat.z + 0.16);
    this.yaw = Math.PI;
    this.eyeHeight = EYE_SEATED;
    this.fig.setPose('sit');
    // Camera yaw pi looks along +Z at Sal; the figure's face is on local +Z,
    // so the body that matches it sits at yaw 0.
    this.fig.place(POS.prospectSeat.x, POS.prospectSeat.z, 0);
  }

  stand() {
    this.seated = false;
    this.eyeHeight = EYE_STAND;
    this.fig.setPose('stand');
    this.pos.set(POS.prospectSeat.x + 0.5, 0, POS.prospectSeat.z - 0.3);
  }

  // ---------- Weapon ----------

  takeWeapon() {
    this.hasWeapon = true;
    this.weapon.visible = false;
    this.weaponOut = false;
  }

  drawWeapon() {
    if (!this.hasWeapon || this.weaponOut) return;
    this.weaponOut = true;
    this.drawT = 0;
    this.weapon.visible = true;
    this.weapon.position.copy(this.WEAPON_HIDDEN);
  }

  fireKick() {
    this.recoil = 1;
  }

  // Lets go of it beside the table. Returns the world mesh that hits the floor.
  dropWeapon() {
    if (!this.weaponOut || this.weaponDropped) return null;
    this.weaponDropped = true;
    this.weaponOut = false;
    this.weapon.visible = false;
    const world = this.weapon.clone();
    world.visible = true;
    world.scale.setScalar(1);
    world.position.set(this.pos.x + 0.35, 0.9, this.pos.z + 0.2);
    world.rotation.set(-Math.PI / 2, 0, Math.random() * 0.8 - 0.4);
    this.scene.add(world);
    this.droppedMesh = world;
    this.dropVel = 0;
    return world;
  }

  // ---------- Frame ----------

  update(dt, input) {
    // Scripted walk overrides player input entirely
    if (this.autoTarget) {
      const dx = this.autoTarget.x - this.pos.x;
      const dz = this.autoTarget.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12 || d <= this.speed * 0.8 * dt) {
        this.pos.x = this.autoTarget.x;
        this.pos.z = this.autoTarget.z;
        this.autoTarget = null;
        const cb = this.autoDone;
        this.autoDone = null;
        if (cb) cb();
      } else {
        const step = Math.min(d, this.speed * 0.8 * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.bobPhase += step * 3.1;
      }
    } else if (this.canMove && !this.seated) {
      let fx = 0;
      let fz = 0;
      if (input.forward) fz -= 1;
      if (input.back) fz += 1;
      if (input.left) fx -= 1;
      if (input.right) fx += 1;
      const mag = Math.hypot(fx, fz);
      let wantX = 0;
      let wantZ = 0;
      if (mag > 0) {
        fx /= mag; fz /= mag;
        const s = Math.sin(this.yaw);
        const c = Math.cos(this.yaw);
        // Camera-relative: local -Z is the view direction
        // (-sin yaw, -cos yaw). Keep W aligned with what the player sees.
        wantX = (fx * c + fz * s) * this.speed;
        wantZ = (-fx * s + fz * c) * this.speed;
      }
      const k = Math.min(1, dt * 11);
      this.vel.x += (wantX - this.vel.x) * k;
      this.vel.z += (wantZ - this.vel.z) * k;

      const nx = this.pos.x + this.vel.x * dt;
      const nz = this.pos.z + this.vel.z * dt;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx; else this.vel.x = 0;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz; else this.vel.z = 0;

      const moved = Math.hypot(this.vel.x, this.vel.z);
      this.bobPhase += moved * dt * 3.2;
    } else {
      this.vel.set(0, 0, 0);
    }

    // Head bob + footsteps
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.4 || this.autoTarget;
    const targetBob = moving ? Math.sin(this.bobPhase * 2) * 0.028 : 0;
    this.bob += (targetBob - this.bob) * Math.min(1, dt * 9);
    if (moving && this.stepCb) {
      const phase = Math.floor(this.bobPhase * 2 / Math.PI);
      if (phase !== this.lastStep) {
        this.lastStep = phase;
        this.stepCb();
      }
    }

    // Mirror body follows him. Camera forward is -Z but the figure's face is
    // +Z, so the body that looks where he looks sits at yaw + pi.
    if (!this.seated) {
      this.fig.group.position.set(this.pos.x, 0, this.pos.z);
      this.fig.group.rotation.y = this.yaw + Math.PI;
      this.fig.walkAmt += ((moving ? 1 : 0) - this.fig.walkAmt) * Math.min(1, dt * 8);
      this.fig.walkT += dt * (moving ? this.speed * 3.2 : 0);
    }
    this.fig.update(dt);

    // Weapon view-model
    if (this.weaponOut) {
      this.drawT = Math.min(1, this.drawT + dt * 3.6);
      const e = this.drawT * this.drawT * (3 - 2 * this.drawT);
      this.weapon.position.lerpVectors(this.WEAPON_HIDDEN, this.WEAPON_REST, e);
      this.weapon.rotation.set(-0.12 * (1 - e) + this.recoil * 0.28, 0.05, -0.9 * (1 - e));
      this.weapon.position.z += this.recoil * 0.07;
      this.weapon.position.y += this.recoil * 0.02;
    }
    this.recoil = Math.max(0, this.recoil - dt * 5.5);

    // The dropped gun settles on the floor
    if (this.droppedMesh && this.droppedMesh.position.y > 0.06) {
      this.dropVel -= 9.8 * dt;
      this.droppedMesh.position.y = Math.max(0.06, this.droppedMesh.position.y + this.dropVel * dt);
      this.droppedMesh.rotation.z += dt * 3;
      if (this.droppedMesh.position.y <= 0.06 && this.onWeaponLanded) {
        const cb = this.onWeaponLanded;
        this.onWeaponLanded = null;
        cb();
      }
    }
  }

  // Mouse look, with optional clamping supplied by the seated controller.
  look(dx, dy, clamp = null) {
    if (!this.canLook) return;
    this.yaw -= dx;
    this.pitch = Math.max(-1.2, Math.min(1.1, this.pitch - dy));
    if (clamp) {
      const { yawCenter, yawRange, pitchMin, pitchMax } = clamp;
      let d = ((this.yaw - yawCenter + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      d = Math.max(-yawRange, Math.min(yawRange, d));
      this.yaw = yawCenter + d;
      this.pitch = Math.max(pitchMin, Math.min(pitchMax, this.pitch));
    }
  }
}

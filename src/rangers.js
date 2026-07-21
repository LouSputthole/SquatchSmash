import * as THREE from 'three';
import { BOUNDS, lambert } from './world.js';

const UNIFORM = 0xb8a86a;
const PANTS = 0x3f5a3a;
const SKIN = 0xe8b88a;
const HAT = 0x6b5a35;

const bodyGeo = new THREE.BoxGeometry(0.6, 0.65, 0.34);
const legGeo = new THREE.BoxGeometry(0.22, 0.6, 0.24);
const armGeo = new THREE.BoxGeometry(0.16, 0.52, 0.18);
const headGeo = new THREE.SphereGeometry(0.24, 8, 7);
const brimGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10);
const capGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.22, 10);
const rifleGeo = new THREE.BoxGeometry(0.09, 0.09, 1.15);
const dartGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
const dartMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a });

function buildRanger() {
  const g = new THREE.Group();
  const legL = new THREE.Group();
  legL.position.set(-0.15, 0.6, 0);
  legL.add(new THREE.Mesh(legGeo, lambert(PANTS)));
  legL.children[0].position.y = -0.3;
  const legR = legL.clone();
  legR.position.x = 0.15;

  const torso = new THREE.Mesh(bodyGeo, lambert(UNIFORM));
  torso.position.y = 0.95;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), lambert(0xe8c04a));
  badge.position.set(-0.15, 1.05, 0.19);

  const armL = new THREE.Group();
  armL.position.set(-0.4, 1.2, 0);
  armL.add(new THREE.Mesh(armGeo, lambert(UNIFORM)));
  armL.children[0].position.y = -0.24;
  const armR = armL.clone();
  armR.position.x = 0.4;

  const head = new THREE.Mesh(headGeo, lambert(SKIN));
  head.position.y = 1.52;
  const brim = new THREE.Mesh(brimGeo, lambert(HAT));
  brim.position.y = 1.72;
  const cap = new THREE.Mesh(capGeo, lambert(HAT));
  cap.position.y = 1.82;

  // Tranq rifle held across the chest, pointing forward
  const rifle = new THREE.Mesh(rifleGeo, lambert(0x2e2a24));
  rifle.position.set(0.15, 1.05, 0.4);
  rifle.rotation.x = -0.1;

  g.add(legL, legR, torso, badge, armL, armR, head, brim, cap, rifle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legL, legR };
}

export class RangerSystem {
  constructor(scene, props) {
    this.scene = scene;
    this.props = props;
    this.rangers = [];
    this.darts = [];
  }

  // Rangers arrive from the edges of the map.
  spawn(n) {
    for (let i = 0; i < n; i++) {
      const side = Math.floor(Math.random() * 4);
      const along = (Math.random() - 0.5) * 2 * (BOUNDS - 10);
      const x = side === 0 ? -BOUNDS + 4 : side === 1 ? BOUNDS - 4 : along;
      const z = side === 2 ? -BOUNDS + 4 : side === 3 ? BOUNDS - 4 : along;
      const r = buildRanger();
      r.group.position.set(x, 0, z);
      r.walkT = Math.random() * 10;
      r.aimTimer = 2 + Math.random() * 2;
      r.strafeSign = Math.random() < 0.5 ? -1 : 1;
      r.strafeTimer = 2 + Math.random() * 2;
      this.scene.add(r.group);
      this.rangers.push(r);
    }
  }

  takeAt(pos, radius) {
    const taken = [];
    for (let i = this.rangers.length - 1; i >= 0; i--) {
      const r = this.rangers[i];
      if (Math.hypot(r.group.position.x - pos.x, r.group.position.z - pos.z) < radius) {
        this.rangers.splice(i, 1);
        taken.push(r);
      }
    }
    return taken;
  }

  // onShoot() when a dart is fired; onHit() when one connects with the player.
  update(dt, playerPos, onShoot, onHit) {
    for (const r of this.rangers) {
      const p = r.group.position;
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dz);
      const toPlayer = Math.atan2(dx, dz);
      r.group.rotation.y = toPlayer; // always facing the threat

      // Keep tranq-rifle distance: back off when charged, close when far
      let move = 0;
      let moveDir = toPlayer;
      if (dist < 9) { move = 4.2; moveDir = toPlayer + Math.PI; }
      else if (dist > 19) { move = 4.2; }
      else {
        r.strafeTimer -= dt;
        if (r.strafeTimer <= 0) {
          r.strafeTimer = 2 + Math.random() * 2;
          r.strafeSign *= -1;
        }
        move = 2.2;
        moveDir = toPlayer + (Math.PI / 2) * r.strafeSign;
      }
      p.x += Math.sin(moveDir) * move * dt;
      p.z += Math.cos(moveDir) * move * dt;
      p.x = THREE.MathUtils.clamp(p.x, -BOUNDS + 2, BOUNDS - 2);
      p.z = THREE.MathUtils.clamp(p.z, -BOUNDS + 2, BOUNDS - 2);
      r.walkT += dt * move * 3;
      const gait = Math.sin(r.walkT) * 0.5;
      r.legL.rotation.x = gait;
      r.legR.rotation.x = -gait;

      // Push out of props
      for (const prop of this.props) {
        if (!prop.alive) continue;
        const ox = p.x - prop.x;
        const oz = p.z - prop.z;
        const d = Math.hypot(ox, oz);
        const minD = prop.radius + 0.4;
        if (d < minD && d > 0.001) {
          const push = (minD - d) / d;
          p.x += ox * push;
          p.z += oz * push;
        }
      }

      // Fire!
      r.aimTimer -= dt;
      if (r.aimTimer <= 0 && dist < 24) {
        r.aimTimer = 3.5 + Math.random() * 1.5;
        const dart = new THREE.Mesh(dartGeo, dartMat);
        dart.position.set(p.x, 1.4, p.z);
        const vel = new THREE.Vector3(playerPos.x - p.x, 1.6 - 1.4, playerPos.z - p.z).normalize().multiplyScalar(24);
        dart.lookAt(playerPos.x, 1.6, playerPos.z);
        this.scene.add(dart);
        this.darts.push({ mesh: dart, vel, t: 0 });
        if (onShoot) onShoot();
      }
    }

    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      d.t += dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      const hit = Math.hypot(
        d.mesh.position.x - playerPos.x,
        d.mesh.position.z - playerPos.z
      ) < 1.3 && d.mesh.position.y < 4;
      if (hit || d.t > 2.2) {
        this.scene.remove(d.mesh);
        this.darts.splice(i, 1);
        if (hit && onHit) onHit();
      }
    }
  }
}

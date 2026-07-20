import * as THREE from 'three';

const GRAVITY = 26;
const _v = new THREE.Vector3();

const puffGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);

export class DebrisSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  // Blow a prop apart: every mesh inside becomes a physics chunk flying
  // away from `center`. The prop group itself should be removed by the caller
  // after this returns (attach() reparents the meshes to the scene).
  explodeGroup(group, center) {
    group.updateMatrixWorld(true);
    const meshes = [];
    group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      this.scene.attach(mesh);
      _v.copy(mesh.position).sub(center);
      _v.y = 0;
      const away = _v.lengthSq() > 0.001 ? _v.normalize() : _v.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      this.items.push({
        mesh,
        vel: new THREE.Vector3(
          away.x * (3 + Math.random() * 6),
          6 + Math.random() * 7,
          away.z * (3 + Math.random() * 6)
        ),
        angVel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ),
        t: 0,
        life: 1.2 + Math.random() * 0.6,
        baseScale: mesh.scale.clone(),
      });
    }
  }

  // Small burst of cubes for non-final hits.
  puff(pos, color, n = 6) {
    const mat = new THREE.MeshLambertMaterial({ color });
    mat.userData.refs = n;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(puffGeo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 0.5 + Math.random() * 1.5;
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.items.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 4), 4 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 4)),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        t: 0,
        life: 0.6 + Math.random() * 0.3,
        baseScale: mesh.scale.clone(),
        countedMaterial: true, // burst material is refcounted and disposed with its last puff
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) {
        this.scene.remove(it.mesh);
        if (it.countedMaterial && --it.mesh.material.userData.refs === 0) it.mesh.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      it.vel.y -= GRAVITY * dt;
      it.mesh.position.addScaledVector(it.vel, dt);
      if (it.mesh.position.y < 0.25 && it.vel.y < 0) {
        it.mesh.position.y = 0.25;
        it.vel.y *= -0.35;
        it.vel.x *= 0.6;
        it.vel.z *= 0.6;
        it.angVel.multiplyScalar(0.5);
      }
      it.mesh.rotation.x += it.angVel.x * dt;
      it.mesh.rotation.y += it.angVel.y * dt;
      it.mesh.rotation.z += it.angVel.z * dt;
      // Shrink away over the last 30% of life
      const fadeStart = it.life * 0.7;
      if (it.t > fadeStart) {
        const k = 1 - (it.t - fadeStart) / (it.life - fadeStart);
        it.mesh.scale.copy(it.baseScale).multiplyScalar(Math.max(0.001, k));
      }
    }
  }
}

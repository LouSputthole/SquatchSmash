import * as THREE from 'three';

const printGeo = new THREE.CircleGeometry(1, 8);
const birdBodyGeo = new THREE.BoxGeometry(0.3, 0.14, 0.16);
const birdWingGeo = new THREE.BoxGeometry(0.34, 0.04, 0.18);
const birdMat = new THREE.MeshLambertMaterial({ color: 0x33302c });
const ringGeo = new THREE.RingGeometry(0.82, 1.0, 40);

const MAX_PRINTS = 44;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.prints = [];
    this.birds = [];
    this.rings = [];
  }

  // Flattened grass where a sasquatch foot landed.
  footprint(pos, heading, side) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x35542a, transparent: true, opacity: 0.55 });
    const m = new THREE.Mesh(printGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -heading;
    m.scale.set(0.24, 0.38, 1);
    m.position.set(
      pos.x + Math.cos(heading) * 0.4 * side,
      0.04,
      pos.z - Math.sin(heading) * 0.4 * side
    );
    this.scene.add(m);
    this.prints.push({ mesh: m, t: 0, life: 7 });
    if (this.prints.length > MAX_PRINTS) {
      const old = this.prints.shift();
      this.scene.remove(old.mesh);
      old.mesh.material.dispose();
    }
  }

  // Birds scatter out of a smashed tree.
  birdBurst(pos, n = 3) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(birdBodyGeo, birdMat));
      const wingL = new THREE.Mesh(birdWingGeo, birdMat);
      wingL.position.set(-0.22, 0.04, 0);
      const wingR = new THREE.Mesh(birdWingGeo, birdMat);
      wingR.position.set(0.22, 0.04, 0);
      g.add(wingL, wingR);
      g.position.copy(pos);
      g.position.y += 2.5 + Math.random() * 1.5;
      const a = Math.random() * Math.PI * 2;
      this.scene.add(g);
      this.birds.push({
        group: g,
        wingL,
        wingR,
        vel: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 4), 4.5 + Math.random() * 3, Math.sin(a) * (4 + Math.random() * 4)),
        t: 0,
        life: 1.8 + Math.random() * 0.6,
        flapPhase: Math.random() * 10,
      });
    }
  }

  // Expanding ground shockwave ring (rage activation).
  shockwave(pos, maxRadius = 9, color = 0xffa03a) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
    });
    const m = new THREE.Mesh(ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.12, pos.z);
    this.scene.add(m);
    this.rings.push({ mesh: m, t: 0, life: 0.55, maxRadius });
  }

  update(dt) {
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.prints.splice(i, 1);
      } else if (p.t > p.life * 0.5) {
        p.mesh.material.opacity = 0.55 * (1 - (p.t - p.life * 0.5) / (p.life * 0.5));
      }
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.t += dt;
      if (b.t >= b.life) {
        this.scene.remove(b.group);
        this.birds.splice(i, 1);
        continue;
      }
      b.group.position.addScaledVector(b.vel, dt);
      b.vel.y = Math.max(2.2, b.vel.y - dt * 2); // level off into a climb
      b.group.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      const flap = Math.sin((b.t + b.flapPhase) * 22) * 0.9;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
      if (b.t > b.life * 0.75) {
        const k = 1 - (b.t - b.life * 0.75) / (b.life * 0.25);
        b.group.scale.setScalar(Math.max(0.001, k));
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.t / r.life;
      const eased = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(0.5 + eased * r.maxRadius);
      r.mesh.material.opacity = 0.85 * (1 - k);
    }
  }
}

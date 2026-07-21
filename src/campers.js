import * as THREE from 'three';
import { BOUNDS, lambert } from './world.js';

const SHIRT_COLORS = [0xe05a3a, 0x3a9ae0, 0xe0c23a, 0x50c878, 0xc85ac8, 0xff8ab0];
const PANTS = 0x2e3e55;
const SKIN = 0xe8b88a;

const bodyGeo = new THREE.BoxGeometry(0.55, 0.6, 0.32);
const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.17);
const headGeo = new THREE.SphereGeometry(0.24, 8, 7);
const poleGeo = new THREE.BoxGeometry(0.05, 1.7, 0.05);

// kind: body scale + flee speed multiplier — kids are quick, heavies lumber
const KINDS = [
  { scale: 0.7, speedMul: 1.15 },  // kid
  { scale: 1.0, speedMul: 1.0 },   // adult
  { scale: 1.25, speedMul: 0.78 }, // heavy
];

function pickKind() {
  const r = Math.random();
  return KINDS[r < 0.25 ? 0 : r < 0.8 ? 1 : 2];
}

function buildCamper() {
  const g = new THREE.Group();
  const shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];

  const legL = new THREE.Group();
  legL.position.set(-0.14, 0.55, 0);
  legL.add(new THREE.Mesh(legGeo, lambert(PANTS)));
  legL.children[0].position.y = -0.27;
  const legR = legL.clone();
  legR.position.x = 0.14;

  const torso = new THREE.Mesh(bodyGeo, lambert(shirt));
  torso.position.y = 0.88;

  const armL = new THREE.Group();
  armL.position.set(-0.36, 1.1, 0);
  armL.add(new THREE.Mesh(armGeo, lambert(shirt)));
  armL.children[0].position.y = -0.22;
  const armR = armL.clone();
  armR.position.x = 0.36;

  const head = new THREE.Mesh(headGeo, lambert(SKIN));
  head.position.y = 1.42;

  g.add(legL, legR, torso, armL, armR, head);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legL, legR, armL, armR };
}

export class CamperSystem {
  constructor(scene, props, pond, count = 10) {
    this.scene = scene;
    this.props = props;
    this.pond = pond;
    this.campers = [];
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      let ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        x = (Math.random() - 0.5) * 2 * (BOUNDS - 6);
        z = (Math.random() - 0.5) * 2 * (BOUNDS - 6);
        ok = Math.hypot(x, z) > 14 &&
          Math.hypot(x - pond.x, z - pond.z) > pond.r + 2 &&
          props.every((p) => Math.hypot(x - p.x, z - p.z) > p.radius + 1);
      }
      if (ok) this.addCamper(x, z);
    }

    // Ambient life: a couple of anglers at the pond, a couple at picnic tables
    let assigned = 0;
    for (const c of this.campers) {
      if (assigned >= 2) break;
      const a = Math.random() * Math.PI * 2;
      const fx = pond.x + Math.cos(a) * (pond.r + 0.8);
      const fz = pond.z + Math.sin(a) * (pond.r + 0.8);
      if (Math.abs(fx) > BOUNDS - 2 || Math.abs(fz) > BOUNDS - 2) continue;
      c.group.position.set(fx, 0, fz);
      c.group.rotation.y = Math.atan2(pond.x - fx, pond.z - fz);
      c.activity = 'fish';
      const pole = new THREE.Mesh(poleGeo, lambert(0x6b4a2a));
      pole.position.set(0, -0.6, 0.4);
      pole.rotation.x = -1.1;
      c.armR.add(pole);
      c.armR.rotation.x = -0.7;
      assigned++;
    }
    const tables = props.filter((p) => p.type === 'picnic');
    for (let i = 0; i < Math.min(2, tables.length); i++) {
      const c = this.campers[assigned + i];
      if (!c) break;
      const t = tables[i];
      c.group.position.set(t.x, 0, t.z + t.radius + 0.5);
      c.group.rotation.y = Math.atan2(t.x - c.group.position.x, t.z - c.group.position.z);
      c.activity = 'sit';
    }
  }

  addCamper(x, z, fleeing = false) {
    const c = buildCamper();
    const kind = pickKind();
    c.kind = kind;
    c.group.scale.setScalar(kind.scale);
    c.group.position.set(x, 0, z);
    c.state = fleeing ? 'flee' : 'idle';
    c.dir = Math.random() * Math.PI * 2;
    c.timer = 1 + Math.random() * 3;
    c.walkT = Math.random() * 10;
    c.screamed = false;
    c.stumbleT = 0;
    c.activity = null;
    c.home = { x, z };
    this.scene.add(c.group);
    this.campers.push(c);
    return c;
  }

  // Occupants bursting out of a hit building — they spawn already panicking.
  spawnAt(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 1.5;
      this.addCamper(x + Math.cos(a) * r, z + Math.sin(a) * r, true);
    }
  }

  // Startle every camper within `radius` of a position (smash impacts, roars).
  panicNear(pos, radius) {
    for (const c of this.campers) {
      if (c.state === 'flee') continue;
      if (Math.hypot(c.group.position.x - pos.x, c.group.position.z - pos.z) < radius) {
        c.state = 'flee';
      }
    }
  }

  // Remove and return every camper within `radius` of a position. The caller
  // owns what happens next (gore, scoring); groups stay in the scene so their
  // meshes can be exploded before removal.
  takeAt(pos, radius) {
    const taken = [];
    for (let i = this.campers.length - 1; i >= 0; i--) {
      const c = this.campers[i];
      if (Math.hypot(c.group.position.x - pos.x, c.group.position.z - pos.z) < radius) {
        this.campers.splice(i, 1);
        taken.push(c);
      }
    }
    return taken;
  }

  update(dt, playerPos, onScaredOff, onScream) {
    for (let i = this.campers.length - 1; i >= 0; i--) {
      const c = this.campers[i];
      const p = c.group.position;
      const distToPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      let speed = 0;

      if (c.state === 'idle') {
        if (distToPlayer < 9) {
          c.state = 'flee';
        } else if (!c.activity) {
          c.timer -= dt;
          if (c.timer <= 0) {
            c.timer = 1.5 + Math.random() * 3;
            // wander, drifting back toward home
            c.dir = Math.random() < 0.6
              ? Math.atan2(c.home.x - p.x, c.home.z - p.z) + (Math.random() - 0.5)
              : Math.random() * Math.PI * 2;
          }
          speed = 1.2;
        }
      }

      if (c.state === 'flee') {
        if (c.activity) {
          c.activity = null;
          c.armR.rotation.x = 0;
        }
        if (!c.screamed) {
          c.screamed = true;
          if (onScream) onScream();
        }
        if (distToPlayer < 25) {
          c.dir = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
        }
        speed = 7 * c.kind.speedMul;

        // Panic makes people clumsy: occasionally trip and eat dirt
        if (c.stumbleT <= 0 && Math.random() < dt * 0.22) {
          c.stumbleT = 0.85;
        }
      }

      if (c.stumbleT > 0) {
        c.stumbleT -= dt;
        speed = 0;
        const k = 1 - Math.max(0, c.stumbleT) / 0.85;
        c.group.rotation.x = Math.sin(Math.min(1, k) * Math.PI) * 1.35;
        if (c.stumbleT <= 0) c.group.rotation.x = 0;
      }

      if (speed > 0) {
        p.x += Math.sin(c.dir) * speed * dt;
        p.z += Math.cos(c.dir) * speed * dt;
        c.group.rotation.y = c.dir;
        c.walkT += dt * speed * 3.2;

        // Push out of props so campers don't run through cabins
        for (const prop of this.props) {
          if (!prop.alive) continue;
          const dx = p.x - prop.x;
          const dz = p.z - prop.z;
          const d = Math.hypot(dx, dz);
          const minD = prop.radius + 0.4;
          if (d < minD && d > 0.001) {
            const push = (minD - d) / d;
            p.x += dx * push;
            p.z += dz * push;
          }
        }
      }

      // Animate: scissor legs; arms flail overhead when fleeing
      const gait = Math.sin(c.walkT) * (speed > 3 ? 0.9 : 0.4);
      if (c.activity === 'sit') {
        c.legL.rotation.x = 1.35;
        c.legR.rotation.x = 1.35;
        p.y = -0.35 * c.kind.scale;
      } else {
        c.legL.rotation.x = gait;
        c.legR.rotation.x = -gait;
        if (c.state !== 'flee') p.y = 0;
      }
      if (c.state === 'flee') {
        c.armL.rotation.x = Math.PI - 0.3 + Math.sin(c.walkT * 2) * 0.25;
        c.armR.rotation.x = Math.PI - 0.3 - Math.sin(c.walkT * 2) * 0.25;
        p.y = Math.abs(Math.sin(c.walkT)) * 0.08;
      } else if (!c.activity) {
        c.armL.rotation.x = gait * 0.6;
        c.armR.rotation.x = -gait * 0.6;
      }

      // Escaped off the map — scared off for good
      if (Math.abs(p.x) > BOUNDS + 2 || Math.abs(p.z) > BOUNDS + 2) {
        this.scene.remove(c.group);
        this.campers.splice(i, 1);
        if (onScaredOff) onScaredOff(p.clone());
      }
    }
  }
}

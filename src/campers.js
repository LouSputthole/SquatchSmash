import * as THREE from 'three';
import { BOUNDS, lambert } from './world.js';

const SHIRT_COLORS = [0xe05a3a, 0x3a9ae0, 0xe0c23a, 0x50c878, 0xc85ac8, 0xff8ab0];
const PANTS = 0x2e3e55;
const SKIN = 0xe8b88a;

const bodyGeo = new THREE.BoxGeometry(0.55, 0.6, 0.32);
const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.17);
const headGeo = new THREE.SphereGeometry(0.24, 8, 7);

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
      if (!ok) continue;
      const c = buildCamper();
      c.group.position.set(x, 0, z);
      c.state = 'idle';
      c.dir = Math.random() * Math.PI * 2;
      c.timer = 1 + Math.random() * 3;
      c.walkT = Math.random() * 10;
      c.screamed = false;
      c.home = { x, z };
      scene.add(c.group);
      this.campers.push(c);
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

  update(dt, playerPos, onScaredOff, onScream) {
    for (let i = this.campers.length - 1; i >= 0; i--) {
      const c = this.campers[i];
      const p = c.group.position;
      const distToPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      let speed = 0;

      if (c.state === 'idle') {
        if (distToPlayer < 9) {
          c.state = 'flee';
        } else {
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
        if (!c.screamed) {
          c.screamed = true;
          if (onScream) onScream();
        }
        if (distToPlayer < 25) {
          c.dir = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
        }
        speed = 7;
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
      c.legL.rotation.x = gait;
      c.legR.rotation.x = -gait;
      if (c.state === 'flee') {
        c.armL.rotation.x = Math.PI - 0.3 + Math.sin(c.walkT * 2) * 0.25;
        c.armR.rotation.x = Math.PI - 0.3 - Math.sin(c.walkT * 2) * 0.25;
        p.y = Math.abs(Math.sin(c.walkT)) * 0.08;
      } else {
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

import * as THREE from 'three';
import { BOUNDS, lambert } from './world.js';

// Ranger Captain "Big Buck" Buckley — the one ranger who doesn't go down in a
// single swing. Rolls in near the end of the run, keeps his distance, and
// answers every smash with a spread of tranq darts.

export const BOSS_NAME = 'RANGER CAPT. "BIG BUCK" BUCKLEY';
export const BOSS_MAX_HP = 10;
const BOSS_SCALE = 1.55;
const BOSS_RADIUS = 1.7;

const UNIFORM = 0x5d6b3f;
const UNIFORM_DARK = 0x414c2c;
const PANTS = 0x2f3a24;
const SKIN = 0xdba578;
const HAT = 0x4a3d22;

const bodyGeo = new THREE.BoxGeometry(0.78, 0.72, 0.42);
const legGeo = new THREE.BoxGeometry(0.26, 0.62, 0.28);
const armGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
const headGeo = new THREE.SphereGeometry(0.26, 8, 7);
const brimGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.07, 12);
const capGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.3, 12);
const bandGeo = new THREE.CylinderGeometry(0.285, 0.285, 0.07, 12);
const shadeGeo = new THREE.BoxGeometry(0.42, 0.1, 0.06);
const stacheGeo = new THREE.BoxGeometry(0.3, 0.08, 0.07);
const barrelGeo = new THREE.BoxGeometry(0.11, 0.11, 1.4);
const epauletGeo = new THREE.BoxGeometry(0.22, 0.08, 0.3);
const dartGeo = new THREE.BoxGeometry(0.09, 0.09, 0.55);
const dartMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });

function buildCaptain() {
  const g = new THREE.Group();

  const legL = new THREE.Group();
  legL.position.set(-0.18, 0.62, 0);
  legL.add(new THREE.Mesh(legGeo, lambert(PANTS)));
  legL.children[0].position.y = -0.31;
  const legR = legL.clone();
  legR.position.x = 0.18;

  const torso = new THREE.Mesh(bodyGeo, lambert(UNIFORM));
  torso.position.y = 1.0;
  // Own material (not the shared lambert cache) — the hit flash mutates it
  const vest = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.46),
    new THREE.MeshLambertMaterial({ color: UNIFORM_DARK })
  );
  vest.position.y = 1.02;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), lambert(0xf0cc48));
  badge.position.set(-0.2, 1.16, 0.24);

  const armL = new THREE.Group();
  armL.position.set(-0.5, 1.28, 0);
  armL.add(new THREE.Mesh(armGeo, lambert(UNIFORM)));
  armL.children[0].position.y = -0.26;
  const armR = armL.clone();
  armR.position.x = 0.5;

  const epL = new THREE.Mesh(epauletGeo, lambert(0xf0cc48));
  epL.position.set(-0.5, 1.34, 0);
  const epR = epL.clone();
  epR.position.x = 0.5;

  const head = new THREE.Mesh(headGeo, lambert(SKIN));
  head.position.y = 1.62;
  const stache = new THREE.Mesh(stacheGeo, lambert(0x6b5a3a));
  stache.position.set(0, 1.54, 0.24);
  const shades = new THREE.Mesh(shadeGeo, new THREE.MeshLambertMaterial({ color: 0x14181f, emissive: 0x0a1428 }));
  shades.position.set(0, 1.66, 0.24);

  const brim = new THREE.Mesh(brimGeo, lambert(HAT));
  brim.position.y = 1.84;
  const cap = new THREE.Mesh(capGeo, lambert(HAT));
  cap.position.y = 1.98;
  const band = new THREE.Mesh(bandGeo, lambert(0xf0cc48));
  band.position.y = 1.88;

  // Over-under double-barrel tranq rifle
  const barrelTop = new THREE.Mesh(barrelGeo, lambert(0x24211c));
  barrelTop.position.set(0.2, 1.2, 0.5);
  const barrelBot = barrelTop.clone();
  barrelBot.position.y = 1.08;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.4), lambert(0x5a3a20));
  stock.position.set(0.2, 1.12, -0.15);

  g.add(legL, legR, torso, vest, badge, armL, armR, epL, epR,
    head, stache, shades, brim, cap, band, barrelTop, barrelBot, stock);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(BOSS_SCALE);

  return { group: g, legL, legR, torso, vest };
}

export class Boss {
  constructor(scene, props) {
    this.scene = scene;
    this.props = props;
    this.unit = null;
    this.darts = [];
    this.hp = 0;
    this.maxHp = BOSS_MAX_HP;
    this.enraged = false;
    this.radius = BOSS_RADIUS;
    this.hitFlash = 0;
  }

  get active() {
    return this.unit !== null;
  }

  get position() {
    return this.unit ? this.unit.group.position : null;
  }

  get hpFrac() {
    return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
  }

  // Storms in from whichever edge is furthest from the player.
  spawn(playerPos) {
    if (this.unit) return false;
    const u = buildCaptain();
    const away = Math.atan2(-playerPos.x, -playerPos.z);
    const x = THREE.MathUtils.clamp(Math.sin(away) * (BOUNDS - 5), -BOUNDS + 5, BOUNDS - 5);
    const z = THREE.MathUtils.clamp(Math.cos(away) * (BOUNDS - 5), -BOUNDS + 5, BOUNDS - 5);
    u.group.position.set(x, 0, z);
    u.walkT = 0;
    u.aimTimer = 2.2;
    u.strafeSign = Math.random() < 0.5 ? -1 : 1;
    u.strafeTimer = 2;
    this.unit = u;
    this.hp = BOSS_MAX_HP;
    this.enraged = false;
    this.hitFlash = 0;
    this.scene.add(u.group);
    return true;
  }

  // Returns 'hit' | 'killed' | null. The caller owns gore, scoring and banners.
  damage(n) {
    if (!this.unit || this.hp <= 0) return null;
    this.hp -= n;
    this.hitFlash = 0.18;
    if (this.hp <= 0) {
      this.hp = 0;
      return 'killed';
    }
    return 'hit';
  }

  // True the first time he drops to half health — the caller sends in backup.
  consumeEnrage() {
    if (!this.unit || this.enraged || this.hp > this.maxHp / 2 || this.hp <= 0) return false;
    this.enraged = true;
    return true;
  }

  inRange(pos, radius) {
    if (!this.unit) return false;
    const p = this.unit.group.position;
    return Math.hypot(p.x - pos.x, p.z - pos.z) < radius + BOSS_RADIUS;
  }

  // Hands back the body so the caller can explode it, then clears the fight.
  claimBody() {
    if (!this.unit) return null;
    const group = this.unit.group;
    this.unit = null;
    return group;
  }

  clear() {
    if (this.unit) this.scene.remove(this.unit.group);
    this.unit = null;
    for (const d of this.darts) this.scene.remove(d.mesh);
    this.darts.length = 0;
  }

  fireVolley(playerPos, onShoot) {
    const p = this.unit.group.position;
    const base = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const spread = this.enraged ? [-0.26, -0.09, 0.09, 0.26] : [-0.18, 0, 0.18];
    for (const off of spread) {
      const a = base + off;
      const dart = new THREE.Mesh(dartGeo, dartMat);
      dart.position.set(p.x, 1.9, p.z);
      dart.rotation.y = a;
      this.darts.push({
        mesh: dart,
        vel: new THREE.Vector3(Math.sin(a) * 26, -0.2, Math.cos(a) * 26),
        t: 0,
      });
      this.scene.add(dart);
    }
    if (onShoot) onShoot();
  }

  update(dt, playerPos, onShoot, onHit) {
    const u = this.unit;
    if (u) {
      const p = u.group.position;
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dz);
      const toPlayer = Math.atan2(dx, dz);
      u.group.rotation.y = toPlayer;

      // Holds tranq-rifle range: closes from far, backs off when crowded
      const near = this.enraged ? 8 : 10;
      const far = this.enraged ? 15 : 17;
      const rush = this.enraged ? 1.35 : 1;
      let move = 0;
      let moveDir = toPlayer;
      if (dist < near) { move = 5.4 * rush; moveDir = toPlayer + Math.PI; }
      else if (dist > far) { move = 6.2 * rush; }
      else {
        u.strafeTimer -= dt;
        if (u.strafeTimer <= 0) {
          u.strafeTimer = 1.4 + Math.random() * 1.6;
          u.strafeSign *= -1;
        }
        move = 3.4 * rush;
        moveDir = toPlayer + (Math.PI / 2) * u.strafeSign;
      }
      p.x += Math.sin(moveDir) * move * dt;
      p.z += Math.cos(moveDir) * move * dt;
      p.x = THREE.MathUtils.clamp(p.x, -BOUNDS + 2, BOUNDS - 2);
      p.z = THREE.MathUtils.clamp(p.z, -BOUNDS + 2, BOUNDS - 2);

      u.walkT += dt * move * 2.6;
      const gait = Math.sin(u.walkT) * 0.5;
      u.legL.rotation.x = gait;
      u.legR.rotation.x = -gait;

      // Push out of standing props
      for (const prop of this.props) {
        if (!prop.alive) continue;
        const ox = p.x - prop.x;
        const oz = p.z - prop.z;
        const d = Math.hypot(ox, oz);
        const minD = prop.radius + 0.6;
        if (d < minD && d > 0.001) {
          const push = (minD - d) / d;
          p.x += ox * push;
          p.z += oz * push;
        }
      }

      // Hit flash: the vest glows white for a beat on every connect
      if (this.hitFlash > 0) {
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        const k = this.hitFlash / 0.18;
        u.vest.material.emissive.setRGB(k, k * 0.7, k * 0.7);
      }

      u.aimTimer -= dt;
      if (u.aimTimer <= 0 && dist < 30) {
        u.aimTimer = this.enraged ? 1.7 : 2.7;
        this.fireVolley(playerPos, onShoot);
      }
    }

    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      d.t += dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      const hit = Math.hypot(
        d.mesh.position.x - playerPos.x,
        d.mesh.position.z - playerPos.z
      ) < 1.4 && d.mesh.position.y < 4;
      if (hit || d.t > 2.4) {
        this.scene.remove(d.mesh);
        this.darts.splice(i, 1);
        if (hit && onHit) onHit();
      }
    }
  }
}

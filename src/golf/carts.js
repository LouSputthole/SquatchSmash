/**
 * Two beige carts, older than they should be.
 *
 * The ride out to the green is the most important twenty seconds in the scene
 * and it is not a cutscene. The player keeps the camera the whole way: he can
 * look at the pond, the clubhouse, the other cart, or straight ahead at
 * nothing while Lou talks. Taking the view off him here would turn the one
 * private conversation in the morning into something he watches.
 *
 * Carts follow the authored cart path, which `field.js` grades flat across its
 * width, so they track the ground without any suspension model.
 */

import * as THREE from 'three';
import { mat } from '../world/build.js';
import { heightAt } from './field.js';
import { HOLE } from './hole.js';

const BODY = 0xd8d2be;      // beige, and it was beige twenty years ago too
const TRIM = 0x4a4a52;
const ROOF = 0xe4e0d2;

function buildCart(scene) {
  const g = new THREE.Group();

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.22, 2.30), mat({ color: BODY, roughness: 0.82 }));
  deck.position.y = 0.46;
  deck.castShadow = true;
  g.add(deck);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.34, 0.66), mat({ color: BODY, roughness: 0.82 }));
  nose.position.set(0, 0.72, 0.90);
  nose.castShadow = true;
  g.add(nose);

  // Bench, back rest, and the bag rack behind it.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.16, 0.60), mat({ color: TRIM, roughness: 0.9 }));
  bench.position.set(0, 0.66, -0.16);
  g.add(bench);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.54, 0.14), mat({ color: TRIM, roughness: 0.9 }));
  back.position.set(0, 0.95, -0.48);
  g.add(back);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.10, 0.44), mat({ color: TRIM, roughness: 0.9 }));
  rack.position.set(0, 0.72, -1.02);
  g.add(rack);

  // Roof on four posts.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.12, 6),
        mat({ color: 0xb9bcc0, roughness: 0.5, metalness: 0.4 }),
      );
      post.position.set(sx * 0.55, 1.26, sz * 0.86);
      g.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 2.06), mat({ color: ROOF, roughness: 0.8 }));
  roof.position.y = 1.86;
  roof.castShadow = true;
  g.add(roof);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12);
  const wheelMat = mat({ color: 0x1c1c22, roughness: 0.9 });
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const [sz, r] of [[0.86, 0.28], [-0.80, 0.30]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(sx * 0.58, r, sz);
      w.rotation.z = Math.PI / 2;
      w.scale.setScalar(r / 0.28);
      g.add(w);
      wheels.push(w);
    }
  }

  const wheelRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.36, 8),
    mat({ color: 0x2a2a32, roughness: 0.6 }),
  );
  wheelRim.position.set(0, 1.00, 0.78);
  wheelRim.rotation.x = -0.5;
  g.add(wheelRim);

  scene.add(g);
  return { group: g, wheels };
}

/** Distance along the path, in metres, to a world point and a heading. */
function pathPoint(distance) {
  let remaining = distance;
  for (let i = 0; i < HOLE.cartPath.length - 1; i++) {
    const a = HOLE.cartPath[i];
    const b = HOLE.cartPath[i + 1];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= seg || i === HOLE.cartPath.length - 2) {
      const t = seg > 0 ? Math.max(0, Math.min(1, remaining / seg)) : 0;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      return { x, z, yaw: Math.atan2(b.x - a.x, b.z - a.z), done: i === HOLE.cartPath.length - 2 && remaining >= seg };
    }
    remaining -= seg;
  }
  const last = HOLE.cartPath[HOLE.cartPath.length - 1];
  return { x: last.x, z: last.z, yaw: 0, done: true };
}

export function pathLength() {
  let total = 0;
  for (let i = 0; i < HOLE.cartPath.length - 1; i++) {
    total += Math.hypot(HOLE.cartPath[i + 1].x - HOLE.cartPath[i].x, HOLE.cartPath[i + 1].z - HOLE.cartPath[i].z);
  }
  return total;
}

/** Where a rider sits, in the cart's own space. Driver left, passenger right. */
export const SEAT = {
  driver: { x: -0.34, y: 0.96, z: -0.12 },
  passenger: { x: 0.34, y: 0.96, z: -0.12 },
};

export class Cart {
  constructor(scene, { startDistance = 0, speed = 4.2 } = {}) {
    const built = buildCart(scene);
    this.group = built.group;
    this.wheels = built.wheels;
    this.distance = startDistance;
    this.speed = speed;
    this.moving = false;
    this.arrived = false;
    this.stopAt = pathLength();
    this._place();
  }

  _place() {
    const p = pathPoint(this.distance);
    this.group.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.group.rotation.y = p.yaw;
  }

  /** Park it somewhere that is not on the path — the car park, for instance. */
  parkAt(x, z, yaw = 0) {
    this.moving = false;
    this.group.position.set(x, heightAt(x, z), z);
    this.group.rotation.y = yaw;
  }

  start(stopAt = null) {
    if (stopAt !== null) this.stopAt = stopAt;
    this.moving = true;
    this.arrived = false;
  }

  stop() {
    this.moving = false;
  }

  /** World position of a seat, for putting a rider or a camera in it. */
  seatWorld(which, out = new THREE.Vector3()) {
    const s = SEAT[which] ?? SEAT.passenger;
    out.set(s.x, s.y, s.z);
    return this.group.localToWorld(out);
  }

  update(dt) {
    if (this.moving) {
      this.distance += this.speed * dt;
      if (this.distance >= this.stopAt) {
        this.distance = this.stopAt;
        this.moving = false;
        this.arrived = true;
      }
      this._place();
    }
    /* Wheels turn whenever the cart does. A cart with static wheels reads as
     * a prop being slid along the ground, which is what it is, so the wheels
     * are what stop anybody noticing. */
    if (this.moving) {
      const spin = (this.speed * dt) / 0.28;
      for (const w of this.wheels) w.rotation.y += spin;
    }
  }

  get position() { return this.group.position; }
}

/**
 * The two carts and who is in which.
 *
 * Cart one is Lou driving and the Prospect riding, which is the only reason
 * the ride exists. Cart two is Erican driving and Rippin riding, deliberately —
 * putting Rippin in the other cart is what makes the first one quiet.
 */
export class CartPair {
  constructor(scene) {
    this.lead = new Cart(scene, { startDistance: 0, speed: 4.2 });
    this.follow = new Cart(scene, { startDistance: 0, speed: 4.2 });
    this.rolling = false;
  }

  /** Put both on the path at the tee end, one behind the other. */
  stage() {
    this.lead.distance = 2;
    this.follow.distance = -6.5;
    this.lead._place();
    this.follow._place();
  }

  parkInLot(spots) {
    if (spots[0]) this.lead.parkAt(spots[0].x, spots[0].z, spots[0].rot ?? 0);
    if (spots[1]) this.follow.parkAt(spots[1].x, spots[1].z, spots[1].rot ?? 0);
  }

  driveToGreen() {
    const end = pathLength();
    this.lead.start(end);
    /* The second cart stops a little short so the two do not end up nose to
     * tail in one place, and so Rippin has to walk past the bunker. */
    this.follow.start(end - 7.5);
    this.rolling = true;
  }

  get arrived() {
    return this.lead.arrived && !this.lead.moving;
  }

  update(dt) {
    this.lead.update(dt);
    this.follow.update(dt);
    if (this.rolling && !this.lead.moving && !this.follow.moving) this.rolling = false;
  }
}

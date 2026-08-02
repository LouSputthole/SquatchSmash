/**
 * Two beige carts, older than they should be.
 *
 * The ride out to the green is the most important twenty seconds in the scene
 * and it is not a cutscene. The player keeps the camera the whole way: he can
 * look at the pond, the clubhouse, the other cart, or straight ahead at
 * nothing while Lou talks. Taking the view off him here would turn the one
 * private conversation in the morning into something he watches.
 *
 * Carts can follow the authored path or leave it under player control. The
 * free-drive handling still samples the live course height, so a fairway or
 * rough route tracks the ground without needing a suspension simulation.
 */

import * as THREE from 'three';
import { mat } from '../world/build.js';
import { heightAt } from './field.js';
import { HOLE } from './hole.js';

const BODY = 0xd8d2be;      // beige, and it was beige twenty years ago too
const TRIM = 0x4a4a52;
const ROOF = 0xe4e0d2;

function buildAmenities(cart) {
  const root = new THREE.Group();
  root.name = 'golf-cart-amenities';

  /* Two actual bags ride in the rear rack. They are intentionally simpler
   * than the carried three-club bag, but retain the same silhouette: tapered
   * body, open rim and visible metal shafts above it. */
  const bags = [];
  for (const x of [-0.31, 0.31]) {
    const bag = new THREE.Group();
    bag.name = 'golf-cart-rear-bag';
    bag.position.set(x, 0.82, -1.16);
    bag.rotation.x = -0.18;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.20, 0.76, 10),
      mat({ color: x < 0 ? 0x4a3378 : 0x747983, roughness: 0.82 }),
    );
    body.position.y = 0.32;
    bag.add(body);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.145, 0.022, 7, 18),
      mat({ color: 0x20232a, roughness: 0.72 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.71;
    bag.add(rim);
    for (const sx of [-0.07, 0, 0.07]) {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.56, 6),
        mat({ color: 0xbfc5cb, roughness: 0.3, metalness: 0.74 }),
      );
      shaft.position.set(sx, 0.96, 0);
      shaft.rotation.z = sx * 1.4;
      bag.add(shaft);
    }
    root.add(bag);
    bags.push(bag);
  }

  const cooler = new THREE.Group();
  cooler.name = 'golf-cart-cooler';
  cooler.position.set(0.73, 0.70, -0.64);
  const coolerBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.34, 0.50),
    mat({ color: 0xd8e1e5, roughness: 0.78 }),
  );
  cooler.add(coolerBody);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.07, 0.52),
    mat({ color: 0x6f86a0, roughness: 0.7 }),
  );
  lid.name = 'golf-cart-cooler-lid';
  lid.position.y = 0.20;
  cooler.add(lid);
  root.add(cooler);

  const beers = [];
  for (let i = 0; i < 4; i++) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.15, 12),
      mat({ color: i % 2 ? 0xc8cdd2 : 0x7f5ab7, roughness: 0.38, metalness: 0.58 }),
    );
    can.name = `golf-cart-beer-${i + 1}`;
    can.position.set(0.60 + (i % 2) * 0.085, 0.99, -0.76 + Math.floor(i / 2) * 0.10);
    root.add(can);
    beers.push(can);
  }

  const cigarettes = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.035, 0.09),
    mat({ color: 0xf1eee3, roughness: 0.78 }),
  );
  cigarettes.name = 'golf-cart-cigarettes';
  cigarettes.position.set(0.28, 1.15, 0.70);
  cigarettes.rotation.y = 0.22;
  root.add(cigarettes);

  const zyn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.066, 0.066, 0.026, 20),
    mat({ color: 0x3f78b8, roughness: 0.62 }),
  );
  zyn.name = 'golf-cart-zyn-tin';
  zyn.position.set(0.46, 1.16, 0.69);
  root.add(zyn);

  cart.add(root);
  return { root, bags, cooler, beers, cigarettes, zyn };
}

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
        new THREE.CylinderGeometry(0.022, 0.022, 1.12, 6),
        mat({ color: 0xb9bcc0, roughness: 0.5, metalness: 0.4 }),
      );
      post.position.set(sx * 0.62, 1.26, sz * 0.86);
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

  /* A real receiver in the dash, not just music following the camera. The
   * face sits between the seats and nose where it remains visible from the
   * driver's first-person view; named parts let the scene animate its power
   * lamp and position the shared spatial radio mix at the speaker. */
  const radio = new THREE.Group();
  radio.name = 'golf-cart-radio';
  /* Driver-left keeps the receiver visible instead of hiding it behind Lou
   * in the passenger seat. It is intentionally chunky enough to read as a
   * physical dashboard prop from the first-person cart camera. */
  radio.position.set(-0.26, 1.20, 0.69);
  radio.scale.setScalar(0.86);
  radio.rotation.x = -0.16;
  const radioCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.17, 0.09),
    mat({ color: 0x24282b, roughness: 0.72, metalness: 0.18 }),
  );
  radioCase.name = 'golf-cart-radio-case';
  radio.add(radioCase);
  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.072, 0.012),
    mat({ color: 0x8fc6a5, roughness: 0.42, emissive: 0x143824, emissiveIntensity: 0.65 }),
  );
  display.name = 'golf-cart-radio-display';
  display.position.set(0, 0.018, -0.051);
  radio.add(display);
  const power = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 8, 6),
    mat({ color: 0x5c1914, roughness: 0.55, emissive: 0x210000, emissiveIntensity: 0.35 }),
  );
  power.name = 'golf-cart-radio-power';
  power.position.set(0.165, 0.035, -0.057);
  radio.add(power);
  for (const x of [-0.165, 0.165]) {
    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.025, 10),
      mat({ color: 0xb7b2a5, roughness: 0.58, metalness: 0.34 }),
    );
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, -0.040, -0.060);
    radio.add(knob);
  }
  g.add(radio);

  const amenities = buildAmenities(g);

  scene.add(g);
  return { group: g, wheels, radio, radioPower: power, amenities };
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
    this.radio = built.radio;
    this.radioPower = built.radioPower;
    this.amenities = built.amenities;
    this.distance = startDistance;
    this.speed = speed;
    this.velocity = 0;
    this.driveMode = null;
    this.driveInput = { throttle: 0, steer: 0, brake: false };
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
    this.velocity = 0;
    this.driveMode = null;
    this.group.position.set(x, heightAt(x, z), z);
    this.group.rotation.y = yaw;
  }

  start(stopAt = null) {
    if (stopAt !== null) this.stopAt = stopAt;
    this.moving = true;
    this.driveMode = 'path';
    this.arrived = false;
  }

  stop() {
    this.moving = false;
    this.velocity = 0;
    this.driveMode = null;
  }

  /** Give this cart to a player instead of advancing it along a rail. */
  beginPlayerDrive() {
    this.driveMode = 'player';
    this.velocity = 0;
    this.moving = false;
    this.arrived = false;
  }

  setDriveInput({ throttle = 0, steer = 0, brake = false } = {}) {
    this.driveInput.throttle = Math.max(-1, Math.min(1, throttle));
    this.driveInput.steer = Math.max(-1, Math.min(1, steer));
    this.driveInput.brake = !!brake;
  }

  /**
   * Small, forgiving golf-cart handling. Reverse is deliberately slower,
   * steering remains generous, and rolling drag lets the player park without
   * fighting an accelerator-only arcade model.
   */
  _driveFree(dt, input = this.driveInput) {
    const throttle = input.throttle ?? 0;
    const brake = input.brake ?? false;
    const acceleration = throttle >= 0 ? 4.8 : 3.2;
    if (brake) {
      this.velocity = approach(this.velocity, 0, 9 * dt);
    } else if (Math.abs(throttle) > 0.01) {
      this.velocity += throttle * acceleration * dt;
    } else {
      this.velocity = approach(this.velocity, 0, 1.25 * dt);
    }
    this.velocity = Math.max(-2.8, Math.min(8.2, this.velocity));

    const speedRatio = Math.min(1, Math.abs(this.velocity) / 3.5);
    const direction = this.velocity < 0 ? -1 : 1;
    this.group.rotation.y += (input.steer ?? 0) * direction * speedRatio * 1.28 * dt;

    const travel = this.velocity * dt;
    this.group.position.x += Math.sin(this.group.rotation.y) * travel;
    this.group.position.z += Math.cos(this.group.rotation.y) * travel;

    /* A cart can cut across the rough, but it cannot leave the authored piece
     * of course. A missed turn becomes a bump at the edge, never a fall out of
     * the scene. */
    const margin = 1.2;
    const x = Math.max(HOLE.bounds.minX + margin,
      Math.min(HOLE.bounds.maxX - margin, this.group.position.x));
    const z = Math.max(HOLE.bounds.minZ + margin,
      Math.min(HOLE.bounds.maxZ - margin, this.group.position.z));
    if (x !== this.group.position.x || z !== this.group.position.z) this.velocity *= 0.22;
    this.group.position.x = x;
    this.group.position.z = z;
    this.group.position.y = heightAt(x, z);
    this.moving = Math.abs(this.velocity) > 0.08;
    this._spinWheels(travel);
  }

  /** Chase a world point with the same handling used by the player cart. */
  driveToward(target, dt) {
    this.driveMode = 'follow';
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    const wanted = Math.atan2(dx, dz);
    const delta = angleDelta(this.group.rotation.y, wanted);
    const steer = Math.max(-1, Math.min(1, delta * 1.7));
    const throttle = Math.abs(delta) > 1.25 ? 0.18 : distance > 3.5 ? 0.82 : 0;
    this._driveFree(dt, { throttle, steer, brake: distance < 2.8 });
  }

  /** World position of a seat, for putting a rider or a camera in it. */
  seatWorld(which, out = new THREE.Vector3()) {
    const s = SEAT[which] ?? SEAT.passenger;
    out.set(s.x, s.y, s.z);
    return this.group.localToWorld(out);
  }

  /** Speaker position for the spatial station mix. */
  radioWorld(out = new THREE.Vector3()) {
    return this.radio.getWorldPosition(out);
  }

  setRadioOn(on) {
    if (!this.radioPower?.material) return;
    this.radioPower.material.color.setHex(on ? 0x6dff9c : 0x5c1914);
    this.radioPower.material.emissive?.setHex(on ? 0x1d8f4d : 0x210000);
    this.radioPower.material.emissiveIntensity = on ? 1.25 : 0.35;
  }

  /** First-person driving eye, centred enough that neither roof post blinds it. */
  driverViewWorld(out = new THREE.Vector3()) {
    out.set(-0.08, 1.39, 0.04);
    return this.group.localToWorld(out);
  }

  /** Ground beside a seat, used when a rider gets out. */
  exitWorld(which, out = new THREE.Vector3()) {
    const side = which === 'driver' ? -1 : 1;
    out.set(side * 1.05, 0, -0.16);
    return this.group.localToWorld(out);
  }

  update(dt) {
    if (this.driveMode === 'player') {
      this._driveFree(dt);
      return;
    }
    if (this.driveMode === 'path' && this.moving) {
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
    if (this.driveMode === 'path' && this.moving) {
      const spin = (this.speed * dt) / 0.28;
      for (const w of this.wheels) w.rotation.y += spin;
    }
  }

  _spinWheels(travel) {
    const spin = travel / 0.28;
    for (const w of this.wheels) w.rotation.y += spin;
  }

  get position() { return this.group.position; }
}

/**
 * The two carts and who is in which.
 *
 * Cart one is the Prospect driving with Lou beside him. Cart two is Erican
 * driving with Rippin, deliberately: putting Rippin in the other cart is what
 * makes the first one quiet.
 */
export class CartPair {
  constructor(scene) {
    this.lead = new Cart(scene, { startDistance: 0, speed: 4.2 });
    this.follow = new Cart(scene, { startDistance: 0, speed: 4.2 });
    this.rolling = false;
    this.playerDriving = false;
    this.followPlayer = true;
  }

  /** Put both on the path at the tee end, one behind the other. */
  stage() {
    this.playerDriving = false;
    this.rolling = false;
    this.lead.stop();
    this.follow.stop();
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

  /** Prospect drives the lead cart; Erican keeps the second one behind him. */
  beginPlayerDrive({ follow = true } = {}) {
    this.lead.beginPlayerDrive();
    this.followPlayer = follow;
    if (follow) {
      this.follow.driveMode = 'follow';
      this.follow.velocity = 0;
    } else {
      this.follow.stop();
    }
    this.playerDriving = true;
  }

  setPlayerInput(input) {
    this.lead.setDriveInput(input);
  }

  parkPlayerCarts() {
    this.playerDriving = false;
    this.lead.stop();
    this.follow.stop();
    this.rolling = false;
  }

  get arrived() {
    return this.lead.arrived && !this.lead.moving;
  }

  update(dt) {
    this.lead.update(dt);
    if (this.playerDriving && this.followPlayer) {
      const yaw = this.lead.group.rotation.y;
      const target = {
        x: this.lead.position.x - Math.sin(yaw) * 7.5,
        z: this.lead.position.z - Math.cos(yaw) * 7.5,
      };
      this.follow.driveToward(target, dt);
      this.rolling = this.lead.moving || this.follow.moving;
    } else if (this.playerDriving) {
      this.rolling = this.lead.moving;
    } else if (!this.playerDriving) {
      this.follow.update(dt);
      if (this.rolling && !this.lead.moving && !this.follow.moving) this.rolling = false;
    }
  }
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return value;
}

function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * What the Prospect is holding, when it is not a golf club.
 *
 * Silver Pines stocks a cart cooler, a trailside cooler, a packet of
 * cigarettes and a tin of Zyn, and until now none of it went anywhere: using
 * one played a sound, hid a can, printed a line in the corner and left his
 * hands empty. The playtest note is exact — *"I take zyns or smoke from the
 * cart and they don't go into my inventory, I can only change through the
 * clubs"* — and it is really two complaints. The slots are the other half and
 * live in `main.js` on the shared `core/inventory.js`; this file is the half
 * you can see.
 *
 * **Everything here is reused, deliberately.** `makeHeldDrinks` and
 * `makeHeldCigarette` are the flat's own camera-mounted props — the same
 * meshes Tony raises in the apartment and at the Bing — and the can gets the
 * same owner-supplied `label.beer` artwork the fridge cans wear, so the beer
 * on a golf course is the beer from the fridge and not a second beer built to
 * look like it. `poseHeldDrink` is the apartment's actual motion interface,
 * so the course samples the same lift, tilt, and roll instead of copying it.
 */

import * as THREE from 'three';
import {
  beerLabelMaterial, makeBeerCan, makeCigarettePack, makeHeldCigarette,
  makeHeldDrinks, makeZynCan, poseHeldDrink,
} from '../world/props.js';
import { makeMaterials } from '../world/materials.js';
import { resolveGear } from '../world/gear.js';

/** Seconds of held [F] to finish a can, a cigarette, or a pouch. */
export const USE_TIME = Object.freeze({ beer: 2.1, cigs: 2.6, zyn: 1.5 });

/**
 * Fetch the owner-supplied beer artwork and arm `makeBeerCan` with it.
 *
 * Idempotent and safe to lose: `beerLabelMaterial(null)` is a no-op and every
 * can falls back to the plain green label, so a missing file costs the round a
 * texture and nothing else. `resolveGear` never rejects.
 */
let labelReady = null;
export function loadSquatchBeerLabel() {
  labelReady ??= resolveGear(['label.beer'])
    .then((gear) => {
      const slot = gear.get('label.beer');
      return beerLabelMaterial(slot?.real ? slot.texture : null);
    })
    .catch(() => null);
  return labelReady;
}

/**
 * Fetch the Squatch-branded Zyn lid — the same "SQUATCH UP" cover the
 * apartment desk tin wears — and cache the texture for every tin the course
 * dresses.
 *
 * Unlike the beer label, a Zyn lid always has *something* to show: `zyn.lid`
 * has a drawn placeholder in `world/gear.js`, so this never resolves to null
 * the way a missing beer label does. Cached the same way, so the cart's tin
 * and any tin dressed after it share one decode instead of one each.
 */
let zynLidReady = null;
let zynLidTexture = null;
export function loadSquatchZynLid() {
  zynLidReady ??= resolveGear(['zyn.lid'])
    .then((gear) => {
      zynLidTexture = gear.get('zyn.lid')?.texture ?? null;
      return zynLidTexture;
    })
    .catch(() => null);
  return zynLidReady;
}

/**
 * Give the course's stocked cans the fridge's own beer.
 *
 * The cart cooler and the trailside coolers built their cans as bare tinted
 * cylinders — silver, purple, and nothing to do with the beer the rest of the
 * game drinks. The note is "the beers should be the squatch beers", so they
 * are: this hands each existing can the exact geometry and the exact label
 * material that `makeBeerCan` puts on the ones in the flat's fridge, sourced
 * from one real call to that function rather than from a copy of it.
 *
 * Done as a dressing pass rather than in `carts.js` and `terrain.js` because
 * `world/props.js` reaches for `document` at import time and both of those
 * modules are constructed inside the node test suite. The can meshes keep
 * their authored names and their positions, so `can.visible = false` still
 * means somebody drank it and the verifier still finds every can it counts.
 *
 * @param {THREE.Mesh[]} cans the placeholder can meshes, in place
 */
export function dressSquatchBeer(cans = []) {
  const validCans = cans.filter((can) => can?.isMesh);
  if (!validCans.length) return 0;
  const undressed = validCans.filter(
    (can) => can.userData.reusableProp !== 'squatch-beer',
  );
  if (!undressed.length) return validCans.length;
  const prototypeCan = makeBeerCan(makeMaterials(), { x: 0, y: 0, z: 0 });
  /* makeBeerCan builds from the base up: [label body, top ring, bottom ring].
   * Its body is 0.115 tall centred at y 0.058, so the can's mid-height — which
   * is where the placeholder mesh's origin sits — is 0.058 above its base. */
  const [body, top, bottom] = prototypeCan.group.children;
  if (!body) return 0;
  const MID = 0.058;
  for (const can of undressed) {
    can.geometry?.dispose?.();
    can.geometry = body.geometry;
    can.material = body.material;
    can.scale.copy(body.scale);
    can.userData.reusableProp = 'squatch-beer';
    for (const ring of [top, bottom]) {
      if (!ring) continue;
      const cap = new THREE.Mesh(ring.geometry, ring.material);
      cap.name = `${can.name}-cap`;
      /* `can` is the canonical body's scaled mesh. Children inherit that
       * non-uniform scale, so express cap transforms in the parent's local
       * units instead of multiplying the apartment dimensions twice. */
      cap.position.copy(ring.position);
      cap.position.y -= MID;
      cap.position.divide(body.scale);
      cap.scale.copy(ring.scale).divide(body.scale);
      cap.rotation.copy(ring.rotation);
      can.add(cap);
    }
  }
  return validCans.length;
}

/**
 * Dress the cart's generous interaction targets with the apartment's actual
 * consumable props. The targets stay in place so their tested reach and
 * pickup interface do not change; only their visible children are shared.
 */
export function dressGolfCartConsumables(amenities) {
  const beers = dressSquatchBeer(amenities?.beers ?? []);
  let cigarettes = 0;
  let zyn = 0;
  let materials = null;
  const reusableMaterials = () => (materials ??= makeMaterials());

  if (amenities?.cigarettes) {
    const target = amenities.cigarettes;
    target.userData.reusableProp = 'cigarette-pack';
    if (!target.getObjectByName('cigs')) {
      const prop = makeCigarettePack(
        reusableMaterials(), { x: 0, y: -0.0175, z: 0 },
      ).group;
      target.add(prop);
      if (target.material) target.material.visible = false;
    }
    cigarettes = 1;
  }

  if (amenities?.zyn) {
    const target = amenities.zyn;
    target.userData.reusableProp = 'zyn-tin';
    if (!target.getObjectByName('zyn')) {
      /* The generic blue-lid placeholder this used to be replaced with the
       * apartment's own tin, lid graphic and all -- `zynLidTexture` is
       * whatever `loadSquatchZynLid` has resolved by the time the cart is
       * first dressed, real owner art if it exists and the same drawn
       * "SQUATCH UP" cover otherwise, never nothing. */
      const prop = makeZynCan(
        reusableMaterials(), { x: 0, y: -0.013, z: 0, lidTexture: zynLidTexture },
      ).group;
      target.add(prop);
      if (target.material) target.material.visible = false;
    }
    zyn = 1;
  }

  return { beers, cigarettes, zyn };
}

/**
 * One can of it, on its own, for putting in somebody's hand.
 *
 * Same function, same label, same can — `dressSquatchBeer` above rewrites the
 * cooler's placeholders in place because those already exist at authored
 * positions; this is for the five men on the last hole, who need a whole one.
 */
export function squatchBeerCan() {
  return makeBeerCan(makeMaterials(), { x: 0, y: 0, z: 0 }).group;
}

/**
 * The camera-mounted hand rig.
 *
 * Parented to the camera, like the flat's, so it rides the look instead of
 * being animated into view. Everything starts hidden; `show()` picks at most
 * one, because a man cannot be smoking a cigarette and drinking a beer with
 * the same hand and the scene should not pretend otherwise.
 */
export function createHeldProps(camera) {
  const group = new THREE.Group();
  group.name = 'golf-held-props';
  camera.add(group);

  const drinks = makeHeldDrinks();
  drinks.group.name = 'golf-held-drinks';
  drinks.group.position.set(0.26, -0.30, -0.42);
  group.add(drinks.group);

  const cig = makeHeldCigarette();
  cig.group.name = 'golf-held-cigarette';
  /* Low and right of centre, roughly at the corner of his mouth. The flat
   * hangs it in the same place. */
  cig.group.position.set(0.09, -0.19, -0.34);
  cig.group.visible = false;
  group.add(cig.group);

  /* The tin. Small enough that it only reads at all when it comes up to his
   * lip, which is the whole of the animation. */
  const tin = new THREE.Group();
  tin.name = 'golf-held-zyn-tin';
  tin.userData.reusableProp = 'zyn-tin';
  tin.position.set(0.24, -0.30, -0.40);
  tin.add(makeZynCan(makeMaterials(), { x: 0, y: 0, z: 0 }).group);
  tin.visible = false;
  group.add(tin);

  const rest = {
    can: drinks.can.position.clone(),
    cig: cig.group.position.clone(),
    tin: tin.position.clone(),
  };

  let showing = null;

  /** Which prop is in his hand, or null for empty. */
  function show(kind) {
    showing = kind;
    drinks.can.visible = kind === 'beer';
    drinks.bottle.visible = false;
    drinks.jug.visible = false;
    cig.group.visible = kind === 'cigs';
    tin.visible = kind === 'zyn';
    if (kind !== 'beer') resetCan();
    if (kind !== 'zyn') resetTin();
    group.visible = kind !== null;
  }

  function resetCan() {
    drinks.can.position.copy(rest.can);
    drinks.can.rotation.set(0, 0, 0);
  }

  function resetTin() {
    tin.position.copy(rest.tin);
    tin.rotation.set(0, 0, 0);
  }

  /**
   * Lift and tip, from 0 (at rest) to 1 (at the mouth).
   *
   * Smoothstepped so it settles at the lips instead of arriving at a constant
   * speed, and tipped BACK past level so the base finishes above the mouth and
   * the can is actually pouring.
   */
  function poseDrink(k) {
    if (showing !== 'beer') return;
    poseHeldDrink(drinks, 'can', k);
  }

  /** The tin comes up, the lid turns, and a pouch goes in. Same easing. */
  function poseTin(k) {
    if (showing !== 'zyn') return;
    const e = k * k * (3 - 2 * k);
    tin.position.set(
      rest.tin.x - 0.09 * e, rest.tin.y + 0.24 * e, rest.tin.z + 0.10 * e,
    );
    tin.rotation.set(-0.55 * e, e * 2.4, 0.22 * e);
  }

  /** The ember breathes on the draw and settles between them. */
  function poseSmoke(k, t) {
    if (showing !== 'cigs') return;
    const glow = 0.35 + k * 1.35 + Math.sin(t * 2.2) * 0.05;
    cig.ember.material.emissiveIntensity = 2.2 + k * 2.6;
    cig.glow.intensity = glow;
    cig.group.position.set(
      rest.cig.x, rest.cig.y + 0.012 * k, rest.cig.z + 0.006 * k,
    );
  }

  show(null);
  return {
    group, drinks, cig, tin,
    show, poseDrink, poseTin, poseSmoke,
    get showing() { return showing; },
  };
}

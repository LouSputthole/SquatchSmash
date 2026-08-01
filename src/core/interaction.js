/**
 * Look-at interaction system.
 *
 * Objects register a hit mesh plus a descriptor:
 *   {
 *     label:  () => 'Open the <b>fridge</b>',   // or a plain string
 *     key:    'E',
 *     hold:   0.9,                              // seconds; omit for instant
 *     enabled:() => true,
 *     soft:   true,                             // see below
 *     onUse:  () => {},
 *     onTap:  () => {},                         // hold targets only: fired on
 *                                               // a quick press instead
 *     onLook: () => {},                         // fired when it comes under
 *                                               // the crosshair, no keypress
 *     onHoldProgress: (t) => {},
 *   }
 *
 * A descriptor with both `hold` and `onTap` gives you two actions on one
 * target: tap for the cheap one, hold for the committed one.
 *
 * `soft` marks a convenience volume rather than a thing. Half the furniture in
 * the flat is aimed at through a proxy box standing well proud of the real
 * geometry, because a drawer is knee height and nobody wants to stare at their
 * own feet to open one. Those boxes then sit in FRONT of everything resting on
 * the furniture, and the nearest hit wins, so the proxy quietly eats it: the
 * nightstand drawer swallowed the phone lying on the nightstand whole, and the
 * phone only became pickable once getting dressed switched the drawer off.
 * A soft target is taken only when nothing solid was found anywhere along the
 * same ray, which is the order a person would expect -- you point at the phone,
 * you get the phone, and the drawer is what is there when the phone is not.
 */
import * as THREE from 'three';

const MAX_DISTANCE = 2.7;

export class InteractionSystem {
  constructor(camera, hud) {
    this.camera = camera;
    this.hud = hud;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = MAX_DISTANCE;
    this.targets = [];
    this.occluders = [];
    this.current = null;
    this.holdTime = 0;
    this.holding = false;
    this.paused = false;
  }

  /** @param {THREE.Object3D} mesh @param {object} desc */
  register(mesh, desc) {
    mesh.userData.interact = desc;
    this.targets.push(mesh);
    return mesh;
  }

  unregister(mesh) {
    const i = this.targets.indexOf(mesh);
    if (i >= 0) this.targets.splice(i, 1);
    delete mesh.userData.interact;
  }

  /** Geometry that may block a target without itself becoming interactive. */
  setOccluders(objects = []) { this.occluders = [...objects]; }

  /** Walk up the parent chain to find the object that owns the descriptor. */
  _ownerOf(object) {
    let o = object;
    while (o) {
      if (o.userData?.interact) return o;
      o = o.parent;
    }
    return null;
  }

  update(dt) {
    if (this.paused) {
      if (this.current) {
        this.current = null;
        this.hud.hidePrompt();
      }
      return;
    }

    this.raycaster.setFromCamera(ORIGIN, this.camera);
    const hits = this.raycaster.intersectObjects([...this.targets, ...this.occluders], true);

    let found = null;
    let soft = null;
    for (const hit of hits) {
      const owner = this._ownerOf(hit.object);
      if (!owner) break;
      const desc = owner.userData.interact;
      if (desc.enabled && !desc.enabled()) continue;
      // Remembered, not taken: anything solid further down the ray beats it.
      if (desc.soft) { soft ??= owner; continue; }
      found = owner;
      break;
    }
    found ??= soft;

    if (found !== this.current) {
      this.current = found;
      this.holdTime = 0;
      if (!found) this.hud.hidePrompt();
      // Fired the moment a target comes under the crosshair, before anyone has
      // pressed anything -- for things the character remarks on just by seeing.
      else found.userData.interact.onLook?.(found);
    }

    if (!found) return;

    const desc = found.userData.interact;
    const src = (this.holding && desc.holdLabel) ? desc.holdLabel : desc.label;
    const label = typeof src === 'function' ? src() : src;
    this.hud.showPrompt(label, desc.key || 'E');

    if (desc.hold) {
      if (this.holding) {
        this.holdTime += dt;
        const p = Math.min(1, this.holdTime / desc.hold);
        this.hud.setHold(p);
        desc.onHoldProgress?.(p);
        if (p >= 1) {
          this.holdTime = 0;
          this.holding = false;
          this.hud.setHold(null);
          desc.onUse?.(found);
        }
      } else {
        this.holdTime = 0;
        this.hud.setHold(null);
      }
    } else {
      this.hud.setHold(null);
    }
  }

  /** Called on key-down / mouse-down. */
  press() {
    if (this.paused || !this.current) return;
    const desc = this.current.userData.interact;
    if (desc.hold) {
      this.holding = true;
    } else {
      desc.onUse?.(this.current);
    }
  }

  /**
   * Called on key-up / mouse-up. Letting go early on a target that offers
   * both actions is the tap.
   */
  release() {
    const desc = this.current?.userData.interact;
    const target = this.current;
    const tapped = this.holding && desc?.hold && desc.onTap && this.holdTime < desc.hold;
    // Cleared first: the handler may pause the system, which calls back in here.
    this.holding = false;
    this.holdTime = 0;
    this.hud.setHold(null);
    if (tapped) desc.onTap(target);
  }

  setPaused(v) {
    this.paused = v;
    if (v) {
      this.release();
      this.hud.hidePrompt();
      this.current = null;
    }
  }
}

const ORIGIN = new THREE.Vector2(0, 0);

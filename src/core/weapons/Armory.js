/**
 * An armory: racks of real weapons on a wall that you can take one off, use,
 * and put back.
 *
 * Shared, not the mansion's. It takes a wall position and a list of what hangs
 * on it, builds the racks, the guns, the spare ammunition and every
 * interaction, then hands back the colliders so the host scene can stop the
 * player walking through its own rifles. Lou's basement is the first customer;
 * THE TAKE's safehouse is the next.
 *
 * WHAT IS ON THE RACK IS THE REAL GUN. Every copy is a full
 * `buildWeaponModel()` — the same 46-mesh carbine THE TAKE puts in Tony's
 * hands, the same 74-mesh SAW, not a silhouette standing in for one. That
 * costs meshes and it is the point: the owner's note on this room was that its
 * racks held abstract shapes, and a rack of shapes is a rack you cannot tell
 * an AK from a Barrett on.
 *
 * TAKING AND PUTTING BACK. A copy taken off the wall goes invisible and the
 * `WeaponSystem` puts a model in the player's hands; putting it back returns
 * the copy. Ammunition lives on the `Firearm`, not on the rack copy, so a gun
 * put back half empty comes off the wall half empty — which is what a shared
 * armory is for, and why the ammunition crate under each rack exists.
 */
import * as THREE from 'three';
import { box, cylinder, group, mat } from './build.js';
import { buildSpeedloader, buildWeaponModel } from './models.js';
import { weaponDef } from './catalog.js';

/* The board is a WARM MID TONE, not the black it started as.
 *
 * Every gun in the catalogue is parkerized steel and dark polymer, and this
 * house has no environment map, so a metallic surface lit by point lights
 * alone is close to black. Six black guns on a black board is the "abstract
 * silhouette" problem again by another route. A felt-and-plywood backing is
 * what a real display rack has and it is what makes the shapes read. */
const M_BOARD = mat({ color: 0x4a3d2c, roughness: 0.95 });
const M_FRAME = mat({ color: 0x4a4f55, roughness: 0.55, metalness: 0.5 });
const M_PAD = mat({ color: 0x14161a, roughness: 0.96 });
const M_PLACARD = mat({ color: 0xb99a4e, roughness: 0.42, metalness: 0.55 });
const M_CRATE = mat({ color: 0x4b4029, roughness: 0.92 });
const M_BRASS = mat({ color: 0xb08a3c, roughness: 0.32, metalness: 0.85 });
const M_LAMP = mat({ color: 0xfff0cf, roughness: 0.35, emissive: 0xffe8bc, emissiveIntensity: 1.2 });

/** Where each mounted copy hangs, along the rack's own X. */
function slotOffset(def, index) {
  const { copies, spacing } = def.rack;
  return (index - (copies - 1) / 2) * spacing;
}

/** How wide a rack's backboard has to be for its copies. */
export function rackWidth(def) {
  return def.rack.copies * def.rack.spacing + 0.30;
}

/** Where a rack's bottom rail sits above the floor. */
function railHeight(def) {
  /* A rifle rack starts near the floor, because the butts rest on it; a
   * pistol board hangs just under eye level, because nothing rests on it. */
  return def.rack.mount === 'vertical' ? 0.14 : 1.06;
}

/** A pistol board's height. Nothing sticks up out of it, so it is fixed. */
const FLAT_BOARD_H = 0.62;

const _box3 = new THREE.Box3();

/**
 * Build one rack, in its own local space: +X along the wall, +Z out of it,
 * origin on the floor at the middle of the board.
 *
 * THE GUNS ARE FITTED BY MEASUREMENT, not by a guessed offset. Each model's
 * origin is somewhere around its own receiver and every one of the six has it
 * in a different place, so "position it at rail height plus ten centimetres"
 * stands the carbine correctly and puts a quarter of the Barrett's stock
 * through the concrete. Each copy is rotated first, its bounding box taken,
 * and then slid so it is sitting on the rail — which is also what decides how
 * tall the board has to be.
 */
function buildRack(def) {
  const w = rackWidth(def);
  const vertical = def.rack.mount === 'vertical';
  const y0 = railHeight(def);

  const g = group(`armory-rack-${def.id}`);
  const copies = [];

  for (let i = 0; i < def.rack.copies; i++) {
    const holder = new THREE.Group();
    holder.name = `armory-${def.id}-${i}`;
    holder.position.set(slotOffset(def, i), 0, 0);
    g.add(holder);

    const gun = buildWeaponModel(def.id);
    /* Vertical: rotating a -Z-pointing model by +90° about X sends its nose
     * to +Y, so it stands muzzle up against the board.
     * Horizontal: -90° about Y sends the nose to -X, so it lies flat with the
     * muzzle to the left, the way a pistol board is laid out. */
    gun.rotation.set(vertical ? Math.PI / 2 : 0, vertical ? 0 : -Math.PI / 2, 0);
    gun.position.set(0, 0, 0.11);
    gun.updateMatrixWorld(true);
    _box3.setFromObject(gun);
    if (vertical) {
      // Sit the buttplate on the bottom rail.
      gun.position.y = y0 + 0.05 - _box3.min.y;
    } else {
      // Centre it between the pegs.
      gun.position.x = -(_box3.min.x + _box3.max.x) / 2;
      gun.position.y = y0 + FLAT_BOARD_H / 2 - (_box3.min.y + _box3.max.y) / 2;
    }
    gun.updateMatrixWorld(true);
    _box3.setFromObject(gun);
    holder.add(gun);
    copies.push({ index: i, holder, gun, top: _box3.max.y });
  }

  /* Tall enough for whatever is standing in it, plus a hand's width over the
   * muzzles. A pistol board is a fixed 0.92 because nothing sticks up. */
  const tallest = copies.reduce((m, c) => Math.max(m, c.top), y0 + 0.4);
  const h = vertical ? Math.max(0.9, tallest - y0 + 0.14) : FLAT_BOARD_H;

  g.add(box({
    size: [w, h, 0.05], pos: [0, y0 + h / 2, -0.03], mat: M_BOARD, name: 'rack-backboard',
  }));
  // Frame: a rail top and bottom and an upright at each end.
  g.add(box({ size: [w, 0.06, 0.09], pos: [0, y0 + h, 0.02], mat: M_FRAME }));
  g.add(box({ size: [w, 0.06, 0.09], pos: [0, y0, 0.02], mat: M_FRAME }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.06, h, 0.09], pos: [sx * (w / 2 - 0.03), y0 + h / 2, 0.02], mat: M_FRAME }));
  }
  // Brass placard on the top rail. The words are on the interaction label —
  // the whole house tells you what a thing is when you look at it.
  g.add(box({
    size: [Math.min(0.42, w - 0.2), 0.10, 0.012], pos: [0, y0 + h + 0.09, 0.03], mat: M_PLACARD,
    name: 'rack-placard',
  }));

  /* A hooded strip light over the board, angled at the guns.
   *
   * Not decoration: measured in the cellar, the racks under the room's own
   * bare bulb read as black rectangles with black shapes on them, and an
   * armory you cannot tell an AK from a Barrett on is the exact complaint
   * this pass exists to fix. The lamp itself is geometry; the caller decides
   * whether to hand the light to its own light rig — see `addLight`. */
  g.add(box({
    size: [Math.min(0.62, w - 0.18), 0.07, 0.11], pos: [0, y0 + h + 0.22, 0.10], mat: M_FRAME,
    name: 'rack-lamp', cast: false,
  }));
  g.add(box({
    size: [Math.min(0.54, w - 0.26), 0.02, 0.07], pos: [0, y0 + h + 0.185, 0.12], mat: M_LAMP,
    name: 'rack-lamp-tube', cast: false,
  }));
  const lampAt = new THREE.Vector3(0, y0 + h + 0.12, 0.30);

  // Cradles and pegs, sized to what is actually resting in each slot.
  for (const copy of copies) {
    if (vertical) {
      copy.holder.add(box({ size: [0.15, 0.05, 0.16], pos: [0, y0 + 0.025, 0.11], mat: M_PAD }));
      const barrelY = Math.min(copy.top - 0.12, y0 + h - 0.16);
      copy.holder.add(box({ size: [0.12, 0.05, 0.14], pos: [0, barrelY, 0.10], mat: M_PAD }));
      copy.holder.add(cylinder({
        r: 0.014, h: 0.17, pos: [0, barrelY, 0.15], rotX: Math.PI / 2, mat: M_FRAME, seg: 8,
      }));
    } else {
      for (const oy of [-0.06, 0.075]) {
        copy.holder.add(cylinder({
          r: 0.011, h: 0.15, pos: [0, y0 + FLAT_BOARD_H / 2 + oy, 0.065], rotX: Math.PI / 2, mat: M_FRAME, seg: 8,
        }));
      }
    }
  }

  /* The ammunition crate under the rack: loose rounds and, for the revolver,
   * a tray of speedloaders. It is what stops "put it back half empty" from
   * being a one-way ratchet. */
  const crate = group(`armory-ammo-${def.id}`);
  crate.add(box({ size: [0.46, 0.30, 0.34], pos: [0, 0.15, 0], mat: M_CRATE, name: 'ammo-crate' }));
  crate.add(box({ size: [0.48, 0.03, 0.36], pos: [0, 0.315, 0], mat: M_CRATE }));
  for (let i = 0; i < 5; i++) {
    crate.add(cylinder({
      r: 0.008, h: 0.05, pos: [-0.13 + i * 0.065, 0.35, 0.06], mat: M_BRASS, seg: 8,
    }));
  }
  if (def.eject === 'cases') {
    const loader = buildSpeedloader();
    loader.position.set(0.08, 0.35, -0.04);
    loader.rotation.x = -Math.PI / 2;
    crate.add(loader);
  }
  crate.position.set(0, 0, 0.34);
  g.add(crate);

  return {
    root: g,
    copies,
    crate,
    lampAt,
    width: w,
    height: h,
    /** Board footprint in rack-local space, for the caller's collider. */
    footprint: { halfWidth: w / 2, depth: 0.24, top: y0 + h + 0.14 },
  };
}

/**
 * Mount an armory into a scene.
 *
 * @param {object} o
 * @param {THREE.Object3D} o.parent   what the racks are added to
 * @param {object} o.system           a `WeaponSystem`
 * @param {object} o.interaction      an `InteractionSystem`
 * @param {Array} o.racks             [{id, x, y, z, rotY}] — one per weapon,
 *   positioned in `parent` space with `rotY` turning the rack's +Z out of the
 *   wall it hangs on.
 * @param {Function} [o.enabled]      gate for every interaction (scene running)
 * @param {Function} [o.addCollider]  (x0,x1,y0,y1,z0,z1) => void
 * @param {Function} [o.addLight]     (THREE.PointLight) => void — the rack
 *   lamps. Handed to the caller rather than switched on here because a scene
 *   with a nearest-N light rig (this house has one, and had to grow one) must
 *   be the thing that decides which lights are live.
 * @param {Function} [o.onEvent]      ({type:'take'|'rack'|'resupply', id})
 */
export function mountArmory({
  parent, system, interaction, racks,
  enabled = () => true, addCollider = null, addLight = null, onEvent = null,
}) {
  const root = new THREE.Group();
  root.name = 'armory';
  parent.add(root);

  /** @type {Map<string, object>} id -> {def, built, placed, taken} */
  const stands = new Map();

  const emit = (event) => { try { onEvent?.(event); } catch { /* never break a rack */ } };

  for (const spec of racks) {
    const def = weaponDef(spec.id);
    if (!def) continue;
    const built = buildRack(def);
    built.root.position.set(spec.x, spec.y ?? 0, spec.z);
    built.root.rotation.y = spec.rotY ?? 0;
    root.add(built.root);

    const stand = {
      def,
      built,
      /** Which copy index (if any) the player is currently carrying. */
      taken: null,
    };
    stands.set(def.id, stand);

    if (addLight) {
      const lamp = new THREE.PointLight(0xffe8bc, 7.5, 6.2, 2);
      lamp.name = `armory-lamp-${def.id}`;
      lamp.position.copy(built.lampAt);
      built.root.add(lamp);
      addLight(lamp);
    }

    if (addCollider) {
      const cos = Math.abs(Math.cos(spec.rotY ?? 0));
      const sin = Math.abs(Math.sin(spec.rotY ?? 0));
      const hw = built.footprint.halfWidth;
      const d = built.footprint.depth;
      addCollider(
        spec.x - (cos * hw + sin * d), spec.x + (cos * hw + sin * d),
        (spec.y ?? 0), (spec.y ?? 0) + built.footprint.top,
        spec.z - (sin * hw + cos * d), spec.z + (sin * hw + cos * d),
      );
    }

    // ---- Take one off the wall.
    for (const copy of built.copies) {
      interaction.register(copy.gun, {
        label: () => {
          const f = system.firearm(def.id);
          return `Take the <b>${def.name}</b> &mdash; ${f.rounds}/${f.capacity}, ${f.reserve} spare`;
        },
        enabled: () => enabled() && copy.gun.visible,
        onUse: () => take(def.id, copy.index),
      });
    }

    // ---- Put it back. The board itself is the target.
    const board = built.root.getObjectByName('rack-backboard');
    if (board) {
      interaction.register(board, {
        label: () => `Rack the <b>${def.name}</b>`,
        enabled: () => enabled() && system.equipped === def.id && stand.taken !== null,
        onUse: () => put(),
      });
    }

    // ---- Ammunition crate.
    interaction.register(built.crate, {
      label: () => {
        const f = system.firearm(def.id);
        return f.reserve >= def.reserve
          ? `${def.name} ammunition &mdash; the crate is full`
          : `Fill your pockets &mdash; <b>${def.name}</b> ammunition`;
      },
      enabled: () => enabled(),
      onUse: () => resupply(def.id),
    });
  }

  /** Take a specific copy (or the first still on the wall). */
  function take(id, index = null) {
    const stand = stands.get(id);
    if (!stand) return false;
    // Whatever is in the player's hands goes back on its own wall first.
    if (system.equipped && system.equipped !== id) put();
    const copy = index === null
      ? stand.built.copies.find((c) => c.gun.visible)
      : stand.built.copies[index];
    if (!copy || !copy.gun.visible) return false;
    copy.gun.visible = false;
    stand.taken = copy.index;
    system.equip(id);
    emit({ type: 'take', id, index: copy.index });
    return true;
  }

  /** Put whatever is in the player's hands back on its rack. */
  function put() {
    const id = system.equipped;
    if (!id) return false;
    const stand = stands.get(id);
    system.stow();
    if (!stand || stand.taken === null) return false;
    stand.built.copies[stand.taken].gun.visible = true;
    stand.taken = null;
    emit({ type: 'rack', id });
    return true;
  }

  /** Refill the loose-round reserve for one weapon from its crate. */
  function resupply(id) {
    const stand = stands.get(id);
    if (!stand) return false;
    const f = system.firearm(id);
    if (f.reserve >= stand.def.reserve) return false;
    f.reserve = stand.def.reserve;
    emit({ type: 'resupply', id, reserve: f.reserve });
    return true;
  }

  return {
    root,
    stands,
    take,
    put,
    resupply,
    /** Everything on the wall, for a HUD, a verifier or a debug handle. */
    report() {
      const out = {};
      for (const [id, stand] of stands) {
        out[id] = {
          name: stand.def.name,
          copies: stand.built.copies.length,
          onWall: stand.built.copies.filter((c) => c.gun.visible).length,
          taken: stand.taken,
        };
      }
      return out;
    },
    dispose() {
      for (const stand of stands.values()) {
        for (const copy of stand.built.copies) interaction.unregister(copy.gun);
        interaction.unregister(stand.built.crate);
        const board = stand.built.root.getObjectByName('rack-backboard');
        if (board) interaction.unregister(board);
      }
      root.parent?.remove(root);
    },
  };
}

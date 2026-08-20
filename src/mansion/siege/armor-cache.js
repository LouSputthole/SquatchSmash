/**
 * The cellar's armor stand: one plate carrier, visible on a valet frame in
 * the armory, that the player can walk up to and take.
 *
 * OWNER PLAYTEST, 2026-08-19: armor is supposed to be available downstairs in
 * the armory, and it was not -- `main.js` already granted the player a full
 * plate carrier's worth of armor the moment he took a rack weapon
 * (`grantSiegeArmor()`, called from `completeArmoryPickup()`), but nothing in
 * the room ever showed him one. The armor existed as a number on the HUD and
 * nowhere in the world, which reads as no armor at all to a player looking
 * for it on the wall the way the guns are.
 *
 * This is the missing half: a real, pickable object standing in the same
 * room as the racks, built with the same interaction shape
 * `src/core/weapons/Armory.js` uses for a gun -- register the mesh, show a
 * label, hide it and fire a callback on `onUse`. `main.js`'s existing
 * `grantSiegeArmor()` is what actually credits the armor; this module only
 * decides where the carrier stands and what happens to it when it is taken.
 * `completeArmoryPickup()`'s automatic grant on the first weapon stays as the
 * safety net it always was -- a player who grabs a rifle and runs never ends
 * up unarmoured for skipping the stand -- and `replenishArmor()` is already
 * idempotent at the cap, so taking the visible carrier after (or before)
 * arming does not double-credit him.
 *
 * WHERE IT STANDS. The armory's south wall (BASEMENT_ROOM z0+0.45 = 50.45,
 * the same wall the six small-arms racks hang on) carries racks from x=-6.7
 * to the shotgun at x=0.5; `MansionInterior.js`'s own comment on that wall
 * says the shotgun's board "takes the first of" 5.9 m of blank lining before
 * the stair shaft's alcove at x=5.4. x=2.6 sits in the middle of what is left
 * -- clear of every rack and more than two metres from the stair shaft on
 * either side.
 */
import * as THREE from 'three';
import { box, cylinder, mat } from '../../world/build.js';

const M_FRAME = mat({ color: 0x4a4f55, roughness: 0.55, metalness: 0.5 });
const M_PLACARD = mat({ color: 0xb99a4e, roughness: 0.42, metalness: 0.55 });
const M_PLATE = mat({ color: 0x30363d, roughness: 0.82, metalness: 0.1 });
const M_STRAP = mat({ color: 0x1c1e22, roughness: 0.9 });
const M_BUCKLE = mat({ color: 0x8a8f99, roughness: 0.4, metalness: 0.75 });

/** Where the stand goes: south wall of the basement armory room, clear of
 * every weapon rack and the stair shaft on both sides. See the file header. */
export const ARMOR_STAND_SPOT = Object.freeze({ x: 2.6, y: 0, z: 50.45, rotY: 0 });

/**
 * @param {object} o
 * @param {THREE.Object3D} o.parent    what the stand is added to
 * @param {object} o.interaction       an `InteractionSystem`
 * @param {Function} [o.enabled]       gate for the interaction (scene running)
 * @param {Function} [o.addCollider]   (x0,x1,y0,y1,z0,z1) => void
 * @param {number} [o.armor]           how much the label advertises taking it is worth
 * @param {Function} [o.onTake]        () => void, fired once when it is taken
 */
export function buildSiegeArmorCache({
  parent, interaction, enabled = () => true, addCollider = null, armor = 75, onTake = null,
} = {}) {
  if (!parent?.add) throw new Error('buildSiegeArmorCache needs a parent to add to');
  if (!interaction?.register) throw new Error('buildSiegeArmorCache needs an InteractionSystem');

  const spot = ARMOR_STAND_SPOT;
  const root = new THREE.Group();
  root.name = 'siege-armor-cache';
  root.position.set(spot.x, spot.y, spot.z);
  root.rotation.y = spot.rotY;
  parent.add(root);

  /* The valet frame: a plinth, a post, and a shoulder yoke the carrier hangs
   * from -- a different silhouette from the gun racks on purpose, so it does
   * not read as a seventh weapon board. */
  root.add(box({
    name: 'siege.armor-cache.plinth', size: [0.5, 0.08, 0.42], pos: [0, 0.04, 0], mat: M_FRAME,
  }));
  root.add(cylinder({
    r: 0.035, h: 1.18, pos: [0, 0.66, 0], mat: M_FRAME,
  }));
  root.add(box({
    name: 'siege.armor-cache.yoke', size: [0.46, 0.06, 0.1], pos: [0, 1.22, 0], mat: M_FRAME,
  }));
  root.add(box({
    name: 'siege.armor-cache.placard',
    size: [0.34, 0.09, 0.012],
    pos: [0, 0.34, 0.22],
    mat: M_PLACARD,
  }));

  /* The plate carrier itself: front and back plates on the yoke, side straps
   * closing the gap between them so it reads as one vest, not two slabs. */
  const carrier = new THREE.Group();
  carrier.name = 'siege.armor-cache.carrier';
  carrier.position.set(0, 0.86, 0);
  root.add(carrier);

  const plate = (name, z) => carrier.add(box({
    name, size: [0.42, 0.5, 0.07], pos: [0, 0, z], mat: M_PLATE,
  }));
  plate('siege.armor-cache.plate-front', -0.13);
  plate('siege.armor-cache.plate-back', 0.13);
  for (const side of [-1, 1]) {
    carrier.add(box({
      name: `siege.armor-cache.strap-${side < 0 ? 'left' : 'right'}`,
      size: [0.06, 0.44, 0.24],
      pos: [side * 0.22, 0, 0],
      mat: M_STRAP,
    }));
    carrier.add(cylinder({
      r: 0.018, h: 0.09, pos: [side * 0.22, 0.16, 0], rotX: Math.PI / 2, mat: M_BUCKLE,
    }));
  }
  /* Two collar straps up onto the yoke, so the carrier reads as hanging
   * rather than standing on nothing. */
  for (const side of [-1, 1]) {
    carrier.add(box({
      name: `siege.armor-cache.hanger-${side < 0 ? 'left' : 'right'}`,
      size: [0.05, 0.36, 0.05],
      pos: [side * 0.14, 0.42, 0],
      mat: M_STRAP,
    }));
  }

  if (addCollider) {
    addCollider(
      spot.x - 0.3, spot.x + 0.3,
      spot.y, spot.y + 1.55,
      spot.z - 0.28, spot.z + 0.28,
    );
  }

  let taken = false;

  function take() {
    if (taken) return false;
    taken = true;
    carrier.visible = false;
    try { onTake?.(); } catch { /* never break the stand */ }
    return true;
  }

  interaction.register(carrier, {
    label: () => `Take the <b>Plate Carrier</b> &mdash; ${armor} armor`,
    enabled: () => enabled() && !taken && carrier.visible,
    onUse: () => take(),
  });

  return {
    root,
    carrier,
    take,
    get taken() { return taken; },
  };
}

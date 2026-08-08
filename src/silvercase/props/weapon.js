import * as THREE from 'three';
import { makeRevolver } from '../../world/props.js';
import {
  SILVERCASE_PROSPECT_PRESENTATION,
  makeSilverCaseProspectViewArm,
} from '../cast/prospect.js';

/**
 * The guns in The Silver Case.
 *
 * Two of them, and they are deliberately the same gun: the one in Tony's
 * hands and the one the man in the bathroom is holding when he comes through
 * the door. Both are built from `world/props.js`'s `makeRevolver` — the
 * campaign's canonical sidearm, the one the Squatchfather's prospect carries
 * and the one lying on the flat's coffee table — scaled up into the long
 * heavy-frame version this job calls for. Nothing here models a new weapon;
 * it re-uses the modelled one at a different size so the two read as a pair.
 *
 * `makeRevolver` points down local -z, which is the convention every hand,
 * view-model and muzzle effect in this project already shares.
 */

/**
 * How much bigger the heavy-frame gun is than the coffee-table revolver.
 * `makeRevolver` is about 30 cm end to end, which is a service four-inch;
 * this is the eight-and-three-eighths, and it is meant to be recognisable
 * across a room as the reason nobody in it is arguing.
 */
export const BIG_REVOLVER_SCALE = 1.35;

/**
 * The big revolver, as a world/hand prop.
 *
 * @param {object} [o]
 * @param {number} [o.scale] multiplier on BIG_REVOLVER_SCALE
 */
export function makeBigRevolver({ scale = 1 } = {}) {
  const built = makeRevolver(null, { x: 0, y: 0, z: 0 });
  const g = built.group;
  g.name = 'big-revolver';
  g.scale.setScalar(BIG_REVOLVER_SCALE * scale);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  g.userData.muzzle = built.muzzle.clone().multiplyScalar(BIG_REVOLVER_SCALE * scale);
  return g;
}

/**
 * Put the big revolver in a figure's right hand.
 *
 * Both armed NPCs in this mission — the man who comes out of the bathroom and
 * Ape, who is not going to stand there empty-handed while the prospect does the
 * work — carry it the same way, so the placement lives here rather than being
 * typed twice in cast.js. Parented to the right FOREARM at the hand (where
 * `makePerson` puts the hand slab, y=-0.30 inside that group), so it tracks
 * every pose and the collapse afterwards with no extra bookkeeping.
 *
 * The -90° about x lays the barrel (local -z, `makeRevolver`'s convention) down
 * the forearm's own -y, i.e. pointing wherever the arm is pointing.
 *
 * @param {THREE.Object3D} forearm an `Npc` figure's `parts.foreR`
 * @returns {THREE.Group} the gun, carrying `userData.muzzle` in its own space
 */
export function mountHandRevolver(forearm) {
  const gun = makeBigRevolver();
  gun.rotation.set(-Math.PI / 2 + 0.12, 0, 0);
  gun.position.set(0.005, -0.33, 0.03);
  forearm.add(gun);
  return gun;
}

/** Where a mounted gun's flash happens, in world space. */
export function muzzleWorld(gun, out) {
  return gun.localToWorld(out.copy(gun.userData.muzzle));
}

/**
 * Tony's first-person view-model.
 *
 * Modelled on `src/squatchfather/characters/ProspectController`'s concealed
 * revolver, which is the established shape for this in the campaign: the gun
 * plus a blocky hand on the raked grip and a cuff behind it, parented to the
 * camera, sliding up from a hidden rest position when it is drawn and kicking
 * on each shot.
 *
 * The mission never fires it for the player; it only ever reflects what the
 * player already did.
 */
export function makeRevolverViewModel(camera, {
  skin = SILVERCASE_PROSPECT_PRESENTATION.model.skin,
  sleeve = SILVERCASE_PROSPECT_PRESENTATION.model.jacketColour,
  shirtCuff = SILVERCASE_PROSPECT_PRESENTATION.model.shirtAccent,
} = {}) {
  const group = new THREE.Group();
  group.name = 'silvercase.viewmodel';

  const gun = makeBigRevolver({ scale: 0.85 });
  gun.position.set(0, -0.02, -0.03);
  group.add(gun);

  const viewArm = makeSilverCaseProspectViewArm({ skin, sleeve, shirtCuff });
  group.add(viewArm);

  // Bottom-right of frame, angled slightly inward — close enough to read as
  // held, far enough not to eat the subtitles.
  const REST = new THREE.Vector3(0.2, -0.21, -0.44);
  const HIDDEN = new THREE.Vector3(0.26, -0.6, -0.32);

  group.visible = false;
  group.position.copy(HIDDEN);
  camera.add(group);

  let drawn = false;
  let drawT = 0;
  let recoil = 0;

  return {
    group,
    gun,
    viewArm,
    get drawn() { return drawn; },
    /** Bring it up. Idempotent — asking twice does not restart the draw. */
    draw() {
      if (drawn) return false;
      drawn = true;
      drawT = 0;
      group.visible = true;
      group.position.copy(HIDDEN);
      return true;
    },
    /** Put it away. */
    holster() {
      drawn = false;
      drawT = 0;
      recoil = 0;
      group.visible = false;
      group.position.copy(HIDDEN);
      group.rotation.set(0, 0, 0);
    },
    /** One shot's worth of kick. */
    fire() {
      recoil = 1;
    },
    update(dt) {
      if (drawn) {
        drawT = Math.min(1, drawT + dt * 3.6);
        const e = drawT * drawT * (3 - 2 * drawT);
        group.position.lerpVectors(HIDDEN, REST, e);
        group.rotation.set(-0.12 * (1 - e) + recoil * 0.3, 0.06, -0.95 * (1 - e));
        group.position.z += recoil * 0.07;
        group.position.y += recoil * 0.02;
      }
      recoil = Math.max(0, recoil - dt * 5.5);
    },
  };
}

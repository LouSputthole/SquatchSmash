import * as THREE from 'three';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import {
  DEATHMEGATRON_HEIST,
  NUMBSKULL,
  RIPPINFLOW_HEIST,
  SHUBENATOR,
  SNOW,
} from '../core/wardrobe.js';
import { WEAPON_IDS, buildWeaponModel, mountCharacterWeapon } from '../core/weapons/index.js';
import { HeistFigure } from './people.js';
import { makeBalaclava, makePlateCarrier } from './weapons.js';

/**
 * The five people Tony goes in with.
 *
 * They were built from `src/core/person.js` — the Sasquatch Smash rig, 2.56 m
 * to the top of the hair — which is the whole of the owner's *"Everyone is
 * giant"* note. They are now `makePerson` figures on the campaign's shared
 * 1.78 m frame with authored heights, the same builder the Bing, the Silver
 * Room and (since yesterday) The Silver Case all use, and they stand next to
 * 1.6–1.9 m bank customers without looking like a different species.
 *
 * Identity is unchanged: `src/core/characters.js` still owns who these people
 * are, they are still human before the Initiation, and the check that says so
 * still throws if anybody edits the registry.
 */

export const HEIST_CREW_IDS = Object.freeze([
  CHARACTER_IDS.PROSPECT,
  CHARACTER_IDS.SNOW,
  CHARACTER_IDS.RIPPINFLOW,
  CHARACTER_IDS.SHUBENATOR,
  CHARACTER_IDS.DEATHMEGATRON,
  CHARACTER_IDS.NUMBSKULL,
]);

/**
 * Presentation per crew member, on the shared builder's own vocabulary.
 *
 * The body underneath the job gear is canonical. Snow, Shubes and Numbskull
 * use their base wardrobe objects directly; Rippinflow and DeathMegatron use
 * named THE TAKE clothing variants that spread those same bodies. The scene
 * adds the photographed face, role-coloured plate carrier, weapon and mask.
 * No mission-local height, build or identity is authored here.
 */
export const HEIST_CREW_PRESENTATION = Object.freeze({
  [CHARACTER_IDS.SNOW]: Object.freeze({
    face: 'assets/faces/snow.png', shirtDark: 0x20252c, model: SNOW,
  }),
  [CHARACTER_IDS.RIPPINFLOW]: Object.freeze({
    face: 'assets/faces/rippinflow.png', shirtDark: 0x252720, model: RIPPINFLOW_HEIST,
  }),
  [CHARACTER_IDS.SHUBENATOR]: Object.freeze({
    face: 'assets/faces/shubes.png', shirtDark: 0x171c26, model: SHUBENATOR,
  }),
  [CHARACTER_IDS.DEATHMEGATRON]: Object.freeze({
    face: 'assets/faces/deathmegatron.png', shirtDark: 0x201d1a, model: DEATHMEGATRON_HEIST,
  }),
  // No canonical photo is present for Numbskull. The shared builder's
  // procedural head is the deliberate fallback; another person's identity is
  // never used. He keeps the round glasses that are his read across scenes.
  [CHARACTER_IDS.NUMBSKULL]: Object.freeze({
    face: null,
    shirtDark: 0x24262a,
    proceduralFace: Object.freeze({ treatment: 'round_glasses', brows: true, nose: true }),
    model: NUMBSKULL,
  }),
});

const PHASE_FOCUS = Object.freeze({
  safehouse: Object.freeze({ x: 0, z: 0.2 }),
  van: Object.freeze({ x: 0, z: -3.1 }),   // unused: see the van case below
  bank: Object.freeze({ x: 0, z: -7 }),
  street: Object.freeze({ x: 0, z: 5 }),
  garage: Object.freeze({ x: 0, z: -8 }),
  driving: Object.freeze({ x: 20, z: -652 }),
});

export function crewHeadingForPhase(phaseId, position) {
  /* THE VAN IS NOT A FOCUS POINT.
   *
   * Owner: *"they are all ... looking foward at the same spot"*. Literally
   * true — every phase pointed every crew member at one authored coordinate,
   * and the van's was the rear doors, so five men on two facing benches all
   * stared down the same aisle at the same square metre of door.
   *
   * A bench seat faces ACROSS, at the man opposite. That is where a body
   * points; where the head points is `HeistFigure.setIdleLook`'s business,
   * and it moves. */
  if (phaseId === 'van') return position.x < 0 ? Math.PI / 2 : -Math.PI / 2;
  const focus = PHASE_FOCUS[phaseId] ?? PHASE_FOCUS.safehouse;
  return Math.atan2(focus.x - position.x, focus.z - position.z);
}

/**
 * `makePerson`'s photo heads go through `THREE.TextureLoader`, which needs a
 * DOM. The scale gate builds this crew in Node, so the photograph is asked for
 * only where there is a document to paint it on; the browser always gets it,
 * and the headless build falls back to the same procedural head Numbskull uses.
 */
const CAN_PAINT_FACES = typeof document !== 'undefined';

const ROLE_BY_ID = Object.freeze({
  [CHARACTER_IDS.SNOW]: 'leader',
  [CHARACTER_IDS.RIPPINFLOW]: 'driver',
  [CHARACTER_IDS.SHUBENATOR]: 'technical',
  [CHARACTER_IDS.DEATHMEGATRON]: 'heavy',
  [CHARACTER_IDS.NUMBSKULL]: 'control',
});

/**
 * A gun in the hands, not on the shirt.
 *
 * Owner, playtest 2026-09-02: *"our main ensemble cast is not holding their
 * guns the right way. So let's just kinda fix the way they're holding their
 * guns."* Measured, and they were not holding them at all: `slingWeapon` put
 * the model on `parts.body` at a hand-authored Euler with no roll, so the
 * carbine was a box on the sternum and the arms hung empty beside it -- the
 * same class of thing as the Siege's *"upside down"* guns, one stage worse.
 *
 * The catalog models now go through the shared character mount (bore down the
 * forearm, sights on the back of the hand, the real grip in the palm) exactly
 * as every police officer in this scene already does, and `HeistFigure.lowReady`
 * puts the arms where a gun is carried between rooms. The strap stays: a
 * carbine on a sling is still on a sling when it is in the hands.
 */
function armCrewMember(figure, heavy) {
  const weaponId = heavy ? WEAPON_IDS.CARBINE : WEAPON_IDS.PISTOL9;
  const weapon = buildWeaponModel(weaponId);
  const name = heavy ? 'crew-carbine' : 'crew-sidearm';
  if (!mountCharacterWeapon(figure, weaponId, weapon, { name })) {
    throw new Error(`${figure.root.name} cannot hold a ${weaponId}`);
  }
  figure.root.userData.weapon = weapon;
  figure.root.userData.weaponId = weaponId;
  figure.lowReady();
  // A strap over the shoulder, so the gun is carried rather than floating.
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.62, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x3d4238, roughness: 1 }),
  );
  strap.name = 'crew-weapon-sling';
  strap.position.set(0.04, 1.3, 0.06);
  strap.rotation.z = 0.5;
  figure.parts.body.add(strap);
  return weapon;
}

/**
 * A plate carrier over the work shirt: this crew is dressed for the job.
 *
 * The modelled one out of `./weapons.js` — the same carrier the player takes
 * off the safehouse stand, so the thing he puts on is visibly the thing the
 * other five are wearing. It used to be a 0.44 m box with three pouches on it.
 */
function addPlateCarrier(figure, colour) {
  const vest = makePlateCarrier({ colour, loaded: true });
  vest.name = 'crew-plate-carrier';
  vest.position.set(0, 1.24, 0.015);
  vest.scale.setScalar(1.02);
  figure.parts.body.add(vest);
  return vest;
}

export function buildHeistCrew(scene) {
  const actors = new Map();
  const positions = [
    [CHARACTER_IDS.SNOW, -3.4, -1.2],
    [CHARACTER_IDS.RIPPINFLOW, -1.7, -2.4],
    [CHARACTER_IDS.SHUBENATOR, 0, -2.6],
    [CHARACTER_IDS.DEATHMEGATRON, 1.8, -2.3],
    [CHARACTER_IDS.NUMBSKULL, 3.5, -1.1],
  ];
  for (const [id, x, z] of positions) {
    const identity = getCharacter(id);
    if (identity?.species !== 'human') throw new Error(`${id} must remain human before Initiation`);
    const presentation = HEIST_CREW_PRESENTATION[id];
    const heading = crewHeadingForPhase('safehouse', { x, z });
    const figure = new HeistFigure({
      name: `crew-${id}`,
      x, z, yaw: heading, tier: 'hero', role: 'crew',
      model: {
        ...presentation.model,
        bandana: false,
        glasses: presentation.proceduralFace?.treatment === 'round_glasses'
          || presentation.model.glasses === true,
        face: CAN_PAINT_FACES ? (presentation.face ?? null) : null,
      },
    });
    addPlateCarrier(figure, presentation.shirtDark);
    armCrewMember(figure, id === CHARACTER_IDS.DEATHMEGATRON || id === CHARACTER_IDS.SNOW);
    figure.root.userData.characterId = id;
    figure.root.userData.subtitleName = identity.subtitleName;
    if (presentation.proceduralFace) {
      figure.root.userData.proceduralFace = presentation.proceduralFace;
    }
    // A person-sized look volume, so naming a crew member does not depend on
    // getting the crosshair onto a forearm.
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.85, 0.7),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    proxy.name = `crew-${id}-proxy`;
    proxy.position.y = 0.95;
    // See `HeistCombatAdapter.trace`: aim volume, never a contact surface.
    proxy.userData.aimProxy = true;
    figure.root.add(proxy);
    scene.add(figure.root);
    actors.set(id, {
      id,
      identity,
      figure,
      group: figure.root,
      heading,
      height: figure.height,
      role: ROLE_BY_ID[id],
      injury: 'none',
      carrying: null,
      masked: false,
    });
  }
  return actors;
}

/**
 * The mask goes on, and the head goes under it.
 *
 * TWO THINGS, and the second is half the owner's *"masks still look like shit
 * over the square block heads"*. The first is the mask's own shape, which
 * `makeBalaclava` now cuts for a slab skull instead of an egg. The second is
 * that a hood COVERS a head: hair, ears, brows, a nose and a photographed
 * face all carried on regardless underneath it, and the ears alone stand
 * 0.111 out from centre against wool at 0.101 — so two skin-coloured tabs
 * poked out of the sides of every mask in the van.
 *
 * Anything on the head that is not the mask and not the neck goes dark while
 * the mask is down, and comes back when it goes up. The neck stays because
 * the skirt goes down inside the collar and the throat is what it lands on.
 */
export function setCrewMasked(actors, masked) {
  for (const actor of actors.values()) {
    actor.masked = masked;
    const head = actor.figure.parts.head;
    let mask = actor.group.getObjectByName('heist-mask');
    if (!mask) {
      mask = makeBalaclava({ rolled: false });
      mask.name = 'heist-mask';
      /* Head-local, on the SKULL CENTRE and unscaled. It used to sit at 0.17
       * scaled to 0.92, which shrank a mask that was already the wrong shape
       * to smaller than the head inside it. */
      mask.position.set(0, HEAD_SKULL_CENTRE_Y, 0);
      mask.scale.setScalar(1);
      head.add(mask);
    }
    mask.visible = masked;
    for (const child of head.children) {
      if (child === mask || child.name === 'person.neck') continue;
      child.visible = !masked;
    }
  }
}

/**
 * Where `makePerson` puts the middle of the skull, in head-local metres.
 *
 * The photographed skull is centred at 0.168 and the procedural one at 0.165;
 * this is the middle of those, which is inside the 8 mm of wool either way.
 */
const HEAD_SKULL_CENTRE_Y = 0.167;

export function updateCrew(actors, dt) {
  for (const actor of actors.values()) {
    actor.figure.update(dt, { fear: actor.injury === 'moderate' ? 0.25 : 0 });
  }
}

/** Every crew figure's real height, for the scale gate. */
export function crewHeights(actors) {
  return [...actors.values()].map((actor) => actor.height);
}

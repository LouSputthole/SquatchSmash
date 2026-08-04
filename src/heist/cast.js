import * as THREE from 'three';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { HeistFigure } from './people.js';
import { makeBalaclava, makeHeistCarbine, makeHeistSidearm } from './weapons.js';

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
 * Heights are the campaign's: DeathMegatron is the big one at 1.88, Snow reads
 * lean at 1.79, Numbskull is the shortest man in the van. Faces are the
 * supplied photographs, as the character bible requires for named members.
 */
export const HEIST_CREW_PRESENTATION = Object.freeze({
  [CHARACTER_IDS.SNOW]: Object.freeze({
    face: 'assets/faces/snow.png', shirt: 0x313740, shirtDark: 0x20252c,
    model: Object.freeze({ height: 1.79, build: 1.08, dress: 'work', hair: 'crop' }),
  }),
  [CHARACTER_IDS.RIPPINFLOW]: Object.freeze({
    face: 'assets/faces/rippinflow.png', shirt: 0x3d4039, shirtDark: 0x252720,
    model: Object.freeze({ height: 1.77, build: 1.02, dress: 'work', hair: 'tied' }),
  }),
  [CHARACTER_IDS.SHUBENATOR]: Object.freeze({
    face: 'assets/faces/shubes.png', shirt: 0x2d3440, shirtDark: 0x171c26,
    model: Object.freeze({ height: 1.81, build: 1.05, dress: 'work', hair: 'short' }),
  }),
  [CHARACTER_IDS.DEATHMEGATRON]: Object.freeze({
    face: 'assets/faces/deathmegatron.png', shirt: 0x38332f, shirtDark: 0x201d1a,
    model: Object.freeze({ height: 1.88, build: 1.3, dress: 'work', hair: 'bald', beard: true }),
  }),
  // No canonical photo is present for Numbskull. The shared builder's
  // procedural head is the deliberate fallback; another person's identity is
  // never used. He keeps the round glasses that are his read across scenes.
  [CHARACTER_IDS.NUMBSKULL]: Object.freeze({
    face: null,
    shirt: 0x3f4247,
    shirtDark: 0x24262a,
    hair: 0x3a2a1e,
    proceduralFace: Object.freeze({ treatment: 'round_glasses', brows: true, nose: true }),
    model: Object.freeze({
      height: 1.72, build: 1.0, dress: 'work', hair: 'receding',
      hairColour: 0x3a2a1e, glasses: true,
    }),
  }),
});

const PHASE_FOCUS = Object.freeze({
  safehouse: Object.freeze({ x: 0, z: 0.2 }),
  van: Object.freeze({ x: 0, z: -3.1 }),
  bank: Object.freeze({ x: 0, z: -7 }),
  street: Object.freeze({ x: 0, z: 5 }),
  garage: Object.freeze({ x: 0, z: -8 }),
  driving: Object.freeze({ x: 20, z: -652 }),
});

export function crewHeadingForPhase(phaseId, position) {
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

/** Slung across the chest, which is where a carbine lives between rooms. */
function slingWeapon(figure, heavy) {
  const weapon = heavy ? makeHeistCarbine({ sling: true }) : makeHeistSidearm();
  weapon.name = heavy ? 'crew-carbine' : 'crew-sidearm';
  weapon.scale.setScalar(heavy ? 1 : 1.15);
  weapon.position.set(0.16, 1.14, 0.2);
  weapon.rotation.set(0.1, -0.35, heavy ? -0.55 : -0.2);
  figure.parts.body.add(weapon);
  // A strap over the shoulder, so the gun is carried rather than floating.
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.62, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x3d4238, roughness: 1 }),
  );
  strap.position.set(0.04, 1.3, 0.06);
  strap.rotation.z = 0.5;
  figure.parts.body.add(strap);
  return weapon;
}

/** A plate carrier over the work shirt: this crew is dressed for the job. */
function addPlateCarrier(figure, colour) {
  const vest = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.44, 0.3),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }),
  );
  vest.name = 'crew-plate-carrier';
  vest.position.set(0, 1.26, 0);
  figure.parts.body.add(vest);
  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.14, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x4e5548, roughness: 1 }),
    );
    pouch.position.set(i * 0.13, 1.12, 0.17);
    figure.parts.body.add(pouch);
  }
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
      x, z, yaw: heading, tier: 'hero',
      model: {
        ...presentation.model,
        shirt: presentation.shirt,
        skin: 0xd2a074,
        bandana: false,
        face: CAN_PAINT_FACES ? (presentation.face ?? null) : null,
      },
    });
    addPlateCarrier(figure, presentation.shirtDark);
    slingWeapon(figure, id === CHARACTER_IDS.DEATHMEGATRON || id === CHARACTER_IDS.SNOW);
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

export function setCrewMasked(actors, masked) {
  for (const actor of actors.values()) {
    actor.masked = masked;
    let mask = actor.group.getObjectByName('heist-mask');
    if (!mask) {
      mask = makeBalaclava({ rolled: false });
      mask.name = 'heist-mask';
      // Head-local: the skull's centre is at 0.165 with its front at +0.10.
      mask.position.set(0, 0.17, 0.005);
      mask.scale.setScalar(0.92);
      actor.figure.parts.head.add(mask);
    }
    mask.visible = masked;
  }
}

export function updateCrew(actors, dt) {
  for (const actor of actors.values()) {
    actor.figure.update(dt, { fear: actor.injury === 'moderate' ? 0.25 : 0 });
  }
}

/** Every crew figure's real height, for the scale gate. */
export function crewHeights(actors) {
  return [...actors.values()].map((actor) => actor.height);
}

import * as THREE from 'three';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { Person } from '../core/person.js';

export const HEIST_CREW_IDS = Object.freeze([
  CHARACTER_IDS.PROSPECT,
  CHARACTER_IDS.SNOW,
  CHARACTER_IDS.RIPPINFLOW,
  CHARACTER_IDS.SHUBENATOR,
  CHARACTER_IDS.DEATHMEGATRON,
  CHARACTER_IDS.NUMBSKULL,
]);

const PRESENTATION = Object.freeze({
  [CHARACTER_IDS.SNOW]: { face: 'assets/faces/snow.png', shirt: 0x313740, shirtDark: 0x20252c },
  [CHARACTER_IDS.RIPPINFLOW]: { face: 'assets/faces/rippinflow.png', shirt: 0x3d4039, shirtDark: 0x252720 },
  [CHARACTER_IDS.SHUBENATOR]: { face: 'assets/faces/shubes.png', shirt: 0x2d3440, shirtDark: 0x171c26 },
  [CHARACTER_IDS.DEATHMEGATRON]: { face: 'assets/faces/deathmegatron.png', shirt: 0x38332f, shirtDark: 0x201d1a },
  // No canonical photo is present for Numbskull. Person's procedural human
  // head is the deliberate fallback; another person's identity is never used.
  [CHARACTER_IDS.NUMBSKULL]: { face: null, shirt: 0x3f4247, shirtDark: 0x24262a, hair: 0x3a2a1e },
});

function weaponMesh(heavy = false) {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x17191b });
  const steel = new THREE.MeshStandardMaterial({ color: 0x353b3e, metalness: 0.72, roughness: 0.35 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.72 : 0.58, 0.12, 0.12), steel);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.045), dark);
  barrel.position.x = 0.54;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.1), dark);
  stock.position.x = -0.47;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.09), steel);
  mag.position.set(0.05, -0.17, 0);
  group.add(receiver, barrel, stock, mag);
  group.rotation.set(0.15, 0, -0.18);
  group.position.set(0.35, 1.35, 0.32);
  return group;
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
    const person = new Person({ ...PRESENTATION[id], bandana: null, pants: 0x20242a });
    person.position.set(x, 0, z);
    person.group.rotation.y = Math.PI;
    person.group.add(weaponMesh(id === CHARACTER_IDS.DEATHMEGATRON));
    person.group.userData.characterId = id;
    person.group.userData.subtitleName = identity.subtitleName;
    scene.add(person.group);
    actors.set(id, {
      id,
      identity,
      person,
      group: person.group,
      role: {
        [CHARACTER_IDS.SNOW]: 'leader',
        [CHARACTER_IDS.RIPPINFLOW]: 'driver',
        [CHARACTER_IDS.SHUBENATOR]: 'technical',
        [CHARACTER_IDS.DEATHMEGATRON]: 'heavy',
        [CHARACTER_IDS.NUMBSKULL]: 'control',
      }[id],
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
      mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.34, 0.04),
        new THREE.MeshLambertMaterial({ color: 0x101113 }),
      );
      mask.name = 'heist-mask';
      mask.position.set(0, 2.26, 0.265);
      actor.group.add(mask);
    }
    mask.visible = masked;
  }
}

export function updateCrew(actors, dt) {
  const still = new THREE.Vector3();
  for (const actor of actors.values()) actor.person.update(dt, still, 0);
}

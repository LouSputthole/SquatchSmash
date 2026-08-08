import * as THREE from 'three';
import { CHARACTER_IDS } from '../../core/campaign.js';
import { getCharacter } from '../../core/characters.js';
import { SILVERCASE_APE_OUTFIT } from './ape.js';

const PROSPECT = getCharacter(CHARACTER_IDS.PROSPECT);

/**
 * Tony's Silver Case presentation.
 *
 * The campaign registry owns who he is. The scene owns the Pulp Fiction suit,
 * and deliberately leaves `face` null: Tony has no supplied canonical face
 * asset, so this mission must not invent one just to satisfy a costume pass.
 */
export const SILVERCASE_PROSPECT_PRESENTATION = Object.freeze({
  characterId: PROSPECT.id,
  canonicalName: PROSPECT.canonicalName,
  subtitleName: PROSPECT.subtitleName,
  voiceProfile: PROSPECT.voiceProfile,
  face: null,
  model: Object.freeze({
    height: 1.79,
    build: 1.0,
    skin: 0xd2a074,
    hair: 'short',
    hairColour: 0x3a2a20,
    ...SILVERCASE_APE_OUTFIT,
  }),
});

/**
 * The part of Tony's suit a first-person mission can honestly put on screen.
 * His black jacket sleeve stops behind a separate white shirt cuff and the
 * existing hand. `makeRevolverViewModel` mounts this group around the gun;
 * keeping it independent makes the costume a real inspectable visual contract
 * instead of a comment about a body the first-person camera never renders.
 */
export function makeSilverCaseProspectViewArm({
  skin = SILVERCASE_PROSPECT_PRESENTATION.model.skin,
  sleeve = SILVERCASE_PROSPECT_PRESENTATION.model.jacketColour,
  shirtCuff = SILVERCASE_PROSPECT_PRESENTATION.model.shirtAccent,
} = {}) {
  const group = new THREE.Group();
  group.name = 'silvercase.viewmodel.prospect-arm';
  group.userData.characterPresentation = {
    id: SILVERCASE_PROSPECT_PRESENTATION.characterId,
    face: SILVERCASE_PROSPECT_PRESENTATION.face,
    sceneOutfit: 'black_suit_white_shirt_black_tie',
  };

  const hand = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.11, 0.1),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 }),
  );
  hand.name = 'silvercase.viewmodel.hand';
  hand.position.set(0, -0.06, 0.075);
  hand.rotation.x = -0.42;
  group.add(hand);

  const cuff = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.055),
    new THREE.MeshStandardMaterial({ color: shirtCuff, roughness: 0.9 }),
  );
  cuff.name = 'silvercase.viewmodel.shirt-cuff';
  cuff.position.set(0.004, -0.108, 0.132);
  cuff.rotation.x = -0.34;
  group.add(cuff);

  const suitSleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.11, 0.16),
    new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.92 }),
  );
  suitSleeve.name = 'silvercase.viewmodel.suit-sleeve';
  suitSleeve.position.set(0.004, -0.14, 0.222);
  suitSleeve.rotation.x = -0.3;
  group.add(suitSleeve);

  return group;
}

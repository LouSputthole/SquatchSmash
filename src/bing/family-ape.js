import { CHARACTER_IDS } from '../core/campaign.js';

/**
 * Ape's canonical cross-scene presentation.
 *
 * Keep this row outside the room-specific roster so every scene that hosts
 * Ape can use the same body, clothes and supplied face without importing the
 * Bing's dialogue tree. Position and behaviour remain owned by each room.
 */
export const APE_FAMILY_MEMBER = Object.freeze({
  id: CHARACTER_IDS.APE,
  name: 'Ape',
  slug: 'ape',
  photo: 'ape.png',
  spot: Object.freeze({
    x: -11.35,
    z: 8.33,
    yaw: -2.2,
    job: 'stand',
    folded: true,
  }),
  model: Object.freeze({
    height: 1.88,
    build: 1.3,
    dress: 'tee',
    shirt: 0x14141a,
    hair: 'crop',
    hairColour: 0x14100e,
    beard: true,
    skin: 0x8d5a3a,
    // He is the one who does the work; boots and a belt, and nothing else.
    belt: 'leather',
  }),
});

export const APE_FACE_URL = `assets/faces/${APE_FAMILY_MEMBER.photo}`;

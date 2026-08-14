import { CHARACTER_IDS } from '../core/campaign.js';

/**
 * Ape's canonical cross-scene presentation.
 *
 * Keep this row outside the room-specific roster so every scene that hosts
 * Ape can use the same body, clothes and supplied face without importing the
 * Bing's dialogue tree. Position and behaviour remain owned by each room.
 *
 * Owner, wardrobe pass 2026-08-13: give him more detail. "Boots and a belt,
 * and nothing else" was deliberate in the first cut — the detail budget went
 * to the people behind desks — but THE ROASTER is somebody the player stands
 * in front of, and this is the same escalation Lou's tux and Booski's knit
 * already went through. The pieces: `trim` puts a placket, buttons and a
 * collar on the dark tee (a documented `makePerson` combination — see the
 * gate in cast.js — that turns a coloured torso into a shirt with a front);
 * `workVest` lays the open canvas layer over it with the same `frontPanel`
 * technique the camp shirt uses, so it drapes on him instead of floating in
 * front of him; and the thin silver chain and silver watch are Rippinflow's
 * established vocabulary for "elevated Family, not a founder" — never the
 * five founders' gold. Bare arms and the open-elbow guard stance stay: he is
 * still the one who does the work, just dressed like it.
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
    // A shirt front on the tee: placket, buttons, collar. See the note above.
    trim: true,
    // The open canvas layer over it, with the snaps and the breast pocket.
    workVest: true,
    workVestColour: 0x33362a,
    // Boots and a belt, same as always — `trim` also earns the toecap and
    // laces the shoe builder gates on it.
    belt: 'leather',
    // A thin silver line and a plain silver watch: the non-founder metal.
    chain: 'silver',
    pendant: false,
    watch: 'silver',
  }),
});

export const APE_FACE_URL = `assets/faces/${APE_FAMILY_MEMBER.photo}`;

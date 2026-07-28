/**
 * Player-supplied wall art ("squatch gear").
 *
 * Drop images into assets/art/ and list them in assets/art/manifest.json.
 * Every wall slot named there gets the real image; slots without a file fall
 * back to a procedurally drawn poster so no wall is ever blank.
 *
 * Slots are declared by apartment.js — see WALL_SLOTS there for the names and
 * where each one hangs.
 */
import * as THREE from 'three';
import { posterPlaceholder } from './textures.js';

const ART_DIR = 'assets/art/';

const loader = new THREE.TextureLoader();

/** Placeholder art used when a slot has no image yet. */
const FALLBACKS = {
  'bed.above': () => posterPlaceholder('Sasquatch', 'PACIFIC NORTHWEST', 200),
  'bed.mid': () => posterPlaceholder('Squatch', 'ROAD TO THE MAJOR', 172),
  'bed.right': () => posterPlaceholder('Believe', 'FIELD RESEARCH', 26),
  'gap.high': () => posterPlaceholder('Gone Squatchin', 'EST. 1967', 96),
  'gap.low': () => posterPlaceholder('Under Lights', 'MAIN STAGE', 210),
  'gap.mid': () => posterPlaceholder('Focus', 'NO NOTES', 260),
  'couch.left': () => posterPlaceholder('The Roster', 'ALL OF THEM', 288),
  'couch.mid': () => posterPlaceholder('Pride', 'SAME SQUATCH', 300),
  'couch.right': () => posterPlaceholder('Jerseys', 'MATCHING', 250),
  'shelf.left': () => posterPlaceholder('Warbird', 'SOMEONE ELSE\u2019S', 200),
  'cork.above': () => posterPlaceholder('Hung High', 'ON PURPOSE', 320),
  'desk.left': () => posterPlaceholder('Squatch', 'SMASH', 8),
  'desk.right': () => posterPlaceholder('Bigfoot', 'SIGHTING NO. 44', 260),
  'desk.high': () => posterPlaceholder('Golf', 'ALLEGEDLY', 40),
  'door.side': () => posterPlaceholder('Stay Hairy', 'TRAIL CREW', 140),
  'south.a': () => posterPlaceholder('Off Season', 'TEAM BUILDING', 46),
  'south.b': () => posterPlaceholder('The Bar', 'AFTER', 18),
  'south.wide': () => posterPlaceholder('Names', 'ON THE WALL', 288),
  'south.portrait': () => posterPlaceholder('Met The Pros', 'DIPPIN DOTS', 216),
  'banner.main': () => posterPlaceholder('Squatch', 'SMASH CLUB', 18),
  'crest.round': () => posterPlaceholder('Crest', 'EST. 2021', 270),
  'shelf.photo': () => posterPlaceholder('Someone', 'YOU KNOW', 200),
  'desk.photo': () => posterPlaceholder('The Dog', 'GOOD BOY', 40),
  'fridge.magnet': () => posterPlaceholder('Magnet', 'FRIDGE', 320),
};

export async function loadGearManifest() {
  try {
    const res = await fetch(ART_DIR + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) return { art: [] };
    return await res.json();
  } catch {
    return { art: [] };
  }
}

function loadTexture(url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/**
 * Resolve every declared slot to a texture plus caption.
 * @param {string[]} slotNames
 * @returns {Promise<Map<string, {texture, title, caption, aspect, real}>>}
 */
export async function resolveGear(slotNames) {
  const manifest = await loadGearManifest();
  const bySlot = new Map();
  for (const entry of manifest.art || []) {
    if (entry.slot) bySlot.set(entry.slot, entry);
  }

  const out = new Map();
  await Promise.all(
    slotNames.map(async (slot) => {
      const entry = bySlot.get(slot);
      let texture = null;
      if (entry?.file) texture = await loadTexture(ART_DIR + entry.file);

      const real = !!texture;
      if (!texture) texture = (FALLBACKS[slot] || FALLBACKS['bed.above'])();

      const image = texture.image;
      const aspect = image && image.width && image.height
        ? image.width / image.height
        : 0.8;

      out.set(slot, {
        texture,
        real,
        title: entry?.title || 'Squatch gear',
        caption: entry?.caption || (real ? '' : 'A placeholder, until the real thing goes up.'),
        aspect,
        scale: entry?.scale ?? 1,
      });
    }),
  );
  return out;
}

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
  'west.gap': () => posterPlaceholder('Squatch', 'ROAD TO THE MAJOR', 172),
  'couch.left': () => posterPlaceholder('Believe', 'FIELD RESEARCH DIV.', 26),
  'couch.right': () => posterPlaceholder('Gone Squatchin', 'EST. 1967', 96),
  'desk.left': () => posterPlaceholder('Squatch', 'SMASH', 8),
  'desk.right': () => posterPlaceholder('Bigfoot', 'SIGHTING NO. 44', 260),
  'door.side': () => posterPlaceholder('Stay Hairy', 'TRAIL CREW', 140),
  'south.hawaii': () => posterPlaceholder('Off Season', 'TEAM BUILDING', 46),
  'south.wide': () => posterPlaceholder('The Roster', 'ALL OF THEM', 288),
  'south.portrait': () => posterPlaceholder('Squatch', 'MET THE PROS', 216),
  'banner.main': () => posterPlaceholder('Squatch', 'SMASH CLUB', 18),
  'crest.round': () => posterPlaceholder('Crest', 'EST. 2021', 270),
  'shelf.photo': () => posterPlaceholder('Someone', 'YOU KNOW', 200),
  'desk.photo': () => posterPlaceholder('A Good Day', 'ALLEGEDLY', 40),
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

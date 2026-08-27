/**
 * Data contract for the weapon-report audition page.
 *
 * Candidate files intentionally live outside the production manifest until a
 * favorite is approved. The delivered ElevenLabs candidates can be compared
 * against the shipped report without editing runtime code or leaking a draft
 * into a scene; choosing a favorite remains review data, not production routing.
 */
import { WEAPON_CATALOG, WEAPON_ORDER } from './catalog.js';

export const WEAPON_AUDITION_STORAGE_KEY = 'squatchsmash.weapon-audition.v1';

export const WEAPON_AUDITION_DIRECTIONS = Object.freeze([
  Object.freeze({
    id: 'deep-cinematic',
    label: 'Deep / cinematic',
    description: 'Heavy low body, controlled tail, and enough transient to stay readable.',
  }),
  Object.freeze({
    id: 'sharp-aggressive',
    label: 'Sharp / aggressive',
    description: 'Fast hard crack, bright attack, and an unapologetic close-mic edge.',
  }),
  Object.freeze({
    id: 'mechanical-realistic',
    label: 'Mechanical / realistic',
    description: 'Report, action, and weapon mass in a physically grounded balance.',
  }),
  Object.freeze({
    id: 'indoor-concussion',
    label: 'Indoor concussion',
    description: 'Violent early reflection and room pressure without a muddy endless tail.',
  }),
  Object.freeze({
    id: 'powerful-arcade',
    label: 'Powerful arcade-realism',
    description: 'Oversized impact and clean gameplay readability: powerful and fun.',
  }),
]);

function candidateFor(id, direction) {
  const filename = `weapon.${id}.fire.${direction.id}.mp3`;
  return Object.freeze({
    id: direction.id,
    name: direction.label,
    filename,
    url: `./assets/audio/auditions/${filename}`,
    description: direction.description,
    delivered: true,
  });
}

export const WEAPON_AUDITION_WEAPONS = Object.freeze(WEAPON_ORDER.map((id) => {
  const weapon = WEAPON_CATALOG[id];
  const currentFilename = `weapon.${id}.fire.mp3`;
  return Object.freeze({
    id,
    name: weapon.name,
    short: weapon.short,
    automatic: weapon.auto === true,
    rps: weapon.rps,
    note: weapon.note,
    candidates: Object.freeze([
      Object.freeze({
        id: 'current',
        name: 'Current production sound',
        filename: currentFilename,
        url: `./assets/sfx/${currentFilename}`,
        description: 'The report currently used by the standard unsuppressed weapon profile.',
        delivered: true,
      }),
      ...WEAPON_AUDITION_DIRECTIONS.map((direction) => candidateFor(id, direction)),
    ]),
  });
}));

/** Exact trigger offsets for fair single/burst/automatic comparison. */
export function weaponAuditionOffsets(weapon, mode = 'single') {
  const rps = Math.max(0.5, Number(weapon?.rps) || 1);
  if (mode === 'single' || weapon?.automatic !== true) return Object.freeze([0]);
  const rounds = mode === 'burst' ? 4 : 12;
  const step = 1 / rps;
  return Object.freeze(Array.from({ length: rounds }, (_, index) => index * step));
}

export function weaponAuditionFavorite(raw, weaponId) {
  const choice = raw && typeof raw === 'object' ? raw[weaponId] : null;
  const weapon = WEAPON_AUDITION_WEAPONS.find((entry) => entry.id === weaponId);
  return weapon?.candidates.some((candidate) => candidate.id === choice) ? choice : 'current';
}

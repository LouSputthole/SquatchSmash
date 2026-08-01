/**
 * Exact voice identity for The Jerky Motel.
 *
 * Cue names are derived from the speaker and the words, not from array order.
 * Reordering a conversation therefore cannot make yesterday's recording play
 * over a different subtitle. Stage directions are stripped before both the
 * hash and the recording copy are produced.
 */

export const MOTEL_VOICE_PROFILE = Object.freeze({
  Prospect: 'player',
  Snow: 'snow',
  Rico: 'motel-rico',
  Chino: 'motel-chino',
  'Bathroom Seller': 'npc-male',
  Lookout: 'npc-male',
  Watcher: 'npc-male',
  Seller: 'npc-male',
  Clerk: 'npc-male',
});

export function motelSpokenWords(value) {
  return String(value ?? '')
    .replace(/<em>\s*\([^)]*\)\s*<\/em>/gi, ' ')
    .replace(/\*\([^)]*\)\*/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[—–-]\s*/, '')
    .trim();
}

export function motelVoiceSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'speaker';
}

export function motelTextHash(value) {
  let hash = 2166136261;
  for (const ch of motelSpokenWords(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Base cue (without the take suffix used by files and manifest entries). */
export function motelVoiceCue(speaker, text) {
  const words = motelSpokenWords(text);
  if (!speaker || speaker === '*' || !/[\p{L}\p{N}]/u.test(words)) return null;
  return `vo.motel.${motelVoiceSlug(speaker)}.${motelTextHash(words)}`;
}

export function motelVoiceProfile(speaker) {
  return MOTEL_VOICE_PROFILE[speaker] ?? 'npc-male';
}

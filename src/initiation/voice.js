/**
 * Stable exact-cue helpers shared by the Initiation ceremony, party dialogue,
 * runtime audio and the recording-manifest generator.
 *
 * A cue includes a hash of the words the actor actually reads. Reordering an
 * authored bank therefore cannot attach yesterday's recording to a different
 * subtitle, while rewording a line deliberately creates a new pickup.
 */

const PREFIX = 'vo.initiation';

export function spokenInitiationText(text) {
  return String(text ?? '')
    .replace(/<em>\s*\([^)]*\)\s*<\/em>/gi, ' ')
    .replace(/\*\([^)]*\)\*/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(?:\s*[—–]\s*){2,}/g, ' — ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[—–-]\s*/, '')
    .trim();
}

export function initiationLineHash(text) {
  let hash = 0x811c9dc5;
  for (const char of spokenInitiationText(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function initiationCue(scope, speaker, text) {
  const clean = spokenInitiationText(text);
  if (!clean) return null;
  const part = (value) => String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${PREFIX}.${part(scope)}.${part(speaker)}.${initiationLineHash(clean)}.1`;
}

export function initiationVoiceLine({ scope, speaker, voice, who, text, ...extra }) {
  const say = spokenInitiationText(text);
  const cue = say ? initiationCue(scope, speaker, say) : null;
  return Object.freeze({ scope, speaker, who, text, voice, cue, say, ...extra });
}

export function uniqueInitiationVoiceLines(...catalogs) {
  const unique = new Map();
  for (const line of catalogs.flat()) {
    if (!line?.cue || !line.say || !line.voice) continue;
    const prior = unique.get(line.cue);
    if (prior && (
      prior.say !== line.say
      || prior.voice !== line.voice
      || prior.scope !== line.scope
      || prior.speaker !== line.speaker
    )) {
      throw new Error(`Initiation voice cue collision: ${line.cue}`);
    }
    unique.set(line.cue, line);
  }
  return [...unique.values()];
}

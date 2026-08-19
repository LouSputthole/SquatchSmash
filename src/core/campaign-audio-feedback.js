/**
 * Small semantic audio Adapter for durable campaign beats.
 *
 * Story modules remain the authority for whether a checkpoint/completion was
 * accepted. Scenes pass that boolean here after the write; the adapter adds a
 * restrained confirmation only once per semantic id. This keeps save logic
 * free of browser/audio dependencies while preventing every scene from
 * inventing its own duplicate-prone checkpoint sound policy.
 */

export const CAMPAIGN_AUDIO_FEEDBACK_CUES = Object.freeze([
  'ui.select',
  'woo.streak',
]);

export function createCampaignAudioFeedback(audio, {
  checkpointCue = 'ui.select',
  completeCue = 'woo.streak',
} = {}) {
  if (!audio?.play) throw new TypeError('Campaign audio feedback requires audio.play');
  const announcedCheckpoints = new Set();
  const announcedCompletions = new Set();

  return Object.freeze({
    checkpoint(id, accepted = true, options = {}) {
      const key = String(id || '').trim();
      if (!accepted || !key || announcedCheckpoints.has(key)) return false;
      announcedCheckpoints.add(key);
      audio.play(checkpointCue, { volume: 0.42, rate: 0.96, ...options });
      return true;
    },

    complete(id = 'mission', accepted = true, options = {}) {
      const key = String(id || '').trim();
      if (!accepted || !key || announcedCompletions.has(key)) return false;
      announcedCompletions.add(key);
      audio.play(completeCue, { volume: 0.56, rate: 0.92, ...options });
      return true;
    },

    reset() {
      announcedCheckpoints.clear();
      announcedCompletions.clear();
    },

    get debug() {
      return {
        checkpoints: [...announcedCheckpoints],
        completions: [...announcedCompletions],
      };
    },
  });
}

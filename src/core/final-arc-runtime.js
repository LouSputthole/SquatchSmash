import { createCampaign, navigateCampaign } from './campaign.js';

/**
 * Re-open a page's existing completion card after the durable mission was
 * already committed but the player had not clicked Continue yet.
 *
 * This deliberately owns no navigation and performs no campaign write: the
 * scene supplies its established card function/local completion flag, and the
 * player still chooses the registered Continue action. Preview never exposes
 * a durable completion path.
 */
export function restoreCompletedFinalArcEntry(entry, {
  preview = false,
  restore = null,
} = {}) {
  if (preview
    || entry?.ok !== false
    || entry?.reason !== 'already_complete'
    || typeof restore !== 'function') return false;
  restore();
  return true;
}

/**
 * Bind one final-arc page to its campaign story without teaching the mission
 * about storage, URLs, or preview isolation.
 *
 * The mission still owns every playable beat. This seam only performs the
 * four cross-scene duties a standalone runtime cannot: begin the durable
 * story, claim the page that actually loaded, forward real checkpoints and
 * completion reports, and transition to the next registered scene.
 */
export function createFinalArcRuntimeSession({
  sceneId,
  spawn,
  storyFactory,
  preview = false,
  campaign = null,
  location = globalThis.location,
} = {}) {
  if (typeof sceneId !== 'string' || !sceneId) {
    throw new TypeError('A final-arc runtime session requires a sceneId');
  }
  if (!preview && typeof storyFactory !== 'function') {
    throw new TypeError('A final-arc runtime session requires a storyFactory');
  }

  const activeCampaign = preview ? null : (campaign ?? createCampaign());
  const story = preview ? null : storyFactory({ campaign: activeCampaign });
  let entry = null;
  let completed = false;

  return Object.freeze({
    preview,
    campaign: activeCampaign,
    story,

    begin() {
      if (preview) return { ok: true, preview: true, resumed: false };
      if (entry?.ok) return { ...entry, resumed: true };

      const next = story.begin();
      entry = next;
      if (next?.ok && activeCampaign.state.scene.id !== sceneId) {
        activeCampaign.enter(sceneId, { spawn });
      }
      return next;
    },

    checkpoint(id, facts) {
      if (preview || completed || typeof story.checkpoint !== 'function') return false;
      return story.checkpoint(id, facts);
    },

    complete(report) {
      if (preview || completed || typeof story.complete !== 'function') return false;
      const accepted = story.complete(report) === true;
      if (accepted) completed = true;
      return accepted;
    },

    navigate(nextSceneId, options = {}) {
      if (preview) return false;
      return navigateCampaign(activeCampaign, nextSceneId, {
        ...options,
        location: options.location ?? location,
      });
    },
  });
}

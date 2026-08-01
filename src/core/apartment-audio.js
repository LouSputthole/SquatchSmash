/**
 * Audio residency for the Apartment hub.
 *
 * The Apartment is the campaign's connective tissue: calls, radio tapes,
 * television, the PC, its games, and generic player barks can all happen
 * here. Keep that broad surface intact and remove only voice banks owned by
 * self-contained mission pages that this page can never request.
 */
import { AudioEngine } from './audio.js';
import { isBundled, loadJson } from './assets.js';
import { loadOnceRetriable } from './load-queue.js';

const SFX_DIR = 'assets/sfx/';

const APARTMENT_EXCLUDED_VO_PREFIXES = Object.freeze([
  'vo.beefrun.',
  'vo.silver.',
  'vo.bing.',
  'vo.sf.',
]);

/** True when a recorded cue can belong in the Apartment's resident bank. */
export function isApartmentPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && !APARTMENT_EXCLUDED_VO_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Build the measurable load plan from the authored manifest and file index. */
export function planApartmentAudioPreload(cues, available = null) {
  const recorded = available
    ? cues.filter((cue) => available.has(cue.file || `${cue.name}.mp3`))
    : cues;
  const wanted = recorded.filter(isApartmentPreloadCue);
  return {
    manifestTotal: cues.length,
    selected: wanted.length,
    wanted,
  };
}

/**
 * Shared Apartment playback with a scene-aware recorded-sample preload.
 * Procedural fallbacks and every public AudioEngine method remain unchanged.
 */
export class ApartmentAudioEngine extends AudioEngine {
  loadManifest() {
    return loadOnceRetriable(this, '_manifestLoadPromise', () => this._loadApartmentManifestOnce());
  }

  async _loadApartmentManifestOnce() {
    this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;
    const cues = this.manifest.sfx || [];
    let available;

    if (isBundled()) {
      available = new Set(cues
        .filter((cue) => /^data:/.test(cue.file || ''))
        .map((cue) => cue.file || `${cue.name}.mp3`));
    } else {
      const index = await loadJson(SFX_DIR, 'index.json');
      available = index ? new Set(index.files || []) : null;
      this._fileVersions = index?.versions || {};
    }

    const plan = planApartmentAudioPreload(cues, available);
    this.preloadStats = {
      manifestTotal: plan.manifestTotal,
      selected: plan.selected,
    };
    await this._loadWanted(plan.wanted);
    return { total: plan.selected, loaded: this.loadedCount };
  }
}

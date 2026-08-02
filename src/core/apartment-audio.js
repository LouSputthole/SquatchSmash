/**
 * Audio residency for the Apartment hub.
 *
 * The Apartment is the campaign's connective tissue: calls, radio tapes,
 * television, the PC, its games, and generic player barks can all happen
 * here. Keep that broad surface intact and remove only cue banks owned by
 * self-contained mission pages that this page can never request.
 */
import { AudioEngine } from './audio.js';
import { isBundled, loadJson } from './assets.js';
import { loadOnceRetriable } from './load-queue.js';

const SFX_DIR = 'assets/sfx/';

const APARTMENT_EXCLUDED_CUE_PREFIXES = Object.freeze([
  'vo.beefrun.',
  'vo.silver.',
  'vo.bing.',
  'vo.sf.',
  'vo.motel.',
  'vo.initiation.',
  'vo.bj.',
  'vo.bing2.',
  'vo.graveyard.',
  'vo.nowake.',
  'heist.',
]);

/* THE TAKE owns the broad `heist.` bank, but its homecoming cleanup is an
 * Apartment interaction and must retain those four recorded cues. */
const APARTMENT_INCLUDED_CUE_PREFIXES = Object.freeze([
  'heist.apartment.',
]);

/* First interaction must not wait for the entire hub library. These banks own
 * everything that can speak or sound automatically during the opening seconds;
 * the current radio window is supplied as exact names by Radio.preloadCueNames.
 * The remaining resident bank continues in the background once play opens. */
const APARTMENT_STARTUP_CUE_PREFIXES = Object.freeze([
  'bed.',
  'phone.',
  'vo.wake.',
  'vo.getup.',
  'heist.apartment.',
]);

/** True when a recorded cue can belong in the Apartment's resident bank. */
export function isApartmentPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (APARTMENT_INCLUDED_CUE_PREFIXES.some((prefix) => name.startsWith(prefix))
    || !APARTMENT_EXCLUDED_CUE_PREFIXES.some((prefix) => name.startsWith(prefix)));
}

/** True when a cue must be decoded before the Apartment opens for play. */
export function isApartmentStartupCue(cue, exactNames = null) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  if (!name) return false;
  const requested = exactNames instanceof Set ? exactNames : new Set(exactNames || []);
  return requested.has(name)
    || APARTMENT_STARTUP_CUE_PREFIXES.some((prefix) => name.startsWith(prefix));
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
  /** Decode the automatic opening/call/cleanup bank plus the live radio hour. */
  loadStartup({ names = [] } = {}) {
    return loadOnceRetriable(this, '_startupLoadPromise', async () => {
      const plan = await this._prepareApartmentPlan();
      const requested = new Set(names);
      const wanted = plan.wanted.filter((cue) => isApartmentStartupCue(cue, requested));
      this.startupStats = { selected: wanted.length };
      await this._loadApartmentCues(wanted, 16);
      return { total: wanted.length, loaded: this.loadedCount };
    });
  }

  loadManifest() {
    return loadOnceRetriable(this, '_manifestLoadPromise', () => this._loadApartmentManifestOnce());
  }

  async _loadApartmentManifestOnce() {
    const plan = await this._prepareApartmentPlan();
    await this._loadApartmentCues(plan.wanted, 12);
    return { total: plan.selected, loaded: this.loadedCount };
  }

  _prepareApartmentPlan() {
    return loadOnceRetriable(this, '_apartmentPlanPromise', async () => {
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
      return plan;
    });
  }

  async _loadApartmentCues(cues, concurrency) {
    this._apartmentLoadedCueFiles ??= new Set();
    const pending = cues.filter((cue) => {
      const file = cue.file || `${cue.name}.mp3`;
      return !this._apartmentLoadedCueFiles.has(`${cue.name}\0${file}`);
    });
    if (!pending.length) return;
    await this._loadWanted(pending, concurrency);
    for (const cue of pending) {
      const file = cue.file || `${cue.name}.mp3`;
      this._apartmentLoadedCueFiles.add(`${cue.name}\0${file}`);
    }
  }
}

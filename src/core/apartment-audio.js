/**
 * Audio residency for the Apartment hub.
 *
 * The Apartment is the campaign's connective tissue: calls, radio tapes,
 * television, the PC, its games, and generic player barks can all happen
 * here. Keep that broad surface intact and remove only cue banks owned by
 * self-contained mission pages that this page can never request.
 */
import { AudioEngine } from './audio.js';
import { TIME_EVENT_IDS } from './campaign.js';
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
  'vo.golf.',
  'golf.',
  'heist.',
]);

/* Silver Pines also owns a handful of effects whose names predate the
 * scene-prefix convention. None are requested by the Apartment runtime. */
const APARTMENT_EXCLUDED_CUE_NAMES = new Set([
  'ambience.course',
  'bird',
  'cart.motor',
  'mower.distant',
  'sprinkler',
  'sprinkler.tick',
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

/**
 * Beat banks whose decoded PCM can be evicted once their night has closed.
 *
 * The Apartment's resident bank is the ~480 MB of decoded audio the
 * performance doc measures, and none of it was ever released. The safe subset
 * to release is the one this list names: banks gated by a ONE-SHOT time event
 * in the campaign's exact-once ledger, which is durable proof the beat has
 * fired and can never fire again. Anything gated on a chapter alone is not
 * safe (heist_day repeats Margo's morning line, for instance), so the ledger
 * is the only authority consulted.
 *
 * Read at the chapter turn (`sleepInBed` in src/main.js) and fed to
 * `AudioEngine.forget`, which is a prefix drop, not a delete: a wrong guess
 * costs a re-decode out of the HTTP cache, never a silent line.
 */
const CLOSED_NIGHT_CUE_BANKS = Object.freeze([
  /* Margo coming home the night of the Silver Room. */
  Object.freeze({ event: TIME_EVENT_IDS.MARGO_COME_HOME, prefix: 'vo.margo.comehome.' }),
  /* Margo waking beside him on the fourth morning, and the dress-help beat
   * that only exists inside it. */
  Object.freeze({ event: TIME_EVENT_IDS.MARGO_WAKE, prefix: 'vo.margo.wake.' }),
  Object.freeze({ event: TIME_EVENT_IDS.MARGO_WAKE, prefix: 'margo.dress.' }),
]);

/** Cue prefixes that can never sound again given this exact-once ledger. */
export function closedNightCuePrefixes(timeEvents) {
  const done = new Set(timeEvents || []);
  return CLOSED_NIGHT_CUE_BANKS
    .filter((bank) => done.has(bank.event))
    .map((bank) => bank.prefix);
}

/** True when a recorded cue can belong in the Apartment's resident bank. */
export function isApartmentPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (APARTMENT_INCLUDED_CUE_PREFIXES.some((prefix) => name.startsWith(prefix))
    || (!APARTMENT_EXCLUDED_CUE_NAMES.has(name)
      && !APARTMENT_EXCLUDED_CUE_PREFIXES.some((prefix) => name.startsWith(prefix))));
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

  /**
   * Decode a named handful right now, ahead of the resident bank.
   *
   * The inherited `AudioEngine.loadAdditional` opens by awaiting
   * `_manifestLoadPromise`, which on this page is the whole Apartment library
   * filling in behind play — hundreds of files. A caller who wants four short
   * ones before a beat that starts in twenty seconds therefore gets them
   * several minutes late, or not at all. That is not hypothetical: it is why
   * the Margo dress foley had never once played since it shipped.
   *
   * The plan promise this awaits instead is only manifest.json plus
   * index.json, it is memoised, and by the time anything on this page asks for
   * a cue it has already resolved. Decoding through `_loadApartmentCues` keeps
   * the same dedupe set and file-version handling as every other load here, so
   * running alongside the background fill is safe — whichever gets there first,
   * the other skips the file.
   */
  async loadAdditional({ names = null, prefixes = [] } = {}) {
    const plan = await this._prepareApartmentPlan();
    const wanted = new Set(names || []);
    const cues = plan.wanted.filter((cue) => (
      (wanted.has(cue.name) || prefixes.some((prefix) => cue.name.startsWith(prefix)))
      && !this.buffers.has(cue.name)
    ));
    const before = this.loadedCount;
    await this._loadApartmentCues(cues, 8);
    return { total: cues.length, loaded: this.loadedCount - before };
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

/**
 * Audio residency for Front and Center.
 *
 * The shared engine knows every sound in the campaign, which is useful for
 * the apartment hub but wasteful for a self-contained evening: opening the
 * Silver Room used to decode all 1,505 samples before the title card would
 * leave. This adapter keeps the shared synthesis/playback implementation and
 * changes only which recorded samples become resident on this page.
 */
import { AudioEngine } from '../core/audio.js';
import { isBundled, loadJson } from '../core/assets.js';
import { loadOnceRetriable } from '../core/load-queue.js';

const SFX_DIR = 'assets/sfx/';

const SILVER_SHARED_CUES = new Set([
  'applause',
  'can.sip',
  'car.door',
  'chair.pull',
  'chair.sit',
  'cloth.snap',
  'cork.pop',
  'curtain.draw',
  'cutlery.set',
  'door.creak',
  'door.knob',
  'door.locked',
  'glass.set',
  'ice.drop',
  'kitchen.pan',
  'kitchen.plate',
  'light.dip',
  'mic.handle',
  'pour',
  'stage.clunk',
  'table.set',
  'tip.fold',
  'woo.down',
  'woo.streak',
  'woo.up',
]);

/** Recorded cues that this page can actually request. */
export function isSilverPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    name.startsWith('vo.silver.')
    || name.startsWith('footstep.')
    || name.startsWith('ambience.')
    || name.startsWith('band.')
    || SILVER_SHARED_CUES.has(name)
  );
}

export class SilverAudioEngine extends AudioEngine {
  loadManifest() {
    return loadOnceRetriable(this, '_manifestLoadPromise', () => this._loadSilverManifestOnce());
  }

  async _loadSilverManifestOnce() {
    this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;
    const cues = this.manifest.sfx || [];
    let availableCues;

    if (isBundled()) {
      availableCues = cues.filter((cue) => /^data:/.test(cue.file || ''));
    } else {
      const index = await loadJson(SFX_DIR, 'index.json');
      const available = index ? new Set(index.files || []) : null;
      this._fileVersions = index?.versions || {};
      availableCues = available
        ? cues.filter((cue) => available.has(cue.file || `${cue.name}.mp3`))
        : cues;
    }

    const wanted = availableCues.filter(isSilverPreloadCue);
    this.preloadStats = {
      manifestTotal: cues.length,
      selected: wanted.length,
    };
    await this._loadWanted(wanted);
    return { total: wanted.length, loaded: this.loadedCount };
  }
}

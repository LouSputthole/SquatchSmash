/**
 * Shared recorded effects requested by the Bing runtime. Keep this explicit:
 * selecting a broad campaign prefix would pull unrelated apartment/radio
 * banks back into the scene and hide new ownership mistakes.
 */
const BING_RUNTIME_CUES = new Set([
  'phone.ring',
  'phone.hangup',
  'radio.talk',
  'radio.tune',
  'slot.pull',
  'slot.reel',
  'slot.stop',
  'slot.win',
  'slot.jackpot',
  'card.deal',
  'card.flip',
  'chips.place',
  'chip.stack',
  'gun.pickup',
  'glass.set',
  'can.crack',
  'can.sip',
  'can.crush',
  'till.ring',
  'bing.money.flutter',
  'bing.line.snort',
  'door.locked',
  'door.knob',
  'door.creak',
  'alarm.chirp',
  'chair.sit',
  'rope.clip',
  'duck.quack',
  'car.door',
  'car.engine.start',
  'car.engine.idle',
  'neighbours.thump',
  'whiskey.swig',
  'whiskey.cap',
  'whiskey.pour',
  'ambience.rain',
  'ambience.bing.rain.muffled',
  'ambience.club',
  'ambience.crowd',
]);

/** Recorded cues authored specifically for either Bada Bing visit. */
export function isBingPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    name.startsWith('vo.bing.')
    || name.startsWith('vo.bj.')
    || name.startsWith('vo.slots.')
    || name.startsWith('vo.call.')
    || name.startsWith('footstep.')
    || BING_RUNTIME_CUES.has(name)
  );
}

export class BingAudioEngine extends AudioEngine {
  loadManifest({ names = [] } = {}) {
    return loadOnceRetriable(
      this,
      '_manifestLoadPromise',
      () => this._loadBingManifestOnce(names),
    );
  }

  async _loadBingManifestOnce(names = []) {
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

    const supplemental = new Set(names);
    const wanted = availableCues.filter((cue) => isBingPreloadCue(cue)
      || supplemental.has(cue.name));
    this.preloadStats = {
      manifestTotal: cues.length,
      selected: wanted.length,
    };
    await this._loadWanted(wanted);
    return { total: wanted.length, loaded: this.loadedCount };
  }
}
/**
 * Audio residency for both visits to the Bada Bing.
 *
 * The shared engine indexes the whole campaign. This adapter preserves its
 * playback, synthesis and retry behavior while decoding only recordings that
 * can be requested on this page.
 */
import { AudioEngine } from '../core/audio.js';
import { isBundled, loadJson } from '../core/assets.js';
import { loadOnceRetriable } from '../core/load-queue.js';

const SFX_DIR = 'assets/sfx/';

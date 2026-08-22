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

/**
 * The street outside, and the car that leaves it.
 *
 * Two of the owner's notes land in one place: "need more sound effects for the
 * crowd outside and the city while walking into the alley", and "the car
 * driving away needs a sound". Both were true because this page's residency
 * filter only lets four families of cue in, and every one of these is in the
 * campaign manifest already, recorded and indexed, and simply was not on the
 * list this scene is allowed to decode. Nothing new is being asked for; the
 * street just gets the sounds a street has.
 */
const SILVER_STREET_CUES = [
  // the road, and what is on it
  'street.wet.night',
  'street.car.pass.wet',
  'street.horn.distant',
  'traffic.pass',
  'car.horn',
  // the elevated line, which is what makes this a city and not a set
  'train.elevated.rumble',
  'train.elevated.roar',
  'train.elevated.sub',
  'train.rail.clatter',
  'train.horn.far',
  // and the hired car pulling off the kerb
  'car.engine.start',
  'car.engine.rev',
  'car.door.close.heavy',
];

const SILVER_SHARED_CUES = new Set([
  ...SILVER_STREET_CUES,
  'applause',
  'can.sip',
  'car.door',
  'chair.pull',
  'chair.sit',
  'cloth.snap',
  'cork.pop',
  /* The room reacting to the violinist's set (`src/silver/perform.js`, the
   * `bits` table: a whistle over the opening applause, then the laugh on the
   * wife joke). `applause` and `band.rimshot` are the other two cues in that
   * table and both were already resident -- `applause` by name here, the
   * rimshot on the `band.` prefix -- so the beat half-worked and nobody
   * heard the half that did not. Both recordings have been in the manifest,
   * in `index.json` and on disk the whole time; `core/audio.js` also carries
   * a hand-built synth stand-in for each (`case 'crowd.whistle'` /
   * `case 'crowd.laughter'`), written for this very beat before the takes
   * landed, so the page went on playing the stand-in with nothing anywhere
   * saying the real one existed. Same one-line-of-scope failure as
   * `enola.blast.*` and the mansion's own voice bank. */
  'crowd.laughter',
  'crowd.whistle',
  'curtain.draw',
  'cutlery.set',
  'door.creak',
  'door.knob',
  'door.locked',
  'glass.set',
  'ice.drop',
  /* The whole kitchen work table and the floor's little sounds, not only the
   * two cues the first pass happened to use: recordings exist for most of
   * these, and a name missing from this list is a recording nobody on this
   * page ever hears — the engine quietly plays the synth stand-in instead. */
  'kitchen.chop',
  'kitchen.chop.fast',
  'kitchen.clatter',
  'kitchen.glasses',
  'kitchen.oven',
  'kitchen.pan',
  'kitchen.plate',
  'kitchen.sizzle',
  'kitchen.steam',
  'kitchen.ticket',
  'dining.chair',
  'dining.cutlery',
  'dining.glass.clink',
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

export { SILVER_STREET_CUES };

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

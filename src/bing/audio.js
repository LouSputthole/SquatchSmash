/**
 * Shared recorded effects requested by the Bing runtime. Keep this explicit:
 * selecting a broad campaign prefix would pull unrelated apartment/radio
 * banks back into the scene and hide new ownership mistakes.
 */
const BING_RUNTIME_CUES = new Set([
  'phone.ring',
  /* Lou's texts, which are the club's only phone alert that is not a call.
   * Synth-only until a recording lands: the preload filter simply matches
   * nothing while the manifest has no file for it, and picks it up for free
   * the day it does. */
  'phone.vibrate',
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

  /* ---- License to Grill, in the store room ----
   *
   * The cord Gratin hands over, and the five things off James Blond that end
   * up on the prep table. Named one at a time, like everything else here: this
   * scene borrows a handful of recordings that were made for other rooms, and
   * borrowing has to be written down or the club decodes none of them and the
   * whip lands on a synthesised noise.
   *
   * The `bing.grill.*` names are the ones this scene has ASKED for and does
   * not have yet. Listing them costs nothing — the filter runs over cues the
   * index actually holds, so an undelivered name simply matches nothing — and
   * the day each recording lands the store room picks it up for free, exactly
   * the way `phone.vibrate` above is waiting to. Until then
   * `license-to-grill-runtime.js` plays the stand-in beside each one. */
  'bing.grill.cord.handoff',
  'bing.grill.cord.swing',
  'bing.grill.cord.whip',
  'bing.grill.cord.floor',
  'bing.grill.smash.glass',
  'bing.grill.smash.metal',
  'bing.grill.smash.fabric',
  'bing.grill.table.pickup',
  /* The execution beat (2026-08-19 playtest): Numbskull's draw, the single
   * report, and the body going slack. Asked-for like the eight above. */
  'bing.grill.gun.draw',
  'bing.grill.gun.shot',
  'bing.grill.body.slack',
  /* …and the recordings standing in for them tonight. Every one of these is
   * in `assets/sfx/index.json` — a stand-in that has no file is not a
   * stand-in, it is a synthesised noise with a comment over it. */
  'heist.gear.armor.pickup',
  'cloth.snap',
  'heist.player.hit',
  'heist.bullet.impact',
  'glass.wine.fall',
  'heist.guard.weapon.drop',
  'heist.swap.fabric',
  'heist.police.gunshot',
]);

/** Recorded cues authored specifically for either Bada Bing visit. */
export function isBingPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    name.startsWith('vo.bing.')
    /* `vo.bing2.` IS NOT `vo.bing.` PLUS A DIGIT, AND THE DOT IS WHY.
     *
     * The line above stops at its own dot, so every take authored for the
     * second visit fell outside this filter -- the enola.blast one-character
     * trap again, and the fourth time this project has shipped a recording
     * nothing decodes. It matters here because src/bing/main.js still has a
     * whole second-visit mode: `isSecondVisit` is true whenever the SAVE says
     * BADA_BING_TWO, with or without `?visit=2`, and `buildSecondVisitLouScript`
     * then plays `vo.bing2.lou.lockdown` off a bank this page never asked for.
     * The campaign itself always routes visit two to bing.html?visit=2, which
     * src/bing/router.js sends to hotdog-main.js and a scope that does cover
     * `vo.bing2.` -- but the apartment's own next-scene link and any bookmark
     * of bare bing.html do not carry the query, and a save parked on the
     * second night walks straight into this file with it.
     *
     * Widened rather than amputated: deleting the second-visit mode from
     * main.js is forty branches deep and would hand that save a FIRST visit
     * instead -- Margo on the floor, the package handed over again, a night
     * that has already happened. Seven point nine MiB of decodes on visit one
     * that visit one cannot play is the cheaper of the two mistakes, and it
     * is the one that cannot make the game silent. */
    || name.startsWith('vo.bing2.')
    || name.startsWith('vo.bj.')
    || name.startsWith('vo.slots.')
    || name.startsWith('vo.call.')
    || name.startsWith('footstep.')
    || BING_RUNTIME_CUES.has(name)
    /* The performer-bathroom beat owns its cue list (dress-help claps, the
     * men's-room door). Membership lives on the feature and is imported here
     * for the same reason this function is imported by the verifier instead
     * of mirrored: two copies of "is this cue ours" is how phone.vibrate
     * went missing. */
    || BING_PERFORMER_BATHROOM_CUES.includes(name)
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
import { BING_PERFORMER_BATHROOM_CUES } from './performer-bathroom.js';

const SFX_DIR = 'assets/sfx/';

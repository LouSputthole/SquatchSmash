/**
 * Scene-scoped audio residency, in three banks.
 *
 * The late scenes each had one blocking policy for their whole soundscape:
 * the Mansion awaited every recorded cue before the tour could begin, the
 * Enola Squatch awaited nothing at all, and the Palace awaited its finale
 * bank behind a start button whose beat is twenty minutes away. This is the
 * split the Bada Bing adapter (src/bing/audio.js) implies but never needed —
 * that page is small enough to be one bank — written once so all three
 * scenes carry it identically:
 *
 *   start      blocks the start button. The first lines and the sounds of
 *              the opening beat, and nothing else.
 *   nextBeat   kicked the moment the start bank settles — NOT awaited at
 *              boot. The scene awaits it (or reads `settled('nextBeat')`
 *              from a synchronous gate) at the boundary of the beat that
 *              needs it, so the beat cannot begin before its recordings
 *              are resident, by construction.
 *   background fully asynchronous and opportunistic: optional props,
 *              post-mission dressing, anything with no beat boundary.
 *
 * THE RULE THIS ENFORCES: no first line of any beat may ever play before
 * its recording is resident. Dispatch is a line's one chance — nothing
 * retries a line's audio (see the Mansion's own `beginTour()` history) — so
 * "resident" has to be settled at the boundary, not hoped for.
 *
 * "Settled" deliberately means ATTEMPTED-AND-FINISHED rather than
 * every-byte-decoded: a cue whose file is missing or whose decode failed is
 * already handled downstream (synth stand-ins for effects, subtitles for
 * voice), and a boundary that waits forever on a dead network is a scene
 * that soft-locks on an audio problem. A failed bank settles too; the beat
 * then begins exactly as it would have before this module existed.
 *
 * The loads themselves stay the scene's business — each bank is a loader
 * function (`audio.loadManifest(...)`, `audio.loadAdditional(...)`, or a
 * scene engine's own narrowed loader) — because the three scenes select
 * cues three different ways and this module only owns the ORDER and the
 * boundary contract.
 */

const BANKS = ['start', 'nextBeat', 'background'];

export function createResidencyBanks({ start, nextBeat = null, background = null } = {}) {
  const loaders = { start, nextBeat, background };
  /* idle -> pending -> settled, one way, per bank. */
  const state = { start: 'idle', nextBeat: 'idle', background: 'idle' };
  const promises = { start: null, nextBeat: null, background: null };
  const results = { start: null, nextBeat: null, background: null };

  function run(bank) {
    if (promises[bank]) return promises[bank];
    const loader = loaders[bank];
    /* A bank a scene did not define settles immediately: its boundary gate
     * is then always open, which is the correct reading of "this scene has
     * no such bank". */
    state[bank] = 'pending';
    promises[bank] = Promise.resolve()
      .then(() => (loader ? loader() : null))
      .catch(() => null)
      .then((result) => {
        state[bank] = 'settled';
        results[bank] = result;
        return result;
      });
    return promises[bank];
  }

  const banks = {
    /** Await this from the start button. Marks the bank pending
     * SYNCHRONOUSLY at the call, so a dispatch gate polled on the very next
     * frame already holds. */
    loadStart() {
      return run('start');
    },

    /** Fire-and-forget, called right after boot: nextBeat begins the moment
     * the start bank settles, background the moment nextBeat does — the
     * ordering keeps the sooner beat's bytes ahead of the later one's on
     * the same pipe. Returns the background promise for anything that wants
     * the whole chain. */
    kickoff() {
      return run('start')
        .then(() => run('nextBeat'))
        .then(() => run('background'));
    },

    /** THE BEAT BOUNDARY. Await this where the next beat begins; it also
     * starts the chain if nothing kicked it (a debug jump straight into a
     * late beat still loads what the beat needs). */
    whenNextBeat() {
      return run('start').then(() => run('nextBeat'));
    },

    whenBackground() {
      return banks.kickoff();
    },

    /** Every bank attempted and finished — the browser verifiers' anchor. */
    whenAllSettled() {
      return banks.kickoff();
    },

    /** The synchronous form of the boundary, for gates that cannot await
     * (zone triggers, dialogue dispatch). True only once the bank's load
     * has finished — never while it is still in flight. */
    settled(bank) {
      return state[bank] === 'settled';
    },

    /** In flight right now. `idle` is deliberately NOT pending: a page whose
     * audio never started (or failed at init) must keep speaking subtitles
     * rather than hold its beats hostage to a load nobody began. */
    pending(bank) {
      return state[bank] === 'pending';
    },

    /** Plain-numbers diagnostics, same spirit as AudioEngine.preloadStats. */
    report() {
      return Object.fromEntries(BANKS.map((bank) => [bank, {
        state: state[bank],
        result: results[bank],
      }]));
    },
  };
  return banks;
}

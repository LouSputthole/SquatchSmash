/**
 * Two records that belong to people rather than to rooms.
 *
 * Everything else in `assets/music/manifest.json` is a station or a venue
 * playlist: it is on because a radio is on. These two are cues. "Sensi Lou"
 * starts when Tony walks into Big Uncle Lou's office, and "Baby Snakes" starts
 * the first time Booskibro is properly in a scene — not when he is visible
 * across a room, but when the scene is actually about him.
 *
 * Neither recording is in the repository yet. They are deliberately NOT listed
 * in the music manifest, because `tools/check.mjs` requires every manifest
 * track to exist on disk and a missing file there is a failed build rather
 * than a missing song. Instead each cue names the file it wants and the track
 * already in the repo to fall back on, and `playSignatureTrack` swaps to the
 * fallback when the browser cannot fetch the real one. Drop `sensi-lou.mp3`
 * and `baby-snakes.mp3` into `assets/music/` and they play with no code
 * change; until then the scene sounds the way it does today.
 */
import { loadJson } from './assets.js';

const MUSIC_DIR = 'assets/music/';

/**
 * Which signature recordings have actually been delivered.
 *
 * The music manifest is the answer, because `tools/check.mjs` fails the build
 * for any manifest track whose file is not on disk — so "listed in the
 * manifest" and "the recording exists" are the same statement. Asking the
 * browser for the file and catching the failure would work too, but it would
 * cost a 404 and a console error on every visit to the club, and a scene that
 * logs errors on purpose is a scene nobody can check for errors.
 *
 * When `sensi-lou.mp3` and `baby-snakes.mp3` land, drop them in
 * `assets/music/` and add the usual one-line entry for each to
 * `assets/music/manifest.json`. Nothing else has to change.
 */
let deliveredPromise = null;

function deliveredFiles() {
  if (!deliveredPromise) {
    deliveredPromise = Promise.resolve()
      .then(() => loadJson(MUSIC_DIR, 'manifest.json'))
      .then((data) => new Set((data?.tracks || []).map((entry) => entry.file)))
      .catch(() => new Set());
  }
  return deliveredPromise;
}

/** Tests and scene teardown; the manifest is read once per page otherwise. */
export function resetSignatureMusicCache() {
  deliveredPromise = null;
}

function cue(spec) {
  return Object.freeze(spec);
}

export const SIGNATURE_TRACKS = Object.freeze({
  /** Lou's office, the moment the door lets Tony in. */
  sensiLou: cue({
    id: 'sensi_lou',
    title: 'Sensi Lou',
    file: 'sensi-lou.mp3',
    fallbackFile: 'good-ole-days.mp3',
    trigger: 'opening the door of Big Uncle Lou’s office',
    /* Its OWN key, deliberately not `office.radio`.
     *
     * The two used to share one loop, which meant a 4.7-second sting was
     * standing in for the record playing in Lou's corner — so it repeated
     * behind a closed door all night and bled down the hallway. They are two
     * different things: the office radio is furniture, this is Tony walking
     * in. Separate keys, separate mixes, no fight over who owns the loop. */
    loopKey: 'music.sensilou',
    /* 0.242 — the owner asked for ten per cent over the 0.22 it opened at.
     *
     * It is also no longer panned. A positional cue on the office radio with a
     * 9 m falloff was audible from halfway down the hallway, which is exactly
     * what a sting must not be: you heard it coming, and by the time the door
     * was open it was already playing. It is played flat now, once, on the
     * door — see `registerDoor('lou')` in src/bing/main.js. */
    volume: 0.242,
    /* Owner-picked window, 2026-08-04: in at 5.0, out at 9.7. It is a sting on
     * the doorway rather than a record playing behind the door, so it is also
     * `loop: false` at the call site — a four-second window on repeat would be
     * a fire alarm. */
    start: 5,
    cutAt: 9.7,
  }),
  /** Booskibro's first significant appearance in a scene. */
  babySnakes: cue({
    id: 'baby_snakes',
    title: 'Baby Snakes',
    file: 'baby-snakes.mp3',
    fallbackFile: 'booskibro.mp3',
    trigger: 'Booskibro’s first significant appearance in a scene',
    loopKey: 'music.booski',
    /* 0.40, up from 0.34, on the owner's note. It is a three-second sting
     * against a muffled club record and a bar bed; at 0.34 it arrived as a
     * texture rather than as the thing that just happened. */
    volume: 0.40,
    /* Owner-picked window, 2026-08-04, widened by 0.4 s at each end on the
     * 2026-08-04 playtest: in at 18.6, out at 22.6. It used to open on 19.0
     * and stop on 22.2, and the cue now fires on the keypress that actually
     * takes the shot rather than on the pour — so the extra four tenths at the
     * head is the run-up the record needs to be underneath him by the time the
     * glass moves, and the four at the tail stops it cutting off on the
     * swallow. The window lives on the cue instead of the call site because it
     * belongs to the recording, and the full master stays on disk untrimmed. */
    start: 18.6,
    cutAt: 22.6,
  }),
  /**
   * The Beef Run's initial takeoff roll, at 45 knots.
   *
   * Owner's request, 2026-08-03, then the playtest note *"I also didn't hear
   * the cant you hear me knocking"* — because it had never been wired. The
   * settled brief lived in `assets/music/README.md` under a heading that said
   * "the note, not the implementation", and the recording is still owed, so
   * the moment was silent and nothing on the page had a hook to hang it on.
   *
   * This is the hook. Terms as agreed with the owner:
   *
   *  - **Once, on the INITIAL takeoff only.** Whispering Pines outbound. Not
   *    on the loaded El Hueso departure — which is why the trigger tests the
   *    mission PHASE rather than a one-shot flag: `rotateCalled` is
   *    deliberately reset for the second departure, and anything hung off that
   *    pattern would play the record twice.
   *  - **About three minutes**, not the whole record: `cutAt` at 180 seconds
   *    from the top. (Two minutes as first agreed; the owner's 2026-08-06
   *    playtest note moved it to "like 3 minutes".)
   *  - **Its own loop key**, so the mix ducks it against Sasole's rotation
   *    call and the departure barks instead of it joining the ambient bed.
   *
   * Until the file lands it plays the fallback, exactly as Sensi Lou and Baby
   * Snakes have been doing — the moment sounds like something rather than
   * sounding like nothing.
   */
  cantYouHearMeKnocking: cue({
    id: 'cant_you_hear_me_knocking',
    title: 'Can’t You Hear Me Knocking',
    file: 'cant-you-hear-me-knocking.mp3',
    fallbackFile: '10-drunk-cigarettes.mp3',
    trigger: 'the Beef Run’s initial takeoff roll, passing 45 knots',
    loopKey: 'music.knocking',
    /* Under a headset, two piston engines and a man talking. Low enough that
     * the rotation call still wins, high enough to be the thing that just
     * started. Wants a mix pass once the real recording is audible in place. */
    volume: 0.30,
    start: 0,
    cutAt: 180,
  }),
  /**
   * The portable radio in the Bing's store room, during License to Grill.
   *
   * Smooth spy-movie jazz, played low. It is the only thing in that room
   * treating the evening as normal, which is what makes it funny and what
   * makes it unpleasant — so it stays quiet and it never stops.
   */
  storeRoomJazz: cue({
    id: 'store_room_jazz',
    title: 'Store room spy jazz',
    file: 'spy-jazz.mp3',
    fallbackFile: 'cosmic-drift.mp3',
    trigger: 'the store room radio during License to Grill',
    loopKey: 'music.storeroom',
    volume: 0.09,
  }),
});

export function signatureTrackUrl(track) {
  return `${MUSIC_DIR}${track.file}`;
}

export function signatureFallbackUrl(track) {
  return track.fallbackFile ? `${MUSIC_DIR}${track.fallbackFile}` : null;
}

/**
 * Start a signature cue, falling back to a track that exists.
 *
 * @param {object} audio an AudioEngine
 * @param {object} track one of SIGNATURE_TRACKS
 * @param {object} [options] passed through to startMusicLoop; `key` overrides
 *   the track's own loop key, `replace` restarts an already-running loop
 * @returns {object|null} the loop handle, or null if audio was not ready
 */
export async function playSignatureTrack(audio, track, options = {}) {
  if (!audio || !track) return null;
  const {
    key = track.loopKey, replace = false, delivered: deliveredOverride, ...rest
  } = options;
  const start = replace
    ? (audio.replaceMusicLoop?.bind(audio) ?? audio.startMusicLoop?.bind(audio))
    : audio.startMusicLoop?.bind(audio);
  if (typeof start !== 'function') return null;

  // `delivered` is injectable so a test can state the fact rather than fetch it.
  const delivered = deliveredOverride ?? await deliveredFiles();
  const wanted = delivered.has(track.file)
    ? signatureTrackUrl(track)
    : signatureFallbackUrl(track);
  if (!wanted) return null;

  /* A cue's own in/out points travel with it. `rest` still wins, so a scene
   * that wants a different window on the same record can say so. Only applied
   * to the real recording — the fallback is a different track entirely and
   * these timings would land nowhere in it. */
  const window = delivered.has(track.file)
    ? { ...(track.start != null ? { start: track.start } : {}),
      ...(track.cutAt != null ? { cutAt: track.cutAt } : {}) }
    : {};
  const opts = { volume: track.volume, ambience: true, ...window, ...rest };
  return start(key, wanted, {
    ...opts,
    /* Second net. The manifest says the file is there, so this should not
     * fire; if the deploy is missing it anyway, the scene still sounds like
     * itself rather than going silent. `startMusicLoop` rather than replace,
     * because the failed handle has already released itself. */
    onError: () => {
      const fallback = signatureFallbackUrl(track);
      if (!fallback || fallback === wanted) return;
      audio.startMusicLoop?.(key, fallback, opts);
    },
  });
}

/** Every signature recording still owed to this file, for the audio ledger. */
export function pendingSignatureTracks(availableFiles = new Set()) {
  return Object.values(SIGNATURE_TRACKS)
    .filter((track) => !availableFiles.has(track.file));
}

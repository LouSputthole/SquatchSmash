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
    trigger: 'entering Big Uncle Lou’s office',
    loopKey: 'office.radio',
    volume: 0.22,
  }),
  /** Booskibro's first significant appearance in a scene. */
  babySnakes: cue({
    id: 'baby_snakes',
    title: 'Baby Snakes',
    file: 'baby-snakes.mp3',
    fallbackFile: 'booskibro.mp3',
    trigger: 'Booskibro’s first significant appearance in a scene',
    loopKey: 'music.booski',
    volume: 0.34,
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

  const opts = { volume: track.volume, ambience: true, ...rest };
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

/**
 * The credit roll: fade to black, then the crawl.
 *
 * The old credits were twenty-two lines rolling for fifteen seconds inside a
 * 260-pixel box in the corner of the recap card, which is a decoration on a
 * results screen rather than an ending. This is the ending: the recap goes,
 * the screen goes black, and then two hundred and sixty-odd credits go past on
 * the black for its authored duration.
 *
 * THE SONG. `CREDITS_MUSIC_SRC` is a slot, not an asset. It stays null until
 * the owner supplies a real track: asking the browser for a filename that is
 * not on disk turns an intentionally silent ending into a production 404.
 * Once a track lands, a browser that refuses to autoplay and a player who has
 * muted everything still end the same way -- the crawl runs on its own clock.
 * The one thing it must never do is hold the ending hostage to an audio
 * element.
 *
 * SKIPPING. Escape, or the button, or a click anywhere. Nobody gets trapped in
 * a four-minute crawl, and a crawl you cannot leave is the kind of thing this
 * project has shipped before.
 */

import { campaignCreditRoll } from './campaign-credits.js';
import { loadJson } from './assets.js';

/**
 * Where the owner's track goes.
 *
 * Deliberately outside the sfx manifest: the manifest is cues the game fires
 * during play, all of them ours, and a licensed song is neither. Set this to
 * the delivered asset path only when that file actually exists.
 *
 * The slot is now DATA-DRIVEN by preference: the owner picked the song
 * (2026-09-02: "Add the down at the bada bing as the credits song"), and the
 * moment its file lands in assets/music/ with a manifest row carrying
 * `credits: true`, `resolveCreditsMusicSrc` below finds it and the crawl
 * plays it. This constant stays the static fallback — null, and null until a
 * delivered file exists, because a src pointing at a missing asset turns an
 * intentionally silent ending into a production 404.
 */
export const CREDITS_MUSIC_SRC = null;

/**
 * The manifest-listed credits track, if one has been delivered.
 *
 * A row in assets/music/manifest.json is the delivery contract for every
 * song in the game ("drop the file AND list it" — assets/music/README.md),
 * so a listed row is a file that exists and this never requests a missing
 * asset. The row should also carry `cue: true` so the radio's programming
 * filter keeps the ending's song off the airwaves.
 */
export async function resolveCreditsMusicSrc({ load = loadJson } = {}) {
  try {
    const manifest = await load('assets/music/', 'manifest.json');
    const track = manifest?.tracks?.find?.((row) => row?.credits === true && row?.file);
    return track ? `assets/music/${track.file}` : CREDITS_MUSIC_SRC;
  } catch {
    return CREDITS_MUSIC_SRC;
  }
}

/** How long the whole crawl takes, in seconds. Roughly the length of a song. */
export const CREDITS_DURATION_S = 212;

/** The fade to black, before anything moves. Seconds. */
export const CREDITS_FADE_S = 2.4;

function required(documentRef, id) {
  const element = documentRef?.getElementById?.(id);
  if (!element) throw new Error(`Credits view is missing #${id}`);
  return element;
}

/**
 * Build the crawl's DOM from the roll data.
 *
 * Exported so a test can assert what a player would read without standing up
 * a browser: the count, the order, and that Lou's two hundred and forty are
 * all in there under his name.
 */
export function buildCreditsTrack(documentRef, track, roll = campaignCreditRoll()) {
  track.textContent = '';
  for (const entry of roll) {
    if (entry.kind === 'section') {
      const heading = documentRef.createElement('h3');
      heading.className = 'credits-section';
      heading.textContent = entry.text;
      track.appendChild(heading);
      continue;
    }
    const row = documentRef.createElement('div');
    row.className = 'credits-row';
    const role = documentRef.createElement('span');
    role.className = 'credits-role';
    role.textContent = entry.role;
    const name = documentRef.createElement('strong');
    name.className = 'credits-name';
    name.textContent = entry.name;
    row.append(role, name);
    track.appendChild(row);
  }
  return track;
}

export function createCampaignCreditsView({
  documentRef = globalThis.document,
  musicSrc,
  duration = CREDITS_DURATION_S,
} = {}) {
  const screen = required(documentRef, 'credits');
  const track = required(documentRef, 'credits-track');
  const skip = required(documentRef, 'credits-skip');

  /* Undefined means "look the song up": the manifest fetch starts now and
   * has long resolved by the time anybody finishes the campaign. An explicit
   * null (the tests, a deliberately silent build) stays silent, and a
   * resolver that never answers degrades to the silent ending it always
   * was — the crawl waits on nothing. */
  let resolvedMusicSrc = musicSrc === undefined ? CREDITS_MUSIC_SRC : musicSrc;
  if (musicSrc === undefined) {
    resolveCreditsMusicSrc().then((src) => { resolvedMusicSrc = src; }).catch(() => {});
  }

  let music = null;
  let onDone = null;
  let running = false;
  let crawlTimer = null;
  let finishTimer = null;

  function clearTimers() {
    if (crawlTimer !== null) globalThis.clearTimeout?.(crawlTimer);
    if (finishTimer !== null) globalThis.clearTimeout?.(finishTimer);
    crawlTimer = null;
    finishTimer = null;
  }

  function stopMusic() {
    if (!music) return;
    try {
      music.pause();
      music.currentTime = 0;
    } catch { /* a src that never loaded has nothing to rewind */ }
  }

  function finish() {
    if (!running) return;
    running = false;
    clearTimers();
    stopMusic();
    screen.classList.remove('showing', 'rolling');
    screen.classList.add('hidden-hard');
    screen.setAttribute('aria-hidden', 'true');
    documentRef.removeEventListener('keydown', onKey);
    onDone?.();
  }

  function onKey(event) {
    if (event.key === 'Escape' || event.key === 'Enter') finish();
  }

  skip.addEventListener('click', finish);

  return Object.freeze({
    /** Exposed for tests and for a pause menu that wants to know. */
    get running() { return running; },

    setDoneHandler(handler) {
      if (typeof handler !== 'function') throw new TypeError('Credits done handler must be a function');
      onDone = handler;
    },

    roll({ roll: rollData } = {}) {
      if (running) return;
      running = true;
      buildCreditsTrack(documentRef, track, rollData ?? campaignCreditRoll());
      track.style.setProperty('--credits-duration', `${duration}s`);

      screen.classList.remove('hidden-hard', 'rolling');
      screen.setAttribute('aria-hidden', 'false');
      /* Force the frame so the fade actually animates from transparent rather
       * than the class landing in the same paint as the reveal. */
      void screen.offsetWidth;
      screen.classList.add('showing');

      /* The crawl starts AFTER the black has arrived, not during -- credits
       * sliding up through a half-faded game read as a bug in playtest. */
      crawlTimer = globalThis.setTimeout?.(() => {
        if (!running) return;
        crawlTimer = null;
        screen.classList.add('rolling');
        if (resolvedMusicSrc && typeof globalThis.Audio === 'function') {
          try {
            music = new globalThis.Audio(resolvedMusicSrc);
            music.volume = 0.85;
            /* An autoplay refusal is a rejected promise, not an exception, and
             * an unhandled one is a console error on the ending screen. */
            music.play?.()?.catch?.(() => {});
          } catch { music = null; }
        }
      }, CREDITS_FADE_S * 1000);

      /* The animation clock, not the music file, owns completion. Missing
       * music and reduced-motion layouts still arrive at a clean ending, and
       * a player who puts the controller down is never trapped in the crawl. */
      finishTimer = globalThis.setTimeout?.(
        finish,
        (CREDITS_FADE_S * 1000) + (duration * 1000),
      );

      documentRef.addEventListener('keydown', onKey);
      /* Keep focus inside the modal without arming a native button. The final
       * initiation action is Space; focusing Skip here lets that same held key
       * synthesize a click after gameplay input releases and silently throws
       * the player past the entire ending. Deliberate keyboard users can still
       * Tab to Skip, while Escape/Enter remain the global shortcuts above. */
      screen.tabIndex = -1;
      screen.focus?.({ preventScroll: true });
    },

    end: finish,
  });
}

/**
 * The credit roll: fade to black, then the crawl.
 *
 * The old credits were twenty-two lines rolling for fifteen seconds inside a
 * 260-pixel box in the corner of the recap card, which is a decoration on a
 * results screen rather than an ending. This is the ending: the recap goes,
 * the screen goes black, and then two hundred and sixty-odd credits go past on
 * the black for as long as the song lasts.
 *
 * THE SONG. `CREDITS_MUSIC_SRC` is a slot, not an asset. The owner is
 * supplying the track, and this file must not care whether it is there yet:
 * a missing file, a browser that refuses to autoplay, and a player who has
 * muted everything all end the same way -- the crawl runs anyway, on its own
 * clock. The one thing it must never do is hold the ending hostage to an
 * audio element.
 *
 * SKIPPING. Escape, or the button, or a click anywhere. Nobody gets trapped in
 * a four-minute crawl, and a crawl you cannot leave is the kind of thing this
 * project has shipped before.
 */

import { campaignCreditRoll } from './campaign-credits.js';

/**
 * Where the owner's track goes.
 *
 * Deliberately outside the sfx manifest: the manifest is cues the game fires
 * during play, all of them ours, and a licensed song is neither. It is loaded
 * by path and its absence is not an error.
 */
export const CREDITS_MUSIC_SRC = 'assets/music/credits.mp3';

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
  musicSrc = CREDITS_MUSIC_SRC,
  duration = CREDITS_DURATION_S,
} = {}) {
  const screen = required(documentRef, 'credits');
  const track = required(documentRef, 'credits-track');
  const skip = required(documentRef, 'credits-skip');

  let music = null;
  let onDone = null;
  let running = false;

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
      globalThis.setTimeout?.(() => {
        if (!running) return;
        screen.classList.add('rolling');
        if (musicSrc && typeof globalThis.Audio === 'function') {
          try {
            music = new globalThis.Audio(musicSrc);
            music.volume = 0.85;
            /* An autoplay refusal is a rejected promise, not an exception, and
             * an unhandled one is a console error on the ending screen. */
            music.play?.()?.catch?.(() => {});
          } catch { music = null; }
        }
      }, CREDITS_FADE_S * 1000);

      documentRef.addEventListener('keydown', onKey);
      skip.focus?.({ preventScroll: true });
    },

    end: finish,
  });
}

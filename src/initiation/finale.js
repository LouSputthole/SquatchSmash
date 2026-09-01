/** The replay portal is the campaign's post-credit destination. */
export const INITIATION_REPLAY_TARGET = './preview.html';
export const INITIATION_REPLAY_LABEL = 'Click here to replay anything';

function required(documentRef, id) {
  const element = documentRef?.getElementById?.(id);
  if (!element) throw new Error(`Initiation finale is missing #${id}`);
  return element;
}

/**
 * Own the small piece of UI after the shared credit roll finishes.
 *
 * Credits decide when they are done; this module decides what happens next.
 * Keeping navigation here makes both a skipped crawl and a natural ending
 * follow the same path, without teaching the shared credits view about this
 * scene's developer-preview destination.
 */
export function createInitiationFinale({
  documentRef = globalThis.document,
  locationRef = globalThis.location,
} = {}) {
  const portal = required(documentRef, 'replay-anything');
  const button = required(documentRef, 'replay-anything-button');

  if (button.textContent?.trim() !== INITIATION_REPLAY_LABEL) {
    throw new Error(`Initiation replay button must say “${INITIATION_REPLAY_LABEL}”`);
  }

  function navigateToPreview() {
    locationRef?.assign?.(INITIATION_REPLAY_TARGET);
  }

  button.addEventListener('click', navigateToPreview);

  return Object.freeze({
    get visible() { return !portal.classList.contains('hidden-hard'); },

    showReplayPortal() {
      documentRef.exitPointerLock?.();
      portal.classList.remove('hidden-hard');
      portal.setAttribute('aria-hidden', 'false');
      button.focus?.({ preventScroll: true });
    },

    navigateToPreview,
  });
}

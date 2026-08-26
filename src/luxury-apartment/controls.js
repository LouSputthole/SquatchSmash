import { FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';

/**
 * THE LUXURY APARTMENT'S INPUT POLICY, and nothing else.
 *
 * This is the second rung of the Home Ladder, and it was built by copying the
 * starter flat's scene root -- including the part of the starter flat that had
 * ALREADY been migrated off. The luxury root carried its own pointerlockchange,
 * mousemove, keydown, keyup, mousedown, mouseup and blur listeners, its own
 * `translateKey` call, its own `player.setKey` / `clearKeys` /
 * `handleMouseMove` plumbing, and its own `player.enabled =
 * document.pointerLockElement === canvas` written out thirteen times. The
 * Scene Contract has said `canonicalBrowserInput()` since the flat was
 * declared; the code had never met it.
 *
 * So this file is the same shape as src/apartment-controls.js, for the same
 * reason and by the same rule (docs/REUSE-FIRST.md): the scene owns policy --
 * who is holding the keyboard right now, and what the authored keys mean --
 * and src/core/first-person-input.js owns capture, translated releases,
 * pointer-lock fallback and focus cleanup.
 *
 * PURE ON PURPOSE. Nothing here touches the DOM. tools/verify-scene-architecture.mjs
 * reads every `*controls.js` a scene root imports and FAILS the scene if the
 * policy Module registers a browser lifecycle listener or names a pointer-lock
 * API -- because a policy seam that reaches for the document is the duplicated
 * wiring stack again, moved one file over and harder to see.
 */

export const LUXURY_INPUT_OWNER = Object.freeze({
  /* Title card, the lift ride out, and the two timed sequences that take the
   * body away from him: sleeping and the shower. */
  DISABLED: 'disabled',
  PAUSED: 'paused',
  /* A framed SquatchOS app owns the real cursor and the real keyboard. */
  DOM_ARCADE: 'dom-arcade',
  /* Seated at the PC or the cabinet with a canvas app: relative mouse goes to
   * the machine, not to his neck. */
  RELATIVE_ARCADE: 'relative-arcade',
  /* Seated and NOT steering: blackjack, the cinema wall, the desk, the bed. */
  SEATED: 'seated',
  /* Seated or standing and still steering: the dartboard and the toilet's aim
   * mode both need the look axis, which is why `player.enabled` in the old
   * root read `(!posture || toilet.aiming || posture === 'darts')`. */
  AIMED_POSTURE: 'aimed-posture',
  WORLD: 'world',
});

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

/**
 * One authoritative answer for who owns luxury-apartment input right now.
 *
 * THE ORDER IS THE WHOLE FILE. A framed app is checked before `paused`
 * because Escape inside an iframe never reaches this page, so the pause menu
 * must not be the thing that decides; and `resting`/`showering` are checked
 * after `paused` because pausing during the eleven-and-a-half-hour sleep skip
 * is legal and pausing must win.
 */
export function luxuryInputOwner({
  phase = 'menu',
  paused = false,
  resting = false,
  showering = false,
  posture = null,
  arcadeInputMode = null,
  toiletAiming = false,
} = {}) {
  if (phase !== 'active') return LUXURY_INPUT_OWNER.DISABLED;
  if (arcadeInputMode === 'dom') return LUXURY_INPUT_OWNER.DOM_ARCADE;
  if (paused) return LUXURY_INPUT_OWNER.PAUSED;
  if (resting || showering) return LUXURY_INPUT_OWNER.DISABLED;
  if (arcadeInputMode === 'relative') return LUXURY_INPUT_OWNER.RELATIVE_ARCADE;
  if (toiletAiming || posture === 'darts') return LUXURY_INPUT_OWNER.AIMED_POSTURE;
  if (posture) return LUXURY_INPUT_OWNER.SEATED;
  return LUXURY_INPUT_OWNER.WORLD;
}

/**
 * Luxury-apartment policy plugged into the canonical browser-input Adapter.
 *
 * `adapterOptions` is spread into `createFirstPersonInput`. The scene supplies
 * the five authored routes and a state reader; capture and cleanup stay in the
 * shared Implementation.
 */
export function createLuxuryInputPolicy({
  readState,
  keyDown,
  keyUp,
  mouseMove,
  mouseDown,
  mouseUp,
  clear = () => {},
} = {}) {
  requiredFunction(readState, 'readState');
  requiredFunction(keyDown, 'keyDown');
  requiredFunction(keyUp, 'keyUp');
  requiredFunction(mouseMove, 'mouseMove');
  requiredFunction(mouseDown, 'mouseDown');
  requiredFunction(mouseUp, 'mouseUp');
  requiredFunction(clear, 'clear');

  const owner = () => luxuryInputOwner(readState());

  return Object.freeze({
    owner,
    adapterOptions: Object.freeze({
      /* The same fallback the starter flat runs, and for the same reason: this
       * page is opened inside the preview shell, and a shell that denies
       * pointer lock used to leave the whole flat unplayable. */
      captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
      dragFallbackDelayMs: 600,
      /* Capture is refused in the two places the old root refused it:
       * `requestGamePointerLock()` returned early on a framed app, and the
       * canvas click handler never fired before the title card was dismissed. */
      canEnable: () => {
        const current = owner();
        return current !== LUXURY_INPUT_OWNER.DISABLED
          && current !== LUXURY_INPUT_OWNER.DOM_ARCADE;
      },
      /* Escape must stay observable while he is sitting at the blackjack table
       * or halfway through a shower; only a framed app, which owns the real
       * keyboard, takes it away. Everything past Escape re-checks the owner
       * inside the route, exactly as the old listener re-checked the flags. */
      canHandleInput: () => {
        const current = owner();
        return current !== LUXURY_INPUT_OWNER.DISABLED
          && current !== LUXURY_INPUT_OWNER.DOM_ARCADE;
      },
      controlState: () => {
        const current = owner();
        const world = current === LUXURY_INPUT_OWNER.WORLD;
        const aimed = current === LUXURY_INPUT_OWNER.AIMED_POSTURE;
        return Object.freeze({
          playerEnabled: world || aimed,
          movementEnabled: world,
          defaultLookEnabled: world || aimed,
          /* E is not one meaning in this flat: with the phone in his hand it
           * opens the phone, at a station it sits him down, and inside the
           * dart charge it is the throw. The root routes it. */
          interactionEnabled: false,
        });
      },
      routes: Object.freeze({
        keyDown: (event, context) => keyDown(event, context),
        keyUp: (event, context) => keyUp(event, context),
        mouseMove: (event, context) => mouseMove(event, context),
        mouseDown: (event, context) => mouseDown(event, context),
        mouseUp: (event, context) => mouseUp(event, context),
      }),
      onClear: clear,
    }),
  });
}

import { FIRST_PERSON_CAPTURE_MODES } from './core/first-person-input.js';

export const APARTMENT_INPUT_OWNER = Object.freeze({
  DISABLED: 'disabled',
  TITLE: 'title',
  PAUSED: 'paused',
  COLD_OPEN: 'cold-open',
  WORLD: 'world',
  RELATIVE_ARCADE: 'relative-arcade',
  DOM_ARCADE: 'dom-arcade',
});

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

/** One authoritative answer for who owns Apartment input right now. */
export function apartmentInputOwner({
  started = false,
  paused = false,
  left = false,
  seated = false,
  domArcade = false,
  coldOpen = false,
} = {}) {
  if (left) return APARTMENT_INPUT_OWNER.DISABLED;
  // A framed page owns real DOM focus even during the cold open. When it
  // exits, inputMode becomes relative and the reveal owns the camera instead.
  if (seated && domArcade) return APARTMENT_INPUT_OWNER.DOM_ARCADE;
  if (coldOpen) return APARTMENT_INPUT_OWNER.COLD_OPEN;
  if (!started) return APARTMENT_INPUT_OWNER.TITLE;
  if (paused) return APARTMENT_INPUT_OWNER.PAUSED;
  if (seated) return APARTMENT_INPUT_OWNER.RELATIVE_ARCADE;
  return APARTMENT_INPUT_OWNER.WORLD;
}

/**
 * Apartment policy plugged into the canonical browser-input Adapter.
 *
 * The policy owns mode arbitration: world movement, the relative SquatchOS
 * cursor, direct DOM iframe focus, the camera-owned cold open and both pause
 * surfaces. The scene supplies its authored key/click actions; capture,
 * translated releases, pointer-lock fallback and focus cleanup stay in the
 * shared Adapter Implementation.
 */
export function createApartmentInputPolicy({
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

  const owner = () => apartmentInputOwner(readState());
  const captureAllowed = () => ![
    APARTMENT_INPUT_OWNER.DISABLED,
    APARTMENT_INPUT_OWNER.DOM_ARCADE,
  ].includes(owner());

  return Object.freeze({
    owner,
    adapterOptions: Object.freeze({
      captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
      dragFallbackDelayMs: 600,
      // Capture may be pre-armed by the title/resume gesture while the Player
      // defaults remain policy-disabled until gameplay actually resumes.
      canEnable: captureAllowed,
      // Parent-owned Escape/Q must remain observable when an iframe or manual
      // pause owns focus. Defaults are independently gated by controlState.
      canHandleInput: () => owner() !== APARTMENT_INPUT_OWNER.DISABLED,
      controlState: () => {
        const current = owner();
        const world = current === APARTMENT_INPUT_OWNER.WORLD;
        const relativeArcade = current === APARTMENT_INPUT_OWNER.RELATIVE_ARCADE;
        return Object.freeze({
          playerEnabled: world || relativeArcade,
          movementEnabled: world,
          // Relative arcade look is routed to SquatchOS and a 6% head drift.
          defaultLookEnabled: world,
          // Apartment E/click semantics depend on posture and held item.
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

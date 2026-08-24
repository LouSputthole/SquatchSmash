import { FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

/**
 * Shared browser-input policy for the two flight missions.
 *
 * FlightInput remains the aircraft-control Implementation. The canonical
 * first-person Adapter owns capture, on-foot Player movement, mouse look,
 * interaction release and focus cleanup. Each mission supplies only its
 * authored cockpit/gunner and special-key policy through these callbacks.
 */
export function createFlightFirstPersonPolicy({
  isActive,
  canCapture = isActive,
  isOnFoot,
  flightInput,
  lookAircraft,
  pressPrimary,
  releasePrimary,
  keyPrelude = () => {},
  beforeKeyDown = () => false,
  afterKeyDown = () => false,
  afterKeyUp = () => {},
} = {}) {
  requiredFunction(isActive, 'isActive');
  requiredFunction(canCapture, 'canCapture');
  requiredFunction(isOnFoot, 'isOnFoot');
  requiredFunction(flightInput?.keyEvent, 'flightInput.keyEvent');
  requiredFunction(lookAircraft, 'lookAircraft');
  requiredFunction(pressPrimary, 'pressPrimary');
  requiredFunction(releasePrimary, 'releasePrimary');
  requiredFunction(keyPrelude, 'keyPrelude');
  requiredFunction(beforeKeyDown, 'beforeKeyDown');
  requiredFunction(afterKeyDown, 'afterKeyDown');
  requiredFunction(afterKeyUp, 'afterKeyUp');

  const active = () => Boolean(isActive());
  return Object.freeze({
    canEnable: () => Boolean(canCapture()),
    canHandleInput: active,
    captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
    controlState: () => {
      const onFoot = Boolean(isOnFoot());
      return Object.freeze({
        playerEnabled: onFoot,
        movementEnabled: onFoot,
        lookEnabled: onFoot,
        interactionEnabled: onFoot,
      });
    },
    routes: Object.freeze({
      mouseMove(event) {
        if (isOnFoot()) return false;
        lookAircraft(event.movementX ?? 0, event.movementY ?? 0);
        return true;
      },
      mouseDown(event, { captured }) {
        if (event.button === 0 && captured) pressPrimary();
        // Canonical capture still sees this event, including drag fallback.
        return false;
      },
      mouseUp(event) {
        if (event.button === 0) releasePrimary();
        return false;
      },
      keyDown(event, { code }) {
        keyPrelude(event, code);
        if (event.repeat) return true;
        if (beforeKeyDown(event, code)) return true;
        const flightCode = flightInput.keyEvent(event, true);
        if (code === 'Space' || event.key === 'Shift' || event.key === 'Control') {
          event.preventDefault?.();
        }
        return afterKeyDown(event, { code, flightCode }) === true;
      },
      keyUp(event, { code }) {
        const flightCode = flightInput.keyEvent(event, false);
        afterKeyUp(event, { code, flightCode });
        return false;
      },
    }),
  });
}

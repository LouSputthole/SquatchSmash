import { FIRST_PERSON_MOVEMENT_CODES } from '../core/first-person-input.js';

const MOVEMENT_CODES = new Set(FIRST_PERSON_MOVEMENT_CODES);
const REPEAT_GUARDED_CODES = new Set(['KeyE', 'KeyR', 'KeyQ', 'KeyF', 'KeyG']);

export const HEIST_SLOT_KEYS = Object.freeze({
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4,
});

/**
 * Persist the exact-once answer receipt before the shared Phone stops ringing.
 * Required-save failures deliberately escape with the Phone untouched, so a
 * failed disk write cannot turn a still-pending story call into dead silence.
 */
export function answerDurablePhoneCall({ phone, persistAnswer } = {}) {
  if (!phone?.ringing || typeof persistAnswer !== 'function') return false;
  if (!persistAnswer()) return false;
  phone.press();
  return phone.inCall === true;
}

/**
 * Heist-specific policy for the canonical browser input Adapter.
 *
 * The shared Adapter owns browser events, capture, translated releases and
 * focus cleanup. This module owns only THE TAKE's vocabulary: weapon slots,
 * hostage orders, aiming, firing, and the escape-car exception where keys
 * remain meaningful without first-person camera capture.
 */
export function createHeistControlPolicy({
  state,
  player,
  interaction,
  isPreview,
  selectSlot,
  cycleSlot,
  hostageVerb,
  reload,
  dropBag,
  failPreview,
  fireWeapon,
  setAimed,
  pause,
  resumeSimulation,
  pauseMenuOpen,
  phoneRinging = () => false,
  answerPhone = () => false,
} = {}) {
  if (typeof state !== 'function') throw new TypeError('Heist controls require state()');

  const preserveMovementBinding = (event, code) => {
    if (!MOVEMENT_CODES.has(code)) return false;
    player.setKey(code, true);
    event.preventDefault?.();
    return true;
  };

  return Object.freeze({
    canEnable: () => {
      const current = state();
      return current.started && !current.paused && !current.driving && !current.completed;
    },
    canHandleInput: () => !state().paused,
    controlState: () => ({
      playerEnabled: !state().driving,
      movementEnabled: !state().driving,
      lookEnabled: !state().driving,
      // E is routed below so preview mode keeps its existing uncaptured path.
      interactionEnabled: false,
    }),
    routes: Object.freeze({
      keyDown(event, context) {
        const current = state();
        if (event.repeat && REPEAT_GUARDED_CODES.has(context.code)) return true;

        /* A ringing campaign phone is not under the crosshair. Route the
         * configured interaction action before any world target so E answers
         * from every legal position in the safehouse. */
        if (context.code === 'KeyE' && phoneRinging()) {
          answerPhone();
          return true;
        }

        const movement = preserveMovementBinding(event, context.code);
        // The escape car used keyboard input independently of pointer lock.
        if (current.driving && movement) return true;

        if (event.code in HEIST_SLOT_KEYS) {
          selectSlot(HEIST_SLOT_KEYS[event.code]);
          return true;
        }
        if (event.code === 'BracketLeft') { cycleSlot(-1); return true; }
        if (event.code === 'BracketRight') { cycleSlot(1); return true; }
        /* These four are the same bindable vocabulary REPEAT_GUARDED_CODES
         * already measures against `context.code`; reading `event.code` here
         * left a rebound order, reload or drop dead in the bank. */
        if (context.code === 'KeyE') { interaction.press(); return true; }
        if (context.code === 'KeyF') { hostageVerb('reassure'); return true; }
        if (context.code === 'KeyG') { hostageVerb('demand'); return true; }
        if (context.code === 'KeyR') { reload(); return true; }
        if (context.code === 'KeyQ') { dropBag(); return true; }
        if (event.code === 'F9' && isPreview()) { failPreview(); return true; }

        // An ordinary movement binding continues through the canonical path.
        return undefined;
      },
      keyUp(_event, context) {
        if (context.code === 'KeyE') interaction.release();
        return undefined;
      },
      mouseDown(event, context) {
        if (event.button === 0 && (context.locked || isPreview())) fireWeapon();
        if (event.button === 2) setAimed(true);
        // Let the Adapter acquire capture after processing the click.
        return undefined;
      },
      mouseUp(event) {
        if (event.button === 2) setAimed(false);
        return undefined;
      },
    }),
    onClear(reason) {
      setAimed(false);
      if (reason === 'blur' && state().started) pause();
    },
    onCaptureChange(_event, controls) {
      const current = state();
      if (!current.started || current.driving || isPreview()) return;
      if (!controls.locked) pause();
      else if (!pauseMenuOpen()) resumeSimulation();
    },
  });
}

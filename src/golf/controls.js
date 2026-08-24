import {
  FIRST_PERSON_CAPTURE_MODES,
  FIRST_PERSON_MOVEMENT_CODES,
} from '../core/first-person-input.js';

const MOVEMENT_CODES = new Set(FIRST_PERSON_MOVEMENT_CODES);

/**
 * Silver Pines policy for the canonical browser input Adapter.
 *
 * Walking is ordinary first-person control. Address and cart modes are scene
 * policy layered over that Interface: they keep the shared capture/focus/key
 * lifecycle while routing aim, swing, radio, and vehicle commands locally.
 */
export function createGolfControlPolicy({
  state,
  modes,
  player,
  interaction,
  advanceHoleTransition,
  adjustPlannedDistance,
  adjustAim,
  swingClick,
  chooseDigit,
  command,
  cancelItemUse,
  aimMouse,
  cartMouse,
} = {}) {
  if (typeof state !== 'function') throw new TypeError('Golf controls require state()');

  const hasMouseCapture = (context) => context.locked
    || (context.dragFallback && context.dragging);

  return Object.freeze({
    captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
    canEnable: () => {
      const current = state();
      return !current.paused && !current.ended && (current.running || current.booting);
    },
    // Hole-transition shortcuts intentionally work while the frame loop rests.
    canHandleInput: () => !state().paused,
    controlState: () => {
      const current = state();
      return {
        playerEnabled: current.camMode === modes.WALK,
        movementEnabled: current.camMode === modes.WALK,
        lookEnabled: current.camMode === modes.WALK,
        // Physical E has address/cart policy and is routed below.
        interactionEnabled: false,
      };
    },
    routes: Object.freeze({
      mouseDown(event, context) {
        if (event.button !== 0) return undefined;
        if (state().camMode === modes.ADDRESS) swingClick();
        else if (hasMouseCapture(context)) interaction.press();
        // The Adapter still owns capture acquisition for this click.
        return undefined;
      },
      mouseUp() {
        interaction.release();
        return undefined;
      },
      mouseMove(event, context) {
        const mode = state().camMode;
        if (mode === modes.ADDRESS) {
          if (hasMouseCapture(context)) aimMouse(event.movementX, event.movementY);
          return true;
        }
        if (mode === modes.CART) {
          if (hasMouseCapture(context)) cartMouse(event.movementX, event.movementY);
          return true;
        }
        return undefined;
      },
      keyDown(event, context) {
        const current = state();
        if (current.pendingHoleTransition
          && ['KeyR', 'Space', 'Enter'].includes(event.code)) {
          advanceHoleTransition();
          event.preventDefault?.();
          return true;
        }
        if (current.camMode === modes.ADDRESS
          && ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
          adjustPlannedDistance(event.code === 'ArrowUp' || event.code === 'KeyW' ? 1 : -1);
          event.preventDefault?.();
          return true;
        }
        if (current.camMode === modes.ADDRESS
          && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
          const left = event.code === 'ArrowLeft' || event.code === 'KeyA';
          adjustAim((left ? 1 : -1) * (event.shiftKey ? 0.07 : 0.022));
          event.preventDefault?.();
          return true;
        }
        if (current.camMode === modes.ADDRESS
          && (event.code === 'Space' || event.code === 'Enter')) {
          if (!event.repeat) swingClick();
          event.preventDefault?.();
          return true;
        }
        if (event.repeat) return true;

        if (/^Digit[1-9]$/.test(event.code)) {
          chooseDigit(Number(event.code.slice(5)) - 1);
          return true;
        }

        // Preserve the scene's documented rebind rule: a physical command
        // key may simultaneously own a translated movement action.
        if (MOVEMENT_CODES.has(context.code)) {
          player.setKey(context.code, true);
          event.preventDefault?.();
        }
        if (event.code === 'KeyF' && context.code === 'KeyF') {
          player.setKey('KeyF', true);
        }

        if (command(event.code)) return true;

        // Cart controls remain live without pointer lock, as before.
        if (current.camMode === modes.CART && MOVEMENT_CODES.has(context.code)) return true;
        return undefined;
      },
      keyUp(event) {
        if (event.code === 'KeyE') interaction.release();
        if (event.code === 'KeyF') cancelItemUse();
        return undefined;
      },
    }),
    onClear() {
      cancelItemUse();
    },
  });
}

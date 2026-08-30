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
        // The configured interaction key has address/cart policy below.
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
      /* `context.code` is what the keymap says the player pressed. Address
       * aim, the swing and the round's commands are all bindable actions and
       * read it; the club digits are not in the keymap and stay physical.
       * Arrow keys and Enter are unbound by default and pass through
       * translateKey unchanged, so they keep working either way. */
      keyDown(event, context) {
        const current = state();
        if (current.pendingHoleTransition
          && ['KeyR', 'Space', 'Enter'].includes(context.code)) {
          advanceHoleTransition();
          event.preventDefault?.();
          return true;
        }
        if (current.camMode === modes.ADDRESS
          && ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(context.code)) {
          adjustPlannedDistance(context.code === 'ArrowUp' || context.code === 'KeyW' ? 1 : -1);
          event.preventDefault?.();
          return true;
        }
        if (current.camMode === modes.ADDRESS
          && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(context.code)) {
          const left = context.code === 'ArrowLeft' || context.code === 'KeyA';
          adjustAim((left ? 1 : -1) * (event.shiftKey ? 0.07 : 0.022));
          event.preventDefault?.();
          return true;
        }
        if (current.camMode === modes.ADDRESS
          && (context.code === 'Space' || context.code === 'Enter')) {
          if (!event.repeat) swingClick();
          event.preventDefault?.();
          return true;
        }
        if (event.repeat) return true;

        if (/^Digit[1-9]$/.test(event.code)) {
          chooseDigit(Number(event.code.slice(5)) - 1);
          return true;
        }

        // One translated code means one thing: bindKey SWAPS a command key
        // rebound to movement, so the displaced command follows the key that
        // movement gave up rather than firing alongside it.
        if (MOVEMENT_CODES.has(context.code)) {
          player.setKey(context.code, true);
          event.preventDefault?.();
        }
        if (context.code === 'KeyF') {
          player.setKey('KeyF', true);
        }

        if (command(context.code)) return true;

        // Cart controls remain live without pointer lock, as before.
        if (current.camMode === modes.CART && MOVEMENT_CODES.has(context.code)) return true;
        return undefined;
      },
      // Released on the same translated code the press used, or a rebound
      // hold never lets go of the beer.
      keyUp(_event, context) {
        if (context.code === 'KeyE') interaction.release();
        if (context.code === 'KeyF') cancelItemUse();
        return undefined;
      },
    }),
    onClear() {
      cancelItemUse();
    },
  });
}

import { FIRST_PERSON_MOVEMENT_CODES } from '../core/first-person-input.js';

const MOVEMENT_CODES = new Set(FIRST_PERSON_MOVEMENT_CODES);

/**
 * Lou's Mansion policy for the canonical first-person browser Adapter.
 *
 * The Adapter owns pointer capture, translated movement/releases, look,
 * focus loss and teardown. This policy owns the house's local vocabulary:
 * keypad refusal, dress-help timing, pool, weapons, inventory, and theatre.
 */
export function createMansionControlPolicy({
  state,
  player,
  interaction,
  poolKeys,
  silentKeydown,
  dressHelpActive,
  pressDressHelp,
  abandonDressHelp,
  poolPressE,
  poolPutCueBack,
  command,
  peeStop,
  setTrigger,
  fireMissionWeapon,
  pause,
} = {}) {
  if (typeof state !== 'function') throw new TypeError('Mansion controls require state()');

  return Object.freeze({
    // The start click requests capture before the audio banks finish loading.
    canEnable: () => state().tourBegun && !state().paused,
    canHandleInput: () => state().running && !state().paused,
    controlState: () => ({
      playerEnabled: state().running,
      movementEnabled: state().running,
      lookEnabled: state().running,
      // The configured interaction key has keypad/pool/weapon-aware policy below.
      interactionEnabled: false,
    }),
    routes: Object.freeze({
      /* `context.code` is the CONFIGURED code: the Adapter ran translateKey
       * before this route, and every branch below reads it. The house used to
       * compare `event.code`, which meant a rebound Use answered nothing in
       * the whole mansion while movement still followed the keymap. The
       * keypad is text entry (`event.key`) and Escape is not a bindable
       * action, so those two stay physical. */
      keyDown(event, context) {
        if (silentKeydown(event)) {
          event.preventDefault?.();
          return true;
        }

        if (dressHelpActive() && !event.repeat) {
          if (context.code === 'KeyE') {
            pressDressHelp();
            event.preventDefault?.();
            return true;
          }
          if (context.code === 'KeyQ' || event.code === 'Escape') {
            abandonDressHelp();
            event.preventDefault?.();
            return true;
          }
        }

        if (context.code === 'Space') event.preventDefault?.();

        if (state().atPool) {
          poolKeys.add(context.code);
          if (context.code === 'KeyE' && !event.repeat) {
            poolPressE();
            event.preventDefault?.();
            return true;
          }
          if (context.code === 'KeyQ' && !event.repeat) {
            poolPutCueBack();
            event.preventDefault?.();
            return true;
          }
        }

        // A command key rebound to movement is a SWAP, not a collision:
        // bindKey hands the displaced command the key movement gave up, so
        // one translated code can only ever mean one of the two.
        if (MOVEMENT_CODES.has(context.code)) {
          player.setKey(context.code, true);
          event.preventDefault?.();
        }

        if (command(context.code, event)) return true;
        return undefined;
      },
      // Same translation as keyDown, or the pool's fine-aim keys and the held
      // interaction never come back up.
      keyUp(_event, context) {
        poolKeys.delete(context.code);
        if (state().atPool && context.code === 'KeyE') return true;
        if (context.code === 'KeyE') {
          interaction.release();
          peeStop();
        }
        return undefined;
      },
      mouseDown(event, context) {
        if (event.button !== 0 || !context.locked) return undefined;
        if (state().weaponEquipped) setTrigger(true);
        else interaction.press();
        fireMissionWeapon();
        return undefined;
      },
      mouseUp(event) {
        if (event.button !== 0) return undefined;
        setTrigger(false);
        interaction.release();
        return undefined;
      },
    }),
    onClear() {
      poolKeys.clear();
      peeStop();
      setTrigger(false);
    },
    onCaptureChange(_event, controls) {
      if (!controls.locked && state().running) pause();
    },
  });
}

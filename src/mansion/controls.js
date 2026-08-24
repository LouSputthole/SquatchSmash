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
      // Physical E has keypad/pool/weapon-aware policy below.
      interactionEnabled: false,
    }),
    routes: Object.freeze({
      keyDown(event, context) {
        if (silentKeydown(event)) {
          event.preventDefault?.();
          return true;
        }

        if (dressHelpActive() && !event.repeat) {
          if (event.code === 'KeyE') {
            pressDressHelp();
            event.preventDefault?.();
            return true;
          }
          if (event.code === 'KeyQ' || event.code === 'Escape') {
            abandonDressHelp();
            event.preventDefault?.();
            return true;
          }
        }

        if (event.code === 'Space') event.preventDefault?.();

        if (state().atPool) {
          poolKeys.add(event.code);
          if (event.code === 'KeyE' && !event.repeat) {
            poolPressE();
            event.preventDefault?.();
            return true;
          }
          if (event.code === 'KeyQ' && !event.repeat) {
            poolPutCueBack();
            event.preventDefault?.();
            return true;
          }
        }

        // Preserve the existing dual-ownership rule when an action key is
        // rebound to movement: the command and movement both still happen.
        if (MOVEMENT_CODES.has(context.code)) {
          player.setKey(context.code, true);
          event.preventDefault?.();
        }

        if (command(event.code, event)) return true;
        return undefined;
      },
      keyUp(event) {
        poolKeys.delete(event.code);
        if (state().atPool && event.code === 'KeyE') return true;
        if (event.code === 'KeyE') {
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

import { FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';

const DIRECTION_FOR_CODE = Object.freeze({
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
});

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

/**
 * Squatchfather policy at the canonical browser-input seam.
 *
 * ProspectController remains the authored movement/look Implementation. This
 * Adapter only maps the canonical Interface onto its directional state,
 * clamped seated look, hold-to-interact lifecycle and one-shot revolver input.
 */
export function createSquatchfatherInputPolicy({
  keys,
  isGameplayEnabled,
  look,
  primaryControl,
  fire,
  togglePause,
  toggleMute,
} = {}) {
  if (!keys || typeof keys !== 'object') {
    throw new TypeError('Squatchfather input policy requires its directional state');
  }
  requiredFunction(isGameplayEnabled, 'isGameplayEnabled');
  requiredFunction(look, 'look');
  requiredFunction(primaryControl?.press, 'primaryControl.press');
  requiredFunction(primaryControl?.release, 'primaryControl.release');
  requiredFunction(primaryControl?.cancel, 'primaryControl.cancel');
  requiredFunction(fire, 'fire');
  requiredFunction(togglePause, 'togglePause');
  requiredFunction(toggleMute, 'toggleMute');

  const clearDirections = () => {
    for (const direction of new Set(Object.values(DIRECTION_FOR_CODE))) keys[direction] = false;
  };
  const player = {
    enabled: false,
    setKey(code, down) {
      const direction = DIRECTION_FOR_CODE[code];
      if (!direction) return false;
      keys[direction] = Boolean(down);
      return true;
    },
    clearKeys: clearDirections,
    handleMouseMove(dx, dy) {
      look(dx, dy);
    },
  };

  const gameplayEnabled = () => Boolean(isGameplayEnabled());
  return Object.freeze({
    player,
    adapterOptions: Object.freeze({
      canEnable: gameplayEnabled,
      // Escape and mute retain their old menu/pause behavior without capture.
      canHandleInput: () => true,
      captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK,
      routes: Object.freeze({
        keyDown(event, { code }) {
          const direction = DIRECTION_FOR_CODE[code];
          if (direction) {
            event.preventDefault?.();
            if (gameplayEnabled()) player.setKey(code, true);
            return true;
          }
          if (code === 'KeyE') {
            if (gameplayEnabled() && !event.repeat) primaryControl.press();
            return true;
          }
          if (code === 'Escape' && !event.repeat) {
            togglePause();
            return true;
          }
          if (code === 'KeyM' && !event.repeat) {
            toggleMute();
            return true;
          }
          return false;
        },
        keyUp(_event, { code }) {
          if (DIRECTION_FOR_CODE[code]) {
            player.setKey(code, false);
            return true;
          }
          if (code === 'KeyE') {
            primaryControl.release();
            return true;
          }
          return false;
        },
        mouseDown(event, { locked }) {
          if (!gameplayEnabled() || !locked || event.button !== 0) return false;
          fire();
          return true;
        },
      }),
    }),
  });
}

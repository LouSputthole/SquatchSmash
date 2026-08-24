import { FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';

const MOTEL_HELD_ACTION = Object.freeze({
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ArrowLeft: 'turnL',
  ArrowRight: 'turnR',
  ArrowUp: 'lookU',
  ArrowDown: 'lookD',
});

const SWALLOWED_CODES = new Set(['Space', 'KeyE', 'Tab']);

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

/**
 * Motel policy at the canonical browser-input seam.
 *
 * The Motel keeps its authored physics and arrow-key camera nudges. This
 * Adapter translates canonical codes into that held-action vocabulary while
 * first-person-input owns DOM listeners, capture, focus cleanup and mouse
 * lifecycle. The custom movement Implementation stays behind a small Player-
 * compatible Interface instead of leaking browser events back into the scene.
 */
export function createMotelInputPolicy({
  held,
  isGameplayEnabled,
  look,
  routeKeyDown,
  attack,
  ranged,
} = {}) {
  if (!held?.add || !held?.delete || !held?.clear || !held?.has) {
    throw new TypeError('Motel input policy requires a Set-compatible held-action store');
  }
  requiredFunction(isGameplayEnabled, 'isGameplayEnabled');
  requiredFunction(look, 'look');
  requiredFunction(routeKeyDown, 'routeKeyDown');
  requiredFunction(attack, 'attack');
  requiredFunction(ranged, 'ranged');

  const player = {
    enabled: false,
    setKey(code, down) {
      const action = MOTEL_HELD_ACTION[code];
      if (!action) return false;
      if (down) held.add(action);
      else held.delete(action);
      return true;
    },
    clearKeys() {
      held.clear();
    },
    handleMouseMove(dx, dy) {
      look(dx, dy);
    },
  };

  const gameplayEnabled = () => Boolean(isGameplayEnabled());
  return Object.freeze({
    player,
    isDown: (action) => held.has(action),
    adapterOptions: Object.freeze({
      canEnable: gameplayEnabled,
      // Menu/pause hotkeys stay observable without capture. Scene gameplay
      // actions are separately gated below, just as they were before.
      canHandleInput: () => true,
      captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK,
      // Both authored attack buttons used to reacquire the canvas before
      // dispatch. Preserve that contract after an alt-tab or pause.
      captureButtons: Object.freeze([0, 2]),
      routes: Object.freeze({
        keyDown(event, { code }) {
          const isHeldAction = Boolean(MOTEL_HELD_ACTION[code]);
          if (isHeldAction) {
            event.preventDefault?.();
            if (gameplayEnabled()) player.setKey(code, true);
          }

          // Held movement is state. Every other authored action is an edge.
          if (event.repeat) {
            if (SWALLOWED_CODES.has(code)) event.preventDefault?.();
            return true;
          }
          if (isHeldAction) return true;
          return routeKeyDown(event, code) === true;
        },
        keyUp(_event, { code }) {
          if (!MOTEL_HELD_ACTION[code]) return false;
          player.setKey(code, false);
          return true;
        },
        mouseDown(event, { locked }) {
          if (!gameplayEnabled() || !locked) return false;
          if (event.button === 0) attack();
          else if (event.button === 2) ranged();
          else return false;
          return true;
        },
      }),
    }),
  });
}

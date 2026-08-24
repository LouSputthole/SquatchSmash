import { FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';

/**
 * Bada Bing policy plugged into the canonical browser-input Adapter.
 *
 * The Module owns only facts specific to this scene: which canonical action
 * keys are held, what the primary button means, and how authored hotkeys are
 * dispatched. Capture, rebinding, Player movement/look and lifecycle cleanup
 * remain the Adapter's job.
 */
export function createBingInputPolicy({
  isActive,
  primaryControl,
  routeKeyDown,
}) {
  if (typeof isActive !== 'function' || typeof routeKeyDown !== 'function') {
    throw new TypeError('Bing input policy requires active-state and key routes');
  }
  if (!primaryControl?.press || !primaryControl?.release || !primaryControl?.cancel) {
    throw new TypeError('Bing input policy requires a primary control lifecycle');
  }

  const held = new Set();
  const active = () => Boolean(isActive());

  return Object.freeze({
    isDown: (code) => held.has(code),
    adapterOptions: Object.freeze({
      canEnable: active,
      canHandleInput: active,
      captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
      onClear: () => held.clear(),
      routes: Object.freeze({
        keyDown(event, { code }) {
          // One authored action per physical press. Movement remains held in
          // Player until canonical key-up even when the browser repeats it.
          if (event.repeat) return true;
          held.add(code);
          return routeKeyDown(event, code) === true;
        },
        keyUp(_event, { code }) {
          held.delete(code);
          if (code !== 'KeyE') return false;
          primaryControl.release();
          return true;
        },
        mouseDown(event) {
          if (event.button !== 0) return false;
          primaryControl.press();
          // Let the Adapter request/retry pointer lock after the authored
          // primary action, matching the scene's former click seam.
          return false;
        },
        mouseUp(event) {
          if (event.button !== 0) return false;
          primaryControl.release();
          return false;
        },
      }),
    }),
  });
}

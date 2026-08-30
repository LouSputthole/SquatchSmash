import { FIRST_PERSON_CAPTURE_MODES } from '../core/first-person-input.js';

/** Front and Center's authored actions on the canonical browser-input seam. */
export function createSilverInputPolicy({
  isActive,
  primaryControl,
  routeKeyDown,
}) {
  if (typeof isActive !== 'function' || typeof routeKeyDown !== 'function') {
    throw new TypeError('Silver input policy requires active-state and key routes');
  }
  if (!primaryControl?.press || !primaryControl?.release || !primaryControl?.cancel) {
    throw new TypeError('Silver input policy requires a primary control lifecycle');
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

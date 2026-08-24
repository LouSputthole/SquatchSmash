const HELM_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
}

/**
 * NO WAKE policy plugged into the canonical first-person input Adapter.
 *
 * The Adapter owns browser capture, translated Player movement, mouse look,
 * interaction release and focus cleanup. This Module retains only the boat's
 * authored controls: a helm remains keyboard-operable without pointer lock,
 * the execution click fires instead of interacting, and R/B/Q keep their
 * scene meanings.
 */
export function createNoWakeInputPolicy({
  canCapture,
  isActive,
  isAtHelm,
  helmInput,
  primaryControl,
  isReadyToFire,
  fireExecution,
  advanceRadio,
  toggleBloom,
  showBloom,
  leaveHelm,
  hasInteractionTarget,
  explainMissingInteraction,
} = {}) {
  for (const [label, value] of Object.entries({
    canCapture,
    isActive,
    isAtHelm,
    isReadyToFire,
    fireExecution,
    advanceRadio,
    toggleBloom,
    showBloom,
    leaveHelm,
    hasInteractionTarget,
    explainMissingInteraction,
  })) requiredFunction(value, label);
  if (!helmInput?.setKey) {
    throw new TypeError('NO WAKE input policy requires a helm key sink');
  }
  if (!primaryControl?.press || !primaryControl?.release || !primaryControl?.cancel) {
    throw new TypeError('NO WAKE input policy requires a primary control lifecycle');
  }

  return Object.freeze({
    canEnable: () => Boolean(canCapture()),
    canHandleInput: () => Boolean(isActive()),
    controlState: () => Object.freeze({
      // At the helm, W/A/S/D belong to BoatPhysics rather than Player walk.
      movementEnabled: !isAtHelm(),
      interactionEnabled: !isAtHelm(),
    }),
    routes: Object.freeze({
      keyDown(event, { code }) {
        if (code === 'Space') event.preventDefault?.();

        if (isAtHelm() && HELM_CODES.has(code)) {
          helmInput.setKey(code, true);
          event.preventDefault?.();
          return true;
        }
        if (event.repeat) return false;
        if (code === 'KeyR') {
          advanceRadio();
          return true;
        }
        if (code === 'KeyB') {
          showBloom(Boolean(toggleBloom()));
          return true;
        }
        if (code === 'KeyQ' && isAtHelm()) {
          leaveHelm();
          return true;
        }
        return false;
      },
      mouseDown(event, { locked }) {
        if (event.button !== 0) return false;
        if (isReadyToFire()) {
          fireExecution();
          return true;
        }
        if (!locked) return false;
        primaryControl.press();
        return true;
      },
      mouseUp(event) {
        if (event.button !== 0) return false;
        primaryControl.release();
        return true;
      },
    }),
    onKeyDown(event, { code, handled }) {
      // The shared Adapter has already pressed E at this point. Preserve NO
      // WAKE's refusal feedback only when the canonical interaction ran.
      if (code === 'KeyE' && handled && !event.repeat && !hasInteractionTarget()) {
        explainMissingInteraction();
      }
    },
  });
}

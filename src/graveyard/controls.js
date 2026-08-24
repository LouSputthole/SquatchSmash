/**
 * Routes the graveyard's single primary input. Unresolved traitor graves own
 * that input completely: pressing E begins the disrespect action and releasing
 * E ends it. Every other target continues through the shared interaction
 * system.
 */
export function createPrimaryGraveControl({
  interaction,
  currentTraitor,
  startDisrespect,
  stopDisrespect,
  isDisrespecting,
}) {
  let mode = null;

  return Object.freeze({
    press() {
      const traitor = currentTraitor();
      if (traitor) {
        mode = 'disrespect';
        startDisrespect(traitor);
        return mode;
      }

      mode = 'interact';
      interaction.press();
      return mode;
    },

    release() {
      const releasedMode = mode;
      mode = null;
      if (releasedMode === 'disrespect') {
        if (isDisrespecting()) stopDisrespect();
        return 'disrespect';
      }

      interaction.release();
      return 'interact';
    },

    /** Focus loss/pause abandons a hold without converting it into a tap. */
    cancel() {
      const cancelledMode = mode;
      mode = null;
      if (cancelledMode === 'disrespect') {
        if (isDisrespecting()) stopDisrespect();
      } else {
        interaction.cancel?.();
      }
      return cancelledMode;
    },
  });
}

/** Authored graveyard policy plugged into the canonical browser-input Adapter. */
export function createGraveyardInputPolicy({
  isActive,
  isCarrying,
  isDisrespecting,
  primaryControl,
  stopDisrespect,
  notifyCarryRefusal,
  toggleBloom,
  showBloom,
}) {
  const enabled = () => Boolean(isActive());
  return Object.freeze({
    canEnable: enabled,
    canHandleInput: enabled,
    routes: Object.freeze({
      keyDown(event, { code }) {
        if (code === 'Space') event.preventDefault?.();
        if (isCarrying() && ['Space', 'ShiftLeft', 'ShiftRight'].includes(code)) {
          if (code === 'Space' && !event.repeat) notifyCarryRefusal();
          return true;
        }
        if (code === 'KeyQ' && isDisrespecting()) {
          stopDisrespect();
          return true;
        }
        if (code === 'KeyB') {
          showBloom(Boolean(toggleBloom()));
          return true;
        }
        return false;
      },
      mouseDown(event, { locked }) {
        if (event.button !== 0 || !locked) return false;
        primaryControl.press();
        return true;
      },
      mouseUp(event) {
        if (event.button !== 0) return false;
        primaryControl.release();
        return true;
      },
    }),
  });
}

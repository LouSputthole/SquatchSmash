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
  });
}

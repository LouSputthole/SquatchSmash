/** Authored HotDog policy plugged into the canonical browser-input Adapter. */
export function createHotDogInputPolicy({
  isActive,
  isCarrying,
  drinkShot,
  primaryControl,
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
        if (code === 'KeyE' && drinkShot()) return true;
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

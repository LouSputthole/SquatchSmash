/**
 * Canonical browser Adapter between first-person scene input and Player.
 *
 * Player is the movement Implementation.  This is the missing socket around
 * it: pointer lock, translated keys, mouse look, interaction, focus loss and
 * pause all cross one Interface.  A scene supplies policy callbacks; it does
 * not rebuild DOM event plumbing.
 */
import { translateKey as translateConfiguredKey } from './settings.js';

export const FIRST_PERSON_MOVEMENT_CODES = Object.freeze([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
]);

const MOVEMENT_CODES = new Set(FIRST_PERSON_MOVEMENT_CODES);

function eventTarget(value, label) {
  if (!value?.addEventListener || !value?.removeEventListener) {
    throw new TypeError(`${label} must implement addEventListener/removeEventListener`);
  }
  return value;
}

export class FirstPersonInputAdapter {
  constructor({
    player,
    canvas,
    interaction = null,
    documentTarget = globalThis.document,
    windowTarget = globalThis,
    translateKey = translateConfiguredKey,
    canEnable = () => true,
    canHandleInput = () => true,
    onKeyDown = null,
  } = {}) {
    if (!player?.setKey || !player?.clearKeys || !player?.handleMouseMove) {
      throw new TypeError('FirstPersonInputAdapter requires a Player-compatible object');
    }
    if (!canvas) throw new TypeError('FirstPersonInputAdapter requires a canvas');
    if (typeof translateKey !== 'function') throw new TypeError('translateKey must be a function');
    if (typeof canEnable !== 'function' || typeof canHandleInput !== 'function') {
      throw new TypeError('Input policy must be functions');
    }
    this.player = player;
    this.canvas = canvas;
    this.interaction = interaction;
    this.document = eventTarget(documentTarget, 'documentTarget');
    this.window = eventTarget(windowTarget, 'windowTarget');
    this.translateKey = translateKey;
    this.canEnable = canEnable;
    this.canHandleInput = canHandleInput;
    this.onKeyDown = onKeyDown;
    this.suspended = false;
    this.destroyed = false;
    this.receipts = {
      pointerLockChanges: 0,
      movementPresses: 0,
      lookEvents: 0,
      interactionPresses: 0,
      lastMovementCode: null,
    };

    this._mousedown = (event) => {
      if (event.button !== 0 || event.target?.closest?.('button, a')) return;
      this.requestPointerLock();
    };
    this._pointerLockChange = () => {
      this.receipts.pointerLockChanges += 1;
      this.syncEnabled();
    };
    this._mousemove = (event) => {
      if (!this.enabled || !this.canHandleInput()) return;
      this.receipts.lookEvents += 1;
      this.player.handleMouseMove(event.movementX ?? 0, event.movementY ?? 0);
    };
    this._keydown = (event) => {
      if (this.suspended || !this.canHandleInput()) return;
      const code = this.translateKey(event.code);
      let handled = false;
      if (MOVEMENT_CODES.has(code) && this.enabled) {
        this.player.setKey(code, true);
        this.receipts.movementPresses += 1;
        this.receipts.lastMovementCode = code;
        event.preventDefault?.();
        handled = true;
      }
      if (code === 'KeyE' && !event.repeat && this.enabled) {
        this.interaction?.press?.();
        this.receipts.interactionPresses += 1;
        handled = true;
      }
      this.onKeyDown?.(event, { code, handled, enabled: this.enabled });
    };
    this._keyup = (event) => {
      const code = this.translateKey(event.code);
      this.player.setKey(code, false);
      if (code === 'KeyE') this.interaction?.release?.();
    };
    this._blur = () => this.clear();

    canvas.addEventListener('mousedown', this._mousedown);
    this.document.addEventListener('pointerlockchange', this._pointerLockChange);
    this.window.addEventListener('mousemove', this._mousemove);
    this.window.addEventListener('keydown', this._keydown);
    this.window.addEventListener('keyup', this._keyup);
    this.window.addEventListener('blur', this._blur);
    this.syncEnabled();
  }

  get locked() { return this.document.pointerLockElement === this.canvas; }

  get enabled() { return this.player.enabled === true; }

  syncEnabled() {
    const enabled = !this.destroyed && !this.suspended && this.locked && this.canEnable();
    this.player.enabled = enabled;
    if (!enabled) this.clear();
    return enabled;
  }

  clear() {
    this.player.clearKeys();
    /* A held interaction has its own state machine. Losing focus or pausing
     * must abandon that hold without turning the missing keyup into a tap. */
    this.interaction?.cancel?.();
  }

  requestPointerLock() {
    if (this.destroyed || this.suspended || !this.canEnable() || this.locked) return false;
    try {
      const pending = this.canvas.requestPointerLock?.();
      pending?.catch?.(() => {});
      return typeof this.canvas.requestPointerLock === 'function';
    } catch {
      // Embedded previews may deny pointer lock. The next click may retry.
      return false;
    }
  }

  suspend({ exitPointerLock = true } = {}) {
    this.suspended = true;
    this.syncEnabled();
    if (exitPointerLock && this.locked) this.document.exitPointerLock?.();
  }

  resume({ requestPointerLock = true } = {}) {
    this.suspended = false;
    this.syncEnabled();
    if (requestPointerLock && !this.locked) this.requestPointerLock();
  }

  snapshot() {
    return Object.freeze({
      schema: 'squatchsmash.first-person-input.v1',
      enabled: this.enabled,
      locked: this.locked,
      suspended: this.suspended,
      ...this.receipts,
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.syncEnabled();
    this.canvas.removeEventListener('mousedown', this._mousedown);
    this.document.removeEventListener('pointerlockchange', this._pointerLockChange);
    this.window.removeEventListener('mousemove', this._mousemove);
    this.window.removeEventListener('keydown', this._keydown);
    this.window.removeEventListener('keyup', this._keyup);
    this.window.removeEventListener('blur', this._blur);
  }
}

export function createFirstPersonInput(options) {
  return new FirstPersonInputAdapter(options);
}

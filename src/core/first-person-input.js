/**
 * Canonical browser Adapter between first-person scene input and Player.
 *
 * Player is the movement Implementation. This is the socket around it:
 * capture, translated keys, mouse look, interaction, focus loss and pause all
 * cross one Interface. A scene supplies policy and narrow routes; it does not
 * rebuild DOM event plumbing.
 */
import { translateKey as translateConfiguredKey } from './settings.js';

export const FIRST_PERSON_MOVEMENT_CODES = Object.freeze([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
]);

export const FIRST_PERSON_CAPTURE_MODES = Object.freeze({
  POINTER_LOCK: 'pointer-lock',
  POINTER_LOCK_OR_DRAG: 'pointer-lock-or-drag',
});

const MOVEMENT_CODES = new Set(FIRST_PERSON_MOVEMENT_CODES);
const CAPTURE_MODES = new Set(Object.values(FIRST_PERSON_CAPTURE_MODES));
const ROUTE_NAMES = Object.freeze([
  'keyDown', 'keyUp', 'mouseMove', 'mouseDown', 'mouseUp',
]);

function eventTarget(value, label) {
  if (!value?.addEventListener || !value?.removeEventListener) {
    throw new TypeError(`${label} must implement addEventListener/removeEventListener`);
  }
  return value;
}

function optionalFunction(value, label) {
  if (value !== null && value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${label} must be a function`);
  }
  return value ?? null;
}

function validateRoutes(routes) {
  if (routes === null || routes === undefined) return Object.freeze({});
  if (typeof routes !== 'object' || Array.isArray(routes)) {
    throw new TypeError('routes must be an object');
  }
  for (const name of ROUTE_NAMES) optionalFunction(routes[name], `routes.${name}`);
  return routes;
}

function allowsDefault(routeResult) {
  return routeResult !== true;
}

/**
 * A route runs before the Adapter's default for that event. Returning `true`
 * consumes the default. Release of a movement/interaction that this Adapter
 * already started is deliberately non-consumable: a scene route cannot leave
 * canonical input held forever.
 */
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
    controlState = null,
    routes = null,
    captureMode = FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK,
    dragFallbackDelayMs = 600,
    keyboardCapture = false,
    interactionRequiresCapture = true,
    onKeyDown = null,
    onClear = null,
    onCaptureChange = null,
    onCaptureError = null,
  } = {}) {
    if (!player?.setKey || !player?.clearKeys || !player?.handleMouseMove) {
      throw new TypeError('FirstPersonInputAdapter requires a Player-compatible object');
    }
    if (typeof translateKey !== 'function') throw new TypeError('translateKey must be a function');
    if (typeof canEnable !== 'function' || typeof canHandleInput !== 'function') {
      throw new TypeError('Input policy must be functions');
    }
    if (!CAPTURE_MODES.has(captureMode)) {
      throw new TypeError(`Unknown first-person capture mode: ${captureMode}`);
    }
    if (!Number.isFinite(dragFallbackDelayMs) || dragFallbackDelayMs < 0) {
      throw new TypeError('dragFallbackDelayMs must be a non-negative number');
    }
    if (typeof keyboardCapture !== 'boolean') {
      throw new TypeError('keyboardCapture must be a boolean');
    }
    if (typeof interactionRequiresCapture !== 'boolean') {
      throw new TypeError('interactionRequiresCapture must be a boolean');
    }

    this.player = player;
    this.canvas = eventTarget(canvas, 'canvas');
    this.interaction = interaction;
    this.document = eventTarget(documentTarget, 'documentTarget');
    this.window = eventTarget(windowTarget, 'windowTarget');
    this.translateKey = translateKey;
    this.canEnable = canEnable;
    this.canHandleInput = canHandleInput;
    this.controlState = optionalFunction(controlState, 'controlState');
    this.routes = validateRoutes(routes);
    this.captureMode = captureMode;
    this.dragFallbackDelayMs = dragFallbackDelayMs;
    this.keyboardCapture = keyboardCapture;
    this.interactionRequiresCapture = interactionRequiresCapture;
    this.onKeyDown = optionalFunction(onKeyDown, 'onKeyDown');
    this.onClear = optionalFunction(onClear, 'onClear');
    this.onCaptureChange = optionalFunction(onCaptureChange, 'onCaptureChange');
    this.onCaptureError = optionalFunction(onCaptureError, 'onCaptureError');

    this.suspended = false;
    this.destroyed = false;
    this.dragFallback = false;
    this.dragging = false;
    this.controls = null;
    this._buttons = new Set();
    this._physicalKeys = new Map();
    this._captureAttempt = 0;
    this._captureFailureAttempt = -1;
    this._fallbackTimer = null;
    this.receipts = {
      pointerLockChanges: 0,
      pointerLockErrors: 0,
      dragFallbackActivations: 0,
      movementPresses: 0,
      lookEvents: 0,
      interactionPresses: 0,
      mouseDownEvents: 0,
      mouseUpEvents: 0,
      clearEvents: 0,
      lastMovementCode: null,
      lastClearReason: null,
      lastCaptureError: null,
    };

    this._mousedown = (event) => {
      if (this.destroyed) return;
      this.receipts.mouseDownEvents += 1;
      this._buttons.add(event.button);
      const controls = this.refresh('mouse-down');
      const context = this._eventContext({ controls });
      const routeResult = controls.inputEnabled
        ? this.routes.mouseDown?.(event, context)
        : undefined;
      if (!allowsDefault(routeResult)) return;
      if (event.button !== 0 || event.target?.closest?.('button, a')) return;
      if (this.dragFallback && controls.inputEnabled) {
        this.dragging = true;
        this.refresh('drag-start');
      }
      this.requestPointerLock();
    };
    this._mouseup = (event) => {
      if (this.destroyed) return;
      this.receipts.mouseUpEvents += 1;
      this._buttons.delete(event.button);
      const controls = this.refresh('mouse-up');
      const routeResult = this.routes.mouseUp?.(event, this._eventContext({ controls }));
      if (event.button === 0) {
        this.dragging = false;
        this.refresh('drag-end');
      }
      // Mouse-up is lifecycle cleanup. A route may consume scene defaults,
      // but cannot retain the Adapter's physical-button truth.
      return routeResult;
    };
    this._pointerLockChange = (event) => {
      if (this.destroyed) return;
      this.receipts.pointerLockChanges += 1;
      this._captureAttempt += 1;
      this._cancelFallbackTimer();
      if (this.locked) {
        this.dragFallback = false;
        this.dragging = false;
      }
      const controls = this.refresh('capture-change');
      this.onCaptureChange?.(event, this._eventContext({ controls }));
    };
    this._pointerLockError = (event) => {
      if (this.destroyed) return;
      this._handleCaptureError(event, 'pointer-lock-error');
    };
    this._mousemove = (event) => {
      if (this.destroyed) return;
      const controls = this.refresh('mouse-move');
      if (!controls.inputEnabled) return;
      const routeResult = this.routes.mouseMove?.(event, this._eventContext({ controls }));
      if (!allowsDefault(routeResult) || !controls.defaultLookEnabled) return;
      if (!this.locked && !(this.dragFallback && this.dragging)) return;
      this.receipts.lookEvents += 1;
      this.player.handleMouseMove(event.movementX ?? 0, event.movementY ?? 0);
    };
    this._keydown = (event) => {
      if (this.destroyed) return;
      const controls = this.refresh('key-down');
      if (!controls.inputEnabled) return;

      const physicalCode = event.code;
      let key = this._physicalKeys.get(physicalCode);
      if (!key) {
        key = {
          code: this.translateKey(physicalCode),
          movement: false,
          interaction: false,
        };
        this._physicalKeys.set(physicalCode, key);
      }

      const context = this._eventContext({ controls, code: key.code });
      const routeResult = this.routes.keyDown?.(event, context);
      let handled = routeResult === true;
      if (allowsDefault(routeResult)) {
        if (MOVEMENT_CODES.has(key.code) && controls.movementEnabled) {
          this.player.setKey(key.code, true);
          key.movement = true;
          this.receipts.movementPresses += 1;
          this.receipts.lastMovementCode = key.code;
          event.preventDefault?.();
          handled = true;
        }
        if (key.code === 'KeyE' && !event.repeat && controls.interactionEnabled) {
          this.interaction?.press?.();
          key.interaction = true;
          this.receipts.interactionPresses += 1;
          handled = true;
        }
      }
      // Compatibility: this callback has always observed the post-default
      // result. New scene-owned preemption belongs in routes.keyDown.
      this.onKeyDown?.(event, {
        ...context,
        handled,
        routed: routeResult === true,
        enabled: this.enabled,
      });
    };
    this._keyup = (event) => {
      if (this.destroyed) return;
      const controls = this.refresh('key-up');
      const physicalCode = event.code;
      const key = this._physicalKeys.get(physicalCode);
      const code = key?.code ?? this.translateKey(physicalCode);
      const routeResult = this.routes.keyUp?.(
        event,
        this._eventContext({ controls, code }),
      );

      if (key?.movement) this.player.setKey(code, false);
      else if (allowsDefault(routeResult)) this.player.setKey(code, false);
      if (key?.interaction) this.interaction?.release?.();
      else if (allowsDefault(routeResult) && code === 'KeyE') this.interaction?.release?.();
      this._physicalKeys.delete(physicalCode);
    };
    this._blur = () => this.clear('blur');

    this.canvas.addEventListener('mousedown', this._mousedown);
    this.document.addEventListener('pointerlockchange', this._pointerLockChange);
    this.document.addEventListener('pointerlockerror', this._pointerLockError);
    this.window.addEventListener('mousemove', this._mousemove);
    this.window.addEventListener('mouseup', this._mouseup);
    this.window.addEventListener('keydown', this._keydown, this.keyboardCapture);
    this.window.addEventListener('keyup', this._keyup, this.keyboardCapture);
    this.window.addEventListener('blur', this._blur);
    this.refresh('initial');
  }

  get locked() { return this.document.pointerLockElement === this.canvas; }

  get captured() { return this.locked || this.dragFallback; }

  get enabled() { return this.player.enabled === true; }

  _resolveControlState() {
    const lifecycleEnabled = !this.destroyed
      && !this.suspended
      && this.captured
      && Boolean(this.canEnable());
    // Scene routes (numbered choices, pause keys, vehicle controls) have
    // historically remained observable without pointer lock. Capture gates
    // the canonical Player defaults; suspension/canHandleInput gate routing.
    const inputEnabled = !this.destroyed
      && !this.suspended
      && Boolean(this.canHandleInput());
    const defaultsEnabled = lifecycleEnabled && inputEnabled;
    const context = Object.freeze({
      locked: this.locked,
      captured: this.captured,
      dragFallback: this.dragFallback,
      dragging: this.dragging,
      suspended: this.suspended,
      destroyed: this.destroyed,
      lifecycleEnabled,
      inputEnabled,
      defaultsEnabled,
    });
    const policy = this.controlState?.(context) ?? {};
    if (typeof policy !== 'object' || Array.isArray(policy)) {
      throw new TypeError('controlState must return an object');
    }
    const requestedLook = policy.defaultLookEnabled ?? policy.lookEnabled;
    return Object.freeze({
      playerEnabled: lifecycleEnabled && (policy.playerEnabled ?? true) === true,
      movementEnabled: defaultsEnabled && (policy.movementEnabled ?? true) === true,
      defaultLookEnabled: defaultsEnabled && (requestedLook ?? true) === true,
      interactionEnabled: inputEnabled
        && (!this.interactionRequiresCapture || lifecycleEnabled)
        && (policy.interactionEnabled ?? true) === true,
      lifecycleEnabled,
      inputEnabled,
      defaultsEnabled,
    });
  }

  _eventContext({ controls = this.controls, code = null } = {}) {
    return Object.freeze({
      adapter: this,
      code,
      locked: this.locked,
      captured: this.captured,
      dragFallback: this.dragFallback,
      dragging: this.dragging,
      suspended: this.suspended,
      destroyed: this.destroyed,
      ...(controls ?? {}),
    });
  }

  /** Re-read scene policy after a phase, pause, vehicle, or UI transition. */
  refresh(reason = 'refresh') {
    const previous = this.controls;
    const controls = this._resolveControlState();
    this.controls = controls;
    this.player.enabled = controls.playerEnabled;

    const initialDisabled = previous === null && !controls.playerEnabled;
    const lostPlayer = previous?.playerEnabled && !controls.playerEnabled;
    if (initialDisabled || lostPlayer) {
      this.clear(reason);
    } else {
      if (previous?.movementEnabled && !controls.movementEnabled) {
        this.player.clearKeys();
        for (const key of this._physicalKeys.values()) key.movement = false;
      }
      if (previous?.interactionEnabled && !controls.interactionEnabled) {
        this.interaction?.cancel?.();
        for (const key of this._physicalKeys.values()) key.interaction = false;
      }
    }
    return controls;
  }

  /** Compatibility alias retained for the first migrated scene. */
  syncEnabled() {
    return this.refresh('sync-enabled').playerEnabled;
  }

  clear(reason = 'manual') {
    this.player.clearKeys();
    this._physicalKeys.clear();
    this._buttons.clear();
    this.dragging = false;
    // A held interaction has its own state machine. Losing focus or pausing
    // must abandon that hold without turning the missing keyup into a tap.
    this.interaction?.cancel?.();
    this.receipts.clearEvents += 1;
    this.receipts.lastClearReason = reason;
    this.onClear?.(reason, this._eventContext());
  }

  _cancelFallbackTimer() {
    if (this._fallbackTimer === null) return;
    globalThis.clearTimeout(this._fallbackTimer);
    this._fallbackTimer = null;
  }

  _scheduleDragFallback(attempt) {
    if (this.captureMode !== FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG) return;
    this._cancelFallbackTimer();
    this._fallbackTimer = globalThis.setTimeout(() => {
      this._fallbackTimer = null;
      if (this.destroyed || attempt !== this._captureAttempt || this.locked) return;
      this._handleCaptureError(
        new Error('Pointer lock did not settle before the drag fallback deadline'),
        'pointer-lock-timeout',
        attempt,
      );
    }, this.dragFallbackDelayMs);
  }

  _activateDragFallback() {
    if (this.captureMode !== FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG
      || this.destroyed
      || this.suspended
      || this.locked
      || !this.canEnable()) return false;
    const firstActivation = !this.dragFallback;
    this.dragFallback = true;
    this.dragging = this._buttons.has(0);
    if (firstActivation) this.receipts.dragFallbackActivations += 1;
    this.refresh('drag-fallback');
    return true;
  }

  _handleCaptureError(error, reason, attempt = this._captureAttempt) {
    if (this.destroyed
      || attempt !== this._captureAttempt
      || this._captureFailureAttempt === attempt) return false;
    this._captureFailureAttempt = attempt;
    this._cancelFallbackTimer();
    this.receipts.pointerLockErrors += 1;
    this.receipts.lastCaptureError = reason;
    const recovered = this._activateDragFallback();
    this.onCaptureError?.(error, {
      ...this._eventContext(),
      reason,
      recovered,
    });
    return recovered;
  }

  requestPointerLock() {
    if (this.destroyed || this.suspended || !this.canEnable() || this.locked) return false;
    const attempt = ++this._captureAttempt;
    const request = this.canvas.requestPointerLock;
    if (typeof request !== 'function') {
      this._handleCaptureError(
        new Error('Pointer lock is unavailable on this canvas'),
        'pointer-lock-unavailable',
        attempt,
      );
      return false;
    }

    try {
      const pending = request.call(this.canvas);
      pending?.catch?.((error) => {
        if (this.destroyed || attempt !== this._captureAttempt || this.locked) return;
        this._handleCaptureError(error, 'pointer-lock-rejected', attempt);
      });
      this._scheduleDragFallback(attempt);
      return true;
    } catch (error) {
      this._handleCaptureError(error, 'pointer-lock-threw', attempt);
      return false;
    }
  }

  suspend({ exitPointerLock = true } = {}) {
    if (this.destroyed) return false;
    this.suspended = true;
    this._captureAttempt += 1;
    this._cancelFallbackTimer();
    this.dragFallback = false;
    this.clear('suspend');
    this.controls = this._resolveControlState();
    this.player.enabled = this.controls.playerEnabled;
    if (exitPointerLock && this.locked) this.document.exitPointerLock?.();
    return true;
  }

  resume({ requestPointerLock = true } = {}) {
    if (this.destroyed) return false;
    this.suspended = false;
    this.refresh('resume');
    if (requestPointerLock && !this.locked) this.requestPointerLock();
    return true;
  }

  snapshot() {
    return Object.freeze({
      schema: 'squatchsmash.first-person-input.v1',
      enabled: this.enabled,
      locked: this.locked,
      captured: this.captured,
      dragFallback: this.dragFallback,
      dragging: this.dragging,
      captureMode: this.captureMode,
      suspended: this.suspended,
      destroyed: this.destroyed,
      ...(this.controls ?? {}),
      ...this.receipts,
    });
  }

  destroy() {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.suspended = true;
    this._captureAttempt += 1;
    this._cancelFallbackTimer();
    this.dragFallback = false;
    this.clear('destroy');
    this.controls = this._resolveControlState();
    this.player.enabled = this.controls.playerEnabled;
    this.canvas.removeEventListener('mousedown', this._mousedown);
    this.document.removeEventListener('pointerlockchange', this._pointerLockChange);
    this.document.removeEventListener('pointerlockerror', this._pointerLockError);
    this.window.removeEventListener('mousemove', this._mousemove);
    this.window.removeEventListener('mouseup', this._mouseup);
    this.window.removeEventListener('keydown', this._keydown, this.keyboardCapture);
    this.window.removeEventListener('keyup', this._keyup, this.keyboardCapture);
    this.window.removeEventListener('blur', this._blur);
    return true;
  }
}

export function createFirstPersonInput(options) {
  return new FirstPersonInputAdapter(options);
}

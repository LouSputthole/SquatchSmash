/**
 * Non-blocking, idempotent loading feedback for public scene Start controls.
 *
 * Scene Implementations keep their user-gesture work and async preload chains.
 * This capture-phase Adapter immediately announces the pending start and drops
 * duplicate clicks while that first chain runs. It never awaits or disables
 * the control itself, so pointer lock and AudioContext activation still happen
 * inside the original trusted click.
 */

export const START_CONTROL_SELECTOR = [
  '#start-btn', '#startBtn', '#start', '#beginBtn', '[data-scene-start]',
].join(',');

const installs = new WeakMap();

function startContainer(button) {
  return button?.closest?.('#overlay, #menu, #start-card, [data-scene-start-card]') ?? null;
}

function hidden(node) {
  return !node || node.hidden === true || node.classList?.contains?.('hidden')
    || node.classList?.contains?.('out') || node.getAttribute?.('aria-hidden') === 'true';
}

function statusFor(button, doc) {
  const owner = button.parentElement ?? button;
  let status = owner.querySelector?.('[data-systemic-start-status]') ?? null;
  if (status) return status;
  status = doc.createElement('span');
  status.dataset.systemicStartStatus = '';
  status.className = 'systemic-start-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.textContent = '';
  button.insertAdjacentElement?.('afterend', status);
  return status;
}

export function beginStart(button, doc = globalThis.document) {
  if (!button || button.dataset?.systemicStartState === 'pending'
    || button.dataset?.systemicStartState === 'started') return false;
  button.dataset.systemicStartState = 'pending';
  button.setAttribute?.('aria-busy', 'true');
  const status = statusFor(button, doc);
  if (status) status.textContent = 'Loading… please wait.';
  return true;
}

export function settleStart(button, { ok = true, message } = {}) {
  if (!button?.dataset) return false;
  button.dataset.systemicStartState = ok ? 'started' : 'ready';
  button.removeAttribute?.('aria-busy');
  const status = button.parentElement?.querySelector?.('[data-systemic-start-status]');
  if (status && ok) status.remove?.();
  else if (status) status.textContent = message ?? 'Start did not finish. Try again.';
  return true;
}

/**
 * How long a start may sit pending before the button is given back.
 *
 * THE DEAD BUTTON. This gate swallows every click while the first one is
 * still running, and it had exactly three ways out: the scene changes
 * `onclick`, the start card goes away, or a promise rejects unhandled. A
 * scene whose start REFUSES -- says why, keeps its card up on purpose, and
 * neither rejects nor rebinds -- matched none of them, so the button stayed
 * pending forever and every later click was eaten. On a save where HotDog was
 * already buried, GO TO MOTEL could not be pressed at all.
 *
 * The microtask escape cannot be relied on either: a microtask queued from a
 * capture-phase listener drains at the next checkpoint, which can be BEFORE
 * the scene's own bubble-phase listener has run, so it asks whether the scene
 * reacted before the scene has had the chance.
 *
 * So the gate now time-boxes itself. Its job is to drop the second and third
 * click of an impatient double-tap, not to take a control away permanently,
 * and the worst case of giving it back too early is one duplicate start --
 * against a button that never works again.
 */
export const START_PENDING_TIMEOUT_MS = 6000;

export function installStartGate({
  doc = globalThis.document,
  win = globalThis.window,
  pendingTimeoutMs = START_PENDING_TIMEOUT_MS,
} = {}) {
  if (!doc?.addEventListener || !win) return { destroy() {} };
  const current = installs.get(doc);
  if (current) return current;

  const pending = new Set();
  /** Backstop timers, so settling early does not leave one armed. */
  const timers = new Map();
  function clearTimer(button) {
    const timer = timers.get(button);
    if (timer === undefined) return;
    timers.delete(button);
    win.clearTimeout?.(timer);
  }
  function sync(button) {
    if (!button?.isConnected) {
      clearTimer(button);
      pending.delete(button);
      return;
    }
    const container = startContainer(button);
    if (doc.body?.classList?.contains('playing') || (container && hidden(container))) {
      settleStart(button, { ok: true });
      clearTimer(button);
      pending.delete(button);
    }
  }

  function onClick(event) {
    const button = event.target?.closest?.(START_CONTROL_SELECTOR);
    if (!button) return;
    const state = button.dataset?.systemicStartState;
    if (state === 'started') return;
    if (state === 'pending') {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      return;
    }
    const priorHandler = button.onclick;
    if (!beginStart(button, doc)) return;
    pending.add(button);
    /* The backstop. Whatever the scene did or did not do, the player gets his
     * button back. Cleared by `sync`/`settleStart` on the happy path. */
    const timer = win.setTimeout?.(() => {
      timers.delete(button);
      if (!pending.has(button)) return;
      if (button.dataset?.systemicStartState !== 'pending') return;
      button.dataset.systemicStartState = 'ready';
      button.removeAttribute?.('aria-busy');
      button.parentElement?.querySelector?.('[data-systemic-start-status]')?.remove?.();
      pending.delete(button);
    }, pendingTimeoutMs);
    if (timer !== undefined) timers.set(button, timer);
    queueMicrotask(() => {
      if (!pending.has(button) || button.dataset?.systemicStartState !== 'pending') return;
      const container = startContainer(button);
      if ((button.onclick !== priorHandler || button.disabled === true)
        && (!container || !hidden(container))) {
        button.dataset.systemicStartState = 'ready';
        button.removeAttribute?.('aria-busy');
        button.parentElement?.querySelector?.('[data-systemic-start-status]')?.remove?.();
        clearTimer(button);
        pending.delete(button);
      }
    });
  }

  function onUnhandled() {
    for (const button of pending) {
      settleStart(button, { ok: false });
      clearTimer(button);
    }
    pending.clear();
  }

  const Observer = win.MutationObserver ?? globalThis.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(() => {
    for (const button of [...pending]) sync(button);
  }) : null;
  observer?.observe?.(doc.documentElement ?? doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden'],
  });
  doc.addEventListener('click', onClick, true);
  win.addEventListener?.('unhandledrejection', onUnhandled);

  const api = {
    destroy() {
      for (const button of [...timers.keys()]) clearTimer(button);
      observer?.disconnect?.();
      doc.removeEventListener('click', onClick, true);
      win.removeEventListener?.('unhandledrejection', onUnhandled);
      installs.delete(doc);
    },
  };
  installs.set(doc, api);
  return api;
}

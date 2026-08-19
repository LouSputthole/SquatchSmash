/**
 * Adapter from the persisted keymap to scene-local gameplay key handlers.
 *
 * Movement already calls settings.translateKey(). The older scene
 * Implementations compare E/F/R/Q directly, so this capture-phase Adapter
 * remaps only those gameplay actions before their handlers see the event. It
 * preserves every scene's input logic while making the common actions truly
 * rebindable across the campaign.
 */
import {
  DEFAULT_KEYS,
  getKeymap,
  keyLabel,
  projectGameplayKeysInText,
  subscribe,
  withCanonicalKeyDispatch,
} from './settings.js';

export const GAMEPLAY_ACTIONS = Object.freeze(['interact', 'utility', 'reload', 'backAction']);
const REMAPPED_EVENT = Symbol('squatch.remappedGameplayKey');
const installs = new WeakMap();
const ACTION_BY_CANONICAL_LABEL = Object.freeze({
  E: 'interact',
  F: 'utility',
  R: 'reload',
  Q: 'backAction',
});

export function gameplayPromptPlan(label, keymap = getKeymap()) {
  const action = ACTION_BY_CANONICAL_LABEL[String(label ?? '').trim().toUpperCase()] ?? null;
  if (!action) return null;
  return Object.freeze({ action, label: keyLabel(keymap[action] ?? DEFAULT_KEYS[action]) });
}

/**
 * Write one live gameplay prompt without fighting the static-prompt observer.
 *
 * InteractionSystem calls its HUD adapter every frame while the crosshair is
 * on a target. Projecting after that write with a MutationObserver made the
 * HUD alternate canonical E/F/R/Q and the rebound label twice per frame.
 * Project at the writer instead, and only touch the DOM when the visible label
 * actually changed. Compound prompts such as "HOLD E" keep their qualifier.
 */
export function writeGameplayPromptKey(node, canonical, keymap = getKeymap()) {
  const source = String(canonical ?? '');
  const exact = gameplayPromptPlan(source, keymap);
  const label = projectGameplayKeysInText(source, keymap);
  if (node?.dataset) {
    if (exact) {
      node.dataset.systemicAction = exact.action;
      node.dataset.systemicProjectedKey = label;
    } else {
      delete node.dataset.systemicAction;
      delete node.dataset.systemicProjectedKey;
    }
  }
  if (node && String(node.textContent ?? '') !== label) node.textContent = label;
  return label;
}

export function projectGameplayKeyPrompts(doc, excludedRoot = null, keymap = getKeymap()) {
  if (!doc?.querySelectorAll) return 0;
  let projected = 0;
  for (const node of doc.querySelectorAll('kbd')) {
    if (excludedRoot?.contains?.(node) || !node?.dataset) continue;
    const current = String(node.textContent ?? '').trim();
    const priorProjection = node.dataset.systemicProjectedKey ?? null;
    let action = node.dataset.systemicAction ?? null;
    if (!action || (priorProjection && current !== priorProjection)) {
      action = ACTION_BY_CANONICAL_LABEL[current.toUpperCase()] ?? null;
    }
    if (!action) {
      delete node.dataset.systemicAction;
      delete node.dataset.systemicProjectedKey;
      continue;
    }
    const label = keyLabel(keymap[action] ?? DEFAULT_KEYS[action]);
    node.dataset.systemicAction = action;
    node.dataset.systemicProjectedKey = label;
    if (current !== label) node.textContent = label;
    projected++;
  }
  return projected;
}

export function gameplayKeyPlan(code, keymap = getKeymap()) {
  const owner = Object.keys(keymap).find((action) => keymap[action] === code) ?? null;
  const displaced = GAMEPLAY_ACTIONS.find((action) => (
    DEFAULT_KEYS[action] === code && keymap[action] !== code
  ));
  if (owner && (GAMEPLAY_ACTIONS.includes(owner) || displaced)) {
    const target = DEFAULT_KEYS[owner];
    return target === code
      ? Object.freeze({ type: 'pass', action: owner, code })
      : Object.freeze({ type: 'remap', action: owner, code: target });
  }
  if (displaced && !owner) {
    return Object.freeze({ type: 'block', action: displaced, code: null });
  }
  return Object.freeze({ type: 'pass', action: owner, code });
}

function isTypingTarget(target, excludedRoot) {
  if (!target) return false;
  if (excludedRoot?.contains?.(target)) return true;
  const tag = String(target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || target.isContentEditable === true;
}

export function installGameplayKeyAdapter({
  win = globalThis.window,
  doc = globalThis.document,
  excludedRoot = null,
} = {}) {
  if (!win?.addEventListener || !doc) return { destroy() {} };
  const current = installs.get(win);
  if (current) return current;

  function onKey(event) {
    if (event[REMAPPED_EVENT] || event.isComposing || isTypingTarget(event.target, excludedRoot)) return;
    const plan = gameplayKeyPlan(event.code);
    if (plan.type === 'pass') return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    if (plan.type !== 'remap') return;
    const KeyboardEventCtor = win.KeyboardEvent ?? globalThis.KeyboardEvent;
    if (typeof KeyboardEventCtor !== 'function') return;
    const remapped = new KeyboardEventCtor(event.type, {
      code: plan.code,
      key: event.key,
      bubbles: true,
      cancelable: true,
      repeat: event.repeat,
      location: event.location,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
    Object.defineProperty(remapped, REMAPPED_EVENT, { value: true });
    withCanonicalKeyDispatch(plan.code, () => {
      (event.target?.dispatchEvent ? event.target : doc).dispatchEvent(remapped);
    });
  }

  let promptQueued = false;
  const refreshPrompts = () => {
    promptQueued = false;
    projectGameplayKeyPrompts(doc, excludedRoot);
  };
  const schedulePromptRefresh = () => {
    if (promptQueued) return;
    promptQueued = true;
    queueMicrotask(refreshPrompts);
  };
  const PromptObserver = win.MutationObserver ?? globalThis.MutationObserver;
  const promptObserver = typeof PromptObserver === 'function'
    ? new PromptObserver((mutations) => {
      const relevant = mutations.some((mutation) => (
        mutation.target?.matches?.('kbd')
        || [...(mutation.addedNodes ?? [])].some((node) => (
          node?.matches?.('kbd') || node?.querySelector?.('kbd')
        ))
      ));
      if (relevant) schedulePromptRefresh();
    })
    : null;
  promptObserver?.observe?.(doc.documentElement ?? doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  const unsubscribePrompts = subscribe((_name) => schedulePromptRefresh());
  refreshPrompts();

  win.addEventListener('keydown', onKey, true);
  win.addEventListener('keyup', onKey, true);
  const api = {
    refreshPrompts,
    destroy() {
      win.removeEventListener('keydown', onKey, true);
      win.removeEventListener('keyup', onKey, true);
      promptObserver?.disconnect?.();
      unsubscribePrompts();
      installs.delete(win);
    },
  };
  installs.set(win, api);
  return api;
}

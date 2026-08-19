/**
 * Shared presentation policy for HUD live regions and terminal overlays.
 *
 * The scene Implementations continue writing their existing DOM. This Module
 * applies semantics at that stable DOM Seam: accessible live status regions,
 * focus ownership for completion/failure dialogs, focus return when they hide,
 * and durable mission-result rows on completion cards.
 */
import { populateMissionResults } from './mission-results.js';

export const HUD_REGION_SELECTOR = '#hud, #heist-hud, #br-hud, #drive-hud, #driveHud, #helm-hud, .ss-hud';
export const OBJECTIVE_REGION_SELECTOR = '#objective, #objectives, #objectiveBox, #br-objective, [data-hud-objective], .ss-objective, .ss-instruction, .ss-callout';
export const SUBTITLE_REGION_SELECTOR = '#subtitle, #subs, .ss-subs, #dialog';
export const TOAST_REGION_SELECTOR = '#toast-stack, #toasts, [data-toast-region]';

export const COMPLETION_MODAL_SELECTOR = [
  '#br-complete', '#endcard', '#ending', '#end', '#sceneCompleteOverlay',
  '#endCard', '#missionCard', '#mission-card', '#complete', '#overlay.ending',
  '[data-mission-complete]',
].join(',');
export const FAILURE_MODAL_SELECTOR = [
  '#death', '#deathOverlay', '#fail', '[data-mission-failure]',
].join(',');

const STYLE_ID = 'squatch-systemic-presentation-style';
const installs = new WeakMap();

function installStyle(doc) {
  if (!doc?.head || doc.getElementById?.(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .systemic-start-status {
      display: block;
      min-height: 1.25em;
      margin-top: .65rem;
      color: currentColor;
      font: 600 .78rem/1.35 system-ui, sans-serif;
      letter-spacing: .04em;
      opacity: .78;
    }
    .systemic-mission-results {
      display: grid;
      grid-template-columns: minmax(8rem, 1fr) auto;
      gap: .35rem 1.2rem;
      width: min(100%, 34rem);
      margin: 1.15rem auto;
      padding: .9rem 1rem;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(0,0,0,.24);
      text-align: left;
    }
    .systemic-mission-results dt { opacity: .72; }
    .systemic-mission-results dd { margin: 0; font-weight: 800; text-align: right; }
  `;
  doc.head.appendChild(style);
}

function setAttr(node, name, value) {
  if (node?.getAttribute?.(name) !== String(value)) node?.setAttribute?.(name, String(value));
}

function markLive(nodes, { role = 'status', live = 'polite', atomic = 'true' } = {}) {
  for (const node of nodes ?? []) {
    setAttr(node, 'role', node.getAttribute?.('role') || role);
    setAttr(node, 'aria-live', node.getAttribute?.('aria-live') || live);
    setAttr(node, 'aria-atomic', node.getAttribute?.('aria-atomic') || atomic);
  }
}

export function applyAccessiblePresentation(doc = globalThis.document) {
  if (!doc?.querySelectorAll) return Object.freeze({ hud: 0, objectives: 0, subtitles: 0, toasts: 0 });
  const hud = [...doc.querySelectorAll(HUD_REGION_SELECTOR)];
  const objectives = [...doc.querySelectorAll(OBJECTIVE_REGION_SELECTOR)];
  const subtitles = [...doc.querySelectorAll(SUBTITLE_REGION_SELECTOR)];
  const toasts = [...doc.querySelectorAll(TOAST_REGION_SELECTOR)];
  const live = doc.body?.classList?.contains?.('playing') === true;
  for (const node of hud) {
    setAttr(node, 'role', node.getAttribute?.('role') || 'region');
    setAttr(node, 'aria-label', node.getAttribute?.('aria-label') || 'Game status');
    if (live) setAttr(node, 'aria-hidden', 'false');
  }
  markLive(objectives);
  markLive(subtitles);
  markLive(toasts, { atomic: 'false' });
  return Object.freeze({
    hud: hud.length,
    objectives: objectives.length,
    subtitles: subtitles.length,
    toasts: toasts.length,
  });
}

function visiblyOpen(node, win) {
  if (!node?.isConnected || node.hidden === true || node.hasAttribute?.('hidden')) return false;
  if (node.classList?.contains?.('hidden') || node.getAttribute?.('aria-hidden') === 'true') return false;
  const style = win?.getComputedStyle?.(node);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

function qualifiesAsTerminalModal(node) {
  if (node?.id !== 'mission-card') return true;
  /* Cartel Palace and Graveyard use #mission-card for their TITLE card. The
   * Heist reuses that id only after it inserts the real verdict and exit. */
  return Boolean(node.querySelector?.('.verdict, #return-home, [data-mission-complete]'));
}

function focusable(node) {
  return [...(node?.querySelectorAll?.(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? [])].filter((item) => item.hidden !== true && !item.closest?.('.hidden'));
}

function focusHeading(node) {
  const heading = node.querySelector?.('[data-modal-initial-focus], .title, h1, h2') ?? node;
  if (!heading.hasAttribute?.('tabindex')) heading.setAttribute?.('tabindex', '-1');
  heading.focus?.({ preventScroll: true });
}

export function installSystemicPresentation({
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  if (!doc?.querySelectorAll || !win) return { destroy() {}, refresh() {} };
  const current = installs.get(doc);
  if (current) return current;
  installStyle(doc);
  applyAccessiblePresentation(doc);

  const tracked = new Map();
  let activeModal = null;
  let queued = false;

  function allModals() {
    return [...doc.querySelectorAll(`${COMPLETION_MODAL_SELECTOR},${FAILURE_MODAL_SELECTOR}`)]
      .filter(qualifiesAsTerminalModal);
  }

  function syncModal(node) {
    const open = visiblyOpen(node, win);
    const record = tracked.get(node) ?? { open: false, returnFocus: null };
    if (open && !record.open) {
      record.returnFocus = doc.activeElement && doc.activeElement !== doc.body
        ? doc.activeElement : null;
      setAttr(node, 'role', 'dialog');
      setAttr(node, 'aria-modal', 'true');
      if (!node.getAttribute?.('aria-label') && !node.getAttribute?.('aria-labelledby')) {
        const label = node.querySelector?.('.title, h1, h2, .kicker, .eyebrow')?.textContent?.trim();
        if (label) setAttr(node, 'aria-label', label);
      }
      if (node.matches?.(COMPLETION_MODAL_SELECTOR)) populateMissionResults(node);
      record.open = true;
      activeModal = node;
      queueMicrotask(() => { if (visiblyOpen(node, win)) focusHeading(node); });
    } else if (!open && record.open) {
      record.open = false;
      if (activeModal === node) activeModal = null;
      const target = record.returnFocus;
      record.returnFocus = null;
      if (target?.isConnected && !target.closest?.('.hidden')) {
        queueMicrotask(() => target.focus?.({ preventScroll: true }));
      }
    } else if (open && node.matches?.(COMPLETION_MODAL_SELECTOR)) {
      populateMissionResults(node);
    }
    tracked.set(node, record);
  }

  function refresh() {
    queued = false;
    applyAccessiblePresentation(doc);
    const present = new Set(allModals());
    for (const node of present) syncModal(node);
    for (const node of tracked.keys()) {
      if (!present.has(node)) syncModal(node);
    }
  }

  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(refresh);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || !activeModal || !visiblyOpen(activeModal, win)) return;
    const items = focusable(activeModal);
    if (!items.length) {
      event.preventDefault();
      activeModal.focus?.({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && (doc.activeElement === first || !activeModal.contains(doc.activeElement))) {
      event.preventDefault();
      last.focus?.({ preventScroll: true });
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus?.({ preventScroll: true });
    }
  }

  const Observer = win.MutationObserver ?? globalThis.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(scheduleRefresh) : null;
  observer?.observe?.(doc.documentElement ?? doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden'],
  });
  doc.addEventListener?.('keydown', trapFocus, true);
  refresh();

  const api = {
    refresh,
    destroy() {
      observer?.disconnect?.();
      doc.removeEventListener?.('keydown', trapFocus, true);
      installs.delete(doc);
    },
  };
  installs.set(doc, api);
  return api;
}

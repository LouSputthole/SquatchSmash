/**
 * Composition root for campaign-wide, non-audio polish Modules.
 *
 * Every public scene already mounts createPauseMenu(). That is the one shared
 * Seam where DOM semantics and capture-phase input policy can be installed
 * without replacing any scene Implementation. Lifecycle itself is composed by
 * pause-menu.js so it can order scene callbacks precisely.
 */
import { installGameplayKeyAdapter } from './gameplay-key-adapter.js';
import { installStartGate } from './start-gate.js';
import { installSystemicPresentation } from './systemic-presentation.js';

export const SYSTEMIC_POLISH_FIXES = Object.freeze([
  'accessible-live-regions',
  'terminal-modal-focus',
  'gameplay-action-rebinding',
  'shared-assist-timing',
  'reduced-motion',
  'hidden-tab-pause-lifecycle',
  'heavy-scene-initial-dpr',
  'idempotent-start-loading',
  'durable-completion-results',
]);

/**
 * Exact playable Implementations adopting the shared pause Seam. Bing routes
 * to either of its two Implementations from one public page, so both are named.
 * Initiation appears here deliberately: its source stays frozen while the
 * imported shared Modules improve its wrapper behavior.
 */
export const SYSTEMIC_SCENE_ADOPTERS = Object.freeze([
  'src/main.js',
  'src/bing/main.js',
  'src/bing/hotdog-main.js',
  'src/squatchfather/main.js',
  'src/beefrun/main.js',
  'src/graveyard/main.js',
  'src/motel/main.js',
  'src/nowake/main.js',
  'src/silver/main.js',
  'src/golf/main.js',
  'src/heist/main.js',
  'src/silvercase/main.js',
  'src/mansion/main.js',
  'src/mansion/siege/main.js',
  'src/enolasquatch/main.js',
  'src/cartel-palace/main.js',
  'src/initiation/main.js',
]);

export function installSystemicPolish({
  pauseRoot = null,
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  const presentation = installSystemicPresentation({ doc, win });
  const start = installStartGate({ doc, win });
  const keys = installGameplayKeyAdapter({ doc, win, excludedRoot: pauseRoot });
  const api = Object.freeze({ presentation, start, keys });
  if (win) win.__systemicPolish = api;
  return api;
}

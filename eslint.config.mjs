/**
 * Minimal correctness linting — added by the 2026-08-14 checks-that-lie pass.
 *
 * docs/ENGINE-TRAPS.md (entry 8, last paragraph): an assignment to an
 * undeclared `voiceSource` in src/silvercase/main.js was a strict-mode
 * ReferenceError behind a `hasSample()` guard, and it silently killed 60 of
 * The Silver Case's 76 recorded lines the moment the recordings landed.
 * "There is no linter in this repo that will do it for you." Now there is,
 * and no-undef is exactly the rule that would have caught it.
 *
 * Deliberately NO style rules — this project's prose-heavy comment style and
 * hand-aligned tables are its own business. Correctness only, so a red lint
 * is always worth stopping for.
 *
 * The config imports nothing on purpose: it must run from a bare
 * `npx eslint` (this repo's node_modules is a lean, shared tree), so the
 * host globals are written out here instead of pulling the `globals`
 * package. ESLint supplies the ECMAScript builtins itself from
 * `ecmaVersion`.
 */

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  screen: 'readonly',
  self: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  indexedDB: 'readonly',
  caches: 'readonly',
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  XMLHttpRequest: 'readonly',
  WebSocket: 'readonly',
  Worker: 'readonly',
  EventSource: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  DOMParser: 'readonly',
  Node: 'readonly',
  NodeList: 'readonly',
  Element: 'readonly',
  HTMLElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  HTMLVideoElement: 'readonly',
  SVGElement: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  PointerEvent: 'readonly',
  TouchEvent: 'readonly',
  WheelEvent: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  PerformanceObserver: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  requestIdleCallback: 'readonly',
  cancelIdleCallback: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  devicePixelRatio: 'readonly',
  innerWidth: 'readonly',
  innerHeight: 'readonly',
  addEventListener: 'readonly',
  removeEventListener: 'readonly',
  dispatchEvent: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  crypto: 'readonly',
  Image: 'readonly',
  Audio: 'readonly',
  HTMLMediaElement: 'readonly',
  HTMLImageElement: 'readonly',
  HTMLAudioElement: 'readonly',
  AudioNode: 'readonly',
  ImageData: 'readonly',
  ImageBitmap: 'readonly',
  createImageBitmap: 'readonly',
  OffscreenCanvas: 'readonly',
  CanvasRenderingContext2D: 'readonly',
  WebGLRenderingContext: 'readonly',
  WebGL2RenderingContext: 'readonly',
  AudioContext: 'readonly',
  webkitAudioContext: 'readonly',
  AudioBuffer: 'readonly',
  AudioParam: 'readonly',
  AnalyserNode: 'readonly',
  GainNode: 'readonly',
  OscillatorNode: 'readonly',
  MediaRecorder: 'readonly',
  MediaSource: 'readonly',
  Gamepad: 'readonly',
  GamepadEvent: 'readonly',
  Notification: 'readonly',
  ServiceWorker: 'readonly',
  CSS: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  Buffer: 'readonly',
  global: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  require: 'readonly',
  module: 'readonly',
  exports: 'writable',
};

export default [
  {
    ignores: [
      'node_modules/',
      '.claude/',          // agent worktrees live here; each is its own checkout
      'vendor/',           // three.js and addons, minified upstream code
      'lib/',              // three.js example modules, vendored
      'game/lib/',         // same, for the arcade build
      'assets/',
      'docs/',
      '_site/',
      'dist/',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...browserGlobals, ...nodeGlobals },
    },
    linterOptions: {
      // A disable comment with nothing left to disable is itself drift.
      reportUnusedDisableDirectives: 'warn',
    },
    rules: {
      /* The reason this file exists. */
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
      /* The smallest set of always-a-bug rules. No style. */
      'constructor-super': 'error',
      'getter-return': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',        // except-parens: `while ((m = re.exec()))` stays legal
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-obj-calls': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-this-before-super': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },

  /* Findings from the first run (2026-08-14 checks-that-lie pass) that are
   * INERT — no behavior difference — in files this pass does not own,
   * downgraded per-file so a red lint always means a live bug. The two live
   * no-undef hits (src/mansion/cast.js `marks`, src/silvercase/main.js
   * `MISSION_IDS`) are deliberately NOT downgraded: they are real
   * ReferenceErrors waiting on their code paths, reported to the lead, and
   * lint stays red until their owners fix them. */
  {
    // The apartment's props object spells the identical `setCeiling`
    // shorthand twice; the second wins and is the same function object.
    files: ['src/world/apartment.js'],
    rules: { 'no-dupe-keys': 'warn' },
  },
  {
    // A phone-screen builder keeps a superseded return block after its
    // real `return`; dead code, never executed.
    files: ['src/world/props.js'],
    rules: { 'no-unreachable': 'warn' },
  },
];

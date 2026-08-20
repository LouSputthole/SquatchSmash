/**
 * One persisted settings store for every scene.
 *
 * The Silver Room grew the first four switches (subtitles, larger subtitles,
 * reduce shake, assist) on its start screen and kept them in localStorage
 * under `squatch.*` "so when the flat and the Bing want them they are already
 * there". This is that promise kept: the same keys, the same encoding, so a
 * player's saved preferences carry over — plus master volume, mouse
 * sensitivity and a small keymap for the shared first-person player.
 *
 * Deliberately a plain module. `get`/`set`/`subscribe`, `applyBody()` for the
 * two CSS classes every subtitle honours, and a handful of small helpers that
 * read from it. No DOM or storage is touched at import time, so this is safe
 * to import from anything the Node test runner loads (core/audio.js,
 * core/player.js).
 */

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const bool = (store, fallback, decode) => ({
  store,
  fallback,
  decode: decode ?? ((raw) => raw === '1'),
  encode: (value) => (value ? '1' : '0'),
  coerce: (value) => Boolean(value),
});

const number = (store, fallback, min, max) => ({
  store,
  fallback,
  decode: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? clampNumber(n, min, max) : fallback;
  },
  encode: (value) => String(value),
  coerce: (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? clampNumber(n, min, max) : fallback;
  },
  min,
  max,
});

function clampNumber(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Physical `KeyboardEvent.code` the shared Player reads for each action. */
export const DEFAULT_KEYS = Object.freeze({
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  jump: 'Space',
  interact: 'KeyE',
  utility: 'KeyF',
  reload: 'KeyR',
  backAction: 'KeyQ',
});

/** Codes the shared Player treats as the same action as the default. */
const KEY_ALIASES = Object.freeze({
  sprint: ['ShiftRight'],
});

export const KEY_ACTIONS = Object.freeze([
  ['forward', 'Move forward'],
  ['back', 'Move back'],
  ['left', 'Strafe left'],
  ['right', 'Strafe right'],
  ['sprint', 'Sprint'],
  ['crouch', 'Crouch'],
  ['jump', 'Jump'],
  ['interact', 'Interact'],
  ['utility', 'Use / special'],
  ['reload', 'Reload / next'],
  ['backAction', 'Back / stow'],
]);

const SCHEMA = {
  /* The Silver Room's four, verbatim: same keys, same encoding, same defaults
   * ('subs' is on unless it was explicitly turned off). */
  subtitles: bool('squatch.subs', true, (raw) => raw !== '0'),
  bigSubtitles: bool('squatch.bigsubs', false),
  reduceShake: bool('squatch.reduceShake', false),
  assist: bool('squatch.assist', false),
  /* 0..1, a multiplier on top of whatever the scene sets its master to. */
  volume: number('squatch.volume', 1, 0, 1),
  /* Multiplier on each controller's own base sensitivity. */
  sensitivity: number('squatch.sensitivity', 1, 0.2, 3),
  keys: {
    store: 'squatch.keys',
    /* A GETTER, not one shared `{}`. readStored hands the fallback straight
     * back as the live cached value, so a single literal would alias the
     * schema default to the store: one caller mutating what get('keys')
     * returned would rewrite the default for the rest of the process, and
     * reload() would re-serve the polluted object — across tests included. */
    get fallback() { return {}; },
    decode: (raw) => {
      try {
        const parsed = JSON.parse(raw);
        return sanitizeKeys(parsed);
      } catch {
        return {};
      }
    },
    encode: (value) => JSON.stringify(value),
    coerce: (value) => sanitizeKeys(value),
  },
};

export const SETTING_NAMES = Object.freeze(Object.keys(SCHEMA));

/** Only known actions, only string codes, only overrides that differ. */
function sanitizeKeys(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const code = value[action];
    if (typeof code === 'string' && code && code !== DEFAULT_KEYS[action]) out[action] = code;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStored(name) {
  const spec = SCHEMA[name];
  const store = storage();
  if (!store) return spec.fallback;
  let raw = null;
  try {
    raw = store.getItem(spec.store);
  } catch {
    return spec.fallback;
  }
  return raw == null ? spec.fallback : spec.decode(raw);
}

function writeStored(name, value) {
  const spec = SCHEMA[name];
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(spec.store, spec.encode(value));
    return true;
  } catch {
    /* Private browsing or a full quota; it still applies this session. */
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* The store                                                           */
/* ------------------------------------------------------------------ */

/** Lazily read: nothing touches storage until somebody asks. */
let cache = null;
const listeners = new Set();

function ensureCache() {
  if (cache) return cache;
  cache = {};
  for (const name of SETTING_NAMES) cache[name] = readStored(name);
  return cache;
}

/** @returns {*} the current value of one setting. */
export function get(name) {
  if (!SCHEMA[name]) throw new Error(`Unknown setting: ${name}`);
  return ensureCache()[name];
}

/** A copy of every setting. */
export function getAll() {
  return { ...ensureCache() };
}

/**
 * Set one setting: coerced/clamped, persisted, applied to the body, and
 * announced to subscribers. Returns the value that was actually stored.
 */
export function set(name, value) {
  const spec = SCHEMA[name];
  if (!spec) throw new Error(`Unknown setting: ${name}`);
  const state = ensureCache();
  const next = spec.coerce(value);
  state[name] = next;
  writeStored(name, next);
  if (name === 'subtitles' || name === 'bigSubtitles' || name === 'reduceShake') applyBody();
  for (const fn of [...listeners]) {
    try {
      fn(name, next, state);
    } catch (error) {
      console.error('settings subscriber failed', error);
    }
  }
  return next;
}

/**
 * @param {function(string, *, object): void} fn  called as (name, value, all)
 * @returns {function(): void} unsubscribe
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Forget the cache (tests, or after another tab changed storage). */
export function reload() {
  cache = null;
  return ensureCache();
}

/**
 * Live accessor view: `live.assist` reads, `live.assist = true` sets. This is
 * the shape the Silver Room's local model had, so its debug surface and its
 * verifier keep working unchanged.
 */
export const live = {};
for (const name of SETTING_NAMES) {
  Object.defineProperty(live, name, {
    enumerable: true,
    get: () => get(name),
    set: (value) => { set(name, value); },
  });
}

/* ------------------------------------------------------------------ */
/* Body classes and the shared subtitle rules                          */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'squatch-settings-style';

/* Larger subtitles: one class, and everything that is a subtitle honours it.
 * The first four rules are the Silver Room's (formerly src/silver/silver.css),
 * moved here so every scene's subtitle bar answers to the same two switches;
 * the rest name the other scenes' own subtitle elements at a size that is
 * larger than each one's base:
 *   #subtitle          apartment, Bing, Silver, golf, motel, heist, cartel,
 *                      graveyard, NO WAKE, Beef Run, Enola (15–19px bases)
 *   #subtitleText      Mansion Siege (17px)
 *   #subs .line        Squatchfather; #subsLine  The Silver Case (vw clamps)
 *   .ss-line           Mansion mission HUD (18px)
 *   #dialog #line      Initiation (20px)
 * `nosubs` hides the passive bars only: a dialogue box with choices in it is
 * the conversation, not a caption of it, so it stays. */
const SUBTITLE_CSS = `
body.bigsubs #subtitle { font-size: 20px; line-height: 1.6; }
body.bigsubs #dialogue .line { font-size: 21px; }
body.bigsubs #dialogue .opt { font-size: 16px; }
body.bigsubs #dialogue .who { font-size: 13px; }
body.bigsubs #subtitle #subtitleText { font-size: 22px; line-height: 1.5; }
body.bigsubs #subs .line,
body.bigsubs #subs #subsLine { font-size: clamp(24px, 3vw, 34px); }
body.bigsubs .ss-subs .ss-line { font-size: 23px; }
body.bigsubs #dialog #line { font-size: 25px; }
body.nosubs #subtitle,
body.nosubs #subs,
body.nosubs .ss-subs { display: none !important; }
body.reduce-motion *,
body.reduce-motion *::before,
body.reduce-motion *::after {
  scroll-behavior: auto !important;
  animation-duration: .001ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: .001ms !important;
  transition-delay: 0ms !important;
}
`;

let motionMedia = null;
let motionMediaListening = false;

function reducedMotionMedia() {
  if (motionMedia) return motionMedia;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  return motionMedia;
}

function installMotionPreferenceListener() {
  const media = reducedMotionMedia();
  if (!media || motionMediaListening) return;
  const refresh = () => applyBody();
  if (typeof media.addEventListener === 'function') media.addEventListener('change', refresh);
  else if (typeof media.addListener === 'function') media.addListener(refresh);
  motionMediaListening = true;
}

function installStyle() {
  const doc = globalThis.document;
  if (!doc?.head?.appendChild || !doc.createElement || !doc.getElementById) return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SUBTITLE_CSS;
  doc.head.appendChild(style);
}

/** Put `nosubs` / `bigsubs` on <body> to match the store. Safe without a DOM. */
export function applyBody() {
  const body = globalThis.document?.body;
  if (!body?.classList) return false;
  installStyle();
  installMotionPreferenceListener();
  body.classList.toggle('nosubs', !get('subtitles'));
  body.classList.toggle('bigsubs', get('bigSubtitles'));
  body.classList.toggle('reduce-motion', reducedMotionEnabled());
  return true;
}

/* ------------------------------------------------------------------ */
/* Helpers other systems read                                          */
/* ------------------------------------------------------------------ */

/** How much of a camera shake to keep. Reduced is Silver's 0.3. */
export const REDUCED_SHAKE = 0.3;
export function shakeScale() {
  return reducedMotionEnabled() ? REDUCED_SHAKE : 1;
}

export function reducedMotionEnabled() {
  return get('reduceShake') || reducedMotionMedia()?.matches === true;
}

export function motionDuration(seconds, { minimum = 0.001 } = {}) {
  const duration = Math.max(0, Number(seconds) || 0);
  return reducedMotionEnabled() ? Math.min(duration, Math.max(0, minimum)) : duration;
}

/** `base` radians per pixel, scaled by the player's multiplier. */
export function lookSensitivity(base = 1) {
  return base * get('sensitivity');
}

/**
 * Make `target[prop]` a live sensitivity: reads return the base times the
 * current multiplier, so a slider moved in the pause menu takes effect on the
 * next mouse move; writes replace the base, so a scene that sets
 * `player.sensitivity = x` still gets x times the multiplier.
 */
export function bindLookSensitivity(target, base, prop = 'sensitivity') {
  let current = base;
  Object.defineProperty(target, prop, {
    configurable: true,
    enumerable: true,
    get: () => current * get('sensitivity'),
    set: (value) => { current = Number(value) || 0; },
  });
  return target;
}

/**
 * Drive an AudioEngine's user volume from the store, now and on every change.
 * The engine keeps its own scene-level master (mute toggles and the like);
 * this only moves the multiplier underneath it.
 */
export function bindAudioVolume(engine) {
  if (!engine || typeof engine.setUserVolume !== 'function') return () => {};
  engine.setUserVolume(get('volume'));
  return subscribe((name, value) => {
    if (name === 'volume') engine.setUserVolume(value);
  });
}

/* ------------------------------------------------------------------ */
/* Keymap                                                              */
/* ------------------------------------------------------------------ */

let canonicalKeyDispatch = null;

export function withCanonicalKeyDispatch(code, callback) {
  const previous = canonicalKeyDispatch;
  canonicalKeyDispatch = code;
  try {
    return callback();
  } finally {
    canonicalKeyDispatch = previous;
  }
}

/** The full action → code map, defaults filled in. */
export function getKeymap() {
  return { ...DEFAULT_KEYS, ...get('keys') };
}

/**
 * Bind one action to a physical code. If the code was another action's, the
 * two swap so nothing is left unreachable. Returns the new keymap.
 */
export function bindKey(action, code) {
  if (!(action in DEFAULT_KEYS)) throw new Error(`Unknown key action: ${action}`);
  if (typeof code !== 'string' || !code) return getKeymap();
  const map = getKeymap();
  const previous = map[action];
  for (const other of Object.keys(map)) {
    if (other !== action && map[other] === code) map[other] = previous;
  }
  map[action] = code;
  set('keys', map);
  return getKeymap();
}

export function resetKeys() {
  set('keys', {});
  return getKeymap();
}

/**
 * Translate a physical `event.code` into the code the shared Player expects.
 *
 * The Player reads its seven default codes directly (src/core/player.js), so
 * rather than teaching it about bindings, the scenes hand it a translated
 * code: whatever the player bound to "forward" arrives as KeyW; a default
 * code whose action has moved elsewhere arrives as something the Player does
 * not read, so the old key stops working; anything else passes through.
 */
export function translateKey(code) {
  if (canonicalKeyDispatch === code) return code;
  const overrides = get('keys');
  const actions = Object.keys(overrides);
  if (!actions.length) return code;
  for (const action of actions) {
    if (overrides[action] === code) return DEFAULT_KEYS[action];
  }
  for (const action of actions) {
    if (code === DEFAULT_KEYS[action] || KEY_ALIASES[action]?.includes(code)) {
      return `Unbound:${code}`;
    }
  }
  return code;
}

/** "Left Shift", "Space", "W", "Arrow Up" — a code a person can read. */
export function keyLabel(code) {
  if (typeof code !== 'string' || !code) return '—';
  const named = {
    Space: 'Space',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    CapsLock: 'Caps Lock',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Escape: 'Esc',
  };
  if (named[code]) return named[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(.+)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  m = /^Arrow(Up|Down|Left|Right)$/.exec(code);
  if (m) return `Arrow ${m[1]}`;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const GAMEPLAY_TEXT_ACTIONS = Object.freeze({
  E: 'interact',
  F: 'utility',
  R: 'reload',
  Q: 'backAction',
});

export function projectGameplayKeysInText(value, keymap = getKeymap()) {
  return String(value ?? '').replace(/\b([EFRQ])\b/g, (label) => {
    const action = GAMEPLAY_TEXT_ACTIONS[label];
    return keyLabel(keymap[action] ?? DEFAULT_KEYS[action]);
  });
}

/**
 * DEAD GIVEAWAY — the socket.io wrapper every other Dead Giveaway module talks
 * through. Wire protocol: docs/DEAD-GIVEAWAY-PROTOCOL.md. Contract:
 * docs/DEAD-GIVEAWAY.md, "src/core/online/dg-client.js".
 *
 * What it owns, and nobody else should:
 *   - the server URL (`?server=` -> localStorage `dg.server` -> page origin);
 *   - the clientId (localStorage `dg.clientId`, one per browser);
 *   - the room session (sessionStorage `dg.session`), so a reload of the same
 *     tab walks back into the same seat with the same role and lives;
 *   - reconnection, forever, 1-10 s backoff, and the rejoin that follows it:
 *     `room:join` with the token, THEN the last `media:state`, THEN a local
 *     'reconnect' event the media engine answers with its `rtc:hello`.
 *
 * `room:closed {reason:'replaced'}` (this player joined again on another
 * socket) ends this client for good: no reconnect, no rejoin. The other
 * socket has the seat.
 *
 * The page never emits `room:leave` on unload. A reload must be able to
 * resume; a closed tab simply runs out the server's 90 s grace.
 *
 * Fire-and-forget emits are DROPPED while the socket is down or the rejoin is
 * still in flight. socket.io would otherwise buffer them and replay them ahead
 * of `room:join`, where the server rejects every one of them as "not in a
 * room" -- and a stale burst of poses is worth nothing anyway.
 *
 * The vendored client is imported by relative path, not through the
 * importmap, so the module also loads under Node for the tests (which inject
 * a fake `io` and never open a socket).
 */

import { io as vendoredIo } from '../../../vendor/socket.io.esm.min.js';

export const DG_SOCKET_PATH = '/dg/socket';
export const SESSION_KEY = 'dg.session';
export const CLIENT_ID_KEY = 'dg.clientId';
export const SERVER_KEY = 'dg.server';
export const RECONNECT_MIN_MS = 1000;
export const RECONNECT_MAX_MS = 10000;
export const REQUEST_TIMEOUT_MS = 8000;

/* Events that are produced locally rather than relayed from the server. */
const LOCAL_EVENTS = new Set(['connect', 'disconnect', 'reconnect', 'state', 'room:closed']);

/* A session the server has definitively refused. Anything else (a timeout, a
 * rate limit) leaves the session where it is so the next attempt can use it. */
const SESSION_FATAL = new Set(['room_not_found', 'invalid', 'room_full', 'bad_name', 'bad_character']);

/** Storage that may be missing or may throw (private mode, blocked site data). */
function safeStorage(getStorage) {
  let backing = null;
  try { backing = getStorage(); } catch { backing = null; }
  const memory = new Map();
  return {
    get(key) {
      try { if (backing) return backing.getItem(key); } catch { /* fall through */ }
      return memory.has(key) ? memory.get(key) : null;
    },
    set(key, value) {
      try { if (backing) { backing.setItem(key, value); return; } } catch { /* fall through */ }
      memory.set(key, value);
    },
    remove(key) {
      try { if (backing) backing.removeItem(key); } catch { /* fall through */ }
      memory.delete(key);
    },
  };
}

function wrapStorage(storage, fallback) {
  if (!storage) return safeStorage(fallback);
  /* Already one of ours, or a plain {getItem,setItem,removeItem}. */
  if (typeof storage.get === 'function' && typeof storage.set === 'function') return storage;
  return safeStorage(() => storage);
}

/** Trim, default the scheme, drop a trailing slash. '' stays ''. */
export function normalizeServerUrl(raw, pageProtocol = 'http:') {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `${pageProtocol === 'https:' ? 'https:' : 'http:'}//${value}`;
  return withScheme.replace(/\/+$/, '');
}

/**
 * Where the server is. Pure: every input is passed in.
 *   explicit `url` argument -> `?server=` -> localStorage `dg.server` -> page origin.
 * An empty string anywhere means "not set here, keep looking".
 */
export function resolveServerUrl({ url = '', search = '', stored = null, origin = '', protocol = 'http:' } = {}) {
  const explicit = normalizeServerUrl(url, protocol);
  if (explicit) return explicit;
  let fromQuery = '';
  try { fromQuery = new URLSearchParams(search || '').get('server') || ''; } catch { fromQuery = ''; }
  const queried = normalizeServerUrl(fromQuery, protocol);
  if (queried) return queried;
  const remembered = normalizeServerUrl(stored || '', protocol);
  if (remembered) return remembered;
  return normalizeServerUrl(origin || '', protocol);
}

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fall through */ }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** The browser's clientId, minted once and kept. */
export function ensureClientId(local) {
  const existing = local.get(CLIENT_ID_KEY);
  if (typeof existing === 'string' && existing.length >= 8) return existing;
  const id = randomId();
  local.set(CLIENT_ID_KEY, id);
  return id;
}

/** {code, playerId, token, name, character} or null. */
export function readSession(session) {
  const raw = session.get(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === 'string' && typeof parsed.token === 'string'
      && typeof parsed.playerId === 'string') return parsed;
  } catch { /* corrupt: treat as none */ }
  return null;
}

export function writeSession(session, value) {
  if (!value) { session.remove(SESSION_KEY); return; }
  session.set(SESSION_KEY, JSON.stringify(value));
}

/** An Error whose message IS the protocol's error code. */
export function ackError(ack, fallback = 'invalid') {
  const code = (ack && typeof ack.error === 'string' && ack.error) || fallback;
  const err = new Error(code);
  err.code = code;
  if (ack && typeof ack.message === 'string') err.detail = ack.message;
  return err;
}

function defaultLocation() {
  try { return globalThis.location || null; } catch { return null; }
}

/**
 * connectDeadGiveaway({ url, path }) -> client. See the contract doc.
 * Test seams (all optional): `io`, `local`, `session` (Storage-like),
 * `location` ({search, origin, protocol}), `timeoutMs`, `setTimeout`.
 */
export function connectDeadGiveaway({
  url = '',
  path = DG_SOCKET_PATH,
  io = vendoredIo,
  local: localStore = null,
  session: sessionStore = null,
  location = defaultLocation(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  setTimeout: setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimeout: clearTimer = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  const local = wrapStorage(localStore, () => globalThis.localStorage);
  const session = wrapStorage(sessionStore, () => globalThis.sessionStorage);
  const serverUrl = resolveServerUrl({
    url,
    search: location?.search || '',
    stored: local.get(SERVER_KEY),
    origin: location?.origin || '',
    protocol: location?.protocol || 'http:',
  });
  const clientId = ensureClientId(local);

  const listeners = new Map();          // event -> Set<fn>
  const wired = new Set();              // server events already bound on the socket
  let closed = false;
  let everConnected = false;
  let rejoining = false;
  let lastMediaState = null;
  let restartTimer = null;

  const socket = io(serverUrl || undefined, {
    path,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECT_MIN_MS,
    reconnectionDelayMax: RECONNECT_MAX_MS,
    randomizationFactor: 0.5,
    timeout: 10000,
  });

  function dispatch(event, ...args) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (err) { console.error(`[DeadGiveaway] '${event}' listener threw:`, err); }
    }
  }

  function bindServerEvent(event) {
    if (wired.has(event) || LOCAL_EVENTS.has(event)) return;
    wired.add(event);
    socket.on(event, (...args) => dispatch(event, ...args));
  }

  function rememberSession(ack, name, character) {
    const code = ack.code || ack.state?.code || client.me?.code || null;
    client.me = { playerId: ack.playerId, token: ack.token, code };
    writeSession(session, { code, playerId: ack.playerId, token: ack.token, name, character });
  }

  function forget() {
    writeSession(session, null);
    client.me = null;
    client.state = null;
    lastMediaState = null;
  }

  function acceptState(state) {
    if (!state || typeof state !== 'object') return;
    client.state = state;
    dispatch('state', state);
  }

  function request(event, payload = {}, { timeout = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      if (closed) { reject(ackError({ error: 'closed' })); return; }
      let settled = false;
      const timer = setTimer(() => {
        if (settled) return;
        settled = true;
        reject(ackError({ error: 'timeout', message: `${event} got no ack in ${timeout} ms` }));
      }, timeout);
      socket.emit(event, payload, (ack) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        if (!ack || ack.ok !== true) { reject(ackError(ack)); return; }
        if (ack.state) acceptState(ack.state);
        resolve(ack);
      });
    });
  }

  function joinWith(saved) {
    return request('room:join', {
      clientId,
      code: saved.code,
      name: saved.name,
      character: saved.character,
      token: saved.token,
    });
  }

  /* After the socket comes back: rejoin, restore media flags, then tell the
   * media engine (which answers with rtc:hello). */
  async function rejoin() {
    const saved = readSession(session);
    if (!saved) { dispatch('reconnect', { rejoined: false, state: client.state }); return; }
    rejoining = true;
    try {
      const ack = await joinWith(saved);
      rememberSession({ ...ack, code: ack.state?.code || saved.code }, saved.name, saved.character);
      rejoining = false;
      if (lastMediaState) socket.emit('media:state', lastMediaState);
      dispatch('reconnect', { rejoined: true, state: client.state });
    } catch (err) {
      rejoining = false;
      if (SESSION_FATAL.has(err.code)) {
        forget();
        dispatch('room:closed', { reason: err.code });
      } else {
        dispatch('error', { code: err.code, message: err.detail || err.message });
      }
      dispatch('reconnect', { rejoined: false, state: client.state, error: err.code });
    }
  }

  socket.on('connect', () => {
    if (restartTimer) { clearTimer(restartTimer); restartTimer = null; }
    const first = !everConnected;
    everConnected = true;
    dispatch('connect', { first });
    if (!first) void rejoin();
  });

  socket.on('disconnect', (reason) => {
    dispatch('disconnect', { reason });
    /* socket.io does not retry a server-side disconnect by itself. "Forever"
     * means forever, so ask again after the minimum backoff. */
    if (!closed && reason === 'io server disconnect') {
      restartTimer = setTimer(() => { restartTimer = null; if (!closed) socket.connect(); }, RECONNECT_MIN_MS);
    }
  });

  socket.on('state', (state) => acceptState(state));

  socket.on('room:closed', (payload) => {
    const reason = payload?.reason;
    forget();
    if (reason === 'replaced') {
      /* The same player joined on another socket (a duplicated tab, a second
       * window). That socket owns the seat now: this one must NOT reconnect
       * and rejoin, or the two would take the seat off each other forever. */
      client.replaced = true;
      closed = true;
      if (restartTimer) { clearTimer(restartTimer); restartTimer = null; }
      try { socket.disconnect(); } catch { /* already gone */ }
    }
    dispatch('room:closed', payload || {});
  });

  const client = {
    serverUrl,
    clientId,
    socket,
    state: null,
    me: null,
    replaced: false,

    get connected() { return !!socket.connected; },

    on(event, fn) {
      if (typeof fn !== 'function') return client;
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      bindServerEvent(event);
      return client;
    },

    off(event, fn) {
      listeners.get(event)?.delete(fn);
      return client;
    },

    /** Fire-and-forget. Returns false when the emit was dropped. */
    emit(event, payload = {}) {
      if (event === 'media:state' && payload && typeof payload === 'object') {
        lastMediaState = { mic: !!payload.mic, cam: !!payload.cam };
      }
      if (closed || !socket.connected || rejoining) return false;
      if (event === 'pose' && socket.volatile) socket.volatile.emit(event, payload);
      else socket.emit(event, payload);
      return true;
    },

    request,

    async create({ name, character }) {
      const ack = await request('room:create', { clientId, name, character });
      rememberSession(ack, name, character);
      return client.state;
    },

    async join({ code, name, character }) {
      const roomCode = String(code || '').trim().toUpperCase();
      const saved = readSession(session);
      const payload = { clientId, code: roomCode, name, character };
      /* Same tab, same room: keep the seat rather than taking a second one. */
      if (saved && saved.code === roomCode) payload.token = saved.token;
      const ack = await request('room:join', payload);
      rememberSession({ ...ack, code: ack.state?.code || roomCode }, name, character);
      return client.state;
    },

    async resume() {
      const saved = readSession(session);
      if (!saved) return null;
      try {
        const ack = await joinWith(saved);
        rememberSession({ ...ack, code: ack.state?.code || saved.code }, saved.name, saved.character);
        return client.state;
      } catch (err) {
        if (SESSION_FATAL.has(err.code)) { forget(); return null; }
        throw err;
      }
    },

    async leave() {
      const wasIn = !!client.me;
      try {
        if (wasIn && socket.connected) await request('room:leave', {}, { timeout: 3000 });
      } catch { /* leaving anyway */ } finally {
        forget();
      }
    },

    /** The saved session (for the lobby's "rejoin?" prompt), or null. */
    savedSession() { return readSession(session); },

    /** Remember a server URL for next time ('' forgets it). */
    rememberServer(value) {
      const normalized = normalizeServerUrl(value, location?.protocol || 'http:');
      if (normalized) local.set(SERVER_KEY, normalized);
      else local.remove(SERVER_KEY);
    },

    close() {
      if (closed) return;
      closed = true;
      if (restartTimer) { clearTimer(restartTimer); restartTimer = null; }
      try { socket.disconnect(); } catch { /* already gone */ }
      listeners.clear();
    },
  };

  /* `client.on` for a server event binds lazily; these are bound up front so
   * an early 'error' is never lost before the UI subscribes. */
  bindServerEvent('error');

  return client;
}

/**
 * Dead Giveaway: src/core/online/dg-client.js, against a fake socket.
 *
 * The things a real network would make hard to see: which server URL wins,
 * that the session survives a reload in sessionStorage and the clientId in
 * localStorage, that a refused ack rejects with the protocol's error CODE,
 * and the exact order after a reconnect -- room:join with the token, then
 * the last media:state, then the local 'reconnect' the media engine answers
 * with rtc:hello. Nothing here opens a socket.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectDeadGiveaway, resolveServerUrl, normalizeServerUrl, readSession,
  SESSION_KEY, CLIENT_ID_KEY, SERVER_KEY, DG_SOCKET_PATH, RECONNECT_MIN_MS, RECONNECT_MAX_MS,
} from '../src/core/online/dg-client.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** Just enough of a socket.io client Socket. `server` answers acks. */
function fakeIo(server = () => ({ ok: true })) {
  const made = [];
  const io = (url, opts) => {
    const handlers = new Map();
    const socket = {
      url, opts, connected: false, sent: [], volatileSent: [], disconnected: false, connectCalls: 0,
      on(event, fn) { if (!handlers.has(event)) handlers.set(event, []); handlers.get(event).push(fn); return socket; },
      off() { return socket; },
      emit(event, payload, ack) {
        socket.sent.push({ event, payload });
        if (typeof ack === 'function') {
          const reply = server(event, payload, socket);
          if (reply !== undefined) queueMicrotask(() => ack(reply));
        }
        return socket;
      },
      volatile: { emit(event, payload) { socket.volatileSent.push({ event, payload }); } },
      disconnect() { socket.disconnected = true; socket.connected = false; },
      connect() { socket.connectCalls++; },
      /* Test drivers. */
      fire(event, ...args) { for (const fn of handlers.get(event) || []) fn(...args); },
      up() { socket.connected = true; socket.fire('connect'); },
      down(reason = 'transport close') { socket.connected = false; socket.fire('disconnect', reason); },
    };
    made.push(socket);
    return socket;
  };
  io.made = made;
  return io;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const LOC = { search: '', origin: 'https://lou.example', protocol: 'https:' };

function stateFor(code, playerId) {
  return { code, phase: 'LOBBY', players: [{ id: playerId, joinSeq: 1, connected: true }], me: { playerId, role: null, targetIndex: null } };
}

test('server URL: explicit argument, then ?server=, then localStorage dg.server, then the page origin', () => {
  const origin = 'https://lou.example';
  assert.equal(resolveServerUrl({ url: 'http://a:1', search: '?server=http://b:2', stored: 'http://c:3', origin }), 'http://a:1');
  assert.equal(resolveServerUrl({ url: '', search: '?server=http://b:2', stored: 'http://c:3', origin }), 'http://b:2');
  assert.equal(resolveServerUrl({ url: '', search: '?tier=low', stored: 'http://c:3', origin }), 'http://c:3');
  assert.equal(resolveServerUrl({ url: '', search: '', stored: null, origin }), origin);
  assert.equal(resolveServerUrl({ url: '  ', search: '?server=', stored: '', origin }), origin, 'blank values do not count');
  assert.equal(normalizeServerUrl('192.168.1.20:3100/', 'http:'), 'http://192.168.1.20:3100', 'scheme defaulted, slash dropped');
  assert.equal(normalizeServerUrl('dg.example', 'https:'), 'https://dg.example');
});

test('the client connects to the resolved URL on /dg/socket and reconnects forever, 1-10 s', () => {
  const io = fakeIo();
  const local = memoryStorage({ [SERVER_KEY]: 'http://stored:3100' });
  connectDeadGiveaway({ io, local, session: memoryStorage(), location: { ...LOC, search: '?server=http://query:3100' } });
  const [socket] = io.made;
  assert.equal(socket.url, 'http://query:3100');
  assert.equal(socket.opts.path, DG_SOCKET_PATH);
  assert.equal(socket.opts.reconnection, true);
  assert.equal(socket.opts.reconnectionAttempts, Infinity);
  assert.equal(socket.opts.reconnectionDelay, RECONNECT_MIN_MS);
  assert.equal(socket.opts.reconnectionDelayMax, RECONNECT_MAX_MS);
  assert.equal(RECONNECT_MIN_MS, 1000);
  assert.equal(RECONNECT_MAX_MS, 10000);
});

test('clientId is minted once into localStorage and reused', () => {
  const local = memoryStorage();
  const a = connectDeadGiveaway({ io: fakeIo(), local, session: memoryStorage(), location: LOC });
  const id = local.getItem(CLIENT_ID_KEY);
  assert.ok(id && id.length >= 8);
  assert.equal(a.clientId, id);
  const b = connectDeadGiveaway({ io: fakeIo(), local, session: memoryStorage(), location: LOC });
  assert.equal(b.clientId, id);
});

test('create stores {code, playerId, token} in sessionStorage; resume after a reload rejoins with the token', async () => {
  const session = memoryStorage();
  const local = memoryStorage();
  const server = (event, payload) => {
    if (event === 'room:create') return { ok: true, code: 'BING7', playerId: 'p_lou', token: 'tok1', state: stateFor('BING7', 'p_lou') };
    if (event === 'room:join') {
      assert.equal(payload.token, 'tok1', 'the resume carries the token');
      assert.equal(payload.code, 'BING7');
      assert.equal(payload.name, 'Lou');
      assert.equal(payload.character, 'lou');
      return { ok: true, playerId: 'p_lou', token: 'tok1', state: stateFor('BING7', 'p_lou') };
    }
    return { ok: true };
  };
  const first = connectDeadGiveaway({ io: fakeIo(server), local, session, location: LOC });
  const seen = [];
  first.on('state', (s) => seen.push(s.code));
  const state = await first.create({ name: 'Lou', character: 'lou' });
  assert.equal(state.code, 'BING7');
  assert.deepEqual(seen, ['BING7']);
  assert.deepEqual(first.me, { playerId: 'p_lou', token: 'tok1', code: 'BING7' });
  const saved = readSession({ get: (k) => session.getItem(k) });
  assert.equal(saved.code, 'BING7');
  assert.equal(saved.playerId, 'p_lou');
  assert.equal(saved.token, 'tok1');
  assert.ok(JSON.parse(session.getItem(SESSION_KEY)).token === 'tok1');

  /* "Reload": a fresh client over the same storages. */
  const second = connectDeadGiveaway({ io: fakeIo(server), local, session, location: LOC });
  const resumed = await second.resume();
  assert.equal(resumed.code, 'BING7');
  assert.equal(second.me.playerId, 'p_lou');
  assert.equal(second.clientId, first.clientId);
});

test('resume with nothing saved is null; a room that is gone clears the session and is null', async () => {
  const session = memoryStorage();
  const empty = connectDeadGiveaway({ io: fakeIo(), local: memoryStorage(), session, location: LOC });
  assert.equal(await empty.resume(), null);

  session.setItem(SESSION_KEY, JSON.stringify({ code: 'GONE2', playerId: 'p_x', token: 't', name: 'X', character: 'lou' }));
  const gone = connectDeadGiveaway({
    io: fakeIo(() => ({ ok: false, error: 'room_not_found', message: 'no such room' })),
    local: memoryStorage(), session, location: LOC,
  });
  assert.equal(await gone.resume(), null);
  assert.equal(session.getItem(SESSION_KEY), null, 'the dead session is forgotten');
});

test('request() rejects with Error(code) on {ok:false}, and with "timeout" when nothing answers', async () => {
  const client = connectDeadGiveaway({
    io: fakeIo((event) => (event === 'game:start' ? { ok: false, error: 'not_host', message: 'Only the host can start.' } : undefined)),
    local: memoryStorage(), session: memoryStorage(), location: LOC, timeoutMs: 20,
  });
  await assert.rejects(client.request('game:start', {}), (err) => {
    assert.equal(err.message, 'not_host');
    assert.equal(err.code, 'not_host');
    assert.equal(err.detail, 'Only the host can start.');
    return true;
  });
  await assert.rejects(client.request('game:vote', { target: 'p_a' }), (err) => err.code === 'timeout');
});

test('join upper-cases the code and keeps this tab\'s token only for the same room', async () => {
  const session = memoryStorage({ [SESSION_KEY]: JSON.stringify({ code: 'BING7', playerId: 'p_a', token: 'tA', name: 'A', character: 'lou' }) });
  const joins = [];
  const io = fakeIo((event, payload) => {
    if (event === 'room:join') { joins.push(payload); return { ok: true, playerId: 'p_a', token: 'tA2', state: stateFor(payload.code, 'p_a') }; }
    return { ok: true };
  });
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session, location: LOC });
  await client.join({ code: ' bing7 ', name: 'A', character: 'lou' });
  await client.join({ code: 'OTHR2', name: 'A', character: 'lou' });
  assert.equal(joins[0].code, 'BING7');
  assert.equal(joins[0].token, 'tA');
  assert.equal(joins[1].token, undefined, 'a different room never sees this room\'s token');
});

test('fire-and-forget is dropped while disconnected; pose goes volatile', () => {
  const io = fakeIo();
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session: memoryStorage(), location: LOC });
  const [socket] = io.made;
  assert.equal(client.emit('chat', { text: 'hello' }), false, 'down: dropped, not buffered');
  socket.up();
  assert.equal(client.emit('chat', { text: 'hello' }), true);
  client.emit('pose', { yaw: 1, pitch: 0 });
  assert.deepEqual(socket.volatileSent, [{ event: 'pose', payload: { yaw: 1, pitch: 0 } }]);
  assert.ok(socket.sent.some((s) => s.event === 'chat'));
});

test('reconnect: room:join with the token, THEN the last media:state, THEN the local reconnect event', async () => {
  const order = [];
  const io = fakeIo((event, payload) => {
    if (event === 'room:create') return { ok: true, code: 'BING7', playerId: 'p_lou', token: 'tok1', state: stateFor('BING7', 'p_lou') };
    if (event === 'room:join') return { ok: true, playerId: 'p_lou', token: 'tok1', state: stateFor('BING7', 'p_lou') };
    return { ok: true };
  });
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session: memoryStorage(), location: LOC });
  const [socket] = io.made;
  const connects = [];
  client.on('connect', (e) => connects.push(e.first));
  socket.up();
  await client.create({ name: 'Lou', character: 'lou' });
  client.emit('media:state', { mic: true, cam: false });
  client.emit('media:state', { mic: true, cam: true });   // the LATEST is what gets restored

  client.on('reconnect', (e) => order.push(['reconnect', e.rejoined]));
  client.on('disconnect', () => order.push(['disconnect']));
  socket.down();
  /* Anything emitted while down is dropped, but media:state is still remembered. */
  client.emit('media:state', { mic: false, cam: true });
  const sentBefore = socket.sent.length;
  socket.up();
  await flush();
  await flush();
  const after = socket.sent.slice(sentBefore).map((s) => [s.event, s.payload]);
  assert.equal(after[0][0], 'room:join');
  assert.equal(after[0][1].token, 'tok1');
  assert.equal(after[0][1].code, 'BING7');
  assert.deepEqual(after[1], ['media:state', { mic: false, cam: true }]);
  assert.deepEqual(order, [['disconnect'], ['reconnect', true]]);
  assert.deepEqual(connects, [true, false]);
  assert.equal(client.state.code, 'BING7');
});

test('reconnect into a room that closed: session cleared, room:closed raised, reconnect says not rejoined', async () => {
  const session = memoryStorage({ [SESSION_KEY]: JSON.stringify({ code: 'BING7', playerId: 'p_a', token: 't', name: 'A', character: 'lou' }) });
  const io = fakeIo((event) => (event === 'room:join' ? { ok: false, error: 'room_not_found' } : { ok: true }));
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session, location: LOC });
  const [socket] = io.made;
  const events = [];
  client.on('room:closed', (e) => events.push(['closed', e.reason]));
  client.on('reconnect', (e) => events.push(['reconnect', e.rejoined]));
  socket.up();
  socket.down();
  socket.up();
  await flush();
  await flush();
  assert.deepEqual(events, [['closed', 'room_not_found'], ['reconnect', false]]);
  assert.equal(session.getItem(SESSION_KEY), null);
});

test('a server-side disconnect is retried too (socket.io would give up), and close() stops it', async () => {
  const io = fakeIo();
  const timers = [];
  const client = connectDeadGiveaway({
    io, local: memoryStorage(), session: memoryStorage(), location: LOC,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  const [socket] = io.made;
  socket.up();
  socket.down('io server disconnect');
  assert.equal(timers.at(-1).ms, RECONNECT_MIN_MS);
  timers.at(-1).fn();
  assert.equal(socket.connectCalls, 1);
  client.close();
  assert.equal(socket.disconnected, true);
});

test('leave sends room:leave and forgets the session; server room:closed forgets it too', async () => {
  const session = memoryStorage();
  const io = fakeIo((event) => (event === 'room:create'
    ? { ok: true, code: 'BING7', playerId: 'p', token: 't', state: stateFor('BING7', 'p') } : { ok: true }));
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session, location: LOC });
  const [socket] = io.made;
  socket.up();
  await client.create({ name: 'Lou', character: 'lou' });
  await client.leave();
  assert.ok(socket.sent.some((s) => s.event === 'room:leave'));
  assert.equal(session.getItem(SESSION_KEY), null);
  assert.equal(client.me, null);

  await client.create({ name: 'Lou', character: 'lou' });
  const closed = [];
  client.on('room:closed', (e) => closed.push(e.reason));
  socket.fire('room:closed', { reason: 'host_ended' });
  assert.deepEqual(closed, ['host_ended']);
  assert.equal(session.getItem(SESSION_KEY), null);
});

test('server events reach listeners: rtc:signal, pose, error', () => {
  const io = fakeIo();
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session: memoryStorage(), location: LOC });
  const [socket] = io.made;
  const got = [];
  client.on('rtc:signal', (m) => got.push(['sig', m.from]));
  client.on('pose', (m) => got.push(['pose', m.playerId]));
  client.on('error', (m) => got.push(['err', m.code]));
  socket.fire('rtc:signal', { from: 'p_b', data: {} });
  socket.fire('pose', { playerId: 'p_c', yaw: 0, pitch: 0 });
  socket.fire('error', { code: 'rate_limited' });
  assert.deepEqual(got, [['sig', 'p_b'], ['pose', 'p_c'], ['err', 'rate_limited']]);
});

test('room:closed {reason:replaced}: this client stops for good -- no reconnect, no rejoin', async () => {
  const session = memoryStorage({ [SESSION_KEY]: JSON.stringify({ code: 'BING7', playerId: 'p_a', token: 't', name: 'A', character: 'lou' }) });
  const timers = [];
  const io = fakeIo(() => ({ ok: true, playerId: 'p_a', token: 't', state: stateFor('BING7', 'p_a') }));
  const client = connectDeadGiveaway({
    io, local: memoryStorage(), session, location: LOC,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  const [socket] = io.made;
  const closedWith = [];
  client.on('room:closed', (e) => closedWith.push(e.reason));
  socket.up();
  socket.fire('room:closed', { reason: 'replaced' });
  assert.deepEqual(closedWith, ['replaced']);
  assert.equal(client.replaced, true);
  assert.equal(socket.disconnected, true, 'the socket is shut, so socket.io will not reconnect it');
  assert.equal(session.getItem(SESSION_KEY), null, 'this tab forgets the seat');
  socket.fire('disconnect', 'io server disconnect');
  assert.equal(timers.filter((t) => t.ms === RECONNECT_MIN_MS).length, 0, 'and does not ask to reconnect');
  assert.equal(client.emit('chat', { text: 'still here?' }), false);
});

test('a token rejoin always carries name and character too', async () => {
  const session = memoryStorage({ [SESSION_KEY]: JSON.stringify({ code: 'BING7', playerId: 'p_a', token: 't', name: 'Booski', character: 'booski' }) });
  const joins = [];
  const io = fakeIo((event, payload) => { if (event === 'room:join') joins.push(payload); return { ok: true, playerId: 'p_a', token: 't', state: stateFor('BING7', 'p_a') }; });
  const client = connectDeadGiveaway({ io, local: memoryStorage(), session, location: LOC });
  await client.resume();
  const [socket] = io.made;
  socket.up(); socket.down(); socket.up();
  await flush(); await flush();
  assert.equal(joins.length, 2);
  for (const j of joins) {
    assert.equal(j.token, 't');
    assert.equal(j.name, 'Booski');
    assert.equal(j.character, 'booski');
    assert.equal(j.clientId, client.clientId);
  }
});

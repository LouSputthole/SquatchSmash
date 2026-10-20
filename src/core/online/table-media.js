/**
 * DEAD GIVEAWAY — the full-mesh WebRTC engine: one RTCPeerConnection per
 * remote PLAYER, mic always sent (muted = track.enabled false), camera on a
 * dedicated video transceiver, local VAD, per-player gain and pan, output
 * device selection, quality from getStats, ICE restart, clean teardown.
 *
 * A vanilla port of Campfire's engine (Squatch-Bunker/squatch-chat
 * components/VoicePanel.tsx + lib/mediaDeviceSettings.ts). The numbers below
 * are theirs and were proven in that app; keep them unless you measured
 * better ones:
 *   audio   echoCancellation / noiseSuppression / autoGainControl all true,
 *           deviceId EXACT, falling back to the default device on
 *           NotFoundError / OverconstrainedError (a stale saved id)
 *   camera  640x480 ideal, 24 fps ideal
 *   VAD     AnalyserNode fftSize 512, smoothing 0.3, 100 ms tick, mean byte
 *           frequency > threshold (default 15, 1..100), 300 ms hangover,
 *           `media:speaking` emitted on transitions only
 *   quality getStats every 5 s: poor = loss > 5 % or jitter > 50 ms or
 *           RTT > 200 ms; fair = > 2 % / > 20 ms / > 100 ms
 *
 * Signaling is docs/DEAD-GIVEAWAY-PROTOCOL.md "Media signaling". Two things
 * here go further than that text, both inside the opaque `data` object:
 *
 *   - every signal carries `pid`, the id of the peer-connection instance it
 *     belongs to (minted by that PC's initiator). Answers and candidates for a
 *     PC that has since been torn down are dropped instead of being applied
 *     to its replacement.
 *   - the offerer ALWAYS offers one audio and one video m-line (video
 *     recvonly while its camera is off). Camera toggles are then
 *     `replaceTrack` + `direction` on that one transceiver and a
 *     renegotiation offer from the camera owner -- the protocol's
 *     add/removeTrack, without growing a new m-line on every toggle.
 *
 * Simultaneous hellos (two players start at the same instant) resolve the way
 * offer collisions do: the LOWER joinSeq keeps offering, the higher one yields
 * and answers. See `keepsOffering` and the notes in onHello / onOffer.
 */

export const STUN_FALLBACK = Object.freeze({ urls: 'stun:stun.l.google.com:19302' });
export const VAD_TICK_MS = 100;
export const VAD_HANGOVER_MS = 300;
export const VAD_DEFAULT_THRESHOLD = 15;
export const VAD_FFT_SIZE = 512;
export const VAD_SMOOTHING = 0.3;
export const STATS_INTERVAL_MS = 5000;
export const ICE_RESTART_MIN_GAP_MS = 5000;
export const ICE_DISCONNECTED_GRACE_MS = 5000;
export const ICE_MAX_RESTARTS = 3;
export const TURN_REFRESH_SKEW_MS = 30000;
/* Two hellos count as crossed only inside this window; an older unanswered
 * offer went to a page that was not listening yet and is simply dead. */
export const HELLO_GLARE_WINDOW_MS = 4000;

/* ------------------------------------------------------------------ */
/* Pure parts (tests/deadgiveaway-table-media.test.mjs)                */
/* ------------------------------------------------------------------ */

export function buildVoiceAudioConstraints(deviceId) {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function buildCameraVideoConstraints(deviceId) {
  return {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function isStaleMediaDeviceError(error) {
  if (error === null || typeof error !== 'object') return false;
  return error.name === 'NotFoundError' || error.name === 'OverconstrainedError';
}

async function requestPreferredDeviceStream(mediaDevices, deviceId, preferred, fallback) {
  try {
    return { stream: await mediaDevices.getUserMedia(preferred), usedDefault: false };
  } catch (error) {
    if (!deviceId || !isStaleMediaDeviceError(error)) throw error;
    return { stream: await mediaDevices.getUserMedia(fallback), usedDefault: true };
  }
}

export function requestVoiceStream(mediaDevices, deviceId) {
  return requestPreferredDeviceStream(mediaDevices, deviceId,
    { audio: buildVoiceAudioConstraints(deviceId), video: false },
    { audio: buildVoiceAudioConstraints(''), video: false });
}

export function requestCameraStream(mediaDevices, deviceId) {
  return requestPreferredDeviceStream(mediaDevices, deviceId,
    { audio: false, video: buildCameraVideoConstraints(deviceId) },
    { audio: false, video: buildCameraVideoConstraints('') });
}

/** setSinkId when the element supports it; false (browser default) otherwise. */
export async function applyAudioOutputDevice(element, deviceId) {
  if (!element || typeof element.setSinkId !== 'function') return false;
  try {
    await element.setSinkId(deviceId || '');
    return true;
  } catch (error) {
    console.warn('[DeadGiveaway] Could not select output device; using the browser default:', error);
    return false;
  }
}

/**
 * Swap the outgoing mic on every audio sender. All-or-nothing: a sender that
 * refuses rolls every sender already swapped back to the previous track, and
 * the replacement is stopped. Preserves the mute state (`enabled`); with no
 * previous track at all it starts MUTED rather than opening the mic.
 */
export async function replaceActiveAudioTrack(currentStream, replacementStream, senders) {
  const previousTracks = currentStream.getAudioTracks();
  const previousTrack = previousTracks[0] ?? null;
  const replacementTrack = replacementStream.getAudioTracks()[0];
  if (!replacementTrack) {
    replacementStream.getTracks().forEach((track) => track.stop());
    return false;
  }
  replacementTrack.enabled = previousTrack?.enabled ?? false;
  const audioSenders = Array.from(senders).filter((sender) => sender.track?.kind === 'audio');
  const replaced = [];
  try {
    for (const sender of audioSenders) {
      await sender.replaceTrack(replacementTrack);
      replaced.push(sender);
    }
  } catch {
    await Promise.allSettled(replaced.map((sender) => sender.replaceTrack(previousTrack)));
    replacementStream.getTracks().forEach((track) => track.stop());
    return false;
  }
  replacementStream.getTracks()
    .filter((track) => track !== replacementTrack)
    .forEach((track) => track.stop());
  previousTracks.forEach((track) => track.stop());
  return true;
}

export function clampSensitivity(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : VAD_DEFAULT_THRESHOLD;
  return Math.max(1, Math.min(100, n));
}

/** Mean of a byte-frequency array: the level VAD compares to its threshold. */
export function averageLevel(data) {
  if (!data || !data.length) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / data.length;
}

/**
 * One VAD tick. `state` is {speaking, lastLoudAt}; returns the next state and
 * whether it is a transition (the only time `media:speaking` goes out).
 */
export function vadStep(state, level, now, { threshold = VAD_DEFAULT_THRESHOLD, hangoverMs = VAD_HANGOVER_MS } = {}) {
  const lastLoudAt = level > threshold ? now : (state?.lastLoudAt ?? -Infinity);
  const speaking = now - lastLoudAt < hangoverMs;
  const changed = speaking !== !!state?.speaking;
  return { speaking, lastLoudAt, changed };
}

/** Campfire's thresholds. `lossRate` 0..1, `jitter` SECONDS, `rttMs` ms. */
export function classifyQuality({ lossRate = 0, jitter = 0, rttMs = 0 } = {}) {
  if (lossRate > 0.05 || jitter > 0.05 || rttMs > 200) return 'poor';
  if (lossRate > 0.02 || jitter > 0.02 || rttMs > 100) return 'fair';
  return 'good';
}

/** Baseline quality from a connectionState before any stats arrive. */
export function qualityForState(state) {
  if (state === 'connected') return 'good';
  if (state === 'new' || state === 'connecting') return 'fair';
  return 'poor';
}

/**
 * Fold an RTCStatsReport (anything with forEach) into the numbers this engine
 * uses. `previous` (the last summary) turns the cumulative loss counters into
 * a per-interval loss rate.
 */
export function summarizeStats(report, previous = null) {
  let packetsLost = 0;
  let packetsReceived = 0;
  let jitter = 0;
  let rttMs = 0;
  let audioPackets = 0;
  let videoPackets = 0;
  let audioBytesSent = 0;
  let videoBytesSent = 0;
  let videoFrames = 0;
  report.forEach((r) => {
    if (r.type === 'inbound-rtp') {
      packetsLost += Number(r.packetsLost) || 0;
      packetsReceived += Number(r.packetsReceived) || 0;
      jitter = Math.max(jitter, Number(r.jitter) || 0);
      const kind = r.kind || r.mediaType;
      if (kind === 'audio') audioPackets += Number(r.packetsReceived) || 0;
      if (kind === 'video') {
        videoPackets += Number(r.packetsReceived) || 0;
        videoFrames += Number(r.framesDecoded) || 0;
      }
    } else if (r.type === 'outbound-rtp') {
      const kind = r.kind || r.mediaType;
      if (kind === 'audio') audioBytesSent += Number(r.bytesSent) || 0;
      if (kind === 'video') videoBytesSent += Number(r.bytesSent) || 0;
    } else if (r.type === 'candidate-pair' && r.currentRoundTripTime
      && (r.nominated || r.selected || r.state === 'succeeded' || !rttMs)) {
      rttMs = Number(r.currentRoundTripTime) * 1000;
    }
  });
  const dLost = previous ? Math.max(0, packetsLost - previous.packetsLost) : packetsLost;
  const dRecv = previous ? Math.max(0, packetsReceived - previous.packetsReceived) : packetsReceived;
  const lossRate = dRecv + dLost > 0 ? dLost / (dLost + dRecv) : 0;
  const summary = {
    packetsLost, packetsReceived, jitter, rttMs, lossRate,
    audioPackets, videoPackets, videoFrames, audioBytesSent, videoBytesSent,
  };
  summary.quality = classifyQuality(summary);
  return summary;
}

/**
 * Who keeps offering when two offers (or two hellos) cross. The protocol: the
 * HIGHER joinSeq rolls back and answers, so the LOWER one keeps its offer.
 * Equal or unknown joinSeqs fall back to comparing player ids, so both sides
 * always reach opposite answers.
 */
export function keepsOffering({ selfJoinSeq, remoteJoinSeq, selfId, remoteId }) {
  const a = Number.isFinite(selfJoinSeq) ? selfJoinSeq : null;
  const b = Number.isFinite(remoteJoinSeq) ? remoteJoinSeq : null;
  if (a !== null && b !== null && a !== b) return a < b;
  return String(selfId) < String(remoteId);
}

/**
 * What to do with an incoming offer on an existing PC.
 *   'accept'   no collision: apply it and answer
 *   'rollback' collision, and we are the higher joinSeq: roll back, apply, answer
 *   'ignore'   collision, and we are the lower joinSeq: our offer stands
 */
export function resolveOfferCollision({ makingOffer = false, signalingState = 'stable', ...seqs }) {
  const collision = makingOffer || signalingState !== 'stable';
  if (!collision) return 'accept';
  return keepsOffering(seqs) ? 'ignore' : 'rollback';
}

/**
 * ICE candidates that arrive before `setRemoteDescription` cannot be added
 * yet (addIceCandidate throws InvalidStateError). Hold them, then flush.
 */
export function createCandidateBuffer() {
  let held = [];
  return {
    get size() { return held.length; },
    /** Adds now when the PC has a remote description; otherwise holds. Returns 'added'|'held'. */
    async offer(pc, candidate) {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
        return 'added';
      }
      held.push(candidate);
      return 'held';
    },
    /** Call right after setRemoteDescription. Resolves to the number added. */
    async flush(pc) {
      const pending = held;
      held = [];
      let added = 0;
      for (const candidate of pending) {
        try { await pc.addIceCandidate(candidate); added++; } catch { /* stale candidate */ }
      }
      return added;
    },
    clear() { held = []; },
  };
}

/**
 * ICE restart policy for the PC's initiator.
 *   'restart'  refresh TURN, restartIce, offer {iceRestart:true}
 *   'wait'     restarted less than 5 s ago
 *   'rebuild'  three restarts did not help: close and re-emit rtc:hello
 */
export function iceRestartDecision({ now, lastRestartAt = -Infinity, restarts = 0,
  minGapMs = ICE_RESTART_MIN_GAP_MS, maxRestarts = ICE_MAX_RESTARTS }) {
  if (restarts >= maxRestarts) return 'rebuild';
  if (now - lastRestartAt < minGapMs) return 'wait';
  return 'restart';
}

/** ICE servers from a `turn:get` ack, Google STUN always present. */
export function iceServersFrom(ack) {
  const list = Array.isArray(ack?.iceServers)
    ? ack.iceServers.filter((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)))
    : [];
  const hasStun = list.some((s) => [].concat(s.urls).some((u) => String(u).includes('stun.l.google.com')));
  return hasStun ? list : [{ ...STUN_FALLBACK }, ...list];
}

/** True while the cached TURN credential is still good for at least the skew. */
export function iceServersFresh(expiresAt, now, skewMs = TURN_REFRESH_SKEW_MS) {
  if (!expiresAt) return true;
  return expiresAt > now + skewMs;
}

/** A receiver shows a face only while the track flows AND the roster says cam. */
export function shouldShowVideo({ rosterCam, receiving, trackLive }) {
  return !!(rosterCam && receiving && trackLive);
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

function mintPid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function playersOf(state) {
  return Array.isArray(state?.players) ? state.players : [];
}

/**
 * createTableMedia({ client, selfId, onStream, onSpeaking, getState? }) -> media
 * See docs/DEAD-GIVEAWAY.md for the member list.
 */
export function createTableMedia({
  client,
  selfId,
  onStream = () => {},
  onSpeaking = () => {},
  getState = () => client?.state ?? null,
  mediaDevices = globalThis.navigator?.mediaDevices ?? null,
  RTCPeerConnectionImpl = globalThis.RTCPeerConnection,
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
} = {}) {
  if (!client) throw new Error('createTableMedia needs a dg-client');

  const peers = new Map();              // playerId -> peer
  const pendingIce = new Map();         // `${from}|${pid}` -> candidates that beat their offer
  const volumes = new Map();            // playerId -> 0..1
  const pans = new Map();               // playerId -> -1..1
  const roundTargets = new Set();       // remotes our current hello round still has to offer to
  const queues = new Map();             // playerId -> promise chain: one signaling step at a time
  let roundStartedAt = -Infinity;
  let roomGone = false;
  let me = selfId || client.me?.playerId || null;

  let micStream = null;
  let camStream = null;
  let micOn = true;
  let camOn = false;
  let micId = '';
  let camId = '';
  let outId = '';
  let framing = null;
  let started = false;
  let closed = false;
  let threshold = VAD_DEFAULT_THRESHOLD;

  let vadCtx = null;
  let vadTimer = null;
  let vadState = { speaking: false, lastLoudAt: -Infinity };
  let vadLevel = 0;
  let vadNodes = null;                  // { source, analyser }, disconnected on stop

  let mixCtx = null;
  let mixOut = null;
  let iceCache = null;                  // { iceServers, expiresAt }
  let iceFetch = null;
  let statsTimer = null;
  let micChangeId = 0;
  let micQueue = Promise.resolve();
  const blockedPlays = new Set();

  /* ---------- small helpers ---------- */

  function selfJoinSeq() {
    return playersOf(getState()).find((p) => p.id === me)?.joinSeq;
  }

  function remoteJoinSeq(playerId) {
    const peer = peers.get(playerId);
    const fromState = playersOf(getState()).find((p) => p.id === playerId)?.joinSeq;
    return Number.isFinite(fromState) ? fromState : peer?.joinSeq;
  }

  function seqsFor(playerId) {
    return { selfJoinSeq: selfJoinSeq(), remoteJoinSeq: remoteJoinSeq(playerId), selfId: me, remoteId: playerId };
  }

  function rosterCam(playerId) {
    return !!playersOf(getState()).find((p) => p.id === playerId)?.cam;
  }

  function send(to, data) {
    client.emit('rtc:signal', { to, data });
  }

  function emitMediaState() {
    if (closed) return;
    client.emit('media:state', { mic: !!(micStream && micOn), cam: !!(camStream && camOn) });
  }

  /* Every signaling step for one remote runs strictly after the previous one,
   * so an answer can never be applied halfway through applying an offer, and
   * a renegotiation asked for mid-answer waits for the answer to go out. */
  function enqueue(playerId, fn) {
    const prev = queues.get(playerId) || Promise.resolve();
    const next = prev.then(fn).catch((err) => console.warn('[DeadGiveaway] signaling step failed:', err));
    queues.set(playerId, next);
    next.then(() => { if (queues.get(playerId) === next) queues.delete(playerId); });
    return next;
  }

  function requestNegotiation(peer, opts) {
    return enqueue(peer.id, () => (peers.get(peer.id) === peer ? negotiateNow(peer, opts) : undefined));
  }

  function micTrack() { return micStream?.getAudioTracks()[0] ?? null; }
  function camTrack() {
    const t = camStream?.getVideoTracks()[0] ?? null;
    return t && t.readyState !== 'ended' ? t : null;
  }

  /* ---------- ICE servers (turn:get, TURN refresh before expiry) ---------- */

  async function iceServers({ force = false } = {}) {
    const now = Date.now();
    if (!force && iceCache && iceServersFresh(iceCache.expiresAt, now)) return iceCache.iceServers;
    if (iceFetch) return iceFetch;
    iceFetch = (async () => {
      try {
        const ack = await client.request('turn:get', {}, { timeout: 5000 });
        iceCache = { iceServers: iceServersFrom(ack), expiresAt: Number(ack.expiresAt) || null };
      } catch {
        /* No TURN (or not in a room yet): STUN alone still connects most home NATs.
         * Keep a still-valid cached TURN entry if there is one. */
        if (!iceCache || !iceServersFresh(iceCache.expiresAt, Date.now())) {
          iceCache = { iceServers: [{ ...STUN_FALLBACK }], expiresAt: Date.now() + 60000 };
        }
      } finally {
        iceFetch = null;
      }
      return iceCache.iceServers;
    })();
    return iceFetch;
  }

  /* ---------- remote audio: <audio> + optional gain/pan graph ---------- */

  function ensureMix() {
    if (mixCtx || !AudioContextImpl) return mixCtx;
    try {
      mixCtx = new AudioContextImpl();
      mixOut = mixCtx.createGain();
      mixOut.gain.value = 1;
      mixOut.connect(mixCtx.destination);
      if (outId && typeof mixCtx.setSinkId === 'function') mixCtx.setSinkId(outId).catch(() => {});
    } catch {
      mixCtx = null;
      mixOut = null;
    }
    return mixCtx;
  }

  function tryPlay(el) {
    if (!el) return;
    let p;
    try { p = el.play(); } catch { blockedPlays.add(el); return; }
    if (p && typeof p.then === 'function') {
      p.then(() => blockedPlays.delete(el)).catch(() => blockedPlays.add(el));
    }
  }

  function onGesture() {
    for (const el of [...blockedPlays]) tryPlay(el);
    for (const ctx of [mixCtx, vadCtx]) {
      if (ctx && ctx.state === 'suspended') ctx.resume().then(routeAll).catch(() => {});
    }
  }

  function routeAudio(peer) {
    const el = peer.audioEl;
    if (!el) return;
    const vol = volumes.has(peer.id) ? volumes.get(peer.id) : 1;
    const pan = pans.has(peer.id) ? pans.get(peer.id) : 0;
    const ctx = mixCtx;
    if (ctx && ctx.state === 'running' && peer.remoteAudio) {
      if (!peer.graph || peer.graph.stream !== peer.remoteAudio) {
        disconnectGraph(peer);
        try {
          /* Chrome only feeds a remote WebRTC stream into WebAudio while some
           * media element is playing it, so the element stays, muted. */
          const source = ctx.createMediaStreamSource(peer.remoteAudio);
          const gain = ctx.createGain();
          const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
          source.connect(gain);
          if (panner) { gain.connect(panner); panner.connect(mixOut); } else gain.connect(mixOut);
          peer.graph = { stream: peer.remoteAudio, source, gain, panner };
        } catch {
          peer.graph = null;
        }
      }
    }
    if (peer.graph) {
      peer.graph.gain.gain.value = vol;
      if (peer.graph.panner) peer.graph.panner.pan.value = pan;
      el.muted = true;
    } else {
      el.muted = false;
      el.volume = Math.max(0, Math.min(1, vol));
    }
  }

  function routeAll() { for (const peer of peers.values()) routeAudio(peer); }

  function disconnectGraph(peer) {
    if (!peer.graph) return;
    try { peer.graph.source.disconnect(); } catch { /* gone */ }
    try { peer.graph.gain.disconnect(); } catch { /* gone */ }
    try { peer.graph.panner?.disconnect(); } catch { /* gone */ }
    peer.graph = null;
  }

  function attachRemoteAudio(peer, track) {
    peer.remoteAudio = new MediaStream([track]);
    if (!peer.audioEl) {
      const el = typeof Audio === 'function' ? new Audio() : document.createElement('audio');
      el.autoplay = true;
      el.playsInline = true;
      peer.audioEl = el;
    }
    peer.audioEl.srcObject = peer.remoteAudio;
    void applyAudioOutputDevice(peer.audioEl, outId);
    ensureMix();
    routeAudio(peer);
    tryPlay(peer.audioEl);
  }

  /* ---------- streams reported to the scene ---------- */

  function videoReceiving(peer) {
    const tr = peer.videoTransceiver;
    if (!tr) return false;
    const dir = tr.currentDirection;
    return dir === 'sendrecv' || dir === 'recvonly';
  }

  function report(peer) {
    if (!peer || closed) return;
    const track = peer.remoteVideoTrack;
    const show = shouldShowVideo({
      rosterCam: rosterCam(peer.id),
      receiving: videoReceiving(peer),
      trackLive: !!track && track.readyState === 'live' && !track.muted,
    });
    if (show && (!peer.remoteVideo || peer.remoteVideo.getVideoTracks()[0] !== track)) {
      peer.remoteVideo = new MediaStream([track]);
    }
    const audio = peer.remoteAudio || null;
    const video = show ? peer.remoteVideo : null;
    if (peer.reported.audio === audio && peer.reported.video === video) return;
    peer.reported = { audio, video };
    try { onStream(peer.id, { audio, video }); } catch (err) { console.error('[DeadGiveaway] onStream threw:', err); }
  }

  /* ---------- peer connections ---------- */

  function setTransceiverTracks(peer) {
    const pc = peer.pc;
    for (const tr of pc.getTransceivers()) {
      const kind = tr.receiver?.track?.kind || tr.sender?.track?.kind;
      if (kind === 'audio' && !peer.audioTransceiver) peer.audioTransceiver = tr;
      if (kind === 'video' && !peer.videoTransceiver) peer.videoTransceiver = tr;
    }
    const mt = micTrack();
    const ct = camOn ? camTrack() : null;
    const jobs = [];
    if (peer.audioTransceiver) {
      if (peer.audioTransceiver.sender.track !== mt) jobs.push(peer.audioTransceiver.sender.replaceTrack(mt));
      peer.audioTransceiver.direction = mt ? 'sendrecv' : 'recvonly';
    }
    if (peer.videoTransceiver) {
      if (peer.videoTransceiver.sender.track !== ct) jobs.push(peer.videoTransceiver.sender.replaceTrack(ct));
      peer.videoTransceiver.direction = ct ? 'sendrecv' : 'recvonly';
    }
    return Promise.all(jobs);
  }

  function makePeer(playerId, { pid, initiator, configuration }) {
    const pc = new RTCPeerConnectionImpl(configuration);
    const peer = {
      id: playerId,
      pid,
      pc,
      initiator,
      makingOffer: false,
      pendingRenegotiate: false,
      pendingIceRestart: false,
      candidates: createCandidateBuffer(),
      audioTransceiver: null,
      videoTransceiver: null,
      audioEl: null,
      graph: null,
      remoteAudio: null,
      remoteVideo: null,
      remoteVideoTrack: null,
      reported: { audio: undefined, video: undefined },
      state: 'new',
      quality: 'fair',
      stats: null,
      restarts: 0,
      lastRestartAt: -Infinity,
      disconnectTimer: null,
      joinSeq: remoteJoinSeq(playerId),
      closed: false,
    };
    peers.set(playerId, peer);

    pc.onicecandidate = (event) => {
      if (peer.closed || !event.candidate) return;
      send(playerId, { type: 'ice', pid: peer.pid, candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
    };

    pc.ontrack = (event) => {
      if (peer.closed) return;
      const track = event.track;
      if (track.kind === 'audio') {
        if (event.transceiver) peer.audioTransceiver = event.transceiver;
        attachRemoteAudio(peer, track);
      } else if (track.kind === 'video') {
        if (event.transceiver) peer.videoTransceiver = event.transceiver;
        peer.remoteVideoTrack = track;
        track.onmute = () => report(peer);
        track.onunmute = () => report(peer);
        track.onended = () => report(peer);
      }
      report(peer);
    };

    pc.onconnectionstatechange = () => {
      if (peer.closed) return;
      const state = pc.connectionState;
      peer.state = state;
      peer.quality = qualityForState(state);
      if (state === 'connected') {
        peer.restarts = 0;
        if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
        report(peer);
      } else if (state === 'failed') {
        maybeRestartIce(peer);
      } else if (state === 'disconnected') {
        if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = setTimeout(() => {
          peer.disconnectTimer = null;
          if (!peer.closed && pc.connectionState === 'disconnected') maybeRestartIce(peer);
        }, ICE_DISCONNECTED_GRACE_MS);
      }
    };

    pc.onsignalingstatechange = () => {
      if (peer.closed || pc.signalingState !== 'stable') return;
      report(peer);
      if (peer.pendingRenegotiate) {
        peer.pendingRenegotiate = false;
        void requestNegotiation(peer, { iceRestart: peer.pendingIceRestart });
      }
    };

    /* Candidates that outran their offer. */
    const key = `${playerId}|${pid}`;
    const early = pendingIce.get(key);
    if (early) {
      pendingIce.delete(key);
      for (const c of early) void peer.candidates.offer(null, c);
    }
    return peer;
  }

  function closePeer(playerId, { silent = false } = {}) {
    const peer = peers.get(playerId);
    if (!peer) return;
    peer.closed = true;
    peers.delete(playerId);
    roundTargets.delete(playerId);
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    peer.candidates.clear();
    try { peer.pc.close(); } catch { /* closed */ }
    disconnectGraph(peer);
    if (peer.audioEl) {
      blockedPlays.delete(peer.audioEl);
      try { peer.audioEl.pause(); } catch { /* never played */ }
      peer.audioEl.srcObject = null;
      peer.audioEl.remove?.();
    }
    if (!silent && (peer.reported.audio || peer.reported.video)) {
      try { onStream(playerId, { audio: null, video: null }); } catch { /* scene's problem */ }
    }
  }

  /* Only ever called from inside this peer's queue. */
  async function negotiateNow(peer, { iceRestart = false } = {}) {
    const pc = peer.pc;
    if (peer.closed) return;
    if (peer.makingOffer || pc.signalingState !== 'stable') {
      peer.pendingRenegotiate = true;
      peer.pendingIceRestart = peer.pendingIceRestart || iceRestart;
      return;
    }
    peer.pendingIceRestart = false;
    peer.lastOfferIceRestart = iceRestart;
    peer.makingOffer = true;
    try {
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (peer.closed) return;
      if (pc.signalingState !== 'stable') { peer.pendingRenegotiate = true; return; }
      await pc.setLocalDescription(offer);
      if (peer.closed) return;
      peer.offeredAt = Date.now();
      send(peer.id, { type: 'offer', pid: peer.pid, sdp: pc.localDescription.sdp });
    } catch (err) {
      if (!peer.closed) console.warn('[DeadGiveaway] offer failed:', err);
    } finally {
      peer.makingOffer = false;
    }
  }

  /** We are the initiator: new PC, one audio + one video m-line, offer. Queued. */
  async function offerTo(playerId) {
    const configuration = { iceServers: await iceServers() };
    /* An offer from them landed first and we yielded, or they said hello. */
    if (closed || peers.has(playerId) || !roundTargets.has(playerId)) return;
    const peer = makePeer(playerId, { pid: mintPid(), initiator: true, configuration });
    const mt = micTrack();
    const ct = camOn ? camTrack() : null;
    peer.audioTransceiver = mt
      ? peer.pc.addTransceiver(mt, { direction: 'sendrecv' })
      : peer.pc.addTransceiver('audio', { direction: 'recvonly' });
    peer.videoTransceiver = ct
      ? peer.pc.addTransceiver(ct, { direction: 'sendrecv' })
      : peer.pc.addTransceiver('video', { direction: 'recvonly' });
    await negotiateNow(peer);
  }

  async function maybeRestartIce(peer) {
    if (peer.closed || !peer.initiator) return;     // the answerer waits for the initiator
    const decision = iceRestartDecision({ now: Date.now(), lastRestartAt: peer.lastRestartAt, restarts: peer.restarts });
    if (decision === 'wait') return;
    if (decision === 'rebuild') { void rehello(); return; }
    peer.restarts += 1;
    peer.lastRestartAt = Date.now();
    try {
      const servers = await iceServers({ force: true });
      if (peer.closed) return;
      try { peer.pc.setConfiguration({ iceServers: servers }); } catch { /* some browsers refuse mid-call */ }
      peer.pc.restartIce?.();
      await requestNegotiation(peer, { iceRestart: true });
    } catch (err) {
      console.warn('[DeadGiveaway] ICE restart failed:', err);
    }
  }

  /* ---------- signaling handlers ---------- */

  function onHello({ playerId, joinSeq } = {}) {
    if (closed || !playerId || playerId === me) return;
    enqueue(playerId, () => {
      if (closed) return;
      const peer = peers.get(playerId);
      if (peer && Number.isFinite(joinSeq)) peer.joinSeq = joinSeq;
      /* Two hellos crossed: if we still owe this player our offer (or it is
       * barely in flight) and we hold the lower joinSeq, our round stands and
       * they yield. Outside the window our old offer is dead: yield. */
      const now = Date.now();
      const crossed = roundTargets.has(playerId) && (peer
        ? peer.initiator && peer.pc.signalingState === 'have-local-offer' && now - (peer.offeredAt || 0) < HELLO_GLARE_WINDOW_MS
        : now - roundStartedAt < HELLO_GLARE_WINDOW_MS);
      if (crossed && keepsOffering({ ...seqsFor(playerId), remoteJoinSeq: Number.isFinite(joinSeq) ? joinSeq : remoteJoinSeq(playerId) })) {
        return;
      }
      roundTargets.delete(playerId);
      closePeer(playerId);
      /* ...and wait for their offer. */
    });
  }

  async function onOffer(from, data) {
    let peer = peers.get(from);
    if (peer && peer.pid === data.pid) {
      const decision = resolveOfferCollision({
        makingOffer: peer.makingOffer,
        signalingState: peer.pc.signalingState,
        ...seqsFor(from),
      });
      if (decision === 'ignore') return;
      if (decision === 'rollback') {
        /* Whatever we were offering goes again once this settles. */
        peer.pendingRenegotiate = true;
        peer.pendingIceRestart = !!peer.lastOfferIceRestart;
        try { await peer.pc.setLocalDescription({ type: 'rollback' }); } catch { /* implicit rollback below */ }
      }
    } else {
      /* An offer for a PC we do not have. If we are mid-round toward this
       * player and keep offering, ignore it: they will yield and answer ours. */
      if (roundTargets.has(from) && keepsOffering(seqsFor(from))) return;
      roundTargets.delete(from);
      closePeer(from, { silent: true });
      const configuration = { iceServers: await iceServers() };
      if (closed) return;
      if (peers.has(from)) closePeer(from, { silent: true });
      peer = makePeer(from, { pid: data.pid, initiator: false, configuration });
    }
    const pc = peer.pc;
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      if (peer.closed) return;
      await peer.candidates.flush(pc);
      await setTransceiverTracks(peer);
      const answer = await pc.createAnswer();
      if (peer.closed) return;
      await pc.setLocalDescription(answer);
      if (peer.closed) return;
      send(from, { type: 'answer', pid: peer.pid, sdp: pc.localDescription.sdp });
      report(peer);
    } catch (err) {
      if (!peer.closed) console.warn('[DeadGiveaway] could not answer offer:', err);
    }
  }

  async function onAnswer(from, data) {
    const peer = peers.get(from);
    if (!peer || peer.pid !== data.pid || peer.pc.signalingState !== 'have-local-offer') return;
    try {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      roundTargets.delete(from);
      await peer.candidates.flush(peer.pc);
      report(peer);
    } catch (err) {
      if (!peer.closed) console.warn('[DeadGiveaway] could not apply answer:', err);
    }
  }

  async function onIce(from, data) {
    if (!data.candidate) return;
    const peer = peers.get(from);
    if (!peer || peer.pid !== data.pid) {
      const key = `${from}|${data.pid}`;
      const list = pendingIce.get(key) || [];
      if (list.length < 64) list.push(data.candidate);
      pendingIce.set(key, list);
      if (pendingIce.size > 32) pendingIce.delete(pendingIce.keys().next().value);
      return;
    }
    try { await peer.candidates.offer(peer.pc, data.candidate); } catch { /* candidate for a rolled-back offer */ }
  }

  function onSignal({ from, data } = {}) {
    if (closed || !from || from === me || !data || typeof data !== 'object') return;
    if (data.type === 'offer') enqueue(from, () => (closed ? undefined : onOffer(from, data)));
    else if (data.type === 'answer') enqueue(from, () => (closed ? undefined : onAnswer(from, data)));
    else if (data.type === 'ice') enqueue(from, () => (closed ? undefined : onIce(from, data)));
  }

  function onRemoteSpeaking({ playerId, speaking } = {}) {
    if (closed || !playerId || playerId === me) return;
    try { onSpeaking(playerId, !!speaking); } catch (err) { console.error('[DeadGiveaway] onSpeaking threw:', err); }
  }

  function onState(state) {
    if (closed) return;
    if (!me && client.me?.playerId) me = client.me.playerId;
    const present = new Set(playersOf(state).map((p) => p.id));
    for (const id of [...peers.keys()]) {
      if (!present.has(id)) closePeer(id);
      else report(peers.get(id));
    }
  }

  async function rehello() {
    if (closed || !started) return;
    for (const id of [...peers.keys()]) closePeer(id);
    roundTargets.clear();
    const remotes = playersOf(getState()).filter((p) => p.id !== me && p.connected !== false).map((p) => p.id);
    for (const id of remotes) roundTargets.add(id);
    roundStartedAt = Date.now();
    client.emit('rtc:hello', {});
    await iceServers();
    await Promise.all(remotes.map((id) => enqueue(id, () => offerTo(id))));
  }

  /* No room, no mesh: whatever closed it ('replaced', 'empty', 'expired',
   * 'shutdown'), the PCs and the mic go. The scene builds a new engine if it
   * joins again. */
  function onRoomClosed() {
    roomGone = true;
    if (!closed) media.close();
  }

  function onReconnect() {
    if (client.me?.playerId) me = client.me.playerId;
    if (started) void rehello();
  }

  const handlers = {
    'rtc:hello': onHello,
    'rtc:signal': onSignal,
    'media:speaking': onRemoteSpeaking,
    state: onState,
    reconnect: onReconnect,
    'room:closed': onRoomClosed,
  };
  for (const [event, fn] of Object.entries(handlers)) client.on(event, fn);
  const gestureEvents = ['pointerdown', 'keydown', 'touchend'];
  if (typeof globalThis.addEventListener === 'function') {
    for (const e of gestureEvents) globalThis.addEventListener(e, onGesture, { capture: true, passive: true });
  }

  /* ---------- local VAD ---------- */

  function stopVad() {
    if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
    if (vadNodes) { try { vadNodes.source.disconnect(); } catch { /* gone */ } vadNodes = null; }
    if (vadCtx) { vadCtx.close().catch(() => {}); vadCtx = null; }
    if (vadState.speaking) {
      vadState = { speaking: false, lastLoudAt: -Infinity };
      client.emit('media:speaking', { speaking: false });
      try { onSpeaking(me, false); } catch { /* scene's problem */ }
    }
    vadState = { speaking: false, lastLoudAt: -Infinity };
    vadLevel = 0;
  }

  function startVad(stream) {
    stopVad();
    if (!AudioContextImpl || !stream) return;
    try {
      const ctx = new AudioContextImpl();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = VAD_FFT_SIZE;
      analyser.smoothingTimeConstant = VAD_SMOOTHING;
      source.connect(analyser);
      vadCtx = ctx;
      vadNodes = { source, analyser };
      const data = new Uint8Array(analyser.frequencyBinCount);
      vadTimer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        vadLevel = averageLevel(data);
        const next = vadStep(vadState, vadLevel, performance.now(), { threshold });
        vadState = { speaking: next.speaking, lastLoudAt: next.lastLoudAt };
        if (next.changed) {
          client.emit('media:speaking', { speaking: next.speaking });
          try { onSpeaking(me, next.speaking); } catch (err) { console.error('[DeadGiveaway] onSpeaking threw:', err); }
        }
      }, VAD_TICK_MS);
    } catch {
      /* No AudioContext: no local speaking ring, voice still flows. */
    }
  }

  /* ---------- device acquisition ---------- */

  async function acquireMic() {
    if (!mediaDevices) throw new Error('no mediaDevices');
    const { stream, usedDefault } = await requestVoiceStream(mediaDevices, micId);
    if (usedDefault) micId = '';
    return stream;
  }

  async function acquireCam() {
    if (!mediaDevices) throw new Error('no mediaDevices');
    const { stream, usedDefault } = await requestCameraStream(mediaDevices, camId);
    if (usedDefault) camId = '';
    const track = stream.getVideoTracks()[0];
    if (track) {
      /* Permission revoked or the camera unplugged mid-call. */
      track.addEventListener?.('ended', () => {
        if (camStream === stream && camOn) void media.setCam(false);
      });
    }
    return stream;
  }

  function applyTracksAndRenegotiate(kind) {
    for (const peer of peers.values()) {
      const tr = kind === 'audio' ? peer.audioTransceiver : peer.videoTransceiver;
      if (!tr) continue;
      const track = kind === 'audio' ? micTrack() : (camOn ? camTrack() : null);
      const direction = track ? 'sendrecv' : 'recvonly';
      enqueue(peer.id, async () => {
        if (peer.closed) return;
        const directionChanged = tr.direction !== direction;
        try { await tr.sender.replaceTrack(track); } catch { /* the PC is closing */ }
        tr.direction = direction;
        if (directionChanged) await negotiateNow(peer);
      });
    }
  }

  /* ---------- the public surface ---------- */

  const media = {
    async start({ micId: m = '', camId: c = '', outId: o = '', framing: f = null, mic = true, cam = false } = {}) {
      if (closed) throw new Error('closed');
      micId = m || '';
      camId = c || '';
      outId = o || '';
      framing = f;
      micOn = mic !== false;
      if (client.me?.playerId) me = client.me.playerId;
      ensureMix();
      try {
        micStream = await acquireMic();
        micStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
        startVad(micStream);
      } catch (err) {
        console.warn('[DeadGiveaway] microphone unavailable; listening only:', err);
        micStream = null;
      }
      if (cam) {
        try { camStream = await acquireCam(); camOn = true; } catch (err) {
          console.warn('[DeadGiveaway] camera unavailable:', err);
          camStream = null;
          camOn = false;
        }
      }
      if (closed) { micStream?.getTracks().forEach((t) => t.stop()); camStream?.getTracks().forEach((t) => t.stop()); return; }
      started = true;
      emitMediaState();
      await rehello();
      if (!statsTimer) statsTimer = setInterval(pollStats, STATS_INTERVAL_MS);
    },

    async setMic(on) {
      micOn = !!on;
      if (micOn && !micStream && started) {
        try {
          micStream = await acquireMic();
          startVad(micStream);
          applyTracksAndRenegotiate('audio');
        } catch (err) {
          console.warn('[DeadGiveaway] microphone unavailable:', err);
          micOn = false;
        }
      }
      micStream?.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      emitMediaState();
    },

    async setCam(on) {
      if (on) {
        if (!camStream || !camTrack()) {
          try { camStream = await acquireCam(); } catch (err) {
            console.warn('[DeadGiveaway] camera unavailable:', err);
            camStream = null;
            camOn = false;
            emitMediaState();
            throw err;
          }
        }
        camOn = true;
      } else {
        camOn = false;
        const old = camStream;
        camStream = null;
        old?.getTracks().forEach((t) => t.stop());
      }
      applyTracksAndRenegotiate('video');
      emitMediaState();
    },

    async setDevices({ micId: m, camId: c, outId: o } = {}) {
      const jobs = [];
      if (typeof o === 'string' && o !== outId) {
        outId = o;
        for (const peer of peers.values()) jobs.push(applyAudioOutputDevice(peer.audioEl, outId));
        if (mixCtx && typeof mixCtx.setSinkId === 'function') jobs.push(mixCtx.setSinkId(outId).catch(() => {}));
      }
      if (typeof m === 'string' && m !== micId) {
        micId = m;
        if (micStream) {
          const requestId = ++micChangeId;
          micQueue = micQueue.then(() => changeMic(requestId)).catch((err) => console.error('[DeadGiveaway] mic switch failed:', err));
          jobs.push(micQueue);
        }
      }
      if (typeof c === 'string' && c !== camId) {
        camId = c;
        if (camOn && camStream) {
          jobs.push((async () => {
            const old = camStream;
            const next = await acquireCam();
            const track = next.getVideoTracks()[0];
            camStream = next;
            await Promise.allSettled([...peers.values()]
              .filter((p) => p.videoTransceiver)
              .map((p) => p.videoTransceiver.sender.replaceTrack(track)));
            old?.getTracks().forEach((t) => t.stop());
          })().catch((err) => console.warn('[DeadGiveaway] camera switch failed; keeping the current camera:', err)));
        }
      }
      await Promise.all(jobs);
    },

    async listDevices() {
      if (!mediaDevices?.enumerateDevices) return { mics: [], cams: [], outs: [] };
      const devices = await mediaDevices.enumerateDevices();
      const pick = (kind) => devices.filter((d) => d.kind === kind)
        .map((d) => ({ deviceId: d.deviceId, label: d.label, groupId: d.groupId }));
      return { mics: pick('audioinput'), cams: pick('videoinput'), outs: pick('audiooutput') };
    },

    localPreview() { return camOn && camStream ? camStream : null; },

    setVolume(playerId, v) {
      volumes.set(playerId, Math.max(0, Math.min(1, Number(v) || 0)));
      const peer = peers.get(playerId);
      if (peer) routeAudio(peer);
    },

    setPan(playerId, p) {
      pans.set(playerId, Math.max(-1, Math.min(1, Number(p) || 0)));
      const peer = peers.get(playerId);
      if (peer) routeAudio(peer);
    },

    setSensitivity(v) { threshold = clampSensitivity(v); },

    /** Local mic level, the same 0..255 mean the VAD compares (for a test meter). */
    level() { return vadLevel; },

    /** The face-framing object the lobby passed to start(); the scene owns it. */
    framing() { return framing; },

    peers() {
      return [...peers.values()].map((p) => ({ playerId: p.id, state: p.state, quality: p.quality }));
    },

    /** One getStats summary for that player's PC (diagnostics, the verifier). */
    async peerStats(playerId) {
      const peer = peers.get(playerId);
      if (!peer) return null;
      return summarizeStats(await peer.pc.getStats());
    },

    /** Re-run roster-driven decisions (video visibility) now. */
    refresh() { for (const peer of peers.values()) report(peer); },

    close() {
      if (closed) return;
      if (started && !roomGone) client.emit('media:state', { mic: false, cam: false });
      stopVad();
      closed = true;
      started = false;
      micChangeId += 1;
      /* Campfire's order: local tracks, PCs, media elements, AudioContext, timers. */
      micStream?.getTracks().forEach((t) => t.stop());
      camStream?.getTracks().forEach((t) => t.stop());
      micStream = null;
      camStream = null;
      /* Not silent: the scene hears onStream(id, {audio:null, video:null}) and takes the faces down. */
      for (const id of [...peers.keys()]) closePeer(id);
      pendingIce.clear();
      roundTargets.clear();
      blockedPlays.clear();
      if (mixCtx) { mixCtx.close().catch(() => {}); mixCtx = null; mixOut = null; }
      if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
      for (const [event, fn] of Object.entries(handlers)) client.off(event, fn);
      if (typeof globalThis.removeEventListener === 'function') {
        for (const e of gestureEvents) globalThis.removeEventListener(e, onGesture, { capture: true });
      }
    },

    /** Internals for the browser smoke and the verifier. Not for scene code. */
    debug() {
      return {
        selfId: me, started, micOn, camOn, threshold,
        mixState: mixCtx?.state ?? null, mixCtx, vadState: vadCtx?.state ?? null, speaking: vadState.speaking,
        peers: [...peers.values()].map((p) => ({
          playerId: p.id, pid: p.pid, initiator: p.initiator, state: p.state,
          signalingState: p.pc.signalingState, quality: p.quality,
          graph: p.graph, audioEl: p.audioEl, remoteAudio: p.remoteAudio,
          remoteVideo: p.reported.video, pc: p.pc,
        })),
      };
    },
  };

  async function changeMic(requestId) {
    if (requestId !== micChangeId || closed || !micStream) return;
    let replacement;
    let usedDefault = false;
    try {
      const got = await requestVoiceStream(mediaDevices, micId);
      replacement = got.stream;
      usedDefault = got.usedDefault;
    } catch (err) {
      console.error('[DeadGiveaway] Could not switch input device; keeping the current microphone:', err);
      return;
    }
    if (requestId !== micChangeId || closed || !micStream) {
      replacement.getTracks().forEach((t) => t.stop());
      return;
    }
    const senders = [...peers.values()].map((p) => p.audioTransceiver?.sender).filter(Boolean);
    const ok = await replaceActiveAudioTrack(micStream, replacement, senders);
    if (!ok) {
      console.error('[DeadGiveaway] Could not replace every outgoing audio track; keeping the current microphone.');
      return;
    }
    micStream = replacement;
    startVad(micStream);
    if (usedDefault) micId = '';
  }

  async function pollStats() {
    for (const peer of [...peers.values()]) {
      if (peer.closed || peer.pc.connectionState === 'closed') continue;
      try {
        const summary = summarizeStats(await peer.pc.getStats(), peer.stats);
        peer.stats = summary;
        if (peer.state === 'connected') peer.quality = summary.quality;
      } catch {
        /* keep the last quality */
      }
      if (peer.initiator && (peer.pc.connectionState === 'failed' || peer.pc.iceConnectionState === 'failed')) {
        void maybeRestartIce(peer);
      }
    }
  }

  return media;
}

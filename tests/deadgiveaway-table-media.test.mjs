/**
 * Dead Giveaway: the pure parts of src/core/online/table-media.js.
 *
 * WebRTC itself is proven in a real browser (two Chromium contexts, fake
 * devices); these pin the decisions that are easy to get subtly wrong and
 * impossible to see in a call: when the speaking ring flips, what counts as
 * a poor line, who rolls back when two offers cross, that a candidate early
 * for its offer is held rather than thrown away, that a mic switch which
 * fails half way puts every sender back, and Campfire's constraint numbers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vadStep, averageLevel, clampSensitivity, classifyQuality, qualityForState, summarizeStats,
  keepsOffering, resolveOfferCollision, createCandidateBuffer, iceRestartDecision, iceServersFrom,
  iceServersFresh, shouldShowVideo, replaceActiveAudioTrack, buildVoiceAudioConstraints,
  buildCameraVideoConstraints, requestVoiceStream, requestCameraStream, isStaleMediaDeviceError,
  VAD_TICK_MS, VAD_HANGOVER_MS, VAD_DEFAULT_THRESHOLD, VAD_FFT_SIZE, VAD_SMOOTHING, STATS_INTERVAL_MS,
} from '../src/core/online/table-media.js';

test('Campfire\'s VAD numbers are the ones shipped', () => {
  assert.equal(VAD_TICK_MS, 100);
  assert.equal(VAD_HANGOVER_MS, 300);
  assert.equal(VAD_DEFAULT_THRESHOLD, 15);
  assert.equal(VAD_FFT_SIZE, 512);
  assert.equal(VAD_SMOOTHING, 0.3);
  assert.equal(STATS_INTERVAL_MS, 5000);
  assert.equal(clampSensitivity(0), 1);
  assert.equal(clampSensitivity(250), 100);
  assert.equal(clampSensitivity('loud'), 15);
  assert.equal(averageLevel(new Uint8Array([0, 10, 20, 30])), 15);
  assert.equal(averageLevel(new Uint8Array(0)), 0);
});

/** Feed a level sequence at 100 ms ticks; return the transitions that would be emitted. */
function runVad(levels, threshold = 15) {
  let state = { speaking: false, lastLoudAt: -Infinity };
  const emitted = [];
  levels.forEach((level, i) => {
    const now = 1000 + i * VAD_TICK_MS;
    const next = vadStep(state, level, now, { threshold });
    state = { speaking: next.speaking, lastLoudAt: next.lastLoudAt };
    if (next.changed) emitted.push([now, next.speaking]);
  });
  return emitted;
}

test('VAD: speaking on the first loud tick, emitted once, not again while it stays loud', () => {
  assert.deepEqual(runVad([0, 0, 40, 40, 40, 40]), [[1200, true]]);
});

test('VAD: the 300 ms hangover holds the ring across a pause between words', () => {
  /* loud, quiet 200 ms, loud: no flip at all. */
  assert.deepEqual(runVad([40, 0, 0, 40, 40]), [[1000, true]]);
});

test('VAD: silence longer than the hangover ends it, exactly once', () => {
  /* Last loud tick at 1000; 1100/1200 are inside 300 ms, 1300 is not. */
  assert.deepEqual(runVad([40, 0, 0, 0, 0, 0]), [[1000, true], [1300, false]]);
});

test('VAD: the threshold is strict and the sensitivity setting moves it', () => {
  assert.deepEqual(runVad([15, 15, 15]), [], 'equal to the threshold is not speech');
  assert.deepEqual(runVad([16]), [[1000, true]]);
  assert.deepEqual(runVad([30, 30], 50), [], 'a less sensitive setting ignores it');
});

test('quality: Campfire\'s poor and fair thresholds, jitter in seconds', () => {
  assert.equal(classifyQuality({ lossRate: 0, jitter: 0, rttMs: 30 }), 'good');
  assert.equal(classifyQuality({ lossRate: 0.021 }), 'fair');
  assert.equal(classifyQuality({ lossRate: 0.051 }), 'poor');
  assert.equal(classifyQuality({ jitter: 0.021 }), 'fair');
  assert.equal(classifyQuality({ jitter: 0.051 }), 'poor');
  assert.equal(classifyQuality({ rttMs: 101 }), 'fair');
  assert.equal(classifyQuality({ rttMs: 201 }), 'poor');
  assert.equal(classifyQuality({ lossRate: 0.02, jitter: 0.02, rttMs: 100 }), 'good', 'thresholds are strict');
  assert.equal(qualityForState('connected'), 'good');
  assert.equal(qualityForState('connecting'), 'fair');
  assert.equal(qualityForState('failed'), 'poor');
});

test('summarizeStats folds inbound audio/video and the RTT, and loss is per interval', () => {
  const report = (lostA, recvA, recvV) => [
    { type: 'inbound-rtp', kind: 'audio', packetsLost: lostA, packetsReceived: recvA, jitter: 0.004 },
    { type: 'inbound-rtp', kind: 'video', packetsLost: 0, packetsReceived: recvV, jitter: 0.012, framesDecoded: 50 },
    { type: 'outbound-rtp', kind: 'audio', bytesSent: 900 },
    { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0.042 },
  ];
  const first = summarizeStats(report(0, 500, 300));
  assert.equal(first.audioPackets, 500);
  assert.equal(first.videoPackets, 300);
  assert.equal(first.videoFrames, 50);
  assert.equal(first.jitter, 0.012);
  assert.ok(Math.abs(first.rttMs - 42) < 1e-9);
  assert.equal(first.quality, 'good');
  /* Next interval: 100 new packets, 10 of them lost -> 10/110 = 9 % -> poor,
   * even though the cumulative rate (10/910) would read as good. */
  const second = summarizeStats(report(10, 590, 300), first);
  assert.ok(Math.abs(second.lossRate - 10 / 100) < 0.01);
  assert.equal(second.quality, 'poor');
});

test('offer collision: the HIGHER joinSeq rolls back and answers, the lower keeps its offer', () => {
  const lower = { selfJoinSeq: 2, remoteJoinSeq: 5, selfId: 'p_a', remoteId: 'p_b' };
  const higher = { selfJoinSeq: 5, remoteJoinSeq: 2, selfId: 'p_b', remoteId: 'p_a' };
  assert.equal(resolveOfferCollision({ signalingState: 'stable', ...lower }), 'accept');
  assert.equal(resolveOfferCollision({ signalingState: 'stable', ...higher }), 'accept');
  assert.equal(resolveOfferCollision({ signalingState: 'have-local-offer', ...lower }), 'ignore');
  assert.equal(resolveOfferCollision({ signalingState: 'have-local-offer', ...higher }), 'rollback');
  assert.equal(resolveOfferCollision({ makingOffer: true, signalingState: 'stable', ...higher }), 'rollback',
    'an offer still being made counts as a collision');
  assert.equal(keepsOffering(lower), true);
  assert.equal(keepsOffering(higher), false);
});

test('offer collision: both sides always reach opposite answers, even without joinSeqs', () => {
  for (const [a, b] of [[1, 2], [7, 7], [undefined, 3], [undefined, undefined]]) {
    const one = keepsOffering({ selfJoinSeq: a, remoteJoinSeq: b, selfId: 'p_x', remoteId: 'p_y' });
    const two = keepsOffering({ selfJoinSeq: b, remoteJoinSeq: a, selfId: 'p_y', remoteId: 'p_x' });
    assert.notEqual(one, two, `joinSeq ${a}/${b}`);
  }
});

function fakePc() {
  return {
    remoteDescription: null,
    added: [],
    async addIceCandidate(c) {
      if (!this.remoteDescription) { const e = new Error('no remote description'); e.name = 'InvalidStateError'; throw e; }
      if (c.bad) throw new Error('stale');
      this.added.push(c);
    },
  };
}

test('candidates that beat setRemoteDescription are held, then flushed in order', async () => {
  const pc = fakePc();
  const buffer = createCandidateBuffer();
  assert.equal(await buffer.offer(pc, { candidate: 'a' }), 'held');
  assert.equal(await buffer.offer(pc, { candidate: 'b' }), 'held');
  assert.equal(await buffer.offer(null, { candidate: 'c' }), 'held', 'no PC yet: held too');
  assert.equal(buffer.size, 3);
  assert.deepEqual(pc.added, []);
  pc.remoteDescription = { type: 'offer' };
  assert.equal(await buffer.flush(pc), 3);
  assert.deepEqual(pc.added.map((c) => c.candidate), ['a', 'b', 'c']);
  assert.equal(buffer.size, 0);
  assert.equal(await buffer.offer(pc, { candidate: 'd' }), 'added', 'after the description: straight in');
  assert.deepEqual(pc.added.map((c) => c.candidate), ['a', 'b', 'c', 'd']);
});

test('a stale held candidate does not stop the rest of the flush', async () => {
  const pc = fakePc();
  const buffer = createCandidateBuffer();
  await buffer.offer(pc, { candidate: 'a' });
  await buffer.offer(pc, { candidate: 'x', bad: true });
  await buffer.offer(pc, { candidate: 'b' });
  pc.remoteDescription = { type: 'answer' };
  assert.equal(await buffer.flush(pc), 2);
  assert.deepEqual(pc.added.map((c) => c.candidate), ['a', 'b']);
});

test('ICE restart: at most once per 5 s, and three failures rebuild the mesh', () => {
  assert.equal(iceRestartDecision({ now: 10000, lastRestartAt: -Infinity, restarts: 0 }), 'restart');
  assert.equal(iceRestartDecision({ now: 10000, lastRestartAt: 6000, restarts: 1 }), 'wait');
  assert.equal(iceRestartDecision({ now: 11000, lastRestartAt: 6000, restarts: 1 }), 'restart');
  assert.equal(iceRestartDecision({ now: 99999, lastRestartAt: 0, restarts: 3 }), 'rebuild');
});

test('ICE servers: Google STUN always present; TURN refreshed 30 s before it expires', () => {
  const none = iceServersFrom({ ok: true, iceServers: [] });
  assert.deepEqual(none, [{ urls: 'stun:stun.l.google.com:19302' }]);
  const withTurn = iceServersFrom({ iceServers: [{ urls: ['turn:t.example:3478'], username: 'u', credential: 'c' }] });
  assert.equal(withTurn.length, 2);
  assert.equal(withTurn[0].urls, 'stun:stun.l.google.com:19302');
  const already = iceServersFrom({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  assert.equal(already.length, 1, 'not added twice');
  assert.equal(iceServersFresh(null, 0), true, 'no expiry = STUN only, always fresh');
  assert.equal(iceServersFresh(100000, 60000), true);
  assert.equal(iceServersFresh(100000, 75000), false, 'inside the 30 s skew: refresh');
});

test('a face shows only while the roster says cam AND the track is flowing', () => {
  assert.equal(shouldShowVideo({ rosterCam: true, receiving: true, trackLive: true }), true);
  assert.equal(shouldShowVideo({ rosterCam: false, receiving: true, trackLive: true }), false);
  assert.equal(shouldShowVideo({ rosterCam: true, receiving: false, trackLive: true }), false);
  assert.equal(shouldShowVideo({ rosterCam: true, receiving: true, trackLive: false }), false);
});

/* ---------- replaceActiveAudioTrack, on fakes ---------- */

function track(kind, id) {
  return { kind, id, enabled: true, stopped: false, stop() { this.stopped = true; } };
}
function stream(...tracks) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  };
}
function sender(initial, { failOn = null } = {}) {
  return {
    track: initial,
    async replaceTrack(t) {
      if (failOn && t === failOn) throw new Error('refused');
      this.track = t;
    },
  };
}

test('mic switch: every audio sender swapped, mute state preserved, the old mic stopped', async () => {
  const oldMic = track('audio', 'old');
  oldMic.enabled = false;                      // the player is muted
  const newMic = track('audio', 'new');
  const video = track('video', 'cam');
  const senders = [sender(oldMic), sender(oldMic), sender(video)];
  const ok = await replaceActiveAudioTrack(stream(oldMic), stream(newMic), senders);
  assert.equal(ok, true);
  assert.equal(senders[0].track, newMic);
  assert.equal(senders[1].track, newMic);
  assert.equal(senders[2].track, video, 'the camera sender is not touched');
  assert.equal(newMic.enabled, false, 'still muted after the switch');
  assert.equal(oldMic.stopped, true);
  assert.equal(newMic.stopped, false);
});

test('mic switch that fails half way rolls every swapped sender back and keeps the old mic', async () => {
  const oldMic = track('audio', 'old');
  const newMic = track('audio', 'new');
  const a = sender(oldMic);
  const b = sender(oldMic, { failOn: newMic });
  const ok = await replaceActiveAudioTrack(stream(oldMic), stream(newMic), [a, b]);
  assert.equal(ok, false);
  assert.equal(a.track, oldMic, 'rolled back');
  assert.equal(b.track, oldMic);
  assert.equal(oldMic.stopped, false, 'the working mic stays live');
  assert.equal(newMic.stopped, true, 'the replacement is released');
});

test('a replacement with no audio track is refused; no previous track starts muted', async () => {
  const cam = track('video', 'v');
  assert.equal(await replaceActiveAudioTrack(stream(track('audio', 'x')), stream(cam), []), false);
  assert.equal(cam.stopped, true);
  const fresh = track('audio', 'y');
  assert.equal(await replaceActiveAudioTrack(stream(), stream(fresh), []), true);
  assert.equal(fresh.enabled, false, 'never opens a mic the player had not opened');
});

/* ---------- constraints and the stale-device fallback ---------- */

test('Campfire\'s constraints: processing on, exact device, camera 640x480 at 24', () => {
  assert.deepEqual(buildVoiceAudioConstraints(''), { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  assert.deepEqual(buildVoiceAudioConstraints('mic-1').deviceId, { exact: 'mic-1' });
  assert.deepEqual(buildCameraVideoConstraints('cam-1'), {
    width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 }, deviceId: { exact: 'cam-1' },
  });
});

test('a stale saved device falls back to the default; other errors do not', async () => {
  const calls = [];
  const md = (failFirstWith) => ({
    async getUserMedia(c) {
      calls.push(c);
      if (calls.length === 1 && failFirstWith) { const e = new Error(failFirstWith); e.name = failFirstWith; throw e; }
      return { id: 'stream' };
    },
  });
  for (const name of ['NotFoundError', 'OverconstrainedError']) {
    calls.length = 0;
    const got = await requestVoiceStream(md(name), 'gone-mic');
    assert.equal(got.usedDefault, true, name);
    assert.equal(calls[1].audio.deviceId, undefined, 'the retry has no deviceId');
  }
  calls.length = 0;
  await assert.rejects(requestCameraStream(md('NotAllowedError'), 'cam'), /NotAllowedError/);
  calls.length = 0;
  await assert.rejects(requestVoiceStream(md('NotFoundError'), ''), /NotFoundError/, 'no saved id: nothing to fall back from');
  assert.equal(isStaleMediaDeviceError({ name: 'OverconstrainedError' }), true);
  assert.equal(isStaleMediaDeviceError(null), false);
});

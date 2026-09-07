/**
 * THE DEV HAUNT LINK — first-party WebRTC, no broker, no dependency.
 *
 * A second person (the owner, wearing a stranger's face) joins a running
 * scene from another machine: one reliable JSON DataChannel each way, plus
 * the dev's live microphone as a MediaStream the host spatializes in-scene.
 *
 * Signaling is a MANUAL COPY-PASTE RITUAL by design: this game ships as
 * static files with no server, and the sandbox that wrote this cannot vendor
 * a broker client. The dev page mints an offer code, the host pastes it and
 * hands back an answer code, and the pipe is up. STUN only (Google's public
 * server), so plain home NATs work and symmetric corporate NATs do not —
 * documented limitation, not a bug. Codes are base64 JSON of a complete SDP
 * (ICE gathering finished first, so a single paste carries every candidate).
 *
 * Protocol over the channel (JSON objects):
 *   dev  -> host: {t:'hello', name} | {t:'pose', x,y,z,yaw,pitch} ~10 Hz
 *               | {t:'cmd', cmd, arg}
 *   host -> dev : {t:'scene', id} | {t:'player', x, z, yaw}
 */

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** A complete local description, candidates included, as a paste code. */
async function gatheredLocalDescription(pc) {
  if (pc.iceGatheringState !== 'complete') {
    await new Promise((resolve) => {
      const done = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', done);
      /* Belt and braces: some stacks stall shy of 'complete' when a network
       * interface refuses to answer. Two seconds of candidates is plenty for
       * a paste-ritual prototype; a partial set still connects on any route
       * that was going to work. */
      setTimeout(() => { pc.removeEventListener('icegatheringstatechange', done); resolve(); }, 2000);
    });
  }
  return btoa(JSON.stringify(pc.localDescription));
}

function decodeCode(code) {
  return new RTCSessionDescription(JSON.parse(atob(code.trim())));
}

function wireChannel(channel, { onMessage, onClose }) {
  channel.addEventListener('message', (event) => {
    let parsed = null;
    try { parsed = JSON.parse(event.data); } catch { return; }
    onMessage?.(parsed);
  });
  channel.addEventListener('close', () => onClose?.());
}

/**
 * Host side — runs inside the live scene page.
 * The host answers: paste the dev's offer, hand back the reply code.
 */
export function hostHaunt({ onMessage, onVoice, onLeave } = {}) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  let channel = null;

  pc.addEventListener('datachannel', (event) => {
    channel = event.channel;
    wireChannel(channel, { onMessage, onClose: onLeave });
  });
  pc.addEventListener('track', (event) => {
    onVoice?.(event.streams[0] ?? new MediaStream([event.track]));
  });
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') onLeave?.();
  });

  return {
    /** Paste the dev's offer code; resolves to the answer code to hand back. */
    async acceptOffer(offerCode) {
      await pc.setRemoteDescription(decodeCode(offerCode));
      await pc.setLocalDescription(await pc.createAnswer());
      return gatheredLocalDescription(pc);
    },
    send(obj) {
      if (channel?.readyState === 'open') channel.send(JSON.stringify(obj));
    },
    get connected() { return channel?.readyState === 'open'; },
    close() { try { pc.close(); } catch { /* already down */ } },
  };
}

/**
 * Dev side — runs in haunt.html. Asks for the microphone up front (call this
 * from a click), mints the offer code, then waits for the host's answer.
 */
export async function joinHaunt({ onMessage, onClose } = {}) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = pc.createDataChannel('haunt', { ordered: true });
  wireChannel(channel, { onMessage, onClose });
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') onClose?.();
  });

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of micStream.getAudioTracks()) pc.addTrack(track, micStream);

  await pc.setLocalDescription(await pc.createOffer());
  const offerBase64 = await gatheredLocalDescription(pc);

  return {
    offerBase64,
    /** Paste the host's reply; resolves once the data channel opens. */
    async acceptAnswer(answerCode) {
      await pc.setRemoteDescription(decodeCode(answerCode));
      if (channel.readyState === 'open') return;
      await new Promise((resolve, reject) => {
        channel.addEventListener('open', resolve, { once: true });
        setTimeout(() => reject(new Error('the haunt channel never opened — wrong code, or a NAT this STUN-only link cannot cross')), 20000);
      });
    },
    send(obj) {
      if (channel.readyState === 'open') channel.send(JSON.stringify(obj));
    },
    micStream,
    close() { try { pc.close(); } catch { /* already down */ } },
  };
}

/**
 * Cut a window out of an MP3 without re-encoding it.
 *
 * The bundle needs the records, and the records are 3-5MB each because they are
 * whole songs. The radio never plays a whole song -- it drops in a fifth of the
 * way through, gives you thirty seconds, and fades. So the other three minutes
 * are paid for and never heard.
 *
 * There is no ffmpeg in this environment and no intention of shipping one, so
 * this does the one thing you can do to an MP3 with no decoder: walk the frame
 * headers, and copy out the run of frames covering the window. Every frame is
 * self-describing and independently decodable enough for playback to start on
 * one, so the result is a valid file at the source's own bitrate.
 *
 * Two caveats, both handled:
 *   - a leading ID3v2 tag is not frame data and has to be stepped over
 *   - the first frame of a VBR file is a Xing/Info header describing the WHOLE
 *     file's length and seek table. Copying that into a 30-second file gives a
 *     decoder a duration four times what it holds, so it is dropped.
 *
 * The bit reservoir means the first frame or two of a cut may decode thin,
 * since they can reference bytes that were in the frames before them. At the
 * start of a fade-in nobody has ever heard it.
 */

/* Layer III only -- everything here is an mp3. */
const BITRATE = {
  // MPEG 1
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  // MPEG 2 / 2.5
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const SAMPLE_RATE = {
  3: [44100, 48000, 32000],       // MPEG 1
  2: [22050, 24000, 16000],       // MPEG 2
  0: [11025, 12000, 8000],        // MPEG 2.5
};

/** Byte offset of the first frame, stepping over any ID3v2 tag. */
function firstFrame(buf) {
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    // Syncsafe integer: seven bits per byte.
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14)
      | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    const footer = (buf[5] & 0x10) ? 10 : 0;
    return 10 + size + footer;
  }
  return 0;
}

/**
 * Decode a frame header.
 * @returns {{length: number, seconds: number}|null} null if not a frame.
 */
function header(buf, at) {
  if (at + 4 > buf.length) return null;
  if (buf[at] !== 0xff || (buf[at + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (buf[at + 1] >> 3) & 0x03;   // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layerBits = (buf[at + 1] >> 1) & 0x03;     // 1 = Layer III
  if (versionBits === 1 || layerBits !== 1) return null;

  const rateIdx = (buf[at + 2] >> 4) & 0x0f;
  const freqIdx = (buf[at + 2] >> 2) & 0x03;
  if (rateIdx === 0 || rateIdx === 15 || freqIdx === 3) return null;

  const mpeg1 = versionBits === 3;
  const kbps = BITRATE[mpeg1 ? 1 : 2][rateIdx];
  const hz = SAMPLE_RATE[versionBits][freqIdx];
  if (!kbps || !hz) return null;

  const pad = (buf[at + 2] >> 1) & 1;
  const samples = mpeg1 ? 1152 : 576;
  const length = Math.floor((samples / 8) * kbps * 1000 / hz) + pad;
  if (length < 24) return null;

  return { length, seconds: samples / hz };
}

/** True if this frame is a Xing/Info/VBRI header rather than audio. */
function isTocFrame(buf, at, length) {
  const end = Math.min(at + length, buf.length);
  const tag = buf.toString('latin1', at + 4, Math.min(at + 40, end));
  return tag.includes('Xing') || tag.includes('Info') || tag.includes('VBRI');
}

/**
 * @param {Buffer} buf   a whole mp3
 * @param {number} from  seconds into the recording
 * @param {number} take  seconds to keep
 * @returns {{buf: Buffer, from: number, seconds: number}|null}
 *   null when the file is not parseable as frames, so the caller can fall back
 *   to shipping it whole rather than shipping something broken.
 */
export function sliceMp3(buf, from, take) {
  let at = firstFrame(buf);
  let t = 0;
  let start = -1;
  let startT = 0;
  let frames = 0;

  while (at < buf.length) {
    const h = header(buf, at);
    if (!h) {
      // A run of junk between frames is normal at the tail (ID3v1, padding).
      // Anything before we found a single frame means this is not an mp3.
      if (frames === 0) return null;
      break;
    }
    if (frames === 0 && isTocFrame(buf, at, h.length)) {
      at += h.length;
      continue;
    }
    frames++;
    if (start < 0 && t >= from) { start = at; startT = t; }
    if (start >= 0 && t - startT >= take) break;
    t += h.seconds;
    at += h.length;
  }

  if (start < 0) {
    // Asked for a window past the end -- give back what is there from 0.
    if (!frames) return null;
    return sliceMp3(buf, 0, take);
  }
  return { buf: buf.subarray(start, at), from: startT, seconds: t - startT };
}

/** Total playing time in seconds, or null if unparseable. */
export function durationOf(buf) {
  let at = firstFrame(buf);
  let t = 0;
  let frames = 0;
  while (at < buf.length) {
    const h = header(buf, at);
    if (!h) break;
    frames++;
    t += h.seconds;
    at += h.length;
  }
  return frames ? t : null;
}

/**
 * Beat SM-200 is not a radio programme. It is one delivered station fragment
 * that Lag turns on and Seff physically cuts two seconds later. Keeping this
 * scene action here avoids teaching the campaign Radio how to play a gag that
 * deliberately never becomes a receiver state.
 */
export const SPECIAL_MEETING_RADIO_GAG = Object.freeze({
  cue: 'radio.vo.announcer.0177le3',
  seconds: 2,
});

/**
 * Start the exact recording and schedule the real AudioBufferSourceNode stop.
 * The returned mutable evidence is exposed by the scene for browser QA.
 */
export function playSpecialMeetingRadioGag(audio) {
  const { source = null, receipt = null } = audio.playWithReceipt(
    SPECIAL_MEETING_RADIO_GAG.cue,
    {
      bus: 'voice',
      volume: 0.36,
      requiredRecorded: true,
      speechMode: 'radio',
      speakerId: 'specialmeeting.car-radio',
      ambientVoice: true,
      requestedCue: SPECIAL_MEETING_RADIO_GAG.cue,
    },
  );
  const startedAt = Number(audio?.ctx?.currentTime) || 0;
  const stopAt = startedAt + SPECIAL_MEETING_RADIO_GAG.seconds;
  const decodedSeconds = Number(audio?.sampleDuration?.(SPECIAL_MEETING_RADIO_GAG.cue));
  const naturalSeconds = Number.isFinite(decodedSeconds) && decodedSeconds > 0
    ? decodedSeconds
    : null;
  const cutScheduled = Boolean(source && receipt?.started === true);
  const scheduledEndReason = naturalSeconds !== null
    && naturalSeconds <= SPECIAL_MEETING_RADIO_GAG.seconds
    ? 'natural'
    : 'cut';
  const evidence = {
    cue: SPECIAL_MEETING_RADIO_GAG.cue,
    seconds: SPECIAL_MEETING_RADIO_GAG.seconds,
    receipt,
    started: receipt?.started === true,
    startedAt,
    stopAt,
    naturalSeconds,
    cutScheduled,
    lifecycle: receipt?.started === true ? 'playing' : 'not-started',
    ended: false,
    endedAt: null,
    endedReason: null,
  };
  if (source) {
    const previousOnEnded = source.onended;
    source.onended = function onSpecialMeetingRadioEnded(event) {
      previousOnEnded?.call(this, event);
      evidence.ended = true;
      evidence.endedAt = Number(audio?.ctx?.currentTime) || stopAt;
      evidence.endedReason = scheduledEndReason;
      evidence.lifecycle = scheduledEndReason;
    };
    source.stop(stopAt);
  }
  return evidence;
}

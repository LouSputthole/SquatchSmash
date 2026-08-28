/**
 * ACT SIX — the room breaks open.
 *
 * This beat is intentionally not a DialogueSequence. Nineteen short reactions
 * queued end-to-end sounded like roll call and kept the player in the same
 * acknowledgement beat for close to a minute. The authored direction says the
 * opposite: a ragged eruption, then two lines the mix makes room for.
 *
 * The schedule is pure so the browser runtime and the contract test inspect the
 * same timing. Crowd lines may overlap one another; the protected Gratin and
 * Booskibro lines are placed after every crowd take has actually ended.
 */

export const ROOM_REACTION_PROTECTED_SPEAKERS = Object.freeze(['GRATIN', 'BOOSKIBRO']);

/* Offsets for the seventeen crowd reactions, in source order with the two
 * protected lines removed. The first three are the ragged SALUD burst. Later
 * offsets spread faces around the room while still sounding collective. */
const CROWD_OFFSETS_S = Object.freeze([
  0, 0.11, 0.22,
  0.62, 0.86, 1.10, 1.34, 1.58,
  2.16, 2.46, 4.34, 2.74, 3.02,
  4.60, 4.84, 5.08, 5.32,
]);

const SAME_SPEAKER_BREATH_S = 0.14;
const PROTECTED_BREATH_S = 0.32;

/**
 * Build the real delivered-VO schedule for IN-500 + IN-510.
 *
 * @param {Array<object>} lines authored spoken lines
 * @param {(line:object)=>number} durationFor decoded/manifest duration lookup
 */
export function buildRoomReactionSchedule(lines, durationFor = () => 1.8) {
  const source = (lines ?? []).filter((line) => line?.cue);
  const protectedLines = new Map();
  const crowd = [];

  for (const line of source) {
    if (ROOM_REACTION_PROTECTED_SPEAKERS.includes(line.speakerKey)) {
      protectedLines.set(line.speakerKey, line);
    } else {
      crowd.push(line);
    }
  }

  if (crowd.length !== CROWD_OFFSETS_S.length) {
    throw new Error(`Initiation room reaction expected ${CROWD_OFFSETS_S.length} crowd lines; got ${crowd.length}`);
  }
  for (const speaker of ROOM_REACTION_PROTECTED_SPEAKERS) {
    if (!protectedLines.has(speaker)) {
      throw new Error(`Initiation room reaction is missing protected ${speaker} line`);
    }
  }

  const speakerEnds = new Map();
  const scheduledCrowd = crowd.map((line, index) => {
    const seconds = Math.max(0.2, Number(durationFor(line)) || 1.8);
    const priorEnd = speakerEnds.get(line.speakerKey) ?? -Infinity;
    const at = Math.max(CROWD_OFFSETS_S[index], priorEnd + SAME_SPEAKER_BREATH_S);
    const entry = Object.freeze({
      line,
      at,
      seconds,
      end: at + seconds,
      ambient: true,
      featured: false,
    });
    speakerEnds.set(line.speakerKey, entry.end);
    return entry;
  });

  let cursor = Math.max(...scheduledCrowd.map((entry) => entry.end)) + PROTECTED_BREATH_S;
  const protectedSchedule = ROOM_REACTION_PROTECTED_SPEAKERS.map((speaker) => {
    const line = protectedLines.get(speaker);
    const seconds = Math.max(0.2, Number(durationFor(line)) || 1.8);
    const entry = Object.freeze({
      line,
      at: cursor,
      seconds,
      end: cursor + seconds,
      ambient: false,
      featured: true,
    });
    cursor = entry.end + PROTECTED_BREATH_S;
    return entry;
  });

  return Object.freeze([...scheduledCrowd, ...protectedSchedule]
    .sort((a, b) => a.at - b.at));
}

export function roomReactionDuration(schedule) {
  return Math.max(0, ...(schedule ?? []).map((entry) => entry.end)) + 0.35;
}

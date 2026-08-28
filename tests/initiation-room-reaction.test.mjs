import assert from 'node:assert/strict';
import test from 'node:test';
import { beatById } from '../src/initiation/script.js';
import {
  buildRoomReactionSchedule,
  roomReactionDuration,
} from '../src/initiation/room-reaction.js';

const lines = [
  ...beatById('IN-500').lines,
  ...beatById('IN-510').lines,
];

/* Slightly different durations make this prove the protected slots derive
 * from delivered timing instead of accidentally passing against one constant. */
const durationFor = (line) => 0.78 + (line.text.length % 17) * 0.055;

test('the room erupts as one bounded crowd beat without dropping authored lines', () => {
  const schedule = buildRoomReactionSchedule(lines, durationFor);
  assert.equal(schedule.length, 19);
  assert.deepEqual(
    new Set(schedule.map((entry) => entry.line.cue)),
    new Set(lines.map((line) => line.cue)),
  );
  assert.ok(schedule.filter((entry) => entry.at < 1).length >= 5);
  assert.ok(roomReactionDuration(schedule) < 20);
});

test('crowd overlap is deliberate while Gratin and Booskibro get protected air', () => {
  const schedule = buildRoomReactionSchedule(lines, durationFor);
  const crowd = schedule.filter((entry) => entry.ambient);
  const protectedLines = schedule.filter((entry) => entry.featured);
  const overlapCount = crowd.reduce((total, entry, index) => total
    + crowd.slice(index + 1).filter((later) => later.at < entry.end).length, 0);

  assert.ok(overlapCount >= 8, `expected a room burst, found ${overlapCount} overlaps`);
  assert.deepEqual(protectedLines.map((entry) => entry.line.speakerKey), ['GRATIN', 'BOOSKIBRO']);
  for (const featured of protectedLines) {
    const others = schedule.filter((entry) => entry !== featured);
    assert.equal(
      others.some((entry) => entry.at < featured.end && featured.at < entry.end),
      false,
      `${featured.line.speakerKey} line overlaps another take`,
    );
  }
});
test('one mouth never overlaps itself inside the crowd', () => {
  const schedule = buildRoomReactionSchedule(lines, durationFor);
  for (const entry of schedule) {
    for (const other of schedule) {
      if (entry === other || entry.line.speakerKey !== other.line.speakerKey) continue;
      assert.equal(entry.at < other.end && other.at < entry.end, false,
        `${entry.line.speakerKey} talks over itself`);
    }
  }
});

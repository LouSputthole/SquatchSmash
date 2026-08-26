/**
 * THE IDLE GUARD CONVERSATIONS, AND THE STEALTH THEY BUY.
 *
 * Owner, 2026-08-20: *"Lets make sure the guards have conversations with each
 * other and you can sneak up on them as they are talking about how good the A
 * team is and how even tho it never made the playoffs they are still the
 * best."*
 *
 * The feature is only half dialogue. The other half is a mechanical promise
 * -- that a talking pair is a way through -- and that half is what rots
 * silently, so it is asserted against the live systems rather than against a
 * comment:
 *
 *   - the pairs are real posted men, on two different voices, and the marks
 *     they stand on are real floor with a clear line between them;
 *   - the exchange actually alternates, actually reaches the playoffs, and
 *     never once acknowledges its own joke;
 *   - a conversation runs to the end when nobody is watching;
 *   - a talking man's awareness climbs measurably slower than the same man
 *     stood at the same post not talking;
 *   - the instant either man notices, the take is CUT -- the audio source is
 *     stopped and the subtitle is clipped mid-sentence -- and both men are
 *     handed back to their patrol;
 *   - the line is positional and glued to the speaking body via
 *     `AudioEngine.play`'s `follow`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { ensureDomShim } from '../tools/three-shim.mjs';

import { buildPalaceCast, PALACE_GUARD_POSTS } from '../src/cartel-palace/cast.js';
import {
  CONVERSATION_PAIR_RANGE,
  PALACE_CONVERSATIONS,
  PalaceGuardConversations,
  allPalaceConversationLines,
  palaceConversationCue,
} from '../src/cartel-palace/conversations.js';
import {
  CONVERSATION_BREAK_AWARENESS,
  PalaceSecurity,
} from '../src/cartel-palace/security.js';
import {
  PALACE_GUARD_BARK_CAST,
  PALACE_GUARD_VOICES,
  PALACE_GUARD_VOICE_CAST,
  PalaceVoice,
  palaceGuardVoice,
  palaceRecastLines,
} from '../src/cartel-palace/voice.js';
import { AabbCombatSpace } from '../src/core/combat/index.js';

ensureDomShim();
const { buildCartelPalace } = await import('../src/cartel-palace/world.js');

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

/** An AudioEngine stub with only the surface `PalaceVoice.playCue` touches. */
function fakeAudio(cues = []) {
  const buffers = new Map();
  for (const cue of cues) buffers.set(`vo.${cue}.1`, [{ duration: 2.9 }]);
  const played = [];
  return {
    buffers,
    played,
    sampleDuration: (name) => buffers.get(name)?.[0]?.duration ?? 0,
    play(name, opts = {}) {
      const source = { name, stopped: false, stop() { this.stopped = true; } };
      played.push({ name, opts, source });
      return source;
    },
  };
}

function harness({ conversations = PALACE_CONVERSATIONS, cues = null } = {}) {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const security = new PalaceSecurity({ cast, colliders: [], random: () => 0.5 });
  const subtitles = [];
  const audio = fakeAudio(cues ?? allPalaceConversationLines().map((row) => row.cue));
  const voice = new PalaceVoice({
    audio,
    hud: { say: (text, ms) => subtitles.push({ text, ms }) },
    /* No player, so `audible` never gates the subtitle: this file is testing
     * the conversation, not the radius rules ./voice.js already owns. */
    player: null,
    gap: 0,
    random: () => 0,
  });
  const shift = new PalaceGuardConversations({
    cast, security, voice, conversations, random: () => 0.5, startDelay: 1,
  });
  /* Far enough away that nobody ever sees him; the tests that need a man
   * noticed set awareness directly, which is what security itself writes. */
  const playerPosition = new THREE.Vector3(0, 0, 400);
  const step = (seconds, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) {
      security.update(dt, { playerPosition });
      shift.update(dt);
    }
  };
  return {
    scene, cast, security, voice, audio, subtitles, shift, step, playerPosition,
  };
}

function room(shift, id) {
  return shift.rooms.find((entry) => entry.spec.id === id);
}

let cachedWorld = null;
function world() {
  if (!cachedWorld) {
    cachedWorld = buildCartelPalace(new THREE.Scene());
    cachedWorld.root.updateMatrixWorld(true);
  }
  return cachedWorld;
}

/* ------------------------------------------------------------------ */
/* The casting                                                         */
/* ------------------------------------------------------------------ */

test('the payroll is three distinct voices and every posted man is cast to one', () => {
  assert.equal(new Set(PALACE_GUARD_VOICES).size, 3, 'the split is not three voices');
  for (const post of PALACE_GUARD_POSTS) {
    const voice = PALACE_GUARD_VOICE_CAST[post.id];
    assert.ok(voice, `${post.id} has no voice`);
    assert.ok(PALACE_GUARD_VOICES.includes(voice), `${post.id} is cast to an unknown profile`);
  }
  /* All three are actually used -- a split nobody uses is one voice with two
   * spare names. */
  const used = new Set(Object.values(PALACE_GUARD_VOICE_CAST));
  assert.equal(used.size, 3, 'one of the three profiles is never posted anywhere');
});

test('the cast hands every guard body its own voice', () => {
  const cast = buildPalaceCast(new THREE.Group());
  for (const guard of cast.guards) {
    assert.equal(guard.voice, palaceGuardVoice(guard.id), `${guard.id} does not know its voice`);
  }
});

test('the eight existing guard barks are redistributed across all three profiles', () => {
  const rows = palaceRecastLines();
  assert.equal(rows.length, 8, 'the recast is not the eight existing barks');
  const byVoice = new Map();
  for (const row of rows) {
    assert.ok(PALACE_GUARD_VOICES.includes(row.voice), `${row.cue} is not on a split profile`);
    byVoice.set(row.voice, (byVoice.get(row.voice) ?? 0) + 1);
    assert.equal(row.voice, PALACE_GUARD_BARK_CAST[row.id], `${row.id} recast drifted`);
  }
  assert.equal(byVoice.size, 3, 'the barks did not reach all three men');
  /* The desk man's greeting has to be the desk man's voice, or the seated
   * guard says hello in somebody else's throat. */
  assert.equal(PALACE_GUARD_BARK_CAST['guard.watch.greet'], palaceGuardVoice('entry-watch'));
});

/* ------------------------------------------------------------------ */
/* The writing                                                         */
/* ------------------------------------------------------------------ */

test('every conversation is two different men taking turns, not two monologues', () => {
  assert.ok(PALACE_CONVERSATIONS.length >= 3, 'the estate has almost nothing to say');
  for (const spec of PALACE_CONVERSATIONS) {
    const [a, b] = spec.pair;
    assert.notEqual(a, b, `${spec.id} pairs a man with himself`);
    assert.ok(PALACE_GUARD_POSTS.some((post) => post.id === a), `${spec.id}: ${a} is not posted`);
    assert.ok(PALACE_GUARD_POSTS.some((post) => post.id === b), `${spec.id}: ${b} is not posted`);
    assert.notEqual(
      palaceGuardVoice(a), palaceGuardVoice(b),
      `${spec.id} is one voice arguing with itself`,
    );
    assert.ok(spec.lines.length >= 8, `${spec.id} is a bark exchange, not a conversation`);
    const sides = new Set(spec.lines.map((line) => line.who));
    assert.deepEqual([...sides].sort(), [0, 1], `${spec.id} is a monologue`);
    let run = 0;
    let previous = null;
    for (const line of spec.lines) {
      run = line.who === previous ? run + 1 : 0;
      assert.ok(run < 2, `${spec.id} lets one man say three lines in a row`);
      previous = line.who;
      assert.ok(line.text.trim().length > 0, `${spec.id}/${line.id} is empty`);
      assert.ok(line.hold > 0, `${spec.id}/${line.id} has no hold`);
      assert.ok(line.direction, `${spec.id}/${line.id} has no direction for the booth`);
    }
  }
});

test('the A-Team is admired, the playoff record is defended, and nobody winks', () => {
  const lines = allPalaceConversationLines();
  const all = lines.map((row) => row.say).join(' ');
  assert.match(all, /A-Team/, 'nobody mentions the A-Team');
  assert.match(all, /playoff/i, 'the record never comes up');
  /* Defended AT LENGTH: the flagship exchange has to spend real time on it. */
  const record = PALACE_CONVERSATIONS.find((spec) => spec.id === 'record');
  assert.ok(record, 'the playoffs conversation is gone');
  const playoffLines = record.lines.filter((line) => /playoff|bracket|season|trophy/i.test(line.text));
  assert.ok(playoffLines.length >= 3, 'the record gets one line and a shrug');
  /* It has to wander too -- these are men on a shift, not a themed exhibit. */
  const wandering = lines.filter((row) => /overtime|hours|shift|tray|kitchen|eat|door|drive|docks?\b/i
    .test(row.say));
  assert.ok(wandering.length >= 6, 'the shift never talks about the shift');
  /* docs/TONE-AND-PARODY.md: the scene may never acknowledge its own joke. */
  for (const row of lines) {
    assert.doesNotMatch(
      row.say,
      /\b(funny|joke|kidding|ironic|hilarious|movie|like in a film|get it)\b/i,
      `${row.id} winks at the player`,
    );
  }
});

test('every conversation cue is unique, prefixed and cast to the man who says it', () => {
  const lines = allPalaceConversationLines();
  assert.ok(lines.length >= 40, 'the conversations have thinned out');
  const names = new Set();
  for (const row of lines) {
    assert.ok(row.name.startsWith('vo.palace.shift.'), `${row.name} is off the conversation prefix`);
    assert.equal(row.cue, palaceConversationCue(row.id));
    assert.equal(names.has(row.name), false, `${row.name} is declared twice`);
    names.add(row.name);
    assert.equal(row.voice, palaceGuardVoice(row.speaker), `${row.id} is cast to the wrong man`);
    assert.ok(PALACE_GUARD_VOICES.includes(row.voice));
  }
});

/* ------------------------------------------------------------------ */
/* The marks                                                           */
/* ------------------------------------------------------------------ */

test('every talk mark is clear floor with a clear line to the other man', () => {
  const palace = world();
  const space = new AabbCombatSpace({ boxes: palace.colliders, radius: 0.31, height: 1.78 });
  const blocked = (x, z, clearance = 0.4) => palace.colliders.some((box) => (
    box?.min && box?.max
    && box.max.y > 0.2 && box.min.y < 1.7
    && x > box.min.x - clearance && x < box.max.x + clearance
    && z > box.min.z - clearance && z < box.max.z + clearance
  ));
  for (const spec of PALACE_CONVERSATIONS) {
    const [a, b] = spec.marks;
    assert.equal(blocked(a[0], a[1]), false, `${spec.id} mark A is inside the building`);
    assert.equal(blocked(b[0], b[1]), false, `${spec.id} mark B is inside the building`);
    const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
    assert.ok(gap > 0.9, `${spec.id} stands two men in the same square metre`);
    assert.ok(gap <= CONVERSATION_PAIR_RANGE, `${spec.id} is two men shouting across a courtyard`);
    const sight = space.trace(
      new THREE.Vector3(a[0], 1.5, a[1]),
      new THREE.Vector3(b[0], 1.5, b[1]),
    );
    assert.equal(sight, null, `${spec.id} talks through a wall`);
    /* And the walk out to it is a drift, not a march across the estate. */
    for (let side = 0; side < 2; side++) {
      const post = PALACE_GUARD_POSTS.find((entry) => entry.id === spec.pair[side]);
      const walk = Math.hypot(post.x - spec.marks[side][0], post.z - spec.marks[side][1]);
      assert.ok(walk <= 10, `${spec.id}: ${post.id} abandons his post to get there`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* The runtime                                                         */
/* ------------------------------------------------------------------ */

test('an unwatched pair gathers, talks its way to the end and goes back on patrol', () => {
  const spec = PALACE_CONVERSATIONS.find((entry) => entry.id === 'record');
  const { shift, security, cast, step } = harness({ conversations: [spec] });
  const talk = room(shift, 'record');
  const men = talk.men;

  step(3);
  assert.equal(talk.phase, 'gathering', 'nobody went to their mark');
  for (const entry of men) assert.ok(security.idleTask(entry), `${entry.id} is still on his round`);

  /* Long enough to walk over and say every line. */
  step(30);
  assert.equal(talk.phase, 'talking', 'the pair never settled into a conversation');
  for (const entry of men) {
    assert.ok(
      security.idleTaskArrived(entry) || entry.seated,
      `${entry.id} never made it to his mark`,
    );
  }
  assert.ok(
    men[0].root.position.distanceTo(men[1].root.position) <= CONVERSATION_PAIR_RANGE,
    'they are talking from opposite ends of the drive',
  );

  step(120);
  assert.ok(shift.completed >= 1, 'the conversation never finished');
  assert.equal(shift.broken, 0, 'nothing interrupted them and it broke anyway');
  /* Every line, in order, exactly once through the run. */
  const wanted = spec.lines.map((line) => palaceConversationCue(line.id));
  assert.deepEqual(shift.spoken.slice(0, wanted.length), wanted);
  const [a, b] = talk.spec.pair;
  assert.ok(cast.guards.some((guard) => guard.id === a));
  assert.ok(cast.guards.some((guard) => guard.id === b));
});

test('the line is positional and follows the man who is saying it', () => {
  const spec = PALACE_CONVERSATIONS.find((entry) => entry.id === 'record');
  const { shift, audio, step } = harness({ conversations: [spec] });
  step(40);
  assert.ok(audio.played.length > 0, 'not one word came out of anybody');
  const first = audio.played[0];
  assert.ok(first.name.startsWith('vo.palace.shift.record.'), 'the wrong bank is playing');
  const talk = room(shift, 'record');
  const speaker = talk.men[spec.lines[0].who];
  assert.equal(first.opts.follow, speaker.root, 'the line is not glued to the speaker');
  assert.ok(first.opts.position, 'the line has no world position at all');
  assert.ok(Number.isFinite(first.opts.maxDist), 'the line does not attenuate with distance');
});

test('a man in conversation is measurably slower to notice somebody', () => {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const security = new PalaceSecurity({ cast, colliders: [], random: () => 0.5 });
  const [talking, watching] = cast.guards;
  for (const entry of cast.all) entry.active = entry === talking || entry === watching;
  /* Same post, same facing, same contact -- the ONLY difference is the
   * errand, so the number that comes out is the errand's number. */
  for (const entry of [talking, watching]) {
    entry.patrol = [];
    entry.seated = false;
    entry.root.rotation.y = 0;
  }
  talking.root.position.set(0, 0, 0);
  watching.root.position.set(60, 0, 0);
  const playerPosition = new THREE.Vector3(0, 0, 7);
  const otherPlayer = new THREE.Vector3(60, 0, 7);

  security.setIdleTask(talking, {
    goal: talking.root.position.clone(), anchored: true, attention: 0.45,
  });
  for (let frame = 0; frame < 12; frame++) {
    security.update(1 / 60, { playerPosition });
  }
  const distracted = talking.awareness;
  /* The control runs on its own clock at its own address so the two men
   * never see each other's contact. */
  const control = new PalaceSecurity({ cast, colliders: [], random: () => 0.5 });
  control.setIdleTask(watching, null);
  for (let frame = 0; frame < 12; frame++) {
    control.update(1 / 60, { playerPosition: otherPlayer });
  }
  const alert = watching.awareness;

  assert.ok(alert > 0, 'the control never saw the player at all');
  assert.ok(distracted > 0, 'the talking man is blind, not distracted');
  assert.ok(distracted < alert * 0.6, `talking bought nothing: ${distracted} vs ${alert}`);
});

test('being noticed stops a man mid-sentence and puts both back on their rounds', () => {
  const spec = PALACE_CONVERSATIONS.find((entry) => entry.id === 'record');
  const {
    shift, security, subtitles, step,
  } = harness({ conversations: [spec] });
  step(40);
  const talk = room(shift, 'record');
  assert.equal(talk.phase, 'talking');
  assert.ok(talk.line, 'nobody is mid-line to interrupt');
  const live = talk.line;
  const before = subtitles.length;

  /* Exactly what security writes onto a body the frame it resolves a shape
   * into a man. Nothing else is touched. */
  talk.men[1].awareness = CONVERSATION_BREAK_AWARENESS + 0.01;
  shift.update(1 / 30);

  assert.equal(live.take.source.stopped, true, 'the take played on over a man who had been seen');
  assert.equal(talk.phase, 'resting', 'the conversation carried on regardless');
  assert.equal(shift.broken, 1);
  for (const entry of talk.men) {
    assert.equal(security.idleTask(entry), null, `${entry.id} is still stood on his mark`);
  }
  const clipped = subtitles.at(-1);
  assert.ok(subtitles.length > before, 'the screen never showed the interruption');
  assert.match(clipped.text, /—$/, 'the subtitle finished the sentence the voice did not');
  assert.ok(
    clipped.text.length < `${live.line.text}`.length + 64,
    'the clipped subtitle is the whole line again',
  );
});

test('the alarm ends every conversation in the estate for the night', () => {
  const { shift, security, step } = harness();
  step(45);
  assert.ok(shift.rooms.some((entry) => entry.phase === 'talking'), 'nobody ever started');
  security.raiseAlarm('test');
  const cut = shift.cutAll('alarm');
  assert.ok(cut > 0, 'nothing was cut');
  for (const entry of shift.rooms) assert.equal(entry.phase, 'resting');
  /* And they do not start up again while the alarm is live. */
  step(90);
  for (const entry of shift.rooms) assert.equal(entry.phase, 'resting');
  /* Nobody is left standing on a mark instead of fighting. */
  for (const entry of shift.rooms.flatMap((record) => record.men)) {
    assert.equal(security.idleTask(entry), null, `${entry.id} is still on an errand`);
  }
});

test('a pair whose man is already suspicious never starts talking in the first place', () => {
  const spec = PALACE_CONVERSATIONS.find((entry) => entry.id === 'record');
  const { shift } = harness({ conversations: [spec] });
  const talk = room(shift, 'record');
  /* Security rewrites awareness off perception every frame, so hold it up the
   * way a live contact would rather than setting it once. */
  for (let t = 0; t < 6; t += 1 / 30) {
    talk.men[0].awareness = CONVERSATION_BREAK_AWARENESS + 0.2;
    shift.update(1 / 30);
  }
  assert.equal(talk.phase, 'resting', 'a suspicious man wandered off to have a chat');
  assert.equal(shift.spoken.length, 0);
});

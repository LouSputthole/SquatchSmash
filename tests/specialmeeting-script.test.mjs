/**
 * THE SPECIAL MEETING — the scene, held to its own claims.
 *
 * This scene is an argument rather than a set of mechanics: three men rearrange
 * a car so the Prospect ends up beside the driver, nobody is rude to him, and
 * there is no way out of that seat. All three halves of that are properties a
 * machine can check, and this file checks them:
 *
 *   1. Every branch ends in the front seat. Not most. Every one.
 *   2. Nobody ever reassures him.
 *   3. The owner's verbatim lines are exactly as he wrote them.
 *
 * Plus the plumbing the scene cannot ship without: the campaign route runs
 * through it, and every line anybody says has a cue in the manifest — in both
 * directions, so a cue can neither go missing nor linger after its line is cut.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHARACTER_IDS, SCENE_IDS, TIME_EVENT_IDS, createCampaign,
} from '../src/core/campaign.js';
import { CHARACTER_REGISTRY } from '../src/core/characters.js';
import { WARDROBE, KITTENBOSS } from '../src/core/wardrobe.js';
import { APPEARANCES, CAMPAIGN_SCENE_COVERAGE, SCENES } from '../src/core/appearances.js';
import {
  BEATS, CUE_PREFIX, CALL_CUE_PREFIX, FINAL_SEATING, FORBIDDEN_NPC_PHRASES,
  HUB_ID, SEAT_ID, SPEAKERS, STAGED_VOICES, TRUNK_OCCUPANT,
  beat, followHubOption, hubOptions, scriptCues,
} from '../src/specialmeeting/script.js';
import { createRideSequence, walkScene } from '../src/specialmeeting/ride.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const sceneCasts = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/scene-casts.json'), 'utf8'));

/* A campaign needs somewhere to write. Same shape the campaign suite uses. */
class MemoryStorage {
  constructor() { this.values = new Map(); }

  getItem(key) { return this.values.get(key) ?? null; }

  setItem(key, value) { this.values.set(key, String(value)); }

  removeItem(key) { this.values.delete(key); }
}

const freshCampaign = () => createCampaign({ storage: new MemoryStorage() });

const cues = scriptCues();
const manifestByName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));

/* ====================================================================== *
 * 1. THE FRONT SEAT
 * ====================================================================== */

test('every way of refusing the front seat comes back to the front seat', () => {
  const hub = beat(HUB_ID);
  assert.equal(hub.kind, 'choice');
  assert.equal(hub.options.length, 8, 'the owner wrote eight ways to refuse');

  const endings = hub.options.map((option) => followHubOption(option));
  assert.equal(endings.filter((e) => e === 'seat').length, 1,
    'exactly one option is the seat itself');
  assert.deepEqual([...new Set(endings)].sort(), ['hub', 'seat'],
    'a branch may only sit him down or return him to the hub — there is no third door');
});

test('the seat is on the table from the first frame and can never be taken away', () => {
  for (const declines of [0, 1, 2, 3, 9]) {
    const open = hubOptions(declines);
    assert.ok(open.some((option) => option.accepts),
      `after ${declines} refusals he can still simply get in`);
  }
  const accepting = beat(HUB_ID).options.filter((option) => option.accepts);
  assert.equal(accepting.length, 1);
  assert.equal(accepting[0].to, SEAT_ID);
  assert.equal(accepting[0].unlocksAfter, 0, 'the seat is never locked behind a refusal');
});

test('refusing unlocks more to say and never less', () => {
  assert.equal(hubOptions(0).length, 3, 'three questions to begin with');
  assert.equal(hubOptions(1).length, 7, 'four more once he has said no once');
  assert.equal(hubOptions(2).length, 8, 'and the last thing he has, after twice');
  for (const declines of [0, 1, 2]) {
    assert.ok(hubOptions(declines).length <= hubOptions(declines + 1).length,
      'nobody ever takes an option away from him for asking');
  }
});

test('however the player plays it, the scene ends seated and at the treeline', () => {
  const pickers = {
    'always the first': () => 1,
    'always the last': (options) => options[options.length - 1].index,
    'always the second': (options) => options[Math.min(1, options.length - 1)].index,
    'always the third': (options) => options[Math.min(2, options.length - 1)].index,
    'always the fourth': (options) => options[Math.min(3, options.length - 1)].index,
    'round robin': (options, b, n) => options[(n - 1) % options.length].index,
    'refuse everything first': (options) => {
      const refusal = options.find((option) => !option.accepts);
      return (refusal ?? options[0]).index;
    },
  };
  const seen = new Set();
  for (const [name, pick] of Object.entries(pickers)) {
    const run = walkScene({ pick });
    assert.equal(run.finished, true, `${name}: the scene has to end`);
    assert.equal(run.seated, true, `${name}: he is in the front seat`);
    assert.equal(run.beatId, 'SM-540', `${name}: it ends at the hand-off`);
    assert.equal(run.phase, 'handoff', `${name}: and hands off to the Initiation`);
    for (const id of run.visited) seen.add(id);
  }

  /* Act One is the flat, and the flat plays it on its own timers — nothing
   * reachable from the kerb should be unreachable, though. */
  const drive = BEATS.filter((b) => b.act >= 2).map((b) => b.id);
  const missed = drive.filter((id) => !seen.has(id));
  assert.deepEqual(missed, [],
    `unreachable beats in the car or the woods: ${missed.join(', ')}`);
});

test('the man in the seat behind him is never nobody', () => {
  assert.equal(FINAL_SEATING.front_passenger, CHARACTER_IDS.PROSPECT);
  assert.equal(FINAL_SEATING.driver, CHARACTER_IDS.SEFF);
  assert.equal(FINAL_SEATING.rear_right, CHARACTER_IDS.NUMBSKULL,
    'directly behind the Prospect, which is the whole scene');
  assert.equal(FINAL_SEATING.rear_left, CHARACTER_IDS.LAG);
  assert.equal(TRUNK_OCCUPANT, CHARACTER_IDS.KITTENBOSS);

  /* SM-322: Numbskull offers to move, and if the player accepts, Lag slides
   * across into the seat he left. The arrangement survives the courtesy. */
  const swap = beat('SM-322');
  assert.ok(swap.lines.some((line) => line.swapRear),
    'accepting the offer has to actually move somebody');
  assert.ok(swap.lines.some((line) => line.who === 'LAG' && line.text === 'Better?'),
    'and the man who slid across asks, sincerely, whether that is better');
});

test('taking the seat is the only thing that seats him', () => {
  const seq = createRideSequence({ onLine: () => 0.01 });
  seq.begin('SM-100');
  for (let i = 0; i < 500 && !seq.options; i += 1) seq.update(0.5);
  assert.equal(seq.seated, false, 'the door is open and he is still on the pavement');

  /* Refuse everything he is ever offered. Nobody escalates; nothing happens. */
  for (let i = 0; i < 400 && seq.beatId !== SEAT_ID; i += 1) {
    if (seq.options) {
      const refusal = seq.options.find((option) => !option.accepts);
      if (!refusal) break;
      seq.choose(refusal.index);
    } else seq.update(0.5);
  }
  assert.equal(seq.seated, false, 'refusing never puts him in the car by force');
  assert.ok(seq.declines >= 3, 'he got to say all of it');
  assert.ok(seq.options?.some((option) => option.accepts),
    'and the only thing still on the list is the seat');
});

/* ====================================================================== *
 * 2. NOBODY RELEASES THE TENSION
 * ====================================================================== */

test('nobody in this scene reassures him', () => {
  const offences = [];
  for (const b of BEATS) {
    for (const line of b.lines) {
      if (!line.spoken || line.who === 'PROSPECT') continue;
      const text = line.text.toLowerCase();
      for (const phrase of FORBIDDEN_NPC_PHRASES) {
        if (text.includes(phrase)) offences.push(`${b.id} ${line.who}: "${line.text}"`);
      }
    }
  }
  assert.deepEqual(offences, [],
    'the scene works because nobody reassures him and nobody explains:\n'
    + offences.join('\n'));
});

test('the valve opens once and is closed again immediately', () => {
  const valve = beat('SM-310');
  assert.deepEqual(valve.lines.map((line) => line.text), [
    'Relax.',
    "That's usually not something you want to hear from the guy sitting behind you.",
    'Fair.',
  ], 'the only laugh in the scene is the owner\'s and is not to be rewritten');
  assert.ok(valve.lines.every((line) => line.verbatim));
  assert.equal(valve.next, 'SM-320', 'SM-320 exists to put it straight back down');

  const down = beat('SM-320');
  assert.ok(down.lines.some((line) => line.text === 'You want me to move?'));
  assert.equal(down.options.length, 3);
});

test("nobody names what this is before the trees open", () => {
  const named = BEATS
    .filter((b) => b.id !== 'SM-540')
    .flatMap((b) => b.lines.filter((line) => line.spoken))
    .filter((line) => /initiation|ceremony|the circle|founders/i.test(line.text));
  assert.deepEqual(named, [], 'he finds out when the player does');
});

/* ====================================================================== *
 * 3. THE OWNER'S OWN LINES
 * ====================================================================== */

test("the phone call is the owner's, word for word", () => {
  const call = beat('SM-030');
  assert.ok(call.lines.every((line) => line.verbatim), 'the whole exchange is verbatim');
  assert.deepEqual(call.lines.map((line) => `${line.who}: ${line.text}`), [
    'BOOSKI: Prospect.',
    "PROSPECT: What's up?",
    "BOOSKI: We're having a meeting tonight.",
    'PROSPECT: Yeah?',
    'BOOSKI: Yeah. Special one.',
    'PROSPECT: What kinda special?',
    "BOOSKI: You'll find out.",
    'PROSPECT: Where?',
    "BOOSKI: Don't worry about that. We're sending some guys over to pick you up.",
    'PROSPECT: Who?',
    "BOOSKI: Seff, Lag and Numbskull. They'll be there soon.",
    'PROSPECT: Booski, what is this?',
    "BOOSKI: It's a meeting, Prospect. Put on something decent.",
  ]);
  assert.ok(call.lines.at(-1).hangUpAfter, 'he hangs up first, mid-air, without a goodbye');
});

test('the call takes its own bank rather than overwriting the big-night one', () => {
  const bignight = manifest.sfx.filter((cue) => cue.name.startsWith('vo.call.booski.bignight.'));
  assert.ok(bignight.length >= 4, 'the existing recorded call is still there');
  const ours = cues.filter((cue) => cue.beat === 'SM-030');
  assert.ok(ours.length > 0);
  for (const cue of ours) {
    assert.ok(cue.name.startsWith(CALL_CUE_PREFIX),
      `${cue.name} must sit on this scene's own call bank`);
  }
});

test('the load-bearing verbatim beats survive a punch-up pass', () => {
  const pinned = {
    'SM-100': ['Front.'],
    'SM-120': ["I'll sit in the back.", 'Nah. Take the front.', "I'm good back there.", 'Prospect. Sit up front.'],
    'SM-130': ['Why do I have to sit up front?', "Because we're asking you to sit up front.",
      "That's not really an answer.", "It's the answer you're getting."],
    'SM-180': ["I really don't like this.", "You're making it weird.", 'Get in.'],
    'SM-190': ['All right.'],
    'SM-240': ['You guys always hold meetings in the middle of nowhere?', 'Some meetings.'],
    'SM-270': ['I know what goes on out in the woods.', 'You do?', 'Yeah.', 'Huh.'],
    'SM-300': ["Booski could've just told me where we were going.", "He could've.",
      "But he didn't.", 'Nope.'],
    'SM-410': ['Pop the trunk.'],
    'SM-500': ["Come on. They're waiting."],
    'SM-540': ['Go on.'],
  };
  for (const [id, expected] of Object.entries(pinned)) {
    const spoken = beat(id).lines.filter((line) => line.spoken).map((line) => line.text);
    assert.deepEqual(spoken.filter((text) => expected.includes(text)), expected,
      `${id} has drifted from the owner's text`);
    for (const line of beat(id).lines.filter((l) => l.spoken && expected.includes(l.text))) {
      assert.equal(line.verbatim, true, `${id}: "${line.text}" has lost its verbatim mark`);
    }
  }
});

test('both of the trunk greetings are kept and neither is explained', () => {
  const kb = beat('SM-420');
  const greetings = kb.lines.filter((line) => line.alternate === 'trunk_greeting');
  assert.deepEqual(greetings.map((line) => line.text),
    ['Jesus Christ. Finally.', 'Next time somebody crack a window.']);
  assert.ok(greetings.every((line) => line.verbatim));

  const answer = kb.lines.find((line) => line.who === 'NUMBSKULL');
  assert.equal(answer.text, 'Long story.', 'the whole answer, and the end of the subject');

  /* And the other prospect got the same answer, which is the beat where the
   * player works out that nobody is telling either of them anything. */
  const echo = beat('SM-442').lines.filter((line) => line.spoken).map((line) => line.text);
  assert.deepEqual(echo, ["You'd have to ask them.", 'I did.', 'And?', 'Long story.', "Yeah. That's what I got."]);
});

/* ====================================================================== *
 * 4. THE ROUTE
 * ====================================================================== */

test('the campaign route runs Cartel Palace -> the Special Meeting -> Initiation Night', () => {
  const campaign = freshCampaign();
  assert.ok(SCENE_IDS.SPECIAL_MEETING, 'the scene has a campaign id');

  campaign.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });
  const moved = campaign.transition(SCENE_IDS.SPECIAL_MEETING, { spawn: 'kerb' });
  assert.equal(moved.scene.id, SCENE_IDS.SPECIAL_MEETING);
  assert.equal(moved.scene.spawn, 'kerb');

  const arrived = campaign.transition(SCENE_IDS.INITIATION, { spawn: 'gathering' });
  assert.equal(arrived.scene.id, SCENE_IDS.INITIATION,
    'and it goes exactly one place from there');

  /* And the old edge is GONE.
   *
   * It was legal for exactly as long as the Palace's own exit button still
   * named the Initiation: a transition the graph refuses throws rather than
   * degrading, so pulling the edge first would have stranded anybody who had
   * just finished the Palace. That button now names the Special Meeting
   * (`src/cartel-palace/main.js`), so the bridge came out, and this assertion
   * flipped from `doesNotThrow` to the opposite — which is the only proof that
   * nothing can quietly route round the scene again. */
  const legacy = freshCampaign();
  legacy.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });
  assert.throws(
    () => legacy.transition(SCENE_IDS.INITIATION, { spawn: 'gathering' }),
    /Cannot transition from "cartel_palace" to "initiation"/,
  );
});

test('the scene has its own spawns and its own place on the clock', () => {
  const campaign = freshCampaign();
  campaign.enter(SCENE_IDS.SPECIAL_MEETING, { spawn: 'spur' });
  assert.equal(campaign.state.scene.spawn, 'spur',
    'a save that comes back after the drive resumes in the woods');

  const before = campaign.state.story.timeMinutes + campaign.state.story.day * 24 * 60;
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SPECIAL_MEETING);
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);
  const after = campaign.state.story.timeMinutes + campaign.state.story.day * 24 * 60;
  assert.ok(after > before, 'the evening costs real time');

  const again = campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);
  assert.equal(again.applied, false, 'and a reload cannot farm it twice');
});

/* ====================================================================== *
 * 5. EVERY LINE HAS A CUE, AND EVERY CUE HAS A LINE
 * ====================================================================== */

test('every line in the script has a manifest cue that says the same words', () => {
  assert.ok(cues.length > 200, 'the scene is not a stub');
  const missing = [];
  const wrong = [];
  for (const cue of cues) {
    const entry = manifestByName.get(cue.name);
    if (!entry) { missing.push(`${cue.beat} ${cue.name}`); continue; }
    if (entry.say !== cue.say) wrong.push(`${cue.name}: manifest "${entry.say}" vs script "${cue.say}"`);
    if (entry.voice !== cue.voice) wrong.push(`${cue.name}: voice ${entry.voice} vs ${cue.voice}`);
  }
  assert.deepEqual(missing, [], `lines with no cue:\n${missing.join('\n')}`);
  assert.deepEqual(wrong, [], `cues that disagree with the script:\n${wrong.join('\n')}`);
});

test('the manifest carries no Special Meeting cue the script no longer says', () => {
  const authored = new Set(cues.map((cue) => cue.name));
  const orphans = manifest.sfx
    .map((cue) => cue.name)
    .filter((name) => name.startsWith(CUE_PREFIX) || name.startsWith(CALL_CUE_PREFIX))
    .filter((name) => !authored.has(name));
  assert.deepEqual(orphans, [], `cues for lines nobody says any more:\n${orphans.join('\n')}`);
});

test('every spoken cue is named vo.* so the mouths lip-sync off the take', () => {
  const bad = cues.filter((cue) => !cue.name.startsWith('vo.'));
  assert.deepEqual(bad, [],
    'src/core/audio.js only builds an analyser for vo.* — anything else '
    + 'silently falls back to a synthesised envelope');
});

/* ====================================================================== *
 * 6. KITTENBOSS
 * ====================================================================== */

test('Kittenboss is a whole character and not a scene-local name', () => {
  assert.equal(CHARACTER_IDS.KITTENBOSS, 'kittenboss');
  const record = CHARACTER_REGISTRY[CHARACTER_IDS.KITTENBOSS];
  assert.ok(record, 'she has an identity record');
  assert.equal(record.canonicalName, 'Kittenboss');
  assert.equal(record.subtitleName, 'Kittenboss');
  assert.notEqual(record.subtitleName, 'Prospect',
    "src/bing/dialogue.js treats a speaker called 'Prospect' as the player and animates nobody");
  assert.equal(record.role, 'prospect', 'the same rank as Tony, which is the point');
  assert.equal(record.voiceProfile, 'kittenboss');
  assert.notEqual(record.id, CHARACTER_IDS.PROSPECT, 'two prospects, never merged');
});

test('Kittenboss has canonical clothes and a wardrobe-ledger row', () => {
  assert.equal(WARDROBE.kittenboss, KITTENBOSS, 'the map and the export are one object');
  assert.ok(Object.isFrozen(KITTENBOSS));

  const rows = APPEARANCES.filter((row) => row.character === CHARACTER_IDS.KITTENBOSS);
  assert.equal(rows.length, 1, 'exactly one appearance, and it is this scene');
  assert.equal(rows[0].scene, 'special_meeting');
  assert.equal(rows[0].model, KITTENBOSS, 'the ledger points at the frozen model itself');
  assert.match(rows[0].where, /boot|trunk/i, 'and says where she is');

  /* SHE. The scene was authored with Kittenboss written as a man and the body
   * was built to match -- `hair: 'short'`, no `gender`, no `bodyShape`, so
   * `makePerson` handed her the 0.226 male shoulder frame and the hard-edged
   * slabs. Corrected 2026-08-20 on the owner's ruling. These are the exact
   * three fields `makePerson` reads to decide the figure, so they are the
   * three that are pinned. */
  assert.equal(KITTENBOSS.gender, 'female', 'the body has to read as a woman on screen');
  assert.equal(KITTENBOSS.bodyShape, 'curvy',
    'gender alone only narrows the shoulders; the pair is how this roster builds a woman');
  assert.equal(KITTENBOSS.hair, 'tied',
    'she has no face photo, so the hair silhouette is the only thing that says who she is');

  /* And NOT small, NOT cute, NOT a victim. She is the same age and the same
   * rank as Tony, whose own model is 1.79 (`GOLF_PROSPECT`), and she stands
   * eye to eye with him -- shrinking her to signal "woman" would throw away
   * the only thing the staging has. */
  assert.equal(KITTENBOSS.height, 1.79, 'she is the same height as Tony and must stay it');
  assert.ok(KITTENBOSS.build >= 1, 'she is not built slighter than the prospect beside her');

  /* `neckline` is documented in src/bing/cast.js as `false | 'v'`. It shipped
   * as 'collar', which draws nothing AND fails the `!neckline` guard on the
   * `trim` placket -- so the one truthy string switched off the collar, the
   * placket and the buttons it was asking for. */
  assert.equal(KITTENBOSS.trim, true, 'she is stood next to the player for a whole act');
  assert.ok(!KITTENBOSS.neckline || KITTENBOSS.neckline === 'v',
    "neckline is false | 'v'; anything else silently suppresses the trim placket");
  assert.ok(SCENES.special_meeting, 'the fitting room knows the scene');

  const coverage = CAMPAIGN_SCENE_COVERAGE[SCENE_IDS.SPECIAL_MEETING];
  assert.equal(coverage.status, 'appearance-ledger');
  assert.deepEqual(coverage.appearanceScenes, ['special_meeting']);
});

test('Kittenboss is cast, in the house convention', () => {
  const profile = manifest.voices.kittenboss;
  assert.ok(profile, 'the profile exists so her lines can be minted');
  /* Cast by the owner. This assertion was `/^<.*>$/` — uncast on purpose,
   * subtitles over silence — for as long as nobody had supplied an id, and it
   * is now the opposite: a placeholder creeping back in would mean a part with
   * this much of it silent, and `tools/voice-needed.mjs` reads a `<…>` id as
   * cast rather than blocked, so nothing else would say so. */
  assert.doesNotMatch(profile.id, /^<.*>$/, 'a placeholder id is back in the manifest');
  assert.match(profile.id, /^[A-Za-z0-9]{16,}$/, 'not an ElevenLabs voice id');
  assert.ok(profile._note.length > 40, 'and the note tells the booth who she is');

  /* The booth note is the only prose the voice director reads, and it used to
   * open "the man in the boot" and close "do not play him as comic relief".
   * Whoever records her would have read that before hearing a single line.
   * Nothing in it may describe her as a man in any wording, so the assertion
   * is on the whole vocabulary rather than on the two phrases that were
   * actually wrong -- "the guy in the boot" would be exactly as bad. */
  assert.doesNotMatch(profile._note, /\b(he|him|his|himself|man|men|bloke|guy|lad)\b/i,
    'the booth note still describes Kittenboss as a man');
  assert.match(profile._note, /\bshe\b/i, 'and it has to say what she is');
  assert.match(profile._note, /same age and same rank as Tony/i,
    'the rank is the point of the character and the booth needs it');
  assert.match(profile._note, /never as frightened/i,
    'she is never frightened, and that is the hardest thing to get out of a booth');
  assert.doesNotMatch(profile._note, /UNCAST/i, 'she is cast; the placeholder sentence is gone');

  const hers = cues.filter((cue) => cue.voice === 'kittenboss');
  assert.ok(hers.length >= 20, 'she has a real part, not a cameo');
});

test('nothing in the scene calls Kittenboss a man', () => {
  /* A blanket pronoun sweep is not available here and would be wrong if it
   * were: this scene is four-fifths men, and "He is being accurate" (Seff, at
   * SM-430) and "Kittenboss falls in beside him anyway" (Tony, at SM-446) are
   * both correct as written. So the stage directions that describe HER are
   * pinned individually, the same way the owner's spoken lines are. */
  const directions = {
    'SM-420': 'She climbs out under her own power, unhurried, like somebody getting '
      + 'off a long coach. She is dressed up. She has also put on something '
      + 'decent. It is extremely creased.',
    'SM-430': 'She brushes herself down. Rolls one shoulder. Looks at the trees, '
      + 'then at the car, then at Tony.',
    'SM-443': 'She looks at the trees. Neither of them says the obvious thing.',
    'SM-524': 'She starts up the trail.',
  };
  for (const [id, text] of Object.entries(directions)) {
    const staged = beat(id).lines.filter((line) => !line.spoken).map((line) => line.stage);
    assert.ok(staged.includes(text),
      `${id} no longer carries its stage direction for her:\n${staged.join('\n')}`);
  }

  /* The one spoken word that moved, and the reason the manifest had to be
   * re-minted by hand: there is no `vo:specialmeeting` generator. It keeps its
   * verbatim mark because the owner changed the pronoun himself and nothing
   * either side of it was touched. */
  const asked = beat('SM-420').lines.find((line) => line.who === 'PROSPECT' && /trunk/.test(line.text));
  assert.equal(asked.text, 'Why was she in the trunk?');
  assert.equal(asked.verbatim, true, 'it is still a line the owner wrote');
  assert.equal(manifestByName.get(asked.cue).say, asked.text,
    'the cue for it has to say the same words');

  /* And nobody else calls her one either.
   *
   * Scoped to acts four and five -- the boot and the walk -- and NOT to the
   * scene, on purpose. Everyone in those two acts is stood in the same patch
   * of mud and is spoken to directly, so the only person anybody refers to in
   * the third person is Kittenboss, and any male word there is about her. A
   * scene-wide sweep would be a false positive on the first try: at SM-310
   * Tony says "the guy sitting behind you" about Numbskull, and that line is
   * the owner's, is the only laugh in the scene, and is pinned verbatim
   * elsewhere in this file. Over-applying the fix is worse than the bug.
   *
   * If a future line in these acts genuinely refers to Seff, Lag or Numbskull
   * in the third person, narrow this to the beats Kittenboss is in rather than
   * deleting it. */
  const male = /\b(he|him|his|himself|man|men|bloke|guy|lad|fella)\b/i;
  const late = BEATS.filter((b) => b.act >= 4);
  assert.ok(late.length >= 15, 'acts four and five are the half of the scene she is in');
  const offences = late
    .flatMap((b) => [
      ...b.lines.filter((line) => line.spoken).map((line) => `${b.id} ${line.who}: ${line.text}`),
      ...b.options.map((o) => `${b.id} option: ${o.text}`),
    ])
    .filter((entry) => male.test(entry));
  assert.deepEqual(offences, [],
    `somebody at the car or on the trail is calling Kittenboss a man:\n${offences.join('\n')}`);
});

test('everybody with lines in this scene has a body in it, except the phone', () => {
  const entry = sceneCasts.scenes.find((scene) => scene.id === 'special-meeting');
  assert.ok(entry, 'tools/scene-casts.json claims this scene');
  assert.deepEqual(entry.cuePrefixes, [CUE_PREFIX]);
  assert.deepEqual([...entry.staged].sort(), [...STAGED_VOICES].sort());

  const voicesOnScenePrefix = new Set(cues
    .filter((cue) => cue.name.startsWith(CUE_PREFIX) && cue.voice !== 'player')
    .map((cue) => cue.voice));
  for (const voice of voicesOnScenePrefix) {
    assert.ok(entry.staged.includes(voice), `${voice} speaks here and must be standing here`);
  }
  assert.ok(!voicesOnScenePrefix.has(SPEAKERS.BOOSKI.voice),
    'Booskibro is a phone call and nothing else; his cues stay on vo.call.*');
});

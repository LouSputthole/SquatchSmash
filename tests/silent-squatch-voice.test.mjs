/**
 * PROJECT SILENT SQUATCH — the writing, and the ledger it is not in yet.
 *
 * The Silver Case and The Enola Squatch shipped 147 authored lines that were
 * invisible to the recording sheet, so every one of them was silent-with-a-
 * subtitle forever and nothing reported it. tests/new-scene-voice-manifest
 * .test.mjs is the contract that keeps that from happening again, and this is
 * the same contract for this mission:
 *
 *   - every line the script names has a unique cue, a voice and words;
 *   - every voice is a profile that exists in assets/sfx/manifest.json, OR is
 *     one of the names declared in `PENDING_VOICE_PROFILES` (the owner casts
 *     centrally; nothing here invents an ElevenLabs id);
 *   - the manifest's gap is exactly the declared backlog and nothing else, so
 *     a line authored after the last `npm run vo:sync` is a written-down fact
 *     rather than a hole;
 *   - the lines the spec quotes are in the game word for word.
 *
 * Nothing in this file writes a manifest. Cue generation is central
 * (`npm run vo:*`), and this mission's cues have not been generated yet.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PENDING_VOICE_PROFILES,
  SCIENTIST_INDEX,
  SEQUENCES,
  SPEAKERS,
  INSTRUCTIONS,
  OBJECTIVES,
  allSilentSquatchLines,
} from '../src/mansion/script.js';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);

/**
 * The mission's authored cues, per scope.
 *
 * This table used to be the *backlog*: none of these were in the manifest,
 * because the mission was written in the same pass as the scene and there was
 * no `tools/mansion-vo.mjs` to carry them across. It said "WHEN THE CUES ARE
 * GENERATED, THIS TABLE GOES TO ZERO", and on 2026-08-04 they were generated.
 *
 * It has not gone to zero; it has changed job. It is now the SHIPPING
 * INVENTORY, and the test below asserts the manifest contains every one of
 * these and nothing else on the prefix. That is a stronger contract than the
 * backlog was: a scope that gains a line fails here until the number is
 * updated AND `npm run vo:mansion` has been run, so the sheet the voice actor
 * reads can no longer fall behind the script the game plays.
 *
 * The 147 lines were invisible to VOICE-LINES-TODO.md for eleven days.
 * Nothing reported it, because a cue that is not in the manifest is not
 * missing — it does not exist.
 */
const CUES_AWAITING_VO_SYNC = Object.freeze({
  arrival: 10, // Rippin, Eric, Shubes, Snow, and the Prospect on the way in
  office: 10, // Lou, and the case on his desk
  cellar: 6, // the wine cellar and the bust
  /* 9, not 7. Owner playtest: *"the xXx family line should be on the first
   * hit"*. The brief's two quoted lines moved out of the walk-past bark and
   * into `tortureSwing`, KEEPING THEIR CUE NAMES — both are recorded, and a
   * rename would have thrown two delivered takes away to make a prefix
   * tidier. So two lines with `corridor.` ids are now spoken during the
   * torture beat, and xXx gained two new ones for the approach. */
  corridor: 9, // Irish, xXx, and Booski shouting from deeper in
  lab: 3, // DeathMegatron at the glass
  /* 11, not 8. Owner playtest: *"Booski should hand me a pistol when I give
   * him the case"*. He does, and he says three lines doing it — the whole
   * point being that he does not say what it is for. */
  delivery: 11, // the transfer table, and the pistol that comes with it
  build: 33, // six scientists building it, and two men watching
  completion: 12, // the core, the cheering, and Aubbie coming out
  lock: 9, // the keypad, the bolts, and "Handle it"
  execution: 11, // Aubbie
  reaction: 12, // the five of them, muffled and overlapping
  silentnight: 4, // the switch
  gas: 11, // the seven stages
  aftermath: 3, // LIFE SIGNS: 0
  exit: 11, // Snow, the cart, xXx, and Lou ending the night in his office
  evening: 9, // Old Stove's reel remarks and the pool-deck dress-help exchange

  /* The house's own people, added 2026-08-04 with src/mansion/cast.js. The
   * mission was written before anybody lived here; these are the lines the
   * building says back. */
  /* 12, not 6. The gate is TWO POSTS on one throat: the man on the front door
   * (6) and, from 2026-08-06, the man working the booth at the street gate
   * (6 — challenge, loiter, the case, and two lines about the book he writes
   * you into). Owner playtest: "ADD a guard working that booth". Same
   * `mansion-gate` voice profile, separate SPEAKER because they are separate
   * bodies and a speaker key picks the mouth the line comes out of. */
  gate: 12, // the man on the front door, and the man in the booth
  guards: 9, // perimeter, stairs, basement, vault
  bar: 3, // the Bada Bing's bartender, working Lou's bar
  /* 2026-08-05: the whip became a HANDOVER and a repeatable swing rather than
   * one press on Gratin, so this scope gained the handover line, four
   * involuntary reactions and the lines xXx chooses to say after them. */
  torture: 19, // Gratin, the cord, four swings, and what xXx says about family

  /* The rest of the Family, using the house. Owner, 2026-08-05: "Everyone
   * should be there for the most part utilizing the house hanging out." */
  /* 6, not 8. Willy's two -- the good chair and the head of the table -- came
   * out on 2026-08-05: he is executed on the boat in NO WAKE, which is Day 3,
   * and the mansion arc is after it. Neither line had a recorded take, so
   * nothing delivered was thrown away. */
  house: 6, // Sasole at the bar, Numbskull on the terrace, Hog Mama
});

const TOTAL_AWAITING = Object.values(CUES_AWAITING_VO_SYNC)
  .reduce((sum, n) => sum + n, 0);

/** Typographic apostrophes and ellipses, flattened, so the lines below can be
 * typed the way the spec types them. */
const flat = (text) => String(text)
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/…/g, '...')
  .replace(/[–—]/g, '--');

/**
 * Every line docs/MISSION-SILENT-SQUATCH.md quotes, and who says it.
 *
 * The spec's own words are the mission. This is the check that a later edit
 * cannot quietly paraphrase Lou.
 */
const SPEC_LINES = Object.freeze([
  ['RIPPIN', "Whatever's in that thing, I don't want it near my balls."],
  ['ERIC', "Lou's waiting for you. And he's been in one of those moods."],
  ['SHUBES', "Hey guys, what's going on?"],
  ['SHUBES', "Actually, never mind. I don't want to know."],
  ['SNOW', 'Try not to make more work for me tonight.'],

  ['PROSPECT', "What's inside?"],
  ['LOU', "Eh. You'll find out soon enough."],
  ['LOU', "Go deliver it to Booski. He's in the basement."],
  ['LOU', 'Hey, kid.'],
  ['LOU', 'Nice job.'],
  ['LOU', "Now don't fuck around, and don't ask anything you don't wanna know."],

  ['XXX', 'You can take the car... you can take the mission...'],
  ['XXX', "But you don't turn your back on family."],
  ['BOOSKI', 'Quit talking to the decorations and bring me the case!'],
  ['XXX', 'Family meeting go well?'],

  ['BOOSKI', 'There he is. Our little delivery boy.'],
  ['BOOSKI', 'Ah, yes. The Squatchanium.'],
  ['BOOSKI', 'Do you have any idea how hard this stuff is to get?'],
  ['BOOSKI', "Rhetorical question. I don't care."],

  ['AUBBIE', 'Careful with the containment cylinder.'],
  ['AUBBIE', 'If the stabilizer falls below forty percent, we all become shadows on the wall.'],
  ['AUBBIE', 'Connect the Squatchanium core.'],
  ['AUBBIE', 'Increase the purple coolant flow.'],
  ['AUBBIE', 'No, no, no. Gold coupling first, purple coupling second.'],
  ['VETROV', 'Radiation levels are climbing.'],
  ['VETROV', 'This was not in the original agreement.'],
  ['VETROV', 'Doctor Aubbie, the shielding is not ready.'],
  ['SOKOLOV', 'Core rotation stable.'],
  ['SOKOLOV', 'Power output is beyond prediction.'],
  ['SOKOLOV', 'Silent Squatch will be operational.'],
  ['BEZMENOV', 'They will kill us when this is finished.'],
  ['AUBBIE', 'They need us.'],
  ['BEZMENOV', 'Men like him need no one.'],
  ['ORLOVA', 'Purple coolant pressure holding.'],
  ['ORLOVA', 'Transfer chamber secure.'],
  ['ORLOVA', 'Beginning final sequence.'],
  ['MARCHUK', 'The Squatchanium is reacting with the biological stabilizer.'],
  ['MARCHUK', 'Core temperature is increasing.'],
  ['MARCHUK', 'We should evacuate.'],

  ['AUBBIE', 'Initiating final stabilization.'],
  ['LAB_COMPUTER', 'PROJECT SILENT SQUATCH: CORE COMPLETE.'],
  ['AUBBIE', 'It is complete.'],
  ['BOOSKI', "You're certain?"],
  ['AUBBIE', 'The core is stable. The Fat Squatch can now be assembled.'],
  ['BOOSKI', 'And nobody else knows how to reproduce it?'],
  ['AUBBIE', 'Only my team understands the full process.'],
  ['BOOSKI', 'Good.'],

  ['BOOSKI', 'Lock the lab.'],
  ['BEZMENOV', 'Why is door locked?'],
  ['ORLOVA', 'Open door.'],
  ['AUBBIE', 'What is this?'],
  ['BOOSKI', "This guy's usefulness has expired."],
  ['BOOSKI', 'Handle it.'],
  ['AUBBIE', 'Booski, we had agreement.'],
  ['BOOSKI', 'We did.'],
  ['AUBBIE', 'You need me to maintain the core.'],
  ['BOOSKI', 'We made copies of your notes.'],
  ['AUBBIE', 'You do not understand what you have built!'],
  ['BOOSKI', 'I said handle it.'],

  ['ORLOVA', 'What are you doing?!'],
  ['VETROV', 'Open the door!'],
  ['MARCHUK', 'Why did you kill him?!'],
  ['SOKOLOV', 'We did everything you asked!'],
  ['VETROV', 'Please!'],
  ['MARCHUK', 'There is no ventilation!'],
  ['ORLOVA', 'We have families!'],
  ['SOKOLOV', 'You cannot leave us in here!'],
  ['VETROV', 'We can work for you!'],
  ['ORLOVA', 'We will tell nobody!'],

  ['BOOSKI', 'You started the job.'],
  ['BOOSKI', 'Finish it.'],
  ['LAB_COMPUTER', 'SILENT NIGHT PROTOCOL ACTIVATED.'],
  ['BOOSKI', 'Efficient.'],
  ['BOOSKI', "Lou's gonna like you."],

  ['BOOSKI', 'Snow. Basement.'],
  ['SNOW', 'How bad?'],
  ['BOOSKI', 'Bring the cart.'],
  ['SNOW', 'Jesus Christ.'],
  ['BOOSKI', 'And a mop.'],
  ['SNOW', "I told you not to make more work for me."],
]);

test('every line in the mission has a cue, a voice and words, and no two share one', () => {
  const lines = allSilentSquatchLines();
  assert.ok(lines.length >= 140, 'the script has lost lines rather than gained them');
  assert.equal(new Set(lines.map((l) => l.name)).size, lines.length, 'two lines share one recording');
  for (const line of lines) {
    assert.ok(line.name.startsWith('vo.silentsquatch.'), `${line.name} is off the scene's prefix`);
    assert.ok(line.voice, `${line.name} is not cast`);
    assert.ok(line.say && line.say.trim().length > 0, `${line.name} has no words`);
  }
});

test('every authored line is in the manifest, per scope', () => {
  const lines = allSilentSquatchLines();
  const byScope = {};
  for (const line of lines) {
    const scope = line.name.split('.')[2];
    byScope[scope] = (byScope[scope] ?? 0) + 1;
  }
  assert.deepEqual(
    byScope, { ...CUES_AWAITING_VO_SYNC },
    'a scope gained or lost lines — update the inventory and run `npm run vo:mansion`',
  );
  assert.equal(lines.length, TOTAL_AWAITING);

  /* The contract that matters: the voice actor's sheet is generated from the
   * manifest, so a line the game plays and the manifest has never heard of is
   * a line nobody will ever record, and NOTHING else in the repo notices.
   * That is what happened here, for 147 lines, until somebody went looking. */
  const inManifest = new Set(manifest.sfx.map((cue) => cue.name));
  const absent = lines.filter((line) => !inManifest.has(line.name)).map((line) => line.name);
  assert.deepEqual(absent, [], 'these lines are not in the ledger — run `npm run vo:mansion`');

  /* And nothing on the prefix that nobody says: a renamed line must not leave
   * a stale cue behind carrying words that are no longer in the game. */
  const authored = new Set(lines.map((line) => line.name));
  const stale = [...inManifest]
    .filter((name) => name.startsWith('vo.silentsquatch.') && !authored.has(name));
  assert.deepEqual(stale, [], 'stale cues — run `npm run vo:mansion`');
});

test('the manifest carries the mission words verbatim and casts them right', () => {
  /* A cue can be present, named correctly, and carry the wrong text or the
   * wrong actor — in which case the sheet is full of lines nobody in the game
   * says, delivered in somebody else's voice. */
  const declared = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
  const drift = [];
  for (const line of allSilentSquatchLines()) {
    const cue = declared.get(line.name);
    if (!cue) continue; // covered by the test above
    if (cue.say !== line.say) drift.push(`${line.name}: text`);
    if (cue.voice !== line.voice) drift.push(`${line.name}: cast as ${cue.voice}, script says ${line.voice}`);
  }
  assert.deepEqual(drift, []);
});

test('nobody in this mission invents a voice profile', () => {
  const voices = new Set(Object.keys(manifest.voices || {}));
  const pending = new Set(PENDING_VOICE_PROFILES);
  const unknown = new Set();
  for (const line of allSilentSquatchLines()) {
    if (voices.has(line.voice) || pending.has(line.voice)) continue;
    unknown.add(`${line.name} is cast as "${line.voice}"`);
  }
  assert.deepEqual([...unknown], []);
  /* And every declared profile is actually used — a pending name nobody casts
   * is an id the owner would be asked to buy for nothing. */
  const cast = new Set(allSilentSquatchLines().map((line) => line.voice));
  for (const name of pending) {
    assert.ok(cast.has(name), `${name} is declared pending but nobody speaks with it`);
    assert.equal(voices.has(name), false, `${name} exists now — take it off PENDING_VOICE_PROFILES`);
  }
});

test('every voice this mission uses has an ElevenLabs id', () => {
  /* The stronger form of the test above. `PENDING_VOICE_PROFILES` being empty
   * only means nobody DECLARED a gap; this asserts there isn't one. A cue cast
   * to a profile with no id cannot be rendered at all — `npm run sfx` has
   * nothing to send — and it appears on the sheet as an ordinary line the
   * voice actor cannot possibly deliver. */
  const voices = manifest.voices || {};
  const uncast = new Set();
  for (const line of allSilentSquatchLines()) {
    if (!voices[line.voice]?.id) uncast.add(line.voice);
  }
  assert.deepEqual([...uncast].sort(), []);
});

test('Big Uncle Lou is lou1, and the Family keeps its locked casting', () => {
  /* lou2 is Captain Lou Sasole, a different man. Casting him as the boss is a
   * one-character typo that would put the wrong voice in the office scene and
   * nothing else would catch it. */
  assert.equal(SPEAKERS.LOU.voice, 'lou1');
  assert.notEqual(SPEAKERS.LOU.voice, 'lou2');
  assert.equal(SPEAKERS.BOOSKI.voice, 'booski');
  assert.equal(SPEAKERS.SNOW.voice, 'snow');
  assert.equal(SPEAKERS.IRISH.voice, 'irish');
  assert.equal(SPEAKERS.DEATHMEGATRON.voice, 'deathmegatron');
  assert.equal(SPEAKERS.RIPPIN.voice, 'rippinflow');
  assert.equal(SPEAKERS.SHUBES.voice, 'shubenator');
  assert.equal(SPEAKERS.ERIC.voice, 'eric');
  assert.equal(SPEAKERS.AUBBIE.voice, 'aubbie');
  assert.equal(SPEAKERS.PROSPECT.voice, 'player');
  /* All of those are already in the ledger — none of the Family is pending. */
  const voices = new Set(Object.keys(manifest.voices || {}));
  for (const key of ['LOU', 'BOOSKI', 'SNOW', 'IRISH', 'DEATHMEGATRON', 'RIPPIN', 'SHUBES', 'ERIC', 'AUBBIE', 'PROSPECT']) {
    assert.ok(voices.has(SPEAKERS[key].voice), `${key} is cast as an unknown profile`);
  }
});

test('the six scientists are six people, not six copies', () => {
  const indices = Object.values(SCIENTIST_INDEX);
  assert.equal(indices.length, 6);
  assert.deepEqual([...indices].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.equal(SCIENTIST_INDEX.AUBBIE, 0, 'index 0 is Aubbie — the lab contract says so');

  const voices = Object.keys(SCIENTIST_INDEX).map((key) => SPEAKERS[key].voice);
  assert.equal(new Set(voices).size, 6, 'two scientists share a voice');

  /* And all six of them actually speak, at length, rather than one lead and
   * five sets of hands. */
  const spoken = allSilentSquatchLines();
  for (const key of Object.keys(SCIENTIST_INDEX)) {
    const mine = spoken.filter((line) => line.speaker === key);
    assert.ok(mine.length >= 6, `${key} only has ${mine.length} lines`);
  }
});

test('every line the spec quotes is in the game, word for word', () => {
  const spoken = allSilentSquatchLines().map((line) => `${line.speaker} ${flat(line.say)}`);
  const have = new Set(spoken);
  const missing = SPEC_LINES
    .filter(([speaker, text]) => !have.has(`${speaker} ${flat(text)}`))
    .map(([speaker, text]) => `${speaker}: ${text}`);
  assert.deepEqual(missing, [], 'the spec\'s own words have been paraphrased');
  assert.ok(SPEC_LINES.length >= 80, 'the spec check has lost lines');
});

test('behind the glass is behind the glass', () => {
  /* Everything a scientist says is marked to route through `lab.glassAudio`,
   * and nothing anybody standing in the observation room says is. Getting this
   * backwards is how a mission ends up with six people screaming at full
   * volume through twelve centimetres of laminated glass. */
  const scientists = new Set(Object.keys(SCIENTIST_INDEX));
  for (const line of allSilentSquatchLines()) {
    if (scientists.has(line.speaker)) {
      /* Aubbie is the exception, and only after he walks out: from the
       * completion beat onward he is on the player's side of the glass. */
      if (line.speaker === 'AUBBIE' && !line.muffled) {
        assert.ok(
          /\.(completion|lock|execution)\./.test(line.name),
          `${line.name} is Aubbie speaking dry from inside the lab`,
        );
        continue;
      }
      assert.equal(line.muffled, true, `${line.name} is not routed through the glass`);
      continue;
    }
    if (line.speaker === 'LAB_COMPUTER') {
      assert.equal(line.muffled, true, 'the lab annunciator is inside the lab');
      continue;
    }
    assert.equal(line.muffled, false, `${line.name} is muffled but nobody said it in there`);
  }
});

test('the HUD is not cast — its prose is read, not performed', () => {
  const spoken = new Set(allSilentSquatchLines().map((line) => line.say));
  for (const text of [...Object.values(OBJECTIVES), ...Object.values(INSTRUCTIONS)]) {
    assert.equal(spoken.has(text), false, `${text} is both a HUD line and a spoken one`);
  }
  /* Stage directions carry no cue and never reach a subtitle or a sheet. */
  const stages = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.stage) { stages.push(node); return; }
    Object.values(node).forEach(walk);
  };
  walk(SEQUENCES);
  assert.ok(stages.length >= 15, 'the mission lost its stage directions');
  for (const direction of stages) {
    assert.equal(direction.cue, undefined, `${direction.stage} is a direction, not a line`);
    assert.equal(direction.text, undefined);
  }
});

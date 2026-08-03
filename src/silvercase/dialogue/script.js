/**
 * The Silver Case — authored dialogue.
 *
 * Pure data, no behaviour. `DialogueController` (./DialogueController.js) is
 * the only thing that plays this; the mission state machine is the only thing
 * that decides *when*. Every spoken line carries a `cue` name on the
 * `vo.silvercase.` prefix so a future voice pass has something to generate
 * against (see assets/sfx/manifest.json's convention) — none of these cues
 * exist yet, so every line plays as a subtitle with no audio, which is the
 * deliberate silence-over-synthesis fallback the rest of the game already
 * uses. Nothing here is wired into the shared voice-manifest/check.mjs
 * catalog checks; that is future work for whoever records the part.
 *
 * Speaker keys match `cast/cast.js`. Ape's identity (name, voice profile) is
 * canonical — see src/bing/family-ape.js and CHARACTER_IDS.APE — everyone
 * else here is local to this mission.
 */

function cue(scope, id) {
  return `vo.silvercase.${scope}.${id}`;
}

export const SPEAKERS = Object.freeze({
  APE: Object.freeze({ name: 'Ape', voice: 'ape' }),
  PROSPECT: Object.freeze({ name: 'Prospect', voice: 'player' }),
  DEKE: Object.freeze({ name: 'Deke', voice: 'npc-male' }),
  WINSTON: Object.freeze({ name: 'Winston', voice: 'npc-male' }),
  CHESTER: Object.freeze({ name: 'Chester', voice: 'npc-male' }),
  PRUITT: Object.freeze({ name: 'Pruitt', voice: 'npc-male' }),
  HUD: Object.freeze({ name: '', voice: null }),
});

/**
 * A spoken/stage line: `{ speaker, text, cue, hold, gesture, look }`.
 * `hold` is the fallback reading time in seconds when no recording exists
 * (always true right now). `look` is an optional camera-nudge target id,
 * consumed the same way squatchfather's dialogue does — a soft suggestion,
 * never a lock.
 */

export const SEQUENCES = Object.freeze({
  // ---------------------------------------------------------------------
  // Beat 1 — the car ride over. A cutscene only in the sense that Tony
  // can't walk; he can still look wherever he wants and the game never
  // takes the wheel away from him because he was never driving.
  // ---------------------------------------------------------------------
  carRide: Object.freeze([
    { speaker: 'APE', text: 'Three geniuses borrowed something from Lou without asking. We’re going over there to improve their decision-making.', cue: cue('car', 'ape.pitch'), hold: 4.2 },
    { speaker: 'PROSPECT', text: 'What’s inside the case?', cue: cue('car', 'prospect.ask'), hold: 1.8 },
    { speaker: 'APE', text: 'Not knowing is one of the benefits of being new.', cue: cue('car', 'ape.benefit'), hold: 2.6 },
    { speaker: 'APE', text: 'You know Big Uncle Lou calls it “jerky.” Not “squatch jerky.” Not “premium cut.” Just jerky. Like there’s only the one kind.', cue: cue('car', 'ape.jerky.1'), hold: 4.4 },
    { speaker: 'PROSPECT', text: 'There’s not?', cue: cue('car', 'prospect.jerky'), hold: 1.4 },
    { speaker: 'APE', text: 'There’s nine kinds. He just doesn’t respect you enough yet to tell you which one you’re chewing.', cue: cue('car', 'ape.jerky.2'), hold: 3.8 },
    { speaker: 'APE', text: 'Anyway. Focus up. We’re here.', cue: cue('car', 'ape.arrive'), hold: 2.0 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 2 — the hallway and the door.
  // ---------------------------------------------------------------------
  arrival: Object.freeze([
    { speaker: 'CHESTER', text: 'Who is it?', cue: cue('arrival', 'chester.whoisit'), hold: 1.4 },
    { speaker: 'APE', text: 'Building appreciation committee.', cue: cue('arrival', 'ape.committee'), hold: 2.2 },
  ]),

  doorStall: Object.freeze([
    { speaker: 'APE', text: 'Door doesn’t close itself. Well — it does. Just not with us on the right side of it.', cue: cue('arrival', 'ape.doorstall'), hold: 3.6 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 3 — establishing control. Free-roam; Ape is conversational,
  // almost polite, while he reads the room.
  // ---------------------------------------------------------------------
  establishControl: Object.freeze([
    { speaker: 'APE', text: 'Nice place. Real lived-in.', cue: cue('control', 'ape.nice-place'), hold: 2.2 },
    { speaker: 'APE', text: 'You boys expecting company?', cue: cue('control', 'ape.expecting'), hold: 2.4, look: 'deke' },
    { speaker: 'DEKE', text: 'Nah, man, it’s just — it’s just us hanging out.', cue: cue('control', 'deke.justus'), hold: 2.6 },
    { speaker: 'APE', text: 'Just the three of you.', cue: cue('control', 'ape.threeofyou'), hold: 2.0 },
    { speaker: 'APE', text: 'Where’s Lou’s case?', cue: cue('control', 'ape.wherescase'), hold: 2.0 },
    { speaker: 'CHESTER', text: '…Case? What case?', cue: cue('control', 'chester.whatcase'), hold: 2.2 },
    { speaker: 'DEKE', text: 'We don’t know nothin’ about a case, man.', cue: cue('control', 'deke.dontknow'), hold: 2.4 },
    { speaker: 'APE', text: 'Interesting. Because I heard three very specific people carrying something very specific out of a storage unit on Tuesday.', cue: cue('control', 'ape.storageunit'), hold: 4.4 },
    { speaker: 'CHESTER', text: 'That was — that was a misunderstanding.', cue: cue('control', 'chester.misunderstanding'), hold: 2.6 },
    { speaker: 'APE', text: 'It’s always a misunderstanding. Every job I’ve ever worked, somebody’s misunderstanding somewhere.', cue: cue('control', 'ape.alwaysmisunderstanding'), hold: 3.8 },
    { speaker: 'APE', text: 'Have a look around, Prospect. Case doesn’t walk itself out either.', cue: cue('control', 'ape.lookaround'), hold: 3.2 },
  ]),

  // Fired once if the player draws a weapon before Ape calls for it.
  earlyDraw: Object.freeze([
    { speaker: 'APE', text: 'Easy. We came to have a civilized misunderstanding.', cue: cue('control', 'ape.civilized'), hold: 2.6 },
  ]),

  // Fired once, later, if the player draws again after the first warning.
  earlyDrawSecond: Object.freeze([
    { speaker: 'APE', text: 'Put it away. I’ll tell you when.', cue: cue('control', 'ape.putitaway'), hold: 2.2 },
  ]),

  // Ambient one-shots, played opportunistically by the mission, not queued
  // as a hard sequence — see main.js's ambient-bark scheduling.
  ambientTV: Object.freeze([
    { speaker: 'DEKE', text: 'That’s — that’s a good show.', cue: cue('control', 'deke.goodshow'), hold: 2.0 },
  ]),
  ambientFood: Object.freeze([
    { speaker: 'HUD', text: 'Cold takeout. Several days’ worth.', hold: 2.0 },
  ]),
  ambientGlasses: Object.freeze([
    { speaker: 'HUD', text: 'Four glasses on the table. Three guys in the room.', hold: 2.4 },
  ]),
  ambientBathroomDoor: Object.freeze([
    { speaker: 'HUD', text: 'The bathroom door isn’t quite shut.', hold: 2.2 },
  ]),
  ambientChesterGlance: Object.freeze([
    { speaker: 'CHESTER', text: 'You, uh — you want a drink or somethin’?', cue: cue('control', 'chester.drink'), hold: 2.4 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 4 — the case is found (player interacts with its hiding spot),
  // Winston is made to open it, Ape confirms without ever showing us.
  // ---------------------------------------------------------------------
  caseFound: Object.freeze([
    { speaker: 'APE', text: 'There it is. Lou’s missing luggage.', cue: cue('case', 'ape.thereitis'), hold: 2.4, look: 'case' },
    { speaker: 'APE', text: 'Open it.', cue: cue('case', 'ape.openit'), hold: 1.4, look: 'winston' },
    { speaker: 'WINSTON', text: '…Okay. Okay, yeah.', cue: cue('case', 'winston.okay'), hold: 1.8 },
  ]),
  caseConfirmed: Object.freeze([
    { speaker: 'APE', text: 'Everything still in there?', cue: cue('case', 'ape.everythingstillin'), hold: 2.0 },
    { speaker: 'APE', text: 'He nodded. That’s practically paperwork.', cue: cue('case', 'ape.paperwork'), hold: 3.0 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 5 — the couch shooting. No countdown; the camera and the
  // player's own controls stay live through the whole beat.
  // ---------------------------------------------------------------------
  couchOrder: Object.freeze([
    { speaker: 'APE', text: 'This is the part where we make sure everybody remembers this conversation.', cue: cue('couch', 'ape.remember'), hold: 3.4, look: 'deke' },
    { speaker: 'APE', text: 'Go ahead.', cue: cue('couch', 'ape.goahead'), hold: 1.4 },
  ]),
  couchAftermath: Object.freeze([
    { speaker: 'APE', text: 'Now we have more seating.', cue: cue('couch', 'ape.moreseating'), hold: 2.4, look: 'chester' },
  ]),

  // ---------------------------------------------------------------------
  // Beat 6 — the Lou question. Chester's own excuses lead him straight
  // into it; the choice prompt fires after the line below.
  // ---------------------------------------------------------------------
  louQuestionSetup: Object.freeze([
    { speaker: 'CHESTER', text: 'Look, man, it wasn’t personal, we just — we needed the money, we didn’t know whose —', cue: cue('lou', 'chester.notpersonal'), hold: 3.8 },
    { speaker: 'APE', text: 'You ever meet Lou?', cue: cue('lou', 'ape.evermeet'), hold: 1.8 },
    { speaker: 'CHESTER', text: 'No.', cue: cue('lou', 'chester.no'), hold: 1.0 },
    { speaker: 'APE', text: 'Do you know what Lou looks like?', cue: cue('lou', 'ape.whatlookslike'), hold: 2.2 },
    { speaker: 'CHESTER', text: 'I mean — I’ve heard of him, everybody’s heard of —', cue: cue('lou', 'chester.heardofhim'), hold: 3.0 },
    { speaker: 'APE', text: 'Does he look like a bitch?', cue: cue('lou', 'ape.lookslikeabitch'), hold: 2.2 },
  ]),
  // Ape's reaction after the player's choice resolves — one line per branch.
  louQuestionReaction: Object.freeze({
    no: Object.freeze([{ speaker: 'APE', text: 'Good. Then start acting like it.', cue: cue('lou', 'ape.reaction.no'), hold: 2.4 }]),
    absolutely_not: Object.freeze([{ speaker: 'APE', text: 'Good. Then start acting like it.', cue: cue('lou', 'ape.reaction.absolutelynot'), hold: 2.4 }]),
    silent: Object.freeze([{ speaker: 'APE', text: 'Nothing to say. Smart, for once.', cue: cue('lou', 'ape.reaction.silent'), hold: 2.4 }]),
    lighting: Object.freeze([{ speaker: 'APE', text: '…No. It does not depend on the lighting.', cue: cue('lou', 'ape.reaction.lighting'), hold: 2.8 }]),
  }),

  // ---------------------------------------------------------------------
  // Beat 7 — the Squatch prayer, partly finished by the player.
  // ---------------------------------------------------------------------
  squatchPrayerIntro: Object.freeze([
    { speaker: 'APE', text: 'Lou believes every man should get one moment to understand why this is happening.', cue: cue('prayer', 'ape.onemoment'), hold: 3.4 },
  ]),
  squatchPrayer: Object.freeze([
    { speaker: 'APE', text: 'Great Beast of the dark timber, steady our hands and mark our trail.', cue: cue('prayer', 'ape.line1'), hold: 3.6 },
    { speaker: 'APE', text: 'Let the loyal walk beneath the silver branches.', cue: cue('prayer', 'ape.line2'), hold: 2.8 },
    { speaker: 'APE', text: 'Let thieves hear the footsteps before they see what’s coming.', cue: cue('prayer', 'ape.line3'), hold: 3.2 },
    { speaker: 'APE', text: 'When the forest closes behind us, let it leave no path for betrayal.', cue: cue('prayer', 'ape.line4'), hold: 3.4 },
    { speaker: 'APE', text: 'Silver above. Family below.', cue: cue('prayer', 'ape.line5'), hold: 2.4 },
  ]),
  // The player's completion line, played once the prompt resolves.
  squatchPrayerFinish: Object.freeze([
    { speaker: 'PROSPECT', text: 'No footprints left.', cue: cue('prayer', 'prospect.nofootprints'), hold: 2.0 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 8 — the bathroom ambush.
  // ---------------------------------------------------------------------
  bathroomFast: Object.freeze([
    { speaker: 'APE', text: 'Good. You do listen occasionally.', cue: cue('bathroom', 'ape.listen'), hold: 2.6 },
  ]),
  bathroomFastWithClues: Object.freeze([
    { speaker: 'APE', text: 'You counted four. I saw you.', cue: cue('bathroom', 'ape.countedfour'), hold: 2.6 },
  ]),
  bathroomFailed: Object.freeze([
    { speaker: 'HUD', text: 'TOO SLOW', hold: 2.0 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 9 — aftermath.
  // ---------------------------------------------------------------------
  aftermathIntro: Object.freeze([
    { speaker: 'APE', text: 'Congratulations. You’ve been promoted to witness.', cue: cue('aftermath', 'ape.witness'), hold: 3.0, look: 'winston' },
  ]),
  aftermathSpare: Object.freeze([
    { speaker: 'APE', text: 'Clean this up. All of it. And you were never here.', cue: cue('aftermath', 'ape.cleanup'), hold: 3.4 },
    { speaker: 'WINSTON', text: 'Yes — yes sir. Never. I was never here.', cue: cue('aftermath', 'winston.neverhere'), hold: 3.0 },
  ]),
  aftermathKill: Object.freeze([
    { speaker: 'APE', text: '…Or don’t.', cue: cue('aftermath', 'ape.ordont'), hold: 1.8 },
  ]),
  aftermathExit: Object.freeze([
    { speaker: 'APE', text: 'Always check the bathroom. That’s where bad ideas go to load themselves.', cue: cue('aftermath', 'ape.badideas'), hold: 3.6, look: 'bathroom' },
  ]),
});

/**
 * Choice prompts. `options[].key` is the literal digit key that resolves it.
 * `timeout` (seconds) is how long the prompt waits before resolving to the
 * `silent`/default branch on its own — the scene keeps running the whole
 * time, nothing pauses.
 */
export const CHOICES = Object.freeze({
  louQuestion: Object.freeze({
    id: 'louQuestion',
    timeout: 6,
    defaultOutcome: 'silent',
    options: Object.freeze([
      Object.freeze({ key: '1', text: 'No.', outcome: 'no', cue: cue('lou', 'prospect.choice.no') }),
      Object.freeze({ key: '2', text: 'Absolutely not.', outcome: 'absolutely_not', cue: cue('lou', 'prospect.choice.absolutelynot') }),
      Object.freeze({ key: '3', text: '(Say nothing.)', outcome: 'silent', silent: true }),
      Object.freeze({ key: '4', text: 'Depends on the lighting.', outcome: 'lighting', cue: cue('lou', 'prospect.choice.lighting'), irritatesApe: true }),
    ]),
  }),
  prayerFinish: Object.freeze({
    id: 'prayerFinish',
    timeout: 4,
    defaultOutcome: 'finish',
    prompt: 'Hold E to finish the ritual.',
    hold: 1.1,
  }),
  aftermath: Object.freeze({
    id: 'aftermath',
    timeout: 10,
    defaultOutcome: 'spare',
    options: Object.freeze([
      Object.freeze({ key: '1', text: 'Spare him — order the cleanup.', outcome: 'spare' }),
      Object.freeze({ key: '2', text: 'Kill him.', outcome: 'kill' }),
    ]),
  }),
});

/**
 * Objective/HUD copy, keyed by mission beat id (see
 * ../state/SilverCaseStateMachine.js). Centralised here so the whole
 * mission's writing — spoken and on-screen — lives in one file.
 */
export const OBJECTIVES = Object.freeze({
  ARRIVE_HALLWAY: 'Follow Ape into the building.',
  KNOCK: 'Wait for the door.',
  ENTER_APARTMENT: 'Close and lock the door.',
  ESTABLISH_CONTROL: 'Find Lou’s case.',
  CASE_REVEAL: 'Watch Winston open the case.',
  COUCH_SHOOTING: 'Do what Ape says.',
  LOU_QUESTION: 'Answer, or don’t.',
  SQUATCH_PRAYER: 'Hold E to finish the ritual.',
  BATHROOM_AMBUSH: 'BATHROOM!',
  AFTERMATH: 'Decide what happens to Winston.',
  PICK_UP_CASE: 'Pick up the case.',
  EXIT: 'Leave the apartment.',
});

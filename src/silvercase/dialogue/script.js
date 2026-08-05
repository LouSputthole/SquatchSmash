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
  // Ape is standing in the corridor with the player when control is handed
  // over — he walks in from the stairs with you, he does not materialise
  // inside the flat — so he has something to say on the way to the door.
  hallwayArrival: Object.freeze([
    { speaker: 'APE', text: '2E. End of the hall, past the one that smells like a fish tank.', cue: cue('arrival', 'ape.endofhall'), hold: 3.6 },
    { speaker: 'APE', text: 'I do the talking. You do the looking-like-you’ve-done-this-before.', cue: cue('arrival', 'ape.dothetalking'), hold: 3.8 },
  ]),

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
    // Ape names him. "Go ahead" on its own left the player looking at three
    // men and guessing which one the game meant — but that take is already
    // recorded and delivered, so the naming is a NEW line in front of it
    // rather than a rewrite of it.
    { speaker: 'APE', text: 'The one on the couch. Deke.', cue: cue('couch', 'ape.theoneonthecouch'), hold: 2.2, look: 'deke' },
    { speaker: 'APE', text: 'Go ahead.', cue: cue('couch', 'ape.goahead'), hold: 1.4 },
    // On-screen prose, in the HUD's own voice — nobody in the room says this.
    { speaker: 'HUD', text: 'Aim at the man on the couch. Left click to fire.', hold: 3.0 },
  ]),
  couchAftermath: Object.freeze([
    { speaker: 'APE', text: 'Now we have more seating.', cue: cue('couch', 'ape.moreseating'), hold: 2.4, look: 'chester' },
  ]),

  // ---------------------------------------------------------------------
  // Shot feedback. The mission resolves a trigger pull against whatever the
  // crosshair was actually on (see combat/Shooting.js), so there are now
  // three ways to pull it and be wrong, and each of them has to say so.
  // ---------------------------------------------------------------------
  shotMissed: Object.freeze([
    { speaker: 'APE', text: 'That was a wall. The wall isn’t the problem here.', cue: cue('shots', 'ape.missed'), hold: 3.0 },
  ]),
  shotWrongMan: Object.freeze([
    { speaker: 'APE', text: 'Wrong one. Look at what you’re pointing it at before you pull.', cue: cue('shots', 'ape.wrongman'), hold: 3.4 },
  ]),
  shotAtApe: Object.freeze([
    { speaker: 'APE', text: 'You want to swing that back around at me, Prospect? Take your time. Think it through.', cue: cue('shots', 'ape.atme'), hold: 4.0 },
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
  // Beat 7b — the man in the chair. The prayer used to end and Chester
  // simply died; the owner's note is that the player should be prompted to
  // do it, and that Ape — who is now visibly holding a gun — does it with
  // him rather than watching.
  // ---------------------------------------------------------------------
  chairOrder: Object.freeze([
    { speaker: 'APE', text: 'Prayer’s said. Now the amen.', cue: cue('chair', 'ape.amen'), hold: 2.2, look: 'chester' },
    { speaker: 'APE', text: 'Together, Prospect. You and me. On you.', cue: cue('chair', 'ape.together'), hold: 2.8 },
    { speaker: 'HUD', text: 'Aim at the man in the chair. Left click to fire — Ape fires with you.', hold: 3.4 },
  ]),
  chairStall: Object.freeze([
    { speaker: 'APE', text: 'He isn’t going to volunteer. Any time now.', cue: cue('chair', 'ape.anytime'), hold: 2.8 },
  ]),
  chairTogether: Object.freeze([
    { speaker: 'APE', text: 'Two of us, one story. That’s how the Family remembers it.', cue: cue('chair', 'ape.onestory'), hold: 3.4 },
  ]),
  chairApeAlone: Object.freeze([
    { speaker: 'APE', text: 'Fine. My round.', cue: cue('chair', 'ape.myround'), hold: 1.8 },
    { speaker: 'APE', text: 'Lou is going to hear it was mine. That’s twice now I did your part of this.', cue: cue('chair', 'ape.myparttoo'), hold: 4.0 },
  ]),

  // ---------------------------------------------------------------------
  // Beat 8 — the bathroom ambush.
  // ---------------------------------------------------------------------
  bathroomWarning: Object.freeze([
    { speaker: 'HUD', text: 'BATHROOM — aim at him and fire.', hold: 2.0 },
  ]),
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
  // Choosing to kill Winston no longer kills him on the keypress: the owner's
  // note is that if you are not going to spare the last man you should be
  // prompted to do it yourself, and see it happen.
  aftermathKillOrder: Object.freeze([
    { speaker: 'APE', text: '…Or don’t.', cue: cue('aftermath', 'ape.ordont'), hold: 1.8 },
    { speaker: 'APE', text: 'Your call, your round. He’s standing right there.', cue: cue('aftermath', 'ape.yourround'), hold: 3.0, look: 'winston' },
    { speaker: 'HUD', text: 'Aim at Winston. Left click to fire.', hold: 3.0 },
  ]),
  aftermathKillStall: Object.freeze([
    { speaker: 'WINSTON', text: 'Please — please, I’ll clean it, I’ll clean all of it —', cue: cue('aftermath', 'winston.please'), hold: 3.4 },
  ]),
  aftermathKill: Object.freeze([
    { speaker: 'APE', text: 'Then there’s nobody to clean it. That’s a choice too.', cue: cue('aftermath', 'ape.nobodytoclean'), hold: 3.4 },
  ]),
  aftermathKillApeAlone: Object.freeze([
    { speaker: 'APE', text: 'You don’t get to want it and not do it.', cue: cue('aftermath', 'ape.wantitdoit'), hold: 3.0 },
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
  ARRIVE_HALLWAY: 'Follow Ape down the hall to 2E.',
  KNOCK: 'Wait for the door.',
  ENTER_APARTMENT: 'Close and lock the door.',
  ESTABLISH_CONTROL: 'Find Lou’s case.',
  CASE_REVEAL: 'Watch Winston open the case.',
  COUCH_SHOOTING: 'Shoot the man on the couch.',
  LOU_QUESTION: 'Answer, or don’t.',
  SQUATCH_PRAYER: 'Hold E to finish the ritual.',
  CHAIR_SHOOTING: 'Shoot the man in the chair.',
  BATHROOM_AMBUSH: 'BATHROOM!',
  AFTERMATH: 'Decide what happens to Winston.',
  EXECUTE_WINSTON: 'Shoot Winston.',
  PICK_UP_CASE: 'Pick up the case.',
  EXIT: 'Leave the apartment.',
});

/**
 * The standing on-screen instruction for a beat that wants the player to shoot
 * a specific man — the owner's note in full: *"There should be a pop up to kill
 * the guy on the couch. Its unclear who to shoot. So the screen should say it
 * like in the hub as a game instruction (not another character or anything)."*
 *
 * So: no speaker, no cue, no voice. This is the game talking to the player, the
 * same register as the apartment hub's own on-screen prompts, and it stays up
 * for as long as the order stands rather than scrolling past as a subtitle.
 * `TARGET_CALLOUTS` is the second half of the same idea — the name that appears
 * under the reticle at the moment the crosshair is genuinely on the right man,
 * which is what makes "shoot where you are aiming" legible rather than cruel.
 */
export const INSTRUCTIONS = Object.freeze({
  COUCH_SHOOTING: 'Aim at the man on the couch and LEFT CLICK to fire.',
  CHAIR_SHOOTING: 'Aim at the man in the chair and LEFT CLICK. Ape fires with you.',
  BATHROOM_AMBUSH: 'Aim at the man in the bathroom doorway and LEFT CLICK. Fast.',
  EXECUTE_WINSTON: 'Aim at Winston and LEFT CLICK.',
});

export const TARGET_CALLOUTS = Object.freeze({
  COUCH_SHOOTING: 'DEKE — FIRE',
  CHAIR_SHOOTING: 'CHESTER — FIRE',
  BATHROOM_AMBUSH: 'PRUITT — FIRE',
  EXECUTE_WINSTON: 'WINSTON — FIRE',
});

/**
 * Every cue name this mission can ask for.
 *
 * Exported so the scene can PRELOAD them. `src/silvercase/main.js` called
 * `audio.init()` and never `audio.loadManifest()`, so the engine held no
 * samples at all and every `audio.play()` in the mission fell through to the
 * procedural synth. The gunshots and doors sounded fine -- they are
 * synthesised anyway -- which is exactly why nobody noticed that sixty
 * recorded voice takes could never be reached.
 *
 * Walks the same structures the DialogueController plays, so a line added
 * above is preloaded without anybody remembering to list it here.
 */
export function silverCaseCueNames() {
  const names = new Set();
  const take = (line) => { if (line?.cue) names.add(line.cue); };
  for (const sequence of Object.values(SEQUENCES)) {
    if (Array.isArray(sequence)) sequence.forEach(take);
    else for (const branch of Object.values(sequence)) branch.forEach(take);
  }
  for (const choice of Object.values(CHOICES)) {
    for (const option of choice.options ?? []) take(option);
  }
  return [...names];
}

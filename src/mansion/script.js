/**
 * PROJECT SILENT SQUATCH — the mission's entire writing.
 *
 * Pure data, no behaviour. `mission/DialogueController.js` is the only thing
 * that plays it; `mission/SilentSquatchMission.js` is the only thing that
 * decides when. Everything the player hears or reads in this mission lives in
 * this one file — spoken lines, HUD objectives, HUD instructions and the
 * target callout — the same split The Silver Case uses
 * (src/silvercase/dialogue/script.js).
 *
 * THE DOCTRINE THIS FILE IS WRITTEN UNDER (docs/TONE-AND-PARODY.md):
 *
 *   - Russians in a secret weapons lab under a mob boss's house is already the
 *     joke. NOTHING IN THE SCENE NOTICES. Nobody remarks on it, nobody winks,
 *     nobody is funny about the keypad code. It is played as what it is: six
 *     people who finished the job they were hired for being murdered for it.
 *   - HUD instructions never replace a character. Every `INSTRUCTIONS` entry
 *     below is put on screen by the mission in a sequence's `onDone` — Booski
 *     says "Lock the lab" and the objective arrives AFTER he has finished.
 *     See `sayThenInstruct` in src/silvercase/main.js for the shape.
 *
 * VERBATIM LINES. Every line quoted in docs/MISSION-SILENT-SQUATCH.md appears
 * here word for word and is marked `// spec`. They are the mission; do not
 * paraphrase them. Lines without that marker are written to the spec's brief
 * ("Irish and DeathMegatron are in the basement and need lines you write";
 * "six distinct people, not six copies") and can be revised freely.
 *
 * CASTING. `SPEAKERS[x].voice` is a voice profile in the `voices` block of
 * assets/sfx/manifest.json. Big Uncle Lou is `lou1` — NEVER `lou2`, who is
 * Captain Lou Sasole, a different man. The profiles this mission needs that do
 * not exist yet are listed in `PENDING_VOICE_PROFILES` at the bottom, which is
 * what tests/silent-squatch-voice.test.mjs holds the manifest to. Cue names
 * are generated centrally (`npm run vo:*`); nothing here writes a manifest.
 */

/** `vo.silentsquatch.<scope>.<who>.<id>` — the name the runtime asks for, with
 * no take suffix, matching The Silver Case's convention rather than the Beef
 * Run's `.1`. */
function cue(scope, id) {
  return `vo.silentsquatch.${scope}.${id}`;
}

/**
 * Everybody with a line.
 *
 * The five scientists who are not Aubbie, xXx, and the laboratory's own
 * computer need voice profiles that do not exist yet. They are named here so
 * the owner can paste ElevenLabs ids against a name rather than against a
 * guess, and the id itself is deliberately NOT invented — see
 * `PENDING_VOICE_PROFILES`.
 */
export const SPEAKERS = Object.freeze({
  PROSPECT: Object.freeze({ name: 'Prospect', voice: 'player' }),
  /* Big Uncle Lou Sputthole. `lou1`, not `lou2`. */
  LOU: Object.freeze({ name: 'Big Uncle Lou', voice: 'lou1' }),
  BOOSKI: Object.freeze({ name: 'Booski', voice: 'booski' }),
  SNOW: Object.freeze({ name: 'Snow', voice: 'snow' }),
  IRISH: Object.freeze({ name: 'Irish', voice: 'irish' }),
  DEATHMEGATRON: Object.freeze({ name: 'DeathMegatron', voice: 'deathmegatron' }),
  RIPPIN: Object.freeze({ name: 'Rippin', voice: 'rippinflow' }),
  ERIC: Object.freeze({ name: 'Eric', voice: 'eric' }),
  SHUBES: Object.freeze({ name: 'Shubes', voice: 'shubenator' }),
  /* Hanging by his ankles over a pool of his own blood, and still going. The
   * owner is supplying the id; the profile name is `xxx`. */
  XXX: Object.freeze({ name: 'xXx', voice: 'xxx' }),

  /* ---- the six scientists. Index order matches `lab.scientists`. ---- */
  /** 0 — lead. Brilliant, exhausted, arrogant, proud of the weapon. */
  AUBBIE: Object.freeze({ name: 'Doctor Aubbie', voice: 'aubbie' }),
  /** 1 — the nervous technician. Wants the paperwork to have said this. */
  VETROV: Object.freeze({ name: 'Vetrov', voice: 'vetrov' }),
  /** 2 — the weapons engineer. In love with the machine, not the money. */
  SOKOLOV: Object.freeze({ name: 'Sokolov', voice: 'sokolov' }),
  /** 3 — the cynical old one. Has worked for men like this before. */
  BEZMENOV: Object.freeze({ name: 'Bezmenov', voice: 'bezmenov' }),
  /** 4 — the junior assistant. Youngest in the room, proudest of it. */
  ORLOVA: Object.freeze({ name: 'Orlova', voice: 'orlova' }),
  /** 5 — the medical specialist. The only one watching the people. */
  MARCHUK: Object.freeze({ name: 'Marchuk', voice: 'marchuk' }),

  /** The lab's own annunciator. Flat, synthetic, indifferent. */
  LAB_COMPUTER: Object.freeze({ name: 'LABORATORY', voice: 'labcomputer' }),
  /** On-screen prose, in the game's own register. Never cast, never recorded. */
  HUD: Object.freeze({ name: '', voice: null }),
});

/** Speaker key -> index in `lab.scientists`. The mission routes a scientist's
 * line through `lab.glassAudio` and calls `lab.scientists[i].say(cue)` so the
 * body it comes out of is the right one. */
export const SCIENTIST_INDEX = Object.freeze({
  AUBBIE: 0,
  VETROV: 1,
  SOKOLOV: 2,
  BEZMENOV: 3,
  ORLOVA: 4,
  MARCHUK: 5,
});

/**
 * A line: `{ speaker, text, cue, hold, stage, muffled }`.
 *
 * `hold` is the fallback reading time in seconds — every cue below is authored
 * and none is recorded yet, so today that is the only timing there is.
 * `stage` is a non-spoken direction the mission acts on (`lou.rotate`,
 * `case.open`, `drawer.send`, …); it never reaches the subtitle.
 * `muffled: true` means the line is behind the reinforced glass and must be
 * routed through `lab.glassAudio` rather than played dry.
 */
export const SEQUENCES = Object.freeze({
  /* =================================================================== */
  /* BEAT 1 — arrival. Everyone still alive is in the house. No HotDog.   */
  /*                                                                      */
  /* These are barks, not a queue: each fires once when the player comes  */
  /* near the man who says it, so the room is populated rather than       */
  /* performed at him. Their `.idle` twin fires if he hangs around.       */
  /* =================================================================== */
  arrivalProspect: Object.freeze([
    { speaker: 'PROSPECT', text: 'Whatever’s in here has been humming since the car.', cue: cue('arrival', 'prospect.humming'), hold: 3.0 },
  ]),
  rippinBar: Object.freeze([
    // spec
    { speaker: 'RIPPIN', text: 'Whatever’s in that thing, I don’t want it near my balls.', cue: cue('arrival', 'rippin.balls'), hold: 3.2 },
  ]),
  rippinIdle: Object.freeze([
    { speaker: 'RIPPIN', text: 'I’m serious. Take it over there.', cue: cue('arrival', 'rippin.overthere'), hold: 2.4 },
  ]),
  ericTable: Object.freeze([
    // spec
    { speaker: 'ERIC', text: 'Lou’s waiting for you. And he’s been in one of those moods.', cue: cue('arrival', 'eric.mood'), hold: 3.6 },
  ]),
  ericIdle: Object.freeze([
    { speaker: 'ERIC', text: 'Top of the stairs, past the boardroom. Don’t sit down.', cue: cue('arrival', 'eric.dontsitdown'), hold: 3.4 },
  ]),
  shubesHallway: Object.freeze([
    // spec
    { speaker: 'SHUBES', text: 'Hey guys, what’s going on?', cue: cue('arrival', 'shubes.whatsgoingon'), hold: 2.2 },
    // spec
    { speaker: 'SHUBES', text: 'Actually, never mind. I don’t want to know.', cue: cue('arrival', 'shubes.nevermind'), hold: 3.0 },
  ]),
  shubesIdle: Object.freeze([
    { speaker: 'SHUBES', text: 'I’m gonna go do arms.', cue: cue('arrival', 'shubes.arms'), hold: 2.0 },
  ]),
  snowFoyer: Object.freeze([
    // spec — quiet foreshadowing of his cleanup job
    { speaker: 'SNOW', text: 'Try not to make more work for me tonight.', cue: cue('arrival', 'snow.morework'), hold: 3.0 },
  ]),
  snowIdle: Object.freeze([
    { speaker: 'SNOW', text: 'It doesn’t come out. Marble.', cue: cue('arrival', 'snow.doesntcomeout'), hold: 2.6 },
  ]),

  /* =================================================================== */
  /* BEAT 2 — Lou's office. The player carries the case in and puts it     */
  /* down himself; Lou rotates it to face him before he opens it.          */
  /* =================================================================== */
  officeEnter: Object.freeze([
    { speaker: 'LOU', text: 'Shut the door.', cue: cue('office', 'lou.shutthedoor'), hold: 1.6 },
    { speaker: 'LOU', text: 'On the desk. Where I can see it.', cue: cue('office', 'lou.onthedesk'), hold: 2.6 },
  ]),
  officeStall: Object.freeze([
    { speaker: 'LOU', text: 'It’s a desk, kid. It’s been there longer than you have.', cue: cue('office', 'lou.itsadesk'), hold: 3.6 },
  ]),
  /* The case is on the desk. Lou turns it to face himself, the locks let go,
   * the room goes quiet, and the gold and the purple come up out of it and
   * across the walls, his cigar smoke, and his hands. */
  officeOpen: Object.freeze([
    { speaker: 'HUD', stage: 'lou.rotate', hold: 1.4 },
    { speaker: 'HUD', stage: 'case.open', hold: 2.6 },
    // spec
    { speaker: 'PROSPECT', text: 'What’s inside?', cue: cue('office', 'prospect.whatsinside'), hold: 1.6 },
    // spec
    { speaker: 'LOU', text: 'Eh. You’ll find out soon enough.', cue: cue('office', 'lou.soonenough'), hold: 2.6 },
    { speaker: 'HUD', stage: 'case.close', hold: 1.6 },
    // spec
    { speaker: 'LOU', text: 'Go deliver it to Booski. He’s in the basement.', cue: cue('office', 'lou.deliverittobooski'), hold: 3.2 },
    { speaker: 'HUD', stage: 'case.slide', hold: 1.2 },
    // spec
    { speaker: 'LOU', text: 'Hey, kid.', cue: cue('office', 'lou.heykid'), hold: 1.4 },
    // spec
    { speaker: 'LOU', text: 'Nice job.', cue: cue('office', 'lou.nicejob'), hold: 1.6 },
    // spec
    { speaker: 'LOU', text: 'Now don’t fuck around, and don’t ask anything you don’t wanna know.', cue: cue('office', 'lou.dontaskanything'), hold: 4.2 },
  ]),
  officeLeaving: Object.freeze([
    { speaker: 'LOU', text: 'Down past the armory. Booski knows you’re coming.', cue: cue('office', 'lou.pastthearmory'), hold: 3.2 },
  ]),

  /* =================================================================== */
  /* BEAT 3 — the hidden entrance. Nobody is down here, so the only        */
  /* character available to speak before the HUD does is the Prospect.     */
  /* =================================================================== */
  cellarArrival: Object.freeze([
    { speaker: 'PROSPECT', text: 'Wine racks. Pool table. Photographs of men nobody talks about.', cue: cue('cellar', 'prospect.wineracks'), hold: 4.0 },
    { speaker: 'PROSPECT', text: 'So where’s the basement he meant?', cue: cue('cellar', 'prospect.wherewashemeant'), hold: 2.6 },
  ]),
  cellarBust: Object.freeze([
    { speaker: 'PROSPECT', text: 'Somebody dusts this thing.', cue: cue('cellar', 'prospect.somebodydusts'), hold: 2.2 },
    { speaker: 'PROSPECT', text: '…There’s a gap under the plinth.', cue: cue('cellar', 'prospect.gapundertheplinth'), hold: 2.6 },
  ]),
  cellarWallOpens: Object.freeze([
    { speaker: 'HUD', stage: 'wall.open', hold: 2.8 },
    { speaker: 'PROSPECT', text: 'Okay.', cue: cue('cellar', 'prospect.okay'), hold: 1.4 },
  ]),
  stairwell: Object.freeze([
    { speaker: 'PROSPECT', text: 'Music’s gone.', cue: cue('cellar', 'prospect.musicsgone'), hold: 1.8 },
  ]),

  /* =================================================================== */
  /* BEAT 4 — the interrogation area, Irish, and xXx.                     */
  /*                                                                      */
  /* Irish is down here with a bucket and a story. He is not shocked by    */
  /* any of it and he does not think it is funny; it is a Tuesday.         */
  /* =================================================================== */
  irishCorridor: Object.freeze([
    { speaker: 'IRISH', text: 'Mind the floor there. It’s not dry.', cue: cue('corridor', 'irish.notdry'), hold: 2.6 },
    { speaker: 'IRISH', text: 'There’s a drain every three metres in this hallway. Have a think about why a house needs that.', cue: cue('corridor', 'irish.drains'), hold: 5.0 },
  ]),
  irishIdle: Object.freeze([
    { speaker: 'IRISH', text: 'Go on down. He doesn’t like waiting and I don’t like watching him wait.', cue: cue('corridor', 'irish.goondown'), hold: 4.2 },
  ]),
  xxxHanging: Object.freeze([
    // spec
    { speaker: 'XXX', text: 'You can take the car… you can take the mission…', cue: cue('corridor', 'xxx.takethecar'), hold: 3.4 },
    { speaker: 'HUD', stage: 'xxx.cough', hold: 1.2 },
    // spec
    { speaker: 'XXX', text: 'But you don’t turn your back on family.', cue: cue('corridor', 'xxx.turnyourback'), hold: 3.0 },
  ]),
  booskiShouts: Object.freeze([
    // spec
    { speaker: 'BOOSKI', text: 'Quit talking to the decorations and bring me the case!', cue: cue('corridor', 'booski.decorations'), hold: 3.6 },
  ]),
  irishAfterwards: Object.freeze([
    { speaker: 'IRISH', text: 'He’s been at that all night, God love him. Same three lines.', cue: cue('corridor', 'irish.samethreelines'), hold: 4.0 },
  ]),

  /* =================================================================== */
  /* BEAT 5 — the observation area. DeathMegatron is already down here,   */
  /* watching the glass. Completely heartless and cold in this scene:      */
  /* the owner's note, and it should be chilling rather than jokey.        */
  /* =================================================================== */
  observationArrival: Object.freeze([
    { speaker: 'DEATHMEGATRON', text: 'You’re late.', cue: cue('lab', 'dmt.youarelate'), hold: 1.8 },
    { speaker: 'DEATHMEGATRON', text: 'Don’t lean on the glass. It’s twelve centimetres. You could drive a car at it.', cue: cue('lab', 'dmt.twelvecentimetres'), hold: 4.6 },
  ]),
  observationIdle: Object.freeze([
    { speaker: 'DEATHMEGATRON', text: 'Six of them. Been in there since March.', cue: cue('lab', 'dmt.sixofthem'), hold: 3.2 },
  ]),

  /* =================================================================== */
  /* BEAT 6 — delivery. The player sets the case down himself.            */
  /* =================================================================== */
  deliveryGreeting: Object.freeze([
    // spec
    { speaker: 'BOOSKI', text: 'There he is. Our little delivery boy.', cue: cue('delivery', 'booski.deliveryboy'), hold: 3.0 },
    { speaker: 'BOOSKI', text: 'On the transfer table. Both hands.', cue: cue('delivery', 'booski.bothhands'), hold: 2.6 },
  ]),
  deliveryStall: Object.freeze([
    { speaker: 'BOOSKI', text: 'It doesn’t get lighter, kid.', cue: cue('delivery', 'booski.doesntgetlighter'), hold: 2.4 },
  ]),
  deliveryOpen: Object.freeze([
    { speaker: 'HUD', stage: 'case.open', hold: 2.2 },
    // spec
    { speaker: 'BOOSKI', text: 'Ah, yes. The Squatchanium.', cue: cue('delivery', 'booski.thesquatchanium'), hold: 2.6 },
    { speaker: 'HUD', stage: 'case.lift', hold: 1.6 },
    // spec
    { speaker: 'BOOSKI', text: 'Do you have any idea how hard this stuff is to get?', cue: cue('delivery', 'booski.howhard'), hold: 3.4 },
    { speaker: 'PROSPECT', text: 'I —', cue: cue('delivery', 'prospect.i'), hold: 0.9 },
    // spec
    { speaker: 'BOOSKI', text: 'Rhetorical question. I don’t care.', cue: cue('delivery', 'booski.rhetorical'), hold: 2.8 },
    { speaker: 'HUD', stage: 'drawer.send', hold: 2.4 },
    { speaker: 'BOOSKI', text: 'Through it goes. Watch what they do with it.', cue: cue('delivery', 'booski.throughitgoes'), hold: 3.2 },
  ]),

  /* =================================================================== */
  /* BEAT 6/7 — the build. Six people, not six copies.                    */
  /*                                                                      */
  /* Every line the spec quotes for the six is here word for word; the     */
  /* rest are written to give each of them somewhere to have come from.    */
  /* Vetrov has a wife who thinks he is on a pipeline. Sokolov loves the   */
  /* machine. Bezmenov has done this before and knows how it ends. Orlova  */
  /* is the youngest person ever to build one. Marchuk is the only one     */
  /* looking at the people instead of the dials. Aubbie is untouchable,     */
  /* and says so, through the glass, to the man who is going to kill him.  */
  /* =================================================================== */
  build: Object.freeze([
    { speaker: 'ORLOVA', text: 'Transfer chamber secure.', cue: cue('build', 'orlova.transferchamber'), hold: 2.0, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'Careful with the containment cylinder.', cue: cue('build', 'aubbie.containmentcylinder'), hold: 2.6, muffled: true }, // spec
    { speaker: 'VETROV', text: 'Doctor Aubbie, the shielding is not ready.', cue: cue('build', 'vetrov.shieldingnotready'), hold: 3.0, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'The shielding is ready when I say the shielding is ready.', cue: cue('build', 'aubbie.whenisayitis'), hold: 3.6, muffled: true },
    { speaker: 'AUBBIE', text: 'Connect the Squatchanium core.', cue: cue('build', 'aubbie.connectthecore'), hold: 2.4, muffled: true }, // spec
    { speaker: 'SOKOLOV', text: 'Core rotation stable.', cue: cue('build', 'sokolov.rotationstable'), hold: 2.0, muffled: true }, // spec
    { speaker: 'ORLOVA', text: 'Purple coolant pressure holding.', cue: cue('build', 'orlova.coolantpressure'), hold: 2.4, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'Increase the purple coolant flow.', cue: cue('build', 'aubbie.increasecoolant'), hold: 2.4, muffled: true }, // spec
    { speaker: 'MARCHUK', text: 'The Squatchanium is reacting with the biological stabilizer.', cue: cue('build', 'marchuk.reacting'), hold: 3.8, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'It is supposed to react. That is the entire principle.', cue: cue('build', 'aubbie.supposedtoreact'), hold: 3.6, muffled: true },
    { speaker: 'VETROV', text: 'Radiation levels are climbing.', cue: cue('build', 'vetrov.radiationclimbing'), hold: 2.4, muffled: true }, // spec
    { speaker: 'VETROV', text: 'My wife thinks I am working on a pipeline.', cue: cue('build', 'vetrov.pipeline'), hold: 3.2, muffled: true },
    { speaker: 'BEZMENOV', text: 'Do not tell them that.', cue: cue('build', 'bezmenov.donottellthem'), hold: 2.2, muffled: true },
    { speaker: 'AUBBIE', text: 'No, no, no. Gold coupling first, purple coupling second.', cue: cue('build', 'aubbie.goldfirst'), hold: 3.8, muffled: true }, // spec
    { speaker: 'SOKOLOV', text: 'Feel that through the floor. That is the rings.', cue: cue('build', 'sokolov.throughthefloor'), hold: 3.2, muffled: true },
    { speaker: 'SOKOLOV', text: 'Power output is beyond prediction.', cue: cue('build', 'sokolov.beyondprediction'), hold: 2.8, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'If the stabilizer falls below forty percent, we all become shadows on the wall.', cue: cue('build', 'aubbie.shadowsonthewall'), hold: 4.6, muffled: true }, // spec
    { speaker: 'VETROV', text: 'This was not in the original agreement.', cue: cue('build', 'vetrov.notintheagreement'), hold: 2.8, muffled: true }, // spec
    { speaker: 'ORLOVA', text: 'First one ever built. Anywhere. By us.', cue: cue('build', 'orlova.firstoneever'), hold: 3.0, muffled: true },
    { speaker: 'BEZMENOV', text: 'They will kill us when this is finished.', cue: cue('build', 'bezmenov.theywillkillus'), hold: 3.2, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'They need us.', cue: cue('build', 'aubbie.theyneedus'), hold: 1.8, muffled: true }, // spec
    /* He says this looking through the glass, straight at Booski, who does
     * not react, because Booski is agreeing with him. */
    { speaker: 'BEZMENOV', text: 'Men like him need no one.', cue: cue('build', 'bezmenov.needsnoone'), hold: 2.8, muffled: true }, // spec
    { speaker: 'MARCHUK', text: 'Core temperature is increasing.', cue: cue('build', 'marchuk.temperature'), hold: 2.4, muffled: true }, // spec
    { speaker: 'MARCHUK', text: 'Whoever is standing closest, step back. Both of you.', cue: cue('build', 'marchuk.stepback'), hold: 3.4, muffled: true },
    { speaker: 'MARCHUK', text: 'We should evacuate.', cue: cue('build', 'marchuk.weshouldevacuate'), hold: 2.2, muffled: true }, // spec
    { speaker: 'AUBBIE', text: 'Nobody is evacuating. We are four minutes from finished.', cue: cue('build', 'aubbie.fourminutes'), hold: 3.8, muffled: true },
    { speaker: 'AUBBIE', text: 'You are watching history through that window. Try to look like it.', cue: cue('build', 'aubbie.watchinghistory'), hold: 4.2, muffled: true },
    { speaker: 'SOKOLOV', text: 'Silent Squatch will be operational.', cue: cue('build', 'sokolov.willbeoperational'), hold: 2.8, muffled: true }, // spec
    { speaker: 'ORLOVA', text: 'Beginning final sequence.', cue: cue('build', 'orlova.finalsequence'), hold: 2.2, muffled: true }, // spec
  ]),
  /* Booski and DeathMegatron, outside the glass, while that is going on.
   * Interjected between build lines rather than queued after them. */
  buildAsides: Object.freeze([
    { speaker: 'BOOSKI', text: 'Twelve weeks they’ve been down here. Eating my food.', cue: cue('build', 'booski.twelveweeks'), hold: 3.4 },
    { speaker: 'DEATHMEGATRON', text: 'Six.', cue: cue('build', 'dmt.six'), hold: 1.2 },
    { speaker: 'BOOSKI', text: 'The one doing the talking is the one that matters. The rest are hands.', cue: cue('build', 'booski.therestarehands'), hold: 4.4 },
    { speaker: 'DEATHMEGATRON', text: 'Hands can write.', cue: cue('build', 'dmt.handscanwrite'), hold: 1.8 },
  ]),

  /* =================================================================== */
  /* BEAT 7 — completion.                                                 */
  /* =================================================================== */
  completion: Object.freeze([
    { speaker: 'HUD', stage: 'core.begin', hold: 3.2 },
    // spec
    { speaker: 'AUBBIE', text: 'Initiating final stabilization.', cue: cue('completion', 'aubbie.finalstabilization'), hold: 2.8, muffled: true },
    { speaker: 'HUD', stage: 'core.complete', hold: 2.4 },
    // spec
    { speaker: 'LAB_COMPUTER', text: 'PROJECT SILENT SQUATCH: CORE COMPLETE.', cue: cue('completion', 'computer.corecomplete'), hold: 3.4, muffled: true },
    { speaker: 'ORLOVA', text: 'It is holding. It is holding!', cue: cue('completion', 'orlova.itisholding'), hold: 2.8, muffled: true },
    { speaker: 'SOKOLOV', text: 'Twelve weeks! Twelve weeks!', cue: cue('completion', 'sokolov.twelveweeks'), hold: 2.6, muffled: true },
    { speaker: 'VETROV', text: 'I told you the shielding would hold.', cue: cue('completion', 'vetrov.itoldyou'), hold: 2.8, muffled: true },
    /* Said flatly, in the middle of people hugging each other. */
    { speaker: 'BEZMENOV', text: 'Congratulations, everybody.', cue: cue('completion', 'bezmenov.congratulations'), hold: 2.4, muffled: true },
  ]),
  /* Aubbie comes out through the glass door into the observation area. From
   * this line on he is on the player's side of the glass, and he stays there. */
  aubbieOut: Object.freeze([
    { speaker: 'HUD', stage: 'door.open', hold: 1.8 },
    // spec
    { speaker: 'AUBBIE', text: 'It is complete.', cue: cue('completion', 'aubbie.itiscomplete'), hold: 2.0 },
    // spec
    { speaker: 'BOOSKI', text: 'You’re certain?', cue: cue('completion', 'booski.youarecertain'), hold: 1.8 },
    // spec
    { speaker: 'AUBBIE', text: 'The core is stable. The Fat Squatch can now be assembled.', cue: cue('completion', 'aubbie.fatsquatch'), hold: 4.0 },
    // spec
    { speaker: 'BOOSKI', text: 'And nobody else knows how to reproduce it?', cue: cue('completion', 'booski.nobodyelseknows'), hold: 3.0 },
    /* The hesitation is the whole beat. He is deciding how much his team is
     * worth to him, and he gets it exactly wrong. */
    { speaker: 'HUD', stage: 'aubbie.hesitate', hold: 1.6 },
    // spec
    { speaker: 'AUBBIE', text: 'Only my team understands the full process.', cue: cue('completion', 'aubbie.onlymyteam'), hold: 3.2 },
    { speaker: 'HUD', stage: 'booski.smile', hold: 1.2 },
    // spec
    { speaker: 'BOOSKI', text: 'Good.', cue: cue('completion', 'booski.good'), hold: 1.6 },
  ]),

  /* =================================================================== */
  /* BEAT 8 — locking, and the execution.                                 */
  /* =================================================================== */
  lockOrder: Object.freeze([
    // spec
    { speaker: 'BOOSKI', text: 'Lock the lab.', cue: cue('lock', 'booski.lockthelab'), hold: 2.0 },
  ]),
  /* The code, said out loud by a character before the HUD says which keys.
   * Nobody in this room finds the number funny, and nobody remarks on it. */
  keypadCode: Object.freeze([
    { speaker: 'DEATHMEGATRON', text: 'Six nine six nine.', cue: cue('lock', 'dmt.sixninesixnine'), hold: 2.2 },
  ]),
  keypadWrong: Object.freeze([
    { speaker: 'DEATHMEGATRON', text: 'Again. Slower.', cue: cue('lock', 'dmt.againslower'), hold: 1.8 },
  ]),
  keypadWrongTwice: Object.freeze([
    { speaker: 'BOOSKI', text: 'Six. Nine. Six. Nine. It is not a long number.', cue: cue('lock', 'booski.notalongnumber'), hold: 3.8 },
  ]),
  /* The bolts go in. Everything behind the glass is muffled from here on:
   * `lab.muffled` is true and every scientist line routes through
   * `lab.glassAudio` for the rest of the mission. */
  doorLocked: Object.freeze([
    { speaker: 'HUD', stage: 'door.lock', hold: 2.6 },
    // spec
    { speaker: 'BEZMENOV', text: 'Why is door locked?', cue: cue('lock', 'bezmenov.whyisdoorlocked'), hold: 2.6, muffled: true },
    // spec
    { speaker: 'ORLOVA', text: 'Open door.', cue: cue('lock', 'orlova.opendoor'), hold: 1.6, muffled: true },
    // spec — Aubbie is outside it, with them behind him
    { speaker: 'AUBBIE', text: 'What is this?', cue: cue('lock', 'aubbie.whatisthis'), hold: 1.8 },
    { speaker: 'HUD', stage: 'booski.silent', hold: 1.8 },
    // spec
    { speaker: 'BOOSKI', text: 'This guy’s usefulness has expired.', cue: cue('lock', 'booski.usefulnessexpired'), hold: 3.0 },
    // spec
    { speaker: 'BOOSKI', text: 'Handle it.', cue: cue('lock', 'booski.handleit'), hold: 1.6 },
  ]),
  aubbiePleads: Object.freeze([
    // spec
    { speaker: 'AUBBIE', text: 'Booski, we had agreement.', cue: cue('execution', 'aubbie.wehadagreement'), hold: 2.6 },
    // spec
    { speaker: 'BOOSKI', text: 'We did.', cue: cue('execution', 'booski.wedid'), hold: 1.4 },
    // spec
    { speaker: 'AUBBIE', text: 'You need me to maintain the core.', cue: cue('execution', 'aubbie.maintainthecore'), hold: 2.8 },
    // spec
    { speaker: 'BOOSKI', text: 'We made copies of your notes.', cue: cue('execution', 'booski.copiesofyournotes'), hold: 2.8 },
    // spec
    { speaker: 'AUBBIE', text: 'You do not understand what you have built!', cue: cue('execution', 'aubbie.whatyouhavebuilt'), hold: 3.4 },
    // spec
    { speaker: 'BOOSKI', text: 'I said handle it.', cue: cue('execution', 'booski.isaidhandleit'), hold: 2.0 },
  ]),
  executionStallAubbie: Object.freeze([
    { speaker: 'AUBBIE', text: 'Boy. Look at me. You do not have to do this.', cue: cue('execution', 'aubbie.lookatme'), hold: 3.6 },
  ]),
  executionStallBooski: Object.freeze([
    { speaker: 'BOOSKI', text: 'Any day, Prospect.', cue: cue('execution', 'booski.anyday'), hold: 1.8 },
  ]),
  executionStallDmt: Object.freeze([
    { speaker: 'DEATHMEGATRON', text: 'He is not going to get quieter.', cue: cue('execution', 'dmt.notgoingtogetquieter'), hold: 2.6 },
  ]),
  executionMiss: Object.freeze([
    { speaker: 'BOOSKI', text: 'That was a console. Look at what you’re pointing it at.', cue: cue('execution', 'booski.thatwasaconsole'), hold: 3.8 },
  ]),
  /* He falls on the observation-room floor, in full view of the five people
   * still behind the glass. That is the entire point of where he is standing. */
  executionDone: Object.freeze([
    { speaker: 'HUD', stage: 'aubbie.fall', hold: 2.6 },
    { speaker: 'DEATHMEGATRON', text: 'He’s in the way of the door.', cue: cue('execution', 'dmt.inthewayofthedoor'), hold: 2.6 },
  ]),

  /* =================================================================== */
  /* BEAT 9 — the reaction. Muffled and overlapping.                      */
  /*                                                                      */
  /* All ten of the spec's lines, spread across the five who are left.     */
  /* Bezmenov says none of them: he tried the handle first, and now he     */
  /* stops and stares, because he has been expecting this since March.     */
  /* =================================================================== */
  reaction: Object.freeze([
    { speaker: 'ORLOVA', text: 'What are you doing?!', cue: cue('reaction', 'orlova.whatareyoudoing'), hold: 1.8, muffled: true }, // spec
    { speaker: 'VETROV', text: 'Open the door!', cue: cue('reaction', 'vetrov.openthedoor'), hold: 1.6, muffled: true }, // spec
    { speaker: 'MARCHUK', text: 'Why did you kill him?!', cue: cue('reaction', 'marchuk.whydidyoukillhim'), hold: 2.0, muffled: true }, // spec
    { speaker: 'SOKOLOV', text: 'We did everything you asked!', cue: cue('reaction', 'sokolov.everythingyouasked'), hold: 2.4, muffled: true }, // spec
    { speaker: 'VETROV', text: 'Please!', cue: cue('reaction', 'vetrov.please'), hold: 1.2, muffled: true }, // spec
    { speaker: 'MARCHUK', text: 'There is no ventilation!', cue: cue('reaction', 'marchuk.noventilation'), hold: 2.0, muffled: true }, // spec
    { speaker: 'ORLOVA', text: 'We have families!', cue: cue('reaction', 'orlova.wehavefamilies'), hold: 1.8, muffled: true }, // spec
    { speaker: 'SOKOLOV', text: 'You cannot leave us in here!', cue: cue('reaction', 'sokolov.cannotleaveus'), hold: 2.4, muffled: true }, // spec
    { speaker: 'VETROV', text: 'We can work for you!', cue: cue('reaction', 'vetrov.canworkforyou'), hold: 2.0, muffled: true }, // spec
    { speaker: 'ORLOVA', text: 'We will tell nobody!', cue: cue('reaction', 'orlova.tellnobody'), hold: 2.0, muffled: true }, // spec
  ]),
  /* One of them takes a metal chair to the glass. The chair bends. The glass
   * does not break. Then the old man tells him to stop. */
  reactionChair: Object.freeze([
    { speaker: 'SOKOLOV', text: 'Move! Move back!', cue: cue('reaction', 'sokolov.moveback'), hold: 1.8, muffled: true },
    { speaker: 'HUD', stage: 'glass.chair', hold: 2.8 },
    { speaker: 'BEZMENOV', text: 'Stop.', cue: cue('reaction', 'bezmenov.stop'), hold: 1.6, muffled: true },
  ]),

  /* =================================================================== */
  /* BEAT 10 — Silent Night. Booski lifts the cover and does not pull it.  */
  /* =================================================================== */
  silentNightOrder: Object.freeze([
    { speaker: 'HUD', stage: 'cover.lift', hold: 1.8 },
    // spec
    { speaker: 'BOOSKI', text: 'You started the job.', cue: cue('silentnight', 'booski.youstartedthejob'), hold: 2.2 },
    { speaker: 'HUD', stage: 'booski.stepaside', hold: 1.2 },
    // spec
    { speaker: 'BOOSKI', text: 'Finish it.', cue: cue('silentnight', 'booski.finishit'), hold: 1.8 },
  ]),
  silentNightStall: Object.freeze([
    { speaker: 'BOOSKI', text: 'It’s the same hand you just used.', cue: cue('silentnight', 'booski.samehand'), hold: 2.8 },
  ]),
  silentNightPulled: Object.freeze([
    { speaker: 'HUD', stage: 'alarm.start', hold: 2.2 },
    // spec
    { speaker: 'LAB_COMPUTER', text: 'SILENT NIGHT PROTOCOL ACTIVATED.', cue: cue('silentnight', 'computer.activated'), hold: 3.2, muffled: true },
  ]),

  /* The stages, in the spec's order: confusion, panic, covering their mouths,
   * coughing and choking, slamming the glass, crawling for the door,
   * collapsing one by one. Each stage's lines are played as it begins; the
   * mission paces the stages off `lab.gas.density`. */
  gasConfusion: Object.freeze([
    { speaker: 'ORLOVA', text: 'The vents are open.', cue: cue('gas', 'orlova.ventsareopen'), hold: 1.8, muffled: true },
    { speaker: 'VETROV', text: 'Why are the vents open?', cue: cue('gas', 'vetrov.whyarethevents'), hold: 2.0, muffled: true },
  ]),
  gasPanic: Object.freeze([
    { speaker: 'SOKOLOV', text: 'Get to the door! All of you, the door!', cue: cue('gas', 'sokolov.gettothedoor'), hold: 2.8, muffled: true },
    { speaker: 'BEZMENOV', text: 'I told you.', cue: cue('gas', 'bezmenov.itoldyou'), hold: 1.6, muffled: true },
  ]),
  gasCovering: Object.freeze([
    { speaker: 'MARCHUK', text: 'Sleeve over your mouth. Breathe through the sleeve.', cue: cue('gas', 'marchuk.sleeve'), hold: 3.4, muffled: true },
    { speaker: 'VETROV', text: 'The masks are locked. The masks are locked!', cue: cue('gas', 'vetrov.masksarelocked'), hold: 3.0, muffled: true },
  ]),
  gasChoking: Object.freeze([
    { speaker: 'VETROV', text: 'I can’t — I can’t —', cue: cue('gas', 'vetrov.icant'), hold: 2.2, muffled: true },
    { speaker: 'MARCHUK', text: 'Down. Stay down.', cue: cue('gas', 'marchuk.staydown'), hold: 1.8, muffled: true },
  ]),
  gasSlamming: Object.freeze([
    { speaker: 'ORLOVA', text: 'Look at me. Look at me!', cue: cue('gas', 'orlova.lookatme'), hold: 2.4, muffled: true },
    { speaker: 'SOKOLOV', text: 'Open it! Open it! Open —', cue: cue('gas', 'sokolov.openit'), hold: 2.6, muffled: true },
  ]),
  gasCrawling: Object.freeze([
    { speaker: 'MARCHUK', text: 'Nadia. Give me your hand.', cue: cue('gas', 'marchuk.giveyourhand'), hold: 2.6, muffled: true },
  ]),
  /* Nothing is said over the collapsing. The last one to reach the glass
   * leaves a smeared handprint on it, and the core keeps running. */
  gasCollapse: Object.freeze([
    { speaker: 'HUD', stage: 'glass.handprint', hold: 3.0 },
  ]),

  aftermath: Object.freeze([
    { speaker: 'HUD', stage: 'monitor.lifesigns', hold: 2.6 },
    // spec
    { speaker: 'BOOSKI', text: 'Efficient.', cue: cue('aftermath', 'booski.efficient'), hold: 1.8 },
    { speaker: 'HUD', stage: 'booski.pause', hold: 1.4 },
    // spec
    { speaker: 'BOOSKI', text: 'Lou’s gonna like you.', cue: cue('aftermath', 'booski.lousgonnalikeyou'), hold: 2.6 },
    { speaker: 'DEATHMEGATRON', text: 'It’s still running. Look at it.', cue: cue('aftermath', 'dmt.stillrunning'), hold: 3.0 },
  ]),

  /* =================================================================== */
  /* BEAT 11 — Snow, and the exit.                                        */
  /* =================================================================== */
  snowIntercom: Object.freeze([
    // spec
    { speaker: 'BOOSKI', text: 'Snow. Basement.', cue: cue('exit', 'booski.snowbasement'), hold: 2.0 },
    // spec
    { speaker: 'SNOW', text: 'How bad?', cue: cue('exit', 'snow.howbad'), hold: 1.4 },
    { speaker: 'HUD', stage: 'booski.looksthrough', hold: 2.0 },
    // spec
    { speaker: 'BOOSKI', text: 'Bring the cart.', cue: cue('exit', 'booski.bringthecart'), hold: 1.8 },
    // spec
    { speaker: 'SNOW', text: 'Jesus Christ.', cue: cue('exit', 'snow.jesuschrist'), hold: 1.8 },
    // spec
    { speaker: 'BOOSKI', text: 'And a mop.', cue: cue('exit', 'booski.andamop'), hold: 1.8 },
  ]),
  exitOrder: Object.freeze([
    { speaker: 'BOOSKI', text: 'Upstairs. Lou’s still awake.', cue: cue('exit', 'booski.louisstillawake'), hold: 2.6 },
  ]),
  /* Snow passes the player on the stairs, in gloves, pushing an industrial
   * cleanup cart. He is not making a joke and he is not upset. */
  snowOnTheStairs: Object.freeze([
    // spec
    { speaker: 'SNOW', text: 'I told you not to make more work for me.', cue: cue('exit', 'snow.itoldyou'), hold: 3.2 },
  ]),
  xxxOnTheWayOut: Object.freeze([
    // spec
    { speaker: 'XXX', text: 'Family meeting go well?', cue: cue('exit', 'xxx.familymeeting'), hold: 2.4 },
  ]),
  /* The wall closes behind him and the lab is not audible from the cellar.
   * Nobody says anything over this. */
  wallCloses: Object.freeze([
    { speaker: 'HUD', stage: 'wall.close', hold: 3.0 },
  ]),
});

/**
 * The on-screen objective, per beat. Five of these six are the spec's own
 * words; `RETURN_UPSTAIRS` is the walk out, which the spec describes but does
 * not name.
 */
export const OBJECTIVES = Object.freeze({
  DELIVER_PACKAGE: 'Deliver the package to Lou.',
  TAKE_TO_BOOSKI: 'Take the Squatchanium to Booski.',
  LOCK_THE_LAB: 'Lock the laboratory door.',
  ELIMINATE_AUBBIE: 'Eliminate Aubbie.',
  ACTIVATE_SILENT_NIGHT: 'Activate Silent Night.',
  RETURN_UPSTAIRS: 'Return upstairs.',
});

/**
 * The game talking to the player in its own register — never a character, never
 * a cue, never a voice. Each of these is raised in a dialogue sequence's
 * `onDone`, so the man in the room has always finished speaking first.
 */
export const INSTRUCTIONS = Object.freeze({
  PLACE_CASE: 'Carry the case to Lou’s desk and press E to set it down.',
  TAKE_CASE: 'Press E to pick the case back up.',
  BUST_SWITCH: 'Press E under the marble bust.',
  DELIVER_CASE: 'Press E to set the case on the transfer table.',
  KEYPAD: 'Press E at the keypad, then type the code and press ENTER.',
  ELIMINATE_AUBBIE: 'Aim at Aubbie and LEFT CLICK.',
  SILENT_NIGHT: 'Hold E on the SILENT NIGHT switch.',
  RETURN_UPSTAIRS: 'Go back up the stairwell to the cellar.',
});

/** What appears under the reticle when the crosshair is genuinely on him. */
export const TARGET_CALLOUTS = Object.freeze({
  ELIMINATE_AUBBIE: 'AUBBIE — FIRE',
});

/** The keypad code. The spec's, and it is never remarked upon by anybody. */
export const LAB_DOOR_CODE = '6969';

/**
 * Voice profiles this mission's script casts that are NOT in the `voices` block
 * of assets/sfx/manifest.json yet.
 *
 * The owner supplies ElevenLabs ids centrally; nothing here invents one. This
 * list is the written-down version of that gap — tests/silent-squatch-voice.
 * test.mjs allows exactly these names to be missing from the manifest and
 * nothing else, so casting a typo (or quietly inventing a seventh scientist)
 * still fails the build. WHEN THE IDS LAND, EMPTY THIS ARRAY.
 */
export const PENDING_VOICE_PROFILES = Object.freeze([
  /* xXx, hanging upside down in the interrogation area. Owner is supplying
   * the id. Battered, unbothered, one octave lower than he can hold. */
  'xxx',
  /* The five scientists who are not Aubbie. Accented English, all of them,
   * and all six sound like six different people. */
  'vetrov', // nervous technician — young, thin, apologetic
  'sokolov', // weapons engineer — warm, delighted by the machine
  'bezmenov', // cynical older scientist — flat, slow, expects the worst
  'orlova', // junior assistant — the youngest voice in the room
  'marchuk', // medical specialist — clinical, gentle, the only one watching people
  /* The laboratory annunciator. Synthetic, unhurried, no affect whatever.
   * Two lines in the whole mission and both of them are terrible. */
  'labcomputer',
]);

/**
 * Every authored line in this mission, flattened, for voice tooling and for
 * the manifest checks. Walks `SEQUENCES` generically so a sequence added above
 * cannot be silently left out of the recording sheet — the exact failure
 * tests/new-scene-voice-manifest.test.mjs exists to prevent for the other
 * scenes.
 *
 * HUD prose and stage directions carry no `cue` and are excluded: they are
 * read, not performed.
 */
export function allSilentSquatchLines() {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.speaker === 'string') {
      if (!node.cue) return;
      const speaker = SPEAKERS[node.speaker];
      out.push({
        name: node.cue,
        voice: speaker?.voice ?? null,
        say: node.text,
        speaker: node.speaker,
        muffled: node.muffled === true,
      });
      return;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(SEQUENCES);
  return out;
}

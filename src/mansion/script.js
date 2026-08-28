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
 * Captain Lou Sasole, a different man. Every profile this mission uses now has
 * an owner-supplied id; `PENDING_VOICE_PROFILES` at the bottom is empty and
 * says why. Cue names are generated centrally — `npm run vo:mansion`, joined
 * into `npm run vo:sync` — and nothing here writes a manifest.
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

  /* ---- the house's own people ---- */
  /**
   * The man on the front door.
   *
   * Owner: *"This guy is deadly serious and doesn't want any funny business."*
   * He is not Family and he is not a doorman; he is the last thing between the
   * driveway and Lou, he knows it, and none of what he says is a joke. His own
   * profile (`mansion-gate`) rather than the guards' — he is the only person
   * in the house who is allowed to stop you, and he has to sound like it.
   */
  GATE: Object.freeze({ name: 'The man on the door', voice: 'mansion-gate' }),
  /**
   * The man in the booth at the street gate.
   *
   * SAME THROAT AS `GATE`, on purpose, and the argument is the perimeter
   * guards' argument: these two are one job at two ends of one driveway. The
   * profile note the owner wrote for `mansion-gate` — deadly serious, no funny
   * business — is the direction for both parts, and splitting them would ask
   * for a second reading of the same instruction. Separate SPEAKER because
   * they are separate BODIES: `cast.js` maps a line's speaker to the mouth it
   * comes out of, and one key for two men moves the wrong jaw.
   */
  BOOTH: Object.freeze({ name: 'The man on the gate', voice: 'mansion-gate' }),
  /**
   * Everybody else in the same suit: the men walking the perimeter, the one at
   * the top of the stairs, the one in the basement and the one on the vault.
   *
   * THEY WERE ONE PROFILE, AND THE REASONING FOR THAT SURVIVES THE CHANGE.
   * Until 2026-08-05 all six shared `mansion-guard`, deliberately: they are a
   * uniform, not five characters, and every line is short, flat and about the
   * six square metres the man saying it is standing on. The owner then cast
   * four more ids, so they can be six men after all — and they are split BY
   * POST rather than by number, because the original argument is the reason
   * the split is safe. `GUARD_STAIRS` is not a different personality from
   * `GUARD_VAULT`; he is a different man standing somewhere else, and WHERE
   * he is standing is still what does the characterisation. The reading must
   * still not try to.
   *
   * The cue scopes were written the same way — `guards.stairs.*`,
   * `guards.basement.*`, `guards.vault.*`, `guards.perimeter.*` — so the map
   * from post to voice is mechanical and NOT ONE LINE BELOW WAS REWRITTEN for
   * it. `src/mansion/cast.js` posts the matching body under each.
   */
  /** The two perimeter men who share the original throat. */
  GUARD: Object.freeze({ name: 'Guard', voice: 'mansion-guard' }),
  /** The third man outside, so the patrol is not one voice walking past you
   * three times. His own profile note quotes his own line back at him. */
  GUARD_PERIMETER: Object.freeze({ name: 'Guard', voice: 'mansion-guard-perimeter' }),
  /** Top of the horseshoe. The one post in the house with a view. */
  GUARD_STAIRS: Object.freeze({ name: 'Guard', voice: 'mansion-guard-stairs' }),
  /** Past the armory, in a room with no daylight. */
  GUARD_BASEMENT: Object.freeze({ name: 'Guard', voice: 'mansion-guard-basement' }),
  /** In front of eleven inches of steel that is standing open. */
  GUARD_VAULT: Object.freeze({ name: 'Guard', voice: 'mansion-guard-vault' }),
  /** Au Gratin, running the interrogation. Already cast; `gratin`. */
  GRATIN: Object.freeze({ name: 'Gratin', voice: 'gratin' }),
  /** The Bada Bing's bartender, working Lou's bar tonight. ONE man — the same
   * `bartender` profile the club has always used, not a second one. */
  BARTENDER: Object.freeze({ name: 'The bartender', voice: 'bartender' }),

  /* ---- the rest of the Family, using the house ----
   *
   * Owner, 2026-08-05: *"Everyone should be there for the most part utilizing
   * the house hanging out."* Four more of the roster, in four rooms the house
   * built and nobody was ever in. None of them is invented: each is a
   * `src/core/wardrobe.js` body with a campaign id and a voice profile that
   * already exists in the manifest. They are OFF every mission zone on
   * purpose — the mission owns Rippin, Eric, Shubes and Snow, and a second
   * controller barking over the top of it is how a beat gets said twice. */
  /**
   * CAPTAIN LOU SASOLE. `lou2`, and the pilot.
   *
   * HE IS NOT BIG UNCLE LOU AND MUST NEVER MERGE WITH HIM. `LOU` above is
   * `lou1`, Big Uncle Lou Sputthole, who is upstairs behind his own desk;
   * this is the man who flies the aeroplane, and tonight he is on a stool at
   * the bar downstairs. They are deliberately cast three lines apart so the
   * difference is visible to anybody editing either of them, which is the
   * same thing `src/core/wardrobe.js` does with their two bodies — different
   * height, different build, a flight jacket against a pressed suit.
   */
  SASOLE: Object.freeze({ name: 'Captain Lou Sasole', voice: 'lou2' }),
  NUMBSKULL: Object.freeze({ name: 'Numbskull', voice: 'numbskull' }),
  HOGMAMA: Object.freeze({ name: 'Hog Mama', voice: 'hogmama' }),
  OLD_STOVE: Object.freeze({ name: 'Old Stove', voice: 'old-stove' }),
  /* The other two in the back row of the theatre, and the two the owner asked
   * for by name. Both are Family and both already have a profile on the
   * roster (`src/core/characters.js`); they simply had nothing to say in this
   * house until now. */
  SEFF: Object.freeze({ name: 'Seff', voice: 'seff' }),
  LAG: Object.freeze({ name: 'Lag', voice: 'lag' }),
  PERFORMER: Object.freeze({ name: 'Dancer', voice: 'performer' }),

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

/* =================================================================== */
/* PER-VOICE OUTPUT GAIN                                                */
/*                                                                       */
/* Owner playtest, 2026-08-06: *"Aubbie volume +20%."*                   */
/*                                                                        */
/* AT THE PROFILE, NOT AT THE FILE AND NOT AT THE CALL SITE. Aubbie has   */
/* thirty-one lines in this mission and they leave by two different       */
/* routes — muffled, out of his body behind twelve centimetres of glass,  */
/* and dry, out of the same body once he has walked through the door —    */
/* so a number typed at either route fixes half of him. And a take        */
/* re-rendered louder fixes only the takes that exist today: eleven of    */
/* this mission's lines are still unrecorded and the eleven after them    */
/* would arrive quiet again.                                              */
/*                                                                         */
/* So it is one table, keyed by the `voices` profile every one of his      */
/* lines already resolves to, read by `SilentSquatchMission.#speak` and by */
/* `mission/mount.js`'s `playCue` — the only two places a line of this     */
/* mission's ever reaches the engine. Recast him and the gain follows the  */
/* profile; give somebody else the same problem and it is one row.         */
/* =================================================================== */
export const VOICE_GAIN = Object.freeze({
  /* +20%. He is the quietest performance on the roster and half his part is
   * played through the glass send, which takes another 40% off him on top. */
  aubbie: 1.2,
});

/* Reinforced glass removes roughly two thirds of the voice bus before
 * positional attenuation is applied. Aubbie's already-quiet performance
 * therefore needs a route-specific send boost while he is still inside;
 * once he steps through the door his authored +20% profile is unchanged. */
export const SEALED_VOICE_GAIN = Object.freeze({
  /* At the authored observation mark he is roughly ten metres from the
   * listener. This restores a clearly audible quarter-scale voice after both
   * the 0.34 glass send and the inverse-distance panner. */
  aubbie: 4.5,
});

/** The output gain a line in this voice is played at. 1 for everybody with no
 * row of their own, so an uncast or misspelled profile is simply normal. */
export function gainForVoice(voice, { sealed = false } = {}) {
  const gain = VOICE_GAIN[voice];
  const profile = Number.isFinite(gain) && gain > 0 ? gain : 1;
  const sealedGain = SEALED_VOICE_GAIN[voice];
  const compensation = sealed && Number.isFinite(sealedGain) && sealedGain > 0 ? sealedGain : 1;
  return profile * compensation;
}

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
    { speaker: 'PROSPECT', text: 'First time at Lou’s place. Whatever’s in this case has been humming since the car.', cue: cue('arrival', 'prospect.firstvisitcase'), hold: 4.2 },
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
    { speaker: 'LOU', text: 'Squatchanium. Booski will show you what that means downstairs. Then you’ll wish I hadn’t named it.', cue: cue('office', 'lou.namesquatchanium'), hold: 4.4 },
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
  /* WALKING PAST HIM IS NOT THE SAME AS HITTING HIM.
   *
   * Owner playtest: *"the xXx family line should be on the first hit"*. It
   * was on the approach — the spec's two best lines, spent on a proximity
   * bark for walking down a corridor, before the player had done anything at
   * all. They are the payoff of picking the cord up, and they are in
   * `tortureSwing` now, on the same two cues, so the recorded takes carry
   * across unchanged.
   *
   * What is left here is a man who has been hanging upside down for some
   * hours noticing that somebody has come in. He does not make a speech. */
  xxxHanging: Object.freeze([
    { speaker: 'XXX', text: '…Who’s that. Come here where I can see you.', cue: cue('corridor', 'xxx.comehere'), hold: 3.6 },
    { speaker: 'HUD', stage: 'xxx.cough', hold: 1.2 },
    { speaker: 'XXX', text: 'Ah. The new kid. Course it is.', cue: cue('corridor', 'xxx.thenewkid'), hold: 3.0 },
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
    /* ---- THE PISTOL (owner playtest: *"Booski should hand me a pistol
     * when I give him the case"*).
     *
     * The mission's own order four beats later is "Handle it", and until now
     * the only gun in this house was six rooms and one floor away on a rack
     * in the armory — so the player either walked back up for it before he
     * had been told what it was for, or stood in the observation area with an
     * execution order and empty hands. Booski arms him at the delivery,
     * which is also the only moment in the mission that makes him
     * responsible for what he is about to be asked to do.
     *
     * `sidearm.give` is the stage direction; the gun itself is the house's
     * (`main.js` → `weaponSystem`), not the script's. He says nothing about
     * what it is for, because he has not decided to tell him yet. */
    { speaker: 'HUD', stage: 'sidearm.give', hold: 1.4 },
    { speaker: 'BOOSKI', text: 'Here. Hold onto this.', cue: cue('delivery', 'booski.holdontothis'), hold: 2.2 },
    { speaker: 'PROSPECT', text: 'What’s it for?', cue: cue('delivery', 'prospect.whatsitfor'), hold: 1.6 },
    { speaker: 'BOOSKI', text: 'Nothing, hopefully.', cue: cue('delivery', 'booski.nothinghopefully'), hold: 2.4 },
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
    { speaker: 'BOOSKI', text: 'He’s finished. He’s not a scientist any more, he’s a witness with a doctorate.', cue: cue('lock', 'booski.usefulnessexpired'), hold: 3.0 },
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
    { speaker: 'BOOSKI', text: 'I said do it. And now I’ve said it twice, which means from here on it isn’t an order any more, it’s a test. You understand the difference? Because the difference is your whole life.', cue: cue('execution', 'booski.isaidhandleit'), hold: 2.0 },
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
    { speaker: 'VETROV', text: 'We can build you another one. Smaller. Eight weeks. Six if you stop asking about the shielding.', cue: cue('reaction', 'vetrov.canworkforyou'), hold: 2.0, muffled: true }, // spec
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
  /**
   * SNOW IS ON THE INTERCOM UNTIL HE IS IN THE ROOM.
   *
   * Owner playtest, 2026-08-06: *"Snow must come down to the lab for his
   * clean-up lines."* He never did — Booski called him, he answered, and then
   * he said "Jesus Christ.", which is a man looking at a room full of bodies,
   * from the foyer, three floors up, having seen nothing.
   *
   * The exchange splits where it always split. The first three lines are the
   * intercom: a man answering a call and being told to bring a cart. Then
   * `snow.arrives` sends him down — the scene walks him out of the stairwell
   * with the cart (see `snowToTheBasement` in ../cast.js) — and the last two
   * are said IN the observation area, by somebody who can see the glass. The
   * hold on the stage direction is the walk.
   *
   * Not one line of text changed, so not one recording is invalidated.
   */
  snowIntercom: Object.freeze([
    // spec
    { speaker: 'BOOSKI', text: 'Snow. Basement.', cue: cue('exit', 'booski.snowbasement'), hold: 2.0 },
    // spec
    { speaker: 'SNOW', text: 'How bad?', cue: cue('exit', 'snow.howbad'), hold: 1.4 },
    { speaker: 'HUD', stage: 'booski.looksthrough', hold: 2.0 },
    // spec
    { speaker: 'BOOSKI', text: 'Bring the cart.', cue: cue('exit', 'booski.bringthecart'), hold: 1.8 },
    /* He comes down the stairwell with it. Long enough to walk in on. */
    { speaker: 'HUD', stage: 'snow.arrives', hold: 6.0 },
    // spec — and now he is standing in it
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
  /* The actual office interaction after the lab. This is not a trigger-volume
   * epilogue: the player walks back to Lou and presses E on Lou's body. Only
   * after this exchange does the mission become the quiet mansion evening. */
  louAfterLab: Object.freeze([
    { speaker: 'LOU', text: 'Things are hot right now. You’re staying here tonight.', cue: cue('exit', 'lou.hotstayingtonight'), hold: 3.2 },
    { speaker: 'LOU', text: 'Guest room’s downstairs, off the cellar hall. It’s made up.', cue: cue('exit', 'lou.guestroomdownstairs'), hold: 3.8 },
    { speaker: 'LOU', text: 'Look around if you want. Have a drink, watch a picture. Then get some sleep.', cue: cue('exit', 'lou.enjoythehouse'), hold: 4.8 },
  ]),

  /* The quiet-evening ensemble. The theatre line keys off the reel that is
   * actually in the projector; the pool exchange is a three-step E path and
   * every spoken beat remains in this catalog/manifest ledger. */
  oldStoveTheatre: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'Put something on, kid. House this size, picture still doesn’t start itself.', cue: cue('evening', 'stove.putsomethingon'), hold: 4.2 },
  ]),
  oldStoveGodfather: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'This one knows when to sit still. Leave it here.', cue: cue('evening', 'stove.godfather'), hold: 3.2 },
  ]),
  oldStoveGoodfellas: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'Good picture. Everybody talks too much. Accurate.', cue: cue('evening', 'stove.goodfellas'), hold: 3.4 },
  ]),
  oldStoveHeat: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'Turn this one up. The street part.', cue: cue('evening', 'stove.heat'), hold: 2.8 },
  ]),
  oldStoveBlow: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'I knew a guy like this. Worse shirts.', cue: cue('evening', 'stove.blow'), hold: 3.0 },
  ]),
  /* ------------------------------------------------------------------
   * THE BACK ROW OF THE THEATRE
   *
   * Owner, 2026-08-20: *"The guys in the theater absolutely need dialogue. It
   * shouldn't just be several Sasquatches silently staring at a screen like
   * they were recently unplugged."*
   *
   * Three men who have been in there forty minutes and have stopped watching
   * the film in order to argue about it. `theatreArrival` fires ONCE, when the
   * Prospect opens the door -- it is the room noticing him, not a cutscene --
   * and the three follow-ups rotate on the E prompt so a player who keeps
   * pressing gets a conversation rather than the same line back.
   *
   * The dead-guy exchange is the owner's, near enough verbatim, because the
   * joke only lands at that exact length: three lines, no explanation, and
   * Guy 3 does not defend himself.
   * ------------------------------------------------------------------ */
  theatreArrival: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'Hey, Prospect. Shut the door, you’re letting all the movie out.', cue: cue('evening', 'stove.lettingthemovieout'), hold: 3.6 },
    { speaker: 'SEFF', text: 'We’ve been watching this thing for forty minutes. I still don’t know who the bad guy is.', cue: cue('evening', 'seff.whosthebadguy'), hold: 4.4 },
    { speaker: 'LAG', text: 'It’s him.', cue: cue('evening', 'lag.itshim'), hold: 1.4 },
    { speaker: 'SEFF', text: 'No, that guy’s dead.', cue: cue('evening', 'seff.thatguysdead'), hold: 1.8 },
    { speaker: 'LAG', text: 'Exactly.', cue: cue('evening', 'lag.exactly'), hold: 1.6 },
  ]),
  theatreStanding: Object.freeze([
    { speaker: 'OLD_STOVE', text: 'You gonna stand there all night?', cue: cue('evening', 'stove.standthereallnight'), hold: 2.4 },
    { speaker: 'SEFF', text: 'Don’t invite him over here. We finally got the seats right.', cue: cue('evening', 'seff.gottheseatsright'), hold: 3.6 },
  ]),
  theatreProjector: Object.freeze([
    { speaker: 'SEFF', text: 'Lou spent more on this projector than my first house.', cue: cue('evening', 'seff.morethanmyfirsthouse'), hold: 3.6 },
    { speaker: 'LAG', text: 'You never owned a house.', cue: cue('evening', 'lag.neverownedahouse'), hold: 2.2 },
    { speaker: 'SEFF', text: 'That’s not the point.', cue: cue('evening', 'seff.thatsnotthepoint'), hold: 2.0 },
  ]),
  /* ------------------------------------------------------------------
   * LAG, WHEREVER HE IS STANDING
   *
   * Owner: *"Lag needs his own recognizable presence rather than just another
   * generic mansion NPC."* Casual, not expository — he is not a signpost and
   * he does not read the objective out. The third line does the work of the
   * EXPLORE THE MANSION objective without being it, which is why it is worth
   * having: a man telling you to go and look around is not the same thing as
   * a HUD telling you to.
   * ------------------------------------------------------------------ */
  lagHello: Object.freeze([
    { speaker: 'LAG', text: 'What’s up, Prospect? You lost already?', cue: cue('evening', 'lag.lostalready'), hold: 3.0 },
  ]),
  lagBigHouse: Object.freeze([
    { speaker: 'LAG', text: 'Big house. You’ll figure it out.', cue: cue('evening', 'lag.bighouse'), hold: 2.6 },
  ]),
  lagLookAround: Object.freeze([
    { speaker: 'LAG', text: 'Go look around. Lou’s got shit in this house I don’t think even Lou knows about.', cue: cue('evening', 'lag.golookaround'), hold: 4.6 },
  ]),
  poolGirlHello: Object.freeze([
    { speaker: 'PERFORMER', text: 'You gonna stand there looking nervous, or come say hello?', cue: cue('evening', 'performer.sayhello'), hold: 3.6 },
  ]),
  poolGirlFlirt: Object.freeze([
    { speaker: 'PROSPECT', text: 'I was trying to think of something smooth.', cue: cue('evening', 'prospect.smooth'), hold: 2.8 },
    { speaker: 'PERFORMER', text: 'Keep trying. Hold this strap instead.', cue: cue('evening', 'performer.holdthestrap'), hold: 3.0 },
  ]),
  poolGirlDressHelp: Object.freeze([
    { speaker: 'PERFORMER', text: 'There. See? Useful beats smooth.', cue: cue('evening', 'performer.useful'), hold: 2.8 },
  ]),
  /* ---- Shubes, in the LAN room, on the account ------------------------
   * Owner note, 2026-08-19: the quiet evening gained settling-in beats and
   * Shubes gained a chair -- once the mission gives way to the evening,
   * `cast.js` sits him at a LAN station with Old School RuneScape on the
   * monitor, and these are his lines about it. Bark and idle fire off the
   * post's own proximity gate like every other bark in the house; the chat
   * pair is the E press, which is also the beat the bed can count. */
  shubesLanBark: Object.freeze([
    { speaker: 'SHUBES', text: 'Careful. Forty-two million on this account, and no way to explain where the other kind came from.', cue: cue('evening', 'shubes.fortytwomillion'), hold: 5.6 },
  ]),
  shubesLanIdle: Object.freeze([
    { speaker: 'SHUBES', text: 'Strangled a guy in a parking lot last month. Came home, played three hours of this. Slept great.', cue: cue('evening', 'shubes.sleptgreat'), hold: 5.4 },
  ]),
  shubesLanChat: Object.freeze([
    { speaker: 'SHUBES', text: 'It’s called Old School RuneScape. It’s from 2007. So’s my patience — get out of my light.', cue: cue('evening', 'shubes.oldschool'), hold: 5.2 },
    { speaker: 'SHUBES', text: 'Some kid called me a noob at the Grand Exchange. If I ever find out where he lives, that’s a him problem.', cue: cue('evening', 'shubes.himproblem'), hold: 5.8 },
  ]),

  /* =================================================================== */
  /* THE HOUSE ITSELF — the people who are in it whether or not the       */
  /* mission is running.                                                  */
  /*                                                                      */
  /* Owner, 2026-08-04: "None of the characters are here." Everything     */
  /* below is a bark, not a scene: it fires once when the player comes     */
  /* near the man who says it, and it has an idle twin if he loiters. They */
  /* are played by `src/mansion/cast.js`, which owns the bodies; nothing    */
  /* here decides where anybody stands.                                    */
  /*                                                                       */
  /* THE DOCTRINE STILL APPLIES. A mob boss's house with security on the   */
  /* door, on the perimeter, on the landing and on the vault is not a joke  */
  /* the scene is making — it is the house, played entirely straight, and   */
  /* it is what makes the man hanging in the basement land.                 */
  /* =================================================================== */

  /* ---- The man on the front door. -------------------------------------
   * He stops you before you are on the top step. He does not welcome you,
   * he does not banter, and he does not soften any of it afterwards. The
   * only warmth in the whole part is that he lets you in.
   */
  gateGreeting: Object.freeze([
    { speaker: 'GATE', text: 'That’s far enough. Hands out of the pockets.', cue: cue('gate', 'doorman.farenough'), hold: 3.0 },
    { speaker: 'GATE', text: 'You’re expected. That is not the same as welcome.', cue: cue('gate', 'doorman.expected'), hold: 3.6 },
  ]),
  gateLoiter: Object.freeze([
    { speaker: 'GATE', text: 'You’re standing on a driveway I have to watch. Go in or go back down the steps.', cue: cue('gate', 'doorman.driveway'), hold: 5.0 },
  ]),
  /* He clocks the case before he clocks the face. He does not ask what is
   * in it, because he has been told not to. */
  gateCase: Object.freeze([
    { speaker: 'GATE', text: 'That stays in your hand. You don’t set it down, you don’t open it, and you don’t hand it to me.', cue: cue('gate', 'doorman.staysinyourhand'), hold: 6.0 },
  ]),
  gateWarning: Object.freeze([
    { speaker: 'GATE', text: 'Do that again and you leave the property a different way than you came onto it.', cue: cue('gate', 'doorman.differentway'), hold: 5.2 },
  ]),
  gateInside: Object.freeze([
    { speaker: 'GATE', text: 'Straight through. Don’t wander, don’t touch anything, and don’t talk to the help.', cue: cue('gate', 'doorman.straightthrough'), hold: 5.0 },
  ]),

  /* ---- The man in the booth at the street gate. -----------------------
   *
   * Owner playtest, verbatim: *"ADD a guard working that booth"*. The booth
   * had a chair in it and nobody on it, which is worse than no booth: an
   * empty guard post at the mouth of a criminal headquarters says the house
   * is not being watched, and the whole rest of the night says it is.
   *
   * `BOOTH`, on the SAME `mansion-gate` throat as the man on the door, for
   * the reason the perimeter guards share one: they are the same job at two
   * ends of the same driveway, and the owner's direction for that profile —
   * *"deadly serious and doesn't want any funny business"* — is exactly the
   * note for this part too. He is the first person in the game to speak to
   * the Prospect on this night, and he does not soften a word of it.
   */
  boothChallenge: Object.freeze([
    { speaker: 'BOOTH', text: 'Stop there. Name.', cue: cue('gate', 'booth.stopthere'), hold: 2.2 },
    { speaker: 'BOOTH', text: 'You’re on the list. That is the only reason this arm is up.', cue: cue('gate', 'booth.onthelist'), hold: 4.4 },
  ]),
  boothLoiter: Object.freeze([
    { speaker: 'BOOTH', text: 'The house is up the drive. Nobody stands at my window.', cue: cue('gate', 'booth.nobodystands'), hold: 4.0 },
  ]),
  /* He has been told what is coming up the drive and told not to look at it. */
  boothCase: Object.freeze([
    { speaker: 'BOOTH', text: 'I don’t see a case. Walk on.', cue: cue('gate', 'booth.dontseeacase'), hold: 3.0 },
  ]),
  boothTalk: Object.freeze([
    { speaker: 'BOOTH', text: 'Everything through this gate goes in the book. The plate, the time, the face.', cue: cue('gate', 'booth.inthebook'), hold: 5.2 },
    { speaker: 'BOOTH', text: 'Yours is in it now. Go on.', cue: cue('gate', 'booth.yoursisinit'), hold: 3.0 },
  ]),

  /* ---- The guards. ----------------------------------------------------
   * One voice, seven metres apart. Each of these is one flat sentence about
   * the ground the man is standing on, because that is the whole part: the
   * house is covered, and every corner of it has somebody in it who is bored
   * of being there.
   */
  guardPathBark: Object.freeze([
    { speaker: 'GUARD', text: 'Keep on the path.', cue: cue('guards', 'perimeter.path'), hold: 1.8 },
  ]),
  guardCameraBark: Object.freeze([
    { speaker: 'GUARD', text: 'You’ve been on camera since the gate.', cue: cue('guards', 'perimeter.camera'), hold: 2.6 },
  ]),
  /* The third walker, and the only perimeter line off the shared throat. His
   * profile note is written from this sentence, so the two stay together. */
  guardLapBark: Object.freeze([
    { speaker: 'GUARD_PERIMETER', text: 'Long walk, this. I do it eleven times a night.', cue: cue('guards', 'perimeter.elevenlaps'), hold: 3.6 },
  ]),
  /* Top of the horseshoe, facing the front doors, all night. */
  guardStairsBark: Object.freeze([
    { speaker: 'GUARD_STAIRS', text: 'I can see the gate from up here.', cue: cue('guards', 'stairs.seethegate'), hold: 2.4 },
  ]),
  guardStairsIdle: Object.freeze([
    { speaker: 'GUARD_STAIRS', text: 'Nobody comes up these unless he says so.', cue: cue('guards', 'stairs.nobodycomesup'), hold: 3.0 },
  ]),
  /* Down past the armory, where the house stops pretending to be a house. */
  guardBasementBark: Object.freeze([
    { speaker: 'GUARD_BASEMENT', text: 'Nothing down here belongs to you.', cue: cue('guards', 'basement.nothingyours'), hold: 2.6 },
  ]),
  guardBasementIdle: Object.freeze([
    { speaker: 'GUARD_BASEMENT', text: 'Keep walking. Whatever you heard down here, you heard the boiler.', cue: cue('guards', 'basement.keepwalking'), hold: 1.4 },
  ]),
  /* Eleven inches of steel, standing open, and a man in front of it. */
  guardVaultBark: Object.freeze([
    { speaker: 'GUARD_VAULT', text: 'The door stays open. I stay here. That’s the arrangement.', cue: cue('guards', 'vault.arrangement'), hold: 4.2 },
  ]),
  guardVaultIdle: Object.freeze([
    { speaker: 'GUARD_VAULT', text: 'Back up. I don’t get told what’s in there either, and I’ve stopped wanting to know.', cue: cue('guards', 'vault.backup'), hold: 1.4 },
  ]),

  /* ---- The guards, THE MORNING AFTER. ---------------------------------
   *
   * Owner playtest, verbatim: *"Repaired mansion is really just the same
   * thing as the original mansion. The guards should have some voicelines
   * acknowledging your actions. Welcome back, nice work the other night.
   * Etc."*
   *
   * He was right and the reason was structural rather than an oversight. The
   * return visit re-mounted the SAME cast module with the same barks, so five
   * men who had watched the player fight a war through this house on the
   * night of the siege greeted him the next morning with "Keep on the path"
   * and "Nothing down here belongs to you" -- the house had not noticed.
   *
   * Each of these is the same man on the same square of floor as his mission
   * line, saying the one thing that square earned. Nobody makes a speech: the
   * stairs man still will not look at you, the vault man still will not tell
   * you what is in there. They just know who you are now.
   *
   * `cue('return', ...)` is its own scope, so the recording sheet lists them
   * as a block and no take of a mission line gets reused for one.
   */
  /* Owner, 2026-08-26: the wrong city is never acknowledged aboard the
   * Enola. Lou reveals it here, at the repaired mansion, then delivers the
   * Sauce and palace facts in that order. The instrument line is the payoff
   * for the quiet ORDER / NAV discrepancy in the cockpit. Mark stays unnamed
   * until his boss fight; this is A-Team leadership's estate and nothing more
   * specific. Grim absurdity, played straight. */
  returnBriefing: Object.freeze([
    { speaker: 'LOU', text: 'Sit down. The instrument was right. Our briefing wasn’t. We bombed the wrong fucking city.', cue: cue('return', 'briefing.lou.instrument'), hold: 4.8 },
    { speaker: 'PROSPECT', text: 'The whole city?', cue: cue('return', 'briefing.prospect.wholecity'), hold: 1.8 },
    { speaker: 'LOU', text: 'Every pound of it. Squatchbourg is a crater. The A-Team’s desert compound is still exactly where it was.', cue: cue('return', 'briefing.lou.compoundstanding'), hold: 5.2 },
    { speaker: 'LOU', text: 'While we were admiring the hole, Sauce went missing.', cue: cue('return', 'briefing.lou.saucemissing'), hold: 3.2 },
    { speaker: 'PROSPECT', text: 'They took him?', cue: cue('return', 'briefing.prospect.tookhim'), hold: 1.8 },
    { speaker: 'LOU', text: 'His restaurant burner and one of their estate gate logs put his name at an A-Team leadership estate. Could be a prisoner, could be a guest. You are going there tonight and finding out.', cue: cue('return', 'briefing.lou.estate'), hold: 7.2 },
  ]),

  guardPathReturn: Object.freeze([
    { speaker: 'GUARD', text: 'Walk wherever you want today.', cue: cue('return', 'perimeter.wherever'), hold: 2.4 },
  ]),
  guardCameraReturn: Object.freeze([
    { speaker: 'GUARD', text: 'Cameras are back up. Took them all night.', cue: cue('return', 'perimeter.camerasback'), hold: 3.0 },
  ]),
  guardLapReturn: Object.freeze([
    { speaker: 'GUARD_PERIMETER', text: 'Eleven laps and I still missed the whole thing. Story of my life.', cue: cue('return', 'perimeter.missedit'), hold: 4.2 },
  ]),
  guardStairsReturn: Object.freeze([
    { speaker: 'GUARD_STAIRS', text: 'Welcome back. He’s expecting you.', cue: cue('return', 'stairs.welcomeback'), hold: 2.8 },
  ]),
  guardStairsReturnIdle: Object.freeze([
    { speaker: 'GUARD_STAIRS', text: 'Nice work the other night. I mean that.', cue: cue('return', 'stairs.nicework'), hold: 3.0 },
  ]),
  guardBasementReturn: Object.freeze([
    { speaker: 'GUARD_BASEMENT', text: 'Go where you like. After the other night you’ve earned the run of it.', cue: cue('return', 'basement.runofit'), hold: 4.4 },
  ]),
  guardBasementReturnIdle: Object.freeze([
    { speaker: 'GUARD_BASEMENT', text: 'They came down these stairs at me. I got two. You got the rest.', cue: cue('return', 'basement.gottwo'), hold: 4.4 },
  ]),
  guardVaultReturn: Object.freeze([
    { speaker: 'GUARD_VAULT', text: 'Door’s still open. I’m still here. Different reason now.', cue: cue('return', 'vault.differentreason'), hold: 4.0 },
  ]),
  guardVaultReturnIdle: Object.freeze([
    { speaker: 'GUARD_VAULT', text: 'Whatever you did upstairs, nobody got past me down here. Not that night.', cue: cue('return', 'vault.nobodygotpast'), hold: 4.6 },
  ]),

  /* ---- Snow, the morning after. ---------------------------------------
   *
   * Owner, same note: *"I want some things to be repaired. Like maybe the
   * centerpiece in the foyer is clearly still half broken and being repaired.
   * Maybe Snow is working on it as a maintenance man -- lets give him a
   * maintenance outfit and a voice line about how long its going to take to
   * get everything fixed up."*
   *
   * He is the man who said "Try not to make more work for me tonight" on the
   * way in, on the night that turned into the siege. This is the bill. */
  snowRepairFoyer: Object.freeze([
    { speaker: 'SNOW', text: 'Six weeks. That’s what the man quoted me for the foyer alone.', cue: cue('return', 'snow.sixweeks'), hold: 4.2 },
  ]),
  snowRepairIdle: Object.freeze([
    { speaker: 'SNOW', text: 'I told you not to make more work for me. Nobody listens.', cue: cue('return', 'snow.nobodylistens'), hold: 4.0 },
  ]),
  snowRepairSecond: Object.freeze([
    { speaker: 'SNOW', text: 'Marble you can’t patch. It has to come out and go back in.', cue: cue('return', 'snow.marblecomesout'), hold: 4.2 },
    { speaker: 'SNOW', text: 'Ask me at Christmas.', cue: cue('return', 'snow.askmeatchristmas'), hold: 2.2 },
  ]),

  /* ---- The bar in the billiard bay. -----------------------------------
   * The Bada Bing's own bartender, working a private room for the night. He
   * is not impressed by any of this and he is not going to be.
   */
  bartenderBark: Object.freeze([
    { speaker: 'BARTENDER', text: 'You want something, or are you working?', cue: cue('bar', 'bartender.orworking'), hold: 3.0 },
  ]),
  bartenderIdle: Object.freeze([
    { speaker: 'BARTENDER', text: 'It’s the same bottle it was ten minutes ago.', cue: cue('bar', 'bartender.samebottle'), hold: 3.2 },
  ]),
  bartenderJack: Object.freeze([
    { speaker: 'BARTENDER', text: 'Fifteen bottles back there and every one of them is Jack And Daniels. Makes the job simple.', cue: cue('bar', 'bartender.fifteenbottles'), hold: 5.4 },
  ]),

  /* ---- The interrogation area, before the mission gets there. ----------
   *
   * Owner, verbatim: "Lets add one of the charcaters down here in charge of
   * the torture and he aasks you as you walk by if you want to take a whack
   * at him? Maybe Gratin again (thjats the joke always having Gratin
   * torutuing people) ... and XXX says some shit about fmaily".
   *
   * So: Gratin is at work, the way a man is at work. He offers the player a
   * turn the way you would offer somebody the last of the chips. THE SCENE
   * DOES NOT FIND THIS FUNNY — Gratin has a pan on upstairs and this is the
   * second job of his evening. The running gag is carried by the Prospect
   * noticing that it is ALWAYS him, and by Gratin's answer, which is a man
   * explaining his own competence and is not a punchline.
   */
  tortureGreeting: Object.freeze([
    { speaker: 'GRATIN', text: 'Give us a minute. He’s nearly conversational.', cue: cue('torture', 'gratin.conversational'), hold: 3.4 },
  ]),
  /* The running gag, and the only line in the beat that is aware of itself —
   * and it is aware of the GAME's joke, not the film's. Nobody winks. */
  tortureAlwaysYou: Object.freeze([
    { speaker: 'PROSPECT', text: 'It’s always you doing this.', cue: cue('torture', 'prospect.alwaysyou'), hold: 2.4 },
    { speaker: 'GRATIN', text: 'I’m good at it, and the kitchen’s dead this time of night.', cue: cue('torture', 'gratin.kitchensdead'), hold: 4.0 },
  ]),
  /* The offer. The HUD says which button in this sequence's `onDone`, never
   * over the top of him — docs/TONE-AND-PARODY.md, the sayThenInstruct rule. */
  tortureOffer: Object.freeze([
    { speaker: 'GRATIN', text: 'You want a go? Everybody gets one. It keeps him talking.', cue: cue('torture', 'gratin.youwantago'), hold: 4.2 },
  ]),
  /* ---- THE HANDOVER ----------------------------------------------------
   *
   * Owner playtest, 2026-08-05, verbatim: *"I could only whip Xxx once and it
   * was when I clicked on gratin, gratin should give me the whip then I can
   * just click on XXX to do it."*
   *
   * So clicking Gratin is no longer a swing. It is a man passing you a tool
   * and telling you how to use it, and it happens once. What you do with it
   * afterwards is between you and the man on the rope.
   */
  tortureHandover: Object.freeze([
    { speaker: 'GRATIN', text: 'Here. It’s a cord, not a bat — let the end of it do the work.', cue: cue('torture', 'gratin.letthetenddoit'), hold: 4.4 },
  ]),
  tortureIdle: Object.freeze([
    { speaker: 'GRATIN', text: 'I’ve got a pan on upstairs. Take your turn or don’t.', cue: cue('torture', 'gratin.panonupstairs'), hold: 3.8 },
  ]),
  tortureDeclined: Object.freeze([
    { speaker: 'GRATIN', text: 'Suit yourself. He’s not going anywhere.', cue: cue('torture', 'gratin.suityourself'), hold: 3.0 },
  ]),
  /* ---- THE SWING, AND EVERY SWING AFTER IT -----------------------------
   *
   * Owner: *"Need an ouch or a scream reaction then the voice line."*
   *
   * THE ORDER IS THE WHOLE POINT AND IT IS WRITTEN INTO THE SEQUENCE. Each of
   * these opens with a noise rather than a sentence. The noise is involuntary
   * — it is what a body does when it is hit, and he has no say in it. The
   * line after it is him CHOOSING to speak, which is a different act, and
   * putting them the other way round turns a man being beaten into a man
   * doing a bit. The cast module fires the impact, the blood and the crack on
   * the frame the cord lands, which is the frame the first line here plays.
   *
   * The stage direction is where the cord actually moves; the cast module
   * drives it and nothing here decides how a whip works.
   */
  /* THE FIRST HIT IS THE SPEC'S LINE.
   *
   * Owner playtest: *"the xXx family line should be on the first hit"*. The
   * brief's two quoted lines used to be a proximity bark you got for walking
   * down the corridor (`xxxHanging`), which spent them on nothing — and they
   * are the entire reason this character is hanging in this basement. Now
   * they are what he says the first time somebody in this family hits him,
   * and the involuntary noise still comes first because being hit is not a
   * decision. Same two cues, so the recorded takes carry across.
   *
   * "You hit like family" moved to the SECOND hit, where it is a reply
   * rather than a competing thesis. */
  tortureSwing: Object.freeze([
    { speaker: 'HUD', stage: 'cord.swing', hold: 0.8 },
    { speaker: 'XXX', text: 'Hn — GHK—', cue: cue('torture', 'xxx.ouchone'), hold: 1.2 },
    // spec
    { speaker: 'XXX', text: 'You can take the car… you can take the mission…', cue: cue('corridor', 'xxx.takethecar'), hold: 3.4 },
    { speaker: 'HUD', stage: 'xxx.cough', hold: 1.2 },
    // spec
    { speaker: 'XXX', text: 'But you don’t turn your back on family.', cue: cue('corridor', 'xxx.turnyourback'), hold: 3.0 },
    { speaker: 'GRATIN', text: 'See? He’s fine.', cue: cue('torture', 'gratin.hesfine'), hold: 2.0 },
  ]),
  /* The second, the third and the fourth, cycled from the fourth onward. He
   * does not get funnier and he does not break; he gets quieter, and the
   * count is the only thing he is keeping. */
  tortureSwingTwo: Object.freeze([
    { speaker: 'HUD', stage: 'cord.swing', hold: 0.8 },
    { speaker: 'XXX', text: 'Agh — Christ—', cue: cue('torture', 'xxx.ouchtwo'), hold: 1.4 },
    { speaker: 'XXX', text: 'You hit like family.', cue: cue('torture', 'xxx.hitlikefamily'), hold: 2.4 },
    { speaker: 'XXX', text: 'That’s not a compliment. That’s just what they do.', cue: cue('torture', 'xxx.notacompliment'), hold: 4.0 },
    { speaker: 'XXX', text: 'There it is. You’ve got the elbow into it now.', cue: cue('torture', 'xxx.theelbow'), hold: 3.6 },
  ]),
  tortureSwingThree: Object.freeze([
    { speaker: 'HUD', stage: 'cord.swing', hold: 0.8 },
    { speaker: 'XXX', text: 'Hhh—!', cue: cue('torture', 'xxx.ouchthree'), hold: 1.0 },
    { speaker: 'XXX', text: 'Go on. Nobody in this house has ever stopped at one.', cue: cue('torture', 'xxx.stoppedatone'), hold: 4.2 },
  ]),
  tortureSwingFour: Object.freeze([
    { speaker: 'HUD', stage: 'cord.swing', hold: 0.8 },
    { speaker: 'XXX', text: 'Nn—! …Ah.', cue: cue('torture', 'xxx.ouchfour'), hold: 1.6 },
    { speaker: 'XXX', text: 'That one’s going to be there in the morning.', cue: cue('torture', 'xxx.inthemorning'), hold: 3.4 },
    { speaker: 'GRATIN', text: 'He’s counting. He always counts.', cue: cue('torture', 'gratin.hecounts'), hold: 3.0 },
  ]),
  /* THE HOUSE RULE IS ABOUT THE CORD, NOT ABOUT THE MAN.
   *
   * This used to fire on a second SWING, which made the rule "one hit" and
   * left the player holding a whip that had stopped working. It is now the
   * answer to asking Gratin for a second HANDOVER — he gave you your turn,
   * you have it, and he is not fetching another one. */
  tortureOneEach: Object.freeze([
    { speaker: 'GRATIN', text: 'One each. House rule.', cue: cue('torture', 'gratin.oneeach'), hold: 2.2 },
  ]),

  /* =================================================================== */
  /* THE REST OF THE FAMILY, USING THE HOUSE                              */
  /*                                                                      */
  /* Owner, 2026-08-05: "Everyone should be there for the most part       */
  /* utilizing the house hanging out." Four rooms the house built and     */
  /* never put anybody in: the bar in the billiard bay, the terrace over  */
  /* the pool, the kitchen and the conference room.                        */
  /*                                                                       */
  /* THESE ARE THE ONLY BARKS THE CAST MODULE FIRES ITSELF. Everybody the  */
  /* mission has a zone for — Rippin, Eric, Shubes, Snow, Lou, Booski,     */
  /* Irish, DeathMegatron — keeps the words the mission already plays for   */
  /* them, because two controllers on one man says his line twice.         */
  /* =================================================================== */

  /* The bar in the billiard bay, on the stool nearest the service end. He is
   * not working tonight, and that is the entire character. */
  sasoleBar: Object.freeze([
    { speaker: 'SASOLE', text: 'I’m not flying anything tonight, so don’t look at me like that.', cue: cue('house', 'sasole.notflying'), hold: 4.4 },
  ]),
  sasoleIdle: Object.freeze([
    { speaker: 'SASOLE', text: 'Whatever’s in the case, I didn’t carry it and I didn’t see it.', cue: cue('house', 'sasole.didntseeit'), hold: 4.6 },
  ]),

  /* The terrace over the pool. He is enormous, he is outside in the dark, and
   * he has been sent out here to stand where he can see the water. */
  numbskullTerrace: Object.freeze([
    { speaker: 'NUMBSKULL', text: 'Nobody swims. It’s heated and nobody swims.', cue: cue('house', 'numbskull.nobodyswims'), hold: 3.8 },
  ]),
  numbskullIdle: Object.freeze([
    { speaker: 'NUMBSKULL', text: 'I like it out here. You can hear the gate.', cue: cue('house', 'numbskull.hearthegate'), hold: 3.4 },
  ]),

  /* The kitchen, on a stool at the island, because the kitchen is where
   * people actually end up and Gratin has left his pan on. */
  hogmamaKitchen: Object.freeze([
    { speaker: 'HOGMAMA', text: 'There’s food. Nobody in this house eats, but there’s food.', cue: cue('house', 'hogmama.theresfood'), hold: 4.4 },
  ]),
  hogmamaIdle: Object.freeze([
    { speaker: 'HOGMAMA', text: 'Gratin left a pan on and went downstairs. Again.', cue: cue('house', 'hogmama.leftapanon'), hold: 3.8 },
  ]),

  /* The conference room, in a chair he was not invited into, at a table
   * nobody is sitting at. */

  /* =================================================================== */
  /* THE BILLIARD TABLE                                                   */
  /*                                                                       */
  /* Rippinflow's look string has said "who has not taken a shot in twenty */
  /* minutes" since the day the cast was posted, and until now that was a  */
  /* joke with nothing behind it -- there was no game, so there was no      */
  /* shot he could have taken. These are the lines that make the joke true: */
  /* he racks, he plays, he is smug when he pots and he is worse when he    */
  /* loses, and he says something about it either way.                      */
  /*                                                                        */
  /* SCOPE `house`, NOT A NEW ONE. src/mansion/audio-banks.js banks the      */
  /* scopes and `house` is in the START bank, so a man who is standing at    */
  /* that table from the first frame can speak from the first frame. A new   */
  /* scope would have needed banking, and an unbanked scope is a scene that  */
  /* talks over a synth. The table is reachable during the mission and long  */
  /* after it, which is exactly the ground the start bank covers.             */
  /* =================================================================== */

  /* He has been waiting for somebody to pick the other cue up. */
  poolRacked: Object.freeze([
    { speaker: 'RIPPIN', text: 'Finally. Rack’s been sitting there so long it’s got a lease.', cue: cue('house', 'rippin.pool.finally'), hold: 4.0 },
    { speaker: 'RIPPIN', text: 'You break. And don’t be gentle with it, this isn’t church.', cue: cue('house', 'rippin.pool.youbreak'), hold: 4.2 },
  ]),
  /* Back to a frame he walked out on. */
  poolResumed: Object.freeze([
    { speaker: 'RIPPIN', text: 'Look who remembered where he left the table.', cue: cue('house', 'rippin.pool.remembered'), hold: 3.4 },
  ]),
  /* The player pots one of his own. */
  poolPlayerPots: Object.freeze([
    { speaker: 'RIPPIN', text: 'Alright. That one went in on purpose, I’ll allow it.', cue: cue('house', 'rippin.pool.onpurpose'), hold: 4.0 },
  ]),
  /* The player misses and hands the table over. */
  poolPlayerMisses: Object.freeze([
    { speaker: 'RIPPIN', text: 'Nothing. Twenty minutes I waited for that.', cue: cue('house', 'rippin.pool.nothing'), hold: 3.6 },
  ]),
  /* The player fouls. Ball in hand, and he enjoys it. */
  poolPlayerFouls: Object.freeze([
    { speaker: 'RIPPIN', text: 'Foul. Ball in my hand, and now we’re playing my game.', cue: cue('house', 'rippin.pool.ballinhand'), hold: 4.4 },
  ]),
  /* He steps up to the table. */
  poolHisTurn: Object.freeze([
    { speaker: 'RIPPIN', text: 'Move. You’re standing in the shot.', cue: cue('house', 'rippin.pool.movestanding'), hold: 3.0 },
  ]),
  /* He pots one. */
  poolHePots: Object.freeze([
    { speaker: 'RIPPIN', text: 'That’s the wrist. You can’t teach the wrist.', cue: cue('house', 'rippin.pool.thewrist'), hold: 3.6 },
  ]),
  /* He misses, which is somebody else's fault. */
  poolHeMisses: Object.freeze([
    { speaker: 'RIPPIN', text: 'Table’s crooked. Lou paid nine grand for a crooked table.', cue: cue('house', 'rippin.pool.crookedtable'), hold: 4.4 },
  ]),
  /* He wins the frame. */
  poolHeWins: Object.freeze([
    { speaker: 'RIPPIN', text: 'And that’s the frame. Don’t look at me like that, you were there the whole time.', cue: cue('house', 'rippin.pool.thatstheframe'), hold: 5.2 },
    { speaker: 'RIPPIN', text: 'Rack ’em again, prospect. I’ve got all night and you’ve got nowhere to be.', cue: cue('house', 'rippin.pool.rackemagain'), hold: 5.0 },
  ]),
  /* He loses the frame, and it is important that he take it badly. */
  poolHeLoses: Object.freeze([
    { speaker: 'RIPPIN', text: 'Okay. Okay. That was one frame and it doesn’t count.', cue: cue('house', 'rippin.pool.doesntcount'), hold: 4.4 },
    { speaker: 'RIPPIN', text: 'Nobody in this house hears about this. Nobody.', cue: cue('house', 'rippin.pool.nobodyhears'), hold: 4.0 },
  ]),
  /* The player puts the cue back down with the frame still on. */
  poolWalksOff: Object.freeze([
    { speaker: 'RIPPIN', text: 'Sure. Leave it there. I’ll just keep standing here, it’s what I do.', cue: cue('house', 'rippin.pool.leaveitthere'), hold: 4.8 },
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
  /* ---- THE WALK OUT, IN THE TWO LEGS IT ACTUALLY HAS.
   *
   * Owner playtest, 2026-08-06, verbatim: *"Objective says 'return to the
   * cellar', voice lines say return to Lou, Booski says go upstairs —
   * reconcile the flow so the player knows what to do."*
   *
   * He was reading three different destinations off one beat, and none of the
   * three agreed with the fourth thing — where the mission actually ended,
   * which was the top of the stairwell in the cellar, nowhere near Lou:
   *
   *   Booski says      "Upstairs. Lou's still awake."
   *   the objective    "Return upstairs."      (upstairs from WHERE, to WHAT)
   *   the instruction  "Go back up the stairwell to the cellar."
   *   the mission      completed at the cellar and said nothing else
   *
   * They all say the same thing now, and the thing they say is where the beat
   * really ends: Lou's office. The objective NAMES THE MAN from the moment
   * Booski gives the order, and changes at the top of the stairs to name the
   * room, so it is a progress report rather than a repeated instruction. The
   * step-by-step is the INSTRUCTIONS below, which is the split this file has
   * always used: the objective is what he is doing, the instruction is what to
   * press next. */
  REPORT_TO_LOU: 'Report back to Lou. He is still awake.',
  LOU_IS_WAITING: 'Report to Lou in his office, upstairs.',
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
  /* The two legs of the walk out, in order. Neither of them contradicts the
   * objective any more: the objective says LOU and these say which stair. */
  RETURN_UPSTAIRS: 'Go back up the stairwell to the cellar.',
  RETURN_TO_OFFICE: 'Up the main stairs to Lou’s office, past the boardroom.',
  TALK_TO_LOU: 'Press E on Lou in his office.',
  /* Gratin's offer, in the two steps it actually has. Raised in the relevant
   * sequence's `onDone`, after he has finished speaking — never on the same
   * frame as the question. The first replaced a single `TAKE_A_SWING` that
   * said "press E to take your swing" while pointing at GRATIN, which is how
   * a player ends up believing the whip only works once: the swing and the
   * handover were the same button on the same man. */
  TAKE_THE_CORD: 'Press E on Gratin to take the cord.',
  SWING_THE_CORD: 'Press E on xXx to swing it. As often as you like.',
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
  /* EMPTY, and that is the finished state.
   *
   * The owner supplied every id on 2026-08-04 and they are all in the
   * manifest's `voices` block:
   *
   *   xxx           the man on the rope. Battered, unbothered, one octave
   *                 lower than he can hold.
   *   vetrov        nervous technician — 11 lines, the most of any scientist
   *   orlova        junior assistant — 11 lines, the youngest in the room
   *   sokolov       weapons engineer — 10 lines, warm, loves the machine
   *   marchuk       medical specialist — 9 lines, the only one watching people
   *   bezmenov      the cynical old one — 7 lines, flat, expects the worst
   *   labcomputer   the annunciator. Two lines and both of them are terrible.
   *   mansion-gate  the man on the front door. Low, clipped, humourless, and
   *                 never raised — he has never once had to shout.
   *   mansion-guard everybody else in that suit. The flattest reading on the
   *                 roster, on purpose: WHERE a man is standing does the
   *                 characterisation, and the reading must not try to.
   *
   * Doctor Aubbie is deliberately NOT recast. He is the same Aubbie the
   * player drinks with — one stable id, one face, one voice, every scene —
   * and he already has eight recorded takes as a Family member.
   *
   * Leave the array in place rather than deleting the export: the test that
   * allows exactly these names to be missing is what catches a casting typo,
   * and an empty allow-list is the strictest version of it. */
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

/**
 * Everything anybody says on The Enola Squatch.
 *
 * Same shape as the Beef Run's own src/beefrun/script.js on purpose — a beat
 * is an ordered list of {who, text, hold}, mission code plays a beat by id,
 * and dialogue is never gated on a recording existing. One deliberate
 * extension: BARKS entries here are {who, text} pairs rather than bare
 * strings, because this crew is four people talking over each other, not
 * one pilot narrating to himself — Irish calls headings, Shubes mutters at
 * the gun, Numbskull talks to the target. See ../DialogueSystem.js for the
 * player that consumes this shape.
 *
 * `who` is one of: SASOLE, PROSPECT, IRISH, NUMBSKULL, SHUBES, LOU.
 *
 * SASOLE/IRISH/NUMBSKULL/SHUBES are all existing, voice-locked campaign
 * characters (captain_lou_sasole, irish, numbskull, shubenator — see
 * src/core/characters.js and assets/sfx/manifest.json's voices block).
 * Nothing here mints a new voice id; SHUBES resolves to the `shubenator`
 * profile the same way src/beefrun's own SASOLE resolves to `lou2`.
 */

export const SPEAKERS = {
  SASOLE: { name: 'CAPTAIN LOU SASOLE', colour: '#e8c86a', voice: 'lou2' },
  PROSPECT: { name: 'PROSPECT', colour: '#cfd4e0', voice: 'player' },
  IRISH: { name: 'IRISH', colour: '#8ab4d9', voice: 'irish' },
  NUMBSKULL: { name: 'NUMBSKULL', colour: '#d9a25a', voice: 'numbskull' },
  SHUBES: { name: 'THE SHUBENATOR', colour: '#b49ad9', voice: 'shubenator' },
  LOU: { name: 'BIG UNCLE LOU', colour: '#e8c86a', voice: 'lou1' },
};

const L = (text, hold) => ({ who: 'SASOLE', text, hold });
const P = (text, hold) => ({ who: 'PROSPECT', text, hold });
const I = (text, hold) => ({ who: 'IRISH', text, hold });
const N = (text, hold) => ({ who: 'NUMBSKULL', text, hold });
const H = (text, hold) => ({ who: 'SHUBES', text, hold });
const U = (text, hold) => ({ who: 'LOU', text, hold });

export const BEATS = {
  /* ---------------- The call, before the mission scene opens ---------------- */

  'call.opening': [
    U('Remember that little delivery flight?', 2.4),
    P('The jerky run?', 1.8),
    U('This one’s heavier.', 2.6),
  ],

  /* ---------------- Hangar / arrival ---------------- */

  'hangar.reveal': [
    L('There she is. The Enola Squatch.', 2.6),
    P('Why does she have purple stripes?', 2.2),
    L('Morale.', 1.6),
    P('And the nose art?', 2.0),
    L('More morale.', 1.8),
  ],

  /* ---------------- Preflight ----------------
   *
   * These were written for a walkaround that did not exist yet: until
   * 2026-08-04 the preflight phase ran entirely from the left seat and fired
   * them off a phase timer, so `preflight.numbskull` — a line whose whole joke
   * is that Tony can see where Numbskull is standing — played while Tony was
   * strapped in and facing the other way. `preflight.js` now walks him round
   * the aeroplane and every one of them fires off the thing it is about. The
   * lines below are the new ones that walk needs; the four that were already
   * here are unchanged. */

  'preflight.arrival': [
    L('There she is. Walk her with me before you get in — I am not signing for anything you did not look at.', 4.6),
    P('All of it?', 1.6),
    L('All of it. Chocks, all four fans, the bay, the bomb, the tail.', 3.6),
  ],

  'preflight.numbskull': [
    P('Should you be standing under that?', 2.4),
    N('Probably not.', 2.0),
  ],

  'preflight.chocks': [
    L('Chocks first. Two of them, and both of them come out, because I have seen what happens when it is one.', 4.4),
  ],

  'preflight.props': [
    L('Pull each one through by hand. Four engines means four times, not one time with feeling.', 4.0),
  ],

  'preflight.props.all': [
    P('All four turn.', 1.6),
    L('All four turning is the low bar. All four turning at the same time is the job.', 3.6),
  ],

  'preflight.payload.look': [
    I('That is the Fat Squatch. Do not lean on it, do not sit on it, do not put your coffee on it.', 4.2),
  ],

  /* The bomb is on a trolley on the concrete now, not strapped under a belly
   * three metres up, so the old "pull on the strap" prod no longer describes
   * anything the player can do. Hold the key: it is going in the aeroplane. */
  'preflight.payload.tap': [
    N('Hold the key down. You do not load one of these with a tap.', 3.2),
  ],

  'preflight.bombbay.tap': [
    N('Give it a proper look, not a glance. It is a panel, not a painting.', 3.2),
  ],

  'preflight.surfaces': [
    L('Move the elevator. If it moves, it is connected. If it does not, we have a much shorter evening.', 4.2),
  ],

  'preflight.done': [
    L('That is the walk. Nothing on this aeroplane is a surprise now, which is the most I have ever been able to say about it.', 5.0),
    I('Door is open, Prospect. Left seat. Yours is the one on the left as she sits, not as you look at her.', 4.4),
  ],

  'preflight.board': [
    L('Get in. Mind the ladder — it is the newest part of the aircraft and I do not trust it either.', 4.2),
  ],

  'preflight.chocksStill': [
    L('Chocks are still in. She will run up beautifully and go absolutely nowhere.', 3.6),
  ],

  'preflight.restraints': [
    I('Payload secure?', 1.8),
    N('Secure enough.', 2.2),
  ],

  /* LOAD FAT SQUATCH. The bomb comes off its trolley and goes into the bay,
   * which is a five-second animation and about four seconds of this. The old
   * `preflight.restraints` beat above is kept: it is what Irish and Numbskull
   * say once the thing is actually hanging in there — and since 2026-08-20 it
   * is fired from exactly there, off `BombTrolley.onLoaded` (see the LOAD FAT
   * SQUATCH block in `../preflight.js`). For a day it was kept but not spoken:
   * the trolley took over the payload check and nothing inherited the beat's
   * trigger, so on the walked route the two lines simply never played. */
  'preflight.loadSquatch': [
    L('Load it. Slowly. It is the only one we brought.', 3.2),
    N('Bringing her under. Mind your feet.', 2.8),
    I('Six thousand pounds of somebody’s idea.', 2.8),
    N('Shackles closed. Braces on. That is a bomb in a bomb bay.', 3.6),
  ],

  'preflight.bombbay': [
    L('Bomb-bay panel closed and pinned?', 2.4),
    N('Closed. Pinned is a strong word.', 2.8),
  ],

  'preflight.shubes.first': [
    H('Hey guys, what’s going on?', 2.0),
    L('How did you get on this aircraft?', 2.4),
    H('You left the back open.', 2.2),
    I('That is not an answer, that is a confession.', 2.6),
  ],

  /* He gets on. Owner, 2026-08-19: keep the running gag — "everyone is already
   * strapped into a bomber carrying the Fat Squatch and he wanders aboard like
   * a man five minutes late to a Zoom call". So the line that opens this beat
   * is the same line he opens every beat with, and nobody acknowledges that it
   * is the third time. `crew.sendShubesAboard()` fires it when he actually
   * reaches the crew door, not when he sets off. */
  'preflight.shubes.aboard': [
    H('Hey guys, what’s going on?', 2.0),
    L('You were at the back of the aeroplane forty seconds ago.', 3.2),
    H('Yeah. I came round the front. It’s more polite.', 3.0),
    I('He has used the door. I want that in the log.', 3.0),
  ],

  'preflight.engineStart': [
    L('Start sequence. One, then two.', 2.4),
    L('Three and four are yours, Prospect. Don’t be gentle, be correct.', 3.2),
  ],

  /* ---------------- Sasole's walkaround patter ----------------
   *
   * 2026-08-04, owner note: "Lets give Sasole a new set of precheck whippy
   * snappy voice lines like he has in the other one." The model is the Beef
   * Run's own `preflight.*` block in `src/beefrun/script.js` (lines 119-145) —
   * short, dry, one idea per line, the punchline landing on a noun. The block
   * above is the INSTRUCTION half of each check ("do this, here is why"), and
   * it stays exactly as it was. This block is the REACTION half: one clipped
   * Sasole line the moment the check is actually finished, which is where the
   * Beef Run gets its rhythm from (`preflight.chocks` -> `preflight.chocks.done`,
   * `preflight.drain` -> `preflight.drain.clear`). `preflight.js` fires these
   * from the same `onUse` that completes the task, so they can never play at a
   * part the player has not touched.
   *
   * The four propeller reactions are deliberately four separate beats rather
   * than one repeated line: the joke of this airframe is that there are four
   * of everything, and a man saying the same sentence four times is a bug,
   * not a gag. */

  'preflight.sasole.chocksDone': [
    L('Both of them. There are always two, and there is always a pilot who found out there were two.', 4.4),
  ],

  'preflight.sasole.propOne': [
    L('One. Nine more blades to go, Prospect.', 2.4),
  ],

  'preflight.sasole.propTwo': [
    L('Two. This is the part of aviation nobody puts on a poster.', 3.2),
  ],

  'preflight.sasole.propThree': [
    L('Three. If one of these bites you, we are down a bombardier and a hand.', 3.6),
    N('I am the bombardier.', 1.8),
    L('Then be careful for both of us.', 2.4),
  ],

  'preflight.sasole.propFour': [
    L('Four. Every fan turns, nothing is seized, nobody is bleeding. Best preflight I have had all year.', 4.6),
  ],

  'preflight.sasole.bayDone': [
    L('Panel is on. That is not the same as the panel being right, but it is the half I can see.', 4.2),
  ],

  'preflight.sasole.payloadDone': [
    L('Straps are tight. That bomb goes out of this aeroplane once, on purpose, over somebody else.', 4.4),
  ],

  'preflight.sasole.tailDone': [
    L('Gun swings, ammunition is in it, and there is a Shubenator attached. Two of those I asked for.', 4.4),
  ],

  'preflight.sasole.surfacesDone': [
    L('Elevator moves the way the wheel tells it to. Small thing. Only matters every second we are up.', 4.4),
  ],

  /* Fired by `MissionController.updateWalkaround()` when the walk is finished
   * and the player has not gone to the door — see the boarding-guidance note
   * over `armBoardingTarget()`. Sasole says where the door IS, which is the
   * one thing none of the existing lines do. */
  'preflight.sasole.boardNudge': [
    L('Door is on the port side, behind the wing, with a ladder under it. Follow the marker, Prospect.', 4.6),
    L('I will be in the right seat pretending I did not have to say that.', 3.2),
  ],

  /* ---------------- Nightfall: the cut from apron to runway ----------------
   *
   * 2026-08-04, owner note: "its also daytime. Is it going to turn night when
   * we take off after we do the precheck maybe a cutscene where it turns to
   * night and we are in the plane on the runway for takeoff?" — these are the
   * lines over that cut. Written to be readable while the sky is doing the
   * work, i.e. nobody says anything that needs a picture to explain it. */

  'nightfall.hatch': [
    L('Hatch closed. Bay closed. Nobody gets out of this aeroplane for the next four hours.', 4.4),
    H('I would like it noted that I did not get in on purpose.', 3.0),
    L('Noted. Denied.', 1.8),
  ],

  'nightfall.wait': [
    I('We do not go in daylight. We sit until the field goes dark and then we go.', 4.2),
    P('How long?', 1.4),
    L('Long enough to think about it. Not long enough to change your mind.', 3.6),
  ],

  'nightfall.lineup': [
    L('There it is. Whispering Pines at night, one runway, no tower, nobody to tell us not to.', 4.6),
    I('Lined up and holding, Captain. Lamps are out down both edges.', 3.2),
    L('Then we are done waiting. Battery, fuel, four engines, Prospect. Wake her up.', 4.2),
  ],

  /* ---------------- Taxi / takeoff ---------------- */

  'taxi.line': [
    L('Runway’s yours. Long roll on this one — she’s carrying six thousand pounds of opinion.', 4.0),
    I('Straight line, Prospect. She will not forgive a wander.', 2.8),
  ],

  'takeoff.rotate': [
    L('Gear up. Complaints down. We’re officially committed.', 3.4),
  ],

  'takeoff.airborne': [
    I('Airborne, with the Fat Squatch still aboard. Nobody clap yet.', 3.2),
  ],

  /* ---------------- Climbout / turn onto the new heading ---------------- */

  'climb.turn.east': [
    I('Climb out on the runway heading, then come right onto zero-nine-zero. We’re going east tonight.', 4.2),
  ],
  'climb.turn.west': [
    I('Climb out on the runway heading, then come left onto two-seven-zero. We’re going west tonight.', 4.2),
  ],

  /* ---------------- Night cruise / heading calls ---------------- */

  'cruise.settle': [
    L('Cruise. Lights out in a minute — let your eyes get used to it before we go dark.', 3.6),
    I('Radio chatter’s ours to keep quiet from here.', 2.4),
  ],

  'nav.left5': [
    I('Come left five degrees.', 1.8),
  ],
  'nav.right5': [
    I('Come right five degrees.', 1.8),
  ],
  'nav.wrongWay': [
    I('Other left, Lindbergh.', 2.0),
  ],
  'nav.goodLine': [
    I('There. Hold that line.', 1.8),
  ],

  /* ---------------- Nobody flies this aeroplane without a heading ----------
   *
   * Owner playtest, 2026-08-19: *"If the player has not started turning toward
   * the heading within ~15-20s, Capt Lou nags: 'You planning on sightseeing?
   * Heading O nine O.' Irish or Sasole can repeat periodically. NEVER leave the
   * player without a navigation objective."*
   *
   * The owner's line is the first one, near enough verbatim — the crew say
   * headings digit by digit everywhere else in this script, so it is spelled
   * the way it is spoken. `MissionController.nagHeading()` cycles the three in
   * order and only while the aeroplane has NOT started coming round, so a
   * player already in the turn never hears any of them. */
  'nav.nag.sasole': [
    L('You planning on sightseeing? Heading zero-nine-zero.', 3.2),
  ],
  'nav.nag.irish': [
    I('Zero-nine-zero, Prospect. It is written down and everything.', 3.4),
  ],
  'nav.nag.sasoleAgain': [
    L('Bank her over. East. The city is not going to come to us.', 3.4),
  ],

  /* ---------------- Detection / low route ---------------- */

  'detect.corridor': [
    L('Valley ahead. Get under the ridgeline and stay there — we go under their radar or we don’t go.', 4.0),
  ],
  'detect.searching': [
    I('Searchlight’s hunting, not looking right at us. Hold low.', 3.0),
  ],
  'detect.located': [
    I('They’ve got us. So much for quiet.', 2.2),
  ],
  'detect.clear': [
    I('Lost them. Nicely flown.', 2.2),
  ],

  /* ---------------- Defensive fire ---------------- */

  'defense.opening': [
    H('Are those guys shooting at us?', 2.0),
    I('No, Shubes. They’re applauding.', 2.2),
  ],
  'defense.gunner.on': [
    H('Rear gun’s hot. Say the word.', 2.0),
  ],
  'defense.gunner.open': [
    H('Word taken! Word absolutely taken!', 2.2),
    L('Hold her steady for him. He cannot hit anything if the whole aeroplane is the thing that is moving.', 4.2),
  ],
  'defense.hit': [
    L('That one found us. Report.', 2.2),
  ],
  'defense.suppressed': [
    H('I think I got one! I think! There was fire! Fire happened!', 3.0),
  ],

  /* 2026-08-06 — the one authored consequence of the whole flak/fighter run,
   * now that both are "for show" (see LIVE_FIRE in ../config.js): not a hit,
   * a heavy old aeroplane that has been at high power through a gauntlet and
   * is telling on itself right at the end of it. Deliberately NOT phrased as
   * flak finding them — the barrage does no damage of its own any more and
   * the line should not imply otherwise. */
  'defense.engineStrain': [
    I('Number three’s losing revs. She’s been asking for this the whole climb.', 3.6),
    L('Heard it. Nurse it — we keep flying, we just fly lighter on that side.', 3.8),
  ],

  /* ---------------- Night fighters ----------------
   *
   * 2026-08-04, owner: "They will need good NPC behavior not too hard not too
   * easy. they try and shoot you down." These are the beats over
   * `../combat/Interceptors.js`.
   *
   * NOTHING IN THIS BLOCK SAYS LEFT OR RIGHT. The Shubenator is facing aft in
   * the tail turret and everybody else is facing forward, so his port quarter
   * is their starboard one — and this project has already shipped one scene
   * with its left and right the wrong way round (the Beef Run's seats, fixed
   * 2026-08-03). High, low, above, behind and "coming round again" all mean
   * the same thing from both ends of the aeroplane, so that is what the crew
   * call. */

  'fighters.first': [
    H('Something just went past the tail. Something fast and it was not ours.', 4.2),
    I('Single engine. He is climbing back up to have another look at us.', 3.8),
    L('Night fighters. They were always going to come. Everybody calls what they see, nobody guesses.', 5.2),
  ],

  'fighters.down': [
    H('He is going down! He is going DOWN!', 2.6),
    I('Confirmed. One less of them.', 2.2),
  ],

  'fighters.broke': [
    I('They have turned back. We are past what their fuel will carry.', 3.4),
    L('Then we are past the worst of it. Nobody relax.', 3.0),
  ],

  /* ---------------- The autopilot and the tail gun ----------------
   *
   * Owner: "maybe you can put the plane on auto pilot and gun them down." The
   * trade is the mechanic, so Sasole says the price out loud the first time —
   * and the HUD only names the key AFTER he has finished, per the tone
   * doctrine. See `MissionController.armCombatInstruction()`. */

  'auto.on': [
    L('Setting the gyro. She will hold this heading and this height and she will do nothing else.', 5.0),
    L('Understand me. She will not get out of the way of anything. That part was you.', 4.4),
  ],

  'auto.off': [
    L('I have her. Hands on.', 2.0),
  ],

  'auto.kicked': [
    L('Gyro is off — she is going over! Prospect, seat, NOW!', 3.6),
  ],

  'gun.take': [
    H('You want it? Take it. I am not proud and I am not accurate.', 3.6),
    L('Prospect is on the tail gun. Nobody is flying this aeroplane but a box of gears, so be quick about it.', 5.4),
  ],

  'gun.leave': [
    H('It is warm. You are welcome.', 2.2),
  ],

  'gun.dry': [
    I('Belt is out. There is nothing else back there.', 3.0),
    H('There was a lot of it and now there is none of it.', 3.0),
  ],

  /* ---------------- Bombing approach ---------------- */

  'bomb.targetInSight': [
    N('Target coming into view.', 2.0),
  ],
  'bomb.cityInSight': [
    N('That is a whole town down there. Streets and everything.', 3.0),
    /* The nav readout names the city. Irish does not: the wrong-city clue is
     * visual route data and nobody aboard notices it out loud. Lou is the
     * first person to say what happened, at the repaired mansion. */
    I('City in sight. Grid runs north–south, the tall part is the middle, and the middle is what we were given.', 4.6),
    P('It’s bigger than I thought.', 2.0),
    L('They always are. Fly the line.', 2.4),
  ],
  'bomb.tenSeconds': [
    I('Ten seconds.', 1.4),
  ],
  'bomb.steady': [
    L('Steady. Don’t chase it. Let the target come to you.', 3.4),
  ],

  /* ---------------- Bomb-bay malfunction ---------------- */

  'bomb.doorsFail': [
    N('Doors aren’t opening.', 2.0),
    L('Why?', 1.2),
    N('I used the wrong bolts.', 2.2),
  ],
  'bomb.manualReset': [
    L('Then fix it manually and do it fast. Prospect, hold her level — level is the whole job right now.', 4.2),
  ],
  'bomb.shubesInBay': [
    H('Hey guys, what’s going on?', 2.0),
    L('GET OUT OF THERE!', 1.8),
    I('GET OUT OF THERE!', 1.6),
    N('GET OUT OF THERE!', 1.6),
  ],
  'bomb.doorsFixed': [
    N('Doors are open! Doors are open, they were always going to open!', 3.0),
  ],

  /* ---------------- Release ---------------- */

  'bomb.releaseStuck': [
    N('...Nothing. Hang on.', 2.0),
  ],
  'bomb.releaseKick': [
    N('Kicking the mount.', 1.8),
  ],
  'bomb.packageAway': [
    N('Package away!', 1.6),
    I('That is a very generous definition of away.', 2.6),
  ],
  'bomb.weightLoss': [
    L('There she goes. Plane just lost six thousand pounds of bad intentions.', 3.6),
  ],

  /* The break turn. Everything the blast does to the aeroplane is scaled by
   * how far away it got, so this is not flavour — it is the instruction that
   * decides how bad the next thirty seconds are. */
  'bomb.breakTurn': [
    L('Now TURN. Hard over, nose down, and do not stop turning until I tell you.', 4.6),
    I('Every second of that is distance, Prospect. Distance is the entire plan.', 4.2),
  ],

  /* The whistle. Nobody in this crew has heard one before, which is the joke. */
  'bomb.falling': [
    H('Is it supposed to make that noise?', 2.4),
    N('That is the noise. That is the correct noise.', 2.8),
    I('Then why is it getting worse.', 2.4),
  ],

  /* ---------------- Explosion ----------------
   *
   * Four beats now rather than two, on their own clock (see
   * `MissionController.updateDetonation`) so they land at the moments they
   * were written for: the flash, the wave arriving, the column, the hole. */

  'explosion.flash': [
    P('I cannot see. I cannot see anything.', 2.8),
    L('Nobody look at it. Fly the instruments. It comes back.', 3.4),
  ],

  'explosion.shockwave': [
    I('BRACE—', 1.2),
    N('Something hit us! Something hit the whole aeroplane at once!', 3.4),
    L('That was the air. The air hit us.', 2.8),
  ],

  'explosion.reaction': [
    I('That seems excessive.', 2.2),
    L('That was the conservative setting.', 2.6),
  ],

  'explosion.column': [
    N('It is still going up.', 2.0),
    I('It has been going up for fifteen seconds.', 2.8),
    N('It is still going up.', 2.0),
    H('Is it going to stop?', 2.0),
    L('Eventually.', 1.8),
  ],

  'explosion.crater': [
    H('Guys. Guys, where did it go?', 2.6),
    N('The town?', 1.6),
    H('Yeah, the town.', 1.8),
    I('There is a hole where the town was. A round one. You can see the far side of it from here.', 4.8),
    L('That is what a crater is, Irish.', 2.4),
    P('...I said a line before that.', 2.2),
    L('Nobody heard your line. Everybody is looking at the hole.', 3.4),
  ],

  /* ---------------- Escape ---------------- */

  'escape.turn': [
    L('Climb, bank, and don’t look at it. Looking at it doesn’t help.', 3.4),
  ],
  'escape.gunnerDone': [
    H('I think we’re out of bullets.', 2.0),
    I('You fired into the same truck for four minutes.', 2.6),
  ],
  /* Sasole hands the aeroplane over so the player can go and shoot. Owner's
   * own words for the beat: "Plane's mine, you go shoot." */
  'fighters.sasoleTakesIt': [
    L('Plane’s mine. You go shoot.', 2.4),
    L('Gyro has the heading, I have the yoke. Get in the tail, Prospect.', 3.8),
    H('There is someone already in here.', 2.2),
    L('Then budge up.', 1.8),
  ],

  'escape.clear': [
    L('Clean air. Keep climbing.', 2.2),
  ],

  /* ---------------- Optional engine emergency ---------------- */

  /* ---------------- The engine problem, said as an instruction -------------
   *
   * Owner playtest, 2026-08-19: *"currently the game says something is wrong
   * and leaves the player to consult the spirits. Make the objective explicit:
   * ENGINE OVERHEATING / THROTTLE BACK... Cecil: 'Ease her back. Bring the
   * throttle down.' then once stabilised: 'There you go. Hold it there until
   * she cools off.'"*
   *
   * Two notes on how that is honoured here. First, there is no Cecil on this
   * aeroplane — the crew is Sasole, Irish, Numbskull and the Shubenator (see
   * SPEAKERS at the top of this file). The owner settled it on 2026-08-20:
   * *"anything that was Cecil was meant to be Sasole"*, so both of his lines
   * are the CAPTAIN's. That also reads better than the first guess at it: the
   * man flying the aeroplane is the man who tells you what to do with the
   * throttle, and Numbskull is left doing what an engineer actually does, which
   * is calling the gauge back once the temperature starts moving. The owner's
   * words are kept exactly. Second, the old beat above asked the player to make
   * a CHOICE ("your call — babied throttle, or push it and hope"), which is the
   * "consult the spirits" the note is about: it named no control, no key and no
   * success condition. It is now a plain instruction with a plain answer. */
  'emergency.overheat': [
    /* Both halves are the captain: he sees the gauge and he gives the order.
     * The first line already had a recording cut for Sasole, and the second is
     * unrecorded, so moving it costs nothing — no delivered take is orphaned. */
    L('Number three is running hot. Two-forty and climbing.', 3.2),
    L('Ease her back. Bring the throttle down.', 2.8),
  ],
  'emergency.throttleBack': [
    L('Throttle, Prospect. All the way back to the stop and leave it there.', 3.6),
  ],
  'emergency.stabilised': [
    L('There you go. Hold it there until she cools off.', 3.2),
  ],
  'emergency.cooled': [
    N('Two hundred and falling. She will live.', 2.8),
    L('Then we go home on four warm ones. Whispering Pines, straight in.', 3.6),
  ],
  'emergency.shutdown': [
    L('Shutting two down. She’ll fly on three, she just won’t enjoy it.', 3.4),
  ],
  'emergency.pushedIt': [
    L('That is not what I meant by hope.', 2.4),
  ],

  /* ---------------- Landing ---------------- */

  'landing.line': [
    L('Same field we left from. Try to remember which end has the hangar.', 3.4),
  ],
  'landing.perfect': [
    L('Maybe next time we let you fly something expensive.', 2.8),
  ],
  'landing.hard': [
    I('We dropped one package. Didn’t need to drop the aircraft.', 3.2),
  ],

  /* ---------------- Arrival / epilogue ---------------- */

  'arrival.lou': [
    U('Did they get the package?', 2.2),
    P('They signed for it.', 2.0),
    U('Good. Put the plane back where you found it.', 2.8),
  ],
};

/**
 * Ambient, cooldown-gated one-liners — see BARKS in src/beefrun/script.js for
 * the pattern this extends. Entries are {who, text} pairs (not bare strings)
 * so a pool can mix speakers; ../DialogueSystem.js's bark() reads .who off
 * each entry instead of hardcoding a single owner.
 */
export const BARKS = {
  /* Sasole, while the player is stood on the apron not doing the next check.
   * A pool rather than a beat because it has to be able to come back — see
   * `MissionController.updateWalkaround()`'s idle timer. Cooldown lives in
   * ../DialogueSystem.js's BARK_COOLDOWN table. */
  walkaroundIdle: [
    { who: 'SASOLE', text: 'Marker is on the next one, Prospect. It is not going to check itself.' },
    { who: 'SASOLE', text: 'She is thirty-three metres across. Walking is most of the job.' },
    { who: 'IRISH', text: 'Sun is going down on us, Prospect. Keep moving.' },
    { who: 'SASOLE', text: 'I have watched men stare at this aeroplane before. It never once fixed anything.' },
  ],
  heavyBanked: [
    { who: 'SASOLE', text: 'Easy. She’s not the little plane. Ease it back.' },
    { who: 'SASOLE', text: 'That bank angle is a request she is declining.' },
  ],
  heavySlow: [
    { who: 'SASOLE', text: 'Nose down a hair. She climbs like it’s a personal insult when she’s this loaded.' },
  ],
  heavySmooth: [
    { who: 'SASOLE', text: 'There. Small inputs. She rewards patience.' },
  ],
  gunnerIdle: [
    { who: 'SHUBES', text: 'Rear gunner reporting no targets, several opinions.' },
    { who: 'SHUBES', text: 'Everything back here is fine. I am counting stars.' },
  ],
  gunnerFiring: [
    { who: 'SHUBES', text: 'Eating a lot of tracer up here!' },
    { who: 'SHUBES', text: 'This gun is louder than I expected and I expected a lot!' },
  ],
  lowFuel: [
    { who: 'IRISH', text: 'Fuel’s getting opinions of its own. Keep it efficient.' },
  ],
  terrainClose: [
    { who: 'SASOLE', text: 'Terrain. Terrain is a thing that wins arguments.' },
  ],

  /* ---- The refined flak (owner: "let's really refine that") ----
   * Fired by `MissionController` off a burst's REAL distance, not off a timer,
   * so hearing one of these means one genuinely went off inside sixty metres. */
  flakClose: [
    { who: 'SASOLE', text: 'That one was close enough to read the serial number off.' },
    { who: 'IRISH', text: 'Splinters. We are taking splinters down the side.' },
    { who: 'NUMBSKULL', text: 'I felt that one in my teeth.' },
    { who: 'SHUBES', text: 'The whole tail just moved and I was still attached to it!' },
  ],

  /* ---- Night fighters ----
   * No left or right in any of these, for the reason given over the
   * `fighters.*` block above: the man in the tail is facing the other way. */
  fighterCommitting: [
    { who: 'SHUBES', text: 'He is rolling in on us! High, coming down!' },
    { who: 'IRISH', text: 'One committing. He is inside a mile and he is not sightseeing.' },
    { who: 'SHUBES', text: 'I can see his exhaust. That is how close he is.' },
  ],
  fighterAgain: [
    { who: 'SHUBES', text: 'He is back. He is BACK.' },
    { who: 'IRISH', text: 'Second pass. Do not give him a straight line to work with.' },
    { who: 'SASOLE', text: 'Same one, coming round again. He is patient. I hate patient.' },
  ],
  fighterNearMiss: [
    { who: 'SHUBES', text: 'That went past me! That went past ME!' },
    { who: 'IRISH', text: 'Wide. He has not settled yet.' },
    { who: 'NUMBSKULL', text: 'There is daylight in this aeroplane and it is night.' },
  ],
  fighterHitUs: [
    { who: 'NUMBSKULL', text: 'We are hit! We are hit somewhere!' },
    { who: 'SASOLE', text: 'Report. Somebody give me a number, not a noise.' },
    { who: 'IRISH', text: 'He got some of us that time.' },
  ],
  gunJam: [
    { who: 'SHUBES', text: 'It has stopped! It got too hot and it has STOPPED!' },
    { who: 'IRISH', text: 'Let it cool. Counting to three is not a personality flaw.' },
  ],
  autoRefused: [
    { who: 'SASOLE', text: 'Not like this. Wings level, out of the buffet, and off the deck first.' },
    { who: 'SASOLE', text: 'The gyro is not a magician. Fly her level and ask me again.' },
  ],
  gunRefused: [
    { who: 'SASOLE', text: 'Not on the ground, Prospect. There is nothing up there to shoot at.' },
  ],
};

export const cueOf = (beatId, index, who) =>
  `enolasquatch.${who.toLowerCase()}.${beatId.replace(/\./g, '-')}-${index + 1}`;

export const barkCueOf = (pool, index, who) =>
  `enolasquatch.${who.toLowerCase()}.bark-${pool}-${index + 1}`;

/**
 * The release-line pick's cue. Exported rather than written out at the call
 * site because two places need the identical string and they are nowhere near
 * each other: MissionController queues it, and tools/enolasquatch-vo.mjs puts
 * it in the sound manifest. A typo in either one is a line that plays silently
 * forever with nothing to say it was wrong.
 */
export const releaseCueOf = (key) => `enolasquatch.prospect.release-${key}`;

/** Flat list of every line, for VO-pickup tooling — mirrors src/beefrun/script.js's own export. */
export function allEnolaSquatchLines() {
  const out = [];
  for (const [id, beat] of Object.entries(BEATS)) {
    beat.forEach((line, i) => out.push({ cue: cueOf(id, i, line.who), who: line.who, text: line.text, beat: id }));
  }
  for (const [pool, lines] of Object.entries(BARKS)) {
    lines.forEach((line, i) => out.push({ cue: barkCueOf(pool, i, line.who), who: line.who, text: line.text, bark: pool }));
  }
  /* The release pick is a spoken PROSPECT line like any other — it just is not
   * reachable from BEATS, because the player chooses it. Omitting it here is
   * how four recordings go missing from a voice run without anybody noticing.
   * The silent option is excluded: there is nothing to record. */
  for (const line of RELEASE_LINES) {
    if (line.silent) continue;
    out.push({ cue: releaseCueOf(line.key), who: 'PROSPECT', text: line.text, release: line.key });
  }
  return out;
}

export const OBJECTIVES = {
  WALKAROUND: 'Walk the aeroplane with Captain Sasole.',
  /* The walk's guidance marker follows this objective to the crew door — see
   * `EnolaPreflight.pointAtBoarding()`. The text names the SIDE and the
   * LANDMARK because "climb aboard" on its own is not an instruction on an
   * aeroplane with 33.5 m of wing and one 0.8 m door. */
  BOARD: 'Climb aboard — crew door, port side, behind the wing.',
  NIGHTFALL: 'Wait for dark.',
  PREFLIGHT: 'Battery, fuel, all four engines, brakes off.',
  TAXI: 'Taxi to the runway and line up.',
  TAKEOFF: 'Hold the line. Throttle up. Rotate before the runway ends.',
  CLIMB_TURN: 'Climb out, then turn onto the new heading.',
  CRUISE: 'Hold your heading. Irish will call corrections.',
  DETECTION: 'Stay low. Stay under the ridgeline. Stay unseen.',
  DEFENSE: 'Keep her stable. Let the gun do its job.',
  BOMB_APPROACH: 'Fly straight and level through the bombing corridor.',
  BOMB_MALFUNCTION: 'Hold altitude while the bomb bay is reset.',
  BOMB_RELEASE: 'Release the Fat Squatch.',
  /* The seconds between the bomb leaving the mount and the flash. Everything
   * the blast wave does to the aeroplane scales with how far it got, so this
   * is a real instruction and not a caption. */
  BREAK_TURN: 'Turn. Hard. Get distance before it goes off.',
  BLAST: 'Keep going. Do not look at it.',
  ESCAPE: 'Climb. Bank away. Don’t look back.',
  /* The engine problem, named. See the `emergency.*` beats above for the owner
   * note these two answer — an objective that says what is wrong, which engine
   * it is, and what the player has to do about it. */
  ENGINE_OVERHEAT: 'ENGINE OVERHEATING — number three. THROTTLE BACK.',
  ENGINE_COOLING: 'Number three cooling —',
  RETURN: 'Get her home.',
  /* The tail gun, on the leg it belongs to. Named with its key, because a toy
   * nobody is told about is not a toy. */
  TAIL_GUN: 'Press T — take over the tail gun. Sasole is flying.',
  LANDING: 'Land on the runway you left from. Stop before it ends.',
};

/**
 * The player-facing release-line choice, offered once the targeting reticle
 * aligns. Not a BEATS entry because it's a genuine 1-4 pick, not a fixed
 * sequence — the mission plays whichever one is chosen as a single line from
 * PROSPECT immediately before the release beat.
 */
export const RELEASE_LINES = [
  { key: '1', text: 'Fat Squatch away. God help whoever’s down there.' },
  { key: '2', text: 'Special delivery.' },
  { key: '3', text: 'That’s from Lou. And I’ll be sayin’ that in my sleep for the rest of me life.' },
  { key: '4', text: 'Hope they’re hungry.' },
  { key: '5', text: '(Say nothing.)', silent: true },
];

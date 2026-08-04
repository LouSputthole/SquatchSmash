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

  'preflight.payload.tap': [
    N('You have to actually pull on the strap. Tapping a strap tells you nothing.', 3.4),
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

  'preflight.engineStart': [
    L('Start sequence. One, then two.', 2.4),
    L('Three and four are yours, Prospect. Don’t be gentle, be correct.', 3.2),
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

  /* ---------------- Bombing approach ---------------- */

  'bomb.targetInSight': [
    N('Target coming into view.', 2.0),
  ],
  'bomb.cityInSight': [
    N('That is a whole town down there. Streets and everything.', 3.0),
    I('Squatchbourg. Grid runs north–south, the tall part is the middle, and the middle is what we were given.', 4.6),
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

  /* The whistle. Nobody in this crew has heard one before, which is the joke. */
  'bomb.falling': [
    H('Is it supposed to make that noise?', 2.4),
    N('That is the noise. That is the correct noise.', 2.8),
    I('Then why is it getting worse.', 2.4),
  ],

  /* ---------------- Explosion ---------------- */

  'explosion.reaction': [
    I('That seems excessive.', 2.2),
    L('That was the conservative setting.', 2.6),
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
  'escape.clear': [
    L('Clean air. Keep climbing.', 2.2),
  ],

  /* ---------------- Optional engine emergency ---------------- */

  'emergency.overheat': [
    L('Number two’s running hot. Your call — babied throttle and a long way home, or push it and hope.', 4.6),
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
  BOARD: 'Climb aboard and take the left seat.',
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
  ESCAPE: 'Climb. Bank away. Don’t look back.',
  RETURN: 'Get her home.',
  LANDING: 'Land on the runway you left from. Stop before it ends.',
};

/**
 * The player-facing release-line choice, offered once the targeting reticle
 * aligns. Not a BEATS entry because it's a genuine 1-4 pick, not a fixed
 * sequence — the mission plays whichever one is chosen as a single line from
 * PROSPECT immediately before the release beat.
 */
export const RELEASE_LINES = [
  { key: '1', text: 'Send them the Fat Squatch.' },
  { key: '2', text: 'Special delivery.' },
  { key: '3', text: 'Lou sends his regards.' },
  { key: '4', text: 'Hope they’re hungry.' },
  { key: '5', text: '(Say nothing.)', silent: true },
];

/**
 * THE SPECIAL MEETING — the script, as data.
 *
 * `docs/SPECIAL-MEETING-SCRIPT.md` is the owner's document and stays the
 * authority on intent. This file is the same script in a shape the game and
 * the tests can both read: one entry per beat, one cue name per spoken line,
 * and the branch graph written down rather than implied by control flow.
 *
 * Everything downstream reads THIS file and nothing else:
 *
 *   - `ride.js` walks it to run the scene.
 *   - `assets/sfx/manifest.json` carries one cue per `scriptCues()` entry, and
 *     `tests/specialmeeting-script.test.mjs` fails if the two ever disagree in
 *     either direction.
 *   - the recording sheet, `voice:needed` and `audio:todo` all derive from the
 *     manifest, so authoring a line here and minting its cue is the whole job.
 *
 * ## The rule this file exists to protect
 *
 * Lines marked `verbatim: true` are the owner's own words. They are pinned by
 * a test against the hashes below, so a punch-up pass cannot quietly soften
 * them. **No character in this scene may say any version of "don't worry,
 * we're not killing you."** Nobody reassures him and nobody explains. The one
 * pressure valve is SM-310, and SM-320 closes it again on purpose.
 *
 * ## Why the graph is data
 *
 * The scene's whole claim is that there is no way out of the front seat. That
 * is only true if it is true of every branch, and "every branch" is a property
 * of a graph, not of a paragraph. `hubExits()` and the branch test below read
 * the same table the runtime does.
 */
import { CHARACTER_IDS } from '../core/campaign.js';

/** Every cue in the car, the trunk and the woods sits under this prefix. */
export const CUE_PREFIX = 'vo.specialmeeting.';

/**
 * The phone call gets its own bank.
 *
 * `vo.call.booski.bignight.*` already exists, is already recorded, and says
 * warm things about a room assembling in the prospect's honour. This call says
 * the opposite and must not overwrite it. `vo.call.*` is also globally exempt
 * from the line-presence checker, which is correct: Booski has no body here.
 */
export const CALL_CUE_PREFIX = 'vo.call.booski.special_meeting.';

/* ====================================================================== *
 * WHO SPEAKS
 *
 * `voice` is the manifest profile id; `slug` is what the cue name is built
 * from. Tony's cues read `...tony...` because a recording sheet with forty
 * `player` rows on it is unreadable, but the profile stays `player` so the
 * line-presence checker keeps treating him as the camera.
 * ====================================================================== */
const speaker = (key, character, name, voice, slug) => Object.freeze({
  key, character, name, voice, slug,
});

export const SPEAKERS = Object.freeze({
  PROSPECT: speaker('PROSPECT', CHARACTER_IDS.PROSPECT, 'Prospect', 'player', 'tony'),
  BOOSKI: speaker('BOOSKI', CHARACTER_IDS.BOOSKI, 'Booskibro', 'booski', 'booski'),
  SEFF: speaker('SEFF', CHARACTER_IDS.SEFF, 'Seff', 'seff', 'seff'),
  LAG: speaker('LAG', CHARACTER_IDS.LAG, 'Lag', 'lag', 'lag'),
  NUMBSKULL: speaker('NUMBSKULL', CHARACTER_IDS.NUMBSKULL, 'Numbskull', 'numbskull', 'numbskull'),
  KITTENBOSS: speaker('KITTENBOSS', CHARACTER_IDS.KITTENBOSS, 'Kittenboss', 'kittenboss', 'kittenboss'),
});

/** The four voices that need a staged body in this scene. Booski is a phone. */
export const STAGED_VOICES = Object.freeze(['seff', 'lag', 'numbskull', 'kittenboss']);

/* ====================================================================== *
 * PHRASES THAT MAY NEVER APPEAR IN AN NPC LINE
 *
 * The owner's "lines that must never be written into this scene" list, in the
 * only form a machine can hold anybody to. Checked against every line spoken
 * by somebody who is NOT Tony — Tony is allowed to say "you're fine" to
 * Numbskull at SM-320, because that is him being polite to the man behind him
 * and is the opposite of a reassurance.
 *
 * `fire` is deliberately absent: Seff says "There's a fire" at SM-523 and that
 * is the owner's line.
 * ====================================================================== */
export const FORBIDDEN_NPC_PHRASES = Object.freeze([
  'nothing is going to happen',
  "nothing's going to happen",
  'you are not in trouble',
  "you're not in trouble",
  'you are fine',
  "you're fine",
  'you will like this',
  "you'll like this",
  'it is a good thing',
  "it's a good thing",
  'nice surprise',
  'no one is going to hurt you',
  'nobody is going to hurt you',
  'initiation',
  'ceremony',
  'the circle',
  'the founders',
]);

/* ====================================================================== *
 * AUTHORING HELPERS
 *
 * `l()` is a spoken line and gets a cue. `sd()` is a stage direction: it goes
 * on screen as nothing, is never recorded, and exists here because half of
 * this scene is what nobody says.
 * ====================================================================== */
const l = (who, text, opts = {}) => ({ who, text, ...opts });
const sd = (text, opts = {}) => ({ stage: text, ...opts });

/** A player answer at a choice. `says` means the words live here, not in the branch. */
const opt = (text, to, o = {}) => ({
  text, to, says: false, unlocksAfter: 0, ...o,
});

/* ====================================================================== *
 * THE BEATS
 *
 * `act` 1 the flat, 2 the front seat, 3 the drive, 4 the trunk, 5 the walk.
 * `kind`:
 *   lines     play the lines in order, then go to `next`
 *   bank      a pool of one-liners; the scene picks from it, it does not play through
 *   choice    put `options` up; each leads to a beat
 *   silence   hold, with `holdSeconds`, and let the player break it
 *   blackout  fade to black; the beats that follow play under it
 *   fade      come back up
 *   handoff   leave the scene
 * ====================================================================== */
const RAW_BEATS = [
  /* ---------------- ACT ONE — THE FLAT ---------------- */
  {
    id: 'SM-010',
    slug: 'idle_before',
    act: 1,
    kind: 'bank',
    title: 'Idle, alone in the flat, before the call',
    note: 'On the apartment idle timer, one at a time, well spaced. He is not '
      + 'anxious yet. He is a man with nothing to do and nobody to tell.',
    lines: [
      l('PROSPECT', "Right. That's Sauce dealt with. That's a sentence I've said out loud now."),
      l('PROSPECT', "Nobody's rung. Nobody's rung all day."),
      l('PROSPECT', 'I keep waiting for someone to tell me whether that was the right call.'),
      l('PROSPECT', "The flat's exactly the same. That's the strange bit."),
      l('PROSPECT', 'I could ring somebody. And say what.'),
      l('PROSPECT', "I've had a shower and I can still smell that house."),
      l('PROSPECT', "Shoes are ruined. Not mine, that. That's the good version."),
      l('PROSPECT', "Sit down, Tony. That's the whole plan. That's the entire plan."),
    ],
  },
  {
    id: 'SM-020',
    slug: 'ring',
    act: 1,
    kind: 'lines',
    title: 'The phone rings',
    lines: [sd('No warning beat. It rings.')],
    next: 'SM-030',
  },
  {
    id: 'SM-030',
    slug: 'call',
    act: 1,
    kind: 'call',
    title: 'THE CALL',
    note: 'Every line is the owner’s. The pause after "Special one." is the '
      + 'whole call. Booski hangs up first, mid-air, without waiting. He does '
      + 'not say goodbye. Do not add one.',
    lines: [
      l('BOOSKI', 'Prospect.', { verbatim: true }),
      l('PROSPECT', "What's up?", { verbatim: true }),
      l('BOOSKI', "We're having a meeting tonight.", { verbatim: true }),
      l('PROSPECT', 'Yeah?', { verbatim: true }),
      l('BOOSKI', 'Yeah. Special one.', { verbatim: true, holdAfter: 3.2 }),
      l('PROSPECT', 'What kinda special?', { verbatim: true }),
      l('BOOSKI', "You'll find out.", { verbatim: true }),
      l('PROSPECT', 'Where?', { verbatim: true }),
      l('BOOSKI', "Don't worry about that. We're sending some guys over to pick you up.", { verbatim: true }),
      l('PROSPECT', 'Who?', { verbatim: true }),
      l('BOOSKI', "Seff, Lag and Numbskull. They'll be there soon.", { verbatim: true }),
      l('PROSPECT', 'Booski, what is this?', { verbatim: true }),
      l('BOOSKI', "It's a meeting, Prospect. Put on something decent.", { verbatim: true, hangUpAfter: true }),
    ],
    next: 'SM-040',
  },
  {
    id: 'SM-040',
    slug: 'dead_line',
    act: 1,
    kind: 'lines',
    title: 'The dead line',
    lines: [
      sd('Tony stands with the phone still at his ear for a second longer than '
        + 'he needs to. Then he takes it away and looks at it.'),
      l('PROSPECT', '…Right.'),
    ],
  },
  {
    id: 'SM-050',
    slug: 'call_back',
    act: 1,
    kind: 'bank',
    title: 'Ringing Booski back',
    note: 'Player-initiated. It must go nowhere: it rings, and rings, and does '
      + 'not go to voicemail and does not get answered. Then one of these.',
    lines: [
      l('PROSPECT', "He's not picking up. He literally just put the phone down."),
      l('PROSPECT', "It's not even ringing out. It's just ringing."),
      l('PROSPECT', 'Fine. Fine.'),
    ],
  },
  {
    id: 'SM-060',
    slug: 'idle_after',
    act: 1,
    kind: 'bank',
    title: 'Idle, after the call',
    note: 'Replaces SM-010 on the same timer. Same flat, different man.',
    lines: [
      l('PROSPECT', "'Special one.'"),
      l('PROSPECT', "He's never once told me where. Not once. Not one time."),
      l('PROSPECT', "Seff, Lag and Numbskull. That's three."),
      l('PROSPECT', 'Three of them. To collect one bloke.'),
      l('PROSPECT', 'Put on something decent. Right. Decent.'),
      l('PROSPECT', "It's a meeting. He said it's a meeting."),
      l('PROSPECT', "I'm reading into it. I'm aware I'm reading into it."),
      l('PROSPECT', "I'd feel better if he'd shouted at me."),
    ],
  },
  {
    id: 'SM-070',
    slug: 'getting_ready',
    act: 1,
    kind: 'bank',
    title: 'Getting ready',
    note: 'Chore beats in the flat’s existing frame. The last one is him '
      + 'talking himself down and failing. He is the only person in this scene '
      + 'permitted to say anything reassuring to Tony, and it has to fail.',
    lines: [
      l('PROSPECT', 'What do you wear to a special one.', { where: 'wardrobe' }),
      l('PROSPECT', "That'll do. That's decent.", { where: 'mirror' }),
      l('PROSPECT', "That's the jacket, then. That's the one I've picked.", { where: 'mirror' }),
      l('PROSPECT', "It's a meeting. It's a meeting and I've been asked to it.", { where: 'mirror' }),
    ],
  },
  {
    id: 'SM-080',
    slug: 'door_refusal',
    act: 1,
    kind: 'bank',
    title: 'Door refusals while he waits',
    note: 'If the player tries to leave before the car arrives.',
    lines: [
      l('PROSPECT', "No. He said they're coming here. I'm not walking out on that."),
      l('PROSPECT', "They're picking me up. If I'm not in when they get here, that's on me."),
      l('PROSPECT', "I don't know where it is. That's rather the point."),
    ],
  },
  {
    id: 'SM-090',
    slug: 'headlights',
    act: 1,
    kind: 'bank',
    title: 'Headlights',
    note: 'Headlights swing across the ceiling and stop. The engine keeps '
      + 'running. Nobody knocks. It is still running when he gets outside.',
    lines: [
      l('PROSPECT', "That's them, then."),
      l('PROSPECT', "They're early. …Or I'm late. One of the two."),
      l('PROSPECT', 'Right. Down we go.'),
    ],
  },

  /* ---------------- ACT TWO — THE FRONT SEAT ---------------- */
  {
    id: 'SM-100',
    slug: 'arrival',
    act: 2,
    kind: 'lines',
    title: 'The car arrives',
    note: 'Lag gets out of the FRONT and stands with the door open behind him, '
      + 'on his phone. Numbskull gets out of the back, unhurried, and walks '
      + 'round. Seff stays at the wheel and leans across.',
    lines: [
      l('SEFF', 'Tony. Hey.'),
      l('SEFF', "You look alright. That's a good jacket."),
      l('LAG', 'Nice out.', { direction: 'not looking up' }),
      l('SEFF', 'Quick thing before we go — no. Forget it. Later.',
        { direction: 'He does not say what the thing was. He never does. Do not resolve this.' }),
      l('LAG', "Forty minutes, roughly. There's no signal past the reservoir. I checked."),
      l('PROSPECT', "Why'd all three of you come?"),
      l('NUMBSKULL', 'Carpool.', { cue: 'vo.specialmeeting.numbskull.arrival.carpool.1' }),
      l('PROSPECT', 'To pick up one person?'),
      l('NUMBSKULL', "Now it's full."),
      sd('Numbskull arrives at the front passenger door, waits for Lag to step '
        + 'clear of it, and opens it. He holds it. He does not let go of it for '
        + 'the rest of the scene until Tony is sitting in it.'),
      l('NUMBSKULL', 'Front.', { verbatim: true, cue: 'vo.specialmeeting.numbskull.arrival.1' }),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-110',
    slug: 'hub',
    act: 2,
    kind: 'choice',
    title: 'THE HUB — eight ways to refuse the front seat',
    note: 'The front door is open and Numbskull is holding it. Nobody is '
      + 'looking at Tony expectantly. They are all just waiting, comfortably, '
      + 'for the normal thing to happen. Nobody escalates, ever.',
    options: [
      opt("I'll sit in the back.", 'SM-120'),
      opt('Why do I have to sit up front?', 'SM-130'),
      opt('All right.', 'SM-190', { accepts: true }),
      opt('Is Lag not sitting there?', 'SM-140', { unlocksAfter: 1 }),
      opt('Am I in trouble?', 'SM-150', { unlocksAfter: 1 }),
      opt('Can I just follow you in my own car?', 'SM-160', { unlocksAfter: 1 }),
      opt('[Say nothing.]', 'SM-170', { unlocksAfter: 1, silent: true }),
      opt("I really don't like this.", 'SM-180', { unlocksAfter: 2 }),
    ],
  },
  {
    id: 'SM-120',
    slug: 'back_seat',
    act: 2,
    kind: 'lines',
    title: "I'll sit in the back.",
    lines: [
      l('PROSPECT', "I'll sit in the back.", { verbatim: true }),
      l('NUMBSKULL', 'Nah. Take the front.', { verbatim: true }),
      l('PROSPECT', "I'm good back there.", { verbatim: true }),
      sd('A look. Not angry. Numbskull just looks at him for slightly too long, '
        + 'the way you look at somebody who has said something that does not parse.',
      { verbatim: true }),
      l('NUMBSKULL', 'Prospect. Sit up front.', { verbatim: true }),
      sd('Lag casually opens the rear door and gets in. Without ceremony, '
        + 'without looking up, still on his phone — the way a man gets into '
        + 'a car. The back seat is now full. Nobody points this out.',
      { verbatim: true, fillsRearLeft: true }),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-130',
    slug: 'why_front',
    act: 2,
    kind: 'lines',
    title: 'Why do I have to sit up front?',
    lines: [
      l('PROSPECT', 'Why do I have to sit up front?', { verbatim: true }),
      l('SEFF', "Because we're asking you to sit up front.", { verbatim: true }),
      l('PROSPECT', "That's not really an answer.", { verbatim: true }),
      l('LAG', "It's the answer you're getting.",
        { verbatim: true, direction: 'No edge at all. He is reporting a fact about the situation, the same way he would report a ping. Then back to the phone.' }),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-140',
    slug: 'lag_seat',
    act: 2,
    kind: 'lines',
    title: 'Is Lag not sitting there?',
    lines: [
      l('PROSPECT', 'Is Lag not sitting there?'),
      l('LAG', 'I was.', { holdAfter: 1.6 }),
      l('LAG', "It's free now."),
      l('PROSPECT', 'Right.'),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-150',
    slug: 'in_trouble',
    act: 2,
    kind: 'lines',
    title: 'Am I in trouble?',
    note: 'The direct question. He is allowed to ask it. He is not allowed to '
      + 'get an answer. Seff genuinely considers it and thinks he answered.',
    lines: [
      l('PROSPECT', 'Am I in trouble?'),
      l('SEFF', 'With who?', { direction: 'Genuinely considering it. Not coy.', holdAfter: 1.8 }),
      l('PROSPECT', "I don't know. That's why I asked."),
      l('SEFF', 'Well. There you go.',
        { direction: 'He turns back to the wheel. That was not a deflection.' }),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-160',
    slug: 'own_car',
    act: 2,
    kind: 'lines',
    title: 'Can I just follow you in my own car?',
    lines: [
      l('PROSPECT', 'Can I just follow you in my own car?'),
      l('LAG', "You'd never find it."),
      l('PROSPECT', 'You could give me the address.'),
      l('LAG', "There isn't one.",
        { direction: 'Back to the phone. He has answered completely, from where he is sitting, and has nothing to add.' }),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-170',
    slug: 'say_nothing',
    act: 2,
    kind: 'lines',
    title: '[Say nothing.]',
    note: 'Nobody fills the silence for him. Numbskull keeps holding the door. '
      + 'Lag keeps scrolling. Seff watches the road ahead through the '
      + 'windscreen. The engine idles. Hold this longer than is comfortable.',
    lines: [
      sd('Hold. Nobody rescues it.', { holdSeconds: 7 }),
      l('SEFF', "We're alright for time.", { direction: 'Mild.' }),
      sd('Nobody moves.'),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-180',
    slug: 'dont_like',
    act: 2,
    kind: 'lines',
    title: 'Final resistance',
    note: 'The hardest line anybody says in the scene, and it is still not '
      + 'aggressive. He is embarrassed for Tony. Play it that way.',
    lines: [
      l('PROSPECT', "I really don't like this.", { verbatim: true }),
      l('NUMBSKULL', "You're making it weird.", { verbatim: true, holdAfter: 1.8 }),
      l('NUMBSKULL', 'Get in.', { verbatim: true }),
    ],
    next: 'SM-110',
  },
  {
    id: 'SM-190',
    slug: 'seat',
    act: 2,
    kind: 'lines',
    title: 'The seat',
    note: 'Numbskull closes the door for him — a courtesy, done properly, '
      + 'with two hands — then walks around the back of the car and gets in '
      + 'behind him. Lag behind Seff. Seff adjusts the rear-view mirror and in '
      + 'doing so ends up looking at Tony. He does not hold it. The central '
      + 'locking goes and nobody remarks on it. Do not have anybody remark on it.',
    lines: [
      l('PROSPECT', 'All right.', { verbatim: true }),
      sd('Tony gets in. Numbskull shuts the door with two hands, walks around '
        + 'the back of the car, and gets in behind him.', { seats: true }),
      sd('The central locking goes.'),
      l('SEFF', 'Belt.'),
      l('PROSPECT', 'Right.'),
    ],
    next: 'SM-195',
  },
  {
    id: 'SM-195',
    slug: 'pull_away',
    act: 2,
    kind: 'lines',
    title: 'Pulling away',
    note: 'Door closes, engine starts, nobody says anything. About five seconds '
      + 'of driving with four people in a car and no conversation at all.',
    lines: [sd('They pull away. Nobody speaks.', { holdSeconds: 5 })],
    next: 'SM-196',
  },
  {
    id: 'SM-196',
    slug: 'road_match_cut',
    act: 3,
    kind: 'lines',
    title: 'MATCH CUT — THE ROAD OUT',
    note: 'The same passenger-seat composition carries from the block onto the '
      + 'outskirts road. This is deliberately not a blackout: the drive is part '
      + 'of the story and the player must see where the car is taking him.',
    lines: [sd('Match cut on the moving passenger seat to the road out.', {
      startsForestDrive: true,
    })],
    next: 'SM-200',
  },
  {
    id: 'SM-200',
    slug: 'radio',
    act: 3,
    kind: 'lines',
    title: 'The radio',
    note: 'Lag reaches forward between the seats and '
      + 'turns the radio on. Two seconds of a station announcer mid-sentence. '
      + 'Seff reaches over and turns it off. Neither of them says anything '
      + 'about it. Lag does not try again.',
    lines: [sd('Radio on. Two seconds of announcer. Radio off. Nobody comments.')],
    next: 'SM-220',
  },
  {
    id: 'SM-220',
    slug: 'turn_off',
    act: 3,
    kind: 'lines',
    title: 'The turn-off',
    note: 'Streetlights end, the tarmac ends, and a cattle grid '
      + 'rattles the whole car.',
    lines: [sd('Cattle grid. The surface changes. Full beams on.')],
    next: 'SM-197',
  },
  {
    id: 'SM-197',
    slug: 'dirt_road_reveal',
    act: 3,
    kind: 'lines',
    title: 'THE DIRT ROAD',
    note: 'Trees close over the visible road and the full beams pick out dirt. '
      + 'Nobody has said a word since the flat.',
    lines: [
      sd('Full beams on the dirt road. Trees closing over it.'),
      l('PROSPECT', 'You guys planning on killing me?'),
      l('SEFF', "Planning's a strong word."),
      l('PROSPECT', "What's the weaker word?"),
      l('SEFF', 'Driving.'),
    ],
    next: 'SM-210',
  },

  /* ---------------- ACT THREE — THE DRIVE ---------------- */
  {
    id: 'SM-210',
    slug: 'sandwich',
    act: 3,
    kind: 'choice',
    title: 'The sandwich',
    note: 'From directly behind Tony’s head, the sound of a paper bag.',
    lines: [
      sd('From directly behind his head, a paper bag.'),
      l('NUMBSKULL', 'You want half of this?'),
    ],
    options: [
      opt('No. Thanks.', 'SM-211', { says: true }),
      opt('…Yeah. Go on.', 'SM-212', { says: true }),
      opt('What is it?', 'SM-213', { says: true }),
    ],
  },
  {
    id: 'SM-211',
    slug: 'sandwich_no',
    act: 3,
    kind: 'lines',
    title: 'No, thanks',
    lines: [
      l('NUMBSKULL', "It's good."),
      sd('He does not offer again. He eats it behind Tony’s head for the next minute.'),
    ],
    next: 'SM-230',
  },
  {
    id: 'SM-212',
    slug: 'sandwich_yes',
    act: 3,
    kind: 'lines',
    title: 'Go on, then',
    note: 'Now Tony is eating a sandwich a man in the seat behind him handed '
      + 'him, and there is nothing wrong with that, and he cannot stop thinking '
      + 'about it.',
    lines: [
      sd('A hand comes over Tony’s shoulder holding half a sandwich. Tony takes it.'),
      l('PROSPECT', '…It is good.', { direction: 'eating' }),
      l('NUMBSKULL', 'I said.'),
    ],
    next: 'SM-230',
  },
  {
    id: 'SM-213',
    slug: 'sandwich_what',
    act: 3,
    kind: 'lines',
    title: 'What is it?',
    lines: [
      l('NUMBSKULL', "It's from the place by the laundrette."),
      l('PROSPECT', "That's not what I asked."),
      l('NUMBSKULL', "Oh. It's ham."),
    ],
    next: 'SM-210',
  },
  {
    id: 'SM-230',
    slug: 'dirt_one',
    act: 3,
    kind: 'lines',
    title: 'Dirt road, first block',
    note: 'Every line is the owner’s.',
    lines: [
      l('PROSPECT', 'So where are we going?', { verbatim: true }),
      l('SEFF', 'Meeting.', { verbatim: true }),
      l('PROSPECT', 'Yeah, I caught that part.', { verbatim: true }),
      sd('silence', { verbatim: true, holdSeconds: 4 }),
      l('PROSPECT', "Where's the meeting?", { verbatim: true }),
      l('LAG', 'Out here.', { verbatim: true }),
      l('PROSPECT', 'No shit.', { verbatim: true }),
      sd('Numbskull chuckles quietly.', { verbatim: true }),
      l('PROSPECT', 'How far?', { verbatim: true }),
      l('SEFF', 'Not far.', { verbatim: true }),
    ],
    next: 'SM-240',
  },
  {
    id: 'SM-240',
    slug: 'dirt_two',
    act: 3,
    kind: 'lines',
    title: 'Dirt road, second block',
    lines: [
      l('PROSPECT', 'You guys always hold meetings in the middle of nowhere?', { verbatim: true }),
      l('NUMBSKULL', 'Some meetings.', { verbatim: true }),
    ],
    next: 'SM-250',
  },
  {
    id: 'SM-250',
    slug: 'silence',
    act: 3,
    kind: 'silence',
    title: 'THE LONG SILENCE',
    holdSeconds: 22,
    note: 'The floor of the scene. Genuinely long — twenty to twenty-five '
      + 'seconds of real playtime with nobody speaking. Nothing fills it: no '
      + 'music sting, no bark, no HUD prompt. Just the engine, the road under '
      + 'the tyres, and one indicator tick when Seff takes a bend he did not '
      + 'need to indicate for.',
    options: [
      opt('Is anyone going to say anything?', 'SM-251', { says: true }),
      opt('How long have you three known each other?', 'SM-252', { says: true }),
      opt('[Say nothing. Sit in it.]', 'SM-253', { silent: true }),
    ],
  },
  {
    id: 'SM-251',
    slug: 'silence_anything',
    act: 3,
    kind: 'lines',
    title: 'About what?',
    lines: [
      l('LAG', 'About what?'),
      sd('Silence resumes. Full length again.', { resumeSilence: true }),
    ],
    next: 'SM-250',
  },
  {
    id: 'SM-252',
    slug: 'silence_known',
    act: 3,
    kind: 'lines',
    title: 'Long time',
    lines: [
      l('SEFF', 'Long time.', { holdAfter: 10 }),
      l('SEFF', "Numbskull's the newest.", { direction: 'unprompted, ten seconds later' }),
      l('NUMBSKULL', 'Nine years.'),
      sd('Silence resumes.', { resumeSilence: true }),
    ],
    next: 'SM-250',
  },
  {
    id: 'SM-253',
    slug: 'silence_hold',
    act: 3,
    kind: 'lines',
    title: 'Nice night for it',
    note: 'The silence runs its full length and nobody rescues it. At the very '
      + 'end of it, quietly, from the back seat, unprompted. Nobody says what '
      + '"it" is. Nobody asks. Do not let anybody ask.',
    lines: [
      sd('The silence runs its full length.', { holdSeconds: 22 }),
      l('NUMBSKULL', 'Nice night for it.', { direction: 'quiet, from the back seat, unprompted' }),
    ],
    next: 'SM-260',
  },
  {
    id: 'SM-260',
    slug: 'chain',
    act: 3,
    kind: 'choice',
    title: 'The chain',
    note: 'The car stops. Headlights on a rusted chain strung across the track '
      + 'between two posts. Lag gets out without being asked, unhooks it, drops '
      + 'it in the dirt, gets back in. The car goes through. Lag gets out again, '
      + 'hooks the chain back up BEHIND them, and gets back in. Nobody says one '
      + 'word about any of this.',
    lines: [sd('Lag unhooks the chain, the car goes through, Lag hooks it back up behind them.')],
    options: [
      opt('Was that locked?', 'SM-261', { says: true }),
      opt('[Say nothing.]', 'SM-270', { silent: true }),
    ],
  },
  {
    id: 'SM-261',
    slug: 'chain_locked',
    act: 3,
    kind: 'lines',
    title: 'It is now',
    lines: [
      l('LAG', 'It is now.',
        { direction: 'Back to his phone. He was answering the question. He has no idea he said anything.' }),
    ],
    next: 'SM-270',
  },
  {
    id: 'SM-270',
    slug: 'dirt_three',
    act: 3,
    kind: 'lines',
    title: 'I know what goes on out in the woods',
    note: 'The single most important non-event in the scene. Tony has just said '
      + 'the quiet part and it lands in absolutely nothing. Nobody follows it '
      + 'up. Not Seff, not Numbskull.',
    lines: [
      l('PROSPECT', 'I know what goes on out in the woods.', { verbatim: true }),
      sd('silence, Lag looks over', { verbatim: true, holdSeconds: 3 }),
      l('LAG', 'You do?', { verbatim: true }),
      l('PROSPECT', 'Yeah.', { verbatim: true }),
      l('LAG', 'Huh.', { verbatim: true }),
      sd('and Lag just looks back out the window', { verbatim: true, holdSeconds: 5 }),
    ],
    next: 'SM-280',
  },
  {
    id: 'SM-280',
    slug: 'in_the_back',
    act: 3,
    kind: 'choice',
    title: 'The thing in the back',
    note: 'Two of them having a conversation that has nothing to do with Tony, '
      + 'in front of Tony. Seff is not stonewalling — from where he is '
      + 'sitting he has now told Tony twice.',
    lines: [
      l('LAG', 'Seff. Did you bring it?'),
      l('SEFF', "It's in the back."),
      l('LAG', 'Okay.'),
      sd('That is the entire exchange. It ends. Hold for long enough that the '
        + 'player understands nobody is going to say anything else.', { holdSeconds: 6 }),
      l('PROSPECT', 'Did you bring what?'),
      l('SEFF', "It's in the back.", { direction: 'Same words. Same delivery.' }),
    ],
    options: [
      opt("That's not what I asked.", 'SM-281', { says: true }),
      opt('[Say nothing.]', 'SM-290', { silent: true }),
    ],
  },
  {
    id: 'SM-281',
    slug: 'not_what_i_asked',
    act: 3,
    kind: 'lines',
    title: 'I know',
    note: 'Nothing further. Ever. This is not explained at SM-420, and it is '
      + 'not explained there either.',
    lines: [l('SEFF', 'I know.')],
    next: 'SM-290',
  },
  {
    id: 'SM-290',
    slug: 'window',
    act: 3,
    kind: 'lines',
    title: 'The window',
    note: 'Of the three of them, Numbskull is the one thinking about air. Plant '
      + 'this. It pays at SM-420 and nobody ever connects the two out loud.',
    lines: [
      l('NUMBSKULL', 'You want the window down?', { direction: 'small, quiet, from behind him' }),
      l('PROSPECT', 'No.'),
      l('NUMBSKULL', 'Okay.'),
    ],
    next: 'SM-300',
  },
  {
    id: 'SM-300',
    slug: 'dirt_four',
    act: 3,
    kind: 'lines',
    title: "He could've. / Nope.",
    note: 'The run-up to the only laugh in the scene. Give the last silence at '
      + 'least ten seconds.',
    lines: [
      l('PROSPECT', "Booski could've just told me where we were going.", { verbatim: true }),
      l('SEFF', "He could've.", { verbatim: true }),
      l('PROSPECT', "But he didn't.", { verbatim: true }),
      l('SEFF', 'Nope.', { verbatim: true }),
      sd('long silence', { verbatim: true, holdSeconds: 10 }),
    ],
    next: 'SM-310',
  },
  {
    id: 'SM-310',
    slug: 'valve',
    act: 3,
    kind: 'lines',
    title: 'THE VALVE',
    note: 'The only pressure release in the entire scene, and it is the '
      + 'owner’s. Numbskull says "Fair" completely sincerely: he has '
      + 'considered the point and conceded it. He does not laugh. Nobody in the '
      + 'car laughs.',
    lines: [
      l('NUMBSKULL', 'Relax.', { verbatim: true }),
      l('PROSPECT', "That's usually not something you want to hear from the guy sitting behind you.", { verbatim: true }),
      l('NUMBSKULL', 'Fair.', { verbatim: true }),
    ],
    next: 'SM-320',
  },
  {
    id: 'SM-320',
    slug: 'move_seats',
    act: 3,
    kind: 'choice',
    title: 'Straight back down',
    note: 'This beat exists to close the valve. It follows SM-310 immediately '
      + 'and it is not optional.',
    lines: [
      sd('Nobody laughs. The car keeps going. Twenty metres of road.', { holdSeconds: 6 }),
      l('NUMBSKULL', 'You want me to move?', { direction: 'helpfully' }),
      l('PROSPECT', '…What?'),
      l('NUMBSKULL', "Seats. If you want, I'll move.", { holdAfter: 1.8 }),
    ],
    options: [
      opt("No. You're fine.", 'SM-321', { says: true }),
      opt('Yeah. Actually — yeah.', 'SM-322', { says: true }),
      opt('[Say nothing.]', 'SM-323', { silent: true }),
    ],
  },
  {
    id: 'SM-321',
    slug: 'stay',
    act: 3,
    kind: 'lines',
    title: 'He does not move',
    note: 'Tony has now chosen the arrangement himself, out of manners, and he '
      + 'knows it.',
    lines: [
      l('NUMBSKULL', 'Okay.'),
      sd('He does not move.'),
    ],
    next: 'SM-324',
  },
  {
    id: 'SM-322',
    slug: 'swap',
    act: 3,
    kind: 'lines',
    title: 'The car reorganises itself',
    note: 'Lag slides across into the seat Numbskull has just left, directly '
      + 'behind Tony, without being asked and without looking up from his '
      + 'phone. Nobody says anything about it. Lag is asking sincerely — he '
      + 'wants to know if Tony is more comfortable.',
    lines: [
      l('NUMBSKULL', 'Okay.'),
      sd('Numbskull undoes his belt and shifts across the back seat, behind Seff.',
        { swapRear: true }),
      sd('Lag slides across into the seat Numbskull has just left. Directly behind Tony.'),
      l('LAG', 'Better?', { direction: 'sincerely' }),
    ],
    next: 'SM-324',
  },
  {
    id: 'SM-323',
    slug: 'no_answer',
    act: 3,
    kind: 'lines',
    title: "I'll stay, then",
    lines: [l('NUMBSKULL', "I'll stay, then.")],
    next: 'SM-324',
  },
  {
    id: 'SM-324',
    slug: 'final_approach',
    act: 3,
    kind: 'lines',
    title: 'The last road',
    note: 'Conversation is over. The car keeps moving long enough for the '
      + 'silence to become an answer before Tony tries once more.',
    lines: [sd('The car carries on through the last trees. Nobody speaks.', {
      holdSeconds: 3.5,
    })],
    next: 'SM-325',
  },
  {
    id: 'SM-325',
    slug: 'final_question',
    act: 3,
    kind: 'lines',
    title: 'Nobody tells him',
    note: 'The final exchange lands while the car is still moving. These are '
      + 'delivered lines already heard earlier in optional paths; reusing the '
      + 'same takes keeps the strict recording contract intact.',
    lines: [
      l('PROSPECT', 'So where are we going?', {
        cue: 'vo.specialmeeting.tony.dirt_one.1',
      }),
      l('LAG', "You'd never find it.", {
        cue: 'vo.specialmeeting.lag.own_car.1',
        direction: 'Quietly. Looking out the window, not at Tony.',
        holdAfter: 1.2,
      }),
    ],
    next: 'SM-326',
  },
  {
    id: 'SM-326',
    slug: 'drive_fade_out',
    act: 3,
    kind: 'blackout',
    title: 'FADE TO BLACK',
    note: 'A dissolve after the final line, not the old hard cut before the '
      + 'conversation. Engine and road noise continue through the fade; the '
      + 'pre-arrival road gate owns the full-black beat so a slow render clock '
      + 'cannot add a dead hold while the car finishes parking.',
    lines: [sd('Fade to black. The car continues underneath.', {
      fadeSeconds: 1.2,
      holdSeconds: 0,
    })],
    next: 'SM-327',
  },
  {
    id: 'SM-327',
    slug: 'arrival_fade_in',
    act: 3,
    kind: 'fade',
    title: 'ARRIVAL',
    note: 'The pre-arrival node releases the black quickly. The engine and road '
      + 'bed are still audible while the car finishes settling; SM-330 then kills '
      + 'the engine on screen.',
    lines: [sd('Fade up on headlights washing the trunks at the spur.', {
      fadeSeconds: 0.8,
    })],
    next: 'SM-330',
  },
  {
    id: 'SM-330',
    slug: 'arrive',
    act: 3,
    kind: 'lines',
    title: 'Arrival',
    note: 'The car slows, turns off the track onto a flat spur of dirt, and '
      + 'stops. Seff kills the engine. The headlights stay on for three or four '
      + 'seconds, on nothing — just trunks, and dark between them — and '
      + 'then he turns those off too. Total dark. The tick of a cooling engine. '
      + 'Somewhere a long way off through the trees, orange, moving.',
    lines: [sd('Engine off. Headlights hold four seconds on trunks, then off. Total dark.',
      { holdSeconds: 6 })],
    next: 'SM-400',
  },

  /* ---------------- ACT FOUR — THE TRUNK ---------------- */
  {
    id: 'SM-400',
    slug: 'getting_out',
    act: 4,
    kind: 'lines',
    title: 'Getting out',
    note: 'Nobody is in a hurry. Seff stretches his back. Lag zips his jacket '
      + 'up and puts his phone away for the first time all night — which '
      + 'reads as worse than anything he has said. Numbskull stands beside '
      + 'Tony’s door and steps back to give him room. Nobody opens it for '
      + 'him this time.',
    lines: [sd('Doors open. Lag puts his phone away.')],
    next: 'SM-410',
  },
  {
    id: 'SM-410',
    slug: 'pop_trunk',
    act: 4,
    kind: 'lines',
    title: 'Pop the trunk',
    lines: [
      l('NUMBSKULL', 'Pop the trunk.', { verbatim: true }),
      sd('Seff reaches in through the driver’s door. A clunk. The lid rises '
        + 'on its own, slowly, and the little bulb inside comes on.', {
        opensTrunk: true,
        /* The visual takes 1.1 seconds. Do not put her on the ground before the
         * lid which concealed her has actually risen. */
        holdSeconds: 1.2,
      }),
    ],
    next: 'SM-420',
  },
  /* SM-420 through SM-533: Kittenboss is a WOMAN.
   *
   * The scene was authored with her written as a man throughout -- "He climbs
   * out under his own power", "He brushes himself down", "He starts up the
   * trail", and Tony asking "Why was HE in the trunk?" -- and every one of
   * those was corrected 2026-08-20 on the owner's ruling. She is a real,
   * newish member of the club and the fourth-wall joke is that the sweetest
   * person the owner knows gets driven out in a boot and does not survive the
   * night; the voice cast on `voices.kittenboss` is a woman's and always was,
   * so the script was the last thing still calling her a bloke.
   *
   * Tony's "Why was she in the trunk?" keeps its `verbatim: true` mark. Only
   * the pronoun moved, on the owner's own instruction; the words either side
   * of it are the owner's and are not to be touched, and the manifest cue
   * `vo.specialmeeting.tony.kittenboss.2` was re-minted by hand to match on
   * the same pass, because there is no `vo:specialmeeting` generator.
   *
   * Nothing else about her moved and nothing else may. She is the same age
   * and the same rank as Tony, she is not comic relief, she is never
   * frightened, and she is more annoyed about the spare wheel than about the
   * boot. */
  {
    id: 'SM-420',
    slug: 'kittenboss',
    act: 4,
    kind: 'lines',
    title: 'Kittenboss',
    note: 'Numbskull shuts the trunk on the last word and that is the end of '
      + 'the subject. It is never explained. Not in this scene, not at the fire, '
      + 'not afterwards.',
    lines: [
      l('KITTENBOSS', 'Jesus Christ. Finally.', { verbatim: true, alternate: 'trunk_greeting' }),
      l('KITTENBOSS', 'Next time somebody crack a window.', { verbatim: true, alternate: 'trunk_greeting' }),
      sd('She climbs out under her own power, unhurried, like somebody getting '
        + 'off a long coach. She is dressed up. She has also put on something '
        + 'decent. It is extremely creased.'),
      l('PROSPECT', 'Who the hell is this?', { verbatim: true }),
      l('LAG', 'Kittenboss.', { verbatim: true }),
      l('KITTENBOSS', 'Hey.', { verbatim: true }),
      l('PROSPECT', 'Why was she in the trunk?', { verbatim: true }),
      l('NUMBSKULL', 'Long story.', { verbatim: true, direction: 'shuts the trunk on the last word' }),
      sd('Numbskull shuts the trunk on the last word.', { closesTrunk: true }),
    ],
    next: 'SM-430',
  },
  {
    id: 'SM-430',
    slug: 'kittenboss_more',
    act: 4,
    kind: 'lines',
    title: 'Kittenboss, continued',
    note: 'Seff is not being funny. He is being accurate.',
    lines: [
      sd('She brushes herself down. Rolls one shoulder. Looks at the trees, '
        + 'then at the car, then at Tony.'),
      l('KITTENBOSS', "There's a spare wheel in there. Nobody tells you that."),
      l('KITTENBOSS', 'How long was that? Honestly. Ballpark.'),
      l('SEFF', 'Forty minutes.'),
      l('KITTENBOSS', 'It was not forty minutes.'),
      l('SEFF', 'Forty-two.'),
      l('KITTENBOSS', 'Right. Thank you.'),
    ],
    next: 'SM-440',
  },
  {
    id: 'SM-440',
    slug: 'kittenboss_hub',
    act: 4,
    kind: 'choice',
    title: 'Talking to Kittenboss',
    note: 'Available while the four of them sort themselves out by the car. Ask '
      + 'as many as the player likes.',
    repeatable: true,
    options: [
      opt('Are you all right?', 'SM-441', { says: true }),
      opt('Why were you in the trunk?', 'SM-442', { says: true }),
      opt('Are you a prospect?', 'SM-443', { says: true }),
      opt('Do you know what this is?', 'SM-444', { says: true }),
      opt('Nice to meet you.', 'SM-445', { says: true }),
      opt('[Say nothing.]', 'SM-446', { silent: true }),
      opt('[Leave it. They are waiting.]', 'SM-500', { silent: true, leaves: true }),
    ],
  },
  {
    id: 'SM-441',
    slug: 'kb_ok',
    act: 4,
    kind: 'lines',
    title: 'Are you all right?',
    lines: [l('KITTENBOSS', "I'm annoyed. That's different.")],
    next: 'SM-440',
  },
  {
    id: 'SM-442',
    slug: 'kb_trunk',
    act: 4,
    kind: 'lines',
    title: 'Why were you in the trunk?',
    note: 'Two prospects who do not know. This is the moment the player '
      + 'realises nobody is going to tell either of them anything, ever.',
    lines: [
      l('KITTENBOSS', "You'd have to ask them."),
      l('PROSPECT', 'I did.'),
      l('KITTENBOSS', 'And?'),
      l('PROSPECT', 'Long story.'),
      l('KITTENBOSS', "Yeah. That's what I got."),
    ],
    next: 'SM-440',
  },
  {
    id: 'SM-443',
    slug: 'kb_prospect',
    act: 4,
    kind: 'lines',
    title: 'Are you a prospect?',
    note: 'The first evidence the player is not being executed — two '
      + 'prospects, brought to the same place on the same night — and it '
      + 'arrives only after the peak of the dread, and it arrives with one of '
      + 'them having come in the boot. Do not let anybody underline it.',
    lines: [
      l('KITTENBOSS', 'Since March.', { holdAfter: 1.8 }),
      l('KITTENBOSS', 'You?'),
      l('PROSPECT', '…Yeah.'),
      l('KITTENBOSS', 'Right.'),
      sd('She looks at the trees. Neither of them says the obvious thing.'),
    ],
    next: 'SM-440',
  },
  {
    id: 'SM-444',
    slug: 'kb_what',
    act: 4,
    kind: 'lines',
    title: 'Do you know what this is?',
    note: 'She is not reassured. She is talking herself down, badly, and Tony '
      + 'can hear her doing it.',
    lines: [
      l('KITTENBOSS', 'Do you know what this is?', { direction: 'turning the question straight back' }),
      l('PROSPECT', 'No.'),
      l('KITTENBOSS', "You've been around longer than me."),
      l('PROSPECT', 'I have.'),
      l('KITTENBOSS', 'So.'),
      l('PROSPECT', "So I don't know."),
      l('KITTENBOSS', 'Okay. Good. Good.'),
    ],
    next: 'SM-440',
  },
  {
    id: 'SM-445',
    slug: 'kb_nice',
    act: 4,
    kind: 'lines',
    title: 'Nice to meet you',
    lines: [
      l('KITTENBOSS', 'Is it?', { holdAfter: 1.6 }),
      l('KITTENBOSS', 'Sorry. That was— yeah. You too.', { direction: 'she hears herself' }),
    ],
    next: 'SM-440',
  },
  {
    id: 'SM-446',
    slug: 'kb_collar',
    act: 4,
    kind: 'lines',
    title: 'Do I look all right?',
    lines: [
      sd('Kittenboss falls in beside him anyway.'),
      l('KITTENBOSS', 'Do I look all right?'),
      l('PROSPECT', "You've got—", { direction: 'gestures at his own collar' }),
      l('KITTENBOSS', 'Yeah. Thanks.', { direction: 'fixes it' }),
    ],
    next: 'SM-440',
  },

  /* ---------------- ACT FIVE — THE WALK ---------------- */
  {
    id: 'SM-500',
    slug: 'off_we_go',
    act: 5,
    kind: 'lines',
    title: 'Off we go',
    lines: [l('SEFF', "Come on. They're waiting.", { verbatim: true })],
    next: 'SM-510',
  },
  {
    id: 'SM-510',
    slug: 'you_first',
    act: 5,
    kind: 'lines',
    title: 'You first',
    note: 'Numbskull says the last line to be helpful. It is the worst line in '
      + 'the scene and it is said kindly.',
    lines: [
      sd('Seff points up the trail with two fingers, the way you give directions.'),
      l('SEFF', "Trail's up there. Straight up. You can't miss it."),
      l('SEFF', 'You go ahead.'),
      l('PROSPECT', "You're not leading?"),
      l('LAG', "It's one trail."),
      l('NUMBSKULL', "We're right behind you.", { direction: 'helpfully' }),
    ],
    next: 'SM-520',
  },
  {
    id: 'SM-520',
    slug: 'trailhead',
    act: 5,
    kind: 'choice',
    title: 'Options at the trailhead',
    note: 'All roads lead to SM-530. Nobody argues, nobody insists twice, and '
      + 'nobody lays a hand on him. They just wait, comfortably, and waiting wins.',
    options: [
      opt('You first.', 'SM-521'),
      opt('Walk with me.', 'SM-522'),
      opt('How far is it?', 'SM-523'),
      opt('Kittenboss. You go first.', 'SM-524'),
      opt('[Start walking.]', 'SM-530', { silent: true, accepts: true }),
    ],
  },
  {
    id: 'SM-521',
    slug: 'tb_you_first',
    act: 5,
    kind: 'lines',
    title: 'You first',
    note: 'Lag is not asking a question. He is repeating it back to check he '
      + 'heard it. Then nothing. Nobody moves. Nobody is going to.',
    lines: [
      l('PROSPECT', 'You first.'),
      l('SEFF', 'Nah, go on.'),
      l('PROSPECT', "I'd rather follow."),
      l('LAG', "You'd rather follow.", { direction: 'not a question', holdAfter: 2.5 }),
      l('NUMBSKULL', "It's a nice trail."),
    ],
    next: 'SM-520',
  },
  {
    id: 'SM-522',
    slug: 'tb_walk_with_me',
    act: 5,
    kind: 'lines',
    title: 'Walk with me',
    lines: [
      l('PROSPECT', 'Walk with me.'),
      l('NUMBSKULL', 'Sure.'),
      sd('He does. He walks beside Tony for four steps and then, without any '
        + 'apparent decision, drifts half a step back.'),
      l('PROSPECT', "You're still behind me."),
      l('NUMBSKULL', 'Yeah.'),
    ],
    next: 'SM-530',
  },
  {
    id: 'SM-523',
    slug: 'tb_how_far',
    act: 5,
    kind: 'lines',
    title: 'How far is it?',
    lines: [
      l('PROSPECT', 'How far is it?'),
      l('SEFF', "You'll see the fire."),
      l('PROSPECT', "There's a fire?"),
      l('SEFF', "There's a fire.", { direction: 'That is all he says. He starts walking.' }),
    ],
    next: 'SM-530',
  },
  {
    id: 'SM-524',
    slug: 'tb_kittenboss',
    act: 5,
    kind: 'lines',
    title: 'Kittenboss, you go first',
    note: 'So both prospects walk in front, side by side, with three men behind '
      + 'them. Which is somehow worse, and is also the clearest evidence yet, '
      + 'and neither of those cancels the other.',
    lines: [
      l('PROSPECT', 'Kittenboss. You go first.'),
      l('KITTENBOSS', 'Why me?'),
      l('PROSPECT', "You've been here longer tonight than I have."),
      l('KITTENBOSS', "That's fair.", { direction: 'genuinely weighs it' }),
      sd('She starts up the trail.'),
      l('LAG', 'Both of you.'),
    ],
    next: 'SM-530',
  },
  {
    id: 'SM-530',
    slug: 'trail',
    act: 5,
    kind: 'lines',
    title: 'The trail',
    note: 'Dark. Roots. Breath. Lag has his phone torch out and is pointing it '
      + 'at the ground in front of Tony’s feet — so all the light on '
      + 'the path is coming from behind him, and his own shadow is thrown up the '
      + 'trail ahead of him. Nobody mentions this. Beats fire on distance '
      + 'travelled, spaced well apart.',
    lines: [sd('Lag’s torch, from behind, throwing Tony’s shadow up the trail.')],
    next: 'SM-531',
  },
  {
    id: 'SM-531',
    slug: 'trail_talk',
    act: 5,
    kind: 'lines',
    title: 'Are we allowed to talk?',
    lines: [
      l('KITTENBOSS', 'Are we allowed to talk?', { direction: 'quietly' }),
      l('PROSPECT', "I don't know."),
      l('KITTENBOSS', 'Right.'),
    ],
    next: 'SM-532',
  },
  {
    id: 'SM-532',
    slug: 'trail_mattress',
    act: 5,
    kind: 'lines',
    title: 'The men behind',
    note: 'Seff and Lag, behind them, having an entirely ordinary conversation. '
      + 'They are not lowering their voices. They are not talking about tonight '
      + 'at all. Nothing comes of it. It just stops, the way conversations do.',
    lines: [
      l('SEFF', 'So the mattress thing. If I get the truck for Thursday—'),
      l('LAG', "You're not getting the truck."),
      l('SEFF', 'If I get the truck.'),
      l('LAG', 'Mm.'),
      l('SEFF', "That's all I'm saying. If."),
    ],
    next: 'SM-533',
  },
  {
    id: 'SM-533',
    slug: 'trail_comfort',
    act: 5,
    kind: 'lines',
    title: 'Kittenboss tries',
    note: 'Do not play this for the laugh. She tried to comfort a man and '
      + 'could not find anything to say, and they both have to keep walking.',
    lines: [
      l('KITTENBOSS', 'Hey. If this goes bad—', { direction: 'low, so only Tony hears' }),
      l('PROSPECT', 'Yeah?', { holdAfter: 4 }),
      l('KITTENBOSS', 'No. I had nothing. Sorry.'),
    ],
    next: 'SM-534',
  },
  {
    id: 'SM-534',
    slug: 'trail_light',
    act: 5,
    kind: 'choice',
    title: 'First light',
    note: 'Ahead, the trunks nearest the path pick up an orange edge on one '
      + 'side. Not a glow yet — just an edge, and it moves. Nobody mentions '
      + 'it. Do not have anybody mention it.',
    lines: [sd('An orange edge on one side of the nearest trunks. It moves.')],
    options: [
      opt('Is that it?', 'SM-5341', { says: true }),
      opt('[Say nothing.]', 'SM-535', { silent: true }),
    ],
  },
  {
    id: 'SM-5341',
    slug: 'trail_keep_going',
    act: 5,
    kind: 'lines',
    title: 'Keep going',
    lines: [l('SEFF', 'Keep going.')],
    next: 'SM-535',
  },
  {
    id: 'SM-535',
    slug: 'trail_record',
    act: 5,
    kind: 'lines',
    title: 'On the record',
    note: 'He is not threatening Tony. He is a man who has put something on a '
      + 'record before something happens, and Tony can hear the shape of that. '
      + 'Numbskull does not answer the last question. Twigs. Boots. The orange '
      + 'getting stronger on the left-hand side of every trunk.',
    lines: [
      l('NUMBSKULL', 'I told them I like you.', { direction: 'close behind him, quiet, almost private' }),
      l('PROSPECT', '…Okay.'),
      l('NUMBSKULL', 'I wanted that said.', { holdAfter: 2.5 }),
      l('PROSPECT', 'Said to who?'),
      sd('Numbskull does not answer.', { holdSeconds: 6, unanswered: true }),
    ],
    next: 'SM-536',
  },
  {
    id: 'SM-536',
    slug: 'trail_voices',
    act: 5,
    kind: 'lines',
    title: 'Voices',
    note: 'Ahead through the trees: not words. Just the shape of a lot of men '
      + 'talking at once, low, the sound a room makes. Then it stops. All of it, '
      + 'at once, the way a room goes quiet when a door opens. This is the last '
      + 'exchange before the trees open.',
    lines: [
      sd('The shape of a lot of men talking at once. Then it stops, all at once.'),
      l('PROSPECT', "They've gone quiet."),
      l('LAG', 'Yeah.'),
    ],
    next: 'SM-540',
  },
  {
    id: 'SM-540',
    slug: 'handoff',
    act: 5,
    kind: 'handoff',
    title: 'HAND-OFF',
    note: 'The trail opens out. Firelight on a lot of faces, all of them already '
      + 'turned this way. Nobody in the clearing is moving. Nobody in the '
      + 'clearing is smiling. The scene ends here and INITIATION NIGHT takes '
      + 'over — it owns its own approach and this scene must not duplicate it.',
    lines: [
      sd('The trail opens out. Firelight on a lot of faces, already turned this way.'),
      l('SEFF', 'Go on.', { verbatim: true, direction: 'from behind him, quietly' }),
    ],
  },
];

/* ====================================================================== *
 * CUE NAMING
 *
 * One place builds cue names, so a cue can never exist in the manifest under
 * a name the runtime does not ask for. The call gets the call bank; everything
 * else gets `vo.specialmeeting.<who>.<beat slug>.<n>`, numbered per speaker
 * within the beat so adding a Seff line never renumbers Lag's.
 * ====================================================================== */
function cueName(beat, sp, index) {
  if (beat.kind === 'call') {
    return sp.key === 'PROSPECT'
      ? `${CALL_CUE_PREFIX}tony.${index}`
      : `${CALL_CUE_PREFIX}${index}`;
  }
  return `${CUE_PREFIX}${sp.slug}.${beat.slug}.${index}`;
}

function buildBeats() {
  const built = RAW_BEATS.map((beat) => {
    const counters = new Map();
    const lines = (beat.lines ?? []).map((raw) => {
      if (raw.stage !== undefined) return Object.freeze({ ...raw, spoken: false });
      const sp = SPEAKERS[raw.who];
      if (!sp) throw new Error(`${beat.id}: unknown speaker "${raw.who}"`);
      const n = (counters.get(sp.key) ?? 0) + 1;
      counters.set(sp.key, n);
      return Object.freeze({
        ...raw,
        spoken: true,
        speaker: sp,
        voice: sp.voice,
        /* A repeated line may deliberately reuse its delivered take. The final
         * drive coda does this for two earlier questions instead of minting an
         * unrecorded cue and letting a fallback hide the missing performance. */
        cue: raw.cue ?? cueName(beat, sp, n),
      });
    });
    const options = (beat.options ?? []).map((o, i) => Object.freeze({
      ...o,
      index: i + 1,
      voice: o.says ? SPEAKERS.PROSPECT.voice : null,
      cue: o.says ? `${CUE_PREFIX}tony.${beat.slug}.opt${i + 1}` : null,
    }));
    return Object.freeze({
      next: null,
      note: '',
      repeatable: false,
      holdSeconds: 0,
      ...beat,
      lines: Object.freeze(lines),
      options: Object.freeze(options),
    });
  });
  return Object.freeze(built);
}

export const BEATS = buildBeats();

const INDEX = new Map(BEATS.map((b) => [b.id, b]));

/** One beat by id. Throws rather than returning undefined: a typo is a bug. */
export function beat(id) {
  const found = INDEX.get(id);
  if (!found) throw new Error(`No such Special Meeting beat: ${id}`);
  return found;
}

export function hasBeat(id) { return INDEX.has(id); }

/** Every beat in an act, in authored order. */
export function beatsInAct(act) { return BEATS.filter((b) => b.act === act); }

/**
 * Every recordable line in the scene, in play order.
 *
 * This is the list the manifest must match exactly. `say` is the words as
 * spoken; `voice` is the manifest profile; `verbatim` marks the owner's own.
 */
export function scriptCues() {
  const out = [];
  for (const b of BEATS) {
    for (const line of b.lines) {
      if (!line.spoken) continue;
      out.push(Object.freeze({
        name: line.cue,
        voice: line.voice,
        say: line.text,
        beat: b.id,
        who: line.who,
        verbatim: Boolean(line.verbatim),
      }));
    }
    for (const o of b.options) {
      if (!o.cue) continue;
      out.push(Object.freeze({
        name: o.cue,
        voice: o.voice,
        say: o.text,
        beat: b.id,
        who: 'PROSPECT',
        verbatim: false,
      }));
    }
  }
  return Object.freeze(out);
}

/* ====================================================================== *
 * THE FRONT-SEAT PROPERTY
 *
 * The scene's whole claim, as a function. Walk the hub's options; every one
 * of them either sits him down or comes back to the hub, and the hub always
 * offers the seat. There is no third outcome and there is no exit.
 * ====================================================================== */

/** The beat the player cannot avoid: he is in the front seat when it ends. */
export const HUB_ID = 'SM-110';
export const SEAT_ID = 'SM-190';

/**
 * Follow a hub option to its end.
 *
 * Returns `'seat'` if the branch puts him in the front seat, `'hub'` if it
 * returns him to the hub, and throws if a branch ever runs off the end of the
 * graph — which is the failure this scene cannot survive.
 */
export function followHubOption(option, { limit = 32 } = {}) {
  let id = option.to;
  for (let step = 0; step < limit; step += 1) {
    if (id === SEAT_ID) return 'seat';
    const b = beat(id);
    if (id === HUB_ID) return 'hub';
    if (!b.next) {
      throw new Error(`Special Meeting branch ${option.to} dead-ends at ${id}: `
        + 'every refusal must come back to the hub or end in the front seat');
    }
    id = b.next;
  }
  throw new Error(`Special Meeting branch ${option.to} does not settle`);
}

/** Which hub options are on the table after `declines` refusals. */
export function hubOptions(declines = 0) {
  return beat(HUB_ID).options.filter((o) => o.unlocksAfter <= declines);
}

/** The seating the car pulls away in. This is the scene. */
export const FINAL_SEATING = Object.freeze({
  driver: CHARACTER_IDS.SEFF,
  front_passenger: CHARACTER_IDS.PROSPECT,
  rear_left: CHARACTER_IDS.LAG,
  rear_right: CHARACTER_IDS.NUMBSKULL,
});

/** And the one in the boot, which nobody mentions until the car stops. */
export const TRUNK_OCCUPANT = CHARACTER_IDS.KITTENBOSS;

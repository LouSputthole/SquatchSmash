/**
 * INITIATION NIGHT — the cabin rewrite, as data.
 *
 * `docs/INITIATION-CABIN-SCRIPT.md` is the owner's document and stays the
 * authority on intent. This file is the same script in a shape the runtime and
 * the tests can both read: one entry per beat, one cue per spoken line, and
 * the branch graph written down rather than implied by control flow.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT IN `dialogue.js`
 *
 * `dialogue.js`'s `CEREMONY_BEATS` feeds `tools/initiation-vo-lib.mjs`, which
 * `npm run check` diffs against `assets/sfx/manifest.json` in BOTH directions:
 * a line added there with no manifest row fails the build as `missing`, and a
 * line removed fails it as `stale`. This pass does not own the manifest — the
 * new cues are handed off in `docs/audio/pending-initiation-cues.json` for the
 * orchestrator to merge — so the thirty-two shipped ceremony cues are left
 * exactly as they are and the rewrite's ninety-odd live here instead.
 *
 * Once the handoff is merged, `allCeremonyVoiceLines()` should be widened to
 * include `allCabinVoiceLines()` and `RETIRED_CEREMONY_CUES` should be dropped
 * from `CEREMONY_BEATS` and added to `assets/sfx/rerecord.json`'s retired
 * array — in that order, in one commit, because either half on its own is a
 * red `npm run check`.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE RULES THIS FILE EXISTS TO HOLD
 *
 *   1. KITTENBOSS IS "SHE", everywhere — subtitle, comment, stage direction.
 *      She is in the line, she is walked out last, and she is shot. Nobody in
 *      this scene or any later one remarks on it. `FORBIDDEN_PHRASES` below
 *      is the machine-readable half of that.
 *   2. GRATIN AND SEFF NEVER ENJOY IT. Every line either of them has is about
 *      logistics, footing or the weather. Not one is a threat and not one is a
 *      joke they are in on.
 *   3. THE SCENE NEVER WINKS (docs/TONE-AND-PARODY.md). No character remarks
 *      that any of this is like anything.
 *   4. `verbatim: true` marks the owner's own words. Pinned by hash in
 *      `tests/initiation-cabin-ceremony.test.mjs`, so a punch-up pass cannot
 *      quietly soften them.
 */
import { CHARACTER_IDS } from '../core/campaign.js';
import { initiationVoiceLine, uniqueInitiationVoiceLines } from './voice.js';

/**
 * The scope every cue in the rewrite is minted under.
 *
 * `ceremony` is the shipped bank and is frozen; `cabin` is this one. Both sit
 * under `vo.initiation.`, which is what maps them to this scene in
 * `tools/check-line-presence.mjs` and in the recording sheet.
 */
export const CUE_SCOPE = 'cabin';

/* ====================================================================== *
 * WHO SPEAKS
 *
 * `voice` is the manifest profile id — the thing a recording is actually cut
 * against. `who` is the subtitle name and is what goes on screen.
 * ====================================================================== */
const speaker = (key, name, voice, character = null) => Object.freeze({
  key, name, voice, character,
});

export const SPEAKERS = Object.freeze({
  PROSPECT: speaker('PROSPECT', 'PROSPECT', 'player', CHARACTER_IDS.PROSPECT),
  BOOSKIBRO: speaker('BOOSKIBRO', 'BOOSKIBRO', 'booski', CHARACTER_IDS.BOOSKI),
  /* 'lou', not 'lou1'. Both profiles carry the same ElevenLabs id, and every
   * shipped `vo.initiation.ceremony.*` line of his is cut on 'lou'; splitting
   * one man across two profile names inside one scene is how a bank ends up
   * half-recorded with nothing reporting it. */
  LOU: speaker('LOU', 'BIG UNCLE LOU SPUTTHOLE', 'lou', CHARACTER_IDS.LOU),
  GRATIN: speaker('GRATIN', 'GRATIN', 'gratin', CHARACTER_IDS.GRATIN),
  SEFF: speaker('SEFF', 'SEFF', 'seff', CHARACTER_IDS.SEFF),
  KITTENBOSS: speaker('KITTENBOSS', 'KITTENBOSS', 'kittenboss', CHARACTER_IDS.KITTENBOSS),
  RIPPINFLOW: speaker('RIPPINFLOW', 'RIPPINFLOW', 'rippinflow', CHARACTER_IDS.RIPPINFLOW),
  SHUBENATOR: speaker('SHUBENATOR', 'THE SHUBENATOR', 'shubenator', CHARACTER_IDS.SHUBENATOR),
  NUMBSKULL: speaker('NUMBSKULL', 'NUMBSKULL', 'numbskull', CHARACTER_IDS.NUMBSKULL),
  LAG: speaker('LAG', 'LAG', 'lag', CHARACTER_IDS.LAG),
  IRISH: speaker('IRISH', 'IRISH', 'irish', CHARACTER_IDS.IRISH),
  HOGMAMA: speaker('HOGMAMA', 'HOG MAMA', 'hogmama', CHARACTER_IDS.HOG_MAMA),
  ERIC: speaker('ERIC', 'ERIC', 'eric', CHARACTER_IDS.ERIC),
  SNOW: speaker('SNOW', 'SNOW', 'snow', CHARACTER_IDS.SNOW),
  APE: speaker('APE', 'APE', 'ape', CHARACTER_IDS.APE),
  DEATHMEGATRON: speaker('DEATHMEGATRON', 'DEATHMEGATRON', 'deathmegatron', CHARACTER_IDS.DEATHMEGATRON),
  SASOLE: speaker('SASOLE', 'CAPTAIN LOU SASOLE', 'lou2', CHARACTER_IDS.CAPTAIN_LOU_SASOLE),
  /* The prospects who die. PROSPECT ONE keeps the shipped 'doorman' profile
   * he has always had; THREE and FIVE are the two reserve male profiles,
   * which exist for exactly this — a named body with a handful of lines and
   * no further life in the campaign. PROSPECT FOUR is deliberately absent: he
   * does not speak in this scene at all, not one word, not one sound. */
  PROSPECT_ONE: speaker('PROSPECT_ONE', 'PROSPECT ONE', 'doorman'),
  PROSPECT_THREE: speaker('PROSPECT_THREE', 'PROSPECT THREE', 'npc-reserve-1'),
  PROSPECT_FIVE: speaker('PROSPECT_FIVE', 'PROSPECT FIVE', 'npc-reserve-2'),
});

/**
 * Phrases that may never appear in a line in this scene.
 *
 * The first four are the owner's rule for Kittenboss: nobody explains her,
 * nobody eulogises her, nobody makes it cute. The last three are the tone
 * doctrine — the scene may not point at its own reference.
 */
export const FORBIDDEN_PHRASES = Object.freeze([
  'poor kittenboss',
  'she was the sweetest',
  'i am sorry about her',
  'nothing personal',
  'like a movie',
  'like a film',
  'just like in the',
]);

/* ====================================================================== *
 * AUTHORING
 *
 * `l()` is a spoken line and gets a cue. `sd()` is a stage direction: it is
 * never recorded and never shown, and it is here because half of this scene
 * is what nobody says. `direction` rides along on a line into the recording
 * handoff, so the booth reads the same note the code does.
 * ====================================================================== */
const l = (who, text, opts = {}) => Object.freeze({ who, text, ...opts });
const sd = (text) => Object.freeze({ stage: text });

const isLine = (entry) => typeof entry?.text === 'string';

/**
 * One beat: an id, the act it is in, the phase that plays it, and its entries.
 *
 * The cue's speaker slug is `${id}-${who}`, which is what guarantees two
 * identical words in two different beats — Gratin says "Right." twice tonight
 * — are two different recordings rather than one cue quietly reused.
 */
function beat(id, act, phase, entries, extra = {}) {
  const lines = [];
  const script = entries.map((entry) => {
    if (!isLine(entry)) return entry;
    const spec = SPEAKERS[entry.who];
    if (!spec) throw new Error(`Initiation cabin script: unknown speaker "${entry.who}" in ${id}`);
    const line = initiationVoiceLine({
      scope: CUE_SCOPE,
      speaker: `${id}-${spec.key}`,
      voice: spec.voice,
      who: spec.name,
      text: entry.text,
      beat: id,
      speakerKey: spec.key,
      character: spec.character,
      direction: entry.direction ?? null,
      verbatim: entry.verbatim === true,
    });
    lines.push(line);
    return line;
  });
  return Object.freeze({
    id, act, phase, ...extra,
    script: Object.freeze(script),
    lines: Object.freeze(lines),
  });
}

/** A player option at a choice. `to` is the beat it opens. */
const opt = (text, to, extra = {}) => Object.freeze({ text, to, ...extra });

/* ====================================================================== *
 * ACT ONE — THE CLEARING
 *
 * Ships today and stays. The only new words in this act are Kittenboss in the
 * line, Prospect One asking for another go, and Kittenboss afterwards. The
 * speech, the first question, Prospect One's answer and Prospect One's death
 * are `dialogue.js`'s and are not touched — their cue ids embed a hash of the
 * words, and rewording one silently orphans a delivered recording.
 * ====================================================================== */

const IN_030 = beat('IN-030', 1, 'line_chat', [
  sd('She is four along, at the far end of the row, standing in front of an '
    + 'open car boot that nobody shuts and nobody refers to. She leans '
    + 'forward to see past three men and speaks out of the side of her mouth '
    + 'without turning her head.'),
  l('KITTENBOSS', 'Do you know any of this?', {
    direction: 'Conversational, sideways, not lowered. She is making '
      + 'small talk in a queue.',
  }),
], {
  choice: Object.freeze({
    prompt: 'Kittenboss is talking to you.',
    /* Three options and three buttons. `#quiz` in initiation.html has exactly
     * three, and this scene may not add DOM. */
    options: Object.freeze([
      opt('No.', 'IN-031'),
      opt('Some of it.', 'IN-032'),
      opt('[Say nothing.]', 'IN-033', { silent: true }),
    ]),
    /* The first time the game offers him silence and does not punish him for
     * it. It is doing that on purpose — see IN-180. */
    timeout: 6,
    fallback: 'IN-033',
  }),
});

const IN_031 = beat('IN-031', 1, 'line_chat_reply', [
  l('PROSPECT', 'No.'),
  l('KITTENBOSS', 'No, me neither.', { direction: 'Cheerful. Completely unbothered.' }),
  sd('She straightens up and faces front. That is the entire conversation.'),
]);

const IN_032 = beat('IN-032', 1, 'line_chat_reply', [
  l('PROSPECT', 'Some of it.'),
  l('KITTENBOSS', 'Which bit?'),
  sd('Nothing. He does not actually know which bit.'),
  l('KITTENBOSS', 'Right.', { direction: 'Not a challenge. She has simply accepted it.' }),
]);

const IN_033 = beat('IN-033', 1, 'line_chat_reply', [
  sd('He says nothing. After a moment:'),
  l('KITTENBOSS', 'Fair enough.'),
]);

const IN_060 = beat('IN-060', 1, 'q1_again', [
  l('PROSPECT_ONE', 'Can I have another go?', {
    direction: 'Bright. He thinks he has been marked wrong on a quiz. He does '
      + 'not understand what is happening until the moment it does.',
  }),
  sd('Nobody answers him. One man steps out of the ring behind the line, '
    + 'walks unhurriedly around the front of it, and stops in front of him. '
    + 'This is SEFF. Prospect One watches him come the whole way, still '
    + 'smiling, waiting to be told the rules. Seff draws.'),
  l('PROSPECT_ONE', 'Oh.', {
    direction: 'Small. Two letters and it is the last thing he says. He is not '
      + 'frightened yet — he has only this second understood, and there is no '
      + 'time left to be anything about it.',
  }),
]);

const IN_075 = beat('IN-075', 1, 'after_one', [
  sd('Long. Longer than is comfortable. Two engines idling, a drum burning '
    + 'eight metres west, and one man face-up in the mud in front of the line.'),
  l('KITTENBOSS', 'That’s not— that’s not standard, is it?', {
    direction: 'Quiet, after far too long. She is asking whether the paperwork '
      + 'is normal. She is wrong, and she will not find out.',
  }),
  sd('Nobody answers her either.'),
]);

/* ====================================================================== *
 * ACT TWO — CLEAR THE LINE
 *
 * The turn of the scene. He has just been told he passed. He is standing in a
 * line, relieved, next to a corpse, and he is about to find out that passing
 * had nothing to do with anything.
 *
 * NOBODY IN THIS ACT EXPLAINS A SINGLE THING. Not to the prospects, not to
 * the player, not to each other.
 * ====================================================================== */

const IN_100 = beat('IN-100', 2, 'clear_line', [
  sd('Booskibro does not raise his voice. He has been booming all night; this '
    + 'is the first thing he has said at a normal volume, and it is the reason '
    + 'the line notices. He is standing in the mud with everybody else.'),
  l('BOOSKIBRO', 'Clear the line.', {
    direction: 'Flat and ordinary. An instruction to two men at the back, not '
      + 'an announcement to the line. Do not perform it.',
  }),
  sd('Nobody in the line knows what it means and two men at the back do. The '
    + 'only thing that happens is that two people start walking.'),
]);

const IN_110 = beat('IN-110', 2, 'exec_setup', [
  sd('They come out of the Circle together, from behind the line, and walk '
    + 'past the prospects without looking at them. Gratin is carrying nothing. '
    + 'Seff has the pistol down at his side, the way you carry a tool across a '
    + 'yard. Neither of them hurries at any point in this act.'),
  l('GRATIN', 'Are we doing all of them here?', {
    direction: 'A genuine question about a genuine problem. Two colleagues on '
      + 'a wet job. No subtext, no relish, no weight.',
  }),
  l('SEFF', 'Yeah.'),
  l('GRATIN', 'Only the ground’s better up by the stump.'),
  l('SEFF', 'Here’s fine.'),
  l('GRATIN', 'Right.'),
  sd('Nothing comes of it. It just stops, the way that conversation stops.'),
]);

const IN_120 = beat('IN-120', 2, 'exec_prospect', [
  sd('Gratin walks down the line and stops in front of him. He does not take '
    + 'hold of him. He just stands there, and waits, and waiting wins.'),
  l('GRATIN', 'This way.'),
  l('PROSPECT_THREE', 'No — hold on. Hold on.'),
  sd('He does not move. Gratin does not repeat himself.'),
  l('PROSPECT_THREE', 'I wasn’t even asked. He got asked. He got a question.', {
    direction: 'He means Tony. He is right.',
  }),
  l('PROSPECT_THREE', 'Nobody asked me a question. That’s — that’s not right, that. That’s not right.'),
  sd('Nobody answers him. Not Booskibro, not Lou, not Gratin. The Circle does '
    + 'not even look up.'),
  l('GRATIN', 'Come on.'),
  l('PROSPECT_THREE', 'I’m not — I’ll do the question. Ask me the question.'),
  l('GRATIN', 'Knees.'),
  l('PROSPECT_THREE', 'Ask me the question.'),
  l('GRATIN', 'Knees. Sorry — it’s wet. It’s been wet all week.', {
    direction: 'The apology is manners, not mockery. He means it about the mud '
      + 'and he means nothing else by it.',
  }),
  sd('He goes down. Gratin turns him by the shoulder, gently, the way you’d '
    + 'move somebody in a doorway.'),
  l('GRATIN', 'Other way round.'),
  sd('Now he is facing the line, square-ish to it, turned a little in toward '
    + 'its centre. He is looking straight at the three people who are next, '
    + 'and at Tony.'),
  l('PROSPECT_THREE', 'Are you seeing this? Are you—', {
    direction: 'To the line. To Tony. He is cut off mid-word and must be: he '
      + 'does not finish the sentence and he does not get a last look.',
  }),
  sd('SEFF fires. He goes forward, face down, at the foot of the mark.'),
], { victim: 'PROSPECT THREE', mark: 'kneel-1', shooter: 'SEFF' });

const IN_130 = beat('IN-130', 2, 'exec_prospect', [
  sd('He steps out before Gratin reaches him. He does not speak in this scene '
    + 'at all — not one word, not one sound. He understood at IN-070 and he '
    + 'has had three minutes with it.'),
  sd('Halfway to the mark he stops, unbuckles his watch, and holds it out. He '
    + 'does not say who it is for. There is nobody it could be for. Gratin '
    + 'takes it, because a man has handed him something and refusing would be '
    + 'rude.'),
  l('GRATIN', '...Thanks.', { direction: 'Automatic. The politeness of a man handed a thing.' }),
  sd('Prospect Four kneels on the mark before he is asked, and turns himself '
    + 'to face the line without being told. Gratin has nothing to do.'),
  l('GRATIN', 'That’s it. Good.'),
  sd('SEFF fires. Gratin puts the watch in his own jacket pocket without '
    + 'looking at it. It is never mentioned again, in this scene or in any '
    + 'other.'),
], { victim: 'PROSPECT FOUR', mark: 'kneel-2', shooter: 'SEFF' });

const IN_140 = beat('IN-140', 2, 'exec_reload', [
  sd('Seff breaks off and works on the pistol. Unhurried. It is empty and he '
    + 'is filling it. Prospect Five has to stand there and wait for this — he '
    + 'is already on the mark, on his knees, facing the line, and the man '
    + 'behind him is loading.'),
  l('SEFF', 'You want it?'),
  l('GRATIN', 'I’ll take the last two.'),
  l('SEFF', 'Right.'),
  sd('He hands the pistol across. There is one pistol in this scene and this '
    + 'is where it changes hands. Gratin checks it the way you check something '
    + 'somebody has handed you — not suspicion, manners.'),
]);

const IN_145 = beat('IN-145', 2, 'exec_prospect', [
  sd('He has been agreeing with everything since IN-100. He agreed with '
    + '"Clear the line". He comes out before he is called.'),
  l('PROSPECT_FIVE', 'Yeah — no, absolutely.'),
  l('PROSPECT_FIVE', 'Sorry — here? Is here good?', { direction: 'At the mark, before anybody has said anything to him.' }),
  l('GRATIN', 'Here’s good.'),
  l('PROSPECT_FIVE', 'I can do it myself, honestly.'),
  sd('He kneels. He turns himself around. He is being helpful, because being '
    + 'liked is the only skill he has ever had and he is going to use it right '
    + 'up until it stops working.'),
  l('PROSPECT_FIVE', 'D’you want me to—', { direction: 'During the reload.' }),
  l('GRATIN', 'No. Stay there.'),
  l('PROSPECT_FIVE', 'Course. Yeah. Sorry.'),
  sd('A long beat. Then, and this is the one:'),
  l('PROSPECT_FIVE', 'Is Booski watching? I’d just like him to know I did it right.'),
  l('GRATIN', 'He’s watching.', { direction: 'Kindly, and it is true.' }),
  l('PROSPECT_FIVE', 'Right. Good.'),
  sd('GRATIN fires. Booskibro is watching. He does not react. He has not moved '
    + 'since IN-100.'),
], { victim: 'PROSPECT FIVE', mark: 'kneel-3', shooter: 'GRATIN' });

const IN_160 = beat('IN-160', 2, 'exec_prospect', [
  sd('THE BEAT THE WHOLE SCENE EXISTS FOR. Play it completely ordinary. '
    + 'Gratin walks down to the end of the line. She sees him coming and steps '
    + 'out before he arrives, the way you do when somebody is obviously '
    + 'heading for you.'),
  l('KITTENBOSS', 'Oh — is it me? Sorry, I thought there was another one.', {
    direction: 'There is not. She had lost count. That is all that line is. '
      + 'Light, apologetic, mildly embarrassed at the admin.',
  }),
  sd('It is the longest walk of the night and she does it herself. Her mark is '
    + 'the western one, the nearest one to the player, so she crosses the '
    + 'entire working ground at her own pace, past the three already down, '
    + 'past Tony, and Gratin walks a step behind her the whole way without a '
    + 'hand on her. She is looking at the ground the whole time — not out of '
    + 'fear. She is looking at the mud.'),
  l('KITTENBOSS', 'It’s absolutely soaked down there.'),
  l('GRATIN', 'I know. Sorry.'),
  l('KITTENBOSS', 'No, it’s not you.'),
  sd('She kneels. She takes a moment to sort her knees out, shifting her '
    + 'weight, the way you do on a bad surface.'),
  l('KITTENBOSS', 'Hang on. Right.'),
  l('SEFF', 'Other way round.'),
  l('KITTENBOSS', 'Oh — sorry.'),
  sd('She turns herself around. This is the nearest mark, under three metres '
    + 'out. She is close enough for him to reach. And there is only one person '
    + 'left standing in the line. She sees him.'),
  l('KITTENBOSS', 'Hey.', {
    direction: 'ONE SYLLABLE, WARM, ORDINARY. It is the same word she says to '
      + 'Lag at the boot and it is the last word she says in the campaign. '
      + 'Nobody in the scene knows that. No music, no slow motion, no hold on '
      + 'Tony’s face — the shot arrives on the same clock as the other three.',
  }),
  sd('GRATIN fires.'),
], { victim: 'KITTENBOSS', mark: 'kneel-4', shooter: 'GRATIN' });

const IN_170 = beat('IN-170', 2, 'exec_done', [
  sd('Nothing happens for a moment. Then two men start tidying up, because '
    + 'that is what is next.'),
  l('SEFF', 'Four.'),
  l('GRATIN', 'Five, with the first one.'),
  l('SEFF', 'I’m counting these.'),
  l('GRATIN', 'Right.'),
  sd('Flat. Neither of them is scoring a point. It is a disagreement about '
    + 'scope, and it resolves.'),
  l('GRATIN', 'It’ll be wet all week.', {
    direction: 'He has looked at the mud on his hands and then at the sky. He '
      + 'is thinking about the weather and about nothing else.',
  }),
  sd('NOBODY SAYS ANYTHING ABOUT KITTENBOSS. Nobody says anything about any of '
    + 'them. This is a hard rule and it holds for the rest of the game.'),
]);

/* --- IN-180, the hub the player gets in each gap ---------------------- *
 *
 * Five options across three gaps and three buttons. `#quiz` in
 * initiation.html has exactly three `.quiz-opt` children and this scene may
 * not add DOM, so each gap offers three of the five and silence is always one
 * of them. Every option is reachable across the three gaps; the test asserts
 * that rather than trusting the table to look right.
 * ---------------------------------------------------------------------- */

const IN_181 = beat('IN-181', 2, 'exec_gap_reply', [
  l('PROSPECT', 'What did they do?'),
  sd('Nobody answers. Booskibro looks at him — properly, for about a second '
    + 'and a half — and then looks back at the working ground. That look is '
    + 'the entire response and there is no line on it.'),
]);

const IN_182 = beat('IN-182', 2, 'exec_gap_reply', [
  l('PROSPECT', 'Kittenboss—'),
  sd('Gratin is walking past him at that moment. He does not stop and he does '
    + 'not sound annoyed. He sounds like a man asking somebody to mind the step.'),
  l('GRATIN', 'Face front.', { direction: 'Not a threat. A request to mind the step.' }),
  sd('That is all. Kittenboss does not hear her name. Do not turn her head.'),
]);

const IN_183 = beat('IN-183', 2, 'exec_gap_reply', [
  l('PROSPECT', 'Am I next?'),
  sd('The only question tonight that has an answer, and it gets one '
    + 'immediately, because it is the only one anybody considers worth '
    + 'answering.'),
  l('BOOSKIBRO', 'No.', {
    direction: 'Immediate, level, and completely without reassurance. No '
      + 'explanation follows and none may be added.',
  }),
]);

const IN_184 = beat('IN-184', 2, 'exec_gap_reply', [
  l('PROSPECT', 'Stop.'),
  sd('Nothing stops. Nobody turns round. Not one man in the Circle so much as '
    + 'looks at him. This option must exist and must do absolutely nothing — a '
    + 'scene where you cannot try is a scene the player is only watching.'),
]);

const IN_185 = beat('IN-185', 2, 'exec_gap_reply', [
  sd('He says nothing. Somewhere behind him in the Circle, somebody shifts '
    + 'their weight. That is all the acknowledgement he gets, and he does not '
    + 'know it was acknowledgement.'),
]);

/**
 * The hub, per gap.
 *
 * `silent: true` is the option that does NOT set `spokeAtTheKilling`, and it
 * is the default the timeout resolves to. The game never tells him silence was
 * the strongest thing available; it tells him once, later, at IN-365.
 */
const HUB_OPTIONS = Object.freeze({
  1: Object.freeze([
    opt('What did they do?', 'IN-181'),
    opt('Am I next?', 'IN-183'),
    opt('[Say nothing.]', 'IN-185', { silent: true }),
  ]),
  2: Object.freeze([
    opt('Stop.', 'IN-184'),
    opt('What did they do?', 'IN-181'),
    opt('[Say nothing.]', 'IN-185', { silent: true }),
  ]),
  3: Object.freeze([
    opt('Kittenboss—', 'IN-182'),
    opt('Stop.', 'IN-184'),
    opt('[Say nothing.]', 'IN-185', { silent: true }),
  ]),
});

export const HUB = Object.freeze({
  id: 'IN-180',
  prompt: 'You are in the line.',
  timeout: 5,
  fallback: 'IN-185',
  optionsFor(gap) { return HUB_OPTIONS[gap] ?? HUB_OPTIONS[3]; },
  /** Every option the hub can ever show, for the reachability test. */
  all: Object.freeze(Object.values(HUB_OPTIONS).flat()),
});

/* ====================================================================== *
 * ACT THREE — THE WALK
 *
 * Almost nobody talks, and the few lines that are said are ordinary. That is
 * what makes it worse. NOTHING ON THIS TRAIL REFERS TO THE CLEARING — not
 * obliquely, not in subtext, not in a pause.
 *
 * Every line in this act is spoken by somebody WALKING, which is why every one
 * of them is played through `sayFrom()` with `follow` pointed at the speaker's
 * rig. A one-shot without it stays in the mud thirty metres back.
 * ====================================================================== */

const IN_200 = beat('IN-200', 3, 'walk_out', [
  sd('Booskibro walks in out of the dark at the edge of the beams and passes '
    + 'Tony without stopping. Behind them somebody kills the two sets of '
    + 'headlights, one after the other, and the working ground goes out.'),
  l('BOOSKIBRO', 'Come on, then.', { direction: 'He does not say where.' }),
]);

const IN_210 = beat('IN-210', 3, 'trail', [
  sd('Twenty seconds up the trail. Nothing but boots and breathing and the '
    + 'trees closing over.'),
  l('SEFF', 'Colder than it was.', {
    direction: 'THE MOST IMPORTANT EXCHANGE IN THE ACT. Two men who have just '
      + 'done what they did, discussing the temperature accurately, because it '
      + 'is genuinely colder than it was.',
  }),
  l('LAG', 'It’s the wet.'),
  l('SEFF', 'Mm.'),
], { marker: 0.18 });

const IN_220 = beat('IN-220', 3, 'trail', [
  sd('Irish, further up the line, mid-complaint, to Hog Mama. Not lowered. He '
    + 'is not being discreet because it does not occur to him that anything '
    + 'requires discretion.'),
  l('IRISH', 'Are we doing the thing with the card?'),
  l('HOGMAMA', 'Yes.'),
  l('IRISH', 'Right. Only last time nobody brought a card.'),
  l('HOGMAMA', 'Somebody brought a card.'),
  l('IRISH', 'Somebody brought a receipt.'),
  sd('The family being a family, and also the only warning the player gets '
    + 'about what is going to happen to his hand. Nobody explains it.'),
], { marker: 0.36 });

const IN_230 = beat('IN-230', 3, 'trail', [
  sd('Behind Tony’s left shoulder. A sniff. Then another one.'),
  l('SHUBENATOR', 'It’s the smoke.', {
    direction: 'THERE IS NO SMOKE. He is crying and he has blamed smoke that '
      + 'does not exist, which is what he does at every family occasion. '
      + 'Tonight it is not funny and nothing in the scene may indicate that it '
      + 'is not funny. Play it as a man clearing his throat.',
  }),
  sd('Nobody says anything to him. Nobody looks at him.'),
], { marker: 0.54 });

const IN_240 = beat('IN-240', 3, 'trail', [
  sd('Close behind, kindly, as the trail drops into a root run.'),
  l('NUMBSKULL', 'Watch your feet through here.'),
  l('PROSPECT', '…Thanks.'),
  l('NUMBSKULL', 'It gets you every time, that bit.', {
    direction: 'He is being helpful. He has been being helpful all night. He '
      + 'is still the most frightening man in the woods and he is still being '
      + 'nice.',
  }),
], { marker: 0.7 });

const IN_246 = beat('IN-246', 3, 'trail_reply', [
  l('PROSPECT', 'Where are we going?'),
  l('BOOSKIBRO', 'Up.', { direction: 'Without turning.' }),
]);

const IN_247 = beat('IN-247', 3, 'trail_reply', [
  l('PROSPECT', 'Is somebody going to tell me what that was?'),
  sd('The walking does not change. Nobody answers. After a while, from '
    + 'somewhere behind him, conversationally, not unkindly:'),
  l('LAG', 'Probably not.', {
    direction: 'Thrown away completely. Do not put a beat around it.',
  }),
]);

const IN_245 = beat('IN-245', 3, 'trail_choice', [
  sd('Available once on the trail. All three go nowhere and none of them sets '
    + 'a flag.'),
], {
  choice: Object.freeze({
    prompt: 'You are walking.',
    options: Object.freeze([
      opt('Where are we going?', 'IN-246'),
      opt('Is somebody going to tell me what that was?', 'IN-247'),
      opt('[Keep walking.]', 'IN-248', { silent: true }),
    ]),
    timeout: 9,
    fallback: 'IN-248',
  }),
  marker: 0.84,
});

/** The third trail option is a real destination with nothing in it. */
const IN_248 = beat('IN-248', 3, 'trail_reply', [
  sd('He keeps walking.'),
]);

const IN_250 = beat('IN-250', 3, 'cabin_arrive', [
  sd('The porch light shows up through the trunks at the second bend, and the '
    + 'clearing behind goes out of sight in the same moment. Then the trail '
    + 'gives up into a yard and it is simply there, the way a building in woods '
    + 'is: no approach, no avenue, just trunks and then a wall.'),
  sd('OLD, PRIVATE, IMPORTANT — AND NOT RUNDOWN. Twelve metres of squared '
    + 'timber gone black-grey, a stone chimney with woodsmoke going straight up '
    + 'because there is no wind down here, windows lit orange from inside. A big '
    + 'building for the woods and a small one for a family that owns this much '
    + 'of them. No porch swing, no lanterns strung up, no sign, nothing carved '
    + 'over the door — and two cars already parked in the yard that were here '
    + 'before anybody arrived, which means people were waiting in that room '
    + 'while all of it was happening down the hill.'),
  sd('Nobody says anything about it. NOBODY IN THIS FAMILY HAS EVER REMARKED ON '
    + 'THIS BUILDING IN THEIR LIVES.'),
]);

const IN_260 = beat('IN-260', 3, 'cabin_door', [
  sd('The trail gives up into a yard and the cabin is simply there, the way a '
    + 'building in woods is: no approach, no avenue, just trunks and then a '
    + 'wall. They walk up onto the porch and stamp their boots off, one after '
    + 'another, and go in. Tony is left on the porch. Booskibro holds the door.'),
  l('BOOSKIBRO', 'In.'),
  sd('The player walks in himself. Do not cut on the door.'),
]);

/* ====================================================================== *
 * ACT FOUR — THE CABIN
 *
 * One long room. Sixteen people, standing, coats still on and steaming.
 * Nobody sat down and nobody was asked to. Big Uncle Lou Sputthole is the only
 * person in the room who is sitting, and he has not spoken since IN-090.
 * ====================================================================== */

const IN_300 = beat('IN-300', 4, 'ceremony', [
  sd('The door shuts behind him. Somebody drops the latch — not dramatically, '
    + 'because it is a cold night and the door is a door. Every face in the '
    + 'room is turned to him and not one of them is smiling. These are men he '
    + 'has drunk with. They look like strangers and none of them has changed '
    + 'anything about themselves.'),
]);

const IN_310 = beat('IN-310', 4, 'ceremony', [
  l('LOU', 'Come forward.', { verbatim: true }),
  sd('He does not stand. Tony walks the length of the table to him, and the '
    + 'room closes up behind him as he passes.'),
]);

const IN_320 = beat('IN-320', 4, 'ceremony', [
  l('LOU', 'All of the men in this room are bound by blood. This is a family. And in this thing of ours, we follow a code of honor. There’s a way of life... a brotherhood.', {
    verbatim: true,
    direction: 'THE FIRST TIME IN THE ENTIRE CAMPAIGN THAT LOU IS COMPLETELY '
      + 'SERIOUS. No warmth, no gravel-voiced charm, no joke waiting at the end '
      + 'of the sentence. The man who was worried about raccoons at the fire '
      + 'pit is gone.',
  }),
]);

const IN_330 = beat('IN-330', 4, 'ceremony', [
  l('BOOSKIBRO', 'You are here because of your deeds and the assertions of those who stand at your side.', {
    verbatim: true,
    direction: 'QUIET. He has boomed through the entire game; in here he does '
      + 'not, and the change is the point.',
  }),
]);

const IN_340 = beat('IN-340', 4, 'ceremony', [
  l('BOOSKIBRO', 'You did what was asked. You kept your mouth shut. You handled yourself at the Bing. You flew the beef run. When it came time to stand up, you stood up.', {
    verbatim: true,
    direction: 'A list being confirmed, not a compliment being paid.',
  }),
]);

const IN_350 = beat('IN-350', 4, 'ceremony', [
  sd('Rippinflow speaks from the wall. He does not step forward and he is not '
    + 'introduced. He has said almost nothing all game and the room goes '
    + 'quieter for him than it did for either founder.'),
  l('RIPPINFLOW', 'This life is one of secrecy. If you make a friend, meet a woman, live out there among regular people... they must not know about our thing.', {
    verbatim: true,
  }),
]);

const IN_360 = beat('IN-360', 4, 'ceremony', [
  l('LOU', 'It is binding. It is not forgiving. To betray one is to betray all.', { verbatim: true }),
]);

/**
 * IN-365 — the payoff for IN-180.
 *
 * Two variants of one beat. Lou drops out of the ritual register entirely for
 * two lines, and then goes straight back into it with no transition. Neither
 * variant is a punishment and neither is a fail state.
 */
const IN_365_SILENT = beat('IN-365-silent', 4, 'ceremony', [
  l('LOU', 'You didn’t say anything out there.', {
    direction: 'Quiet, private, meant for Tony and nobody else — and the room '
      + 'hears it anyway because the room is four metres wide. He is not '
      + 'asking and he does not wait for an answer.',
  }),
  l('LOU', 'Good.'),
]);

const IN_365_SPOKE = beat('IN-365-spoke', 4, 'ceremony', [
  l('LOU', 'You said something out there.'),
  l('LOU', 'Don’t.', {
    direction: 'A correction, delivered by a man who likes him. Not a threat '
      + 'and not a rebuke. One word, then stop.',
  }),
]);

const IN_370 = beat('IN-370', 4, 'oath_question', [
  sd('Lou stands up. It is the first time he has moved. The whole room comes '
    + 'off the walls half a step.'),
  l('LOU', 'Do you wish to commit yourself... your life... to this family?', { verbatim: true }),
  sd('CHARACTER FIRST, HUD SECOND. The prompt appears in the onDone of Lou’s '
    + 'line, never over the top of it. There is no timeout on this choice: Lou '
    + 'will wait, the room will wait, and nothing appears on screen to hurry '
    + 'him. The pause before the input is the content.'),
], {
  choice: Object.freeze({
    prompt: 'Do you wish to commit yourself... your life... to this family?',
    options: Object.freeze([
      opt('Yes. I do.', 'IN-371'),
      opt('No. I don’t.', 'FAIL-B'),
    ]),
    /* Deliberately no timeout and no fallback. See the note above. */
    timeout: null,
    fallback: null,
  }),
});

const IN_371 = beat('IN-371', 4, 'oath_yes', [
  l('PROSPECT', 'Yes. I do.', { verbatim: true }),
  sd('Nobody reacts. No murmur, no nod, no music sting. He answered a question '
    + 'correctly, which is all he has done.'),
]);

const FAIL_B = beat('FAIL-B', 4, 'oath_no', [
  l('PROSPECT', 'No. I don’t.', { verbatim: true }),
  sd('SILENCE. Hold it. Longer than a game normally holds anything.'),
  sd('A man behind him shifts. One sound, off-camera, behind the player’s '
    + 'shoulder — a boot on a board. Nothing else in the room moves.'),
  sd('Lou stares at him for half a second, and gives the tiniest nod.'),
  sd('GUNSHOT. Cut to black on the frame of the shot — no fall, no body, no '
    + 'blood, no slow-motion. The screen is black before the report finishes.'),
  sd('MISSION FAILED: WRONG ANSWER.'),
]);

const IN_380 = beat('IN-380', 4, 'oath_yes', [
  l('LOU', 'Then before the eyes of all here present... join me.', { verbatim: true }),
]);

/* ====================================================================== *
 * ACT FIVE — MADE
 *
 * Close, quiet and physical. Dead silence but for the fire and the stove.
 * Three player inputs and NONE OF THEM CAN FAIL — the only failure in the
 * cabin was FAIL-B and it is behind him.
 * ====================================================================== */

const IN_400 = beat('IN-400', 5, 'blade', [
  sd('RIPPINFLOW picks up the blade from the table and hands it to Lou. Handle '
    + 'first. He does not say anything — he has already said his four '
    + 'sentences tonight — and he goes back to the wall. BOOSKIBRO picks up the '
    + 'saint card: small, cheap, printed, softened at the corners from being '
    + 'carried. He holds it flat on his palm and does not present it yet.'),
]);

const IN_410 = beat('IN-410', 5, 'hand', [
  l('LOU', 'Give me your hand.', {
    direction: 'Not verbatim — connective tissue, and the shortest possible '
      + 'bridge into the input.',
  }),
  sd('Lou takes it and turns it palm up. He is not gentle and he is not rough; '
    + 'he handles it like a man setting something down level. If the player '
    + 'does not offer it, Lou takes it after four seconds. No fail.'),
]);

const IN_415 = beat('IN-415', 5, 'cut', [
  sd('Lou cuts across the pad of the trigger finger and into the palm. Small. '
    + 'Controlled. Enough to draw blood and no more. Tony’s hand closes '
    + 'involuntarily; Lou opens it again with his thumb, without looking up.'),
  sd('The player does not get to refuse this and there is no prompt telling '
    + 'him he could. If he does not press, Lou waits — and after four seconds '
    + 'Lou simply does it himself. No fail, no retry, no hint.'),
]);

const IN_420 = beat('IN-420', 5, 'card', [
  sd('BOOSKIBRO places the saint card in the bloodied palm. He presses it down '
    + 'flat with two fingers and holds it there a second to make sure it takes. '
    + 'Neither of them says a word. The stove is the loudest thing in the room.'),
]);

const IN_430 = beat('IN-430', 5, 'oath_1', [
  l('LOU', 'To become a man of honor... repeat these words.', { verbatim: true }),
  l('LOU', 'I swear my loyalty to this family.', { verbatim: true }),
  l('PROSPECT', 'I swear my loyalty to this family.', {
    verbatim: true,
    direction: 'FLAT AND CAREFUL. He is not moved and he is not performing — he '
      + 'is a man repeating words correctly because he has understood that '
      + 'getting them wrong is a category of thing that has consequences here.',
  }),
]);

const IN_435 = beat('IN-435', 5, 'oath_2', [
  l('LOU', 'My flesh must burn in hell like this saint if I do not keep my oath.', { verbatim: true }),
  l('PROSPECT', 'My flesh must burn in hell like this saint if I do not keep my oath.', {
    verbatim: true,
    direction: 'He says "like this saint" while holding the saint, and the game '
      + 'does not help him notice.',
  }),
]);

const IN_440 = beat('IN-440', 5, 'burn', [
  sd('Lou takes the candle off the table and lights ONE CORNER of the card in '
    + 'Tony’s open palm. Then he folds the card into the hand — closes Tony’s '
    + 'fingers over it — and puts his own hand over the top.'),
  sd('The hold is real for about a second and a half. If the player releases '
    + 'in that window the card drops, and Lou picks it up off the boards, '
    + 'relights it from the candle, and puts it back in his hand without a word '
    + 'and without any change of expression. Nobody in the room reacts and '
    + 'nothing appears on screen. It can be done again as many times as it '
    + 'takes.'),
  sd('After that window LOU’S HAND CLOSES OVER THE PLAYER’S and the hold no '
    + 'longer depends on him. This is the owner’s own stage direction and it is '
    + 'also why this beat cannot dead-end: a player who cannot or will not hold '
    + 'the button is held.'),
]);

const IN_450 = beat('IN-450', 5, 'made', [
  l('LOU', 'From this day forward, your word is the word of this family. Your enemies are our enemies. Your loyalty is no longer yours alone — it belongs to all of us.', { verbatim: true }),
  sd('Tony opens his hand. Ash, and a burn, and blood. He does not wipe it. Do '
    + 'not let him wipe it — not here, not in the room, not in the last shot.'),
]);

const IN_460 = beat('IN-460', 5, 'made', [
  l('LOU', 'Welcome.', {
    verbatim: true,
    direction: 'IN UNISON WITH BOOSKIBRO, QUIETLY. Two takes mixed to land on '
      + 'the same frame — it is not a line and a response, and if it queues one '
      + 'after the other the beat dies.',
  }),
  l('BOOSKIBRO', 'Welcome.', {
    verbatim: true,
    direction: 'IN UNISON WITH LOU, QUIETLY. Same frame as his.',
  }),
]);

const IN_465 = beat('IN-465', 5, 'made', [
  sd('Lou picks the folded red bandana up off the table — it has been lying '
    + 'there in plain sight since IN-300 — and ties it on him. He does it '
    + 'badly, with the concentration of a man who is not good at this and does '
    + 'it anyway, and he straightens it with both thumbs when he is done.'),
  sd('THIS IS WHERE THE PLAYER’S RIG CHANGES. The inducted palette and the red '
    + 'bandana, on Lou’s hands, in one continuous shot. No white flash, no '
    + 'rig-swap cut, no transformation effect.'),
]);

/* ====================================================================== *
 * ACT SIX — THE ROOM
 *
 * It has to sound like fifteen men, not five. The moment the bandana is tied
 * the room breaks, all at once, and stays broken.
 *
 * NONE OF THIS GOES THROUGH THE DIALOGUE QUEUE. A queued salud is a roll call
 * and it takes forty seconds. It is a crowd bed with named lines fired over
 * the top at small random offsets — `overlap` is the offset in seconds.
 * ====================================================================== */

const over = (who, text, overlap, opts = {}) => l(who, text, { ...opts, overlap });

const IN_500 = beat('IN-500', 6, 'room', [
  sd('Three of them, overlapping, ragged, getting louder. Glasses coming off '
    + 'the table faster than they can be poured. Somebody bangs the plank '
    + 'table. The stove door gets knocked shut by somebody’s boot and nobody '
    + 'notices.'),
  over('APE', 'SALUD!', 0.0, { verbatim: true }),
  over('HOGMAMA', 'SALUD!', 0.28, { verbatim: true }),
  over('SASOLE', 'SALUD!', 0.61, { verbatim: true }),
]);

const IN_510 = beat('IN-510', 6, 'room', [
  over('ERIC', 'Salud, kid.', 1.1, { verbatim: true }),
  over('SNOW', 'You’re family now.', 1.9, { verbatim: true }),
  over('IRISH', 'That’s it, brother.', 2.6, { verbatim: true }),
  over('NUMBSKULL', 'He made it.', 3.2, { verbatim: true }),
  over('SEFF', 'Salud!', 3.9, { verbatim: true }),
  over('HOGMAMA', 'Come here. Come here, baby.', 4.7),
  over('APE', 'Look at his face. Look at it.', 5.6),
  over('APE', 'He’s gone grey. He’s actually gone grey.', 6.9),
  over('SASOLE', 'Still top five, this one.', 8.1),
  over('LAG', 'Congrats. Genuinely.', 9.0),
  over('RIPPINFLOW', 'Good. Now sit down.', 9.9),
  over('SHUBENATOR', 'It’s the stove.', 10.8, {
    direction: 'Still going, and now there is a stove to blame.',
  }),
  over('GRATIN', 'There’s food. Nobody’s eating it.', 11.7, {
    direction: 'THE LINE TO PROTECT. An hour ago he shot four people on their '
      + 'knees and now he is quietly upset that his food is going cold, and he '
      + 'is not doing a bit — he cooked and nobody is eating. Exactly as flat '
      + 'as everything else he has said tonight.',
  }),
  over('NUMBSKULL', 'I said I liked him. I said that before.', 13.0),
  over('IRISH', 'The card was fine, by the way. That was a proper card.', 14.0),
  over('BOOSKIBRO', 'SIT HIM DOWN. Somebody sit him down.', 15.2),
  sd('DeathMegatron has no line: a hand on the back of his neck, and it stays '
    + 'there a second too long. NOBODY IN THIS ROOM MENTIONS THE CLEARING. Not '
    + 'one person. Not once.'),
]);

const IN_520 = beat('IN-520', 6, 'room_aside', [
  sd('The room does not stop. Lou takes him by the elbow and turns him a '
    + 'quarter away from it, and talks under the noise. Low. Not warm — level.'),
  l('LOU', 'Tonight, you became one of us. That means something.', { verbatim: true }),
  l('LOU', 'It also means every move you make reflects on me... and on this family. So don’t embarrass us.', { verbatim: true }),
  l('LOU', 'And don’t think this means you get to relax. You still got work to do.', {
    verbatim: true,
    direction: 'A faint smirk under this one — the first since IN-090, and very '
      + 'small. Lou is back, not all the way, and not tonight.',
  }),
]);

const IN_530 = beat('IN-530', 6, 'room_aside', [
  l('BOOSKIBRO', 'Drink. Tonight you earned it.', { verbatim: true }),
  sd('Somebody puts a glass in his burned hand. The burned one — nobody checks '
    + 'which, because nobody would. He takes it.'),
  l('PROSPECT', '…Cheers.', { direction: 'Optional, one only, and only if the player waits.' }),
]);

const IN_540 = beat('IN-540', 6, 'pullback', [
  sd('The camera comes off him and pulls back. Slow, continuous, no cuts. '
    + 'Through the room, out through the window, back into the trees, until the '
    + 'cabin is one lit window a long way off between black trunks. The room’s '
    + 'noise drops off with distance the way sound actually does — not a fade, '
    + 'a falloff.'),
  sd('And then there is nothing. Wind in the tops of the trees. NO SOUND FROM '
    + 'THE DIRECTION OF THE CLEARING. No last shot of the bodies. No title '
    + 'card, no music sting, no callback. The scene ends on wind.'),
]);

/* ====================================================================== *
 * THE BOOK
 * ====================================================================== */

export const BEATS = Object.freeze([
  IN_030, IN_031, IN_032, IN_033, IN_060, IN_075,
  IN_100, IN_110, IN_120, IN_130, IN_140, IN_145, IN_160, IN_170,
  IN_181, IN_182, IN_183, IN_184, IN_185,
  IN_200, IN_210, IN_220, IN_230, IN_240, IN_245, IN_246, IN_247, IN_248, IN_250, IN_260,
  IN_300, IN_310, IN_320, IN_330, IN_340, IN_350, IN_360,
  IN_365_SILENT, IN_365_SPOKE, IN_370, IN_371, FAIL_B, IN_380,
  IN_400, IN_410, IN_415, IN_420, IN_430, IN_435, IN_440,
  IN_450, IN_460, IN_465,
  IN_500, IN_510, IN_520, IN_530, IN_540,
]);

const INDEX = new Map(BEATS.map((entry) => [entry.id, entry]));

export function beatById(id) {
  return INDEX.get(id) ?? null;
}

export function hasBeat(id) {
  return INDEX.has(id);
}

export function beatsInAct(act) {
  return BEATS.filter((entry) => entry.act === act);
}

/** The beats that put somebody on their knees, in the order they are used. */
export const EXECUTION_BEATS = Object.freeze(
  BEATS.filter((entry) => entry.phase === 'exec_prospect'),
);

/** The two variants of Lou's aside, keyed by whether the player spoke. */
export function asideFor(spokeAtTheKilling) {
  return spokeAtTheKilling ? IN_365_SPOKE : IN_365_SILENT;
}

/** Every spoken line in the rewrite, deduplicated by cue. */
export function allCabinVoiceLines() {
  return uniqueInitiationVoiceLines(...BEATS.map((entry) => entry.lines));
}

/**
 * Manifest-shaped records for the recording handoff.
 *
 * `docs/audio/pending-initiation-cues.json` is written from exactly this, and
 * `tests/initiation-cabin-ceremony.test.mjs` fails if the file and this
 * function ever disagree in either direction. THIS PASS DOES NOT WRITE TO
 * `assets/sfx/manifest.json`.
 */
export function scriptCues() {
  return allCabinVoiceLines().map((line) => {
    const record = { name: line.cue, voice: line.voice, say: line.say };
    if (line.direction) record.direction = line.direction;
    return record;
  });
}

/* ====================================================================== *
 * WHAT THE REWRITE RETIRES
 *
 * These four shipped `vo.initiation.ceremony.*` cues are no longer played by
 * anything. They are the gauntlet, the roar and the timber — the three trials
 * the cabin replaces — plus the one line of `correct` that hands off to them.
 *
 * They are LEFT IN `dialogue.js` on purpose: removing them makes every one of
 * their manifest rows `stale` and turns `npm run check` red, and this pass
 * cannot edit the manifest to match. When the handoff is merged they come out
 * of `CEREMONY_BEATS` and go into `assets/sfx/rerecord.json`'s retired array,
 * in the same commit.
 * ====================================================================== */
export const RETIRED_CEREMONY_BEATS = Object.freeze(['endured', 'roar']);
export const RETIRED_CEREMONY_LINES = Object.freeze([
  /* `correct[2]`: "...Now we test the BODY. Clear the line — THE GAUNTLET
   * AWAITS." Replaced by IN-100, which is three words at a normal volume. */
  'The mind is sharp. Now we test the BODY. Clear the line — THE GAUNTLET AWAITS.',
  /* `retry[0]`: the gauntlet's forgiveness line. FAIL-B's retry plays no
   * dialogue at all except the question itself. */
  'The Circle forgives once. Arms DOWN this time, prospect.',
]);

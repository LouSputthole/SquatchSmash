import { CHARACTER_IDS } from '../core/campaign.js';

/**
 * Everything the closed party says that the authored director does not.
 *
 * `second-visit.js` owns the spine — the set, the needling, the four hits and
 * the handoff. This file owns the room around it: the overheard conversations
 * before anything happens, what people blurt out while Ape is working, and
 * what the same room sounds like once it has turned into a cleanup crew.
 *
 * Two rules govern the whole file, both from docs/TONE-AND-PARODY.md:
 *
 * - **A HUD instruction never replaces a character.** If a named person in the
 *   room is the one with something to say, the line lives here with a cue and
 *   they say it out loud. Prose that is genuinely the Prospect's own read of a
 *   room stays in the HUD and is deliberately absent from this file.
 * - **The scene never winks.** Nobody here is doing a bit about being in a
 *   mob movie. They are at a party for a man half of them wish had stayed in
 *   county, and they are talking about the till, the cake and the parking.
 */

/**
 * Who is allowed to be given a line in this scene, and how each is cast.
 *
 * The two Lous are separate people and separate recordings: `lou` / `lou1` is
 * Big Uncle Lou, who runs the Bing; `captain_lou_sasole` / `lou2` flew the
 * Beef Run and is a guest at this party. Nothing in this file may resolve one
 * to the other, which is why casting is an exact-name table rather than a
 * substring match. Snow and Lawnmower are the same body and the same voice
 * under two names, so both keys point at the same character id.
 */
export const HOTDOG_SPEAKERS = Object.freeze({
  'Big Uncle Lou': { slug: 'lou', voice: 'lou1', characterId: CHARACTER_IDS.LOU },
  'Captain Lou Sasole': { slug: 'sasole', voice: 'lou2', characterId: CHARACTER_IDS.CAPTAIN_LOU_SASOLE },
  'Billy HotDog': { slug: 'hotdog', voice: 'hotdog', characterId: CHARACTER_IDS.BILLY_HOTDOG },
  Ape: { slug: 'ape', voice: 'ape', characterId: CHARACTER_IDS.APE },
  Aubbie: { slug: 'aubbie', voice: 'aubbie', characterId: CHARACTER_IDS.AUBBIE },
  Booskibro: { slug: 'booski', voice: 'booski', characterId: CHARACTER_IDS.BOOSKI },
  DeathMegatron: { slug: 'deathmegatron', voice: 'deathmegatron', characterId: CHARACTER_IDS.DEATHMEGATRON },
  Eric: { slug: 'eric', voice: 'eric', characterId: CHARACTER_IDS.ERIC },
  Gratin: { slug: 'gratin', voice: 'gratin', characterId: CHARACTER_IDS.GRATIN },
  'Hog Mama': { slug: 'hogmama', voice: 'hogmama', characterId: CHARACTER_IDS.HOG_MAMA },
  Irish: { slug: 'irish', voice: 'irish', characterId: CHARACTER_IDS.IRISH },
  Lag: { slug: 'lag', voice: 'lag', characterId: CHARACTER_IDS.LAG },
  Numbskull: { slug: 'numbskull', voice: 'numbskull', characterId: CHARACTER_IDS.NUMBSKULL },
  'Old Stove': { slug: 'stove', voice: 'old-stove', characterId: CHARACTER_IDS.OLD_STOVE },
  Rippinflow: { slug: 'rippin', voice: 'rippinflow', characterId: CHARACTER_IDS.RIPPINFLOW },
  Seff: { slug: 'seff', voice: 'seff', characterId: CHARACTER_IDS.SEFF },
  Snow: { slug: 'snow', voice: 'snow', characterId: CHARACTER_IDS.SNOW },
  'The Shubenator': { slug: 'shubenator', voice: 'shubenator', characterId: CHARACTER_IDS.SHUBENATOR },
  Willy: { slug: 'willy', voice: 'willy', characterId: CHARACTER_IDS.WILLY },
  Sauce: { slug: 'sauce', voice: 'sauce', characterId: CHARACTER_IDS.SAUCE },
  Prospect: { slug: 'prospect', voice: 'player', characterId: CHARACTER_IDS.PROSPECT },
  /* The people WORKING the party, who are jobs rather than campaign
   * characters -- there is no `CHARACTER_IDS` entry for a bartender, and
   * inventing one would put a man on the Family roster who is not on it. The
   * `staff:` keys are what `hotdog-main.js` files their bodies under. */
  'The Bartender': { slug: 'bartender', voice: 'bartender', characterId: 'staff.bartender' },
  'The Dealer': { slug: 'dealer', voice: 'dealer', characterId: 'staff.dealer' },
  Security: { slug: 'security', voice: 'mansion-guard', characterId: 'staff.security_door' },
  /* Names the authored spine and the party floor already use for people who
   * are above. Same person, same recording bank, no second body. */
  Shubenator: { slug: 'shubenator', voice: 'shubenator', characterId: CHARACTER_IDS.SHUBENATOR },
  Lawnmower: { slug: 'snow', voice: 'snow', characterId: CHARACTER_IDS.SNOW },
});

/**
 * How long a line takes to say when nobody has recorded it yet.
 *
 * The runtime always takes the longer of this and the real clip, so this only
 * has to be honest enough that a subtitle-only playthrough reads at a human
 * pace instead of flashing past.
 */
function spokenSeconds(text) {
  const estimate = text.length / 13.5 + 0.6;
  return Math.round(Math.min(6.5, Math.max(1.4, estimate)) * 10) / 10;
}

function slugOf(who) {
  const speaker = HOTDOG_SPEAKERS[who];
  if (!speaker) throw new Error(`No HotDog casting for "${who}"`);
  return speaker.slug;
}

function line(who, text, cue, extra = {}) {
  return Object.freeze({
    who,
    line: text,
    cue,
    seconds: extra.seconds ?? spokenSeconds(text),
    ...(extra.direction ? { direction: extra.direction } : {}),
    ...(extra.toward ? { toward: extra.toward } : {}),
  });
}

/**
 * Mint cue names for a group of lines without hand-writing a hundred strings.
 *
 * The name carries the group, the moment and the speaker, so a recording
 * sheet row is legible on its own: `vo.bing2.party.till.booski.2` is the
 * second thing Booski says in the exchange about his till. Repeats inside one
 * group are numbered; a speaker who only appears once has no suffix, which
 * keeps the common case short.
 */
function numbered(prefix, entries) {
  const seen = new Map();
  const totals = new Map();
  for (const [who] of entries) totals.set(slugOf(who), (totals.get(slugOf(who)) ?? 0) + 1);
  return entries.map(([who, text, extra]) => {
    const slug = slugOf(who);
    const index = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, index);
    const suffix = totals.get(slug) > 1 ? `.${index}` : '';
    return line(who, text, `${prefix}.${slug}${suffix}`, extra ?? {});
  });
}

/**
 * An overheard conversation.
 *
 * The first speaker is the anchor: the runtime starts the exchange when the
 * player is close enough to that person to plausibly hear it, and everybody
 * after them turns to whoever spoke last. Nothing here is an objective and
 * nothing here needs to be heard, so an exchange the player walks away from
 * simply finishes without him.
 */
function conversation(prefix, id, entries) {
  const lines = numbered(`${prefix}.${id}`, entries);
  return Object.freeze({
    id,
    lead: lines[0].who,
    lines: Object.freeze(lines.map((entry, index) => Object.freeze({
      ...entry,
      toward: entry.toward ?? (index > 0 ? lines[index - 1].who : null),
    }))),
  });
}

/** Something overheard at the party, before any of this has happened. */
const exchange = (id, entries) => conversation('vo.bing2.party', id, entries);

/** Something overheard on the cleanup floor, after all of it has. */
const cleanupTalk = (id, entries) => conversation('vo.bing2.cleanup', id, entries);

/**
 * The closed party before anything goes wrong.
 *
 * A welcome-home party for a man everybody in the room has a private opinion
 * about. Most of this is nothing — the till, the cake, the lights, a man who
 * cannot stop rhyming — and a few of them let slip that Billy is going to be
 * a problem before the night is over. None of it is a warning the player is
 * supposed to act on; that is the point of hearing it in passing.
 */
export const HOTDOG_PARTY_CHATTER = Object.freeze([
  exchange('till', [
    ['Booskibro', 'Eight months, and the first thing the man does is look at my till.'],
    ['Willy', 'Did he touch it?'],
    ['Booskibro', 'He LOOKED at it, Willy. Looking is the front half of touching.'],
  ]),
  exchange('prosperous', [
    ['Billy HotDog', 'Booski! You got fat.'],
    ['Booskibro', 'I got PROSPEROUS, baby. Learn the difference.'],
    ['Billy HotDog', 'Same shirt, though.'],
  ]),
  exchange('its-a-party', [
    ['Big Uncle Lou', 'Ape. It is a party.'],
    ['Ape', 'It is a party.'],
    ['Big Uncle Lou', 'Say it again like a man who believes it.'],
  ]),
  exchange('cake-rule', [
    ['Gratin', 'Nobody cuts that cake before Hog Mama. It is not a rule, it is a fact about the cake.'],
    ['Irish', 'So a corner piece is—'],
    ['Gratin', 'Facts do not have corners, Irish.'],
  ]),
  exchange('frame-drops', [
    ['Lag', 'These lights are on the same circuit as the walk-in. You can see the frame drops.'],
    ['Old Stove', 'That is a fridge, son.'],
    ['Lag', 'That is what a fridge wants you to think.'],
  ]),
  exchange('came-home-with-money', [
    ['Seff', 'Somebody tell me Billy came home with money.'],
    ['Old Stove', 'I am not here.'],
    ['Seff', 'That is not a no. I am taking that as not a no.'],
  ]),
  exchange('thats-a-bar', [
    ['Rippinflow', 'Closed room, open bar, nobody eating — uh. That is a bar. That is free.'],
    ['Captain Lou Sasole', 'You told me you stopped.'],
    ['Rippinflow', 'I did stop. It happens to me.'],
  ]),
  exchange('off-the-record', [
    ['Eric', 'Off the record. Is he the same? Eight months changes people.'],
    ['Numbskull', 'He is louder.'],
    ['Eric', 'That is not the direction I was hoping for.'],
  ]),
  exchange('glad', [
    ['Numbskull', 'Is a welcome-home party for being glad, or for being seen being glad?'],
    ['Rippinflow', 'Yes.'],
    ['Numbskull', 'Okay. I can do both of them.'],
  ]),
  exchange('nose-out', [
    ['Snow', 'Car is out back. Nose out.'],
    ['Aubbie', 'For a party.'],
    ['Snow', 'For a party.'],
  ]),
  exchange('basket', [
    ['DeathMegatron', 'Phones in the basket. Both of yours, Booski.'],
    ['Booskibro', 'One of those is a calculator.'],
    ['DeathMegatron', 'In the basket.'],
  ]),
  exchange('rhyming', [
    ['Billy HotDog', 'Rippin! You still doing the rhyming thing?'],
    ['Rippinflow', 'Nah.'],
    ['Billy HotDog', 'Good. It was never good.'],
  ]),
  exchange('somebody-says-something', [
    ['Captain Lou Sasole', 'Forty years of these. Somebody always says something.'],
    ['DeathMegatron', 'Somebody always does.'],
  ]),
  exchange('spotter', [
    ['The Shubenator', 'I asked Lou for a spotter and he gave me a spotlight. Different discipline, same commitment.'],
  ]),
  exchange('microphone', [
    ['Hog Mama', 'Whoever set this microphone at this height is a coward, and I will find them.'],
  ]),
  exchange('ears', [
    ['Willy', 'I would tell you where I have been, but this room has ears and two of them came home tonight.'],
  ]),
  /* THE FORESHADOW.
   *
   * `docs/NO-WAKE-REDESIGN.md`: "The Negev lands harder if it has been heard
   * once before. Earlier in the campaign, during the window when the family
   * believes the leak happened, Willy says casually: 'Ask anybody. I was on
   * Mirage all night. Sat B with the Negev like an asshole.'"
   *
   * This party is that window — it is the first room the family is in together
   * after the Beef Run drew eyes — and this is disposable Squatch chatter at
   * the time. Nobody reacts to it and nothing in the game marks it. Lou has
   * since checked the match. On the boat, the player needs no technical
   * explanation: Willy understands the question immediately, and his reaction
   * tells the audience everything. */
  exchange('mirage', [
    ['Willy', 'Ask anybody. I was on Mirage all night. Sat B with the Negev like an asshole.'],
    ['Numbskull', 'What is a Negev.'],
    ['Willy', 'It is a gun, Numbskull. It is a very large gun.'],
  ]),
  /* SAUCE, who is not Family and is in this building every night anyway.
   *
   * `src/bing/family.js` is where the man is: eleven years of bringing his own
   * corn into a nightclub, a flat opinion of prospects, and the runway. He is
   * working the buffet tonight because the food is the whole of him, and
   * nobody has told him it is a favour. */
  exchange('fixed-it', [
    ['Sauce', 'I did not cater this. I fixed it. There is a difference and the difference is eleven trays.'],
    ['Gratin', 'Nobody asked you to fix it.'],
    ['Sauce', 'Nobody asked the kitchen to serve that either. Here we are.'],
  ]),
  exchange('the-corn', [
    ['Sauce', 'The corn came in the van. The corn is mine. Do not let Numbskull near the corn.'],
    ['Numbskull', 'I have not touched the corn.'],
    ['Sauce', 'You are standing in a corn posture.'],
  ]),
  exchange('eleven-years', [
    ['Sauce', 'Eleven years I have eaten in this place. Tonight is the first night anybody let me cook in it. For HIM.'],
    ['Irish', 'Would you rather nobody had asked?'],
    ['Sauce', 'I would rather they asked eleven years ago.'],
  ]),
  exchange('warm-not-hot', [
    ['Sauce', 'Second tray goes out warm at half eleven. Warm. Hot is for people who have earned hot.'],
  ]),
  exchange('utensils', [
    ['Gratin', 'He has touched every serving utensil on that table. I have re-laid it twice.'],
  ]),
  exchange('eight-months', [
    ['Ape', 'Eight months. People are acting like he came back from a war.'],
  ]),
  exchange('eggs', [
    ['Irish', 'Nobody has asked me where the eggs come from tonight. Nobody. In a room this size.'],
  ]),
]);

/**
 * Words for the named reactions the authored spine already stages.
 *
 * `react()` in the runtime moves heads and eyelines; these are what those
 * people actually say, and they land in the gap after the beat that provokes
 * them rather than over the top of it — `buildHotDogPartySequence()` widens
 * that beat's gap by exactly this line's length so the room gets to answer
 * without Hog Mama being talked over.
 *
 * `lou-warning-look` and `shubenator-aftermath` are deliberately absent. Lou's
 * warning is a look, and his next authored beat is the redirect it turns into;
 * giving him a line here would have him speak twice in four beats and spend
 * the redirect early. Shubenator's aftermath reaction is his walk to the mark
 * before the signature take, which is already the loudest thing in the room.
 */
export const HOTDOG_BEAT_REACTION_LINES = Object.freeze({
  'numbskull-early-laugh': line('Numbskull', 'He did! I watched him do it!', 'vo.bing2.react.numbskull.sanitizer'),
  'gratin-choke': line('Gratin', 'I have wine in my lung.', 'vo.bing2.react.gratin.choke'),
  'ape-laugh': line('Ape', 'She has got you, Lou.', 'vo.bing2.react.ape.deposit'),
  'eric-recording': line('Eric', 'Tape is rolling. For the family album.', 'vo.bing2.react.eric.tape'),
  'room-laugh': line('Willy', 'Billy. Billy, eat your cake.', 'vo.bing2.react.willy.cake'),
});

export function hotDogBeatReactionLine(reaction) {
  return HOTDOG_BEAT_REACTION_LINES[reaction] ?? null;
}

/**
 * The room while Ape is working, in the order it finds its voice.
 *
 * The attack itself is about two seconds long, so only the first one or two of
 * these get out while it is happening — the panicked ones, deliberately first.
 * The rest queue behind the authored aftermath beats and come out during the
 * cleanup, which is what a room actually does: nothing, then everything at
 * once, twenty seconds late.
 *
 * Everybody in here is doing one of the four things the room needs: freezing,
 * looking away, saying the wrong thing, or quietly enjoying it.
 */
export const HOTDOG_ATTACK_REACTIONS = Object.freeze(numbered('vo.bing2.attack', [
  ['Numbskull', 'Ape— Ape, that is enough—'],
  ['Gratin', 'I am looking at the kitchen.'],
  ['Willy', 'I am not seeing this. I want that noted.'],
  ['Captain Lou Sasole', 'Somebody move the cake.'],
  ['Hog Mama', 'I am going to take five.'],
  ['DeathMegatron', 'That has been coming since the brush.', {
    direction: 'Quiet, comfortable, and a little pleased. He is the only person in the room enjoying this and he is not hiding it well.',
  }],
  ['Seff', 'This is a bad time to bring up my situation.'],
  ['Eric', 'Camera is off. It is off. It has been off.'],
  ['Irish', 'See, this is what I mean about nobody finishing a story.'],
  ['Booskibro', 'One cufflink. There is a cufflink on the floor.'],
  ['Snow', 'I will bring the car round. Nose out.'],
  ['Aubbie', 'Nobody walks east of that stool.'],
  ['Rippinflow', 'Not a bar. Nothing about that is a bar.'],
  ['Sauce', 'Not near the food. Whatever this is, not near the food.', {
    direction: 'Not frightened and not shocked. A man moving a tray out of the way of weather.',
  }],
]));

/**
 * The same room forty minutes later, with jobs.
 *
 * Nobody is frightened any more and nobody is joking about it either. This is
 * a crew that has done this before talking about mop water and trunk liners,
 * which is the only reason the party half of the scene is funny at all.
 */
export const HOTDOG_CLEANUP_CHATTER = Object.freeze([
  cleanupTalk('stool', [
    ['Numbskull', 'The stool broke on its own. That is what I am saying if anybody asks.'],
    ['Rippinflow', 'Nobody is going to ask.'],
  ]),
  cleanupTalk('counting', [
    ['Booskibro', 'Cufflink, pin, tab. Cufflink, pin, tab.'],
  ]),
  cleanupTalk('bleach', [
    ['Gratin', 'Bleach in the mop water, not on the carpet. On the carpet it leaves a shape.'],
  ]),
  cleanupTalk('photograph', [
    ['DeathMegatron', 'Phones stay in the basket. Nobody took a photograph tonight.'],
  ]),
  cleanupTalk('whole-night', [
    ['Captain Lou Sasole', 'He came, he had cake, he left early. That is the whole night.'],
  ]),
  cleanupTalk('never-comes-up', [
    ['Willy', 'This never comes up again. That is understood, yeah? Never comes up.'],
  ]),
  cleanupTalk('second-pass', [
    ['The Shubenator', 'Second pass on the floor. Honestly, it is good for the shoulders.'],
  ]),
  cleanupTalk('thirty-years', [
    ['Hog Mama', 'Thirty years of rooms. Never once had to help fold one.'],
  ]),
  cleanupTalk('suspicious', [
    ['Irish', 'Nobody is ever going to look into this, and THAT is the part I find suspicious.'],
  ]),
  cleanupTalk('battery', [
    ['Eric', 'The battery is in my pocket. Ask me in an hour, same answer.'],
  ]),
  cleanupTalk('lined', [
    ['Snow', 'Trunk is lined. When he is wrapped he goes straight in.'],
  ]),
  cleanupTalk('two-bags', [
    ['Aubbie', 'Two bags. One for cloth, one for glass. Do not mix them.'],
  ]),
  cleanupTalk('booth', [
    ['Ape', 'I am staying in the booth. Lou knows where I am.'],
  ]),
  cleanupTalk('the-van', [
    ['Sauce', 'The food goes back in the van. All of it. Nobody in this room is eating tonight and I am not binning good beef.'],
  ]),
  cleanupTalk('mattresses', [
    ['Seff', 'So the mattress thing is off, then. That is what I am hearing.'],
  ]),
]);

/**
 * What each of them says when the Prospect walks up.
 *
 * These were HUD prose in a character's voice, which is the failure
 * docs/TONE-AND-PARODY.md names: the screen was reading Booski's line for him
 * while Booski stood there moving his mouth. Every one of them is a cue now.
 * A name with two entries alternates, so a second walk-up is a second thought
 * rather than the same sentence again.
 */
export const HOTDOG_WALKUP_LINES = Object.freeze({
  party: Object.freeze({
    Booskibro: numbered('vo.bing2.walkup.party', [
      ['Booskibro', 'Lou put me on the door money AND the bar money. One man, two piles. It is a compliment and a punishment.'],
      ['Booskibro', 'Say hello to Billy. Say it fast and keep walking. That is the play.'],
    ]),
    Willy: numbered('vo.bing2.walkup.party', [
      ['Willy', 'HotDog got louder in county. I did not know that was medically possible.'],
    ]),
    Eric: numbered('vo.bing2.walkup.party', [
      ['Eric', 'The camera is old. Tape, not cloud. That is good now, apparently.'],
    ]),
    Gratin: numbered('vo.bing2.walkup.party', [
      ['Gratin', 'HotDog touched every serving utensil. Every one.'],
    ]),
    Snow: numbered('vo.bing2.walkup.party', [
      ['Snow', 'Cold in here. Good.'],
    ]),
    /* He is the lead scientist on Lou's programme, not the man who fixes the
     * microphone cable -- see AUBBIE in src/core/wardrobe.js and the lab in
     * src/mansion/scenes/SilentSquatch.js. He still refuses to say what the
     * work is, which is his whole bit on the ordinary Bing floor too. */
    Aubbie: numbered('vo.bing2.walkup.party', [
      ['Aubbie', 'I have been awake since Tuesday and now I am at a party. Do not ask me what I have been working on.'],
    ]),
    Ape: numbered('vo.bing2.walkup.party', [
      ['Ape', 'Prospect. Have a drink, stand somewhere with a wall behind it, and enjoy the evening.'],
    ]),
    Rippinflow: numbered('vo.bing2.walkup.party', [
      ['Rippinflow', 'Prospect walks in with a job face on — nah. Not tonight. Tonight I am a guest.'],
    ]),
    Numbskull: numbered('vo.bing2.walkup.party', [
      ['Numbskull', 'I made a card. It is in my jacket. I am waiting for a good moment and there has not been one.'],
    ]),
    DeathMegatron: numbered('vo.bing2.walkup.party', [
      ['DeathMegatron', 'Phone in the basket, kid. Everybody. It is a party, not a deposition.'],
    ]),
    'Hog Mama': numbered('vo.bing2.walkup.party', [
      ['Hog Mama', 'Thirty seconds, baby. Somebody has to run that light board and it is not going to be me.'],
    ]),
    'The Shubenator': numbered('vo.bing2.walkup.party', [
      ['The Shubenator', 'Great turnout. Great energy. Slightly low protein, but great energy.'],
    ]),
    'Captain Lou Sasole': numbered('vo.bing2.walkup.party', [
      ['Captain Lou Sasole', 'I flew in for this. I could have flown in for something else.'],
    ]),
    Irish: numbered('vo.bing2.walkup.party', [
      ['Irish', 'Sit down, sit down. So the egg— no, wait, you have got the walk on. Go on, then. Later.'],
    ]),
    'Old Stove': numbered('vo.bing2.walkup.party', [
      ['Old Stove', 'Nice party. I would not know. I am not here.'],
    ]),
    Lag: numbered('vo.bing2.walkup.party', [
      ['Lag', 'Everyone is standing in the same six feet of this room. Terrible spread. You get wiped by one grenade.'],
    ]),
    Seff: numbered('vo.bing2.walkup.party', [
      ['Seff', 'Quick thing. You are close with Lou now. Forget it. Later. It is a calendar thing.'],
    ]),
    Sauce: numbered('vo.bing2.walkup.party', [
      ['Sauce', 'Plate. You are the only man in this room who has not eaten and it is starting to insult me.'],
      ['Sauce', 'Billy asked me what was in the sauce. Eight years I have known him. He has never once asked what was in anything.'],
    ]),
    'The Bartender': numbered('vo.bing2.walkup.party', [
      ['The Bartender', 'Open bar, closed room. I have been told to keep pouring and to stop counting.'],
    ]),
    'The Dealer': numbered('vo.bing2.walkup.party', [
      ['The Dealer', "The table is open. It is Mister Sputthole's table and it is Mister Sputthole's money. Play accordingly."],
    ]),
    Security: numbered('vo.bing2.walkup.party', [
      ['Security', 'Nobody comes through this door tonight. That includes people you know.'],
      ['Security', 'I work for Mister Sputthole. I do not work the party. Enjoy yourself.'],
    ]),
  }),
  cleanup: Object.freeze({
    Booskibro: numbered('vo.bing2.walkup.cleanup', [
      ['Booskibro', 'One cufflink, one pin, one tab. I am counting because nobody else can count under pressure.'],
    ]),
    Snow: numbered('vo.bing2.walkup.cleanup', [
      ['Snow', 'Route is clear. Graveyard first. Motel after.'],
      /* His answer to Aubbie's shower-curtain line, which now names him. */
      ['Snow', 'The shovel made sense when I picked it up.'],
    ]),
    /* SNOW, NOT LAWNMOWER. Lawnmower is Snow's nickname and always was --
     * `HOTDOG_SPEAKERS` casts both names onto one body and one voice -- but
     * this line was the last user-facing place in the scene where the two
     * read as two men, because Aubbie was blaming somebody the player has
     * never been introduced to while Snow stood four feet away holding a
     * shovel. Same joke, same rhythm, the right name on it. The old wording
     * is a re-record: see docs/audio/pending-bing-cues.json. */
    Aubbie: numbered('vo.bing2.walkup.cleanup', [
      ['Aubbie', 'Correct plastic is in storage. The shower curtain was Snow.'],
    ]),
    'Hog Mama': numbered('vo.bing2.walkup.cleanup', [
      ['Hog Mama', 'The cake did not kill anybody and I am not throwing it out.'],
    ]),
    Gratin: numbered('vo.bing2.walkup.cleanup', [
      ['Gratin', 'The kitchen stays hot. Bleach smells like bleach; onions smell like business.'],
    ]),
    DeathMegatron: numbered('vo.bing2.walkup.cleanup', [
      ['DeathMegatron', 'Phone in the basket. Door stays locked.'],
    ]),
    Rippinflow: numbered('vo.bing2.walkup.cleanup', [
      ['Rippinflow', 'Ape stays in the booth. HotDog stays wherever we put him.'],
    ]),
    Numbskull: numbered('vo.bing2.walkup.cleanup', [
      ['Numbskull', 'Do we load the broken stool before or after the person?'],
    ]),
    Ape: numbered('vo.bing2.walkup.cleanup', [
      ['Ape', 'I am not going to explain it to you. Lou will, when he wants you to know.'],
    ]),
    'The Shubenator': numbered('vo.bing2.walkup.cleanup', [
      ['The Shubenator', 'I have got the back hall. Mop, bucket, no complaints. Everybody has a lift they are good at.'],
    ]),
    'Captain Lou Sasole': numbered('vo.bing2.walkup.cleanup', [
      ['Captain Lou Sasole', 'You will sleep. Everybody says they will not, and then everybody does.'],
    ]),
    Willy: numbered('vo.bing2.walkup.cleanup', [
      ['Willy', 'I was in the bathroom. Whole time. That is not a lie I am telling, that is a lie I am practising.'],
    ]),
    Irish: numbered('vo.bing2.walkup.cleanup', [
      ['Irish', 'Eight months he was away and eleven minutes he was back. Somebody should look into that. Nobody will.'],
    ]),
    'Old Stove': numbered('vo.bing2.walkup.cleanup', [
      ['Old Stove', 'Wipe it down twice. Once is for you, twice is for the fella who comes after you.'],
    ]),
    Lag: numbered('vo.bing2.walkup.cleanup', [
      ['Lag', 'I have carried worse. Different weight class, obviously.'],
    ]),
    Seff: numbered('vo.bing2.walkup.cleanup', [
      ['Seff', 'Nobody is going to want the mattresses now. That is what gets me about tonight.'],
    ]),
    Sauce: numbered('vo.bing2.walkup.cleanup', [
      ['Sauce', 'The food goes out covered, in my van, before anything else leaves this building. Nobody looks twice at a man carrying trays.'],
    ]),
    'The Bartender': numbered('vo.bing2.walkup.cleanup', [
      ['The Bartender', 'Every glass in the room, washed twice. Nobody asked me to. I would like that noticed.'],
    ]),
    'The Dealer': numbered('vo.bing2.walkup.cleanup', [
      ['The Dealer', 'Shoe is boxed, felt is brushed, chips are counted. I watched a comedian and I went home.'],
    ]),
    Security: numbered('vo.bing2.walkup.cleanup', [
      ['Security', 'That door has not opened since eleven. It is what I will say, and it is also true.'],
    ]),
  }),
});

/**
 * Lines the runtime used to print as HUD prose, in the voice of somebody
 * standing right there.
 *
 * The one the owner caught by name is `louWrapHim` — the screen was writing
 * "Lou checks the room once, slowly" and then quoting him, with Lou in front
 * of the player saying nothing. Every entry here is now spoken; where an
 * actual instruction or checklist has to follow, the runtime puts it up after
 * the line rather than over it.
 */
export const HOTDOG_STAGED_LINES = Object.freeze({
  shubenatorStageNudge: line(
    'The Shubenator',
    'Prospect. Stage controls. Before Hog Mama starts without electricity.',
    'vo.bing2.shubenator.nudge',
    { direction: 'Shouted across a loud room, cheerfully, with no sense that he is nagging.' },
  ),
  louPartyGreeting: line(
    'Big Uncle Lou',
    'Enjoy the party, Prospect. That is an order with a very short shelf life.',
    'vo.bing2.lou.enjoy',
  ),
  /* REWRITTEN for the order the club actually works in (owner, 2026-08-19):
   * the men's room, the kit and the jewellery, and then Billy travels. The
   * sweep is not in this list any more because the sweep is the LAST thing
   * that happens in this building and Lou hands it out himself, afterwards,
   * once there is no longer a body in the room to sweep around. The old
   * wording also said "both bathrooms" at a club with one working one. */
  louCleanupBriefing: line(
    'Big Uncle Lou',
    'Prospect. The men\'s room, Aubbie\'s kit, and every piece of him that came off this floor. Then Billy travels.',
    'vo.bing2.lou.briefing',
    { direction: 'Turning panic into departments. Flat, fast, and completely unbothered.' },
  ),
  /* The body is in the trunk and the man is still standing in his own club.
   * THIS is where the evidence sweep comes from -- not from a checklist that
   * appeared the second Billy hit the boards. */
  louSweepOrder: line(
    'Big Uncle Lou',
    'He is gone. Now the room. Every surface, every corner, the whole of it, once, properly. Then you have never been here.',
    'vo.bing2.lou.sweep_order',
    { direction: 'Quiet and completely level. He is not angry, he is closing a shift.' },
  ),
  louLeaveNow: line(
    'Big Uncle Lou',
    'Out the back with Snow. Do not stop in the lot and do not use the front.',
    'vo.bing2.lou.leave_now',
  ),
  louSweepIncomplete: line(
    'Big Uncle Lou',
    'That is not a swept room. Finish it and come back to me.',
    'vo.bing2.lou.not_swept',
  ),
  louWrapHim: line(
    'Big Uncle Lou',
    'Wrap him. Snow gets the keys.',
    'vo.bing2.lou.wrap_him',
    { direction: 'He checks the whole room once, slowly, and only then says it. Quiet, final, and entirely ordinary to him.' },
  ),
  louRoomClosed: line(
    'Big Uncle Lou',
    'It looks closed. That is not the same as clean, and closed is what I asked for.',
    'vo.bing2.lou.closed_not_clean',
  ),
  aubbieKitCalled: line(
    'Aubbie',
    'Everything in that case is labelled. Use what is labelled.',
    'vo.bing2.aubbie.kit',
  ),
  booskiEvidenceFirst: line(
    'Booskibro',
    'That is one. There is another one somewhere and it is ruining my night.',
    'vo.bing2.booski.evidence.1',
  ),
  booskiEvidenceBoth: line(
    'Booskibro',
    'That is both. Tell Lou it is both, and tell him I counted.',
    'vo.bing2.booski.evidence.2',
  ),
  rippinWrapPrompt: line(
    'Rippinflow',
    'I have got the shoulders. You have got the legs. On me.',
    'vo.bing2.rippin.shoulders',
  ),
  aubbieWrapDone: line(
    'Aubbie',
    'Tight, covered, nothing loose. He travels now.',
    'vo.bing2.aubbie.wrapped',
  ),
  snowCarryPrompt: line(
    'Snow',
    'Take him. Through the store room, out the back, straight into the trunk. Do not put him down.',
    'vo.bing2.snow.carry',
    { direction: 'Instructions, not encouragement. He has said this to somebody before.' },
  ),
  snowLoadPrompt: line(
    'Snow',
    'Trunk is open. You and Numbskull, on three.',
    'vo.bing2.snow.trunk',
  ),
  booskiShotOffer: line(
    'Booskibro',
    'Prospect, how about a shot?',
    'vo.bing2.booski.shot_offer',
    { direction: 'Not a question. Warm, flat, and already looking at the bartender.' },
  ),
  sauceBuffetPlate: line(
    'Sauce',
    'Eat something. Now, while it is still a party.',
    'vo.bing2.sauce.plate',
    { direction: 'Handing over a plate the man did not ask for and will not be allowed to refuse.' },
  ),
});

/** Every line in this file, for the voice catalog and the recording sheet. */
export function hotDogRoomVoiceLines() {
  const lines = [];
  for (const conversation of [...HOTDOG_PARTY_CHATTER, ...HOTDOG_CLEANUP_CHATTER]) {
    lines.push(...conversation.lines);
  }
  lines.push(...Object.values(HOTDOG_BEAT_REACTION_LINES));
  lines.push(...HOTDOG_ATTACK_REACTIONS);
  for (const table of Object.values(HOTDOG_WALKUP_LINES)) {
    for (const entries of Object.values(table)) lines.push(...entries);
  }
  lines.push(...Object.values(HOTDOG_STAGED_LINES));
  return lines;
}

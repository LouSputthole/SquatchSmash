/**
 * Everything anybody says at Silver Pines.
 *
 * Same arrangement as the Bing and the Silver Room: this file is the script,
 * `dialogue.js` is the machine that plays it, and neither knows much about the
 * other. What is different here is that every spoken line is a *cue* with a
 * stable id, and the conversation trees reference those ids rather than
 * carrying their own text. Nothing anywhere is addressed by array position, so
 * reordering an exchange can never attach yesterday's audio to today's line.
 *
 * The golf is what gives these four permission to stand around and talk. The
 * scene is not shots with conversation between them; it is a conversation with
 * shots in it, and the priorities below are written that way — a reaction to a
 * tee shot will never step on Lou explaining why the Prospect was invited.
 */

import { CHARACTER_IDS } from '../core/campaign.js';

export const LOU = CHARACTER_IDS.LOU;
export const RIPPIN = CHARACTER_IDS.RIPPINFLOW;
export const ERIC = CHARACTER_IDS.ERICAN;
export const PROSPECT = CHARACTER_IDS.PROSPECT;

/**
 * How hard a line pushes.
 *
 *   story     the scene's spine. Never interrupted, never skipped, once only.
 *   reaction  a response to something that just happened. Bumps banter.
 *   banter    ambient. Yields to everything, and knows when to shut up.
 */
export const PRIORITY = { STORY: 'story', REACTION: 'reaction', BANTER: 'banter' };

const registry = {};

/**
 * Declare a line.
 *
 * `direction` is for whoever ends up recording these. It is not a comment: it
 * is the only instruction a voice actor gets about a line whose whole job is
 * the pause after it.
 */
function cue(id, speaker, text, opts = {}) {
  if (registry[id]) throw new Error(`Silver Pines: duplicate cue "${id}"`);
  const entry = {
    id,
    speaker,
    text,
    direction: opts.direction ?? '',
    priority: opts.priority ?? PRIORITY.BANTER,
    once: opts.once ?? false,
    interruptible: opts.interruptible ?? true,
    cooldown: opts.cooldown ?? 0,
    gesture: opts.gesture ?? null,
    look: opts.look ?? null,
    /* An authored beat of silence *after* the line, in seconds. The single
     * most important number in this file is the one on `lou.invited_you`. */
    hold: opts.hold ?? 0,
    when: opts.when ?? null,
  };
  registry[id] = entry;
  return id;
}

/* ================================================================== */
/* THE CAR PARK                                                        */
/* ================================================================== */

cue('golf.h1.lou.there_he_is', LOU,
  'There he is. Shoes are wrong, but he’s here.',
  {
    direction: 'Not a greeting. An observation he is happy to have made.',
    priority: PRIORITY.STORY, once: true, interruptible: false,
  });

cue('golf.h1.rippin.golf_shoes', RIPPIN,
  'Those are golf shoes if you stop respecting golf.',
  { direction: 'Delighted with himself. Already mid-practice-swing.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.morning', ERIC,
  'Morning.',
  { direction: 'Flat, warm, complete. He has already said everything he needs to.', priority: PRIORITY.STORY, once: true });

// --- the four answers ---
cue('golf.h1.lou.i_noticed', LOU,
  'I noticed. That’s why I didn’t call.',
  { direction: 'The compliment is buried and he is not digging it up.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.becomes_work', LOU,
  'It’s golf. It becomes work around the second bad shot.',
  { direction: 'Dry. He is not joking and it is still funny.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.first_tee', RIPPIN,
  'For him, that’s the first tee.',
  { direction: 'Instant. He had this ready before the sentence finished.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.and_yet', ERIC,
  'And yet these were the ones you brought.',
  { direction: 'Gentle. He is not scoring a point, he is closing a door.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.saving_words', RIPPIN,
  'He’s saving his words for the scorecard.',
  { direction: 'Filling the silence because somebody has to and it is always him.', priority: PRIORITY.STORY, once: true });

// --- the bag ---
cue('golf.h1.lou.three_clubs', LOU,
  'Three clubs. You don’t need seventeen ways to make the same mistake.',
  {
    direction: 'Handing it over without ceremony. Advice about golf and about everything else.',
    priority: PRIORITY.STORY, once: true, interruptible: false, gesture: 'hand_bag',
  });

cue('golf.h1.rippin.i_do', RIPPIN, 'I do.',
  { direction: 'Immediate. No shame whatsoever.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.he_does', ERIC, 'He does.',
  { direction: 'Confirming a fact, not agreeing with a joke.', priority: PRIORITY.STORY, once: true });

/* ================================================================== */
/* THE FIRST TEE                                                       */
/* ================================================================== */

cue('golf.h1.rippin.par_three', RIPPIN,
  'Par three. One-sixty-seven. Water right, bunker left, dignity everywhere.',
  { direction: 'Reading the hole like a man announcing a fight.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.middle_of_green', ERIC,
  'Middle of the green. Ignore the flag.',
  { direction: 'To the Prospect, quietly. The single most useful sentence anybody says today.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.advice_for_both', LOU,
  'That advice is for both of you.',
  { direction: 'Without looking up from the card.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.know_what_im_doing', RIPPIN,
  'I know what I’m doing.',
  { direction: 'He does not.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.selected_driver', ERIC,
  'You have selected a driver.',
  { direction: 'Perfectly level. This is how Eric roasts people.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.visualizing_hole_two', RIPPIN,
  'I’m visualizing Hole Two.',
  { direction: 'Unbothered. It is, in his mind, a complete defence.', priority: PRIORITY.STORY, once: true });

// --- "So why am I here?" ---
cue('golf.h1.prospect.why_am_i_here', PROSPECT,
  'So why am I here?',
  { direction: 'Asked lightly, because asking it seriously would cost too much.', priority: PRIORITY.STORY, once: true });

/* The line the whole scene is built around.
 *
 * Two sentences and a pause. The first sentence takes the excuse away; the
 * second one is the reason. `hold` is three seconds because nobody says
 * anything after it — Eric's line has to arrive *late*, into a silence that
 * has already become uncomfortable, or the moment is just dialogue. */
cue('golf.h1.lou.invited_you', LOU,
  'We can find a fourth. We invited you.',
  {
    direction: 'Low, matter-of-fact, no warmth added. Let the significance arrive '
      + 'after the sentence rather than inside it. He does not look at him.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 3.0,
  });

cue('golf.h1.eric.that_is_different', ERIC,
  'That is different.',
  {
    direction: 'Into the silence, after it has gone on slightly too long. He is '
      + 'telling the Prospect what just happened, because Lou never will.',
    priority: PRIORITY.STORY, once: true, interruptible: false,
  });

cue('golf.h1.rippin.more_expensive', RIPPIN,
  'And more expensive. Lou never pays for the fourth.',
  { direction: 'Breaking the moment on purpose, the way friends do.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.rippin_wouldnt', LOU,
  'If it was a test, Rippin wouldn’t be administering it.',
  { direction: 'Amused, barely.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.credentials', RIPPIN, 'I have credentials.',
  { direction: 'Wounded.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.you_have_clubs', ERIC, 'You have clubs.',
  { direction: 'The quiet last line. Do not push it.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.earned_invitation', LOU,
  'You earned the invitation. Morning’s still up for debate.',
  { direction: 'The first half is real and he moves past it fast.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.three_holes_rippin', LOU,
  'Three holes with Rippin.',
  { direction: 'Deadpan.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.all_love', RIPPIN, 'It’s all love.',
  { direction: 'The house phrase. Warm and completely automatic.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.already_not', ERIC, 'It is already not all love.',
  { direction: 'Flat. Closing the exchange.', priority: PRIORITY.STORY, once: true });

/* ================================================================== */
/* NPC TEE SHOTS                                                       */
/* ================================================================== */

cue('golf.h1.rippin.not_cricket', RIPPIN,
  'Eric, this isn’t cricket.',
  { direction: 'Heckling for the sake of it.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.eric.cricket_rules', ERIC,
  'Cricket would have more rules and somehow less waiting.',
  { direction: 'Mid-address. He does not stop what he is doing to say it.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.safe_1', RIPPIN, 'Safe.',
  { direction: 'An accusation.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.on_the_green', ERIC, 'On the green.',
  { direction: 'A fact.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.safe_2', RIPPIN, 'Safe.',
  { direction: 'Same word, no less certain.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.yes', ERIC, 'Yes.',
  { direction: 'Conceding nothing at all.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.watch_this', RIPPIN, 'Watch this.',
  { direction: 'Genuine confidence. That is what makes it funny.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.no', LOU, 'No.',
  { direction: 'Not looking. Already knows.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.exactly_where', RIPPIN,
  'Exactly where I wanted it.',
  { direction: 'Instantly, before the sand has settled.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.wanted_bunker', ERIC, 'You wanted the bunker?',
  { direction: 'Sincere curiosity, which is worse.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.information', RIPPIN,
  'I wanted information about the bunker.',
  { direction: 'Committing hard to the bit.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.you_have_it', LOU, 'You have it.',
  { direction: 'Final.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.prospect.no_practice_swing', PROSPECT, 'No practice swing?',
  { direction: 'Curious rather than cheeky. He is watching how Lou does things.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.practiced_before', LOU,
  'I practiced before you got here.',
  { direction: 'Already over the ball. It is not a boast.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.oldest_man_shot', RIPPIN,
  'That is the oldest-man shot I’ve ever seen.',
  { direction: 'Real admiration disguised as an insult.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.closer_than_yours', LOU, 'It’s closer than yours.',
  { direction: 'Walking away as he says it.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.all_love_2', RIPPIN, 'It’s all love.',
  { direction: 'Retreating.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.get_in_the_sand', LOU, 'Get in the sand.',
  { direction: 'Not unkind. Entirely an instruction.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.thirty_seconds', RIPPIN,
  'You got thirty fucking seconds before I start coaching.',
  { direction: 'Loud, cheerful, and a promise rather than a threat.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.eric.nobody_wants_that', ERIC, 'Nobody wants that.',
  { direction: 'Immediate.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.middle_swing_once', LOU,
  'Middle of the green. Swing once.',
  {
    direction: 'The only coaching he gives all morning, and it is the same '
      + 'advice Eric gave. That is the point.',
    priority: PRIORITY.STORY, once: true, interruptible: false,
  });

/* ================================================================== */
/* THE PLAYER'S TEE SHOT                                               */
/* ================================================================== */

cue('golf.h1.rippin.piping_hot', RIPPIN, 'Piping hot.',
  { direction: 'Genuine. He is pleased and slightly annoyed about being pleased.', priority: PRIORITY.REACTION });
cue('golf.h1.eric.that_will_play', ERIC, 'That will play.',
  { direction: 'The highest praise Eric gives.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.pick_up_the_tee', LOU, 'Pick up the tee.',
  { direction: 'No congratulation. Moving him along, which IS the congratulation.', priority: PRIORITY.REACTION });

cue('golf.h1.eric.boring_works', ERIC,
  'Middle of the green. Boring works.',
  { direction: 'Approving.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.located_grass', RIPPIN,
  'Let it be known, the Prospect has located grass.',
  { direction: 'Announcing it to the whole course.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.aiming_there', LOU, 'He was aiming there.',
  { direction: 'Quiet defence. Rare and worth noticing.', priority: PRIORITY.REACTION });

cue('golf.h1.lou.fine', LOU, 'Fine.',
  { direction: 'One syllable, entirely unreadable.', priority: PRIORITY.REACTION });
cue('golf.h1.prospect.fine_good_or_bad', PROSPECT, 'Fine good or fine bad?',
  { direction: 'He has learned to ask.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.find_out_when_you_putt', LOU, 'You’ll find out when you putt.',
  { direction: 'Enjoying himself.', priority: PRIORITY.REACTION });

cue('golf.h1.rippin.welcome', RIPPIN, 'Welcome.',
  { direction: 'Hosting. From inside the bunker.', priority: PRIORITY.REACTION });
cue('golf.h1.prospect.you_wanted_information', PROSPECT,
  'You said you wanted information.',
  { direction: 'The first time he gives one back without checking Lou first.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.ill_brief_you', RIPPIN, 'I’ll brief you.',
  { direction: 'Thrilled to have been got.', priority: PRIORITY.REACTION });

cue('golf.h1.eric.you_have_a_shot', ERIC, 'You have a shot.',
  { direction: 'Encouraging and technically true.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.several_trees_first', RIPPIN, 'He has several trees first.',
  { direction: 'Helpfully.', priority: PRIORITY.REACTION });

cue('golf.h1.rippin.aim_for_the_bushes', RIPPIN,
  'Aim for the bushes next time. They float better.',
  { direction: 'The old line, deployed with love.', priority: PRIORITY.REACTION });
cue('golf.h1.eric.bushes_do_not_float', ERIC, 'The bushes do not float.',
  { direction: 'Correcting the record.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.more_than_that_ball', RIPPIN, 'More than that ball.',
  { direction: 'Winning.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.take_the_drop', LOU,
  'Take the drop. Forget the shot.',
  { direction: 'The most useful thing anybody says to him all day.', priority: PRIORITY.REACTION, interruptible: false });

cue('golf.h1.lou.wrong_club', LOU, 'You brought the wrong club.',
  { direction: 'Watching it sail.', priority: PRIORITY.REACTION });
cue('golf.h1.prospect.you_gave_me_the_club', PROSPECT, 'You gave me the club.',
  { direction: 'Bold. He would not have said this a week ago.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.also_gave_you_an_iron', LOU, 'I also gave you an iron.',
  { direction: 'Unhurried. He has had this answer the whole time.', priority: PRIORITY.REACTION });

cue('golf.h1.rippin.let_him_cook', RIPPIN, 'No. Let him cook.',
  { direction: 'Absolutely serious.', priority: PRIORITY.REACTION });
cue('golf.h1.eric.one_hundred_sixty_seven', ERIC,
  'He is putting from one hundred and sixty-seven yards.',
  { direction: 'Stating it for the record, and for Rippin.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.know_what_i_said', RIPPIN, 'I know what I said.',
  { direction: 'Standing by it.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.didnt_promise_to_defend', LOU,
  'We invited him. We didn’t promise to defend him.',
  { direction: 'The joke and the reassurance in the same sentence.', priority: PRIORITY.REACTION });

// --- the ace ---
cue('golf.h1.rippin.absolutely_not', RIPPIN, 'No. Absolutely not.',
  {
    direction: 'After two full seconds of nobody saying anything. Genuine outrage.',
    priority: PRIORITY.STORY, once: true, interruptible: false,
  });
cue('golf.h1.eric.that_went_in', ERIC, 'That went in.',
  { direction: 'Quietly astonished, which for Eric is a shout.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.reject_the_event', RIPPIN,
  'Let it be known, I reject the event.',
  { direction: 'Formally.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.it_counts', LOU, 'It counts.',
  { direction: 'Final and slightly amused.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.first_hole_ace', RIPPIN,
  'First hole with us and he gets an ace?',
  { direction: 'To Lou, appealing to a higher court.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.before_he_changes_his_mind', LOU,
  'Pick up the ball before he changes his mind.',
  { direction: 'Warm. As close to proud as he gets in public.', priority: PRIORITY.STORY, once: true });

/* ================================================================== */
/* THE CART RIDE                                                       */
/* ================================================================== */

cue('golf.h1.lou.you_did_good', LOU,
  'You did good.',
  {
    direction: 'After a long stretch of nothing but the motor. He does not turn '
      + 'his head. This is the second most important line in the scene.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 1.6,
  });

cue('golf.h1.lou.rarer_than_you_think', LOU,
  'That’s rarer than you think.',
  { direction: 'Meant. Not softened.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.lucky_a_lot', LOU,
  'Once is luck. You’ve been lucky a lot lately.',
  { direction: 'The nearest thing to a compliment he owns.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.everybody_gets_in_a_room', LOU,
  'Everybody gets in a room and talks like they knew the answer already.',
  { direction: 'Tired of rooms.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.dont_have_to_fill_it', LOU,
  'You don’t have to fill every quiet minute. That’s one of the reasons you’re here.',
  {
    direction: 'The reward for saying nothing. Deliver it as information, not as praise.',
    priority: PRIORITY.STORY, once: true, interruptible: false,
  });

cue('golf.h1.lou.you_listened', LOU,
  'The Bing. The restaurant. The plane. You listened when it mattered.',
  { direction: 'Counting them off without emphasis.', priority: PRIORITY.STORY, once: true, hold: 1.2 });

cue('golf.h1.lou.big_nights_coming', LOU,
  'You’ve got a couple big nights coming.',
  { direction: 'Casual. He has been waiting the whole cart ride to say this.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.prospect.what_kind_of_nights', PROSPECT, 'What kind of nights?',
  { direction: 'Careful.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.wednesday_is_the_room', LOU,
  'Wednesday is the room. Everybody’s there.',
  { direction: 'Flat, and enormous.', priority: PRIORITY.STORY, once: true, hold: 1.4 });
cue('golf.h1.lou.another_night_bigger', LOU,
  'After that, there’s another night. Bigger.',
  { direction: 'He does not elaborate and does not intend to.', priority: PRIORITY.STORY, once: true, hold: 1.2 });

cue('golf.h1.lou.stop_calling_you_prospect', LOU,
  'If Wednesday goes how I think, they stop calling you Prospect.',
  { direction: 'The whole game, said once, quietly, from a golf cart.', priority: PRIORITY.STORY, once: true, interruptible: false });
cue('golf.h1.lou.ready_is_a_word', LOU,
  'Ready is a word people use before they know the question.',
  { direction: 'Not a put-down.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.play_golf_again', LOU,
  'Then we play golf again next week and pretend this conversation didn’t happen.',
  { direction: 'Kind, and completely serious.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.good', LOU, 'Good.',
  { direction: 'Case closed.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.nobody_invited_you_to_audition', LOU,
  'Nobody invited you here to audition. You already did that.',
  {
    direction: 'As the cart slows. He is out of it before the sentence has landed, '
      + 'because staying would make it a speech.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 2.2,
  });

/* ================================================================== */
/* CONDITIONAL PAST-MISSION CALLBACKS                                  */
/* ================================================================== */
/* Every one of these reads real campaign state. Where a flag does not exist,
 * the line does not exist — nothing here is a reference to a mission the save
 * cannot confirm he played. */

cue('golf.h1.lou.noticed_the_car', LOU,
  'You noticed the car in the lot. Most people notice the gun and miss the car.',
  { direction: 'The highest technical compliment in the game.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.eric.lou_said_you_noticed', ERIC,
  'Lou said you noticed the car.',
  { direction: 'Making conversation, and passing on that Lou talks about him.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.prospect.sitting_wrong', PROSPECT, 'It was sitting wrong.',
  { direction: 'Understating it.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.lou.cars_do_that', LOU, 'Cars do that. People miss it.',
  { direction: 'Closing it.', priority: PRIORITY.BANTER, once: true });

cue('golf.h1.lou.six_hands', LOU,
  'You also played six hands while I waited.',
  { direction: 'Not angry. Filed.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.prospect.i_came_back', PROSPECT, 'I came back.',
  { direction: 'Steady.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.conversation_not_complaint', LOU,
  'That is why this is a conversation and not a complaint.',
  { direction: 'The rule of the whole family, stated once.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.hit_on_sixteen', LOU,
  'Try not to spend the whole morning deciding whether to hit on sixteen.',
  { direction: 'Over his shoulder, on the tee.', priority: PRIORITY.BANTER, once: true });

cue('golf.h1.rippin.buy_a_lesson', RIPPIN,
  'Use the slot money and buy a lesson.',
  { direction: 'Bitter about the machine.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.lou.won_more_than_you', LOU, 'He won more than you did.',
  { direction: 'Enjoying this.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.rippin.slots_arent_golf', RIPPIN, 'Slots aren’t golf.',
  { direction: 'Retreating to principle.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.eric.neither_was_your_tee_shot', ERIC,
  'Neither was your tee shot.',
  { direction: 'The kill.', priority: PRIORITY.BANTER, once: true });

cue('golf.h1.lou.wings_still_attached', LOU,
  'You brought the shipment back with the wings still attached.',
  { direction: 'Almost impressed.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.most_of_the_plane', LOU,
  'You brought most of the plane back.',
  { direction: 'The same sentence with the compliment removed.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.eric.land_a_plane', ERIC,
  'He can land a plane. He can land an iron.',
  { direction: 'Vouching for him, lightly.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.rippin.plane_has_a_runway', RIPPIN, 'A plane has a runway.',
  { direction: 'Objecting.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.lou.not_where_he_landed_it', LOU, 'Not where he landed it.',
  { direction: 'Dry. This is Lou being funny.', priority: PRIORITY.BANTER, once: true });

cue('golf.h1.lou.you_sat_down', LOU,
  'You sat down. You listened. You waited. Same rules out here.',
  { direction: 'Three short facts and a fourth that is the whole morning.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.waited_for_the_noise', LOU,
  'You waited for the noise. That was the important part.',
  { direction: 'Very quiet. Neither of them names what the noise was.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.rippin.social_calendar', RIPPIN,
  'Front-row table, golf with Lou. Prospect’s social calendar is piping hot.',
  { direction: 'Genuinely pleased for him and refusing to show it straight.', priority: PRIORITY.BANTER, once: true });
cue('golf.h1.lou.swing', LOU, 'Swing.',
  { direction: 'Ending the subject.', priority: PRIORITY.BANTER, once: true });

/* ================================================================== */
/* THE BUNKER                                                          */
/* ================================================================== */

cue('golf.h1.rippin.now_its_a_meeting', RIPPIN,
  'Good. Now it’s a meeting.',
  { direction: 'Delighted to have company in the sand.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.prospect.said_it_was_intentional', PROSPECT,
  'You said this was intentional.',
  { direction: 'Comfortable enough now to needle him.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.yours_worries_me', RIPPIN,
  'It was. Yours worries me.',
  { direction: 'Sincere concern, briefly.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.open_the_face', ERIC,
  'Open the face. Hit behind the ball.',
  { direction: 'Actual instruction. It actually works.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.close_the_face', RIPPIN,
  'Or close the face and hit the ball directly.',
  { direction: 'Confidently wrong.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.do_not_do_that', ERIC, 'Do not do that.',
  { direction: 'Fast, and the only time Eric raises his voice all morning.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.two_schools', RIPPIN, 'Two schools of thought.',
  { direction: 'Serene.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.eric.good_shot', ERIC, 'Good shot.',
  { direction: 'Plain and meant.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.learned_that_from_me', RIPPIN, 'He learned that from me.',
  { direction: 'Instantly claiming it.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.havent_hit_yours', LOU, 'You haven’t hit yours.',
  { direction: 'From the green, not looking over.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.enough_information', RIPPIN,
  'Now we have enough information.',
  { direction: 'The bit, completed. He is thrilled.', priority: PRIORITY.REACTION });

/* ================================================================== */
/* THE GREEN                                                           */
/* ================================================================== */

cue('golf.h1.eric.roll_the_ball', ERIC,
  'Do not hit the hole. Roll the ball to the hole.',
  { direction: 'Teaching, gently.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.hitting_slowly', RIPPIN,
  'That is hitting the hole slowly.',
  { direction: 'Pleased with the logic.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.not_what_i_said', ERIC, 'That is not what I said.',
  { direction: 'Patient.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.green_falls_toward_water', LOU,
  'Green falls toward the water.',
  {
    direction: 'The only genuinely useful read anybody gives, offered without '
      + 'being asked, which is Lou helping.',
    priority: PRIORITY.REACTION, once: true,
  });

cue('golf.h1.prospect.how_much_break', PROSPECT, 'How much break?',
  { direction: 'Asking for help out loud, which he could not have done on Day One.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.less_than_rippin_says', ERIC, 'Less than Rippin says.',
  { direction: 'Immediate.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.havent_said_anything', RIPPIN, 'I haven’t said anything.',
  { direction: 'Indignant.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.exactly_that_much', ERIC, 'Exactly that much.',
  { direction: 'The quiet last line again. Let it sit.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.wednesday_big_night', RIPPIN,
  'So Wednesday is the big night.',
  { direction: 'Filling a wait, and not entirely by accident.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.one_of_them', LOU, 'One of them.',
  { direction: 'Not encouraging this.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.second_one_is_fun', RIPPIN, 'The second one is the fun one.',
  { direction: 'Lighting up.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.eric.only_if_first_goes_well', ERIC,
  'The second one is only fun if the first one goes well.',
  { direction: 'Levelling it.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.prospect.what_happens_second', PROSPECT,
  'What happens on the second one?',
  { direction: 'He wants to know and is trying not to sound like it.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.receipt_and_jacket', RIPPIN,
  'You wake up with a receipt in your pocket and somebody else’s jacket.',
  { direction: 'Fond memory. Not a warning.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.do_not_listen_to_him', LOU, 'Do not listen to him.',
  { direction: 'Half-hearted.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.eric.that_does_happen', ERIC, 'That does happen.',
  { direction: 'Flatly confirming it.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.not_every_time', LOU, 'Not every time.',
  { direction: 'The last word, and not a denial.', priority: PRIORITY.STORY, once: true });

/* ================================================================== */
/* PUTTING                                                             */
/* ================================================================== */

cue('golf.h1.rippin.let_me_watch_you', RIPPIN,
  'Let me watch you let you watch me.',
  { direction: 'He does not know where the sentence is going either.', priority: PRIORITY.REACTION });
cue('golf.h1.eric.did_not_survive', ERIC,
  'That sentence did not survive the putt.',
  { direction: 'Immediate.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.good_roll', LOU, 'Good roll.',
  { direction: 'Two words. From Lou that is a standing ovation.', priority: PRIORITY.REACTION });

cue('golf.h1.lou.had_the_line', LOU, 'Had the line.',
  { direction: 'Consoling, barely.', priority: PRIORITY.REACTION });
cue('golf.h1.eric.needed_the_rest', ERIC, 'Needed the rest of the putt.',
  { direction: 'Helpfully unhelpful.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.cant_leave_a_big_night_short', RIPPIN,
  'You can’t leave a big night short.',
  { direction: 'Enormously pleased with the callback.', priority: PRIORITY.REACTION });

cue('golf.h1.rippin.still_moving_1', RIPPIN, 'Still moving.',
  { direction: 'Narrating.', priority: PRIORITY.REACTION });
cue('golf.h1.eric.yes_2', ERIC, 'Yes.',
  { direction: 'Watching it go.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.still_moving_2', RIPPIN, 'Still moving.',
  { direction: 'Same delivery. That is the joke.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.we_see_it', LOU, 'We see it.',
  { direction: 'Enough.', priority: PRIORITY.REACTION });

cue('golf.h1.rippin.that_is_criminal', RIPPIN, 'That is criminal.',
  { direction: 'Outraged on his behalf.', priority: PRIORITY.REACTION });
cue('golf.h1.lou.criminal_pays_better', LOU,
  'No. Criminal pays better.',
  { direction: 'Absolutely deadpan. The best joke in the scene.', priority: PRIORITY.REACTION });

cue('golf.h1.eric.take_your_time', ERIC, 'Take your time.',
  { direction: 'Kind.', priority: PRIORITY.REACTION });
cue('golf.h1.rippin.took_his_time', RIPPIN,
  'He took his time. That was the problem.',
  { direction: 'Immediately undoing the kindness.', priority: PRIORITY.REACTION });
cue('golf.h1.prospect.its_all_love', PROSPECT, 'It’s all love.',
  {
    direction: 'The first time the Prospect uses the house phrase. Play it as a '
      + 'man trying on a jacket that turns out to fit.',
    priority: PRIORITY.REACTION, once: true,
  });
cue('golf.h1.rippin.not_on_the_scorecard', RIPPIN, 'Not on the scorecard.',
  { direction: 'Warmly.', priority: PRIORITY.REACTION });

/* ================================================================== */
/* HOLE COMPLETE                                                       */
/* ================================================================== */

cue('golf.h1.rippin.inspect_scorecard', RIPPIN,
  'I want the scorecard inspected.',
  { direction: 'Still not over it.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.you_watched_it', ERIC, 'You watched it happen.',
  { direction: 'Reasonable.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.dont_trust_witnesses', RIPPIN, 'I don’t trust witnesses.',
  { direction: 'A whole character in four words.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.one', LOU, 'One.',
  { direction: 'Writing it down.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.prospect.thats_it', PROSPECT, 'That’s it?',
  { direction: 'A little wounded.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.parade_before_second_tee', LOU,
  'You want a parade before the second tee?',
  { direction: 'Affectionate. This is Lou pleased.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.piping_hot_2', RIPPIN, 'Piping hot.',
  { direction: 'Unreserved.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.birdie_on_the_first', ERIC, 'Birdie on the first.',
  { direction: 'Noting it for the card.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.good_start_forget_it', LOU,
  'Good start. Forget it.',
  { direction: 'Both halves are the advice.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.eric.par', ERIC, 'Par.',
  { direction: 'A fact worth stating.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.rippin.thats_golf', RIPPIN, 'That’s golf.',
  { direction: 'Generous, for him.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.nothing_wrong_with_boring', LOU,
  'Nothing wrong with boring.',
  { direction: 'And he is not only talking about the hole.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.still_invited', RIPPIN, 'Still invited.',
  { direction: 'A joke that is also the reassurance.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.useful_clarification', ERIC, 'Useful clarification.',
  { direction: 'Dry.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.one_hole_doesnt_decide', LOU,
  'One hole doesn’t decide anything.',
  { direction: 'Meant about more than golf and not flagged as such.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.rippin.good_thing_not_the_big_night', RIPPIN,
  'Good thing this isn’t the big night.',
  { direction: 'Cheerfully.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.he_finished', LOU, 'He finished.',
  { direction: 'Shutting it down, on the Prospect’s side.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.eric.that_matters', ERIC, 'That matters.',
  { direction: 'Quiet and completely sincere.', priority: PRIORITY.REACTION, once: true });

cue('golf.h1.lou.not_putting_all_that', LOU,
  'We are not putting all of that on the card.',
  { direction: 'Pen already moving.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.prospect.how_much_are_we_putting', PROSPECT,
  'How much are we putting?',
  { direction: 'He has worked out how this works.', priority: PRIORITY.REACTION, once: true });
cue('golf.h1.lou.enough_to_remember', LOU, 'Enough to remember.',
  { direction: 'Closing the card.', priority: PRIORITY.REACTION, once: true });

/* ================================================================== */
/* THE SCORECARD ARGUMENT AND THE WALK OFF                             */
/* ================================================================== */

cue('golf.h1.rippin.ground_under_repair', RIPPIN,
  'That was ground under repair.',
  { direction: 'Opening negotiations.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.eric.it_was_a_bunker', ERIC, 'It was a bunker.',
  { direction: 'Immovable.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.needed_repair', RIPPIN, 'It needed repair.',
  { direction: 'Airtight, in his view.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.five_1', LOU, 'Five.',
  { direction: 'Not looking up.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.four', RIPPIN, 'Four.',
  { direction: 'Trying it.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.five_2', LOU, 'Five.',
  { direction: 'Identical delivery.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.all_love_3', RIPPIN, 'It’s all love.',
  { direction: 'Deploying the phrase as a bargaining chip.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.six', LOU, 'Six.',
  { direction: 'The funniest line Lou has. Play it completely straight.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.rippin.five_is_fair', RIPPIN, 'Five is fair.',
  { direction: 'Instantly.', priority: PRIORITY.STORY, once: true });

cue('golf.h1.lou.one_down_two_to_go', LOU,
  'One down. Two to go.',
  { direction: 'Closing the card. Satisfied.', priority: PRIORITY.STORY, once: true, interruptible: false });
cue('golf.h1.rippin.next_ones_long', RIPPIN, 'Next one’s long.',
  { direction: 'Already walking.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.eric.par_five', ERIC, 'Par five.',
  { direction: 'Precise.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.driver_time', LOU,
  'Driver time.',
  {
    direction: 'To the Prospect, directly, for the first time all morning. He '
      + 'looks at him when he says it.',
    priority: PRIORITY.STORY, once: true, interruptible: false, look: 'prospect',
  });
cue('golf.h1.rippin.more_talking_than_golf', RIPPIN,
  'And more talking than golf.',
  { direction: 'Complaining about the thing he loves.', priority: PRIORITY.STORY, once: true });
cue('golf.h1.lou.thats_why_we_came', LOU,
  'That’s why we came.',
  {
    direction: 'The last line of the scene. He is not being sentimental and it '
      + 'is the most sentimental thing he has ever said.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 2.5,
  });

/* ================================================================== */
/* SAFETY, AND THE THINGS A PLAYER WILL TRY                            */
/* ================================================================== */

cue('golf.h1.rippin.easy_prospect', RIPPIN, 'Easy, Prospect.',
  { direction: 'Stepping back. Amused, not alarmed.', priority: PRIORITY.REACTION, cooldown: 12 });
cue('golf.h1.eric.we_are_standing_here', ERIC, 'We are standing here.',
  { direction: 'Reasonable.', priority: PRIORITY.REACTION, cooldown: 12 });
cue('golf.h1.lou.do_that_again_you_walk', LOU,
  'Do that again and you walk.',
  { direction: 'Not shouted. Considerably worse than shouted.', priority: PRIORITY.REACTION, cooldown: 20 });

cue('golf.h1.eric.thats_a_lot_of_club', ERIC,
  'That is a lot of club for a hundred and sixty-seven yards.',
  { direction: 'Observing, not stopping him.', priority: PRIORITY.BANTER, cooldown: 25 });
cue('golf.h1.rippin.hit_it_again', RIPPIN,
  'Hit it again. Something might change.',
  { direction: 'Supportive in the least useful way.', priority: PRIORITY.BANTER, cooldown: 30 });
cue('golf.h1.lou.were_not_in_a_hurry', LOU,
  'We’re not in a hurry.',
  { direction: 'And he genuinely is not. That is the whole morning.', priority: PRIORITY.BANTER, cooldown: 40 });


/* ================================================================== */
/* HOLE 2 — THE LONG WALK                                             */
/* ================================================================== */
/* Five hundred and twenty yards is four minutes of walking and about six
 * shots. That is the point of it: this is the hole with room in it for the
 * conversation that does not fit between two swings. The golf gets quieter
 * and the talking gets longer, and most of what they talk about is other
 * people — which is how a family tells you that you are in it. */

cue('golf.h2.rippin.now_we_talk', RIPPIN,
  'Five-twenty. Now we’re talking.',
  { direction: 'Genuinely happy. This is his hole and he knows it.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.eric.dogleg_right', ERIC,
  'It doglegs right at the pines. You cannot see the corner from here.',
  { direction: 'Information, offered before anybody asks for it.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.rippin.i_can_see_it', RIPPIN, 'I can see it.',
  { direction: 'He cannot.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.lou.driver', LOU,
  'Driver. Both of you.',
  { direction: 'Permission, and it is the first time he has given any.', priority: PRIORITY.STORY, once: true });

cue('golf.h2.rippin.watch_the_corner', RIPPIN,
  'I’m going over the corner.',
  { direction: 'Announcing a plan nobody asked to hear.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.eric.there_is_sand_there', ERIC, 'There is sand there.',
  { direction: 'Flat.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.rippin.not_where_im_going', RIPPIN, 'Not where I’m going.',
  { direction: 'Certain.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.eric.that_is_the_sand', ERIC,
  'That is the sand.',
  { direction: 'Not gloating. Reporting.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.rippin.different_sand', RIPPIN, 'Different sand.',
  { direction: 'Committed.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.lou.same_sand', LOU, 'Same sand.',
  { direction: 'Walking past him.', priority: PRIORITY.REACTION, once: true });

cue('golf.h2.rippin.eric_hits_it_nowhere', RIPPIN,
  'Eric hits it nowhere and finds it every time.',
  { direction: 'The closest he gets to a compliment.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.eric.that_is_the_game', ERIC, 'That is the game.',
  { direction: 'Mid-swing.', priority: PRIORITY.REACTION, once: true });

cue('golf.h2.prospect.you_hit_it_short', PROSPECT,
  'You hit it shorter than both of them.',
  { direction: 'Not a criticism. He is working something out.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.lou.im_in_the_fairway', LOU,
  'I’m in the fairway. They’re in a conversation about sand.',
  { direction: 'Dry, and it is the whole philosophy of the man.', priority: PRIORITY.STORY, once: true });

/* --- the long walk itself: the family, sideways --- */

cue('golf.h2.rippin.booski_rigged', RIPPIN,
  'Booskibro thinks this course is rigged. He thinks *golf* is rigged.',
  { direction: 'Delighted.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.eric.he_thinks_weather_is_rigged', ERIC,
  'He thinks the weather is rigged.',
  { direction: 'Deadpan.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.lou.hes_right_about_the_weather', LOU,
  'He’s right about the weather.',
  { direction: 'Completely unreadable.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.rippin.ape_says_cheating', RIPPIN,
  'Ape came out once. Accused a sprinkler of cheating.',
  { direction: 'Fondly.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.eric.he_had_a_point', ERIC,
  'It came on while he was over the ball. He had a point.',
  { direction: 'Fair-minded to a fault.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.rippin.shubes_cried', RIPPIN,
  'Shubes cried on the ninth at Ridgemont. Openly.',
  { direction: 'The best story he has.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.lou.he_did_not_cry', LOU, 'He did not cry.',
  { direction: 'Protective, barely.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.rippin.his_eyes_were_wet', RIPPIN, 'His eyes were wet.',
  { direction: 'Legally precise.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.eric.it_was_windy', ERIC, 'It was windy.',
  { direction: 'Closing it down, kindly.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.eric.gratin_butter_chicken', ERIC,
  'Gratin still owes me a proper butter chicken. He has been to India. He has *seen* it done.',
  { direction: 'The one subject Eric will not let go of.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.rippin.he_uses_a_jar', RIPPIN, 'He uses a jar.',
  { direction: 'Betraying a friend without hesitating.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.eric.i_know_he_uses_a_jar', ERIC,
  'I know he uses a jar. That is the entire problem.',
  { direction: 'The only time Eric sounds genuinely wounded all morning.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.rippin.irish_and_the_eggs', RIPPIN,
  'Irish is still looking into the eggs.',
  { direction: 'As though this is ordinary.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.prospect.what_eggs', PROSPECT, 'What eggs?',
  { direction: 'He has learned that asking is usually a mistake and asks anyway.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.lou.dont', LOU, 'Don’t.',
  { direction: 'Too late.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.rippin.eleven_months', RIPPIN,
  'Eleven months he’s been on it. Eleven.',
  { direction: 'Awed.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.rippin.hog_mama_bus', RIPPIN,
  'Hog Mama drove the bus to Atlantic City. Hog Mama *became* the bus.',
  { direction: 'A sentence he has clearly said before and will say again.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.eric.that_is_not_what_happened', ERIC, 'That is not what happened.',
  { direction: 'Tired.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.rippin.thats_how_i_tell_it', RIPPIN, 'That’s how I tell it.',
  { direction: 'Unmovable.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.lou.good_ole_days', LOU,
  'Good ole days.',
  { direction: 'Not nostalgic. Two words, put down like a stone.', priority: PRIORITY.STORY, once: true, hold: 1.6 });
cue('golf.h2.rippin.theyre_still_going', RIPPIN,
  'They’re still going, Lou.',
  { direction: 'Gently. This is Rippin being kind, which he does about once a year.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.lou.i_know_they_are', LOU,
  'I know they are. That’s why he’s here.',
  {
    direction: 'He does not look at the Prospect. This is the second time all '
      + 'morning he has said why, and he says it to Rippin instead.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 2.4,
  });

/* --- the second big night, properly this time --- */

cue('golf.h2.prospect.ten_drunk_cigarettes', PROSPECT,
  'Somebody said something about ten drunk cigarettes.',
  { direction: 'Trying it out. Testing whether he is allowed the vocabulary.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.rippin.oh_hes_heard', RIPPIN,
  'Oh, he’s heard.',
  { direction: 'Enormously pleased.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.eric.thats_the_second_night', ERIC,
  'That is the second night, yes.',
  { direction: 'Confirming a fixture.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.lou.one_night_at_a_time', LOU,
  'One night at a time.',
  { direction: 'Closing it, without any weight on it.', priority: PRIORITY.STORY, once: true });

cue('golf.h2.rippin.squatch_up', RIPPIN,
  'Squatch up, Prospect. It’s a par five, not a funeral.',
  { direction: 'Loud, across the fairway.', priority: PRIORITY.REACTION });
cue('golf.h2.eric.let_him_think', ERIC, 'Let him think.',
  { direction: 'Quiet.', priority: PRIORITY.REACTION });

cue('golf.h2.lou.three_shots_to_get_there', LOU,
  'Three shots to get there. You have got room to be wrong twice.',
  { direction: 'Advice, and permission, in one sentence.', priority: PRIORITY.REACTION, once: true });

cue('golf.h2.rippin.sallie_j_hit_one', RIPPIN,
  'Sallie J hit one out here once. Still going, far as anybody knows.',
  { direction: 'Looking off into the trees.', priority: PRIORITY.BANTER, once: true });
cue('golf.h2.lou.nehoo', LOU, 'Nehoo with a guu.',
  { direction: 'Under his breath. Not for anybody.', priority: PRIORITY.BANTER, once: true });

cue('golf.h2.eric.green_is_long', ERIC,
  'Green’s long and it runs away from you at the back.',
  { direction: 'The read, offered as always without being asked.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.rippin.i_like_the_back', RIPPIN, 'I like the back.',
  { direction: 'He does not.', priority: PRIORITY.REACTION, once: true });

cue('golf.h2.lou.longer_than_it_looks', LOU,
  'Everything out here is longer than it looks.',
  { direction: 'And he is not talking about the hole.', priority: PRIORITY.REACTION, once: true, hold: 1.4 });

cue('golf.h2.rippin.two_holes_two_bunkers', RIPPIN,
  'Two holes. Two bunkers. There’s a pattern forming and I don’t care for it.',
  { direction: 'Aggrieved at the universe.', priority: PRIORITY.REACTION, once: true });
cue('golf.h2.eric.six', ERIC, 'Six.',
  { direction: 'Writing nothing. Just saying it.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.rippin.five', RIPPIN, 'Five.',
  { direction: 'Reflex.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.lou.six_2', LOU, 'Six.',
  { direction: 'Identical to the last time he did this.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.rippin.its_all_love_4', RIPPIN, 'It’s all love.',
  { direction: 'Beaten, and enjoying being beaten.', priority: PRIORITY.STORY, once: true });

cue('golf.h2.lou.two_down', LOU,
  'Two down. One to go.',
  { direction: 'Closing the card.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.eric.clubhouse_behind_the_last', ERIC,
  'Last one comes back to the clubhouse.',
  { direction: 'A fact about geography.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.rippin.so_it_ends_where_it_started', RIPPIN,
  'So it ends where it started. Poetic.',
  { direction: 'Being funny, and accidentally not.', priority: PRIORITY.STORY, once: true });
cue('golf.h2.lou.its_a_golf_course', LOU,
  'It’s a golf course, Rip. They all do that.',
  { direction: 'And the joke lands on the far side of something true.', priority: PRIORITY.STORY, once: true, hold: 1.8 });

/* ================================================================== */
/* HOLE 3 — THE BIG NIGHT                                             */
/* ================================================================== */
/* The last hole, with the clubhouse standing behind the green the whole way
 * in. Nobody mentions the building and nobody mentions seven o'clock until
 * the very end, and then only once. */

cue('golf.h3.rippin.last_one', RIPPIN,
  'Last one. Everybody still friends?',
  { direction: 'Cheerful, and checking.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.eric.provisionally', ERIC, 'Provisionally.',
  { direction: 'Dry.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.lou.three_ninety_five', LOU,
  'Three ninety-five. Bends left. Clubhouse behind the green.',
  { direction: 'Reading the hole, and the last sentence is the one that matters.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.rippin.i_can_see_the_bar', RIPPIN,
  'I can see the bar from the tee. That’s a design decision.',
  { direction: 'Approving.', priority: PRIORITY.STORY, once: true });

cue('golf.h3.eric.there_is_sand_at_two_ten', ERIC,
  'Sand at two hundred and ten. Right side.',
  { direction: 'To the Prospect, not to Rippin.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.rippin.two_ten_is_not_a_problem', RIPPIN,
  'Two-ten is not a problem for me.',
  { direction: 'It is about to be.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.eric.two_eleven', ERIC, 'Two hundred and eleven.',
  { direction: 'Watching it come down.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.rippin.i_heard_you', RIPPIN, 'I heard you.',
  { direction: 'From the sand.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.lou.he_did_hear_you', LOU, 'He did hear you.',
  { direction: 'Enjoying his morning.', priority: PRIORITY.REACTION, once: true });

/* --- the conversation the round has been walking toward --- */

cue('golf.h3.lou.you_know_whats_at_seven', LOU,
  'You know what’s at seven.',
  {
    direction: 'Not a question. First time either of them has said the hour out '
      + 'loud, and he says it while looking down the fairway.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 2.0,
  });
cue('golf.h3.prospect.i_know', PROSPECT, 'I know.',
  { direction: 'Steady. No performance in it.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.lou.nothing_you_can_do_now', LOU,
  'There’s nothing you can do about it between now and then. That’s why we’re out here.',
  {
    direction: 'The whole reason for the morning, stated once, on the last hole, '
      + 'as though it were a small practical matter.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 2.6,
  });

cue('golf.h3.prospect.what_if_they_say_no', PROSPECT,
  'What if they say no?',
  { direction: 'Quiet. The question he has been carrying since the car park.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.lou.then_they_say_no', LOU,
  'Then they say no, and I still know where you live, and we still play golf.',
  { direction: 'Absolutely level. It is the most reassuring thing he could have said.', priority: PRIORITY.STORY, once: true, hold: 2.0 });
cue('golf.h3.lou.but_they_wont', LOU,
  'They won’t.',
  { direction: 'Two words, thrown away, and he is already walking.', priority: PRIORITY.STORY, once: true, hold: 2.2 });

cue('golf.h3.rippin.what_are_we_talking_about', RIPPIN,
  'What are we talking about over there?',
  { direction: 'From forty yards away, because he cannot bear it.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.lou.golf', LOU, 'Golf.',
  { direction: 'Flat.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.eric.leave_it_rip', ERIC, 'Leave it, Rip.',
  { direction: 'And Rippin does, which tells you he understood.', priority: PRIORITY.REACTION, once: true });

cue('golf.h3.eric.last_green_of_the_day', ERIC,
  'Last green. Take a second on it.',
  { direction: 'Kind, and the most Eric thing he says all morning.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.rippin.im_taking_two_seconds', RIPPIN, 'I’m taking two.',
  { direction: 'Softer than usual.', priority: PRIORITY.REACTION, once: true });
cue('golf.h3.lou.breaks_toward_the_building', LOU,
  'Breaks toward the building. Everything here does.',
  { direction: 'The last read he gives, and it is a joke about the club.', priority: PRIORITY.REACTION, once: true });

/* --- the end of the morning --- */

cue('golf.h3.rippin.final_accounting', RIPPIN,
  'Right. Final accounting. I want my four back from the first.',
  { direction: 'Opening negotiations he has already lost.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.lou.no', LOU, 'No.',
  { direction: 'Not looking up.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.rippin.didnt_even_think', RIPPIN, 'You didn’t even think about it.',
  { direction: 'Outraged.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.lou.i_thought_about_it_on_one', LOU,
  'I thought about it on the first. It’s all love.',
  { direction: 'Using Rippin’s own phrase on him. This is Lou being playful.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.eric.that_is_devastating', ERIC, 'That is devastating.',
  { direction: 'Impressed.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.rippin.it_is_all_love', RIPPIN,
  'It *is* all love. That’s the tragedy of it.',
  { direction: 'Beaten and completely happy.', priority: PRIORITY.STORY, once: true });

cue('golf.h3.lou.thats_the_round', LOU,
  'That’s the round.',
  { direction: 'Closing the card for the last time.', priority: PRIORITY.STORY, once: true, hold: 1.6 });
cue('golf.h3.eric.good_morning_for_it', ERIC,
  'Good morning for it.',
  { direction: 'Looking at the sky, meaning something else.', priority: PRIORITY.STORY, once: true });
cue('golf.h3.rippin.same_time_next_week', RIPPIN,
  'Same time next week, Prospect.',
  {
    direction: 'Said as an ordinary arrangement, which is the single warmest '
      + 'thing anybody says to him all day — because it assumes a next week.',
    priority: PRIORITY.STORY, once: true, hold: 1.8,
  });
cue('golf.h3.prospect.ill_be_here', PROSPECT,
  'I’ll be here.',
  { direction: 'And he means it, and everybody hears that he means it.', priority: PRIORITY.STORY, once: true, hold: 1.6 });

cue('golf.h3.lou.seven_oclock', LOU,
  'Seven o’clock. Don’t be early.',
  {
    direction: 'The last line of the morning. He is already walking to the car. '
      + 'Do not make it heavy — the whole point is that he says it the way you '
      + 'would tell somebody where to park.',
    priority: PRIORITY.STORY, once: true, interruptible: false, hold: 3.0,
  });

export const CUES = Object.freeze(registry);

/* ================================================================== */
/* SEQUENCES                                                           */
/* ================================================================== */

/**
 * Ordered exchanges, by name.
 *
 * A sequence is played line by line, each waiting for the one before it — that
 * is what makes an argument sound like an argument rather than three people
 * talking at once. Referenced by id, never by position.
 */
export const SEQUENCES = Object.freeze({
  'lot.arrival': [
    'golf.h1.lou.there_he_is',
    'golf.h1.rippin.golf_shoes',
    'golf.h1.eric.morning',
  ],
  'lot.bag': [
    'golf.h1.lou.three_clubs',
    'golf.h1.rippin.i_do',
    'golf.h1.eric.he_does',
  ],
  'tee.arrival': [
    'golf.h1.rippin.par_three',
    'golf.h1.eric.middle_of_green',
    'golf.h1.lou.advice_for_both',
    'golf.h1.rippin.know_what_im_doing',
    'golf.h1.eric.selected_driver',
    'golf.h1.rippin.visualizing_hole_two',
  ],

  'tee.eric.before': ['golf.h1.rippin.not_cricket', 'golf.h1.eric.cricket_rules'],
  'tee.eric.after': [
    'golf.h1.rippin.safe_1', 'golf.h1.eric.on_the_green',
    'golf.h1.rippin.safe_2', 'golf.h1.eric.yes',
  ],
  'tee.rippin.before': ['golf.h1.rippin.watch_this', 'golf.h1.lou.no'],
  'tee.rippin.after': [
    'golf.h1.rippin.exactly_where', 'golf.h1.eric.wanted_bunker',
    'golf.h1.rippin.information', 'golf.h1.lou.you_have_it',
  ],
  'tee.lou.before': ['golf.h1.prospect.no_practice_swing', 'golf.h1.lou.practiced_before'],
  'tee.lou.after': [
    'golf.h1.rippin.oldest_man_shot', 'golf.h1.lou.closer_than_yours',
    'golf.h1.rippin.all_love_2', 'golf.h1.lou.get_in_the_sand',
  ],
  'tee.player.before': [
    'golf.h1.rippin.thirty_seconds',
    'golf.h1.eric.nobody_wants_that',
    'golf.h1.lou.middle_swing_once',
  ],

  // --- how the tee shot went ---
  'tee.result.great': [
    'golf.h1.rippin.piping_hot', 'golf.h1.eric.that_will_play', 'golf.h1.lou.pick_up_the_tee',
  ],
  'tee.result.green': [
    'golf.h1.eric.boring_works', 'golf.h1.rippin.located_grass', 'golf.h1.lou.aiming_there',
  ],
  'tee.result.fringe': [
    'golf.h1.lou.fine', 'golf.h1.prospect.fine_good_or_bad', 'golf.h1.lou.find_out_when_you_putt',
  ],
  'tee.result.bunker': [
    'golf.h1.rippin.welcome', 'golf.h1.prospect.you_wanted_information', 'golf.h1.rippin.ill_brief_you',
  ],
  'tee.result.rough': ['golf.h1.eric.you_have_a_shot', 'golf.h1.rippin.several_trees_first'],
  'tee.result.water': [
    'golf.h1.rippin.aim_for_the_bushes', 'golf.h1.eric.bushes_do_not_float',
    'golf.h1.rippin.more_than_that_ball', 'golf.h1.lou.take_the_drop',
  ],
  'tee.result.driver_long': [
    'golf.h1.lou.wrong_club', 'golf.h1.prospect.you_gave_me_the_club',
    'golf.h1.lou.also_gave_you_an_iron',
  ],
  'tee.result.putter': [
    'golf.h1.rippin.let_him_cook', 'golf.h1.eric.one_hundred_sixty_seven',
    'golf.h1.rippin.know_what_i_said', 'golf.h1.lou.didnt_promise_to_defend',
  ],
  'tee.result.ace': [
    'golf.h1.rippin.absolutely_not', 'golf.h1.eric.that_went_in',
    'golf.h1.rippin.reject_the_event', 'golf.h1.lou.it_counts',
    'golf.h1.rippin.first_hole_ace', 'golf.h1.lou.before_he_changes_his_mind',
  ],

  // --- the bunker ---
  'bunker.together': [
    'golf.h1.rippin.now_its_a_meeting', 'golf.h1.prospect.said_it_was_intentional',
    'golf.h1.rippin.yours_worries_me', 'golf.h1.eric.open_the_face',
    'golf.h1.rippin.close_the_face', 'golf.h1.eric.do_not_do_that',
    'golf.h1.rippin.two_schools',
  ],
  'bunker.good': [
    'golf.h1.eric.good_shot', 'golf.h1.rippin.learned_that_from_me', 'golf.h1.lou.havent_hit_yours',
  ],
  'bunker.failed': ['golf.h1.rippin.enough_information'],

  // --- the green ---
  'green.arrival': [
    'golf.h1.eric.roll_the_ball', 'golf.h1.rippin.hitting_slowly',
    'golf.h1.eric.not_what_i_said', 'golf.h1.lou.green_falls_toward_water',
  ],
  'green.break': [
    'golf.h1.prospect.how_much_break', 'golf.h1.eric.less_than_rippin_says',
    'golf.h1.rippin.havent_said_anything', 'golf.h1.eric.exactly_that_much',
  ],
  'green.big_night': [
    'golf.h1.rippin.wednesday_big_night', 'golf.h1.lou.one_of_them',
    'golf.h1.rippin.second_one_is_fun', 'golf.h1.eric.only_if_first_goes_well',
    'golf.h1.prospect.what_happens_second', 'golf.h1.rippin.receipt_and_jacket',
    'golf.h1.lou.do_not_listen_to_him', 'golf.h1.eric.that_does_happen',
    'golf.h1.lou.not_every_time',
  ],

  // --- putting ---
  'putt.long_made': [
    'golf.h1.rippin.let_me_watch_you', 'golf.h1.eric.did_not_survive', 'golf.h1.lou.good_roll',
  ],
  'putt.short': [
    'golf.h1.lou.had_the_line', 'golf.h1.eric.needed_the_rest',
    'golf.h1.rippin.cant_leave_a_big_night_short',
  ],
  'putt.long_past': [
    'golf.h1.rippin.still_moving_1', 'golf.h1.eric.yes_2',
    'golf.h1.rippin.still_moving_2', 'golf.h1.lou.we_see_it',
  ],
  'putt.lip_out': ['golf.h1.rippin.that_is_criminal', 'golf.h1.lou.criminal_pays_better'],
  'putt.missed_short_one': [
    'golf.h1.eric.take_your_time', 'golf.h1.rippin.took_his_time',
    'golf.h1.prospect.its_all_love', 'golf.h1.rippin.not_on_the_scorecard',
  ],

  // --- the hole is over ---
  'hole.ace': [
    'golf.h1.rippin.inspect_scorecard', 'golf.h1.eric.you_watched_it',
    'golf.h1.rippin.dont_trust_witnesses', 'golf.h1.lou.one',
    'golf.h1.prospect.thats_it', 'golf.h1.lou.parade_before_second_tee',
  ],
  'hole.birdie': [
    'golf.h1.rippin.piping_hot_2', 'golf.h1.eric.birdie_on_the_first',
    'golf.h1.lou.good_start_forget_it',
  ],
  'hole.par': [
    'golf.h1.eric.par', 'golf.h1.rippin.thats_golf', 'golf.h1.lou.nothing_wrong_with_boring',
  ],
  'hole.bogey': [
    'golf.h1.rippin.still_invited', 'golf.h1.eric.useful_clarification',
    'golf.h1.lou.one_hole_doesnt_decide',
  ],
  'hole.double': [
    'golf.h1.rippin.good_thing_not_the_big_night', 'golf.h1.lou.he_finished',
    'golf.h1.eric.that_matters',
  ],
  'hole.blowup': [
    'golf.h1.lou.not_putting_all_that', 'golf.h1.prospect.how_much_are_we_putting',
    'golf.h1.lou.enough_to_remember',
  ],

  // --- the walk off ---
  'end.scorecard': [
    'golf.h1.rippin.ground_under_repair', 'golf.h1.eric.it_was_a_bunker',
    'golf.h1.rippin.needed_repair', 'golf.h1.lou.five_1', 'golf.h1.rippin.four',
    'golf.h1.lou.five_2', 'golf.h1.rippin.all_love_3', 'golf.h1.lou.six',
    'golf.h1.rippin.five_is_fair',
  ],
  'end.walk_off': [
    'golf.h1.lou.one_down_two_to_go', 'golf.h1.rippin.next_ones_long',
    'golf.h1.eric.par_five', 'golf.h1.lou.driver_time',
    'golf.h1.rippin.more_talking_than_golf', 'golf.h1.lou.thats_why_we_came',
  ],

  // --- safety ---
  'safety.swing_near': [
    'golf.h1.rippin.easy_prospect', 'golf.h1.eric.we_are_standing_here',
  ],
  'safety.repeated': ['golf.h1.lou.do_that_again_you_walk'],

  /* Single-line barks for the things a player does rather than the things the
   * hole does: standing over a par 3 with a driver, changing club for the
   * ninth time, taking a very long while about it. Named rather than fired
   * loose so every line in the registry is reachable from this table. */

  /* ---- Hole 2: The Long Walk ---- */
  'h2.tee.arrival': [
    'golf.h2.rippin.now_we_talk', 'golf.h2.eric.dogleg_right',
    'golf.h2.rippin.i_can_see_it', 'golf.h2.lou.driver',
  ],
  'h2.tee.rippin.before': ['golf.h2.rippin.watch_the_corner', 'golf.h2.eric.there_is_sand_there', 'golf.h2.rippin.not_where_im_going'],
  'h2.tee.rippin.after': ['golf.h2.eric.that_is_the_sand', 'golf.h2.rippin.different_sand', 'golf.h2.lou.same_sand'],
  'h2.tee.eric.before': ['golf.h2.rippin.eric_hits_it_nowhere'],
  'h2.tee.eric.after': ['golf.h2.eric.that_is_the_game'],
  'h2.tee.lou.before': [],
  'h2.tee.lou.after': ['golf.h2.prospect.you_hit_it_short', 'golf.h2.lou.im_in_the_fairway'],
  'h2.tee.player.before': ['golf.h2.lou.three_shots_to_get_there', 'golf.h2.rippin.squatch_up', 'golf.h2.eric.let_him_think'],

  'h2.green.arrival': [
    'golf.h2.eric.green_is_long', 'golf.h2.rippin.i_like_the_back',
    'golf.h2.lou.longer_than_it_looks',
  ],
  /* The long walk's own conversation, played on the way to the green because
   * that is the only place in the round there is time for it. */
  'h2.green.big_night': [
    'golf.h2.rippin.booski_rigged', 'golf.h2.eric.he_thinks_weather_is_rigged',
    'golf.h2.lou.hes_right_about_the_weather',
    'golf.h2.rippin.ape_says_cheating', 'golf.h2.eric.he_had_a_point',
    'golf.h2.rippin.shubes_cried', 'golf.h2.lou.he_did_not_cry',
    'golf.h2.rippin.his_eyes_were_wet', 'golf.h2.eric.it_was_windy',
    'golf.h2.eric.gratin_butter_chicken', 'golf.h2.rippin.he_uses_a_jar',
    'golf.h2.eric.i_know_he_uses_a_jar',
    'golf.h2.rippin.irish_and_the_eggs', 'golf.h2.prospect.what_eggs',
    'golf.h2.lou.dont', 'golf.h2.rippin.eleven_months',
    'golf.h2.rippin.hog_mama_bus', 'golf.h2.eric.that_is_not_what_happened',
    'golf.h2.rippin.thats_how_i_tell_it',
    'golf.h2.rippin.sallie_j_hit_one', 'golf.h2.lou.nehoo',
    'golf.h2.lou.good_ole_days', 'golf.h2.rippin.theyre_still_going',
    'golf.h2.lou.i_know_they_are',
    'golf.h2.prospect.ten_drunk_cigarettes', 'golf.h2.rippin.oh_hes_heard',
    'golf.h2.eric.thats_the_second_night', 'golf.h2.lou.one_night_at_a_time',
  ],

  'h2.end.scorecard': [
    'golf.h2.rippin.two_holes_two_bunkers', 'golf.h2.eric.six',
    'golf.h2.rippin.five', 'golf.h2.lou.six_2', 'golf.h2.rippin.its_all_love_4',
  ],
  'h2.end.walk_off': [
    'golf.h2.lou.two_down', 'golf.h2.eric.clubhouse_behind_the_last',
    'golf.h2.rippin.so_it_ends_where_it_started', 'golf.h2.lou.its_a_golf_course',
  ],

  /* ---- Hole 3: The Big Night ---- */
  'h3.tee.arrival': [
    'golf.h3.rippin.last_one', 'golf.h3.eric.provisionally',
    'golf.h3.lou.three_ninety_five', 'golf.h3.rippin.i_can_see_the_bar',
  ],
  'h3.tee.rippin.before': ['golf.h3.eric.there_is_sand_at_two_ten', 'golf.h3.rippin.two_ten_is_not_a_problem'],
  'h3.tee.rippin.after': ['golf.h3.eric.two_eleven', 'golf.h3.rippin.i_heard_you', 'golf.h3.lou.he_did_hear_you'],
  'h3.tee.eric.before': [],
  'h3.tee.eric.after': [],
  'h3.tee.lou.before': [],
  'h3.tee.lou.after': [],
  'h3.tee.player.before': ['golf.h3.lou.you_know_whats_at_seven', 'golf.h3.prospect.i_know'],

  /* The last conversation, on the walk in. Rippin is deliberately out of
   * earshot for the first half of it and comes back for the second. */
  'h3.green.big_night': [
    'golf.h3.lou.nothing_you_can_do_now',
    'golf.h3.prospect.what_if_they_say_no', 'golf.h3.lou.then_they_say_no',
    'golf.h3.lou.but_they_wont',
    'golf.h3.rippin.what_are_we_talking_about', 'golf.h3.lou.golf',
    'golf.h3.eric.leave_it_rip',
  ],
  'h3.green.arrival': [
    'golf.h3.eric.last_green_of_the_day', 'golf.h3.rippin.im_taking_two_seconds',
    'golf.h3.lou.breaks_toward_the_building',
  ],

  'h3.end.scorecard': [
    'golf.h3.rippin.final_accounting', 'golf.h3.lou.no',
    'golf.h3.rippin.didnt_even_think', 'golf.h3.lou.i_thought_about_it_on_one',
    'golf.h3.eric.that_is_devastating', 'golf.h3.rippin.it_is_all_love',
  ],
  'h3.end.walk_off': [
    'golf.h3.lou.thats_the_round', 'golf.h3.eric.good_morning_for_it',
    'golf.h3.rippin.same_time_next_week', 'golf.h3.prospect.ill_be_here',
    'golf.h3.lou.seven_oclock',
  ],

  'bark.driver_on_par_three': ['golf.h1.eric.thats_a_lot_of_club'],
  'bark.club_fiddling': ['golf.h1.rippin.hit_it_again'],
  'bark.slow_play': ['golf.h1.lou.were_not_in_a_hurry'],
});

/* ================================================================== */
/* CONDITIONAL PAST-MISSION BANTER                                     */
/* ================================================================== */

/**
 * Which callbacks this save has earned.
 *
 * Every predicate reads a field the campaign actually stores. A save that has
 * none of them — somebody who opened `golf.html` cold — gets a scene with no
 * callbacks in it and no holes where callbacks should have been, which is the
 * requirement: prior missions must never be load-bearing for understanding the
 * morning.
 *
 * @param {object} missions campaign `state.missions`
 * @returns {Array<{ id: string, at: string, lines: string[] }>}
 */
export function pastMissionBanter(missions = {}) {
  const bing = missions.bada_bing_one ?? {};
  const father = missions.squatchfather ?? {};
  const air = missions.airstrip_smuggling ?? {};
  const motel = missions.jerky_motel ?? {};
  const date = missions.silver_room ?? {};
  const out = [];

  /* `ending` already encodes what he did about the grey sedan: `warned` is the
   * man who told Lou, `plate` is the man who read it walking past. Nothing new
   * had to be invented for the best callback in the scene. */
  if (bing.ending === 'warned') {
    out.push({ id: 'bing.sedan.told', at: 'cart', lines: ['golf.h1.lou.noticed_the_car'] });
    out.push({
      id: 'bing.sedan.eric',
      at: 'green',
      lines: [
        'golf.h1.eric.lou_said_you_noticed',
        'golf.h1.prospect.sitting_wrong',
        'golf.h1.lou.cars_do_that',
      ],
    });
  } else if (bing.ending === 'plate') {
    out.push({ id: 'bing.sedan.plate', at: 'cart', lines: ['golf.h1.lou.noticed_the_car'] });
  }

  if (bing.handsPlayed >= 6) {
    out.push({
      id: 'bing.blackjack',
      at: 'cart',
      lines: [
        'golf.h1.lou.six_hands',
        'golf.h1.prospect.i_came_back',
        'golf.h1.lou.conversation_not_complaint',
      ],
    });
    out.push({ id: 'bing.blackjack.tee', at: 'tee', lines: ['golf.h1.lou.hit_on_sixteen'] });
  }

  if (bing.jackpot === true) {
    out.push({
      id: 'bing.jackpot',
      at: 'tee',
      lines: [
        'golf.h1.rippin.buy_a_lesson', 'golf.h1.lou.won_more_than_you',
        'golf.h1.rippin.slots_arent_golf', 'golf.h1.eric.neither_was_your_tee_shot',
      ],
    });
  }

  /* The Beef Run's own rank string. `clean` and `greased` are the good ones;
   * anything else is a man who brought most of the plane back. */
  if (air.status === 'complete') {
    const clean = !air.detected && ['clean', 'greased', 'perfect'].includes(air.landingQuality);
    out.push({
      id: 'airstrip.landing',
      at: 'cart',
      lines: [clean ? 'golf.h1.lou.wings_still_attached' : 'golf.h1.lou.most_of_the_plane'],
    });
    out.push({
      id: 'airstrip.eric',
      at: 'green',
      lines: [
        'golf.h1.eric.land_a_plane', 'golf.h1.rippin.plane_has_a_runway',
        'golf.h1.lou.not_where_he_landed_it',
      ],
    });
  }

  if (father.status === 'complete' && father.weaponStaged && father.weaponDropped) {
    out.push({ id: 'squatchfather.sat_down', at: 'cart', lines: ['golf.h1.lou.you_sat_down'] });
    out.push({ id: 'squatchfather.noise', at: 'cart', lines: ['golf.h1.lou.waited_for_the_noise'] });
  }

  if (date.status === 'complete' && date.seeingHerAgain === true) {
    out.push({
      id: 'silver.date',
      at: 'tee',
      lines: ['golf.h1.rippin.social_calendar', 'golf.h1.lou.swing'],
    });
  }

  // The Motel is the one mission nobody brings up on a golf course.
  void motel;

  return out;
}

/* ================================================================== */
/* CONVERSATION TREES                                                  */
/* ================================================================== */

/**
 * The three places the player answers rather than listens.
 *
 * Built on the Bing's non-modal `Dialogue`: four replies on the number keys,
 * nothing modal, nothing paused, and walking away ends it the way walking away
 * from somebody ends a conversation. Each option's `next` is a node that plays
 * a sequence of cue ids — the text lives in the registry above and appears
 * exactly once in this file.
 *
 * @param {object} ctx { play(cueId), playSequence(name|ids), flags, mission }
 */
export function buildScripts(ctx) {
  /**
   * A node whose whole job is to fire cues and move on.
   *
   * `__cues` is not decoration: it is how `unreachableCues()` can prove that
   * every line in the registry is reachable from somewhere. A script this size
   * grows orphans silently otherwise.
   */
  const beat = (lines, next = null, hold = null) => ({
    line: null,
    __cues: lines,
    enter: () => ctx.playSequence(lines),
    next,
    hold: hold ?? Math.max(1.4, lines.length * 1.9),
  });

  const arrival = {
    open: {
      who: null,
      line: null,
      __cues: SEQUENCES['lot.arrival'],
      enter: () => ctx.playSequence('lot.arrival'),
      hold: 5.4,
      next: 'answer',
    },
    answer: {
      who: 'Prospect',
      line: null,
      options: [
        {
          tone: 'Direct',
          text: 'You said eight. It’s eight.',
          next: 'direct',
          effect: () => ctx.remember('arrival.direct'),
        },
        {
          tone: 'Suspicious',
          text: 'I thought this was work.',
          next: 'suspicious',
          effect: () => ctx.remember('arrival.suspicious'),
        },
        {
          tone: 'Defensive',
          text: 'I own better shoes.',
          next: 'defensive',
          effect: () => ctx.remember('arrival.defensive'),
        },
        {
          tone: 'Say nothing',
          text: '…',
          next: 'silent',
          effect: () => ctx.remember('arrival.silent'),
        },
      ],
    },
    direct: beat(['golf.h1.lou.i_noticed'], null),
    suspicious: beat(['golf.h1.lou.becomes_work', 'golf.h1.rippin.first_tee'], null),
    defensive: beat(['golf.h1.eric.and_yet'], null),
    silent: beat(['golf.h1.rippin.saving_words'], null),
  };

  /* The centre of the scene. Four ways to ask the same question, and only one
   * of them gets the line — but every one of them gets an answer that means
   * he was invited, because that is true regardless of how he asks. */
  const firstTee = {
    open: {
      who: 'Prospect',
      line: null,
      __cues: ['golf.h1.prospect.why_am_i_here'],
      enter: () => ctx.play('golf.h1.prospect.why_am_i_here'),
      hold: 2.2,
      next: 'answer',
    },
    answer: {
      who: 'Prospect',
      line: null,
      options: [
        {
          tone: 'Modest',
          text: 'You needed a fourth.',
          next: 'modest',
          effect: () => { ctx.remember('tee.modest'); ctx.flag('heardInvitation'); },
        },
        {
          tone: 'Suspicious',
          text: 'Is this another test?',
          next: 'test',
          effect: () => ctx.remember('tee.test'),
        },
        {
          tone: 'Confident',
          text: 'I figured I earned a morning off.',
          next: 'confident',
          effect: () => ctx.remember('tee.confident'),
        },
        {
          tone: 'Joking',
          text: 'What’s the catch?',
          next: 'catch',
          effect: () => ctx.remember('tee.catch'),
        },
      ],
    },
    /* Three seconds of nothing is authored into the cue itself, so the pause
     * survives even if this node's timing is ever retuned. */
    modest: beat([
      'golf.h1.lou.invited_you',
      'golf.h1.eric.that_is_different',
      'golf.h1.rippin.more_expensive',
    ], null, 12),
    test: beat([
      'golf.h1.lou.rippin_wouldnt', 'golf.h1.rippin.credentials', 'golf.h1.eric.you_have_clubs',
    ], null),
    confident: beat(['golf.h1.lou.earned_invitation'], null),
    catch: beat([
      'golf.h1.lou.three_holes_rippin', 'golf.h1.rippin.all_love', 'golf.h1.eric.already_not',
    ], null),
  };

  const cartRide = {
    open: {
      who: null,
      line: null,
      __cues: ['golf.h1.lou.you_did_good'],
      enter: () => ctx.play('golf.h1.lou.you_did_good'),
      hold: 4.2,
      next: 'answer',
    },
    answer: {
      who: 'Prospect',
      line: null,
      options: [
        {
          tone: 'Professional',
          text: 'I did what you asked.',
          next: 'professional',
          effect: () => ctx.remember('cart.professional'),
        },
        {
          tone: 'Modest',
          text: 'I got lucky.',
          next: 'modest',
          effect: () => ctx.remember('cart.modest'),
        },
        {
          tone: 'Direct',
          text: 'What happens Wednesday?',
          next: 'wednesday',
          effect: () => ctx.remember('cart.wednesday'),
        },
        {
          tone: 'Say nothing',
          text: '…',
          next: 'silent',
          effect: () => ctx.remember('cart.silent'),
        },
      ],
    },
    professional: beat(['golf.h1.lou.rarer_than_you_think'], 'callbacks'),
    modest: beat(['golf.h1.lou.lucky_a_lot'], 'callbacks'),
    wednesday: beat(['golf.h1.lou.everybody_gets_in_a_room'], 'callbacks'),
    silent: beat(['golf.h1.lou.dont_have_to_fill_it'], 'callbacks'),

    /* The conditional callbacks go here, between the answer and the big
     * nights, because that is where a man reviewing your work would put them. */
    callbacks: {
      line: null,
      enter: () => ctx.playCallbacks('cart'),
      hold: () => ctx.callbackHold('cart'),
      next: 'listened',
    },
    listened: beat(['golf.h1.lou.you_listened'], 'nights'),
    nights: beat([
      'golf.h1.lou.big_nights_coming',
      'golf.h1.prospect.what_kind_of_nights',
      'golf.h1.lou.wednesday_is_the_room',
      'golf.h1.lou.another_night_bigger',
    ], 'nightsAnswer', 12),
    nightsAnswer: {
      who: 'Prospect',
      line: null,
      options: [
        { tone: 'Ask', text: 'What happens?', next: 'ask' },
        { tone: 'Confident', text: 'I’m ready.', next: 'ready' },
        { tone: 'Nervous', text: 'And if it doesn’t go well?', next: 'nervous' },
        { tone: 'Quiet', text: 'Understood.', next: 'quiet' },
      ],
    },
    ask: beat(['golf.h1.lou.stop_calling_you_prospect'], 'closing'),
    ready: beat(['golf.h1.lou.ready_is_a_word'], 'closing'),
    nervous: beat(['golf.h1.lou.play_golf_again'], 'closing'),
    quiet: beat(['golf.h1.lou.good'], 'closing'),

    closing: beat(['golf.h1.lou.nobody_invited_you_to_audition'], null, 6),
  };

  return { arrival, firstTee, cartRide };
}

/** Every cue id, for the verifier and for anyone generating a VO manifest. */
export function allCueIds() {
  return Object.keys(CUES);
}

/**
 * Cue ids that no sequence and no tree can reach.
 *
 * A line nobody can hear is a bug, and it is the specific bug that creeping
 * rewrites of a script this size produce. The verifier asserts this is empty.
 */
export function unreachableCues(trees = null) {
  const reachable = new Set();
  for (const ids of Object.values(SEQUENCES)) for (const id of ids) reachable.add(id);
  for (const entry of pastMissionBanter({
    bada_bing_one: { ending: 'warned', handsPlayed: 9, jackpot: true },
    squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
    airstrip_smuggling: { status: 'complete', detected: false, landingQuality: 'clean' },
    silver_room: { status: 'complete', seeingHerAgain: true },
  })) {
    for (const id of entry.lines) reachable.add(id);
  }
  // The "most of the plane" variant only appears on a worse landing.
  reachable.add('golf.h1.lou.most_of_the_plane');

  if (trees) {
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.__cues)) for (const id of node.__cues) reachable.add(id);
    };
    for (const tree of Object.values(trees)) for (const node of Object.values(tree)) walk(node);
  }

  return Object.keys(CUES).filter((id) => !reachable.has(id));
}

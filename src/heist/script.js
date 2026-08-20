import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { SHUBENATOR_SIGNATURE_TAKES } from '../core/shubenator-signature.js';
import { DIALOGUE_PRIORITY } from './dialogue.js';

function line(id, speakerId, text, priority, states, cue = id, direction = '') {
  const speaker = getCharacter(speakerId);
  return Object.freeze({
    id,
    speakerId,
    subtitleName: speaker?.subtitleName ?? 'Radio',
    text,
    fallbackDuration: Math.max(2.1, text.length / 18),
    recordedDuration: null,
    lookTarget: speakerId,
    gesture: null,
    interruptible: priority < DIALOGUE_PRIORITY.TACTICAL,
    priority,
    states: Object.freeze(states),
    cue: `heist.${cue}`,
    ...(direction ? { direction } : {}),
  });
}

function npcLine(id, subtitleName, text, priority, states, cue = id) {
  return Object.freeze({
    id,
    speakerId: id.split('_')[0],
    subtitleName,
    text,
    fallbackDuration: Math.max(1.35, text.length / 19),
    recordedDuration: null,
    lookTarget: null,
    gesture: null,
    interruptible: priority < DIALOGUE_PRIORITY.TACTICAL,
    priority,
    states: Object.freeze(states),
    cue: `heist.${cue}`,
  });
}

const P = DIALOGUE_PRIORITY;

export const HEIST_DIALOGUE = Object.freeze({
  crew_snow: line('crew_snow', CHARACTER_IDS.SNOW,
    'Snow. I call the move. You keep the clock honest.', P.BARK, ['CREW_INTRO', 'BRIEFING', 'LOADOUT']),
  crew_rippin: line('crew_rippin', CHARACTER_IDS.RIPPINFLOW,
    'Rippinflow. I drive us in. If the day gets ambitious, you drive us out.', P.BARK, ['CREW_INTRO', 'BRIEFING', 'LOADOUT']),
  crew_shubes: line('crew_shubes', CHARACTER_IDS.SHUBENATOR,
    'Shubenator. Blue case, vault panel, and every wire you do not touch.', P.BARK, ['CREW_INTRO', 'BRIEFING', 'LOADOUT']),
  crew_death: line('crew_death', CHARACTER_IDS.DEATHMEGATRON,
    'DeathMegatron. I move bags and bad ideas out of doorways.', P.BARK, ['CREW_INTRO', 'BRIEFING', 'LOADOUT']),
  crew_numb: line('crew_numb', CHARACTER_IDS.NUMBSKULL,
    'Numbskull. I own the lobby. People calm down when I sound bored.', P.BARK, ['CREW_INTRO', 'BRIEFING', 'LOADOUT']),
  snow_arrival: line('snow_arrival', CHARACTER_IDS.SNOW,
    'Door shut. Phone off. We use names until the masks go on.', P.OBJECTIVE, ['CREW_INTRO']),
  snow_plan: line('snow_plan', CHARACTER_IDS.SNOW,
    'Inside, six people do one job. Outside, six targets move as one.', P.OBJECTIVE, ['BRIEFING']),
  snow_rules: line('snow_rules', CHARACTER_IDS.SNOW,
    'No civilians. No souvenirs. Nobody leaves a person to save a bag.', P.OBJECTIVE, ['BRIEFING']),
  rippin_route: line('rippin_route', CHARACTER_IDS.RIPPINFLOW,
    'Route Green behaves at lunch. Today every light is going to discover a personality.', P.BANTER, ['BRIEFING']),
  shubes_case: line('shubes_case', CHARACTER_IDS.SHUBENATOR,
    'The blue case is organized. Your hands are not part of the organization.', P.BANTER, ['LOADOUT']),
  death_bags: line('death_bags', CHARACTER_IDS.DEATHMEGATRON,
    'Lou bought bigger bags. Apparently confidence has handles.', P.BANTER, ['LOADOUT']),
  numb_alarm: line('numb_alarm', CHARACTER_IDS.NUMBSKULL,
    'I am nowhere near the alarms. This is me saying it before anybody asks.', P.BARK, ['LOADOUT']),
  prospect_ready: line('prospect_ready', CHARACTER_IDS.PROSPECT,
    'Armor is on. Magazines are full. I heard the plan.', P.OBJECTIVE, ['BOARD_VAN']),

  rippin_two_lights: line('rippin_two_lights', CHARACTER_IDS.RIPPINFLOW,
    'Two lights.', P.OBJECTIVE, ['VAN_APPROACH']),
  snow_time: line('snow_time', CHARACTER_IDS.SNOW,
    'Time.', P.OBJECTIVE, ['VAN_APPROACH']),
  shubes_loop: line('shubes_loop', CHARACTER_IDS.SHUBENATOR,
    'Exterior loop is live. It will remain useful until somebody looks out a window.', P.OBJECTIVE, ['MASKS_ON']),
  death_breathe: line('death_breathe', CHARACTER_IDS.DEATHMEGATRON,
    'Breathe now. It costs more in there.', P.BARK, ['MASKS_ON']),

  guard_warning: npcLine('guard_warning', 'Security Guard',
    'Stop right there. Hands where I can see them.', P.TACTICAL, ['BANK_ENTRY']),
  snow_guard: line('snow_guard', CHARACTER_IDS.SNOW,
    'Prospect, visible guard. Put him on the floor.', P.TACTICAL, ['BANK_ENTRY', 'LOBBY_CONTROL']),
  prospect_counterstrike: line('prospect_counterstrike', CHARACTER_IDS.PROSPECT,
    "Good thing about all that Counter-Strike I've been playing.", P.TACTICAL, ['LOBBY_CONTROL']),
  snow_scoreboard: line('snow_scoreboard', CHARACTER_IDS.SNOW,
    'Save the scoreboard. Watch the lobby.', P.OBJECTIVE, ['LOBBY_CONTROL']),
  death_floor: line('death_floor', CHARACTER_IDS.DEATHMEGATRON,
    'Hands clear. Eyes down. Nobody here needs to be brave.', P.TACTICAL, ['LOBBY_CONTROL']),
  civilian_please: npcLine('civilian_please', 'Bank Customer',
    'Nobody move. Please, just do what they say.', P.BARK, ['LOBBY_CONTROL', 'GUARDS_SECURED']),
  numb_manager: line('numb_manager', CHARACTER_IDS.NUMBSKULL,
    'Manager is mine. Teller line is listening.', P.OBJECTIVE, ['GUARDS_SECURED']),
  manager_delay: npcLine('manager_delay', 'Bank Manager',
    'You do not know the delay. That door will not care who is holding the gun.', P.OBJECTIVE, ['MANAGER_ESCORT']),
  shubes_answer: line('shubes_answer', CHARACTER_IDS.SHUBENATOR,
    'He does not have to know it. I know the panel.', P.OBJECTIVE, ['MANAGER_ESCORT']),
  shubes_vault: line('shubes_vault', CHARACTER_IDS.SHUBENATOR,
    'Panel first. Time-delay second. Nobody touches the leads.', P.OBJECTIVE, ['VAULT_BYPASS']),
  snow_clock: line('snow_clock', CHARACTER_IDS.SNOW,
    'Four minutes became two. Fill the bags we have and leave the rest.', P.TACTICAL, ['CASH_LOADING']),
  snow_insured: line('snow_insured', CHARACTER_IDS.SNOW,
    'We came for insured paper, not uninsured people. Keep it clean.', P.BARK, ['CASH_LOADING']),
  numb_signal: line('numb_signal', CHARACTER_IDS.NUMBSKULL,
    'Foot switch. I stopped the teller. I did not stop what she already sent.', P.WARNING, ['ALARM_DISCOVERED', 'EXIT_ORDER']),
  rippin_street: line('rippin_street', CHARACTER_IDS.RIPPINFLOW,
    'Blue lights on both ends. Route Green is turning brown.', P.WARNING, ['ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_exit: line('snow_exit', CHARACTER_IDS.SNOW,
    'The sirens are the clock now. Bags, tools, people. Move.', P.TACTICAL, ['EXIT_ORDER'], 'snow_exit_alarm'),

  snow_contact: line('snow_contact', CHARACTER_IDS.SNOW,
    'Planters first. Prospect, right side!', P.TACTICAL, ['BANK_DOOR_CONTACT', 'STREET_BLOCK_ONE']),
  death_suppress: line('death_suppress', CHARACTER_IDS.DEATHMEGATRON,
    'Intersection is occupied. I am correcting it.', P.TACTICAL, ['STREET_BLOCK_ONE']),
  rippin_van: line('rippin_van', CHARACTER_IDS.RIPPINFLOW,
    'Van is boxed. Give me five seconds and a miracle with keys.', P.WARNING, ['VAN_REACHED', 'STREET_BLOCK_TWO']),
  rippin_hit: line('rippin_hit', CHARACTER_IDS.RIPPINFLOW,
    'That is my leg. Route Green is officially cancelled.', P.INJURY, ['RIPPIN_INJURED', 'STREET_BLOCK_TWO']),
  snow_fallback: line('snow_fallback', CHARACTER_IDS.SNOW,
    'Mercer garage. Pairs. Leave the van and keep Rippin between us.', P.TACTICAL, ['FALLBACK_ROUTE', 'STREET_BLOCK_TWO']),
  numb_bag: line('numb_bag', CHARACTER_IDS.NUMBSKULL,
    'Bag is down. Rippin is not. Make the choice fast.', P.TACTICAL, ['DROPPED_BAG_DECISION']),
  snow_leave_it: line('snow_leave_it', CHARACTER_IDS.SNOW,
    'Do not trade a person for paper.', P.TACTICAL, ['DROPPED_BAG_DECISION']),
  shubes_garage: line('shubes_garage', CHARACTER_IDS.SHUBENATOR,
    'Sedan is live. The ignition was never the difficult system.', P.OBJECTIVE, ['GARAGE_HOLD']),
  death_load: line('death_load', CHARACTER_IDS.DEATHMEGATRON,
    'Cover me. Bags are heavier when everybody is shooting at the handles.', P.TACTICAL, ['SECONDARY_CAR_LOAD']),

  rippin_drive: line('rippin_drive', CHARACTER_IDS.RIPPINFLOW,
    'Prospect drives. Left out, wrong way on purpose, then the warehouse lights.', P.TACTICAL, ['PLAYER_TAKES_WHEEL']),
  rippin_market_left: line('rippin_market_left', CHARACTER_IDS.RIPPINFLOW,
    'Left at the warehouse. Hold it through Market, then right at the glass tower.', P.TACTICAL, ['CITY_PURSUIT']),
  snow_roadblock: line('snow_roadblock', CHARACTER_IDS.SNOW,
    'Roadblock. Center gap. Do not argue with the cruisers.', P.TACTICAL, ['ROADBLOCK']),
  rippin_canal: line('rippin_canal', CHARACTER_IDS.RIPPINFLOW,
    'Canal road next. Narrow means they cannot put three cars beside us.', P.TACTICAL, ['INDUSTRIAL_ROUTE']),
  shubes_swap: line('shubes_swap', CHARACTER_IDS.SHUBENATOR,
    'Cash first, coats second, weapons in the lined bin. In that order.', P.OBJECTIVE, ['VEHICLE_SWAP']),
  death_swap_bags: line('death_swap_bags', CHARACTER_IDS.DEATHMEGATRON,
    'Eight bags moved. Nobody leaves a handle in the dirty car.', P.OBJECTIVE, ['VEHICLE_SWAP']),
  rippin_swap_aid: line('rippin_swap_aid', CHARACTER_IDS.RIPPINFLOW,
    'Tie it above the tear. I can complain in the clean car.', P.INJURY, ['VEHICLE_SWAP']),

  snow_return: line('snow_return', CHARACTER_IDS.SNOW,
    'Nobody celebrates until I count six people and every bag in this room.', P.OBJECTIVE, ['SAFEHOUSE_RETURN']),
  rippin_aid: line('rippin_aid', CHARACTER_IDS.RIPPINFLOW,
    'The van had one job and chose performance art. Wrap the leg tighter.', P.INJURY, ['FIRST_AID']),
  shubes_defend: line('shubes_defend', CHARACTER_IDS.SHUBENATOR,
    'The vault opened on schedule. The alarm was a separate and inferior system.', P.BARK, ['DEBRIEF']),
  shubes_signature_cleanup: line(
    'shubes_signature_cleanup',
    CHARACTER_IDS.SHUBENATOR,
    SHUBENATOR_SIGNATURE_TAKES.heistCleanup.text,
    P.OBJECTIVE,
    ['DEBRIEF'],
    'shubes_signature_cleanup',
    SHUBENATOR_SIGNATURE_TAKES.heistCleanup.direction,
  ),
  death_ammo: line('death_ammo', CHARACTER_IDS.DEATHMEGATRON,
    'Ammunition accounted for. Everybody else is somebody else’s paperwork.', P.BARK, ['DEBRIEF']),
  numb_home: line('numb_home', CHARACTER_IDS.NUMBSKULL,
    'I saw the tracker late. I saw it. We are still all standing here.', P.BARK, ['DEBRIEF']),
  snow_good: line('snow_good', CHARACTER_IDS.SNOW,
    'You moved when I said move. You covered people before money. Lou will hear that.', P.OBJECTIVE, ['DEBRIEF']),
  lou_call: line('lou_call', CHARACTER_IDS.LOU,
    'Everybody breathing? Good. Clean up. Bada Bing, seven. Wear something worth remembering.', P.OBJECTIVE, ['LOU_CALL_SAFEHOUSE']),
  prospect_home: line('prospect_home', CHARACTER_IDS.PROSPECT,
    'We got out. Everybody came home.', P.OBJECTIVE, ['LOU_CALL_SAFEHOUSE']),
});

/**
 * Lines that are authored and played but not yet recorded.
 *
 * These have manifest cues now — `tools/heist-vo.mjs` mints them, and
 * `npm run vo:sync` runs it — so this bank no longer means "waiting on a cue".
 * It means waiting on a take. That distinction is still worth keeping in the
 * code because `main.js` splits the audio preload on it: the recorded bank is
 * on the critical path and this one is not, and asking the loader for 55 files
 * that do not exist is work with no sound at the end of it.
 *
 * Everything here is authored, wired and played; `dialogue.onStart` only
 * reaches for audio when `audio.hasSample()` agrees, so an unrecorded line is
 * subtitled and silent rather than broken. Move an entry up into
 * `HEIST_DIALOGUE` when its recording lands in `assets/sfx/index.json`.
 *
 * ## Tone
 *
 * `docs/TONE-AND-PARODY.md` governs all of it. The recognition is the player's
 * and it belongs entirely outside the scene: nobody in this bank knows they are
 * in a parody, nobody remarks that this is like a film, and not one line here
 * is a joke about the situation. It is a robbery, and everybody in it is
 * talking the way people talk in one.
 */
export const HEIST_PENDING_DIALOGUE = Object.freeze({
  /* ---- the van: the mask beat that could not be reached ---- */
  snow_mask_call: line('snow_mask_call', CHARACTER_IDS.SNOW,
    'Two blocks. Masks on now, while there is nobody outside to watch us do it.',
    P.TACTICAL, ['VAN_APPROACH']),
  prospect_mask_on: line('prospect_mask_on', CHARACTER_IDS.PROSPECT,
    'Mask is down. I can see fine.', P.BARK, ['MASKS_ON']),
  numb_van_count: line('numb_van_count', CHARACTER_IDS.NUMBSKULL,
    'Four minutes on the floor, one on the vault, one to walk out. That is the whole plan.',
    P.OBJECTIVE, ['MASKS_ON']),

  /* ---- the lobby ---- */
  numb_lobby_order: line('numb_lobby_order', CHARACTER_IDS.NUMBSKULL,
    'Everybody on the floor. Face down, hands out. This takes four minutes and then we are gone.',
    P.TACTICAL, ['LOBBY_CONTROL']),
  snow_lobby_open: line('snow_lobby_open', CHARACTER_IDS.SNOW,
    'The room is yours, Prospect. Get them flat and keep them flat.',
    P.OBJECTIVE, ['LOBBY_CONTROL', 'GUARDS_SECURED']),
  snow_control_slipping: line('snow_control_slipping', CHARACTER_IDS.SNOW,
    'Half your room is up on its knees again. Fix it before I have to.',
    P.WARNING, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING']),
  numb_lobby_held: line('numb_lobby_held', CHARACTER_IDS.NUMBSKULL,
    'Lobby is tied off. Nobody in here is going anywhere on their own.',
    P.OBJECTIVE, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING']),
  numb_alarm_reached: line('numb_alarm_reached', CHARACTER_IDS.NUMBSKULL,
    'Somebody got a hand to a switch. Whatever clock you thought you had, it is shorter.',
    P.WARNING, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING']),
  death_runner: line('death_runner', CHARACTER_IDS.DEATHMEGATRON,
    'Runner. West side, and he is four seconds from the street.',
    P.WARNING, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING']),
  snow_no_souvenirs: line('snow_no_souvenirs', CHARACTER_IDS.SNOW,
    'That is a man’s wallet in your hand. Put it down, or carry it into Lou’s office and explain it.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING']),
  /* THE CASUALTY LADDER. See `SNOW_CASUALTY_LADDER` for why there are
   * eleven of these where there used to be one. */
  snow_casualty: line('snow_casualty', CHARACTER_IDS.SNOW,
    'That was a customer. That is the one thing we do not do.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_alt: line('snow_casualty_alt', CHARACTER_IDS.SNOW,
    'He was queuing. He had a paying-in book in his hand.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_alt_two: line('snow_casualty_alt_two', CHARACTER_IDS.SNOW,
    'Nobody in here owns the money. Aim at the ones who are paid to stop us.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_two: line('snow_casualty_two', CHARACTER_IDS.SNOW,
    'That is two. Two is not an accident. Two is how you are doing this.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_two_alt: line('snow_casualty_two_alt', CHARACTER_IDS.SNOW,
    'Second one. I am going to have to say who that was, out loud, to Lou.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_two_alt_two: line('snow_casualty_two_alt_two', CHARACTER_IDS.SNOW,
    'Put it down. Every one of these costs us a year we have not got.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_three: line('snow_casualty_three', CHARACTER_IDS.SNOW,
    'Three. You are not robbing this bank any more. You are clearing it.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_three_alt: line('snow_casualty_three_alt', CHARACTER_IDS.SNOW,
    'Three of them. Whatever this is, it stopped being the plan two ago.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_casualty_three_alt_two: line('snow_casualty_three_alt_two', CHARACTER_IDS.SNOW,
    'I am asking once more, and then I stop asking. Off the customers.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  /* The rung where the job changes. One line, because this is the beat. */
  snow_committed: line('snow_committed', CHARACTER_IDS.SNOW,
    'All right. We are committed now. Nobody in this room gets to describe us. '
    + 'Finish it, and be quick, because the ones at the back have started counting doors.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_sweep: line('snow_sweep', CHARACTER_IDS.SNOW,
    'Anyone still moving is a statement to a detective. Keep working.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_sweep_two: line('snow_sweep_two', CHARACTER_IDS.SNOW,
    'Check behind the desks. The quiet ones are the ones who remember faces.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_sweep_three: line('snow_sweep_three', CHARACTER_IDS.SNOW,
    'We do not get to stop halfway through this. Not now.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  snow_sweep_clear: line('snow_sweep_clear', CHARACTER_IDS.SNOW,
    'Room is quiet. Take the bags. We never talk about this one again.',
    P.TACTICAL, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  /* ---- pointing a gun at your own crew ----
   *
   * Owner, on the street: *"Snow repeats 'Muzzle off me'"*. `FactionMatrix`
   * refuses crew-on-crew damage, so every round that finds a crew member came
   * through the one line below — twenty rounds, twenty identical sentences.
   * `main.js` puts a nine-second cooldown on it; these are the three it picks
   * from, and they escalate, because the third time somebody has swept you
   * with a rifle you do not say it the same way. */
  snow_friendly_fire: line('snow_friendly_fire', CHARACTER_IDS.SNOW,
    'Muzzle. Off me. Now.', P.TACTICAL,
    ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'STREET_BLOCK_ONE', 'STREET_BLOCK_TWO']),
  snow_friendly_fire_two: line('snow_friendly_fire_two', CHARACTER_IDS.SNOW,
    'That is twice you have put that barrel across me. Pick a direction.', P.TACTICAL,
    ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'STREET_BLOCK_ONE', 'STREET_BLOCK_TWO']),
  death_friendly_fire: line('death_friendly_fire', CHARACTER_IDS.DEATHMEGATRON,
    'Hey. I am on your side and I am standing right here.', P.TACTICAL,
    ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS', 'CASH_LOADING', 'STREET_BLOCK_ONE', 'STREET_BLOCK_TWO']),

  /* ---- Tony working the room ---- */
  prospect_reassure_one: line('prospect_reassure_one', CHARACTER_IDS.PROSPECT,
    'Nobody here wants your money. It is the bank’s, it is insured, and it is not worth your life.',
    P.OBJECTIVE, null),
  prospect_reassure_two: line('prospect_reassure_two', CHARACTER_IDS.PROSPECT,
    'Look at me. Do what I say and you go home to whoever is waiting on you.',
    P.OBJECTIVE, null),
  /* ---- the takedown, which was TWO LINES ----
   *
   * Owner: *"takedown VO is two lines repeating"*. Measured and exactly
   * right — `PROSPECT_VERB_LINES.order` held one line and `.restrain` held
   * one, so putting twenty-two people on the floor and tying eight of them
   * was two sentences, forty times, in one room. The pools below are five
   * and five. Every one of them is the same man doing the same job: flat,
   * repetitive, and bored on purpose, because a robber who is enjoying it is
   * a robber the room fights. */
  prospect_order_down: line('prospect_order_down', CHARACTER_IDS.PROSPECT,
    'DOWN. On the floor, face down, hands out. Nobody makes me say it twice.', P.TACTICAL, null),
  prospect_order_two: line('prospect_order_two', CHARACTER_IDS.PROSPECT,
    'On the floor. All the way down, and stay there.', P.TACTICAL, null),
  prospect_order_three: line('prospect_order_three', CHARACTER_IDS.PROSPECT,
    'Flat. Palms open, arms out. Nobody has to look at anybody.', P.TACTICAL, null),
  prospect_order_four: line('prospect_order_four', CHARACTER_IDS.PROSPECT,
    'You are already doing fine. Keep doing it lying down.', P.TACTICAL, null),
  prospect_order_five: line('prospect_order_five', CHARACTER_IDS.PROSPECT,
    'Knees, then chest, then hands. In that order and no faster.', P.TACTICAL, null),
  prospect_demand: line('prospect_demand', CHARACTER_IDS.PROSPECT,
    'Wallet. Watch. On the tile in front of you.', P.TACTICAL, null),
  prospect_demand_two: line('prospect_demand_two', CHARACTER_IDS.PROSPECT,
    'Whatever is in the coat. Out, on the floor, slide it.', P.TACTICAL, null),
  prospect_demand_three: line('prospect_demand_three', CHARACTER_IDS.PROSPECT,
    'Pockets. Both of them. Do not make me go in there.', P.TACTICAL, null),
  prospect_tie: line('prospect_tie', CHARACTER_IDS.PROSPECT,
    'Hands behind your back. This is so I can stop watching you.', P.TACTICAL, null),
  prospect_tie_two: line('prospect_tie_two', CHARACTER_IDS.PROSPECT,
    'Wrists together. It is plastic, it comes off with scissors.', P.TACTICAL, null),
  prospect_tie_three: line('prospect_tie_three', CHARACTER_IDS.PROSPECT,
    'Do not pull against it. Pulling is the only way it hurts.', P.TACTICAL, null),
  prospect_tie_four: line('prospect_tie_four', CHARACTER_IDS.PROSPECT,
    'That is you finished. Nothing else happens to you today.', P.TACTICAL, null),
  prospect_tie_five: line('prospect_tie_five', CHARACTER_IDS.PROSPECT,
    'Behind your back. Breathe out. There — done.', P.TACTICAL, null),

  /* ---- the people on the floor ----
   * Pooled and anonymous: the owner is supplying voice ids for these once the
   * behaviour is settled, so they are written to be castable in any order. */
  hostage_plead_one: npcLine('hostage_plead_one', 'Bank Customer',
    'Please. Please don’t shoot.', P.BARK, null),
  hostage_plead_two: npcLine('hostage_plead_two', 'Bank Customer',
    'I’m not doing anything. I’m not doing anything.', P.BARK, null),
  hostage_plead_three: npcLine('hostage_plead_three', 'Bank Customer',
    'Okay. Okay. It’s okay, I’m looking at the floor.', P.BARK, null),
  /* Twenty-two people and a pool of three was the other half of the owner's
   * *"customer VO repeats too much"* — the rotation was working, there was
   * simply not enough in it to rotate. Five for the room-wide reactions,
   * three everywhere a single person answers. */
  hostage_plead_four: npcLine('hostage_plead_four', 'Bank Customer',
    'I have a daughter. I have a daughter at home.', P.BARK, null),
  hostage_plead_five: npcLine('hostage_plead_five', 'Bank Customer',
    'Nobody’s moving. Look — nobody in here is moving.', P.BARK, null),
  hostage_plead_teller: npcLine('hostage_plead_teller', 'Teller',
    'There’s nothing back here. There’s nothing in my drawer.', P.BARK, null),
  hostage_plead_teller_two: npcLine('hostage_plead_teller_two', 'Teller',
    'The drawers are on a timer. I couldn’t open them if you made me.', P.BARK, null),
  hostage_plead_teller_three: npcLine('hostage_plead_teller_three', 'Teller',
    'I do this for eleven dollars an hour. Please point that somewhere else.', P.BARK, null),
  hostage_reassured_one: npcLine('hostage_reassured_one', 'Bank Customer',
    'It isn’t mine. None of it is mine. Take it.', P.BARK, null),
  hostage_reassured_two: npcLine('hostage_reassured_two', 'Bank Customer',
    'Thank you. Thank you. I’m staying right here.', P.BARK, null),
  hostage_reassured_three: npcLine('hostage_reassured_three', 'Bank Customer',
    'Alright. Alright. I believe you.', P.BARK, null),
  hostage_reassured_four: npcLine('hostage_reassured_four', 'Bank Customer',
    'I’m not going to be a problem. I promise I’m not going to be a problem.', P.BARK, null),
  hostage_reassured_hard: npcLine('hostage_reassured_hard', 'Bank Customer',
    'Then take it and go. Please just take it and go.', P.BARK, null),
  hostage_reassured_hard_two: npcLine('hostage_reassured_hard_two', 'Bank Customer',
    'Don’t tell me it’s fine. Nothing about this is fine.', P.BARK, null),
  hostage_reassured_hard_three: npcLine('hostage_reassured_hard_three', 'Bank Customer',
    'Just say how long. Somebody tell me how long.', P.BARK, null),
  hostage_hands_over: npcLine('hostage_hands_over', 'Bank Customer',
    'That’s all of it. That’s everything I have on me.', P.BARK, null),
  hostage_hands_over_two: npcLine('hostage_hands_over_two', 'Bank Customer',
    'Take the watch too. It was a gift, but take it.', P.BARK, null),
  hostage_hands_over_three: npcLine('hostage_hands_over_three', 'Bank Customer',
    'There. There, it’s yours, it’s all yours.', P.BARK, null),
  hostage_refuses: npcLine('hostage_refuses', 'Bank Customer',
    'I don’t have anything. I came in to pay a bill.', P.BARK, null),
  hostage_refuses_two: npcLine('hostage_refuses_two', 'Bank Customer',
    'You’ve had it. There is nothing else in these pockets.', P.BARK, null),
  hostage_refuses_three: npcLine('hostage_refuses_three', 'Bank Customer',
    'I’m overdrawn. That’s why I’m standing in a bank on a Thursday.', P.BARK, null),
  hostage_tied: npcLine('hostage_tied', 'Bank Customer',
    'It’s too tight. It’s too tight.', P.BARK, null),
  hostage_tied_two: npcLine('hostage_tied_two', 'Bank Customer',
    'Okay. Okay, I’m not fighting it.', P.BARK, null),
  hostage_tied_three: npcLine('hostage_tied_three', 'Bank Customer',
    'My hands are going numb. Are they meant to go numb?', P.BARK, null),
  hostage_caught: npcLine('hostage_caught', 'Bank Customer',
    'I wasn’t reaching for anything. I wasn’t.', P.WARNING, null),
  hostage_caught_two: npcLine('hostage_caught_two', 'Bank Customer',
    'It’s a phone. It’s only a phone, I’m putting it down.', P.WARNING, null),
  hostage_witness: npcLine('hostage_witness', 'Bank Customer',
    'You shot him. Oh God, you shot him.', P.WARNING, null),
  hostage_witness_two: npcLine('hostage_witness_two', 'Bank Customer',
    'He’s not moving. Somebody — he isn’t moving.', P.WARNING, null),
  manager_second: npcLine('manager_second', 'Bank Manager',
    'The timer does not care that you are in a hurry. Neither do I.', P.OBJECTIVE, ['VAULT_BYPASS']),

  /* ---- the drive ---- */
  rippin_tower_right: line('rippin_tower_right', CHARACTER_IDS.RIPPINFLOW,
    'Glass tower on the corner. Right there, and do not slow down for the light.',
    P.TACTICAL, ['CITY_PURSUIT']),
  rippin_swap_ahead: line('rippin_swap_ahead', CHARACTER_IDS.RIPPINFLOW,
    'Canal road. Yard gate on your left, four hundred metres. Lights off before you turn in.',
    P.TACTICAL, ['INDUSTRIAL_ROUTE']),
  snow_lost_them: line('snow_lost_them', CHARACTER_IDS.SNOW,
    'Nothing behind us. Nothing above us. We are a grey car on a service road.',
    P.OBJECTIVE, ['VEHICLE_SWAP']),
  rippin_pursuit_close: line('rippin_pursuit_close', CHARACTER_IDS.RIPPINFLOW,
    'He is on the bumper. Do not brake for him, he will just get braver.',
    P.WARNING, ['CITY_PURSUIT', 'ROADBLOCK', 'INDUSTRIAL_ROUTE']),
  /* The two halves of what a pursuit does to a car that has stopped running.
   * The owner's note was *"cops stop when the player stops"*; they close and
   * then they hit now, and both beats needed a voice or the player is being
   * shunted by something nobody in the car has remarked on. */
  snow_pursuit_stopped: line('snow_pursuit_stopped', CHARACTER_IDS.SNOW,
    'Why are we stationary? A parked car is a surrender. Move it.',
    P.WARNING, ['PLAYER_TAKES_WHEEL', 'CITY_PURSUIT', 'ROADBLOCK', 'INDUSTRIAL_ROUTE']),
  rippin_pursuit_ram: line('rippin_pursuit_ram', CHARACTER_IDS.RIPPINFLOW,
    'That was on purpose! He is trying to put us into a wall — go, go, do not let him line it up again.',
    P.WARNING, ['PLAYER_TAKES_WHEEL', 'CITY_PURSUIT', 'ROADBLOCK', 'INDUSTRIAL_ROUTE']),

  /* ---- Big Uncle Lou ----
   *
   * He had one cue in the entire mission — `heist.lou_call`, at the very end —
   * which is a hole for the man whose job this is, and part of why the debrief
   * did not read as anything: the person who decides what a day was worth
   * never spoke. He is on the radio for the job and he is the last voice in the
   * safehouse, and it is his lines that say the two numbers back to the player.
   *
   * `lou1`. Big Uncle Lou Sputthole. Never Captain Lou Sasole.
   */
  lou_radio_open: line('lou_radio_open', CHARACTER_IDS.LOU,
    'Prospect. You are on my clock now. Do what Snow says and come back with everybody you left with.',
    P.OBJECTIVE, ['BOARD_VAN', 'VAN_APPROACH']),
  /* Wide state windows on the radio lines on purpose: they are sequenced
   * behind the crew's own calls, and a player who moves fast through the lobby
   * would otherwise walk out of the beat before Lou got to speak in it. */
  lou_radio_lobby: line('lou_radio_lobby', CHARACTER_IDS.LOU,
    'Those people on the floor are the bank’s problem, not yours. Do not make them yours.',
    P.OBJECTIVE, ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS']),
  lou_radio_vault: line('lou_radio_vault', CHARACTER_IDS.LOU,
    'Eight bags on that trolley. Eight is the number. I do not want to hear a seven.',
    P.OBJECTIVE, ['CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']),
  lou_radio_street: line('lou_radio_street', CHARACTER_IDS.LOU,
    'I can hear the sirens from my office. Get off that street.',
    P.WARNING, ['EXIT_ORDER', 'BANK_DOOR_CONTACT', 'STREET_BLOCK_ONE']),
  lou_debrief_open: line('lou_debrief_open', CHARACTER_IDS.LOU,
    'Sit down, all of you. I only ever ask two things after a day like this.',
    P.OBJECTIVE, ['DEBRIEF']),
  lou_debrief_people_clean: line('lou_debrief_people_clean', CHARACTER_IDS.LOU,
    'First one. Everybody who walked into that lobby walked back out of it. That is the whole reason I use you and not somebody cheaper.',
    P.OBJECTIVE, ['DEBRIEF']),
  lou_debrief_people_dirty: line('lou_debrief_people_dirty', CHARACTER_IDS.LOU,
    'First one, and you already know the answer. Somebody who came in to cash a cheque did not walk back out. That follows this family around for years.',
    P.OBJECTIVE, ['DEBRIEF']),
  lou_debrief_money_full: line('lou_debrief_money_full', CHARACTER_IDS.LOU,
    'Second one. All eight bags, insured paper, nothing on anybody’s person. That is the number I wanted and that is the number I got.',
    P.OBJECTIVE, ['DEBRIEF']),
  lou_debrief_money_short: line('lou_debrief_money_short', CHARACTER_IDS.LOU,
    'Second one. You left money on Mercer Street. It is insured, so nobody cries — but I asked for eight and I am counting less than eight.',
    P.OBJECTIVE, ['DEBRIEF']),
  lou_debrief_souvenirs: line('lou_debrief_souvenirs', CHARACTER_IDS.LOU,
    'And there is money in that bag that came out of a man’s coat. Take it off the table. We are not muggers, and it is coming out of your end.',
    P.OBJECTIVE, ['DEBRIEF']),
  lou_debrief_verdict_good: line('lou_debrief_verdict_good', CHARACTER_IDS.LOU,
    'Then it was a good day. Nobody hurt, everything counted, and tomorrow it is a paragraph nobody reads. Well done, kid.',
    P.OBJECTIVE, ['DEBRIEF', 'LOU_CALL_SAFEHOUSE']),
  lou_debrief_verdict_bad: line('lou_debrief_verdict_bad', CHARACTER_IDS.LOU,
    'So it was not a good day. You are still standing here, which is something. Do not let anybody tell you it was clean.',
    P.OBJECTIVE, ['DEBRIEF', 'LOU_CALL_SAFEHOUSE']),
  lou_prospect_verdict: line('lou_prospect_verdict', CHARACTER_IDS.LOU,
    'You came home with the crew and you came home with the money. Whatever they decide about you later, that is on the record.',
    P.OBJECTIVE, ['LOU_CALL_SAFEHOUSE']),

  /* ---- the debrief, which the owner could not read at all ---- */
  snow_debrief_open: line('snow_debrief_open', CHARACTER_IDS.SNOW,
    'Sit down, all of you. We do this the same way every time.', P.OBJECTIVE, ['MONEY_COUNT', 'DEBRIEF']),
  snow_debrief_people: line('snow_debrief_people', CHARACTER_IDS.SNOW,
    'People first. I count six of us. Now somebody tell me the other number.',
    P.OBJECTIVE, ['DEBRIEF']),
  snow_debrief_money: line('snow_debrief_money', CHARACTER_IDS.SNOW,
    'Then the money. What went in the car, and what we left on Mercer.',
    P.OBJECTIVE, ['DEBRIEF']),
  snow_debrief_clean: line('snow_debrief_clean', CHARACTER_IDS.SNOW,
    'Nothing on the news tonight but a number. That is what a good day looks like.',
    P.OBJECTIVE, ['DEBRIEF']),
  snow_debrief_ugly: line('snow_debrief_ugly', CHARACTER_IDS.SNOW,
    'That was not a job. That was a mess we walked out of. Lou hears it from me first.',
    P.OBJECTIVE, ['DEBRIEF']),
  numb_debrief_ledger: line('numb_debrief_ledger', CHARACTER_IDS.NUMBSKULL,
    'Eight bags came off the trolleys. Here is what actually got home.',
    P.OBJECTIVE, ['DEBRIEF']),
  death_debrief_count: line('death_debrief_count', CHARACTER_IDS.DEATHMEGATRON,
    'Count it twice. I am not doing this again on Lou’s carpet.', P.BARK, ['DEBRIEF']),
  prospect_debrief: line('prospect_debrief', CHARACTER_IDS.PROSPECT,
    'First one. I moved when Snow said move and I did not make anything worse.',
    P.OBJECTIVE, ['DEBRIEF']),
});

/**
 * Which pooled line a hostage says, per outcome, in rotation.
 *
 * The director hands back a `response` key; `main.js` walks these so the same
 * customer does not say the same sentence twice in a row and twenty-two people
 * do not all beg in one voice.
 */
export const HOSTAGE_BARKS = Object.freeze({
  plead: Object.freeze([
    'hostage_plead_one', 'hostage_plead_two', 'hostage_plead_three',
    'hostage_plead_four', 'hostage_plead_five',
  ]),
  plead_teller: Object.freeze([
    'hostage_plead_teller', 'hostage_plead_teller_two', 'hostage_plead_teller_three',
  ]),
  reassured: Object.freeze([
    'hostage_reassured_one', 'hostage_reassured_two',
    'hostage_reassured_three', 'hostage_reassured_four',
  ]),
  reassured_hard: Object.freeze([
    'hostage_reassured_hard', 'hostage_reassured_hard_two', 'hostage_reassured_hard_three',
  ]),
  reassured_tied: Object.freeze(['hostage_reassured_two', 'hostage_reassured_three']),
  hands_over: Object.freeze([
    'hostage_hands_over', 'hostage_hands_over_two', 'hostage_hands_over_three',
  ]),
  refuses: Object.freeze(['hostage_refuses', 'hostage_refuses_two', 'hostage_refuses_three']),
  already_robbed: Object.freeze(['hostage_refuses_two', 'hostage_refuses_three']),
  tied: Object.freeze(['hostage_tied', 'hostage_tied_two', 'hostage_tied_three']),
  caught: Object.freeze(['hostage_caught', 'hostage_caught_two']),
  witness: Object.freeze(['hostage_witness', 'hostage_witness_two']),
});

/**
 * What the crew say when the player sweeps them with a muzzle.
 *
 * Pooled and cooled down in `main.js`, because the refusal that raises it
 * fires once per ROUND — see `snow_friendly_fire` above.
 */
/**
 * WHAT SNOW SAYS WHEN YOU SHOOT A CUSTOMER, AND HOW IT ESCALATES.
 *
 * Owner: *"SNow repeats the line that is a customer that is the one thing we
 * dont do. Lets get some more variations of this for the first few you kill
 * and if you kill 4+ he says okay we are commited now. Do them all."*
 *
 * `snow_casualty` was fired by `say()` on every civilian death — one line,
 * unrationed, for the first body and the eleventh alike. And it was the wrong
 * shape as well as the wrong count: a man watching a robbery turn into a
 * massacre does not repeat his objection verbatim, he gives up on it.
 *
 * So it is a LADDER, indexed by how many are down. One and two are still the
 * rule being enforced; three is him working out that this is what today is;
 * four is the crew changing what job it is, and after that he stops arguing
 * and starts counting, because the only way out of a room with four dead
 * customers in it is a room with no witnesses in it.
 *
 * Three variants per rung so two runs of the same playthrough do not sound
 * identical, and the four rung is deliberately a single line — it is the
 * moment the mission changes and it does not get to be one of three things.
 */
export const SNOW_CASUALTY_LADDER = Object.freeze({
  first: Object.freeze(['snow_casualty', 'snow_casualty_alt', 'snow_casualty_alt_two']),
  second: Object.freeze(['snow_casualty_two', 'snow_casualty_two_alt', 'snow_casualty_two_alt_two']),
  third: Object.freeze(['snow_casualty_three', 'snow_casualty_three_alt', 'snow_casualty_three_alt_two']),
  committed: Object.freeze(['snow_committed']),
  sweep: Object.freeze(['snow_sweep', 'snow_sweep_two', 'snow_sweep_three']),
  clear: Object.freeze(['snow_sweep_clear']),
});

export const CREW_FRIENDLY_FIRE_LINES = Object.freeze({
  muzzle: Object.freeze([
    'snow_friendly_fire', 'snow_friendly_fire_two', 'death_friendly_fire',
  ]),
});

/** Tony's own verbs, in rotation for the same reason. */
export const PROSPECT_VERB_LINES = Object.freeze({
  reassure: Object.freeze(['prospect_reassure_one', 'prospect_reassure_two']),
  demand: Object.freeze([
    'prospect_demand', 'prospect_demand_two', 'prospect_demand_three',
  ]),
  order: Object.freeze([
    'prospect_order_down', 'prospect_order_two', 'prospect_order_three',
    'prospect_order_four', 'prospect_order_five',
  ]),
  restrain: Object.freeze([
    'prospect_tie', 'prospect_tie_two', 'prospect_tie_three',
    'prospect_tie_four', 'prospect_tie_five',
  ]),
});

/**
 * Every pool the runtime rotates through, and the floor each one must clear.
 *
 * The owner's two VO notes — *"takedown VO is two lines repeating"* and
 * *"customer VO repeats too much"* — were both a pool-size problem rather
 * than a rotation problem: `sayPooled` walks its list correctly, and the
 * lists were one and two entries long. `tests/heist-presentation.test.mjs`
 * asserts these floors so a pool cannot quietly shrink back.
 */
export const BARK_POOL_FLOOR = Object.freeze({
  plead: 4, plead_teller: 3, reassured: 3, reassured_hard: 3,
  hands_over: 3, refuses: 3, tied: 3, caught: 2, witness: 2,
  order: 4, restrain: 4, demand: 3, reassure: 2,
});

/** Both banks, because the runtime does not care which one a line came from. */
export const ALL_HEIST_DIALOGUE = Object.freeze({
  ...HEIST_DIALOGUE, ...HEIST_PENDING_DIALOGUE,
});

export function dialogueLine(id) { return ALL_HEIST_DIALOGUE[id] ?? null; }

/** Cues that exist in the manifest today, for the audio preload. */
export function recordedHeistCues() {
  return Object.values(HEIST_DIALOGUE).map((entry) => entry.cue);
}

/** Cues authored this pass and waiting on the central voice run. */
export function pendingHeistCues() {
  return Object.values(HEIST_PENDING_DIALOGUE).map((entry) => entry.cue);
}

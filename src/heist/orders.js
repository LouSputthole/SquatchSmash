/**
 * The order standing right now — one sentence, derived from the mission state.
 *
 * ## The bug this file exists to kill
 *
 * The owner's report was *"the objective stays 'meet the crew' through
 * bank/vault/street/garage"*, and it was exactly true. `Meet the crew.` is
 * static text in `heist.html`, and the ONLY things that ever replaced it were
 * about thirty scattered `hud.setObjective(...)` calls sitting inside
 * interaction handlers — the callback that runs when you press `E` on a prop.
 *
 * That is fine for the one path where the player walks the whole mission from
 * the safehouse. It is nothing at all for the way the owner actually plays:
 * preview links with `?checkpoint=`. `primePreview()` restores the mission
 * machine straight to `LOBBY_CONTROL` or `GARAGE_HOLD` without ever running
 * the handler that would have set the text — so the HUD kept the sentence the
 * HTML shipped with, for the entire rest of the mission, in every phase.
 *
 * (`resumePersistedCheckpoint()` did set one, from a per-checkpoint table
 * duplicated by hand. So the same objective existed in three places and
 * disagreed with itself in two of them.)
 *
 * ## The fix
 *
 * The objective is a FUNCTION OF STATE, not a side effect of pressing a
 * button. `objectiveForState` is the only thing that decides what the line
 * says, `main.js` calls it on every mission transition, and entering at any
 * checkpoint therefore shows that checkpoint's real objective on frame one —
 * because the objective is read off the machine, not written by whatever
 * happened to be pressed on the way there.
 *
 * ## Why some entries are functions
 *
 * A few beats have a real sub-step the state does not carry: the debrief's
 * four numbered actions all happen inside `DEBRIEF`, and whether you are
 * FETCHING a cash bag or CARRYING one is the difference between two different
 * instructions inside `CASH_LOADING`. Those read the context object. Every
 * other entry is a constant, because a constant is a thing you can read.
 *
 * Keep every line an INSTRUCTION — a verb, a place, and the key if there is
 * one. `docs/TONE-AND-PARODY.md` governs the voice: nobody in this bank knows
 * they are in a parody, and the HUD is not where a joke goes.
 */

/**
 * @typedef {object} OrderContext
 * @property {boolean} [armorReady]      the vest is on
 * @property {boolean} [loadoutReady]    the carbine has been taken off the table
 * @property {boolean} [maskWorn]        the balaclava is down
 * @property {boolean} [lobbyControlled] the room-wide order has landed
 * @property {boolean} [rearGuardSecured]
 * @property {number}  [managerEscortProgress] 0..1
 * @property {string|null} [carryingBag] the bag id in Tony's hands
 * @property {number}  [bankBagsStaged]  bags at the exit
 * @property {number}  [officersDown]    officers put down in this contact
 * @property {string|null} [droppedBagDecision] 'recovered' | 'abandoned' | null
 * @property {boolean} [weaponsDown]     the guns are on the safehouse table
 * @property {object}  [swapProgress]    the seven evidence actions
 * @property {number}  [zipTies]         ties left in the case
 * @property {number}  [bagsRecovered]   vault bags that came home
 * @property {number}  [totalBags]       how many there were to begin with
 * @property {number}  [civilianCasualties] people who did not walk out
 */

import { BLOCK_CLEAR_OFFICERS } from './config.js';

/**
 * THE SEVEN PIECES OF EVIDENCE, BY NAME.
 *
 * Owner, playtest 2026-08-26: he disposed of six and *could not find the
 * seventh*. Every one of the seven is reachable — measured with a real ray from
 * the legal standing ring, 98 to 100 % of the positions a player can actually
 * occupy acquire each prop (`tests/heist-swap-evidence.test.mjs`). What the
 * player was never told is WHICH SEVEN.
 *
 * The order line said *"Transfer the cash, change, and bag the weapons —
 * 6/7 done"*: three verbs, a count of seven, and no way to work out which of
 * the four unnamed ones was outstanding. Worse, three of the seven show no
 * prompt at all until the one before them is finished — the trunk gates the
 * cash, the cash gates the wipe, the masks gate the jackets — so on arrival
 * only four of the seven props have a prompt on them, and the wipe, which is
 * the one at the end of the longest chain, is a rag on a bench that nothing on
 * screen ever mentions. That is a pixel hunt, and it is a HUD defect rather
 * than a puzzle defect: the chain is the fiction (you cannot load a shut boot,
 * you cannot wipe a car you are still loading) and it stays.
 *
 * So the panel names all seven, ticks the ones that are done, and says what is
 * blocking the ones that are not. `key` is the `swapProgress` flag `main.js`
 * keeps; `after` is the flag that has to be true before the prop takes a
 * prompt, and it is read from the same place the interaction's `enabled` is.
 */
export const SWAP_EVIDENCE = Object.freeze([
  Object.freeze({ key: 'trunk', label: 'Open the clean car\u2019s trunk', after: null }),
  Object.freeze({ key: 'bags', label: 'Move the cash across', after: 'trunk' }),
  Object.freeze({ key: 'masks', label: 'Bag the masks', after: null }),
  Object.freeze({ key: 'jackets', label: 'Change the outer jackets', after: 'masks' }),
  Object.freeze({ key: 'weapons', label: 'Clear and bag the weapons', after: null }),
  Object.freeze({ key: 'aid', label: 'Bind Rippin\u2019s leg', after: null }),
  Object.freeze({ key: 'wiped', label: 'Wipe the dirty car and the gear', after: 'bags' }),
]);

/** How many of the seven evidence actions at the swap are done. */
function swapDone(progress) {
  const done = progress ?? {};
  return SWAP_EVIDENCE.filter((item) => done[item.key]).length;
}

/** The next thing the player can actually walk up to and press. */
function nextSwapAction(progress = {}) {
  return SWAP_EVIDENCE.find((item) => !progress[item.key]
    && (!item.after || progress[item.after])) ?? null;
}

/**
 * The swap as one actionable objective-panel item.
 *
 * The durable seven-step order remains above, but the live card names only the
 * next reachable action. Listing locked trunk/mask/cash consequences spoiled
 * the route and made 0/7 look like seven simultaneous errands. Once complete,
 * the 7/7 receipt deliberately persists beside the real next action: leave.
 *
 * @param {object} [progress] the `swapProgress` flags
 * @returns {{title: string, items: object[], hint: string}}
 */
export function swapEvidencePlan(progress = {}) {
  const done = swapDone(progress);
  const next = nextSwapAction(progress);
  const tally = { count: done, total: SWAP_EVIDENCE.length };
  const items = done >= SWAP_EVIDENCE.length
    ? [
      {
        id: 'swap.complete',
        label: 'Evidence moved and the dirty car wiped',
        done: true,
        retire: false,
        required: false,
        tally,
      },
      {
        id: 'swap.depart',
        label: 'Leave in the clean car',
        done: false,
        required: true,
        current: true,
      },
    ]
    : (next ? [{
      id: next.key,
      label: next.label,
      done: false,
      required: true,
      current: true,
      tally,
    }] : []);
  return {
    title: 'Clean the swap',
    items,
    hint: done >= SWAP_EVIDENCE.length
      ? 'Everything is clean. Leave in the clean car.'
      : (next ? `Next: ${next.label.toLowerCase()}.` : ''),
  };
}

/**
 * The job's score, in the one sentence the debrief is about.
 *
 * The two axes `HeistObjectiveLedger` keeps and Lou asks about. It TRAILS the
 * instruction rather than leading it: the numbered step is the thing the
 * player has to act on and has to stay at the front of the line, which is
 * also what `heist-systems.test.mjs` pins.
 */
function takeLine(context = {}) {
  const bags = context.bagsRecovered ?? 0;
  const total = context.totalBags ?? 8;
  const dead = context.civilianCasualties ?? 0;
  const people = dead === 0
    ? 'Nobody hurt'
    : `${dead} civilian${dead === 1 ? '' : 's'} killed`;
  return `THE TAKE: ${bags}/${total} bags · ${people}.`;
}

/**
 * One sentence per mission state.
 *
 * A string, or `(context) => string`. Every state in `HEIST_STATES` that the
 * player can stand in has an entry; `heist-systems.test.mjs` asserts that, so
 * a new state cannot be added without an order to go with it.
 */
export const HEIST_ORDERS = Object.freeze({
  /* ---- the apartment, before and after ---- */
  APARTMENT_MARGO: 'See Margo out, then wait for Lou to call.',
  MARGO_LEAVES: 'Wait for Lou to call.',
  LOU_CALL: 'Answer Lou.',
  APARTMENT_PREP: 'Wash, change, and secure the gear before you leave.',
  DEPART_APARTMENT: 'Leave for the safehouse.',

  /* ---- the safehouse, on the way in ---- */
  SAFEHOUSE_ARRIVAL: 'Meet Snow and the crew at the briefing table.',
  CREW_INTRO: 'Look at each of the crew, then join Snow at the table.',
  BRIEFING: 'Read the plan on the table, then take your gear from the bench.',
  LOADOUT: (c = {}) => {
    if (!c.armorReady && !c.loadoutReady) return 'Take the vest off the stand and the carbine off the bench. E to pick up.';
    if (!c.armorReady) return 'Vest still on the stand. E to put it on.';
    if (!c.loadoutReady) return 'Carbine still on the bench. E to pick it up.';
    return 'Geared. Board the primary van.';
  },
  BOARD_VAN: 'Board the primary van.',

  /* ---- the van ---- */
  VAN_APPROACH: 'Two blocks out. Press 3 for the balaclava, then E to pull it down.',
  MASKS_ON: 'Masks on. Open the doors when Snow gives the word.',
  BANK_ARRIVAL: 'Out of the van and through the doors behind Snow.',
  CREW_EXIT: 'Out of the van and through the doors behind Snow.',

  /* ---- the bank ---- */
  BANK_ENTRY: 'The lobby guard is drawing on a teller. Shoot him before he fires.',
  LOBBY_CONTROL: (c = {}) => (c.lobbyControlled
    ? 'Room is down. Tie the nervous ones, and put the rear guard on the floor.'
    : 'Put the whole lobby on the floor. E orders one person down, hold E ties them.'),
  GUARDS_SECURED: 'Escort the bank manager to the vault corridor.',
  MANAGER_ESCORT: (c = {}) => ((c.managerEscortProgress ?? 0) >= 1
    ? 'Manager is in position. Open the access panel for Shubenator.'
    : 'Walk the manager to the vault. Keep the lobby covered.'),
  VAULT_BYPASS: 'Hold E on the vault panel while Shubenator runs the bypass.',
  CASH_LOADING: (c = {}) => {
    if (c.carryingBag) return 'Carry the bag to the doors and drop it on the staging point.';
    const staged = c.bankBagsStaged ?? 0;
    return `Move two cash bags from the vault to the exit — ${staged}/2 staged. The crew handles the rest.`;
  },
  ALARM_DISCOVERED: 'Alarm is live. Get the bags to the doors.',
  EXIT_ORDER: 'Take the bags and leave together.',

  /* ---- the street ---- */
  BANK_DOOR_CONTACT: 'Break contact from the bank steps. Work down the street to the van.',
  STREET_BLOCK_ONE: (c = {}) => {
    const down = c.officersDown ?? 0;
    const need = c.officersNeeded ?? BLOCK_CLEAR_OFFICERS.bank_avenue;
    return down >= need
      ? 'Lane is open. Reach Rippin at the disabled van.'
      : `Fight down Mercer to the van — ${down}/${need} officers down. `
        + 'Use the cars and the planters for cover.';
  },
  VAN_REACHED: 'The van is dead. Wait for Snow’s fallback call.',
  VAN_DISABLED: 'The van is dead. Wait for Snow’s fallback call.',
  RIPPIN_INJURED: 'Rippin is hit. Cover him and fall back toward Mercer garage.',
  FALLBACK_ROUTE: 'Fall back on foot toward the Mercer garage.',
  STREET_BLOCK_TWO: (c = {}) => {
    const down = c.officersDown ?? 0;
    const need = c.officersNeeded ?? BLOCK_CLEAR_OFFICERS.market_street;
    if (down < need) {
      return `Second contact — ${down}/${need} officers down. Clear the road to the Mercer garage.`;
    }
    return c.droppedBagDecision
      ? 'Road is clear. Get into the Mercer garage.'
      : 'Road is clear. Recover the dropped bag if it is safe, then get into the Mercer garage.';
  },
  DROPPED_BAG_DECISION: 'Bag is up. Get into the Mercer garage.',

  /* ---- the garage ---- */
  GARAGE_ENTRY: 'Hold the garage entrance. Do not let them up the ramp behind you.',
  GARAGE_HOLD: (c = {}) => {
    const down = c.officersDown ?? 0;
    const need = c.officersNeeded ?? BLOCK_CLEAR_OFFICERS.mercer_garage;
    return down >= need
      ? 'Entrance is held. Load the cash and Rippin into the secondary car.'
      : `Hold the garage entrance — ${down}/${need} officers down. `
        + 'Clear a lane to the secondary car.';
  },
  SECONDARY_CAR_LOAD: 'Take the driver seat. Rippin will call the route.',

  /* ---- the drive ---- */
  PLAYER_TAKES_WHEEL: 'Drive. Follow Rippin’s calls — every wrong turn is a wall.',
  GARAGE_ESCAPE: 'Drive. Follow Rippin’s calls — every wrong turn is a wall.',
  CITY_PURSUIT: 'Follow Rippin’s calls and keep the cruisers off the back bumper.',
  ROADBLOCK: 'Roadblock ahead. Straight through the centre gap — do not brake.',
  INDUSTRIAL_ROUTE: 'Canal service road. Lights off before the yard gate on the left.',
  /* NAMED, not counted. See `SWAP_EVIDENCE`: the count on its own is what sent
   * the owner round a dark yard looking for a seventh thing nobody had told
   * him about. The panel carries all seven; this line carries the one he can
   * do next, because the standing order is a sentence and has to stay one. */
  VEHICLE_SWAP: (c = {}) => {
    const done = swapDone(c.swapProgress);
    if (done >= SWAP_EVIDENCE.length) return 'Everything is clean. Leave in the clean car.';
    const next = nextSwapAction(c.swapProgress ?? {});
    return `Nobody followed you in. Clean the swap — ${done}/${SWAP_EVIDENCE.length} done.`
      + (next ? ` Next: ${next.label.toLowerCase()}.` : '');
  },

  /* ---- the safehouse, coming home ----
   *
   * Owner: *"debrief ... + a clear objective at that phase"*. The four steps
   * were numbered by the pass before this one, which fixed "everyone is just
   * waiting for me" — but every one of them was a bare instruction, so a
   * player who had just watched the bags go on the table was still not told
   * WHAT HAD BEEN DECIDED. The debrief is the only place the job gets scored,
   * so from the count onward the order carries the count: the two numbers Lou
   * asks about, in the HUD, next to the thing you still have to do. */
  SAFEHOUSE_RETURN: '1/4 — Rippin is still bleeding. Go to him and HOLD E to wrap the leg.',
  FIRST_AID: '2/4 — Empty the bags onto the briefing table and count the take. HOLD E at the table.',
  MONEY_COUNT: '2/4 — Empty the bags onto the briefing table and count the take. HOLD E at the table.',
  DEBRIEF: (c = {}) => `${c.weaponsDown
    ? '4/4 — Answer Lou’s call at the van.'
    : '3/4 — Put the weapons down on the bench.'} ${takeLine(c)}`,
  LOU_CALL_SAFEHOUSE: (c = {}) => `Hear Lou out. ${takeLine(c)}`,

  /* ---- after ---- */
  RETURN_APARTMENT: 'Go home.',
  INITIATION_UNLOCKED: 'Go home.',
  SCENE_COMPLETE: 'The job is done.',
  FAILED: 'The job went wrong. Restoring the last safe checkpoint.',
});

/**
 * The sentence the HUD should be showing for a mission state.
 *
 * @param {string} state one of `HEIST_STATES`
 * @param {OrderContext} [context]
 * @returns {string} never empty — an unknown state falls back to the opening
 *   order rather than leaving whatever was on screen before, because a STALE
 *   objective is the bug this module exists to fix and an empty one is worse.
 */
/**
 * The states in which the lobby is a room full of people who saw your face.
 *
 * Not the street or the garage: by then the survivors are behind you and the
 * job is a getaway. This is only ever about the room.
 */
const WITNESS_SWEEP_STATES = new Set([
  'LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT', 'VAULT_BYPASS',
  'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER',
]);

/**
 * The order once four customers are down.
 *
 * Owner: *"one of the objectives turns to make sure there are no witnesses
 * and you have to whack all the customers."* It REPLACES the standing order
 * rather than trailing it, because at that point it is the only thing between
 * the crew and a description of all six of them, and the doors do not open
 * until it is done — see `noWitnesses` in `main.js`.
 *
 * @returns {string|null} null when the sweep is not on.
 */
function witnessSweepOrder(state, context) {
  if (context.noWitnesses !== true || !WITNESS_SWEEP_STATES.has(state)) return null;
  const left = Math.max(0, Math.trunc(context.witnessesLeft ?? 0));
  if (left > 0) {
    return `No witnesses. ${left} customer${left === 1 ? '' : 's'} still standing in the lobby.`;
  }
  return 'Lobby is clear. Take the bags to the staging point and leave.';
}

export function objectiveForState(state, context = {}) {
  const sweep = witnessSweepOrder(state, context);
  if (sweep) return sweep;
  const entry = HEIST_ORDERS[state];
  if (typeof entry === 'function') return entry(context);
  if (typeof entry === 'string' && entry) return entry;
  return HEIST_ORDERS.SAFEHOUSE_ARRIVAL;
}

/**
 * THE FOUR NUMBERED ACTIONS OF THE DEBRIEF, AND WHAT EACH ONE IS ON.
 *
 * ## Rippin's leg
 *
 * Owner, playtest 2026-08-26: *"Rippin's leg just re-arms armor"*. He was
 * describing exactly what the room does. Step 1/4 says *get Rippin's leg
 * wrapped*, and the prompt that said it was registered on
 * `interactables.armor` — the plate-carrier stand in the far corner, six
 * metres from Rippinflow, whose entire vocabulary everywhere else in this
 * mission is the vest: `armor.userData.setEquipped`, `preparation.armorReady`,
 * the HUD armour band, and a `syncSafehousePresentation()` on every checkpoint
 * resume that puts the carrier back on it. So the player walked to a mannequin
 * wearing body armour, held E, and the mission called it first aid. Nothing
 * about a leg was anywhere near it.
 *
 * The step is on RIPPINFLOW now — the man with the wound, who already carries
 * a person-sized look volume for the crew introductions — and it touches the
 * injury and nothing else. `tests/heist-final-car-and-leg.test.mjs` holds the
 * decoupling: no step in this table may name the armour stand, and step one
 * must name a person.
 *
 * `target` is resolved in `main.js`: 'rippin' is the crew actor's group, the
 * other three are `level.phases.safehouse.interactables` keys. `state` is the
 * mission state the step is available in — it is also what the step advances
 * out of, which is why the table is in order and read in order.
 */
export const SAFEHOUSE_DEBRIEF_STEPS = Object.freeze([
  Object.freeze({
    id: 'first_aid',
    target: 'rippin',
    state: 'SAFEHOUSE_RETURN',
    label: '1/4 — Wrap Rippin\u2019s leg',
    doneLabel: 'Rippin\u2019s leg is wrapped',
    hold: 1.5,
  }),
  Object.freeze({
    id: 'count',
    target: 'briefing',
    state: 'FIRST_AID',
    label: '2/4 — Empty the bags and count the take',
    hold: 1.8,
  }),
  Object.freeze({
    id: 'weapons_down',
    target: 'loadout',
    state: 'DEBRIEF',
    label: '3/4 — Put the weapons down',
    hold: 0,
  }),
  Object.freeze({
    id: 'lou_call',
    target: 'van',
    state: 'DEBRIEF',
    label: '4/4 — Answer Lou\u2019s call',
    hold: 0,
  }),
]);

/** One step by id, for the call sites that wire a handler to it. */
export function debriefStep(id) {
  return SAFEHOUSE_DEBRIEF_STEPS.find((step) => step.id === id) ?? null;
}

/** Every state that has an authored order. For the coverage test. */
export function orderedStates() { return Object.keys(HEIST_ORDERS); }

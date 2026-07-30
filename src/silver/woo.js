/**
 * The Woo score.
 *
 * A number between 0 and 100 that describes how the evening is going, moved by
 * named events rather than by anything continuous. Two rules do most of the
 * work:
 *
 *   1. An event fires once. `Woo.CookTipped` is worth two points the first time
 *      and nothing every time after, which is what stops a player standing in
 *      the kitchen handing the same man five dollars until the bar fills up.
 *   2. Nothing here knows what a good answer is. The table below has values;
 *      the script has lines; the two are joined by an id and nothing else. No
 *      option in script.js is labelled good, neutral or bad, and the player is
 *      meant to work it out by listening.
 *
 * Kept as data so the balance can be argued about without touching a system,
 * and so the debug panel can list every event that exists rather than every
 * event somebody remembered to register.
 */

/** Where the evening starts. Interested, not sold. */
export const START = 12;

/**
 * Every scoring event in the mission.
 *
 * The balance, which `tools/balance-silver.mjs` exists to defend: talking well
 * for a whole evening is worth about sixty-six, tipping the whole route is
 * worth thirty-eight, and you start on twelve. So charm alone reaches a good
 * night and no further, tips alone reach a decent one, and the perfect ending
 * needs the room as well as her — which is the entire premise of the mission.
 *
 * The first pass had the conversation worth eighty-eight, which put a charming
 * man on a hundred before he had handed anybody a dollar. Every tip in the
 * building bought nothing, and the central mechanic was decoration.
 *
 *   points   what it is worth, once
 *   label    what the strip says when it fires; omitted events move the number
 *            silently, which is most of the small ones
 *   repeat   true for the handful that are meant to fire more than once
 *   group    for the tip streak, and for the debug list
 */
export const EVENTS = {
  /* ---- the street ---- */
  'Woo.DriverTipped':       { points: 2,  label: 'Took Care of the Driver', group: 'tip' },
  'Woo.DateDoorHeld':       { points: 1,  label: 'Held the Door' },
  'Woo.WaitedForDate':      { points: 1,  label: 'Waited' },
  'Woo.SideDoorResponse':   { points: 1 },
  'Woo.SideDoorFumbled':    { points: -1 },

  /* ---- the route ---- */
  'Woo.DoorAttendantTipped': { points: 2, label: 'Took Care of the Door', group: 'tip' },
  'Woo.CellarWorkerTipped':  { points: 2, group: 'tip' },
  'Woo.DeliveryTipped':      { points: 2, group: 'tip' },
  'Woo.PorterTipped':        { points: 2, group: 'tip' },
  'Woo.CookTipped':          { points: 3, label: 'Took Care of the Kitchen', group: 'tip' },
  'Woo.DishwasherTipped':    { points: 2, group: 'tip' },
  'Woo.ServiceBarTipped':    { points: 2, group: 'tip' },
  'Woo.CoatCheckTipped':     { points: 2, group: 'tip' },
  'Woo.HostTipped':          { points: 2, group: 'tip' },
  'Woo.CaptainTipped':       { points: 3, group: 'tip' },
  'Woo.WaiterTipped':        { points: 2, group: 'tip' },
  'Woo.PhotographerTipped':  { points: 2, group: 'tip' },
  'Woo.BandleaderTipped':    { points: 2, label: 'Took Care of the Band', group: 'tip' },

  'Woo.GenerousTip':        { points: 1,  repeat: true },
  'Woo.ContextualTip':      { points: 1,  label: 'Right Moment', repeat: true },
  'Woo.FullTipStreak':      { points: 8,  label: 'Everybody Eats' },
  'Woo.TipRefused':         { points: -2, repeat: true },
  'Woo.WorkerInsulted':     { points: -8, label: 'That Was Beneath You', repeat: true },

  'Woo.HazardGuided':       { points: 2,  label: 'Watch the Pan' },
  'Woo.KeptPace':           { points: 1,  label: 'Kept Pace' },
  'Woo.CellarBanter':       { points: 1 },
  'Woo.KitchenBanter':      { points: 1 },
  'Woo.DateLeftBehind':     { points: -2, label: 'She Is Back There', repeat: true },
  'Woo.DoorInHerFace':      { points: -2, repeat: true },
  'Woo.QuestionIgnored':    { points: -3, repeat: true },

  /* ---- the table ---- */
  'Woo.TableReaction':      { points: 2 },
  'Woo.ChairPulled':        { points: 3,  label: 'Pulled Her Chair' },
  'Woo.DateIntroduced':     { points: 4,  label: 'Introduced Her' },
  'Woo.WrongName':          { points: -6, label: 'That Is Not Her Name' },
  /* The two that keep their weight: she told him what she drinks and he was
     listening, and he made a whole room go quiet. Everything else in the
     mission is smaller than both of those and should feel it. */
  'Woo.DrinkRemembered':    { points: 6,  label: 'Remembered Her Drink' },
  'Woo.DrinkAsked':         { points: 1 },
  'Woo.DrinkWrong':         { points: -4 },
  'Woo.CallbackUsed':       { points: 3,  label: 'You Were Listening' },
  'Woo.GenuineQuestion':    { points: 2,  repeat: true },
  'Woo.MadeHerLaugh':       { points: 2,  label: 'Made Her Laugh', repeat: true },
  'Woo.Bragged':            { points: -4, repeat: true },
  'Woo.GruesomeDetail':     { points: -4, repeat: true },
  'Woo.LingeredWithFamily': { points: -3, repeat: true },
  'Woo.FamilyHandled':      { points: 3,  label: 'Handled It' },
  'Woo.ChampagneAcknowledged': { points: 2, label: 'Said Thank You' },
  'Woo.FunnyHowSuccess':    { points: 5,  label: 'Funny How' },
  'Woo.FunnyHowOverplayed': { points: -3 },
  'Woo.PersonalHonest':     { points: 3,  label: 'Straight Answer' },
  'Woo.PersonalEvaded':     { points: -1 },

  /* ---- the show ---- */
  'Woo.PerformancePreferenceRemembered': { points: 4, label: 'Her Kind of Band' },
  'Woo.SongRequested':      { points: 2 },
  'Woo.StaredAtStage':      { points: -3, label: 'She Noticed', repeat: true },
  'Woo.ToastMade':          { points: 3,  label: 'A Decent Toast' },
  'Woo.ToastFumbled':       { points: -2 },
  'Woo.SwayCompleted':      { points: 5,  label: 'Danced, Technically' },
  'Woo.SwayRecovered':      { points: 2,  label: 'Recovered' },
  'Woo.SwayRefused':        { points: -3 },
  'Woo.SwayForced':         { points: -6, label: 'She Said No' },
  'Woo.PhotoTaken':         { points: 2,  label: 'One for the Wall' },
  'Woo.CallDeclined':       { points: 2,  label: 'Let It Ring' },
  'Woo.CallTaken':          { points: -5, label: 'You Took It', repeat: true },
  'Woo.DrinkSpilled':       { points: -2, repeat: true },
  'Woo.FightStarted':       { points: -20, label: 'Well, That Happened' },
  'Woo.PaidForAffection':   { points: -30, label: 'No' },
  'Woo.CrudeInvitation':    { points: -12 },

  /* ---- the end ---- */
  'Woo.InvitationTiming':   { points: 3,  label: 'Read the Room' },
  'Woo.InvitationRushed':   { points: -5 },
};

/**
 * Everybody you can hand money to, in route order, with what they cost.
 *
 * Here rather than in cast.js, where it started, for two reasons: it is score
 * data rather than staffing, and cast.js imports three.js — which means the
 * balance harness could not read it without a browser, and a balance harness
 * that needs a browser does not get run.
 */
export const TIP_POINTS = [
  { id: 'Woo.DriverTipped',        who: 'driver',      script: 'driver',     amount: 40 },
  { id: 'Woo.DoorAttendantTipped', who: 'doorman',     script: 'doorman',    amount: 20 },
  { id: 'Woo.CellarWorkerTipped',  who: 'cellarman',   script: 'cellarman',  amount: 20 },
  { id: 'Woo.DeliveryTipped',      who: 'delivery',    script: 'delivery',   amount: 20 },
  { id: 'Woo.PorterTipped',        who: 'porter',      script: 'porter',     amount: 20 },
  { id: 'Woo.CookTipped',          who: 'chef',        script: 'chef',       amount: 50 },
  { id: 'Woo.DishwasherTipped',    who: 'dishwasher',  script: 'dishwasher', amount: 20 },
  { id: 'Woo.ServiceBarTipped',    who: 'servicebar',  script: 'servicebar', amount: 20 },
  { id: 'Woo.CoatCheckTipped',     who: 'coatcheck',   script: 'coatcheck',  amount: 20 },
  { id: 'Woo.HostTipped',          who: 'host',        script: 'host',       amount: 20 },
  { id: 'Woo.CaptainTipped',       who: 'manager',     script: 'manager',    amount: 50 },
  { id: 'Woo.WaiterTipped',        who: 'waiter',      script: 'waiter',     amount: 40 },
  { id: 'Woo.PhotographerTipped',  who: 'photographer', script: 'photographer', amount: 20 },
  { id: 'Woo.BandleaderTipped',    who: 'bandleader',  script: 'bandleader', amount: 40 },
];

/** What it costs to do the whole route properly, before you buy anything. */
export const TIP_TOTAL = TIP_POINTS.reduce((n, t) => n + t.amount, 0);

/** Every tip in the mission. Getting all of them is the streak. */
export const TIP_ROSTER = Object.entries(EVENTS)
  .filter(([, e]) => e.group === 'tip')
  .map(([id]) => id);

/**
 * What the evening reads as. Bands rather than a pass mark: the mission does
 * not fail, it ends differently.
 */
export const BANDS = [
  { at: 95, key: 'perfect',  name: 'Perfect night' },
  { at: 80, key: 'strong',   name: 'She is coming back' },
  { at: 65, key: 'good',     name: 'Strong date' },
  { at: 50, key: 'decent',   name: 'Decent evening' },
  { at: 30, key: 'bad',      name: 'Bad date' },
  { at: 0,  key: 'disaster', name: 'Catastrophic' },
];

export function bandFor(score) {
  return BANDS.find((b) => score >= b.at) ?? BANDS[BANDS.length - 1];
}

/* ------------------------------------------------------------------ */

export class Woo {
  /**
   * @param {object} hooks { onChange, onEvent, onStreak }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.score = START;
    /** Every non-repeatable event that has already paid out. */
    this.fired = new Set();
    /** Everything that happened, in order, for the debug panel and the save. */
    this.ledger = [];
    this.tips = new Set();
    this.streakClosed = false;
  }

  /**
   * Fire an event. Returns the points actually awarded, which is zero for a
   * one-shot that has already gone.
   *
   * `amount` overrides the table, for the handful of things that scale — a
   * generous tip, a contextually large one.
   */
  fire(id, amount) {
    const def = EVENTS[id];
    if (!def) throw new Error(`unknown Woo event: ${id}`);
    if (!def.repeat && this.fired.has(id)) return 0;
    this.fired.add(id);

    const points = amount ?? def.points;
    const before = this.score;
    this.score = Math.max(0, Math.min(100, this.score + points));
    const delta = this.score - before;

    this.ledger.push({ id, points, delta, at: this.score });
    if (def.group === 'tip') this.tips.add(id);

    this.hooks.onEvent?.(id, delta, def);
    if (delta !== 0) this.hooks.onChange?.(this.score, delta, def.label ?? null);

    /* The streak closes itself the moment the last name on the roster is
     * ticked, wherever the player happens to be standing. */
    if (def.group === 'tip' && !this.streakClosed && this.tipsLeft === 0) {
      this.streakClosed = true;
      this.hooks.onStreak?.(this.tips.size);
      this.fire('Woo.FullTipStreak');
    }
    return delta;
  }

  has(id) { return this.fired.has(id); }

  get tipsLeft() { return TIP_ROSTER.filter((id) => !this.tips.has(id)).length; }
  get tipCount() { return this.tips.size; }
  get band() { return bandFor(this.score); }

  /** For the save, and for the ending. */
  snapshot() {
    return {
      score: this.score,
      band: this.band.key,
      fired: [...this.fired],
      tips: [...this.tips],
      tipsLeft: this.tipsLeft,
      streak: this.streakClosed,
    };
  }

  restore(snap) {
    if (!snap) return;
    this.score = snap.score;
    this.fired = new Set(snap.fired);
    this.tips = new Set(snap.tips);
    this.streakClosed = !!snap.streak;
    this.hooks.onChange?.(this.score, 0, null);
  }
}

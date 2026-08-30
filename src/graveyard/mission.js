export const GRAVES = Object.freeze({
  babs: Object.freeze({
    name: 'BABS', tier: 'monument',
    line: 'Babs got the good stone, fresh flowers, and a bench nobody puts their feet on.',
  }),
  brawny: Object.freeze({
    name: 'BRAWNY', tier: 'ruined', traitor: true,
    line: 'Brawny sold out the Family. Even the rain looks cleaner than this grave.',
  }),
  whiplash: Object.freeze({
    name: 'WHIPLASH', tier: 'ruined', traitor: true,
    line: 'Whiplash got a crooked marker and exactly the maintenance he earned.',
  }),
  sheep: Object.freeze({
    name: 'SHEEP', tier: 'standard-plus',
    line: 'Sheep got a proper stone. Not grand, not cheap. Family middle management forever.',
  }),
  echo: Object.freeze({
    name: 'ECHO', tier: 'standard-plus',
    line: 'Echo got a decent plot and a very premature date.',
  }),
  colton: Object.freeze({
    name: 'COLTON', tier: 'standard',
    line: 'Colton. His grave smells like Asian feet. That is all I have.',
  }),
  geewiz: Object.freeze({
    name: 'GEEWIZ', tier: 'standard',
    line: 'GeeWiz. Regular stone, regular plot, one spelling nobody ever agreed on.',
  }),
  sauce: Object.freeze({
    // Keep the internal id for save and geometry compatibility. The player-facing
    // marker cannot name Sauce before the Cartel Palace betrayal reveal.
    name: 'RESERVED', tier: 'reserved', open: true,
    line: 'An open plot marked RESERVED in fresh pencil.',
  }),
});

export const GRAVEYARD_ARRIVAL_LINES = Object.freeze([
  Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.arrival.snow.watched-home',
    text: 'End of the road. Fresh plot is past GeeWiz. When Billy misses breakfast, they watch familiar doors. Yours is familiar.',
    seconds: 6.4,
  }),
  Object.freeze({
    who: 'Prospect',
    cue: 'vo.graveyard.arrival.prospect.why-motel',
    text: 'So why the Motel?',
    seconds: 2.4,
  }),
  Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.arrival.snow.daylight-cover',
    text: 'A room they do not know and a deal that keeps us busy until daylight.',
    seconds: 4.2,
  }),
]);

/**
 * Keep the current speaker on the floor until both the authored beat and the
 * delivered recording are finished. The old runtime preferred `seconds`
 * whenever it existed, which cut Snow off and let Prospect start talking over
 * the back of his opening take.
 */
export function resolveGraveyardLineHold(line, recordedSeconds = 0) {
  const authored = Number.isFinite(line?.seconds) ? line.seconds : 0;
  const reading = 2.5 + String(line?.text ?? '').length * 0.025;
  const delivered = recordedSeconds > 0 ? recordedSeconds + 0.35 : 0;
  return Math.max(authored, delivered, authored > 0 ? 0 : reading);
}

export const GRAVEYARD_SNOW_BARKS = Object.freeze({
  car: Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.snow.bark.daylight',
    text: 'Car. Now. Room twelve buys us daylight.',
    seconds: 2.8,
  }),
  plot: Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.snow.bark.plot',
    text: 'Fresh plot is past GeeWiz. The reserved hole stays open.',
    seconds: 3.2,
  }),
});

const TRAITORS = Object.freeze(['brawny', 'whiplash']);
const GRAVE_COUNT = Object.keys(GRAVES).length;
export const ECHO_APPROACH_RADIUS = 7.4;

/**
 * Echo is six metres west of the central path. His encounter therefore needs
 * an approach volume that reaches the path, not an interaction-sized circle
 * around the headstone itself.
 */
export function shouldAutoTriggerEcho(playerPosition, echoPosition) {
  const dx = Number(playerPosition?.x) - Number(echoPosition?.x);
  const dz = Number(playerPosition?.z) - Number(echoPosition?.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  return dx * dx + dz * dz <= ECHO_APPROACH_RADIUS * ECHO_APPROACH_RADIUS;
}

export class GraveyardMission {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'arrival';
    this.echoHeard = false;
    this.urinatedOn = new Set();
    this.inspected = new Set();
    this.tributes = new Map();
    this.bodyCarried = false;
    this.bodyPlaced = false;
    this.bodyLowered = false;
    this.bodyBuried = false;
    this.objectives = [
      { id: 'bury', text: 'Bury Billy HotDog in a fresh plot', done: false },
      {
        id: 'memorials', text: `Check every Family marker · 0/${GRAVE_COUNT}`,
        done: false, optional: true, retire: false,
      },
      {
        id: 'tributes', text: `Pay respect or disrespect · 0/${GRAVE_COUNT}`,
        done: false, optional: true, retire: false,
      },
    ];
  }

  get readyToLeave() { return this.bodyBuried; }

  restoreProgress(saved = {}) {
    this.echoHeard = saved.echoHeard === true;
    this.inspected = new Set(
      Array.isArray(saved.inspectedGraves)
        ? saved.inspectedGraves.filter((id) => Boolean(GRAVES[id]))
        : [],
    );
    this.urinatedOn = new Set(
      Array.isArray(saved.urinatedOn)
        ? saved.urinatedOn.filter((id) => TRAITORS.includes(id))
        : [],
    );
    this.tributes = new Map();
    for (const id of Array.isArray(saved.respectedGraves) ? saved.respectedGraves : []) {
      if (!GRAVES[id]) continue;
      this.inspected.add(id);
      this.tributes.set(id, 'respect');
    }
    for (const id of this.urinatedOn) {
      this.inspected.add(id);
      this.tributes.set(id, 'disrespect');
    }
    this.#refreshMemorialObjectives();
    return this;
  }

  restoreBodyCheckpoint(checkpoint) {
    if (!['arrival', 'carried', 'placed', 'buried'].includes(checkpoint)) {
      throw new RangeError(`Unknown Graveyard body checkpoint: ${checkpoint}`);
    }
    const carried = checkpoint !== 'arrival';
    const placed = checkpoint === 'placed' || checkpoint === 'buried';
    const buried = checkpoint === 'buried';
    this.state = checkpoint;
    this.bodyCarried = carried;
    this.bodyPlaced = placed;
    this.bodyLowered = placed;
    this.bodyBuried = buried;
    const objective = this.objectives.find((entry) => entry.id === 'bury');
    objective.done = buried;
    objective.text = buried
      ? 'Bury Billy HotDog in a fresh plot'
      : placed
        ? 'Fill Billy HotDog\'s grave'
        : carried
          ? 'Carry Billy HotDog to the fresh plot'
          : 'Bury Billy HotDog in a fresh plot';
    this.hooks.onObjective?.(this.objectives);
    this.hooks.onState?.(this.state, this);
    return this;
  }

  #refreshMemorialObjectives(notify = true) {
    const memorials = this.objectives.find((objective) => objective.id === 'memorials');
    memorials.text = `Check every Family marker · ${this.inspected.size}/${GRAVE_COUNT}`;
    memorials.done = this.inspected.size === GRAVE_COUNT;
    const tributes = this.objectives.find((objective) => objective.id === 'tributes');
    tributes.text = `Pay respect or disrespect · ${this.tributes.size}/${GRAVE_COUNT}`;
    tributes.done = this.tributes.size === GRAVE_COUNT;
    if (notify) this.hooks.onObjective?.(this.objectives);
  }

  line(text, cue = null, who = null) {
    this.hooks.onLine?.(text, { cue, who });
  }

  inspectGrave(id) {
    const grave = GRAVES[id];
    if (!grave) return null;
    const firstInspection = !this.inspected.has(id);
    if (firstInspection) {
      this.inspected.add(id);
      this.#refreshMemorialObjectives();
      this.line(grave.line, `vo.graveyard.inspect.${id}`, 'Prospect');
    }
    if (id === 'echo' && !this.echoHeard) {
      this.echoHeard = true;
      this.hooks.onRumble?.();
      this.line('Hey, guys? I am still alive down here. Help me out.', 'vo.graveyard.echo.alive', 'Echo');
      this.line('Poor Echo. Wind sounds just like him tonight.', 'vo.graveyard.prospect.wind', 'Prospect');
      this.line('It always does. Keep walking.', 'vo.graveyard.snow.wind', 'Snow');
      return { kind: 'echo', ...grave };
    }
    return { kind: grave.open ? 'reserved' : 'memorial', ...grave };
  }

  suggestSaucePlot() {
    this.line('Fresh hole. Why not use this one?', 'vo.graveyard.prospect.sauce', 'Prospect');
    this.line('Reserved means reserved. HotDog goes past GeeWiz.', 'vo.graveyard.snow.sauce', 'Snow');
    return false;
  }

  tributeFor(id) {
    return this.tributes.get(id) ?? null;
  }

  payRespect(id) {
    if (!GRAVES[id] || this.tributes.has(id)) return false;
    if (!this.inspected.has(id)) this.inspectGrave(id);
    this.tributes.set(id, 'respect');
    this.#refreshMemorialObjectives();
    this.hooks.onTribute?.(id, 'respect');
    return true;
  }

  urinateOn(id) {
    if (!TRAITORS.includes(id) || this.tributes.has(id)) return false;
    if (!this.inspected.has(id)) this.inspectGrave(id);
    this.urinatedOn.add(id);
    this.tributes.set(id, 'disrespect');
    this.#refreshMemorialObjectives();
    this.hooks.onUrination?.(id);
    this.hooks.onTribute?.(id, 'disrespect');
    this.line(
      id === 'brawny'
        ? 'Brawny finally gets fresh flowers. Different liquid, same sentiment.'
        : 'Whiplash receives the only toast anybody brought him.',
      `vo.graveyard.prospect.pee.${id}`,
      'Prospect',
    );
    return true;
  }

  pickUpBody() {
    if (this.state !== 'arrival') return false;
    this.state = 'carried';
    this.bodyCarried = true;
    this.objectives.find((objective) => objective.id === 'bury').text = 'Carry Billy HotDog to the fresh plot';
    this.hooks.onObjective?.(this.objectives);
    this.hooks.onState?.(this.state, this);
    return true;
  }

  placeBody() {
    if (this.state !== 'carried') return false;
    this.state = 'placed';
    this.bodyPlaced = true;
    this.bodyLowered = true;
    this.objectives.find((objective) => objective.id === 'bury').text = 'Fill Billy HotDog\'s grave';
    this.line('Easy. Feet first. He made enough noise above ground.', 'vo.graveyard.snow.lower', 'Snow');
    this.hooks.onObjective?.(this.objectives);
    this.hooks.onState?.(this.state, this);
    return true;
  }

  // Compatibility for older verification callers. The live scene uses the
  // explicit pickup and placement actions above.
  lowerBody() {
    if (this.state === 'arrival' && !this.pickUpBody()) return false;
    return this.placeBody();
  }

  finishBurial() {
    if (this.state !== 'placed') return false;
    this.state = 'buried';
    this.bodyBuried = true;
    this.objectives.find((objective) => objective.id === 'bury').done = true;
    this.hooks.onObjective?.(this.objectives);
    this.line(
      'That closes the HotDog thing. Your building stays watched till morning. We use the Motel.',
      'vo.graveyard.snow.done.watched-home',
      'Snow',
    );
    this.hooks.onState?.(this.state, this);
    return true;
  }

  finish() {
    if (!this.readyToLeave) return false;
    this.state = 'done';
    this.hooks.onState?.(this.state, this);
    return 'motel';
  }
}

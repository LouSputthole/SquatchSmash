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
    name: 'SAUCE', tier: 'reserved', open: true,
    line: 'An open plot with SAUCE already cut into the temporary marker.',
  }),
});

export const GRAVEYARD_ARRIVAL_LINES = Object.freeze([
  Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.arrival.snow.1',
    text: 'End of the road. Fresh plot is past GeeWiz. Then the Motel.',
    seconds: 3.8,
  }),
  Object.freeze({
    who: 'Prospect',
    cue: 'vo.graveyard.arrival.prospect.1',
    text: 'You planning to tell me what is at the Motel?',
    seconds: 3.0,
  }),
  Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.arrival.snow.2',
    text: 'When we get there.',
    seconds: 2.6,
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
    cue: 'vo.graveyard.snow.bark.car',
    text: 'Car. Now. Room twelve is not getting cleaner while we stand here.',
    seconds: 3.5,
  }),
  plot: Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.snow.bark.plot',
    text: 'Fresh plot is past GeeWiz. Sauce\'s hole stays open.',
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
      { id: 'memorials', text: `Check every Family marker · 0/${GRAVE_COUNT}`, done: false, optional: true },
      { id: 'tributes', text: `Pay respect or disrespect · 0/${GRAVE_COUNT}`, done: false, optional: true },
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
    this.line('We already have a hole. Put HotDog in Sauce\'s.', 'vo.graveyard.prospect.sauce', 'Prospect');
    this.line('No. I have a feeling we are going to need that one soon.', 'vo.graveyard.snow.sauce', 'Snow');
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
    this.line('That closes the HotDog thing. Get in the car. The next one doesn’t close with a shovel.', 'vo.graveyard.snow.done', 'Snow');
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
